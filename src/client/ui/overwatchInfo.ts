// Fire Overwatch reach summary for the reaction prompt: per eligible unit, how many of its ranged
// weapons (one per model carrying it) can fire at the enemy unit. Uses the engine's own Shooting-phase
// target check (range from that model, base to base, plus line of sight), so the count matches what fires.
import { DEFAULT_SERVICES, unitModels, type GameState, type UnitId } from '@/engine'
import { targetLegality } from '@/engine/phases/shooting'

export interface OverwatchReach { unitId: UnitId; total: number; inRange: number; canFire: number }

export function overwatchReach(state: GameState, unitId: UnitId, enemyId: UnitId): OverwatchReach {
  let total = 0, inRange = 0, canFire = 0
  for (const m of unitModels(state, unitId)) {
    for (const wid of m.weapons) {
      const w = DEFAULT_SERVICES.weapons.effectiveWeapon(state, m.id, wid)
      if (w.kind !== 'ranged') continue
      total++
      const rejection = targetLegality(state, unitId, m.id, w, enemyId)
      if (rejection?.code === 'E_NOT_IN_RANGE') continue
      inRange++
      if (!rejection) canFire++
    }
  }
  return { unitId, total, inRange, canFire }
}
