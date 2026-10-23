// Poses a pre-made GLB figure (origin at base centre, y up, 1 unit = 1 inch, front = +Z — the same
// facing the procedural figures use). fitGlbToBase corrects sculpts baked at the wrong size or facing
// (glbModels.ts GLB_FIGURE_ADJUST) on the private clone, under the pose group. The GLB is one rigid mesh, so poses are
// whole-body transforms: walk bob, shoot recoil, melee lunge, hit flinch, death topple/fade/sink.
import { useEffect, useRef } from 'react'
import { Box3, type Group, type Mesh, type Object3D } from 'three'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import { useThree } from '@react-three/fiber'
import { applyGlbPaint } from './glbPaint'
import { paintKey, type ArmyPaint } from './paint'
import type { Pose } from './types'
import { GLB_FIGURE_ADJUST } from './glbModels'

/** Fits a GLB instance to its datasheet: the baked `base` disc is stretched to the datasheet's base radii (so an oval
 *  baked the wrong way round, or a round disc under an oval-based unit, matches the footprint the rules use) and the
 *  `figure` node gets its GLB_FIGURE_ADJUST scale/yaw, kept standing on the disc. Idempotent: the baked transforms are
 *  remembered on first use so re-running (StrictMode, prop changes) recomputes from them. */
export function fitGlbToBase(object: Object3D, slug: string | undefined, radiusX: number, radiusZ: number): void {
  const base = object.getObjectByName('base') as Mesh | undefined
  const figure = object.getObjectByName('figure')
  let baseTop = 0
  if (base) {
    const geom = base.geometry
    if (!geom.boundingBox) geom.computeBoundingBox()
    const bb = geom.boundingBox ?? new Box3()
    const bx = bb.max.x - bb.min.x
    const bz = bb.max.z - bb.min.z
    const orig = (base.userData.bakedScale ??= base.scale.clone())
    base.scale.set(bx > 0 ? (2 * radiusX) / bx : orig.x, orig.y, bz > 0 ? (2 * radiusZ) / bz : orig.z)
    baseTop = bb.max.y
  }
  if (figure) {
    const adj = (slug && GLB_FIGURE_ADJUST[slug]) || {}
    const scale = adj.scale ?? 1
    const orig = (figure.userData.baked ??= { scale: figure.scale.clone(), rotY: figure.rotation.y, posY: figure.position.y })
    figure.scale.set(orig.scale.x * scale, orig.scale.y * scale, orig.scale.z * scale)
    figure.rotation.y = orig.rotY + (adj.yaw ?? 0) * (Math.PI / 2)
    // the figure mesh starts at the top of the baked disc; scaling about the origin would lift it off, so pull it back down
    figure.position.y = orig.posY - baseTop * (scale - 1)
  }
}

export function GlbBody({ object, slug, radiusX, radiusZ, pose, seed, faction, paint }: { object: Object3D; slug?: string; radiusX: number; radiusZ: number; pose: Pose; seed: number; faction: string; paint?: ArmyPaint }) {
  const bodyRef = useRef<Group>(null!)
  const fade = useMaterialFader(bodyRef)

  // Put the (shared-resource) clone into the pose group once per instance.
  useEffect(() => {
    const body = bodyRef.current
    fitGlbToBase(object, slug, radiusX, radiusZ)
    body.add(object)
    return () => {
      body.remove(object)
    }
  }, [object, slug, radiusX, radiusZ])

  // Army painter: recolour this instance's materials (clones, never the shared cache); no-op when unpainted.
  const invalidate = useThree((s) => s.invalidate)
  const pKey = paintKey(paint)
  useEffect(() => {
    const restore = applyGlbPaint(object, faction, paint)
    invalidate()
    return restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, faction, pKey, invalidate])

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    if (!body) return
    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    if (pose !== 'death') fade(1)
    switch (pose) {
      case 'idle':
        break
      case 'walk': {
        const phase = since * 8 + seed
        body.position.y = 0.05 * Math.abs(Math.sin(phase))
        body.rotation.z = 0.04 * Math.sin(phase)
        body.rotation.x = 0.05
        break
      }
      case 'shoot': {
        const c = (since * 3) % 1
        const kick = c < 0.15 ? 1 - c / 0.15 : 0
        body.position.z = -0.08 * kick
        body.rotation.x = -0.04 * kick
        break
      }
      case 'melee': {
        const c = (since * 2.2 + seed * 0.1) % 1
        const lunge = c < 0.3 ? Math.sin((c / 0.3) * Math.PI) : 0
        body.position.z = 0.25 * lunge
        body.rotation.x = 0.12 * lunge
        break
      }
      case 'hit': {
        const decay = Math.exp(-since * 11)
        body.position.x = 0.1 * Math.sin(since * 45) * decay
        body.position.z = -0.15 * decay
        break
      }
      case 'death': {
        body.rotation.z = -easeOut(since / 1.2) * (Math.PI / 2) * 0.9
        const sink = clamp01((since - 1.2) / 0.5)
        body.position.y = -sink * 0.6
        fade(1 - sink)
        break
      }
    }
  })

  return <group ref={bodyRef} />
}
