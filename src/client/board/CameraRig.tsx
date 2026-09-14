import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { BOARD_DEPTH_IN, BOARD_WIDTH_IN } from './Board'

const OVERVIEW_POLAR = THREE.MathUtils.degToRad(55)
const TOP_DOWN_POLAR = THREE.MathUtils.degToRad(4)
const MIN_POLAR = THREE.MathUtils.degToRad(4)
const MAX_POLAR = THREE.MathUtils.degToRad(82)
const TARGET_MARGIN = 6

export interface CameraRigProps {
  /** Ease toward a straight-down view when true, back to the standard overview when false. */
  topDown?: boolean
  minDistance?: number
  maxDistance?: number
}

/** Orbit camera clamped above the board (never dips below the mat) with a top-down toggle. */
export function CameraRig({ topDown = false, minDistance = 5, maxDistance = 150 }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const targetPolar = useRef(OVERVIEW_POLAR)

  useEffect(() => {
    targetPolar.current = topDown ? TOP_DOWN_POLAR : OVERVIEW_POLAR
  }, [topDown])

  useFrame(() => {
    const c = controls.current
    if (!c) return

    // Keep the orbit target over (or just past the edge of) the board.
    c.target.x = THREE.MathUtils.clamp(c.target.x, -BOARD_WIDTH_IN / 2 - TARGET_MARGIN, BOARD_WIDTH_IN / 2 + TARGET_MARGIN)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -BOARD_DEPTH_IN / 2 - TARGET_MARGIN, BOARD_DEPTH_IN / 2 + TARGET_MARGIN)
    c.target.y = 0

    const current = c.getPolarAngle()
    const next = THREE.MathUtils.lerp(current, targetPolar.current, 0.12)
    if (Math.abs(next - current) > 0.0005) c.setPolarAngle(next)

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
    />
  )
}
