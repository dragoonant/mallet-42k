// Phase tracker + CP/VP HUD (docs/spec/50-client.md §5). Pure readout except the End phase/Pass
// button, which dispatches whatever `pass` action legalActions() already validated for the current
// decision — this component never builds an Action of its own.
import type { CSSProperties } from 'react'
import type { GameState, Phase, PlayerId } from '@/engine'
import { useGameStore } from '../store/game'
import { buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

const PHASES: { id: Phase; label: string }[] = [
  { id: 'deployment', label: 'Deploy' },
  { id: 'command', label: 'Command' },
  { id: 'movement', label: 'Movement' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'charge', label: 'Charge' },
  { id: 'fight', label: 'Fight' },
]

const topBar: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '8px 16px',
  pointerEvents: 'auto',
}

const chip: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  color: colors.muted,
  border: `1px solid ${colors.border}`,
}

const chipActive: CSSProperties = { ...chip, color: colors.accentText, background: colors.accent, borderColor: colors.accent }

const badge: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 12,
  padding: '8px 14px',
  minWidth: 120,
  fontFamily: fontStack,
  pointerEvents: 'auto',
}

export function Hud() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)

  if (!state) return null
  const passAction = legal?.find((a) => a.type === 'pass') ?? null
  const thinking = !!pending && pending.player === botSeat

  return (
    <>
      <div style={topBar} data-testid="phase-tracker">
        <span data-testid="hud-round" style={{ fontWeight: 700 }}>
          Round {state.round}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {PHASES.map((p) => (
            <span key={p.id} data-testid={`phase-chip-${p.id}`} style={p.id === state.phase ? chipActive : chip}>
              {p.label}
            </span>
          ))}
        </span>
        <span style={mutedText}>
          Active: {state.activePlayer}
          {thinking ? ' — thinking…' : ''}
        </span>
        <button style={buttonPrimary} data-testid="btn-end-phase" disabled={!passAction} onClick={() => passAction && dispatch(passAction)}>
          End phase / Pass
        </button>
      </div>
      <PlayerBadge id="A" state={state} side="left" />
      <PlayerBadge id="B" state={state} side="right" />
    </>
  )
}

function PlayerBadge({ id, state, side }: { id: PlayerId; state: GameState; side: 'left' | 'right' }) {
  const p = state.players[id]
  const color = id === 'A' ? colors.playerA : colors.playerB
  return (
    <div style={{ ...badge, [side]: 12 }}>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>
        {p.name} ({id})
      </div>
      <div style={{ fontSize: 13 }} data-testid={`hud-cp-${id}`}>
        CP {p.cp}
      </div>
      <div style={{ fontSize: 13 }} data-testid={`hud-vp-${id}`}>
        VP {p.vp}
      </div>
    </div>
  )
}
