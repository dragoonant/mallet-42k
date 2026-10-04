// Chaos Space Marines engine changes beyond code hooks (docs/spec/factions/chaos-space-marines.md section 7.1, C1-C6). The faction's
// code hooks have their own tests; these drive the engine seams they rely on over the synthetic fixture bundle.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, removeModel,
  type Action, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { attackService, consumeDeathReaction, pendingDeathReaction, unitsHitByWeapon } from '../../src/engine/attack'
import { deferredDeaths, grantFightOnDeath, isDeferredDead, purgeDeferredDeaths } from '../../src/engine/fight-on-death'
import { fightModule } from '../../src/engine/phases/fight'
import { shootingModule } from '../../src/engine/phases/shooting'
import { objectiveService } from '../../src/engine/objectives'
import { unitModels, unitModelsForCoherency } from '../../src/engine/state'
import { bundle, withBundle, freshState, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems } from '../fixtures'

const DID = ''
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const unattached = (): Parameters<typeof makeSetup>[0] => ({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
const modulesWith = (open: Parameters<typeof recordingStratagems>[0]): ModuleTable => ({ ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(open) } })
const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const answerFirst = (ctx: EngineContext): void => {
  const p = ctx.state.pending as PendingDecision
  ctx.state.pending = null
  attackService.handler.handle(ctx, ('options' in p ? p.options[0].action : { type: 'pass', player: p.player, decisionId: DID }) as Action, p)
}

describe('C6 holdMore allowTie (CHA-016)', () => {
  const rule = { id: 'sites-of-power', when: 'turn.end' as const, rounds: { from: 2, to: 5 }, who: 'active' as const, rule: 'holdMore' as const, pointsPer: 2, cap: 2, params: { allowTie: true } }
  function score(round: number, a: number, b: number, params: Record<string, unknown> = { allowTie: true }): number {
    const s = freshState()
    s.round = round; s.activePlayer = 'A'
    s.mission.scoring = []
    s.mission.secondaries = { A: [{ ...rule, params }], B: [] }
    Object.keys(s.objectives).forEach((id, i) => { s.objectives[id].controller = i < a ? 'A' : i < a + b ? 'B' : null })
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    DEFAULT_MODULES.services.missions.onWindow(ctx, 'turn.end', 'end')
    return s.players.A.vp
  }
  it('CHA-016 round 1 scores nothing; ties and leads score, a deficit does not (0 v 0 scores)', () => {
    expect(score(1, 2, 0)).toBe(0)
    expect(score(2, 1, 1)).toBe(2)
    expect(score(2, 0, 1)).toBe(0)
    expect(score(2, 0, 0)).toBe(2)
    expect(score(3, 2, 1)).toBe(2)
  })
  it('CHA-016 without allowTie a tie does not score (existing holdMore behaviour unchanged)', () => {
    expect(score(2, 1, 1, {})).toBe(0)
    expect(score(2, 2, 1, {})).toBe(2)
  })
})

describe('C1 shooting.unitSelected window (CHA-001, CHA-008, CHA-009)', () => {
  function shootState(): GameState {
    const s = createGameState(makeSetup(unattached()), bundle, 'seed', ENGINE_VERSION)
    s.phase = 'shooting'
    placeUnit(s, 'A:grunts', { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: 0, z: 0, gap: 0.3 })
    return s
  }
  function selectUnit(ctx: EngineContext, unitId: string): void {
    if (!ctx.state.pending) shootingModule.advance(ctx)
    const pending = ctx.state.pending as PendingDecision
    ctx.state.pending = null
    shootingModule.handle(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId }, pending)
    shootingModule.advance(ctx)
  }

  it('CHA-001 opens shooting.unitSelected for the selected unit (active player first) before declareTargets', () => {
    const s = shootState()
    const mods = modulesWith(['shooting.unitSelected'])
    const { ctx } = createContext(s, new ScriptedRng([]), mods)
    shootingModule.enter(ctx)
    selectUnit(ctx, 'A:grunts')
    expect(s.pending?.kind).toBe('stratagemWindow')
    expect(s.pending?.window).toBe('shooting.unitSelected')
    const offer = (mods.services.stratagems as ReturnType<typeof recordingStratagems>).offers.find((o) => o.window === 'shooting.unitSelected')
    expect(offer).toMatchObject({ key: 'A:grunts', player: 'A' })
    for (let i = 0; i < 4 && s.pending?.kind === 'stratagemWindow'; i++) {
      const pending = s.pending as PendingDecision
      s.pending = null
      mods.services.stratagems.handle(ctx, { type: 'pass', player: pending.player, decisionId: DID }, pending)
      shootingModule.advance(ctx)
    }
    expect(s.pending?.kind).toBe('declareTargets')
  })

  it('CHA-008 a unit wiped out while the window resolves is not offered declareTargets', () => {
    const s = shootState()
    const base = recordingStratagems([])
    const mods: ModuleTable = {
      ...DEFAULT_MODULES,
      services: {
        ...DEFAULT_MODULES.services,
        stratagems: {
          ...base,
          openWindow(ctx, window, player, key, trigger) {
            if (window === 'shooting.unitSelected') { for (const id of [...ctx.state.units['A:grunts'].models]) removeModel(ctx.state, id) }
            return base.openWindow(ctx, window, player, key, trigger)
          },
        },
      },
    }
    const { ctx } = createContext(s, new ScriptedRng([]), mods)
    shootingModule.enter(ctx)
    selectUnit(ctx, 'A:grunts')
    expect(s.pending?.kind).not.toBe('declareTargets')
  })

  it('CHA-009 the window is never opened for Fire Overwatch (an attack sequence with overwatch:true)', () => {
    const s = shootState()
    const mods = modulesWith(['shooting.unitSelected'])
    const { ctx } = createContext(s, new ScriptedRng(Array(40).fill(1)), mods)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: true, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    attackService.advance(ctx)
    expect((mods.services.stratagems as ReturnType<typeof recordingStratagems>).offers.some((o) => o.window === 'shooting.unitSelected')).toBe(false)
  })
})

