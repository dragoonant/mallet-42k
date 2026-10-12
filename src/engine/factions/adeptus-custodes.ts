// Adeptus Custodes code hooks (docs/spec/factions/adeptus-custodes.md section 7, CUS-xxx / ADE tests). Registered in code-hooks.ts.
// Martial Ka'tah (stance pick), Auramite Thunderbolt (charge + advance re-roll), Stand Vigil (held-objective gate), The Gilded Spear,
// Overawing Magnificence, and the Guardian of the Realm secondary (bodies called from missions.ts).
//
// Like chaos-space-marines.ts this file reads the attack.ts / movement.ts phase-scoped marks directly (`deathReaction:<json>`,
// `erAtStart:<a>|<b>`) instead of importing those modules: code-hooks.ts pulls this file in, so importing the phase modules
// at load time would make module order matter.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from '../geometry'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { boardUnitsOf, modelIdFor, modelStats, unitModels } from '../state'
import type { GameState, ModelId, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined

export const MARTIAL_KATAH_CODE = 'martialKatahPick'
export type KatahStance = 'dacatarai' | 'rendax'

// ---------- shared helpers ----------
function otherOf(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

function boardHalves(s: GameState, canonical: UnitId): Unit[] {
  return leaderService.halves(s, canonical).map((id) => s.units[id]).filter((u): u is Unit => !!u && u.location === 'board' && unitModels(s, u.id).length > 0)
}

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

function objRange(s: GameState): { range: number; radius: number } {
  return { range: s.mission.data.objectiveRange ?? OBJECTIVE_RANGE, radius: s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS }
}

function canonicalBoardUnits(s: GameState, player: PlayerId): Unit[] {
  return boardUnitsOf(s, player).filter((u) => !u.bodyguardUnitId && boardHalves(s, u.id).length > 0)
}

// ---------- Martial Ka'tah (CUS-2) ----------
// canonical board units of `player` where some half carries the ability, sorted
export function katahUnits(state: GameState, player: PlayerId): UnitId[] {
  return canonicalBoardUnits(state, player)
    .filter((u) => boardHalves(state, u.id).some((h) => abilityIdWithCode(state, h, MARTIAL_KATAH_CODE)))
    .map((u) => u.id)
    .sort()
}

export function katahOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (window !== 'fight.start') return false
  for (const player of [s.activePlayer, otherOf(s.activePlayer)] as PlayerId[]) {
    const mark = `pick:katah:${s.round}:${s.activePlayer}:${player}`
    if (s.phaseState.marks.includes(mark)) continue
    const units = katahUnits(s, player)
    if (units.length === 0) continue
    s.phaseState.marks.push(mark)
    const holder = s.units[units[0]]
    const abilityId = boardHalves(s, holder.id).map((h) => abilityIdWithCode(s, h, MARTIAL_KATAH_CODE)).find((a) => a) ?? null
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: holder.id, abilityId, data: { window, key, code: MARTIAL_KATAH_CODE } },
      options: [
        { id: 'dacatarai', label: "Dacatarai stance: melee weapons gain Sustained Hits 1", action: { type: 'chooseOption', player, decisionId: '', optionId: 'dacatarai' } },
        { id: 'rendax', label: "Rendax stance: melee weapons gain Lethal Hits", action: { type: 'chooseOption', player, decisionId: '', optionId: 'rendax' } },
      ],
    })
    return true
  }
  return false
}

export function katahHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: "Martial Ka'tah expects chooseOption" }
  const stance = action.optionId as KatahStance
  if (stance !== 'dacatarai' && stance !== 'rendax') return { code: 'E_NOT_AN_OPTION', reason: "Martial Ka'tah: dacatarai or rendax" }
  const s = ctx.state
  const player = pending.player
  const grant = stance === 'dacatarai'
    ? { ability: 'SUSTAINED_HITS' as const, value: 1 }
    : { ability: 'LETHAL_HITS' as const }
  for (const canonical of katahUnits(s, player)) {
    for (const half of boardHalves(s, canonical)) {
      const abilityId = abilityIdWithCode(s, half, MARTIAL_KATAH_CODE)
      if (!abilityId) continue
      ctx.services.effects.grant(ctx, half.id, [{ when: { weaponType: 'melee' }, grantWeaponAbility: grant }], {
        sourceAbilityId: abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
      })
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: half.id, targetUnitId: null, summary: `Martial Ka'tah: ${half.name} adopts the ${stance === 'dacatarai' ? 'Dacatarai' : 'Rendax'} stance`, player })
    }
  }
  s.players[player].secondaryState.katahStance = { stance, round: s.round, turn: s.activePlayer }
}

