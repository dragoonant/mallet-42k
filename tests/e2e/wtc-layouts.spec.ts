import { expect, test } from '@playwright/test'

// Top-down photo of each WTC 2025 terrain layout (src/data/terrain/cp-{long-edges,short-edges,diagonal}.json) with its
// mission's deployment zones and objective markers: e2e-out/wtc-layout-{long-edges,short-edges,diagonal}.png.
// Uses the dev scenario `layout-view` (no units placed) with `?mission=` choosing the mission, so no start-screen clicking.
type W = {
  __mallet: { useUiStore: { getState(): { toggleTopDown(): void } }; useGameStore: { getState(): { state: { board: { layoutId: string; pieces: Record<string, unknown> } } } } }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
}

const SHOTS = [
  { name: 'long-edges', mission: 'cp-01', layout: 'terrain.cp-long-edges' },
  { name: 'short-edges', mission: 'cp-02', layout: 'terrain.cp-short-edges' },
  { name: 'diagonal', mission: 'cp-04', layout: 'terrain.cp-diagonal' },
]

for (const shot of SHOTS) {
  test(`WTC layout ${shot.name}: top-down photo`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto(`./?scenario=layout-view&mission=${shot.mission}`)
    await page.waitForFunction(() => !!(window as unknown as { __malletCamera?: unknown }).__malletCamera, null, { timeout: 30_000 })
    const board = await page.evaluate(() => {
      const w = window as unknown as W
      return { layoutId: w.__mallet.useGameStore.getState().state.board.layoutId, pieces: Object.keys(w.__mallet.useGameStore.getState().state.board.pieces).length }
    })
    expect(board).toEqual({ layoutId: shot.layout, pieces: 12 })
    await page.evaluate(() => (window as unknown as W).__mallet.useUiStore.getState().toggleTopDown())
    await page.waitForTimeout(2500)
    await page.evaluate(() => (window as unknown as W).__malletCamera.lookAt(0, 0, 50))
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `e2e-out/wtc-layout-${shot.name}.png` })
    expect(errors).toEqual([])
  })
}
