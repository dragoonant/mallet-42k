// Adepta Sororitas Acts of Faith (docs/spec/factions/adepta-sororitas.md §7 E1): the Miracle dice pool, turn-start / unit
// destroyed gain, and substituting a pool die for a D6 roll. The faction file re-exports this (factions/adepta-sororitas.ts);
// the roll hook points live in the reducer (rollOnce) and attack.ts (rollBatchD6) via `miracleGate`.
import type { Action } from './actions'
import type { DecisionHandler, EngineContext } from './modules'
import { leaderService } from './leaders'
import { neededChargeDistance } from './phases/charge'
import { keywordsOf } from './state'
import { EngineInvariantError } from './types'
import type { GameState, PendingDecision, PlayerId, Rejection, RollPurpose, TimingWindowId, UnitId } from './types'
import { netModifier, parseDiceExpr, type RollSpec } from './dice'

export const ACTS_OF_FAITH_CODE = 'actsOfFaith'
// Aeldari Strands of Fate (docs/spec/factions/aeldari.md E1): the same pool, called the Fate pool, with no faction-keyword
// test and no per-phase cap; a fast-rolled batch may take one die per attack
export const STRANDS_OF_FATE_CODE = 'strandsOfFate'
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

// true iff any of the player's units (any location) has a datasheet ability with code strandsOfFate
export function hasStrandsOfFate(state: GameState, player: PlayerId): boolean {
  for (const u of Object.values(state.units)) {
    if (u.player !== player) continue
    for (const id of state.datasheets[u.datasheetId]?.abilities ?? []) if (state.abilities[id]?.code === STRANDS_OF_FATE_CODE) return true
  }
  return false
}

// true iff either half of the (canonical) unit carries an ability with code strandsOfFate
export function unitHasStrandsOfFate(state: GameState, unitId: UnitId): boolean {
  if (!state.units[unitId]) return false
  for (const half of leaderService.halves(state, unitId)) {
    const u = state.units[half]
    if (!u) continue
    for (const id of state.datasheets[u.datasheetId]?.abilities ?? []) if (state.abilities[id]?.code === STRANDS_OF_FATE_CODE) return true
  }
  return false
}

// 'Fate' for an Aeldari player, else 'Miracle' (option labels: "Use Fate die 4")
export function diePoolName(state: GameState, player: PlayerId): 'Fate' | 'Miracle' {
  return hasStrandsOfFate(state, player) ? 'Fate' : 'Miracle'
}

// replaces the player's pool with `values` (each 1..6); emits one MiracleDieGained per die. Never triggers the Saintly Relic re-roll.
export function setFatePool(ctx: EngineContext, player: PlayerId, values: number[], source: string): void {
  for (const v of values) if (!Number.isInteger(v) || v < 1 || v > 6) throw new EngineInvariantError('setFatePool: every value must be 1..6', { values })
  const p = pool(ctx.state, player)
  p.dice = [...values]
  for (const value of values) ctx.emit({ type: 'MiracleDieGained', player, value, source })
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
  // E-PEN1: a Saintly Relic bearer may re-roll each die the moment it is gained (offered at the next timing window)
  if (source !== MIRACLE_REROLL_SOURCE && miracleRerollOnGain(s, player)) rerollPending(s, player).push(v)
  return v
}

// ---------- E-PEN1: Saintly Relic - re-roll a Miracle die on gain ----------
export const SAINTLY_RELIC_CODE = 'saintlyRelic'
export const MIRACLE_REROLL_SOURCE = 'saintlyRelicReroll'

function relicBearer(s: GameState, player: PlayerId): { abilityId: string; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== SAINTLY_RELIC_CODE || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    const unit = model ? s.units[model.unitId] : undefined
    if (unit && unit.player === player && unit.location === 'board') return { abilityId: a.id, unitId: unit.id }
  }
  return null
}

