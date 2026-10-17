// Loads the terrain GLBs (public/assets/terrain/ruins) at most once each, WITHOUT suspending: the
// hook reports 'pending' while loading and 'failed' forever if the manifest/file is missing or the
// slug is disabled, so callers can fall back to the procedural look. Geometry/materials/textures
// are shared by every instance (clones copy only the node tree).
import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, CanvasTexture, Color, Group, MeshStandardMaterial, Vector3, type Mesh, type Object3D, type Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ENABLED_RUIN_MODELS } from './ruinModels.config'
import type { RuinCatalogEntry } from './ruinFit'
import { LEGACY_TERRAIN_SLUGS, NEW_TERRAIN_SLUGS } from './terrainCatalog'

type RuinSlug = string
type ManifestEntry = { size?: number[]; shape?: string; cornerTurns?: number }

type Size3 = [number, number, number]
export interface RuinModel { object: Object3D; size: Size3 }
export type RuinModelState = { status: 'pending' | 'failed' } | { status: 'ready'; model: RuinModel }

type Entry = { status: 'loading' | 'ready' | 'failed'; root?: Object3D; size?: Size3 }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let manifestPromise: Promise<Record<string, ManifestEntry> | null> | null = null

const base = () => `${import.meta.env.BASE_URL}assets/terrain/ruins/`

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(`${base()}manifest.json`)
        if (!res.ok) return null
        const json = await res.json()
        return json && typeof json === 'object' ? (json as Record<string, ManifestEntry>) : null
      } catch {
        return null
      }
    })()
  }
  return manifestPromise
}

// Colour unification (like whirr-machine's tintedMaterial): the GLB albedos differ (bluish, dark, sandy), so
// every ruin's baked albedo is desaturated toward grey, brought to one mean brightness and multiplied by one
// shared weathered-rockcrete tint, via a canvas re-bake (survives material clones, e.g. the occluder fade).
const RUIN_TINT: [number, number, number] = [1.05, 1.0, 0.92]
const RUIN_KEEP_SAT = 0.25 // fraction of the baked saturation kept
const RUIN_CONTRAST = 0.6 // scorch/soot streaks are pulled toward the mean (1 = untouched)
const RUIN_TARGET_LUMA = 0.5 // mean sRGB brightness every ruin is normalised to (before the tint)
const rebaked = new Map<Texture, Texture>()

function unifyTexture(tex: Texture): Texture {
  const hit = rebaked.get(tex)
  if (hit) return hit
  let out = tex
  try {
    const img = tex.image as CanvasImageSource & { width: number; height: number }
    const w = img.width, h = img.height
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (ctx && w > 0 && h > 0) {
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, w, h)
      const px = data.data
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
      const mean = sum / (px.length / 4) / 255
      const gain = Math.min(1.8, Math.max(0.6, RUIN_TARGET_LUMA / Math.max(mean, 0.02)))
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
        const lc = mean * 255 + (l - mean * 255) * RUIN_CONTRAST
        for (let c = 0; c < 3; c++) {
          const v = (lc + (px[i + c] - l) * RUIN_KEEP_SAT) * gain * RUIN_TINT[c]
          px[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
        }
      }
      ctx.putImageData(data, 0, 0)
      const t = new CanvasTexture(cv)
      t.flipY = tex.flipY
      t.colorSpace = tex.colorSpace
      t.wrapS = tex.wrapS
      t.wrapT = tex.wrapT
      t.anisotropy = tex.anisotropy
      t.channel = tex.channel
      out = t
    }
  } catch {
    out = tex // tainted/unsupported image: keep the baked albedo
  }
  rebaked.set(tex, out)
  return out
}

const unified = new WeakSet<object>()
function unifyMaterial(mat: MeshStandardMaterial) {
  if (unified.has(mat)) return
  unified.add(mat)
  if (mat.map) mat.map = unifyTexture(mat.map)
  else {
    const hsl = { h: 0, s: 0, l: 0 }
    mat.color.getHSL(hsl)
    mat.color.setHSL(hsl.h, hsl.s * RUIN_KEEP_SAT, Math.min(0.6, Math.max(0.25, hsl.l)))
    mat.color.multiply(new Color(RUIN_TINT[0], RUIN_TINT[1], RUIN_TINT[2]).convertSRGBToLinear())
  }
  mat.needsUpdate = true
}

const isEnabledSlug = (slug: string): boolean =>
  (ENABLED_RUIN_MODELS as readonly string[]).includes(slug) ||
  LEGACY_TERRAIN_SLUGS.includes(slug) ||
  Object.values(NEW_TERRAIN_SLUGS).some((l) => l.includes(slug))

const validSize = (s: unknown): s is Size3 =>
  Array.isArray(s) && s.length === 3 && s.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)

