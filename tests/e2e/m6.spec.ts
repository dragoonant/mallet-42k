import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

// M6 audit: missions, scoring, CP, stratagems and the end screen as a human sees them.
// Real clicks for every game action; window.__mallet is only READ (locate things, harvest events for the log).
// Helpers mirror tests/e2e/play.spec.ts (not imported: that file registers its own test at import).

const W = 1600
const H = 900
const FOV = 45
const OVERVIEW_POLAR = (55 * Math.PI) / 180
const START_DIST = Math.hypot(28, 23.8)

type V2 = { x: number; z: number }
type V3 = { x: number; y: number; z: number }
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
function project(p: V3): { x: number; y: number } {
  const pos = { x: 0, y: START_DIST * Math.cos(OVERVIEW_POLAR), z: START_DIST * Math.sin(OVERVIEW_POLAR) }
  const f = norm({ x: -pos.x, y: -pos.y, z: -pos.z })
  const r = norm(cross(f, { x: 0, y: 1, z: 0 }))
  const u = cross(r, f)
  const v = { x: p.x - pos.x, y: p.y - pos.y, z: p.z - pos.z }
  const t = Math.tan((FOV * Math.PI) / 360)
  const zc = dot(v, f)
  return { x: ((dot(v, r) / (zc * t * (W / H)) + 1) / 2) * W, y: ((1 - dot(v, u) / (zc * t)) / 2) * H }
}

interface Snap {
  phase: string
  round: number
  active: string
  botSeat: string | null
  result: any
  toast: string | null
  pending: null | { id: string; kind: string; player: string; context: any; options?: { id: string; label: string }[] }
  units: { id: string; name: string; player: string; loc: string; models: V3[] }[]
  events: any[]
  cp: Record<string, number>
  vp: Record<string, number>
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
        ? { id: g.pending.id, kind: g.pending.kind, player: g.pending.player, context: g.pending.context, options: g.pending.options?.map((o: any) => ({ id: o.id, label: o.label })) }
        : null,
      units: s
        ? Object.values(s.units).map((u: any) => ({ id: u.id, name: u.name, player: u.player, loc: u.location, models: u.models.map((m: string) => s.models[m]?.pos).filter(Boolean) }))
        : [],
      events: (g.events ?? [])
        .filter((e: any) => ['VpScored', 'CpChanged', 'StratagemUsed', 'ObjectiveSecured', 'ObjectiveRemoved', 'BattleShocked', 'GameEnded', 'ObjectiveControlChanged'].includes(e.type))
        .map((e: any) => ({ ...e, result: undefined })),
      cp: s ? { A: s.players.A.cp, B: s.players.B.cp } : { A: 0, B: 0 },
      vp: s ? { A: s.players.A.vp, B: s.players.B.vp } : { A: 0, B: 0 },
    }
  })
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

async function clickFirstOption(page: Page, avoidPass = true, re?: RegExp): Promise<string | null> {
  const opts = page.locator('[data-testid^="prompt-option-"]')
  const n = await opts.count()
  for (let i = 0; i < n; i++) {
    const t = ((await opts.nth(i).textContent()) ?? '').trim()
    if (avoidPass && /^Pass$/.test(t)) continue
    if (re && !re.test(t)) continue
    await opts.nth(i).click()
    return t
  }
  return null
}

async function clickPass(page: Page): Promise<boolean> {
  for (const id of ['btn-pass', 'btn-end-phase']) {
    const b = page.getByTestId(id)
    if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
      await b.click()
      return true
    }
  }
  return !!(await clickFirstOption(page, false))
}

