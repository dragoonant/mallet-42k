// Death Guard dressing for the procedural figure kit: plague-helm and Poxwalker heads, the blight launcher, plague
// spewer and manreaper, and torso dressing (hoses, rags, a swollen belly, glowing vials). Kept in one file so the
// shared BipedBody / primitives only need a one-line hook each. Authored in the same unit-height space as the rest
// of the kit; weapons point along +Z from a hand at the local origin. Colours come from the faction paintScheme
// (olive-green primary, rust-brown secondary, tarnished-brass trim, dull-steel metal, sickly lime decal used for
// every pustule glow and lens), so a repaint recolours them too.
import { GBox, GCone, GCylinder, GSphere, StdMat } from './shared'
import type { BipedConfig, PaintColors, WeaponShape } from './types'

const SICK_FLESH = '#8f9a6c'
const SORE = '#b8a455'
const MOUTH = '#2a1d14'

function Blob({ radius, color }: { radius: number; color: string }) {
  return (
    <mesh scale={[1, 0.92, 1.05]}>
      <GSphere args={[radius, 14, 10]} />
      <StdMat color={color} roughness={0.6} />
    </mesh>
  )
}

function Glow({ x, y, z, size, color, intensity = 1.6 }: { x: number; y: number; z: number; size: number; color: string; intensity?: number }) {
  return (
    <mesh position={[x, y, z]}>
      <GSphere args={[size, 8, 6]} />
      <StdMat color={color} emissive={color} emissiveIntensity={intensity} />
    </mesh>
  )
}

export type DgHeadShape = 'plague-helm' | 'plague-lord-helm' | 'poxwalker-head'
export const DG_HEADS: ReadonlySet<string> = new Set<DgHeadShape>(['plague-helm', 'plague-lord-helm', 'poxwalker-head'])

