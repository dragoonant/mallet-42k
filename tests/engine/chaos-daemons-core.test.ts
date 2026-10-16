// Chaos Daemons: engine changes beyond code hooks (docs/spec/factions/chaos-daemons.md 7.1, items E1 + E2; checklist CHA-1xx).
// E1 Shadow of Chaos areas (shadow.ts + reducer phase-start refresh), E2 Battle-shock modifiers and the Manifestation / Terror
// after-effects (shadow.ts, reducer emit listener, command.ts drain). Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGame, createGameState, emptyPhaseState, legalActions, step,
  type Action, type GameEvent, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerId, type PlayerSetup,
} from '../../src/engine'
import { commandModule } from '../../src/engine/phases/command'
import {
  hasShadowOfChaos, modelInShadow, noMansLandObjectives, objectiveInShadow, refreshShadow, shadowBattleShockModifiers, shadowFlags,
  unitInShadow, warpLocusBearers, zoneObjectives,
} from '../../src/engine/shadow'
import { modelStats } from '../../src/engine/state'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CDM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Daemons', faction: 'chaos-daemons', patrolId: 'cdm.cp.butchers-of-hyporia', enhancementId: 'cdm.e.incarnated-rage', secondaryId: 'cdm.sec.worthy-offerings',
  attachments: [{ leaderRef: 'khharret', bodyguardRef: 'bloodletters-1' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const DRK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Drukhari', faction: 'drukhari', patrolId: 'drk.cp.blades-of-torment', enhancementId: 'drk.e.shudderworm-bottle', secondaryId: 'drk.sec.rapacious-raiders',
  attachments: [{ leaderRef: 'archon', bodyguardRef: 'kabalites' }], reserves: [], battleReadyVp: 0, ...o,
})

// A = Chaos Daemons (attacker: deployment zone z -15..-10), B = Orks (z 10..15). Mission cp-01 objectives (all in No Man's Land):
// west (-10,0), east (10,0), north (0,6), south (0,-6).
const KH = 'A:khharret', BL1 = 'A:bloodletters-1', BL2 = 'A:bloodletters-2', CRUSH = 'A:bloodcrushers'
const BOYZ = 'B:boyz-a'
const SHADOW_ID = 'cdm.a.shadow-of-chaos'

function setupOf(a: PlayerSetup, b: PlayerSetup): GameSetup {
  return { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: a, B: b }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
}
function makeState(phase: GameState['phase'] = 'command', a: PlayerSetup = CDM(), b: PlayerSetup = ORK(), active: PlayerId = 'A'): GameState {
  const s = createGameState(setupOf(a, b), bundle, 'cdm-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = active
  s.firstPlayer = 'A'
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
const noStrats = (): ModuleTable => ({ ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: { ...DEFAULT_MODULES.services.stratagems, offered: () => [] } as never } })
function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }

// destroy the last `n` models of a unit the way the engine leaves them: snapshot in destroyedModels, record gone
function kill(s: GameState, unitId: string, n: number): void {
  const u = s.units[unitId]
  for (const id of u.models.slice(-n)) {
    u.destroyedModels.push(structuredClone(s.models[id]))
    delete s.models[id]
  }
  u.models = u.models.slice(0, u.models.length - n)
}
// total wounds left across a unit's living models
const woundsLeft = (s: GameState, unitId: string): number => s.units[unitId].models.reduce((n, id) => n + s.models[id].woundsRemaining, 0)
const ids = (s: GameState, unitId: string): string[] => s.units[unitId].models