async function deploy(page: Page, s: Snap): Promise<void> {
  const p = s.pending!
  const uid: string = p.context.unitIds[0]
  const name = s.units.find((u) => u.id === uid)?.name ?? uid
  const chip = page.locator('[data-testid="prompt"] button').filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()
  if (await chip.isVisible().catch(() => false)) await chip.click()
  const zone: V2[] = p.context.zone
  const xs = zone.map((q) => q.x)
  const zs = zone.map((q) => q.z)
  const taken = s.units.filter((u) => u.player === p.player && u.loc === 'board').length
  const cands: V2[] = []
  for (let gx = Math.min(...xs) + 2.5; gx < Math.max(...xs) - 2; gx += 3.5)
    for (let gz = Math.min(...zs) + 2.5; gz < Math.max(...zs) - 2; gz += 3.5) cands.push({ x: gx, z: gz })
  // rotate the candidate list per unit so units don't all try the same spot first
  const rot = (taken * 7) % Math.max(1, cands.length)
  const ordered = [...cands.slice(rot), ...cands.slice(0, rot)]
  for (const c of ordered.slice(0, 40)) {
    await page.evaluate(() => (window as any).__mallet.useGameStore.getState().clearToast())
    if (!(await clickCanvasAt(page, project({ x: c.x, y: 0, z: c.z })))) continue
    await page.waitForTimeout(80)
    const confirm = page.getByTestId('btn-confirm')
    if (!(await confirm.isVisible().catch(() => false))) continue
    await confirm.click()
    const after = await waitChange(page, p.id)
    if (after.pending?.id !== p.id) return
  }
  const res = page.locator('[data-testid="prompt"] button').filter({ hasText: /^Reserves:/ }).first()
  if (await res.isVisible().catch(() => false)) return void (await res.click())
  await clickPass(page)
}

interface Audit {
  mission: string
  stratagemOffers: { round: number; phase: string; kind: string; title: string; options: string[]; promptText: string; cp: number }[]
  stratagemsUsedByHuman: string[]
  rejections: string[]
  stuck: string[]
  hudSamples: string[]
  events: Record<string, any>
  endText: string | null
  final: any
  consoleErrors: string[]
}

