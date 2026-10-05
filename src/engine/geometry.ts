// Measurement (W1-A): base-to-base 3D distance, within / wholly within, engagement range, coherency, pivots, paths,
// placement validation (10-rules §2, 00-arch §7). Pure functions over Model / Vec3 / Polygon; no state mutation.
import type { Polygon, Vec2 } from '../data/types'
import type { Board, Model, ModelBase, ModelId, MoveConstraints, Objective, Path, Rejection, Vec3 } from './types'

export const EPS = 1e-6
export const ENGAGEMENT_H = 1
export const ENGAGEMENT_V = 5
export const COHERENCY_H = 2
export const COHERENCY_V = 5
export const OBJECTIVE_RANGE = 3
export const OBJECTIVE_MARKER_RADIUS = 40 / 25.4 / 2
export const MM_PER_INCH = 25.4
export const EDGE_SAMPLES = 32

// ---------- primitives ----------
export function roundPos(v: number): number { return Math.round(v * 1000) / 1000 }
export function roundVec3(v: Vec3): Vec3 { return { x: roundPos(v.x), y: roundPos(v.y), z: roundPos(v.z) } }
export function mmToInch(mm: number): number { return mm / MM_PER_INCH }

export function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}
export function dist3D(a: Vec3, b: Vec3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) }

export type Footprint = Pick<Model, 'pos' | 'facing' | 'base'>

export function isRound(base: ModelBase): boolean { return base.shape === 'round' || base.radius2 === undefined }

// radius of the circle that contains the whole base outline (exact bound for cheap far-apart early-outs)
function boundRadius(base: ModelBase): number { return base.radius2 === undefined ? base.radius : Math.max(base.radius, base.radius2) }
// true when the bounding circles of a and b are more than `n` apart horizontally, so the true gap is certainly > n
function farApart(a: Footprint, b: Footprint, n: number): boolean {
  return dist2D(a.pos, b.pos) - boundRadius(a.base) - boundRadius(b.base) > n + 1e-3
}

// sampled outline of the base in world XZ (oval: major axis along `facing`)
// pure-function memo (W1-G perf: oval gap tests rebuild the same outline thousands of times per charge search); the
// returned array is shared — callers only read it
const edgeCache = new Map<string, Vec2[]>()
export function baseEdgePoints(m: Footprint, n = EDGE_SAMPLES): Vec2[] {
  const key = `${m.pos.x},${m.pos.z},${m.facing},${m.base.radius},${isRound(m.base) ? '' : m.base.radius2},${n}`
  const hit = edgeCache.get(key)
  if (hit) return hit
  const pts = computeBaseEdgePoints(m, n)
  if (edgeCache.size >= 4096) edgeCache.clear()
  edgeCache.set(key, pts)
  return pts
}

function computeBaseEdgePoints(m: Footprint, n: number): Vec2[] {
  const pts: Vec2[] = []
  const r1 = m.base.radius
  const r2 = isRound(m.base) ? r1 : (m.base.radius2 as number)
  const c = Math.cos(m.facing), s = Math.sin(m.facing)
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n
    const lx = r1 * Math.cos(t), lz = r2 * Math.sin(t)
    pts.push({ x: m.pos.x + lx * c - lz * s, z: m.pos.z + lx * s + lz * c })
  }
  return pts
}

export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x, abz = b.z - a.z
  const l2 = abx * abx + abz * abz
  let t = l2 === 0 ? 0 : ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2
  t = Math.max(0, Math.min(1, t))
  const dx = p.x - (a.x + t * abx), dz = p.z - (a.z + t * abz)
  return Math.sqrt(dx * dx + dz * dz)
}

export function pointToPolygonEdge(p: Vec2, poly: Polygon): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointToSegment(p, poly[i], poly[(i + 1) % poly.length]))
  return best
}

export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