// true iff `player` has a Saintly Relic bearer alive on the battlefield
export function miracleRerollOnGain(state: GameState, player: PlayerId): boolean {
  return relicBearer(state, player) !== null
}

function rerollPending(state: GameState, player: PlayerId): number[] {
  const ss = state.players[player].secondaryState
  if (!Array.isArray(ss.miracleRerollPending)) ss.miracleRerollPending = []
  return ss.miracleRerollPending as number[]
}

// Raises ONE keep / reroll decision for the oldest queued gain, if any and none is open. Values whose die was already
// spent are dropped silently; with the bearer gone the whole queue is cleared. True when a decision was opened.
export function offerMiracleRerolls(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (s.pending) return false
  for (const player of Object.keys(s.players) as PlayerId[]) {
    const queue = rerollPending(s, player)
    if (queue.length === 0) continue
    const bearer = relicBearer(s, player)
    if (!bearer) { queue.length = 0; continue }
    while (queue.length > 0 && !pool(s, player).dice.includes(queue[0])) queue.shift()
    if (queue.length === 0) continue
    const value = queue[0]
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: bearer.unitId, abilityId: bearer.abilityId, data: { code: 'saintlyRelicReroll', value, window, key } },
      options: [
        { id: 'keep', label: `Keep the Miracle die (${value})`, action: { type: 'chooseOption', player, decisionId: '', optionId: 'keep' }, hint: { value: value >= 4 ? 1 : 0 } },
        { id: 'reroll', label: `Re-roll the Miracle die (${value})`, action: { type: 'chooseOption', player, decisionId: '', optionId: 'reroll' }, hint: { value: value <= 3 ? 1 : 0 } },
      ],
    })
    return true
  }
  return false
}

