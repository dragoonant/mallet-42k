// Terrain service (10-rules §3.2, R-5.7). Owner: W1-B. Movement/charge/fight modules call this for climbs, walls,
// impassable areas and end-of-move legality; LoS uses the shared wall/footprint geometry below for rays (los.ts).
//
// [interp] heightAt/canEndAt: the data model lets a (x,z) point sit under more than one usable surface (a ruin's
// ground floor vs. an upper floor at the same footprint). Since heightAt takes no floor argument we treat it as
// "the highest surface directly reachable at this point" (crate/HILL top, or a ruin's topmost floor) and leave the
// caller (movement/charge) to pass the exact `pos.y` it wants validated to canEndAt, which checks that specific
// height against every candidate surface. Craters/barricades never raise the standing height (R-5.7: ≤2" ignored;
// barricades may be crossed but never stood on top of).
import { partlyWithinPolygon, pointInPolygon, pointToSegment, whollyWithinPolygon, EPS, type Footprint } from './geometry'
import { hasKeyword } from './state'
import type { WallData } from '../data/types'
import type { GameState, Model, Path, TerrainPiece, TerrainPieceId, Vec2, Vec3 } from './types'

// ---------- shared low-level geometry (also used by los.ts) ----------

// 2D segment intersection p1->p2 vs a->b; returns the parametric position on each segment (both in [0,1]) or null.
export function segmentIntersection2D(p1: Vec2, p2: Vec2, a: Vec2, b: Vec2): { t: number; u: number } | null {
  const rx = p2.x - p1.x, rz = p2.z - p1.z
  const sx = b.x - a.x, sz = b.z - a.z
  const denom = rx * sz - rz * sx
  if (Math.abs(denom) < 1e-9) return null
  const qpx = a.x - p1.x, qpz = a.z - p1.z
  const t = (qpx * sz - qpz * sx) / denom
  const u = (qpx * rz - qpz * rx) / denom
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { t: Math.min(1, Math.max(0, t)), u: Math.min(1, Math.max(0, u)) }
}

// does the 3D segment p1->p2 cross this wall (a solid vertical panel from y=0 to y=height, minus any gaps)?
// Movement (2D, ignores height) calls this with p1.y = p2.y = 0: a gap whose `bottom` > 0 (a window above head
// height) then correctly still blocks ground-level passage.
export function wallCrosses3D(wall: WallData, p1: Vec3, p2: Vec3): boolean {
  const hit = segmentIntersection2D(p1, p2, wall.a, wall.b)
  if (!hit) return false
  const y = p1.y + (p2.y - p1.y) * hit.t
  if (y > wall.height + EPS || y < -EPS) return false
  for (const g of wall.gaps ?? []) {
    if (hit.u < g.from - EPS || hit.u > g.to + EPS) continue
    const bottom = g.bottom ?? 0, top = g.top ?? wall.height
    if (y >= bottom - EPS && y <= top + EPS) return false
  }
  return true
}

// does the 2D segment cross the polygon boundary or start/end inside it?
export function segmentIntersectsPolygon2D(p1: Vec2, p2: Vec2, poly: Vec2[]): boolean {
  if (pointInPolygon(p1, poly) || pointInPolygon(p2, poly)) return true
  for (let i = 0; i < poly.length; i++) if (segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length])) return true
  return false
}

// R-3.7: the ruin footprint prism (full height, open top) blocks a ray whose start AND end are both outside the
// footprint even when it would otherwise pass through a wall gap/window — closes the "peek through a corner or
// window with both models outside" loophole that plain wall raycasting leaves open. Height is linear along the
// segment, so it suffices to check the two endpoints of every inside-the-polygon interval.
// `fromWhollyWithin`: is the model whose sample point is `p1` (the observer) wholly within this piece? R-3.7 lets
// only a wholly-within model see out through the footprint at any point; a merely partly-within model (base centre
// in, base edge overhanging) gets no such exemption. The `p2` (target) end keeps the plain per-point exemption
// regardless — a model the observer sees *into* the ruin needs no wholly-within test of its own.
export function ruinFootprintBlocks(piece: Pick<TerrainPiece, 'footprint' | 'height'>, p1: Vec3, p2: Vec3, fromWhollyWithin = false): boolean {
  const p1In = pointInPolygon(p1, piece.footprint), p2In = pointInPolygon(p2, piece.footprint)
  if ((p1In && fromWhollyWithin) || p2In) return false
  const ts = new Set<number>([0, 1])
  const poly = piece.footprint
  for (let i = 0; i < poly.length; i++) {
    const hit = segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length])
    if (hit) ts.add(hit.t)
  }
  const sorted = [...ts].sort((a, b) => a - b)
  const heightAt = (t: number) => p1.y + (p2.y - p1.y) * t
  const midInside = (a: number, b: number) => pointInPolygon({ x: p1.x + (p2.x - p1.x) * ((a + b) / 2), z: p1.z + (p2.z - p1.z) * ((a + b) / 2) }, poly)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (b - a < EPS) continue
    if (!midInside(a, b)) continue
    if (Math.min(heightAt(a), heightAt(b)) <= piece.height + EPS) return true
  }
  return false
}

