// Stratagem and Command Re-roll scoring for the tier-1 utility AI (docs/spec/40-ai.md §5, "Stratagems" row).
// Every modelled option returns a *gain* (same rough value scale as the rest of utility.ts); the public scorers turn that
// into `HOLD_CP_SCORE + gain - cpThreshold(...)`, so a stratagem only beats passing when its modelled gain pays for the CP it
// burns. Anything not modelled holds CP (-Infinity).
import {
  DEFAULT_SERVICES, boardUnitsOf, hasKeyword, modelKeywordsOf, modelStats, unitModels, withinObjectiveRange,
  type Action, type GameState, type PendingDecision, type PlayerId, type UnitId, type UseStratagemAction,
} from '../engine'
import { diceExprMean } from '../engine/dice'
import { effectiveCost } from '../engine/stratagems'
import {
  bestMeleeWeapon, bestRangedRangeOfUnit, bestRangedWeapon, expectedAttack, hasAnyMeleeWeapon, hasAnyRangedWeapon, unitMeleeDamage, unitRangedDamage, unitValue,
  type AttackOptions,
} from './expected'
import {
  centerOfUnit, chargeProb, engagedEnemyUnits, minGapBetweenUnits, nearestEnemyFromPoint, nearestEnemyUnit,
  objectiveScoreWeight, other,
} from './utility'

const ENGAGEMENT_H = 1 // mirrors src/engine/geometry.ts ENGAGEMENT_H
export const HOLD_CP_SCORE = 1 // baseline "do nothing" score for stratagem/reaction windows and command re-rolls
const BATTLE_ROUNDS = 5 // Combat Patrol length
const AVG_TURN_VALUE = 3 // typical gain of a good stratagem play on this file's scale
const DEFENCE_SCALE = 0.18 // fraction of a unit's value at risk -> score, for defensive stratagems and save/hit/wound re-rolls
const ESTIMATED_MODEL_VALUE = 8 // per-model value when a destroyed unit has no models to measure

// Spec threshold: 0.6·avgTurnValue / cp · (1 + 0.15·roundsLeft), per CP of cost. Few CP and many rounds left means a
// high bar (save CP for a big reactive play); plenty of CP, or the final round, means spend freely.
export function cpThreshold(state: GameState, player: PlayerId, cost: number, avgTurnValue = AVG_TURN_VALUE): number {
  const cp = Math.max(1, state.players[player].cp)
  const roundsLeft = Math.max(0, BATTLE_ROUNDS - state.round)
  const perCp = (0.6 * avgTurnValue / cp) * (1 + 0.15 * roundsLeft) * (roundsLeft === 0 ? 0.5 : 1)
  return Math.max(0.25, perCp) * cost
}

// P(2D6 >= n) when only ONE die is re-rolled and the other die stays
function pOneDieReaches(kept: number, needed: number): number {
  const need = needed - kept
  if (need <= 1) return 1
  if (need > 6) return 0
  return (7 - need) / 6
}

function totalWounds(state: GameState, unitId: UnitId): number {
  return unitModels(state, unitId).reduce((s, m) => s + m.woundsRemaining, 0)
}

function mineOf(state: GameState, player: PlayerId, ids: UnitId[] | undefined): UnitId | undefined {
  return (ids ?? []).find((id) => state.units[id]?.player === player)
}

// does `mineId` already have the Benefit of Cover against `attackerId`'s ranged fire?
function alreadyInCover(state: GameState, mineId: UnitId, attackerId: UnitId): boolean {
  const defender = unitModels(state, mineId)[0]
  const shooter = unitModels(state, attackerId).find((m) => bestRangedWeapon(state, m.id))
  const best = shooter ? bestRangedWeapon(state, shooter.id) : null
  const weapon = best ? state.weapons[best.weaponId] : null
  if (!defender || !weapon) return false
  try { return DEFAULT_SERVICES.los.benefitOfCover(state, defender.id, attackerId, weapon) } catch { return false }
}

function incomingDamage(state: GameState, attackerId: UnitId, mineId: UnitId, melee: boolean, opts: AttackOptions): number {
  const raw = melee ? unitMeleeDamage(state, attackerId, mineId, opts) : unitRangedDamage(state, attackerId, mineId, opts)
  return Math.min(raw, totalWounds(state, mineId))
}

// value of the damage a defensive effect saves: (wounds saved / wounds the unit has) × unit value
function savedValue(state: GameState, mineId: UnitId, without: number, withIt: number): number {
  const w = Math.max(1, totalWounds(state, mineId))
  return Math.max(0, without - withIt) / w * unitValue(state, mineId) * DEFENCE_SCALE
}

// retaliation value of a "fights/shoots back as it dies" effect (A Martyr's Death, Daemonic Fervour)
function dyingStrikeValue(state: GameState, mineId: UnitId, attackerId: UnitId, melee: boolean, pStrike: number): number {
  const killed = Math.min(1, incomingDamage(state, attackerId, mineId, melee, {}) / Math.max(1, totalWounds(state, mineId)))
  const ourDmg = melee ? unitMeleeDamage(state, mineId, attackerId, {}) : unitRangedDamage(state, mineId, attackerId, {})
  return killed * pStrike * ourDmg * unitValue(state, attackerId) * 0.02
}

