// One-finger touch gesture state for the board (M11 phone support). Mouse and pen input never touch this
// file's state, so desktop behaviour is unchanged.
//
// Rule of the phone layout: one finger always belongs to the game (tap = click, drag a model, drag to
// measure, press-and-hold for unit info); the camera only moves with TWO fingers (board/touchCamera.ts).
//
// How it fits together:
//   - Board.tsx installs native pointer listeners (installTouchGestures) that run BEFORE react-three-fiber
//     sees the same event, so the gesture (start point, drag latch, long-press timer) is known by the time
//     any R3F handler runs. R3F handlers that stop propagation (a ghost marker's pointerdown) therefore
//     cannot hide a touch from the gesture tracker.
//   - Board.tsx's touch branch reads the gesture to decide what a move/up means (hover-style move preview,
//     nudge with a lifted point, measure, or nothing) and forwards plain onBoardPointer events.
//   - UnitsLayer reports which unit is under the finger (pressUnit) so a long press can open its card.
//   - A second finger landing (touchCamera.onMultiTouchStart) calls cancelOneFinger(), which restores the
//     state the gesture started from.
//
// Constants: DRAG_PX 10 (below it the touch is still a tap / long-press candidate), LONG_PRESS_MS 450,
// LIFT_PX 60 (a dragged model sits this far above the fingertip so the finger does not hide it; eased in
// over the first 30 px of drag so nothing jumps).
import * as THREE from 'three'
import { create } from 'zustand'
import { useGameStore } from '../store/game'
import { useUiStore, type MeasureLine, type PlacementDraft } from '../ui/uiStore'
import { isMultiTouchActive } from '../board/touchCamera'
import { isClampedMovePending } from './moveClamp'
import { updateMoveHover } from './moveHover'
import { beginDeployDrag, canPreviewDeploy, cancelDeployPreview, isDeployDragging, liftDeployDrag } from './deployDrag'

export const DRAG_PX = 10
export const LONG_PRESS_MS = 450
export const LIFT_PX = 60
const LIFT_EASE_PX = 30

export interface TouchGesture {
  id: number
  startX: number
  startY: number
  x: number
  y: number
  /** moved at least DRAG_PX from where it started (latched) */
  dragged: boolean
  cancelled: boolean
  /** the pointer lifted (kept until the next task so R3F's pointerup handlers can still read it) */
  ended: boolean
  /** unit whose figure is under the finger, reported by UnitsLayer */
  pressUnitId: string | null
  /** first board point R3F reported for this gesture */
  downPoint: { x: number; z: number } | null
  /** a ground drag is driving the live move preview */
  previewDrag: boolean
  preDraft: PlacementDraft | null
  preMeasureLine: MeasureLine | null
  preMeasureAnchor: { x: number; z: number } | null
  timer: ReturnType<typeof setTimeout> | null
}

let gesture: TouchGesture | null = null
let suppressClick = false
let suppressTimer: ReturnType<typeof setTimeout> | null = null

export function getGesture(): TouchGesture | null {
  return gesture
}

/** True right after a long press opened unit info: the click that follows the lift must do nothing. */
export function isUnitClickSuppressed(): boolean {
  return suppressClick
}

/** UnitsLayer: a touch went down on this unit's figure (nearest hit reports first). */
export function pressUnit(unitId: string): void {
  if (gesture && !gesture.cancelled && !gesture.pressUnitId) gesture.pressUnitId = unitId
}

// ---- "Whole unit" toggle (replaces Shift+drag on touch) ----
interface WholeUnitState {
  on: boolean
  set(on: boolean): void
}
export const useWholeUnit = create<WholeUnitState>((set) => ({ on: false, set: (on) => set({ on }) }))
/** Reads and clears the toggle: it applies to the next drag only. */
export function takeWholeUnit(): boolean {
  const { on, set } = useWholeUnit.getState()
  if (on) set(false)
  return on
}

// ---- gesture lifecycle ----

/** How far (px) a dragged model is lifted above the fingertip right now. */
export function liftFor(g: TouchGesture): number {
  const moved = Math.hypot(g.x - g.startX, g.y - g.startY)
  return LIFT_PX * Math.min(1, Math.max(0, (moved - DRAG_PX) / LIFT_EASE_PX))
}

const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hit = new THREE.Vector3()

/** The ground-plane point under screen position (clientX, clientY - liftPx), or null when the ray misses. */
export function groundPointAt(camera: THREE.Camera, el: HTMLElement, clientX: number, clientY: number, liftPx: number): { x: number; z: number } | null {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - liftPx - r.top) / r.height) * 2 - 1))
  ray.setFromCamera(ndc, camera)
  return ray.ray.intersectPlane(groundPlane, hit) ? { x: hit.x, z: hit.z } : null
}

/** Whether a ground drag should drive the hover-style preview: a clamped move, or a unit being placed by a
 *  deployUnit decision (setup / reserves arrival), is pending for the local player. */
export function canPreviewDrag(): boolean {
  const { pending, botSeat } = useGameStore.getState()
  const ui = useUiStore.getState()
  if (canPreviewDeploy()) return true
  return !!pending && pending.player !== botSeat && isClampedMovePending(pending) && !ui.nudge && !ui.measureOn
}

