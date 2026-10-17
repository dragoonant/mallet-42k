import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Touch controls (M11): runs only in the pixel project (Chromium, so a CDP session can inject real touch
// events). Opens the movement scenario, taps one of the active unit's models, drags it a short way with one
// finger, expects the commit/cancel bar, taps Confirm and checks the model really moved in the game state.
// Screenshots land in e2e-out/ for visual review.

test.setTimeout(240_000)
test.describe.configure({ mode: 'serial' }) // two fingers vs one finger: keep the load (and frame rate) steady
const LOAD_MS = 90_000

type Pt = { x: number; z: number }
interface Win {
  __mallet: {
    useGameStore: { getState(): { state: { models: Record<string, { pos: Pt }>; units: Record<string, { player: string; models: string[] }> } } }
    useUiStore: { getState(): { draft: { placements: { modelId: string; pos: Pt }[] } | null } }
  }
  __malletCamera: { lookAt(x: number, z: number, d: number): void; get(): { distance: number; azimuth: number; x: number; z: number } }
  __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
}

// wait until the camera has stopped easing (the top-down lerp is slow under load): a probe point holds still
async function settleCamera(page: import('@playwright/test').Page) {
  let last = ''
  let still = 0
  for (let i = 0; i < 60 && still < 4; i++) {
    await page.waitForTimeout(250)
    const cur = JSON.stringify(await page.evaluate(() => { const p = (window as unknown as Win).__malletProject(0, 0, 0); return [Math.round(p.x), Math.round(p.y)] }))
    still = cur === last ? still + 1 : 0
    last = cur
  }
}

test('phone: one-finger tap, drag a model, Confirm from the action bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel', 'needs Chromium CDP touch injection')
  mkdirSync('e2e-out', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('./?scenario=floor-picker')
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, null, { timeout: LOAD_MS })
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()

  // look straight down so no ruin wall sits between the camera and the models being dragged
  await page.evaluate(() => (window as unknown as { __mallet: { useUiStore: { getState(): { toggleTopDown(): void } } } }).__mallet.useUiStore.getState().toggleTopDown())
  await settleCamera(page)

  // frame the active unit (its models are the pending move's candidates)
  const unit = await page.evaluate(() => {
    const w = window as unknown as Win
    const gs = w.__mallet.useGameStore.getState().state
    const pend = (w.__mallet.useGameStore.getState() as unknown as { pending: { context: { unitId: string } } }).pending
    const ids = gs.units[pend.context.unitId].models
    const cx = ids.reduce((a, id) => a + gs.models[id].pos.x, 0) / ids.length
    const cz = ids.reduce((a, id) => a + gs.models[id].pos.z, 0) / ids.length
    // frame it so the unit sits in the open strip under the top bar: the formation strip and decision sheet
    // fill the lower half of a phone screen once a move is staged
    let best = { x: cx, z: cz, err: Infinity }
    for (let i = 0; i < 24; i++) {
      for (const r of [0, 2, 4, 6, 8]) {
        const tx = cx + Math.cos((i / 24) * Math.PI * 2) * r
        const tz = cz + Math.sin((i / 24) * Math.PI * 2) * r
        w.__malletCamera.lookAt(tx, tz, 16)
        const p = w.__malletProject(cx, 0.07, cz)
        const err = Math.hypot(p.x - window.innerWidth * 0.4, p.y - 100)
        if (err < best.err) best = { x: tx, z: tz, err }
      }
    }
    w.__malletCamera.lookAt(best.x, best.z, 16)
    return { cx, cz }
  })
  // fold the decision sheet away so it does not sit on the board
  await settleCamera(page)

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id: 1 }] })
  const proj = (p: Pt) => page.evaluate(({ x, z }) => (window as unknown as Win).__malletProject(x, 0.07, z), p)

  // (a) tap open ground near the unit, on a side that is clear of the HUD panels (the camera is turned to the
  // player's side, so world axes are not screen axes). A spot that is blocked (ruin wall, enemy) clamps the
  // staged move back to the start, so try the clear-looking spots in turn until the draft really moves.
  const candidates = await page.evaluate(({ cx, cz }) => {
    const w = window as unknown as Win
    const centre = w.__malletProject(cx, 0.07, cz)
    const target = { x: centre.x, y: centre.y }
    const out: { x: number; y: number; d: number }[] = []
    for (let i = 0; i < 24; i++) {
      for (const r of [1.5, 2, 2.5, 3, 4, 5]) {
        const p = w.__malletProject(cx + Math.cos((i / 24) * Math.PI * 2) * r, 0.07, cz + Math.sin((i / 24) * Math.PI * 2) * r)
        if (p.x < 40 || p.x > window.innerWidth - 120 || p.y < 62 || p.y > 146) continue
        out.push({ x: p.x, y: p.y, d: Math.hypot(p.x - target.x, p.y - target.y) })
      }
    }
    return out.sort((m, n) => m.d - n.d)
  }, unit)
  expect(candidates.length).toBeGreaterThan(0)
  const stagedDistance = () =>
    page.evaluate(({ cx, cz }) => {
      const d = (window as unknown as Win).__mallet.useUiStore.getState().draft as unknown as { anchor: Pt } | null
      return d ? Math.hypot(d.anchor.x - cx, d.anchor.z - cz) : -1
    }, unit)
  let staged = -1
  for (const c of candidates.slice(0, 40)) {
    await touch('touchStart', c.x, c.y)
    await page.waitForTimeout(80)
    await touch('touchEnd')
    // a loaded machine can take a moment to stage the move: give the draft time to settle before judging the spot
    for (let k = 0; k < 4; k++) {
      await page.waitForTimeout(250)
      staged = await stagedDistance()
      if (staged > 1) break
    }
    if (staged > 1) break
    if (staged >= 0) await page.getByTestId('touch-cancel').click()
  }
  expect(staged).toBeGreaterThan(1)

  // drag a model whose pixel is open board (the formation strip and decision sheet sit over part of the screen)
  const plan = await page.evaluate(() => {
    const w = window as unknown as Win
    const ps = w.__mallet.useUiStore.getState().draft!.placements
    const open = ps.filter((p) => {
      const q = w.__malletProject(p.pos.x, 0.07, p.pos.z)
      if (q.x < 30 || q.x > window.innerWidth - 90 || q.y < 70 || q.y > window.innerHeight - 30) return false
      const el = document.elementFromPoint(q.x, q.y)
      return !el || el.tagName === 'CANVAS'
    })
    const first = (open.length ? open : ps)[0]
    return { id: first.modelId, from: { x: first.pos.x, z: first.pos.z } }
  })
  const modelPos = () =>
    page.evaluate((id) => (window as unknown as Win).__mallet.useGameStore.getState().state.models[id].pos, plan.id)
  const draftPos = () =>
    page.evaluate((id) => (window as unknown as Win).__mallet.useUiStore.getState().draft?.placements.find((p) => p.modelId === id)?.pos ?? null, plan.id)
  const a = await proj(plan.from)
  const startPos = await modelPos()

  // (b) arm "Whole unit" with a real tap (a finger has no Shift key), then drag one model 40px in
  // 12 steps: the whole formation follows, so the staged move stays in coherency and legal
  const whole = page.getByTestId('touch-whole-unit')
  const wbox = (await whole.boundingBox())!
  await touch('touchStart', wbox.x + wbox.width / 2, wbox.y + wbox.height / 2)
  await page.waitForTimeout(60)
  await touch('touchEnd')
  await expect(whole).toHaveAttribute('aria-pressed', 'true')
  const before = await draftPos()
  // drag back toward where the unit started, so the staged move stays inside its move allowance
  const home = await proj({ x: unit.cx, z: unit.cz })
  const len = Math.hypot(home.x - a.x, home.y - a.y)
  const dx = ((home.x - a.x) / len) * 40
  // a dragged model rides 60px above the fingertip (LIFT_PX), so the finger ends 60px below where the model should be
  const dy = ((home.y - a.y) / len) * 40 + 60
  await touch('touchStart', a.x, a.y)
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', a.x + (dx * i) / 12, a.y + (dy * i) / 12)
    await page.waitForTimeout(15)
  }
  await page.waitForTimeout(200)
  await touch('touchEnd')
  await page.waitForTimeout(500)
  const dp = await draftPos()
  expect(dp).not.toBeNull()
  expect(Math.hypot(dp!.x - before!.x, dp!.z - before!.z)).toBeGreaterThan(0.3)

  // (c) the staged move shows the commit/cancel bar
  const bar = page.getByTestId('touch-action-bar')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(600) // let the sheet finish folding
  await page.screenshot({ path: 'e2e-out/mobile-pixel-04-touch-move.png' })

  // (d) tap Confirm with a real touch at the button's centre
  const confirm = page.getByTestId('touch-confirm')
  // The drag above proved a model can be pulled by one finger. A drag that happens to push the unit into a wall leaves a
  // staged move that is rightly blocked (Confirm disabled with a reason); then start over with a plain tap on open
  // ground and confirm that, so the commit-by-touch path is still proven.
  if (await confirm.isDisabled()) {
    await expect(page.getByTestId('touch-reason')).toBeVisible()
    await page.getByTestId('touch-cancel').click()
    let restaged = false
    for (const c of candidates.slice(0, 40)) {
      await touch('touchStart', c.x, c.y)
      await page.waitForTimeout(80)
      await touch('touchEnd')
      await page.waitForTimeout(500)
      if ((await stagedDistance()) > 1 && (await confirm.isEnabled().catch(() => false))) { restaged = true; break }
      if (await page.getByTestId('touch-cancel').isVisible().catch(() => false)) await page.getByTestId('touch-cancel').click()
    }
    expect(restaged).toBe(true)
  }
  await expect(confirm).toBeEnabled()
  const box = (await confirm.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  await touch('touchStart', box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(60)
  await touch('touchEnd')

  await expect(bar).toBeHidden({ timeout: 10_000 })
  const end = await modelPos()
  const moved = Math.hypot(end.x - startPos.x, end.z - startPos.z)
  expect(moved).toBeGreaterThan(0.5)
  expect(errors).toEqual([])
})

