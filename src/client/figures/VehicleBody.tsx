// Flyer rig for the one vehicle kit this data set has (Deffkopta) plus its generic fallback:
// chassis + tail boom + spinning top rotor, no legs — 30-figures.md §2's vehicle bones
// (hull/turret/gunMount) reduced to what a gyrocopter actually needs.
import { GBox, GCapsule, GCone, GCylinder, GSphere, StdMat } from './shared'
import { useRef } from 'react'
import type { Group } from 'three'
import type { RefObject } from 'react'
import { usePoseFrame, clamp01, easeOut, useMaterialFader } from './anim'
import type { BodyProps, VehicleConfig } from './types'

export function VehicleBody({ config, colors, pose, seed }: BodyProps & { config: VehicleConfig }) {
  const bodyRef = useRef<Group>(null!)
  const rotorRef = useRef<Group>(null!)
  const gunRef = useRef<Group>(null!)
  const fade = useMaterialFader(bodyRef)

  usePoseFrame(pose, (t, since) => {
    const body = bodyRef.current
    const rotor = rotorRef.current
    const gun = gunRef.current
    if (!body || !rotor || !gun) return

    body.rotation.set(0, 0, 0)
    body.position.set(0, 0, 0)
    gun.rotation.set(0, 0, 0)
    gun.position.set(0, 0, 0)

    if (pose !== 'death') fade(1) // reset opacity if this figure was ever faded and got reused

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
      case 'melee': {
        // Ramming lunge-and-recover, same one-shot-per-cycle shape as the biped melee lunge.
        const cyclePhase = (since * 1.8 + seed * 0.1) % 1
        const lunge = cyclePhase < 0.3 ? Math.sin((cyclePhase / 0.3) * Math.PI) : 0
        body.position.z = 0.1 * lunge
        body.rotation.z = 0.3 * Math.sin(since * 8 + seed)
        rotorSpeed = 16
        break
      }
      case 'hit': {
        const decay = Math.exp(-since * 11)
        body.position.x = 0.04 * Math.sin(since * 40) * decay
        body.rotation.z = 0.2 * decay
        body.position.z = -0.06 * decay
        break
      }
      case 'death': {
        const topple = easeOut(since / 1.2)
        body.rotation.z = topple * (Math.PI / 2) * 0.8
        body.rotation.x = topple * 0.4
        const sink = clamp01((since - 1.2) / 0.5)
        body.position.y = -sink * 0.5
        rotorSpeed = Math.max(0, 12 * (1 - clamp01(since / 1.2)))
        fade(1 - sink)
        break
      }
    }
    rotor.rotation.y = t * rotorSpeed
  })

  if (config.style === 'dozer') {
    return (
      <group ref={bodyRef}>
        <DozerParts colors={colors} />
        <group ref={rotorRef} visible={false} />
        <group ref={gunRef} />
      </group>
    )
  }

  if (config.style === 'gravbike') {
    return (
      <group ref={bodyRef}>
        <GravbikeParts colors={colors} rig={config.rig} gunRef={gunRef} />
        <group ref={rotorRef} visible={false} />
      </group>
    )
  }

  if (config.style === 'skiff' || config.style === 'gunboat') {
    return (
      <group ref={bodyRef}>
        <SkiffParts colors={colors} gunboat={config.style === 'gunboat'} />
        <group ref={rotorRef} visible={false} />
        <group ref={gunRef} />
      </group>
    )
  }

  if (config.style === 'jetbike' || config.style === 'platform') {
    return (
      <group ref={bodyRef}>
        {config.style === 'jetbike' ? <JetbikeParts colors={colors} weapon={config.weapon} gunRef={gunRef} /> : <PlatformParts colors={colors} gunRef={gunRef} />}
        <group ref={rotorRef} visible={false} />
      </group>
    )
  }

  if (config.style === 'impulsor') {
    return (
      <group ref={bodyRef}>
        <HoverParts colors={colors} />
        <ImpulsorRoof colors={colors} />
        <group ref={rotorRef} visible={false} />
        <group ref={gunRef} />
      </group>
    )
  }

  if (config.style === 'templar-impulsor') {
    return (
      <group ref={bodyRef}>
        <ImpulsorParts colors={colors} />
        <group ref={rotorRef} visible={false} />
        <group ref={gunRef} />
      </group>
    )
  }

  if (config.style === 'hover') {
    return (
      <group ref={bodyRef}>
        <HoverParts colors={colors} />
        <group ref={rotorRef} visible={false} />
        <group ref={gunRef} />
      </group>
    )
  }

  return (
    <group ref={bodyRef}>
      <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <GCapsule args={[0.15, 0.32, 4, 10]} />
        <StdMat color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.46, 0.18]}>
        <GSphere args={[0.11, 10, 8]} />
        <StdMat color="#15171c" roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.42, -0.32]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.03, 0.045, 0.28, 6]} />
        <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.42, -0.46]}>
        <GBox args={[0.02, 0.16, 0.12]} />
        <StdMat color={colors.trim} roughness={0.6} />
      </mesh>

      <mesh position={[-0.14, 0.28, 0.05]} rotation={[0, 0, 0.4]}>
        <GCylinder args={[0.015, 0.015, 0.22, 5]} />
        <StdMat color={colors.metal} metalness={0.5} />
      </mesh>
      <mesh position={[0.14, 0.28, 0.05]} rotation={[0, 0, -0.4]}>
        <GCylinder args={[0.015, 0.015, 0.22, 5]} />
        <StdMat color={colors.metal} metalness={0.5} />
      </mesh>

      <mesh position={[0, 0.6, 0]}>
        <GCylinder args={[0.02, 0.02, 0.16, 6]} />
        <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={rotorRef} position={[0, 0.68, 0]}>
        <mesh position={[0.22, 0, 0]}>
          <GBox args={[0.4, 0.015, 0.06]} />
          <StdMat color={colors.trim} roughness={0.5} />
        </mesh>
        <mesh position={[-0.22, 0, 0]}>
          <GBox args={[0.4, 0.015, 0.06]} />
          <StdMat color={colors.trim} roughness={0.5} />
        </mesh>
      </group>

      {config.weapon !== 'none' && (
        <group ref={gunRef} position={[0, 0.32, 0.28]}>
          <mesh>
            <GBox args={[0.12, 0.1, 0.16]} />
            <StdMat color={colors.secondary} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.03, 0.03, 0.24, 8]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/** Goliath Rockgrinder: a squat armoured crawler on two tracks with a dozer blade, a cab and a rear mining drill-stack. */
function DozerParts({ colors }: { colors: BodyProps['colors'] }) {
  return (
    <group>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.16, 0]}>
          <GBox args={[0.16, 0.28, 1.2]} />
          <StdMat color="#2a2b30" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.36, -0.02]}>
        <GBox args={[0.62, 0.28, 0.95]} />
        <StdMat color={colors.primary} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.58, 0.18]}>
        <GBox args={[0.46, 0.22, 0.4]} />
        <StdMat color={colors.secondary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.6, 0.39]}>
        <GBox args={[0.38, 0.1, 0.02]} />
        <StdMat color="#15171c" roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.3, 0.72]} rotation={[0.15, 0, 0]}>
        <GBox args={[0.98, 0.34, 0.06]} />
        <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.58, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.09, 0.09, 0.5, 8]} />
        <StdMat color={colors.trim} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.4, 0.6]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.05, 0.05, 0.3, 6]} />
        <StdMat color={colors.metal} metalness={0.6} />
      </mesh>
    </group>
  )
}

