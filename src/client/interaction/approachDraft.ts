// Pile-in / consolidate by hand: the draft starts with every model where it stands (a 0" move is always
// allowed per model), the player drags models, and the engine's own validator has the final word on
// legality (its rejection names the offending model, which we tint red with the reason on hover).
import { fightModule } from '@/engine/phases/fight'
import { fightingModelIds } from '@/engine/phases/fightEligibility'
import { dist2D, type Action, type GameState, type Model, type ModelPlacement, type PendingDecision } from '@/engine'
import { combinedUnitModels, modelsAnchor } from './geometry'
import type { PlacementDraft } from '../ui/uiStore'
import { validateDraft, type ValidationResult } from './formationValidation'

export type ApproachPending = Extract<PendingDecision, { kind: 'pileIn' | 'consolidate' }>

export function isApproachPending(p: PendingDecision | null): p is ApproachPending {
  return !!p && (p.kind === 'pileIn' || p.kind === 'consolidate')
}

/** Every model of the (combined) unit exactly where it is now. */
export function startPlacements(state: GameState, unitId: string): ModelPlacement[] {
  return combinedUnitModels(state, unitId).map((m) => ({ modelId: m.id, pos: { ...m.pos }, facing: m.facing }))
}

export function startDraft(state: GameState, pending: ApproachPending): PlacementDraft {
  const unitId = pending.context.unitId
  return { decisionId: pending.id, unitId, anchor: modelsAnchor(combinedUnitModels(state, unitId)), placements: startPlacements(state, unitId) }
}

/** The engine's suggested arrangement laid over the start layout (it only lists the models that move). */
export function autoDraft(state: GameState, pending: ApproachPending, legal: Action[] | null): PlacementDraft {
  const base = startDraft(state, pending)
  const auto = (legal ?? []).find((a): a is Extract<Action, { type: 'pileIn' | 'consolidate' }> => a.type === pending.kind && a.unitId === pending.context.unitId)
  if (!auto) return base
  const moved = new Map(auto.placements.map((p) => [p.modelId, p]))
  const placements = base.placements.map((p) => {
    const m = moved.get(p.modelId)
    return m ? { modelId: p.modelId, pos: m.pos, facing: m.facing ?? p.facing } : p
  })
  return { ...base, anchor: modelsAnchor(combinedUnitModels(state, pending.context.unitId).map((m) => ({ ...m, pos: moved.get(m.id)?.pos ?? m.pos }))), placements }
}

/** Placements to send: models that did not move are left out, as the engine's own candidates do. */
export function placementsToSend(state: GameState, placements: ModelPlacement[]): ModelPlacement[] {
  return placements.filter((p) => {
    const m = state.models[p.modelId]
    return !m || dist2D(m.pos, p.pos) > 1e-3
  })
}

export function validateApproach(state: GameState, pending: ApproachPending, models: Model[], placements: ModelPlacement[], exclude: ReadonlySet<string>): ValidationResult {
  const hint = validateDraft(state, models, placements, pending.constraints, exclude, true)
  let rejection: { reason: string; details?: unknown } | null = null
  try {
    const action = { type: pending.kind, player: pending.player, decisionId: pending.id, unitId: pending.context.unitId, placements: placementsToSend(state, placements) } as Action
    rejection = fightModule.validate?.(state, action, pending) ?? null
  } catch {
    rejection = null
  }
  if (!rejection) return { ok: true, perModel: {}, reasons: [], links: hint.links }
  const perModel: Record<string, string[]> = {}
  for (const [id, rs] of Object.entries(hint.perModel)) perModel[id] = [...rs]
  const badId = (rejection.details as { modelId?: string } | undefined)?.modelId
  if (badId) (perModel[badId] ??= []).unshift(rejection.reason)
  return { ok: false, perModel, reasons: [rejection.reason, ...hint.reasons.filter((r) => r !== rejection!.reason)], links: hint.links }
}

/** Models that could fight if the draft were confirmed. */
export function fightersAfter(state: GameState, unitId: string, placements: ModelPlacement[]): Set<string> {
  const positions: Record<string, ModelPlacement['pos']> = {}
  for (const p of placements) positions[p.modelId] = p.pos
  return fightingModelIds(state, unitId, positions)
}
