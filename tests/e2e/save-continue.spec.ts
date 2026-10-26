import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { deployZoneCandidates, makeCam, screenshotRendered, snap, tryBoardPlacement, type Cam, type V2 } from './helpers'

// Save / Continue in the real app: start vs the bot at instant speed, deploy through real board clicks into round 1, reload
// the page, and check that the start screen offers Continue, and that clicking it reopens the same round, phase and model
// positions (read from window.__mallet, never dispatched to). The board must open on that position straight away.

const W = 1600
const H = 900
const SHOTS = 'test-results/save'

interface Pos { id: string; x: number; z: number }
interface Where { phase: string; round: number; hash: string; positions: Pos[] }

async function instantSettings(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mallet42k:presentation-settings', JSON.stringify({ animSpeed: 'instant', lowGraphics: true, battlefieldAmbience: false, cinematicCamera: false }))
    } catch { /* storage blocked: defaults apply */ }
  })
}

async function where(page: Page): Promise<Where> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__mallet.useGameStore.getState().state
    return {
      phase: s.phase as string,
      round: s.round as number,
      hash: s.hash as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      positions: Object.values(s.models).map((m: any) => ({ id: m.id as string, x: m.pos.x as number, z: m.pos.z as number })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    }
  })
}

/** Deploys the human seat's units by real board clicks (same approach as deploy-only.spec.ts). */
async function deployHuman(page: Page, cam: Cam, humanSeat: string) {
  for (let guard = 0; guard < 20; guard++) {
    const s = await snap(page)
    if (!s.pending || s.pending.kind !== 'deployUnit' || s.pending.player !== humanSeat) return
    const uid: string = s.pending.context.unitIds[0]
    const name = s.units.find((u) => u.id === uid)?.name ?? uid
    const chip = page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
    if (!(await chip.isVisible().catch(() => false))) return
    await chip.click()
    const zone: V2[] = s.pending.context.zone
    const taken = s.units.filter((u) => u.player === humanSeat && u.loc === 'board').length
    const placed = await tryBoardPlacement(page, s, deployZoneCandidates(zone, s.pieces, taken, cam, W, H), cam, W, H, name, {})
    if (!placed) {
      const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
      if (await res.isVisible().catch(() => false)) await res.click()
      else throw new Error(`could not deploy ${name}`)
    }
    await page.waitForTimeout(100)
  }
}

test('save-continue: reload mid-game, Continue reopens the same position', async ({ page }) => {
  test.setTimeout(300_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))

  await instantSettings(page)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('./')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await expect(page.getByTestId('continue-card'), 'no Continue card before any game').toHaveCount(0)
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Space Marines', exact: true }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('save-continue-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(1500)

  // Deploy, then keep answering our own decisions with the first non-pass option (or Pass) until a few actions into round 1.
  const cam: Cam = makeCam()
  const humanSeat = (await snap(page)).humanSeat
  for (let guard = 0; guard < 120; guard++) {
    const s = await snap(page)
    if (s.round >= 1 && !['setup', 'deployment'].includes(s.phase) && s.phase !== 'command') break
    if (s.pending?.kind === 'deployUnit' && s.pending.player === humanSeat) { await deployHuman(page, cam, humanSeat); continue }
    if (!s.pending || s.pending.player === s.botSeat) { await page.waitForTimeout(150); continue }
    const opt = page.locator('[data-testid^="prompt-option-"]').first()
    if (await opt.isVisible().catch(() => false)) await opt.click()
    else if (await page.getByTestId('btn-pass').isVisible().catch(() => false)) await page.getByTestId('btn-pass').click()
    await page.waitForTimeout(150)
  }
  const mid = await snap(page)
  expect(['movement', 'shooting', 'charge', 'fight', 'command']).toContain(mid.phase)

  // Let the game settle on a decision of ours so the saved position is the one we compare (the bot may still be acting).
  let before = await where(page)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250)
    const now = await where(page)
    const s = await snap(page)
    const settled = now.hash === before.hash && s.pending && s.pending.player !== s.botSeat
    before = now
    if (settled) break
  }
  expect(before.round).toBeGreaterThanOrEqual(1)

  // Reload: back on the start screen, with the Continue card.
  await page.reload()
  await expect(page.getByTestId('start-game')).toBeVisible()
  const card = page.getByTestId('continue-card')
  await expect(card).toBeVisible()
  await expect(page.getByTestId('continue-factions')).toContainText('Space Marines')
  await expect(page.getByTestId('continue-detail')).toContainText(`Round ${before.round}`)
  await expect(page.getByTestId('continue-detail')).toContainText('vs bot')
  await expect(page.getByTestId('continue-time')).toContainText('Last played')
  await page.waitForTimeout(1200) // let the card finish fading in
  await page.screenshot({ path: `${SHOTS}/continue-card.png` })

  // Starting a new game over it asks first; keeping the save leaves the card in place.
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('replace-save-confirm')).toBeVisible()
  await page.getByTestId('replace-save-keep').click()
  await expect(page.getByTestId('replace-save-confirm')).toHaveCount(0)
  await expect(card).toBeVisible()

  await page.getByTestId('continue-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as any).__mallet?.useGameStore.getState().state) // eslint-disable-line @typescript-eslint/no-explicit-any
  const after = await where(page)
  expect(after.round).toBe(before.round)
  expect(after.phase).toBe(before.phase)
  expect(after.hash).toBe(before.hash)
  expect(after.positions).toEqual(before.positions)

  // The board opens on the position at once: nothing queued for presentation.
  const idle = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (window as any).__mallet.useGameStore.getState()
    return { events: p.events.length, botSeat: p.botSeat as string | null }
  })
  expect(idle.events).toBe(0)
  expect(idle.botSeat).toBe('B')
  await page.waitForTimeout(1500)
  await screenshotRendered(page, `${SHOTS}/resumed.png`)

  // Still playable after the restore: the game keeps going and keeps autosaving.
  const keptGoing = await snap(page)
  expect(keptGoing.pending).not.toBeNull()
  expect(errors, 'no page errors').toEqual([])
})
