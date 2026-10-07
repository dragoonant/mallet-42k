// Clamps a board point to the farthest legal destination for a pending move-family decision, so a hover
// preview or a click can never propose a move beyond the unit's range. Two passes: a plain geometric pull-back
// to the max move distance, then a bisection along start -> point against the engine's own `validate` (the
// single source of truth: coherency, engagement, terrain, overlap — every model must pass).
import type { Action, GameState, ModelPlacement, PendingDecision } from '@/engine'
import { dist2D, validate } from '@/engine'
import { useUiStore, type MovePreview, type PlacementDraft } from '../ui/uiStore'
import { combinedUnitModels, modelsAnchor, type Anchor2D } from './geometry'
import { directionFacing, formationPlacementsForUnit, type FormationKind } from './formations'
import { placementInfo } from './decisions'
import { isApproachPending } from './approachDraft'

export interface MoveClampResult {
  draft: PlacementDraft
  /** True when the engine accepts the exact action Confirm would dispatch for `draft`. */
  ok: boolean
  /** Engine rejection reason when `!ok`. */
  reason?: string
  /** Inches from the unit's start anchor to the draft's anchor. */
  distance: number
  maxDistance: number
}

export interface MoveFormation {
  kind: FormationKind
  facing: number
  /** Re-derive facing from the direction of travel (until the player rotates manually). */
  auto: boolean
}

const SCAN_STEPS = 16
const BISECT_STEPS = 10
const RANGE_EPS = 0.001

/** Move-family decisions that answer with a plain end placement (pile in / consolidate use the drag flow). */
export function isClampedMovePending(pending: PendingDecision): boolean {
  return (pending.kind === 'moveUnit' || pending.kind === 'chargeMove') && placementInfo(pending) !== null && !isApproachPending(pending)
}

/** The facing a move toward `point` would use, derived from the raw (unclamped) point so it doesn't jitter. */
export function moveFacing(state: GameState, pending: PendingDecision, point: Anchor2D, formation: MoveFormation): number {
  const info = placementInfo(pending)
  if (!info) return formation.facing
  const start = modelsAnchor(combinedUnitModels(state, info.unitId))
  return formation.auto ? directionFacing(start, point, formation.facing) : formation.facing
}

function rejectionOf(state: GameState, pending: PendingDecision, unitId: string, placements: ModelPlacement[]): string | null {
  const action = { type: pending.kind, player: pending.player, decisionId: pending.id, unitId, placements } as Action
  const s = state.pending === pending ? state : { ...state, pending }
  try {
    const rej = validate(s, action)
    return rej ? rej.reason : null
  } catch (e) {
    return e instanceof Error ? e.message : 'invalid'
  }
}

export function clampMoveDraft(state: GameState, pending: PendingDecision, point: Anchor2D, formation?: MoveFormation): MoveClampResult | null {
  const info = placementInfo(pending)
  if (!info || !isClampedMovePending(pending)) return null
  const models = combinedUnitModels(state, info.unitId)
  if (models.length === 0) return null
  const ui = useUiStore.getState()
  const form = formation ?? { kind: ui.formationKind, facing: ui.formationFacing, auto: ui.formationFacingAuto }
  const start = modelsAnchor(models)
  const facing = moveFacing(state, pending, point, form)
  const maxDistance = info.constraints.maxDistance

  // (a) geometric: pull the point back along the line to just inside the move range
  const dx = point.x - start.x
  const dz = point.z - start.z
  const len = Math.hypot(dx, dz)
  const limit = Math.max(maxDistance - RANGE_EPS, 0)
  const reach = len > limit ? limit / len : 1
  const at = (t: number): Anchor2D => ({ x: start.x + dx * reach * t, z: start.z + dz * reach * t })
  const build = (a: Anchor2D): ModelPlacement[] => formationPlacementsForUnit(state, info.unitId, a, facing, form.kind)
  const wrap = (anchor: Anchor2D, placements: ModelPlacement[], ok: boolean, reason?: string): MoveClampResult => ({
    draft: { decisionId: pending.id, unitId: info.unitId, anchor, placements },
    ok,
    reason,
    distance: dist2D(start, anchor),
    maxDistance,
  })

  // (b) engine refine: the farthest t in [0,1] whose real action validates
  const full = build(at(1))
  if (full.length === 0) return null
  const fullReason = rejectionOf(state, pending, info.unitId, full)
  if (!fullReason) return wrap(at(1), full, true)
  // legality is not monotone along the line (turning to face the cursor can swing an end model off the table edge
  // near the start while farther points are fine), so scan coarsely from far to near first, then bisect the gap
  // between the farthest legal sample and the illegal one just beyond it
  const legalAt = (t: number): ModelPlacement[] | null => {
    const placements = build(at(t))
    return placements.length > 0 && !rejectionOf(state, pending, info.unitId, placements) ? placements : null
  }
  let best: { t: number; placements: ModelPlacement[] } | null = null
  for (let i = SCAN_STEPS - 1; i >= 0 && !best; i--) {
    const t = i / SCAN_STEPS
    const placements = legalAt(t)
    if (placements) best = { t, placements }
  }
  if (best) {
    let lo = best.t
    let hi = best.t + 1 / SCAN_STEPS
    for (let i = 0; i < BISECT_STEPS; i++) {
      const mid = (lo + hi) / 2
      const placements = legalAt(mid)
      if (placements) { best = { t: mid, placements }; lo = mid } else hi = mid
    }
  }
  if (best) return wrap(at(best.t), best.placements, true)
  // nothing along the line is legal: stay where the unit stands
  const stay: ModelPlacement[] = models.map((m) => ({ modelId: m.id, pos: { ...m.pos }, facing: m.facing }))
  return wrap(start, stay, false, fullReason)
}
