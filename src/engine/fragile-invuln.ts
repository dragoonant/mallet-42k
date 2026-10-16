// Single-failure invulnerable save (Drukhari Shadowfield, docs/spec/factions/drukhari.md section 7.1 E2).
// A model whose datasheet lists an ability with code FRAGILE_INVULN_CODE keeps its invulnerable save until it fails one
// invulnerable save roll; from then on the model has no invulnerable save for the rest of the battle. The save cannot
// be re-rolled while it is still live. The "lost" flag is `shadowfield:lost:<modelId>` in the owner's oncePerBattleUsed.
import type { EngineContext } from './modules'
import type { GameState, ModelId } from './types'

export const FRAGILE_INVULN_CODE = 'shadowfield'
const lostKey = (modelId: ModelId): string => `${FRAGILE_INVULN_CODE}:lost:${modelId}`

// the model's datasheet lists an ability with code FRAGILE_INVULN_CODE
export function hasFragileInvuln(state: GameState, modelId: ModelId): boolean {
  const model = state.models[modelId]
  const unit = model ? state.units[model.unitId] : undefined
  const ds = unit ? state.datasheets[unit.datasheetId] : undefined
  return !!ds && ds.abilities.some((id) => state.abilities[id]?.code === FRAGILE_INVULN_CODE)
}

// players[owner].oncePerBattleUsed includes `shadowfield:lost:<modelId>`
export function fragileInvulnLost(state: GameState, modelId: ModelId): boolean {
  const model = state.models[modelId]
  const unit = model ? state.units[model.unitId] : undefined
  return !!unit && state.players[unit.player].oncePerBattleUsed.includes(lostKey(modelId))
}

// pushes that key and emits AbilityTriggered '<model>: invulnerable save lost for the battle'
export function loseFragileInvuln(ctx: EngineContext, modelId: ModelId): void {
  const s = ctx.state
  const model = s.models[modelId]
  const unit = model ? s.units[model.unitId] : undefined
  if (!model || !unit || fragileInvulnLost(s, modelId)) return
  s.players[unit.player].oncePerBattleUsed.push(lostKey(modelId))
  const ability = s.datasheets[unit.datasheetId].abilities.find((id) => s.abilities[id]?.code === FRAGILE_INVULN_CODE) ?? 'drk.a.shadowfield'
  ctx.emit({ type: 'AbilityTriggered', abilityId: ability, sourceUnitId: unit.id, targetUnitId: null, summary: `${modelId}: invulnerable save lost for the battle`, player: unit.player })
}
