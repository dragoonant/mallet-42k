// Chunky, low-poly primitive builders shared across kits. Everything here is deliberately
// rounded/oversized (30-figures.md §1: "no thin parts < 0.03", weapons "oversized ×1.4") so the
// silhouette still reads at tabletop zoom. Geometry is authored in the unit-height (H=1) space
// that BipedBody/VehicleBody use; Figure scales the whole assembled group to the real height.
import { GBox, GCapsule, GCone, GCylinder, GSphere, StdMat } from './shared'
import type { PaintColors, WeaponShape } from './types'

/** A big, slightly-flattened sphere — the chibi head blob every kit head shape starts from. */
export function HeadBlob({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh position={[0, 0, 0]} scale={[1, 0.92, 1.05]}>
      <GSphere args={[radius, 14, 10]} />
      <StdMat color={color} roughness={0.55} />
    </mesh>
  )
}

/** A stubby capsule limb segment, pivoted at its top (the group this is placed in is the joint). */
export function LimbSegment({ length, radius, color, metalness = 0 }: { length: number; radius: number; color: string; metalness?: number }) {
  const capLen = Math.max(length - radius * 2, radius * 0.5)
  return (
    <mesh position={[0, -length / 2, 0]}>
      <GCapsule args={[radius, capLen, 4, 8]} />
      <StdMat color={color} roughness={0.6} metalness={metalness} />
    </mesh>
  )
}

/** A chunky boot/fist block capping a limb. */
export function EndBlock({ size, color, metalness = 0 }: { size: number; color: string; metalness?: number }) {
  return (
    <mesh position={[0, -size / 2, size * 0.15]}>
      <GBox args={[size * 1.15, size, size * 1.3]} />
      <StdMat color={color} roughness={0.5} metalness={metalness} />
    </mesh>
  )
}