// A's whole force on the board in its own deployment zone (z -12), Orks in theirs (z +12)
function deploy(s: GameState): void {
  placeUnit(s, BL1, { x: -8, z: -12 })
  placeUnit(s, KH, [[-8, -13.5]])
  placeUnit(s, BL2, { x: -8, z: -14 })
  placeUnit(s, CRUSH, { x: 0, z: -12 })
  placeUnit(s, 'A:flesh-hounds-1', { x: 8, z: -12 })
  placeUnit(s, 'A:flesh-hounds-2', { x: 8, z: -14 })
  for (const u of Object.values(s.units)) if (u.player === 'B') placeUnit(s, u.id, { x: -8, z: 12 })
}
// answer every open allocation / save decision with its first option, then drain the attack sequence
function settle(s: GameState, ctx: import('../../src/engine').EngineContext): void {
  for (let i = 0; i < 40 && (s.pending || s.phaseState.attack); i++) {
    const p = s.pending as PendingDecision | null
    if (p) {
      const acts = legalActions(s, p)
      s.pending = null
      ctx.services.attack.handler.handle(ctx, { ...(acts![0] as Action), decisionId: p.id } as Action, p)
    }
    if (s.phaseState.attack && !s.pending) ctx.services.attack.advance(ctx)
  }
}
function refresh(s: GameState, dice: number[] = []) { const c = ctxOf(s, dice); refreshShadow(c.ctx); return c }
const control = (s: GameState, who: Record<string, PlayerId | null>): void => { for (const [id, p] of Object.entries(who)) s.objectives[id].controller = p }
const summaries = (events: GameEvent[]): string[] => events.filter((e) => e.type === 'AbilityTriggered').map((e) => (e as { summary: string }).summary)