export function answerMiracleReroll(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'a Saintly Relic offer is answered with chooseOption' }
  if (action.optionId !== 'keep' && action.optionId !== 'reroll') return { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  const s = ctx.state
  const player = pending.player
  const queue = rerollPending(s, player)
  const value = queue.shift()
  if (value === undefined || action.optionId === 'keep') return
  const dice = pool(s, player).dice
  const i = dice.indexOf(value)
  if (i < 0) return
  dice.splice(i, 1) // replaced, not spent: no MiracleDieSpent
  gainMiracleDie(ctx, player, MIRACLE_REROLL_SOURCE)
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
  const p = pool(state, spec.player)
  if (p.dice.length === 0) return false
  // Strands of Fate (Aeldari): no keyword test, no per-phase cap
  if (unitHasStrandsOfFate(state, unit.id)) return true
  if (!hasActsOfFaith(state, spec.player)) return false
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
export function miracleGate(ctx: EngineContext, key: string, spec: RollSpec, batch = false): 'pending' | number[] | null {
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
  const poolName = diePoolName(s, spec.player)
  // Strands of Fate: a fast-rolled batch of N attacks takes up to one die per attack; every other roll (2D6 included) takes 1
  const maxSubstitutions = batch && spec.unitId && unitHasStrandsOfFate(s, spec.unitId) ? Math.max(1, Math.min(spec.count ?? 1, dice.length)) : 1
  const options: { id: string; label: string; action: Action }[] = [
    { id: 'skip', label: 'Roll normally', action: { type: 'chooseOption', player: spec.player, decisionId: '', optionId: 'skip' } },
  ]
  const seen = new Set<number>()
  dice.forEach((v, i) => {
    if (seen.has(v)) return
    seen.add(v)
    options.push({ id: `use:${i}`, label: `Use ${poolName} die ${v}`, action: { type: 'chooseOption', player: spec.player, decisionId: '', optionId: `use:${i}`, dieIndexes: [i] } })
  })
  ctx.decide({
    kind: 'chooseOption', player: spec.player, window: 'any.rollMade', canPass: false,
    context: {
      topic: 'miracleDie', unitId: spec.unitId ?? null, abilityId: null,
      data: {
        purpose: spec.purpose, unitId: spec.unitId ?? null, count: spec.count ?? 1, maxSubstitutions, pool: [...dice], key,
        // for the AI policy: the target the (modified) roll must reach, the net modifier on it, and the attack's Damage (saves)
        needed: spec.needed ?? chargeNeeded(s, spec), modifier: netModifier(spec.modifiers, spec.modifierCap), damage: weaponDamage(s, spec),
      },
    },
    options,
  })
  return 'pending'
}

// the pool indexes an answer names: option `use:<i>` (unique per offered die), or the bare `use` with dieIndexes; null when
// invalid (1..maxSubstitutions distinct in-range indexes)
function usedIndexes(action: Extract<Action, { type: 'chooseOption' }>, poolSize: number, maxSubstitutions: number): number[] | null {
  const m = /^use:(\d+)$/.exec(action.optionId)
  const idx = action.dieIndexes
  let list: number[]
  if (m) {
    list = [Number(m[1])]
    if (idx !== undefined && (idx.length !== 1 || idx[0] !== list[0])) return null
  } else if (action.optionId === 'use') {
    if (!idx || idx.length < 1) return null
    list = [...idx]
  } else return null
  if (list.length > maxSubstitutions || new Set(list).size !== list.length) return null
  return list.every((i) => Number.isInteger(i) && i >= 0 && i < poolSize) ? list : null
}

function maxSubsOf(pending: PendingDecision): number {
  const m = pending.kind === 'chooseOption' ? (pending.context.data as { maxSubstitutions?: number } | undefined)?.maxSubstitutions : undefined
  return typeof m === 'number' && m >= 1 ? m : 1
}

function validateMiracle(state: GameState, action: Action, pending: PendingDecision): Rejection | null {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'a miracleDie decision is answered with chooseOption' }
  if (action.optionId === 'skip') return action.dieIndexes === undefined ? null : { code: 'E_NOT_AN_OPTION', reason: 'skip takes no dieIndexes' }
  if (action.optionId !== 'use' && !/^use:\d+$/.test(action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  const dice = pool(state, pending.player).dice
  const max = maxSubsOf(pending)
  if (usedIndexes(action, dice.length, max) === null) {
    return { code: 'E_NOT_AN_OPTION', reason: `use needs between 1 and ${max} distinct in-range pool dice (option use:<index>)`, details: { pool: dice, maxSubstitutions: max } }
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
      const idxs = usedIndexes(action, p.dice.length, maxSubsOf(pending)) as number[]
      const values = idxs.map((i) => p.dice[i])
      // remove from the highest index down so the lower ones stay valid; substitution order follows the answer's order
      for (const i of [...idxs].sort((a, b) => b - a)) p.dice.splice(i, 1)
      if (data.unitId && !p.spentThisPhase.includes(data.unitId)) p.spentThisPhase.push(data.unitId)
      marks.push(`miracle:${data.key}=${values.join(',')}`)
    }
    // a Battle-shock test forced by an ability / stratagem is not re-entrant: it left a resume mark, so finish the test now
    const resumePrefix = `bsresume:${data.key}=`
    const resume = marks.find((m) => m.startsWith(resumePrefix))
    if (resume) {
      const [unitId, source, modifier] = resume.slice(resumePrefix.length).split('|')
      marks.splice(marks.indexOf(resume), 1)
      ctx.services.hooks.battleShockTest?.(ctx, unitId, source, Number(modifier))
    }
    // RC-ADE-23: tests queued behind this offer run next, one at a time; a queued test may open its own Miracle offer
    for (;;) {
      if (ctx.state.pending) break
      const q = marks.findIndex((m) => m.startsWith('bsqueue:'))
      if (q < 0) break
      const [unitId, source, modifier] = marks.splice(q, 1)[0].slice('bsqueue:'.length).split('|')
      ctx.services.hooks.battleShockTest?.(ctx, unitId, source, Number(modifier))
    }
  },
}
