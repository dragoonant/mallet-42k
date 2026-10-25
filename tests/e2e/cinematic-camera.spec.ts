import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { clickPass, deployZoneCandidates, makeCam, snap, tryBoardPlacement, type Cam, type V2 } from './helpers'

// Cinematic camera (src/client/presentation/{director,shotCamera,deployCamera,framing}.ts, board/cameraApi.ts) in the real app,
// at the default 'normal' animation speed, against the bot.
//  (i)   bot deployment: the camera flies to each unit the bot sets up, holds, and comes back to the player's view
//  (ii)  a volley (the human's, from the weapon-select scenario): shoulder view behind the whole firing unit, a close-up of the
//        target when its first damaging shot lands, then back to the prior view
//  (iii) with the setting off (toggled through the Settings panel), the same volley never moves the camera
// The exact camera pose is read from window.__malletCameraView() (board/CameraRig.tsx, read-only).

const W = 1600
const H = 900
const SHOTS = 'test-results/camera'

type V3 = [number, number, number]
interface Sample { t: number; p: V3; tg: V3 }
interface PageWin {
  __malletCameraView?: () => { position: V3; target: V3 } | null
  __mallet: { useGameStore: { getState(): { state: { units: Record<string, { player: string; location: string; models: string[] }>; models: Record<string, { pos: { x: number; z: number } }> }; botSeat: string | null; events: { type: string }[] } } }
  __camSamples?: Sample[]
  __botUnits?: Record<string, { t: number; x: number; z: number }>
}

const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const getView = (page: Page) => page.evaluate(() => { const v = (window as unknown as PageWin).__malletCameraView?.(); return v ? { p: v.position, tg: v.target } : null })

/** Records the camera pose every 40ms, and when each bot unit first shows on the board. */
async function installSampler(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as PageWin
    w.__camSamples = []
    w.__botUnits = {}
    setInterval(() => {
      const v = w.__malletCameraView?.()
      if (v) w.__camSamples!.push({ t: performance.now(), p: [...v.position] as V3, tg: [...v.target] as V3 })
      const g = w.__mallet.useGameStore.getState()
      if (!g.state || !g.botSeat) return
      for (const u of Object.values(g.state.units)) {
        if (u.player !== g.botSeat || u.location !== 'board') continue
        const id = u.models.join(',')
        if (w.__botUnits![id]) continue
        const pts = u.models.map((m) => g.state.models[m]?.pos).filter(Boolean)
        if (!pts.length) continue
        w.__botUnits![id] = { t: performance.now(), x: pts.reduce((a, p) => a + p.x, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length }
      }
    }, 40)
  })
}

/** 'normal' animation speed (the default) with low graphics, so the software-GL runner renders fast enough to catch short camera holds. */
async function normalSpeedLowGfx(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mallet42k:presentation-settings', JSON.stringify({ animSpeed: 'normal', lowGraphics: true, battlefieldAmbience: false, cinematicCamera: true }))
    } catch { /* storage blocked: defaults apply */ }
  })
}

async function startBotGame(page: Page, seed: string) {
  await normalSpeedLowGfx(page)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('./')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByTestId('setup-patrol-A').getByRole('button', { name: 'Space Marines', exact: true }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-seed').fill(seed)
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as unknown as PageWin).__malletCameraView?.(), null, { timeout: 30_000 })
}

/**
 * A camera hold can be shorter than a screenshot takes (the software-GL runner is slow while dice and effects play), so the page stops
 * itself with a `debugger` pause two frames after each director flight that ends away from `home`, and the screenshot is taken over CDP
 * while it is frozen. window.__malletCameraArrive (board/CameraRig.tsx) reports each flight's end. `names` are the files for the 1st, 2nd... stop.
 */
async function freezeOnArrivals(page: Page, names: string[], home: V3) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Debugger.enable')
  let n = 0
  cdp.on('Debugger.paused', async () => {
    const name = names[n++]
    try {
      if (name) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'))
      }
    } finally {
      await cdp.send('Debugger.resume')
    }
  })
  await page.evaluate(({ count, home }) => {
    const w = window as unknown as PageWin & { __caught?: { p: V3; tg: V3 }[]; __arrivals?: { arrived: boolean; p: V3; tg: V3 }[]; __malletCameraArrive?: (arrived: boolean) => void }
    w.__caught = []
    w.__arrivals = []
    w.__malletCameraArrive = (arrived) => {
      ;(w as unknown as { __lastArrival: number }).__lastArrival = performance.now()
      const at = w.__malletCameraView!()!
      const pose = { p: [...at.position] as V3, tg: [...at.target] as V3 }
      w.__arrivals!.push({ arrived, ...pose })
      const away = Math.hypot(pose.p[0] - home[0], pose.p[1] - home[1], pose.p[2] - home[2]) > 2
      if (!arrived || !away || w.__caught!.length >= count) return
      w.__caught!.push(pose)
      // a task later (a pause inside the animation frame would stall the screenshot): the frame that landed the camera is on screen by then
      setTimeout(() => {
        // eslint-disable-next-line no-debugger
        debugger
      }, 0)
    }
  }, { count: names.length, home })
  return {
    /** the poses the page was frozen at, in order */
    frozen: () => page.evaluate(() => (window as unknown as { __caught: { p: V3; tg: V3 }[] }).__caught),
    /** every director flight's end, in order: where the lens and its target were */
    arrivals: () => page.evaluate(() => (window as unknown as { __arrivals: { arrived: boolean; p: V3; tg: V3 }[] }).__arrivals),
  }
}

