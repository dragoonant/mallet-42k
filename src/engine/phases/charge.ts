// Charge phase module (10-rules §8, docs/spec/12-rules-test-checklist.md CHARGE-*). Owner: W1-E.
//
// State machine: `phaseState.charge` (frozen ChargeState) holds the unit currently declaring/rolling/moving; once its
// move is applied it is pushed onto a small LIFO stack (`ch:meStack=` mark) of units whose `charge.moveEnded` window
// (Heroic Intervention, then Tank Shock) is still being drained — a queued Heroic Intervention reuses
// `phaseState.charge` for its own mini charge (no declare step, no Fights First, no Overwatch) and is itself pushed
// onto the same stack when its move lands, so a VEHICLE that intervenes can still trigger its own Tank Shock. The
// stack (not the JS call stack) is what survives across `advance()` re-entries — see phases/README §3 rule 1.
//
// Documented interpretations (see STATUS/issues):
// - R-8.4 feasibility and the actual charge-move arrangement are computed by the SAME heuristic search
//   (`planChargeMove`): each model, closest-to-target first, tries (in order) a direct approach to the nearest
//   declared target (detouring around a non-target's Engagement Range with a waypoint sweep if the straight line is
//   blocked — CHARGE-008-detour), then an angular sweep around each target's Engagement Range ring for a free point
//   if the direct/detoured point overlaps an already-placed model of its own unit (CHARGE-010-blob), then finally
//   walking toward its nearest already-placed friend just to preserve coherency if no target-adjacent point is
//   reachable at all. Capped throughout by the roll and by terrain/board/overlap legality; a model that cannot
//   legally improve its position by any of these stays put. This is not an exhaustive combinatorial search — it
//   finds *a* legal arrangement when one exists via these strategies, not a proof of infeasibility for every
//   conceivable geometry.
// - R-8.5 "must end in base contact if possible" is checked per model against its own travel budget, board edge,
//   terrain, non-target Engagement Range, AND overlap with the rest of the unit's own resolved arrangement plus
//   other friendly models (CHARGE-012-crowd) — but still not a joint re-optimisation of the whole arrangement.
// - A charging model may not cross another model's base along the way (target or non-target) unless FLY; it may
//   still pass through its own friendly models (R-5.2's normal-move rule, applied here by analogy — R-8 does not
//   spell this out).
// - Heroic Intervention's own move never re-opens a Fire Overwatch window (Overwatch already excludes
//   `charge.moveEnded`; re-triggering a reaction mid-reaction is treated as out of scope for Combat Patrol).
import { optionActions, repairCoherency } from './legal'
import { rollSum } from '../dice'
import {
  EPS, ENGAGEMENT_H, COHERENCY_H, anyWithinEngagementRange, basesOverlap, checkPlacements, dist2D, distance,
  emptyMoveConstraints, horizontalGap, inBaseContact, pathCrossesModels, pathEntersEngagement, pathLength,
  whollyOnBoard, type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import { attackService } from '../attack'
import { terrainService } from '../terrain'
import { pendingReactions, consumeReaction } from '../code-hooks'
import { notImplementedHandle, otherPlayer, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import { boardUnitsOf, enemyModelsOnBoard, hasKeyword, setModelPos, unitModels, unitModelsForCoherency } from '../state'
import type { Action, ModelPlacement } from '../actions'
import {
  EngineInvariantError,
  type ChargeState, type DeclaredTarget, type GameState, type Model, type Path, type PendingDecision,
  type Rejection, type UnitId, type Vec3,
} from '../types'

// ---------- boolean progress markers (phaseState.marks; unit ids are unique per game so these never collide across
// different chargers, including a Heroic Intervention reactor — no explicit reset is needed between units) ----------

// LIFO stack of units whose `charge.moveEnded` window/reactions are still being drained (survives advance() re-entry)
const STACK_PREFIX = 'ch:meStack='
function readStack(state: GameState): UnitId[] {
  const m = state.phaseState.marks.find((x) => x.startsWith(STACK_PREFIX))
  return m ? (JSON.parse(m.slice(STACK_PREFIX.length)) as UnitId[]) : []
}
function writeStack(state: GameState, stack: UnitId[]): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(STACK_PREFIX))
  if (stack.length > 0) state.phaseState.marks.push(STACK_PREFIX + JSON.stringify(stack))
}
function pushStack(state: GameState, unitId: UnitId): void { const st = readStack(state); st.push(unitId); writeStack(state, st) }
function popStack(state: GameState): void { const st = readStack(state); st.pop(); writeStack(state, st) }

// same identity check the reducer's generic option-membership validation performs — duplicated (see movement.ts)
// because supplying a custom `validate` for declareCharge/chargeMove opts this module out of that default for every
// decision kind it validates, not just those two.
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

// ---------- eligibility (R-8.1) / declaration (R-8.2) ----------

function candidateTargets(state: GameState, unitId: UnitId): UnitId[] {
  const player = state.units[unitId].player
  const out: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.player === player || u.location !== 'board' || u.bodyguardUnitId) continue
    if ((leaderService.unitDistance?.(state, unitId, u.id) ?? Infinity) <= 12 + EPS) out.push(u.id)
  }
  return out.sort()
}

