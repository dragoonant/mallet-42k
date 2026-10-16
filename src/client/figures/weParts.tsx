// World Eaters dressing for the shared biped rig (BipedBody.tsx): brass horns on the helm, and the armoured
// Juggernaut that Karagar rides. Original SD shapes from the same primitive set as every other kit; nothing here
// carries rules.
import { GBox, GCone, StdMat } from './shared'
import type { PaintColors } from './types'

/** A pair of swept brass horns on the sides of the helm (the head group's local origin is the head centre). */
export function HornPair({ colors, radius }: { colors: PaintColors; radius: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * radius * 0.95, radius * 0.55, 0]} rotation={[0, 0, -s * 0.9]}>
          <GCone args={[radius * 0.2, radius * 1.0, 6]} />
          <StdMat color={colors.trim} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
    </>
  )
}

/** A blood-red armoured beast under the rider: a slab body, four stubby legs, a lowered armoured head with a
 *  forward-curving horn and a brass-ringed collar. The rider's own legs vanish inside the barrel. */
export function Juggernaut({ colors, bulk }: { colors: PaintColors; bulk: number }) {
  const w = 0.36 * Math.min(bulk, 1.7)
  const legX = w * 0.42
  return (
    <group>
      {/* barrel body */}
      <mesh position={[0, 0.2, -0.02]}>
        <GBox args={[w, 0.26, 0.66]} />
        <StdMat color={colors.secondary} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* armoured back plate */}
      <mesh position={[0, 0.34, -0.02]}>
        <GBox args={[w * 0.9, 0.03, 0.5]} />
        <StdMat color={colors.primary} roughness={0.5} />
      </mesh>
      {/* four legs */}
      {[-1, 1].map((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * legX, 0.07, sz * 0.22]}>
          <GBox args={[0.09, 0.14, 0.1]} />
          <StdMat color={colors.secondary} roughness={0.6} />
        </mesh>
      )))}
      {/* armoured head, brass collar and curving horn */}
      <mesh position={[0, 0.2, 0.42]}>
        <GBox args={[w * 0.7, 0.2, 0.2]} />
        <StdMat color={colors.metal} roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 0.31]}>
        <GBox args={[w * 0.82, 0.24, 0.04]} />
        <StdMat color={colors.trim} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.3, 0.55]} rotation={[1.1, 0, 0]}>
        <GCone args={[0.035, 0.2, 6]} />
        <StdMat color={colors.decal} roughness={0.4} />
      </mesh>
      {/* glowing eyes */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.18, 0.25, 0.52]}>
          <GBox args={[0.035, 0.025, 0.02]} />
          <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  )
}
