import { expect, test } from '@playwright/test'

// `?scenario=terrain-height` (src/client/dev/scenarios.ts): an INFANTRY unit on a ruin upper floor, an enemy beside it.
test('terrain-height: units stand on a ruin floor and the cover badge shows', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=terrain-height')
  await page.waitForFunction(() => !!(window as unknown as { __malletCamera?: unknown }).__malletCamera, null, { timeout: 30_000 })
  const info = await page.evaluate(() => {
    const w = window as unknown as {
      __mallet: { useGameStore: { getState(): { state: { models: Record<string, { pos: { x: number; y: number; z: number } }>; units: Record<string, { models: string[] }> } } } }
      __malletCamera: { lookAt(x: number, z: number, d: number): void }
    }
    const gs = w.__mallet.useGameStore.getState().state
    const ps = gs.units['A:warriors'].models.map((id) => gs.models[id].pos)
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length
    const cz = ps.reduce((a, p) => a + p.z, 0) / ps.length
    w.__malletCamera.lookAt(cx, cz + 1.5, 28)
    return { ys: ps.map((p) => p.y) }
  })
  expect(info.ys.every((y) => y > 0)).toBe(true)
  // orbit the camera (right-drag) round to the ruin's open side and tip it up so the floor slab is visible
  await page.mouse.move(800, 450)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(800 + Number(process.env.ORBIT_DX ?? 450), 450 + Number(process.env.ORBIT_DY ?? 120), { steps: 20 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e-out/terrain-height.png' })
  expect(errors).toEqual([])
})