// ===================================================================================================================
// E1 Shadow of Chaos areas
// ===================================================================================================================
describe('E1 Shadow of Chaos areas (shadow.ts)', () => {
  it('CHA-103 DMN-2.1: hasShadowOfChaos is true for the Daemon player only', () => {
    const s = makeState()
    expect(hasShadowOfChaos(s, 'A')).toBe(true)
    expect(hasShadowOfChaos(s, 'B')).toBe(false)
  })

  it('CHA-103 DMN-2.1 a: a unit partly in its own deployment zone is in the Shadow; a unit wholly in No Man\'s Land is not', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    expect(unitInShadow(s, 'A', BL1)).toBe(true)
    // straddling the zone edge (z -10): partly in the zone
    placeUnit(s, BL2, { x: -8, z: -9.8 })
    expect(unitInShadow(s, 'A', BL2)).toBe(true)
    // wholly in No Man's Land
    placeUnit(s, BL2, { x: -8, z: 0 })
    expect(unitInShadow(s, 'A', BL2)).toBe(false)
    expect(modelInShadow(s, 'A', ids(s, BL2)[0])).toBe(false)
    // the enemy's deployment zone is not in the Shadow without control
    placeUnit(s, BL2, { x: -8, z: 12 })
    expect(unitInShadow(s, 'A', BL2)).toBe(false)
  })

  it('CHA-103 DMN-2.1 b: No Man\'s Land joins the Shadow when the Daemons controlled at least half its markers at phase start', () => {
    const s = makeState()
    deploy(s)
    placeUnit(s, BL2, { x: -8, z: 0 })
    control(s, { west: 'A', north: 'A', east: 'B' }) // 2 of 4 = half
    const { events } = refresh(s)
    expect(shadowFlags(s, 'A')).toEqual({ noMansLand: true, enemyZone: false })
    expect(unitInShadow(s, 'A', BL2)).toBe(true)
    expect(summaries(events).some((m) => m.startsWith('Shadow of Chaos: No Man'))).toBe(true)
    // the Orks have no ability: no record at all
    expect(SHADOW_KEYS(s, 'B')).toBe(false)
  })

  it('CHA-103 DMN-2.1 b: one of four markers is not enough', () => {
    const s = makeState()
    deploy(s)
    placeUnit(s, BL2, { x: -8, z: 0 })
    control(s, { west: 'A' })
    refresh(s)
    expect(shadowFlags(s, 'A').noMansLand).toBe(false)
    expect(unitInShadow(s, 'A', BL2)).toBe(false)
  })

  it('CHA-103 DMN-2.5 c: the record is stale in another phase, turn or round, and lasts the whole phase', () => {
    const s = makeState()
    deploy(s)
    control(s, { west: 'A', north: 'A' })
    refresh(s)
    expect(shadowFlags(s, 'A').noMansLand).toBe(true)
    // control lost mid-phase: the Shadow stays until the phase ends
    control(s, { west: 'B', north: 'B' })
    expect(shadowFlags(s, 'A').noMansLand).toBe(true)
    s.phase = 'movement'
    expect(shadowFlags(s, 'A')).toEqual({ noMansLand: false, enemyZone: false })
    s.phase = 'command'
    s.activePlayer = 'B'
    expect(shadowFlags(s, 'A').noMansLand).toBe(false)
    s.activePlayer = 'A'
    s.round = 3
    expect(shadowFlags(s, 'A').noMansLand).toBe(false)
  })

  it('CHA-103 DMN-2.1 c: only announces when a flag changes from the previous record', () => {
    const s = makeState()
    deploy(s)
    control(s, { west: 'A', north: 'A' })
    expect(summaries(refresh(s).events)).toHaveLength(1)
    s.phase = 'movement'
    expect(summaries(refresh(s).events)).toHaveLength(0) // same flags as the last record
    s.phase = 'shooting'
    control(s, { west: null, north: null })
    expect(summaries(refresh(s).events)).toHaveLength(1)
  })

  it('CHA-104 DMN-2.1 c, 2.5 b: the enemy deployment zone joins the Shadow only with half its markers controlled at phase start; an empty zone never qualifies', () => {
    const s = makeState()
    deploy(s)
    placeUnit(s, BL2, { x: -8, z: 12 }) // inside the Orks' zone
    expect(zoneObjectives(s, 'B')).toHaveLength(0)
    refresh(s)
    expect(shadowFlags(s, 'A').enemyZone).toBe(false)
    expect(unitInShadow(s, 'A', BL2)).toBe(false)

    // two markers in the Orks' zone
    for (const [id, x] of [['bz1', -6], ['bz2', 6]] as const) {
      s.objectives[id] = { ...structuredClone(s.objectives.west), id, pos: { x, z: 12 }, controller: null }
    }
    expect(zoneObjectives(s, 'B').map((o) => o.id).sort()).toEqual(['bz1', 'bz2'])
    expect(noMansLandObjectives(s).map((o) => o.id).sort()).toEqual(['east', 'north', 'south', 'west'])
    s.phase = 'movement'
    refresh(s)
    expect(shadowFlags(s, 'A').enemyZone).toBe(false)
    // control gained mid-phase takes effect at the next phase start
    control(s, { bz1: 'A' })
    expect(shadowFlags(s, 'A').enemyZone).toBe(false)
    s.phase = 'shooting'
    refresh(s)
    expect(shadowFlags(s, 'A').enemyZone).toBe(true)
    expect(unitInShadow(s, 'A', BL2)).toBe(true)
    // 1 of 3 markers is less than half
    s.objectives.bz3 = { ...structuredClone(s.objectives.west), id: 'bz3', pos: { x: 0, z: 13 }, controller: null }
    s.phase = 'charge'
    refresh(s)
    expect(shadowFlags(s, 'A').enemyZone).toBe(false)
  })

  it('CHA-113 DMN-3.2: Warp Locus - a marker within 3" of the bearer\'s base is in the Shadow, beyond 3" it is not; off the board there is no area', () => {
    const s = makeState('command', CDM({ enhancementId: 'cdm.e.warp-locus' }))
    deploy(s)
    refresh(s)
    const bearers = warpLocusBearers(s, 'A')
    expect(bearers).toHaveLength(1)
    expect(bearers[0].range).toBe(3)
    const khModel = s.models[bearers[0].modelId]
    const r = khModel.base.radius
    const north = s.objectives.north // (0, 6)
    expect(objectiveInShadow(s, 'A', north)).toBe(false)
    placeUnit(s, KH, [[0, 6 - r - 2.9]])
    expect(objectiveInShadow(s, 'A', north)).toBe(true)
    placeUnit(s, KH, [[0, 6 - r - 3.1]])
    expect(objectiveInShadow(s, 'A', north)).toBe(false)
    // model-level: an Ork 2.5" from him is in the area, one 4" away is not
    placeUnit(s, KH, [[0, 0]])
    placeUnit(s, BOYZ, [[0, r + 0.63 + 2.5]])
    expect(unitInShadow(s, 'A', BOYZ)).toBe(true)
    placeUnit(s, BOYZ, [[0, r + 0.63 + 4]])
    expect(unitInShadow(s, 'A', BOYZ)).toBe(false)
    // Reserves: no area
    s.units[KH].location = 'reserves'
    expect(warpLocusBearers(s, 'A')).toHaveLength(0)
    placeUnit(s, BOYZ, [[0, r + 0.63 + 1]])
    s.units[KH].location = 'reserves'
    expect(unitInShadow(s, 'A', BOYZ)).toBe(false)
  })

  it('CHA-117 DMN-4.2: objectiveInShadow - own zone markers, No Man\'s Land with control, enemy zone with control', () => {
    const s = makeState()
    deploy(s)
    s.objectives.own1 = { ...structuredClone(s.objectives.west), id: 'own1', pos: { x: 0, z: -12 } }
    s.objectives.foe1 = { ...structuredClone(s.objectives.west), id: 'foe1', pos: { x: 0, z: 12 }, controller: null }
    refresh(s)
    expect(objectiveInShadow(s, 'A', s.objectives.own1)).toBe(true)
    expect(objectiveInShadow(s, 'A', s.objectives.west)).toBe(false)
    expect(objectiveInShadow(s, 'A', s.objectives.foe1)).toBe(false)
    control(s, { west: 'A', north: 'A', east: 'A', foe1: 'A' })
    s.phase = 'movement'
    refresh(s)
    expect(objectiveInShadow(s, 'A', s.objectives.south)).toBe(true) // controlled or not: the whole area counts
    expect(objectiveInShadow(s, 'A', s.objectives.foe1)).toBe(true) // 1 of 1 enemy-zone markers controlled
    // the Orks have no Shadow: their own-zone marker does not matter to the ability
    expect(hasShadowOfChaos(s, 'B')).toBe(false)
  })

  it('CHA-103 DMN-2.4: the reducer refreshes the record at the start of every battle phase; a non-Daemon game writes no key', () => {
    const drive = (a: PlayerSetup, b: PlayerSetup): GameState => {
      let r = createGame(setupOf(a, b), 'cdm-r1', bundle)
      let guard = 0
      while (r.state.phase === 'deployment' && guard++ < 400) {
        const pending = r.state.pending as PendingDecision | null
        if (!pending) break
        const acts = legalActions(r.state, pending)
        if (!acts || acts.length === 0) break
        r = step(r.state, acts[0] as Action)
      }
      return r.state
    }
    const s = drive(CDM(), ORK())
    expect(s.phase).not.toBe('deployment')
    expect(SHADOW_KEYS(s, 'A')).toBe(true)
    expect(SHADOW_KEYS(s, 'B')).toBe(false)
    const o = drive(ORK(), ORK())
    expect(o.phase).not.toBe('deployment')
    expect(SHADOW_KEYS(o, 'A')).toBe(false)
    expect(SHADOW_KEYS(o, 'B')).toBe(false)
    expect(o.phaseState.marks.some((m) => m.startsWith('shadow:'))).toBe(false)
  })
})

