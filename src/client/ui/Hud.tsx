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

// A single CSS-grid row across the top of the screen — three columns (`auto 1fr auto`) so the left
// badge, the centre phase/round/active/mission/end-phase strip, and the right tool-group+badge can
// never overlap: grid columns never overlap by construction, regardless of how wide any one of them
// gets (a long faction name, six tool buttons, …). The old design used three independently-positioned
// `position: absolute` islands with a hand-guessed `calc(100vw - 420px)` cap on the centre strip's
// width — that guess assumed the right side only ever needed ~210px, but the tool-icon row + badge
// routinely needed ~400px+, so at 1600px wide the centred strip's own right edge landed past the tool
// group's left edge and the two painted on top of each other (the "End phase / Pass" button overlapping
// the first tool icon). Grid removes the need to guess a width at all.
const hudRow: CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 12,
  right: 12,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'flex-start',
  gap: 12,
  pointerEvents: 'none',
}

const hudLeftCell: CSSProperties = { pointerEvents: 'auto', justifySelf: 'start' }

// The centre cell is the grid's 1fr column, so it only ever gets the space left over after the left
// badge and the right tool-group+badge have taken theirs — its own content wraps to a second line
// (flexWrap) rather than overflow if that leftover space is narrow (e.g. 1280px wide).
const topBar: CSSProperties = {
  ...panel,
  justifySelf: 'center',
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 8,
  padding: '7px 14px',
  pointerEvents: 'auto',
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

/** Player badge — no longer self-positioning: the left one sits in `hudLeftCell` below, the right
 *  one is a plain flex child of `rightGroup` alongside the tool icons. */
const badge: CSSProperties = {
  ...panel,
  padding: '7px 12px',
  minWidth: 108,
  fontFamily: fontStack,
  pointerEvents: 'auto',
}

/** Centre grid cell: stacks the phase-tracker strip and (when present) the scoring hint directly
 *  beneath it, both centred as a unit — replaces the old scoring-hint's own `left: 50%` viewport
 *  centring (which assumed the phase strip was viewport-centred too; under the grid layout the centre
 *  cell is centred in the *leftover* space between the two badges, not the viewport, so the hint has
 *  to be a sibling inside the same cell to stay aligned under it at every width). */
const centerColumn: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
}

/** Right-side group: compact tool icon buttons immediately to the left of the right player badge —
 *  plain flex siblings in the grid's right cell (never overlapping the badge, and the grid guarantees
 *  the whole cell never overlaps the centre strip either). Wraps onto its own second line under the
 *  badge if it's ever narrower than the tool row needs, but below TOOLS_COLLAPSE_PX the tools collapse
 *  into a single "⋯" menu button instead (see `ToolButtons`), which is the normal case at 1280px. */
const rightGroup: CSSProperties = {
  justifySelf: 'end',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
  gap: 8,
  pointerEvents: 'auto',
}

