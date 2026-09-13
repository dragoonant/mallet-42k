// Line of sight, terrain and Benefit of Cover (docs/spec/10-rules-core.md §3; checklist ids LOS-001..031).
// Every test builds a fresh GameState with a small custom terrain layout so pieces never interact across tests;
// `park()` moves every fixture unit's models out of the way first so only the models a test repositions can act as
// LoS blockers or targets.
import { describe, expect, it } from 'vitest'
import {
  createGameState, ENGINE_VERSION, hasKeyword, modelIdFor, setModelPos,
  type GameState, type ModelId, type UnitId,
} from '../../src/engine'
import { losService } from '../../src/engine/los'
import { acrossBarricade, isTerrainId, terrainService } from '../../src/engine/terrain'
import { horizontalGap, onObjectiveMarker } from '../../src/engine/geometry'
import { withBundle } from '../fixtures/bundle'
import { makeSetup } from '../fixtures/setup'
import type { TerrainPieceData, WallData, WallGap } from '../../src/data/types'

// ---------- terrain piece builders ----------
function wall(a: { x: number; z: number }, b: { x: number; z: number }, height: number, gap?: WallGap): WallData {
  return { a, b, height, ...(gap ? { gaps: [gap] } : {}) }
}

// square ruin centred at (cx,cz), half-width s; `gapOnSouth` punches a window in the south wall (from/to along it);
// `omit` drops whole sides; `extraWalls` adds interior partitions.
function squareRuin(id: string, cx: number, cz: number, opts: {
  size?: number; height?: number; gapOnSouth?: WallGap; omit?: ('n' | 's' | 'e' | 'w')[]; extraWalls?: WallData[]
} = {}): TerrainPieceData {
  const s = opts.size ?? 3, h = opts.height ?? 6
  const sw = { x: cx - s, z: cz - s }, se = { x: cx + s, z: cz - s }, ne = { x: cx + s, z: cz + s }, nw = { x: cx - s, z: cz + s }
  const walls: WallData[] = []
  const omit = new Set(opts.omit ?? [])
  if (!omit.has('s')) walls.push(wall(sw, se, h, opts.gapOnSouth))
  if (!omit.has('e')) walls.push(wall(se, ne, h))
  if (!omit.has('n')) walls.push(wall(ne, nw, h))
  if (!omit.has('w')) walls.push(wall(nw, sw, h))
  if (opts.extraWalls) walls.push(...opts.extraWalls)
  return { id, kind: 'ruin', pos: { x: 0, z: 0 }, rot: 0, footprint: [sw, se, ne, nw], height: h, traits: ['obscuring', 'cover'] as never, walls }
}

function crate(id: string, cx: number, cz: number, halfX: number, halfZ: number, height: number): TerrainPieceData {
  return {
    id, kind: 'crate', pos: { x: 0, z: 0 }, rot: 0,
    footprint: [{ x: cx - halfX, z: cz - halfZ }, { x: cx + halfX, z: cz - halfZ }, { x: cx + halfX, z: cz + halfZ }, { x: cx - halfX, z: cz + halfZ }],
    height, traits: ['cover', 'scalable'] as never,
  }
}

function crater(id: string, cx: number, cz: number, r: number, height = 0.5): TerrainPieceData {
  return {
    id, kind: 'crater', pos: { x: 0, z: 0 }, rot: 0,
    footprint: [{ x: cx - r, z: cz - r }, { x: cx + r, z: cz - r }, { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r }],
    height, traits: ['cover'] as never,
  }
}

function barricade(id: string, cx: number, z: number, halfLen: number, height = 1.5): TerrainPieceData {
  return {
    id, kind: 'barricade', pos: { x: 0, z: 0 }, rot: 0,
    footprint: [{ x: cx - halfLen, z: z - 0.25 }, { x: cx + halfLen, z: z - 0.25 }, { x: cx + halfLen, z: z + 0.25 }, { x: cx - halfLen, z: z + 0.25 }],
    height, traits: ['cover', 'breachable'] as never,
    walls: [wall({ x: cx - halfLen, z }, { x: cx + halfLen, z }, height)],
  }
}

