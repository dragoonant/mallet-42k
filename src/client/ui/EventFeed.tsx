// Rolling feed of engine events in plain language (docs/spec/50-client.md §5 "Action log", trimmed
// to a read-only feed — undo/replay are out of scope for a first playable pass). Only the events a
// human actually cares about are shown here; everything else (HitRolled, DecisionRequested, and the
// rest of the engine's internal bookkeeping) is filtered out rather than printed as a raw type name.
// CP/VP lines get their own small pinned "Scoring" list above the general feed — mixed in with combat
// lines they scrolled out of view within seconds of happening (M6 gap).
import type { CSSProperties } from 'react'
import type { DamageApplied, GameEvent, GameState } from '@/engine'
import type { DataBundle } from '@/data/types'
import { useGameStore } from '../store/game'
import { sourceName } from './labels'
import { mutedText, panel } from './theme'

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 12,
  bottom: 12,
  width: 220,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'auto',
}
const heading: CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, flex: '0 0 auto' }
// paddingTop keeps the newest line (rendered first — see column-reverse below) clear of the heading
// above it; without it the top row read as clipped under the label above.
const scroll: CSSProperties = { overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: 4, fontSize: 12, paddingTop: 4 }
const scoringScroll: CSSProperties = { ...scroll, height: 60 }
const eventsScroll: CSSProperties = { ...scroll, height: 150 }

function unitName(state: GameState, id: string | null | undefined): string {
  if (!id) return ''
  return state.units[id]?.name ?? id
}

function playerName(state: GameState, id: string | null | undefined): string {
  if (!id) return 'No one'
  return state.players[id as 'A' | 'B']?.name ?? id
}

function attackerFrom(state: GameState, source: DamageApplied['source']): string {
  if ('attackerUnitId' in source) return ` from ${unitName(state, source.attackerUnitId)}`
  if ('abilityId' in source) return ' from an ability'
  if ('stratagemId' in source) return ' from a stratagem'
  return ''
}

/** null means "not a key event" — filtered out of the feed entirely. */
function describe(e: GameEvent, state: GameState): string | null {
  switch (e.type) {
    case 'RoundStarted':
      return `Round ${e.round} begins`
    case 'PhaseStarted':
      return `${e.phase[0].toUpperCase()}${e.phase.slice(1)} phase — ${playerName(state, e.player)}`
    case 'UnitDeployed':
      return `${unitName(state, e.unitId)} ${e.toReserves ? 'held in reserve' : 'deployed'}`
    case 'ReinforcementsArrived':
      return `${unitName(state, e.unitId)} arrives from reserves`
    case 'MoveDeclared':
      return `${unitName(state, e.unitId)} makes a ${e.moveType} move`
    case 'DamageApplied':
      return `${unitName(state, e.unitId)} takes ${e.amount}${e.mortal ? ' mortal' : ''} damage${attackerFrom(state, e.source)}`
    case 'ModelDestroyed':
      return `A model of ${unitName(state, e.unitId)} falls${e.byUnitId ? ` to ${unitName(state, e.byUnitId)}` : ''}`
    case 'UnitDestroyed':
      return `${unitName(state, e.unitId)} is wiped out${e.byUnitId ? ` by ${unitName(state, e.byUnitId)}` : ''}`
    case 'BattleShocked':
      return `${unitName(state, e.unitId)} is battle-shocked`
    case 'BattleShockRecovered':
      return `${unitName(state, e.unitId)} recovers from battle shock`
    case 'ChargeDeclared':
      return `${unitName(state, e.unitId)} declares a charge against ${e.targetUnitIds.map((id) => unitName(state, id)).join(', ')}`
    case 'ChargeRolled':
      if (e.needed !== null && e.total < e.needed) return `${unitName(state, e.unitId)}'s charge fails (rolled ${e.total}, needed ${e.needed})`
      return `${unitName(state, e.unitId)} charges in (rolled ${e.total})`
    case 'StratagemUsed':
      return `${playerName(state, e.player)} uses ${state.stratagems[e.stratagemId]?.name ?? e.stratagemId}`
    case 'ObjectiveSecured':
      return `${playerName(state, e.by)} secures ${e.objectiveId}`
    case 'GameEnded':
      return `Battle ends — ${e.result.winner === 'draw' ? 'a draw' : `${playerName(state, e.result.winner)} wins`}`
    default:
      return null
  }
}

/** Own-words CP/VP line for the pinned Scoring list — the only place these still show up. */
function describeScoring(e: GameEvent, state: GameState, bundle: DataBundle | null): string | null {
  if (e.type === 'CpChanged') {
    const name = sourceName(state, bundle, e.source)
    return `${playerName(state, e.player)} ${e.delta >= 0 ? 'gains' : 'spends'} ${Math.abs(e.delta)} CP — ${name}`
  }
  if (e.type === 'VpScored') {
    return `${playerName(state, e.player)} +${e.amount} VP — ${sourceName(state, bundle, e.source)}`
  }
  return null
}

/** A described engine event or a client-only note (src/client/store/game.ts's LogNote — e.g. "Re-roll
 *  skipped (setting)"), ordered the same way they'll render: by the real event stream's own seq, with a
 *  note sorted in right after the events that were on the log when it was pushed. */
interface FeedLine { key: string; text: string; muted: boolean; sortKey: number }

export function EventFeed() {
  const state = useGameStore((s) => s.state)
  const events = useGameStore((s) => s.events)
  const notes = useGameStore((s) => s.notes)
  const bundle = useGameStore((s) => s.bundle)
  if (!state) return null

  const scoring = events.map((e) => describeScoring(e, state, bundle)).filter((s): s is string => s !== null).slice(-30)

  const lines: FeedLine[] = []
  for (const e of events) {
    const text = describe(e, state)
    if (text !== null) lines.push({ key: `e:${e.seq}`, text, muted: false, sortKey: e.seq })
  }
  for (const n of notes) lines.push({ key: `n:${n.id}`, text: n.text, muted: true, sortKey: n.afterSeq + 0.5 })
  lines.sort((a, b) => a.sortKey - b.sortKey)
  const described = lines.slice(-40)

  return (
    <div style={wrap}>
      <div>
        <div style={heading}>Scoring</div>
        <div style={scoringScroll} data-testid="scoring-feed">
          {scoring.length === 0 && <div style={mutedText}>Nothing yet.</div>}
          {scoring.map((text, i) => (
            <div key={i}>{text}</div>
          ))}
        </div>
      </div>
      <div>
        <div style={heading}>Events</div>
        <div style={eventsScroll} data-testid="events-feed">
          {described.length === 0 && <div style={mutedText}>Nothing yet.</div>}
          {described.map((line) => (
            <div key={line.key} style={line.muted ? mutedText : undefined} data-testid={line.muted ? 'event-note' : undefined}>
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
