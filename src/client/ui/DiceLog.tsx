// Right-side dice log (docs/spec/50-client.md §5). Reads useGameStore's rolling DiceRoll buffer.
import type { CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { colors, mutedText, panel } from './theme'

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 12,
  top: 70,
  bottom: 190,
  width: 210,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'auto',
}
const heading: CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }
const scroll: CSSProperties = { overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: 3, fontSize: 12 }
const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: `1px solid ${colors.border}`, padding: '3px 0' }

export function DiceLog() {
  const diceLog = useGameStore((s) => s.diceLog)
  const recent = diceLog.slice(-60)

  return (
    <div style={wrap} data-testid="dice-log">
      <div style={heading}>Dice Log</div>
      <div style={scroll}>
        {recent.length === 0 && <div style={mutedText}>No rolls yet.</div>}
        {recent.map((roll, i) => (
          <div key={`${roll.id}-${i}`} style={rowStyle} data-testid={`dice-row-${roll.id}`}>
            <span style={mutedText}>{roll.purpose}</span>
            <span>{roll.final.join(', ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
