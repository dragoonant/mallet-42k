// VFX sprite textures. Each sprite is requested from /assets/vfx/sprites/<name>.png (resolved against
// Vite's BASE_URL like the GLB figures, so it works under the Pages subpath). A texture object is handed
// out SYNCHRONOUSLY, pre-painted with a procedural canvas stand-in; when the PNG arrives (or never does)
// the same Texture is swapped in place, so a missing file never breaks the game and nothing has to wait.
import * as THREE from 'three'

export const SPRITE_NAMES = [
  'muzzle_ballistic', 'muzzle_energy', 'smoke_puff_1', 'smoke_puff_2', 'smoke_puff_3', 'fire_blob',
  'explosion_1', 'explosion_2', 'explosion_3', 'shockwave_ring', 'spark', 'glow_orb', 'plasma_orb',
  'beam_core', 'lightning_arc', 'bio_glob', 'warp_wisp', 'debris_chunk', 'scorch_decal',
] as const
export type SpriteName = (typeof SPRITE_NAMES)[number]

/** Strips are 256x64 with U running along the beam; everything else is a square sprite. */
const STRIPS: ReadonlySet<SpriteName> = new Set<SpriteName>(['beam_core', 'lightning_arc'])

/** Art that is neutral/white and meant to be coloured per weapon (material colour multiplies it). Everything
 *  else carries its own colours and is drawn untinted. */
const TINTABLE: ReadonlySet<SpriteName> = new Set<SpriteName>(['muzzle_energy', 'shockwave_ring', 'spark', 'glow_orb', 'beam_core', 'lightning_arc', 'smoke_puff_1', 'smoke_puff_2', 'smoke_puff_3'])
export const isTintable = (name: SpriteName): boolean => TINTABLE.has(name)

export const spriteUrl = (name: string): string => `${import.meta.env.BASE_URL}assets/vfx/sprites/${name}.png`

const cache = new Map<SpriteName, THREE.Texture>()
const loadState = new Map<SpriteName, 'real' | 'procedural'>()

/** Which sprites currently show the real PNG vs the procedural stand-in (gallery / debugging). */
export function spriteSources(): Record<string, 'real' | 'procedural'> {
  return Object.fromEntries(loadState)
}

export function spriteTexture(name: SpriteName): THREE.Texture {
  const hit = cache.get(name)
  if (hit) return hit
  const tex: THREE.Texture = new THREE.CanvasTexture(paintFallback(name))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 2
  cache.set(name, tex)
  loadState.set(name, 'procedural')
  try {
    new THREE.TextureLoader().load(
      spriteUrl(name),
      (loaded) => {
        const img = loaded.image as { width?: number; height?: number } | undefined
        if (!img || !img.width || !img.height) return
        tex.image = loaded.image
        tex.needsUpdate = true
        loadState.set(name, 'real')
      },
      undefined,
      () => { /* missing / undecodable: keep the procedural stand-in */ },
    )
  } catch { /* keep the procedural stand-in */ }
  return tex
}

/** Kick off every sprite load (call once at layer mount so the first volley already has real art). */
export function preloadSprites(): void {
  for (const n of SPRITE_NAMES) spriteTexture(n)
}

// ---------- procedural stand-ins ----------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  return [c, ctx]
}

function radial(ctx: CanvasRenderingContext2D, w: number, h: number, stops: [number, string][], sx = 1, sy = 1): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(sx, sy)
  ctx.translate(-w / 2, -h / 2)
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

// Deterministic pseudo-random so the stand-ins look the same every load.
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function blobs(ctx: CanvasRenderingContext2D, size: number, n: number, seed: number, inner: string, outer: string, spread: number, rMin: number, rMax: number): void {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = r() * spread * size * 0.5
    const x = size / 2 + Math.cos(a) * d
    const y = size / 2 + Math.sin(a) * d
    const rad = (rMin + r() * (rMax - rMin)) * size
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, inner)
    g.addColorStop(1, outer)
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
}

