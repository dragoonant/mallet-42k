// Bottom-centre action bar for touch screens (M11): a move or placement is staged on the board and a finger
// cannot press Enter / Esc, so Confirm and Cancel live here, plus a "Whole unit" toggle that stands in for
// Shift+drag on the next drag. Confirm runs commitStagedDraft() (what Enter and the prompt's Confirm call);
// Cancel runs cancelStagedDraft() (what Esc calls) — no logic of its own. Renders nothing on desktop.
//
// Compact (phone) layout: a slim 52px row at the bottom-right of the overlay layer (which App.tsx already insets by
// the safe areas — so no --safe-bottom here), sharing the row with the collapsed BottomSheet pill on its left and
// leaving the camera column clear on its right. A blocking reason floats above the formation strip instead of
// stretching the bar. Tablets with touch keep the original centred bar.
import { useEffect, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { useCaughtUp } from '../presentation/presentedStore'
import { useUiStore } from './uiStore'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { CAMERA_COL_PX, STAGED_BAR_PX, STAGED_ROW_PX } from './BottomSheet'
import { commitStagedDraft, validateStagedDraft } from '../interaction/commitDraft'
import { cancelStagedDraft } from '../interaction/moveHover'
import { useWholeUnit } from '../interaction/touchGesture'

const TOUCH_MIN = 46

const bar: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: '50%',
  bottom: 10, // the overlay layer is already inset by --safe-bottom
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

const barCompact: CSSProperties = {
  ...bar,
  left: 'auto',
  right: CAMERA_COL_PX,
  bottom: 6,
  transform: 'none',
  width: STAGED_BAR_PX,
  maxWidth: `calc(100% - ${CAMERA_COL_PX + 8}px)`,
  height: STAGED_ROW_PX,
  flexDirection: 'row',
  justifyContent: 'center',
  padding: '3px 6px',
  gap: 0,
}
const rowCompact: CSSProperties = { ...row, gap: 6, width: '100%' }
const btnCompact: CSSProperties = { flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '0 8px', fontSize: 14 }
// Floats above the 52px formation strip (6 + 52 + 6 + 52 + 6), over the board only; never takes a tap.
const reasonCompact: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 0,
  bottom: `calc(100% + ${6 + STAGED_ROW_PX + 6}px)`,
  width: 'max-content',
  maxWidth: `min(360px, calc(100vw - ${CAMERA_COL_PX + 24}px))`,
  padding: '4px 8px',
  fontFamily: fontStack,
  fontSize: 12,
  lineHeight: 1.3,
  color: colors.danger,
  pointerEvents: 'none',
  boxSizing: 'border-box',
}

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
  const { touch, compact } = useFormFactor()
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const caughtUp = useCaughtUp(useGameStore((s) => s.pendingSeq))
  const draft = useUiStore((s) => s.draft)
  const wholeUnit = useWholeUnit((s) => s.on)
  const setWholeUnit = useWholeUnit((s) => s.set)

  const staged = touch && caughtUp && !!state && !!pending && pending.player !== botSeat && !!draft && draft.decisionId === pending.id
  // the toggle only means something while a draft is staged; never let it leak into a later decision
  useEffect(() => {
    if (!staged && useWholeUnit.getState().on) useWholeUnit.getState().set(false)
  }, [staged])

  if (!staged || !state || !pending) return null
  const validation = validateStagedDraft(state, pending, draft)
  const blocked = !!validation && !validation.ok
  const reason = blocked ? validation?.reasons[0] : undefined

  const b = compact ? btnCompact : null
  return (
    <div data-testid="touch-action-bar" style={compact ? barCompact : bar} role="group" aria-label="Staged move actions">
      {reason && <div style={compact ? reasonCompact : reasonStyle} data-testid="touch-reason">{reason}</div>}
      <div style={compact ? rowCompact : row}>
        <button type="button" data-testid="touch-cancel" style={{ ...btn, ...b }} onClick={() => cancelStagedDraft()}>
          Cancel
        </button>
        <button
          type="button"
          data-testid="touch-whole-unit"
          aria-pressed={wholeUnit}
          style={{ ...btn, ...b, ...(wholeUnit ? { background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` } : null) }}
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
            ...b,
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
