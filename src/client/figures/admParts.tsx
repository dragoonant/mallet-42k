// Adeptus Mechanicus (Skitarii) dressing for the procedural figure kit: heads, weapons, the Pteraxii jump pack,
// the tech-priest's robe and mechadendrites. Kept in one file so the shared BipedBody / primitives only need a
// one-line hook each. Authored in the same unit-height space as the rest of the kit; weapons point along +Z from
// a hand at the local origin. Colours come from the faction paintScheme (rust-red primary, slate secondary, brass
// trim, steel metal, teal decal used for every glowing lens and emitter), so a repaint recolours them too.
import { GBox, GCone, GCylinder, GSphere, StdMat } from './shared'
import type { BipedConfig, PaintColors, WeaponShape } from './types'

const LENS_DARK = '#0f1a1c'
const FLAME = '#d8ff8a'

function Blob({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh scale={[1, 0.92, 1.05]}>
      <GSphere args={[radius, 14, 10]} />
      <StdMat color={color} roughness={0.55} />
    </mesh>
  )
}

function Lens({ x, y, z, size, color }: { x: number; y: number; z: number; size: number; color: string }) {
  return (
    <mesh position={[x, y, z]}>
      <GBox args={[size, size, size * 0.6]} />
      <StdMat color={color} emissive={color} emissiveIntensity={1.7} />
    </mesh>
  )
}

export type AdmHeadShape = 'skitarii-hood' | 'skitarii-alpha' | 'tech-priest-hood' | 'pteraxii-helm'
export const ADM_HEADS: ReadonlySet<string> = new Set<AdmHeadShape>(['skitarii-hood', 'skitarii-alpha', 'tech-priest-hood', 'pteraxii-helm'])

export function AdmHead({ shape, colors, radius }: { shape: AdmHeadShape; colors: PaintColors; radius: number }) {
  const r = radius
  switch (shape) {
    case 'skitarii-hood':
    case 'skitarii-alpha':
      // A rust-red hood over a steel respirator snout with twin teal lenses; the alpha adds a tall brass crest.
      return (
        <group>
          <Blob radius={r * 1.05} color={colors.primary} />
          <mesh position={[0, -r * 0.2, r * 0.85]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[r * 0.28, r * 0.4, r * 0.55, 8]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, r * 0.1, r * 0.78]}>
            <GBox args={[r * 1.0, r * 0.26, r * 0.22]} />
            <StdMat color={LENS_DARK} roughness={0.3} />
          </mesh>
          <Lens x={-r * 0.28} y={r * 0.1} z={r * 0.92} size={r * 0.22} color={colors.decal} />
          <Lens x={r * 0.28} y={r * 0.1} z={r * 0.92} size={r * 0.22} color={colors.decal} />
          <mesh position={[0, r * 0.55, -r * 0.55]} rotation={[0.5, 0, 0]}>
            <GBox args={[r * 1.1, r * 0.6, r * 0.5]} />
            <StdMat color={colors.primary} roughness={0.7} />
          </mesh>
          {shape === 'skitarii-alpha' && (
            <mesh position={[0, r * 1.05, -r * 0.1]}>
              <GBox args={[r * 0.14, r * 0.8, r * 1.3]} />
              <StdMat color={colors.trim} metalness={0.5} roughness={0.4} />
            </mesh>
          )}
        </group>
      )
    case 'tech-priest-hood':
      // A deep cowl over a flat steel faceplate with one big teal eye, and a brass cog riding the back of the hood.
      return (
        <group>
          <Blob radius={r * 1.2} color={colors.primary} />
          <mesh position={[0, r * 0.05, r * 0.95]}>
            <GBox args={[r * 1.1, r * 1.1, r * 0.2]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <Lens x={0} y={r * 0.15} z={r * 1.08} size={r * 0.34} color={colors.decal} />
          <mesh position={[0, -r * 0.35, r * 1.06]}>
            <GBox args={[r * 0.7, r * 0.1, r * 0.06]} />
            <StdMat color={LENS_DARK} roughness={0.4} />
          </mesh>
          <mesh position={[0, r * 0.15, -r * 1.2]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[r * 0.55, r * 0.55, r * 0.14, 8]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'pteraxii-helm':
    default:
      // Smooth slate helm, a wide teal visor band and a short breather beak.
      return (
        <group>
          <Blob radius={r} color={colors.secondary} />
          <mesh position={[0, r * 0.05, r * 0.85]}>
            <GBox args={[r * 1.1, r * 0.3, r * 0.2]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0, -r * 0.3, r * 0.95]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[r * 0.25, r * 0.5, 6]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, r * 0.95, -r * 0.2]}>
            <GCylinder args={[r * 0.04, r * 0.04, r * 0.4, 5]} />
            <StdMat color={colors.trim} metalness={0.6} />
          </mesh>
        </group>
      )
  }
}

