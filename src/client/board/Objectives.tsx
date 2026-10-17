// Objective markers (44x30 board, y-up, §4/§50-client §4): control-colour ring, a floating label with
// the marker's id, live OC for both sides, a lock icon once it's secured, and a brief fading ghost
// where a marker used to be right after it's razed/removed. Reads the store directly (unlike most of
// src/client/board/**, which is prop-driven) so it can react to control/removal without Scene.tsx
// having to thread that state through.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { unitModels } from '@/engine'
import { useFormFactor } from '../ui/formFactor'
import { COMPACT_LABEL_WIDTH_FRAC, DESKTOP_LABEL_MAX, LABEL_DISTANCE_FACTOR, useLabelClamp, useHudCull } from '../interaction/labelScale'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore } from '../ui/uiStore'
import { prettifyId } from '../ui/labels'
import { colors, fontStack } from '../ui/theme'
import { liveControlLevels } from './controlLevels'
import { NEUTRAL_COLOR, SIDE_COLOR } from './types'
import { beaconTexture, dashedRingGeometry, modelsInRange, tokenTexture, zoneRadiusOf, type Footing } from './objectiveZone'

const CONTESTED_COLOR = '#f0b429'
const CUE_COLOR = '#fff1a8'
const Y_FILL = 0.035
const Y_EDGE = 0.045
const TOKEN_H = 0.08
const BEACON_H = 5
const GHOST_MS = 1400

// Floating id + OC readout. Compact: counter-scaled so zooming the phone camera in never balloons it (labelScale.ts).
function ObjectiveLabel({ id, pos, locked, sticky, a, b, compact }: { id: string; pos: [number, number, number]; locked: boolean; sticky: boolean; a: number; b: number; compact: boolean }) {
  const clamp = useRef<HTMLDivElement>(null)
  useLabelClamp(clamp, pos, true, compact ? { origin: '50% 50%', widthFrac: COMPACT_LABEL_WIDTH_FRAC } : { origin: '50% 50%', min: 0, max: DESKTOP_LABEL_MAX })
  useHudCull(clamp, compact)
  return (
    <Html zIndexRange={[5, 0]} position={[0, 1.7, 0]} center distanceFactor={LABEL_DISTANCE_FACTOR} style={{ pointerEvents: 'none' }} occlude={false}>
      <div ref={clamp}>
        <div
          data-testid={`objective-label-${id}`}
          style={{ fontFamily: fontStack, fontSize: compact ? 11 : 12, whiteSpace: 'nowrap', textAlign: 'center', textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)' }}
        >
          <div style={{ fontWeight: 700, color: colors.text }}>
            {locked ? '\u{1F512} ' : ''}
            {prettifyId(id)}
            {sticky ? ' · sticky' : ''}
          </div>
          <div style={{ fontWeight: 600 }}>
            <span style={{ color: colors.playerA }}>A {a}</span>
            <span style={{ color: colors.muted }}> : </span>
            <span style={{ color: colors.playerB }}>B {b}</span>
          </div>
        </div>
      </div>
    </Html>
  )
}

interface Ghost {
  id: string
  pos: { x: number; z: number }
  until: number
}

export function Objectives() {
  const state = useDisplayState()
  const { compact } = useFormFactor()
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

  // Teaching cue: bases of the selected unit (or the staged / hovered move) that are in range of a marker by the engine rule.
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const draft = useUiStore((s) => s.draft)
  const movePreview = useUiStore((s) => s.movePreview)
  const feet = useMemo<Footing[]>(() => {
    if (!state) return []
    const staged = draft ?? movePreview
    const unitId = staged?.unitId ?? selectedUnitId
    const unit = unitId ? state.units[unitId] : undefined
    if (!unit || unit.location !== 'board') return []
    const out: Footing[] = []
    for (const m of unitModels(state, unit.id)) {
      const id = m.id
      const pl = staged?.unitId === unitId ? staged.placements.find((p) => p.modelId === id) : undefined
      out.push({ modelId: id, pos: pl?.pos ?? m.pos, facing: pl?.facing ?? m.facing, base: m.base })
    }
    return out
  }, [state, selectedUnitId, draft, movePreview])

  if (!state) return null
  const objectives = Object.values(state.objectives).filter((o) => !o.removed)
  const { zone: zoneR, markerRadius } = zoneRadiusOf(state)
  const inRange = modelsInRange(state, feet, objectives)
  const litObjectives = new Set(inRange.map((r) => r.objectiveId))

  return (
    <group>
      {objectives.map((objective) => {
        const owner = objective.controller
        const levels = liveControlLevels(state, objective.id)
        const contested = !owner && levels.A > 0 && levels.B > 0
        const color = contested ? CONTESTED_COLOR : owner ? SIDE_COLOR[owner] : NEUTRAL_COLOR
        const locked = !!objective.securedBy
        const lit = litObjectives.has(objective.id)
        return (
          <group key={objective.id} position={[objective.pos.x, 0, objective.pos.z]}>
            <ObjectiveZone zone={zoneR} color={color} owned={!!owner} contested={contested} lit={lit} hovered={hoveredObjectiveId === objective.id} />
            <Token radius={markerRadius} color={color} />
            <ObjectiveLabel id={objective.id} pos={[objective.pos.x, 1.7, objective.pos.z]} locked={locked} sticky={!!objective.stickyBy} a={levels.A} b={levels.B} compact={compact} />
          </group>
        )
      })}
      {inRange.map(({ foot, objectiveId }) => (
        <BaseGlow key={`${foot.modelId}:${objectiveId}`} foot={foot} />
      ))}
      {ghosts.map((g) => (
        <mesh key={g.id} position={[g.pos.x, Y_EDGE, g.pos.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <ringGeometry args={[zoneR - 0.06, zoneR + 0.06, 64]} />
          <meshBasicMaterial color={NEUTRAL_COLOR} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

const OVERLAY = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false } as const

/** The control area: a soft filled disc plus a crisp dashed edge exactly at range + marker radius. */
function ObjectiveZone({ zone, color, owned, contested, lit, hovered }: { zone: number; color: string; owned: boolean; contested: boolean; lit: boolean; hovered: boolean }) {
  const dashes = useMemo(() => dashedRingGeometry(zone, 0.11, 48, 0.62), [zone])
  useEffect(() => () => dashes.dispose(), [dashes])
  const fill = (owned || contested ? 0.16 : 0.09) + (lit ? 0.1 : 0)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_FILL, 0]} renderOrder={3}>
        <circleGeometry args={[zone, 72]} />
        <meshBasicMaterial color={color} opacity={fill} {...OVERLAY} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_EDGE, 0]} renderOrder={4}>
        <ringGeometry args={[zone - 0.02, zone + 0.02, 96]} />
        <meshBasicMaterial color={color} opacity={lit ? 0.9 : 0.45} {...OVERLAY} />
      </mesh>
      <mesh geometry={dashes} position={[0, Y_EDGE + 0.002, 0]} renderOrder={5}>
        <meshBasicMaterial color={lit ? CUE_COLOR : color} opacity={lit ? 1 : owned || contested ? 0.95 : 0.7} side={THREE.DoubleSide} {...OVERLAY} />
      </mesh>
      {hovered && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_EDGE + 0.004, 0]} renderOrder={6}>
          <ringGeometry args={[zone + 0.12, zone + 0.3, 96]} />
          <meshBasicMaterial color="#f5d95a" opacity={0.9} {...OVERLAY} />
        </mesh>
      )}
    </group>
  )
}

