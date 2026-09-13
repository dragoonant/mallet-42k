// Charge phase module (10-rules §8). Owner: W1-E. Steps: 'declare' → 'roll' → 'overwatch' → 'move' (per unit).
// TODO(W1-E): chooseUnitToActivate (R-8.1 eligibility; pass ends the phase) → declareCharge (targets within 12";
// E_NOT_IN_RANGE / E_INVALID_TARGET; heroic: false) → ChargeDeclared → ctx.window('charge.declared', …) →
// 2D6 via ctx.rollOnce('charge:'+unitId, {purpose:'charge', count:2, mode:'sum'}) → ChargeRolled → R-6.24 re-roll
// offers from hooks (onChargeRoll) → R-8.4 feasibility search (geometry: distance, withinEngagementRange, isCoherent)
// → ChargeFailed or ctx.window('charge.moveStarted', unitId, ctx.order.only(opponent)) (Fire Overwatch through
// services.attack) → re-check feasibility → chargeMove (checkPlacements with mustEndInEngagementWith = targets,
// engagementTargets, mustEndCloserTo 'target', base contact rule R-8.5, never enter ER of non-targets) → ChargeMoved,
// Unit.turn.chargedThisTurn/fightsFirst (R-8.6) → ctx.window('charge.moveEnded', unitId, ctx.order.defensive(opponent))
// (Heroic Intervention reaction then Tank Shock). Store per-unit progress in phaseState.charge.
import { notImplementedHandle, type PhaseModule } from '../modules'

export const chargeModule: PhaseModule = {
  name: 'charge',
  enter(ctx) {
    ctx.state.step = 'declare'
    ctx.state.phaseState.activated = []
    ctx.state.phaseState.charge = null
  },
  advance(ctx) {
    // TODO(W1-E): implement; each step must be re-entrant
    ctx.state.step = 'move'
    return 'done'
  },
  handle: notImplementedHandle('charge'),
}
