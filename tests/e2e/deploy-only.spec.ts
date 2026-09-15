import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Fast iteration harness for the deployment step only (see play.spec.ts for the full playtest, which
// this deliberately does not run — that one takes ~14 minutes). Starts a game as Space Marines vs Bot,
// deploys every human unit through the real UI (board clicks, same as play.spec.ts's own deployment
// loop), and asserts the game reaches the Command phase with every unit off the deploy palette.
//
// Also verifies the M9 deploy-panel-dock fix directly: at both 1600x900 and 1280x720, the centre of
// each side's deployment-zone strip (projected the same way play.spec.ts does) must resolve to the
// <canvas> element, not a HUD panel — i.e. the panel never sits on top of the zone a player needs to
// click into.

const FOV = 45
const OVERVIEW_POLAR = (55 * Math.PI) / 180
const START_DIST = Math.hypot(28, 23.8) // Scene.tsx camera [0,28,23.8] looking at origin

type V2 = { x: number; z: number }
interface Cam { tx: number; tz: number; d: number; polar: number }

function project(p: { x: number; y: number; z: number }, W: number, H: number, cam: Cam): { x: number; y: number } {
  const pos = { x: cam.tx, y: cam.d * Math.cos(cam.polar), z: cam.tz + cam.d * Math.sin(cam.polar) }
  const f = norm({ x: cam.tx - pos.x, y: -pos.y, z: cam.tz - pos.z })
  const r = norm(cross(f, { x: 0, y: 1, z: 0 }))
  const u = cross(r, f)
  const v = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z }
  const xc = dot(v, r)
  const yc = dot(v, u)
  const zc = dot(v, f)
  const t = Math.tan((FOV * Math.PI) / 360)
  const ndcX = xc / (zc * t * (W / H))
  const ndcY = yc / (zc * t)
  return { x: ((ndcX + 1) / 2) * W, y: ((1 - ndcY) / 2) * H }
}
type V3 = { x: number; y: number; z: number }
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

interface Snap {
  phase: string
  round: number
  active: string
  botSeat: string | null
  result: unknown
  toast: string | null
  pending: null | { id: string; kind: string; player: string; context: any }
  units: { id: string; name: string; player: string; loc: string }[]
  pieces: { footprint: V2[] }[]
  zones: { A: V2[]; B: V2[] } | null
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const g = (window as any).__mallet.useGameStore.getState()
    const s = g.state
    return {
      phase: s?.phase,
      round: s?.round,
      active: s?.activePlayer,
      botSeat: g.botSeat,
      result: s?.result ?? null,
      toast: g.toast?.text ?? null,
      pending: g.pending ? { id: g.pending.id, kind: g.pending.kind, player: g.pending.player, context: g.pending.context } : null,
      units: s ? Object.values(s.units).map((u: any) => ({ id: u.id, name: u.name, player: u.player, loc: u.location })) : [],
      pieces: s ? Object.values(s.board.pieces).map((p: any) => ({ footprint: p.footprint })) : [],
      zones: s?.mission?.data?.deploymentZones ?? null,
    }
  })
}

const BOARD_HALF_X_IN = 22
const BOARD_HALF_Z_IN = 15
const DEPLOY_EDGE_MARGIN_IN = 0.75

function clearAnchorX(zone: V2[], pieces: { footprint: V2[] }[], zoneMinX: number, zoneMaxX: number): number {
  const zs = zone.map((p) => p.z)
  const zMin = Math.min(...zs)
  const zMax = Math.max(...zs)
  const margin = 0.5
  const blocked: [number, number][] = []
  for (const piece of pieces) {
    const pxs = piece.footprint.map((p) => p.x)
    const pzs = piece.footprint.map((p) => p.z)
    const pMinZ = Math.min(...pzs)
    const pMaxZ = Math.max(...pzs)
    if (pMaxZ < zMin || pMinZ > zMax) continue
    blocked.push([Math.min(...pxs) - margin, Math.max(...pxs) + margin])
  }
  blocked.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const b of blocked) {
    const last = merged[merged.length - 1]
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1])
    else merged.push([b[0], b[1]])
  }
  const gaps: [number, number][] = []
  let cursor = zoneMinX
  for (const [s, e] of merged) {
    if (s > cursor) gaps.push([cursor, Math.min(s, zoneMaxX)])
    cursor = Math.max(cursor, e)
  }
  if (cursor < zoneMaxX) gaps.push([cursor, zoneMaxX])
  let best: [number, number] = [zoneMinX, zoneMaxX]
  for (const g of gaps) if (g[1] - g[0] > best[1] - best[0]) best = g
  return (best[0] + best[1]) / 2
}

