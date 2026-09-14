// Collapsible "every stratagem you own" list (M6 gap: players had no way to see what they could use,
// and once-per-phase/CP-locked stratagems were silently left off the in-decision offer with no
// explanation). Self-contained overlay — App.tsx just renders it, no store wiring needed elsewhere.
import { useState, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { stratagemEligibility, stratagemTimingLabel, stratagemsFor } from './stratagemInfo'
import { buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

const tabWrap: CSSProperties = { position: 'absolute', left: 12, bottom: 12, pointerEvents: 'auto' }
const panelStyle: CSSProperties = { ...panel, width: 320, maxHeight: '55vh', display: 'flex', flexDirection: 'column', padding: 12 }
const headerRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }
const list: CSSProperties = { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }
const card: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 10px' }
const cardDisabled: CSSProperties = { ...card, opacity: 0.5 }
const nameRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }
const closeButton: CSSProperties = { background: 'transparent', border: 'none', color: colors.muted, fontSize: 15, cursor: 'pointer', padding: 2, lineHeight: 1 }

export function StratagemPanel() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const [open, setOpen] = useState(false)

  if (!state) return null
  const player = pending?.player ?? state.activePlayer
  const stratagems = stratagemsFor(state, player)

  return (
    <div style={tabWrap}>
      {!open && (
        <button style={buttonPrimary} data-testid="btn-stratagems" onClick={() => setOpen(true)}>
          Stratagems ({state.players[player].cp} CP)
        </button>
      )}
      {open && (
        <div style={panelStyle} data-testid="stratagem-panel">
          <div style={headerRow}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {state.players[player].name}'s stratagems — {state.players[player].cp} CP
            </div>
            <button style={closeButton} aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div style={list}>
            {stratagems.map((s) => {
              const elig = stratagemEligibility(state, player, s.id)
              return (
                <div key={s.id} style={elig.ok ? card : cardDisabled} data-testid={`stratagem-${s.id}`}>
                  <div style={nameRow}>
                    <span>{s.name}</span>
                    <span>{s.cost} CP</span>
                  </div>
                  <div style={{ ...mutedText, fontFamily: fontStack, marginTop: 2 }}>{stratagemTimingLabel(s)}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{s.text}</div>
                  {!elig.ok && <div style={{ color: colors.danger, fontSize: 11, marginTop: 4, fontWeight: 600 }}>{elig.reason}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
