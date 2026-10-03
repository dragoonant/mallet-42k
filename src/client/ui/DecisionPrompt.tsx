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
} from '../interaction'
import { neededChargeDistance } from '@/engine/phases/charge'
import {
  chargeTargetHelp, moveTypeHelp, objectiveLabel, prettifyId, saveAttackContext,
  shootingTargetHelp, type PromptHelp,
} from './labels'
import { FormationPicker } from './FormationPicker'
import { rerollTrayModel, rollForOffer } from './rerollInfo'
import { RerollTray } from './RerollTray'
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
  recoverObjective: { title: 'Recover intelligence?', hint: 'Spends a look at a marker you hold to gain a Command Point.' },
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
      if (pending.context.topic === 'razeObjective' || pending.context.topic === 'recoverObjective') return objectiveLabel(o.id)
      return o.label
    }
    default:
      return o.label
  }
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
  top: '38%',
  bottom: '38%',
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
  const rememberFormation = useUiStore((s) => s.rememberFormation)

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

  const draftValidation = activeDraft
    ? validateDraft(
        state,
        combinedUnitModels(state, activeDraft.unitId),
        activeDraft.placements,
        pending.kind === 'deployUnit' ? null : (info?.constraints ?? null),
        combinedUnitIds(state, activeDraft.unitId),
        true,
      )
    : null

  const confirmDraft = () => {
    if (!activeDraft || (draftValidation && !draftValidation.ok)) return
    const { unitId, placements } = activeDraft
    const base = { player: pending.player, decisionId: pending.id }
    if (pending.kind === 'deployUnit') dispatch({ ...base, type: 'deployUnit', unitId, placements })
    else if (pending.kind === 'moveUnit') dispatch({ ...base, type: 'moveUnit', unitId, placements })
    else if (pending.kind === 'chargeMove') dispatch({ ...base, type: 'chargeMove', unitId, placements })
    else if (pending.kind === 'pileIn') dispatch({ ...base, type: 'pileIn', unitId, placements })
    else if (pending.kind === 'consolidate') dispatch({ ...base, type: 'consolidate', unitId, placements })
    rememberFormation(unitId, formationKind, formationFacing)
    setDraft(null)
  }

  const resetDraft = () => {
    if (!activeDraft) return
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

  const chooseOptionInfo = pending.kind === 'chooseOption' ? CHOOSE_OPTION_INFO[pending.context.topic] : undefined

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
          Move each model up to {pending.context.distance}&quot;
          {pending.kind === 'pileIn' ? ', as close as it can get to the closest enemy model.' : ', ending closer to the closest enemy model or an objective you can hold.'}
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
            return (
              <button key={`res-${uid}`} style={{ ...buttonBase, flexShrink: 0, width: '100%', textAlign: 'left' }} onClick={() => dispatch(reserveAction)}>
                Reserves: {state.units[uid]?.name ?? uid}
              </button>
            )
          })}
        </div>
      )}

      {bespoke && (
        <div style={hint}>
          {pending.kind === 'deployUnit'
            ? deployTargetUnitId
              ? 'Click inside your deployment zone to place the unit.'
              : 'Pick a unit above, then click inside your zone.'
            : 'Click on the board to set a destination — a range ring shows how far the unit can go.'}
        </div>
      )}

      <div style={row}>
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
                  if (hasHelp) scheduleHelp(it.id)
                  if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
                  if (hoverTarget?.kind === 'unit') hoverUnit(hoverTarget.ids)
                  if (hoverTarget?.kind === 'model') hoverModel(hoverTarget.id)
                  if (hoverTarget?.kind === 'objective') hoverObjective(hoverTarget.id)
                }}
                onMouseLeave={() => {
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
