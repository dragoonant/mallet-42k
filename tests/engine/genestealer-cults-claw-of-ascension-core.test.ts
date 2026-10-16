// Genestealer Cults, Claw of Ascension: engine change (c) of docs/spec/factions/genestealer-cults--claw-of-ascension.md 7.1 -
// the parameter-driven Cult Ambush variant (early-round bonus, first return round, 3" return region, One Shot reset, Reserves cull).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, horizontalGap, removeModel,
  type Action, type GameEvent, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import {
  CULT_AMBUSH_MARKER_RADIUS, DEFAULT_CULT_AMBUSH_PARAMS, answerCultAmbush, cultAmbushParams, cultAmbushReturnRegion, cultAmbushState, raisePendingCultAmbushMarker,
} from '../../src/engine/cult-ambush'
import { movementModule } from '../../src/engine/phases/movement'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GSC = (): PlayerSetup => ({
  name: 'Genestealer Cults', faction: 'genestealer-cults', patrolId: 'gsc.cp.claw-of-ascension', enhancementId: 'gsc.e.priority-kill-order',
  secondaryId: 'gsc.sec.infiltration-agenda', attachments: [], reserves: [], battleReadyVp: 0,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const META_A = 'A:metamorphs-a', META_B = 'A:metamorphs-b', JACK = 'A:jackals', RIDGE = 'A:ridgerunner', SHANUS = 'A:shanus', BOYZ = 'B:boyz-a'

function makeState(round: number, active: 'A' | 'B' = 'B'): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GSC(), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'cla-core', ENGINE_VERSION)
  s.round = round
  s.activePlayer = active
  s.phase = 'movement'
  s.phaseState = emptyPhaseState()
  return s
}
function modules(): ModuleTable {
  return {
    ...DEFAULT_MODULES,
    services: {
      ...DEFAULT_MODULES.services,
      stratagems: recordingStratagems(),
      los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    },
  }
}
const ctxOf = (s: GameState, dice: number[] = []) => createContext(s, new ScriptedRng(dice), modules())
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function destroy(ctx: ReturnType<typeof ctxOf>['ctx'], unitId: string): void {
  const s = ctx.state
  for (const id of [...s.units[unitId].models]) removeModel(s, id)
  ctx.emit({ type: 'UnitDestroyed', unitId, byPlayer: 'B', byUnitId: null, byModelId: null, kind: 'ranged', player: 'A' })
}
function answer(ctx: ReturnType<typeof ctxOf>['ctx'], optionId: string): void {
  const s = ctx.state
  const pending = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
  s.pending = null
  expect(answerCultAmbush(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action, pending)).toBeUndefined()
}
function returnState(round: number, markers: { x: number; z: number }[] = [{ x: 0, z: 0 }], pool: string[] = [META_A]): GameState {
  const s = makeState(round, 'B')
  placeUnit(s, BOYZ, { x: 4, z: 13, gap: 0.1 })
  for (const u of Object.values(s.units)) if (u.id !== BOYZ) u.location = 'destroyed'
  for (const id of pool) for (const mid of [...s.units[id].models]) removeModel(s, mid)
  const ca = cultAmbushState(s)
  ca.pool.A = [...pool]
  markers.forEach((m) => ca.markers.push({ id: `ca:${++ca.seq}`, player: 'A', pos: { x: m.x, y: 0, z: m.z }, placedRound: 1, sourceUnitId: META_B }))
  s.step = 'reinforcements'
  s.phaseState.marks.push('mv:arriveQueue=[]')
  return s
}

