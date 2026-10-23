import { expect, test } from '@playwright/test'

// Each mouse move re-renders the 3D scene, which is slow on software WebGL: give these specs room.
test.setTimeout(120_000)

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
  await page.mouse.move(800 + Number(process.env.ORBIT_DX ?? 450), 450 + Number(process.env.ORBIT_DY ?? 120), { steps: 6 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e-out/terrain-height.png' })
  expect(errors).toEqual([])
})

// `?scenario=floor-climb` (floor-picker laid out for the WTC ruins): Space Marines in the Movement phase just outside a ruin with an upper floor.
// Hovering the destination offers the floor picker; picking floor 1 stages the unit on the upper floor; nudging one
// model within that floor keeps its height; Confirm moves every model onto the floor.
test('terrain-height: floor picker on a move into a ruin, nudge keeps the floor', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('./?scenario=floor-climb')
  await page.waitForFunction(() => !!(window as unknown as { __malletProject?: unknown }).__malletProject, null, { timeout: 30_000 })
  type W = {
    __mallet: { useGameStore: { getState(): { pending: { kind: string } | null; state: { models: Record<string, { pos: { x: number; y: number; z: number } }>; units: Record<string, { models: string[] }>; board: { pieces: Record<string, { kind: string; floors: { height: number; polygon: { x: number; z: number }[] }[] }> } } } }; useUiStore: { getState(): { draft: { placements: { modelId: string; pos: { x: number; y: number; z: number } }[] } | null } } }
    __malletCamera: { lookAt(x: number, z: number, d: number): void }
    __malletProject: (x: number, y: number, z: number) => { x: number; y: number }
  }
  // the scenario (src/client/dev/scenarios.ts floorClimb) lays three models in a row on open ground and records the
  // centre of a spot on a ruin's upper floor where a row of the same shape fits: that is where we move them
  const info = await page.evaluate(() => {
    const w = window as unknown as W & { __malletScenario: { floorTarget: { x: number; z: number } } }
    const gs = w.__mallet.useGameStore.getState()
    const best = w.__malletScenario.floorTarget
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
  // nudge 0.3" straight away from the middle of the row (still on the floor: the scenario's row has more slack than that)
  const mid = staged.reduce((acc, p) => ({ x: acc.x + p.pos.x / staged.length, z: acc.z + p.pos.z / staged.length }), { x: 0, z: 0 })
  const away = Math.hypot(m0.pos.x - mid.x, m0.pos.z - mid.z) || 1
  const b = await screen(m0.pos.x + (0.3 * (m0.pos.x - mid.x)) / away, m0.pos.y, m0.pos.z + (0.3 * (m0.pos.z - mid.z)) / away)
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

// Close, angled photo of a three-storey WTC ruin with three models standing on its upper floor (the floor arms are
// 2.25" wide so a base fits: docs/spec/11-combat-patrol.md CP-3.5): e2e-out/wtc-ruin-floor.png.
test('terrain-height: close angled photo of a model on a three-storey ruin floor', async ({ page }) => {
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
    const c = { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length }
    w.__malletCamera.lookAt(c.x, c.z, 16)
    return { ys: ps.map((p) => p.y) }
  })
  expect(info.ys.every((y) => y === 3)).toBe(true) // the first ruin offered is a three-storey one: floor at 3"
  // right-drag: swing round to the open side and drop the camera to a low angle
  await page.mouse.move(800, 450)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(800 + Number(process.env.ORBIT_DX ?? 330), 450 + Number(process.env.ORBIT_DY ?? -50), { steps: 6 })
  await page.mouse.up({ button: 'right' })
  // the bot starts its turn while we set the shot up: dismiss the phase announcement banner (it sits mid-screen, over the
  // ruin) and tuck its Fire Overwatch prompt away (the panel's own "–" button) so the ruin stays in clear view
  const banner = page.getByTestId('phase-banner')
  const minimise = page.getByTestId('btn-prompt-minimize')
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1500)
    if (await banner.isVisible().catch(() => false)) await banner.click({ timeout: 5000 }).catch(() => {})
    if (await minimise.isVisible().catch(() => false)) await minimise.click({ timeout: 5000 }).catch(() => {})
  }
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/wtc-ruin-floor.png' })
  expect(errors).toEqual([])
})
