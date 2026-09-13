// Objective control (R-12.1–R-12.3, CP-2.4–CP-2.6). Owner: W1-F. The core calls evaluateControl at the start of every
// turn (snapshot controllerAtTurnStart), at the end of every phase and every turn; scoring rules call it when needed.
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, withinObjectiveRange } from './geometry'
import type { EngineContext } from './modules'
import { boardUnitsOf, modelStats, unitModels } from './state'
import type { GameState, ModelId, ObjectiveId, PlayerId } from './types'

export type ControlMoment = 'turnStart' | 'phaseEnd' | 'turnEnd' | 'rule'

export interface ObjectiveService {
  modelsInRange(state: GameState, objectiveId: ObjectiveId, player: PlayerId): ModelId[]
  // R-12.2: Σ OC of models within range (Battle-shocked → 0)
  levelOfControl(state: GameState, objectiveId: ObjectiveId): Record<PlayerId, number>
  // R-12.3 + secured/sticky flags; updates Objective.controller and emits ObjectiveControlChanged on change
  evaluateControl(ctx: EngineContext, moment: ControlMoment): void
  controller(state: GameState, objectiveId: ObjectiveId): PlayerId | null
}

export const objectiveService: ObjectiveService = {
  modelsInRange(state, objectiveId, player) {
    const obj = state.objectives[objectiveId]
    if (!obj || obj.removed) return []
    const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
    const radius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
    const out: ModelId[] = []
    for (const unit of boardUnitsOf(state, player)) {
      for (const m of unitModels(state, unit.id)) if (withinObjectiveRange(m, obj, 0, range, radius)) out.push(m.id)
    }
    return out
  },
  levelOfControl(state, objectiveId) {
    const levels: Record<PlayerId, number> = { A: 0, B: 0 }
    for (const player of ['A', 'B'] as PlayerId[]) {
      for (const id of objectiveService.modelsInRange(state, objectiveId, player)) {
        const model = state.models[id]
        const unit = state.units[model.unitId]
        // TODO(W1-F): OC modifiers through hooks onStatQuery (Oathsworn Determination, R-1.9 floor)
        levels[player] += unit.battleShocked ? 0 : modelStats(state, model).OC
      }
    }
    return levels
  },
  evaluateControl(ctx, moment) {
    const s = ctx.state
    for (const obj of Object.values(s.objectives)) {
      if (obj.removed) continue
      const levels = objectiveService.levelOfControl(s, obj.id)
      let to: PlayerId | null = levels.A > levels.B ? 'A' : levels.B > levels.A ? 'B' : null
      // TODO(W1-F): secured (CP-2.5) and sticky (CP-2.6) flags override an empty/contested marker; hooks onObjectiveControl
      if (to === null && obj.securedBy) to = obj.securedBy
      if (to === null && obj.stickyBy) to = obj.stickyBy
      if (obj.controller !== to) {
        const from = obj.controller
        obj.controller = to
        ctx.emit({ type: 'ObjectiveControlChanged', objectiveId: obj.id, from, to, levels, player: to ?? s.activePlayer })
      }
      if (moment === 'turnStart') obj.controllerAtTurnStart = obj.controller
    }
  },
  controller: (state, objectiveId) => state.objectives[objectiveId]?.controller ?? null,
}
