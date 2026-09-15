// Tier-1 heuristic AI (owner: src/ai). Implements the engine's Decider interface (00-arch §3) by scoring every
// legal action for the current decision with cheap heuristics (docs/spec/40-ai.md, simplified per the "playable
// fast" owner priority: no Monte Carlo, no role planner, no points data — see src/ai/expected.ts header for the
// specific simplifications). `easy` picks randomly among the top 3 scored actions; `normal` always takes the best.
import {
  DEFAULT_SERVICES, boardModelsOf, boardUnitsOf, deploymentZone, distance, hasKeyword, legalActions, modelProfile,
  modelStats, unitModels, withinEngagementRange, withinObjectiveRange,
  type Action, type DeclareChargeAction, type DeclareMoveAction, type DeclareTargetsAction, type Decider,
  type DeployUnitAction, type GameState, type ModelPlacement, type ObjectiveId, type PendingDecision, type PlayerId,
  type PlayerView, type Polygon, type UnitId, type UseStratagemAction,
} from '../engine'
import type { ScoringRule } from '../data/types'
import { createRng, restoreRng, type Rng } from '../engine/rng'
import {
  bestMeleeWeapon, bestRangedRangeOfUnit, bestRangedWeapon, expectedAttack, hasAnyMeleeWeapon, hasAnyRangedWeapon,
  sumExpectedAttacks, threatAt, unitMeleeDamage, unitRangedDamage, unitValue,
} from './expected'

export type Difficulty = 'easy' | 'normal'

const ENGAGEMENT_H = 1 // mirrors src/engine/geometry.ts ENGAGEMENT_H (not re-exported by name conflict-safe here)
const HOLD_CP_SCORE = 1 // baseline "do nothing" score for stratagem/reaction windows and command re-rolls

