// Attack sequence (10-rules §6.2–§6.4, §7 weapon abilities, R-10.4/R-10.5). Owner: W1-D. Shared by the shooting phase,
// the fight phase (WS, melee) and Fire Overwatch (overwatch: true, R-6.22). State lives in phaseState.attack
// (AttackSequenceState); `advance` is a re-entrant state machine over CurrentAttack.stage and must use ctx.rollOnce
// with keys like `hit:${groupIndex}:${resolved}` so Command Re-roll and rerollOffer (R-6.24) can interrupt.
import type { AdvanceResult, DecisionHandler, EngineContext } from './modules'
import { notImplementedHandle } from './modules'
import type { AttackKind, DeclaredTarget, ModelId, PlayerId, UnitId } from './types'

export interface AttackBegin { kind: AttackKind; attackerUnitId: UnitId; overwatch: boolean; targets: DeclaredTarget[] }

export interface DestroyedBy { player: PlayerId | null; unitId: UnitId | null; modelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }

export interface AttackService {
  // build phaseState.attack from the declared targets (groups per weapon profile × target, R-6.6 ordering)
  begin(ctx: EngineContext, spec: AttackBegin): void
  // resolve attacks until a decision is needed (allocateAttack, saveType, rerollOffer, commandReroll, stratagem window)
  // or the sequence is finished ('done': phaseState.attack cleared, AttackSequenceEnded emitted, Hazardous handled)
  advance(ctx: EngineContext): AdvanceResult
  // answers allocateAttack / chooseOption(saveType, hazardousCasualty, rerollOffer) raised by the sequence
  readonly handler: DecisionHandler
  // R-6.16–R-6.19: queue mortal wounds against a unit (allocation, FNP, spill) — resolved by `advance`
  queueMortalWounds(ctx: EngineContext, targetUnitId: UnitId, count: number, source: string, lostOnDeath: boolean): void
  // remove a model with all consequences (ModelDestroyed/UnitDestroyed, Deadly Demise, onModelDestroyed hooks,
  // Unit.destroyedBy, leader detach); culls use state.removeModel directly instead (no triggers, R-2.6)
  destroyModel(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): void
}

export const attackService: AttackService = {
  // TODO(W1-D)
  begin(ctx, spec) {
    ctx.state.phaseState.attack = {
      kind: spec.kind, attackerUnitId: spec.attackerUnitId, overwatch: spec.overwatch, targets: spec.targets, groups: [], current: null,
      mortalQueue: [], hazardousPending: [], targetUnitIds: [...new Set(spec.targets.map((t) => t.targetUnitId))],
    }
    ctx.emit({ type: 'AttackSequenceStarted', unitId: spec.attackerUnitId, kind: spec.kind, overwatch: spec.overwatch })
  },
  // TODO(W1-D): the full hit → wound → allocate → save → damage → FNP loop
  advance(ctx) {
    const a = ctx.state.phaseState.attack
    if (a) ctx.emit({ type: 'AttackSequenceEnded', unitId: a.attackerUnitId, kind: a.kind })
    ctx.state.phaseState.attack = null
    return 'done'
  },
  handler: { handle: notImplementedHandle('attack') },
  // TODO(W1-D)
  queueMortalWounds: () => { throw new Error('attack.queueMortalWounds not implemented') },
  // TODO(W1-D)
  destroyModel: () => { throw new Error('attack.destroyModel not implemented') },
}
