// HUD strip for the M4 formation picker: shown while a deploy/move/charge-move/pile-in/consolidate
// decision is waiting on a board click. Own-words shape buttons (+ number keys 1-7, 0 for "Keep
// current shape"), facing rotate (Q/E/wheel, 15° steps) and flip (R). Picking a shape or rotating
// re-lays out the *current* draft in place if one already exists (same anchor, new shape/facing);
// before the first click it only primes what the next click will use.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import {
  FORMATION_HINTS, FORMATION_KEYS, FORMATION_LABELS, FORMATION_ORDER, ROTATE_STEP_RAD,
  formationPlacementsForUnit, isPlacementDecision, normalizeAngle, placementInfo, type FormationKind,
} from '../interaction'
import { buttonActive, buttonBase, colors, fontStack, mutedText, panel } from './theme'
import { Tooltip } from './Tooltip'
import { useFormFactor } from './formFactor'
import { CAMERA_COL_PX, STAGED_ROW_PX } from './BottomSheet'

// Anchored near the TOP of the screen (under the phase tracker / scoring hint), not stacked above
// the bottom decision prompt: the prompt's own height varies a lot (a deploy palette row, a hint
// line, Confirm/Cancel/Reset) and a fixed bottom offset would sometimes sit right on top of it,
// with the later-painted prompt panel silently swallowing this strip's clicks.
const wrap = {
  ...panel,
  position: 'absolute' as const,
  left: '50%',
  top: 78,
  transform: 'translateX(-50%)',
  padding: '6px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'auto' as const,
  fontFamily: fontStack,
}

const kindButton = { ...buttonBase, fontSize: 11.5, padding: '4px 8px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1 }
const kindButtonActive = { ...kindButton, ...buttonActive }
// Touch (phones): 44px targets. In the compact layout the strip lives in the BOTTOM zone as ONE slim 52px row,
// stacked just above the staged bottom row (collapsed sheet pill + Confirm / Cancel bar), so the whole bottom
// stack stays about 116px; the shape choices scroll sideways when they outgrow the screen. `bottom` is measured
// live (see useBottomClearance) relative to the overlay layer, which App.tsx already insets by the safe areas.
const touchWrap = {
  ...wrap,
  top: 'auto' as const,
  left: 8,
  right: CAMERA_COL_PX, // leaves the right-edge camera buttons clear
  transform: 'none',
  bottom: 6 + STAGED_ROW_PX + 6,
  zIndex: 44,
  height: STAGED_ROW_PX,
  padding: '3px 6px',
  overflowX: 'auto' as const,
  overflowY: 'hidden' as const,
  touchAction: 'pan-x' as const,
  boxSizing: 'border-box' as const,
}
const touchKind = { ...kindButton, minHeight: 44, minWidth: 44, padding: '0 10px', flex: '0 0 auto', justifyContent: 'center' }
const touchKindActive = { ...touchKind, ...buttonActive }
const touchBtn = { ...buttonBase, minHeight: 44, minWidth: 44, padding: '0 10px', flex: '0 0 auto', fontSize: 18 }
const keyHint = { fontSize: 9, opacity: 0.7 }
const divider = { width: 1, alignSelf: 'stretch' as const, background: colors.border }
const facingReadout = { fontSize: 12, minWidth: 40, textAlign: 'center' as const, ...mutedText }

/** Bottom-zone elements the compact picker must sit above (their tops are measured, so it follows their real height). */
const BOTTOM_ZONE_SELECTORS = ['[data-testid="touch-action-bar"]', '[data-testid="prompt"]']

/** Pixels from the bottom of the overlay layer (the picker's containing block) to clear so the picker rests just above
 *  the touch action bar / decision sheet. Null until something is found (use the default stacked offset). Polls
 *  lightly: those elements change height as the sheet opens or collapses. */
function useBottomClearance(active: boolean, ref: RefObject<HTMLElement | null>): number | null {
  const [clear, setClear] = useState<number | null>(null)
  useEffect(() => {
    if (!active) return
    const measure = () => {
      const parent = ref.current?.offsetParent as HTMLElement | null
      const base = parent ? parent.getBoundingClientRect().bottom : window.innerHeight
      let top = Infinity
      for (const sel of BOTTOM_ZONE_SELECTORS) {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          const r = el.getBoundingClientRect()
          // only things resting in the lower half of the screen, and actually visible
          if (r.height > 0 && r.width > 0 && r.bottom > window.innerHeight * 0.5) top = Math.min(top, r.top)
        }
      }
      const next = Number.isFinite(top) ? Math.max(0, Math.round(base - top)) + 6 : null
      setClear((prev) => (prev === next ? prev : next))
    }
    measure()
    const id = window.setInterval(measure, 150)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
    }
  }, [active, ref])
  return clear
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Re-lays out the currently-drafted formation in place (same anchor) with a new kind/facing — a
 *  no-op before the first board click, since there's nothing to re-lay out yet. Reads store state
 *  live (not via hooks) since this fires from keyboard/wheel/click handlers, not render. */