/** Devilfish: a cream skimmer hull with a sloped nose, side intake pods, a blue canopy, a chin cannon and a glowing hover pad. */
function HoverParts({ colors }: { colors: BodyProps['colors'] }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <GBox args={[0.7, 0.04, 1.1]} />
        <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={0.9} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.38, -0.02]}>
        <GBox args={[0.62, 0.3, 1.1]} />
        <StdMat color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.34, 0.6]} rotation={[0.5, 0, 0]}>
        <GBox args={[0.6, 0.26, 0.28]} />
        <StdMat color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.6, 0.12]}>
        <GBox args={[0.4, 0.14, 0.4]} />
        <StdMat color={colors.secondary} roughness={0.35} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <group key={x} position={[x, 0.36, -0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.12, 0.12, 0.8, 10]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.08, 0.08, 0.04, 10]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[x > 0 ? 0.12 : -0.12, -0.02, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.02, 0.02, 0.22, 6]} />
            <StdMat color={colors.trim} roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.3, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.04, 0.04, 0.3, 8]} />
        <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.5, -0.5]}>
        <GBox args={[0.5, 0.04, 0.1]} />
        <StdMat color={colors.trim} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** Impulsor: the skimmer hull plus what makes it a troop carrier — a shield-plated roof deck with a pintle storm bolter,
 *  a side-mounted missile array and a gold hull stripe. */