// signed horizontal distance from a point to the base outline (negative inside)
export function signedDistanceToBase(p: Vec2, m: Footprint, edgeHint?: Vec2[]): number {
  if (isRound(m.base)) return dist2D(p, m.pos) - m.base.radius
  const r1 = m.base.radius, r2 = m.base.radius2 as number
  const c = Math.cos(-m.facing), s = Math.sin(-m.facing)
  const dx = p.x - m.pos.x, dz = p.z - m.pos.z
  const lx = dx * c - dz * s, lz = dx * s + dz * c
  const rr = (lx * lx) / (r1 * r1) + (lz * lz) / (r2 * r2)
  const d = pointToPolygonEdge(p, edgeHint ?? baseEdgePoints(m))
  return rr < 1 ? -d : d
}

// R-2.1 / 00-arch §7: horizontal gap between base edges, 0 when overlapping
export function horizontalGap(a: Footprint, b: Footprint): number {
  if (isRound(a.base) && isRound(b.base)) return Math.max(0, dist2D(a.pos, b.pos) - a.base.radius - b.base.radius)
  if (signedDistanceToBase(a.pos, b) < 0 || signedDistanceToBase(b.pos, a) < 0) return 0
  let best = Infinity
  const ea = baseEdgePoints(a), eb = baseEdgePoints(b)
  for (const p of ea) best = Math.min(best, signedDistanceToBase(p, b, eb))
  for (const p of eb) best = Math.min(best, signedDistanceToBase(p, a, ea))
  return Math.max(0, best)
}

export function verticalGap(a: { pos: Vec3 }, b: { pos: Vec3 }): number { return Math.abs(a.pos.y - b.pos.y) }

// plain distance sqrt(h² + v²) (10-rules §0)
export function distance(a: Footprint, b: Footprint): number {
  const h = horizontalGap(a, b), v = verticalGap(a, b)
  return Math.hypot(h, v)
}

// distance from a base to a point (nearest point of the base edge to the point, 3D)
export function distanceToPoint(m: Footprint, p: Vec3): number {
  const h = Math.max(0, signedDistanceToBase({ x: p.x, z: p.z }, m))
  return Math.hypot(h, m.pos.y - p.y)
}

// R-2.3 / R-2.8: "within N" — any part of the base within N (inclusive)
export function within(a: Footprint, b: Footprint, n: number): boolean { return distance(a, b) <= n + EPS }
export function withinOfPoint(m: Footprint, p: Vec3, n: number): boolean { return distanceToPoint(m, p) <= n + EPS }

// "wholly within N of X": every point of the base at plain distance ≤ N (10-rules §0, R-2.8)
export function whollyWithinOf(m: Footprint, target: Footprint | Vec3, n: number): boolean {
  for (const e of baseEdgePoints(m)) {
    const p: Vec3 = { x: e.x, y: m.pos.y, z: e.z }
    const d = 'base' in target ? Math.hypot(Math.max(0, signedDistanceToBase(e, target)), m.pos.y - target.pos.y) : dist3D(p, target)
    if (d > n + EPS) return false
  }
  return true
}

// R-3.6: whole base inside the footprint polygon (any floor)
export function whollyWithinPolygon(m: Footprint, poly: Polygon): boolean {
  if (!pointInPolygon(m.pos, poly)) return false
  for (const e of baseEdgePoints(m)) if (!pointInPolygon(e, poly)) return false
  return true
}

// every base edge point lies inside `poly` or within `n` of its boundary (Hold the Line, Astra Militarum AST-4.x)
export function whollyWithinOfPolygon(m: Footprint, poly: Polygon, n: number): boolean {
  const ok = (p: Vec2): boolean => pointInPolygon(p, poly) || pointToPolygonEdge(p, poly) <= n + EPS
  if (!ok(m.pos)) return false
  for (const e of baseEdgePoints(m)) if (!ok(e)) return false
  return true
}

export function partlyWithinPolygon(m: Footprint, poly: Polygon): boolean {
  if (pointInPolygon(m.pos, poly)) return true
  for (const e of baseEdgePoints(m)) if (pointInPolygon(e, poly)) return true
  return false
}

