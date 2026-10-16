// C4 (docs/spec/factions/thousand-sons.md §7.1): "set one die to its maximum" offers (Glimpse of Eternity). A code hook with the
// optional `fixRoll` member says it may fix a die of a roll; this module raises the keep / fix decision, applies the answer and
// records the once-per-turn use. Not a re-roll: the fixed die is marked re-rolled afterwards so nothing can touch it again.
import { codeHookFor, sourcesFor } from './hooks-impl'
import type { Action } from './actions'
import type { DecisionHandler, EngineContext } from './modules'
import type { DiceRoll, GameState, PendingDecision, Rejection } from './types'

export const FIX_ROLL_TOPIC = 'fixRollOffer'
export interface FixRollOffer { sourceAbilityId: string; value: number; usedKey: string }

// every live source whose hook.fixRoll returns non-null for this roll (de-duplicated by usedKey)
export function fixRollOffers(state: GameState, roll: DiceRoll): FixRollOffer[] {
  const out: FixRollOffer[] = []
  for (const entry of sourcesFor(state)) {
    const spec = codeHookFor(entry.code)
    if (!spec?.fixRoll || entry.active) continue
    const r = spec.fixRoll(state, entry, roll)
    if (!r || out.some((o) => o.usedKey === r.usedKey)) continue
    out.push({ sourceAbilityId: entry.source.id, value: r.value, usedKey: r.usedKey })
  }
  return out
}

const markPrefix = (key: string): string => `fixRoll:${key}=`

function currentRoll(state: GameState, roll: DiceRoll): DiceRoll {
  const last = state.phaseState.lastRoll
  return last && last.id === roll.id ? last : roll
}

// Re-entrant like miracleGate / the oneDie offer: called after a roll (and its Command Re-roll window) is final. 'pending' while
// the decision is open; otherwise the (possibly changed) roll. `indexes` are the dice that may be fixed.
export function fixRollGate(ctx: EngineContext, key: string, roll: DiceRoll, indexes: number[]): 'pending' | DiceRoll {
  const s = ctx.state
  if (s.phaseState.marks.some((m) => m.startsWith(markPrefix(key)))) return currentRoll(s, roll)
  const cur = currentRoll(s, roll)
  const offer = fixRollOffers(s, cur)[0]
  if (!offer) return cur
  const value = cur.sides === 3 ? Math.min(3, offer.value) : offer.value
  const candidates = indexes.filter((i) => i >= 0 && i < cur.dice.length && cur.dice[i] !== value)
  if (candidates.length === 0) return cur
  const player = cur.player
  ctx.decide({
    kind: 'chooseOption', player, window: 'any.rollMade', canPass: false,
    context: {
      topic: FIX_ROLL_TOPIC, unitId: cur.unitId, abilityId: offer.sourceAbilityId,
      data: { rollId: cur.id, purpose: cur.purpose, dieIndexes: candidates, value, key, offer },
    },
    options: [
      ...candidates.map((i) => ({ id: `fix:${i}`, label: `Set die ${i + 1} (${cur.dice[i]}) to ${value}`, action: { type: 'chooseOption', player, decisionId: '', optionId: `fix:${i}` } as Action })),
      { id: 'keep', label: 'Keep the roll', action: { type: 'chooseOption', player, decisionId: '', optionId: 'keep' } as Action },
    ],
  })
  return 'pending'
}

// sets dice[index] to the offer's value (3 on a D3), marks it re-rolled, emits DiceRerolled and records the once-per-turn use
export function applyFixRoll(ctx: EngineContext, roll: DiceRoll, index: number, offer: FixRollOffer): DiceRoll {
  const s = ctx.state
  const value = roll.sides === 3 ? Math.min(3, offer.value) : offer.value
  const before = roll.dice[index]
  const dice = [...roll.dice]
  dice[index] = value
  const final = [...roll.final]
  final[index] = value + ((roll.final[index] ?? before) - before)
  const next: DiceRoll = { ...roll, dice, final, rerolled: [...new Set([...(roll.rerolled ?? []), index])] }
  if (s.phaseState.lastRoll?.id === roll.id) s.phaseState.lastRoll = next
  ctx.emit({ type: 'DiceRerolled', rollId: roll.id, source: offer.sourceAbilityId, before: [before], after: [value], indexes: [index], player: roll.player })
  s.players[roll.player].secondaryState[offer.usedKey] = `${s.round}:${s.activePlayer}`
  return next
}

export const fixRollHandler: DecisionHandler = {
  handle(ctx, action: Action, pending: PendingDecision): Rejection | void {
    if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'a fix-a-die offer is answered with chooseOption' }
    const data = pending.context.data as { rollId: string; key: string; offer: FixRollOffer }
    const marks = ctx.state.phaseState.marks
    if (action.optionId === 'keep') { marks.push(`${markPrefix(data.key)}keep`); return }
    const m = /^fix:(\d+)$/.exec(action.optionId)
    const roll = ctx.state.phaseState.lastRoll
    if (!m || !roll || roll.id !== data.rollId) return { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
    const index = Number(m[1])
    applyFixRoll(ctx, roll, index, data.offer)
    marks.push(`${markPrefix(data.key)}${index}`)
  },
}
