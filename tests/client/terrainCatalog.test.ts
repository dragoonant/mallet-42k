import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { TerrainPieceData } from '@/data/types'
import cp01 from '@/data/terrain/cp-01.json'
import { fittedScale, polygonBounds, simpleTurns } from '@/client/board/ruinFit'
import { panelFittedSize, planPillars, planWallPanels, slabPool, wallBoxes, wallLength, wallThickness } from '@/client/board/ruinKit'
import { RUIN_KIT_DEPTH_PAD, RUIN_KIT_WALL_SLUGS, TERRAIN_CATALOG, glbVisualHeight } from '@/client/board/terrainCatalog'

// TER-121 analogue (whirr-machine): the art is fitted to the box the rules use, and the fitted bbox must stay inside it.
const manifest = JSON.parse(readFileSync('public/assets/terrain/ruins/manifest.json', 'utf8')) as Record<string, { size: [number, number, number] }>
const pieces = (cp01 as { pieces: TerrainPieceData[] }).pieces
const sizeOf = (slug: string) => manifest[slug].size
const pool = slabPool(RUIN_KIT_WALL_SLUGS.map((slug) => ({ slug, size: sizeOf(slug) })))

describe('ruin kit fits the rules walls', () => {
  it('TER-121a has slab-like wall models to build from', () => {
    expect(pool.length).toBeGreaterThan(0)
  })

  for (const piece of pieces.filter((p) => p.kind === 'ruin')) {
    it(`TER-121a every kit panel of ${piece.id} lies inside its wall box`, () => {
      const walls = piece.walls ?? []
      expect(walls.length).toBeGreaterThan(0)
      walls.forEach((wall, wi) => {
        const panels = planWallPanels(piece.id, wi, wall, pool)
        expect(panels.length).toBeGreaterThan(0)
        const boxes = wallBoxes(wall)
        const L = wallLength(wall)
        for (const p of panels) {
          const [fl, fh, fd] = panelFittedSize(p, sizeOf(p.slug))
          expect(fh).toBeLessThanOrEqual(wall.height * 1.05)
          expect(fl).toBeLessThanOrEqual(L * 1.02)
          expect(fd).toBeLessThanOrEqual(wallThickness(wall) + 0.3)
          expect(p.y0 + fh).toBeLessThanOrEqual(wall.height * 1.05)
          expect(p.x - fl / 2).toBeGreaterThanOrEqual(-L / 2 * 1.02 - 1e-6)
          expect(p.x + fl / 2).toBeLessThanOrEqual(L / 2 * 1.02 + 1e-6)
        }
        // panels tile the solid boxes: total length per full-height wall matches the wall length (gaps excluded)
        const solid = boxes.filter((b) => b.y0 === 0 && b.y1 === wall.height).reduce((s, b) => s + (b.u1 - b.u0) * L, 0)
        const covered = panels.filter((p) => p.y0 === 0 && Math.abs(p.height - wall.height) < 1e-6).reduce((s, p) => s + p.width, 0)
        expect(covered).toBeCloseTo(solid, 3)
      })
    })

    it(`TER-121b pillars of ${piece.id} stay inside the walls' thickness`, () => {
      const walls = piece.walls ?? []
      for (const pl of planPillars(piece.id, walls)) {
        expect(pl.side).toBeLessThanOrEqual(Math.min(...walls.map(wallThickness)) + RUIN_KIT_DEPTH_PAD + 1e-9)
        expect(pl.height).toBeLessThanOrEqual(Math.max(...walls.map((w) => w.height)))
      }
    })
  }

  it('TER-121c a ground-level doorway gap leaves the wall open', () => {
    const wall = { a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, height: 4, gaps: [{ from: 0.4, to: 0.6, bottom: 0, top: 3 }] }
    const panels = planWallPanels('t', 0, wall, pool)
    const inDoor = panels.filter((p) => p.y0 < 3 && Math.abs(p.x) < 1 - 1e-6)
    expect(inDoor).toEqual([])
    expect(panels.some((p) => Math.abs(p.y0 - 3) < 1e-6 && Math.abs(p.height - 1) < 1e-6)).toBe(true) // lintel
  })
})

describe('GLB terrain pieces fit their footprint', () => {
  const glbKinds = Object.entries(TERRAIN_CATALOG).filter(([, e]) => e.fitsFootprint).map(([k]) => k)
  for (const piece of pieces.filter((p) => glbKinds.includes(p.kind))) {
    it(`TER-121d ${piece.id} (${piece.kind}) bbox is inside its footprint bbox and visual height`, () => {
      const b = polygonBounds(piece.footprint)
      const height = glbVisualHeight(piece.kind, piece.height)
      for (const slug of TERRAIN_CATALOG[piece.kind].slugs) {
        const size = sizeOf(slug) as [number, number, number]
        const turns = simpleTurns(size, b)
        const k = fittedScale(size, b, height, turns)
        const w = turns % 2 ? size[2] : size[0]
        const d = turns % 2 ? size[0] : size[2]
        expect(w * k[0]).toBeLessThanOrEqual(b.w * 1.05)
        expect(d * k[2]).toBeLessThanOrEqual(b.d * 1.05)
        expect(w * k[0]).toBeGreaterThanOrEqual(b.w * 0.95)
        expect(d * k[2]).toBeGreaterThanOrEqual(b.d * 0.95)
        expect(size[1] * k[1]).toBeLessThanOrEqual(height * 1.05)
        expect(size[1] * k[1]).toBeGreaterThanOrEqual(height * 0.95)
      }
    })
  }
})
