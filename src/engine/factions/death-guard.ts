// Death Guard engine rules (docs/spec/factions/death-guard.md §7): the seven (b) code hooks.
// code-hooks.ts registers them through `deathGuardHooks`, a hoisted factory (the module graph is circular:
// hooks-impl <-> code-hooks <-> this file, so nothing here may run at import time).
//
//   nurglesGift            Contagion Range aura gate (-1 Toughness on enemy units in range, DTG-2)
//   walkingPlague          Typhus's default enhancement: command.start pick, D6 Poxwalkers return (DTG-3)
//   grantDeepStrike        Miasmic Arrival marker, read by state.hasDeepStrike (E1)
//   curseOfTheWalkingPox   a Poxwalkers kill returns one destroyed model (DTG-6.4)
//   harbingersOfDespair    stratagem: every enemy in Engagement Range takes a Battle-shock test (DTG-5)
//   contaminateGround      secondary: centre-of-board scoring at turn end (amount via missions.ts customAmount)
//   spreadTheBlight        secondary: kill VP, phase-start snapshot + unitDestroyed fan-out in missions.ts
//
// State: the Spread the Blight snapshot lives in `players[p].secondaryState['dg:blight']`
// ({ round, turn, phase, ids }): the units (canonical id plus both halves) of the opponent within the owner's Contagion
// Range at the start of the phase.
import type { Action } from '../actions'
import type { ScoringRule } from '../../data/types'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distance, signedDistanceToBase } from '../geometry'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { keywordsOf, modelKeywordsOf, modelStats, unitModels } from '../state'
import type { GameState, PendingDecision, PlayerId, Rejection, TimingWindowId, Unit, UnitId } from '../types'
import { findReturnSpot, returnModel } from './necrons'

const EPS = 1e-6
const noop = () => undefined

export const NURGLES_GIFT_CODE = 'nurglesGift'
export const WALKING_PLAGUE_CODE = 'walkingPlague'
export const GRANT_DEEP_STRIKE_CODE = 'grantDeepStrike'
export const CURSE_CODE = 'curseOfTheWalkingPox'
export const BLIGHT_KEY = 'dg:blight'
const DEFAULT_RANGES = [3, 6, 9]

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

function boardUnit(state: GameState, id: string | undefined | null): Unit | null {
  const u = id ? state.units[id] : undefined
  return u && u.location === 'board' && u.models.length > 0 ? u : null
}

function boardHalves(state: GameState, unitId: UnitId): Unit[] {
  return leaderService.halves(state, unitId).map((id) => state.units[id]).filter((u): u is Unit => !!u && u.location === 'board' && u.models.length > 0)
}

function canonicalBoardUnits(state: GameState, player: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.player === player && u.location === 'board' && u.models.length > 0 && !u.bodyguardUnitId)
}

// ability on the datasheet of any half of the unit carrying `code`
function abilityWithCode(state: GameState, unitId: UnitId, code: string): { id: string; params: Record<string, unknown> } | null {
  for (const half of leaderService.halves(state, unitId)) {
    const ds = state.datasheets[state.units[half]?.datasheetId]
    for (const id of ds?.abilities ?? []) {
      const a = state.abilities[id]
      if (a?.code === code) return { id, params: a.params ?? {} }
    }
  }
  return null
}

// ---------- Nurgle's Gift (DTG-2) ----------
// DTG-2.1 / DTG-2.5: 0 when neither half is on the battlefield or no half carries the ability; otherwise the range for the round
export function contagionRange(state: GameState, unitId: UnitId): number {
  if (!state.units[unitId] || boardHalves(state, unitId).length === 0) return 0
  const ability = abilityWithCode(state, unitId, NURGLES_GIFT_CODE)
  if (!ability) return 0
  const ranges = Array.isArray(ability.params.ranges) && ability.params.ranges.length > 0 ? (ability.params.ranges as number[]) : DEFAULT_RANGES
  const idx = Math.min(Math.max(state.round, 1), ranges.length) - 1
  return ranges[idx]
}