function forest(id: string, cx: number, cz: number, halfX: number, halfZ: number): TerrainPieceData {
  return {
    id, kind: 'forest', pos: { x: 0, z: 0 }, rot: 0,
    footprint: [{ x: cx - halfX, z: cz - halfZ }, { x: cx + halfX, z: cz - halfZ }, { x: cx + halfX, z: cz + halfZ }, { x: cx - halfX, z: cz + halfZ }],
    height: 5, traits: ['cover'] as never,
  }
}

// ---------- state harness ----------
function stateWithPieces(pieces: TerrainPieceData[]): GameState {
  const bundle = withBundle((b) => {
    b.terrainLayouts['terrain.los'] = { id: 'terrain.los', board: { w: 4000, h: 4000 }, pieces }
    b.missions['mission.test'] = { ...b.missions['mission.test'], board: { w: 4000, h: 4000 }, terrainLayouts: ['terrain.los'] }
  })
  const state = createGameState(makeSetup({ terrainLayoutId: 'terrain.los' }), bundle, 'los-fixture', ENGINE_VERSION)
  // park every unit's models far from the origin so only models a test explicitly repositions matter
  let i = 0
  for (const unit of Object.values(state.units)) {
    unit.location = 'board'
    for (const id of unit.models) { setModelPos(state.models[id], { x: -9000 + i * 10, y: 0, z: -9000 }); i++ }
  }
  return state
}

const A = { boss: (n = 0) => id('A:boss', n), grunt: (n: number) => id('A:grunts', n), walker: (n = 0) => id('A:walker', n) }
const B = { warboss: (n = 0) => id('B:warboss', n), mob: (n: number) => id('B:mob', n), brute: (n = 0) => id('B:brute', n), kopta: (n = 0) => id('B:kopta', n) }
function id(unitId: UnitId, n: number): ModelId { return modelIdFor(unitId, n) }
function put(state: GameState, modelId: ModelId, x: number, y: number, z: number): void { setModelPos(state.models[modelId], { x, y, z }) }