// the defensive stratagems: gain = expected incoming damage (value-weighted) with and without the effect
function defensiveGain(state: GameState, player: PlayerId, pending: PendingDecision, id: string, mineId: UnitId): number {
  if (pending.kind !== 'stratagemWindow') return -Infinity
  const attackerId = pending.context.trigger.unitId
  if (!attackerId || state.units[attackerId]?.player === player) return -Infinity
  const melee = state.phase === 'fight'
  const base: AttackOptions = {}
  if (!melee && alreadyInCover(state, mineId, attackerId)) base.cover = true
  const without = incomingDamage(state, attackerId, mineId, melee, base)
  if (without <= 0) return -Infinity
  let withIt: number
  if (id.endsWith('go-to-ground')) {
    if (melee) return -Infinity
    withIt = incomingDamage(state, attackerId, mineId, false, { ...base, cover: true, invuln: 6 })
  } else if (id.endsWith('smokescreen')) {
    if (melee) return -Infinity
    withIt = incomingDamage(state, attackerId, mineId, false, { ...base, cover: true, hitMod: -1 })
  } else if (id.endsWith('gene-wrought-resilience') || id.endsWith('tough-as-squig-hide')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, woundModHighS: -1 })
  } else if (id.endsWith('holy-radiance')) {
    if (melee) return -Infinity
    withIt = incomingDamage(state, attackerId, mineId, false, { ...base, hitMod: -1, fnp: 5 })
  } else if (id.endsWith('hyper-reactive') || id.endsWith('lurking-killers') || id.endsWith('quicksilver-reactions') || id.endsWith('whip-fast-reactions') || id.endsWith('controlled-ferocity')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, hitMod: -1 })
  } else if (id.endsWith('lives-before-territory') || id.endsWith('mutant-cunning') || id.endsWith('mj-relic-munitions')) {
    if (melee) return -Infinity
    withIt = incomingDamage(state, attackerId, mineId, false, { ...base, cover: true })
  } else if (id.endsWith('skeinwrought-physiology')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, svMod: -1 })
  } else if (id.endsWith('evaluation-of-mettle')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, fnp: 5 })
  } else if (id.endsWith('shield-of-zeal')) {
    // Black Templars: only attacking models within 6" are affected, so a shooter further away gains nothing
    if (!melee && minGapBetweenUnits(state, attackerId, mineId) > 6) return -Infinity
    const models = unitModels(state, mineId)
    const neophytes = models.filter((m) => modelKeywordsOf(state, m.id).includes('PRIMARIS NEOPHYTE')).length
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, invuln: neophytes * 2 > models.length ? 5 : 4 }) // 4+ invulnerable, 5+ for Neophytes
  } else if (id.endsWith('reactive-field-shroud')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, invuln: 4 })
  } else if (id.endsWith('mercurial-resilience')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, invuln: 5 })
  } else if (id.endsWith('disgustingly-resilient')) {
    // Death Guard: every attack allocated to the unit loses 1 Damage (minimum 1); worth little against D1 weapons
    if (melee) return -Infinity
    const shooter = unitModels(state, attackerId).map((m) => bestRangedWeapon(state, m.id)).find((w) => !!w)
    const avgD = shooter && state.weapons[shooter.weaponId] ? diceExprMean(state.weapons[shooter.weaponId].D) : 1
    if (avgD <= 1) return -Infinity
    withIt = without * ((avgD - 1) / avgD)
  } else if (id.endsWith('a-martyrs-death') || id.endsWith('a-warriors-death')) {
    return dyingStrikeValue(state, mineId, attackerId, melee, 0.5)
  } else if (id.endsWith('manifest-hate')) {
    withIt = incomingDamage(state, attackerId, mineId, melee, { ...base, invuln: 4 }) // Chaos Daemons: 4+ invulnerable save for the phase
  } else if (id.endsWith('daemonic-fervour') || id.endsWith('blood-maddened-banishment')) {
    if (!melee) return -Infinity
    return dyingStrikeValue(state, mineId, attackerId, true, 0.5)
  } else if (id.endsWith('vb-unyielding')) {
    // Dark Angels (The Vengeful Brethren): the same last stand on a 4+, a 3+ for Bladeguard; a lone model gains little
    const guard = hasKeyword(state, mineId, 'BLADEGUARD VETERAN SQUAD')
    if (!melee || (unitModels(state, mineId).length < 2 && !guard)) return -Infinity
    return dyingStrikeValue(state, mineId, attackerId, true, guard ? 0.67 : 0.5)
  } else return -Infinity
  const g = savedValue(state, mineId, without, withIt)
  return g > 0 ? g : -Infinity
}

const DEFENSIVE = ['skeinwrought-physiology', 'go-to-ground', 'smokescreen', 'gene-wrought-resilience', 'tough-as-squig-hide', 'holy-radiance', 'hyper-reactive',
  'mercurial-resilience', 'reactive-field-shroud', 'a-martyrs-death', 'a-warriors-death', 'daemonic-fervour', 'blood-maddened-banishment', 'vb-unyielding', 'manifest-hate', 'lurking-killers', 'lives-before-territory', 'quicksilver-reactions', 'whip-fast-reactions', 'evaluation-of-mettle', 'disgustingly-resilient', 'mutant-cunning', 'mj-relic-munitions', 'shield-of-zeal', 'controlled-ferocity']

// Fire Overwatch: hits only on an unmodified 6, the bound unit only (picked within 24"), each weapon within its own range, with line of sight.
function overwatchGain(state: GameState, player: PlayerId, action: UseStratagemAction, enemyId: UnitId): number {
  const shooterId = mineOf(state, player, action.targets?.unitIds)
  if (!shooterId) return -Infinity
  let dmg = 0
  for (const m of unitModels(state, shooterId)) {
    const best = bestRangedWeapon(state, m.id)
    if (!best) continue
    const inRange = unitModels(state, enemyId).some((e) => {
      const d = Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z) - e.base.radius - m.base.radius
      return d <= best.range
    })
    if (!inRange) continue
    if (!DEFAULT_SERVICES.los.unitVisible(state, m.id, enemyId)) continue
    dmg += expectedAttack(state, m.id, best.weaponId, enemyId, { hitOn6: true }).damage
  }
  if (dmg <= 0) return -Infinity
  const w = Math.max(1, totalWounds(state, enemyId))
  return Math.min(1, dmg / w) * unitValue(state, enemyId) * 0.1
}

function heroicGain(state: GameState, player: PlayerId, action: UseStratagemAction, enemyId: UnitId): number {
  const mineId = mineOf(state, player, action.targets?.unitIds)
  if (!mineId || !hasAnyMeleeWeapon(state, mineId)) return -Infinity
  const needed = Math.max(0, Math.ceil(minGapBetweenUnits(state, mineId, enemyId) - ENGAGEMENT_H))
  const p = chargeProb(needed)
  if (p <= 0) return -Infinity
  const dmg = unitMeleeDamage(state, mineId, enemyId, { charged: true })
  const ret = unitMeleeDamage(state, enemyId, mineId, {})
  return p * Math.max(0, dmg * unitValue(state, enemyId) * 0.02 - ret * unitValue(state, mineId) * 0.01)
}

