// In-game mission briefing (M6 gap: the mission dropdown showed a bare id and the game never
// explained the primary rule or either player's secondary once play started). Toggled from Hud.tsx's
// top bar; pure readout of state.mission + the loaded DataBundle's secondaries.
import type { CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { missionRuleLabel, primaryScoringSummary, secondaryFor } from './labels'
import { colors, mutedText, panel } from './theme'

const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: 56,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 380,
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: 16,
  pointerEvents: 'auto',
}
const closeButton: CSSProperties = { position: 'absolute', top: 8, right: 10, background: 'transparent', border: 'none', color: colors.muted, fontSize: 15, cursor: 'pointer' }
const sectionTitle: CSSProperties = { ...mutedText, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 4 }
const list: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 12.5 }

export function MissionPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useGameStore((s) => s.state)
  const bundle = useGameStore((s) => s.bundle)
  if (!open || !state) return null

  const mission = state.mission.data
  const primary = primaryScoringSummary(mission)
  const secondaryA = secondaryFor(bundle, state, 'A')
  const secondaryB = secondaryFor(bundle, state, 'B')

  return (
    <div style={wrap} data-testid="mission-panel">
      <button style={closeButton} aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{mission.name}</div>
      {mission.text && <p style={{ fontSize: 12.5, marginTop: 6 }}>{mission.text}</p>}

      <div style={sectionTitle}>Primary scoring</div>
      <ul style={list}>
        {primary.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      {state.mission.rules.length > 0 && (
        <>
          <div style={sectionTitle}>Special rule{state.mission.rules.length > 1 ? 's' : ''}</div>
          <ul style={list}>
            {state.mission.rules.map((r) => (
              <li key={r.id}>{missionRuleLabel(r)}</li>
            ))}
          </ul>
        </>
      )}

      <div style={sectionTitle}>Secondaries</div>
      {([
        { player: 'A' as const, secondary: secondaryA },
        { player: 'B' as const, secondary: secondaryB },
      ] as const).map(({ player, secondary }) => (
        <div key={player} style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: player === 'A' ? colors.playerA : colors.playerB }}>
            {state.players[player].name}
            {secondary ? ` — ${secondary.name}` : ''}
          </div>
          {secondary && <div style={{ fontSize: 12 }}>{secondary.text}</div>}
        </div>
      ))}
    </div>
  )
}
