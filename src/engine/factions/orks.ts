// Orks engine rules added by Morgrim's Butchas (docs/spec/factions/orks--morgrim-s-butchas.md §7, MOR-*).
// The Gitstompas hooks still live inline in code-hooks.ts; new Ork hooks go here.
import { leaderService } from '../leaders'
import { hookService } from '../hooks-impl'
import type { EngineContext } from '../modules'
import { keywordsOf } from '../state'
import type { StratagemEnv, StratagemTuple } from '../code-hooks'

// MOR-5.2 Bestial Bellow: the first target must be one of our BEASTBOSS / SQUIGHOG BOYZ models (the data filter only takes one keyword)
export function bestialBellowCheck(env: StratagemEnv, tuple: StratagemTuple): boolean {
  const { state } = env
  const model = state.models[tuple.ids[0]]
  if (!model) return false
  const unit = state.units[model.unitId]
  if (!unit || unit.player !== env.player || unit.location !== 'board') return false
  const kws = keywordsOf(state, unit.id)
  if (!kws.includes('BEASTBOSS') && !kws.includes('SQUIGHOG BOYZ')) return false
  const enemy = state.units[leaderService.canonicalUnitId(state, tuple.ids[1])]
  return !!enemy && enemy.player !== env.player && enemy.location === 'board'
}

// the enemy unit takes a Battle-shock test with 1 subtracted from the 2D6 (hookService.battleShockTest handles the rest)
export function bestialBellowApply(ctx: EngineContext, env: StratagemEnv, tuple: StratagemTuple): void {
  const { state } = ctx
  const enemy = leaderService.canonicalUnitId(state, tuple.ids[1])
  const source = state.models[tuple.ids[0]]?.unitId ?? null
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: source, targetUnitId: enemy, summary: 'Battle-shock test (-1)', player: env.player })
  hookService.battleShockTest(ctx, enemy, env.stratagem.id, -1)
}
