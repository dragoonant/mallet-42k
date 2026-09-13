// Dice service (W1-A): DiceExpr parsing, roll records, re-rolls (R-1.5, R-1.6), modifier caps (R-6.20/6.21), stat clamps (R-1.9).
// Rolling through the reducer goes via EngineContext.roll()/rollExpr()/reroll() (see modules.ts), which wrap these pure
// helpers and emit DiceRolled / DiceRerolled events. Nothing here touches events or state.
import type { DiceExpr, StatName } from '../data/types'
import type { Rng } from './rng'
import { EngineInvariantError } from './types'
import type { DiceRoll, ModelId, PlayerId, RollModifier, RollPurpose, UnitId, WeaponId } from './types'

// ---------- DiceExpr ----------
export interface ParsedDiceExpr { count: number; sides: 3 | 6 | null; flat: number }

const DICE_EXPR_RE = /^(\d+)?(D3|D6)?([+-]\d+)?$/

// integer ≥ 0, or "D6" | "2D6+1" | "D3+3" | "3" (20-data §2). Throws EngineInvariantError with details.code = 'E_SCHEMA'.
export function parseDiceExpr(expr: DiceExpr): ParsedDiceExpr {
  if (typeof expr === 'number') {
    if (!Number.isInteger(expr) || expr < 0) throw diceExprError(expr)
    return { count: 0, sides: null, flat: expr }
  }
  if (typeof expr !== 'string' || expr.length === 0) throw diceExprError(expr)
  const m = DICE_EXPR_RE.exec(expr)
  if (!m) throw diceExprError(expr)
  const [, countStr, die, flatStr] = m
  if (!die) {
    // pure integer string ("3"); a bare sign or an empty match is invalid
    if (countStr === undefined || flatStr !== undefined) throw diceExprError(expr)
    return { count: 0, sides: null, flat: Number(countStr) }
  }
  const count = countStr === undefined ? 1 : Number(countStr)
  if (count < 1) throw diceExprError(expr)
  return { count, sides: die === 'D3' ? 3 : 6, flat: flatStr === undefined ? 0 : Number(flatStr) }
}

function diceExprError(expr: unknown): EngineInvariantError {
  return new EngineInvariantError(`invalid DiceExpr: ${JSON.stringify(expr)}`, { code: 'E_SCHEMA', expr })
}

export function isValidDiceExpr(expr: unknown): boolean {
  try { parseDiceExpr(expr as DiceExpr); return true } catch { return false }
}

export function isFixedDiceExpr(expr: DiceExpr): boolean { return parseDiceExpr(expr).count === 0 }

// maximum value the expression can produce (Blast bookkeeping, AI estimates)
export function diceExprMax(expr: DiceExpr): number {
  const p = parseDiceExpr(expr)
  return p.flat + p.count * (p.sides ?? 0)
}

export function diceExprMean(expr: DiceExpr): number {
  const p = parseDiceExpr(expr)
  return p.flat + p.count * (p.sides === 6 ? 3.5 : p.sides === 3 ? 2 : 0)
}

// ---------- rolls ----------
// mode 'perDie' (hit/wound/save fast-rolls): modifiers apply to every die, final[i] = dice[i] + net (net clamped to
// ±modifierCap when set). mode 'sum' (2D6 charge, D3+3 damage, battle-shock): final = dice, modifiers apply to the total
// (rollSum). Default mode: perDie when count is 1 and no flat bonus, otherwise sum — pass it explicitly to be safe.
export interface RollSpec {
  purpose: RollPurpose
  player: PlayerId
  sides?: 3 | 6
  count?: number
  mode?: 'perDie' | 'sum'
  modifiers?: RollModifier[]
  // hit/wound: 1 (R-6.20); leave undefined for uncapped
  modifierCap?: number | null
  unitId?: UnitId | null
  modelId?: ModelId | null
  weaponId?: WeaponId | null
  targetUnitId?: UnitId | null
  // false for roll-offs and any roll a rule says can never be re-rolled (R-1.4)
  commandRerollable?: boolean
}

export function netModifier(modifiers: RollModifier[] | undefined, cap: number | null | undefined): number {
  let net = 0
  for (const m of modifiers ?? []) net += m.value
  if (cap !== null && cap !== undefined) net = Math.max(-cap, Math.min(cap, net))
  return net
}

// R-6.20: hit and wound modifiers are clamped to [−1, +1]
export function clampHitWoundModifier(net: number): number { return Math.max(-1, Math.min(1, net)) }

// R-6.21: AP applies fully, total save improvement clamps at +1. `improvements` = sum of positive modifiers (cover etc.)
export function saveModifier(ap: number, improvements: number): number { return ap + Math.min(1, Math.max(0, improvements)) }

function computeFinal(dice: number[], spec: Pick<RollSpec, 'mode' | 'modifiers' | 'modifierCap'>): number[] {
  const mode = spec.mode ?? 'perDie'
  if (mode === 'sum') return [...dice]
  const net = netModifier(spec.modifiers, spec.modifierCap)
  return dice.map((d) => d + net)
}

