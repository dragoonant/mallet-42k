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
  const pending = useGameStore((s) => s.pending)
  const draft = useUiStore((s) => s.draft)
  const preview = useUiStore((s) => s.movePreview)
  const setDraft = useUiStore((s) => s.setDraft)
  const selected = useFloorStore((s) => s.height)
  const setHeight = useFloorStore((s) => s.setHeight)
  const stored = useFloorStore((s) => s.anchor)

  // Destination = staged draft, else the live hover preview, else the last one seen (the pointer leaves the board
  // to click the picker, which clears the preview).
  const pid = pending?.id ?? null
  const live = pid && draft?.decisionId === pid ? draft.anchor : pid && preview?.decisionId === pid ? preview.anchor : null
  useEffect(() => {
    if (pid && live) useFloorStore.getState().setAnchor({ decisionId: pid, x: live.x, z: live.z })
  }, [pid, live?.x, live?.z])
  const anchor = live ?? (pid && stored?.decisionId === pid ? stored : null)

  const heights = state && anchor ? floorHeightsAt(state, anchor.x, anchor.z) : [0]
  const current = state && anchor ? standingY(state, anchor.x, anchor.z, selected) : 0
  const multi = heights.length > 1

  const choose = (h: number) => {
    const st = useGameStore.getState().state
    if (!st) return
    setHeight(h)
    const ui = useUiStore.getState()
    if (ui.draft) setDraft({ ...ui.draft, placements: withFloor(st, ui.draft.placements, h) })
    else if (ui.movePreview) ui.setMovePreview({ ...ui.movePreview, placements: withFloor(st, ui.movePreview.placements, h) })
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

  // moving on to another decision resets the selection to the ground floor
  useEffect(
    () => () => {
      useFloorStore.getState().setHeight(0)
      useFloorStore.getState().setAnchor(null)
    },
    [pid],
  )

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
