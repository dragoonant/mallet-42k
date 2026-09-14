// Tier-1 heuristic AI (owner: src/ai). Implements the engine's Decider interface (00-arch §3) by scoring every
// legal action for the current decision with cheap heuristics (docs/spec/40-ai.md, simplified per the "playable
// fast" owner priority: no Monte Carlo, no role planner, no points data — see src/ai/expected.ts header for the
// specific simplifications). `easy` picks randomly among the top 3 scored actions; `normal` always takes the best.
import {
  DEFAULT_SERVICES, boardModelsOf, boardUnitsOf, deploymentZone, distance, legalActions, modelProfile, modelStats,
  unitModels, withinEngagementRange, withinObjectiveRange,
  type Action, type DeclareChargeAction, type DeclareMoveAction, type DeclareTargetsAction, type Decider,
  type DeployUnitAction, type GameState, type ModelPlacement, type ObjectiveId, type PendingDecision, type PlayerId,
  type PlayerView, type Polygon, type UnitId,
} from '../engine'
import type { ScoringRule } from '../data/types'
import { createRng, restoreRng, type Rng } from '../engine/rng'
import {
  bestMeleeWeapon, bestRangedRangeOfUnit, bestRangedWeapon, hasAnyMeleeWeapon, hasAnyRangedWeapon, sumExpectedAttacks,
  threatAt, unitMeleeDamage, unitRangedDamage, unitValue,
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

// Shared position scorer for moveUnit / chargeMove / pileIn / consolidate: objective pull, threat avoidance,
// charge/shoot readiness, and (for charge/consolidate) how many models end up fighting.
function scorePosition(state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[], bonusEngage: boolean): number {
  if (placements.length === 0) return 0
  const center = placementsCenter(placements)
  let score = objectivePull(state, player, center)
  score -= threatAt(state, player, center) * 2
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
  switch (action.moveType) {
    case 'stationary': {
      let s = 1.0
      if (ranged && heavy) s += 2.5
      if (onControlledValuableObjective) s += 1.5
      if (ranged && !melee && gap <= rangedRange) s += 1.5
      return s
    }
    case 'normal': {
      let s = 2.0
      if (melee && gap > stats.M + ENGAGEMENT_H && gap <= stats.M + 12) s += 1.0
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
  let neededMax = 0, payoff = 0
  for (const targetId of action.targetUnitIds) {
    const gap = minGapBetweenUnits(state, unitId, targetId)
    neededMax = Math.max(neededMax, Math.max(0, gap - ENGAGEMENT_H))
    const dmg = unitMeleeDamage(state, unitId, targetId, { charged: true })
    const ret = unitMeleeDamage(state, targetId, unitId, {})
    payoff += dmg * unitValue(state, targetId) * 0.02 - ret * unitValue(state, unitId) * 0.01
  }
  const p = chargeProb(Math.ceil(neededMax))
  return p * payoff - (1 - p) * 0.4
}

// Named stratagems this tier-1 AI actually models; everything else defaults to holding CP (spec §5: "hold CP by
// default; use one only when its modelled value beats a threshold").
function stratagemScore(state: GameState, player: PlayerId, pending: PendingDecision, id: string, cost: number): number {
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
  return -Infinity // unmodelled stratagem: hold CP
}

function scoreStratagemOrReaction(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (action.type === 'pass') return HOLD_CP_SCORE
  if (action.type !== 'useStratagem') return 0
  const strat = state.stratagems[action.stratagemId]
  const cost = strat?.cost ?? 1
  return stratagemScore(state, player, pending, action.stratagemId, cost)
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
