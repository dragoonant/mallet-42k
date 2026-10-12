// Genestealer Cults engine change beyond code hooks (docs/spec/factions/genestealer-cults.md 7.1): the Cult Ambush lifecycle
// (roll + pool + marker placement, marker removal, the return in the opponent's Reinforcements step) and the
// MoveConstraints.mustTouch contract change, exercised with the real Combat Patrol data. The (b) code hooks are covered in
// genestealer-cults.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, advanceGame, checkPlacements, createContext, createGameState, emptyMoveConstraints, emptyPhaseState,
  horizontalGap, removeModel,
  type Action, type GameEvent, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import {
  CULT_AMBUSH_MARKER_RADIUS, answerCultAmbush, cultAmbushMarkerCandidates, cultAmbushOnMoveEnded, cultAmbushState, raisePendingCultAmbushMarker,
} from '../../src/engine/cult-ambush'
import { movementModule } from '../../src/engine/phases/movement'
import { chargeModule } from '../../src/engine/phases/charge'
import { fightModule } from '../../src/engine/phases/fight'
import { autoDeployPlacements } from '../../src/engine/setup'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GSC = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Genestealer Cults', faction: 'genestealer-cults', patrolId: 'gsc.cp.hand-of-the-magus', enhancementId: 'gsc.e.psionic-shield', secondaryId: 'gsc.sec.rise-up',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0,
})

const NEO_A = 'A:neophytes-a', NEO_B = 'A:neophytes-b', ACO = 'A:acolytes', ABB = 'A:aberrants', ROCK = 'A:rockgrinder', MAGUS = 'A:magus', BOYZ = 'B:boyz-a'

function makeState(round = 2, active: 'A' | 'B' = 'B', a: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GSC(a), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'gsc-core', ENGINE_VERSION)
  s.round = round
  s.activePlayer = active
  s.phase = 'movement'
  s.phaseState = emptyPhaseState()
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
const ctxOf = (s: GameState, dice: number[] = [], modules: ModuleTable = modulesWithStubs()) => createContext(s, new ScriptedRng(dice), modules)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

// kills every model of `unitId` and announces it the way the attack module does (the reducer emit interceptor reacts to it)
function destroy(ctx: ReturnType<typeof ctxOf>['ctx'], unitId: string): void {
  const s = ctx.state
  for (const id of [...s.units[unitId].models]) removeModel(s, id)
  ctx.emit({ type: 'UnitDestroyed', unitId, byPlayer: 'B', byUnitId: null, byModelId: null, kind: 'ranged', player: 'A' })
}