function canDeclareCharge(state: GameState, unitId: UnitId): boolean {
  if (hasKeyword(state, unitId, 'AIRCRAFT')) return false
  if (leaderService.inEngagementWithEnemy?.(state, unitId)) return false
  const moveType = state.units[unitId].turn.moveType
  if ((moveType === 'advance' || moveType === 'fallBack') && !(hookService.eligibilityFor?.(state, unitId, 'charge') ?? false)) return false
  return candidateTargets(state, unitId).length > 0
}

function eligibleChargers(state: GameState, player: import('../types').PlayerId): UnitId[] {
  const activated = new Set(state.phaseState.activated)
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, player)) {
    if (u.bodyguardUnitId || activated.has(u.id)) continue
    if (canDeclareCharge(state, u.id)) out.push(u.id)
  }
  return out
}

// ---------- geometry: the charging unit's own models, its declared targets, and everyone else on the board ----------

interface ChargeGeometry { models: Model[]; targetGroups: Model[][]; nonTargets: Model[]; otherFriendly: Model[]; fly: boolean }

function targetModelGroups(state: GameState, targetUnitIds: UnitId[]): Model[][] {
  return targetUnitIds.map((id) => (leaderService.combinedModels ? leaderService.combinedModels(state, id) : unitModels(state, id)).filter((m) => state.units[m.unitId]?.location === 'board'))
}

function chargeGeometry(state: GameState, unitId: UnitId, targetUnitIds: UnitId[]): ChargeGeometry {
  const models = unitModelsForCoherency(state, unitId)
  const player = state.units[unitId].player
  const targetGroups = targetModelGroups(state, targetUnitIds)
  const targetCanon = new Set(targetUnitIds.flatMap((id) => leaderService.halves?.(state, id) ?? [id]))
  const nonTargets = enemyModelsOnBoard(state, player).filter((m) => !targetCanon.has(m.unitId))
  const mine = new Set(leaderService.halves?.(state, unitId) ?? [unitId])
  const otherFriendly: Model[] = []
  for (const u of boardUnitsOf(state, player)) if (!mine.has(u.id)) otherFriendly.push(...unitModels(state, u.id))
  const fly = models.length > 0 && models.every((m) => hasKeyword(state, m.unitId, 'FLY'))
  return { models, targetGroups, nonTargets, otherFriendly, fly }
}

