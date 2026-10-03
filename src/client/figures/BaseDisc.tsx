// Base disc + selection/target rings (30-figures.md §6): rings are separate meshes parented to
// root, never baked into the figure body, and are the only client-only geometry here — the
// engine only ever sees the base's mm/shape via Model.base, never these meshes.
import { GCylinder, StdMat } from './shared'
import { DoubleSide, type Mesh, type MeshBasicMaterial } from 'three'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { PaintColors } from './types'

export const BASE_THICKNESS = 0.12

/** Prompt-hover ring: wide, white and pulsing, so it can't be mistaken for the amber "clickable" ring
 *  or the cyan selection ring — this is the one that answers "which unit is this button?". The demand
 *  frameloop only renders on invalidate, so the pulse asks for the next frame itself. */
function HoverRing() {
  const mesh = useRef<Mesh>(null!)
  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const k = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 7)
    m.scale.setScalar(1 + 0.06 * k)
    ;(m.material as MeshBasicMaterial).opacity = 0.7 + 0.3 * k
    state.invalidate()
  })
  return (
    <mesh ref={mesh} position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <ringGeometry args={[1.66, 2.04, 40]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={DoubleSide} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

export function BaseDisc({
  radiusX,
  radiusZ,
  colors,
  selected,
  highlighted,
  hovered,
  glbBody,
}: {
  radiusX: number
  radiusZ: number
  colors: PaintColors
  selected?: boolean
  highlighted?: boolean
  hovered?: boolean
  /** A GLB figure brings its own base disc: skip ours and draw a flat team-coloured ring just outside it. */
  glbBody?: boolean
}) {
  return (
    <group scale={[radiusX, 1, radiusZ]}>
      {glbBody ? (
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.0, 1.12, 32]} />
          <meshBasicMaterial color={colors.secondary} side={DoubleSide} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, BASE_THICKNESS / 2, 0]}>
            <GCylinder args={[1, 1, BASE_THICKNESS, 24]} />
            <StdMat color={colors.trim} roughness={0.7} />
          </mesh>
          <mesh position={[0, BASE_THICKNESS + 0.002, 0]}>
            <GCylinder args={[0.92, 0.92, 0.006, 24]} />
            <StdMat color={colors.secondary} roughness={0.75} />
          </mesh>
        </>
      )}

      {highlighted && (
        <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.18, 1.34, 32]} />
          <meshBasicMaterial color="#ffcc33" transparent opacity={0.85} side={DoubleSide} />
        </mesh>
      )}
      {hovered && <HoverRing />}
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.62, 32]} />
          <meshBasicMaterial color="#48e0ff" transparent opacity={0.95} side={DoubleSide} />
        </mesh>
      )}
    </group>
  )
}
