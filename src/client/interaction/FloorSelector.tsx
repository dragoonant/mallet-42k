// "Floor: Ground / 1 / 2" toggle for a staged placement whose anchor lies inside a ruin with upper floors.
// Picking a floor re-heights the staged draft (and sets the floor used by later hover previews / re-clicks).
// PageUp / PageDown step through the same floors. Legality stays the engine's call (canEndAt) — a bad floor shows
// up as the usual "Can't confirm" line.
import { useEffect } from 'react'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { colors } from '../ui/theme'
import { floorHeightsAt, standingY, useFloorStore, withFloor } from './floors'

export function FloorSelector() {
  const state = useGameStore((s) => s.state)
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const selected = useFloorStore((s) => s.height)
  const setHeight = useFloorStore((s) => s.setHeight)

  const heights = state && draft ? floorHeightsAt(state, draft.anchor.x, draft.anchor.z) : [0]
  const current = state && draft ? standingY(state, draft.anchor.x, draft.anchor.z, selected) : 0
  const multi = heights.length > 1

  const choose = (h: number) => {
    const d = useUiStore.getState().draft
    const st = useGameStore.getState().state
    if (!d || !st) return
    setHeight(h)
    setDraft({ ...d, placements: withFloor(st, d.placements, h) })
  }

  useEffect(() => {
    if (!multi) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'PageUp' && e.key !== 'PageDown') return
      const i = heights.indexOf(current)
      const next = heights[Math.min(heights.length - 1, Math.max(0, i + (e.key === 'PageUp' ? 1 : -1)))]
      if (next !== current) { e.preventDefault(); choose(next) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // leaving the staged placement resets the selection to the ground floor
  useEffect(() => () => useFloorStore.getState().setHeight(0), [])

  if (!multi) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }} data-testid="floor-selector">
      <span style={{ opacity: 0.8 }}>Floor:</span>
      {heights.map((h, i) => (
        <button
          key={h}
          type="button"
          data-testid={`floor-${i}`}
          onClick={() => choose(h)}
          title={h === 0 ? 'Ground (PageDown)' : `Ruin floor at ${h}" (PageUp)`}
          style={{
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
            borderRadius: 4,
            border: `1px solid ${colors.text}`,
            background: h === current ? colors.text : 'transparent',
            color: h === current ? '#111' : colors.text,
          }}
        >
          {h === 0 ? 'Ground' : i}
        </button>
      ))}
    </div>
  )
}
