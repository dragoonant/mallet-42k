// Shared (module-level cached) geometries and materials for figure parts. Drop-in replacements for
// the <xGeometry args=.../> / <meshStandardMaterial .../> JSX children: identical params return the
// same three object, so hundreds of figures share a handful of GPU buffers/programs. Cached objects
// are never disposed (dispose={null}) — they outlive any single figure. Anything that needs to mutate
// a material per figure (death fade) must clone it first (see useMaterialFader in anim.ts).
import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type BufferGeometry } from 'three'

type Args = readonly number[]
const geoCache = new Map<string, BufferGeometry>()

function cachedGeo(kind: string, args: Args, make: () => BufferGeometry): BufferGeometry {
  const key = kind + ':' + args.join(',')
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}

type A = { args: Args }
export function GBox({ args }: A) {
  return <primitive object={cachedGeo('box', args, () => new BoxGeometry(...(args as [number, number, number])))} attach="geometry" dispose={null} />
}
export function GCapsule({ args }: A) {
  return <primitive object={cachedGeo('capsule', args, () => new CapsuleGeometry(...(args as [number, number, number, number])))} attach="geometry" dispose={null} />
}
export function GCone({ args }: A) {
  return <primitive object={cachedGeo('cone', args, () => new ConeGeometry(...(args as [number, number, number])))} attach="geometry" dispose={null} />
}
export function GCylinder({ args }: A) {
  return <primitive object={cachedGeo('cyl', args, () => new CylinderGeometry(...(args as [number, number, number, number])))} attach="geometry" dispose={null} />
}
export function GSphere({ args }: A) {
  return <primitive object={cachedGeo('sphere', args, () => new SphereGeometry(...(args as [number, number, number])))} attach="geometry" dispose={null} />
}

const matCache = new Map<string, MeshStandardMaterial>()

export function sharedStdMaterial(p: { color: string; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number }): MeshStandardMaterial {
  const key = [p.color, p.roughness, p.metalness, p.emissive, p.emissiveIntensity].join('|')
  let m = matCache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color: p.color, roughness: p.roughness ?? 1, metalness: p.metalness ?? 0, emissive: p.emissive, emissiveIntensity: p.emissiveIntensity })
    matCache.set(key, m)
  }
  return m
}

export function StdMat(p: { color: string; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number }) {
  return <primitive object={sharedStdMaterial(p)} attach="material" dispose={null} />
}
