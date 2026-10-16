import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import {
  answerRerollLikeDecision, clickFirstOption, clickPass, clickCanvasAt, makeCam, project, promptButton,
  snap as sharedSnap, clearToast, tryBoardPlacement, waitChange, type Snap, type V2,
} from './helpers'

// M10: transports are usable in the browser. T'au Sudden Dawn Cadre starts with Pathfinders embarked in the Devilfish
// (start-screen pick), deploys the rest, and in its own Movement phase disembarks them through the prompt + a board click.

const W = 1600
const H = 900
const BUDGET_MS = 4 * 60_000
const cam = makeCam()
const snap = (page: Page) => sharedSnap(page)

async function dismissBanner(page: Page): Promise<void> {
  const b = page.getByText('Click anywhere to continue')
  if (await b.isVisible().catch(() => false)) await b.click({ timeout: 1000 }).catch(() => {})
}

async function deployHuman(page: Page, s: Snap): Promise<void> {
  const p = s.pending!
  const uid: string = p.context.unitIds[0]
  const name = s.units.find((u) => u.id === uid)?.name ?? uid
  const chip = await promptButton(page, new RegExp('^' + name.replace(/[^A-Za-z0-9 ]/g, '.') + '$'))
  if (chip) await chip.click()
  const compact = page.getByTestId('formation-phalanx')
  if (await compact.isVisible().catch(() => false)) await compact.click().catch(() => {})
  const xs = Array.from({ length: 14 }, (_, i) => [3 * i, -3 * i]).flat().filter((x, i) => i !== 1 && Math.abs(x) <= 19)
  const pts: V2[] = xs.flatMap((x) => [-12.6, -13.9, -11.3].map((z) => ({ x, z })))
  if (chip && (await tryBoardPlacement(page, s, pts, cam, W, H, name))) return
  const res = await promptButton(page, /^Reserves:/)
  if (res) { await res.click(); return }
  await clickPass(page)
}

