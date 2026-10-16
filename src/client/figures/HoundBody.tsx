// Serberys Sulphurhound: a cyber-mastiff carrying a Skitarii rider. Authored in the same unit-height space as the
// other bodies but longer than tall (the unit sits on a 60x35mm oval), facing local +Z. The hound is slate and brass
// with teal eyes and a pair of rust-red sulphur tanks on its flanks; the rider uses the Skitarii hood and weapon
// shapes from admParts so a repaint recolours both.
import { useRef } from 'react'
import type { Group } from 'three'
import { GBox, GCone, GCylinder, GSphere, StdMat } from './shared'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import { AdmHead } from './admParts'
import { EndBlock, LimbSegment, WeaponMesh } from './primitives'
import type { BodyProps, HoundConfig } from './types'

const BODY_Y = 0.36
const LEG_LEN = 0.32
const LEG_X = 0.1
const LEG_Z = 0.28

export function HoundBody({ config, colors, pose, seed }: BodyProps & { config: HoundConfig }) {
  const bodyRef = useRef<Group>(null!)
  const riderRef = useRef<Group>(null!)
  const armRRef = useRef<Group>(null!)
  const armLRef = useRef<Group>(null!)
  const headRef = useRef<Group>(null!)
  const tailRef = useRef<Group>(null!)
  const legRefs = [useRef<Group>(null!), useRef<Group>(null!), useRef<Group>(null!), useRef<Group>(null!)] // FL, FR, BL, BR
  const fade = useMaterialFader(bodyRef)

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    const rider = riderRef.current
    const armR = armRRef.current
    const armL = armLRef.current
    const head = headRef.current
    const tail = tailRef.current
    if (!body || !rider || !armR || !armL || !head || !tail || legRefs.some((r) => !r.current)) return
    const [fl, fr, bl, br] = legRefs.map((r) => r.current)

    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    rider.rotation.set(0, 0, 0)
    head.rotation.set(0, 0, 0)
    tail.rotation.set(0.7, 0, 0)
    for (const l of [fl, fr, bl, br]) l.rotation.set(0, 0, 0)
    armR.rotation.set(-1.15, 0, 0)
    armL.rotation.set(-1.15, 0, 0)

    if (pose !== 'death') fade(1)

    switch (pose) {
      case 'idle': {
        body.position.y = 0.01 * Math.sin(t * 2 + seed)
        head.rotation.y = 0.12 * Math.sin(t * 0.7 + seed)
        tail.rotation.z = 0.35 * Math.sin(t * 3 + seed)
        break
      }
      case 'walk': {
        // A bounding trot: diagonal pairs swing together.
        const phase = since * 9 + seed
        const swing = 0.65 * Math.sin(phase)
        fl.rotation.x = swing
        br.rotation.x = swing
        fr.rotation.x = -swing
        bl.rotation.x = -swing
        body.position.y = 0.025 * Math.abs(Math.sin(phase))
        rider.rotation.x = 0.04 * Math.sin(phase * 2)
        tail.rotation.z = 0.3 * Math.sin(phase)
        break
      }
      case 'shoot': {
        const cyclePhase = (since * 3) % 1
        const kick = cyclePhase < 0.15 ? 1 - cyclePhase / 0.15 : 0
        armR.rotation.x = -1.15 - 0.4 * kick
        armL.rotation.x = -1.15 - 0.4 * kick
        rider.rotation.x = -0.06 * kick
        body.position.z = -0.02 * kick
        break
      }
      case 'melee': {
        // The hound lunges and the rider swings the maul overhead and down.
        const cyclePhase = (since * 2.2 + seed * 0.1) % 1
        const chop = Math.sin(cyclePhase * Math.PI * 2)
        const lunge = cyclePhase < 0.3 ? Math.sin((cyclePhase / 0.3) * Math.PI) : 0
        armR.rotation.x = -1.15 + 1.0 * chop
        rider.rotation.y = 0.15 * chop
        body.position.z = 0.1 * lunge
        head.rotation.x = 0.25 * lunge
        fl.rotation.x = -0.5 * lunge
        fr.rotation.x = -0.5 * lunge
        break
      }
      case 'hit': {
        const decay = Math.exp(-since * 11)
        body.position.x = 0.03 * Math.sin(since * 45) * decay
        body.position.z = -0.05 * decay
        rider.rotation.z = 0.16 * decay
        head.rotation.x = 0.15 * decay
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
  })

  const legs: [number, number][] = [
    [-LEG_X, LEG_Z],
    [LEG_X, LEG_Z],
    [-LEG_X, -LEG_Z],
    [LEG_X, -LEG_Z],
  ]

  return (
    <group ref={bodyRef}>
      {legs.map(([x, z], i) => (
        <group key={i} ref={legRefs[i]} position={[x, BODY_Y - 0.02, z]}>
          <LimbSegment length={LEG_LEN} radius={0.05} color={colors.secondary} metalness={0.2} />
          <EndBlock size={0.07} color={colors.trim} metalness={0.3} />
        </group>
      ))}

      {/* hound body, flank tanks and a brass spine plate */}
      <mesh position={[0, BODY_Y + 0.06, 0]}>
        <GBox args={[0.28, 0.24, 0.8]} />
        <StdMat color={colors.secondary} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, BODY_Y + 0.19, 0.05]}>
        <GBox args={[0.2, 0.04, 0.5]} />
        <StdMat color={colors.trim} roughness={0.45} metalness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.17, BODY_Y + 0.06, -0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <GCylinder args={[0.06, 0.06, 0.34, 8]} />
          <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}

      {/* head: snout, jaw, glowing eyes, ears */}
      <group ref={headRef} position={[0, BODY_Y + 0.14, 0.42]}>
        <mesh position={[0, 0.02, 0.1]}>
          <GBox args={[0.16, 0.14, 0.26]} />
          <StdMat color={colors.metal} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, -0.07, 0.14]}>
          <GBox args={[0.12, 0.04, 0.22]} />
          <StdMat color={colors.trim} roughness={0.5} metalness={0.5} />
        </mesh>
        <mesh position={[-0.05, 0.07, 0.18]}>
          <GSphere args={[0.025, 8, 6]} />
          <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={2} />
        </mesh>
        <mesh position={[0.05, 0.07, 0.18]}>
          <GSphere args={[0.025, 8, 6]} />
          <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={2} />
        </mesh>
        <mesh position={[-0.06, 0.12, 0]} rotation={[0, 0, 0.2]}>
          <GCone args={[0.035, 0.12, 5]} />
          <StdMat color={colors.secondary} roughness={0.6} />
        </mesh>
        <mesh position={[0.06, 0.12, 0]} rotation={[0, 0, -0.2]}>
          <GCone args={[0.035, 0.12, 5]} />
          <StdMat color={colors.secondary} roughness={0.6} />
        </mesh>
      </group>

      <group ref={tailRef} position={[0, BODY_Y + 0.12, -0.4]}>
        <mesh position={[0, 0.02, -0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <GCone args={[0.04, 0.3, 6]} />
          <StdMat color={colors.secondary} roughness={0.6} metalness={0.2} />
        </mesh>
      </group>

      {/* rider: a short hooded torso seated high on the back, arms reaching forward with the weapons */}
      <group ref={riderRef} position={[0, BODY_Y + 0.22, -0.02]}>
        <mesh position={[0, 0.16, 0]}>
          <GBox args={[0.26, 0.3, 0.2]} />
          <StdMat color={colors.primary} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <GBox args={[0.28, 0.04, 0.22]} />
          <StdMat color={colors.trim} roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.2, -0.16]}>
          <GBox args={[0.18, 0.2, 0.1]} />
          <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
        </mesh>
        <group position={[0, 0.46, 0]}>
          <AdmHead shape={config.crest ? 'skitarii-alpha' : 'skitarii-hood'} colors={colors} radius={0.16} />
        </group>
        <group ref={armLRef} position={[-0.17, 0.28, 0.02]}>
          <LimbSegment length={0.26} radius={0.05} color={colors.secondary} />
          <group position={[0, -0.26, 0.04]} rotation={[1.15, 0, 0]}>
            <WeaponMesh shape={config.leftWeapon} colors={colors} hand={colors.metal} />
          </group>
        </group>
        <group ref={armRRef} position={[0.17, 0.28, 0.02]}>
          <LimbSegment length={0.26} radius={0.05} color={colors.secondary} />
          <group position={[0, -0.26, 0.04]} rotation={[1.15, 0, 0]}>
            <WeaponMesh shape={config.rightWeapon} colors={colors} hand={colors.metal} />
          </group>
        </group>
      </group>
    </group>
  )
}
