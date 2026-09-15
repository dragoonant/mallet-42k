import type { Page } from '@playwright/test'

// Shared Playwright e2e helpers (docs: see each spec's own header for what it's testing). Every spec
// here drives the real UI only — the store on window.__mallet is read to find where things are on the
// board and to notice stuck/finished decisions, never dispatched to directly. Extracted from
// tests/e2e/play.spec.ts, bot-turn.spec.ts and deploy-only.spec.ts, which used to each keep their own
// near-identical copy of the camera-projection math, the deploy-zone candidate search and the generic
// prompt-clicking primitives below.

// ---------- camera projection (mirrors src/client/board/CameraRig.tsx's orbit math) ----------
export const FOV = 45
export const OVERVIEW_POLAR = (55 * Math.PI) / 180
export const START_DIST = Math.hypot(28, 23.8) // Scene.tsx camera [0,28,23.8] looking at origin
// Mirrors src/client/board/Board.tsx's BOARD_WIDTH_IN/BOARD_DEPTH_IN (44x30, centred at the origin).
export const BOARD_HALF_X_IN = 22
export const BOARD_HALF_Z_IN = 15
export const DEPLOY_EDGE_MARGIN_IN = 0.75

export type V2 = { x: number; z: number }
export type V3 = { x: number; y: number; z: number }
export interface Cam { tx: number; tz: number; d: number; polar: number }

export function makeCam(): Cam {
  return { tx: 0, tz: 0, d: START_DIST, polar: OVERVIEW_POLAR }
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

/** World (inches) -> screen px for the CameraRig's orbit camera (azimuth 0, camera on +z side). */
export function project(p: V3, cam: Cam, W: number, H: number): { x: number; y: number } {
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

export const centroid = (pts: V2[]): V2 => ({
  x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
  z: pts.reduce((a, p) => a + p.z, 0) / pts.length,
})

// ---------- store snapshot ----------
export interface Snap {
  phase: string
  round: number
  active: string
  botSeat: string | null
  humanSeat: string
  result: unknown
  toast: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pending: null | { id: string; kind: string; player: string; context: any; constraints?: any; options?: { id: string; label: string }[] }
  legalTypes: string[]
  units: { id: string; name: string; player: string; loc: string; models: V3[] }[]
  objectives: V2[]
  pieces: { footprint: V2[] }[]
  zones: { A: V2[]; B: V2[] } | null
}

export async function snap(page: Page): Promise<Snap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => {
    const g = (window as any).__mallet.useGameStore.getState()
    const s = g.state
    return {
      phase: s?.phase,
      round: s?.round,
      active: s?.activePlayer,
      botSeat: g.botSeat,
      humanSeat: g.humanSeat,
      result: s?.result ?? null,
      toast: g.toast?.text ?? null,
      pending: g.pending
        ? {
            id: g.pending.id,
            kind: g.pending.kind,
            player: g.pending.player,
            context: g.pending.context,
            constraints: g.pending.constraints,
            options: g.pending.options?.map((o: any) => ({ id: o.id, label: o.label })),
          }
        : null,
      legalTypes: (g.legal ?? []).map((a: any) => a.type),
      units: s
        ? Object.values(s.units).map((u: any) => ({
            id: u.id,
            name: u.name,
            player: u.player,
            loc: u.location,
            models: u.models.map((m: string) => s.models[m]?.pos).filter(Boolean),
          }))
        : [],
      objectives: s ? Object.values(s.objectives).filter((o: any) => !o.removed).map((o: any) => ({ x: o.pos.x, z: o.pos.z })) : [],
      pieces: s ? Object.values(s.board.pieces).map((p: any) => ({ footprint: p.footprint })) : [],
      zones: s?.mission?.data?.deploymentZones ?? null,
    }
  })
}

// ---------- logging ----------
/** A tiny per-spec log: `note()` both records the line (for the run's own JSON/console summary) and
 *  prints it with the spec's own prefix, so several specs' interleaved console output stays readable. */
export function createLog(prefix: string): { log: string[]; note: (s: string) => void } {
  const log: string[] = []
  const note = (s: string) => {
    log.push(s)
    console.log(`[${prefix}] ${s}`)
  }
  return { log, note }
}

// ---------- deploy-zone candidate search ----------
/** The x-span (with a small margin) that's clear, across the deployment zone's whole depth, of every
 *  terrain piece whose own z-span overlaps the zone at all — a mission's zone can sit right next to a
 *  crate/ruin. */
