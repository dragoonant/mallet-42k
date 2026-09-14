// Cheap expected-damage / value heuristics for the tier-1 AI (docs/spec/40-ai.md §2-3, simplified for
// "playable fast" — owner priority). Pure functions of GameState; never rolls dice, never mutates.
//
// Known simplifications (acceptable for a tier-1 heuristic bot, not modelled exactly like the engine's real
// attack sequence in src/engine/attack.ts): EXTRA_ATTACKS/PRECISION ignored; ANTI only affects the wound
// roll (not hit); Devastating Wounds mortals use the weapon's damage mean rather than a separate roll;
// FNP/cover applied as flat multipliers instead of the engine's per-model hook-driven values; no points data
// is available at runtime (RuntimeDatasheet strips it), so "value" is derived from stats instead.
import { diceExprMean, parseDiceExpr, woundRollNeeded } from '../engine/dice'
import { boardModelsOf, datasheetOf, hasKeyword, keywordsOf, modelStats, unitModels } from '../engine/state'
import { weaponService } from '../engine/weapons'
import type { GameState, ModelId, PlayerId, RuntimeWeapon, UnitId, WeaponId } from '../engine/types'

// clamp a hit/wound probability the way the core rules do: unmodified 6 always succeeds, unmodified 1 always
// fails, so no modifier can push the true probability outside 1/6..5/6 (40-ai.md §2)
function rollP(target: number, mod = 0): number {
  const capped = Math.max(-1, Math.min(1, mod))
  const t = target - capped
  return Math.max(1 / 6, Math.min(5 / 6, (7 - t) / 6))
}

function abilityValueMean(weapon: RuntimeWeapon, ability: Parameters<typeof weaponService.abilityValue>[1]): number {
  const v = weaponService.abilityValue(weapon, ability)
  return v === null ? 1 : diceExprMean(v)
}

export interface AttackOptions {
  charged?: boolean // this attacker's unit charged this turn (LANCE, some Waaagh-style bonuses)
  inHalfRange?: boolean // RAPID_FIRE / MELTA bonuses
  cover?: boolean // target has the Benefit of Cover against this attack
  hitMod?: number
  woundMod?: number
}

export interface AttackEstimate { damage: number; modelsKilled: number }

const NO_DAMAGE: AttackEstimate = { damage: 0, modelsKilled: 0 }

// representative defending model: the first living model (defender's allocation choice isn't modelled; good
// enough for target prioritisation, which is all this is used for)
function representativeDefender(state: GameState, targetUnitId: UnitId): ModelId | null {
  const models = unitModels(state, targetUnitId)
  return models.length > 0 ? models[0].id : null
}

function feelNoPain(state: GameState, unitId: UnitId): number | null {
  const ds = datasheetOf(state, unitId)
  const core = ds.coreAbilities.find((a) => a.ability === 'FEEL_NO_PAIN')
  if (!core || core.value === undefined) return null
  return parseDiceExpr(core.value).flat
}

