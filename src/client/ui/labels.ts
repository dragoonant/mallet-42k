// Own-words label helpers translating raw engine/data ids (scoring rule ids, mission rule ids,
// VP/CP event sources, secondary/stratagem ids) into text a player can read without cross-referencing
// the JSON. Pure lookups over DataBundle/GameState — no engine/scoring logic duplicated here beyond a
// generic id-to-title-case fallback for whatever id we don't have a curated name for.
import type { DiceRoll, GameEvent, GameState, PlayerId, RollPurpose, RuntimeWeapon } from '@/engine'
import { modelStats, woundRollNeeded } from '@/engine'
import type { DataBundle, MissionData, MissionRule, ScoringRule } from '@/data/types'

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'with', 'in', 'on', 'a', 'an', 'but', 'or', 'to'])

/** "raze-hold1-r2-4" -> "Raze Hold 1", "core.s.command-reroll" -> "Command Reroll" — strips the
 *  round-range suffix most scoring rule ids carry and the faction-prefix stratagems/secondaries use,
 *  then title-cases the rest. A fallback for whatever id isn't covered by the curated lookups below. */
export function prettifyId(id: string): string {
  let s = id.replace(/-r\d+(?:-\d+)?(?:-(?:first|second))?$/i, '')
  s = s.replace(/^[a-z0-9]+(?:\.[a-z0-9]+)*\./i, '')
  s = s.replace(/[-_.]+/g, ' ').replace(/(\d+)/g, ' $1 ').replace(/\s+/g, ' ').trim()
  if (!s) return id
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Objectives only ever carry a bare id ("west", "site-a") — no separate display name in the data —
 *  so this is the one place that turns one into something a player didn't have to decode. */
export function objectiveLabel(id: string): string {
  return `${prettifyId(id)} objective`
}

/** Resolves a VpScored/CpChanged `source` id to an own-words name. The engine emits whatever
 *  descriptor id actually granted the points/CP — a mission scoring rule, a mission special rule, a
 *  secondary's own scoring rule, a stratagem, or an ability — so every one of those is checked. */
export function sourceName(state: GameState, bundle: DataBundle | null, source: string): string {
  if (source === 'commandPhase') return 'Command phase'
  const strat = state.stratagems[source]
  if (strat) return strat.name
  const ability = state.abilities[source]
  if (ability) return ability.name
  const missionRule = state.mission.rules.find((r) => r.id === source)
  if (missionRule) return prettifyId(missionRule.id)
  const scoringRule = state.mission.scoring.find((r) => r.id === source)
  if (scoringRule) return prettifyId(scoringRule.id)
  if (bundle) {
    for (const patrol of Object.values(bundle.patrols)) {
      for (const secondary of patrol.secondaries) {
        if (secondary.id === source || secondary.scoring.some((r) => r.id === source)) return secondary.name
      }
    }
  }
  return prettifyId(source)
}

/** The secondary a player is actually playing this game (from PlayerSetup.secondaryId), with its
 *  name/text for display — null only if the bundle hasn't loaded (shouldn't happen mid-game). */
export function secondaryFor(bundle: DataBundle | null, state: GameState, player: PlayerId): { id: string; name: string; text: string } | null {
  if (!bundle) return null
  const p = state.players[player]
  const patrol = bundle.patrols[p.patrolId]
  const secondary = patrol?.secondaries.find((s) => s.id === p.secondaryId)
  return secondary ? { id: secondary.id, name: secondary.name, text: secondary.text } : null
}

/** The rule ids that belong to a player's own chosen secondary (not the mission's shared primary
 *  scoring or a mission special rule) — the one thing that actually distinguishes "primary" from
 *  "secondary" VP, since a mission special rule can grant VP under its own id (e.g. Scorched Earth's
 *  "raze-and-ruin") that never appears in state.mission.scoring at all. */
export function secondaryScoringIds(bundle: DataBundle | null, state: GameState, player: PlayerId): Set<string> {
  const secondary = secondaryFor(bundle, state, player)
  if (!bundle || !secondary) return new Set()
  const patrol = bundle.patrols[state.players[player].patrolId]
  const rule = patrol?.secondaries.find((s) => s.id === secondary.id)
  return new Set(rule?.scoring.map((r) => r.id) ?? [])
}

function scoringLineFor(rule: ScoringRule): string {
  switch (rule.rule) {
    case 'holdObjectives':
      return `${rule.pointsPer} VP per objective you hold (cap ${rule.cap})`
    case 'holdMore':
      return `${rule.pointsPer} VP if you hold more objectives than your opponent`
    case 'holdHome':
      return `${rule.pointsPer} VP for holding your home objective`
    case 'holdEnemyHome':
      return `${rule.pointsPer} VP for holding the enemy's home objective`
    case 'holdNamed':
      return `${rule.pointsPer} VP for holding a named objective`
    case 'unitsInEnemyZone':
      return `${rule.pointsPer} VP per unit you have in the enemy's deployment zone`
    case 'destroyedUnits':
      return `${rule.pointsPer} VP per enemy unit destroyed (cap ${rule.cap})`
    case 'razedThisTurn':
      return `${rule.pointsPer} VP for razing a marker this turn`
    case 'claimedSite':
      return `${rule.pointsPer} VP for a Character holding a claimed site`
    case 'claimedSiteConsecutive':
      return `${rule.pointsPer} VP for holding a claimed site across turns`
    default:
      return `${prettifyId(rule.id)} (up to ${rule.cap} VP)`
  }
}

/** One line per distinct scoring "family" — folds the r2-4 / r5-first / r5-second split every
 *  mission's primary uses into a single own-words bullet instead of three near-duplicates. */
export function primaryScoringSummary(mission: MissionData): string[] {
  const families = new Map<string, ScoringRule[]>()
  for (const rule of mission.scoring) {
    const family = rule.id.replace(/-r\d+(?:-\d+)?(?:-(?:first|second))?$/i, '')
    const arr = families.get(family)
    if (arr) arr.push(rule)
    else families.set(family, [rule])
  }
  return Array.from(families.values()).map((rules) => {
    const from = Math.min(...rules.map((r) => r.rounds.from))
    const to = Math.max(...rules.map((r) => r.rounds.to))
    return `${scoringLineFor(rules[0])} — rounds ${from}-${to}`
  })
}

const WINDOW_LABEL: Partial<Record<string, string>> = {
  'command.end': 'end of your Command phase',
  'command.start': 'start of your Command phase',
  'turn.end': 'end of your turn',
  'turn.start': 'start of your turn',
  'round.end': 'end of the round',
  'round.start': 'start of the round',
  'phase.end': 'end of every phase',
  'battle.end': 'the end of the battle',
}

/** "Scoring: end of your Command phase (rounds 2-4)" — read off the primary's own-turn scoring
 *  rule, since that's the moment a player actually needs to remember to act before. */
export function primaryScoringWindowHint(mission: MissionData): string | null {
  const rule = mission.scoring.find((r) => r.who === 'active') ?? mission.scoring[0]
  if (!rule) return null
  const windowLabel = WINDOW_LABEL[rule.when] ?? rule.when
  return `Scoring: ${windowLabel} (rounds ${rule.rounds.from}-${rule.rounds.to})`
}

/** Short own-words line for a mission special rule (MissionData.rules[]) — the mission's own `text`
 *  already narrates what it does in prose; this is just a label for the collapsible list. */
export function missionRuleLabel(rule: MissionRule): string {
  return prettifyId(rule.id)
}

// ---------- roll context for decision prompts (docs/spec/50-client.md §6) ----------
// Owner playtest: "I'm given a choice of keeping or re-rolling a dice without even knowing what I'm
// re-rolling for", and "when choosing a save I need to know what I need to roll to make the save
// work… I have no idea what weapon or AP the enemy is using". Both prompts arrive mid-attack-
// sequence, and the PendingDecision's own context carries only the roll (or the model + invuln) —
// everything else the player needs to judge the choice is in the event log the client already keeps.

export const ROLL_PURPOSE_LABEL: Record<RollPurpose, string> = {
  hit: 'To hit',
  wound: 'To wound',
  save: 'Save',
  damage: 'Damage',
  attacks: 'Attacks',
  fnp: 'Feel No Pain',
  charge: 'Charge',
  advance: 'Advance',
  battleShock: 'Battle-shock',
  desperateEscape: 'Desperate Escape',
  hazardous: 'Hazardous',
  deadlyDemise: 'Deadly Demise',
  mortal: 'Mortal wounds',
  rollOff: 'Roll-off',
  firstTurn: 'First turn',
  mission: 'Mission',
  ability: 'Ability',
  stratagem: 'Stratagem',
  random: 'Random',
}

function unitNameOf(state: GameState, id: string | null | undefined): string {
  if (!id) return ''
  return state.units[id]?.name ?? id
}

/** "Terminator Squad vs Boyz — To hit" — the Dice Log's own one-line attribution for a roll. */
export function describeRoll(roll: DiceRoll, state: GameState): string {
  const who = unitNameOf(state, roll.unitId) || state.players[roll.player]?.name || roll.player
  const vs = roll.targetUnitId ? ` vs ${unitNameOf(state, roll.targetUnitId)}` : ''
  return `${who}${vs} — ${ROLL_PURPOSE_LABEL[roll.purpose] ?? roll.purpose}`
}

/** Toughness of the unit being attacked, from its first model. Null when it can't be resolved. */
function unitToughness(state: GameState, unitId: string | null): number | null {
  const unit = unitId ? state.units[unitId] : undefined
  const model = unit ? state.models[unit.models[0]] : undefined
  if (!model) return null
  try {
    return modelStats(state, model).T
  } catch {
    return null
  }
}

/** The attack currently being resolved, from the log — who is attacking and with what. A save or
 *  Feel No Pain roll is made by the *defender*, so the roll's own unitId is the wrong name to put
 *  next to the weapon; this is where the attacker's name comes from. */
function lastAttack(events: readonly GameEvent[]): { attackerUnitId: string; weaponId: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'WoundRolled' || e.type === 'HitRolled' || e.type === 'AttackAllocated') {
      return { attackerUnitId: e.attack.attackerUnitId, weaponId: e.attack.weaponId }
    }
    if (e.type === 'TargetsDeclared' && e.targets[0]) {
      return { attackerUnitId: e.unitId, weaponId: e.targets[0].weaponId }
    }
  }
  return null
}