// DTG-2.2: the enemy unit (either half) is within the Contagion Range of at least one board unit of `player` that holds the ability
export function withinContagionOf(state: GameState, enemyUnitId: UnitId, player: PlayerId): boolean {
  const enemy = state.units[enemyUnitId]
  if (!enemy || enemy.player === player || boardHalves(state, enemyUnitId).length === 0) return false
  for (const u of canonicalBoardUnits(state, player)) {
    const range = contagionRange(state, u.id)
    if (range <= 0) continue
    if (leaderService.unitDistance(state, enemyUnitId, u.id) <= range + EPS) return true
  }
  return false
}

// ---------- Walking Plague (DTG-3) ----------
function enhancementBearer(s: GameState, player: PlayerId, code: string): { abilityId: string; modelId: string; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== code || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    const unit = model ? s.units[model.unitId] : undefined
    if (unit && unit.player === player && unit.location === 'board' && unit.models.includes(model.id)) return { abilityId: a.id, modelId: model.id, unitId: unit.id }
  }
  return null
}

// own POXWALKERS units on the battlefield with destroyed models, below Starting Strength, within the bearer's Contagion Range
// (measured from the bearer model, so the unit Typhus leads always qualifies)
function walkingPlagueCandidates(s: GameState, bearer: { modelId: string; unitId: UnitId }, player: PlayerId): Unit[] {
  const bearerModel = s.models[bearer.modelId]
  const range = contagionRange(s, bearer.unitId)
  if (!bearerModel || range <= 0) return []
  return canonicalBoardUnits(s, player)
    .filter((u) => keywordsOf(s, u.id).includes('POXWALKERS') && u.destroyedModels.length > 0 && u.models.length < u.startingStrength)
    .filter((u) => boardHalves(s, u.id).flatMap((h) => unitModels(s, h.id)).some((m) => distance(bearerModel, m) <= range + EPS))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

function walkingPlagueOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const player = s.activePlayer
  const mark = `pick:walkingPlague:${s.round}:${player}`
  if (s.phaseState.marks.includes(mark)) return false
  const bearer = enhancementBearer(s, player, WALKING_PLAGUE_CODE)
  if (!bearer) return false
  const candidates = walkingPlagueCandidates(s, bearer, player)
  if (candidates.length === 0) return false
  s.phaseState.marks.push(mark)
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: bearer.unitId, abilityId: bearer.abilityId, data: { window, key, code: WALKING_PLAGUE_CODE } },
    options: [
      ...candidates.map((u) => ({
        id: u.id, label: `Walking Plague: return Poxwalkers to ${u.name}`,
        action: { type: 'chooseOption' as const, player, decisionId: '', optionId: u.id }, hint: { unitId: u.id, priority: 1 },
      })),
      { id: 'decline', label: 'Decline', action: { type: 'chooseOption' as const, player, decisionId: '', optionId: 'decline' } },
    ],
  })
  return true
}

function walkingPlagueHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Walking Plague expects chooseOption')
  if (action.optionId === 'decline') return
  const s = ctx.state
  const player = pending.player
  const bearer = enhancementBearer(s, player, WALKING_PLAGUE_CODE)
  if (!bearer) return notAnOption('Walking Plague: the bearer is no longer on the battlefield')
  const unit = walkingPlagueCandidates(s, bearer, player).find((u) => u.id === action.optionId)
  if (!unit) return { code: 'E_INVALID_TARGET', reason: 'pick a Poxwalkers unit within the bearer\'s Contagion Range that has destroyed models' }
  const dice = ctx.rollExpr('D6', { purpose: 'ability', player, unitId: unit.id })
  let returned = 0
  for (let i = 0; i < dice.total; i++) {
    if (unit.models.length >= unit.startingStrength || unit.destroyedModels.length === 0) break
    const snapshot = unit.destroyedModels[unit.destroyedModels.length - 1]
    const pos = findReturnSpot(s, unit.id, snapshot)
    if (!pos) break // DTG-3: no legal spot, this model and every remaining return are lost
    const model = returnModel(ctx, unit, snapshot, pos, bearer.abilityId)
    model.woundsRemaining = modelStats(s, model).W
    returned++
  }
  ctx.emit({
    type: 'AbilityTriggered', abilityId: bearer.abilityId, sourceUnitId: bearer.unitId, targetUnitId: unit.id,
    summary: `Walking Plague: ${returned} model${returned === 1 ? '' : 's'} return to ${unit.name} (rolled ${dice.total})`, player,
  })
}

