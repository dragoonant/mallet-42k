// Leaders / attached units (R-10.1, R-4.5, R-1.7). Owner: W1-F (detach flow), consulted by W1-D (allocation, toughness).
// createGame sets Unit.attachedLeaderId / bodyguardUnitId from GameSetup.attachments. An attached unit is two Unit
// records (leader + bodyguard) linked both ways; for every rule it is one unit except "unit destroyed" triggers.
// The bodyguard record is the canonical id of the pair (stratagem target options, oath picks).
import { distance, unitsWithinEngagementRange, withinEngagementRange } from './geometry'
import type { EngineContext } from './modules'
import { datasheetOf, keywordsOf, modelStats, unitModels } from './state'
import type { GameState, Model, ModelId, PlayerId, Unit, UnitId } from './types'

export interface LeaderService {
  isAttached(state: GameState, unitId: UnitId): boolean
  // the other half of an attached unit (leader ↔ bodyguard) or null
  partnerOf(state: GameState, unitId: UnitId): UnitId | null
  // models of the whole attached unit (bodyguard + leader), used for coherency, eligibility and targeting
  combinedModels(state: GameState, unitId: UnitId): Model[]
  // R-10.1: attacks against an attached unit use the bodyguard's T
  toughnessFor(state: GameState, targetUnitId: UnitId): number
  // R-4.5: attached SS = leader SS + bodyguard SS
  startingStrength(state: GameState, unitId: UnitId): number
  // split the attached unit when one half is destroyed (LeaderDetached); called by the attack module after the
  // attacking unit finishes (R-10.1)
  detach(ctx: EngineContext, unitId: UnitId): void
}

// additions (W1-F); optional on the interface so existing stubs stay valid, always present on `leaderService`
export interface LeaderQueries {
  // the unit records making up the (possibly attached) unit: [unitId] or [bodyguard, leader]
  halves(state: GameState, unitId: UnitId): UnitId[]
  // bodyguard id for an attached pair, else the unit itself
  canonicalUnitId(state: GameState, unitId: UnitId): UnitId
  // true when both ids name the same (possibly attached) unit
  sameUnit(state: GameState, a: UnitId | null | undefined, b: UnitId | null | undefined): boolean
  // R-10.1 Declare Battle Formations legality: LEADER datasheet listing the bodyguard, same player, both unattached
  canAttach(state: GameState, leaderUnitId: UnitId, bodyguardUnitId: UnitId): boolean
  // every leader unit of the player with the bodyguard units it may join (units without a Leader ability are absent)
  attachOptions(state: GameState, player: PlayerId): { leaderUnitId: UnitId; bodyguardUnitIds: UnitId[] }[]
  // R-4.4 / R-4.5 for the whole attached unit
  isBelowHalfStrength(state: GameState, unitId: UnitId): boolean
  // R-10.1 allocation pool: CHARACTER models of the leader half are excluded while a bodyguard model lives, unless the
  // attack has [PRECISION] and that CHARACTER is in `visibleCharacterIds` (R-6.13 wounded-first is the attack module's)
  allocatableModels(state: GameState, targetUnitId: UnitId, opts?: { precision?: boolean; visibleCharacterIds?: ModelId[] }): ModelId[]
  // R-10.1 / LEAD-008: a "CHARACTER unit destroyed" condition is met only by the CHARACTER's own unit record
  isCharacterUnitDestroyed(state: GameState, unitId: UnitId): boolean
  // any model of either (combined) unit within ER of the other
  unitsInEngagement(state: GameState, a: UnitId, b: UnitId): boolean
  // any (combined) enemy unit on the board within ER
  inEngagementWithEnemy(state: GameState, unitId: UnitId): boolean
  // closest model-to-model distance between two (combined) units, Infinity when either has no board models
  unitDistance(state: GameState, a: UnitId, b: UnitId): number
}
export interface LeaderService extends Partial<LeaderQueries> {}

function boardModels(state: GameState, unitId: UnitId): Model[] {
  const u = state.units[unitId]
  if (!u || u.location !== 'board') return []
  return unitModels(state, unitId)
}

function isGone(u: Unit | undefined): boolean { return !u || u.location === 'destroyed' || u.models.length === 0 }

