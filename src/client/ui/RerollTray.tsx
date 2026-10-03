// The interactive re-roll tray: what the decision prompt shows for a human-owned Command Re-roll or an
// ability's re-roll offer. The whole roll is laid out as dice — passes lit, fails dimmed, dice that were
// already re-rolled locked — and the player clicks the ones they want to re-roll, then answers once.
// It replaces the text prompt for these two decisions (DecisionPrompt renders it inside its own panel),
// so there is only ever one prompt on screen for the roll.
import { useEffect, useState, type CSSProperties } from 'react'
import type { Action, ChooseOptionDecision, CommandRerollDecision, DiceRoll, GameEvent, GameState } from '@/engine'
import { Die, DURATIONS, rerollTrayShown, useDiceStore, type DieResult } from '../dice'
import { useGameStore } from '../store/game'
import { usePresentationSettings, type RerollMute } from '../presentation/settings'
import { rerollSummary, rerollTrayModel } from './rerollInfo'
import { buttonBase, buttonPrimary, colors, fontStack, mutedText } from './theme'

const heading: CSSProperties = { fontWeight: 700, fontSize: 14 }
const infoBlock: CSSProperties = { ...mutedText, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }
const rollLine: CSSProperties = { color: colors.text, fontWeight: 600, fontSize: 12.5 }
const diceRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, padding: '4px 0' }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const muteRow: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }
const muteLink: CSSProperties = {
  fontFamily: fontStack, fontSize: 11, color: colors.muted, background: 'none', border: 'none',
  padding: 0, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2,
}

function dieSize(n: number): number {
  return n > 20 ? 24 : n > 12 ? 30 : n > 6 ? 36 : 44
}

function slotStyle(picked: boolean, clickable: boolean): CSSProperties {
  return {
    position: 'relative',
    padding: 3,
    borderRadius: 9,
    border: `2px solid ${picked ? colors.accent : 'transparent'}`,
    background: picked ? 'rgba(245,217,90,0.14)' : 'transparent',
    transform: picked ? 'translateY(-3px)' : 'none',
    transition: 'transform 120ms ease-out, background 120ms linear, border-color 120ms linear',
    cursor: clickable ? 'pointer' : 'default',
    font: 'inherit',
    color: 'inherit',
    lineHeight: 0,
  }
}

const lockBadge: CSSProperties = {
  position: 'absolute', right: -2, top: -4, fontSize: 11, lineHeight: 1, color: colors.muted,
  background: colors.bgSolid, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '1px 3px', pointerEvents: 'none',
}

export interface RerollTrayProps {
  state: GameState
  events: GameEvent[]
  pending: CommandRerollDecision | ChooseOptionDecision
  roll: DiceRoll
  /** The "no thanks" answer: Pass for a Command Re-roll, the `keep` option for an ability offer. */
  keepAction: Action | null
}

