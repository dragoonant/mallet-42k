// End-of-game modal (docs/spec/50-client.md §5). Reads state.result — the engine sets it once and
// only once the battle actually ends, so this only ever renders on a finished GameState.
import { useEffect, useState, type CSSProperties } from 'react'
import type { GameState, PlayerId } from '@/engine'
import { useGameStore } from '../store/game'
import { useDisplayState } from '../presentation/presentedStore'
import { secondaryScoringIds } from './labels'
import { buttonBase, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'
import { useFormFactor } from './formFactor'

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(4, 4, 8, 0.72)',
  fontFamily: fontStack,
  zIndex: 20,
  overflowY: 'auto',
  padding: '24px 0',
}
const card: CSSProperties = { ...panel, width: 460, maxWidth: '92vw', padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }
const heading: CSSProperties = { margin: 0, fontSize: 24 }
const vpRow: CSSProperties = { display: 'flex', justifyContent: 'space-around', fontSize: 15, fontWeight: 600 }
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'right' }
const th: CSSProperties = { textAlign: 'right', color: colors.muted, fontWeight: 600, padding: '2px 6px', borderBottom: `1px solid ${colors.border}` }
const thRound: CSSProperties = { ...th, textAlign: 'left' }
const td: CSSProperties = { padding: '2px 6px' }
const tdRound: CSSProperties = { ...td, textAlign: 'left', color: colors.muted }

// Compact (phone landscape, 852x393 / 667x375): the card is a two-column row (result + button | round table),
// the overlay is a flex box with `margin: auto` on the card so a card taller than the screen scrolls from its
// top edge instead of being clipped, and everything keeps inside the safe areas.
const overlayCompact: CSSProperties = {
  ...overlay,
  display: 'flex',
  padding: 'calc(var(--safe-top, 0px) + 8px) calc(var(--safe-right, 0px) + 8px) calc(var(--safe-bottom, 0px) + 8px) calc(var(--safe-left, 0px) + 8px)',
  boxSizing: 'border-box',
}
const cardCompact: CSSProperties = {
  ...panel,
  margin: 'auto',
  width: 'min(720px, 100%)',
  boxSizing: 'border-box',
  padding: 14,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 16,
  textAlign: 'center',
}
const colLeft: CSSProperties = { flex: '0 0 190px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 0 }
const colRight: CSSProperties = { flex: '1 1 0', minWidth: 0 }
const headingCompact: CSSProperties = { margin: 0, fontSize: 19, lineHeight: 1.2 }
const vpRowCompact: CSSProperties = { ...vpRow, flexDirection: 'column', gap: 2, fontSize: 14 }
const tableCompact: CSSProperties = { ...table, fontSize: 11 }
const playAgainCompact: CSSProperties = { ...buttonPrimary, minHeight: 44, width: '100%' }
const FADE_MS = 400
const cinematic: CSSProperties = { position: 'fixed', inset: 0, background: '#000', zIndex: 30, cursor: 'pointer', fontFamily: fontStack }
const cinematicVideo: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
const skipButton: CSSProperties = { ...buttonBase, position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.55)' }
const skipButtonCompact: CSSProperties = {
  ...skipButton,
  top: 'calc(var(--safe-top, 0px) + 12px)',
  right: 'calc(var(--safe-right, 0px) + 12px)',
  minHeight: 44,
  minWidth: 72,
}
const cinematicTitle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: '12%',
  textAlign: 'center',
  fontSize: 'clamp(48px, 11vw, 140px)',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textIndent: '0.18em',
  textShadow: '0 4px 32px rgba(0,0,0,0.85)',
  pointerEvents: 'none',
}

type CinematicPhase = 'video' | 'fading' | 'card'

