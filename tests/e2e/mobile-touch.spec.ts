import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Touch controls (M11): runs only in the pixel project (Chromium, so a CDP session can inject real touch
// events). Opens the movement scenario, taps one of the active unit's models, drags it a short way with one
// finger, expects the commit/cancel bar, taps Confirm and checks the model really moved in the game state.
// Screenshots land in e2e-out/ for visual review.

test.setTimeout(180_000)
const LOAD_MS = 90_000

type Pt = { x: number; z: number }
interface Win {
  __mallet: {
    useGameStore: { getState(): { state: { models: Record<string, { pos: Pt }>; units: Record<string, { player: string; models: string[] }> } } }
    useUiStore: { getState(): { draft: { placements: { modelId: string; pos: Pt }[] } | null } }
  }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
  __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
}

test('phone: one-finger tap, drag a model, Confirm from the action bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel', 'needs Chromium CDP touch injection')
  mkdirSync('e2e-out', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('./?scenario=floor-picker')
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, null, { timeout: LOAD_MS })
  await expect(page.getByTestId('rotate-prompt')).toBeHidden()

  // frame the active unit (its models are the pending move's candidates)
  const unit = await page.evaluate(() => {
    const w = window as unknown as Win
    const gs = w.__mallet.useGameStore.getState().state
    const pend = (w.__mallet.useGameStore.getState() as unknown as { pending: { context: { unitId: string } } }).pending
    const ids = gs.units[pend.context.unitId].models
    const cx = ids.reduce((a, id) => a + gs.models[id].pos.x, 0) / ids.length
    const cz = ids.reduce((a, id) => a + gs.models[id].pos.z, 0) / ids.length
    w.__malletCamera.lookAt(cx, cz, 16)
    return { cx, cz }
  })
  // the phone HUD is still the desktop layout: fold the decision prompt away so it does not sit on the board
  await page.getByLabel('Minimise prompt').click()
  await page.waitForTimeout(1500)

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id: 1 }] })
  const proj = (p: Pt) => page.evaluate(({ x, z }) => (window as unknown as Win).__malletProject(x, 0.07, z), p)

  // (a) tap open ground near the unit, on a side that is clear of the HUD panels (the camera is turned to the
  // player's side, so world axes are not screen axes). A spot that is blocked (ruin wall, enemy) clamps the
  // staged move back to the start, so try the clear-looking spots in turn until the draft really moves.
  const candidates = await page.evaluate(({ cx, cz }) => {
    const w = window as unknown as Win
    const target = { x: window.innerWidth * 0.25, y: window.innerHeight * 0.6 }
    const out: { x: number; y: number; d: number }[] = []
    for (let i = 0; i < 24; i++) {
      for (const r of [2, 3, 4]) {
        const p = w.__malletProject(cx + Math.cos((i / 24) * Math.PI * 2) * r, 0.07, cz + Math.sin((i / 24) * Math.PI * 2) * r)
        if (p.x < 40 || p.x > window.innerWidth * 0.5 || p.y < 110 || p.y > window.innerHeight - 100) continue
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
  for (const c of candidates.slice(0, 12)) {
    await touch('touchStart', c.x, c.y)
    await page.waitForTimeout(80)
    await touch('touchEnd')
    await page.waitForTimeout(400)
    staged = await stagedDistance()
    if (staged > 1) break
    if (staged >= 0) await page.getByTestId('touch-cancel').click()
  }
  expect(staged).toBeGreaterThan(1)

  const plan = await page.evaluate(() => {
    const first = (window as unknown as Win).__mallet.useUiStore.getState().draft!.placements[0]
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
  await page.screenshot({ path: 'e2e-out/mobile-pixel-04-touch-move.png' })

  // (d) tap Confirm with a real touch at the button's centre
  const confirm = page.getByTestId('touch-confirm')
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
