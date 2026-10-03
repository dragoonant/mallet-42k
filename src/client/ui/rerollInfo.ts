// Plain-language copy and the die-by-die model for the two re-roll prompts (commandReroll, and
// chooseOption/rerollOffer) — "Rolled 6 dice — needs 3+ to hit. 2 of 6 failed." rather than a bare list.
//
// Hit/wound/save rolls are fast-rolled in batches (docs/spec/00-architecture.md §3): the decision is
// raised before the batch's per-die HitRolled/WoundRolled/SaveRolled events exist, so nothing here reads
// those from the log. The roll itself carries the faces (already-re-rolled dice included) and, for those
// three purposes, `needed` — the d6 each die has to reach. Charge rolls still read their own ChargeRolled
// event, which is emitted before the offer.
import type { Action, ChooseOptionDecision, CommandRerollDecision, DiceRoll, GameEvent, GameState } from '@/engine'
import { neededChargeDistance } from '@/engine/phases/charge'

export interface RerollSummary {
  /** Prompt heading, phrased as the question being asked: "Re-roll the armour save?" */
  title: string
  /** The numbers: "Rolled 1 — needs 3+ to save." */
  line: string
  /** Who/what this roll was about, when we can name it: "Assault Intercessors, hit by Shoota Boyz." */
  context: string | null
  /** False when every die already succeeded (every rerollOffer, and any Command Re-roll offered on a
   *  passed roll) — the prompt says so, since re-rolling a success can only lose it. */
  failed: boolean
}

export type DieOutcome = 'success' | 'fail' | 'neutral'

function unitName(state: GameState, id: string | null | undefined): string | null {
  if (!id) return null
  return state.units[id]?.name ?? null
}

function weaponName(state: GameState, id: string | null | undefined): string | null {
  if (!id) return null
  return state.weapons[id]?.name ?? null
}

/** "1", or "1 (2 after modifiers)" when the roll carries a net modifier; "3 + 5" for a 2D6 sum. */
function shown(roll: DiceRoll): string {
  if (roll.dice.length !== 1) return roll.dice.join(' + ')
  const die = roll.dice[0]
  const final = roll.final[0]
  return final !== undefined && final !== die ? `${die} (${final} after modifiers)` : `${die}`
}

/** Events that genuinely are in the log by the time a re-roll is offered — the ones from a stage
 *  that already finished. Never use one of these for the roll currently being decided. */
function lastOfType<T extends GameEvent['type']>(events: GameEvent[], type: T) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === type) return e as Extract<GameEvent, { type: T }>
  }
  return null
}

/** One sentence naming the unit the roll belongs to, and the attack it is caught up in. */
function attackContext(attacker: string | null, weapon: string | null, target: string | null): string | null {
  if (!attacker) return null
  const gun = weapon ? ` (${weapon})` : ''
  return target ? `${attacker}${gun} vs ${target}.` : `${attacker}${gun}.`
}

/** Who is attacking a save roll's unit with that weapon, from the newest attack event that names both. */
function attackerOf(state: GameState, events: GameEvent[], roll: DiceRoll): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if ((e.type === 'HitRolled' || e.type === 'WoundRolled' || e.type === 'SaveRolled' || e.type === 'AttackAllocated')
      && e.attack.targetUnitId === roll.unitId && (!roll.weaponId || e.attack.weaponId === roll.weaponId)) {
      return unitName(state, e.attack.attackerUnitId)
    }
  }
  return null
}

/** The d6 each die of a hit/wound/save roll has to reach: the engine's own number, else (hit only) the
 *  weapon's skill. Null when it can't be told. */
export function neededFor(state: GameState, roll: DiceRoll, override?: number | null): number | null {
  if (typeof override === 'number') return override
  if (typeof roll.needed === 'number') return roll.needed
  if (roll.purpose === 'hit') {
    const skill = roll.weaponId ? state.weapons[roll.weaponId]?.skill : null
    return typeof skill === 'number' ? skill : null
  }
  return null
}

/** Pass/fail for each die of the roll as it stands (re-rolled dice at their new faces). Hit and wound
 *  dice: an unmodified 1 always fails and a 6 always succeeds; saves: a 1 always fails. A charge is one
 *  result for both dice (their total against the distance still to close). Everything else is neutral.
 *  Per-die modifiers the engine applies from hooks are not visible here, so this is a display aid — the
 *  engine's own events decide the actual outcome. */
export function dieOutcomes(state: GameState, events: GameEvent[], roll: DiceRoll, neededOverride?: number | null): DieOutcome[] {
  const n = roll.dice.length
  if (roll.purpose === 'charge') {
    const e = lastOfType(events, 'ChargeRolled')
    if (!e || e.needed === null) return roll.dice.map(() => 'neutral')
    const ok = e.total >= Math.ceil(e.needed)
    return roll.dice.map(() => (ok ? 'success' : 'fail'))
  }
  if (roll.purpose !== 'hit' && roll.purpose !== 'wound' && roll.purpose !== 'save') return roll.dice.map(() => 'neutral')
  const needed = neededFor(state, roll, neededOverride)
  if (needed === null) return Array.from({ length: n }, () => 'neutral' as DieOutcome)
  const sixWins = roll.purpose !== 'save'
  return roll.dice.map((v) => (v === 1 ? 'fail' : (sixWins && v === 6) || v >= needed ? 'success' : 'fail'))
}

