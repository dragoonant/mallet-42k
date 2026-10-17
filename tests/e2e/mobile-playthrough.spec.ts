import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { centroid, deployZoneCandidates, makeCam, screenshotRendered, snap, type Snap, type V2 } from './helpers'

// Runs on iphone-pro (WebKit: board taps are mouse clicks, the only pointer WebKit's automation can send) and on
// pixel (Chromium: board taps and the Confirm button are real CDP touch events, pointerType 'touch').
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
  await tapAt(page, p.x, p.y)
  return true
}

// One finger tap at a pixel: a real CDP touch on the pixel project, a mouse click on WebKit.
let cdp: CDPSession | null = null
let touchMode = false
async function tapAt(page: Page, x: number, y: number) {
  if (!touchMode) return page.mouse.click(x, y)
  cdp ??= await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  await page.waitForTimeout(70)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
async function tapEl(page: Page, id: string) {
  const box = await page.getByTestId(id).boundingBox()
  if (!box) throw new Error(`no box for ${id}`)
  await tapAt(page, box.x + box.width / 2, box.y + box.height / 2)
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
  test.skip(testInfo.project.name !== 'iphone-pro' && testInfo.project.name !== 'pixel', 'iphone-pro (mouse taps) and pixel (CDP touch) are the two phone paths')
  const tag = testInfo.project.name === 'pixel' ? 'pixel-' : ''
  touchMode = testInfo.project.name === 'pixel'
  cdp = null
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
    const f = `e2e-out/mobile-play-${tag}${String(shotNo).padStart(2, '0')}-${label}.png`
    await screenshotRendered(page, f)
    shots.push(f)
  }

  const start = Date.now()
  let lastId = ''
  let lastChange = start
  let moves = 0
  let boardMoves = 0
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
      if (await stageAndConfirmMove(page, s, note)) { boardMoves++; continue }
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
  writeFileSync(`e2e-out/mobile-play-${tag}log.json`, JSON.stringify({ final: { round: final.round, phase: final.phase, active: final.active }, seenPhases: [...seenPhases], humanPhases: [...humanPhases], notes, shots, errors: [...new Set(errors)] }, null, 2))
  console.log(JSON.stringify({ round: final.round, seen: [...seenPhases], human: [...humanPhases] }))

  expect(errors, 'no console errors').toEqual([])
  expect(notes.filter((n) => n.startsWith('BLOCKER?')), 'no prompt stalled / no movement fallback').toEqual([])
  expect(boardMoves, 'at least one move staged and confirmed by tapping the board').toBeGreaterThanOrEqual(1)
  const mine = final.units.filter((u) => u.player === final.humanSeat)
  expect(mine.filter((u) => u.loc !== 'board' && u.loc !== 'reserves' && u.loc !== 'destroyed'), 'every unit deployed').toEqual([])
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
  const vp = page.viewportSize()!
  const pts = deployZoneCandidates(zone, s.pieces, taken, cam, vp.width, vp.height)
  for (const pt of pts) {
    if (await visible(page, 'touch-cancel')) await page.getByTestId('touch-cancel').click()
    if (!(await tapWorld(page, pt.x, 0.1, pt.z))) continue
    await page.waitForTimeout(150)
    const ok = page.getByTestId('touch-confirm')
    if (!(await ok.isVisible().catch(() => false)) || !(await ok.isEnabled().catch(() => false))) continue
    await (touchMode ? tapEl(page, 'touch-confirm') : ok.click())
    await page.waitForTimeout(250)
    if ((await snap(page)).pending?.id !== p.id) return
  }
  if (await visible(page, 'touch-cancel')) await page.getByTestId('touch-cancel').click()
  note(`BLOCKER? deploy ${name}: no tapped spot in the zone was accepted; fell back to Reserves/Pass`)
  const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
  if (await res.isVisible().catch(() => false)) { await res.click(); return }
  await answerOther(page, s, note)
}

/** Legal destinations for the pending move (the engine's own candidate placements, from the store's legal list). */
async function legalDestinations(page: Page, unitId: string): Promise<V2[]> {
  return page.evaluate((uid) => {
    const g = (window as unknown as { __mallet: { useGameStore: { getState(): { legal: { type: string; unitId?: string; placements?: { pos: { x: number; z: number } }[] }[] | null } } } }).__mallet.useGameStore.getState()
    const out: V2[] = []
    for (const a of g.legal ?? []) {
      if (a.type !== 'moveUnit' || a.unitId !== uid || !a.placements?.length) continue
      out.push({ x: a.placements.reduce((t, q) => t + q.pos.x, 0) / a.placements.length, z: a.placements.reduce((t, q) => t + q.pos.z, 0) / a.placements.length })
    }
    return out
  }, unitId)
}

