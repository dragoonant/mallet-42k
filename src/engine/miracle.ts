// Adepta Sororitas Acts of Faith (docs/spec/factions/adepta-sororitas.md §7 E1): the Miracle dice pool, turn-start / unit
// destroyed gain, and substituting a pool die for a D6 roll. The faction file re-exports this (factions/adepta-sororitas.ts);
// the roll hook points live in the reducer (rollOnce) and attack.ts (rollBatchD6) via `miracleGate`.
import type { Action } from './actions'
import type { DecisionHandler, EngineContext } from './modules'
import { leaderService } from './leaders'
import { neededChargeDistance } from './phases/charge'
import { keywordsOf } from './state'
import { EngineInvariantError } from './types'
import type { GameState, PendingDecision, PlayerId, Rejection, RollPurpose, UnitId } from './types'
import { netModifier, parseDiceExpr, type RollSpec } from './dice'

export const ACTS_OF_FAITH_CODE = 'actsOfFaith'
const FACTION_KEYWORD = 'ADEPTA SORORITAS'
// ADE-2.2: the roll kinds an Act of Faith may replace (sides must also be 6)
const SUBSTITUTABLE: ReadonlySet<RollPurpose> = new Set<RollPurpose>(['advance', 'battleShock', 'charge', 'damage', 'hit', 'wound', 'save'])

function pool(state: GameState, player: PlayerId): { dice: number[]; spentThisPhase: UnitId[] } {
  const p = state.players[player]
  // saves written before this rule lack the field
  if (!p.miracle) p.miracle = { dice: [], spentThisPhase: [] }
  return p.miracle
}

// true iff any of the player's units (alive or not) carries the actsOfFaith marker ability
export function hasActsOfFaith(state: GameState, player: PlayerId): boolean {
  for (const u of Object.values(state.units)) {
    if (u.player !== player) continue
    for (const id of state.datasheets[u.datasheetId]?.abilities ?? []) if (state.abilities[id]?.code === ACTS_OF_FAITH_CODE) return true
  }
  return false
}

// rolls a D6 (purpose 'ability', not command-rerollable) unless `value` is given; pushes it; emits MiracleDieGained
export function gainMiracleDie(ctx: EngineContext, player: PlayerId, source: string, value?: number): number {
  const s = ctx.state
  let v = value
  if (v === undefined) {
    // the gain roll must not clobber phaseState.lastRoll, which an in-flight rollOnce re-entry may still need
    const saved = s.phaseState.lastRoll
    v = ctx.roll({ purpose: 'ability', player, sides: 6, count: 1, mode: 'sum', commandRerollable: false }).dice[0]
    s.phaseState.lastRoll = saved
  }
  if (!Number.isInteger(v) || v < 1 || v > 6) throw new EngineInvariantError('gainMiracleDie: value must be 1..6', { value: v })
  pool(s, player).dice.push(v)
  ctx.emit({ type: 'MiracleDieGained', player, value: v, source })
  return v
}

// removes pool[index]; emits MiracleDieSpent mode 'discard'; returns its value; throws EngineInvariantError if out of range
export function discardMiracleDie(ctx: EngineContext, player: PlayerId, index: number, unitId: UnitId | null, source: string): number {
  const dice = pool(ctx.state, player).dice
  if (!Number.isInteger(index) || index < 0 || index >= dice.length) throw new EngineInvariantError('discardMiracleDie: index out of range', { index, size: dice.length })
  const [value] = dice.splice(index, 1)
  ctx.emit({ type: 'MiracleDieSpent', player, value, mode: 'discard', unitId, rollId: null, purpose: null, source })
  return value
}

// true iff the roll may be substituted: sides 6, purpose in the ADE-2.2 list, unit has ADEPTA SORORITAS and is the roller's
// (save: the defender's), the player has a non-empty pool, and the unit has not made an Act of Faith this phase (ADE-2.5)
export function substitutionEligible(state: GameState, spec: { purpose: RollPurpose; player: PlayerId; unitId: UnitId | null; sides: 3 | 6 }): boolean {
  if (spec.sides !== 6 || !SUBSTITUTABLE.has(spec.purpose) || !spec.unitId) return false
  const unit = state.units[spec.unitId]
  if (!unit || unit.player !== spec.player) return false
  if (!hasActsOfFaith(state, spec.player)) return false
  const p = pool(state, spec.player)
  if (p.dice.length === 0) return false
  if (!keywordsOf(state, unit.id).includes(FACTION_KEYWORD)) return false
  const halves = leaderService.halves(state, unit.id)
  return !p.spentThisPhase.some((id) => id === unit.id || halves.includes(id))
}

// both players' pools gain one die at every turn start (ADE-2.1), active player first
export function runActsOfFaithTurnStart(ctx: EngineContext): void {
  const s = ctx.state
  const order: PlayerId[] = s.activePlayer === 'A' ? ['A', 'B'] : ['B', 'A']
  for (const player of order) if (hasActsOfFaith(s, player)) gainMiracleDie(ctx, player, ACTS_OF_FAITH_CODE)
}

// called wherever a UnitDestroyed event is emitted: the owner of a destroyed ADEPTA SORORITAS unit gains a die
export function onOwnUnitDestroyed(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit || !hasActsOfFaith(s, unit.player)) return
  if (!keywordsOf(s, unitId).includes(FACTION_KEYWORD)) return
  gainMiracleDie(ctx, unit.player, ACTS_OF_FAITH_CODE)
}

// phase end: every player's spentThisPhase = []
export function clearActsOfFaithPhase(state: GameState): void {
  for (const p of Object.values(state.players)) if (p.miracle) p.miracle.spentThisPhase = []
}

