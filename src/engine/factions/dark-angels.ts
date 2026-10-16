// Dark Angels engine rules (docs/spec/factions/dark-angels.md section 7): the six (b) code hooks.
// code-hooks.ts registers them through `darkAngelsHooks`, a hoisted factory (the module graph is circular:
// hooks-impl <-> code-hooks <-> phases <-> this file, so nothing here may run at import time).
//
//   stoicExemplar              enhancement: -1 to wound on melee attacks against the bearer's unit once an enemy ended a Charge move
//                              in Engagement Range of it this turn (gate only; the descriptor carries the modifier; E1 charge log)
//   marchOfVengeance           stratagem: after Falling Back the unit may shoot OR charge; charging is closed once it has shot (E2 shot log)
//   relicMunitions             stratagem: the targeted unit gets the Benefit of Cover for the rest of the phase (phase cover mark)
//   endlessHunt                secondary: end of own turn, controlled outside-own-zone marker with a non-Battle-shocked
//                              INTERCESSOR SQUAD unit in range; 5 VP if it is in the opponent's zone, else 3 VP (amount via missions.ts)
//   archeotechReliquaryPick    secondary: round 1 start, the OPPONENT picks a marker (stored on the owner's secondaryState)
//   archeotechReliquaryScore   secondary: battle end, 10 VP when the owner controls the picked marker
//
// The Vengeful Brethren patrol (docs/spec/factions/dark-angels--the-vengeful-brethren.md section 7.1) adds the `vb*` hooks:
//   vbWagesOfRetribution       enhancement: D6 on a 4+ for 1 CP when our army destroys the Oath of Moment target (onUnitDestroyed runAt)
//   vbHuntersOfHeretics        secondary: 5 VP per enemy CHARACTER model our ADEPTUS ASTARTES kill (model-destroyed fan-out, missions.ts)
//   vbHuntersOfHereticsEnd     secondary: +5 VP at battle end when every enemy CHARACTER is destroyed
//   vbTakeTheStrongholdPick    secondary: the OPPONENT picks a marker outside its own deployment zone at Deploy Armies
//   vbTakeTheStrongholdScore   secondary: 5 VP at the end of each of our turns while we control the picked marker
//   vbUnyielding               stratagem: Daemonic Fervour shape (fight-on-death), +1 to the roll for BLADEGUARD VETERAN SQUAD
//   vbBladeguardPick / vbBladeguardStance   ability: a Swords / Shields stance picked at each Fight phase start (phase marks)
//
// State: the picked marker id lives in `players[owner].secondaryState['da:reliquary']`; the charge / shot logs (E1 / E2) live in
// `mission.custom` and are owned by phases/charge.ts / phases/shooting.ts.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { grantFightOnDeath } from '../fight-on-death'
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, pointInPolygon, withinObjectiveRange } from '../geometry'
import type { AttackContext } from '../hooks'
import { coverMarkKey, hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { chargersIntoThisTurn } from '../phases/charge'
import { shotThisTurn } from '../phases/shooting'
import { boardUnitsOf, deploymentZone, keywordsOf, unitModels } from '../state'
import { transportService } from '../transports'
import type { GameState, ModelId, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined

export const RELIQUARY_KEY = 'da:reliquary'
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })

function onBoard(s: GameState, id: UnitId | undefined) {
  const u = id ? s.units[id] : undefined
  return u && u.location === 'board' ? u : null
}

// ---------- Stoic Exemplar (DAR-3.1) ----------
const stoicExemplar: EngineCodeHook = {
  name: 'stoicExemplar', kind: 'ability', hook: 'onWoundRoll', run: noop,
  gateEffect(state, holder, entry, data) {
    const attack = data?.attack as AttackContext | undefined
    if (!attack || attack.kind !== 'melee') return false
    const bearerModel = entry.bearerModelId ? state.models[entry.bearerModelId] : undefined
    const bearerUnit = bearerModel?.unitId ?? entry.holderUnitId ?? holder?.id
    const bearer = bearerUnit ? state.units[bearerUnit] : undefined
    if (!bearer || !leaderService.sameUnit(state, attack.targetUnitId, bearerUnit)) return false
    return chargersIntoThisTurn(state, bearerUnit).some((c) => !!state.units[c] && state.units[c].player !== bearer.player)
  },
}