// travel (2D, straight line toward `target`'s centre) needed for `m` to close its real (elliptical-base-aware)
// horizontal gap with `target` down to `stopGap`, found by binary search on `horizontalGap` itself rather than a
// circumscribed-circle approximation — a scalar "radius" both under- and overshoots an oval base depending on which
// way it is currently facing, which either strands the model outside Engagement Range or drives it into an overlap.
function contactCandidate(m: Model, target: Footprint, stopGap: number): { point: Vec3; travel: number } {
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

// angular-sweep helper (CHARGE-008-detour, CHARGE-010-blob): the point at horizontal gap `stopGap` from `target`,
// in direction `angle` from target's centre — a fixed-direction analogue of `contactCandidate`'s toward-`m` search.
function ringPoint(target: Footprint, m: Model, angle: number, stopGap: number): Vec3 {
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
  return pointAt(hi)
}

// CHARGE-008-detour: the straight line from `m` to `target`'s nearest Engagement Range point may clip a non-target's
// own Engagement Range; when it does, sweep waypoints around each blocker's ER ring and take the shortest two-leg
// route (via-point → target point) that avoids every non-target's ER, counting the full path length against the
// roll (R-8.4 "incl. climbs" — the same Manhattan-style accounting `pathLength`/`checkPlacements` already do).
function contactCandidateWithDetour(geo: ChargeGeometry, m: Model, target: Model, stopGap: number, maxDistance: number): { point: Vec3; travel: number; path: Path } {
  const direct = contactCandidate(m, target, stopGap)
  const directPath: Path = [m.pos, direct.point]
  const fp: Footprint = { pos: direct.point, facing: m.facing, base: m.base }
  const blocked = !geo.fly && (pathEntersEngagement(fp, directPath, geo.nonTargets) || pathCrossesModels(fp, directPath, geo.nonTargets))
  if (!blocked) return { point: direct.point, travel: direct.travel, path: directPath }
  let best: { point: Vec3; travel: number; path: Path } | null = null
  const steps = 24
  for (const nt of geo.nonTargets) {
    for (let i = 0; i < steps; i++) {
      const wp = ringPoint(nt, m, (2 * Math.PI * i) / steps, ENGAGEMENT_H + 0.05)
      const path: Path = [m.pos, wp, direct.point]
      const travel = pathLength(path)
      if (travel > maxDistance + 1e-3 || (best && travel >= best.travel)) continue
      if (pathEntersEngagement(fp, path, geo.nonTargets) || pathCrossesModels(fp, path, geo.nonTargets)) continue
      best = { point: direct.point, travel, path }
    }
  }
  return best ?? { point: direct.point, travel: direct.travel, path: directPath }
}

// legality of ending `m` at `candidate.point` (terrain-snapped): board, overlap with the rest of the unit's own
// resolved placements + other friendlies, non-target Engagement Range / crossing, terrain. Returns the resolved
// placement or null. Shared by every strategy `planChargeMove` tries for a model.
function tryChargePlacement(state: GameState, geo: ChargeGeometry, m: Model, candidate: { point: Vec3; travel: number; path?: Path }, maxDistance: number, placed: ResolvedPlacement[]): ResolvedPlacement | null {
  if (candidate.travel > maxDistance + 1e-3) return null
  const to = { ...candidate.point, y: terrainService.heightAt(state, candidate.point.x, candidate.point.z) }
  const basePath = candidate.path ?? [m.pos, candidate.point]
  const path: Path = [...basePath.slice(0, -1), to]
  const travel = pathLength(path)
  if (travel > maxDistance + 1e-3) return null
  const fp: Footprint = { pos: to, facing: m.facing, base: m.base }
  if (!whollyOnBoard(fp, state.board)) return null
  const overlapBlockers: Footprint[] = [...placed.map((pl) => ({ pos: pl.to, facing: pl.facing, base: pl.model.base })), ...geo.otherFriendly]
  if (overlapBlockers.some((b) => basesOverlap(fp, b))) return null
  const allTargets = geo.targetGroups.flat()
  // W1-G: ending on top of an enemy model (e.g. contact with one oval target model while clipping its neighbour)
  if ([...allTargets, ...geo.nonTargets].some((b) => basesOverlap(fp, b))) return null
  if (!geo.fly && (pathEntersEngagement(fp, path, geo.nonTargets) || pathCrossesModels(fp, path, [...geo.nonTargets, ...allTargets]))) return null
  if (terrainService.crossesImpassable(state, m, path) || !terrainService.canEndAt(state, m, to).ok) return null
  return { model: m, from: m.pos, to, facing: m.facing, path, distance: travel }
}

// a ring slot on the far side of a small target is unreachable by a straight line (it would run the model's own
// base straight through the target's) — detour around `target` itself with one waypoint, the same trick
// `contactCandidateWithDetour` uses for non-targets, when (and only when) the direct line is the one that's blocked.
function ringApproachPath(m: Model, target: Model, point: Vec3, maxDistance: number): { path: Path; travel: number } | null {
  const direct: Path = [m.pos, point]
  const fp: Footprint = { pos: point, facing: m.facing, base: m.base }
  if (!pathCrossesModels(fp, direct, [target])) {
    const travel = pathLength(direct)
    return travel <= maxDistance + 1e-3 ? { path: direct, travel } : null
  }
  let best: { path: Path; travel: number } | null = null
  const steps = 24
  for (let i = 0; i < steps; i++) {
    const wp = ringPoint(target, m, (2 * Math.PI * i) / steps, ENGAGEMENT_H + 0.05)
    const path: Path = [m.pos, wp, point]
    const travel = pathLength(path)
    if (travel > maxDistance + 1e-3 || (best && travel >= best.travel)) continue
    if (pathCrossesModels(fp, path, [target])) continue
    best = { path, travel }
  }
  return best
}

// CHARGE-010-blob: when the straight/detoured point for `m` is blocked by its own already-placed teammates, sweep
// `target`'s Engagement Range ring for a free point instead of leaving `m` behind. Candidates that land within
// coherency range of an already-placed teammate are tried first (closest-travel among those) so a large unit wraps
// the ring as one contiguous, coherent arc instead of jumping to an isolated free point on the far side of a small
// target; only once every such candidate is exhausted does the sweep fall back to the closest-travel point overall.
function ringSearch(state: GameState, geo: ChargeGeometry, m: Model, target: Model, maxDistance: number, placed: ResolvedPlacement[], steps = 48, stopGap = ENGAGEMENT_H - 0.01): ResolvedPlacement | null {
  const candidates: { point: Vec3; path: Path; travel: number; near: boolean }[] = []
  for (let i = 0; i < steps; i++) {
    const point = ringPoint(target, m, (2 * Math.PI * i) / steps, stopGap)
    if (dist2D(m.pos, point) > maxDistance + 1e-3) continue // a detour can only be longer than the straight line
    const routed = ringApproachPath(m, target, point, maxDistance)
    if (!routed) continue
    const near = placed.some((pl) => dist2D(point, pl.to) <= COHERENCY_H + EPS)
    candidates.push({ point, path: routed.path, travel: routed.travel, near })
  }
  candidates.sort((a, b) => (a.near === b.near ? a.travel - b.travel : a.near ? -1 : 1))
  for (const c of candidates) {
    const placement = tryChargePlacement(state, geo, m, c, maxDistance, placed)
    if (placement) return placement
  }
  return null
}

// last resort (CHARGE-010-blob): no target-adjacent point is reachable at all — walk toward whichever already-placed
// unit model is nearest so the arrangement stays in coherency, rather than leaving `m` at its start position.
function tryApproachFriend(state: GameState, geo: ChargeGeometry, m: Model, placed: ResolvedPlacement[], maxDistance: number): ResolvedPlacement | null {
  const moved = placed.filter((pl) => pl.distance > EPS)
  const candidates = (moved.length > 0 ? moved : placed).filter((pl) => pl.model.id !== m.id)
  const sorted = [...candidates].sort((a, b) => dist2D(m.pos, a.to) - dist2D(m.pos, b.to))
  for (const f of sorted) {
    const friendFp: Footprint = { pos: f.to, facing: f.facing, base: f.model.base }
    const c = contactCandidate(m, friendFp, 1.5)
    const placement = tryChargePlacement(state, geo, m, c, maxDistance, placed)
    if (placement) return placement
  }
  return null
}

// heuristic R-8.4 arrangement: closest-to-target models move first, each tries a direct/detoured approach to the
// nearest declared target, then a ring sweep around any target if that point is blocked by its own teammates, then
// walking toward a placed friend to preserve coherency; a model that cannot legally improve its position by any of
// these stays put — not every model needs to reach (CHARGE-010).
function planChargeMove(state: GameState, geo: ChargeGeometry, maxDistance: number, stopGap = ENGAGEMENT_H - 0.01): ResolvedPlacement[] {
  const allTargets = geo.targetGroups.flat()
  const stay = (m: Model): ResolvedPlacement => ({ model: m, from: m.pos, to: m.pos, facing: m.facing, path: [m.pos, m.pos], distance: 0 })
  if (allTargets.length === 0) return geo.models.map(stay)
  const order = [...geo.models].sort((a, b) => Math.min(...allTargets.map((t) => horizontalGap(a, t))) - Math.min(...allTargets.map((t) => horizontalGap(b, t))))
  const placed: ResolvedPlacement[] = []
  for (const m of order) {
    // aim comfortably inside Engagement Range (not exactly at its edge) so the 1/1000" position rounding
    // `checkPlacements` applies afterward can never push the real gap back out past the threshold
    let best: { point: Vec3; travel: number; path: Path } | null = null
    for (const t of allTargets) {
      const c = contactCandidateWithDetour(geo, m, t, stopGap, maxDistance)
      if (!best || c.travel < best.travel) best = c
    }
    let placement = best ? tryChargePlacement(state, geo, m, best, maxDistance, placed) : null
    // the ring sweep is only worth its cost when `m` is plausibly in reach of a target at all: `best.travel` is
    // already the minimum possible travel to any point on any target's Engagement Range boundary (the nearest-point
    // search `contactCandidateWithDetour` performs), so if even that exceeds the roll, no other ring point can do
    // better either — skip straight to the coherency fallback instead of sweeping for nothing.
    if (!placement && best && best.travel <= maxDistance + 1e-3) {
      const byDistance = [...allTargets].sort((a, b) => horizontalGap(m, a) - horizontalGap(m, b))
      for (const t of byDistance) {
        placement = ringSearch(state, geo, m, t, maxDistance, placed, 48, stopGap)
        if (placement) break
      }
    }
    if (!placement) placement = tryApproachFriend(state, geo, m, placed, maxDistance)
    placed.push(placement ?? stay(m))
  }
  return placed
}

// shared by feasibility (planned arrangement) and validate() (player-submitted placements): checkPlacements gives us
// R-8.4's "in ER of every target" + coherency for free via `mustEndInEngagementWith`; the only extra rule it cannot
// express is "never in ER of a non-target".
function checkChargeArrangement(state: GameState, geo: ChargeGeometry, targetUnitIds: UnitId[], maxDistance: number, placements: ModelPlacement[]):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const allTargets = geo.targetGroups.flat()
  const engagementTargets: Record<string, Model[]> = {}
  targetUnitIds.forEach((id, i) => { engagementTargets[id] = geo.targetGroups[i] })
  const constraints = emptyMoveConstraints(maxDistance, { mustEndInEngagementWith: targetUnitIds, coherency: true })
  const result = checkPlacements({
    unitModels: geo.models, placements, constraints, otherFriendly: geo.otherFriendly,
    enemies: [...allTargets, ...geo.nonTargets], board: state.board, fly: geo.fly, engagementTargets,
  })
  if (result.rejection) return result
  for (const r of result.resolved) {
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    if (anyWithinEngagementRange(fp, geo.nonTargets)) {
      return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id} would end within engagement range of a unit it did not charge`, details: { modelId: r.model.id } } }
    }
    if (r.distance <= EPS) continue
    if (!geo.fly) {
      if (pathEntersEngagement(fp, r.path, geo.nonTargets)) return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id}'s path would enter engagement range of a unit it did not charge`, details: { modelId: r.model.id } } }
      if (pathCrossesModels(fp, r.path, [...geo.nonTargets, ...allTargets])) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross an enemy model`, details: { modelId: r.model.id } } }
    }
    if (terrainService.crossesImpassable(state, r.model, r.path)) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path is blocked by terrain`, details: { modelId: r.model.id } } }
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
  }
  return result
}

