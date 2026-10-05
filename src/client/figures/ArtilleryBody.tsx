// Emplaced gun with its crew, for the Astra Militarum Field Ordnance Battery. Authored in the same unit-height
// space as the other bodies but wider than tall: the unit sits on a 100mm base, so the gun, its splinter shield,
// wheels and a pair of crew fill the disc. The gun points along +Z like every weapon in the kit.
import { useRef } from 'react'
import type { Group } from 'three'
import { GBox, GCylinder, GSphere, StdMat } from './shared'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import type { ArtilleryConfig, BodyProps } from './types'

const SKIN = '#c9a074'
const GLOW = '#59c8ff'

/** A chunky crew figure: legs block, torso block, arms reaching forward, bare face under a helmet. */
function Crew({ colors, x, z, yaw }: { colors: BodyProps['colors']; x: number; z: number; yaw: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.14, 0]}>
        <GBox args={[0.2, 0.28, 0.14]} />
        <StdMat color={colors.primary} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <GBox args={[0.26, 0.24, 0.17]} />
        <StdMat color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <GBox args={[0.28, 0.04, 0.19]} />
        <StdMat color={colors.trim} roughness={0.5} />
      </mesh>
      <mesh position={[-0.17, 0.4, 0.04]} rotation={[-0.5, 0, 0]}>
        <GBox args={[0.06, 0.2, 0.06]} />
        <StdMat color={colors.secondary} roughness={0.6} />
      </mesh>
      <mesh position={[0.17, 0.4, 0.04]} rotation={[-0.5, 0, 0]}>
        <GBox args={[0.06, 0.2, 0.06]} />
        <StdMat color={colors.secondary} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <GSphere args={[0.12, 12, 8]} />
        <StdMat color={SKIN} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.64, 0]}>
        <GSphere args={[0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <StdMat color={colors.primary} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.645, 0]}>
        <GCylinder args={[0.15, 0.15, 0.02, 12]} />
        <StdMat color={colors.metal} roughness={0.55} metalness={0.3} />
      </mesh>
    </group>
  )
}

function Wheel({ colors, x }: { colors: BodyProps['colors']; x: number }) {
  return (
    <group position={[x, 0.28, 0.05]} rotation={[0, 0, Math.PI / 2]}>
      <mesh>
        <GCylinder args={[0.28, 0.28, 0.1, 14]} />
        <StdMat color="#2a2c31" roughness={0.8} />
      </mesh>
      <mesh position={[0, x > 0 ? 0.04 : -0.04, 0]}>
        <GCylinder args={[0.16, 0.16, 0.04, 10]} />
        <StdMat color={colors.metal} roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  )
}

