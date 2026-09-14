// Chunky, low-poly primitive builders shared across kits. Everything here is deliberately
// rounded/oversized (30-figures.md §1: "no thin parts < 0.03", weapons "oversized ×1.4") so the
// silhouette still reads at tabletop zoom. Geometry is authored in the unit-height (H=1) space
// that BipedBody/VehicleBody use; Figure scales the whole assembled group to the real height.
import type { PaintColors, WeaponShape } from './types'

/** A big, slightly-flattened sphere — the chibi head blob every kit head shape starts from. */
export function HeadBlob({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh position={[0, 0, 0]} scale={[1, 0.92, 1.05]}>
      <sphereGeometry args={[radius, 14, 10]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  )
}

/** A stubby capsule limb segment, pivoted at its top (the group this is placed in is the joint). */
export function LimbSegment({ length, radius, color, metalness = 0 }: { length: number; radius: number; color: string; metalness?: number }) {
  const capLen = Math.max(length - radius * 2, radius * 0.5)
  return (
    <mesh position={[0, -length / 2, 0]}>
      <capsuleGeometry args={[radius, capLen, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={metalness} />
    </mesh>
  )
}

/** A chunky boot/fist block capping a limb. */
export function EndBlock({ size, color, metalness = 0 }: { size: number; color: string; metalness?: number }) {
  return (
    <mesh position={[0, -size / 2, size * 0.15]}>
      <boxGeometry args={[size * 1.15, size, size * 1.3]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={metalness} />
    </mesh>
  )
}

function Barrel({ length, radius, color }: { length: number; radius: number; color: string }) {
  return (
    <mesh position={[0, 0, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius * 1.1, length, 8]} />
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.7} />
    </mesh>
  )
}

function Blade({ length, width, color }: { length: number; width: number; color: string }) {
  return (
    <mesh position={[0, 0, length / 2]} rotation={[0, 0, 0]}>
      <boxGeometry args={[width * 0.25, width, length]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.6} />
    </mesh>
  )
}

function PincerClaw({ size, color, open = 0.35 }: { size: number; color: string; open?: number }) {
  return (
    <group>
      <mesh position={[0, size * 0.15, size * 0.35]} rotation={[open, 0, 0]}>
        <boxGeometry args={[size * 0.55, size * 0.22, size]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.65} />
      </mesh>
      <mesh position={[0, -size * 0.15, size * 0.35]} rotation={[-open, 0, 0]}>
        <boxGeometry args={[size * 0.55, size * 0.22, size]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.65} />
      </mesh>
    </group>
  )
}

/** Renders a WeaponShape at the origin, weapon pointing along +Z (forward), sized for a hand at
 *  the local origin. `hand` fills empty/'none' slots with a plain gauntlet fist so an arm never
 *  ends in nothing. */
export function WeaponMesh({ shape, colors, hand }: { shape: WeaponShape; colors: PaintColors; hand: string }) {
  switch (shape) {
    case 'bolt-rifle':
      return (
        <group scale={1.4}>
          <Barrel length={0.34} radius={0.028} color={colors.metal} />
          <mesh position={[0, -0.01, 0.06]}>
            <boxGeometry args={[0.05, 0.07, 0.16]} />
            <meshStandardMaterial color={colors.primary} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'storm-bolter':
      return (
        <group scale={1.4}>
          <mesh position={[-0.02, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.26, 6]} />
            <meshStandardMaterial color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0.02, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.26, 6]} />
            <meshStandardMaterial color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.1, 0.1, 0.14]} />
            <meshStandardMaterial color={colors.secondary} roughness={0.55} />
          </mesh>
        </group>
      )
    case 'power-fist':
      return (
        <group scale={1.5}>
          <mesh>
            <boxGeometry args={[0.14, 0.14, 0.18]} />
            <meshStandardMaterial color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.02, 0.11]}>
            <boxGeometry args={[0.16, 0.03, 0.03]} />
            <meshStandardMaterial color={colors.trim} emissive={colors.trim} emissiveIntensity={0.6} />
          </mesh>
        </group>
      )
    case 'slugga':
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[0.05, 0.06, 0.13]} />
            <meshStandardMaterial color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <boxGeometry args={[0.04, 0.06, 0.04]} />
            <meshStandardMaterial color={colors.trim} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'choppa':
      return (
        <group scale={1.4}>
          <Blade length={0.3} width={0.14} color={colors.trim} />
          <mesh position={[0, 0, -0.03]}>
            <boxGeometry args={[0.045, 0.09, 0.08]} />
            <meshStandardMaterial color={colors.metal} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'boss-choppa':
      return (
        <group scale={1.9}>
          <Blade length={0.32} width={0.17} color={colors.trim} />
          <mesh position={[0, 0, -0.04]}>
            <boxGeometry args={[0.06, 0.11, 0.1]} />
            <meshStandardMaterial color={colors.metal} roughness={0.55} />
          </mesh>
        </group>
      )
    case 'power-klaw':
      return (
        <group scale={2.1}>
          <PincerClaw size={0.24} color={colors.metal} />
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.05, 0.05, 0.14]} />
            <meshStandardMaterial color={colors.trim} emissive={colors.trim} emissiveIntensity={0.5} />
          </mesh>
        </group>
      )
    case 'twin-claw':
      return (
        <group scale={1.6}>
          <PincerClaw size={0.32} color={colors.metal} open={0.45} />
        </group>
      )
    case 'none':
    default:
      return <EndBlock size={0.09} color={hand} />
  }
}
