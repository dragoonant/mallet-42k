// Two-finger touch camera for the phone layout (M11). One finger always belongs to the game (tap to
// select, drag models, drag to measure); the camera only ever moves with TWO fingers. Mouse and pen
// input are ignored completely, so desktop behaviour is unchanged.
//
// Gestures (all anchored so the ground point under the fingers stays under the fingers):
//   pinch            dolly toward the pinch midpoint (clamped to the controls' min/max distance)
//   midpoint drag    pan on the ground plane (y = 0); the orbit target is clamped to the board
//   twist            rotate the azimuth (the board turns with the fingers)
//   side-by-side fingers dragged straight up/down, with no pinch or twist: tilt the polar angle
//     within the controls' polar limits (decided in the first few pixels, then latched for the gesture)
//
// Exports:
//   isMultiTouchActive(): boolean
//       true from the moment a second finger lands until ALL touches lift. Board interactions should
//       ignore pointer input while it is true so the leftover finger after a camera gesture does not
//       become a stray tap or drag.
//   onMultiTouchStart(cb: () => void): () => void
//       cb fires the moment a second finger lands (before any camera motion) so a board interaction
//       can cancel its one-finger gesture. Returns an unsubscribe function.
//   cameraNudge = { rotate(deg), zoom(factor), topDown(), reset() }
//       imperative camera moves for on-screen buttons. rotate(deg): positive turns the board clockwise
//       as seen from above (same as a clockwise twist). zoom(factor): >1 zooms in, <1 zooms out, clamped
//       to the distance limits. topDown(): tilt to the straight-down view. reset(): back to the
//       standard overview (centred, default tilt, default zoom, facing the player's edge).
//       All are no-ops until the CameraRig has installed the handler.
//   installTouchCamera(opts): () => void
//       called once by CameraRig; wires the canvas and the nudge API, returns a cleanup function.
//
// No per-event allocations: all scratch vectors are module-level.
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export interface TouchCameraOptions {
  dom: HTMLElement
  camera: THREE.Camera
  controls: OrbitControlsImpl
  invalidate: () => void
  /** Clamp the orbit target (mutates in place) to the playable area. */
  clampTarget: (target: THREE.Vector3) => void
  /** Set the polar angle the rig eases toward (so its per-frame easing does not undo a tilt). */
  setPolarGoal: (polar: number) => void
  /** Called when a camera gesture or nudge starts, to cancel any in-flight focus ease. */
  cancelFocus: () => void
  overviewPolar: number
  topDownPolar: number
  /** True when the camera sits on the far (-z) edge. */
  getViewFromFar: () => boolean
}

const TILT_RAD_PER_PX = 0.005
const DECIDE_PX = 6
const MIN_FINGER_GAP = 8
const Y_AXIS = new THREE.Vector3(0, 1, 0)

const vA = new THREE.Vector3()
const vB = new THREE.Vector3()
const vOff = new THREE.Vector3()
const vNdc = new THREE.Vector3()

// ---- multi-touch session state (module-level so the board can query it without a hook) ----
let multiActive = false
const startListeners = new Set<() => void>()

export function isMultiTouchActive(): boolean {
  return multiActive
}

export function onMultiTouchStart(cb: () => void): () => void {
  startListeners.add(cb)
  return () => {
    startListeners.delete(cb)
  }
}

interface Installed {
  rotate(deg: number): void
  zoom(factor: number): void
  topDown(): void
  reset(): void
}
let installed: Installed | null = null

