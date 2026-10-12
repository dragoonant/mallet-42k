import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Weapon selection panel (src/client/ui/WeaponPanel.tsx): click an enemy -> panel -> untick / retarget -> Fire.
// Scenarios live in src/client/dev/scenarios.ts (Space Marines, Shooting phase, two enemy units 8" away).

interface Ev { type: string; targets?: { modelId: string; weaponId: string; targetUnitId: string }[]; attack?: { weaponId: string } }
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
  // the tick shows what will fire: Other weapons wins, so the Pistol row is unticked with a reason and Fire counts only the pyreblasters
  await expect(page.getByTestId('weapon-fire-sm.w.pyreblaster')).toBeChecked()
  await expect(page.getByTestId('weapon-fire-sm.w.bolt-pistol')).not.toBeChecked()
  await expect(page.getByTestId('weapon-reason-sm.w.bolt-pistol')).toContainText('Not firing')
  await expect(page.getByTestId('btn-fire')).toContainText('Fire (5)')
  await page.screenshot({ path: 'e2e-out/weapon-select-3-pistol.png' })
  // ticking the Pistol row flips the choice to Pistols (and unticks the other row)
  await page.getByTestId('weapon-fire-sm.w.bolt-pistol').check()
  await expect(page.getByTestId('weapon-fire-sm.w.bolt-pistol')).toBeChecked()
  await expect(page.getByTestId('weapon-fire-sm.w.pyreblaster')).not.toBeChecked()
  await expect(page.getByTestId('btn-fire')).toContainText('Fire (5)')
  await expect(page.getByTestId('pistol-conflict')).toContainText('Bolt pistol')
  await page.getByTestId('weapon-fire-sm.w.pyreblaster').check()
  await expect(page.getByTestId('weapon-fire-sm.w.bolt-pistol')).not.toBeChecked()
  await page.getByTestId('pistol-mode-pistol').click()
  await expect(page.getByTestId('weapon-fire-sm.w.bolt-pistol')).toBeChecked()
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

test('mixed loadouts get one Pistol-or-other choice per kind of model', async ({ page }) => {
  const errors = await open(page, 'weapon-select-split')
  await clickEnemy(page, 'B:terminator-squad')
  await expect(page.getByTestId('weapon-panel')).toBeVisible()
  // the sergeant (bolt pistol + storm bolter) and the four marines (bolt pistol + pyreblaster) each get a toggle
  const groups = page.locator('[data-testid^="pistol-group-"]')
  await expect(groups).toHaveCount(2)
  await expect(groups.first()).toContainText(':')
  await expect(page.getByTestId('btn-fire')).toContainText('Fire (5)')
  // switch only the sergeant to his Pistol
  const sergeantGroup = groups.filter({ hasText: 'Sergeant' })
  await expect(sergeantGroup).toHaveCount(1)
  await sergeantGroup.getByTestId('pistol-mode-pistol').click()
  await expect(page.getByTestId('weapon-fire-sm.w.storm-bolter')).not.toBeChecked()
  await expect(page.getByTestId('weapon-fire-sm.w.bolt-pistol')).toBeChecked()
  await expect(page.getByTestId('weapon-row-sm.w.bolt-pistol')).toContainText('×1/5')
  await expect(page.getByTestId('weapon-fire-sm.w.pyreblaster')).toBeChecked()
  await expect(page.getByTestId('btn-fire')).toContainText('Fire (5)')
  await page.screenshot({ path: 'e2e-out/weapon-select-6-split.png' })

  await page.getByTestId('btn-fire').click()
  await expect.poll(async () => (await events(page)).some((e) => e.type === 'TargetsDeclared'), { timeout: 15_000 }).toBe(true)
  const declared = (await events(page)).find((e) => e.type === 'TargetsDeclared')!
  const sergeantId = await page.evaluate(() => {
    const gs = (window as unknown as Win).__mallet.useGameStore.getState().state
    return gs.units['A:infernus-squad'].models[0]
  })
  const byModel = new Map<string, Set<string>>()
  for (const t of declared.targets!) byModel.set(t.modelId, (byModel.get(t.modelId) ?? new Set()).add(t.weaponId))
  expect([...byModel.get(sergeantId)!]).toEqual(['sm.w.bolt-pistol'])
  for (const [id, w] of byModel) if (id !== sergeantId) expect([...w]).toEqual(['sm.w.pyreblaster'])
  expect(errors).toEqual([])
})

test('HUD panels sit above the board unit labels', async ({ page }) => {
  const errors = await open(page, 'weapon-select')
  await clickEnemy(page, 'B:terminator-squad')
  await expect(page.getByTestId('weapon-panel')).toBeVisible()
  const top = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="weapon-panel"]')!.getBoundingClientRect()
    const el = document.elementFromPoint(panel.left + panel.width / 2, panel.top + 8)
    return !!el && !!el.closest('[data-testid="weapon-panel"]')
  })
  expect(top, 'the panel is the topmost element over its own area').toBe(true)
  expect(errors).toEqual([])
})
