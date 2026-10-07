// The single decision prompt (docs/spec/50-client.md §6). Bespoke controls for deployment and the
// four move-family decisions (which need a board click, handled by src/client/interaction/**); every
// other decision kind — including declareTargets/declareCharge, which also accept a click on an enemy
// Figure via UnitsLayer — renders as a plain clickable list here, so no decision can ever get stuck.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  unitModels,
  type Action, type ChooseOptionTopic, type DecisionOption, type GameEvent, type GameState, type MoveType, type PendingDecision, type PlayerId, type StratagemId,
} from '@/engine'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import {
  combinedUnitIds, combinedUnitModels, distance2D, formationPlacementsForUnit, modelsAnchor, placementInfo, validateDraft,
  isApproachPending, startDraft, autoDraft, validateApproach, fightersAfter,
} from '../interaction'
import { neededChargeDistance } from '@/engine/phases/charge'
import { isTeleporting } from '@/engine/teleport'
import {
  chargeTargetHelp, moveTypeHelp, objectiveLabel, prettifyId, saveAttackContext,
  shootingTargetHelp, type PromptHelp,
} from './labels'
import { offeredAmbushMarker, useAmbushHover } from '../interaction/CultAmbushMarkers'
import { commitStagedDraft } from '../interaction/commitDraft'
import { FormationPicker } from './FormationPicker'
import { rerollTrayModel, rollForOffer } from './rerollInfo'
import { RerollTray } from './RerollTray'
import { overwatchReach } from './overwatchInfo'
import { usePresentedStore } from '../presentation/presentedStore'
import { buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

/** The nearest thing worth orienting a move/charge/pile-in/consolidate destination against — an
 *  objective it lands on, or the nearest enemy unit — so a suggested placement reads as "toward
 *  Boyz, 5.2"" instead of a bare distance. */
function nearestReference(state: GameState, player: PlayerId, at: { x: number; z: number }): string | null {
  let objective: { id: string; d: number } | null = null
  for (const o of Object.values(state.objectives)) {
    if (o.removed) continue
    const d = Math.hypot(at.x - o.pos.x, at.z - o.pos.z)
    if (!objective || d < objective.d) objective = { id: o.id, d }
  }
  if (objective && objective.d <= 3) return `onto ${objective.id} objective`

  let enemy: { name: string; d: number } | null = null
  for (const u of Object.values(state.units)) {
    if (u.player === player || u.location !== 'board') continue
    for (const modelId of u.models) {
      const m = state.models[modelId]
      if (!m) continue
      const d = Math.hypot(at.x - m.pos.x, at.z - m.pos.z)
      if (!enemy || d < enemy.d) enemy = { name: u.name, d }
    }
  }
  return enemy ? `toward ${enemy.name}` : null
}

/** "5.2\" toward Boyz" (or "3.0\" onto west objective") for a moveUnit/chargeMove/pileIn/consolidate
 *  action's placements, relative to the unit's current position — the raw ModelPlacement[] on its
 *  own tells a human nothing about where the suggestion actually goes. */
function placementSummary(state: GameState, unitId: string, placements: { pos: { x: number; z: number } }[]): string {
  const unit = state.units[unitId]
  const models = unitModels(state, unitId)
  if (!unit || models.length === 0 || placements.length === 0) return ''
  const from = modelsAnchor(models)
  const to = { x: placements.reduce((s, p) => s + p.pos.x, 0) / placements.length, z: placements.reduce((s, p) => s + p.pos.z, 0) / placements.length }
  const dist = distance2D(from, to)
  const ref = nearestReference(state, unit.player, to)
  return `${dist.toFixed(1)}"${ref ? ` ${ref}` : ''}`
}

/** Edge-to-edge gap a charging unit still needs to close against the hardest of its declared
 *  targets — the same "roll 2D6, need at least this many inches" a player would work out by eye. */

const KIND_TITLE: Partial<Record<PendingDecision['kind'], string>> = {
  deployUnit: 'Deploy your forces',
  chooseUnitToActivate: 'Choose a unit to activate',
  declareMove: 'Declare a move',
  moveUnit: 'Move the unit',
  declareTargets: 'Choose targets',
  allocateAttack: 'Allocate the attack',
  declareCharge: 'Declare a charge',
  chargeMove: 'Make the charge move',
  pileIn: 'Pile in',
  consolidate: 'Consolidate',
  chooseFightUnit: 'Choose who fights',
  stratagemWindow: 'Use a stratagem?',
  reactionWindow: 'React?',
  chooseOption: 'Choose an option',
  commandReroll: 'Command re-roll?',
  confirm: 'Confirm',
}

/** Per-topic title + one-line explanation of what picking an option actually does — chooseOption's
 *  own KIND_TITLE was one generic label for every mission/secondary/rules-engine pick (M6 gap). */
const CHOOSE_OPTION_INFO: Partial<Record<ChooseOptionTopic, { title: string; hint: string }>> = {
  razeObjective: { title: 'Raze an objective?', hint: 'Destroys a marker you hold with no enemy nearby — it stops scoring VP for anyone, for the rest of the battle.' },
  recoverObjective: { title: 'Recover intelligence?', hint: 'Search one marker you control for intel to gain 1 Command Point (needs your Warlord on the battlefield). Each marker can be searched only once per battle (by either side), and it keeps scoring VP as normal. Pass to save the marker for later.' },
  treasureObjective: { title: 'Choose the treasure marker', hint: "Pick a marker in no man's land. If a Necron model destroys an enemy that was near it (or near the marker in your own zone) when the phase began, you score 3 VP." },
  stompTarget: { title: "Pick a Stomp 'Em target", hint: "Name a surviving enemy unit now — score if an ORKS model destroys it in melee by the end of this round." },
  bagTarget: { title: "Pick a Bag the Big 'Un target", hint: 'Name an enemy model now — score if it is destroyed by the end of this round.' },
  battleShockOrder: { title: 'Order battle-shock tests', hint: 'Choose which of your affected units tests for battle shock next.' },
  desperateEscapeCasualty: { title: 'Desperate Escape casualty', hint: 'Choose which model is removed after a failed Desperate Escape roll.' },
  coherencyCull: { title: 'Unit coherency', hint: 'Choose which model(s) to remove so the rest of the unit stays within coherency.' },
  meleeWeapon: { title: 'Choose a melee weapon', hint: "Pick which of this model's melee weapons to fight with." },
  weaponProfile: { title: 'Choose a weapon profile', hint: 'Pick which profile of this weapon to fire.' },
  oathTarget: { title: 'Oath of Moment target', hint: 'Name the enemy unit your army re-rolls hits and wounds against this battle.' },
  waaagh: { title: 'Call the Waaagh!', hint: 'Activate this once-per-battle army rule now, or hold it for later.' },
  reserveArrival: { title: 'Bring on reinforcements', hint: 'Choose where this unit arrives from reserves.' },
  leaderAttach: { title: 'Attach a leader', hint: 'Choose which bodyguard unit this leader joins.' },
  hazardousCasualty: { title: 'Hazardous casualty', hint: 'A model must be removed for failing its Hazardous test.' },
  rerollOffer: { title: 'Re-roll a die?', hint: 'Choose a die to re-roll, or keep the result.' },
  abilityChoice: { title: 'Ability choice', hint: 'Choose how this ability applies.' },
  chooseSide: { title: 'Choose your side', hint: 'Pick which deployment zone your army sets up in.' },
}

const METHODICAL_INFO = {
  title: 'Methodical Destruction target',
  hint: 'Name one enemy unit that is still alive. If it has been destroyed by the end of this battle round, by anyone or anything, you score 4 VP.',
}

/** Necron rules reach the player as chooseOption prompts with the generic 'abilityChoice' (or 'other') topic, so
 *  the ability id is what says which rule is asking. Own-words text; matched by id fragment so a renamed
 *  prefix or a variant of the same rule still reads right. */
const ABILITY_PROMPT_INFO: { match: RegExp; info: { title: string; hint: string } }[] = [
  {
    match: /martial-?katah/i,
    info: {
      title: "Choose a Ka'tah stance",
      hint: 'Pick the fighting style your Custodes use for this fight phase. Dacatarai makes their melee weapons score an extra hit on a 6 to hit; Rendax makes a 6 to hit wound automatically. It lasts until the end of the phase.',
    },
  },
  {
    match: /teleport-?assault/i,
    info: {
      title: 'Teleport Assault',
      hint: 'At the end of the turn, a unit with this rule may leave the battlefield now. It must be set up again in your next Movement phase, more than 9" from every enemy model, and a unit still off the board when the battle ends is lost. Pick the unit to send, or leave everyone where they stand.',
    },
  },
  {
    match: /banishment-?stone/i,
    info: {
      title: 'Banishment Stone',
      hint: 'The bearer just cut down an enemy hero. Roll a die: on a 2 or more you gain 1 Command point.',
    },
  },
  {
    match: /resonant-focus/,
    info: {
      title: 'Resonant Focus target',
      hint: 'Name an enemy unit within 12" of the bearer that he can see. For the rest of this turn, every Necron attack against it re-rolls hit rolls of 1.',
    },
  },
  {
    match: /for-the-greater-good/i,
    info: {
      title: 'For the Greater Good',
      hint: "Pair this unit with a friendly Observer and an enemy both can see. This unit's shots at that enemy hit one step better, and if the Observer carries a markerlight they ignore cover too. The Observer can still shoot later this phase, but without a partner of its own. Decline to shoot unaided.",
    },
  },
  {
    match: /plasmacyte/,
    info: {
      title: 'Release the plasmacyte?',
      hint: "One use for the whole battle: until the end of this phase, this unit's melee weapons gain Devastating Wounds.",
    },
  },
  {
    match: /dark-?pact/i,
    info: {
      title: 'Make a Dark Pact?',
      hint: 'The unit tests its nerve (2D6 against its Leadership); on a failure it takes D3 mortal wounds. Pass or fail, every weapon in the unit then gains the power you pick until the end of the phase. Decline to skip all of it.',
    },
  },
  {
    match: /sacrificial-?dagger/i,
    info: {
      title: 'Spill blood for the dagger?',
      hint: "The unit takes 1 mortal wound. If the bearer survives, his psychic attacks hit and wound at +1 until the end of the phase. Once per phase.",
    },
  },
  {
    match: /prey-?on-?the-?weak/i,
    info: {
      title: 'Prey on the Weak target',
      hint: 'Pick an enemy unit that the Rite of Possession struck this activation: it takes an immediate Battle-shock test at -1.',
    },
  },
  {
    match: /shadow-in-the-warp/,
    info: {
      title: 'Shadow in the Warp',
      hint: 'One use for the whole battle: every enemy unit on the board takes a battle-shock test right now. Fire it when it will hurt most, or hold it.',
    },
  },
  {
    match: /secretion-goad/,
    info: {
      title: 'Secretion Goad',
      hint: 'Once per turn: a nearby Tyranid unit that is about to shoot or fight gets 1 better AP on all its weapons until the end of the phase. Use it now or save it for a better unit.',
    },
  },
  {
    match: /death-blow/,
    info: {
      title: 'Death Blow',
      hint: 'This model was struck down before it fought. Its death is put on hold if a D6 shows 4+; it then gets its attacks once the attackers finish, and only after that is it removed.',
    },
  },
  {
    match: /skulking-horrors/,
    info: {
      title: 'Skulking Horrors',
      hint: 'An enemy just ended a move close to this unit. It may slip away on a free move of up to D6 inches (once a turn, and only while it is not locked in melee). Move, or stay put.',
    },
  },
  {
    match: /disruption-bombardment/,
    info: {
      title: 'Disruption Bombardment',
      hint: 'Pick an enemy infantry unit this unit hit. Until the end of their next turn it moves 2 inches slower and rolls 2 lower when it advances or charges.',
    },
  },
  {
    match: /cult-ambush/i,
    info: {
      title: 'Cult Ambush',
      hint: 'A fallen hybrid brood may rise again. When it is destroyed, pick a spot at least 9 inches from every enemy to leave a hidden ambush marker. Later, during an enemy Movement phase, send a waiting brood back to spring out of a marker, touching it and more than 9 inches from the enemy. An enemy that finishes a move within 9 inches of a marker removes it. Nothing returns after battle round 3. Decline to keep the marker for the next turn.',
    },
  },
  {
    match: /patrol-squads/,
    info: {
      title: 'Patrol Squads',
      hint: 'Split this brood into two units of 10 before deployment, or keep it as one big unit of 20. Each half keeps every ability.',
    },
  },
  {
    match: /defender-of-the-faith/,
    info: {
      title: 'Defender of the Faith',
      hint: `Throw away one Miracle die to give the bearer's unit +1 Objective Control until your next Command phase, or keep your dice for Acts of Faith.`,
    },
  },
  {
    match: /righteous-fury/,
    info: {
      title: 'Righteous Fury',
      hint: `Throw away one Miracle die so the bearer's unit may re-roll its charge rolls for the rest of this turn, or keep your dice for Acts of Faith.`,
    },
  },
  {
    match: /martyrs?-death/,
    info: {
      title: "A Martyr's Death",
      hint: `Throw away one Miracle die to make each fallen model's last-stand roll easier by 1 (it succeeds on a 3+ instead of a 4+). A model that has not yet acted and passes the roll gets to shoot or fight before it is removed.`,
    },
  },
  {
    match: /extremis|trigger-word/,
    info: {
      title: 'Speak the trigger word?',
      hint: 'Until the end of this phase the arco-flails strike 6 times each, but every melee attack the unit makes risks a Hazardous test, so some of them may fall.',
    },
  },
  {
    match: /simulacrum/,
    info: {
      title: 'Simulacrum Imperialis',
      hint: `At the end of your Command phase, for each objective you hold that the banner bearer's unit stands on, roll a die: a 4 or more earns a Miracle die showing that number.`,
    },
  },
  {
    match: /voice-of-command/,
    info: {
      title: 'Issue an Order?',
      hint: 'Your officer barks one Order at a friendly unit nearby. It lasts until your next Command phase, or until the unit is battle-shocked, and a new Order replaces the old one. Move! Move! Move! adds 3" of Move; Take Aim! makes ranged attacks hit one step easier; Take Cover! improves saves by 1 (never past 3+).',
    },
  },
  {
    match: /methodical-destruction/,
    info: METHODICAL_INFO,
  },
  {
    match: /reanimation/,
    info: {
      title: 'Reanimation Protocols',
      hint: 'Fallen warriors climb back up: each point rolled heals one wound, or stands a lost model back up with a single wound.',
    },
  },
]

/** Engine prompts with topic 'other' carry no abilityId; they name themselves through data.choice instead. */
const CHOICE_PROMPT_KEYS: Record<string, string> = { deathBlow: 'death-blow', patrolSquads: 'patrol-squads' }

/** Adepta Sororitas' Acts of Faith arrive as a chooseOption with topic 'miracleDie' and data
 *  { purpose, unitId, count, maxSubstitutions, pool } (docs/spec/factions/adepta-sororitas.md §7). The topic is
 *  matched as a string so the client builds whether or not the engine's ChooseOptionTopic union lists it yet. */
const MIRACLE_TOPIC = 'miracleDie'
const ROLL_PURPOSE_LABEL: Record<string, string> = {
  advance: 'Advance',
  battleShock: 'Battle-shock',
  charge: 'charge',
  damage: 'damage',
  hit: 'hit',
  wound: 'wound',
  save: 'saving',
}
function miraclePool(data: Record<string, unknown> | undefined): number[] {
  const pool = data?.pool
  return Array.isArray(pool) ? pool.filter((v): v is number => typeof v === 'number') : []
}

function chooseOptionInfoFor(
  context: { topic: ChooseOptionTopic; abilityId: string | null; data?: Record<string, unknown> },
  options?: readonly { id: string }[],
  state?: GameState,
  player?: string,
): { title: string; hint: string } | undefined {
  if ((context.topic as string) === MIRACLE_TOPIC) {
    const purpose = typeof context.data?.purpose === 'string' ? ROLL_PURPOSE_LABEL[context.data.purpose] ?? context.data.purpose : 'this'
    const pool = miraclePool(context.data)
    return {
      title: `Act of Faith: ${purpose} roll`,
      hint: `Spend one of your Miracle dice (${pool.length > 0 ? pool.join(', ') : 'none left'}) and its number counts as the roll instead of a fresh die. Modifiers still apply after, and a spent die is gone. Or roll as normal and keep them.`,
    }
  }
  const choice = context.data && typeof context.data.choice === 'string' ? CHOICE_PROMPT_KEYS[context.data.choice] : undefined
  // Both Cult Ambush steps (marker, return) carry the code; the return step has no ability id.
  const key = context.data?.code === 'cultAmbush' ? 'cult-ambush' : context.abilityId ?? choice ?? null
  const byAbility = key ? ABILITY_PROMPT_INFO.find((a) => a.match.test(key)) : undefined
  if (byAbility) return byAbility.info
  // Order offers carry ids like "am.order.take-aim@A:shock-a" whichever ability id the engine attaches.
  if (options?.some((o) => ORDER_OPTION.test(o.id))) return ABILITY_PROMPT_INFO.find((a) => a.match.test('voice-of-command'))?.info
  // Methodical Destruction is a mission-hook pick: no ability id, and every option names an enemy unit.
  if (context.topic === 'abilityChoice' && !context.abilityId && state && options) {
    const picks = options.filter((o) => o.id !== 'decline')
    if (picks.length > 0 && picks.every((o) => state.units[o.id] && state.units[o.id].player !== player)) return METHODICAL_INFO
  }
  // Retrieve Intelligence only pays out while the Warlord is on the board — say so, since a search without one is wasted.
  if (context.topic === 'recoverObjective' && state && player && state.players[player as PlayerId]) {
    const info = CHOOSE_OPTION_INFO.recoverObjective!
    const warlord = state.units[state.players[player as PlayerId].warlordUnitId]
    const status = warlord?.location === 'board'
      ? 'Your Warlord is on the battlefield: searching now gains 1 CP.'
      : 'Your Warlord is NOT on the battlefield: searching now gains nothing and still uses up the marker. You probably want to pass.'
    return { title: info.title, hint: `${status} ${info.hint}` }
  }
  return CHOOSE_OPTION_INFO[context.topic]
}

/** For the Greater Good options are "<observer id>@<spotted enemy id>": say who watches and who is marked. */
function pairOptionLabel(state: GameState, abilityId: string | null, optionId: string): string | null {
  if (!abilityId || !/for-the-greater-good/i.test(abilityId)) return null
  const at = optionId.indexOf('@')
  if (at < 0) return null
  const observer = state.units[optionId.slice(0, at)]
  const spotted = state.units[optionId.slice(at + 1)]
  if (!observer || !spotted) return null
  return `Observer: ${observer.name} — Spotted: ${spotted.name}`
}

/** Voice of Command option ids: "<order id>@<unit id>" for one unit, "<order id>@all" for Command Laurels. */
const ORDER_OPTION = /^[^@]*order[^@]*@/i

/** "Take Aim! — Cadian Shock Troops" for an order option, or null when the id is not one. */
function orderOptionLabel(state: GameState, optionId: string): string | null {
  if (!ORDER_OPTION.test(optionId)) return null
  const at = optionId.indexOf('@')
  const orderId = optionId.slice(0, at)
  const target = optionId.slice(at + 1)
  const orderName = state.abilities[orderId]?.name ?? prettifyId(orderId)
  const targetName = target === 'all' ? 'every Astra Militarum unit' : state.units[target]?.name ?? prettifyId(target)
  return `${orderName} — ${targetName}`
}

/** "Pass" is the engine's word for declining, but for some prompts it reads as giving something up
 *  rather than as the safe half of the choice the player was offered. */
const PASS_LABEL: Partial<Record<PendingDecision['kind'], string>> = {
  commandReroll: 'Keep the roll',
}

const MOVE_TYPE_LABEL: Partial<Record<MoveType, string>> = {
  normal: 'Normal move',
  advance: 'Advance',
  stationary: 'Remain Stationary',
  fallBack: 'Fall Back',
}

const REACTION_LABEL: Record<string, string> = {
  overwatch: 'Fire Overwatch',
  heroicIntervention: 'Heroic Intervention',
  rapidIngress: 'Rapid Ingress',
  counterOffensive: 'Counter-offensive',
}

/** "Boy #3 · 2 wounds left" — which figure a model id is and how hurt it already is. The raw
 *  datasheetModelId ("boy", "terminator") says nothing about *which* one; its place in the unit and
 *  the wounds it has left do, and that is what a pick between models is actually about. */
function modelLabel(state: GameState, modelId: string): string {
  const model = state.models[modelId]
  if (!model) return modelId
  const index = state.units[model.unitId]?.models.indexOf(modelId) ?? -1
  const w = model.woundsRemaining
  return `${prettifyId(model.datasheetModelId)}${index >= 0 ? ` #${index + 1}` : ''} · ${w} ${w === 1 ? 'wound' : 'wounds'} left`
}

function describeAction(a: Action, state: GameState): string {
  const unitName = (id: string) => state.units[id]?.name ?? id
  switch (a.type) {
    case 'pass':
      return 'Pass'
    case 'chooseUnitToActivate':
      return `Activate ${unitName(a.unitId)}`
    case 'chooseFightUnit':
      return `Fight with ${unitName(a.unitId)}`
    case 'declareMove':
      // Matches the help card's own titles (labels.ts moveTypeHelp), and reads as the rulebook does
      // rather than as the enum does ("fallBack move").
      return MOVE_TYPE_LABEL[a.moveType] ?? a.moveType
    case 'declareTargets':
      return a.targets.length > 0 ? `Target ${unitName(a.targets[0].targetUnitId)}` : 'Hold fire'
    case 'declareCharge': {
      const names = a.targetUnitIds.map(unitName).join(', ')
      // The engine's own number (phases/charge.ts), so the button, the hover card and the roll the
      // dice are judged against are all the same figure. The label this replaced measured something
      // else — 3D distance, no Engagement Range subtracted, worst target rather than closest — and
      // read "need 12.6"" beside a card correctly saying the roll needed a 10.
      const needed = neededChargeDistance(state, a.unitId, a.targetUnitIds)
      return needed !== null ? `Charge ${names} — needs ${Math.max(2, Math.ceil(needed))}+` : `Charge ${names}`
    }
    case 'moveUnit':
    case 'chargeMove':
    case 'pileIn':
    case 'consolidate': {
      const verb = { moveUnit: 'Move', chargeMove: 'Charge move', pileIn: 'Pile in', consolidate: 'Consolidate' }[a.type]
      const summary = placementSummary(state, a.unitId, a.placements)
      return summary ? `${verb} ${summary}` : verb
    }
    case 'allocateAttack': {
      // The raw datasheetModelId ("boy", "terminator") says nothing about *which* one — its place in
      // the unit and the wounds it has left do, and that is what the choice is actually about. Hover
      // lights the figure itself (hoverTargetFor).
      return state.models[a.modelId] ? modelLabel(state, a.modelId) : `Allocate to ${a.modelId}`
    }
    case 'useStratagem': {
      const strat = state.stratagems[a.stratagemId]
      const name = strat?.name ?? a.stratagemId
      const cost = strat ? ` (${strat.cost} CP)` : ''
      const targets: string[] = (a.targets.unitIds ?? []).map(unitName)
      for (const mid of a.targets.modelIds ?? []) targets.push(state.models[mid] ? modelLabel(state, mid) : mid)
      if (a.targets.objectiveId) targets.push(objectiveLabel(a.targets.objectiveId))
      return `${name}${cost}${targets.length > 0 ? `: ${targets.join(', ')}` : ''}`
    }
    case 'commandReroll':
      return 'Re-roll'
    case 'confirm':
      return 'Confirm'
    case 'chooseOption':
      return a.optionId
    case 'resign':
      return 'Resign'
    case 'deployUnit':
      return a.toReserves ? `Hold ${unitName(a.unitId)} in reserve` : `Deploy ${unitName(a.unitId)} here`
    default:
      // Exhaustive today, but a future Action variant should still render as *something* clickable
      // rather than crash — hence the cast (this branch is unreachable for the current union).
      return `${(a as Action).type} option`
  }
}

/** chooseOption topics whose option ids are model ids (which figure is removed). */
const MODEL_PICK_TOPICS: ReadonlySet<ChooseOptionTopic> = new Set<ChooseOptionTopic>(['hazardousCasualty', 'desperateEscapeCasualty', 'coherencyCull'])

/** Label a single option button for the kinds whose engine-provided DecisionOption.label is either
 *  a raw id ("A:terminator-squad", a bare objective id) or too terse to explain the choice — everyone
 *  else keeps the engine's own label untouched. */
function labelForOption(pending: PendingDecision, state: GameState, events: readonly GameEvent[], o: { id: string; label: string; action: Action }): string {
  switch (pending.kind) {
    case 'chooseUnitToActivate':
    case 'chooseFightUnit':
    case 'stratagemWindow':
    case 'reactionWindow':
    // The engine labels these with the bare move type ('normal', 'fallBack').
    case 'declareMove':
    // The engine labels these "allocate to A:terminator-squad#0" — a model id, which says nothing
    // about which figure it is or how hurt it already is.
    case 'allocateAttack':
      return describeAction(o.action, state)
    case 'commandReroll': {
      if (o.action.type !== 'commandReroll') return describeAction(o.action, state)
      const roll = pending.context.roll
      return o.action.dieIndex === undefined
        ? `Re-roll for 1 CP (rolled ${roll.dice.join(', ')})`
        : `Re-roll die ${o.action.dieIndex + 1} for 1 CP (rolled ${roll.dice[o.action.dieIndex]})`
    }
    case 'chooseOption': {
      // The engine labels these "remove M:boy#3" — a model id; say which figure it is instead.
      if (MODEL_PICK_TOPICS.has(pending.context.topic) && state.models[o.id]) return modelLabel(state, o.id)
      if ((pending.context.topic as string) === MIRACLE_TOPIC) {
        if (o.id === 'skip') return 'Roll normally'
        const pool = miraclePool(pending.context.data)
        const idx = o.action.type === 'chooseOption' ? o.action.dieIndexes : undefined
        const picked = idx?.map((i) => pool[i]).filter((v): v is number => typeof v === 'number')
        return picked && picked.length > 0 ? `Spend a Miracle die (${picked.join(', ')})` : 'Spend a Miracle die'
      }
      const pairLabel = pairOptionLabel(state, pending.context.abilityId, o.id)
      if (pairLabel) return pairLabel
      const orderLabel = orderOptionLabel(state, o.id)
      if (orderLabel) return orderLabel
      if (pending.context.topic === 'razeObjective' || pending.context.topic === 'recoverObjective' || pending.context.topic === 'treasureObjective') return objectiveLabel(o.id)
      return abilityOptionLabel(pending.context.abilityId, o)
    }
    default:
      return o.label
  }
}

/** Dark Pact / Sacrificial Dagger offer short engine ids (lethal, sustained, both, use, decline); say what each does. */
function abilityOptionLabel(abilityId: string | null, o: { id: string; label: string }): string {
  if (!abilityId) return o.label
  if (/dark-?pact/i.test(abilityId)) {
    switch (o.id) {
      case 'lethal': return 'Pact: Lethal Hits (6s to hit auto-wound)'
      case 'sustained': return 'Pact: Sustained Hits 1 (6s to hit score an extra hit)'
      case 'both': return 'Pact: Lethal Hits and Sustained Hits 1 (Foul Zealotry)'
      case 'decline': return 'No pact'
    }
  }
  if (/teleport-?assault/i.test(abilityId)) {
    if (/^(decline|skip|pass|none|stay)$/.test(o.id)) return 'Stay where they are'
  }
  if (/sacrificial-?dagger/i.test(abilityId)) {
    if (o.id === 'use') return 'Use the dagger (1 mortal wound)'
    if (o.id === 'decline') return 'Keep the dagger sheathed'
  }
  return o.label
}

/** The hover-help card for an option, where one can be written. These are the choices whose options
 *  are rules in disguise: what each commits the unit to is the decision, and the button can only
 *  carry a name. */
function helpForAction(state: GameState, action: Action | undefined): PromptHelp | null {
  if (!action) return null
  switch (action.type) {
    case 'declareMove':
      return moveTypeHelp(state, action.unitId, action.moveType)
    case 'declareTargets':
      return shootingTargetHelp(state, action.targets)
    case 'declareCharge':
      return chargeTargetHelp(state, action.unitId, action.targetUnitIds)
    default:
      return null
  }
}

/** What an option is "about", for the board-hover highlight (M6 gap: prompts named units/objectives
 *  the player couldn't match to the board; owner playtest: the same for allocateAttack's models —
 *  "when I hover over the button it should light up the appropriate figure on the game board").
 *  Every option that names a unit gets one: where it names two (attacker and target) the target wins,
 *  because the acting unit is already the one the player is looking at. */
type HoverTarget = { kind: 'unit'; ids: string[] } | { kind: 'model'; id: string } | { kind: 'objective'; id: string }

const unitsOf = (ids: readonly string[]): HoverTarget | null => (ids.length > 0 ? { kind: 'unit', ids: [...new Set(ids)] } : null)

function hoverTargetFor(state: GameState, pending: PendingDecision, action: Action, optionId: string): HoverTarget | null {
  switch (action.type) {
    // Allocating an attack picks one model out of a unit, so the highlight has to be that one figure.
    case 'allocateAttack':
      return { kind: 'model', id: action.modelId }
    // Shooting and charge options name the enemy unit(s) to hit: light them up so "which one is that?"
    // never needs asking.
    case 'declareTargets':
      return unitsOf(action.targets.map((t) => t.targetUnitId))
    case 'declareCharge':
      return unitsOf(action.targetUnitIds)
    // Picking which of your own units acts (activate / fight / move type / suggested placement / deploy).
    case 'chooseUnitToActivate':
    case 'chooseFightUnit':
    case 'declareMove':
    case 'moveUnit':
    case 'chargeMove':
    case 'pileIn':
    case 'consolidate':
    case 'deployUnit':
      return unitsOf([action.unitId])
    case 'useStratagem': {
      const t = action.targets
      if (t.unitIds && t.unitIds.length > 0) return unitsOf(t.unitIds)
      if (t.modelIds && t.modelIds.length > 0) return { kind: 'model', id: t.modelIds[0] }
      if (t.objectiveId) return { kind: 'objective', id: t.objectiveId }
      return null
    }
    case 'chooseOption': {
      // Oath of Moment / battle-shock order / Stomp 'Em / Bag the Big 'Un / leader attach name a unit by
      // id; the model-removal prompts name a model; raze/recover name an objective. A pick between
      // weapons or ability modes has no board object of its own, so it lights the unit it is about.
      if (pending.kind !== 'chooseOption' || pending.context.topic === 'rerollOffer') return null
      if (state.units[optionId]) return { kind: 'unit', ids: [optionId] }
      if (state.models[optionId]) return { kind: 'model', id: optionId }
      if (state.objectives[optionId]) return { kind: 'objective', id: optionId }
      return pending.context.unitId ? unitsOf([pending.context.unitId]) : null
    }
    default:
      return null
  }
}

// A pending decision is player input the game is blocked on — it must never be visually covered (and,
// more importantly, never have its buttons occluded from pointer hit-testing) by anything else on
// screen, including the dice tray (src/client/dice/DiceTray.tsx, zIndex 20) sharing this same bottom-
// centre real estate while an attack's dice are still animating. Every one of this file's own absolutely-
// positioned containers (wrap/deployWrap/bannerWrap) sits above that.
const PROMPT_Z_INDEX = 30
const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: '50%',
  bottom: 10,
  transform: 'translateX(-50%)',
  width: 460,
  maxWidth: 'calc(100vw - 440px)',
  padding: '10px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  pointerEvents: 'auto',
  zIndex: PROMPT_Z_INDEX,
}
// Deployment-only dock: Combat Patrol's own deployment zones (src/data/missions/cp-0*.json) are full-
// board-width strips hugging the board's near/far edge (§cp-01 zones z in [-15,-10]/[10,15], x the
// full [-22,22]) — with the default overview camera those strips project to screen bands near the very
// top and very bottom of the viewport (~26-35%/~59-74% of height at both 1280x720 and 1600x900, same
// 16:9 aspect ratio, so the percentages hold at either size), leaving the vertical middle of the screen
// always clear of both players' zones. `wrap`'s bottom-centre placement sits squarely on the near-side
// strip, which is exactly the zone a deploying player needs to click into — every in-zone click during
// deployment can end up landing on this DOM panel instead of the canvas underneath it. Docking to the
// left edge and pinning both `top`/`bottom` (rather than a bottom offset + auto height) gives the panel
// a fixed box confined to that clear middle band — content that would otherwise grow the panel taller
// (a long roster, a multi-reason "Can't confirm" line) scrolls inside it instead of pushing the box
// down into the near-side zone. A plain always-left dock (rather than picking the side away from the
// zone) is enough here since the zones run the *board's* full width, not screen width — see the
// comment above `deployRowVertical` for why the dock's own width doesn't matter once its vertical band
// is clear of both zones.
const deployWrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: 10,
  // Sized to its content (roster + hint + Confirm/Reset/Cancel) and centred vertically, so the
  // action buttons are always visible; only scrolls if it would exceed the viewport.
  top: '50%',
  transform: 'translateY(-50%)',
  maxHeight: 'calc(100% - 20px)',
  width: 230,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  overflowY: 'auto',
  pointerEvents: 'auto',
  zIndex: PROMPT_Z_INDEX,
}
const heading: CSSProperties = { fontWeight: 700, fontSize: 14 }
const hint: CSSProperties = { ...mutedText }
const infoBlock: CSSProperties = { ...mutedText, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }
const stratList: CSSProperties = { margin: '4px 0 0 16px', padding: 0, fontSize: 11.5 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
/** The deploy palette (unit chips + Reserves buttons), laid out for the left-docked deployment panel
 *  (`deployWrap`) — a vertical list fits a narrow sidebar far better than a horizontal scroller would.
 *  The dock's own width is unconstrained by the zone strips (they run the board's full width, not just
 *  the panel's column), so this only needs to look good, not dodge anything itself — `deployWrap`'s
 *  pinned top/bottom is what keeps the whole box out of both zones. */
const deployRowVertical: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const optionList: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 130, overflowY: 'auto' }
/** How long the pointer has to rest on an option before its help appears — long enough that moving
 *  across the row to the option you want doesn't flash three cards on the way. */
