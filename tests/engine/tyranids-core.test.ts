// Tyranids engine changes beyond code hooks (docs/spec/factions/tyranids.md 7.1 items 2-10, checklist TYR-*): Death Blow deferred
// removal, Teeming Broods spawn + Strategic Reserves, reactive Normal move, Infiltrators, Fights First core ability, granted core
// abilities, notYetShot / includeDestroyed targets, stratagem cost override, Patrol Squads split, closest eligible target.
// Real Combat Patrol data (The Vardenghast Swarm vs Gordrang's Gitstompas).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel, deploymentZone,
  type Action, type ChooseOptionDecision, type DeployUnitDecision, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type PendingDecision, type PlayerSetup, type UnitId, type UseStratagemAction,
} from '../../src/engine'
import type { ScoringRule } from '../../src/data/types'
import { attackService } from '../../src/engine/attack'
import { alphaXenoformAmount } from '../../src/engine/factions/tyranids'
import { finishDeferredRemoval, pendingDeathBlowUnits } from '../../src/engine/deathblow'
import { leaderService } from '../../src/engine/leaders'
import { objectiveService } from '../../src/engine/objectives'
import { fightModule } from '../../src/engine/phases/fight'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { movementModule, reserveRouteFor, startReactiveMove, strategicReservesConstraints } from '../../src/engine/phases/movement'
import { setupModule, splitPatrolSquad } from '../../src/engine/setup'
import { hasCoreAbility, spawnUnitCopy } from '../../src/engine/state'
import { effectiveCost, ignoresLimit, stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TYR = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Tyranids', faction: 'tyranids', patrolId: 'tyr.cp.vardenghast-swarm', enhancementId: 'tyr.e.psychostatic-veil', secondaryId: 'tyr.sec.alpha-xenoform',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const PRIME = 'A:prime', PSY = 'A:psychophage', TERM = 'A:termagants', BARB = 'A:barbgaunts', LEAP = 'A:leapers'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'

function makeState(o: { attacker?: 'A' | 'B'; round?: number } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TYR(), B: ORK() },
    sides: { attacker: o.attacker ?? 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'tyranids-core', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}
function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
function ctxOf(s: GameState, dice: number[] = []) { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const radius = (s: GameState, unitId: string) => s.models[s.units[unitId].models[0]].base.radius

// engaged pair: the Prime at the origin and a Boyz unit a half inch away (edge to edge)
function engagePrimeAndBoyz(s: GameState): void {
  placeUnit(s, PRIME, [[0, 0]])
  placeUnit(s, BOYZ, [[radius(s, PRIME) + radius(s, BOYZ) + 0.5, 0]])
}

// =====================================================================================================================
describe('Death Blow deferred removal (TYR-6.1)', () => {
  it('TYR-026 TYR-6.1: Prime killed in melee, D6 = 4 → not removed, ModelRemovalDeferred; the removal then credits the original killer', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    engagePrimeAndBoyz(s)
    const prime = s.units[PRIME].models[0]
    const boyz = s.units[BOYZ].models[0]
    const { ctx, events } = ctxOf(s, [4])
    attackService.destroyModel(ctx, prime, { player: 'B', unitId: BOYZ, modelId: boyz, kind: 'melee' })
    expect(s.models[prime]).toBeDefined()
    expect(s.models[prime].pendingRemoval).toMatchObject({ byPlayer: 'B', byUnitId: BOYZ, byModelId: boyz, kind: 'melee' })
    expect(s.models[prime].woundsRemaining).toBe(0)
    expect(of(events, 'ModelRemovalDeferred')).toHaveLength(1)
    expect(of(events, 'ModelDestroyed')).toHaveLength(0)
    expect(pendingDeathBlowUnits(s)).toEqual([PRIME])
    finishDeferredRemoval(ctx, prime)
    const destroyed = of(events, 'ModelDestroyed')
    expect(destroyed).toHaveLength(1)
    expect(destroyed[0]).toMatchObject({ modelId: prime, byPlayer: 'B', byUnitId: BOYZ, byModelId: boyz, kind: 'melee' })
    expect(s.models[prime]).toBeUndefined()
    expect(s.units[PRIME].location).toBe('destroyed')
    expect((s.players.B.secondaryState.killsThisPhase as Record<string, number>)[boyz]).toBe(1)
    expect(pendingDeathBlowUnits(s)).toEqual([])
  })

  it('TYR-026 TYR-6.1: the controller declines → ModelDestroyed at once; accepting selects the Prime out of alternation and removes it after it fights', () => {
    for (const choice of ['decline', 'fight'] as const) {
      const s = makeState()
      phase(s, 'fight', 'B')
      engagePrimeAndBoyz(s)
      const prime = s.units[PRIME].models[0]
      const { ctx, events } = ctxOf(s, [4, ...Array(300).fill(1)])
      attackService.destroyModel(ctx, prime, { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'melee' })
      expect(fightModule.advance(ctx)).toBe('pending')
      let pending = s.pending as ChooseOptionDecision
      expect(pending.kind).toBe('chooseOption')
      expect(pending.player).toBe('A')
      expect(pending.context.data).toMatchObject({ choice: 'deathBlow', unitId: PRIME })
      s.pending = null
      const rej = fightModule.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: choice }, pending as PendingDecision)
      expect(rej).toBeUndefined()
      if (choice === 'decline') {
        expect(of(events, 'ModelDestroyed')).toHaveLength(1)
        expect(s.units[PRIME].location).toBe('destroyed')
        continue
      }
      expect(s.phaseState.fight!.currentUnitId).toBe(PRIME)
      expect(of(events, 'FightUnitSelected').map((e) => e.unitId)).toEqual([PRIME])
      // drive the Prime's activation: pile in / attacks / consolidate answered with the first legal action, windows passed
      for (let guard = 0; guard < 60 && s.phaseState.fight!.currentUnitId === PRIME; guard++) {
        const r = fightModule.advance(ctx)
        if (r === 'done') break
        const cur = s.pending as unknown as PendingDecision
        const isStrat = cur.kind === 'stratagemWindow' || cur.kind === 'reactionWindow' || cur.kind === 'commandReroll'
        const options = (isStrat ? [] : fightModule.legalActions?.(s, cur) ?? []) as Action[]
        const action: Action = options[0] ?? { type: 'pass', player: cur.player, decisionId: cur.id }
        s.pending = null
        const owner = isStrat ? DEFAULT_MODULES.services.stratagems : cur.kind === 'allocateAttack' || cur.kind === 'chooseOption' ? attackService.handler : fightModule
        const res = owner.handle(ctx, { ...action, player: cur.player, decisionId: cur.id } as Action, cur)
        if (res) throw new Error(`rejected ${res.code} ${res.reason}`)
      }
      expect(s.phaseState.fight!.fought).toContain(PRIME)
      // the Prime at 0 wounds really attacks: its own model rolls to hit
      expect(of(events, 'HitRolled').filter((e) => e.attack.attackerModelId === prime).length).toBeGreaterThan(0)
      expect(of(events, 'HitRolled').every((e) => e.attack.attackerUnitId === PRIME || e.attack.attackerUnitId === BOYZ)).toBe(true)
      expect(s.units[PRIME].location).toBe('destroyed')
      expect(of(events, 'ModelDestroyed').filter((e) => e.modelId === prime)).toHaveLength(1)
      expect(of(events, 'ModelDestroyed').find((e) => e.modelId === prime)).toMatchObject({ byPlayer: 'B', byUnitId: BOYZ })
      // alternation resumes where it was: the Orks (the Prime's opponent) are next
      expect(s.phaseState.fight!.nextToSelect).toBe('A')
    }
  })

  it('TYR-027 TYR-6.1: D6 = 3 → removed at once; ranged kill, mortal wounds, or a Prime that already fought → no roll', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    engagePrimeAndBoyz(s)
    const prime = s.units[PRIME].models[0]
    const { ctx, events } = ctxOf(s, [3])
    attackService.destroyModel(ctx, prime, { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'melee' })
    expect(of(events, 'ModelDestroyed')).toHaveLength(1)
    expect(s.models[prime]).toBeUndefined()
    // no dice scripted: a roll would throw ScriptedRng exhausted
    for (const kind of ['ranged', 'mortal'] as const) {
      const t = makeState()
      phase(t, 'fight', 'B')
      engagePrimeAndBoyz(t)
      const c = ctxOf(t, [])
      attackService.destroyModel(c.ctx, t.units[PRIME].models[0], { player: 'B', unitId: BOYZ, modelId: null, kind })
      expect(of(c.events, 'ModelDestroyed')).toHaveLength(1)
      expect(of(c.events, 'ModelRemovalDeferred')).toHaveLength(0)
    }
    const u = makeState()
    phase(u, 'fight', 'B')
    engagePrimeAndBoyz(u)
    u.units[PRIME].turn.foughtThisPhase = true
    const c = ctxOf(u, [])
    attackService.destroyModel(c.ctx, u.units[PRIME].models[0], { player: 'B', unitId: BOYZ, modelId: null, kind: 'melee' })
    expect(of(c.events, 'ModelDestroyed')).toHaveLength(1)
  })

  it('TYR-028 TYR-6.1: while removal is pending the Prime takes no allocated attacks and adds 0 OC', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    const obj = Object.values(s.objectives)[0]
    placeUnit(s, PRIME, [[obj.pos.x, obj.pos.z]])
    placeUnit(s, TERM, { x: obj.pos.x + 20, z: obj.pos.z + 20 })
    const prime = s.units[PRIME].models[0]
    const before = objectiveService.levelOfControl(s, obj.id).A
    expect(before).toBeGreaterThan(0)
    expect(leaderService.allocatableModels(s, PRIME)).toEqual([prime])
    const { ctx } = ctxOf(s, [5])
    attackService.destroyModel(ctx, prime, { player: 'B', unitId: BOYZ, modelId: null, kind: 'melee' })
    expect(s.models[prime].pendingRemoval).toBeTruthy()
    expect(leaderService.allocatableModels(s, PRIME)).toEqual([])
    expect(objectiveService.levelOfControl(s, obj.id).A).toBe(0)
  })

  it('TYR-014 TYR-4: a Prime that fights on through Death Blow and kills credits its own model for Alpha Xenoform — +4 VP that phase', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    engagePrimeAndBoyz(s)
    const prime = s.units[PRIME].models[0]
    const boyz = s.units[BOYZ].models[0]
    // Death Blow roll 4, then 5s: Prime talons (S6 AP-1) hit on 2+, wound the Boyz on 3+, and the 5+ save fails at 6+
    const { ctx, events } = ctxOf(s, [4, ...Array(300).fill(5)])
    attackService.destroyModel(ctx, prime, { player: 'B', unitId: BOYZ, modelId: boyz, kind: 'melee' })
    expect(s.models[prime].pendingRemoval).toBeTruthy()
    expect(fightModule.advance(ctx)).toBe('pending')
    let pending = s.pending as ChooseOptionDecision
    s.pending = null
    expect(fightModule.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'fight' }, pending as PendingDecision)).toBeUndefined()
    const boyzBefore = s.units[BOYZ].models.length
    for (let guard = 0; guard < 80 && s.phaseState.fight!.currentUnitId === PRIME; guard++) {
      const r = fightModule.advance(ctx)
      if (r === 'done') break
      const cur = s.pending as unknown as PendingDecision
      const isStrat = cur.kind === 'stratagemWindow' || cur.kind === 'reactionWindow' || cur.kind === 'commandReroll'
      const options = (isStrat ? [] : fightModule.legalActions?.(s, cur) ?? []) as Action[]
      const action: Action = options[0] ?? { type: 'pass', player: cur.player, decisionId: cur.id }
      s.pending = null
      const owner = isStrat ? DEFAULT_MODULES.services.stratagems : cur.kind === 'allocateAttack' || cur.kind === 'chooseOption' ? attackService.handler : fightModule
      const res = owner.handle(ctx, { ...action, player: cur.player, decisionId: cur.id } as Action, cur)
      if (res) throw new Error(`rejected ${res.code} ${res.reason}`)
    }
    expect(s.units[BOYZ].models.length).toBeLessThan(boyzBefore)
    const kills = of(events, 'ModelDestroyed').filter((e) => e.byModelId === prime)
    expect(kills.length).toBeGreaterThan(0)
    expect((s.players.A.secondaryState.killsThisPhase as Record<string, number>)[prime]).toBe(kills.length)
    // phase end: Alpha Xenoform pays 4 VP to the Tyranid player, and nothing to the Orks
    const rule = { id: 'alpha-xenoform', when: 'phase.end', rounds: { from: 1, to: 5 }, who: 'both', rule: 'custom', pointsPer: 4, cap: 4, code: 'alphaXenoform', params: { keyword: 'WINGED TYRANID PRIME' } } as unknown as ScoringRule
    expect(alphaXenoformAmount(s, rule, 'B')).toBe(0)
    expect(alphaXenoformAmount(s, rule, 'A')).toBe(4)
    expect(alphaXenoformAmount(s, rule, 'A')).toBe(0) // the per-phase record is cleared once read
  })
})

