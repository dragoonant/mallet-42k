// Tier-1 heuristic AI (owner: src/ai). Implements the engine's Decider interface (00-arch §3) by scoring every
// legal action for the current decision with cheap heuristics (docs/spec/40-ai.md, simplified per the "playable
// fast" owner priority: no Monte Carlo, no role planner, no points data — see src/ai/expected.ts header for the
// specific simplifications). `easy` picks randomly among the top 3 scored actions; `normal` always takes the best.
import {
  DEFAULT_SERVICES, boardModelsOf, boardUnitsOf, deploymentZone, distance, hasKeyword, legalActions, modelProfile,
  modelStats, unitModels, validate, basesOverlap, type Footprint, whollyOnBoard, whollyWithinPolygon, pointInPolygon, withinEngagementRange, withinObjectiveRange,
  type Action, type DeclareChargeAction, type DeclareMoveAction, type DeclareTargetsAction, type Decider,
  type DeployUnitAction, type GameState, type ModelPlacement, type ObjectiveId, type PendingDecision, type PlayerId,
  type PlayerView, type Polygon, type UnitId, type UseStratagemAction,
} from '../engine'
import type { ScoringRule } from '../data/types'
import { createRng, restoreRng, type Rng } from '../engine/rng'
import { commandRerollScore, scoreStratagemOrReaction } from './stratagems'
import {
  bestMeleeWeapon, bestRangedRangeOfUnit, bestRangedWeapon, expectedAttack, hasAnyMeleeWeapon, hasAnyRangedWeapon,
  sumExpectedAttacks, threatAt, unitMeleeDamage, unitRangedDamage, unitValue,
} from './expected'
import { buildFormation, shapeRoleScore, shapesForRole, type FormationModel, type FormationRole, type FormationShape } from './formations'

export type Difficulty = 'easy' | 'normal'

const ENGAGEMENT_H = 1 // mirrors src/engine/geometry.ts ENGAGEMENT_H (not re-exported by name conflict-safe here)

export function other(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

function polyCentroid(poly: Polygon): { x: number; z: number } {
  if (poly.length === 0) return { x: 0, z: 0 }
  let x = 0, z = 0
  for (const p of poly) { x += p.x; z += p.z }
  return { x: x / poly.length, z: z / poly.length }
}

function placementsCenter(placements: ModelPlacement[]): { x: number; z: number } {
  if (placements.length === 0) return { x: 0, z: 0 }
  let x = 0, z = 0
  for (const p of placements) { x += p.pos.x; z += p.pos.z }
  return { x: x / placements.length, z: z / placements.length }
}

// Mirrors src/engine/missions.ts's objectiveIdsOf: which objective ids a ScoringRule actually reads (explicit
// list, one resolved from mission.custom, or — the common case — every objective on the board).
function ruleObjectiveIds(state: GameState, rule: ScoringRule): ObjectiveId[] {
  const params = (rule.params ?? {}) as Record<string, unknown>
  if (Array.isArray(params.objectiveIds)) return params.objectiveIds as ObjectiveId[]
  const fromCustom = params.objectiveIdsFromCustom as string | undefined
  if (fromCustom) {
    const v = (state.mission.custom as Record<string, unknown>)[fromCustom]
    if (typeof v === 'string') return [v]
    if (Array.isArray(v)) return v as ObjectiveId[]
    return []
  }
  return Object.keys(state.objectives)
}

// How many VP/round holding this specific marker is actually worth to `player` under the live mission's real
// scoring rules (40-ai.md: "not standing on scoring objectives" — a flat per-objective heuristic can't tell a
// mission's scored centre markers apart from a non-scoring home marker, or know whose home matters to whom).
// Rules that repeat the same points across round-range variants (r2-4/r5-first/r5-second) are deduped by rule
// type (max, not sum) since they don't stack simultaneously; distinct rule types add.
export function objectiveScoreWeight(state: GameState, player: PlayerId, objectiveId: ObjectiveId): number {
  const obj = state.objectives[objectiveId]
  if (!obj) return 1
  const opp = other(player)
  const perType: Record<string, number> = {}
  for (const rule of state.mission.scoring) {
    const pts = rule.pointsPer ?? 0
    if (pts <= 0) continue
    switch (rule.rule) {
      case 'holdObjectives':
      case 'holdNamed':
      case 'claimedSite':
      case 'claimedSiteConsecutive':
        if (ruleObjectiveIds(state, rule).includes(objectiveId)) perType[rule.rule] = Math.max(perType[rule.rule] ?? 0, pts)
        break
      case 'holdMore':
        if (ruleObjectiveIds(state, rule).includes(objectiveId)) perType.holdMore = Math.max(perType.holdMore ?? 0, pts * 0.3)
        break
      case 'holdHome':
        if (obj.home === player) perType.holdHome = Math.max(perType.holdHome ?? 0, pts)
        break
      case 'holdEnemyHome':
        if (obj.home === opp) perType.holdEnemyHome = Math.max(perType.holdEnemyHome ?? 0, pts)
        break
      default: break // custom/destroyedUnits/razedThisTurn/unitsInEnemyZone aren't simple hold-this-marker value
    }
  }
  const total = Object.values(perType).reduce((a, b) => a + b, 0)
  // a marker no live scoring rule rewards holding (e.g. your own home in a mission that only scores the enemy's)
  // should barely register — otherwise its flat "I'm standing on *something*" pull out-competes marching toward
  // a marker that actually scores, which is only a few points closer each turn
  return total > 0 ? 1 + total * 0.4 : 0.15
}

// Σ over live objectives of a pull term (closer + on-marker is better; enemy-held markers pull harder — contest
// them; each objective is weighted by how much it's actually worth holding under this mission's scoring, so the
// AI chases scored centre/enemy-home markers instead of camping a marker that scores nobody anything)
function objectivePull(state: GameState, player: PlayerId, pos: { x: number; z: number }): number {
  let score = 0
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    const controller = DEFAULT_SERVICES.objectives.controller(state, obj.id)
    const weight = objectiveScoreWeight(state, player, obj.id)
    const base = (controller === player ? 3 : controller === other(player) ? 8 : 5) * weight
    const d = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z)
    // gentler falloff than 1/(1+d): a scored objective should still pull meaningfully from a turn or two's move
    // away (6-12"), not only once a unit is already almost on top of it
    score += base / (1 + d / 6)
    if (d <= 3) score += (controller === player ? 1 : 6) * weight
  }
  return score
}