// ---------- March of Vengeance (DAR-5.2) ----------
const marchOfVengeance: EngineCodeHook = {
  name: 'marchOfVengeance', kind: 'stratagem', hook: 'onEligibility', run: noop,
  check(env: StratagemEnv, t: StratagemTuple): boolean {
    const s = env.state
    const target = onBoard(s, t.ids[0])
    if (!target || target.player !== env.player || s.activePlayer !== env.player) return false
    return leaderService.halves(s, target.id).some((id) => s.units[id]?.turn.moveType === 'fallBack')
  },
  // "either shoot or charge, not both": both doors are opened, the charge door closes once the unit has been selected to shoot
  gateEffect(state, holder, _entry, data) {
    if (data?.check === 'charge') return !shotThisTurn(state, holder.id)
    return true
  },
}

// ---------- Relic Munitions (DAR-5.3) ----------
const relicMunitions: EngineCodeHook = {
  name: 'relicMunitions', kind: 'stratagem', hook: 'onTargetsDeclared', run: noop,
  check(env: StratagemEnv, t: StratagemTuple): boolean {
    const target = onBoard(env.state, t.ids[0])
    return env.state.phase === 'shooting' && !!target && target.player === env.player
  },
  apply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
    const s = ctx.state
    const unit = s.units[t.ids[0]]
    if (!unit) return
    s.phaseState.marks.push(coverMarkKey(leaderService.canonicalUnitId(s, unit.id)))
    ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: unit.id, targetUnitId: null, summary: `Relic Munitions: ${unit.name} has the Benefit of Cover`, player: env.player })
  },
}

// ---------- Endless Hunt (DAR-4.1) ----------
// `controls(id)` answers "does pid control this marker right now" (missions.ts live control). Mordekai's half counts for the
// attached unit: the unit qualifies as a whole when ANY half carries the keyword and NO half is Battle-shocked.
export function endlessHuntAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, controls: (objectiveId: string) => boolean): number {
  const s = ctx.state
  const keyword = (rule.params?.keyword as string | undefined) ?? 'INTERCESSOR SQUAD'
  const enemyPoints = (rule.params?.enemyZonePoints as number | undefined) ?? 5
  const range = s.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const own = deploymentZone(s, pid)
  const enemy = deploymentZone(s, other(pid))
  const seen = new Set<UnitId>()
  const qualifying: UnitId[][] = []
  for (const u of Object.values(s.units)) {
    if (u.player !== pid || u.location !== 'board') continue
    const canon = leaderService.canonicalUnitId(s, u.id)
    if (seen.has(canon)) continue
    seen.add(canon)
    const halves = leaderService.halves(s, canon).filter((h) => s.units[h]?.location === 'board')
    if (halves.length === 0) continue
    if (!halves.some((h) => keywordsOf(s, h).includes(keyword))) continue
    if (halves.some((h) => s.units[h].battleShocked)) continue
    qualifying.push(halves)
  }
  let best = 0
  for (const obj of Object.values(s.objectives)) {
    if (obj.removed || pointInPolygon(obj.pos, own) || !controls(obj.id)) continue
    const inRange = qualifying.some((halves) => halves.some((h) => unitModels(s, h).some((m) => withinObjectiveRange(m, obj, 0, range, radius))))
    if (!inRange) continue
    best = Math.max(best, pointInPolygon(obj.pos, enemy) ? enemyPoints : rule.pointsPer)
  }
  return best
}

const endlessHunt: EngineCodeHook = { name: 'endlessHunt', kind: 'mission', hook: 'onTurnEnd', run: noop }

