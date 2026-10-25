import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { isCameraDragModifier } from './cameraModifiers'
import { extrudedPolygonGeometry } from './geometry'
import { useThree } from '@react-three/fiber'
import { BATTLEFIELDS, useBattlefieldPBR } from './terrainAssets'
import { useUiStore } from '../ui/uiStore'
import { useGameStore } from '../store/game'
import { isMultiTouchActive, onMultiTouchStart } from './touchCamera'
import { handleMoveTap } from '../interaction/touchMoveTap'
import { canPreviewDeploy } from '../interaction/deployDrag'
import { beginPreviewDrag, cancelOneFinger, canPreviewDrag, getGesture, groundPointAt, installTouchGestures, liftFor, type TouchGesture } from '../interaction/touchGesture'
import { SIDE_COLOR, type DeploymentZones, type PlayerId } from './types'

export const BOARD_WIDTH_IN = 44
export const BOARD_DEPTH_IN = 30

/** Board size in inches from the live game state (the mission's board); the 44x30 defaults when no game exists. */
export function useBoardSize(): { w: number; h: number } {
  const w = useGameStore((s) => s.state?.board.w ?? BOARD_WIDTH_IN)
  const h = useGameStore((s) => s.state?.board.h ?? BOARD_DEPTH_IN)
  return { w, h }
}
const ZONE_TINT_HEIGHT = 0.015
const ZONE_TINT_THICKNESS = 0.01

type PointerHandler = (e: ThreeEvent<PointerEvent>) => void

/** The textured ground plane, split out so its useTexture() suspense boundary doesn't also gate
 *  the deployment-zone tints or pointer handling above it. */
function GroundMesh({
  width,
  depth,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onPointerOut,
}: {
  width: number
  depth: number
  onPointerMove: PointerHandler
  onPointerDown: PointerHandler
  onPointerUp: PointerHandler
  onPointerOut: PointerHandler
}) {
  const battlefieldIndex = useUiStore((s) => s.battlefieldIndex)
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const invalidate = useThree((s) => s.invalidate)
  // Baked 2048x1396 mats (art/board-textures/gen_mats.py): 1 texel ~ 1/46.5", mapped once over exactly the board.
  const { map, normalMap, roughnessMap } = useBattlefieldPBR(BATTLEFIELDS[battlefieldIndex].urls, Math.min(8, maxAniso))
  // frameloop="demand": a texture swap (HUD cycle button) must schedule its own repaint.
  useEffect(() => {
    invalidate()
  }, [map, normalMap, roughnessMap, invalidate])

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerOut={onPointerOut}
      receiveShadow
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial map={map} normalMap={normalMap} roughnessMap={roughnessMap} roughness={1} metalness={0} />
    </mesh>
  )
}

export interface BoardProps {
  width?: number
  depth?: number
  deploymentZones?: DeploymentZones
  /** Player deploying in the mission's attacker zone (`deploymentZones.A`); each zone is tinted in its
   *  occupant's colour. Before sides are chosen this defaults to A. */
  attacker?: PlayerId
  /** Fires with a board-space point (inches, board-centred) on pointer move/click over the mat. */
  onBoardPointer?: (point: { x: number; z: number }, kind: 'move' | 'down' | 'up' | 'hover' | 'leave') => void
}

