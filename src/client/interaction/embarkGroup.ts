// Embark / disembark of an attached Leader + bodyguard pair (E3): the engine moves the pair as ONE unit, so the client's
// prompts, labels and pre-selection treat the two halves as a group instead of as two separate passengers. Pure helpers
// over GameState; no faction knowledge, so any Leader + bodyguard pair (not just Drukhari) reads right.
import type { GameState, UnitId } from '@/engine'

/** The pair a unit belongs to, canonical (bodyguard) half first; a lone unit returns [unitId]. */
export function groupUnitIds(state: GameState, unitId: UnitId): UnitId[] {
  const unit = state.units[unitId]
  if (!unit) return [unitId]
  const canonical = unit.bodyguardUnitId && state.units[unit.bodyguardUnitId] ? unit.bodyguardUnitId : unit.id
  const lead = state.units[canonical]
  const leader = lead?.attachedLeaderId && state.units[lead.attachedLeaderId] ? lead.attachedLeaderId : null
  return leader ? [canonical, leader] : [canonical]
}

/** "Kabalite Warriors with Archon" for an attached pair, the plain unit name otherwise. */
export function groupLabel(state: GameState, unitId: UnitId): string {
  const ids = groupUnitIds(state, unitId)
  const name = (id: UnitId) => state.units[id]?.name ?? id
  return ids.length > 1 ? `${name(ids[0])} with ${name(ids[1])}` : name(ids[0])
}

/** The unit a mid-game deployment names when it offers exactly one unit to set up: a single unit, or both halves of one
 *  attached pair (the canonical half is the one the placement action is sent under). Otherwise null. */
export function soleDeployUnit(state: GameState, unitIds: readonly UnitId[]): UnitId | null {
  if (unitIds.length === 1) return unitIds[0]
  if (unitIds.length !== 2) return null
  const group = groupUnitIds(state, unitIds[0])
  return group.length === 2 && unitIds.every((id) => group.includes(id)) ? group[0] : null
}
