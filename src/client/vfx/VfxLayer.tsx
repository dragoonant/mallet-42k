// Pooled R3F combat effects (src/client/vfx/** — owned end-to-end by this module). Renders
// <VfxLayer/> once anywhere under the game's <Canvas> and drive it from anywhere else in the
// client via the imperative `vfx` object exported below — e.g. from event-log effects wiring:
//   vfx.shoot({x,y,z}, {x,y,z}, 'bolter')
// Every effect is additive-blended, geometry/material is created once per pool (5 pools total,
// each a single fixed-capacity InstancedMesh — see pool.ts), and no effect runs longer than 0.8s.
// This file never imports from src/engine or from any other src/client/** module beyond three/R3F,
// so it can be dropped into the scene by another agent's Scene.tsx without any coupling back here.
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { InstancedPool, additiveMaterial } from './pool'
import { DEBRIS_COLOR, DUST_COLOR, IMPACT_COLOR, IMPACT_FLASH_COLOR, MORTAL_COLOR, MORTAL_FLASH_COLOR, SAVE_COLOR, TRACER_THICKNESS, TRACER_TRAVEL_S, factionColor, shotPalette } from './palette'
import type { FactionLike, ShotKind, Vec3Like, VfxApi } from './types'

// ---------- per-pool instance data (plain numeric fields, mutated in place by spawnInto) ----------

interface SparkData {
  x: number; y: number; z: number
  dx: number; dy: number; dz: number // total drift over the instance's full life
  arcHeight: number // extra upward hop, parabolic
  size0: number; size1: number
  r: number; g: number; b: number
}

interface DiscData {
  x: number; y: number; z: number
  size0: number; size1: number
  r: number; g: number; b: number
}

interface TracerData {
  fx: number; fy: number; fz: number
  tx: number; ty: number; tz: number
  thickness: number
  r: number; g: number; b: number
}

interface ConeData {
  fx: number; fy: number; fz: number
  tx: number; ty: number; tz: number
  r: number; g: number; b: number
}

const emptySpark = (): SparkData => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, arcHeight: 0, size0: 0, size1: 0, r: 0, g: 0, b: 0 })
const emptyDisc = (): DiscData => ({ x: 0, y: 0, z: 0, size0: 0, size1: 0, r: 0, g: 0, b: 0 })
const emptyTracer = (): TracerData => ({ fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, thickness: 0.05, r: 0, g: 0, b: 0 })
const emptyCone = (): ConeData => ({ fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, r: 0, g: 0, b: 0 })

// Reused across every update call — setFromUnitVectors only reads these, never retains them.
const UNIT_X = new THREE.Vector3(1, 0, 0)
const NEG_Y = new THREE.Vector3(0, -1, 0)
const scratchDir = new THREE.Vector3()

function updateSpark(d: SparkData, t: number, dummy: THREE.Object3D, color: THREE.Color): void {
  const px = d.x + d.dx * t
  const pz = d.z + d.dz * t
  const py = d.y + d.dy * t + d.arcHeight * 4 * t * (1 - t)
  dummy.position.set(px, py, pz)
  const size = d.size0 + (d.size1 - d.size0) * t
  dummy.scale.setScalar(Math.max(size, 0.0001))
  const fade = (1 - t) * (1 - t)
  color.setRGB(d.r * fade, d.g * fade, d.b * fade)
}

/** Flat ground disc (used for both the ring pool and the filled-circle puff pool). */
function updateDisc(d: DiscData, t: number, dummy: THREE.Object3D, color: THREE.Color): void {
  dummy.position.set(d.x, d.y, d.z)
  dummy.rotation.set(-Math.PI / 2, 0, 0)
  const size = d.size0 + (d.size1 - d.size0) * t
  dummy.scale.setScalar(Math.max(size, 0.0001))
  const fade = 1 - t
  color.setRGB(d.r * fade, d.g * fade, d.b * fade)
}

const TRACER_TRAIL_FRAC = 0.28

