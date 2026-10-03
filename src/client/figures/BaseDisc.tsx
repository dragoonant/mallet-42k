// Base disc + selection/target rings (30-figures.md §6): rings are separate meshes parented to
// root, never baked into the figure body, and are the only client-only geometry here — the
// engine only ever sees the base's mm/shape via Model.base, never these meshes.
import { GCylinder, StdMat } from './shared'
import { DoubleSide } from 'three'
import type { PaintColors } from './types'

export const BASE_THICKNESS = 0.12

export function BaseDisc({
  radiusX,
  radiusZ,
  colors,
  selected,
  highlighted,
  glbBody,
}: {
  radiusX: number
  radiusZ: number
  colors: PaintColors
  selected?: boolean
  highlighted?: boolean
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
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.62, 32]} />
          <meshBasicMaterial color="#48e0ff" transparent opacity={0.95} side={DoubleSide} />
        </mesh>
      )}
    </group>
  )
}
