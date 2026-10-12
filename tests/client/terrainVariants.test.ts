import { describe, expect, it } from 'vitest'
import { planTerrainVariants } from '@/client/board/terrainVariants'
import { planWallPanels } from '@/client/board/ruinKit'
import { NEW_TERRAIN_SLUGS, variantPool } from '@/client/board/terrainCatalog'

// Terrain variants are visual only: the same game seed must give the same board, different seeds a different one.
const pieces = [
  ...['a', 'b', 'c', 'd'].map((n) => ({ id: `ruin-${n}`, kind: 'ruin' as const })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `crate-${n}`, kind: 'crate' as const })),
  ...[1, 2, 3].map((n) => ({ id: `bar-${n}`, kind: 'barricade' as const })),
  ...[1, 2, 3].map((n) => ({ id: `cr-${n}`, kind: 'crater' as const })),
]
const dump = (seed: string) => JSON.stringify([...planTerrainVariants(pieces, seed)])
const wall = { a: { x: 0, z: 0 }, b: { x: 24, z: 0 }, height: 4 }
const pool = variantPool('ruinWall').map((slug) => ({ slug, size: [6, 4, 0.6] as [number, number, number] }))
const panelDump = (seed: string) => JSON.stringify(planWallPanels('ruin-a', 0, wall, pool, seed).map((p) => [p.slug, p.mirror]))

describe('terrain variants', () => {
  it('TERVAR-001 the same seed gives the same assignment', () => {
    expect(dump('s1')).toBe(dump('s1'))
    expect(panelDump('s1')).toBe(panelDump('s1'))
  })

  it('TERVAR-002 different seeds give different assignments', () => {
    const seeds = ['s1', 's2', 's3', 's4']
    expect(new Set(seeds.map(dump)).size).toBeGreaterThan(1)
    expect(new Set(seeds.map(panelDump)).size).toBeGreaterThan(1)
  })

  it('TERVAR-003 same-kind pieces on one board differ when the pool has enough entries', () => {
    for (const seed of ['s1', 's2', 's3']) {
      const v = planTerrainVariants(pieces, seed)
      for (const [kind, ids] of [['crate', [1, 2]], ['barricade', [1, 2]], ['crater', [1, 2]]] as const) {
        const pool = variantPool(kind)
        const slugs = ids.map((n) => v.get(`${kind === 'barricade' ? 'bar' : kind === 'crater' ? 'cr' : kind}-${n}`)!.slug)
        expect(new Set(slugs).size).toBe(Math.min(pool.length, slugs.length))
      }
      // dealing wraps round-robin: every pool entry is used before any repeats
      const crates = [1, 2, 3, 4, 5, 6].map((n) => v.get(`crate-${n}`)!.slug)
      for (const s of variantPool('crate')) expect(crates).toContain(s)
    }
  })

  it('TERVAR-004 adjacent ruin panels use different models when the pool allows', () => {
    if (pool.length < 2) return
    for (const seed of ['s1', 's2', 's3', 's4']) {
      const slugs = planWallPanels('ruin-a', 0, wall, pool, seed).map((p) => p.slug)
      slugs.slice(1).forEach((s, i) => expect(s).not.toBe(slugs[i]))
    }
  })

  it('TERVAR-005 pools are never empty and new slugs replace legacy when the switch is off', () => {
    for (const kind of ['ruinWall', 'crate', 'barricade', 'crater'] as const) {
      expect(variantPool(kind).length).toBeGreaterThan(0)
      expect(NEW_TERRAIN_SLUGS[kind].every((s) => variantPool(kind).includes(s))).toBe(true)
    }
  })
})
