// Pure helpers that decide which terrain GLB covers a footprint and how it is rotated to fit.
// Model contract: y up, origin at bottom-face centre, long horizontal side along X; ruin-corner has
// its two walls on the -X and -Z edges (corner at min X, min Z). Pieces arrive in board space
// (engine already applied pos/rot), so footprints are world polygons.
import type { Polygon } from '@/data/types'
import type { RuinSlug } from './ruinModels.config'

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number; w: number; d: number }

export function polygonBounds(polygon: Polygon): Bounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: Math.max(maxX - minX, 0.01), d: Math.max(maxZ - minZ, 0.01) }
}

export type FitPlan =
  | { shape: 'L'; slug: RuinSlug; turns: number }
  | { shape: 'rect'; slug: RuinSlug; flip: boolean }

const EPS = 1e-3

/** Which bbox corners (signed -1 = min, +1 = max) are vertices of the polygon. */
function matchedCorners(polygon: Polygon, b: Bounds): { sx: number; sz: number }[] {
  const out: { sx: number; sz: number }[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx < 0 ? b.minX : b.maxX
      const z = sz < 0 ? b.minZ : b.maxZ
      if (polygon.some((p) => Math.abs(p.x - x) < EPS && Math.abs(p.z - z) < EPS)) out.push({ sx, sz })
    }
  }
  return out
}

/** Quarter turns about +Y (three.js rotation.y = turns * PI/2) that move the model's
 *  (min X, min Z) corner to the given signed bbox corner. */
function cornerTurns(sx: number, sz: number): number {
  if (sx < 0 && sz < 0) return 0
  if (sx < 0 && sz > 0) return 1
  if (sx > 0 && sz > 0) return 2
  return 3
}

/** Deterministic small integer from a piece id: trailing digits when present (so "ruin-s1" and
 *  "ruin-s2" always differ), else a string hash. */
export function idVariant(id: string): number {
  const m = /(\d+)\D*$/.exec(id)
  if (m) return parseInt(m[1], 10)
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  return h
}

/** Plans a ruin: L footprint -> ruin-corner; rectangle -> tall/facade/small. null = no model fits. */
export function planRuin(id: string, polygon: Polygon, height: number): FitPlan | null {
  const b = polygonBounds(polygon)
  const corners = matchedCorners(polygon, b)
  if (polygon.length === 6 && corners.length === 3) {
    const all = [{ sx: -1, sz: -1 }, { sx: -1, sz: 1 }, { sx: 1, sz: -1 }, { sx: 1, sz: 1 }]
    const missing = all.find((c) => !corners.some((m) => m.sx === c.sx && m.sz === c.sz))!
    // The L's corner vertex is the bbox corner opposite the notch.
    return { shape: 'L', slug: 'ruin-corner', turns: cornerTurns(-missing.sx, -missing.sz) }
  }
  if (corners.length === 4) {
    const v = idVariant(id)
    const slug: RuinSlug = height > Math.max(b.w, b.d) ? 'ruin-tall' : v % 2 === 0 ? 'ruin-facade' : 'ruin-small'
    return { shape: 'rect', slug, flip: Math.floor(v / 2) % 2 === 1 }
  }
  return null
}

/** Quarter turns for the given plan once the model's own size is known. */
export function planTurns(plan: FitPlan, modelSize: readonly [number, number, number], b: Bounds): number {
  if (plan.shape === 'L') return plan.turns
  return simpleTurns(modelSize, b) + (plan.flip ? 2 : 0)
}

/** Long-side rule only (barricade / crater): rotate 90 degrees when the model's long side is not
 *  the footprint's long side. */
export function simpleTurns(modelSize: readonly [number, number, number], b: Bounds): number {
  const modelLongX = modelSize[0] >= modelSize[2]
  const footLongX = b.w >= b.d
  return modelLongX === footLongX ? 0 : 1
}
