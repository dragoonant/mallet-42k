// Missions: scoring rules, mission rules, deployment zones, game end (10-rules §12, 11-combat-patrol §2). Owner: W1-F.
// ctx.window() calls `onWindow` exactly once per window occurrence before any stratagem window: run every ScoringRule
// whose `when` matches (respect rounds/who/cap, append MissionState.scored, VpScored) and every MissionRule code hook.
//
// Re-entrancy: a "pick" (Stomp 'Em's target, Retrieve Intelligence's marker, …) raises a chooseOption decision, which
// pauses everything until answered — `ctx.window`'s own once-per-occurrence gate means `onWindow` itself is NOT called
// again for this occurrence, so `missionService.handler` resumes the same occurrence itself (via `window`/`key` carried
// in the decision's `context.data`) once the pick is answered, mirroring the pattern `hookService.offerPicks` uses for
// Oath of Moment / Waaagh!. Per-rule "done" marks (`phaseState.marks`) make every step idempotent across that resume.
import type { MissionRule, ScoringRule, TimingWindowId } from '../data/types'
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, pointInPolygon, withinObjectiveRange } from './geometry'
import { hookService } from './hooks-impl'
import { leaderService } from './leaders'
import { liveClaimers, pruneClaim, recordClaim } from './objectives'
import type { DecisionHandler, EngineContext, WindowTrigger } from './modules'
import { otherPlayer } from './modules'
import { boardUnitsOf, deploymentZone, hasKeyword, keywordsOf, modelIdFor, unitModels } from './state'
import type {
  ChooseOptionDecision, ChooseOptionTopic, GameResult, GameState, Objective, ObjectiveId, PendingDecision,
  PlayerId, Rejection, Unit, UnitId,
} from './types'
import type { Action, ChooseOptionAction } from './actions'

export interface MissionService {
  onWindow(ctx: EngineContext, window: TimingWindowId, key: string, trigger?: WindowTrigger): void
  // R-12.6: models on the battlefield, or Reserves that can still arrive (CP-1.9: rounds 1–3)
  playerHasForces(state: GameState, player: PlayerId): boolean
  // R-12.6 [interp]: both players without forces → the battle ends at once on VP
  isTabled(state: GameState): boolean
  // R-12.7 / CP-1.11: VP totals incl. Battle Ready; equal → draw
  finalResult(state: GameState, reason: GameResult['reason']): GameResult
  // answers chooseOption topics razeObjective / recoverObjective / stompTarget / bagTarget
  readonly handler: DecisionHandler
}

// ---------- small shared helpers ----------
function rangeParams(state: GameState): { range: number; radius: number } {
  return { range: state.mission.data.objectiveRange ?? OBJECTIVE_RANGE, radius: state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS }
}

// CP-2.3 / R-12.3: who controls the marker AT THIS MOMENT. Scoring windows (command.end, turn.end) and every other
// mission-rule code hook run before the core's next evaluateControl, so the stored controller can be stale after
// Battle-shock tests or recovery earlier in the phase (MISSION-004-scoring / -recover, MISSION-019-holdmore).
// Mirrors evaluateControl without mutating state: secured → securer, UNLESS the opponent's live LoC now exceeds the
// securer's at a Command phase end, in which case the secure has broken at this same moment (CP-2.4/2.5,
// MISSION-007-scoring) and control falls through to live LoC below like any unsecured marker. Otherwise: live LoC,
// ties falling to a sticky flag — except when neither side has any live evidence at all (0 vs 0), where the stored
// field is trusted UNLESS a unit has actually been destroyed this battle: once that's happened, "0 vs 0" can mean a
// marker's last in-range model died since the previous evaluation (R-2.6 cull, MISSION-011-stale), which is
// contested, not the possibly-stale stored value.
function liveController(ctx: EngineContext, id: ObjectiveId): PlayerId | null {
  const s = ctx.state
  const obj = s.objectives[id]
  if (!obj || obj.removed) return null
  const svc = ctx.services.objectives
  if (obj.securedBy) {
    const stillSecure = s.phase !== 'command' || svc.levelOfControl(s, id)[otherPlayer(obj.securedBy)] <= svc.levelOfControl(s, id)[obj.securedBy]
    if (stillSecure) return obj.securedBy
  }
  if (svc.modelsInRange(s, id, 'A').length === 0 && svc.modelsInRange(s, id, 'B').length === 0) {
    const anyoneDestroyedYet = Object.values(s.units).some((u) => u.location === 'destroyed')
    return anyoneDestroyedYet ? (obj.stickyBy ?? null) : obj.controller
  }
  const levels = svc.levelOfControl(s, id)
  return levels.A > levels.B ? 'A' : levels.B > levels.A ? 'B' : (obj.stickyBy ?? null)
}

