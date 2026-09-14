// 3D scene (docs/spec/50-client.md §2). Pure readout of useGameStore + useUiStore — board clicks are
// translated into a placement draft (src/client/interaction/boardClick.ts) that the DOM decision
// prompt confirms; unit clicks are handled inside <UnitsLayer/>.
import { Canvas } from '@react-three/fiber'
import type { TerrainPieceData } from '@/data/types'
import { Board, CameraRig, Lighting, Objectives, Ruler, Terrain } from './board'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { computeBoardClickDraft, DeathGhosts, PlacementOverlay, resolveMeasureLine, UnitLabels, UnitsLayer, useBoardClick } from './interaction'

export function Scene() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const topDown = useUiStore((s) => s.topDown)
  const focusTarget = useUiStore((s) => s.focusTarget)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDraft = useUiStore((s) => s.setDraft)
  const selectUnit = useUiStore((s) => s.selectUnit)
  const measureOn = useUiStore((s) => s.measureOn)
  const measureLine = useUiStore((s) => s.measureLine)

  const onBoardClick = useBoardClick((point) => {
    // A click on a Figure also resolves here (the board plane sits behind every figure) — the unit
    // card is only left open by this when UnitsLayer's own handler re-selects it right after, so an
    // actual empty-board click is what ends up clearing the card.
    selectUnit(null)
    if (!state || !pending || pending.player === botSeat) return
    const draft = computeBoardClickDraft(state, pending, deployTargetUnitId, point)
    if (draft) setDraft(draft)
  })

  // Measure tool (M2, key M): while active, board pointer events drive a live ruler instead of the
  // normal click-to-place/select flow — down starts (or restarts) a drag, move updates the resolved
  // line (base-edge-to-base-edge when it started on a model and lands on an enemy one), up just ends
  // the drag and leaves the last measurement on screen until Esc or the next drag.
  //
  // Reads uiStore/gameStore via `.getState()` rather than the reactive values above: once a pointer
  // "down" lands on a mesh, react-three-fiber captures that pointer and keeps invoking the exact
  // handler closure attached at capture time for every following move/up — it does NOT swap in the
  // fresher closure a later Scene re-render would otherwise pass down — so anything this handler
  // reads has to be fetched live on each call instead of trusted from the render it was created in.
  const onBoardPointer = (point: { x: number; z: number }, kind: 'move' | 'down' | 'up') => {
    const ui = useUiStore.getState()
    if (ui.measureOn) {
      const liveState = useGameStore.getState().state
      if (!liveState) return
      if (kind === 'down') {
        ui.setMeasureAnchor(point)
        ui.setMeasureLine(resolveMeasureLine(liveState, point, point))
      } else if (kind === 'move' && ui.measureAnchor) {
        ui.setMeasureLine(resolveMeasureLine(liveState, ui.measureAnchor, point))
      } else if (kind === 'up') {
        ui.setMeasureAnchor(null)
      }
      return
    }
    onBoardClick(point, kind)
  }

  if (!state) return null

  const terrainPieces = Object.values(state.board.pieces) as TerrainPieceData[]

  return (
    // ~30% closer than the previous [0, 40, 34] start (figures were only ~15px tall at default zoom).
    <Canvas camera={{ position: [0, 28, 23.8], fov: 45, near: 0.1, far: 500 }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#0a0a10']} />
      <Lighting />
      <CameraRig topDown={topDown} focusTarget={focusTarget} />

      <Board deploymentZones={state.mission.data.deploymentZones} onBoardPointer={onBoardPointer} />
      <Terrain pieces={terrainPieces} />
      <Objectives />

      <UnitsLayer />
      <UnitLabels />
      <PlacementOverlay />
      <DeathGhosts />
      {measureOn && measureLine && <Ruler a={measureLine.a} b={measureLine.b} />}
    </Canvas>
  )
}