// a solid raised block (HILL/container, kind 'crate'): opaque across its whole footprint up to `height` — there is
// no interior to be "inside" of, so (unlike ruins) no both-ends-outside gate is needed.
export function crateBlocks(piece: Pick<TerrainPiece, 'footprint' | 'height'>, p1: Vec3, p2: Vec3): boolean {
  const poly = piece.footprint
  const ts = new Set<number>([0, 1])
  for (let i = 0; i < poly.length; i++) {
    const hit = segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length])
    if (hit) ts.add(hit.t)
  }
  const sorted = [...ts].sort((a, b) => a - b)
  const heightAt = (t: number) => p1.y + (p2.y - p1.y) * t
  const midInside = (a: number, b: number) => pointInPolygon({ x: p1.x + (p2.x - p1.x) * ((a + b) / 2), z: p1.z + (p2.z - p1.z) * ((a + b) / 2) }, poly)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (b - a < EPS || !midInside(a, b)) continue
    if (Math.min(heightAt(a), heightAt(b)) <= piece.height + EPS) return true
  }
  return false
}

export function isTerrainId(state: GameState, id: string): id is TerrainPieceId { return id in state.board.pieces }

// does a wall (a thin solid panel, thickness defaulting to 0.25" per the schema) occupy this point at this height,
// for a base of the given (worst-case round) radius? Mirrors wallCrosses3D's gap handling but for a single point
// rather than a crossing segment — used by canEndAt so a model may not end a move with its base inside a wall panel,
// even a wall its keywords let it move through (R-5.7: crossing ≠ stopping).
function wallOccupiesPoint(wall: WallData, pos: Vec3, radius: number): boolean {
  if (pos.y > wall.height + EPS || pos.y < -EPS) return false
  const abx = wall.b.x - wall.a.x, abz = wall.b.z - wall.a.z
  const l2 = abx * abx + abz * abz
  let u = l2 < EPS ? 0 : ((pos.x - wall.a.x) * abx + (pos.z - wall.a.z) * abz) / l2
  u = Math.max(0, Math.min(1, u))
  const halfThickness = (wall.thickness ?? 0.25) / 2
  if (pointToSegment({ x: pos.x, z: pos.z }, wall.a, wall.b) > radius + halfThickness + EPS) return false
  for (const g of wall.gaps ?? []) {
    if (u < g.from - EPS || u > g.to + EPS) continue
    const bottom = g.bottom ?? 0, top = g.top ?? wall.height
    if (pos.y >= bottom - EPS && pos.y <= top + EPS) return false
  }
  return true
}

// R-3.9: units/models within 2" of each other across a barricade count as in Engagement Range (charging into one,
// and for Fight-phase eligibility/attacks). `a`/`b` are plain positions (base centres) — callers pass horizontalGap
// separately since that already accounts for base shape.
export function acrossBarricade(state: GameState, a: Vec2, b: Vec2): boolean {
  for (const p of Object.values(state.board.pieces)) {
    if (p.kind !== 'barricade') continue
    if (segmentIntersectsPolygon2D(a, b, p.footprint)) return true
  }
  return false
}

export interface TerrainService {
  // surface height under (x, z): 0 on open ground, a floor height inside a ruin, the top of a HILL/container
  heightAt(state: GameState, x: number, z: number): number
  // may a model end its move with its base centred at pos? (R-5.7: not mid-climb; barricades never; ruin floors only for
  // INFANTRY/BEAST/FLY; hills only if the base does not overhang)
  canEndAt(state: GameState, model: Model, pos: Vec3): { ok: boolean; reason?: string }
  // does the path cross a wall this model cannot pass (ruin walls for non-INFANTRY/BEAST/FLY, impassable pieces)?
  crossesImpassable(state: GameState, model: Model, path: Path): boolean
  // extra movement cost beyond geometry.pathLength (which already charges |Δy|); 0 unless a rule adds more
  extraMoveCost(state: GameState, model: Model, path: Path): number
  // AREA TERRAIN pieces the model is wholly within (R-3.6): ruins, craters, woods — not HILL/OBSTACLE pieces
  piecesWhollyWithin(state: GameState, model: Model): TerrainPieceId[]
}

