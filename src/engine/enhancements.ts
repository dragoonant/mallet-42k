// Enhancements (20-data §7, CP-1.4). Owner: W1-F. createGame already attaches the enhancement's ability to the warlord
// (state.abilities entry with source 'enhancement' and bearerModelId = the warlord model; Unit.enhancementId set;
// Tellyporta-style `choice` pairs Unit.deepStrikeWith). What remains is scope handling in hooks-impl (`bearer` = only
// that model's weapons/rolls, `self` = the whole attached unit).
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
  // TODO(W1-F): scope 'self' should also cover the bodyguard unit of an attached leader
  abilitiesFor(state, unitId) {
    const unit = state.units[unitId]
    if (!unit) return []
    const ids = new Set(unit.models)
    if (unit.attachedLeaderId) for (const m of state.units[unit.attachedLeaderId]?.models ?? []) ids.add(m)
    return Object.values(state.abilities).filter((a) => a.source === 'enhancement' && a.bearerModelId !== null && ids.has(a.bearerModelId))
  },
}
