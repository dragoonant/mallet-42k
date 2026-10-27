// Fire Overwatch reach summary for the reaction prompt: per eligible unit, how many of its ranged
// weapons (one per model carrying it) can fire at the enemy unit. `inRange` uses the engine's Shooting-phase target
// check (range from that model, base to base); `canFire` is the engine's own Overwatch selection (line of sight, no
// ONE SHOT weapons, Pistols vs other weapons, one profile per group), so the count matches what actually fires.
import { DEFAULT_SERVICES, unitModels, type GameState, type UnitId } from '@/engine'
import { targetLegality } from '@/engine/phases/shooting'
import { overwatchTargets } from '@/engine/phases/movement'
import { leaderService } from '@/engine/leaders'

export interface OverwatchReach { unitId: UnitId; total: number; inRange: number; canFire: number }

export function overwatchReach(state: GameState, unitId: UnitId, enemyId: UnitId): OverwatchReach {
  let total = 0, inRange = 0
  // an attached Leader's models count too, as they do in the engine's selection
  for (const half of leaderService.halves(state, unitId)) for (const m of unitModels(state, half)) {
    for (const wid of m.weapons) {
      const w = DEFAULT_SERVICES.weapons.effectiveWeapon(state, m.id, wid)
      if (w.kind !== 'ranged') continue
      total++
      const rejection = targetLegality(state, half, m.id, w, enemyId)
      if (rejection?.code === 'E_NOT_IN_RANGE') continue
      inRange++
    }
  }
  return { unitId, total, inRange, canFire: overwatchTargets(state, unitId, enemyId).length }
}