describe('line of sight (10-rules §3.1)', () => {
  it('LOS-001 open board, no terrain: every model visible to every model', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), -3, 0, 0)
    put(s, B.mob(0), 3, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
    expect(losService.visible(s, B.mob(0), A.grunt(0))).toBe(true)
  })

  it('LOS-002 a 4" tall solid obstacle exactly between two models: not visible', () => {
    const s = stateWithPieces([crate('box', 0, 0, 0.5, 2, 4)]) // wide enough to cover both bases' full lateral extent
    put(s, A.grunt(0), -5, 0, 0)
    put(s, B.mob(0), 5, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-003 a friendly model of the observers own unit in the way: still visible (own unit ignored)', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), -5, 0, 0)
    put(s, A.grunt(1), 0, 0, 0) // same unit as the observer: never blocks
    put(s, B.mob(0), 5, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
  })

  it('LOS-004 a model of another friendly unit fully blocking: not visible', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), -5, 0, 0)
    put(s, A.walker(0), 0, 0, 0) // a different friendly unit: does block
    put(s, B.mob(0), 5, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-005 5-model target unit, only one model visible: unit visible', () => {
    const s = stateWithPieces([crate('box', 0, 0, 3, 3, 4)])
    put(s, A.grunt(0), -10, 0, 0)
    for (let n = 0; n < 5; n++) put(s, B.mob(n), 20, 0, 0) // behind the box: hidden
    put(s, B.mob(4), 0, 0, 10) // one model well clear of the box: visible
    expect(losService.unitVisible(s, A.grunt(0), 'B:mob')).toBe(true)
  })

  it('LOS-006 target half hidden behind a 2" crate: visible but not fully visible', () => {
    const s = stateWithPieces([crate('crate', 0, 0, 0.4, 1, 2)])
    put(s, A.grunt(0), -8, 0, 0)
    put(s, B.mob(0), 8, 0, 0.9) // enough of the base edge clears the crate's z-span to stay visible
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-007 observer outside ruin A, target outside on the far side, open window between: not visible', () => {
    const s = stateWithPieces([squareRuin('ruinA', 100, 0, { gapOnSouth: { from: 0.3, to: 0.7 } })])
    put(s, A.grunt(0), 100, 0, -10)
    put(s, B.mob(0), 100, 0, 10) // straight through the middle of the window, both models outside the footprint
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-008 observer outside, target wholly within the ruin behind the window: visible', () => {
    const s = stateWithPieces([squareRuin('ruinA', 100, 0, { gapOnSouth: { from: 0.3, to: 0.7 } })])
    put(s, A.grunt(0), 100, 0, -10)
    put(s, B.mob(0), 100, 0, -2) // inside the footprint, near the windowed wall
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
  })

  it('LOS-009 observer wholly within the ruin, target outside: visible (sees out normally)', () => {
    const s = stateWithPieces([squareRuin('ruinA', 100, 0, { gapOnSouth: { from: 0.3, to: 0.7 } })])
    put(s, A.grunt(0), 100, 0, 0) // inside
    put(s, B.mob(0), 100, 0, -20) // outside, beyond the windowed wall
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
  })

  it('LOS-010 both models inside the same ruin, interior wall between: wall blocks like any solid', () => {
    const s = stateWithPieces([squareRuin('ruinA', 100, 0, { extraWalls: [wall({ x: 100, z: -3 }, { x: 100, z: 3 }, 6)] })])
    put(s, A.grunt(0), 98, 0, 0)
    put(s, B.mob(0), 102, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-011 observer on the ruin upper floor, target beyond the far wall: not visible', () => {
    const s = stateWithPieces([squareRuin('ruinB', 140, 0)]) // fully solid perimeter, no windows
    put(s, A.grunt(0), 140, 3, -2) // elevated inside, near the south wall
    put(s, B.mob(0), 140, 0, 30) // beyond the (solid) north wall
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-012 observer outside, ray clips the window edge at ground level: not visible (footprint prism blocks)', () => {
    const s = stateWithPieces([squareRuin('ruinA', 100, 0, { gapOnSouth: { from: 0.3, to: 0.7 } })])
    put(s, A.grunt(0), 100, 0, -10)
    // south wall runs x in [97,103]; t=0.32 (just inside the window) -> x = 97 + 0.32*6 = 98.92
    put(s, B.mob(0), 98.92, 0, 10)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-012b observer only partly within a ruin (base overhangs the wall) cannot see out the open side: not visible', () => {
    // south wall is solid, north side fully open; the observer's base centre sits inside but its south edge
    // overhangs the footprint, so it is not wholly within (R-3.7) and gets no see-out exemption toward the north.
    const s = stateWithPieces([squareRuin('ruinC', 200, 0, { omit: ['n'] })])
    put(s, A.grunt(0), 200, 0, -2.9)
    put(s, B.mob(0), 200, 0, 20)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(false)
  })

  it('LOS-003b an attached leader is part of the observer unit and never blocks its bodyguard models', () => {
    const s = stateWithPieces([])
    expect(s.units['A:grunts'].attachedLeaderId).toBeTruthy()
    put(s, A.grunt(0), -5, 0, 0)
    put(s, A.boss(0), 0, 0, 0) // directly on the sightline, but part of the observer's (attached) unit
    put(s, B.mob(0), 5, 0, 0)
    expect(losService.visible(s, A.grunt(0), B.mob(0))).toBe(true)
  })
})

