// R-9.6 over hypothetical positions: which models of a unit would be able to attack if they stood at
// the given spots. Pure; mirrors fight.ts's attackEligibleModels but takes positions as an argument so
// the client can preview the result of a pile-in / consolidate drag before it is confirmed.
import { ENGAGEMENT_H, ENGAGEMENT_V, horizontalGap, inBaseContact } from '../geometry'
import { enemyModelsOnBoard, unitModelsForCoherency } from '../state'
import type { GameState, ModelId, UnitId, Vec3 } from '../types'

const EPS = 1e-6

/** Ids of the unit's models (attached leader/bodyguard included) that can fight when each model stands
 *  at `positions[modelId]` (models without an entry stay where they are). */
export function fightingModelIds(state: GameState, unitId: UnitId, positions: Readonly<Record<ModelId, Vec3>> = {}): Set<ModelId> {
  const unit = state.units[unitId]
  if (!unit) return new Set()
  const models = unitModelsForCoherency(state, unitId).map((m) => ({ ...m, pos: positions[m.id] ?? m.pos }))
  const enemies = enemyModelsOnBoard(state, unit.player)
  const touching = new Set(models.filter((m) => enemies.some((e) => inBaseContact(m, e))).map((m) => m.id))
  const out = new Set(
    models
      .filter((m) => enemies.some((e) => horizontalGap(m, e) <= ENGAGEMENT_H + EPS && Math.abs(m.pos.y - e.pos.y) <= ENGAGEMENT_V + EPS))
      .map((m) => m.id),
  )
  for (const m of models) {
    if (out.has(m.id)) continue
    if (models.some((f) => f.id !== m.id && inBaseContact(m, f) && touching.has(f.id))) out.add(m.id)
  }
  return out
}
