// Right-side dice log (docs/spec/50-client.md §5). Reads useGameStore's rolling DiceRoll buffer and
// renders each roll as a short, attributed sentence rather than a bare purpose/number pair.
import { useState, type CSSProperties } from 'react'
import type { DiceRoll, GameState, RollPurpose } from '@/engine'
import { useGameStore } from '../store/game'
import { colors, mutedText, panel } from './theme'

// Collapsed by default and capped to a handful of rows — expanded, the panel used to cover the
// board's right edge and part of a deployment corner at 1600x900.
const MAX_VISIBLE_ROWS = 6
const ROW_HEIGHT = 22

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 12,
  top: 70,
  width: 190,
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

const PURPOSE_LABEL: Record<RollPurpose, string> = {
  hit: 'To hit',
  wound: 'To wound',
  save: 'Save',
  damage: 'Damage',
  attacks: 'Attacks',
  fnp: 'Feel No Pain',
  charge: 'Charge',
  advance: 'Advance',
  battleShock: 'Battle-shock',
  desperateEscape: 'Desperate Escape',
  hazardous: 'Hazardous',
  deadlyDemise: 'Deadly Demise',
  mortal: 'Mortal wounds',
  rollOff: 'Roll-off',
  firstTurn: 'First turn',
  mission: 'Mission',
  ability: 'Ability',
  stratagem: 'Stratagem',
  random: 'Random',
}

function unitName(state: GameState, id: string | null): string {
  if (!id) return ''
  return state.units[id]?.name ?? id
}

function describeRoll(roll: DiceRoll, state: GameState): string {
  const who = unitName(state, roll.unitId) || state.players[roll.player]?.name || roll.player
  const vs = roll.targetUnitId ? ` vs ${unitName(state, roll.targetUnitId)}` : ''
  return `${who}${vs} — ${PURPOSE_LABEL[roll.purpose] ?? roll.purpose}`
}

export function DiceLog() {
  const state = useGameStore((s) => s.state)
  const diceLog = useGameStore((s) => s.diceLog)
  const [collapsed, setCollapsed] = useState(true)
  if (!state) return null
  const recent = diceLog.slice(-40)

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
              <span style={mutedText}>{roll.final.join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
