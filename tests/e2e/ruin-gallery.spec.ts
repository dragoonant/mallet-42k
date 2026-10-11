import { test } from '@playwright/test'

// Screenshots of the ruin GLB variants. Piece ids drive the variant pick (ruin-fit idVariant), so the
// spec renames the board's ruins in the store to cycle through every model without touching rules data.
type W = {
  __mallet: { useGameStore: { getState(): { state: { board: { pieces: Record<string, { id: string; kind: string }> } } }; setState(p: unknown): void } }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
}

/** Waits until the ruin GLBs have been requested and have gone quiet (no new .glb response for 2s). */
async function ruinsLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('.glb')), null, { timeout: 30_000 })
  await page.waitForFunction(
    () => {
      const glb = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.name.includes('.glb'))
      const last = Math.max(...glb.map((e) => e.responseEnd))
      return glb.every((e) => e.responseEnd > 0) && performance.now() - last > 2000
    },
    null,
    { timeout: 30_000, polling: 250 },
  )
}

async function open(page: import('@playwright/test').Page, url: string) {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(url)
  await page.waitForFunction(() => !!(window as unknown as { __malletCamera?: unknown }).__malletCamera, null, { timeout: 30_000 })
}

/** Renames ruin pieces: L ruins get `lSuffix`, rectangles `rSuffix` (digits pick the variant). */
async function renameRuins(page: import('@playwright/test').Page, lN: number, rN: number) {
  await page.evaluate(([l, r]) => {
    const w = window as unknown as W
    const g = w.__mallet.useGameStore.getState()
    const pieces: Record<string, { id: string; kind: string }> = {}
    let li = 0, ri = 0
    for (const p of Object.values(g.state.board.pieces)) {
      if (p.kind !== 'ruin') { pieces[p.id] = p; continue }
      const isL = (p as unknown as { footprint: unknown[] }).footprint.length === 6
      const id = isL ? `ruin-l${l + li++}` : `ruin-s${r + ri++}`
      pieces[id] = { ...p, id }
    }
    w.__mallet.useGameStore.setState({ state: { ...g.state, board: { ...g.state.board, pieces } } })
  }, [lN, rN])
  await ruinsLoaded(page)
  await page.waitForTimeout(1500)
}

async function orbit(page: import('@playwright/test').Page, dx: number, dy: number) {
  await page.mouse.move(800, 450)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(800 + dx, 450 + dy, { steps: 20 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(1200)
}

const look = (page: import('@playwright/test').Page, x: number, z: number, d: number) =>
  page.evaluate(([a, b, c]) => (window as unknown as W).__malletCamera.lookAt(a, b, c), [x, z, d])

test('ruin gallery: default ids, wide view', async ({ page }) => {
  await open(page, './?scenario=terrain-height&board=1')
  await ruinsLoaded(page)
  await look(page, 0, 0, 55)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/ruin-gallery-1.png' })
})

test('ruin gallery: L ruins close, other variants, another board', async ({ page }) => {
  await open(page, './?scenario=terrain-height&board=3')
  await renameRuins(page, 3, 3)
  await look(page, -5, 3, 22)
  await page.waitForTimeout(2500)
  await orbit(page, 250, 60)
  await page.screenshot({ path: 'e2e-out/ruin-gallery-2.png' })
  await look(page, 5, -3, 22)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/ruin-gallery-3.png' })
})

async function hideUi(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.contains(cv) || cv?.contains(el) || el instanceof SVGElement) continue
      const pos = getComputedStyle(el).position
      if (pos === 'fixed' || pos === 'absolute') el.style.display = 'none'
    }
  })
}

// Debug sheet: cycles variants 0..5 for the L and rect slots, close-up of each (set RUIN_GALLERY_ALL=1).
test('ruin gallery: every variant (opt-in)', async ({ page }) => {
  test.skip(!process.env.RUIN_GALLERY_ALL, 'opt-in')
  test.setTimeout(240_000)
  await open(page, './?scenario=terrain-height&board=2')
  await hideUi(page)
  for (let v = 0; v < 6; v++) {
    await renameRuins(page, v, v)
    await look(page, -5, 3, 20)
    await page.waitForTimeout(2500)
    await orbit(page, 120, 40)
    await page.screenshot({ path: `e2e-out/ruin-gallery-L${v}.png` })
    await look(page, -16, -12, 16)
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `e2e-out/ruin-gallery-R${v}.png` })
    await look(page, -5, 3, 20)
    await orbit(page, -120, -40) // undo the orbit
  }
})

// Debug: top-down views of both L ruins per variant pair, to check wall alignment with the footprint.
test('ruin gallery: L corners top-down (opt-in)', async ({ page }) => {
  test.skip(!process.env.RUIN_GALLERY_ALL, 'opt-in')
  test.setTimeout(120_000)
  await open(page, './?scenario=terrain-height&board=2')
  await hideUi(page)
  await look(page, 0, 0, 30)
  await orbit(page, 0, 400)
  for (const v of [0, 2, 4]) {
    await renameRuins(page, v, 0)
    await page.screenshot({ path: `e2e-out/ruin-gallery-top${v}.png` })
  }
})
