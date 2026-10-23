import { expect, test } from '@playwright/test'

// The app opens on the start screen (src/client/ui/StartScreen.tsx): a screen-reader h1 naming the game, the faction
// pickers and the Start button. The 3D board's canvas only mounts once a game starts (the M0 title overlay this spec
// used to check is long gone).
test('home page renders the start screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mallet 42,000 — SD Assault: Galaxy in Conflict')
  await expect(page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Space Marines', exact: true })).toBeVisible()
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/home.png' })
})