// ---------- Archeotech Reliquary (DAR-4.2) ----------
// the OPPONENT of the secondary's owner picks any live objective marker
export function archeotechReliquaryOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string): void {
  const s = ctx.state
  const picker = other(owner)
  const live = Object.values(s.objectives).filter((o) => !o.removed)
  if (live.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: picker, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { window, key, code: 'archeotechReliquaryPick', owner } },
    options: live.map((o) => ({ id: o.id, label: `Archeotech Reliquary: marker ${o.tag ?? o.id}`, action: optionAction(picker, o.id), hint: { objectiveId: o.id } })),
  })
}

function answerReliquary(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Archeotech Reliquary expects chooseOption' }
  const s = ctx.state
  const obj = s.objectives[action.optionId]
  if (!obj || obj.removed) return { code: 'E_INVALID_TARGET', reason: 'pick an objective marker that is still on the battlefield' }
  const owner = ((pending.context.data as { owner?: PlayerId }).owner ?? other(pending.player)) as PlayerId
  s.players[owner].secondaryState[RELIQUARY_KEY] = obj.id
  ctx.emit({ type: 'AbilityTriggered', abilityId: 'da.sec.archeotech-reliquary', sourceUnitId: null, targetUnitId: null, summary: `Archeotech Reliquary: marker ${obj.tag ?? obj.id} is the relic site`, player: owner })
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// battle end: pointsPer (10) when the stored marker is still on the table and the owner controls it
export function archeotechReliquaryAmount(s: GameState, rule: { pointsPer: number }, pid: PlayerId, holds: (objectiveId: string) => boolean): number {
  const id = s.players[pid].secondaryState[RELIQUARY_KEY] as string | undefined
  const obj = id ? s.objectives[id] : undefined
  if (!id || !obj || obj.removed) return 0
  return holds(id) ? rule.pointsPer : 0
}

const archeotechReliquaryPick: EngineCodeHook = { name: 'archeotechReliquaryPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerReliquary }
const archeotechReliquaryScore: EngineCodeHook = { name: 'archeotechReliquaryScore', kind: 'mission', hook: 'onPhaseEnd', run: noop }


// ======================================================================================================================
// The Vengeful Brethren (DAV-x)
// ======================================================================================================================
export const VB_STRONGHOLD_KEY = 'da:stronghold'
const ASTARTES = 'ADEPTUS ASTARTES'

function scoringRulesFor(s: GameState, pid: PlayerId): ScoringRule[] {
  return [...s.mission.scoring, ...(s.mission.secondaries[pid] ?? [])]
}

function awardVp(ctx: EngineContext, pid: PlayerId, amount: number, source: string): void {
  const p = ctx.state.players[pid]
  p.vp += amount
  p.vpBySource[source] = (p.vpBySource[source] ?? 0) + amount
  ctx.emit({ type: 'VpScored', source, amount, total: p.vp, player: pid })
}

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  const ds = s.datasheets[unit.datasheetId]
  return ds?.abilities.find((id) => s.abilities[id]?.code === code) ?? null
}

// ---------- Wages of Retribution (DAV-3.2) ----------
// runs at onUnitDestroyed (before the leader/bodyguard split), so an attached Oath target still resolves through sameUnit
export function vbWagesOfRetributionRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void {
  const s = ctx.state
  const holder = s.units[entry.holderUnitId]
  if (!holder || holder.location !== 'board') return
  if (!entry.bearerModelId || !holder.models.includes(entry.bearerModelId) || !s.models[entry.bearerModelId]) return
  const destroyedId = data.destroyedUnitId as UnitId | undefined
  const destroyed = destroyedId ? s.units[destroyedId] : undefined
  if (!destroyed || destroyed.player === holder.player) return
  const oath = s.players[holder.player].oathTargetUnitId
  if (!oath || !leaderService.sameUnit(s, oath, destroyed.id)) return
  const killerId = data.byUnitId as UnitId | null | undefined
  const killer = killerId ? s.units[killerId] : undefined
  if (!killer || killer.player !== holder.player || !keywordsOf(s, killer.id).includes(ASTARTES)) return
  const threshold = (entry.params.threshold as number | undefined) ?? 4
  const cp = (entry.params.cp as number | undefined) ?? 1
  const total = ctx.rollExpr('D6', { purpose: 'ability', player: holder.player, unitId: holder.id, commandRerollable: false }).total
  ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: destroyed.id, summary: `Wages of Retribution: rolled ${total}`, player: holder.player })
  if (total >= threshold) hookService.gainCp(ctx, holder.player, cp, entry.source.id)
}

