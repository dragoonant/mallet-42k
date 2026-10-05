// Tyranids engine rules (docs/spec/factions/tyranids.md §7, TYR-x): the bodies of the code hooks registered in code-hooks.ts.
// code-hooks.ts only holds thin wrappers that call into this file lazily (the engine modules form an import cycle, so nothing
// here may be read at module-evaluation time). Death Blow's deferred removal lives in ../deathblow.ts (attack.ts and fight.ts
// call it for every game); this file re-exports its names so the spec's `factions/tyranids` entry points exist.
import type { EffectList, ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import { distance, pointInPolygon, pointToPolygonEdge, OBJECTIVE_MARKER_RADIUS } from '../geometry'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { buildShootingWeaponEntries } from '../phases/shooting'
import { deploymentZone, keywordsOf, modelIdFor, modelStats, spawnUnitCopy, unitModels } from '../state'
import type {
  ChooseOptionDecision, GameState, PendingDecision, PlayerId, Rejection, Unit, UnitId,
} from '../types'
import { findReturnSpot, returnModel } from './necrons'

export { DEATH_BLOW_CODE, finishDeferredRemoval, pendingDeathBlowUnits, tryDeathBlow } from '../deathblow'

const EPS = 1e-6

export const SYNAPSE_CODE = 'synapseBattleShock'
export const SHADOW_CODE = 'shadowInTheWarp'
export const GOAD_SHOOT_CODE = 'secretionGoadShoot'
export const GOAD_FIGHT_CODE = 'secretionGoadFight'
export const SKULKING_CODE = 'skulkingHorrors'
export const DISRUPTION_CODE = 'disruptionBombardment'

// ---------- shared helpers ----------
function boardUnit(state: GameState, id: string | undefined): Unit | null {
  const u = id ? state.units[id] : undefined
  return u && u.location === 'board' && u.models.length > 0 ? u : null
}

function boardModelsOf(state: GameState, unitId: UnitId) {
  return leaderService.halves(state, unitId).flatMap((id) => (state.units[id]?.location === 'board' ? unitModels(state, id) : []))
}

function abilityIdWithCode(state: GameState, unit: Unit, code: string): string | null {
  const ds = state.datasheets[unit.datasheetId]
  for (const id of ds?.abilities ?? []) if (state.abilities[id]?.code === code) return id
  return null
}

function useDeclineOptions(player: PlayerId, useLabel: string): ChooseOptionDecision['options'] {
  return [
    { id: 'use', label: useLabel, action: { type: 'chooseOption', player, decisionId: '', optionId: 'use' }, hint: { priority: 1 } },
    { id: 'decline', label: 'Decline', action: { type: 'chooseOption', player, decisionId: '', optionId: 'decline' } },
  ]
}

const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

function otherPlayerOf(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

// ---------- Synapse (TYR-2.1 – 2.3) ----------
// extra Battle-shock dice for `testUnitId`: the unit's own Synapse ability counts when the unit has a model within `range` of
// any model of a friendly SYNAPSE unit on the battlefield (a SYNAPSE unit is in range of itself)
export function synapseExtraDice(state: GameState, testUnitId: UnitId, entry: HookSourceEntry): number {
  const holder = state.units[entry.holderUnitId]
  if (!holder || holder.location !== 'board' || !leaderService.halves(state, testUnitId).includes(holder.id)) return 0
  const range = (entry.params.range as number | undefined) ?? 6
  const keyword = (entry.params.keyword as string | undefined) ?? 'SYNAPSE'
  const mine = boardModelsOf(state, testUnitId)
  if (mine.length === 0) return 0
  for (const u of Object.values(state.units)) {
    if (u.player !== holder.player || u.location !== 'board' || !keywordsOf(state, u.id).includes(keyword)) continue
    if (boardModelsOf(state, u.id).some((t) => mine.some((m) => distance(m, t) <= range + EPS))) return (entry.params.extraDice as number | undefined) ?? 1
  }
  return 0
}

// ---------- Shadow in the Warp (TYR-2.4 – 2.5) ----------
export function shadowOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  for (const player of [s.activePlayer, otherPlayerOf(s.activePlayer)] as PlayerId[]) {
    const mark = `pick:shadow:${s.round}:${player}`
    if (s.phaseState.marks.includes(mark)) continue
    const holder = Object.values(s.units).find((u) => u.player === player && boardUnit(s, u.id) && abilityIdWithCode(s, u, SHADOW_CODE))
    if (!holder) continue
    const abilityId = abilityIdWithCode(s, holder, SHADOW_CODE) as string
    if (s.players[player].oncePerBattleUsed.includes(abilityId)) continue
    s.phaseState.marks.push(mark)
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: holder.id, abilityId, data: { window, key, code: SHADOW_CODE } },
      options: useDeclineOptions(player, 'Shadow in the Warp: every enemy unit takes a Battle-shock test'),
    })
    return true
  }
  return false
}

