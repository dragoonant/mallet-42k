// Bottom-centre action bar for touch screens (M11): a move or placement is staged on the board and a finger
// cannot press Enter / Esc, so Confirm and Cancel live here, plus a "Whole unit" toggle that stands in for
// Shift+drag on the next drag. Confirm runs commitStagedDraft() (what Enter and the prompt's Confirm call);
// Cancel runs cancelStagedDraft() (what Esc calls) — no logic of its own. Renders nothing on desktop.
import { useEffect, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { commitStagedDraft, validateStagedDraft } from '../interaction/commitDraft'
import { cancelStagedDraft } from '../interaction/moveHover'
import { useWholeUnit } from '../interaction/touchGesture'

const TOUCH_MIN = 46

const bar: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: '50%',
  bottom: 'calc(var(--safe-bottom, 0px) + 10px)',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  pointerEvents: 'auto',
  zIndex: 45,
  maxWidth: 'calc(100% - 24px)',
  boxSizing: 'border-box',
  touchAction: 'manipulation',
}

const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' }

const btn: CSSProperties = {
  fontFamily: fontStack,
  fontSize: 15,
  fontWeight: 700,
  minHeight: TOUCH_MIN,
  minWidth: TOUCH_MIN + 40,
  padding: '0 18px',
  borderRadius: 8,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: `1px solid ${colors.border}`,
  color: colors.text,
  background: 'rgba(255,255,255,0.1)',
}

const reasonStyle: CSSProperties = { fontFamily: fontStack, fontSize: 12, lineHeight: 1.3, color: colors.danger, maxWidth: 360, textAlign: 'center' }

export function TouchActionBar() {
  const { touch } = useFormFactor()
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const draft = useUiStore((s) => s.draft)
  const wholeUnit = useWholeUnit((s) => s.on)
  const setWholeUnit = useWholeUnit((s) => s.set)

  const staged = touch && !!state && !!pending && pending.player !== botSeat && !!draft && draft.decisionId === pending.id
  // the toggle only means something while a draft is staged; never let it leak into a later decision
  useEffect(() => {
    if (!staged && useWholeUnit.getState().on) useWholeUnit.getState().set(false)
  }, [staged])

  if (!staged || !state || !pending) return null
  const validation = validateStagedDraft(state, pending, draft)
  const blocked = !!validation && !validation.ok
  const reason = blocked ? validation?.reasons[0] : undefined

  return (
    <div data-testid="touch-action-bar" style={bar} role="group" aria-label="Staged move actions">
      {reason && <div style={reasonStyle}>{reason}</div>}
      <div style={row}>
        <button type="button" data-testid="touch-cancel" style={btn} onClick={() => cancelStagedDraft()}>
          Cancel
        </button>
        <button
          type="button"
          data-testid="touch-whole-unit"
          aria-pressed={wholeUnit}
          style={wholeUnit ? { ...btn, background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` } : btn}
          onClick={() => setWholeUnit(!wholeUnit)}
        >
          Whole unit
        </button>
        <button
          type="button"
          data-testid="touch-confirm"
          disabled={blocked}
          style={{
            ...btn,
            background: colors.accent,
            color: colors.accentText,
            border: `1px solid ${colors.accent}`,
            opacity: blocked ? 0.45 : 1,
            cursor: blocked ? 'not-allowed' : 'pointer',
          }}
          onClick={() => commitStagedDraft()}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}
