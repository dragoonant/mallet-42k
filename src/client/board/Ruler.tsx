import { useMemo } from 'react'
import { Billboard, Line, Text } from '@react-three/drei'
import type { Vec2 } from './types'

const RULER_HEIGHT = 0.4
const RULER_COLOR = '#f5d95a'

export interface RulerProps {
  a: Vec2
  b: Vec2
  color?: string
}

/** A measuring line between two board points with a live inch-distance label at its midpoint. */
export function Ruler({ a, b, color = RULER_COLOR }: RulerProps) {
  const points = useMemo(
    () =>
      [
        [a.x, RULER_HEIGHT, a.z],
        [b.x, RULER_HEIGHT, b.z],
      ] as [number, number, number][],
    [a.x, a.z, b.x, b.z],
  )
  const distance = Math.hypot(b.x - a.x, b.z - a.z)
  const mid: [number, number, number] = [(a.x + b.x) / 2, RULER_HEIGHT + 0.6, (a.z + b.z) / 2]

  return (
    <group>
      <Line points={points} color={color} lineWidth={2} dashed={false} />
      <mesh position={[a.x, RULER_HEIGHT, a.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[b.x, RULER_HEIGHT, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Billboard position={mid}>
        <Text fontSize={0.9} color={color} anchorX="center" anchorY="middle">
          {`${distance.toFixed(1)}"`}
        </Text>
      </Billboard>
    </group>
  )
}