export function whollyOnBoard(m: Footprint, board: Pick<Board, 'w' | 'h'>): boolean {
  const hw = board.w / 2, hh = board.h / 2
  for (const e of baseEdgePoints(m)) if (Math.abs(e.x) > hw + EPS || Math.abs(e.z) > hh + EPS) return false
  return true
}

// bases overlap when their outlines intersect horizontally at the same level (models on different floors may overlap in plan)
export function basesOverlap(a: Footprint, b: Footprint, verticalTolerance = 0.25): boolean {
  if (verticalGap(a, b) > verticalTolerance) return false
  if (farApart(a, b, 0)) return false
  if (isRound(a.base) && isRound(b.base)) return dist2D(a.pos, b.pos) < a.base.radius + b.base.radius - EPS
  if (signedDistanceToBase(a.pos, b) < -EPS || signedDistanceToBase(b.pos, a) < -EPS) return true
  for (const p of baseEdgePoints(a)) if (signedDistanceToBase(p, b) < -EPS) return true
  for (const p of baseEdgePoints(b)) if (signedDistanceToBase(p, a) < -EPS) return true
  return false
}

export function inBaseContact(a: Footprint, b: Footprint, tolerance = 0.01): boolean {
  return verticalGap(a, b) <= 0.25 + EPS && horizontalGap(a, b) <= tolerance
}

// ---------- engagement range (R-2.3) ----------
export function withinEngagementRange(a: Footprint, b: Footprint): boolean {
  if (farApart(a, b, ENGAGEMENT_H)) return false
  return horizontalGap(a, b) <= ENGAGEMENT_H + EPS && verticalGap(a, b) <= ENGAGEMENT_V + EPS
}

export function unitsWithinEngagementRange(modelsA: Footprint[], modelsB: Footprint[]): boolean {
  for (const a of modelsA) for (const b of modelsB) if (withinEngagementRange(a, b)) return true
  return false
}

export function anyWithinEngagementRange(m: Footprint, others: Footprint[]): boolean {
  for (const o of others) if (withinEngagementRange(m, o)) return true
  return false
}

// ---------- coherency (R-2.5, R-2.7) ----------
export function coherencyNeighboursNeeded(modelCount: number): number { return modelCount >= 7 ? 2 : 1 }

export function inCoherencyRange(a: Footprint, b: Footprint): boolean {
  if (farApart(a, b, COHERENCY_H)) return false
  return horizontalGap(a, b) <= COHERENCY_H + EPS && verticalGap(a, b) <= COHERENCY_V + EPS
}

// every model within 2" horizontally / 5" vertically of ≥1 other (≥2 others for 7+ models) AND the unit forms one
// connected group through those links [interp: R-2.6 / MEAS-014 — a 3 + 2 split is not coherent]; ≤ 1 model always is
export function isCoherent(models: Footprint[]): boolean {
  if (models.length <= 1) return true
  const need = coherencyNeighboursNeeded(models.length)
  const links: number[][] = models.map(() => [])
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      if (inCoherencyRange(models[i], models[j])) { links[i].push(j); links[j].push(i) }
    }
  }
  if (links.some((l) => l.length < need)) return false
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length > 0) {
    const i = stack.pop() as number
    for (const j of links[i]) if (!seen.has(j)) { seen.add(j); stack.push(j) }
  }
  return seen.size === models.length
}

// the connected coherency groups of a unit (largest first); used by the end-of-turn cull to show what would remain
export function coherencyGroups(models: Footprint[]): number[][] {
  const groups: number[][] = []
  const seen = new Set<number>()
  for (let start = 0; start < models.length; start++) {
    if (seen.has(start)) continue
    const group = [start]
    seen.add(start)
    for (let k = 0; k < group.length; k++) {
      for (let j = 0; j < models.length; j++) if (!seen.has(j) && inCoherencyRange(models[group[k]], models[j])) { seen.add(j); group.push(j) }
    }
    groups.push(group)
  }
  return groups.sort((a, b) => b.length - a.length)
}