const vbWagesOfRetribution: EngineCodeHook = {
  name: 'vbWagesOfRetribution', kind: 'ability', hook: 'onUnitDestroyed', run: noop,
  runAt: vbWagesOfRetributionRun,
}

// ---------- Hunters of Heretics (DAV-4.1) ----------
// event-driven: called from missionService.modelDestroyed for every model removed from the table
export function vbHuntersOfHereticsModelDestroyed(
  ctx: EngineContext,
  info: { unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null },
): void {
  const s = ctx.state
  const killer = info.byUnitId ? s.units[info.byUnitId] : undefined
  const pid = info.byPlayer ?? killer?.player ?? null
  if (!pid || !killer || killer.player !== pid) return
  const rule = scoringRulesFor(s, pid).find((r) => r.rule === 'custom' && r.code === 'vbHuntersOfHeretics' && s.round >= r.rounds.from && s.round <= r.rounds.to)
  if (!rule) return
  const victim = s.units[info.unitId]
  if (!victim || victim.player === pid) return
  const keyword = (rule.params?.keyword as string | undefined) ?? 'CHARACTER'
  if (!s.datasheets[victim.datasheetId]?.keywords.includes(keyword)) return
  const killerKeyword = (rule.params?.killerFactionKeyword as string | undefined) ?? ASTARTES
  if (!keywordsOf(s, killer.id).includes(killerKeyword)) return
  const amount = Math.min(rule.pointsPer, rule.cap - (s.players[pid].vpBySource[rule.id] ?? 0))
  if (amount <= 0) return
  awardVp(ctx, pid, amount, rule.id)
  s.mission.scored.push({ ruleId: rule.id, player: pid, round: s.round, turn: s.activePlayer, amount })
}

// a unit still in the fight: on the battlefield, or embarked in a transport (stored as Reserves)
function unitStillAlive(s: GameState, u: Unit): boolean {
  if (u.models.length === 0) return false
  if (u.location === 'board') return true
  return u.location === 'reserves' && transportService.transportOf(s, u.id) !== null
}

// battle end: pointsPer when every enemy CHARACTER is destroyed (Reserves that never arrived count as destroyed, R-5.16);
// an enemy army with no CHARACTER at all scores 0 (DAV-4.1b)
export function vbHuntersOfHereticsEndAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const keyword = (rule.params?.keyword as string | undefined) ?? 'CHARACTER'
  const heroes = Object.values(s.units).filter((u) => u.player !== pid && s.datasheets[u.datasheetId]?.keywords.includes(keyword))
  if (heroes.length === 0) return 0
  return heroes.some((u) => unitStillAlive(s, u)) ? 0 : rule.pointsPer
}

const missionHook = (name: string, hook: EngineCodeHook['hook']): EngineCodeHook => ({ name, kind: 'mission', hook, run: noop })

// ---------- Take the Stronghold (DAV-4.2) ----------
function strongholdCandidates(s: GameState, picker: PlayerId): string[] {
  const zone = deploymentZone(s, picker)
  return Object.values(s.objectives)
    .filter((o) => !o.removed && !pointInPolygon({ x: o.pos.x, z: o.pos.z }, zone))
    .map((o) => o.id)
    .sort()
}

// the Deploy Armies pick window: the OPPONENT of the secondary's owner names a marker outside the opponent's own zone
export function vbTakeTheStrongholdOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string): void {
  const s = ctx.state
  const picker = other(owner)
  const ids = strongholdCandidates(s, picker)
  if (ids.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: picker, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { window, key, code: 'vbTakeTheStrongholdPick', owner } },
    options: ids.map((id) => ({ id, label: `Take the Stronghold: marker ${s.objectives[id].tag ?? id}`, action: optionAction(picker, id), hint: { objectiveId: id } })),
  })
}