export function DgHead({ shape, colors, radius }: { shape: DgHeadShape; colors: PaintColors; radius: number }) {
  const r = radius
  switch (shape) {
    case 'plague-helm':
    case 'plague-lord-helm': {
      const lord = shape === 'plague-lord-helm'
      // A round, dented olive helm: a rust-brown respirator grille low on the face, two sickly lenses, a hose looping from
      // the grille to the side of the helm and a single crooked horn; a lord wears two, bigger, with a brass brow band.
      return (
        <group>
          <Blob radius={r * 1.05} color={colors.primary} />
          <mesh position={[0, -r * 0.4, r * 0.85]}>
            <GBox args={[r * 0.7, r * 0.42, r * 0.28]} />
            <StdMat color={colors.secondary} roughness={0.7} metalness={0.2} />
          </mesh>
          <mesh position={[0, -r * 0.4, r * 1.0]}>
            <GBox args={[r * 0.5, r * 0.08, r * 0.06]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <Glow x={-r * 0.34} y={r * 0.12} z={r * 0.92} size={r * 0.17} color={colors.decal} intensity={lord ? 2.1 : 1.6} />
          <Glow x={r * 0.34} y={r * 0.12} z={r * 0.92} size={r * 0.17} color={colors.decal} intensity={lord ? 2.1 : 1.6} />
          <mesh position={[r * 0.78, -r * 0.35, r * 0.35]} rotation={[0.4, 0, 0.6]}>
            <GCylinder args={[r * 0.07, r * 0.07, r * 0.7, 6]} />
            <StdMat color={colors.metal} metalness={0.4} roughness={0.6} />
          </mesh>
          {lord ? (
            <>
              <mesh position={[-r * 0.6, r * 0.95, 0]} rotation={[0, 0, 0.55]}>
                <GCone args={[r * 0.2, r * 0.95, 6]} />
                <StdMat color={colors.trim} roughness={0.45} metalness={0.4} />
              </mesh>
              <mesh position={[r * 0.6, r * 0.95, 0]} rotation={[0, 0, -0.55]}>
                <GCone args={[r * 0.2, r * 0.95, 6]} />
                <StdMat color={colors.trim} roughness={0.45} metalness={0.4} />
              </mesh>
              <mesh position={[0, r * 0.45, r * 0.15]}>
                <GBox args={[r * 1.7, r * 0.12, r * 1.5]} />
                <StdMat color={colors.trim} roughness={0.4} metalness={0.6} />
              </mesh>
            </>
          ) : (
            <mesh position={[-r * 0.3, r * 1.0, 0]} rotation={[0, 0, 0.35]}>
              <GCone args={[r * 0.17, r * 0.7, 6]} />
              <StdMat color={colors.trim} roughness={0.45} metalness={0.4} />
            </mesh>
          )}
        </group>
      )
    }
    case 'poxwalker-head':
      // A bald, swollen, grey-green head with a slack black mouth, one open lazy eye, one swollen shut, and boils.
      return (
        <group>
          <Blob radius={r * 1.02} color={SICK_FLESH} />
          <mesh position={[0, -r * 0.45, r * 0.78]}>
            <GBox args={[r * 0.7, r * 0.45, r * 0.3]} />
            <StdMat color={MOUTH} roughness={0.9} />
          </mesh>
          <Glow x={-r * 0.36} y={r * 0.15} z={r * 0.9} size={r * 0.17} color={colors.decal} intensity={1.3} />
          <mesh position={[r * 0.36, r * 0.12, r * 0.9]}>
            <GSphere args={[r * 0.16, 8, 6]} />
            <StdMat color="#6f7a50" roughness={0.9} />
          </mesh>
          <Glow x={r * 0.55} y={r * 0.55} z={r * 0.45} size={r * 0.2} color={SORE} intensity={0.3} />
          <Glow x={-r * 0.6} y={r * 0.3} z={r * 0.2} size={r * 0.14} color={SORE} intensity={0.3} />
        </group>
      )
  }
}

export type DgWeaponShape = 'blight-launcher' | 'plague-spewer' | 'manreaper'
export const DG_WEAPONS: ReadonlySet<string> = new Set<DgWeaponShape>(['blight-launcher', 'plague-spewer', 'manreaper'])

export function DgWeapon({ shape, colors }: { shape: WeaponShape; colors: PaintColors }) {
  switch (shape as DgWeaponShape) {
    case 'blight-launcher':
      // A fat rusty tube with a green-lit canister bulging under it and a short brass muzzle ring.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.04, 0.045, 0.42, 8]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.055, 0.055, 0.04, 8]} />
            <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.075, 0.12]}>
            <GSphere args={[0.06, 10, 8]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, 0.01, -0.04]}>
            <GBox args={[0.06, 0.09, 0.14]} />
            <StdMat color={colors.secondary} roughness={0.7} />
          </mesh>
        </group>
      )
    case 'plague-spewer':
      // A short pump gun fed by two brown tanks, a wide nozzle spitting a green glow.
      return (
        <group scale={1.4}>
          <mesh position={[0, 0, 0.06]}>
            <GBox args={[0.07, 0.08, 0.26]} />
            <StdMat color={colors.primary} roughness={0.6} />
          </mesh>
          {[-0.05, 0.05].map((x) => (
            <mesh key={x} position={[x, 0.08, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
              <GCylinder args={[0.035, 0.035, 0.24, 8]} />
              <StdMat color={colors.secondary} roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.05, 0.028, 0.16, 8]} />
            <StdMat color={colors.metal} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.38]}>
            <GSphere args={[0.04, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.6} />
          </mesh>
        </group>
      )
    case 'manreaper':
      // A tall haft topped with a wide, notched, rust-eaten scythe blade swept to one side.
      return (
        <group scale={1.7}>
          <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <GCylinder args={[0.014, 0.016, 0.46, 6]} />
            <StdMat color={colors.trim} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.1, 0.34]} rotation={[0.2, 0, 0]}>
            <GBox args={[0.022, 0.2, 0.1]} />
            <StdMat color={colors.metal} metalness={0.6} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2, 0.3]} rotation={[0.9, 0, 0]}>
            <GBox args={[0.02, 0.14, 0.06]} />
            <StdMat color={colors.secondary} metalness={0.5} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.04, 0.34]}>
            <GSphere args={[0.025, 8, 6]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.2} />
          </mesh>
        </group>
      )
  }
  return null
}

