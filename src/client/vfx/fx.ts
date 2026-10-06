// The weapon-family effects engine: pooled sprites, beam/streak strips, ground quads and projectile models,
// driven by the data in families.ts. One `FxEngine` owns a THREE.Group (mount it under the Canvas) and is
// ticked once per frame with `update(now)` (now = performance.now()/1000).
//
//  - Every visual object (Sprite, strip Mesh, ground quad, model instance) is created once up front and
//    recycled; spawning only overwrites plain-data fields, so a steady-state volley allocates nothing per frame.
//  - Energy effects are additive; smoke, debris and scorch decals are normal-blended.
//  - A volley is one projectile per attack, staggered, capped at MAX_VOLLEY_SHOTS. A hit lands on the target
//    model; a miss flies past/near it and strikes the ground beside it.
import * as THREE from 'three'
import { FAMILY_FX, MAX_VOLLEY_SHOTS, type FamilyFx, type ImpactKind } from './families'
import { isTintable, preloadSprites, spriteTexture, type SpriteName } from './textures'
import { ModelPool, preloadModels, type ModelInstance } from './models'
import type { VfxFamily, VolleyOptions } from './types'

const MUZZLE_H = 0.7 // inches above the firer's base the shot leaves from
const HIT_H = 0.55 // inches above the target's base a hit lands
const GROUND_Y = 0.06

const UNIT_X = new THREE.Vector3(1, 0, 0)
const UNIT_Z = new THREE.Vector3(0, 0, 1)
const WHITE = new THREE.Color(1, 1, 1)
const DUST = new THREE.Color('#b8a27c')
const SMOKE_GREY = new THREE.Color('#9a9a9a')

const rand = Math.random
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

// ---------- sprite pool ----------

class SpritePool {
  private readonly free: THREE.Sprite[] = []
  constructor(parent: THREE.Object3D, cap: number, readonly additive: boolean, renderOrder: number) {
    for (let i = 0; i < cap; i++) {
      const m = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      })
      const s = new THREE.Sprite(m)
      s.visible = false
      s.renderOrder = renderOrder
      s.frustumCulled = false
      parent.add(s)
      this.free.push(s)
    }
  }
  acquire(): THREE.Sprite | null {
    return this.free.pop() ?? null
  }
  release(s: THREE.Sprite): void {
    s.visible = false
    this.free.push(s)
  }
  dispose(): void {
    for (const s of this.free) s.material.dispose()
  }
}

interface Particle {
  active: boolean
  sprite: THREE.Sprite | null
  pool: SpritePool | null
  born: number
  last: number
  life: number
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  g: number
  drag: number
  s0: number; s1: number
  a0: number; a1: number
  rot: number
  spin: number
}

const newParticle = (): Particle => ({ active: false, sprite: null, pool: null, born: 0, last: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 1, s1: 1, a0: 1, a1: 0, rot: 0, spin: 0 })

// ---------- ground quads (shockwave rings, scorch decals) ----------

interface Flat {
  active: boolean
  mesh: THREE.Mesh
  born: number
  life: number
  s0: number; s1: number
  a0: number
}

class FlatPool {
  readonly items: Flat[] = []
  private cursor = 0
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry, cap: number, additive: boolean, renderOrder: number) {
    for (let i = 0; i < cap; i++) {
      const m = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geo, m)
      mesh.visible = false
      mesh.renderOrder = renderOrder
      mesh.frustumCulled = false
      parent.add(mesh)
      this.items.push({ active: false, mesh, born: 0, life: 1, s0: 1, s1: 1, a0: 1 })
    }
  }
  take(): Flat {
    for (let k = 0; k < this.items.length; k++) {
      const i = (this.cursor + k) % this.items.length
      if (!this.items[i].active) {
        this.cursor = (i + 1) % this.items.length
        return this.items[i]
      }
    }
    const f = this.items[this.cursor]
    this.cursor = (this.cursor + 1) % this.items.length
    return f
  }
}

// ---------- strips (beams, tracers, lightning) ----------

class StripPool {
  private readonly free: THREE.Mesh[] = []
  constructor(parent: THREE.Object3D, cap: number) {
    const geo = new THREE.PlaneGeometry(1, 1)
    for (let i = 0; i < cap; i++) {
      const m = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geo, m)
      mesh.visible = false
      mesh.renderOrder = 12
      mesh.frustumCulled = false
      parent.add(mesh)
      this.free.push(mesh)
    }
  }
  acquire(): THREE.Mesh | null {
    return this.free.pop() ?? null
  }
  release(m: THREE.Mesh): void {
    m.visible = false
    this.free.push(m)
  }
}

const scratchDir = new THREE.Vector3()
const scratchQ = new THREE.Quaternion()
const scratchQ2 = new THREE.Quaternion()

/** Lay a strip quad from a to b (length along its local X), rolled around the beam axis. */
function setStrip(m: THREE.Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, roll: number): void {
  const dx = bx - ax, dy = by - ay, dz = bz - az
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
  if (len > 1e-5) {
    scratchDir.set(dx, dy, dz).multiplyScalar(1 / len)
    scratchQ.setFromUnitVectors(UNIT_X, scratchDir)
    if (roll !== 0) {
      scratchQ2.setFromAxisAngle(UNIT_X, roll)
      scratchQ.multiply(scratchQ2)
    }
    m.quaternion.copy(scratchQ)
  }
  m.scale.set(Math.max(len, 0.001), Math.max(width, 0.001), 1)
}

