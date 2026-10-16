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
// State: the picked marker id lives in `players[owner].secondaryState['da:reliquary']`; the charge / shot logs (E1 / E2) live in
// `mission.custom` and are owned by phases/charge.ts / phases/shooting.ts.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, pointInPolygon, withinObjectiveRange } from '../geometry'
import type { AttackContext } from '../hooks'
import { coverMarkKey } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { chargersIntoThisTurn } from '../phases/charge'
import { shotThisTurn } from '../phases/shooting'
import { deploymentZone, keywordsOf, unitModels } from '../state'
import type { GameState, PendingDecision, PlayerId, Rejection, UnitId } from '../types'

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

export function darkAngelsHooks(): Record<string, EngineCodeHook> {
  return { stoicExemplar, marchOfVengeance, relicMunitions, endlessHunt, archeotechReliquaryPick, archeotechReliquaryScore }
}
