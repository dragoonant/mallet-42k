// Thousand Sons dressing for the procedural figure kit: the Rubric helm of the Scarab Occult Terminators, the crowned
// sorcerer helm of Ahrak, the horned beak-head of a Tzaangor, plus a curved khopesh and a missile rack. Kept in one file
// so the shared BipedBody / primitives only need a one-line hook each. Authored in the same unit-height space as the
// rest of the kit; weapons point along +Z from a hand at the local origin. Colours come from the faction paintScheme
// (blue primary, gold secondary, bone trim, brass metal, cyan decal for every glowing eye), so a repaint recolours them.
import { GBox, GCone, GCylinder, GSphere, StdMat } from './shared'
import type { PaintColors, WeaponShape } from './types'

const BEAK = '#d9c58a'
const DARK = '#12151c'

function Blob({ radius, color, flat = 1 }: { radius: number; color: string; flat?: number }) {
  return (
    <mesh scale={[1, 0.95 * flat, 1.05]}>
      <GSphere args={[radius, 14, 10]} />
      <StdMat color={color} roughness={0.55} />
    </mesh>
  )
}

function Eye({ x, y, z, size, color }: { x: number; y: number; z: number; size: number; color: string }) {
  return (
    <mesh position={[x, y, z]}>
      <GBox args={[size, size * 0.6, size * 0.5]} />
      <StdMat color={color} emissive={color} emissiveIntensity={2} />
    </mesh>
  )
}

export type ThsHeadShape = 'rubric-helm' | 'ths-sorcerer' | 'tzaangor-head'
export const THS_HEADS: ReadonlySet<string> = new Set<ThsHeadShape>(['rubric-helm', 'ths-sorcerer', 'tzaangor-head'])

export function ThsHead({ shape, colors, radius }: { shape: ThsHeadShape; colors: PaintColors; radius: number }) {
  const r = radius
  switch (shape) {
    case 'rubric-helm':
      // A tall, pointed gold-and-blue helm with two cyan eye slits, a bone grille and a swept crest: the quick read for Rubric armour.
      return (
        <group>
          <Blob radius={r * 1.05} color={colors.primary} />
          <Eye x={-r * 0.34} y={r * 0.05} z={r * 0.95} size={r * 0.34} color={colors.decal} />
          <Eye x={r * 0.34} y={r * 0.05} z={r * 0.95} size={r * 0.34} color={colors.decal} />
          <mesh position={[0, -r * 0.45, r * 0.85]}>
            <GBox args={[r * 0.6, r * 0.3, r * 0.22]} />
            <StdMat color={colors.trim} roughness={0.45} metalness={0.5} />
          </mesh>
          <mesh position={[0, r * 1.1, 0]}>
            <GCone args={[r * 0.55, r * 1.1, 6]} />
            <StdMat color={colors.secondary} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, r * 0.7, -r * 0.55]} rotation={[-0.6, 0, 0]}>
            <GBox args={[r * 0.14, r * 0.9, r * 0.35]} />
            <StdMat color={colors.secondary} roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      )
    case 'ths-sorcerer':
      // An unhelmed sorcerer in a tall double crown with a glowing third-eye gem and a bone mask.
      return (
        <group>
          <Blob radius={r} color={colors.trim} />
          <Eye x={-r * 0.34} y={r * 0.1} z={r * 0.92} size={r * 0.3} color={colors.decal} />
          <Eye x={r * 0.34} y={r * 0.1} z={r * 0.92} size={r * 0.3} color={colors.decal} />
          <mesh position={[0, r * 0.52, r * 0.9]}>
            <GSphere args={[r * 0.14, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={2.2} />
          </mesh>
          <mesh position={[0, r * 0.95, 0]}>
            <GCylinder args={[r * 0.55, r * 0.8, r * 0.5, 8]} />
            <StdMat color={colors.secondary} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[0, r * 1.55, 0]}>
            <GCylinder args={[r * 0.25, r * 0.5, r * 0.7, 8]} />
            <StdMat color={colors.primary} roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh position={[0, r * 2.0, 0]}>
            <GCone args={[r * 0.25, r * 0.5, 6]} />
            <StdMat color={colors.secondary} roughness={0.35} metalness={0.7} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * r * 0.75, r * 0.9, -r * 0.1]} rotation={[0, 0, -s * 0.8]}>
              <GCone args={[r * 0.14, r * 0.7, 5]} />
              <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
            </mesh>
          ))}
        </group>
      )
    case 'tzaangor-head':
      // A mutant beastman: a long hooked bone beak, two big yellow eyes and a pair of swept horns, topped by a feathered crest.
      return (
        <group>
          <Blob radius={r} color={colors.primary} />
          <mesh position={[0, -r * 0.15, r * 1.05]} rotation={[Math.PI / 2 + 0.3, 0, 0]}>
            <GCone args={[r * 0.38, r * 0.95, 6]} />
            <StdMat color={BEAK} roughness={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * r * 0.45, r * 0.25, r * 0.78]}>
                <GSphere args={[r * 0.2, 8, 6]} />
                <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.4} />
              </mesh>
              <mesh position={[s * r * 0.45, r * 0.25, r * 0.95]}>
                <GSphere args={[r * 0.08, 6, 5]} />
                <StdMat color={DARK} roughness={0.3} />
              </mesh>
              <mesh position={[s * r * 0.7, r * 0.75, -r * 0.1]} rotation={[0.3, 0, -s * 0.65]}>
                <GCone args={[r * 0.2, r * 1.0, 6]} />
                <StdMat color={BEAK} roughness={0.5} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, r * 0.95, -r * 0.2]} rotation={[-0.4, 0, 0]}>
            <GBox args={[r * 0.3, r * 0.6, r * 0.7]} />
            <StdMat color={colors.secondary} roughness={0.7} />
          </mesh>
        </group>
      )
  }
}

