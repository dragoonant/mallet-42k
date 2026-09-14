// Phase tracker + CP/VP HUD (docs/spec/50-client.md §5), plus the M2 battlefield tools (Measure,
// Line-of-sight, camera toggle, Focus) and their keyboard shortcuts. Pure readout except the End
// phase/Pass button (dispatches whatever `pass` action legalActions() already validated) and the
// tool buttons, which only ever touch uiStore — never GameState directly.
import { useEffect, useState, type CSSProperties } from 'react'
import { unitModels, type GameState, type Phase, type PlayerId } from '@/engine'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import { modelsAnchor } from '../interaction/geometry'
import { MissionPanel } from './MissionPanel'
import { primaryScoringWindowHint, sourceName } from './labels'
import { buttonActive, buttonBase, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

const PHASES: { id: Phase; label: string }[] = [
  { id: 'deployment', label: 'Deploy' },
  { id: 'command', label: 'Command' },
  { id: 'movement', label: 'Movement' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'charge', label: 'Charge' },
  { id: 'fight', label: 'Fight' },
]

const topBar: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '8px 16px',
  pointerEvents: 'auto',
}

const chip: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  color: colors.muted,
  border: `1px solid ${colors.border}`,
}

const chipActive: CSSProperties = { ...chip, color: colors.accentText, background: colors.accent, borderColor: colors.accent }

const badge: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 12,
  padding: '8px 14px',
  minWidth: 120,
  fontFamily: fontStack,
  pointerEvents: 'auto',
}

const scoringHintStyle: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 56,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  fontSize: 11,
  color: colors.muted,
  pointerEvents: 'none',
}

const vpButton: CSSProperties = {
  fontFamily: fontStack,
  fontSize: 13,
  color: colors.text,
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'block',
}

const vpBreakdown: CSSProperties = { marginTop: 6, maxHeight: 160, overflowY: 'auto', width: 200, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }
const vpRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 }

const toolsDivider: CSSProperties = { width: 1, alignSelf: 'stretch', background: colors.border }

const helpPanel: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 56,
  right: 12,
  width: 210,
  padding: 12,
  pointerEvents: 'auto',
  fontSize: 12.5,
  zIndex: 1,
}
const keyRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0' }
const kbd: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  background: 'rgba(255,255,255,0.08)',
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  padding: '1px 6px',
}

const SHORTCUTS: { key: string; label: string }[] = [
  { key: 'M', label: 'Toggle Measure' },
  { key: 'L', label: 'Toggle Line of sight' },
  { key: 'T', label: 'Top-down / Perspective' },
  { key: 'F', label: 'Focus selected unit' },
  { key: 'Esc', label: 'Clear measurement' },
]

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Keyboard shortcuts for the battlefield tools below — M/L/T/F act on whichever unit is currently
 *  selected (if any); Esc only clears the ruler, it never closes the tool. Skipped while a text
 *  field has focus or a modifier is held, so it never fights browser/OS shortcuts. */
function useToolShortcuts() {
  const state = useGameStore((s) => s.state)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const toggleMeasure = useUiStore((s) => s.toggleMeasure)
  const toggleLos = useUiStore((s) => s.toggleLos)
  const toggleTopDown = useUiStore((s) => s.toggleTopDown)
  const clearMeasure = useUiStore((s) => s.clearMeasure)
  const focusCamera = useUiStore((s) => s.focusCamera)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'm':
        case 'M':
          toggleMeasure()
          break
        case 'l':
        case 'L':
          toggleLos()
          break
        case 't':
        case 'T':
          toggleTopDown()
          break
        case 'f':
        case 'F': {
          if (!state || !selectedUnitId) break
          const models = unitModels(state, selectedUnitId)
          if (models.length > 0) focusCamera(modelsAnchor(models))
          break
        }
        case 'Escape':
          clearMeasure()
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, selectedUnitId, toggleMeasure, toggleLos, toggleTopDown, clearMeasure, focusCamera])
}

/** Measure / Line-of-sight / camera-angle / Focus buttons, tacked onto the phase-tracker bar so they
 *  never need their own absolutely-positioned real estate (M2 battlefield gaps). */