function updateTracer(d: TracerData, t: number, dummy: THREE.Object3D, color: THREE.Color): void {
  const tailT = Math.max(0, t - TRACER_TRAIL_FRAC)
  const hx = d.fx + (d.tx - d.fx) * t, hy = d.fy + (d.ty - d.fy) * t, hz = d.fz + (d.tz - d.fz) * t
  const lx = d.fx + (d.tx - d.fx) * tailT, ly = d.fy + (d.ty - d.fy) * tailT, lz = d.fz + (d.tz - d.fz) * tailT
  const dx = hx - lx, dy = hy - ly, dz = hz - lz
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  dummy.position.set((hx + lx) / 2, (hy + ly) / 2, (hz + lz) / 2)
  if (len > 1e-4) {
    scratchDir.set(dx, dy, dz).normalize()
    dummy.quaternion.setFromUnitVectors(UNIT_X, scratchDir)
  }
  dummy.scale.set(Math.max(len, 0.001), d.thickness, d.thickness)
  const fadeEnd = t > 0.82 ? Math.max(0, (1 - t) / 0.18) : 1
  color.setRGB(d.r * fadeEnd, d.g * fadeEnd, d.b * fadeEnd)
}

const FLAME_GROW_FRAC = 0.3
const FLAME_HOLD_FRAC = 0.55

function updateCone(d: ConeData, t: number, dummy: THREE.Object3D, color: THREE.Color): void {
  const dx = d.tx - d.fx, dy = d.ty - d.fy, dz = d.tz - d.fz
  const fullLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const grow = Math.min(1, t / FLAME_GROW_FRAC)
  const shrink = t > FLAME_HOLD_FRAC ? Math.max(0, 1 - (t - FLAME_HOLD_FRAC) / (1 - FLAME_HOLD_FRAC)) : 1
  const length = fullLen * grow
  const radius = fullLen * 0.32 * grow
  if (fullLen > 1e-4) scratchDir.set(dx, dy, dz).normalize()
  else scratchDir.set(0, 0, 1)
  dummy.position.set(d.fx, d.fy, d.fz)
  dummy.quaternion.setFromUnitVectors(NEG_Y, scratchDir)
  dummy.scale.set(Math.max(radius, 0.001), Math.max(length, 0.001), Math.max(radius, 0.001))
  color.setRGB(d.r * shrink, d.g * shrink, d.b * shrink)
}

// ---------- pool bundle ----------

interface Pools {
  sparkPool: InstancedPool<SparkData>
  ringPool: InstancedPool<DiscData>
  puffPool: InstancedPool<DiscData>
  tracerPool: InstancedPool<TracerData>
  conePool: InstancedPool<ConeData>
}

function createPools(): Pools {
  return {
    sparkPool: new InstancedPool(new THREE.SphereGeometry(1, 6, 6), additiveMaterial(), 96, updateSpark, emptySpark),
    ringPool: new InstancedPool(new THREE.RingGeometry(0.6, 1, 24), additiveMaterial(), 24, updateDisc, emptyDisc),
    puffPool: new InstancedPool(new THREE.CircleGeometry(1, 16), additiveMaterial(), 24, updateDisc, emptyDisc),
    tracerPool: new InstancedPool(new THREE.BoxGeometry(1, 1, 1), additiveMaterial(), 24, updateTracer, emptyTracer),
    conePool: new InstancedPool(new THREE.ConeGeometry(1, 1, 10).translate(0, -0.5, 0), additiveMaterial(), 8, updateCone, emptyCone),
  }
}

function disposePools(pools: Pools): void {
  pools.sparkPool.dispose()
  pools.ringPool.dispose()
  pools.puffPool.dispose()
  pools.tracerPool.dispose()
  pools.conePool.dispose()
}

// ---------- spawn helpers ----------

function spawnSpark(pool: InstancedPool<SparkData>, life: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, arcHeight: number, size0: number, size1: number, color: THREE.Color): void {
  pool.spawnInto(life, (d) => {
    d.x = x; d.y = y; d.z = z
    d.dx = dx; d.dy = dy; d.dz = dz
    d.arcHeight = arcHeight
    d.size0 = size0; d.size1 = size1
    d.r = color.r; d.g = color.g; d.b = color.b
  })
}

function spawnBurst(pool: InstancedPool<SparkData>, count: number, x: number, y: number, z: number, life: number, speed: number, size0: number, size1: number, color: THREE.Color, arcHeight: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const sp = speed * (0.5 + Math.random() * 0.6)
    const dx = Math.cos(angle) * sp
    const dz = Math.sin(angle) * sp
    const dy = speed * (0.15 + Math.random() * 0.45)
    spawnSpark(pool, life * (0.75 + Math.random() * 0.4), x, y, z, dx, dy, dz, arcHeight * (0.6 + Math.random() * 0.8), size0 * (0.85 + Math.random() * 0.3), size1, color)
  }
}

