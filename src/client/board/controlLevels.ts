// Live objective-control numbers for display (board/Objectives.tsx). Delegates to the engine's own levelOfControl
// so ability-based OC modifiers, Battle-shock and Death Blow pending removal match what the engine scores (RC-078).
import { DEFAULT_SERVICES, type GameState, type ObjectiveId, type PlayerId } from '@/engine'

export function liveControlLevels(state: GameState, objectiveId: ObjectiveId): Record<PlayerId, number> {
  if (!state.objectives[objectiveId]) return { A: 0, B: 0 }
  return DEFAULT_SERVICES.objectives.levelOfControl(state, objectiveId)
}
