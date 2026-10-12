// RUIN KIT: ruins are composed from the rules data instead of one image-to-3D blob (40k ruins are hollow, models
// stand inside). Each data wall becomes one or more panels cut from a wall-section GLB and stretched to exactly
// length x height x (thickness + RUIN_KIT_DEPTH_PAD); gaps split the wall; corners get a pillar. Pure geometry here
// (no three/react) so tests can assert the fit; Terrain.tsx draws it.
import type { Vec2, WallData } from '@/data/types'
import { seededUnit } from './geometry'
import { seedUnit, seededShuffle } from './terrainVariants'
import { ENGINE_DEFAULT_WALL_THICKNESS, RUIN_KIT_DEPTH_PAD, RUIN_KIT_MAX_DEPTH_RATIO } from './terrainCatalog'

export interface KitModel { slug: string; size: readonly [number, number, number] }

/** Slab-like models only (thin in depth), in a stable order. */
export function slabPool(models: readonly KitModel[]): KitModel[] {
  return models.filter((m) => m.size[2] / m.size[0] <= RUIN_KIT_MAX_DEPTH_RATIO).sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Solid boxes of a wall (u = 0..1 along a->b, y range) honouring the engine's gaps, so the drawn panel is solid
 *  exactly where the engine says it is (wallOccupiesPoint / wallCrosses3D). */
export function wallBoxes(wall: WallData): { u0: number; u1: number; y0: number; y1: number }[] {
  const gaps = [...(wall.gaps ?? [])].sort((p, q) => p.from - q.from)
  const out: { u0: number; u1: number; y0: number; y1: number }[] = []
  let u = 0
  for (const g of gaps) {
    const from = Math.max(g.from, u), to = Math.min(g.to, 1)
    if (to <= from) continue
    if (from > u) out.push({ u0: u, u1: from, y0: 0, y1: wall.height })
    const bottom = g.bottom ?? 0, top = g.top ?? wall.height
    if (bottom > 0) out.push({ u0: from, u1: to, y0: 0, y1: Math.min(bottom, wall.height) })
    if (top < wall.height) out.push({ u0: from, u1: to, y0: Math.max(top, 0), y1: wall.height })
    u = to
  }
  if (u < 1) out.push({ u0: u, u1: 1, y0: 0, y1: wall.height })
  return out
}

/** One wall panel in the wall's local frame (x along a->b from the wall midpoint, y up from the ground, z across). */
export interface KitPanel {
  slug: string
  x: number // centre along the wall
  y0: number // bottom
  width: number // exact length along the wall
  height: number // exact height
  depth: number // exact depth across the wall
  mirror: boolean
}

export const wallThickness = (w: WallData): number => w.thickness ?? ENGINE_DEFAULT_WALL_THICKNESS
export const wallLength = (w: WallData): number => Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z)

/** Panels for one wall; deterministic from `seed` (the board's per-piece dress seed; defaults to the piece id) + wall
 *  index. The pool is shuffled per piece and no two neighbouring panels use the same model when the pool has a choice,
 *  so mirrored ruins differ panel for panel. Panels tile each solid box exactly. */
export function planWallPanels(pieceId: string, wallIndex: number, wall: WallData, poolIn: readonly KitModel[], seed: string = pieceId): KitPanel[] {
  if (!poolIn.length) return []
  const pool = seededShuffle(poolIn, `${seed}-pool`)
  let prev = -1
  const L = wallLength(wall)
  const depth = wallThickness(wall) + RUIN_KIT_DEPTH_PAD
  const out: KitPanel[] = []
  wallBoxes(wall).forEach((bx, bi) => {
    const len = (bx.u1 - bx.u0) * L
    const height = bx.y1 - bx.y0
    if (len < 0.01 || height < 0.01) return
    // about one panel per 1.1 wall-heights of length, so a panel keeps roughly the proportions of its model
    const n = Math.max(1, Math.round(len / (Math.max(wall.height, 1) * 1.1)))
    for (let k = 0; k < n; k++) {
      const pseed = `${seed}-w${wallIndex}-b${bi}-p${k}`
      let pick = Math.floor(seedUnit(`${pseed}-m`) * pool.length) % pool.length
      if (pool.length > 1 && pick === prev) pick = (pick + 1) % pool.length
      prev = pick
      const model = pool[pick]
      out.push({
        slug: model.slug,
        x: (bx.u0 - 0.5) * L + ((k + 0.5) / n) * len,
        y0: bx.y0,
        width: len / n,
        height,
        depth,
        mirror: seedUnit(`${pseed}-f`) < 0.5,
      })
    }
  })
  return out
}

/** Scale that fits a model of `size` to the panel's exact box (negative x when mirrored). */
export function panelScale(p: KitPanel, size: readonly [number, number, number]): [number, number, number] {
  return [(p.mirror ? -1 : 1) * (p.width / size[0]), p.height / size[1], p.depth / size[2]]
}
/** The fitted bbox size of a panel (model size * scale). */
export function panelFittedSize(p: KitPanel, size: readonly [number, number, number]): [number, number, number] {
  const s = panelScale(p, size)
  return [Math.abs(s[0]) * size[0], s[1] * size[1], s[2] * size[2]]
}

export interface KitPillar { x: number; z: number; side: number; height: number }

const EPS = 1e-3
/** A pillar wherever two or more walls meet. Side = the thinnest wall's panel depth (inside both walls' thickness
 *  plus the allowed relief), height = 85-100% of the lowest wall there, so the join reads as an intentional broken post. */
export function planPillars(pieceId: string, walls: readonly WallData[]): KitPillar[] {
  const at: { p: Vec2; walls: WallData[] }[] = []
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const hit = at.find((e) => Math.abs(e.p.x - p.x) < EPS && Math.abs(e.p.z - p.z) < EPS)
      if (hit) hit.walls.push(w)
      else at.push({ p, walls: [w] })
    }
  }
  return at
    .filter((e) => e.walls.length >= 2)
    .map((e, i) => ({
      x: e.p.x,
      z: e.p.z,
      side: Math.min(...e.walls.map(wallThickness)) + RUIN_KIT_DEPTH_PAD,
      height: Math.min(...e.walls.map((w) => w.height)) * (0.85 + 0.15 * seededUnit(`${pieceId}-pillar-${i}`)),
    }))
}