export interface RerollContext {
  /** "To hit — Terminator Squad's Storm bolter vs Boyz" */
  headline: string
  /** "Rolled 2 — needs 3+." Never asserts an outcome the client would have to re-derive from the
   *  engine's own crit/auto rules; the die and the target are what the decision turns on. */
  detail: string
}

/** " — needs 3+" for the rolls whose target the client can work out exactly, "" otherwise (a charge
 *  needs an engagement distance the client doesn't measure; an Advance has no target at all). Saves
 *  get the fuller armour-vs-AP sentence, since that is the number people get wrong. */
function rerollTargetText(state: GameState, events: readonly GameEvent[], roll: DiceRoll, weapon: RuntimeWeapon | undefined): string {
  switch (roll.purpose) {
    case 'hit':
      return typeof weapon?.skill === 'number' ? ` — needs ${weapon.skill}+` : ''
    case 'wound': {
      // RuntimeWeapon.S is already a number — the datasheet's 'user'/'user+1' forms are resolved
      // when the runtime weapon table is built, and effectiveWeapon folds stat modifiers in.
      const S = weapon?.S ?? null
      const T = unitToughness(state, roll.targetUnitId)
      if (S === null || T === null) return ''
      return ` — S${S} vs T${T}, needs ${woundRollNeeded(S, T)}+`
    }
    case 'save': {
      // The engine publishes the target of the save actually being made (armour or invulnerable,
      // whichever the player took) before it rolls — this window opens before SaveRolled exists.
      const targets = saveTargetsInFlight(state)
      const kind = state.phaseState?.attack?.current?.save?.kind
      if (!targets || !kind || kind === 'none') return ''
      const needed = kind === 'invuln' ? targets.invuln : targets.armour
      if (needed === null) return ''
      const basis = kind === 'invuln' ? 'invulnerable save' : `armour ${targets.sv}+${targets.ap === 0 ? '' : ` against AP ${targets.ap}`}${targets.cover ? ' in cover' : ''}`
      return ` — ${basis} needs ${needed}+`
    }
    default:
      return ''
  }
}

