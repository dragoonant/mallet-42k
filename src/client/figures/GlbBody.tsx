// Poses a pre-made GLB figure (origin at base centre, y up, 1 unit = 1 inch, front = +Z — the same
// facing the procedural figures use, so no extra rotation). The GLB is one rigid mesh, so poses are
// whole-body transforms: walk bob, shoot recoil, melee lunge, hit flinch, death topple/fade/sink.
import { useEffect, useRef } from 'react'
import type { Group, Object3D } from 'three'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import { useThree } from '@react-three/fiber'
import { applyGlbPaint } from './glbPaint'
import { paintKey, type ArmyPaint } from './paint'
import type { Pose } from './types'

export function GlbBody({ object, pose, seed, faction, paint }: { object: Object3D; pose: Pose; seed: number; faction: string; paint?: ArmyPaint }) {
  const bodyRef = useRef<Group>(null!)
  const fade = useMaterialFader(bodyRef)

  // Put the (shared-resource) clone into the pose group once per instance.
  useEffect(() => {
    const body = bodyRef.current
    body.add(object)
    return () => {
      body.remove(object)
    }
  }, [object])

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
