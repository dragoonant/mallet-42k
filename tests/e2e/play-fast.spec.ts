import { expect, test, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import {
  centroid, clickCanvasAt, clickFirstOption, clickPass, deployZoneCandidates, makeCam, project, promptButton, snap,
  startGameVsBot, tryBoardPlacement, type Cam, type Snap, type V2,
} from './helpers'

// Fast full-game playtest (replaces the old tests/e2e/play.spec.ts, which took 10+ minutes and never
// actually finished a game). Same "real UI only" contract as every other spec here — window.__mallet is
// read-only, every game action is a real click — but tuned to actually reach a GameResult inside an 8
// minute budget: Settings are pushed to Instant/no-dice/muted/reroll-Never right after game start (see
// configureSettings below), deployment still drives every unit through a real board click (formation
// defaults, falling back to Reserves/Pass — see helpers.ts's tryBoardPlacement), but movement/shooting
// only spend a real board click on the FIRST move and FIRST shooting target of each human turn; every
// other decision (including every one the reroll-Never setting doesn't already auto-skip — see
// src/client/store/game.ts's commandRerollMatters) takes the fastest available answer: the prompt's own
// suggested-placement/option list, or Pass.

const W = 1600
const H = 900
const GAME_BUDGET_MS = 8 * 60_000
const STALL_LIMIT_MS = 15_000
const POLL_MS = 100

/** Push Settings to the fast/quiet configuration this spec needs, entirely through the real UI (Hud.tsx's
 *  gear button -> SettingsPanel.tsx): animation speed Instant, dice animation off, all audio muted (which
 *  covers "ambient off" too), and the Command Re-roll setting per `reroll` (src/client/presentation/
 *  settings.ts's CommandRerollSetting — 'onlyWhenItMatters' is the app default, so a 'never' or 'always'
 *  caller must actually flip it here). */
async function configureSettings(page: Page, reroll: 'always' | 'onlyWhenItMatters' | 'never'): Promise<void> {
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('settings-speed-instant').click()
  const diceOn = page.getByTestId('settings-dice-on')
  if (await diceOn.isChecked()) await diceOn.click()
  const ambientOn = page.getByTestId('settings-ambient-on')
  if (await ambientOn.isChecked()) await ambientOn.click()
  const muteAll = page.getByTestId('settings-mute')
  if (!(await muteAll.isChecked())) await muteAll.click()
  await page.getByTestId(`settings-reroll-${reroll}`).click()
  await page.getByTestId('btn-settings').click() // close the popover so it can't cover board clicks
}

// ---------- deployment (every unit: real board click, formation defaults, Reserves/Pass fallback) ----------
async function handleDeploy(page: Page, s: Snap, cam: Cam): Promise<void> {
  const p = s.pending!
  const me = p.player
  const uid: string = p.context.unitIds[0]
  const name = s.units.find((u) => u.id === uid)?.name ?? uid
  const chip = await promptButton(page, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  if (chip) await chip.click()
  const zone: V2[] = p.context.zone
  const taken = s.units.filter((u) => u.player === me && u.loc === 'board').length
  const points = deployZoneCandidates(zone, s.pieces, taken, cam, W, H)
  if (chip && (await tryBoardPlacement(page, s, points, cam, W, H, name))) return
  const res = await promptButton(page, /^Reserves:/)
  if (res) { await res.click(); return }
  await clickPass(page)
}

interface TurnState { key: string; usedMove: boolean; usedShot: boolean }

/** Answers everything but deployment. Spends a real board click on the first moveUnit and first
 *  declareTargets decision of each human turn (tracked by `turn`, keyed on round+activePlayer — reset by
 *  the caller whenever that key changes); every other decision (including a second/third move or target
 *  that same turn) takes the fastest legal answer: a suggested option from the prompt's own list, or
 *  Pass. commandReroll/stratagemWindow/reactionWindow just Pass — with the reroll setting at 'never' a
 *  human commandReroll should already be auto-answered by the store before it ever reaches here (see
 *  src/client/store/game.ts's maybeAutoSkipCommandReroll), so reaching this case at all is itself
 *  informative and is left to Pass rather than special-cased away. */
async function handlePlay(page: Page, s: Snap, cam: Cam, turn: TurnState): Promise<{ moved: boolean; shot: boolean }> {
  const p = s.pending!
  const enemy = s.units.filter((u) => u.player !== p.player && u.loc === 'board' && u.models.length)

  if (p.kind === 'moveUnit' && s.phase === 'movement' && !turn.usedMove) {
    const u = s.units.find((x) => x.id === p.context.unitId)
    if (u && enemy.length) {
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
      if (await tryBoardPlacement(page, s, pts, cam, W, H, `move ${u.name}`)) return { moved: true, shot: false }
    }
  }
  if (p.kind === 'declareTargets' && !turn.usedShot) {
    const ts = new Set<string>()
    for (const w of p.context.weapons ?? []) for (const t of w.legalTargets) ts.add(t)
    const tid = [...ts][0]
    const tu = s.units.find((x) => x.id === tid)
    if (tu?.models[0]) {
      const m = tu.models[0]
      const before = s.pending!.id
      if (await clickCanvasAt(page, project({ x: m.x, y: 0.5, z: m.z }, cam, W, H), W, H)) {
        await page.waitForTimeout(150)
        const after = await snap(page)
        if (after.pending?.id !== before) return { moved: false, shot: true }
      }
    }
  }

  switch (p.kind) {
    case 'declareTargets': {
      const b = await promptButton(page, /^Target /)
      if (b) { await b.click(); return { moved: false, shot: false } }
      await clickFirstOption(page, false)
      return { moved: false, shot: false }
    }
    case 'commandReroll':
    case 'stratagemWindow':
    case 'reactionWindow':
      if (!(await clickPass(page))) await clickFirstOption(page, false)
      return { moved: false, shot: false }
    default:
      if (!(await clickFirstOption(page))) await clickPass(page)
      return { moved: false, shot: false }
  }
}

interface PhaseTimings { [phase: string]: number }

test('play a full game fast: Space Marines vs Bot reaches a GameResult within 8 minutes', async ({ page }) => {
  test.setTimeout(9.5 * 60_000)
  mkdirSync('e2e-out', { recursive: true })
  await page.setViewportSize({ width: W, height: H })
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`))

  await startGameVsBot(page, 'play-fast-1')
  await page.waitForTimeout(200) // camera/first-frame settle — well under the 250ms fixed-sleep budget
  await configureSettings(page, 'never')

  const cam = makeCam()
  const milestones = { deployed: false, moves: 0, shots: 0, stuck: [] as string[] }
  const phaseMs: PhaseTimings = {}
  let lastPhase: string | null = null
  let lastPhaseAt = Date.now()
  const closePhase = (now: number) => {
    if (lastPhase) phaseMs[lastPhase] = (phaseMs[lastPhase] ?? 0) + (now - lastPhaseAt)
  }

  const start = Date.now()
  let lastPendingId = ''
  let lastChangeAt = start
  let turn: TurnState = { key: '', usedMove: false, usedShot: false }
  let reachedEnd = false

  while (Date.now() - start < GAME_BUDGET_MS) {
    const s = await snap(page)
    const now = Date.now()
    if (s.phase !== lastPhase) {
      closePhase(now)
      lastPhase = s.phase
      lastPhaseAt = now
    }

    if (s.result || s.phase === 'ended') { reachedEnd = true; break }

    if (!s.pending) {
      await page.waitForTimeout(POLL_MS)
      continue
    }

    const turnKey = `${s.round}:${s.active}`
    if (turnKey !== turn.key) turn = { key: turnKey, usedMove: false, usedShot: false }
    if (!milestones.deployed && s.phase !== 'setup' && s.phase !== 'deployment') milestones.deployed = true

    if (s.pending.id !== lastPendingId) {
      lastPendingId = s.pending.id
      lastChangeAt = now
    } else if (now - lastChangeAt > STALL_LIMIT_MS) {
      const isHumanTurn = s.pending.player === s.humanSeat
      const promptVisible = isHumanTurn && (await page.getByTestId('prompt').isVisible().catch(() => false))
      if (isHumanTurn && promptVisible) {
        lastChangeAt = now // waiting on our own next loop iteration to click it — not a stall
      } else {
        milestones.stuck.push(`decision ${s.pending.id} (${s.pending.kind}, player ${s.pending.player}) did not advance for >${STALL_LIMIT_MS}ms`)
        break
      }
    }

    if (s.pending.player === s.botSeat) {
      await page.waitForTimeout(POLL_MS)
      continue
    }

    if (s.pending.kind === 'deployUnit') {
      await handleDeploy(page, s, cam)
    } else {
      const { moved, shot } = await handlePlay(page, s, cam, turn)
      if (moved) { turn.usedMove = true; milestones.moves++ }
      if (shot) { turn.usedShot = true; milestones.shots++ }
    }
  }

  const now = Date.now()
  closePhase(now)

  const final = await snap(page)
  await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 10_000 }).catch(() => {})
  await page.screenshot({ path: 'e2e-out/play-fast-end.png' })

  const summary = {
    elapsedS: Math.round((now - start) / 1000),
    reachedEnd,
    final: { round: final.round, phase: final.phase, active: final.active, result: final.result },
    milestones,
    phaseMsTotals: phaseMs,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 30),
  }
  writeFileSync('e2e-out/play-fast-log.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))

  expect(consoleErrors, 'no console errors').toEqual([])
  expect(milestones.stuck, 'no decision stalled >15s without a visible human prompt').toEqual([])
  expect(milestones.deployed, 'deployment finished').toBe(true)
  expect(reachedEnd, `game reached a GameResult within ${GAME_BUDGET_MS / 60_000} minutes`).toBe(true)
  expect(final.result, 'final state carries a GameResult').toBeTruthy()
})

// ---------- Command Re-roll setting: quick sanity check that the store actually honours it ----------
// Reuses the same handleDeploy/handlePlay as the full-game test above (real deploy clicks, one real move
// + one real shooting target per human turn) rather than a bare Pass loop — round 1 in Combat Patrol's
// short-ranged missions usually gets the human into Shooting (or at least an Advance roll), which is
// exactly what's needed to give the "Always" check below a real hit/wound/save/advance roll to offer a
// reroll on; a Pass-only drive risks never rolling anything re-rollable at all.
async function driveRound1(page: Page, cam: Cam, budgetMs: number, onPending: (s: Snap) => void): Promise<Snap> {
  const start = Date.now()
  let s = await snap(page)
  let turn: TurnState = { key: '', usedMove: false, usedShot: false }
  while (Date.now() - start < budgetMs && s.round <= 1 && !s.result && s.phase !== 'ended') {
    if (!s.pending) {
      await page.waitForTimeout(POLL_MS)
      s = await snap(page)
      continue
    }
    onPending(s)
    const turnKey = `${s.round}:${s.active}`
    if (turnKey !== turn.key) turn = { key: turnKey, usedMove: false, usedShot: false }
    if (s.pending.player === s.botSeat) {
      await page.waitForTimeout(POLL_MS)
    } else if (s.pending.kind === 'deployUnit') {
      await handleDeploy(page, s, cam)
    } else {
      const { moved, shot } = await handlePlay(page, s, cam, turn)
      if (moved) turn.usedMove = true
      if (shot) turn.usedShot = true
    }
    s = await snap(page)
  }
  return s
}

test('Command Re-roll setting "Always": a human reroll prompt appears at least once in round 1', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  await page.setViewportSize({ width: W, height: H })
  await startGameVsBot(page, 'reroll-always-1')
  await page.waitForTimeout(200)
  await configureSettings(page, 'always')
  const cam = makeCam()
  let sawHumanCommandReroll = false
  const final = await driveRound1(page, cam, 3 * 60_000, (s) => {
    if (s.pending?.kind === 'commandReroll' && s.pending.player === s.humanSeat) sawHumanCommandReroll = true
  })
  console.log(`[reroll-always] round reached=${final.round} sawHumanCommandReroll=${sawHumanCommandReroll}`)
  expect(sawHumanCommandReroll, 'a human commandReroll prompt appeared at least once with the "Always" setting').toBe(true)
})

test('Command Re-roll setting "Never": no human reroll prompt appears and the game proceeds', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  await page.setViewportSize({ width: W, height: H })
  await startGameVsBot(page, 'reroll-never-1')
  await page.waitForTimeout(200)
  await configureSettings(page, 'never')
  const cam = makeCam()
  let sawHumanCommandReroll = false
  const final = await driveRound1(page, cam, 3 * 60_000, (s) => {
    if (s.pending?.kind === 'commandReroll' && s.pending.player === s.humanSeat) sawHumanCommandReroll = true
  })
  console.log(`[reroll-never] round reached=${final.round} sawHumanCommandReroll=${sawHumanCommandReroll}`)
  expect(sawHumanCommandReroll, 'no human commandReroll prompt should appear with the "Never" setting').toBe(false)
  expect(final.round, 'the game kept proceeding (round advanced past 1, or ended)').toBeGreaterThan(1)
})
