// Chaos Daemons: The Shadow of Chaos (docs/spec/factions/chaos-daemons.md section 2 and 7.1 E1/E2, DMN-2.x).
// Each player whose army has the ability keeps a per-phase record of which areas of the battlefield are inside their
// Shadow in `players[p].secondaryState.shadowOfChaos`. The record is taken at the start of every battle phase (before that
// phase's start window) and is stale (ignored) as soon as the round, turn or phase differs, so it never needs clearing.
// Non-Daemon games write nothing here. The code hooks `shadowOfChaos` / `warpLocus` in factions/chaos-daemons.ts only name
// the abilities; this file does the work (areas, Battle-shock modifiers, Manifestation heal / return, Terror mortal wounds).
import type { Polygon } from '../data/types'
import { partlyWithinPolygon, pointInPolygon, signedDistanceToBase, whollyWithinPolygon, within, type Footprint } from './geometry'
import { findReturnSpot, returnModel } from './factions/necrons'
import { leaderService } from './leaders'
import type { EngineContext } from './modules'
import { modelStats, unitModels } from './state'
import type { GameState, Model, ModelId, Objective, Phase, PlayerId, Unit, UnitId } from './types'

export const SHADOW_CODE = 'shadowOfChaos'
export const WARP_LOCUS_CODE = 'warpLocus'
export const SHADOW_KEY = 'shadowOfChaos'
export interface ShadowRecord { round: number; turn: PlayerId; phase: Phase; noMansLand: boolean; enemyZone: boolean }

const SHADOW_ABILITY_ID = 'cdm.a.shadow-of-chaos'
const DEFAULT_LOCUS_RANGE = 3

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

// true when any of the player's units (any location) has an ability whose code is SHADOW_CODE
export function hasShadowOfChaos(state: GameState, player: PlayerId): boolean {
  for (const u of Object.values(state.units)) {
    if (u.player !== player) continue
    const ds = state.datasheets[u.datasheetId]
    if (ds && ds.abilities.some((id) => state.abilities[id]?.code === SHADOW_CODE)) return true
  }
  return false
}

// the deployment zone polygon, or null before sides are chosen
function zoneOf(state: GameState, player: PlayerId): Polygon | null {
  const side = state.players[player]?.side
  if (!side) return null
  return side === 'attacker' ? state.mission.data.deploymentZones.A : state.mission.data.deploymentZones.B
}

const liveObjectives = (state: GameState): Objective[] => Object.values(state.objectives).filter((o) => !o.removed)

// DMN-2.5 b: non-removed objectives whose centre lies in neither deployment zone
export function noMansLandObjectives(state: GameState): Objective[] {
  const zones = (['A', 'B'] as PlayerId[]).map((p) => zoneOf(state, p)).filter((z): z is Polygon => !!z)
  return liveObjectives(state).filter((o) => !zones.some((z) => pointInPolygon(o.pos, z)))
}

// DMN-2.5 b: non-removed objectives whose centre lies in the zone owner's deployment zone
export function zoneObjectives(state: GameState, zoneOwner: PlayerId): Objective[] {
  const z = zoneOf(state, zoneOwner)
  return z ? liveObjectives(state).filter((o) => pointInPolygon(o.pos, z)) : []
}

// controls at least half of the markers, and there is at least one marker
function controlsHalf(markers: Objective[], player: PlayerId): boolean {
  return markers.length > 0 && markers.filter((o) => o.controller === player).length * 2 >= markers.length
}

function currentRecord(state: GameState, player: PlayerId): ShadowRecord | null {
  const r = state.players[player]?.secondaryState[SHADOW_KEY] as ShadowRecord | undefined
  if (!r || r.round !== state.round || r.turn !== state.activePlayer || r.phase !== state.phase) return null
  return r
}

// the player's flags as of now (stale or unset -> false / false)
export function shadowFlags(state: GameState, player: PlayerId): { noMansLand: boolean; enemyZone: boolean } {
  const r = currentRecord(state, player)
  return { noMansLand: !!r?.noMansLand, enemyZone: !!r?.enemyZone }
}

// DMN-2.5 c: runs at the start of every battle phase of both turns. Writes a fresh record for each player with the ability and
// announces it only when a flag differs from that player's previous record.
export function refreshShadow(ctx: EngineContext): void {
  const s = ctx.state
  for (const player of ['A', 'B'] as PlayerId[]) {
    if (!hasShadowOfChaos(s, player)) continue
    const prevRaw = s.players[player].secondaryState[SHADOW_KEY] as ShadowRecord | undefined
    const noMansLand = controlsHalf(noMansLandObjectives(s), player)
    const enemyZone = controlsHalf(zoneObjectives(s, other(player)), player)
    s.players[player].secondaryState[SHADOW_KEY] = { round: s.round, turn: s.activePlayer, phase: s.phase, noMansLand, enemyZone } satisfies ShadowRecord
    if (!!prevRaw?.noMansLand !== noMansLand || !!prevRaw?.enemyZone !== enemyZone) {
      ctx.emit({
        type: 'AbilityTriggered', abilityId: SHADOW_ABILITY_ID, sourceUnitId: null, targetUnitId: null, player,
        summary: `Shadow of Chaos: No Man's Land ${noMansLand ? 'inside' : 'outside'}, enemy deployment zone ${enemyZone ? 'inside' : 'outside'}`,
      })
    }
  }
}

