import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Weapon selection panel (src/client/ui/WeaponPanel.tsx): click an enemy -> panel -> untick / retarget -> Fire.
// Scenarios live in src/client/dev/scenarios.ts (Space Marines, Shooting phase, two enemy units 8" away).

interface Ev { type: string; targets?: { weaponId: string; targetUnitId: string }[]; attack?: { weaponId: string } }
interface Win {
  __mallet: {
    useGameStore: { getState(): { events: Ev[]; pending: { kind: string; id: string; context: { unitId: string } } | null; state: { models: Record<string, { pos: { x: number; z: number } }>; units: Record<string, { models: string[] }> } } }
  }
  __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
}

async function open(page: Page, scenario: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  mkdirSync('e2e-out', { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(`./?scenario=${scenario}`)
  await expect(page.getByTestId('shoot-context')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, null, { timeout: 30_000 })
  await page.waitForTimeout(1500)
  return errors
}

/** A real mouse click on the first model of an enemy unit. */
async function clickEnemy(page: Page, unitId: string) {
  const pt = await page.evaluate((id) => {
    const w = window as unknown as Win
    const gs = w.__mallet.useGameStore.getState().state
    const m = gs.models[gs.units[id].models[0]]
    return w.__malletProject(m.pos.x, 0.8, m.pos.z)
  }, unitId)
  await page.mouse.click(pt.x, pt.y)
}

const events = (page: Page) => page.evaluate(() => (window as unknown as Win).__mallet.useGameStore.getState().events)

test('holding a weapon group: the held weapon makes no attacks', async ({ page }) => {
  const errors = await open(page, 'weapon-select')
  await clickEnemy(page, 'B:terminator-squad')
  await expect(page.getByTestId('weapon-panel')).toBeVisible()
  await expect(page.getByTestId('weapon-row-sm.w.storm-bolter')).toBeVisible()
  await expect(page.getByTestId('weapon-row-sm.w.assault-cannon')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/weapon-select-1-panel.png' })

  await page.getByTestId('weapon-fire-sm.w.assault-cannon').uncheck()
  await page.screenshot({ path: 'e2e-out/weapon-select-2-held.png' })
  // nothing fired yet: the click only staged the shot
  expect((await events(page)).some((e) => e.type === 'TargetsDeclared')).toBe(false)

  await page.keyboard.press('Enter')
  await expect.poll(async () => (await events(page)).some((e) => e.type === 'HitRolled'), { timeout: 15_000 }).toBe(true)
  const ev = await events(page)
  const declared = ev.find((e) => e.type === 'TargetsDeclared')!
  expect(declared.targets!.length).toBeGreaterThan(0)
  expect(declared.targets!.every((t) => t.weaponId === 'sm.w.storm-bolter')).toBe(true)
  expect(ev.filter((e) => e.type === 'HitRolled' && e.attack?.weaponId === 'sm.w.assault-cannon')).toHaveLength(0)
  expect(ev.filter((e) => e.type === 'HitRolled' && e.attack?.weaponId === 'sm.w.storm-bolter').length).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('retarget a group to another enemy, pistol rule offers a toggle', async ({ page }) => {
  const errors = await open(page, 'weapon-select-mixed')
  await clickEnemy(page, 'B:terminator-squad')
  await expect(page.getByTestId('weapon-panel')).toBeVisible()
  // Bolt pistol and pyreblaster on the same models: the panel says which one wins and offers the toggle
  await expect(page.getByTestId('pistol-conflict')).toBeVisible()
  await expect(page.getByTestId('pistol-conflict')).toContainText('Pyreblaster')
  await page.screenshot({ path: 'e2e-out/weapon-select-3-pistol.png' })
  await page.getByTestId('pistol-mode-pistol').click()
  await expect(page.getByTestId('pistol-conflict')).toContainText('Bolt pistol')
  await page.getByTestId('pistol-mode-other').click()

  // a board click on the other enemy retargets the selected row
  await page.getByTestId('weapon-row-sm.w.pyreblaster').click({ position: { x: 4, y: 4 } })
  await clickEnemy(page, 'B:infernus-squad')
  await expect(page.getByTestId('weapon-target-sm.w.pyreblaster')).toHaveValue('B:infernus-squad')
  await page.screenshot({ path: 'e2e-out/weapon-select-4-retarget.png' })

  await page.getByTestId('btn-fire').click()
  await expect.poll(async () => (await events(page)).some((e) => e.type === 'TargetsDeclared'), { timeout: 15_000 }).toBe(true)
  const declared = (await events(page)).find((e) => e.type === 'TargetsDeclared')!
  expect(declared.targets!.every((t) => t.weaponId === 'sm.w.pyreblaster' && t.targetUnitId === 'B:infernus-squad')).toBe(true)
  expect(errors).toEqual([])
})

test('profile group shows a radio choice and the Hazardous tag', async ({ page }) => {
  const errors = await open(page, 'weapon-select-psyker')
  await clickEnemy(page, 'B:terminator-squad')
  await expect(page.getByTestId('weapon-variant-sm.w.smite')).toBeVisible()
  await page.getByTestId('weapon-variant-sm.w.smite-focused').check()
  await expect(page.getByTestId('weapon-panel').getByText('Hazardous')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/weapon-select-5-profile.png' })
  expect(errors).toEqual([])
})
