// Test/dev-only hook: lets Playwright ask "is there terrain mesh at this (x,z)?" for a drawn terrain piece, so
// tests/e2e/terrain-fit.spec.ts can compare the drawn models with the engine's legal ground. Installed only on
// the dev server or a `?scenario=` URL (the same URLs that expose the other e2e hooks); no behaviour change.
import { Box3, DoubleSide, Raycaster, Vector3, type Mesh, type Object3D, type Scene } from 'three'

export interface TerrainProbe {
  ids(): string[]
  /** True once the piece has settled into its final look (GLB fitted, or the procedural fallback drawn). */
  modelled(id: string): boolean
  /** Per point: true when a ray dropped straight down hits terrain mesh with y in [y0, y1] (or ends up inside a closed
   *  mesh that extends above y1). Rubble (instanced) and unfading decals are ignored. */
  solid(id: string, pts: { x: number; z: number }[], y0: number, y1: number): boolean[]
}

export const probeEnabled = (): boolean =>
  import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('scenario'))

export function installTerrainProbe(scene: Scene): () => void {
  const w = window as unknown as { __malletTerrainProbe?: TerrainProbe }
  const groups = () => {
    const out: Record<string, Object3D> = {}
    scene.traverse((o) => { if (typeof o.userData?.terrainId === 'string') out[o.userData.terrainId] = o })
    return out
  }
  w.__malletTerrainProbe = {
    ids: () => Object.keys(groups()),
    modelled(id) {
      let found = false
      groups()[id]?.traverse((o) => { if (o.userData?.fittedModel) found = true })
      return found
    },
    solid(id, pts, y0, y1) {
      const g = groups()[id]
      if (!g) return pts.map(() => false)
      g.updateMatrixWorld(true)
      const meshes: Mesh[] = []
      g.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || m.userData?.noFade) return
        if (new Box3().setFromObject(m).min.y >= y1) return
        meshes.push(m)
      })
      const saved: [{ side: number }, number][] = []
      for (const m of meshes) for (const mat of ([] as { side: number }[]).concat(m.material as never)) { saved.push([mat, mat.side]); mat.side = DoubleSide }
      const ray = new Raycaster()
      const res = pts.map((p) => {
        ray.set(new Vector3(p.x, 50, p.z), new Vector3(0, -1, 0))
        const hits = ray.intersectObjects(meshes, false)
        return hits.some((q) => q.point.y >= y0 && q.point.y <= y1) || hits.filter((q) => q.point.y > y1).length % 2 === 1
      })
      for (const [mat, side] of saved) mat.side = side
      return res
    },
  }
  return () => { delete w.__malletTerrainProbe }
}
