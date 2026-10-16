import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { snap } from './helpers'

// MOR-023: the second Orks patrol is reachable through the patrol picker and fields 4 units / 25 models vs the bot.
test("MOR-023 Orks start as Morgrim's Butchas via the patrol picker (4 units, 25 models)", async ({ page }) => {
  test.setTimeout(2 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error' && !/style property during rerender/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Orks' }).click()
  await page.getByTestId('setup-patrol-pick-A').getByRole('button', { name: "Morgrim's Butchas" }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('morgrim-1')
  await page.screenshot({ path: 'e2e-out/mor-01-start.png' })
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(2000)

  const s = await snap(page)
  const mine = s.units.filter((u) => u.player === s.humanSeat)
  expect(mine.map((u) => u.name).join(' | ')).toMatch(/Morgrim/)
  expect(mine.map((u) => u.name).join(' | ')).toMatch(/Squighog/)
  expect(mine).toHaveLength(4)
  expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(25)
  await page.screenshot({ path: 'e2e-out/mor-02-deploy.png' })
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