function spawnDisc(pool: InstancedPool<DiscData>, life: number, x: number, y: number, z: number, size0: number, size1: number, color: THREE.Color): void {
  pool.spawnInto(life, (d) => {
    d.x = x; d.y = y; d.z = z
    d.size0 = size0; d.size1 = size1
    d.r = color.r; d.g = color.g; d.b = color.b
  })
}

function spawnTracer(pool: InstancedPool<TracerData>, life: number, from: Vec3Like, to: Vec3Like, thickness: number, color: THREE.Color): void {
  pool.spawnInto(life, (d) => {
    d.fx = from.x; d.fy = from.y; d.fz = from.z
    d.tx = to.x; d.ty = to.y; d.tz = to.z
    d.thickness = thickness
    d.r = color.r; d.g = color.g; d.b = color.b
  })
}

function spawnCone(pool: InstancedPool<ConeData>, life: number, from: Vec3Like, to: Vec3Like, color: THREE.Color): void {
  pool.spawnInto(life, (d) => {
    d.fx = from.x; d.fy = from.y; d.fz = from.z
    d.tx = to.x; d.ty = to.y; d.tz = to.z
    d.r = color.r; d.g = color.g; d.b = color.b
  })
}

// ---------- imperative API ----------

const CHARGE_DUST_MAX_PUFFS = 6
const CHARGE_DUST_SPREAD_S = 0.35

function makeController(pools: Pools): VfxApi {
  return {
    shoot(from: Vec3Like, to: Vec3Like, kind: ShotKind) {
      const pal = shotPalette(kind)
      const thickness = TRACER_THICKNESS[kind] ?? 0.05
      const travel = TRACER_TRAVEL_S[kind] ?? 0.18

      // Muzzle flash at the firer, regardless of weapon kind.
      spawnBurst(pools.sparkPool, 3, from.x, from.y, from.z, 0.1, 2.2, 0.14, 0.02, pal.trail, 0.2)

      if (kind === 'flame') {
        spawnCone(pools.conePool, 0.55, from, to, pal.trail)
        spawnBurst(pools.sparkPool, 4, to.x, to.y, to.z, 0.35, 2, 0.1, 0.02, pal.head, 0.6)
        return
      }

      spawnTracer(pools.tracerPool, travel, from, to, thickness, pal.trail)
      // Bright head travels the same straight line, arriving at `to` exactly when the tracer does.
      spawnSpark(pools.sparkPool, travel, from.x, from.y, from.z, to.x - from.x, to.y - from.y, to.z - from.z, 0, thickness * 2.4, thickness * 2.4, pal.head)

      if (kind === 'psychic') {
        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2 + 0.3
        const midZ = (from.z + to.z) / 2
        spawnBurst(pools.sparkPool, 3, midX, midY, midZ, 0.2, 1.2, 0.1, 0.02, pal.trail, 0.3)
      }
    },

    hit(at: Vec3Like, severity: number) {
      const s = Math.min(1, Math.max(0, severity))
      const count = 4 + Math.round(s * 6)
      spawnBurst(pools.sparkPool, count, at.x, at.y, at.z, 0.3, 2.5 + s * 2, 0.1 + s * 0.05, 0.02, IMPACT_COLOR, 1.2)
      spawnDisc(pools.ringPool, 0.16, at.x, at.y, at.z, 0.15, 0.7 + s * 0.4, IMPACT_FLASH_COLOR)
    },

    save(at: Vec3Like) {
      spawnDisc(pools.ringPool, 0.32, at.x, at.y, at.z, 0.3, 1.15, SAVE_COLOR)
      spawnBurst(pools.sparkPool, 4, at.x, at.y, at.z, 0.22, 1.4, 0.07, 0.015, SAVE_COLOR, 0.6)
    },

    melee(at: Vec3Like, attackerFaction: FactionLike) {
      const color = factionColor(attackerFaction)
      spawnBurst(pools.sparkPool, 7, at.x, at.y, at.z, 0.28, 2.6, 0.09, 0.02, color, 1)
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2
        const half = 0.6
        const y = at.y + 0.4 + Math.random() * 0.3
        const from = { x: at.x - Math.cos(angle) * half, y, z: at.z - Math.sin(angle) * half }
        const to = { x: at.x + Math.cos(angle) * half, y, z: at.z + Math.sin(angle) * half }
        spawnTracer(pools.tracerPool, 0.16, from, to, 0.06, color)
      }
    },

    death(at: Vec3Like) {
      spawnDisc(pools.puffPool, 0.6, at.x, 0.05, at.z, 0.3, 2.2, DUST_COLOR)
      spawnBurst(pools.sparkPool, 6, at.x, at.y + 0.2, at.z, 0.6, 2, 0.09, 0.02, DEBRIS_COLOR, 1.6)
    },

    chargeDust(path: Vec3Like[]) {
      if (path.length === 0) return
      const step = Math.max(1, Math.floor(path.length / CHARGE_DUST_MAX_PUFFS))
      let i = 0
      for (let p = 0; p < path.length; p += step) {
        const point = path[p]
        const delay = Math.min(CHARGE_DUST_SPREAD_S, i * (CHARGE_DUST_SPREAD_S / CHARGE_DUST_MAX_PUFFS))
        i++
        const spawn = () => spawnDisc(pools.puffPool, 0.3, point.x, 0.05, point.z, 0.15, 1.3, DUST_COLOR)
        if (delay <= 0) spawn()
        else setTimeout(spawn, delay * 1000)
      }
    },

    objectivePulse(at: Vec3Like, colour: string) {
      const color = new THREE.Color(colour)
      spawnDisc(pools.ringPool, 0.6, at.x, 0.06, at.z, 0.4, 3.4, color)
      spawnDisc(pools.ringPool, 0.4, at.x, 0.06, at.z, 0.2, 2, color)
    },

    mortal(at: Vec3Like) {
      spawnDisc(pools.ringPool, 0.14, at.x, at.y, at.z, 0.1, 0.9, MORTAL_FLASH_COLOR)
      spawnBurst(pools.sparkPool, 8, at.x, at.y, at.z, 0.4, 2.6, 0.1, 0.02, MORTAL_COLOR, 1.4)
    },
  }
}

