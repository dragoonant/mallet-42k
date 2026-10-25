import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useBoardSize } from './Board'
import { initCameraModifiers, isSpaceHeld } from './cameraModifiers'
import { installTouchCamera } from './touchCamera'
import { installTerrainProbe, probeEnabled } from './terrainProbe'
import { cameraApi, type CameraView } from './cameraApi'
import {
  cameraPose,
  easeInOut,
  maxDistanceFor,
  MIN_CAMERA_DISTANCE,
  TRANSITION_MS,
  type CameraPresetId,
} from './cameraPresets'

const TOP_DOWN_POLAR = THREE.MathUtils.degToRad(4)
const MIN_POLAR = THREE.MathUtils.degToRad(4)
const MAX_POLAR = Math.PI / 2.05
const TARGET_MARGIN = 4
/** WASD pan speed, inches per second. */
const PAN_SPEED = 22
const PAN_KEYS: Record<string, [number, number]> = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }

/** window event that asks the rig to tween back to the default overview framing (the viewer's home-edge preset). */
const OVERVIEW_EVENT = 'mallet:camera-overview'

/** Tweens the camera back to the default overview framing (the 'edgeA' preset for the viewer's side). Used by the
 *  phone deployment flow, which zooms in on the zone for each unit and must not leave the camera there for the
 *  rest of the game. */
export function requestCameraOverview(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OVERVIEW_EVENT))
}

export interface CameraRigProps {
  /** Mirrors uiStore.topDown. The T key/button already requests the 'top' / 'edgeA' preset through `preset`;
   *  kept so existing callers compile. */
  topDown?: boolean
  /** Board point (inches) the 'follow' preset centres on — the latest value wins; a fresh object each focus request. */
  focusTarget?: { x: number; z: number } | null
  /** View the board from the -z edge instead of the default +z edge (the viewer's deployment zone sits
   *  on the -z half). Flipping it swings the camera 180° about the board centre; manual orbiting in
   *  between is left alone. */
  viewFromFar?: boolean
  /** Latest named-preset request (uiStore.cameraPreset); a new `nonce` starts an eased tween to that pose. */
  preset?: { id: CameraPresetId; nonce: number } | null
}

interface Tween {
  t0: number
  fromP: THREE.Vector3
  toP: THREE.Vector3
  fromT: THREE.Vector3
  toT: THREE.Vector3
  /** Duration in ms (a preset uses TRANSITION_MS). */
  ms?: number
  /** Set by flyTo: told true when the tween arrived, false when something else took the camera first. */
  done?: (arrived: boolean) => void
}

/** Orbit camera clamped above the board (never dips below the mat): crisp (no damping), right-drag orbit,
 *  middle-drag / WASD pan, wheel zoom, and four named presets (top / edgeA / edgeB / follow) reached by
 *  eased, interruptible tweens of both the camera position and the orbit target. */