function other(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

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
function objectiveScoreWeight(state: GameState, player: PlayerId, objectiveId: ObjectiveId): number {
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
function nearestEnemyFromPoint(state: GameState, player: PlayerId, pos: { x: number; z: number }): { gap: number; unitId: UnitId } | null {
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
function nearestEnemyUnit(state: GameState, player: PlayerId, unitId: UnitId): { gap: number; unitId: UnitId } | null {
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

function minGapBetweenUnits(state: GameState, a: UnitId, b: UnitId): number {
  const as = unitModels(state, a), bs = unitModels(state, b)
  let gap = Infinity
  for (const x of as) for (const y of bs) gap = Math.min(gap, distance(x, y))
  return gap
}

function centerOfUnit(state: GameState, unitId: UnitId): { x: number; z: number } | null {
  const models = unitModels(state, unitId)
  if (models.length === 0) return null
  let x = 0, z = 0
  for (const m of models) { x += m.pos.x; z += m.pos.z }
  return { x: x / models.length, z: z / models.length }
}

// enemy units currently within Engagement Range of unitId (used to check whether a fight-phase stratagem is
// actually about to matter, e.g. Veteran Instincts / Epic Challenge)
function engagedEnemyUnits(state: GameState, player: PlayerId, unitId: UnitId): UnitId[] {
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
function chargeProb(needed: number): number {
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

function scoreDeployUnit(state: GameState, player: PlayerId, action: DeployUnitAction): number {
  if (action.toReserves) return 0.5
  const center = placementsCenter(action.placements)
  let score = objectivePull(state, player, center)
  score -= threatAt(state, player, center) * 2
  const zoneCentroid = polyCentroid(deploymentZone(state, other(player)))
  const meleeOnly = hasAnyMeleeWeapon(state, action.unitId) && !hasAnyRangedWeapon(state, action.unitId)
  if (meleeOnly) {
    const dToEnemy = Math.hypot(center.x - zoneCentroid.x, center.z - zoneCentroid.z)
    score += Math.max(0, 40 - dToEnemy) * 0.03
  }
  let crowd = 0
  for (const m of boardModelsOf(state, player)) {
    const d = Math.hypot(m.pos.x - center.x, m.pos.z - center.z)
    if (d < 6) crowd += 6 - d
  }
  score -= crowd * 0.1
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

// Named stratagems this tier-1 AI actually models; everything else defaults to holding CP (spec §5: "hold CP by
// default; use one only when its modelled value beats a threshold"). `action.targets` carries the concrete
// (unit/model) choice legalActions() already bound for this specific option, so branches read from there instead
// of re-deriving candidates — each scored option can name a different target.
function stratagemScore(state: GameState, player: PlayerId, pending: PendingDecision, action: UseStratagemAction, cost: number): number {
  const id = action.stratagemId
  const targets = action.targets ?? {}
  const cp = state.players[player].cp
  if (cp < cost) return -Infinity
  const trigger = pending.kind === 'reactionWindow' ? pending.context.enemyUnitId : pending.kind === 'stratagemWindow' ? pending.context.trigger.unitId : null
  const targetTrigger = pending.kind === 'stratagemWindow' ? pending.context.trigger.targetUnitId : null
  if (id.endsWith('fire-overwatch') && trigger) {
    let best = 0
    for (const u of boardUnitsOf(state, player)) best = Math.max(best, unitRangedDamage(state, u.id, trigger, { hitMod: -1 }))
    return best * unitValue(state, trigger) * 0.03 - cost * 1.5
  }
  if (id.endsWith('heroic-intervention') && trigger) {
    const bestUnit = boardUnitsOf(state, player).find((u) => hasAnyMeleeWeapon(state, u.id) && minGapBetweenUnits(state, u.id, trigger) <= 6 + 3)
    if (!bestUnit) return -Infinity
    return unitMeleeDamage(state, bestUnit.id, trigger, { charged: true }) * unitValue(state, trigger) * 0.02 - cost * 1.2
  }
  if (id.endsWith('counter-offensive') && trigger) {
    let best = 0
    for (const u of boardUnitsOf(state, player)) if (hasAnyMeleeWeapon(state, u.id)) best = Math.max(best, unitMeleeDamage(state, u.id, trigger, {}))
    return best * unitValue(state, trigger) * 0.025 - cost * 1.0
  }
  if ((id.endsWith('go-to-ground') || id.endsWith('smokescreen') || id.endsWith('gene-wrought-resilience')) && targetTrigger) {
    const mine = state.units[targetTrigger]
    if (mine?.player !== player) return -Infinity
    const totalW = unitModels(state, targetTrigger).reduce((s, m) => s + m.woundsRemaining, 0)
    const val = unitValue(state, targetTrigger)
    return val > 20 && totalW > 0 ? val * 0.02 - cost * 1.5 : -Infinity
  }
  // Tank Shock: mortal wounds = min(6, T dice at 5+); use when it meaningfully hurts what we just charged.
  if (id.endsWith('tank-shock')) {
    const enemyUnitId = targets.unitIds?.[1]
    const vehicleModelId = targets.modelIds?.[0]
    if (!enemyUnitId || !vehicleModelId) return -Infinity
    const model = state.models[vehicleModelId]
    if (!model) return -Infinity
    const expectedMortalWounds = Math.min(6, modelStats(state, model).T * (2 / 6))
    return expectedMortalWounds * unitValue(state, enemyUnitId) * 0.02 - cost
  }
  // Grenade: 6 dice at 4+ ~= 3 expected mortal wounds; worth more when that's likely to outright kill a model
  // (no CP unit currently has GRENADES, so this only ever fires if the roster data changes).
  if (id.endsWith('.grenade')) {
    const enemyUnitId = targets.unitIds?.[1] ?? targetTrigger
    if (!enemyUnitId) return -Infinity
    const expectedMortalWounds = 6 * (3 / 6)
    const models = unitModels(state, enemyUnitId)
    const weakestW = models.length > 0 ? Math.min(...models.map((m) => modelStats(state, m).W)) : 1
    const killsAModel = expectedMortalWounds >= weakestW
    return expectedMortalWounds * unitValue(state, enemyUnitId) * 0.02 * (killsAModel ? 1.5 : 0.8) - cost
  }
  // Veteran Instincts: reroll 1s normally, reroll any wound vs MONSTER/VEHICLE — the big reroll-all case is the
  // one worth spending CP on; a plain reroll-ones against rank-and-file is only worth it against a juicy target.
  if (id.endsWith('veteran-instincts')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const enemies = engagedEnemyUnits(state, player, unitId)
    let bestDmg = 0, bestEnemyId: UnitId | null = null, bestIsMonsterVehicle = false
    for (const e of enemies) {
      const dmg = unitMeleeDamage(state, unitId, e, {})
      if (dmg > bestDmg) { bestDmg = dmg; bestEnemyId = e; bestIsMonsterVehicle = hasKeyword(state, e, 'MONSTER') || hasKeyword(state, e, 'VEHICLE') }
    }
    if (!bestEnemyId) return -Infinity
    if (!bestIsMonsterVehicle && bestDmg < 4) return -Infinity // reroll-ones on a weak fight isn't worth 1 CP
    const bonusFrac = bestIsMonsterVehicle ? 0.5 : 0.15
    return bestDmg * bonusFrac * unitValue(state, bestEnemyId) * 0.02 - cost
  }
  // Epic Challenge: Precision lets our Character snipe the enemy's attached leader directly instead of whatever
  // model would normally be allocated to — only worth it when there's actually a leader there to snipe.
  if (id.endsWith('epic-challenge')) {
    const enemyUnitId = targets.unitIds?.[0]
    const modelId = targets.modelIds?.[0]
    if (!enemyUnitId || !modelId) return -Infinity
    const leaderId = state.units[enemyUnitId]?.attachedLeaderId
    if (!leaderId) return -Infinity
    const wid = bestMeleeWeapon(state, modelId)
    if (!wid) return -Infinity
    const dmg = expectedAttack(state, modelId, wid, leaderId, {}).damage
    if (dmg <= 0) return -Infinity
    return dmg * unitValue(state, leaderId) * 0.03 - cost
  }
  // Insane Bravery: oncePerBattle, so only worth burning on a battle-shock test that would actually hurt — a
  // unit sitting on an objective that scores, or a high-value unit we can't afford to see fall back/flee.
  if (id.endsWith('insane-bravery')) {
    const unitId = targets.unitIds?.[0] ?? trigger
    if (!unitId) return -Infinity
    const models = unitModels(state, unitId)
    if (models.length === 0) return -Infinity
    const onValuableObjective = Object.values(state.objectives).some((o) => !o.removed
      && objectiveScoreWeight(state, player, o.id) > 1 && models.some((m) => withinObjectiveRange(m, o)))
    const val = unitValue(state, unitId)
    if (!onValuableObjective && val < 15) return -Infinity
    return val * (onValuableObjective ? 0.06 : 0.02) - cost
  }
  // Rapid Ingress: bring a reserved unit on now instead of next Reinforcements — worth it when a valuable
  // objective is still uncontested and we can put a body on/near it immediately.
  if (id.endsWith('rapid-ingress')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const hasValuableUnclaimed = Object.values(state.objectives).some((o) => !o.removed
      && objectiveScoreWeight(state, player, o.id) > 1 && DEFAULT_SERVICES.objectives.controller(state, o.id) !== player)
    if (!hasValuableUnclaimed) return -Infinity
    return unitValue(state, unitId) * 0.03 - cost
  }
  // Duty and Honour: keeps a held objective "ours" even if the unit later moves off/dies — worth it only for an
  // objective that actually scores and that the enemy could plausibly contest soon.
  if (id.endsWith('duty-and-honour')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const models = unitModels(state, unitId)
    let bestWeight = 0, threatened = false
    for (const o of Object.values(state.objectives)) {
      if (o.removed || DEFAULT_SERVICES.objectives.controller(state, o.id) !== player) continue
      if (!models.some((m) => withinObjectiveRange(m, o))) continue
      const weight = objectiveScoreWeight(state, player, o.id)
      if (weight <= bestWeight) continue
      const enemy = nearestEnemyFromPoint(state, player, o.pos)
      bestWeight = weight
      threatened = !!enemy && enemy.gap <= 16 // roughly a turn's move+charge away
    }
    if (bestWeight <= 1 || !threatened) return -Infinity
    return bestWeight * 2 - cost
  }
  // Get Stuck In: extends this unit's pile-in/consolidate to 6" — worth it when that extra reach can drag it
  // into a second fight or onto a valuable objective it couldn't reach with the normal 3".
  if (id.endsWith('get-stuck-in')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyMeleeWeapon(state, unitId)) return -Infinity
    const center = centerOfUnit(state, unitId)
    if (!center) return -Infinity
    let extraReach = false
    for (const u of boardUnitsOf(state, other(player))) {
      const gap = minGapBetweenUnits(state, unitId, u.id)
      if (gap > ENGAGEMENT_H && gap <= 6) extraReach = true
    }
    for (const o of Object.values(state.objectives)) {
      if (o.removed || objectiveScoreWeight(state, player, o.id) <= 1) continue
      const d = Math.hypot(o.pos.x - center.x, o.pos.z - center.z)
      if (d > 3 && d <= 6) extraReach = true
    }
    if (!extraReach) return -Infinity
    return unitValue(state, unitId) * 0.02 - cost
  }
  // Brutal but Kunnin': only unlocks anything if the unit actually Fell Back this turn — otherwise it can
  // already declare a charge normally and the stratagem does nothing.
  if (id.endsWith('brutal-but-kunnin')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const unit = state.units[unitId]
    if (!unit || unit.turn.moveType !== 'fallBack') return -Infinity
    const enemy = nearestEnemyUnit(state, player, unitId)
    if (!enemy) return -Infinity
    const myModels = unitModels(state, unitId)
    if (myModels.length === 0) return -Infinity
    const stats = modelStats(state, myModels[0])
    const needed = Math.max(0, Math.ceil(enemy.gap - ENGAGEMENT_H))
    if (needed > stats.M + 12) return -Infinity
    const p = chargeProb(needed)
    const dmg = unitMeleeDamage(state, unitId, enemy.unitId, { charged: true })
    return p * dmg * unitValue(state, enemy.unitId) * 0.02 - cost
  }
  // Krump da Gitz!: free D6" surge toward whoever just shot us — only worth triggering when it sets up a
  // realistic charge next turn (otherwise it just drags the unit further from where it wants to be).
  if (id.endsWith('krump-da-gitz')) {
    const unitId = targets.unitIds?.[0] ?? targetTrigger
    if (!unitId || !hasAnyMeleeWeapon(state, unitId)) return -Infinity
    const enemy = nearestEnemyUnit(state, player, unitId)
    if (!enemy) return -Infinity
    const myModels = unitModels(state, unitId)
    if (myModels.length === 0) return -Infinity
    const stats = modelStats(state, myModels[0])
    const afterGap = Math.max(0, enemy.gap - 3.5) // average D6
    const needed = Math.max(0, Math.ceil(afterGap - ENGAGEMENT_H))
    if (needed > stats.M + 3.5) return -Infinity // still not a plausible charge next turn
    return unitValue(state, enemy.unitId) * 0.015 - cost
  }
  return -Infinity // unmodelled stratagem: hold CP
}

function scoreStratagemOrReaction(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (action.type === 'pass') return HOLD_CP_SCORE
  if (action.type !== 'useStratagem') return 0
  const strat = state.stratagems[action.stratagemId]
  const cost = strat?.cost ?? 1
  return stratagemScore(state, player, pending, action, cost)
}

function scoreCommandReroll(pending: PendingDecision, action: Action): number {
  if (action.type === 'pass') return HOLD_CP_SCORE
  if (action.type !== 'commandReroll' || pending.kind !== 'commandReroll') return 0
  const sum = pending.context.roll.final.reduce((a, b) => a + b, 0)
  if (pending.context.roll.purpose === 'charge' && sum < 8) return 3
  if (pending.context.roll.purpose === 'advance' && sum <= 2) return 1.5
  return 0.2
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
  if (topic === 'saveType' && action.optionId === 'invuln') score += 0.1
  const label = (option?.label ?? '').toLowerCase()
  if (/(skip|none|decline)/.test(label)) score -= 1
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
    case 'commandReroll': return scoreCommandReroll(pending, action)
    case 'confirm': return 0
    default: return 0
  }
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
    if (options.length === 0) throw new Error(`UtilityDecider: no legal action for decision ${pending.id} (${pending.kind})`)
    if (options.length === 1) return options[0]
    const state = view.state
    const scored = options.map((a) => ({ a, s: scoreAction(state, view.player, pending, a) }))
    scored.sort((x, y) => y.s - x.s)
    if (this.difficulty === 'easy') {
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
