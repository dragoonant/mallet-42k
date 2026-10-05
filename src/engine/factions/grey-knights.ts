// Grey Knights engine rules (docs/spec/factions/grey-knights.md §7, GRE-x): Teleport Assault pick, Daemonic Fervour,
// Banishment Stone, Champion of Titan and No Escape. code-hooks.ts spreads `greyKnightsHooks`; championOfTitan / noEscape
// are registered there as missionHook(...) and their bodies are called from missions.ts.
// The removal / record store primitives live in ../teleport.ts (engine change E2).
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook } from '../code-hooks'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { deploymentZone, keywordsOf, modelIdFor } from '../state'
import { playerBattlefieldEdge } from '../geometry'
import { grantTeleportFervour, hasTeleportFervour, isTeleporting, removeUnitToReserves, teleportHalves, teleportUnitId } from '../teleport'
import type { GameState, ModelId, PendingDecision, PlayerId, Rejection, UnitId } from '../types'

export const TELEPORT_ASSAULT_CODE = 'teleportAssaultPick'

const noop = () => undefined
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

// ---------- Teleport Assault (GRE-2.1) ----------
function halvesOnBoard(s: GameState, canonical: UnitId): UnitId[] {
  return teleportHalves(s, canonical).filter((id) => s.units[id]?.location === 'board' && s.units[id].models.length > 0)
}

function carriesTeleport(s: GameState, unitId: UnitId): boolean {
  const u = s.units[unitId]
  const ds = u && s.datasheets[u.datasheetId]
  return !!ds && ds.abilities.some((id) => s.abilities[id]?.code === TELEPORT_ASSAULT_CODE)
}

function teleportAbilityId(s: GameState, unitId: UnitId): string | null {
  const ds = s.datasheets[s.units[unitId]?.datasheetId]
  return ds?.abilities.find((id) => s.abilities[id]?.code === TELEPORT_ASSAULT_CODE) ?? null
}

function inEnemyEngagement(s: GameState, canonical: UnitId, player: PlayerId): boolean {
  const seen = new Set<UnitId>()
  for (const e of Object.values(s.units)) {
    if (e.player === player || e.location !== 'board' || e.models.length === 0) continue
    const c = leaderService.canonicalUnitId(s, e.id)
    if (seen.has(c)) continue
    seen.add(c)
    if (leaderService.unitsInEngagement(s, canonical, c)) return true
  }
  return false
}

export function teleportCandidates(state: GameState, player: PlayerId): UnitId[] {
  const out = new Set<UnitId>()
  const checked = new Set<UnitId>()
  for (const u of Object.values(state.units)) {
    if (u.player !== player || u.location !== 'board' || u.models.length === 0) continue
    const canonical = teleportUnitId(state, u.id)
    if (checked.has(canonical)) continue
    checked.add(canonical)
    const halves = halvesOnBoard(state, canonical)
    if (halves.length === 0 || !teleportHalves(state, canonical).every((id) => carriesTeleport(state, id))) continue
    if (!halves.every((id) => keywordsOf(state, id).includes('GREY KNIGHTS'))) continue
    if (isTeleporting(state, canonical)) continue
    if (inEnemyEngagement(state, canonical, player) && !hasTeleportFervour(state, canonical)) continue
    out.add(canonical)
  }
  return [...out].sort()
}

export function teleportOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const player = other(s.activePlayer)
  if (!ctx.once(`teleportAssault:${s.round}:${s.activePlayer}`)) return false
  const candidates = teleportCandidates(s, player)
  if (candidates.length === 0) return false
  const abilityId = teleportAbilityId(s, candidates[0])
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId, data: { window, key, code: TELEPORT_ASSAULT_CODE } },
    options: [
      ...candidates.map((id) => ({
        id, label: `Teleport Assault: ${s.units[id].name}`, action: { type: 'chooseOption', player, decisionId: '', optionId: id } as Action, hint: { priority: 1, unitId: id },
      })),
      { id: 'decline', label: 'Decline', action: { type: 'chooseOption', player, decisionId: '', optionId: 'decline' } as Action },
    ],
  })
  return true
}

export function teleportHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Teleport Assault expects chooseOption' }
  if (action.optionId === 'decline') return
  const s = ctx.state
  if (!teleportCandidates(s, pending.player).includes(action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: 'that unit cannot use Teleport Assault now' }
  const abilityId = pending.context.abilityId ?? teleportAbilityId(s, action.optionId) ?? 'gk.a.teleport-assault'
  removeUnitToReserves(ctx, action.optionId, abilityId)
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: action.optionId, targetUnitId: null, summary: 'Teleport Assault: unit leaves the battlefield', player: pending.player })
}

const teleportAssaultPick: EngineCodeHook = {
  name: TELEPORT_ASSAULT_CODE, kind: 'ability', hook: 'onTurnEnd', run: noop,
  // the descriptor carries no effects of its own
  gate: () => false,
  pick: { window: 'turn.end', topic: 'abilityChoice', offer: (ctx, w, k) => teleportOffer(ctx, w, k), handle: (ctx, a, p) => teleportHandle(ctx, a, p) },
}

