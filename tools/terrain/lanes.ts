// Terrain lane analysis shared by tools/terrain/check-lanes.ts and tests/data/terrainLanes.test.ts (CP-3.4).
// Pure geometry on the layout/mission JSON; the engine's own helpers (pointInPolygon, withinObjectiveRange) supply the
// base/objective maths so the check agrees with the rules code.
//
// What blocks a big (non-INFANTRY, no FLY) model, per src/engine/terrain.ts:
//   - ruin WALLS (crossesImpassable; canEndAt keeps a base clear of a wall by radius + thickness/2)
//   - CRATE footprints (a model cannot end inside a solid piece; treated as impassable for lane purposes)
//   - BARRICADE footprints (a model may never end on one)
// A ruin FOOTPRINT only matters at set-up (deployTerrainBlock: a big model may not start partly inside one); it does not
// block movement, so it is not a lane obstacle but is excluded from the start cells.
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, pointInPolygon, pointToSegment, withinObjectiveRange } from '../../src/engine/geometry'
import type { DataBundle, MissionData, TerrainLayoutData, TerrainPieceData } from '../../src/data/types'

export interface V2 { x: number; z: number }
export type Shape = { piece: string; kind: 'seg'; a: V2; b: V2; half: number } | { piece: string; kind: 'poly'; pts: V2[] }

export const MM = 25.4
export const CLOSED_GAP = 0.25 // a gap narrower than this is "effectively closed" (nothing fits, nothing is trapped)
export const LANE_MARGIN = 0.5 // slack over the base's smallest dimension

/** Largest non-INFANTRY model footprint over every datasheet in every roster (by area); lane width L = its smallest dimension + margin. */
export function largestBase(bundle: DataBundle): { id: string; mm: number; mm2: number; shape: string; keywords: string[]; laneWidth: number; radius: number } {
  let best: { id: string; mm: number; mm2: number; shape: string; keywords: string[]; area: number } | null = null
  for (const ds of Object.values(bundle.datasheets)) {
    if (ds.keywords.includes('INFANTRY')) continue
    for (const m of ds.composition) {
      const mm2 = m.base.mm2 ?? m.base.mm
      const area = m.base.mm * mm2
      if (!best || area > best.area) best = { id: ds.id, mm: m.base.mm, mm2, shape: m.base.shape, keywords: ds.keywords, area }
    }
  }
  if (!best) throw new Error('no datasheets')
  const small = Math.min(best.mm, best.mm2) / MM
  return { ...best, laneWidth: small + LANE_MARGIN, radius: Math.max(best.mm, best.mm2) / MM / 2 }
}

export function obstacles(layout: TerrainLayoutData): Shape[] {
  const out: Shape[] = []
  for (const p of layout.pieces as TerrainPieceData[]) {
    if (p.kind === 'ruin') for (const w of p.walls ?? []) out.push({ piece: p.id, kind: 'seg', a: w.a, b: w.b, half: (w.thickness ?? 0.25) / 2 })
    else if (p.kind === 'crate' || p.kind === 'barricade') out.push({ piece: p.id, kind: 'poly', pts: p.footprint })
  }
  return out
}