function holds(ctx: EngineContext, id: ObjectiveId, pid: PlayerId): boolean {
  return liveController(ctx, id) === pid
}

// same live view as `holds` — mission-rule code hooks (claimSites, retrieveIntelligence, dutyAndHonour, …) ask "does
// pid control this marker right now", exactly the question `holds` answers; kept as a separate name for readability
// at call sites that read as "controls" rather than "holds".
function controls(ctx: EngineContext, id: ObjectiveId, pid: PlayerId): boolean {
  return holds(ctx, id, pid)
}

function awardVp(ctx: EngineContext, pid: PlayerId, amount: number, source: string): void {
  if (amount <= 0) return
  const p = ctx.state.players[pid]
  p.vp += amount
  p.vpBySource[source] = (p.vpBySource[source] ?? 0) + amount
  ctx.emit({ type: 'VpScored', source, amount, total: p.vp, player: pid })
}

function once(state: GameState, key: string): boolean {
  if (state.phaseState.marks.includes(key)) return false
  state.phaseState.marks.push(key)
  return true
}

// raises a chooseOption decision; `window`/`key` are echoed into context.data so the handler can resume this
// occurrence (see file header) after the answer is applied
function offerChoice(
  ctx: EngineContext, player: PlayerId, window: TimingWindowId, key: string, topic: ChooseOptionTopic,
  options: { id: string; label: string }[], data: Record<string, unknown> = {}, canPass = false,
): void {
  ctx.decide({
    kind: 'chooseOption', player, window, canPass,
    context: { topic, unitId: null, abilityId: null, data: { ...data, window, key } },
    options: options.map((o) => ({ id: o.id, label: o.label, action: { type: 'chooseOption', player, decisionId: '', optionId: o.id } })),
  })
}

function removeObjective(ctx: EngineContext, id: string | undefined, reason: string): void {
  if (!id) return
  const obj = ctx.state.objectives[id]
  if (!obj || obj.removed) return
  obj.removed = true
  ctx.emit({ type: 'ObjectiveRemoved', objectiveId: id, reason })
}

// engine RNG selection among candidates (11-combat-patrol §2: "random selections use the engine RNG, purpose 'mission'").
// MISSION-014-uniform: always roll a D6 and bucket its faces into `n` equal-size groups (`floor(6/n)` faces each);
// a face beyond the largest such group is rejected and re-rolled so every candidate stays equally likely.
function pickRandomObjective(ctx: EngineContext, player: PlayerId, ids: string[]): string {
  const n = ids.length
  if (n <= 1) return ids[0]
  const sides = 6
  const bucket = Math.floor(sides / n)
  const limit = bucket * n
  for (;;) {
    const roll = ctx.roll({ purpose: 'mission', player, sides, count: 1, mode: 'sum', commandRerollable: false })
    const die = roll.final[0]
    if (die > limit) continue
    return ids[Math.floor((die - 1) / bucket)]
  }
}

function objectiveIdsOf(s: GameState, rule: ScoringRule): string[] {
  const params = rule.params ?? {}
  if (Array.isArray(params.objectiveIds)) return params.objectiveIds as string[]
  const fromCustom = params.objectiveIdsFromCustom as string | undefined
  if (fromCustom) {
    const v = s.mission.custom[fromCustom]
    if (typeof v === 'string') return [v]
    if (Array.isArray(v)) return v as string[]
    return []
  }
  return Object.keys(s.objectives)
}

