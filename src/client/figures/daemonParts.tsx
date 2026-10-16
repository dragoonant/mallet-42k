// Chaos Daemons (Khorne) dressing for the procedural figure kit: the horned Bloodletter and Bloodmaster heads, the
// hellblade / blood-blade / war-horn / icon weapons, tail and bat wings for the biped rig, and the Flesh Hound and
// Juggernaut heads and flanks for the beast rig (HoundBody). Original SD shapes from the shared primitive set; colours
// all come from the faction paintScheme (blood-red primary, dark secondary, brass trim, steel metal, bone decal) so a
// repaint recolours every part. Weapons point along +Z from a hand at the local origin.
import { GBox, GCone, GCylinder, GSphere, StdMat } from './shared'
import type { BipedConfig, PaintColors, WeaponShape } from './types'

const FIRE = '#ffb347'
const HOT = '#ff5a1f'

function Blob({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh scale={[1, 0.92, 1.05]}>
      <GSphere args={[radius, 14, 10]} />
      <StdMat color={color} roughness={0.6} />
    </mesh>
  )
}

export type DaemonHeadShape = 'bloodletter-head' | 'bloodmaster-head'
export const DAEMON_HEADS: ReadonlySet<string> = new Set<DaemonHeadShape>(['bloodletter-head', 'bloodmaster-head'])

/** A red, snarling face: slit glowing eyes, a heavy fanged jaw and swept-back brass horns. The Bloodmaster's horns are
 *  taller and a brass brow band marks the rank. */
export function DaemonHead({ shape, colors, radius }: { shape: DaemonHeadShape; colors: PaintColors; radius: number }) {
  const r = radius
  const master = shape === 'bloodmaster-head'
  const horn = master ? 1.45 : 1
  return (
    <group>
      <Blob radius={r} color={colors.primary} />
      {/* heavy brow */}
      <mesh position={[0, r * 0.3, r * 0.82]}>
        <GBox args={[r * 1.3, r * 0.2, r * 0.3]} />
        <StdMat color={colors.secondary} roughness={0.7} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`eye${s}`} position={[s * r * 0.36, r * 0.08, r * 0.9]}>
          <GBox args={[r * 0.3, r * 0.14, r * 0.12]} />
          <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={master ? 2.2 : 1.6} />
        </mesh>
      ))}
      {/* jaw and fangs */}
      <mesh position={[0, -r * 0.6, r * 0.5]}>
        <GBox args={[r * 1.15, r * 0.45, r * 0.8]} />
        <StdMat color={colors.primary} roughness={0.65} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`fang${s}`} position={[s * r * 0.34, -r * 0.3, r * 0.88]}>
          <GCone args={[r * 0.1, r * 0.3, 5]} />
          <StdMat color={colors.decal} roughness={0.4} />
        </mesh>
      ))}
      {/* swept-back horns, outward splay */}
      {[-1, 1].map((s) => (
        <mesh key={`horn${s}`} position={[s * r * 0.6, r * 0.95, -r * 0.1]} rotation={[-0.7, 0, s * 0.45]}>
          <GCone args={[r * 0.17 * horn, r * 0.85 * horn, 6]} />
          <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {master && (
        <>
          <mesh position={[0, r * 0.62, r * 0.1]}>
            <GBox args={[r * 1.9, r * 0.14, r * 1.7]} />
            <StdMat color={colors.trim} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, r * 1.1, -r * 0.55]} rotation={[-0.6, 0, 0]}>
            <GCone args={[r * 0.14, r * 0.7, 5]} />
            <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
          </mesh>
        </>
      )}
    </group>
  )
}

export const DAEMON_WEAPONS: ReadonlySet<WeaponShape> = new Set<WeaponShape>(['hellblade', 'blood-blade', 'war-horn', 'daemon-icon'])

