import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useBoardSize } from './Board'
import { initCameraModifiers, isSpaceHeld } from './cameraModifiers'

const OVERVIEW_POLAR = THREE.MathUtils.degToRad(55)
const TOP_DOWN_POLAR = THREE.MathUtils.degToRad(4)
const MIN_POLAR = THREE.MathUtils.degToRad(4)
const MAX_POLAR = THREE.MathUtils.degToRad(82)
const TARGET_MARGIN = 4
/** Pleasant framing distance for the "focus selected unit" button — close enough to read the
 *  model, far enough to still see nearby terrain/enemies for context. */
const FOCUS_DISTANCE_IN = 16
const FOCUS_EASE = 0.12
const FOCUS_DONE_EPS = 0.05

export interface CameraRigProps {
  /** Ease toward a straight-down view when true, back to the standard overview when false. */
  topDown?: boolean
  minDistance?: number
  maxDistance?: number
  /** Board point (inches) to smoothly recentre the orbit target on — pass a fresh object each time
   *  (even for the same point) to retrigger; consumed once and then left alone. */
  focusTarget?: { x: number; z: number } | null
  /** View the board from the -z edge instead of the default +z edge (the viewer's deployment zone sits
   *  on the -z half). Flipping it swings the camera 180° about the board centre; manual orbiting in
   *  between is left alone. */
  viewFromFar?: boolean
}

/** Orbit camera clamped above the board (never dips below the mat) with a top-down toggle and a
 *  smooth "focus on this point" request (uiStore.focusTarget, driven by the HUD's Focus button/key F). */
export function CameraRig({ topDown = false, minDistance = 5, maxDistance = 150, focusTarget = null, viewFromFar = false }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const targetPolar = useRef(OVERVIEW_POLAR)
  const pendingFocus = useRef<{ x: number; z: number } | null>(null)
  const { camera, gl } = useThree()
  const invalidate = useThree((s) => s.invalidate)
  const boardSize = useBoardSize()
  const boardRef = useRef(boardSize)
  boardRef.current = boardSize

  useEffect(() => {
    targetPolar.current = topDown ? TOP_DOWN_POLAR : OVERVIEW_POLAR
  }, [topDown])

  // Mouse remap: left never orbits the camera by itself (it's reserved for picking/measuring/nudging
  // game objects) — middle-drag pans, right-drag orbits, and left only drives the camera when a
  // trackpad-fallback modifier is held (Space/Shift = pan, Alt = rotate). MIDDLE/RIGHT are static;
  // LEFT is recomputed on every pointerdown from the live modifier keys. Set imperatively (not as a
  // reactive `mouseButtons` JSX prop) so a CameraRig re-render mid-drag can't clobber the LEFT value
  // this listener just set. A window-level *capture* listener runs before OrbitControls' own
  // (bubble-phase) pointerdown listener on the canvas, guaranteeing our LEFT assignment lands first.
  useEffect(() => {
    const dom = gl.domElement
    const c0 = controls.current
    if (c0) {
      c0.mouseButtons.MIDDLE = THREE.MOUSE.PAN
      c0.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
      c0.mouseButtons.LEFT = undefined
    }
    const cleanupModifiers = initCameraModifiers(dom)
    const onPointerDownCapture = (e: PointerEvent) => {
      const c = controls.current
      if (!c || e.button !== 0) return
      if (isSpaceHeld() || e.shiftKey) c.mouseButtons.LEFT = THREE.MOUSE.PAN
      else if (e.altKey) c.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      else c.mouseButtons.LEFT = undefined
    }
    window.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
    return () => {
      cleanupModifiers()
      window.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
    }
  }, [gl])

  // The Canvas starts the camera on the +z edge; track which edge we last put it on.
  const appliedFar = useRef(false)
  useEffect(() => {
    const c = controls.current
    if (!c || appliedFar.current === viewFromFar) return
    appliedFar.current = viewFromFar
    camera.position.set(-camera.position.x, camera.position.y, -camera.position.z)
    c.target.set(-c.target.x, 0, -c.target.z)
    c.update()
    invalidate()
  }, [viewFromFar, camera, invalidate])

  useEffect(() => {
    if (focusTarget) pendingFocus.current = { x: focusTarget.x, z: focusTarget.z }
  }, [focusTarget])

  useEffect(() => {
    // e2e/dev hook: lets Playwright re-point the orbit target and camera distance directly (e.g.
    // over a group of just-deployed models) without simulating mouse drags/wheel zooms. The
    // topDown lerp above still owns the viewing angle — this only moves target + distance,
    // preserving whatever azimuth the camera currently has.
    const w = window as unknown as { __malletCamera?: { lookAt(x: number, z: number, distanceIn: number): void } }
    w.__malletCamera = {
      lookAt(x, z, distanceIn) {
        const c = controls.current
        if (!c) return
        const dir = camera.position.clone().sub(c.target)
        dir.y = Math.max(dir.y, 0.1) // avoid a degenerate (near-zero) direction when already ~overhead
        dir.normalize().multiplyScalar(THREE.MathUtils.clamp(distanceIn, minDistance, maxDistance))
        c.target.set(x, 0, z)
        camera.position.copy(c.target).add(dir)
        c.update()
        invalidate()
      },
    }
    return () => {
      delete w.__malletCamera
    }
  }, [camera, invalidate, minDistance, maxDistance])

  useFrame((state) => {
    const c = controls.current
    if (!c) return

    if (pendingFocus.current) {
      state.invalidate()
      const { x: tx, z: tz } = pendingFocus.current
      const dir = camera.position.clone().sub(c.target)
      const curDist = Math.max(dir.length(), 0.001)
      dir.normalize()
      const nextTx = THREE.MathUtils.lerp(c.target.x, tx, FOCUS_EASE)
      const nextTz = THREE.MathUtils.lerp(c.target.z, tz, FOCUS_EASE)
      const desiredDist = THREE.MathUtils.clamp(FOCUS_DISTANCE_IN, minDistance, maxDistance)
      const nextDist = THREE.MathUtils.lerp(curDist, desiredDist, FOCUS_EASE)
      c.target.set(nextTx, 0, nextTz)
      camera.position.copy(c.target).add(dir.multiplyScalar(nextDist))
      if (Math.hypot(nextTx - tx, nextTz - tz) < FOCUS_DONE_EPS && Math.abs(nextDist - desiredDist) < FOCUS_DONE_EPS) {
        pendingFocus.current = null
      }
    }

    // Keep the orbit target over (or just past the edge of) the board.
    c.target.x = THREE.MathUtils.clamp(c.target.x, -boardRef.current.w / 2 - TARGET_MARGIN, boardRef.current.w / 2 + TARGET_MARGIN)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -boardRef.current.h / 2 - TARGET_MARGIN, boardRef.current.h / 2 + TARGET_MARGIN)
    c.target.y = 0

    const current = c.getPolarAngle()
    const next = THREE.MathUtils.lerp(current, targetPolar.current, 0.12)
    if (Math.abs(next - current) > 0.0005) {
      c.setPolarAngle(next)
      state.invalidate()
    }

    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      screenSpacePanning={false}
    />
  )
}
