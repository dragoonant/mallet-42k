// Rolling feed of engine events in plain language (docs/spec/50-client.md §5 "Action log", trimmed
// to a read-only feed — undo/replay are out of scope for a first playable pass).
import type { CSSProperties } from 'react'
import type { GameEvent, GameState } from '@/engine'
import { useGameStore } from '../store/game'
import { mutedText, panel } from './theme'

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 12,
  bottom: 12,
  width: 210,
  height: 170,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'auto',
}
const heading: CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }
const scroll: CSSProperties = { overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: 3, fontSize: 12 }

function unitName(state: GameState, id: string | null | undefined): string {
  if (!id) return ''
  return state.units[id]?.name ?? id
}

function describe(e: GameEvent, state: GameState): string {
  switch (e.type) {
    case 'RoundStarted':
      return `Round ${e.round} begins`
    case 'PhaseStarted':
      return `${e.phase} phase (${e.player})`
    case 'UnitDeployed':
      return `${unitName(state, e.unitId)} ${e.toReserves ? 'held in reserve' : 'deployed'}`
    case 'MoveDeclared':
      return `${unitName(state, e.unitId)} declares a ${e.moveType} move`
    case 'ModelDestroyed':
      return `A model of ${unitName(state, e.unitId)} falls`
    case 'UnitDestroyed':
      return `${unitName(state, e.unitId)} is wiped out`
    case 'BattleShocked':
      return `${unitName(state, e.unitId)} is battle-shocked`
    case 'CpChanged':
      return `${e.player} ${e.delta >= 0 ? 'gains' : 'spends'} ${Math.abs(e.delta)} CP (${e.source})`
    case 'StratagemUsed':
      return `${e.player} uses ${state.stratagems[e.stratagemId]?.name ?? e.stratagemId}`
    case 'GameEnded':
      return `Battle ends — ${e.result.winner === 'draw' ? 'draw' : `${e.result.winner} wins`}`
    default:
      return e.type
  }
}

export function EventFeed() {
  const state = useGameStore((s) => s.state)
  const events = useGameStore((s) => s.events)
  if (!state) return null
  const recent = events.slice(-60)

  return (
    <div style={wrap}>
      <div style={heading}>Events</div>
      <div style={scroll}>
        {recent.length === 0 && <div style={mutedText}>Nothing yet.</div>}
        {recent.map((e, i) => (
          <div key={`${e.seq}-${i}`}>{describe(e, state)}</div>
        ))}
      </div>
    </div>
  )
}