export function DaemonWeapon({ shape, colors }: { shape: WeaponShape; colors: PaintColors }) {
  switch (shape) {
    case 'hellblade':
    case 'blood-blade': {
      const big = shape === 'blood-blade'
      return (
        <group scale={big ? 1.75 : 1.4}>
          <mesh position={[0, 0, -0.01]}>
            <GBox args={[0.035, 0.035, 0.1]} />
            <StdMat color={colors.secondary} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <GBox args={[0.02, 0.12, 0.03]} />
            <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
          </mesh>
          {/* broad steel blade with a glowing red fuller and a notched back edge */}
          <mesh position={[0, 0, 0.24]}>
            <GBox args={[0.016, big ? 0.085 : 0.06, 0.36]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0.009, 0, 0.24]}>
            <GBox args={[0.006, 0.02, 0.32]} />
            <StdMat color={colors.primary} emissive={colors.primary} emissiveIntensity={1.6} />
          </mesh>
          {[0.14, 0.24, 0.34].map((z) => (
            <mesh key={z} position={[0, 0.04, z]} rotation={[0.5, 0, 0]}>
              <GBox args={[0.016, 0.03, 0.05]} />
              <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
        </group>
      )
    }
    case 'war-horn':
      // A brass horn held forward: narrow mouthpiece at the hand, wide flared bell ahead of it.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0.02, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
            <GCone args={[0.075, 0.3, 8]} />
            <StdMat color={colors.trim} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.02, 0.31]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.08, 0.08, 0.02, 10]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'daemon-icon':
      // A tall pole with a blood-red diamond plate and a bone-coloured rune: the Daemonic Icon.
      return (
        <group>
          <mesh position={[0, 0.3, 0]}>
            <GCylinder args={[0.014, 0.014, 0.66, 6]} />
            <StdMat color={colors.trim} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.56, 0]} rotation={[0, 0, Math.PI / 4]}>
            <GBox args={[0.17, 0.17, 0.025]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.56, 0.016]} rotation={[0, 0, Math.PI / 4]}>
            <GBox args={[0.08, 0.08, 0.012]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={0.9} />
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <GCone args={[0.03, 0.1, 5]} />
            <StdMat color={colors.trim} metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

/** Tail and bat wings for a biped daemon, drawn in the torso's local space (origin at the hip line, back is -Z). */
export function DaemonDressing({ config, colors, torsoWidth, torsoDepth, torsoHeight }: { config: BipedConfig; colors: PaintColors; torsoWidth: number; torsoDepth: number; torsoHeight: number }) {
  if (!config.daemonTail && !config.daemonWings) return null
  const tailLen = torsoHeight * 1.5
  return (
    <>
      {config.daemonTail && (
        <group position={[0, 0.03, -torsoDepth / 2]} rotation={[-1.97, 0, 0]}>
          <mesh position={[0, tailLen / 2, 0]}>
            <GCone args={[torsoWidth * 0.17, tailLen, 6]} />
            <StdMat color={colors.primary} roughness={0.65} />
          </mesh>
          <mesh position={[0, tailLen, 0]} rotation={[0, 0, 0]}>
            <GCone args={[torsoWidth * 0.12, torsoWidth * 0.3, 4]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      )}
      {config.daemonWings &&
        [-1, 1].map((s) => (
          <group key={s} position={[s * torsoWidth * 0.22, torsoHeight * 0.85, -torsoDepth / 2 - 0.03]} rotation={[-0.35, 0, s * 0.85]}>
            <mesh position={[0, 0.17, 0]}>
              <GBox args={[0.14, 0.36, 0.014]} />
              <StdMat color={colors.secondary} roughness={0.8} />
            </mesh>
            <mesh position={[0.05 * s, 0.2, 0.004]}>
              <GCylinder args={[0.011, 0.011, 0.42, 5]} />
              <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
            </mesh>
          </group>
        ))}
    </>
  )
}

/** Head of a Flesh Hound / Gore Hound: a wide fanged maw, two small horns, glowing eyes. The Gore Hound's mouth glows with
 *  the fire of its burning roar. Local origin is the neck, snout toward +Z. */
export function HoundDaemonHead({ colors, fire }: { colors: PaintColors; fire: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0.1]}>
        <GBox args={[0.22, 0.17, 0.3]} />
        <StdMat color={colors.primary} roughness={0.6} />
      </mesh>
      {/* lower jaw hangs a little open, with fangs up and down */}
      <mesh position={[0, -0.09, 0.15]} rotation={[0.18, 0, 0]}>
        <GBox args={[0.19, 0.05, 0.28]} />
        <StdMat color={colors.secondary} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.04, 0.17]}>
        <GBox args={[0.15, 0.04, 0.2]} />
        <StdMat color={fire ? HOT : '#5a0d0a'} emissive={fire ? HOT : undefined} emissiveIntensity={fire ? 1.8 : undefined} roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.07, -0.01, 0.27]} rotation={[Math.PI, 0, 0]}>
            <GCone args={[0.022, 0.07, 5]} />
            <StdMat color={colors.decal} roughness={0.4} />
          </mesh>
          <mesh position={[s * 0.06, -0.08, 0.27]}>
            <GCone args={[0.02, 0.06, 5]} />
            <StdMat color={colors.decal} roughness={0.4} />
          </mesh>
          <mesh position={[s * 0.07, 0.09, 0.21]}>
            <GSphere args={[0.028, 8, 6]} />
            <StdMat color={colors.decal} emissive={fire ? FIRE : colors.decal} emissiveIntensity={2.2} />
          </mesh>
          <mesh position={[s * 0.1, 0.16, 0.0]} rotation={[-0.5, 0, s * 0.35]}>
            <GCone args={[0.035, 0.14, 5]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* brass collar of Khorne */}
      <mesh position={[0, 0.0, -0.04]}>
        <GBox args={[0.26, 0.2, 0.05]} />
        <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}

/** Head of a Juggernaut: a low armoured skull-plate with one long forward-sweeping bladed horn and a wide brass faceplate. */
export function JuggernautHead({ colors }: { colors: PaintColors }) {
  return (
    <group>
      <mesh position={[0, 0.0, 0.1]}>
        <GBox args={[0.3, 0.22, 0.3]} />
        <StdMat color={colors.primary} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.0, 0.26]}>
        <GBox args={[0.26, 0.18, 0.04]} />
        <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.09, 0.05, 0.29]}>
          <GSphere args={[0.026, 8, 6]} />
          <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={2} />
        </mesh>
      ))}
      {/* the bladed horn: thick root, long brass spike angled forward and up */}
      <mesh position={[0, 0.2, 0.2]} rotation={[1.0, 0, 0]}>
        <GCone args={[0.06, 0.4, 6]} />
        <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.13, 0.12]}>
        <GBox args={[0.1, 0.1, 0.12]} />
        <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.17, 0.1, 0.0]} rotation={[-0.2, 0, s * 0.8]}>
          <GCone args={[0.03, 0.14, 5]} />
          <StdMat color={colors.trim} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}