describe('unit/full visibility (R-3.2/R-3.3/R-3.4)', () => {
  it('LOS-031 unit not fully visible when one of five models is partly hidden; the observed units own models never block each other', () => {
    const s = stateWithPieces([crate('crate', 0, 0, 0.4, 1, 2)])
    put(s, A.grunt(0), -8, 0, 0)
    // four Grunts fully in the clear, standing shoulder to shoulder in front of one another from the observer's angle
    for (let n = 0; n < 4; n++) put(s, B.mob(n), 8, 0, -6 - n * 0.05)
    put(s, B.mob(4), 8, 0, 0.9) // the fifth: half behind the crate, same trick as LOS-006
    expect(losService.unitFullyVisible(s, A.grunt(0), 'B:mob')).toBe(false)
    // the four front-rank Grunts standing in front of each other (own unit) never block one another
    expect(losService.visible(s, A.grunt(0), B.mob(3))).toBe(true)
  })

  it('LOS-031b a model of the observed unit standing directly in front of another does not stop it being fully visible', () => {
    const s = stateWithPieces([])
    put(s, A.grunt(0), -10, 0, 0)
    put(s, B.mob(0), 5, 0, 0) // directly between the observer and mob(1)
    put(s, B.mob(1), 7, 0, 0) // the target: fully visible past its own unit-mate
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(1))).toBe(true)
  })
})

