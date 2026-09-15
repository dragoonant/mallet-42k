// Generic fixed-capacity InstancedMesh pool. Every VFX kind (sparks, tracers, rings, flame cones)
// is one of these, created once and reused for the life of the app — spawn() never allocates a
// mesh/geometry/material, only overwrites a slot's plain-data fields, so steady-state play (after
// the pool's one-time warm-up) does no per-effect GC-visible allocation beyond the small data
// object passed in by the caller.
import * as THREE from 'three'

export interface Slot<TData> {
  active: boolean
  /** performance.now()/1000 at spawn. */
  born: number
  /** Seconds this instance stays active. */
  life: number
  data: TData
}

/** Per-instance update callback: given progress t in [0,1) (age/life), write this instance's
 *  transform into `dummy` and its colour into `color`. Called once per active slot per frame. */
export type SlotUpdate<TData> = (data: TData, t: number, dummy: THREE.Object3D, color: THREE.Color) => void

const HIDDEN_SCALE = 0.0001

export class InstancedPool<TData> {
  readonly mesh: THREE.InstancedMesh
  readonly capacity: number
  private readonly slots: Slot<TData>[]
  private cursor = 0
  private readonly dummy = new THREE.Object3D()
  private readonly color = new THREE.Color()

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, private readonly update: SlotUpdate<TData>, emptyData: () => TData) {
    this.capacity = capacity
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    this.mesh.frustumCulled = false
    this.mesh.count = capacity
    this.slots = Array.from({ length: capacity }, () => ({ active: false, born: 0, life: 0, data: emptyData() }))
    for (let i = 0; i < capacity; i++) this.hide(i)
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Claim a slot (reusing an inactive one, or stealing the oldest round-robin) and mutate its
   *  data in place via `fill` — callers pass a small updater instead of a fresh object so no new
   *  data object needs to be allocated for kinds that don't need one. */
  spawnInto(life: number, fill: (data: TData) => void): void {
    let idx = this.slots.findIndex((s) => !s.active)
    if (idx === -1) {
      idx = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
    }
    const slot = this.slots[idx]
    slot.active = true
    slot.born = performance.now() / 1000
    slot.life = Math.max(life, 0.001)
    fill(slot.data)
  }

  private hide(i: number): void {
    this.dummy.position.set(0, -9999, 0)
    this.dummy.rotation.set(0, 0, 0)
    this.dummy.scale.setScalar(HIDDEN_SCALE)
    this.dummy.updateMatrix()
    this.mesh.setMatrixAt(i, this.dummy.matrix)
  }

  tick(now: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i]
      if (!slot.active) continue
      const age = now - slot.born
      if (age >= slot.life) {
        slot.active = false
        this.hide(i)
        continue
      }
      const t = age / slot.life
      this.dummy.position.set(0, 0, 0)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.quaternion.identity()
      this.dummy.scale.setScalar(1)
      this.update(slot.data, t, this.dummy, this.color)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
      this.mesh.setColorAt(i, this.color)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    if (Array.isArray(this.mesh.material)) this.mesh.material.forEach((m) => m.dispose())
    else this.mesh.material.dispose()
  }
}

export function additiveMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
}
