// Fight phase module (10-rules §9, docs/spec/12-rules-test-checklist.md FIGHT-*). Owner: W1-E.
//
// State machine: `phaseState.fight` (frozen FightState) tracks which of the two top-level steps we're in
// (`fightsFirst` then `remaining`, R-9.1/R-9.3) and, while `currentUnitId` is set, which sub-step of that unit's
// activation (`pileIn` → `declareTargets` → `attacks` → `consolidate`, R-9.4) is in progress. `nextToSelect` is the
// authoritative "whose turn" for ordinary alternation. Counter-offensive (code-hooks.ts) pushes a `counterOffensive`
// reaction naming the specific unit to fight next; `doFightSelect` consumes it before any ordinary selection (so it
// is offered whatever the current step, and only that one unit is offered — FIGHT-025), and the value `nextToSelect`
// held just before the reaction fires is replaced: the Counter-offensive unit counts as a selection, so the opponent
// selects next (RC-040).
//
// Documented interpretations (see STATUS/issues):
// - Pile-in / consolidate feasibility and the actual arrangement share one heuristic search (`planApproachEnemy`,
//   closest-model-first, walking each model toward the nearest enemy contact/Engagement Range spot, ranking up behind
//   touching unit-mates otherwise, capped by the allowance; the legal plans are ranked by how many models may then
//   fight) — the same non-exhaustive style as charge.ts's `planChargeMove`, not a combinatorial proof.
// - R-9.5/R-9.10 "must end in base contact if possible" is checked per model against its own travel budget plus
//   overlap with the rest of the unit's own resolved arrangement and other friendlies (FIGHT-013-crowd) — like
//   charge.ts's R-8.5, still not a joint re-optimisation of the whole arrangement.
// - A model may pick only one non-[EXTRA ATTACKS] melee weapon (`chooseOption` topic `meleeWeapon` when it has more
//   than one); multi-profile melee weapons are not offered a `weaponProfile` choice — the model's first profile in
//   its `weapons` list is used. Neither situation occurs anywhere in the Combat Patrol data this engine ships with.
import { filterValid, optionActions, repairCoherency } from './legal'
import { resolveDeferredActivations } from '../deferred'
import {
  EPS, ENGAGEMENT_H, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, basesOverlap, checkPlacements, dist2D, distance,
  emptyMoveConstraints, horizontalGap, inBaseContact, pathCrossesModels, unitsWithinEngagementRange, whollyOnBoard,
  withinObjectiveRange,
  type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import { cultAmbushOnMoveEnded } from '../cult-ambush'
import { leaderService } from '../leaders'
import { attackService } from '../attack'
import { deferredDeaths, purgeDeferredDeaths, resolveDeferredDeaths } from '../fight-on-death'
import { terrainService } from '../terrain'
import { crossesBigFriendly } from './movement'
import { weaponService } from '../weapons'
import { pendingReactions, consumeReaction } from '../code-hooks'
import { finishDeferredRemovalOfUnit, pendingDeathBlowUnits } from '../deathblow'
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
  return halves.every((id) => state.units[id]?.turn.fightsFirst || (hookService.eligibilityFor?.(state, id, 'fightFirst') ?? false)
    || (state.datasheets[state.units[id]?.datasheetId]?.coreAbilities.some((c) => c.ability === 'FIGHTS_FIRST') ?? false))
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

interface FightGeometry { models: Model[]; enemies: Model[]; otherFriendly: Model[]; movable?: Set<string> }

// RC-ADE-10 / CSM-09 / TYR-02: while a deferred (fight-on-death) model's own pile-in decision is open, the mark `fidp` names the
// unit and the models allowed to move; the geometry then adds those 0-wound models to the unit's live models (coherency is
// checked against the live models) and only they may move.
const DEFERRED_PILE_MARK = 'fidp'
interface DeferredPileIn { key: string; unitId: UnitId; ids: string[] }
function deferredPileInMark(state: GameState): DeferredPileIn | null {
  const raw = readMark(state, DEFERRED_PILE_MARK)
  return raw ? (JSON.parse(raw) as DeferredPileIn) : null
}

function fightGeometry(state: GameState, unitId: UnitId): FightGeometry {
  let models = unitModelsForCoherency(state, unitId)
  let movable: Set<string> | undefined
  const dp = deferredPileInMark(state)
  if (dp && dp.unitId === unitId) {
    const have = new Set(models.map((m) => m.id))
    models = [...models, ...dp.ids.filter((id) => !have.has(id) && state.models[id]).map((id) => state.models[id])]
    movable = new Set(dp.ids)
  }
  const player = state.units[unitId].player
  const enemies = enemyModelsOnBoard(state, player)
  const mine = new Set(leaderService.halves?.(state, unitId) ?? [unitId])
  const otherFriendly: Model[] = []
  for (const u of boardUnitsOf(state, player)) if (!mine.has(u.id)) otherFriendly.push(...unitModels(state, u.id))
  return { models, enemies, otherFriendly, ...(movable ? { movable } : {}) }
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

// point at horizontal gap `stopGap` from `target` in direction `angle` from its centre (adapted from charge.ts's ringPoint)
function rankRingPoint(target: Footprint, m: Model, angle: number, stopGap: number): Vec3 {
  const ux = Math.cos(angle), uz = Math.sin(angle)
  const pointAt = (t: number): Vec3 => ({ x: target.pos.x + ux * t, y: m.pos.y, z: target.pos.z + uz * t })
  const gapAt = (t: number): number => horizontalGap({ pos: pointAt(t), facing: m.facing, base: m.base }, target)
  let hi = target.base.radius + m.base.radius + Math.max(stopGap, 0) + 2
  for (let guard = 0; gapAt(hi) <= stopGap && guard < 20; guard++) hi *= 1.5
  let lo = 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (gapAt(mid) <= stopGap) lo = mid; else hi = mid
  }
  return pointAt(lo)
}

// R-9.5/R-9.10 heuristic arrangement: a model already in base contact with an enemy never needs to move; otherwise
// closest-to-enemy models go first, each walking toward the nearest reachable Engagement Range point (straight in, or
// around the enemy's base when the straight spot is taken), capped by `maxDistance` and by terrain/board/overlap
// legality. A model that cannot get within Engagement Range itself ranks up (R-9.6) into base contact with any
// unit-mate that ends in base contact with an enemy (including ones that started there); a second pass retries every
// model still unable to fight once the whole front rank is known. A model that cannot legally improve stays put.
function planApproachEnemy(state: GameState, geo: FightGeometry, maxDistance: number, stopGap = ENGAGEMENT_H - 0.01, farFirst = false): ResolvedPlacement[] {
  const stay = (m: Model): ResolvedPlacement => ({ model: m, from: m.pos, to: m.pos, facing: m.facing, path: [m.pos, m.pos], distance: 0 })
  if (geo.enemies.length === 0) return geo.models.map(stay)
  const minGap = (m: Model): number => Math.min(...geo.enemies.map((t) => horizontalGap(m, t)))
  const order = [...geo.models].sort((a, b) => minGap(a) - minGap(b))
  const placed: ResolvedPlacement[] = []
  const deferred: { i: number; m: Model; direct: ResolvedPlacement | null }[] = []
  const lifted = new Set<string>() // unit-mates temporarily ignored as blockers while the second pass swaps spots
  const fpOf = (pl: ResolvedPlacement): Footprint => ({ pos: pl.to, facing: pl.facing, base: pl.model.base })
  const inER = (pl: ResolvedPlacement): boolean => geo.enemies.some((e) => horizontalGap(fpOf(pl), e) <= ENGAGEMENT_H && Math.abs(pl.to.y - e.pos.y) <= 5 + EPS)
  const touchesEnemy = (pl: ResolvedPlacement): boolean => geo.enemies.some((e) => inBaseContact(fpOf(pl), e))
  // legality of one model ending at `to0` (budget, board, overlaps, enemy crossing, terrain); null when illegal
  const tryPlace = (m: Model, to0: Vec3): ResolvedPlacement | null => {
    const to = { ...to0, y: terrainService.heightAt(state, to0.x, to0.z) }
    const travel = dist2D(m.pos, to) + Math.abs(to.y - m.pos.y)
    if (travel > maxDistance + 1e-3) return null
    const fp: Footprint = { pos: to, facing: m.facing, base: m.base }
    if (!whollyOnBoard(fp, state.board)) return null
    const overlapBlockers: Footprint[] = [...placed.filter((pl) => pl.model.id !== m.id && !lifted.has(pl.model.id)).map(fpOf), ...geo.otherFriendly, ...geo.enemies]
    if (overlapBlockers.some((b) => basesOverlap(fp, b))) return null
    const path: Path = [m.pos, to]
    if (pathCrossesModels(fp, path, geo.enemies) || crossesBigFriendly(state, m, fp, path, geo.otherFriendly)) return null
    if (terrainService.crossesImpassable(state, m, path) || !terrainService.canEndAt(state, m, to).ok) return null
    return { model: m, from: m.pos, to, facing: m.facing, path, distance: travel }
  }
  // shortest legal spot on a ring of horizontal gap `gap` around one of `anchors` that also ends closer to the enemy
  // model this model started closest to (R-9.5)
  const bestOnRings = (m: Model, anchors: Footprint[], gap: number): ResolvedPlacement | null => {
    let best: ResolvedPlacement | null = null
    for (const a of anchors) {
      if (horizontalGap(m, a) > maxDistance + gap + 0.05) continue
      // 48 spots round the ring, plus a fan around the nearest spot (straight back toward the model), which a model
      // at the very edge of its allowance can only just reach
      const toward = Math.atan2(m.pos.z - a.pos.z, m.pos.x - a.pos.x)
      const angles = [...Array.from({ length: 48 }, (_, i) => (2 * Math.PI * i) / 48), ...[0, 1, -1, 2, -2, 4, -4, 7, -7, 11, -11].map((k) => toward + (k * Math.PI) / 72)]
      for (const ang of angles) {
        const cand = tryPlace(m, rankRingPoint(a, m, ang, gap))
        if (!cand || (best && cand.distance >= best.distance)) continue
        if (!closerToClosestEnemyAtStart(m, m.pos, cand.to, geo.enemies)) continue
        best = cand
      }
    }
    return best
  }
  // around an enemy's base when the straight-line spot is blocked (crowded front, curved line)
  const aroundEnemy = (m: Model): ResolvedPlacement | null => bestOnRings(m, geo.enemies, Math.min(stopGap, 0.004))
  // R-9.6 rank-up: base contact with any placed unit-mate that is itself in base contact with an enemy
  const rankUp = (m: Model): ResolvedPlacement | null => bestOnRings(m, placed.filter((pl) => pl.model.id !== m.id && touchesEnemy(pl)).map(fpOf), 0.004)
  const directFor = (m: Model): ResolvedPlacement | null => {
    let chosen: { point: Vec3; travel: number } | null = null
    for (const t of geo.enemies) {
      const c = contactPoint(m, t, stopGap)
      if (!chosen || c.travel < chosen.travel) chosen = c
    }
    if (!chosen) return null
    let to: Vec3
    if (chosen.travel <= maxDistance + EPS) {
      to = chosen.point
    } else {
      const dx = chosen.point.x - m.pos.x, dz = chosen.point.z - m.pos.z
      const d = Math.hypot(dx, dz)
      const scale = d > EPS ? maxDistance / d : 0
      to = { x: m.pos.x + dx * scale, y: m.pos.y, z: m.pos.z + dz * scale }
    }
    return tryPlace(m, to)
  }
  for (const m of order) {
    if (geo.movable && !geo.movable.has(m.id)) { placed.push(stay(m)); continue } // a deferred pile-in moves only the deferred models
    if (geo.enemies.some((t) => inBaseContact(m, t))) { placed.push(stay(m)); continue }
    const direct = directFor(m)
    if (direct && inER(direct)) { placed.push(direct); continue }
    const around = aroundEnemy(m)
    if (around) { placed.push(around); continue }
    // farFirst: models that can only rank up wait until the front rank is placed, then pick spots farthest-first (the
    // most constrained models choose before nearer ones that have more spots within reach)
    if (farFirst) { deferred.push({ i: placed.length, m, direct }); placed.push(stay(m)); continue }
    const ranked = rankUp(m)
    if (ranked) { placed.push(ranked); continue }
    placed.push(direct ?? stay(m))
  }
  for (const d of deferred.sort((x, y) => minGap(y.m) - minGap(x.m))) placed[d.i] = rankUp(d.m) ?? d.direct ?? stay(d.m)
  // second pass: anyone still unable to fight retries now that every unit-mate's final spot is known; failing that, it
  // swaps with a second-rank unit-mate — it takes a rank-up spot and that unit-mate finds another one (a greedy first
  // pass often gives the one spot a far-back model can reach to a nearer model that had other options)
  const chained = (pl: ResolvedPlacement): boolean => !touchesEnemy(pl) && !inER(pl)
    && placed.some((t) => t.model.id !== pl.model.id && touchesEnemy(t) && inBaseContact(fpOf(pl), fpOf(t)))
  for (let pass = 0; pass < 2; pass++) {
    let changed = false
    for (let i = 0; i < placed.length; i++) {
      const pl = placed[i]
      const m = pl.model
      if (geo.movable && !geo.movable.has(m.id)) continue
      if (geo.enemies.some((t) => inBaseContact(m, t))) continue
      if (inER(pl) || chained(pl)) continue
      const alt = aroundEnemy(m) ?? rankUp(m)
      if (alt) { placed[i] = alt; changed = true; continue }
      for (let j = 0; j < placed.length; j++) {
        const q = placed[j]
        if (j === i || !chained(q) || (geo.movable && !geo.movable.has(q.model.id))) continue
        lifted.add(q.model.id)
        const mNew = rankUp(m)
        lifted.delete(q.model.id)
        if (!mNew) continue
        placed[i] = mNew
        const qNew = aroundEnemy(q.model) ?? rankUp(q.model)
        if (qNew) { placed[j] = qNew; changed = true; break }
        placed[i] = pl
      }
    }
    if (!changed) break
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
      || pathCrossesModels(fp, [m.pos, to], enemies) || crossesBigFriendly(state, m, fp, [m.pos, to], otherFriendly) || terrainService.crossesImpassable(state, m, [m.pos, to]) || !terrainService.canEndAt(state, m, to).ok) {
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
    if (crossesBigFriendly(state, r.model, fp, r.path, geo.otherFriendly)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another MONSTER/VEHICLE model`, details: { modelId: r.model.id } } }
    if (terrainService.crossesImpassable(state, r.model, r.path)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path is blocked by terrain`, details: { modelId: r.model.id } } }
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
  }
  if (!unitsWithinEngagementRange(result.resolved.map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base })), geo.enemies)) {
    return { rejection: { code: 'E_ENGAGEMENT', reason: 'unit must end within engagement range of an enemy unit', details: {} } }
  }
  return result
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
function couldReachBaseContact(state: GameState, geo: FightGeometry, model: Model, maxDistance: number, blockers: Footprint[], others: ResolvedPlacement[] = []): boolean {
  // RC-036: base contact is required only with the enemy model this model was closest to at the start of its move (the same
  // model closerToClosestEnemyAtStart uses), not with any enemy it could reach
  let closest: Model | null = null, bestD = Infinity
  for (const e of geo.enemies) { const d = distance(model, e); if (d < bestD) { bestD = d; closest = e } }
  for (const t of closest ? [closest] : []) {
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
    // RC-036: the move into contact must keep the unit in coherency with the rest of the arrangement
    if (others.length > 0) {
      const pl: ModelPlacement[] = [...others.filter((o) => o.model.id !== model.id).map((o) => ({ modelId: o.model.id, pos: o.to, facing: o.facing })), { modelId: model.id, pos: to, facing: model.facing }]
      const coh = checkPlacements({ unitModels: geo.models, placements: pl, constraints: emptyMoveConstraints(maxDistance, { coherency: true }), otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board })
      if (coh.rejection) continue
    }
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
export function resolveModelWeapons(ctx: EngineContext, modelId: UnitId): WeaponId[] | 'pending' {
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

export function attacksFor(ctx: EngineContext, modelId: UnitId, weaponId: WeaponId): number {
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
export function enemyUnitIdsOnBoard(state: GameState, player: PlayerId): UnitId[] {
  const out: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.player === player || u.location !== 'board' || u.bodyguardUnitId) continue
    out.push(u.id)
  }
  return out
}

// R-9.8: `model` may target `enemyId` if within ER of it, or in base contact with a friendly model of its own unit
// that is itself in base contact with THAT enemy unit specifically.
export function legalTargetsFor(state: GameState, unitId: UnitId, model: Model, enemyIds: UnitId[], friends?: Model[]): UnitId[] {
  const models = friends ?? unitModelsForCoherency(state, unitId)
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
  // W1-G: offered only when some legal arrangement exists (the same candidates legalActions offers, fully validated)
  if (geo.models.length === 0 || legalApproachMoves(s, unitId, dist, null, 1).length === 0) { ctx.once(`fi:piledIn:${unitId}`); return 'progress' }
  ctx.decide({
    kind: 'pileIn', player: s.units[unitId].player, window: 'fight.unitSelected', canPass: false,
    context: { unitId, distance: dist }, constraints: emptyMoveConstraints(dist, { coherency: true }),
  })
  return 'pending'
}

function applyPileIn(ctx: EngineContext, unitId: UnitId, action: Extract<Action, { type: 'pileIn' }>, pending: Extract<PendingDecision, { kind: 'pileIn' }>): Rejection | void {
  const s = ctx.state
  const geo = fightGeometry(s, unitId)
  const dist = pending.context.distance
  const dp = deferredPileInMark(s)
  const check = checkApproachArrangement(s, geo, dist, action.placements)
  if (check.rejection) throw new EngineInvariantError('fight: stored pile-in placements failed re-validation', { rejection: check.rejection })
  for (const r of check.resolved) if (r.distance > EPS) { r.model.pos = r.to; r.model.facing = r.facing }
  ctx.emit({ type: 'PiledIn', unitId, paths: Object.fromEntries(check.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])) })
  cultAmbushOnMoveEnded(ctx, unitId)
  if (dp && dp.unitId === unitId) {
    // a deferred model's own pile-in is not the unit's activation: its fi:piledIn mark stays open
    ctx.once(dp.key)
    s.phaseState.marks = s.phaseState.marks.filter((x) => !x.startsWith(`${DEFERRED_PILE_MARK}=`))
    return
  }
  ctx.once(`fi:piledIn:${unitId}`)
}