function ImpulsorRoof({ colors }: { colors: BodyProps['colors'] }) {
  return (
    <group>
      {/* gold stripe along the flanks */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, 0.4, -0.02]}>
          <GBox args={[0.02, 0.05, 1.0]} />
          <StdMat color={colors.secondary} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* open roof deck with a raised rim */}
      <mesh position={[0, 0.56, -0.28]}>
        <GBox args={[0.5, 0.04, 0.4]} />
        <StdMat color={colors.trim} roughness={0.5} />
      </mesh>
      {/* pintle storm bolter on the deck */}
      <mesh position={[0, 0.66, -0.2]}>
        <GCylinder args={[0.025, 0.025, 0.16, 6]} />
        <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.74, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.03, 0.03, 0.3, 8]} />
        <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* missile array on the right shoulder of the hull */}
      <mesh position={[0.2, 0.66, 0.1]}>
        <GBox args={[0.14, 0.12, 0.3]} />
        <StdMat color={colors.primary} roughness={0.5} />
      </mesh>
      {[-0.03, 0.03].map((dx) => (
        <mesh key={dx} position={[0.2 + dx, 0.66, 0.27]} rotation={[Math.PI / 2, 0, 0]}>
          <GCylinder args={[0.025, 0.025, 0.06, 6]} />
          <StdMat color={colors.decal} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/** Impulsor: a long, flat-decked armoured skimmer in the faction's primary colour, with a forward multi-melta barrel and a pair of
 *  storm-bolter pods on the prow, a bone-coloured troop-bay rim and a translucent shield dome over the deck, a cross painted on the
 *  roof, and glowing grav pads under side sponsons. */
function ImpulsorParts({ colors }: { colors: BodyProps['colors'] }) {
  return (
    <group>
      {/* hull and sloped prow */}
      <mesh position={[0, 0.34, -0.05]}>
        <GBox args={[0.78, 0.26, 1.2]} />
        <StdMat color={colors.primary} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.3, 0.68]} rotation={[0.45, 0, 0]}>
        <GBox args={[0.74, 0.22, 0.36]} />
        <StdMat color={colors.primary} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* bone troop-bay rim around the open deck */}
      <mesh position={[0, 0.49, -0.12]}>
        <GBox args={[0.7, 0.05, 0.8]} />
        <StdMat color={colors.secondary} roughness={0.6} />
      </mesh>
      {/* shield-generator dome */}
      <mesh position={[0, 0.5, -0.12]}>
        <GSphere args={[0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <StdMat color={colors.metal} metalness={0.5} roughness={0.35} />
      </mesh>
      {/* roof cross */}
      <mesh position={[0, 0.465, 0.38]}>
        <GBox args={[0.34, 0.012, 0.09]} />
        <StdMat color={colors.decal} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.467, 0.38]}>
        <GBox args={[0.09, 0.012, 0.34]} />
        <StdMat color={colors.decal} roughness={0.6} />
      </mesh>
      {/* side sponsons with grav pads underneath */}
      {[-0.5, 0.5].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.3, -0.05]}>
            <GBox args={[0.2, 0.2, 0.95]} />
            <StdMat color={colors.primary} roughness={0.55} metalness={0.2} />
          </mesh>
          <mesh position={[x, 0.18, -0.05]}>
            <GBox args={[0.22, 0.03, 0.8]} />
            <StdMat color={colors.trim} emissive={colors.trim} emissiveIntensity={1.1} roughness={0.4} />
          </mesh>
          <mesh position={[x * 0.55, 0.42, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.025, 0.025, 0.3, 6]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* multi-melta barrel on the nose */}
      <mesh position={[0, 0.36, 0.95]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.055, 0.045, 0.42, 8]} />
        <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* red trim stripe along the flanks */}
      <mesh position={[0, 0.42, -0.05]}>
        <GBox args={[0.8, 0.03, 1.0]} />
        <StdMat color={colors.trim} roughness={0.5} />
      </mesh>
      {/* rear thruster */}
      <mesh position={[0, 0.34, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.1, 0.1, 0.06, 10]} />
        <StdMat color={colors.trim} emissive={colors.trim} emissiveIntensity={1.4} />
      </mesh>
    </group>
  )
}