// =====================================================================================================================
describe('Teeming Broods spawn and Strategic Reserves (TYR-5.4)', () => {
  it('TYR-022 TYR-5.4: spawnUnitCopy makes a Reserves unit of N models with Starting Strength N; the source stays destroyed', () => {
    const s = makeState()
    for (const m of [...s.units[TERM].models]) removeModel(s, m)
    expect(s.units[TERM].location).toBe('destroyed')
    const first = spawnUnitCopy(s, TERM, 7)
    expect(first.id).toBe('A:termagants~1')
    expect(first.location).toBe('reserves')
    expect(first.models).toHaveLength(7)
    expect(first.startingStrength).toBe(7)
    expect(first.datasheetId).toBe(s.units[TERM].datasheetId)
    expect(s.models[first.models[0]].weapons).toEqual(s.units[TERM].destroyedModels[0].weapons)
    expect(s.models[first.models[0]].woundsRemaining).toBe(1)
    expect(s.units[TERM].location).toBe('destroyed')
    expect(spawnUnitCopy(s, TERM, 3).id).toBe('A:termagants~2')
  })

  it('TYR-025 TYR-5.5: Teeming Broods lists destroyed TERMAGANTS units (and only those); the target list never includes other destroyed units', () => {
    const s = makeState()
    phase(s, 'movement', 'A', { A: 3 })
    placeUnit(s, PRIME, [[0, -12]])
    placeUnit(s, TERM, { x: -5, z: -12 })
    const ids = () => stratagemService.options(s, 'A', 'movement.reinforcements', {}).filter((x) => x.stratagemId === 'tyr.s.teeming-broods').map((x) => x.targets.unitIds?.[0])
    expect(ids()).toEqual([TERM])
    for (const m of [...s.units[TERM].models]) removeModel(s, m)
    expect(s.units[TERM].location).toBe('destroyed')
    expect(ids()).toEqual([TERM])
    // a destroyed unit of another keyword is not a target
    for (const m of [...s.units[PRIME].models]) removeModel(s, m)
    expect(ids()).toEqual([TERM])
  })

  it('TYR-023 TYR-5.4: a spawned unit arrives by Strategic Reserves — wholly within 6" of an edge, >9" from enemies, not in the enemy DZ in round 2', () => {
    const s = makeState({ round: 2 })
    phase(s, 'movement', 'A')
    placeUnit(s, BOYZ, { x: 18, z: -8, gap: 0.3 })
    placeUnit(s, PRIME, [[-20, 0]])
    placeUnit(s, PSY, [[-20, 4]])
    placeUnit(s, BARB, { x: -20, z: 8, gap: 0.3 })
    placeUnit(s, LEAP, { x: -20, z: -4, gap: 0.3 })
    for (const m of [...s.units[TERM].models]) removeModel(s, m)
    const copy = spawnUnitCopy(s, TERM, 3)
    expect(reserveRouteFor(s, copy.id)).toBe('strategicReserves')
    s.units[PRIME].location = 'reserves'
    expect(reserveRouteFor(s, PRIME)).toBe('deepStrike') // Deep Strike units keep their route
    s.units[PRIME].location = 'board'
    expect(reserveRouteFor(s, LEAP)).toBe('strategicReserves')
    expect(strategicReservesConstraints(s, 'A').minDistanceFromEnemies).toBe(9)

    s.step = 'reinforcements'
    const probe = ctxOf(s, [])
    expect(movementModule.advance(probe.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([copy.id])
    const place = (x: number, z: number, step = 1.3): Action => ({
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: copy.id,
      placements: s.units[copy.id].models.map((id, i) => ({ modelId: id, pos: { x: x + i * step, y: 0, z }, facing: 0 })),
    })
    // along the table edge (z = -14.2): within 6" of it, far from the Orks, outside their zone
    expect(movementModule.validate!(s, place(-8, -14.2), pending)).toBeNull()
    // the middle of the board is not within 6" of any edge
    expect(movementModule.validate!(s, place(-8, 0), pending)).not.toBeNull()
    // inside the Orks' deployment zone in round 2, but fine from round 3 on
    expect(movementModule.validate!(s, place(-8, 14.2), pending)).not.toBeNull()
    s.round = 3
    expect(movementModule.validate!(s, place(-8, 14.2), pending)).toBeNull()
    s.round = 2
    // within 9" of an enemy model
    expect(movementModule.validate!(s, place(14, -14.2), pending)).not.toBeNull()
    // the answer places the unit on the board as Strategic Reserves
    s.pending = null
    expect(movementModule.handle(probe.ctx, place(-8, -14.2), pending)).toBeUndefined()
    expect(s.units[copy.id].location).toBe('board')
    expect(of(probe.events, 'ReinforcementsArrived')[0]).toMatchObject({ unitId: copy.id, via: 'strategicReserves' })
  })

  it('TYR-023 TYR-5.4: a copy created during the Reinforcements step cannot arrive in that same step', () => {
    const t = makeState({ round: 2 })
    phase(t, 'movement', 'A')
    t.step = 'reinforcements'
    for (const m of [...t.units[TERM].models]) removeModel(t, m)
    t.phaseState.marks.push('mv:arriveQueue=[]') // the queue the step fixed before the Teeming Broods window
    spawnUnitCopy(t, TERM, 4)
    const c = ctxOf(t, [])
    expect(movementModule.advance(c.ctx)).toBe('done')
    expect(t.units['A:termagants~1'].location).toBe('reserves')
  })
})

// =====================================================================================================================
describe('Reactive Normal move (Skulking Horrors, TYR-6.3)', () => {
  it('TYR-031 TYR-6.3: startReactiveMove opens a capped Normal move for the owner; the interrupted activation is untouched and moveType never changes', () => {
    const s = makeState()
    phase(s, 'movement', 'B')
    placeUnit(s, TERM, s.units[TERM].models.map((_, i): [number, number] => [16 + (i % 5) * 1.3, 3 + Math.floor(i / 5) * 1.3]))
    placeUnit(s, BOYZ, [[-20, -8]])
    s.units[TERM].turn.moveType = null
    const { ctx, events } = ctxOf(s, [])
    startReactiveMove(ctx, TERM, 4, 'tyr.a.skulking-horrors')
    const pending = s.pending as PendingDecision & { kind: 'moveUnit' }
    expect(pending.kind).toBe('moveUnit')
    expect(pending.player).toBe('A')
    expect(pending.constraints.maxDistance).toBe(4)
    expect(pending.canPass).toBe(true)
    const models = s.units[TERM].models.map((id) => s.models[id])
    const move = (dz: number): Action => ({
      type: 'moveUnit', player: 'A', decisionId: pending.id, unitId: TERM,
      placements: models.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z + dz }, facing: m.facing })),
    })
    expect(movementModule.validate!(s, move(-3.9), pending)).toBeNull()
    expect(movementModule.validate!(s, move(-4.5), pending)?.code).toBe('E_OUT_OF_RANGE') // beyond the rolled distance
    expect(movementModule.legalActions!(s, pending)!.some((a) => a.type === 'pass')).toBe(true)
    const z0 = models[0].pos.z
    s.pending = null
    expect(movementModule.handle(ctx, move(-3.9), pending)).toBeUndefined()
    expect(s.models[models[0].id].pos.z).toBeCloseTo(z0 - 3.9, 3)
    expect(of(events, 'UnitMoved')[0]).toMatchObject({ unitId: TERM, moveType: 'normal' })
    expect(s.units[TERM].turn.moveType).toBeNull()
    expect(s.phaseState.marks.some((m) => m.startsWith('mv:reactive='))).toBe(false)
  })

  it('TYR-031 TYR-6.3: the owner may decline the move (pass) and the unit stays put', () => {
    const s = makeState()
    phase(s, 'movement', 'B')
    placeUnit(s, TERM, s.units[TERM].models.map((_, i): [number, number] => [16 + (i % 5) * 1.3, 3 + Math.floor(i / 5) * 1.3]))
    const { ctx } = ctxOf(s, [])
    const before = s.units[TERM].models.map((id) => ({ ...s.models[id].pos }))
    startReactiveMove(ctx, TERM, 3, 'x')
    const pending = s.pending as PendingDecision
    s.pending = null
    expect(movementModule.handle(ctx, { type: 'pass', player: 'A', decisionId: pending.id }, pending)).toBeUndefined()
    expect(s.units[TERM].models.map((id) => s.models[id].pos)).toEqual(before)
    expect(s.phaseState.marks.some((m) => m.startsWith('mv:reactive='))).toBe(false)
  })
})

