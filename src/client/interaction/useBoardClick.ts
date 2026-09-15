// Turns Board's down/move/up pointer stream into a plain "click" callback, so a left-drag that
// orbits the camera (OrbitControls reads the same canvas pointer events) doesn't also drop a unit —
// only a down→up pair that barely moved counts as a click.
//
// Also drains an in-progress model/formation nudge (M4 #3: dragging a placed ghost before Confirm).
// The drag itself starts on a pointer-down on the ghost mesh in PlacementOverlay.tsx (which calls
// uiStore.startNudge and stops propagation so the mat below never sees that 'down' at all); this
// hook only needs to keep updating the draft on every 'move' while a nudge is active, and clear it
// on 'up'. Reading uiStore via getState() (not the reactive hook) for the same reason Scene.tsx's
// onBoardPointer does: a captured pointer stream keeps calling whichever closure was live when the
// drag started, never a fresher one, so anything read here has to be fetched live.
import { useCallback, useRef } from 'react'
import { useUiStore } from '../ui/uiStore'

const CLICK_MAX_DRAG_IN = 0.4

function applyNudge(point: { x: number; z: number }) {
  const ui = useUiStore.getState()
  const nudge = ui.nudge
  const draft = ui.draft
  if (!nudge || !draft || draft.decisionId !== nudge.decisionId) return true
  if (nudge.mode === 'model') {
    const target = { x: point.x - nudge.grab.x, z: point.z - nudge.grab.z }
    ui.setDraft({
      ...draft,
      placements: draft.placements.map((p) => (p.modelId === nudge.modelId ? { ...p, pos: { ...p.pos, x: target.x, z: target.z } } : p)),
    })
  } else {
    const dx = point.x - nudge.grab.x
    const dz = point.z - nudge.grab.z
    ui.setDraft({
      ...draft,
      anchor: { x: draft.anchor.x + dx, z: draft.anchor.z + dz },
      placements: nudge.basePlacements.map((p) => ({ ...p, pos: { ...p.pos, x: p.pos.x + dx, z: p.pos.z + dz } })),
    })
  }
  return true
}

export function useBoardClick(onClick: (point: { x: number; z: number }) => void) {
  const down = useRef<{ x: number; z: number } | null>(null)

  return useCallback(
    (point: { x: number; z: number }, kind: 'move' | 'down' | 'up') => {
      if (kind === 'move') {
        applyNudge(point)
        return
      }
      if (kind === 'down') {
        down.current = point
        return
      }
      // 'up'
      const nudging = !!useUiStore.getState().nudge
      if (nudging) {
        applyNudge(point)
        useUiStore.getState().clearNudge()
        down.current = null
        return
      }
      const start = down.current
      down.current = null
      if (!start) return
      if (Math.hypot(point.x - start.x, point.z - start.z) <= CLICK_MAX_DRAG_IN) onClick(point)
    },
    [onClick],
  )
}