// crude edge-to-edge gap from a point to the nearest enemy unit (no model-vs-model measurement, just a probe point)
export function nearestEnemyFromPoint(state: GameState, player: PlayerId, pos: { x: number; z: number }): { gap: number; unitId: UnitId } | null {
  let best: { gap: number; unitId: UnitId } | null = null
  for (const u of boardUnitsOf(state, other(player))) {
    for (const m of unitModels(state, u.id)) {
      const gap = Math.max(0, Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z) - m.base.radius)
      if (!best || gap < best.gap) best = { gap, unitId: u.id }
    }
  }
  return best
}

// real edge-to-edge gap between two units' models (used once positions are actually known, e.g. for a charge)
export function nearestEnemyUnit(state: GameState, player: PlayerId, unitId: UnitId): { gap: number; unitId: UnitId } | null {
  const mine = unitModels(state, unitId)
  if (mine.length === 0) return null
  let best: { gap: number; unitId: UnitId } | null = null
  for (const u of boardUnitsOf(state, other(player))) {
    const theirs = unitModels(state, u.id)
    let gap = Infinity
    for (const a of mine) for (const b of theirs) gap = Math.min(gap, distance(a, b))
    if (!best || gap < best.gap) best = { gap, unitId: u.id }
  }
  return best
}

export function minGapBetweenUnits(state: GameState, a: UnitId, b: UnitId): number {
  const as = unitModels(state, a), bs = unitModels(state, b)
  let gap = Infinity
  for (const x of as) for (const y of bs) gap = Math.min(gap, distance(x, y))
  return gap
}

export function centerOfUnit(state: GameState, unitId: UnitId): { x: number; z: number } | null {
  const models = unitModels(state, unitId)
  if (models.length === 0) return null
  let x = 0, z = 0
  for (const m of models) { x += m.pos.x; z += m.pos.z }
  return { x: x / models.length, z: z / models.length }
}

// enemy units currently within Engagement Range of unitId (used to check whether a fight-phase stratagem is
// actually about to matter, e.g. Veteran Instincts / Epic Challenge)
export function engagedEnemyUnits(state: GameState, player: PlayerId, unitId: UnitId): UnitId[] {
  const mine = unitModels(state, unitId)
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, other(player))) {
    const theirs = unitModels(state, u.id)
    if (mine.some((a) => theirs.some((b) => withinEngagementRange(a, b)))) out.push(u.id)
  }
  return out
}

// 2D6 ≥ n probability table (40-ai.md §5)
const CHARGE_PROB: Record<number, number> = { 2: 1, 3: 0.972, 4: 0.917, 5: 0.833, 6: 0.722, 7: 0.583, 8: 0.417, 9: 0.278, 10: 0.167, 11: 0.083, 12: 0.028 }
export function chargeProb(needed: number): number {
  if (needed <= 2) return 1
  if (needed >= 12) return needed === 12 ? CHARGE_PROB[12] : 0
  return CHARGE_PROB[needed] ?? 0.417
}

function countEngagedAfter(state: GameState, unitId: UnitId, placements: ModelPlacement[]): number {
  const player = state.units[unitId]?.player
  if (!player) return 0
  const enemies = boardModelsOf(state, other(player))
  let n = 0
  for (const p of placements) {
    const model = state.models[p.modelId]
    if (!model) continue
    const fp = { pos: p.pos, facing: p.facing ?? model.facing, base: model.base }
    if (enemies.some((e) => withinEngagementRange(fp, e))) n++
  }
  return n
}

// nearest objective actually worth holding (objectiveScoreWeight > 1), and how far it is from `pos` — used to
// reward *closing the gap* on top of the absolute objectivePull, see scorePosition below.
function nearestValuableObjective(state: GameState, player: PlayerId, pos: { x: number; z: number }): { dist: number; weight: number } | null {
  let best: { dist: number; weight: number } | null = null
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    const weight = objectiveScoreWeight(state, player, obj.id)
    if (weight <= 1) continue
    const dist = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z)
    if (!best || dist < best.dist) best = { dist, weight }
  }
  return best
}

