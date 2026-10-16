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
import { EPS, anyWithinEngagementRange, baseEdgePoints, growConvexPolygon, horizontalGap, whollyOnBoard, type Footprint } from './geometry'
import type { ModelPlacement } from './actions'
import type { EngineContext } from './modules'
import { autoDeployPlacements } from './setup'
import { boardModelsOf, datasheetOf, enemyModelsOnBoard, keywordsOf, removeModel, setModelPos } from './state'
import { terrainService } from './terrain'
import { leaderService } from './leaders'
import type { GameState, Model, PlayerId, Polygon, UnitId } from './types'

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
  // SDC E1: keyword gates + spare capacity (models) only; position-free, so it also serves setup embarkation
  canCarry(state: GameState, passengerUnitId: UnitId, transportUnitId: UnitId): boolean
  // SDC E1: the transport footprint grown by `by` inches (default 3); the zone a disembarking unit is set up in
  disembarkZone(state: GameState, transportUnitId: UnitId, by?: number): Polygon
  // SDC E1 / R-5.20: the transport was destroyed - place its passengers around the wreck
  emergencyDisembark(ctx: EngineContext, transportUnitId: UnitId): void
  // R-5.18: the unit disembarked from a transport that had moved (or was destroyed) and may not charge this turn
  cannotChargeThisTurn(state: GameState, unitId: UnitId): boolean
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
    if (ds.transport) return ds.transport.capacity
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
    if (mode === 'countsAsNormalMove' && unit.turn) { unit.turn.moveType = 'normal'; markNoCharge(state, passengerUnitId) }
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
    if (!transportService.canCarry(state, unitId, transportUnitId)) return false
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
  canCarry(state, passengerUnitId, transportUnitId) {
    const unit = state.units[passengerUnitId]
    const transportUnit = state.units[transportUnitId]
    if (!unit || !transportUnit || passengerUnitId === transportUnitId || unit.player !== transportUnit.player) return false
    // an attached Leader + bodyguard cannot embark: embark/disembark track one unit record, so the Leader half would be
    // left alone on the board. Refused outright (RULING in the engine issues) until a combined-unit disembark exists.
    if (leaderService.halves(state, passengerUnitId).length > 1) return false
    const cap = transportService.capacity(state, transportUnitId)
    if (cap <= 0) return false
    const spec = datasheetOf(state, transportUnitId).transport
    if (spec) {
      const kw = keywordsOf(state, passengerUnitId)
      if (!(spec.keywords ?? []).every((k) => kw.includes(k))) return false
      if ((spec.excludeKeywords ?? []).some((k) => kw.includes(k))) return false
    }
    let used = 0
    for (const id of transportService.embarkedIn(state, transportUnitId)) if (id !== passengerUnitId) used += state.units[id]?.models.length ?? 0
    return used + unit.models.length <= cap
  },
  disembarkZone(state, transportUnitId, by = 3) {
    return growConvexPolygon(transportFootprints(state, transportUnitId).flatMap((f) => baseEdgePoints(f)), by, 32)
  },
  emergencyDisembark(ctx, transportUnitId) {
    emergencyDisembark(ctx, transportUnitId)
  },
  cannotChargeThisTurn(state, unitId) {
    const unit = state.units[unitId]
    if (!unit) return false
    return store(state, unit.player, 'noCharge')[unitId] === `${state.round}:${state.activePlayer}`
  },
}

function markNoCharge(state: GameState, unitId: UnitId): void {
  store(state, state.units[unitId].player, 'noCharge')[unitId] = `${state.round}:${state.activePlayer}`
}

// the transport's model footprints: live models, else the wreck recorded when its last model was removed
function transportFootprints(state: GameState, transportUnitId: UnitId): Footprint[] {
  const u = state.units[transportUnitId]
  if (!u) return []
  const live = resolveModels(state, transportUnitId)
  const src = live.length > 0 ? live : (u.destroyedModels ?? [])
  return src.map((m) => ({ pos: m.pos, facing: m.facing, base: m.base }))
}

// Battle-shock expiry (start of the owner's next Command phase), mirrored from hooks-impl shockExpiryRound
function shockExpiry(state: GameState, owner: PlayerId): number {
  if (owner === state.activePlayer) return state.round + 1
  return state.activePlayer === state.firstPlayer ? state.round : state.round + 1
}

