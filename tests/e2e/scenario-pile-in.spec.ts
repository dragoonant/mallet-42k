import { expect, test } from '@playwright/test'

// `?scenario=pile-in` dev hook (src/client/dev/scenarios.ts): opens a game in the human's Fight phase at a Pile in decision.
for (const name of ['pile-in', 'pile-in-mixed']) {
  test(`scenario ${name} opens at a pile-in prompt`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto(`./?scenario=${name}`)
    await expect(page.getByTestId('pile-in-context')).toBeVisible({ timeout: 30_000 })
    const pending = await page.evaluate(() => {
      const g = (window as unknown as { __mallet: { useGameStore: { getState(): { pending: { kind: string; player: string }; state: { phase: string } } } } }).__mallet.useGameStore.getState()
      return { kind: g.pending.kind, player: g.pending.player, phase: g.state.phase }
    })
    expect(pending).toEqual({ kind: 'pileIn', player: 'A', phase: 'fight' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `tests/e2e/screenshots/scenario-${name}.png` })
    expect(errors).toEqual([])
  })
}

type Pt = { x: number; z: number }
interface Win {
  __mallet: {
    useGameStore: { getState(): { state: { models: Record<string, { pos: Pt }>; units: Record<string, { player: string; models: string[] }> } } }
    useUiStore: { getState(): { draft: { placements: { modelId: string; pos: Pt }[] } | null } }
  }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
  __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
}

test('scenario pile-in: a real-mouse drag moves one model and updates the fighter count', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=pile-in')
  await expect(page.getByTestId('pile-in-context')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject && !!(window as unknown as Win).__mallet.useUiStore.getState().draft, null, { timeout: 30_000 })

  // pick the draft model farthest from the enemy and the point 1.5" toward the nearest enemy model
  const plan = await page.evaluate(() => {
    const w = window as unknown as Win
    const gs = w.__mallet.useGameStore.getState().state
    const draft = w.__mallet.useUiStore.getState().draft!
    const mine = new Set(draft.placements.map((p) => p.modelId))
    const enemies = Object.values(gs.units).filter((u) => u.player === 'B').flatMap((u) => u.models.map((id) => gs.models[id].pos))
    let best = { id: '', d: -1, to: { x: 0, z: 0 }, from: { x: 0, z: 0 } }
    for (const p of draft.placements) {
      if (!mine.has(p.modelId)) continue
      let nd = Infinity
      let ne = enemies[0]
      for (const e of enemies) {
        const d = Math.hypot(e.x - p.pos.x, e.z - p.pos.z)
        if (d < nd) { nd = d; ne = e }
      }
      if (nd > best.d) {
        const ux = (ne.x - p.pos.x) / nd
        const uz = (ne.z - p.pos.z) / nd
        best = { id: p.modelId, d: nd, from: { x: p.pos.x, z: p.pos.z }, to: { x: p.pos.x + ux * 1.5, z: p.pos.z + uz * 1.5 } }
      }
    }
    const cx = draft.placements.reduce((a, p) => a + p.pos.x, 0) / draft.placements.length
    const cz = draft.placements.reduce((a, p) => a + p.pos.z, 0) / draft.placements.length
    w.__malletCamera.lookAt(cx, cz, 22)
    return { ...best, cx, cz }
  })
  await page.waitForTimeout(1200)
  const fightersText = async () => (await page.getByTestId('pile-in-fighters').textContent()) ?? ''
  const before = await fightersText()
  await page.screenshot({ path: 'tests/e2e/screenshots/pile-in-drag-before.png' })

  const proj = (p: Pt) => page.evaluate(({ x, z }) => (window as unknown as Win).__malletProject(x, 0.07, z), p)
  const a = await proj(plan.from)
  const b = await proj(plan.to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 15 })
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'tests/e2e/screenshots/pile-in-drag-during.png' })
  await page.mouse.up()
  await page.waitForTimeout(500)

  const after = await page.evaluate((id) => {
    const p = (window as unknown as Win).__mallet.useUiStore.getState().draft!.placements.find((q) => q.modelId === id)!
    return { x: p.pos.x, z: p.pos.z }
  }, plan.id)
  const moved = Math.hypot(after.x - plan.from.x, after.z - plan.from.z)
  expect(moved).toBeGreaterThan(1.0)
  expect(moved).toBeLessThan(2.0)
  const afterText = await fightersText()
  await page.screenshot({ path: 'tests/e2e/screenshots/pile-in-drag-after.png' })
  console.log(`pile-in drag: moved ${moved.toFixed(2)}" | ${before} -> ${afterText}`)
  expect(afterText).toMatch(/\d+ of \d+ models will be able to fight/)
  expect(errors).toEqual([])
})
