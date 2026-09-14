// Flyer rig for the one vehicle kit this data set has (Deffkopta) plus its generic fallback:
// chassis + tail boom + spinning top rotor, no legs — 30-figures.md §2's vehicle bones
// (hull/turret/gunMount) reduced to what a gyrocopter actually needs.
import { useRef } from 'react'
import type { Group } from 'three'
import { usePoseFrame, clamp01, easeOut } from './anim'
import type { BodyProps, VehicleConfig } from './types'

export function VehicleBody({ config, colors, pose, seed }: BodyProps & { config: VehicleConfig }) {
  const bodyRef = useRef<Group>(null!)
  const rotorRef = useRef<Group>(null!)
  const gunRef = useRef<Group>(null!)

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    const rotor = rotorRef.current
    const gun = gunRef.current
    if (!body || !rotor || !gun) return

    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    gun.rotation.set(0, 0, 0)
    gun.position.set(0, 0, 0)

    let rotorSpeed = 12
    switch (pose) {
      case 'idle':
        body.position.y = 0.03 * Math.sin(t * 1.5 + seed)
        body.rotation.z = 0.03 * Math.sin(t * 0.8 + seed)
        break
      case 'walk':
        body.rotation.x = -0.18
        body.position.y = 0.03 + 0.02 * Math.sin(t * 3 + seed)
        rotorSpeed = 18
        break
      case 'shoot': {
        const cyclePhase = (since * 3) % 1
        const kick = cyclePhase < 0.15 ? 1 - cyclePhase / 0.15 : 0
        gun.position.z = -0.05 * kick
        body.rotation.x = -0.03 * kick
        break
      }
      case 'melee':
        body.rotation.z = 0.3 * Math.sin(since * 8 + seed)
        rotorSpeed = 16
        break
      case 'death': {
        const topple = easeOut(since / 1.2)
        body.rotation.z = topple * (Math.PI / 2) * 0.8
        body.rotation.x = topple * 0.4
        const sink = clamp01((since - 1.2) / 0.5)
        body.position.y = -sink * 0.5
        rotorSpeed = Math.max(0, 12 * (1 - clamp01(since / 1.2)))
        break
      }
    }
    rotor.rotation.y = t * rotorSpeed
  })

  return (
    <group ref={bodyRef}>
      <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.15, 0.32, 4, 10]} />
        <meshStandardMaterial color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.46, 0.18]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshStandardMaterial color="#15171c" roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.42, -0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.045, 0.28, 6]} />
        <meshStandardMaterial color={colors.metal} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.42, -0.46]}>
        <boxGeometry args={[0.02, 0.16, 0.12]} />
        <meshStandardMaterial color={colors.trim} roughness={0.6} />
      </mesh>

      <mesh position={[-0.14, 0.28, 0.05]} rotation={[0, 0, 0.4]}>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 5]} />
        <meshStandardMaterial color={colors.metal} metalness={0.5} />
      </mesh>
      <mesh position={[0.14, 0.28, 0.05]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.015, 0.015, 0.22, 5]} />
        <meshStandardMaterial color={colors.metal} metalness={0.5} />
      </mesh>

      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.16, 6]} />
        <meshStandardMaterial color={colors.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={rotorRef} position={[0, 0.68, 0]}>
        <mesh position={[0.22, 0, 0]}>
          <boxGeometry args={[0.4, 0.015, 0.06]} />
          <meshStandardMaterial color={colors.trim} roughness={0.5} />
        </mesh>
        <mesh position={[-0.22, 0, 0]}>
          <boxGeometry args={[0.4, 0.015, 0.06]} />
          <meshStandardMaterial color={colors.trim} roughness={0.5} />
        </mesh>
      </group>

      {config.weapon !== 'none' && (
        <group ref={gunRef} position={[0, 0.32, 0.28]}>
          <mesh>
            <boxGeometry args={[0.12, 0.1, 0.16]} />
            <meshStandardMaterial color={colors.secondary} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.24, 8]} />
            <meshStandardMaterial color={colors.metal} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  )
}
