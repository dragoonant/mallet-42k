// Space Marines code hooks for the Strike Team Solarien patrol (docs/spec/factions/space-marines--strike-team-solarien.md section 7, SOL-xxx).
// Auto-choral Resonators, Stealthy Hunter, Strategic Dispersal, Shrouding, Omni-scramblers, Suppression Fire, Rapid Repositioning and the two
// secondaries (Reconnaissance in Force, Pinpoint Purge; their scoring amounts are called from missions.ts). Registered in code-hooks.ts.
//
// Like the other faction files this one never reads another engine module at load time except movement (startReactiveMove, used lazily):
// code-hooks.ts pulls it in, so anything that runs at module evaluation would make load order matter.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { unitWithinObjectiveRange } from '../code-hooks'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import type { ChooseOptionDecision, GameState, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined
const EPS = 1e-6

export const STRATEGIC_DISPERSAL_CODE = 'strategicDispersal'
export const SUPPRESSION_FIRE_CODE = 'suppressionFire'

// ---------- helpers ----------
function otherOf(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

function boardHalves(s: GameState, unitId: UnitId): Unit[] {
  return leaderService.halves(s, unitId).map((id) => s.units[id]).filter((u): u is Unit => !!u && u.location === 'board' && u.models.length > 0)
}

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

// the first half of the canonical unit that carries an ability with this code
function halfWithAbility(s: GameState, canonical: UnitId, code: string): { unit: Unit; abilityId: string } | null {
  for (const h of boardHalves(s, canonical)) {
    const abilityId = abilityIdWithCode(s, h, code)
    if (abilityId) return { unit: h, abilityId }
  }
  return null
}

function useDeclineOptions(player: PlayerId, useLabel: string): ChooseOptionDecision['options'] {
  return [
    { id: 'use', label: useLabel, action: { type: 'chooseOption', player, decisionId: '', optionId: 'use' }, hint: { priority: 1 } },
    { id: 'decline', label: 'Decline', action: { type: 'chooseOption', player, decisionId: '', optionId: 'decline' } },
  ]
}

const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

// phase mark `hitBy:<attacker>:<weaponId>:<target>` (attack.ts C3), read directly to avoid importing attack.ts (import cycle)
function unitsHitByWeapon(s: GameState, attackerUnitId: UnitId, weaponDataId: string): UnitId[] {
  const prefix = `hitBy:${leaderService.canonicalUnitId(s, attackerUnitId)}:`
  const out: UnitId[] = []
  for (const m of s.phaseState.marks) {
    if (!m.startsWith(prefix)) continue
    const rest = m.slice(prefix.length)
    const cut = rest.indexOf(':')
    if (cut < 0) continue
    const wid = rest.slice(0, cut)
    const w = s.weapons[wid]
    const hit = wid === weaponDataId || w?.profileGroup === weaponDataId || wid.replace('.w.', '.') === weaponDataId
    const t = rest.slice(cut + 1) as UnitId
    if (hit && !out.includes(t)) out.push(t)
  }
  return out
}

// ---------- Auto-choral Resonators (SOL-3.1) ----------
// End of the owner's Command phase: every marker the owner controls that the bearer's unit (attached unit included) is in range of
// becomes sticky for the owner (same flag Duty and Honour sets; objectives.ts clears it when the opponent has the higher Level of Control).
const autoChoralResonators: EngineCodeHook = {
  name: 'autoChoralResonators', kind: 'ability', hook: 'onPhaseEnd', run: noop,
  runAt(ctx, entry) {
    const s = ctx.state
    const bearerModel = entry.bearerModelId ? s.models[entry.bearerModelId] : undefined
    const unit = s.units[bearerModel?.unitId ?? entry.holderUnitId]
    if (!unit || unit.location !== 'board' || s.phase !== 'command' || s.activePlayer !== unit.player) return
    const canon = leaderService.canonicalUnitId(s, unit.id)
    for (const obj of Object.values(s.objectives)) {
      if (obj.removed || obj.controller !== unit.player || obj.stickyBy === unit.player) continue
      if (!unitWithinObjectiveRange(s, canon, obj)) continue
      obj.stickyBy = unit.player
      ctx.emit({ type: 'ObjectiveSecured', objectiveId: obj.id, by: unit.player, flag: 'sticky', player: unit.player })
    }
  },
}

// ---------- Stealthy Hunter (SOL-3.2) ----------
// The weapon abilities are declarative; this hook grants the bearer's own unit Lone Operative and Stealth. Lone Operative is dropped by the
// shooting module while attached; Stealth needs every model of the target (both halves) to have it.
const stealthyHunter: EngineCodeHook = {
  name: 'stealthyHunter', kind: 'ability', hook: 'onStatQuery', run: noop,
  grantsCoreAbility(state, entry, unitId) {
    const bearer = entry.bearerModelId ? state.models[entry.bearerModelId] : undefined
    return bearer && bearer.unitId === unitId ? ['LONE_OPERATIVE', 'STEALTH'] : []
  },
}

// ---------- Shrouding (SOL-6.2) ----------
function shroudingActive(state: GameState, holderUnitId: UnitId, unitId: UnitId): boolean {
  const holder = state.units[holderUnitId]
  if (!holder || holder.location !== 'board' || !leaderService.isAttached(state, holder.id)) return false
  return leaderService.halves(state, holder.id).includes(unitId)
}

const shrouding: EngineCodeHook = {
  name: 'shrouding', kind: 'ability', hook: 'onStatQuery', run: noop,
  grantsCoreAbility(state, entry, unitId) {
    return shroudingActive(state, entry.holderUnitId, unitId) ? ['STEALTH'] : []
  },
  targetRangeCap(state, entry, targetUnitId) {
    return shroudingActive(state, entry.holderUnitId, targetUnitId) ? 12 : null
  },
}

// ---------- Omni-scramblers (SOL-6.3) ----------
const omniScramblers: EngineCodeHook = {
  name: 'omniScramblers', kind: 'ability', hook: 'onDeployment', run: noop,
  reserveExclusion(state, entry, arrivingPlayer) {
    const holder = state.units[entry.holderUnitId]
    if (!holder || holder.location !== 'board' || holder.player === arrivingPlayer) return null
    const unitIds = boardHalves(state, holder.id).map((u) => u.id)
    if (unitIds.length === 0) return null
    return { unitIds, distance: (entry.params.range as number | undefined) ?? 12 }
  },
}

// ---------- Strategic Dispersal (SOL-6.1) ----------
function dispersalOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (s.phase !== 'shooting') return false
  const unit = s.units[key]
  if (!unit || unit.location !== 'board') return false
  const canon = leaderService.canonicalUnitId(s, unit.id)
  const canonUnit = s.units[canon]
  if (!canonUnit || canonUnit.player !== s.activePlayer) return false
  const holder = halfWithAbility(s, canon, STRATEGIC_DISPERSAL_CODE)
  if (!holder) return false
  const mark = `pick:dispersal:${canon}`
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  if (leaderService.halves(s, canon).some((h) => s.units[h]?.location === 'board' && leaderService.inEngagementWithEnemy(s, h))) return false
  const player = canonUnit.player
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: canon, abilityId: holder.abilityId, data: { window, key, code: STRATEGIC_DISPERSAL_CODE } },
    options: useDeclineOptions(player, 'Strategic Dispersal: Normal move of up to D6"'),
  })
  return true
}

function dispersalHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Strategic Dispersal expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return notAnOption('Strategic Dispersal: use or decline')
  const s = ctx.state
  const canon = pending.context.unitId as UnitId
  const unit = s.units[canon]
  const abilityId = pending.context.abilityId
  if (!unit || unit.location !== 'board' || !abilityId) return notAnOption('Strategic Dispersal: the unit is no longer on the battlefield')
  if (leaderService.halves(s, canon).some((h) => s.units[h]?.location === 'board' && leaderService.inEngagementWithEnemy(s, h))) {
    return { code: 'E_ENGAGEMENT', reason: 'Strategic Dispersal cannot be used while within Engagement Range of an enemy unit' }
  }
  const roll = ctx.roll({ purpose: 'ability', player: unit.player, sides: 6, count: 1, mode: 'sum', unitId: canon, commandRerollable: false })
  const distance = roll.final.reduce((a, b) => a + b, 0)
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: canon, targetUnitId: null, summary: `Strategic Dispersal: ${unit.name} moves up to ${distance}"`, player: unit.player })
  startReactiveMove(ctx, canon, distance, abilityId, 'shooting.attacksResolved')
}

const strategicDispersal: EngineCodeHook = {
  name: 'strategicDispersal', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
  pick: { window: 'shooting.attacksResolved', topic: 'abilityChoice', offer: dispersalOffer, handle: dispersalHandle },
}

