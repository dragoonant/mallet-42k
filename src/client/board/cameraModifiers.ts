// Shared "camera-drag modifier" state for the M4 mouse remap (see CameraRig.tsx): left-drag alone
// must never move the camera, so pan/rotate ride on modifier+left instead (trackpad fallback for
// users without a middle/right mouse button). CameraRig reads this to pick OrbitControls' dynamic
// LEFT button behavior at pointerdown; Board.tsx and the placement-nudge grab handler read it so that
// same modifier+left-drag is never also read as a board click, a Measure-tool drag, or a model nudge.
let spaceHeld = false
let hoveringCanvas = false

function onKeyDown(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  spaceHeld = true
  if (hoveringCanvas) e.preventDefault() // don't let Space scroll the page while panning the board
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = false
}

function onBlur() {
  spaceHeld = false
}

/** Call once from CameraRig on mount (with the canvas element); wires the window-level key tracking
 *  and scopes the scroll-prevention to hovering the canvas. Returns a cleanup function. */
export function initCameraModifiers(canvas: HTMLElement): () => void {
  const onEnter = () => {
    hoveringCanvas = true
  }
  const onLeave = () => {
    hoveringCanvas = false
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('pointerenter', onEnter)
  canvas.addEventListener('pointerleave', onLeave)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    canvas.removeEventListener('pointerenter', onEnter)
    canvas.removeEventListener('pointerleave', onLeave)
    hoveringCanvas = false
  }
}

export function isSpaceHeld(): boolean {
  return spaceHeld
}

/** True when a pointer event's modifiers mean "this drag drives the camera, not a game object" —
 *  Space or Shift (pan) or Alt (rotate). Mirrors CameraRig's dynamic mouseButtons.LEFT mapping. */
export function isCameraDragModifier(e: { shiftKey?: boolean; altKey?: boolean }): boolean {
  return spaceHeld || !!e.shiftKey || !!e.altKey
}
