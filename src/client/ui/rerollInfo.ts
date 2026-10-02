// Plain-language copy for the two re-roll prompts (commandReroll, and chooseOption/rerollOffer) —
// "Rolled 1, needs 3+ to save" rather than a bare "[1]".
//
// The engine's DiceRoll record carries the faces but not the threshold they were judged against, so
// every number a player actually wants comes from the roll's own event: SaveRolled.needed,
// WoundRolled.needed, FeelNoPainRolled.needed, ChargeRolled.needed. Those events are always already in
// the log by the time the decision is raised — stratagems.ts's openCommandReroll and attack.ts's
// rerollOffer both decide() inside the same step() that emitted them (the same assumption
// commandRerollMatters() in store/game.ts makes). Hit rolls are the one exception: HitRolled has no
// `needed`, so the threshold comes from the firing weapon's skill instead.
import type { DiceRoll, GameEvent, GameState } from '@/engine'

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

function lastSave(events: GameEvent[], modelId: string | null) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'SaveRolled' && (modelId === null || e.modelId === modelId)) return e
  }
  return null
}

function lastAttackRoll<T extends 'HitRolled' | 'WoundRolled'>(events: GameEvent[], type: T, roll: DiceRoll) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type !== type) continue
    // `type` is generic, so the check above doesn't narrow `e` on its own — both candidate events carry
    // the same AttackRollContext, which is all this match needs.
    const attack = (e as Extract<GameEvent, { type: 'HitRolled' | 'WoundRolled' }>).attack
    if (roll.unitId && attack.attackerUnitId !== roll.unitId) continue
    if (roll.weaponId && attack.weaponId !== roll.weaponId) continue
    return e as Extract<GameEvent, { type: T }>
  }
  return null
}

function lastOfType<T extends GameEvent['type']>(events: GameEvent[], type: T) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === type) return e as Extract<GameEvent, { type: T }>
  }
  return null
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
      const e = lastSave(events, roll.modelId)
      const kindWord = e?.kind === 'invuln' ? 'invulnerable' : 'armour'
      const attacker = e ? unitName(state, e.attack.attackerUnitId) : null
      const gun = e ? weaponName(state, e.attack.weaponId) : null
      const who = unitName(state, roll.unitId)
      return {
        title: `Re-roll the ${kindWord} save?`,
        line: e ? `Rolled ${shown(roll)} — needs ${e.needed}+ to save.` : `Rolled ${shown(roll)} on a save.`,
        context: who ? `${who}${attacker ? `, hit by ${attacker}${gun ? ` (${gun})` : ''}` : ''}.` : null,
        failed: e ? !e.saved : true,
      }
    }
    case 'hit': {
      const e = lastAttackRoll(events, 'HitRolled', roll)
      // HitRolled carries no threshold — the weapon's own skill (BS/WS) is the number the player needs.
      const skill = roll.weaponId ? state.weapons[roll.weaponId]?.skill : null
      return {
        title: 'Re-roll the hit roll?',
        line: skill ? `Rolled ${shown(roll)} — needs ${skill}+ to hit.` : `Rolled ${shown(roll)} to hit.`,
        context: attackContext(state, unitName(state, roll.unitId), weaponName(state, roll.weaponId), unitName(state, roll.targetUnitId)),
        failed: e ? !e.hit : true,
      }
    }
    case 'wound': {
      const e = lastAttackRoll(events, 'WoundRolled', roll)
      const target = unitName(state, roll.targetUnitId)
      return {
        title: 'Re-roll the wound roll?',
        line: e ? `Rolled ${shown(roll)} — needs ${e.needed}+ to wound${target ? ` ${target}` : ''}.` : `Rolled ${shown(roll)} to wound.`,
        context: attackContext(state, unitName(state, roll.unitId), weaponName(state, roll.weaponId), target),
        failed: e ? !e.wounded : true,
      }
    }
    case 'charge': {
      const e = lastOfType(events, 'ChargeRolled')
      const who = unitName(state, roll.unitId)
      const total = e ? e.total : roll.dice.reduce((a, b) => a + b, 0)
      const needed = e?.needed ?? null
      return {
        title: 'Re-roll the charge?',
        line: needed === null
          ? `Rolled ${shown(roll)} = ${total}" — no target is in reach.`
          : `Rolled ${shown(roll)} = ${total}" — needs ${needed}" to reach.`,
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
