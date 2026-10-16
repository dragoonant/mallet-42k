// Black Templars engine rules (docs/spec/factions/black-templars.md section 7, BLA-x): the (b) code hooks.
// code-hooks.ts registers them through `blackTemplarsHooks`, a hoisted factory (the module graph is circular: hooks-impl <->
// code-hooks <-> this file, so nothing here may run at import time). Mission amounts (Path of Purgation, Sacred Vow) are plain
// functions called from missions.ts.
import type { TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook } from '../code-hooks'
import { partlyWithinPolygon, whollyWithinPolygon } from '../geometry'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { deploymentZone, keywordsOf, modelKeywordsOf, unitModels } from '../state'
import type { ChooseOptionDecision, GameState, ModelId, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined
const otherOf = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

export const RIGHTEOUS_DEFIANCE_ENHANCEMENT = 'bt.e.righteous-defiance'
export const RD_SHOOT_CODE = 'righteousDefiance'
export const RD_FIGHT_CODE = 'righteousDefianceFight'
export const SACRED_VOW_ID = 'bt.sec.sacred-vow'

// ---------- helpers ----------
// the first enhancement ability with `code` whose bearer model is alive on the battlefield for `player`
function enhancementBearer(s: GameState, player: PlayerId, code: string): { abilityId: string; modelId: ModelId; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== code || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    const unit = model ? s.units[model.unitId] : undefined
    if (unit && unit.player === player && unit.location === 'board' && unit.models.includes(model.id)) return { abilityId: a.id, modelId: model.id, unitId: unit.id }
  }
  return null
}

// the units the attacking unit `attackerId` picked as targets: the live attack's declared targets plus the `targeted:<attacker>><target>`
// marks stratagems.ts recordTargets leaves for the phase (same sources as stratagems.ts targetedSet)
function targetedBy(s: GameState, attackerId: UnitId): Set<UnitId> {
  const out = new Set<UnitId>()
  const attack = s.phaseState.attack
  if (attack && leaderService.sameUnit(s, attack.attackerUnitId, attackerId)) for (const t of attack.targetUnitIds) out.add(t)
  for (const m of s.phaseState.marks) {
    if (!m.startsWith('targeted:')) continue
    const [attacker, target] = m.slice('targeted:'.length).split('>')
    if (leaderService.sameUnit(s, attacker, attackerId)) out.add(target)
  }
  return out
}

const anyHalfShocked = (s: GameState, unitId: UnitId): boolean => leaderService.halves(s, unitId).some((h) => s.units[h]?.battleShocked)

function useDeclineOptions(player: PlayerId, useLabel: string): ChooseOptionDecision['options'] {
  return [
    { id: 'use', label: useLabel, action: { type: 'chooseOption', player, decisionId: '', optionId: 'use' }, hint: { priority: 1 } },
    { id: 'decline', label: 'Decline', action: { type: 'chooseOption', player, decisionId: '', optionId: 'decline' } },
  ]
}

// ---------- Righteous Defiance activation (BLA-3.3) ----------
// Offered to the bearer's owner when an enemy unit's declared targets include the bearer's unit, in the Shooting phase
// (`shooting.targetsDeclared`) or the Fight phase (`fight.targetsDeclared`). Overwatch targeting is not offered (simplification).
function rdOffer(ctx: EngineContext, window: TimingWindowId, key: string, code: string): boolean {
  const s = ctx.state
  const attack = s.phaseState.attack
  if (!attack || attack.overwatch) return false
  const attacker = s.units[attack.attackerUnitId]
  if (!attacker) return false
  const player = otherOf(attacker.player)
  const bearer = enhancementBearer(s, player, code)
  if (!bearer) return false
  const bearerCanon = leaderService.canonicalUnitId(s, bearer.unitId)
  const targeted = targetedBy(s, attacker.id)
  if (![...targeted].some((t) => t === bearer.unitId || leaderService.canonicalUnitId(s, t) === bearerCanon)) return false
  if (s.players[player].oncePerBattleUsed.includes(RIGHTEOUS_DEFIANCE_ENHANCEMENT)) return false
  const occurrence = `pick:rd:${attacker.id}`
  if (s.phaseState.marks.includes(occurrence)) return false
  s.phaseState.marks.push(occurrence)
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: bearer.unitId, abilityId: bearer.abilityId, data: { window, key, code } },
    options: useDeclineOptions(player, 'Righteous Defiance: every model in the unit gains Feel No Pain 4+ until the end of the phase (once per battle)'),
  })
  return true
}

function rdHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Righteous Defiance expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return notAnOption('Righteous Defiance: use or decline')
  const s = ctx.state
  const bearerUnit = pending.context.unitId ? s.units[pending.context.unitId] : undefined
  const abilityId = pending.context.abilityId
  if (!bearerUnit || bearerUnit.location !== 'board' || !abilityId) return notAnOption('Righteous Defiance: the bearer is no longer on the battlefield')
  const used = s.players[bearerUnit.player].oncePerBattleUsed
  if (used.includes(RIGHTEOUS_DEFIANCE_ENHANCEMENT)) return { code: 'E_STRATAGEM_USED', reason: 'Righteous Defiance was already used this battle' }
  used.push(RIGHTEOUS_DEFIANCE_ENHANCEMENT)
  const canon = leaderService.canonicalUnitId(s, bearerUnit.id)
  for (const half of leaderService.halves(s, canon)) {
    if (s.units[half]?.location !== 'board') continue
    ctx.services.effects.grant(ctx, half, [{ feelNoPain: 4 }], {
      sourceAbilityId: abilityId, sourceUnitId: bearerUnit.id, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
    })
  }
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: bearerUnit.id, targetUnitId: bearerUnit.id, summary: 'Righteous Defiance: the unit shrugs off wounds on a 4+ this phase', player: bearerUnit.player })
}

// ---------- Path of Purgation (BLA-4.1): scored at the end of the battle only ----------
export function pathOfPurgationAmount(s: GameState, rule: { pointsPer: number; params?: Record<string, unknown> }, pid: PlayerId): number {
  const zone = deploymentZone(s, otherOf(pid))
  const warlord = s.units[s.players[pid].warlordUnitId]
  if (warlord && warlord.location === 'board' && !anyHalfShocked(s, warlord.id)) {
    const models = unitModels(s, warlord.id)
    const model = models.find((m) => modelKeywordsOf(s, m.id).includes('CHARACTER')) ?? models[0]
    if (model && whollyWithinPolygon(model, zone)) return (rule.params?.warlordPoints as number | undefined) ?? 10
  }
  const keyword = (rule.params?.keyword as string | undefined) ?? 'ADEPTUS ASTARTES'
  for (const u of Object.values(s.units)) {
    if (u.player !== pid || u.location !== 'board' || u.bodyguardUnitId || u.models.length === 0) continue
    const halves = leaderService.halves(s, u.id).filter((h) => s.units[h]?.location === 'board')
    if (!halves.some((h) => keywordsOf(s, h).includes(keyword))) continue
    if (halves.some((h) => s.units[h].battleShocked)) continue
    if (halves.some((h) => unitModels(s, h).some((m) => partlyWithinPolygon(m, zone)))) return rule.pointsPer
  }
  return 0
}

// ---------- Sacred Vow (BLA-4.2 - 4.5) ----------
interface SacredVow { halves: UnitId[]; round: number; kill: { melee: boolean; astartes: boolean; crusader: boolean } | null }

export function sacredVowOffer(ctx: EngineContext, pid: PlayerId, window: TimingWindowId, key: string): void {
  const s = ctx.state
  const seen = new Set<UnitId>()
  const candidates: Unit[] = []
  for (const u of Object.values(s.units)) {
    if (u.player === pid || u.location === 'destroyed') continue
    const canonical = leaderService.canonicalUnitId(s, u.id)
    if (seen.has(canonical)) continue
    seen.add(canonical)
    candidates.push(s.units[canonical])
  }
  if (candidates.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: pid, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: SACRED_VOW_ID, data: { window, key, code: 'sacredVowPick' } },
    options: candidates.map((u) => ({
      id: u.id, label: u.name, action: { type: 'chooseOption' as const, player: pid, decisionId: '', optionId: u.id }, hint: { unitId: u.id },
    })),
  })
}