// Shared position scorer for moveUnit / chargeMove / pileIn / consolidate: objective pull, threat avoidance,
// charge/shoot readiness, and (for charge/consolidate) how many models end up fighting.
function scorePosition(state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[], bonusEngage: boolean): number {
  if (placements.length === 0) return 0
  const center = placementsCenter(placements)
  let score = objectivePull(state, player, center)
  score -= threatAt(state, player, center) * 2
  // objectivePull's gradient is gentle at range (by design, so a unit doesn't panic-sprint from 20" out) and
  // threatAt already grows the moment a unit enters any enemy's threat radius, so early on a unit can find every
  // reachable placement scores about the same (or worse) than just not moving at all — it "freezes" in its
  // deployment zone for the whole game rather than ever closing on a valuable objective. Reward the move itself
  // for closing distance to the nearest valuable objective, independent of the absolute pull, so progress always
  // beats standing still.
  const currentCenter = centerOfUnit(state, unitId)
  if (currentCenter) {
    const before = nearestValuableObjective(state, player, currentCenter)
    const after = nearestValuableObjective(state, player, center)
    if (before && after && before.dist > 3) score += Math.max(0, before.dist - after.dist) * Math.min(before.weight, after.weight) * 0.15
  }
  const enemy = nearestEnemyFromPoint(state, player, center)
  if (enemy) {
    if (hasAnyMeleeWeapon(state, unitId)) {
      const needed = Math.max(0, Math.ceil(enemy.gap - ENGAGEMENT_H))
      score += chargeProb(needed) * unitValue(state, enemy.unitId) * 0.05
    }
    if (hasAnyRangedWeapon(state, unitId)) {
      const range = bestRangedRangeOfUnit(state, unitId)
      if (range !== null && enemy.gap <= range) score += unitValue(state, enemy.unitId) * 0.05
    }
  }
  if (bonusEngage) score += countEngagedAfter(state, unitId, placements) * 3
  return score
}

// Deployment-only objective pull. objectivePull's flat "+6*weight when within 3 inch" bonus is fine for a unit that is
// already moving, but at deployment it is the whole story: under holdObjectives every marker (home ones included) has
// weight ~3, so the single in-zone marker is worth ~+18 on top of ~15, every unit piles onto it, and the deployment looks
// like one blob in one spot. So here (a) each marker's value shrinks with every friendly unit already parked within 6
// inch of it, which spreads units across the markers they can reach, and (b) pure shooters only get a fraction of the
// on-marker bonus, they just need to stay within a move of it with a fire lane.
function deployObjectivePull(state: GameState, player: PlayerId, unitId: UnitId, pos: { x: number; z: number }, onMarkerShare: number): number {
  let score = 0
  const mates = boardUnitsOf(state, player).filter((u) => u.id !== unitId).map((u) => centerOfUnit(state, u.id)).filter((c): c is { x: number; z: number } => c !== null)
  for (const obj of Object.values(state.objectives)) {
    if (obj.removed) continue
    const controller = DEFAULT_SERVICES.objectives.controller(state, obj.id)
    const weight = objectiveScoreWeight(state, player, obj.id)
    const base = (controller === player ? 3 : controller === other(player) ? 8 : 5) * weight
    const covered = mates.filter((c) => Math.hypot(c.x - obj.pos.x, c.z - obj.pos.z) <= 6).length
    const share = 1 / (1 + 0.9 * covered)
    const d = Math.hypot(obj.pos.x - pos.x, obj.pos.z - pos.z)
    score += (base / (1 + d / 6)) * share
    if (d <= 3) score += (controller === player ? 1 : 6) * weight * share * onMarkerShare
  }
  return score
}

function scoreDeployUnit(state: GameState, player: PlayerId, action: DeployUnitAction): number {
  if (action.toReserves) return 0.5
  const center = placementsCenter(action.placements)
  const meleeOnly = hasAnyMeleeWeapon(state, action.unitId) && !hasAnyRangedWeapon(state, action.unitId)
  const shooter = hasAnyRangedWeapon(state, action.unitId) && !meleeOnly
  let score = deployObjectivePull(state, player, action.unitId, center, shooter ? 0.3 : 1)
  score -= threatAt(state, player, center) * 2
  const zoneCentroid = polyCentroid(deploymentZone(state, other(player)))
  if (meleeOnly) {
    const dToEnemy = Math.hypot(center.x - zoneCentroid.x, center.z - zoneCentroid.z)
    score += Math.max(0, 40 - dToEnemy) * 0.03
  }
  // friendly units already deployed: keep a spread (centre-to-centre), a unit-level term on top of model overlap
  let crowd = 0
  for (const u of boardUnitsOf(state, player)) {
    if (u.id === action.unitId) continue
    const c = centerOfUnit(state, u.id)
    if (!c) continue
    const d = Math.hypot(c.x - center.x, c.z - center.z)
    if (d < 8) crowd += 8 - d
  }
  score -= crowd * 0.4
  // A deployment right in a board-edge corner can leave a unit with almost no room to maneuver later — every
  // "move toward the objective" direction ends up crossing the board edge or a ruin wall that's often tucked into
  // that same corner, so the unit ends up stuck in place move after move despite still having full Move stat.
  // Objective pull alone doesn't see that cost (it only measures distance, not "can I actually go anywhere from
  // here"), so nudge deployment away from tight corners as a cheap proxy.
  const edgeMargin = 2.5
  const edgeDist = Math.min(state.board.w / 2 - Math.abs(center.x), state.board.h / 2 - Math.abs(center.z))
  if (edgeDist < edgeMargin) score -= (edgeMargin - edgeDist) * 1.5
  return score
}

