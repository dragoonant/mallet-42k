// Adversarial verification for los.ts / terrain.ts (docs/spec/10-rules-core.md §3; checklist LOS-*).
// Each test targets a suspected fidelity gap; names carry the checklist id they refine.
import { describe, expect, it } from 'vitest'
import {
  createGameState, ENGINE_VERSION, modelIdFor, setModelPos,
  type GameState, type ModelId, type UnitId,
} from '../../src/engine'
import { losService } from '../../src/engine/los'
import { withBundle } from '../fixtures/bundle'
import { makeSetup } from '../fixtures/setup'
import type { TerrainPieceData, WallData, WallGap } from '../../src/data/types'

function wall(a: { x: number; z: number }, b: { x: number; z: number }, height: number, gap?: WallGap): WallData {
  return { a, b, height, ...(gap ? { gaps: [gap] } : {}) }
}
function rect(cx: number, cz: number, hx: number, hz: number) {
  return [{ x: cx - hx, z: cz - hz }, { x: cx + hx, z: cz - hz }, { x: cx + hx, z: cz + hz }, { x: cx - hx, z: cz + hz }]
}
function squareRuin(id: string, cx: number, cz: number, opts: { size?: number; height?: number; south?: WallGap; north?: WallGap; noWalls?: boolean; floor?: number } = {}): TerrainPieceData {
  const s = opts.size ?? 3, h = opts.height ?? 6
  const [sw, se, ne, nw] = rect(cx, cz, s, s)
  const walls = opts.noWalls ? [] : [wall(sw, se, h, opts.south), wall(se, ne, h), wall(ne, nw, h, opts.north), wall(nw, sw, h)]
  return {
    id, kind: 'ruin', pos: { x: 0, z: 0 }, rot: 0, footprint: [sw, se, ne, nw], height: h, traits: ['obscuring', 'cover'] as never, walls,
    ...(opts.floor !== undefined ? { floors: [{ polygon: [sw, se, ne, nw], height: opts.floor }] } : {}),
  } as TerrainPieceData
}
function crate(id: string, cx: number, cz: number, hx: number, hz: number, height: number): TerrainPieceData {
  return { id, kind: 'crate', pos: { x: 0, z: 0 }, rot: 0, footprint: rect(cx, cz, hx, hz), height, traits: ['cover'] as never }
}
function barricade(id: string, cx: number, z: number, halfLen: number, height = 1.5): TerrainPieceData {
  return {
    id, kind: 'barricade', pos: { x: 0, z: 0 }, rot: 0, footprint: rect(cx, z, halfLen, 0.25), height, traits: ['cover'] as never,
    walls: [wall({ x: cx - halfLen, z }, { x: cx + halfLen, z }, height)],
  }
}
function forest(id: string, cx: number, cz: number, hx: number, hz: number): TerrainPieceData {
  return { id, kind: 'forest', pos: { x: 0, z: 0 }, rot: 0, footprint: rect(cx, cz, hx, hz), height: 5, traits: ['cover'] as never }
}

function stateWithPieces(pieces: TerrainPieceData[]): GameState {
  const bundle = withBundle((b) => {
    b.terrainLayouts['terrain.los'] = { id: 'terrain.los', board: { w: 4000, h: 4000 }, pieces }
    b.missions['mission.test'] = { ...b.missions['mission.test'], board: { w: 4000, h: 4000 }, terrainLayouts: ['terrain.los'] }
  })
  const state = createGameState(makeSetup({ terrainLayoutId: 'terrain.los' }), bundle, 'los-verify', ENGINE_VERSION)
  let i = 0
  for (const unit of Object.values(state.units)) {
    unit.location = 'board'
    for (const mid of unit.models) { setModelPos(state.models[mid], { x: -9000 + i * 10, y: 0, z: -9000 }); i++ }
  }
  return state
}
const id = (u: UnitId, n: number): ModelId => modelIdFor(u, n)
const A = { boss: () => id('A:boss', 0), grunt: (n: number) => id('A:grunts', n), walker: () => id('A:walker', 0) }
const B = { warboss: () => id('B:warboss', 0), mob: (n: number) => id('B:mob', n) }
const put = (s: GameState, m: ModelId, x: number, y: number, z: number) => setModelPos(s.models[m], { x, y, z })

