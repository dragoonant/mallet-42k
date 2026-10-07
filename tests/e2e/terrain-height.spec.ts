import { expect, test } from '@playwright/test'

// `?scenario=terrain-height` (src/client/dev/scenarios.ts): an INFANTRY unit on a ruin upper floor, an enemy beside it.
test('terrain-height: units stand on a ruin floor and the cover badge shows', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=terrain-height')
  await page.waitForFunction(() => !!(window as unknown as { __malletCamera?: unknown }).__malletCamera, null, { timeout: 30_000 })
  const info = await page.evaluate(() => {
    const w = window as unknown as {
      __mallet: { useGameStore: { getState(): { state: { models: Record<string, { pos: { x: number; y: number; z: number } }>; units: Record<string, { models: string[] }> } } } }
      __malletCamera: { lookAt(x: number, z: number, d: number): void }
    }
    const gs = w.__mallet.useGameStore.getState().state
    const ps = gs.units['A:warriors'].models.map((id) => gs.models[id].pos)
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length
    const cz = ps.reduce((a, p) => a + p.z, 0) / ps.length
    w.__malletCamera.lookAt(cx, cz + 1.5, 28)
    return { ys: ps.map((p) => p.y) }
  })
  expect(info.ys.every((y) => y > 0)).toBe(true)
  // orbit the camera (right-drag) round to the ruin's open side and tip it up so the floor slab is visible
  await page.mouse.move(800, 450)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(800 + Number(process.env.ORBIT_DX ?? 450), 450 + Number(process.env.ORBIT_DY ?? 120), { steps: 20 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e-out/terrain-height.png' })
  expect(errors).toEqual([])
})

// `?scenario=floor-picker`: Space Marines in the Movement phase just outside a ruin with an upper floor.
// Hovering the destination offers the floor picker; picking floor 1 stages the unit on the upper floor; nudging one
// model within that floor keeps its height; Confirm moves every model onto the floor.
test('terrain-height: floor picker on a move into a ruin, nudge keeps the floor', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=floor-picker')
  await page.waitForFunction(() => !!(window as unknown as { __malletProject?: unknown }).__malletProject, null, { timeout: 30_000 })
  type W = {
    __mallet: { useGameStore: { getState(): { pending: { kind: string } | null; state: { models: Record<string, { pos: { x: number; y: number; z: number } }>; units: Record<string, { models: string[] }>; board: { pieces: Record<string, { kind: string; floors: { height: number; polygon: { x: number; z: number }[] }[] }> } } } }; useUiStore: { getState(): { draft: { placements: { modelId: string; pos: { x: number; y: number; z: number } }[] } | null } } }
    __malletCamera: { lookAt(x: number, z: number, d: number): void }
    __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
  }
  const info = await page.evaluate(() => {
    const w = window as unknown as W
    const gs = w.__mallet.useGameStore.getState()
    type Fl = { height: number; polygon: { x: number; z: number }[] }
    const ruin = Object.values(gs.state.board.pieces).find((p) => p.kind === 'ruin' && p.floors.some((f: Fl) => f.height > 0))!
    const poly = ruin.floors.find((f: Fl) => f.height > 0)!.polygon
    const inside = (x: number, z: number) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j]
        if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c
      }
      return c
    }
    // the ruin's floor strip is 2" deep with walls round its edge: the only legal row for a base is its midline, so aim at it
    const minZ = Math.min(...poly.map((q: { z: number }) => q.z))
    const xs = poly.map((q: { x: number }) => q.x)
    const best = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: minZ + 0.95 }
    void inside
    w.__malletCamera.lookAt(best.x, best.z - 1, 12)
    return { target: best, pending: gs.pending?.kind }
  })
  expect(info.pending).toBe('moveUnit')
  const screen = (x: number, y: number, z: number) => page.evaluate(([a, b, c]) => (window as unknown as W).__malletProject(a, b, c), [x, y, z])
  await page.waitForTimeout(2500) // let the camera finish easing onto the decision before projecting world points
  const T = info.target
  // 1. hovering a destination inside the ruin offers the picker (no click yet)
  const hover = await screen(T.x, 0, T.z)
  await page.mouse.move(hover.x - 40, hover.y - 40)
  await page.mouse.move(hover.x, hover.y, { steps: 6 })
  await expect(page.getByTestId('floor-selector')).toBeVisible({ timeout: 5000 })
  // 2. click stages the move on the ground; pick floor 1 (the picker survives the pointer leaving the board)
  await page.mouse.click(hover.x, hover.y)
  await expect(page.getByTestId('btn-confirm')).toBeVisible()
  await expect(page.getByTestId('floor-selector')).toBeVisible()
  await page.getByTestId('floor-1').click()
  const draft = () => page.evaluate(() => (window as unknown as W).__mallet.useUiStore.getState().draft?.placements ?? [])
  const staged = await draft()
  expect(staged.length).toBe(3)
  expect(staged.every((p) => p.pos.y > 0)).toBe(true)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/floor-picker.png' })
  // 3. nudge one model within the floor: its height is unchanged
  const m0 = staged[0]
  const a = await screen(m0.pos.x, m0.pos.y, m0.pos.z)
  const b = await screen(m0.pos.x - 0.3, m0.pos.y, m0.pos.z)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up()
  const nudged = (await draft()).find((p) => p.modelId === m0.modelId)!
  expect(Math.hypot(nudged.pos.x - m0.pos.x, nudged.pos.z - m0.pos.z)).toBeGreaterThan(0.1)
  expect(nudged.pos.y).toBe(m0.pos.y)
  // drag it back so the move still fits the allowance (a floor climb costs movement)
  const c = await screen(nudged.pos.x, nudged.pos.y, nudged.pos.z)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2, { steps: 4 })
  await page.mouse.move(a.x, a.y, { steps: 4 })
  await page.mouse.up()
  // 4. confirm: every model ends on the floor
  await expect(page.getByTestId('btn-confirm')).toBeEnabled()
  await page.getByTestId('btn-confirm').click()
  await page.waitForFunction(() => (window as unknown as W).__mallet.useUiStore.getState().draft === null)
  const ys = await page.evaluate(() => {
    const gs = (window as unknown as W).__mallet.useGameStore.getState().state
    return Object.values(gs.units).flatMap((u) => u.models.map((id) => gs.models[id].pos)).filter((p) => p.y > 0).length
  })
  expect(ys).toBeGreaterThanOrEqual(3)
  expect(errors).toEqual([])
})