describe('Claw Cult Ambush roll (CLA-2.1)', () => {
  it('CLA-003 CLA-2.1: Metamorphs destroyed in round 2 with D6 = 4 -> total 5 -> pool + marker decision; D6 = 3 -> lost', () => {
    const s = makeState(2, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const ok = ctxOf(s, [4])
    destroy(ok.ctx, META_A)
    expect(cultAmbushState(s).pool.A).toEqual([META_A])
    expect(raisePendingCultAmbushMarker(ok.ctx)).toBe(true)
    const s2 = makeState(2, 'B')
    placeUnit(s2, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const bad = ctxOf(s2, [3])
    destroy(bad.ctx, META_A)
    expect(cultAmbushState(s2).pool.A).toEqual([])
    expect(raisePendingCultAmbushMarker(bad.ctx)).toBe(false)
  })

  it('CLA-004 CLA-2.1: Metamorphs destroyed in round 3 with D6 = 4 -> lost (no bonus); D6 = 5 -> pool', () => {
    const s = makeState(3, 'B')
    s.firstPlayer = 'B'
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    destroy(ctxOf(s, [4]).ctx, META_A)
    expect(cultAmbushState(s).pool.A).toEqual([])
    const s2 = makeState(3, 'B')
    s2.firstPlayer = 'B'
    placeUnit(s2, BOYZ, { x: 10, z: 8, gap: 0.3 })
    destroy(ctxOf(s2, [5]).ctx, META_A)
    expect(cultAmbushState(s2).pool.A).toEqual([META_A])
  })

  it('CLA-005 CLA-2.1: Atalan Jackals, Shanus and the Ridgerunner destroyed -> no Cult Ambush roll', () => {
    const s = makeState(2, 'B')
    const { ctx, events } = ctxOf(s, [6, 6, 6])
    for (const id of [JACK, SHANUS, RIDGE]) destroy(ctx, id)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(cultAmbushState(s).pool.A).toEqual([])
  })

  it('CLA-011 CLA-2.5: Metamorphs destroyed in round 4 -> roll made; on success no marker decision, never returns', () => {
    const s = makeState(4, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [6])
    destroy(ctx, META_A)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(raisePendingCultAmbushMarker(ctx)).toBe(false)
  })
})

describe('Claw Cult Ambush return (CLA-2.3 to 2.5)', () => {
  it('CLA-006 CLA-2.3: the return region is the 3 inch circle round the marker; a model 3.2 inches beyond the marker edge is rejected, a legal set-up accepted', () => {
    const s = returnState(2)
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    answer(ctx, `unit:${META_A}`)
    expect(movementModule.advance(ctx)).toBe('pending')
    const arrival = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(arrival.constraints.region).not.toBeNull()
    const good = (movementModule.legalActions!(s, arrival) as Action[])[0] as Extract<Action, { type: 'deployUnit' }>
    expect(good).toBeDefined()
    const models = good.placements.map((p) => ({ ...s.models[p.modelId], pos: p.pos }))
    const marker = { pos: { x: 0, y: 0, z: 0 }, facing: 0, base: { shape: 'round' as const, radius: CULT_AMBUSH_MARKER_RADIUS } }
    expect(Math.min(...models.map((m) => horizontalGap(m, marker)))).toBeLessThan(0.05)
    for (const m of models) expect(Math.hypot(m.pos.x, m.pos.z) + Math.max(m.base.radius, m.base.radius2 ?? 0)).toBeLessThanOrEqual(3 + CULT_AMBUSH_MARKER_RADIUS + 1e-6)
    const bad: Action = { ...good, placements: good.placements.map((p, i) => (i === good.placements.length - 1 ? { ...p, pos: { x: CULT_AMBUSH_MARKER_RADIUS + 3.2 + 0.7, y: 0, z: 0 } } : p)) }
    expect(movementModule.validate!(s, bad, arrival)).not.toBeNull()
    s.pending = null
    expect(movementModule.handle(ctx, good, arrival)).toBeUndefined()
    expect(s.units[`${META_A}~1`].location).toBe('board')
  })

  it('CLA-007 CLA-2.3: marker 1 inch from a board edge: the return region and the offered placements stay on the board', () => {
    const s = makeState(2, 'B')
    const hw = s.board.w / 2
    const region = cultAmbushReturnRegion(s, { x: hw - 1, y: 0, z: 0 }, 3)
    expect(region.length).toBeGreaterThan(3)
    expect(Math.max(...region.map((p) => p.x))).toBeCloseTo(hw, 6)
    const full = cultAmbushReturnRegion(s, { x: 0, y: 0, z: 0 }, 3)
    expect(Math.max(...full.map((p) => p.x))).toBeLessThanOrEqual(3 + CULT_AMBUSH_MARKER_RADIUS + 1e-9)
    const s2 = returnState(2, [{ x: hw - 1, z: 0 }])
    const { ctx } = ctxOf(s2)
    movementModule.advance(ctx)
    answer(ctx, `unit:${META_A}`)
    movementModule.advance(ctx)
    const arrival = s2.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const good = (movementModule.legalActions!(s2, arrival) as Action[])[0] as Extract<Action, { type: 'deployUnit' }>
    for (const p of good.placements) expect(p.pos.x).toBeLessThan(hw)
  })

  it('CLA-008 CLA-2.4: the returned Metamorphs are a new 5-model unit at full wounds with oneShotUsed empty (resetOneShot)', () => {
    const s = returnState(2)
    expect(cultAmbushParams(s, s.units[META_A]).resetOneShot).toBe(true)
    const dm = s.units[META_A].destroyedModels![0]
    dm.oneShotUsed = ['spent']
    const { ctx } = ctxOf(s)
    movementModule.advance(ctx)
    answer(ctx, `unit:${META_A}`)
    const copy = s.units[`${META_A}~1`]
    expect(copy.models).toHaveLength(5)
    for (const mid of copy.models) expect(s.models[mid].oneShotUsed).toEqual([])
  })

  it('CLA-009 CLA-2.5: a pool unit and marker made in round 1 get no return offer in round 1; offered in round 2', () => {
    const s = returnState(1)
    expect(movementModule.advance(ctxOf(s).ctx)).toBe('done')
    expect(s.pending).toBeNull()
    const s2 = returnState(2)
    expect(movementModule.advance(ctxOf(s2).ctx)).toBe('pending')
    expect((s2.pending as Extract<PendingDecision, { kind: 'chooseOption' }>).options.map((o) => o.id)).toContain(`unit:${META_A}`)
  })

  it('CLA-010 CLA-2.5: a Claw pool unit still waiting when round-3 reinforcements end is lost in Reserves, counted once more, no re-roll, pool empty', () => {
    const s = returnState(3)
    s.firstPlayer = 'A'
    s.activePlayer = 'B'
    cultAmbushState(s).markers = []
    const { ctx, events } = ctxOf(s, [6, 6])
    expect(movementModule.advance(ctx)).toBe('done')
    expect(of(events, 'UnitLostInReserves')).toHaveLength(1)
    expect(of(events, 'UnitDestroyed').filter((e) => e.unitId.startsWith(META_A))).toHaveLength(1)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(cultAmbushState(s).pool.A).toEqual([])
  })
})

describe('Hand of the Magus regression', () => {
  it('CLA-012 CLA-2: the Hand variant keeps its defaults (+3 BATTLELINE, 4+, round-1 return allowed, One Shot carried over)', () => {
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
      players: { A: { ...GSC(), patrolId: 'gsc.cp.hand-of-the-magus', enhancementId: 'gsc.e.psionic-shield', secondaryId: 'gsc.sec.rise-up' }, B: ORK() },
    }
    const s = createGameState(setup, bundle, 'cla-hand', ENGINE_VERSION)
    expect(cultAmbushParams(s, s.units['A:neophytes-a'])).toMatchObject({ battlelineBonus: 3, success: 4, firstRound: 1, lastRound: 3, whollyWithin: null, resetOneShot: false, poolIsReserves: false, earlyRoundBonus: 0 })
    expect(DEFAULT_CULT_AMBUSH_PARAMS.whollyWithin).toBeNull()
  })
})
