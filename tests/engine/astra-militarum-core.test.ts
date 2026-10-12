// Astra Militarum engine changes beyond code hooks (docs/spec/factions/astra-militarum.md §7.1, C1-C7), exercised with the
// real Combat Patrol data: per-model keywords, Patrol Squads splitting, unit copies + the Next Wave arrival, the Attacks
// re-roll offer, dynamic Lone Operative, capped / halved stat effects, Advance halving, charge ban, Orders ending on
// Battle-shock, and the two geometry helpers. Hook-level behaviour is covered in astra-militarum.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, battlefieldEdgeStrip, createContext, createGameState, emptyPhaseState, keywordsOf, modelHasAttacked,
  modelKeywordsOf, recordModelAttacked, removeModel, spawnDestroyedUnitCopy, whollyWithinOfPolygon,
  type Action, type DeclaredTarget, type EngineContext, type GameEvent, type GameSetup, type GameState, type ModuleTable, type PendingDecision,
  type PlayerSetup,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { pushReaction } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { movementModule } from '../../src/engine/phases/movement'
import { enhancementService } from '../../src/engine/enhancements'
import { placeUnit, recordingStratagems } from '../fixtures'
import { splitPatrolSquad } from '../../src/engine/setup'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const AM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Astra Militarum', faction: 'astra-militarum', patrolId: 'am.cp.karsks-gunners', enhancementId: 'am.e.command-laurels', secondaryId: 'am.sec.hold-the-line',
  attachments: [{ leaderRef: 'karsk', bodyguardRef: 'shock-a' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0,
})

const KARSK = 'A:karsk', SHA = 'A:shock-a', SHB = 'A:shock-b', BAT = 'A:battery', SEN = 'A:sentinel', BOYZ = 'B:boyz-a'

function makeState(a: Partial<PlayerSetup> = {}, round = 2): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: AM(a), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'astra-core', ENGINE_VERSION)
  s.round = round
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}

function modulesWithStubs(): ModuleTable {
  return {
    ...DEFAULT_MODULES,
    services: {
      ...DEFAULT_MODULES.services,
      stratagems: recordingStratagems(),
      los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    },
  }
}
function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function destroyUnit(s: GameState, unitId: string): void {
  for (const id of [...s.units[unitId].models]) removeModel(s, id)
  s.units[unitId].location = 'destroyed'
}

function drive(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('drive: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without decision')
    const action = ('options' in pending && pending.options.length > 0 ? pending.options[0].action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })

// =====================================================================================================================
describe('C1 per-model keywords', () => {
  it('AST-032 AST-6.1: only the Karsk model is CHARACTER/OFFICER; the unit keyword union follows its living models', () => {
    const s = makeState()
    const [karsk, vet] = s.units[KARSK].models
    expect(modelKeywordsOf(s, karsk)).toEqual(expect.arrayContaining(['CHARACTER', 'OFFICER', 'KARSK', 'INFANTRY']))
    expect(modelKeywordsOf(s, vet)).not.toContain('CHARACTER')
    expect(modelKeywordsOf(s, vet)).not.toContain('OFFICER')
    expect(keywordsOf(s, KARSK)).toContain('OFFICER')
    removeModel(s, karsk)
    expect(keywordsOf(s, KARSK)).not.toContain('OFFICER')
    expect(keywordsOf(s, KARSK)).not.toContain('CHARACTER')
    for (const id of [...s.units[KARSK].models]) removeModel(s, id)
    expect(keywordsOf(s, KARSK)).toContain('CHARACTER') // no models left: datasheet-wide union
  })

  it('AST-032 AST-6.1: allocation into the attached Karsk + Shock Troops excludes Karsk while a trooper lives, and includes him once none do', () => {
    const s = makeState()
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
    const karskModel = s.units[KARSK].models[0]
    const pool = leaderService.allocatableModels!(s, SHA)
    expect(pool).not.toContain(karskModel)
    expect(pool).toEqual(expect.arrayContaining([...s.units[SHA].models, ...s.units[KARSK].models.slice(1)]))
    for (const id of [...s.units[SHA].models]) removeModel(s, id)
    expect(leaderService.allocatableModels!(s, KARSK)).toContain(karskModel)
  })

  it('AST-013 AST-3.0: the enhancement bearer is the Karsk model, not the first veteran', () => {
    const s = makeState()
    const bearer = enhancementService.bearerModelId(s, 'A')
    expect(bearer).toBe(s.units[KARSK].models[0])
    expect(modelKeywordsOf(s, bearer!)).toContain('CHARACTER')
    const ab = Object.values(s.abilities).find((a) => a.source === 'enhancement')!
    expect(ab.bearerModelId).toBe(bearer)
  })
})

