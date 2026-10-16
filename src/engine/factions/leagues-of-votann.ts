// Leagues of Votann code hooks (docs/spec/factions/leagues-of-votann.md section 7, LEA-x). Registered in code-hooks.ts via
// `leaguesOfVotannHooks`. Eye of the Ancestors (hit / wound bonus gate), Grim Efficiency, Payment in Kind, Outflanking
// Mag-Riders, Cyberstimms and the two secondaries (Toil Earns, Holy Apparatus; bodies called from missions.ts).
//
// Judgement tokens (engine E1) live in ../judgement.ts; the Teleport-record store with its arrival options (E2) lives in
// ../teleport.ts. Like the other faction files this one reads the attack.ts `deathReaction:<json>` mark directly instead of
// importing attack.ts, because code-hooks.ts pulls this file in.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { baseEdgePoints, pointInPolygon, type Footprint } from '../geometry'
import type { AttackContext } from '../hooks'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { grantFightOnDeath } from '../fight-on-death'
import { addJudgement, judgementTokens } from '../judgement'
import { deploymentZone, unitModels } from '../state'
import { isTeleporting, removeUnitToReserves } from '../teleport'
import type { GameState, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const LOV = 'LEAGUES OF VOTANN'

export const TOIL_KEY = 'lov:toilEarns'
export const HOLY_KEY = 'lov:holyApparatus'

const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

// canonical (attached pair = one) units of `player` that are not destroyed, optionally restricted to a location
function canonicalUnits(s: GameState, player: PlayerId, pred: (u: Unit) => boolean): Unit[] {
  const seen = new Set<UnitId>()
  const out: Unit[] = []
  for (const u of Object.values(s.units).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (u.player !== player || !pred(u)) continue
    const c = leaderService.canonicalUnitId(s, u.id)
    if (seen.has(c)) continue
    seen.add(c)
    out.push(s.units[c] ?? u)
  }
  return out
}

// ---------- Eye of the Ancestors: hit / wound bonus gate (LEA-2.2) ----------
// The descriptors carry the modifyRoll effects; the gate only lets them apply against a unit holding enough tokens.
// Tokens are read per Votann player (LEA-2.4): the holder's player owns the token set.
const eyeOfTheAncestors: EngineCodeHook = {
  name: 'eyeOfTheAncestors', kind: 'ability', hook: 'onHitRoll', hooks: ['onHitRoll', 'onWoundRoll'], run: noop,
  gate(state, holder, entry, data) {
    const a = data?.attack as AttackContext | null | undefined
    if (!a?.targetUnitId) return false
    const min = (entry.params?.min as number | undefined) ?? 1
    return judgementTokens(state, holder.player, a.targetUnitId) >= min
  },
}

// ---------- Grim Efficiency (LEA-6.1) ----------
function grimBearer(s: GameState, player: PlayerId): { abilityId: string; unitId: UnitId; modelId: string } | null {
  for (const u of Object.values(s.units)) {
    if (u.player !== player || u.location !== 'board') continue
    const abilityId = abilityIdWithCode(s, u, 'grimEfficiencyPick')
    if (!abilityId) continue
    const m = unitModels(s, u.id)[0]
    if (m) return { abilityId, unitId: u.id, modelId: m.id }
  }
  return null
}

export function grimCandidates(ctx: EngineContext, player: PlayerId): UnitId[] {
  const s = ctx.state
  const bearer = grimBearer(s, player)
  if (!bearer) return []
  const out: UnitId[] = []
  for (const e of canonicalUnits(s, other(player), (u) => u.location === 'board' && unitModels(s, u.id).length > 0)) {
    const halves = leaderService.halves(s, e.id).filter((h) => s.units[h]?.location === 'board' && unitModels(s, h).length > 0)
    if (halves.some((h) => ctx.services.los.unitVisible(s, bearer.modelId, h))) out.push(e.id)
  }
  return out
}

const grimEfficiencyPick: EngineCodeHook = {
  name: 'grimEfficiencyPick', kind: 'ability', hook: 'onCommandPhase', run: noop,
  gate: () => false,
  pick: {
    window: 'command.start',
    topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      const player = s.activePlayer
      if (!ctx.once(`grimEfficiency:${s.round}:${player}`)) return false
      const bearer = grimBearer(s, player)
      if (!bearer) return false
      const candidates = grimCandidates(ctx, player)
      if (candidates.length === 0) return false
      ctx.decide({
        kind: 'chooseOption', player, window, canPass: false,
        context: { topic: 'abilityChoice', unitId: bearer.unitId, abilityId: bearer.abilityId, data: { window, key, code: 'grimEfficiencyPick' } },
        options: candidates.map((id) => ({ id, label: `Grim Efficiency: ${s.units[id].name}`, action: optionAction(player, id), hint: { unitId: id, priority: 1 } })),
      })
      return true
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Grim Efficiency expects chooseOption' }
      const s = ctx.state
      if (!grimCandidates(ctx, pending.player).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit that is visible to the Kahl' }
      const abilityId = pending.context.abilityId ?? 'lov.a.grim-efficiency'
      const before = judgementTokens(s, pending.player, action.optionId)
      addJudgement(ctx, pending.player, action.optionId, 1, abilityId)
      if (before >= 2) {
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: pending.context.unitId, targetUnitId: action.optionId, summary: `Grim Efficiency: ${s.units[action.optionId].name} already holds 2 tokens`, player: pending.player })
      }
    },
  },
}