export function vbTakeTheStrongholdAnswer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Take the Stronghold expects chooseOption' }
  const s = ctx.state
  const owner = ((pending.context.data as { owner?: PlayerId }).owner ?? other(pending.player)) as PlayerId
  if (!strongholdCandidates(s, other(owner)).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an objective marker outside your own deployment zone' }
  s.players[owner].secondaryState[VB_STRONGHOLD_KEY] = action.optionId
  const obj = s.objectives[action.optionId]
  ctx.emit({ type: 'AbilityTriggered', abilityId: 'da.sec.take-the-stronghold', sourceUnitId: null, targetUnitId: null, summary: `Take the Stronghold: marker ${obj.tag ?? obj.id} chosen by the opponent`, player: owner })
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// pointsPer when the stored marker is still on the table and `holds(id)` (the player controls it)
export function vbTakeTheStrongholdAmount(s: GameState, rule: ScoringRule, pid: PlayerId, holds: (objectiveId: string) => boolean): number {
  const id = s.players[pid].secondaryState[VB_STRONGHOLD_KEY] as string | undefined
  const obj = id ? s.objectives[id] : undefined
  if (!id || !obj || obj.removed) return 0
  return holds(id) ? rule.pointsPer : 0
}

const vbTakeTheStrongholdPick: EngineCodeHook = { name: 'vbTakeTheStrongholdPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: vbTakeTheStrongholdAnswer }

// ---------- Unyielding (DAV-5.1) ----------
const vbUnyielding: EngineCodeHook = {
  name: 'vbUnyielding', kind: 'stratagem', hook: 'onTargetsDeclared', run: noop,
  check(env, t) {
    const { state } = env
    if (state.phase !== 'fight' || !t.ids[0]) return false
    const fight = state.phaseState.fight
    return !leaderService.halves(state, t.ids[0]).some((h) => state.units[h].turn.foughtThisPhase || fight?.fought.includes(h) || fight?.currentUnitId === h)
  },
  apply(ctx, env, t) {
    const s = ctx.state
    const base = (env.stratagem.params?.threshold as number | undefined) ?? 4
    const bonusKeyword = env.stratagem.params?.bonusKeyword as string | undefined
    const bonus = !!bonusKeyword && leaderService.halves(s, t.ids[0]).some((h) => hookService.keywordsFor(s, h).includes(bonusKeyword))
    const threshold = bonus ? base - 1 : base
    const unitId = leaderService.canonicalUnitId(s, t.ids[0])
    grantFightOnDeath(s, unitId, threshold)
    ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: unitId, targetUnitId: null, summary: `Unyielding: models fight on a ${threshold}+`, player: env.player })
  },
}

// ---------- Bladeguard stances (DAV-6.3) ----------
const BG_PICK_CODE = 'vbBladeguardPick'
export const BG_STANCES = ['swords', 'shields'] as const
type BgStance = (typeof BG_STANCES)[number]
const bgMark = (unitId: UnitId, stance: BgStance) => `vbBladeguard:${unitId}=${stance}`

// the stance chosen for this unit this phase, or null
export function bladeguardStance(s: GameState, unitId: UnitId): BgStance | null {
  const canon = leaderService.canonicalUnitId(s, unitId)
  return BG_STANCES.find((st) => s.phaseState.marks.includes(bgMark(canon, st))) ?? null
}

