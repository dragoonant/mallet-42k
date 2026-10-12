// Live hover preview for moveUnit / chargeMove (uiStore.movePreview, computed by moveClamp.ts): a dashed ring at
// the farthest the unit can reach, a line from where it stands to where it would end, a translucent ghost base per
// model (green legal / red not) and a distance label. Legality is the clamp's engine verdict — never re-derived here.
import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { colors } from '../ui/theme'
import { combinedUnitModels, modelsAnchor } from './geometry'
import { FloatingLabel } from './PlacementOverlay'

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
  const reach = useMemo(() => models.reduce((r, m) => Math.max(r, m.base.radius, m.base.radius2 ?? 0), 0), [models])
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
  const baseById = new Map(models.map((m) => [m.id, m.base]))
  const label = `${preview.distance.toFixed(1)}" of ${preview.maxDistance.toFixed(1)}"${preview.ok || !preview.reason ? '' : ` — ${preview.reason}`}`
  return (
    <group>
      <Line points={ring} color="#4f8cff" lineWidth={1.5} dashed dashSize={0.5} gapSize={0.35} transparent opacity={0.8} />
      <Line points={[[start.x, 0.2, start.z], [preview.anchor.x, (preview.placements[0]?.pos.y ?? 0) + 0.2, preview.anchor.z]]} color={color} lineWidth={1.5} transparent opacity={0.85} />
      {preview.placements.map((p) => {
        const b = baseById.get(p.modelId)
        const r = b ? Math.max(b.radius, b.radius2 ?? 0) : 0.6
        return (
          <mesh key={p.modelId} position={[p.pos.x, (p.pos.y ?? 0) + 0.07, p.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[r, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
          </mesh>
        )
      })}
      <FloatingLabel pos={{ ...preview.anchor, y: preview.placements[0]?.pos.y ?? 0 }} text={label} color={color} />
    </group>
  )
}
