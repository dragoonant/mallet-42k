// Plain-language copy for the two re-roll prompts (commandReroll, and chooseOption/rerollOffer) —
// "Rolled 1, needs 3+ to save" rather than a bare "[1]".
//
// The engine's DiceRoll record carries the faces but not the threshold they were judged against, and
// the roll's own event is NOT yet in the log when either re-roll decision is raised: ctx.rollOnce
// (engine/reducer.ts) opens the `any.rollMade` window immediately after rolling and before returning
// to the caller that emits HitRolled/WoundRolled/SaveRolled, and attack.ts's rerollOffer likewise
// decides inside the roll-resolution helper, before the same emit. So the newest matching event in
// the log belongs to the PREVIOUS roll — reading `.needed` off it shows a number from the last
// model's save, silently, whenever one exists.
//
// Every threshold therefore comes from game state instead:
//   save    CurrentAttack.saveTargets, which the save stage publishes before it rolls
//   hit     the firing weapon's own skill (BS/WS)
//   wound   the engine's own woundRollNeeded(S, T)
//   charge  the engine's own neededChargeDistance, against the declared targets in phaseState.charge
// Events are still used for the things that are safely in the past — the attack a save belongs to
// was wounded before the save stage began, so naming the attacker from it is sound.
import { woundRollNeeded, modelStats, type DiceRoll, type GameEvent, type GameState } from '@/engine'
import { neededChargeDistance } from '@/engine/phases/charge'

export interface RerollSummary {
  /** Prompt heading, phrased as the question being asked: "Re-roll the armour save?" */
  title: string
  /** The numbers: "Rolled 1 — needs 3+ to save." */
  line: string
  /** Who/what this roll was about, when we can name it: "Assault Intercessors, hit by Shoota Boyz." */
  context: string | null
  /** False when the roll already succeeded (every rerollOffer, and any Command Re-roll offered on a
   *  passed die) — the prompt says so, since re-rolling a success can only lose it. */
  failed: boolean
}

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

/** The wound that led to the save now being rolled — emitted before the save stage, so unlike the
 *  save's own event this one really is in the log. */
function lastWound(events: GameEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'WoundRolled' || e.type === 'AttackAllocated') return e
  }
  return null
}

/** Did the roll make `needed`? An unmodified 6 always succeeds and an unmodified 1 always fails
 *  (R-6.21), which is the whole of the rule for a single-die hit/wound/save. */
function passes(roll: DiceRoll, needed: number): boolean {
  const die = roll.dice[0] ?? 0
  if (die === 6) return true
  if (die === 1) return false
  return (roll.final[0] ?? die) >= needed
}

/** The wound threshold, from the weapon's Strength against the target's Toughness — the engine's own
 *  table, not a second copy of it. */
function woundNeeded(state: GameState, roll: DiceRoll): number | null {
  const weapon = roll.weaponId ? state.weapons[roll.weaponId] : undefined
  const target = roll.targetUnitId ? state.units[roll.targetUnitId] : undefined
  const model = target ? state.models[target.models[0]] : undefined
  if (!weapon || !model) return null
  try {
    return woundRollNeeded(weapon.S, modelStats(state, model).T)
  } catch {
    return null
  }
}

/** One sentence naming the unit the roll belongs to, and the attack it is caught up in. */
function attackContext(state: GameState, attacker: string | null, weapon: string | null, target: string | null): string | null {
  if (!attacker) return null
  const gun = weapon ? ` (${weapon})` : ''
  return target ? `${attacker}${gun} vs ${target}.` : `${attacker}${gun}.`
}

