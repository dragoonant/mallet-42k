// Tyranid-only body dressing for the shared biped rig (BipedBody.tsx): the three head shapes, plus the
// optional tail, dorsal spines, wings and second arm pair a kit's BipedConfig can switch on. Original SD
// shapes built from the same primitive set as every other kit; nothing here carries rules.
import { GBox, GCone, GCapsule, GSphere, StdMat } from './shared'
import type { BipedConfig, PaintColors } from './types'

const EYE_GLOW = 1.5

/** Head: an elongated skull, glowing eyes, a toothed jaw and a swept-back crest. The Prime adds horns, the
 *  Psychophage swaps the long skull for a broad armoured one over a glowing tentacled maw. */
export function TyranidHead({ shape, colors, radius }: { shape: BipedConfig['headShape']; colors: PaintColors; radius: number }) {
  const prime = shape === 'tyranid-prime-head'
  const brute = shape === 'tyranid-brute-head'
  const skull: [number, number, number] = brute ? [1.2, 0.8, 1.05] : [0.9, 0.85, 1.3]
  return (
    <group>
      <mesh scale={skull}>
        <GSphere args={[radius, 12, 9]} />
        <StdMat color={colors.primary} roughness={0.5} />
      </mesh>
      {/* glowing eyes, set wide on the sides of the face */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * radius * 0.5, radius * 0.18, radius * 0.78]}>
          <GSphere args={[radius * 0.16, 6, 5]} />
          <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={EYE_GLOW} />
        </mesh>
      ))}
      {brute ? (
        <>
          {/* broad bone brow plate and the glowing maw with its tentacles */}
          <mesh position={[0, radius * 0.5, radius * 0.25]}>
            <GBox args={[radius * 1.7, radius * 0.3, radius * 1.1]} />
            <StdMat color={colors.metal} roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh position={[0, -radius * 0.45, radius * 0.8]}>
            <GBox args={[radius * 1.1, radius * 0.5, radius * 0.35]} />
            <StdMat color={colors.decal} emissive={colors.decal} emissiveIntensity={1.1} />
          </mesh>
          {[-0.55, -0.18, 0.18, 0.55].map((x) => (
            <mesh key={x} position={[x * radius, -radius * 0.85, radius * 0.85]} rotation={[0.35, 0, 0]}>
              <GCone args={[radius * 0.09, radius * 0.7, 5]} />
              <StdMat color={colors.trim} roughness={0.5} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* bone jaw with two fangs */}
          <mesh position={[0, -radius * 0.55, radius * 0.65]}>
            <GBox args={[radius * 0.7, radius * 0.25, radius * 0.8]} />
            <StdMat color={colors.secondary} roughness={0.5} />
          </mesh>
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x * radius, -radius * 0.8, radius * 1.0]} rotation={[Math.PI, 0, 0]}>
              <GCone args={[radius * 0.07, radius * 0.25, 4]} />
              <StdMat color="#f4efe0" roughness={0.4} />
            </mesh>
          ))}
          {/* swept-back crest */}
          <mesh position={[0, radius * 0.65, -radius * 0.7]} rotation={[-1.9, 0, 0]}>
            <GCone args={[radius * (prime ? 0.4 : 0.28), radius * (prime ? 1.3 : 0.95), 5]} />
            <StdMat color={colors.secondary} roughness={0.5} />
          </mesh>
        </>
      )}
      {prime &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * radius * 0.6, radius * 0.7, 0]} rotation={[-0.4, 0, -s * 0.7]}>
            <GCone args={[radius * 0.13, radius * 0.9, 5]} />
            <StdMat color={colors.trim} roughness={0.4} metalness={0.2} />
          </mesh>
        ))}
    </group>
  )
}

/** Tail, dorsal spines, wings and extra arms, all drawn in the torso's local space (origin at the hip line,
 *  +Y up, +Z forward, so "behind" is -Z). */
export function TyranidExtras({
  config,
  colors,
  torsoWidth,
  torsoDepth,
  torsoHeight,
}: {
  config: BipedConfig
  colors: PaintColors
  torsoWidth: number
  torsoDepth: number
  torsoHeight: number
}) {
  const { tail, dorsalSpines, wings, extraArms } = config
  if (!tail && !dorsalSpines && !wings && !extraArms) return null
  const tailLen = torsoHeight * 1.6
  return (
    <group>
      {tail && (
        <group position={[0, 0.04, -torsoDepth / 2]} rotation={[-1.85, 0, 0]}>
          <mesh position={[0, tailLen / 2, 0]}>
            <GCone args={[torsoWidth * 0.2, tailLen, 6]} />
            <StdMat color={colors.secondary} roughness={0.55} />
          </mesh>
          <mesh position={[0, tailLen * 1.02, 0]}>
            <GCone args={[torsoWidth * 0.1, tailLen * 0.35, 4]} />
            <StdMat color={colors.metal} roughness={0.35} metalness={0.5} />
          </mesh>
        </group>
      )}
      {dorsalSpines &&
        [0.3, 0.55, 0.8].map((k) => (
          <mesh key={k} position={[0, torsoHeight * k, -torsoDepth / 2 - 0.03]} rotation={[-0.75, 0, 0]}>
            <GCone args={[torsoWidth * 0.07, torsoHeight * 0.55, 4]} />
            <StdMat color={colors.metal} roughness={0.4} metalness={0.3} />
          </mesh>
        ))}
      {wings &&
        [-1, 1].map((s) => (
          <group key={s} position={[s * torsoWidth * 0.3, torsoHeight * 0.85, -torsoDepth / 2 - 0.02]} rotation={[0.1, s * 0.55, s * 0.5]}>
            {/* membrane, with a bone rib along the leading edge */}
            <mesh position={[s * 0.2, 0.08, 0]}>
              <GBox args={[0.42, 0.34, 0.015]} />
              <StdMat color={colors.secondary} roughness={0.8} />
            </mesh>
            <mesh position={[s * 0.2, 0.26, 0]} rotation={[0, 0, s * -0.08]}>
              <GBox args={[0.46, 0.035, 0.03]} />
              <StdMat color={colors.primary} roughness={0.5} />
            </mesh>
            <mesh position={[s * 0.44, 0.1, 0]} rotation={[0, 0, s * 0.2]}>
              <GBox args={[0.03, 0.38, 0.03]} />
              <StdMat color={colors.primary} roughness={0.5} />
            </mesh>
          </group>
        ))}
      {extraArms &&
        [-1, 1].map((s) => (
          <group key={s} position={[s * torsoWidth * 0.3, torsoHeight * 0.4, torsoDepth / 2]} rotation={[-1.0, 0, s * 0.15]}>
            <mesh position={[0, -0.12, 0]}>
              <GCapsule args={[0.03, 0.16, 4, 6]} />
              <StdMat color={colors.secondary} roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.27, 0]} rotation={[Math.PI, 0, 0]}>
              <GCone args={[0.03, 0.14, 4]} />
              <StdMat color={colors.metal} roughness={0.35} metalness={0.5} />
            </mesh>
          </group>
        ))}
    </group>
  )
}
