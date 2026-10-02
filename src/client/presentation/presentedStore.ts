// "Presented up to event seq N" cursor. The engine resolves a whole step instantly, but the director
// (director.ts) plays its dice/vfx asynchronously afterwards. Anything the player can read that would
// give the result away early (event feed, dice log, wound counters, CP/VP, model deaths, decision
// prompts) is gated on this cursor instead of on the live game state.
//   - game.ts (writer): pushes a {lastSeq, state} snapshot per engine step, resets on new game / load.
//   - director.ts (writer): advances presentedSeq as each event finishes playing.
//   - UI (reader): useDisplayState() / usePresentedStore((s) => s.presentedSeq).
// Kept free of any import from game.ts so the store can depend on it without an import cycle.
import { create } from 'zustand'
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
}

export const SNAPSHOT_LIMIT = 160
/** If nothing advances presentedSeq for this long (director not mounted, tests, a stalled queue) it is
 *  caught up to the latest seq so the UI can never be stuck behind a presentation that isn't running. */
export const PRESENTED_STALL_MS = 6000

export const usePresentedStore = create<PresentedStoreState>(() => ({ presentedSeq: -1, latestSeq: -1, snapshots: [] }))

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
  usePresentedStore.setState({ presentedSeq: seq, latestSeq: seq, snapshots: state ? [{ lastSeq: seq, state }] : [] })
  disarmStallTimer()
}

/** Director: events up to and including `seq` have now been shown. Monotonic. */
export function setPresentedSeq(seq: number): void {
  const s = usePresentedStore.getState()
  const next = Math.min(Math.max(s.presentedSeq, seq), s.latestSeq)
  if (next !== s.presentedSeq) usePresentedStore.setState({ presentedSeq: next })
  armStallTimer()
}

/** Present everything pushed so far (queue drained, director reset, or the stall safety net). */
export function catchUpPresented(): void {
  const { latestSeq, presentedSeq } = usePresentedStore.getState()
  if (presentedSeq !== latestSeq) usePresentedStore.setState({ presentedSeq: latestSeq })
  disarmStallTimer()
}

/** The engine state as the player should currently see it (see header). Null before any game exists. */
export function useDisplayState(): GameState | null {
  return usePresentedStore((s) => pickDisplaySnapshot(s.snapshots, s.presentedSeq))
}