// ---------- distances ----------
const sub = (p: V2, q: V2): V2 => ({ x: p.x - q.x, z: p.z - q.z })
const cross = (p: V2, q: V2) => p.x * q.z - p.z * q.x
function segsIntersect(a: V2, b: V2, c: V2, d: V2): boolean {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s)
  if (Math.abs(den) < 1e-12) return false
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}
const segSeg = (a: V2, b: V2, c: V2, d: V2) => segsIntersect(a, b, c, d) ? 0 : Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b))
const edges = (pts: V2[]): [V2, V2][] => pts.map((p, i) => [p, pts[(i + 1) % pts.length]])
function segPoly(a: V2, b: V2, pts: V2[]): number {
  if (pointInPolygon(a, pts) || pointInPolygon(b, pts)) return 0
  return Math.min(...edges(pts).map(([c, d]) => segSeg(a, b, c, d)))
}
function polyPoly(p: V2[], q: V2[]): number {
  if (pointInPolygon(p[0], q) || pointInPolygon(q[0], p)) return 0
  return Math.min(...edges(p).map(([a, b]) => segPoly(a, b, q)))
}
/** Surface-to-surface distance between two obstacle shapes (0 when they touch or overlap). */
export function shapeGap(s: Shape, t: Shape): number {
  if (s.kind === 'seg' && t.kind === 'seg') return Math.max(0, segSeg(s.a, s.b, t.a, t.b) - s.half - t.half)
  if (s.kind === 'seg' && t.kind === 'poly') return Math.max(0, segPoly(s.a, s.b, t.pts) - s.half)
  if (s.kind === 'poly' && t.kind === 'seg') return shapeGap(t, s)
  return polyPoly((s as { pts: V2[] }).pts, (t as { pts: V2[] }).pts)
}
/** Distance from a point to the shape's surface (0 inside a polygon). */
export function pointShapeDistance(p: V2, s: Shape): number {
  if (s.kind === 'seg') return Math.max(0, pointToSegment(p, s.a, s.b) - s.half)
  if (pointInPolygon(p, s.pts)) return 0
  return Math.min(...edges(s.pts).map(([a, b]) => pointToSegment(p, a, b)))
}
/** Extent of a shape along each axis, inflated by half-thickness for walls. */
export function shapeBounds(s: Shape) {
  const pts = s.kind === 'seg' ? [s.a, s.b] : s.pts
  const h = s.kind === 'seg' ? s.half : 0
  return { minX: Math.min(...pts.map((p) => p.x)) - h, maxX: Math.max(...pts.map((p) => p.x)) + h, minZ: Math.min(...pts.map((p) => p.z)) - h, maxZ: Math.max(...pts.map((p) => p.z)) + h }
}

// ---------- lane rule (CP-3.4) ----------
export interface GapReport { a: string; b: string; gap: number }
/** Every pair of different pieces (or piece vs board edge: b = 'edge-W' etc.) whose gap is neither closed nor >= laneWidth. */
export function laneViolations(layout: TerrainLayoutData, laneWidth: number): GapReport[] {
  const shapes = obstacles(layout)
  const w2 = layout.board.w / 2, h2 = layout.board.h / 2
  const bad = (gap: number) => gap >= CLOSED_GAP && gap < laneWidth
  const best = new Map<string, number>()
  const note = (a: string, b: string, gap: number) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    best.set(key, Math.min(best.get(key) ?? Infinity, gap))
  }
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) if (shapes[i].piece !== shapes[j].piece) note(shapes[i].piece, shapes[j].piece, shapeGap(shapes[i], shapes[j]))
    const b = shapeBounds(shapes[i])
    note(shapes[i].piece, 'edge-W', b.minX + w2)
    note(shapes[i].piece, 'edge-E', w2 - b.maxX)
    note(shapes[i].piece, 'edge-S', b.minZ + h2)
    note(shapes[i].piece, 'edge-N', h2 - b.maxZ)
  }
  const out: GapReport[] = []
  for (const [key, gap] of best) if (bad(gap)) { const [a, b] = key.split('|'); out.push({ a, b, gap }) }
  return out.sort((x, y) => x.gap - y.gap)
}

// ---------- chokepoints (CP-3.4 passage form of the lane rule) ----------
// The literal "every pair of pieces is >= L apart or touching" test cannot be met with L = 5.6" on a 30" board (12 pieces,
// every pair and every board edge), and most of the pairs it rejects are not passages at all. What matters is passages:
// two places a big base fits (centre >= L/2 from every obstacle and from the board edge) must be joined by a lane at
// least L wide whenever a small model (gap >= CLOSED_GAP) can get from one to the other. Gaps < CLOSED_GAP seal a lane.
export interface Choke { x: number; z: number; cells: number; bottleneck: number }
export interface ClearanceField { nx: number; nz: number; step: number; w2: number; h2: number; clear: Float32Array }
export function clearanceField(layout: TerrainLayoutData, step: number): ClearanceField {
  const shapes = obstacles(layout)
  const w2 = layout.board.w / 2, h2 = layout.board.h / 2
  const nx = Math.round(layout.board.w / step) + 1, nz = Math.round(layout.board.h / step) + 1
  const clear = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const p = { x: -w2 + i * step, z: -h2 + j * step }
    let d = Math.min(p.x + w2, w2 - p.x, p.z + h2, h2 - p.z)
    for (const s of shapes) { const e = pointShapeDistance(p, s); if (e < d) d = e }
    clear[j * nx + i] = d
  }
  return { nx, nz, step, w2, h2, clear }
}
/** Places where a base of width `laneWidth` fits but cannot get to the main open area through a lane of that width, although
 *  a model needing only CLOSED_GAP could (the connection is a too-narrow gap, not a sealed one). */
