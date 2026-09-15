// A board-space click point -> the draft placement it proposes, for whichever decision is currently
// pending (deployment palette pick, or one of the four move-family decisions) — laid out using the
// formation picker's currently-selected shape and facing (M4). Reads/writes the formation slice of
// uiStore directly via getState() rather than taking it as a parameter: Scene.tsx (which this feeds)
// is outside this package's ownership and already can't be changed to thread new params through, and
// Scene.tsx's own onBoardPointer does the same getState() dance for the same reason (see its comment
// on stale closures from react-three-fiber's captured-pointer events).
import type { GameState, Model, PendingDecision, Polygon, UnitId } from '@/engine'
import { whollyOnBoard, whollyWithinPolygon } from '@/engine'
import { useUiStore, type PlacementDraft } from '../ui/uiStore'
import { combinedUnitModels, modelsAnchor, type Anchor2D } from './geometry'
import { directionFacing, formationPlacementsForUnit, zoneFacing, type FormationKind, type FormationPlacement } from './formations'
import { placementInfo } from './decisions'

/** Average of a convex polygon's own vertices — always interior for the rectangle/triangle deployment
 *  zones Combat Patrol missions use — used as the "pull toward here" target when a click-drafted
 *  formation pokes outside its zone. */
function polygonCentre(zone: Polygon): Anchor2D {
  let x = 0
  let z = 0
  for (const p of zone) {
    x += p.x
    z += p.z
  }
  return { x: x / zone.length, z: z / zone.length }
}

/** True when every model's final footprint (base radius included) is wholly inside `zone` and wholly
 *  on the battlefield — the same two checks the engine's own `checkPlacements` makes for a deploy. */
function formationFitsZone(state: GameState, models: Model[], placements: FormationPlacement[], zone: Polygon): boolean {
  const byId = new Map(models.map((m) => [m.id, m]))
  for (const p of placements) {
    const m = byId.get(p.modelId)
    if (!m) continue
    const fp = { pos: p.pos, facing: p.facing, base: m.base }
    if (!whollyWithinPolygon(fp, zone)) return false
    if (!whollyOnBoard(fp, state.board)) return false
  }
  return true
}

const ZONE_CLAMP_STEPS = 24

/** When a formation drafted at `anchor` would poke outside `zone` (most often a click near the zone's
 *  own edge), nudges the anchor toward the zone's centre in small steps until the whole combined unit
 *  (bodyguard + any attached leader) fits — so an edge click places the unit just inside instead of
 *  producing a preview the engine will reject with "must end wholly within the allowed region". A
 *  no-op (returns the original anchor/placements) when the formation already fits. */
function clampAnchorToZone(
  state: GameState,
  unitId: UnitId,
  models: Model[],
  anchor: Anchor2D,
  facing: number,
  kind: FormationKind,
  zone: Polygon,
): { anchor: Anchor2D; placements: FormationPlacement[] } {
  let placements = formationPlacementsForUnit(state, unitId, anchor, facing, kind)
  if (placements.length === 0 || formationFitsZone(state, models, placements, zone)) return { anchor, placements }
  const centre = polygonCentre(zone)
  for (let i = 1; i <= ZONE_CLAMP_STEPS; i++) {
    const t = i / ZONE_CLAMP_STEPS
    const candidate = { x: anchor.x + (centre.x - anchor.x) * t, z: anchor.z + (centre.z - anchor.z) * t }
    const cand = formationPlacementsForUnit(state, unitId, candidate, facing, kind)
    if (formationFitsZone(state, models, cand, zone)) return { anchor: candidate, placements: cand }
  }
  // Nothing along the line to the centre fit either (a pathological zone/formation-size combination) —
  // fall back to the centre itself, the best-effort safest spot; validateDraft still has the final say
  // and will flag/red-tint anything that still doesn't fit rather than silently accepting it.
  return { anchor: centre, placements: formationPlacementsForUnit(state, unitId, centre, facing, kind) }
}

export function computeBoardClickDraft(
  state: GameState,
  pending: PendingDecision,
  deployTargetUnitId: string | null,
  point: { x: number; z: number },
): PlacementDraft | null {
  const ui = useUiStore.getState()

  if (pending.kind === 'deployUnit') {
    if (!deployTargetUnitId || !pending.context.unitIds.includes(deployTargetUnitId)) return null
    // A bodyguard + its attached Leader deploy as one drop (10-rules R-10.1): the engine's setup
    // module requires placements for both units' models under the bodyguard's unitId.
    const kind = ui.formationKind === 'keep' ? 'line' : ui.formationKind
    const facing = ui.formationFacingAuto ? zoneFacing(pending.context.zone) : ui.formationFacing
    const models = combinedUnitModels(state, deployTargetUnitId)
    // A click near the zone edge would otherwise produce a preview that looks fine (Confirm enabled)
    // but the engine rejects — clamp the anchor inward just enough for the whole combined unit to fit.
    const clamped = clampAnchorToZone(state, deployTargetUnitId, models, point, facing, kind, pending.context.zone)
    if (clamped.placements.length === 0) return null
    if (ui.formationFacingAuto) ui.setFormationFacing(facing, true)
    return { decisionId: pending.id, unitId: deployTargetUnitId, anchor: clamped.anchor, placements: clamped.placements }
  }

  const info = placementInfo(pending)
  if (!info) return null
  // Same combined-unit treatment for the four move-family decisions: a board-click move that only
  // translated the activated unit's own models (leaving an attached leader behind) could end the
  // unit out of coherency with no way to fix it short of the fallback list.
  const models = combinedUnitModels(state, info.unitId)
  if (models.length === 0) return null
  const anchor = modelsAnchor(models)
  const facing = ui.formationFacingAuto ? directionFacing(anchor, point, ui.formationFacing) : ui.formationFacing
  const placements = formationPlacementsForUnit(state, info.unitId, point, facing, ui.formationKind)
  if (ui.formationFacingAuto) ui.setFormationFacing(facing, true)
  return { decisionId: pending.id, unitId: info.unitId, anchor: point, placements }
}