// ---------- objectives (R-12.1) ----------
export function objectiveDistance(m: Footprint, obj: Pick<Objective, 'pos'>, objectiveY = 0, markerRadius = OBJECTIVE_MARKER_RADIUS): { h: number; v: number } {
  const h = Math.max(0, signedDistanceToBase(obj.pos, m) - markerRadius)
  return { h, v: Math.abs(m.pos.y - objectiveY) }
}

export function withinObjectiveRange(m: Footprint, obj: Pick<Objective, 'pos'>, objectiveY = 0, range = OBJECTIVE_RANGE, markerRadius = OBJECTIVE_MARKER_RADIUS): boolean {
  const { h, v } = objectiveDistance(m, obj, objectiveY, markerRadius)
  return h <= range + EPS && v <= ENGAGEMENT_V + EPS
}

export function onObjectiveMarker(m: Footprint, obj: Pick<Objective, 'pos'>, markerRadius = OBJECTIVE_MARKER_RADIUS): boolean {
  return signedDistanceToBase(obj.pos, m) < markerRadius - EPS
}

// ---------- pivots and paths (R-5.2, R-5.7, R-5.8, R-5.10) ----------
// 0 for round bases; oval MONSTER/VEHICLE 2"; other oval 1". (VEHICLE on a round base > 32 mm with a flying stem also 2";
// no data flag exists for stems, so the movement module passes `flyingStem` when it knows.)
export function pivotCost(base: ModelBase, keywords: readonly string[], flyingStem = false): number {
  const big = keywords.includes('MONSTER') || keywords.includes('VEHICLE')
  if (isRound(base)) return flyingStem && keywords.includes('VEHICLE') && base.radius > mmToInch(32) / 2 ? 2 : 0
  return big ? 2 : 1
}

// segment cost: horizontal length + |Δy| (climb, Manhattan) — or straight 3D for FLY ("through the air")
export function pathLength(path: Path, fly = false): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    total += fly ? dist3D(a, b) : dist2D(a, b) + Math.abs(b.y - a.y)
  }
  return total
}

export function pathChangesDirection(path: Path): boolean {
  for (let i = 2; i < path.length; i++) {
    const ax = path[i - 1].x - path[i - 2].x, az = path[i - 1].z - path[i - 2].z
    const bx = path[i].x - path[i - 1].x, bz = path[i].z - path[i - 1].z
    const cross = ax * bz - az * bx
    const dot = ax * bx + az * bz
    if (Math.abs(cross) > EPS || dot < -EPS) return true
  }
  return false
}

// points along the path every `stepLen` inches (inclusive of both ends) for mid-move checks (entering ER, crossing models)
export function samplePath(path: Path, stepLen = 0.25): Vec3[] {
  if (path.length === 0) return []
  const out: Vec3[] = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const len = dist3D(a, b)
    const n = Math.max(1, Math.ceil(len / stepLen))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
    }
  }
  return out
}

// true if the base would come within engagement range of any of `enemies` at some sampled point of the path
export function pathEntersEngagement(m: Footprint, path: Path, enemies: Footprint[]): boolean {
  for (const p of samplePath(path)) {
    const probe: Footprint = { pos: p, facing: m.facing, base: m.base }
    if (anyWithinEngagementRange(probe, enemies)) return true
  }
  return false
}

// true if the base would overlap any of `blockers` somewhere along the path (excluding the start point)
export function pathCrossesModels(m: Footprint, path: Path, blockers: Footprint[]): boolean {
  const pts = samplePath(path)
  for (let i = 1; i < pts.length; i++) {
    const probe: Footprint = { pos: pts[i], facing: m.facing, base: m.base }
    for (const b of blockers) if (basesOverlap(probe, b)) return true
  }
  return false
}

// ---------- placement validation (shared by movement, charge, pile-in, consolidate, deployment) ----------
export interface PlacementInput { modelId: ModelId; pos: Vec3; facing?: number; path?: Path }

export interface PlacementCheckInput {
  unitModels: Model[]
  placements: PlacementInput[]
  constraints: MoveConstraints
  // friendly models of other units and enemy models currently on the board
  otherFriendly: Model[]
  enemies: Model[]
  board: Pick<Board, 'w' | 'h'>
  pivotCost?: number
  fly?: boolean
  // models of `mustEndInEngagementWith` units, keyed by unit id (only needed when that constraint is used)
  engagementTargets?: Record<string, Model[]>
}

