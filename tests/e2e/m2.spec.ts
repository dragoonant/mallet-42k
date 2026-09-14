import { expect, test, type Page } from '@playwright/test'

// M2 battlefield tools audit: Measure, Line-of-sight view, and the camera toggles, driven through
// the real HUD buttons/keys and a real mouse drag on the canvas. window.__mallet is used only to
// read state (find units/positions, poll deployment progress) and to select a unit for the LoS/
// Measure demo — never to dispatch a game action, exactly like tests/e2e/play.spec.ts's own convention.

const W = 1600
const H = 900
const FOV = 45
const OVERVIEW_POLAR = (55 * Math.PI) / 180
const START_DIST = Math.hypot(28, 23.8) // Scene.tsx's initial camera [0,28,23.8] looking at origin

type V3 = { x: number; y: number; z: number }
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

/** World (inches) -> screen px for CameraRig's initial overview orbit (azimuth 0, camera on +z
 *  side) — only valid before the test touches the top-down/focus toggles. */
function project(p: V3): { x: number; y: number } {
  const pos = { x: 0, y: START_DIST * Math.cos(OVERVIEW_POLAR), z: START_DIST * Math.sin(OVERVIEW_POLAR) }
  const f = norm({ x: -pos.x, y: -pos.y, z: -pos.z })
  const r = norm(cross(f, { x: 0, y: 1, z: 0 }))
  const u = cross(r, f)
  const v = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z }
  const t = Math.tan((FOV * Math.PI) / 360)
  const zc = dot(v, f)
  return { x: ((dot(v, r) / (zc * t * (W / H)) + 1) / 2) * W, y: ((1 - dot(v, u) / (zc * t)) / 2) * H }
}

interface Snap {
  phase: string
  pending: null | { id: string; kind: string; player: string; context: any }
  units: { id: string; name: string; player: string; loc: string; models: V3[] }[]
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const g = (window as any).__mallet.useGameStore.getState()
    const s = g.state
    return {
      phase: s?.phase,
      pending: g.pending ? { id: g.pending.id, kind: g.pending.kind, player: g.pending.player, context: g.pending.context } : null,
      units: s
        ? Object.values(s.units).map((u: any) => ({
            id: u.id,
            name: u.name,
            player: u.player,
            loc: u.location,
            models: u.models.map((m: string) => s.models[m]?.pos).filter(Boolean),
          }))
        : [],
    }
  })
}

async function clickFirstPromptOption(page: Page): Promise<boolean> {
  const opts = page.locator('[data-testid^="prompt-option-"]')
  if ((await opts.count()) > 0) {
    await opts.first().click()
    return true
  }
  const pass = page.getByTestId('btn-pass')
  if (await pass.isVisible().catch(() => false)) {
    await pass.click()
    return true
  }
  return false
}