function scoreDeclareMove(state: GameState, player: PlayerId, action: DeclareMoveAction): number {
  const unitId = action.unitId
  const models = unitModels(state, unitId)
  if (models.length === 0) return 0
  const stats = modelStats(state, models[0])
  const ranged = hasAnyRangedWeapon(state, unitId)
  const melee = hasAnyMeleeWeapon(state, unitId)
  const heavy = models.some((m) => m.weapons.some((w) => DEFAULT_SERVICES.weapons.hasAbility(DEFAULT_SERVICES.weapons.effectiveWeapon(state, m.id, w), 'HEAVY')))
  // both "am I already sitting somewhere useful" and "how far to the nearest unheld marker" need to know whether
  // holding that marker actually scores anything under the live mission (weight > 1) — otherwise a unit happily
  // parks on / advances toward its own non-scoring home objective instead of a farther one that pays out
  const onControlledValuableObjective = Object.values(state.objectives).some(
    (o) => !o.removed && DEFAULT_SERVICES.objectives.controller(state, o.id) === player
      && objectiveScoreWeight(state, player, o.id) > 1 && models.some((m) => withinObjectiveRange(m, o)),
  )
  let nearestUnheld = Infinity
  let nearestValuableUnheld = Infinity
  for (const o of Object.values(state.objectives)) {
    if (o.removed || DEFAULT_SERVICES.objectives.controller(state, o.id) === player) continue
    const weight = objectiveScoreWeight(state, player, o.id)
    for (const m of models) {
      const d = Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z)
      nearestUnheld = Math.min(nearestUnheld, d)
      if (weight > 1) nearestValuableUnheld = Math.min(nearestValuableUnheld, d)
    }
  }
  const nearestUnheldTarget = nearestValuableUnheld < Infinity ? nearestValuableUnheld : nearestUnheld
  const enemy = nearestEnemyUnit(state, player, unitId)
  const gap = enemy?.gap ?? Infinity
  const rangedRange = bestRangedRangeOfUnit(state, unitId) ?? 24
  // elite-army play (40-ai.md priority): a gunline unit only benefits from staying put if it's actually about to
  // shoot something from here — HEAVY's +1 to hit and "already in range" only matter with a target in range right
  // now. Otherwise standing still just camps deployment while objectives (often worth far more than a stray shot)
  // sit uncontested — this was letting Marine gunline squads freeze in place for entire games (never reaching any
  // scored objective) since the flat HEAVY/ranged bonus applied unconditionally.
  const canShootFromHere = ranged && gap <= rangedRange
  switch (action.moveType) {
    case 'stationary': {
      let s = 1.0
      if (ranged && heavy && canShootFromHere) s += 2.5
      if (onControlledValuableObjective) s += 1.5
      if (ranged && !melee && canShootFromHere) s += 1.5
      if (!canShootFromHere && !onControlledValuableObjective) s -= 1.5
      return s
    }
    case 'normal': {
      // Normal moves keep full shooting eligibility (only Advance/Fall Back forfeit it), so a ranged unit loses
      // nothing by repositioning toward a valuable objective while still able to shoot this turn.
      let s = 2.0
      if (melee && gap > stats.M + ENGAGEMENT_H && gap <= stats.M + 12) s += 1.0
      if (nearestUnheldTarget <= stats.M + 6) s += 1.5
      return s
    }
    case 'advance': {
      let s = 1.0
      if (nearestUnheldTarget > stats.M && nearestUnheldTarget <= stats.M + 3.5) s += 3.0
      if (melee && gap > stats.M && gap <= stats.M + 10.5) s += 1.5
      if (ranged) s -= gap <= rangedRange + stats.M ? 3.0 : 0.5 // forfeits shooting this turn
      return s
    }
    case 'fallBack': {
      let s = -3.0
      if (gap <= ENGAGEMENT_H + 0.5) {
        // nearly every model has *some* melee weapon, so "has one at all" barely ever gates this — compare the
        // actual trade instead: losing the melee exchange badly (in value terms) means leave regardless
        const losingTrade = ranged && enemy
          ? unitMeleeDamage(state, enemy.unitId, unitId, {}) * unitValue(state, enemy.unitId)
            > unitMeleeDamage(state, unitId, enemy.unitId, {}) * unitValue(state, unitId) * 1.2
          : false
        if (!melee || losingTrade) s += 3.5
      }
      return s
    }
    default:
      return 0
  }
}

function scoreDeclareTargets(state: GameState, pending: PendingDecision, action: DeclareTargetsAction): number {
  if (pending.kind !== 'declareTargets') return 0
  if (action.targets.length === 0) return 0.5
  const groups = new Map<UnitId, { modelId: string; weaponId: string; attacks: number | null }[]>()
  for (const t of action.targets) {
    const arr = groups.get(t.targetUnitId) ?? []
    arr.push({ modelId: t.modelId, weaponId: t.weaponId, attacks: t.attacks ?? null })
    groups.set(t.targetUnitId, arr)
  }
  const attackerUnit = state.units[pending.context.unitId]
  const charged = attackerUnit?.turn.chargedThisTurn ?? false
  let total = 0
  for (const [targetUnitId, assigns] of groups) {
    const target = state.units[targetUnitId]
    if (!target) continue
    const dmg = sumExpectedAttacks(state, assigns.map((a) => ({ ...a, targetUnitId })), { charged })
    const val = unitValue(state, targetUnitId)
    const totalWounds = unitModels(state, targetUnitId).reduce((s, m) => s + m.woundsRemaining, 0)
    let mult = 1
    if (totalWounds > 0 && dmg >= totalWounds) mult += 0.6 // likely finishes the unit
    if (target.models.length < target.startingStrength) mult += 0.2 // already wounded — finish it
    if (Object.values(state.objectives).some((o) => !o.removed && unitModels(state, targetUnitId).some((m) => withinObjectiveRange(m, o)))) mult += 0.3
    total += dmg * val * 0.02 * mult
  }
  return total
}