// =====================================================================================================================
describe('Infiltrators and Patrol Squads at Declare Battle Formations (TYR-036, TYR-037)', () => {
  function deploymentState(): { s: GameState; ctx: EngineContext } {
    const s = makeState({ attacker: 'B' }) // A is the Defender and deploys first
    s.phase = 'deployment'
    s.round = 0
    s.phaseState = emptyPhaseState()
    s.step = 'deploy'
    return { s, ctx: ctxOf(s, []).ctx }
  }
  const answer = (ctx: EngineContext, optionId: string): void => {
    const pending = ctx.state.pending as ChooseOptionDecision
    ctx.state.pending = null
    const rej = setupModule.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
    if (rej) throw new Error(`${rej.code} ${rej.reason}`)
  }

  it('TYR-036 TYR-6.6: Patrol Squads split offered at Declare Battle Formations → two TERMAGANTS units of 10, each with Skulking Horrors', () => {
    const { s, ctx } = deploymentState()
    expect(setupModule.advance(ctx)).toBe('pending')
    const offer = s.pending as ChooseOptionDecision
    expect(offer.kind).toBe('chooseOption')
    expect(offer.player).toBe('A')
    expect(offer.context.unitId).toBe(TERM)
    expect(offer.context.data).toMatchObject({ choice: 'patrolSquads', sizes: [10, 10] })
    answer(ctx, 'split')
    expect(s.units[TERM].models).toHaveLength(10)
    expect(s.units[TERM].startingStrength).toBe(10)
    const half = s.units['A:termagants~a']
    expect(half.models).toHaveLength(10)
    expect(half.startingStrength).toBe(10)
    expect(half.datasheetId).toBe(s.units[TERM].datasheetId) // same datasheet, so every ability (Skulking Horrors) carries over
    expect(half.models.every((m) => s.models[m].unitId === half.id)).toBe(true)
    expect(half.location).toBe('reserves')
    // the split is offered once; deployment then proceeds with the extra unit available
    expect(setupModule.advance(ctx)).toBe('pending')
    const next = s.pending as DeployUnitDecision
    expect(next.kind).toBe('deployUnit')
    expect(next.context.unitIds).toContain('A:termagants~a')
  })

  it('TYR-036 TYR-6.6: keeping the squad whole changes nothing; splitPatrolSquad refuses sizes that do not add up', () => {
    const { s, ctx } = deploymentState()
    expect(setupModule.advance(ctx)).toBe('pending')
    answer(ctx, 'keep')
    expect(s.units['A:termagants~a']).toBeUndefined()
    expect(s.units[TERM].models).toHaveLength(20)
    expect(splitPatrolSquad(s, TERM, [10, 5])).toEqual([TERM])
    expect(s.units[TERM].models).toHaveLength(20)
    expect(splitPatrolSquad(s, TERM, [12, 8])).toEqual([TERM, 'A:termagants~a'])
    expect(s.units[TERM].startingStrength).toBe(12)
    expect(s.units['A:termagants~a'].startingStrength).toBe(8)
  })

  it('TYR-037 TYR-6: Leapers deploy via Infiltrators more than 9" from the enemy DZ and enemy models; 8.9" is rejected', () => {
    const { s, ctx } = deploymentState()
    expect(setupModule.advance(ctx)).toBe('pending')
    answer(ctx, 'keep')
    expect(setupModule.advance(ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.context.infiltrators).toEqual([LEAP])
    const dz = deploymentZone(s, 'B') // the Orks' zone
    const zs = dz.map((p) => p.z)
    const towardPositive = Math.min(...zs) > 0
    const nearEdge = towardPositive ? Math.min(...zs) : Math.max(...zs)
    const sign = towardPositive ? -1 : 1
    const r = radius(s, LEAP)
    const placeAt = (edgeGap: number): Action => ({
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: LEAP,
      placements: s.units[LEAP].models.map((id, i) => ({ modelId: id, pos: { x: i * (2 * r + 0.3), y: 0, z: nearEdge + sign * (edgeGap + r) }, facing: 0 })),
    })
    expect(setupModule.validate!(s, placeAt(8.9), pending)).not.toBeNull()
    expect(setupModule.validate!(s, placeAt(9.1), pending)).toBeNull()
    // a unit without Infiltrators gets no such latitude
    const termAction: Action = {
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: TERM,
      placements: s.units[TERM].models.map((id, i) => ({ modelId: id, pos: { x: -20 + i * 2, y: 0, z: nearEdge + sign * 12 }, facing: 0 })),
    }
    expect(setupModule.validate!(s, termAction, pending)).not.toBeNull()
  })
})

// =====================================================================================================================
describe('Core abilities read from datasheets and grants (TYR-009, TYR-038)', () => {
  it('TYR-009 TYR-3: hasCoreAbility honours the datasheet and a granted keyword of the same name (Psychostatic Veil → Lone Operative)', () => {
    const s = makeState()
    placeUnit(s, PRIME, [[0, -12]]) // on the battlefield, so its enhancement is live
    expect(hasCoreAbility(s, LEAP, 'INFILTRATORS')).toBe(true)
    expect(hasCoreAbility(s, LEAP, 'LONE_OPERATIVE')).toBe(false)
    expect(hasCoreAbility(s, TERM, 'LONE_OPERATIVE')).toBe(false)
    expect(hasCoreAbility(s, PRIME, 'DEEP_STRIKE')).toBe(true)
    expect(hasCoreAbility(s, PRIME, 'LONE_OPERATIVE')).toBe(true) // granted by the bearer's enhancement
  })

  it('TYR-009 TYR-3: Psychostatic Veil — a ranged attacker 13" away cannot target the Prime, 12" away can (Lone Operative); an ordinary unit is targetable at 13"', () => {
    const shootaTargets = (s: GameState): UnitId[] => {
      const { ctx } = ctxOf(s, [])
      const shoota = buildShootingWeaponEntries(ctx, BOYZ).filter((e) => e.weaponId === 'ork.w.shoota')
      expect(shoota.length, 'the Boyz carry shootas (18")').toBeGreaterThan(0)
      return shoota.flatMap((e) => e.legalTargets)
    }
    // one Boyz model `gap` inches (edge to edge) from the target at the origin, on its open side
    const withGap = (target: UnitId, gap: number): GameState => {
      const s = makeState()
      phase(s, 'shooting', 'B')
      placeUnit(s, target, s.units[target].models.map((_, i) => [0, i * 2] as [number, number])) // a column, so a multi-model unit is not stacked on one point
      placeUnit(s, BOYZ, [[radius(s, target) + radius(s, BOYZ) + gap, 0]])
      return s
    }
    expect(shootaTargets(withGap(PRIME, 13))).not.toContain(PRIME)
    expect(shootaTargets(withGap(PRIME, 12))).toContain(PRIME)
    // control: the same shoota reaches an ordinary Tyranid unit at 13" (the cap comes from the granted Lone Operative, not range or sight)
    expect(shootaTargets(withGap(TERM, 13))).toContain(TERM)
  })

  it('TYR-038 TYR-6: Psychophage — Feel No Pain 5+ ignores a wound on a 5 and not on a 4', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    placeUnit(s, PSY, [[0, 0]])
    placeUnit(s, BOYZ, [[20, 0]])
    const psy = s.units[PSY].models[0]
    const before = s.models[psy].woundsRemaining
    const { ctx, events } = ctxOf(s, [5, 4, ...Array(20).fill(1)])
    attackService.queueMortalWounds(ctx, PSY, 2, 'test', false)
    let r = attackService.advance(ctx)
    for (let guard = 0; r === 'pending' && guard < 50; guard++) {
      const cur = s.pending as PendingDecision & { options?: { action: Action }[] }
      s.pending = null
      const res = attackService.handler.handle(ctx, cur.options![0].action, cur)
      if (res) throw new Error(`rejected ${res.code} ${res.reason}`)
      r = attackService.advance(ctx)
    }
    const fnp = of(events, 'FeelNoPainRolled')
    expect(fnp.map((f) => [f.die, f.needed, f.ignored])).toEqual([[5, 5, true], [4, 5, false]])
    expect(s.models[psy].woundsRemaining).toBe(before - 1)
  })

  it('TYR-038 TYR-6: Psychophage — Deadly Demise 1: destroyed on a 6 it deals 1 mortal wound to each unit within 6"; a 5 does nothing', () => {
    const run = (die: number) => {
      const s = makeState()
      phase(s, 'shooting', 'B')
      placeUnit(s, PSY, [[0, 0]])
      placeUnit(s, TERM, s.units[TERM].models.map((_, i) => [3, i * 1.5] as [number, number])) // within 6" of the Psychophage
      placeUnit(s, BOYZ, [[30, 0]]) // far away: not caught
      const psy = s.units[PSY].models[0]
      const { ctx, events } = ctxOf(s, [die])
      attackService.destroyModel(ctx, psy, { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
      return { s, demise: of(events, 'DeadlyDemiseRolled')[0] }
    }
    const boom = run(6)
    expect(boom.demise).toMatchObject({ unitId: PSY, die: 6, exploded: true })
    expect(boom.demise.affected).toContain(TERM)
    expect(boom.demise.affected).not.toContain(BOYZ)
    expect(boom.s.phaseState.attack?.mortalQueue.length).toBeGreaterThan(0)
    expect(boom.s.phaseState.attack?.mortalQueue.every((q) => q.count === 1)).toBe(true)
    const quiet = run(5)
    expect(quiet.demise).toMatchObject({ die: 5, exploded: false, affected: [] })
    expect(quiet.s.phaseState.attack?.mortalQueue ?? []).toHaveLength(0)
  })

  it('TYR-038 TYR-6: Leapers are in the Fights First step without having charged; a unit without the ability is not', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    placeUnit(s, LEAP, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, PSY, [[-12, 0]])
    placeUnit(s, BOYZ, { x: 0, z: radius(s, LEAP) + radius(s, BOYZ) + 0.4, gap: 0.3 })
    placeUnit(s, BOYZ2, [[-12, radius(s, PSY) + radius(s, BOYZ2) + 0.4]])
    expect(leaderService.inEngagementWithEnemy(s, PSY)).toBe(true)
    expect(leaderService.inEngagementWithEnemy(s, LEAP)).toBe(true)
    const { ctx } = ctxOf(s, [])
    expect(fightModule.advance(ctx)).toBe('pending')
    const pending = s.pending as PendingDecision & { kind: 'chooseFightUnit' }
    expect(pending.kind).toBe('chooseFightUnit')
    expect(pending.context.step).toBe('fightsFirst')
    expect(pending.context.eligible).toEqual([LEAP])
  })
})

// =====================================================================================================================
describe('Stratagem targets and cost overrides (TYR-019b, TYR-035)', () => {
  it('TYR-019b TYR-5.2: Voracious Assault in Shooting needs a unit not yet shot, in the owner\'s own phase only; in Fight a unit not yet fought', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    placeUnit(s, TERM, { x: 0, z: -4, gap: 0.3 })
    placeUnit(s, BARB, { x: 8, z: -4, gap: 0.3 })
    const offered = (w: Parameters<typeof stratagemService.options>[2], p: 'A' | 'B' = 'A') =>
      stratagemService.options(s, p, w, {}).filter((x) => x.stratagemId === 'tyr.s.voracious-assault').map((x) => x.targets.unitIds?.[0]).sort()
    expect(offered('shooting.start')).toEqual([BARB, TERM].sort())
    s.units[TERM].turn.shotThisPhase = true
    expect(offered('shooting.start')).toEqual([BARB])
    s.units[TERM].turn.shotThisPhase = false
    s.phaseState.activated.push(BARB)
    expect(offered('shooting.start')).toEqual([TERM])
    // the opponent's Shooting phase: never
    phase(s, 'shooting', 'B', { A: 3 })
    expect(offered('shooting.start')).toEqual([])
    // either player's Fight phase: any unit not yet fought
    phase(s, 'fight', 'B', { A: 3 })
    expect(offered('fight.start')).toEqual([BARB, TERM].sort())
    s.phaseState.fight!.fought.push(TERM)
    expect(offered('fight.start')).toEqual([BARB])
  })

  it('TYR-035 TYR-6.5: Pouncing Leap — Heroic Intervention with the Leapers costs 0 CP (offered at 0 CP), ignores the once-per-phase limit; Termagants pay 1 CP', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { A: 0 })
    placeUnit(s, BOYZ, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, LEAP, { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, TERM, { x: 6, z: -5, gap: 0.3 })
    s.units[BOYZ].turn.chargedThisTurn = true
    const hi = s.stratagems['core.s.heroic-intervention']
    expect(effectiveCost(s, 'A', hi, [BOYZ, LEAP])).toBe(0)
    expect(effectiveCost(s, 'A', hi, [BOYZ, TERM])).toBe(1)
    expect(ignoresLimit(s, 'A', hi, [BOYZ, LEAP])).toBe(true)
    expect(ignoresLimit(s, 'A', hi, [BOYZ, TERM])).toBe(false)
    const offers = (): string[] => stratagemService.options(s, 'A', 'charge.moveEnded', { unitId: BOYZ })
      .filter((x) => x.stratagemId === 'core.s.heroic-intervention').map((x) => x.targets.unitIds![1]).sort()
    expect(offers()).toEqual([LEAP]) // 0 CP: only the free one is affordable
    s.players.A.cp = 2
    expect(offers()).toEqual([LEAP, TERM].sort())
    // HI already used this phase on another unit: the Leapers are still offered, the Termagants are not
    s.players.A.stratagemUses.push({ stratagemId: 'core.s.heroic-intervention', round: s.round, turn: 'B', phase: 'charge' })
    expect(offers()).toEqual([LEAP])
  })

  it('TYR-035 TYR-6.5: using it for the Leapers spends 0 CP and records the effective cost on StratagemUsed', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { A: 0 })
    placeUnit(s, BOYZ, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, LEAP, { x: 0, z: -5, gap: 0.3 })
    s.units[BOYZ].turn.chargedThisTurn = true
    const { ctx, events } = ctxOf(s, [])
    const action = stratagemService.options(s, 'A', 'charge.moveEnded', { unitId: BOYZ }).find((x) => x.stratagemId === 'core.s.heroic-intervention')!
    expect(action).toBeDefined()
    const pending = {
      id: 'd:1', kind: 'reactionWindow', player: 'A', window: 'charge.moveEnded', canPass: true,
      context: { enemyUnitId: BOYZ, reaction: 'heroicIntervention', eligibleUnits: [LEAP] }, options: [],
    } as unknown as PendingDecision
    const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
    expect(stratagemService.validate!(s, act, pending)).toBeNull()
    expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
    expect(s.players.A.cp).toBe(0)
    expect(of(events, 'StratagemUsed')[0]).toMatchObject({ stratagemId: 'core.s.heroic-intervention', cost: 0 })
    expect(of(events, 'CpChanged')).toHaveLength(0)
  })
})