export function rerollSummary(state: GameState, events: GameEvent[], roll: DiceRoll): RerollSummary {
  switch (roll.purpose) {
    case 'save':
    case 'hit':
    case 'wound': {
      const kind = roll.purpose
      const needed = neededFor(state, roll)
      const out = dieOutcomes(state, events, roll)
      const n = roll.dice.length
      const failedCount = out.filter((o) => o === 'fail').length
      const verb = kind === 'hit' ? 'hit' : kind === 'wound' ? 'wound' : 'save'
      const noun = kind === 'hit' ? 'hit roll' : kind === 'wound' ? 'wound roll' : 'save'
      const target = unitName(state, roll.targetUnitId)
      const rolled = n === 1 ? `Rolled ${shown(roll)}` : `Rolled ${n} dice`
      const tail = n > 1 && needed !== null ? ` ${failedCount} of ${n} failed.` : ''
      const line = needed !== null
        ? `${rolled} — needs ${needed}+ to ${verb}${kind === 'wound' && target ? ` ${target}` : ''}.${tail}`
        : `${rolled} to ${verb}.`
      let context: string | null
      if (kind === 'save') {
        const who = unitName(state, roll.unitId)
        const attacker = attackerOf(state, events, roll)
        const gun = weaponName(state, roll.weaponId)
        context = who ? `${who}${attacker ? `, hit by ${attacker}${gun ? ` (${gun})` : ''}` : ''}.` : null
      } else {
        context = attackContext(unitName(state, roll.unitId), weaponName(state, roll.weaponId), target)
      }
      return {
        title: n === 1 ? `Re-roll the ${noun}?` : `Re-roll ${noun}s?`,
        line,
        context,
        failed: out.some((o) => o !== 'success'),
      }
    }
    case 'charge': {
      const who = unitName(state, roll.unitId)
      const total = roll.final.length > 0 ? roll.final.reduce((a, b) => a + b, 0) : roll.dice.reduce((a, b) => a + b, 0)
      // The declared targets are still on the charge state; the distance is the engine's own.
      const charge = state.phaseState?.charge ?? null
      const needed =
        charge && charge.unitId === roll.unitId ? neededChargeDistance(state, charge.unitId, charge.targetUnitIds) : null
      return {
        title: 'Re-roll the charge?',
        line: needed === null
          ? `Rolled ${shown(roll)} = ${total}" — no target is in reach.`
          : `Rolled ${shown(roll)} = ${total}" — needs ${Math.max(2, Math.ceil(needed))}+ to reach.`,
        context: who ? `${who} is charging.` : null,
        failed: needed === null || total < needed,
      }
    }
    case 'fnp': {
      const e = lastOfType(events, 'FeelNoPainRolled')
      return {
        title: 'Re-roll Feel No Pain?',
        line: e ? `Rolled ${shown(roll)} — needs ${e.needed}+ to shrug off the damage.` : `Rolled ${shown(roll)} for Feel No Pain.`,
        context: unitName(state, roll.unitId),
        failed: e ? !e.ignored : true,
      }
    }
    case 'advance': {
      return {
        title: 'Re-roll the Advance?',
        line: `Rolled ${shown(roll)} — that many extra inches of movement.`,
        context: unitName(state, roll.unitId),
        failed: false,
      }
    }
    case 'desperateEscape': {
      const e = lastOfType(events, 'DesperateEscapeRolled')
      return {
        title: 'Re-roll Desperate Escape?',
        line: e && e.casualties > 0
          ? `Rolled ${shown(roll)} — ${e.casualties} model${e.casualties === 1 ? '' : 's'} lost on the way out.`
          : `Rolled ${shown(roll)} — needs 2+ per model to escape unharmed.`,
        context: unitName(state, roll.unitId),
        failed: !!e && e.casualties > 0,
      }
    }
    case 'hazardous': {
      const e = lastOfType(events, 'HazardousTested')
      return {
        title: 'Re-roll the Hazardous test?',
        line: `Rolled ${shown(roll)} — needs 2+ or the weapon wounds its own bearer.`,
        context: unitName(state, roll.unitId),
        failed: e ? e.failed : true,
      }
    }
    default: {
      return {
        title: 'Re-roll?',
        line: `Rolled ${shown(roll)}.`,
        context: unitName(state, roll.unitId),
        failed: true,
      }
    }
  }
}

/** Whether re-rolling *already successful* dice could still pay off — the only reason to take a
 *  rerollOffer (the engine only offers dice that passed). A hit is worth re-rolling for a critical when
 *  the weapon has SUSTAINED HITS or LETHAL HITS, a wound when it has DEVASTATING WOUNDS; a die that
 *  already came up 6 has the crit in hand, so there is nothing left to chase. `dieIndexes` narrows the
 *  check to the dice actually on offer. Anything else (a charge already in reach, a plain hit or wound)
 *  can only get worse, so the client answers "keep" for the player — see maybeAutoAnswerReroll. */
