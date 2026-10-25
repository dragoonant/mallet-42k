// Drag / hover preview for deployUnit decisions (initial deployment AND reserves arriving mid-game — the engine
// asks both as `deployUnit`, only the window differs: 'deployment.unit' vs 'movement.reinforcements' / disembark).
//
// While a unit is chosen, moving the pointer over the board (no button), or pressing and dragging (mouse button
// or one finger), shows the whole formation at the pointer through the same zone clamp / oversize-edge snap /
// infiltrator / Cult-Ambush logic a click uses (boardClick.ts). Nothing is dispatched: lifting only stages the
// draft, and Confirm in the prompt still commits. Stores are read through getState() (captured-pointer closures
// go stale — see useBoardClick.ts).
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { computeBoardClickDraft } from './boardClick'

let dragging = false

/** The pending deployUnit decision is the human's and a unit is chosen: a pointer can preview its placement. */
export function canPreviewDeploy(): boolean {
  const { state, pending, botSeat } = useGameStore.getState()
  const ui = useUiStore.getState()
  return (
    !!state &&
    !!pending &&
    pending.kind === 'deployUnit' &&
    pending.player !== botSeat &&
    !!ui.deployTargetUnitId &&
    pending.context.unitIds.includes(ui.deployTargetUnitId) &&
    !ui.nudge &&
    !ui.measureOn
  )
}

/** A press-and-drag (mouse button held / one finger down and moved) is driving the preview right now. */
export function isDeployDragging(): boolean {
  return dragging
}

export function beginDeployDrag(): void {
  dragging = true
}

/** Drops the preview (and any drag in progress) without touching the staged draft. */
export function cancelDeployPreview(): void {
  dragging = false
  const ui = useUiStore.getState()
  if (ui.deployPreview) ui.setDeployPreview(null)
}

/** Recomputes the preview for `point`. Hover-only previews step aside for a staged draft; a drag overrides it
 *  (the staged draft stays untouched until the lift replaces it, so cancelling restores it for free). */
export function updateDeployPreview(point: { x: number; z: number }): void {
  const { state, pending } = useGameStore.getState()
  const ui = useUiStore.getState()
  if (!canPreviewDeploy() || !state || !pending) {
    if (ui.deployPreview) ui.setDeployPreview(null)
    return
  }
  const staged = ui.draft?.decisionId === pending.id
  if (staged && !dragging) {
    if (ui.deployPreview) ui.setDeployPreview(null)
    return
  }
  const draft = computeBoardClickDraft(state, pending, ui.deployTargetUnitId, point, { preview: true })
  ui.setDeployPreview(draft)
}

/** Pointer lifted after a drag: stage the formation at `point` as the draft (exactly what a click there does).
 *  Never dispatches an action — Confirm in the prompt commits. Returns true when a draft was staged. */
export function liftDeployDrag(point: { x: number; z: number }): boolean {
  dragging = false
  const { state, pending } = useGameStore.getState()
  const ui = useUiStore.getState()
  ui.setDeployPreview(null)
  if (!canPreviewDeploy() || !state || !pending) return false
  const draft = computeBoardClickDraft(state, pending, ui.deployTargetUnitId, point)
  if (!draft) return false
  ui.setDraft(draft)
  ui.setMovePreview(null)
  return true
}
