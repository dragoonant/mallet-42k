// End-of-game modal (docs/spec/50-client.md §5). Reads state.result — the engine sets it once and
// only once the battle actually ends, so this only ever renders on a finished GameState.
import type { CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(4, 4, 8, 0.72)',
  fontFamily: fontStack,
  zIndex: 20,
}
const card: CSSProperties = { ...panel, width: 380, padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }
const heading: CSSProperties = { margin: 0, fontSize: 24 }
const vpRow: CSSProperties = { display: 'flex', justifyContent: 'space-around', fontSize: 15, fontWeight: 600 }

function reasonLabel(reason: string): string {
  if (reason === 'tabled') return 'One army was wiped off the table.'
  if (reason === 'resign') return 'One commander conceded the field.'
  return 'Victory points decided the battle.'
}

export function EndScreen({ onPlayAgain }: { onPlayAgain: () => void }) {
  const state = useGameStore((s) => s.state)
  const result = state?.result
  if (!state || !result) return null

  return (
    <div style={overlay} data-testid="end-screen">
      <div style={card}>
        <h2 style={heading}>{result.winner === 'draw' ? 'Draw' : `Victory: ${state.players[result.winner].name}`}</h2>
        <p style={mutedText}>{reasonLabel(result.reason)}</p>
        <div style={vpRow}>
          <span style={{ color: colors.playerA }} data-testid="end-vp-A">
            A — {result.vp.A} VP
          </span>
          <span style={{ color: colors.playerB }} data-testid="end-vp-B">
            B — {result.vp.B} VP
          </span>
        </div>
        <button style={buttonPrimary} onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </div>
  )
}
