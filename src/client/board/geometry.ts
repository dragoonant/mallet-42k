// Client-only geometry helpers for turning board-space (x, z, inches) data into three.js meshes.
// Not part of the rules engine — purely presentational.
import * as THREE from 'three'
import type { Polygon, Vec2 } from '@/data/types'

/**
 * Build an extruded mesh geometry for a board-space polygon (x, z inches), extruded upward
 * (world +Y) by `thickness` starting at y = 0 in local space. Position the mesh's `y` to place
 * the extrusion's base at the desired height.
 */
export function extrudedPolygonGeometry(polygon: Polygon, thickness: number): THREE.BufferGeometry {
  // Shape coordinates use (x, -z) so that, after rotateX(-90deg), world Z comes back out as +z.
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, -p.z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(thickness, 0.001), bevelEnabled: false, steps: 1 })
  geo.rotateX(-Math.PI / 2)
  geo.computeVertexNormals()
  return geo
}

export function polygonCentroid(polygon: Polygon): Vec2 {
  let x = 0
  let z = 0
  for (const p of polygon) {
    x += p.x
    z += p.z
  }
  return { x: x / polygon.length, z: z / polygon.length }
}

export function polygonBoundingRadius(polygon: Polygon, center: Vec2): number {
  let r = 0
  for (const p of polygon) {
    const d = Math.hypot(p.x - center.x, p.z - center.z)
    if (d > r) r = d
  }
  return r
}

/** Deterministic pseudo-random in [0, 1) from a string seed — stable across re-renders, no Math.random. */
export function seededUnit(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0
  return (h % 10_000) / 10_000
}

export interface SegmentTransform {
  mid: Vec2
  length: number
  rotationY: number
}

export function segmentTransform(a: Vec2, b: Vec2): SegmentTransform {
  const dx = b.x - a.x
  const dz = b.z - a.z
  return {
    mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
    length: Math.hypot(dx, dz),
    rotationY: Math.atan2(-dz, dx),
  }
}

/** Convert a Board-relative pointer/raycast hit point to board inches (x, z). */
export function boardPointFromWorld(point: { x: number; z: number }): { x: number; z: number } {
  return { x: point.x, z: point.z }
}