// Fight on death (Rules Commentary): a destroyed model may pile in (up to pileInDistance, unit coherency kept against the
// live models), then attack, before the destroying unit consolidates; it does not consolidate. Shared by Daemonic Fervour
// (fight-on-death.ts), A Martyr's Death (deferredFightStep) and Death Blow. 'pending' while the pile-in decision is open.
export function deferredPileInStep(ctx: EngineContext, key: string, unitId: UnitId, modelIds: string[]): 'pending' | 'done' {
  const s = ctx.state
  if (ctx.marked(key)) return 'done'
  const canon = leaderService.canonicalUnitId(s, unitId)
  const ids = modelIds.filter((id) => s.models[id])
  if (ids.length === 0) { ctx.once(key); return 'done' }
  writeMark(s, DEFERRED_PILE_MARK, JSON.stringify({ key, unitId: canon, ids } satisfies DeferredPileIn))
  const dist = hookService.pileInDistance?.(s, canon, 3) ?? 3
  if (legalApproachMoves(s, canon, dist, null, 1).length === 0) {
    s.phaseState.marks = s.phaseState.marks.filter((x) => !x.startsWith(`${DEFERRED_PILE_MARK}=`))
    ctx.once(key)
    return 'done'
  }
  ctx.decide({
    kind: 'pileIn', player: s.units[canon].player, window: 'fight.unitSelected', canPass: false,
    context: { unitId: canon, distance: dist }, constraints: emptyMoveConstraints(dist, { coherency: true }),
  })
  return 'pending'
}