/** Everything a player needs to answer a Command Re-roll offer: what the roll was for, who made it
 *  with what, against whom, what it came up and what it has to beat.
 *
 *  The target number is computed from the game state, never read back off the roll's own event —
 *  `rollOnce` (src/engine/reducer.ts) opens this window *before* its caller emits HitRolled /
 *  WoundRolled / SaveRolled, so the newest matching event in the log belongs to the PREVIOUS roll and
 *  would quietly show the wrong numbers. The wound table comes from the engine's own
 *  `woundRollNeeded`, not a second copy of the rule here. Modifiers the engine applied are already in
 *  `roll.final`, which is the value shown. */
export function rerollContext(state: GameState, events: readonly GameEvent[], roll: DiceRoll): RerollContext {
  const purpose = ROLL_PURPOSE_LABEL[roll.purpose] ?? roll.purpose
  const rollerName = unitNameOf(state, roll.unitId) || state.players[roll.player]?.name || roll.player
  const weapon = roll.weaponId ? state.weapons[roll.weaponId] : undefined
  const defending = roll.purpose === 'save' || roll.purpose === 'fnp'

  let headline: string
  if (defending) {
    const attacker = lastAttack(events)
    const attackerName = attacker ? unitNameOf(state, attacker.attackerUnitId) : ''
    const weaponName = weapon?.name ?? (attacker ? state.weapons[attacker.weaponId]?.name : undefined)
    const against = weaponName ? ` against ${attackerName ? `${attackerName}'s ` : ''}${weaponName}` : ''
    headline = `${purpose} — ${rollerName}${against}`
  } else {
    const vs = roll.targetUnitId ? ` vs ${unitNameOf(state, roll.targetUnitId)}` : ''
    headline = `${purpose} — ${rollerName}${weapon ? `'s ${weapon.name}` : ''}${vs}`
  }

  const shown = roll.final.length > 0 ? roll.final : roll.dice
  const modified = roll.final.length > 0 && roll.dice.join(',') !== roll.final.join(',') ? ` (rolled ${roll.dice.join(', ')}, modified to ${shown.join(', ')})` : ''
  return { headline, detail: `Rolled ${shown.join(', ')}${modified}${rerollTargetText(state, events, roll, weapon)}.` }
}