function request(slug: RuinSlug): Entry {
  let e = cache.get(slug)
  if (e) return e
  e = { status: 'loading' }
  cache.set(slug, e)
  const entry = e
  // A slug is drawable when ruinModels.config lists it or it is declared in a terrainCatalog variant pool
  // (so adding a variant slug there is the only edit needed).
  if (!isEnabledSlug(slug)) {
    entry.status = 'failed'
    return entry
  }
  try {
    Promise.all([loadManifest(), new GLTFLoader().loadAsync(`${base()}${slug}.glb`)])
      .then(([manifest, gltf]) => {
        if (!manifest || !manifest[slug]) throw new Error('no manifest entry')
        const scene = gltf.scene
        // The painted v5 variants keep their own colours; only the older grey-resin GLBs get the shared tint.
        const painted = Object.values(NEW_TERRAIN_SLUGS).some((l) => l.includes(slug))
        scene.traverse((o) => {
          const mesh = o as Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = true // inert when the light doesn't cast (Low graphics)
          mesh.receiveShadow = true
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (mat instanceof MeshStandardMaterial) {
              mat.metalness = 0 // no env map: metal reads black
              if (!painted) unifyMaterial(mat)
            }
          }
        })
        // Normalise to a bottom-centre origin from the measured box so a slightly-off GLB origin
        // cannot misplace the piece. The manifest size is only the fallback for a degenerate box.
        const box = new Box3().setFromObject(scene)
        const m = box.getSize(new Vector3())
        const measured: Size3 = [m.x, m.y, m.z]
        const size = validSize(measured) ? measured : manifest[slug].size
        if (!validSize(size)) throw new Error('bad size')
        const centre = box.getCenter(new Vector3())
        scene.position.set(-centre.x, -box.min.y, -centre.z)
        const root = new Group()
        root.add(scene)
        entry.root = root
        entry.size = size
        entry.status = 'ready'
      })
      .catch(() => {
        entry.status = 'failed'
      })
      .finally(() => listeners.forEach((l) => l()))
  } catch {
    entry.status = 'failed'
  }
  return entry
}

/** State of a slug's model: 'pending' while loading (draw nothing yet), 'failed' (draw the
 *  procedural look), or 'ready' with a private node-tree clone. Re-renders once when the load
 *  settles and wakes the demand frameloop / shadow map so the swap is actually drawn. */
export function useRuinModel(slug: RuinSlug | undefined): RuinModelState {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const [, setTick] = useState(0)
  const entry = slug ? request(slug) : undefined
  useEffect(() => {
    if (!slug) return
    const l = () => {
      setTick((n) => n + 1)
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [slug, gl, invalidate])
  const root = entry?.status === 'ready' ? entry.root : undefined
  const size = entry?.size
  const model = useMemo(() => (root && size ? { object: root.clone(true), size } : null), [root, size])
  if (!slug || !entry || entry.status === 'failed') return { status: 'failed' }
  return model ? { status: 'ready', model } : { status: 'pending' }
}

/** Like useRuinModel for a fixed list of slugs (e.g. a variant pool): one subscription, one state per slug. */
export function useRuinModelSet(slugs: readonly RuinSlug[]): RuinModelState[] {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const [, setTick] = useState(0)
  const key = slugs.join('|')
  const entries = slugs.map((slug) => request(slug))
  useEffect(() => {
    const l = () => {
      setTick((n) => n + 1)
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [key, gl, invalidate])
  const ready = entries.map((e) => (e.status === 'ready' ? e.root : undefined))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const models = useMemo(() => entries.map((e) => (e.status === 'ready' && e.root && e.size ? { object: e.root.clone(true), size: e.size } : null)), [key, ...ready])
  return entries.map((e, i): RuinModelState => (e.status === 'failed' ? { status: 'failed' } : models[i] ? { status: 'ready', model: models[i]! } : { status: 'pending' }))
}

let catalogCache: RuinCatalogEntry[] | null = null

/** Enabled manifest entries usable for ruin footprints (shape-tagged ones, plus the legacy named
 *  ruin models), or null while the manifest is loading. [] when the manifest is missing. */
export function useRuinCatalog(): readonly RuinCatalogEntry[] | null {
  const [catalog, setCatalog] = useState<RuinCatalogEntry[] | null>(catalogCache)
  useEffect(() => {
    if (catalogCache) return
    let live = true
    loadManifest().then((m) => {
      const enabled = ENABLED_RUIN_MODELS as readonly string[]
      const list: RuinCatalogEntry[] = []
      for (const [slug, e] of Object.entries(m ?? {})) {
        if (!enabled.includes(slug)) continue
        const shape = e.shape === 'corner' || e.shape === 'rect' ? e.shape : undefined
        if (!shape && !['ruin-corner', 'ruin-facade', 'ruin-small', 'ruin-tall'].includes(slug)) continue
        list.push({ slug, shape, size: e.size, wallOnly: /-wall-\d+$/.test(slug) || slug === 'ruin-facade', cornerTurns: Number.isInteger(e.cornerTurns) ? (((e.cornerTurns as number) % 4) + 4) % 4 : 0 })
      }
      catalogCache = list
      if (live) setCatalog(list)
    })
    return () => {
      live = false
    }
  }, [])
  return catalog
}