function whoApplies(who: ScoringRule['who'], pid: PlayerId, s: GameState): boolean {
  switch (who) {
    case 'active': return pid === s.activePlayer
    case 'opponent': return pid === otherPlayer(s.activePlayer)
    // 'first'/'second' gate on the CURRENT turn's active player too, not just on pid's seat: 'command.end' and
    // 'turn.end' windows both fire once per player per round (once at the end of each player's own Command phase /
    // turn), so without this a round-5 rule scoped to who:'first'/'second' would double-award — once when its own
    // phase/turn ends and again when the OTHER player's phase/turn ends (MISSION-R5-double-score).
    case 'first': return pid === s.firstPlayer && s.activePlayer === s.firstPlayer
    case 'second': return pid !== s.firstPlayer && s.activePlayer === pid
    default: return true // 'both' | undefined
  }
}

function applicable(rule: ScoringRule, pid: PlayerId, window: TimingWindowId, s: GameState): boolean {
  return rule.when === window && s.round >= rule.rounds.from && s.round <= rule.rounds.to && whoApplies(rule.who, pid, s)
}

function rulesFor(s: GameState, pid: PlayerId): ScoringRule[] {
  return [...s.mission.scoring, ...(s.mission.secondaries[pid] ?? [])]
}

// ScoringRule-shaped "pick" instances (pointsPer 0): raise a decision instead of computing an amount
const PICK_CODES = new Set(['stompEmPick', 'bagPick'])

// ---------- generic ScoringRule.rule amounts ----------
function tierPoints(tiers: Record<string, number>, die: number): number {
  for (const [range, pts] of Object.entries(tiers)) {
    const [lo, hi] = range.split('-').map(Number)
    if (die >= lo && die <= (Number.isFinite(hi) ? hi : lo)) return pts
  }
  return 0
}

function destroyedUnitsAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const key = `destroyedCounted:${rule.id}`
  const counted = (s.mission.custom[key] as string[] | undefined) ?? []
  const newly = Object.values(s.units).filter((u) => u.player !== pid && u.location === 'destroyed' && !counted.includes(u.id))
  if (newly.length === 0) return 0
  s.mission.custom[key] = [...counted, ...newly.map((u) => u.id)]
  return newly.length * rule.pointsPer
}

function wrathOfTheEmperorAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  // find the Captain unit by keyword (CAPTAIN datasheets in this roster are always single-model, so its one model's
  // id is always `${unitId}#0` per modelIdFor — stable even the phase the Captain itself dies, unlike reading
  // captain.models[0], which goes empty once the unit is destroyed and would drop a kill scored just before death)
  const captain = Object.values(s.units).find((u) => u.player === pid && keywordsOf(s, u.id).includes('CAPTAIN'))
  const killsThisPhase = s.players[pid].secondaryState.killsThisPhase as Record<string, number> | undefined
  s.players[pid].secondaryState.killsThisPhase = {} // reset at phase end (11-combat-patrol §2.6)
  if (!captain || !killsThisPhase) return 0
  return (killsThisPhase[modelIdFor(captain.id, 0)] ?? 0) >= 1 ? rule.pointsPer : 0
}

function shockTacticsAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  const opp = otherPlayer(pid)
  const held = Object.values(s.objectives).some((o) => !o.removed && o.controllerAtTurnStart === opp && controls(ctx, o.id, pid))
  return held ? rule.pointsPer : 0
}

function sweepingRaidBonusAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  const side = s.players[pid].side
  const list = (side === 'attacker' ? rule.params?.attacker : side === 'defender' ? rule.params?.defender : undefined) as
    { objectiveId: string; points: number }[] | undefined
  if (!list) return 0
  let total = 0
  for (const entry of list) if (controls(ctx, entry.objectiveId, pid)) total += entry.points
  return total
}

function stompEmScoreAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const targetId = s.players[pid].secondaryState.stompTargetUnitId as UnitId | undefined
  if (!targetId) return 0
  const unit = s.units[targetId]
  const scored = !!unit && unit.location === 'destroyed' && !!unit.destroyedBy &&
    unit.destroyedBy.round === s.round && unit.destroyedBy.kind === 'melee' && unit.destroyedBy.player === pid
  // a fresh pick is offered every round this secondary is active; never let a stale kill re-score in a later round
  s.players[pid].secondaryState.stompTargetUnitId = undefined
  return scored ? rule.pointsPer : 0
}

function properLootinAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  const zone = deploymentZone(s, pid)
  const { range, radius } = rangeParams(s)
  const tiers = (rule.params?.rollTiers as Record<string, number> | undefined) ?? { '2-4': 3, '5-6': 5 }
  const keyword = (rule.params?.armyKeyword as string | undefined) ?? 'ORKS'
  let total = 0
  for (const obj of Object.values(s.objectives) as Objective[]) {
    if (obj.removed || obj.lootedBy.includes(pid)) continue
    if (pointInPolygon(obj.pos, zone)) continue // must be outside the looting player's own deployment zone
    if (!controls(ctx, obj.id, pid)) continue // 11-combat-patrol §6: a marker you don't control cannot be looted
    const inRange = boardUnitsOf(s, pid).filter((u) => hasKeyword(s, u.id, keyword) && unitModels(s, u.id).some((m) => withinObjectiveRange(m, obj, 0, range, radius)))
    if (inRange.length === 0) continue
    if (inRange.some((u) => leaderService.inEngagementWithEnemy?.(s, u.id))) continue
    const roll = ctx.roll({ purpose: 'mission', player: pid, sides: 6, count: 1, mode: 'sum', commandRerollable: false })
    const points = tierPoints(tiers, roll.final[0])
    if (points > 0) { obj.lootedBy = [...obj.lootedBy, pid]; total += points }
  }
  return total
}

// Bag the Big 'Un (11-combat-patrol §6 appendix roster, not present in current data — exercised only by synthetic
// tests; see issues). `secondaryState.bagTargetUnitId` is the enemy unit whose (single) model was picked.
function bagTheBigUnAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const targetId = s.players[pid].secondaryState.bagTargetUnitId as UnitId | undefined
  if (!targetId) return 0
  const unit = s.units[targetId]
  if (!unit) return 0
  const unitPoints = (rule.params?.unitPoints as number | undefined) ?? 8
  const beastbossPoints = (rule.params?.beastbossPoints as number | undefined) ?? 12
  // R-5.16 [interp]: a Reserves unit that never arrived counts as destroyed for this secondary; with no credited
  // killer it scores the lower "unit" tier rather than nothing — 11-combat-patrol §5.3 does not give an exact
  // number for this case and the alternate roster's data does not exist yet (see issues).
  if (unit.location === 'reserves') return unitPoints
  if (unit.location !== 'destroyed' || !unit.destroyedBy) return 0
  // 11-combat-patrol §6: 8 VP if the target is destroyed by ANY unit; 12 only for the Beastboss's own kill, keyed on
  // the killing model (destroyedBy.modelId) with the unitId as a fallback for kills that carry no model attribution
  const warlordUnitId = s.players[pid].warlordUnitId // the Beastboss belongs to the scoring (Ork) player, not the target
  const warlord = s.units[warlordUnitId]
  const beastbossModelId = warlord?.models[0] ?? null
  const byBeastboss = unit.destroyedBy.modelId === beastbossModelId || unit.destroyedBy.unitId === warlordUnitId
  return byBeastboss ? beastbossPoints : unitPoints
}

function customAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  switch (rule.code) {
    case 'wrathOfTheEmperor': return wrathOfTheEmperorAmount(s, rule, pid)
    case 'shockTactics': return shockTacticsAmount(ctx, rule, pid)
    case 'sweepingRaidEndgameBonus': return sweepingRaidBonusAmount(ctx, rule, pid)
    case 'stompEmScore': return stompEmScoreAmount(s, rule, pid)
    case 'properLootin': return properLootinAmount(ctx, rule, pid)
    case 'bagTheBigUnScore': return bagTheBigUnAmount(s, rule, pid)
    default: return 0
  }
}

function computeAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  switch (rule.rule) {
    case 'holdObjectives': {
      const ids = objectiveIdsOf(s, rule)
      const count = ids.filter((id) => holds(ctx, id, pid)).length
      const min = rule.params?.min as number | undefined
      return min !== undefined ? (count >= min ? rule.pointsPer : 0) : count * rule.pointsPer
    }
    case 'holdMore': {
      const ids = objectiveIdsOf(s, rule)
      const mine = ids.filter((id) => holds(ctx, id, pid)).length
      const theirs = ids.filter((id) => holds(ctx, id, otherPlayer(pid))).length
      return mine > theirs ? rule.pointsPer : 0
    }
    case 'holdHome': {
      const home = Object.values(s.objectives).find((o) => o.home === pid)
      return home && holds(ctx, home.id, pid) ? rule.pointsPer : 0
    }
    case 'holdEnemyHome': {
      const home = Object.values(s.objectives).find((o) => o.home === otherPlayer(pid))
      return home && holds(ctx, home.id, pid) ? rule.pointsPer : 0
    }
    case 'holdNamed': {
      const ids = objectiveIdsOf(s, rule)
      return ids.some((id) => holds(ctx, id, pid)) ? rule.pointsPer : 0
    }
    case 'unitsInEnemyZone': {
      const zone = deploymentZone(s, otherPlayer(pid))
      const count = boardUnitsOf(s, pid).filter((u) => unitModels(s, u.id).some((m) => pointInPolygon({ x: m.pos.x, z: m.pos.z }, zone))).length
      return count * rule.pointsPer
    }
    case 'destroyedUnits': return destroyedUnitsAmount(s, rule, pid)
    case 'razedThisTurn': {
      const razed = s.mission.custom.razedThisTurn as { player: PlayerId; round: number } | undefined
      return razed && razed.player === pid && razed.round === s.round ? rule.pointsPer : 0
    }
    case 'claimedSite':
      return Object.values(s.objectives).some((o) => (o as Objective).claimedBy?.player === pid && claimStillValid(ctx, o as Objective)) ? rule.pointsPer : 0
    case 'claimedSiteConsecutive': {
      const turns = (rule.params?.turns as number | undefined) ?? 2
      return Object.values(s.objectives).some((o) => {
        const c = (o as Objective).claimedBy
        return c?.player === pid && claimStillValid(ctx, o as Objective) && s.round - c.sinceTurn + 1 >= turns
      }) ? rule.pointsPer : 0
    }
    case 'custom': return customAmount(ctx, rule, pid)
    default: return 0
  }
}

function runScoring(ctx: EngineContext, window: TimingWindowId): void {
  const s = ctx.state
  for (const pid of ['A', 'B'] as PlayerId[]) {
    const rules = rulesFor(s, pid).filter((r) => applicable(r, pid, window, s) && !(r.rule === 'custom' && r.code && PICK_CODES.has(r.code)))
    const groups = new Map<string, ScoringRule[]>()
    for (const rule of rules) {
      const gid = (rule.params?.capGroup as string | undefined) ?? rule.id
      const arr = groups.get(gid)
      if (arr) arr.push(rule); else groups.set(gid, [rule])
    }
    for (const [gid, grules] of groups) {
      let raw = 0
      for (const rule of grules) raw += computeAmount(ctx, rule, pid)
      const cap = Math.max(...grules.map((r) => r.cap))
      const amount = Math.min(raw, cap)
      if (amount > 0) {
        awardVp(ctx, pid, amount, gid)
        s.mission.scored.push({ ruleId: gid, player: pid, round: s.round, turn: s.activePlayer, amount })
      }
    }
  }
}

// ---------- picks (raise a decision) ----------
function stompEmPickRule(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, key: string): void {
  const s = ctx.state
  const candidates = Object.values(s.units).filter((u) => u.player !== pid && u.location !== 'destroyed')
  if (candidates.length === 0) return
  offerChoice(ctx, pid, rule.when, key, 'stompTarget', candidates.map((u) => ({ id: u.id, label: u.name })), { ruleId: rule.id }, true)
}

function bagPickRule(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, key: string): void {
  const s = ctx.state
  const opp = otherPlayer(pid)
  const big = Object.values(s.units).filter((u) => u.player === opp && u.location !== 'destroyed' && (keywordsOf(s, u.id).includes('MONSTER') || keywordsOf(s, u.id).includes('VEHICLE')))
  const candidates = big.length > 0 ? big : ([s.units[s.players[opp].warlordUnitId]].filter((u): u is Unit => !!u))
  if (candidates.length === 0) return
  offerChoice(ctx, pid, rule.when, key, 'bagTarget', candidates.map((u) => ({ id: u.id, label: u.name })), { ruleId: rule.id }, false)
}

function runPick(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, key: string): void {
  if (rule.code === 'stompEmPick') stompEmPickRule(ctx, rule, pid, key)
  else if (rule.code === 'bagPick') bagPickRule(ctx, rule, pid, key)
}

