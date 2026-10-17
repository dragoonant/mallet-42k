import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { centroid, deployZoneCandidates, makeCam, screenshotRendered, snap, type Snap, type V2 } from './helpers'

// Phone playthrough (M11): one iPhone Pro landscape game against the Bot, driven only by taps on the
// visible compact UI (bottom sheet, unit chips, board taps, the TouchActionBar's Confirm, End phase). It
// deploys all three units and plays a full battle round: command, movement, shooting, charge, fight.
// A screenshot is written for every phase to e2e-out/mobile-play-<nn>-<phase>.png. Anything that needed
// a fallback (a suggested-placement option instead of a board tap, or a stalled prompt) is recorded in
// e2e-out/mobile-play-log.json as a possible phone blocker. window.__mallet is read-only here.

const LOAD_MS = 90_000
const BUDGET_MS = 9 * 60_000
const STALL_MS = 25_000
const POLL_MS = 120

interface Win { __malletProject: (x: number, y: number, z: number) => { x: number; y: number } }

async function project(page: Page, x: number, y: number, z: number) {
  return page.evaluate(([a, b, c]) => (window as unknown as Win).__malletProject(a, b, c), [x, y, z])
}

/** Tap a world point only when the canvas (not a HUD panel) is under that pixel. */
async function tapWorld(page: Page, x: number, y: number, z: number): Promise<boolean> {
  const p = await project(page, x, y, z)
  const vp = page.viewportSize()!
  if (p.x < 4 || p.y < 4 || p.x > vp.width - 4 || p.y > vp.height - 4) return false
  const tag = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName ?? null, [p.x, p.y])
  if (tag !== 'CANVAS') return false
  await page.mouse.click(p.x, p.y)
  return true
}

/** Phases the human's own turn has started so far (from the store's event log, so a phase that has nothing to decide still counts). */
async function humanStartedPhases(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const g = (window as unknown as { __mallet: { useGameStore: { getState(): { humanSeat: string; events: { type: string; turn: string; phase: string }[] } } } }).__mallet.useGameStore.getState()
    return [...new Set(g.events.filter((e) => e.type === 'PhaseStarted' && e.turn === g.humanSeat).map((e) => e.phase))]
  })
}

/** Wait until the camera stops easing: a probe point holds still across a few polls. */
async function settleView(page: Page, at: V2) {
  let last = ''
  let still = 0
  for (let i = 0; i < 40 && still < 3; i++) {
    await page.waitForTimeout(200)
    const p = await project(page, at.x, 0, at.z)
    const cur = `${Math.round(p.x)},${Math.round(p.y)}`
    still = cur === last ? still + 1 : 0
    last = cur
  }
}

async function visible(page: Page, id: string): Promise<boolean> {
  return page.getByTestId(id).isVisible().catch(() => false)
}

