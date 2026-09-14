// Live objective-control numbers for display (board/Objectives.tsx). Mirrors the shape of the
// engine's own levelOfControl (src/engine/objectives.ts) using only the read-only helpers the client
// already has access to (modelStats, boardUnitsOf, unitModels, withinObjectiveRange) — the engine's
// own instance isn't exported as a value from src/engine/index.ts, only its type, so this recomputes
// the same "OC in range, battle-shocked units don't count" rule client-side. One known gap: it does
// not run ability-based OC modifiers (hookService.statFor), so a future ability that changes a unit's
// OC stat won't be reflected here until the engine exports a real control-levels helper.
import {
  OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, boardUnitsOf, modelStats, unitModels, withinObjectiveRange,
  type GameState, type ObjectiveId, type PlayerId,
} from '@/engine'

export function liveControlLevels(state: GameState, objectiveId: ObjectiveId): Record<PlayerId, number> {
  const levels: Record<PlayerId, number> = { A: 0, B: 0 }
  const obj = state.objectives[objectiveId]
  if (!obj) return levels
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  for (const player of ['A', 'B'] as PlayerId[]) {
    for (const unit of boardUnitsOf(state, player)) {
      if (unit.battleShocked) continue
      for (const model of unitModels(state, unit.id)) {
        if (withinObjectiveRange(model, obj, 0, range, radius)) levels[player] += modelStats(state, model).OC
      }
    }
  }
  return levels
}
