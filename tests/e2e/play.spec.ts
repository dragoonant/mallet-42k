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

/** Try to answer a board-placement decision by clicking the board then Confirm. */
async function tryBoardPlacement(page: Page, s: Snap, points: V2[], label: string): Promise<boolean> {
  const id = s.pending!.id
  for (const p of points) {
    await clearToast(page)
    const ok = await clickCanvasAt(page, project({ x: p.x, y: 0, z: p.z }), label)
    if (!ok) continue
    await page.waitForTimeout(120)
    const confirm = page.getByTestId('btn-confirm')
    if (!(await confirm.isVisible().catch(() => false))) continue
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
      const xs = zone.map((q) => q.x)
      const zs = zone.map((q) => q.z)
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2
      const taken = s.units.filter((u) => u.player === me && u.loc === 'board').length
      const cands: V2[] = []
      for (const dz of [0, -1, 1]) for (const x of [-15, 0, 15, -8, 8, -19, 19]) cands.push({ x: x + ((taken * 3) % 5) - 2, z: cz + dz })
      const inside = cands.filter((c) => c.x > Math.min(...xs) + 2 && c.x < Math.max(...xs) - 2)
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