function SHADOW_KEYS(s: GameState, p: PlayerId): boolean { return 'shadowOfChaos' in s.players[p].secondaryState }

// ===================================================================================================================
// E2 Battle-shock modifiers and after-effects
// ===================================================================================================================
describe('E2 Battle-shock modifiers (shadowBattleShockModifiers)', () => {
  it('CHA-105 DMN-2.2: +1 for a Daemon unit in its Shadow, nothing outside it', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    expect(shadowBattleShockModifiers(s, BL1)).toEqual([{ source: SHADOW_ID, value: 1 }])
    expect(shadowBattleShockModifiers(s, KH)).toEqual([{ source: SHADOW_ID, value: 1 }]) // either half of the attached unit
    placeUnit(s, BL2, { x: -8, z: 0 })
    expect(shadowBattleShockModifiers(s, BL2)).toEqual([])
  })

  it('CHA-109 DMN-2.3: an enemy unit in the Daemon Shadow tests at -1; outside it no modifier; the Orks themselves get nothing', () => {
    const s = makeState('command', CDM(), ORK(), 'B')
    deploy(s)
    placeUnit(s, BOYZ, { x: -8, z: -12 }) // in the Daemon deployment zone
    refresh(s)
    expect(shadowBattleShockModifiers(s, BOYZ)).toEqual([{ source: SHADOW_ID, value: -1 }])
    placeUnit(s, BOYZ, { x: -8, z: 12 })
    expect(shadowBattleShockModifiers(s, BOYZ)).toEqual([])
  })

  it('CHA-111 DMN-2.5 e: mirror match - a unit in both Shadows gets +1 and -1; each player keeps an independent Shadow', () => {
    const s = makeState('command', CDM(), CDM({ attachments: [] }))
    deploy(s)
    for (const u of Object.values(s.units)) if (u.player === 'B') placeUnit(s, u.id, { x: -8, z: 12 })
    control(s, { west: 'A', north: 'A', east: 'B', south: 'B' }) // each holds half of No Man's Land
    s.activePlayer = 'A'
    const c = ctxOf(s)
    refreshShadow(c.ctx)
    expect(shadowFlags(s, 'A').noMansLand).toBe(true)
    expect(shadowFlags(s, 'B').noMansLand).toBe(true)
    placeUnit(s, 'B:bloodletters-2', { x: -8, z: 0 })
    const mods = shadowBattleShockModifiers(s, 'B:bloodletters-2')
    expect(mods.map((m) => m.value).sort()).toEqual([-1, 1])
    expect(mods.reduce((n, m) => n + m.value, 0)).toBe(0)
    // a B unit in B's own zone only: +1; in A's zone only: -1
    expect(shadowBattleShockModifiers(s, 'B:bloodletters-1').map((m) => m.value)).toEqual([1])
    placeUnit(s, 'B:bloodletters-1', { x: -8, z: -12 })
    expect(shadowBattleShockModifiers(s, 'B:bloodletters-1').map((m) => m.value)).toEqual([-1])
  })
})

