// Pure helpers that decide which terrain GLB covers a footprint and how it is rotated to fit.
// Model contract: y up, origin at bottom-face centre, long horizontal side along X; ruin-corner has
// its two walls on the -X and -Z edges (corner at min X, min Z). Pieces arrive in board space
// (engine already applied pos/rot), so footprints are world polygons.
import type { Polygon } from '@/data/types'

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
  | { shape: 'L'; slug: string; turns: number }
  | { shape: 'rect'; slug: string; flip: boolean }

/** One enabled manifest entry. `shape` is present on newer models ('corner' = L footprint, 'rect');
 *  entries without it keep the original name-based rules. */
export interface RuinCatalogEntry { slug: string; shape?: 'corner' | 'rect'; size?: readonly number[] }

/** The four original models, used when no manifest catalog is available (and by the unit tests). */
export const LEGACY_CATALOG: readonly RuinCatalogEntry[] = [
  { slug: 'ruin-corner' }, { slug: 'ruin-facade' }, { slug: 'ruin-small' }, { slug: 'ruin-tall' },
]

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

/** Candidate slugs for an L footprint: shape 'corner' entries, or the legacy ruin-corner. */
function cornerPool(catalog: readonly RuinCatalogEntry[]): string[] {
  const out = catalog.filter((e) => e.shape === 'corner' || (!e.shape && e.slug === 'ruin-corner')).map((e) => e.slug)
  return out.sort()
}

/** Candidate slugs for a rectangle. Legacy: facade + small (tall pieces: ruin-tall); plus every
 *  'rect' entry (for tall pieces only those at least as tall as wide, when any exist). */
function rectPool(catalog: readonly RuinCatalogEntry[], tall: boolean): string[] {
  const has = (slug: string) => catalog.some((e) => !e.shape && e.slug === slug)
  const rects = catalog.filter((e) => e.shape === 'rect')
  const tallRects = rects.filter((e) => e.size && e.size[1] >= Math.max(e.size[0], e.size[2]))
  const shaped = (tall && tallRects.length ? tallRects : rects).map((e) => e.slug).sort()
  const legacy = tall ? ['ruin-tall'].filter(has) : ['ruin-facade', 'ruin-small'].filter(has)
  const pool = [...legacy, ...shaped]
  if (pool.length) return pool
  return [...['ruin-facade', 'ruin-small', 'ruin-tall'].filter(has), ...rects.map((e) => e.slug).sort()]
}

/** Plans a ruin: L footprint -> a corner model; rectangle -> one of the rect models, chosen
 *  deterministically from the piece id so a piece always looks the same. null = no model fits. */
export function planRuin(id: string, polygon: Polygon, height: number, catalog: readonly RuinCatalogEntry[] = LEGACY_CATALOG): FitPlan | null {
  const b = polygonBounds(polygon)
  const corners = matchedCorners(polygon, b)
  if (polygon.length === 6 && corners.length === 3) {
    const pool = cornerPool(catalog)
    if (!pool.length) return null
    const all = [{ sx: -1, sz: -1 }, { sx: -1, sz: 1 }, { sx: 1, sz: -1 }, { sx: 1, sz: 1 }]
    const missing = all.find((c) => !corners.some((m) => m.sx === c.sx && m.sz === c.sz))!
    // The L's corner vertex is the bbox corner opposite the notch.
    return { shape: 'L', slug: pool[idVariant(id) % pool.length], turns: cornerTurns(-missing.sx, -missing.sz) }
  }
  if (corners.length === 4) {
    const v = idVariant(id)
    const pool = rectPool(catalog, height > Math.max(b.w, b.d))
    if (!pool.length) return null
    // Pick and flip use independent bits of the variant so neighbours differ in both.
    return { shape: 'rect', slug: pool[v % pool.length], flip: Math.floor(v / Math.max(pool.length, 2)) % 2 === 1 }
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

/** Whirr-style uniform fit. Given the model's size after `turns`, returns x/z scales: if they differ
 *  by more than 15% both use the smaller (model stays centred, never stretched), else each axis
 *  fits its own extent exactly. */
export function fitScaleXZ(rx: number, rz: number, b: Bounds): [number, number] {
  const sx = b.w / rx
  const sz = b.d / rz
  if (Math.max(sx, sz) / Math.min(sx, sz) > 1.15) {
    const m = Math.min(sx, sz)
    return [m, m]
  }
  return [sx, sz]
}
