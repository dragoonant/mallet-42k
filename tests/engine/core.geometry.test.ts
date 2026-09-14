// engine/core geometry: base-to-base measurement, engagement range, coherency, wholly within, placements (12-checklist MEAS-*)
import { describe, expect, it } from 'vitest'
import {
  basesOverlap, checkPlacements, distance, emptyMoveConstraints, hashState, horizontalGap, isCoherent, objectiveDistance,
  pathEntersEngagement, pathLength, pivotCost, samplePath, setModelPos, unitsWithinEngagementRange, verticalGap, whollyOnBoard,
  whollyWithinOf, whollyWithinPolygon, within, withinEngagementRange, withinObjectiveRange,
  type Model,
} from '../../src/engine'
import { bundle, deployAll, footprint, freshState, makeEngine, makeSetup, model, pingPhases, placeUnit, row, scriptedModule } from '../fixtures'

const D32 = 32 / 25.4 // base diameter in inches

describe('engine/core measurement', () => {
  it('MEAS-001 two 32 mm bases with centres 2.26" apart → distance 1.00" edge to edge', () => {
    expect(distance(footprint(0, 0), footprint(2.26, 0))).toBeCloseTo(1.0, 2)
    expect(distance(footprint(0, 0), footprint(0, 2.26))).toBeCloseTo(1.0, 2)
  })

  it('MEAS-002 32 mm vs 60 mm base, centres 5" apart → 3.19"', () => {
    expect(distance(footprint(0, 0, 32), footprint(5, 0, 60))).toBeCloseTo(3.19, 2)
    expect(distance(footprint(5, 0, 60), footprint(0, 0, 32))).toBeCloseTo(3.19, 2)
  })

  it('MEAS-003 bases overlapping horizontally on different floors, Δy 3" → horizontal gap 0, plain distance 3"', () => {
    const a = footprint(0, 0, 32, 0), b = footprint(0.5, 0, 32, 3)
    expect(horizontalGap(a, b)).toBe(0)
    expect(verticalGap(a, b)).toBe(3)
    expect(distance(a, b)).toBeCloseTo(3, 6)
    expect(basesOverlap(a, b)).toBe(false)
    expect(basesOverlap(a, footprint(0.5, 0, 32, 0))).toBe(true)
  })

  it('MEAS-004 horizontal gap 1.0", Δy 0 → within engagement range', () => {
    expect(withinEngagementRange(footprint(0, 0), footprint(D32 + 1.0, 0))).toBe(true)
  })

  it('MEAS-005 horizontal gap 1.01" → not within engagement range', () => {
    expect(withinEngagementRange(footprint(0, 0), footprint(D32 + 1.01, 0))).toBe(false)
  })

  it('MEAS-006 horizontal gap 0.5", Δy 5.0" → within ER; Δy 5.01" → not', () => {
    expect(withinEngagementRange(footprint(0, 0, 32, 0), footprint(D32 + 0.5, 0, 32, 5.0))).toBe(true)
    expect(withinEngagementRange(footprint(0, 0, 32, 0), footprint(D32 + 0.5, 0, 32, 5.01))).toBe(false)
  })

  it('MEAS-007 only one model pair within ER → both units are within ER of each other', () => {
    const unitA = row('A:u', 3, 0, 0, 0.5)
    const unitB = row('B:u', 3, 0, 0, 0.5).map((m, i) => ({ ...m, pos: { ...m.pos, z: i === 2 ? D32 + 0.9 : 12 } }))
    expect(unitsWithinEngagementRange(unitA, unitB)).toBe(true)
    expect(unitsWithinEngagementRange(unitB, unitA)).toBe(true)
    const far = unitB.map((m) => ({ ...m, pos: { ...m.pos, z: 12 } }))
    expect(unitsWithinEngagementRange(unitA, far)).toBe(false)
  })

  it('MEAS-008 Normal move ending with a model 0.9" from an enemy → E_ENGAGEMENT (helper and reducer)', () => {
    const grunts = row('A:g', 2, 2, 0, 0.5)
    const enemy = [model('B:e#0', 'B:e', 10, 0)]
    const bad = checkPlacements({
      unitModels: grunts, enemies: enemy, otherFriendly: [], board: { w: 44, h: 30 },
      constraints: emptyMoveConstraints(6, { mustEndOutsideEngagement: true }),
      placements: [{ modelId: 'A:g#0', pos: { x: 10 - D32 - 0.9, y: 0, z: 0 } }, { modelId: 'A:g#1', pos: { x: 10 - D32 - 0.9 - D32 - 0.5, y: 0, z: 0 } }],
    })
    expect(bad.rejection?.code).toBe('E_ENGAGEMENT')
    const good = checkPlacements({
      unitModels: grunts, enemies: enemy, otherFriendly: [], board: { w: 44, h: 30 },
      constraints: emptyMoveConstraints(6, { mustEndOutsideEngagement: true }),
      placements: [{ modelId: 'A:g#0', pos: { x: 10 - D32 - 1.1, y: 0, z: 0 } }, { modelId: 'A:g#1', pos: { x: 10 - D32 - 1.1 - D32 - 0.5, y: 0, z: 0 } }],
    })
    expect(good.rejection).toBeNull()

    // through the reducer: a module raises moveUnit and validates with checkPlacements
    const mover = scriptedModule('command', {
      advance(ctx) {
        if (ctx.marked('asked')) return 'done'
        ctx.once('asked')
        ctx.decide({ kind: 'moveUnit', player: 'A', window: 'movement.start', canPass: false, context: { unitId: 'A:grunts', moveType: 'normal', advanceRoll: null }, constraints: emptyMoveConstraints(6, { mustEndOutsideEngagement: true }) })
        return 'pending'
      },
      validate(state, action, pending) {
        if (action.type !== 'moveUnit' || pending.kind !== 'moveUnit') return null
        const r = checkPlacements({
          unitModels: state.units['A:grunts'].models.map((id) => state.models[id]),
          enemies: Object.values(state.models).filter((m) => m.unitId.startsWith('B:') && state.units[m.unitId].location === 'board'),
          otherFriendly: [], board: state.board, constraints: pending.constraints, placements: action.placements,
        })
        return r.rejection
      },
      handle() { /* accepted */ },
    })
    const engine = makeEngine({ phases: { ...pingPhases(), command: mover } })
    // board: grunts in a row from x = -10 at z = -12, the Blu mob in a row from x = 3
    const base = deployAll(engine, engine.createGame(makeSetup(), 'meas8', bundle)).final.state
    const state = structuredClone(base)
    placeUnit(state, 'A:grunts', { x: -10, z: -12 })
    placeUnit(state, 'B:mob', { x: 3, z: -12, gap: 0.3 })
    const id = state.pending!.id
    const move = (x: number) => engine.step(state, { type: 'moveUnit', player: 'A', decisionId: id, unitId: 'A:grunts', placements: [{ modelId: 'A:grunts#4', pos: { x, y: 0, z: -12 } }] })
    const gruntX = state.models['A:grunts#4'].pos.x
    const target = 3 - D32 - 0.9
    const rejected = move(target)
    expect(rejected.rejection?.code).toBe('E_ENGAGEMENT')
    expect(rejected.state).toBe(state)
    expect(state.models['A:grunts#4'].pos.x).toBe(gruntX)
    const tooFar = move(gruntX + 6.1)
    expect(tooFar.rejection?.code).toBe('E_OUT_OF_RANGE')
    const accepted = move(gruntX + 1)
    expect(accepted.rejection).toBeUndefined()
  })

  it('MEAS-009 5-model unit with one model 2.1" horizontally from all others → not coherent, move rejected E_COHERENCY', () => {
    const models = row('A:g', 5, 0, 0, 1.5)
    models[4] = { ...models[4], pos: { ...models[4].pos, x: models[3].pos.x + D32 + 2.1 } }
    expect(isCoherent(models)).toBe(false)
    const r = checkPlacements({
      unitModels: row('A:g', 5, 0, 0, 1.5), enemies: [], otherFriendly: [], board: { w: 44, h: 30 }, constraints: emptyMoveConstraints(6),
      placements: [{ modelId: 'A:g#4', pos: models[4].pos }],
    })
    expect(r.rejection?.code).toBe('E_COHERENCY')
  })

  it('MEAS-010 5-model chain, each within 2" of exactly one neighbour → coherent', () => {
    expect(isCoherent(row('A:g', 5, 0, 0, 1.9))).toBe(true)
    expect(isCoherent(row('A:g', 5, 0, 0, 2.0))).toBe(true)
  })

  it('MEAS-011 10-model unit, one model within 2" of only one other → not coherent (needs two)', () => {
    const chain = row('B:m', 10, 0, 0, 1.9)
    expect(isCoherent(chain)).toBe(false)
    // a 10-model blob where everyone has two neighbours is coherent
    const blob: Model[] = []
    for (let i = 0; i < 10; i++) blob.push(model(`B:m#${i}`, 'B:m', (i % 5) * (D32 + 0.5), Math.floor(i / 5) * (D32 + 0.5)))
    expect(isCoherent(blob)).toBe(true)
  })

  it('MEAS-012 unit reduced to 6 models, chain with one neighbour each → coherent', () => {
    expect(isCoherent(row('B:m', 6, 0, 0, 1.9))).toBe(true)
    expect(isCoherent(row('B:m', 7, 0, 0, 1.9))).toBe(false)
  })

  it('MEAS-013 model 1.5" horizontally but 5.5" vertically from all others → not coherent', () => {
    const models = row('A:g', 3, 0, 0, 1.5)
    models[2] = { ...models[2], pos: { ...models[2].pos, y: 5.5 } }
    expect(isCoherent(models)).toBe(false)
    models[2] = { ...models[2], pos: { ...models[2].pos, y: 5.0 } }
    expect(isCoherent(models)).toBe(true)
  })

  it('MEAS-015 wholly within 3" of X: one base edge point at 3.1" → not wholly within', () => {
    const origin = { x: 0, y: 0, z: 0 }
    const r = D32 / 2
    expect(whollyWithinOf(footprint(3.1 - r, 0), origin, 3)).toBe(false)
    expect(whollyWithinOf(footprint(2.9 - r, 0), origin, 3)).toBe(true)
    expect(within(footprint(3.1 - r, 0), footprint(0, 0), 3)).toBe(true)
    const zone = [{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: -10 }, { x: -22, z: -10 }]
    expect(whollyWithinPolygon(footprint(0, -11), zone)).toBe(true)
    expect(whollyWithinPolygon(footprint(0, -10.2), zone)).toBe(false)
    expect(whollyOnBoard(footprint(21.5, 0), { w: 44, h: 30 })).toBe(false)
    expect(whollyOnBoard(footprint(21.3, 0), { w: 44, h: 30 })).toBe(true)
  })

  it('MEAS-020 positions round-trip through hashing with 1/1000" rounding → identical hash', () => {
    const s1 = freshState(), s2 = freshState()
    setModelPos(s1.models['A:grunts#0'], { x: 1.23441, y: 0, z: -2.00061 })
    setModelPos(s2.models['A:grunts#0'], { x: 1.23439, y: 0, z: -2.00059 })
    expect(s1.models['A:grunts#0'].pos).toEqual({ x: 1.234, y: 0, z: -2.001 })
    expect(hashState(s1)).toBe(hashState(s2))
    setModelPos(s2.models['A:grunts#0'], { x: 1.2355, y: 0, z: -2.001 })
    expect(hashState(s1)).not.toBe(hashState(s2))
  })

  it('MEAS-022 measure queries agree with the range checks to 1/1000" and work on any view', () => {
    const engine = makeEngine({ phases: pingPhases() })
    const s = structuredClone(engine.createGame(makeSetup(), 'meas22', bundle).state)
    placeUnit(s, 'A:grunts', { x: 0, z: -12 })
    placeUnit(s, 'B:mob', { x: 0, z: 0 })
    const a = s.models['A:grunts#0'], b = s.models['B:mob#0']
    const d = distance(a, b)
    expect(d).toBeCloseTo(12 - D32, 3)
    expect(within(a, b, d - 0.0011)).toBe(false)
    expect(within(a, b, d + 0.0011)).toBe(true)
    const viewB = engine.view(s, 'B').state
    expect(distance(viewB.models['A:grunts#0'], viewB.models['B:mob#0'])).toBe(d)
    const obj = s.objectives['obj-s'] // (0, -6)
    const od = objectiveDistance(a, obj)
    expect(od.h).toBeCloseTo(6 - D32 / 2 - 40 / 25.4 / 2, 3)
    expect(withinObjectiveRange(a, obj)).toBe(false)
    setModelPos(a, { x: 0, y: 0, z: -6 - 40 / 25.4 / 2 - D32 / 2 - 2.99 })
    expect(withinObjectiveRange(a, obj)).toBe(true)
  })

  it('pivot cost and path length follow R-5.2 / R-5.7 / R-5.8', () => {
    expect(pivotCost({ shape: 'round', radius: 0.63 }, ['INFANTRY'])).toBe(0)
    expect(pivotCost({ shape: 'oval', radius: 1.18, radius2: 0.69 }, ['VEHICLE', 'FLY'])).toBe(2)
    expect(pivotCost({ shape: 'oval', radius: 1.18, radius2: 0.69 }, ['INFANTRY'])).toBe(1)
    const climb = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 3, z: 0 }, { x: 6, y: 0, z: 0 }]
    expect(pathLength(climb)).toBeCloseTo(12, 6)
    expect(pathLength(climb, true)).toBeCloseTo(2 * Math.hypot(3, 3), 6)
    expect(samplePath([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], 0.25)).toHaveLength(5)
    const enemy = [model('B:e#0', 'B:e', 3, 0)]
    expect(pathEntersEngagement(footprint(0, 0), [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 6 }], enemy)).toBe(false)
    expect(pathEntersEngagement(footprint(0, 0), [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }], enemy)).toBe(true)
  })

  it('oval bases measure edge to edge along the facing axis', () => {
    const kopta = footprint(0, 0, 60, 0, 0, 35) // major axis along x
    expect(distance(kopta, footprint(60 / 25.4 / 2 + D32 / 2 + 1, 0))).toBeCloseTo(1, 2)
    expect(distance(kopta, footprint(0, 35 / 25.4 / 2 + D32 / 2 + 1))).toBeCloseTo(1, 2)
    expect(basesOverlap(kopta, footprint(0.5, 0))).toBe(true)
    expect(basesOverlap(kopta, footprint(2.5, 0))).toBe(false)
  })
})