describe('E2 Daemonic Manifestation (BattleShockTested passed, own Shadow)', () => {
  const passed = (unitId: string, player: PlayerId = 'A') => ({ type: 'BattleShockTested' as const, unitId, roll: 9, ld: 7, passed: true, player })
  const failed = (unitId: string, player: PlayerId = 'A') => ({ type: 'BattleShockTested' as const, unitId, roll: 3, ld: 7, passed: false, player })

  it('CHA-106 DMN-2.2, 2.5 d: a passed test returns D3 destroyed BATTLELINE models at legal spots, never above Starting Strength', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    kill(s, BL1, 6)
    expect(s.units[BL1].models).toHaveLength(4)
    const { ctx, events } = ctxOf(s, [6]) // D3 = 3
    ctx.emit(passed(BL1))
    expect(s.units[BL1].models).toHaveLength(7)
    expect(s.units[BL1].destroyedModels).toHaveLength(3)
    expect(events.filter((e) => e.type === 'ModelReturned')).toHaveLength(3)
    for (const id of ids(s, BL1)) expect(s.models[id].woundsRemaining).toBe(modelStats(s, s.models[id]).W)
    expect(summaries(events).some((m) => m.startsWith('Daemonic Manifestation') && m.includes('3 models returned'))).toBe(true)

    // capped by Starting Strength: one model missing, D3 = 3 -> only one comes back
    const s2 = makeState()
    deploy(s2)
    refresh(s2)
    kill(s2, BL1, 1)
    const c2 = ctxOf(s2, [6])
    c2.ctx.emit(passed(BL1))
    expect(s2.units[BL1].models).toHaveLength(10)
    expect(c2.events.filter((e) => e.type === 'ModelReturned')).toHaveLength(1)
  })

  it('CHA-106 DMN-2.2: a failed test returns nothing', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    kill(s, BL1, 6)
    const { ctx, events } = ctxOf(s, []) // no dice may be rolled
    ctx.emit(failed(BL1))
    expect(s.units[BL1].models).toHaveLength(4)
    expect(events.filter((e) => e.type === 'ModelReturned')).toHaveLength(0)
  })

  it('CHA-106 DMN-2.2: outside the Shadow a passed test does nothing', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    placeUnit(s, BL1, { x: -8, z: 0 })
    placeUnit(s, KH, [[-8, 1.5]])
    kill(s, BL1, 6)
    const { ctx, events } = ctxOf(s, [])
    ctx.emit(passed(BL1))
    expect(s.units[BL1].models).toHaveLength(4)
    expect(events.filter((e) => e.type === 'ModelReturned')).toHaveLength(0)
  })

  it('CHA-107 DMN-2.2, 2.5 d: a non-BATTLELINE unit heals the most wounded model by D3, capped at W', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    const [m0, m1] = ids(s, CRUSH)
    const w = modelStats(s, s.models[m0]).W
    expect(w).toBe(4)
    s.models[m0].woundsRemaining = 1
    s.models[m1].woundsRemaining = 3
    const { ctx, events } = ctxOf(s, [6]) // D3 = 3
    ctx.emit(passed(CRUSH))
    expect(s.models[m0].woundsRemaining).toBe(4)
    expect(s.models[m1].woundsRemaining).toBe(3)
    const regained = events.filter((e) => e.type === 'WoundsRegained') as { amount: number; modelId: string }[]
    expect(regained).toHaveLength(1)
    expect(regained[0].amount).toBe(3)
    // capped: 3 of 4 wounds with D3 = 3 -> 1 wound
    const c2 = ctxOf(s, [6])
    c2.ctx.emit(passed(CRUSH))
    expect(s.models[m1].woundsRemaining).toBe(4)
    expect((c2.events.filter((e) => e.type === 'WoundsRegained') as { amount: number }[])[0].amount).toBe(1)
  })

  it('CHA-107 DMN-2.5 d: Kh\'har\'ret attached and wounded with no Bloodletters lost is healed; models lost take priority over healing', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    const kh = ids(s, KH)[0]
    const w = modelStats(s, s.models[kh]).W
    s.models[kh].woundsRemaining = 1
    const { ctx, events } = ctxOf(s, [6])
    ctx.emit(passed(BL1))
    expect(s.models[kh].woundsRemaining).toBe(Math.min(w, 4))
    expect((events.find((e) => e.type === 'WoundsRegained') as { modelId: string }).modelId).toBe(kh)
    // with a Bloodletter missing the BATTLELINE return comes first, Kh'har'ret is not healed
    kill(s, BL1, 1)
    const c2 = ctxOf(s, [6])
    c2.ctx.emit(passed(BL1))
    expect(s.units[BL1].models).toHaveLength(10)
    expect(s.models[kh].woundsRemaining).toBe(Math.min(w, 4))
  })

  it('CHA-108 DMN-2.4: a passed test with nothing to heal and nothing to return rolls no dice', () => {
    const s = makeState()
    deploy(s)
    refresh(s)
    const { ctx, events } = ctxOf(s, []) // ScriptedRng throws if a die is rolled
    expect(() => ctx.emit(passed(BL1))).not.toThrow()
    expect(events.filter((e) => e.type === 'DiceRolled')).toHaveLength(0)
  })

  it('CHA-108 DMN-2.4: Insane Bravery auto-passes the test inside the Shadow with no dice, and the pass still triggers Manifestation', () => {
    const s = makeState('command')
    deploy(s)
    s.players.A.cp = 3
    kill(s, BL2, 6) // 4 of 10 left: below half strength, so the Command phase tests it
    s.step = 'command'
    const { ctx, events } = ctxOf(s, [6]) // the only die rolled is the Manifestation D3 (= 3); a 2D6 test would run the script dry
    refreshShadow(ctx)
    expect(commandModule.advance(ctx)).toBe('pending')
    const p = s.pending as PendingDecision
    expect(p.kind).toBe('stratagemWindow')
    const use = legalActions(s, p)!.find((a) => a.type === 'useStratagem' && a.stratagemId === 'core.s.insane-bravery') as Action
    expect(use).toBeTruthy()
    s.pending = null
    expect(ctx.services.stratagems.handle(ctx, { ...use, decisionId: p.id } as Action, p)).toBeUndefined()
    expect(s.players.A.oncePerBattleUsed).toEqual(['core.s.insane-bravery'])
    expect(s.players.A.cp).toBe(3) // 3 + the Command phase CP - 1
    for (let i = 0; i < 10 && commandModule.advance(ctx) === 'pending' && s.pending; i++) {
      const q = s.pending as PendingDecision
      s.pending = null
      commandModule.handle(ctx, { ...(legalActions(s, q)![0] as Action), decisionId: q.id } as Action, q)
    }
    const tests = events.filter((e) => e.type === 'BattleShockTested') as { unitId: string; passed: boolean }[]
    expect(tests).toMatchObject([{ unitId: BL2, passed: true }])
    // the auto-pass rolled no 2D6; the single die is Manifestation's D3
    expect(events.filter((e) => e.type === 'DiceRolled')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'ModelReturned')).toHaveLength(3)
    expect(s.units[BL2].models).toHaveLength(7)
    expect(s.units[BL2].battleShocked).toBe(false)
  })
})

