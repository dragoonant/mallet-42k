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
import { buttonBase, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

const PHASES: { id: Phase; label: string }[] = [
  { id: 'deployment', label: 'Deploy' },
  { id: 'command', label: 'Command' },
  { id: 'movement', label: 'Movement' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'charge', label: 'Charge' },
  { id: 'fight', label: 'Fight' },
]

// Three independent screen regions, each its own absolutely-positioned island (docs/spec/50-client.md
// §5's "HUD is a readout, never blocks the board" — none of these may grow wide enough to bleed into
// a neighbour): the left player badge, the centre phase/round/active-player strip (its own max-width
// keeps it from ever sliding under a badge, and it wraps to a second line rather than overflow), and
// a right-side group holding the compact tool icons next to the right player badge. Battlefield tools
// (Measure/LoS/Perspective/Focus/Keys/Settings) live in that right group, not the centre strip, so the
// centre strip only ever holds the few things that change every turn (round, phase, whose go it is).
const topBar: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 10,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 8,
  padding: '7px 14px',
  pointerEvents: 'auto',
  maxWidth: 'calc(100vw - 420px)',
}

const chip: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  color: colors.muted,
  border: `1px solid ${colors.border}`,
  whiteSpace: 'nowrap',
}

const chipActive: CSSProperties = { ...chip, color: colors.accentText, background: colors.accent, borderColor: colors.accent }

/** Player badge — no longer self-positioning: the left one sits in `leftBadgeWrap` below, the right
 *  one is a plain flex child of `rightGroup` alongside the tool icons. */
const badge: CSSProperties = {
  ...panel,
  padding: '7px 12px',
  minWidth: 108,
  fontFamily: fontStack,
  pointerEvents: 'auto',
}

const leftBadgeWrap: CSSProperties = { position: 'absolute', top: 10, left: 12, pointerEvents: 'auto' }

/** Right-side island: compact tool icon buttons immediately to the left of the right player badge,
 *  both flush to the top-right corner — never under the centre strip (which is width-capped above)
 *  and never overlapping the badge (they're siblings in one flex row, not two overlapping absolutes). */
const rightGroup: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 12,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  pointerEvents: 'auto',
}

const scoringHintStyle: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 54,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  fontSize: 11,
  color: colors.muted,
  pointerEvents: 'none',
  maxWidth: 'calc(100vw - 420px)',
  textAlign: 'center',
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

/** Compact icon-style buttons for the right-side tool group — short glyphs, not full words, since
 *  six of these now share one row next to the right player badge (the M2-era spelled-out
 *  "Perspective"/"Settings" labels are what overcrowded the old single-row HUD). Each still carries
 *  its full explanation as a `title` tooltip. */
const toolBtn: CSSProperties = { ...buttonBase, padding: '6px 9px', fontSize: 12, minWidth: 30, textAlign: 'center' }
const toolBtnActive: CSSProperties = { ...toolBtn, background: colors.accent, color: colors.accentText, borderColor: colors.accent }

const helpPanel: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 52,
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
  { key: 'Right-drag', label: 'Rotate camera' },
  { key: 'Middle-drag', label: 'Pan camera' },
  { key: 'Space/Shift + drag', label: 'Pan camera (trackpad)' },
  { key: 'Alt + drag', label: 'Rotate camera (trackpad)' },
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

/** Measure / Line-of-sight / camera-angle / Focus / Keys / Settings — a compact icon row anchored
 *  next to the right player badge (`rightGroup` in `Hud`), not inside the centre phase-tracker strip:
 *  that's what let this row's six spelled-out labels overcrowd the HUD before. Every button keeps its
 *  full explanation as a hover tooltip (`title`) so the short glyph loses no information. */
