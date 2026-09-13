import { expect, test } from '@playwright/test'

test('home page renders the M0 title overlay', async ({ page }) => {
  await page.goto('/')
  const title = page.getByTestId('title')
  await expect(title).toHaveText('Mallet 42k — M0')

  // The 3D scene draws on its own render loop and its first frame includes
  // shader compilation (drei's Grid), which can take a beat under headless
  // WebGL — wait for the canvas to exist and give it a moment to paint.
  await page.waitForSelector('canvas')
  await page.waitForTimeout(800)

  await page.screenshot({ path: 'e2e-out/home.png' })
})
