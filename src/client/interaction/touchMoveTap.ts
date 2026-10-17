// Phone movement taps (M11). With a moveUnit / chargeMove decision pending, tapping the board stages the whole
// unit at the tapped spot through the same clamp the desktop hover preview + click use (moveClamp.ts), and the
// TouchActionBar then offers Confirm / Cancel. This file only adds what a finger cannot get from a hover: when
// the tap cannot become a move it says why instead of silently doing nothing, and when the unit stops short of
// the spot (range or an obstacle) it says that too. Mouse and pen never come here.
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { clampMoveDraft, isClampedMovePending } from './moveClamp'
import { COMMIT_CLICK_RADIUS_IN } from './moveHover'

/** A staged move shorter than this is "did not go anywhere": the tap is refused with the reason. */
export const MIN_TAP_MOVE_IN = 0.15

function say(text: string): void {
  useGameStore.setState({ toast: { id: Date.now(), text: friendly(text) } })
}

/** Engine reasons name models by id ("A:terminator-squad#0 would move 6.549\" > 5\""): make them player-facing. */
export function friendly(text: string): string {
  return text
    .replace(/(^|[\s(])[AB]:[\w-]+#\d+/g, (_m, pre: string) => `${pre}a model`)
    .replace(/(^|[:.]\s)a model/g, (_m, pre: string) => `${pre}A model`)
    .replace(/would move (\d+(?:\.\d+)?)" > (\d+(?:\.\d+)?)"/g, (_m, d: string, max: string) => `would need ${Number(d).toFixed(1)}" (max ${max}")`)
    .replace(/(\d+\.\d{2,})/g, (n: string) => Number(n).toFixed(1))
}

/**
 * A one-finger tap (or the lift of a ground drag) at `point` while a clamped move is pending.
 * Returns true when the tap was refused and fully handled here (the caller must NOT stage it); false when the
 * normal click path should stage it (a notice may have been shown about it stopping short).
 * `onFigure`: the finger landed on a figure (usually the moving unit itself). A tap there that would not move the
 * unit is not a move request at all: it only selects the figure, so nothing is staged and no reason is shown.
 */
export function handleMoveTap(point: { x: number; z: number }, onFigure = false): boolean {
  const { state, pending, botSeat } = useGameStore.getState()
  const ui = useUiStore.getState()
  if (!state || !pending || pending.player === botSeat || !isClampedMovePending(pending) || ui.measureOn || ui.nudge) return false
  // a second tap on the staged destination commits it (Scene's click handler): not a new request
  const staged = ui.draft
  if (staged && staged.decisionId === pending.id && Math.hypot(point.x - staged.anchor.x, point.z - staged.anchor.z) <= COMMIT_CLICK_RADIUS_IN) return false
  const clamp = clampMoveDraft(state, pending, point)
  if (!clamp) return false
  if (onFigure && (!clamp.ok || clamp.distance < MIN_TAP_MOVE_IN)) {
    ui.selectUnit(null) // what the click path does first; the figure's own click then re-selects it
    return true
  }
  if (!clamp.ok || clamp.distance < MIN_TAP_MOVE_IN) {
    const why = clamp.reason ?? clamp.limitReason
    say(clamp.outOfRange && !why ? `Out of range: this move is at most ${clamp.maxDistance}".` : `Can't move there${why ? `: ${why}` : ''}.`)
    return true
  }
  if (clamp.outOfRange) say(`Out of range: staged at the ${clamp.maxDistance}" limit.`)
  else if (clamp.limitReason) say(`Staged short of that spot: ${clamp.limitReason}.`)
  return false
}
