// "Presented up to event seq N" cursor. The engine resolves a whole step instantly, but the director
// (director.ts) plays its dice/vfx asynchronously afterwards. Anything the player can read that would
// give the result away early (event feed, dice log, wound counters, CP/VP, model deaths, decision
// prompts) is gated on this cursor instead of on the live game state.
//   - game.ts (writer): pushes a {lastSeq, state} snapshot per engine step, resets on new game / load.
//   - director.ts (writer): advances presentedSeq as each event finishes playing.
//   - UI (reader): useDisplayState() / usePresentedStore((s) => s.presentedSeq).
// Kept free of any import from game.ts so the store can depend on it without an import cycle.
import { useMemo } from 'react'
import { create } from 'zustand'
import { usePresentationIdle } from './idleStore'
import type { GameState } from '@/engine'

export interface StateSnapshot {
  lastSeq: number
  state: GameState
}

interface PresentedStoreState {
  presentedSeq: number
  /** Highest seq pushed so far (the live head of the engine's event stream). */
  latestSeq: number
  /** Oldest first, bounded. Engine step() returns a fresh state object (cloneForStep), so no copy is needed. */
  snapshots: StateSnapshot[]
  /**
   * "Reveal ahead": unit id -> the seq of the step that placed it. These units' models are shown from that step's
   * snapshot although the cursor hasn't reached it (a bot unit appearing under the deployment camera while the rest of
   * its step - the first-turn roll-off, the phase banner - is still to play). Dropped once the cursor passes the seq.
   */
  revealAhead: Record<string, number>
}

export const SNAPSHOT_LIMIT = 160
/** If nothing advances presentedSeq for this long (director not mounted, tests, a stalled queue) it is
 *  caught up to the latest seq so the UI can never be stuck behind a presentation that isn't running. */
export const PRESENTED_STALL_MS = 6000

const NO_AHEAD: Record<string, number> = Object.freeze({}) as Record<string, number>

export const usePresentedStore = create<PresentedStoreState>(() => ({ presentedSeq: -1, latestSeq: -1, snapshots: [], revealAhead: NO_AHEAD }))

let stallTimer: ReturnType<typeof setTimeout> | null = null

function disarmStallTimer(): void {
  if (stallTimer !== null) {
    clearTimeout(stallTimer)
    stallTimer = null
  }
}

function armStallTimer(): void {
  disarmStallTimer()
  const { presentedSeq, latestSeq } = usePresentedStore.getState()
  if (presentedSeq >= latestSeq) return
  stallTimer = setTimeout(() => {
    stallTimer = null
    catchUpPresented()
  }, PRESENTED_STALL_MS)
}

/** Latest snapshot whose lastSeq has been presented; falls back to the oldest one if none qualifies. */
export function pickDisplaySnapshot(snapshots: readonly StateSnapshot[], presentedSeq: number): GameState | null {
  if (snapshots.length === 0) return null
  for (let i = snapshots.length - 1; i >= 0; i--) if (snapshots[i].lastSeq <= presentedSeq) return snapshots[i].state
  return snapshots[0].state
}

/** The display state with the revealed-ahead units' placement (their `units` entry and models) taken from the snapshot of the step that placed them. */
export function mergeRevealedAhead(
  display: GameState | null,
  snapshots: readonly StateSnapshot[],
  ahead: Readonly<Record<string, number>>,
): GameState | null {
  if (!display) return display
  const ids = Object.keys(ahead)
  if (ids.length === 0) return display
  let units = display.units
  let models = display.models
  let changed = false
  for (const id of ids) {
    const snap = snapshots.find((sn) => sn.lastSeq >= ahead[id])
    const live = snap?.state.units[id]
    if (!snap || !live) continue
    if (!changed) {
      units = { ...units }
      models = { ...models }
      changed = true
    }
    units[id] = live
    for (const mid of live.models) {
      const m = snap.state.models[mid]
      if (m) models[mid] = m
    }
  }
  return changed ? { ...display, units, models } : display
}

