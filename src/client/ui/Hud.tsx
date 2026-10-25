// Phase tracker + CP/VP HUD (docs/spec/50-client.md §5), plus the M2 battlefield tools (Measure,
// Line-of-sight, camera toggle, Focus) and their keyboard shortcuts. Pure readout except the End
// phase/Pass button (dispatches whatever `pass` action legalActions() already validated) and the
// tool buttons, which only ever touch uiStore — never GameState directly.
import { useEffect, useState, type CSSProperties } from 'react'
import { unitModels, type Action, type GameState, type Phase, type PlayerId } from '@/engine'
import { useGameStore } from '../store/game'
import { useCaughtUp, useDisplayState } from '../presentation/presentedStore'
import { useUiStore } from './uiStore'
import { modelsAnchor } from '../interaction/geometry'
import { isPlacementDecision } from '../interaction/decisions'
import { MissionPanel } from './MissionPanel'
import { Tooltip } from './Tooltip'
import { hasFatePool } from './fate'
import { primaryScoringWindowHint, sourceName } from './labels'
import { BATTLEFIELDS } from '../board/terrainAssets'
import { cameraNudge } from '../board/touchCamera'
import { useFormFactor } from './formFactor'
import { COMPACT_BAR_PX, useCompactSheets, type SheetId } from './compactSheets'
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

