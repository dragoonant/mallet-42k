// Engine public API (00-arch §2). Bodies are stubs until W1.
import type { Action } from './actions'
import type { GameEvent } from './events'
import type { Rng } from './rng'
import type { GameSetup, GameState, PendingDecision, PlayerId, PlayerView, Rejection } from './types'

export * from './types'
export * from './actions'
export * from './events'
export * from './hooks'
export * from './rng'
export * from './decider'

export const ENGINE_VERSION = '0.1.0'

export interface StepResult {
  // same reference as the input when rejected
  state: GameState
  events: GameEvent[]
  // null only when state.phase === 'ended'
  pending: PendingDecision | null
  rejection?: Rejection
}

export function createGame(setup: GameSetup, seed: string): StepResult {
  void setup; void seed
  throw new Error('not implemented')
}

// pure reducer; never throws for illegal actions, only EngineInvariantError on corrupt state.
// The RNG is restored from state.rng (restoreRng); `rng` is an optional test override (e.g. ScriptedRng) whose
// serialize() output is written back to state.rng, so a game stays replayable from the action log alone.
export function step(state: GameState, action: Action, rng?: Rng): StepResult {
  void state; void action; void rng
  throw new Error('not implemented')
}

// null for continuous decisions (moves)
export function legalActions(state: GameState, pending: PendingDecision): Action[] | null {
  void state; void pending
  throw new Error('not implemented')
}

export function validate(state: GameState, action: Action): Rejection | null {
  void state; void action
  throw new Error('not implemented')
}

export function replay(setup: GameSetup, seed: string, actions: Action[]): StepResult {
  void setup; void seed; void actions
  throw new Error('not implemented')
}

export function view(state: GameState, player: PlayerId): PlayerView {
  void state; void player
  throw new Error('not implemented')
}