async function configure(page: Page) {
  await page.getByTestId('btn-tools-menu').click()
  await page.getByTestId('btn-settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  await page.getByTestId('settings-speed-instant').click()
  const diceOn = page.getByTestId('settings-dice-on')
  if (await diceOn.isChecked()) await diceOn.click()
  const ambientOn = page.getByTestId('settings-ambient-on')
  if (await ambientOn.isChecked()) await ambientOn.click()
  const mute = page.getByTestId('settings-mute')
  if (!(await mute.isChecked())) await mute.click()
  await page.getByTestId('settings-reroll-never').click()
  await page.getByTestId('drawer-settings-close').click()
  await expect(page.getByTestId('drawer-settings')).toBeHidden({ timeout: 10_000 })
}

/** Is a prompt button/option on screen and fully inside the viewport (a phone player could tap it)? */
async function tappable(page: Page, id: string): Promise<boolean> {
  const b = page.getByTestId(id)
  if (!(await b.isVisible().catch(() => false))) return false
  const box = await b.boundingBox()
  const vp = page.viewportSize()!
  return !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1
}

test('phone playthrough: deploy and play one full battle round with taps only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-pro', 'one phone form factor is enough for the playthrough')
  test.setTimeout(BUDGET_MS + 120_000)
  mkdirSync('e2e-out', { recursive: true })
  page.setDefaultTimeout(6_000) // a tap that cannot land is a finding, not a ten-minute wait
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })

  // ---- start a game against the Bot ----
  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible({ timeout: LOAD_MS })
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Space Marines', exact: true }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill('mobile-play-1')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: LOAD_MS })
  await page.waitForFunction(() => !!(window as unknown as { __mallet?: unknown }).__mallet && !!(window as unknown as Partial<Win>).__malletProject, undefined, { timeout: LOAD_MS })
  await page.waitForTimeout(2500)
  await configure(page)

  const cam = makeCam() // only used to sort the deployment candidates; real taps use __malletProject
  const notes: string[] = []
  const note = (s: string) => { notes.push(s); console.log(`[mobile-play] ${s}`) }
  const shots: string[] = []
  const seenPhases = new Set<string>()
  const humanPhases = new Set<string>()
  let shotNo = 0
  const shoot = async (label: string) => {
    shotNo++
    const f = `e2e-out/mobile-play-${String(shotNo).padStart(2, '0')}-${label}.png`
    await screenshotRendered(page, f)
    shots.push(f)
  }

  const start = Date.now()
  let lastId = ''
  let lastChange = start
  let moves = 0
  let usedShot = false
  let turnKey = ''
  let deployShot = false
  let reachedRound2 = false
  let stalled = 0

  while (Date.now() - start < BUDGET_MS) {
    const s = await snap(page)
    if (s.result || s.phase === 'ended') break
    if (s.round >= 2 && s.active === s.humanSeat) {
      reachedRound2 = true
      // keep playing until the human has met a charge and a fight decision (or round 4): the first round rarely brings contact
      if ((humanPhases.has('charge') && humanPhases.has('fight')) || s.round >= 4) break
    }
    const phaseKey = `${s.phase}`
    if (!seenPhases.has(phaseKey) && (s.pending || s.phase !== 'setup')) {
      seenPhases.add(phaseKey)
      await page.waitForTimeout(500)
      if (s.pending && s.pending.player === s.humanSeat) await shoot(s.phase)
    }
    if (!s.pending) { await page.waitForTimeout(POLL_MS); continue }
    if (s.pending.player === s.botSeat) { await page.waitForTimeout(POLL_MS); continue }

    const key = `${s.round}:${s.active}`
    if (key !== turnKey) { turnKey = key; moves = 0; usedShot = false }
    if (s.pending.id !== lastId) { lastId = s.pending.id; lastChange = Date.now(); stalled = 0 }
    else if (Date.now() - lastChange > STALL_MS) {
      stalled++
      lastChange = Date.now()
      note(`BLOCKER? ${s.phase}/${s.pending.kind} did not advance for ${STALL_MS / 1000}s (try ${stalled}); prompt visible=${await visible(page, 'prompt')}`)
      await shoot(`stall-${s.phase}`)
      if (stalled >= 3) break
    }
    humanPhases.add(s.phase)

    const p = s.pending
    if (p.kind === 'deployUnit') {
      await deploy(page, s, cam, note)
      if (!deployShot && (await snap(page)).units.some((u) => u.player === s.humanSeat && u.loc === 'board')) {
        deployShot = true
        await shoot('deployed-first')
      }
      continue
    }
    if (p.kind === 'moveUnit' && s.phase === 'movement' && moves < 3) {
      moves++
      if (await stageAndConfirmMove(page, s, note)) continue
      note('FALLBACK movement: no board tap could stage a move; used the suggested list instead')
    }
    if (p.kind === 'declareTargets' && !usedShot) {
      if (await shootViaTaps(page, s, note)) { usedShot = true; continue }
      usedShot = true
      note('FALLBACK shooting: no tap on an enemy opened the weapon panel; used Choose weapons / Pass')
    }
    await answerOther(page, s, note)
  }

  await page.waitForTimeout(500)
  await shoot('end')
  const final = await snap(page)
  writeFileSync('e2e-out/mobile-play-log.json', JSON.stringify({ final: { round: final.round, phase: final.phase, active: final.active }, seenPhases: [...seenPhases], humanPhases: [...humanPhases], notes, shots, errors: [...new Set(errors)] }, null, 2))
  console.log(JSON.stringify({ round: final.round, seen: [...seenPhases], human: [...humanPhases] }))

  expect(errors, 'no console errors').toEqual([])
  expect(notes.filter((n) => n.startsWith('BLOCKER?')), 'no prompt stalled').toEqual([])
  const mine = final.units.filter((u) => u.player === final.humanSeat)
  expect(mine.filter((u) => u.loc !== 'board' && u.loc !== 'reserves'), 'every unit deployed').toEqual([])
  const started = await humanStartedPhases(page)
  for (const ph of ['command', 'movement', 'shooting', 'charge', 'fight']) expect(started.includes(ph), `the human's ${ph} phase started`).toBe(true)
  expect(reachedRound2 || !!final.result || final.round >= 2, 'a full round was played').toBe(true)
})