function scoreAllocateAttack(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (pending.kind !== 'allocateAttack' || action.type !== 'allocateAttack') return 0
  const model = state.models[action.modelId]
  if (!model) return -1
  const target = state.units[pending.context.targetUnitId]
  const profile = modelProfile(state, model)
  const wounded = model.woundsRemaining < profile.stats.W
  const iAmDefending = target?.player === player
  let score = 0
  if (iAmDefending) {
    if (profile.champion) score -= 3
    if (wounded) score += 2 // finish an already-damaged model rather than spread damage
  } else {
    // Precision: attacking player choosing which enemy model eats it — go for value
    if (profile.champion) score += 3
    if (wounded) score += 1
  }
  return score
}

function scoreChooseUnitToActivate(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (action.type === 'pass') return -1000
  if (action.type !== 'chooseUnitToActivate' || pending.kind !== 'chooseUnitToActivate') return 0
  const unitId = action.unitId
  if (pending.context.phase === 'shooting') {
    let best = 0
    for (const enemy of boardUnitsOf(state, other(player))) best = Math.max(best, unitRangedDamage(state, unitId, enemy.id) * unitValue(state, enemy.id) * 0.02)
    return best + unitValue(state, unitId) * 0.001
  }
  return unitValue(state, unitId)
}

function scoreChooseFightUnit(state: GameState, player: PlayerId, action: Action): number {
  if (action.type === 'pass') return -1000
  if (action.type !== 'chooseFightUnit') return 0
  const unitId = action.unitId
  const myModels = unitModels(state, unitId)
  const charged = state.units[unitId]?.turn.chargedThisTurn ?? false
  let best = 0
  for (const enemy of boardUnitsOf(state, other(player))) {
    const theirModels = unitModels(state, enemy.id)
    let engaged = false
    for (const a of myModels) { for (const b of theirModels) if (withinEngagementRange(a, b)) { engaged = true; break } ; if (engaged) break }
    if (!engaged) continue
    best = Math.max(best, unitMeleeDamage(state, unitId, enemy.id, { charged }) * unitValue(state, enemy.id) * 0.02)
  }
  return best
}

function scoreDeclareCharge(state: GameState, player: PlayerId, action: DeclareChargeAction | { type: 'pass' }): number {
  if (action.type === 'pass') return 0.3
  const unitId = action.unitId
  // elite-army play: only counter-charge favourable fights. Weighing our own expected losses at half the rate of
  // the damage we deal (the old 0.01 vs 0.02) systematically undervalues our own models — it let a lone Captain
  // charge a Deff Dread it had no realistic chance against and get killed. Both sides of the trade now use the
  // same scale, and a solo CHARACTER (the single most expensive, hardest-to-replace model in an elite list) gets
  // an extra risk penalty on top since losing it costs more than its raw stat-derived value already implies.
  const isLoneCharacter = hasKeyword(state, unitId, 'CHARACTER') && unitModels(state, unitId).length <= 1
  const riskMult = isLoneCharacter ? 1.6 : 1.0
  let neededMax = 0, payoff = 0
  for (const targetId of action.targetUnitIds) {
    const gap = minGapBetweenUnits(state, unitId, targetId)
    neededMax = Math.max(neededMax, Math.max(0, gap - ENGAGEMENT_H))
    const dmg = unitMeleeDamage(state, unitId, targetId, { charged: true })
    const ret = unitMeleeDamage(state, targetId, unitId, {})
    payoff += dmg * unitValue(state, targetId) * 0.02 - ret * unitValue(state, unitId) * 0.02 * riskMult
  }
  const p = chargeProb(Math.ceil(neededMax))
  return p * payoff - (1 - p) * 0.4
}

function scoreChooseOption(state: GameState, pending: PendingDecision, action: Action): number {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return 0
  const option = pending.options.find((o) => o.action.type === 'chooseOption' && o.action.optionId === action.optionId)
  const hint = (option?.hint ?? {}) as Record<string, unknown>
  let score = 0
  if (typeof hint.vp === 'number') score += hint.vp * 5
  if (typeof hint.value === 'number') score += hint.value
  if (typeof hint.priority === 'number') score += hint.priority
  const hintUnitId = typeof hint.unitId === 'string' ? (hint.unitId as UnitId) : null
  const topic = pending.context.topic
  if (hintUnitId && state.units[hintUnitId]) {
    if (topic === 'desperateEscapeCasualty' || topic === 'coherencyCull' || topic === 'hazardousCasualty') {
      score -= unitValue(state, hintUnitId) * 0.05 // lose the cheapest model
    } else {
      score += unitValue(state, hintUnitId) * 0.03 // e.g. oathTarget/bagTarget/stompTarget: aim at the best target
    }
  }
  const label = (option?.label ?? '').toLowerCase()
  if (/(skip|none|decline)/.test(label)) score -= 1
  // Patrol Squads: a bot keeps its unit whole (one activation, one deployment spot) rather than splitting at random
  if ((pending.context.data as { choice?: string }).choice === 'patrolSquads' && action.optionId === 'keep') score += 0.5
  const code = (pending.context.data as { code?: string }).code
  // Astra Militarum Voice of Command: prefer Take Aim! on gunlines, Move! Move! Move! on units that need to cross the board,
  // Take Cover! on units with a poor save under fire; an Order to every unit (Command Laurels) is always good value.
  if (code === 'voiceOfCommand' && action.optionId !== 'decline') {
    const order = typeof hint.order === 'string' ? hint.order : ''
    const unitId = hintUnitId
    const shooter = unitId ? hasAnyRangedWeapon(state, unitId) : true
    if (order.endsWith('take-aim')) score += shooter ? 2.5 : 0.5
    else if (order.endsWith('move-move-move')) score += 1.2
    else if (order.endsWith('take-cover')) score += 1.6
    if (unitId) score += unitValue(state, unitId) * 0.01
    else score += 2
  }
  // Methodical Destruction: the VP only come if the pick dies this round, so mark the unit most likely to die (cheapest on the board).
  if (code === 'methodicalDestructionPick' && hintUnitId) score = -unitValue(state, hintUnitId) * 0.03
  return score
}