function answerSacredVow(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Sacred Vow expects chooseOption')
  const s = ctx.state
  const unit = s.units[action.optionId]
  if (!unit || unit.player === pending.player || unit.location === 'destroyed') return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit that is not destroyed' }
  const vow: SacredVow = { halves: leaderService.halves(s, leaderService.canonicalUnitId(s, unit.id)), round: s.round, kill: null }
  s.players[pending.player].secondaryState.sacredVow = vow
  ctx.emit({ type: 'AbilityTriggered', abilityId: SACRED_VOW_ID, sourceUnitId: null, targetUnitId: unit.id, summary: `Sacred Vow: ${unit.name} is the vow target`, player: pending.player })
  // the mission window that raised this pick resumes here (the shared abilityChoice handler does not know about it)
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// called from missions.ts unitDestroyedHook: records how the vow target died (read and cleared by sacredVowAmount at round end)
export function sacredVowDestroyed(
  ctx: EngineContext,
  info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: string | null; kind?: string },
): void {
  const s = ctx.state
  for (const pid of ['A', 'B'] as PlayerId[]) {
    const vow = s.players[pid].secondaryState.sacredVow as SacredVow | undefined
    if (!vow || vow.round !== s.round || vow.kill !== null || !vow.halves.includes(info.unitId)) continue
    if (!vow.halves.every((h) => s.units[h]?.location === 'destroyed')) continue
    const attack = s.phaseState.attack
    const melee = info.kind === 'melee'
      || (info.kind === 'mortal' && attack?.kind === 'melee' && info.byUnitId !== null && leaderService.sameUnit(s, info.byUnitId, attack.attackerUnitId))
    const kws = info.byModelId && s.models[info.byModelId] ? modelKeywordsOf(s, info.byModelId) : info.byUnitId && s.units[info.byUnitId] ? keywordsOf(s, info.byUnitId) : []
    vow.kill = { melee: melee && info.byPlayer === pid, astartes: kws.includes('ADEPTUS ASTARTES'), crusader: kws.includes('PRIMARIS CRUSADER SQUAD') }
  }
}

export function sacredVowAmount(s: GameState, rule: { pointsPer: number; params?: Record<string, unknown> }, pid: PlayerId): number {
  const p = s.players[pid]
  const vow = p.secondaryState.sacredVow as SacredVow | undefined
  p.secondaryState.sacredVow = undefined
  if (!vow || vow.round !== s.round || !vow.kill || !vow.kill.melee || !vow.kill.astartes) return 0
  return vow.kill.crusader ? ((rule.params?.crusaderPoints as number | undefined) ?? 4) : rule.pointsPer
}

// ---------- hook registry ----------
export function blackTemplarsHooks(): Record<string, EngineCodeHook> {
  const righteousDefiance: EngineCodeHook = {
    name: RD_SHOOT_CODE, kind: 'ability', hook: 'onTargetsDeclared', run: noop,
    pick: { window: 'shooting.targetsDeclared', topic: 'abilityChoice', offer: (ctx, w, k) => rdOffer(ctx, w, k, RD_SHOOT_CODE), handle: rdHandle },
  }
  const righteousDefianceFight: EngineCodeHook = {
    name: RD_FIGHT_CODE, kind: 'ability', hook: 'onTargetsDeclared', run: noop,
    pick: { window: 'fight.targetsDeclared', topic: 'abilityChoice', offer: (ctx, w, k) => rdOffer(ctx, w, k, RD_FIGHT_CODE), handle: rdHandle },
  }
  // marker: behaviour lives in transports.ts (allowsDisembarkAfterAdvance reads the datasheet's ability code)
  const assaultVehicle: EngineCodeHook = { name: 'assaultVehicle', kind: 'ability', hook: 'onPhaseStart', run: noop }
  // secondaries: scored in missions.ts (custom amounts); the registry only proves the names exist
  const pathOfPurgation: EngineCodeHook = { name: 'pathOfPurgation', kind: 'mission', hook: 'onPhaseEnd', run: noop }
  const sacredVowPick: EngineCodeHook = { name: 'sacredVowPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerSacredVow }
  const sacredVowScore: EngineCodeHook = { name: 'sacredVowScore', kind: 'mission', hook: 'onPhaseEnd', run: noop }
  return { righteousDefiance, righteousDefianceFight, assaultVehicle, pathOfPurgation, sacredVowPick, sacredVowScore }
}