const chipActive: CSSProperties = { ...chip, color: colors.accentText, background: colors.accent, border: `1px solid ${colors.accent}` }

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
const toolBtnActive: CSSProperties = { ...toolBtn, background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` }

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
  { key: 'V', label: 'Cycle camera view (top / your edge / far edge / follow)' },
  { key: 'W A S D', label: 'Pan camera' },
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

/** Keyboard shortcuts for the battlefield tools below — M/L/T/F/V act on whichever unit is currently
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
  const cycleCameraPreset = useUiStore((s) => s.cycleCameraPreset)

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
        case 'v':
        case 'V': {
          cycleCameraPreset()
          // 'follow' goes to the selected unit when there is one (focusCamera also requests the follow preset).
          if (useUiStore.getState().cameraPreset?.id === 'follow' && state && selectedUnitId) {
            const models = unitModels(state, selectedUnitId)
            if (models.length > 0) focusCamera(modelsAnchor(models))
          }
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
  }, [state, selectedUnitId, toggleMeasure, toggleLos, toggleTopDown, clearMeasure, focusCamera, cycleCameraPreset])
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
  const togglePainter = useUiStore((s) => s.togglePainter)
  const focusCamera = useUiStore((s) => s.focusCamera)
  const width = useWindowWidth()
  const [menuOpen, setMenuOpen] = useState(false)
  const collapsed = width < TOOLS_COLLAPSE_PX

  const focusSelected = () => {
    if (!state || !selectedUnitId) return
    const models = unitModels(state, selectedUnitId)
    if (models.length > 0) focusCamera(modelsAnchor(models))
  }

  const battlefieldIndex = useUiStore((s) => s.battlefieldIndex)
  const cycleBattlefield = useUiStore((s) => s.cycleBattlefield)
  const battlefieldName = BATTLEFIELDS[battlefieldIndex].name

  const buttons = (
    <>
      <Tooltip title="Battlefield" body={'Cycle the ground texture (purely cosmetic).'} placement="bottom">
        <button
          style={{ ...toolBtn, width: 'auto', padding: '0 10px', fontSize: 12, whiteSpace: 'nowrap' }}
          data-testid="btn-battlefield"
          aria-label={`Battlefield: ${battlefieldName}`}
          onClick={cycleBattlefield}
        >
          Battlefield: {battlefieldName} ▸
        </button>
      </Tooltip>
      <Tooltip title="Measure (M)" body={'Click-drag on the board to draw a ruler. Drag from a model to the nearest enemy under the cursor for base-edge-to-base-edge range.'} placement="bottom">
        <button
          style={measureOn ? toolBtnActive : toolBtn}
          data-testid="btn-measure"
          aria-label="Measure"
          onClick={toggleMeasure}
        >
          📏
        </button>
      </Tooltip>
      <Tooltip title="Line of sight (L)" body={'With a unit selected, tints enemy units green (visible), yellow (visible but has Benefit of Cover), or red/dim (not visible).'} placement="bottom">
        <button
          style={losOn ? toolBtnActive : toolBtn}
          data-testid="btn-los"
          aria-label="Line of sight"
          onClick={toggleLos}
        >
          👁
        </button>
      </Tooltip>
      <Tooltip title="Camera (T)" body={`Switch between the angled overview and a straight-down view. Currently: ${topDown ? 'top-down' : 'perspective'}.`} placement="bottom">
        <button
          style={topDown ? toolBtnActive : toolBtn}
          data-testid="btn-camera-topdown"
          aria-label="Camera angle"
          onClick={toggleTopDown}
        >
          📷
        </button>
      </Tooltip>
      <Tooltip wrap title="Focus (F)" body={'Smoothly centre the camera on the selected unit.'} placement="bottom">
        <button
          style={toolBtn}
          data-testid="btn-focus"
          aria-label="Focus selected unit"
          disabled={!selectedUnitId}
          onClick={focusSelected}
        >
          ⌖
        </button>
      </Tooltip>
      <Tooltip title="Keyboard shortcuts" body={'Show the keyboard shortcuts for these tools.'} placement="bottom">
        <button
          style={helpOpen ? toolBtnActive : toolBtn}
          data-testid="btn-keys-help"
          aria-label="Keyboard shortcuts"
          onClick={toggleHelp}
        >
          ?
        </button>
      </Tooltip>
      <Tooltip title="Paint army" body={'Pick major/minor colours and a base style for your forces.'} placement="bottom">
        <button
          style={toolBtn}
          data-testid="btn-painter"
          aria-label="Paint army"
          onClick={togglePainter}
        >
          🎨
        </button>
      </Tooltip>
      <Tooltip title="Settings" body={'Volume/mute, animation speed, dice animation, ambient sound.'} placement="bottom">
        <button
          style={settingsOpen ? toolBtnActive : toolBtn}
          data-testid="btn-settings"
          aria-label="Settings"
          onClick={toggleSettings}
        >
          ⚙
        </button>
      </Tooltip>
    </>
  )

  if (!collapsed) return buttons

  return (
    <div style={toolsMenuWrap}>
      <Tooltip title="Battlefield tools" body={'Measure, Line of sight, Camera, Focus, Keys, Settings.'} placement="bottom">
        <button
          style={menuOpen ? toolBtnActive : toolBtn}
          data-testid="btn-tools-menu"
          aria-label="Battlefield tools"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
      </Tooltip>
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
  const state = useDisplayState()
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const pendingSeq = useGameStore((s) => s.pendingSeq)
  const caughtUp = useCaughtUp(pendingSeq)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const [missionOpen, setMissionOpen] = useState(false)
  const { compact } = useFormFactor()
  useToolShortcuts()

  if (!state) return null
  // Same gate as DecisionPrompt: no passing on a decision whose dice are still being shown.
  const passAction = !caughtUp ? null : (legal?.find((a) => a.type === 'pass') ?? null)
  const thinking = !!pending && pending.player === botSeat
  if (compact) return <CompactHud state={state} passAction={passAction} thinking={thinking} dispatch={dispatch} />
  const scoringHint = primaryScoringWindowHint(state.mission.data)
  // The M4 formation picker bar (FormationPicker.tsx) floats just under this HUD row, anchored to the
  // same horizontal centre as this hint — when both are showing, the picker sat visually on top with
  // the hint peeking out from behind its edges instead of being fully hidden. Same "is the picker
  // showing" condition FormationPicker.tsx itself uses (isDeploy || isMove), so the two never disagree.
  const pickerOpen = !!pending && pending.player !== botSeat && ((pending.kind === 'deployUnit' && !!deployTargetUnitId) || isPlacementDecision(pending))
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
            <Tooltip title="Active player" body={activeTitle}><span style={mutedText}>
              Active: {state.activePlayer}
              {thinking ? '…' : ''}
            </span></Tooltip>
            <button style={buttonBase} data-testid="btn-mission" onClick={() => setMissionOpen((v) => !v)}>
              Mission
            </button>
            <button style={buttonPrimary} data-testid="btn-end-phase" disabled={!passAction} onClick={() => passAction && dispatch(passAction)}>
              End phase / Pass
            </button>
          </div>
          {scoringHint && !missionOpen && !pickerOpen && (
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

/** True when the player's army has Acts of Faith: Adepta Sororitas patrol, or any of their units carries the
 *  ability or the faction keyword. Not inferred from `player.miracle`, which the engine initialises for everyone. */
function hasActsOfFaith(state: GameState, id: PlayerId): boolean {
  if (state.players[id].faction === 'adepta-sororitas') return true
  const isAof = (s: string) => /acts[-_ ]?of[-_ ]?faith/i.test(s)
  return Object.values(state.units).some((u) => {
    if (u.player !== id) return false
    const ds = state.datasheets[u.datasheetId]
    if (!ds) return false
    return (
      ds.abilities.some((ab) => {
        const rt = state.abilities[ab] as ({ code?: string; name?: string } | undefined)
        return isAof(String(ab)) || (rt != null && (isAof(rt.code ?? '') || isAof(rt.name ?? '')))
      }) ||
      [...ds.factionKeywords, ...ds.keywords].some((k) => String(k).toUpperCase() === 'ADEPTA SORORITAS')
    )
  })
}

/** Adepta Sororitas' pool of Miracle dice (their Acts of Faith rule): a row of small pips showing each saved
 *  die's fixed value. Renders nothing for an army without the rule. */
function MiracleDice({ dice: diceIn, id, enabled, fate }: { dice: number[] | undefined; id: PlayerId; enabled: boolean; fate?: boolean }) {
  if (!enabled) return null
  const dice = diceIn ?? []
  return (
    <Tooltip title={fate ? 'Fate dice' : 'Miracle dice'} body={fate ? 'Spend one in place of a die of a roll (Strands of Fate).' : 'Spend one in place of a roll (Acts of Faith).'} placement="bottom"><div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }} data-testid={`hud-miracle-${id}`}>
      <span>{fate ? 'Fate' : 'Miracle'}</span>
      {dice.length === 0 && <span style={mutedText}>none</span>}
      {dice.map((v, i) => (
        <span
          key={i}
          style={{ minWidth: 18, height: 18, lineHeight: '18px', textAlign: 'center', borderRadius: 4, background: '#f2efe6', color: '#1c1c22', fontWeight: 700, fontSize: 12 }}
        >
          {v}
        </span>
      ))}
    </div></Tooltip>
  )
}

/** True when any of the player's units carries Drukhari Power from Pain (matched by ability code, so it follows the data). */
function hasPowerFromPain(state: GameState, id: PlayerId): boolean {
  return Object.values(state.units).some((u) => {
    if (u.player !== id) return false
    const ds = state.datasheets[u.datasheetId]
    return !!ds && ds.abilities.some((ab) => (state.abilities[ab] as { code?: string } | undefined)?.code === 'powerFromPain')
  })
}

/** Drukhari Pain tokens (Power from Pain): a row of small pips, one per saved token. Renders nothing for other armies. */
function PainTokens({ state, id }: { state: GameState; id: PlayerId }) {
  if (!hasPowerFromPain(state, id)) return null
  const raw = state.players[id].secondaryState?.painTokens
  const n = typeof raw === 'number' && raw > 0 ? raw : 0
  return (
    <Tooltip title="Pain tokens" body="Spend one at the start of a phase to Empower a unit: it may re-roll Advance, Charge and (in Shooting or Fight) hit rolls that phase. You gain one at the start of the battle, whenever an enemy unit is destroyed, and whenever an enemy unit fails a Battle-shock test." placement="bottom"><div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }} data-testid={`hud-pain-${id}`}>
      <span>Pain</span>
      {n === 0 && <span style={mutedText}>none</span>}
      {n > 0 && n <= 8 && Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: '#3fe0c0', boxShadow: '0 0 4px #3fe0c0' }} />
      ))}
      {n > 8 && <span style={{ fontWeight: 700 }}>{n}</span>}
    </div></Tooltip>
  )
}

/** True when any of the player's units carries a Cabal of Sorcerers ability (matched by ability code, so it follows the data). */
function hasCabal(state: GameState, id: PlayerId): boolean {
  return Object.values(state.units).some((u) => {
    if (u.player !== id) return false
    const ds = state.datasheets[u.datasheetId]
    return !!ds && ds.abilities.some((ab) => {
      const code = (state.abilities[ab] as { code?: string } | undefined)?.code
      return code === 'cabalOfSorcerers' || code === 'cabalRituals'
    })
  })
}

/** Thousand Sons Cabal pool: Psykers fill it at the end of your Command phase, Rituals spend it. Renders nothing for other armies. */
function CabalPool({ state, id }: { state: GameState; id: PlayerId }) {
  if (!hasCabal(state, id)) return null
  const raw = state.players[id].secondaryState?.cabalPoints
  const n = typeof raw === 'number' && raw > 0 ? raw : 0
  return (
    <Tooltip title="Cabal pool" body="Your Psykers add points at the end of your Command phase, and the pool empties at the start of your next one. At the start of any phase, spend points on a Ritual: Weaver of Fates (2) re-rolls a failed save near your Psyker, Echoes from the Warp (6) makes one Stratagem free for a unit." placement="bottom"><div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }} data-testid={`hud-cabal-${id}`}>
      <span>Cabal</span>
      {n === 0 && <span style={mutedText}>empty</span>}
      {n > 0 && n <= 10 && Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ width: 10, height: 10, borderRadius: 2, transform: 'rotate(45deg)', background: '#5ad1e6', boxShadow: '0 0 4px #5ad1e6' }} />
      ))}
      {n > 10 && <span style={{ fontWeight: 700 }}>{n}</span>}
    </div></Tooltip>
  )
}

function PlayerBadge({ id, state }: { id: PlayerId; state: GameState }) {
  const bundle = useGameStore((s) => s.bundle)
  const [open, setOpen] = useState(false)
  const p = state.players[id]
  const color = id === 'A' ? colors.playerA : colors.playerB
  const scored = state.mission.scored.filter((row) => row.player === id).sort((a, b) => b.round - a.round)

  // `data-hud-badge` lets App.tsx's right rail (Dice Log + tray) measure the B badge and sit under it.
  return (
    <div style={badge} data-hud-badge={id}>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>
        {p.name} ({id})
      </div>
      <div style={{ fontSize: 13 }} data-testid={`hud-cp-${id}`}>
        CP {p.cp}
      </div>
      <MiracleDice dice={(p as { miracle?: { dice?: number[] } }).miracle?.dice} id={id} enabled={hasActsOfFaith(state, id) || hasFatePool(state, id)} fate={hasFatePool(state, id) && !hasActsOfFaith(state, id)} />
      <PainTokens state={state} id={id} />
      <CabalPool state={state} id={id} />
      <button style={vpButton} data-testid={`hud-vp-${id}`} onClick={() => setOpen((v) => !v)}>
        VP {p.vp} {scored.length > 0 ? (open ? '▲' : '▼') : ''}
      </button>
      {open && (
        <div style={vpBreakdown} data-testid={`hud-vp-breakdown-${id}`}>
          {scored.length === 0 && <div style={mutedText}>No VP scored yet.</div>}
          {scored.map((row, i) => (
            <div key={i} style={vpRow}>
              <span style={mutedText}>R{row.round} {sourceName(state, bundle, row.ruleId)}</span>
              <span>{row.amount >= 0 ? "+" : ""}{row.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------
// Compact (phone) HUD (M11). Landscape 852x393 is the design target, 667x375 the tightest case.
//   top bar  full width, 44px + safe-top: [A][B] badges | round + phase | ... | Strat | End phase | ⋯ menu
//   menu     two columns of 44px items: drawers (Mission, Dice log, Event feed, Settings) and board tools
//   badges   tap for the VP breakdown and the army's special pools (Miracle / Fate / Pain / Cabal)
//   camera   a slim vertical column (40px wide, 44px tall targets) on the right edge under the bar: rotate L/R,
//            zoom in/out, top-down (just rotate L/R + top-down when the window is under 400px tall). The bottom
//            sheet, staged-move row and formation strip all stop short of it (CAMERA_COL_PX); hidden while a drawer is open
// Drawers (Mission / Stratagems / Log / Feed / Settings) live in compactSheets.ts; one open at a time.
// ---------------------------------------------------------------------------------------------------
const TOUCH = 44

const cBar: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 'calc(0px - var(--safe-top, 0px))',
  left: 'calc(0px - var(--safe-left, 0px))',
  right: 'calc(0px - var(--safe-right, 0px))',
  height: `calc(${COMPACT_BAR_PX}px + var(--safe-top, 0px))`,
  padding: '0 var(--safe-right, 0px) 0 var(--safe-left, 0px)',
  paddingTop: 'var(--safe-top, 0px)',
  boxSizing: 'border-box',
  borderRadius: 0,
  borderTop: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  pointerEvents: 'auto',
  zIndex: 40,
}
const cBarRow: CSSProperties = { height: COMPACT_BAR_PX, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', boxSizing: 'border-box', minWidth: 0 }
const cBadgeWrap: CSSProperties = { position: 'relative', flex: '0 1 auto', minWidth: 0 }
const cBadgeBtn: CSSProperties = {
  fontFamily: fontStack,
  color: colors.text,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  minHeight: TOUCH,
  padding: '0 8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  lineHeight: 1.15,
  cursor: 'pointer',
  minWidth: 0,
  textAlign: 'left',
}
const cBadgeName: CSSProperties = { fontSize: 11, fontWeight: 700, maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const cBadgeNums: CSSProperties = { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }
const cPhaseBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: '0 1 auto', whiteSpace: 'nowrap', fontSize: 12 }
const cBtn: CSSProperties = { ...buttonBase, minHeight: TOUCH, minWidth: TOUCH, padding: '0 10px', fontSize: 13 }
const cBtnPrimary: CSSProperties = { ...buttonPrimary, minHeight: TOUCH, padding: '0 12px', fontSize: 13 }
const cPopover: CSSProperties = {
  ...panel,
  background: colors.bgSolid,
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  width: 'min(230px, 50vw)',
  maxHeight: 'calc(100dvh - 72px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 3,
}
const cMenuPanel: CSSProperties = {
  ...panel,
  background: colors.bgSolid,
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  width: 'min(300px, calc(100vw - 16px))',
  maxHeight: 'calc(100dvh - 72px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: 6,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
  zIndex: 3,
}
const cMenuItem: CSSProperties = { ...buttonBase, minHeight: TOUCH, padding: '0 8px', fontSize: 13, textAlign: 'center', whiteSpace: 'normal', lineHeight: 1.15 }
const cMenuItemActive: CSSProperties = { ...cMenuItem, background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` }
const CAM_W = 40
const cCamera: CSSProperties = {
  position: 'absolute',
  top: COMPACT_BAR_PX + 8,
  right: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  pointerEvents: 'auto',
  zIndex: 25,
  touchAction: 'manipulation',
}
const cCamBtn: CSSProperties = {
  ...panel,
  width: CAM_W,
  height: TOUCH,
  padding: 0,
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
}

