// Small procedural-animation helpers shared by every body renderer. Nothing here is a real
// AnimationClip/mixer (30-figures.md §5 describes that as the eventual glTF-interchangeable
// shape); Phase A just drives bone-equivalent group transforms straight from elapsed time each
// frame, keyed off the `pose` prop — simplest thing that reads right at tabletop zoom.
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Material, Mesh, Object3D } from 'three'
import type { Pose } from './types'

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Smooth 0→1 ease, used for the one-shot poses (shoot/melee pulse-in, death topple). */
export function easeOut(t: number): number {
  const c = clamp01(t)
  return 1 - (1 - c) * (1 - c)
}

/** Tracks how long the current pose has been playing (resets on pose change) alongside the raw
 *  running clock, and calls `onFrame` with both every frame. */
export function usePoseFrame(pose: Pose, onFrame: (t: number, sincePose: number) => void): void {
  const startedAt = useRef(0)
  const prevPose = useRef<Pose>(pose)
  useFrame((state) => {
    if (prevPose.current !== pose) {
      prevPose.current = pose
      startedAt.current = state.clock.elapsedTime
    }
    onFrame(state.clock.elapsedTime, state.clock.elapsedTime - startedAt.current)
  })
}

function isMesh(obj: Object3D): obj is Mesh {
  return (obj as Mesh).isMesh === true
}

/** Returns a `fade(opacity)` setter for every material under `groupRef`, for the death pose's
 *  "fade while sinking" beat. Materials are collected once, lazily, on the first non-1 call (a
 *  one-time traversal at a rare event, not a per-frame cost) and cached — every later call just
 *  writes `.opacity` on the cached list. Safe to call every frame with 1 for a live figure; it
 *  no-ops until something actually needs fading. */
export function useMaterialFader(groupRef: RefObject<Object3D>): (opacity: number) => void {
  const materialsRef = useRef<Material[] | null>(null)
  return (opacity: number) => {
    if (!materialsRef.current) {
      if (opacity >= 1) return // nothing to reset yet — avoid collecting on every idle frame
      const root = groupRef.current
      if (!root) return
      const found: Material[] = []
      root.traverse((obj) => {
        if (!isMesh(obj) || !obj.material) return
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const m of mats) {
          m.transparent = true
          found.push(m)
        }
      })
      materialsRef.current = found
    }
    for (const m of materialsRef.current) m.opacity = opacity
  }
}