// the full R-8.4/R-8.5 legality of a submitted charge move (shared by validate(), feasibility and legalActions)
function chargeMoveRejection(state: GameState, geo: ChargeGeometry, targetUnitIds: UnitId[], roll: number, placements: ModelPlacement[]): Rejection | null {
  const check = checkChargeArrangement(state, geo, targetUnitIds, roll, placements)
  if (check.rejection) return check.rejection
  for (const r of check.resolved) {
    if (r.distance <= EPS) continue
    if (!closerToAnyTarget(r.model, r.from, r.to, geo.targetGroups)) {
      return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} must end closer to a charged unit than it started`, details: { modelId: r.model.id } }
    }
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    const alreadyInContact = geo.targetGroups.flat().some((t) => inBaseContact(fp, t))
    const blockers: Footprint[] = [
      ...check.resolved.filter((o) => o.model.id !== r.model.id).map((o) => ({ pos: o.to, facing: o.facing, base: o.model.base })),
      ...geo.otherFriendly,
    ]
    if (!alreadyInContact && couldReachBaseContact(state, geo, r.model, roll, blockers)) {
      return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} could end in base contact with a charged unit and must`, details: { modelId: r.model.id } }
    }
  }
  return null
}

// candidate charge-move arrangements, tried lazily in order: the planner aiming for base contact, a near-contact gap,
// and the Engagement Range edge, each as planned and then with a coherency repair pass; the first `limit` that pass
// the full validation are returned. Feasibility (R-8.4, charge fails if no legal move) and legalActions share this,
// so a charge the engine lets through always has at least one legal chargeMove answer.
function legalChargeMoves(state: GameState, unitId: UnitId, targetUnitIds: UnitId[], roll: number, limit = 1): ModelPlacement[][] {
  const geo = chargeGeometry(state, unitId, targetUnitIds)
  if (geo.models.length === 0) return []
  const out: ModelPlacement[][] = []
  const tried = new Set<string>()
  const consider = (placements: ModelPlacement[]): boolean => {
    const key = JSON.stringify(placements)
    if (tried.has(key)) return false
    tried.add(key)
    if (chargeMoveRejection(state, geo, targetUnitIds, roll, placements) === null) out.push(placements)
    return out.length >= limit
  }
  for (const gap of [ENGAGEMENT_H - 0.01, 0.004, 0.3]) {
    const resolved = planChargeMove(state, geo, roll, gap)
    const placements: ModelPlacement[] = resolved.filter((r) => r.distance > EPS).map((r) => ({ modelId: r.model.id, pos: r.to, facing: r.facing, path: r.path }))
    if (consider(placements)) return out
    const repaired = repairCoherency(geo.models, placements, {
      allowance: () => roll - 0.02,
      blockers: [...geo.otherFriendly, ...geo.targetGroups.flat(), ...geo.nonTargets],
      ok: (m, to) => closerToAnyTarget(m, m.pos, to, geo.targetGroups) && !anyWithinEngagementRange({ pos: to, facing: m.facing, base: m.base }, geo.nonTargets)
        && terrainService.canEndAt(state, m, to).ok && !terrainService.crossesImpassable(state, m, [m.pos, to]),
    })
    if (consider(repaired)) return out
  }
  return out
}

