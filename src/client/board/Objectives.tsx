import { NEUTRAL_COLOR, SIDE_COLOR, type ObjectiveController, type ObjectiveView } from './types'

const DEFAULT_RADIUS = 3
const MARKER_RADIUS = 0.9
const RING_TUBE = 0.12

export interface ObjectivesProps {
  objectives: ObjectiveView[]
  controller: ObjectiveController
}

/** Objective markers with a control-colour ring (44x30 board, y-up, §4/§50-client §4). */
export function Objectives({ objectives, controller }: ObjectivesProps) {
  return (
    <group>
      {objectives.map((objective) => {
        const owner = controller(objective.id)
        const color = owner ? SIDE_COLOR[owner] : NEUTRAL_COLOR
        const radius = objective.radius ?? DEFAULT_RADIUS
        return (
          <group key={objective.id} position={[objective.pos.x, 0, objective.pos.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
              <ringGeometry args={[radius - RING_TUBE, radius + RING_TUBE, 48]} />
              <meshBasicMaterial color={color} transparent opacity={owner ? 0.9 : 0.5} />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[MARKER_RADIUS, MARKER_RADIUS * 1.1, 0.5, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={owner ? 0.5 : 0.1} roughness={0.6} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