// Expected damage one model's one use of one weapon deals to a target unit, plus a rough models-killed estimate.
// `attacks` overrides the weapon's own A (melee attacks are pre-rolled and split by the player; declareTargets'
// context carries the real per-(model,weapon) count).
export function expectedAttack(
  state: GameState, attackerModelId: ModelId, weaponId: WeaponId, targetUnitId: UnitId,
  opts: AttackOptions = {}, attacks?: number,
): AttackEstimate {
  const attacker = state.models[attackerModelId]
  const target = state.units[targetUnitId]
  if (!attacker || !target || target.location !== 'board') return NO_DAMAGE
  const defenderId = representativeDefender(state, targetUnitId)
  if (!defenderId) return NO_DAMAGE
  const defender = state.models[defenderId]
  const weapon = weaponService.effectiveWeapon(state, attackerModelId, weaponId)
  if (!weapon || weapon.skill === null) return NO_DAMAGE // melee weapon with no WS = can't attack (shouldn't happen)

  const tStats = modelStats(state, defender)
  const tKeywords = keywordsOf(state, targetUnitId)

  let n = attacks ?? diceExprMean(weapon.A)
  if (weaponService.hasAbility(weapon, 'RAPID_FIRE') && opts.inHalfRange) n += abilityValueMean(weapon, 'RAPID_FIRE')

  const torrent = weaponService.hasAbility(weapon, 'TORRENT')
  const pHit = torrent ? 1 : rollP(weapon.skill, opts.hitMod ?? 0)
  const pCrit = torrent ? 0 : 1 / 6

  let hits = n * pHit
  if (weaponService.hasAbility(weapon, 'SUSTAINED_HITS')) hits += n * pCrit * abilityValueMean(weapon, 'SUSTAINED_HITS')
  let autoWoundHits = 0
  if (weaponService.hasAbility(weapon, 'LETHAL_HITS')) { autoWoundHits = n * pCrit; hits -= n * pCrit }
  hits = Math.max(0, hits)

  let woundTarget = woundRollNeeded(weapon.S, tStats.T)
  if (opts.charged && weaponService.hasAbility(weapon, 'LANCE')) woundTarget -= 1
  let woundMod = opts.woundMod ?? 0
  const anti = weapon.abilities.find((a) => a.ability === 'ANTI' && a.keyword && tKeywords.includes(a.keyword))
  let pCritWound = pCrit
  if (anti?.value !== undefined) {
    const threshold = parseDiceExpr(anti.value).flat
    // ANTI-X value+: an unmodified roll of value or more is always a critical wound, regardless of S vs T
    pCritWound = Math.max(pCrit, rollP(threshold, 0))
  }
  if (weaponService.hasAbility(weapon, 'TWIN_LINKED')) woundMod += 0 // modelled via reroll-fails below
  const pWoundBase = rollP(woundTarget, woundMod)
  const pWound = weaponService.hasAbility(weapon, 'TWIN_LINKED') ? pWoundBase + (1 - pWoundBase) * pWoundBase : pWoundBase

  let normalWounds = hits * Math.max(pWound, pCritWound)
  let critWounds = hits * pCritWound
  if (weaponService.hasAbility(weapon, 'DEVASTATING_WOUNDS')) normalWounds -= critWounds
  else critWounds = 0
  normalWounds = Math.max(0, normalWounds)

  const woundsFromNormal = normalWounds + autoWoundHits // autoWoundHits from LETHAL still need a save
  const woundsFromDevastating = critWounds // bypass saves entirely

  // save: sv' = Sv - AP (AP is stored negative), cover -1 (better) unless ignored/AP0-heavy-armour, invuln if better
  const dsInvuln = datasheetOf(state, targetUnitId).invuln
  const ignoresCover = weaponService.hasAbility(weapon, 'IGNORES_COVER')
  let svArmour = tStats.Sv - weapon.AP
  if (opts.cover && !ignoresCover && !(tStats.Sv <= 3 && weapon.AP === 0)) svArmour -= 1
  const effArmour = Math.max(2, Math.min(7, svArmour))
  const effInvuln = dsInvuln !== null ? Math.max(2, Math.min(7, dsInvuln)) : 7
  const effSave = Math.min(effArmour, effInvuln)
  const pFailSave = effSave >= 7 ? 1 : Math.max(0, Math.min(1, (effSave - 1) / 6))

  const unsaved = woundsFromNormal * pFailSave + woundsFromDevastating

  let perHitDamage = diceExprMean(weapon.D)
  if (weaponService.hasAbility(weapon, 'MELTA') && opts.inHalfRange) perHitDamage += abilityValueMean(weapon, 'MELTA')

  const fnp = feelNoPain(state, targetUnitId)
  const fnpMult = fnp !== null ? 1 - rollP(fnp, 0) * (7 - fnp <= 5 ? 1 : 1) : 1 // simple flat multiplier

  const damage = unsaved * perHitDamage * fnpMult
  const W = Math.max(1, tStats.W)
  const alive = target.models.length
  const modelsKilled = Math.min(alive, damage / W)

  return { damage, modelsKilled }
}

// sums expectedAttack over an explicit set of (model, weapon[, attacks]) assignments — used to score a
// declareTargets/fight-attacks candidate where the engine already tells us the legal (model,weapon,target,attacks).
export function sumExpectedAttacks(
  state: GameState,
  assignments: { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId; attacks?: number | null }[],
  opts: AttackOptions = {},
): number {
  let total = 0
  for (const a of assignments) {
    total += expectedAttack(state, a.modelId, a.weaponId, a.targetUnitId, opts, a.attacks ?? undefined).damage
  }
  return total
}

// Rough "how much is this unit worth" heuristic — no points data survives into RuntimeDatasheet, so this is
// derived from stats (toughness/wounds/output) rather than real points, scaled by role and current health.
export function unitValue(state: GameState, unitId: UnitId): number {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board') return 0
  const models = unitModels(state, unitId)
  if (models.length === 0) return 0
  let base = 0
  for (const model of models) {
    const stats = modelStats(state, model)
    let weaponPotential = 0
    for (const wid of model.weapons) {
      const w = weaponService.effectiveWeapon(state, model.id, wid)
      weaponPotential += diceExprMean(w.A) * diceExprMean(w.D) * (w.S / Math.max(1, w.AP === 0 ? 4 : 4 + Math.abs(w.AP)))
    }
    base += stats.T * 0.5 + stats.W * 2 + (7 - stats.Sv) * 1.5 + stats.OC * 2 + weaponPotential
  }
  const keywords = keywordsOf(state, unitId)
  let mult = 1
  if (keywords.includes('CHARACTER')) mult *= 1.5
  if (unit.attachedLeaderId) mult *= 1.3
  if (unit.isWarlord) mult *= 1.2
  const startingWounds = unit.startingStrength // models at deployment; used only as a rough denominator guard
  const healthFrac = models.length > 0 ? 1 : 1
  void startingWounds; void healthFrac
  return base * mult
}