describe('verify: cover attribution to the specific terrain piece (§3.2 "because of it")', () => {
  it('LOS-022-attrib a VEHICLE obscured only by a barricade gets no cover even when an unrelated container stands elsewhere on the board', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 2), crate('far-container', 60, 60, 1, 1, 3)])
    put(s, A.walker(), 0, 0, 2.5)
    put(s, B.warboss(), 0, 0, -8)
    expect(losService.fullyVisible(s, B.warboss(), A.walker())).toBe(false) // obscured by the barricade
    expect(losService.benefitOfCover(s, A.walker(), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(false)
  })

  it('LOS-021-attrib INFANTRY 3.5" behind a barricade gets no cover even when an unrelated ruin stands elsewhere on the board', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 2), squareRuin('far-ruin', 80, 80)])
    put(s, A.grunt(1), 0, 0, 3.5)
    put(s, B.warboss(), 0, 0, -8)
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(false)
  })

  it('LOS-027b a model outside woods, seen only through the woods, has cover (not fully visible because of the woods)', () => {
    // R-3.14 checks "every model in the attacking unit" — A:grunts has an attached leader (A:boss, R-10.1), so all
    // five Grunts and the Boss must each be obstructed by the woods, not just the one model this test is named for;
    // every one is placed south of the woods at an x within its footprint so every attacker-to-target line crosses it.
    const s = stateWithPieces([forest('woods', 0, 0, 2, 2)])
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -1.6 + n * 0.8, 0, -8)
    put(s, A.boss(), 0.4, 0, -8)
    put(s, B.mob(0), 0, 0, 8)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(false)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })

  it('LOS-024b a model only partly within a ruin footprint and fully visible has no cover', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0, { south: { from: 0, to: 1 } })])
    put(s, B.mob(0), 0, 0, -3.2) // centre outside, north edge inside
    put(s, A.grunt(0), 0, 0, -20)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })
})

describe('verify: unit membership for visibility (R-3.1, R-3.4, attached units)', () => {
  it('LOS-031b models of the observed unit standing in front of one another do not stop the unit being fully visible', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), -10, 0, 0)
    put(s, B.mob(0), 5, 0, 0)
    put(s, B.mob(1), 7, 0, 0) // directly behind mob(0) from the observer's angle
    for (let n = 2; n < 10; n++) put(s, B.mob(n), 5, 0, 4 + 3 * n)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(1))).toBe(true)
    expect(losService.unitFullyVisible(s, A.grunt(0), 'B:mob')).toBe(true)
  })

  it('LOS-003b an attached leader is part of the observer unit and never blocks its bodyguard models', () => {
    const s = stateWithPieces([])
    expect(s.units['A:grunts'].attachedLeaderId ?? s.units['A:boss'].bodyguardUnitId).toBeTruthy()
    put(s, A.grunt(0), -5, 0, 0)
    put(s, A.boss(), 0, 0, 0)
    put(s, B.mob(0), 5, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
  })

  it('LOS-023b attached unit: target fully visible to the attached leader (a model of the attacking unit) -> no cover', () => {
    const s = stateWithPieces([crate('wall', 0, -1.5, 3, 0.5, 3)])
    put(s, B.mob(0), 0, 0, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -3 + n * 1.5, 0, -10)
    put(s, A.boss(), 20, 0, -1)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })
})