describe('Benefit of Cover (10-rules §3.2/§3.3)', () => {
  it('LOS-013 an Sv5+ model in a ruin (wholly within) vs an AP0 weapon: cover applies', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.mob(0), 0, 0, 0) // Boy, Sv5+, wholly within
    put(s, A.grunt(0), 50, 0, 0)
    expect(hasKeyword(s, 'B:mob', 'INFANTRY')).toBe(true)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true) // AP0, Sv5 > 3: bonus applies
  })

  it('LOS-014 an Sv2+ model in a ruin: no bonus vs AP0, bonus applies vs a negative-AP weapon', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, A.walker(0), 0, 0, 0) // Sv2+, wholly within
    put(s, B.mob(0), 50, 0, 0)
    expect(losService.benefitOfCover(s, A.walker(0), 'B:mob', s.weapons['blu.w.slugga'])).toBe(false) // AP0, Sv2 <= 3: R-3.12 exception
    expect(losService.benefitOfCover(s, A.walker(0), 'B:mob', s.weapons['blu.w.rokkit'])).toBe(true) // AP-2: exception does not apply
  })

  it('LOS-015 an Sv3+ model in a ruin: no bonus vs AP0, bonus applies vs a negative-AP weapon', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, A.grunt(1), 0, 0, 0) // Grunt, Sv3+, wholly within
    put(s, B.mob(0), 50, 0, 0)
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:mob', s.weapons['blu.w.slugga'])).toBe(false)
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:mob', s.weapons['blu.w.rokkit'])).toBe(true)
  })

  it('LOS-016 two cover-granting conditions on the same model still only ever read as one boolean bonus (R-3.13)', () => {
    // wholly-within AND not-fully-visible both hold for the same ruin at once: benefitOfCover has no numeric total to
    // stack (the +1 cap itself is enforced by the save-resolution code, not LosService) — it can only ever say yes/no.
    const s = stateWithPieces([squareRuin('ruin', 0, 0, { omit: ['n'] })])
    put(s, B.mob(0), 0, 0, 0) // wholly within...
    put(s, A.grunt(0), 0, 0, 50) // ...and, through the missing north wall, also not fully visible from directly ahead
    const cover = losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])
    expect(cover).toBe(true)
    expect(typeof cover).toBe('boolean')
  })

  it('LOS-017 a model in cover targeted by a melee weapon: no cover bonus', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.mob(0), 0, 0, 0)
    put(s, A.grunt(0), 1, 0, 0)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.blade'])).toBe(false)
  })

  it('LOS-018 a model in cover: the bonus is available, but never applies to an invulnerable save (R-3.11, enforced by the save step)', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, A.boss(0), 0, 0, 0) // has a 4+ invulnerable save
    put(s, B.mob(0), 50, 0, 0)
    expect(losService.benefitOfCover(s, A.boss(0), 'B:mob', s.weapons['blu.w.rokkit'])).toBe(true)
    // LosService only answers "is cover physically available"; R-3.11's "never to invulnerable saves" is a save-step
    // (attack.ts) concern — it must ignore this boolean whenever the owner chooses to save on the invulnerable.
  })

  it('LOS-019 an INFANTRY model wholly on a crater has cover; a VEHICLE wholly on the same crater does not', () => {
    const s = stateWithPieces([crater('crater', 0, 0, 2.5)])
    put(s, B.mob(0), 0, 0, 0)
    put(s, A.walker(0), 60, 0, 0)
    put(s, A.grunt(0), 60, 0, 5)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)

    put(s, A.walker(0), 0, 0, 0)
    expect(losService.benefitOfCover(s, A.walker(0), 'B:mob', s.weapons['blu.w.slugga'])).toBe(false)
  })

  it('LOS-020 wholly within 3" of a barricade AND partly obscured by it: cover; fully visible to every attacker: no cover', () => {
    // a single-model attacking unit: R-3.14 requires *every* model of the attacking unit to fail full visibility, so
    // a squad's other members would have to be positioned too (out of scope here) — one model isolates the rule.
    const s = stateWithPieces([barricade('bar', 0, 0, 2)])
    put(s, A.grunt(1), 0, 0, 1) // 1" from the barricade line
    put(s, B.warboss(0), 0, 0, -8) // obscured, straight across the barricade
    // a negative-AP weapon: grunt's Sv3+ would otherwise trip the unrelated R-3.12 exception (see LOS-015)
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(true)

    put(s, B.warboss(0), 30, 0, -3) // moved to a wide oblique angle clear of the barricade's ends: fully visible now
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(false)
  })

  it('LOS-021 a model 3.5" from the barricade: no cover (fails the wholly-within-3" test)', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 2)])
    put(s, A.grunt(1), 0, 0, 3.5)
    put(s, B.warboss(0), 0, 0, -8)
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(false)
  })

  it('LOS-022 a VEHICLE partially obscured by a container (HILL): cover (no INFANTRY restriction)', () => {
    const s = stateWithPieces([crate('container', 0, 0, 2, 2, 3)])
    put(s, A.walker(0), 0, 0, 6) // partly behind the container from the attacker's angle
    put(s, B.warboss(0), 0, 0, -30)
    // walker's Sv2+ would trip the R-3.12 exception on an AP0 weapon (see LOS-014): use a negative-AP weapon
    expect(losService.benefitOfCover(s, A.walker(0), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(true)
  })

  it('LOS-023 not fully visible to 4 of 5 attackers but fully visible to the 5th: no cover from that obstacle', () => {
    const s = stateWithPieces([crate('wall', 0, -1.5, 3, 0.5, 3)])
    put(s, B.mob(0), 0, 0, 0)
    for (let n = 0; n < 4; n++) put(s, A.grunt(n), -3 + n * 2, 0, -10) // behind the wide obstacle
    put(s, A.grunt(4), 20, 0, -1) // to the side, clear of the obstacle entirely
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })

  it('LOS-023b attached unit: target fully visible to the attached leader denies cover, even though every bodyguard model is obstructed', () => {
    // LEAD-004: an attached leader is one unit with its bodyguard, so its models count as "attacking models" (R-3.14)
    const s = stateWithPieces([crate('wall', 0, -1.5, 3, 0.5, 3)])
    put(s, B.mob(0), 0, 0, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -3 + n * 1.5, 0, -10) // every Grunt behind the wide obstacle
    put(s, A.boss(0), 20, 0, -1) // the attached Boss: clear of the obstacle entirely
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
  })

  it('LOS-021-attrib INFANTRY 3.5" behind a barricade gets no cover even when an unrelated ruin sits elsewhere on the board', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 2), squareRuin('far-ruin', 80, 80)])
    put(s, A.grunt(1), 0, 0, 3.5)
    put(s, B.warboss(0), 0, 0, -8)
    expect(losService.benefitOfCover(s, A.grunt(1), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(false)
  })

  it('LOS-022-attrib a VEHICLE obscured only by a barricade (INFANTRY-only) gets no cover even with an unrelated container elsewhere', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 2), crate('far-container', 60, 60, 1, 1, 3)])
    put(s, A.walker(0), 0, 0, 2.5) // obscured by the barricade, but a VEHICLE gets no barricade cover
    put(s, B.warboss(0), 0, 0, -8)
    expect(losService.fullyVisible(s, B.warboss(0), A.walker(0))).toBe(false)
    expect(losService.benefitOfCover(s, A.walker(0), 'B:warboss', s.weapons['blu.w.rokkit'])).toBe(false)
  })

  it('LOS-024 wholly within the ruin footprint but fully visible through a doorway: still has cover', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0, { gapOnSouth: { from: 0, to: 1 } })])
    put(s, B.mob(0), 0, 0, -2) // wholly within, right behind a fully open doorway
    put(s, A.grunt(0), 0, 0, -20)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(true)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })

  it('LOS-027 a model wholly within woods is never fully visible: cover vs every ranged attack', () => {
    const s = stateWithPieces([forest('woods', 0, 0, 4, 4)])
    put(s, B.mob(0), 0, 0, 0)
    put(s, A.grunt(0), 0, 0, -1) // right next to the target, nothing else in the way
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(false)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })

  it('LOS-027b a model outside woods, seen only through the woods, has cover (not fully visible because of the woods)', () => {
    // R-3.14 checks "every model in the attacking unit" (A:grunts has an attached leader, R-10.1) — every Grunt and
    // the Boss sit south of the woods at an x within its footprint so every attacker-to-target line crosses it.
    const s = stateWithPieces([forest('woods', 0, 0, 2, 2)])
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -1.6 + n * 0.8, 0, -8)
    put(s, A.boss(0), 0.4, 0, -8)
    put(s, B.mob(0), 0, 0, 8)
    expect(losService.fullyVisible(s, A.grunt(0), B.mob(0))).toBe(false)
    expect(losService.benefitOfCover(s, B.mob(0), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })
})