function stratagemGain(state: GameState, player: PlayerId, pending: PendingDecision, action: UseStratagemAction, cost: number): number {
  const id = action.stratagemId
  const targets = action.targets ?? {}
  const cp = state.players[player].cp
  if (cp < cost) return -Infinity
  const trigger = pending.kind === 'reactionWindow' ? pending.context.enemyUnitId : pending.kind === 'stratagemWindow' ? pending.context.trigger.unitId : null
  const targetTrigger = pending.kind === 'stratagemWindow' ? pending.context.trigger.targetUnitId : null
  const roundsLeft = Math.max(0, BATTLE_ROUNDS - state.round)
  if (id.endsWith('fire-overwatch') && trigger) return overwatchGain(state, player, action, trigger)
  if (id.endsWith('heroic-intervention') && trigger) return heroicGain(state, player, action, trigger)
  // T'au Laser-Marked Targets: a free overwatch-style volley at the charger plus -2 to its Charge roll
  if (id.endsWith('laser-marked-targets') && trigger) {
    const g = overwatchGain(state, player, action, trigger)
    return Number.isFinite(g) ? g + unitValue(state, trigger) * 0.02 + 0.5 : 0.5
  }
  // T'au Defensive Fusillade: lets an engaged unit that has not shot fire its ranged weapons (as Pistols) into the units holding it
  if (id.endsWith('defensive-fusillade')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of engagedEnemyUnits(state, player, unitId)) best = Math.max(best, unitRangedDamage(state, unitId, e, {}) * unitValue(state, e) * 0.03)
    return best > 0 ? best : -Infinity
  }
  if (id.endsWith('counter-offensive') && trigger) {
    const bound = mineOf(state, player, targets.unitIds)
    const candidates = bound ? [bound] : boardUnitsOf(state, player).map((u) => u.id)
    let best = 0
    for (const u of candidates) if (hasAnyMeleeWeapon(state, u)) best = Math.max(best, unitMeleeDamage(state, u, trigger, {}))
    return best * unitValue(state, trigger) * 0.025
  }
  // The Penitent Host stratagems (ade.s.pen.*): Ascetic Discipline is a 4+/5+ invulnerable save in either player's phase,
  // A Martyr's Death is an own-Shooting Lethal Hits buff, Holy Radiance a Fight-phase last stand with no roll.
  if (id === 'ade.s.pen.ascetic-discipline' || id === 'ade.s.pen.holy-radiance') {
    const unitId = mineOf(state, player, targets.unitIds) ?? targetTrigger
    if (!unitId || state.units[unitId]?.player !== player || pending.kind !== 'stratagemWindow') return -Infinity
    const attackerId = pending.context.trigger.unitId
    if (!attackerId || state.units[attackerId]?.player === player) return -Infinity
    const melee = state.phase === 'fight'
    if (id.endsWith('holy-radiance')) return melee ? dyingStrikeValue(state, unitId, attackerId, true, 0.9) : -Infinity
    const strong = hasKeyword(state, unitId, 'BATTLE SISTERS SQUAD') || hasKeyword(state, unitId, 'SERAPHIM SQUAD')
    const without = incomingDamage(state, attackerId, unitId, melee, {})
    if (without <= 0) return -Infinity
    const g = savedValue(state, unitId, without, incomingDamage(state, attackerId, unitId, melee, { invuln: strong ? 4 : 5 }))
    return g > 0 ? g : -Infinity
  }
  if (id === 'ade.s.pen.a-martyrs-death') {
    const unitId = targets.unitIds?.[0]
    if (!unitId || state.phase !== 'shooting' || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    const enemy = nearestEnemyUnit(state, player, unitId)
    if (!enemy) return -Infinity
    return unitRangedDamage(state, unitId, enemy.unitId, {}) * 0.15 * unitValue(state, enemy.unitId) * 0.03
  }
  // Deathwatch Veteran Instincts: Feel No Pain 5+ (4+ for GRAVIS) on a targeted ADEPTUS ASTARTES unit until the end of the phase.
  // It must come before the generic `veteran-instincts` branch below, which models the Space Marines melee re-roll stratagem.
  if (id === 'dw.s.veteran-instincts') {
    const unitId = mineOf(state, player, targets.unitIds) ?? targetTrigger
    if (!unitId || state.units[unitId]?.player !== player || pending.kind !== 'stratagemWindow') return -Infinity
    const attackerId = pending.context.trigger.unitId
    if (!attackerId || state.units[attackerId]?.player === player) return -Infinity
    const melee = state.phase === 'fight'
    const base: AttackOptions = !melee && alreadyInCover(state, unitId, attackerId) ? { cover: true } : {}
    const without = incomingDamage(state, attackerId, unitId, melee, base)
    if (without <= 0) return -Infinity
    const g = savedValue(state, unitId, without, incomingDamage(state, attackerId, unitId, melee, { ...base, fnp: hasKeyword(state, unitId, 'GRAVIS') ? 4 : 5 }))
    return g > 0 ? g : -Infinity
  }
  // Deathwatch Special-Issue Ammunition: set A (Anti-Monster/Vehicle 5+, Melta 2) against big targets, set B (Assault, Ignores Cover,
  // Sustained Hits 2) otherwise; worth a fifth (a third against MONSTER / VEHICLE) of the unit's best volley that it can reach.
  if (id === 'dw.s.special-issue-ammunition') {
    const unitId = targets.unitIds?.[0]
    if (!unitId || state.phase !== 'shooting' || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    const range = bestRangedRangeOfUnit(state, unitId) ?? 0
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) {
      if (minGapBetweenUnits(state, unitId, e.id) > range) continue
      const big = hasKeyword(state, e.id, 'MONSTER') || hasKeyword(state, e.id, 'VEHICLE')
      best = Math.max(best, unitRangedDamage(state, unitId, e.id, {}) * (big ? 0.33 : 0.2) * unitValue(state, e.id) * 0.03)
    }
    return best > 0.25 ? best : -Infinity
  }
  // Deathwatch Teleportarium (end of the opponent's Fight phase, once per battle): the unit leaves and must come back in the next own
  // Movement phase anywhere 3"+ from the enemy. Worth it for a unit that is not holding a marker while a scoring marker we do not hold
  // lies beyond a normal move; never when the battle ends before the next Movement phase (round 5, we move first).
  if (id === 'dw.s.deathwatch-teleportarium') {
    const unitId = targets.unitIds?.[0]
    const models = unitId ? unitModels(state, unitId) : []
    if (!unitId || models.length === 0) return -Infinity
    if (state.round >= BATTLE_ROUNDS && state.firstPlayer === player) return -Infinity
    const here = centerOfUnit(state, unitId)
    if (!here) return -Infinity
    let best = 0
    for (const o of Object.values(state.objectives)) {
      if (o.removed) continue
      const weight = objectiveScoreWeight(state, player, o.id)
      if (weight <= 1) continue
      const held = DEFAULT_SERVICES.objectives.controller(state, o.id) === player
      if (held && models.some((m) => withinObjectiveRange(m, o))) return -Infinity // do not abandon a marker the unit is holding
      if (held) continue
      best = Math.max(best, Math.hypot(o.pos.x - here.x, o.pos.z - here.z) > 12 ? weight * 1.1 : weight * 0.15)
    }
    return best > 0.9 ? best : -Infinity
  }
  if (DEFENSIVE.some((d) => id.endsWith(d))) {
    const unitId = mineOf(state, player, targets.unitIds) ?? targetTrigger
    if (!unitId || state.units[unitId]?.player !== player) return -Infinity
    return defensiveGain(state, player, pending, id, unitId)
  }
  // Necron Disruption Fields: +1 Strength on the unit's melee weapons for its fight.
  if (id.endsWith('disruption-fields')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    let best = 0
    for (const e of engagedEnemyUnits(state, player, unitId)) {
      const d0 = unitMeleeDamage(state, unitId, e, {}), d1 = unitMeleeDamage(state, unitId, e, { strMod: 1 })
      best = Math.max(best, (d1 - d0) * unitValue(state, e) * 0.04)
    }
    return best > 0 ? best : -Infinity
  }
  // Necron Will of the Overlord: +1 OC for a unit on a scoring objective that is contested or about to be. Custodes Inescapable
  // Vengeance (Command phase, lasts through the opponent's turn) is the same play, also for a unit within a move (6") of such an objective.
  if (id.endsWith('will-of-the-overlord') || id.endsWith('inescapable-vengeance') || id.endsWith('mj-unyielding')) {
    const slack = id.endsWith('inescapable-vengeance') || id.endsWith('mj-unyielding') ? 6 : 0
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const models = unitModels(state, unitId)
    if (models.length === 0) return -Infinity
    const oc = models.reduce((s, m) => s + modelStats(state, m).OC, 0)
    let best = 0
    for (const o of Object.values(state.objectives)) {
      if (o.removed || !models.some((m) => withinObjectiveRange(m, o, 0, 3 + slack))) continue
      const weight = objectiveScoreWeight(state, player, o.id)
      if (weight <= 1) continue
      const enemy = nearestEnemyFromPoint(state, player, o.pos)
      if (!enemy || enemy.gap > 18) continue // nobody close enough to contest it next turn
      const controller = DEFAULT_SERVICES.objectives.controller(state, o.id)
      let enemyOc = 0
      for (const u of boardUnitsOf(state, other(player))) {
        if (minGapBetweenUnits(state, unitId, u.id) <= 24) enemyOc += unitModels(state, u.id).reduce((a, m) => a + modelStats(state, m).OC, 0)
      }
      // +1 OC per model matters when the margin is slim
      const swing = Math.abs(oc - enemyOc) <= models.length + 1 ? 1 : 0.35
      best = Math.max(best, weight * swing * (controller === player ? 1.2 : 1.6))
    }
    return best > 0 ? best : -Infinity
  }
  // Chaos Space Marines Vindictive Strategy: re-roll hit 1s (and wound 1s on a half-strength target) for a unit about to act.
  if (id.endsWith('vindictive-strategy')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const melee = state.phase === 'fight'
    const pool = melee ? engagedEnemyUnits(state, player, unitId) : boardUnitsOf(state, other(player)).map((u) => u.id)
    let best = 0
    for (const e of pool) {
      const eu = state.units[e]
      if (!eu || eu.models.length >= eu.startingStrength) continue // needs a below-Starting-Strength target
      const half = eu.models.length * 2 < eu.startingStrength
      const dmg = melee ? unitMeleeDamage(state, unitId, e, {}) : unitRangedDamage(state, unitId, e, {})
      best = Math.max(best, dmg * (half ? 0.28 : 0.17) * unitValue(state, e) * 0.03)
    }
    return best > 0.2 ? best : -Infinity
  }
  // Chaos Space Marines Violent Unbinding: reaction to our Master of Possession dying; ~1.9 expected mortal wounds on the attacker.
  if (id.endsWith('violent-unbinding')) {
    const attacker = trigger ?? targetTrigger
    if (!attacker || state.units[attacker]?.player === player) return -Infinity
    const eu = state.units[attacker]
    if (!eu || eu.location !== 'board') return -Infinity
    const mortal = (5 / 6) * ((4 / 6) * 2 + (1 / 6) * 3) + (1 / 6) * 3
    return Math.min(1, mortal / Math.max(1, totalWounds(state, attacker))) * unitValue(state, attacker) * 0.2
  }
  // Tyranid Teeming Broods: bring back up to D6 models, or re-spawn a destroyed Termagants brood (it must be able to arrive by round 3).
  if (id.endsWith('teeming-broods')) {
    const unitId = targets.unitIds?.[0]
    const unit = unitId ? state.units[unitId] : undefined
    if (!unit) return -Infinity
    if (unit.location === 'destroyed') return state.round <= 2 ? unit.startingStrength * ESTIMATED_MODEL_VALUE * 0.04 : -Infinity
    const missing = unit.startingStrength - unit.models.length
    if (missing < 2 || unit.models.length === 0) return -Infinity
    const perModel = unitValue(state, unit.id) / unit.models.length
    return Math.min(missing, 3.5) * perModel * 0.05
  }
  // Astra Militarum Send in the Next Wave: a destroyed Cadian squad returns at full strength; worth it while there is time to matter.
  if (id.endsWith('send-in-the-next-wave')) {
    const unit = targets.unitIds?.[0] ? state.units[targets.unitIds[0]] : undefined
    if (!unit) return -Infinity
    if (roundsLeft < 1) return -Infinity
    return unit.startingStrength * ESTIMATED_MODEL_VALUE * 0.04 * Math.min(1, 0.4 + roundsLeft * 0.2)
  }
  // Adeptus Mechanicus Acceptable Risk Ratio: AP -1 on a not-yet-shot unit's ranged weapons, paid for with Hazardous tests (about 1/6 of
  // the shooting models fall to a 1), so it is only worth a unit with a strong volley.
  if (id.endsWith('acceptable-risk-ratio')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) best = Math.max(best, unitRangedDamage(state, unitId, e.id, {}) * 0.2 * unitValue(state, e.id) * 0.03)
    return best > 0.3 ? best : -Infinity
  }
  // T'au Fight by the Code / Adeptus Mechanicus Optimised Efficiency: a unit that Fell Back may still shoot (and charge); worth its best volley at any enemy it can reach.
  if (id.endsWith('fight-by-the-code') || id.endsWith('optimised-efficiency') || id.endsWith('retrogradial-targeting') || id.endsWith('mj-march-of-vengeance')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || state.units[unitId]?.turn.moveType !== 'fallBack' || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) best = Math.max(best, unitRangedDamage(state, unitId, e.id, {}) * unitValue(state, e.id) * 0.03)
    return best > 0.2 ? best : -Infinity
  }
  // T'au Rampart of Fire: AP -1 on a not-yet-shot unit's attacks at enemies within 10"; compare the unit's output with one more AP step.
  if (id.endsWith('rampart-of-fire')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) {
      if (minGapBetweenUnits(state, unitId, e.id) > 10) continue
      best = Math.max(best, unitRangedDamage(state, unitId, e.id, {}) * 0.25 * unitValue(state, e.id) * 0.03)
    }
    return best > 0.2 ? best : -Infinity
  }
  // Insane Bravery: oncePerBattle, so only worth burning on a battle-shock test that would actually hurt (the unit would
  // likely fail it) — a unit on a scoring objective, or a high-value unit we can't afford to see fall back/flee.
  if (id.endsWith('insane-bravery')) {
    const unitId = targets.unitIds?.[0] ?? trigger
    if (!unitId) return -Infinity
    const models = unitModels(state, unitId)
    if (models.length === 0) return -Infinity
    const ld = modelStats(state, models[0]).Ld
    const pFail = 1 - chargeProb(ld) // 2D6 below Leadership
    if (pFail < 0.1) return -Infinity
    const onValuableObjective = Object.values(state.objectives).some((o) => !o.removed
      && objectiveScoreWeight(state, player, o.id) > 1 && models.some((m) => withinObjectiveRange(m, o)))
    const val = unitValue(state, unitId)
    if (!onValuableObjective && val < 15) return -Infinity
    return pFail * val * (onValuableObjective ? 0.06 : 0.02) - 0.5 // once per battle: keep a premium on the single use
  }
  // Voracious Assault: re-roll hits against the closest eligible target for one of our not-yet-activated units.
  if (id.endsWith('voracious-assault') || id.endsWith('hate-fuelled-strength')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const enemy = nearestEnemyUnit(state, player, unitId)
    if (!enemy) return -Infinity
    const melee = state.phase === 'fight'
    if (!(melee ? hasAnyMeleeWeapon(state, unitId) : hasAnyRangedWeapon(state, unitId))) return -Infinity
    if (melee && enemy.gap > ENGAGEMENT_H) return -Infinity
    const dmg = melee ? unitMeleeDamage(state, unitId, enemy.unitId, {}) : unitRangedDamage(state, unitId, enemy.unitId, {})
    return dmg * 0.4 * unitValue(state, enemy.unitId) * 0.03
  }
  // Drukhari Many Cuts: Sustained Hits 1 for a not-yet-activated unit's attacks on a target below Starting Strength.
  if (id.endsWith('many-cuts')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const melee = state.phase === 'fight'
    if (!(melee ? hasAnyMeleeWeapon(state, unitId) : hasAnyRangedWeapon(state, unitId))) return -Infinity
    const pool = melee ? engagedEnemyUnits(state, player, unitId) : boardUnitsOf(state, other(player)).map((u) => u.id)
    let best = 0
    for (const e of pool) {
      const eu = state.units[e]
      if (!eu || eu.models.length >= eu.startingStrength) continue
      const dmg = melee ? unitMeleeDamage(state, unitId, e, {}) : unitRangedDamage(state, unitId, e, {})
      best = Math.max(best, dmg * 0.18 * unitValue(state, e) * 0.03)
    }
    return best > 0.2 ? best : -Infinity
  }
  // Drukhari There and Gone: pull a battered, disengaged infantry unit into a Transport at the end of the enemy Fight phase.
  if (id.endsWith('there-and-gone')) {
    const unitId = targets.unitIds?.[0]
    const unit = unitId ? state.units[unitId] : undefined
    if (!unit || unit.models.length * 2 > unit.startingStrength) return -Infinity
    return unitValue(state, unit.id) * 0.05
  }
  // Ascetic Discipline (Adepta Sororitas): AP improves by 2 on critical wounds for the chosen unit this phase; use it on a
  // unit with real output against whatever it can hit (Shooting: nearest enemy in range; Fight: an engaged enemy).
  if (id.endsWith('ascetic-discipline')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    let dmg = 0, val = 0
    if (state.phase === 'shooting') {
      for (const e of boardUnitsOf(state, other(player))) {
        const d = unitRangedDamage(state, unitId, e.id)
        if (d * unitValue(state, e.id) > dmg * val) { dmg = d; val = unitValue(state, e.id) }
      }
    } else {
      for (const e of engagedEnemyUnits(state, player, unitId)) {
        const d = unitMeleeDamage(state, unitId, e, {})
        if (d * unitValue(state, e) > dmg * val) { dmg = d; val = unitValue(state, e) }
      }
    }
    if (dmg < 2) return -Infinity
    return dmg * val * 0.006
  }
  // Tank Shock: mortal wounds = min(6, T dice at 5+); use when it meaningfully hurts what we just charged.
  if (id.endsWith('tank-shock')) {
    const enemyUnitId = targets.unitIds?.[1]
    const vehicleModelId = targets.modelIds?.[0]
    if (!enemyUnitId || !vehicleModelId) return -Infinity
    const model = state.models[vehicleModelId]
    if (!model) return -Infinity
    const expectedMortalWounds = Math.min(6, modelStats(state, model).T * (2 / 6))
    return expectedMortalWounds * unitValue(state, enemyUnitId) * 0.02
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
    return expectedMortalWounds * unitValue(state, enemyUnitId) * 0.02 * (killsAModel ? 1.5 : 0.8)
  }
  // Veteran Instincts: reroll 1s normally, reroll any wound vs MONSTER/VEHICLE — the big reroll-all case is the
  // one worth spending CP on; a plain reroll-ones against rank-and-file is only worth it against a juicy target.
  if (id.endsWith('veteran-instincts') || id.endsWith('harness-the-flaw')) {
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
    return bestDmg * bonusFrac * unitValue(state, bestEnemyId) * 0.02
  }
  // Blood Angels Rapid Strike: a Normal move at the end of our Shooting phase; worth it when it brings the unit onto (or into range of)
  // a scoring marker we do not hold yet (the move is up to the unit's M, the marker's control range is added on top).
  if (id.endsWith('rapid-strike')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const models = unitModels(state, unitId)
    const c = centerOfUnit(state, unitId)
    if (models.length === 0 || !c) return -Infinity
    const move = Math.min(...models.map((m) => modelStats(state, m).M))
    const reach = state.mission.data.objectiveRange ?? 3
    let best = 0
    for (const o of Object.values(state.objectives)) {
      if (o.removed || DEFAULT_SERVICES.objectives.controller(state, o.id) === player) continue
      const d = Math.hypot(o.pos.x - c.x, o.pos.z - c.z)
      if (d > move + reach) continue
      best = Math.max(best, objectiveScoreWeight(state, player, o.id) * 1.5)
    }
    return best > 0 ? best : -Infinity
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
    return dmg * unitValue(state, leaderId) * 0.03
  }
  // Rapid Ingress: bring a reserved unit on now instead of next Reinforcements — worth it when a valuable
  // objective is still uncontested and we can put a body on/near it immediately.
  if (id.endsWith('rapid-ingress')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const hasValuableUnclaimed = Object.values(state.objectives).some((o) => !o.removed
      && objectiveScoreWeight(state, player, o.id) > 1 && DEFAULT_SERVICES.objectives.controller(state, o.id) !== player)
    if (!hasValuableUnclaimed) return -Infinity
    return unitValue(state, unitId) * 0.03
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
    return bestWeight * 2
  }
  // Morgrim's Butchas Bestial Bellow: forced Battle-shock test at -1 on a nearby enemy unit - worth P(fail) times what the
  // shock costs it (OC lost on objectives it is holding, plus a small share of its value).
  // World Eaters Overwhelming Onslaught (target 1 = the charger, target 2 = the enemy unit): the same -1 Battle-shock test as Bestial Bellow.
  // Space Wolves Pack Ambush (target 1 = the Reiver Squad, target 2 = the enemy unit): the same test at -2
  if (id.endsWith('bestial-bellow') || id.endsWith('overwhelming-onslaught') || id.endsWith('pack-ambush')) {
    const enemyId = id.endsWith('overwhelming-onslaught') || id.endsWith('pack-ambush') ? targets.unitIds?.[1] : targets.unitIds?.[0]
    const shockMod = id.endsWith('pack-ambush') ? 2 : 1
    const enemy = enemyId ? state.units[enemyId] : undefined
    if (!enemyId || !enemy || enemy.player === player || enemy.battleShocked) return -Infinity
    const models = unitModels(state, enemyId)
    if (models.length === 0) return -Infinity
    const ld = Math.min(...models.map((m) => modelStats(state, m).Ld))
    const pFail = 1 - chargeProb(ld + shockMod) // 2D6 - shockMod must reach Leadership
    if (pFail < 0.05) return -Infinity
    let objValue = 0
    for (const o of Object.values(state.objectives)) {
      if (o.removed || !models.some((m) => withinObjectiveRange(m, o))) continue
      objValue += objectiveScoreWeight(state, player, o.id)
    }
    return pFail * (objValue * 1.5 + unitValue(state, enemyId) * 0.02)
  }
  // Space Wolves Keen Senses: the unit's ranged weapons ignore cover, and re-roll Hit rolls of 1 against a CHARACTER unit (about a sixth
  // more hits). Worth the best target in reach: the cover swing on an enemy in cover, or the re-roll on a CHARACTER.
  if (id.endsWith('keen-senses')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    const range = bestRangedRangeOfUnit(state, unitId) ?? 0
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) {
      if (minGapBetweenUnits(state, unitId, e.id) > range) continue
      const plain = unitRangedDamage(state, unitId, e.id, {})
      let gain = 0
      if (alreadyInCover(state, e.id, unitId)) gain += plain - unitRangedDamage(state, unitId, e.id, { cover: true })
      if (hasKeyword(state, e.id, 'CHARACTER')) gain += plain / 6
      best = Math.max(best, gain * unitValue(state, e.id) * 0.03)
    }
    return best > 0.2 ? best : -Infinity
  }
  // World Eaters Rage Unchecked: Sustained Hits 1 on every weapon of a below-half-strength BERZERKERS unit that has not acted yet; a
  // critical hit (1 in 6) adds one hit, so it is worth about a sixth of the unit's damage into the best target in reach.
  if (id.endsWith('rage-unchecked')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    let best = 0
    if (state.phase === 'fight') {
      for (const e of boardUnitsOf(state, other(player))) {
        if (minGapBetweenUnits(state, unitId, e.id) > ENGAGEMENT_H + 3) continue
        best = Math.max(best, unitMeleeDamage(state, unitId, e.id, {}) * unitValue(state, e.id) * 0.03 / 6)
      }
    } else {
      const range = bestRangedRangeOfUnit(state, unitId) ?? 0
      for (const e of boardUnitsOf(state, other(player))) {
        if (minGapBetweenUnits(state, unitId, e.id) > range) continue
        best = Math.max(best, unitRangedDamage(state, unitId, e.id, {}) * unitValue(state, e.id) * 0.03 / 6)
      }
    }
    return best > 0.15 ? best : -Infinity
  }
  // World Eaters Unstoppable Fury: a 6" Consolidation, but only if it ends in Engagement Range of an enemy unit: worth it when an
  // enemy unit sits beyond the normal 3" reach and within the 6".
  if (id.endsWith('unstoppable-fury')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyMeleeWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) {
      const gap = minGapBetweenUnits(state, unitId, e.id)
      if (gap > 3 + ENGAGEMENT_H && gap <= 6 + ENGAGEMENT_H) best = Math.max(best, 0.6 + unitValue(state, e.id) * 0.01)
    }
    return best > 0 ? best : -Infinity
  }
  // Morgrim's Butchas Get In There!: PILE-IN ONLY goes to 6" (consolidation stays 3"; a pile-in must end closer to the
  // nearest enemy so it never reaches an objective): worth it only when the enemy sits beyond a normal 3" pile-in.
  if (id.endsWith('get-in-there')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyMeleeWeapon(state, unitId)) return -Infinity
    let extraReach = false
    for (const u of boardUnitsOf(state, other(player))) {
      const gap = minGapBetweenUnits(state, unitId, u.id)
      if (gap > 3 + ENGAGEMENT_H && gap <= 6 + ENGAGEMENT_H) extraReach = true
    }
    if (!extraReach) return -Infinity
    return unitValue(state, unitId) * 0.02
  }
  // Get Stuck In: extends this unit's pile-in/consolidate to 6" — worth it when that extra reach can drag it
  // into a second fight or onto a valuable objective it couldn't reach with the normal 3".
  if (id.endsWith('get-stuck-in') || id.endsWith('vb-march-of-vengeance')) {
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
    return unitValue(state, unitId) * 0.02
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
    return p * dmg * unitValue(state, enemy.unitId) * 0.02
  }
  // Krump da Gitz!: free D6" surge toward whoever just shot us — only worth triggering when it sets up a
  // realistic charge next turn (otherwise it just drags the unit further from where it wants to be).
  if (id.endsWith('krump-da-gitz') || id.endsWith('goaded-to-fury')) {
    const unitId = targets.unitIds?.[0] ?? targetTrigger
    if (!unitId || !hasAnyMeleeWeapon(state, unitId)) return -Infinity
    const enemy = nearestEnemyUnit(state, player, unitId)
    if (!enemy) return -Infinity
    const myModels = unitModels(state, unitId)
    if (myModels.length === 0) return -Infinity
    const stats = modelStats(state, myModels[0])
    const surge = id.endsWith('goaded-to-fury') ? 6 : 3.5 // Goaded to Fury moves a fixed 6"; Krump da Gitz! rolls D6
    const afterGap = Math.max(0, enemy.gap - surge)
    const needed = Math.max(0, Math.ceil(afterGap - ENGAGEMENT_H))
    if (needed > stats.M + surge) return -Infinity // still not a plausible charge next turn
    return unitValue(state, enemy.unitId) * 0.015
  }
  // Bring It Down: re-roll hit rolls for every Astra Militarum unit against one enemy unit; worth it when our guns can hurt it.
  if (id.endsWith('bring-it-down')) {
    const enemyId = targets.unitIds?.[0]
    if (!enemyId) return -Infinity
    let dmg = 0
    for (const u of boardUnitsOf(state, player)) {
      if (!hasKeyword(state, u.id, 'ASTRA MILITARUM') || u.battleShocked) continue
      dmg += unitRangedDamage(state, u.id, enemyId, {})
    }
    if (dmg < 2) return -Infinity
    return dmg * 0.3 * unitValue(state, enemyId) * 0.03
  }
  // Genestealer Cults Defend the Magus: re-roll hit/wound 1s for every GSC attacker against the engaged enemy unit
  if (id.endsWith('defend-the-magus')) {
    const enemyId = targets.unitIds?.[1]
    if (!enemyId) return -Infinity
    let dmg = 0
    for (const u of boardUnitsOf(state, player)) {
      if (!hasKeyword(state, u.id, 'GENESTEALER CULTS') || u.battleShocked) continue
      dmg += state.phase === 'fight' ? unitMeleeDamage(state, u.id, enemyId, {}) : unitRangedDamage(state, u.id, enemyId, {})
    }
    if (dmg < 2) return -Infinity
    return dmg * 0.25 * unitValue(state, enemyId) * 0.03
  }
  // Genestealer Cults Return to the Shadows: a free reposition, mostly useful to slip out of a charge lane; modest value
  // Chaos Daemons Empyric Predators is the same play (6" Normal move toward whoever just moved; the Hounds then forgo Overwatch)
  if (id.endsWith('return-to-the-shadows') || id.endsWith('empyric-predators')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !trigger || state.units[trigger]?.player === player) return -Infinity
    return unitValue(state, unitId) * 0.01 + 0.4
  }
  // Artillery Strike: once per battle, 2 CP — hampers every enemy unit's movement, charges and shooting for a turn. Spend it
  // when the enemy is close enough to matter and we can still afford to keep a CP in hand.
  if (id.endsWith('artillery-strike')) {
    if (cp < cost + 1) return -Infinity
    let near = 0
    for (const e of boardUnitsOf(state, other(player))) {
      for (const u of boardUnitsOf(state, player)) if (minGapBetweenUnits(state, u.id, e.id) <= 30) { near++; break }
    }
    return near >= 2 ? 2.5 + near * 0.6 : -Infinity
  }
  // Custodes The Gilded Spear: after the Shield-Captain falls to an enemy attack, our ranged fire at that unit gains Sustained Hits 1
  // for the rest of the battle (about +17% damage); worth the 1 CP while our gunners can still reach the killer.
  if (id.endsWith('gilded-spear')) {
    const mark = state.phaseState.marks.find((m) => m.startsWith('deathReaction:'))
    let killer: UnitId | null = null
    if (mark) { try { killer = (JSON.parse(mark.slice('deathReaction:'.length)) as { attackerUnitId?: UnitId }).attackerUnitId ?? null } catch { killer = null } }
    if (!killer || !state.units[killer] || state.units[killer].location !== 'board') return -Infinity
    let dmg = 0
    for (const u of boardUnitsOf(state, player)) {
      if (u.battleShocked || !hasAnyRangedWeapon(state, u.id)) continue
      const range = bestRangedRangeOfUnit(state, u.id) ?? 0
      if (minGapBetweenUnits(state, u.id, killer) > range + 6) continue
      dmg += unitRangedDamage(state, u.id, killer, {})
    }
    if (dmg <= 0) return -Infinity
    return dmg * 0.17 * unitValue(state, killer) * 0.03 * Math.max(1, roundsLeft + 0.5)
  }
  // Leagues of Votann Payment in Kind: after the last Hearthkyn (etc.) falls to an enemy attack, our hit rolls of 1 against that unit are
  // re-rolled for the rest of the battle (about +1/6 hits on a 3+/4+ hit roll); worth the 1 CP while our shooters or fighters can reach it.
  if (id.endsWith('payment-in-kind') || id.endsWith('mva-retribution-codes')) {
    const mark = state.phaseState.marks.find((m) => m.startsWith('deathReaction:'))
    let killer: UnitId | null = null
    if (mark) { try { killer = (JSON.parse(mark.slice('deathReaction:'.length)) as { attackerUnitId?: UnitId }).attackerUnitId ?? null } catch { killer = null } }
    if (!killer || !state.units[killer] || state.units[killer].location !== 'board') return -Infinity
    let dmg = 0
    for (const u of boardUnitsOf(state, player)) {
      if (u.battleShocked) continue
      if (hasAnyRangedWeapon(state, u.id)) {
        const range = bestRangedRangeOfUnit(state, u.id) ?? 0
        if (minGapBetweenUnits(state, u.id, killer) <= range + 6) dmg += unitRangedDamage(state, u.id, killer, {})
      }
      if (hasAnyMeleeWeapon(state, u.id) && minGapBetweenUnits(state, u.id, killer) <= 12) dmg += unitMeleeDamage(state, u.id, killer, {})
    }
    if (dmg <= 0) return -Infinity
    return dmg * 0.14 * unitValue(state, killer) * 0.03 * Math.max(1, roundsLeft + 0.5)
  }
  // Leagues of Votann Pan-Spectral Sweep: Lethal Hits on a not-yet-shot unit's ranged weapons (a hit of 6 auto-wounds, about +1/6 of the
  // wounds on tough targets); pick the shooter that has the most to gain, i.e. the biggest volley at an enemy it can reach.
  if (id.endsWith('pan-spectral-sweep') || id.endsWith('vb-relic-munitions')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || state.phase !== 'shooting' || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) {
      const range = bestRangedRangeOfUnit(state, unitId) ?? 0
      if (minGapBetweenUnits(state, unitId, e.id) > range) continue
      best = Math.max(best, unitRangedDamage(state, unitId, e.id, {}) * unitValue(state, e.id) * 0.03 * 0.18)
    }
    return best > 0.25 ? best : -Infinity
  }
  // Aeldari Storm of Shots: +1 to hit for a not-yet-shot unit's attacks; compare the unit's best volley with and without it.
  if (id.endsWith('storm-of-shots')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyRangedWeapon(state, unitId)) return -Infinity
    const range = bestRangedRangeOfUnit(state, unitId) ?? 0
    let best = 0
    for (const e of boardUnitsOf(state, other(player))) {
      if (minGapBetweenUnits(state, unitId, e.id) > range) continue
      const gain = unitRangedDamage(state, unitId, e.id, { hitMod: 1 }) - unitRangedDamage(state, unitId, e.id, {})
      best = Math.max(best, gain * unitValue(state, e.id) * 0.03)
    }
    return best > 0.2 ? best : -Infinity
  }
  // Aeldari Zephyr-swift: a free 6" Normal move (no charge afterwards); worth it when the unit can reach an objective it does not
  // hold (or must contest) with the move, and is not about to be wasted on a marker it already controls.
  if (id.endsWith('zephyr-swift')) {
    const unitId = targets.unitIds?.[0]
    const models = unitId ? unitModels(state, unitId) : []
    if (!unitId || models.length === 0) return -Infinity
    const here = centerOfUnit(state, unitId)
    if (!here) return -Infinity
    let best = 0
    for (const o of Object.values(state.objectives)) {
      if (o.removed) continue
      const onIt = models.some((m) => withinObjectiveRange(m, o))
      const controller = DEFAULT_SERVICES.objectives.controller(state, o.id)
      if (onIt && controller === player) continue
      const reach = Math.hypot(o.pos.x - here.x, o.pos.z - here.z) - 3
      if (reach > 6 || reach < 0) continue
      best = Math.max(best, objectiveScoreWeight(state, player, o.id) * (controller === player ? 0.3 : 1.2))
    }
    return best > 0.4 ? best : -Infinity
  }
  // Thousand Sons Wreathed in Warpflame: Lethal Hits on a not-yet-fought unit's melee weapons (a critical hit on a 5+ against a MONSTER or
  // VEHICLE); worth about a fifth (a third against the big targets) of the unit's melee damage against what it is fighting.
  if (id.endsWith('wreathed-in-warpflame')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId || !hasAnyMeleeWeapon(state, unitId)) return -Infinity
    let best = 0
    for (const e of engagedEnemyUnits(state, player, unitId)) {
      const big = hasKeyword(state, e, 'MONSTER') || hasKeyword(state, e, 'VEHICLE')
      best = Math.max(best, unitMeleeDamage(state, unitId, e, {}) * (big ? 0.33 : 0.2) * unitValue(state, e) * 0.03)
    }
    return best > 0.2 ? best : -Infinity
  }
  // Thousand Sons Malign Entanglement: -2 to the charger's Charge roll; worth the drop in its chance to arrive times the melee it would do.
  if (id.endsWith('malign-entanglement')) {
    const mine = mineOf(state, player, targets.unitIds)
    const chargerId = (targets.unitIds ?? []).find((u) => state.units[u]?.player !== player) ?? trigger
    const charge = state.phaseState.charge
    if (!mine || !chargerId || !charge) return -Infinity
    const needed = neededChargeDistance(state, chargerId, charge.targetUnitIds)
    if (needed > 12) return -Infinity
    const drop = chargeProb(needed) - chargeProb(needed + 2)
    if (drop <= 0) return -Infinity
    return drop * unitMeleeDamage(state, chargerId, mine, {}) * unitValue(state, mine) * 0.03 * 2
  }
  // Custodes Overawing Magnificence: a free Normal move (up to M, ending outside Engagement Range) after the enemy falls back from
  // our unit; worth it when the freed unit can reach an objective we do not hold, or close on the retreating unit's lane.
  if (id.endsWith('overawing-magnificence')) {
    const unitId = targets.unitIds?.[0]
    const models = unitId ? unitModels(state, unitId) : []
    if (!unitId || models.length === 0) return -Infinity
    const move = Math.min(...models.map((m) => modelStats(state, m).M))
    const here = centerOfUnit(state, unitId)
    if (!here) return -Infinity
    let best = 0
    for (const o of Object.values(state.objectives)) {
      if (o.removed) continue
      const reach = Math.hypot(o.pos.x - here.x, o.pos.z - here.z) - 3 // objective range is 3"
      if (reach > move) continue
      const weight = objectiveScoreWeight(state, player, o.id)
      const held = DEFAULT_SERVICES.objectives.controller(state, o.id) === player
      best = Math.max(best, weight * (held ? 0.5 : 1.2))
    }
    if (trigger && state.units[trigger]?.location === 'board' && minGapBetweenUnits(state, unitId, trigger) <= move + 2) best = Math.max(best, 0.8 + unitValue(state, trigger) * 0.005)
    return best > 0 ? best : -Infinity
  }
  // Death Guard Corrosive Effluents: AP improved by 1 for every attack of a unit that has not shot / fought yet (a worse save for the target)
  if (id.endsWith('corrosive-effluents')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    const melee = state.phase === 'fight'
    let best = 0
    if (melee) {
      for (const e of engagedEnemyUnits(state, player, unitId)) {
        best = Math.max(best, (unitMeleeDamage(state, unitId, e, { svMod: 1 }) - unitMeleeDamage(state, unitId, e, {})) * unitValue(state, e) * 0.04)
      }
    } else if (hasAnyRangedWeapon(state, unitId)) {
      const range = bestRangedRangeOfUnit(state, unitId) ?? 0
      for (const e of boardUnitsOf(state, other(player))) {
        if (minGapBetweenUnits(state, unitId, e.id) > range) continue
        best = Math.max(best, (unitRangedDamage(state, unitId, e.id, { svMod: 1 }) - unitRangedDamage(state, unitId, e.id, {})) * unitValue(state, e.id) * 0.04)
      }
    }
    return best > 0.2 ? best : -Infinity
  }
  // Death Guard Harbingers of Despair: Battle-shock tests on every enemy unit holding the target. Worth the CP when a test is likely to fail
  // (low Leadership) on units that are not already shocked.
  if (id.endsWith('harbingers-of-despair')) {
    const unitId = targets.unitIds?.[0]
    if (!unitId) return -Infinity
    let gain = 0
    for (const e of engagedEnemyUnits(state, player, unitId)) {
      if (state.units[e]?.battleShocked) continue
      const ms = unitModels(state, e)
      if (ms.length === 0) continue
      const ld = Math.min(...ms.map((m) => modelStats(state, m).Ld))
      const k = Math.min(12, Math.max(1, ld - 1)) // a test fails on a 2D6 total <= Ld - 1
      const pFail = (k <= 7 ? (k * (k - 1)) / 2 : 36 - ((13 - k) * (12 - k)) / 2) / 36
      gain += pFail * unitValue(state, e) * 0.04
    }
    return gain > 0.25 ? gain : -Infinity
  }
  return -Infinity // unmodelled stratagem: hold CP
}