function scoreAction(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  switch (pending.kind) {
    case 'deployUnit': return action.type === 'deployUnit' ? scoreDeployUnit(state, player, action) : 0
    case 'chooseUnitToActivate': return scoreChooseUnitToActivate(state, player, pending, action)
    case 'declareMove': return action.type === 'declareMove' ? scoreDeclareMove(state, player, action) : 0
    case 'moveUnit': return action.type === 'moveUnit' ? scorePosition(state, player, action.unitId, action.placements, false) : 0
    case 'declareTargets': return action.type === 'declareTargets' ? scoreDeclareTargets(state, pending, action) : 0
    case 'allocateAttack': return scoreAllocateAttack(state, player, pending, action)
    case 'declareCharge': return action.type === 'declareCharge' || action.type === 'pass' ? scoreDeclareCharge(state, player, action as DeclareChargeAction | { type: 'pass' }) : 0
    case 'chargeMove': return action.type === 'chargeMove' ? scorePosition(state, player, action.unitId, action.placements, true) : 0
    case 'pileIn': return action.type === 'pileIn' ? scorePosition(state, player, action.unitId, action.placements, true) : 0
    case 'consolidate': return action.type === 'consolidate' ? scorePosition(state, player, action.unitId, action.placements, true) : 0
    case 'chooseFightUnit': return scoreChooseFightUnit(state, player, action)
    case 'stratagemWindow': return scoreStratagemOrReaction(state, player, pending, action)
    case 'reactionWindow': return scoreStratagemOrReaction(state, player, pending, action)
    case 'chooseOption': return scoreChooseOption(state, pending, action)
    case 'commandReroll': return commandRerollScore(state, player, pending, action)
    case 'confirm': return 0
    default: return 0
  }
}

// M9: an attack-roll `rerollOffer` (data.needed present) names the offered dice; the bot re-rolls only the ones that fail
// (none in practice — failures are re-rolled automatically — so it keeps), never a die that already succeeded.
function rerollOfferAnswer(state: GameState, pending: PendingDecision, options: Action[]): Action | null {
  if (pending.kind !== 'chooseOption' || pending.context.topic !== 'rerollOffer') return null
  const data = pending.context.data as { rollId?: string; dieIndexes?: number[]; needed?: number; purpose?: string }
  // Gunnery Officer: re-roll the dice that set a weapon's number of attacks when they came up low (3 or less on average)
  if (data.purpose === 'attacks' && Array.isArray(data.dieIndexes)) {
    const roll = state.phaseState.lastRoll
    const reroll = options.find((o) => o.type === 'chooseOption' && o.optionId === 'reroll')
    const keep = options.find((o) => o.type === 'chooseOption' && o.optionId === 'keep')
    if (!roll || roll.id !== data.rollId || !reroll || !keep) return null
    const dice = data.dieIndexes.map((i) => roll.dice[i]).filter((d) => typeof d === 'number')
    const avg = dice.length > 0 ? dice.reduce((a, b) => a + b, 0) / dice.length : 4
    return avg <= 3 ? reroll : keep
  }
  if (typeof data.needed !== 'number' || !Array.isArray(data.dieIndexes)) return null
  const roll = state.phaseState.lastRoll
  const reroll = options.find((o) => o.type === 'chooseOption' && o.optionId === 'reroll')
  const keep = options.find((o) => o.type === 'chooseOption' && o.optionId === 'keep')
  if (!roll || roll.id !== data.rollId || !reroll || reroll.type !== 'chooseOption' || !keep) return null
  const failed = data.dieIndexes.filter((i) => roll.dice[i] === 1 || roll.dice[i] < (data.needed as number))
  return failed.length > 0 ? { ...reroll, dieIndexes: failed } : keep
}

