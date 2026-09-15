// 3D preview for the decisions answered by clicking a board destination: deployment (formation
// preview in the chosen zone) and the four move-family decisions (range ring, engagement rings on
// enemies, ruler to the drafted destination). Also owns the formation's live validation readout
// (M4 #4: coherency links, red/ok ghost tints, hover distance-vs-allowance) and the per-ghost nudge
// drag (M4 #3: dragging one ghost moves just that model, Shift+drag moves the whole formation).
//
// Confirm/Cancel dispatch happens from the DOM decision prompt (src/client/ui/DecisionPrompt.tsx),
// which reads the same `validateDraft` result to disable Confirm with a reason — this component is
// purely presentational plus the nudge-drag pointer handlers, never dispatches an Action itself.
import { useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { enemyModelsOnBoard, dist2D, type Model, type UnitId } from '@/engine'
import { EngagementRing, MoveRangeRing, Ruler } from '../board'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { colors } from '../ui/theme'
import { combinedUnitIds, combinedUnitModels, modelsAnchor } from './geometry'
import { placementInfo } from './decisions'
import { validateDraft, type CoherencyLink } from './formationValidation'

const OK_COLOR = '#f5d95a'
const BLOCKED_COLOR = colors.danger
const GHOST_COLOR = '#8fa8ff'
const LINK_OK_COLOR = '#ffffff'
const LINK_BAD_COLOR = colors.danger

/** Slightly bigger than the visible ring so a nudge-drag is easy to grab without needing pixel
 *  precision — invisible, pointer-events only. */
const GRAB_RADIUS = 0.85

function CoherencyLinks({ links }: { links: CoherencyLink[] }) {
  return (
    <>
      {links.map((l, i) => (
        <Line
          key={i}
          points={[
            [l.a.x, 0.06, l.a.z],
            [l.b.x, 0.06, l.b.z],
          ]}
          color={l.ok ? LINK_OK_COLOR : LINK_BAD_COLOR}
          lineWidth={1}
          transparent
          opacity={l.ok ? 0.35 : 0.85}
        />
      ))}
    </>
  )
}

function DraftMarkers({
  placements,
  perModel,
  color = OK_COLOR,
  opacity = 0.85,
  onModelPointerDown,
  onHover,
}: {
  placements: { modelId: string; pos: { x: number; z: number } }[]
  perModel?: Record<string, string[]>
  color?: string
  opacity?: number
  onModelPointerDown?: (e: ThreeEvent<PointerEvent>, modelId: string) => void
  onHover?: (modelId: string | null) => void
}) {
  return (
    <>
      {placements.map((p) => {
        const blocked = !!perModel?.[p.modelId]?.length
        return (
          <group key={p.modelId}>
            <mesh position={[p.pos.x, 0.07, p.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.45, 0.6, 24]} />
              <meshBasicMaterial color={blocked ? BLOCKED_COLOR : color} transparent opacity={opacity} />
            </mesh>
            {onModelPointerDown && (
              <mesh
                position={[p.pos.x, 0.07, p.pos.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onModelPointerDown(e, p.modelId)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  onHover?.(p.modelId)
                }}
                onPointerOut={() => onHover?.(null)}
              >
                <circleGeometry args={[GRAB_RADIUS, 16]} />
                {/* transparent+opacity 0 (not visible=false) — R3F skips raycasting on invisible
                    objects, which would silently kill the drag/hover handlers above */}
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

export function PlacementOverlay() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const draft = useUiStore((s) => s.draft)
  const previewDraft = useUiStore((s) => s.previewDraft)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const startNudge = useUiStore((s) => s.startNudge)
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null)

  if (!state || !pending || pending.player === botSeat) return null
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null
  const ghost = previewDraft && previewDraft.decisionId === pending.id && !activeDraft ? previewDraft : null

  const beginNudge = (e: ThreeEvent<PointerEvent>, modelId: string, placements: { modelId: string; pos: { x: number; y: number; z: number } }[]) => {
    if (!activeDraft) return
    const model = placements.find((p) => p.modelId === modelId)
    if (!model) return
    const shift = e.shiftKey
    if (shift) {
      startNudge({
        decisionId: activeDraft.decisionId,
        mode: 'formation',
        modelId: null,
        grab: { x: e.point.x, z: e.point.z },
        basePlacements: activeDraft.placements,
      })
    } else {
      startNudge({
        decisionId: activeDraft.decisionId,
        mode: 'model',
        modelId,
        grab: { x: e.point.x - model.pos.x, z: e.point.z - model.pos.z },
        basePlacements: activeDraft.placements,
      })
    }
  }

  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || activeDraft?.unitId !== deployTargetUnitId) return null
    const models = combinedUnitModels(state, deployTargetUnitId)
    const exclude = combinedUnitIds(state, deployTargetUnitId)
    const result = validateDraft(state, models, activeDraft.placements, null, exclude, true)
    return (
      <group>
        <CoherencyLinks links={result.links} />
        <DraftMarkers
          placements={activeDraft.placements}
          perModel={result.perModel}
          onModelPointerDown={(e, modelId) => beginNudge(e, modelId, activeDraft.placements)}
          onHover={setHoveredModelId}
        />
        {hoveredModelId && <ReasonLabel modelId={hoveredModelId} placements={activeDraft.placements} perModel={result.perModel} />}
      </group>
    )
  }

  const info = placementInfo(pending)
  if (!info) return null
  const models = combinedUnitModels(state, info.unitId)
  if (models.length === 0) return null
  const anchor = modelsAnchor(models)
  const showEngagement = info.actionType === 'moveUnit' || info.actionType === 'chargeMove'
  const unitDraft = activeDraft?.unitId === info.unitId ? activeDraft : null
  const excludeUnitIds = combinedUnitIds(state, info.unitId)

  const result = unitDraft ? validateDraft(state, models, unitDraft.placements, info.constraints, excludeUnitIds, true) : null

  return (
    <group>
      <MoveRangeRing pos={anchor} range={info.constraints.maxDistance} />
      {showEngagement &&
        enemyModelsOnBoard(state, pending.player).map((m) => (
          <EngagementRing key={m.id} pos={{ x: m.pos.x, z: m.pos.z }} baseRadius={m.base.radius} />
        ))}
      {unitDraft && result && (
        <>
          <Ruler a={anchor} b={unitDraft.anchor} />
          <CoherencyLinks links={result.links} />
          <DraftMarkers
            placements={unitDraft.placements}
            perModel={result.perModel}
            onModelPointerDown={(e, modelId) => beginNudge(e, modelId, unitDraft.placements)}
            onHover={setHoveredModelId}
          />
          {hoveredModelId && (
            <DistanceLabel modelId={hoveredModelId} models={models} placements={unitDraft.placements} constraints={info.constraints} />
          )}
        </>
      )}
      {ghost && ghost.unitId === info.unitId && <DraftMarkers placements={ghost.placements} color={GHOST_COLOR} opacity={0.5} />}
    </group>
  )
}

/** Hover readout for a deployment ghost: why it's flagged, if it is. */
function ReasonLabel({
  modelId,
  placements,
  perModel,
}: {
  modelId: string
  placements: { modelId: string; pos: { x: number; z: number } }[]
  perModel: Record<string, string[]>
}) {
  const p = placements.find((x) => x.modelId === modelId)
  const reasons = perModel[modelId]
  if (!p || !reasons || reasons.length === 0) return null
  return <FloatingLabel pos={p.pos} text={reasons[0]} color={BLOCKED_COLOR} />
}

/** Hover readout for a move-family ghost: distance moved vs. this model's allowance (M4 #4). */
function DistanceLabel({
  modelId,
  models,
  placements,
  constraints,
}: {
  modelId: string
  models: Model[]
  placements: { modelId: string; pos: { x: number; y: number; z: number } }[]
  constraints: { maxDistance: number; perModel: Record<string, number> }
}) {
  const model = models.find((m) => m.id === modelId)
  const p = placements.find((x) => x.modelId === modelId)
  if (!model || !p) return null
  const d = dist2D(model.pos, p.pos)
  const allowance = constraints.perModel[modelId] ?? constraints.maxDistance
  const over = d > allowance + 1e-3
  return <FloatingLabel pos={p.pos} text={`${d.toFixed(1)}" / ${allowance.toFixed(1)}"`} color={over ? BLOCKED_COLOR : colors.text} />
}

function FloatingLabel({ pos, text, color }: { pos: { x: number; z: number }; text: string; color: string }) {
  const html = useMemo(
    () => (
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 700,
          color,
          background: 'rgba(10,10,16,0.85)',
          padding: '2px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          transform: 'translate(-50%, -140%)',
          pointerEvents: 'none',
        }}
      >
        {text}
      </div>
    ),
    [text, color],
  )
  return <Html position={[pos.x, 0.6, pos.z]}>{html}</Html>
}