function Barrel({ length, radius, color }: { length: number; radius: number; color: string }) {
  return (
    <mesh position={[0, 0, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <GCylinder args={[radius, radius * 1.1, length, 8]} />
      <StdMat color={color} roughness={0.35} metalness={0.7} />
    </mesh>
  )
}

function Blade({ length, width, color }: { length: number; width: number; color: string }) {
  return (
    <mesh position={[0, 0, length / 2]} rotation={[0, 0, 0]}>
      <GBox args={[width * 0.25, width, length]} />
      <StdMat color={color} roughness={0.3} metalness={0.6} />
    </mesh>
  )
}

function PincerClaw({ size, color, open = 0.35 }: { size: number; color: string; open?: number }) {
  return (
    <group>
      <mesh position={[0, size * 0.15, size * 0.35]} rotation={[open, 0, 0]}>
        <GBox args={[size * 0.55, size * 0.22, size]} />
        <StdMat color={color} roughness={0.4} metalness={0.65} />
      </mesh>
      <mesh position={[0, -size * 0.15, size * 0.35]} rotation={[-open, 0, 0]}>
        <GBox args={[size * 0.55, size * 0.22, size]} />
        <StdMat color={color} roughness={0.4} metalness={0.65} />
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
            <GBox args={[0.05, 0.07, 0.16]} />
            <StdMat color={colors.primary} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'storm-bolter':
      return (
        <group scale={1.4}>
          <mesh position={[-0.02, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.02, 0.02, 0.26, 6]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0.02, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.02, 0.02, 0.26, 6]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <GBox args={[0.1, 0.1, 0.14]} />
            <StdMat color={colors.secondary} roughness={0.55} />
          </mesh>
        </group>
      )
    case 'power-fist':
      return (
        <group scale={1.5}>
          <mesh>
            <GBox args={[0.14, 0.14, 0.18]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.02, 0.11]}>
            <GBox args={[0.16, 0.03, 0.03]} />
            <StdMat color={colors.trim} emissive={colors.trim} emissiveIntensity={0.6} />
          </mesh>
        </group>
      )
    case 'slugga':
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, 0.06]}>
            <GBox args={[0.05, 0.06, 0.13]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <GBox args={[0.04, 0.06, 0.04]} />
            <StdMat color={colors.trim} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'choppa':
      return (
        <group scale={1.4}>
          <Blade length={0.3} width={0.14} color={colors.trim} />
          <mesh position={[0, 0, -0.03]}>
            <GBox args={[0.045, 0.09, 0.08]} />
            <StdMat color={colors.metal} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'boss-choppa':
      return (
        <group scale={1.9}>
          <Blade length={0.32} width={0.17} color={colors.trim} />
          <mesh position={[0, 0, -0.04]}>
            <GBox args={[0.06, 0.11, 0.1]} />
            <StdMat color={colors.metal} roughness={0.55} />
          </mesh>
        </group>
      )
    case 'power-klaw':
      return (
        <group scale={2.1}>
          <PincerClaw size={0.24} color={colors.metal} />
          <mesh position={[0, 0, 0.05]}>
            <GBox args={[0.05, 0.05, 0.14]} />
            <StdMat color={colors.trim} emissive={colors.trim} emissiveIntensity={0.5} />
          </mesh>
        </group>
      )
    case 'twin-claw':
      return (
        <group scale={1.6}>
          <PincerClaw size={0.32} color={colors.metal} open={0.45} />
        </group>
      )
    case 'gauss-flayer':
      return (
        <group scale={1.4}>
          <Barrel length={0.3} radius={0.03} color={colors.metal} />
          <mesh position={[0, 0, 0.3]}>
            <GBox args={[0.04, 0.04, 0.05]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, -0.005, 0.04]}>
            <GBox args={[0.07, 0.08, 0.16]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      )
    case 'warscythe':
      // A long haft with a crescent glowing blade across the top: the Overlord's own silhouette.
      return (
        <group scale={1.6}>
          <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.014, 0.014, 0.4, 6]} />
            <StdMat color={colors.trim} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.07, 0.3]} rotation={[0, 0, 0]}>
            <GBox args={[0.03, 0.16, 0.2]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0, 0.14, 0.38]}>
            <GBox args={[0.03, 0.06, 0.1]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      )
    case 'hyperphase-blade':
      // Skorpekh reaper blade: a long, flat, glowing edge swept out from the wrist.
      return (
        <group scale={1.5}>
          <mesh position={[0, 0, 0.02]}>
            <GBox args={[0.07, 0.07, 0.1]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.02, 0.22]}>
            <GBox args={[0.012, 0.15, 0.34]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.1} />
          </mesh>
        </group>
      )
    case 'doomsday-blaster':
      // Doomstalker's heavy gun: thick barrel with a green emitter at the muzzle and a power coupling at the base.
      return (
        <group scale={1.8}>
          <Barrel length={0.4} radius={0.05} color={colors.metal} />
          <mesh position={[0, 0, 0.42]}>
            <GCylinder args={[0.065, 0.065, 0.05, 8]} />
            <StdMat color={colors.secondary} emissive={colors.secondary} emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0, 0.02, 0.02]}>
            <GBox args={[0.12, 0.12, 0.2]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      )
    case 'chaos-bolter':
      // A boltgun in dark plate with a brass muzzle ring and a glowing sigil on the receiver.
      return (
        <group scale={1.4}>
          <Barrel length={0.34} radius={0.028} color={colors.metal} />
          <mesh position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.038, 0.038, 0.03, 8]} />
            <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.01, 0.06]}>
            <GBox args={[0.055, 0.075, 0.17]} />
            <StdMat color={colors.primary} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.035, 0.07]}>
            <GBox args={[0.02, 0.012, 0.05]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.4} />
          </mesh>
        </group>
      )
    case 'ritual-staff':
      // Zarkan's staff of possession: a tall brass haft topped with a glowing warp orb in a cage of spikes.
      return (
        <group scale={1.6}>
          <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.014, 0.014, 0.42, 6]} />
            <StdMat color={colors.trim} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.03, 0.36]}>
            <GSphere args={[0.05, 10, 8]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[0, 0.1, 0.36]}>
            <GCone args={[0.02, 0.08, 5]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0.06, 0.03, 0.36]} rotation={[0, 0, -Math.PI / 2]}>
            <GCone args={[0.02, 0.08, 5]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[-0.06, 0.03, 0.36]} rotation={[0, 0, Math.PI / 2]}>
            <GCone args={[0.02, 0.08, 5]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'mutant-claw':
      // A swollen, wrong-shaped fist with three long talons: the Possessed's hideous mutations.
      return (
        <group scale={1.6}>
          <mesh position={[0, 0, 0.04]}>
            <GBox args={[0.12, 0.11, 0.14]} />
            <StdMat color={colors.secondary} roughness={0.7} />
          </mesh>
          <mesh position={[-0.04, 0, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.02, 0.18, 5]} />
            <StdMat color={colors.metal} metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.02, 0.2, 5]} />
            <StdMat color={colors.metal} metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0.04, 0, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.02, 0.18, 5]} />
            <StdMat color={colors.metal} metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'rusty-blade':
      // A crude cleaver: short, wide, dull metal on a bound grip.
      return (
        <group scale={1.4}>
          <Blade length={0.24} width={0.12} color={colors.metal} />
          <mesh position={[0, 0, -0.03]}>
            <GBox args={[0.04, 0.08, 0.08]} />
            <StdMat color={colors.secondary} roughness={0.8} />
          </mesh>
        </group>
      )
    case 'scything-talons':
      // Two long, down-curved bone-blades side by side, dark chitin edge with a coloured root.
      return (
        <group scale={1.6}>
          <mesh position={[0, 0, 0.0]}>
            <GBox args={[0.09, 0.09, 0.08]} />
            <StdMat color={colors.primary} roughness={0.5} />
          </mesh>
          <mesh position={[-0.025, 0.03, 0.2]} rotation={[0.18, 0, 0]}>
            <GBox args={[0.022, 0.1, 0.34]} />
            <StdMat color={colors.metal} roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0.025, 0.0, 0.18]} rotation={[0.05, 0, 0]}>
            <GBox args={[0.022, 0.08, 0.3]} />
            <StdMat color={colors.metal} roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, -0.03, 0.04]}>
            <GBox args={[0.07, 0.02, 0.06]} />
            <StdMat color={colors.trim} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'rending-claws':
      // A little fan of three short hooked claws on a bony fist.
      return (
        <group scale={1.4}>
          <EndBlock size={0.08} color={colors.primary} />
          {[-0.035, 0, 0.035].map((x) => (
            <mesh key={x} position={[x, -0.03, 0.11]} rotation={[Math.PI / 2, 0, 0]}>
              <GCone args={[0.014, 0.12, 5]} />
              <StdMat color={colors.metal} roughness={0.35} metalness={0.5} />
            </mesh>
          ))}
        </group>
      )
    case 'fleshborer':
      // A living beetle-gun: a plump purple body with a short bony muzzle and a glowing green sac.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, 0.07]} scale={[1, 0.9, 1.5]}>
            <GSphere args={[0.06, 8, 6]} />
            <StdMat color={colors.secondary} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.025, 0.1, 6]} />
            <StdMat color={colors.primary} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.05, 0.05]}>
            <GSphere args={[0.025, 6, 5]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.1} />
          </mesh>
        </group>
      )
    case 'barblauncher':
      // The Barbgaunt's launcher: a thick barrel of bone-plate, a bulging acid sac at the back, red muzzle ring.
      return (
        <group scale={1.7}>
          <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.05, 0.065, 0.32, 8]} />
            <StdMat color={colors.primary} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.058, 0.058, 0.04, 8]} />
            <StdMat color={colors.trim} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.0, 0.0]}>
            <GSphere args={[0.085, 8, 6]} />
            <StdMat color={colors.secondary} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.07, 0.06]}>
            <GSphere args={[0.035, 6, 5]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.2} />
          </mesh>
        </group>
      )
    case 'torrent-maw':
      // The Psychophage's torrent: a flared, glowing green throat on a fleshy bulb.
      return (
        <group scale={1.9}>
          <mesh position={[0, 0, 0.04]}>
            <GSphere args={[0.085, 8, 6]} />
            <StdMat color={colors.secondary} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.1, 0.055, 0.2, 8]} />
            <StdMat color={colors.primary} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.085, 0.085, 0.012, 8]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.6} />
          </mesh>
        </group>
      )
    case 'flamer':
    case 'heavy-flamer': {
      // Sister's flamer: a stubby nozzle over a fuel canister, with a small pilot flame at the tip. The heavy
      // version is bigger, with a wide nozzle and twin tanks.
      const heavy = shape === 'heavy-flamer'
      return (
        <group scale={heavy ? 1.7 : 1.4}>
          <mesh position={[0, 0.01, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[heavy ? 0.042 : 0.032, heavy ? 0.05 : 0.038, 0.26, 8]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.01, 0.015]}>
            <GBox args={[0.06, 0.08, 0.12]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[heavy ? -0.04 : 0, -0.07, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.035, 0.035, 0.14, 8]} />
            <StdMat color={colors.trim} roughness={0.5} metalness={0.3} />
          </mesh>
          {heavy && (
            <mesh position={[0.04, -0.07, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.035, 0.035, 0.14, 8]} />
              <StdMat color={colors.trim} roughness={0.5} metalness={0.3} />
            </mesh>
          )}
          <mesh position={[0, 0.01, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.026, 0.07, 6]} />
            <StdMat color="#ff9a3c" emissive="#ff9a3c" emissiveIntensity={1.8} />
          </mesh>
        </group>
      )
    }
    case 'power-sword':
      // A straight glowing blade on a brass crossguard — the Sisters' melee silhouette.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, -0.01]}>
            <GBox args={[0.035, 0.035, 0.1]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <GBox args={[0.02, 0.1, 0.025]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.23]}>
            <GBox args={[0.014, 0.05, 0.34]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={0.9} />
          </mesh>
        </group>
      )
    case 'mace':
      // Flanged brass mace: a short haft ending in a chunky ribbed head.
      return (
        <group scale={1.5}>
          <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.018, 0.018, 0.28, 6]} />
            <StdMat color={colors.primary} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.29]}>
            <GBox args={[0.1, 0.1, 0.1]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.29]} rotation={[0, 0, Math.PI / 4]}>
            <GBox args={[0.1, 0.1, 0.1]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      )
    case 'tower-shield':
      // Held out in front of the arm: dark plate, crimson rim, brass boss.
      return (
        <group position={[0.06, 0.1, 0.06]}>
          <mesh>
            <GBox args={[0.2, 0.34, 0.03]} />
            <StdMat color={colors.trim} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <GBox args={[0.15, 0.28, 0.03]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.02, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.04, 0.04, 0.02, 10]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      )
    case 'flails':
      // A segmented metal whip drooping forward from the arm, ending in a spiked weight (the forearm is the weapon).
      return (
        <group scale={1.3}>
          <mesh position={[0, -0.02, 0.1]} rotation={[Math.PI / 2 - 0.1, 0, 0]}>
            <GCylinder args={[0.022, 0.022, 0.22, 6]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.07, 0.26]} rotation={[Math.PI / 2 + 0.5, 0, 0]}>
            <GCylinder args={[0.018, 0.018, 0.18, 6]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.15, 0.33]}>
            <GCone args={[0.04, 0.09, 6]} />
            <StdMat color={colors.trim} metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      )
    case 'banner':
      // The Simulacrum: a tall pole standing up from the hand, a winged brass top and crimson streamers.
      return (
        <group>
          <mesh position={[0, 0.28, 0]}>
            <GCylinder args={[0.014, 0.014, 0.62, 6]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <GBox args={[0.2, 0.05, 0.03]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} emissive={colors.metal} emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.66, 0]}>
            <GCone args={[0.03, 0.08, 5]} />
            <StdMat color={colors.metal} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.46, 0.02]}>
            <GBox args={[0.1, 0.22, 0.012]} />
            <StdMat color={colors.trim} roughness={0.8} />
          </mesh>
        </group>
      )
    case 'none':
    default:
      return <EndBlock size={0.09} color={hand} />
  }
}