// ---------- Curse of the Walking Pox (DTG-6.4) ----------
function curseRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void {
  const s = ctx.state
  const holder = s.units[entry.holderUnitId]
  const byModelId = data.byModelId as string | null | undefined
  const destroyedModelId = data.destroyedModelId as string | null | undefined
  const destroyedUnitId = data.destroyedUnitId as string | undefined
  if (!holder || holder.location !== 'board' || !byModelId || !destroyedModelId || !destroyedUnitId) return
  if (data.kind !== 'ranged' && data.kind !== 'melee') return
  const includeLeader = entry.params.includeLeader !== false
  const own = includeLeader ? leaderService.halves(s, holder.id) : [holder.id]
  if (!own.some((id) => s.units[id]?.models.includes(byModelId))) return
  const destroyedUnit = s.units[destroyedUnitId]
  if (!destroyedUnit || destroyedUnit.player === holder.player) return
  const exclude = (entry.params.excludeKeywords as string[] | undefined) ?? ['MONSTER', 'VEHICLE']
  // the model may already be gone from state.models: fall back to the datasheet's keywords
  let keywords: string[]
  try { keywords = modelKeywordsOf(s, destroyedModelId) } catch { const ds = s.datasheets[destroyedUnit.datasheetId]; keywords = [...(ds?.keywords ?? []), ...(ds?.factionKeywords ?? [])] }
  if (exclude.some((k) => keywords.includes(k))) return
  if (holder.destroyedModels.length === 0 || holder.models.length >= holder.startingStrength) return
  const snapshot = holder.destroyedModels[holder.destroyedModels.length - 1]
  const pos = findReturnSpot(s, holder.id, snapshot)
  if (!pos) return
  const model = returnModel(ctx, holder, snapshot, pos, entry.source.id)
  model.woundsRemaining = modelStats(s, model).W
  ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: destroyedUnitId, summary: 'Curse of the Walking Pox: a destroyed model returns', player: holder.player })
}

// ---------- Harbingers of Despair (DTG-5) ----------
function harbingersApply(ctx: EngineContext, env: StratagemEnv, tuple: StratagemTuple): void {
  const s = ctx.state
  const target = boardUnit(s, tuple.ids[0])
  if (!target) return
  const tested = new Set<UnitId>()
  for (const e of canonicalBoardUnits(s, other(target.player))) {
    if (tested.has(e.id) || !leaderService.unitsInEngagement(s, target.id, e.id)) continue
    tested.add(e.id)
  }
  for (const id of [...tested].sort()) {
    ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: target.id, targetUnitId: id, summary: 'Harbingers of Despair: Battle-shock test', player: env.player })
    hookService.battleShockTest(ctx, id, env.stratagem.id)
  }
}

// ---------- secondaries (DTG-4) ----------
// Contaminate Ground: flat award when a non-Battle-shocked DEATH GUARD unit has a model within `within`" of the centre (0,0)
export function contaminateGroundAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const within = (rule.params?.within as number | undefined) ?? 3
  const keyword = (rule.params?.keyword as string | undefined) ?? 'DEATH GUARD'
  const centre = { x: 0, z: 0 }
  for (const u of canonicalBoardUnits(s, pid)) {
    const halves = boardHalves(s, u.id)
    if (halves.length === 0 || !halves.some((h) => keywordsOf(s, h.id).includes(keyword))) continue
    if (halves.some((h) => h.battleShocked)) continue
    if (halves.flatMap((h) => unitModels(s, h.id)).some((m) => Math.max(0, signedDistanceToBase(centre, m)) <= within + EPS)) return rule.pointsPer
  }
  return 0
}