function regenerateActiveDraft(kind: FormationKind, facing: number) {
  const { state, pending } = useGameStore.getState()
  const ui = useUiStore.getState()
  if (!state || !pending || !ui.draft || ui.draft.decisionId !== pending.id) return
  const unitId = pending.kind === 'deployUnit' ? ui.deployTargetUnitId : (placementInfo(pending)?.unitId ?? null)
  if (!unitId) return
  const placements = formationPlacementsForUnit(state, unitId, ui.draft.anchor, facing, kind)
  if (placements.length > 0) ui.setDraft({ ...ui.draft, placements })
}

export function FormationPicker() {
  const { touch, compact } = useFormFactor()
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const formationKind = useUiStore((s) => s.formationKind)
  const formationFacing = useUiStore((s) => s.formationFacing)
  const draft = useUiStore((s) => s.draft)
  const setFormationKind = useUiStore((s) => s.setFormationKind)
  const setFormationFacing = useUiStore((s) => s.setFormationFacing)

  const active = !!state && !!pending && pending.player !== botSeat
  const isDeploy = active && pending!.kind === 'deployUnit' && !!deployTargetUnitId
  const isMove = active && isPlacementDecision(pending)
  const show = isDeploy || isMove
  const perModelDraft = !!pending && (pending.kind === 'pileIn' || pending.kind === 'consolidate')
  const wrapRef = useRef<HTMLDivElement>(null)
  const bottomClear = useBottomClearance(show && compact, wrapRef)
  const hasPreview = show && !!draft && draft.decisionId === pending!.id

  const pick = (kind: FormationKind) => {
    setFormationKind(kind)
    regenerateActiveDraft(kind, formationFacing)
  }
  const rotateBy = (delta: number) => {
    const facing = normalizeAngle(formationFacing + delta)
    setFormationFacing(facing, false)
    regenerateActiveDraft(formationKind, facing)
  }
  const flip = () => rotateBy(Math.PI)

  // Keyboard: 1-7 pick a shape, 0 picks "Keep current shape" (move-family only), Q/E rotate 15°, R
  // flips 180°. Skipped while typing or a modifier is held, same guard as Hud's tool shortcuts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const kind = FORMATION_KEYS[e.key]
      if (kind && (kind !== 'keep' || isMove)) {
        pick(kind)
        return
      }
      switch (e.key) {
        case 'q':
        case 'Q':
          rotateBy(-ROTATE_STEP_RAD)
          break
        case 'e':
        case 'E':
          rotateBy(ROTATE_STEP_RAD)
          break
        case 'r':
        case 'R':
          flip()
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [show, isMove, formationKind, formationFacing])

  // Mouse wheel rotates in 15° steps while the preview (an actual drafted placement) is shown —
  // captured on window so it wins over OrbitControls' own wheel-zoom for the duration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // per-model pile-in/consolidate: the wheel zooms the camera (rotate stays on the buttons/keys)
    if (!hasPreview || perModelDraft || touch) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      rotateBy(e.deltaY > 0 ? ROTATE_STEP_RAD : -ROTATE_STEP_RAD)
    }
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [hasPreview, perModelDraft, touch, formationKind, formationFacing])

  if (!show) return null

  const facingDeg = Math.round((normalizeAngle(formationFacing) * 180) / Math.PI)
  const kinds: FormationKind[] = isMove ? ['keep', ...FORMATION_ORDER] : FORMATION_ORDER

  return (
    <div
      ref={wrapRef}
      style={compact ? { ...touchWrap, ...(bottomClear !== null ? { bottom: bottomClear } : null) } : touch ? { ...touchWrap, top: 56, bottom: 'auto', height: 'auto', padding: '6px 10px', left: '50%', right: 'auto', transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 16px)' } : wrap}
      data-testid="formation-picker"
    >
      {kinds.map((kind) => {
        const key = Object.entries(FORMATION_KEYS).find(([, k]) => k === kind)?.[0]
        return (
          <Tooltip key={kind} title={FORMATION_LABELS[kind]} body={FORMATION_HINTS[kind]}>
            <button
              data-testid={`formation-${kind}`}
              style={touch ? (kind === formationKind ? touchKindActive : touchKind) : kind === formationKind ? kindButtonActive : kindButton}
              onClick={() => pick(kind)}
            >
              <span>{FORMATION_LABELS[kind]}</span>
              {key && !touch && <span style={keyHint}>{key}</span>}
            </button>
          </Tooltip>
        )
      })}
      <span style={divider} />
      <button style={touch ? touchBtn : buttonBase} data-testid="formation-rotate-ccw" aria-label="Rotate left" onClick={() => rotateBy(-ROTATE_STEP_RAD)}>
        ↺
      </button>
      <span style={facingReadout} data-testid="formation-facing">
        {facingDeg}°
      </span>
      <button style={touch ? touchBtn : buttonBase} data-testid="formation-rotate-cw" aria-label="Rotate right" onClick={() => rotateBy(ROTATE_STEP_RAD)}>
        ↻
      </button>
      <button style={touch ? touchBtn : buttonBase} data-testid="formation-flip" aria-label="Flip facing" onClick={flip}>
        Flip
      </button>
    </div>
  )
}