// ---------- MissionRule (non-scoring) codes ----------
function retrieveIntelligenceRule(ctx: EngineContext, rule: MissionRule, key: string): void {
  const s = ctx.state
  const pid = s.activePlayer
  const p = rule.params ?? {}
  if (s.round < ((p.roundFrom as number | undefined) ?? 1)) return
  const candidates = Object.values(s.objectives).filter((o) => !o.removed && !o.used && controls(ctx, o.id, pid))
  if (candidates.length === 0) return
  offerChoice(ctx, pid, rule.window, key, (p.chooseOptionTopic as ChooseOptionTopic | undefined) ?? 'recoverObjective',
    candidates.map((o) => ({ id: o.id, label: o.id })), { ruleId: rule.id }, true)
}

function razeAndRuinRule(ctx: EngineContext, rule: MissionRule, key: string): void {
  const s = ctx.state
  const pid = s.activePlayer
  const p = rule.params ?? {}
  if (s.round < ((p.roundFrom as number | undefined) ?? 1)) return
  const remaining = Object.values(s.objectives).filter((o) => !o.removed)
  if (remaining.length < ((p.minMarkersRemaining as number | undefined) ?? 2)) return
  const side = s.players[pid].side
  const forbidden = new Set<string>(((side === 'attacker' ? p.forbiddenForAttacker : p.forbiddenForDefender) as string[] | undefined) ?? [])
  const noEnemyWithin = (p.noEnemyWithinInches as number | undefined) ?? 3
  const { radius } = rangeParams(s)
  const candidates = remaining.filter((o) =>
    controls(ctx, o.id, pid) && !forbidden.has(o.id) &&
    !boardUnitsOf(s, otherPlayer(pid)).some((u) => unitModels(s, u.id).some((m) => withinObjectiveRange(m, o, 0, noEnemyWithin, radius))))
  if (candidates.length === 0) return
  offerChoice(ctx, pid, rule.window, key, (p.chooseOptionTopic as ChooseOptionTopic | undefined) ?? 'razeObjective',
    candidates.map((o) => ({ id: o.id, label: o.id })), { ruleId: rule.id }, true)
}

function irradiatedPowerCellsRule(ctx: EngineContext, rule: MissionRule): void {
  const s = ctx.state
  const p = rule.params ?? {}
  const rounds = (p.rounds as number[] | undefined) ?? [3, 4, 5]
  const nmlIds = (p.nmlObjectiveIds as string[] | undefined) ?? []
  if (s.round === rounds[0]) {
    const defender: PlayerId = (Object.values(s.players).find((pl) => pl.side === 'defender')?.id as PlayerId | undefined) ?? 'A'
    s.mission.custom.gammaObjectiveId = pickRandomObjective(ctx, defender, nmlIds)
  } else if (s.round === rounds[1]) {
    const gamma = s.mission.custom.gammaObjectiveId as string | undefined
    removeObjective(ctx, gamma, 'irradiatedPowerCells')
    const attacker: PlayerId = (Object.values(s.players).find((pl) => pl.side === 'attacker')?.id as PlayerId | undefined) ?? 'A'
    const remaining = nmlIds.filter((id) => id !== gamma)
    const beta = pickRandomObjective(ctx, attacker, remaining)
    s.mission.custom.betaObjectiveId = beta
    const last = nmlIds.find((id) => id !== gamma && id !== beta)
    if (last) s.mission.custom.lastNmlObjectiveId = last
  } else if (s.round === rounds[2]) {
    removeObjective(ctx, s.mission.custom.betaObjectiveId as string | undefined, 'irradiatedPowerCells')
  }
}

function sabotageCommsRule(ctx: EngineContext): void {
  const s = ctx.state
  const pid = s.activePlayer
  const oppHome = Object.values(s.objectives).find((o) => o.home === otherPlayer(pid))
  if (!oppHome || oppHome.removed) return
  if (controls(ctx, oppHome.id, pid)) s.players[otherPlayer(pid)].commandRerollLocked = true
}

