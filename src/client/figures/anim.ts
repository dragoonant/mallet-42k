// Small procedural-animation helpers shared by every body renderer. Nothing here is a real
// AnimationClip/mixer (30-figures.md §5 describes that as the eventual glTF-interchangeable
// shape); Phase A just drives bone-equivalent group transforms straight from elapsed time each
// frame, keyed off the `pose` prop — simplest thing that reads right at tabletop zoom.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
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