const scoringHintStyle: CSSProperties = {
  ...panel,
  padding: '4px 12px',
  fontSize: 11,
  color: colors.muted,
  pointerEvents: 'none',
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

/** Fixed 32x32 icon-square buttons for the right-side tool group — a glyph, not a spelled-out word
 *  (the M2-era "Perspective"/"Settings" labels are what overcrowded the old single-row HUD). Each
 *  still carries its full explanation as both a `title` tooltip and an `aria-label`. */
const toolBtn: CSSProperties = {
  ...buttonBase,
  width: 32,
  height: 32,
  padding: 0,
  fontSize: 15,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const toolBtnActive: CSSProperties = { ...toolBtn, background: colors.accent, color: colors.accentText, borderColor: colors.accent }

/** Below this viewport width the right-side tool row no longer reliably fits beside the badges at
 *  1280px wide alongside a full-width centre strip, so the six icon buttons collapse into one "⋯"
 *  menu button that opens them as a dropdown instead (still 32px squares, same aria-label/tooltip). */
const TOOLS_COLLAPSE_PX = 1400

const toolsMenuWrap: CSSProperties = { position: 'relative' }
const toolsMenuPanel: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 36,
  right: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 6,
  pointerEvents: 'auto',
  zIndex: 2,
}

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

/** Tracks the viewport width so `ToolButtons` can collapse into a "⋯" menu below `TOOLS_COLLAPSE_PX` —
 *  plain resize listener, no ResizeObserver needed since this only cares about the window itself. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1600 : window.innerWidth))
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/** Measure / Line-of-sight / camera-angle / Focus / Keys / Settings — a row of fixed 32px icon
 *  squares anchored next to the right player badge (`rightGroup` in `Hud`), not inside the centre
 *  phase-tracker strip: spelling these out in words is what overcrowded the old single-row HUD. Each
 *  button carries its full explanation as both a `title` tooltip and an `aria-label`, so the icon-only
 *  glyph loses no information. Below `TOOLS_COLLAPSE_PX` (e.g. 1280px wide) the six squares collapse
 *  into one "⋯" button that opens them as a dropdown instead, so the row never has to wrap into the
 *  player-B badge's column. */
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
  const width = useWindowWidth()
  const [menuOpen, setMenuOpen] = useState(false)
  const collapsed = width < TOOLS_COLLAPSE_PX

  const focusSelected = () => {
    if (!state || !selectedUnitId) return
    const models = unitModels(state, selectedUnitId)
    if (models.length > 0) focusCamera(modelsAnchor(models))
  }

  const buttons = (
    <>
      <button
        style={measureOn ? toolBtnActive : toolBtn}
        data-testid="btn-measure"
        aria-label="Measure"
        title="Measure (M): click-drag on the board to draw a ruler. Drag from a model to the nearest enemy under the cursor for base-edge-to-base-edge range."
        onClick={toggleMeasure}
      >
        📏
      </button>
      <button
        style={losOn ? toolBtnActive : toolBtn}
        data-testid="btn-los"
        aria-label="Line of sight"
        title="Line of sight (L): with a unit selected, tints enemy units green (visible), yellow (visible but has Benefit of Cover), or red/dim (not visible)."
        onClick={toggleLos}
      >
        👁
      </button>
      <button
        style={topDown ? toolBtnActive : toolBtn}
        data-testid="btn-camera-topdown"
        aria-label="Camera angle"
        title={`Camera (T): switch between the angled overview and a straight-down top-down view. Currently: ${topDown ? 'top-down' : 'perspective'}.`}
        onClick={toggleTopDown}
      >
        📷
      </button>
      <button
        style={toolBtn}
        data-testid="btn-focus"
        aria-label="Focus selected unit"
        title="Focus (F): smoothly centre the camera on the currently selected unit."
        disabled={!selectedUnitId}
        onClick={focusSelected}
      >
        ⌖
      </button>
      <button
        style={helpOpen ? toolBtnActive : toolBtn}
        data-testid="btn-keys-help"
        aria-label="Keyboard shortcuts"
        title="Show the keyboard shortcuts for these tools."
        onClick={toggleHelp}
      >
        ?
      </button>
      <button
        style={settingsOpen ? toolBtnActive : toolBtn}
        data-testid="btn-settings"
        aria-label="Settings"
        title="Settings: volume/mute, animation speed, dice animation, ambient sound."
        onClick={toggleSettings}
      >
        ⚙
      </button>
    </>
  )

  if (!collapsed) return buttons

  return (
    <div style={toolsMenuWrap}>
      <button
        style={menuOpen ? toolBtnActive : toolBtn}
        data-testid="btn-tools-menu"
        aria-label="Battlefield tools"
        aria-expanded={menuOpen}
        title="Battlefield tools: Measure, Line of sight, Camera, Focus, Keys, Settings."
        onClick={() => setMenuOpen((v) => !v)}
      >
        ⋯
      </button>
      {menuOpen && (
        <div style={toolsMenuPanel} data-testid="tools-menu-panel">
          {buttons}
        </div>
      )}
    </div>
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
      <div style={hudRow}>
        <div style={hudLeftCell}>
          <PlayerBadge id="A" state={state} />
        </div>
        <div style={centerColumn}>
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
        </div>
        <div style={rightGroup}>
          <ToolButtons />
          <PlayerBadge id="B" state={state} />
        </div>
      </div>
      <MissionPanel open={missionOpen} onClose={() => setMissionOpen(false)} />
      <KeysHelp />
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
