// Live hover preview for moveUnit / chargeMove: pointer movement over the mat (no button held) recomputes the
// clamped destination (moveClamp.ts) and stores it as uiStore.movePreview for MovePreviewOverlay to draw.
// Throttled to ~30 Hz with a trailing update so the preview settles exactly where the cursor stops. Also owns
// the Enter / Esc keys for the staged draft. Everything reads stores via getState() (captured-pointer closures
// go stale — see useBoardClick.ts).
import { useEffect } from 'react'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { clampMoveDraft, isClampedMovePending } from './moveClamp'
import { commitStagedDraft } from './commitDraft'

const HOVER_INTERVAL_MS = 33
/** A second click this close to the staged destination commits it. */
export const COMMIT_CLICK_RADIUS_IN = 0.6

let lastRun = 0
let trailing: ReturnType<typeof setTimeout> | null = null
let latest: { x: number; z: number } | null = null

function run(point: { x: number; z: number }) {
  lastRun = performance.now()
  const { state, pending, botSeat } = useGameStore.getState()
  const ui = useUiStore.getState()
  const staged = !!pending && ui.draft?.decisionId === pending.id
  if (!state || !pending || pending.player === botSeat || !isClampedMovePending(pending) || staged || ui.nudge || ui.measureOn) {
    if (ui.movePreview) ui.setMovePreview(null)
    return
  }
  const clamp = clampMoveDraft(state, pending, point)
  if (!clamp) {
    if (ui.movePreview) ui.setMovePreview(null)
    return
  }
  ui.setMovePreview({ ...clamp.draft, ok: clamp.ok, reason: clamp.reason, distance: clamp.distance, maxDistance: clamp.maxDistance })
}

/** Pointer over the mat with no button held (`point`), or leaving it (`null`). */
export function updateMoveHover(point: { x: number; z: number } | null): void {
  latest = point
  if (trailing) {
    clearTimeout(trailing)
    trailing = null
  }
  if (!point) {
    useUiStore.getState().setMovePreview(null)
    return
  }
  const wait = HOVER_INTERVAL_MS - (performance.now() - lastRun)
  if (wait <= 0) run(point)
  else
    trailing = setTimeout(() => {
      trailing = null
      if (latest) run(latest)
    }, wait)
}

/** Enter commits the staged move; Esc clears the staged draft and the hover preview. */
export function useMoveKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const { pending } = useGameStore.getState()
      if (!pending || !isClampedMovePending(pending)) return
      const ui = useUiStore.getState()
      if (e.key === 'Enter') {
        if (commitStagedDraft()) e.preventDefault()
      } else if (e.key === 'Escape') {
        if (ui.draft?.decisionId === pending.id) ui.setDraft(null)
        ui.setMovePreview(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