function answer(ctx: ReturnType<typeof ctxOf>['ctx'], optionId: string): void {
  const s = ctx.state
  const pending = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
  s.pending = null
  const action = { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action
  expect(answerCultAmbush(ctx, action, pending)).toBeUndefined()
}

// a marker + pool entry for player A, as if a Cult Ambush roll had succeeded earlier
function seedAmbush(s: GameState, pool: string[], markers: { x: number; z: number; source?: string }[]): void {
  const ca = cultAmbushState(s)
  ca.pool.A = [...pool]
  markers.forEach((m) => ca.markers.push({ id: `ca:${++ca.seq}`, player: 'A', pos: { x: m.x, y: 0, z: m.z }, placedRound: 1, sourceUnitId: m.source ?? NEO_A }))
}

// every board unit of both sides has already moved this phase and the Reinforcements step has no arrivals queued
function toReinforcements(s: GameState): void {
  s.step = 'reinforcements'
  s.phaseState.marks.push('mv:arriveQueue=[]')
}

describe('GEN-2.1 Cult Ambush roll, pool and marker decision', () => {
  it('GEN-002 GEN-2.1: destroyed Neophytes (BATTLELINE +3) always join the pool and raise a marker-placement chooseOption for the owner', () => {
    const s = makeState(1, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1])
    destroy(ctx, NEO_A)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(cultAmbushState(s).pool.A).toEqual([NEO_A])
    expect(raisePendingCultAmbushMarker(ctx)).toBe(true)
    const pending = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(pending.kind).toBe('chooseOption')
    expect(pending.player).toBe('A')
    expect(pending.context.topic).toBe('abilityChoice')
    expect(pending.context.data).toMatchObject({ code: 'cultAmbush', step: 'marker' })
    expect(pending.options.some((o) => o.id === 'decline')).toBe(true)
    expect(pending.options.some((o) => o.id.startsWith('pt:'))).toBe(true)
  })

  it('GEN-003 GEN-2.1: Acolytes (no BATTLELINE) fail on a 3 and succeed on a 4', () => {
    const s = makeState(1, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const fail = ctxOf(s, [3])
    destroy(fail.ctx, ACO)
    expect(cultAmbushState(s).pool.A).toEqual([])
    expect(raisePendingCultAmbushMarker(fail.ctx)).toBe(false)
    const s2 = makeState(1, 'B')
    placeUnit(s2, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const ok = ctxOf(s2, [4])
    destroy(ok.ctx, ACO)
    expect(cultAmbushState(s2).pool.A).toEqual([ACO])
    expect(raisePendingCultAmbushMarker(ok.ctx)).toBe(true)
  })

  it('GEN-004 GEN-2.1: Aberrants and the Rockgrinder have no Cult Ambush: no roll at all', () => {
    const s = makeState(1, 'B')
    const { ctx, events } = ctxOf(s, [6, 6])
    destroy(ctx, ABB)
    destroy(ctx, ROCK)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(cultAmbushState(s).pool.A).toEqual([])
    expect(cultAmbushState(s).pendingMarkers).toEqual([])
  })

  it('GEN-005 GEN-2.7: every offered marker point is wholly on the board and more than 9" from every enemy model; with no legal point there is no decision but the unit stays in the pool', () => {
    const s = makeState(1, 'B')
    placeUnit(s, BOYZ, { x: 0, z: 0, gap: 0.3 })
    const enemies = s.units[BOYZ].models.map((id) => s.models[id])
    const points = cultAmbushMarkerCandidates(s, 'A', NEO_A)
    expect(points.length).toBeGreaterThan(10)
    for (const p of points) {
      expect(Math.abs(p.x) + CULT_AMBUSH_MARKER_RADIUS).toBeLessThanOrEqual(22)
      expect(Math.abs(p.z) + CULT_AMBUSH_MARKER_RADIUS).toBeLessThanOrEqual(15)
      for (const e of enemies) expect(horizontalGap({ pos: p, facing: 0, base: { shape: 'round', radius: CULT_AMBUSH_MARKER_RADIUS } }, e)).toBeGreaterThan(9)
    }
    // enemies spread so that every grid point is within 9"
    const s2 = makeState(1, 'B')
    const boyz = s2.units[BOYZ].models
    const spots: [number, number][] = [[-14, -8], [-5, -8], [5, -8], [14, -8], [-14, 0], [-5, 0], [5, 0], [14, 0], [-14, 8], [-5, 8], [5, 8], [14, 8]]
    boyz.forEach((id, i) => { if (spots[i]) s2.models[id].pos = { x: spots[i][0], y: 0, z: spots[i][1] } })
    s2.units[BOYZ].location = 'board'
    const { ctx } = ctxOf(s2, [1])
    // add the remaining ork units so the board is fully covered
    destroy(ctx, NEO_A)
    if (cultAmbushMarkerCandidates(s2, 'A', NEO_A).length === 0) {
      expect(raisePendingCultAmbushMarker(ctx)).toBe(false)
      expect(cultAmbushState(s2).pool.A).toEqual([NEO_A])
    } else {
      // the board was not fully covered by the 10 boyz: force the same situation by dropping the candidate list through enemy spam
      for (const u of Object.values(s2.units).filter((u) => u.player === 'B')) {
        u.location = 'board'
        u.models.forEach((id, i) => { s2.models[id].pos = { x: -20 + ((i * 7) % 41), y: 0, z: -12 + ((i * 5) % 25) } })
      }
      const left = cultAmbushMarkerCandidates(s2, 'A', NEO_A)
      for (const p of left) for (const id of Object.values(s2.units).filter((u) => u.player === 'B').flatMap((u) => u.models)) {
        expect(horizontalGap({ pos: p, facing: 0, base: { shape: 'round', radius: CULT_AMBUSH_MARKER_RADIUS } }, s2.models[id])).toBeGreaterThan(9)
      }
    }
  })

  it('GEN-002 GEN-2.1: the reducer decision loop raises a queued marker placement before the phase module goes on', () => {
    const s = makeState(1, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    s.step = 'select'
    const { ctx } = ctxOf(s, [1])
    destroy(ctx, NEO_A)
    expect(s.pending).toBeNull()
    advanceGame(ctx, ctx.modules)
    expect(s.pending?.kind).toBe('chooseOption')
    expect((s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>).context.data).toMatchObject({ code: 'cultAmbush', step: 'marker' })
  })

  it('GEN-002 GEN-2.7: picking a point places the marker (pool unchanged); declining places none', () => {
    const s = makeState(1, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const { ctx } = ctxOf(s, [1, 5])
    destroy(ctx, NEO_A)
    raisePendingCultAmbushMarker(ctx)
    const first = (s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>).options.find((o) => o.id.startsWith('pt:'))!.id
    answer(ctx, first)
    const st = cultAmbushState(s)
    expect(st.markers).toHaveLength(1)
    expect(st.markers[0]).toMatchObject({ id: 'ca:1', player: 'A', sourceUnitId: NEO_A, placedRound: 1 })
    expect(st.pendingMarkers).toEqual([])
    expect(st.pool.A).toEqual([NEO_A])
    destroy(ctx, NEO_B)
    raisePendingCultAmbushMarker(ctx)
    answer(ctx, 'decline')
    expect(cultAmbushState(s).markers).toHaveLength(1)
    expect(cultAmbushState(s).pool.A).toEqual([NEO_A, NEO_B])
  })
})

describe('GEN-2.2 marker removal', () => {
  const unitAt = (s: GameState, gap: number): void => {
    // one ork 32 mm round base whose edge is `gap` inches from the marker edge
    placeUnit(s, BOYZ, { x: 20, z: 13, gap: 0 })
    const id = s.units[BOYZ].models[0]
    const r = s.models[id].base.radius
    s.units[BOYZ].location = 'board'
    s.models[id].pos = { x: CULT_AMBUSH_MARKER_RADIUS + gap + r, y: 0, z: 0 }
  }
  it('GEN-006 GEN-2.2: an enemy unit ending a move 8.9" from a marker removes it; 9.1" keeps it', () => {
    const s = makeState(2, 'B')
    seedAmbush(s, [NEO_A], [{ x: 0, z: 0 }])
    unitAt(s, 8.9)
    const { ctx, events } = ctxOf(s)
    cultAmbushOnMoveEnded(ctx, BOYZ)
    expect(cultAmbushState(s).markers).toHaveLength(0)
    expect(of(events, 'AbilityTriggered')).toHaveLength(1)
    const s2 = makeState(2, 'B')
    seedAmbush(s2, [NEO_A], [{ x: 0, z: 0 }])
    unitAt(s2, 9.1)
    const c2 = ctxOf(s2)
    cultAmbushOnMoveEnded(c2.ctx, BOYZ)
    expect(cultAmbushState(s2).markers).toHaveLength(1)
  })

  it('GEN-007 GEN-2.2: own units never remove a marker (Cult Ambush hook)', () => {
    const s = makeState(2, 'A')
    seedAmbush(s, [NEO_A], [{ x: 0, z: 0 }])
    placeUnit(s, NEO_B, [[1, 0]])
    const { ctx } = ctxOf(s)
    cultAmbushOnMoveEnded(ctx, NEO_B)
    expect(cultAmbushState(s).markers).toHaveLength(1)
  })

  // drives a phase module the way the reducer does: validate, clear pending, handle, advance
  function step(mod: typeof chargeModule | typeof fightModule, ctx: ReturnType<typeof ctxOf>['ctx'], action: Partial<Action>): void {
    if (!ctx.state.pending) mod.advance(ctx)
    const pending = ctx.state.pending as PendingDecision
    const full = { decisionId: pending.id, player: pending.player, ...action } as Action
    expect(mod.validate?.(ctx.state, full, pending) ?? null).toBeNull()
    ctx.state.pending = null
    expect(mod.handle(ctx, full, pending)).toBeUndefined()
    mod.advance(ctx)
  }
  // x (>= fromX, moving +x) at which model `mover` is exactly `want` inches (edge to edge) from `fixed`, found by bisection
  const xAtGap = (mover: GameState['models'][string], fixed: { pos: { x: number; y: number; z: number }; facing: number; base: GameState['models'][string]['base'] }, want: number, lo: number, hi: number, dir: 1 | -1): number => {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const g = horizontalGap({ pos: { x: mid, y: 0, z: 0 }, facing: mover.facing, base: mover.base }, fixed)
      if ((g > want) === (dir === 1)) hi = mid; else lo = mid
    }
    return (lo + hi) / 2
  }
  // the marker sits on the -x side, `want` inches from the boyz' final position
  const markerAt = (s: GameState, bm: GameState['models'][string], finalX: number, want: number): void => {
    const R = CULT_AMBUSH_MARKER_RADIUS
    const fixed = { pos: { x: finalX, y: 0, z: 0 }, facing: bm.facing, base: bm.base }
    const x = xAtGap({ facing: 0, base: { shape: 'round', radius: R } } as never, fixed, want, finalX - 40, finalX, -1)
    seedAmbush(s, [NEO_A], [{ x, z: 0 }])
  }
  // single-model orks (B) and one cult Neophyte (A) on the x axis; every other unit is out of the picture
  function duel(phaseName: 'charge' | 'fight', gap: number): { s: GameState } {
    const s = makeState(2, 'B')
    s.phase = phaseName
    s.phaseState = emptyPhaseState()
    for (const u of Object.values(s.units)) if (u.id !== BOYZ && u.id !== NEO_B) u.location = 'destroyed'
    for (const id of [BOYZ, NEO_B]) for (const mid of s.units[id].models.slice(1)) removeModel(s, mid)
    const nm = s.models[s.units[NEO_B].models[0]], bm = s.models[s.units[BOYZ].models[0]]
    s.units[NEO_B].location = 'board'; s.units[BOYZ].location = 'board'
    nm.pos = { x: 0, y: 0, z: 0 }
    bm.pos = { x: nm.base.radius + bm.base.radius + gap, y: 0, z: 0 }
    return { s }
  }

  it('GEN-007 GEN-2.2: a real enemy charge move that ends 8.5" from a marker removes it (it was farther away before the move)', () => {
    const { s } = duel('charge', 5)
    const nm = s.models[s.units[NEO_B].models[0]], bm = s.models[s.units[BOYZ].models[0]]
    const contactX = xAtGap(bm, { pos: nm.pos, facing: nm.facing, base: nm.base }, 0.005, 0, 10, 1)
    markerAt(s, bm, contactX, 8.5)
    expect(cultAmbushState(s).markers).toHaveLength(1)
    const { ctx } = ctxOf(s, [3, 3])
    chargeModule.enter(ctx)
    step(chargeModule, ctx, { type: 'chooseUnitToActivate', unitId: BOYZ })
    step(chargeModule, ctx, { type: 'declareCharge', unitId: BOYZ, targetUnitIds: [NEO_B] })
    expect(cultAmbushState(s).markers).toHaveLength(1) // declaring and rolling move nothing
    expect(s.pending?.kind).toBe('chargeMove')
    step(chargeModule, ctx, { type: 'chargeMove', unitId: BOYZ, placements: [{ modelId: bm.id, pos: { x: contactX, y: 0, z: 0 } }] })
    expect(s.units[BOYZ].turn.chargedThisTurn).toBe(true)
    expect(cultAmbushState(s).markers).toHaveLength(0)
  })

  it('GEN-007 GEN-2.2: a real consolidate that ends 8.6" from a marker removes it, while the earlier pile-in (no movement, 9.5") does not', () => {
    const { s } = duel('fight', 0.9)
    const nm = s.models[s.units[NEO_B].models[0]], bm = s.models[s.units[BOYZ].models[0]]
    const contactX = xAtGap(bm, { pos: nm.pos, facing: nm.facing, base: nm.base }, 0.005, 0, 10, 1)
    markerAt(s, bm, bm.pos.x, 9.5)
    const { ctx } = ctxOf(s, Array(200).fill(1))
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: 'B', counterOffensive: false }
    fightModule.enter(ctx)
    let consolidated = false
    for (let i = 0; i < 300 && !consolidated; i++) {
      if (!s.pending) fightModule.advance(ctx)
      const p = s.pending as PendingDecision | null
      if (!p) break
      if (p.kind === 'consolidate' && p.context.unitId === BOYZ) {
        expect(cultAmbushState(s).markers).toHaveLength(1) // pile-in, fighting and the other unit's moves did not remove it
        step(fightModule, ctx, { type: 'consolidate', unitId: BOYZ, placements: [{ modelId: bm.id, pos: { x: contactX, y: 0, z: 0 } }] })
        consolidated = true
      } else if (p.kind === 'chooseFightUnit') step(fightModule, ctx, { type: 'chooseFightUnit', unitId: p.context.eligible[0] })
      else if (p.kind === 'pileIn' || p.kind === 'consolidate') step(fightModule, ctx, { type: p.kind, unitId: p.context.unitId, placements: [] })
      else if (p.kind === 'declareTargets') {
        const targets = p.context.weapons.filter((w) => w.legalTargets.length > 0).map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: w.legalTargets[0] }))
        step(fightModule, ctx, { type: 'declareTargets', unitId: p.context.unitId, targets })
      } else if (p.kind === 'chooseOption') step(fightModule, ctx, { type: 'chooseOption', optionId: p.options[0]?.id ?? 'keep' })
      else step(fightModule, ctx, { type: 'pass' })
    }
    expect(consolidated).toBe(true)
    expect(cultAmbushState(s).markers).toHaveLength(0)
  })

  it('GEN-006 GEN-2.2: AIRCRAFT never remove a marker', () => {
    const s = makeState(2, 'B')
    seedAmbush(s, [NEO_A], [{ x: 0, z: 0 }])
    unitAt(s, 3)
    const { ctx } = ctxOf(s)
    s.units[BOYZ].location = 'board'
    const dsId = s.units[BOYZ].datasheetId
    s.datasheets = { ...s.datasheets, [dsId]: { ...s.datasheets[dsId], keywords: [...s.datasheets[dsId].keywords, 'AIRCRAFT'] } }
    cultAmbushOnMoveEnded(ctx, BOYZ)
    expect(cultAmbushState(s).markers).toHaveLength(1)
  })
})

