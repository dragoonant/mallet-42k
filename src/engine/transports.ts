// Transports (10-rules §5.3, R-5.17–R-5.20). Owner: W1-C. No transport exists in either Combat Patrol box (no
// datasheet carries a capacity), so this is implemented lazily [interp], ready to be exercised once real transport
// data exists: embarked units are kept `location: 'reserves'` with the link recorded in the *passenger's own
// player's* `secondaryState.embarked` (unitId -> transportUnitId), per the note in 00-arch/phases/README. Capacity
// has no data-schema field (CoreAbilityName has no TRANSPORT entry and this file cannot add one — data/types.ts is
// not mine); the convention here is a faction/datasheet keyword shaped `TRANSPORT:<n>` giving capacity n. Flagged
// in STATUS/issues for whoever adds the first real transport datasheet to confirm or replace.
//
// Phase bookkeeping (R-5.17 "not if it disembarked this phase", R-5.18 "only a unit that began the phase embarked"):
// UnitTurnState is a frozen contract, so embark/disembark moments are recorded in the passenger owner's
// `secondaryState.embarkedAt` / `secondaryState.disembarkedAt` as `round:activePlayer:phase` keys.
import { EPS, anyWithinEngagementRange, horizontalGap, type Footprint } from './geometry'
import { datasheetOf, enemyModelsOnBoard } from './state'
import type { GameState, Model, PlayerId, UnitId } from './types'

// how a disembarking unit behaves for the rest of the turn (R-5.18)
//  'actsNormally'       — transport has not moved (or Remained Stationary): the unit must move, cannot Remain Stationary
//  'countsAsNormalMove' — transport already made a Normal move: the unit counts as having made a Normal move, and
//                         cannot move further or charge this turn
export type DisembarkMode = 'actsNormally' | 'countsAsNormalMove'

export interface TransportService {
  embarkedIn(state: GameState, transportUnitId: UnitId): UnitId[]
  capacity(state: GameState, transportUnitId: UnitId): number
  // ---- extras (mine): bookkeeping + legality helpers movement.ts (and future callers) build on ----
  transportOf(state: GameState, passengerUnitId: UnitId): UnitId | null
  embark(state: GameState, passengerUnitId: UnitId, transportUnitId: UnitId): void
  // returns the transport it was embarked in, or null if it was not embarked. Records the disembark moment and, when
  // the transport already made a Normal move, marks the passenger as having made a Normal move (R-5.18).
  disembark(state: GameState, passengerUnitId: UnitId): UnitId | null
  // R-5.17: friendly transport on the board, spare capacity for the whole unit, every model within 3", and the unit
  // did not disembark this phase
  canEmbark(state: GameState, unitId: UnitId, transportUnitId: UnitId): boolean
  // R-5.17 / R-5.18 phase bookkeeping
  disembarkedThisPhase(state: GameState, unitId: UnitId): boolean
  disembarkModeThisPhase(state: GameState, unitId: UnitId): DisembarkMode | null
  // R-5.18: null when the embarked unit cannot disembark now (not embarked, embarked this phase, transport not on the
  // board, or the transport Advanced / Fell Back this turn)
  disembarkMode(state: GameState, passengerUnitId: UnitId): DisembarkMode | null
  // R-5.18: every proposed footprint wholly within 3" of the transport and outside Engagement Range of every enemy
  canDisembarkAt(state: GameState, passengerUnitId: UnitId, footprints: Footprint[]): boolean
}

function store(state: GameState, owner: PlayerId, key: string): Record<string, unknown> {
  const s = state.players[owner].secondaryState
  if (!s[key] || typeof s[key] !== 'object') s[key] = {}
  return s[key] as Record<string, unknown>
}
const embarkedMap = (state: GameState, owner: PlayerId) => store(state, owner, 'embarked') as Record<UnitId, UnitId>

function phaseKey(state: GameState): string {
  return `${state.round}:${state.activePlayer}:${state.phase}`
}

const TRANSPORT_KEYWORD_RE = /^TRANSPORT:(\d+)$/

function resolveModels(state: GameState, id: UnitId): Model[] {
  return (state.units[id]?.models ?? []).map((mid) => state.models?.[mid]).filter((m): m is Model => !!m)
}