describe('E2 Daemonic Terror (BattleShockTested failed, enemy in the Daemon Shadow)', () => {
  const failed = (unitId: string, player: PlayerId = 'B') => ({ type: 'BattleShockTested' as const, unitId, roll: 3, ld: 7, passed: false, player })
  const passed = (unitId: string, player: PlayerId = 'B') => ({ type: 'BattleShockTested' as const, unitId, roll: 9, ld: 7, passed: true, player })

  function orksInDaemonZone(): GameState {
    const s = makeState('command', CDM(), ORK(), 'B')
    deploy(s)
    placeUnit(s, BOYZ, { x: -8, z: -12 })
    refresh(s)
    return s
  }

  it('CHA-109 DMN-2.3: a failed test suffers D3 mortal wounds, resolved at once', () => {
    const s = orksInDaemonZone()
    const before = woundsLeft(s, BOYZ)
    const { ctx, events } = ctxOf(s, [6]) // D3 = 3
    ctx.emit(failed(BOYZ))
    expect(s.pending?.kind).toBe('allocateAttack') // the Orks choose which models take the wounds
    settle(s, ctx)
    expect(woundsLeft(s, BOYZ)).toBe(before - 3)
    expect(s.phaseState.attack).toBeFalsy()
    expect(s.pending).toBeNull()
    expect(summaries(events).some((m) => m.startsWith('Daemonic Terror') && m.includes('3'))).toBe(true)
  })

  it('CHA-109 DMN-2.3: a passed test, or a unit outside the Shadow, suffers nothing', () => {
    const s = orksInDaemonZone()
    const before = s.units[BOYZ].models.length
    const c1 = ctxOf(s, [])
    c1.ctx.emit(passed(BOYZ))
    expect(s.units[BOYZ].models.length).toBe(before)
    placeUnit(s, BOYZ, { x: -8, z: 12 })
    c1.ctx.emit(failed(BOYZ))
    expect(s.pending).toBeNull()
    expect(s.units[BOYZ].models.length).toBe(before)
  })

  it('CHA-110 DMN-2.3, 2.5 f: Terror that destroys the unit credits no attacking model', () => {
    const s = orksInDaemonZone()
    const u = s.units[BOYZ]
    kill(s, BOYZ, u.models.length - 2)
    const { ctx, events } = ctxOf(s, [6])
    ctx.emit(failed(BOYZ))
    settle(s, ctx)
    expect(u.location).toBe('destroyed')
    const destroyed = events.find((e) => e.type === 'UnitDestroyed' && e.unitId === BOYZ) as { byModelId: string | null; byUnitId: string | null } | undefined
    expect(destroyed).toBeDefined()
    expect(destroyed!.byModelId).toBeNull()
    expect(destroyed!.byUnitId).toBeNull()
  })

  it('CHA-111 DMN-2.5 e: mirror match - a failed test inside the other Daemon player\'s Shadow suffers Terror from that player', () => {
    const s = makeState('command', CDM(), CDM({ attachments: [] }), 'B')
    deploy(s)
    for (const u of Object.values(s.units)) if (u.player === 'B') placeUnit(s, u.id, { x: -8, z: 12 })
    placeUnit(s, 'B:bloodletters-2', { x: -8, z: -12 }) // in A's zone
    refresh(s)
    const { ctx, events } = ctxOf(s, [6])
    ctx.emit({ type: 'BattleShockTested', unitId: 'B:bloodletters-2', roll: 3, ld: 7, passed: false, player: 'B' })
    settle(s, ctx)
    expect(s.units['B:bloodletters-2'].models).toHaveLength(7)
    const roll = events.find((e) => e.type === 'DiceRolled') as { roll: { purpose: string } } | undefined
    expect(roll?.roll.purpose).toBe('ability')
  })

  it('CHA-129 E1/E2: Drukhari Pain gain on a failed test still fires; Terror hits a Drukhari unit standing in the Daemon Shadow', () => {
    // A = Drukhari, B = Daemons: Drukhari kabalites fail in B's deployment zone -> Terror from B; B (no pool) gains nothing
    const s = makeState('command', DRK(), CDM({ attachments: [] }), 'A')
    for (const u of Object.values(s.units)) placeUnit(s, u.id, { x: -8, z: u.player === 'A' ? -12 : 12 })
    placeUnit(s, 'A:kabalites', { x: -8, z: 12 })
    const c = ctxOf(s, [6, 1, 1, 1, 1, 1, 1, 1, 1])
    refreshShadow(c.ctx)
    const before = woundsLeft(s, 'A:kabalites')
    c.ctx.emit({ type: 'BattleShockTested', unitId: 'A:kabalites', roll: 3, ld: 6, passed: false, player: 'A' })
    settle(s, c.ctx)
    expect(woundsLeft(s, 'A:kabalites')).toBe(before - 3)
    expect('painTokens' in s.players.B.secondaryState).toBe(false)
    // a Daemon unit failing in its own zone: no Terror, and the Drukhari opponent gains a Pain token
    placeUnit(s, 'B:bloodletters-1', { x: -8, z: 12 })
    const d = ctxOf(s, [])
    d.ctx.emit({ type: 'BattleShockTested', unitId: 'B:bloodletters-1', roll: 3, ld: 7, passed: false, player: 'B' })
    expect(s.units['B:bloodletters-1'].models).toHaveLength(10)
    expect(s.players.A.secondaryState.painTokens).toBe(1)
  })
})

