import { expect, test } from '@playwright/test'

// `?scenario=pile-in` dev hook (src/client/dev/scenarios.ts): opens a game in the human's Fight phase at a Pile in decision.
for (const name of ['pile-in', 'pile-in-mixed']) {
  test(`scenario ${name} opens at a pile-in prompt`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto(`./?scenario=${name}`)
    await expect(page.getByTestId('pile-in-context')).toBeVisible({ timeout: 30_000 })
    const pending = await page.evaluate(() => {
      const g = (window as unknown as { __mallet: { useGameStore: { getState(): { pending: { kind: string; player: string }; state: { phase: string } } } } }).__mallet.useGameStore.getState()
      return { kind: g.pending.kind, player: g.pending.player, phase: g.state.phase }
    })
    expect(pending).toEqual({ kind: 'pileIn', player: 'A', phase: 'fight' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `tests/e2e/screenshots/scenario-${name}.png` })
    expect(errors).toEqual([])
  })
}
