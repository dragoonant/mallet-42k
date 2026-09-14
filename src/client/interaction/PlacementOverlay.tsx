// 3D preview for the decisions answered by clicking a board destination: deployment (formation
// preview in the chosen zone) and the four move-family decisions (range ring, engagement rings on
// enemies, ruler to the drafted destination). Pure read of game+ui state — dispatch happens from
// the DOM decision prompt's Confirm button (src/client/ui/DecisionPrompt.tsx).
import { enemyModelsOnBoard, unitModels } from '@/engine'
import { EngagementRing, MoveRangeRing, Ruler } from '../board'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { modelsAnchor } from './geometry'
import { placementInfo } from './decisions'

const MARKER_COLOR = '#f5d95a'

function DraftMarkers({ placements }: { placements: { modelId: string; pos: { x: number; z: number } }[] }) {
  return (
    <>
      {placements.map((p) => (
        <mesh key={p.modelId} position={[p.pos.x, 0.07, p.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.6, 24]} />
          <meshBasicMaterial color={MARKER_COLOR} transparent opacity={0.85} />
        </mesh>
      ))}
    </>
  )
}

export function PlacementOverlay() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const draft = useUiStore((s) => s.draft)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)

  if (!state || !pending || pending.player === botSeat) return null
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null

  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || activeDraft?.unitId !== deployTargetUnitId) return null
    return <DraftMarkers placements={activeDraft.placements} />
  }

  const info = placementInfo(pending)
  if (!info) return null
  const models = unitModels(state, info.unitId)
  if (models.length === 0) return null
  const anchor = modelsAnchor(models)
  const showEngagement = info.actionType === 'moveUnit' || info.actionType === 'chargeMove'
  const unitDraft = activeDraft?.unitId === info.unitId ? activeDraft : null

  return (
    <group>
      <MoveRangeRing pos={anchor} range={info.constraints.maxDistance} />
      {showEngagement &&
        enemyModelsOnBoard(state, pending.player).map((m) => (
          <EngagementRing key={m.id} pos={{ x: m.pos.x, z: m.pos.z }} baseRadius={m.base.radius} />
        ))}
      {unitDraft && (
        <>
          <Ruler a={anchor} b={unitDraft.anchor} />
          <DraftMarkers placements={unitDraft.placements} />
        </>
      )}
    </group>
  )
}
