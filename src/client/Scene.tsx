// 3D scene (docs/spec/50-client.md §2). Pure readout of useGameStore + useUiStore — board clicks are
// translated into a placement draft (src/client/interaction/boardClick.ts) that the DOM decision
// prompt confirms; unit clicks are handled inside <UnitsLayer/>.
import { Canvas } from '@react-three/fiber'
import type { TerrainPieceData } from '@/data/types'
import { Board, Lighting, CameraRig, Objectives, Terrain } from './board'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { computeBoardClickDraft, DeathGhosts, PlacementOverlay, UnitsLayer, useBoardClick } from './interaction'

export function Scene() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const topDown = useUiStore((s) => s.topDown)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDraft = useUiStore((s) => s.setDraft)

  const onBoardClick = useBoardClick((point) => {
    if (!state || !pending || pending.player === botSeat) return
    const draft = computeBoardClickDraft(state, pending, deployTargetUnitId, point)
    if (draft) setDraft(draft)
  })

  if (!state) return null

  const objectives = Object.values(state.objectives)
    .filter((o) => !o.removed)
    .map((o) => ({ id: o.id, pos: o.pos }))
  const terrainPieces = Object.values(state.board.pieces) as TerrainPieceData[]

  return (
    <Canvas camera={{ position: [0, 40, 34], fov: 45, near: 0.1, far: 500 }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#0a0a10']} />
      <Lighting />
      <CameraRig topDown={topDown} />

      <Board deploymentZones={state.mission.data.deploymentZones} onBoardPointer={onBoardClick} />
      <Terrain pieces={terrainPieces} />
      <Objectives objectives={objectives} controller={(id) => state.objectives[id]?.controller ?? null} />

      <UnitsLayer />
      <PlacementOverlay />
      <DeathGhosts />
    </Canvas>
  )
}
