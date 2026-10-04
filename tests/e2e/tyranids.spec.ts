import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import {
  answerRerollLikeDecision, clickFirstOption, clickPass, makeCam, promptButton,
  snap as sharedSnap, tryBoardPlacement, type Snap, type V2,
} from './helpers'

// A game can be started as Tyranids vs the bot through the real UI, the army deploys (every unit
// through a real board click), and the game reaches the first Shooting phase of battle round 1 with no
// console errors. Screenshots land in e2e-out/ for a human to eyeball the figures.

const W = 1600
const H = 900
const BUDGET_MS = 8 * 60_000
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
    // Which end of the board is ours depends on the side the opening prompt picked: aim at the zone's own middle.
    const side = zone.reduce((a, v) => a + v.z, 0) >= 0 ? 1 : -1
    const inZone: V2[] = xs.flatMap((x) => [12.6, 13.9, 11.3].map((z) => ({ x, z: side * z })))
    // Infiltrators (Von Ryan's Leapers) may set up anywhere more than 9" from the enemy zone: when the strip
    // is full, sweep the open middle of our half too.
    const infil: V2[] = name.includes('Leapers')
      ? [8, 6, 4, 2].flatMap((z) => [0, 6, -6, 12, -12, 18, -18].map((x) => ({ x, z: side * z })))
      : []
    const pts: V2[] = [...infil, ...inZone]
    if (chip && (await tryBoardPlacement(page, s, pts, cam, W, H, name, { note: (m) => console.log('[tyranids] ' + m) }))) return
    const res = await promptButton(page, /^Reserves:/)
    if (res) { await res.click(); return }
    await clickPass(page)
    return
  }
  if (p.kind === 'commandReroll' || p.kind === 'stratagemWindow' || p.kind === 'reactionWindow') {
    if (!(await answerRerollLikeDecision(page))) await clickPass(page)
    return
  }
  if (!(await clickFirstOption(page, false))) await clickPass(page)
}

async function dismissBanner(page: Page): Promise<void> {
  const b = page.getByText('Click anywhere to continue')
  if (await b.isVisible().catch(() => false)) await b.click({ timeout: 1000 }).catch(() => {})
}

async function diceCount(page: Page): Promise<number> {
  const txt = (await page.getByText(/^DICE LOG/).first().textContent({ timeout: 1000 }).catch(() => '')) ?? ''
  return Number(/\((\d+)\)/.exec(txt)?.[1] ?? 0)
}

test('tyranids vs bot: start, deploy, reach the first shooting phase', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  await page.setViewportSize({ width: W, height: H })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Tyranids' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('tyranids-1')
  await page.screenshot({ path: 'e2e-out/m10-tyranids-01-start.png' })
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(2500)

  const s0 = await snap(page)
  const humanSeat = s0.humanSeat
  const mine = s0.units.filter((u) => u.player === humanSeat).map((u) => u.name)
  expect(mine.join(' | '), 'human army is the Tyranids patrol').toMatch(/Termagants/)
  expect(mine.join(' | ')).toMatch(/Psychophage/)

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
      await page.screenshot({ path: 'e2e-out/m10-tyranids-02-deployed.png' })
      shotDeployed = true
    }
    if (s.phase === 'shooting' && s.round >= 1) {
      await dismissBanner(page)
      const n = await diceCount(page)
      if (shootStartDice === null) { shootStartDice = n; shootStartAt = Date.now() }
      if (n > shootStartDice || Date.now() - shootStartAt > 20_000) {
        await page.waitForTimeout(1200)
        await page.screenshot({ path: 'e2e-out/m10-tyranids-03-shooting.png' })
        console.log(`[tyranids] shooting shot: dice ${shootStartDice} -> ${n}`)
        shotShooting = true
        break
      }
    }
    if (shootStartDice !== null && s.phase !== 'shooting') {
      await page.screenshot({ path: 'e2e-out/m10-tyranids-03-shooting.png' })
      shotShooting = true
      break
    }
    if (!s.pending || s.pending.player === s.botSeat) { await page.waitForTimeout(150); continue }
    if (s.pending.kind === 'reactionWindow' && !shotShooting && s.pending.options?.length) {
      // Fire Overwatch with the Tyranids: the first real tyranids shooting the game offers.
      await clickFirstOption(page, true)
      await page.waitForTimeout(2200)
      await dismissBanner(page)
      await page.screenshot({ path: 'e2e-out/m10-tyranids-03-shooting.png' })
      console.log('[tyranids] overwatch shot taken')
      shotShooting = true
      break
    }
    console.log(`[tyranids] t=${Math.round((Date.now() - start) / 1000)}s human decision ${s.pending.kind} phase=${s.phase} round=${s.round} active=${s.active}`)
    await dismissBanner(page)
    await handleHuman(page, s)
    await page.waitForTimeout(60)
  }

  const fin = await snap(page)
  console.log(`[tyranids] end: phase=${fin.phase} round=${fin.round} pending=${fin.pending?.kind}/${fin.pending?.player} human=${humanSeat} bot=${fin.botSeat} mine=${mine.join(',')} board=${fin.units.filter((u) => u.loc === 'board').map((u) => u.player + ':' + u.name).join(',')}`)
  const deployed = fin.units.filter((u) => u.player === humanSeat && u.loc === 'board')
  expect(shotDeployed, 'deployment finished').toBe(true)
  expect(shotShooting, `reached the Shooting phase (now ${fin.phase} round ${fin.round})`).toBe(true)
  expect(deployed.length, 'tyranids units on the board').toBeGreaterThanOrEqual(4)
  expect(consoleErrors, 'no console errors').toEqual([])
})
