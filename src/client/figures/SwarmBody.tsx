// Swarm rig for the Canoptek Scarab model: a loose handful of small metal beetles scuttling on one base,
// rather than a single humanoid. One "model" in the engine is one base, so the swarm is purely visual
// dressing — the beetles never carry rules, they just make a Scarab base read as a cloud of bugs and not
// as a very small soldier. Authored at unit height like every other body (Figure scales the group).
import { GBox, GSphere, StdMat } from './shared'
import { useRef } from 'react'
import type { Group } from 'three'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import type { BodyProps } from './types'

const BEETLES = 6
const GOLDEN_ANGLE = 2.399963

/** Fixed layout: a sunflower spiral so beetles never overlap and the cluster fills the base evenly. */
const SPOTS = Array.from({ length: BEETLES }, (_, i) => {
  const r = 0.2 + 0.4 * Math.sqrt((i + 0.5) / BEETLES)
  const a = i * GOLDEN_ANGLE
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: a * 2.1 }
})

export function SwarmBody({ colors, pose, seed }: BodyProps) {
  const bodyRef = useRef<Group>(null!)
  const bugRefs = useRef<(Group | null)[]>([])
  const fade = useMaterialFader(bodyRef)

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    if (!body) return
    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    if (pose !== 'death') fade(1)

    // Death: the whole cloud tips over and sinks; the individual bugs flip onto their backs.
    const topple = pose === 'death' ? easeOut(since / 0.9) : 0
    const sink = pose === 'death' ? clamp01((since - 1) / 0.5) : 0
    if (pose === 'death') {
      body.position.y = -sink * 0.3
      fade(1 - sink)
    }
    if (pose === 'hit') {
      const decay = Math.exp(-since * 11)
      body.position.x = 0.04 * Math.sin(since * 45) * decay
    }
    if (pose === 'melee') {
      const cyclePhase = (since * 2.4 + seed * 0.1) % 1
      body.position.z = 0.1 * (cyclePhase < 0.3 ? Math.sin((cyclePhase / 0.3) * Math.PI) : 0)
    }

    const fast = pose === 'walk' ? 2.4 : pose === 'melee' ? 1.8 : 1
    SPOTS.forEach((spot, i) => {
      const bug = bugRefs.current[i]
      if (!bug) return
      const phase = t * 7 * fast + seed + i * 1.7
      const amp = pose === 'walk' ? 0.05 : pose === 'melee' ? 0.07 : 0.015
      bug.position.set(spot.x + amp * Math.sin(phase * 0.9), Math.max(0, 0.03 * Math.sin(phase * 1.3)) * (pose === 'melee' ? 2.5 : 1), spot.z + amp * Math.cos(phase))
      bug.rotation.set(0, spot.yaw + 0.25 * Math.sin(phase * 0.5), topple * Math.PI * (i % 2 ? 1 : -1) * 0.9)
    })
  })

  return (
    <group ref={bodyRef}>
      {SPOTS.map((spot, i) => (
        <group key={i} ref={(g) => { bugRefs.current[i] = g }} position={[spot.x, 0, spot.z]} scale={1.5}>
          {/* shell */}
          <mesh position={[0, 0.07, 0]}>
            <GBox args={[0.17, 0.08, 0.24]} />
            <StdMat color={colors.primary} roughness={0.4} metalness={0.55} />
          </mesh>
          {/* gold stripe down the back, so each bug catches the light the way the warriors' trim does */}
          <mesh position={[0, 0.115, 0]}>
            <GBox args={[0.05, 0.015, 0.2]} />
            <StdMat color={colors.trim} roughness={0.35} metalness={0.7} />
          </mesh>
          {/* leg skirt: a wide, low plate under the shell reads as a row of legs at tabletop zoom */}
          <mesh position={[0, 0.022, 0]}>
            <GBox args={[0.26, 0.03, 0.18]} />
            <StdMat color={colors.metal} roughness={0.5} metalness={0.6} />
          </mesh>
          {/* glowing eyes */}
          <mesh position={[-0.045, 0.08, 0.125]}>
            <GSphere args={[0.022, 6, 5]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0.045, 0.08, 0.125]}>
            <GSphere args={[0.022, 6, 5]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