export function shadowHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Shadow in the Warp expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return notAnOption('Shadow in the Warp: use or decline')
  const s = ctx.state
  const holder = boardUnit(s, pending.context.unitId ?? '')
  const abilityId = pending.context.abilityId
  if (!holder || !abilityId) return notAnOption('Shadow in the Warp: the Prime is no longer on the battlefield')
  const player = holder.player
  if (s.players[player].oncePerBattleUsed.includes(abilityId)) return { code: 'E_STRATAGEM_USED', reason: 'Shadow in the Warp was already used this battle' }
  s.players[player].oncePerBattleUsed.push(abilityId)
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holder.id, targetUnitId: null, summary: 'Shadow in the Warp: every enemy unit takes a Battle-shock test', player })
  const tested = new Set<UnitId>()
  const targets = Object.values(s.units)
    .filter((u) => u.player !== player && u.location === 'board')
    .map((u) => leaderService.canonicalUnitId(s, u.id))
    .filter((id) => (tested.has(id) ? false : (tested.add(id), true)))
    .sort()
  for (const id of targets) hookService.battleShockTest(ctx, id, abilityId)
}

// ---------- Secretion Goad (TYR-3) ----------
const goadTurnMark = (s: GameState): string => `goad:${s.round}:${s.activePlayer}`

function goadBearer(s: GameState, player: PlayerId): { abilityId: string; modelId: string; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== GOAD_SHOOT_CODE || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    const unit = model ? s.units[model.unitId] : undefined
    if (unit && unit.player === player && unit.location === 'board' && unit.models.includes(model.id)) return { abilityId: a.id, modelId: model.id, unitId: unit.id }
  }
  return null
}

function goadOffer(code: string, flavour: string) {
  return (ctx: EngineContext, window: TimingWindowId, key: string): boolean => {
    const s = ctx.state
    const unit = boardUnit(s, key)
    if (!unit || !keywordsOf(s, unit.id).includes('TYRANIDS')) return false
    const bearer = goadBearer(s, unit.player)
    if (!bearer) return false
    const occurrence = `pick:goad:${window}:${unit.id}`
    if (s.phaseState.marks.includes(occurrence)) return false
    if (s.players[unit.player].oncePerBattleUsed.includes(goadTurnMark(s))) return false
    const range = (s.abilities[bearer.abilityId].params?.range as number | undefined) ?? 6
    const bearerModel = s.models[bearer.modelId]
    if (!boardModelsOf(s, unit.id).some((m) => distance(m, bearerModel) <= range + EPS)) return false
    s.phaseState.marks.push(occurrence)
    ctx.decide({
      kind: 'chooseOption', player: unit.player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: unit.id, abilityId: bearer.abilityId, data: { window, key, code } },
      options: useDeclineOptions(unit.player, `Secretion Goad: ${unit.name} improves its AP by 1 (${flavour})`),
    })
    return true
  }
}

export const goadShootOffer = goadOffer(GOAD_SHOOT_CODE, 'this Shooting phase')
export const goadFightOffer = goadOffer(GOAD_FIGHT_CODE, 'this Fight phase')