export function clearAnchorX(zone: V2[], pieces: { footprint: V2[] }[], zoneMinX: number, zoneMaxX: number): number {
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

/** Candidate deployment-click points spanning the zone's own bounding box (a real grid of x/z fractions
 *  across the actual zone, terrain-aware via `clearAnchorX`) rather than a fixed list of absolute world
 *  coordinates tuned to one mission's layout. Sorted so the least-obstructed candidates (smallest
 *  projected screen-y, i.e. farthest from the bottom decision-prompt/event-feed panels) are tried first
 *  — `clickCanvasAt`'s own elementFromPoint check still does the real, final screening. `jitterIndex`
 *  (already-deployed-unit count) staggers repeat callers so several units landing in the same zone don't
 *  all aim at the exact same spot. */
export function deployZoneCandidates(zone: V2[], pieces: { footprint: V2[] }[], jitterIndex: number, cam: Cam, W: number, H: number): V2[] {
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
  const xFracs = [0.5, 0.35, 0.65, 0.3, 0.7, 0.4, 0.6]
  const zFracs = [0.5, 0.15, 0.85, 0.3, 0.7, 0.05, 0.95, 0.2, 0.8]
  const pts: V2[] = [{ x: clearX + jitter, z: zLo + d * 0.5 }]
  for (const zf of zFracs) for (const xf of xFracs) pts.push({ x: xLo + w * xf + jitter, z: zLo + d * zf })
  const inBounds = pts.filter((p) => p.x >= xLo - 1e-6 && p.x <= xHi + 1e-6 && p.z >= zLo - 1e-6 && p.z <= zHi + 1e-6)
  return inBounds
    .map((p) => ({ p, y: project({ x: p.x, y: 0, z: p.z }, cam, W, H).y }))
    .sort((a, b) => a.y - b.y)
    .map(({ p }) => p)
}

// ---------- generic prompt/board interaction ----------
export async function clearToast(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__mallet.useGameStore.getState().clearToast())
}

/** Click a screen point only if the canvas (not a HUD panel) is what's under it. */
export async function clickCanvasAt(page: Page, pt: { x: number; y: number }, W: number, H: number): Promise<boolean> {
  if (pt.x < 2 || pt.y < 2 || pt.x > W - 2 || pt.y > H - 2) return false
  const tag = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, [pt.x, pt.y])
  if (tag !== 'CANVAS') return false
  await page.mouse.click(pt.x, pt.y)
  return true
}

/** Polls the store (~80ms) until `pending` changes away from `id`, a toast appears, or `ms` elapses. */
export async function waitChange(page: Page, id: string, ms = 1500): Promise<Snap> {
  const end = Date.now() + ms
  let s = await snap(page)
  while (Date.now() < end && s.pending?.id === id && !s.toast) {
    await page.waitForTimeout(80)
    s = await snap(page)
  }
  return s
}

export async function promptButton(page: Page, re: RegExp) {
  const b = page.locator('[data-testid="prompt"] button').filter({ hasText: re }).first()
  return (await b.isVisible().catch(() => false)) ? b : null
}

export async function clickFirstOption(page: Page, avoidPass = true): Promise<boolean> {
  const opts = page.locator('[data-testid^="prompt-option-"]')
  const n = await opts.count()
  for (let i = 0; i < n; i++) {
    const t = (await opts.nth(i).textContent()) ?? ''
    if (avoidPass && /^Pass$/.test(t)) continue
    await opts.nth(i).click()
    return true
  }
  return false
}

/** Pass via the decision prompt's own button (src/client/ui/DecisionPrompt.tsx `btn-pass`), falling
 *  back to the HUD's "End phase / Pass" (`btn-end-phase`) and finally to the first non-Pass option list
 *  entry — so a decision with `canPass:false` still advances instead of hanging. */
export async function clickPass(page: Page): Promise<boolean> {
  for (const id of ['btn-pass', 'btn-end-phase']) {
    const b = page.getByTestId(id)
    if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
      await b.click()
      return true
    }
  }
  return clickFirstOption(page, false)
}

export async function resetOpenDraft(page: Page): Promise<void> {
  const cancel = page.getByTestId('btn-cancel')
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {})
}

/** A leader auto-attaches to a bodyguard at game setup (src/client/store/game.ts's `defaultAttachments`)
 *  and deploys as one combined placement, so a formation's default shape (a single-row Line) can fail
 *  10th edition coherency (every model within 2" of >= 2 others) for a 6+-model group even though the
 *  anchor point itself is perfectly legal. Tried in order at the same anchor before giving up on that
 *  candidate point entirely. */
export const COHERENCY_FALLBACK_KINDS = ['phalanx', 'ranks2', 'ranks3', 'column', 'spread']

export async function tryAlternateFormationForCoherency(page: Page, confirm: ReturnType<Page['getByTestId']>): Promise<boolean> {
  for (const kind of COHERENCY_FALLBACK_KINDS) {
    const btn = page.getByTestId(`formation-${kind}`)
    if (!(await btn.isVisible().catch(() => false))) return false // no formation picker for this decision
    await btn.click({ timeout: 2_000 }).catch(() => {})
    await page.waitForTimeout(100)
    if (await confirm.isEnabled().catch(() => false)) return true
  }
  return false
}

