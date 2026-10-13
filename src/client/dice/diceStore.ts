// Internal queue/animation state for the dice tray. Not exported from index.ts — callers only see
// playRoll()/setSpeed()/<DiceTray/> (see playRoll.ts and DiceTray.tsx). Kept as its own zustand
// store (module-level, like src/client/ui/uiStore.ts) so playRoll() can push work from anywhere —
// store glue, a test, a future "reroll" button — without needing a React context.
import { create } from 'zustand'
import type { DiceSpeed, DiceStyle, DieResult, RollRequest } from './types'

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
  style: DiceStyle
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

/** Timings for the 3D table style (slower than the tray so players can follow the dice and read the
 *  values). `throwMs` is how long each die's scripted throw lasts; the roll counts as tumbling for a
 *  further 400ms while the last die settles, then totals stay up for `holdMs`. */
export const TABLE_DURATIONS: Record<Exclude<DiceSpeed, 'instant'>, { throwMs: number; holdMs: number }> = {
  normal: { throwMs: 2800, holdMs: 2500 },
  fast: { throwMs: 1400, holdMs: 1200 },
}
/** Pause before the re-thrown dice leave the hand, and settle time after they land (skipTumble rolls). */
export const TABLE_RETHROW_LEAD_MS = 400
export const TABLE_SETTLE_MS = 400
/** A re-throw of only the rerolled dice is a shorter throw than a full roll. */
export const TABLE_RETHROW_FACTOR = 0.75

/** True when rolls should be shown on the 3D table overlay (style chosen and speed isn't instant). */
export function isTableActive(style: DiceStyle, speed: DiceSpeed): boolean {
  return style === 'table' && speed !== 'instant'
}

/** True when rolls should be thrown onto the battlefield in the main canvas (dice/board/BoardDice.tsx). */
export function isBoardActive(style: DiceStyle, speed: DiceSpeed): boolean {
  return style === 'board' && speed !== 'instant'
}

/** Either slow 3D style: the tray stays out of the way and the slow timings apply. */
export function isSlowDiceActive(style: DiceStyle, speed: DiceSpeed): boolean {
  return isTableActive(style, speed) || isBoardActive(style, speed)
}

/** Roll ids whose dice the player has already seen in the interactive re-roll tray (ui/RerollTray.tsx), so
 *  the tray window that follows the answer (presentation/director.ts) skips the tumble and only flips
 *  the dice that were re-rolled. */
export const rerollTrayShown = new Set<string>()

let seq = 0
export function nextId(): string {
  seq += 1
  return `roll-${seq}`
}

export const useDiceStore = create<DiceStoreState>(() => ({
  speed: 'normal',
  style: 'tray',
  queue: [],
  current: null,
}))

export function computeResults(req: RollRequest): DieResult[] {
  return req.dice.map((original, i) => {
    const rerolledVal = req.rerolled?.[i]
    const wasRerolled = rerolledVal !== undefined && rerolledVal !== original
    const value = wasRerolled ? rerolledVal : original
    const isCritical = value === 6
    const pass = req.passed?.[i]
    const outcome: DieResult['outcome'] =
      pass !== undefined ? (pass ? 'success' : 'fail')
        : req.target === undefined ? 'neutral' : value >= req.target ? 'success' : 'fail'
    return { value, original, wasRerolled, isCritical, outcome }
  })
}

let endHold: (() => void) | null = null
/** End the current roll's post-tumble hold early (table style: click / Space). No-op while tumbling. */
export function skipHold(): void {
  endHold?.()
}

/** Advance the queue: if nothing is currently playing and something is waiting, start it and
 *  schedule its tumble -> settle -> resolve/advance timers. Safe to call redundantly. */
export function kick(): void {
  const s = useDiceStore.getState()
  if (s.current || s.queue.length === 0) return
  const [next, ...rest] = s.queue
  const { tumbleMs: speedTumbleMs, holdMs: baseHoldMs } = DURATIONS[s.speed]
  const dice = computeResults(next.request)
  const table = isSlowDiceActive(s.style, s.speed)
  let tumbleMs = next.request.skipTumble ? 0 : speedTumbleMs
  // A grouped whole-squad window stays up a little longer so the result can be read (+1/12 per die, capped).
  let holdMs = baseHoldMs === 0 ? 0 : baseHoldMs + Math.round((baseHoldMs / 12) * Math.min(dice.length - 1, 15))
  if (table) {
    const t = TABLE_DURATIONS[s.speed as 'normal' | 'fast']
    holdMs = t.holdMs
    if (!next.request.skipTumble) tumbleMs = t.throwMs + TABLE_SETTLE_MS
    else if (dice.some((d) => d.wasRerolled)) tumbleMs = TABLE_RETHROW_LEAD_MS + Math.round(t.throwMs * TABLE_RETHROW_FACTOR) + TABLE_SETTLE_MS
  }
  const startPhase: CurrentRoll['phase'] = tumbleMs === 0 ? 'settled' : 'tumbling'
  useDiceStore.setState({ queue: rest, current: { id: next.id, request: next.request, dice, phase: startPhase } })

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    endHold = null
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
    else {
      const t = setTimeout(finish, holdMs)
      endHold = () => {
        clearTimeout(t)
        finish()
      }
    }
  }
  if (tumbleMs === 0) settle()
  else setTimeout(settle, tumbleMs)
}
