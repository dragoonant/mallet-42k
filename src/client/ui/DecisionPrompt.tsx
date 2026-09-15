// The single decision prompt (docs/spec/50-client.md §6). Bespoke controls for deployment and the
// four move-family decisions (which need a board click, handled by src/client/interaction/**); every
// other decision kind — including declareTargets/declareCharge, which also accept a click on an enemy
// Figure via UnitsLayer — renders as a plain clickable list here, so no decision can ever get stuck.
import { useEffect, type CSSProperties } from 'react'
import {
  distance as edgeGap, unitModels,
  type Action, type ChooseOptionTopic, type DecisionOption, type GameState, type PendingDecision, type PlayerId, type StratagemId,
} from '@/engine'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import {
  combinedUnitIds, combinedUnitModels, distance2D, formationPlacementsForUnit, modelsAnchor, placementInfo, validateDraft,
} from '../interaction'
import { objectiveLabel } from './labels'
import { FormationPicker } from './FormationPicker'
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
function chargeDistanceNeeded(state: GameState, unitId: string, targetUnitIds: string[]): number | null {
  const attackers = unitModels(state, unitId)
  if (attackers.length === 0 || targetUnitIds.length === 0) return null
  let worst = 0
  let any = false
  for (const targetId of targetUnitIds) {
    const targets = unitModels(state, targetId)
    if (targets.length === 0) continue
    let min = Infinity
    for (const a of attackers) for (const t of targets) min = Math.min(min, edgeGap(a, t))
    if (Number.isFinite(min)) {
      any = true
      worst = Math.max(worst, min)
    }
  }
  return any ? worst : null
}

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
  saveType: { title: 'Choose a save', hint: 'Pick which save to attempt against this hit.' },
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