const CAMERA_BUTTONS: { id: string; glyph: string; label: string; run: () => void; short?: boolean }[] = [
  { id: 'rot-left', glyph: '↺', label: 'Rotate view left', run: () => cameraNudge.rotate(-30), short: true },
  { id: 'rot-right', glyph: '↻', label: 'Rotate view right', run: () => cameraNudge.rotate(30), short: true },
  { id: 'zoom-in', glyph: '+', label: 'Zoom in', run: () => cameraNudge.zoom(1.3) },
  { id: 'zoom-out', glyph: '−', label: 'Zoom out', run: () => cameraNudge.zoom(1 / 1.3) },
  { id: 'top-down', glyph: '⊞', label: 'Top-down view', run: () => cameraNudge.topDown(), short: true },
]

/** Window height, kept fresh on resize / rotation (compact HUD only; cheap, one listener per mount). */
function useWindowHeight(): number {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return h
}

/** The camera nudge buttons (compact only). Two fingers still do the real camera work; these are the
 *  one-handed alternative. Under 400px tall only rotate + top-down remain (pinch covers zoom). */
function CameraButtons() {
  const short = useWindowHeight() < 400
  return (
    <div style={cCamera} data-testid="camera-buttons">
      {CAMERA_BUTTONS.filter((b) => !short || b.short).map((b) => (
        <button key={b.id} style={cCamBtn} aria-label={b.label} data-testid={`camera-${b.id}`} onClick={b.run}>
          {b.glyph}
        </button>
      ))}
    </div>
  )
}