function deployZoneCandidates(zone: V2[], pieces: { footprint: V2[] }[], jitterIndex: number, cam: Cam, W: number, H: number): V2[] {
  const xs = zone.map((p) => p.x)
  const zs = zone.map((p) => p.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const xLoRaw = Math.max(minX + DEPLOY_EDGE_MARGIN_IN, -BOARD_HALF_X_IN + DEPLOY_EDGE_MARGIN_IN)
  const xHiRaw = Math.min(maxX - DEPLOY_EDGE_MARGIN_IN, BOARD_HALF_X_IN - DEPLOY_EDGE_MARGIN_IN)
  const zLoRaw = Math.max(minZ + DEPLOY_EDGE_MARGIN_IN, -BOARD_HALF_Z_IN + DEPLOY_EDGE_MARGIN_IN)
  const zHiRaw = Math.min(maxZ - DEPLOY_EDGE_MARGIN_IN, BOARD_HALF_Z_IN - DEPLOY_EDGE_MARGIN_IN)
  const midX = Math.min(Math.max((minX + maxX) / 2, -BOARD_HALF_X_IN), BOARD_HALF_X_IN)
  const midZ = Math.min(Math.max((minZ + maxZ) / 2, -BOARD_HALF_Z_IN), BOARD_HALF_Z_IN)
  const xLo = xLoRaw <= xHiRaw ? xLoRaw : midX
  const xHi = xLoRaw <= xHiRaw ? xHiRaw : midX
  const zLo = zLoRaw <= zHiRaw ? zLoRaw : midZ
  const zHi = zLoRaw <= zHiRaw ? zHiRaw : midZ
  const w = xHi - xLo
  const d = zHi - zLo
  const clearX = Math.min(Math.max(clearAnchorX(zone, pieces, xLo, xHi), xLo), xHi)
  const jitter = jitterIndex === 0 || w <= 0.5 ? 0 : ((jitterIndex * 1.7) % (w * 0.15)) - w * 0.075
  // Trimmed down from play.spec.ts's own 7x9 grid: the clamp fix under test (clampAnchorToZone's
  // shift/rotate/reshape fallback) is meant to make nearly any in-zone anchor confirmable, so this
  // only needs enough spread to find *a* point the panel dock doesn't cover, not an exhaustive search.
  const xFracs = [0.5, 0.3, 0.7]
  const zFracs = [0.5, 0.2, 0.8]
  const pts: V2[] = [{ x: clearX + jitter, z: zLo + d * 0.5 }]
  for (const zf of zFracs) for (const xf of xFracs) pts.push({ x: xLo + w * xf + jitter, z: zLo + d * zf })
  const inBounds = pts.filter((p) => p.x >= xLo - 1e-6 && p.x <= xHi + 1e-6 && p.z >= zLo - 1e-6 && p.z <= zHi + 1e-6)
  return inBounds
    .map((p) => ({ p, y: project({ x: p.x, y: 0, z: p.z }, W, H, cam).y }))
    .sort((a, b) => a.y - b.y)
    .map(({ p }) => p)
}

async function clearToast(page: Page) {
  await page.evaluate(() => (window as any).__mallet.useGameStore.getState().clearToast())
}

async function clickCanvasAt(page: Page, pt: { x: number; y: number }, W: number, H: number): Promise<boolean> {
  if (pt.x < 2 || pt.y < 2 || pt.x > W - 2 || pt.y > H - 2) return false
  const tag = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, [pt.x, pt.y])
  if (tag !== 'CANVAS') return false
  await page.mouse.click(pt.x, pt.y)
  return true
}