export function goadHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Secretion Goad expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return notAnOption('Secretion Goad: use or decline')
  const s = ctx.state
  const unit = boardUnit(s, pending.context.unitId ?? '')
  const abilityId = pending.context.abilityId
  const ability = abilityId ? s.abilities[abilityId] : undefined
  if (!unit || !abilityId || !ability) return notAnOption('Secretion Goad: unit or bearer missing')
  const mark = goadTurnMark(s)
  const used = s.players[unit.player].oncePerBattleUsed
  if (used.includes(mark)) return { code: 'E_STRATAGEM_USED', reason: 'Secretion Goad was already used this turn' }
  used.push(mark)
  const grant = ((ability.params?.grant as EffectList | undefined) ?? [{ modifyStat: { stat: 'AP', value: -1 } }]) as EffectList
  ctx.services.effects.grant(ctx, unit.id, grant, {
    sourceAbilityId: abilityId, sourceUnitId: unit.id, scope: { who: 'self' }, duration: (ability.params?.duration as 'untilEndOfPhase' | undefined) ?? 'untilEndOfPhase', when: null,
  })
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unit.id, targetUnitId: unit.id, summary: `Secretion Goad: ${unit.name} improves its AP by 1 until the end of the phase`, player: unit.player })
}

// ---------- Skulking Horrors (TYR-6.3) ----------
export function skulkingOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const moved = boardUnit(s, key)
  if (!moved) return false
  const type = leaderService.halves(s, moved.id).map((id) => s.units[id].turn.moveType).find((t) => t !== null) ?? null
  const holders = Object.values(s.units)
    .filter((u) => u.player !== moved.player && boardUnit(s, u.id) && abilityIdWithCode(s, u, SKULKING_CODE))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  for (const holder of holders) {
    const abilityId = abilityIdWithCode(s, holder, SKULKING_CODE) as string
    const params = s.abilities[abilityId].params ?? {}
    const allowed = (params.moveTypes as string[] | undefined) ?? ['normal', 'advance', 'fallBack']
    if (!type || !allowed.includes(type)) continue
    const occurrence = `pick:skulk:${moved.id}:${holder.id}`
    const turnMark = `skulk:${s.round}:${s.activePlayer}:${holder.id}`
    if (s.phaseState.marks.includes(occurrence) || s.phaseState.marks.includes(turnMark)) continue
    if (leaderService.unitDistance(s, holder.id, moved.id) > ((params.range as number | undefined) ?? 9) + EPS) continue
    if (leaderService.inEngagementWithEnemy(s, holder.id)) continue
    s.phaseState.marks.push(occurrence)
    ctx.decide({
      kind: 'chooseOption', player: holder.player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: holder.id, abilityId, data: { window, key, code: SKULKING_CODE, movedUnitId: moved.id } },
      options: useDeclineOptions(holder.player, `Skulking Horrors: ${holder.name} makes a D6" Normal move`),
    })
    return true
  }
  return false
}

export function skulkingHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Skulking Horrors expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return notAnOption('Skulking Horrors: use or decline')
  const s = ctx.state
  const holder = boardUnit(s, pending.context.unitId ?? '')
  const abilityId = pending.context.abilityId
  if (!holder || !abilityId) return notAnOption('Skulking Horrors: the unit is no longer on the battlefield')
  const turnMark = `skulk:${s.round}:${s.activePlayer}:${holder.id}`
  if (s.phaseState.marks.includes(turnMark)) return { code: 'E_STRATAGEM_USED', reason: 'Skulking Horrors was already used this turn' }
  s.phaseState.marks.push(turnMark)
  const roll = ctx.roll({ purpose: 'ability', player: holder.player, sides: 6, count: 1, mode: 'sum', unitId: holder.id, commandRerollable: false })
  const distanceRolled = roll.final.reduce((a, b) => a + b, 0)
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holder.id, targetUnitId: (pending.context.data.movedUnitId as string | undefined) ?? null, summary: `Skulking Horrors: ${holder.name} moves up to ${distanceRolled}"`, player: holder.player })
  startReactiveMove(ctx, holder.id, distanceRolled, abilityId)
}

// ---------- Disruption Bombardment (TYR-6.4) ----------
function disruptionCandidates(s: GameState, shooter: Unit): UnitId[] {
  const mine = leaderService.halves(s, shooter.id)
  const out: UnitId[] = []
  const seen = new Set<UnitId>()
  for (const e of Object.values(s.units)) {
    if (e.player === shooter.player || e.location !== 'board') continue
    const canon = leaderService.canonicalUnitId(s, e.id)
    if (seen.has(canon)) continue
    seen.add(canon)
    if (!keywordsOf(s, canon).includes('INFANTRY')) continue
    const theirs = leaderService.halves(s, canon)
    if (mine.some((m) => theirs.some((t) => s.phaseState.marks.includes(`hit:${m}>${t}`)))) out.push(canon)
  }
  return out.sort()
}