// on-board models carrying an enhancement whose code is WARP_LOCUS_CODE, with its params.range (default 3)
export function warpLocusBearers(state: GameState, player: PlayerId): { modelId: ModelId; range: number }[] {
  const out: { modelId: ModelId; range: number }[] = []
  for (const a of Object.values(state.abilities)) {
    if (a.source !== 'enhancement' || a.code !== WARP_LOCUS_CODE || !a.bearerModelId) continue
    const m = state.models[a.bearerModelId]
    const unit = m ? state.units[m.unitId] : undefined
    if (!m || !unit || unit.player !== player || unit.location !== 'board' || m.woundsRemaining <= 0 || m.removalDeferred) continue
    const range = typeof a.params?.range === 'number' ? a.params.range : DEFAULT_LOCUS_RANGE
    out.push({ modelId: m.id, range })
  }
  return out
}

function modelFootprintInShadow(state: GameState, player: PlayerId, fp: Footprint): boolean {
  const own = zoneOf(state, player)
  if (own && partlyWithinPolygon(fp, own)) return true
  const flags = shadowFlags(state, player)
  if (flags.noMansLand) {
    const za = zoneOf(state, 'A'), zb = zoneOf(state, 'B')
    // No Man's Land: the base is not wholly within either deployment zone
    if (!((za && whollyWithinPolygon(fp, za)) || (zb && whollyWithinPolygon(fp, zb)))) return true
  }
  if (flags.enemyZone) {
    const enemy = zoneOf(state, other(player))
    if (enemy && partlyWithinPolygon(fp, enemy)) return true
  }
  for (const b of warpLocusBearers(state, player)) {
    const bm = state.models[b.modelId]
    if (bm && within(fp, bm, b.range)) return true
  }
  return false
}

// DMN-2.5 a: one model (must be a living model of a unit on the board)
export function modelInShadow(state: GameState, player: PlayerId, modelId: ModelId): boolean {
  const m = state.models[modelId]
  const unit = m ? state.units[m.unitId] : undefined
  if (!m || !unit || unit.location !== 'board' || m.woundsRemaining <= 0 || m.removalDeferred) return false
  return modelFootprintInShadow(state, player, m)
}

// DMN-2.5 a: any living on-board model of any half (leaderService.halves) in the player's Shadow
export function unitInShadow(state: GameState, player: PlayerId, unitId: UnitId): boolean {
  for (const id of leaderService.halves(state, unitId)) {
    const half = state.units[id]
    if (!half || half.location !== 'board') continue
    if (unitModels(state, id).some((m) => m.woundsRemaining > 0 && modelFootprintInShadow(state, player, m))) return true
  }
  return false
}

// DMN-4.2: centre in own zone, or in No Man's Land and noMansLand, or in the enemy zone and enemyZone, or within range of a
// Warp Locus bearer (measured from the bearer's base edge to the marker centre)
export function objectiveInShadow(state: GameState, player: PlayerId, obj: Objective): boolean {
  const own = zoneOf(state, player)
  if (own && pointInPolygon(obj.pos, own)) return true
  const enemy = zoneOf(state, other(player))
  const inEnemy = !!enemy && pointInPolygon(obj.pos, enemy)
  const flags = shadowFlags(state, player)
  if (inEnemy) {
    if (flags.enemyZone) return true
  } else if (flags.noMansLand) return true
  for (const b of warpLocusBearers(state, player)) {
    const bm = state.models[b.modelId]
    if (bm && Math.max(0, signedDistanceToBase(obj.pos, bm)) <= b.range + 1e-6) return true
  }
  return false
}

// DMN-2.2 / 2.3: +1 for the owner's Shadow, -1 for an enemy Shadow the unit stands in (a mirror match nets 0)
export function shadowBattleShockModifiers(state: GameState, unitId: UnitId): { source: string; value: number }[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const out: { source: string; value: number }[] = []
  const owner = unit.player
  if (hasShadowOfChaos(state, owner) && unitInShadow(state, owner, unitId)) out.push({ source: SHADOW_ABILITY_ID, value: 1 })
  const enemy = other(owner)
  if (hasShadowOfChaos(state, enemy) && unitInShadow(state, enemy, unitId)) out.push({ source: SHADOW_ABILITY_ID, value: -1 })
  return out
}

// ---------------- after-effects ----------------

const boardHalves = (state: GameState, unitId: UnitId): Unit[] =>
  leaderService.halves(state, unitId).map((id) => state.units[id]).filter((u): u is Unit => !!u && u.location === 'board')

