// Ground dressing for ruins: a canvas dust/rubble-stain decal and seeded scattered rubble chunks.
// Purely presentational — nothing here feeds the rules engine.
import * as THREE from 'three'
import type { FloorData, Polygon, WallData } from '@/data/types'
import type { Bounds } from './ruinFit'

/** Dust decal margin around the footprint bounding box (inches). */
export const DECAL_MARGIN = 2.2
export const RUBBLE_MAX_HEIGHT = 0.38

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function seededRng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lattice(seed: number, x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = lattice(seed, xi, yi), b = lattice(seed, xi + 1, yi)
  const c = lattice(seed, xi, yi + 1), d = lattice(seed, xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(seed: number, x: number, y: number): number {
  let sum = 0, amp = 0.5, f = 1
  for (let i = 0; i < 4; i++) {
    sum += amp * valueNoise(seed + i * 17, x * f, y * f)
    amp *= 0.5
    f *= 2
  }
  return sum
}

const decalCache = new Map<string, THREE.CanvasTexture>()

/** Dust + darker rubble-stain decal for a footprint box of `w` x `d` inches (plus DECAL_MARGIN each
 *  side). Alpha fades to zero at the edges so it blends into whatever ground is below. */
export function ruinDecalTexture(id: string, w: number, d: number): THREE.CanvasTexture {
  const key = `${id}:${w.toFixed(2)}x${d.toFixed(2)}`
  const hit = decalCache.get(key)
  if (hit) return hit
  const W = w + DECAL_MARGIN * 2, D = d + DECAL_MARGIN * 2
  const scale = 12 // px per inch
  const px = Math.min(256, Math.max(32, Math.round(W * scale)))
  const pz = Math.min(256, Math.max(32, Math.round(D * scale)))
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = pz
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(px, pz)
  const seed = Math.floor(seededRng(id)() * 1e9)
  for (let j = 0; j < pz; j++) {
    for (let i = 0; i < px; i++) {
      const wx = ((i + 0.5) / px) * W - W / 2 // inches from centre
      const wz = ((j + 0.5) / pz) * D - D / 2
      // signed distance (inches) to the footprint box: <0 inside
      const qx = Math.abs(wx) - w / 2, qz = Math.abs(wz) - d / 2
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0)
      const n = fbm(seed, wx * 0.45, wz * 0.45)
      const n2 = fbm(seed + 91, wx * 1.3, wz * 1.3)
      // opaque-ish out to the footprint edge, ragged fall-off across the margin
      const edge = 1 - THREE.MathUtils.smoothstep(sd + (n - 0.5) * 1.6, -0.2, DECAL_MARGIN * 0.9)
      // darker rubble stain hugging the footprint
      const stain = (1 - THREE.MathUtils.smoothstep(sd + (n2 - 0.5) * 1.0, -1.5, 0.9)) * (0.55 + 0.45 * n)
      const dust = 0.5 + 0.5 * n
      const r = 150 + 40 * dust - 70 * stain
      const g = 142 + 38 * dust - 68 * stain
      const b = 128 + 34 * dust - 62 * stain
      const k = (j * px + i) * 4
      img.data[k] = r
      img.data[k + 1] = g
      img.data[k + 2] = b
      img.data[k + 3] = Math.round(255 * Math.min(1, edge * (0.5 + 0.35 * stain + 0.25 * dust)))
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  decalCache.set(key, tex)
  return tex
}

export function pointInPolygon(x: number, z: number, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function distToSegment(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const l2 = dx * dx + dz * dz
  const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2)) : 0
  return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz))
}

export interface RubbleChunk { x: number; z: number; sx: number; sy: number; sz: number; rot: number; tone: number }

/** Seeded rubble scatter: keeps clear of wall lines (engine walls + footprint edges, so a base is never
 *  hidden at a doorway) and off upper floors; every chunk is lower than RUBBLE_MAX_HEIGHT. */
export function scatterRubble(
  id: string,
  footprint: Polygon,
  b: Bounds,
  walls: readonly WallData[],
  floors: readonly FloorData[],
): RubbleChunk[] {
  const rng = seededRng(`${id}-rubble`)
  const count = 14 + Math.floor(rng() * 9)
  const out: RubbleChunk[] = []
  const edges: [{ x: number; z: number }, { x: number; z: number }, number][] = []
  for (const w of walls) edges.push([w.a, w.b, (w.thickness ?? 0.25) / 2])
  for (let i = 0; i < footprint.length; i++) edges.push([footprint[i], footprint[(i + 1) % footprint.length], 0.05])
  let guard = 0
  while (out.length < count && guard++ < count * 25) {
    const x = b.minX - 1.8 + rng() * (b.w + 3.6)
    const z = b.minZ - 1.8 + rng() * (b.d + 3.6)
    const size = 0.09 + rng() * rng() * 0.3
    const clear = size * 2 + 0.2
    if (edges.some(([p, q, t]) => distToSegment(x, z, p, q) < t + clear)) continue
    if (floors.some((f) => f.height > 0 && pointInPolygon(x, z, f.polygon))) continue
    // denser near the footprint edge, sparse far out
    const inside = pointInPolygon(x, z, footprint)
    if (inside && rng() > 0.45) continue
    out.push({
      x, z,
      sx: size * (0.8 + rng() * 0.8),
      sy: Math.min(RUBBLE_MAX_HEIGHT / 1.45, size * (0.5 + rng() * 0.6)),
      sz: size * (0.8 + rng() * 0.8),
      rot: rng() * Math.PI * 2,
      tone: rng(),
    })
  }
  return out
}