// ---------- Auramite Thunderbolt (CUS-3.1) ----------
const auramiteThunderbolt: EngineCodeHook = {
  name: 'auramiteThunderbolt', kind: 'ability', hook: 'onChargeRoll', run: noop,
  rerollHooks: ['onChargeRoll', 'onAdvanceRoll'],
}

// ---------- Stand Vigil (CUS-6.2) ----------
// true iff a model of the holder's unit (both halves) is within range of a live marker its player controls
export function standVigilGate(state: GameState, holder: Unit): boolean {
  const canonical = leaderService.canonicalUnitId(state, holder.id)
  const { range, radius } = objRange(state)
  const markers = Object.values(state.objectives).filter((o) => !o.removed && o.controller === holder.player)
  if (markers.length === 0) return false
  return boardHalves(state, canonical).some((h) => unitModels(state, h.id).some((m) => markers.some((o) => withinObjectiveRange(m, o, 0, range, radius))))
}

const standVigil: EngineCodeHook = {
  name: 'standVigil', kind: 'ability', hook: 'onWoundRoll', run: noop,
  gate: (state, holder) => standVigilGate(state, holder),
}

// ---------- The Gilded Spear (CUS-5.1) ----------
interface DeathRequest { modelId: string; unitId: UnitId; player: PlayerId; attackerUnitId: UnitId }
const DEATH_PREFIX = 'deathReaction:'
function pendingDeath(s: GameState): DeathRequest | null {
  const m = s.phaseState.marks.find((x) => x.startsWith(DEATH_PREFIX))
  return m ? (JSON.parse(m.slice(DEATH_PREFIX.length)) as DeathRequest) : null
}

export function gildedSpearCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const req = pendingDeath(env.state)
  return !!req && req.unitId === t.ids[0] && req.player === env.player
}

export function gildedSpearApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const req = pendingDeath(s)
  if (!req || req.unitId !== t.ids[0]) return
  const attacker = leaderService.canonicalUnitId(s, req.attackerUnitId)
  for (const h of leaderService.halves(s, attacker)) {
    if (!s.units[h] || s.units[h].location === 'destroyed') continue
    ctx.services.effects.grant(ctx, h, [{ when: { weaponType: 'ranged' }, grantWeaponAbility: { ability: 'SUSTAINED_HITS', value: 1 } }], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: null, scope: { who: 'attacker' }, duration: 'battle', when: { attackerKeyword: 'ADEPTUS CUSTODES' },
    })
  }
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: req.unitId, targetUnitId: attacker, summary: 'The Gilded Spear: the slayer is marked, Custodes ranged attacks against it gain Sustained Hits 1', player: env.player })
  s.phaseState.marks = s.phaseState.marks.filter((m) => !(m.startsWith(DEATH_PREFIX) && (JSON.parse(m.slice(DEATH_PREFIX.length)) as DeathRequest).modelId === req.modelId))
}

const gildedSpear: EngineCodeHook = {
  name: 'gildedSpear', kind: 'stratagem', hook: 'onModelDestroyed', run: noop,
  check: gildedSpearCheck,
  apply: gildedSpearApply,
}

// ---------- Overawing Magnificence (CUS-5.3) ----------
function engagedAtStart(s: GameState, a: UnitId, b: UnitId): boolean {
  const ca = leaderService.canonicalUnitId(s, a)
  const cb = leaderService.canonicalUnitId(s, b)
  const [x, y] = ca < cb ? [ca, cb] : [cb, ca]
  return s.phaseState.marks.includes(`erAtStart:${x}|${y}`)
}