/** Try to answer a board-placement decision (deploy/move/charge move/pile-in/consolidate) by clicking
 *  the board then Confirm, walking `points` until one lands. `opts.note` is optional — pass a spec's own
 *  `createLog().note` to get a line per rejected/blocked candidate, or leave it out to fail silently and
 *  just return false/true. `opts.retryFormations` (default false) additionally walks a couple of
 *  alternate formation shapes at each anchor before giving up on it (see
 *  tryAlternateFormationForCoherency) — worth it for a spec that wants every candidate point to get a
 *  real shot at coherency (a 6+-model leader+bodyguard group can fail the default Line shape even at an
 *  otherwise-legal anchor), but it multiplies the cost of every *rejected* candidate by up to 5 more
 *  clicks — several minutes' difference across a whole deployment phase's worth of candidates. Off by
 *  default so speed-sensitive callers (deploy-only.spec.ts, play-fast.spec.ts) don't pay for it; the
 *  Reserves/Pass (or suggested-option-list) fallback already in each caller's own decision handler covers
 *  the rare anchor that only a formation retry would have saved. */
export async function tryBoardPlacement(
  page: Page, s: Snap, points: V2[], cam: Cam, W: number, H: number, label: string,
  opts: { note?: (s: string) => void; retryFormations?: boolean } = {},
): Promise<boolean> {
  const { note, retryFormations = false } = opts
  const id = s.pending!.id
  for (const p of points) {
    await clearToast(page)
    await resetOpenDraft(page)
    const ok = await clickCanvasAt(page, project({ x: p.x, y: 0, z: p.z }, cam, W, H), W, H)
    if (!ok) continue
    await page.waitForTimeout(120)
    const confirm = page.getByTestId('btn-confirm')
    if (!(await confirm.isVisible().catch(() => false))) continue
    if (!(await confirm.isEnabled().catch(() => false))) {
      if (!retryFormations || !(await tryAlternateFormationForCoherency(page, confirm))) continue
    }
    await confirm.click()
    const after = await waitChange(page, id)
    if (after.pending?.id !== id) return true
    if (after.toast) note?.(`${label}: ${after.toast}`)
  }
  await resetOpenDraft(page)
  await clearToast(page)
  return false
}

// ---------- Command Re-roll / stratagem / reaction offers ----------
/** Answers a Command Re-roll / stratagem / reaction prompt by role/text scoped to the decision-prompt
 *  container itself (`[data-testid="prompt"]`), not a bare testid lookup elsewhere on the page (the
 *  HUD's own "End phase / Pass" shares a label with this prompt's Pass button). Returns the label of
 *  whatever it clicked, or null if the prompt isn't visible / has nothing clickable at all. */
export async function answerRerollLikeDecision(page: Page): Promise<string | null> {
  const prompt = page.getByTestId('prompt')
  if (!(await prompt.isVisible().catch(() => false))) return null
  const passBtn = prompt.getByRole('button', { name: 'Pass', exact: true })
  if (await passBtn.isVisible().catch(() => false)) {
    await passBtn.click()
    return 'Pass'
  }
  // No Pass on offer (canPass:false) — take the first real option in the prompt instead, same container.
  const anyBtn = prompt.getByRole('button').first()
  if (await anyBtn.isVisible().catch(() => false)) {
    const label = (await anyBtn.textContent())?.trim() ?? '(unlabelled)'
    await anyBtn.click()
    return label
  }
  return null
}

/** Checks every <button> currently inside the decision-prompt container and reports any whose centre
 *  point resolves (via document.elementFromPoint) to something else — e.g. the dice tray drawn on top of
 *  it. Read-only: never clicks anything. Returns one "PROMPT BUTTON COVERED: ..." string per offender
 *  (empty when everything is clickable). */
export async function verifyPromptButtonsClickable(page: Page): Promise<string[]> {
  const results = await page.evaluate(() => {
    const prompt = document.querySelector('[data-testid="prompt"]')
    if (!prompt) return []
    return Array.from(prompt.querySelectorAll('button')).map((btn) => {
      const r = btn.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hit = document.elementFromPoint(cx, cy)
      const covered = !(hit && (hit === btn || btn.contains(hit)))
      return {
        label: (btn.textContent ?? '').trim().slice(0, 30),
        testid: btn.getAttribute('data-testid'),
        covered,
        hitTag: hit?.tagName ?? null,
        hitTestid: hit?.getAttribute('data-testid') ?? null,
      }
    })
  })
  return results
    .filter((r) => r.covered)
    .map((r) => `PROMPT BUTTON COVERED: "${r.label}" (${r.testid}) — elementFromPoint hit ${r.hitTag} (${r.hitTestid}) instead`)
}

// ---------- game start ----------
/** Start screen -> Space Marines vs Bot with the given seed, waiting for the store to be reachable via
 *  window.__mallet. Doesn't touch Settings — callers that need Instant/dice-off/reroll-Never etc. do that
 *  right after, once `settings-panel` opens (see play-fast.spec.ts). */
export async function startGameVsBot(page: Page, seed: string): Promise<void> {
  const { expect } = await import('@playwright/test')
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByRole('button', { name: 'Space Marines' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet) // eslint-disable-line @typescript-eslint/no-explicit-any
}
