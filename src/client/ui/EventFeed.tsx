// Rolling feed of engine events in plain language (docs/spec/50-client.md §5 "Action log", trimmed
// to a read-only feed — undo/replay are out of scope for a first playable pass). The summarising lives
// in eventSummary.ts (pure); this file only renders: one grouped line per weapon attack (click to expand
// per-step numbers), lines coloured by acting player, auto-sticking to the newest line.
// CP/VP lines also get their own small pinned "Scoring" list above the general feed.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { GameEvent, GameState } from '@/engine'
import type { DataBundle } from '@/data/types'
import { useGameStore } from '../store/game'
import { useDisplayState, usePresentedStore } from '../presentation/presentedStore'
import { sourceName } from './labels'
import { colors, mutedText, panel } from './theme'
import { summariseEvents } from './eventSummary'

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 12,
  bottom: 12,
  width: 340,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'auto',
}
const heading: CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, flex: '0 0 auto' }
const scroll: CSSProperties = { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, paddingTop: 4 }
const scoringScroll: CSSProperties = { ...scroll, height: 60, flexDirection: 'column-reverse' }
const eventsScroll: CSSProperties = { ...scroll, height: 260 }

const MAX_LINES = 100
const LINE_COLOR = { A: colors.playerA, B: colors.playerB } as const

function playerName(state: GameState, id: string | null | undefined): string {
  if (!id) return 'No one'
  return state.players[id as 'A' | 'B']?.name ?? id
}

/** Own-words CP/VP line for the pinned Scoring list. */
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

export function EventFeed() {
  const state = useDisplayState()
  const allEvents = useGameStore((s) => s.events)
  const allNotes = useGameStore((s) => s.notes)
  const presentedSeq = usePresentedStore((s) => s.presentedSeq)
  const bundle = useGameStore((s) => s.bundle)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const events = allEvents.filter((e) => e.seq <= presentedSeq)
  const notes = allNotes.filter((n) => n.afterSeq <= presentedSeq)

  const lineCount = events.length + notes.length
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lineCount, presentedSeq, open])
  if (!state) return null

  const scoring = events.map((e) => describeScoring(e, state, bundle)).filter((s): s is string => s !== null).slice(-30)

  const merged = [
    ...summariseEvents(events, state, bundle).map((l) => ({ ...l, muted: false })),
    ...notes.map((n) => ({ key: `n:${n.id}`, text: n.text, detail: undefined as string[] | undefined, player: null, kind: 'event' as const, sortKey: n.afterSeq + 0.5, muted: true })),
  ].sort((a, b) => a.sortKey - b.sortKey)
  const described = merged.slice(-MAX_LINES)

  const toggle = (key: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
        <div
          style={eventsScroll}
          ref={scrollRef}
          data-testid="events-feed"
          onScroll={(ev) => {
            const el = ev.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
        >
          {described.length === 0 && <div style={mutedText}>Nothing yet.</div>}
          {described.map((line) => {
            const expandable = !!line.detail?.length
            const style: CSSProperties = line.muted
              ? mutedText
              : {
                  color: line.player ? LINE_COLOR[line.player] : undefined,
                  fontWeight: line.kind === 'header' ? 700 : undefined,
                  borderTop: line.kind === 'header' ? `1px solid ${colors.border}` : undefined,
                  cursor: expandable ? 'pointer' : undefined,
                }
            return (
              <div
                key={line.key}
                style={style}
                data-testid={line.muted ? 'event-note' : line.kind === 'attack' ? 'event-attack' : undefined}
                onClick={expandable ? () => toggle(line.key) : undefined}
              >
                {line.text}
                {expandable && open.has(line.key) && line.detail?.map((d, i) => (
                  <div key={i} style={{ ...mutedText, fontSize: 11, paddingLeft: 8 }}>{d}</div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