export interface SaveChoiceContext {
  weaponName: string
  /** Armour Penetration as the datasheet states it (0 or negative). */
  ap: number
  attackerName: string
  /** The model's own Save characteristic, before AP. */
  sv: number | null
  /** What the armour save must actually roll — AP, the benefit of cover and any modifiers already
   *  applied. Above 6 means it cannot be made at all. Null when the engine didn't publish it. */
  armourNeeded: number | null
  /** What the invulnerable save must actually roll, modifiers included. */
  invulnNeeded: number | null
  /** Whether the engine counted the target as being in cover — it is why an armour save can be
   *  better than the AP arithmetic alone suggests. */
  cover: boolean
}

/** The numbers the engine published for a `saveType` decision (`context.data` — see
 *  docs/spec/00-architecture.md §3). These are the real targets, modifiers and all: the client used
 *  to derive `sv - AP` itself, which silently ignored the benefit of cover (+1) and any ability that
 *  modifies a save, so it could show 5+ for a save the dice were judged against at 4+. */
export function saveChoiceFromDecisionData(state: GameState, data: Record<string, unknown>): SaveChoiceContext | null {
  const num = (k: string): number | null => (typeof data[k] === 'number' ? (data[k] as number) : null)
  const armourTarget = num('armourTarget')
  if (armourTarget === null) return null
  const weaponId = typeof data.weaponId === 'string' ? data.weaponId : null
  const attackerUnitId = typeof data.attackerUnitId === 'string' ? data.attackerUnitId : null
  return {
    weaponName: (weaponId ? state.weapons[weaponId]?.name : undefined) ?? 'the attack',
    ap: num('ap') ?? 0,
    attackerName: unitNameOf(state, attackerUnitId),
    sv: num('sv'),
    armourNeeded: armourTarget,
    invulnNeeded: num('invulnTarget'),
    cover: data.cover === true,
  }
}

/** The numbers for the save currently being rolled, for a Command Re-roll offer on it — the engine
 *  publishes them on the attack before it rolls (`CurrentAttack.saveTargets`), because that window
 *  opens before `SaveRolled` is emitted. Null when no save is in flight. */
export function saveTargetsInFlight(state: GameState): { sv: number; ap: number; cover: boolean; armour: number; invuln: number | null } | null {
  // Optional all the way down: a label helper is called from render and must never throw on a
  // state shape it didn't expect (a fixture, an old save file, a game that hasn't started).
  return state.phaseState?.attack?.current?.saveTargets ?? null
}

/** The incoming attack behind a save, from the log: which weapon and whose. Used for the attacker's
 *  name beside a save roll; the numbers themselves always come from the engine. */
export function saveAttackContext(state: GameState, events: readonly GameEvent[], modelId: string): { weaponName: string; ap: number; attackerName: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type !== 'WoundRolled' && e.type !== 'AttackAllocated') continue
    const weapon = state.weapons[e.attack.weaponId]
    if (!weapon) continue
    return { weaponName: weapon.name, ap: weapon.AP, attackerName: unitNameOf(state, e.attack.attackerUnitId) }
  }
  return null
}