test('transports: start embarked in the Devilfish, then disembark in the Movement phase through the UI', async ({ page }) => {
  test.setTimeout(6 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.setDefaultTimeout(8000)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: /T.au/ }).click()
  await page.getByTestId('setup-patrol-pick-A').getByRole('button', { name: /Sudden Dawn/ }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('transports-1')
  const embarkPick = page.locator('[data-testid^="setup-embark-A-"]').first().locator('select')
  await expect(embarkPick).toBeVisible()
  await embarkPick.selectOption({ label: (await embarkPick.locator('option').allTextContents()).find((t) => /Pathfinder/.test(t))! })
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('btn-settings').click()
  await page.getByTestId('settings-speed-instant').click()
  const diceOn = page.getByTestId('settings-dice-on')
  if (await diceOn.isChecked()) await diceOn.click()
  const mute = page.getByTestId('settings-mute')
  if (!(await mute.isChecked())) await mute.click()
  await page.getByTestId('btn-settings').click()
  await page.waitForTimeout(2500)

  const s0 = await snap(page)
  const human = s0.humanSeat
  const passenger = s0.units.find((u) => u.player === human && /Pathfinder/.test(u.name))!
  expect(passenger, 'Pathfinders exist').toBeTruthy()

  let shotEmbarked = false
  const start = Date.now()
  let disembarked = false
  let declined = false
  while (Date.now() - start < BUDGET_MS) {
    const s = await snap(page)
    if (s.result || s.phase === 'ended') break
    const me = s.units.find((u) => u.id === passenger.id)!
    if (me.loc === 'board' && s.phase !== 'deployment' && s.phase !== 'setup') { disembarked = true; break }
    if (!s.pending || s.pending.player === s.botSeat) { await page.waitForTimeout(150); continue }
    const p = s.pending
    await dismissBanner(page)
    if (p.kind === 'deployUnit' && s.phase === 'deployment') { await deployHuman(page, s); continue }
    if (!shotEmbarked && s.phase !== 'deployment' && s.phase !== 'setup') {
      expect(me.loc, 'Pathfinders start off the board, embarked').not.toBe('board')
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'e2e-out/transports-01-embarked.png' })
      shotEmbarked = true
    }
    if (p.kind === 'chooseUnitToActivate' && s.phase === 'movement' && s.active === human) {
      const btn = await promptButton(page, /^Disembark Pathfinder/)
      if (btn) {
        await expect(btn).toContainText('from')
        await btn.click()
        const s2 = await waitChange(page, p.id)
        expect(s2.pending?.kind, 'disembark raises a placement decision').toBe('deployUnit')
        await expect(page.getByTestId('prompt')).toContainText(/Disembark/)
        if (!declined) {
          // decline once: Pass leaves the unit aboard
          declined = true
          await clickPass(page)
          const s3 = await waitChange(page, s2.pending!.id)
          expect(s3.units.find((u) => u.id === passenger.id)!.loc, 'declined: Pathfinders stay embarked').not.toBe('board')
          continue
        }
        const zone: V2[] = s2.pending!.context.zone
        const cx = zone.reduce((a, v) => a + v.x, 0) / zone.length
        const cz = zone.reduce((a, v) => a + v.z, 0) / zone.length
        // the zone is the transport footprint grown by 3": aim just inside each corner / edge midpoint, away from the hull
        const near = (v: V2, t: number): V2 => ({ x: v.x + (cx - v.x) * t, z: v.z + (cz - v.z) * t })
        const ring: V2[] = []
        for (const t of [0.25, 0.15, 0.35]) for (let i = 0; i < zone.length; i++) { ring.push(near(zone[i], t)); const nx = zone[(i + 1) % zone.length]; ring.push(near({ x: (zone[i].x + nx.x) / 2, z: (zone[i].z + nx.z) / 2 }, t)) }
        let ok = false
        for (const pt of ring) {
          await clearToast(page)
          if (!(await clickCanvasAt(page, project({ x: pt.x, y: 0, z: pt.z }, cam, W, H), W, H))) continue
          await page.waitForTimeout(150)
          const confirm = page.getByTestId('btn-confirm')
          if (!(await confirm.isVisible().catch(() => false))) { console.log('[transports] no draft at', pt.x.toFixed(1), pt.z.toFixed(1)); continue }
          if (!(await confirm.isEnabled().catch(() => false))) {
            await confirm.hover({ force: true }).catch(() => {})
            const body = await page.locator('body').innerText()
            console.log('[transports] disabled:', body.split(String.fromCharCode(10)).filter((l) => /overlap|within|zone|coher|range/i.test(l)).slice(0, 3).join(' | '))
            continue
          }
          await confirm.click()
          ok = (await waitChange(page, s2.pending!.id)).pending?.id !== s2.pending!.id
          if (ok) break
        }
        expect(ok, 'placed the disembarking unit with a board click').toBe(true)
        continue
      }
    }
    if (p.kind === 'chooseOption' && p.context?.data?.kind === 'embark') {
      const stay = await promptButton(page, /^Stay on the battlefield$/)
      if (stay) { await stay.click(); continue }
    }
    if (p.kind === 'commandReroll' || p.kind === 'stratagemWindow' || p.kind === 'reactionWindow') {
      if (!(await answerRerollLikeDecision(page))) await clickPass(page)
      continue
    }
    if (p.kind === 'chooseUnitToActivate') { const pb = await promptButton(page, /^Pass$/); if (pb) { await pb.click(); continue } }
    if (!(await clickFirstOption(page, false))) await clickPass(page)
  }
  expect(declined, 'declined a disembark once').toBe(true)
  expect(shotEmbarked, 'saw the embarked state in play').toBe(true)
  expect(disembarked, 'Pathfinders disembarked onto the board').toBe(true)
  await dismissBanner(page)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e-out/transports-02-disembarked.png' })
  expect(consoleErrors, 'no console errors').toEqual([])
  void clickCanvasAt; void project
})
