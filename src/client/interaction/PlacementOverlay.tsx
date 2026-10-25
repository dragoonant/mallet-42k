// 3D preview for the decisions answered by clicking a board destination: deployment (formation
// preview in the chosen zone) and the four move-family decisions (range ring, engagement rings on
// enemies, ruler to the drafted destination). Also owns the formation's live validation readout
// (M4 #4: coherency links, red/ok ghost tints, hover distance-vs-allowance) and the per-ghost nudge
// drag (M4 #3: dragging one ghost moves just that model, Shift+drag moves the whole formation).
//
// Confirm/Cancel dispatch happens from the DOM decision prompt (src/client/ui/DecisionPrompt.tsx),
// which reads the same `validateDraft` result to disable Confirm with a reason — this component is
// purely presentational plus the nudge-drag pointer handlers, never dispatches an Action itself.
import { useEffect, useMemo, useState } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import { enemyModelsOnBoard, dist2D, type Model, type ModelBase } from '@/engine'
import { EngagementRing, MoveRangeRing, Ruler } from '../board'
import { isSpaceHeld } from '../board/cameraModifiers'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { colors } from '../ui/theme'
import { combinedUnitIds, combinedUnitModels, modelsAnchor } from './geometry'
import { placementInfo } from './decisions'
import { cameraRef } from './floors'
import { validateDraft, type CoherencyLink } from './formationValidation'
import { fightersAfter, isApproachPending, validateApproach } from './approachDraft'
import { takeWholeUnit } from './touchGesture'
import { getFormFactor } from '../ui/formFactor'
import { boundRadius, ellipseGeometry, grabRadius, markerYaw, ringOuter } from './baseMarker'
import { GhostFigure, ghostSpecs, type GhostSpec } from './GhostFigure'

const OK_COLOR = '#f5d95a'
const BLOCKED_COLOR = colors.danger
const GHOST_COLOR = '#8fa8ff'
const LINK_OK_COLOR = '#ffffff'
const LINK_BAD_COLOR = colors.danger
const FRONT_RANK_COLOR = '#ffffff'
const CHEVRON_COLOR = '#ffffff'
const FIGHT_COLOR = '#ff9a2e'

/** How close (along the facing axis) a model has to be to the formation's own front-most model to
 *  still count as "front rank" — a little over one model depth, so a slightly uneven front row (e.g.
 *  an attached leader riding a hair ahead/behind its bodyguard) still reads as one rank. */
const FRONT_RANK_TOLERANCE_IN = 0.6

/** Width of a base outline ring, inches. */
const RING_WIDTH_IN = 0.15

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

function placementsCentroid(placements: { pos: { x: number; z: number } }[]): { x: number; z: number } {
  if (placements.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const p of placements) {
    x += p.pos.x
    z += p.pos.z
  }
  return { x: x / placements.length, z: z / placements.length }
}

/** Points a chevron ("<" opening away from `facing`, apex forward) `aheadIn` inches in front of
 *  `anchor` along `facing` — the M4 gap this fixes: a formation preview of bare base rings gave no
 *  visual read on which way the unit was actually going to face once placed, arrowhead included (a
 *  wedge with no facing cue just looks like a lopsided cluster of rings). */
function FacingChevron({ anchor, facing, aheadIn, color }: { anchor: { x: number; z: number }; facing: number; aheadIn: number; color: string }) {
  const fx = Math.cos(facing)
  const fz = Math.sin(facing)
  const rx = -Math.sin(facing)
  const rz = Math.cos(facing)
  const apex: [number, number, number] = [anchor.x + fx * (aheadIn + 0.9), 0.08, anchor.z + fz * (aheadIn + 0.9)]
  const wingBase = aheadIn - 0.1
  const left: [number, number, number] = [anchor.x + fx * wingBase - rx * 0.7, 0.08, anchor.z + fz * wingBase - rz * 0.7]
  const right: [number, number, number] = [anchor.x + fx * wingBase + rx * 0.7, 0.08, anchor.z + fz * wingBase + rz * 0.7]
  return <Line points={[left, apex, right]} color={color} lineWidth={2.5} transparent opacity={0.9} />
}

