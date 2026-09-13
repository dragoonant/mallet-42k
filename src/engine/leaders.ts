// Leaders / attached units (R-10.1, R-4.5). Owner: W1-F (detach flow), consulted by W1-D (allocation, toughness).
// createGame sets Unit.attachedLeaderId / bodyguardUnitId from GameSetup.attachments.
import type { EngineContext } from './modules'
import { unitModels } from './state'
import type { GameState, Model, UnitId } from './types'

export interface LeaderService {
  isAttached(state: GameState, unitId: UnitId): boolean
  // the other half of an attached unit (leader ↔ bodyguard) or null
  partnerOf(state: GameState, unitId: UnitId): UnitId | null
  // models of the whole attached unit (bodyguard + leader), used for coherency, eligibility and targeting
  combinedModels(state: GameState, unitId: UnitId): Model[]
  // R-10.1: attacks against an attached unit use the bodyguard's T
  toughnessFor(state: GameState, targetUnitId: UnitId): number
  // R-4.5: attached SS = leader SS + bodyguard SS
  startingStrength(state: GameState, unitId: UnitId): number
  // split the attached unit when one half is destroyed (LeaderDetached); called by the attack module after the
  // attacking unit finishes (R-10.1)
  detach(ctx: EngineContext, unitId: UnitId): void
}

export const leaderService: LeaderService = {
  isAttached: (state, unitId) => !!(state.units[unitId]?.attachedLeaderId || state.units[unitId]?.bodyguardUnitId),
  partnerOf: (state, unitId) => state.units[unitId]?.attachedLeaderId ?? state.units[unitId]?.bodyguardUnitId ?? null,
  combinedModels(state, unitId) {
    const models = unitModels(state, unitId)
    const partner = leaderService.partnerOf(state, unitId)
    if (partner && state.units[partner].location === 'board') models.push(...unitModels(state, partner))
    return models
  },
  toughnessFor(state, targetUnitId) {
    const unit = state.units[targetUnitId]
    const bodyguard = unit.bodyguardUnitId ? state.units[unit.bodyguardUnitId] : unit
    return state.datasheets[bodyguard.datasheetId].stats.T
  },
  startingStrength(state, unitId) {
    const unit = state.units[unitId]
    const partner = leaderService.partnerOf(state, unitId)
    return unit.startingStrength + (partner ? state.units[partner].startingStrength : 0)
  },
  // TODO(W1-F): clear both links, emit LeaderDetached, keep persisting effects on both halves (R-1.7)
  detach: () => { throw new Error('leaders.detach not implemented') },
}