// =====================================================================================================================
describe('C2 Patrol Squads', () => {
  it('AST-029 AST-6.6: split → two 1-model Battery units (…:battery, …:battery~a, strength 1 each); unsplit → one 2-model unit', () => {
    const s = makeState()
    expect(s.units[BAT].models).toHaveLength(2)
    expect(splitPatrolSquad(s, BAT, [1, 1])).toEqual([BAT, 'A:battery~a'])
    expect(s.units[BAT].models).toEqual(['A:battery#0'])
    expect(s.units['A:battery~a'].models).toEqual(['A:battery#1'])
    expect(s.units[BAT].startingStrength).toBe(1)
    expect(s.units['A:battery~a'].startingStrength).toBe(1)
    expect(s.models['A:battery#1'].unitId).toBe('A:battery~a')
    expect(s.units['A:battery~a'].datasheetId).toBe(s.units[BAT].datasheetId)
  })

  it('AST-037 AST-6.6: each half of a split Battery is its own unit for aura / Lone Operative tests (separate unit ids and models)', () => {
    const s = makeState()
    splitPatrolSquad(s, BAT, [1, 1])
    recordModelAttacked(s, 'A:battery#0')
    expect(modelHasAttacked(s, 'A:battery#0')).toBe(true)
    expect(modelHasAttacked(s, 'A:battery#1')).toBe(false)
  })
})