// ---------- projectiles ----------

const MAX_PROJ = 64
const ARC_SEGMENTS = 5
const MAX_STRIPS_PER_PROJ = 12

class Proj {
  active = false
  started = false
  impacted = false
  fx: FamilyFx = FAMILY_FX.bolt
  colors: FamilyColors | null = null
  startAt = 0
  dur = 0.3
  impactT = 1
  fromX = 0; fromY = 0; fromZ = 0
  toX = 0; toY = 0; toZ = 0
  hit = true
  dist = 1
  seed = 0
  trailAcc = 0
  lastT = 0
  readonly strips: THREE.Mesh[] = []
  head: THREE.Sprite | null = null
  glow: THREE.Sprite | null = null
  model: ModelInstance | null = null
  // reusable position scratch
  px = 0; py = 0; pz = 0
}

interface FamilyColors {
  muzzle: THREE.Color
  color: THREE.Color
  core: THREE.Color
  impact: THREE.Color
  trail: THREE.Color | null
}

function buildColors(fx: FamilyFx): FamilyColors {
  return {
    muzzle: new THREE.Color(fx.muzzle.color),
    color: new THREE.Color(fx.projectile.color),
    core: new THREE.Color(fx.projectile.core),
    impact: new THREE.Color(fx.impactColor),
    trail: fx.projectile.trail ? new THREE.Color(fx.projectile.trail.color) : null,
  }
}

const SMOKE_TEX: SpriteName[] = ['smoke_puff_1', 'smoke_puff_2', 'smoke_puff_3']
const EXPLOSION_TEX: SpriteName[] = ['explosion_1', 'explosion_2', 'explosion_3']

// ---------- the engine ----------

export class FxEngine {
  readonly group = new THREE.Group()
  private readonly add: SpritePool
  private readonly norm: SpritePool
  private readonly particles: Particle[] = []
  private pcursor = 0
  private readonly flatAdd: FlatPool
  private readonly flatNorm: FlatPool
  private readonly strips: StripPool
  private readonly models: ModelPool
  private readonly projs: Proj[] = []
  private readonly colors = {} as Record<VfxFamily, FamilyColors>
  private lastNow = 0
  private dt = 0.016

  constructor() {
    preloadSprites()
    preloadModels()
    const g = this.group
    g.name = 'vfx-fx'
    this.norm = new SpritePool(g, 260, false, 6)
    this.add = new SpritePool(g, 520, true, 14)
    const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    this.flatNorm = new FlatPool(g, flatGeo, 36, false, 2)
    this.flatAdd = new FlatPool(g, flatGeo, 36, true, 3)
    this.strips = new StripPool(g, 220)
    this.models = new ModelPool(g)
    for (let i = 0; i < 720; i++) this.particles.push(newParticle())
    for (let i = 0; i < MAX_PROJ; i++) this.projs.push(new Proj())
    for (const f of Object.keys(FAMILY_FX) as VfxFamily[]) this.colors[f] = buildColors(FAMILY_FX[f])
  }

  dispose(): void {
    this.add.dispose()
    this.norm.dispose()
    this.models.dispose()
    this.group.clear()
  }

  // ---------- public ----------