describe('Plunging Fire (R-3.8)', () => {
  it('LOS-025 a model wholly within a ruin, 6" up, shooting at a target entirely at ground level: Plunging Fire applies', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, A.grunt(0), 0, 6, 0)
    put(s, B.mob(0), 40, 0, 0)
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(true)
  })

  it('LOS-026a 5.9" up: no Plunging Fire; 6.0" up: Plunging Fire', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.mob(0), 40, 0, 0)
    put(s, A.grunt(0), 0, 5.9, 0)
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(false)
    put(s, A.grunt(0), 0, 6.0, 0)
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(true)
  })

  it('LOS-026b a target with one model standing above ground level: not "every model at ground level", no Plunging Fire', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, A.grunt(0), 0, 6, 0)
    put(s, B.mob(0), 40, 0, 0)
    put(s, B.mob(1), 40, 1, 2) // one model raised off the ground
    expect(losService.plungingFire(s, A.grunt(0), 'B:mob')).toBe(false)
  })
})

describe('terrain/targeting edge rules (R-3.5, R-3.9, R-3.10)', () => {
  it('LOS-028 a terrain feature can never be a legal target (E_INVALID_TARGET is enforced by rejecting non-unit ids)', () => {
    const s = stateWithPieces([crate('crate-1', 0, 0, 1, 1, 3)])
    expect(isTerrainId(s, 'crate-1')).toBe(true)
    expect(isTerrainId(s, 'B:mob')).toBe(false) // a real unit id is never mistaken for a terrain feature
  })

  it('LOS-029 a move may never end with a base centred on an objective marker disc (E_OVERLAP)', () => {
    const marker = { pos: { x: 0, z: 0 } }
    const onMarker = { pos: { x: 0, y: 0, z: 0 }, facing: 0, base: { shape: 'round' as const, radius: 0.2 } }
    const clear = { pos: { x: 5, y: 0, z: 0 }, facing: 0, base: { shape: 'round' as const, radius: 0.2 } }
    expect(onObjectiveMarker(onMarker, marker)).toBe(true)
    expect(onObjectiveMarker(clear, marker)).toBe(false)
  })

  it('LOS-030 a charging unit within 1" of a barricade counts as in ER with a target within 2" across it', () => {
    const s = stateWithPieces([barricade('bar', 0, 0, 3)])
    const charger = { pos: { x: 0, y: 0, z: 0.9 }, facing: 0, base: { shape: 'round' as const, radius: 0.2 } }
    const target = { pos: { x: 0, y: 0, z: -1.5 }, facing: 0, base: { shape: 'round' as const, radius: 0.2 } }
    expect(acrossBarricade(s, charger.pos, target.pos)).toBe(true)
    expect(horizontalGap(charger, target)).toBeLessThanOrEqual(2)
    // charge.ts/fight.ts are responsible for treating this as Engagement Range (R-3.9); this asserts the geometric
    // primitive they must call.
  })
})

