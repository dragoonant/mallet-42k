import { expect, test } from '@playwright/test'

// First playable client (M3) smoke check: start a game, let the board render deployed/deploying
// figures, then zoom in for a close-up. Screenshots land in e2e-out/ for visual review; this is not
// a rules test (see tests/engine for those).

test('start screen renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/01-start.png' })
})

test('starting a game shows the board with figures', async ({ page }) => {
  await page.goto('/')
  // Fixed seed so the roll-offs before deployment resolve the same way every run.
  await page.getByTestId('setup-seed').fill('smoke-test-seed')
  await page.getByTestId('start-game').click()

  // Deployment/game screen renders a 3D canvas plus the HUD phase tracker.
  await page.waitForSelector('canvas')
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1200) // let the first frame (shaders, figure meshes) settle

  // Clear whatever pre-deployment roll-off prompts (sides/first turn) come first, then deploy one
  // unit so the screenshot shows an actual figure on the board, not just an empty battlefield.
  const canvas = page.locator('canvas').first()
  const heading = page.locator('[data-testid="prompt"] div').first()
  for (let i = 0; i < 6; i++) {
    const text = await heading.textContent().catch(() => null)
    if (text === 'Deploy your forces') break
    const anyOption = page.locator('[data-testid^="prompt-option-"]').first()
    if (!(await anyOption.isVisible().catch(() => false))) break
    await anyOption.click()
    await page.waitForTimeout(150)
  }

  let figurePoint: { x: number; y: number } | null = null
  const unitButton = page.getByRole('button', { name: /squad|tantus/i }).first()
  if (await unitButton.isVisible().catch(() => false)) {
    await unitButton.click()
    const box0 = await canvas.boundingBox()
    if (box0) {
      // Near strip of the board (below the objective ring, above the bottom decision-prompt panel)
      // is inside the human player's own deployment zone.
      const point = { x: box0.x + box0.width / 2, y: box0.y + box0.height * 0.78 }
      await page.mouse.click(point.x, point.y)
      await page.waitForTimeout(200)
      const confirm = page.getByTestId('btn-confirm')
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
        await page.waitForTimeout(500)
        figurePoint = point
      }
    }
  }

  await page.screenshot({ path: 'e2e-out/02-game.png' })

  // Close-up: pan the deployed figure toward the centre of frame (if we placed one), then zoom the
  // camera in via scroll-to-zoom on the canvas.
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    if (figurePoint) {
      await page.mouse.move(figurePoint.x, figurePoint.y)
      await page.mouse.down({ button: 'right' })
      await page.mouse.move(cx, cy, { steps: 10 })
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(200)
    }
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: 'e2e-out/03-closeup.png' })
})
