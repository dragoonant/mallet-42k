// Pure layout + landing-spot picking for the battlefield dice style (BoardDice.tsx). No three.js, no store:
// callers pass the obstacles in, so this is unit-testable. 1 unit = 1 inch, y up.
import { pointInPolygon, pointToPolygonEdge } from '@/engine/geometry'

export interface Disc { x: number; z: number; r: number }
export interface Poly { footprint: { x: number; z: number }[]; height: number }
export interface Obstacles { discs: Disc[]; polys: Poly[] }

export const BOARD_HALF_W = 22
export const BOARD_HALF_D = 15
export const BOARD_MARGIN = 1
/** Die edge length at scale 1 (matches throw.ts DIE). */
const DIE_LOCAL = 0.6
const CELL_LOCAL = 1.3

/** Rows run along local z (screen-horizontal once yawed to face the camera); depth runs along local x. */
export function rowLayout(n: number): { rows: number; cols: number } {
  const rows = n <= 3 ? 1 : n <= 12 ? 2 : n <= 27 ? 3 : 4
  return { rows, cols: Math.ceil(n / rows) }
}

/** Slot offsets in the throw's local frame (unscaled units): x = depth (toward camera is -x), z = across. */
export function localSlots(n: number, spacing = 1): [number, number][] {
  const { rows, cols } = rowLayout(n)
  const cell = CELL_LOCAL * spacing
  const out: [number, number][] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols && out.length < n; c++) out.push([(r - (rows - 1) / 2) * cell, (c - (cols - 1) / 2) * cell])
  return out
}

/** World offset of a local slot after yaw about Y and uniform scale. */
export function worldOffset(slot: [number, number], yaw: number, scale: number): { x: number; z: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  return { x: (slot[0] * c + slot[1] * s) * scale, z: (-slot[0] * s + slot[1] * c) * scale }
}

/** Every die's footprint inside the board rect (with margin) and clear of model bases and terrain. */
export function spreadFits(cx: number, cz: number, offsets: { x: number; z: number }[], dieR: number, ob: Obstacles): boolean {
  const lx = BOARD_HALF_W - BOARD_MARGIN - dieR, lz = BOARD_HALF_D - BOARD_MARGIN - dieR
  for (const o of offsets) {
    const x = cx + o.x, z = cz + o.z
    if (Math.abs(x) > lx || Math.abs(z) > lz) return false
    for (const d of ob.discs) if (Math.hypot(x - d.x, z - d.z) < d.r + dieR + 0.2) return false
    for (const p of ob.polys) {
      const pt = { x, z }
      if (pointInPolygon(pt, p.footprint) || pointToPolygonEdge(pt, p.footprint) < dieR + 0.2) return false
    }
  }
  return true
}

export interface SpotResult {
  x: number
  z: number
  /** Surface height the dice land on (terrain top only when nothing clear was found). */
  y: number
  scale: number
  /** Multiplier on slot spacing actually used (1 = normal; lower only as a last resort). */
  spacing: number
  slots: [number, number][]
  fits: boolean
}

/** Pick where to land n dice: the nearest spot to `aim` where the whole spread fits. */
export function pickSpot(rawAim: { x: number; z: number }, n: number, yaw: number, scale: number, ob: Obstacles): SpotResult {
  const aim = { x: Math.max(-BOARD_HALF_W + 3, Math.min(BOARD_HALF_W - 3, rawAim.x)), z: Math.max(-BOARD_HALF_D + 3, Math.min(BOARD_HALF_D - 3, rawAim.z)) }
  const attempts: [number, number][] = [[1, 1], [0.85, 1], [0.7, 0.85], [0.65, 0.7]]
  for (const [spacing, k] of attempts) {
    const sc = Math.max(1, scale * k)
    const slots = localSlots(n, spacing)
    const offs = slots.map((s) => worldOffset(s, yaw, sc))
    const dieR = DIE_LOCAL * sc * 0.75
    for (let r = 0; r <= 34; r += r < 6 ? 1 : 1.5) {
      const steps = r === 0 ? 1 : Math.max(8, Math.round(r * 6))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const x = aim.x + Math.cos(a) * r, z = aim.z + Math.sin(a) * r
        if (spreadFits(x, z, offs, dieR, ob)) return { x, z, y: 0, scale: sc, spacing, slots, fits: true }
      }
    }
  }
  // Nothing fits: land on the aim (pulled inside the board) on top of whatever is there.
  const slots = localSlots(n, 0.65)
  const x = aim.x
  const z = aim.z
  let y = 0
  for (const p of ob.polys) if (pointInPolygon({ x, z }, p.footprint)) y = Math.max(y, p.height)
  return { x, z, y, scale: Math.max(1, scale * 0.7), spacing: 0.65, slots, fits: false }
}
