// Tyranid Death Blow (docs/spec/factions/tyranids.md TYR-6.1): a model with the `deathBlow` ability that is destroyed by a melee
// attack before it has fought this phase rolls a D6; on 4+ its removal is DEFERRED (Model.pendingRemoval, ModelRemovalDeferred)
// so its controller may fight with it once the attacking unit has finished (fight.ts offers an optional use / decline). The model
// is removed after that fight or when the controller declines; the removal credits the original killer.
// Lives next to the attack module (not under factions/) because attack.ts and fight.ts call it for every game.
import { attackService, type DestroyedBy } from './attack'
import { leaderService } from './leaders'
import type { EngineContext } from './modules'
import type { GameState, Model, UnitId } from './types'

export const DEATH_BLOW_CODE = 'deathBlow'

const markKey = (unitId: UnitId): string => `db:${unitId}`

function deathBlowAbilityId(state: GameState, unitId: UnitId): string | null {
  const ds = state.datasheets[state.units[unitId]?.datasheetId]
  if (!ds) return null
  return ds.abilities.find((id) => state.abilities[id]?.code === DEATH_BLOW_CODE) ?? null
}

// called by attackService.destroyModel before removeModel; true = removal deferred (caller returns early, no ModelDestroyed yet)
export function tryDeathBlow(ctx: EngineContext, model: Model, by: DestroyedBy): boolean {
  // `pendingRemoval === null` marks a model whose deferred removal is already being finished: never roll twice
  if (by.kind !== 'melee' || model.pendingRemoval !== undefined) return false
  const s = ctx.state
  const unit = s.units[model.unitId]
  if (!unit || unit.turn.foughtThisPhase) return false
  // the attacker mid-activation (attacks made, finishUnit not yet run) has already fought: its own Prime killed by a Death Blow model gets no roll
  const cur = s.phaseState.fight?.currentUnitId
  if (cur && leaderService.sameUnit(s, cur, unit.id)) return false
  if (s.phaseState.marks.includes(`fi:declared:${unit.id}`)) return false
  const abilityId = deathBlowAbilityId(s, unit.id)
  if (!abilityId) return false
  const roll = ctx.roll({ purpose: 'ability', player: unit.player, sides: 6, count: 1, mode: 'perDie', unitId: unit.id, modelId: model.id, commandRerollable: false })
  if (roll.dice[0] < 4) return false
  model.pendingRemoval = { byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind, source: abilityId }
  model.woundsRemaining = 0
  if (!s.phaseState.marks.includes(markKey(unit.id))) s.phaseState.marks.push(markKey(unit.id))
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unit.id, targetUnitId: by.unitId, summary: `Death Blow: ${model.id} may fight before it is removed`, player: unit.player })
  ctx.emit({ type: 'ModelRemovalDeferred', unitId: unit.id, modelId: model.id, source: abilityId, player: unit.player })
  return true
}

// units with a model whose pendingRemoval is set, in deferral order
export function pendingDeathBlowUnits(state: GameState): UnitId[] {
  const hasPending = (id: UnitId): boolean => !!state.units[id] && state.units[id].models.some((m) => !!state.models[m]?.pendingRemoval)
  const ordered = state.phaseState.marks.filter((m) => m.startsWith('db:')).map((m) => m.slice(3) as UnitId).filter(hasPending)
  const rest = Object.values(state.models).filter((m) => m.pendingRemoval && !ordered.includes(m.unitId)).map((m) => m.unitId)
  return [...new Set([...ordered, ...rest])]
}

// after that unit's fight activation (or when the controller declines or it cannot fight): removes the model and emits
// ModelDestroyed / UnitDestroyed with the stored attribution
export function finishDeferredRemoval(ctx: EngineContext, modelId: string): void {
  const model = ctx.state.models[modelId]
  const pr = model?.pendingRemoval
  if (!model || !pr) return
  model.pendingRemoval = null
  attackService.destroyModel(ctx, modelId, { player: pr.byPlayer, unitId: pr.byUnitId, modelId: pr.byModelId, kind: pr.kind })
}

// every deferred model of one unit
export function finishDeferredRemovalOfUnit(ctx: EngineContext, unitId: UnitId): void {
  const u = ctx.state.units[unitId]
  if (!u) return
  for (const mid of [...u.models]) finishDeferredRemoval(ctx, mid)
}