export const leaderService: LeaderService & LeaderQueries = {
  isAttached: (state, unitId) => !!(state.units[unitId]?.attachedLeaderId || state.units[unitId]?.bodyguardUnitId),
  partnerOf: (state, unitId) => state.units[unitId]?.attachedLeaderId ?? state.units[unitId]?.bodyguardUnitId ?? null,
  combinedModels(state, unitId) {
    const models = unitModels(state, unitId)
    const partner = leaderService.partnerOf(state, unitId)
    if (partner && state.units[partner].location === 'board') models.push(...unitModels(state, partner))
    return models
  },
  toughnessFor(state, targetUnitId) {
    const unit = state.units[targetUnitId]
    const bodyguard = unit.bodyguardUnitId ? state.units[unit.bodyguardUnitId] : unit
    return state.datasheets[bodyguard.datasheetId].stats.T
  },
  startingStrength(state, unitId) {
    const unit = state.units[unitId]
    const partner = leaderService.partnerOf(state, unitId)
    return unit.startingStrength + (partner ? state.units[partner].startingStrength : 0)
  },
  detach(ctx, unitId) {
    const s = ctx.state
    const unit = s.units[unitId]
    const partnerId = leaderService.partnerOf(s, unitId)
    if (!unit || !partnerId) return
    const leaderId = unit.bodyguardUnitId ? unit.id : partnerId
    const bodyguardId = leaderId === unit.id ? partnerId : unit.id
    const leader = s.units[leaderId]
    const bodyguard = s.units[bodyguardId]
    const leaderDead = isGone(leader)
    const bodyguardDead = isGone(bodyguard)
    if (!leaderDead && !bodyguardDead) return
    leader.bodyguardUnitId = null
    bodyguard.attachedLeaderId = null
    if (leaderDead && bodyguardDead) return
    const survivor = leaderDead ? bodyguard : leader
    const dead = leaderDead ? leader : bodyguard
    // R-1.7: persisting effects held by either half keep applying to the surviving unit
    for (const e of dead.effects) if (!survivor.effects.some((x) => x.id === e.id)) survivor.effects.push(structuredClone(e))
    for (const p of Object.values(s.players)) if (p.oathTargetUnitId === dead.id) p.oathTargetUnitId = survivor.id
    ctx.emit({ type: 'LeaderDetached', leaderId, bodyguardId, survivor: survivor.id, player: unit.player })
  },
  halves(state, unitId) {
    const u = state.units[unitId]
    if (!u) return []
    if (u.attachedLeaderId) return [u.id, u.attachedLeaderId]
    if (u.bodyguardUnitId) return [u.bodyguardUnitId, u.id]
    return [u.id]
  },
  canonicalUnitId: (state, unitId) => state.units[unitId]?.bodyguardUnitId ?? unitId,
  sameUnit(state, a, b) {
    if (!a || !b) return false
    return a === b || leaderService.partnerOf(state, a) === b
  },
  canAttach(state, leaderUnitId, bodyguardUnitId) {
    const leader = state.units[leaderUnitId]
    const bodyguard = state.units[bodyguardUnitId]
    if (!leader || !bodyguard || leader.player !== bodyguard.player || leader.id === bodyguard.id) return false
    const lds = datasheetOf(state, leader.id)
    if (!lds.leader || !lds.coreAbilities.some((c) => c.ability === 'LEADER')) return false
    if (!lds.leader.attachTo.includes(bodyguard.datasheetId)) return false
    return !leader.bodyguardUnitId && !bodyguard.attachedLeaderId && !bodyguard.bodyguardUnitId && !leader.attachedLeaderId
  },
  attachOptions(state, player) {
    const out: { leaderUnitId: UnitId; bodyguardUnitIds: UnitId[] }[] = []
    const units = Object.values(state.units).filter((u) => u.player === player)
    for (const leader of units) {
      const lds = datasheetOf(state, leader.id)
      if (!lds.leader) continue
      const bodyguardUnitIds = units.filter((b) => leaderService.canAttach(state, leader.id, b.id)).map((b) => b.id)
      if (bodyguardUnitIds.length > 0) out.push({ leaderUnitId: leader.id, bodyguardUnitIds })
    }
    return out
  },
  isBelowHalfStrength(state, unitId) {
    const halves = leaderService.halves(state, unitId).filter((id) => !isGone(state.units[id]))
    if (halves.length === 0) return false
    const ss = halves.reduce((n, id) => n + state.units[id].startingStrength, 0)
    const models = halves.flatMap((id) => unitModels(state, id))
    if (ss >= 2) return models.length < ss / 2
    const m = models[0]
    return m ? m.woundsRemaining < modelStats(state, m).W / 2 : false
  },
  allocatableModels(state, targetUnitId, opts = {}) {
    const halves = leaderService.halves(state, targetUnitId)
    const all = halves.flatMap((id) => unitModels(state, id))
    const target = state.units[targetUnitId]
    if (halves.length === 1 || !target) return all.map((m) => m.id)
    const bodyguardId = target.attachedLeaderId ? target.id : target.bodyguardUnitId as UnitId
    const bodyguardAlive = state.units[bodyguardId].models.length > 0
    if (!bodyguardAlive) return all.map((m) => m.id)
    const visible = new Set(opts.visibleCharacterIds ?? [])
    return all.filter((m) => {
      if (m.unitId === bodyguardId) return true
      const character = keywordsOf(state, m.unitId).includes('CHARACTER')
      if (!character) return true
      return !!opts.precision && visible.has(m.id)
    }).map((m) => m.id)
  },
  isCharacterUnitDestroyed(state, unitId) {
    const u = state.units[unitId]
    return !!u && u.location === 'destroyed' && keywordsOf(state, unitId).includes('CHARACTER')
  },
  unitsInEngagement(state, a, b) {
    const ma = leaderService.halves(state, a).flatMap((id) => boardModels(state, id))
    const mb = leaderService.halves(state, b).flatMap((id) => boardModels(state, id))
    return ma.length > 0 && mb.length > 0 && unitsWithinEngagementRange(ma, mb)
  },
  inEngagementWithEnemy(state, unitId) {
    const u = state.units[unitId]
    if (!u) return false
    const mine = leaderService.halves(state, unitId).flatMap((id) => boardModels(state, id))
    if (mine.length === 0) return false
    for (const e of Object.values(state.units)) {
      if (e.player === u.player || e.location !== 'board') continue
      for (const em of unitModels(state, e.id)) if (mine.some((m) => withinEngagementRange(m, em))) return true
    }
    return false
  },
  unitDistance(state, a, b) {
    const ma = leaderService.halves(state, a).flatMap((id) => boardModels(state, id))
    const mb = leaderService.halves(state, b).flatMap((id) => boardModels(state, id))
    let best = Infinity
    for (const x of ma) for (const y of mb) best = Math.min(best, distance(x, y))
    return best
  },
}
