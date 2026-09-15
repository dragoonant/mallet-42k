import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Regression coverage for the "Opponent is thinking…" freeze (commit e10ba8e) and its two follow-ups: a bot
// decision that throws or stalls used to leave src/client/store/game.ts's runBotDecision() permanently stuck
// on one PendingDecision (fixed with a watchdog + RandomDecider fallback), and separately a Command Re-roll
// offer mid-attack (commandReroll) could stall indefinitely for either player — the bot's own offer wasn't
// always recognised as "mid-attack" (skip the presentation-idle wait), and a human-owned offer could sit
// behind buffered dice pacing. src/client/store/game.ts now also runs an unconditional outer watchdog
// (NO_PROGRESS_WARN_MS) that warns and force-answers any bot decision that hasn't moved in 5s regardless of
// why, and src/client/presentation/director.ts flushes decorative event pacing while a commandReroll is
// pending so the relevant roll reaches the screen immediately. This spec deploys as Space Marines vs the
// Standard bot (mirrors tests/e2e/play.spec.ts's own flow/helpers) and drives the whole of round 1 for both
// players, asserting no PendingDecision ever sits unanswered for more than 15s unless it's genuinely the
// human's own decision with a visible prompt.

const W = 1600
const H = 900
const FOV = 45
const OVERVIEW_POLAR = (55 * Math.PI) / 180
const START_DIST = Math.hypot(28, 23.8) // Scene.tsx camera [0,28,23.8] looking at origin
const STALL_LIMIT_MS = 15_000
const GAME_BUDGET_MS = 9 * 60_000

type V2 = { x: number; z: number }
interface Cam { tx: number; tz: number; d: number; polar: number }
const cam: Cam = { tx: 0, tz: 0, d: START_DIST, polar: OVERVIEW_POLAR }

/** World (inches) -> screen px for the CameraRig's orbit camera (azimuth 0, camera on +z side). Copied from
 *  tests/e2e/play.spec.ts (kept local rather than imported — these e2e specs never import one another). */
function project(p: { x: number; y: number; z: number }): { x: number; y: number } {
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
  humanSeat: string
  result: unknown
  toast: string | null
  pending: null | { id: string; kind: string; player: string; context: any; constraints?: any; options?: { id: string; label: string }[] }
  legalTypes: string[]
  units: { id: string; name: string; player: string; loc: string; models: { x: number; y: number; z: number }[] }[]
  objectives: V2[]
  pieces: { footprint: V2[] }[]
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
    }
  })
}

// ---------- deploy helpers (mirrors tests/e2e/play.spec.ts's own, trimmed to what deployment needs) ----------
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

function deployZoneCandidates(zone: V2[], pieces: { footprint: V2[] }[], jitterIndex: number): V2[] {
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
    .map((p) => ({ p, y: project({ x: p.x, y: 0, z: p.z }).y }))
    .sort((a, b) => a.y - b.y)
    .map(({ p }) => p)
}

async function clearToast(page: Page) {
  await page.evaluate(() => (window as any).__mallet.useGameStore.getState().clearToast())
}

async function clickCanvasAt(page: Page, pt: { x: number; y: number }): Promise<boolean> {
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

async function promptButton(page: Page, re: RegExp) {
  const b = page.locator('[data-testid="prompt"] button').filter({ hasText: re }).first()
  return (await b.isVisible().catch(() => false)) ? b : null
}

async function clickFirstOption(page: Page, avoidPass = true): Promise<boolean> {
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

async function clickPass(page: Page): Promise<boolean> {
  for (const id of ['btn-pass', 'btn-end-phase']) {
    const b = page.getByTestId(id)
    if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
      await b.click()
      return true
    }
  }
  return clickFirstOption(page, false)
}

async function resetOpenDraft(page: Page) {
  const cancel = page.getByTestId('btn-cancel')
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {})
}

async function tryBoardPlacement(page: Page, s: Snap, points: V2[]): Promise<boolean> {
  const id = s.pending!.id
  for (const p of points) {
    await clearToast(page)
    await resetOpenDraft(page)
    const ok = await clickCanvasAt(page, project({ x: p.x, y: 0, z: p.z }))
    if (!ok) continue
    await page.waitForTimeout(120)
    const confirm = page.getByTestId('btn-confirm')
    if (!(await confirm.isVisible().catch(() => false))) continue
    if (!(await confirm.isEnabled().catch(() => false))) continue
    await confirm.click()
    const after = await waitChange(page, id)
    if (after.pending?.id !== id) return true
  }
  await resetOpenDraft(page)
  await clearToast(page)
  return false
}

