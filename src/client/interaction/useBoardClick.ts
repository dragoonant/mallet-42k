// Turns Board's down/move/up pointer stream into a plain "click" callback, so a left-drag that
// orbits the camera (OrbitControls reads the same canvas pointer events) doesn't also drop a unit —
// only a down→up pair that barely moved counts as a click.
import { useCallback, useRef } from 'react'

const CLICK_MAX_DRAG_IN = 0.4

export function useBoardClick(onClick: (point: { x: number; z: number }) => void) {
  const down = useRef<{ x: number; z: number } | null>(null)

  return useCallback(
    (point: { x: number; z: number }, kind: 'move' | 'down' | 'up') => {
      if (kind === 'down') {
        down.current = point
        return
      }
      if (kind === 'up') {
        const start = down.current
        down.current = null
        if (!start) return
        if (Math.hypot(point.x - start.x, point.z - start.z) <= CLICK_MAX_DRAG_IN) onClick(point)
      }
    },
    [onClick],
  )
}