async function deploy(page: Page, s: Snap, cam: ReturnType<typeof makeCam>, note: (s: string) => void) {
  const p = s.pending!
  const uid: string = p.context.unitIds[0]
  const name = s.units.find((u) => u.id === uid)?.name ?? uid
  const chip = page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
  if (await chip.isVisible().catch(() => false)) await chip.click()
  else note(`deploy: unit chip for ${name} not visible`)
  const zone: V2[] = p.context.zone
  await settleView(page, centroid(zone))
  const taken = s.units.filter((u) => u.player === p.player && u.loc === 'board').length
  const pts = deployZoneCandidates(zone, s.pieces, taken, cam, 852, 393)
  for (const pt of pts) {
    if (await visible(page, 'touch-cancel')) await page.getByTestId('touch-cancel').click()
    if (!(await tapWorld(page, pt.x, 0.1, pt.z))) continue
    await page.waitForTimeout(150)
    const ok = page.getByTestId('touch-confirm')
    if (!(await ok.isVisible().catch(() => false)) || !(await ok.isEnabled().catch(() => false))) continue
    await ok.click()
    await page.waitForTimeout(250)
    if ((await snap(page)).pending?.id !== p.id) return
  }
  if (await visible(page, 'touch-cancel')) await page.getByTestId('touch-cancel').click()
  note(`BLOCKER? deploy ${name}: no tapped spot in the zone was accepted; fell back to Reserves/Pass`)
  const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
  if (await res.isVisible().catch(() => false)) { await res.click(); return }
  await answerOther(page, s, note)
}

async function stageAndConfirmMove(page: Page, s: Snap, note: (s: string) => void): Promise<boolean> {
  const p = s.pending!
  const u = s.units.find((x) => x.id === p.context.unitId)
  const enemy = s.units.filter((e) => e.player !== p.player && e.loc === 'board' && e.models.length)
  if (!u || !enemy.length) return false
  const a = centroid(u.models)
  const t = enemy.map((e) => centroid(e.models)).sort((q, r) => Math.hypot(q.x - a.x, q.z - a.z) - Math.hypot(r.x - a.x, r.z - a.z))[0]
  const base = Math.atan2(t.z - a.z, t.x - a.x)
  const max = p.constraints?.maxDistance ?? 6
  for (const frac of [0.7, 0.4]) {
    for (const da of [0, 0.5, -0.5, 1.0, -1.0]) {
      const d = Math.max(1, max * frac)
      if (await visible(page, 'touch-cancel')) await page.getByTestId('touch-cancel').click()
      if (!(await tapWorld(page, a.x + Math.cos(base + da) * d, 0.1, a.z + Math.sin(base + da) * d))) continue
      await page.waitForTimeout(200)
      const ok = page.getByTestId('touch-confirm')
      if (!(await ok.isVisible().catch(() => false)) || !(await ok.isEnabled().catch(() => false))) continue
      await screenshotRendered(page, 'e2e-out/mobile-play-staged-move.png')
      await ok.click()
      await page.waitForTimeout(250)
      if ((await snap(page)).pending?.id !== p.id) return true
    }
  }
  if (await visible(page, 'touch-cancel')) await page.getByTestId('touch-cancel').click()
  note('FALLBACK movement: board-tap move rejected at every candidate')
  return false
}

async function shootViaTaps(page: Page, s: Snap, note: (s: string) => void): Promise<boolean> {
  const p = s.pending!
  const id = p.id
  const fire = async () => {
    if (!(await tappable(page, 'btn-fire')) || !(await page.getByTestId('btn-fire').isEnabled().catch(() => false))) return false
    await page.getByTestId('btn-fire').click()
    await page.waitForTimeout(250)
    return (await snap(page)).pending?.id !== id
  }
  if (await fire()) return true
  const targets = new Set<string>()
  for (const w of p.context.weapons ?? []) for (const t of w.legalTargets) targets.add(t)
  for (const tid of targets) {
    const tu = s.units.find((x) => x.id === tid)
    for (const m of (tu?.models ?? []).slice(0, 4)) {
      if (!(await tapWorld(page, m.x, 0.6, m.z))) continue
      const opened = await page.getByTestId('weapon-panel').waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)
      if (opened) {
        await page.waitForTimeout(300)
        await screenshotRendered(page, 'e2e-out/mobile-play-weapon-panel.png')
        if (await fire()) return true
        break
      }
    }
  }
  // the sheet's own route: Choose weapons...
  if (await tappable(page, 'btn-choose-weapons')) {
    await page.getByTestId('btn-choose-weapons').click()
    await page.waitForTimeout(300)
    if (await fire()) return true
  }
  note('FALLBACK shooting: could not reach Fire from taps alone')
  return false
}

