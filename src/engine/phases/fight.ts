// Fight phase module (10-rules §9, docs/spec/12-rules-test-checklist.md FIGHT-*). Owner: W1-E.
//
// State machine: `phaseState.fight` (frozen FightState) tracks which of the two top-level steps we're in
// (`fightsFirst` then `remaining`, R-9.1/R-9.3) and, while `currentUnitId` is set, which sub-step of that unit's
// activation (`pileIn` → `declareTargets` → `attacks` → `consolidate`, R-9.4) is in progress. `nextToSelect` is the
// authoritative "whose turn" for ordinary alternation. Counter-offensive (code-hooks.ts) pushes a `counterOffensive`
// reaction naming the specific unit to fight next; `doFightSelect` consumes it before any ordinary selection (so it
// is offered whatever the current step, and only that one unit is offered — FIGHT-025), and the value `nextToSelect`
// held just before the reaction fires is saved (`fi:coResume` mark) and restored — rather than flipped from the
// Counter-offensive unit's own player — once that unit finishes, so alternation resumes exactly where it would have
// without the interruption [interp — R-9.12 does not spell out whether the inserted activation consumes the
// opponent's own next turn or is a pure insertion; this engine treats it as a pure insertion].
//
// Documented interpretations (see STATUS/issues):
// - Pile-in / consolidate feasibility and the actual arrangement share one heuristic search (`planApproachEnemy`,
//   closest-model-first, walking each model straight toward the nearest enemy point at Engagement Range, capped by
//   the allowance) — the same non-exhaustive style as charge.ts's `planChargeMove`, not a combinatorial proof.
// - R-9.5/R-9.10 "must end in base contact if possible" is checked per model against its own travel budget plus
//   overlap with the rest of the unit's own resolved arrangement and other friendlies (FIGHT-013-crowd) — like
//   charge.ts's R-8.5, still not a joint re-optimisation of the whole arrangement.
// - A model may pick only one non-[EXTRA ATTACKS] melee weapon (`chooseOption` topic `meleeWeapon` when it has more
//   than one); multi-profile melee weapons are not offered a `weaponProfile` choice — the model's first profile in
//   its `weapons` list is used. Neither situation occurs anywhere in the Combat Patrol data this engine ships with.
import {
  EPS, ENGAGEMENT_H, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, basesOverlap, checkPlacements, dist2D, distance,
  emptyMoveConstraints, horizontalGap, inBaseContact, pathCrossesModels, unitsWithinEngagementRange, whollyOnBoard,
  withinObjectiveRange,
  type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import { attackService } from '../attack'
import { terrainService } from '../terrain'
import { weaponService } from '../weapons'
import { pendingReactions, consumeReaction } from '../code-hooks'
import { notImplementedHandle, otherPlayer, type EngineContext, type PhaseModule } from '../modules'
import { boardUnitsOf, enemyModelsOnBoard, unitModels, unitModelsForCoherency } from '../state'
import type { Action, ModelPlacement, WeaponTarget } from '../actions'
import {
  EngineInvariantError,
  type DeclareTargetsDecision, type DeclaredTarget, type FightState, type GameState, type Model, type Objective,
  type ObjectiveId, type Path, type PendingDecision, type PlayerId, type Rejection, type UnitId, type Vec3, type WeaponId,
} from '../types'

// ---------- small helpers (mirrors charge.ts's own copies — see phases/README §6, no cross-module coupling) ----------

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

const ATTACK_CHOOSE_TOPICS = new Set(['saveType', 'hazardousCasualty', 'rerollOffer'])

function readMark(state: GameState, key: string): string | null {
  const prefix = `${key}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}
function writeMark(state: GameState, key: string, value: string): void {
  const prefix = `${key}=`
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  state.phaseState.marks.push(prefix + value)
}

// ---------- eligibility (R-9.1..R-9.3) ----------

function eligibleToFight(state: GameState, unitId: UnitId): boolean {
  return (leaderService.inEngagementWithEnemy?.(state, unitId) ?? false) || state.units[unitId].turn.chargedThisTurn
}

function hasFightsFirst(state: GameState, unitId: UnitId): boolean {
  const halves = leaderService.halves?.(state, unitId) ?? [unitId]
  return halves.every((id) => state.units[id]?.turn.fightsFirst || (hookService.eligibilityFor?.(state, id, 'fightFirst') ?? false))
}

// R-9.3: the Fights First step's membership is fixed the moment step 1 starts — a unit that only becomes eligible
// later (e.g. dragged into Engagement Range by someone else's pile-in/consolidation, R-9.11) fights in Remaining
// Combats even if it has Fights First (FIGHT-009). Snapshotted lazily on the first `doFightSelect` call while step
// is `fightsFirst` (not in `enter()`, which can run before the board is even set up in tests) and cached in a mark.
const FF_SNAPSHOT_KEY = 'fi:ffSnapshot'
function computeFfSnapshotIds(state: GameState): UnitId[] {
  const out: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.location !== 'board' || u.bodyguardUnitId) continue
    if (eligibleToFight(state, u.id) && hasFightsFirst(state, u.id)) out.push(u.id)
  }
  return out
}
function ffSnapshotSet(state: GameState): Set<UnitId> {
  const raw = readMark(state, FF_SNAPSHOT_KEY)
  return new Set(raw ? (JSON.parse(raw) as UnitId[]) : [])
}

function eligibleFighters(state: GameState, player: PlayerId, step: FightState['step']): UnitId[] {
  const fight = state.phaseState.fight!
  const fought = new Set(fight.fought)
  const ffSnapshot = step === 'fightsFirst' ? ffSnapshotSet(state) : null
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, player)) {
    if (u.bodyguardUnitId || fought.has(u.id) || u.id === fight.currentUnitId) continue
    if (!eligibleToFight(state, u.id)) continue
    if (ffSnapshot && !ffSnapshot.has(u.id)) continue
    out.push(u.id)
  }
  return out
}

// ---------- geometry: the fighting unit's own models vs. every enemy currently on the board ----------

interface FightGeometry { models: Model[]; enemies: Model[]; otherFriendly: Model[] }

function fightGeometry(state: GameState, unitId: UnitId): FightGeometry {
  const models = unitModelsForCoherency(state, unitId)
  const player = state.units[unitId].player
  const enemies = enemyModelsOnBoard(state, player)
  const mine = new Set(leaderService.halves?.(state, unitId) ?? [unitId])
  const otherFriendly: Model[] = []
  for (const u of boardUnitsOf(state, player)) if (!mine.has(u.id)) otherFriendly.push(...unitModels(state, u.id))
  return { models, enemies, otherFriendly }
}

// travel (2D, exact elliptical-base-aware) needed for `m` to close its horizontal gap with `target` to `stopGap` —
// see charge.ts's `contactCandidate` for why this is a binary search on `horizontalGap` rather than a scalar radius.
function contactPoint(m: Model, target: Model, stopGap: number): { point: Vec3; travel: number } {
  const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z
  const d = Math.hypot(dx, dz)
  if (d < EPS) return { point: { ...m.pos }, travel: 0 }
  const ux = dx / d, uz = dz / d
  const pointAt = (t: number): Vec3 => ({ x: m.pos.x + ux * t, y: m.pos.y, z: m.pos.z + uz * t })
  const gapAt = (t: number): number => horizontalGap({ pos: pointAt(t), facing: m.facing, base: m.base }, target)
  if (gapAt(0) <= stopGap + EPS) return { point: { ...m.pos }, travel: 0 }
  let lo = 0, hi = Math.max(d - 1e-4, 0)
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (gapAt(mid) > stopGap) lo = mid; else hi = mid
  }
  return { point: pointAt(hi), travel: hi }
}

// R-9.5/R-9.10 heuristic arrangement: a model already in base contact with an enemy never needs to move; otherwise
// closest-to-enemy models go first, each walking toward the nearest reachable Engagement Range point, capped by
// `maxDistance` and by terrain/board/overlap legality — a model that cannot legally improve its position stays put.
function planApproachEnemy(state: GameState, geo: FightGeometry, maxDistance: number): ResolvedPlacement[] {
  const stay = (m: Model): ResolvedPlacement => ({ model: m, from: m.pos, to: m.pos, facing: m.facing, path: [m.pos, m.pos], distance: 0 })
  if (geo.enemies.length === 0) return geo.models.map(stay)
  const order = [...geo.models].sort((a, b) => Math.min(...geo.enemies.map((t) => horizontalGap(a, t))) - Math.min(...geo.enemies.map((t) => horizontalGap(b, t))))
  const placed: ResolvedPlacement[] = []
  for (const m of order) {
    if (geo.enemies.some((t) => inBaseContact(m, t))) { placed.push(stay(m)); continue }
    let chosen: { point: Vec3; travel: number } | null = null
    for (const t of geo.enemies) {
      const c = contactPoint(m, t, ENGAGEMENT_H - 0.01)
      if (!chosen || c.travel < chosen.travel) chosen = c
    }
    if (!chosen) { placed.push(stay(m)); continue }
    let to: Vec3
    if (chosen.travel <= maxDistance + EPS) {
      to = chosen.point
    } else {
      const dx = chosen.point.x - m.pos.x, dz = chosen.point.z - m.pos.z
      const d = Math.hypot(dx, dz)
      const scale = d > EPS ? maxDistance / d : 0
      to = { x: m.pos.x + dx * scale, y: m.pos.y, z: m.pos.z + dz * scale }
    }
    to = { ...to, y: terrainService.heightAt(state, to.x, to.z) }
    const travel = dist2D(m.pos, to) + Math.abs(to.y - m.pos.y)
    if (travel > maxDistance + 1e-3) { placed.push(stay(m)); continue }
    const fp: Footprint = { pos: to, facing: m.facing, base: m.base }
    if (!whollyOnBoard(fp, state.board)) { placed.push(stay(m)); continue }
    const overlapBlockers: Footprint[] = [...placed.map((pl) => ({ pos: pl.to, facing: pl.facing, base: pl.model.base })), ...geo.otherFriendly]
    if (overlapBlockers.some((b) => basesOverlap(fp, b))) { placed.push(stay(m)); continue }
    const path: Path = [m.pos, to]
    if (pathCrossesModels(fp, path, geo.enemies)) { placed.push(stay(m)); continue }
    if (terrainService.crossesImpassable(state, m, path) || !terrainService.canEndAt(state, m, to).ok) { placed.push(stay(m)); continue }
    placed.push({ model: m, from: m.pos, to, facing: m.facing, path, distance: travel })
  }
  return placed
}

// R-9.10 fallback: every model walks (independently) toward the same fixed point (an objective marker), capped by
// `maxDistance`; used only when planApproachEnemy has no legal arrangement reaching Engagement Range of anything.
function planApproachPoint(state: GameState, models: Model[], point: Vec3, otherFriendly: Model[], enemies: Model[], maxDistance: number): ResolvedPlacement[] {
  const placed: ResolvedPlacement[] = []
  for (const m of models) {
    const dx = point.x - m.pos.x, dz = point.z - m.pos.z
    const d = Math.hypot(dx, dz)
    const travelWanted = Math.min(d, maxDistance)
    const scale = d > EPS ? travelWanted / d : 0
    let to: Vec3 = { x: m.pos.x + dx * scale, y: m.pos.y, z: m.pos.z + dz * scale }
    to = { ...to, y: terrainService.heightAt(state, to.x, to.z) }
    const travel = dist2D(m.pos, to) + Math.abs(to.y - m.pos.y)
    const fp: Footprint = { pos: to, facing: m.facing, base: m.base }
    const blockers: Footprint[] = [...placed.map((pl) => ({ pos: pl.to, facing: pl.facing, base: pl.model.base })), ...otherFriendly, ...enemies]
    if (travel > maxDistance + 1e-3 || !whollyOnBoard(fp, state.board) || blockers.some((b) => basesOverlap(fp, b))
      || pathCrossesModels(fp, [m.pos, to], enemies) || terrainService.crossesImpassable(state, m, [m.pos, to]) || !terrainService.canEndAt(state, m, to).ok) {
      placed.push({ model: m, from: m.pos, to: m.pos, facing: m.facing, path: [m.pos, m.pos], distance: 0 })
      continue
    }
    placed.push({ model: m, from: m.pos, to, facing: m.facing, path: [m.pos, to], distance: travel })
  }
  return placed
}

// shared by feasibility and validate(): checkPlacements gives coherency for free; the "within Engagement Range of
// >=1 enemy" test isn't expressible via checkPlacements' `mustEndInEngagementWith` (which needs a specific unit id)
// so it's checked directly against every enemy model.
function checkApproachArrangement(state: GameState, geo: FightGeometry, maxDistance: number, placements: ModelPlacement[]):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const constraints = emptyMoveConstraints(maxDistance, { coherency: true })
  const result = checkPlacements({ unitModels: geo.models, placements, constraints, otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board })
  if (result.rejection) return result
  for (const r of result.resolved) {
    if (r.distance <= EPS) continue
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    if (pathCrossesModels(fp, r.path, geo.enemies)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross an enemy model`, details: { modelId: r.model.id } } }
    if (terrainService.crossesImpassable(state, r.model, r.path)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path is blocked by terrain`, details: { modelId: r.model.id } } }
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
  }
  if (!unitsWithinEngagementRange(result.resolved.map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base })), geo.enemies)) {
    return { rejection: { code: 'E_ENGAGEMENT', reason: 'unit must end within engagement range of an enemy unit', details: {} } }
  }
  return result
}

function approachFeasible(state: GameState, geo: FightGeometry, maxDistance: number): boolean {
  if (geo.models.length === 0) return false
  const resolved = planApproachEnemy(state, geo, maxDistance)
  const placements: ModelPlacement[] = resolved.map((r) => ({ modelId: r.model.id, pos: r.to, facing: r.facing }))
  return checkApproachArrangement(state, geo, maxDistance, placements).rejection === null
}

// R-9.5/R-9.10: `model` ends closer to the enemy model it was CLOSEST to at the start of its own move [interp]
function closerToClosestEnemyAtStart(model: Model, from: Vec3, to: Vec3, enemies: Model[]): boolean {
  if (enemies.length === 0) return true
  let closest: Model | null = null, bestD = Infinity
  const fromFp: Footprint = { pos: from, facing: model.facing, base: model.base }
  for (const e of enemies) { const d = distance(fromFp, e); if (d < bestD) { bestD = d; closest = e } }
  if (!closest) return true
  const afterD = distance({ pos: to, facing: model.facing, base: model.base }, closest)
  return afterD < bestD - EPS
}

// could `model` legally have reached base contact with any enemy? own travel budget, board edge, terrain, not
// crossing another enemy's base, AND not overlapping `blockers` (the rest of the unit's own resolved arrangement
// plus other friendlies — FIGHT-013-crowd: a contact spot already taken by a teammate doesn't count) — mirrors
// charge.ts's `couldReachBaseContact`.
function couldReachBaseContact(state: GameState, geo: FightGeometry, model: Model, maxDistance: number, blockers: Footprint[]): boolean {
  for (const t of geo.enemies) {
    const c = contactPoint(model, t, 0)
    if (c.travel > maxDistance + 1e-3) continue
    const to = { ...c.point, y: terrainService.heightAt(state, c.point.x, c.point.z) }
    const travel = dist2D(model.pos, to) + Math.abs(to.y - model.pos.y)
    if (travel > maxDistance + 1e-3) continue
    const fp: Footprint = { pos: to, facing: model.facing, base: model.base }
    if (!whollyOnBoard(fp, state.board)) continue
    if (blockers.some((b) => basesOverlap(fp, b))) continue
    if (pathCrossesModels(fp, [model.pos, to], geo.enemies)) continue
    if (!terrainService.canEndAt(state, model, to).ok) continue
    return true
  }
  return false
}

// ---------- R-9.10 objective fallback ----------

// picks the CLOSEST marker first, then tests whether it is reachable — not the closest one that happens to be
// reachable among however Object.values happens to order them (both give the same set in the common case, but the
// finding calls for the deterministic closest-first search, which also short-circuits as soon as one is found).
function nearestReachableObjective(state: GameState, geo: FightGeometry, maxDistance: number): ObjectiveId | null {
  const distanceTo = (obj: Objective): number => Math.min(...geo.models.map((m) => Math.hypot(m.pos.x - obj.pos.x, m.pos.z - obj.pos.z)))
  const byDistance = Object.values(state.objectives).filter((o) => !o.removed).sort((a, b) => distanceTo(a) - distanceTo(b))
  for (const obj of byDistance) {
    const point: Vec3 = { x: obj.pos.x, y: terrainService.heightAt(state, obj.pos.x, obj.pos.z), z: obj.pos.z }
    const resolved = planApproachPoint(state, geo.models, point, geo.otherFriendly, geo.enemies, maxDistance)
    const placements: ModelPlacement[] = resolved.map((r) => ({ modelId: r.model.id, pos: r.to, facing: r.facing }))
    const constraints = emptyMoveConstraints(maxDistance, { coherency: true })
    const check = checkPlacements({ unitModels: geo.models, placements, constraints, otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board })
    if (check.rejection) continue
    const finals = check.resolved.map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base }))
    if (!finals.some((f) => withinObjectiveRange(f, obj, 0, OBJECTIVE_RANGE, state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS))) continue
    return obj.id
  }
  return null
}

// ---------- melee weapon selection (R-9.7) ----------

function meleeWeaponIdsOf(state: GameState, modelId: UnitId): WeaponId[] {
  return state.models[modelId].weapons.filter((w) => state.weapons[w]?.kind === 'melee')
}

// resolved weapon ids this model fights with: its one chosen non-EXTRA-ATTACKS melee weapon (auto-picked when there
// is only one; a `chooseOption` decision when there is a real choice — never exercised by Combat Patrol data) plus
// every [EXTRA ATTACKS] melee weapon it carries (R-9.7).
function resolveModelWeapons(ctx: EngineContext, modelId: UnitId): WeaponId[] | 'pending' {
  const s = ctx.state
  const all = meleeWeaponIdsOf(s, modelId)
  const extra = all.filter((w) => weaponService.hasAbility(s.weapons[w], 'EXTRA_ATTACKS'))
  const normal = all.filter((w) => !weaponService.hasAbility(s.weapons[w], 'EXTRA_ATTACKS'))
  if (normal.length <= 1) return [...normal, ...extra]
  const key = `fi:mw:${modelId}`
  const chosen = readMark(s, key)
  if (chosen !== null) return [chosen as WeaponId, ...extra]
  const player = s.units[s.models[modelId].unitId].player
  ctx.decide({
    kind: 'chooseOption', player, window: 'fight.unitSelected', canPass: false,
    context: { topic: 'meleeWeapon', unitId: s.models[modelId].unitId, abilityId: null, data: { modelId } },
    options: normal.map((w) => ({ id: w, label: s.weapons[w]?.name ?? w, action: { type: 'chooseOption', player, decisionId: '', optionId: w } })),
  })
  return 'pending'
}

function attacksFor(ctx: EngineContext, modelId: UnitId, weaponId: WeaponId): number {
  const s = ctx.state
  const key = `fi:atk:${modelId}:${weaponId}`
  const cached = readMark(s, key)
  if (cached !== null) return Number(cached)
  const weapon = weaponService.effectiveWeapon(s, modelId, weaponId)
  const unit = s.units[s.models[modelId].unitId]
  const { total } = ctx.rollExpr(weapon.A, { purpose: 'attacks', player: unit.player, unitId: unit.id, modelId, weaponId })
  writeMark(s, key, String(total))
  return total
}

// R-9.6: models that may attack — within ER of an enemy unit, or in base contact with a friendly model of the same
// unit that is itself in base contact with an enemy unit.
function attackEligibleModels(state: GameState, unitId: UnitId): Model[] {
  const models = unitModelsForCoherency(state, unitId)
  const enemies = enemyModelsOnBoard(state, state.units[unitId].player)
  const inBaseContactWithEnemy = new Set(models.filter((m) => enemies.some((e) => inBaseContact(m, e))).map((m) => m.id))
  const inER = new Set(models.filter((m) => enemies.some((e) => horizontalGap(m, e) <= ENGAGEMENT_H + EPS && Math.abs(m.pos.y - e.pos.y) <= 5 + EPS)).map((m) => m.id))
  const eligible = new Set(inER)
  for (const m of models) {
    if (eligible.has(m.id)) continue
    if (models.some((f) => f.id !== m.id && inBaseContact(m, f) && inBaseContactWithEnemy.has(f.id))) eligible.add(m.id)
  }
  return models.filter((m) => eligible.has(m.id))
}

// canonical enemy unit ids currently on the board (attached leader halves folded into their bodyguard)
function enemyUnitIdsOnBoard(state: GameState, player: PlayerId): UnitId[] {
  const out: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.player === player || u.location !== 'board' || u.bodyguardUnitId) continue
    out.push(u.id)
  }
  return out
}

// R-9.8: `model` may target `enemyId` if within ER of it, or in base contact with a friendly model of its own unit
// that is itself in base contact with THAT enemy unit specifically.
function legalTargetsFor(state: GameState, unitId: UnitId, model: Model, enemyIds: UnitId[]): UnitId[] {
  const models = unitModelsForCoherency(state, unitId)
  const out: UnitId[] = []
  for (const enemyId of enemyIds) {
    const enemyModels = (leaderService.combinedModels ? leaderService.combinedModels(state, enemyId) : unitModels(state, enemyId)).filter((m) => state.units[m.unitId]?.location === 'board')
    if (enemyModels.length === 0) continue
    if (enemyModels.some((e) => horizontalGap(model, e) <= ENGAGEMENT_H + EPS && Math.abs(model.pos.y - e.pos.y) <= 5 + EPS)) { out.push(enemyId); continue }
    const chained = models.some((f) => f.id !== model.id && inBaseContact(model, f) && enemyModels.some((e) => inBaseContact(f, e)))
    if (chained) out.push(enemyId)
  }
  return out
}

// ---------- pile in (R-9.5) ----------

function doPileIn(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  if (ctx.marked(`fi:piledIn:${unitId}`)) return 'progress'
  const geo = fightGeometry(s, unitId)
  const dist = hookService.pileInDistance?.(s, unitId, 3) ?? 3
  const already = unitsWithinEngagementRange(geo.models, geo.enemies)
  if (!already && !approachFeasible(s, geo, dist)) { ctx.once(`fi:piledIn:${unitId}`); return 'progress' }
  ctx.decide({
    kind: 'pileIn', player: s.units[unitId].player, window: 'fight.unitSelected', canPass: false,
    context: { unitId, distance: dist }, constraints: emptyMoveConstraints(dist, { coherency: true }),
  })
  return 'pending'
}

function applyPileIn(ctx: EngineContext, unitId: UnitId, action: Extract<Action, { type: 'pileIn' }>): Rejection | void {
  const s = ctx.state
  const geo = fightGeometry(s, unitId)
  const dist = Number(readMark(s, `fi:dist:${unitId}`) ?? hookService.pileInDistance?.(s, unitId, 3) ?? 3)
  const check = checkApproachArrangement(s, geo, dist, action.placements)
  if (check.rejection) throw new EngineInvariantError('fight: stored pile-in placements failed re-validation', { rejection: check.rejection })
  for (const r of check.resolved) if (r.distance > EPS) { r.model.pos = r.to; r.model.facing = r.facing }
  ctx.emit({ type: 'PiledIn', unitId, paths: Object.fromEntries(check.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])) })
  ctx.once(`fi:piledIn:${unitId}`)
}

// ---------- declare targets + attacks (R-9.6..R-9.9) ----------

function doDeclareTargets(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  if (ctx.marked(`fi:declared:${unitId}`)) return 'progress'
  const player = s.units[unitId].player
  const attackers = attackEligibleModels(s, unitId)
  for (const m of attackers) if (resolveModelWeapons(ctx, m.id) === 'pending') return 'pending'
  const enemyIds = enemyUnitIdsOnBoard(s, player)
  const weapons: DeclareTargetsDecision['context']['weapons'] = []
  for (const m of attackers) {
    const weaponIds = resolveModelWeapons(ctx, m.id) as WeaponId[]
    for (const weaponId of weaponIds) {
      const weapon = weaponService.effectiveWeapon(s, m.id, weaponId)
      weapons.push({ modelId: m.id, weaponId, profileGroup: weapon.profileGroup ?? null, legalTargets: legalTargetsFor(s, unitId, m, enemyIds), attacks: attacksFor(ctx, m.id, weaponId) })
    }
  }
  if (!weapons.some((w) => w.legalTargets.length > 0)) { ctx.once(`fi:declared:${unitId}`); return 'progress' }
  const engagedWith = [...new Set(weapons.flatMap((w) => w.legalTargets))]
  ctx.decide({
    kind: 'declareTargets', player, window: 'fight.unitSelected', canPass: false,
    context: { unitId, attackKind: 'melee', overwatch: false, weapons, engagedWith },
  })
  return 'pending'
}

function validateDeclareTargets(pending: Extract<PendingDecision, { kind: 'declareTargets' }>, action: Extract<Action, { type: 'declareTargets' }>): Rejection | null {
  const totals = new Map<string, number>()
  for (const w of pending.context.weapons) totals.set(`${w.modelId}|${w.weaponId}`, w.attacks ?? 0)
  const sums = new Map<string, number>()
  for (const t of action.targets) {
    const key = `${t.modelId}|${t.weaponId}`
    const wCtx = pending.context.weapons.find((w) => w.modelId === t.modelId && w.weaponId === t.weaponId)
    if (!wCtx) return { code: 'E_SCHEMA', reason: `${t.modelId} is not attacking with ${t.weaponId}` }
    if (!wCtx.legalTargets.includes(t.targetUnitId)) return { code: 'E_INVALID_TARGET', reason: `${t.modelId} may not target ${t.targetUnitId} with ${t.weaponId}`, details: { modelId: t.modelId, targetUnitId: t.targetUnitId } }
    sums.set(key, (sums.get(key) ?? 0) + (t.attacks ?? (totals.get(key) as number)))
  }
  for (const [key, total] of totals) {
    if (total <= 0) continue
    if ((sums.get(key) ?? 0) !== total) return { code: 'E_SCHEMA', reason: `attacks for ${key} must sum to ${total}`, details: { key, total } }
  }
  return null
}

function applyDeclareTargets(ctx: EngineContext, action: Extract<Action, { type: 'declareTargets' }>): void {
  const declared: DeclaredTarget[] = action.targets.map((t: WeaponTarget) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId, profileGroup: t.profileGroup ?? null, attacks: t.attacks ?? null }))
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: action.unitId, overwatch: false, targets: declared })
  ctx.once(`fi:declared:${action.unitId}`)
}

function doAttacks(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  if (!s.phaseState.attack) return 'progress'
  if (!ctx.marked(`fi:tdWindow:${unitId}`)) {
    if (ctx.window('fight.targetsDeclared', unitId, ctx.order.defensive(otherPlayer(s.units[unitId].player)), { unitId })) return 'pending'
    ctx.once(`fi:tdWindow:${unitId}`)
  }
  if (attackService.advance(ctx) === 'pending') return 'pending'
  return 'progress'
}

// ---------- consolidate (R-9.10) ----------

function doConsolidate(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  if (ctx.marked(`fi:consolidated:${unitId}`)) return 'progress'
  const geo = fightGeometry(s, unitId)
  const dist = hookService.consolidateDistance?.(s, unitId, 3) ?? 3
  const alreadyEr = unitsWithinEngagementRange(geo.models, geo.enemies)
  const enemyFeasible = alreadyEr || approachFeasible(s, geo, dist)
  let objectiveId: ObjectiveId | null = null
  if (!enemyFeasible) objectiveId = nearestReachableObjective(s, geo, dist)
  if (!enemyFeasible && objectiveId === null) { ctx.once(`fi:consolidated:${unitId}`); return 'progress' }
  writeMark(s, `fi:dist:${unitId}`, String(dist))
  ctx.decide({
    kind: 'consolidate', player: s.units[unitId].player, window: 'fight.attacksResolved', canPass: false,
    context: { unitId, distance: dist, objectiveFallback: enemyFeasible ? null : objectiveId }, constraints: emptyMoveConstraints(dist, { coherency: true }),
  })
  return 'pending'
}

function checkConsolidateArrangement(state: GameState, geo: FightGeometry, dist: number, objectiveId: ObjectiveId | null, placements: ModelPlacement[]):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  if (objectiveId === null) return checkApproachArrangement(state, geo, dist, placements)
  const constraints = emptyMoveConstraints(dist, { coherency: true })
  const result = checkPlacements({ unitModels: geo.models, placements, constraints, otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board })
  if (result.rejection) return result
  const obj = state.objectives[objectiveId]
  for (const r of result.resolved) {
    if (r.distance <= EPS) continue
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    if (pathCrossesModels(fp, r.path, geo.enemies)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross an enemy model`, details: { modelId: r.model.id } } }
    if (terrainService.crossesImpassable(state, r.model, r.path)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path is blocked by terrain`, details: { modelId: r.model.id } } }
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
    // FIGHT-023-toward: a moved model must end closer to the marker, not merely still in range of it
    if (obj && dist2D(r.to, obj.pos) >= dist2D(r.from, obj.pos) - EPS) {
      return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} must end closer to the objective marker than it started`, details: { modelId: r.model.id } } }
    }
  }
  if (obj && !result.resolved.some((r) => withinObjectiveRange({ pos: r.to, facing: r.facing, base: r.model.base }, obj, 0, OBJECTIVE_RANGE, state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS))) {
    return { rejection: { code: 'E_OUT_OF_RANGE', reason: 'unit must end within range of the objective marker', details: { objectiveId } } }
  }
  return result
}

