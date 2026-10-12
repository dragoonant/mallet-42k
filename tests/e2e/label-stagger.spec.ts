import { expect, test } from '@playwright/test'

// `?scenario=terrain-height`: two Necron Warrior units stand close together in ruin-l1; their name tag + icon row
// blocks must be staggered on screen instead of drawing over each other.
test('close units get staggered, non-overlapping label blocks', async ({ page }) => {
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
  const labels = page.locator('[data-testid^=unit-label-]')
  await expect(labels.first()).toBeVisible({ timeout: 15_000 })
  const readBlocks = () => page.evaluate(() => {
    const out: Record<string, { l: number; t: number; r: number; b: number }> = {}
    for (const tag of document.querySelectorAll('[data-testid^=unit-label-]')) {
      const id = tag.getAttribute('data-testid')!.replace('unit-label-', '')
      const els = [tag, document.querySelector(`[data-testid="unit-status-${id}"]`)].filter(Boolean) as Element[]
      const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
      if (rs.length === 0) continue
      out[id] = { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) }
    }
    return out
  })
  await expect.poll(async () => {
    const blocks = Object.values(await readBlocks())
    if (blocks.length < 2) return 'few'
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!, b = blocks[j]!
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) return 'overlap'
    }
    return 'ok'
  }, { timeout: 10_000 }).toBe('ok')
  await page.screenshot({ path: process.env.STAGGER_SHOT ?? 'tests/e2e/__shots__/label-stagger.png' })
  expect(errors).toEqual([])
})