/** A flat base-shaped marker at `pos`: the base outline (ring just inside its edge) with a translucent fill, drawn at
 *  the model's real size and shape. Ovals are rotated with the model's facing. `outset` > 0 draws a halo ring that
 *  many inches beyond the base edge instead (front-rank / fight rings). */
function BaseMarker({
  base,
  pos,
  facing,
  color,
  opacity,
  fill = 0,
  outset = 0,
  width = RING_WIDTH_IN,
  lift = 0.07,
}: {
  base: ModelBase
  pos: { x: number; y?: number; z: number }
  facing?: number
  color: string
  opacity: number
  /** opacity of the translucent disc inside the outline (0 = none) */
  fill?: number
  outset?: number
  width?: number
  lift?: number
}) {
  const { rx, rz } = ringOuter(base, outset)
  const ring = ellipseGeometry(rx, rz, width)
  const disc = fill > 0 ? ellipseGeometry(rx, rz, 0) : null
  return (
    <group position={[pos.x, (pos.y ?? 0) + lift, pos.z]} rotation={[0, markerYaw(facing), 0]}>
      {disc && (
        <mesh geometry={disc} position={[0, -0.01, 0]} renderOrder={1}>
          <meshBasicMaterial color={color} transparent opacity={fill} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
      <mesh geometry={ring} renderOrder={2}>
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

const FALLBACK_BASE: ModelBase = { shape: 'round', radius: 0.6 }

function DraftMarkers({
  placements,
  perModel,
  color = OK_COLOR,
  opacity = 0.85,
  onModelPointerDown,
  onHover,
  anchor,
  facing,
  fighting,
  models,
  figures,
}: {
  /** Models that would be able to fight from where they stand in this draft — drawn with an orange ring + sword mark. */
  fighting?: ReadonlySet<string>
  placements: { modelId: string; pos: { x: number; y?: number; z: number }; facing?: number }[]
  perModel?: Record<string, string[]>
  color?: string
  opacity?: number
  onModelPointerDown?: (e: ThreeEvent<PointerEvent>, modelId: string) => void
  onHover?: (modelId: string | null) => void
  /** Formation anchor + facing (radians) — when given, draws one overall facing chevron ahead of the
   *  formation and brightens whichever model(s) sit in the front rank, so a wedge (or any other
   *  shape) reads as "this way, point/front here" at a glance instead of a flat field of rings. */
  anchor?: { x: number; z: number }
  facing?: number
  /** The drafted models: their real bases size every marker (round or oval). */
  models: readonly Model[]
  /** Figure inputs per model id; when given (not low graphics) each placement also shows a translucent ghost figure. */
  figures?: Record<string, GhostSpec> | null
}) {
  const baseOf = useMemo(() => new Map(models.map((m) => [m.id, m.base])), [models])
  const modelOf = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])
  const touch = getFormFactor().touch
  const front = useMemo(() => {
    if (facing === undefined || !anchor || placements.length === 0) return null
    const fx = Math.cos(facing)
    const fz = Math.sin(facing)
    let max = -Infinity
    for (const p of placements) {
      const proj = (p.pos.x - anchor.x) * fx + (p.pos.z - anchor.z) * fz
      if (proj > max) max = proj
    }
    return { max, fx, fz }
  }, [placements, anchor, facing])
  // the chevron has to clear the biggest base in the formation, not the old fixed 0.6" ring
  const reach = useMemo(() => placements.reduce((r, p) => Math.max(r, boundRadius(baseOf.get(p.modelId) ?? FALLBACK_BASE)), 0), [placements, baseOf])

  return (
    <>
      {front && anchor && facing !== undefined && (
        <FacingChevron anchor={anchor} facing={facing} aheadIn={Math.max(front.max, 0) + Math.max(0, reach - 0.6)} color={CHEVRON_COLOR} />
      )}
      {placements.map((p) => {
        const blocked = !!perModel?.[p.modelId]?.length
        const base = baseOf.get(p.modelId) ?? FALLBACK_BASE
        const model = modelOf.get(p.modelId)
        const f = p.facing ?? model?.facing ?? 0
        const y = p.pos.y ?? 0
        const isFrontRank = !!front && (p.pos.x - anchor!.x) * front.fx + (p.pos.z - anchor!.z) * front.fz > front.max - FRONT_RANK_TOLERANCE_IN
        const spec = figures?.[p.modelId]
        return (
          <group key={p.modelId}>
            {spec && <GhostFigure spec={spec} modelId={p.modelId} x={p.pos.x} y={y} z={p.pos.z} facing={f} bad={blocked} />}
            {isFrontRank && !blocked && <BaseMarker base={base} pos={p.pos} facing={f} color={FRONT_RANK_COLOR} opacity={0.55} outset={0.15} width={0.12} lift={0.065} />}
            {fighting?.has(p.modelId) && !blocked && (
              <>
                <BaseMarker base={base} pos={p.pos} facing={f} color={FIGHT_COLOR} opacity={0.95} outset={0.22} width={0.16} lift={0.075} />
                <Html zIndexRange={[5, 0]} position={[p.pos.x, y + 0.9, p.pos.z]} center style={{ pointerEvents: 'none', fontSize: 13, lineHeight: 1, color: FIGHT_COLOR, textShadow: '0 0 3px #000' }}>
                  ⚔
                </Html>
              </>
            )}
            <BaseMarker base={base} pos={p.pos} facing={f} color={blocked ? BLOCKED_COLOR : color} opacity={isFrontRank ? Math.min(1, opacity + 0.15) : opacity} fill={blocked ? 0.28 : 0.16} />
            {onModelPointerDown && (
              <mesh
                position={[p.pos.x, y + 0.07, p.pos.z]}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  // touch has no hover: pressing a ghost shows its reason / distance label and keeps it up after the lift
                  if (e.pointerType === 'touch') onHover?.(p.modelId)
                  onModelPointerDown(e, p.modelId)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  onHover?.(p.modelId)
                }}
                onPointerOut={(e) => {
                  if (e.pointerType !== 'touch') onHover?.(null)
                }}
              >
                {/* never smaller than the base itself, however big the model */}
                <circleGeometry args={[grabRadius(base, touch), 24]} />
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
  const deployPreview = useUiStore((s) => s.deployPreview)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const startNudge = useUiStore((s) => s.startNudge)
  cameraRef.current = useThree((s) => s.camera).position // useBoardClick lifts nudge drags onto a ruin floor's plane with it
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null)
  // touch: the sticky label above clears when a finger lands anywhere else (a ghost's own pointerdown sets it again right after)
  useEffect(() => {
    const clear = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setHoveredModelId(null)
    }
    document.addEventListener('pointerdown', clear, true)
    return () => document.removeEventListener('pointerdown', clear, true)
  }, [])

  if (!state || !pending || pending.player === botSeat) return null
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null
  const ghost = previewDraft && previewDraft.decisionId === pending.id && !activeDraft ? previewDraft : null

  const beginNudge = (e: ThreeEvent<PointerEvent>, modelId: string, placements: { modelId: string; pos: { x: number; y: number; z: number } }[]) => {
    if (!activeDraft) return
    // M4 camera remap: right/middle-button and Alt/Space+left now orbit/pan the camera (CameraRig.tsx)
    // instead of grabbing a model. Shift+left is intentionally left alone here — it already means
    // "grab the whole formation" below — see issues in the M4 camera-remap report for the residual
    // collision with Shift+left-drag = pan.
    if (e.button !== 0 || e.altKey || isSpaceHeld()) return
    const model = placements.find((p) => p.modelId === modelId)
    if (!model) return
    // Shift+drag grabs the whole formation; on touch the action bar's "Whole unit" toggle does (for the next drag only)
    const shift = e.shiftKey || (e.pointerType === 'touch' && takeWholeUnit())
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
    // a live pointer/drag preview (deployDrag.ts) stands in for the staged draft while it is up
    const live = deployPreview && deployPreview.decisionId === pending.id && deployPreview.unitId === deployTargetUnitId ? deployPreview : null
    const shown = live ?? (activeDraft?.unitId === deployTargetUnitId ? activeDraft : null)
    if (!deployTargetUnitId || !shown) return null
    const models = combinedUnitModels(state, deployTargetUnitId)
    const exclude = combinedUnitIds(state, deployTargetUnitId)
    const result = validateDraft(state, models, shown.placements, null, exclude, true)
    return (
      <group>
        <CoherencyLinks links={result.links} />
        <DraftMarkers
          placements={shown.placements}
          perModel={result.perModel}
          onModelPointerDown={live ? undefined : (e, modelId) => beginNudge(e, modelId, shown.placements)}
          onHover={setHoveredModelId}
          anchor={shown.anchor}
          facing={shown.placements[0]?.facing}
          models={models}
          figures={ghostSpecs(state, models)}
        />
        {hoveredModelId && !live && <ReasonLabel modelId={hoveredModelId} placements={shown.placements} perModel={result.perModel} />}
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

  const approach = isApproachPending(pending) ? pending : null
  const result = unitDraft
    ? approach
      ? validateApproach(state, approach, models, unitDraft.placements, excludeUnitIds)
      : validateDraft(state, models, unitDraft.placements, info.constraints, excludeUnitIds, true)
    : null
  const fighting = approach && unitDraft ? fightersAfter(state, info.unitId, unitDraft.placements) : undefined

  return (
    <group>
      {approach ? (
        // each model has its own limit circle around where it started
        models.map((m) => <MoveRangeRing key={m.id} pos={{ x: m.pos.x, z: m.pos.z }} range={info.constraints.perModel[m.id] ?? info.constraints.maxDistance} />)
      ) : (
        <MoveRangeRing pos={anchor} range={info.constraints.maxDistance} />
      )}
      {showEngagement &&
        enemyModelsOnBoard(state, pending.player).map((m) => (
          <EngagementRing key={m.id} pos={{ x: m.pos.x, z: m.pos.z }} baseRadius={m.base.radius} />
        ))}
      {unitDraft && result && (
        <>
          {!approach && <Ruler a={anchor} b={unitDraft.anchor} />}
          <CoherencyLinks links={result.links} />
          <DraftMarkers
            placements={unitDraft.placements}
            perModel={result.perModel}
            onModelPointerDown={(e, modelId) => beginNudge(e, modelId, unitDraft.placements)}
            onHover={setHoveredModelId}
            anchor={unitDraft.anchor}
            facing={approach ? undefined : unitDraft.placements[0]?.facing}
            fighting={fighting}
            models={models}
            figures={ghostSpecs(state, models)}
          />
          {hoveredModelId && result.perModel[hoveredModelId]?.length ? (
            <ReasonLabel modelId={hoveredModelId} placements={unitDraft.placements} perModel={result.perModel} />
          ) : null}
          {hoveredModelId && !result.perModel[hoveredModelId]?.length && (
            <DistanceLabel modelId={hoveredModelId} models={models} placements={unitDraft.placements} constraints={info.constraints} />
          )}
        </>
      )}
      {ghost && ghost.unitId === info.unitId && (
        // `ghost.anchor` is a placeholder ({x:0,z:0} — DecisionPrompt.tsx's hover preview never
        // learns the suggested action's real anchor) — recompute the centroid from its own
        // placements so the facing chevron lands over the ghost, not off in whatever direction
        // happens to point away from the world origin.
        <DraftMarkers
          placements={ghost.placements}
          color={GHOST_COLOR}
          opacity={0.5}
          anchor={placementsCentroid(ghost.placements)}
          facing={ghost.placements[0]?.facing}
          models={models}
          figures={ghostSpecs(state, models)}
        />
      )}
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
  placements: { modelId: string; pos: { x: number; y?: number; z: number } }[]
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

export function FloatingLabel({ pos, text, color }: { pos: { x: number; y?: number; z: number }; text: string; color: string }) {
  const html = useMemo(
    () => (
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
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
  return <Html zIndexRange={[5, 0]} position={[pos.x, (pos.y ?? 0) + 0.6, pos.z]}>{html}</Html>
}
