// Drukhari Power from Pain pool (docs/spec/factions/drukhari.md section 7.1 E1). Owner: Drukhari core.
// Each player keeps an independent pool of Pain tokens in `players[p].secondaryState.painTokens`. Tokens are gained at
// battle start and whenever an enemy unit is destroyed or fails a Battle-shock test; a token is spent to Empower a
// unit for the current phase. The Empowered record is `players[p].secondaryState.empowered`; it is stale (and ignored)
// whenever the round, turn or phase differs from now, so it never needs an explicit clear.
// The code hooks that spend tokens and grant the re-rolls live in factions/drukhari.ts.
import { leaderService } from './leaders'
import type { EngineContext } from './modules'
import type { GameState, Phase, PlayerId, UnitId } from './types'

export const POWER_FROM_PAIN_CODE = 'powerFromPain'
export const PAIN_TOKENS_KEY = 'painTokens'
export const EMPOWERED_KEY = 'empowered'
export interface EmpoweredRecord { round: number; turn: PlayerId; phase: Phase; unitIds: UnitId[] }

const PFP_ABILITY_ID = 'drk.a.power-from-pain'

// true when any of the player's units (any location) has an ability whose code is POWER_FROM_PAIN_CODE
export function hasPowerFromPain(state: GameState, player: PlayerId): boolean {
  for (const u of Object.values(state.units)) {
    if (u.player !== player) continue
    const ds = state.datasheets[u.datasheetId]
    if (ds && ds.abilities.some((id) => state.abilities[id]?.code === POWER_FROM_PAIN_CODE)) return true
  }
  return false
}

export function painTokens(state: GameState, player: PlayerId): number {
  const v = state.players[player]?.secondaryState[PAIN_TOKENS_KEY]
  return typeof v === 'number' && v > 0 ? v : 0
}

export function gainPainToken(ctx: EngineContext, player: PlayerId, source: 'battleStart' | 'unitDestroyed' | 'battleShockFailed'): void {
  const s = ctx.state
  const n = painTokens(s, player) + 1
  s.players[player].secondaryState[PAIN_TOKENS_KEY] = n
  ctx.emit({ type: 'AbilityTriggered', abilityId: PFP_ABILITY_ID, sourceUnitId: null, targetUnitId: null, summary: `Pain token gained (${source}): ${n}`, player })
}

function currentRecord(state: GameState, player: PlayerId): EmpoweredRecord | null {
  const r = state.players[player]?.secondaryState[EMPOWERED_KEY] as EmpoweredRecord | undefined
  if (!r || r.round !== state.round || r.turn !== state.activePlayer || r.phase !== state.phase) return null
  return r
}

// false (no change) when the pool is 0; else -1 and records the canonical unit as Empowered for the current phase
export function spendPainToken(ctx: EngineContext, player: PlayerId, unitId: UnitId): boolean {
  const s = ctx.state
  const n = painTokens(s, player)
  if (n <= 0) return false
  s.players[player].secondaryState[PAIN_TOKENS_KEY] = n - 1
  const cur = currentRecord(s, player)
  const canonical = leaderService.canonicalUnitId(s, unitId)
  const rec: EmpoweredRecord = cur ?? { round: s.round, turn: s.activePlayer, phase: s.phase, unitIds: [] }
  if (!rec.unitIds.includes(canonical)) rec.unitIds = [...rec.unitIds, canonical]
  s.players[player].secondaryState[EMPOWERED_KEY] = rec
  return true
}

export function isEmpowered(state: GameState, unitId: UnitId): boolean {
  const unit = state.units[unitId]
  if (!unit) return false
  const rec = currentRecord(state, unit.player)
  return !!rec && rec.unitIds.some((id) => leaderService.sameUnit(state, id, unitId))
}

export function startBattlePain(ctx: EngineContext): void {
  for (const p of Object.keys(ctx.state.players) as PlayerId[]) if (hasPowerFromPain(ctx.state, p)) gainPainToken(ctx, p, 'battleStart')
}

// a unit destroyed, or an unsuccessful Battle-shock test: the unit's opponent gains a token if it has the ability
export function onPainEvent(ctx: EngineContext, e: { type: string; unitId?: UnitId; passed?: boolean }): void {
  let source: 'unitDestroyed' | 'battleShockFailed'
  if (e.type === 'UnitDestroyed') source = 'unitDestroyed'
  else if (e.type === 'BattleShockTested' && e.passed === false) source = 'battleShockFailed'
  else return
  const unit = e.unitId ? ctx.state.units[e.unitId] : undefined
  if (!unit) return
  const gainer: PlayerId = unit.player === 'A' ? 'B' : 'A'
  if (hasPowerFromPain(ctx.state, gainer)) gainPainToken(ctx, gainer, source)
}
