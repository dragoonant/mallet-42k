// Decider: the one interface both the human UI and the AI implement (00-arch §3).
import type { Action } from './actions'
import type { PendingDecision, PlayerId, PlayerView } from './types'

export interface Decider {
  // legal is null for continuous decisions (moves); rejected actions come back via view.lastRejection
  decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action>
  cancel?(): void
}

export type Deciders = Record<PlayerId, Decider>

export type DeciderFactory = (player: PlayerId) => Decider