// exported for tests: the stratagem's full score (HOLD_CP_SCORE + gain - cpThreshold), or -Infinity when it is not worth considering
export function stratagemScore(state: GameState, player: PlayerId, pending: PendingDecision, action: UseStratagemAction, cost: number): number {
  const gain = stratagemGain(state, player, pending, action, cost)
  if (!Number.isFinite(gain)) return -Infinity
  return HOLD_CP_SCORE + gain - cpThreshold(state, player, cost)
}

export function scoreStratagemOrReaction(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (action.type === 'pass') return HOLD_CP_SCORE
  if (action.type !== 'useStratagem') return 0
  const strat = state.stratagems[action.stratagemId]
  // per-target cost (Pouncing Leap makes Heroic Intervention free for the Leapers)
  const cost = strat ? effectiveCost(state, player, strat, action.targets?.unitIds ?? []) : 1
  return stratagemScore(state, player, pending, action, cost)
}

// ---------- Command Re-roll ----------

// weapon Damage mean for a roll's weapon (0 when unknown)
function rollWeaponDamage(state: GameState, weaponId: string | null): number {
  const w = weaponId ? state.weapons[weaponId] : undefined
  return w ? diceExprMean(w.D) : 1
}

function pPassTarget(needed: number | undefined): number {
  const n = needed ?? 4
  if (n > 6) return 0
  return Math.max(1 / 6, Math.min(5 / 6, (7 - n) / 6))
}