export function chokepoints(layout: TerrainLayoutData, laneWidth: number, step = 0.1, closedGap = CLOSED_GAP, field = clearanceField(layout, step)): Choke[] {
  const { nx, nz, clear } = field
  const rho = laneWidth / 2, tiny = closedGap / 2
  const n = nx * nz
  // label components of the big-disc space
  const comp = new Int32Array(n).fill(-1)
  const sizes: number[] = [], seed: number[] = []
  const stack: number[] = []
  for (let k0 = 0; k0 < n; k0++) {
    if (comp[k0] >= 0 || clear[k0] < rho) continue
    const id = sizes.length; sizes.push(0); seed.push(k0)
    comp[k0] = id; stack.push(k0)
    while (stack.length) {
      const k = stack.pop()!; sizes[id]++
      const i = k % nx, j = (k - i) / nx
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const a = i + di, b = j + dj
        if ((!di && !dj) || a < 0 || b < 0 || a >= nx || b >= nz) continue
        const kk = b * nx + a
        if (comp[kk] < 0 && clear[kk] >= rho) { comp[kk] = id; stack.push(kk) }
      }
    }
  }
  if (sizes.length <= 1) return []
  const main = sizes.indexOf(Math.max(...sizes))
  // widest-path (max over paths of the min clearance) labels from the main component through the tiny-disc space
  const width = new Float32Array(n).fill(-1)
  const heap: number[] = []
  const push = (k: number) => { heap.push(k); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (width[heap[p]] >= width[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p } }
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && width[heap[l]] > width[heap[m]]) m = l; if (r < heap.length && width[heap[r]] > width[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m } } return top }
  for (let k = 0; k < n; k++) if (comp[k] === main) { width[k] = clear[k]; push(k) }
  while (heap.length) {
    const k = pop()
    const i = k % nx, j = (k - i) / nx
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = i + di, b = j + dj
      if ((!di && !dj) || a < 0 || b < 0 || a >= nx || b >= nz) continue
      const kk = b * nx + a
      if (clear[kk] < tiny) continue
      const w = Math.min(width[k], clear[kk])
      if (w > width[kk]) { width[kk] = w; push(kk) }
    }
  }
  const out: Choke[] = []
  for (let id = 0; id < sizes.length; id++) {
    if (id === main) continue
    let bk = -1
    for (let k = 0; k < n; k++) if (comp[k] === id && width[k] > bk) bk = width[k]
    if (bk >= tiny) { const s = seed[id]; const i = s % nx; out.push({ x: -field.w2 + i * step, z: -field.h2 + ((s - i) / nx) * step, cells: sizes[id], bottleneck: bk * 2 }) }
  }
  return out
}

// ---------- objective clearance (R-3.10, RC-052) ----------
/** Gap from each objective marker's EDGE to every impassable part of every piece (ruin walls, crates, barricades); must be > 1".
 *  A marker may sit inside a ruin's footprint: the footprint is open area terrain (RC-052: "ruins are fine"). */
export function objectiveClearances(layout: TerrainLayoutData, mission: MissionData): { objective: string; piece: string; gap: number }[] {
  const out: { objective: string; piece: string; gap: number }[] = []
  const mr = mission.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  for (const o of mission.objectives) {
    const c = { x: o.x, z: o.z }
    for (const p of layout.pieces as TerrainPieceData[]) {
      let d = Infinity
      if (p.kind === 'crater') continue // flat ground cover, never impassable
      const shapes = obstacles({ ...layout, pieces: [p] } as TerrainLayoutData)
      for (const s of shapes) d = Math.min(d, pointShapeDistance(c, s))
      out.push({ objective: o.id, piece: p.id, gap: d - mr })
    }
  }
  return out
}

