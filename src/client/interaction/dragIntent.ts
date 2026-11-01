// What does a one-finger touch drag do? A pure decision (no React, no stores, no three) so it can be unit tested,
// plus the two "is this ground point inside the area the drag would preview?" tests it is fed with.
//
// The rule (phone layout, one finger; mouse and pen never come here):
//   - the finger has not left the tap slop yet                          -> 'tap'   (select / click / long press; the camera stays put)
//   - the measure tool is open                                          -> 'measure'
//   - the finger landed on a model or ghost the player can drag         -> 'drag-model'
//   - a unit is being placed (deployment, reserves, deep strike, disembark):
//       the finger landed inside the allowed placement area             -> 'deploy-preview'  (else 'pan')
//   - a clamped move (moveUnit / chargeMove) is being planned:
//       the finger landed inside the unit's move range                  -> 'move-preview'    (else 'pan')
//   - anything else                                                     -> 'pan'   (the camera follows the finger over the ground)
import { deploymentZone, otherPlayer, pointInPolygon, pointToPolygonEdge, type GameState, type Model, type PendingDecision } from '@/engine'
import { combinedUnitModels, modelsAnchor } from './geometry'
import { boundRadius } from './baseMarker'
import { deployUnitInfiltrates, inInfiltratorArea } from './formationValidation'
import { placementInfo } from './decisions'

/** CSS px a finger may wander and still be a tap; past it the touch is a drag (and may pan the camera). */
export const DRAG_PX = 10

/** A finger this close (inches) to the placement area or move range still counts as inside it. */
export const AREA_MARGIN_IN = 1.5

type Pt = { x: number; z: number }

/**
 * A touch drag draws its formation LIFT_PX above the fingertip, so a player placing a unit at the near edge of an area
 * naturally lands the finger just outside it. The drag starts inside the area when the finger OR the lifted point (the
 * ground point under finger y - LIFT_PX, where the preview is drawn) is inside, or the finger is within AREA_MARGIN_IN of it.
 * `finger` / `lifted` are null when the ray misses the ground.
 */
export function dragStartsInArea(finger: Pt | null, lifted: Pt | null, inside: (p: Pt) => boolean): boolean {
  return (!!lifted && inside(lifted)) || (!!finger && inside(finger))
}

export type DragIntent = 'tap' | 'measure' | 'drag-model' | 'deploy-preview' | 'move-preview' | 'pan'

export interface DragIntentInput {
  /** CSS px the finger has travelled from where it landed */
  movedPx: number
  /** the tap slop to compare against (DRAG_PX) */
  slopPx: number
  measureOn: boolean
  /** the finger landed on a model or ghost it can drag (a nudge is running) */
  onDraggable: boolean
  /** a human deployUnit decision has a unit chosen: a drag may preview its placement */
  deployOpen: boolean
  /** the landing point is inside the allowed placement area (only read when deployOpen) */
  inDeployArea: boolean
  /** a human clamped move (moveUnit / chargeMove) is pending: a drag may preview it */
  moveOpen: boolean
  /** the landing point is inside the move range (only read when moveOpen) */
  inMoveRange: boolean
}

export function oneFingerDragIntent(i: DragIntentInput): DragIntent {
  if (i.movedPx < i.slopPx) return 'tap'
  if (i.measureOn) return 'measure'
  if (i.onDraggable) return 'drag-model'
  if (i.deployOpen) return i.inDeployArea ? 'deploy-preview' : 'pan'
  if (i.moveOpen) return i.inMoveRange ? 'move-preview' : 'pan'
  return 'pan'
}

/** A footprint small enough to stand for "the point the finger is on" in the Infiltrators-area test. */
const POINT_BASE = { shape: 'round', radius: 0.05 } as const

/**
 * Is `pt` inside the area the pending deployUnit decision lets a unit be set up in? That is the decision's zone
 * (deployment zone, reserves arrival area, deep-strike area, the band around a transport), and for an Infiltrators
 * unit also the infiltration area (the same test boardClick.ts uses before it clamps a drop back into the zone).
 */
export function pointInDeployArea(state: GameState, pending: PendingDecision, unitId: string | null, pt: { x: number; z: number }, margin = 0): boolean {
  if (pending.kind !== 'deployUnit') return false
  if (pointInPolygon(pt, pending.context.zone)) return true
  if (pointToPolygonEdge(pt, pending.context.zone) <= margin) return true
  if (unitId && deployUnitInfiltrates(state, unitId)) {
    // the enemy deployment zone must exist for the infiltration test (it always does mid-setup); a throw means "not inside"
    try {
      void deploymentZone(state, otherPlayer(pending.player))
      return inInfiltratorArea(state, pending.player, [{ pos: { x: pt.x, y: 0, z: pt.z }, facing: 0, base: POINT_BASE }])
    } catch {
      return false
    }
  }
  return false
}

/** Move range of a pending clamped move: the disc the range ring and live preview draw (start anchor, max move + the widest base). */
export function moveRangeDisc(state: GameState, pending: PendingDecision): { x: number; z: number; r: number } | null {
  const info = placementInfo(pending)
  if (!info) return null
  const models: Model[] = combinedUnitModels(state, info.unitId)
  if (models.length === 0) return null
  const c = modelsAnchor(models)
  const reach = models.reduce((r, m) => Math.max(r, boundRadius(m.base)), 0)
  return { x: c.x, z: c.z, r: info.constraints.maxDistance + reach }
}

export function pointInMoveRange(state: GameState, pending: PendingDecision, pt: { x: number; z: number }, margin = 0): boolean {
  const d = moveRangeDisc(state, pending)
  return !!d && Math.hypot(pt.x - d.x, pt.z - d.z) <= d.r + margin
}