describe('verify: ruin visibility (R-3.7)', () => {
  it('LOS-012b observer only partly within a ruin cannot see through it to the far side (only wholly-within sees out)', () => {
    const s = stateWithPieces([squareRuin('ruin', 100, 0, { south: { from: 0.3, to: 0.7 }, north: { from: 0.3, to: 0.7 } })])
    put(s, A.grunt(0), 100, 0, -2.9) // centre inside, south edge outside: not wholly within
    put(s, B.mob(0), 100, 0, 10)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-012c ray clipping a wall-less ruin footprint corner at ground level is blocked', () => {
    const s = stateWithPieces([squareRuin('ruin', 100, 0, { noWalls: true })])
    put(s, A.grunt(0), 95, 0, 1)
    put(s, B.mob(0), 101, 0, -5)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-011b observer wholly within on an upper floor sees out through a window on the far wall', () => {
    const s = stateWithPieces([squareRuin('ruin', 140, 0, { north: { from: 0, to: 1, bottom: 3, top: 6 }, floor: 3 })])
    put(s, A.grunt(0), 140, 3, -1)
    put(s, B.mob(0), 140, 0, 20)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
  })
})

describe('verify: Plunging Fire (R-3.8)', () => {
  it('LOS-025b 6" up on a container (not in a ruin) -> no Plunging Fire', () => {
    const s = stateWithPieces([crate('tower', 0, 0, 2, 2, 6)])
    put(s, A.grunt(0), 0, 6, 0)
    put(s, B.mob(0), 30, 0, 0)
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(false)
  })

  it('LOS-025c 6" up but base overhanging the ruin footprint (not wholly within) -> no Plunging Fire', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, A.grunt(0), 2.9, 6, 0)
    put(s, B.mob(0), 30, 0, 0)
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// verify round 2: fidelity probes (attached units, end-of-move surfaces, real cp-01 data, woods exceptions)
// ---------------------------------------------------------------------------------------------------------------
import { readFileSync } from 'node:fs'
import { terrainService } from '../../src/engine/terrain'
import { datasheetOf } from '../../src/engine/state'

const cp01Pieces = (): TerrainPieceData[] =>
  (JSON.parse(readFileSync(new URL('../../src/data/terrain/cp-01.json', import.meta.url), 'utf8')) as { pieces: TerrainPieceData[] }).pieces

describe('verify round 2: attached units are one unit for unit-level visibility and Plunging Fire', () => {
  it('LOS-031c unitFullyVisible on an attached unit is false when only the attached leader is hidden', () => {
    const s = stateWithPieces([crate('box', 0, 0, 1, 1, 4)])
    put(s, B.mob(0), -10, 0, 0)
    put(s, A.boss(), 5, 0, 0) // fully behind the box
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), 5, 0, 10 + 2 * n) // all in the clear
    expect(losService.visible(s, B.mob(0), A.boss())).toBe(false)
    expect(losService.unitFullyVisible(s, B.mob(0), 'A:grunts')).toBe(false)
  })

  it('LOS-005b unitVisible on an attached unit is true when only the attached leader can be seen', () => {
    const s = stateWithPieces([crate('box', 0, 0, 3, 3, 4)])
    put(s, B.mob(0), -10, 0, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), 5, 0, -1 + 0.5 * n) // all behind the box
    put(s, A.boss(), 0, 0, 12)
    expect(losService.visible(s, B.mob(0), A.boss())).toBe(true)
    expect(losService.unitVisible(s, B.mob(0), 'A:grunts')).toBe(true)
  })

  it('LOS-026c attached target unit whose leader stands above ground level: no Plunging Fire', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.mob(0), 0, 6, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), 40, 0, 2 * n)
    put(s, A.boss(), 40, 1, -3)
    expect(losService.plungingFire(s, B.mob(0), 'A:grunts')).toBe(false)
  })
})

