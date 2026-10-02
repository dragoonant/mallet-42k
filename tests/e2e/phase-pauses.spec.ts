import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import {
  clickFirstOption, clickPass, deployZoneCandidates, makeCam, promptButton, snap,
  startGameVsBot, tryBoardPlacement, type Snap, type V2,
} from './helpers'

// Regression coverage for "phases go by too fast to hear which one it is": a phase in which nothing
// happens used to be announced and ended inside a few hundred ms, so several narrator voice lines
// started on top of each other (src/client/audio/eventSounds.ts's PHASE_VOICE_LINE) and the player
// never saw which phase had just been skipped. src/client/presentation/announceStore.ts now holds the
// director's queue for a beat on each announced phase/turn and shows that beat as the phase banner
// (src/client/ui/PhaseBanner.tsx). Checked here at the app's *default* speed — deliberately not the
// Instant setting the other fast specs push, since Instant is defined to drop the pauses entirely.
//
// What this spec owns is the integration: real game, real narrator-line pacing, banners that really
// appear and really last. It never touches a banner — a spec that polls for one while also answering
// prompts catches it well into its pause, and clicking one is a race with its own timer. The
// click-to-skip wiring is unit-tested instead (tests/client/announce.test.ts). Durations come from a
// MutationObserver on the banner's own `data-announcement-*` attributes, because back-to-back
// announcements hand the same element over without it ever hiding.

const W = 1600
const H = 900
const BUDGET_MS = 5 * 60_000
/** How long the screenshot poll waits for a banner — rAF-polled, so this only bounds the miss case. */
const PEEK_MS = 120
/** How long to wait for a banner right after a human action, while still hunting for a screenshot. */
const AFTER_ACTION_MS = 2500
/** Stop once the log holds this many finished pauses — a round's worth of phases. */
const WANT_SPANS = 5

interface LogEntry { id: string | null; duration: number; text: string; t: number }

const cam = makeCam()

/** Records every change of the banner's announcement id — its length, its text and a timestamp —
 *  from before the app boots. An entry with a non-null id starts a pause; the next entry (any id, or
 *  null for "banner gone") ends it. */
async function recordAnnouncements(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Entry { id: string | null; duration: number; text: string; t: number }
    const w = window as unknown as { __announceLog: Entry[] }
    w.__announceLog = []
    const record = () => {
      const el = document.querySelector('[data-testid="phase-banner"]')
      const id = el?.getAttribute('data-announcement-id') ?? null
      const last = w.__announceLog[w.__announceLog.length - 1]
      if (last && last.id === id) return
      w.__announceLog.push({
        id,
        duration: Number(el?.getAttribute('data-announcement-duration') ?? 0),
        text: (el?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        t: Date.now(),
      })
    }
    const start = () => {
      new MutationObserver(record).observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['data-announcement-id'],
      })
      record()
    }
    if (document.body) start()
    else document.addEventListener('DOMContentLoaded', start)
  })
}

/** The announcement on the banner now, if it isn't one already seen. rAF-polled. */
async function peek(page: Page, prev: string | null, timeout: number): Promise<string | null> {
  const handle = await page
    .waitForFunction(
      (last) => {
        const el = document.querySelector('[data-testid="phase-banner"]')
        const id = el?.getAttribute('data-announcement-id') ?? null
        return id !== null && id !== last ? id : false
      },
      prev,
      { timeout, polling: 'raf' },
    )
    .catch(() => null)
  return handle ? ((await handle.jsonValue()) as string) : null
}

const readLog = (page: Page): Promise<LogEntry[]> =>
  page.evaluate(() => (window as unknown as { __announceLog: LogEntry[] }).__announceLog)

/** Answers only the human's decisions, fastest-legal — same shape as bot-turn.spec.ts's handleHuman,
 *  trimmed to what this spec needs (it only has to reach phase changes, not play well). */