export function ArtilleryBody({ config, colors, pose, seed }: BodyProps & { config: ArtilleryConfig }) {
  const bodyRef = useRef<Group>(null!)
  const gunRef = useRef<Group>(null!)
  const crewRef = useRef<Group>(null!)
  const fade = useMaterialFader(bodyRef)

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    const gun = gunRef.current
    const crew = crewRef.current
    if (!body || !gun || !crew) return

    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    gun.position.set(0, 0.58, 0.1)
    gun.rotation.set(0, 0, 0)
    crew.position.set(0, 0, 0)
    crew.rotation.set(0, 0, 0)

    if (pose !== 'death') fade(1)

    switch (pose) {
      case 'idle':
        crew.position.y = 0.01 * Math.sin(t * 2 + seed)
        break
      case 'walk':
        // Hauled across the table: a gentle bounce and rock; the gun does not roll on its own.
        body.position.y = 0.025 * Math.abs(Math.sin(since * 7 + seed))
        body.rotation.z = 0.03 * Math.sin(since * 7 + seed)
        crew.position.z = 0.04 * Math.sin(since * 7 + seed)
        break
      case 'shoot': {
        const cyclePhase = (since * 2.2) % 1
        const kick = cyclePhase < 0.18 ? 1 - cyclePhase / 0.18 : 0
        gun.position.z = 0.1 - 0.18 * kick // barrel slides back on recoil
        body.position.z = -0.04 * kick
        gun.rotation.x = -0.05 * kick
        crew.rotation.x = 0.06 * kick
        break
      }
      case 'melee': {
        const cyclePhase = (since * 2.2 + seed * 0.1) % 1
        const lunge = cyclePhase < 0.3 ? Math.sin((cyclePhase / 0.3) * Math.PI) : 0
        crew.position.z = 0.15 * lunge
        crew.rotation.y = 0.2 * Math.sin(cyclePhase * Math.PI * 2)
        break
      }
      case 'hit': {
        const decay = Math.exp(-since * 11)
        body.position.x = 0.04 * Math.sin(since * 40) * decay
        body.position.z = -0.06 * decay
        body.rotation.z = 0.08 * decay
        break
      }
      case 'death': {
        const topple = easeOut(since / 1.2)
        body.rotation.z = -topple * (Math.PI / 2) * 0.35
        const sink = clamp01((since - 1.2) / 0.5)
        body.position.y = -sink * 0.5
        fade(1 - sink)
        break
      }
    }
  })

  const rack = config.barrel === 'rocket-rack'

  return (
    <group ref={bodyRef}>
      {/* wheels and axle */}
      <Wheel colors={colors} x={-0.62} />
      <Wheel colors={colors} x={0.62} />
      <mesh position={[0, 0.28, 0.05]} rotation={[0, 0, Math.PI / 2]}>
        <GCylinder args={[0.04, 0.04, 1.3, 8]} />
        <StdMat color={colors.metal} roughness={0.5} metalness={0.6} />
      </mesh>

      {/* split trail legs spread out behind */}
      <mesh position={[-0.2, 0.1, -0.55]} rotation={[0.12, 0.28, 0]}>
        <GBox args={[0.09, 0.08, 0.9]} />
        <StdMat color={colors.primary} roughness={0.6} />
      </mesh>
      <mesh position={[0.2, 0.1, -0.55]} rotation={[0.12, -0.28, 0]}>
        <GBox args={[0.09, 0.08, 0.9]} />
        <StdMat color={colors.primary} roughness={0.6} />
      </mesh>

      {/* cradle and splinter shield */}
      <mesh position={[0, 0.42, 0.1]}>
        <GBox args={[0.34, 0.2, 0.4]} />
        <StdMat color={colors.primary} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.62, 0.34]}>
        <GBox args={[0.9, 0.5, 0.06]} />
        <StdMat color={colors.secondary} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.9, 0.34]}>
        <GBox args={[0.9, 0.05, 0.08]} />
        <StdMat color={colors.trim} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0.28, 0.66, 0.38]}>
        <GBox args={[0.2, 0.2, 0.02]} />
        <StdMat color={colors.decal} roughness={0.7} />
      </mesh>

      <group ref={gunRef} position={[0, 0.58, 0.1]}>
        {rack ? (
          <group position={[0, 0.02, 0.1]} rotation={[-0.25, 0, 0]}>
            {[-0.11, 0.11].map((x) =>
              [-0.1, 0.1].map((y) => (
                <group key={`${x}${y}`} position={[x, y, 0.3]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <GCylinder args={[0.075, 0.075, 0.9, 10]} />
                    <StdMat color={colors.metal} roughness={0.45} metalness={0.6} />
                  </mesh>
                  <mesh position={[0, 0, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
                    <GCylinder args={[0.05, 0.05, 0.03, 8]} />
                    <StdMat color="#ff7a3a" emissive="#ff7a3a" emissiveIntensity={0.9} />
                  </mesh>
                </group>
              )),
            )}
            <mesh position={[0, 0, 0.1]}>
              <GBox args={[0.42, 0.42, 0.14]} />
              <StdMat color={colors.primary} roughness={0.55} />
            </mesh>
          </group>
        ) : (
          <group rotation={[-0.15, 0, 0]}>
            <mesh position={[0, 0, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.06, 0.08, 1.1, 10]} />
              <StdMat color={colors.metal} roughness={0.4} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0, 1.02]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.095, 0.095, 0.12, 10]} />
              <StdMat color={colors.metal} roughness={0.35} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.075, 0.075, 0.03, 10]} />
              <StdMat color={GLOW} emissive={GLOW} emissiveIntensity={0.5} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <GBox args={[0.2, 0.2, 0.3]} />
              <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
        )}
      </group>

      <group ref={crewRef}>
        <Crew colors={colors} x={-0.4} z={-0.85} yaw={0.3} />
        <Crew colors={colors} x={0.4} z={-0.85} yaw={-0.3} />
      </group>
    </group>
  )
}
