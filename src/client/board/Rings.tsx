import * as THREE from 'three'
import type { Vec2 } from './types'

const ACCENT_COLOR = '#f5d95a'
const ENGAGEMENT_RANGE_IN = 1
const RING_HEIGHT = 0.05

export interface SelectionRingProps {
  pos: Vec2
  /** Model base radius in inches. */
  baseRadius: number
  color?: string
}

/** Selection ring: torus at base radius + 0.05 (§50-client §4). */
export function SelectionRing({ pos, baseRadius, color = ACCENT_COLOR }: SelectionRingProps) {
  const radius = baseRadius + 0.05
  return (
    <mesh position={[pos.x, RING_HEIGHT, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.05, 8, 48]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

export interface TargetRingProps {
  pos: Vec2
  baseRadius: number
  color?: string
}

/** Target ring: ring at base radius + 0.1, dashed, red by default (§50-client §4). */
export function TargetRing({ pos, baseRadius, color = '#ff4f4f' }: TargetRingProps) {
  const radius = baseRadius + 0.1
  return (
    <mesh position={[pos.x, RING_HEIGHT, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.04, radius + 0.04, 32, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  )
}

export interface EngagementRingProps {
  pos: Vec2
  /** Model base radius in inches; the disc extends 1" (engagement range) beyond it. */
  baseRadius: number
}

/** Engagement range disc: radius = base + 1", red 25% opacity (§50-client §4). */
export function EngagementRing({ pos, baseRadius }: EngagementRingProps) {
  const radius = baseRadius + ENGAGEMENT_RANGE_IN
  return (
    <mesh position={[pos.x, RING_HEIGHT, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 48]} />
      <meshBasicMaterial color="#ff3b3b" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

export interface MoveRangeRingProps {
  pos: Vec2
  /** Movement characteristic in inches, plus any Advance roll already added by the caller. */
  range: number
}

/** Move-range disc: radius M (+ advance), blue 20% opacity (§50-client §4). */
export function MoveRangeRing({ pos, range }: MoveRangeRingProps) {
  return (
    <mesh position={[pos.x, RING_HEIGHT, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[Math.max(range, 0), 64]} />
      <meshBasicMaterial color="#4f8cff" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

export type LosStatus = 'visible' | 'cover' | 'hidden'

export interface LosMarkerProps {
  pos: Vec2
  baseRadius: number
  status: LosStatus
}

const LOS_COLOR: Record<LosStatus, string> = { visible: '#3ddc73', cover: '#f5d95a', hidden: '#ff4f4f' }

/** Line-of-sight tint disc under an enemy model's base (M2 Line-of-sight view, key L): green when
 *  visible to the selected unit, yellow when visible but the target has Benefit of Cover, and a
 *  smaller/dimmer red when it can't be seen at all (§50-client §4, engine/los.ts). */
export function LosMarker({ pos, baseRadius, status }: LosMarkerProps) {
  const radius = baseRadius + (status === 'hidden' ? 0.15 : 0.35)
  const opacity = status === 'hidden' ? 0.3 : 0.55
  return (
    <mesh position={[pos.x, RING_HEIGHT + 0.02, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 32]} />
      <meshBasicMaterial color={LOS_COLOR[status]} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}