function ToolButtons() {
  const state = useGameStore((s) => s.state)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const measureOn = useUiStore((s) => s.measureOn)
  const losOn = useUiStore((s) => s.losOn)
  const topDown = useUiStore((s) => s.topDown)
  const helpOpen = useUiStore((s) => s.helpOpen)
  const toggleMeasure = useUiStore((s) => s.toggleMeasure)
  const toggleLos = useUiStore((s) => s.toggleLos)
  const toggleTopDown = useUiStore((s) => s.toggleTopDown)
  const toggleHelp = useUiStore((s) => s.toggleHelp)
  const focusCamera = useUiStore((s) => s.focusCamera)

  const focusSelected = () => {
    if (!state || !selectedUnitId) return
    const models = unitModels(state, selectedUnitId)
    if (models.length > 0) focusCamera(modelsAnchor(models))
  }

  return (
    <>
      <span style={toolsDivider} />
      <button
        style={measureOn ? buttonActive : buttonBase}
        data-testid="btn-measure"
        title="Measure (M): click-drag on the board to draw a ruler. Drag from a model to the nearest enemy under the cursor for base-edge-to-base-edge range."
        onClick={toggleMeasure}
      >
        Measure
      </button>
      <button
        style={losOn ? buttonActive : buttonBase}
        data-testid="btn-los"
        title="Line of sight (L): with a unit selected, tints enemy units green (visible), yellow (visible but has Benefit of Cover), or red/dim (not visible)."
        onClick={toggleLos}
      >
        LoS
      </button>
      <button
        style={topDown ? buttonActive : buttonBase}
        data-testid="btn-camera-topdown"
        title="Camera (T): switch between the angled overview and a straight-down top-down view."
        onClick={toggleTopDown}
      >
        {topDown ? 'Top-down' : 'Perspective'}
      </button>
      <button
        style={buttonBase}
        data-testid="btn-focus"
        title="Focus (F): smoothly centre the camera on the currently selected unit."
        disabled={!selectedUnitId}
        onClick={focusSelected}
      >
        Focus
      </button>
      <button
        style={helpOpen ? buttonActive : buttonBase}
        data-testid="btn-keys-help"
        title="Show the keyboard shortcuts for these tools."
        onClick={toggleHelp}
      >
        Keys
      </button>
    </>
  )
}

function KeysHelp() {
  const helpOpen = useUiStore((s) => s.helpOpen)
  if (!helpOpen) return null
  return (
    <div style={helpPanel} data-testid="keys-help">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Keyboard shortcuts</div>
      {SHORTCUTS.map((s) => (
        <div key={s.key} style={keyRow}>
          <span style={mutedText}>{s.label}</span>
          <span style={kbd}>{s.key}</span>
        </div>
      ))}
    </div>
  )
}

export function Hud() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const [missionOpen, setMissionOpen] = useState(false)
  useToolShortcuts()

  if (!state) return null
  const passAction = legal?.find((a) => a.type === 'pass') ?? null
  const thinking = !!pending && pending.player === botSeat
  const scoringHint = primaryScoringWindowHint(state.mission.data)

  return (
    <>
      <div style={topBar} data-testid="phase-tracker">
        <span data-testid="hud-round" style={{ fontWeight: 700 }}>
          Round {state.round}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {PHASES.map((p) => (
            <span key={p.id} data-testid={`phase-chip-${p.id}`} style={p.id === state.phase ? chipActive : chip}>
              {p.label}
            </span>
          ))}
        </span>
        <span style={mutedText}>
          Active: {state.activePlayer}
          {state.activePlayer === state.firstPlayer ? ' (went first)' : ''}
          {thinking ? ' — thinking…' : ''}
        </span>
        <button style={buttonBase} data-testid="btn-mission" onClick={() => setMissionOpen((v) => !v)}>
          Mission
        </button>
        <button style={buttonPrimary} data-testid="btn-end-phase" disabled={!passAction} onClick={() => passAction && dispatch(passAction)}>
          End phase / Pass
        </button>
        <ToolButtons />
      </div>
      {scoringHint && !missionOpen && (
        <div style={scoringHintStyle} data-testid="hud-scoring-hint">
          {scoringHint}
        </div>
      )}
      <MissionPanel open={missionOpen} onClose={() => setMissionOpen(false)} />
      <KeysHelp />
      <PlayerBadge id="A" state={state} side="left" />
      <PlayerBadge id="B" state={state} side="right" />
    </>
  )
}

function PlayerBadge({ id, state, side }: { id: PlayerId; state: GameState; side: 'left' | 'right' }) {
  const bundle = useGameStore((s) => s.bundle)
  const [open, setOpen] = useState(false)
  const p = state.players[id]
  const color = id === 'A' ? colors.playerA : colors.playerB
  const scored = state.mission.scored.filter((row) => row.player === id).sort((a, b) => b.round - a.round)

  return (
    <div style={{ ...badge, [side]: 12 }}>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>
        {p.name} ({id})
      </div>
      <div style={{ fontSize: 13 }} data-testid={`hud-cp-${id}`}>
        CP {p.cp}
      </div>
      <button style={vpButton} data-testid={`hud-vp-${id}`} onClick={() => setOpen((v) => !v)}>
        VP {p.vp} {scored.length > 0 ? (open ? '▲' : '▼') : ''}
      </button>
      {open && (
        <div style={vpBreakdown} data-testid={`hud-vp-breakdown-${id}`}>
          {scored.length === 0 && <div style={mutedText}>No VP scored yet.</div>}
          {scored.map((row, i) => (
            <div key={i} style={vpRow}>
              <span style={mutedText}>R{row.round} {sourceName(state, bundle, row.ruleId)}</span>
              <span>+{row.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
