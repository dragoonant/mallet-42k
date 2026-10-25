// Pure geometry for placement markers drawn at a model's true base size and shape (round or oval).
//
// Convention (matches engine/geometry.ts computeBaseEdgePoints): `base.radius` is the semi-axis ALONG the
// model's facing and `base.radius2` the semi-axis across it (oval only). A marker is a group at the model's
// position with rotation.y = markerYaw(facing); its local +X is then the facing direction, so an ellipse built
// with semi-axes (rx, rz) in the group's local XZ plane lines up with the engine's footprint.
import { BufferGeometry, Path, Shape, ShapeGeometry } from 'three'
import type { ModelBase } from '@/engine'

export interface SemiAxes {
  /** along the facing direction (inches) */
  rx: number
  /** across the facing direction (inches) */
  rz: number
}

export function isOvalBase(base: ModelBase): boolean {
  return base.shape === 'oval' && base.radius2 !== undefined
}

export function baseSemiAxes(base: ModelBase): SemiAxes {
  return { rx: base.radius, rz: isOvalBase(base) ? (base.radius2 as number) : base.radius }
}

/** Radius of the smallest circle holding the whole base. */
export function boundRadius(base: ModelBase): number {
  const { rx, rz } = baseSemiAxes(base)
  return Math.max(rx, rz)
}

/** three.js rotation.y that turns a marker's local +X onto the engine facing (cos f, sin f in world X/Z). */
export function markerYaw(facing: number | undefined): number {
  return -(facing ?? 0)
}

const GRAB_MIN_IN = 0.85
const GRAB_MIN_TOUCH_IN = 1.25
const GRAB_MARGIN_IN = 0.2

/** Invisible pointer-grab disc radius: never smaller than the base itself (plus a margin), and never smaller than
 *  the old fixed disc (a fingertip is far blurrier than a cursor, so touch gets a bigger floor). */
export function grabRadius(base: ModelBase, touch: boolean): number {
  return Math.max(touch ? GRAB_MIN_TOUCH_IN : GRAB_MIN_IN, boundRadius(base) + GRAB_MARGIN_IN)
}

/** Semi-axes of the ring whose outer edge sits `outset` inches beyond the base edge. */
export function ringOuter(base: ModelBase, outset: number): SemiAxes {
  const { rx, rz } = baseSemiAxes(base)
  return { rx: rx + outset, rz: rz + outset }
}

const cache = new Map<string, BufferGeometry>()

function ellipsePath(P: Shape | Path, rx: number, rz: number): void {
  P.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0)
}

/** Flat (XZ-plane, facing +Y) ellipse ring or, with width 0, filled disc. Semi-axis rx runs along local X.
 *  Geometries are cached by size, so memoising callers and re-renders never allocate per pointer move. */
export function ellipseGeometry(rx: number, rz: number, width: number): BufferGeometry {
  const k = `${rx.toFixed(3)}|${rz.toFixed(3)}|${width.toFixed(3)}`
  const hit = cache.get(k)
  if (hit) return hit
  const shape = new Shape()
  ellipsePath(shape, rx, rz)
  if (width > 0) {
    const hole = new Path()
    ellipsePath(hole, Math.max(0.02, rx - width), Math.max(0.02, rz - width))
    shape.holes.push(hole)
  }
  const g = new ShapeGeometry(shape, 40)
  g.rotateX(-Math.PI / 2) // shape XY -> world XZ, normal up
  if (cache.size > 256) cache.clear()
  cache.set(k, g)
  return g
}