function supplyLinesRule(ctx: EngineContext, rule: MissionRule): void {
  const s = ctx.state
  const pid = s.activePlayer
  const p = rule.params ?? {}
  const home = Object.values(s.objectives).find((o) => o.home === pid)
  if (!home || home.removed || !controls(ctx, home.id, pid)) return
  const roll = ctx.roll({ purpose: 'mission', player: pid, sides: 6, count: 1, mode: 'sum', commandRerollable: false })
  if (roll.final[0] >= ((p.rollThreshold as number | undefined) ?? 4)) hookService.gainCp(ctx, pid, (p.cpBonus as number | undefined) ?? 1, rule.id)
}

// MISSION-025-leave / -coclaim: is `obj`'s claim still backed by at least one of its claiming models, on the board and
// in range right now? Used at scoring time so a claim whose models all walked away mid-turn cannot score.
function claimStillValid(ctx: EngineContext, obj: Objective): boolean {
  return liveClaimers(ctx.state, obj).length > 0
}

function claimSitesRule(ctx: EngineContext, rule: MissionRule): void {
  const s = ctx.state
  const pid = s.activePlayer
  const siteIds = (rule.params?.siteObjectiveIds as string[] | undefined) ?? []
  const { range, radius } = rangeParams(s)
  for (const id of siteIds) {
    const obj = s.objectives[id] as Objective | undefined
    if (!obj || obj.removed) continue
    // MISSION-025-deadclaimant / -coclaim: first drop any claim (either player's) with no claimer left in range, or
    // rotate it to a surviving co-claimer keeping sinceTurn. MISSION-025-persist: a surviving claim persists whoever
    // controls the site — control is only required to START a claim — and an opponent's live claim blocks a new one.
    pruneClaim(s, obj)
    if (obj.claimedBy) continue
    const chars = boardUnitsOf(s, pid)
      .filter((u) => keywordsOf(s, u.id).includes('CHARACTER'))
      .flatMap((u) => unitModels(s, u.id))
      .filter((m) => withinObjectiveRange(m, obj, 0, range, radius))
    if (chars.length > 0 && liveController(ctx, obj.id) === pid) recordClaim(s, obj, pid, chars.map((m) => m.id))
  }
}

function runMissionRule(ctx: EngineContext, rule: MissionRule, key: string): void {
  switch (rule.code) {
    case 'retrieveIntelligence': retrieveIntelligenceRule(ctx, rule, key); break
    case 'razeAndRuin': razeAndRuinRule(ctx, rule, key); break
    case 'irradiatedPowerCells': irradiatedPowerCellsRule(ctx, rule); break
    case 'sabotageComms': sabotageCommsRule(ctx); break
    case 'supplyLines': supplyLinesRule(ctx, rule); break
    case 'claimSites': claimSitesRule(ctx, rule); break
    // 'breakTheirSpirit' restricts Insane Bravery directly in services.stratagems (reads state.mission.rules) —
    // nothing to do here; the code is only registered in code-hooks.ts for data validation.
    default: break
  }
}

// ---------- occurrence driver (re-entrant: see file header) ----------
function processWindow(ctx: EngineContext, window: TimingWindowId, key: string): void {
  const s = ctx.state
  for (const rule of s.mission.rules) {
    if (rule.window !== window) continue
    if (!once(s, `missionRuleDone:${rule.id}:${key}`)) continue
    runMissionRule(ctx, rule, key)
    if (s.pending) return
  }
  for (const pid of ['A', 'B'] as PlayerId[]) {
    for (const rule of rulesFor(s, pid)) {
      if (!(rule.rule === 'custom' && rule.code && PICK_CODES.has(rule.code))) continue
      if (!applicable(rule, pid, window, s)) continue
      if (!once(s, `pickDone:${rule.id}:${pid}:${key}`)) continue
      runPick(ctx, rule, pid, key)
      if (s.pending) return
    }
  }
  runScoring(ctx, window)
}

function hasForces(state: GameState, player: PlayerId): boolean {
  if (boardUnitsOf(state, player).length > 0) return true
  if (state.round > 3) return false // CP-1.9: Reserves never arrive after round 3
  return Object.values(state.units).some((u) => u.player === player && u.location === 'reserves')
}

// ---------- decision handler (razeObjective / recoverObjective / stompTarget / bagTarget) ----------
function asChoice(action: Action): ChooseOptionAction | { type: 'pass' } | null {
  return action.type === 'chooseOption' || action.type === 'pass' ? action : null
}

