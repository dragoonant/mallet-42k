// Movement phase module (10-rules §5). Owner: W1-C. Steps: 'select' → 'declare' → 'move' (per unit) → 'reinforcements'.
//
// Per-unit sequence (R-5.1, MOVE-036): chooseUnitToActivate → declareMove (rolls the Advance die via ctx.rollOnce,
// so Command Re-roll applies) → window `movement.moveStarted` (opponent: Fire Overwatch) → moveUnit (placements;
// Fall Back's Desperate Escape is resolved here, after the window, before positions are actually applied — R-5.6
// [interp]: the crossing set is taken from the submitted paths) → window `movement.unitMoved`.
// Reinforcements (R-5.11–R-5.14): Deep Strike arrivals for round 2–3, Tellyporta pairing (Unit.deepStrikeWith,
// arrive together within 3"), end-of-round-3 destruction of anything still in Reserves, then `movement.end` for
// Rapid Ingress (pendingReactions consumed the same way as an ordinary arrival).
//
// Fire Overwatch / Rapid Ingress are stratagems (owned by W1-F, stratagems.ts + code-hooks.ts): they already do
// legality and CP spend and leave a `pendingReactions` request for the phase module to execute. Overwatch needs the
// full attack sequence (services.attack, owned by W1-D and a stub at the time of writing) — this module declares
// every ranged weapon of the reacting unit at the mover [interp: Overwatch does not offer a declareTargets choice]
// and drains `services.attack.advance` exactly like the Shooting phase would; any allocateAttack/saveType/etc.
// decision it raises mid-movement-phase is delegated to `attackService.handler`.
//
// Surge moves (R-5.9, e.g. Krump da Gitz!) are entirely handled by stratagems.ts (roll, flag, pushReaction) at a
// *Shooting*-phase window (`shooting.attacksResolved`) — out of this module's reach; see `resolveSurgeMove` below,
// exported for whichever module ends up draining `pendingReactions(state, 'surge')`.
//
// Transports (R-5.17–R-5.20): no Combat Patrol datasheet has one, so embark/disembark are implemented in
// transports.ts as bookkeeping + legality predicates only — not wired into an interactive decision here. See issues.
import { centroid, filterValid, formationPlacements, optionActions, repairCoherency, translatePlacements, unitVector } from './legal'
import { battlefieldEdgeStrip, dist2D } from '../geometry'
import { rollSum } from '../dice'
import {
  EPS, anyWithinEngagementRange, checkPlacements, emptyMoveConstraints, horizontalGap, isCoherent,
  pathCrossesModels, pathEntersEngagement, pivotCost as pivotCostFor, samplePath, whollyOnBoard,
  type Footprint, type ResolvedPlacement,
} from '../geometry'
import type { TimingWindowId } from '../../data/types'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import { pendingReactions, consumeReaction } from '../code-hooks'
import {
  CULT_AMBUSH_MARKER_RADIUS, CULT_AMBUSH_REACTION_KIND, cultAmbushArrivalPlacements, cultAmbushOnMoveEnded, cultAmbushReactionMarker, cultAmbushReturnStep,
  pendingCultAmbushReactions,
} from '../cult-ambush'
import { attackService } from '../attack'
import { weaponService } from '../weapons'
import { terrainService } from '../terrain'
import { transportService } from '../transports'
import { clearTeleport, destroyTeleportingUnit, isTeleporting } from '../teleport'
import { notImplementedHandle, otherPlayer, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import {
  boardModelsOf, boardUnitsOf, datasheetOf, deploymentZone, enemyModelsOnBoard, hasKeyword, keywordsOf, modelStats, removeModel,
  setModelPos, unitModels, unitModelsForCoherency,
} from '../state'
import { autoDeployPlacements } from '../setup'
import type { Action, ModelPlacement } from '../actions'
import {
  EngineInvariantError, type DiceRoll,
  type DeclaredTarget, type GameState, type Model, type ModelId, type MoveConstraints,
  type MoveType, type PendingDecision, type PlayerId, type Polygon, type Rejection, type UnitId, type Vec3,
} from '../types'

// ---------- single-value progress markers (phaseState.marks; reset every time the phase is entered) ----------
function readMark(state: GameState, key: string): string | null {
  const prefix = `${key}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}
function writeMark(state: GameState, key: string, value: string | null): void {
  const prefix = `${key}=`
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  if (value !== null) state.phaseState.marks.push(prefix + value)
}

function setMoveType(state: GameState, unitId: UnitId, mt: MoveType): void {
  for (const id of leaderService.halves(state, unitId)) state.units[id].turn.moveType = mt
}
// E4 (Adeptus Custodes Overawing Magnificence): which opposing unit pairs were in Engagement Range when the Movement
// phase began — marks `erAtStart:<a>|<b>` (canonical ids, a < b), so "was within Engagement Range of that unit at the
// start of the phase" can still be answered after the mover has fallen back
function canonicalUnitId(state: GameState, unitId: UnitId): UnitId {
  return state.units[unitId]?.bodyguardUnitId ?? unitId
}
export function snapshotEngagementAtMovementStart(state: GameState): void {
  const units = [...boardUnitsOf(state, 'A'), ...boardUnitsOf(state, 'B')].filter((u) => !u.bodyguardUnitId)
  for (const a of units) {
    for (const b of units) {
      if (a.player === b.player || a.id >= b.id) continue
      if (leaderService.unitsInEngagement(state, a.id, b.id)) state.phaseState.marks.push(`erAtStart:${a.id}|${b.id}`)
    }
  }
}
export function engagedAtMovementStart(state: GameState, unitA: UnitId, unitB: UnitId): boolean {
  const a = canonicalUnitId(state, unitA)
  const b = canonicalUnitId(state, unitB)
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return state.phaseState.marks.includes(`erAtStart:${lo}|${hi}`)
}

// E3 (Auramite Thunderbolt): re-roll kinds the unit's abilities offer on its Advance roll (mirror of the Charge roll's)
export function collectAdvanceRerollKinds(ctx: EngineContext, unitId: UnitId, roll: DiceRoll): Set<'ones' | 'fails' | 'all' | 'oneDie'> {
  const results = ctx.services.hooks.collect(ctx, 'onAdvanceRoll', {
    movingUnitId: unitId,
    roll: { purpose: 'advance', roll, dieIndex: 0, unmodified: rollSum(roll), rerolled: (roll.rerolled ?? []).length > 0 },
  })
  const kinds = new Set<'ones' | 'fails' | 'all' | 'oneDie'>()
  for (const r of results) if (r.result.kind === 'roll' && r.result.reroll) kinds.add(r.result.reroll as 'ones' | 'fails' | 'all' | 'oneDie')
  return kinds
}

function setAdvanceRoll(state: GameState, unitId: UnitId, roll: number): void {
  for (const id of leaderService.halves(state, unitId)) state.units[id].turn.advanceRoll = roll
}

function boardPolygon(state: GameState): Polygon {
  const hw = state.board.w / 2, hh = state.board.h / 2
  return [{ x: -hw, z: -hh }, { x: hw, z: -hh }, { x: hw, z: hh }, { x: -hw, z: hh }]
}

// same identity check the reducer's generic option-membership validation performs (defaultValidate in reducer.ts) —
// duplicated here because supplying a custom `validate` for moveUnit/deployUnit opts this module out of that helper
// for every decision kind it validates, not just those two.
function actionKey(a: Action): string {
  const { seq: _s, decisionId: _d, player: _p, ...rest } = a as Action & { seq?: number }
  return JSON.stringify(rest, Object.keys(rest).sort())
}
function optionCheck(pending: PendingDecision, action: Action): Rejection | null {
  if (action.type === 'pass') return null
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  if (action.type === 'chooseOption') {
    return pending.options.some((o) => o.id === action.optionId) ? null : { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  }
  const key = actionKey(action)
  return pending.options.some((o) => actionKey(o.action) === key) ? null : { code: 'E_NOT_AN_OPTION', reason: 'answer is not one of the offered options' }
}

// ---------- movement allowance / constraints ----------
function friendlyOthers(state: GameState, unitId: UnitId): Model[] {
  const mine = new Set(leaderService.halves(state, unitId))
  const out: Model[] = []
  for (const u of boardUnitsOf(state, state.units[unitId].player)) if (!mine.has(u.id)) out.push(...unitModels(state, u.id))
  return out
}

function moveAllowance(state: GameState, unitId: UnitId): { perModel: Record<ModelId, number>; fly: boolean; pivot: number } {
  const models = unitModelsForCoherency(state, unitId)
  const unit = state.units[unitId]
  const bonus = unit.turn.moveType === 'advance' ? unit.turn.advanceRoll ?? 0 : 0
  const perModel: Record<ModelId, number> = {}
  for (const m of models) {
    const base = modelStats(state, m).M
    perModel[m.id] = hookService.statFor(state, { unitId: m.unitId, modelId: m.id, weapon: null, stat: 'M' }, base) + bonus
  }
  const fly = models.some((m) => hasKeyword(state, m.unitId, 'FLY'))
  const pivot = models[0] ? pivotCostFor(models[0].base, keywordsOf(state, models[0].unitId)) : 0
  return { perModel, fly, pivot }
}

function buildMoveConstraints(state: GameState, unitId: UnitId, moveType: MoveType): MoveConstraints {
  const { perModel } = moveAllowance(state, unitId)
  const max = Object.values(perModel).reduce((a, b) => Math.max(a, b), 0)
  // MOVE-019-er: only a Charge move may end within Engagement Range (R-2.4, R-5.8) — Normal/Advance/Fall Back never
  // may, FLY included (FLY only exempts *crossing* enemies mid-path, not the end point).
  return emptyMoveConstraints(max, { perModel, mustEndOutsideEngagement: true, coherency: true })
}

// shared by validate() and doMove(): checkPlacements plus terrain and mid-path engagement/crossing rules that
// checkPlacements documents as "the caller's responsibility". `opts.skipCoherency` is for doMove's post-Desperate-
// Escape re-validation of already-submitted placements (MOVE-011-coherency): a casualty chosen after submission may
// break coherency of the remaining models, which is not a re-validation failure — R-2.6's end-of-turn coherency cull
// (owned elsewhere) is what actually enforces coherency once casualties are done being picked.
function resolveMove(state: GameState, unitId: UnitId, moveType: MoveType, placements: ModelPlacement[], opts: { skipCoherency?: boolean; distance?: number; allowEngaged?: boolean } = {}):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const models = unitModelsForCoherency(state, unitId)
  const allowance = moveAllowance(state, unitId)
  const { pivot } = allowance
  // a reactive move (Skulking Horrors) is capped at the rolled distance instead of the unit's Move characteristic
  const perModel = opts.distance === undefined ? allowance.perModel : Object.fromEntries(models.map((m) => [m.id, opts.distance as number]))
  const enemies = enemyModelsOnBoard(state, state.units[unitId].player)
  const otherFriendly = friendlyOthers(state, unitId)
  const max = Object.values(perModel).reduce((a, b) => Math.max(a, b), 0)
  const constraints = emptyMoveConstraints(max, { perModel, mustEndOutsideEngagement: !opts.allowEngaged, coherency: !opts.skipCoherency })
  // MOVE-019-mixedfly: FLY is a per-model property (an attached unit may mix FLY and non-FLY models). Mid-path
  // exemptions (crossing enemies / entering ER) are decided per model in checkPaths. checkPlacements takes a single
  // flag for path *measurement*, so straight-line 3D measurement is used only when every model has FLY [interp: a
  // FLY model in a mixed unit is measured like its non-FLY unit-mates — never more permissive than R-5.7/R-5.8].
  const flyOf = (m: Model): boolean => hasKeyword(state, m.unitId, 'FLY')
  const allFly = models.length > 0 && models.every(flyOf)
  const result = checkPlacements({ unitModels: models, placements, constraints, otherFriendly, enemies, board: state.board, pivotCost: pivot, fly: allFly })
  if (result.rejection) return result
  return checkPaths(state, moveType, result, enemies, otherFriendly, flyOf)
}

// the per-model path rules checkPlacements leaves to the caller (R-5.2, R-5.5, R-5.7, R-5.8)
// W1-G [interp R-2.6]: a unit that is ALREADY out of coherency (casualties mid-turn, e.g. Fire Overwatch at
// movement.moveStarted) and moves no model at all may end its move as it stands — otherwise a declared Normal/Advance
// move could have no legal answer at all. The end-of-turn coherency cull (R-2.6) resolves it. Any placement that
// actually moves a model still has to end coherent.
function moveRejection(state: GameState, unitId: UnitId, moveType: MoveType, placements: ModelPlacement[], distance?: number): Rejection | null {
  const r = resolveMove(state, unitId, moveType, placements, distance === undefined ? {} : { distance })
  if (r.rejection?.code !== 'E_COHERENCY') return r.rejection
  const models = unitModelsForCoherency(state, unitId)
  const stays = placements.every((p) => {
    const m = models.find((x) => x.id === p.modelId)
    return m !== undefined && Math.hypot(p.pos.x - m.pos.x, p.pos.y - m.pos.y, p.pos.z - m.pos.z) <= 1e-3
  })
  if (!stays || isCoherent(models)) return r.rejection
  return resolveMove(state, unitId, moveType, placements, { skipCoherency: true, ...(distance === undefined ? {} : { distance }) }).rejection
}

// ---------- Reactive Normal move (Tyranid Skulking Horrors, docs/spec/factions/tyranids.md 7.1 item 4) ----------
const REACTIVE_KEY = 'mv:reactive'
interface ReactiveMove { unitId: UnitId; distance: number; source: string }
function readReactive(state: GameState): ReactiveMove | null {
  const raw = readMark(state, REACTIVE_KEY)
  return raw === null ? null : (JSON.parse(raw) as ReactiveMove)
}

// opens a moveUnit decision {moveType:'normal'} for the unit's owner (the non-active player) with maxDistance = distance and
// Normal-move constraints; the interrupted activation resumes afterwards (phase marks keep its place); never writes
// unit.turn.moveType. The owner may also pass (stay put).
// C6: `window` is the timing window the decision is raised under (default 'movement.unitMoved'; T'au Rapid Repositioning: 'phase.end').
export function startReactiveMove(ctx: EngineContext, unitId: UnitId, distance: number, source: string, window: TimingWindowId = 'movement.unitMoved'): void {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit || unit.location !== 'board' || !(distance > 0)) return
  writeMark(s, REACTIVE_KEY, JSON.stringify({ unitId, distance, source } satisfies ReactiveMove))
  const perModel: Record<ModelId, number> = Object.fromEntries(unitModelsForCoherency(s, unitId).map((m) => [m.id, distance]))
  ctx.decide({
    kind: 'moveUnit', player: unit.player, window, canPass: true,
    context: { unitId, moveType: 'normal', advanceRoll: null },
    constraints: emptyMoveConstraints(distance, { perModel, mustEndOutsideEngagement: true, coherency: true }),
  })
}

// C6: legal actions for a reactive move decision, or null when the pending decision is not one (callers fall through)
export function reactiveMoveLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind !== 'moveUnit') return null
  const rv = readReactive(state)
  return rv && rv.unitId === pending.context.unitId ? reactiveCandidates(state, pending, rv) : null
}

// C6: validation of a reactive move answer; undefined when the pending decision is not a reactive move
export function validateReactiveMove(state: GameState, action: Action, pending: PendingDecision): Rejection | null | undefined {
  if (pending.kind !== 'moveUnit') return undefined
  const rv = readReactive(state)
  if (!rv || rv.unitId !== pending.context.unitId) return undefined
  if (action.type !== 'moveUnit') return null
  if (action.unitId !== rv.unitId) return { code: 'E_INVALID_TARGET', reason: 'placements are for the wrong unit', details: { expected: rv.unitId } }
  return moveRejection(state, rv.unitId, 'normal', action.placements, rv.distance)
}

// C6: applies a reactive move answer (the interrupted activation and unit.turn.moveType stay untouched); null = not a reactive move
export function handleReactiveMove(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void | null {
  if (pending.kind !== 'moveUnit') return null
  const s = ctx.state
  const rv = readReactive(s)
  if (!rv || rv.unitId !== pending.context.unitId) return null
  if (action.type === 'pass') { writeMark(s, REACTIVE_KEY, null); return }
  if (action.type !== 'moveUnit') return null
  const result = resolveMove(s, rv.unitId, 'normal', action.placements, { distance: rv.distance })
  if (result.rejection) return result.rejection
  writeMark(s, REACTIVE_KEY, null)
  for (const r of result.resolved) setModelPos(s.models[r.model.id], r.to, r.facing)
  ctx.emit({
    type: 'UnitMoved', unitId: rv.unitId, moveType: 'normal',
    paths: Object.fromEntries(result.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])), player: pending.player,
  })
  cultAmbushOnMoveEnded(ctx, rv.unitId)
}

function reactiveCandidates(state: GameState, pending: Extract<PendingDecision, { kind: 'moveUnit' }>, rv: ReactiveMove): Action[] {
  const models = unitModelsForCoherency(state, rv.unitId)
  const out: Action[] = []
  if (models.length > 0) {
    const allow = Math.max(0, rv.distance - 0.02)
    const mk = (placements: ModelPlacement[]): Action => ({ type: 'moveUnit', player: pending.player, decisionId: pending.id, unitId: rv.unitId, placements })
    const cands: Action[] = []
    for (const frac of [1, 0.5]) {
      for (let i = 0; i < 8; i++) cands.push(mk(translatePlacements(models, Math.cos((Math.PI * i) / 4) * allow * frac, Math.sin((Math.PI * i) / 4) * allow * frac)))
    }
    out.push(...filterValid(cands, (a) => (a.type === 'moveUnit' ? moveRejection(state, rv.unitId, 'normal', a.placements, rv.distance) : null), 3))
  }
  out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
  return out
}

function checkPaths(state: GameState, moveType: MoveType, result: { rejection: null; resolved: ResolvedPlacement[] }, enemies: Footprint[], otherFriendly: Model[], flyOf: (m: Model) => boolean):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const isBig = (unitId: UnitId): boolean => hasKeyword(state, unitId, 'MONSTER') || hasKeyword(state, unitId, 'VEHICLE')
  const bigFriendly = otherFriendly.filter((m) => isBig(m.unitId))
  for (const r of result.resolved) {
    if (r.distance <= EPS) continue
    // MOVE-004-path (R-5.2): no part of the move may cross the board edge, not just the end position. A pivoting
    // model is accepted at a sample point if either its starting or its final facing keeps it on the board.
    for (const p of samplePath(r.path)) {
      const onBoard = whollyOnBoard({ pos: p, facing: r.facing, base: r.model.base }, state.board)
        || whollyOnBoard({ pos: p, facing: r.model.facing, base: r.model.base }, state.board)
      if (!onBoard) return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id}'s path would cross the board edge`, details: { modelId: r.model.id } } }
    }
    if (terrainService.crossesImpassable(state, r.model, r.path)) {
      return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path is blocked by terrain`, details: { modelId: r.model.id } } }
    }
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
    const fly = flyOf(r.model)
    if (fly) continue
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    // MOVE-003-fallback (R-5.2): a MONSTER/VEHICLE may not pass through another MONSTER/VEHICLE, whatever the move type
    if (isBig(r.model.unitId) && pathCrossesModels(fp, r.path, bigFriendly)) {
      return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another MONSTER/VEHICLE model`, details: { modelId: r.model.id } } }
    }
    if (moveType === 'fallBack') continue // R-5.5: Fall Back may pass through and within ER of enemy models
    if (pathEntersEngagement(fp, r.path, enemies)) {
      return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id}'s path would enter engagement range`, details: { modelId: r.model.id } } }
    }
    if (pathCrossesModels(fp, r.path, enemies)) {
      return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross an enemy model`, details: { modelId: r.model.id } } }
    }
  }
  return result
}

// MOVE-010 ("no legal end → the option is absent"): declareMove must not offer 'fallBack' unless the *real* moveUnit
// generator (moveUnitCandidatesFor, same terrain/coherency/overlap checks a submitted placement is validated against)
// can actually produce a legal end for it — otherwise the unit gets stuck with a moveUnit decision that has zero
// legal actions. This used to be a cheap per-model sampling heuristic that only checked engagement range and the
// board edge, ignoring terrain and the rest of the unit's coherency/overlap — so it could say "yes" for a spot that
// was individually ER-clear but actually unreachable (e.g. behind a solid terrain piece, or too cramped for the
// whole unit to fit together coherently), leaving moveUnit with nothing to offer. Reusing the real generator closes
// that gap by construction: whatever this finds IS what moveUnit's own legalActions() will find moments later.
function canFallBack(state: GameState, unitId: UnitId): boolean {
  return moveUnitCandidatesFor(state, unitId, 'fallBack', state.units[unitId].player, '__probe__').length > 0
}

function allowedMoveTypes(state: GameState, unitId: UnitId): MoveType[] {
  // MOVE-030 (R-5.18): a unit that disembarked this phase from a transport that had not yet moved acts normally but
  // may not Remain Stationary
  const mustMove = transportService.disembarkModeThisPhase(state, unitId) === 'actsNormally'
  if (leaderService.inEngagementWithEnemy(state, unitId)) {
    if (canFallBack(state, unitId)) return mustMove ? ['fallBack'] : ['fallBack', 'stationary']
    return ['stationary']
  }
  return mustMove ? ['normal', 'advance'] : ['normal', 'advance', 'stationary']
}

// ---------- Fire Overwatch (a pushed 'overwatch' reaction targeting the just-moved unit) ----------
export function overwatchTargets(state: GameState, shooterUnitId: UnitId, targetUnitId: UnitId): DeclaredTarget[] {
  const out: DeclaredTarget[] = []
  for (const half of leaderService.halves(state, shooterUnitId)) {
    if (state.units[half]?.location !== 'board') continue
    for (const m of unitModels(state, half)) {
      for (const wid of m.weapons) {
        const w = state.weapons[wid]
        if (!w || w.kind !== 'ranged') continue
        // [ONE SHOT]: a weapon already fired this battle is never a legal Overwatch choice either
        if (w.abilities.some((a) => a.ability === 'ONE_SHOT') && m.oneShotUsed.includes(wid)) continue
        if (!weaponService.isAvailable(state, m.id, wid)) continue // C4
        out.push({ modelId: m.id, weaponId: wid, targetUnitId, profileGroup: w.profileGroup, attacks: null })
      }
    }
  }
  return out
}

function drainOverwatch(ctx: EngineContext, moverUnitId: UnitId): AdvanceResult {
  for (;;) {
    if (ctx.state.phaseState.attack) {
      if (attackService.advance(ctx) === 'pending') return 'pending'
      continue
    }
    const req = pendingReactions(ctx.state, 'overwatch').find((r) => r.enemyUnitId === moverUnitId)
    if (!req) return 'done'
    consumeReaction(ctx.state, 'overwatch', req.unitId)
    const targets = overwatchTargets(ctx.state, req.unitId, moverUnitId)
    if (targets.length === 0) continue
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: req.unitId, overwatch: true, targets, overwatchHitOn: hookService.overwatchHitOnFor!(ctx.state, req.unitId, req.stratagemId) })
  }
}

const ATTACK_CHOOSE_TOPICS = new Set(['saveType', 'hazardousCasualty', 'rerollOffer'])

// exported for the Shooting-phase module (or whoever drains `pendingReactions(state, 'surge')`): a rigid, deterministic
// resolution of an R-5.9 surge move (Krump da Gitz!) — translate the whole unit toward `towardUnitId` by up to
// `distance`, stopping short of engagement range. [interp: real per-model "as close as possible" pathing, allowing a
// unit to fan out around obstacles, is not attempted — a straight rigid translation toward the nearest point of the
// target is used instead, validated the same way as any other move]
export function resolveSurgeMove(ctx: EngineContext, unitId: UnitId, distance: number, towardUnitId: UnitId | null): boolean {
  const state = ctx.state
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board' || unit.turn.surgeMovedThisPhase || unit.battleShocked) return false
  if (leaderService.inEngagementWithEnemy(state, unitId)) return false
  const models = unitModelsForCoherency(state, unitId)
  if (models.length === 0) return false
  let dx = 0, dz = 0
  if (towardUnitId) {
    const targetModels = unitModels(state, towardUnitId)
    let best = Infinity, bx = 0, bz = 0
    for (const m of models) for (const t of targetModels) {
      const d = Math.hypot(m.pos.x - t.pos.x, m.pos.z - t.pos.z)
      if (d < best) { best = d; bx = t.pos.x - m.pos.x; bz = t.pos.z - m.pos.z }
    }
    const len = Math.hypot(bx, bz)
    if (len > EPS) { dx = bx / len; dz = bz / len }
  }
  const enemies = enemyModelsOnBoard(state, unit.player)
  const otherFriendly = friendlyOthers(state, unitId)
  // MOVE-027-closest (R-5.9 "as close as possible", not a halved fraction): legality here is a simple step function
  // of `travel` — legal near 0, illegal once the unit would enter engagement range / cross impassable terrain / land
  // somewhere with no surface, and it stays illegal for every larger travel along the same straight line (it never
  // becomes legal again further out) — so a binary search for the largest legal travel finds the true closest legal
  // spot instead of an arbitrary halved fraction.
  const attempt = (travel: number): { rejection: null; resolved: ResolvedPlacement[] } | null => {
    const placements: ModelPlacement[] = models.map((m) => ({ modelId: m.id, pos: { x: m.pos.x + dx * travel, y: m.pos.y, z: m.pos.z + dz * travel } }))
    const constraints = emptyMoveConstraints(distance, { mustEndOutsideEngagement: true, coherency: true })
    const result = checkPlacements({ unitModels: models, placements, constraints, otherFriendly, enemies, board: state.board })
    if (result.rejection) return null
    for (const r of result.resolved) {
      if (r.distance <= EPS) continue
      if (terrainService.crossesImpassable(state, r.model, r.path)) return null
      if (!terrainService.canEndAt(state, r.model, r.to).ok) return null
      // MOVE-027-path: a surge move may not pass through an intervening enemy model, same as any other move
      // (checkPaths' E_OVERLAP rule) — `checkPlacements` above only validates the landing spot, not the line to it.
      const fp: Footprint = { pos: r.from, facing: r.facing, base: r.model.base }
      if (pathCrossesModels(fp, r.path, enemies)) return null
    }
    return result
  }
  let best = attempt(0)
  if (!best) return false // can't even legally stay put (already-engaged / already-shocked is checked above)
  const fullAttempt = attempt(distance)
  if (fullAttempt) {
    best = fullAttempt
  } else {
    let lo = 0, hi = distance
    for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
      const mid = (lo + hi) / 2
      const midResult = attempt(mid)
      if (midResult) { lo = mid; best = midResult } else { hi = mid }
    }
  }
  for (const r of best.resolved) setModelPos(state.models[r.model.id], r.to, r.facing)
  for (const id of leaderService.halves(state, unitId)) state.units[id].turn.surgeMovedThisPhase = true
  ctx.emit({
    type: 'UnitMoved', unitId, moveType: 'surge',
    paths: Object.fromEntries(best.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])), player: unit.player,
  })
  cultAmbushOnMoveEnded(ctx, unitId)
  return true
}

// MOVE-021-attached: an attached Leader+Bodyguard pair in Reserves is one arrival (LEAD-004) — every model of the
// combined unit needs DEEP_STRIKE (or a Tellyporta-style deepStrikeWith pairing, which bypasses the ability check
// the way it already did for a lone unit).
function reservesHalves(state: GameState, unitId: UnitId): UnitId[] {
  return leaderService.halves(state, unitId).filter((id) => state.units[id] && state.units[id].location === 'reserves')
}

function hasDeepStrike(state: GameState, unitId: UnitId): boolean {
  return datasheetOf(state, unitId).coreAbilities.some((c) => c.ability === 'DEEP_STRIKE')
}

// ---------- Reserves / reinforcements (R-5.11–R-5.14) ----------
// Deep Strike (own ability or a Tellyporta pairing) arrives by Deep Strike; every other unit in Reserves (a Teeming Broods copy)
// arrives as Strategic Reserves (R-5.15)
export function reserveRouteFor(state: GameState, unitId: UnitId): 'deepStrike' | 'strategicReserves' {
  const u = state.units[unitId]
  const halves = reservesHalves(state, unitId)
  const groupIds = halves.length > 0 ? halves : [unitId]
  return groupIds.every((id) => hasDeepStrike(state, id)) || u?.deepStrikeWith != null ? 'deepStrike' : 'strategicReserves'
}

// R-5.15: wholly within 6" of a battlefield edge (the board inset by 6" on every side is forbidden), not inside the enemy
// deployment zone in battle round 2, more than 9" horizontally from every enemy model
export function strategicReservesConstraints(state: GameState, player: PlayerId): MoveConstraints {
  const hw = state.board.w / 2, hh = state.board.h / 2, inset = 6
  const inner: Polygon = [{ x: -hw + inset, z: -hh + inset }, { x: hw - inset, z: -hh + inset }, { x: hw - inset, z: hh - inset }, { x: -hw + inset, z: hh - inset }]
  const forbidden: Polygon[] = [inner]
  if (state.round === 2) forbidden.push(deploymentZone(state, otherPlayer(player)))
  return emptyMoveConstraints(9999, { region: boardPolygon(state), forbidden, minDistanceFromEnemies: 9, coherency: false })
}

function eligibleArrivals(state: GameState, player: PlayerId): UnitId[] {
  const seen = new Set<UnitId>()
  const out: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.player !== player || u.location !== 'reserves' || seen.has(u.id)) continue
    if (u.bodyguardUnitId && state.units[u.bodyguardUnitId] && state.units[u.bodyguardUnitId].location !== 'destroyed' && state.units[u.bodyguardUnitId].models.length > 0) continue // leader half of an attached pair: represented by its bodyguard (canonical) id
    if (transportService.transportOf(state, u.id)) continue
    // GRE-2.3: a Teleport Assault unit arrives in any round; every other Reserves unit only in rounds 2-3
    if (!isTeleporting(state, u.id) && (state.round < 2 || state.round > 3)) continue
    const halves = reservesHalves(state, u.id)
    const groupIds = halves.length > 0 ? halves : [u.id]
    for (const id of groupIds) seen.add(id)
    if (u.deepStrikeWith) seen.add(u.deepStrikeWith)
    out.push(u.id)
  }
  // GRE-2.2: teleporting units are mandatory and come first
  return [...out.filter((id) => isTeleporting(state, id)).sort(), ...out.filter((id) => !isTeleporting(state, id)).sort()]
}

// R-5.14: any Reserves unit not on the battlefield at the end of round 3 is destroyed. `endOfRound3` is set once the
// second player's round-3 Movement phase has finished its reinforcements (Rapid Ingress included) — the last moment
// any unit could still arrive in round 3; the round >= 4 check stays as a safety net for states built past that point.
function cullStrandedReserves(ctx: EngineContext, endOfRound3 = false): void {
  const s = ctx.state
  if (s.round < 4 && !(endOfRound3 && s.round === 3)) return
  const destroyStrandedUnit = (unitId: UnitId): void => {
    const u = s.units[unitId]
    if (!u || u.location !== 'reserves') return
    // C3: a unit spawned by Send in the Next Wave never waits in Reserves (it arrives at once), so it is not culled
    if (pendingReactions(s, 'nextWave').some((r) => r.unitId === unitId)) return
    // Cult Ambush: a returning copy is set up at once as well
    if (pendingCultAmbushReactions(s).some((r) => r.unitId === unitId)) return
    const player = u.player
    ctx.emit({ type: 'UnitLostInReserves', unitId, player })
    let destroyed = false
    for (const mid of [...u.models]) {
      destroyed = removeModel(s, mid)
      ctx.emit({ type: 'ModelDestroyed', unitId, modelId: mid, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player })
    }
    if (destroyed) {
      ctx.emit({ type: 'UnitDestroyed', unitId, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player })
      // CSM-06: a stranded unit counts as destroyed for mission rules (Marked for Execution on a stranded Warlord)
      ctx.services.missions.unitDestroyed?.(ctx, { unitId, byPlayer: null, byUnitId: null, byModelId: null })
    }
  }
  for (const u of Object.values(s.units)) {
    if (u.location !== 'reserves') continue
    const transportId = transportService.transportOf(s, u.id)
    if (transportId !== null && s.units[transportId]?.location === 'reserves') continue // culled below with its transport
    if (isTeleporting(s, u.id)) continue // GRE-2.3: Teleport Assault units are never culled (destroyed at battle end instead)
    destroyStrandedUnit(u.id)
    // R-5.14/R-5.20: a transport destroyed here (or already dead, e.g. removed mid-game) never leaves its own
    // passengers embarked in limbo — they go down with it too.
    for (const passengerId of transportService.embarkedIn(s, u.id)) destroyStrandedUnit(passengerId)
  }
}

// C3: Send in the Next Wave arrives within 9" of the player's own battlefield edge, outside Engagement Range of every enemy,
// in coherency (instead of the 9" gap from enemies that Deep Strike needs)
function nextWaveZone(state: GameState, player: PlayerId): Polygon {
  return battlefieldEdgeStrip(state.board, deploymentZone(state, player), 9)
}

type ArrivalVia = 'deepStrike' | 'rapidIngress' | 'strategicReserves' | 'nextWave' | 'teleportAssault' | 'cultAmbush'

// Cult Ambush: the marker circle the returning unit must touch (written when its arrival decision is raised)
function arrivalMarker(state: GameState): Vec3 | null {
  const raw = readMark(state, 'mv:arriveMarker')
  return raw === null ? null : (JSON.parse(raw) as Vec3)
}
function cultAmbushArrivalConstraints(marker: Vec3 | null): MoveConstraints {
  return emptyMoveConstraints(9999, { minDistanceFromEnemies: 9, coherency: false, mustTouch: marker ? { pos: marker, radius: CULT_AMBUSH_MARKER_RADIUS } : null })
}

function resolveArrival(state: GameState, groupIds: UnitId[], placements: ModelPlacement[], via: ArrivalVia = 'deepStrike'):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const models = groupIds.flatMap((id) => unitModels(state, id))
  const player = state.units[groupIds[0]].player
  const enemies = enemyModelsOnBoard(state, player)
  const otherFriendly = boardModelsOf(state, player)
  const constraints = via === 'strategicReserves'
    ? strategicReservesConstraints(state, player)
    : via === 'nextWave'
      ? emptyMoveConstraints(9999, { region: nextWaveZone(state, player), mustEndOutsideEngagement: true, coherency: false })
      : via === 'cultAmbush'
        ? cultAmbushArrivalConstraints(arrivalMarker(state))
        : emptyMoveConstraints(9999, { minDistanceFromEnemies: 9, coherency: false })
  const result = checkPlacements({ unitModels: models, placements, constraints, otherFriendly, enemies, board: state.board })
  if (result.rejection) return result
  // MOVE-021-terrain/air: a Deep Strike (or Rapid Ingress) arrival is still an "end a move here" placement — it may
  // not be set up inside solid terrain or on a height with no matching surface.
  for (const r of result.resolved) {
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
  }
  // MOVE-021-attached: an attached Leader+Bodyguard pair is one unit for coherency (LEAD-004) — check the combined
  // models together, not each half on its own. A Tellyporta pairing (two independent units) keeps the old per-unit
  // coherency plus the 3" together-arrival check below.
  const attachedPair = groupIds.length === 2 && leaderService.partnerOf(state, groupIds[0]) === groupIds[1]
  if (attachedPair) {
    const finals = result.resolved.map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base }))
    if (!isCoherent(finals)) return { rejection: { code: 'E_COHERENCY', reason: `${groupIds.join(' & ')} would arrive out of coherency` } }
    return result
  }
  for (const id of groupIds) {
    const finals = result.resolved.filter((r) => r.model.unitId === id).map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base }))
    if (!isCoherent(finals)) return { rejection: { code: 'E_COHERENCY', reason: `${id} would arrive out of coherency` } }
  }
  if (groupIds.length === 2) {
    const a = result.resolved.filter((r) => r.model.unitId === groupIds[0])
    const b = result.resolved.filter((r) => r.model.unitId === groupIds[1])
    let best = Infinity
    for (const x of a) for (const y of b) {
      best = Math.min(best, horizontalGap({ pos: x.to, facing: x.facing, base: x.model.base }, { pos: y.to, facing: y.facing, base: y.model.base }))
    }
    if (best > 3 + EPS) return { rejection: { code: 'E_OUT_OF_RANGE', reason: 'paired units (Tellyporta) must arrive together within 3" of each other' } }
  }
  return result
}

function validateArrival(state: GameState, action: Action, pending: Extract<PendingDecision, { kind: 'deployUnit' }>): Rejection | null {
  if (action.type !== 'deployUnit') return optionCheck(pending, action)
  if (action.toReserves) {
    // a Send in the Next Wave copy must be set up at once (it has no Reserves to wait in)
    if (readMark(state, 'mv:arriveVia') === 'nextWave') return { code: 'E_NOT_AN_OPTION', reason: 'a Next Wave unit must be set up now; it cannot go to Reserves' }
    if (readMark(state, 'mv:arriveVia') === 'cultAmbush') return { code: 'E_NOT_AN_OPTION', reason: 'a Cult Ambush return must be set up now; it cannot go to Reserves' }
    return null
  }
  const groupIds = pending.context.unitIds
  const needed = new Set(groupIds.flatMap((id) => state.units[id].models))
  const provided = new Set(action.placements.map((p) => p.modelId))
  for (const id of needed) if (!provided.has(id)) return { code: 'E_OUT_OF_RANGE', reason: `arrival must place every model of ${groupIds.join(' & ')} together`, details: { missing: id } }
  for (const id of provided) if (!needed.has(id)) return { code: 'E_SCHEMA', reason: `model ${id} is not part of this arrival` }
  const r = resolveArrival(state, groupIds, action.placements, (readMark(state, 'mv:arriveVia') ?? 'deepStrike') as ArrivalVia)
  return r.rejection
}

function raiseArrivalDecision(ctx: EngineContext, unitId: UnitId, player: PlayerId, via: ArrivalVia, marker: Vec3 | null = null): void {
  const s = ctx.state
  if (via === 'cultAmbush') {
    // Cult Ambush: one freshly spawned copy, Deep Strike rules plus one model touching the marker
    writeMark(s, 'mv:arriveGroup', JSON.stringify([unitId]))
    writeMark(s, 'mv:arriveVia', via)
    writeMark(s, 'mv:arriveMarker', marker ? JSON.stringify(marker) : null)
    ctx.decide({
      kind: 'deployUnit', player, window: 'movement.reinforcements', canPass: false,
      context: { unitIds: [unitId], zone: boardPolygon(s), infiltrators: [], reservesAllowed: [] },
      constraints: cultAmbushArrivalConstraints(marker),
    })
    return
  }
  if (via === 'nextWave') {
    // C3: one freshly spawned unit; it must be placed (no going back to Reserves)
    writeMark(s, 'mv:arriveGroup', JSON.stringify([unitId]))
    writeMark(s, 'mv:arriveVia', via)
    ctx.decide({
      kind: 'deployUnit', player, window: 'movement.reinforcements', canPass: false,
      context: { unitIds: [unitId], zone: nextWaveZone(s, player), infiltrators: [], reservesAllowed: [] },
      constraints: emptyMoveConstraints(9999, { region: nextWaveZone(s, player), mustEndOutsideEngagement: true, coherency: false }),
    })
    return
  }
  // MOVE-021-attached: an attached Leader+Bodyguard pair arrives together (leaderService.halves), on top of any
  // Tellyporta deepStrikeWith pairing (two independent units) — both apply, though Combat Patrol never combines them.
  const halves = reservesHalves(s, unitId)
  const groupSet = new Set<UnitId>(halves.length > 0 ? halves : [unitId])
  const partner = s.units[unitId].deepStrikeWith
  if (partner !== null && s.units[partner] && s.units[partner].location === 'reserves') groupSet.add(partner)
  const groupIds = [...groupSet]
  writeMark(s, 'mv:arriveGroup', JSON.stringify(groupIds))
  writeMark(s, 'mv:arriveVia', via)
  ctx.decide({
    kind: 'deployUnit', player, window: 'movement.reinforcements', canPass: false,
    context: { unitIds: groupIds, zone: boardPolygon(s), infiltrators: [], reservesAllowed: groupIds },
    constraints: via === 'strategicReserves' ? strategicReservesConstraints(s, player) : emptyMoveConstraints(9999, { minDistanceFromEnemies: 9, coherency: false }),
  })
}

function doReinforcementsStep(ctx: EngineContext): AdvanceResult {
  const s = ctx.state
  cullStrandedReserves(ctx)
  const justArrivedRaw = readMark(s, 'mv:justArrived')
  if (justArrivedRaw !== null) {
    const ids: UnitId[] = JSON.parse(justArrivedRaw)
    for (const id of ids) {
      if (!s.units[id] || s.units[id].location !== 'board') continue
      const opp = otherPlayer(s.units[id].player)
      if (ctx.window('movement.reinforcements', id, ctx.order.only(opp), { unitId: id })) return 'pending'
      if (drainOverwatch(ctx, id) === 'pending') return 'pending'
    }
    writeMark(s, 'mv:justArrived', null)
  }
  if (readMark(s, 'mv:arriveGroup') !== null) return 'pending'
  let queue: UnitId[]
  const queueRaw = readMark(s, 'mv:arriveQueue')
  if (queueRaw === null) {
    queue = eligibleArrivals(s, s.activePlayer)
    writeMark(s, 'mv:arriveQueue', JSON.stringify(queue))
  } else {
    queue = JSON.parse(queueRaw)
  }
  // the active player's own stratagem window for this step (Teeming Broods). The arrival queue above is already fixed, so a
  // unit created in this window cannot arrive in the step it was created
  if (ctx.window('movement.reinforcements', 'step', ctx.order.only(s.activePlayer), {})) return 'pending'
  if (queue.length > 0) {
    // a Teeming Broods copy or a destroyed unit may have changed the queue's head
    const head = queue.find((id) => s.units[id]?.location === 'reserves')
    writeMark(s, 'mv:arriveQueue', JSON.stringify(head === undefined ? [] : queue.slice(queue.indexOf(head) + 1)))
    if (head !== undefined) {
      raiseArrivalDecision(ctx, head, s.activePlayer, isTeleporting(s, head) ? 'teleportAssault' : reserveRouteFor(s, head))
      return 'pending'
    }
  }
  // Genestealer Cults: the non-active player's Cult Ambush markers, after every Reinforcements arrival and before Rapid Ingress
  const ambushes = pendingCultAmbushReactions(s)
  if (ambushes.length > 0) {
    const req = ambushes[0]
    consumeReaction(s, CULT_AMBUSH_REACTION_KIND, req.unitId)
    raiseArrivalDecision(ctx, req.unitId, req.player, 'cultAmbush', cultAmbushReactionMarker(req))
    return 'pending'
  }
  if (cultAmbushReturnStep(ctx) === 'pending') return 'pending'
  if (ctx.window('movement.end', 'end', ctx.order.active())) return 'pending'
  const reqs = pendingReactions(s, 'rapidIngress')
  if (reqs.length > 0) {
    const req = reqs[0]
    consumeReaction(s, 'rapidIngress', req.unitId)
    raiseArrivalDecision(ctx, req.unitId, req.player, 'rapidIngress')
    return 'pending'
  }
  const waves = pendingReactions(s, 'nextWave')
  if (waves.length > 0) {
    const req = waves[0]
    consumeReaction(s, 'nextWave', req.unitId)
    raiseArrivalDecision(ctx, req.unitId, req.player, 'nextWave')
    return 'pending'
  }
  if (s.round === 3 && s.activePlayer !== s.firstPlayer) cullStrandedReserves(ctx, true)
  return 'done'
}

// ---------- per-unit select / declare / move ----------
// `extraIds`: an attached partner (leader/bodyguard) whose move was applied alongside `unitId` (MOVE-011-leader) — it
// must also be marked activated so it isn't re-offered by doSelect once leaderService.detach clears its link.
function finishUnit(state: GameState, unitId: UnitId, extraIds: UnitId[] = []): void {
  for (const id of [unitId, ...extraIds]) if (!state.phaseState.activated.includes(id)) state.phaseState.activated.push(id)
  writeMark(state, 'mv:cur', null)
  writeMark(state, 'mv:placements', null)
  writeMark(state, 'mv:deRolled', null)
  writeMark(state, 'mv:deRemaining', null)
  writeMark(state, 'mv:deGroup', null)
}

function doSelect(ctx: EngineContext): 'pending' | 'declare' | 'reinforcements' {
  const s = ctx.state
  if (readMark(s, 'mv:cur') !== null) return 'declare'
  const active = s.activePlayer
  const activated = new Set(s.phaseState.activated)
  const eligible: UnitId[] = []
  for (const u of boardUnitsOf(s, active)) {
    if (u.bodyguardUnitId || activated.has(u.id)) continue
    // MOVE-030 (R-5.18): disembarked from a transport that already made a Normal move → counts as having made a
    // Normal move and cannot move further this phase
    if (transportService.disembarkModeThisPhase(s, u.id) === 'countsAsNormalMove') continue
    eligible.push(u.id)
  }
  if (eligible.length === 0) return 'reinforcements'
  ctx.decide({
    kind: 'chooseUnitToActivate', player: active, window: 'movement.start', canPass: true,
    context: { phase: 'movement', eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseUnitToActivate', player: active, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

function doDeclare(ctx: EngineContext): 'pending' | 'move' | 'select' {
  const s = ctx.state
  const unitId = readMark(s, 'mv:cur')
  if (!unitId) throw new EngineInvariantError('movement: declare step with no current unit')
  const unit = s.units[unitId]
  if (unit.turn.moveType === null) {
    const allowed = allowedMoveTypes(s, unitId)
    ctx.decide({
      kind: 'declareMove', player: unit.player, window: 'movement.start', canPass: false,
      context: { unitId, allowed },
      options: allowed.map((mt) => ({ id: mt, label: mt, action: { type: 'declareMove', player: unit.player, decisionId: '', unitId, moveType: mt } })),
    })
    return 'pending'
  }
  if (unit.turn.moveType === 'stationary') {
    ctx.emit({ type: 'UnitRemainedStationary', unitId, player: unit.player })
    finishUnit(s, unitId)
    return 'select'
  }
  if (unit.turn.moveType === 'advance' && unit.turn.advanceRoll === null) {
    let roll = ctx.rollOnce(`advance:${unitId}`, { purpose: 'advance', player: unit.player, sides: 6, count: 1, mode: 'sum', unitId })
    if (roll === null) return 'pending'
    // E3: an ability re-roll of the Advance roll (a die already re-rolled is never re-rolled again, R-1.6). The roll never
    // "fails", so ones/fails kinds re-roll a 1 automatically and 'all' is an optional offer.
    if ((roll.rerolled ?? []).length === 0) {
      const kinds = collectAdvanceRerollKinds(ctx, unitId, roll)
      if (kinds.size > 0) {
        if (kinds.has('all')) {
          const offerKey = `mv:advRerollOffered:${unitId}`
          if (!ctx.marked(offerKey)) {
            ctx.once(offerKey)
            ctx.decide({
              kind: 'chooseOption', player: unit.player, window: 'movement.moveStarted', canPass: false,
              context: { topic: 'rerollOffer', unitId, abilityId: null, data: { rollId: roll.id, dieIndexes: [0], purpose: 'advance' } },
              options: [
                { id: 'reroll', label: 'Re-roll', action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: 'reroll' } },
                { id: 'keep', label: 'Keep', action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: 'keep' } },
              ],
            })
            return 'pending'
          }
        } else if (rollSum(roll) === 1) {
          roll = ctx.reroll(roll, [0], 'advanceRoll')
        }
      }
    }
    // C6: halveRoll:'advance' effects (Artillery Strike) and onAdvanceRoll modifiers adjust the roll before it is added to M
    const advance = hookService.advanceRollFor(s, unitId, rollSum(roll))
    setAdvanceRoll(s, unitId, advance)
    ctx.emit({ type: 'UnitAdvanced', unitId, roll: advance, player: unit.player })
  }
  if (ctx.window('movement.moveStarted', unitId, ctx.order.only(otherPlayer(unit.player)), { unitId })) return 'pending'
  if (drainOverwatch(ctx, unitId) === 'pending') return 'pending'
  if (unit.turn.moveType === 'fallBack' && ctx.once(`mv:fellBackEmitted:${unitId}`)) {
    ctx.emit({ type: 'UnitFellBack', unitId, player: unit.player })
  }
  return 'move'
}

function doMove(ctx: EngineContext): 'pending' | 'select' {
  const s = ctx.state
  // MOVE-036-unitMoved: resume here when a movement.unitMoved window (e.g. Fire Overwatch) is still being offered
  // for the unit that just finished its move — `finishUnit` below already cleared `mv:cur`/`mv:placements` before
  // that window opened (this unit's move IS done), so `mv:windowUnit` is the only surviving record of which unit's
  // window this is; `ctx.window` itself is re-entrant per (window, key, player), so calling it again just offers it
  // to the next player in order, or reports "already fully offered" once both have answered.
  const windowUnit = readMark(s, 'mv:windowUnit')
  if (windowUnit !== null) {
    if (ctx.window('movement.unitMoved', windowUnit, ctx.order.active(), { unitId: windowUnit })) return 'pending'
    writeMark(s, 'mv:windowUnit', null)
    return 'select'
  }
  const unitId = readMark(s, 'mv:cur')
  if (!unitId) throw new EngineInvariantError('movement: move step with no current unit')
  const unit = s.units[unitId]
  const placementsRaw = readMark(s, 'mv:placements')
  if (unit.location !== 'board' && placementsRaw === null) {
    // the tracked half was wiped out (e.g. Fire Overwatch during the moveStarted window) before it ever submitted a
    // placement — MOVE-011-leader's stale-link bug applies here too: detach before finishing so a surviving attached
    // partner's bodyguardUnitId/attachedLeaderId doesn't keep pointing at a destroyed unit. (Once placements *have*
    // been submitted, `unitId` becoming non-board mid-Desperate-Escape is handled below instead, after applying the
    // rest of the group's placements — see the bottom of this function.)
    const groupIds = leaderService.halves(s, unitId)
    leaderService.detach(ctx, unitId)
    finishUnit(s, unitId, groupIds)
    return 'select'
  }
  const moveType = unit.turn.moveType as MoveType
  if (placementsRaw === null) {
    // R-5.5b: a declared Fall Back left with no legal end (Overwatch casualties at movement.moveStarted) reverts to Remain Stationary
    if (moveType === 'fallBack' && moveUnitCandidatesFor(s, unitId, 'fallBack', unit.player, '__stuck__').length === 0) {
      setMoveType(s, unitId, 'stationary')
      ctx.emit({ type: 'UnitRemainedStationary', unitId, player: unit.player })
      finishUnit(s, unitId)
      return 'select'
    }
    ctx.decide({
      kind: 'moveUnit', player: unit.player, window: 'movement.unitMoved', canPass: false,
      context: { unitId, moveType, advanceRoll: unit.turn.advanceRoll },
      constraints: buildMoveConstraints(s, unitId, moveType),
    })
    return 'pending'
  }
  // a Desperate Escape casualty (chosen after these placements were submitted, R-5.6) may have removed one of the
  // models the stored placements still name — drop those before re-resolving. MOVE-011-coherency: skip the
  // coherency check here — a casualty picked after submission may break coherency of what's left, which is not a
  // re-validation failure of the *original* (fully coherent) submission; R-2.6's end-of-turn cull handles it.
  const placements: ModelPlacement[] = (JSON.parse(placementsRaw) as ModelPlacement[]).filter((p) => s.models[p.modelId])
  const result = resolveMove(s, unitId, moveType, placements, { skipCoherency: true })
  if (result.rejection) throw new EngineInvariantError('movement: stored placements failed re-validation', { rejection: result.rejection })
  const resolved = result.resolved

  if (moveType === 'fallBack' && readMark(s, 'mv:deRolled') === null) {
    writeMark(s, 'mv:deRolled', '1')
    const enemies = enemyModelsOnBoard(s, unit.player)
    // MOVE-013-leader / MOVE-011-leadercross (R-5.6, R-4.6b): every model of the (possibly attached) unit is a
    // candidate — an attached Leader tests exactly like its Bodyguard. `resolved` already covers every model of the
    // combined unit (unitModelsForCoherency). R-5.8: a FLY model (decided per model) never tests for crossing enemies;
    // the Battle-shocked "every model" test still applies to it. Either half being Battle-shocked shocks the unit.
    const shocked = leaderService.halves(s, unitId).some((id) => s.units[id]?.battleShocked)
    const crossing = resolved
      .filter((r) => !hasKeyword(s, r.model.unitId, 'FLY') && r.distance > EPS && pathCrossesModels({ pos: r.from, facing: r.facing, base: r.model.base }, r.path, enemies))
      .map((r) => r.model.id)
    const testSet = shocked ? resolved.map((r) => r.model.id) : crossing
    if (testSet.length > 0) {
      const roll = ctx.roll({ purpose: 'desperateEscape', player: unit.player, count: testSet.length, sides: 6, mode: 'perDie', unitId })
      for (const mid of testSet) { const mm = s.models[mid]; if (mm) mm.flags.desperateEscapeTested = true }
      const fails = roll.final.filter((d) => d <= 2).length
      ctx.emit({ type: 'DesperateEscapeRolled', unitId, dice: roll.dice, casualties: fails, player: unit.player })
      writeMark(s, 'mv:deRemaining', String(fails))
    }
  }

  const remaining = Number(readMark(s, 'mv:deRemaining') ?? '0')
  if (remaining > 0) {
    // MOVE-011-leader (R-5.6 "one model of the unit chosen by the owner"): any surviving model of the combined unit
    // may be picked, Leader included — the Leader's protection (R-10.1) governs attack allocation, not Desperate Escape.
    const liveModels = leaderService.halves(s, unitId).flatMap((id) => (s.units[id] ? unitModels(s, id) : [])).map((m) => m.id)
    if (liveModels.length > 0) {
      ctx.decide({
        kind: 'chooseOption', player: unit.player, window: 'movement.unitMoved', canPass: false,
        context: { topic: 'desperateEscapeCasualty', unitId, abilityId: null, data: { remaining } },
        options: liveModels.map((id) => ({ id, label: `remove ${id}`, action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: id } })),
      })
      return 'pending'
    }
  }

  // MOVE-011-leader: apply every surviving model's placement (bodyguard and any attached leader alike) even when
  // the tracked half (`unitId`) was itself wiped out by Desperate Escape — only then detach, so the two units are
  // still treated as one combined unit (unitModelsForCoherency/resolveMove above) for as long as this move lasts.
  const groupIds = leaderService.halves(s, unitId)
  for (const r of resolved) { const m = s.models[r.model.id]; if (m) setModelPos(m, r.to, r.facing) }
  ctx.emit({
    type: 'UnitMoved', unitId, moveType,
    paths: Object.fromEntries(resolved.filter((r) => r.distance > EPS && s.models[r.model.id]).map((r) => [r.model.id, r.path])),
    player: unit.player,
  })
  cultAmbushOnMoveEnded(ctx, unitId)
  leaderService.detach(ctx, unitId)
  finishUnit(s, unitId, groupIds)
  writeMark(s, 'mv:windowUnit', unitId)
  if (ctx.window('movement.unitMoved', unitId, ctx.order.active(), { unitId })) return 'pending'
  writeMark(s, 'mv:windowUnit', null)
  return 'select'
}


// ---------- legal-action candidates (W1-G: generic Deciders need >=1 concrete answer for continuous decisions) ----------
// Shared by moveUnitCandidates (the real moveUnit decision) AND canFallBack (the declareMove-time feasibility check,
// MOVE-010): both need "does some placement of this unit actually validate for this moveType", so declareMove never
// offers a move type that this generator then fails to answer. Kept a plain (state, unitId, moveType, ...) signature
// rather than threading a `pending` object through, since canFallBack has no decision to hang one off yet.
function moveUnitCandidatesFor(state: GameState, unitId: UnitId, moveType: MoveType, player: PlayerId, decisionId: string): Action[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const models = unitModelsForCoherency(state, unitId)
  if (models.length === 0) return []
  const { perModel } = moveAllowance(state, unitId)
  const allow = Math.max(0, Math.min(...models.map((m) => perModel[m.id] ?? 0)) - 0.02)
  const c = centroid(models)
  const enemies = enemyModelsOnBoard(state, unit.player)
  const dirs: { x: number; z: number }[] = []
  const objs = Object.values(state.objectives).filter((o) => !o.removed).sort((a, b) => dist2D(c, a.pos) - dist2D(c, b.pos))
  if (objs[0]) { const v = unitVector(c, objs[0].pos); if (v) dirs.push(v) }
  if (enemies.length > 0) {
    const e = [...enemies].sort((a, b) => dist2D(c, a.pos) - dist2D(c, b.pos))[0]
    const v = unitVector(c, e.pos)
    if (v) { dirs.push(v); dirs.push({ x: -v.x, z: -v.z }) }
  }
  for (let i = 0; i < 16; i++) dirs.push({ x: Math.cos((2 * Math.PI * i) / 16), z: Math.sin((2 * Math.PI * i) / 16) })
  const mk = (placements: ModelPlacement[]): Action => ({ type: 'moveUnit', player, decisionId, unitId, placements })
  const candidates: Action[] = []
  for (const frac of [1, 0.6, 0.3]) for (const d of dirs) candidates.push(mk(translatePlacements(models, d.x * allow * frac, d.z * allow * frac)))
  candidates.push(mk([]))
  // regroup candidates for a unit that starts out of coherency (rigid translations can never end coherent)
  const allowOf = (m: Model): number => Math.max(0, (perModel[m.id] ?? 0) - 0.05)
  const repairOpts = {
    allowance: allowOf,
    blockers: [...friendlyOthers(state, unitId), ...enemies],
    ok: (m: Model, to: Vec3): boolean => !anyWithinEngagementRange({ pos: to, facing: m.facing, base: m.base }, enemies)
      && terrainService.canEndAt(state, m, to).ok && !terrainService.crossesImpassable(state, m, [m.pos, to]),
  }
  candidates.push(mk(repairCoherency(models, [], repairOpts)))
  for (const d of dirs.slice(0, 11)) candidates.push(mk(repairCoherency(models, translatePlacements(models, d.x * allow * 0.3, d.z * allow * 0.3), repairOpts)))
  for (const frac of [0.5, 0.25, 0]) {
    for (const d of dirs.slice(0, 11)) {
      const f = formationPlacements(models, { x: c.x + d.x * allow * frac, z: c.z + d.z * allow * frac }, allowOf)
      if (f) candidates.push(mk(f))
      if (frac === 0) break
    }
  }
  return filterValid(candidates, (a) => (a.type === 'moveUnit' ? moveRejection(state, unitId, moveType, a.placements) : null), 6)
}

function moveUnitCandidates(state: GameState, pending: Extract<PendingDecision, { kind: 'moveUnit' }>): Action[] {
  // a Fall Back with no legal end never reaches this decision (doMove reverts it to Remain Stationary, R-5.5b)
  return moveUnitCandidatesFor(state, pending.context.unitId, pending.context.moveType, pending.player, pending.id)
}

function arrivalCandidates(state: GameState, pending: Extract<PendingDecision, { kind: 'deployUnit' }>): Action[] {
  const groupIds = pending.context.unitIds
  const models = groupIds.flatMap((id) => (state.units[id] ? unitModels(state, id) : []))
  if (models.length === 0) return []
  const rad = Math.max(...models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const spacing = 2 * rad + 0.2
  const cols = Math.ceil(Math.sqrt(models.length))
  const rows = Math.ceil(models.length / cols)
  const nextWave = readMark(state, 'mv:arriveVia') === 'nextWave'
  const poly = nextWave ? pending.context.zone : boardPolygon(state)
  const minX = Math.min(...poly.map((p) => p.x)), maxX = Math.max(...poly.map((p) => p.x))
  const minZ = Math.min(...poly.map((p) => p.z)), maxZ = Math.max(...poly.map((p) => p.z))
  const out: Action[] = []
  if (readMark(state, 'mv:arriveVia') === 'cultAmbush') {
    const marker = arrivalMarker(state)
    const auto = marker ? cultAmbushArrivalPlacements(state, models, pending.player, marker) : null
    if (auto) {
      const action: Action = { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: groupIds[0], placements: auto }
      if (validateArrival(state, action, pending) === null) return [action]
    }
  }
  if (nextWave) {
    const auto = autoDeployPlacements(models, poly, boardModelsOf(state, pending.player), enemyModelsOnBoard(state, pending.player))
    if (auto) {
      const action: Action = { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: groupIds[0], placements: auto }
      if (validateArrival(state, action, pending) === null) return [action]
    }
  }
  for (let z0 = minZ + rad + 0.1; z0 + (rows - 1) * spacing + rad < maxZ && out.length < 3; z0 += 3) {
    for (let x0 = minX + rad + 0.1; x0 + (cols - 1) * spacing + rad < maxX && out.length < 3; x0 += 3) {
      const placements: ModelPlacement[] = models.map((m, i) => ({ modelId: m.id, pos: { x: x0 + (i % cols) * spacing, y: 0, z: z0 + Math.floor(i / cols) * spacing }, facing: m.facing }))
      const action: Action = { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: groupIds[0], placements }
      if (validateArrival(state, action, pending) === null) out.push(action)
    }
  }
  if (out.length === 0 && readMark(state, 'mv:arriveVia') !== 'cultAmbush') out.push({ type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: groupIds[0], placements: [], toReserves: true })
  return out
}

function movementLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind === 'moveUnit') {
    const rv = readReactive(state)
    return rv && rv.unitId === pending.context.unitId ? reactiveCandidates(state, pending, rv) : moveUnitCandidates(state, pending)
  }
  if (pending.kind === 'deployUnit') return arrivalCandidates(state, pending)
  return optionActions(pending)
}

export const movementModule: PhaseModule = {
  name: 'movement',
  legalActions(state, pending) { return movementLegalActions(state, pending) },
  enter(ctx) {
    ctx.state.step = 'select'
    ctx.state.phaseState.activated = []
    snapshotEngagementAtMovementStart(ctx.state)
  },
  advance(ctx) {
    const s = ctx.state
    for (;;) {
      if (s.step === 'select') {
        const r = doSelect(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'declare') {
        const r = doDeclare(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'move') {
        const r = doMove(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'reinforcements') {
        const r = doReinforcementsStep(ctx)
        if (r === 'pending') return 'pending'
        return 'done'
      }
      throw new EngineInvariantError(`movement: unexpected step ${s.step}`)
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'moveUnit') {
      if (action.type !== 'moveUnit') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'placements are for the wrong unit', details: { expected: pending.context.unitId } }
      const rv = readReactive(state)
      if (rv && rv.unitId === action.unitId) return moveRejection(state, action.unitId, 'normal', action.placements, rv.distance)
      return moveRejection(state, action.unitId, pending.context.moveType, action.placements)
    }
    if (pending.kind === 'deployUnit') return validateArrival(state, action, pending)
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') {
      if (pending.kind === 'moveUnit' && readReactive(s)) { writeMark(s, REACTIVE_KEY, null); return }
      // a Precision allocation (canPass) is declined with a pass: the attack sequence answers it
      if (pending.kind === 'allocateAttack' && s.phaseState.attack) return attackService.handler.handle(ctx, action, pending)
      if (pending.kind === 'chooseUnitToActivate') { s.step = 'reinforcements'; return }
      return { code: 'E_NOT_AN_OPTION', reason: `movement: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseUnitToActivate' && action.type === 'chooseUnitToActivate') {
      if (!s.phaseState.activated.includes(action.unitId)) s.phaseState.activated.push(action.unitId)
      writeMark(s, 'mv:cur', action.unitId)
      return
    }
    if (pending.kind === 'declareMove' && action.type === 'declareMove') {
      setMoveType(s, action.unitId, action.moveType)
      ctx.emit({ type: 'MoveDeclared', unitId: action.unitId, moveType: action.moveType, player: action.player })
      return
    }
    if (pending.kind === 'moveUnit' && action.type === 'moveUnit') {
      const rv = readReactive(s)
      if (rv && rv.unitId === action.unitId) {
        // reactive Normal move: apply it now, leave the interrupted activation (and unit.turn.moveType) untouched
        const result = resolveMove(s, rv.unitId, 'normal', action.placements, { distance: rv.distance })
        if (result.rejection) return result.rejection
        writeMark(s, REACTIVE_KEY, null)
        for (const r of result.resolved) setModelPos(s.models[r.model.id], r.to, r.facing)
        ctx.emit({
          type: 'UnitMoved', unitId: rv.unitId, moveType: 'normal',
          paths: Object.fromEntries(result.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])), player: pending.player,
        })
        cultAmbushOnMoveEnded(ctx, rv.unitId)
        return
      }
      writeMark(s, 'mv:placements', JSON.stringify(action.placements))
      return
    }
    if (pending.kind === 'chooseOption' && pending.context.topic === 'desperateEscapeCasualty' && action.type === 'chooseOption') {
      const model = s.models[action.optionId]
      if (!model) return { code: 'E_NOT_AN_OPTION', reason: `model ${action.optionId} no longer exists` }
      const unitId = model.unitId
      const destroyed = removeModel(s, action.optionId)
      ctx.emit({ type: 'ModelDestroyed', unitId, modelId: action.optionId, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: action.player })
      if (destroyed) ctx.emit({ type: 'UnitDestroyed', unitId, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: action.player })
      const remaining = Math.max(0, Number(readMark(s, 'mv:deRemaining') ?? '0') - 1)
      writeMark(s, 'mv:deRemaining', String(remaining))
      return
    }
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const groupIds = pending.context.unitIds
      const via = (readMark(s, 'mv:arriveVia') ?? 'deepStrike') as ArrivalVia
      writeMark(s, 'mv:arriveVia', null)
      writeMark(s, 'mv:arriveGroup', null)
      writeMark(s, 'mv:arriveMarker', null)
      if (action.toReserves) {
        // GRE-2.6: declining the mandatory Teleport Assault arrival destroys the unit
        if (via === 'teleportAssault') destroyTeleportingUnit(ctx, groupIds[0])
        return
      }
      const result = resolveArrival(s, groupIds, action.placements, via)
      if (result.rejection) throw new EngineInvariantError('movement: stored arrival placements failed re-validation', { rejection: result.rejection })
      for (const r of result.resolved) setModelPos(s.models[r.model.id], r.to, r.facing)
      for (const uid of groupIds) {
        const u = s.units[uid]
        u.location = 'board'
        for (const id of leaderService.halves(s, uid)) {
          s.units[id].turn.moveType = 'normal'
          s.units[id].turn.arrivedThisTurn = true
        }
        // GEN-2.3: a Cult Ambush return is set up "using Deep Strike", so the event says so (no events.ts change)
        ctx.emit({ type: 'ReinforcementsArrived', unitId: uid, via: via === 'cultAmbush' ? 'deepStrike' : via, player: u.player })
        if (via === 'teleportAssault') clearTeleport(s, uid)
      }
      // GEN-2.2: reinforcements count as a move, so an arrival within 9" of an enemy Cult Ambush marker removes it
      for (const uid of groupIds) cultAmbushOnMoveEnded(ctx, uid)
      writeMark(s, 'mv:justArrived', JSON.stringify(groupIds))
      return
    }
    if (!s.phaseState.attack && pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer' && action.type === 'chooseOption') {
      if (action.optionId === 'reroll') {
        const data = pending.context.data as { rollId: string; dieIndexes: number[] }
        const roll = s.phaseState.lastRoll
        if (!roll || roll.id !== data.rollId) throw new EngineInvariantError('rerollOffer: roll is no longer current', { rollId: data.rollId })
        ctx.reroll(roll, data.dieIndexes, 'advanceRoll')
      }
      return
    }
    if (s.phaseState.attack && (pending.kind === 'allocateAttack' || (pending.kind === 'chooseOption' && ATTACK_CHOOSE_TOPICS.has(pending.context.topic)))) {
      return attackService.handler.handle(ctx, action, pending)
    }
    return notImplementedHandle('movement')(ctx, action, pending)
  },
}