interface BlightSnapshot { round: number; turn: PlayerId; phase: string; ids: UnitId[] }

// phase-start snapshot for `pid`: every enemy unit (both halves) within a Contagion Range of one of pid's units right now
export function spreadTheBlightSnapshot(s: GameState, pid: PlayerId): void {
  const ids = new Set<UnitId>()
  for (const e of canonicalBoardUnits(s, other(pid))) {
    if (withinContagionOf(s, e.id, pid)) for (const h of leaderService.halves(s, e.id)) ids.add(h)
  }
  const snap: BlightSnapshot = { round: s.round, turn: s.activePlayer, phase: s.phase, ids: [...ids] }
  s.players[pid].secondaryState[BLIGHT_KEY] = snap
}

// points for `pid` when `info.unitId` is destroyed: a DEATH GUARD unit of pid's army gets the credit and the victim was in the snapshot
export function spreadTheBlightGain(
  s: GameState, info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null }, pid: PlayerId, rule: ScoringRule,
): number {
  if (info.byPlayer !== pid || !info.byUnitId || !s.units[info.byUnitId] || s.units[info.byUnitId].player !== pid) return 0
  if (!leaderService.halves(s, info.byUnitId).some((h) => s.units[h] && keywordsOf(s, h).includes('DEATH GUARD'))) return 0
  const snap = s.players[pid].secondaryState[BLIGHT_KEY] as BlightSnapshot | undefined
  if (!snap || snap.round !== s.round || snap.turn !== s.activePlayer || snap.phase !== s.phase) return 0
  return snap.ids.includes(info.unitId) ? rule.pointsPer : 0
}

// ---------- registry ----------
export function deathGuardHooks(): Record<string, EngineCodeHook> {
  const nurglesGift: EngineCodeHook = {
    name: NURGLES_GIFT_CODE, kind: 'ability', hook: 'onStatQuery', run: noop,
    gate(state, holder, _entry, data) {
      if (holder.location !== 'board' || !data || data.stat !== 'T') return false
      const queryUnitId = data.queryUnitId as UnitId | undefined
      const query = queryUnitId ? state.units[queryUnitId] : undefined
      if (!queryUnitId || !query || query.player === holder.player) return false
      const range = contagionRange(state, holder.id)
      return range > 0 && leaderService.unitDistance(state, queryUnitId, holder.id) <= range + EPS
    },
  }

  const walkingPlague: EngineCodeHook = {
    name: WALKING_PLAGUE_CODE, kind: 'ability', hook: 'onCommandPhase', run: noop,
    pick: { window: 'command.start', topic: 'abilityChoice', offer: walkingPlagueOffer, handle: walkingPlagueHandle },
  }

  // marker: state.hasDeepStrike reads the enhancement's `code` directly
  const grantDeepStrike: EngineCodeHook = { name: GRANT_DEEP_STRIKE_CODE, kind: 'ability', hook: 'onDeployment', run: noop, gate: () => false }

  const curseOfTheWalkingPox: EngineCodeHook = {
    name: CURSE_CODE, kind: 'ability', hook: 'onModelDestroyed', run: noop,
    runAt: (ctx, entry, data) => curseRun(ctx, entry, data),
  }

  const harbingersOfDespair: EngineCodeHook = {
    name: 'harbingersOfDespair', kind: 'stratagem', hook: 'onPhaseStart', run: noop,
    apply: (ctx, env, t) => harbingersApply(ctx, env, t),
  }

  const contaminateGround: EngineCodeHook = { name: 'contaminateGround', kind: 'mission', hook: 'onTurnEnd', run: noop }
  const spreadTheBlight: EngineCodeHook = { name: 'spreadTheBlight', kind: 'mission', hook: 'onUnitDestroyed', run: noop }

  return { nurglesGift, walkingPlague, grantDeepStrike, curseOfTheWalkingPox, harbingersOfDespair, contaminateGround, spreadTheBlight }
}