const GOGGLE = '#ffb347'

/** Hernkyn Pioneer: a squat wheel-less grav-bike with glowing amber thruster pads, a twin nose autocannon and a holstered
 *  shotgun, ridden by a stocky Kin scout in a slate flight suit. `rig` adds the bike's one distinguishing kit:
 *  a tall comms mast, a roll-bar searchlight or a multi-barrel rotary cannon. */
function GravbikeParts({ colors, rig, gunRef }: { colors: BodyProps['colors']; rig: VehicleConfig['rig']; gunRef: React.RefObject<Group> }) {
  return (
    <group>
      {/* hull and nose wedge */}
      <mesh position={[0, 0.34, -0.02]}>
        <GBox args={[0.36, 0.2, 0.92]} />
        <StdMat color={colors.primary} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.32, 0.5]} rotation={[0.35, 0, 0]}>
        <GBox args={[0.32, 0.14, 0.34]} />
        <StdMat color={colors.primary} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.45, -0.02]}>
        <GBox args={[0.38, 0.03, 0.94]} />
        <StdMat color={colors.trim} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* amber grav pads under the hull, no wheels */}
      {[-0.28, 0.28].map((z) => (
        <mesh key={z} position={[0, 0.2, z]}>
          <GBox args={[0.46, 0.04, 0.26]} />
          <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.3} roughness={0.4} />
        </mesh>
      ))}
      {/* side intake pods */}
      {[-0.23, 0.23].map((x) => (
        <mesh key={x} position={[x, 0.3, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <GCylinder args={[0.06, 0.06, 0.6, 8]} />
          <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* the rider: stocky body, cream beard, goggles */}
      <mesh position={[0, 0.66, -0.12]}>
        <GBox args={[0.3, 0.28, 0.22]} />
        <StdMat color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.88, -0.1]}>
        <GSphere args={[0.12, 12, 9]} />
        <StdMat color={colors.primary} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.88, 0.0]}>
        <GBox args={[0.18, 0.06, 0.05]} />
        <StdMat color={GOGGLE} emissive={GOGGLE} emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 0.78, 0.0]}>
        <GBox args={[0.16, 0.12, 0.08]} />
        <StdMat color={colors.decal} roughness={0.85} />
      </mesh>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.62, 0.08]} rotation={[0.9, 0, 0]}>
          <GCylinder args={[0.04, 0.04, 0.26, 6]} />
          <StdMat color={colors.primary} roughness={0.6} />
        </mesh>
      ))}
      {/* twin nose autocannon (recoils with the shoot pose) and a holstered shotgun */}
      <group ref={gunRef} position={[0, 0.4, 0.62]}>
        {[-0.04, 0.04].map((x) => (
          <mesh key={x} position={[x, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.025, 0.025, 0.34, 7]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 0, -0.02]}>
          <GBox args={[0.14, 0.1, 0.14]} />
          <StdMat color={colors.trim} roughness={0.5} metalness={0.4} />
        </mesh>
      </group>
      <mesh position={[0.22, 0.46, -0.1]} rotation={[Math.PI / 2, 0, 0.12]}>
        <GCylinder args={[0.018, 0.018, 0.4, 6]} />
        <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      {rig === 'comms' && (
        <group position={[0, 0.45, -0.4]}>
          <mesh position={[0, 0.4, 0]}>
            <GCylinder args={[0.012, 0.012, 0.8, 5]} />
            <StdMat color={colors.metal} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.74, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.1, 0.1, 0.02, 14]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={0.5} roughness={0.5} />
          </mesh>
        </group>
      )}
      {rig === 'searchlight' && (
        <group position={[0, 0.46, -0.32]}>
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x, 0.3, 0]}>
              <GCylinder args={[0.018, 0.018, 0.6, 6]} />
              <StdMat color={colors.metal} metalness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.6, 0]}>
            <GBox args={[0.44, 0.03, 0.03]} />
            <StdMat color={colors.metal} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.66, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.06, 0.07, 0.1, 10]} />
            <StdMat color="#fff4c9" emissive="#fff4c9" emissiveIntensity={1.8} />
          </mesh>
        </group>
      )}
      {rig === 'rotary' && (
        <group position={[0.26, 0.5, 0.2]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[Math.cos((i / 6) * Math.PI * 2) * 0.035, Math.sin((i / 6) * Math.PI * 2) * 0.035, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.014, 0.014, 0.42, 5]} />
              <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0]}>
            <GBox args={[0.14, 0.14, 0.2]} />
            <StdMat color={colors.trim} roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/** Drukhari skimmer: a long, low, knife-edged hull with a swept prow blade, raised rear fins and a teal engine glow.
 *  `gunboat` (Ravager) swaps the open deck for a raised gun platform with a bank of three lance barrels; the default
 *  (Raider) keeps an open passenger deck with a prow cannon. Hull runs along Z (prow at +Z), about 2 units long. */