export function critWouldPay(state: GameState, roll: DiceRoll, dieIndexes?: number[]): boolean {
  if (roll.purpose !== 'hit' && roll.purpose !== 'wound') return false
  const weapon = roll.weaponId ? state.weapons[roll.weaponId] : null
  if (!weapon) return false
  const wanted = roll.purpose === 'hit' ? ['SUSTAINED_HITS', 'LETHAL_HITS'] : ['DEVASTATING_WOUNDS']
  if (!weapon.abilities.some((a) => wanted.includes(a.ability))) return false
  const considered = dieIndexes ?? roll.dice.map((_, i) => i)
  return considered.some((i) => roll.dice[i] !== undefined && roll.dice[i] !== 6)
}

/** The roll a rerollOffer decision is about: the engine hands the client only its id, and the roll it
 *  names is the one still sitting in phaseState (stratagems.ts's rollFor makes the same assumption). */
export function rollForOffer(state: GameState, data: Record<string, unknown>): DiceRoll | null {
  const last = state.phaseState.lastRoll
  return last && last.id === data.rollId ? last : null
}

/** The dice a rerollOffer may re-roll: the offered indexes, kept to dice that exist. */
export function offerIndexes(roll: DiceRoll, data: Record<string, unknown>): number[] {
  const raw = Array.isArray(data.dieIndexes) ? (data.dieIndexes as unknown[]) : roll.dice.map((_, i) => i)
  return raw.filter((i): i is number => typeof i === 'number' && i >= 0 && i < roll.dice.length)
}

export type RerollMode =
  /** Any offered die may be toggled; the player re-rolls the chosen set (a free ability re-roll). */
  | 'many'
  /** Exactly one die is chosen (the Command Re-roll stratagem re-rolls one die of a batch). */
  | 'one'
  /** The whole roll is re-rolled at once — a single die, or a roll the rules re-roll as a unit. */
  | 'whole'

export interface RerollTrayModel {
  mode: RerollMode
  /** The stratagem costs CP; an ability's own offer is free. */
  free: boolean
  rollId: string
  /** Faces as they stand now. */
  dice: number[]
  outcomes: DieOutcome[]
  /** Dice the player may pick (many/one), or that the answer re-rolls (whole). */
  selectable: number[]
  /** Dice that were already re-rolled — shown locked, never offered again. */
  locked: number[]
  /** The selectable dice that currently fail. */
  failedSelectable: number[]
  /** The action to dispatch for a re-roll of `picked` dice (ignored for 'whole'); null when none is legal. */
  reroll: (picked: number[]) => Action | null
}

/** Everything the interactive dice tray needs about a human-owned re-roll decision, or null when the
 *  decision is not a re-roll or its roll can't be identified. */
export function rerollTrayModel(
  state: GameState, events: GameEvent[], pending: CommandRerollDecision | ChooseOptionDecision, roll: DiceRoll,
): RerollTrayModel | null {
  const locked = [...(roll.rerolled ?? [])]
  if (pending.kind === 'commandReroll') {
    const byDie = new Map<number, Action>()
    let whole: Action | null = null
    for (const o of pending.options) {
      if (o.action.type !== 'commandReroll') continue
      if (o.action.dieIndex === undefined) whole = whole ?? o.action
      else byDie.set(o.action.dieIndex, o.action)
    }
    const outcomes = dieOutcomes(state, events, roll)
    const selectable = pending.context.selectableDice ? [...byDie.keys()].sort((a, b) => a - b) : roll.dice.map((_, i) => i).filter((i) => !locked.includes(i))
    return {
      mode: pending.context.selectableDice ? 'one' : 'whole',
      free: false,
      rollId: roll.id,
      dice: [...roll.dice],
      outcomes,
      selectable,
      locked,
      failedSelectable: selectable.filter((i) => outcomes[i] === 'fail'),
      reroll: (picked) => (pending.context.selectableDice ? (picked.length === 1 ? byDie.get(picked[0]) ?? null : null) : whole),
    }
  }
  if (pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer') {
    const data = pending.context.data
    const eligible = offerIndexes(roll, data)
    const outcomes = dieOutcomes(state, events, roll, typeof data.needed === 'number' ? data.needed : null)
    const offer = (pending.options ?? []).find((o) => o.id === 'reroll')
    const perDie = (data.purpose === 'hit' || data.purpose === 'wound') && eligible.length > 1
    return {
      mode: perDie ? 'many' : 'whole',
      free: true,
      rollId: roll.id,
      dice: [...roll.dice],
      outcomes,
      selectable: eligible,
      locked,
      failedSelectable: eligible.filter((i) => outcomes[i] === 'fail'),
      reroll: (picked) => {
        if (!offer || offer.action.type !== 'chooseOption') return null
        // 'whole' leaves dieIndexes off: absent means every offered die.
        return perDie ? { ...offer.action, dieIndexes: [...picked].sort((a, b) => a - b) } : offer.action
      },
    }
  }
  return null
}
