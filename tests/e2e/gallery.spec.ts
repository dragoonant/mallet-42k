import { expect, test, type Page } from '@playwright/test'

// M3 figure gallery (?gallery) screenshots — visual QA for the procedural SD figure kit
// (src/client/figures), which the rest of the app never renders standalone. Not a rules test
// (see tests/engine for those); this only confirms the kit looks right and is reachable.

async function settle(page: Page) {
  await page.waitForSelector('canvas')
  // The gallery's labels (drei <Text>) generate SDF glyphs from a loaded font on first use, which
  // is slow enough under headless WebGL that a short wait leaves the canvas still blank/white —
  // confirmed by hand: ~3s was reliably enough, 700ms was not.
  await page.waitForTimeout(3000)
}

test('gallery shows every archetype in a row', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/?gallery')
  await settle(page)
  await page.screenshot({ path: 'e2e-out/10-gallery.png' })
})

test('gallery filtered to Space Marines', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/?gallery&faction=sm')
  await settle(page)
  await page.screenshot({ path: 'e2e-out/11-marines.png' })
})

test('gallery filtered to Orks', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/?gallery&faction=ork')
  await settle(page)
  await page.screenshot({ path: 'e2e-out/12-orks.png' })
})

test('board close-up over a group of deployed models', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await page.getByTestId('setup-seed').fill('gallery-closeup-seed')
  await page.getByTestId('start-game').click()
  await settle(page)
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 15000 })

  // Drive deployment directly through the client store's own `legal` actions (the same candidates
  // the bot picks from — src/ai/random.ts) instead of simulating board clicks: far faster and not
  // sensitive to layout. Runs until the deployment decisions are gone (phase moved on, or the
  // window closed) or a time budget is hit.
  await page.waitForFunction(() => !!(window as unknown as { __mallet?: unknown }).__mallet, null, { timeout: 15000 })
  const deployed = await page.evaluate(async () => {
    interface Piece { footprint: { x: number; z: number }[] }
    interface ModelState { pos: { x: number; y: number; z: number } }
    interface UnitState { location: string; models: string[] }
    const w = window as unknown as {
      __mallet: {
        useGameStore: {
          getState(): {
            state: { phase: string; models: Record<string, ModelState>; units: Record<string, UnitState>; board: { pieces: Record<string, Piece> } } | null
            pending: { kind: string; player: string } | null
            legal: { type: string; toReserves?: boolean }[] | null
            botSeat: string | null
            dispatch(action: unknown): void
          }
        }
      }
    }
    const store = w.__mallet.useGameStore
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const s = store.getState()
      if (!s.state || !s.pending) break
      // Pre-deployment roll-offs run in the 'setup' phase (sides/first-turn choices); once past
      // 'deployment' we're into a normal turn (command/movement/…) and deployment is done.
      if (s.state.phase !== 'setup' && s.state.phase !== 'deployment') break
      if (s.pending.player === s.botSeat) {
        await new Promise((r) => setTimeout(r, 100))
        continue
      }
      const legal = s.legal ?? []
      const action = legal.find((a) => a.type === 'deployUnit' && !a.toReserves) ?? legal[0]
      if (!action) {
        await new Promise((r) => setTimeout(r, 100))
        continue
      }
      s.dispatch(action)
      await new Promise((r) => setTimeout(r, 60))
    }

    // Give the bot a moment to finish its own deployment before reading positions.
    await new Promise((r) => setTimeout(r, 800))

    const s = store.getState()
    const state = s.state
    if (!state) return null

    // Terrain pieces (ruins, craters, barricades…) can be several inches tall — a naive centroid
    // can land the close-up camera inside/right against one, filling the frame with its underside
    // instead of the models. Build a generous (2" margin) bounding box per piece and only consider
    // whole-unit clusters whose centroid clears every one of them.
    const margin = 4
    const terrainBoxes = Object.values(state.board.pieces).map((p) => {
      const xs = p.footprint.map((pt) => pt.x)
      const zs = p.footprint.map((pt) => pt.z)
      return { minX: Math.min(...xs) - margin, maxX: Math.max(...xs) + margin, minZ: Math.min(...zs) - margin, maxZ: Math.max(...zs) + margin }
    })
    const clearOfTerrain = (x: number, z: number) => !terrainBoxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)

    const candidates = Object.values(state.units)
      .filter((u) => u.location === 'board' && u.models.length >= 3)
      .map((u) => {
        const pts = u.models.map((id) => state.models[id]).filter((m): m is ModelState => !!m).map((m) => m.pos)
        const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
        const cz = pts.reduce((sum, p) => sum + p.z, 0) / pts.length
        return { count: pts.length, cx, cz, clear: clearOfTerrain(cx, cz) }
      })
      .filter((c) => c.clear)
      .sort((a, b) => b.count - a.count) // prefer the biggest visible group

    if (candidates.length === 0) return null
    const best = candidates[0]
    return { x: best.cx, z: best.cz, count: best.count }
  })

  expect(deployed, 'expected at least one deployed model to frame the close-up on').not.toBeNull()

  // Toggle the board's top-down camera mode and re-point it ~8 inches above the deployed group
  // (src/client/board/CameraRig.tsx's window.__malletCamera hook) instead of simulating a
  // right-drag pan + scroll-wheel zoom.
  await page.evaluate((pos) => {
    const w = window as unknown as {
      __mallet: { useUiStore: { getState(): { topDown: boolean; toggleTopDown(): void } } }
      __malletCamera?: { lookAt(x: number, z: number, distanceIn: number): void }
    }
    if (!w.__mallet.useUiStore.getState().topDown) w.__mallet.useUiStore.getState().toggleTopDown()
    w.__malletCamera?.lookAt(pos!.x, pos!.z, 8)
  }, deployed)

  await page.waitForTimeout(1200) // let the top-down polar-angle lerp (CameraRig) settle
  await page.screenshot({ path: 'e2e-out/13-board-closeup.png' })
})
