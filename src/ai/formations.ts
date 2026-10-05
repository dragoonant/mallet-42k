// AI formation generators (owner: src/ai). Pure geometry: given model bases, an anchor point and a facing, lay a unit out as a
// ranks-and-files block, phalanx, wedge, arc, staggered checkerboard or screening line instead of the engine's one-row raster.
// Facing convention (matches engine deployFacing): forward = (cos f, sin f) in (x, z); rank 0 is the front rank. Every result is
// checked for 2" coherency (>=2 neighbours at 7+ models) and returns null if the layout is not coherent, so callers just skip it.
import { isCoherent, type Footprint, type ModelBase, type ModelPlacement, type ModelId } from '../engine'

export type FormationShape = 'single' | 'block' | 'phalanx' | 'wedge' | 'arc' | 'checker' | 'line'
export interface FormationModel { id: ModelId; base: ModelBase }
interface Local { u: number; v: number } // u = lateral (left of facing positive), v = forward

const GAP = 0.15 // base-to-base clearance inside a tight formation

function radiusOf(base: ModelBase): number { return Math.max(base.radius, base.radius2 ?? 0) }

// widths[i] = number of models in rank i (front first); each rank is centred behind the previous one. With `hex`, ranks whose
// parity matches the previous rank are shifted half a pitch so files interlock (and ranks may sit closer together)
function rankLayout(widths: number[], pitch: number, rowPitch: number, hex = false): Local[] {
  const out: Local[] = []
  let v = 0
  let prevPhase = 0
  widths.forEach((w, r) => {
    const centred = (w % 2 === 0 ? 0.5 : 0) * pitch // lattice phase of a centred rank
    let off = 0
    if (hex && r > 0) {
      off = (((prevPhase + pitch / 2 - centred) % pitch) + pitch) % pitch
      if (off > pitch / 2) off -= pitch
    }
    prevPhase = (((centred + off) % pitch) + pitch) % pitch
    if (r > 0) v -= rowPitch
    for (let i = 0; i < w; i++) out.push({ u: (i - (w - 1) / 2) * pitch + off, v })
  })
  return out
}

function fillWidths(n: number, cols: number): number[] {
  const w: number[] = []
  for (let left = n; left > 0; left -= cols) w.push(Math.min(cols, left))
  return w
}

export function localLayout(shape: FormationShape, n: number, r: number): Local[] {
  const pitch = 2 * r + GAP
  if (n <= 1) return [{ u: 0, v: 0 }]
  switch (shape) {
    case 'single': return [{ u: 0, v: 0 }]
    case 'block': { // 2-3 ranks deep, columns sized to the model count
      const ranks = n >= 15 ? 3 : 2
      return rankLayout(fillWidths(n, Math.ceil(n / ranks)), pitch, pitch)
    }
    case 'phalanx': return rankLayout(fillWidths(n, Math.ceil(Math.sqrt(n))), pitch, pitch)
    case 'wedge': { // apex 1, then 2, 3, ... hex-packed
      const widths: number[] = []
      for (let left = n, k = 1; left > 0; left -= k, k++) widths.push(Math.min(k, left))
      return rankLayout(widths, pitch, pitch * 0.87, true)
    }
    case 'arc': { // shallow crescent (centre forward), concentric second ring behind for 11+
      const rings = n > 10 ? 2 : 1
      const out: Local[] = []
      const per = fillWidths(n, Math.ceil(n / rings))
      const ringPitch = pitch * 1.02
      const R0 = Math.max(ringPitch * 1.5, ((per[0] - 1) * ringPitch) / 1.4) + (rings - 1) * pitch // ~80 deg of arc
      per.forEach((cnt, ri) => {
        const R = R0 - ri * pitch
        const step = cnt > 1 ? ringPitch / R : 0
        for (let i = 0; i < cnt; i++) {
          const a = (i - (cnt - 1) / 2) * step
          out.push({ u: R * Math.sin(a), v: R * Math.cos(a) - R0 })
        }
      })
      return out
    }
    case 'checker': { // staggered ranks with ~1" gaps between neighbours in a rank, diagonals just clear
      const c = 2 * r + 1.1
      const rowPitch = Math.sqrt(Math.max(0.01, (2 * r + 0.15) ** 2 - (c / 2) ** 2))
      const ranks = n >= 12 ? 3 : 2
      return rankLayout(fillWidths(n, Math.ceil(n / ranks)), c, rowPitch, true)
    }
    case 'line': { // zig-zag screen: tight enough that a 7+ unit keeps two neighbours
      const out: Local[] = []
      for (let i = 0; i < n; i++) out.push({ u: (i - (n - 1) / 2) * (pitch * 0.98), v: i % 2 === 0 ? 0 : -0.35 })
      return out
    }
  }
}

// centre the layout's bounding box on the anchor, rotate by facing, translate; null if not coherent
export function buildFormation(shape: FormationShape, models: FormationModel[], anchor: { x: number; z: number }, facing: number): ModelPlacement[] | null {
  const n = models.length
  if (n === 0) return []
  const r = Math.max(...models.map((m) => radiusOf(m.base)))
  const local = localLayout(shape, n, r)
  const uMid = (Math.max(...local.map((p) => p.u)) + Math.min(...local.map((p) => p.u))) / 2
  const vMid = (Math.max(...local.map((p) => p.v)) + Math.min(...local.map((p) => p.v))) / 2
  const cos = Math.cos(facing), sin = Math.sin(facing)
  const placements: ModelPlacement[] = models.map((m, i) => {
    const u = local[i].u - uMid, v = local[i].v - vMid
    // forward = (cos, sin); left = (-sin, cos)
    return { modelId: m.id, pos: { x: anchor.x + v * cos - u * sin, y: 0, z: anchor.z + v * sin + u * cos }, facing }
  })
  if (n > 1) {
    const feet: Footprint[] = placements.map((p, i) => ({ pos: p.pos, facing, base: models[i].base }))
    if (!isCoherent(feet)) return null
  }
  return placements
}

export type FormationRole = 'melee' | 'ranged' | 'screen' | 'leaderBlock' | 'solo'

// shapes to try per role, most preferred first
export function shapesForRole(role: FormationRole, n: number): FormationShape[] {
  if (n <= 1 || role === 'solo') return ['single']
  switch (role) {
    case 'melee': return ['wedge', 'phalanx', 'checker']
    case 'ranged': return ['block', 'arc', 'checker']
    case 'leaderBlock': return ['phalanx', 'block']
    case 'screen': return n >= 5 ? ['line', 'checker', 'block'] : ['block']
    default: return ['block']
  }
}

// how well a shape suits a role (small additive score term)
export function shapeRoleScore(role: FormationRole, shape: FormationShape): number {
  const table: Record<FormationRole, Partial<Record<FormationShape, number>>> = {
    melee: { wedge: 0.6, phalanx: 0.4, checker: 0.2 },
    ranged: { block: 0.5, arc: 0.6, checker: 0.3 },
    leaderBlock: { phalanx: 0.5, block: 0.3 },
    screen: { line: 0.5, checker: 0.3, block: 0.1 },
    solo: { single: 0 },
  }
  return table[role][shape] ?? 0
}
