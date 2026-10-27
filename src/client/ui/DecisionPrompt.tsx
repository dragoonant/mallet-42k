// The single decision prompt (docs/spec/50-client.md §6). Bespoke controls for deployment and the
// four move-family decisions (which need a board click, handled by src/client/interaction/**); every
// other decision kind — including declareTargets/declareCharge, which also accept a click on an enemy
// Figure via UnitsLayer — renders as a plain clickable list here, so no decision can ever get stuck.
import { FloorSelector } from '../interaction/FloorSelector'
import { isClampedMovePending } from '../interaction/moveClamp'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  unitModels,
  type Action, type ChooseOptionTopic, type DecisionOption, type GameEvent, type GameState, type MoveType, type PendingDecision, type PlayerId, type StratagemId,
} from '@/engine'
import { transportService } from '@/engine/transports'
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
import { requestCameraOverview } from '../board/CameraRig'
import { WeaponPanel } from './WeaponPanel'
import { opensWeaponPanel } from '../interaction/decisions'
import { isOversizeForZone } from '../../engine/geometry'
import { groupLabel, groupUnitIds, soleDeployUnit } from '../interaction/embarkGroup'
import { rerollTrayModel, rollForOffer } from './rerollInfo'
import { RerollTray } from './RerollTray'
import { overwatchReach } from './overwatchInfo'
import { useCaughtUp } from '../presentation/presentedStore'
import { buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'
import { Tooltip } from './Tooltip'
import { BottomSheet } from './BottomSheet'
import { useFormFactor } from './formFactor'
import { diePoolName, multiDiePick, toggleDie } from './fate'

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
  bagTarget: { title: "Pick a Bag the Big 'Un target", hint: 'Name an enemy model now. If it is destroyed by the end of the battle you score 8 VP, or 12 VP if your Beastboss made the kill.' },
  battleShockOrder: { title: 'Order battle-shock tests', hint: 'Choose which of your affected units tests for battle shock next.' },
  desperateEscapeCasualty: { title: 'Desperate Escape casualty', hint: 'Choose which model is removed after a failed Desperate Escape roll.' },
  coherencyCull: { title: 'Unit coherency', hint: 'Choose which model(s) to remove so the rest of the unit stays within coherency.' },
  meleeWeapon: { title: 'Choose a melee weapon', hint: "Pick which of this model's melee weapons to fight with." },
  weaponProfile: { title: 'Choose a weapon profile', hint: 'Pick which profile of this weapon to fire.' },
  oathTarget: { title: 'Oath of Moment target', hint: 'Name the enemy unit your army re-rolls hits and wounds against this battle.' },
  waaagh: { title: 'Call the Waaagh!', hint: "One use for the whole battle, and it lasts until the end of this battle round. Every Ork model with the Waaagh! rule gets +1 Strength and +1 Attack with its melee weapons (except weapons that give extra attacks), a 5+ invulnerable save, and can charge even after it Advanced. Models with Dead 'ard also get a 4+ Feel No Pain save. Choose 'Not this round' to save it for a later round." },
  reserveArrival: { title: 'Bring on reinforcements', hint: 'Choose where this unit arrives from reserves.' },
  leaderAttach: { title: 'Attach a leader', hint: 'Choose which bodyguard unit this leader joins.' },
  hazardousCasualty: { title: 'Hazardous casualty', hint: 'A model must be removed for failing its Hazardous test.' },
  rerollOffer: { title: 'Re-roll a die?', hint: 'Choose a die to re-roll, or keep the result.' },
  abilityChoice: { title: 'Ability choice', hint: 'Choose how this ability applies.' },
  chooseSide: { title: 'Choose your side', hint: 'Pick which deployment zone your army sets up in.' },
}

const GLIMPSE_INFO = {
  title: 'Glimpse of Eternity: set a die to 6?',
  hint: 'Once per turn, after a roll for Ahrak, you may change one of its dice to an unmodified 6 (a 3 on a D3 roll). That die cannot be re-rolled afterwards. Pick the die that matters most, or keep the roll as it fell.',
}

/** The number the engine will actually set the die to: 6 normally, capped at 3 on a D3 roll (fix-roll.ts). */
function glimpseValue(data: unknown): number {
  const v = (data as { value?: unknown } | undefined)?.value
  return typeof v === 'number' ? v : 6
}

const FIX_ROLL_TOPIC = 'fixRollOffer'

const METHODICAL_INFO = {
  title: 'Methodical Destruction target',
  hint: 'Name one enemy unit that is still alive. If it has been destroyed by the end of this battle round, by anyone or anything, you score 4 VP.',
}

/** Necron rules reach the player as chooseOption prompts with the generic 'abilityChoice' (or 'other') topic, so
 *  the ability id is what says which rule is asking. Own-words text; matched by id fragment so a renamed
 *  prefix or a variant of the same rule still reads right. */
