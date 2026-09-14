// End-of-game modal (docs/spec/50-client.md §5). Reads state.result — the engine sets it once and
// only once the battle actually ends, so this only ever renders on a finished GameState.
import type { CSSProperties } from 'react'
import type { GameState, PlayerId } from '@/engine'
import { useGameStore } from '../store/game'
import { secondaryScoringIds } from './labels'
import { buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

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
  const state = useGameStore((s) => s.state)
  const bundle = useGameStore((s) => s.bundle)
  const result = state?.result
  if (!state || !result) return null

  const totalRounds = state.mission.data.rounds ?? 5
  const rounds = Array.from({ length: Math.min(state.round, totalRounds) }, (_, i) => i + 1)
  const roundsLine = result.reason === 'tabled' ? `Tabled in round ${state.round}` : `After ${state.round} round${state.round === 1 ? '' : 's'}`
  const secondaryIdsA = secondaryScoringIds(bundle, state, 'A')
  const secondaryIdsB = secondaryScoringIds(bundle, state, 'B')

  return (
    <div style={overlay} data-testid="end-screen">
      <div style={card}>
        <h2 style={heading}>{result.winner === 'draw' ? 'Draw' : `Victory: ${state.players[result.winner].name}`}</h2>
        <p style={mutedText}>
          {reasonLabel(result.reason)} {roundsLine}.
        </p>
        <div style={vpRow}>
          <span style={{ color: colors.playerA }} data-testid="end-vp-A">
            A — {result.vp.A} VP
          </span>
          <span style={{ color: colors.playerB }} data-testid="end-vp-B">
            B — {result.vp.B} VP
          </span>
        </div>

        <table style={table} data-testid="end-vp-table">
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

        <button style={buttonPrimary} onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </div>
  )
}
