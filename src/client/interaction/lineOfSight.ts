// Client-only Line-of-sight view lookup (M2 battlefield gap): reuses the engine's own LoS/cover
// service (DEFAULT_SERVICES.los, src/engine/los.ts) exactly as the shooting module would, just
// without allocating a real attack — read-only queries over the current GameState, judged from the
// selected unit's own on-board models. Good enough for a HUD overlay; not a targeting decision.
import { DEFAULT_SERVICES, type GameState, type RuntimeWeapon, type UnitId } from '@/engine'
import type { LosStatus } from '../board'

function firstRangedWeapon(state: GameState, modelIds: readonly string[]): RuntimeWeapon | null {
  for (const modelId of modelIds) {
    const model = state.models[modelId]
    if (!model) continue
    for (const weaponId of model.weapons) {
      const weapon = state.weapons[weaponId]
      if (weapon && weapon.kind === 'ranged') return weapon
    }
  }
  return null
}

/** For every enemy unit on the board (relative to `selectedUnitId`'s side): visible, visible-with-
 *  Benefit-of-Cover, or hidden. Visibility is "any of the selected unit's on-board models can see
 *  it"; cover uses the selected unit's first ranged weapon (melee-only units still get a plain
 *  visible/hidden read — Benefit of Cover only matters for a ranged attack anyway, R-3.11). */
export function losStatusByUnit(state: GameState, selectedUnitId: UnitId): Record<UnitId, LosStatus> {
  const result: Record<UnitId, LosStatus> = {}
  const selectedUnit = state.units[selectedUnitId]
  if (!selectedUnit || selectedUnit.location !== 'board') return result

  const observerIds = selectedUnit.models.filter((id) => state.models[id])
  if (observerIds.length === 0) return result
  const weapon = firstRangedWeapon(state, observerIds)

  for (const unit of Object.values(state.units)) {
    if (unit.location !== 'board' || unit.player === selectedUnit.player) continue
    const visible = observerIds.some((observerId) => DEFAULT_SERVICES.los.unitVisible(state, observerId, unit.id))
    if (!visible) {
      result[unit.id] = 'hidden'
      continue
    }
    const inCover =
      !!weapon &&
      unit.models.some((modelId) => state.models[modelId] && DEFAULT_SERVICES.los.benefitOfCover(state, modelId, selectedUnitId, weapon))
    result[unit.id] = inCover ? 'cover' : 'visible'
  }
  return result
}
