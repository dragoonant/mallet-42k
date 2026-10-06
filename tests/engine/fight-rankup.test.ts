// Pile-in rank-up scenarios (R-9.5 / R-9.6, docs/spec/12-rules-test-checklist.md FIGHT-RANK-*). Each scenario puts a
// charging unit in front of an enemy line, asks the engine for its offered pile-in candidates (the same
// `fightModule.legalActions` list the UI shows, first entry = the default "Pile in"), applies the first one, and counts
// the models that may then attack: within Engagement Range of an enemy, or in base contact with a unit-mate that is
// itself in base contact with an enemy. That count is compared with a geometric estimate of how many models could
// have reached such a spot with a 3" move.
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, createGameState, removeModel, type GameState, type Model, type PendingDecision, type Vec3 } from '../../src/engine'
import { ENGAGEMENT_H, EPS, emptyMoveConstraints, horizontalGap, inBaseContact } from '../../src/engine/geometry'
import { fightModule } from '../../src/engine/phases/fight'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit } from '../fixtures'

const A = 'A:grunts' // 5 models, 32mm
const B = 'B:mob' // 10 models, 32mm
const MM = 25.4

function fresh(): GameState {
  return createGameState(makeSetup({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }), bundle, 'seed', ENGINE_VERSION)
}

function setBase(state: GameState, modelId: string, mm: number) {
  state.models[modelId].base = { shape: 'round', radius: mm / MM / 2 }
}

function boardModels(state: GameState, unitId: string): Model[] {
  return state.units[unitId].models.map((id) => state.models[id]).filter((m) => m && m.woundsRemaining > 0)
}

// R-9.6 attack eligibility over final positions
function eligibleCount(models: Model[], enemies: Model[]): number {
  const touching = new Set(models.filter((m) => enemies.some((e) => inBaseContact(m, e))).map((m) => m.id))
  return models.filter((m) => enemies.some((e) => horizontalGap(m, e) <= ENGAGEMENT_H + EPS)
    || models.some((f) => f.id !== m.id && touching.has(f.id) && inBaseContact(m, f))).length
}

// geometric estimate of models that can clearly reach a fighting spot: within ER of an enemy on its own, or following a
// unit-mate who can reach base contact (covering the unit-mate's approach plus the gap between them). SLACK keeps out
// models that could only make it if every move lined up perfectly (paths are rarely collinear).
const SLACK = 0.1
function reachableMax(models: Model[], enemies: Model[], dist = 3): number {
  const gapTo = (m: Model) => Math.min(...enemies.map((e) => horizontalGap(m, e)))
  return models.filter((m) => gapTo(m) <= dist + ENGAGEMENT_H - SLACK
    || models.some((f) => f.id !== m.id && gapTo(f) <= dist && gapTo(f) + horizontalGap(m, f) <= dist - SLACK)).length
}

interface Result { offered: number; eligibleFirst: number; eligibleBestOffered: number; reachable: number }

function measure(state: GameState, unitId: string, enemyUnitId: string | string[]): Result {
  const player = state.units[unitId].player
  state.units[unitId].turn.chargedThisTurn = true
  const pending = {
    id: '', kind: 'pileIn', player, window: 'fight.unitSelected', canPass: false,
    context: { unitId, distance: 3 }, constraints: emptyMoveConstraints(3, { coherency: true }),
  } as unknown as PendingDecision
  const enemies = (Array.isArray(enemyUnitId) ? enemyUnitId : [enemyUnitId]).flatMap((id) => boardModels(state, id))
  const before = boardModels(state, unitId)
  const reachable = reachableMax(before, enemies)
  const actions = fightModule.legalActions!(state, pending) ?? []
  expect(actions.length).toBeGreaterThan(0)
  const counts = actions.map((a) => {
    expect(fightModule.validate!(state, a, pending)).toBeNull() // every offered candidate stays legal
    const moved = new Map<string, Vec3>(((a as { placements: { modelId: string; pos: Vec3 }[] }).placements).map((p) => [p.modelId, p.pos]))
    const finals = before.map((m) => ({ ...m, pos: moved.get(m.id) ?? m.pos }))
    return eligibleCount(finals, enemies)
  })
  return { offered: actions.length, eligibleFirst: counts[0], eligibleBestOffered: Math.max(...counts), reachable }
}

// enemy line of 5 grunts along z at x = ex, 32mm bases with `gap`" between edges, centred on z = cz
function enemyLine(state: GameState, ex: number, cz: number, gap = 0.6): Vec3[] {
  const d = 32 / MM
  const pts = [0, 1, 2, 3, 4].map((i) => ({ x: ex, y: 0, z: cz + (i - 2) * (d + gap) }))
  placeUnit(state, A, pts)
  return pts
}