// ---------- Suppression Fire (SOL-6.4) ----------
function suppressionCandidates(s: GameState, canon: UnitId, weaponId: string): UnitId[] {
  return unitsHitByWeapon(s, canon, weaponId).filter((id) => leaderService.halves(s, id).some((h) => s.units[h]?.location === 'board'))
}

function suppressionWeapon(s: GameState, abilityId: string): string {
  return (s.abilities[abilityId]?.params?.weaponId as string | undefined) ?? 'sm.w.accelerator-autocannon'
}

function applySuppression(ctx: EngineContext, source: Unit, abilityId: string, targetId: UnitId): void {
  const s = ctx.state
  for (const half of boardHalves(s, targetId)) {
    const active = ctx.services.effects.grant(ctx, half.id, [{ modifyRoll: { roll: 'hit', value: -1 } }], {
      sourceAbilityId: abilityId, sourceUnitId: source.id, scope: { who: 'self' }, duration: 'untilNextTurn', when: null,
    })
    // lasts through the opponent's next turn: until the start of the Suppressor player's next turn
    active.expires = { kind: 'nextOwnTurn', round: s.round, player: source.player }
  }
  const target = s.units[targetId]
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: source.id, targetUnitId: targetId, summary: `Suppression Fire: ${target?.name ?? targetId} is suppressed (-1 to Hit)`, player: source.player })
}

function suppressionOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (s.phase !== 'shooting') return false
  const unit = s.units[key]
  if (!unit || unit.location !== 'board') return false
  const canon = leaderService.canonicalUnitId(s, unit.id)
  const canonUnit = s.units[canon]
  if (!canonUnit || canonUnit.player !== s.activePlayer) return false
  const holder = halfWithAbility(s, canon, SUPPRESSION_FIRE_CODE)
  if (!holder) return false
  const mark = `pick:suppress:${canon}`
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  const candidates = suppressionCandidates(s, canon, suppressionWeapon(s, holder.abilityId))
  if (candidates.length === 0) return false
  if (candidates.length === 1) { applySuppression(ctx, holder.unit, holder.abilityId, candidates[0]); return false }
  const player = canonUnit.player
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: canon, abilityId: holder.abilityId, data: { window, key, code: SUPPRESSION_FIRE_CODE } },
    options: candidates.map((id) => ({ id, label: `Suppress ${s.units[id].name}`, action: { type: 'chooseOption' as const, player, decisionId: '', optionId: id }, hint: { unitId: id } })),
  })
  return true
}

function suppressionHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Suppression Fire expects chooseOption')
  const s = ctx.state
  const canon = pending.context.unitId as UnitId
  const abilityId = pending.context.abilityId
  const holder = canon ? halfWithAbility(s, canon, SUPPRESSION_FIRE_CODE) : null
  if (!holder || !abilityId) return notAnOption('Suppression Fire: the unit is no longer on the battlefield')
  if (!suppressionCandidates(s, canon, suppressionWeapon(s, abilityId)).includes(action.optionId)) {
    return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit hit by an accelerator autocannon this phase' }
  }
  applySuppression(ctx, holder.unit, abilityId, action.optionId)
}

