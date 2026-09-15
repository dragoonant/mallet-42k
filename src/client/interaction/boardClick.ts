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

/** Shifts `anchor` toward `zone`'s own centre in small steps, at a *fixed* facing/kind, until the
 *  whole combined unit (bodyguard + any attached leader) fits both the zone and the battlefield —
 *  the "click near the edge, nudge inward" half of `clampAnchorToZone`. Returns `null` (rather than
 *  silently accepting a still-invalid placement) when nothing along that line fits either, so the
 *  caller can try a different facing/kind before giving up. */
function fitByShifting(
  state: GameState,
  unitId: UnitId,
  models: Model[],
  anchor: Anchor2D,
  facing: number,
  kind: FormationKind,
  zone: Polygon,
): { anchor: Anchor2D; placements: FormationPlacement[] } | null {
  const placements = formationPlacementsForUnit(state, unitId, anchor, facing, kind)
  if (placements.length === 0) return null
  if (formationFitsZone(state, models, placements, zone)) return { anchor, placements }
  const centre = polygonCentre(zone)
  for (let i = 1; i <= ZONE_CLAMP_STEPS; i++) {
    const t = i / ZONE_CLAMP_STEPS
    const candidate = { x: anchor.x + (centre.x - anchor.x) * t, z: anchor.z + (centre.z - anchor.z) * t }
    const cand = formationPlacementsForUnit(state, unitId, candidate, facing, kind)
    if (formationFitsZone(state, models, cand, zone)) return { anchor: candidate, placements: cand }
  }
  return null
}

/** The facing whose "right" (width) axis runs parallel to `zone`'s own longest span (its two most
 *  distant vertices) — i.e. the orientation that lays a Line/Ranks/Column/Phalanx formation's *wide*
 *  side along the zone's *long* side, same convention `formations.ts`'s row layout already uses
 *  (`rightOf(facing)` is the side-to-side axis). Works for the rectangular strips Combat Patrol's own
 *  zones use (`src/data/missions/cp-0*.json`) and degrades gracefully for an odd/triangular zone by
 *  falling back to its diameter. */
function zoneLongAxisFacing(zone: Polygon): number {
  let bestD2 = -1
  let theta = 0
  for (let i = 0; i < zone.length; i++) {
    for (let j = i + 1; j < zone.length; j++) {
      const dx = zone[j].x - zone[i].x
      const dz = zone[j].z - zone[i].z
      const d2 = dx * dx + dz * dz
      if (d2 > bestD2) {
        bestD2 = d2
        theta = Math.atan2(dz, dx)
      }
    }
  }
  return theta - Math.PI / 2
}

/** Formation shapes tried, in order, once the drafted shape doesn't fit `zone` at any facing — each
 *  trades width for depth (or vice versa) relative to Line, so a zone that's too shallow/narrow for
 *  one aspect ratio has a real shot at another rather than being stuck red forever. Excludes `line`
 *  (the usual starting kind, already tried directly) and `keep`/`arrowhead` (arrowhead's own reach
 *  budget already targets Combat Patrol's narrowest zones — see `formations.ts`'s
 *  `ARROWHEAD_REACH_BUDGET_IN` — but its wedge shape doesn't fit this row-based fitting loop). */
const ZONE_FIT_FALLBACK_KINDS: FormationKind[] = ['ranks2', 'ranks3', 'column', 'phalanx', 'spread']

/** When a formation drafted at `anchor` would poke outside `zone` (most often a click near the zone's
 *  own edge, or a combined leader+bodyguard formation too big for a shallow zone), first nudges the
 *  anchor toward the zone's centre (`fitByShifting`) at the caller's own facing/kind. If that still
 *  doesn't fit, tries rotating to align the formation's wide side with the zone's own long axis (and
 *  its mirror/perpendicular), then — if even that fails — tries progressively denser formation shapes
 *  (`ZONE_FIT_FALLBACK_KINDS`) at each of those facings. Returns the facing/kind actually used
 *  alongside the anchor/placements so the caller can update the formation picker's own selection to
 *  match what was actually drafted — a result the player can Confirm as-is, not a red preview they'd
 *  have to fix by hand. Only when every one of those combinations still fails (a pathological
 *  zone/unit-size combination — e.g. a zone shallower than even one model's own base) does this fall
 *  back to the zone's plain centre at the original facing/kind, same as before: `validateDraft` still
 *  has the final say and will flag/red-tint whatever doesn't fit rather than silently accepting it. */
function clampAnchorToZone(
  state: GameState,
  unitId: UnitId,
  models: Model[],
  anchor: Anchor2D,
  facing: number,
  kind: FormationKind,
  zone: Polygon,
): { anchor: Anchor2D; placements: FormationPlacement[]; facing: number; kind: FormationKind } {
  const direct = fitByShifting(state, unitId, models, anchor, facing, kind, zone)
  if (direct) return { ...direct, facing, kind }

  const longAxis = zoneLongAxisFacing(zone)
  const rotations = [longAxis, longAxis + Math.PI, facing + Math.PI / 2, facing - Math.PI / 2]
  for (const f of rotations) {
    const fit = fitByShifting(state, unitId, models, anchor, f, kind, zone)
    if (fit) return { ...fit, facing: f, kind }
  }

  for (const altKind of ZONE_FIT_FALLBACK_KINDS) {
    for (const f of [facing, ...rotations]) {
      const fit = fitByShifting(state, unitId, models, anchor, f, altKind, zone)
      if (fit) return { ...fit, facing: f, kind: altKind }
    }
  }

  // Nothing tried fits anywhere — fall back to the zone's plain centre at the original facing/kind,
  // the best-effort safest spot.
  const centre = polygonCentre(zone)
  return { anchor: centre, placements: formationPlacementsForUnit(state, unitId, centre, facing, kind), facing, kind }
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
    // but the engine rejects — clamp the anchor inward just enough for the whole combined unit to fit,
    // rotating/reshaping as a last resort (see clampAnchorToZone) rather than leaving an unconfirmable
    // red preview. When that changed the facing/kind actually used, reflect it in the formation picker
    // so what's on screen matches what the player would see if they'd picked it themselves.
    const clamped = clampAnchorToZone(state, deployTargetUnitId, models, point, facing, kind, pending.context.zone)
    if (clamped.placements.length === 0) return null
    if (clamped.facing !== facing || ui.formationFacingAuto) ui.setFormationFacing(clamped.facing, true)
    if (clamped.kind !== kind) ui.setFormationKind(clamped.kind)
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