/** Full-screen win/lose video shown before the score card. Only mounted while the cinematic is live. */
function EndCinematic({ kind, fading, onSkip }: { kind: 'victory' | 'defeat'; fading: boolean; onSkip: () => void }) {
  const [shown, setShown] = useState(false)
  const { compact } = useFormFactor()
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const win = kind === 'victory'
  return (
    <div style={{ ...cinematic, opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`, pointerEvents: fading ? 'none' : 'auto' }} data-testid="end-cinematic" onClick={onSkip}>
      <video
        src={`${import.meta.env.BASE_URL}assets/video/${kind}.mp4`}
        style={{ ...cinematicVideo, opacity: shown ? 1 : 0, transition: 'opacity 1.5s ease' }}
        autoPlay
        muted
        playsInline
        onEnded={onSkip}
        onError={onSkip}
      />
      <div style={{ ...cinematicTitle, color: win ? colors.accent : colors.danger, opacity: shown ? 1 : 0, transition: 'opacity 1.2s ease 1s' }}>{win ? 'VICTORY' : 'DEFEAT'}</div>
      <button
        style={compact ? skipButtonCompact : skipButton}
        onClick={(e) => {
          e.stopPropagation()
          onSkip()
        }}
        data-testid="end-cinematic-skip"
      >
        Skip
      </button>
    </div>
  )
}

function reasonLabel(reason: string): string {
  if (reason === 'tabled') return 'One army was wiped off the table.'
  if (reason === 'resign') return 'One commander conceded the field.'
  return 'Victory points decided the battle.'
}

/** Splits mission.scored rows into a player's primary vs. secondary VP for one round. "Secondary" is
 *  whatever rule id belongs to the player's own chosen secondary — everything else (the mission's
 *  shared primary scoring, or a mission special rule that grants VP under its own id, e.g. Scorched
 *  Earth's "raze-and-ruin") is primary. */
function roundTotals(state: GameState, round: number, player: PlayerId, secondaryIds: Set<string>): { primary: number; secondary: number } {
  let primary = 0
  let secondary = 0
  for (const row of state.mission.scored) {
    if (row.round !== round || row.player !== player) continue
    if (secondaryIds.has(row.ruleId)) secondary += row.amount
    else primary += row.amount
  }
  return { primary, secondary }
}

export function EndScreen({ onPlayAgain }: { onPlayAgain: () => void }) {
  const state = useDisplayState()
  const bundle = useGameStore((s) => s.bundle)
  const result = state?.result
  const opponent = useGameStore((s) => s.opponent)
  const humanSeat = useGameStore((s) => s.humanSeat)
  const botSeat = useGameStore((s) => s.botSeat)
  const { compact } = useFormFactor()
  // One human against the AI and a decisive result -> cinematic; hot-seat, draws and bot-vs-bot skip it.
  const kind: 'victory' | 'defeat' | null =
    result && result.winner !== 'draw' && opponent === 'bot' && botSeat && botSeat !== humanSeat ? (result.winner === humanSeat ? 'victory' : 'defeat') : null
  const [phase, setPhase] = useState<CinematicPhase>('video')
  const live = kind !== null && phase !== 'card'
  useEffect(() => {
    if (!result) setPhase('video') // new game: re-arm for the next ending
  }, [result])
  // The stings (victory-fanfare / defeat-sting) already play from eventSounds on the gameEnded event.
  useEffect(() => {
    if (phase !== 'fading') return
    const id = setTimeout(() => setPhase('card'), FADE_MS)
    return () => clearTimeout(id)
  }, [phase])
  const skip = () => setPhase((p) => (p === 'video' ? 'fading' : p))
  if (!state || !result) return null

  const totalRounds = state.mission.data.rounds ?? 5
  const rounds = Array.from({ length: Math.min(state.round, totalRounds) }, (_, i) => i + 1)
  const roundsLine = result.reason === 'tabled' ? `Tabled in round ${state.round}` : `After ${state.round} round${state.round === 1 ? '' : 's'}`
  const secondaryIdsA = secondaryScoringIds(bundle, state, 'A')
  const secondaryIdsB = secondaryScoringIds(bundle, state, 'B')

  const summary = (
    <>
      <h2 style={compact ? headingCompact : heading}>{result.winner === 'draw' ? 'Draw' : `Victory: ${state.players[result.winner].name}`}</h2>
      <p style={mutedText}>
        {reasonLabel(result.reason)} {roundsLine}.
      </p>
      <div style={compact ? vpRowCompact : vpRow}>
        <span style={{ color: colors.playerA }} data-testid="end-vp-A">
          A — {result.vp.A} VP
        </span>
        <span style={{ color: colors.playerB }} data-testid="end-vp-B">
          B — {result.vp.B} VP
        </span>
      </div>
    </>
  )

  const vpTable = (
    <table style={compact ? tableCompact : table} data-testid="end-vp-table">
      <thead>
        <tr>
          <th style={thRound}>Round</th>
          <th style={th}>A primary</th>
          <th style={th}>A secondary</th>
          <th style={th}>B primary</th>
          <th style={th}>B secondary</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((round) => {
          const a = roundTotals(state, round, 'A', secondaryIdsA)
          const b = roundTotals(state, round, 'B', secondaryIdsB)
          return (
            <tr key={round}>
              <td style={tdRound}>{round}</td>
              <td style={td}>{a.primary}</td>
              <td style={td}>{a.secondary}</td>
              <td style={td}>{b.primary}</td>
              <td style={td}>{b.secondary}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  const playAgain = (
    <button style={compact ? playAgainCompact : buttonPrimary} onClick={onPlayAgain}>
      Play again
    </button>
  )

  return (
    <>
    {kind && live && <EndCinematic kind={kind} fading={phase === 'fading'} onSkip={skip} />}
    {(!kind || phase !== 'video') && <div style={compact ? overlayCompact : overlay} data-testid="end-screen">
      <div style={compact ? cardCompact : card}>
        {compact ? (
          <>
            <div style={colLeft}>
              {summary}
              {playAgain}
            </div>
            <div style={colRight}>{vpTable}</div>
          </>
        ) : (
          <>
            {summary}
            {vpTable}
            {playAgain}
          </>
        )}
      </div>
    </div>}
    </>
  )
}
