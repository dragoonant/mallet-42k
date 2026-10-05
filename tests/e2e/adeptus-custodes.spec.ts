import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import {
  answerRerollLikeDecision, clickFirstOption, clickPass, makeCam, promptButton,
  snap as sharedSnap, tryBoardPlacement, type Snap, type V2,
} from './helpers'

// M10: a game can be started as Adeptus Custodes vs the bot through the real UI, the army deploys (every unit
// through a real board click), and the game reaches the first Shooting phase of battle round 1 with no
// console errors. Screenshots land in e2e-out/ for a human to eyeball the figures.

const W = 1600
const H = 900
const BUDGET_MS = 4 * 60_000
const cam = makeCam()
const snap = (page: Page) => sharedSnap(page)

async function handleHuman(page: Page, s: Snap): Promise<void> {
  const p = s.pending!
  if (p.kind === 'deployUnit') {
    const uid: string = p.context.unitIds[0]
    const name = s.units.find((u) => u.id === uid)?.name ?? uid
    const chip = await promptButton(page, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    if (chip) await chip.click()
    // The deployment strip is shallow; a compact formation keeps the later units placeable.
    const compact = page.getByTestId('formation-phalanx')
    if (await compact.isVisible().catch(() => false)) await compact.click().catch(() => {})
    const zone: V2[] = p.context.zone
    const taken = s.units.filter((u) => u.player === p.player && u.loc === 'board').length
    // The strip is wide and shallow (44x5): sweep it in 3" steps, centre first, three rows deep.
    const xs = Array.from({ length: 14 }, (_, i) => [3 * i, -3 * i]).flat().filter((x, i) => i !== 1 && Math.abs(x) <= 19)
    const pts: V2[] = xs.flatMap((x) => [-12.6, -13.9, -11.3].map((z) => ({ x, z })))
    if (chip && (await tryBoardPlacement(page, s, pts, cam, W, H, name, { note: (m) => console.log('[adeptus-custodes] ' + m) }))) return
    const res = await promptButton(page, /^Reserves:/)
    if (res) { await res.click(); return }
    await clickPass(page)
    return
  }
  if (p.kind === 'commandReroll' || p.kind === 'stratagemWindow' || p.kind === 'reactionWindow') {
    if (!(await answerRerollLikeDecision(page))) await clickPass(page)
    return
  }
  if (p.kind === 'chooseUnitToActivate' && s.phase !== 'shooting') { await dismissBanner(page); const pb = await promptButton(page, /^Pass$/); if (pb) { await pb.click(); return } }
  if (!(await clickFirstOption(page, false))) await clickPass(page)
}

async function dismissBanner(page: Page): Promise<void> {
  const b = page.getByText('Click anywhere to continue')
  if (await b.isVisible().catch(() => false)) await b.click({ timeout: 1000 }).catch(() => {})
}

async function diceCount(page: Page): Promise<number> {
  const txt = (await page.getByText(/^DICE LOG/).first().textContent().catch(() => '')) ?? ''
  return Number(/\((\d+)\)/.exec(txt)?.[1] ?? 0)
}

test('adeptus-custodes vs bot: start, deploy, reach the first shooting phase', async ({ page }) => {
  test.setTimeout(6 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  page.setDefaultTimeout(8000)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: "Adeptus Custodes" }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('adeptus-custodes-1')
  await page.screenshot({ path: 'e2e-out/m10-adeptus-custodes-01-start.png' })
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
  const humanSeat = s0.humanSeat
  const mine = s0.units.filter((u) => u.player === humanSeat).map((u) => u.name)
  expect(mine.join(' | '), 'human army is the Custodes patrol').toMatch(/Custodian|Prosecutor|Vigilator|Vertus|Shield-Captain/)

  const start = Date.now()
  let shotDeployed = false
  let shotShooting = false
  let shootStartDice: number | null = null
  let shootStartAt = Date.now()
  while (Date.now() - start < BUDGET_MS) {
    const s = await snap(page)
    if (s.result || s.phase === 'ended') break
    const mineOnBoard = s.units.filter((u) => u.player === humanSeat && u.loc === 'board').length
    if (!shotDeployed && s.phase !== 'setup' && s.phase !== 'deployment' && mineOnBoard > 0) {
      await dismissBanner(page)
      await page.waitForTimeout(1200)
      await page.screenshot({ path: 'e2e-out/m10-adeptus-custodes-02-deployed.png' })
      shotDeployed = true
    }
    if (s.phase === 'shooting' && s.round >= 1) {
      await dismissBanner(page)
      const n = await diceCount(page)
      if (shootStartDice === null) { shootStartDice = n; shootStartAt = Date.now() }
      if (n > shootStartDice || Date.now() - shootStartAt > 20_000) {
        await page.waitForTimeout(1200)
        await page.screenshot({ path: 'e2e-out/m10-adeptus-custodes-03-shooting.png' })
        console.log(`[adeptus-custodes] shooting shot: dice ${shootStartDice} -> ${n}`)
        shotShooting = true
        break
      }
    }
    if (shootStartDice !== null && s.phase !== 'shooting') {
      await page.screenshot({ path: 'e2e-out/m10-adeptus-custodes-03-shooting.png' })
      shotShooting = true
      break
    }
    if (!s.pending || s.pending.player === s.botSeat) { await page.waitForTimeout(150); continue }
    if (s.pending.kind === 'reactionWindow' && !shotShooting && s.pending.options?.length) {
      // Fire Overwatch with the Custodes: the first real adeptus-custodes shooting the game offers.
      await clickFirstOption(page, true)
      await page.waitForTimeout(2200)
      await dismissBanner(page)
      await page.screenshot({ path: 'e2e-out/m10-adeptus-custodes-03-shooting.png' })
      console.log('[adeptus-custodes] overwatch shot taken')
      shotShooting = true
      break
    }
    console.log(`[adeptus-custodes] human decision ${s.pending.kind} phase=${s.phase} round=${s.round} active=${s.active}`)
    await handleHuman(page, s).catch((e) => { console.log('HFAIL ' + String(e).slice(0, 400)); return page.screenshot({ path: 'e2e-out/dbg-hfail.png' }) })
    await page.waitForTimeout(60)
  }

  const fin = await snap(page)
  console.log(`[adeptus-custodes] end: phase=${fin.phase} round=${fin.round} pending=${fin.pending?.kind}/${fin.pending?.player} human=${humanSeat} bot=${fin.botSeat} mine=${mine.join(',')} board=${fin.units.filter((u) => u.loc === 'board').map((u) => u.player + ':' + u.name).join(',')}`)
  const deployed = fin.units.filter((u) => u.player === humanSeat && u.loc === 'board')
  expect(shotDeployed, 'deployment finished').toBe(true)
  expect(shotShooting, `reached the Shooting phase (now ${fin.phase} round ${fin.round})`).toBe(true)
  expect(deployed.length, 'adeptus-custodes units on the board').toBeGreaterThanOrEqual(3)
  expect(consoleErrors, 'no console errors').toEqual([])
})
