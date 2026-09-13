// Active effects (stratagem / ability grants with a duration, 20-data §3). Owner: W1-F. The core calls `expire` at
// phase end, turn end, round end and at the start of each player's turn; hooks-impl reads `activeFor` when collecting.
import type { Duration, EffectList, Scope } from '../data/types'
import type { EngineContext } from './modules'
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

let effectCounter = 0

export const effectService: EffectService = {
  grant(ctx, unitId, effect, grant) {
    const s = ctx.state
    const unit = s.units[unitId]
    const owner = unit?.player ?? null
    // ids must be deterministic across replays: derive from the decision/roll counters, not a module-level counter
    effectCounter = s.decisionCounter * 1000 + s.rollCounter * 10 + unit.effects.length
    const active: ActiveEffect = {
      id: `e:${effectCounter}`,
      sourceAbilityId: grant.sourceAbilityId,
      sourceUnitId: grant.sourceUnitId,
      effect,
      scope: grant.scope,
      expires: expiryFor(grant.duration, s, owner),
      when: grant.when ?? null,
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
  // TODO(W1-F): include effects with scope friendly/enemy within range from other units
  activeFor: (state, unitId) => state.units[unitId]?.effects ?? [],
}