// Adepta Sororitas Acts of Faith: spend a pool die in place of one die of a D6 roll only when it changes the outcome.
// The decision data carries the roll's target (needed, already net of AP / cover for saves), the net modifier and, for saves,
// the weapon's max Damage. Policy (lowest die that qualifies is used, so the best dice stay in the pool):
//  - save: only vs Damage >= 2, needed >= 3, and the die itself clears needed (a 5 vs AP-3 does nothing);
//  - hit / wound: needed >= 4 and the die clears it;
//  - charge / battle-shock (2D6): only when an average roll is not enough (needed > 7 - modifier) and the die plus an
//    average second die (3.5) reaches needed;
//  - advance: a 6 only; damage: never. With no 'needed' in the data, fall back to a flat bar.
interface MiracleData { purpose?: string; pool?: number[]; needed?: number | null; modifier?: number; damage?: number | null }
const MIRACLE_FLAT_BAR: Record<string, number> = { charge: 5, battleShock: 5, save: 5, wound: 5, hit: 5, advance: 6, damage: 7 }
function miracleWorthIt(d: MiracleData, v: number): boolean {
  const purpose = d.purpose ?? ''
  const needed = d.needed ?? null
  const mod = d.modifier ?? 0
  if (purpose === 'advance') return v >= 6
  if (purpose === 'damage') return false
  if (needed === null) return v >= (MIRACLE_FLAT_BAR[purpose] ?? 7)
  if (purpose === 'save') return (d.damage ?? 2) >= 2 && needed >= 3 && v >= needed
  if (purpose === 'hit' || purpose === 'wound') return needed >= 4 && v >= needed
  if (purpose === 'charge' || purpose === 'battleShock') {
    const target = needed - mod
    return target > 7 && v + 3.5 >= target
  }
  return false
}
function miracleDieAnswer(pending: PendingDecision, options: Action[]): Action | null {
  if (pending.kind !== 'chooseOption' || pending.context.topic !== 'miracleDie') return null
  const data = pending.context.data as MiracleData
  const skip = options.find((o) => o.type === 'chooseOption' && o.optionId === 'skip') ?? null
  const pool = data.pool ?? []
  let best: Action | null = null
  let bestValue = 7
  for (const o of options) {
    if (o.type !== 'chooseOption' || !o.optionId.startsWith('use')) continue
    const v = pool[(o.dieIndexes ?? [])[0]]
    if (v !== undefined && v < bestValue && miracleWorthIt(data, v)) { best = o; bestValue = v }
  }
  return best ?? skip
}

// ---- formation deployment / arrival (shape generators: src/ai/formations.ts) ----
function formationRole(state: GameState, unitId: UnitId, n: number): FormationRole {
  const unit = state.units[unitId]
  if (n <= 1) return 'solo'
  if (unit.attachedLeaderId) return 'leaderBlock'
  const ranged = hasAnyRangedWeapon(state, unitId)
  const range = ranged ? bestRangedRangeOfUnit(state, unitId) : null
  if (!ranged || (range !== null && range <= 12)) return 'melee'
  return 'ranged'
}