const suppressionFire: EngineCodeHook = {
  name: 'suppressionFire', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
  // the granted effect is dormant once the source Suppressor unit has left the battlefield
  gateActive(state, entry) {
    const src = entry.active?.sourceUnitId ? state.units[entry.active.sourceUnitId] : undefined
    return !!src && src.location === 'board'
  },
  pick: { window: 'shooting.attacksResolved', topic: 'abilityChoice', offer: suppressionOffer, handle: suppressionHandle },
}

// ---------- Rapid Repositioning (SOL-5.3) ----------
const SM_MOVE_TYPES = ['normal', 'advance', 'fallBack']

export function smRapidRepositioningCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const s = env.state
  const moverId = env.trigger.unitId
  const mover = moverId ? s.units[moverId] : undefined
  const target = s.units[t.ids[0]]
  if (!mover || !target || mover.location !== 'board' || target.location !== 'board' || mover.player === env.player || target.player !== env.player) return false
  if (!leaderService.halves(s, mover.id).some((id) => SM_MOVE_TYPES.includes(s.units[id].turn.moveType ?? ''))) return false
  if (leaderService.unitDistance(s, target.id, mover.id) > 9 + EPS) return false
  return !leaderService.inEngagementWithEnemy(s, target.id)
}

export function smRapidRepositioningApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const distance = (env.stratagem.params?.distance as number | undefined) ?? 3
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: t.ids[0], targetUnitId: env.trigger.unitId ?? null, summary: `Rapid Repositioning: ${s.units[t.ids[0]].name} makes a Normal move of up to ${distance}"`, player: env.player })
  startReactiveMove(ctx, t.ids[0], distance, env.stratagem.id)
}

// ---------- secondaries (amounts called from missions.ts) ----------
// Reconnaissance in Force (SOL-4.1): end of own turn, rounds 2-5, count no-man's-land markers (home markers ignored)
export function reconnaissanceInForceAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const mine = Object.values(s.objectives).filter((o) => !o.removed && o.home === null && o.controller === pid).length
  const theirs = Object.values(s.objectives).filter((o) => !o.removed && o.home === null && o.controller === otherOf(pid)).length
  if (mine === 0) return 0
  if (mine > theirs) return rule.pointsPer
  if (mine === theirs) return (rule.params?.tiePoints as number | undefined) ?? 2
  return 0
}

// Pinpoint Purge (SOL-4.2): a ranged attack by `pid` destroys an enemy unit. Oath of Moment target scores params.oathPoints, any other pointsPer.
// An attached unit scores only when its last half dies.
export function pinpointPurgeAmount(
  s: GameState, rule: ScoringRule, pid: PlayerId,
  info: { unitId: UnitId; byPlayer: PlayerId | null; rangedAttack?: boolean },
): number {
  if (info.byPlayer !== pid || !info.rangedAttack) return 0
  const dead = s.units[info.unitId]
  if (!dead || dead.player === pid) return 0
  const canon = leaderService.canonicalUnitId(s, info.unitId)
  if (leaderService.halves(s, info.unitId).some((id) => id !== info.unitId && s.units[id]?.location !== 'destroyed')) return 0
  const oath = s.players[pid].oathTargetUnitId
  const oathCanon = oath ? leaderService.canonicalUnitId(s, oath) : null
  const isOath = oathCanon !== null && (oathCanon === canon || oathCanon === info.unitId || oath === info.unitId)
  return isOath ? ((rule.params?.oathPoints as number | undefined) ?? 3) : rule.pointsPer
}

const reconnaissanceInForce: EngineCodeHook = { name: 'reconnaissanceInForce', kind: 'mission', hook: 'onTurnEnd', run: noop }
const pinpointPurge: EngineCodeHook = { name: 'pinpointPurge', kind: 'mission', hook: 'onUnitDestroyed', run: noop }

export const spaceMarinesHooks: Record<string, EngineCodeHook> = {
  autoChoralResonators, stealthyHunter, shrouding, omniScramblers, strategicDispersal, suppressionFire, reconnaissanceInForce, pinpointPurge,
}
