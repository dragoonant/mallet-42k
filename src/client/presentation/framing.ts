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

/**
 * Where a ground point (x, z) lands on screen for `view`: normalised device coordinates (+-1 is a screen edge) and its depth
 * in front of the lens (negative = behind it). Same lens as the board camera (CAMERA_FOV_DEG), so a pose can be checked
 * for "is this whole footprint in frame" without three.js.
 */
export function groundNdc(view: CameraView, x: number, z: number, aspect: number): { x: number; y: number; depth: number } {
  const fx = view.target[0] - view.position[0]
  const fy = view.target[1] - view.position[1]
  const fz = view.target[2] - view.position[2]
  const fl = Math.hypot(fx, fy, fz) || 1
  const fwd: [number, number, number] = [fx / fl, fy / fl, fz / fl]
  const rl = Math.hypot(fwd[2], fwd[0]) || 1
  const right: [number, number, number] = [-fwd[2] / rl, 0, fwd[0] / rl]
  const up: [number, number, number] = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ]
  const d = [x - view.position[0], -view.position[1], z - view.position[2]] as const
  const depth = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]
  const t = Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180))
  const a = Math.max(0.5, aspect)
  return {
    x: (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / (depth * t * a),
    y: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / (depth * t),
    depth,
  }
}

/** Is the whole disc (centre x, z; radius) on screen, inside `limitX` / `limitY` of the NDC square (the rest is HUD and breathing room)? */
export function discInFrame(view: CameraView, x: number, z: number, radius: number, aspect: number, limitX = 0.85, limitY = 0.72): boolean {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const p = groundNdc(view, x + Math.cos(a) * radius, z + Math.sin(a) * radius, aspect)
    if (p.depth <= 0 || Math.abs(p.x) > limitX || Math.abs(p.y) > limitY) return false
  }
  return true
}