describe('terrain service (10-rules §3.2, R-5.7) — sanity for the movement/charge modules that consume it', () => {
  it('a HILL/container top is only a legal end position when the base does not overhang it', () => {
    const s = stateWithPieces([crate('container', 0, 0, 3, 3, 3)])
    const onTop = terrainService.canEndAt(s, s.models[A.walker(0)], { x: 0, y: 3, z: 0 })
    expect(onTop.ok).toBe(true)
    const overhang = terrainService.canEndAt(s, s.models[A.walker(0)], { x: 2.9, y: 3, z: 2.9 })
    expect(overhang.ok).toBe(false)
  })

  it('non-INFANTRY/BEAST/FLY models cannot cross a ruin wall; INFANTRY can', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    const walker = s.models[A.walker(0)]
    const grunt = s.models[A.grunt(0)]
    const path = [{ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 10 }]
    expect(terrainService.crossesImpassable(s, walker, path)).toBe(true)
    expect(terrainService.crossesImpassable(s, grunt, path)).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// fix round: attached units at unit level, equal-height end surfaces, solid containers, TOWERING vs woods
// ---------------------------------------------------------------------------------------------------------------
import { datasheetOf } from '../../src/engine/state'

describe('attached units are one unit for unit-level queries (R-3.2/R-3.4/R-3.8, LEAD-004)', () => {
  it('LOS-031c unitFullyVisible(bodyguard id and leader id) is false when only the attached leader is hidden', () => {
    const s = stateWithPieces([crate('box', 0, 0, 1, 1, 4)])
    put(s, B.mob(0), -10, 0, 0)
    put(s, A.boss(), 5, 0, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), 5, 0, 10 + 2 * n)
    expect(losService.unitFullyVisible(s, B.mob(0), 'A:grunts')).toBe(false)
    expect(losService.unitFullyVisible(s, B.mob(0), 'A:boss')).toBe(false)
    put(s, A.boss(), 5, 0, 22) // leader steps into the clear
    expect(losService.unitFullyVisible(s, B.mob(0), 'A:grunts')).toBe(true)
  })

  it('LOS-005b unitVisible is true when only the attached leader can be seen (queried by either half id)', () => {
    const s = stateWithPieces([crate('box', 0, 0, 3, 3, 4)])
    put(s, B.mob(0), -10, 0, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), 5, 0, -1 + 0.5 * n)
    put(s, A.boss(), 0, 0, 12)
    expect(losService.unitVisible(s, B.mob(0), 'A:grunts')).toBe(true)
    expect(losService.unitVisible(s, B.mob(0), 'A:boss')).toBe(true)
    put(s, A.boss(), 5, 0, 1.5) // leader also hidden
    expect(losService.unitVisible(s, B.mob(0), 'A:grunts')).toBe(false)
  })

  it('LOS-026c Plunging Fire needs the attached leader at ground level too', () => {
    const s = stateWithPieces([squareRuin('ruin', 0, 0)])
    put(s, B.mob(0), 0, 6, 0)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), 40, 0, 2 * n)
    put(s, A.boss(), 40, 1, -3)
    expect(losService.plungingFire(s, B.mob(0), 'A:grunts')).toBe(false)
    put(s, A.boss(), 40, 0, -3)
    expect(losService.plungingFire(s, B.mob(0), 'A:grunts')).toBe(true)
  })
})