// ---------- Payment in Kind (LEA-5) ----------
interface DeathRequest { modelId: string; unitId: UnitId; player: PlayerId; attackerUnitId: UnitId }
const DEATH_PREFIX = 'deathReaction:'
function pendingDeath(s: GameState): DeathRequest | null {
  const m = s.phaseState.marks.find((x) => x.startsWith(DEATH_PREFIX))
  return m ? (JSON.parse(m.slice(DEATH_PREFIX.length)) as DeathRequest) : null
}

export function paymentInKindCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const req = pendingDeath(env.state)
  return !!req && req.unitId === t.ids[0] && req.player === env.player
}

export function paymentInKindApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const req = pendingDeath(s)
  if (!req || req.unitId !== t.ids[0]) return
  const attacker = leaderService.canonicalUnitId(s, req.attackerUnitId)
  for (const h of leaderService.halves(s, attacker)) {
    if (!s.units[h] || s.units[h].location === 'destroyed') continue
    ctx.services.effects.grant(ctx, h, [{ reroll: 'ones' }], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: null, scope: { who: 'attacker' }, duration: 'battle', when: { attackerKeyword: LOV },
    })
  }
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: req.unitId, targetUnitId: attacker, summary: 'Payment in Kind: the killer is marked, Votann hit rolls of 1 against it are re-rolled', player: env.player })
  s.phaseState.marks = s.phaseState.marks.filter((m) => !(m.startsWith(DEATH_PREFIX) && (JSON.parse(m.slice(DEATH_PREFIX.length)) as DeathRequest).modelId === req.modelId))
}

const paymentInKind: EngineCodeHook = {
  name: 'paymentInKind', kind: 'stratagem', hook: 'onModelDestroyed', hooks: ['onHitRoll'], run: noop,
  // the re-roll is granted to the killer's unit by `apply`, not to the destroyed target
  grantsItself: true,
  check: paymentInKindCheck,
  apply: paymentInKindApply,
}

// ---------- Outflanking Mag-Riders (LEA-6.3) ----------
const MAG_CODE = 'outflankingMagRiders'

function carriesMag(s: GameState, unitId: UnitId): boolean {
  const u = s.units[unitId]
  return !!u && abilityIdWithCode(s, u, MAG_CODE) !== null
}

