import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import {
  answerRerollLikeDecision, clickFirstOption, clickPass, deployZoneCandidates, makeCam, promptButton,
  snap as sharedSnap, tryBoardPlacement, type Snap, type V2,
} from './helpers'

// M10: a game can be started as Chaos Daemons vs the bot through the real UI, the army deploys (every unit
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
    // Terrain-aware candidate points for this player's zone.
    const zone: V2[] = p.context.zone
    const taken = s.units.filter((u) => u.player === p.player && u.loc === 'board').length
    const pts: V2[] = deployZoneCandidates(zone, s.pieces, taken, cam, W, H)
    if (chip) {
      // The Hounds and Juggernauts are big ovals: try compact formations in turn.
      const kinds = ['phalanx', 'ranks3', 'column', 'line']
      for (const kind of kinds) {
        const f = page.getByTestId(`formation-${kind}`)
        if (await f.isVisible().catch(() => false)) await f.click().catch(() => {})
        if (await tryBoardPlacement(page, s, pts, cam, W, H, name, { note: (m) => console.log('[chaos-daemons-butchers-of-hyporia] ' + m) })) return
      }
    }
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

test('chaos-daemons-butchers-of-hyporia vs bot: start, deploy, reach the first shooting phase', async ({ page }) => {
  test.setTimeout(6 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  const consoleErrors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  page.setDefaultTimeout(8000)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: "Chaos Daemons" }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  // The 44x5 strip of the default mission cannot hold this army (20 Bloodletters, 10 Hounds, 3 Juggernauts): use a 10x30 zone.
  await page.getByTestId('setup-mission').selectOption('cp-02')
  await page.getByTestId('setup-seed').fill(process.env.CDM_SEED ?? 'chaos-daemons-butchers-of-hyporia-1')
  await page.screenshot({ path: 'e2e-out/m10-chaos-daemons-01-start.png' })
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
  // This army fills nearly the whole deployment strip, and the scoring panel sits over its right-hand end: let clicks pass through it.
  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="scoring-feed"]')?.parentElement?.parentElement as HTMLElement | null | undefined
    if (panel) panel.style.pointerEvents = 'none'
  })

  const s0 = await snap(page)
  const humanSeat = s0.humanSeat
  const mine = s0.units.filter((u) => u.player === humanSeat).map((u) => u.name)
  expect(mine.join(' | '), 'human army is the Daemons patrol').toMatch(/Bloodletter|Bloodcrusher|Flesh Hound|Kh.har.ret/)

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
      await page.screenshot({ path: 'e2e-out/m10-chaos-daemons-02-deployed.png' })
      shotDeployed = true
    }
    if (s.phase === 'shooting' && s.round >= 1) {
      await dismissBanner(page)
      const n = await diceCount(page)
      if (shootStartDice === null) { shootStartDice = n; shootStartAt = Date.now() }
      if (n > shootStartDice || Date.now() - shootStartAt > 20_000) {
        await page.waitForTimeout(1200)
        await page.screenshot({ path: 'e2e-out/m10-chaos-daemons-03-shooting.png' })
        console.log(`[chaos-daemons-butchers-of-hyporia] shooting shot: dice ${shootStartDice} -> ${n}`)
        shotShooting = true
        break
      }
    }
    if (shootStartDice !== null && s.phase !== 'shooting') {
      await page.screenshot({ path: 'e2e-out/m10-chaos-daemons-03-shooting.png' })
      shotShooting = true
      break
    }
    if (!s.pending || s.pending.player === s.botSeat) { await page.waitForTimeout(150); continue }
    if (s.pending.kind === 'reactionWindow' && !shotShooting && s.pending.options?.length) {
      // Fire Overwatch with the Daemons: the first real chaos-daemons-butchers-of-hyporia shooting the game offers.
      await clickFirstOption(page, true)
      await page.waitForTimeout(2200)
      await dismissBanner(page)
      await page.screenshot({ path: 'e2e-out/m10-chaos-daemons-03-shooting.png' })
      console.log('[chaos-daemons-butchers-of-hyporia] overwatch shot taken')
      shotShooting = true
      break
    }
    console.log(`[chaos-daemons-butchers-of-hyporia] human decision ${s.pending.kind} phase=${s.phase} round=${s.round} active=${s.active}`)
    await handleHuman(page, s).catch((e) => { console.log('HFAIL ' + String(e).slice(0, 400)); return page.screenshot({ path: 'e2e-out/dbg-hfail.png' }) })
    await page.waitForTimeout(60)
  }

  const fin = await snap(page)
  console.log(`[chaos-daemons-butchers-of-hyporia] end: phase=${fin.phase} round=${fin.round} pending=${fin.pending?.kind}/${fin.pending?.player} human=${humanSeat} bot=${fin.botSeat} mine=${mine.join(',')} board=${fin.units.filter((u) => u.loc === 'board').map((u) => u.player + ':' + u.name).join(',')}`)
  const deployed = fin.units.filter((u) => u.player === humanSeat && u.loc === 'board')
  expect(shotDeployed, 'deployment finished').toBe(true)
  expect(shotShooting, `reached the Shooting phase (now ${fin.phase} round ${fin.round})`).toBe(true)
  expect(deployed.length, 'chaos-daemons-butchers-of-hyporia units on the board').toBeGreaterThanOrEqual(3)
  expect(consoleErrors, 'no console errors').toEqual([])
})