/** The 44"x30" battle mat: textured ground plane and deployment-zone tint (§50-client §4). */
export function Board({ width: widthProp, depth: depthProp, deploymentZones, attacker = 'A', onBoardPointer }: BoardProps) {
  const size = useBoardSize()
  const width = widthProp ?? size.w
  const depth = depthProp ?? size.h
  const defender: PlayerId = attacker === 'A' ? 'B' : 'A'
  const dragging = useRef(false)
  const dom = useThree((s) => s.gl.domElement)
  const camera = useThree((s) => s.camera)

  // Phone layout: one finger belongs to the game (touchGesture.ts tracks it natively); a second finger
  // hands the touches to the camera and cancels whatever the first one was doing.
  useEffect(() => {
    const off = installTouchGestures(dom, camera)
    const offMulti = onMultiTouchStart(cancelOneFinger)
    return () => {
      off()
      offMulti()
    }
  }, [dom, camera])

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
  // Touch input (pointerType 'touch'): one finger = tap / drag / measure. A drag over the ground previews a
  // pending move exactly like mouse hover (the point is lifted above the fingertip so the finger does not
  // hide it) and lifting leaves the move staged for Confirm / Cancel (TouchActionBar); a drag on a placed
  // ghost nudges it (PlacementOverlay + useBoardClick); with Measure on it measures. Taps use the point
  // the finger landed on, so finger jitter never turns a click into a drag. Mouse/pen never come here.
  const emitTouch = (e: ThreeEvent<PointerEvent>, kind: 'move' | 'down' | 'up' | 'hover' | 'leave') => {
    if (!onBoardPointer) return
    if (kind === 'leave') return onBoardPointer({ x: e.point.x, z: e.point.z }, 'leave')
    const g: TouchGesture | null = getGesture()
    if (isMultiTouchActive() || !g || g.cancelled || g.id !== e.pointerId) return
    const raw = { x: e.point.x, z: e.point.z }
    if (!g.downPoint) g.downPoint = raw
    const lifted = () => groundPointAt(e.camera, dom, g.x, g.y, liftFor(g)) ?? raw
    const ui = useUiStore.getState()
    if (kind === 'down') return onBoardPointer(raw, 'down')
    if (kind === 'move' || kind === 'hover') {
      if (!g.dragged) return
      if (ui.measureOn) return onBoardPointer(raw, 'move')
      if (ui.nudge) return onBoardPointer(lifted(), 'move')
      // placing a unit (setup / reserves): touchGesture.ts drives that preview from the native finger stream, so it also
      // follows a fingertip that has slid off the mat (the formation rides 60px above the finger)
      if (canPreviewDeploy()) return
      if (canPreviewDrag()) {
        beginPreviewDrag(g)
        return onBoardPointer(lifted(), 'hover')
      }
      return
    }
    // 'up'
    if (!g.dragged) {
      // a tap on open ground stages a move, or says why not; a tap on a figure keeps its normal meaning (select / activate)
      if (handleMoveTap(g.downPoint, !!g.pressUnitId)) return
      return onBoardPointer(g.downPoint, 'up')
    }
    if (ui.measureOn) return onBoardPointer(raw, 'up')
    if (ui.nudge) return onBoardPointer(lifted(), 'up')
    if (g.previewDrag) {
      const p = lifted()
      if (handleMoveTap(p)) {
        // the drag ended somewhere the unit cannot go: leave things as they were before the finger went down
        useUiStore.getState().setDraft(g.preDraft)
        useUiStore.getState().setMovePreview(null)
        return
      }
      onBoardPointer(p, 'down')
      onBoardPointer(p, 'up')
    }
  }

  const emit = (e: ThreeEvent<PointerEvent>, kind: 'move' | 'down' | 'up' | 'hover' | 'leave') => {
    if (!onBoardPointer) return
    if (e.pointerType === 'touch') return emitTouch(e, kind)
    // buttonless movement is a hover (live move preview); leaving the mat clears it
    if (kind === 'leave') return onBoardPointer({ x: e.point.x, z: e.point.z }, 'leave')
    if (kind === 'move' && (e.buttons & 1) === 0) return isCameraDragModifier(e) ? undefined : onBoardPointer({ x: e.point.x, z: e.point.z }, 'hover')
    if (kind === 'down' && (e.button !== 0 || isCameraDragModifier(e))) return
    if (kind === 'move' && ((e.buttons & 1) === 0 || isCameraDragModifier(e))) return
    if (kind === 'up' && e.button !== 0) return
    onBoardPointer({ x: e.point.x, z: e.point.z }, kind)
  }

  return (
    <group>
      <Suspense fallback={null}>
        <GroundMesh
          width={width}
          depth={depth}
          onPointerMove={(e) => emit(e, 'move')}
          onPointerOut={(e) => emit(e, 'leave')}
          onPointerDown={(e) => {
            dragging.current = true
            emit(e, 'down')
          }}
          onPointerUp={(e) => {
            dragging.current = false
            emit(e, 'up')
          }}
        />
      </Suspense>

      {zoneGeometries && (
        <>
          <mesh position={[0, ZONE_TINT_HEIGHT, 0]} geometry={zoneGeometries.A}>
            <meshBasicMaterial color={SIDE_COLOR[attacker]} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[0, ZONE_TINT_HEIGHT, 0]} geometry={zoneGeometries.B}>
            <meshBasicMaterial color={SIDE_COLOR[defender]} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}
