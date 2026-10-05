// Distant war around the board: artillery flashes beyond the edges and the occasional drifting flare, so
// the scene isn't static. Purely visual (Math.random, never the engine rng). A FIXED pool of always-mounted
// point lights (2 artillery + 2 flare) sits at intensity 0 while idle and is mutated through refs in useFrame —
// mounting/unmounting lights, or hiding one, changes the light count and recompiles every material.
// frameloop="demand": timers start an effect and invalidate(); useFrame keeps invalidating while one is active.
// None of the lights cast shadows and none flag the shadow map stale.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePresentationSettings } from '../presentation/settings'

const ARTILLERY_SLOTS = 2
const FLARE_SLOTS = 2

/** Point-light intensities (candela, physical units), tuned by eye against the sun key (intensity 2.6).
 *  Artillery uses decay 1 — a flatter fall-off than inverse-square so a flash 30-55" out still reads across the
 *  whole board. Flares use inverse-square so they pool light under themselves instead of tinting everything. */
const ARTILLERY_PEAK = 110
const FLARE_PEAK = 260
const FLASH_TAU_S = 0.12 // exponential decay constant: ~1.5% left after 0.5 s
const ARTILLERY_DECAY = 1
const FLARE_DECAY = 2

const FLARE_RISE_S = 1.6
const FLARE_TYPES = [
  { color: '#ff4a3a', gain: 2.2 }, // red reads dim per unit of intensity, so it gets more
  { color: '#5cff7a', gain: 1.4 },
  { color: '#e8f0ff', gain: 1 },
] as const

type Mode = 'off' | 'normal' | 'demo'

/** `?ambience=demo` fires events every few seconds for quick checking, `?ambience=1` forces it on even under
 *  automation; otherwise it is off whenever `navigator.webdriver` is set so E2E screenshots stay deterministic. */