function applyDisruption(ctx: EngineContext, holder: Unit, abilityId: string, targetId: UnitId): void {
  const s = ctx.state
  const params = s.abilities[abilityId]?.params ?? {}
  const grant = ((params.grant as EffectList | undefined) ?? [
    { modifyStat: { stat: 'M', value: -2 } }, { modifyRoll: { roll: 'advance', value: -2 } }, { modifyRoll: { roll: 'charge', value: -2 } },
  ]) as EffectList
  const active = ctx.services.effects.grant(ctx, targetId, grant, { sourceAbilityId: abilityId, sourceUnitId: holder.id, scope: { who: 'self' }, duration: 'untilNextTurn', when: null })
  // effects.grant stamps the TARGET's owner on an 'untilNextTurn' expiry; this one lasts through the opponent's next turn, i.e.
  // until the start of the Tyranid player's next turn
  active.expires = { kind: 'nextOwnTurn', round: s.round, player: holder.player }
  const target = s.units[targetId]
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holder.id, targetUnitId: targetId, summary: `Disruption Bombardment: ${target?.name ?? targetId} loses 2" Move and 2 from Advance and Charge rolls`, player: holder.player })
}

export function disruptionOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const unit = boardUnit(s, key)
  if (!unit || s.phase !== 'shooting' || s.activePlayer !== unit.player) return false
  const abilityId = abilityIdWithCode(s, unit, DISRUPTION_CODE)
  if (!abilityId) return false
  const mark = `pick:disrupt:${unit.id}`
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  const candidates = disruptionCandidates(s, unit)
  if (candidates.length === 0) return false
  if (candidates.length === 1) { applyDisruption(ctx, unit, abilityId, candidates[0]); return false }
  ctx.decide({
    kind: 'chooseOption', player: unit.player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: unit.id, abilityId, data: { window, key, code: DISRUPTION_CODE } },
    options: candidates.map((id) => ({ id, label: s.units[id].name, action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: id }, hint: { unitId: id } })),
  })
  return true
}

export function disruptionHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Disruption Bombardment expects chooseOption')
  const s = ctx.state
  const holder = s.units[pending.context.unitId ?? '']
  const abilityId = pending.context.abilityId
  if (!holder || !abilityId) return notAnOption('Disruption Bombardment: unit missing')
  if (!disruptionCandidates(s, holder).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy INFANTRY unit this unit hit' }
  applyDisruption(ctx, holder, abilityId, action.optionId)
}

// ---------- Teeming Broods (TYR-5.3 – 5.5) ----------
export function teemingBroodsApply(ctx: EngineContext, stratagemId: string, player: PlayerId, unitId: UnitId): void {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit) return
  const params = s.stratagems[stratagemId]?.params ?? {}
  if (unit.location === 'board') {
    const dice = ctx.rollExpr((params.reviveDice as 'D6' | undefined) ?? 'D6', { purpose: 'stratagem', player, unitId, commandRerollable: false })
    let returned = 0
    for (let i = 0; i < dice.total; i++) {
      if (unit.models.length >= unit.startingStrength || unit.destroyedModels.length === 0) break
      const snapshot = unit.destroyedModels[unit.destroyedModels.length - 1]
      const pos = findReturnSpot(s, unit.id, snapshot)
      if (!pos) break
      const model = returnModel(ctx, unit, snapshot, pos, stratagemId)
      model.woundsRemaining = modelStats(s, model).W
      returned++
    }
    ctx.emit({ type: 'AbilityTriggered', abilityId: stratagemId, sourceUnitId: unitId, targetUnitId: unitId, summary: `Teeming Broods: ${returned} model${returned === 1 ? '' : 's'} return (rolled ${dice.total})`, player })
    return
  }
  if (unit.location !== 'destroyed') return
  const dice = ctx.rollExpr((params.respawnDice as '2D6' | undefined) ?? '2D6', { purpose: 'stratagem', player, unitId, commandRerollable: false })
  const count = Math.min(dice.total, (params.respawnCap as number | undefined) ?? 20)
  if (count <= 0) return
  const copy = spawnUnitCopy(s, unitId, count)
  ctx.emit({ type: 'UnitDeployed', unitId: copy.id, toReserves: true, player })
  ctx.emit({ type: 'AbilityTriggered', abilityId: stratagemId, sourceUnitId: unitId, targetUnitId: copy.id, summary: `Teeming Broods: a new unit of ${count} models joins Strategic Reserves (rolled ${dice.total})`, player })
}