/** Torso-level dressing, rendered inside the torso group (origin at the hips) so it sways with the torso:
 *  'plate' = hoses, a hanging rag tabard and pustules (Plague Marines); 'biologus' = the same plus a rack of glowing
 *  vials on the back; 'lord' = the same with a heavier tabard and a brass bell-weight; 'pox' = a swollen belly, ragged
 *  loincloth strips and boils (Poxwalkers). */
export function DgDressing({ config, colors, torsoWidth, torsoDepth, torsoHeight, hipY }: { config: BipedConfig; colors: PaintColors; torsoWidth: number; torsoDepth: number; torsoHeight: number; hipY: number }) {
  const kind = config.nurgle
  if (!kind) return null
  if (kind === 'pox') {
    return (
      <>
        <mesh position={[0, torsoHeight * 0.18, torsoDepth * 0.42]} scale={[1, 0.9, 0.85]}>
          <GSphere args={[torsoWidth * 0.5, 12, 9]} />
          <StdMat color={SICK_FLESH} roughness={0.7} />
        </mesh>
        {[-0.32, 0, 0.32].map((x) => (
          <mesh key={x} position={[x * torsoWidth, -hipY * 0.25, torsoDepth / 2 + 0.01]} rotation={[0.08, 0, x * 0.5]}>
            <GBox args={[torsoWidth * 0.26, hipY * 0.7, 0.015]} />
            <StdMat color={colors.secondary} roughness={0.9} />
          </mesh>
        ))}
        <Glow x={torsoWidth * 0.18} y={torsoHeight * 0.65} z={torsoDepth / 2 + 0.01} size={0.025} color={SORE} intensity={0.35} />
        <Glow x={-torsoWidth * 0.3} y={torsoHeight * 0.4} z={-torsoDepth / 2 - 0.005} size={0.03} color={SORE} intensity={0.35} />
        <Glow x={torsoWidth * 0.32} y={torsoHeight * 0.3} z={torsoDepth * 0.7} size={0.022} color={colors.decal} intensity={0.8} />
      </>
    )
  }
  const lord = kind === 'lord'
  return (
    <>
      {/* a hanging tabard of rotted brown cloth over the front of the hips */}
      <mesh position={[0, -hipY * 0.3, torsoDepth / 2 + 0.015]}>
        <GBox args={[torsoWidth * (lord ? 0.62 : 0.5), hipY * (lord ? 0.95 : 0.8), 0.018]} />
        <StdMat color={colors.secondary} roughness={0.9} />
      </mesh>
      <mesh position={[0, -hipY * 0.62, torsoDepth / 2 + 0.018]}>
        <GBox args={[torsoWidth * 0.5, 0.025, 0.02]} />
        <StdMat color={colors.trim} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* two hoses looping from the back-pack over the shoulders */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * torsoWidth * 0.36, torsoHeight * 0.55, -torsoDepth / 2 + 0.01]} rotation={[0.3, 0, s * 0.15]}>
          <GCylinder args={[0.017, 0.017, torsoHeight * 1.2, 6]} />
          <StdMat color={colors.metal} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      <Glow x={-torsoWidth * 0.52} y={torsoHeight * 0.95} z={0.02} size={0.034} color={colors.decal} intensity={0.9} />
      <Glow x={torsoWidth * 0.3} y={torsoHeight * 0.3} z={torsoDepth / 2 + 0.012} size={0.028} color={SORE} intensity={0.4} />
      {lord && (
        <mesh position={[torsoWidth * 0.3, -hipY * 0.1, torsoDepth / 2 + 0.05]}>
          <GCone args={[0.04, 0.09, 8]} />
          <StdMat color={colors.trim} metalness={0.6} roughness={0.4} />
        </mesh>
      )}
      {kind === 'biologus' && (
        <group position={[0, torsoHeight * 0.55, -torsoDepth / 2 - 0.12]}>
          {[-0.2, 0, 0.2].map((x) => (
            <mesh key={x} position={[x * torsoWidth * 1.6, 0, 0]}>
              <GCylinder args={[0.03, 0.03, torsoHeight * 0.85, 8]} />
              <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.1} />
            </mesh>
          ))}
        </group>
      )}
    </>
  )
}