async function deployHumanUnit(page: Page, cam: Cam, humanSeat: string): Promise<boolean> {
  const s = await snap(page)
  if (s.pending?.kind !== 'deployUnit' || s.pending.player !== humanSeat) return false
  const uid: string = s.pending.context.unitIds[0]
  const name = s.units.find((u) => u.id === uid)?.name ?? uid
  const chip = page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
  if (!(await chip.isVisible().catch(() => false))) return false
  await chip.click()
  const zone: V2[] = s.pending.context.zone
  const taken = s.units.filter((u) => u.player === humanSeat && u.loc === 'board').length
  const points = deployZoneCandidates(zone, s.pieces, taken, cam, W, H)
  if (await tryBoardPlacement(page, s, points, cam, W, H, name)) return true
  const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
  if (await res.isVisible().catch(() => false)) { await res.click(); return true }
  return false
}

test('(i) bot deployment: the camera visits each unit the bot sets up and returns to the player view', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  await startBotGame(page, 'cine-deploy-1')
  await page.waitForTimeout(3000) // opening camera moves settle
  const cam = makeCam()
  const s0 = await snap(page)
  const humanSeat = s0.humanSeat
  const v0 = (await getView(page))!
  const caught = await freezeOnArrivals(page, ['deploy-visit'], v0.p)

  const deadline = Date.now() + 8 * 60_000
  while (Date.now() < deadline) {
    const s = await snap(page)
    if (s.phase !== 'setup' && s.phase !== 'deployment') break
    if (s.pending?.kind === 'deployUnit' && s.pending.player === humanSeat) {
      await deployHumanUnit(page, cam, humanSeat)
      continue
    }
    if (s.pending && s.pending.player !== s.botSeat) {
      const opt = page.locator('[data-testid^="prompt-option-"]').first()
      if (await opt.isVisible().catch(() => false)) await opt.click()
      else if (await page.getByTestId('btn-pass').isVisible().catch(() => false)) await page.getByTestId('btn-pass').click()
    }
    await page.waitForTimeout(150)
  }
  // the presentation queue can trail the engine by several visits: wait until the camera is back with the player and has stayed there
  const settleDeadline = Date.now() + 150_000
  for (;;) {
    const a = await caught.arrivals()
    const last = a[a.length - 1]
    const idleSince = await page.evaluate(() => performance.now() - ((window as unknown as { __lastArrival?: number }).__lastArrival ?? 0))
    if ((last && last.arrived && dist3(last.p, v0.p) < 1 && idleSince > 12_000) || Date.now() > settleDeadline) break
    await page.waitForTimeout(500)
  }
  // every unit the bot set up on the board (not into reserves), where it stands
  const bots = await page.evaluate(() => {
    const g = (window as unknown as { __mallet: { useGameStore: { getState(): { botSeat: string; events: { type: string; player?: string; unitId?: string; toReserves?: boolean }[]; state: { units: Record<string, { models: string[] }>; models: Record<string, { pos: { x: number; z: number } }> } } } } }).__mallet.useGameStore.getState()
    return g.events
      .filter((e) => e.type === 'UnitDeployed' && e.player === g.botSeat && !e.toReserves)
      .map((e) => {
        const pts = g.state.units[e.unitId!]!.models.map((m) => g.state.models[m]!.pos)
        return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length }
      })
  })
  const vEnd = (await getView(page))!
  const frozen = await caught.frozen()
  const arrivals = await caught.arrivals()

  // a visit = a flight that ended with the orbit target on the unit's centre; the way home = a flight that ended back at the player's view
  const visits = bots.map((b) => {
    const at = arrivals.filter((r) => r.arrived && Math.hypot(r.tg[0] - b.x, r.tg[2] - b.z) < 3)
    return { x: +b.x.toFixed(1), z: +b.z.toFixed(1), visits: at.length, lensHeight: at.length ? +at[0]!.p[1].toFixed(1) : null, fromStart: at.length ? +dist3(at[0]!.p, v0.p).toFixed(1) : 0 }
  })
  const homeFlights = arrivals.filter((r) => r.arrived && dist3(r.p, v0.p) < 1).length
  console.log(JSON.stringify({ v0, vEnd, frozen, visits, homeFlights, arrivals: arrivals.length, errors }, null, 2))

  expect(bots.length, 'the bot deployed units onto the board').toBeGreaterThan(0)
  expect(frozen.length, 'screenshot taken while the camera held on a bot unit').toBe(1)
  expect(dist3(frozen[0]!.p, v0.p), 'the held view is away from the player view').toBeGreaterThan(5)
  expect(visits.filter((v) => v.visits === 0), 'camera flew to every unit the bot set up').toEqual([])
  for (const v of visits) expect(v.fromStart, 'the visit moved the camera away from the player view').toBeGreaterThan(5)
  expect(homeFlights, 'the camera flew back to the player view after the visits').toBeGreaterThan(0)
  // back with the player: the lens comes home to where it was
  expect(dist3(vEnd.p, v0.p), `camera returned to the player's view (start ${v0.p}, end ${vEnd.p})`).toBeLessThan(3)
  expect(errors).toEqual([])
})

