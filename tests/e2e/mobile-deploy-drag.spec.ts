import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Deployment drag preview on a phone (Chromium + CDP touch events; WebKit is not needed for the logic). Plays Gordrang's
// Gitstompas against the bot and, when it is the human's turn to place:
//   1. drags the Deff Dread (60mm base) across the zone with one finger, drops it, Confirms           -> an already-deployed big base
//   2. drags the Deffkoptas (75x42mm oval bases) across the zone: mid-drag the formation follows the finger as a live preview,
//      and lifting leaves it as the DRAFT without deploying anything (no UnitDeployed, Confirm in the prompt still commits).
// Screenshots (test-results/deploy/): mid-drag.png (the oval formation following the finger), big-base-draft.png (the drafted
// Deffkoptas ghosts next to the deployed Deff Dread, so their base sizes can be compared) and, in a low-graphics run (ghosts still drawn), outline-only.png.

test.setTimeout(420_000)
test.describe.configure({ mode: 'serial' })
const LOAD_MS = 120_000
const OUT = 'test-results/deploy'

type Pt = { x: number; z: number }
interface Win {
  __mallet: {
    useGameStore: { getState(): { state: { units: Record<string, { name: string; datasheetId: string; location: string; models: string[] }>; models: Record<string, { pos: Pt; base: { radius: number } }> }; pending: { id: string; kind: string; player: string; context: { unitIds: string[]; zone: Pt[] } } | null; humanSeat: string; events: { type: string }[] } }
    useUiStore: { getState(): { draft: { unitId: string; placements: { modelId: string; pos: Pt }[] } | null; deployPreview: { unitId: string; placements: { modelId: string; pos: Pt }[] } | null; toggleTopDown(): void } }
  }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
  __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
}

async function settleCamera(page: Page) {
  let last = ''
  let still = 0
  for (let i = 0; i < 60 && still < 4; i++) {
    await page.waitForTimeout(250)
    const cur = JSON.stringify(await page.evaluate(() => { const p = (window as unknown as Win).__malletProject(0, 0, 0); return [Math.round(p.x), Math.round(p.y)] }))
    still = cur === last ? still + 1 : 0
    last = cur
  }
}

async function startGame(page: Page, lowGraphics: boolean) {
  await page.addInitScript((low) => {
    try {
      localStorage.setItem('mallet42k:presentation-settings', JSON.stringify({ animSpeed: 'instant', lowGraphics: low, battlefieldAmbience: false, cinematicCamera: false, diceOn: false }))
    } catch { /* storage blocked: defaults apply */ }
  }, lowGraphics)
  await page.goto('./')
  await expect(page.getByTestId('start-game')).toBeVisible({ timeout: LOAD_MS })
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Orks', exact: true }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('deploy-drag-seed')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: LOAD_MS })
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, null, { timeout: LOAD_MS })
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()
}

/** Waits until it is the human's turn to place one of `names`, returns that unit's id and the zone. */
async function waitForPlacement(page: Page, name: string) {
  await page.waitForFunction(
    (n) => {
      const g = (window as unknown as Win).__mallet.useGameStore.getState()
      const p = g.pending
      return !!p && p.kind === 'deployUnit' && p.player === g.humanSeat && p.context.unitIds.some((id) => g.state.units[id].name === n)
    },
    name,
    { timeout: LOAD_MS, polling: 500 },
  )
  return page.evaluate((n) => {
    const g = (window as unknown as Win).__mallet.useGameStore.getState()
    const p = g.pending!
    const id = p.context.unitIds.find((u) => g.state.units[u].name === n)!
    const radii = g.state.units[id].models.map((m) => g.state.models[m].base.radius)
    return { id, zone: p.context.zone, models: g.state.units[id].models.length, maxRadius: Math.max(...radii) }
  }, name)
}

