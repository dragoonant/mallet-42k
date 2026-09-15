import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import {
  deployZoneCandidates, makeCam, project, snap as sharedSnap, tryBoardPlacement,
  type Cam, type Snap as SharedSnap, type V2,
} from './helpers'

// Fast iteration harness for the deployment step only (see play.spec.ts for the full playtest, which
// this deliberately does not run — that one takes ~14 minutes). Starts a game as Space Marines vs Bot,
// deploys every human unit through the real UI (board clicks, same as play.spec.ts's own deployment
// loop), and asserts the game reaches the Command phase with every unit off the deploy palette.
//
// Also verifies the M9 deploy-panel-dock fix directly: at both 1600x900 and 1280x720, the centre of
// each side's deployment-zone strip (projected the same way play.spec.ts does) must resolve to the
// <canvas> element, not a HUD panel — i.e. the panel never sits on top of the zone a player needs to
// click into.

type Snap = SharedSnap
const snap = (page: Page) => sharedSnap(page)

const log: string[] = []
const note = (s: string) => {
  log.push(s)
  console.log(`[deploy-only] ${s}`)
}

/** Deploys every one of the human seat's own units through real board clicks; returns once the pending
 *  decision is no longer a deployUnit for our own seat (either everything's placed, or the engine has
 *  moved on to the enemy's picks / first-turn roll-off / Scouts). */
async function deployAllHuman(page: Page, cam: Cam, W: number, H: number, humanSeat: string): Promise<void> {
  for (let guard = 0; guard < 20; guard++) {
    const s = await snap(page)
    if (!s.pending || s.pending.kind !== 'deployUnit' || s.pending.player !== humanSeat) return
    const uid: string = s.pending.context.unitIds[0]
    const name = s.units.find((u) => u.id === uid)?.name ?? uid
    const chip = page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
    if (!(await chip.isVisible().catch(() => false))) {
      note(`${name}: unit chip not visible/clickable — stopping human deployment`)
      return
    }
    await chip.click()
    const zone: V2[] = s.pending.context.zone
    const taken = s.units.filter((u) => u.player === humanSeat && u.loc === 'board').length
    const points = deployZoneCandidates(zone, s.pieces, taken, cam, W, H)
    note(`${name}: trying ${points.length} candidates`)
    const placed = await tryBoardPlacement(page, s, points, cam, W, H, name, { note })
    if (!placed) {
      // last resort so the loop can't spin forever: hold in reserve if legal
      const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
      if (await res.isVisible().catch(() => false)) await res.click()
      else throw new Error(`could not deploy ${name} through the UI (every candidate click was blocked or invalid)`)
    }
    await page.waitForTimeout(100)
  }
  throw new Error('deployAllHuman: guard limit reached without finishing deployment')
}

async function runDeployOnly(page: Page, W: number, H: number, screenshotPath: string) {
  test.setTimeout(300_000)
  try {
    await runDeployOnlyBody(page, W, H, screenshotPath)
  } finally {
    console.log(`[deploy-only] log so far (${W}x${H}):\n${log.join('\n')}`)
  }
}

async function runDeployOnlyBody(page: Page, W: number, H: number, screenshotPath: string) {
  await page.setViewportSize({ width: W, height: H })
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByRole('button', { name: 'Space Marines' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('deploy-only-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(2500) // camera polar lerp + first frames

  const cam: Cam = makeCam()

  // The fix under test: neither side's deployment-zone strip should be covered by a HUD panel. Check
  // this right away, before any unit is placed, using the mission's own zone polygons (both sides).
  const s0 = await snap(page)
  expect(s0.zones, 'mission exposes deploymentZones').toBeTruthy()
  const humanSeat = s0.pending?.player ?? 'A'
  for (const [label, zone] of Object.entries(s0.zones!) as [string, V2[]][]) {
    const xs = zone.map((p) => p.x)
    const zs = zone.map((p) => p.z)
    const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
    const pt = project({ x: centre.x, y: 0, z: centre.z }, cam, W, H)
    const tag = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, [pt.x, pt.y])
    expect(tag, `zone ${label} centre (${Math.round(pt.x)},${Math.round(pt.y)}) at ${W}x${H} must be the canvas, not a HUD panel`).toBe('CANVAS')
  }

  // Deploy every one of our own units, alternating with the bot as the engine schedules it.
  for (let guard = 0; guard < 40; guard++) {
    const s = await snap(page)
    if (s.phase !== 'setup' && s.phase !== 'deployment') break
    if (s.pending?.kind === 'deployUnit' && s.pending.player === humanSeat) {
      await deployAllHuman(page, cam, W, H, humanSeat)
    } else {
      await page.waitForTimeout(200)
    }
  }

  // Drain any remaining setup decisions (first-turn roll-off / Scouts) that need a click to proceed —
  // mirror play.spec.ts's generic "click the first option, else pass" fallback. Stops the instant the
  // game leaves setup/deployment (i.e. as soon as the Command phase is reached) rather than driving
  // any further — this spec only needs to prove deployment itself completes through the UI.
  for (let guard = 0; guard < 40; guard++) {
    const s = await snap(page)
    if (s.phase !== 'setup' && s.phase !== 'deployment') break
    if (!s.pending) {
      await page.waitForTimeout(150)
      continue
    }
    if (s.pending.player === s.botSeat) {
      await page.waitForTimeout(150)
      continue
    }
    const opt = page.locator('[data-testid^="prompt-option-"]').first()
    if (await opt.isVisible().catch(() => false)) {
      await opt.click()
    } else {
      const passBtn = page.getByTestId('btn-pass')
      if (await passBtn.isVisible().catch(() => false)) await passBtn.click()
    }
    await page.waitForTimeout(150)
  }

  const final = await snap(page)
  await page.screenshot({ path: screenshotPath })
  console.log(`[deploy-only] final: phase=${final.phase} round=${final.round} log=\n${log.join('\n')}`)

  expect(consoleErrors, 'no console errors').toEqual([])
  // Command is the first phase of every round (src/engine/phases/command.ts), reached the moment
  // deployment/setup ends — with a fresh army (no battle-shocked units) it can resolve with zero
  // pending decisions and hand straight off to Movement before this test's own next poll, so pinning
  // the live phase to exactly 'command' is a race against the engine's own speed, not a real check.
  // Being in *any* of the real per-round phases is proof Command was already reached and completed.
  const REAL_ROUND_PHASES = new Set(['command', 'movement', 'shooting', 'charge', 'fight'])
  expect(REAL_ROUND_PHASES.has(final.phase), `reached the Command phase (now '${final.phase}')`).toBe(true)
  const humanUnits = final.units.filter((u) => u.player === humanSeat)
  const undeployed = humanUnits.filter((u) => u.loc !== 'board' && u.loc !== 'reserves')
  expect(undeployed, 'every human unit is deployed (on board or held in reserve)').toEqual([])
}

test('deploy-only: Space Marines vs Bot reaches Command phase (1600x900)', async ({ page }) => {
  mkdirSync('e2e-out', { recursive: true })
  await runDeployOnly(page, 1600, 900, 'e2e-out/deploy-dock-1600.png')
})

test('deploy-only: Space Marines vs Bot reaches Command phase (1280x720)', async ({ page }) => {
  mkdirSync('e2e-out', { recursive: true })
  await runDeployOnly(page, 1280, 720, 'e2e-out/deploy-dock-1280.png')
})
