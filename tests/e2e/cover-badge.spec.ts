import { expect, test } from '@playwright/test'

// `?scenario=terrain-height`: Necron warriors A stand inside ruin-l1 with warriors B nearby; the badge shows
// for units that have cover against the enemy that sees them.
test('cover shield icon appears above the unit label', async ({ page }) => {
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
  const id = (await badge.getAttribute('data-testid'))!.replace('cover-badge-', '')
  const b = await badge.boundingBox()
  const l = await page.getByTestId(`unit-label-${id}`).boundingBox()
  expect(b!.height).toBeGreaterThan(14)
  await expect(badge).toHaveText('') // shield only, no words
  await expect(page.getByText(/in cover|partial cover/i)).toHaveCount(0)
  await expect(page.getByTestId(`unit-status-${id}`)).toBeVisible()
  await expect(page.getByTestId(`unit-label-${id}`)).not.toContainText('Shocked')
  expect(b!.y + b!.height).toBeLessThanOrEqual(l!.y + 1)
  await page.screenshot({ path: 'tests/e2e/__shots__/cover-badge.png' })
  expect(errors).toEqual([])
})