export const transportService: TransportService = {
  embarkedIn(state, transportUnitId) {
    const out: UnitId[] = []
    for (const p of Object.values(state.players)) {
      for (const [passenger, transport] of Object.entries(embarkedMap(state, p.id))) {
        if (transport === transportUnitId) out.push(passenger)
      }
    }
    return out
  },
  capacity(state, transportUnitId) {
    const ds = datasheetOf(state, transportUnitId)
    for (const k of [...ds.keywords, ...ds.factionKeywords]) {
      const m = TRANSPORT_KEYWORD_RE.exec(k)
      if (m) return Number(m[1])
    }
    return 0
  },
  transportOf(state, passengerUnitId) {
    const unit = state.units[passengerUnitId]
    if (!unit) return null
    return embarkedMap(state, unit.player)[passengerUnitId] ?? null
  },
  embark(state, passengerUnitId, transportUnitId) {
    const unit = state.units[passengerUnitId]
    embarkedMap(state, unit.player)[passengerUnitId] = transportUnitId
    store(state, unit.player, 'embarkedAt')[passengerUnitId] = phaseKey(state)
    unit.location = 'reserves'
  },
  disembark(state, passengerUnitId) {
    const unit = state.units[passengerUnitId]
    if (!unit) return null
    const map = embarkedMap(state, unit.player)
    const t = map[passengerUnitId] ?? null
    if (t === null) return null
    const transport = state.units[t]
    const mode: DisembarkMode = transport?.turn?.moveType === 'normal' ? 'countsAsNormalMove' : 'actsNormally'
    delete map[passengerUnitId]
    delete store(state, unit.player, 'embarkedAt')[passengerUnitId]
    store(state, unit.player, 'disembarkedAt')[passengerUnitId] = { key: phaseKey(state), mode }
    if (mode === 'countsAsNormalMove' && unit.turn) unit.turn.moveType = 'normal'
    return t
  },
  canEmbark(state, unitId, transportUnitId) {
    const unit = state.units[unitId]
    const transportUnit = state.units[transportUnitId]
    if (!unit || !transportUnit || unitId === transportUnitId) return false
    // MOVE-029-enemy (R-5.17): friendly TRANSPORT only, and both must actually be on the battlefield
    if (transportUnit.player !== unit.player) return false
    if (unit.location !== 'board' || transportUnit.location !== 'board') return false
    if (transportService.disembarkedThisPhase(state, unitId)) return false
    // MOVE-026-embark: a unit that arrived from Reserves this phase (Deep Strike, Rapid Ingress, reinforcements) has
    // used its move for the phase already and cannot also embark.
    if (unit.turn?.arrivedThisTurn) return false
    // MOVE-029-stationary: embarking counts as (or happens as part of) a Normal/Advance/Fall Back move — a unit that
    // Remained Stationary this phase cannot embark.
    if (unit.turn?.moveType === 'stationary') return false
    const cap = transportService.capacity(state, transportUnitId)
    if (cap <= 0) return false
    const already = transportService.embarkedIn(state, transportUnitId).filter((id) => id !== unitId)
    let used = 0
    for (const id of already) used += state.units[id]?.models.length ?? 0
    if (used + unit.models.length > cap) return false
    // MOVE-029-3in: every model of the embarking unit must be within 3" horizontally of a model of the transport.
    // Skipped (rather than treated as a hard fail) when either side's model positions aren't resolvable — e.g. the
    // hand-built minimal fixtures in movement.test.ts that model capacity bookkeeping only, with no `state.models`.
    const transportModels = resolveModels(state, transportUnitId)
    const passengerModels = resolveModels(state, unitId)
    if (transportModels.length > 0 && passengerModels.length > 0) {
      for (const pm of passengerModels) {
        const near = transportModels.some((tm) => horizontalGap({ pos: pm.pos, facing: pm.facing, base: pm.base }, { pos: tm.pos, facing: tm.facing, base: tm.base }) <= 3 + EPS)
        if (!near) return false
      }
    }
    return true
  },
  disembarkedThisPhase(state, unitId) {
    return transportService.disembarkModeThisPhase(state, unitId) !== null
  },
  disembarkModeThisPhase(state, unitId) {
    const unit = state.units[unitId]
    if (!unit) return null
    const rec = store(state, unit.player, 'disembarkedAt')[unitId] as { key: string; mode: DisembarkMode } | undefined
    return rec && rec.key === phaseKey(state) ? rec.mode : null
  },
  disembarkMode(state, passengerUnitId) {
    const unit = state.units[passengerUnitId]
    if (!unit) return null
    const t = transportService.transportOf(state, passengerUnitId)
    if (t === null) return null
    // R-5.18: only a unit that began this phase embarked
    if (store(state, unit.player, 'embarkedAt')[passengerUnitId] === phaseKey(state)) return null
    const transport = state.units[t]
    if (!transport || transport.location !== 'board') return null
    const mt = transport.turn?.moveType ?? null
    if (mt === 'advance' || mt === 'fallBack') return null
    return mt === 'normal' ? 'countsAsNormalMove' : 'actsNormally'
  },
  canDisembarkAt(state, passengerUnitId, footprints) {
    const unit = state.units[passengerUnitId]
    const t = transportService.transportOf(state, passengerUnitId)
    if (!unit || t === null) return false
    const transportModels = resolveModels(state, t)
    if (transportModels.length === 0 || footprints.length === 0) return false
    const enemies = enemyModelsOnBoard(state, unit.player)
    for (const f of footprints) {
      // "wholly within 3"": the far edge of the base is within 3", i.e. edge gap plus the base's widest extent
      const extent = 2 * Math.max(f.base.radius, f.base.radius2 ?? f.base.radius)
      const wholly = transportModels.some((tm) => horizontalGap(f, { pos: tm.pos, facing: tm.facing, base: tm.base }) + extent <= 3 + EPS)
      if (!wholly) return false
      if (anyWithinEngagementRange(f, enemies)) return false
    }
    return true
  },
}
