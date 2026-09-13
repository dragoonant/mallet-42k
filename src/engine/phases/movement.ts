// Movement phase module (10-rules §5). Owner: W1-C. Steps: 'select' → 'declare' → 'move' (per unit) → 'reinforcements'.
// TODO(W1-C): per unit — chooseUnitToActivate (eligible = board units not in phaseState.activated; pass ends the step)
// → declareMove (allowed types per R-5.1; Advance die via ctx.rollOnce('advance:'+unitId, …) and UnitAdvanced)
// → ctx.window('movement.moveStarted', unitId, ctx.order.only(opponent), {unitId}) (Fire Overwatch, skipped for
// stationary) → Desperate Escape (R-5.6, needs the paths first: ask moveUnit, then roll, then apply) → moveUnit
// (checkPlacements + terrain service + pathEntersEngagement for E_ENGAGEMENT mid-path; FLY per R-5.8; pivot cost per
// pivotCost()) → UnitMoved → ctx.window('movement.unitMoved', unitId, ctx.order.active(), {unitId}).
// Reinforcements step (R-5.11–R-5.14): Deep Strike placements (minDistanceFromEnemies 9, coherency, on board),
// `movement.reinforcements` window per arrival, CP-1.9 round limits, `movement.end` window (Rapid Ingress reaction).
// Surge moves (R-5.9) are granted by abilities through hooks/effects and use the same placement validation.
import { notImplementedHandle, type PhaseModule } from '../modules'

export const movementModule: PhaseModule = {
  name: 'movement',
  enter(ctx) {
    ctx.state.step = 'select'
    ctx.state.phaseState.activated = []
  },
  advance(ctx) {
    const s = ctx.state
    // TODO(W1-C): implement; each step must be re-entrant
    if (s.step === 'select' || s.step === 'declare' || s.step === 'move') s.step = 'reinforcements'
    if (ctx.window('movement.end', 'end', ctx.order.active())) return 'pending'
    return 'done'
  },
  handle: notImplementedHandle('movement'),
}
