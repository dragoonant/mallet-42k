// Dice tray. Renders the roll currently playing in useDiceStore (fed by playRoll(), see
// playRoll.ts) — nothing else in the client touches this store directly. Deliberately
// self-contained (own colour tokens, no import from src/client/ui) since src/client/dice/** is
// this module's whole ownership boundary in a shared working tree.
//
// It used to own a bottom-centre slot of its own, which put it directly behind the decision prompt
// (src/client/ui/DecisionPrompt.tsx, also bottom-centre and deliberately above it) — owner playtest:
// "dice rolls are being done behind the choice box at the bottom of the screen". It now flows inside
// the right-hand rail App.tsx stacks under the Dice Log, so a roll and the choice it leads to are
// never in the same place; the rail owns the placement, this owns the panel.
import { useEffect } from 'react'
import { Die } from './Die'
import { DURATIONS, useDiceStore } from './diceStore'
import type { CSSProperties } from 'react'

// Whole-squad rolls arrive as one window (director.ts groups them), so dice shrink as the count
// grows and a pass-count summary line appears above SUMMARY_THRESHOLD dice.
const SUMMARY_THRESHOLD = 4
const PASS_WORD: Record<string, string> = { hit: 'hit', wound: 'wound', save: 'saved', fnp: 'ignored', hazardous: 'safe' }

const STYLE_ID = 'mallet-dice-tray-style'
function injectKeyframesOnce() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes mallet-dice-tray-in {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `
  document.head.appendChild(style)
}

const wrap: CSSProperties = {
  position: 'relative', // placed by the right rail in App.tsx
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'stretch',
  width: '100%',
}

const colors = {
  bg: 'rgba(14, 15, 22, 0.92)',
  border: 'rgba(255, 255, 255, 0.14)',
  text: '#e8e8f2',
  muted: '#9aa0b8',
  accent: '#f5d95a',
}

const panelStyle: CSSProperties = {
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  color: colors.text,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(6px)',
  padding: '8px 10px 10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  boxSizing: 'border-box',
  animation: 'mallet-dice-tray-in 180ms ease-out',
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'center',
  lineHeight: 1.25,
}

const queueBadge: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: colors.muted,
  border: `1px solid ${colors.border}`,
  borderRadius: 999,
  padding: '1px 8px',
}

const summaryText: CSSProperties = {
  fontSize: 12,
  color: colors.muted,
}

const diceRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 5,
  maxWidth: '100%',
}

export function DiceTray() {
  useEffect(() => {
    injectKeyframesOnce()
  }, [])
  const current = useDiceStore((s) => s.current)
  const queued = useDiceStore((s) => s.queue.length)
  const speed = useDiceStore((s) => s.speed)

  if (!current) return null

  const { request, dice, phase, id } = current
  const { tumbleMs, flipMs } = DURATIONS[speed]
  const n = dice.length
  // Sized for the rail's ~180px of inner width rather than the old full-width bottom slot: four of
  // the largest still fit on one row.
  const size = n > 30 ? 16 : n > 16 ? 20 : n > 8 ? 26 : n > 4 ? 30 : 38
  const hasTarget = request.target !== undefined
  const hasOutcome = dice.some((d) => d.outcome !== 'neutral')
  const collapsed = n > SUMMARY_THRESHOLD && hasOutcome
  const hits = hasOutcome ? dice.filter((d) => d.outcome === 'success').length : null
  const passWord = PASS_WORD[request.purpose] ?? 'success'
  const label = request.label ?? request.purpose

  return (
    <div style={wrap} data-testid="dice-tray">
      <div style={panelStyle} key={id} data-testid="dice-tray-panel">
        <div style={headerRow}>
          <span>
            {label}
            {hasTarget ? ` — ${request.target}+` : ''}
          </span>
          {queued > 0 && <span style={queueBadge}>+{queued} queued</span>}
        </div>
        {collapsed && (
          <div style={summaryText} data-testid="dice-tray-summary">
            {n} dice{hits !== null ? `: ${hits} ${passWord}${hits !== 1 && (passWord === 'hit' || passWord === 'wound') ? 's' : ''}` : ''}
          </div>
        )}
        <div style={diceRow}>
          {dice.map((d, i) => (
            <Die
              key={i}
              result={d}
              phase={phase}
              size={size}
              index={i}
              rollId={id}
              tumbleMs={tumbleMs}
              flipMs={flipMs}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
