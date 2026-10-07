// Confirms the staged placement draft — the one code path behind the prompt's Confirm button, the Enter key and
// a second click on the staged destination. Reads the live stores via getState() so it works from window key
// handlers and captured pointer closures alike.
import type { GameState, PendingDecision } from '@/engine'
import { useGameStore } from '../store/game'
import { useUiStore, type PlacementDraft } from '../ui/uiStore'
import { combinedUnitIds, combinedUnitModels } from './geometry'
import { placementInfo } from './decisions'
import { validateDraft, type ValidationResult } from './formationValidation'
import { isApproachPending, placementsToSend, validateApproach } from './approachDraft'

/** The Confirm-button validation for `draft` against the pending decision (null when there is no draft). */
export function validateStagedDraft(state: GameState, pending: PendingDecision, draft: PlacementDraft | null): ValidationResult | null {
  if (!draft) return null
  const models = combinedUnitModels(state, draft.unitId)
  const exclude = combinedUnitIds(state, draft.unitId)
  if (isApproachPending(pending)) return validateApproach(state, pending, models, draft.placements, exclude)
  const info = placementInfo(pending)
  return validateDraft(state, models, draft.placements, pending.kind === 'deployUnit' ? null : (info?.constraints ?? null), exclude, true)
}

/** Dispatches the staged draft for the pending decision. Returns false (nothing sent) when there is none or it's invalid. */
export function commitStagedDraft(): boolean {
  const { state, pending, dispatch } = useGameStore.getState()
  const ui = useUiStore.getState()
  const draft = ui.draft
  if (!state || !pending || !draft || draft.decisionId !== pending.id) return false
  const validation = validateStagedDraft(state, pending, draft)
  if (validation && !validation.ok) return false
  const { unitId } = draft
  const placements = isApproachPending(pending) ? placementsToSend(state, draft.placements) : draft.placements
  const base = { player: pending.player, decisionId: pending.id }
  if (pending.kind === 'deployUnit') dispatch({ ...base, type: 'deployUnit', unitId, placements })
  else if (pending.kind === 'moveUnit') dispatch({ ...base, type: 'moveUnit', unitId, placements })
  else if (pending.kind === 'chargeMove') dispatch({ ...base, type: 'chargeMove', unitId, placements })
  else if (pending.kind === 'pileIn') dispatch({ ...base, type: 'pileIn', unitId, placements })
  else if (pending.kind === 'consolidate') dispatch({ ...base, type: 'consolidate', unitId, placements })
  else return false
  ui.rememberFormation(unitId, ui.formationKind, ui.formationFacing)
  ui.setDraft(null)
  return true
}