// needed charge distance for the declared targets (engagement range already counts as arrived)
export function neededChargeDistance(state: GameState, unitId: UnitId, targetUnitIds: UnitId[]): number {
  let needed = 0
  for (const t of targetUnitIds) needed = Math.max(needed, minGapBetweenUnits(state, unitId, t) - ENGAGEMENT_H)
  return Math.max(0, Math.ceil(needed))
}

export function commandRerollScore(state: GameState, player: PlayerId, pending: PendingDecision, action: Action): number {
  if (action.type === 'pass') return HOLD_CP_SCORE
  if (action.type !== 'commandReroll' || pending.kind !== 'commandReroll') return 0
  const roll = pending.context.roll
  const threshold = cpThreshold(state, player, 1)
  const finish = (gain: number): number => (gain > 0 ? HOLD_CP_SCORE + gain - threshold : -1)

  if (roll.purpose === 'charge') {
    const charge = state.phaseState.charge
    const unitId = charge?.unitId ?? roll.unitId
    const targetIds = charge?.targetUnitIds ?? []
    if (!unitId || targetIds.length === 0) return -1
    const needed = neededChargeDistance(state, unitId, targetIds)
    const sum = roll.final.reduce((a, b) => a + b, 0)
    if (sum >= needed || needed > 12) return -1 // already succeeded, or cannot succeed even with a good re-roll
    let p: number
    if (action.dieIndex !== undefined && roll.final.length === 2) {
      p = pOneDieReaches(roll.final[1 - action.dieIndex], needed)
    } else p = chargeProb(needed)
    let payoff = 0
    for (const t of targetIds) {
      const dmg = unitMeleeDamage(state, unitId, t, { charged: true })
      const ret = unitMeleeDamage(state, t, unitId, {})
      payoff += Math.max(0, dmg * unitValue(state, t) * 0.02 - ret * unitValue(state, unitId) * 0.01)
    }
    return finish(p * payoff)
  }
  if (roll.purpose === 'advance') return -1 // a short advance rarely decides anything worth a CP

  if (action.dieIndex !== undefined && (roll.purpose === 'hit' || roll.purpose === 'wound' || roll.purpose === 'save')) {
    const die = roll.dice[action.dieIndex]
    const needed = roll.needed ?? 4
    if (die === undefined || (die !== 1 && die >= needed)) return -1 // only failed dice
    const pSucc = pPassTarget(roll.needed)
    const dmg = rollWeaponDamage(state, roll.weaponId)
    if (roll.purpose === 'save') {
      const defId = roll.targetUnitId && state.units[roll.targetUnitId]?.player === player ? roll.targetUnitId : roll.unitId
      if (!defId || state.units[defId]?.player !== player) return -1
      const models = unitModels(state, defId)
      if (models.length === 0) return -1
      const model = roll.modelId ? state.models[roll.modelId] : undefined
      const w = Math.max(1, model?.woundsRemaining ?? totalWounds(state, defId) / models.length)
      const perModel = unitValue(state, defId) / models.length
      return finish(pSucc * Math.min(1, dmg / w) * perModel * DEFENCE_SCALE)
    }
    // hit / wound: an extra hit or wound only converts to damage some of the time, and only matters when each hit is big
    const targetId = roll.targetUnitId
    if (!targetId || state.units[targetId]?.player === player) return -1
    const w = Math.max(1, totalWounds(state, targetId))
    const valuePerWound = unitValue(state, targetId) / w
    return finish(pSucc * 0.5 * Math.min(dmg, w) * valuePerWound * DEFENCE_SCALE)
  }
  return -1
}