function applyConsolidate(ctx: EngineContext, unitId: UnitId, action: Extract<Action, { type: 'consolidate' }>, pending: Extract<PendingDecision, { kind: 'consolidate' }>): Rejection | void {
  const s = ctx.state
  const geo = fightGeometry(s, unitId)
  const check = checkConsolidateArrangement(s, geo, pending.context.distance, pending.context.objectiveFallback, action.placements)
  if (check.rejection) throw new EngineInvariantError('fight: stored consolidate placements failed re-validation', { rejection: check.rejection })
  for (const r of check.resolved) if (r.distance > EPS) { r.model.pos = r.to; r.model.facing = r.facing }
  ctx.emit({ type: 'Consolidated', unitId, paths: Object.fromEntries(check.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])) })
  ctx.once(`fi:consolidated:${unitId}`)
}

// ---------- select / drive one unit's whole activation ----------

// R-9.12 [FIGHT-025]: a pending Counter-offensive reaction always names one specific unit to fight next, regardless
// of which step is current and regardless of what else might independently be eligible — it is offered (and
// consumed only once chosen, in `handle`) ahead of, and instead of, the ordinary alternation below.
const COUNTER_RESUME_KEY = 'fi:coResume'

function doFightSelect(ctx: EngineContext): 'pending' | 'nextStep' | 'done' {
  const s = ctx.state
  const fight = s.phaseState.fight!
  // R-9.3: snapshot the Fights First step's eligible set the first time it is consulted (board setup is complete by
  // then, unlike in `enter()`, which some tests call before placing any units) and cache it for the rest of step 1.
  if (fight.step === 'fightsFirst' && readMark(s, FF_SNAPSHOT_KEY) === null) {
    writeMark(s, FF_SNAPSHOT_KEY, JSON.stringify(computeFfSnapshotIds(s)))
  }
  const co = pendingReactions(s, 'counterOffensive')[0]
  if (co) {
    ctx.decide({
      kind: 'chooseFightUnit', player: co.player, window: 'fight.start', canPass: false,
      context: { step: fight.step, eligible: [co.unitId] },
      options: [{ id: co.unitId, label: co.unitId, action: { type: 'chooseFightUnit', player: co.player, decisionId: '', unitId: co.unitId } }],
    })
    return 'pending'
  }
  const primary = fight.nextToSelect
  const secondary = otherPlayer(primary)
  let player = primary
  let eligible = eligibleFighters(s, primary, fight.step)
  if (eligible.length === 0) {
    eligible = eligibleFighters(s, secondary, fight.step)
    player = secondary
  }
  if (eligible.length === 0) return fight.step === 'fightsFirst' ? 'nextStep' : 'done'
  ctx.decide({
    kind: 'chooseFightUnit', player, window: 'fight.start', canPass: false,
    context: { step: fight.step, eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseFightUnit', player, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

function finishUnit(ctx: EngineContext, unitId: UnitId, player: PlayerId): void {
  const s = ctx.state
  const fight = s.phaseState.fight!
  for (const id of leaderService.halves?.(s, unitId) ?? [unitId]) if (s.units[id]) s.units[id].turn.foughtThisPhase = true
  if (!fight.fought.includes(unitId)) fight.fought.push(unitId)
  // FIGHT-025: once the Counter-offensive unit itself finishes, restore the player who would have been next (saved
  // when it was selected — `nextToSelect` right before the reaction fired) rather than flipping from its own owner.
  const resume = readMark(s, COUNTER_RESUME_KEY)
  if (resume !== null) {
    fight.nextToSelect = resume as PlayerId
    s.phaseState.marks = s.phaseState.marks.filter((x) => !x.startsWith(`${COUNTER_RESUME_KEY}=`))
  } else if (fight.counterOffensive) {
    fight.counterOffensive = false
  } else {
    fight.nextToSelect = otherPlayer(player)
  }
  fight.currentUnitId = null
  fight.subStep = 'select'
}

function driveFightUnit(ctx: EngineContext): 'pending' | 'progress' {
  const s = ctx.state
  const fight = s.phaseState.fight!
  const unitId = fight.currentUnitId as UnitId
  const unit = s.units[unitId]
  if (!unit || unit.location !== 'board') { finishUnit(ctx, unitId, unit?.player ?? s.activePlayer); return 'progress' }

  if (!ctx.marked(`fi:selWindow:${unitId}`)) {
    // FIGHT-034-order: fight.unitSelected is not a defensive (targetsDeclared-style) window — the active player
    // goes first, same as fight.attacksResolved below.
    if (ctx.window('fight.unitSelected', unitId, ctx.order.active(), { unitId })) return 'pending'
    ctx.once(`fi:selWindow:${unitId}`)
  }

  if (fight.subStep === 'pileIn') {
    const r = doPileIn(ctx, unitId)
    if (r === 'pending') return 'pending'
    fight.subStep = 'declareTargets'
  }
  if (fight.subStep === 'declareTargets') {
    const r = doDeclareTargets(ctx, unitId)
    if (r === 'pending') return 'pending'
    fight.subStep = 'attacks'
  }
  if (fight.subStep === 'attacks') {
    const r = doAttacks(ctx, unitId)
    if (r === 'pending') return 'pending'
    fight.subStep = 'consolidate'
  }
  if (fight.subStep === 'consolidate') {
    const r = doConsolidate(ctx, unitId)
    if (r === 'pending') return 'pending'
    if (!ctx.marked(`fi:arWindow:${unitId}`)) {
      if (ctx.window('fight.attacksResolved', unitId, ctx.order.active(), { unitId })) return 'pending'
      ctx.once(`fi:arWindow:${unitId}`)
    }
  }
  finishUnit(ctx, unitId, unit.player)
  return 'progress'
}

export const fightModule: PhaseModule = {
  name: 'fight',
  enter(ctx) {
    const s = ctx.state
    s.step = 'fightsFirst'
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: ctx.opponentOf(s.activePlayer), counterOffensive: false }
    s.phaseState.attack = null
  },
  advance(ctx) {
    const s = ctx.state
    for (;;) {
      const fight = s.phaseState.fight!
      if (fight.currentUnitId) {
        const r = driveFightUnit(ctx)
        if (r === 'pending') return 'pending'
        continue
      }
      const r = doFightSelect(ctx)
      if (r === 'pending') return 'pending'
      if (r === 'nextStep') {
        fight.step = 'remaining'
        fight.nextToSelect = ctx.opponentOf(s.activePlayer)
        continue
      }
      return 'done'
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'pileIn') {
      if (action.type !== 'pileIn') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'pileIn is for the wrong unit', details: { expected: pending.context.unitId } }
      const geo = fightGeometry(state, action.unitId)
      const check = checkApproachArrangement(state, geo, pending.context.distance, action.placements)
      if (check.rejection) return check.rejection
      for (const r of check.resolved) {
        if (r.distance <= EPS) continue
        if (!closerToClosestEnemyAtStart(r.model, r.from, r.to, geo.enemies)) return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} must end closer to the enemy model it started closest to`, details: { modelId: r.model.id } }
        const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
        const blockers: Footprint[] = [
          ...check.resolved.filter((o) => o.model.id !== r.model.id).map((o) => ({ pos: o.to, facing: o.facing, base: o.model.base })),
          ...geo.otherFriendly,
        ]
        if (!geo.enemies.some((e) => inBaseContact(fp, e)) && couldReachBaseContact(state, geo, r.model, pending.context.distance, blockers)) {
          return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} could end in base contact with an enemy and must`, details: { modelId: r.model.id } }
        }
      }
      return null
    }
    if (pending.kind === 'declareTargets') {
      if (action.type !== 'declareTargets') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'declareTargets is for the wrong unit', details: { expected: pending.context.unitId } }
      return validateDeclareTargets(pending, action)
    }
    if (pending.kind === 'consolidate') {
      if (action.type !== 'consolidate') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'consolidate is for the wrong unit', details: { expected: pending.context.unitId } }
      const geo = fightGeometry(state, action.unitId)
      const check = checkConsolidateArrangement(state, geo, pending.context.distance, pending.context.objectiveFallback, action.placements)
      if (check.rejection) return check.rejection
      if (pending.context.objectiveFallback === null) {
        for (const r of check.resolved) {
          if (r.distance <= EPS) continue
          if (!closerToClosestEnemyAtStart(r.model, r.from, r.to, geo.enemies)) return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} must end closer to the enemy model it started closest to`, details: { modelId: r.model.id } }
          const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
          const blockers: Footprint[] = [
            ...check.resolved.filter((o) => o.model.id !== r.model.id).map((o) => ({ pos: o.to, facing: o.facing, base: o.model.base })),
            ...geo.otherFriendly,
          ]
          if (!geo.enemies.some((e) => inBaseContact(fp, e)) && couldReachBaseContact(state, geo, r.model, pending.context.distance, blockers)) {
            return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} could end in base contact with an enemy and must`, details: { modelId: r.model.id } }
          }
        }
      }
      return null
    }
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') return { code: 'E_NOT_AN_OPTION', reason: `fight: pass is not valid for ${pending.kind}` }
    if (pending.kind === 'chooseFightUnit' && action.type === 'chooseFightUnit') {
      const fight = s.phaseState.fight!
      const co = consumeReaction(s, 'counterOffensive', action.unitId)
      if (co) writeMark(s, COUNTER_RESUME_KEY, fight.nextToSelect)
      fight.currentUnitId = action.unitId
      fight.subStep = 'pileIn'
      ctx.emit({ type: 'FightUnitSelected', unitId: action.unitId, step: fight.step })
      return
    }
    if (pending.kind === 'pileIn' && action.type === 'pileIn') return applyPileIn(ctx, action.unitId, action)
    if (pending.kind === 'declareTargets' && action.type === 'declareTargets') return applyDeclareTargets(ctx, action)
    if (pending.kind === 'consolidate' && action.type === 'consolidate') return applyConsolidate(ctx, action.unitId, action, pending)
    if (pending.kind === 'chooseOption' && pending.context.topic === 'meleeWeapon' && action.type === 'chooseOption') {
      const modelId = (pending.context.data as { modelId: UnitId }).modelId
      writeMark(s, `fi:mw:${modelId}`, action.optionId)
      return
    }
    if (s.phaseState.attack && (pending.kind === 'allocateAttack' || (pending.kind === 'chooseOption' && ATTACK_CHOOSE_TOPICS.has(pending.context.topic)))) {
      return attackService.handler.handle(ctx, action, pending)
    }
    return notImplementedHandle('fight')(ctx, action, pending)
  },
}
