import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// One-finger camera on a phone (Chromium + CDP touch events). During human deployment with a unit chosen:
//   (a) a one-finger drag that starts OUTSIDE the deployment zone pans the board: the orbit target moves, the ground point
//       under the finger stays under the finger, and no preview / draft appears
//   (b) a drag that starts INSIDE the zone previews the formation and leaves the camera where it was
//   (c) a plain tap (a few px of jitter) never moves the camera
// Screenshot: test-results/touchcam/pan.png (after the pan in (a)).

test.setTimeout(300_000)
const LOAD_MS = 120_000
const OUT = 'test-results/touchcam'

type Pt = { x: number; z: number }
interface Win {
  __mallet: {
    useGameStore: { getState(): { state: { units: Record<string, { name: string }> }; pending: { kind: string; player: string; context: { unitIds: string[]; zone: Pt[] } } | null; humanSeat: string } }
    useUiStore: { getState(): { draft: { unitId: string } | null; deployPreview: { unitId: string } | null } }
  }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
  __malletCameraView: () => { position: number[]; target: number[] } | null
  __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
}

const inPoly = (p: Pt, poly: Pt[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

test('phone: one finger pans outside the placement area, previews inside it, and a tap leaves the camera alone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel', 'needs Chromium CDP touch injection')
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.addInitScript(() => {
    try {
      localStorage.setItem('mallet42k:presentation-settings', JSON.stringify({ animSpeed: 'instant', lowGraphics: true, battlefieldAmbience: false, cinematicCamera: false, diceOn: false }))
    } catch { /* defaults apply */ }
  })
  await page.goto('./')
  await expect(page.getByTestId('start-game')).toBeVisible({ timeout: LOAD_MS })
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Orks', exact: true }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('touch-camera-seed')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: LOAD_MS })
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, null, { timeout: LOAD_MS })
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()

  await page.waitForFunction(
    () => {
      const g = (window as unknown as Win).__mallet.useGameStore.getState()
      return !!g.pending && g.pending.kind === 'deployUnit' && g.pending.player === g.humanSeat
    },
    null,
    { timeout: LOAD_MS, polling: 500 },
  )
  const unit = await page.evaluate(() => {
    const g = (window as unknown as Win).__mallet.useGameStore.getState()
    const id = g.pending!.context.unitIds[0]!
    return { id, name: g.state.units[id]!.name, zone: g.pending!.context.zone }
  })
  await page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${unit.name}$`) }).first().click()

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id: 1 }] })
  const proj = (p: Pt) => page.evaluate(({ x, z }) => (window as unknown as Win).__malletProject(x, 0, z), p)
  const view = () => page.evaluate(() => (window as unknown as Win).__malletCameraView()!)
  const ui = () => page.evaluate(() => { const u = (window as unknown as Win).__mallet.useUiStore.getState(); return { draft: !!u.draft, preview: !!u.deployPreview } })
  const settle = async () => {
    let last = ''
    let still = 0
    for (let i = 0; i < 60 && still < 4; i++) {
      await page.waitForTimeout(250)
      const cur = JSON.stringify(await view())
      still = cur === last ? still + 1 : 0
      last = cur
    }
  }
  /** Put the camera over `c` so that it sits near the top of the screen, above the prompt sheet. */
  const frame = async (c: Pt) => {
    await page.evaluate((c) => {
      const w = window as unknown as Win
      let best = { x: c.x, z: c.z, err: Infinity }
      for (let i = 0; i < 24; i++) {
        for (const r of [0, 2, 4, 6, 8, 10]) {
          const tx = c.x + Math.cos((i / 24) * Math.PI * 2) * r
          const tz = c.z + Math.sin((i / 24) * Math.PI * 2) * r
          w.__malletCamera.lookAt(tx, tz, 14)
          const p = w.__malletProject(c.x, 0, c.z)
          const err = Math.hypot(p.x - window.innerWidth * 0.4, p.y - 125)
          if (err < best.err) best = { x: tx, z: tz, err }
        }
      }
      w.__malletCamera.lookAt(best.x, best.z, 14)
    }, c)
    await settle()
  }
  const drag = async (from: { x: number; y: number }, dx: number, dy: number, onMid?: () => Promise<void>) => {
    await touch('touchStart', from.x, from.y)
    const steps = 12
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', from.x + (dx * i) / steps, from.y + (dy * i) / steps)
      await page.waitForTimeout(40)
      if (i === steps / 2 && onMid) await onMid()
    }
    await page.waitForTimeout(150)
    await touch('touchEnd')
    await page.waitForTimeout(300)
  }
  const moved = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!)

  const zc = { x: unit.zone.reduce((s, p) => s + p.x, 0) / unit.zone.length, z: unit.zone.reduce((s, p) => s + p.z, 0) / unit.zone.length }
  const outside = [{ x: 0, z: 0 }, { x: -zc.x, z: -zc.z }, { x: zc.x, z: -zc.z }].find((p) => !inPoly(p, unit.zone))!
  expect(outside, 'a point outside the zone exists').toBeTruthy()

  // (a) outside the zone: pan
  await frame(outside)
  const startPt = await proj(outside)
  const before = await view()
  await drag(startPt, 150, 40)
  const after = await view()
  expect(moved(before.target, after.target), 'the orbit target moved').toBeGreaterThan(1.5)
  const under = await proj(outside)
  expect(Math.hypot(under.x - (startPt.x + 150), under.y - (startPt.y + 40)), 'the ground point stays under the finger').toBeLessThan(10)
  expect(await ui(), 'a pan neither previews nor stages anything').toEqual({ draft: false, preview: false })
  await page.screenshot({ path: `${OUT}/pan.png` })

  // (b) inside the zone: preview, camera still
  await frame(zc)
  const zStart = await proj(zc)
  const beforeB = await view()
  let sawPreview = false
  await drag(zStart, 90, 10, async () => {
    for (let k = 0; k < 40 && !sawPreview; k++) {
      sawPreview = (await ui()).preview
      if (!sawPreview) {
        await touch('touchMove', zStart.x + 45 + (k % 2 ? 2 : -2), zStart.y + 5)
        await page.waitForTimeout(250)
      }
    }
  })
  expect(sawPreview, 'the formation previews under the finger').toBe(true)
  const afterB = await view()
  expect(moved(beforeB.target, afterB.target), 'the camera did not move').toBeLessThan(0.01)
  expect((await ui()).draft, 'the lift staged the formation').toBe(true)

  // (c) a tap with a little jitter: the camera stays
  const beforeC = await view()
  const tapPt = await proj(outside)
  await touch('touchStart', tapPt.x, tapPt.y)
  await touch('touchMove', tapPt.x + 2, tapPt.y + 1)
  await touch('touchEnd')
  await page.waitForTimeout(500)
  const afterC = await view()
  expect(moved(beforeC.target, afterC.target)).toBeLessThan(0.01)
  expect(Math.hypot(beforeC.position[0]! - afterC.position[0]!, beforeC.position[2]! - afterC.position[2]!)).toBeLessThan(0.01)

  expect(errors, errors.join('\n')).toEqual([])
})
