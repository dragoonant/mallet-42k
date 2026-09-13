// Transports (10-rules §5.3, R-5.17–R-5.20). Owner: W1-C. No transport exists in either Combat Patrol box; implement
// lazily. Embarked units need a location outside 'board'/'reserves' — keep them in 'reserves' with a transport link in
// Player.secondaryState or a future Unit field agreed with the orchestrator before use.
import type { GameState, UnitId } from './types'

export interface TransportService {
  embarkedIn(state: GameState, transportUnitId: UnitId): UnitId[]
  capacity(state: GameState, transportUnitId: UnitId): number
}

export const transportService: TransportService = {
  // TODO(W1-C)
  embarkedIn: () => [],
  capacity: () => 0,
}