async function playMission(page: Page, mission: string, shotPrefix: string, opts: { toEnd: boolean; minRound: number; passAfterRound: number; budgetMs: number }) {
  mkdirSync('e2e-out', { recursive: true })
  await page.setViewportSize({ width: W, height: H })
  const audit: Audit = { mission, stratagemOffers: [], stratagemsUsedByHuman: [], rejections: [], stuck: [], hudSamples: [], events: {}, endText: null, final: null, consoleErrors: [] }
  page.on('console', (m) => { if (m.type() === 'error') audit.consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => audit.consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`))

  await page.goto('/')
  await expect(page.getByTestId('start-game')).toBeVisible()
  await page.getByRole('button', { name: 'Space Marines' }).click()
  await page.getByRole('button', { name: 'Bot', exact: true }).click()
  await page.getByTestId('setup-mission').selectOption(mission)
  await page.getByTestId('setup-seed').fill(`m6-${mission}`)
  if (shotPrefix === 'main') await page.screenshot({ path: 'e2e-out/m6-01-setup.png' })
  else await page.screenshot({ path: `e2e-out/m6-01-setup-${mission}.png` })
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('phase-tracker')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!(window as any).__mallet)
  await page.waitForTimeout(2000)

  const start = Date.now()
  let lastId = ''
  let same = 0
  let shotObj = false
  let shotScore = false
  let shotStrat = false
  let lastHud = ''
  const shot = (name: string) => page.screenshot({ path: `e2e-out/${shotPrefix === 'main' ? name : name.replace('.png', `-${mission}.png`)}` })

  while (Date.now() - start < opts.budgetMs) {
    const s = await snap(page)
    for (const e of s.events) audit.events[`${e.seq}`] = e
    if (s.toast) {
      audit.rejections.push(`R${s.round} ${s.phase} ${s.pending?.kind}: ${s.toast}`)
      await page.evaluate(() => (window as any).__mallet.useGameStore.getState().clearToast())
    }
    if (s.result || s.phase === 'ended') break
    if (!opts.toEnd && s.round > opts.minRound) break

    const hudKey = `R${s.round} ${s.active} ${s.phase}`
    if (hudKey !== lastHud) {
      lastHud = hudKey
      const tracker = (await page.getByTestId('phase-tracker').textContent().catch(() => '')) ?? ''
      audit.hudSamples.push(`${hudKey} | tracker="${tracker}" | cp=${JSON.stringify(s.cp)} vp=${JSON.stringify(s.vp)}`)
      if (!shotObj && s.round >= 2 && s.phase === 'movement') {
        shotObj = true
        await page.waitForTimeout(700)
        await shot('m6-02-objectives.png')
      }
    }
    if (!shotScore && s.events.some((e) => e.type === 'VpScored')) {
      shotScore = true
      await page.waitForTimeout(500)
      await shot('m6-03-scoring.png')
    }

    if (!s.pending || s.pending.player === s.botSeat) {
      await page.waitForTimeout(150)
      continue
    }
    if (s.pending.id === lastId) {
      same++
      if (same === 5) await clickPass(page)
      if (same > 12) {
        audit.stuck.push(`${s.pending.kind} R${s.round} ${s.phase}`)
        await clickFirstOption(page, false)
        if (same > 20) break
      }
    } else {
      same = 0
      lastId = s.pending.id
    }

    const k = s.pending.kind
    const passive = s.round > opts.passAfterRound
    if (k === 'deployUnit') {
      await deploy(page, s)
    } else if (k === 'stratagemWindow' || k === 'reactionWindow' || k === 'commandReroll') {
      const promptText = ((await page.getByTestId('prompt').textContent().catch(() => '')) ?? '').slice(0, 400)
      audit.stratagemOffers.push({ round: s.round, phase: s.phase, kind: k, title: '', options: (s.pending.options ?? []).map((o) => o.label), promptText, cp: s.cp.A })
      const useable = (s.pending.options ?? []).some((o) => !/^pass$/i.test(o.label))
      if (useable && !shotStrat) {
        shotStrat = true
        await shot('m6-04-stratagem.png')
      }
      const used = useable ? await clickFirstOption(page, true) : null
      if (used) audit.stratagemsUsedByHuman.push(`R${s.round} ${s.phase} ${used}`)
      else await clickPass(page)
    } else if (passive && (await page.getByTestId('btn-pass').isVisible().catch(() => false))) {
      await clickPass(page)
    } else if (k === 'declareMove') {
      if (!(await clickFirstOption(page, true, /^Normal move$/))) if (!(await clickFirstOption(page))) await clickPass(page)
    } else if (k === 'declareTargets') {
      if (!(await clickFirstOption(page, true, /^Target /))) await clickFirstOption(page, false)
    } else if (k === 'moveUnit') {
      // prefer suggestions that land on an objective, so control/scoring actually happens
      if (!(await clickFirstOption(page, true, /objective/))) if (!(await clickFirstOption(page))) await clickPass(page)
    } else {
      if (!(await clickFirstOption(page))) await clickPass(page)
    }
    await page.waitForTimeout(60)
  }

  const final = await snap(page)
  for (const e of final.events) audit.events[`${e.seq}`] = e
  audit.final = { round: final.round, phase: final.phase, result: final.result, cp: final.cp, vp: final.vp, pending: final.pending?.kind }
  if (!shotObj) await shot('m6-02-objectives.png')
  if (!shotScore) await shot('m6-03-scoring.png')
  if (opts.toEnd) {
    await page.waitForTimeout(1200)
    await shot('m6-05-end.png')
    audit.endText = (await page.getByTestId('end-screen').textContent().catch(() => null)) ?? null
  }
  const eventsList = Object.values(audit.events).sort((a: any, b: any) => a.seq - b.seq).map((e: any) => {
    const { seq, round, turn, phase, player, type, ...rest } = e
    return `R${round} t=${turn} ${phase} ${player} ${type} ${JSON.stringify(rest)}`
  })
  writeFileSync(`e2e-out/m6-log-${mission}.json`, JSON.stringify({ ...audit, events: eventsList, elapsedS: Math.round((Date.now() - start) / 1000) }, null, 2))
  return audit
}

test.describe.configure({ mode: 'parallel' })

test('M6: Scorched Earth (cp-04) vs Bot to the end screen', async ({ page }) => {
  test.setTimeout(20 * 60_000)
  const a = await playMission(page, 'cp-04', 'main', { toEnd: true, minRound: 5, passAfterRound: 2, budgetMs: 17 * 60_000 })
  expect.soft(a.final.round, 'reached round 2+').toBeGreaterThanOrEqual(2)
})

test('M6: Clash of Patrols (cp-01) vs Bot, 2 battle rounds', async ({ page }) => {
  test.setTimeout(12 * 60_000)
  const a = await playMission(page, 'cp-01', 'alt', { toEnd: false, minRound: 2, passAfterRound: 9, budgetMs: 10 * 60_000 })
  expect.soft(a.final.round, 'reached round 3').toBeGreaterThanOrEqual(3)
})