function SkiffParts({ colors, gunboat }: { colors: BodyProps['colors']; gunboat: boolean }) {
  const width = gunboat ? 0.62 : 0.5
  return (
    <group>
      {/* hover glow under the keel */}
      <mesh position={[0, 0.12, -0.05]}>
        <GBox args={[width * 0.8, 0.03, 1.5]} />
        <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.1} roughness={0.4} />
      </mesh>
      {/* main hull */}
      <mesh position={[0, 0.26, -0.1]}>
        <GBox args={[width, 0.2, 1.5]} />
        <StdMat color={colors.primary} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* swept prow: a wedge dropping to a point */}
      <mesh position={[0, 0.27, 0.86]} rotation={[Math.PI / 2, Math.PI / 4, 0]} scale={[1, 1, 0.4]}>
        <GCone args={[width * 0.62, 0.55, 4]} />
        <StdMat color={colors.primary} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* crimson prow blade along the keel line */}
      <mesh position={[0, 0.3, 1.05]} rotation={[Math.PI / 2, 0, 0]}>
        <GCone args={[0.05, 0.4, 4]} />
        <StdMat color={colors.trim} roughness={0.4} metalness={0.4} />
      </mesh>
      {/* side blades */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 + 0.06), 0.3, 0.1]} rotation={[0, 0, side * 0.35]}>
          <GBox args={[0.04, 0.2, 1.2]} />
          <StdMat color={colors.metal} roughness={0.35} metalness={0.7} />
        </mesh>
      ))}
      {/* tall twin tail fins */}
      {[-1, 1].map((side) => (
        <mesh key={`fin${side}`} position={[side * width * 0.32, 0.55, -0.78]} rotation={[-0.3, 0, side * 0.12]}>
          <GBox args={[0.03, 0.5, 0.3]} />
          <StdMat color={colors.trim} roughness={0.5} />
        </mesh>
      ))}
      {/* engine glow */}
      <mesh position={[0, 0.28, -0.88]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.12, 0.12, 0.05, 10]} />
        <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.6} />
      </mesh>
      {gunboat ? (
        <>
          {/* raised gun platform and the lance bank */}
          <mesh position={[0, 0.5, 0.05]}>
            <GBox args={[width * 0.8, 0.22, 0.6]} />
            <StdMat color={colors.secondary} roughness={0.45} metalness={0.2} />
          </mesh>
          {[-0.17, 0, 0.17].map((x) => (
            <mesh key={x} position={[x, 0.55 + (x === 0 ? 0.04 : 0), 0.6]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.04, 0.05, 0.75, 8]} />
              <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          {[-0.17, 0, 0.17].map((x) => (
            <mesh key={`tip${x}`} position={[x, 0.55 + (x === 0 ? 0.04 : 0), 1.0]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.025, 0.025, 0.04, 8]} />
              <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.6} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* open deck with raked passenger rails, and a chin cannon */}
          <mesh position={[0, 0.38, -0.2]}>
            <GBox args={[width * 0.7, 0.06, 0.9]} />
            <StdMat color="#15171c" roughness={0.6} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={`rail${side}`} position={[side * width * 0.4, 0.46, -0.2]}>
              <GBox args={[0.03, 0.12, 0.9]} />
              <StdMat color={colors.primary} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.42, 0.55]}>
            <GBox args={[0.16, 0.12, 0.2]} />
            <StdMat color={colors.secondary} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.42, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.035, 0.045, 0.3, 8]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  )
}

/** Windrider: a slim cream jetbike with a teal nose cone, swept stabiliser fins, a glowing engine strip and a crouched rider
 *  in a crested helm. The weapon (twin shuriken catapults or a scatter laser) rides on the nose through `gunRef` for recoil. */