describe('E2 Command phase drains Terror mortal wounds', () => {
  it('CHA-109 E2: the Command phase tests an Ork unit below half strength in the Daemon zone; Terror resolves before the phase moves on', () => {
    const s = makeState('command', CDM(), ORK(), 'B')
    deploy(s)
    placeUnit(s, BOYZ, { x: -8, z: -12 })
    kill(s, BOYZ, s.units[BOYZ].models.length - 4)
    const before = woundsLeft(s, BOYZ)
    s.step = 'command'
    const { ctx, events } = ctxOf(s, [1, 1, 6], noStrats()) // 2D6 = 2 (fail), D3 = 3
    refreshShadow(ctx)
    let r = commandModule.advance(ctx)
    // the Orks answer the mortal wound allocation; the Command phase module routes it to the attack sequence and carries on
    for (let i = 0; i < 20 && r === 'pending' && s.pending; i++) {
      const p = s.pending as PendingDecision
      const acts = legalActions(s, p)
      s.pending = null
      commandModule.handle(ctx, { ...(acts![0] as Action), decisionId: p.id } as Action, p)
      r = commandModule.advance(ctx)
    }
    expect(r).toBe('done')
    expect(woundsLeft(s, BOYZ)).toBe(before - 3)
    expect(s.phaseState.attack).toBeFalsy()
    expect(events.filter((e) => e.type === 'BattleShockTested')).toHaveLength(1)
    expect(s.units[BOYZ].battleShocked).toBe(true)
  })
})

describe('E1/E2 determinism', () => {
  it('CHA-129 E1/E2: the Shadow record and modifiers keep replay hashes deterministic', () => {
    const run = (): string => {
      let r = createGame(setupOf(CDM(), ORK()), 'cdm-hash', bundle)
      for (let i = 0; i < 16; i++) {
        const pending = r.state.pending as PendingDecision | null
        if (!pending) break
        const acts = legalActions(r.state, pending)
        if (!acts || acts.length === 0) break
        r = step(r.state, acts[0] as Action)
      }
      return r.state.hash
    }
    expect(run()).toBe(run())
  })
})