export function overawingCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const s = env.state
  const moverId = env.trigger.unitId
  const target = s.units[t.ids[0]]
  const mover = moverId ? s.units[moverId] : undefined
  if (!target || !mover || target.location !== 'board' || mover.location !== 'board' || mover.player === env.player) return false
  if (!leaderService.halves(s, mover.id).some((id) => s.units[id].turn.moveType === 'fallBack')) return false
  if (!engagedAtStart(s, target.id, mover.id)) return false
  return !leaderService.inEngagementWithEnemy(s, target.id)
}

export function overawingApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const models = boardHalves(s, t.ids[0]).flatMap((h) => unitModels(s, h.id))
  if (models.length === 0) return
  const move = Math.min(...models.map((m) => modelStats(s, m).M))
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: t.ids[0], targetUnitId: env.trigger.unitId ?? null, summary: `Overawing Magnificence: ${s.units[t.ids[0]].name} makes a Normal move of up to ${move}"`, player: env.player })
  startReactiveMove(ctx, t.ids[0], move, env.stratagem.id)
}

const overawingMagnificence: EngineCodeHook = {
  name: 'overawingMagnificence', kind: 'stratagem', hook: 'onMove', run: noop,
  check: overawingCheck,
  apply: overawingApply,
}

// ---------- Guardian of the Realm (CUS-4.1) ----------
// secondaryState.gotrNearAtStart: unit ids (canonical + halves) of enemy units within objective range of any marker at phase start;
// secondaryState.gotrKills: { unitId }[] of enemy units a friendly SHIELD-CAPTAIN model destroyed this phase
interface GotrKill { unitId: UnitId }

function nearAtStartKey(): string { return 'gotrNearAtStart' }

export function guardianOfTheRealmSnapshot(state: GameState): void {
  const { range, radius } = objRange(state)
  const markers = Object.values(state.objectives).filter((o) => !o.removed)
  for (const pid of ['A', 'B'] as PlayerId[]) {
    const rule = state.players[pid]
    const near = new Set<UnitId>()
    for (const e of boardUnitsOf(state, otherOf(pid))) {
      if (unitModels(state, e.id).some((m) => markers.some((o) => withinObjectiveRange(m, o, 0, range, radius)))) {
        for (const id of leaderService.halves(state, e.id)) near.add(id)
        near.add(e.id)
      }
    }
    rule.secondaryState[nearAtStartKey()] = [...near]
    rule.secondaryState.gotrKills = []
  }
}

export function guardianOfTheRealmModelDestroyed(
  ctx: EngineContext,
  info: { unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null },
): void {
  const s = ctx.state
  const pid = info.byPlayer
  if (!pid || !info.byModelId) return
  const captain = Object.values(s.units).find((u) => u.player === pid && u.location !== 'destroyed' && (s.datasheets[u.datasheetId]?.keywords ?? []).includes('SHIELD-CAPTAIN'))
  if (!captain) return
  if (info.byModelId !== modelIdFor(captain.id, 0)) return
  const victim = s.units[info.unitId]
  if (!victim || victim.player === pid) return
  const ss = s.players[pid].secondaryState
  const kills = (ss.gotrKills as GotrKill[] | undefined) ?? []
  kills.push({ unitId: info.unitId })
  ss.gotrKills = kills
}

export function guardianOfTheRealmAmount(state: GameState, rule: ScoringRule, pid: PlayerId): number {
  const ss = state.players[pid].secondaryState
  const kills = (ss.gotrKills as GotrKill[] | undefined) ?? []
  ss.gotrKills = []
  if (kills.length === 0) return 0
  const near = (ss[nearAtStartKey()] as UnitId[] | undefined) ?? []
  const bonus = (rule.params?.bonusPoints as number | undefined) ?? 2
  return kills.some((k) => near.includes(k.unitId) || near.includes(leaderService.canonicalUnitId(state, k.unitId))) ? bonus : rule.pointsPer
}

export const adeptusCustodesHooks: Record<string, EngineCodeHook> = {
  martialKatahPick: {
    name: MARTIAL_KATAH_CODE, kind: 'ability', hook: 'onPhaseStart', run: noop,
    pick: { window: 'fight.start', topic: 'abilityChoice', offer: (ctx, w, k) => katahOffer(ctx, w, k), handle: (ctx, a, p) => katahHandle(ctx, a, p) },
  },
  auramiteThunderbolt,
  standVigil,
  gildedSpear,
  overawingMagnificence,
}