// ------------------------------------------------------------------------------------------ shooting

interface Shot { pre: { p: V3; tg: V3 }; shoulder: { p: V3; tg: V3 } | null; closeup: { p: V3; tg: V3 } | null; post: { p: V3; tg: V3 }; maxTravel: number; hit: boolean; holds: unknown[] }

async function clickEnemy(page: Page, unitId: string) {
  const pt = await page.evaluate((id) => {
    const w = window as unknown as { __mallet: PageWin['__mallet']; __malletProject: (x: number, y: number, z: number) => { x: number; y: number } }
    const gs = w.__mallet.useGameStore.getState().state
    const m = gs.models[gs.units[id]!.models[0]!]!
    return w.__malletProject(m.pos.x, 0.8, m.pos.z)
  }, unitId)
  await page.mouse.click(pt.x, pt.y)
}

async function openShooting(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300))
    if (m.type() === 'warning' && m.text().includes('[presentation]')) console.log('WARN', m.text().slice(0, 300))
  })
  await normalSpeedLowGfx(page)
  await page.setViewportSize({ width: W, height: H })
  await page.goto('./?scenario=weapon-select')
  await expect(page.getByTestId('shoot-context')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => !!(window as unknown as { __malletProject?: unknown }).__malletProject && !!(window as unknown as PageWin).__malletCameraView?.(), null, { timeout: 30_000 })
  await page.waitForTimeout(2500)
}

/** Stretches of the sampled camera track where the lens stood still (>= minMs), with when they began (ms from the first sample) and how long. */
function holdsOf(samples: Sample[], minMs = 120) {
  const out: { at: number; ms: number; p: V3; tg: V3 }[] = []
  let a = 0
  for (let i = 1; i <= samples.length; i++) {
    const s = samples[i]
    if (s && dist3(s.p, samples[a]!.p) < 0.05 && dist3(s.tg, samples[a]!.tg) < 0.05) continue
    const ms = samples[i - 1]!.t - samples[a]!.t
    if (ms >= minMs) out.push({ at: Math.round(samples[a]!.t - samples[0]!.t), ms: Math.round(ms), p: samples[a]!.p.map((n) => +n.toFixed(1)) as V3, tg: samples[a]!.tg.map((n) => +n.toFixed(1)) as V3 })
    a = i
  }
  return out
}