test('phone: two fingers move the camera (pinch zoom, twist) and never start a selection or move', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel', 'needs Chromium CDP touch injection')
  mkdirSync('e2e-out', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('./?scenario=floor-picker')
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletCamera, null, { timeout: LOAD_MS })
  await page.evaluate(() => (window as unknown as Win).__malletCamera.lookAt(0, 0, 40))
  await page.waitForTimeout(1200)

  const cam = () => page.evaluate(() => (window as unknown as Win).__malletCamera.get())
  const stagedMove = () => page.evaluate(() => (window as unknown as Win).__mallet.useUiStore.getState().draft !== null)
  const draftBefore = await stagedMove()
  const selBefore = await page.evaluate(() => (window as unknown as { __mallet: { useUiStore: { getState(): { selectedUnitId?: string | null } } } }).__mallet.useUiStore.getState().selectedUnitId ?? null)
  const c0 = await cam()

  const cdp = await page.context().newCDPSession(page)
  const touches = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) })
  const vp = page.viewportSize()!
  const cx = vp.width / 2
  const cy = vp.height / 2

  // pinch out: two fingers start 60px apart and spread to 260px
  const pinch = (half: number) => [{ x: cx - half, y: cy }, { x: cx + half, y: cy }]
  await touches('touchStart', pinch(30))
  for (let i = 1; i <= 14; i++) {
    await touches('touchMove', pinch(30 + (100 * i) / 14))
    await page.waitForTimeout(20)
  }
  await touches('touchEnd', [])
  await page.waitForTimeout(600)
  const c1 = await cam()
  expect(Math.abs(c1.distance - c0.distance)).toBeGreaterThan(1)

  // twist: both fingers circle the midpoint by ~60 degrees
  const radius = 90
  const at = (a: number) => [
    { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius },
    { x: cx - Math.cos(a) * radius, y: cy - Math.sin(a) * radius },
  ]
  await touches('touchStart', at(0))
  for (let i = 1; i <= 16; i++) {
    await touches('touchMove', at((Math.PI / 3) * (i / 16)))
    await page.waitForTimeout(20)
  }
  await touches('touchEnd', [])
  await page.waitForTimeout(600)
  const c2 = await cam()
  expect(Math.abs(c2.azimuth - c1.azimuth)).toBeGreaterThan(0.05)

  // the board saw none of it: no staged move, same selection
  expect(await stagedMove()).toBe(draftBefore)
  const selAfter = await page.evaluate(() => (window as unknown as { __mallet: { useUiStore: { getState(): { selectedUnitId?: string | null } } } }).__mallet.useUiStore.getState().selectedUnitId ?? null)
  expect(selAfter).toBe(selBefore)
  await page.screenshot({ path: 'e2e-out/mobile-pixel-07-two-finger-camera.png' })
  expect(errors).toEqual([])
})

