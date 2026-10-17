import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { screenshotRendered } from './helpers'

// Phone smoke check (M11): runs only in the iphone-se / iphone-pro / pixel projects (see
// playwright.config.ts). Start screen fits the screen width, a game boots to a visible board + HUD,
// and turning the phone to portrait mid-game raises the rotate prompt until it is turned back.
// Screenshots land in e2e-out/ for visual review.

test.setTimeout(180_000)
const LOAD_MS = 90_000

test('phone: start, battle, portrait rotate prompt', async ({ page }, testInfo) => {
  mkdirSync('e2e-out', { recursive: true })
  const name = testInfo.project.name
  const shot = (n: string) => screenshotRendered(page, `e2e-out/mobile-${name}-${n}.png`, n === '02-battle' || n === '06-sheet-collapsed' || n === '05-drawer' ? 250_000 : 0)

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

  // (b2) compact HUD: each drawer opens from the top-bar menu and closes again; the decision sheet folds
  const menu = page.getByTestId('btn-tools-menu')
  for (const [btn, drawer] of [
    ['btn-mission', 'drawer-mission'],
    ['btn-dice-log', 'drawer-log'],
    ['btn-event-feed', 'drawer-feed'],
    ['btn-settings', 'drawer-settings'],
  ] as const) {
    await menu.click()
    await page.getByTestId(btn).click()
    await expect(page.getByTestId(drawer)).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500) // let the slide-in finish
    const dbox = (await page.getByTestId(drawer).boundingBox())!
    expect(dbox.x + dbox.width, `${drawer} stays on screen`).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    expect(dbox.width, `${drawer} leaves board room`).toBeLessThanOrEqual(page.viewportSize()!.width * 0.5)
    if (drawer === 'drawer-mission') await shot('05-drawer')
    await page.getByTestId(`${drawer}-close`).click()
    await expect(page.getByTestId(drawer)).toBeHidden({ timeout: 10_000 })
  }
  await page.getByTestId('btn-stratagems').click()
  await expect(page.getByTestId('drawer-stratagems')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('drawer-stratagems-close').click()
  await expect(page.getByTestId('drawer-stratagems')).toBeHidden({ timeout: 10_000 })
  // the bar buttons are real touch targets
  for (const id of ['btn-end-phase', 'btn-stratagems', 'btn-tools-menu']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box, id).not.toBeNull()
    expect(box!.height, id).toBeGreaterThanOrEqual(43.5)
  }

  const sheet = page.getByTestId('prompt')
  if (await sheet.count()) {
    const body = page.getByTestId('prompt-sheet-body')
    const toggle = page.getByTestId('prompt-sheet-toggle')
    await expect(sheet).toHaveAttribute('data-collapsed', 'false')
    await toggle.click()
    await expect(sheet).toHaveAttribute('data-collapsed', 'true')
    await expect(body).toBeHidden()
    await shot('06-sheet-collapsed')
    await toggle.click()
    await expect(sheet).toHaveAttribute('data-collapsed', 'false')
    await expect(body).toBeVisible()
  } else {
    await shot('06-sheet-collapsed') // no decision pending right now: the board is unobstructed
  }

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