describe('GEN-2.3 to 2.6 the return', () => {
  // the board: Orks (active, round 2) hold a far corner; the cult player (A) has one marker at (0, 0)
  function returnState(round = 2, markers: { x: number; z: number; source?: string }[] = [{ x: 0, z: 0 }], pool: string[] = [NEO_A]): GameState {
    const s = makeState(round, 'B')
    placeUnit(s, BOYZ, { x: 4, z: 13, gap: 0.1 })
    for (const u of Object.values(s.units)) if (u.id !== BOYZ) u.location = 'destroyed' // every other unit is out of the picture (no stranded-Reserves culls)
    for (const id of pool) for (const mid of [...s.units[id].models]) removeModel(s, mid)
    seedAmbush(s, pool, markers)
    toReinforcements(s)
    return s
  }

  it('GEN-008 GEN-2.3: after the active player\'s reinforcements the opponent is offered a return per marker; the unit comes back at full strength touching the marker, >9" from enemies, marker consumed', () => {
    const s = returnState()
    const { ctx, events } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    let pending = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(pending.player).toBe('A')
    expect(pending.context.data).toMatchObject({ code: 'cultAmbush', step: 'return' })
    expect(pending.options.map((o) => o.id)).toEqual([`unit:${NEO_A}`, 'decline'])
    answer(ctx, `unit:${NEO_A}`)
    expect(cultAmbushState(s).markers).toHaveLength(0)
    expect(cultAmbushState(s).pool.A).toEqual([])
    expect(movementModule.advance(ctx)).toBe('pending')
    const arrival = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(arrival.kind).toBe('deployUnit')
    expect(arrival.player).toBe('A')
    expect(arrival.context.reservesAllowed).toEqual([])
    expect(arrival.constraints?.mustTouch).toMatchObject({ radius: CULT_AMBUSH_MARKER_RADIUS })
    expect(arrival.constraints?.minDistanceFromEnemies).toBe(9)
    const copyId = arrival.context.unitIds[0]
    expect(copyId).toBe(`${NEO_A}~1`)
    const legal = movementModule.legalActions!(s, arrival) as Action[]
    expect(legal.length).toBeGreaterThan(0)
    const good = legal[0] as Extract<Action, { type: 'deployUnit' }>
    expect(good.toReserves).toBeFalsy()
    expect(good.placements).toHaveLength(10)
    expect(movementModule.validate!(s, good, arrival)).toBeNull()
    // the return must be set up now: it can never be parked in Reserves (it would later Deep Strike outside Cult Ambush timing)
    const park = { type: 'deployUnit', player: 'A', decisionId: arrival.id, unitId: copyId, placements: [], toReserves: true } as Action
    expect(movementModule.validate!(s, park, arrival)).toMatchObject({ code: 'E_NOT_AN_OPTION' })
    expect(legal.every((a) => !(a as { toReserves?: boolean }).toReserves)).toBe(true)
    s.pending = null
    expect(movementModule.handle(ctx, good, arrival)).toBeUndefined()
    const copy = s.units[copyId]
    expect(copy.location).toBe('board')
    expect(copy.models).toHaveLength(10)
    expect(copy.attachedLeaderId).toBeNull()
    for (const id of copy.models) {
      const m = s.models[id]
      expect(m.woundsRemaining).toBe(s.datasheets[copy.datasheetId].models.find((p) => p.modelId === m.datasheetModelId)!.stats.W)
      for (const e of s.units[BOYZ].models) expect(horizontalGap(m, s.models[e])).toBeGreaterThan(9)
    }
    const marker = { pos: { x: 0, y: 0, z: 0 }, facing: 0, base: { shape: 'round' as const, radius: CULT_AMBUSH_MARKER_RADIUS } }
    expect(copy.models.some((id) => horizontalGap(s.models[id], marker) <= 0.05 + 1e-6)).toBe(true)
    expect(of(events, 'ReinforcementsArrived').some((e) => e.unitId === copyId && e.via === 'deepStrike')).toBe(true)
    // step finishes without another decision
    expect(movementModule.advance(ctx)).toBe('done')
    pending = s.pending as never
  })

  it('GEN-009 GEN-2.3: a placement with no model touching the marker is rejected; mustTouch is also enforced by checkPlacements', () => {
    const s = returnState()
    const { ctx } = ctxOf(s)
    movementModule.advance(ctx)
    answer(ctx, `unit:${NEO_A}`)
    movementModule.advance(ctx)
    const arrival = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const good = (movementModule.legalActions!(s, arrival) as Action[])[0] as Extract<Action, { type: 'deployUnit' }>
    const shifted: Action = { ...good, placements: good.placements.map((p) => ({ ...p, pos: { ...p.pos, x: p.pos.x - 6 } })) }
    expect(movementModule.validate!(s, shifted, arrival)).toMatchObject({ code: 'E_NOT_AN_OPTION' })
    expect(movementModule.validate!(s, good, arrival)).toBeNull()
    // the geometry check alone
    const models = good.placements.map((p) => s.models[p.modelId])
    const touching = checkPlacements({
      unitModels: models, placements: good.placements, otherFriendly: [], enemies: [], board: s.board,
      constraints: emptyMoveConstraints(9999, { coherency: false, mustTouch: { pos: { x: 0, y: 0, z: 0 }, radius: CULT_AMBUSH_MARKER_RADIUS } }),
    })
    expect(touching.rejection).toBeNull()
    const apart = checkPlacements({
      unitModels: models, placements: good.placements, otherFriendly: [], enemies: [], board: s.board,
      constraints: emptyMoveConstraints(9999, { coherency: false, mustTouch: { pos: { x: 15, y: 0, z: 0 }, radius: CULT_AMBUSH_MARKER_RADIUS } }),
    })
    expect(apart.rejection?.code).toBe('E_NOT_AN_OPTION')
    // autoDeployPlacements seeds the first model tangent to the marker
    const auto = autoDeployPlacements(models, [{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: 15 }, { x: -22, z: 15 }], [], [], { mustTouch: { pos: { x: -10, y: 0, z: 5 }, radius: CULT_AMBUSH_MARKER_RADIUS } })
    expect(auto).not.toBeNull()
    expect(emptyMoveConstraints(1).mustTouch).toBeNull()
  })

  it('GEN-010 GEN-2.4: declining keeps the marker and the pool entry, and the return is offered again in the next opponent Movement phase', () => {
    const s = returnState()
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    answer(ctx, 'decline')
    expect(movementModule.advance(ctx)).toBe('done')
    expect(cultAmbushState(s).markers).toHaveLength(1)
    expect(cultAmbushState(s).pool.A).toEqual([NEO_A])
    // the next Movement phase of the opponent (round 3, fresh phase marks)
    s.round = 3
    s.phaseState = emptyPhaseState()
    toReinforcements(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    expect((s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>).context.data).toMatchObject({ step: 'return' })
  })

  it('GEN-011 GEN-2.3: nothing is offered in the owner\'s own Movement phase', () => {
    const s = returnState()
    s.activePlayer = 'A'
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('done')
    expect(s.pending).toBeNull()
  })

  it('GEN-012 GEN-2.4: two markers and one pooled unit give one return; a pooled unit may use a marker another unit made', () => {
    const s = returnState(2, [{ x: 0, z: 0, source: NEO_B }, { x: -12, z: -8, source: NEO_B }])
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    answer(ctx, `unit:${NEO_A}`)
    expect(movementModule.advance(ctx)).toBe('pending')
    const arrival = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const good = (movementModule.legalActions!(s, arrival) as Action[])[0]
    s.pending = null
    expect(movementModule.handle(ctx, good, arrival)).toBeUndefined()
    expect(movementModule.advance(ctx)).toBe('done')
    expect(s.pending).toBeNull()
    expect(cultAmbushState(s).markers).toHaveLength(1)
  })

  it('GEN-013 GEN-2.5: Magus-led Neophytes destroyed together: only the 10 Neophytes enter the pool, unled; the Magus gets no roll', () => {
    const s = makeState(1, 'B', { attachments: [{ leaderRef: 'magus', bodyguardRef: 'neophytes-a' }] })
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1, 6])
    destroy(ctx, MAGUS)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    destroy(ctx, NEO_A)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(cultAmbushState(s).pool.A).toEqual([NEO_A])
    expect(s.units[MAGUS].location).toBe('destroyed')
  })

  it('GEN-014 GEN-2.5: the returned copy is a new unit that rolls Cult Ambush again when destroyed', () => {
    const s = returnState()
    const { ctx, events } = ctxOf(s, [2])
    movementModule.advance(ctx)
    answer(ctx, `unit:${NEO_A}`)
    movementModule.advance(ctx)
    const arrival = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const good = (movementModule.legalActions!(s, arrival) as Action[])[0]
    s.pending = null
    movementModule.handle(ctx, good, arrival)
    const copyId = `${NEO_A}~1`
    expect(copyId).not.toBe(NEO_A)
    s.activePlayer = 'B'
    s.phase = 'shooting'
    destroy(ctx, copyId)
    expect(of(events, 'DiceRolled').length).toBeGreaterThanOrEqual(1)
    expect(cultAmbushState(s).pool.A).toEqual([copyId])
  })

  it('GEN-015 GEN-2.5: spent One Shot weapons stay spent on the returned unit; unspent ones are still available', () => {
    const s = makeState(2, 'B')
    placeUnit(s, BOYZ, { x: 4, z: 13, gap: 0.1 })
    for (const u of Object.values(s.units)) if (u.id !== BOYZ) u.location = 'destroyed'
    const ids = [...s.units[ACO].models]
    const withOneShot = ids.filter((id) => s.models[id].weapons.some((w) => w.toLowerCase().includes('demolition')))
    expect(withOneShot.length).toBeGreaterThan(0)
    const weapon = s.models[withOneShot[0]].weapons.find((w) => w.toLowerCase().includes('demolition'))!
    s.models[withOneShot[0]].oneShotUsed = [weapon]
    const originalIndex = ids.indexOf(withOneShot[0])
    for (const id of ids) removeModel(s, id)
    s.units[ACO].location = 'destroyed'
    seedAmbush(s, [ACO], [{ x: 0, z: 0 }])
    toReinforcements(s)
    const { ctx } = ctxOf(s)
    movementModule.advance(ctx)
    answer(ctx, `unit:${ACO}`)
    const copy = s.units[`${ACO}~1`]
    expect(copy.models).toHaveLength(ids.length)
    expect(s.models[copy.models[originalIndex]].oneShotUsed).toEqual([weapon])
    copy.models.forEach((id, i) => { if (i !== originalIndex) expect(s.models[id].oneShotUsed).toEqual([]) })
  })

  it('GEN-016 GEN-2.6: in battle round 4 no return is offered even with markers and pool units', () => {
    const s = returnState(4)
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('done')
    expect(s.pending).toBeNull()
    expect(cultAmbushState(s).pool.A).toEqual([NEO_A])
  })

  it('GEN-017 GEN-2.6: a unit destroyed in round 4 still rolls but raises no marker decision; the same holds in round 3 after the opponent\'s last Reinforcements step', () => {
    const s = makeState(4, 'B')
    placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1])
    destroy(ctx, NEO_A)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(raisePendingCultAmbushMarker(ctx)).toBe(false)
    // round 3: the opponent (B) is the second player and its turn is over the Reinforcements step -> no marker
    const late = makeState(3, 'B')
    late.firstPlayer = 'A'
    late.phase = 'shooting'
    placeUnit(late, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const l = ctxOf(late, [1])
    destroy(l.ctx, NEO_A)
    expect(raisePendingCultAmbushMarker(l.ctx)).toBe(false)
    // round 3, the opponent's Movement phase still ahead -> marker offered
    const early = makeState(3, 'A')
    early.firstPlayer = 'A'
    early.phase = 'shooting'
    placeUnit(early, BOYZ, { x: 10, z: 8, gap: 0.3 })
    const e = ctxOf(early, [1])
    destroy(e.ctx, NEO_A)
    expect(raisePendingCultAmbushMarker(e.ctx)).toBe(true)
  })
})
