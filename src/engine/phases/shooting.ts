// Shooting phase module (10-rules §6, §7). Owner: W1-D. Steps: 'selectUnit' → 'declareTargets' → 'resolve' → 'hazardous'.
// TODO(W1-D): chooseUnitToActivate (eligibility R-6.1–R-6.3 via services.weapons/los/hooks onEligibility) →
// declareTargets (legal targets per weapon: range from geometry.distance, visibility from services.los, Blast/Pistol/
// Indirect rules; profile choice; E_NO_LOS / E_NOT_IN_RANGE / E_INVALID_TARGET) → TargetsDeclared →
// ctx.window('shooting.targetsDeclared', unitId, ctx.order.defensive(targetOwner), {unitId, targetUnitId}) →
// services.attack.begin(...) then services.attack.advance(ctx) until 'done' (hit/wound/allocate/save/damage per
// R-6.11–R-6.19, all rolls through ctx.rollOnce so Command Re-roll and rerollOffer work) → Hazardous tests →
// ctx.window('shooting.attacksResolved', unitId, ctx.order.active()). Fire Overwatch reuses this sequence with
// overwatch: true (R-6.22) from the movement/charge modules via services.attack.
import { notImplementedHandle, type PhaseModule } from '../modules'

export const shootingModule: PhaseModule = {
  name: 'shooting',
  enter(ctx) {
    ctx.state.step = 'selectUnit'
    ctx.state.phaseState.activated = []
    ctx.state.phaseState.attack = null
  },
  advance(ctx) {
    // TODO(W1-D): implement; each step must be re-entrant
    ctx.state.step = 'hazardous'
    return 'done'
  },
  handle: notImplementedHandle('shooting'),
}