const HELP_DELAY_MS = 450
// Anchored to the prompt panel, not to the hovered button: the option row is an overflow:auto
// scroller (`optionList`), which clips anything positioned outside its box — a card above a button
// was in the DOM and measurable, but painted away to nothing.
const helpCard: CSSProperties = {
  ...panel,
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: 0,
  width: 300,
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.45,
  pointerEvents: 'none', // never steals the click the player is about to make
  zIndex: 40,
}
const helpTitle: CSSProperties = { fontWeight: 700, marginBottom: 4 }

/** Hover help for one option, shown above the row (the prompt itself is at the bottom of the
 *  screen, so a card below it would be off-screen). */
function OptionHelp({ help }: { help: PromptHelp }) {
  return (
    <div style={helpCard} data-testid="option-help" role="tooltip">
      <div style={helpTitle}>{help.title}</div>
      {help.lines.map((line, i) => (
        <div key={i} style={{ color: i === 0 ? colors.text : colors.muted, marginTop: i === 0 ? 0 : 3 }}>
          {line}
        </div>
      ))}
    </div>
  )
}
function hasOptions(p: PendingDecision): p is Extract<PendingDecision, { options: DecisionOption[] }> {
  return 'options' in p
}

const bannerWrap: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 12,
  transform: 'translateX(-50%)',
  fontFamily: fontStack,
  color: colors.muted,
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '8px 16px',
  zIndex: PROMPT_Z_INDEX,
}

