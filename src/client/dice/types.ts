// Public types for the dice presentation layer (src/client/dice/**).
// This module is deliberately decoupled from src/engine's DiceRoll shape — it's a pure
// presentation queue that any caller (store glue, tests, a future demo button) can feed with a
// plain description of a roll.

/** Animation speed. `instant` skips the tumble entirely and resolves on the next frame. */
export type DiceSpeed = 'normal' | 'fast' | 'instant'

export interface RollRequest {
  /** Short label for what this roll is for, e.g. "To hit", "Charge", "Feel No Pain". Shown as the
   *  tray's heading for this roll. Falls back to `purpose` if omitted. */
  label?: string
  /** Machine-ish purpose tag (kept for callers that don't have a nicer label handy). */
  purpose: string
  /** Raw die faces as first rolled, 1-6 each. */
  dice: number[]
  /** Success threshold: a face >= target counts as a hit/success and glows; below dims. Omit for
   *  a roll with no pass/fail (e.g. a flat damage or D6 pick) — every die then renders neutral. */
  target?: number
  /** Final values for dice that were re-rolled, in the same order/length as `dice`. An entry equal
   *  to the original `dice[i]` is treated as "not rerolled" (including the rare case where a
   *  reroll lands on the same face again — it still resolves correctly, it just skips the flip
   *  flourish for that one die). Shorter than `dice`: trailing dice are treated as not rerolled. */
  rerolled?: number[]
}

/** A queued/settled roll as the tray renders it internally. */
export interface DieResult {
  /** Value shown on the die: the rerolled value when present, else the original roll. */
  value: number
  /** The value this die started on, before any re-roll (for the flip animation). */
  original: number
  wasRerolled: boolean
  isCritical: boolean
  outcome: 'success' | 'fail' | 'neutral'
}
