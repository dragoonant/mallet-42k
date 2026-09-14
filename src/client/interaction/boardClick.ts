// Pure helper: a board-space click point -> the draft placement it proposes, for whichever decision
// is currently pending (deployment palette pick, or one of the four move-family decisions).
import { unitModels, type GameState, type Model, type PendingDecision } from '@/engine'
import type { PlacementDraft } from '../ui/uiStore'
import { deploymentFormation, modelsAnchor, translatedPlacements } from './geometry'
import { placementInfo } from './decisions'

// A bodyguard + its attached Leader deploy as one drop (10-rules R-10.1): the engine's setup module
// requires placements for both units' models under the bodyguard's unitId. Mirrors setup.ts's own
// (unexported) `combo` helper — attachedLeaderId always combines at deployment, regardless of the
// leaders service's board-location gate (neither unit is on the board yet).
function deployModels(state: GameState, unitId: string): Model[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const partnerId = unit.attachedLeaderId ?? unit.bodyguardUnitId ?? null
  const models = unitModels(state, unitId)
  if (partnerId && state.units[partnerId]) models.push(...unitModels(state, partnerId))
  return models
}

export function computeBoardClickDraft(
  state: GameState,
  pending: PendingDecision,
  deployTargetUnitId: string | null,
  point: { x: number; z: number },
): PlacementDraft | null {
  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || !pending.context.unitIds.includes(deployTargetUnitId)) return null
    const models = deployModels(state, deployTargetUnitId)
    return { decisionId: pending.id, unitId: deployTargetUnitId, anchor: point, placements: deploymentFormation(models, point) }
  }
  const info = placementInfo(pending)
  if (!info) return null
  const models = unitModels(state, info.unitId)
  const anchor = modelsAnchor(models)
  return { decisionId: pending.id, unitId: info.unitId, anchor: point, placements: translatedPlacements(models, anchor, point) }
}