export type AdmWeaponShape =
  | 'arc-rifle'
  | 'plasma-caliver'
  | 'radium-carbine'
  | 'omnissian-staff'
  | 'taser-goad'
  | 'arc-maul'
  | 'transonic-cannon'
  | 'phosphor-torch'
  | 'phosphor-carbine'
export const ADM_WEAPONS: ReadonlySet<string> = new Set<AdmWeaponShape>(['arc-rifle', 'plasma-caliver', 'radium-carbine', 'omnissian-staff', 'taser-goad', 'arc-maul', 'transonic-cannon', 'phosphor-torch', 'phosphor-carbine'])

function Barrel({ length, radius, color, z = 0 }: { length: number; radius: number; color: string; z?: number }) {
  return (
    <mesh position={[0, 0, z + length / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <GCylinder args={[radius, radius * 1.1, length, 8]} />
      <StdMat color={color} roughness={0.35} metalness={0.7} />
    </mesh>
  )
}

function Stock({ colors, z = -0.06 }: { colors: PaintColors; z?: number }) {
  return (
    <mesh position={[0, -0.01, z]}>
      <GBox args={[0.05, 0.07, 0.14]} />
      <StdMat color={colors.secondary} roughness={0.7} />
    </mesh>
  )
}

export function AdmWeapon({ shape, colors }: { shape: WeaponShape; colors: PaintColors }) {
  switch (shape) {
    case 'arc-rifle':
      // Long steel barrel ending in two prongs with a teal spark between them.
      return (
        <group scale={1.4}>
          <Barrel length={0.34} radius={0.022} color={colors.metal} />
          <mesh position={[-0.03, 0, 0.36]}>
            <GBox args={[0.012, 0.012, 0.1]} />
            <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0.03, 0, 0.36]}>
            <GBox args={[0.012, 0.012, 0.1]} />
            <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.37]}>
            <GSphere args={[0.016, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, 0.0, 0.05]}>
            <GBox args={[0.06, 0.08, 0.14]} />
            <StdMat color={colors.primary} roughness={0.55} />
          </mesh>
          <Stock colors={colors} z={-0.1} />
        </group>
      )
    case 'plasma-caliver':
      // Short barrel wrapped in a glowing blue coil, a fat power cell on top.
      return (
        <group scale={1.4}>
          <Barrel length={0.3} radius={0.026} color={colors.metal} />
          <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.04, 0.04, 0.07, 10]} />
            <StdMat color="#59c8ff" emissive="#59c8ff" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, 0.06, 0.02]}>
            <GBox args={[0.05, 0.05, 0.14]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <GBox args={[0.06, 0.08, 0.14]} />
            <StdMat color={colors.primary} roughness={0.55} />
          </mesh>
          <Stock colors={colors} z={-0.1} />
        </group>
      )
    case 'radium-carbine':
      // Short carbine with a round radium drum slung under the body and a teal glow at the muzzle.
      return (
        <group scale={1.4}>
          <Barrel length={0.26} radius={0.018} color={colors.metal} />
          <mesh position={[0, 0, 0.27]}>
            <GBox args={[0.03, 0.03, 0.03]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.7} />
          </mesh>
          <mesh position={[0, -0.06, 0.03]} rotation={[0, 0, Math.PI / 2]}>
            <GCylinder args={[0.04, 0.04, 0.05, 10]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <GBox args={[0.05, 0.07, 0.14]} />
            <StdMat color={colors.primary} roughness={0.55} />
          </mesh>
          <Stock colors={colors} />
        </group>
      )
    case 'omnissian-staff':
      // Tall brass-headed staff topped with a cog and a teal eye, held upright like the honour stave.
      return (
        <group>
          <mesh position={[0, 0.3, 0]}>
            <GCylinder args={[0.016, 0.016, 0.66, 6]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.64, 0]} rotation={[0, 0, Math.PI / 2]}>
            <GCylinder args={[0.07, 0.07, 0.025, 8]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.64, 0]}>
            <GSphere args={[0.032, 10, 8]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.8} />
          </mesh>
        </group>
      )
    case 'taser-goad':
    case 'arc-maul': {
      // A baton with a crackling teal tip; the maul is the heavier cavalry version with a blocky head.
      const maul = shape === 'arc-maul'
      return (
        <group scale={maul ? 1.5 : 1.3}>
          <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.016, 0.016, 0.26, 6]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          {maul ? (
            <mesh position={[0, 0, 0.27]}>
              <GBox args={[0.1, 0.08, 0.1]} />
              <StdMat color={colors.trim} metalness={0.5} roughness={0.4} />
            </mesh>
          ) : null}
          <mesh position={[0, 0, maul ? 0.34 : 0.27]}>
            <GSphere args={[maul ? 0.032 : 0.026, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={2} />
          </mesh>
        </group>
      )
    }
    case 'transonic-cannon':
      // A wide bell-mouthed emitter on a thick body with a hose running back to the pack.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, 0.1]}>
            <GBox args={[0.08, 0.1, 0.22]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.07, 0.2, 10]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.05, 0.05, 0.02, 10]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, 0.07, -0.02]}>
            <GBox args={[0.04, 0.04, 0.16]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      )
    case 'phosphor-torch':
      // Nozzle over a fuel tank with a pale-green phosphor flame at the tip.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0.01, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.03, 0.036, 0.26, 8]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.06, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.04, 0.04, 0.14, 8]} />
            <StdMat color={colors.trim} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.01, 0.015]}>
            <GBox args={[0.06, 0.08, 0.12]} />
            <StdMat color={colors.primary} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.01, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
            <GCone args={[0.028, 0.08, 6]} />
            <StdMat color={FLAME} emissive={FLAME} emissiveIntensity={1.9} />
          </mesh>
        </group>
      )
    case 'phosphor-carbine':
    default:
      // Chunky short carbine with a glowing green-white muzzle.
      return (
        <group scale={1.4}>
          <Barrel length={0.24} radius={0.024} color={colors.metal} />
          <mesh position={[0, 0, 0.26]}>
            <GSphere args={[0.026, 8, 6]} />
            <StdMat color={FLAME} emissive={FLAME} emissiveIntensity={1.9} />
          </mesh>
          <mesh position={[0, 0.05, 0.04]}>
            <GBox args={[0.04, 0.05, 0.12]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <GBox args={[0.06, 0.08, 0.14]} />
            <StdMat color={colors.primary} roughness={0.55} />
          </mesh>
          <Stock colors={colors} />
        </group>
      )
  }
}

