// Renders every infantry/heavy/monster kit (this data set never gives a monster more than two
// arms and two legs, so "monster" — the Deff Dread — reuses the biped rig with big claws and a
// heavy bulk factor rather than the tail/quadruped rig 30-figures.md §2 sketches for bigger
// beasts; simplest thing that reads right for the one monster this kit needs).
import { useRef } from 'react'
import type { Group } from 'three'
import { EndBlock, HeadBlob, LimbSegment, WeaponMesh } from './primitives'
import { usePoseFrame, clamp01, easeOut } from './anim'
import type { BipedConfig, BodyProps } from './types'

const ORK_SKIN = '#6f8f3f'
const MARINE_SKIN = '#c9a074'
const VISOR = '#15171c'

const HIP_Y = 0.32
const TORSO_H = 0.3
const ARM_LEN = 0.3
const NECK_H = 0.03

export function BipedBody({ config, colors, pose, seed }: BodyProps & { config: BipedConfig }) {
  const { bulk } = config
  const bodyRef = useRef<Group>(null!)
  const torsoRef = useRef<Group>(null!)
  const headRef = useRef<Group>(null!)
  const armLRef = useRef<Group>(null!)
  const armRRef = useRef<Group>(null!)
  const legLRef = useRef<Group>(null!)
  const legRRef = useRef<Group>(null!)

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    const torso = torsoRef.current
    const head = headRef.current
    const armL = armLRef.current
    const armR = armRRef.current
    const legL = legLRef.current
    const legR = legRRef.current
    if (!body || !torso || !head || !armL || !armR || !legL || !legR) return

    // Reset every frame rather than accumulate — poses can switch mid-cycle.
    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    torso.rotation.set(0, 0, 0)
    head.rotation.set(0, 0, 0)
    legL.rotation.set(0, 0, 0)
    legR.rotation.set(0, 0, 0)
    armL.rotation.set(0, 0, 0)
    armR.rotation.set(0, 0, 0)

    switch (pose) {
      case 'idle': {
        body.position.y = 0.012 * Math.sin(t * 2 + seed)
        torso.rotation.z = 0.02 * Math.sin(t * 1.3 + seed)
        head.rotation.y = 0.06 * Math.sin(t * 0.6 + seed)
        armL.rotation.x = 0.03 * Math.sin(t * 1.1 + seed)
        armR.rotation.x = 0.03 * Math.sin(t * 1.1 + seed + Math.PI)
        break
      }
      case 'walk': {
        const freq = 6
        const phase = since * freq + seed
        legL.rotation.x = 0.5 * Math.sin(phase)
        legR.rotation.x = -0.5 * Math.sin(phase)
        armL.rotation.x = -0.35 * Math.sin(phase)
        armR.rotation.x = 0.35 * Math.sin(phase)
        body.position.y = 0.02 * Math.abs(Math.sin(phase))
        torso.rotation.x = 0.06
        break
      }
      case 'shoot': {
        const cyclePhase = (since * 3) % 1
        const kick = cyclePhase < 0.15 ? 1 - cyclePhase / 0.15 : 0
        armR.rotation.x = -0.5 * kick
        torso.rotation.x = -0.05 * kick
        body.position.y = 0.005 * Math.sin(t * 4)
        legL.rotation.z = 0.06
        legR.rotation.z = -0.06
        break
      }
      case 'melee': {
        const chop = Math.sin(since * 6 + seed)
        armR.rotation.x = 0.8 * chop
        torso.rotation.y = 0.15 * chop
        legL.rotation.z = 0.1
        legR.rotation.z = -0.1
        break
      }
      case 'death': {
        const topple = easeOut(since / 1.2)
        body.rotation.z = -topple * (Math.PI / 2) * 0.9
        const sink = clamp01((since - 1.2) / 0.5)
        body.position.y = -sink * 0.4
        break
      }
    }
  })

  const hipOffsetX = 0.09 * bulk
  const legRadius = 0.075 * bulk
  const torsoWidth = 0.3 * bulk
  const torsoDepth = 0.2 * bulk
  const shoulderOffsetX = 0.16 + 0.05 * (bulk - 1)
  const armRadius = 0.06 * bulk
  const headRadius = Math.min(0.3, 0.19 + 0.02 * (bulk - 1))

  const skinColor = config.skin === 'ork' ? ORK_SKIN : config.skin === 'marine' ? MARINE_SKIN : undefined

  return (
    <group ref={bodyRef}>
      <group ref={legLRef} position={[-hipOffsetX, HIP_Y, 0]}>
        <LimbSegment length={HIP_Y} radius={legRadius} color={colors.primary} />
        <EndBlock size={0.09 * bulk} color={colors.trim} />
      </group>
      <group ref={legRRef} position={[hipOffsetX, HIP_Y, 0]}>
        <LimbSegment length={HIP_Y} radius={legRadius} color={colors.primary} />
        <EndBlock size={0.09 * bulk} color={colors.trim} />
      </group>

      <group ref={torsoRef} position={[0, HIP_Y, 0]}>
        <mesh position={[0, TORSO_H / 2, 0]}>
          <boxGeometry args={[torsoWidth, TORSO_H, torsoDepth]} />
          <meshStandardMaterial color={colors.primary} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[torsoWidth * 1.05, 0.03, torsoDepth * 1.05]} />
          <meshStandardMaterial color={colors.trim} roughness={0.5} />
        </mesh>

        {config.hasBackpack && (
          <mesh position={[0, TORSO_H * 0.62, -torsoDepth / 2 - 0.05 * bulk]}>
            <boxGeometry args={[torsoWidth * 0.7, TORSO_H * 0.65, 0.1 * bulk]} />
            <meshStandardMaterial color={colors.metal} metalness={0.4} roughness={0.6} />
          </mesh>
        )}
        {config.hasCape && (
          <mesh position={[0, TORSO_H * 0.35, -torsoDepth / 2 - 0.02]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[torsoWidth * 0.9, TORSO_H * 1.4, 0.02]} />
            <meshStandardMaterial color={colors.secondary} roughness={0.8} />
          </mesh>
        )}

        <group position={[0, TORSO_H, 0]}>
          {config.shoulderPads !== 'none' && (
            <>
              <mesh position={[-shoulderOffsetX, 0.02, 0]}>
                <sphereGeometry args={[config.shoulderPads === 'large' ? 0.11 * bulk : 0.08 * bulk, 10, 8]} />
                <meshStandardMaterial color={colors.secondary} roughness={0.5} />
              </mesh>
              <mesh position={[shoulderOffsetX, 0.02, 0]}>
                <sphereGeometry args={[config.shoulderPads === 'large' ? 0.11 * bulk : 0.08 * bulk, 10, 8]} />
                <meshStandardMaterial color={colors.secondary} roughness={0.5} />
              </mesh>
            </>
          )}

          <group ref={armLRef} position={[-shoulderOffsetX, 0, 0]}>
            <LimbSegment length={ARM_LEN} radius={armRadius} color={colors.secondary} />
            <group position={[0, -ARM_LEN, 0]}>
              <WeaponMesh shape={config.leftWeapon} colors={colors} hand={colors.metal} />
            </group>
          </group>
          <group ref={armRRef} position={[shoulderOffsetX, 0, 0]}>
            <LimbSegment length={ARM_LEN} radius={armRadius} color={colors.secondary} />
            <group position={[0, -ARM_LEN, 0.05]}>
              <WeaponMesh shape={config.rightWeapon} colors={colors} hand={colors.metal} />
            </group>
          </group>

          <group ref={headRef} position={[0, NECK_H + headRadius, 0]}>
            <HeadBody shape={config.headShape} colors={colors} skinColor={skinColor} radius={headRadius} />
          </group>
        </group>
      </group>
    </group>
  )
}