function magAbilityId(s: GameState, unitId: UnitId): string | null {
  const u = s.units[unitId]
  return u ? abilityIdWithCode(s, u, MAG_CODE) : null
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

// smallest horizontal gap between any point of the model's base and a battlefield edge
function edgeGap(s: GameState, m: Footprint): number {
  const hw = s.board.w / 2, hh = s.board.h / 2
  let best = Infinity
  for (const p of baseEdgePoints(m)) best = Math.min(best, hw - Math.abs(p.x), hh - Math.abs(p.z))
  return best
}

export function magRidersCandidates(s: GameState, player: PlayerId): UnitId[] {
  if (s.round < 2) return []
  const out: UnitId[] = []
  for (const u of canonicalUnits(s, player, (x) => x.location === 'board' && x.models.length > 0)) {
    const halves = leaderService.halves(s, u.id).filter((h) => s.units[h]?.location === 'board' && s.units[h].models.length > 0)
    if (halves.length === 0) continue
    if (!leaderService.halves(s, u.id).filter((h) => s.units[h]?.location !== 'destroyed').every((h) => carriesMag(s, h))) continue
    if (isTeleporting(s, u.id)) continue
    const range = (s.abilities[magAbilityId(s, halves[0]) ?? '']?.params?.edgeRange as number | undefined) ?? 6
    if (!halves.some((h) => unitModels(s, h).some((m) => edgeGap(s, m) <= range + 1e-6))) continue
    if (inEnemyEngagement(s, u.id, player)) continue
    out.push(u.id)
  }
  return out.sort()
}

function magOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const player = other(s.activePlayer)
  if (!ctx.once(`magRiders:${s.round}:${s.activePlayer}`)) return false
  const candidates = magRidersCandidates(s, player)
  if (candidates.length === 0) return false
  const abilityId = magAbilityId(s, candidates[0])
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId, data: { window, key, code: MAG_CODE } },
    options: [
      ...candidates.map((id) => ({ id, label: `Outflanking Mag-Riders: ${s.units[id].name}`, action: optionAction(player, id), hint: { priority: 1, unitId: id } })),
      { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
    ],
  })
  return true
}

function magHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Outflanking Mag-Riders expects chooseOption' }
  if (action.optionId === 'decline') return
  const s = ctx.state
  if (!magRidersCandidates(s, pending.player).includes(action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: 'that unit cannot use Outflanking Mag-Riders now' }
  const abilityId = pending.context.abilityId ?? magAbilityId(s, action.optionId) ?? 'lov.a.outflanking-mag-riders'
  const params = s.abilities[abilityId]?.params ?? {}
  removeUnitToReserves(ctx, action.optionId, abilityId, {
    minEnemyGap: (params.minDistance as number | undefined) ?? 9,
    forbidChargeOnArrival: false,
    region: 'edgeNotOpponent',
    eventVia: 'strategicReserves',
  })
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: action.optionId, targetUnitId: null, summary: 'Outflanking Mag-Riders: unit leaves the battlefield', player: pending.player })
}

const outflankingMagRiders: EngineCodeHook = {
  name: MAG_CODE, kind: 'ability', hook: 'onTurnEnd', run: noop,
  gate: () => false,
  pick: { window: 'turn.end', topic: 'abilityChoice', offer: (ctx, w, k) => magOffer(ctx, w, k), handle: (ctx, a, p) => magHandle(ctx, a, p) },
}

// ---------- Cyberstimms (LEA-6.4) ----------
// Every Fight phase (either player's) each unit carrying the ability is granted fight-on-death at the threshold; the C5
// path in attack.ts destroyModel does the D6 roll, the "has not fought yet" test, the deferral and the later removal.
const cyberstimms: EngineCodeHook = {
  name: 'cyberstimms', kind: 'ability', hook: 'onPhaseStart', run: noop,
  runAt(ctx, entry) {
    const s = ctx.state
    if (s.phase !== 'fight') return
    const holder = s.units[entry.holderUnitId]
    if (!holder || holder.location !== 'board') return
    grantFightOnDeath(s, holder.id, (entry.params?.threshold as number | undefined) ?? 4)
  },
}

// ---------- Toil Earns (LEA-4.1) ----------
export function toilCandidates(s: GameState, pid: PlayerId): string[] {
  const zone = deploymentZone(s, pid)
  return Object.values(s.objectives)
    .filter((o) => !o.removed && !pointInPolygon({ x: o.pos.x, z: o.pos.z }, zone))
    .map((o) => o.id)
    .sort()
}

// the Deploy Armies pick window (rule `toil-earns-pick`, window deployment.unit, round 0): the secondary's owner names a marker
export function toilEarnsOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string): void {
  const s = ctx.state
  const ids = toilCandidates(s, owner)
  if (ids.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: owner, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { window, key, code: 'toilEarnsPick', owner } },
    options: ids.map((id) => ({ id, label: `Toil Earns: marker ${id}`, action: optionAction(owner, id) })),
  })
}