// ---------- secondaries ----------
// Alpha Xenoform (TYR-4): the Prime (keyword from the rule's params) destroyed at least one enemy model this phase
export function alphaXenoformAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const keyword = (rule.params?.keyword as string | undefined) ?? 'WINGED TYRANID PRIME'
  const prime = Object.values(s.units).find((u) => u.player === pid && keywordsOf(s, u.id).includes(keyword))
  const kills = s.players[pid].secondaryState.killsThisPhase as Record<string, number> | undefined
  s.players[pid].secondaryState.killsThisPhase = {} // reset at phase end, like Wrath of the Emperor
  if (!prime || !kills) return 0
  return Object.keys(kills).some((modelId) => modelId.startsWith(`${prime.id}#`) && kills[modelId] >= 1) || (kills[modelIdFor(prime.id, 0)] ?? 0) >= 1 ? rule.pointsPer : 0
}

// Chitinous Tide (TYR-4): flat award when `controls(markerId)` holds for a marker whose nearest part is within the range of the
// enemy deployment zone (a marker inside the zone counts); measured from the marker's edge, not its centre
export function chitinousTideAmount(s: GameState, rule: ScoringRule, pid: PlayerId, controls: (objectiveId: string) => boolean): number {
  const within = (rule.params?.withinInches as number | undefined) ?? 6
  const zone = deploymentZone(s, otherPlayerOf(pid))
  const radius = s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const ok = Object.values(s.objectives).some((o) => {
    if (o.removed || !controls(o.id)) return false
    return pointInPolygon(o.pos, zone) || pointToPolygonEdge(o.pos, zone) - radius <= within + EPS
  })
  return ok ? rule.pointsPer : 0
}


// ---------- Voracious Assault: closest eligible target, fixed when targets are declared (TYR-5.2) ----------
const CLOSEST_PREFIX = 'closestEligible:'
const closestKey = (attackerUnitId: UnitId, kind: 'ranged' | 'melee'): string => `${CLOSEST_PREFIX}${attackerUnitId}:${kind}=`

// Called from hookService.run('onTargetsDeclared'): freezes the closest eligible enemy unit(s) into a phase mark so casualties from earlier
// weapon groups never change who counts as closest. A tie keeps a single unit (see below). Ranged eligibility reuses the shooting module's target legality (range, line of
// sight, Lone Operative 12", Engagement Range limits) instead of a bare range check.
export function snapshotClosestEligible(ctx: EngineContext, attackerUnitId: UnitId, kind: 'ranged' | 'melee', declaredTargets: UnitId[] = []): void {
  const s = ctx.state
  if (!s.units[attackerUnitId]) return
  s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith(`${CLOSEST_PREFIX}${attackerUnitId}:`))
  const legal = kind === 'ranged' ? [...new Set(buildShootingWeaponEntries(ctx, attackerUnitId).flatMap((e) => e.legalTargets))] : undefined
  let closest = leaderService.closestEligibleTargets(s, attackerUnitId, kind, legal)
  if (closest.length > 1) {
    // Rules Commentary (Closest Model/Unit): on a tie the controlling player picks ONE unit as the closest. Deterministic stand-in for that
    // choice: the first tied unit the declaration actually targets (the pick that benefits the player), else the first tied unit by id.
    const declared = new Set(declaredTargets.map((id) => leaderService.canonicalUnitId(s, id)))
    closest = [closest.find((id) => declared.has(id)) ?? [...closest].sort()[0]]
  }
  s.phaseState.marks.push(`${closestKey(attackerUnitId, kind)}${closest.join(',')}`)
}

// the frozen set for this attacker/kind, or null when no declaration was snapshotted (callers then fall back to the live board)
export function frozenClosestEligible(s: GameState, attackerUnitId: UnitId, kind: 'ranged' | 'melee'): UnitId[] | null {
  const key = closestKey(attackerUnitId, kind)
  const mark = s.phaseState.marks.find((m) => m.startsWith(key))
  if (mark === undefined) return null
  const rest = mark.slice(key.length)
  return rest === '' ? [] : rest.split(',')
}