async function waitChange(page: Page, id: string, ms = 1500): Promise<Snap> {
  const end = Date.now() + ms
  let s = await snap(page)
  while (Date.now() < end && s.pending?.id === id && !s.toast) {
    await page.waitForTimeout(80)
    s = await snap(page)
  }
  return s
}

async function resetOpenDraft(page: Page) {
  const cancel = page.getByTestId('btn-cancel')
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {})
}

const log: string[] = []
const note = (s: string) => {
  log.push(s)
  console.log(`[deploy-only] ${s}`)
}

async function tryBoardPlacement(page: Page, s: Snap, points: V2[], cam: Cam, W: number, H: number, label: string): Promise<boolean> {
  const id = s.pending!.id
  let offCanvas = 0
  let noConfirm = 0
  let disabled = 0
  for (const p of points) {
    await clearToast(page)
    await resetOpenDraft(page)
    const ok = await clickCanvasAt(page, project({ x: p.x, y: 0, z: p.z }, W, H, cam), W, H)
    if (!ok) {
      offCanvas++
      continue
    }
    await page.waitForTimeout(100)
    const confirm = page.getByTestId('btn-confirm')
    if (!(await confirm.isVisible().catch(() => false))) {
      noConfirm++
      continue
    }
    if (!(await confirm.isEnabled().catch(() => false))) {
      disabled++
      continue
    }
    await confirm.click()
    const after = await waitChange(page, id)
    if (after.pending?.id !== id) {
      note(`${label}: placed after ${offCanvas} off-canvas, ${noConfirm} no-confirm, ${disabled} disabled`)
      return true
    }
  }
  await resetOpenDraft(page)
  await clearToast(page)
  note(`${label}: FAILED — ${offCanvas} off-canvas, ${noConfirm} no-confirm-button, ${disabled} confirm-disabled (of ${points.length})`)
  return false
}

/** Deploys every one of the human seat's own units through real board clicks; returns once the pending
 *  decision is no longer a deployUnit for our own seat (either everything's placed, or the engine has
 *  moved on to the enemy's picks / first-turn roll-off / Scouts). */
async function deployAllHuman(page: Page, cam: Cam, W: number, H: number, humanSeat: string): Promise<void> {
  for (let guard = 0; guard < 20; guard++) {
    const s = await snap(page)
    if (!s.pending || s.pending.kind !== 'deployUnit' || s.pending.player !== humanSeat) return
    const uid: string = s.pending.context.unitIds[0]
    const name = s.units.find((u) => u.id === uid)?.name ?? uid
    const chip = page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
    if (!(await chip.isVisible().catch(() => false))) {
      note(`${name}: unit chip not visible/clickable — stopping human deployment`)
      return
    }
    await chip.click()
    const zone: V2[] = s.pending.context.zone
    const taken = s.units.filter((u) => u.player === humanSeat && u.loc === 'board').length
    const points = deployZoneCandidates(zone, s.pieces, taken, cam, W, H)
    note(`${name}: trying ${points.length} candidates`)
    const placed = await tryBoardPlacement(page, s, points, cam, W, H, name)
    if (!placed) {
      // last resort so the loop can't spin forever: hold in reserve if legal
      const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
      if (await res.isVisible().catch(() => false)) await res.click()
      else throw new Error(`could not deploy ${name} through the UI (every candidate click was blocked or invalid)`)
    }
    await page.waitForTimeout(100)
  }
  throw new Error('deployAllHuman: guard limit reached without finishing deployment')
}

async function runDeployOnly(page: Page, W: number, H: number, screenshotPath: string) {
  test.setTimeout(300_000)
  try {
    await runDeployOnlyBody(page, W, H, screenshotPath)
  } finally {
    console.log(`[deploy-only] log so far (${W}x${H}):\n${log.join('\n')}`)
  }
}