describe('C3 unitsHitByWeapon (CHA-012, CHA-013)', () => {
  function run(dice: number[]) {
    const s = createGameState(makeSetup(unattached()), bundle, 'seed', ENGINE_VERSION)
    s.phase = 'shooting'
    placeUnit(s, 'A:grunts', { x: -10, z: -5, gap: 0.5 })
    placeUnit(s, 'B:mob', { x: -10, z: 0, gap: 0.5 })
    const { ctx } = createContext(s, new ScriptedRng([...dice, ...Array(40).fill(2)]), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    let r = attackService.advance(ctx)
    for (let i = 0; i < 500 && r === 'pending'; i++) { answerFirst(ctx); r = attackService.advance(ctx) }
    return s
  }
  it('CHA-012 a successful hit records the target; the mark survives the end of the attack sequence', () => {
    const s = run([4])
    expect(unitsHitByWeapon(s, 'A:grunts', 'red.w.gun')).toEqual(['B:mob'])
    expect(s.phaseState.attack).toBeNull()
  })
  it('CHA-012 the weapon id may be given without the .w. segment; other weapons do not match', () => {
    const s = run([6])
    expect(unitsHitByWeapon(s, 'A:grunts', 'red.gun')).toEqual(['B:mob'])
    expect(unitsHitByWeapon(s, 'A:grunts', 'red.w.pistol')).toEqual([])
  })
  it('CHA-013 a missed attack records nothing', () => {
    const s = run([1])
    expect(unitsHitByWeapon(s, 'A:grunts', 'red.w.gun')).toEqual([])
  })
})

// a melee setup where every A:grunts model has 1 wound left, so any wound that gets through a failed save kills a model
function meleeState(aModels = 5, oneAttack = false): GameState {
  const b = oneAttack ? withBundle((d) => { (d.weapons['blu.w.choppa'] as any).A = 1; (d.weapons['red.w.blade'] as any).A = 1 }) : bundle
  const s = createGameState(makeSetup(unattached()), b, 'seed', ENGINE_VERSION)
  s.phase = 'fight'
  for (const id of s.units['A:grunts'].models.slice(aModels)) removeModel(s, id)
  placeUnit(s, 'A:grunts', { x: -10, z: -5, gap: 0.2 })
  placeUnit(s, 'B:mob', { x: -10, z: -4.1, gap: 0.2 })
  for (const id of s.units['A:grunts'].models) s.models[id].woundsRemaining = 1
  return s
}
// hit 4 / wound 6 / save 1 per attack (rolled as batches: all hits, all wounds, then one save per allocation)
const killDice = (n: number): number[] => [...Array(n).fill(4), ...Array(n).fill(6), ...Array(n).fill(1)]

describe('C4 death-reaction window attack.modelDestroyed (CHA-020, CHA-021)', () => {
  it('CHA-020 a model destroyed by an enemy attack opens the window for its owner before the next attack is allocated; the request is then dropped', () => {
    const s = meleeState()
    const mods = modulesWith(['attack.modelDestroyed'])
    const { ctx, events } = createContext(s, new ScriptedRng([...killDice(2), ...Array(30).fill(2)]), mods)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.choppa', 'A:grunts', 2)] })
    let r = attackService.advance(ctx)
    for (let i = 0; i < 50 && r === 'pending' && s.pending?.kind !== 'stratagemWindow'; i++) { answerFirst(ctx); r = attackService.advance(ctx) }
    expect(s.pending?.kind).toBe('stratagemWindow')
    expect(s.pending?.window).toBe('attack.modelDestroyed')
    expect(s.pending?.player).toBe('A')
    expect(ofType(events, 'ModelDestroyed')).toHaveLength(1) // the second attack has not been allocated yet
    const req = pendingDeathReaction(s)
    expect(req).toMatchObject({ unitId: 'A:grunts', player: 'A', attackerUnitId: 'B:mob', phase: 'fight' })
    expect(req?.pos).toBeDefined()
    for (let i = 0; i < 4 && s.pending?.window === 'attack.modelDestroyed'; i++) {
      const p = s.pending as PendingDecision
      s.pending = null
      mods.services.stratagems.handle(ctx, { type: 'pass', player: p.player, decisionId: DID }, p)
      attackService.advance(ctx)
    }
    expect(pendingDeathReaction(s)?.modelId).not.toBe(req?.modelId)
  })

  it('CHA-020 consumeDeathReaction removes exactly the named request', () => {
    const s = meleeState()
    s.phaseState.marks.push('deathReaction:' + JSON.stringify({ modelId: 'x', unitId: 'A:grunts', player: 'A', attackerUnitId: 'B:mob', pos: { x: 0, y: 0, z: 0 }, phase: 'fight' }))
    expect(pendingDeathReaction(s)?.modelId).toBe('x')
    consumeDeathReaction(s, 'x')
    expect(pendingDeathReaction(s)).toBeNull()
  })

  it('CHA-021 a mortal wound kill (no attacking unit) leaves no death-reaction request', () => {
    const s = meleeState()
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    attackService.destroyModel(ctx, s.units['A:grunts'].models[0], { player: 'B', unitId: null, modelId: null, kind: 'mortal' })
    expect(pendingDeathReaction(s)).toBeNull()
  })
})

describe('C5 fight on death (CHA-022, CHA-023, CHA-024)', () => {
  const act = (ctx: EngineContext, action: Action) => {
    if (!ctx.state.pending) fightModule.advance(ctx)
    const pending = ctx.state.pending as PendingDecision
    const rej = fightModule.validate?.(ctx.state, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    ctx.state.pending = null
    const handled = fightModule.handle(ctx, action, pending)
    if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
    return fightModule.advance(ctx)
  }
  // B:mob (1 model, 1 attack) fights A:grunts (1 model, 1 wound, 1 attack), B first
  function setup(dice: number[], grant: number | null = 4, mirror = false) {
    const s = meleeState(1, true)
    for (const id of s.units['B:mob'].models.filter((m) => m !== 'B:mob#1')) removeModel(s, id)
    s.models['B:mob#1'].woundsRemaining = mirror ? 1 : 5
    placeUnit(s, 'A:grunts', [{ x: -10, y: 0, z: -5 }])
    placeUnit(s, 'B:mob', [{ x: -10, y: 0, z: -4.2 }])
    if (grant !== null) grantFightOnDeath(s, 'A:grunts', grant)
    if (mirror) grantFightOnDeath(s, 'B:mob', 4)
    const h = createContext(s, new ScriptedRng([...dice, ...Array(40).fill(1)]), modulesWith([]))
    fightModule.enter(h.ctx)
    fightModule.advance(h.ctx)
    expect(s.pending?.kind).toBe('chooseFightUnit')
    act(h.ctx, { type: 'chooseFightUnit', player: 'B', decisionId: DID, unitId: 'B:mob' })
    if (s.pending?.kind === 'pileIn') act(h.ctx, { type: 'pileIn', player: 'B', decisionId: DID, unitId: 'B:mob', placements: [] })
    expect(s.pending?.kind).toBe('declareTargets')
    act(h.ctx, { type: 'declareTargets', player: 'B', decisionId: DID, unitId: 'B:mob', targets: [{ modelId: 'B:mob#1', weaponId: 'blu.w.choppa', targetUnitId: 'A:grunts' }] })
    return h
  }

  it('CHA-022 D6 >= threshold: the model stays at 0 W (not allocatable), fights after the attacker finishes, then is removed', () => {
    // B: hit 4, wound 6, save 1 -> the lone A model is destroyed -> Fervour D6 = 4. A's deferred model then attacks: hit 1 (miss)
    const { ctx, events } = setup([4, 6, 1, 4, 1])
    const s = ctx.state
    expect(s.pending?.kind).toBe('declareTargets')
    expect(s.pending?.player).toBe('A')
    const weapons = (s.pending as Extract<PendingDecision, { kind: 'declareTargets' }>).context.weapons
    expect(weapons.map((w) => w.modelId)).toEqual(['A:grunts#0'])
    expect(isDeferredDead(s, 'A:grunts#0')).toBe(true)
    expect(s.models['A:grunts#0'].woundsRemaining).toBe(0)
    expect(unitModels(s, 'A:grunts')).toHaveLength(0) // not allocatable / no OC / not coherency-relevant
    expect(ofType(events, 'UnitDestroyed')).toHaveLength(0)
    expect(ofType(events, 'ModelDestroyed')).toHaveLength(0)
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#0', weaponId: 'red.w.blade', targetUnitId: 'B:mob' }] })
    // the deferred model has made its attack and is now removed, crediting the original attacker (CHA-024)
    expect(deferredDeaths(s)).toHaveLength(0)
    expect(s.models['A:grunts#0']).toBeUndefined()
    expect(ofType(events, 'HitRolled')).toHaveLength(2)
    const dead = ofType(events, 'UnitDestroyed').find((e) => e.unitId === 'A:grunts')
    expect(dead).toMatchObject({ byUnitId: 'B:mob', byPlayer: 'B', kind: 'melee' })
    expect(s.units['A:grunts'].location).toBe('destroyed')
  })

  it('CHA-024 a deferred model has no OC and is ignored by coherency; UnitDestroyed fires only after the last one is removed, credited to the attacker', () => {
    const { ctx, events } = setup([4, 6, 1, 4, 1])
    const s = ctx.state
    const id = 'A:grunts#0'
    // the model is still physically on the board (in unit.models, at 0 W) ...
    expect(s.units['A:grunts'].models).toContain(id)
    expect(s.models[id].woundsRemaining).toBe(0)
    expect(isDeferredDead(s, id)).toBe(true)
    // ... but contributes no Objective Control: an objective sitting right on it is held by nobody
    const objId = Object.keys(s.objectives)[0]
    s.objectives[objId].pos = { x: s.models[id].pos.x, z: s.models[id].pos.z } as typeof s.objectives[typeof objId]['pos']
    expect(objectiveService.modelsInRange(s, objId, 'A')).not.toContain(id)
    expect(objectiveService.levelOfControl(s, objId).A).toBe(0)
    // ... and is skipped by the coherency check
    expect(unitModelsForCoherency(s, 'A:grunts')).toHaveLength(0)
    // the unit is not destroyed while a deferred model is still waiting for its attack
    expect(deferredDeaths(s)).toHaveLength(1)
    expect(ofType(events, 'UnitDestroyed').some((e) => e.unitId === 'A:grunts')).toBe(false)
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#0', weaponId: 'red.w.blade', targetUnitId: 'B:mob' }] })
    // once the last deferred model is gone the unit is destroyed, credited to the original attacker
    expect(deferredDeaths(s)).toHaveLength(0)
    const dead = ofType(events, 'UnitDestroyed').filter((e) => e.unitId === 'A:grunts')
    expect(dead).toHaveLength(1)
    expect(dead[0]).toMatchObject({ byUnitId: 'B:mob', byPlayer: 'B' })
    const slain = ofType(events, 'ModelDestroyed').find((e) => e.modelId === id)
    expect(slain).toMatchObject({ byUnitId: 'B:mob' })
  })

  it('CHA-024 mirror: a deferred model whose last attack kills an enemy fight-on-death model still gets that model resolved, destroyed and credited', () => {
    // B kills A's lone model (hit 4, wound 6, save 1; Fervour 4 -> deferred). A's deferred model then hits 6, wounds 6, B saves 1 -> B's
    // lone 1-W model dies, Fervour 4 -> deferred with the deferred A unit as its attacker; nothing is left on the board for it to hit.
    const { ctx, events } = setup([4, 6, 1, 4, 6, 6, 1, 4], 4, true)
    const s = ctx.state
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#0', weaponId: 'red.w.blade', targetUnitId: 'B:mob' }] })
    expect(deferredDeaths(s)).toHaveLength(0)
    expect(s.models['B:mob#1']).toBeUndefined()
    expect(s.models['A:grunts#0']).toBeUndefined()
    const dead = ofType(events, 'UnitDestroyed')
    expect(dead.find((e) => e.unitId === 'B:mob')).toMatchObject({ byUnitId: 'A:grunts', byPlayer: 'A' })
    expect(dead.find((e) => e.unitId === 'A:grunts')).toMatchObject({ byUnitId: 'B:mob', byPlayer: 'B' })
    expect(s.units['B:mob'].location).toBe('destroyed')
  })

  it('CHA-024 safety net: a model still deferred when the fight phase ends is removed and credited, not revived by the mark clear', () => {
    const { ctx, events } = setup([4, 6, 1, 4])
    const s = ctx.state
    expect(deferredDeaths(s)).toHaveLength(1)
    purgeDeferredDeaths(ctx)
    expect(deferredDeaths(s)).toHaveLength(0)
    expect(s.models['A:grunts#0']).toBeUndefined()
    expect(ofType(events, 'UnitDestroyed').find((e) => e.unitId === 'A:grunts')).toMatchObject({ byUnitId: 'B:mob', byPlayer: 'B' })
  })

  it('CHA-023 D6 below the threshold: the model is removed normally and nothing is deferred', () => {
    const { ctx, events } = setup([4, 6, 1, 3])
    const s = ctx.state
    expect(deferredDeaths(s)).toHaveLength(0)
    expect(s.models['A:grunts#0']).toBeUndefined()
    expect(ofType(events, 'UnitDestroyed').some((e) => e.unitId === 'A:grunts')).toBe(true)
    expect(s.pending?.player === 'A' && s.pending?.kind === 'declareTargets').toBe(false)
  })

  it('CHA-023 a unit that already fought this phase gets no Fervour roll', () => {
    const s = meleeState(1)
    s.units['A:grunts'].turn.foughtThisPhase = true
    grantFightOnDeath(s, 'A:grunts', 4)
    const { ctx } = createContext(s, new ScriptedRng([]), modulesWith([]))
    attackService.destroyModel(ctx, 'A:grunts#0', { player: 'B', unitId: 'B:mob', modelId: 'B:mob#1', kind: 'melee' }) // an empty ScriptedRng would throw on any roll
    expect(s.models['A:grunts#0']).toBeUndefined()
  })

  it('CHA-023 without a grant a destroyed model is simply removed', () => {
    const s = meleeState(1)
    const { ctx } = createContext(s, new ScriptedRng([]), modulesWith([]))
    attackService.destroyModel(ctx, 'A:grunts#0', { player: 'B', unitId: 'B:mob', modelId: 'B:mob#1', kind: 'melee' })
    expect(s.models['A:grunts#0']).toBeUndefined()
  })
})