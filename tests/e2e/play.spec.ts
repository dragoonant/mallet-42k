import { expect, test, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'

// Playtest (round 1): a human-like run through the real UI. Every game action is a real click — unit
// chips, board clicks on the canvas, figure clicks, prompt buttons. The store on window.__mallet is only
// READ (to find where things are on the board and to notice stuck decisions), never dispatched to.

const W = 1600
const H = 900
const FOV = 45
const OVERVIEW_POLAR = (55 * Math.PI) / 180
const START_DIST = Math.hypot(28, 23.8) // Scene.tsx camera [0,28,23.8] looking at origin
const GAME_BUDGET_MS = 10 * 60_000

type V2 = { x: number; z: number }
interface Cam { tx: number; tz: number; d: number; polar: number }
let cam: Cam = { tx: 0, tz: 0, d: START_DIST, polar: OVERVIEW_POLAR }

/** World (inches) -> screen px for the CameraRig's orbit camera (azimuth 0, camera on +z side). */
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

const centroid = (pts: { x: number; z: number }[]): V2 => ({
  x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
  z: pts.reduce((a, p) => a + p.z, 0) / pts.length,
})

const log: string[] = []
const note = (s: string) => {
  log.push(s)
  console.log(`[play] ${s}`)
}

/** The x-span (with a small margin) that's clear, across the deployment zone's whole depth, of every
 *  terrain piece whose own z-span overlaps the zone at all (mirrors tests/e2e/formations.spec.ts's
 *  helper of the same name — a mission's zone can sit right next to a crate/ruin). */
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

/** Candidate deployment-click points spanning the zone's own bounding box (a real grid of x/z
 *  fractions across the actual zone, terrain-aware via `clearAnchorX`) rather than a fixed list of
 *  absolute world coordinates guessed from one particular mission's layout — the previous list
 *  (`[-15, 0, 15, -8, 8, -19, 19]` etc.) was tuned to cp-01's own zones and could leave every
 *  candidate either outside a differently-shaped zone or clustered in the one spot that happens to
 *  sit under the bottom decision-prompt/event-feed panels (the deploy failure this fixes: a
 *  single-model HQ like Librarian Tantus in a zone whose centre projects behind those panels never
 *  got a single unobstructed candidate to try). `clickCanvasAt`'s own elementFromPoint check still
 *  does the actual overlay screening; this just gives it enough spread across the real zone to find a
 *  clear point. `jitterIndex` (already-deployed-unit count) staggers repeat callers so several units
 *  landing in the same zone don't all aim at the exact same spot. */
function deployZoneCandidates(zone: V2[], pieces: { footprint: V2[] }[], jitterIndex: number): V2[] {
  const xs = zone.map((p) => p.x)
  const zs = zone.map((p) => p.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const w = maxX - minX
  const d = maxZ - minZ
  const clearX = clearAnchorX(zone, pieces, minX, maxX)
  // Bug this fixes: the old formula (`(jitterIndex * 2.7) % (w * 0.5) - w * 0.25`) subtracted a full
  // quarter-width constant even for `jitterIndex === 0` (the very first unit into this zone), so
  // every candidate — including the ones meant to sample the zone's clear centre and right side —
  // was shifted a fixed ~11" toward the left edge before any real jitter was even needed. That left
  // the "on-screen but under the deploy/event panels" 30-45% of the zone as the only reachable band
  // for a lone/first unit, which is exactly the failure this whole candidate list exists to avoid.
  const jitter = jitterIndex === 0 || w <= 0.5 ? 0 : ((jitterIndex * 1.7) % (w * 0.15)) - w * 0.075
  // x-fractions stay in the zone's interior (0.3-0.7, not 0.15/0.85) and the boundary margin below is
  // a flat ~6" (not a token 0.5") — a leader auto-attaches to a bodyguard and deploys as one combined
  // placement (src/client/store/game.ts's `defaultAttachments`), so "click inside the zone" can mean
  // anchoring a 5-8 model line several inches wide; an anchor a token half-inch from the zone/board
  // edge left that whole line poking past it ("must end wholly within the allowed region" / "would
  // leave the battlefield" engine rejections seen for a 6-model Captain+Terminator Squad group).
  const EDGE_MARGIN_IN = Math.min(6, w * 0.2)
  const xFracs = [0.5, 0.35, 0.65, 0.3, 0.7, 0.4, 0.6]
  const zFracs = [0.5, 0.3, 0.7, 0.2, 0.8]
  const pts: V2[] = [{ x: clearX + jitter, z: minZ + d * 0.5 }]
  for (const zf of zFracs) for (const xf of xFracs) pts.push({ x: minX + w * xf + jitter, z: minZ + d * zf })
  return pts.filter((p) => p.x > minX + EDGE_MARGIN_IN && p.x < maxX - EDGE_MARGIN_IN && p.z > minZ + 0.3 && p.z < maxZ - 0.3)
}

async function clearToast(page: Page) {
  await page.evaluate(() => (window as any).__mallet.useGameStore.getState().clearToast())
}

/** Click a screen point only if the canvas (not a HUD panel) is what's under it. */
async function clickCanvasAt(page: Page, pt: { x: number; y: number }, what: string): Promise<boolean> {
  if (pt.x < 2 || pt.y < 2 || pt.x > W - 2 || pt.y > H - 2) return false
  const tag = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName ?? null, [pt.x, pt.y])
  if (tag !== 'CANVAS') {
    note(`overlay covers board at ${what} (${Math.round(pt.x)},${Math.round(pt.y)}) -> ${tag}`)
    return false
  }
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

const milestones = {
  deployed: false,
  boardClickDeploys: 0,
  boardClickMoves: 0,
  listMoves: 0,
  figureActivations: 0,
  figureTargets: 0,
  listTargets: 0,
  charges: 0,
  chargeMoves: 0,
  fights: 0,
  humanPhases: new Set<string>(),
  stuck: [] as string[],
  rejections: [] as string[],
}

// A leader auto-attaches to a bodyguard at game setup (src/client/store/game.ts's `defaultAttachments`)
// and deploys as one combined placement (docs/spec: "an attached Leader has no drop of its own") — so
// picking a named leader like "Librarian Tantus" to deploy can actually be placing a 6-model group
// (1 leader + a 5-model squad). The formation picker's default shape (a single-row Line) satisfies
// coherency for a small unit but not a 6+-model one: 10th edition requires every model in a 6+-model
// unit to sit within 2" of at least *two* others, which a straight line's own end models fail (each
// has only one lateral neighbour). Rather than treat every anchor point as a dead end the moment that
// happens, try a few tighter shapes at the same anchor first — this is still "pick a valid target",
// just widened to include the formation-shape half of a placement, not only its screen coordinate.
const COHERENCY_FALLBACK_KINDS = ['phalanx', 'ranks2', 'ranks3', 'column', 'spread']

async function tryAlternateFormationForCoherency(page: Page, confirm: ReturnType<Page['getByTestId']>): Promise<boolean> {
  for (const kind of COHERENCY_FALLBACK_KINDS) {
    const btn = page.getByTestId(`formation-${kind}`)
    if (!(await btn.isVisible().catch(() => false))) return false // no formation picker for this decision
    await btn.click({ timeout: 2_000 }).catch(() => {})
    await page.waitForTimeout(100)
    if (await confirm.isEnabled().catch(() => false)) return true
  }
  return false
}

/** Try to answer a board-placement decision by clicking the board then Confirm. */
async function tryBoardPlacement(page: Page, s: Snap, points: V2[], label: string): Promise<boolean> {
  const id = s.pending!.id
  for (const p of points) {
    await clearToast(page)
    const ok = await clickCanvasAt(page, project({ x: p.x, y: 0, z: p.z }), label)
    if (!ok) continue
    await page.waitForTimeout(120)
    const confirm = page.getByTestId('btn-confirm')
    // M4: Confirm is disabled (with a reason) while the formation preview fails a client-side check
    // (coherency/overlap/terrain/allowance) — treat that exactly like "not visible" and try the next
    // candidate point rather than clicking a disabled button (which would just hang), but only after
    // a couple of alternate shapes at this same anchor have also failed to clear the check.
    if (!(await confirm.isVisible().catch(() => false))) continue
    if (!(await confirm.isEnabled().catch(() => false)) && !(await tryAlternateFormationForCoherency(page, confirm))) continue
    await confirm.click()
    const after = await waitChange(page, id)
    if (after.pending?.id !== id) return true
    if (after.toast) milestones.rejections.push(`${label}: ${after.toast}`)
  }
  await clearToast(page)
  return false
}

async function handleHuman(page: Page, s: Snap, fast: boolean): Promise<void> {
  const p = s.pending!
  const me = p.player
  const mine = s.units.filter((u) => u.player === me && u.loc === 'board' && u.models.length)
  const enemy = s.units.filter((u) => u.player !== me && u.loc === 'board' && u.models.length)
  milestones.humanPhases.add(`R${s.round}:${s.phase}`)

  switch (p.kind) {
    case 'deployUnit': {
      const uid: string = p.context.unitIds[0]
      const name = s.units.find((u) => u.id === uid)?.name ?? uid
      const chip = await promptButton(page, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      if (chip) await chip.click()
      const zone: V2[] = p.context.zone
      const taken = s.units.filter((u) => u.player === me && u.loc === 'board').length
      const inside = deployZoneCandidates(zone, s.pieces, taken)
      if (!fast && chip && (await tryBoardPlacement(page, s, inside, `deploy ${name}`))) {
        milestones.boardClickDeploys++
        return
      }
      // no list for deployUnit: try reserves button, else pass
      const res = await promptButton(page, /^Reserves:/)
      if (res) return void (await res.click())
      if (fast && chip && (await tryBoardPlacement(page, s, inside, `deploy ${name}`))) return
      await clickPass(page)
      return
    }
    case 'chooseUnitToActivate':
    case 'chooseFightUnit': {
      const uid: string = p.context.eligible[0]
      const u = s.units.find((x) => x.id === uid)
      if (!fast && u?.models[0]) {
        const m = u.models[0]
        if (await clickCanvasAt(page, project({ x: m.x, y: 0.5, z: m.z }), `figure ${u.name}`)) {
          const after = await waitChange(page, p.id, 800)
          if (after.pending?.id !== p.id) {
            milestones.figureActivations++
            if (p.kind === 'chooseFightUnit') milestones.fights++
            return
          }
        }
      }
      if (p.kind === 'chooseFightUnit') milestones.fights++
      if (!(await clickFirstOption(page))) await clickPass(page)
      return
    }
    case 'declareMove': {
      const b = (s.phase === 'movement' && (await promptButton(page, /^Normal move$/))) || null
      if (b) return void (await b.click())
      if (!(await clickFirstOption(page))) await clickPass(page)
      return
    }
    case 'moveUnit': {
      const u = s.units.find((x) => x.id === p.context.unitId)
      if (!fast && u && enemy.length && s.phase === 'movement') {
        const a = centroid(u.models)
        const targets = enemy.map((e) => centroid(e.models)).sort((q, r) => Math.hypot(q.x - a.x, q.z - a.z) - Math.hypot(r.x - a.x, r.z - a.z))
        const t = targets[0]
        const base = Math.atan2(t.z - a.z, t.x - a.x)
        const max = p.constraints?.maxDistance ?? 6
        const pts: V2[] = []
        for (const frac of [0.7, 0.4]) for (const da of [0, 0.5, -0.5, 1.0, -1.0]) {
          const d = Math.max(1, max * frac)
          pts.push({ x: a.x + Math.cos(base + da) * d, z: a.z + Math.sin(base + da) * d })
        }
        if (await tryBoardPlacement(page, s, pts, `move ${u.name}`)) {
          milestones.boardClickMoves++
          note(`board-click move ${u.name} ok (round ${s.round})`)
          return
        }
      }
      milestones.listMoves++
      if (!(await clickFirstOption(page))) await clickPass(page)
      return
    }
    case 'declareTargets': {
      const ts = new Set<string>()
      for (const w of p.context.weapons ?? []) for (const t of w.legalTargets) ts.add(t)
      const tid = [...ts][0]
      const tu = s.units.find((x) => x.id === tid)
      if (!fast && tu?.models[0]) {
        const m = tu.models[0]
        if (await clickCanvasAt(page, project({ x: m.x, y: 0.5, z: m.z }), `target ${tu.name}`)) {
          const after = await waitChange(page, p.id, 800)
          if (after.pending?.id !== p.id) {
            milestones.figureTargets++
            note(`figure-click target ${tu.name} (${p.context.attackKind}) round ${s.round}`)
            return
          }
        }
      }
      const b = await promptButton(page, /^Target /)
      if (b) {
        milestones.listTargets++
        return void (await b.click())
      }
      await clickFirstOption(page, false)
      return
    }
    case 'declareCharge': {
      const b = await promptButton(page, /^Charge /)
      if (b) {
        milestones.charges++
        note(`charge declared round ${s.round}: ${await b.textContent()}`)
        return void (await b.click())
      }
      await clickPass(page)
      return
    }
    case 'chargeMove':
    case 'pileIn':
    case 'consolidate': {
      if (p.kind === 'chargeMove') milestones.chargeMoves++
      if (!(await clickFirstOption(page))) await clickPass(page)
      return
    }
    case 'stratagemWindow':
    case 'reactionWindow':
    case 'commandReroll': {
      if (!(await clickPass(page))) await clickFirstOption(page, false)
      return
    }
    default: {
      if (!(await clickFirstOption(page, false))) await clickPass(page)
    }
  }
}

test('play a game as Space Marines vs Bot through the UI', async ({ page }) => {
  test.setTimeout(14 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  await page.setViewportSize({ width: W, height: H })
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  // 00: figure gallery
  await page.goto('/?gallery')
  await page.waitForSelector('canvas')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e-out/00-figures.png' })

  // 01: start screen, Space Marines vs Bot
  await page.goto('/')
  // Widen the window between "the bot has a pending decision" and "it resolves" (store.ts BOT_DELAY_MS=400ms)
  // so the ai-01-bot-turn.png screenshot below (mid-poll-loop, no artificial pause of its own) has a realistic
  // chance of landing on the bot's own turn instead of whatever it triggers next (e.g. a Fire Overwatch reaction
  // offered to the human) — this only stretches pacing, it changes no game logic.
  await page.evaluate(() => {
    const orig = window.setTimeout.bind(window)
    window.setTimeout = ((fn: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) =>
      orig(fn, (delay ?? 0) * 5, ...args)) as typeof setTimeout
  })
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByRole('button', { name: 'Space Marines' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('playtest-r1')
  await page.screenshot({ path: 'e2e-out/01-start.png' })
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(2500) // camera polar lerp + first frames

  // M8: open Settings (screenshot the popover), then speed pacing up to 'fast' so the full
  // playtest below doesn't take forever — 'instant' would skip the dice tumble and vfx-catching
  // gaps entirely, making the m8-01/m8-02 effect screenshots below impossible to land.
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/m8-04-settings.png' })
  await page.getByTestId('settings-speed-fast').click()
  await page.getByTestId('btn-settings').click()

  // projection sanity: click a figure of any on-board unit later; record accuracy
  const start = Date.now()
  let lastId = ''
  let sameCount = 0
  let botWaitSince = Date.now()
  let lastBotId = ''
  let shotMove = false
  let shotShoot = false
  let shotClose = false
  let shotDeployed = false
  let shotBotTurn = false
  let firstBattleRoundDone = false
  let lastPhaseKey = ''
  let shotM8Shoot = false
  let shotM8Dice = false
  let shotM8Melee = false

  while (Date.now() - start < GAME_BUDGET_MS) {
    const s = await snap(page)
    if (s.result || s.phase === 'ended') {
      note(`game ended: ${JSON.stringify(s.result)}`)
      break
    }
    const phaseKey = `R${s.round} ${s.active} ${s.phase}`
    if (phaseKey !== lastPhaseKey) {
      note(`${phaseKey} (pending ${s.pending?.kind} for ${s.pending?.player})`)
      lastPhaseKey = phaseKey
    }

    if (!shotDeployed && s.phase !== 'setup' && s.phase !== 'deployment') {
      milestones.deployed = true
      shotDeployed = true
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'e2e-out/02-deployed.png' })
    }
    if (s.round >= 2) firstBattleRoundDone = true

    // M8: opportunistic catches — the director animates a step or two behind the engine state
    // this loop polls, so the dice tray/fight phase can still be up well after `pending` has
    // already moved on. Checked every iteration since a roll's on-screen window is brief even
    // at 'fast' speed.
    if (!shotM8Dice) {
      const diceVisible = await page.getByTestId('dice-tray').isVisible().catch(() => false)
      if (diceVisible) {
        shotM8Dice = true
        await page.screenshot({ path: 'e2e-out/m8-02-dice.png' })
      }
    }
    if (!shotM8Melee && s.phase === 'fight') {
      shotM8Melee = true
      await page.waitForTimeout(150)
      await page.screenshot({ path: 'e2e-out/m8-03-melee.png' })
    }

    if (!s.pending) {
      await page.waitForTimeout(200)
      if (Date.now() - botWaitSince > 20_000) {
        milestones.stuck.push(`no pending decision and no result at ${phaseKey}`)
        break
      }
      continue
    }

    if (s.pending.player === s.botSeat) {
      if (!shotBotTurn && (s.phase === 'movement' || s.phase === 'shooting')) {
        shotBotTurn = true
        // screenshot immediately (no extra wait) — the bot's own decision timer (store.ts BOT_DELAY_MS)
        // resolves in ~400ms, so any delay here risks catching a reaction prompt spawned by its move instead
        await page.screenshot({ path: 'e2e-out/ai-01-bot-turn.png' })
      }
      if (s.pending.id !== lastBotId) {
        lastBotId = s.pending.id
        botWaitSince = Date.now()
      } else if (Date.now() - botWaitSince > 15_000) {
        milestones.stuck.push(`bot stuck on ${s.pending.kind} at ${phaseKey}`)
        break
      }
      await page.waitForTimeout(150)
      continue
    }
    botWaitSince = Date.now()

    if (s.pending.id === lastId) {
      sameCount++
      if (sameCount === 4) await clickPass(page)
      if (sameCount >= 8) {
        milestones.stuck.push(`human stuck on ${s.pending.kind} at ${phaseKey}; legal=${s.legalTypes.join(',')}`)
        // last resort so the run can continue: try any option then pass
        await clickFirstOption(page, false)
        if (sameCount >= 12) break
      }
    } else {
      sameCount = 0
      lastId = s.pending.id
    }

    const fast = firstBattleRoundDone && milestones.boardClickMoves > 0 && milestones.figureTargets + milestones.listTargets > 0
    const movesBefore = milestones.boardClickMoves + milestones.listMoves
    const targetsBefore = milestones.figureTargets + milestones.listTargets
    await handleHuman(page, s, fast && sameCount < 2)

    if (!shotMove && milestones.boardClickMoves + milestones.listMoves > movesBefore) {
      shotMove = true
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'e2e-out/03-movement.png' })
    }
    if (!shotM8Shoot && milestones.figureTargets + milestones.listTargets > targetsBefore && s.phase === 'shooting') {
      shotM8Shoot = true
      // Short delay to let the director's TargetsDeclared handler spawn the tracer/impact vfx
      // (src/client/presentation/director.ts) before the shot's own ~0.2-0.6s lifetime elapses.
      await page.waitForTimeout(180)
      await page.screenshot({ path: 'e2e-out/m8-01-shooting.png' })
    }
    if (!shotShoot && milestones.figureTargets + milestones.listTargets > targetsBefore && s.phase === 'shooting') {
      shotShoot = true
      await page.waitForTimeout(900)
      await page.screenshot({ path: 'e2e-out/04-shooting.png' })
    }
    if (!shotClose && shotShoot) {
      shotClose = true
      const c = await snap(page)
      const sm = c.units.filter((u) => u.player === 'A' && u.loc === 'board' && u.models.length)
      const ork = c.units.filter((u) => u.player === 'B' && u.loc === 'board' && u.models.length)
      if (sm.length && ork.length) {
        let best = { d: Infinity, a: { x: 0, z: 0 }, b: { x: 0, z: 0 } }
        for (const a of sm) for (const b of ork) {
          const ca = centroid(a.models)
          const cb = centroid(b.models)
          const d = Math.hypot(ca.x - cb.x, ca.z - cb.z)
          if (d < best.d) best = { d, a: ca, b: cb }
        }
        const mid = { x: (best.a.x + best.b.x) / 2, z: (best.a.z + best.b.z) / 2 }
        const dist = Math.max(14, best.d * 1.1)
        await page.evaluate(([x, z, d]) => (window as any).__malletCamera?.lookAt(x, z, d), [mid.x, mid.z, dist])
        await page.waitForTimeout(1200)
        await page.screenshot({ path: 'e2e-out/05-closeup.png' })
        await page.evaluate(([d]) => (window as any).__malletCamera?.lookAt(0, 0, d), [START_DIST])
        cam = { tx: 0, tz: 0, d: START_DIST, polar: OVERVIEW_POLAR }
        await page.waitForTimeout(800)
      }
    }
    await page.waitForTimeout(60)
  }

  const final = await snap(page)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e-out/06-end-or-latest.png' })
  // M8: no fight phase reached this run — fall back to any action frame, per the polish checklist.
  if (!shotM8Melee) await page.screenshot({ path: 'e2e-out/m8-03-melee.png' })

  const summary = {
    elapsedS: Math.round((Date.now() - start) / 1000),
    final: { round: final.round, phase: final.phase, active: final.active, pending: final.pending?.kind, result: final.result },
    milestones: { ...milestones, humanPhases: [...milestones.humanPhases] },
    consoleErrors: [...new Set(consoleErrors)].slice(0, 30),
    log: log.slice(-120),
  }
  writeFileSync('e2e-out/play-log.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ ...summary, log: undefined }, null, 2))

  expect.soft(milestones.deployed, 'deployment finished').toBe(true)
  expect.soft(milestones.boardClickMoves + milestones.listMoves, 'human made a move').toBeGreaterThan(0)
  expect.soft(milestones.figureTargets + milestones.listTargets, 'human declared a shooting target').toBeGreaterThan(0)
  expect.soft(milestones.stuck, 'no stuck decisions').toEqual([])
})