/** Torso-level dressing: the Pteraxii jump pack, the tech-priest's floor-length robe and his mechadendrites. Rendered inside the
 *  torso group (origin at the hips), so it sways with the torso. */
export function AdmDressing({ config, colors, torsoWidth, torsoDepth, torsoHeight, hipY }: { config: BipedConfig; colors: PaintColors; torsoWidth: number; torsoDepth: number; torsoHeight: number; hipY: number }) {
  return (
    <>
      {config.robe && (
        <mesh position={[0, -hipY / 2 + 0.02, 0]}>
          <GCylinder args={[torsoWidth * 0.62, torsoWidth * 0.95, hipY + 0.04, 10]} />
          <StdMat color={colors.primary} roughness={0.8} />
        </mesh>
      )}
      {config.jumpPack && (
        <group position={[0, torsoHeight * 0.5, -torsoDepth / 2 - 0.08]}>
          <mesh>
            <GBox args={[torsoWidth * 0.75, torsoHeight * 0.75, 0.12]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * torsoWidth * 0.24, -torsoHeight * 0.4, -0.02]}>
              <mesh rotation={[Math.PI, 0, 0]}>
                <GCone args={[0.06, 0.12, 8]} />
                <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.12, 0]} rotation={[Math.PI, 0, 0]}>
                <GCone args={[0.04, 0.12, 8]} />
                <StdMat color="#ffd37a" emissive="#ffb347" emissiveIntensity={1.8} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {config.mechadendrites && (
        <group position={[0, torsoHeight * 0.85, -torsoDepth / 2 - 0.05]}>
          {[-1, 0, 1].map((s) => (
            <group key={s} rotation={[-0.5, 0, s * 0.55]}>
              <mesh position={[0, 0.14, 0]}>
                <GCylinder args={[0.014, 0.018, 0.28, 5]} />
                <StdMat color={colors.metal} metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[0, 0.3, 0.03]} rotation={[0.9, 0, 0]}>
                <GCylinder args={[0.012, 0.014, 0.14, 5]} />
                <StdMat color={colors.trim} metalness={0.5} roughness={0.45} />
              </mesh>
              <mesh position={[0, 0.36, 0.09]}>
                <GSphere args={[0.02, 6, 5]} />
                <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.6} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </>
  )
}