// ---------- the roll hook ----------
// the largest Damage the attack's weapon can deal (saves only; null when unknown)
// the distance a charge roll must reach (charge only; null when unknown)
function chargeNeeded(s: GameState, spec: RollSpec): number | null {
  const c = s.phaseState.charge
  if (spec.purpose !== 'charge' || !c || c.unitId !== spec.unitId) return null
  const n = neededChargeDistance(s, c.unitId, c.targetUnitIds)
  return n === null ? null : Math.ceil(n)
}

function weaponDamage(s: GameState, spec: RollSpec): number | null {
  if (spec.purpose !== 'save' || !spec.weaponId) return null
  const w = s.weapons[spec.weaponId]
  if (!w) return null
  const d = parseDiceExpr(w.D)
  return d.flat + (d.sides === null ? 0 : d.count * d.sides)
}

// Called right BEFORE a D6 roll is made (re-entrant, keyed like rollOnce): 'pending' = a `miracleDie` decision is open and
// the caller must return 'pending'; an array = Miracle die values to put in RollSpec.substitute; null = roll normally.
export function miracleGate(ctx: EngineContext, key: string, spec: RollSpec): 'pending' | number[] | null {
  const s = ctx.state
  const doneMark = `miracle:${key}=`
  const done = s.phaseState.marks.find((m) => m.startsWith(doneMark))
  if (done !== undefined) {
    const v = done.slice(doneMark.length)
    return v === 'skip' ? null : v.split(',').map(Number)
  }
  const sides = spec.sides ?? 6
  if (!substitutionEligible(s, { purpose: spec.purpose, player: spec.player, unitId: spec.unitId ?? null, sides })) return null
  if (!ctx.once(`miracleAsk:${key}`)) return null
  const dice = pool(s, spec.player).dice
  const options: { id: string; label: string; action: Action }[] = [
    { id: 'skip', label: 'Roll normally', action: { type: 'chooseOption', player: spec.player, decisionId: '', optionId: 'skip' } },
  ]
  const seen = new Set<number>()
  dice.forEach((v, i) => {
    if (seen.has(v)) return
    seen.add(v)
    options.push({ id: `use:${i}`, label: `Use Miracle die ${v}`, action: { type: 'chooseOption', player: spec.player, decisionId: '', optionId: `use:${i}`, dieIndexes: [i] } })
  })
  ctx.decide({
    kind: 'chooseOption', player: spec.player, window: 'any.rollMade', canPass: false,
    context: {
      topic: 'miracleDie', unitId: spec.unitId ?? null, abilityId: null,
      data: {
        purpose: spec.purpose, unitId: spec.unitId ?? null, count: spec.count ?? 1, maxSubstitutions: 1, pool: [...dice], key,
        // for the AI policy: the target the (modified) roll must reach, the net modifier on it, and the attack's Damage (saves)
        needed: spec.needed ?? chargeNeeded(s, spec), modifier: netModifier(spec.modifiers, spec.modifierCap), damage: weaponDamage(s, spec),
      },
    },
    options,
  })
  return 'pending'
}

// the pool index an answer names: option `use:<i>` (unique per offered die), or the bare `use` with dieIndexes: [i]; null when invalid
function usedIndex(action: Extract<Action, { type: 'chooseOption' }>, poolSize: number): number | null {
  const m = /^use:(\d+)$/.exec(action.optionId)
  const idx = action.dieIndexes
  let i: number
  if (m) {
    i = Number(m[1])
    if (idx !== undefined && (idx.length !== 1 || idx[0] !== i)) return null
  } else if (action.optionId === 'use') {
    if (!idx || idx.length !== 1) return null
    i = idx[0]
  } else return null
  return Number.isInteger(i) && i >= 0 && i < poolSize ? i : null
}

function validateMiracle(state: GameState, action: Action, pending: PendingDecision): Rejection | null {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'a miracleDie decision is answered with chooseOption' }
  if (action.optionId === 'skip') return action.dieIndexes === undefined ? null : { code: 'E_NOT_AN_OPTION', reason: 'skip takes no dieIndexes' }
  if (action.optionId !== 'use' && !/^use:\d+$/.test(action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  const dice = pool(state, pending.player).dice
  if (usedIndex(action, dice.length) === null) {
    return { code: 'E_NOT_AN_OPTION', reason: 'use needs exactly one in-range pool die (option use:<index>)', details: { pool: dice } }
  }
  return null
}

export const miracleHandler: DecisionHandler = {
  validate: validateMiracle,
  handle(ctx, action, pending) {
    const bad = validateMiracle(ctx.state, action, pending)
    if (bad) return bad
    if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return
    const data = pending.context.data as { key: string; unitId: UnitId | null }
    const marks = ctx.state.phaseState.marks
    if (action.optionId === 'skip') {
      marks.push(`miracle:${data.key}=skip`)
    } else {
      const p = pool(ctx.state, pending.player)
      const [value] = p.dice.splice(usedIndex(action, p.dice.length) as number, 1)
      if (data.unitId && !p.spentThisPhase.includes(data.unitId)) p.spentThisPhase.push(data.unitId)
      marks.push(`miracle:${data.key}=${value}`)
    }
    // a Battle-shock test forced by an ability / stratagem is not re-entrant: it left a resume mark, so finish the test now
    const resumePrefix = `bsresume:${data.key}=`
    const resume = marks.find((m) => m.startsWith(resumePrefix))
    if (resume) {
      const [unitId, source, modifier] = resume.slice(resumePrefix.length).split('|')
      marks.splice(marks.indexOf(resume), 1)
      ctx.services.hooks.battleShockTest?.(ctx, unitId, source, Number(modifier))
    }
  },
}