// ---------- Daemonic Fervour (GRE-5.3) ----------
const teleportFervour: EngineCodeHook = {
  name: 'teleportFervour', kind: 'stratagem', hook: 'onTurnEnd', run: noop,
  check(env, t) {
    const id = t.ids[0]
    const u = env.state.units[id]
    if (!u || u.location !== 'board') return false
    return leaderService.halves(env.state, id).every((h) => carriesTeleport(env.state, h))
  },
  apply(ctx, _env, t) {
    grantTeleportFervour(ctx.state, teleportUnitId(ctx.state, t.ids[0]))
  },
}

// ---------- Banishment Stone (GRE-3.1) ----------
export function banishmentStoneRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void {
  const s = ctx.state
  const byModelId = data.byModelId as ModelId | null | undefined
  if (!entry.bearerModelId || byModelId !== entry.bearerModelId) return
  const holder = s.units[entry.holderUnitId]
  const destroyed = s.units[data.destroyedUnitId as UnitId]
  if (!holder || !destroyed || destroyed.player === holder.player) return
  if (!s.datasheets[destroyed.datasheetId]?.keywords.includes('CHARACTER')) return
  const total = ctx.rollExpr('D6', { purpose: 'ability', player: holder.player, unitId: holder.id, commandRerollable: false }).total
  ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: destroyed.id, summary: `Banishment Stone: rolled ${total}`, player: holder.player })
  if (total >= 2) hookService.gainCp(ctx, holder.player, 1, entry.source.id)
}

const banishmentStone: EngineCodeHook = {
  name: 'banishmentStone', kind: 'ability', hook: 'onModelDestroyed', run: noop,
  runAt: banishmentStoneRun,
}

// ---------- Champion of Titan (GRE-4.1) ----------
function rulesFor(s: GameState, pid: PlayerId): ScoringRule[] {
  return [...s.mission.scoring, ...(s.mission.secondaries[pid] ?? [])]
}

function awardVp(ctx: EngineContext, pid: PlayerId, amount: number, source: string): void {
  const p = ctx.state.players[pid]
  p.vp += amount
  p.vpBySource[source] = (p.vpBySource[source] ?? 0) + amount
  ctx.emit({ type: 'VpScored', source, amount, total: p.vp, player: pid })
}

export function championOfTitanModelDestroyed(
  ctx: EngineContext,
  info: { unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null },
): void {
  const s = ctx.state
  const pid = info.byPlayer
  if (!pid || !info.byModelId) return
  const rule = rulesFor(s, pid).find((r) => r.rule === 'custom' && r.code === 'championOfTitan' && s.round >= r.rounds.from && s.round <= r.rounds.to)
  if (!rule) return
  if (info.byModelId !== modelIdFor(s.players[pid].warlordUnitId, 0)) return
  const victim = s.units[info.unitId]
  if (!victim || victim.player === pid || !s.datasheets[victim.datasheetId]?.keywords.includes('CHARACTER')) return
  const amount = Math.min(rule.pointsPer, rule.cap - (s.players[pid].vpBySource[rule.id] ?? 0))
  if (amount <= 0) return
  awardVp(ctx, pid, amount, rule.id)
  s.mission.scored.push({ ruleId: rule.id, player: pid, round: s.round, turn: s.activePlayer, amount })
}

// ---------- No Escape (GRE-4.2) ----------
// live controller of a marker (mirrors missions.ts liveController: secured → securer, else live LoC, ties → sticky)
function controllerNow(ctx: EngineContext, id: string): PlayerId | null {
  const s = ctx.state
  const obj = s.objectives[id]
  if (!obj || obj.removed) return null
  if (obj.securedBy) return obj.securedBy
  const svc = ctx.services.objectives
  if (svc.modelsInRange(s, id, 'A').length === 0 && svc.modelsInRange(s, id, 'B').length === 0) return obj.controller
  const levels = svc.levelOfControl(s, id)
  return levels.A > levels.B ? 'A' : levels.B > levels.A ? 'B' : (obj.stickyBy ?? null)
}

function closestMarkerToEdge(s: GameState, player: PlayerId): string | null {
  const edge = playerBattlefieldEdge(s.board, deploymentZone(s, player))
  const hw = s.board.w / 2, hh = s.board.h / 2
  const dist = (p: { x: number; z: number }): number => (edge === 'L' ? p.x + hw : edge === 'R' ? hw - p.x : edge === 'T' ? p.z + hh : hh - p.z)
  let best: { id: string; d: number } | null = null
  for (const o of Object.values(s.objectives).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (o.removed) continue
    const d = dist(o.pos)
    if (!best || d < best.d - 1e-6) best = { id: o.id, d }
  }
  return best ? best.id : null
}

export function noEscapeAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  if ((s.players[pid].vpBySource[rule.id] ?? 0) >= rule.cap) return 0
  const mine = closestMarkerToEdge(s, pid)
  const theirs = closestMarkerToEdge(s, other(pid))
  if (!mine || !theirs) return 0
  return controllerNow(ctx, mine) === pid && controllerNow(ctx, theirs) === pid ? rule.pointsPer : 0
}

export const greyKnightsHooks: Record<string, EngineCodeHook> = {
  teleportAssaultPick, teleportFervour, banishmentStone,
}
