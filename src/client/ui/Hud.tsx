// Phase tracker + CP/VP HUD (docs/spec/50-client.md §5). Pure readout except the End phase/Pass
// button, which dispatches whatever `pass` action legalActions() already validated for the current
// decision — this component never builds an Action of its own.
import { useState, type CSSProperties } from 'react'
import type { GameState, Phase, PlayerId } from '@/engine'
import { useGameStore } from '../store/game'
import { MissionPanel } from './MissionPanel'
import { primaryScoringWindowHint, sourceName } from './labels'
import { buttonBase, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

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

const scoringHintStyle: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 56,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  fontSize: 11,
  color: colors.muted,
  pointerEvents: 'none',
}

const vpButton: CSSProperties = {
  fontFamily: fontStack,
  fontSize: 13,
  color: colors.text,
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'block',
}

const vpBreakdown: CSSProperties = { marginTop: 6, maxHeight: 160, overflowY: 'auto', width: 200, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }
const vpRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 }

export function Hud() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const [missionOpen, setMissionOpen] = useState(false)

  if (!state) return null
  const passAction = legal?.find((a) => a.type === 'pass') ?? null
  const thinking = !!pending && pending.player === botSeat
  const scoringHint = primaryScoringWindowHint(state.mission.data)

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
          {state.activePlayer === state.firstPlayer ? ' (went first)' : ''}
          {thinking ? ' — thinking…' : ''}
        </span>
        <button style={buttonBase} data-testid="btn-mission" onClick={() => setMissionOpen((v) => !v)}>
          Mission
        </button>
        <button style={buttonPrimary} data-testid="btn-end-phase" disabled={!passAction} onClick={() => passAction && dispatch(passAction)}>
          End phase / Pass
        </button>
      </div>
      {scoringHint && !missionOpen && (
        <div style={scoringHintStyle} data-testid="hud-scoring-hint">
          {scoringHint}
        </div>
      )}
      <MissionPanel open={missionOpen} onClose={() => setMissionOpen(false)} />
      <PlayerBadge id="A" state={state} side="left" />
      <PlayerBadge id="B" state={state} side="right" />
    </>
  )
}

function PlayerBadge({ id, state, side }: { id: PlayerId; state: GameState; side: 'left' | 'right' }) {
  const bundle = useGameStore((s) => s.bundle)
  const [open, setOpen] = useState(false)
  const p = state.players[id]
  const color = id === 'A' ? colors.playerA : colors.playerB
  const scored = state.mission.scored.filter((row) => row.player === id).sort((a, b) => b.round - a.round)

  return (
    <div style={{ ...badge, [side]: 12 }}>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>
        {p.name} ({id})
      </div>
      <div style={{ fontSize: 13 }} data-testid={`hud-cp-${id}`}>
        CP {p.cp}
      </div>
      <button style={vpButton} data-testid={`hud-vp-${id}`} onClick={() => setOpen((v) => !v)}>
        VP {p.vp} {scored.length > 0 ? (open ? '▲' : '▼') : ''}
      </button>
      {open && (
        <div style={vpBreakdown} data-testid={`hud-vp-breakdown-${id}`}>
          {scored.length === 0 && <div style={mutedText}>No VP scored yet.</div>}
          {scored.map((row, i) => (
            <div key={i} style={vpRow}>
              <span style={mutedText}>R{row.round} {sourceName(state, bundle, row.ruleId)}</span>
              <span>+{row.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