/** The physical 40mm token (true rules radius, flat) with a holo-beacon column so it is findable from afar. */
function Token({ radius, color }: { radius: number; color: string }) {
  const face = useMemo(() => tokenTexture(color), [color])
  const beacon = useMemo(() => beaconTexture(), [])
  return (
    <group>
      <mesh position={[0, TOKEN_H / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 1.03, TOKEN_H, 32]} />
        <meshStandardMaterial color="#4a3a22" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TOKEN_H + 0.004, 0]} renderOrder={7}>
        <circleGeometry args={[radius * 0.99, 40]} />
        <meshBasicMaterial map={face} {...OVERLAY} polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
      </mesh>
      <mesh position={[0, BEACON_H / 2 + TOKEN_H, 0]} renderOrder={8}>
        <cylinderGeometry args={[0.1, 0.22, BEACON_H, 16, 1, true]} />
        <meshBasicMaterial color={color} alphaMap={beacon} opacity={0.55} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} {...OVERLAY} />
      </mesh>
    </group>
  )
}

/** Glow round a base whose model is in range of a marker (matches engine withinObjectiveRange). */
function BaseGlow({ foot }: { foot: Footing }) {
  const r1 = foot.base.radius
  const r2 = foot.base.shape === 'oval' ? (foot.base.radius2 ?? r1) : r1
  return (
    <group position={[foot.pos.x, foot.pos.y + 0.05, foot.pos.z]} rotation={[0, -foot.facing, 0]}>
      <group scale={[1, 1, r2 / r1]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
          <ringGeometry args={[r1 + 0.02, r1 + 0.16, 40]} />
          <meshBasicMaterial color={CUE_COLOR} opacity={0.95} {...OVERLAY} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
          <ringGeometry args={[r1 + 0.16, r1 + 0.4, 40]} />
          <meshBasicMaterial color={CUE_COLOR} opacity={0.25} {...OVERLAY} />
        </mesh>
      </group>
    </group>
  )
}