// the melee weapons of deferred models, each with targets by the normal R-9.8 eligibility (Engagement Range, or base contact
// with a unit-mate that is in base contact with that enemy), evaluated after their pile-in. Models with no target are left out.
export function deferredWeapons(ctx: EngineContext, unitId: UnitId, models: Model[]): DeclareTargetsDecision['context']['weapons'] | 'pending' {
  const s = ctx.state
  const canon = leaderService.canonicalUnitId(s, unitId)
  for (const m of models) if (resolveModelWeapons(ctx, m.id) === 'pending') return 'pending'
  const have = new Set<string>()
  const friends = [...unitModelsForCoherency(s, canon), ...models].filter((m) => !have.has(m.id) && have.add(m.id))
  const enemyIds = enemyUnitIdsOnBoard(s, s.units[canon].player)
  const weapons: DeclareTargetsDecision['context']['weapons'] = []
  for (const m of models) {
    const legalTargets = legalTargetsFor(s, canon, m, enemyIds, friends)
    if (legalTargets.length === 0) continue
    for (const weaponId of resolveModelWeapons(ctx, m.id) as WeaponId[]) {
      const weapon = weaponService.effectiveWeapon(s, m.id, weaponId)
      weapons.push({ modelId: m.id, weaponId, profileGroup: weapon.profileGroup ?? null, legalTargets, attacks: attacksFor(ctx, m.id, weaponId) })
    }
  }
  return weapons
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
    // a model with no legal target (not within Engagement Range of any enemy) simply makes no attacks
    if ((pending.context.weapons.find((w) => `${w.modelId}|${w.weaponId}` === key)?.legalTargets.length ?? 1) === 0) continue
    if ((sums.get(key) ?? 0) !== total) return { code: 'E_SCHEMA', reason: `attacks for ${key} must sum to ${total}`, details: { key, total } }
  }
  return null
}

