import { expect, test } from '@playwright/test'

// Styled tooltips replace native title= popups: hovering a status icon / HUD button shows a role=tooltip popup.
// Screenshots go to TOOLTIP_SHOTS when set (else tests/e2e/__shots__).
const SHOTS = process.env.TOOLTIP_SHOTS ?? 'tests/e2e/__shots__'

test('status icon and HUD tooltips show on hover', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=terrain-height')
  await page.waitForFunction(() => !!(window as unknown as { __malletCamera?: unknown }).__malletCamera, null, { timeout: 30_000 })
  await page.evaluate(() => {
    const w = window as unknown as {
      __mallet: { useGameStore: { getState(): { state: { models: Record<string, { pos: { x: number; z: number } }>; units: Record<string, { models: string[] }> } } } }
      __malletCamera: { lookAt(x: number, z: number, d: number): void }
    }
    const gs = w.__mallet.useGameStore.getState().state
    const ps = gs.units['A:warriors'].models.map((id) => gs.models[id].pos)
    w.__malletCamera.lookAt(ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.z, 0) / ps.length + 1.5, 28)
  })
  const badge = page.locator('[data-testid^=cover-badge-]').first()
  await expect(badge).toBeVisible({ timeout: 15_000 })
  await expect(badge).not.toHaveAttribute('title', /.+/)
  // The camera eases into place for a moment and the icon drifts with it (Playwright's hover() reads that as unstable).
  let prev = (await badge.boundingBox())!
  await expect.poll(async () => {
    await page.waitForTimeout(300)
    const cur = (await badge.boundingBox())!
    const moved = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    prev = cur
    return moved < 1.5
  }, { timeout: 20_000 }).toBe(true)
  const b = (await badge.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 })
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText(/cover/i)
  expect(await tip.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
  await expect(badge).toHaveAttribute('aria-describedby', /.+/)
  await page.screenshot({ path: `${SHOTS}/status-icon-tooltip.png` })
  await page.mouse.move(5, 5)
  await expect(tip).toHaveCount(0)

  const m = (await page.getByTestId('btn-measure').boundingBox())!
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2, { steps: 5 })
  await expect(page.getByRole('tooltip')).toContainText('Measure (M)')
  await page.screenshot({ path: `${SHOTS}/hud-tooltip.png`, clip: { x: 900, y: 0, width: 700, height: 220 } })
  expect(errors).toEqual([])
})