export interface ResolvedPlacement { model: Model; from: Vec3; to: Vec3; facing: number; path: Path; distance: number }

// resolves the final footprint of every model of the unit (unlisted models stay put) and validates the move against the
// constraints; returns the rejection (00-arch §8 codes) or the resolved placements. Terrain (impassable, climbs beyond
// the Manhattan rule) and mid-path engagement are the caller's responsibility (terrain service, pathEntersEngagement).
export function checkPlacements(input: PlacementCheckInput): { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const { unitModels, placements, constraints, board } = input
  const byId = new Map(unitModels.map((m) => [m.id, m]))
  const seen = new Set<ModelId>()
  const resolved: ResolvedPlacement[] = []
  for (const p of placements) {
    const model = byId.get(p.modelId)
    if (!model) return { rejection: { code: 'E_SCHEMA', reason: `model ${p.modelId} is not in the unit` } }
    if (seen.has(p.modelId)) return { rejection: { code: 'E_SCHEMA', reason: `model ${p.modelId} placed twice` } }
    seen.add(p.modelId)
    const to = roundVec3(p.pos)
    const path: Path = p.path && p.path.length >= 2 ? p.path.map(roundVec3) : [model.pos, to]
    if (dist3D(path[0], model.pos) > 1e-3) return { rejection: { code: 'E_SCHEMA', reason: `path of ${p.modelId} must start at its current position` } }
    if (dist3D(path[path.length - 1], to) > 1e-3) return { rejection: { code: 'E_SCHEMA', reason: `path of ${p.modelId} must end at pos` } }
    const facing = p.facing ?? model.facing
    let distance = pathLength(path, input.fly)
    const pivoted = Math.abs(facing - model.facing) > EPS || pathChangesDirection(path)
    if (pivoted && distance > EPS) distance += input.pivotCost ?? 0
    resolved.push({ model, from: model.pos, to, facing, path, distance })
  }
  for (const m of unitModels) if (!seen.has(m.id)) resolved.push({ model: m, from: m.pos, to: m.pos, facing: m.facing, path: [m.pos], distance: 0 })

  const finals: Footprint[] = resolved.map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base }))
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i], f = finals[i]
    const allowance = constraints.perModel[r.model.id] ?? constraints.maxDistance
    if (r.distance > allowance + 1e-3) return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} would move ${r.distance.toFixed(3)}" > ${allowance}"`, details: { modelId: r.model.id, distance: r.distance, allowance } } }
    if (!whollyOnBoard(f, board)) return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} would leave the battlefield`, details: { modelId: r.model.id } } }
    if (constraints.region && !whollyWithinPolygon(f, constraints.region)) return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} must end wholly within the allowed region`, details: { modelId: r.model.id } } }
    for (const poly of constraints.forbidden) if (partlyWithinPolygon(f, poly)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id} would end inside a forbidden region`, details: { modelId: r.model.id } } }
    for (let j = 0; j < finals.length; j++) if (i !== j && basesOverlap(f, finals[j])) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id} overlaps ${resolved[j].model.id}`, details: { modelId: r.model.id, other: resolved[j].model.id } } }
    for (const o of input.otherFriendly) if (basesOverlap(f, o)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id} overlaps ${o.id}`, details: { modelId: r.model.id, other: o.id } } }
    for (const e of input.enemies) if (basesOverlap(f, e)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id} overlaps enemy ${e.id}`, details: { modelId: r.model.id, other: e.id } } }
    if (constraints.mustEndOutsideEngagement && anyWithinEngagementRange(f, input.enemies)) return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id} would end within engagement range of an enemy`, details: { modelId: r.model.id } } }
    if (constraints.minDistanceFromEnemies > 0) {
      for (const e of input.enemies) if (horizontalGap(f, e) <= constraints.minDistanceFromEnemies + EPS) return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id} must end more than ${constraints.minDistanceFromEnemies}" from enemy models`, details: { modelId: r.model.id } } }
    }
  }
  for (const unitId of constraints.mustEndInEngagementWith) {
    const targets = input.engagementTargets?.[unitId] ?? []
    if (!unitsWithinEngagementRange(finals, targets)) return { rejection: { code: 'E_ENGAGEMENT', reason: `unit must end within engagement range of ${unitId}`, details: { targetUnitId: unitId } } }
  }
  if (constraints.mustTouch) {
    const mt = constraints.mustTouch
    const marker: Footprint = { pos: mt.pos, facing: 0, base: { shape: 'round', radius: mt.radius } }
    if (!finals.some((f) => horizontalGap(f, marker) <= 0.05 + EPS)) return { rejection: { code: 'E_NOT_AN_OPTION', reason: 'one model must touch the Cult Ambush marker' } }
  }
  if (constraints.coherency && !isCoherent(finals)) return { rejection: { code: 'E_COHERENCY', reason: 'unit would end out of coherency' } }
  return { rejection: null, resolved }
}