const ABILITY_PROMPT_INFO: { match: RegExp; info: { title: string; hint: string } }[] = [
  {
    match: /multi-?spectrum-?array/i,
    info: {
      title: 'Multi-spectrum Array: mark a target',
      hint: 'Your Incursors just finished shooting. Pick one enemy unit they hit: until the end of this phase every Adeptus Astartes attack against it gets +1 to the Hit roll, so mark the target your remaining squads are about to shoot.',
    },
  },
  {
    match: /haywire-?mine/i,
    info: {
      title: 'Haywire Mine: detonate it?',
      hint: 'One use per battle. Pick an enemy unit within 3 inches of the mine carrier and roll a D6: on a 2 or more it takes D3 mortal wounds (2D3 if it is a Vehicle). A 1 still uses the mine up. Decline to keep it for a better moment.',
    },
  },
  {
    match: /power-?from-?pain/i,
    info: {
      title: 'Power from Pain: Empower a unit?',
      hint: 'Spend one Pain token to Empower a unit until the end of this phase. An Empowered unit may re-roll its Advance and Charge rolls, and in the Shooting or Fight phase it may re-roll hit rolls. Pick a unit that is about to attack, or keep your tokens for a later phase.',
    },
  },
  {
    match: /saintly-?relic/i,
    info: {
      title: 'Saintly Relic: re-roll the new Miracle die?',
      hint: 'You just gained a Miracle die. The relic lets you throw that one die again and keep the new number, even if it is worse. Keep it if you like the number you got.',
    },
  },
  {
    match: /^divine-?judgement$/i,
    info: {
      title: 'Divine Judgement: choose the judged unit',
      hint: 'The Sororitas player earns points for destroying the unit you name here, and more if it falls in melee. Name the unit the Sororitas will find hardest to destroy, ideally one that stays out of melee. Monsters and vehicles cannot be chosen.',
    },
  },
  {
    match: /martial-?katah-tgb/i,
    info: {
      title: "Choose a Ka'tah stance",
      hint: 'This choice is for the one unit about to fight, and only for this activation. Dacatarai gives its melee weapons an extra hit on a 6 to hit; Rendax makes a 6 to hit wound automatically. Other units pick their own stance when they are selected to fight.',
    },
  },
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
    match: /blessings?-?of-?khorne/i,
    info: {
      title: 'Blessings of Khorne',
      hint: 'Eight dice have been rolled for the new battle round. Matching dice buy a Blessing that lasts the whole round: Wrathful Devotion (any pair) gives your units Feel No Pain 6+, or +1 to Feel No Pain rolls for models that already have it; Total Carnage (a pair of 4s or higher, or any triple) lets a model struck down before its unit fights strike back on a 4+; Warp Blades (a pair of 5s or 6s, or any triple) gives melee weapons Lethal Hits. Up to two Blessings, and one die can never pay for two. Each button lists a combination you can afford.',
    },
  },
  {
    match: /total-?carnage/i,
    info: {
      title: 'Total Carnage',
      hint: 'A model in this unit was struck down before the unit fought. Roll a D6: on a 4+ it is held back, fights once after the attackers finish, and only then is removed.',
    },
  },
  {
    match: /narthecium/i,
    info: {
      title: 'Narthecium: tend the fallen',
      hint: 'Your Apothecary patches up the squad he leads. Pick one fallen soldier (never a character) to stand back up at full wounds, placed in coherency and clear of the enemy. If there is no room, nobody returns. Once per Command phase; decline to skip it.',
    },
  },
  {
    match: /special-?issue-?ammunition/i,
    info: {
      title: 'Special-Issue Ammunition: pick a load',
      hint: 'Choose one set of rounds for every ranged weapon in this unit until the end of the phase. Set A hurts big targets: Anti-Monster 5+, Anti-Vehicle 5+ and Melta 2. Set B favours volume: Assault, Ignores Cover and Sustained Hits 2.',
    },
  },
  {
    match: /hunters?-?insight/i,
    info: {
      title: "Hunters' Insight: pick an objective",
      hint: 'Name one objective marker that is not inside your own deployment zone. When the next enemy turn ends you score 4 VP if you control it and one of your Adeptus Astartes units that is not Battle-shocked has a model within range of it. The pick is used up either way.',
    },
  },
  {
    match: /deathwatch-?teleportarium/i,
    info: {
      title: 'Deathwatch Teleportarium',
      hint: 'A unit that is not locked in combat vanishes into Reserves. It returns in the Reinforcements step of your next Movement phase, set up more than 3" from every enemy model, and cannot charge on the turn it arrives. A unit still off the board when the battle ends is lost. Once per battle.',
    },
  },
  {
    match: /tireless-?hunter/i,
    info: {
      title: 'Tireless Hunter: name your quarry',
      hint: "Pick one enemy unit, on the battlefield or still in Reserves. For the rest of the battle, every attack your Battle Leader makes against that unit, shooting or melee, adds 1 to the wound roll. Other models in his unit get no bonus, so name the unit he is most likely to face.",
    },
  },
  {
    match: /omnissiahs?-?blessing/i,
    info: {
      title: "Omnissiah's Blessing: mend a model?",
      hint: 'The Enginseer can patch up one friendly Adeptus Mechanicus model within 3 inches (a Dunecrawler or a Kataphron counts, and so does the Enginseer himself). It regains up to D3 lost wounds. Each model can be mended only once per Command phase, so pick the most damaged one, or decline.',
    },
  },
  {
    match: /imperative-?surge-?wafer/i,
    info: {
      title: 'Imperative Surge-wafer: activate it?',
      hint: "One use for the whole battle. Until the end of this phase, every ranged weapon in the bearer's unit gains Precision, so its hits can be aimed at a Character leading an enemy unit. It can be fired when the unit shoots or when it makes an Overwatch attack. Save it for a target that matters, or decline.",
    },
  },
  {
    match: /doctrina|doctrinaimperatives/i,
    info: {
      title: 'Choose a Doctrina Imperative',
      hint: 'Pick one stance for the whole battle round. Protector: your ranged weapons gain Heavy, and while a unit stands in your own deployment zone, enemy ranged attacks against it lose a point of AP. Conqueror: your ranged weapons gain Assault, and your shots at targets inside the enemy deployment zone gain a point of AP. It lasts until the end of this battle round.',
    },
  },
  {
    match: /line-?breakers/i,
    info: {
      title: 'Line-breakers target',
      hint: 'Your charging unit has just finished its move. Name one enemy unit it is touching: roll a die for each of your models in contact, and every 4+ deals a mortal wound (every roll gets +2 if the unit started within 6" of a friendly Battleline unit).',
    },
  },
  {
    match: /targeted-?purge/i,
    info: {
      title: 'Name the unit to protect',
      hint: "Your opponent's Targeted Purge: pick one unit of YOUR army that is not a Monster or a Vehicle. If it has been destroyed when the battle ends, the Mechanicus player scores 12 VP. Choose the unit you are most sure of keeping alive.",
    },
  },
  {
    match: /ethereal-?edict/i,
    info: {
      title: 'Name the unit to protect',
      hint: "Your opponent's Ethereal Edict: pick one unit of YOUR army (any unit, even one still in reserve). If it has been destroyed when the battle ends, the T'au player scores 12 VP. Choose the unit you are most sure of keeping alive.",
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
    match: /dark-pacts-dz/i,
    info: {
      title: 'Make a Dark Pact?',
      hint: 'The unit gains the power you pick right away, no test needed, for every weapon it fires this phase. After its attacks are done it tests its nerve (2D6 against Leadership); on a failure it takes D3 mortal wounds. Decline to skip all of it.',
    },
  },
  {
    match: /hateful-exhortation/i,
    info: {
      title: 'Mark an enemy unit',
      hint: 'The chosen enemy unit is marked for the whole battle. While the bearer lives, the unit the bearer leads gets +1 AP on critical wounds against the marked unit.',
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
    match: /neural-disruption/,
    info: {
      title: 'Neural Disruption',
      hint: 'Pick an enemy unit within 12 inches of this model, seen or not. It takes a Battle-shock test right now. Choose the unit most likely to crack.',
    },
  },
  {
    match: /neurogoad/,
    info: {
      title: 'Neurogoad',
      hint: 'Pick a friendly Tyranid unit within 12 inches of the bearer (its own unit counts). Until your next Command phase it re-rolls its charge rolls and its hit rolls.',
    },
  },
  {
    match: /psionic-phantoms/,
    info: {
      title: 'Psionic Phantoms',
      hint: 'The bearer is being shot at. Once per battle round it may slip up to 6 inches away first. If the shooters then cannot see it, a D6 decides: on 1-3 they re-pick targets, on 4-6 they fire nothing this phase.',
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
      hint: 'Split this unit into smaller units before deployment, or keep it as one larger unit. Each part keeps every ability.',
    },
  },
  {
    match: /strategic-dispersal/,
    info: {
      title: 'Strategic Dispersal',
      hint: 'After this unit finishes shooting, it may move up to D6 inches, provided it is not engaged with the enemy. Decline to hold your ground.',
    },
  },
  {
    match: /suppression-fire/,
    info: {
      title: 'Suppression Fire',
      hint: 'Pick an enemy unit to pin down. All of its attacks get -1 to hit until your next turn, for as long as the Suppressors survive.',
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
    match: /strands-of-fate/,
    info: {
      title: 'Strands of Fate',
      hint: 'Your starting Fate dice. Keep the set you rolled, or throw the whole set again with one die fewer. Later, you can spend a Fate die in place of one die of a hit, wound, save, damage, charge, Advance or Battle-shock roll for a unit that has this rule.',
    },
  },
  {
    match: /(^|\.)fortune$|a\.fortune/,
    info: {
      title: 'Fortune',
      hint: 'Your Farseer has read the threads: pick a friendly Aeldari unit within 12 inches of her. Until your next Command phase, every attack aimed at that unit takes -1 on its wound roll.',
    },
  },
  {
    match: /defenders-of-fate/,
    info: {
      title: 'Defenders of Fate',
      hint: 'At the end of your Command phase, for each objective you hold that a Guardian Defender stands on, roll a die and add a Fate die showing that number.',
    },
  },
  {
    match: /storm-of-shots/,
    info: {
      title: 'Storm of Shots',
      hint: 'A second Mounted unit that has not shot yet may join in: every attack its models make this phase adds 1 to the hit roll. Or keep the stratagem to the first unit only.',
    },
  },
  {
    match: /zephyr-swift/,
    info: {
      title: 'Zephyr-swift',
      hint: 'A second Mounted unit, not engaged with the enemy, may make the same Normal move of up to 6 inches (it cannot charge afterwards). Or keep the stratagem to the first unit only.',
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
    match: /grim-efficiency/,
    info: {
      title: 'Grim Efficiency: mark an enemy',
      hint: 'Once per battle round your Kahl may mark one enemy unit he can see with a Judgement token (a unit holds at most 2). Votann attacking a marked unit hit it more easily, and against a unit with two marks they wound it more easily too. Pick the unit your army is about to shoot.',
    },
  },
  {
    match: /outflanking-mag-riders/,
    info: {
      title: 'Outflanking Mag-Riders',
      hint: 'At the end of the opponent’s turn, a mounted unit near a battlefield edge and clear of enemies may ride off the board. It must come back in your next Movement phase, wholly within 6" of a board edge that is not the opponent’s, more than 9" from every enemy. A unit still off the board when the battle ends is lost. Pick the unit to send, or leave everyone where they stand.',
    },
  },
  {
    match: /vb-stronghold-pick/,
    info: {
      title: 'Take the Stronghold: name a marker for your foe',
      hint: 'Your opponent is hunting an objective of your choosing. Pick one objective marker that is not in your own deployment zone. At the end of each of their turns they score 5 VP if they control it, so name the marker they will find hardest to hold.',
    },
  },
  {
    match: /vb-bladeguard/,
    info: {
      title: 'Bladeguard stance',
      hint: 'Pick one stance for this Bladeguard Veteran Squad until the end of the Fight phase. Swords: its melee attacks re-roll Hit rolls of 1. Shields: each invulnerable save made for it re-rolls a 1 (armour saves are never re-rolled). Or stand with neither.',
    },
  },
  {
    match: /toil-earns-pick/,
    info: {
      title: 'Toil Earns: choose your objective',
      hint: 'Pick one objective marker outside your own deployment zone. From battle round 2, at the end of each of your turns you score 4 VP if you control it. Choose one you can realistically hold.',
    },
  },
  {
    match: /righteous-defiance/,
    info: {
      title: 'Righteous Defiance: stand firm?',
      hint: 'Your Marshal and his unit are being attacked. Once per battle you may call on this: every model in the unit, the Marshal included, shrugs off each wound on a 4+ until the end of the phase. The Marshal already shrugs off wounds on a 5+ all the time. Spend it on an attack you expect to hurt.',
    },
  },
  {
    match: /sacred-vow/,
    info: {
      title: 'Sacred Vow: name your quarry',
      hint: 'Swear to destroy one enemy unit this round (one vow per round, from round 2). At the end of the round you score 3 VP if the unit was destroyed this round by a melee attack from one of your Adeptus Astartes models, or 4 VP if that model belongs to the Primaris Crusader Squad. Pick a unit your fighters can reach and finish off in close combat.',
    },
  },
  {
    match: /archeotech-reliquary/,
    info: {
      title: 'Archeotech Reliquary: name the relic site',
      hint: 'Your opponent holds a secret relic objective, and you pick which objective marker it is. At the end of the battle they score 10 VP if they control that marker, so name the one they are least likely to hold.',
    },
  },
  {
    match: /holy-apparatus-pick/,
    info: {
      title: 'Holy Apparatus: choose this round’s target',
      hint: 'Pick one enemy unit that carries at least one Judgement token. If it is destroyed by the end of this battle round, by anything, you score 4 VP. Choose the unit most likely to fall.',
    },
  },
  {
    match: /methodical-destruction/,
    info: METHODICAL_INFO,
  },
  {
    match: /walking-?plague/i,
    info: {
      title: 'Walking Plague: raise the infected',
      hint: 'Pick a Poxwalkers unit near the bearer that has lost models. Roll a die: that many fallen Poxwalkers climb back in, at full health, as many as there is room for. Decline to skip this turn.',
    },
  },
  {
    match: /cabal-of-sorcerers/,
    info: {
      title: 'Cabal Rituals',
      hint: 'Your Psykers have filled the Cabal pool. Spend it now on a Ritual, each usable once per phase. Weaver of Fates (2 points): until the end of the phase, one failed save by a Thousand Sons unit within 18 inches of the chosen Psyker may be re-rolled. Echoes from the Warp (6 points): the chosen Psyker’s unit can be the target of one Stratagem for 0 CP. Choose Done to keep your points for a later phase.',
    },
  },
  {
    match: /weaver-of-fates/,
    info: {
      title: 'Weaver of Fates: re-roll the save?',
      hint: 'A Thousand Sons model failed a saving throw within reach of your chosen Psyker. Throw the failed die again and keep the new result, even if it is worse. This works once per phase, so use it on a save that matters.',
    },
  },
  {
    match: /glimpse-of-eternity/,
    info: GLIMPSE_INFO,
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

/** Exported for tests/client/blackTemplars.test.ts. */
export function chooseOptionInfoFor(
  context: { topic: ChooseOptionTopic; abilityId: string | null; unitId?: string | null; data?: Record<string, unknown> },
  options?: readonly { id: string }[],
  state?: GameState,
  player?: string,
): { title: string; hint: string } | undefined {
  if ((context.topic as string) === MIRACLE_TOPIC) {
    const purpose = typeof context.data?.purpose === 'string' ? ROLL_PURPOSE_LABEL[context.data.purpose] ?? context.data.purpose : 'this'
    const pool = miraclePool(context.data)
    if (diePoolName(state, player as PlayerId | undefined) === 'Fate') {
      const max = typeof context.data?.maxSubstitutions === 'number' ? context.data.maxSubstitutions : 1
      return {
        title: `Fate dice: ${purpose} roll`,
        hint: `Spend ${max > 1 ? `up to ${max} of` : 'one of'} your Fate dice (${pool.length > 0 ? pool.join(', ') : 'none left'}) in place of ${max > 1 ? 'that many dice' : 'a die'} of this roll. A Fate die counts as an unmodified roll, and a spent die is gone. Or roll as normal and keep them.`,
      }
    }
    return {
      title: `Act of Faith: ${purpose} roll`,
      hint: `Spend one of your Miracle dice (${pool.length > 0 ? pool.join(', ') : 'none left'}) and its number counts as the roll instead of a fresh die. Modifiers still apply after, and a spent die is gone. Or roll as normal and keep them.`,
    }
  }
  if ((context.topic as string) === FIX_ROLL_TOPIC) {
    const purpose = typeof context.data?.purpose === 'string' ? ROLL_PURPOSE_LABEL[context.data.purpose] ?? context.data.purpose : undefined
    const value = glimpseValue(context.data)
    const hint = value === 6 ? GLIMPSE_INFO.hint : GLIMPSE_INFO.hint.replace('unmodified 6 (a 3 on a D3 roll)', `unmodified ${value} (the highest a D3 can show)`)
    return {
      title: purpose ? `Glimpse of Eternity: ${purpose} roll, set a die to ${value}?` : `Glimpse of Eternity: set a die to ${value}?`,
      hint,
    }
  }
  if (context.topic === 'other' && context.data?.kind === 'embark') {
    const uname = context.unitId && state ? groupLabel(state, context.unitId) : undefined
    const pair = !!context.unitId && !!state && groupUnitIds(state, context.unitId).length > 1
    return {
      title: `Embark ${uname ?? 'this unit'}?`,
      hint: `The unit finishes its move beside a friendly transport. Climbing aboard takes it off the battlefield (it can disembark in a later Movement phase); staying keeps it on the board where it is.${pair ? ' The attached Leader travels with its bodyguard, so both embark together and count against the capacity of the transport.' : ''}`,
    }
  }
  // Mighty Saga (Space Wolves) reuses the Bag the Big 'Un pick, but names a Character, Monster or Vehicle and pays on the whole unit.
  if (context.topic === 'bagTarget' && state && player && state.players[player as PlayerId]?.faction === 'space-wolves') {
    return {
      title: 'Pick a Mighty Saga quarry',
      hint: "Name an enemy Character, Monster or Vehicle model now. At the end of the battle you score 8 VP if that model was destroyed, or 12 VP if its whole unit was destroyed by your Battle Leader's own attacks.",
    }
  }
  const choice = context.data && typeof context.data.choice === 'string' ? CHOICE_PROMPT_KEYS[context.data.choice] : undefined
  // Both Cult Ambush steps (marker, return) carry the code; the return step has no ability id.
  const key = context.data?.code === 'toilEarnsPick' ? 'toil-earns-pick' : context.data?.code === 'vbTakeTheStrongholdPick' ? 'vb-stronghold-pick' : context.data?.code === 'vbBladeguardPick' ? 'vb-bladeguard-pick' : context.data?.code === 'archeotechReliquaryPick' ? 'archeotech-reliquary' : context.data?.code === 'sacredVowPick' ? 'sacred-vow' : context.data?.code === 'righteousDefiance' || context.data?.code === 'righteousDefianceFight' ? 'righteous-defiance' : context.data?.code === 'holyApparatusPick' ? 'holy-apparatus-pick' : context.data?.code === 'cultAmbush' ? 'cult-ambush' : context.data?.code === 'etherealEdictPick' ? 'ethereal-edict' : context.data?.code === 'divineJudgementPick' ? 'divine-judgement' : context.data?.code === 'targetedPurgePick' ? 'targeted-purge' : context.data?.code === 'doctrinaImperatives' ? 'doctrina' : context.data?.code === 'blessingsOfKhorne' ? 'blessings-of-khorne' : context.data?.code === 'lineBreakers' ? 'line-breakers' : context.data?.code === 'tirelessHunter' ? 'tireless-hunter' : context.data?.code === 'huntersInsightPick' ? 'hunters-insight' : context.data?.code === 'specialIssueAmmunition' ? 'special-issue-ammunition' : context.data?.code === 'narthecium' ? 'narthecium' : context.abilityId ?? choice ?? null
  if (choice === 'patrol-squads' && Array.isArray(context.data?.sizes)) {
    const sizes = (context.data.sizes as number[]).filter((n) => typeof n === 'number')
    if (sizes.length > 0) {
      const total = sizes.reduce((a, b) => a + b, 0)
      return {
        title: 'Patrol Squads',
        hint: `Split this unit into ${sizes.length === 2 ? 'two units' : `${sizes.length} units`} of ${sizes.join(' and ')} before deployment, or keep it as one unit of ${total}. Each part keeps every ability.`,
      }
    }
  }
  const byAbility = key ? ABILITY_PROMPT_INFO.find((a) => a.match.test(key)) : undefined
  if (byAbility) return byAbility.info
  // Order offers carry ids like "am.order.take-aim@A:shock-a" whichever ability id the engine attaches.
  if (options?.some((o) => ORDER_OPTION.test(o.id))) return ABILITY_PROMPT_INFO.find((a) => a.match.test('voice-of-command'))?.info
  // Methodical Destruction is a mission-hook pick: no ability id, and every option names an enemy unit.
  if (context.topic === 'abilityChoice' && !context.abilityId && state && options) {
    const picks = options.filter((o) => o.id !== 'decline')
    if (picks.length > 0 && picks.every((o) => state.units[o.id] && state.units[o.id].player !== player)) return METHODICAL_INFO
  }
  // Strategic Aggression shares the Bag the Big 'Un pick, but names a Monster/Vehicle (or a Character) for a flat 10 VP.
  if (context.topic === 'bagTarget' && state && player && state.players[player as PlayerId]?.faction === 'blood-angels') {
    return { title: 'Strategic Aggression: pick a target', hint: 'Name an enemy model now, ideally a Monster or Vehicle (you are only offered Characters if they have none). If it has been destroyed by the end of the battle, by anyone, you score 10 VP.' }
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
  declareTargets: 'Fire nothing',
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
    case 'chooseUnitToActivate': {
      const tid = a.unitId && state.phase === 'movement' ? transportService.transportOf(state, a.unitId) : null
      return tid ? `Disembark ${groupLabel(state, a.unitId)} from ${unitName(tid)}` : `Activate ${unitName(a.unitId)}`
    }
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

/** Cabal Rituals (Thousand Sons): options are `weaver:<psyker model id>`, `echoes:<psyker model id>` and `done`. */
function cabalRitualLabel(state: GameState, optionId: string): string | null {
  const m = /^(weaver|echoes):(.+)$/.exec(optionId)
  if (!m) return null
  const model = state.models[m[2]]
  const unit = model ? state.units[model.unitId] : undefined
  const who = unit ? `${prettifyId(model!.datasheetModelId)} (${unit.name})` : m[2]
  return m[1] === 'weaver'
    ? `Weaver of Fates (2 points): saves re-rolled around ${who}`
    : `Echoes from the Warp (6 points): ${who}'s unit takes one Stratagem free`
}

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
        const poolName = diePoolName(state, pending.player)
        return picked && picked.length > 0 ? `Spend ${picked.length > 1 ? `${picked.length} ${poolName} dice` : `a ${poolName} die`} (${picked.join(', ')})` : `Spend a ${poolName} die`
      }
      if ((pending.context.topic as string) === FIX_ROLL_TOPIC) {
        if (o.id === 'keep') return 'Keep the roll as it fell'
        const die = /^fix:(\d+)$/.exec(o.id)
        if (die) {
          const i = Number(die[1])
          const cur = /\((\d+)\)/.exec(o.label)?.[1] // the engine's own label carries the current face
          return `Change die ${i + 1}${cur !== undefined ? ` (${cur})` : ''} to a ${glimpseValue(pending.context.data)}`
        }
      }
      const ritual = cabalRitualLabel(state, o.id)
      if (ritual) return ritual
      if (pending.context.topic === 'other' && pending.context.data?.kind === 'embark') {
        if (o.id === 'stay') return 'Stay on the battlefield'
        const tr = state.units[o.id.replace(/^embark:/, '')]
        if (tr) return `Embark ${pending.context.unitId ? groupLabel(state, pending.context.unitId) : 'the unit'} into ${tr.name}`
      }
      if ((pending.context.data?.code === 'divineJudgementPick' || pending.context.data?.code === 'holyApparatusPick' || pending.context.data?.code === 'targetedPurgePick' || pending.context.data?.code === 'lineBreakers' || pending.context.data?.code === 'sacredVowPick') && state.units[o.id]) return state.units[o.id].name
      if (pending.context.data?.code === 'toilEarnsPick' || pending.context.data?.code === 'archeotechReliquaryPick') return objectiveLabel(o.id)
      if (pending.context.data?.code === 'huntersInsightPick' && o.id !== 'decline') return objectiveLabel(o.id)
      if (pending.context.data?.code === 'specialIssueAmmunition' || (pending.context.abilityId && /special-?issue-?ammunition/i.test(pending.context.abilityId))) {
        if (o.id === 'A') return 'Set A: Anti-Monster 5+, Anti-Vehicle 5+, Melta 2'
        if (o.id === 'B') return 'Set B: Assault, Ignores Cover, Sustained Hits 2'
      }
      if (pending.context.data?.code === 'narthecium' || (pending.context.abilityId && /narthecium/i.test(pending.context.abilityId))) {
        if (o.id === 'decline') return 'Return no one'
        // The option id is a destroyed model id (gone from state.models), so name it from the unit's destroyed snapshot.
        const bodyguardId = (pending.context.data?.bodyguardId as string | undefined) ?? pending.context.unitId ?? undefined
        const snap = bodyguardId ? state.units[bodyguardId]?.destroyedModels?.find((m) => m.id === o.id) : undefined
        if (snap) {
          const guns = snap.weapons.map((w) => state.weapons[w]?.name ?? prettifyId(w)).join(' + ')
          return `Return a fallen ${prettifyId(snap.datasheetModelId)}${guns ? ` (${guns})` : ''}`
        }
        return o.label
      }
      if (pending.context.abilityId && /grim-efficiency|outflanking-mag-riders/i.test(pending.context.abilityId) && state.units[o.id]) return state.units[o.id].name
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
  if (/blessings?-?of-?khorne/i.test(abilityId)) {
    if (/^(decline|skip|none|pass)$/i.test(o.id)) return 'No Blessing this round'
    // The engine label already names each Blessing with its dice; do not rebuild it.
    return o.label
  }
  if (/doctrina/i.test(abilityId)) {
    if (/protector/i.test(o.id)) return 'Protector: Heavy guns, and enemy shots at units in your zone lose 1 AP'
    if (/conqueror/i.test(o.id)) return 'Conqueror: Assault guns, and your shots into the enemy zone gain 1 AP'
  }
  if (/teleport-?assault|outflanking-mag-riders/i.test(abilityId)) {
    if (/^(decline|skip|pass|none|stay)$/.test(o.id)) return 'Stay where they are'
  }
  if (/saintly-?relic/i.test(abilityId)) {
    if (o.id === 'reroll') return 'Re-roll the new Miracle die'
    if (o.id === 'keep') return 'Keep the die as rolled'
  }
  if (/righteous-defiance/i.test(abilityId)) {
    if (o.id === 'use') return 'Stand firm: Feel No Pain 4+ for the whole unit until the end of the phase (once per battle)'
    if (o.id === 'decline') return 'Save it for later'
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
// Deployment-only dock: a wide, short strip along the very bottom of the screen (owner playtest
// 2026-10: the old tall left sidebar ate too much of the board). Combat Patrol's deployment zones
// (src/data/missions/cp-0*.json) are full-board-width strips hugging the board's near/far edge, which
// with the overview camera project to bands ending around ~74% of viewport height — so the strip is
// capped well under a quarter of the height and its roster scrolls inside it rather than growing up
// into the near-side zone. Left/right insets clear the Stratagems tab (bottom-left) and the event-log
// drawer tab (right edge).
const deployWrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: 200,
  right: 56,
  bottom: 10,
  maxHeight: '22vh',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  overflowY: 'auto',
  pointerEvents: 'auto',
  zIndex: PROMPT_Z_INDEX,
}
// --- compact (phone) variants: used only when useFormFactor().compact, inside the BottomSheet ---
const TOUCH_MIN = 44
/** Touch-size a button style: >= 44px tall. */
const touchBtn = (b: CSSProperties, extra: CSSProperties = {}): CSSProperties => ({ ...b, minHeight: TOUCH_MIN, fontSize: 14, padding: '0 16px', ...extra })
const rowCompact: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }
const deployRowCompact: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const optionListCompact: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const optionBtnCompact: CSSProperties = { whiteSpace: 'normal', textAlign: 'left', flex: '1 1 200px', lineHeight: 1.25, padding: '8px 12px', minHeight: TOUCH_MIN, fontSize: 14 }
/** Pick-to-confirm bar on touch: the tapped choice's name on a wide button, plus a way to back out. */
const armedChooseBtn: CSSProperties = { flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }
const heading: CSSProperties = { fontWeight: 700, fontSize: 14, paddingRight: 30 }
const hint: CSSProperties = { ...mutedText }
const infoBlock: CSSProperties = { ...mutedText, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }

/** Info block under the prompt title. When `collapsible` (phone layout with an action panel such as the weapon panel
 *  open) it folds to a single ellipsised line with a "More" toggle so the panel's action row keeps the room; the
 *  whole line is the 44px tap target. Otherwise it renders exactly the original two-part block. It is a div with
 *  role="button", not a <button>, only so the sheet's blanket button sizing doesn't apply to the expanded text. */
function CollapsibleInfo({ testId, head, collapsible, children }: { testId: string; head: string; collapsible: boolean; children: ReactNode }) {
  const [more, setMore] = useState(false)
  if (!collapsible) {
    return (
      <div style={infoBlock} data-testid={testId}>
        <div style={{ color: colors.text, fontWeight: 600 }}>{head}</div>
        <div>{children}</div>
      </div>
    )
  }
  const toggle = () => setMore((m) => !m)
  return (
    <div style={{ ...infoBlock, padding: '0 8px' }} data-testid={testId} data-collapsed={more ? 'false' : 'true'}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={more}
        data-testid={`${testId}-more`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0, color: colors.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{head}</span>
        <span style={{ flex: '0 0 auto', color: colors.accent, fontWeight: 600 }}>{more ? 'Less ▴' : 'More ▾'}</span>
      </div>
      {more && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  )
}
const stratList: CSSProperties = { margin: '4px 0 0 16px', padding: 0, fontSize: 11.5 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
/** The deploy palette (unit chips + Reserves buttons) as one wrapping row for the bottom strip
 *  (`deployWrap`); it scrolls inside its own box past two rows so the strip stays short. */
const deployRowWide: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 96, overflowY: 'auto' }
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
/** On a phone the help card sits in the sheet's scrolling body instead of floating over the board. */
const helpCardInline: CSSProperties = { ...helpCard, position: 'static', bottom: 'auto', width: 'auto', pointerEvents: 'auto' }

/** Hover help for one option, shown above the row (the prompt itself is at the bottom of the
 *  screen, so a card below it would be off-screen). */
/** Spend several pool dice on one fast-rolled batch (Fate dice, maxSubstitutions > 1): toggle up to `max` dice, then send
 *  optionId 'use' with their pool indexes (in the order picked, which is the order they replace dice). */
function MultiDicePick({ pending, poolName, dispatch }: {
  pending: Extract<PendingDecision, { kind: 'chooseOption' }>
  poolName: string
  dispatch: (a: Action) => void
}) {
  const multi = multiDiePick(pending.context.data)
  const [selected, setSelected] = useState<number[]>([])
  if (!multi) return null
  const template = pending.options.find((o) => o.id === 'skip')?.action
  if (!template || template.type !== 'chooseOption') return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="miracle-multi">
      <div style={hint}>Pick up to {multi.max} {poolName} dice to spend ({selected.length} picked):</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {multi.pool.map((v, i) => {
          const on = selected.includes(i)
          return (
            <button
              key={i}
              data-testid={`miracle-die-${i}`}
              aria-pressed={on}
              style={on ? buttonPrimary : buttonBase}
              onClick={() => setSelected((cur) => toggleDie(cur, i, multi.max))}
            >
              {v}
            </button>
          )
        })}
      </div>
      <div>
        <button
          style={selected.length > 0 ? buttonPrimary : buttonBase}
          disabled={selected.length === 0}
          data-testid="miracle-use"
          onClick={() => dispatch({ ...template, optionId: 'use', dieIndexes: selected })}
        >
          {selected.length === 0 ? `Spend ${poolName} dice` : `Spend ${selected.length} ${poolName} ${selected.length === 1 ? 'die' : 'dice'} (${selected.map((i) => multi.pool[i]).join(', ')})`}
        </button>
      </div>
    </div>
  )
}

function OptionHelp({ help, inline = false }: { help: PromptHelp; inline?: boolean }) {
  return (
    <div style={inline ? helpCardInline : helpCard} data-testid="option-help" role="tooltip">
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
  // The same stratagem is offered once per eligible unit (e.g. Fire Overwatch for two Flesh Hounds units): list it once.
  stratagemIds = [...new Set(stratagemIds)]
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

/** The prompt can be tucked away so it never hides the board (owner: an Overwatch prompt covered most of
 *  the screen): a minimise button in the panel's corner, and a pill in its place to bring it back. */
export function DecisionPrompt() {
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const minimizedFor = useUiStore((s) => s.promptMinimizedFor)
  const minimizePrompt = useUiStore((s) => s.minimizePrompt)
  const minimized = !!pending && pending.player !== botSeat && minimizedFor === pending.id
  return (
    <>
      <div style={{ display: minimized ? 'none' : 'contents' }}>
        <DecisionPromptBody />
      </div>
      {minimized && (
        <button style={{ ...bannerWrap, ...buttonPrimary, cursor: 'pointer', pointerEvents: 'auto' }} data-testid="btn-prompt-restore" onClick={() => minimizePrompt(null)}>
          ▲ Show prompt: {KIND_TITLE[pending.kind] ?? 'decision'}
        </button>
      )}
    </>
  )
}

function MinimizeButton({ decisionId }: { decisionId: string }) {
  const minimizePrompt = useUiStore((s) => s.minimizePrompt)
  return (
    <Tooltip title="Minimise" body="Hide this prompt to see the board. A button at the bottom brings it back.">
      <button
        style={{ ...buttonBase, position: 'absolute', top: 6, right: 6, padding: '0 8px', lineHeight: '20px', fontSize: 14 }}
        data-testid="btn-prompt-minimize"
        aria-label="Minimise prompt"
        onClick={() => minimizePrompt(decisionId)}
      >
        –
      </button>
    </Tooltip>
  )
}

function DecisionPromptBody() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const events = useGameStore((s) => s.events)
  const pendingSeq = useGameStore((s) => s.pendingSeq)
  const caughtUp = useCaughtUp(pendingSeq)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const setPreviewDraft = useUiStore((s) => s.setPreviewDraft)
  const deployFramed = useRef(false)
  const humanDeployLeft = useRef(0)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDeployTarget = useUiStore((s) => s.setDeployTarget)
  const resetForDecision = useUiStore((s) => s.resetForDecision)
  const hoverUnit = useUiStore((s) => s.hoverUnit)
  const hoverModel = useUiStore((s) => s.hoverModel)
  const hoverObjective = useUiStore((s) => s.hoverObjective)
  const shootStage = useUiStore((s) => s.shootStage)
  const clearBoardHover = () => {
    hoverUnit(null)
    hoverModel(null)
    hoverObjective(null)
  }
  const { compact } = useFormFactor()
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

  // Touch has no hover, so a choice is two taps: the first "arms" it (its unit lights up on the board, its
  // help card shows, its ghost previews), the second — on the same choice, or the Choose button — commits.
  const [armedId, setArmedId] = useState<string | null>(null)
  const helpRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (compact && helpFor) helpRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [compact, helpFor])

  // A hovered option button lights its unit on the board; that highlight must never outlive the button.
  // Unmounting skips onMouseLeave, so clear on unmount, and again whenever the options stop being on
  // screen (opponent's turn, dice still resolving) while the pointer may still be resting on one.
  const optionsHidden = !state || !pending || pending.player === botSeat || !caughtUp
  useEffect(() => {
    if (optionsHidden) clearBoardHover()
  }, [optionsHidden]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => clearBoardHover, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resetForDecision(); cancelHelp(); setArmedId(null) }, [pending?.id])

  // A mid-game disembark names exactly one unit: pre-select it so the very next board click places it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pending?.kind === 'deployUnit' && state?.phase === 'movement' && pending.player !== botSeat) {
      const sole = soleDeployUnit(state, pending.context.unitIds)
      if (sole) setDeployTarget(sole)
    }
  }, [pending?.id])

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

  // Phone: the formation strip and the folded sheet cover the bottom third of the screen, which is exactly where the
  // default view puts a deployment zone. Once a unit is picked, ease the camera over the zone's centre so the area to
  // tap sits in the open middle of the screen.
  useEffect(() => {
    if (!compact || !pending || pending.kind !== 'deployUnit' || !deployTargetUnitId || pending.player === botSeat) return
    const zone = pending.context.zone as { x: number; z: number }[] | undefined
    if (!zone || zone.length === 0) return
    useUiStore.getState().focusCamera({
      x: zone.reduce((a, p) => a + p.x, 0) / zone.length,
      z: zone.reduce((a, p) => a + p.z, 0) / zone.length,
    })
    if (state?.phase === 'deployment') deployFramed.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, pending?.id, deployTargetUnitId])

  // Phone: that zoom-in must not outlive deployment. Ease back to the overview once the deployment phase is over, or
  // as soon as the human's last unit is down (the bot may still be deploying). The unit count is read while the
  // human's own deploy decision is open: a count of 1 means the unit being placed is the last one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!compact) { deployFramed.current = false; return }
    if (pending?.kind === 'deployUnit' && pending.player !== botSeat && state?.phase === 'deployment') humanDeployLeft.current = pending.context.unitIds.length
    if (!deployFramed.current) return
    const humanDone = state?.phase !== 'deployment' || (pending?.kind === 'deployUnit' && pending.player === botSeat && humanDeployLeft.current <= 1)
    if (humanDone) {
      deployFramed.current = false
      requestCameraOverview()
    }
  }, [compact, state?.phase, pending?.id, pending?.kind, pending?.player])

  if (!state || !pending) return null

  if (pending.player === botSeat) {
    return <div style={compact ? { ...bannerWrap, bottom: 8 } : bannerWrap}>Opponent is thinking…</div>
  }

  // The dice that raised this decision haven't finished showing yet — don't offer a choice about them.
  if (!caughtUp) {
    if (compact) {
      return (
        <BottomSheet testId="prompt" title="Resolving dice…" autoKey={pending.id}>
          <div style={hint} data-testid="prompt-resolving">Resolving dice…</div>
        </BottomSheet>
      )
    }
    return (
      <div style={wrap} data-testid="prompt">
        <MinimizeButton decisionId={pending.id} />
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
  const multiMiracle = pending.kind === 'chooseOption' && (pending.context.topic as string) === MIRACLE_TOPIC && multiDiePick(pending.context.data) !== null
  const listItems: { id: string; label: string; action: Action }[] = (
    hasOptions(pending)
      ? pending.options.map((o) => ({ id: o.id, label: labelForOption(pending, state, events, o), action: o.action }))
      : (legal ?? []).map((a, i) => ({ id: `${a.type}-${i}`, label: describeAction(a, state), action: a }))
  )
    // Decisions with no engine-provided options list every *legal action*, and passing is one of
    // them — which put a second "Pass" in the row next to the dedicated button below.
    .filter((it) => it.action.type !== 'pass' || !passAction)
    // a multi-die offer is answered with the dice picker above: only "Roll normally" stays in the list
    .filter((it) => !multiMiracle || it.id === 'skip')

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
    if (compact) {
      return (
        <BottomSheet testId="prompt" title={KIND_TITLE[pending.kind] ?? 'Re-roll'} autoKey={pending.id}>
          <RerollTray key={pending.id} state={state} events={events} pending={pending} roll={rerollRoll} keepAction={keepAction} />
        </BottomSheet>
      )
    }
    return (
      <div style={wrap} data-testid="prompt">
        <MinimizeButton decisionId={pending.id} />
        <RerollTray key={pending.id} state={state} events={events} pending={pending} roll={rerollRoll} keepAction={keepAction} />
      </div>
    )
  }

  const weaponPanelOpen = opensWeaponPanel(pending) && shootStage?.decisionId === pending.id
  // The weapon panel was only reachable by clicking an enemy figure, so players never found it: give
  // it a button too, opened on the first enemy any weapon can reach (the panel retargets from there).
  const firstShootTarget = opensWeaponPanel(pending)
    ? listItems.flatMap((it) => (it.action.type === 'declareTargets' ? it.action.targets.map((t) => t.targetUnitId) : []))[0]
    : undefined
  const kindTitle = chooseOptionInfo?.title ?? KIND_TITLE[pending.kind] ?? pending.kind
  const isDeploy = pending.kind === 'deployUnit'
  // A mid-game disembark names exactly one unit: a lone unit, or both halves of an attached Leader + bodyguard pair (E3).
  const soleDisembark = isDeploy && state.phase === 'movement' ? soleDeployUnit(state, pending.context.unitIds) : null
  const disembarkId = soleDisembark && transportService.transportOf(state, soleDisembark) ? soleDisembark : null
  const kindTitleShown = disembarkId ? `Disembark ${groupLabel(state, disembarkId)}` : kindTitle

  // --- touch (compact) plumbing: arm / disarm a choice ---
  const disarm = () => {
    setArmedId(null)
    cancelHelp()
    setPreviewDraft(null)
    clearBoardHover()
    useAmbushHover.getState().set(null)
  }
  const armOption = (
    id: string,
    hasHelp: boolean,
    withPlacements: Extract<Action, { type: 'moveUnit' | 'chargeMove' | 'pileIn' | 'consolidate' }> | null,
    hoverTarget: HoverTarget | null,
  ) => {
    disarm()
    setArmedId(id)
    if (/^pt:/.test(id)) useAmbushHover.getState().set(id)
    if (hasHelp) setHelpFor(id)
    if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
    if (hoverTarget?.kind === 'unit') hoverUnit(hoverTarget.ids)
    if (hoverTarget?.kind === 'model') hoverModel(hoverTarget.id)
    if (hoverTarget?.kind === 'objective') hoverObjective(hoverTarget.id)
  }

  const bodyTop = (
    <>
      {chooseOptionInfo && <div style={hint}>{chooseOptionInfo.hint}</div>}
      {multiMiracle && pending.kind === 'chooseOption' && <MultiDicePick key={pending.id} pending={pending} poolName={diePoolName(state, pending.player)} dispatch={dispatch} />}
      {pending.kind === 'chooseOption' && (() => {
        const step = pending.context.data?.code === 'cultAmbush' ? pending.context.data.step : null
        if (step === 'marker') return <div style={hint} data-testid="cult-ambush-marker-hint">Blue discs on the board are the legal spots. {compact ? 'Tap an option once to light its spot, or tap a disc.' : 'Hover an option to light its spot, or click a disc.'}</div>
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
                {r.inRange > r.canFire && ` (${r.inRange - r.canFire} more in range but won't fire — no line of sight, a one-shot weapon, or a Pistol held back)`}
              </div>
            ))}
            <div style={{ fontSize: '0.9em' }}>Measured base to base against each weapon&apos;s range.</div>
          </div>
        )
      })()}
      {pending.kind === 'declareTargets' && (
        <CollapsibleInfo
          key={weaponPanelOpen ? 'panel' : 'plain'}
          collapsible={compact && weaponPanelOpen}
          testId="shoot-context"
          head={`${state.units[pending.context.unitId]?.name ?? pending.context.unitId} — ${
            pending.context.overwatch ? 'Fire Overwatch (every hit needs an unmodified 6)' : pending.context.attackKind === 'melee' ? 'pick who to fight' : 'pick a target'
          }`}
        >
          {pending.context.attackKind === 'ranged'
            ? `${compact ? 'Tap' : 'Click'} an enemy (or Choose weapons…) to pick which weapons fire at whom, or use a Target button to fire everything that can reach it at once. `
            : 'Every weapon that can see the unit you pick fires at it. '}
          {compact ? 'Tap an option once' : 'Hover an option'} for its weapons, the target&apos;s Toughness and Save, and what each weapon needs to hit and wound.
          {pending.context.engagedWith.length > 0 &&
            ` In Engagement Range of ${pending.context.engagedWith.map((u) => state.units[u]?.name ?? u).join(', ')}.`}
        </CollapsibleInfo>
      )}

      {pending.kind === 'declareTargets' && weaponPanelOpen && (
        <WeaponPanel key={pending.id} state={state} pending={pending} passAction={passAction} dispatch={dispatch} />
      )}

      {pending.kind === 'declareCharge' && (
        <div style={infoBlock} data-testid="charge-context">
          <div style={{ color: colors.text, fontWeight: 600 }}>
            {state.units[pending.context.unitId]?.name ?? pending.context.unitId} — declare a charge
            {pending.context.heroic ? ' (Heroic Intervention)' : ''}
          </div>
          <div>
            Roll 2D6 and move that far; every unit you declare must end up within Engagement Range or the charge fails
            and the unit does not move. {compact ? 'Tap an option once' : 'Hover an option'} for the distance, the roll it needs and the odds.
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
              {state.units[pending.context.targetUnitId]?.name ?? pending.context.targetUnitId}. Choose which model takes it — {compact ? 'tap an option once' : 'hover an option'}
              to light that figure up on the board.
              {pending.context.precision ? ' Precision: an attached character can be picked out.' : ''}
            </div>
          </div>
        )
      })()}

      {pending.kind === 'deployUnit' && (
        <div style={compact ? deployRowCompact : deployRowWide}>
          {(soleDisembark ? [soleDisembark] : pending.context.unitIds).map((uid) => (
            <button
              key={uid}
              style={{ ...(uid === deployTargetUnitId ? buttonPrimary : buttonBase), flexShrink: 0, textAlign: 'left' }}
              onClick={() => setDeployTarget(uid)}
            >
              {soleDisembark ? groupLabel(state, uid) : state.units[uid]?.name ?? uid}
            </button>
          ))}
          {pending.context.reservesAllowed.map((uid) => {
            const reserveAction = legal?.find((a) => a.type === 'deployUnit' && a.unitId === uid && a.toReserves)
            if (!reserveAction) return null
            const abandon = isTeleporting(state, uid)
            const nm = state.units[uid]?.name ?? uid
            return (
              <Tooltip key={`res-${uid}`} title="Abandon" body="A teleporting unit that is not placed is destroyed." disabled={!abandon}>
                <button
                  style={{ ...(abandon ? buttonDanger : buttonBase), flexShrink: 0, textAlign: 'left' }}
                  onClick={() => {
                    if (abandon && !window.confirm(`Abandon ${nm}? It cannot return to Reserves and will be destroyed.`)) return
                    dispatch(reserveAction)
                  }}
                >
                  {abandon ? `Abandon ${nm} (destroyed)` : `Reserves: ${nm}`}
                </button>
              </Tooltip>
            )
          })}
        </div>
      )}

      {pending.kind === 'deployUnit' && state.phase === 'deployment' && (() => {
        // Rules Commentary "Deploying Units": a model too big for the zone must be set up touching your battlefield edge
        const names = pending.context.unitIds
          .map((id) => state.units[id])
          .filter((u) => u && u.models.some((id) => isOversizeForZone(state.models[id].base, pending.context.zone)))
          .map((u) => u.name)
        if (names.length === 0) return null
        return (
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }} data-testid="oversize-edge-note">
            {names.join(', ')}: too big for this deployment zone, so it has to be set up with its base touching your battlefield edge. Drag it to that edge and it snaps into place.
          </div>
        )
      })()}

      {pending.kind === 'deployUnit' && pending.constraints.mustTouch && (() => {
        const auto = legal?.find((a): a is Extract<Action, { type: 'deployUnit' }> => a.type === 'deployUnit' && !a.toReserves && a.placements.length > 0)
        const mt = pending.constraints.mustTouch
        return (
          <div style={infoBlock} data-testid="cult-ambush-context">
            <div>One model must touch the Cult Ambush marker (the disc on the board at {mt.pos.x.toFixed(1)}, {mt.pos.z.toFixed(1)}), and every model must end more than {pending.constraints.minDistanceFromEnemies}&quot; from enemies. {compact ? 'Tap' : 'Click'} near the marker, or use the button.</div>
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

      {disembarkId && (() => {
        const auto = legal?.find((a): a is Extract<Action, { type: 'deployUnit' }> => a.type === 'deployUnit' && !a.toReserves && a.placements.length > 0)
        if (!auto) return null
        return (
          <button
            style={{ ...buttonPrimary, marginTop: 6 }}
            data-testid="btn-disembark-auto"
            onClick={() => {
              setDeployTarget(auto.unitId)
              const first = auto.placements[0]
              setDraft({ decisionId: pending.id, unitId: auto.unitId, anchor: { x: first.pos.x, z: first.pos.z }, placements: auto.placements })
            }}
          >
            Auto-place beside the transport
          </button>
        )
      })()}

      {bespoke && (
        <div style={hint}>
          {disembarkId
            ? `${compact ? 'Tap' : 'Click'} within 3" of ${state.units[transportService.transportOf(state, disembarkId) ?? '']?.name ?? 'the transport'} to set the unit down${groupUnitIds(state, disembarkId).length > 1 ? ' (its attached Leader lands with it)' : ''}, or pass to keep it aboard.`
            : pending.kind === 'deployUnit'
            ? deployTargetUnitId
              ? `${compact ? 'Tap' : 'Click'} inside your deployment zone to place the unit.`
              : `Pick a unit above, then ${compact ? 'tap' : 'click'} inside your zone.`
            : approach
              ? (compact ? 'Drag a model to move just it; switch on Whole unit to move them all. A red ring says why it is not allowed.' : 'Drag a model to move just it (Shift-drag moves them all). A red ring says why it is not allowed.')
              : `${compact ? 'Tap' : 'Click'} the board to set a destination — a range ring shows how far the unit can go.`}
        </div>
      )}

    </>
  )
  const bodyBottom = (
    <>
      {(activeDraft || isClampedMovePending(pending)) && <FloorSelector />}

      {!compact && activeDraft && draftValidation && !draftValidation.ok && (
        <div style={{ ...hint, color: colors.danger }} data-testid="draft-issue">
          Can&apos;t confirm: {draftValidation.reasons.join(', ')}
        </div>
      )}

      {showFallbackList && !weaponPanelOpen && (
        <div style={compact ? optionListCompact : optionList}>
          {info && listItems.length > 0 && <div style={compact ? { ...hint, flexBasis: '100%' } : hint}>Or use a suggested placement — {compact ? 'tap one to preview it, tap again to use it' : 'hover one to preview it'}:</div>}
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
                style={compact ? { ...(armedId === it.id ? buttonPrimary : buttonBase), ...optionBtnCompact } : buttonBase}
                aria-pressed={compact ? armedId === it.id : undefined}
                onFocus={() => !compact && hasHelp && setHelpFor(it.id)}
                onBlur={() => { if (!compact) cancelHelp() }}
                onMouseEnter={() => {
                  if (compact) return // touch: the first tap arms the choice instead (see onClick)
                  if (/^pt:/.test(it.id)) useAmbushHover.getState().set(it.id)
                  if (hasHelp) scheduleHelp(it.id)
                  if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
                  if (hoverTarget?.kind === 'unit') hoverUnit(hoverTarget.ids)
                  if (hoverTarget?.kind === 'model') hoverModel(hoverTarget.id)
                  if (hoverTarget?.kind === 'objective') hoverObjective(hoverTarget.id)
                }}
                onMouseLeave={() => {
                  if (compact) return
                  useAmbushHover.getState().set(null)
                  cancelHelp()
                  setPreviewDraft(null)
                  clearBoardHover()
                }}
                onClick={() => {
                  if (compact) {
                    // Touch has no hover: the first tap on a choice that has something to show (help, a ghost, a unit
                    // to light) arms it; a second tap on the same choice, or the Choose button, commits it.
                    const previewable = hasHelp || !!withPlacements || !!hoverTarget || /^pt:/.test(it.id)
                    if (previewable && armedId !== it.id) {
                      armOption(it.id, hasHelp, withPlacements, hoverTarget)
                      return
                    }
                    disarm()
                    dispatch(it.action)
                    setDraft(null)
                    return
                  }
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
    </>
  )

  if (compact) {
    const armedItem = armedId ? (listItems.find((it) => it.id === armedId) ?? null) : null
    const showChooseWeapons = !!firstShootTarget && !weaponPanelOpen
    const showPass = !!passAction && !weaponPanelOpen
    const chooseWeaponsBtn = showChooseWeapons ? (
      <button style={touchBtn(buttonPrimary)} data-testid="btn-choose-weapons" onClick={() => useUiStore.getState().stageShoot(pending.id, firstShootTarget)}>
        Choose weapons…
      </button>
    ) : null
    const passBtn = showPass && passAction ? (
      <button style={touchBtn(buttonBase)} data-testid="btn-pass" onClick={() => dispatch(passAction)}>
        {PASS_LABEL[pending.kind] ?? 'Pass'}
      </button>
    ) : null
    // Confirm / Cancel for a staged move live in TouchActionBar (bottom centre); the sheet lifts clear of it.
    const footerRow = approach || activeDraft || chooseWeaponsBtn || passBtn ? (
      <div style={rowCompact}>
        {approach && (
          <button style={touchBtn(buttonBase)} data-testid="btn-auto-approach" onClick={() => setDraft(autoDraft(state, approach, legal))}>
            {approach.kind === 'pileIn' ? 'Auto pile in' : 'Auto consolidate'}
          </button>
        )}
        {activeDraft && (
          <button style={touchBtn(buttonBase)} data-testid="btn-reset-formation" onClick={resetDraft}>
            Reset
          </button>
        )}
        {chooseWeaponsBtn}
        {passBtn}
      </div>
    ) : null
    const chooseArmed = (item: NonNullable<typeof armedItem>) => { disarm(); dispatch(item.action); setDraft(null) }
    const armedBar = armedItem ? (
      <div style={rowCompact}>
        <button style={touchBtn(buttonBase)} data-testid="btn-armed-back" onClick={disarm}>
          Back
        </button>
        <button style={touchBtn(buttonPrimary, armedChooseBtn)} data-testid="btn-armed-choose" onClick={() => chooseArmed(armedItem)}>
          Choose: {armedItem.label}
        </button>
      </div>
    ) : null
    const collapsedPrimary = armedItem ? (
      <button style={touchBtn(buttonPrimary, { ...armedChooseBtn, flex: '0 1 46%' })} data-testid="btn-armed-choose" onClick={() => chooseArmed(armedItem)}>
        Choose: {armedItem.label}
      </button>
    ) : activeDraft ? null : (chooseWeaponsBtn ?? passBtn)
    return (
      <>
        <FormationPicker />
        <BottomSheet
          testId="prompt"
          title={kindTitleShown}
          // a decision answered by tapping the board opens tucked away; a staged move collapses itself
          auto={isDeploy ? !!deployTargetUnitId || !!activeDraft : bespoke || !!activeDraft}
          autoKey={pending.id}
          staged={!!activeDraft}
          summary={collapsedPrimary}
          footer={armedBar ?? footerRow}
        >
          {activeHelp && (
            <div ref={helpRef}>
              <OptionHelp help={activeHelp} inline />
            </div>
          )}
          {bodyTop}
          {bodyBottom}
        </BottomSheet>
      </>
    )
  }

  return (
    <>
      <FormationPicker />
      <div style={isDeploy ? deployWrap : wrap} data-testid="prompt">
      <MinimizeButton decisionId={pending.id} />
      {activeHelp && <OptionHelp help={activeHelp} />}
      <div style={heading}>{kindTitleShown}</div>
      {bodyTop}
      <div style={row}>
        {approach && (
          <button style={buttonBase} data-testid="btn-auto-approach" onClick={() => setDraft(autoDraft(state, approach, legal))}>
            {approach.kind === 'pileIn' ? 'Auto pile in' : 'Auto consolidate'}
          </button>
        )}
        {activeDraft && (
          <>
            <Tooltip title="Can't confirm" body={draftValidation && !draftValidation.ok ? draftValidation.reasons.join(', ') : undefined} disabled={!draftValidation || draftValidation.ok} wrap>
              <button
                style={draftValidation && !draftValidation.ok ? { ...buttonPrimary, opacity: 0.5, cursor: 'not-allowed' } : buttonPrimary}
                data-testid="btn-confirm"
                disabled={!!draftValidation && !draftValidation.ok}
                onClick={confirmDraft}
              >
                Confirm
              </button>
            </Tooltip>
            <button style={buttonBase} data-testid="btn-reset-formation" onClick={resetDraft}>
              Reset
            </button>
            <button style={buttonDanger} data-testid="btn-cancel" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </>
        )}
        {firstShootTarget && !weaponPanelOpen && (
          <button style={buttonPrimary} data-testid="btn-choose-weapons" onClick={() => useUiStore.getState().stageShoot(pending.id, firstShootTarget)}>
            Choose weapons…
          </button>
        )}
        {passAction && !weaponPanelOpen && (
          <button style={buttonBase} data-testid="btn-pass" onClick={() => dispatch(passAction)}>
            {PASS_LABEL[pending.kind] ?? 'Pass'}
          </button>
        )}
      </div>

      {bodyBottom}
      </div>
    </>
  )
}