describe('end-of-move surfaces with shared heights (R-5.7, §3.2 HILL)', () => {
  function flooredRuin(id: string, cx: number, cz: number, floor: number): TerrainPieceData {
    const r = squareRuin(id, cx, cz, { omit: ['n', 's', 'e', 'w'] })
    return { ...r, floors: [{ polygon: r.footprint, height: floor }] } as TerrainPieceData
  }

  it('LOS-022-endAt only surfaces under the base centre count: second equal-height container and second ruin floor are legal', () => {
    const s = stateWithPieces([crate('c1', 0, 0, 3, 3, 3), crate('c2', 20, 0, 3, 3, 3), flooredRuin('r1', 40, 0, 3), flooredRuin('r2', 60, 0, 3)])
    expect(terrainService.canEndAt(s, s.models[A.walker()], { x: 20, y: 3, z: 0 }).ok).toBe(true)
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 60, y: 3, z: 0 }).ok).toBe(true)
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 60, y: 3, z: 2.95 }).ok).toBe(false) // overhangs r2's floor
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 30, y: 3, z: 0 }).ok).toBe(false) // mid-air between pieces
  })

  it('LOS-022-endAt a non-INFANTRY/BEAST/FLY model still may not end on a ruin upper floor', () => {
    const s = stateWithPieces([flooredRuin('r1', 0, 0, 3)])
    const res = terrainService.canEndAt(s, s.models[A.walker()], { x: 0, y: 3, z: 0 })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/INFANTRY/)
  })

  it('LOS-022-inside ending at ground level inside a container footprint is illegal; beside it is legal', () => {
    const s = stateWithPieces([crate('c1', 0, 0, 3, 3, 3)])
    expect(terrainService.canEndAt(s, s.models[A.walker()], { x: 0, y: 0, z: 0 }).ok).toBe(false)
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 2, y: 0, z: -1 }).ok).toBe(false)
    expect(terrainService.canEndAt(s, s.models[A.grunt(0)], { x: 10, y: 0, z: 0 }).ok).toBe(true)
  })
})

describe('woods and TOWERING (R-3.14 exception)', () => {
  it('LOS-027c TOWERING target seen through woods gets no woods cover, but still gets it when wholly within the woods', () => {
    const s = stateWithPieces([forest('woods', 0, 0, 2, 2)])
    const dsId = s.units['B:brute'].datasheetId
    const ds = datasheetOf(s, 'B:brute')
    s.datasheets = { ...s.datasheets, [dsId]: { ...ds, keywords: [...ds.keywords, 'TOWERING'] } }
    expect(hasKeyword(s, 'B:brute', 'TOWERING')).toBe(true)
    for (let n = 0; n < 5; n++) put(s, A.grunt(n), -1.6 + n * 0.8, 0, -8)
    put(s, A.boss(), 0.4, 0, -8)
    put(s, B.brute(), 0, 0, 8)
    expect(losService.benefitOfCover(s, B.brute(), 'A:grunts', s.weapons['red.w.pistol'])).toBe(false)
    put(s, B.brute(), 0, 0, 0) // wholly within the woods
    expect(losService.benefitOfCover(s, B.brute(), 'A:grunts', s.weapons['red.w.pistol'])).toBe(true)
  })
})
