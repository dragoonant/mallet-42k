// Per-board terrain variant plan (visual only). Every piece of a kind is dealt a slug from the kind's pool by shuffling
// the pool with the game seed and handing entries out round-robin in piece-id order, so two pieces of a kind differ
// whenever the pool allows, and the same seed (a replay, the other player) always gives the same board.
// `?terrainSeed=<n>` overrides the game seed for screenshots / tests.
import { VARIANT_KIND_OF, variantPool } from './terrainCatalog'
import type { TerrainPieceData } from '@/data/types'

/** Deterministic 32-bit string hash (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Uniform [0,1) from a string seed. */
export function seedUnit(seed: string): number {
  let t = (hashSeed(seed) + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Fisher-Yates shuffle driven by the seed (returns a copy). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(seedUnit(`${seed}:${i}`) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface PieceVariant {
  /** GLB slug for crate / barricade / crater pieces (undefined for ruins and procedural kinds). */
  slug?: string
  /** Extra half turn on a footprint-fitted GLB (the bbox fit is unchanged by 180 degrees). */
  flip: boolean
  /** Per-piece seed for dressing (rubble scatter, decal spin, crater stones) and for the ruin panel picks (planWallPanels). */
  dress: string
}

/** The `?terrainSeed=<n>` override if present, else the game seed. */
export function resolveTerrainSeed(gameSeed: string): string {
  try {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('terrainSeed') : null
    if (q !== null && q !== '') return `terrain:${q}`
  } catch { /* no window */ }
  return `terrain:${gameSeed}`
}

export function planTerrainVariants(pieces: readonly Pick<TerrainPieceData, 'id' | 'kind'>[], seed: string): Map<string, PieceVariant> {
  const out = new Map<string, PieceVariant>()
  const sorted = [...pieces].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const counters = new Map<string, number>()
  for (const piece of sorted) {
    const vk = VARIANT_KIND_OF[piece.kind]
    const dress = `${seed}:${piece.id}`
    const variant: PieceVariant = { flip: seedUnit(`${dress}:flip`) < 0.5, dress }
    if (vk && vk !== 'ruinWall') {
      const pool = seededShuffle(variantPool(vk), `${seed}:${vk}`)
      const n = counters.get(vk) ?? 0
      counters.set(vk, n + 1)
      variant.slug = pool[n % pool.length]
    }
    out.set(piece.id, variant)
  }
  return out
}