/** First move of a ground drag that previews a move: a staged draft is lifted out so the preview can show again. */
export function beginPreviewDrag(g: TouchGesture): void {
  if (g.previewDrag) return
  g.previewDrag = true
  if (canPreviewDeploy()) {
    // a deployment drag leaves the staged draft in place (hidden under the live preview) until the lift replaces it,
    // so cancelling the gesture with a second finger needs no restoring
    beginDeployDrag()
    return
  }
  const ui = useUiStore.getState()
  if (ui.draft) ui.setDraft(null)
}

/** Drops the one-finger gesture and restores the state it started from (second finger landed, pointercancel, long press). */
export function cancelOneFinger(): void {
  const g = gesture
  if (!g || g.cancelled || g.ended) return
  g.cancelled = true
  if (g.timer) clearTimeout(g.timer)
  g.timer = null
  const ui = useUiStore.getState()
  if (ui.nudge) ui.clearNudge()
  if (ui.draft !== g.preDraft) ui.setDraft(g.preDraft)
  updateMoveHover(null)
  cancelDeployPreview()
  ui.setMovePreview(null)
  if (ui.measureOn) {
    ui.setMeasureAnchor(g.preMeasureAnchor)
    ui.setMeasureLine(g.preMeasureLine)
  }
}

function endSuppressLater(): void {
  if (suppressTimer) clearTimeout(suppressTimer)
  suppressTimer = setTimeout(() => {
    suppressClick = false
    suppressTimer = null
  }, 700)
}

function longPress(): void {
  const g = gesture
  if (!g || g.cancelled || g.dragged || g.ended || !g.pressUnitId) return
  const unitId = g.pressUnitId
  cancelOneFinger()
  suppressClick = true
  endSuppressLater()
  useUiStore.getState().selectUnit(unitId)
  try {
    navigator.vibrate?.(12)
  } catch {
    /* haptics are optional */
  }
}

/**
 * Installs the native listeners for `canvas`. Capture-phase on document/window so they run before
 * react-three-fiber's own handlers for the same event. Returns a cleanup function.
 */
export function installTouchGestures(canvas: HTMLElement, camera?: THREE.Camera): () => void {
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || e.target !== canvas) return
    suppressClick = false
    if (gesture && !gesture.ended && !gesture.cancelled && gesture.id !== e.pointerId) {
      cancelOneFinger() // a second finger: the camera owns the touches now
      return
    }
    if (isMultiTouchActive()) return
    const ui = useUiStore.getState()
    const g: TouchGesture = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dragged: false,
      cancelled: false,
      ended: false,
      pressUnitId: null,
      downPoint: null,
      previewDrag: false,
      preDraft: ui.draft,
      preMeasureLine: ui.measureLine,
      preMeasureAnchor: ui.measureAnchor,
      timer: null,
    }
    g.timer = setTimeout(longPress, LONG_PRESS_MS)
    gesture = g
  }
  const onMove = (e: PointerEvent) => {
    const g = gesture
    if (!g || g.ended || g.id !== e.pointerId) return
    g.x = e.clientX
    g.y = e.clientY
    if (!g.dragged && Math.hypot(g.x - g.startX, g.y - g.startY) >= DRAG_PX) {
      g.dragged = true
      if (g.timer) clearTimeout(g.timer)
      g.timer = null
    }
    // Placing a unit (setup / reserves arrival): the formation follows the finger from this native stream, not from
    // react-three-fiber's pointer events, so it keeps following when the fingertip (60px below the formation) slides
    // off the mat — a zone along the near board edge would otherwise lose the finger exactly where it is needed.
    if (g.dragged && !g.cancelled && camera && canPreviewDeploy() && !isMultiTouchActive()) {
      beginPreviewDrag(g)
      const p = groundPointAt(camera, canvas, g.x, g.y, liftFor(g))
      if (p) updateMoveHover(p)
    }
  }
  const onUp = (e: PointerEvent) => {
    const g = gesture
    if (!g || g.ended || g.id !== e.pointerId) return
    g.x = e.clientX
    g.y = e.clientY
    if (g.timer) clearTimeout(g.timer)
    g.timer = null
    if (e.type === 'pointercancel') cancelOneFinger()
    else if (!g.cancelled && g.previewDrag && camera && isDeployDragging()) {
      // the lift stages the formation where it hovers as the draft; it never deploys (Confirm in the prompt commits)
      const p = groundPointAt(camera, canvas, g.x, g.y, liftFor(g))
      updateMoveHover(null)
      useUiStore.getState().selectUnit(null)
      if (p) liftDeployDrag(p)
      else cancelDeployPreview()
      g.previewDrag = false
    }
    g.ended = true
    if (suppressClick) endSuppressLater()
    // R3F's pointerup handlers run later in this same dispatch; drop the gesture afterwards.
    setTimeout(() => {
      if (gesture === g) gesture = null
    }, 0)
  }
  document.addEventListener('pointerdown', onDown, true)
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onUp, true)
  return () => {
    document.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onUp, true)
    if (gesture?.timer) clearTimeout(gesture.timer)
    gesture = null
  }
}