function JetbikeParts({ colors, weapon, gunRef }: { colors: BodyProps['colors']; weapon: VehicleConfig['weapon']; gunRef: RefObject<Group> }) {
  return (
    <group>
      <mesh position={[0, 0.2, -0.02]}>
        <GBox args={[0.26, 0.03, 0.8]} />
        <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.0} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <GCapsule args={[0.12, 0.6, 4, 10]} />
        <StdMat color={colors.primary} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.3, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
        <GCone args={[0.11, 0.28, 8]} />
        <StdMat color={colors.secondary} roughness={0.45} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.2, 0.34, -0.34]} rotation={[0, s * 0.45, s * 0.25]}>
          <GBox args={[0.3, 0.025, 0.22]} />
          <StdMat color={colors.trim} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.34, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.07, 0.09, 0.08, 10]} />
        <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.34, -0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <GCylinder args={[0.055, 0.055, 0.03, 10]} />
        <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.6} />
      </mesh>
      {/* rider: teal suit, crested cream helm, leaning into the wind */}
      <group position={[0, 0.5, -0.05]} rotation={[0.35, 0, 0]}>
        <mesh position={[0, 0.1, 0]}>
          <GBox args={[0.18, 0.22, 0.12]} />
          <StdMat color={colors.secondary} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.3, 0.02]}>
          <GSphere args={[0.1, 10, 8]} />
          <StdMat color={colors.primary} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.4, -0.05]} rotation={[-0.7, 0, 0]}>
          <GBox args={[0.03, 0.16, 0.08]} />
          <StdMat color={colors.secondary} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.3, 0.1]}>
          <GBox args={[0.1, 0.025, 0.03]} />
          <StdMat color="#15171c" roughness={0.2} />
        </mesh>
      </group>
      {weapon !== 'none' && (
        <group ref={gunRef} position={[0, 0.3, 0.5]}>
          {weapon === 'scatter-laser' ? (
            <>
              <mesh position={[0, -0.06, 0.04]}>
                <GBox args={[0.12, 0.1, 0.2]} />
                <StdMat color={colors.metal} metalness={0.5} roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.06, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
                <GCylinder args={[0.035, 0.035, 0.3, 8]} />
                <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
              </mesh>
              <mesh position={[0, -0.06, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
                <GCylinder args={[0.045, 0.045, 0.03, 8]} />
                <StdMat color="#ff5a46" emissive="#ff5a46" emissiveIntensity={1.4} />
              </mesh>
            </>
          ) : (
            [-0.1, 0.1].map((x) => (
              <group key={x} position={[x, -0.02, 0]}>
                <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                  <GCylinder args={[0.022, 0.022, 0.34, 8]} />
                  <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
                  <GCylinder args={[0.03, 0.03, 0.02, 8]} />
                  <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.3} />
                </mesh>
              </group>
            ))
          )}
        </group>
      )}
    </group>
  )
}

/** Heavy Weapon Platform: a floating cream grav-platform with a curved shield wall, a glowing underside and a thick starcannon on a pivot. */
function PlatformParts({ colors, gunRef }: { colors: BodyProps['colors']; gunRef: RefObject<Group> }) {
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <GCylinder args={[0.42, 0.4, 0.04, 14]} />
        <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.0} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <GCylinder args={[0.4, 0.42, 0.12, 14]} />
        <StdMat color={colors.primary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.3, 0.0]}>
        <GCylinder args={[0.4, 0.4, 0.02, 14]} />
        <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.5, -0.3]} rotation={[-0.15, 0, 0]}>
        <GBox args={[0.62, 0.38, 0.05]} />
        <StdMat color={colors.primary} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.5, -0.33]} rotation={[-0.15, 0, 0]}>
        <GBox args={[0.2, 0.2, 0.02]} />
        <StdMat color={colors.secondary} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.4, 0.02]}>
        <GCylinder args={[0.05, 0.07, 0.18, 8]} />
        <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={gunRef} position={[0, 0.52, 0.02]}>
        <mesh position={[0, 0, -0.02]}>
          <GBox args={[0.16, 0.14, 0.22]} />
          <StdMat color={colors.secondary} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <GCylinder args={[0.05, 0.06, 0.4, 8]} />
          <StdMat color={colors.metal} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.47]} rotation={[Math.PI / 2, 0, 0]}>
          <GCylinder args={[0.065, 0.065, 0.04, 8]} />
          <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.4} />
        </mesh>
      </group>
    </group>
  )
}