describe('verify round 2: end-of-move surfaces (R-5.7 / §3.2 HILL, ruins)', () => {
  it('LOS-022-endAt two containers of equal height: ending wholly on top of the second one is legal', () => {
    const s = stateWithPieces([crate('c1', 0, 0, 3, 3, 3), crate('c2', 20, 0, 3, 3, 3)])
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 20, y: 3, z: 0 }).ok).toBe(true)
  })

  it('LOS-022-endAt-data cp-01: INFANTRY ending wholly on top of container-2 (3") is legal despite ruin floors at 3"', () => {
    const s = stateWithPieces(cp01Pieces())
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: -7, y: 3, z: 11.5 }).ok).toBe(true)
  })

  it('LOS-011-endAt-data cp-01: INFANTRY ending on the ruin-l2 upper floor is legal (ruin-l1 has a floor at the same height)', () => {
    const s = stateWithPieces(cp01Pieces())
    const floor = s.board.pieces['ruin-l2'].floors[0]
    expect(floor).toBeTruthy()
    // a point well inside ruin-l2's footprint arm x in [6,8], z in [-6,0]
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 7, y: floor.height, z: -3 }).ok).toBe(true)
  })

  it('LOS-022-inside a model may not end a move at ground level inside a sealed container footprint', () => {
    const s = stateWithPieces([crate('c1', 0, 0, 3, 3, 3)])
    expect(terrainService.canEndAt(s, s.models[A.walker()], { x: 0, y: 0, z: 0 }).ok).toBe(false)
  })

  it('LOS-017-move a MONSTER cannot move through a ruin wall; a FLY vehicle can', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    const path = [{ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 10 }]
    expect(terrainService.crossesImpassable(s, s.models[id('B:brute', 0)], path)).toBe(true)
    expect(terrainService.crossesImpassable(s, s.models[id('B:kopta', 0)], path)).toBe(false)
  })
})

describe('verify round 2: cover and visibility edge cases', () => {
  it('LOS-019-data cp-01: a Boy wholly within crater-1 (world centre 10,4) has cover vs AP0', () => {
    const s = stateWithPieces(cp01Pieces())
    put(s, B.mob(0), 10, 0, 4)
    put(s, A.grunt(0), 10, 0, -14)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })

  it('LOS-013-data cp-01: a Boy wholly within ruin-l1 has cover vs AP0', () => {
    const s = stateWithPieces(cp01Pieces())
    put(s, B.mob(0), -7, 0, 3)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })

  it('LOS-020b INFANTRY within 3" of a barricade that stands BEHIND it (attackers in front): no cover', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 2)])
    put(s, B.mob(0), 0, 0, -1.2) // between the attacker and the barricade
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -2 + n, 0, -10)
    put(s, A.boss(), 0, 0, -12)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })

  it('LOS-002b a 1.5" barricade between two models: visible but not fully visible', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 3)])
    put(s, A.grunt(0), 0, 0, -5)
    put(s, B.mob(0), 0, 0, 5)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-008b target wholly within ruin R2 but a different ruin R1 lies between: not visible', () => {
    const s = stateWithPieces([
      squareRuin('r1', 0, 10, { south: { from: 0.2, to: 0.8 }, north: { from: 0.2, to: 0.8 } }),
      squareRuin('r2', 0, 25, { south: { from: 0.2, to: 0.8 } }),
    ])
    put(s, A.grunt(0), 0, 0, 0)
    put(s, B.mob(0), 0, 0, 25)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-027c a TOWERING target seen through woods (not within them) is fully visible and gets no cover from the woods', () => {
    const s = stateWithPieces([forest('woods', 0, 0, 2, 2)])
    const dsId = s.units['B:brute'].datasheetId
    const ds = datasheetOf(s, 'B:brute')
    s.datasheets = { ...s.datasheets, [dsId]: { ...ds, keywords: [...ds.keywords, 'TOWERING'] } }
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -1.6 + n * 0.8, 0, -8)
    put(s, A.boss(), 0.4, 0, -8)
    put(s, id('B:brute', 0), 0, 0, 8)
    expect(losService.fullyVisible(s, A.grunt(0), id('B:brute', 0))).toBe(true)
    expect(losService.benefitOfCover(s, id('B:brute', 0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })

  it('LOS-025d attacker 6" up wholly within a ruin shooting at a unit on a ruin ground floor: Plunging Fire', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0), squareRuin('ruin2', 30, 0)])
    put(s, A.grunt(0), 0, 6, 0)
    for (let n = 0; n < 10; n++) put(s, B.mob(n), 30 + ((n % 3) - 1) * 1.4, 0, (Math.floor(n / 3) - 1.5) * 1.4)
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// verify round 3: model-blocker geometry, end-of-move solids, cover exceptions
// ---------------------------------------------------------------------------------------------------------------
describe('verify round 3: model blockers are cylinders (R-3.1/R-3.3)', () => {
  it('LOS-004-slope a steep downward ray that passes through the upper part of another unit\'s model is blocked (not fully visible)', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), 0, 25, 0) // high observer (support is irrelevant to LoS)
    put(s, B.warboss(), 10.9, 0, 0) // other-unit blocker, 1.6" tall, r≈0.79
    put(s, B.mob(0), 12, 0, 0)
    // ray to the target's 0.2" sample point enters the warboss cylinder at y≈4 and leaves it at y≈0.85: it crosses the
    // model's volume, so that point is hidden from every observer point
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-004-oval a ray passing beside the narrow side of an oval base (outside the ellipse) is not blocked', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), -10, 0, 1.7)
    put(s, A.walker(), 0, 0, 0) // oval 100x60 mm, long axis along x: z half-extent ≈1.18"
    put(s, B.mob(0), 10, 0, 1.7)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(true)
  })
})

