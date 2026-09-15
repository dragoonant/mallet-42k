// HUD strip for the M4 formation picker: shown while a deploy/move/charge-move/pile-in/consolidate
// decision is waiting on a board click. Own-words shape buttons (+ number keys 1-7, 0 for "Keep
// current shape"), facing rotate (Q/E/wheel, 15° steps) and flip (R). Picking a shape or rotating
// re-lays out the *current* draft in place if one already exists (same anchor, new shape/facing);
// before the first click it only primes what the next click will use.
import { useEffect } from 'react'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import {
  FORMATION_HINTS, FORMATION_KEYS, FORMATION_LABELS, FORMATION_ORDER, ROTATE_STEP_RAD,
  formationPlacementsForUnit, isPlacementDecision, normalizeAngle, placementInfo, type FormationKind,
} from '../interaction'
import { buttonActive, buttonBase, colors, fontStack, mutedText, panel } from './theme'

// Anchored near the TOP of the screen (under the phase tracker / scoring hint), not stacked above
// the bottom decision prompt: the prompt's own height varies a lot (a deploy palette row, a hint
// line, Confirm/Cancel/Reset) and a fixed bottom offset would sometimes sit right on top of it,
// with the later-painted prompt panel silently swallowing this strip's clicks.
const wrap = {
  ...panel,
  position: 'absolute' as const,
  left: '50%',
  top: 100,
  transform: 'translateX(-50%)',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  pointerEvents: 'auto' as const,
  fontFamily: fontStack,
}

const kindButton = { ...buttonBase, fontSize: 12, padding: '5px 9px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1 }
const kindButtonActive = { ...kindButton, ...buttonActive }
const keyHint = { fontSize: 9, opacity: 0.7 }
const divider = { width: 1, alignSelf: 'stretch' as const, background: colors.border }
const facingReadout = { fontSize: 12, minWidth: 40, textAlign: 'center' as const, ...mutedText }

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
    if (!hasPreview) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      rotateBy(e.deltaY > 0 ? ROTATE_STEP_RAD : -ROTATE_STEP_RAD)
    }
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [hasPreview, formationKind, formationFacing])

  if (!show) return null

  const facingDeg = Math.round((normalizeAngle(formationFacing) * 180) / Math.PI)
  const kinds: FormationKind[] = isMove ? ['keep', ...FORMATION_ORDER] : FORMATION_ORDER

  return (
    <div style={wrap} data-testid="formation-picker">
      {kinds.map((kind) => {
        const key = Object.entries(FORMATION_KEYS).find(([, k]) => k === kind)?.[0]
        return (
          <button
            key={kind}
            data-testid={`formation-${kind}`}
            style={kind === formationKind ? kindButtonActive : kindButton}
            title={FORMATION_HINTS[kind]}
            onClick={() => pick(kind)}
          >
            <span>{FORMATION_LABELS[kind]}</span>
            {key && <span style={keyHint}>{key}</span>}
          </button>
        )
      })}
      <span style={divider} />
      <button style={buttonBase} data-testid="formation-rotate-ccw" title="Rotate 15° (Q)" onClick={() => rotateBy(-ROTATE_STEP_RAD)}>
        ↺
      </button>
      <span style={facingReadout} data-testid="formation-facing">
        {facingDeg}°
      </span>
      <button style={buttonBase} data-testid="formation-rotate-cw" title="Rotate 15° (E)" onClick={() => rotateBy(ROTATE_STEP_RAD)}>
        ↻
      </button>
      <button style={buttonBase} data-testid="formation-flip" title="Flip front/back (R)" onClick={flip}>
        Flip
      </button>
    </div>
  )
}
