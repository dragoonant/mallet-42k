// Live hover preview for moveUnit / chargeMove (uiStore.movePreview, computed by moveClamp.ts): a dashed ring at
// the farthest the unit can reach, a line from where it stands to where it would end, a translucent ghost base per
// model (green legal / red not) and a distance label. Legality is the clamp's engine verdict — never re-derived here.
import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { colors } from '../ui/theme'
import { combinedUnitModels, modelsAnchor } from './geometry'
import { FloatingLabel } from './PlacementOverlay'
import { boundRadius, ellipseGeometry, markerYaw } from './baseMarker'
import { GhostFigure, ghostSpecs } from './GhostFigure'

const OK = '#3ddc73'
const BAD = colors.danger
const RING_SEGMENTS = 96
const RING_Y = 0.05

export function MovePreviewOverlay() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const preview = useUiStore((s) => s.movePreview)
  const draft = useUiStore((s) => s.draft)

  const live = !!state && !!pending && !!preview && preview.decisionId === pending.id && draft?.decisionId !== pending.id
  const models = useMemo(() => (live && state ? combinedUnitModels(state, preview.unitId) : []), [live, state, preview?.unitId])
  const start = useMemo(() => modelsAnchor(models), [models])
  const reach = useMemo(() => models.reduce((r, m) => Math.max(r, boundRadius(m.base)), 0), [models])
  const ring = useMemo(() => {
    const pts: [number, number, number][] = []
    const r = (preview?.maxDistance ?? 0) + reach
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2
      pts.push([start.x + Math.cos(a) * r, RING_Y, start.z + Math.sin(a) * r])
    }
    return pts
  }, [start, preview?.maxDistance, reach])

  if (!live || !preview || models.length === 0) return null
  const color = preview.ok ? OK : BAD
  const modelById = new Map(models.map((m) => [m.id, m]))
  const figures = !state ? null : ghostSpecs(state, models)
  const label = `${preview.distance.toFixed(1)}" of ${preview.maxDistance.toFixed(1)}"${preview.ok || !preview.reason ? '' : ` — ${preview.reason}`}`
  return (
    <group>
      <Line points={ring} color="#4f8cff" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.35} transparent opacity={0.8} />
      <Line points={[[start.x, 0.2, start.z], [preview.anchor.x, (preview.placements[0]?.pos.y ?? 0) + 0.2, preview.anchor.z]]} color={color} lineWidth={1.5} transparent opacity={0.85} />
      {preview.placements.map((p) => {
        const m = modelById.get(p.modelId)
        if (!m) return null
        const f = p.facing ?? m.facing
        const spec = figures?.[p.modelId]
        const rx = m.base.radius
        const rz = m.base.shape === 'oval' && m.base.radius2 !== undefined ? m.base.radius2 : m.base.radius
        return (
          <group key={p.modelId}>
            {spec && <GhostFigure spec={spec} modelId={p.modelId} x={p.pos.x} y={p.pos.y ?? 0} z={p.pos.z} facing={f} bad={!preview.ok} />}
            {/* true base size and shape, turned with the model's facing (ovals) */}
            <group position={[p.pos.x, (p.pos.y ?? 0) + 0.07, p.pos.z]} rotation={[0, markerYaw(f), 0]}>
              <mesh geometry={ellipseGeometry(rx, rz, 0)}>
                <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} side={DoubleSide} />
              </mesh>
              <mesh geometry={ellipseGeometry(rx, rz, 0.12)} position={[0, 0.005, 0]}>
                <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} side={DoubleSide} />
              </mesh>
            </group>
          </group>
        )
      })}
      <FloatingLabel pos={{ ...preview.anchor, y: preview.placements[0]?.pos.y ?? 0 }} text={label} color={color} />
    </group>
  )
}