function chargeFeasible(state: GameState, unitId: UnitId, targetUnitIds: UnitId[], maxDistance: number): boolean {
  return legalChargeMoves(state, unitId, targetUnitIds, maxDistance, 1).length > 0
}

// R-8.5: `model` ends closer (plain distance) to at least one charged unit than it started
function closerToAnyTarget(model: Model, from: Vec3, to: Vec3, targetGroups: Model[][]): boolean {
  for (const group of targetGroups) {
    if (group.length === 0) continue
    const before = Math.min(...group.map((t) => distance({ pos: from, facing: model.facing, base: model.base }, t)))
    const after = Math.min(...group.map((t) => distance({ pos: to, facing: model.facing, base: model.base }, t)))
    if (after < before - EPS) return true
  }
  return false
}

// R-8.5: could `model` legally have reached base contact with a charged unit — own travel budget, board edge,
// terrain, non-target Engagement Range, AND overlap with `blockers` (the rest of the unit's own resolved
// arrangement plus other friendlies — CHARGE-012-crowd: a contact spot already taken by a teammate doesn't count).
function couldReachBaseContact(state: GameState, geo: ChargeGeometry, model: Model, maxDistance: number, blockers: Footprint[]): boolean {
  for (const t of geo.targetGroups.flat()) {
    const c = contactCandidate(model, t, 0)
    if (c.travel > maxDistance + 1e-3) continue
    const to = { ...c.point, y: terrainService.heightAt(state, c.point.x, c.point.z) }
    const travel = dist2D(model.pos, to) + Math.abs(to.y - model.pos.y)
    if (travel > maxDistance + 1e-3) continue
    const fp: Footprint = { pos: to, facing: model.facing, base: model.base }
    if (!whollyOnBoard(fp, state.board)) continue
    if (blockers.some((b) => basesOverlap(fp, b))) continue
    const path: Path = [model.pos, to]
    if (!geo.fly && pathEntersEngagement(fp, path, geo.nonTargets)) continue
    if (!terrainService.canEndAt(state, model, to).ok) continue
    return true
  }
  return false
}

function neededChargeDistance(state: GameState, unitId: UnitId, targetUnitIds: UnitId[]): number | null {
  const geo = chargeGeometry(state, unitId, targetUnitIds)
  const allTargets = geo.targetGroups.flat()
  if (geo.models.length === 0 || allTargets.length === 0) return null
  let best = Infinity
  for (const m of geo.models) for (const t of allTargets) best = Math.min(best, horizontalGap(m, t) - ENGAGEMENT_H)
  return Math.max(0, best)
}

// ---------- Fire Overwatch (reused from movement.ts's pattern: a pushed 'overwatch' reaction targeting the charger) ----------