// =====================================================================================================================
describe('C3 unit copies and the Next Wave arrival', () => {
  it('AST-022 AST-5.1: spawnDestroyedUnitCopy builds a fresh full-strength copy with the original per-model loadouts and a new id', () => {
    const s = makeState()
    const original = s.units[SHB].models.map((id) => ({ ds: s.models[id].datasheetModelId, weapons: [...s.models[id].weapons] }))
    destroyUnit(s, SHB)
    const { ctx, events } = ctxOf(s)
    const copy = spawnDestroyedUnitCopy(ctx, SHB)
    expect(copy.id).toBe('A:shock-b~1')
    expect(copy.location).toBe('reserves')
    expect(copy.models).toHaveLength(10)
    expect(copy.startingStrength).toBe(10)
    expect(copy.isWarlord).toBe(false)
    expect(copy.attachedLeaderId).toBeNull()
    expect(copy.models.map((id) => ({ ds: s.models[id].datasheetModelId, weapons: s.models[id].weapons }))).toEqual(original)
    for (const id of copy.models) {
      expect(s.models[id].unitId).toBe(copy.id)
      expect(s.models[id].woundsRemaining).toBe(s.datasheets[copy.datasheetId].models.find((m) => m.modelId === s.models[id].datasheetModelId)!.stats.W)
    }
    expect(of(events, 'UnitDeployed').some((e) => e.unitId === copy.id && e.toReserves)).toBe(true)
    // a second copy of the same destroyed unit (a later turn) gets the next suffix
    expect(spawnDestroyedUnitCopy(ctx, SHB).id).toBe('A:shock-b~2')
  })

  it('AST-023 AST-5.1: battlefieldEdgeStrip — a full-width zone gives the 9" strip along its board edge, a corner zone gets one strip along its longest edge (AM-16), not an L', () => {
    const board = { w: 44, h: 30 }
    const rect = battlefieldEdgeStrip(board, [{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: -10 }, { x: -22, z: -10 }], 9)
    expect(rect).toEqual([{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: -6 }, { x: -22, z: -6 }])
    const flank = battlefieldEdgeStrip(board, [{ x: -22, z: -15 }, { x: -12, z: -15 }, { x: -12, z: 15 }, { x: -22, z: 15 }], 9)
    expect(flank).toEqual([{ x: -22, z: -15 }, { x: -13, z: -15 }, { x: -13, z: 15 }, { x: -22, z: 15 }])
    const corner = battlefieldEdgeStrip(board, [{ x: -22, z: 15 }, { x: -22, z: -15 }, { x: 0, z: -15 }], 9)
    // AM-16: exactly one battlefield edge — the longest side (x = -22), not an L
    expect(corner).toEqual([{ x: -22, z: -15 }, { x: -13, z: -15 }, { x: -13, z: 15 }, { x: -22, z: 15 }])
  })

  it('AST-023 AST-5.1: a nextWave reaction raises the arrival decision in the edge strip; outside it or within Engagement Range is rejected; arrival emits via nextWave', () => {
    const s = makeState({}, 2)
    s.phase = 'movement'
    s.phaseState = emptyPhaseState()
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    destroyUnit(s, SHB)
    const modules = modulesWithStubs()
    const { ctx, events } = createContext(s, new ScriptedRng([]), modules)
    const copy = spawnDestroyedUnitCopy(ctx, SHB)
    pushReaction(ctx, { kind: 'nextWave', stratagemId: 'am.s.send-in-the-next-wave', player: 'A', unitId: copy.id, enemyUnitId: null, window: 'movement.end', distance: null })
    s.step = 'reinforcements'
    // every board unit has already moved this phase
    s.phaseState.marks.push('mv:arriveQueue=[]')
    expect(movementModule.advance(ctx)).toBe('pending')
    const pending = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([copy.id])
    expect(pending.context.reservesAllowed).toEqual([])
    expect(pending.context.zone).toEqual(battlefieldEdgeStrip(s.board, [{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: -10 }, { x: -22, z: -10 }], 9))
    const legal = movementModule.legalActions!(s, pending) as Action[]
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.every((a) => a.type === 'deployUnit' && !a.toReserves && movementModule.validate!(s, a, pending) === null)).toBe(true)
    const good = legal[0] as Extract<Action, { type: 'deployUnit' }>
    expect(good.toReserves).toBeFalsy()
    expect(movementModule.validate!(s, good, pending)).toBeNull()
    // outside the strip
    const outside: Action = { ...good, placements: good.placements.map((p) => ({ ...p, pos: { ...p.pos, z: p.pos.z + 20 } })) }
    expect(movementModule.validate!(s, outside, pending)).not.toBeNull()
    // within Engagement Range of an enemy (the enemy is dropped next to the first placed model)
    const first = good.placements[0].pos
    s.models[s.units[BOYZ].models[0]].pos = { x: first.x + 1.2, y: 0, z: first.z }
    expect(movementModule.validate!(s, good, pending)).not.toBeNull()
    s.models[s.units[BOYZ].models[0]].pos = { x: 10, y: 0, z: 8 }
    // place it
    s.pending = null
    expect(movementModule.handle(ctx, good, pending)).toBeUndefined()
    expect(s.units[copy.id].location).toBe('board')
    expect(s.units[copy.id].turn.arrivedThisTurn).toBe(true)
    expect(of(events, 'ReinforcementsArrived').some((e) => e.unitId === copy.id && e.via === 'nextWave')).toBe(true)
  })

  it('AST-023 AST-5.1: the spawned unit is not culled as stranded Reserves in round 4 while its arrival is pending', () => {
    const s = makeState({}, 4)
    s.phase = 'movement'
    s.phaseState = emptyPhaseState()
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    destroyUnit(s, SHB)
    const { ctx } = createContext(s, new ScriptedRng([]), modulesWithStubs())
    const copy = spawnDestroyedUnitCopy(ctx, SHB)
    pushReaction(ctx, { kind: 'nextWave', stratagemId: 'am.s.send-in-the-next-wave', player: 'A', unitId: copy.id, enemyUnitId: null, window: 'movement.end', distance: null })
    s.step = 'reinforcements'
    s.phaseState.marks.push('mv:arriveQueue=[]')
    expect(movementModule.advance(ctx)).toBe('pending')
    expect(s.pending?.kind).toBe('deployUnit')
    expect(s.units[copy.id].models).toHaveLength(10)
  })

  it('AST-023 AST-5.1: the Next Wave arrival cannot be sent to Reserves — it must be set up at once', () => {
    const s = makeState({}, 2)
    s.phase = 'movement'
    s.phaseState = emptyPhaseState()
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    destroyUnit(s, SHB)
    const { ctx } = createContext(s, new ScriptedRng([]), modulesWithStubs())
    const copy = spawnDestroyedUnitCopy(ctx, SHB)
    pushReaction(ctx, { kind: 'nextWave', stratagemId: 'am.s.send-in-the-next-wave', player: 'A', unitId: copy.id, enemyUnitId: null, window: 'movement.end', distance: null })
    s.step = 'reinforcements'
    s.phaseState.marks.push('mv:arriveQueue=[]')
    expect(movementModule.advance(ctx)).toBe('pending')
    const pending = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const toReserves = { type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: copy.id, placements: [], toReserves: true } as Action
    expect(movementModule.validate!(s, toReserves, pending)).toMatchObject({ code: 'E_NOT_AN_OPTION' })
  })
})

