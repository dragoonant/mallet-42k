// Narration pauses (owner: src/client/presentation, read by src/client/ui/PhaseBanner.tsx and the
// bot loop's idle-wait in src/client/store/game.ts).
//
// Why this exists: director.ts plays one narrator voice line per phase (and a "your turn" line), but
// the only pacing between events was EVENT_GAP_MS's 300ms. A phase in which nothing actually happens
// — a command phase with no stratagem to use, a shooting phase with nothing in range — produces
// PhaseStarted → PhaseEnded → PhaseStarted back to back in milliseconds, so three or four narrator
// lines start on top of each other and the phase is over before the player has registered which one
// it was. A voice line is ~1-1.5s long, so an announcement needs a beat of its own.
//
// The hold is deliberate dead time, not a stall: while one is on screen the director's queue is
// non-idle on purpose, so idleStore.waitForPresentationIdle extends past its own cap for it and the
// store's progress watchdog holds its stall clock (see both call sites). It is always bounded by its
// own timer, and the player can end it early by clicking or pressing a key anywhere.
import { create } from 'zustand'
import type { PlayerId } from '@/engine'
import type { AnimSpeed } from './settings'

export type AnnouncementKind = 'phase' | 'turn'

export interface Announcement {
  /** Monotonic per-announcement id — the banner keys its countdown animation off this. */
  id: number
  kind: AnnouncementKind
  /** Big line: "Shooting Phase", "Your Turn". */
  title: string
  /** Small line: "Round 2 · Strike Force Octavius". */
  subtitle: string
  /** Whose turn it is, for the banner's accent colour. */
  player: PlayerId
  startedAt: number
  durationMs: number
}

interface AnnouncementState {
  current: Announcement | null
}

export const useAnnouncementStore = create<AnnouncementState>(() => ({ current: null }))

/** Pause lengths at 'normal' speed, in ms. A phase gets the full "and now, the shooting phase" beat;
 *  a turn hand-over is a shorter one because it is immediately followed by the command phase's. */
const HOLD_MS: Record<AnnouncementKind, number> = { phase: 2400, turn: 1600 }

/** Speed-scaled length of an announcement pause — 'instant' means no pause at all (and no banner),
 *  matching how director.ts's own EVENT_GAP_MS table treats that setting. */
export function announcementHoldMs(kind: AnnouncementKind, speed: AnimSpeed): number {
  if (speed === 'instant') return 0
  const base = HOLD_MS[kind]
  return speed === 'fast' ? Math.round(base * 0.35) : base
}

let activeResolve: (() => void) | null = null
let activeTimer: ReturnType<typeof setTimeout> | null = null
let detachSkip: (() => void) | null = null
let nextId = 1

/** Any click or key anywhere ends the pause: during a hold nothing else is happening, so a player
 *  reaching for the board/HUD has by definition finished reading the banner. The listeners run in the
 *  capture phase and never preventDefault, so whatever the player clicked still does its own job. */
function attachSkipListeners(): () => void {
  if (typeof window === 'undefined') return () => {}
  const skip = () => skipAnnouncement()
  window.addEventListener('pointerdown', skip, { capture: true })
  window.addEventListener('keydown', skip, { capture: true })
  return () => {
    window.removeEventListener('pointerdown', skip, { capture: true })
    window.removeEventListener('keydown', skip, { capture: true })
  }
}

function finish(): void {
  if (activeTimer !== null) {
    clearTimeout(activeTimer)
    activeTimer = null
  }
  if (detachSkip) {
    detachSkip()
    detachSkip = null
  }
  if (useAnnouncementStore.getState().current !== null) useAnnouncementStore.setState({ current: null })
  const resolve = activeResolve
  activeResolve = null
  if (resolve) resolve()
}

/** Shows `spec` as the banner and resolves once its pause is over (timer elapsed, player skipped, or
 *  another announcement replaced it). A zero/negative duration is a no-op: no banner, no wait. */
export function holdAnnouncement(spec: Omit<Announcement, 'id' | 'startedAt'>): Promise<void> {
  finish() // never stack two holds — the newer announcement owns the banner
  if (spec.durationMs <= 0) return Promise.resolve()
  useAnnouncementStore.setState({ current: { ...spec, id: nextId++, startedAt: Date.now() } })
  return new Promise<void>((resolve) => {
    activeResolve = resolve
    activeTimer = setTimeout(finish, spec.durationMs)
    detachSkip = attachSkipListeners()
  })
}

/** Ends the pause now (the banner's own click handler, the global skip listeners). No-op when idle. */
export function skipAnnouncement(): void {
  finish()
}

/** Director-only: drop the banner without playing out its pause (new game / reset). */
export function clearAnnouncement(): void {
  finish()
}

export function isAnnouncementHolding(): boolean {
  return useAnnouncementStore.getState().current !== null
}

/** How much of the current pause is left, in ms — 0 when none is running. Used by the idle-wait and
 *  the progress watchdog to tell "deliberately paused" apart from "director stuck". */
export function announcementHoldRemainingMs(): number {
  const current = useAnnouncementStore.getState().current
  if (!current) return 0
  return Math.max(0, current.startedAt + current.durationMs - Date.now())
}