function overwatchTargetsFor(state: GameState, shooterUnitId: UnitId, chargerUnitId: UnitId): DeclaredTarget[] {
  const out: DeclaredTarget[] = []
  for (const half of leaderService.halves?.(state, shooterUnitId) ?? [shooterUnitId]) {
    if (state.units[half]?.location !== 'board') continue
    for (const m of unitModels(state, half)) {
      for (const wid of m.weapons) {
        const w = state.weapons[wid]
        if (w && w.kind === 'ranged') out.push({ modelId: m.id, weaponId: wid, targetUnitId: chargerUnitId, profileGroup: w.profileGroup, attacks: null })
      }
    }
  }
  return out
}

function drainChargeOverwatch(ctx: EngineContext, chargerUnitId: UnitId): AdvanceResult {
  for (;;) {
    if (ctx.state.phaseState.attack) { if (attackService.advance(ctx) === 'pending') return 'pending'; continue }
    const req = pendingReactions(ctx.state, 'overwatch').find((r) => r.enemyUnitId === chargerUnitId)
    if (!req) return 'done'
    consumeReaction(ctx.state, 'overwatch', req.unitId)
    const targets = overwatchTargetsFor(ctx.state, req.unitId, chargerUnitId)
    if (targets.length === 0) continue
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: req.unitId, overwatch: true, targets })
  }
}

function consumeHeroicFor(state: GameState, chargerUnitId: UnitId) {
  const list = pendingReactions(state, 'heroicIntervention').filter((r) => r.enemyUnitId === chargerUnitId)
  return list.length > 0 ? consumeReaction(state, 'heroicIntervention', list[0].unitId) : null
}

// one unit of work draining `charge.moveEnded` for `unitId`: the window itself (Heroic Intervention offered to the
// opponent, then Tank Shock to the active player — both via the generic stratagem/reaction window mechanism),
// Tank Shock's queued mortal wounds, then any Heroic Intervention charge it triggered (pushed onto the same stack).
function drainOneMoveEndedStep(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit) { popStack(s); return 'progress' }
  if (ctx.window('charge.moveEnded', unitId, ctx.order.defensive(otherPlayer(unit.player)), { unitId })) return 'pending'
  if (s.phaseState.attack) { return attackService.advance(ctx) === 'pending' ? 'pending' : 'progress' }
  const heroic = consumeHeroicFor(s, unitId)
  if (heroic) {
    s.phaseState.charge = { unitId: heroic.unitId, targetUnitIds: [unitId], roll: null, rerolled: false, distance: null, heroic: true }
    ctx.emit({ type: 'ChargeDeclared', unitId: heroic.unitId, targetUnitIds: [unitId], heroic: true })
    return 'progress'
  }
  popStack(s)
  return 'progress'
}

// ---------- roll (R-8.3) ----------

function collectChargeRerollKinds(ctx: EngineContext, charge: ChargeState, roll: import('../types').DiceRoll, total: number): Set<string> {
  const results = ctx.services.hooks.collect(ctx, 'onChargeRoll', {
    chargingUnitId: charge.unitId, targetUnitIds: charge.targetUnitIds,
    roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: total, rerolled: (roll.rerolled ?? []).length > 0 },
  })
  const kinds = new Set<string>()
  for (const r of results) if (r.result.kind === 'roll' && r.result.reroll) kinds.add(r.result.reroll)
  return kinds
}

function doChargeRoll(ctx: EngineContext, charge: ChargeState): 'pending' | 'ok' | 'failed' {
  const s = ctx.state
  const unitId = charge.unitId
  const unit = s.units[unitId]
  let roll = ctx.rollOnce(`charge:${unitId}`, { purpose: 'charge', player: unit.player, sides: 6, count: 2, mode: 'sum', unitId, commandRerollable: true })
  if (roll === null) return 'pending'
  let total = rollSum(roll)
  // R-1.6: a die that was already re-rolled (e.g. by a Command Re-roll answered before this re-entry) is never
  // re-rolled again, so neither the automatic re-roll nor the offer applies to it
  if (!charge.rerolled && (roll.rerolled ?? []).length > 0) charge.rerolled = true
  if (!charge.rerolled) {
    const feasibleNow = chargeFeasible(s, unitId, charge.targetUnitIds, total)
    const kinds = collectChargeRerollKinds(ctx, charge, roll, total)
    if (!feasibleNow && (kinds.has('fails') || kinds.has('all') || kinds.has('ones'))) {
      roll = ctx.reroll(roll, [0, 1], 'chargeRoll')
      total = rollSum(roll)
      charge.rerolled = true
    } else if (feasibleNow && kinds.has('all')) {
      const offerKey = `ch:rerollOffered:${unitId}`
      if (!ctx.marked(offerKey)) {
        ctx.once(offerKey)
        ctx.decide({
          kind: 'chooseOption', player: unit.player, window: 'charge.rolled', canPass: false,
          context: { topic: 'rerollOffer', unitId, abilityId: null, data: { rollId: roll.id, dieIndexes: [0, 1] } },
          options: [
            { id: 'reroll', label: 'Re-roll', action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: 'reroll' } },
            { id: 'keep', label: 'Keep', action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: 'keep' } },
          ],
        })
        return 'pending'
      }
      charge.rerolled = true
    }
  }
  charge.roll = [roll.dice[0] ?? 0, roll.dice[1] ?? 0]
  charge.distance = total
  if (ctx.once(`ch:rolledEmitted:${unitId}`)) {
    ctx.emit({ type: 'ChargeRolled', unitId, dice: charge.roll as [number, number], total, needed: neededChargeDistance(s, unitId, charge.targetUnitIds) })
  }
  if (ctx.window('charge.rolled', unitId, ctx.order.only(unit.player))) return 'pending'
  return chargeFeasible(s, unitId, charge.targetUnitIds, total) ? 'ok' : 'failed'
}

