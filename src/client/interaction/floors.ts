// Ruin floor selection for placement/moves. The chosen floor height (0 = ground) is client-only state; every
// placement the client builds gets its y from it (per model: only models whose centre lies inside a floor
// polygon of that height stand on it, the rest stay on the ground). The engine (canEndAt) stays the authority
// on whether a floor placement is legal — a rejection surfaces like any other rejected move.
import { create } from 'zustand'
import type { GameState, ModelPlacement } from '@/engine'

interface FloorStore {
  /** Selected standing height in inches; 0 = ground floor. */
  height: number
  setHeight: (h: number) => void
  /** Last move/deploy destination seen for a decision (hover preview or staged draft), so the picker stays
   *  reachable after the pointer leaves the board to click it. */
  anchor: { decisionId: string; x: number; z: number } | null
  setAnchor: (a: { decisionId: string; x: number; z: number } | null) => void
}

export const useFloorStore = create<FloorStore>((set) => ({
  height: 0,
  setHeight: (height) => set({ height }),
  anchor: null,
  setAnchor: (anchor) => set({ anchor }),
}))

function inPoly(x: number, z: number, poly: { x: number; z: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** Distinct standing heights offered at (x, z): ground (0) plus every ruin upper floor whose polygon contains it. */
export function floorHeightsAt(state: GameState, x: number, z: number): number[] {
  const hs = new Set<number>([0])
  for (const p of Object.values(state.board.pieces)) {
    if (p.kind !== 'ruin') continue
    for (const f of p.floors) if (f.height > 0 && inPoly(x, z, f.polygon)) hs.add(f.height)
  }
  return [...hs].sort((a, b) => a - b)
}

/** y a model centred at (x, z) stands at when `height` is the selected floor: that floor's height if it has one there, else 0. */
export function standingY(state: GameState, x: number, z: number, height: number): number {
  return height > 0 && floorHeightsAt(state, x, z).includes(height) ? height : 0
}

/** Re-height placements to the given floor (defaults to the currently selected one). */
export function withFloor<T extends ModelPlacement>(state: GameState, placements: T[], height: number = useFloorStore.getState().height): T[] {
  return placements.map((p) => {
    const y = standingY(state, p.pos.x, p.pos.z, height)
    return y === p.pos.y ? p : { ...p, pos: { ...p.pos, y } }
  })
}

/** y for one model dragged to (x, z): keeps its current floor if the spot is still on that floor's polygon,
 *  else the selected floor if one exists there, else the ground. */
export function nudgeY(state: GameState, x: number, z: number, currentY: number, height: number = useFloorStore.getState().height): number {
  if (currentY > 0 && floorHeightsAt(state, x, z).includes(currentY)) return currentY
  return standingY(state, x, z, height)
}

/** Camera position (set by PlacementOverlay) so a nudge drag, whose pointer stream hits the ground mat at y = 0, can be
 *  lifted onto the plane a model on a ruin floor stands in — otherwise the model runs ahead of the cursor. */
export const cameraRef: { current: { x: number; y: number; z: number } | null } = { current: null }

/** Where the pointer ray through ground point (x, z) meets the horizontal plane at height y. */
export function liftToPlane(x: number, z: number, y: number): { x: number; z: number } {
  const c = cameraRef.current
  if (!c || y <= 0 || c.y <= y) return { x, z }
  const k = (c.y - y) / c.y
  return { x: c.x + (x - c.x) * k, z: c.z + (z - c.z) * k }
}