// R-5.20: a destroyed Transport's passengers disembark. Each unit is set up wholly within 3" of the wreck (else 6"),
// outside Engagement Range of every enemy; models that cannot be placed are destroyed. A D6 per set-up model: on a 1
// (1-3 when the unit had to use the 6" zone) the unit suffers a mortal wound. The unit is Battle-shocked, counts as having
// made a Normal move and cannot charge this turn. Called by attack.ts after Deadly Demise has been rolled.
function emergencyDisembark(ctx: EngineContext, transportUnitId: UnitId): void {
  const s = ctx.state
  const transport = s.units[transportUnitId]
  if (!transport) return
  const enemies = enemyModelsOnBoard(s, transport.player)
  type Placed = ModelPlacement
  for (const passengerId of transportService.embarkedIn(s, transportUnitId)) {
    const unit = s.units[passengerId]
    if (!unit || unit.location === 'destroyed') continue
    // the unit leaves the transport now
    delete (store(s, unit.player, 'embarked') as Record<UnitId, UnitId>)[passengerId]
    delete store(s, unit.player, 'embarkedAt')[passengerId]
    const models = unit.models.map((id) => s.models[id]).filter((m): m is Model => !!m)
    const clear = (m: Model, pos: { x: number; y: number; z: number }, facing = m.facing): boolean =>
      whollyOnBoard({ pos, facing, base: m.base }, s.board) && !anyWithinEngagementRange({ pos, facing, base: m.base }, enemies) && terrainService.canEndAt(s, m, pos).ok
    let placedAt: 3 | 6 = 3
    let placements: Placed[] = []
    for (const by of [3, 6] as const) {
      const zone = transportService.disembarkZone(s, transportUnitId, by)
      const others = boardModelsOf(s, transport.player)
      const all = autoDeployPlacements(models, zone, others, enemies, { canPlace: clear })
      if (all) { placements = all; placedAt = by; break }
      // no room for the whole unit: set up whoever fits, one model at a time
      const got: Placed[] = []
      const placedFp: Model[] = []
      for (const m of models) {
        const one = autoDeployPlacements([m], zone, [...others, ...placedFp], enemies, { canPlace: clear })
        if (one) { got.push(one[0]); placedFp.push({ ...m, pos: one[0].pos, facing: one[0].facing ?? m.facing }) }
      }
      if (got.length > placements.length) { placements = got; placedAt = by }
      if (got.length === models.length) break
    }
    const placedIds = new Set(placements.map((p) => p.modelId))
    for (const m of models) {
      if (placedIds.has(m.id)) continue
      const wasLast = removeModel(s, m.id)
      ctx.emit({ type: 'ModelDestroyed', unitId: unit.id, modelId: m.id, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: unit.player })
      if (wasLast) ctx.emit({ type: 'UnitDestroyed', unitId: unit.id, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: unit.player })
    }
    if (placements.length === 0) continue
    for (const p of placements) { const m = s.models[p.modelId]; if (m) setModelPos(m, p.pos, p.facing ?? m.facing) }
    unit.location = 'board'
    unit.turn.moveType = 'normal'
    unit.turn.arrivedThisTurn = true
    markNoCharge(s, passengerId)
    store(s, unit.player, 'disembarkedAt')[passengerId] = { key: phaseKey(s), mode: 'countsAsNormalMove' }
    ctx.emit({ type: 'AbilityTriggered', abilityId: 'transport.emergencyDisembark', sourceUnitId: transportUnitId, targetUnitId: passengerId, summary: `${unit.name} abandon the wrecked transport`, player: unit.player })
    // D6 per model set up: a 1 (1-3 from the 6" zone) is a mortal wound
    const roll = ctx.roll({ purpose: 'ability', player: unit.player, sides: 6, count: placements.length, mode: 'perDie', unitId: passengerId, commandRerollable: false })
    const limit = placedAt === 3 ? 1 : 3
    const mortals = roll.dice.filter((d) => d <= limit).length
    unit.battleShocked = true
    unit.battleShockExpiresRound = shockExpiry(s, unit.player)
    ctx.emit({ type: 'BattleShocked', unitId: passengerId, player: unit.player })
    if (mortals > 0) ctx.services.attack.queueMortalWounds(ctx, passengerId, mortals, 'emergencyDisembark', false)
  }
}
