// Selected-unit inspector (docs/spec/50-client.md §5 "Unit card"). Selection comes from
// src/client/interaction/UnitsLayer.tsx clicking a Figure; this file only reads state.
import { useEffect, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import { colors, mutedText, panel } from './theme'

const wrap: CSSProperties = { ...panel, position: 'absolute', left: 12, top: 70, width: 220, padding: 14, pointerEvents: 'auto' }
const closeButton: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 8,
  background: 'transparent',
  border: 'none',
  color: colors.muted,
  fontSize: 15,
  cursor: 'pointer',
  padding: 4,
  lineHeight: 1,
}
const sectionTitle: CSSProperties = { ...mutedText, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 2 }
const list: CSSProperties = { margin: 0, paddingLeft: 16, fontSize: 12.5 }
const warn: CSSProperties = { color: '#ffb84f', fontSize: 12, fontWeight: 600, marginTop: 4 }

export function UnitCard() {
  const state = useGameStore((s) => s.state)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const selectUnit = useUiStore((s) => s.selectUnit)
  const phase = state?.phase

  // A card left open from a previous phase (e.g. selected mid-deployment) stayed put forever with no
  // way to dismiss it — clear the selection whenever the phase moves on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => selectUnit(null), [phase])

  if (!state || !selectedUnitId) return null
  const unit = state.units[selectedUnitId]
  if (!unit) return null

  const datasheet = state.datasheets[unit.datasheetId]
  const models = unit.models.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
  const totalWounds = models.reduce((sum, m) => sum + m.woundsRemaining, 0)
  const weaponIds = Array.from(new Set(models.flatMap((m) => m.weapons)))
  const color = unit.player === 'A' ? colors.playerA : colors.playerB

  return (
    <div style={wrap} data-testid="unit-card">
      <button style={closeButton} data-testid="unit-card-close" aria-label="Close" onClick={() => selectUnit(null)}>
        ✕
      </button>
      <div style={{ color, fontWeight: 700 }}>{unit.name}</div>
      <div style={mutedText}>{state.players[unit.player].name}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        {models.length}/{unit.startingStrength} models · {totalWounds} wounds
      </div>
      {unit.battleShocked && <div style={warn}>Battle-shocked</div>}

      {weaponIds.length > 0 && (
        <>
          <div style={sectionTitle}>Weapons</div>
          <ul style={list}>
            {weaponIds.map((wid) => (
              <li key={wid} data-testid={`unit-card-weapon-${wid}`}>
                {state.weapons[wid]?.name ?? wid}
              </li>
            ))}
          </ul>
        </>
      )}

      {datasheet && datasheet.abilities.length > 0 && (
        <>
          <div style={sectionTitle}>Abilities</div>
          <ul style={list}>
            {datasheet.abilities.map((aid) => (
              <li key={aid} data-testid={`unit-card-ability-${aid}`}>
                {state.abilities[aid]?.name ?? aid}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
