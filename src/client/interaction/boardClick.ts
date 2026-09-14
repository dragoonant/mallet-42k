// Pure helper: a board-space click point -> the draft placement it proposes, for whichever decision
// is currently pending (deployment palette pick, or one of the four move-family decisions).
import type { GameState, PendingDecision } from '@/engine'
import type { PlacementDraft } from '../ui/uiStore'
import { combinedUnitModels, deploymentFormation, modelsAnchor, translatedPlacements } from './geometry'
import { placementInfo } from './decisions'

export function computeBoardClickDraft(
  state: GameState,
  pending: PendingDecision,
  deployTargetUnitId: string | null,
  point: { x: number; z: number },
): PlacementDraft | null {
  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || !pending.context.unitIds.includes(deployTargetUnitId)) return null
    // A bodyguard + its attached Leader deploy as one drop (10-rules R-10.1): the engine's setup
    // module requires placements for both units' models under the bodyguard's unitId.
    const models = combinedUnitModels(state, deployTargetUnitId)
    return { decisionId: pending.id, unitId: deployTargetUnitId, anchor: point, placements: deploymentFormation(models, point) }
  }
  const info = placementInfo(pending)
  if (!info) return null
  // Same combined-unit treatment for the four move-family decisions: a board-click move that only
  // translated the activated unit's own models (leaving an attached leader behind) could end the
  // unit out of coherency with no way to fix it short of the fallback list.
  const models = combinedUnitModels(state, info.unitId)
  const anchor = modelsAnchor(models)
  return { decisionId: pending.id, unitId: info.unitId, anchor: point, placements: translatedPlacements(models, anchor, point) }
}