// ---------- overwatch (R-8.3's charge.moveStarted window) ----------

function doChargeOverwatch(ctx: EngineContext, charge: ChargeState): 'pending' | 'ok' | 'failed' {
  const s = ctx.state
  const unitId = charge.unitId
  const unit = s.units[unitId]
  if (ctx.window('charge.moveStarted', unitId, ctx.order.only(otherPlayer(unit.player)), { unitId })) return 'pending'
  if (drainChargeOverwatch(ctx, unitId) === 'pending') return 'pending'
  ctx.once(`ch:ow:${unitId}`)
  return chargeFeasible(s, unitId, charge.targetUnitIds, charge.distance ?? 0) ? 'ok' : 'failed'
}

// ---------- move (R-8.4/R-8.5) ----------

function doChargeMove(ctx: EngineContext, charge: ChargeState): 'pending' {
  const s = ctx.state
  const unit = s.units[charge.unitId]
  ctx.decide({
    kind: 'chargeMove', player: unit.player, window: 'charge.moveEnded', canPass: false,
    context: { unitId: charge.unitId, targetUnitIds: charge.targetUnitIds, roll: charge.distance ?? 0 },
    constraints: emptyMoveConstraints(charge.distance ?? 0, { mustEndInEngagementWith: charge.targetUnitIds, coherency: true }),
  })
  return 'pending'
}

function applyChargeMove(ctx: EngineContext, charge: ChargeState, action: Extract<Action, { type: 'chargeMove' }>): Rejection | void {
  const s = ctx.state
  const geo = chargeGeometry(s, charge.unitId, charge.targetUnitIds)
  const check = checkChargeArrangement(s, geo, charge.targetUnitIds, charge.distance ?? 0, action.placements)
  if (check.rejection) throw new EngineInvariantError('charge: stored placements failed re-validation', { rejection: check.rejection })
  for (const r of check.resolved) if (r.distance > EPS) setModelPos(r.model, r.to, r.facing)
  const halves = leaderService.halves?.(s, charge.unitId) ?? [charge.unitId]
  for (const id of halves) {
    const u = s.units[id]
    if (!u) continue
    u.turn.chargedThisTurn = true
    u.turn.chargeRoll = charge.distance ?? 0
    if (!charge.heroic) u.turn.fightsFirst = true
  }
  ctx.emit({
    type: 'ChargeMoved', unitId: charge.unitId,
    paths: Object.fromEntries(check.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])),
  })
  ctx.once(`ch:applied:${charge.unitId}`)
}

// ---------- select / declare ----------

