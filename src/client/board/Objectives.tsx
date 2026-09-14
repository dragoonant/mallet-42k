// Objective markers (44x30 board, y-up, §4/§50-client §4): control-colour ring, a floating label with
// the marker's id, live OC for both sides, a lock icon once it's secured, and a brief fading ghost
// where a marker used to be right after it's razed/removed. Reads the store directly (unlike most of
// src/client/board/**, which is prop-driven) so it can react to control/removal without Scene.tsx
// having to thread that state through.
import { useEffect, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { prettifyId } from '../ui/labels'
import { colors, fontStack } from '../ui/theme'
import { liveControlLevels } from './controlLevels'
import { NEUTRAL_COLOR, SIDE_COLOR } from './types'

const DEFAULT_RADIUS = 3
const MARKER_RADIUS = 0.9
const RING_TUBE = 0.12
const GHOST_MS = 1400

interface Ghost {
  id: string
  pos: { x: number; z: number }
  until: number
}

export function Objectives() {
  const state = useGameStore((s) => s.state)
  const hoveredObjectiveId = useUiStore((s) => s.hoveredObjectiveId)
  const prevRemoved = useRef<Record<string, boolean>>({})
  const [ghosts, setGhosts] = useState<Ghost[]>([])

  useEffect(() => {
    if (!state) {
      prevRemoved.current = {}
      setGhosts([])
      return
    }
    const prev = prevRemoved.current
    const spawned: Ghost[] = []
    for (const obj of Object.values(state.objectives)) {
      const wasRemoved = prev[obj.id] ?? false
      if (!wasRemoved && obj.removed) spawned.push({ id: obj.id, pos: { x: obj.pos.x, z: obj.pos.z }, until: Date.now() + GHOST_MS })
      prev[obj.id] = obj.removed
    }
    if (spawned.length > 0) {
      setGhosts((g) => [...g, ...spawned])
      const t = setTimeout(() => {
        const now = Date.now()
        setGhosts((g) => g.filter((gh) => gh.until > now))
      }, GHOST_MS + 60)
      return () => clearTimeout(t)
    }
  }, [state])

  if (!state) return null
  const objectives = Object.values(state.objectives).filter((o) => !o.removed)
  const ringRadius = state.mission.data.objectiveRange ?? DEFAULT_RADIUS

  return (
    <group>
      {objectives.map((objective) => {
        const owner = objective.controller
        const color = owner ? SIDE_COLOR[owner] : NEUTRAL_COLOR
        const levels = liveControlLevels(state, objective.id)
        const locked = !!objective.securedBy
        return (
          <group key={objective.id} position={[objective.pos.x, 0, objective.pos.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
              <ringGeometry args={[ringRadius - RING_TUBE, ringRadius + RING_TUBE, 48]} />
              <meshBasicMaterial color={color} transparent opacity={owner ? 0.9 : 0.5} />
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[MARKER_RADIUS, MARKER_RADIUS * 1.1, 0.5, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={owner ? 0.5 : 0.1} roughness={0.6} />
            </mesh>
            {hoveredObjectiveId === objective.id && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
                <ringGeometry args={[ringRadius + 0.15, ringRadius + 0.4, 48]} />
                <meshBasicMaterial color="#f5d95a" transparent opacity={0.9} />
              </mesh>
            )}
            <Html position={[0, 1.15, 0]} center distanceFactor={18} style={{ pointerEvents: 'none' }} occlude={false}>
              <div
                data-testid={`objective-label-${objective.id}`}
                style={{ fontFamily: fontStack, fontSize: 12, whiteSpace: 'nowrap', textAlign: 'center', textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)' }}
              >
                <div style={{ fontWeight: 700, color: colors.text }}>
                  {locked ? '\u{1F512} ' : ''}
                  {prettifyId(objective.id)}
                  {objective.stickyBy ? ' · sticky' : ''}
                </div>
                <div style={{ fontWeight: 600 }}>
                  <span style={{ color: colors.playerA }}>A {levels.A}</span>
                  <span style={{ color: colors.muted }}> : </span>
                  <span style={{ color: colors.playerB }}>B {levels.B}</span>
                </div>
              </div>
            </Html>
          </group>
        )
      })}
      {ghosts.map((g) => (
        <mesh key={g.id} position={[g.pos.x, 0.05, g.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ringRadius - RING_TUBE, ringRadius + RING_TUBE, 48]} />
          <meshBasicMaterial color={NEUTRAL_COLOR} transparent opacity={0.35} />
        </mesh>
      ))}
    </group>
  )
}