test.describe('phone: drag to preview where a unit will stand', () => {
  for (const lowGraphics of [false, true]) {
    test(`${lowGraphics ? 'low graphics' : 'default graphics'}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'pixel', 'needs Chromium CDP touch injection')
      mkdirSync(OUT, { recursive: true })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(String(e)))
      await startGame(page, lowGraphics)

      const cdp = await page.context().newCDPSession(page)
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id: 1 }] })
      const proj = (p: Pt) => page.evaluate(({ x, z }) => (window as unknown as Win).__malletProject(x, 0.07, z), p)
      const ui = () => page.evaluate(() => { const u = (window as unknown as Win).__mallet.useUiStore.getState(); return { draft: u.draft ? { unitId: u.draft.unitId, n: u.draft.placements.length } : null, preview: u.deployPreview ? { unitId: u.deployPreview.unitId, n: u.deployPreview.placements.length, x: u.deployPreview.placements[0].pos.x, z: u.deployPreview.placements[0].pos.z } : null } })
      const deployedEvents = () => page.evaluate(() => (window as unknown as Win).__mallet.useGameStore.getState().events.filter((e) => e.type === 'UnitDeployed').length)
      const locOf = (id: string) => page.evaluate((u) => (window as unknown as Win).__mallet.useGameStore.getState().state.units[u].location, id)

      // look straight down at the human's zone so nothing hides the strip
      await page.evaluate(() => (window as unknown as Win).__mallet.useUiStore.getState().toggleTopDown())

      /** One-finger drag of the chosen unit across the zone from fraction a to b of its width; `onMid` runs while the finger is still down. */
      const dragAcross = async (zone: Pt[], from: Pt, to: Pt, onMid?: (jiggle: (k: number) => Promise<unknown>) => Promise<void>) => {
        const lift = 60
        const a = await proj(from)
        const b = await proj(to)
        await touch('touchStart', a.x, a.y + lift)
        const steps = 14
        for (let i = 1; i <= steps; i++) {
          await touch('touchMove', a.x + ((b.x - a.x) * i) / steps, a.y + lift + ((b.y - a.y) * i) / steps)
          await page.waitForTimeout(40)
          if (i === Math.floor(steps / 2) && onMid) {
            const mx = a.x + (b.x - a.x) / 2
            const my = a.y + lift + (b.y - a.y) / 2
            await onMid((k) => touch('touchMove', mx + (k % 2 ? 2 : -2), my))
          }
        }
        await page.waitForTimeout(150)
        await touch('touchEnd')
        await page.waitForTimeout(400)
        void zone
      }
      const zoneSpan = (zone: Pt[]) => {
        const xs = zone.map((p) => p.x)
        const zs = zone.map((p) => p.z)
        return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
      }
      // frame the zone high on the screen: the prompt sheet and the formation strip fill the bottom of a phone, and a finger
      // that starts on them is not a board gesture. The fingertip sits 60px below where the formation lands (LIFT_PX).
      const frameZone = async (zone: Pt[]) => {
        const s = zoneSpan(zone)
        const c = { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 }
        const best = await page.evaluate(({ c }) => {
          const w = window as unknown as Win
          let best = { x: c.x, z: c.z, err: Infinity }
          for (let i = 0; i < 24; i++) {
            for (const r of [0, 2, 4, 6, 8, 10]) {
              const tx = c.x + Math.cos((i / 24) * Math.PI * 2) * r
              const tz = c.z + Math.sin((i / 24) * Math.PI * 2) * r
              w.__malletCamera.lookAt(tx, tz, 14)
              const p = w.__malletProject(c.x, 0.07, c.z)
              const err = Math.hypot(p.x - window.innerWidth * 0.4, p.y - 125)
              if (err < best.err) best = { x: tx, z: tz, err }
            }
          }
          w.__malletCamera.lookAt(best.x, best.z, 14)
          return best
        }, { c })
        void best
        await settleCamera(page)
      }

      // (1) the Deff Dread: drag, lift, Confirm -> a real, already-deployed big base
      const dread = await waitForPlacement(page, 'Deff Dread')
      expect(dread.maxRadius).toBeGreaterThan(1.1) // 60mm
      await page.locator('[data-testid="prompt"] button').filter({ hasText: /^Deff Dread$/ }).first().click()
      await frameZone(dread.zone)
      const span = zoneSpan(dread.zone)
      const cx = (span.x0 + span.x1) / 2
      const cz = (span.z0 + span.z1) / 2
      const eventsBefore = await deployedEvents()
      await dragAcross(dread.zone, { x: cx - 4, z: cz }, { x: cx - 2, z: cz - 1 })
      expect((await ui()).draft?.unitId).toBe(dread.id)
      expect(await deployedEvents()).toBe(eventsBefore) // the lift staged it; nothing deployed yet
      await page.getByTestId('touch-confirm').click()
      await expect.poll(() => locOf(dread.id), { timeout: 30_000 }).toBe('board')

      // (2) the Deffkoptas: preview mid-drag, draft after the lift, nothing deployed
      const koptas = await waitForPlacement(page, 'Deffkoptas')
      await page.locator('[data-testid="prompt"] button').filter({ hasText: /^Deffkoptas$/ }).first().click()
      await frameZone(koptas.zone)
      const before = await deployedEvents()
      let mid: Awaited<ReturnType<typeof ui>> | null = null
      let midMoved = false
      await dragAcross(
        koptas.zone,
        { x: cx - 5, z: cz + 1 },
        { x: cx + 2.5, z: cz - 0.5 },
        async (jiggle) => {
          // a software-GL runner can take seconds per frame: keep the finger down and nudging until the preview shows
          for (let k = 0; k < 60; k++) {
            mid = await ui()
            if (mid.preview) break
            await jiggle(k)
            await page.waitForTimeout(250)
          }
          mid = await ui()
          expect(mid.preview, 'a preview exists while the finger is down and dragging').not.toBeNull()
          expect(mid.preview!.unitId).toBe(koptas.id)
          expect(mid.preview!.n).toBe(koptas.models)
          expect(mid.draft).toBeNull()
          midMoved = true
          await page.screenshot({ path: lowGraphics ? `${OUT}/mid-drag-lowgfx.png` : `${OUT}/mid-drag.png` })
        },
      )
      expect(midMoved).toBe(true)
      const after = await ui()
      expect(after.preview, 'the preview is gone after the lift').toBeNull()
      expect(after.draft, 'the lift leaves the formation as the draft').toEqual({ unitId: koptas.id, n: koptas.models })
      expect(await deployedEvents(), 'lifting never deploys').toBe(before)
      expect(await locOf(koptas.id)).not.toBe('board')
      await expect(page.getByTestId('touch-confirm')).toBeVisible()
      await page.waitForTimeout(500)
      await page.screenshot({ path: lowGraphics ? `${OUT}/outline-only.png` : `${OUT}/big-base-draft.png` })

      // Confirm still commits
      if (await page.getByTestId('touch-confirm').isEnabled()) {
        await page.getByTestId('touch-confirm').click()
        await expect.poll(() => locOf(koptas.id), { timeout: 30_000 }).toBe('board')
      }
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})
