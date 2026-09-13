// Enhancements (20-data §7, CP-1.4). Owner: W1-F. createGame already attaches the enhancement's ability to the warlord
// (state.abilities entry with source 'enhancement' and bearerModelId = the warlord model; Unit.enhancementId set;
// Tellyporta-style `choice` pairs Unit.deepStrikeWith). Scope handling lives in hooks-impl: `bearer` = only that
// model's weapons/rolls, `self` = the whole attached unit (leader + bodyguard).
import { leaderService } from './leaders'
import type { GameState, ModelId, PlayerId, RuntimeAbility, UnitId } from './types'

export interface EnhancementService {
  bearerModelId(state: GameState, player: PlayerId): ModelId | null
  // enhancement abilities that apply to models of this unit (including an attached leader's when scope.who is 'self')
  abilitiesFor(state: GameState, unitId: UnitId): RuntimeAbility[]
}

export const enhancementService: EnhancementService = {
  bearerModelId(state, player) {
    const wl = state.units[state.players[player].warlordUnitId]
    return wl && wl.models.length > 0 ? wl.models[0] : null
  },
  abilitiesFor(state, unitId) {
    const unit = state.units[unitId]
    if (!unit) return []
    const own = new Set(unit.models)
    const combined = new Set(leaderService.halves(state, unitId).flatMap((id) => state.units[id]?.models ?? []))
    return Object.values(state.abilities).filter((a) => {
      if (a.source !== 'enhancement' || a.bearerModelId === null) return false
      const who = a.scope?.who ?? 'bearer'
      return who === 'bearer' ? own.has(a.bearerModelId) : combined.has(a.bearerModelId)
    })
  },
}
