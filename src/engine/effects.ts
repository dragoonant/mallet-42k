// Active effects (stratagem / ability grants with a duration, 20-data §3). Owner: W1-F. The core calls `expire` at
// phase end, turn end, round end and at the start of each player's turn; hooks-impl reads the holder's `effects` when
// collecting. An effect is stored on the unit record it was granted to; `scope` is evaluated relative to that holder
// (self = the whole attached unit, attacker = attacks made against the holder, friendly/enemy + within = aura).
import type { Duration, EffectList, Scope } from '../data/types'
import { distance } from './geometry'
import { leaderService } from './leaders'
import type { EngineContext } from './modules'
import { unitModels } from './state'
import type { ActiveEffect, GameState, PlayerId, UnitId } from './types'

export interface EffectGrant {
  sourceAbilityId: string
  sourceUnitId: UnitId | null
  scope: Scope
  duration: Duration
  when?: ActiveEffect['when']
}

export interface EffectService {
  grant(ctx: EngineContext, unitId: UnitId, effect: EffectList, grant: EffectGrant): ActiveEffect
  // remove effects whose expiry kind matches (player: the owner whose turn starts for 'nextOwnTurn'); emits EffectExpired
  expire(ctx: EngineContext, kind: ActiveEffect['expires']['kind'], player: PlayerId | null): void
  // effects that apply to this unit: its own, its attached partner's (one unit, R-10.1) and auras of other units in range
  activeFor(state: GameState, unitId: UnitId): ActiveEffect[]
}

export function expiryFor(duration: Duration, state: GameState, owner: PlayerId | null): ActiveEffect['expires'] {
  const round = state.round
  switch (duration) {
    case 'instant': case 'untilEndOfPhase': return { kind: 'phaseEnd', round, player: null }
    case 'untilEndOfTurn': return { kind: 'turnEnd', round, player: null }
    case 'untilNextTurn': return { kind: 'nextOwnTurn', round, player: owner }
    case 'untilEndOfRound': return { kind: 'roundEnd', round, player: null }
    case 'battle': return { kind: 'battle', round, player: null }
  }
}

// ids must be deterministic across replays: derived from state counters plus a per-step disambiguator
function nextEffectId(state: GameState, unitId: UnitId): string {
  const base = `e:${state.decisionCounter}.${state.rollCounter}.${unitId}`
  const taken = new Set<string>()
  for (const u of Object.values(state.units)) for (const e of u.effects) taken.add(e.id)
  let n = 0
  while (taken.has(`${base}.${n}`)) n++
  return `${base}.${n}`
}

export const effectService: EffectService = {
  grant(ctx, unitId, effect, grant) {
    const s = ctx.state
    const unit = s.units[unitId]
    const owner = unit?.player ?? null
    const active: ActiveEffect = {
      id: nextEffectId(s, unitId),
      sourceAbilityId: grant.sourceAbilityId,
      sourceUnitId: grant.sourceUnitId,
      effect: structuredClone(effect),
      scope: { ...grant.scope },
      expires: expiryFor(grant.duration, s, owner),
      when: grant.when ? structuredClone(grant.when) : null,
    }
    unit.effects.push(active)
    return active
  },
  expire(ctx, kind, player) {
    for (const unit of Object.values(ctx.state.units)) {
      const keep: ActiveEffect[] = []
      for (const e of unit.effects) {
        const gone = e.expires.kind === kind && (kind !== 'nextOwnTurn' || e.expires.player === player)
        if (gone) ctx.emit({ type: 'EffectExpired', effectId: e.id, unitId: unit.id, player: unit.player })
        else keep.push(e)
      }
      if (keep.length !== unit.effects.length) unit.effects = keep
    }
  },
  activeFor(state, unitId) {
    const unit = state.units[unitId]
    if (!unit) return []
    const out: ActiveEffect[] = []
    const seen = new Set<string>()
    const add = (e: ActiveEffect) => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e) } }
    for (const id of leaderService.halves(state, unitId)) for (const e of state.units[id].effects) add(e)
    const mine = unit.location === 'board' ? leaderService.halves(state, unitId).flatMap((id) => state.units[id].location === 'board' ? unitModels(state, id) : []) : []
    for (const other of Object.values(state.units)) {
      if (leaderService.sameUnit(state, other.id, unitId) || other.location !== 'board') continue
      for (const e of other.effects) {
        if (e.scope.who !== 'friendly' && e.scope.who !== 'enemy') continue
        if ((e.scope.who === 'friendly') !== (other.player === unit.player)) continue
        const within = e.scope.within
        if (within !== undefined) {
          const theirs = unitModels(state, other.id)
          if (!mine.some((m) => theirs.some((t) => distance(m, t) <= within + 1e-6))) continue
        }
        add(e)
      }
    }
    return out
  },
}