function applyDeclareTargets(ctx: EngineContext, action: Extract<Action, { type: 'declareTargets' }>): void {
  const declared: DeclaredTarget[] = action.targets.map((t: WeaponTarget) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId, profileGroup: t.profileGroup ?? null, attacks: t.attacks ?? null }))
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: action.unitId, overwatch: false, targets: declared })
  // E4: a deferred last stand is not the unit's own activation, so its own declare step stays open for later
  if (deferredOpen(ctx.state, action.unitId)) ctx.once(`fidef:${action.unitId}:begun`)
  else ctx.once(`fi:declared:${action.unitId}`)
}

// ---------- E4: deferred last-stand fighting (A Martyr's Death) ----------
const defKey = (unitId: UnitId): string => `fidef:${unitId}`
function deferredOpen(state: GameState, unitId: UnitId): boolean {
  return state.phaseState.marks.includes(`${defKey(unitId)}:open`) && !state.phaseState.marks.includes(`${defKey(unitId)}:begun`)
}

// the deferred models of `entry` fight once, after the destroying unit's attacks (a pile-in first, no consolidation), against
// enemies they are eligible to attack after it: 'pending' while their declareTargets decision is open, 'done' when resolved / nothing to hit
export function deferredFightStep(ctx: EngineContext, entry: { unitId: UnitId; modelIds: UnitId[] }): 'pending' | 'done' {
  const s = ctx.state
  const key = defKey(entry.unitId)
  if (ctx.marked(`${key}:begun`)) return 'done'
  const player = s.units[entry.unitId].player
  // RC-ADE-10: pile in first (Fight on Death allows it), then normal fight eligibility for targets
  if (!ctx.marked(`${key}:open`) && deferredPileInStep(ctx, `${key}:pile`, entry.unitId, entry.modelIds) === 'pending') return 'pending'
  const models = entry.modelIds.map((id) => s.models[id]).filter((m): m is Model => !!m)
  const weapons = deferredWeapons(ctx, entry.unitId, models)
  if (weapons === 'pending') return 'pending'
  if (!weapons.some((w) => w.legalTargets.length > 0)) { ctx.once(`${key}:begun`); return 'done' }
  if (!ctx.once(`${key}:open`)) return 'pending'
  const engagedWith = [...new Set(weapons.flatMap((w) => w.legalTargets))]
  ctx.decide({
    kind: 'declareTargets', player, window: 'fight.unitSelected', canPass: false,
    context: { unitId: entry.unitId, attackKind: 'melee', overwatch: false, weapons, engagedWith },
  })
  return 'pending'
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
  const enemyFeasible = geo.models.length > 0 && legalApproachMoves(s, unitId, dist, null, 1).length > 0
  let objectiveId: ObjectiveId | null = null
  if (!enemyFeasible) objectiveId = nearestReachableObjective(s, geo, dist)
  if (objectiveId !== null && legalApproachMoves(s, unitId, dist, objectiveId, 1).length === 0) objectiveId = null
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
    if (crossesBigFriendly(state, r.model, fp, r.path, geo.otherFriendly)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another MONSTER/VEHICLE model`, details: { modelId: r.model.id } } }
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
  cultAmbushOnMoveEnded(ctx, unitId)
  ctx.once(`fi:consolidated:${unitId}`)
}

// ---------- select / drive one unit's whole activation ----------

// R-9.12 [FIGHT-025]: a pending Counter-offensive reaction always names one specific unit to fight next, regardless
// of which step is current and regardless of what else might independently be eligible — it is offered (and
// consumed only once chosen, in `handle`) ahead of, and instead of, the ordinary alternation below.

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

function owner(state: GameState, unitId: UnitId): PlayerId { return state.units[unitId].player }

function finishUnit(ctx: EngineContext, unitId: UnitId, player: PlayerId): void {
  const s = ctx.state
  const fight = s.phaseState.fight!
  for (const id of leaderService.halves?.(s, unitId) ?? [unitId]) if (s.units[id]) s.units[id].turn.foughtThisPhase = true
  if (!fight.fought.includes(unitId)) fight.fought.push(unitId)
  // RC-040 / FIGHT-025: the Counter-offensive unit is a selection like any other, so after it the opponent selects (the CO
  // unit's owner may have two activations in a row only if the opponent has nothing eligible).
  if (fight.counterOffensive) {
    fight.counterOffensive = false
  } else {
    fight.nextToSelect = otherPlayer(player)
  }
  fight.currentUnitId = null
  fight.subStep = 'select'
  // Death Blow: the model is removed once it has fought
  finishDeferredRemovalOfUnit(ctx, unitId)
}

// TYR-02 Death Blow: just after the attacking unit's attacks and before it consolidates (Fight on Death), a model whose removal was
// deferred may fight: optional use / decline, then a pile-in and its own attacks like any deferred model (not a unit activation:
// no FightUnitSelected, no unit-selected window, no consolidation), then it is removed. 'pending' while a decision is open.
function resolveDeathBlows(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  for (let guard = 0; guard < 64; guard++) {
    const unitId = pendingDeathBlowUnits(s)[0]
    if (!unitId) return 'done'
    const owner = s.units[unitId].player
    const declKey = `dbf:decl:${unitId}`
    const clear = (): void => {
      s.phaseState.marks = s.phaseState.marks.filter((x) => !x.startsWith(`dbf:`) || !x.endsWith(`:${unitId}`))
      s.phaseState.marks = s.phaseState.marks.filter((x) => x !== `fi:declared:${unitId}`)
      finishDeferredRemovalOfUnit(ctx, unitId)
    }
    if (!ctx.marked(`dbf:choice:${unitId}`)) {
      ctx.decide({
        kind: 'chooseOption', player: owner, window: 'fight.unitSelected', canPass: false,
        context: { topic: 'other', unitId, abilityId: null, data: { choice: 'deathBlow', unitId } },
        options: [
          { id: 'fight', label: `Death Blow: fight with ${s.units[unitId].name} before it is removed`, action: { type: 'chooseOption', player: owner, decisionId: '', optionId: 'fight' } },
          { id: 'decline', label: 'Decline: remove the model now', action: { type: 'chooseOption', player: owner, decisionId: '', optionId: 'decline' } },
        ],
      })
      return 'pending'
    }
    if (!ctx.marked(`dbf:use:${unitId}`)) continue // declined: already removed by the handler (the list shrinks)
    if (ctx.marked(declKey)) {
      if (s.phaseState.attack && s.phaseState.attack.attackerUnitId === unitId && attackService.advance(ctx) === 'pending') return 'pending'
      clear()
      continue
    }
    const models = s.units[unitId].models.map((id) => s.models[id]).filter((m): m is Model => !!m && !!m.pendingRemoval)
    if (deferredPileInStep(ctx, `dbf:pile:${unitId}`, unitId, models.map((m) => m.id)) === 'pending') return 'pending'
    const weapons = deferredWeapons(ctx, unitId, models)
    if (weapons === 'pending') return 'pending'
    if (!weapons.some((w) => w.legalTargets.length > 0)) { clear(); continue }
    ctx.once(declKey)
    ctx.decide({
      kind: 'declareTargets', player: owner, window: 'fight.unitSelected', canPass: false,
      context: { unitId, attackKind: 'melee', overwatch: false, weapons, engagedWith: [...new Set(weapons.flatMap((w) => w.legalTargets))] },
    })
    return 'pending'
  }
  return 'done'
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

  // mortal wounds queued by a pick (Dark Pact, Sacrificial Dagger) wait in an open sequence: resolve them before the unit moves
  if (fight.subStep === 'pileIn' && s.phaseState.attack) {
    if (attackService.advance(ctx) === 'pending') return 'pending'
    const left = s.units[unitId]
    if (!left || left.location !== 'board') { finishUnit(ctx, unitId, left?.player ?? s.activePlayer); return 'progress' }
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
    fight.subStep = 'deferred'
  }
  if (fight.subStep === 'deferred') {
    // C5 + TYR-02 + E4: repeat until nothing is left, since each can queue another (a Death Blow model killed during a
    // last stand, a last stand killing a Death Blow model...): 0-wound Daemonic Fervour models make their last attacks,
    // Death Blow models fight, deferred last-stand activations (A Martyr's Death) open
    for (let guard = 0; guard < 64; guard++) {
      if (s.phaseState.attack && attackService.advance(ctx) === 'pending') return 'pending'
      if (resolveDeferredDeaths(ctx) === 'pending') return 'pending'
      if (resolveDeathBlows(ctx) === 'pending') return 'pending'
      if (resolveDeferredActivations(ctx, unitId) === 'awaiting') return 'pending'
      if (pendingDeathBlowUnits(s).length === 0 && deferredDeaths(s).length === 0) break
    }
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



// full R-9.5/R-9.10 legality of a pile-in/consolidate arrangement (shared by validate(), feasibility and legalActions)
function approachRejection(state: GameState, geo: FightGeometry, dist: number, objectiveId: ObjectiveId | null, placements: ModelPlacement[]): Rejection | null {
  const check = checkConsolidateArrangement(state, geo, dist, objectiveId, placements)
  if (check.rejection) return check.rejection
  if (objectiveId !== null) return null
  for (const r of check.resolved) {
    if (r.distance <= EPS) continue
    if (geo.movable && !geo.movable.has(r.model.id)) return { code: 'E_INVALID_TARGET', reason: `${r.model.id} may not move in this pile-in`, details: { modelId: r.model.id } }
    if (!closerToClosestEnemyAtStart(r.model, r.from, r.to, geo.enemies)) return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} must end closer to the enemy model it started closest to`, details: { modelId: r.model.id } }
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    const blockers: Footprint[] = [
      ...check.resolved.filter((o) => o.model.id !== r.model.id).map((o) => ({ pos: o.to, facing: o.facing, base: o.model.base })),
      ...geo.otherFriendly,
    ]
    if (!geo.enemies.some((e) => inBaseContact(fp, e)) && couldReachBaseContact(state, geo, r.model, dist, blockers, check.resolved)) {
      return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} could end in base contact with an enemy and must`, details: { modelId: r.model.id } }
    }
  }
  return null
}

// candidate pile-in/consolidate arrangements tried lazily (planner at ER edge / base contact / near contact, or toward
// the fallback objective; each as planned then coherency-repaired; finally staying put); first `limit` legal ones
function legalApproachMoves(state: GameState, unitId: UnitId, dist: number, objectiveId: ObjectiveId | null, limit = 1): ModelPlacement[][] {
  const geo = fightGeometry(state, unitId)
  if (geo.models.length === 0) return []
  const out: ModelPlacement[][] = []
  const tried = new Set<string>()
  const consider = (placements: ModelPlacement[]): boolean => {
    const key = JSON.stringify(placements)
    if (tried.has(key)) return false
    tried.add(key)
    if (approachRejection(state, geo, dist, objectiveId, placements) === null) out.push(placements)
    return out.length >= limit
  }
  const toPlacements = (rs: ResolvedPlacement[]): ModelPlacement[] => rs.filter((r) => r.distance > EPS && (!geo.movable || geo.movable.has(r.model.id))).map((r) => ({ modelId: r.model.id, pos: r.to, facing: r.facing, path: r.path }))
  const obj = objectiveId !== null ? state.objectives[objectiveId] : undefined
  const terrainOk = (m: Model, to: Vec3): boolean => terrainService.canEndAt(state, m, to).ok && !terrainService.crossesImpassable(state, m, [m.pos, to])
  const ok = obj
    ? (m: Model, to: Vec3): boolean => dist2D(to, obj.pos) < dist2D(m.pos, obj.pos) - EPS && terrainOk(m, to)
    : (m: Model, to: Vec3): boolean => closerToClosestEnemyAtStart(m, m.pos, to, geo.enemies) && terrainOk(m, to)
  const repair = (pl: ModelPlacement[]): ModelPlacement[] => repairCoherency(geo.models, pl, { allowance: () => dist - 0.02, blockers: [...geo.otherFriendly, ...geo.enemies], ok })
  if (obj) {
    const pl = toPlacements(planApproachPoint(state, geo.models, { x: obj.pos.x, y: terrainService.heightAt(state, obj.pos.x, obj.pos.z), z: obj.pos.z }, geo.otherFriendly, geo.enemies, dist))
    if (consider(pl) || consider(repair(pl))) return out
    if (consider([])) return out
    consider(repair([]))
    return out
  }
  // toward the enemy: every plan is validated (base contact first, then near contact, then the Engagement Range edge;
  // each as planned and coherency-repaired; finally staying put), then the legal ones are ranked by how many models may
  // fight afterwards (R-9.6), so the first candidate — the UI's default "Pile in" — puts the most models into the fight.
  // Ties keep this order, so a base-contact plan beats an equally good ER-edge one.
  const all: ModelPlacement[][] = []
  const gather = (pl: ModelPlacement[]): void => { consider(pl); while (out.length) all.push(out.shift() as ModelPlacement[]) }
  for (const [gap, farFirst] of [[0.004, false], [0.004, true], [0.3, false], [ENGAGEMENT_H - 0.01, false]] as const) {
    const pl = toPlacements(planApproachEnemy(state, geo, dist, gap, farFirst))
    gather(pl)
    gather(repair(pl))
  }
  gather([])
  gather(repair([]))
  const scored = all.map((pl, i) => ({ pl, i, n: fightersAfter(geo, pl) }))
  scored.sort((a, b) => b.n - a.n || a.i - b.i)
  return scored.slice(0, limit).map((x) => x.pl)
}

// R-9.6 over a proposed arrangement: models within Engagement Range of an enemy, or in base contact with a unit-mate
// that is itself in base contact with an enemy (mirrors attackEligibleModels on final positions)
function fightersAfter(geo: FightGeometry, placements: ModelPlacement[]): number {
  const moved = new Map(placements.map((p) => [p.modelId, p.pos]))
  const fps: Footprint[] = geo.models.map((m) => ({ pos: moved.get(m.id) ?? m.pos, facing: m.facing, base: m.base }))
  const touching = fps.map((f) => geo.enemies.some((e) => inBaseContact(f, e)))
  let n = 0
  fps.forEach((f, i) => {
    if (geo.enemies.some((e) => horizontalGap(f, e) <= ENGAGEMENT_H + EPS && Math.abs(f.pos.y - e.pos.y) <= 5 + EPS)) { n++; return }
    if (fps.some((g, j) => j !== i && touching[j] && inBaseContact(f, g))) n++
  })
  return n
}

// ---------- legal-action candidates (W1-G) ----------
function fightLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind === 'pileIn' || pending.kind === 'consolidate') {
    const unitId = pending.context.unitId
    if (!state.units[unitId]) return []
    const objId = pending.kind === 'consolidate' ? pending.context.objectiveFallback : null
    return legalApproachMoves(state, unitId, pending.context.distance, objId, 3)
      .map((placements) => ({ type: pending.kind, player: pending.player, decisionId: pending.id, unitId, placements }) as Action)
  }
  if (pending.kind === 'declareTargets') {
    const { unitId, weapons, engagedWith } = pending.context
    const prefs = engagedWith.length > 0 ? engagedWith : [...new Set(weapons.flatMap((w) => w.legalTargets))]
    const candidates: Action[] = []
    for (const pref of prefs) {
      const targets: WeaponTarget[] = []
      for (const w of weapons) {
        if ((w.attacks ?? 0) <= 0 || w.legalTargets.length === 0) continue
        const t = w.legalTargets.includes(pref) ? pref : w.legalTargets[0]
        targets.push({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: t, ...(w.profileGroup ? { profileGroup: w.profileGroup } : {}), attacks: w.attacks as number })
      }
      candidates.push({ type: 'declareTargets', player: pending.player, decisionId: pending.id, unitId, targets })
    }
    return filterValid(candidates, (a) => fightModule.validate!(state, a, pending), 4)
  }
  return optionActions(pending)
}

export const fightModule: PhaseModule = {
  name: 'fight',
  legalActions(state, pending) { return fightLegalActions(state, pending) },
  enter(ctx) {
    const s = ctx.state
    s.step = 'fightsFirst'
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: ctx.opponentOf(s.activePlayer), counterOffensive: false }
    s.phaseState.attack = null
  },
  exit(ctx) {
    // safety net: a Death Blow model still pending when the phase ends is removed
    for (const unitId of pendingDeathBlowUnits(ctx.state)) finishDeferredRemovalOfUnit(ctx, unitId)
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
      // C5 safety net: nothing deferred may outlive the phase (its marks are cleared on exit)
      if (resolveDeferredDeaths(ctx) === 'pending') return 'pending'
      purgeDeferredDeaths(ctx)
      return 'done'
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'pileIn') {
      if (action.type !== 'pileIn') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'pileIn is for the wrong unit', details: { expected: pending.context.unitId } }
      return approachRejection(state, fightGeometry(state, action.unitId), pending.context.distance, null, action.placements)
    }
    if (pending.kind === 'declareTargets') {
      if (action.type !== 'declareTargets') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'declareTargets is for the wrong unit', details: { expected: pending.context.unitId } }
      return validateDeclareTargets(pending, action)
    }
    if (pending.kind === 'consolidate') {
      if (action.type !== 'consolidate') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'consolidate is for the wrong unit', details: { expected: pending.context.unitId } }
      return approachRejection(state, fightGeometry(state, action.unitId), pending.context.distance, pending.context.objectiveFallback, action.placements)
    }
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') {
      // a Precision allocation (canPass) is declined with a pass: the attack sequence answers it
      if (s.phaseState.attack && pending.kind === 'allocateAttack') return attackService.handler.handle(ctx, action, pending)
      return { code: 'E_NOT_AN_OPTION', reason: `fight: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseFightUnit' && action.type === 'chooseFightUnit') {
      const fight = s.phaseState.fight!
      consumeReaction(s, 'counterOffensive', action.unitId)
      fight.nextToSelect = otherPlayer(owner(s, action.unitId))
      fight.currentUnitId = action.unitId
      fight.subStep = 'pileIn'
      ctx.emit({ type: 'FightUnitSelected', unitId: action.unitId, step: fight.step })
      return
    }
    if (pending.kind === 'chooseOption' && pending.context.topic === 'other' && (pending.context.data as { choice?: string }).choice === 'deathBlow' && action.type === 'chooseOption') {
      const unitId = (pending.context.data as { unitId: UnitId }).unitId
      ctx.once(`dbf:choice:${unitId}`)
      if (action.optionId === 'fight') ctx.once(`dbf:use:${unitId}`)
      else finishDeferredRemovalOfUnit(ctx, unitId)
      return
    }
    if (pending.kind === 'pileIn' && action.type === 'pileIn') return applyPileIn(ctx, action.unitId, action, pending)
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