let rubbleGeo: THREE.BufferGeometry | null = null
/** One shared jagged low-poly chunk, unit-sized, sitting on y = 0. */
export function rubbleGeometry(): THREE.BufferGeometry {
  if (rubbleGeo) return rubbleGeo
  const g = new THREE.IcosahedronGeometry(1, 0)
  const rng = seededRng('rubble-chunk')
  const pos = g.attributes.position
  const seen = new Map<string, THREE.Vector3>()
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let v = seen.get(k)
    if (!v) {
      const j = 0.7 + rng() * 0.55
      v = new THREE.Vector3(pos.getX(i) * j * (1 + (rng() - 0.5) * 0.3), pos.getY(i) * j, pos.getZ(i) * j)
      v.y = Math.max(v.y, -0.15)
      seen.set(k, v)
    }
    pos.setXYZ(i, v.x, v.y + 0.15, v.z)
  }
  g.computeVertexNormals()
  rubbleGeo = g
  return g
}

let rubbleMat: THREE.MeshStandardMaterial | null = null
export function rubbleMaterial(): THREE.MeshStandardMaterial {
  if (!rubbleMat) rubbleMat = new THREE.MeshStandardMaterial({ color: '#9a9a94', roughness: 1, metalness: 0, flatShading: true })
  return rubbleMat
}

// ---- broken rockcrete floor slab -------------------------------------------------------------

/** Inward offset of a polygon by `amount` using edge-normal miters (floors are simple, mostly convex
 *  strips); falls back to the input when the offset would collapse it. */
function offsetPolygon(poly: Polygon, amount: number): Polygon {
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    area += p.x * q.z - q.x * p.z
  }
  const sign = area > 0 ? 1 : -1 // inward normal side
  const out: Polygon = []
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[(i + poly.length - 1) % poly.length], p1 = poly[i], p2 = poly[(i + 1) % poly.length]
    const n = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      return { x: (-dz / l) * sign, z: (dx / l) * sign }
    }
    const n1 = n(p0, p1), n2 = n(p1, p2)
    let mx = n1.x + n2.x, mz = n1.z + n2.z
    const ml = Math.hypot(mx, mz) || 1
    mx /= ml
    mz /= ml
    const cos = Math.max(0.35, mx * n1.x + mz * n1.z)
    out.push({ x: p1.x + (mx * amount) / cos, z: p1.z + (mz * amount) / cos })
  }
  return out
}

const COL_TOP = [0.98, 0.97, 0.95]
const COL_RIM = [0.55, 0.53, 0.5]
const COL_SKIRT_TOP = [0.62, 0.6, 0.57]
const COL_SKIRT_BOT = [0.3, 0.29, 0.28]
const TILE = 8 // inches per texture tile

/** Floor slab built from the footprint polygon unchanged: flat top at local y = 0 (position the mesh at
 *  floor.height), a darker chipped rim band on the top face, and a jagged underside skirt with
 *  vertex colours fading to dark. `thickness` is the average slab depth. */
export function floorSlabGeometry(id: string, polygon: Polygon, thickness: number): THREE.BufferGeometry {
  const rng = seededRng(`${id}-slab`)
  const pos: number[] = [], col: number[] = [], uv: number[] = []
  const push = (x: number, y: number, z: number, c: number[], u: number, v: number) => {
    pos.push(x, y, z)
    col.push(c[0], c[1], c[2])
    uv.push(u, v)
  }
  // Top face: inner polygon (light) + rim ring (dark outer edge fading inward).
  const bandW = Math.min(0.4, Math.min(...(() => {
    const xs = polygon.map((p) => p.x), zs = polygon.map((p) => p.z)
    return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)]
  })()) * 0.2)
  const inner = offsetPolygon(polygon, bandW)
  const tri = THREE.ShapeUtils.triangulateShape(inner.map((p) => new THREE.Vector2(p.x, p.z)), [])
  for (const t of tri) {
    for (const k of [t[0], t[2], t[1]]) push(inner[k].x, 0, inner[k].z, COL_TOP, inner[k].x / TILE, inner[k].z / TILE)
  }
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n], ai = inner[i], bi = inner[(i + 1) % n]
    const tone = 0.85 + rng() * 0.3
    const rim = COL_RIM.map((c) => c * tone)
    for (const [p, c] of [[a, rim], [ai, COL_TOP], [bi, COL_TOP], [a, rim], [bi, COL_TOP], [b, rim]] as [{ x: number; z: number }, number[]][]) {
      push(p.x, 0, p.z, c, p.x / TILE, p.z / TILE)
    }
  }
  // Skirt: each edge cut into ~0.5" segments whose bottom hangs a random, jagged depth.
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const segs = Math.max(1, Math.round(len / 0.5))
    const depth: number[] = []
    for (let s = 0; s <= segs; s++) depth.push(thickness * (0.55 + rng() * 0.9))
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs
      const x0 = a.x + (b.x - a.x) * t0, z0 = a.z + (b.z - a.z) * t0
      const x1 = a.x + (b.x - a.x) * t1, z1 = a.z + (b.z - a.z) * t1
      const u0 = (len * t0) / TILE, u1 = (len * t1) / TILE
      const d0 = depth[s], d1 = depth[s + 1]
      // winding chosen for outward-facing normals when the polygon is counter-clockwise in x/z
      push(x0, 0, z0, COL_SKIRT_TOP, u0, 0); push(x1, 0, z1, COL_SKIRT_TOP, u1, 0); push(x0, -d0, z0, COL_SKIRT_BOT, u0, d0 / TILE)
      push(x1, 0, z1, COL_SKIRT_TOP, u1, 0); push(x1, -d1, z1, COL_SKIRT_BOT, u1, d1 / TILE); push(x0, -d0, z0, COL_SKIRT_BOT, u0, d0 / TILE)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}