// ---------- reachability ----------
export interface Reach { zone: string; objective: string; ok: boolean }
export function reachability(layout: TerrainLayoutData, mission: MissionData, radius: number, step = 0.25): { startCells: Record<string, number>; reach: Reach[] } {
  const shapes = obstacles(layout)
  const ruinFootprints = (layout.pieces as TerrainPieceData[]).filter((p) => p.kind === 'ruin').map((p) => p.footprint)
  const w2 = layout.board.w / 2, h2 = layout.board.h / 2
  const nx = Math.round(layout.board.w / step) + 1, nz = Math.round(layout.board.h / step) + 1
  const px = (i: number) => -w2 + i * step, pz = (j: number) => -h2 + j * step
  const free = new Uint8Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const p = { x: px(i), z: pz(j) }
    if (p.x < -w2 + radius - 1e-9 || p.x > w2 - radius + 1e-9 || p.z < -h2 + radius - 1e-9 || p.z > h2 - radius + 1e-9) continue
    if (shapes.some((s) => pointShapeDistance(p, s) < radius - 1e-9)) continue
    free[j * nx + i] = 1
  }
  // objective markers are tokens, not obstacles
  const objs = mission.objectives
  const mr = mission.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const inRange = (p: V2, o: { id: string; x: number; z: number }) => withinObjectiveRange({ pos: { x: p.x, y: 0, z: p.z }, facing: 0, base: { shape: 'round', radius } }, { pos: { x: o.x, z: o.z } }, 0, OBJECTIVE_RANGE, mr)
  const startCells: Record<string, number> = {}
  const reach: Reach[] = []
  for (const [zone, poly] of Object.entries(mission.deploymentZones)) {
    // set-up legality for a big model (deployTerrainBlock): base not partly inside a ruin footprint; centre inside the zone
    // (a 130 mm base is wider than the 5" zones, which the engine lets touch the battlefield edge)
    const seen = new Uint8Array(nx * nz)
    const queue: number[] = []
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (!free[k]) continue
      const p = { x: px(i), z: pz(j) }
      if (!pointInPolygon(p, poly)) continue
      if (ruinFootprints.some((fp) => pointInPolygon(p, fp) || edges(fp).some(([a, b]) => pointToSegment(p, a, b) < radius))) continue
      seen[k] = 1; queue.push(k)
    }
    startCells[zone] = queue.length
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h], i = k % nx, j = (k - i) / nx
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ni = i + di, nj = j + dj
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
        const nk = nj * nx + ni
        if (free[nk] && !seen[nk]) { seen[nk] = 1; queue.push(nk) }
      }
    }
    for (const o of objs) {
      let ok = false
      for (const k of queue) { const i = k % nx, j = (k - i) / nx; if (inRange({ x: px(i), z: pz(j) }, o)) { ok = true; break } }
      reach.push({ zone, objective: o.id, ok })
    }
  }
  return { startCells, reach }
}

export function missionsUsing(bundle: DataBundle, layoutId: string): MissionData[] {
  // a mission's FIRST layout is the one the game plays (src/client/store/game.ts); later entries exist only for engine tests
  return Object.values(bundle.missions).filter((m) => m.terrainLayouts[0] === layoutId)
}

/** 180-degree rotational symmetry: every piece maps onto another of the same kind whose footprint vertices coincide. */
export function symmetryErrors(layout: TerrainLayoutData, tol = 0.01): string[] {
  const errs: string[] = []
  const rot = (p: V2): V2 => ({ x: -p.x, z: -p.z })
  const same = (a: V2[], b: V2[]) => a.length === b.length && a.every((p) => b.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= tol))
  for (const piece of layout.pieces as TerrainPieceData[]) {
    const mirror = (layout.pieces as TerrainPieceData[]).find((q) => q.kind === piece.kind && same(piece.footprint.map(rot), q.footprint))
    if (!mirror) { errs.push(`${piece.id}: no 180-degree partner`); continue }
    const wallsOk = (piece.walls ?? []).length === (mirror.walls ?? []).length
      && (piece.walls ?? []).every((w) => (mirror.walls ?? []).some((m) => same([rot(w.a), rot(w.b)], [m.a, m.b])))
    const floorsOk = (piece.floors ?? []).every((f) => (mirror.floors ?? []).some((g) => g.height === f.height && same(f.polygon.map(rot), g.polygon)))
    if (!wallsOk || !floorsOk) errs.push(`${piece.id}: walls/floors do not match partner ${mirror.id}`)
  }
  return errs
}
