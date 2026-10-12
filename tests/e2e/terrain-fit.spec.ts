import { expect, test } from '@playwright/test'
import { terrainService } from '../../src/engine/terrain'

// Terrain GLBs must line up with the engine's collision: for every drawn terrain piece, the share of
// engine-legal ground points (where a 32mm base may end) that lie inside drawn terrain mesh (y 0.3..1.5)
// must be tiny. Sampled on a 0.25" grid out to 1.5" beyond each footprint. Set TERRAIN_FIT_LOG=1 to print the table.
type Pt = { x: number; z: number }
type Probe = { ids(): string[]; solid(id: string, pts: Pt[], y0: number, y1: number): boolean[] }
const Y0 = 0.3, Y1 = 1.5, STEP = 0.25, BASE_R = 0.63

const RIM_TOLERANCE = 0.3
const edgeDistance = (pt: Pt, poly: Pt[]) => {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(pt.x - (a.x + t * dx), pt.z - (a.z + t * dz)))
  }
  return best
}
const inside = (pt: Pt, poly: Pt[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.z > pt.z !== b.z > pt.z && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) c = !c
  }
  return c
}

test('terrain models do not clip engine-legal ground', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=terrain-height')
  await page.waitForFunction(() => !!(window as unknown as { __malletTerrainProbe?: unknown }).__malletTerrainProbe, null, { timeout: 30_000 })
  // wait until every piece has its GLB in the scene (and the crater rocks / textures have settled)
  await page.waitForFunction(() => {
    const p = (window as unknown as { __malletTerrainProbe: Probe & { modelled(id: string): boolean } }).__malletTerrainProbe
    return p.ids().length > 0 && p.ids().every((id) => p.modelled(id))
  }, null, { timeout: 30_000 })
  await page.waitForTimeout(1500)

  const gs = await page.evaluate(() => (window as unknown as { __mallet: { useGameStore: { getState(): { state: unknown } } } }).__mallet.useGameStore.getState().state)
  const state = gs as { models: Record<string, { base: object }>; board: { pieces: Record<string, { footprint: Pt[]; kind: string }> } }
  const am = Object.values(state.models)[0]
  const model = { ...am, base: { ...am.base, shape: 'round', radius: BASE_R, radius2: undefined } }
  const ids = await page.evaluate(() => (window as unknown as { __malletTerrainProbe: Probe }).__malletTerrainProbe.ids())
  expect(ids.length).toBeGreaterThan(0)

  const rows: Record<string, unknown> = {}
  const failures: string[] = []
  for (const id of ids) {
    const piece = state.board.pieces[id]
    const xs = piece.footprint.map((p) => p.x), zs = piece.footprint.map((p) => p.z)
    const pts: Pt[] = []
    for (let x = Math.min(...xs) - 1.5; x <= Math.max(...xs) + 1.5 + 1e-6; x += STEP)
      for (let z = Math.min(...zs) - 1.5; z <= Math.max(...zs) + 1.5 + 1e-6; z += STEP) pts.push({ x, z })
    const solid = await page.evaluate(([i, p, a, b]) => (window as unknown as { __malletTerrainProbe: Probe }).__malletTerrainProbe.solid(i as string, p as Pt[], a as number, b as number), [id, pts, Y0, Y1])
    // A crater's tall rim rocks may overhang the footprint edge by up to RIM_TOLERANCE; nothing else may.
    const tol = piece.kind === 'crater' ? RIM_TOLERANCE : 0
    const legal = pts.map((p) => terrainService.canEndAt(gs as never, model as never, { x: p.x, y: 0, z: p.z }).ok)
    const solids = pts.filter((_, i) => solid[i])
    let L = 0, byPoint = 0, byBase = 0, Li = 0, Lip = 0
    pts.forEach((p, i) => {
      if (!legal[i]) return
      L++
      if (tol > 0 && !inside(p, piece.footprint) && edgeDistance(p, piece.footprint) <= tol) return // forgiven rim overhang (still counted in L)
      if (inside(p, piece.footprint)) { Li++; if (solid[i]) Lip++ }
      if (solid[i]) byPoint++
      if (solids.some((s) => Math.hypot(s.x - p.x, s.z - p.z) <= BASE_R)) byBase++
    })
    const pt = L ? (100 * byPoint) / L : 0
    rows[id] = { legal: L, pointClipPct: +pt.toFixed(1), baseClipPct: L ? +((100 * byBase) / L).toFixed(1) : 0, insideLegal: Li, insidePointClipPct: Li ? +((100 * Lip) / Li).toFixed(1) : null, meshPtsOutside: solids.filter((s) => !inside(s, piece.footprint)).length, meshPts: solids.length }
    if (pt > 2) failures.push(`${id}: ${pt.toFixed(1)}% of legal points inside mesh`)
  }
  if (process.env.TERRAIN_FIT_LOG) console.log(JSON.stringify(rows, null, 1))
  expect(failures).toEqual([])
})