function answerToilEarns(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Toil Earns expects chooseOption' }
  const s = ctx.state
  const owner = ((pending.context.data as { owner?: PlayerId }).owner ?? pending.player) as PlayerId
  if (!toilCandidates(s, owner).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an objective marker outside your own deployment zone' }
  s.players[owner].secondaryState[TOIL_KEY] = action.optionId
  ctx.emit({ type: 'AbilityTriggered', abilityId: 'lov.sec.toil-earns', sourceUnitId: null, targetUnitId: null, summary: `Toil Earns: marker ${action.optionId} chosen`, player: owner })
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// 4 VP when the stored marker is still on the table and `holds(id)` (the player controls it)
export function toilEarnsAmount(s: GameState, rule: { pointsPer: number }, pid: PlayerId, holds: (objectiveId: string) => boolean): number {
  const id = s.players[pid].secondaryState[TOIL_KEY] as string | undefined
  const obj = id ? s.objectives[id] : undefined
  if (!id || !obj || obj.removed) return 0
  return holds(id) ? rule.pointsPer : 0
}

const toilEarnsPick: EngineCodeHook = { name: 'toilEarnsPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerToilEarns }
const toilEarnsScore: EngineCodeHook = { name: 'toilEarnsScore', kind: 'mission', hook: 'onTurnEnd', run: noop }

// ---------- Holy Apparatus (LEA-4.2) ----------
interface HolyMark { unitId: UnitId; halves: UnitId[]; round: number }

export function holyCandidates(s: GameState, owner: PlayerId): UnitId[] {
  return canonicalUnits(s, other(owner), (u) => u.location !== 'destroyed')
    .filter((u) => judgementTokens(s, owner, u.id) >= 1)
    .map((u) => u.id)
}

export function holyApparatusOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string): void {
  const s = ctx.state
  const ids = holyCandidates(s, owner)
  if (ids.length === 0) { s.players[owner].secondaryState[HOLY_KEY] = null; return }
  ctx.decide({
    kind: 'chooseOption', player: owner, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { window, key, code: 'holyApparatusPick', owner } },
    options: ids.map((id) => ({ id, label: `Holy Apparatus: ${s.units[id].name}`, action: optionAction(owner, id), hint: { unitId: id } })),
  })
}

function answerHolyApparatus(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Holy Apparatus expects chooseOption' }
  const s = ctx.state
  const owner = ((pending.context.data as { owner?: PlayerId }).owner ?? pending.player) as PlayerId
  if (!holyCandidates(s, owner).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit that holds a Judgement token' }
  const mark: HolyMark = { unitId: action.optionId, halves: leaderService.halves(s, action.optionId).filter((h) => !!s.units[h]), round: s.round }
  s.players[owner].secondaryState[HOLY_KEY] = mark
  ctx.emit({ type: 'AbilityTriggered', abilityId: 'lov.sec.holy-apparatus', sourceUnitId: null, targetUnitId: action.optionId, summary: `Holy Apparatus: ${s.units[action.optionId].name} is this round's target`, player: owner })
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// 4 VP at round end when this round's target (every half of it) is destroyed
export function holyApparatusAmount(s: GameState, rule: ScoringRule | { pointsPer: number }, pid: PlayerId): number {
  const mark = s.players[pid].secondaryState[HOLY_KEY] as HolyMark | null | undefined
  if (!mark || mark.round !== s.round) return 0
  return mark.halves.every((h) => s.units[h]?.location === 'destroyed') ? rule.pointsPer : 0
}

const holyApparatusPick: EngineCodeHook = { name: 'holyApparatusPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerHolyApparatus }
const holyApparatusScore: EngineCodeHook = { name: 'holyApparatusScore', kind: 'mission', hook: 'onPhaseEnd', run: noop }

export const leaguesOfVotannHooks: Record<string, EngineCodeHook> = {
  eyeOfTheAncestors, grimEfficiencyPick, paymentInKind, outflankingMagRiders, cyberstimms,
  toilEarnsPick, toilEarnsScore, holyApparatusPick, holyApparatusScore,
}
