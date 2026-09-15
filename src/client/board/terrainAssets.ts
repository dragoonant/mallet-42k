// CC0 PBR textures and low-poly models from Poly Haven, used to texture the battle mat and
// terrain meshes. Purely presentational — see public/assets/terrain/CREDITS.md for asset credits.
// Loaded via drei's useTexture/useGLTF, which suspend: callers must render inside
// <Suspense fallback={null}> so the scene never blanks while an asset streams in.
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'

const BASE = import.meta.env.BASE_URL + 'assets/terrain/'

export interface PbrUrls {
  map: string
  normalMap: string
  roughnessMap: string
}

export const GROUND_URLS: PbrUrls = {
  map: BASE + 'ground/diff_1k.jpg',
  normalMap: BASE + 'ground/nor_gl_1k.jpg',
  roughnessMap: BASE + 'ground/rough_1k.jpg',
}

export const BRICK_URLS: PbrUrls = {
  map: BASE + 'brick/diff_1k.jpg',
  normalMap: BASE + 'brick/nor_gl_1k.jpg',
  roughnessMap: BASE + 'brick/rough_1k.jpg',
}

export const CONCRETE_URLS: PbrUrls = {
  map: BASE + 'concrete/diff_1k.jpg',
  normalMap: BASE + 'concrete/nor_gl_1k.jpg',
  roughnessMap: BASE + 'concrete/rough_1k.jpg',
}

export const METAL_URLS: PbrUrls = {
  map: BASE + 'metal/diff_1k.jpg',
  normalMap: BASE + 'metal/nor_gl_1k.jpg',
  roughnessMap: BASE + 'metal/rough_1k.jpg',
}

export const BARRIER_MODEL_URL = BASE + 'barrier/concrete_road_barrier_02_1k.gltf'
export const ROCK_MODEL_URLS = [
  BASE + 'rocks/moon_rock_02/moon_rock_02_1k.gltf',
  BASE + 'rocks/moon_rock_03/moon_rock_03_1k.gltf',
]

useGLTF.preload(BARRIER_MODEL_URL)
for (const url of ROCK_MODEL_URLS) useGLTF.preload(url)

export interface PbrTextures {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
}

/** Loads a {map,normalMap,roughnessMap} set, tags the diffuse map sRGB, and enables repeat
 *  wrapping on all three. The returned textures are drei-cached by URL (shared across callers) —
 *  clone them (see `cloneRepeat`) before setting an instance-specific `.repeat`. */
export function useTiledPBR(urls: PbrUrls): PbrTextures {
  const [map, normalMap, roughnessMap] = useTexture([urls.map, urls.normalMap, urls.roughnessMap])
  map.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
  }
  return { map, normalMap, roughnessMap }
}

/** Clones a tiled PBR texture set so `.repeat` can be set per mesh instance without fighting
 *  other users of the same cached texture. */
export function cloneRepeat(textures: PbrTextures, repeatX: number, repeatY: number): PbrTextures {
  const clone = (t: THREE.Texture) => {
    const c = t.clone()
    c.needsUpdate = true
    c.repeat.set(Math.max(repeatX, 0.01), Math.max(repeatY, 0.01))
    return c
  }
  return { map: clone(textures.map), normalMap: clone(textures.normalMap), roughnessMap: clone(textures.roughnessMap) }
}

/** Bounding-box width (x) and depth (z) of a board-space polygon, for scaling texture repeat. */
export function polygonFootprintSize(polygon: { x: number; z: number }[]): { width: number; depth: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { width: Math.max(maxX - minX, 0.01), depth: Math.max(maxZ - minZ, 0.01) }
}