export function emptyMoveConstraints(maxDistance: number, overrides: Partial<MoveConstraints> = {}): MoveConstraints {
  return {
    maxDistance,
    perModel: {},
    forbidden: [],
    mustEndOutsideEngagement: false,
    mustEndInEngagementWith: [],
    mustEndCloserTo: null,
    asCloseAsPossibleTo: null,
    region: null,
    minDistanceFromEnemies: 0,
    coherency: true,
    mustTouch: null,
    ...overrides,
  }
}

// world-space transform of a local terrain polygon (rotation around Y then translation)
export function transformPolygon(poly: Polygon, pos: Vec2, rot: number): Polygon {
  const c = Math.cos(rot), s = Math.sin(rot)
  return poly.map((p) => ({ x: roundPos(pos.x + p.x * c - p.z * s), z: roundPos(pos.z + p.x * s + p.z * c) }))
}

// "Your battlefield edge" for a deployment zone: the board-perimeter segments that lie on the zone's boundary; returns the
// part of the board within `depth` of them. One edge gives a rectangle; two adjacent edges (a corner zone) give an
// L-shaped hexagon. A board side where the zone only touches a short stub (under half the longest side's length) is
// ignored, so a full-width strip is not widened by the zone's short ends. Other shapes fall back to the longest side.
export function battlefieldEdgeStrip(board: Pick<Board, 'w' | 'h'>, zone: Polygon, depth: number): Polygon {
  const hw = board.w / 2, hh = board.h / 2
  type Side = 'L' | 'R' | 'T' | 'B'
  const spans: Record<Side, [number, number] | null> = { L: null, R: null, T: null, B: null }
  const total: Record<Side, number> = { L: 0, R: 0, T: 0, B: 0 }
  const sideOf = (a: Vec2, b: Vec2): Side | null => {
    if (Math.abs(a.x + hw) < 1e-6 && Math.abs(b.x + hw) < 1e-6) return 'L'
    if (Math.abs(a.x - hw) < 1e-6 && Math.abs(b.x - hw) < 1e-6) return 'R'
    if (Math.abs(a.z + hh) < 1e-6 && Math.abs(b.z + hh) < 1e-6) return 'T'
    if (Math.abs(a.z - hh) < 1e-6 && Math.abs(b.z - hh) < 1e-6) return 'B'
    return null
  }
  for (let i = 0; i < zone.length; i++) {
    const a = zone[i], b = zone[(i + 1) % zone.length]
    const side = sideOf(a, b)
    if (!side) continue
    const vertical = side === 'L' || side === 'R'
    const lo = Math.min(vertical ? a.z : a.x, vertical ? b.z : b.x), hi = Math.max(vertical ? a.z : a.x, vertical ? b.z : b.x)
    const cur = spans[side]
    spans[side] = cur ? [Math.min(cur[0], lo), Math.max(cur[1], hi)] : [lo, hi]
    total[side] += hi - lo
  }
  const sides = (Object.keys(spans) as Side[]).filter((s) => spans[s] !== null)
  if (sides.length === 0) return zone
  const longest = Math.max(...sides.map((s) => total[s]))
  let kept = sides.filter((s) => total[s] >= longest / 2)
  const adjacent = (a: Side, b: Side): boolean => (a === 'L' || a === 'R') !== (b === 'L' || b === 'R')
  if (kept.length > 2 || (kept.length === 2 && !adjacent(kept[0], kept[1]))) kept = [kept.sort((a, b) => total[b] - total[a])[0]]
  const rect = (s: Side): { x0: number; x1: number; z0: number; z1: number } => {
    const [lo, hi] = spans[s]!
    const dx = Math.min(depth, board.w), dz = Math.min(depth, board.h)
    switch (s) {
      case 'L': return { x0: -hw, x1: -hw + dx, z0: lo, z1: hi }
      case 'R': return { x0: hw - dx, x1: hw, z0: lo, z1: hi }
      case 'T': return { x0: lo, x1: hi, z0: -hh, z1: -hh + dz }
      case 'B': return { x0: lo, x1: hi, z0: hh - dz, z1: hh }
    }
  }
  const rectPoly = (r: { x0: number; x1: number; z0: number; z1: number }): Polygon => [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }]
  if (kept.length === 1) return rectPoly(rect(kept[0]))
  // two adjacent edges: the union of their two rectangles as one L-shaped hexagon (both run into the shared corner)
  const v = rect(kept.find((s) => s === 'L' || s === 'R')!), h = rect(kept.find((s) => s === 'T' || s === 'B')!)
  const left = v.x0 < 0, top = h.z0 < 0
  const cx = left ? -hw : hw, cz = top ? -hh : hh
  // far ends of the two arms and the inner corner of the L
  const armX = left ? h.x1 : h.x0, armZ = top ? v.z1 : v.z0
  const innerX = left ? v.x1 : v.x0, innerZ = top ? h.z1 : h.z0
  return [{ x: cx, z: cz }, { x: armX, z: cz }, { x: armX, z: innerZ }, { x: innerX, z: innerZ }, { x: innerX, z: armZ }, { x: cx, z: armZ }]
}

