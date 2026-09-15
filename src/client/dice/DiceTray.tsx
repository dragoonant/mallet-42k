// Bottom-centre dice tray. Renders the roll currently playing in useDiceStore (fed by playRoll(),
// see playRoll.ts) — nothing else in the client touches this store directly. Deliberately
// self-contained (own colour tokens, no import from src/client/ui) since src/client/dice/** is
// this module's whole ownership boundary in a shared working tree.
import { useEffect } from 'react'
import { Die } from './Die'
import { DURATIONS, useDiceStore } from './diceStore'
import type { CSSProperties } from 'react'

// Above this many dice (e.g. a 20-shot Ork boyz volley) the tray collapses to a compact summary
// line and shrinks the dice themselves, rather than spilling a wall of cubes across the screen.
const COLLAPSE_THRESHOLD = 8

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
  position: 'absolute',
  left: '50%',
  bottom: 16,
  transform: 'translateX(-50%)',
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  zIndex: 20,
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
  padding: '10px 14px 12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  maxWidth: 'min(90vw, 640px)',
  animation: 'mallet-dice-tray-in 180ms ease-out',
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  fontSize: 13,
  fontWeight: 700,
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
  gap: 6,
  maxWidth: 600,
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
  const collapsed = dice.length > COLLAPSE_THRESHOLD
  const size = collapsed ? 16 : dice.length > 4 ? 34 : 46
  const hasTarget = request.target !== undefined
  const hits = hasTarget ? dice.filter((d) => d.outcome === 'success').length : null
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
            {dice.length} dice{hits !== null ? `: ${hits} hit${hits === 1 ? '' : 's'}` : ''}
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
