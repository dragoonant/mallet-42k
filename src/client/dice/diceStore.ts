// Internal queue/animation state for the dice tray. Not exported from index.ts — callers only see
// playRoll()/setSpeed()/<DiceTray/> (see playRoll.ts and DiceTray.tsx). Kept as its own zustand
// store (module-level, like src/client/ui/uiStore.ts) so playRoll() can push work from anywhere —
// store glue, a test, a future "reroll" button — without needing a React context.
import { create } from 'zustand'
import type { DiceSpeed, DieResult, RollRequest } from './types'

export interface QueuedRoll {
  id: string
  request: RollRequest
  resolve: () => void
}

export interface CurrentRoll {
  id: string
  request: RollRequest
  dice: DieResult[]
  phase: 'tumbling' | 'settled'
}

interface DiceStoreState {
  speed: DiceSpeed
  queue: QueuedRoll[]
  current: CurrentRoll | null
}

/** Tumble duration and post-tumble hold (result on screen before the next roll starts), per
 *  speed setting. Normal totals ~950ms — comfortably under the ~1.2s/roll budget. */
export const DURATIONS: Record<DiceSpeed, { tumbleMs: number; holdMs: number; flipMs: number }> = {
  normal: { tumbleMs: 520, holdMs: 480, flipMs: 260 },
  fast: { tumbleMs: 170, holdMs: 160, flipMs: 110 },
  instant: { tumbleMs: 0, holdMs: 0, flipMs: 0 },
}

let seq = 0
export function nextId(): string {
  seq += 1
  return `roll-${seq}`
}

export const useDiceStore = create<DiceStoreState>(() => ({
  speed: 'normal',
  queue: [],
  current: null,
}))

export function computeResults(req: RollRequest): DieResult[] {
  return req.dice.map((original, i) => {
    const rerolledVal = req.rerolled?.[i]
    const wasRerolled = rerolledVal !== undefined && rerolledVal !== original
    const value = wasRerolled ? rerolledVal : original
    const isCritical = value === 6
    const outcome: DieResult['outcome'] =
      req.target === undefined ? 'neutral' : value >= req.target ? 'success' : 'fail'
    return { value, original, wasRerolled, isCritical, outcome }
  })
}

/** Advance the queue: if nothing is currently playing and something is waiting, start it and
 *  schedule its tumble -> settle -> resolve/advance timers. Safe to call redundantly. */
export function kick(): void {
  const s = useDiceStore.getState()
  if (s.current || s.queue.length === 0) return
  const [next, ...rest] = s.queue
  const { tumbleMs, holdMs } = DURATIONS[s.speed]
  const dice = computeResults(next.request)
  const startPhase: CurrentRoll['phase'] = tumbleMs === 0 ? 'settled' : 'tumbling'
  useDiceStore.setState({ queue: rest, current: { id: next.id, request: next.request, dice, phase: startPhase } })

  const finish = () => {
    const st = useDiceStore.getState()
    if (st.current?.id === next.id) useDiceStore.setState({ current: null })
    next.resolve()
    kick()
  }
  const settle = () => {
    useDiceStore.setState((st) =>
      st.current?.id === next.id ? { current: { ...st.current, phase: 'settled' } } : {},
    )
    if (holdMs === 0) finish()
    else setTimeout(finish, holdMs)
  }
  if (tumbleMs === 0) settle()
  else setTimeout(settle, tumbleMs)
}