function handleRecoverObjective(ctx: EngineContext, action: Action, pending: ChooseOptionDecision): Rejection | void {
  const s = ctx.state
  const a = asChoice(action)
  if (!a) return { code: 'E_NOT_AN_OPTION', reason: 'recoverObjective expects chooseOption or pass' }
  if (a.type === 'pass') return
  const obj = s.objectives[a.optionId]
  if (!obj) return { code: 'E_NOT_AN_OPTION', reason: `objective ${a.optionId} not found` }
  obj.used = true
  const ruleId = (pending.context.data as { ruleId?: string }).ruleId
  const rule = s.mission.rules.find((r) => r.id === ruleId)
  const bonus = (rule?.params?.cpBonusIfWarlordOnBoard as number | undefined) ?? 0
  const warlord = s.units[s.players[pending.player].warlordUnitId]
  if (bonus > 0 && warlord.location === 'board') hookService.gainCp(ctx, pending.player, bonus, rule?.id ?? 'retrieveIntelligence')
}

function handleRazeObjective(ctx: EngineContext, action: Action, pending: ChooseOptionDecision): Rejection | void {
  const s = ctx.state
  const a = asChoice(action)
  if (!a) return { code: 'E_NOT_AN_OPTION', reason: 'razeObjective expects chooseOption or pass' }
  if (a.type === 'pass') return
  const obj = s.objectives[a.optionId]
  if (!obj) return { code: 'E_NOT_AN_OPTION', reason: `objective ${a.optionId} not found` }
  obj.removed = true
  ctx.emit({ type: 'ObjectiveRemoved', objectiveId: obj.id, reason: 'razeAndRuin' })
  s.mission.custom.razedThisTurn = { player: pending.player, round: s.round }
}

function handleStompTarget(ctx: EngineContext, action: Action, pending: ChooseOptionDecision): Rejection | void {
  const a = asChoice(action)
  if (!a) return { code: 'E_NOT_AN_OPTION', reason: 'stompTarget expects chooseOption or pass' }
  if (a.type === 'pass') return
  if (!ctx.state.units[a.optionId]) return { code: 'E_NOT_AN_OPTION', reason: `unit ${a.optionId} not found` }
  ctx.state.players[pending.player].secondaryState.stompTargetUnitId = a.optionId
}

function handleBagTarget(ctx: EngineContext, action: Action, pending: ChooseOptionDecision): Rejection | void {
  if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'bagTarget expects chooseOption' }
  if (!ctx.state.units[action.optionId]) return { code: 'E_NOT_AN_OPTION', reason: `unit ${action.optionId} not found` }
  ctx.state.players[pending.player].secondaryState.bagTargetUnitId = action.optionId
}

export const missionService: MissionService = {
  onWindow(ctx, window, key) {
    processWindow(ctx, window, key)
  },
  playerHasForces: hasForces,
  isTabled(state) { return !hasForces(state, 'A') && !hasForces(state, 'B') },
  finalResult(state, reason) {
    const vp = { A: state.players.A.vp + state.players.A.battleReadyVp, B: state.players.B.vp + state.players.B.battleReadyVp }
    const winner: GameResult['winner'] = vp.A > vp.B ? 'A' : vp.B > vp.A ? 'B' : 'draw'
    return { winner, reason, vp }
  },
  handler: {
    handle(ctx, action, pending) {
      if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'missions: expected chooseOption' }
      const topic = pending.context.topic
      let rej: Rejection | void
      switch (topic) {
        case 'recoverObjective': rej = handleRecoverObjective(ctx, action, pending); break
        case 'razeObjective': rej = handleRazeObjective(ctx, action, pending); break
        case 'stompTarget': rej = handleStompTarget(ctx, action, pending); break
        case 'bagTarget': rej = handleBagTarget(ctx, action, pending); break
        default: return { code: 'E_NOT_AN_OPTION', reason: `missions: no handler for topic ${topic}` }
      }
      if (rej) return rej
      const data = pending.context.data as { window?: TimingWindowId; key?: string }
      if (data.window && data.key !== undefined) processWindow(ctx, data.window, data.key)
    },
  },
}

export type { PendingDecision }