function doSelect(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  if (ctx.marked('ch:donePhase')) return 'done'
  const active = s.activePlayer
  const eligible = eligibleChargers(s, active)
  if (eligible.length === 0) return 'done'
  ctx.decide({
    kind: 'chooseUnitToActivate', player: active, window: 'charge.start', canPass: true,
    context: { phase: 'charge', eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseUnitToActivate', player: active, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

function doDeclareCharge(ctx: EngineContext, charge: ChargeState): void {
  const s = ctx.state
  const unit = s.units[charge.unitId]
  ctx.decide({
    kind: 'declareCharge', player: unit.player, window: 'charge.start', canPass: false,
    context: { unitId: charge.unitId, candidateTargets: candidateTargets(s, charge.unitId), heroic: false },
  })
}

// drives one already-selected/declared charge (or a queued Heroic Intervention reusing `phaseState.charge`) through
// declare → charge.declared window → roll → overwatch → move; once the move is applied it is handed off to the
// `charge.moveEnded` stack (see file header) and this function returns 'progress' with `phaseState.charge` cleared.
function driveCharge(ctx: EngineContext): 'pending' | 'progress' {
  const s = ctx.state
  const charge = s.phaseState.charge as ChargeState
  const unitId = charge.unitId
  const unit = s.units[unitId]
  if (!unit || unit.location !== 'board') { s.phaseState.charge = null; return 'progress' }

  if (charge.targetUnitIds.length === 0) { doDeclareCharge(ctx, charge); return 'pending' }

  if (!ctx.marked(`ch:declaredWindow:${unitId}`)) {
    s.step = 'declare'
    if (ctx.window('charge.declared', unitId, ctx.order.only(otherPlayer(unit.player)), { unitId })) return 'pending'
    ctx.once(`ch:declaredWindow:${unitId}`)
  }

  s.step = 'roll'
  if (charge.roll === null) {
    const r = doChargeRoll(ctx, charge)
    if (r === 'pending') return 'pending'
    if (r === 'failed') { ctx.emit({ type: 'ChargeFailed', unitId }); s.phaseState.charge = null; return 'progress' }
  }

  if (!charge.heroic) {
    s.step = 'overwatch'
    if (!ctx.marked(`ch:ow:${unitId}`)) {
      const r = doChargeOverwatch(ctx, charge)
      if (r === 'pending') return 'pending'
      if (r === 'failed') { ctx.emit({ type: 'ChargeFailed', unitId }); s.phaseState.charge = null; return 'progress' }
    }
  }

  s.step = 'move'
  if (!ctx.marked(`ch:applied:${unitId}`)) {
    const r = doChargeMove(ctx, charge)
    if (r === 'pending') return 'pending'
  }

  pushStack(s, unitId)
  s.phaseState.charge = null
  return 'progress'
}


// ---------- legal-action candidates (W1-G) ----------
function chargeLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind === 'declareCharge') {
    return pending.context.candidateTargets.map((t) => ({ type: 'declareCharge', player: pending.player, decisionId: pending.id, unitId: pending.context.unitId, targetUnitIds: [t] }) as Action)
  }
  if (pending.kind === 'chargeMove') {
    const { unitId, targetUnitIds, roll } = pending.context
    if (!state.units[unitId]) return []
    return legalChargeMoves(state, unitId, targetUnitIds, roll, 2)
      .map((placements) => ({ type: 'chargeMove', player: pending.player, decisionId: pending.id, unitId, placements }) as Action)
  }
  return optionActions(pending)
}

export const chargeModule: PhaseModule = {
  name: 'charge',
  legalActions(state, pending) { return chargeLegalActions(state, pending) },
  enter(ctx) {
    ctx.state.step = 'declare'
    ctx.state.phaseState.activated = []
    ctx.state.phaseState.charge = null
    writeStack(ctx.state, [])
  },
  advance(ctx) {
    const s = ctx.state
    for (;;) {
      if (s.phaseState.charge) {
        const r = driveCharge(ctx)
        if (r === 'pending') return 'pending'
        continue
      }
      const stack = readStack(s)
      if (stack.length > 0) {
        const r = drainOneMoveEndedStep(ctx, stack[stack.length - 1])
        if (r === 'pending') return 'pending'
        continue
      }
      const r = doSelect(ctx)
      if (r === 'pending') return 'pending'
      return 'done'
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'declareCharge') {
      if (action.type !== 'declareCharge') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'declareCharge is for the wrong unit', details: { expected: pending.context.unitId } }
      if (action.targetUnitIds.length === 0) return { code: 'E_INVALID_TARGET', reason: 'must declare at least one charge target' }
      const candidates = new Set(pending.context.candidateTargets)
      for (const id of action.targetUnitIds) {
        if (!candidates.has(id)) return { code: 'E_INVALID_TARGET', reason: `${id} is not a legal charge target (out of range, not visible-eligible, or not an enemy on the board)`, details: { targetUnitId: id } }
      }
      return null
    }
    if (pending.kind === 'chargeMove') {
      if (action.type !== 'chargeMove') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'chargeMove is for the wrong unit', details: { expected: pending.context.unitId } }
      const geo = chargeGeometry(state, action.unitId, pending.context.targetUnitIds)
      return chargeMoveRejection(state, geo, pending.context.targetUnitIds, pending.context.roll, action.placements)
    }
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') {
      if (pending.kind === 'chooseUnitToActivate') { ctx.once('ch:donePhase'); return }
      return { code: 'E_NOT_AN_OPTION', reason: `charge: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseUnitToActivate' && action.type === 'chooseUnitToActivate') {
      s.phaseState.charge = { unitId: action.unitId, targetUnitIds: [], roll: null, rerolled: false, distance: null, heroic: false }
      return
    }
    if (pending.kind === 'declareCharge' && action.type === 'declareCharge') {
      const charge = s.phaseState.charge
      if (!charge || charge.unitId !== action.unitId) return { code: 'E_INVALID_TARGET', reason: 'declareCharge is for the wrong unit' }
      charge.targetUnitIds = [...action.targetUnitIds]
      for (const id of leaderService.halves?.(s, action.unitId) ?? [action.unitId]) if (!s.phaseState.activated.includes(id)) s.phaseState.activated.push(id)
      ctx.emit({ type: 'ChargeDeclared', unitId: action.unitId, targetUnitIds: charge.targetUnitIds, heroic: false })
      return
    }
    if (pending.kind === 'chargeMove' && action.type === 'chargeMove') {
      const charge = s.phaseState.charge
      if (!charge || charge.unitId !== action.unitId) return { code: 'E_INVALID_TARGET', reason: 'chargeMove is for the wrong unit' }
      return applyChargeMove(ctx, charge, action)
    }
    if (pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer' && action.type === 'chooseOption') {
      if (action.optionId === 'reroll') {
        const data = pending.context.data as { rollId: string; dieIndexes: number[] }
        const roll = s.phaseState.lastRoll
        if (!roll || roll.id !== data.rollId) throw new EngineInvariantError('rerollOffer: roll is no longer current', { rollId: data.rollId })
        ctx.reroll(roll, data.dieIndexes, 'rerollOffer')
      }
      return
    }
    if (s.phaseState.attack && (pending.kind === 'allocateAttack' || (pending.kind === 'chooseOption' && ATTACK_CHOOSE_TOPICS.has(pending.context.topic)))) {
      return attackService.handler.handle(ctx, action, pending)
    }
    return notImplementedHandle('charge')(ctx, action, pending)
  },
}
