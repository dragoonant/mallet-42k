// A board-space click point -> the draft placement it proposes, for whichever decision is currently
// pending (deployment palette pick, or one of the four move-family decisions) — laid out using the
// formation picker's currently-selected shape and facing (M4). Reads/writes the formation slice of
// uiStore directly via getState() rather than taking it as a parameter: Scene.tsx (which this feeds)
// is outside this package's ownership and already can't be changed to thread new params through, and
// Scene.tsx's own onBoardPointer does the same getState() dance for the same reason (see its comment
// on stale closures from react-three-fiber's captured-pointer events).
import type { GameState, PendingDecision } from '@/engine'
import { useUiStore, type PlacementDraft } from '../ui/uiStore'
import { combinedUnitModels, modelsAnchor } from './geometry'
import { directionFacing, formationPlacementsForUnit, zoneFacing } from './formations'
import { placementInfo } from './decisions'

export function computeBoardClickDraft(
  state: GameState,
  pending: PendingDecision,
  deployTargetUnitId: string | null,
  point: { x: number; z: number },
): PlacementDraft | null {
  const ui = useUiStore.getState()

  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || !pending.context.unitIds.includes(deployTargetUnitId)) return null
    // A bodyguard + its attached Leader deploy as one drop (10-rules R-10.1): the engine's setup
    // module requires placements for both units' models under the bodyguard's unitId.
    const kind = ui.formationKind === 'keep' ? 'line' : ui.formationKind
    const facing = ui.formationFacingAuto ? zoneFacing(pending.context.zone) : ui.formationFacing
    const placements = formationPlacementsForUnit(state, deployTargetUnitId, point, facing, kind)
    if (placements.length === 0) return null
    if (ui.formationFacingAuto) ui.setFormationFacing(facing, true)
    return { decisionId: pending.id, unitId: deployTargetUnitId, anchor: point, placements }
  }

  const info = placementInfo(pending)
  if (!info) return null
  // Same combined-unit treatment for the four move-family decisions: a board-click move that only
  // translated the activated unit's own models (leaving an attached leader behind) could end the
  // unit out of coherency with no way to fix it short of the fallback list.
  const models = combinedUnitModels(state, info.unitId)
  if (models.length === 0) return null
  const anchor = modelsAnchor(models)
  const facing = ui.formationFacingAuto ? directionFacing(anchor, point, ui.formationFacing) : ui.formationFacing
  const placements = formationPlacementsForUnit(state, info.unitId, point, facing, ui.formationKind)
  if (ui.formationFacingAuto) ui.setFormationFacing(facing, true)
  return { decisionId: pending.id, unitId: info.unitId, anchor: point, placements }
}