function chooseFormationDeployment(state: GameState, player: PlayerId, pending: Extract<PendingDecision, { kind: 'deployUnit' }>, rng: Rng): DeployUnitAction | null {
  const arrival = state.phase !== 'setup' && state.phase !== 'deployment'
  const zone = pending.constraints.region ?? pending.context.zone
  if (zone.length < 3) return null
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const enemyBoard = boardModelsOf(state, other(player))
  let enemyC = { x: 0, z: 0 }
  if (enemyBoard.length > 0) enemyC = placementsCenter(enemyBoard.map((m) => ({ modelId: m.id, pos: m.pos })))
  else { try { enemyC = polyCentroid(deploymentZone(state, other(player))) } catch { /* sides unset */ } }
  const objs = Object.values(state.objectives).filter((o) => !o.removed)
  // candidate units: setup drops one unit at a time (an attached Leader rides with its bodyguard); an arrival is one group answer
  const groups: { unitId: UnitId; models: FormationModel[]; reserve: boolean }[] = []
  if (arrival) {
    const models = pending.context.unitIds.flatMap((id) => (state.units[id] ? unitModels(state, id) : []))
    groups.push({ unitId: pending.context.unitIds[0], models: models.map((m) => ({ id: m.id, base: m.base })), reserve: false })
  } else {
    for (const id of pending.context.unitIds) {
      const u = state.units[id]
      if (!u || u.bodyguardUnitId) continue
      const own = unitModels(state, id)
      const lead = u.attachedLeaderId && state.units[u.attachedLeaderId] ? unitModels(state, u.attachedLeaderId) : []
      groups.push({ unitId: id, models: [...own, ...lead].map((m) => ({ id: m.id, base: m.base })), reserve: pending.context.reservesAllowed.includes(id) })
    }
  }
  if (groups.length === 0) return null
  // a shallow zone (Combat Patrol: ~5" deep) runs out of room for big bases if small units go down first and sprawl:
  // while any big-based unit (> 3" across) is still undeployed, deploy only those
  if (!arrival && groups.length > 1 && Math.min(maxX - minX, maxZ - minZ) < 8) {
    const rad = (g: { models: FormationModel[] }): number => Math.max(...g.models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
    if (groups.some((g) => rad(g) >= 1.5)) for (let i = groups.length - 1; i >= 0; i--) if (rad(groups[i]) < 1.5) groups.splice(i, 1)
  }
  const myReserves = Object.values(state.units).filter((u) => u.player === player && u.location === 'reserves').length
  const xStep = 2.5, zStep = 1 // a Combat Patrol zone is only ~5" deep: fine in z so a 2-3 rank block can sit anywhere in it
  const occupied: Footprint[] = [...boardModelsOf(state, player), ...enemyBoard]
  type Cand = { action: DeployUnitAction; score: number }
  const cands: Cand[] = []
  for (const g of groups) {
    if (g.models.length === 0) continue
    const role = formationRole(state, g.unitId, g.models.length)
    const heavy = g.models.length === 1 || hasKeyword(state, g.unitId, 'VEHICLE') || hasKeyword(state, g.unitId, 'MONSTER')
    // heavy multi-model units use a block, but a shallow zone needs the one-rank line / zig-zag as well
    let shapes: FormationShape[] = heavy && g.models.length > 1 ? ['block', 'line'] : shapesForRole(role, g.models.length)
    const stats = modelStats(state, unitModels(state, g.unitId)[0])
    const rangeOf = hasAnyRangedWeapon(state, g.unitId) ? bestRangedRangeOfUnit(state, g.unitId) : null
    // only cheap (1 W, 5+ or worse save), short-ranged mobs are screening-line material
    if (g.models.length >= 8 && stats.W === 1 && stats.Sv >= 5 && (rangeOf === null || rangeOf <= 18) && !heavy) shapes = [...shapes, 'line']
    const meleeOnly = hasAnyMeleeWeapon(state, g.unitId) && !hasAnyRangedWeapon(state, g.unitId)
    let unitBest = -Infinity
    for (let z = minZ + 1; z <= maxZ - 1 + 1e-9; z += zStep) {
      for (let x = minX + 1; x <= maxX - 1 + 1e-9; x += xStep) {
        if (!pointInPolygon({ x, z }, zone)) continue
        const toEnemy = Math.atan2(enemyC.z - z, enemyC.x - x)
        const facings = [toEnemy]
        let nearObj: { x: number; z: number } | null = null, nd = Infinity
        for (const o of objs) { const d = Math.hypot(o.pos.x - x, o.pos.z - z); if (d < nd) { nd = d; nearObj = o.pos } }
        if (nearObj && nd > 3) {
          const fo = Math.atan2(nearObj.z - z, nearObj.x - x)
          if (Math.abs(Math.atan2(Math.sin(fo - toEnemy), Math.cos(fo - toEnemy))) > 0.35) facings.push(fo)
        }
        const dEnemy = Math.hypot(enemyC.x - x, enemyC.z - z)
        const inTerrain = Object.values(state.board.pieces).some((pc) => pointInPolygon({ x, z }, pc.footprint))
        for (const shape of shapes) {
          for (const facing of facings) {
            const placements = buildFormation(shape, g.models, { x, z }, facing)
            if (!placements) continue
            const feet = placements.map((p, i) => ({ pos: p.pos, facing, base: g.models[i].base }))
            if (!feet.every((f) => whollyWithinPolygon(f, zone) && whollyOnBoard(f, state.board) && !occupied.some((o) => basesOverlap(f, o)))) continue
            const action: DeployUnitAction = { type: 'deployUnit', player, decisionId: pending.id, unitId: g.unitId, placements }
            let score = scoreDeployUnit(state, player, action) + shapeRoleScore(shape === 'line' ? 'screen' : role, shape)
            if (role === 'ranged') { score += Math.min(dEnemy, 36) * 0.03; if (inTerrain) score += 0.8 }
            else if (role === 'melee' && !meleeOnly) score += Math.max(0, 36 - dEnemy) * 0.02
            if (arrival && role !== 'ranged') score += Math.max(0, 24 - dEnemy) * 0.05
            score += rng.next() * 0.6
            cands.push({ action, score })
            if (score > unitBest) unitBest = score
          }
        }
      }
    }
    // Deep Strike: at most one unit held back per player at setup, only when the placed options are unremarkable
    if (!arrival && g.reserve && myReserves === 0 && role !== 'solo' && unitBest > -Infinity && !hasKeyword(state, g.unitId, 'CHARACTER')) {
      cands.push({ action: { type: 'deployUnit', player, decisionId: pending.id, unitId: g.unitId, placements: [], toReserves: true }, score: unitBest - 1.5 + 2 * rng.next() * (role === 'melee' ? 1 : 0.5) })
    }
  }
  cands.sort((a, b) => b.score - a.score)
  for (const c of cands.slice(0, 80)) if (validate(state, c.action) === null) return c.action
  return null
}

export class UtilityDecider implements Decider {
  private rng: Rng

  constructor(private difficulty: Difficulty = 'normal', seed: string | Rng = 'ai-utility') {
    this.rng = typeof seed === 'string' ? createRng(seed) : seed
  }

  static fromSerialized(difficulty: Difficulty, serialized: string): UtilityDecider {
    return new UtilityDecider(difficulty, restoreRng(serialized))
  }

  async decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action> {
    const options = legal ?? legalActions(view.state, pending) ?? []
    if (options.length === 0 && pending.kind === 'deployUnit') {
      // never throw on deployment: try the AI formations, then hold a Deep Strike-capable unit in Reserves
      const formed = chooseFormationDeployment(view.state, view.player, pending, this.rng)
      if (formed) return formed
      for (const unitId of pending.context.reservesAllowed) {
        const a: DeployUnitAction = { type: 'deployUnit', player: view.player, decisionId: pending.id, unitId, placements: [], toReserves: true }
        if (validate(view.state, a) === null) return a
      }
    }
    if (options.length === 0) throw new Error(`UtilityDecider: no legal action for decision ${pending.id} (${pending.kind})`)
    if (pending.kind === 'deployUnit') {
      const formed = chooseFormationDeployment(view.state, view.player, pending, this.rng)
      if (formed) return formed
    }
    if (options.length === 1) return options[0]
    const state = view.state
    const miracle = miracleDieAnswer(pending, options)
    if (miracle) return miracle
    const offer = rerollOfferAnswer(state, pending, options)
    if (offer) return offer
    const scored = options.map((a) => ({ a, s: scoreAction(state, view.player, pending, a) }))
    scored.sort((x, y) => y.s - x.s)
    // CP spends are never a random pick from the top 3: a bad random stratagem wastes scarce CP
    const cpDecision = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll'
    if (this.difficulty === 'easy' && !cpDecision) {
      const top = scored.slice(0, Math.min(3, scored.length))
      const idx = Math.floor(this.rng.next() * top.length) % top.length
      return top[idx].a
    }
    return scored[0].a
  }

  serialize(): string { return this.rng.serialize() }
}

export function createUtilityDecider(difficulty: Difficulty, seed: string): Decider {
  return new UtilityDecider(difficulty, seed)
}
