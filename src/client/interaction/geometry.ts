// Client-side placement math for deployment and moves. Purely presentational input-building — every
// placement produced here is just a *proposed* Action; the engine (src/engine) is the sole authority
// on legality and will reject anything invalid via step()'s rejection, never mutated here.
import { basesOverlap, unitModels, type GameState, type Model, type ModelPlacement, type UnitId } from '@/engine'

export interface Anchor2D {
  x: number
  z: number
}

/** Centroid (x, z) of a unit's current models — the anchor a drag/click destination is relative to. */
export function modelsAnchor(models: Model[]): Anchor2D {
  if (models.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const m of models) {
    x += m.pos.x
    z += m.pos.z
  }
  return { x: x / models.length, z: z / models.length }
}

/**
 * Translate every model by the same (dx, dz) — keeps the unit's current formation offsets exactly,
 * per the owning instruction ("move the whole unit keeping formation offsets, the engine validates").
 */
export function translatedPlacements(models: Model[], from: Anchor2D, to: Anchor2D): ModelPlacement[] {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return models.map((m) => ({
    modelId: m.id,
    pos: { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz },
    facing: m.facing,
  }))
}

/**
 * Fresh grid formation around an anchor for a unit that has no meaningful on-board offsets yet
 * (deployment: every model starts stacked at the origin). Spacing stays under the 2" coherency
 * threshold so a freshly-placed unit is coherent by construction; the engine still validates zone
 * containment and overlap.
 */
export function deploymentFormation(models: Model[], anchor: Anchor2D): ModelPlacement[] {
  const n = models.length
  // A single row (rather than a grid) keeps the whole unit's depth at ~one model's footprint —
  // deployment zones are often only a few inches deep, and a multi-row block risks poking out the
  // back of a shallow zone even when the anchor click was well inside it.
  const maxRadius = models.reduce((r, m) => Math.max(r, m.base.radius, m.base.radius2 ?? m.base.radius), 0.5)
  const spacing = Math.max(1.5, maxRadius * 2 + 0.2)
  return models.map((m, i) => ({
    modelId: m.id,
    pos: { x: anchor.x + (i - (n - 1) / 2) * spacing, y: 0, z: anchor.z },
    facing: 0,
  }))
}

export function distance2D(a: Anchor2D, b: Anchor2D): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

/** A unit's own live models plus its attached leader/bodyguard's, if any — a bodyguard + its
 *  attached Leader place/move as one drop (10-rules R-10.1), so any placement UI (deployment, and
 *  the four move-family decisions) needs both units' models, not just the activated unit's own. */
export function combinedUnitModels(state: GameState, unitId: UnitId): Model[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const partnerId = unit.attachedLeaderId ?? unit.bodyguardUnitId ?? null
  const models = unitModels(state, unitId)
  if (partnerId && state.units[partnerId]) models.push(...unitModels(state, partnerId))
  return models
}

/** True if any drafted placement's base would overlap a model already on the board (excluding the
 *  unit(s) currently being placed) — used to colour a placement draft red/green before Confirm
 *  instead of only surfacing the overlap as a rejection toast after the click. */
export function placementsOverlapExisting(
  state: GameState,
  placements: { modelId: string; pos: { x: number; y: number; z: number }; facing?: number }[],
  excludeUnitIds: ReadonlySet<UnitId> = new Set(),
): boolean {
  const others: Model[] = []
  for (const unit of Object.values(state.units)) {
    if (unit.location !== 'board' || excludeUnitIds.has(unit.id)) continue
    for (const modelId of unit.models) {
      const m = state.models[modelId]
      if (m) others.push(m)
    }
  }
  for (const p of placements) {
    const model = state.models[p.modelId]
    if (!model) continue
    const footprint = { pos: p.pos, facing: p.facing ?? model.facing, base: model.base }
    if (others.some((other) => basesOverlap(footprint, other))) return true
  }
  return false
}