function HeadBody({
  shape,
  colors,
  skinColor,
  radius,
}: {
  shape: BipedConfig['headShape']
  colors: BodyProps['colors']
  skinColor: string | undefined
  radius: number
}) {
  switch (shape) {
    case 'marine-helmet':
      return (
        <group>
          <HeadBlob radius={radius} color={colors.secondary} />
          <mesh position={[0, -radius * 0.1, radius * 0.9]}>
            <boxGeometry args={[radius * 0.9, radius * 0.35, radius * 0.2]} />
            <meshStandardMaterial color={VISOR} roughness={0.2} />
          </mesh>
          <mesh position={[0, radius * 0.95, 0]}>
            <cylinderGeometry args={[radius * 0.03, radius * 0.03, radius * 0.35, 5]} />
            <meshStandardMaterial color={colors.metal} metalness={0.6} />
          </mesh>
        </group>
      )
    case 'terminator-helmet':
      return (
        <group>
          <HeadBlob radius={radius * 1.1} color={colors.secondary} />
          <mesh position={[0, -radius * 0.15, radius]}>
            <boxGeometry args={[radius * 1.1, radius * 0.4, radius * 0.22]} />
            <meshStandardMaterial color={VISOR} roughness={0.2} />
          </mesh>
          <mesh position={[-radius * 1.05, -radius * 0.1, 0]}>
            <boxGeometry args={[radius * 0.22, radius * 0.3, radius * 0.3]} />
            <meshStandardMaterial color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[radius * 1.05, -radius * 0.1, 0]}>
            <boxGeometry args={[radius * 0.22, radius * 0.3, radius * 0.3]} />
            <meshStandardMaterial color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'ork-head':
    case 'ork-boss-head': {
      const flesh = skinColor ?? ORK_SKIN
      const boss = shape === 'ork-boss-head'
      return (
        <group>
          <HeadBlob radius={radius} color={flesh} />
          <mesh position={[0, -radius * 0.55, radius * 0.55]}>
            <boxGeometry args={[radius * 1.3, radius * 0.7, radius * (boss ? 0.9 : 0.7)]} />
            <meshStandardMaterial color={flesh} roughness={0.7} />
          </mesh>
          <mesh position={[-radius * 0.3, -radius * 0.75, radius * 0.95]}>
            <coneGeometry args={[radius * 0.12, radius * 0.3, 5]} />
            <meshStandardMaterial color="#f0ead6" roughness={0.4} />
          </mesh>
          <mesh position={[radius * 0.3, -radius * 0.75, radius * 0.95]}>
            <coneGeometry args={[radius * 0.12, radius * 0.3, 5]} />
            <meshStandardMaterial color="#f0ead6" roughness={0.4} />
          </mesh>
          {boss && (
            <mesh position={[0, radius * 1.05, 0]}>
              <boxGeometry args={[radius * 0.15, radius * 0.5, radius * 1.2]} />
              <meshStandardMaterial color={colors.trim} roughness={0.5} />
            </mesh>
          )}
        </group>
      )
    }
    case 'generic-head':
    default:
      return <HeadBlob radius={radius} color={colors.secondary} />
  }
}