/** Entries of `ahead` the cursor hasn't passed yet; the same object when nothing was dropped. */
export function pruneRevealAhead(ahead: Record<string, number>, presentedSeq: number): Record<string, number> {
  const keep = Object.keys(ahead).filter((id) => ahead[id] > presentedSeq)
  if (keep.length === Object.keys(ahead).length) return ahead
  if (keep.length === 0) return NO_AHEAD
  return Object.fromEntries(keep.map((id) => [id, ahead[id]]))
}

/** Director: show these units (as placed by the step with this seq) before the cursor reaches that step. */
export function revealUnitsAhead(unitIds: readonly string[], seq: number): void {
  const s = usePresentedStore.getState()
  if (seq <= s.presentedSeq || unitIds.length === 0) return
  usePresentedStore.setState({ revealAhead: { ...s.revealAhead, ...Object.fromEntries(unitIds.map((id) => [id, seq])) } })
}

/** Game store: record the state reached after the event stream's `lastSeq`. */
export function pushSnapshot(lastSeq: number, state: GameState): void {
  usePresentedStore.setState((s) => ({
    latestSeq: Math.max(s.latestSeq, lastSeq),
    snapshots: [...s.snapshots, { lastSeq, state }].slice(-SNAPSHOT_LIMIT),
  }))
  armStallTimer()
}

/** Game store: new game / load — everything is presented as of `seq`. */
export function resetPresentation(seq: number, state: GameState | null): void {
  usePresentedStore.setState({ presentedSeq: seq, latestSeq: seq, snapshots: state ? [{ lastSeq: seq, state }] : [], revealAhead: NO_AHEAD })
  disarmStallTimer()
}

/** Director: events up to and including `seq` have now been shown. Monotonic. */
export function setPresentedSeq(seq: number): void {
  const s = usePresentedStore.getState()
  const next = Math.min(Math.max(s.presentedSeq, seq), s.latestSeq)
  if (next !== s.presentedSeq) usePresentedStore.setState({ presentedSeq: next, revealAhead: pruneRevealAhead(s.revealAhead, next) })
  armStallTimer()
}

/** Present everything pushed so far (queue drained, director reset, or the stall safety net). */
export function catchUpPresented(): void {
  const { latestSeq, presentedSeq } = usePresentedStore.getState()
  if (presentedSeq !== latestSeq) usePresentedStore.setState((s) => ({ presentedSeq: latestSeq, revealAhead: pruneRevealAhead(s.revealAhead, latestSeq) }))
  disarmStallTimer()
}

/** The engine state as the player should currently see it (see header). Null before any game exists. */
export function useDisplayState(): GameState | null {
  const base = usePresentedStore((s) => pickDisplaySnapshot(s.snapshots, s.presentedSeq))
  const ahead = usePresentedStore((s) => s.revealAhead)
  const snapshots = usePresentedStore((s) => (s.revealAhead === NO_AHEAD ? NO_SNAPSHOTS : s.snapshots))
  return useMemo(() => mergeRevealedAhead(base, snapshots, ahead), [base, snapshots, ahead])
}

const NO_SNAPSHOTS: StateSnapshot[] = []

/** True once the player may be asked to act on a decision raised at `pendingSeq`: the cursor has reached it, or nothing is being presented.
 *  The stall net (PRESENTED_STALL_MS) catches the cursor up, so this can never stay false for long. */
export function presentationCaughtUp(presentedSeq: number, pendingSeq: number, idle: boolean): boolean {
  return idle || presentedSeq >= pendingSeq
}

/** Whether the human may be shown the decision raised at `pendingSeq` (hook). The bot is never gated by this. */
export function useCaughtUp(pendingSeq: number): boolean {
  const presentedSeq = usePresentedStore((s) => s.presentedSeq)
  const idle = usePresentationIdle()
  return presentationCaughtUp(presentedSeq, pendingSeq, idle)
}