/** Fires the staged volley at `unitId` and watches the camera until the volley has played out. */
async function fireAndWatch(page: Page, unitId: string, withShots: boolean, watchMs = 0): Promise<Shot> {
  await installSampler(page)
  const pre = (await getView(page))!
  // the 1st flight to end away from the prior view is the shoulder view, the 2nd the close-up
  const caught = withShots ? await freezeOnArrivals(page, ['shoulder', 'closeup'], pre.p) : null
  await clickEnemy(page, unitId)
  await expect(page.getByTestId('weapon-panel')).toBeVisible()
  await page.keyboard.press('Enter')
  const shot: Shot = { pre, shoulder: null, closeup: null, post: pre, maxTravel: 0, hit: false, holds: [] }
  const start = Date.now()
  let prev = pre
  let still = 0
  let calm = 0
  let polls = 0
  while (Date.now() - start < 90_000) {
    const v = (await getView(page))!
    const travel = dist3(v.p, pre.p)
    shot.maxTravel = Math.max(shot.maxTravel, travel)
    still = dist3(v.p, prev.p) < 0.05 ? still + 1 : 0
    prev = v
    if (++polls % 25 === 0) {
      const evs = await page.evaluate(() => (window as unknown as PageWin).__mallet.useGameStore.getState().events.map((e) => e.type))
      shot.hit = evs.includes('DamageApplied') || evs.includes('ModelDestroyed')
    }
    // Done once the camera has left the prior view, come back to it and stayed there; with watchMs, a fixed watch instead
    // (the camera must not move at all, so there is nothing to wait for but the dice and volley to play out).
    calm = shot.maxTravel > 2 && travel < 0.5 && still >= 3 ? calm + 1 : 0
    if (watchMs ? Date.now() - start > watchMs : calm >= 40) break
    await page.waitForTimeout(10)
  }
  shot.post = (await getView(page))!
  if (caught) {
    const got = await caught.frozen()
    shot.shoulder = got[0] ?? null
    shot.closeup = got[1] ?? null
  }
  shot.holds = holdsOf(await page.evaluate(() => (window as unknown as PageWin).__camSamples!))
  return shot
}

test('(ii) a volley: shoulder view behind the firing unit, close-up on the target, then back', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  await openShooting(page, errors)
  const shot = await fireAndWatch(page, 'B:terminator-squad', true)
  console.log(JSON.stringify({ ...shot, errors }, null, 2))

  expect(shot.maxTravel, 'camera left the prior view for the shot').toBeGreaterThan(2)
  expect(shot.shoulder, 'camera settled on a shoulder view').not.toBeNull()
  expect(dist3(shot.shoulder!.p, shot.pre.p), 'shoulder view differs from the pre-shot view').toBeGreaterThan(2)
  if (shot.hit) expect(shot.closeup, 'a damaging shot sent the camera in on the target').not.toBeNull()
  expect(dist3(shot.post.p, shot.pre.p), 'camera restored to the prior view').toBeLessThan(0.5)
  expect(dist3(shot.post.tg, shot.pre.tg), 'orbit target restored').toBeLessThan(0.5)
  expect(errors).toEqual([])
})

test('(iii) with the cinematic camera setting off, a volley does not move the camera', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  const errors: string[] = []
  await openShooting(page, errors)
  await page.getByTestId('btn-settings').click()
  const toggle = page.getByTestId('settings-cinematic-camera')
  await expect(toggle).toBeVisible()
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await expect(toggle).not.toBeChecked()
  await page.getByTestId('btn-settings').click() // close the panel
  await page.waitForTimeout(800)
  const shot = await fireAndWatch(page, 'B:terminator-squad', false, 22_000)
  console.log(JSON.stringify({ ...shot, errors }, null, 2))
  expect(shot.hit || shot.maxTravel === 0, 'the volley played').toBeTruthy()
  expect(shot.maxTravel, 'camera never moved during the volley').toBeLessThan(0.05)
  expect(shot.shoulder).toBeNull()
  expect(errors).toEqual([])
})

test('(iv) the bot\'s own volley gets the same shoulder view and close-up, and the camera comes back', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  mkdirSync(SHOTS, { recursive: true })
  const errors: string[] = []
  await openShooting(page, errors)
  // the human's volley first (camera on), then pass every human decision until the bot has shot
  await fireAndWatch(page, 'B:terminator-squad', false)
  const home = (await getView(page))!
  const caught = await freezeOnArrivals(page, ['bot-shoulder', 'bot-closeup'], home.p)
  let botShot = false
  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    const s = await snap(page)
    if (s.result || s.phase === 'ended') break
    if (s.active === s.botSeat && s.phase === 'shooting') botShot = true
    const arrivals = await caught.arrivals()
    const away = arrivals.filter((r) => r.arrived && dist3(r.p, home.p) > 2).length
    const back = arrivals.filter((r) => r.arrived && dist3(r.p, home.p) < 0.5).length
    if (botShot && away > 0 && back > 0) break
    if (s.pending && s.pending.player === s.humanSeat) await clickPass(page)
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(1500)
  const arrivals = await caught.arrivals()
  const got = await caught.frozen()
  const end = (await getView(page))!
  console.log(JSON.stringify({ home, got, arrivals: arrivals.length, end, botShot, errors }, null, 2))
  expect(botShot, 'the bot reached its Shooting phase').toBe(true)
  expect(got.length, 'the bot volley sent the camera away from the player view').toBeGreaterThan(0)
  expect(dist3(end.p, home.p), 'camera back at the player view after the bot volley').toBeLessThan(0.5)
  expect(errors).toEqual([])
})
