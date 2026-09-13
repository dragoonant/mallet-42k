// Missions: scoring rules, mission rules, deployment zones, game end (10-rules §12, 11-combat-patrol §2). Owner: W1-F.
// ctx.window() calls `onWindow` exactly once per window occurrence before any stratagem window: run every ScoringRule
// whose `when` matches (respect rounds/who/cap, append MissionState.scored, VpScored) and every MissionRule code hook.
import type { TimingWindowId } from '../data/types'
import type { DecisionHandler, EngineContext, WindowTrigger } from './modules'
import { notImplementedHandle } from './modules'
import type { GameResult, GameState, PlayerId } from './types'

export interface MissionService {
  onWindow(ctx: EngineContext, window: TimingWindowId, key: string, trigger?: WindowTrigger): void
  // R-12.6: models on the battlefield, or Reserves that can still arrive (CP-1.9: rounds 1–3)
  playerHasForces(state: GameState, player: PlayerId): boolean
  // R-12.6 [interp]: both players without forces → the battle ends at once on VP
  isTabled(state: GameState): boolean
  // R-12.7 / CP-1.11: VP totals incl. Battle Ready; equal → draw
  finalResult(state: GameState, reason: GameResult['reason']): GameResult
  // answers chooseOption topics razeObjective / recoverObjective / stompTarget / bagTarget
  readonly handler: DecisionHandler
}

export const missionService: MissionService = {
  // TODO(W1-F): primary/secondary ScoringRules + MissionRule code hooks (retrieveIntelligence, irradiatedPowerCells, …)
  onWindow: () => undefined,
  // TODO(W1-F): true only when the player has a unit on the board or a Reserves unit that may still arrive
  playerHasForces: () => true,
  // TODO(W1-F)
  isTabled: () => false,
  finalResult(state, reason) {
    const vp = { A: state.players.A.vp + state.players.A.battleReadyVp, B: state.players.B.vp + state.players.B.battleReadyVp }
    const winner: GameResult['winner'] = vp.A > vp.B ? 'A' : vp.B > vp.A ? 'B' : 'draw'
    return { winner, reason, vp }
  },
  handler: { handle: notImplementedHandle('missions') },
}