async function answerOther(page: Page, s: Snap, note: (s: string) => void) {
  const p = s.pending!
  // 1. the armed-option second step ("Choose: ...") if a suggested option is already armed
  if (await tappable(page, 'btn-armed-choose')) { await page.getByTestId('btn-armed-choose').click(); await page.waitForTimeout(150); return }
  // 2. a re-roll offer: Keep
  if (await tappable(page, 'reroll-keep')) { await page.getByTestId('reroll-keep').click(); return }
  // 3. a weapon panel left open: Fire nothing / cancel
  if (await tappable(page, 'btn-fire-nothing')) { await page.getByTestId('btn-fire-nothing').click(); return }
  // 4. a staged draft: confirm it if it is allowed, else cancel it
  if (await visible(page, 'touch-confirm')) {
    const ok = page.getByTestId('touch-confirm')
    if (await ok.isEnabled().catch(() => false)) { await ok.click(); return }
    await page.getByTestId('touch-cancel').click()
  }
  if (p.kind === 'pileIn' || p.kind === 'consolidate') {
    if (await tappable(page, 'btn-auto-approach')) { await page.getByTestId('btn-auto-approach').click(); await page.waitForTimeout(200); if (await visible(page, 'touch-confirm') && await page.getByTestId('touch-confirm').isEnabled()) { await page.getByTestId('touch-confirm').click(); return } }
  }
  // 5. suggested options (tap, then tap again / Choose)
  if (p.kind !== 'commandReroll' && p.kind !== 'stratagemWindow' && p.kind !== 'reactionWindow') {
    const opts = page.locator('[data-testid^="prompt-option-"]')
    const n = await opts.count()
    for (let i = 0; i < n; i++) {
      const o = opts.nth(i)
      if (!(await o.isVisible().catch(() => false))) continue
      const text = ((await o.textContent()) ?? '').trim()
      if (/^Pass$/.test(text)) continue
      await o.click()
      await page.waitForTimeout(150)
      if (await tappable(page, 'btn-armed-choose')) await page.getByTestId('btn-armed-choose').click()
      return
    }
  }
  // 5b. the sheet folded itself away: unfold it with its own toggle, like a player would
  const sheet = page.getByTestId('prompt')
  if ((await sheet.getAttribute('data-collapsed').catch(() => null)) === 'true' && (await tappable(page, 'prompt-sheet-toggle'))) {
    await page.getByTestId('prompt-sheet-toggle').click()
    await page.waitForTimeout(250)
    return
  }
  // 6. Pass from the sheet, then the top bar's End phase
  for (const id of ['btn-pass', 'btn-end-phase']) {
    if (await tappable(page, id) && (await page.getByTestId(id).isEnabled().catch(() => false))) { await page.getByTestId(id).click(); return }
  }
  note(`BLOCKER? nothing tappable to answer ${p.kind} in ${s.phase}`)
  await page.waitForTimeout(500)
}

// Shooting in contact: the open-play game above rarely has a target in range in round 1, so this opens the
// weapon-select scenario (two enemy units 8" away) and shoots it with taps only: enemy -> weapon panel -> Fire.
test('phone playthrough: tap an enemy, see the weapon panel, Fire', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-pro', 'one phone form factor is enough for the playthrough')
  test.setTimeout(180_000)
  mkdirSync('e2e-out', { recursive: true })
  page.setDefaultTimeout(8_000)
  await page.goto('./?scenario=weapon-select-mixed')
  await expect(page.getByTestId('shoot-context')).toBeVisible({ timeout: LOAD_MS })
  await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__malletProject, undefined, { timeout: LOAD_MS })
  await page.waitForTimeout(2000)
  const s = await snap(page)
  const targets = new Set<string>()
  for (const w of s.pending!.context.weapons ?? []) for (const t of w.legalTargets) targets.add(t)
  let opened = false
  for (const tid of targets) {
    for (const m of (s.units.find((u) => u.id === tid)?.models ?? []).slice(0, 5)) {
      if (!(await tapWorld(page, m.x, 0.6, m.z))) continue
      opened = await page.getByTestId('weapon-panel').waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
      if (opened) break
    }
    if (opened) break
  }
  expect(opened, 'tapping an enemy opens the weapon panel').toBe(true)
  await page.waitForTimeout(400)
  await screenshotRendered(page, 'e2e-out/mobile-play-shoot-panel.png')
  const fire = page.getByTestId('btn-fire')
  expect(await tappable(page, 'btn-fire'), 'Fire is fully on screen').toBe(true)
  const box = (await fire.boundingBox())!
  expect(box.height, 'Fire is a touch target').toBeGreaterThanOrEqual(43.5)
  await fire.click()
  await expect.poll(async () => (await snap(page)).pending?.id !== s.pending!.id, { timeout: 15_000 }).toBe(true)
})
