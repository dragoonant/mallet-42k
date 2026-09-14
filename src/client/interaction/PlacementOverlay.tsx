// 3D preview for the decisions answered by clicking a board destination: deployment (formation
// preview in the chosen zone) and the four move-family decisions (range ring, engagement rings on
// enemies, ruler to the drafted destination). Pure read of game+ui state — dispatch happens from
// the DOM decision prompt's Confirm button (src/client/ui/DecisionPrompt.tsx).
import { enemyModelsOnBoard, type UnitId } from '@/engine'
import { EngagementRing, MoveRangeRing, Ruler } from '../board'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { colors } from '../ui/theme'
import { combinedUnitModels, modelsAnchor, placementsOverlapExisting } from './geometry'
import { placementInfo } from './decisions'

const OK_COLOR = '#f5d95a'
const BLOCKED_COLOR = colors.danger
const GHOST_COLOR = '#8fa8ff'

function DraftMarkers({
  placements,
  color = OK_COLOR,
  opacity = 0.85,
}: {
  placements: { modelId: string; pos: { x: number; z: number } }[]
  color?: string
  opacity?: number
}) {
  return (
    <>
      {placements.map((p) => (
        <mesh key={p.modelId} position={[p.pos.x, 0.07, p.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.6, 24]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} />
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
  const previewDraft = useUiStore((s) => s.previewDraft)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)

  if (!state || !pending || pending.player === botSeat) return null
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null
  const ghost = previewDraft && previewDraft.decisionId === pending.id && !activeDraft ? previewDraft : null

  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || activeDraft?.unitId !== deployTargetUnitId) return null
    const blocked = placementsOverlapExisting(state, activeDraft.placements)
    return <DraftMarkers placements={activeDraft.placements} color={blocked ? BLOCKED_COLOR : OK_COLOR} />
  }

  const info = placementInfo(pending)
  if (!info) return null
  const models = combinedUnitModels(state, info.unitId)
  if (models.length === 0) return null
  const anchor = modelsAnchor(models)
  const showEngagement = info.actionType === 'moveUnit' || info.actionType === 'chargeMove'
  const unitDraft = activeDraft?.unitId === info.unitId ? activeDraft : null
  const excludeUnitIds = new Set<UnitId>([info.unitId, state.units[info.unitId]?.attachedLeaderId, state.units[info.unitId]?.bodyguardUnitId].filter(
    (id): id is UnitId => !!id,
  ))

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
          <DraftMarkers
            placements={unitDraft.placements}
            color={placementsOverlapExisting(state, unitDraft.placements, excludeUnitIds) ? BLOCKED_COLOR : OK_COLOR}
          />
        </>
      )}
      {ghost && ghost.unitId === info.unitId && <DraftMarkers placements={ghost.placements} color={GHOST_COLOR} opacity={0.5} />}
    </group>
  )
}