function paintFallback(name: SpriteName): HTMLCanvasElement {
  const S = 128
  if (STRIPS.has(name)) return paintStrip(name)
  const [c, ctx] = canvas(S, S)
  switch (name) {
    case 'muzzle_ballistic': {
      radial(ctx, S, S, [[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,200,90,0.9)'], [1, 'rgba(255,120,20,0)']])
      ctx.fillStyle = 'rgba(255,225,150,0.95)'
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate((i * Math.PI) / 3 + 0.3)
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(S * 0.48, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); ctx.restore()
      }
      break
    }
    case 'muzzle_energy':
      radial(ctx, S, S, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.7)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']])
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); ctx.stroke()
      break
    case 'smoke_puff_1': case 'smoke_puff_2': case 'smoke_puff_3': {
      const seed = name === 'smoke_puff_1' ? 11 : name === 'smoke_puff_2' ? 23 : 37
      blobs(ctx, S, 9, seed, 'rgba(235,235,235,0.55)', 'rgba(235,235,235,0)', 0.7, 0.18, 0.32)
      break
    }
    case 'fire_blob':
      radial(ctx, S, S, [[0, 'rgba(255,255,230,1)'], [0.25, 'rgba(255,200,70,0.95)'], [0.6, 'rgba(255,110,20,0.6)'], [1, 'rgba(180,30,0,0)']])
      break
    case 'explosion_1': case 'explosion_2': case 'explosion_3': {
      const seed = name === 'explosion_1' ? 5 : name === 'explosion_2' ? 17 : 29
      blobs(ctx, S, 10, seed, 'rgba(255,140,40,0.8)', 'rgba(160,30,0,0)', 0.9, 0.2, 0.34)
      radial(ctx, S, S, [[0, 'rgba(255,255,235,1)'], [0.35, 'rgba(255,200,90,0.8)'], [1, 'rgba(255,120,20,0)']], 0.7, 0.7)
      break
    }
    case 'shockwave_ring': {
      const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5)
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.72, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
      break
    }
    case 'spark':
      radial(ctx, S, S, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,240,200,0.9)'], [0.55, 'rgba(255,200,120,0.2)'], [1, 'rgba(255,200,120,0)']])
      break
    case 'glow_orb':
      radial(ctx, S, S, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.65)'], [0.55, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']])
      break
    case 'plasma_orb':
      radial(ctx, S, S, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(190,225,255,0.95)'], [0.65, 'rgba(70,140,255,0.45)'], [1, 'rgba(40,90,255,0)']])
      break
    case 'bio_glob':
      radial(ctx, S, S, [[0, 'rgba(210,255,150,1)'], [0.45, 'rgba(110,220,50,0.95)'], [0.8, 'rgba(40,130,20,0.7)'], [1, 'rgba(20,80,10,0)']])
      ctx.fillStyle = 'rgba(255,255,230,0.8)'; ctx.beginPath(); ctx.ellipse(S * 0.4, S * 0.38, S * 0.08, S * 0.05, -0.6, 0, Math.PI * 2); ctx.fill()
      break
    case 'warp_wisp':
      blobs(ctx, S, 7, 41, 'rgba(210,150,255,0.7)', 'rgba(110,40,200,0)', 0.8, 0.16, 0.3)
      radial(ctx, S, S, [[0, 'rgba(255,235,255,0.9)'], [0.4, 'rgba(180,90,255,0.5)'], [1, 'rgba(110,40,200,0)']], 0.6, 0.6)
      break
    case 'debris_chunk': {
      ctx.fillStyle = 'rgb(110,92,72)'; ctx.beginPath()
      ctx.moveTo(S * 0.2, S * 0.55); ctx.lineTo(S * 0.4, S * 0.2); ctx.lineTo(S * 0.75, S * 0.3); ctx.lineTo(S * 0.82, S * 0.65); ctx.lineTo(S * 0.5, S * 0.82)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(190,170,140,0.6)'; ctx.beginPath(); ctx.moveTo(S * 0.4, S * 0.2); ctx.lineTo(S * 0.75, S * 0.3); ctx.lineTo(S * 0.5, S * 0.45); ctx.closePath(); ctx.fill()
      break
    }
    case 'scorch_decal':
      blobs(ctx, S, 8, 53, 'rgba(14,10,8,0.75)', 'rgba(14,10,8,0)', 0.5, 0.2, 0.36)
      radial(ctx, S, S, [[0, 'rgba(10,8,6,0.8)'], [0.7, 'rgba(10,8,6,0.35)'], [1, 'rgba(10,8,6,0)']])
      break
    default:
      radial(ctx, S, S, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']])
  }
  return c
}

function paintStrip(name: SpriteName): HTMLCanvasElement {
  const W = 256
  const H = 64
  const [c, ctx] = canvas(W, H)
  if (name === 'beam_core') {
    // bright core across the middle, soft edges, faded caps
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,1)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'destination-in'
    const m = ctx.createLinearGradient(0, 0, W, 0)
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.06, 'rgba(0,0,0,1)'); m.addColorStop(0.94, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = m; ctx.fillRect(0, 0, W, H)
    return c
  }
  // lightning_arc: a jagged white line with a soft halo
  const r = rng(77)
  const pts: [number, number][] = [[0, H / 2]]
  for (let x = 24; x < W; x += 24) pts.push([x, H / 2 + (r() - 0.5) * H * 0.55])
  pts.push([W, H / 2])
  for (const [lw, a] of [[14, 0.18], [7, 0.4], [2.5, 1]] as const) {
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
  }
  return c
}