export function RerollTray({ state, events, pending, roll, keepAction }: RerollTrayProps) {
  const dispatch = useGameStore((s) => s.dispatch)
  const muteRerolls = usePresentationSettings((s) => s.muteRerolls)
  const speed = useDiceStore((s) => s.speed)
  const [picked, setPicked] = useState<number[]>([])

  useEffect(() => {
    rerollTrayShown.add(roll.id)
  }, [roll.id])
  // A new decision starts with nothing picked.
  useEffect(() => setPicked([]), [pending.id])

  const summary = rerollSummary(state, events, roll)
  const model = rerollTrayModel(state, events, pending, roll)
  if (!model) return null

  const cost = state.stratagems['core.s.command-reroll']?.cost ?? 1
  const cp = state.players[pending.player].cp
  const { tumbleMs, flipMs } = DURATIONS[speed]
  const size = dieSize(model.dice.length)
  const interactive = model.mode !== 'whole'
  const ability = model.free

  const toggle = (i: number) => {
    if (!model.selectable.includes(i)) return
    setPicked((cur) => {
      if (model.mode === 'one') return cur.length === 1 && cur[0] === i ? [] : [i]
      return cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]
    })
  }
  const answer = (action: Action | null) => { if (action) dispatch(action) }
  const answerAndMute = (mute: RerollMute) => {
    if (!keepAction) return
    muteRerolls(mute)
    dispatch(keepAction)
  }

  const confirmAction = model.reroll(picked)
  const confirmLabel =
    model.mode === 'many' ? `Re-roll selected (${picked.length})`
      : model.mode === 'one' ? `Re-roll this die — ${cost} CP`
        : ability ? 'Re-roll' : `Re-roll — ${cost} CP`
  const confirmDisabled = model.mode === 'whole' ? confirmAction === null : confirmAction === null || picked.length === 0
  const failedAction = model.mode === 'many' && model.failedSelectable.length > 0 ? model.reroll(model.failedSelectable) : null

  let note: string
  if (!ability) {
    note = `Command Re-roll costs ${cost} CP — you have ${cp} CP, and only one roll per phase can be re-rolled this way.`
    if (model.mode === 'one') note = `Pick the die you want to re-roll — the stratagem re-rolls exactly one. ${note}`
  } else if (model.mode === 'many') {
    note = summary.failed
      ? 'A free re-roll from one of your abilities — click the dice you want to re-roll.'
      : 'These dice already succeeded. The re-roll is free, but each one can just as easily fail — click the ones you want to gamble.'
  } else {
    note = summary.failed ? 'A free re-roll, from one of your abilities.' : 'This roll already succeeded — a re-roll is free, but it can just as easily lose it.'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="reroll-tray">
      <div style={heading}>{summary.title}</div>
      <div style={infoBlock} data-testid="reroll-info">
        <div style={rollLine}>{summary.line}</div>
        {summary.context && <div>{summary.context}</div>}
        <div style={{ marginTop: 3 }}>{note}</div>
      </div>

      <div style={diceRow} data-testid="reroll-dice">
        {model.dice.map((value, i) => {
          const outcome = model.outcomes[i] ?? 'neutral'
          const isLocked = model.locked.includes(i)
          const canPick = interactive && model.selectable.includes(i)
          const result: DieResult = {
            value,
            original: value,
            wasRerolled: false,
            isCritical: value === 6 && outcome === 'success' && (roll.purpose === 'hit' || roll.purpose === 'wound'),
            outcome,
          }
          const face = <Die result={result} phase="settled" size={size} index={i} rollId={pending.id} tumbleMs={tumbleMs} flipMs={flipMs} />
          const words = `${value}${outcome === 'success' ? ', success' : outcome === 'fail' ? ', fail' : ''}${isLocked ? ', already re-rolled' : ''}`
          if (canPick) {
            const on = picked.includes(i)
            return (
              <button
                key={i}
                type="button"
                style={slotStyle(on, true)}
                aria-pressed={on}
                aria-label={`Die ${i + 1}: ${words}`}
                data-testid={`reroll-die-${i}`}
                data-picked={on ? 'true' : 'false'}
                data-outcome={outcome}
                onClick={() => toggle(i)}
              >
                {face}
              </button>
            )
          }
          return (
            <div
              key={i}
              style={slotStyle(false, false)}
              title={isLocked ? 'Already re-rolled — a die is never re-rolled twice' : undefined}
              aria-label={`Die ${i + 1}: ${words}`}
              data-testid={`reroll-die-${i}`}
              data-picked="false"
              data-outcome={outcome}
              data-locked={isLocked ? 'true' : 'false'}
            >
              {face}
              {isLocked && <span style={lockBadge} aria-hidden="true">↻</span>}
            </div>
          )
        })}
      </div>

      <div style={row}>
        <button
          style={confirmDisabled ? { ...buttonPrimary, opacity: 0.45, cursor: 'not-allowed' } : buttonPrimary}
          data-testid="reroll-confirm"
          disabled={confirmDisabled}
          onClick={() => answer(confirmAction)}
        >
          {confirmLabel}
        </button>
        {failedAction && (
          <button style={buttonBase} data-testid="reroll-failed" onClick={() => answer(failedAction)}>
            Re-roll all failed
          </button>
        )}
        {keepAction && (
          <button style={buttonBase} data-testid="reroll-keep" onClick={() => dispatch(keepAction)}>
            {model.mode === 'many' ? 'Keep all' : 'Keep'}
          </button>
        )}
      </div>
      {keepAction && (
        <div style={muteRow}>
          <button style={muteLink} data-testid="btn-reroll-mute-phase" onClick={() => answerAndMute({ scope: 'phase', round: state.round, phase: state.phase })}>
            Keep, and stop asking this phase
          </button>
          <button style={muteLink} data-testid="btn-reroll-mute-battle" onClick={() => answerAndMute({ scope: 'battle' })}>
            …for the rest of the battle
          </button>
        </div>
      )}
    </div>
  )
}