export function rerollSummary(state: GameState, events: GameEvent[], roll: DiceRoll): RerollSummary {
  switch (roll.purpose) {
    case 'save': {
      // The save being made right now: kind from the choice (or armour when there was none), target
      // from what the engine published before rolling. The attack it belongs to comes from the log,
      // which is sound — the wound was rolled before this save stage started.
      const cur = state.phaseState?.attack?.current ?? null
      const kind = cur?.save?.kind === 'invuln' ? 'invuln' : 'armour'
      const needed = kind === 'invuln' ? (cur?.saveTargets?.invuln ?? null) : (cur?.saveTargets?.armour ?? null)
      const wound = lastWound(events)
      const attacker = wound ? unitName(state, wound.attack.attackerUnitId) : null
      const gun = wound ? weaponName(state, wound.attack.weaponId) : null
      const who = unitName(state, roll.unitId)
      const cover = kind === 'armour' && cur?.saveTargets?.cover ? ' (cover counted)' : ''
      return {
        title: `Re-roll the ${kind === 'invuln' ? 'invulnerable' : 'armour'} save?`,
        line: needed === null
          ? `Rolled ${shown(roll)} on a save.`
          : `Rolled ${shown(roll)} — needs ${needed}+ to save${cover}.`,
        context: who ? `${who}${attacker ? `, hit by ${attacker}${gun ? ` (${gun})` : ''}` : ''}.` : null,
        failed: needed === null ? true : !passes(roll, needed),
      }
    }
    case 'hit': {
      // The weapon's own skill (BS/WS) is the number the player needs; HitRolled would not be in the
      // log yet even if it carried one.
      const skill = roll.weaponId ? state.weapons[roll.weaponId]?.skill : null
      return {
        title: 'Re-roll the hit roll?',
        line: typeof skill === 'number' ? `Rolled ${shown(roll)} — needs ${skill}+ to hit.` : `Rolled ${shown(roll)} to hit.`,
        context: attackContext(state, unitName(state, roll.unitId), weaponName(state, roll.weaponId), unitName(state, roll.targetUnitId)),
        failed: typeof skill === 'number' ? !passes(roll, skill) : true,
      }
    }
    case 'wound': {
      const target = unitName(state, roll.targetUnitId)
      const needed = woundNeeded(state, roll)
      return {
        title: 'Re-roll the wound roll?',
        line: needed === null
          ? `Rolled ${shown(roll)} to wound.`
          : `Rolled ${shown(roll)} — needs ${needed}+ to wound${target ? ` ${target}` : ''}.`,
        context: attackContext(state, unitName(state, roll.unitId), weaponName(state, roll.weaponId), target),
        failed: needed === null ? true : !passes(roll, needed),
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
          : `Rolled ${shown(roll)} = ${total}" — needs ${Math.max(2, Math.ceil(needed))} (${needed.toFixed(1)}") to reach.`,
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

/** Whether re-rolling an *already successful* roll could still pay off — the only reason to take a
 *  rerollOffer (attack.ts and charge.ts only raise it when the roll passed). A hit is worth re-rolling
 *  for a critical when the weapon has SUSTAINED HITS or LETHAL HITS, a wound when it has DEVASTATING
 *  WOUNDS; a die that already came up 6 has the crit in hand, so there is nothing left to chase.
 *  Anything else (a charge that is already in reach, a plain hit or wound) can only get worse, so the
 *  client answers "keep" for the player — see maybeAutoAnswerReroll in store/game.ts. */
export function critWouldPay(state: GameState, roll: DiceRoll): boolean {
  if (roll.purpose !== 'hit' && roll.purpose !== 'wound') return false
  if (roll.dice.length !== 1 || roll.dice[0] === 6) return false
  const weapon = roll.weaponId ? state.weapons[roll.weaponId] : null
  if (!weapon) return false
  const wanted = roll.purpose === 'hit' ? ['SUSTAINED_HITS', 'LETHAL_HITS'] : ['DEVASTATING_WOUNDS']
  return weapon.abilities.some((a) => wanted.includes(a.ability))
}

/** The roll a rerollOffer decision is about: the engine hands the client only its id, and the roll it
 *  names is the one still sitting in phaseState (stratagems.ts's rollFor makes the same assumption). */
export function rollForOffer(state: GameState, data: Record<string, unknown>): DiceRoll | null {
  const last = state.phaseState.lastRoll
  return last && last.id === data.rollId ? last : null
}