function canPassWalls(state: GameState, model: Model): boolean {
  return hasKeyword(state, model.unitId, 'INFANTRY') || hasKeyword(state, model.unitId, 'BEAST') || hasKeyword(state, model.unitId, 'FLY')
}

export const terrainService: TerrainService = {
  heightAt(state, x, z) {
    let best = 0
    for (const p of Object.values(state.board.pieces)) {
      if (p.kind === 'crate' && p.height > best && pointInPolygon({ x, z }, p.footprint)) best = p.height
      if (p.kind === 'ruin') for (const f of p.floors) if (f.height > best && pointInPolygon({ x, z }, f.polygon)) best = f.height
    }
    return best
  },
  canEndAt(state, model, pos) {
    const fp: Footprint = { pos, facing: model.facing, base: model.base }
    const radius = Math.max(model.base.radius, model.base.radius2 ?? model.base.radius)
    const groundLevel = Math.abs(pos.y) <= EPS
    for (const p of Object.values(state.board.pieces)) {
      // barricades are never a standing surface (crossable "up/over/down" but no floor to end a move on) — a base
      // overlapping the footprint at all, at any height, is "on top of it"
      if (p.kind === 'barricade' && partlyWithinPolygon(fp, p.footprint)) {
        return { ok: false, reason: 'may not end a move on top of a barricade' }
      }
      if (p.kind === 'ruin') {
        for (const w of p.walls) if (wallOccupiesPoint(w, pos, radius)) {
          return { ok: false, reason: 'may not end a move inside a wall' }
        }
      }
    }
    if (groundLevel) {
      // §3.2 HILL / LOS-022-inside: a container/hill is solid — no model can stand inside its footprint at ground
      // level, including a base that merely overhangs the solid volume (LOS-022-inside-overlap)
      for (const p of Object.values(state.board.pieces)) {
        if (p.kind === 'crate' && p.height > EPS && partlyWithinPolygon(fp, p.footprint)) {
          return { ok: false, reason: 'may not end a move inside a solid terrain piece' }
        }
      }
      return { ok: true }
    }
    // LOS-022-endAt: several surfaces may share a height (two equal containers, a container and a ruin floor, two
    // ruins' upper floors). Only surfaces under the base centre are candidates; the move is legal if ANY candidate
    // wholly contains the base. The most specific failure reason among the candidates is reported otherwise.
    const infantryLike = canPassWalls(state, model)
    let reason: string | undefined
    for (const p of Object.values(state.board.pieces)) {
      if (p.kind === 'crate' && Math.abs(pos.y - p.height) <= EPS && pointInPolygon(pos, p.footprint)) {
        if (whollyWithinPolygon(fp, p.footprint)) return { ok: true }
        reason ??= 'base would overhang the terrain'
      }
      if (p.kind === 'ruin') {
        for (const f of p.floors) {
          if (Math.abs(pos.y - f.height) > EPS || !pointInPolygon(pos, f.polygon)) continue
          if (!infantryLike) { reason = 'only INFANTRY/BEAST/FLY models may end on a ruin upper floor'; continue }
          if (whollyWithinPolygon(fp, f.polygon)) return { ok: true }
          reason ??= 'base would overhang the floor'
        }
      }
    }
    return { ok: false, reason: reason ?? 'no terrain surface at that height' }
  },
  crossesImpassable(state, model, path) {
    if (canPassWalls(state, model)) return false
    for (let i = 1; i < path.length; i++) {
      const a: Vec3 = { ...path[i - 1], y: 0 }, b: Vec3 = { ...path[i], y: 0 }
      for (const p of Object.values(state.board.pieces)) {
        if (p.kind !== 'ruin') continue
        for (const w of p.walls) if (wallCrosses3D(w, a, b)) return true
      }
    }
    return false
  },
  extraMoveCost: () => 0,
  piecesWhollyWithin(state, model) {
    return Object.values(state.board.pieces)
      .filter((p) => (p.kind === 'ruin' || p.kind === 'crater' || p.kind === 'forest') && whollyWithinPolygon(model, p.footprint))
      .map((p) => p.id)
  },
}