// ---------- module-level bus: `vfx.*` calls reach whichever <VfxLayer/> is currently mounted ----------

let activeController: VfxApi | null = null

function noop(): void {
  /* no <VfxLayer/> mounted yet — calls before mount (or after unmount) are silently dropped */
}

/** Imperative entry point — safe to call from anywhere in the client at any time. */
export const vfx: VfxApi = {
  shoot: (from, to, kind) => activeController?.shoot(from, to, kind) ?? noop(),
  hit: (at, severity) => activeController?.hit(at, severity) ?? noop(),
  save: (at) => activeController?.save(at) ?? noop(),
  melee: (at, attackerFaction) => activeController?.melee(at, attackerFaction) ?? noop(),
  death: (at) => activeController?.death(at) ?? noop(),
  chargeDust: (path) => activeController?.chargeDust(path) ?? noop(),
  objectivePulse: (at, colour) => activeController?.objectivePulse(at, colour) ?? noop(),
  mortal: (at) => activeController?.mortal(at) ?? noop(),
}

/** Mount once under the game's <Canvas> (sibling to Board/UnitsLayer/etc). Renders 5 pooled
 *  InstancedMeshes and drives them all from one useFrame tick; owns no engine/game state. */
export function VfxLayer() {
  const pools = useMemo(() => createPools(), [])

  useEffect(() => {
    activeController = makeController(pools)
    return () => {
      activeController = null
    }
  }, [pools])

  useEffect(() => {
    return () => disposePools(pools)
  }, [pools])

  useFrame(() => {
    const now = performance.now() / 1000
    pools.sparkPool.tick(now)
    pools.ringPool.tick(now)
    pools.puffPool.tick(now)
    pools.tracerPool.tick(now)
    pools.conePool.tick(now)
  })

  return (
    <group>
      <primitive object={pools.sparkPool.mesh} />
      <primitive object={pools.ringPool.mesh} />
      <primitive object={pools.puffPool.mesh} />
      <primitive object={pools.tracerPool.mesh} />
      <primitive object={pools.conePool.mesh} />
    </group>
  )
}