export function CameraRig({ focusTarget = null, viewFromFar = false, preset = null }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const tween = useRef<Tween | null>(null)
  const keys = useRef(new Set<string>())
  /** Every write to the tween goes through here, so a running flyTo is told it was cancelled. */
  const setTween = (next: Tween | null) => {
    const prev = tween.current
    tween.current = next
    if (prev && prev !== next) prev.done?.(false)
  }
  const setTweenRef = useRef(setTween)
  setTweenRef.current = setTween
  /** Times the player (or a preset request) has taken the camera; the director reads it to know when to keep its hands off. */
  const inputs = useRef(0)
  const takeOver = () => {
    inputs.current++
    setTweenRef.current(null)
  }
  const takeOverRef = useRef(takeOver)
  takeOverRef.current = takeOver
  const { camera, gl, scene } = useThree()
  useEffect(() => (probeEnabled() ? installTerrainProbe(scene) : undefined), [scene])
  const invalidate = useThree((s) => s.invalidate)
  const boardSize = useBoardSize()
  const boardRef = useRef(boardSize)
  boardRef.current = boardSize
  const focusRef = useRef(focusTarget)
  focusRef.current = focusTarget
  // The Canvas starts the camera on the edge the viewer sits at; track which edge we last put it on.
  const appliedFar = useRef(viewFromFar)

  /** Start an eased tween (camera position AND orbit target) to a preset pose. */
  const startTween = (id: CameraPresetId, focus?: { x: number; z: number }) => {
    const c = controls.current
    if (!c) return
    const pose = cameraPose(id, boardRef.current, focus, appliedFar.current ? -1 : 1)
    inputs.current++
    setTweenRef.current({
      t0: performance.now(),
      fromP: camera.position.clone(),
      toP: new THREE.Vector3(...pose.position),
      fromT: c.target.clone(),
      toT: new THREE.Vector3(...pose.target),
    })
    invalidate()
  }
  const startTweenRef = useRef(startTween)
  startTweenRef.current = startTween

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
      // Touch is driven by touchCamera.ts (two fingers only; one finger belongs to the game), so
      // switch OrbitControls' own touch handling off with a value no case matches.
      ;(c0.touches as { ONE: number; TWO: number }).ONE = -1
      ;(c0.touches as { ONE: number; TWO: number }).TWO = -1
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

  // Any user camera input (drag, wheel) cancels an in-flight preset tween.
  useEffect(() => {
    const c = controls.current
    if (!c) return undefined
    const onStart = () => takeOverRef.current()
    c.addEventListener('start', onStart)
    return () => c.removeEventListener('start', onStart)
  }, [])

  // Seat the orbit target on the opening pose (the Canvas only supplies the camera position).
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const pose = cameraPose('edgeA', boardRef.current, undefined, appliedFar.current ? -1 : 1)
    c.target.set(...pose.target)
    c.update()
    invalidate()
  }, [invalidate])

  // Viewer's edge changed: swing the camera 180° about the board centre.
  useEffect(() => {
    const c = controls.current
    if (!c || appliedFar.current === viewFromFar) return
    appliedFar.current = viewFromFar
    takeOverRef.current()
    camera.position.set(-camera.position.x, camera.position.y, -camera.position.z)
    c.target.set(-c.target.x, 0, -c.target.z)
    c.update()
    invalidate()
  }, [viewFromFar, camera, invalidate])

  // Two-finger touch camera + on-screen nudge buttons (see touchCamera.ts). Ignores mouse/pen input.
  useEffect(() => {
    const c = controls.current
    if (!c) return undefined
    const home = cameraPose('edgeA', boardRef.current, undefined, 1)
    const overviewPolar = Math.atan2(
      Math.hypot(home.position[0] - home.target[0], home.position[2] - home.target[2]),
      home.position[1] - home.target[1],
    )
    return installTouchCamera({
      dom: gl.domElement,
      camera,
      controls: c,
      invalidate,
      clampTarget: (t) => {
        t.x = THREE.MathUtils.clamp(t.x, -boardRef.current.w / 2 - TARGET_MARGIN, boardRef.current.w / 2 + TARGET_MARGIN)
        t.z = THREE.MathUtils.clamp(t.z, -boardRef.current.h / 2 - TARGET_MARGIN, boardRef.current.h / 2 + TARGET_MARGIN)
        t.y = 0
      },
      // No polar easing any more: tilts apply immediately.
      setPolarGoal: () => {},
      cancelFocus: () => takeOverRef.current(),
      overviewPolar,
      topDownPolar: TOP_DOWN_POLAR,
      getViewFromFar: () => appliedFar.current,
    })
  }, [gl, camera, invalidate])

  // Named preset requests (top / edgeA / edgeB / follow). 'follow' centres on the latest focusTarget, else
  // wherever the orbit target currently is.
  useEffect(() => {
    if (!preset) return
    let focus: { x: number; z: number } | undefined
    if (preset.id === 'follow') {
      const c = controls.current
      focus = focusRef.current ?? (c ? { x: c.target.x, z: c.target.z } : undefined)
    }
    startTweenRef.current(preset.id, focus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce])

  // Phone "back to overview" event.
  useEffect(() => {
    const onOverview = () => startTweenRef.current('edgeA')
    window.addEventListener(OVERVIEW_EVENT, onOverview)
    return () => window.removeEventListener(OVERVIEW_EVENT, onOverview)
  }, [])

  // WASD pan (ignored while typing or with ctrl/meta held).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return
      const k = e.key.toLowerCase()
      if (k in PAN_KEYS) {
        keys.current.add(k)
        takeOverRef.current()
        invalidate()
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase())
    }
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [invalidate])

  useEffect(() => {
    // e2e/dev hook: lets Playwright re-point the orbit target and camera distance directly (e.g.
    // over a group of just-deployed models) without simulating mouse drags/wheel zooms. This only
    // moves target + distance, preserving whatever azimuth/tilt the camera currently has.
    const w = window as unknown as { __malletCamera?: { lookAt(x: number, z: number, distanceIn: number): void; get(): { distance: number; azimuth: number; polar: number; fov: number; x: number; z: number } }; __malletProject?: (x: number, y: number, z: number) => { x: number; y: number } }
    // e2e hook: world point -> page pixel
    w.__malletProject = (x, y, z) => {
      camera.updateMatrixWorld()
      const v = new THREE.Vector3(x, y, z).project(camera)
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }
    w.__malletCamera = {
      get() {
        const c = controls.current
        return { distance: c ? c.getDistance() : camera.position.length(), azimuth: c ? c.getAzimuthalAngle() : 0, polar: c ? c.getPolarAngle() : 0, fov: (camera as THREE.PerspectiveCamera).fov, x: c ? c.target.x : 0, z: c ? c.target.z : 0 }
      },
      lookAt(x, z, distanceIn) {
        const c = controls.current
        if (!c) return
        takeOverRef.current()
        const dir = camera.position.clone().sub(c.target)
        dir.y = Math.max(dir.y, 0.1) // avoid a degenerate (near-zero) direction when already ~overhead
        dir.normalize().multiplyScalar(THREE.MathUtils.clamp(distanceIn, MIN_CAMERA_DISTANCE, maxDistanceFor(boardRef.current)))
        c.target.set(x, 0, z)
        camera.position.copy(c.target).add(dir)
        c.update()
        invalidate()
      },
    }
    return () => {
      delete w.__malletCamera
      delete w.__malletProject
    }
  }, [camera, gl, invalidate])

  // Imperative surface for the presentation director (cinematic shooting camera, deployment visits).
  useEffect(() => {
    // e2e hook: read-only exact camera pose (lens position + orbit target) for the cinematic-camera spec
    const hookWin = window as unknown as { __malletCameraView?: () => CameraView | null; __malletCameraArrive?: (arrived: boolean) => void }
    hookWin.__malletCameraView = () => cameraApi.current?.getView() ?? null
    cameraApi.current = {
      getView() {
        const t = controls.current?.target ?? new THREE.Vector3()
        return { position: [camera.position.x, camera.position.y, camera.position.z], target: [t.x, t.y, t.z] }
      },
      flyTo(view, ms) {
        const c = controls.current
        if (!c) return Promise.resolve(false)
        return new Promise<boolean>((resolve) => {
          const toP = new THREE.Vector3(...view.position)
          const toT = new THREE.Vector3(...view.target)
          const dur = Math.max(1, ms)
          let settled = false
          let guard: ReturnType<typeof setTimeout> | null = null
          const finish = (arrived: boolean) => {
            if (settled) return
            settled = true
            if (guard !== null) clearTimeout(guard)
            hookWin.__malletCameraArrive?.(arrived) // e2e hook: a flight ended
            resolve(arrived)
          }
          const tw: Tween = { t0: performance.now(), fromP: camera.position.clone(), toP, fromT: c.target.clone(), toT, ms: dur, done: finish }
          setTweenRef.current(tw)
          // A hidden tab stops animation frames: land the tween anyway so the presentation never waits on it.
          guard = setTimeout(() => {
            if (settled || tween.current !== tw) return
            camera.position.copy(toP)
            c.target.copy(toT)
            c.update()
            tween.current = null
            finish(true)
            invalidate()
          }, dur + 800)
          invalidate()
        })
      },
      inputCount: () => inputs.current,
      homeView: () => cameraPose('edgeA', boardRef.current, undefined, appliedFar.current ? -1 : 1),
      aspect: () => (camera as THREE.PerspectiveCamera).aspect || 1.6,
    }
    return () => {
      setTweenRef.current(null)
      cameraApi.current = null
      delete hookWin.__malletCameraView
    }
  }, [camera, invalidate])

  const fwd = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const move = useRef(new THREE.Vector3())
  useFrame((state, dt) => {
    const c = controls.current
    if (!c) return

    const tw = tween.current
    if (tw) {
      const f = Math.min(1, (performance.now() - tw.t0) / (tw.ms ?? TRANSITION_MS))
      const e = easeInOut(f)
      camera.position.lerpVectors(tw.fromP, tw.toP, e)
      c.target.lerpVectors(tw.fromT, tw.toT, e)
      if (f >= 1) {
        tween.current = null
        tw.done?.(true)
      }
      state.invalidate()
    }

    if (keys.current.size) {
      camera.getWorldDirection(fwd.current)
      fwd.current.y = 0
      fwd.current.normalize()
      right.current.crossVectors(fwd.current, camera.up).normalize()
      const speed = PAN_SPEED * Math.min(dt, 0.05)
      for (const k of keys.current) {
        const [dx, dz] = PAN_KEYS[k]!
        move.current.copy(right.current).multiplyScalar(dx * speed).addScaledVector(fwd.current, -dz * speed)
        camera.position.add(move.current)
        c.target.add(move.current)
      }
      state.invalidate()
    }

    // Keep the orbit target over (or just past the edge of) the board.
    c.target.x = THREE.MathUtils.clamp(c.target.x, -boardRef.current.w / 2 - TARGET_MARGIN, boardRef.current.w / 2 + TARGET_MARGIN)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -boardRef.current.h / 2 - TARGET_MARGIN, boardRef.current.h / 2 + TARGET_MARGIN)
    c.target.y = 0

    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      minDistance={MIN_CAMERA_DISTANCE}
      maxDistance={maxDistanceFor(boardSize)}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      screenSpacePanning={false}
    />
  )
}
