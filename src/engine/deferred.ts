// Deferred model removal (docs/spec/factions/adepta-sororitas.md §7 E4, A Martyr's Death): a model destroyed before it has
// acted stays on the table at 0 W (announced as destroyed, untargetable, no OC — see state.unitModels) until the unit that
// destroyed it has finished its shooting / fight activation. The deferred models then shoot / fight once (a declareTargets
// decision for them alone, raised by the phase module) and are removed; UnitDestroyed (and its Miracle die) is emitted
// when the unit's last model actually leaves. Phase modules call `resolveDeferredActivations` at the end of the destroying
// unit's activation; `flushDeferredRemovals` is the backstop at phase end.
import { finishMartyrRemoval, type DestroyedBy } from './attack'
import { leaderService } from './leaders'
import type { EngineContext } from './modules'
import { deferredFightStep } from './phases/fight'
import { deferredShootStep } from './phases/shooting'
import type { GameState, ModelId, PhaseState, UnitId } from './types'

type Entry = PhaseState['deferredRemovals'][number]

function entries(state: GameState): Entry[] {
  // saves written before this rule lack the field
  if (!state.phaseState.deferredRemovals) state.phaseState.deferredRemovals = []
  return state.phaseState.deferredRemovals
}

// marks a destroyed model (already at 0 W) to stay on the table until `afterUnitId` has finished its activation
export function deferModelRemoval(ctx: EngineContext, modelId: ModelId, kind: 'ranged' | 'melee', afterUnitId: UnitId, source: string): void {
  const s = ctx.state
  const model = s.models[modelId]
  if (!model) return
  model.removalDeferred = true
  const list = entries(s)
  const existing = list.find((e) => e.unitId === model.unitId && e.kind === kind && e.afterUnitId === afterUnitId)
  if (existing) existing.modelIds.push(modelId)
  else list.push({ unitId: model.unitId, modelIds: [modelId], kind, afterUnitId, source })
  ctx.emit({ type: 'ModelRemovalDeferred', unitId: model.unitId, modelId, source, player: s.units[model.unitId].player })
}

function removalCredit(s: GameState, e: Entry): DestroyedBy {
  return { player: s.units[e.afterUnitId]?.player ?? null, unitId: e.afterUnitId, modelId: null, kind: e.kind }
}

function removeEntry(ctx: EngineContext, e: Entry): void {
  const s = ctx.state
  const by = removalCredit(s, e)
  const list = entries(s)
  list.splice(list.indexOf(e), 1)
  // the last-stand open/begun marks are keyed by the deferred unit; clear them so a later entry for the same unit (a second
  // enemy unit killing more of it in the same phase, A Martyr's Death lasting the whole phase) gets its own last stand
  s.phaseState.marks = s.phaseState.marks.filter((m) => !(m.startsWith(`shdef:${e.unitId}:`) || m.startsWith(`fidef:${e.unitId}:`)))
  for (const id of e.modelIds) finishMartyrRemoval(ctx, id, by)
}

// called when `afterUnitId` finishes its shooting / its fight activation: opens declareTargets for the deferred models only,
// resolves, then removes them. 'awaiting' = a decision or attack is in progress (return 'pending' and call again).
export function resolveDeferredActivations(ctx: EngineContext, afterUnitId: UnitId): 'done' | 'awaiting' {
  const s = ctx.state
  const kind = s.phase === 'shooting' ? 'ranged' : s.phase === 'fight' ? 'melee' : null
  if (!kind) return 'done'
  for (;;) {
    const e = entries(s).find((x) => x.kind === kind && leaderService.sameUnit(s, x.afterUnitId, afterUnitId))
    if (!e) return 'done'
    const r = kind === 'ranged' ? deferredShootStep(ctx, e) : deferredFightStep(ctx, e)
    if (r === 'pending') return 'awaiting'
    removeEntry(ctx, e)
  }
}

// phase end: anything still waiting (its destroyer was itself destroyed, never activated...) leaves without a last stand
export function flushDeferredRemovals(ctx: EngineContext): void {
  for (const e of [...entries(ctx.state)]) removeEntry(ctx, e)
}