test('M2 battlefield tools: measure ruler and line-of-sight tints', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('/')
  await page.getByTestId('setup-seed').fill('m2-tools-seed')
  await page.getByTestId('start-game').click()
  await page.waitForSelector('canvas')
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1000)

  // Clear the pre-deployment roll-off prompts, then deploy one human unit for real — same flow as
  // tests/e2e/smoke.spec.ts — so the board has an actual friendly figure to select and measure from.
  const canvas = page.locator('canvas').first()
  const heading = page.locator('[data-testid="prompt"] div').first()
  for (let i = 0; i < 8; i++) {
    const text = await heading.textContent().catch(() => null)
    if (text === 'Deploy your forces') break
    if (!(await clickFirstPromptOption(page))) break
    await page.waitForTimeout(150)
  }

  // Pick a unit to deploy — the deployUnit prompt's own palette of chip buttons, one per
  // deployable unit (src/client/ui/DecisionPrompt.tsx) — before clicking the board, or the board
  // click has no deployTargetUnitId to build a draft against. The click point is derived from the
  // decision's own `context.zone` polygon (world inches, projected to screen px) rather than a
  // fixed screen ratio, since which board edge is "mine" depends on the roll-off.
  const unitButton = page.getByRole('button', { name: /squad|tantus|gordrang|dread|koptas|boyz/i }).first()
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  if (box && (await unitButton.isVisible().catch(() => false))) {
    await unitButton.click()
    await page.waitForTimeout(150)
    const s0 = await snap(page)
    const zone: { x: number; z: number }[] = s0.pending?.context?.zone ?? []
    const cx = zone.length ? zone.reduce((a, p) => a + p.x, 0) / zone.length : 0
    const cz = zone.length ? zone.reduce((a, p) => a + p.z, 0) / zone.length : 10
    const candidates = [
      { x: cx, z: cz },
      { x: cx - 3, z: cz },
      { x: cx + 3, z: cz },
      { x: cx, z: cz - 2 },
      { x: cx, z: cz + 2 },
    ]
    for (const c of candidates) {
      const pt = project({ x: c.x, y: 0, z: c.z })
      await page.mouse.click(pt.x, pt.y)
      await page.waitForTimeout(200)
      const confirm = page.getByTestId('btn-confirm')
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
        await page.waitForTimeout(500)
        break
      }
    }
  }

  // Let the bot's own deployment turns run for a bit so at least one enemy unit is on the board too
  // (nice-to-have for the LoS tint / Measure edge-snap, not required for the test to pass).
  for (let i = 0; i < 20; i++) {
    const s = await snap(page)
    if (s.units.some((u) => u.player !== 'A' && u.loc === 'board' && u.models.length > 0)) break
    await page.waitForTimeout(300)
  }

  const s = await snap(page)
  const mine = s.units.find((u) => u.player === 'A' && u.loc === 'board' && u.models.length > 0)
  expect(mine, 'expected at least one deployed friendly unit').toBeTruthy()

  // Select the unit directly via the store (same selection state the real UnitsLayer click sets) so
  // the LoS/Measure screenshots don't depend on hitting a small figure's screen-space hitbox exactly.
  await page.evaluate((unitId) => (window as any).__mallet.useUiStore.getState().selectUnit(unitId), mine!.id)
  await page.waitForTimeout(100)

  // --- Line-of-sight view (key L / btn-los) ---
  await page.getByTestId('btn-los').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e-out/m2-los.png' })

  await page.getByTestId('btn-los').click() // toggle back off before measuring

  // --- Measure tool (key M / btn-measure): real click-drag on the canvas ---
  await page.getByTestId('btn-measure').click()
  await page.waitForTimeout(150)

  const from = project(mine!.models[0])
  const to = { x: from.x + 220, y: from.y - 80 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.waitForTimeout(150)
  // A couple more small moves + a longer settle: headless WebGL occasionally serves a blank frame to
  // Playwright's screenshot right after a burst of synthetic pointer events — nudging the cursor and
  // giving the render loop a few more frames avoids catching that transient blank frame.
  await page.mouse.move(to.x + 1, to.y + 1, { steps: 2 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e-out/m2-measure.png' })
  await page.mouse.up()

  // Esc clears the ruler.
  await page.keyboard.press('Escape')
  const clearedLine = await page.evaluate(() => (window as any).__mallet.useUiStore.getState().measureLine)
  expect(clearedLine).toBeNull()

  await page.getByTestId('btn-measure').click() // tool back off

  // --- Camera toggle (key T / btn-camera-topdown) + Focus (key F / btn-focus) ---
  const before = await page.evaluate(() => (window as any).__mallet.useUiStore.getState().topDown)
  await page.getByTestId('btn-camera-topdown').click()
  await page.waitForTimeout(100)
  const after = await page.evaluate(() => (window as any).__mallet.useUiStore.getState().topDown)
  expect(after).toBe(!before)
  await page.getByTestId('btn-camera-topdown').click() // back to overview

  await page.getByTestId('btn-focus').click()
  await page.waitForTimeout(300)
  const focusTarget = await page.evaluate(() => (window as any).__mallet.useUiStore.getState().focusTarget)
  expect(focusTarget).not.toBeNull()

  // --- Keys help popover ---
  await page.getByTestId('btn-keys-help').click()
  await expect(page.getByTestId('keys-help')).toBeVisible()
  await page.getByTestId('btn-keys-help').click()
  await expect(page.getByTestId('keys-help')).toBeHidden()
})
