// Projectile 3D models (rocket, slug, frag grenade, bio borer). Each is requested from
// /assets/vfx/models/<name>.glb under Vite's BASE_URL; until (or unless) it loads, a simple primitive
// stand-in is used, so a missing GLB never breaks a volley. Whatever the source model's size/axis, it is
// normalised to a unit-length object pointing down +Z, centred on the origin; the engine then scales it to
// the family's `length` and aims +Z along the flight direction.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const MODEL_NAMES = ['rocket', 'slug', 'frag_grenade', 'bio_borer'] as const
export type ModelName = (typeof MODEL_NAMES)[number]

export const modelUrl = (name: string): string => `${import.meta.env.BASE_URL}assets/vfx/models/${name}.glb`

interface Template {
  obj: THREE.Object3D
  version: number
  real: boolean
}

const templates = new Map<ModelName, Template>()

function mat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color })
}

/** Primitive stand-ins, each ~1 unit long along +Z. */
function fallbackModel(name: ModelName): THREE.Object3D {
  const g = new THREE.Group()
  const along = (geo: THREE.BufferGeometry, m: THREE.Material, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m)
    mesh.rotation.x = Math.PI / 2 // cylinders/cones are built along +Y; lay them along +Z
    mesh.position.z = z
    g.add(mesh)
    return mesh
  }
  switch (name) {
    case 'rocket':
      along(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), mat(0xb9bec4), -0.1)
      along(new THREE.ConeGeometry(0.11, 0.28, 8), mat(0xc83a2a), 0.35)
      for (let i = 0; i < 3; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.2), mat(0x6a6f76))
        fin.position.z = -0.34
        fin.rotation.z = (i * Math.PI * 2) / 3
        fin.translateY(0.1)
        g.add(fin)
      }
      break
    case 'slug':
      along(new THREE.CylinderGeometry(0.1, 0.1, 0.62, 8), mat(0xd9a93a), -0.1)
      along(new THREE.ConeGeometry(0.1, 0.3, 8), mat(0xf2d27a), 0.36)
      break
    case 'frag_grenade': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat(0x4f5a34))
      body.scale.set(1, 1, 1.2)
      g.add(body)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 8), mat(0x9aa0a6))
      cap.rotation.x = Math.PI / 2
      cap.position.z = 0.5
      g.add(cap)
      break
    }
    case 'bio_borer':
      along(new THREE.ConeGeometry(0.2, 0.9, 7), mat(0x7fe04a), 0.0)
      along(new THREE.SphereGeometry(0.2, 8, 6), mat(0xb4ff7a), -0.4)
      break
  }
  return g
}

/** Models whose nose sits on the negative end of their longest axis (the rocket GLB points down -X),
 *  so after normalise() they need a half-turn to face +Z. */
const NOSE_ON_NEGATIVE_AXIS = new Set(['rocket'])

/** Centre on the origin, scale the longest side to 1, and turn the longest axis to +Z. */
function normalise(src: THREE.Object3D, flip = false): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(src)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z, 1e-6)
  const holder = new THREE.Group()
  const inner = new THREE.Group()
  src.position.sub(centre)
  inner.add(src)
  inner.scale.setScalar(1 / longest)
  if (size.x >= size.y && size.x >= size.z) inner.rotation.y = -Math.PI / 2
  else if (size.y >= size.x && size.y >= size.z) inner.rotation.x = Math.PI / 2
  holder.add(inner)
  if (flip) holder.rotation.y = Math.PI
  return holder
}

function template(name: ModelName): Template {
  let t = templates.get(name)
  if (t) return t
  t = { obj: fallbackModel(name), version: 0, real: false }
  templates.set(name, t)
  const entry = t
  try {
    new GLTFLoader()
      .loadAsync(modelUrl(name))
      .then((gltf) => {
        entry.obj = normalise(gltf.scene, NOSE_ON_NEGATIVE_AXIS.has(name))
        entry.version++
        entry.real = true
      })
      .catch(() => { /* keep the primitive stand-in */ })
  } catch { /* keep the primitive stand-in */ }
  return t
}

export function preloadModels(): void {
  for (const n of MODEL_NAMES) template(n)
}

export function modelSources(): Record<string, 'real' | 'procedural'> {
  return Object.fromEntries([...templates].map(([k, v]) => [k, v.real ? 'real' : 'procedural']))
}

export interface ModelInstance {
  root: THREE.Group
  name: ModelName
  version: number
  inUse: boolean
}

const MODEL_POOL_CAP = 24

/** Pooled model instances. The root group carries position/orientation/scale; its single child is a clone
 *  of the (unit-length, +Z) template, rebuilt only when the real GLB replaces the stand-in. */
export class ModelPool {
  private readonly items: ModelInstance[] = []
  constructor(private readonly parent: THREE.Object3D) {}

  acquire(name: ModelName): ModelInstance | null {
    const t = template(name)
    let inst = this.items.find((i) => !i.inUse && i.name === name)
    if (!inst) {
      if (this.items.length >= MODEL_POOL_CAP) return null
      inst = { root: new THREE.Group(), name, version: -1, inUse: false }
      inst.root.visible = false
      this.parent.add(inst.root)
      this.items.push(inst)
    }
    if (inst.version !== t.version) {
      inst.root.clear()
      inst.root.add(t.obj.clone(true))
      inst.version = t.version
    }
    inst.inUse = true
    inst.root.visible = true
    return inst
  }

  release(inst: ModelInstance): void {
    inst.inUse = false
    inst.root.visible = false
  }

  dispose(): void {
    for (const i of this.items) this.parent.remove(i.root)
    this.items.length = 0
  }
}