describe('verify round 3: end-of-move legality against solid terrain (§3.2, R-5.7)', () => {
  it('LOS-030-end a model may not end a move at ground level with its base centred inside a barricade', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 3)])
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 0, y: 0, z: 0 }).ok).toBe(false)
  })

  it('LOS-022-inside-overlap a base whose centre is outside a container but whose edge overlaps it may not end there', () => {
    const s = stateWithPieces([crate('c1', 0, 0, 3, 3, 3)])
    // grunt base r≈0.63; centre 0.3" outside the east face: base overlaps the solid container
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 3.3, y: 0, z: 0 }).ok).toBe(false)
  })

  it('LOS-010-wall-end an INFANTRY model may not end a move inside a ruin wall', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 0, y: 0, z: -3 }).ok).toBe(false)
  })
})

describe('verify round 3: cover conditions and exceptions (§3.2, R-3.12, R-3.14)', () => {
  it('LOS-022-debris a VEHICLE not fully visible because of battlefield debris has cover (no INFANTRY restriction)', () => {
    const debris: TerrainPieceData = {
      id: 'statue', kind: 'wall', pos: { x: 0, z: 0 }, rot: 0, footprint: rect(0, 0, 2, 0.25), height: 2, traits: ['cover'] as never,
      walls: [wall({ x: -2, z: 0 }, { x: 2, z: 0 }, 2)],
    }
    const s = stateWithPieces([debris])
    put(s, A.walker(), 0, 0, 2.5)
    put(s, B.warboss(), 0, 0, -8)
    expect(losService.benefitOfCover(s, A.walker(), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(true)
  })

  it('LOS-014-ignores an IGNORES COVER weapon denies cover to a model wholly within a ruin', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.mob(0), 0, 0, 0)
    put(s, A.grunt(0), 50, 0, 0)
    const w = { ...s.weapons['red.w.pistol'], abilities: [...s.weapons['red.w.pistol'].abilities, { ability: 'IGNORES_COVER' }] } as never
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', w)).toBe(false)
  })

  it('LOS-015-sv4 an Sv4+ model wholly within a ruin vs AP0: cover applies (exception is 3+ or better only)', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.warboss(), 0, 0, 0)
    put(s, A.grunt(0), 50, 0, 0)
    expect(losService.benefitOfCover(s, B.warboss(), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })

  it('LOS-019-partial an INFANTRY model only partly on a crater: no cover', () => {
    const s = stateWithPieces([{ id: 'crater', kind: 'crater', pos: { x: 0, z: 0 }, rot: 0, footprint: rect(0, 0, 2.5, 2.5), height: 0.5, traits: ['cover'] as never }])
    put(s, B.mob(0), 2.4, 0, 0)
    put(s, A.grunt(0), 50, 0, 0)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })
})