const LOG = process.env.RANK_LOG === '1'
function report(name: string, r: Result) {
  if (LOG) console.log(`[rank] ${name}: first=${r.eligibleFirst} best=${r.eligibleBestOffered} reachable=${r.reachable} offered=${r.offered}`)
}

describe('fight phase — pile-in rank-up maximises fighting models (FIGHT-RANK-002..007)', () => {
  it('FIGHT-RANK-002 ten-model unit in two ranks piles into a five-model line: every model that can reach a fighting spot gets one', () => {
    const s = fresh()
    const ex = -12, cz = -8
    enemyLine(s, ex, cz)
    const r = 16 / MM, d = 2 * r, er = 16 / MM
    const front = [0.9, 1.5, 1.2, 1.0, 1.4] // gaps to the line
    const back = [0.5, 1.2, 2.5, 0.8, 1.8] // gap behind the front rank
    const pos: Vec3[] = []
    for (let i = 0; i < 5; i++) pos.push({ x: ex - er - r - front[i], y: 0, z: cz + (i - 2) * (d + 0.6) })
    for (let i = 0; i < 5; i++) pos.push({ x: pos[i].x - d - back[i], y: 0, z: pos[i].z + 0.3 })
    placeUnit(s, B, pos)
    const res = measure(s, B, A)
    report('FIGHT-RANK-002', res)
    expect(res.eligibleFirst).toBe(res.eligibleBestOffered)
    expect(res.eligibleFirst).toBeGreaterThanOrEqual(res.reachable)
  })

  it('FIGHT-RANK-003 seven models on mixed 25/28.5/32/40mm bases rank up behind whichever unit-mate touches the enemy', () => {
    const s = fresh()
    const ex = -12, cz = -8
    enemyLine(s, ex, cz)
    for (const id of s.units[B].models.slice(7)) removeModel(s, id)
    const sizes = [40, 32, 28.5, 25, 32, 40, 28.5]
    s.units[B].models.forEach((id, i) => setBase(s, id, sizes[i]))
    const er = 16 / MM
    const rad = sizes.map((mm) => mm / MM / 2)
    const pos: Vec3[] = [
      { x: ex - er - rad[0] - 1.1, y: 0, z: cz - 2.6 },
      { x: ex - er - rad[1] - 0.8, y: 0, z: cz - 0.2 },
      { x: ex - er - rad[2] - 1.6, y: 0, z: cz + 2.2 },
      { x: ex - er - rad[3] - 1.3, y: 0, z: cz + 4.4 },
    ]
    pos.push({ x: pos[0].x - rad[0] - rad[4] - 0.9, y: 0, z: cz - 1.8 })
    pos.push({ x: pos[1].x - rad[1] - rad[5] - 1.6, y: 0, z: cz + 0.9 })
    pos.push({ x: pos[2].x - rad[2] - rad[6] - 2.2, y: 0, z: cz + 3.0 })
    placeUnit(s, B, pos)
    const res = measure(s, B, A)
    report('FIGHT-RANK-003', res)
    expect(res.eligibleFirst).toBe(res.eligibleBestOffered)
    expect(res.eligibleFirst).toBeGreaterThanOrEqual(res.reachable)
  })

  it('FIGHT-RANK-004 enemy standing in a curved arc: models fan into the arc and the rest rank up behind them', () => {
    const s = fresh()
    const cx = -9, cz = -8, R = 5
    // arc bulging away from the attackers (concave side faces them), spanning ~±50°
    const arc: Vec3[] = [-50, -25, 0, 25, 50].map((deg) => ({ x: cx - R * Math.cos((deg * Math.PI) / 180), y: 0, z: cz + R * Math.sin((deg * Math.PI) / 180) }))
    placeUnit(s, A, arc)
    for (const id of s.units[B].models.slice(8)) removeModel(s, id)
    const r = 16 / MM, d = 2 * r
    const pos: Vec3[] = []
    for (let i = 0; i < 4; i++) pos.push({ x: cx - R - 2 * r - 1.3 - (i % 2) * 0.4, y: 0, z: cz + (i - 1.5) * (d + 0.5) })
    for (let i = 0; i < 4; i++) pos.push({ x: pos[i].x - d - 0.6 - i * 0.5, y: 0, z: pos[i].z + 0.2 })
    placeUnit(s, B, pos)
    const res = measure(s, B, A)
    report('FIGHT-RANK-004', res)
    expect(res.eligibleFirst).toBe(res.eligibleBestOffered)
    expect(res.eligibleFirst).toBeGreaterThanOrEqual(res.reachable)
  })

  it('FIGHT-RANK-005 a unit whose charge stopped every front model at the 0.99" edge still closes to base contact so the back rank can join', () => {
    const s = fresh()
    const ex = -12, cz = -8
    enemyLine(s, ex, cz)
    for (const id of s.units[B].models.slice(8)) removeModel(s, id)
    const r = 16 / MM, d = 2 * r
    const pos: Vec3[] = []
    for (let i = 0; i < 4; i++) pos.push({ x: ex - 2 * r - 0.99, y: 0, z: cz + (i - 1.5) * (d + 0.6) })
    for (let i = 0; i < 4; i++) pos.push({ x: pos[i].x - d - 1.0, y: 0, z: pos[i].z })
    placeUnit(s, B, pos)
    const res = measure(s, B, A)
    report('FIGHT-RANK-005', res)
    expect(res.eligibleFirst).toBe(res.eligibleBestOffered)
    expect(res.eligibleFirst).toBeGreaterThanOrEqual(res.reachable)
  })

  it('FIGHT-RANK-006 models that already touch the enemy anchor the second rank too', () => {
    const s = fresh()
    const ex = -12, cz = -8
    enemyLine(s, ex, cz)
    for (const id of s.units[B].models.slice(6)) removeModel(s, id)
    const r = 16 / MM, d = 2 * r
    const zs = [cz - (d + 0.6), cz, cz + (d + 0.6)]
    const pos: Vec3[] = [
      { x: ex - 2 * r, y: 0, z: zs[0] }, // touching
      { x: ex - 2 * r, y: 0, z: zs[1] }, // touching
      { x: ex - 2 * r - 0.7, y: 0, z: zs[2] },
      { x: ex - 4 * r - 0.5, y: 0, z: zs[0] + 0.2 },
      { x: ex - 4 * r - 1.6, y: 0, z: zs[1] - 0.1 },
      { x: ex - 4 * r - 2.4, y: 0, z: zs[1] + 0.9 },
    ]
    placeUnit(s, B, pos)
    const res = measure(s, B, A)
    report('FIGHT-RANK-006', res)
    expect(res.eligibleFirst).toBe(res.eligibleBestOffered)
    expect(res.eligibleFirst).toBeGreaterThanOrEqual(res.reachable)
  })

  it('FIGHT-RANK-007 a narrow enemy front: back-rank models left behind on the first pass get a second try behind any touching model', () => {
    const s = fresh()
    const ex = -12, cz = -8
    // only two enemy models present in front (others far away out of reach)
    placeUnit(s, A, [{ x: ex, y: 0, z: cz - 0.7 }, { x: ex, y: 0, z: cz + 0.7 }, { x: 18, y: 0, z: 12 }, { x: 19.5, y: 0, z: 12 }, { x: 18, y: 0, z: 13.5 }])
    for (const id of s.units[B].models.slice(7)) removeModel(s, id)
    const r = 16 / MM, d = 2 * r
    const pos: Vec3[] = []
    for (let i = 0; i < 4; i++) pos.push({ x: ex - 2 * r - 1.2, y: 0, z: cz + (i - 1.5) * (d + 0.4) })
    for (let i = 0; i < 3; i++) pos.push({ x: pos[i].x - d - 0.8 - i * 0.4, y: 0, z: pos[i].z + 0.6 })
    placeUnit(s, B, pos)
    const res = measure(s, B, A)
    report('FIGHT-RANK-007', res)
    expect(res.eligibleFirst).toBe(res.eligibleBestOffered)
    expect(res.eligibleFirst).toBeGreaterThanOrEqual(res.reachable)
  })

  it('FIGHT-RANK-008 two ranks of five 0.9" from a six-model line: all ten fight (front steps straight in, back steps up behind)', () => {
    // the ?scenario=pile-in layout (all 32mm), moved 6" south so no fixture terrain is nearby
    const s = fresh()
    const dz = -6
    for (const id of s.units[B].models) setBase(s, id, 32)
    for (const id of [...s.units[A].models, ...s.units['A:boss'].models]) setBase(s, id, 32)
    const ex = [-3.65, -2.19, -0.73, 0.73, 2.19, 3.65]
    placeUnit(s, A, ex.slice(0, 5).map((x) => ({ x, y: 0, z: dz })))
    placeUnit(s, 'A:boss', [{ x: ex[5], y: 0, z: dz }])
    const xs = [-2.82, -1.41, 0, 1.41, 2.82]
    placeUnit(s, B, [...xs.map((x) => ({ x, y: 0, z: dz + 2.16 })), ...xs.map((x) => ({ x, y: 0, z: dz + 4.02 }))])
    const res = measure(s, B, [A, 'A:boss'])
    report('FIGHT-RANK-008', res)
    expect(res.reachable).toBe(10)
    expect(res.eligibleFirst).toBe(10)
  })
})
