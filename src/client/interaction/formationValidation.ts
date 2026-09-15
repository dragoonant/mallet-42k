// Live client-side checks for a formation draft, so the preview can show trouble before the player
// hits Confirm — the engine still has the final say (checkPlacements/isCoherent are the same rules
// it uses internally); this is purely a faster, friendlier heads-up.
import {
  DEFAULT_SERVICES,
  basesOverlap,
  coherencyNeighboursNeeded,
  dist2D,
  inCoherencyRange,
  isCoherent,
  type Footprint,
  type GameState,
  type Model,
  type ModelId,
  type MoveConstraints,
  type UnitId,
  type Vec3,
} from '@/engine'

export interface DraftPlacement { modelId: ModelId; pos: Vec3; facing?: number }

export interface CoherencyLink { a: Vec3; b: Vec3; ok: boolean }

export interface ValidationResult {
  ok: boolean
  /** Reason strings per model — a non-empty array means that model's ghost should tint red. */
  perModel: Record<ModelId, string[]>
  /** Short, deduplicated reasons for a "why Confirm is disabled" banner; empty when `ok`. */
  reasons: string[]
  links: CoherencyLink[]
}

function footprintOf(model: Model, p: DraftPlacement): Footprint {
  return { pos: p.pos, facing: p.facing ?? model.facing, base: model.base }
}

/** All other-unit models currently on the board — used for the "would overlap an existing model"
 *  check (mirrors geometry.ts's placementsOverlapExisting, but per-model so each ghost can be
 *  flagged individually instead of an all-or-nothing boolean). */
function otherBoardModels(state: GameState, excludeUnitIds: ReadonlySet<UnitId>): Model[] {
  const others: Model[] = []
  for (const unit of Object.values(state.units)) {
    if (unit.location !== 'board' || excludeUnitIds.has(unit.id)) continue
    for (const modelId of unit.models) {
      const m = state.models[modelId]
      if (m) others.push(m)
    }
  }
  return others
}

function addReason(perModel: Record<ModelId, string[]>, modelId: ModelId, reason: string) {
  ;(perModel[modelId] ??= []).push(reason)
}

/** Checks a drafted set of placements against: self-overlap, overlap with any other model already
 *  on the board, per-model move allowance (when `constraints` is given), terrain (when
 *  `checkTerrain`), and coherency (always — a deployed/moved/piled-in/consolidated unit must end
 *  coherent). Returns per-model reasons (for red ghost tints + hover text) and a short reason list
 *  (for disabling Confirm). Cheap enough to run on every pointer move: O(n²) over the unit's own
 *  models (n <= ~14 for Combat Patrol) plus one terrain lookup per model. */
export function validateDraft(
  state: GameState,
  models: Model[],
  placements: DraftPlacement[],
  constraints: MoveConstraints | null,
  excludeUnitIds: ReadonlySet<UnitId>,
  checkTerrain: boolean,
): ValidationResult {
  const byId = new Map(models.map((m) => [m.id, m]))
  const perModel: Record<ModelId, string[]> = {}
  const reasonSet = new Set<string>()

  const finals: { modelId: ModelId; fp: Footprint }[] = placements
    .map((p) => {
      const m = byId.get(p.modelId)
      return m ? { modelId: p.modelId, fp: footprintOf(m, p) } : null
    })
    .filter((x): x is { modelId: ModelId; fp: Footprint } => !!x)

  // self-overlap (mixed base sizes must not overlap even within the same drafted formation)
  for (let i = 0; i < finals.length; i++) {
    for (let j = i + 1; j < finals.length; j++) {
      if (basesOverlap(finals[i].fp, finals[j].fp)) {
        addReason(perModel, finals[i].modelId, 'overlaps another model in this unit')
        addReason(perModel, finals[j].modelId, 'overlaps another model in this unit')
        reasonSet.add('models overlap each other')
      }
    }
  }

  // overlap with anything else already on the board
  const others = otherBoardModels(state, excludeUnitIds)
  for (const f of finals) {
    if (others.some((o) => basesOverlap(f.fp, o))) {
      addReason(perModel, f.modelId, 'overlaps an existing model')
      reasonSet.add('overlaps an existing model')
    }
  }

  // move allowance (straight-line distance — a close approximation of the engine's own pivot-aware
  // pathLength, good enough for a live heads-up; the engine's checkPlacements has the final word)
  if (constraints) {
    for (const p of placements) {
      const cur = state.models[p.modelId]
      if (!cur) continue
      const d = dist2D(cur.pos, p.pos)
      const allowance = constraints.perModel[p.modelId] ?? constraints.maxDistance
      if (d > allowance + 1e-3) {
        addReason(perModel, p.modelId, `moves ${d.toFixed(1)}" > ${allowance.toFixed(1)}" allowed`)
        reasonSet.add('exceeds move allowance')
      }
    }
  }

  // terrain — `canEndAt` (does the final spot itself work?) always applies. `crossesImpassable`
  // walks the straight line from the model's *current* position, which is only meaningful for an
  // actual move (`constraints` non-null); a deploying model's "current position" is just wherever
  // it happened to start stacked before placement, so treating that as a path would flag it as
  // blocked by whatever terrain happens to sit between the board centre and the deployment zone.
  if (checkTerrain) {
    for (const p of placements) {
      const cur = state.models[p.modelId]
      if (!cur) continue
      const facing = p.facing ?? cur.facing
      const synthetic: Model = { ...cur, facing }
      const endCheck = DEFAULT_SERVICES.terrain.canEndAt(state, synthetic, p.pos)
      const crossed = constraints ? DEFAULT_SERVICES.terrain.crossesImpassable(state, synthetic, [cur.pos, p.pos]) : false
      if (!endCheck.ok || crossed) {
        addReason(perModel, p.modelId, endCheck.reason ?? 'blocked by terrain')
        reasonSet.add('blocked by terrain')
      }
    }
  }

  // coherency — per-model neighbour count (for the link colours / red tint) + the engine's own
  // connected-group rule (for the overall ok/disabled-Confirm gate)
  const need = coherencyNeighboursNeeded(finals.length)
  const counts: number[] = finals.map(() => 0)
  const nearest: number[] = finals.map(() => -1)
  for (let i = 0; i < finals.length; i++) {
    let nearestD = Infinity
    for (let j = 0; j < finals.length; j++) {
      if (i === j) continue
      if (inCoherencyRange(finals[i].fp, finals[j].fp)) counts[i]++
      const d = dist2D(finals[i].fp.pos, finals[j].fp.pos)
      if (d < nearestD) { nearestD = d; nearest[i] = j }
    }
  }
  const brokenIdx = new Set<number>()
  for (let i = 0; i < finals.length; i++) if (counts[i] < need) brokenIdx.add(i)
  const links: CoherencyLink[] = []
  const drawn = new Set<string>()
  for (let i = 0; i < finals.length; i++) {
    const j = nearest[i]
    if (j < 0) continue
    const key = i < j ? `${i}-${j}` : `${j}-${i}`
    if (drawn.has(key)) continue
    drawn.add(key)
    links.push({ a: finals[i].fp.pos, b: finals[j].fp.pos, ok: !brokenIdx.has(i) && !brokenIdx.has(j) })
  }
  for (const i of brokenIdx) {
    addReason(perModel, finals[i].modelId, 'breaks unit coherency')
    reasonSet.add('unit out of coherency')
  }
  if (finals.length > 1 && !isCoherent(finals.map((f) => f.fp))) reasonSet.add('unit out of coherency')

  return { ok: reasonSet.size === 0, perModel, reasons: [...reasonSet], links }
}