/** Answers only the human's (player A) decisions — deployUnit via a board click (falling back to the
 *  Reserves/Pass buttons), everything else via the decision prompt's first non-Pass option. The bot (player
 *  B) is never driven here; the store's own internal timer drives it, which is exactly the path this spec
 *  is checking for a freeze. */
async function handleHuman(page: Page, s: Snap): Promise<void> {
  const p = s.pending!
  const me = p.player

  switch (p.kind) {
    case 'deployUnit': {
      const uid: string = p.context.unitIds[0]
      const name = s.units.find((u) => u.id === uid)?.name ?? uid
      const chip = await promptButton(page, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      if (chip) await chip.click()
      const zone: V2[] = p.context.zone
      const taken = s.units.filter((u) => u.player === me && u.loc === 'board').length
      const inside = deployZoneCandidates(zone, s.pieces, taken)
      if (chip && (await tryBoardPlacement(page, s, inside))) return
      const res = await promptButton(page, /^Reserves:/)
      if (res) return void (await res.click())
      await clickPass(page)
      return
    }
    default: {
      if (!(await clickFirstOption(page, false))) await clickPass(page)
    }
  }
}

test('no decision stalls through the whole of round 1, including Command Re-roll offers mid-attack', async ({ page }) => {
  test.setTimeout(11 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  const consoleErrors: string[] = []
  const botLogs: string[] = []
  // ?debug turns on src/client/store/game.ts's botDebug() console.debug logging of the bot loop
  // (decision kind, decide() duration, whether it waited on presentation) — captured here alongside
  // the store's own console.error watchdog/fallback/redo lines (also prefixed '[bot]').
  page.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error') consoleErrors.push(text.slice(0, 400))
    if (text.startsWith('[bot]')) botLogs.push(text.slice(0, 400))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 400)}`))

  await page.setViewportSize({ width: W, height: H })
  await page.goto('/?debug')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByRole('button', { name: 'Space Marines' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  // Same seed as the original bug report (commit e10ba8e, tests/e2e/play.spec.ts's own 'playtest-r1') so
  // this spec is a direct regression check for that freeze, not just a fresh/different board state.
  await page.getByTestId('setup-seed').fill('playtest-r1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(1500)
  // Deliberately left at the default 'normal' animation speed (src/client/presentation/settings.ts) —
  // this spec's timing assertion targets normal speed specifically (the coordinator's ≤90s check), so
  // switching to 'fast' here would hide exactly the pacing this run is meant to measure.

  const start = Date.now()
  let lastPendingId = ''
  let lastChangeAt = Date.now()
  let sawBotMovement = false
  let reachedSecondHumanDecisionAfterMovement = false
  let stallReason: string | null = null
  // Bot's own round-1 turn (movement + shooting + charge + fight): starts the first time it's the bot's
  // active turn, ends the first time active flips back to the human (or the round advances) afterward.
  let botTurnStartAt: number | null = null
  const botTurnPhasesSeen = new Set<string>()
  let botTurnEndAt: number | null = null
  let round1Done = false

  while (Date.now() - start < GAME_BUDGET_MS) {
    const s = await snap(page)
    if (s.result || s.phase === 'ended') break
    if (s.round > 1) { round1Done = true; break } // covered the whole of round 1 for both players

    if (botTurnStartAt === null && s.round === 1 && s.active === s.botSeat) botTurnStartAt = Date.now()
    if (botTurnStartAt !== null && botTurnEndAt === null) {
      if (s.active === s.botSeat) botTurnPhasesSeen.add(s.phase)
      else if (botTurnPhasesSeen.has('fight')) botTurnEndAt = Date.now()
    }

    if (!s.pending) {
      if (Date.now() - lastChangeAt > STALL_LIMIT_MS) { stallReason = 'no pending decision and no result'; break }
      await page.waitForTimeout(150)
      continue
    }

    if (s.pending.id !== lastPendingId) {
      lastPendingId = s.pending.id
      lastChangeAt = Date.now()
    } else if (Date.now() - lastChangeAt > STALL_LIMIT_MS) {
      // A decision with no progress for >15s is only acceptable when it's genuinely waiting on the human
      // AND the prompt is actually visible for them to answer (not hidden behind the dice tray, or a bot
      // decision mislabelled as the human's) — our own harness always answers immediately below, so in
      // practice this branch means presentation is blocking the prompt from rendering at all.
      const isHumanTurn = s.pending.player === s.humanSeat
      const promptVisible = isHumanTurn && (await page.getByTestId('prompt').isVisible().catch(() => false))
      if (isHumanTurn && promptVisible) {
        lastChangeAt = Date.now() // legitimately waiting on the human with a visible prompt — not a stall
      } else {
        stallReason = `decision ${s.pending.id} (${s.pending.kind}, player ${s.pending.player}) did not advance for >${STALL_LIMIT_MS}ms`
          + (isHumanTurn ? ' (human decision but the prompt is not visible)' : '')
        break
      }
    }

    if (s.pending.player === s.botSeat) {
      if (s.phase === 'movement') sawBotMovement = true
      if (sawBotMovement && s.phase !== 'movement') reachedSecondHumanDecisionAfterMovement = true
      await page.waitForTimeout(150)
      continue
    }

    // human decision: answer it and keep going
    if (sawBotMovement && s.round >= 1 && s.phase !== 'movement') reachedSecondHumanDecisionAfterMovement = true
    await handleHuman(page, s)
    await page.waitForTimeout(60)
  }

  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e-out/bot-turn.png' })

  // decide() timing stats from the '[bot] decide kind=... id=... ms=... waitedOnPresentation=...' lines
  // (src/client/store/game.ts's botDebug, gated on ?debug above).
  const decideMs = botLogs
    .map((l) => /^\[bot\] decide kind=\S+ id=\S+ ms=([\d.]+)/.exec(l)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number)
  const sorted = [...decideMs].sort((a, b) => a - b)
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] : 0
  const watchdogHits = botLogs.filter((l) => l.includes('exceeded') && l.includes('ms — falling back')).length
  const redoHits = botLogs.filter((l) => l.includes('UtilityDecider took') && l.includes('redoing')).length
  const botTurnMs = botTurnStartAt !== null && botTurnEndAt !== null ? botTurnEndAt - botTurnStartAt : null

  const noProgressWarnings = [...new Set(consoleErrors)].filter((l) => l.startsWith('[bot] no progress on decision'))

  const final = await snap(page)
  console.log(JSON.stringify({
    elapsedS: Math.round((Date.now() - start) / 1000),
    final: { round: final.round, phase: final.phase, active: final.active, pending: final.pending?.kind, player: final.pending?.player },
    round1Done,
    sawBotMovement,
    reachedSecondHumanDecisionAfterMovement,
    stallReason,
    botTurnMs,
    botTurnPhasesSeen: [...botTurnPhasesSeen],
    decisionStats: { count: decideMs.length, meanMs: Math.round(mean * 10) / 10, p95Ms: p95, watchdogHits, redoHits },
    noProgressWarnings,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 30),
    botLogTail: botLogs.slice(-20),
  }, null, 2))

  expect.soft(sawBotMovement, 'bot reached its Movement phase').toBe(true)
  expect.soft(watchdogHits, '3s presentation/decide watchdog should be a rare safety net, not the normal path').toBe(0)
  expect.soft(redoHits, '500ms UtilityDecider redo should not fire on normal decisions').toBe(0)
  if (botTurnMs !== null) {
    expect(botTurnMs, "bot's round-1 turn (movement+shooting+charge+fight) should finish within 90s at normal speed").toBeLessThan(90_000)
  }
  expect(stallReason, `no decision should stall for >${STALL_LIMIT_MS}ms unless it's the human's with a visible prompt`).toBeNull()
  // The outer progress watchdog (src/client/store/game.ts's NO_PROGRESS_WARN_MS) should never need to fire
  // on a healthy run — same "rare safety net" contract as the 3s/500ms ones above.
  expect.soft(noProgressWarnings, 'the generic no-progress watchdog should not have needed to intervene').toEqual([])
  expect.soft(reachedSecondHumanDecisionAfterMovement, 'game progressed past the bot Movement phase to a later human decision').toBe(true)
  expect.soft(round1Done, 'covered the whole of round 1 for both players (round advanced to 2)').toBe(true)
})