async function runDeployOnlyBody(page: Page, W: number, H: number, screenshotPath: string) {
  await page.setViewportSize({ width: W, height: H })
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByRole('button', { name: 'Space Marines' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('deploy-only-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(2500) // camera polar lerp + first frames

  const cam: Cam = { tx: 0, tz: 0, d: START_DIST, polar: OVERVIEW_POLAR }

  // The fix under test: neither side's deployment-zone strip should be covered by a HUD panel. Check
  // this right away, before any unit is placed, using the mission's own zone polygons (both sides).
  const s0 = await snap(page)
  expect(s0.zones, 'mission exposes deploymentZones').toBeTruthy()
  const humanSeat = s0.pending?.player ?? 'A'
  for (const [label, zone] of Object.entries(s0.zones!) as [string, V2[]][]) {
    const xs = zone.map((p) => p.x)
    const zs = zone.map((p) => p.z)
    const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
    const pt = project({ x: centre.x, y: 0, z: centre.z }, W, H, cam)
    const tag = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, [pt.x, pt.y])
    expect(tag, `zone ${label} centre (${Math.round(pt.x)},${Math.round(pt.y)}) at ${W}x${H} must be the canvas, not a HUD panel`).toBe('CANVAS')
  }

  // Deploy every one of our own units, alternating with the bot as the engine schedules it.
  for (let guard = 0; guard < 40; guard++) {
    const s = await snap(page)
    if (s.phase !== 'setup' && s.phase !== 'deployment') break
    if (s.pending?.kind === 'deployUnit' && s.pending.player === humanSeat) {
      await deployAllHuman(page, cam, W, H, humanSeat)
    } else {
      await page.waitForTimeout(200)
    }
  }

  // Drain any remaining setup decisions (first-turn roll-off / Scouts) that need a click to proceed —
  // mirror play.spec.ts's generic "click the first option, else pass" fallback. Stops the instant the
  // game leaves setup/deployment (i.e. as soon as the Command phase is reached) rather than driving
  // any further — this spec only needs to prove deployment itself completes through the UI.
  for (let guard = 0; guard < 40; guard++) {
    const s = await snap(page)
    if (s.phase !== 'setup' && s.phase !== 'deployment') break
    if (!s.pending) {
      await page.waitForTimeout(150)
      continue
    }
    if (s.pending.player === s.botSeat) {
      await page.waitForTimeout(150)
      continue
    }
    const opt = page.locator('[data-testid^="prompt-option-"]').first()
    if (await opt.isVisible().catch(() => false)) {
      await opt.click()
    } else {
      const passBtn = page.getByTestId('btn-pass')
      if (await passBtn.isVisible().catch(() => false)) await passBtn.click()
    }
    await page.waitForTimeout(150)
  }

  const final = await snap(page)
  await page.screenshot({ path: screenshotPath })
  console.log(`[deploy-only] final: phase=${final.phase} round=${final.round} log=\n${log.join('\n')}`)

  expect(consoleErrors, 'no console errors').toEqual([])
  // Command is the first phase of every round (src/engine/phases/command.ts), reached the moment
  // deployment/setup ends — with a fresh army (no battle-shocked units) it can resolve with zero
  // pending decisions and hand straight off to Movement before this test's own next poll, so pinning
  // the live phase to exactly 'command' is a race against the engine's own speed, not a real check.
  // Being in *any* of the real per-round phases is proof Command was already reached and completed.
  const REAL_ROUND_PHASES = new Set(['command', 'movement', 'shooting', 'charge', 'fight'])
  expect(REAL_ROUND_PHASES.has(final.phase), `reached the Command phase (now '${final.phase}')`).toBe(true)
  const humanUnits = final.units.filter((u) => u.player === humanSeat)
  const undeployed = humanUnits.filter((u) => u.loc !== 'board' && u.loc !== 'reserves')
  expect(undeployed, 'every human unit is deployed (on board or held in reserve)').toEqual([])
}

test('deploy-only: Space Marines vs Bot reaches Command phase (1600x900)', async ({ page }) => {
  mkdirSync('e2e-out', { recursive: true })
  await runDeployOnly(page, 1600, 900, 'e2e-out/deploy-dock-1600.png')
})

test('deploy-only: Space Marines vs Bot reaches Command phase (1280x720)', async ({ page }) => {
  mkdirSync('e2e-out', { recursive: true })
  await runDeployOnly(page, 1280, 720, 'e2e-out/deploy-dock-1280.png')
})
