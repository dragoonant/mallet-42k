// Loads the terrain GLBs (public/assets/terrain/ruins) at most once each, WITHOUT suspending: the
// hook reports 'pending' while loading and 'failed' forever if the manifest/file is missing or the
// slug is disabled, so callers can fall back to the procedural look. Geometry/materials/textures
// are shared by every instance (clones copy only the node tree).
import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Group, MeshStandardMaterial, Vector3, type Mesh, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ENABLED_RUIN_MODELS, type RuinSlug } from './ruinModels.config'

type Size3 = [number, number, number]
export interface RuinModel { object: Object3D; size: Size3 }
export type RuinModelState = { status: 'pending' | 'failed' } | { status: 'ready'; model: RuinModel }

type Entry = { status: 'loading' | 'ready' | 'failed'; root?: Object3D; size?: Size3 }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let manifestPromise: Promise<Record<string, { size?: number[] }> | null> | null = null

const base = () => `${import.meta.env.BASE_URL}assets/terrain/ruins/`

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(`${base()}manifest.json`)
        if (!res.ok) return null
        const json = await res.json()
        return json && typeof json === 'object' ? (json as Record<string, { size?: number[] }>) : null
      } catch {
        return null
      }
    })()
  }
  return manifestPromise
}

const validSize = (s: unknown): s is Size3 =>
  Array.isArray(s) && s.length === 3 && s.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)

function request(slug: RuinSlug): Entry {
  let e = cache.get(slug)
  if (e) return e
  e = { status: 'loading' }
  cache.set(slug, e)
  const entry = e
  if (!ENABLED_RUIN_MODELS.includes(slug)) {
    entry.status = 'failed'
    return entry
  }
  try {
    Promise.all([loadManifest(), new GLTFLoader().loadAsync(`${base()}${slug}.glb`)])
      .then(([manifest, gltf]) => {
        if (!manifest || !manifest[slug]) throw new Error('no manifest entry')
        const scene = gltf.scene
        scene.traverse((o) => {
          const mesh = o as Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = true // inert when the light doesn't cast (Low graphics)
          mesh.receiveShadow = true
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (mat instanceof MeshStandardMaterial) mat.metalness = 0 // no env map: metal reads black
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