// the board side a deployment zone's longest edge lies along ('L' = -x, 'R' = +x, 'T' = -z, 'B' = +z). Zones touching no
// board side fall back to the side nearest the zone's centroid. Used by Grey Knights No Escape ("closest to their edge").
export function playerBattlefieldEdge(board: Pick<Board, 'w' | 'h'>, zone: Polygon): 'L' | 'R' | 'T' | 'B' {
  const hw = board.w / 2, hh = board.h / 2
  const total = { L: 0, R: 0, T: 0, B: 0 }
  for (let i = 0; i < zone.length; i++) {
    const a = zone[i], b = zone[(i + 1) % zone.length]
    if (Math.abs(a.x + hw) < 1e-6 && Math.abs(b.x + hw) < 1e-6) total.L += Math.abs(b.z - a.z)
    else if (Math.abs(a.x - hw) < 1e-6 && Math.abs(b.x - hw) < 1e-6) total.R += Math.abs(b.z - a.z)
    else if (Math.abs(a.z + hh) < 1e-6 && Math.abs(b.z + hh) < 1e-6) total.T += Math.abs(b.x - a.x)
    else if (Math.abs(a.z - hh) < 1e-6 && Math.abs(b.z - hh) < 1e-6) total.B += Math.abs(b.x - a.x)
  }
  const sides = (['L', 'R', 'T', 'B'] as const).filter((s) => total[s] > 0).sort((x, y) => total[y] - total[x])
  if (sides.length > 0) return sides[0]
  const cx = zone.reduce((n, p) => n + p.x, 0) / Math.max(1, zone.length), cz = zone.reduce((n, p) => n + p.z, 0) / Math.max(1, zone.length)
  const d = { L: cx + hw, R: hw - cx, T: cz + hh, B: hh - cz }
  return ([...['L', 'R', 'T', 'B']] as ('L' | 'R' | 'T' | 'B')[]).sort((x, y) => d[x] - d[y])[0]
}