export const cameraNudge = {
  rotate(deg: number): void {
    installed?.rotate(deg)
  },
  zoom(factor: number): void {
    installed?.zoom(factor)
  },
  topDown(): void {
    installed?.topDown()
  },
  reset(): void {
    installed?.reset()
  },
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function installTouchCamera(opts: TouchCameraOptions): () => void {
  const { dom, camera, controls, invalidate, clampTarget, setPolarGoal, cancelFocus } = opts
  dom.style.touchAction = 'none'

  const homeDistance = camera.position.distanceTo(controls.target)
  const ids = [-1, -1]
  const xs = [0, 0]
  const ys = [0, 0]
  let count = 0
  let hasBaseline = false
  // previous-step values
  let pmx = 0
  let pmy = 0
  let pd = 0
  let pa = 0
  // gesture-start values (for the tilt-vs-pan decision)
  let smx = 0
  let smy = 0
  let sd = 0
  let sa = 0
  let sepX = 0
  let sepY = 0
  let mode: 0 | 1 | 2 = 0 // 0 undecided, 1 pan/zoom/rotate, 2 tilt
  let rectL = 0
  let rectT = 0
  let rectW = 1
  let rectH = 1

  const g = { mx: 0, my: 0, d: 0, a: 0, dx: 0, dy: 0 } // reused scratch, filled by readGeometry
  const readGeometry = () => {
    g.dx = xs[1] - xs[0]
    g.dy = ys[1] - ys[0]
    g.mx = (xs[0] + xs[1]) / 2
    g.my = (ys[0] + ys[1]) / 2
    g.d = Math.hypot(g.dx, g.dy)
    g.a = Math.atan2(g.dy, g.dx)
  }

  /** Ground-plane (y = 0) point under a client-space pixel; false if the ray misses the ground. */
  const groundAt = (px: number, py: number, out: THREE.Vector3): boolean => {
    vNdc.set(((px - rectL) / rectW) * 2 - 1, -((py - rectT) / rectH) * 2 + 1, 0.5).unproject(camera)
    const dyy = vNdc.y - camera.position.y
    if (dyy > -1e-6) return false
    const t = -camera.position.y / dyy
    out.set(camera.position.x + (vNdc.x - camera.position.x) * t, 0, camera.position.z + (vNdc.z - camera.position.z) * t)
    return true
  }

  const beginBaseline = () => {
    const r = dom.getBoundingClientRect()
    rectL = r.left
    rectT = r.top
    rectW = Math.max(r.width, 1)
    rectH = Math.max(r.height, 1)
    readGeometry()
    pmx = smx = g.mx
    pmy = smy = g.my
    pd = sd = g.d
    pa = sa = g.a
    sepX = g.dx
    sepY = g.dy
    mode = 0
    hasBaseline = true
  }

  const applyDistanceFactor = (v: THREE.Vector3, factor: number) => {
    const len = v.length()
    if (len < 1e-6) return
    const next = THREE.MathUtils.clamp(len * factor, controls.minDistance, controls.maxDistance)
    v.multiplyScalar(next / len)
  }

  /** Re-aims offset vector v at the given polar angle (clamped), keeping length and azimuth; returns the applied angle. */
  const setPolar = (v: THREE.Vector3, polar: number): number => {
    const len = v.length()
    if (len < 1e-6) return polar
    let hx = v.x
    let hz = v.z
    const hl = Math.hypot(hx, hz)
    if (hl < 1e-6) {
      hx = 0
      hz = 1
    } else {
      hx /= hl
      hz /= hl
    }
    const p = THREE.MathUtils.clamp(polar, controls.minPolarAngle, controls.maxPolarAngle)
    v.set(Math.sin(p) * hx * len, Math.cos(p) * len, Math.sin(p) * hz * len)
    return p
  }

  const commit = () => {
    camera.lookAt(controls.target)
    camera.updateMatrixWorld()
    invalidate()
  }

  const step = () => {
    readGeometry()
    if (mode === 0) {
      const moved = Math.hypot(g.mx - smx, g.my - smy)
      const pinched = Math.abs(g.d - sd)
      const twisted = Math.abs(wrapPi(g.a - sa))
      if (moved < DECIDE_PX && pinched < DECIDE_PX && twisted < 0.1) return
      const sideBySide = Math.abs(sepY) < 0.42 * Math.hypot(sepX, sepY)
      const vertical = Math.abs(g.my - smy) > 2 * Math.abs(g.mx - smx)
      mode = sideBySide && vertical && pinched < DECIDE_PX && twisted < 0.1 ? 2 : 1
      cancelFocus()
    }
    if (g.d < MIN_FINGER_GAP || pd < MIN_FINGER_GAP) {
      pmx = g.mx
      pmy = g.my
      pd = g.d
      pa = g.a
      return
    }
    camera.updateMatrixWorld()
    const target = controls.target
    vOff.copy(camera.position).sub(target)

    if (mode === 2) {
      const len = vOff.length()
      if (len > 1e-6) {
        const polar = Math.acos(THREE.MathUtils.clamp(vOff.y / len, -1, 1)) - (g.my - pmy) * TILT_RAD_PER_PX
        const applied = setPolar(vOff, polar)
        camera.position.copy(target).add(vOff)
        setPolarGoal(applied)
        commit()
      }
    } else {
      const anchored = groundAt(pmx, pmy, vA)
      applyDistanceFactor(vOff, pd / g.d)
      vOff.applyAxisAngle(Y_AXIS, wrapPi(g.a - pa))
      camera.position.copy(target).add(vOff)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      if (anchored && groundAt(g.mx, g.my, vB)) {
        vB.set(target.x + vA.x - vB.x, 0, target.z + vA.z - vB.z)
        clampTarget(vB)
        const sx = vB.x - target.x
        const sz = vB.z - target.z
        target.set(vB.x, 0, vB.z)
        camera.position.x += sx
        camera.position.z += sz
      }
      commit()
    }
    pmx = g.mx
    pmy = g.my
    pd = g.d
    pa = g.a
  }

  const slotOf = (id: number) => (ids[0] === id ? 0 : ids[1] === id ? 1 : -1)

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || e.target !== dom) return
    const slot = ids[0] === -1 ? 0 : ids[1] === -1 ? 1 : -1
    if (slot < 0) return
    ids[slot] = e.pointerId
    xs[slot] = e.clientX
    ys[slot] = e.clientY
    count++
    if (count === 2) {
      multiActive = true
      cancelFocus()
      beginBaseline()
      for (const cb of Array.from(startListeners)) cb()
    }
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const s = slotOf(e.pointerId)
    if (s < 0) return
    xs[s] = e.clientX
    ys[s] = e.clientY
    if (count === 2 && hasBaseline) step()
  }

  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const s = slotOf(e.pointerId)
    if (s < 0) return
    ids[s] = -1
    count--
    hasBaseline = false
    if (count === 0) multiActive = false
  }

  const reset2 = () => {
    ids[0] = ids[1] = -1
    count = 0
    hasBaseline = false
    multiActive = false
  }

  const capture = { capture: true } as const
  window.addEventListener('pointerdown', onDown, capture)
  window.addEventListener('pointermove', onMove, capture)
  window.addEventListener('pointerup', onUp, capture)
  window.addEventListener('pointercancel', onUp, capture)
  window.addEventListener('blur', reset2)

  // ---- imperative nudges (buttons) ----
  const nudge = (fn: (off: THREE.Vector3) => void) => {
    cancelFocus()
    camera.updateMatrixWorld()
    vOff.copy(camera.position).sub(controls.target)
    fn(vOff)
    camera.position.copy(controls.target).add(vOff)
    commit()
  }
  installed = {
    rotate(deg) {
      nudge((o) => {
        o.applyAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(deg))
      })
    },
    zoom(factor) {
      if (!(factor > 0)) return
      nudge((o) => applyDistanceFactor(o, 1 / factor))
    },
    topDown() {
      nudge((o) => {
        setPolar(o, opts.topDownPolar)
      })
      setPolarGoal(opts.topDownPolar)
    },
    reset() {
      cancelFocus()
      const target = controls.target
      target.set(0, 0, 0)
      const dist = THREE.MathUtils.clamp(homeDistance, controls.minDistance, controls.maxDistance)
      const az = opts.getViewFromFar() ? Math.PI : 0
      vOff.set(Math.sin(opts.overviewPolar) * Math.sin(az), Math.cos(opts.overviewPolar), Math.sin(opts.overviewPolar) * Math.cos(az)).multiplyScalar(dist)
      camera.position.copy(target).add(vOff)
      setPolarGoal(opts.overviewPolar)
      commit()
    },
  }

  return () => {
    window.removeEventListener('pointerdown', onDown, capture)
    window.removeEventListener('pointermove', onMove, capture)
    window.removeEventListener('pointerup', onUp, capture)
    window.removeEventListener('pointercancel', onUp, capture)
    window.removeEventListener('blur', reset2)
    installed = null
    reset2()
  }
}