/** Aim the camera so `target` lands on open board (not under the sheet, formation strip or camera column). Returns its pixel, or null. */
async function frameFor(page: Page, target: V2, start: V2): Promise<{ x: number; y: number } | null> {
  return page.evaluate(({ target, start }) => {
    const w = window as unknown as { __malletCamera: { lookAt(x: number, z: number, d: number): void }; __malletProject: (x: number, y: number, z: number) => { x: number; y: number } }
    const W = window.innerWidth
    const H = window.innerHeight
    const open = (p: { x: number; y: number }) => {
      if (p.x < 50 || p.x > W - 120 || p.y < 70 || p.y > H - 40) return false
      const el = document.elementFromPoint(p.x, p.y)
      return !el || el.tagName === 'CANVAS'
    }
    const mx = (target.x + start.x) / 2
    const mz = (target.z + start.z) / 2
    for (const dist of [18, 24, 14]) {
      for (const r of [0, 3, 6, 9]) {
        for (let i = 0; i < (r ? 12 : 1); i++) {
          w.__malletCamera.lookAt(mx + Math.cos((i / 12) * Math.PI * 2) * r, mz + Math.sin((i / 12) * Math.PI * 2) * r, dist)
          const p = w.__malletProject(target.x, 0.1, target.z)
          const s0 = w.__malletProject(start.x, 0.1, start.z)
          if (open(p) && s0.x > 0 && s0.x < W && s0.y > 0 && s0.y < H) return p
        }
      }
    }
    return null
  }, { target, start })
}

async function stageAndConfirmMove(page: Page, s: Snap, note: (s: string) => void): Promise<boolean> {
  const p = s.pending!
  const u = s.units.find((x) => x.id === p.context.unitId)
  if (!u || !u.models.length) return false
  const a = centroid(u.models)
  const max = p.constraints?.maxDistance ?? 6
  // the engine's own legal destinations first (farthest first), then a ring of guesses
  const cands = (await legalDestinations(page, u.id)).filter((c) => Math.hypot(c.x - a.x, c.z - a.z) > 1).sort((q, r) => Math.hypot(r.x - a.x, r.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))
  for (const frac of [0.8, 0.5]) for (let i = 0; i < 8; i++) cands.push({ x: a.x + Math.cos((i / 8) * Math.PI * 2) * max * frac, z: a.z + Math.sin((i / 8) * Math.PI * 2) * max * frac })
  const log: string[] = []
  for (const c of cands.slice(0, 12)) {
    if (await visible(page, 'touch-cancel')) await tapEl(page, 'touch-cancel')
    const px = await frameFor(page, c, a)
    if (!px) { log.push(`(${c.x.toFixed(1)},${c.z.toFixed(1)}) no open pixel`); continue }
    await page.waitForTimeout(300)
    const px2 = await project(page, c.x, 0.1, c.z)
    if (!(await tapWorld(page, c.x, 0.1, c.z))) { log.push(`(${c.x.toFixed(1)},${c.z.toFixed(1)}) pixel ${Math.round(px2.x)},${Math.round(px2.y)} not canvas`); continue }
    await page.waitForTimeout(300)
    const staged = await page.evaluate(() => {
      const d = (window as unknown as { __mallet: { useUiStore: { getState(): { draft: { anchor: { x: number; z: number } } | null } } } }).__mallet.useUiStore.getState().draft
      return d ? { x: d.anchor.x, z: d.anchor.z } : null
    })
    const moved = staged ? Math.hypot(staged.x - a.x, staged.z - a.z) : -1
    const ok = page.getByTestId('touch-confirm')
    const enabled = (await ok.isVisible().catch(() => false)) && (await ok.isEnabled().catch(() => false))
    if (!staged || moved < 0.5 || !enabled) {
      const why = (await page.getByTestId('touch-reason').textContent().catch(() => null)) ?? 'none'
      log.push(`(${c.x.toFixed(1)},${c.z.toFixed(1)}) staged=${staged ? moved.toFixed(1) : 'no'} confirm=${enabled} reason=${why}`)
      continue
    }
    await screenshotRendered(page, `e2e-out/mobile-play-${touchMode ? 'pixel-' : ''}staged-move.png`)
    await tapEl(page, 'touch-confirm')
    await page.waitForTimeout(400)
    if ((await snap(page)).pending?.id !== p.id) return true
    log.push(`(${c.x.toFixed(1)},${c.z.toFixed(1)}) Confirm did not advance the decision (toast: ${(await snap(page)).toast})`)
  }
  if (await visible(page, 'touch-cancel')) await tapEl(page, 'touch-cancel')
  note(`BLOCKER? movement: no board tap staged and confirmed a move for ${u.name}: ${log.join(' | ')}`)
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