function ToolButtons() {
  const state = useGameStore((s) => s.state)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const measureOn = useUiStore((s) => s.measureOn)
  const losOn = useUiStore((s) => s.losOn)
  const topDown = useUiStore((s) => s.topDown)
  const helpOpen = useUiStore((s) => s.helpOpen)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const toggleMeasure = useUiStore((s) => s.toggleMeasure)
  const toggleLos = useUiStore((s) => s.toggleLos)
  const toggleTopDown = useUiStore((s) => s.toggleTopDown)
  const toggleHelp = useUiStore((s) => s.toggleHelp)
  const toggleSettings = useUiStore((s) => s.toggleSettings)
  const focusCamera = useUiStore((s) => s.focusCamera)

  const focusSelected = () => {
    if (!state || !selectedUnitId) return
    const models = unitModels(state, selectedUnitId)
    if (models.length > 0) focusCamera(modelsAnchor(models))
  }

  return (
    <>
      <button
        style={measureOn ? toolBtnActive : toolBtn}
        data-testid="btn-measure"
        title="Measure (M): click-drag on the board to draw a ruler. Drag from a model to the nearest enemy under the cursor for base-edge-to-base-edge range."
        onClick={toggleMeasure}
      >
        Msr
      </button>
      <button
        style={losOn ? toolBtnActive : toolBtn}
        data-testid="btn-los"
        title="Line of sight (L): with a unit selected, tints enemy units green (visible), yellow (visible but has Benefit of Cover), or red/dim (not visible)."
        onClick={toggleLos}
      >
        LoS
      </button>
      <button
        style={topDown ? toolBtnActive : toolBtn}
        data-testid="btn-camera-topdown"
        title={`Camera (T): switch between the angled overview and a straight-down top-down view. Currently: ${topDown ? 'top-down' : 'perspective'}.`}
        onClick={toggleTopDown}
      >
        Cam
      </button>
      <button
        style={toolBtn}
        data-testid="btn-focus"
        title="Focus (F): smoothly centre the camera on the currently selected unit."
        disabled={!selectedUnitId}
        onClick={focusSelected}
      >
        Foc
      </button>
      <button
        style={helpOpen ? toolBtnActive : toolBtn}
        data-testid="btn-keys-help"
        title="Show the keyboard shortcuts for these tools."
        onClick={toggleHelp}
      >
        ?
      </button>
      <button
        style={settingsOpen ? toolBtnActive : toolBtn}
        data-testid="btn-settings"
        title="Settings: volume/mute, animation speed, dice animation, ambient sound."
        onClick={toggleSettings}
      >
        ⚙
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
  const activeTitle = `Active: ${state.activePlayer}${state.activePlayer === state.firstPlayer ? ' (went first)' : ''}${thinking ? ' — thinking…' : ''}`

  return (
    <>
      <div style={leftBadgeWrap}>
        <PlayerBadge id="A" state={state} />
      </div>
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
        <span style={mutedText} title={activeTitle}>
          Active: {state.activePlayer}
          {thinking ? '…' : ''}
        </span>
        <button style={buttonBase} data-testid="btn-mission" onClick={() => setMissionOpen((v) => !v)}>
          Mission
        </button>
        <button style={buttonPrimary} data-testid="btn-end-phase" disabled={!passAction} onClick={() => passAction && dispatch(passAction)}>
          End phase / Pass
        </button>
      </div>
      {scoringHint && !missionOpen && (
        <div style={scoringHintStyle} data-testid="hud-scoring-hint">
          {scoringHint}
        </div>
      )}
      <MissionPanel open={missionOpen} onClose={() => setMissionOpen(false)} />
      <KeysHelp />
      <div style={rightGroup}>
        <ToolButtons />
        <PlayerBadge id="B" state={state} />
      </div>
    </>
  )
}

function PlayerBadge({ id, state }: { id: PlayerId; state: GameState }) {
  const bundle = useGameStore((s) => s.bundle)
  const [open, setOpen] = useState(false)
  const p = state.players[id]
  const color = id === 'A' ? colors.playerA : colors.playerB
  const scored = state.mission.scored.filter((row) => row.player === id).sort((a, b) => b.round - a.round)

  return (
    <div style={badge}>
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
