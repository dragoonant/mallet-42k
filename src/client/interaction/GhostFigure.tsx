// A translucent "ghost" of a model's real figure standing on its true-size base, for placement previews
// (deployment drafts, drag/hover previews, move destinations). The ordinary <Figure> is mounted once per model
// id and only its position/facing props change afterwards, so a pointer move never re-creates a GLB instance.
// Its materials are swapped for private translucent clones the first time they are seen (shared materials are
// never touched — see figures/shared.tsx), shadows and raycasting are switched off, and a placement that is not
// legal gets a red tint. Drawn in low graphics too: only a handful of ghosts exist, and only while placing.
import { memo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, type Group, type Material, type Mesh, type Object3D } from 'three'
import type { GameState, Model } from '@/engine'
import { Figure } from '../figures'

const GHOST_OPACITY = 0.55
const BAD_COLOR = new Color('#ff3b3b')
const BAD_MIX = 0.6

export interface GhostSpec {
  datasheetId: string
  modelType: string
  faction: string
  seat: 'A' | 'B'
}

/** Figure inputs for each of `models` (a bodyguard + attached leader are two datasheets), keyed by model id. */
export function ghostSpecs(state: GameState, models: readonly Model[]): Record<string, GhostSpec> {
  const out: Record<string, GhostSpec> = {}
  for (const m of models) {
    const unit = state.units[m.unitId]
    const faction = unit ? state.players[unit.player]?.faction : undefined
    if (!unit || !faction) continue
    out[m.id] = { datasheetId: unit.datasheetId, modelType: m.datasheetModelId, faction, seat: unit.player }
  }
  return out
}

const noRaycast = () => undefined

type GhostMat = Material & { color?: Color; opacity: number; transparent: boolean; depthWrite: boolean }

function ghostify(root: Object3D, bad: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh || !mesh.material) return
    if (!mesh.userData.__ghost) {
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = m.clone() as GhostMat
        c.onBeforeCompile = m.onBeforeCompile // clone() drops the army-painter shader patch
        c.customProgramCacheKey = m.customProgramCacheKey
        c.transparent = true
        c.opacity = GHOST_OPACITY
        c.depthWrite = false
        if (c.color) c.userData.baseColor = c.color.clone()
        return c
      })
      mesh.material = Array.isArray(mesh.material) ? own : own[0]
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = noRaycast
      mesh.userData.__ghost = true
      mesh.userData.__bad = undefined
    }
    if (mesh.userData.__bad === bad) return
    mesh.userData.__bad = bad
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const gm = m as GhostMat
      const base = gm.userData.baseColor as Color | undefined
      if (gm.color && base) gm.color.copy(base).lerp(BAD_COLOR, bad ? BAD_MIX : 0)
    }
  })
}

export const GhostFigure = memo(function GhostFigure({
  spec,
  modelId,
  x,
  y,
  z,
  facing,
  bad,
}: {
  spec: GhostSpec
  modelId: string
  x: number
  y: number
  z: number
  facing: number
  bad: boolean
}) {
  const ref = useRef<Group>(null!)
  // The GLB (loaded async) and the procedural body mount after this component does: re-check every rendered frame.
  // A traversal of one figure's few dozen nodes is far cheaper than the frame it rides on, and frames only render
  // while something is moving (demand frameloop).
  useFrame(() => {
    if (ref.current) ghostify(ref.current, bad)
  })
  return (
    <group ref={ref}>
      <Figure datasheetId={spec.datasheetId} modelId={spec.modelType} variantKey={modelId} faction={spec.faction} seat={spec.seat} position={[x, y, z]} rotationY={facing} pose="idle" />
    </group>
  )
})