// pure: draw the dice and build the record. `id` comes from state.rollCounter via EngineContext.roll.
export function makeRoll(rng: Rng, spec: RollSpec, id: string): DiceRoll {
  const sides = spec.sides ?? 6
  const count = spec.count ?? 1
  if (!Number.isInteger(count) || count < 1) throw new EngineInvariantError('makeRoll: count must be ≥ 1', { spec })
  const dice: number[] = []
  for (let i = 0; i < count; i++) dice.push(rng.roll(sides))
  return {
    id,
    purpose: spec.purpose,
    sides,
    dice,
    rerolled: null,
    modifiers: [...(spec.modifiers ?? [])],
    final: computeFinal(dice, spec),
    player: spec.player,
    unitId: spec.unitId ?? null,
    modelId: spec.modelId ?? null,
    weaponId: spec.weaponId ?? null,
    targetUnitId: spec.targetUnitId ?? null,
    commandRerollable: spec.commandRerollable ?? true,
  }
}

// sum-mode total: Σ final + Σ modifiers (flat parts of a DiceExpr are recorded as a modifier with source 'flat')
export function rollSum(roll: DiceRoll): number {
  let total = 0
  for (const f of roll.final) total += f
  for (const m of roll.modifiers) total += m.value
  return total
}

// roll a DiceExpr: fixed expressions produce no roll (and no event); dice expressions produce one sum-mode roll
export function rollDiceExpr(rng: Rng, expr: DiceExpr, spec: Omit<RollSpec, 'sides' | 'count' | 'mode'>, id: string): { total: number; roll: DiceRoll | null } {
  const p = parseDiceExpr(expr)
  if (p.count === 0 || p.sides === null) return { total: p.flat, roll: null }
  const modifiers = [...(spec.modifiers ?? [])]
  if (p.flat !== 0) modifiers.push({ source: 'flat', value: p.flat })
  const roll = makeRoll(rng, { ...spec, sides: p.sides, count: p.count, mode: 'sum', modifiers }, id)
  return { total: rollSum(roll), roll }
}

// R-1.6: a die is never re-rolled more than once. `rerolled` lists die indexes already re-rolled.
export function canReroll(roll: DiceRoll, index: number): boolean {
  return index >= 0 && index < roll.dice.length && !(roll.rerolled ?? []).includes(index)
}

export interface RerollResult { roll: DiceRoll; before: number[]; after: number[] }

// re-roll the given dice (all of them for a multi-die roll, R-1.5), recomputing `final`; throws on a second re-roll
export function applyReroll(rng: Rng, roll: DiceRoll, indexes: number[], modifierCap?: number | null): RerollResult {
  const unique = [...new Set(indexes)]
  for (const i of unique) {
    if (!canReroll(roll, i)) throw new EngineInvariantError('applyReroll: die already re-rolled or out of range', { rollId: roll.id, index: i })
  }
  const dice = [...roll.dice]
  const before: number[] = []
  const after: number[] = []
  for (const i of unique) {
    before.push(dice[i])
    dice[i] = rng.roll(roll.sides)
    after.push(dice[i])
  }
  const perDie = roll.final.length === roll.dice.length && roll.final.some((f, i) => f !== roll.dice[i])
  const next: DiceRoll = {
    ...roll,
    dice,
    rerolled: [...(roll.rerolled ?? []), ...unique],
    final: computeFinal(dice, { mode: perDie ? 'perDie' : 'sum', modifiers: roll.modifiers, modifierCap: modifierCap ?? (perDie ? 1 : null) }),
  }
  return { roll: next, before, after }
}

// success test for a per-die roll: unmodified 1 always fails, unmodified 6 always succeeds when `sixAlwaysSucceeds`
export function dieSucceeds(unmodified: number, modified: number, target: number, sixAlwaysSucceeds = true): boolean {
  if (unmodified === 1) return false
  if (sixAlwaysSucceeds && unmodified === 6) return true
  return modified >= target
}

// R-6.12 wound roll needed for S vs T
export function woundRollNeeded(S: number, T: number): number {
  if (S >= 2 * T) return 2
  if (S > T) return 3
  if (S === T) return 4
  if (S * 2 <= T) return 6
  return 5
}

// R-1.9 characteristic floors/caps after all modifiers
export function clampStat(stat: StatName, value: number): number {
  switch (stat) {
    case 'M': return Math.max(1, value)
    case 'T': return Math.max(1, value)
    case 'Sv': return Math.max(2, value)
    case 'Ld': return Math.max(4, Math.min(9, value))
    case 'OC': return Math.max(0, value)
    case 'range': return Math.max(1, value)
    case 'A': return Math.max(1, value)
    case 'BS': case 'WS': return Math.max(2, value)
    case 'AP': return Math.min(0, value)
    case 'D': return Math.max(1, value)
    case 'W': return Math.max(1, value)
    case 'S': return Math.max(1, value)
    default: return value
  }
}
