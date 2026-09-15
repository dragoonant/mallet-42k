import { useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { isCameraDragModifier } from './cameraModifiers'
import { extrudedPolygonGeometry } from './geometry'
import { SIDE_COLOR, type DeploymentZones } from './types'

export const BOARD_WIDTH_IN = 44
export const BOARD_DEPTH_IN = 30
const GRID_STEP_IN = 6
const ZONE_TINT_HEIGHT = 0.015
const ZONE_TINT_THICKNESS = 0.01

export interface BoardProps {
  width?: number
  depth?: number
  deploymentZones?: DeploymentZones
  /** Fires with a board-space point (inches, board-centred) on pointer move/click over the mat. */
  onBoardPointer?: (point: { x: number; z: number }, kind: 'move' | 'down' | 'up') => void
}

/** The 44"x30" battle mat: ground plane, subtle inch grid, and deployment-zone tint (§50-client §4). */
export function Board({ width = BOARD_WIDTH_IN, depth = BOARD_DEPTH_IN, deploymentZones, onBoardPointer }: BoardProps) {
  const dragging = useRef(false)

  const zoneGeometries = useMemo(() => {
    if (!deploymentZones) return null
    return {
      A: extrudedPolygonGeometry(deploymentZones.A, ZONE_TINT_THICKNESS),
      B: extrudedPolygonGeometry(deploymentZones.B, ZONE_TINT_THICKNESS),
    }
  }, [deploymentZones])

  // M4 camera remap: left click/drag is the only button that drives board clicks/Measure/nudge, and
  // only when no camera-drag modifier (Space/Shift/Alt) is held — those combinations pan/rotate the
  // camera instead (CameraRig.tsx). Right/middle-button events never reach onBoardPointer at all, so
  // a right- or middle-drag orbit/pan can't also read as a click, a Measure drag, or a model nudge.
  const emit = (e: ThreeEvent<PointerEvent>, kind: 'move' | 'down' | 'up') => {
    if (!onBoardPointer) return
    if (kind === 'down' && (e.button !== 0 || isCameraDragModifier(e))) return
    if (kind === 'move' && ((e.buttons & 1) === 0 || isCameraDragModifier(e))) return
    if (kind === 'up' && e.button !== 0) return
    onBoardPointer({ x: e.point.x, z: e.point.z }, kind)
  }

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => emit(e, 'move')}
        onPointerDown={(e) => {
          dragging.current = true
          emit(e, 'down')
        }}
        onPointerUp={(e) => {
          dragging.current = false
          emit(e, 'up')
        }}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#3a3e4c" roughness={0.95} metalness={0} />
      </mesh>

      <Grid
        args={[width, depth]}
        position={[0, 0.01, 0]}
        cellSize={GRID_STEP_IN}
        cellThickness={1.0}
        cellColor="#7a8098"
        sectionSize={GRID_STEP_IN}
        sectionThickness={1.4}
        sectionColor="#a6acc4"
        fadeDistance={140}
        fadeStrength={1}
        infiniteGrid={false}
      />

      {zoneGeometries && (
        <>
          <mesh position={[0, ZONE_TINT_HEIGHT, 0]} geometry={zoneGeometries.A}>
            <meshBasicMaterial color={SIDE_COLOR.A} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[0, ZONE_TINT_HEIGHT, 0]} geometry={zoneGeometries.B}>
            <meshBasicMaterial color={SIDE_COLOR.B} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}
