// Teleport Assault bookkeeping (Grey Knights, docs/spec/factions/grey-knights.md E2/E3): the removal primitive, the record
// store, the Daemonic Fervour grant and the destruction of units that never get to arrive. State lives in
// Player.secondaryState.teleportAssault (free-form, like transports.ts 'embarked'); no GameState field is added.
import { leaderService } from './leaders'
import { removeModel } from './state'
import { EngineInvariantError, type GameState, type PlayerId, type UnitId } from './types'
import type { EngineContext } from './modules'

export interface TeleportRecord { unitId: UnitId; removedRound: number; removedInTurnOf: PlayerId; source: string }
export interface TeleportAssaultState {
  pending: TeleportRecord[]                                         // canonical unit ids currently off-board via Teleport Assault
  fervour: { unitId: UnitId; round: number; turn: PlayerId } | null // Daemonic Fervour grant, valid only for that round+turn
}

export function teleportState(state: GameState, player: PlayerId): TeleportAssaultState {
  const ss = state.players[player].secondaryState
  const cur = ss.teleportAssault as TeleportAssaultState | undefined
  if (!cur || typeof cur !== 'object') {
    const fresh: TeleportAssaultState = { pending: [], fervour: null }
    ss.teleportAssault = fresh
    return fresh
  }
  if (!Array.isArray(cur.pending)) cur.pending = []
  if (cur.fervour === undefined) cur.fervour = null
  return cur
}

const isGone = (state: GameState, id: UnitId | null | undefined): boolean => {
  const u = id ? state.units[id] : undefined
  return !u || u.location === 'destroyed' || u.models.length === 0
}

// Canonical id for Teleport Assault: like leaderService.canonicalUnitId, but a Leader whose bodyguard is gone (destroyed
// before the engine detached them, or never detached) is its own standalone unit.
export function teleportUnitId(state: GameState, unitId: UnitId): UnitId {
  const u = state.units[unitId]
  if (u?.bodyguardUnitId && isGone(state, u.bodyguardUnitId)) return u.id
  if (u?.attachedLeaderId && isGone(state, u.id)) return u.attachedLeaderId
  return leaderService.canonicalUnitId(state, unitId)
}

// the living unit records of a teleporting unit
export function teleportHalves(state: GameState, canonicalId: UnitId): UnitId[] {
  const live = leaderService.halves(state, canonicalId).filter((id) => !isGone(state, id))
  return live.length > 0 ? live : [canonicalId]
}

function canonical(state: GameState, unitId: UnitId): UnitId {
  return teleportUnitId(state, unitId)
}

// unitId or any of its halves
export function isTeleporting(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u) return false
  const ids = new Set<UnitId>([unitId, canonical(state, unitId)])
  return teleportState(state, u.player).pending.some((r) => ids.has(r.unitId))
}

// canonical unit: every half goes to Reserves (attachment kept), a record is pushed and UnitRemovedFromBattlefield is
// emitted once with the canonical id. Throws EngineInvariantError if the unit is not on the board.
export function removeUnitToReserves(ctx: EngineContext, unitId: UnitId, source: string): void {
  const s = ctx.state
  const id = canonical(s, unitId)
  const unit = s.units[id]
  if (!unit || unit.location !== 'board') throw new EngineInvariantError(`removeUnitToReserves: unit ${unitId} is not on the battlefield`)
  const live = teleportHalves(s, id)
  // drop a stale attachment to a destroyed half so the survivor is a plain standalone unit from here on
  for (const h of leaderService.halves(s, id)) {
    if (live.includes(h) || !s.units[h]) continue
    for (const o of live) { if (s.units[o].bodyguardUnitId === h) s.units[o].bodyguardUnitId = null; if (s.units[o].attachedLeaderId === h) s.units[o].attachedLeaderId = null }
  }
  for (const h of live) s.units[h].location = 'reserves'
  teleportState(s, unit.player).pending.push({ unitId: id, removedRound: s.round, removedInTurnOf: s.activePlayer, source })
  ctx.emit({ type: 'UnitRemovedFromBattlefield', unitId: id, source, player: unit.player })
}

export function clearTeleport(state: GameState, unitId: UnitId): void {
  const u = state.units[unitId]
  if (!u) return
  const ids = new Set<UnitId>([unitId, canonical(state, unitId)])
  const ts = teleportState(state, u.player)
  ts.pending = ts.pending.filter((r) => !ids.has(r.unitId))
}

export function grantTeleportFervour(state: GameState, unitId: UnitId): void {
  const id = canonical(state, unitId)
  const u = state.units[id]
  if (!u) return
  teleportState(state, u.player).fervour = { unitId: id, round: state.round, turn: state.activePlayer }
}

export function hasTeleportFervour(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u) return false
  const f = teleportState(state, u.player).fervour
  return !!f && f.unitId === canonical(state, unitId) && f.round === state.round && f.turn === state.activePlayer
}

// GRE-2.6 / GRE-2.4: the unit (all halves) is lost with null attribution
export function destroyTeleportingUnit(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const id = canonical(s, unitId)
  const halves = leaderService.halves(s, id).filter((h) => s.units[h] && s.units[h].location === 'reserves')
  const owner = s.units[id]?.player
  if (!owner) return
  for (const h of halves) {
    const u = s.units[h]
    if (u.location !== 'reserves') continue
    ctx.emit({ type: 'UnitLostInReserves', unitId: h, player: owner })
    let destroyed = false
    for (const mid of [...u.models]) {
      destroyed = removeModel(s, mid)
      ctx.emit({ type: 'ModelDestroyed', unitId: h, modelId: mid, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: owner })
    }
    if (destroyed) {
      ctx.emit({ type: 'UnitDestroyed', unitId: h, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: owner })
      ctx.services.missions.unitDestroyed?.(ctx, { unitId: h, byPlayer: null, byUnitId: null, byModelId: null })
    }
  }
  clearTeleport(s, id)
}

// GRE-2.4: at the end of the battle every unit still off-board via Teleport Assault is destroyed
export function destroyStrandedTeleports(ctx: EngineContext): void {
  for (const pid of ['A', 'B'] as PlayerId[]) {
    for (const r of [...teleportState(ctx.state, pid).pending]) destroyTeleportingUnit(ctx, r.unitId)
  }
}
