// Fire Overwatch reach summary for the reaction prompt: per eligible unit, how many of its ranged
// weapons (one per model carrying it) can reach the enemy unit — within that weapon's range,
// measured base to base, with line of sight from that model. (The 24" limit is on picking the unit.)
import { DEFAULT_SERVICES, distance, unitModels, type GameState, type UnitId } from '@/engine'

export interface OverwatchReach { unitId: UnitId; total: number; inRange: number; canFire: number }

export function overwatchReach(state: GameState, unitId: UnitId, enemyId: UnitId): OverwatchReach {
  const enemies = unitModels(state, enemyId)
  let total = 0, inRange = 0, canFire = 0
  for (const m of unitModels(state, unitId)) {
    for (const wid of m.weapons) {
      const w = DEFAULT_SERVICES.weapons.effectiveWeapon(state, m.id, wid)
      if (w.kind !== 'ranged') continue
      total++
      if (!enemies.some((e) => distance(m, e) <= w.range)) continue
      inRange++
      let visible = false
      try { visible = DEFAULT_SERVICES.los.unitVisible(state, m.id, enemyId) } catch { visible = false }
      if (visible) canFire++
    }
  }
  return { unitId, total, inRange, canFire }
}
