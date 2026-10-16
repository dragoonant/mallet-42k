// Leagues of Votann Judgement tokens (docs/spec/factions/leagues-of-votann.md §7.1 E1). Tokens live in
// Player.secondaryState[JUDGEMENT_KEY] of the LEAGUES OF VOTANN player: a map from enemy unit id to a count 0..2.
// No GameState field is added. The Eye of the Ancestors hit/wound bonus is a code hook that reads judgementTokens().
import { leaderService } from './leaders'
import { keywordsOf } from './state'
import type { EngineContext } from './modules'
import type { DestroyedBy } from './attack'
import type { GameState, PlayerId, UnitId } from './types'

export const JUDGEMENT_KEY = 'lov:judgement'
export const JUDGEMENT_MAX = 2
export const EYE_OF_THE_ANCESTORS_CODE = 'eyeOfTheAncestors'
const LOV_KEYWORD = 'LEAGUES OF VOTANN'

function tokenMap(state: GameState, owner: PlayerId, create: boolean): Record<UnitId, number> | null {
  const ss = state.players[owner].secondaryState
  const cur = ss[JUDGEMENT_KEY]
  if (cur && typeof cur === 'object') return cur as Record<UnitId, number>
  if (!create) return null
  const fresh: Record<UnitId, number> = {}
  ss[JUDGEMENT_KEY] = fresh
  return fresh
}

// the unit record plus its attached partner (leaderService.halves), whatever their state
function halvesOf(state: GameState, unitId: UnitId): UnitId[] {
  const ids = leaderService.halves(state, leaderService.canonicalUnitId(state, unitId)).filter((id) => !!state.units[id])
  return ids.length > 0 ? ids : state.units[unitId] ? [unitId] : []
}

// tokens `owner`'s models see on `unitId`: max over the unit's halves, 0..JUDGEMENT_MAX
export function judgementTokens(state: GameState, owner: PlayerId, unitId: UnitId): number {
  const map = tokenMap(state, owner, false)
  if (!map) return 0
  let best = 0
  for (const id of halvesOf(state, unitId)) best = Math.max(best, map[id] ?? 0)
  return Math.min(JUDGEMENT_MAX, best)
}

// adds n (capped) to every half of the canonical unit of `unitId`, destroyed halves included so a later survivor keeps
// the count; emits AbilityTriggered only when the count changes; returns the new count
export function addJudgement(ctx: EngineContext, owner: PlayerId, unitId: UnitId, n: number, source: string): number {
  const s = ctx.state
  const before = judgementTokens(s, owner, unitId)
  const after = Math.min(JUDGEMENT_MAX, before + n)
  if (after === before) return before
  const map = tokenMap(s, owner, true) as Record<UnitId, number>
  const halves = halvesOf(s, unitId)
  for (const id of halves) map[id] = after
  const canonical = leaderService.canonicalUnitId(s, unitId)
  const name = s.units[canonical]?.name ?? canonical
  ctx.emit({
    type: 'AbilityTriggered', abilityId: source, sourceUnitId: null, targetUnitId: canonical,
    summary: `Judgement: ${name} now has ${after} token${after === 1 ? '' : 's'}`, player: owner,
  })
  return after
}

function carriesEye(state: GameState, unitId: UnitId): boolean {
  const ds = state.datasheets[state.units[unitId]?.datasheetId]
  return (ds?.abilities ?? []).some((id) => state.abilities[id]?.code === EYE_OF_THE_ANCESTORS_CODE)
}

// LEA-2.1: a LEAGUES OF VOTANN unit with Eye of the Ancestors was destroyed by an enemy unit -> that unit gains a token
export function judgementOnUnitDestroyed(ctx: EngineContext, destroyedUnitId: UnitId, by: DestroyedBy): void {
  const s = ctx.state
  const dead = s.units[destroyedUnitId]
  if (!dead || by.unitId === null) return
  const killer = s.units[by.unitId]
  if (!killer || killer.player === dead.player) return
  if (!keywordsOf(s, destroyedUnitId).includes(LOV_KEYWORD) || !carriesEye(s, destroyedUnitId)) return
  addJudgement(ctx, dead.player, by.unitId, 1, 'lov.a.eye-of-the-ancestors')
}