// =====================================================================================================================
describe('C4 Attacks re-roll offer and C5 dynamic Lone Operative', () => {
  const gunnery = { enhancementId: 'am.e.gunnery-officer' }
  function battery(a: Partial<PlayerSetup>): GameState {
    const s = makeState(a)
    s.phase = 'shooting'
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
    placeUnit(s, BAT, [[-11, -6.5], [-9.5, -6.5]])
    placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 })
    return s
  }

  it('AST-014 AST-3.2: with the Gunnery Officer in range the bombast D6 offers a re-roll, taking it re-rolls the die; the new result stands', () => {
    const s = battery(gunnery)
    const bat = s.units[BAT].models[0]
    expect(hookService.attackCountRerollSource(s, bat, s.weapons['am.w.bombast-field-gun'])).toMatch(/^am.e.gunnery-officer/)
    const { ctx, events } = ctxOf(s, [2, 4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], modulesWithStubs())
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BAT, overwatch: false, targets: [target(bat, 'am.w.bombast-field-gun', BOYZ)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const offer = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(offer.context.topic).toBe('rerollOffer')
    expect(offer.context.data.purpose).toBe('attacks')
    expect(String(offer.context.data.source)).toMatch(/^am.e.gunnery-officer/)
    expect(offer.options.map((o) => o.id)).toEqual(['reroll', 'keep'])
    drive(ctx)
    const rerolls = of(events, 'DiceRerolled').filter((e) => e.source.startsWith('am.e.gunnery-officer'))
    expect(rerolls).toHaveLength(1)
    expect(rerolls[0].before).toEqual([2])
    expect(rerolls[0].after).toEqual([4])
    // exactly one offer: the re-rolled die is never offered again
    expect(of(events, 'DecisionRequested').filter((e) => e.pending.kind === 'chooseOption' && e.pending.context.topic === 'rerollOffer' && e.pending.context.data.purpose === 'attacks')).toHaveLength(1)
  })

  it('AST-014 AST-3.2: without the enhancement (or out of the aura) no Attacks re-roll is offered', () => {
    const s = battery({})
    const bat = s.units[BAT].models[0]
    expect(hookService.attackCountRerollSource(s, bat, s.weapons['am.w.bombast-field-gun'])).toBeNull()
    const g = battery(gunnery)
    placeUnit(g, BAT, [[10, 8], [11.5, 8]])
    expect(hookService.attackCountRerollSource(g, g.units[BAT].models[0], g.weapons['am.w.bombast-field-gun'])).toBeNull()
  })

  it('AST-016 AST-3.2: the Battery is a Lone Operative while in the aura and unspent; an attack takes it away for the attacking model\'s unit', () => {
    const s = battery(gunnery)
    expect(hookService.hasCoreAbility(s, BAT, 'LONE_OPERATIVE')).toBe(true)
    expect(hookService.hasCoreAbility(s, SEN, 'LONE_OPERATIVE')).toBe(false)
    expect(hookService.hasCoreAbility(s, BAT, 'DEEP_STRIKE')).toBe(false)
    const bat = s.units[BAT].models[0]
    const { ctx } = ctxOf(s, [3, ...Array.from({ length: 60 }, () => 6)], modulesWithStubs())
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BAT, overwatch: false, targets: [target(bat, 'am.w.bombast-field-gun', BOYZ)] })
    drive(ctx)
    expect(modelHasAttacked(s, bat)).toBe(true)
    expect(hookService.hasCoreAbility(s, BAT, 'LONE_OPERATIVE')).toBe(false)
    // never without the enhancement
    expect(hookService.hasCoreAbility(battery({}), BAT, 'LONE_OPERATIVE')).toBe(false)
  })
})