async function handleHuman(page: Page, s: Snap): Promise<void> {
  const p = s.pending!
  if (p.kind === 'deployUnit') {
    // Reserves first (one click) and only then a real board placement, which is the slow part of
    // deployment: this spec is about what happens *after* deployment.
    const res = await promptButton(page, /^Reserves:/)
    if (res) { await res.click(); return }
    const uid: string = p.context.unitIds[0]
    const name = s.units.find((u) => u.id === uid)?.name ?? uid
    const chip = await promptButton(page, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    if (chip) await chip.click()
    const zone: V2[] = p.context.zone
    const taken = s.units.filter((u) => u.player === p.player && u.loc === 'board').length
    const points = deployZoneCandidates(zone, s.pieces, taken, cam, W, H)
    if (chip && (await tryBoardPlacement(page, s, points, cam, W, H, name))) return
    await clickPass(page)
    return
  }
  if (await clickFirstOption(page, false)) return
  await clickPass(page)
}

test('phase announcements hold the game long enough to read', async ({ page }) => {
  test.setTimeout(BUDGET_MS + 60_000)
  mkdirSync('test-results', { recursive: true })
  await page.setViewportSize({ width: W, height: H })
  await recordAnnouncements(page)
  await startGameVsBot(page, 'phase-pauses')

  const banner = page.getByTestId('phase-banner')
  let shot = false
  let lastSeenId: string | null = null
  let afterActionMs = AFTER_ACTION_MS // deployment hands over to the first announced phase
  const deadline = Date.now() + BUDGET_MS

  while (Date.now() < deadline) {
    // Screenshot the first banner this loop happens to catch. rAF-polled with a tiny timeout so it
    // never paces the loop, and the shots are small (the banner itself, then a strip of board around
    // it) — a full-page grab of a WebGL scene takes long enough that the pause can end mid-capture.
    // Until the screenshot is in the bag, wait properly for a banner right after a human action —
    // that is the click that ends a phase, so an announcement is usually the next thing to happen.
    const seen = await peek(page, lastSeenId, shot ? PEEK_MS : afterActionMs)
    afterActionMs = PEEK_MS
    if (seen !== null) {
      lastSeenId = seen
      if (!shot) {
        await banner.screenshot({ path: 'test-results/phase-banner.png' }).catch(() => {})
        await page
          .screenshot({ path: 'test-results/phase-banner-context.png', clip: { x: W / 2 - 420, y: 120, width: 840, height: 360 } })
          .catch(() => {})
        shot = true
      }
    }
    const s = await snap(page)
    if (s.result) break
    const log = await readLog(page)
    if (log.filter((e) => e.id !== null).length >= WANT_SPANS + 1) break
    if (s.pending && s.pending.player === s.humanSeat) {
      await handleHuman(page, s).catch(() => {})
      if (!shot) afterActionMs = AFTER_ACTION_MS
    } else await page.waitForTimeout(80) // the bot's own timer drives its side
  }

  const log = await readLog(page)
  // Pair each non-null entry with the entry that ended it; an announcement still on screen when the
  // run stopped has no end and is dropped.
  const spans = log
    .map((e, i) => ({ ...e, end: log[i + 1]?.t }))
    .filter((s): s is LogEntry & { id: string; end: number } => s.id !== null && s.end !== undefined)
  const longest = spans.reduce((m, s) => Math.max(m, s.end - s.t), 0)

  console.log(`[phase-pauses] spans=${spans.length} longest=${longest}ms texts=${JSON.stringify(spans.slice(0, 6).map((s) => s.text))}`)
  expect(spans.length, 'phase/turn banners should appear during a real game at default speed').toBeGreaterThanOrEqual(3)
  expect(spans.some((s) => /Phase|Your Turn/.test(s.text)), 'a banner should name the phase or turn').toBe(true)
  expect(spans.every((s) => s.duration >= 1600), "each pause should carry the director's own 1.6-2.4s length").toBe(true)
  // A phase pause is 2.4s and a turn pause 1.6s; 1.5s is comfortably above the ~0.3s the old
  // EVENT_GAP_MS-only pacing gave a phase, and below either pause.
  expect(longest, 'a pause should actually hold the game long enough to read').toBeGreaterThan(1500)
  // The screenshots are for eyeballing the banner, not evidence — the log above is the evidence, and
  // a WebGL capture that lands a frame late shouldn't fail the run.
  if (!shot) console.log('[phase-pauses] no banner screenshot captured this run')
})
