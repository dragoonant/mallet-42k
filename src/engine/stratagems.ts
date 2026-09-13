// Stratagems, reaction windows and Command Re-roll (10-rules §11, R-11.5, 00-arch §3). Owner: W1-F.
// ctx.window() calls `openWindow` for each player in order; this service decides whether the player has an affordable,
// legal stratagem (or reaction) for that window and raises the stratagemWindow / reactionWindow / commandReroll
// decision. It also answers those decisions (useStratagem / commandReroll / pass): pay CP (CpChanged), record
// Player.stratagemUses / oncePerBattleUsed, apply the effect (services.effects.grant, code hooks, reactions such as
// Fire Overwatch through services.attack, Heroic Intervention through the charge module) and emit StratagemUsed /
// StratagemWindowClosed. R-1.6: a die already re-rolled (DiceRoll.rerolled) cannot take Command Re-roll (E_NOT_AN_OPTION).
import type { TimingWindowId } from '../data/types'
import type { DecisionHandler, EngineContext, WindowTrigger } from './modules'
import { notImplementedHandle } from './modules'
import type { GameState, PlayerId, StratagemId } from './types'

export interface StratagemService extends DecisionHandler {
  // raise a decision for `player` at this window occurrence if any stratagem/reaction is usable; true = decision pending.
  // The core has already recorded the occurrence in phaseState.windowsOpened, so this is called at most once per
  // (window, player, key).
  openWindow(ctx: EngineContext, window: TimingWindowId, player: PlayerId, key: string, trigger?: WindowTrigger): boolean
  // stratagems the player could use now (CP, once-per limits, `who`, `condition`, targets available)
  usable(state: GameState, player: PlayerId, window: TimingWindowId, trigger?: WindowTrigger): StratagemId[]
}

export const stratagemService: StratagemService = {
  // TODO(W1-F): open stratagemWindow / reactionWindow / commandReroll (any.rollMade: only when CP ≥ 1, roll is
  // commandRerollable, not locked by Sabotage Comms, and at least one die can still be re-rolled)
  openWindow: () => false,
  // TODO(W1-F)
  usable: () => [],
  // TODO(W1-F): validate (E_INSUFFICIENT_CP, E_STRATAGEM_USED, E_INVALID_TARGET, R-11.2) + handle
  handle: notImplementedHandle('stratagems'),
}