function readMode(): Mode {
  if (typeof window === 'undefined') return 'off'
  const param = new URLSearchParams(window.location.search).get('ambience')
  if (param === 'demo') return 'demo'
  if (param === '1') return 'normal'
  return typeof navigator !== 'undefined' && navigator.webdriver ? 'off' : 'normal'
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const now = () => performance.now() / 1000

interface ArtillerySlot {
  active: boolean
  start: number
  x: number; y: number; z: number
  secondAt: number // seconds after start of the quick second flash, 0 = single flash
  peak: number
}

interface FlareSlot {
  active: boolean
  start: number
  total: number
  riseS: number
  launch: THREE.Vector3
  apex: THREE.Vector3
  drift: THREE.Vector3
  gain: number
}

/** Soft round glow, white centre to transparent edge — tinted per effect via the sprite material colour. */
function makeGlowTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function BattlefieldAmbience() {
  const invalidate = useThree((s) => s.invalidate)
  const settingOn = usePresentationSettings((s) => s.battlefieldAmbience)
  const lowGraphics = usePresentationSettings((s) => s.lowGraphics)
  const enabled = settingOn && !lowGraphics

  const glowMap = useMemo(makeGlowTexture, [])
  useEffect(() => () => glowMap?.dispose(), [glowMap])

  const artLights = useRef<(THREE.PointLight | null)[]>([])
  const artGlows = useRef<(THREE.Sprite | null)[]>([])
  const flareLights = useRef<(THREE.PointLight | null)[]>([])
  const flareGroups = useRef<(THREE.Group | null)[]>([])
  const flareSprites = useRef<(THREE.Sprite | null)[]>([])
  const flareCores = useRef<(THREE.Mesh | null)[]>([])

  const art = useRef<ArtillerySlot[]>(
    Array.from({ length: ARTILLERY_SLOTS }, () => ({ active: false, start: 0, x: 0, y: 0, z: 0, secondAt: 0, peak: 1 })),
  )
  const flares = useRef<FlareSlot[]>(
    Array.from({ length: FLARE_SLOTS }, () => ({
      active: false, start: 0, total: 1, riseS: FLARE_RISE_S, launch: new THREE.Vector3(), apex: new THREE.Vector3(), drift: new THREE.Vector3(), gain: 1,
    })),
  )

  /** Zero every light and hide every visible source (the lights themselves stay mounted and visible). */
  const reset = () => {
    for (let i = 0; i < ARTILLERY_SLOTS; i++) {
      art.current[i].active = false
      const l = artLights.current[i]
      if (l) l.intensity = 0
      const g = artGlows.current[i]
      if (g) g.visible = false
    }
    for (let i = 0; i < FLARE_SLOTS; i++) {
      flares.current[i].active = false
      const l = flareLights.current[i]
      if (l) l.intensity = 0
      const s = flareSprites.current[i]
      if (s) s.visible = false
      const c = flareCores.current[i]
      if (c) c.visible = false
    }
  }

  const fireArtillery = () => {
    const slots = art.current
    let idx = slots.findIndex((s) => !s.active)
    if (idx < 0) idx = slots[0].start <= slots[1].start ? 0 : 1 // both busy: recycle the older one
    const s = slots[idx]
    // Random point in a 30-55" ring around the board centre, low to the ground.
    const ang = rand(0, Math.PI * 2)
    const r = rand(30, 55)
    s.x = Math.cos(ang) * r
    s.z = Math.sin(ang) * r
    s.y = rand(2, 8)
    s.secondAt = Math.random() < 0.3 ? rand(0.12, 0.25) : 0
    s.peak = rand(0.75, 1.15)
    s.start = now()
    s.active = true
    const light = artLights.current[idx]
    if (light) {
      light.position.set(s.x, s.y, s.z)
      light.color.set(Math.random() < 0.5 ? '#ff9a3c' : '#ffd9a0')
    }
    const glow = artGlows.current[idx]
    if (glow) {
      glow.position.set(s.x, s.y, s.z)
      if (light) (glow.material as THREE.SpriteMaterial).color.copy(light.color)
    }
  }

  const fireFlare = () => {
    const slots = flares.current
    let idx = slots.findIndex((s) => !s.active)
    if (idx < 0) idx = slots[0].start <= slots[1].start ? 0 : 1
    const s = slots[idx]
    // Apex hangs over one of the four board edges, low enough to stay in the usual camera frame; the launch
    // point is further out and near the ground.
    const edge = Math.floor(Math.random() * 4)
    const out = rand(-7, 0)
    const nx = edge === 0 ? 1 : edge === 1 ? -1 : 0
    const nz = edge === 2 ? 1 : edge === 3 ? -1 : 0
    const along = nx !== 0 ? rand(-12, 12) : rand(-20, 20)
    const bx = nx !== 0 ? nx * (22 + out) : along
    const bz = nx !== 0 ? along : nz * (15 + out)
    const launchOut = rand(8, 14)
    s.apex.set(bx, rand(10, 15), bz)
    s.launch.set(bx + nx * launchOut, 1, bz + nz * launchOut)
    const wind = rand(-3, 3)
    s.drift.set(nx !== 0 ? 0 : wind, 0, nx !== 0 ? wind : 0)
    s.riseS = FLARE_RISE_S
    s.total = FLARE_RISE_S + rand(7, 9)
    const type = FLARE_TYPES[Math.floor(Math.random() * FLARE_TYPES.length)]
    s.gain = type.gain
    s.start = now()
    s.active = true
    const light = flareLights.current[idx]
    if (light) light.color.set(type.color)
    const sprite = flareSprites.current[idx]
    if (sprite) (sprite.material as THREE.SpriteMaterial).color.set(type.color)
    const core = flareCores.current[idx]
    if (core) (core.material as THREE.MeshBasicMaterial).color.set(type.color).lerp(new THREE.Color('#ffffff'), 0.6)
  }

  // Scheduling: one self-rescheduling timer per effect kind. A timer that lands while the tab is hidden just
  // skips that event (rAF is throttled then anyway) so nothing piles up.
  useEffect(() => {
    const mode = readMode()
    if (!enabled || mode === 'off') return
    const demo = mode === 'demo'
    const timers: ReturnType<typeof setTimeout>[] = []
    const loop = (fire: () => void, minS: number, maxS: number) => {
      const slot = timers.length
      const tick = () => {
        if (!document.hidden) {
          fire()
          invalidate()
        }
        timers[slot] = setTimeout(tick, rand(minS, maxS) * 1000)
      }
      timers.push(setTimeout(tick, rand(minS, maxS) * 1000))
    }
    loop(fireArtillery, demo ? 1 : 3, demo ? 2 : 9)
    loop(fireFlare, demo ? 4.5 : 15, demo ? 5.5 : 35)
    // Returning to the tab: a finished effect needs one repaint to clear its last lit frame.
    const onVisible = () => invalidate()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      timers.forEach(clearTimeout)
      document.removeEventListener('visibilitychange', onVisible)
      reset()
      invalidate()
    }
    // fireArtillery/fireFlare/reset only touch refs, so they are stable for this effect's purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, invalidate])

  useFrame(() => {
    let busy = false
    const t = now()

    for (let i = 0; i < ARTILLERY_SLOTS; i++) {
      const s = art.current[i]
      const light = artLights.current[i]
      const glow = artGlows.current[i]
      if (!s.active || !light) continue
      const dt = t - s.start
      let env = Math.exp(-dt / FLASH_TAU_S)
      if (s.secondAt > 0 && dt >= s.secondAt) env = Math.max(env, 0.7 * Math.exp(-(dt - s.secondAt) / FLASH_TAU_S))
      if (dt > 0.5 + s.secondAt) {
        s.active = false
        light.intensity = 0
        if (glow) glow.visible = false
        continue
      }
      busy = true
      light.intensity = ARTILLERY_PEAK * s.peak * env
      if (glow) {
        glow.visible = true
        ;(glow.material as THREE.SpriteMaterial).opacity = clamp01(env)
        glow.scale.setScalar(5 + 5 * env)
      }
    }

    for (let i = 0; i < FLARE_SLOTS; i++) {
      const s = flares.current[i]
      const light = flareLights.current[i]
      const group = flareGroups.current[i]
      const sprite = flareSprites.current[i]
      const core = flareCores.current[i]
      if (!s.active || !light || !group) continue
      const dt = t - s.start
      if (dt >= s.total) {
        s.active = false
        light.intensity = 0
        if (sprite) sprite.visible = false
        if (core) core.visible = false
        continue
      }
      busy = true
      if (dt < s.riseS) {
        const u = 1 - (1 - dt / s.riseS) * (1 - dt / s.riseS)
        group.position.lerpVectors(s.launch, s.apex, u)
      } else {
        const k = (dt - s.riseS) / (s.total - s.riseS)
        group.position.copy(s.apex).addScaledVector(s.drift, k)
        group.position.y = s.apex.y * (1 - 0.65 * k)
      }
      // Fade in over 0.5 s, out over the last 1.5 s, with a quick two-sine flicker on top.
      const fade = clamp01(dt / 0.5) * clamp01((s.total - dt) / 1.5)
      const flicker = 1 + 0.12 * Math.sin(dt * 37) + 0.08 * Math.sin(dt * 23 + 1.3)
      light.intensity = FLARE_PEAK * s.gain * fade * flicker
      if (sprite) {
        sprite.visible = true
        ;(sprite.material as THREE.SpriteMaterial).opacity = fade * (0.85 + 0.15 * flicker)
      }
      if (core) {
        core.visible = true
        core.scale.setScalar(fade * flicker)
      }
    }

    if (busy) invalidate()
  })

  return (
    <>
      {Array.from({ length: ARTILLERY_SLOTS }, (_, i) => (
        <group key={`art${i}`}>
          <pointLight
            ref={(el) => {
              artLights.current[i] = el
            }}
            position={[0, 4, 40]}
            intensity={0}
            distance={0}
            decay={ARTILLERY_DECAY}
            color="#ffb060"
          />
          <sprite
            ref={(el) => {
              artGlows.current[i] = el
            }}
            visible={false}
          >
            <spriteMaterial map={glowMap} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        </group>
      ))}
      {Array.from({ length: FLARE_SLOTS }, (_, i) => (
        <group
          key={`flare${i}`}
          ref={(el) => {
            flareGroups.current[i] = el
          }}
          position={[0, 30, 0]}
        >
          <pointLight
            ref={(el) => {
              flareLights.current[i] = el
            }}
            intensity={0}
            distance={0}
            decay={FLARE_DECAY}
            color="#ffffff"
          />
          <sprite
            ref={(el) => {
              flareSprites.current[i] = el
            }}
            scale={[7, 7, 1]}
            visible={false}
          >
            <spriteMaterial map={glowMap} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
          <mesh
            ref={(el) => {
              flareCores.current[i] = el
            }}
            visible={false}
          >
            <sphereGeometry args={[0.3, 12, 8]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