const isCharacter = (state: GameState, m: Model): boolean => state.datasheets[state.units[m.unitId].datasheetId].keywords.includes('CHARACTER')

// DMN-2.5 d: the BATTLELINE half that can still take models back, or null
function returnableHalf(state: GameState, halves: Unit[]): Unit | null {
  for (const h of halves) {
    const ds = state.datasheets[h.datasheetId]
    if (!ds?.keywords.includes('BATTLELINE')) continue
    if ((h.destroyedModels ?? []).length > 0 && h.models.length < h.startingStrength) return h
  }
  return null
}

// DMN-2.5 d: the living model that has lost the most wounds (CHARACTER first on ties, then list order), or null
function mostWounded(state: GameState, halves: Unit[]): Model | null {
  const all = halves.flatMap((h) => unitModels(state, h.id))
  const wounded = all
    .map((m, index) => ({ m, index, lost: modelStats(state, m).W - m.woundsRemaining, character: isCharacter(state, m) ? 0 : 1 }))
    .filter((x) => x.m.woundsRemaining > 0 && x.lost > 0)
    .sort((a, b) => b.lost - a.lost || a.character - b.character || a.index - b.index)
  return wounded.length > 0 ? wounded[0].m : null
}

function manifest(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const owner = s.units[unitId].player
  const halves = boardHalves(s, unitId)
  const back = returnableHalf(s, halves)
  const hurt = back ? null : mostWounded(s, halves)
  if (!back && !hurt) return // nothing to heal and nothing to return: no roll
  const n = ctx.rollExpr('D3', { purpose: 'ability', player: owner, unitId }).total
  if (back) {
    let returned = 0
    for (let i = 0; i < n; i++) {
      if (back.models.length >= back.startingStrength) break
      const snapshot = [...(back.destroyedModels ?? [])].reverse()[0]
      if (!snapshot) break
      const pos = findReturnSpot(s, unitId, snapshot)
      if (!pos) break
      const m = returnModel(ctx, back, snapshot, pos, SHADOW_ABILITY_ID)
      m.woundsRemaining = Math.max(1, modelStats(s, m).W) // a returning daemon comes back at full strength
      returned++
    }
    ctx.emit({ type: 'AbilityTriggered', abilityId: SHADOW_ABILITY_ID, sourceUnitId: unitId, targetUnitId: unitId, player: owner, summary: `Daemonic Manifestation: D3 = ${n}, ${returned} model${returned === 1 ? '' : 's'} returned` })
    return
  }
  const m = hurt as Model
  const amount = Math.min(n, modelStats(s, m).W - m.woundsRemaining)
  m.woundsRemaining += amount
  ctx.emit({ type: 'WoundsRegained', unitId: m.unitId, modelId: m.id, amount, source: SHADOW_ABILITY_ID, player: owner })
  ctx.emit({ type: 'AbilityTriggered', abilityId: SHADOW_ABILITY_ID, sourceUnitId: unitId, targetUnitId: unitId, player: owner, summary: `Daemonic Manifestation: D3 = ${n}, ${amount} wound${amount === 1 ? '' : 's'} regained` })
}

function terror(ctx: EngineContext, unitId: UnitId, daemonPlayer: PlayerId): void {
  const s = ctx.state
  const n = ctx.rollExpr('D3', { purpose: 'ability', player: daemonPlayer, unitId }).total
  ctx.emit({ type: 'AbilityTriggered', abilityId: SHADOW_ABILITY_ID, sourceUnitId: null, targetUnitId: unitId, player: daemonPlayer, summary: `Daemonic Terror: D3 = ${n} mortal wound${n === 1 ? '' : 's'}` })
  if (n <= 0) return
  // DMN-2.5 f: not an attack, so no kill credit. Resolve at once when nothing else is in flight; if allocation needs a
  // decision the Command phase keeps driving services.attack.advance while phaseState.attack is set.
  ctx.services.attack.queueMortalWounds(ctx, leaderService.canonicalUnitId(s, unitId), n, SHADOW_ABILITY_ID, false)
  if (!s.pending && s.phaseState.attack) ctx.services.attack.advance(ctx)
}

// reducer emit listener for BattleShockTested (both outcomes); reads the unit's position at test time
export function onShadowBattleShock(ctx: EngineContext, e: { unitId: UnitId; passed: boolean }): void {
  const s = ctx.state
  const unit = s.units[e.unitId]
  if (!unit || unit.location !== 'board') return
  const owner = unit.player
  if (e.passed) {
    if (hasShadowOfChaos(s, owner) && unitInShadow(s, owner, e.unitId)) manifest(ctx, e.unitId)
    return
  }
  const enemy = other(owner)
  if (hasShadowOfChaos(s, enemy) && unitInShadow(s, enemy, e.unitId)) terror(ctx, e.unitId, enemy)
}