test('phone: a tap beyond the move range says why instead of silently doing nothing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel', 'needs Chromium CDP touch injection')
  mkdirSync('e2e-out', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('./?scenario=floor-picker')
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, null, { timeout: LOAD_MS })
  await page.evaluate(() => (window as unknown as { __mallet: { useUiStore: { getState(): { toggleTopDown(): void } } } }).__mallet.useUiStore.getState().toggleTopDown())
  await settleCamera(page)
  const unit = await page.evaluate(() => {
    const w = window as unknown as Win
    const gs = w.__mallet.useGameStore.getState().state
    const pend = (w.__mallet.useGameStore.getState() as unknown as { pending: { context: { unitId: string }; constraints: { maxDistance: number } } }).pending
    const ids = gs.units[pend.context.unitId].models
    const cx = ids.reduce((a, id) => a + gs.models[id].pos.x, 0) / ids.length
    const cz = ids.reduce((a, id) => a + gs.models[id].pos.z, 0) / ids.length
    w.__malletCamera.lookAt(cx, cz + 2, 26)
    return { cx, cz, max: pend.constraints.maxDistance }
  })
  await settleCamera(page)
  // a spot well past the move allowance, on open canvas (not under a HUD panel)
  const far = await page.evaluate(({ cx, cz, max }) => {
    const w = window as unknown as Win
    for (let i = 0; i < 24; i++) {
      const x = cx + Math.cos((i / 24) * Math.PI * 2) * (max + 5)
      const z = cz + Math.sin((i / 24) * Math.PI * 2) * (max + 5)
      const p = w.__malletProject(x, 0.1, z)
      if (p.x < 50 || p.x > window.innerWidth - 120 || p.y < 70 || p.y > window.innerHeight - 40) continue
      const el = document.elementFromPoint(p.x, p.y)
      if (!el || el.tagName === 'CANVAS') return { x: p.x, y: p.y }
    }
    return null
  }, unit)
  expect(far).not.toBeNull()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: far!.x, y: far!.y, id: 1 }] })
  await page.waitForTimeout(70)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // the tap is either staged at the farthest legal spot (with an "Out of range" / "short of" note) or refused with its reason
  const toast = page.getByText(/Out of range|Can't move there|Staged short/)
  await expect(toast).toBeVisible({ timeout: 5_000 })
  const anchor = await page.evaluate(() => (window as unknown as { __mallet: { useUiStore: { getState(): { draft: { anchor: Pt } | null } } } }).__mallet.useUiStore.getState().draft?.anchor ?? null)
  if (anchor) expect(Math.hypot(anchor.x - unit.cx, anchor.z - unit.cz)).toBeLessThanOrEqual(unit.max + 0.01)
  await page.screenshot({ path: 'e2e-out/mobile-pixel-08-out-of-range-tap.png' })
  expect(errors).toEqual([])
})