const REACTION_LABEL: Record<string, string> = {
  overwatch: 'Fire Overwatch',
  heroicIntervention: 'Heroic Intervention',
  rapidIngress: 'Rapid Ingress',
  counterOffensive: 'Counter-offensive',
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
      return `${a.moveType.charAt(0).toUpperCase()}${a.moveType.slice(1)} move`
    case 'declareTargets':
      return a.targets.length > 0 ? `Target ${unitName(a.targets[0].targetUnitId)}` : 'Hold fire'
    case 'declareCharge': {
      const names = a.targetUnitIds.map(unitName).join(', ')
      const needed = chargeDistanceNeeded(state, a.unitId, a.targetUnitIds)
      return needed !== null ? `Charge ${names}, need ${needed.toFixed(1)}"` : `Charge ${names}`
    }
    case 'moveUnit':
    case 'chargeMove':
    case 'pileIn':
    case 'consolidate': {
      const verb = { moveUnit: 'Move', chargeMove: 'Charge move', pileIn: 'Pile in', consolidate: 'Consolidate' }[a.type]
      const summary = placementSummary(state, a.unitId, a.placements)
      return summary ? `${verb} ${summary}` : verb
    }
    case 'allocateAttack':
      return `Allocate to ${state.models[a.modelId]?.datasheetModelId ?? a.modelId}`
    case 'useStratagem': {
      const strat = state.stratagems[a.stratagemId]
      const name = strat?.name ?? a.stratagemId
      const cost = strat ? ` (${strat.cost} CP)` : ''
      const targets: string[] = (a.targets.unitIds ?? []).map(unitName)
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

/** Label a single option button for the kinds whose engine-provided DecisionOption.label is either
 *  a raw id ("A:terminator-squad", a bare objective id) or too terse to explain the choice — everyone
 *  else keeps the engine's own label untouched. */
function labelForOption(pending: PendingDecision, state: GameState, o: { id: string; label: string; action: Action }): string {
  switch (pending.kind) {
    case 'chooseUnitToActivate':
    case 'chooseFightUnit':
    case 'stratagemWindow':
    case 'reactionWindow':
      return describeAction(o.action, state)
    case 'commandReroll': {
      if (o.action.type !== 'commandReroll') return describeAction(o.action, state)
      const roll = pending.context.roll
      return o.action.dieIndex === undefined ? `Re-roll (rolled ${roll.dice.join(', ')})` : `Re-roll die ${o.action.dieIndex + 1} (${roll.dice[o.action.dieIndex]})`
    }
    case 'chooseOption':
      if (pending.context.topic === 'razeObjective' || pending.context.topic === 'recoverObjective') return objectiveLabel(o.id)
      return o.label
    default:
      return o.label
  }
}

/** What a chooseOption / stratagemWindow / reactionWindow option is "about", for the board-hover
 *  highlight (M6 gap: prompts named units/objectives the player couldn't match to the board). */
function hoverTargetFor(pending: PendingDecision, action: Action, optionId: string): { kind: 'unit' | 'objective'; id: string } | null {
  if (action.type === 'useStratagem') {
    if (action.targets.unitIds?.[0]) return { kind: 'unit', id: action.targets.unitIds[0] }
    if (action.targets.objectiveId) return { kind: 'objective', id: action.targets.objectiveId }
  }
  if (pending.kind === 'chooseOption') {
    const topic = pending.context.topic
    if (topic === 'razeObjective' || topic === 'recoverObjective') return { kind: 'objective', id: optionId }
    if (topic === 'stompTarget' || topic === 'bagTarget') return { kind: 'unit', id: optionId }
  }
  return null
}

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
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const setPreviewDraft = useUiStore((s) => s.setPreviewDraft)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDeployTarget = useUiStore((s) => s.setDeployTarget)
  const resetForDecision = useUiStore((s) => s.resetForDecision)
  const hoverUnit = useUiStore((s) => s.hoverUnit)
  const hoverObjective = useUiStore((s) => s.hoverObjective)
  const formationKind = useUiStore((s) => s.formationKind)
  const formationFacing = useUiStore((s) => s.formationFacing)
  const primeFormation = useUiStore((s) => s.primeFormation)
  const recallFormation = useUiStore((s) => s.recallFormation)
  const rememberFormation = useUiStore((s) => s.rememberFormation)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => resetForDecision(), [pending?.id])

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
  const listItems: { id: string; label: string; action: Action }[] = hasOptions(pending)
    ? pending.options.map((o) => ({ id: o.id, label: labelForOption(pending, state, o), action: o.action }))
    : (legal ?? []).map((a, i) => ({ id: `${a.type}-${i}`, label: describeAction(a, state), action: a }))

  const chooseOptionInfo = pending.kind === 'chooseOption' ? CHOOSE_OPTION_INFO[pending.context.topic] : undefined
  const kindTitle = chooseOptionInfo?.title ?? KIND_TITLE[pending.kind] ?? pending.kind
  const isDeploy = pending.kind === 'deployUnit'

  return (
    <>
      <FormationPicker />
      <div style={isDeploy ? deployWrap : wrap} data-testid="prompt">
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
      {pending.kind === 'commandReroll' && (
        <div style={infoBlock}>
          Command Re-roll (1 CP) — you have {state.players[pending.player].cp} CP. {pending.context.roll.purpose} roll: [{pending.context.roll.dice.join(', ')}]
        </div>
      )}

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
            Pass
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
            const hoverTarget = hoverTargetFor(pending, it.action, it.id)
            return (
              <button
                key={it.id}
                data-testid={`prompt-option-${it.id}`}
                style={buttonBase}
                onMouseEnter={() => {
                  if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
                  if (hoverTarget?.kind === 'unit') hoverUnit(hoverTarget.id)
                  if (hoverTarget?.kind === 'objective') hoverObjective(hoverTarget.id)
                }}
                onMouseLeave={() => {
                  setPreviewDraft(null)
                  hoverUnit(null)
                  hoverObjective(null)
                }}
                onClick={() => {
                  setPreviewDraft(null)
                  hoverUnit(null)
                  hoverObjective(null)
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
