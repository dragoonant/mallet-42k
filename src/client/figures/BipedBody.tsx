// Renders every infantry/heavy/monster kit (this data set never gives a monster more than two
// arms and two legs, so "monster" — the Deff Dread — reuses the biped rig with big claws and a
// heavy bulk factor rather than the tail/quadruped rig 30-figures.md §2 sketches for bigger
// beasts; simplest thing that reads right for the one monster this kit needs).
import { GBox, GCone, GCylinder, GSphere, StdMat } from './shared'
import { useRef } from 'react'
import type { Group } from 'three'
import { EndBlock, HeadBlob, LimbSegment, WeaponMesh } from './primitives'
import { TyranidExtras, TyranidHead } from './TyranidParts'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import type { BipedConfig, BodyProps } from './types'

const ORK_SKIN = '#6f8f3f'
const MARINE_SKIN = '#c9a074'
const DAEMON_SKIN = '#8c7d9a'
const PALE_SKIN = '#e6cdb4'
const VISOR = '#15171c'

const HIP_Y = 0.32
const TORSO_H = 0.3
const ARM_LEN = 0.3
const NECK_H = 0.03

export function BipedBody({ config, colors, pose, seed }: BodyProps & { config: BipedConfig }) {
  const { bulk } = config
  const hunch = config.hunch ?? 0
  const bodyRef = useRef<Group>(null!)
  const torsoRef = useRef<Group>(null!)
  const headRef = useRef<Group>(null!)
  const armLRef = useRef<Group>(null!)
  const armRRef = useRef<Group>(null!)
  const legLRef = useRef<Group>(null!)
  const legRRef = useRef<Group>(null!)
  const fade = useMaterialFader(bodyRef)

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

    if (pose !== 'death') fade(1) // reset opacity if this figure was ever faded and got reused

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
        // Heavier kits (bulk > 1: Terminators, the Dread) take slower, bigger-swinging strides
        // that read as a stomp rather than a jog — no per-kit special-casing needed.
        const freq = 6.5 / Math.sqrt(bulk)
        const phase = since * freq + seed
        const stride = 0.5 + 0.15 * (bulk - 1)
        legL.rotation.x = stride * Math.sin(phase)
        legR.rotation.x = -stride * Math.sin(phase)
        armL.rotation.x = -0.35 * Math.sin(phase)
        armR.rotation.x = 0.35 * Math.sin(phase)
        // Sharper, heavier footfall impact for bulkier kits (power > 1 peaks the bounce instead
        // of a smooth sine) rather than just scaling a sine's amplitude.
        const footfall = Math.pow(Math.abs(Math.sin(phase)), 1 / (1 + 0.4 * (bulk - 1)))
        body.position.y = (0.02 + 0.015 * (bulk - 1)) * footfall
        torso.rotation.x = 0.06
        torso.rotation.y = 0.05 * Math.sin(phase)
        head.rotation.y = -0.03 * Math.sin(phase)
        break
      }
      case 'shoot': {
        const cyclePhase = (since * 3) % 1
        const kick = cyclePhase < 0.15 ? 1 - cyclePhase / 0.15 : 0
        armR.rotation.x = -0.5 * kick
        torso.rotation.x = -0.05 * kick
        body.position.z = -0.02 * kick // recoil pushes the shooter back a touch
        body.position.y = 0.005 * Math.sin(t * 4)
        legL.rotation.z = 0.06
        legR.rotation.z = -0.06
        break
      }
      case 'melee': {
        // One lunge-forward-and-recover per swing, synced to the same cycle as the weapon chop.
        const cyclePhase = (since * 2.2 + seed * 0.1) % 1
        const chop = Math.sin(cyclePhase * Math.PI * 2)
        const lunge = cyclePhase < 0.3 ? Math.sin((cyclePhase / 0.3) * Math.PI) : 0
        armR.rotation.x = 0.9 * chop
        torso.rotation.y = 0.18 * chop
        body.position.z = 0.07 * lunge
        legL.rotation.z = 0.1
        legR.rotation.z = -0.1
        break
      }
      case 'hit': {
        // Short decaying shake + knockback — reads as a flinch without needing to know which
        // direction the hit came from.
        const decay = Math.exp(-since * 11)
        body.position.x = 0.03 * Math.sin(since * 45) * decay
        body.position.z = -0.05 * decay
        torso.rotation.z = 0.16 * decay
        head.rotation.x = 0.12 * decay
        break
      }
      case 'death': {
        const topple = easeOut(since / 1.2)
        body.rotation.z = -topple * (Math.PI / 2) * 0.9
        const sink = clamp01((since - 1.2) / 0.5)
        body.position.y = -sink * 0.4
        fade(1 - sink)
        break
      }
    }
    // A forward-pitched, predatory stance (Tyranid kits): lean the torso, keep the head level-ish.
    if (hunch && pose !== 'death') {
      torso.rotation.x += hunch
      head.rotation.x -= hunch * 0.7
    }
  })

  const hipOffsetX = 0.09 * bulk
  const legRadius = 0.075 * bulk
  const torsoWidth = 0.3 * bulk
  const torsoDepth = 0.2 * bulk
  const shoulderOffsetX = 0.16 + 0.05 * (bulk - 1)
  const armRadius = 0.06 * bulk
  const headRadius = Math.min(0.3, 0.19 + 0.02 * (bulk - 1))

  const skinColor = config.skin === 'ork' ? ORK_SKIN : config.skin === 'marine' ? MARINE_SKIN : config.skin === 'daemon' ? DAEMON_SKIN : config.skin === 'pale' ? PALE_SKIN : undefined
  const limb = config.limbColor === 'metal' ? colors.metal : config.limbColor === 'primary' ? colors.primary : config.limbColor === 'skin' && skinColor ? skinColor : colors.secondary
  const legColor = config.legColor === 'trim' ? colors.trim : colors.primary
  const torsoCol = config.bareTorso ? (skinColor ?? colors.secondary) : config.torsoColor === 'secondary' ? colors.secondary : colors.primary

  return (
    <group ref={bodyRef}>
      <group ref={legLRef} position={[-hipOffsetX, HIP_Y, 0]}>
        <LimbSegment length={HIP_Y} radius={legRadius} color={legColor} />
        <EndBlock size={0.09 * bulk} color={colors.trim} />
      </group>
      <group ref={legRRef} position={[hipOffsetX, HIP_Y, 0]}>
        <LimbSegment length={HIP_Y} radius={legRadius} color={legColor} />
        <EndBlock size={0.09 * bulk} color={colors.trim} />
      </group>

      <group ref={torsoRef} position={[0, HIP_Y, 0]}>
        <mesh position={[0, TORSO_H / 2, 0]}>
          <GBox args={[torsoWidth, TORSO_H, torsoDepth]} />
          <StdMat color={torsoCol} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <GBox args={[torsoWidth * 1.05, 0.03, torsoDepth * 1.05]} />
          <StdMat color={colors.trim} roughness={0.5} />
        </mesh>

        {config.chestCore && (
          <mesh position={[0, TORSO_H * 0.55, torsoDepth / 2 + 0.008]}>
            <GBox args={[torsoWidth * 0.28, torsoWidth * 0.28, 0.02]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.3} />
          </mesh>
        )}
        {config.chestPlate && (
          <>
            <mesh position={[0, TORSO_H * 0.55, torsoDepth / 2 + 0.01]}>
              <GBox args={[torsoWidth * 0.62, torsoWidth * 0.5, 0.025]} />
              <StdMat color={colors.trim} roughness={0.4} metalness={0.6} />
            </mesh>
            <mesh position={[0, TORSO_H * 0.55, torsoDepth / 2 + 0.026]}>
              <GBox args={[torsoWidth * 0.2, torsoWidth * 0.2, 0.012]} />
              <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.5} />
            </mesh>
          </>
        )}
        {config.chestCross && (
          <group position={[0, TORSO_H * 0.55, torsoDepth / 2 + 0.008]}>
            <mesh>
              <GBox args={[torsoWidth * 0.5, torsoWidth * 0.14, 0.02]} />
              <StdMat color={colors.decal} roughness={0.6} />
            </mesh>
            <mesh>
              <GBox args={[torsoWidth * 0.14, torsoWidth * 0.5, 0.02]} />
              <StdMat color={colors.decal} roughness={0.6} />
            </mesh>
          </group>
        )}
        {config.hasBackpack && (
          <mesh position={[0, TORSO_H * 0.62, -torsoDepth / 2 - 0.05 * bulk]}>
            <GBox args={[torsoWidth * 0.7, TORSO_H * 0.65, 0.1 * bulk]} />
            <StdMat color={colors.metal} metalness={0.4} roughness={0.6} />
          </mesh>
        )}
        <TyranidExtras config={config} colors={colors} torsoWidth={torsoWidth} torsoDepth={torsoDepth} torsoHeight={TORSO_H} />
        {config.tabard && (
          <>
            {/* a long bone-coloured tabard hanging over the front of the torso and past the hips */}
            <mesh position={[0, TORSO_H * 0.3, torsoDepth / 2 + 0.012]}>
              <GBox args={[torsoWidth * 0.42, TORSO_H * 1.15, 0.02]} />
              <StdMat color={colors.secondary} roughness={0.8} />
            </mesh>
            <mesh position={[0, TORSO_H * 0.55, torsoDepth / 2 + 0.024]}>
              <GBox args={[torsoWidth * 0.12, TORSO_H * 0.3, 0.012]} />
              <StdMat color={colors.trim} roughness={0.6} />
            </mesh>
          </>
        )}
        {config.hasCape && (
          <mesh position={[0, TORSO_H * 0.35, -torsoDepth / 2 - 0.02]} rotation={[0.25, 0, 0]}>
            <GBox args={[torsoWidth * 0.9, TORSO_H * 1.4, 0.02]} />
            <StdMat color={config.capeColor === 'trim' ? colors.trim : colors.secondary} roughness={0.8} />
          </mesh>
        )}

        <group position={[0, TORSO_H, 0]}>
          {config.shoulderPads !== 'none' && (
            <>
              <mesh position={[-shoulderOffsetX, 0.02, 0]}>
                <GSphere args={[config.shoulderPads === 'large' ? 0.11 * bulk : 0.08 * bulk, 10, 8]} />
                <StdMat color={config.limbColor === 'metal' ? colors.metal : colors.secondary} roughness={0.5} />
              </mesh>
              <mesh position={[shoulderOffsetX, 0.02, 0]}>
                <GSphere args={[config.shoulderPads === 'large' ? 0.11 * bulk : 0.08 * bulk, 10, 8]} />
                <StdMat color={config.limbColor === 'metal' ? colors.metal : colors.secondary} roughness={0.5} />
              </mesh>
            </>
          )}

          <group ref={armLRef} position={[-shoulderOffsetX, 0, 0]}>
            <LimbSegment length={ARM_LEN} radius={armRadius} color={limb} />
            <group position={[0, -ARM_LEN, 0]}>
              <WeaponMesh shape={config.leftWeapon} colors={colors} hand={colors.metal} />
            </group>
          </group>
          <group ref={armRRef} position={[shoulderOffsetX, 0, 0]}>
            <LimbSegment length={ARM_LEN} radius={armRadius} color={limb} />
            <group position={[0, -ARM_LEN, 0.05]}>
              <WeaponMesh shape={config.rightWeapon} colors={colors} hand={colors.metal} />
            </group>
          </group>

          <group ref={headRef} position={[0, NECK_H + headRadius, 0]}>
            <HeadBody shape={config.headShape} colors={colors} skinColor={skinColor} radius={headRadius} />
            {config.halo && (
              <mesh position={[0, headRadius * 0.25, -headRadius * 1.15]} rotation={[Math.PI / 2, 0, 0]}>
                <GCylinder args={[headRadius * 1.15, headRadius * 1.15, 0.015, 18]} />
                <StdMat color={colors.metal} emissive={colors.metal} emissiveIntensity={1.4} metalness={0.5} roughness={0.35} />
              </mesh>
            )}
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
            <GBox args={[radius * 0.9, radius * 0.35, radius * 0.2]} />
            <StdMat color={VISOR} roughness={0.2} />
          </mesh>
          <mesh position={[0, radius * 0.95, 0]}>
            <GCylinder args={[radius * 0.03, radius * 0.03, radius * 0.35, 5]} />
            <StdMat color={colors.metal} metalness={0.6} />
          </mesh>
        </group>
      )
    case 'terminator-helmet':
      return (
        <group>
          <HeadBlob radius={radius * 1.1} color={colors.secondary} />
          <mesh position={[0, -radius * 0.15, radius]}>
            <GBox args={[radius * 1.1, radius * 0.4, radius * 0.22]} />
            <StdMat color={VISOR} roughness={0.2} />
          </mesh>
          <mesh position={[-radius * 1.05, -radius * 0.1, 0]}>
            <GBox args={[radius * 0.22, radius * 0.3, radius * 0.3]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[radius * 1.05, -radius * 0.1, 0]}>
            <GBox args={[radius * 0.22, radius * 0.3, radius * 0.3]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
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
            <GBox args={[radius * 1.3, radius * 0.7, radius * (boss ? 0.9 : 0.7)]} />
            <StdMat color={flesh} roughness={0.7} />
          </mesh>
          <mesh position={[-radius * 0.3, -radius * 0.75, radius * 0.95]}>
            <GCone args={[radius * 0.12, radius * 0.3, 5]} />
            <StdMat color="#f0ead6" roughness={0.4} />
          </mesh>
          <mesh position={[radius * 0.3, -radius * 0.75, radius * 0.95]}>
            <GCone args={[radius * 0.12, radius * 0.3, 5]} />
            <StdMat color="#f0ead6" roughness={0.4} />
          </mesh>
          {boss && (
            <mesh position={[0, radius * 1.05, 0]}>
              <GBox args={[radius * 0.15, radius * 0.5, radius * 1.2]} />
              <StdMat color={colors.trim} roughness={0.5} />
            </mesh>
          )}
        </group>
      )
    }
    case 'necron-skull':
    case 'necron-lord': {
      const lord = shape === 'necron-lord'
      return (
        <group>
          <HeadBlob radius={radius} color={colors.metal} />
          {/* glowing eye slits */}
          <mesh position={[-radius * 0.38, radius * 0.08, radius * 0.92]}>
            <GBox args={[radius * 0.32, radius * 0.16, radius * 0.14]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[radius * 0.38, radius * 0.08, radius * 0.92]}>
            <GBox args={[radius * 0.32, radius * 0.16, radius * 0.14]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.6} />
          </mesh>
          {/* dark jaw plate */}
          <mesh position={[0, -radius * 0.62, radius * 0.5]}>
            <GBox args={[radius * 0.8, radius * 0.4, radius * 0.5]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
          </mesh>
          {lord && (
            <>
              {/* tall gold crest, the visible mark of rank */}
              <mesh position={[0, radius * 1.15, -radius * 0.1]}>
                <GBox args={[radius * 0.18, radius * 0.9, radius * 1.1]} />
                <StdMat color={colors.trim} roughness={0.35} metalness={0.7} />
              </mesh>
              <mesh position={[0, -radius * 0.05, 0]}>
                <GBox args={[radius * 2.1, radius * 0.1, radius * 1.2]} />
                <StdMat color={colors.trim} roughness={0.35} metalness={0.7} />
              </mesh>
            </>
          )}
        </group>
      )
    }
    case 'chaos-helmet':
    case 'chaos-sorcerer': {
      const lord = shape === 'chaos-sorcerer'
      const horn = lord ? 1.45 : 1
      return (
        <group>
          <HeadBlob radius={radius} color={colors.secondary} />
          {/* two glowing warp-violet eye slits */}
          <mesh position={[-radius * 0.34, radius * 0.05, radius * 0.93]}>
            <GBox args={[radius * 0.3, radius * 0.14, radius * 0.14]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={lord ? 2 : 1.4} />
          </mesh>
          <mesh position={[radius * 0.34, radius * 0.05, radius * 0.93]}>
            <GBox args={[radius * 0.3, radius * 0.14, radius * 0.14]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={lord ? 2 : 1.4} />
          </mesh>
          {/* brass grille under the visor */}
          <mesh position={[0, -radius * 0.45, radius * 0.82]}>
            <GBox args={[radius * 0.55, radius * 0.3, radius * 0.22]} />
            <StdMat color={colors.trim} roughness={0.4} metalness={0.6} />
          </mesh>
          {/* swept-back horns: the quick read for "Chaos" */}
          <mesh position={[-radius * 0.85, radius * 0.7, -radius * 0.05]} rotation={[0, 0, 0.7]}>
            <GCone args={[radius * 0.16 * horn, radius * 0.7 * horn, 6]} />
            <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[radius * 0.85, radius * 0.7, -radius * 0.05]} rotation={[0, 0, -0.7]}>
            <GCone args={[radius * 0.16 * horn, radius * 0.7 * horn, 6]} />
            <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
          </mesh>
          {lord && (
            <mesh position={[0, radius * 1.0, 0]}>
              <GBox args={[radius * 1.5, radius * 0.12, radius * 1.1]} />
              <StdMat color={colors.trim} roughness={0.35} metalness={0.7} />
            </mesh>
          )}
        </group>
      )
    }
    case 'possessed-head':
      return (
        <group>
          <HeadBlob radius={radius} color={skinColor ?? DAEMON_SKIN} />
          {/* wide, fanged jaw */}
          <mesh position={[0, -radius * 0.6, radius * 0.5]}>
            <GBox args={[radius * 1.4, radius * 0.6, radius * 0.8]} />
            <StdMat color={skinColor ?? DAEMON_SKIN} roughness={0.7} />
          </mesh>
          <mesh position={[-radius * 0.35, -radius * 0.9, radius * 0.9]} rotation={[Math.PI, 0, 0]}>
            <GCone args={[radius * 0.1, radius * 0.3, 5]} />
            <StdMat color="#f0ead6" roughness={0.4} />
          </mesh>
          <mesh position={[radius * 0.35, -radius * 0.9, radius * 0.9]} rotation={[Math.PI, 0, 0]}>
            <GCone args={[radius * 0.1, radius * 0.3, 5]} />
            <StdMat color="#f0ead6" roughness={0.4} />
          </mesh>
          <mesh position={[-radius * 0.38, radius * 0.18, radius * 0.9]}>
            <GSphere args={[radius * 0.15, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[radius * 0.38, radius * 0.18, radius * 0.9]}>
            <GSphere args={[radius * 0.15, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[-radius * 0.7, radius * 0.85, 0]} rotation={[0, 0, 0.5]}>
            <GCone args={[radius * 0.14, radius * 0.6, 5]} />
            <StdMat color={colors.secondary} roughness={0.5} />
          </mesh>
          <mesh position={[radius * 0.7, radius * 0.85, 0]} rotation={[0, 0, -0.5]}>
            <GCone args={[radius * 0.14, radius * 0.6, 5]} />
            <StdMat color={colors.secondary} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'cultist-hood':
      return (
        <group>
          <HeadBlob radius={radius * 1.05} color={colors.primary} />
          <mesh position={[0, radius * 1.0, -radius * 0.15]} rotation={[-0.35, 0, 0]}>
            <GCone args={[radius * 0.55, radius * 0.7, 6]} />
            <StdMat color={colors.primary} roughness={0.7} />
          </mesh>
          <mesh position={[0, -radius * 0.05, radius * 0.88]}>
            <GBox args={[radius * 0.85, radius * 0.5, radius * 0.2]} />
            <StdMat color={VISOR} roughness={0.8} />
          </mesh>
          <mesh position={[-radius * 0.2, 0, radius * 0.98]}>
            <GBox args={[radius * 0.14, radius * 0.1, radius * 0.06]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[radius * 0.2, 0, radius * 0.98]}>
            <GBox args={[radius * 0.14, radius * 0.1, radius * 0.06]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.4} />
          </mesh>
        </group>
      )
    case 'tyranid-head':
    case 'tyranid-prime-head':
    case 'tyranid-brute-head':
      return <TyranidHead shape={shape} colors={colors} radius={radius} />
    case 'sister-bob': {
      // Pale face under a white bob: a hair cap sitting back and high, plus two side curtains; a dark
      // brow band keeps the face reading from the front.
      const face = skinColor ?? PALE_SKIN
      return (
        <group>
          <HeadBlob radius={radius} color={face} />
          <mesh position={[0, radius * 0.22, -radius * 0.18]} scale={[1, 0.95, 1]}>
            <GSphere args={[radius * 1.1, 14, 10]} />
            <StdMat color={colors.decal} roughness={0.75} />
          </mesh>
          <mesh position={[-radius * 0.98, -radius * 0.18, -radius * 0.05]}>
            <GBox args={[radius * 0.32, radius * 0.85, radius * 1.15]} />
            <StdMat color={colors.decal} roughness={0.75} />
          </mesh>
          <mesh position={[radius * 0.98, -radius * 0.18, -radius * 0.05]}>
            <GBox args={[radius * 0.32, radius * 0.85, radius * 1.15]} />
            <StdMat color={colors.decal} roughness={0.75} />
          </mesh>
          <mesh position={[-radius * 0.32, -radius * 0.05, radius * 0.93]}>
            <GBox args={[radius * 0.2, radius * 0.2, radius * 0.1]} />
            <StdMat color={VISOR} roughness={0.4} />
          </mesh>
          <mesh position={[radius * 0.32, -radius * 0.05, radius * 0.93]}>
            <GBox args={[radius * 0.2, radius * 0.2, radius * 0.1]} />
            <StdMat color={VISOR} roughness={0.4} />
          </mesh>
        </group>
      )
    }
    case 'guard-helmet':
      // Bare human face under a rounded olive helmet with a pale brim and a red unit stripe.
      return (
        <group>
          <HeadBlob radius={radius} color={skinColor ?? MARINE_SKIN} />
          <mesh position={[0, radius * 0.28, 0]} scale={[1, 0.8, 1.04]}>
            <GSphere args={[radius * 1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <StdMat color={colors.primary} roughness={0.6} />
          </mesh>
          <mesh position={[0, radius * 0.3, 0]}>
            <GCylinder args={[radius * 1.14, radius * 1.14, radius * 0.1, 14]} />
            <StdMat color={colors.metal} roughness={0.55} metalness={0.3} />
          </mesh>
          <mesh position={[0, radius * 0.62, radius * 0.5]}>
            <GBox args={[radius * 0.28, radius * 0.1, radius * 0.7]} />
            <StdMat color={colors.decal} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'officer-cap':
      // Officer peaked cap: flat crown, gold band and a visor over a bare face.
      return (
        <group>
          <HeadBlob radius={radius} color={skinColor ?? MARINE_SKIN} />
          <mesh position={[0, radius * 0.62, 0]}>
            <GCylinder args={[radius * 1.1, radius * 0.98, radius * 0.5, 14]} />
            <StdMat color={colors.primary} roughness={0.6} />
          </mesh>
          <mesh position={[0, radius * 0.42, 0]}>
            <GCylinder args={[radius * 1.12, radius * 1.12, radius * 0.1, 14]} />
            <StdMat color={colors.trim} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, radius * 0.4, radius * 0.95]}>
            <GBox args={[radius * 1.2, radius * 0.06, radius * 0.5]} />
            <StdMat color={VISOR} roughness={0.3} />
          </mesh>
          <mesh position={[0, radius * 0.66, radius * 1.05]}>
            <GBox args={[radius * 0.3, radius * 0.3, radius * 0.06]} />
            <StdMat color={colors.decal} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'sentinel-cab': {
      // A walker boxy cockpit: armoured hull, dark viewport slit, sensor mast and a top hatch.
      const r = radius * 1.35
      return (
        <group position={[0, r * 0.1, 0]}>
          <mesh>
            <GBox args={[r * 2.1, r * 1.5, r * 1.9]} />
            <StdMat color={colors.primary} roughness={0.55} metalness={0.2} />
          </mesh>
          <mesh position={[0, r * 0.1, r * 0.96]}>
            <GBox args={[r * 1.6, r * 0.55, r * 0.1]} />
            <StdMat color={VISOR} roughness={0.2} metalness={0.5} />
          </mesh>
          <mesh position={[0, -r * 0.55, 0]}>
            <GBox args={[r * 2.2, r * 0.16, r * 2.0]} />
            <StdMat color={colors.trim} roughness={0.45} metalness={0.5} />
          </mesh>
          <mesh position={[r * 0.55, r * 0.95, -r * 0.2]}>
            <GCylinder args={[r * 0.05, r * 0.05, r * 0.7, 6]} />
            <StdMat color={colors.metal} metalness={0.6} />
          </mesh>
          <mesh position={[0, r * 0.82, r * 0.1]}>
            <GCylinder args={[r * 0.4, r * 0.4, r * 0.18, 10]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[-r * 1.02, 0, 0]}>
            <GBox args={[r * 0.06, r * 0.5, r * 0.5]} />
            <StdMat color={colors.decal} roughness={0.6} />
          </mesh>
        </group>
      )
    }
    case 'sister-hood':
      // Celestian guardian: a crimson hood wrapped over a brass-trimmed helm with a narrow dark visor slit.
      return (
        <group>
          <HeadBlob radius={radius * 1.08} color={colors.trim} />
          <mesh position={[0, -radius * 0.05, radius * 0.95]}>
            <GBox args={[radius * 0.95, radius * 0.3, radius * 0.18]} />
            <StdMat color={VISOR} roughness={0.25} />
          </mesh>
          <mesh position={[0, radius * 0.7, radius * 0.3]}>
            <GBox args={[radius * 0.3, radius * 0.3, radius * 0.9]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'arco-mask':
      // Arco-flagellant: pale stitched head under a brass hood-mask that covers the eyes, with a bare, hunched look.
      return (
        <group>
          <HeadBlob radius={radius} color={skinColor ?? PALE_SKIN} />
          <mesh position={[0, radius * 0.1, radius * 0.55]}>
            <GBox args={[radius * 1.7, radius * 0.5, radius * 0.9]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, radius * 0.6, 0]}>
            <GBox args={[radius * 0.3, radius * 0.5, radius * 1.4]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -radius * 0.45, radius * 0.75]}>
            <GBox args={[radius * 0.7, radius * 0.08, radius * 0.1]} />
            <StdMat color={VISOR} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'generic-head':
    default:
      return <HeadBlob radius={radius} color={colors.secondary} />
  }
}
