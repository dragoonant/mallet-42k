// 3D scene (docs/spec/50-client.md §2). Pure readout of useGameStore + useUiStore — board clicks are
// translated into a placement draft (src/client/interaction/boardClick.ts) that the DOM decision
// prompt confirms; unit clicks are handled inside <UnitsLayer/>.
import { Canvas } from '@react-three/fiber'
import type { TerrainPieceData } from '@/data/types'
import { Board, Lighting, CameraRig, Objectives, Terrain } from './board'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { computeBoardClickDraft, DeathGhosts, PlacementOverlay, UnitLabels, UnitsLayer, useBoardClick } from './interaction'

export function Scene() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const topDown = useUiStore((s) => s.topDown)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDraft = useUiStore((s) => s.setDraft)
  const selectUnit = useUiStore((s) => s.selectUnit)

  const onBoardClick = useBoardClick((point) => {
    // A click on a Figure also resolves here (the board plane sits behind every figure) — the unit
    // card is only left open by this when UnitsLayer's own handler re-selects it right after, so an
    // actual empty-board click is what ends up clearing the card.
    selectUnit(null)
    if (!state || !pending || pending.player === botSeat) return
    const draft = computeBoardClickDraft(state, pending, deployTargetUnitId, point)
    if (draft) setDraft(draft)
  })

  if (!state) return null

  const terrainPieces = Object.values(state.board.pieces) as TerrainPieceData[]

  return (
    // ~30% closer than the previous [0, 40, 34] start (figures were only ~15px tall at default zoom).
    <Canvas camera={{ position: [0, 28, 23.8], fov: 45, near: 0.1, far: 500 }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#0a0a10']} />
      <Lighting />
      <CameraRig topDown={topDown} />

      <Board deploymentZones={state.mission.data.deploymentZones} onBoardPointer={onBoardClick} />
      <Terrain pieces={terrainPieces} />
      <Objectives />

      <UnitsLayer />
      <UnitLabels />
      <PlacementOverlay />
      <DeathGhosts />
    </Canvas>
  )
}