/** Compact player badge: name + "CP / VP" in two short lines. Tapping opens the VP breakdown and the
 *  army's special pools below the bar. */
function CompactBadge({ id, state, open, onToggle }: { id: PlayerId; state: GameState; open: boolean; onToggle: () => void }) {
  const bundle = useGameStore((s) => s.bundle)
  const p = state.players[id]
  const color = id === 'A' ? colors.playerA : colors.playerB
  const active = state.activePlayer === id
  const scored = state.mission.scored.filter((row) => row.player === id).sort((a, b) => b.round - a.round)
  return (
    <div style={cBadgeWrap}>
      <button
        style={{ ...cBadgeBtn, borderColor: active ? color : colors.border }}
        aria-expanded={open}
        aria-label={`${p.name} (${id}): ${p.cp} CP, ${p.vp} VP`}
        data-testid={`hud-badge-${id}`}
        onClick={onToggle}
      >
        <span style={{ ...cBadgeName, color }}>{p.name}</span>
        <span style={cBadgeNums}>
          <span data-testid={`hud-cp-${id}`}>CP {p.cp}</span> · <span data-testid={`hud-vp-${id}`}>VP {p.vp}</span>
        </span>
      </button>
      {open && (
        <div style={{ ...cPopover, left: id === 'A' ? 0 : -80 }} data-testid={`hud-popover-${id}`}>
          <div style={{ color, fontWeight: 700, fontSize: 13 }}>
            {p.name} ({id})
          </div>
          <MiracleDice dice={(p as { miracle?: { dice?: number[] } }).miracle?.dice} id={id} enabled={hasActsOfFaith(state, id) || hasFatePool(state, id)} fate={hasFatePool(state, id) && !hasActsOfFaith(state, id)} />
          <PainTokens state={state} id={id} />
          <CabalPool state={state} id={id} />
          <div style={{ ...vpBreakdown, width: 'auto', maxHeight: 'none', marginTop: 0 }} data-testid={`hud-vp-breakdown-${id}`}>
            {scored.length === 0 && <div style={mutedText}>No VP scored yet.</div>}
            {scored.map((row, i) => (
              <div key={i} style={vpRow}>
                <span style={mutedText}>R{row.round} {sourceName(state, bundle, row.ruleId)}</span>
                <span>{row.amount >= 0 ? '+' : ''}{row.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompactHud({ state, passAction, thinking, dispatch }: { state: GameState; passAction: Action | null; thinking: boolean; dispatch: (a: Action) => void }) {
  const sheet = useCompactSheets((s) => s.open)
  const toggleSheet = useCompactSheets((s) => s.toggle)
  const closeSheet = useCompactSheets((s) => s.close)
  const pending = useGameStore((s) => s.pending)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const measureOn = useUiStore((s) => s.measureOn)
  const losOn = useUiStore((s) => s.losOn)
  const toggleMeasure = useUiStore((s) => s.toggleMeasure)
  const toggleLos = useUiStore((s) => s.toggleLos)
  const togglePainter = useUiStore((s) => s.togglePainter)
  const focusCamera = useUiStore((s) => s.focusCamera)
  const battlefieldIndex = useUiStore((s) => s.battlefieldIndex)
  const cycleBattlefield = useUiStore((s) => s.cycleBattlefield)
  const [menuOpen, setMenuOpen] = useState(false)
  const [badgeOpen, setBadgeOpen] = useState<PlayerId | null>(null)

  const phaseLabel = PHASES.find((p) => p.id === state.phase)?.label ?? String(state.phase)
  const activeColor = state.activePlayer === 'A' ? colors.playerA : colors.playerB
  const stratPlayer = pending?.player ?? state.activePlayer

  const toggleDrawer = (id: SheetId) => {
    setMenuOpen(false)
    setBadgeOpen(null)
    toggleSheet(id)
  }
  const afterTool = (fn: () => void) => () => {
    fn()
    setMenuOpen(false)
  }
  const focusSelected = () => {
    if (!selectedUnitId) return
    const models = unitModels(state, selectedUnitId)
    if (models.length > 0) focusCamera(modelsAnchor(models))
  }

  const drawerItem = (id: SheetId, label: string, testId: string) => (
    <button key={id} style={sheet === id ? cMenuItemActive : cMenuItem} data-testid={testId} aria-pressed={sheet === id} onClick={() => toggleDrawer(id)}>
      {label}
    </button>
  )

  return (
    <>
      <div style={cBar} data-testid="hud-bar">
        <div style={cBarRow}>
          <CompactBadge id="A" state={state} open={badgeOpen === 'A'} onToggle={() => { setMenuOpen(false); closeSheet(); setBadgeOpen((v) => (v === 'A' ? null : 'A')) }} />
          <CompactBadge id="B" state={state} open={badgeOpen === 'B'} onToggle={() => { setMenuOpen(false); closeSheet(); setBadgeOpen((v) => (v === 'B' ? null : 'B')) }} />
          <div style={cPhaseBox} data-testid="phase-tracker">
            <span data-testid="hud-round" style={{ fontWeight: 700 }}>R{state.round}</span>
            <span data-testid={`phase-chip-${state.phase}`} style={chipActive}>{phaseLabel}</span>
            <span style={{ color: activeColor, fontWeight: 700 }} aria-label={`Active player ${state.activePlayer}${thinking ? ', thinking' : ''}`}>
              {state.activePlayer}{thinking ? '…' : ''}
            </span>
          </div>
          <span style={{ flex: '1 1 0', minWidth: 0 }} />
          <button style={sheet === 'stratagems' ? { ...cBtn, background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` } : cBtn} data-testid="btn-stratagems" aria-pressed={sheet === 'stratagems'} onClick={() => toggleDrawer('stratagems')}>
            Strat
          </button>
          <button style={cBtnPrimary} data-testid="btn-end-phase" disabled={!passAction} onClick={() => passAction && dispatch(passAction)}>
            End phase
          </button>
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button
              style={menuOpen ? { ...cBtn, background: colors.accent, color: colors.accentText, border: `1px solid ${colors.accent}` } : cBtn}
              data-testid="btn-tools-menu"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => { setBadgeOpen(null); closeSheet(); setMenuOpen((v) => !v) }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div style={cMenuPanel} data-testid="tools-menu-panel">
                {drawerItem('mission', 'Mission', 'btn-mission')}
                {drawerItem('log', 'Dice log', 'btn-dice-log')}
                {drawerItem('feed', 'Event feed', 'btn-event-feed')}
                {drawerItem('settings', 'Settings', 'btn-settings')}
                <button style={measureOn ? cMenuItemActive : cMenuItem} data-testid="btn-measure" aria-pressed={measureOn} onClick={afterTool(toggleMeasure)}>
                  Measure
                </button>
                <button style={losOn ? cMenuItemActive : cMenuItem} data-testid="btn-los" aria-pressed={losOn} onClick={afterTool(toggleLos)}>
                  Line of sight
                </button>
                <button style={{ ...cMenuItem, opacity: selectedUnitId ? 1 : 0.5 }} data-testid="btn-focus" disabled={!selectedUnitId} onClick={afterTool(focusSelected)}>
                  Focus unit
                </button>
                <button style={cMenuItem} data-testid="btn-battlefield" onClick={cycleBattlefield}>
                  Ground: {BATTLEFIELDS[battlefieldIndex].name}
                </button>
                <button style={cMenuItem} data-testid="btn-painter" onClick={afterTool(togglePainter)}>
                  Paint army
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {sheet === null && <CameraButtons />}
      <MissionPanel open onClose={closeSheet} />
    </>
  )
}
