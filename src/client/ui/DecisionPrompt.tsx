// The single decision prompt (docs/spec/50-client.md §6). Bespoke controls for deployment and the
// four move-family decisions (which need a board click, handled by src/client/interaction/**); every
// other decision kind — including declareTargets/declareCharge, which also accept a click on an enemy
// Figure via UnitsLayer — renders as a plain clickable list here, so no decision can ever get stuck.
import { useEffect, type CSSProperties } from 'react'
import type { Action, DecisionOption, GameState, PendingDecision } from '@/engine'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import { placementInfo } from '../interaction'
import { buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

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
    case 'declareCharge':
      return `Charge ${a.targetUnitIds.map(unitName).join(', ')}`
    case 'allocateAttack':
      return `Allocate to ${state.models[a.modelId]?.datasheetModelId ?? a.modelId}`
    case 'useStratagem':
      return state.stratagems[a.stratagemId]?.name ?? a.stratagemId
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
      return `${a.type} option`
  }
}

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: '50%',
  bottom: 12,
  transform: 'translateX(-50%)',
  width: 460,
  maxWidth: 'calc(100vw - 480px)',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'auto',
}
const heading: CSSProperties = { fontWeight: 700, fontSize: 14 }
const hint: CSSProperties = { ...mutedText }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
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

export function DecisionPrompt() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDeployTarget = useUiStore((s) => s.setDeployTarget)
  const resetForDecision = useUiStore((s) => s.resetForDecision)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => resetForDecision(), [pending?.id])

  if (!state || !pending) return null

  if (pending.player === botSeat) {
    return <div style={bannerWrap}>Opponent is thinking…</div>
  }

  const info = placementInfo(pending)
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null
  const passAction = legal?.find((a) => a.type === 'pass') ?? null

  const confirmDraft = () => {
    if (!activeDraft) return
    const { unitId, placements } = activeDraft
    const base = { player: pending.player, decisionId: pending.id }
    if (pending.kind === 'deployUnit') dispatch({ ...base, type: 'deployUnit', unitId, placements })
    else if (pending.kind === 'moveUnit') dispatch({ ...base, type: 'moveUnit', unitId, placements })
    else if (pending.kind === 'chargeMove') dispatch({ ...base, type: 'chargeMove', unitId, placements })
    else if (pending.kind === 'pileIn') dispatch({ ...base, type: 'pileIn', unitId, placements })
    else if (pending.kind === 'consolidate') dispatch({ ...base, type: 'consolidate', unitId, placements })
    setDraft(null)
  }

  const bespoke = pending.kind === 'deployUnit' || !!info
  // Placement decisions keep the board-click UI as the primary path, but still offer the engine's
  // own pre-validated candidates below — e.g. a coherency repair after a mid-move casualty can be
  // a placement our own delta-translate can't produce, so the fallback list must stay reachable.
  const showFallbackList = pending.kind !== 'deployUnit'
  // chooseUnitToActivate/chooseFightUnit's own DecisionOption.label is just the bare unit id
  // (e.g. "A:terminator-squad") — everywhere else the engine's label is already the nicer one.
  const relabel = pending.kind === 'chooseUnitToActivate' || pending.kind === 'chooseFightUnit'
  const listItems: { id: string; label: string; action: Action }[] = hasOptions(pending)
    ? pending.options.map((o) => ({ id: o.id, label: relabel ? describeAction(o.action, state) : o.label, action: o.action }))
    : (legal ?? []).map((a, i) => ({ id: `${a.type}-${i}`, label: describeAction(a, state), action: a }))

  return (
    <div style={wrap} data-testid="prompt">
      <div style={heading}>{KIND_TITLE[pending.kind] ?? pending.kind}</div>

      {pending.kind === 'deployUnit' && (
        <div style={row}>
          {pending.context.unitIds.map((uid) => (
            <button key={uid} style={uid === deployTargetUnitId ? buttonPrimary : buttonBase} onClick={() => setDeployTarget(uid)}>
              {state.units[uid]?.name ?? uid}
            </button>
          ))}
          {pending.context.reservesAllowed.map((uid) => {
            const reserveAction = legal?.find((a) => a.type === 'deployUnit' && a.unitId === uid && a.toReserves)
            if (!reserveAction) return null
            return (
              <button key={`res-${uid}`} style={buttonBase} onClick={() => dispatch(reserveAction)}>
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
            <button style={buttonPrimary} data-testid="btn-confirm" onClick={confirmDraft}>
              Confirm
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

      {showFallbackList && (
        <div style={optionList}>
          {info && listItems.length > 0 && <div style={hint}>Or use a suggested placement:</div>}
          {listItems.map((it) => (
            <button
              key={it.id}
              data-testid={`prompt-option-${it.id}`}
              style={buttonBase}
              onClick={() => {
                dispatch(it.action)
                setDraft(null)
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