  /** Queue a volley: one projectile per shot, staggered, capped at MAX_VOLLEY_SHOTS. */
  volley(opts: VolleyOptions, now: number): void {
    const fx = FAMILY_FX[opts.family]
    if (!fx || opts.shots.length === 0) return
    const src = opts.shots
    const n = Math.min(src.length, MAX_VOLLEY_SHOTS)
    const stagger = Math.min(opts.staggerMs ?? fx.staggerMs, 1800 / Math.max(1, n)) / 1000
    for (let i = 0; i < n; i++) {
      // Evenly thin an oversized volley so the hit/miss ratio is kept.
      const shot = src.length > n ? src[Math.floor((i * src.length) / n)] : src[i]
      const p = this.projs.find((q) => !q.active)
      if (!p) break
      p.fx = fx
      p.colors = this.colors[opts.family]
      p.active = true
      p.started = false
      p.impacted = false
      p.startAt = now + i * stagger + rand() * stagger * 0.7
      p.fromX = shot.from.x + (rand() - 0.5) * 0.2
      p.fromY = shot.from.y + MUZZLE_H
      p.fromZ = shot.from.z + (rand() - 0.5) * 0.2
      p.hit = shot.hit
      this.aim(p, shot.to.x, shot.to.y, shot.to.z)
      const proj = fx.projectile
      const dx = p.toX - p.fromX, dy = p.toY - p.fromY, dz = p.toZ - p.fromZ
      p.dist = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz))
      switch (proj.type) {
        case 'beam': case 'arc': p.dur = proj.duration ?? 0.3; p.impactT = 0.08; break
        case 'cone': p.dur = proj.duration ?? 0.6; p.impactT = 0.5; break
        default: p.dur = clamp(p.dist / proj.speed, 0.16, 1.5); p.impactT = 1
      }
      p.seed = rand() * 1000
      p.trailAcc = 0
    }
  }

  /** True while anything is still animating (the demand render loop keeps asking for frames). */
  update(now: number): boolean {
    this.dt = this.lastNow === 0 ? 0.016 : clamp(now - this.lastNow, 0, 0.05)
    this.lastNow = now
    let busy = false
    for (const p of this.projs) {
      if (!p.active) continue
      busy = true
      if (now < p.startAt) continue
      this.stepProj(p, now)
    }
    if (this.stepParticles(now)) busy = true
    if (this.stepFlats(this.flatAdd, now)) busy = true
    if (this.stepFlats(this.flatNorm, now)) busy = true
    return busy
  }

  // ---------- aim ----------

  private aim(p: Proj, tx: number, ty: number, tz: number): void {
    if (p.hit) {
      p.toX = tx + (rand() - 0.5) * 0.4
      p.toY = ty + HIT_H + (rand() - 0.5) * 0.3
      p.toZ = tz + (rand() - 0.5) * 0.4
      return
    }
    // A miss lands on the ground beside / just beyond the target.
    const dx = tx - p.fromX, dz = tz - p.fromZ
    const l = Math.max(0.001, Math.sqrt(dx * dx + dz * dz))
    const ux = dx / l, uz = dz / l
    const side = (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 1.5)
    const along = 0.3 + rand() * 2
    p.toX = tx - uz * side + ux * along
    p.toZ = tz + ux * side + uz * along
    p.toY = GROUND_Y
  }

  // ---------- projectile stepping ----------

  private stepProj(p: Proj, now: number): void {
    const fx = p.fx
    const proj = fx.projectile
    const cols = p.colors as FamilyColors
    if (!p.started) {
      p.started = true
      this.startProj(p, now)
    }
    const t = (now - p.startAt) / p.dur
    if (!p.impacted && t >= p.impactT) {
      p.impacted = true
      this.impact(fx.impact, p.toX, p.toY, p.toZ, fx.impactScale, cols.impact, !p.hit, p.fromX, p.fromZ)
    }
    if (t >= 1) {
      this.endProj(p)
      return
    }
    const tt = clamp(t, 0, 1)
    switch (proj.type) {
      case 'streak': this.drawStreak(p, tt); break
      case 'orb': this.drawOrb(p, tt, now); break
      case 'lob': this.drawLob(p, tt, now); break
      case 'rocket': this.drawRocket(p, tt); break
      case 'beam': this.drawBeam(p, tt, now); break
      case 'arc': this.drawArc(p, tt, now); break
      case 'cone': this.emitCone(p, tt); break
    }
  }

  private startProj(p: Proj, now: number): void {
    const fx = p.fx
    const proj = fx.projectile
    const cols = p.colors as FamilyColors
    this.muzzle(fx, cols, p.fromX, p.fromY, p.fromZ, p.toX - p.fromX, p.toZ - p.fromZ)
    const strip = (tex: SpriteName, col: THREE.Color): void => {
      if (p.strips.length >= MAX_STRIPS_PER_PROJ) return
      const m = this.strips.acquire()
      if (!m) return
      const mat = m.material as THREE.MeshBasicMaterial
      mat.map = spriteTexture(tex)
      mat.color.copy(isTintable(tex) ? col : WHITE)
      mat.opacity = 1
      mat.needsUpdate = false
      m.visible = true
      p.strips.push(m)
    }
    switch (proj.type) {
      case 'streak':
        strip('beam_core', cols.color); strip('beam_core', cols.color); strip('beam_core', cols.core); strip('beam_core', cols.core)
        if (proj.head) p.head = this.claimSprite(true, 'glow_orb', cols.core)
        if (proj.model) p.model = this.models.acquire(proj.model)
        break
      case 'orb':
        p.head = this.claimSprite(true, proj.sprite ?? 'glow_orb', cols.core)
        p.glow = this.claimSprite(true, 'glow_orb', cols.color)
        break
      case 'lob':
        if (proj.sprite) p.head = this.claimSprite(true, proj.sprite, cols.core)
        if (proj.model) p.model = this.models.acquire(proj.model)
        break
      case 'rocket':
        if (proj.model) p.model = this.models.acquire(proj.model)
        p.head = this.claimSprite(true, 'fire_blob', WHITE)
        break
      case 'beam':
        strip('beam_core', cols.color); strip('beam_core', cols.color); strip('beam_core', cols.core); strip('beam_core', cols.core)
        p.head = this.claimSprite(true, 'glow_orb', cols.color)
        break
      case 'arc':
        for (let i = 0; i < ARC_SEGMENTS * 2; i++) strip('lightning_arc', i < ARC_SEGMENTS ? cols.color : cols.core)
        break
      case 'cone':
        break
    }
    // The first frame of every strip/sprite is positioned by the draw call that follows.
    void now
  }

  private endProj(p: Proj): void {
    for (const m of p.strips) this.strips.release(m)
    p.strips.length = 0
    if (p.head) { this.releaseSprite(p.head); p.head = null }
    if (p.glow) { this.releaseSprite(p.glow); p.glow = null }
    if (p.model) { this.models.release(p.model); p.model = null }
    p.active = false
  }

  private claimSprite(additive: boolean, tex: SpriteName, col: THREE.Color): THREE.Sprite | null {
    const s = (additive ? this.add : this.norm).acquire()
    if (!s) return null
    const m = s.material
    m.map = spriteTexture(tex)
    m.color.copy(isTintable(tex) ? col : WHITE)
    m.opacity = 1
    m.rotation = 0
    s.visible = true
    s.userData.additive = additive
    return s
  }

  private releaseSprite(s: THREE.Sprite): void {
    ;(s.userData.additive ? this.add : this.norm).release(s)
  }

  // ---------- projectile drawing ----------

  /** Position along the flight at t (with the family's arc), written to p.px/py/pz. */
  private pathPoint(p: Proj, t: number, arc: number): void {
    p.px = lerp(p.fromX, p.toX, t)
    p.py = lerp(p.fromY, p.toY, t) + Math.min(arc * p.dist, 3.2) * 4 * t * (1 - t)
    p.pz = lerp(p.fromZ, p.toZ, t)
  }

  private drawStreak(p: Proj, t: number): void {
    const proj = p.fx.projectile
    const tailT = Math.max(0, t - proj.length / p.dist)
    const hx = lerp(p.fromX, p.toX, t), hy = lerp(p.fromY, p.toY, t), hz = lerp(p.fromZ, p.toZ, t)
    const tx = lerp(p.fromX, p.toX, tailT), ty = lerp(p.fromY, p.toY, tailT), tz = lerp(p.fromZ, p.toZ, tailT)
    const s = p.strips
    for (let i = 0; i < s.length; i++) {
      const core = i >= 2
      setStrip(s[i], tx, ty, tz, hx, hy, hz, core ? proj.width * 0.42 : proj.width, (i & 1) * (Math.PI / 2))
    }
    if (p.head && proj.head) {
      p.head.position.set(hx, hy, hz)
      const sz = proj.head
      p.head.scale.set(sz, sz, 1)
    }
    if (p.model) {
      p.model.root.position.set(hx, hy, hz)
      scratchDir.set(p.toX - p.fromX, p.toY - p.fromY, p.toZ - p.fromZ).normalize()
      p.model.root.quaternion.setFromUnitVectors(UNIT_Z, scratchDir)
      p.model.root.scale.setScalar(proj.length * 0.26)
    }
  }

  private drawOrb(p: Proj, t: number, now: number): void {
    const proj = p.fx.projectile
    this.pathPoint(p, t, 0.04)
    const wob = p.fx.family === 'psychic' ? Math.sin(now * 22 + p.seed) * 0.18 : 0
    const x = p.px, y = p.py + wob, z = p.pz
    if (p.head) {
      p.head.position.set(x, y, z)
      const pulse = 1 + 0.12 * Math.sin(now * 30 + p.seed)
      const sz = (proj.head ?? 1) * pulse
      p.head.scale.set(sz, sz, 1)
      p.head.material.rotation = now * 3 + p.seed
    }
    if (p.glow) {
      p.glow.position.set(x, y, z)
      const sz = (proj.head ?? 1) * 2.1
      p.glow.scale.set(sz, sz, 1)
      p.glow.material.opacity = 0.45
    }
    this.trail(p, x, y, z)
  }

  private drawLob(p: Proj, t: number, now: number): void {
    const proj = p.fx.projectile
    this.pathPoint(p, t, proj.arc ?? 0.3)
    const x = p.px, y = p.py, z = p.pz
    if (p.head) {
      p.head.position.set(x, y, z)
      const sz = proj.head ?? 0.6
      p.head.scale.set(sz, sz, 1)
    }
    if (p.model) {
      p.model.root.position.set(x, y, z)
      this.pathPoint(p, Math.min(1, t + 0.03), proj.arc ?? 0.3)
      scratchDir.set(p.px - x, p.py - y, p.pz - z)
      if (scratchDir.lengthSq() > 1e-8) {
        scratchDir.normalize()
        p.model.root.quaternion.setFromUnitVectors(UNIT_Z, scratchDir)
        scratchQ2.setFromAxisAngle(UNIT_Z, (proj.spin ?? 0) * (now - p.startAt))
        p.model.root.quaternion.multiply(scratchQ2)
      }
      p.model.root.scale.setScalar(proj.length)
    }
    this.trail(p, x, y, z)
  }

  private drawRocket(p: Proj, t: number): void {
    const proj = p.fx.projectile
    this.pathPoint(p, t, proj.arc ?? 0.07)
    const x = p.px, y = p.py, z = p.pz
    this.pathPoint(p, Math.min(1, t + 0.03), proj.arc ?? 0.07)
    scratchDir.set(p.px - x, p.py - y, p.pz - z)
    if (scratchDir.lengthSq() < 1e-8) scratchDir.set(p.toX - p.fromX, p.toY - p.fromY, p.toZ - p.fromZ)
    scratchDir.normalize()
    const len = proj.length
    const tailX = x - scratchDir.x * len * 0.5, tailY = y - scratchDir.y * len * 0.5, tailZ = z - scratchDir.z * len * 0.5
    if (p.model) {
      p.model.root.position.set(x, y, z)
      p.model.root.quaternion.setFromUnitVectors(UNIT_Z, scratchDir)
      p.model.root.scale.setScalar(len)
    }
    if (p.head) {
      p.head.position.set(tailX, tailY, tailZ)
      const sz = (proj.head ?? 0.8) * (0.85 + rand() * 0.3)
      p.head.scale.set(sz, sz, 1)
    }
    this.trail(p, tailX, tailY, tailZ)
  }

  private drawBeam(p: Proj, t: number, now: number): void {
    const proj = p.fx.projectile
    const wob = proj.wobble ?? 0
    const shimmer = wob ? 1 + wob * Math.sin(now * 55 + p.seed) * Math.sin(now * 31) : 1
    const grow = Math.min(1, t / 0.08)
    const fade = 1 - Math.pow(t, 1.6)
    const w = proj.width * (1 - t * 0.55) * shimmer * grow
    const s = p.strips
    for (let i = 0; i < s.length; i++) {
      const core = i >= 2
      setStrip(s[i], p.fromX, p.fromY, p.fromZ, p.toX, p.toY, p.toZ, core ? w * 0.38 : w * 1.6, (i & 1) * (Math.PI / 2))
      ;(s[i].material as THREE.MeshBasicMaterial).opacity = core ? fade : fade * 0.75
    }
    if (p.head) {
      p.head.position.set(p.fromX, p.fromY, p.fromZ)
      const sz = proj.width * 3.2 * fade
      p.head.scale.set(sz, sz, 1)
      p.head.material.opacity = fade
    }
    if (proj.trail) {
      // heat shimmer / haze along the beam
      p.trailAcc += proj.trail.rate * this.dt
      while (p.trailAcc >= 1) {
        p.trailAcc -= 1
        const f = rand()
        this.trailPuff(p, lerp(p.fromX, p.toX, f), lerp(p.fromY, p.toY, f), lerp(p.fromZ, p.toZ, f))
      }
    }
  }

  private drawArc(p: Proj, t: number, now: number): void {
    const proj = p.fx.projectile
    const fade = 1 - t * t
    // Re-jitter ~30 times a second so the arc crawls.
    const bucket = Math.floor(now * 30) + p.seed
    const dx = p.toX - p.fromX, dy = p.toY - p.fromY, dz = p.toZ - p.fromZ
    const l = Math.max(0.01, Math.sqrt(dx * dx + dz * dz))
    const hx = -dz / l, hz = dx / l // horizontal perpendicular
    const amp = Math.min(0.9, 0.18 + p.dist * 0.03)
    let ax = p.fromX, ay = p.fromY, az = p.fromZ
    const s = p.strips
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const f = (i + 1) / ARC_SEGMENTS
      let bx = lerp(p.fromX, p.toX, f), by = lerp(p.fromY, p.toY, f), bz = lerp(p.fromZ, p.toZ, f)
      if (i < ARC_SEGMENTS - 1) {
        const j1 = (hash(bucket * 7.13 + i * 3.1) - 0.5) * 2 * amp
        const j2 = (hash(bucket * 3.77 + i * 5.9) - 0.5) * 2 * amp
        bx += hx * j1
        bz += hz * j1
        by += j2
      }
      const a = s[i], b = s[i + ARC_SEGMENTS]
      if (a) {
        setStrip(a, ax, ay, az, bx, by, bz, proj.width * 2.2, 0)
        ;(a.material as THREE.MeshBasicMaterial).opacity = fade * 0.8
      }
      if (b) {
        setStrip(b, ax, ay, az, bx, by, bz, proj.width * 1.1, Math.PI / 2)
        ;(b.material as THREE.MeshBasicMaterial).opacity = fade
      }
      ax = bx; ay = by; az = bz
    }
  }

  private emitCone(p: Proj, t: number): void {
    const proj = p.fx.projectile
    const dx = p.toX - p.fromX, dy = p.toY - p.fromY, dz = p.toZ - p.fromZ
    const l = Math.max(0.1, Math.sqrt(dx * dx + dy * dy + dz * dz))
    // Flames only emit for the first ~70% of the burst; the rest lets them burn out.
    if (t > 0.7) return
    p.trailAcc += 70 * this.dt
    const speed = Math.max(8, l / 0.38)
    while (p.trailAcc >= 1) {
      p.trailAcc -= 1
      const spread = 0.2
      const vx = (dx / l) * speed + (rand() - 0.5) * speed * spread
      const vy = (dy / l) * speed + (rand() - 0.5) * speed * spread * 0.8 + 0.8
      const vz = (dz / l) * speed + (rand() - 0.5) * speed * spread
      const sz0 = 0.35 + rand() * 0.25
      this.spr(true, proj.sprite ?? 'fire_blob', WHITE, p.fromX, p.fromY, p.fromZ, 0.38 + rand() * 0.12, sz0, sz0 * 2.6, 0.75, vx, vy, vz, -1.5, 1.4, (rand() - 0.5) * 4)
      if (rand() < 0.25) this.spr(false, SMOKE_TEX[(rand() * 3) | 0], SMOKE_GREY, p.fromX, p.fromY, p.fromZ, 0.7, 0.4, 1.5, 0.35, vx * 0.7, vy + 1.2, vz * 0.7, -0.5, 1.2, rand() - 0.5, 0.15)
    }
  }

  // ---------- trails & muzzle ----------

  private trail(p: Proj, x: number, y: number, z: number): void {
    const tr = p.fx.projectile.trail
    if (!tr) return
    p.trailAcc += tr.rate * this.dt
    while (p.trailAcc >= 1) {
      p.trailAcc -= 1
      this.trailPuff(p, x, y, z)
    }
  }

  private trailPuff(p: Proj, x: number, y: number, z: number): void {
    const tr = p.fx.projectile.trail
    const col = p.colors?.trail
    if (!tr || !col) return
    const sp = tr.spread ?? 0
    const smoke = tr.sprite.startsWith('smoke')
    const tex = smoke ? SMOKE_TEX[(rand() * 3) | 0] : tr.sprite
    this.spr(tr.additive, tex, col, x, y, z, tr.life * (0.8 + rand() * 0.4), tr.size0, tr.size1, tr.alpha,
      (rand() - 0.5) * sp, (tr.rise ?? 0) + (rand() - 0.3) * sp * 0.5, (rand() - 0.5) * sp, 0, 1, (rand() - 0.5) * 3)
  }

  private muzzle(fx: FamilyFx, cols: FamilyColors, x: number, y: number, z: number, dx: number, dz: number): void {
    const m = fx.muzzle
    if (m.sprite) this.spr(true, m.sprite, cols.muzzle, x, y, z, m.life, m.size, m.size * 0.55, 1, 0, 0, 0, 0, 0, rand() * 6)
    const l = Math.max(0.001, Math.sqrt(dx * dx + dz * dz))
    const ux = dx / l, uz = dz / l
    for (let i = 0; i < m.sparks; i++) {
      const sp = 4 + rand() * 4
      this.spr(true, 'spark', cols.muzzle, x + ux * 0.3, y, z + uz * 0.3, 0.14 + rand() * 0.08, 0.16, 0.03, 1,
        ux * sp + (rand() - 0.5) * 3, (rand() - 0.2) * 2.5, uz * sp + (rand() - 0.5) * 3, 6, 0.5)
    }
    if (m.smoke) this.spr(false, SMOKE_TEX[(rand() * 3) | 0], SMOKE_GREY, x + ux * 0.4, y, z + uz * 0.4, 0.7, 0.3, 1.0, 0.35, ux * 0.8, 0.9, uz * 0.8, 0, 1.2, rand() - 0.5)
  }

  // ---------- impacts ----------

  private flash(x: number, y: number, z: number, size: number, col: THREE.Color, life: number): void {
    this.spr(true, 'glow_orb', col, x, y, z, life, size * 0.7, size, 1)
  }

  private sparks(n: number, x: number, y: number, z: number, speed: number, life: number, size: number, col: THREE.Color, g = 14): void {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const sp = speed * (0.45 + rand() * 0.75)
      this.spr(true, 'spark', col, x, y, z, life * (0.7 + rand() * 0.5), size, size * 0.2, 1,
        Math.cos(a) * sp, sp * (0.3 + rand() * 0.7), Math.sin(a) * sp, g, 0.6)
    }
  }

  private puffs(n: number, x: number, y: number, z: number, s0: number, s1: number, life: number, alpha: number, col: THREE.Color, rise: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const sp = 0.4 + rand() * 0.9
      this.spr(false, SMOKE_TEX[(rand() * 3) | 0], col, x, y, z, life * (0.8 + rand() * 0.5), s0, s1, alpha,
        Math.cos(a) * sp, rise * (0.6 + rand() * 0.8), Math.sin(a) * sp, 0, 1.3, (rand() - 0.5) * 1.5, rand() * 0.1)
    }
  }

  private debris(n: number, x: number, y: number, z: number, speed: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const sp = speed * (0.4 + rand() * 0.7)
      this.spr(false, 'debris_chunk', WHITE, x, y, z, 0.7 + rand() * 0.4, size * (0.7 + rand() * 0.6), size * 0.5, 1,
        Math.cos(a) * sp, speed * (0.7 + rand() * 0.8), Math.sin(a) * sp, 22, 0.2, (rand() - 0.5) * 12)
    }
  }

  private ring(x: number, z: number, size: number, life: number, col: THREE.Color, y = GROUND_Y + 0.02): void {
    this.flat(true, 'shockwave_ring', col, x, y, z, size * 0.15, size, 0.9, life)
  }

  private decal(x: number, z: number, size: number, life: number, tex: SpriteName, col: THREE.Color, alpha: number): void {
    this.flat(false, tex, col, x, GROUND_Y - 0.02, z, size * 0.7, size, alpha, life)
  }

  private impact(kind: ImpactKind, x: number, y: number, z: number, k: number, col: THREE.Color, miss: boolean, fromX: number, fromZ: number): void {
    const gy = GROUND_Y
    switch (kind) {
      case 'sparks':
        this.flash(x, y, z, 0.7 * k, col, 0.1)
        this.sparks(6, x, y, z, 5.5 * k, 0.28, 0.13 * k, col)
        this.puffs(1, x, y, z, 0.25 * k, 0.7 * k, 0.5, 0.3, SMOKE_GREY, 0.6)
        break
      case 'zap':
        this.flash(x, y, z, 1.0 * k, col, 0.12)
        this.sparks(7, x, y, z, 6.5 * k, 0.26, 0.12 * k, col, 6)
        break
      case 'small':
        this.spr(true, EXPLOSION_TEX[(rand() * 2) | 0], WHITE, x, y, z, 0.34, 0.5 * k, 1.8 * k, 1, 0, 0.4, 0, 0, 0, rand() - 0.5)
        this.flash(x, y, z, 1.2 * k, col, 0.14)
        this.sparks(8, x, y, z, 6 * k, 0.32, 0.14 * k, col)
        this.puffs(2, x, y, z, 0.4 * k, 1.2 * k, 0.8, 0.4, SMOKE_GREY, 0.9)
        this.debris(3, x, y, z, 3.4 * k, 0.28 * k)
        this.decal(x, z, 0.8 * k, 3.5, 'scorch_decal', WHITE, 0.55)
        break
      case 'blast':
        this.spr(true, EXPLOSION_TEX[(rand() * 3) | 0], WHITE, x, y, z, 0.42, 0.6 * k, 2.4 * k, 1, 0, 0.5, 0, 0, 0, rand() - 0.5)
        this.flash(x, y, z, 1.8 * k, col, 0.16)
        this.ring(x, z, 3.6 * k, 0.4, col)
        this.sparks(10, x, y, z, 7 * k, 0.36, 0.15 * k, col)
        this.puffs(3, x, y, z, 0.5 * k, 1.5 * k, 0.9, 0.45, SMOKE_GREY, 1)
        this.debris(5, x, y, z, 4.2 * k, 0.3 * k)
        this.decal(x, z, 1.3 * k, 4.5, 'scorch_decal', WHITE, 0.65)
        break
      case 'big':
        // fireball + a second lobe, shockwave ring, debris, rising smoke and a lasting scorch mark
        this.spr(true, 'explosion_2', WHITE, x, y, z, 0.6, 0.8 * k, 3.8 * k, 1, 0, 0.6, 0, 0, 0, rand() - 0.5)
        this.spr(true, 'explosion_3', WHITE, x + 0.2, y + 0.2, z - 0.1, 0.55, 0.4 * k, 2.8 * k, 1, 0, 0.9, 0, 0, 0, rand() - 0.5, 0.07)
        this.spr(true, 'explosion_1', WHITE, x - 0.2, y + 0.1, z + 0.15, 0.5, 0.4 * k, 2.4 * k, 0.95, 0, 0.7, 0, 0, 0, rand() - 0.5, 0.12)
        this.flash(x, y, z, 3.4 * k, col, 0.2)
        this.ring(x, z, 6.4 * k, 0.55, col)
        this.sparks(14, x, y, z, 9 * k, 0.45, 0.16 * k, col)
        this.debris(9, x, y, z, 6.5 * k, 0.34 * k)
        this.puffs(5, x, y, z, 0.8 * k, 2.4 * k, 1.5, 0.5, SMOKE_GREY, 1.7)
        this.decal(x, z, 2.8 * k, 5, 'scorch_decal', WHITE, 0.8)
        break
      case 'acid':
        this.flash(x, y, z, 1.2 * k, col, 0.16)
        this.spr(true, 'bio_glob', WHITE, x, y, z, 0.28, 0.4 * k, 1.5 * k, 0.95)
        for (let i = 0; i < 7; i++) {
          const a = rand() * Math.PI * 2
          const sp = (2 + rand() * 3.5) * k
          this.spr(true, 'bio_glob', WHITE, x, y, z, 0.45 + rand() * 0.25, 0.24 * k, 0.08 * k, 0.9, Math.cos(a) * sp, sp * (0.9 + rand()), Math.sin(a) * sp, 16, 0.3)
        }
        this.sparks(5, x, y, z, 4 * k, 0.3, 0.1 * k, col, 12)
        this.decal(x, z, 1.5 * k, 4, 'bio_glob', WHITE, 0.8)
        break
      case 'warp':
        this.flash(x, y, z, 1.8 * k, col, 0.2)
        for (let i = 0; i < 3; i++) this.spr(true, 'warp_wisp', WHITE, x, y, z, 0.5, 0.5 * k, (1.8 + i * 0.5) * k, 0.9, 0, 0.5, 0, 0, 0, (rand() - 0.5) * 6, i * 0.05)
        this.ring(x, z, 3.0 * k, 0.45, col)
        this.sparks(9, x, y, z, 5.5 * k, 0.4, 0.13 * k, col, 3)
        break
      case 'plasma':
        this.flash(x, y, z, 2.0 * k, col, 0.16)
        this.spr(true, 'plasma_orb', WHITE, x, y, z, 0.3, 0.5 * k, 2.0 * k, 1)
        this.ring(x, z, 2.2 * k, 0.4, col)
        this.sparks(9, x, y, z, 7 * k, 0.34, 0.13 * k, col)
        this.decal(x, z, 1.1 * k, 3.5, 'scorch_decal', WHITE, 0.6)
        break
      case 'melta':
        this.flash(x, y, z, 2.0 * k, col, 0.22)
        for (let i = 0; i < 4; i++) this.spr(true, 'fire_blob', WHITE, x, y, z, 0.5 + rand() * 0.2, 0.5 * k, 1.3 * k, 0.9, (rand() - 0.5) * 1.4, 1 + rand() * 1.2, (rand() - 0.5) * 1.4, 0, 1, rand() - 0.5)
        this.puffs(3, x, y, z, 0.5 * k, 1.8 * k, 1.2, 0.35, new THREE.Color('#e8e8e8'), 1.6)
        this.sparks(6, x, y, z, 5 * k, 0.3, 0.12 * k, col)
        this.decal(x, z, 1.5 * k, 4.5, 'scorch_decal', WHITE, 0.7)
        break
      case 'beam':
        this.flash(x, y, z, 2.6 * k, col, 0.3)
        this.spr(true, 'muzzle_energy', col, x, y, z, 0.3, 1.0 * k, 2.4 * k, 1, 0, 0, 0, 0, 0, rand() * 6)
        this.sparks(11, x, y, z, 7.5 * k, 0.4, 0.13 * k, col)
        this.puffs(2, x, y, z, 0.4 * k, 1.3 * k, 0.9, 0.35, SMOKE_GREY, 1.2)
        this.decal(x, z, 1.3 * k, 5, 'scorch_decal', WHITE, 0.7)
        break
      case 'fire':
        for (let i = 0; i < 6; i++) this.spr(true, 'fire_blob', WHITE, x + (rand() - 0.5) * 0.8, y, z + (rand() - 0.5) * 0.8, 0.5 + rand() * 0.3, 0.6 * k, 1.7 * k, 0.9, (rand() - 0.5) * 0.8, 1.2 + rand(), (rand() - 0.5) * 0.8, 0, 1, rand() - 0.5, i * 0.03)
        this.puffs(3, x, y, z, 0.5 * k, 1.8 * k, 1.3, 0.4, new THREE.Color('#555555'), 1.8)
        this.sparks(4, x, y, z, 3 * k, 0.4, 0.1 * k, col, 4)
        this.decal(x, z, 1.5 * k, 5, 'scorch_decal', WHITE, 0.6)
        break
    }
    if (miss) {
      // A miss kicks up dust where it struck the ground, so it reads as "that one missed" rather than a floating spark.
      this.puffs(2, x, gy, z, 0.3 * k, 1.0 * k, 0.6, 0.45, DUST, 0.8)
    }
    void fromX; void fromZ
  }

  // ---------- low-level emitters ----------

  /** One pooled sprite particle. */
  private spr(additive: boolean, tex: SpriteName, col: THREE.Color, x: number, y: number, z: number, life: number, s0: number, s1: number, a0: number,
    vx = 0, vy = 0, vz = 0, g = 0, drag = 0, spin = 0, delay = 0): void {
    let p: Particle | null = null
    const n = this.particles.length
    for (let k = 0; k < n; k++) {
      const i = (this.pcursor + k) % n
      if (!this.particles[i].active) {
        p = this.particles[i]
        this.pcursor = (i + 1) % n
        break
      }
    }
    if (!p) return
    const pool = additive ? this.add : this.norm
    const sprite = pool.acquire()
    if (!sprite) return
    const m = sprite.material
    m.map = spriteTexture(tex)
    m.color.copy(isTintable(tex) ? col : WHITE)
    m.opacity = 0
    m.rotation = 0
    sprite.visible = false
    p.active = true
    p.sprite = sprite
    p.pool = pool
    p.born = this.lastNow + delay
    p.last = p.born
    p.life = Math.max(0.02, life)
    p.x = x; p.y = y; p.z = z
    p.vx = vx; p.vy = vy; p.vz = vz
    p.g = g
    p.drag = drag
    p.s0 = s0; p.s1 = s1
    p.a0 = a0; p.a1 = 0
    p.rot = rand() * 6.28
    p.spin = spin
  }

  private flat(additive: boolean, tex: SpriteName, col: THREE.Color, x: number, y: number, z: number, s0: number, s1: number, a0: number, life: number): void {
    const f = (additive ? this.flatAdd : this.flatNorm).take()
    const mat = f.mesh.material as THREE.MeshBasicMaterial
    mat.map = spriteTexture(tex)
    mat.color.copy(isTintable(tex) ? col : WHITE)
    mat.opacity = a0
    f.mesh.position.set(x, y, z)
    f.mesh.rotation.y = rand() * 6.28
    f.mesh.scale.set(s0, 1, s0)
    f.mesh.visible = true
    f.active = true
    f.born = this.lastNow
    f.life = life
    f.s0 = s0
    f.s1 = s1
    f.a0 = a0
  }

  private stepParticles(now: number): boolean {
    let busy = false
    const dt = this.dt
    for (const p of this.particles) {
      if (!p.active) continue
      busy = true
      const sprite = p.sprite as THREE.Sprite
      if (now < p.born) continue
      const age = now - p.born
      if (age >= p.life) {
        p.active = false
        ;(p.pool as SpritePool).release(sprite)
        p.sprite = null
        continue
      }
      const t = age / p.life
      const d = Math.max(0, 1 - p.drag * dt)
      p.vx *= d; p.vz *= d
      p.vy = p.vy * d - p.g * dt
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
      if (p.y < GROUND_Y && p.g > 0) { p.y = GROUND_Y; p.vy *= -0.2; p.vx *= 0.6; p.vz *= 0.6 }
      sprite.visible = true
      sprite.position.set(p.x, p.y, p.z)
      const s = lerp(p.s0, p.s1, t)
      sprite.scale.set(s, s, 1)
      sprite.material.rotation = p.rot + p.spin * age
      // quick fade-in over the first 8% so puffs don't pop, then a linear fade out
      const fadeIn = t < 0.08 ? t / 0.08 : 1
      sprite.material.opacity = lerp(p.a0, p.a1, t) * fadeIn
    }
    return busy
  }

  private stepFlats(pool: FlatPool, now: number): boolean {
    let busy = false
    for (const f of pool.items) {
      if (!f.active) continue
      const age = now - f.born
      if (age >= f.life) {
        f.active = false
        f.mesh.visible = false
        continue
      }
      busy = true
      const t = age / f.life
      // ease the expansion out so rings snap outward and settle
      const e = 1 - (1 - t) * (1 - t)
      const s = lerp(f.s0, f.s1, e)
      f.mesh.scale.set(s, 1, s)
      ;(f.mesh.material as THREE.MeshBasicMaterial).opacity = f.a0 * (t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5)
    }
    return busy
  }
}

