// Fight phase module (10-rules §9). Owner: W1-E. Steps: 'fightsFirst' → 'remaining'; sub-steps in phaseState.fight
// ('select' → 'pileIn' → 'declareTargets' → 'attacks' → 'consolidate').
// TODO(W1-E): alternate chooseFightUnit starting with the non-active player (R-9.1; a player with an eligible unit
// cannot pass); FightUnitSelected → ctx.window('fight.unitSelected', unitId, ctx.order.defensive(owner)) → pileIn
// (checkPlacements maxDistance 3, mustEndCloserTo 'closestEnemy', no crossing enemy models via pathCrossesModels,
// base contact if possible, unit must end in ER; else nobody moves) → declareTargets (melee, R-9.6–R-9.8; random A
// rolled before declaration) → ctx.window('fight.targetsDeclared', unitId, ctx.order.defensive(targetOwner)) →
// services.attack.begin/advance (WS) → consolidate (R-9.10 incl. objective fallback) →
// ctx.window('fight.attacksResolved', unitId, ctx.order.defensive(owner)) (Counter-offensive reaction alters
// FightState.nextToSelect). Ends when no eligible unfought unit remains in either step (R-9.13).
import { notImplementedHandle, type PhaseModule } from '../modules'

export const fightModule: PhaseModule = {
  name: 'fight',
  enter(ctx) {
    const s = ctx.state
    s.step = 'fightsFirst'
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: ctx.opponentOf(s.activePlayer), counterOffensive: false }
    s.phaseState.attack = null
  },
  advance(ctx) {
    // TODO(W1-E): implement; each step must be re-entrant
    ctx.state.step = 'remaining'
    return 'done'
  },
  handle: notImplementedHandle('fight'),
}