// =====================================================================================================================
describe('C6 capped / halved stat effects, Advance halving, charge ban', () => {
  const grant = (s: GameState, unitId: string, effect: object, sourceAbilityId = 'test.source') => {
    const { ctx } = ctxOf(s)
    effectService.grant(ctx, unitId, effect as never, { sourceAbilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
  }
  const sv = (s: GameState, unitId: string, base: number) => hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'Sv' }, base)

  it('AST-006 AST-2.5: a capped Sv -1 improves 6+/5+/4+ by one but never past 3+, and leaves 3+ and 2+ unchanged', () => {
    const s = makeState()
    grant(s, SHA, { modifyStat: { stat: 'Sv', value: -1, cap: 3 } })
    expect([6, 5, 4, 3, 2].map((b) => sv(s, SHA, b))).toEqual([5, 4, 3, 3, 2])
  })

  it('AST-006 AST-2.5: a capped modifier stacks after plain ones and an uncapped modifier is unaffected by the cap', () => {
    const s = makeState()
    grant(s, SHA, { modifyStat: { stat: 'Sv', value: -1 } }, 'test.plain')
    grant(s, SHA, { modifyStat: { stat: 'Sv', value: -1, cap: 3 } }, 'test.capped')
    expect(sv(s, SHA, 5)).toBe(3) // 5 → 4 (plain) → 3 (capped)
    expect(sv(s, SHA, 4)).toBe(3) // 4 → 3 (plain), capped one already at the cap
    expect(sv(s, SHA, 3)).toBe(2) // 3 → 2 (plain); the cap only limits its own modifier
  })

  it('AST-026 AST-5.3: halveStat M rounds up before additive deltas (6 → 3, 5 → 3)', () => {
    const s = makeState()
    grant(s, SHA, { halveStat: 'M' })
    const m = (base: number) => hookService.statFor(s, { unitId: SHA, modelId: s.units[SHA].models[0], weapon: null, stat: 'M' }, base)
    expect(m(6)).toBe(3)
    expect(m(5)).toBe(3)
    grant(s, SHA, { modifyStat: { stat: 'M', value: 3 } }, 'test.order')
    expect(m(6)).toBe(6) // halved first (3), then +3
  })

  it('AST-026 AST-5.3: halveRoll advance halves the Advance roll rounding up (5 → 3, 6 → 3, 1 → 1), then applies roll modifiers; unaffected units keep the roll', () => {
    const s = makeState()
    expect(hookService.advanceRollFor(s, SHA, 5)).toBe(5)
    grant(s, SHA, { halveRoll: 'advance' })
    expect(hookService.advanceRollFor(s, SHA, 5)).toBe(3)
    expect(hookService.advanceRollFor(s, SHA, 6)).toBe(3)
    expect(hookService.advanceRollFor(s, SHA, 1)).toBe(1)
    expect(hookService.advanceRollFor(s, SEN, 5)).toBe(5)
    grant(s, SEN, { modifyRoll: { roll: 'advance', value: 1 } })
    expect(hookService.advanceRollFor(s, SEN, 5)).toBe(6)
  })

  it('AST-026 AST-5.3: forbid charge stops charge declarations only for the affected unit', () => {
    const s = makeState()
    expect(hookService.chargeForbidden(s, SHA)).toBe(false)
    grant(s, SHA, { forbid: 'charge' })
    expect(hookService.chargeForbidden(s, SHA)).toBe(true)
    expect(hookService.chargeForbidden(s, SEN)).toBe(false)
  })
})