export type ThsWeaponShape = 'khopesh' | 'missile-rack'
export const THS_WEAPONS: ReadonlySet<string> = new Set<ThsWeaponShape>(['khopesh', 'missile-rack'])

export function ThsWeapon({ shape, colors }: { shape: WeaponShape; colors: PaintColors }) {
  switch (shape) {
    case 'khopesh':
      // A sickle-sword: a straight grip, then a blade that sweeps over into a hook, with a cyan edge glow.
      return (
        <group scale={1.5}>
          <mesh position={[0, 0, 0.02]}>
            <GBox args={[0.035, 0.035, 0.14]} />
            <StdMat color={colors.secondary} roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0.2]}>
            <GBox args={[0.012, 0.09, 0.2]} />
            <StdMat color={colors.metal} roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.09, 0.32]} rotation={[0.9, 0, 0]}>
            <GBox args={[0.012, 0.08, 0.14]} />
            <StdMat color={colors.metal} roughness={0.3} metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.08, 0.22]}>
            <GBox args={[0.006, 0.012, 0.22]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.6} />
          </mesh>
        </group>
      )
    case 'missile-rack':
      // A shoulder-height block of four warheads with brass nose cones.
      return (
        <group scale={1.3}>
          <mesh position={[0, 0, 0.1]}>
            <GBox args={[0.14, 0.12, 0.24]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
          </mesh>
          {[-1, 1].flatMap((x) => [-1, 1].map((y) => (
            <group key={`${x}${y}`} position={[x * 0.035, y * 0.03, 0.22]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <GCylinder args={[0.022, 0.022, 0.12, 8]} />
                <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
              </mesh>
              <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                <GCone args={[0.022, 0.06, 8]} />
                <StdMat color={colors.secondary} roughness={0.35} metalness={0.7} />
              </mesh>
            </group>
          )))}
        </group>
      )
    default:
      return null
  }
}
