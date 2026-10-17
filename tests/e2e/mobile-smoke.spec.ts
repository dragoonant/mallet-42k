import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Phone smoke check (M11): runs only in the iphone-se / iphone-pro / pixel projects (see
// playwright.config.ts). Start screen fits the screen width, a game boots to a visible board + HUD,
// and turning the phone to portrait mid-game raises the rotate prompt until it is turned back.
// Screenshots land in e2e-out/ for visual review.

test.setTimeout(180_000)
const LOAD_MS = 90_000

test('phone: start, battle, portrait rotate prompt', async ({ page }, testInfo) => {
  mkdirSync('e2e-out', { recursive: true })
  const name = testInfo.project.name
  const shot = (n: string) => page.screenshot({ path: `e2e-out/mobile-${name}-${n}.png` })

  // (a) start screen, no sideways page scroll
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible({ timeout: LOAD_MS })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await shot('01-start')

  // (b) start a game against the bot (same flow as startGameVsBot in helpers.ts, longer timeouts)
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Space Marines', exact: true }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('mobile-smoke-seed')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: LOAD_MS })
  await page.waitForFunction(() => !!(window as any).__mallet, undefined, { timeout: LOAD_MS }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: LOAD_MS })
  await expect.poll(async () => {
    const box = await canvas.boundingBox()
    return box ? Math.min(box.width, box.height) : 0
  }, { timeout: LOAD_MS }).toBeGreaterThan(0)
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()
  await page.waitForTimeout(1500) // let first frames (shaders, figure meshes) settle
  await shot('02-battle')

  // (c) portrait mid-game -> rotate prompt; landscape again -> gone
  const vp = page.viewportSize()
  expect(vp).not.toBeNull()
  const { width, height } = vp!
  await page.setViewportSize({ width: Math.min(width, height), height: Math.max(width, height) })
  await expect(page.getByTestId('rotate-prompt')).toBeVisible({ timeout: 10_000 })
  await shot('03-portrait')
  await page.setViewportSize({ width: Math.max(width, height), height: Math.min(width, height) })
  await expect(page.getByTestId('rotate-prompt')).toBeHidden({ timeout: 10_000 })
})
