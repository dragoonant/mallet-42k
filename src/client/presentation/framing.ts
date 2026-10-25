// Camera framing maths shared by the cinematic shooting camera (shotCamera.ts) and the deployment visits
// (deployCamera.ts). Pure: no three.js, no stores. Units are inches, y up.
//
// A "cluster" is a unit seen as one blob: the centre of its models and how far its bases reach from it. Views are
// built to respect the orbit rig's limits (minimum distance, steepest tilt, target on the ground), so the rig never
// has to correct a pose the director flew to.
import type { CameraView } from '../board/cameraApi'
import { MIN_CAMERA_DISTANCE } from '../board/cameraPresets'

/** A model as the camera sees it: where it stands and how far its base reaches. */
export interface Pt {
  x: number
  y: number
  z: number
  radius: number
}

export interface Cluster {
  x: number
  /** the highest surface any of its models stands on (a ruin floor lifts the lens with it) */
  y: number
  z: number
  /** how far the unit spreads from its centre, base edges included */
  radius: number
}

/** Vertical field of view of the board camera (Scene.tsx). */
export const CAMERA_FOV_DEG = 42
/** Steepest side-on tilt the orbit rig allows (CameraRig.tsx MAX_POLAR is PI / 2.05), kept a hair inside it. */
export const MAX_POLAR = Math.PI / 2.05 - 0.02
/** The lens never sits closer to the mat than this (inches). */
export const MIN_LENS_HEIGHT = 0.8

export function clusterOf(pts: readonly Pt[]): Cluster | null {
  if (pts.length === 0) return null
  let x = 0
  let z = 0
  let y = -Infinity
  for (const p of pts) {
    x += p.x
    z += p.z
    y = Math.max(y, p.y)
  }
  x /= pts.length
  z /= pts.length
  let radius = 0
  for (const p of pts) radius = Math.max(radius, Math.hypot(p.x - x, p.z - z) + p.radius)
  return { x, y: Math.max(0, y), z, radius }
}

/** Unit vector in the ground plane from (ax, az) to (bx, bz); +z when they coincide. */
export function unit2(ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax
  const dz = bz - az
  const l = Math.hypot(dx, dz)
  return l < 1e-6 ? [0, 1] : [dx / l, dz / l]
}

/** How far a camera must be from a flat blob of `radius` for it to fill most of the narrower screen dimension. */
export function fitDistance(radius: number, aspect: number): number {
  const half = Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180))
  const reach = half * Math.max(0.5, Math.min(aspect, 2.2))
  return (radius * 1.15) / reach
}

/**
 * Nudges a view inside the rig's limits: at least MIN_CAMERA_DISTANCE from its target, not flatter than MAX_POLAR,
 * not under the mat. The orbit target is put on the ground, where the rig keeps it.
 */
export function withinLimits(view: CameraView): CameraView {
  const [tx, , tz] = view.target
  let ox = view.position[0] - tx
  let oy = Math.max(MIN_LENS_HEIGHT, view.position[1])
  let oz = view.position[2] - tz
  const flat = Math.hypot(ox, oz)
  if (flat > 1e-6 && oy < flat / Math.tan(MAX_POLAR)) oy = flat / Math.tan(MAX_POLAR)
  const len = Math.hypot(ox, oy, oz)
  const min = MIN_CAMERA_DISTANCE + 0.25
  if (len < min) {
    const k = min / Math.max(len, 1e-6)
    ox *= k
    oy *= k
    oz *= k
    if (len < 1e-6) oy = min
  }
  return { position: [tx + ox, oy, tz + oz], target: [tx, 0, tz] }
}

/** A square-ish board-space footprint test point: is (x, z) inside the polygon? (Even-odd rule, same as the engine's.) */
export function insidePolygon(x: number, z: number, poly: readonly { x: number; z: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}