// =====================================================================================================================
describe('C7 Orders end on Battle-shock', () => {
  it('AST-008 AST-2.4: failing a battle-shock test removes every effect flagged endsOnBattleShock from the unit (and emits EffectExpired); others stay', () => {
    const s = makeState()
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
    expect(s.abilities['am.order.take-aim']?.params?.endsOnBattleShock).toBe(true)
    const { ctx, events } = ctxOf(s, [1, 1])
    const grantTo = (id: string, src: string, effect: object) => effectService.grant(ctx, id, effect as never, { sourceAbilityId: src, sourceUnitId: KARSK, scope: { who: 'self' }, duration: 'untilNextTurn' })
    grantTo(SHA, 'am.order.take-aim', { when: { weaponType: 'ranged' }, modifyStat: { stat: 'BS', value: -1 } })
    grantTo(SHA, 'test.keep', { modifyStat: { stat: 'M', value: 1 } })
    grantTo(SEN, 'am.order.take-aim', { when: { weaponType: 'ranged' }, modifyStat: { stat: 'BS', value: -1 } })
    placeUnit(s, SEN, [[16, 10]])
    const lasgun = s.weapons['am.w.lasgun']
    const bs = (unitId: string) => hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: lasgun, stat: 'BS' }, 4)
    expect(bs(SHA)).toBe(3)
    expect(hookService.battleShockTest(ctx, SHA, 'test')).toBe(false)
    expect(s.units[SHA].battleShocked).toBe(true)
    expect(bs(SHA)).toBe(4)
    expect(s.units[SHA].effects.map((e) => e.sourceAbilityId)).toEqual(['test.keep'])
    expect(of(events, 'EffectExpired').filter((e) => e.unitId === SHA)).toHaveLength(1)
    // an unrelated unit keeps its Order
    expect(bs(SEN)).toBe(3)
  })

  it('AST-008 AST-2.4: a passed battle-shock test leaves the Order in place', () => {
    const s = makeState()
    placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
    placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
    const { ctx } = ctxOf(s, [6, 6])
    effectService.grant(ctx, SHA, { modifyStat: { stat: 'M', value: 3 } } as never, { sourceAbilityId: 'am.order.move-move-move', sourceUnitId: KARSK, scope: { who: 'self' }, duration: 'untilNextTurn' })
    expect(hookService.battleShockTest(ctx, SHA, 'test')).toBe(true)
    expect(s.units[SHA].effects).toHaveLength(1)
  })
})

// =====================================================================================================================
describe('geometry helpers', () => {
  const zone = [{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: -10 }, { x: -22, z: -10 }]
  const at = (x: number, z: number) => ({ pos: { x, y: 0, z }, facing: 0, base: { shape: 'round' as const, radius: 0.5 } })
  it('AST-018 AST-4.1: whollyWithinOfPolygon — inside, within n of the boundary, and beyond n', () => {
    expect(whollyWithinOfPolygon(at(0, -12), zone, 6)).toBe(true)
    expect(whollyWithinOfPolygon(at(0, -5), zone, 6)).toBe(true) // 5" from the zone edge, base wholly within 6"
    expect(whollyWithinOfPolygon(at(0, -4.4), zone, 6)).toBe(false) // centre 5.6" from the zone edge, far edge 6.1"
    expect(whollyWithinOfPolygon(at(0, 0), zone, 6)).toBe(false)
    expect(whollyWithinOfPolygon(at(0, -10.2), zone, 0)).toBe(false) // straddles the zone edge
  })
})