// how much value the given player stands to lose if `unitId` (belonging to the other player) hits it — used
// for very rough threat maps; `dangerTo` is the value of the threatened unit itself, discounted by distance
// elsewhere by the caller.
export function bestMeleeWeapon(state: GameState, modelId: ModelId): WeaponId | null {
  const model = state.models[modelId]
  if (!model) return null
  let best: WeaponId | null = null
  let bestScore = -Infinity
  for (const wid of model.weapons) {
    const w = weaponService.effectiveWeapon(state, modelId, wid)
    if (w.kind !== 'melee') continue
    const score = diceExprMean(w.A) * diceExprMean(w.D)
    if (score > bestScore) { bestScore = score; best = wid }
  }
  return best
}

export function bestRangedWeapon(state: GameState, modelId: ModelId): { weaponId: WeaponId; range: number } | null {
  const model = state.models[modelId]
  if (!model) return null
  let best: { weaponId: WeaponId; range: number } | null = null
  let bestScore = -Infinity
  for (const wid of model.weapons) {
    const w = weaponService.effectiveWeapon(state, modelId, wid)
    if (w.kind !== 'ranged') continue
    const score = diceExprMean(w.A) * diceExprMean(w.D)
    if (score > bestScore) { bestScore = score; best = { weaponId: wid, range: w.range } }
  }
  return best
}

// crude per-position threat: sum of enemy units' best-weapon expected damage against a probe unit, discounted
// by whether the enemy is currently within its own threat range of the probe's position (2D). Cheap on purpose.
export function threatAt(state: GameState, forPlayer: PlayerId, pos: { x: number; z: number }): number {
  const enemies = boardModelsOf(state, forPlayer === 'A' ? 'B' : 'A')
  let total = 0
  const seen = new Set<UnitId>()
  for (const m of enemies) {
    if (seen.has(m.unitId)) continue
    seen.add(m.unitId)
    const unit = state.units[m.unitId]
    const val = unitValue(state, unit.id)
    const stats = modelStats(state, m)
    const dx = m.pos.x - pos.x, dz = m.pos.z - pos.z
    const dist = Math.hypot(dx, dz)
    const ranged = bestRangedWeapon(state, m.id)
    const reach = ranged ? ranged.range : stats.M + 3.5 // melee: move + average charge
    const scale = reach <= 0 ? 0 : Math.max(0, Math.min(1, (reach + 6 - dist) / (reach + 6)))
    total += val * 0.02 * scale
  }
  return total
}

// aggregate: each of the attacker's living models fires/swings with its single best weapon of that kind at
// the target unit (a rough stand-in for "the whole unit attacks", ignoring per-model target splits)
export function unitMeleeDamage(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, opts: AttackOptions = {}): number {
  let total = 0
  for (const m of unitModels(state, attackerUnitId)) {
    const wid = bestMeleeWeapon(state, m.id)
    if (wid) total += expectedAttack(state, m.id, wid, targetUnitId, opts).damage
  }
  return total
}

export function unitRangedDamage(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, opts: AttackOptions = {}): number {
  let total = 0
  for (const m of unitModels(state, attackerUnitId)) {
    const best = bestRangedWeapon(state, m.id)
    if (best) total += expectedAttack(state, m.id, best.weaponId, targetUnitId, opts).damage
  }
  return total
}

// max range among a unit's own ranged weapons (for "am I already in shooting position" heuristics)
export function bestRangedRangeOfUnit(state: GameState, unitId: UnitId): number | null {
  let best: number | null = null
  for (const m of unitModels(state, unitId)) {
    const r = bestRangedWeapon(state, m.id)
    if (r && (best === null || r.range > best)) best = r.range
  }
  return best
}

export function hasAnyMeleeWeapon(state: GameState, unitId: UnitId): boolean {
  return unitModels(state, unitId).some((m) => m.weapons.some((wid) => state.weapons[wid]?.kind === 'melee'))
}
export function hasAnyRangedWeapon(state: GameState, unitId: UnitId): boolean {
  return unitModels(state, unitId).some((m) => m.weapons.some((wid) => state.weapons[wid]?.kind === 'ranged'))
}
export function hasKeywordUnit(state: GameState, unitId: UnitId, kw: string): boolean { return hasKeyword(state, unitId, kw) }