export function vbBladeguardOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (window !== 'fight.start') return false
  for (const player of [s.activePlayer, other(s.activePlayer)] as PlayerId[]) {
    const seen = new Set<UnitId>()
    for (const u of boardUnitsOf(s, player)) {
      if (u.models.length === 0) continue
      const canon = leaderService.canonicalUnitId(s, u.id)
      if (seen.has(canon)) continue
      seen.add(canon)
      const abilityId = leaderService.halves(s, canon).map((h) => s.units[h]).filter((h): h is Unit => !!h && h.location === 'board')
        .map((h) => abilityIdWithCode(s, h, BG_PICK_CODE)).find((a) => a)
      if (!abilityId) continue
      const mark = `pick:vbBladeguard:${canon}`
      if (s.phaseState.marks.includes(mark)) continue
      s.phaseState.marks.push(mark)
      ctx.decide({
        kind: 'chooseOption', player, window, canPass: true,
        context: { topic: 'abilityChoice', unitId: canon, abilityId, data: { window, key, code: BG_PICK_CODE } },
        options: [
          { id: 'swords', label: 'Swords of the Chapter: re-roll Hit rolls of 1 in melee', action: optionAction(player, 'swords'), hint: { unitId: canon } },
          { id: 'shields', label: 'Shields of the Chapter: re-roll invulnerable saves of 1', action: optionAction(player, 'shields'), hint: { unitId: canon } },
          { id: 'decline', label: 'No stance this phase', action: optionAction(player, 'decline'), hint: { unitId: canon } },
        ],
      })
      return true
    }
  }
  return false
}

export function vbBladeguardHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Bladeguard expects chooseOption' }
  if (action.type === 'pass') return
  if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Bladeguard expects chooseOption' }
  if (action.optionId === 'decline') return
  const stance = action.optionId as BgStance
  if (!BG_STANCES.includes(stance)) return { code: 'E_NOT_AN_OPTION', reason: 'Bladeguard: swords, shields or decline' }
  const s = ctx.state
  const unitId = pending.context.unitId
  const unit = unitId ? s.units[unitId] : undefined
  if (!unit || !unitId) return { code: 'E_NOT_AN_OPTION', reason: 'Bladeguard: the unit is no longer on the battlefield' }
  if (bladeguardStance(s, unitId)) return { code: 'E_NOT_AN_OPTION', reason: 'Bladeguard: a stance is already chosen this phase' }
  s.phaseState.marks.push(bgMark(unitId, stance))
  ctx.emit({
    type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? 'da.a.vb-bladeguard', sourceUnitId: unitId, targetUnitId: null, player: pending.player,
    summary: `Bladeguard: ${unit.name} adopts ${stance === 'swords' ? 'Swords' : 'Shields'} of the Chapter`,
  })
}

const vbBladeguardPick: EngineCodeHook = {
  name: BG_PICK_CODE, kind: 'ability', hook: 'onPhaseStart', run: noop,
  // the pick descriptor carries no effects of its own
  pick: { window: 'fight.start', topic: 'abilityChoice', offer: (ctx, w, k) => vbBladeguardOffer(ctx, w, k), handle: (ctx, a, p) => vbBladeguardHandle(ctx, a, p) },
}

// gate for the two stance descriptors (onHitRoll / onSaveRoll). Swords' melee limit is the descriptor's own `when`;
// Shields counts invulnerable saves only (engine E1: the onSaveRoll data carries `saveKind`)
const vbBladeguardStance: EngineCodeHook = {
  name: 'vbBladeguardStance', kind: 'ability', hook: 'onHitRoll', run: noop,
  gateEffect(state, holder, entry, data) {
    const want = entry.params.stance as BgStance | undefined
    if (!want || bladeguardStance(state, holder.id) !== want) return false
    if (entry.params.invulnOnly && data?.saveKind !== 'invuln') return false
    return true
  },
}

export function darkAngelsHooks(): Record<string, EngineCodeHook> {
  return {
    stoicExemplar, marchOfVengeance, relicMunitions, endlessHunt, archeotechReliquaryPick, archeotechReliquaryScore,
    vbWagesOfRetribution,
    vbHuntersOfHeretics: missionHook('vbHuntersOfHeretics', 'onModelDestroyed'),
    vbHuntersOfHereticsEnd: missionHook('vbHuntersOfHereticsEnd', 'onPhaseEnd'),
    vbTakeTheStrongholdPick,
    vbTakeTheStrongholdScore: missionHook('vbTakeTheStrongholdScore', 'onTurnEnd'),
    vbUnyielding, vbBladeguardPick, vbBladeguardStance,
  }
}