// =====================================================================================================================
describe('Closest eligible target and Starting Strength queries (TYR-5.2, TYR-029)', () => {
  it('TYR-018 TYR-5.2: ranged — only the closest enemy unit that is in range and visible counts', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    placeUnit(s, TERM, [[-14, 0]])
    placeUnit(s, BOYZ, [[-14, 7]])
    placeUnit(s, BOYZ2, [[-14, 12]])
    expect(leaderService.closestEligibleTargets(s, TERM, 'ranged')).toEqual([BOYZ])
    // beyond every ranged weapon's reach (18"): no eligible target at all
    placeUnit(s, TERM, [[-2, -14.9]])
    placeUnit(s, BOYZ, [[-2, 14.9]])
    placeUnit(s, BOYZ2, [[-2, 14.9]])
    expect(leaderService.closestEligibleTargets(s, TERM, 'ranged')).toEqual([])
  })

  it('TYR-019 TYR-5.2: two enemy units tied for closest both qualify', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    placeUnit(s, TERM, [[-14, 0]])
    placeUnit(s, BOYZ, [[-17, 7]])
    placeUnit(s, BOYZ2, [[-11, 7]])
    expect(leaderService.closestEligibleTargets(s, TERM, 'ranged').sort()).toEqual([BOYZ, BOYZ2])
  })

  it('TYR-018 TYR-5.2: melee — only units within Engagement Range are eligible', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    engagePrimeAndBoyz(s)
    placeUnit(s, BOYZ2, [[0, 8]])
    expect(leaderService.closestEligibleTargets(s, PRIME, 'melee')).toEqual([BOYZ])
  })

  it('TYR-029 TYR-6.2: isBelowStartingStrength counts both halves of the unit; Below Half is stricter', () => {
    const s = makeState()
    placeUnit(s, TERM, { x: 0, z: -4, gap: 0.3 })
    expect(leaderService.isBelowStartingStrength(s, TERM)).toBe(false)
    removeModel(s, s.units[TERM].models[0])
    expect(leaderService.isBelowStartingStrength(s, TERM)).toBe(true) // 19/20
    expect(leaderService.isBelowHalfStrength(s, TERM)).toBe(false)
    for (const m of s.units[TERM].models.slice(0, 10)) removeModel(s, m)
    expect(s.units[TERM].models).toHaveLength(9)
    expect(leaderService.isBelowHalfStrength(s, TERM)).toBe(true) // 9/20
  })
})