/** Short "here's what's on offer" block for stratagemWindow/reactionWindow — name, cost and effect
 *  text for each usable stratagem, plus the trigger and the player's current CP (M6 gap: these
 *  prompts showed raw ids with no effect or CP context). */
function StratagemOffers({ state, player, stratagemIds, triggerLine }: { state: GameState; player: PlayerId; stratagemIds: StratagemId[]; triggerLine: string }) {
  if (stratagemIds.length === 0) return null
  return (
    <div style={infoBlock}>
      <div>
        {triggerLine} · You have {state.players[player].cp} CP
      </div>
      <ul style={stratList}>
        {stratagemIds.map((sid) => {
          const s = state.stratagems[sid]
          if (!s) return null
          return (
            <li key={sid} style={{ marginBottom: 3 }}>
              <strong>
                {s.name} ({s.cost} CP)
              </strong>{' '}
              — {s.text}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function DecisionPrompt() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const events = useGameStore((s) => s.events)
  const pendingSeq = useGameStore((s) => s.pendingSeq)
  const presentedSeq = usePresentedStore((s) => s.presentedSeq)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const setPreviewDraft = useUiStore((s) => s.setPreviewDraft)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDeployTarget = useUiStore((s) => s.setDeployTarget)
  const resetForDecision = useUiStore((s) => s.resetForDecision)
  const hoverUnit = useUiStore((s) => s.hoverUnit)
  const hoverModel = useUiStore((s) => s.hoverModel)
  const hoverObjective = useUiStore((s) => s.hoverObjective)
  const clearBoardHover = () => {
    hoverUnit(null)
    hoverModel(null)
    hoverObjective(null)
  }
  const formationKind = useUiStore((s) => s.formationKind)
  const formationFacing = useUiStore((s) => s.formationFacing)
  const primeFormation = useUiStore((s) => s.primeFormation)
  const recallFormation = useUiStore((s) => s.recallFormation)

  // Delayed hover help on an option (currently the move types — see moveTypeHelp). Kept here rather
  // than in each button so only one card is ever open, and so the timer is cancelled on unmount.
  const [helpFor, setHelpFor] = useState<string | null>(null)
  const helpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelHelp = () => {
    if (helpTimer.current !== null) clearTimeout(helpTimer.current)
    helpTimer.current = null
    setHelpFor(null)
  }
  const scheduleHelp = (id: string) => {
    if (helpTimer.current !== null) clearTimeout(helpTimer.current)
    helpTimer.current = setTimeout(() => setHelpFor(id), HELP_DELAY_MS)
  }
  useEffect(() => () => { if (helpTimer.current !== null) clearTimeout(helpTimer.current) }, [])

  // A hovered option button lights its unit on the board; that highlight must never outlive the button.
  // Unmounting skips onMouseLeave, so clear on unmount, and again whenever the options stop being on
  // screen (opponent's turn, dice still resolving) while the pointer may still be resting on one.
  const optionsHidden = !state || !pending || pending.player === botSeat || presentedSeq < pendingSeq
  useEffect(() => {
    if (optionsHidden) clearBoardHover()
  }, [optionsHidden]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => clearBoardHover, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resetForDecision(); cancelHelp() }, [pending?.id])

  // M4 formation memory (#5): a move-family decision already knows its unit, so it can be primed
  // the moment it becomes pending — 'keep' at the remembered facing if this unit has one, else
  // 'keep' with facing left on "auto" (recomputed from direction of travel on the first click).
  // Deployment doesn't know its target unit yet (that's a separate click on the palette above), so
  // it's primed by the effect below instead, once `deployTargetUnitId` is set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pending) return
    const info = placementInfo(pending)
    if (!info) return
    const mem = recallFormation(info.unitId)
    if (mem) primeFormation('keep', mem.facing, false)
    else primeFormation('keep', 0, true)
  }, [pending?.id])

  // Pile in / consolidate: open with every model where it stands so it can be dragged right away
  // (staying put is always an option); a board click or "Auto" still replaces the draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state || !isApproachPending(pending) || pending.player === botSeat) return
    setDraft(startDraft(state, pending))
  }, [pending?.id])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pending || pending.kind !== 'deployUnit' || !deployTargetUnitId) return
    primeFormation('line', 0, true)
  }, [pending?.id, deployTargetUnitId])

  if (!state || !pending) return null

  if (pending.player === botSeat) {
    return <div style={bannerWrap}>Opponent is thinking…</div>
  }

  // The dice that raised this decision haven't finished showing yet — don't offer a choice about them.
  if (presentedSeq < pendingSeq) {
    return (
      <div style={wrap} data-testid="prompt">
        <div style={hint} data-testid="prompt-resolving">Resolving dice…</div>
      </div>
    )
  }

  const info = placementInfo(pending)
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null
  const passAction = legal?.find((a) => a.type === 'pass') ?? null

  const approach = isApproachPending(pending) ? pending : null
  const draftValidation = activeDraft
    ? approach
      ? validateApproach(state, approach, combinedUnitModels(state, activeDraft.unitId), activeDraft.placements, combinedUnitIds(state, activeDraft.unitId))
      : validateDraft(
        state,
        combinedUnitModels(state, activeDraft.unitId),
        activeDraft.placements,
        pending.kind === 'deployUnit' ? null : (info?.constraints ?? null),
        combinedUnitIds(state, activeDraft.unitId),
        true,
      )
    : null

  const confirmDraft = () => {
    commitStagedDraft()
  }

  const resetDraft = () => {
    if (!activeDraft) return
    if (approach) { setDraft(startDraft(state, approach)); return }
    const placements = formationPlacementsForUnit(state, activeDraft.unitId, activeDraft.anchor, formationFacing, formationKind)
    if (placements.length > 0) setDraft({ ...activeDraft, placements })
  }

  const bespoke = pending.kind === 'deployUnit' || !!info
  // Placement decisions keep the board-click UI as the primary path, but still offer the engine's
  // own pre-validated candidates below — e.g. a coherency repair after a mid-move casualty can be
  // a placement our own delta-translate can't produce, so the fallback list must stay reachable.
  const showFallbackList = pending.kind !== 'deployUnit'
  const listItems: { id: string; label: string; action: Action }[] = (
    hasOptions(pending)
      ? pending.options.map((o) => ({ id: o.id, label: labelForOption(pending, state, events, o), action: o.action }))
      : (legal ?? []).map((a, i) => ({ id: `${a.type}-${i}`, label: describeAction(a, state), action: a }))
  )
    // Decisions with no engine-provided options list every *legal action*, and passing is one of
    // them — which put a second "Pass" in the row next to the dedicated button below.
    .filter((it) => it.action.type !== 'pass' || !passAction)

  // Hover help for whichever option the pointer has rested on.
  const activeHelp = helpForAction(state, listItems.find((it) => it.id === helpFor)?.action)

  const chooseOptionInfo = pending.kind === 'chooseOption' ? chooseOptionInfoFor(pending.context, pending.options, state, pending.player) : undefined

  // Both re-roll prompts (Command Re-roll, and an ability's own rerollOffer) are answered in the
  // interactive dice tray (RerollTray.tsx) instead of this panel's text and buttons: the whole roll is shown
  // as dice and the player clicks the ones to re-roll. The roll itself comes with the decision for Command
  // Re-roll; a rerollOffer names only its id, so it's looked up.
  const rerollRoll = pending.kind === 'commandReroll'
    ? pending.context.roll
    : pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer'
      ? rollForOffer(state, pending.context.data)
      : null
  if (rerollRoll && (pending.kind === 'commandReroll' || pending.kind === 'chooseOption') && rerollTrayModel(state, events, pending, rerollRoll)) {
    const keepAction: Action | null = pending.kind === 'commandReroll'
      ? passAction
      : ((hasOptions(pending) ? pending.options : []).find((o) => o.id === 'keep')?.action ?? null)
    return (
      <div style={wrap} data-testid="prompt">
        <RerollTray key={pending.id} state={state} events={events} pending={pending} roll={rerollRoll} keepAction={keepAction} />
      </div>
    )
  }

  const kindTitle = chooseOptionInfo?.title ?? KIND_TITLE[pending.kind] ?? pending.kind
  const isDeploy = pending.kind === 'deployUnit'

  return (
    <>
      <FormationPicker />
      <div style={isDeploy ? deployWrap : wrap} data-testid="prompt">
      {activeHelp && <OptionHelp help={activeHelp} />}
      <div style={heading}>{kindTitle}</div>
      {chooseOptionInfo && <div style={hint}>{chooseOptionInfo.hint}</div>}
      {pending.kind === 'chooseOption' && (() => {
        const step = pending.context.data?.code === 'cultAmbush' ? pending.context.data.step : null
        if (step === 'marker') return <div style={hint} data-testid="cult-ambush-marker-hint">Blue discs on the board are the legal spots. Hover an option to light its spot, or click a disc.</div>
        const mk = step === 'return' ? offeredAmbushMarker(pending, state) : null
        return mk ? <div style={hint} data-testid="cult-ambush-return-hint">Marker offered: the ringed disc at {mk.pos.x.toFixed(1)}, {mk.pos.z.toFixed(1)}.</div> : null
      })()}

      {pending.kind === 'stratagemWindow' && (
        <StratagemOffers
          state={state}
          player={pending.player}
          stratagemIds={pending.context.usable}
          triggerLine={pending.context.trigger.unitId ? `Triggered by ${state.units[pending.context.trigger.unitId]?.name ?? pending.context.trigger.unitId}` : 'A stratagem window is open'}
        />
      )}
      {pending.kind === 'reactionWindow' && (
        <StratagemOffers
          state={state}
          player={pending.player}
          stratagemIds={(pending.options ?? []).filter((o): o is DecisionOption & { action: Extract<Action, { type: 'useStratagem' }> } => o.action.type === 'useStratagem').map((o) => o.action.stratagemId)}
          triggerLine={`${REACTION_LABEL[pending.context.reaction] ?? pending.context.reaction}${pending.context.enemyUnitId ? ` — ${state.units[pending.context.enemyUnitId]?.name ?? pending.context.enemyUnitId}` : ''}`}
        />
      )}
      {pending.kind === 'reactionWindow' && pending.context.reaction === 'overwatch' && pending.context.enemyUnitId && (() => {
        const enemyId = pending.context.enemyUnitId
        const rows = pending.context.eligibleUnits.map((u) => overwatchReach(state, u, enemyId))
        if (rows.length === 0) return null
        return (
          <div style={infoBlock} data-testid="overwatch-reach">
            {rows.map((r) => (
              <div key={r.unitId}>
                <strong>{state.units[r.unitId]?.name ?? r.unitId}</strong>:{' '}
                {r.total === 0
                  ? 'no ranged weapons'
                  : `${r.canFire} of ${r.total} ranged weapon${r.total === 1 ? '' : 's'} can reach ${state.units[enemyId]?.name ?? enemyId}`}
                {r.inRange > r.canFire && ` (${r.inRange - r.canFire} more in range but blocked — no line of sight or not a legal target)`}
              </div>
            ))}
            <div style={{ fontSize: '0.9em' }}>Measured base to base against each weapon&apos;s range.</div>
          </div>
        )
      })()}
      {pending.kind === 'declareTargets' && (
        <div style={infoBlock} data-testid="shoot-context">
          <div style={{ color: colors.text, fontWeight: 600 }}>
            {state.units[pending.context.unitId]?.name ?? pending.context.unitId} —{' '}
            {pending.context.overwatch ? 'Fire Overwatch (every hit needs an unmodified 6)' : pending.context.attackKind === 'melee' ? 'pick who to fight' : 'pick a target'}
          </div>
          <div>
            Every weapon that can see the unit you pick fires at it. Hover an option for its weapons, the target&apos;s
            Toughness and Save, and what each weapon needs to hit and wound.
            {pending.context.engagedWith.length > 0 &&
              ` In Engagement Range of ${pending.context.engagedWith.map((u) => state.units[u]?.name ?? u).join(', ')}.`}
          </div>
        </div>
      )}

      {pending.kind === 'declareCharge' && (
        <div style={infoBlock} data-testid="charge-context">
          <div style={{ color: colors.text, fontWeight: 600 }}>
            {state.units[pending.context.unitId]?.name ?? pending.context.unitId} — declare a charge
            {pending.context.heroic ? ' (Heroic Intervention)' : ''}
          </div>
          <div>
            Roll 2D6 and move that far; every unit you declare must end up within Engagement Range or the charge fails
            and the unit does not move. Hover an option for the distance, the roll it needs and the odds.
          </div>
        </div>
      )}

      {pending.kind === 'chargeMove' && (
        <div style={infoBlock} data-testid="charge-move-context">
          <div style={{ color: colors.text, fontWeight: 600 }}>Charge roll: {pending.context.roll}&quot;</div>
          <div>
            Move each model up to {pending.context.roll}&quot;, ending within 1&quot; of{' '}
            {pending.context.targetUnitIds.map((u) => state.units[u]?.name ?? u).join(' and ')}.
          </div>
        </div>
      )}

      {(pending.kind === 'pileIn' || pending.kind === 'consolidate') && (
        <div style={infoBlock} data-testid="pile-in-context">
          Drag each model up to {pending.context.distance}&quot; (its grey ring) or leave it where it stands.
          {pending.kind === 'pileIn' ? ' Moved models must end closer to the enemy.' : ' Moved models must end closer to the enemy or an objective.'}
          {activeDraft && (() => {
            const f = fightersAfter(state, activeDraft.unitId, activeDraft.placements)
            const total = activeDraft.placements.length
            return <div data-testid="pile-in-fighters" style={{ color: f.size > 0 ? '#ffb347' : colors.text, fontWeight: 600, marginTop: 4 }}>⚔ {f.size} of {total} models will be able to fight (orange rings)</div>
          })()}
        </div>
      )}

      {pending.kind === 'chooseOption' && pending.context.topic === 'hazardousCasualty' && (() => {
        const weaponId = typeof pending.context.data.weaponId === 'string' ? pending.context.data.weaponId : null
        const die = typeof pending.context.data.die === 'number' ? pending.context.data.die : null
        const weapon = weaponId ? state.weapons[weaponId]?.name : null
        return (
          <div style={infoBlock} data-testid="hazardous-context">
            {weapon ?? 'A Hazardous weapon'} failed its Hazardous test{die !== null ? ` (rolled ${die})` : ''} — a model
            carrying it is destroyed. Choose which model is lost.
          </div>
        )
      })()}

      {pending.kind === 'allocateAttack' && (() => {
        // Same gap as the save choice: the prompt named models but never said what was hitting them.
        const ctx = saveAttackContext(state, events, pending.context.eligibleModels[0] ?? '')
        const dmg = pending.context.damage
        return (
          <div style={infoBlock} data-testid="allocate-context">
            <div style={{ color: colors.text, fontWeight: 600 }}>
              {pending.context.mortal ? 'Mortal wounds' : 'A wound gets through'}
              {ctx?.weaponName ? ` — ${ctx.weaponName} (Armour Penetration ${ctx.ap})` : ''}
              {dmg !== null ? ` · Damage ${dmg}` : ''}
            </div>
            <div>
              From {state.units[pending.context.attackerUnitId]?.name ?? pending.context.attackerUnitId} against{' '}
              {state.units[pending.context.targetUnitId]?.name ?? pending.context.targetUnitId}. Choose which model takes it — hover an
              option to light that figure up on the board.
              {pending.context.precision ? ' Precision: an attached character can be picked out.' : ''}
            </div>
          </div>
        )
      })()}

      {pending.kind === 'deployUnit' && (
        <div style={deployRowVertical}>
          {pending.context.unitIds.map((uid) => (
            <button
              key={uid}
              style={{ ...(uid === deployTargetUnitId ? buttonPrimary : buttonBase), flexShrink: 0, width: '100%', textAlign: 'left' }}
              onClick={() => setDeployTarget(uid)}
            >
              {state.units[uid]?.name ?? uid}
            </button>
          ))}
          {pending.context.reservesAllowed.map((uid) => {
            const reserveAction = legal?.find((a) => a.type === 'deployUnit' && a.unitId === uid && a.toReserves)
            if (!reserveAction) return null
            const abandon = isTeleporting(state, uid)
            const nm = state.units[uid]?.name ?? uid
            return (
              <button
                key={`res-${uid}`}
                style={{ ...(abandon ? buttonDanger : buttonBase), flexShrink: 0, width: '100%', textAlign: 'left' }}
                title={abandon ? 'A teleporting unit that is not placed is destroyed.' : undefined}
                onClick={() => {
                  if (abandon && !window.confirm(`Abandon ${nm}? It cannot return to Reserves and will be destroyed.`)) return
                  dispatch(reserveAction)
                }}
              >
                {abandon ? `Abandon ${nm} (destroyed)` : `Reserves: ${nm}`}
              </button>
            )
          })}
        </div>
      )}

      {pending.kind === 'deployUnit' && pending.constraints.mustTouch && (() => {
        const auto = legal?.find((a): a is Extract<Action, { type: 'deployUnit' }> => a.type === 'deployUnit' && !a.toReserves && a.placements.length > 0)
        const mt = pending.constraints.mustTouch
        return (
          <div style={infoBlock} data-testid="cult-ambush-context">
            <div>One model must touch the Cult Ambush marker (the disc on the board at {mt.pos.x.toFixed(1)}, {mt.pos.z.toFixed(1)}), and every model must end more than {pending.constraints.minDistanceFromEnemies}&quot; from enemies. Click near the marker, or use the button.</div>
            {auto && (
              <button
                style={{ ...buttonPrimary, marginTop: 6 }}
                data-testid="btn-place-at-marker"
                onClick={() => {
                  setDeployTarget(auto.unitId)
                  const first = auto.placements[0]
                  setDraft({ decisionId: pending.id, unitId: auto.unitId, anchor: { x: first.pos.x, z: first.pos.z }, placements: auto.placements })
                }}
              >
                Place at marker
              </button>
            )}
          </div>
        )
      })()}

      {bespoke && (
        <div style={hint}>
          {pending.kind === 'deployUnit'
            ? deployTargetUnitId
              ? 'Click inside your deployment zone to place the unit.'
              : 'Pick a unit above, then click inside your zone.'
            : approach
              ? 'Drag a model to move just it (Shift-drag moves them all). A red ring says why it is not allowed.'
              : 'Click on the board to set a destination — a range ring shows how far the unit can go.'}
        </div>
      )}

      <div style={row}>
        {approach && (
          <button style={buttonBase} data-testid="btn-auto-approach" onClick={() => setDraft(autoDraft(state, approach, legal))}>
            {approach.kind === 'pileIn' ? 'Auto pile in' : 'Auto consolidate'}
          </button>
        )}
        {activeDraft && (
          <>
            <button
              style={draftValidation && !draftValidation.ok ? { ...buttonPrimary, opacity: 0.5, cursor: 'not-allowed' } : buttonPrimary}
              data-testid="btn-confirm"
              disabled={!!draftValidation && !draftValidation.ok}
              title={draftValidation && !draftValidation.ok ? `Can't confirm: ${draftValidation.reasons.join(', ')}` : undefined}
              onClick={confirmDraft}
            >
              Confirm
            </button>
            <button style={buttonBase} data-testid="btn-reset-formation" onClick={resetDraft}>
              Reset
            </button>
            <button style={buttonDanger} data-testid="btn-cancel" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </>
        )}
        {passAction && (
          <button style={buttonBase} data-testid="btn-pass" onClick={() => dispatch(passAction)}>
            {PASS_LABEL[pending.kind] ?? 'Pass'}
          </button>
        )}
      </div>

      {activeDraft && draftValidation && !draftValidation.ok && (
        <div style={{ ...hint, color: colors.danger }} data-testid="draft-issue">
          Can&apos;t confirm: {draftValidation.reasons.join(', ')}
        </div>
      )}

      {showFallbackList && (
        <div style={optionList}>
          {info && listItems.length > 0 && <div style={hint}>Or use a suggested placement — hover one to preview it:</div>}
          {listItems.map((it) => {
            // moveUnit/chargeMove/pileIn/consolidate options carry their own placements — hovering
            // one shows a ghost of where it lands (PlacementOverlay), same colour as a real draft.
            const withPlacements =
              it.action.type === 'moveUnit' || it.action.type === 'chargeMove' || it.action.type === 'pileIn' || it.action.type === 'consolidate'
                ? it.action
                : null
            const hoverTarget = hoverTargetFor(state, pending, it.action, it.id)
            // The card itself is rendered at panel level (see activeHelp) so the option row, which
            // is an overflow:auto scroller, can't clip it.
            const hasHelp = helpForAction(state, it.action) !== null
            return (
              <button
                key={it.id}
                data-testid={`prompt-option-${it.id}`}
                style={buttonBase}
                onFocus={() => hasHelp && setHelpFor(it.id)}
                onBlur={cancelHelp}
                onMouseEnter={() => {
                  if (/^pt:/.test(it.id)) useAmbushHover.getState().set(it.id)
                  if (hasHelp) scheduleHelp(it.id)
                  if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
                  if (hoverTarget?.kind === 'unit') hoverUnit(hoverTarget.ids)
                  if (hoverTarget?.kind === 'model') hoverModel(hoverTarget.id)
                  if (hoverTarget?.kind === 'objective') hoverObjective(hoverTarget.id)
                }}
                onMouseLeave={() => {
                  useAmbushHover.getState().set(null)
                  cancelHelp()
                  setPreviewDraft(null)
                  clearBoardHover()
                }}
                onClick={() => {
                  cancelHelp()
                  setPreviewDraft(null)
                  clearBoardHover()
                  dispatch(it.action)
                  setDraft(null)
                }}
              >
                {it.label}
              </button>
            )
          })}
        </div>
      )}
      </div>
    </>
  )
}
