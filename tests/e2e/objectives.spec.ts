import { expect, test, type Page } from '@playwright/test'

// Objective markers: flat 40mm token, an area-style control zone whose edge sits at range + marker radius, and a glow on
// the bases of the selected unit's models that are in range. Screenshots land in e2e-out/objectives-*.png.
type Pos = { x: number; y: number; z: number }
type GState = {
  objectives: Record<string, { id: string; pos: { x: number; z: number }; controller: 'A' | 'B' | null }>
  models: Record<string, { pos: Pos; base: { radius: number } }>
  units: Record<string, { models: string[] }>
  mission: { data: { objectiveRange?: number; objectiveMarkerRadius?: number } }
}
type W = {
  __mallet: {
    useGameStore: { getState(): { state: GState }; setState(p: unknown): void }
    useUiStore: { getState(): { selectUnit(id: string | null): void } }
  }
  __malletCamera: { lookAt(x: number, z: number, d: number): void }
}

const RANGE = 3
const MARKER_R = 40 / 25.4 / 2
const ZONE = RANGE + MARKER_R

async function open(page: Page, url: string) {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(url)
  await page.waitForFunction(() => !!(window as unknown as { __malletCamera?: unknown }).__malletCamera, null, { timeout: 30_000 })
}

/** Puts objective `id` at (cx, cz), one A model with its base overlapping the zone edge by 0.05", one just clear of it
 *  by 0.3", the rest well inside; marks the objective controlled by `controller`. Selects the unit. */
async function stage(page: Page, cx: number, cz: number, controller: 'A' | 'B' | null) {
  return page.evaluate(([x, z, ctl, zone]) => {
    const w = window as unknown as W
    const g = w.__mallet.useGameStore.getState()
    const s = g.state
    const oid = Object.keys(s.objectives)[0]
    const unit = s.units['A:warriors']
    const models = { ...s.models }
    const edge = (id: string, ang: number, centreDist: number) => {
      const m = models[id]
      models[id] = { ...m, pos: { x: x + Math.cos(ang) * centreDist, y: 0, z: z + Math.sin(ang) * centreDist } }
      return m.base.radius
    }
    const ids = unit.models
    // centre distance = zone + base radius - overlap  =>  the base's nearest point is `overlap` inside the boundary
    const r0 = models[ids[0]].base.radius
    edge(ids[0], Math.PI * 0.5, (zone as number) + r0 - 0.05)
    const r1 = models[ids[1]].base.radius
    edge(ids[1], Math.PI * 0.75, (zone as number) + r1 + 0.3)
    ids.slice(2).forEach((id, i) => edge(id, Math.PI * (1.1 + i * 0.15), 1.6 + i * 0.4))
    const objectives = { ...s.objectives, [oid]: { ...s.objectives[oid], pos: { x, z }, controller: ctl } }
    g.state && w.__mallet.useGameStore.setState({ state: { ...s, models, objectives } })
    w.__mallet.useUiStore.getState().selectUnit('A:warriors')
    w.__malletCamera.lookAt(x, z + 1, 16)
    return { oid, ids: ids.length }
  }, [cx, cz, controller, ZONE] as const)
}

test('objectives: neutral zone, base overlapping the edge, controlled, wide view', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await open(page, './?scenario=terrain-height&board=1')
  const info = await stage(page, -9, 9, null)
  expect(info.ids).toBeGreaterThan(1)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/objectives-neutral.png' })
  await stage(page, -9, 9, 'A')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e-out/objectives-controlled.png' })
  await page.evaluate(() => (window as unknown as W).__malletCamera.lookAt(0, 0, 55))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/objectives-wide.png' })
  expect(errors).toEqual([])
})

for (const board of [2, 3, 4, 5, 6]) {
  test(`objectives: board ${board} mat`, async ({ page }) => {
    await open(page, `./?scenario=terrain-height&board=${board}`)
    await stage(page, -9, 9, 'B')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `e2e-out/objectives-board${board}.png` })
  })
}
