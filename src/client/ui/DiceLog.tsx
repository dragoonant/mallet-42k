// Right-side dice log (docs/spec/50-client.md §5). Reads useGameStore's rolling DiceRoll buffer and
// renders each roll as a short, attributed sentence rather than a bare purpose/number pair.
import { useState, type CSSProperties } from 'react'
import type { DiceRoll } from '@/engine'
import { useGameStore } from '../store/game'
import { useDisplayState, usePresentedStore } from '../presentation/presentedStore'
import { describeRoll } from './labels'
import { colors, mutedText, panel } from './theme'

// Collapsed by default and capped to a handful of rows — expanded, the panel used to cover the
// board's right edge and part of a deployment corner at 1600x900.
const MAX_VISIBLE_ROWS = 6
const ROW_HEIGHT = 22

// Positioned by App.tsx's right-hand rail (which also holds the dice tray directly underneath this
// panel), so the log only sizes itself — a rail block, not an absolutely-placed overlay of its own.
const wrap: CSSProperties = {
  ...panel,
  position: 'relative', // placed by the right rail in App.tsx, which also stacks the dice tray below
  width: '100%',
  boxSizing: 'border-box',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'auto',
}
const heading: CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  userSelect: 'none',
}
const scroll: CSSProperties = {
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column-reverse',
  gap: 3,
  fontSize: 12,
  marginTop: 6,
  maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT,
}
const rowStyle: CSSProperties = { display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${colors.border}`, padding: '3px 0' }

/** "6, 2, 5↻" — the dice of a roll at their final faces; a re-rolled die is marked and its first face is in
 *  the tooltip. A per-die roll shows the target ("· 3+") when the engine published one. */
function DiceFaces({ roll, rerolled }: { roll: DiceRoll; rerolled?: Map<number, { before: number; after: number }> }) {
  const perDie = roll.final.length === roll.dice.length
  return (
    <span style={mutedText} data-testid="dice-faces">
      {roll.final.map((face, i) => {
        const re = rerolled?.get(i)
        // final already includes modifiers; once a die was re-rolled show its new face (net of any modifier)
        const shownFace = re && perDie ? face - roll.dice[i] + re.after : face
        return (
          <span key={i} title={re ? `Re-rolled from ${re.before}` : undefined} style={re ? { color: colors.accent } : undefined}>
            {i > 0 ? ', ' : ''}
            {shownFace}
            {re ? '↻' : ''}
          </span>
        )
      })}
      {typeof roll.needed === 'number' && roll.final.length > 1 ? ` · needs ${roll.needed}+` : ''}
    </span>
  )
}

export function DiceLog() {
  const state = useDisplayState()
  const events = useGameStore((s) => s.events)
  const presentedSeq = usePresentedStore((s) => s.presentedSeq)
  const [collapsed, setCollapsed] = useState(true)
  if (!state) return null
  // diceLog carries no seq, so derive the visible rolls from the DiceRolled events themselves. A DiceRolled
  // event holds the faces as first rolled; DiceRerolled events (by roll id) say which dice changed, so the
  // log can show the final faces and mark the re-rolled ones.
  const shown: DiceRoll[] = []
  const rerolls = new Map<string, Map<number, { before: number; after: number }>>()
  for (const e of events) {
    if (e.seq > presentedSeq) continue
    if (e.type === 'DiceRolled') shown.push(e.roll)
    else if (e.type === 'DiceRerolled') {
      const forRoll = rerolls.get(e.rollId) ?? new Map<number, { before: number; after: number }>()
      ;(e.indexes ?? e.before.map((_, i) => i)).forEach((idx, k) => forRoll.set(idx, { before: e.before[k], after: e.after[k] }))
      rerolls.set(e.rollId, forRoll)
    }
  }
  const recent = shown.slice(-40)

  return (
    <div style={wrap} data-testid="dice-log">
      <div style={heading} onClick={() => setCollapsed((c) => !c)} data-testid="dice-log-toggle">
        <span>Dice Log {recent.length > 0 ? `(${recent.length})` : ''}</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <div style={scroll}>
          {recent.length === 0 && <div style={mutedText}>No rolls yet.</div>}
          {recent.map((roll, i) => (
            <div key={`${roll.id}-${i}`} style={rowStyle} data-testid={`dice-row-${roll.id}`}>
              <span>{describeRoll(roll, state)}</span>
              <DiceFaces roll={roll} rerolled={rerolls.get(roll.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
