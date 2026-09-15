// Unit formation generation (M4): turns a unit's real models + an anchor point + a facing into a
// ModelPlacement[] laid out as one of a handful of named shapes. Pure geometry — every placement
// produced here is still just a *proposed* Action; the engine is the sole authority on legality.
//
// Coordinate convention (matches src/engine/geometry.ts's baseEdgePoints / ModelBase): a model's
// `facing` (radians) points its base's `radius` axis along world (cos f, sin f) — that's "forward".
// The base's `radius2` axis (defaults to `radius` for round bases) runs along (-sin f, cos f) —
// "right". So `radius` is a model's front-to-back half-extent and `radius2` is its side-to-side
// half-extent once it's facing `f`; formation rows are built directly from those two numbers.
import { deployFacing } from '@/engine/setup'
import { repairCoherency } from '@/engine/phases/legal'
import type { GameState, Model, ModelId, ModelPlacement, UnitId, Vec3 } from '@/engine'
import type { Anchor2D } from './geometry'
import { splitBodyAndLeader } from './geometry'

export type FormationKind = 'keep' | 'line' | 'ranks2' | 'ranks3' | 'phalanx' | 'arrowhead' | 'column' | 'spread'

export interface FormationPlacement {
  modelId: ModelId
  pos: Vec3
  facing: number
}

/** Order shown in the HUD strip + the number key that picks each one. "Keep current shape" has no
 *  number key of its own (it's the default once a unit has a remembered formation) but key "0"
 *  still selects it explicitly. */
export const FORMATION_ORDER: FormationKind[] = ['line', 'ranks2', 'ranks3', 'phalanx', 'arrowhead', 'column', 'spread']

export const FORMATION_LABELS: Record<FormationKind, string> = {
  keep: 'Keep current shape',
  line: 'Line',
  ranks2: 'Ranks (2)',
  ranks3: 'Ranks (3)',
  phalanx: 'Phalanx',
  arrowhead: 'Arrowhead',
  column: 'Column',
  spread: 'Spread',
}

export const FORMATION_HINTS: Record<FormationKind, string> = {
  keep: "keeps the unit's current shape, re-centred on the new spot",
  line: 'one rank, shoulder to shoulder',
  ranks2: 'two ranks deep',
  ranks3: 'three ranks deep',
  phalanx: 'a tight square block',
  arrowhead: 'a wedge, point toward facing',
  column: 'two wide, many deep — good for narrow gaps',
  spread: 'spaced to the edge of coherency — spreads out a blast',
}

export const FORMATION_KEYS: Record<string, FormationKind> = {
  '1': 'line',
  '2': 'ranks2',
  '3': 'ranks3',
  '4': 'phalanx',
  '5': 'arrowhead',
  '6': 'column',
  '7': 'spread',
  '0': 'keep',
}

const EDGE_GAP_IN = 0.1
/** Coherency threshold is 2" edge-to-edge (COHERENCY_H); spread keeps a small margin under it so a
 *  model that's nudged a little still reads as coherent. */
const SPREAD_GAP_IN = 1.9
export const ROTATE_STEP_RAD = (15 * Math.PI) / 180

function forwardOf(facing: number): { x: number; z: number } {
  return { x: Math.cos(facing), z: Math.sin(facing) }
}
function rightOf(facing: number): { x: number; z: number } {
  return { x: -Math.sin(facing), z: Math.cos(facing) }
}

/** Front-to-back half-extent once facing `facing` — always `base.radius` per the convention above. */
function depthHalf(m: Pick<Model, 'base'>): number {
  return m.base.radius
}
/** Side-to-side half-extent once facing `facing` — `base.radius2` for an oval base, else `radius`. */
function widthHalf(m: Pick<Model, 'base'>): number {
  return m.base.radius2 ?? m.base.radius
}

interface RowSlot { model: Model; v: number }

/** Lays one row of models side by side (their own real widths + a small edge gap), centred on v=0. */
function layoutRow(models: Model[], gap: number): RowSlot[] {
  const slots: RowSlot[] = []
  let v = 0
  for (let i = 0; i < models.length; i++) {
    if (i === 0) v = 0
    else v += widthHalf(models[i - 1]) + gap + widthHalf(models[i])
    slots.push({ model: models[i], v })
  }
  if (slots.length > 0) {
    const mid = (slots[0].v + slots[slots.length - 1].v) / 2
    for (const s of slots) s.v -= mid
  }
  return slots
}

/** Stacks row-groups (front to back, in array order) along the forward axis; each row is spaced
 *  from the next by the deepest model in either row plus the edge gap. Returns local (u, v)
 *  offsets — u > 0 is forward (toward the formation's front), v > 0 is to the right. */
function layoutRows(rowGroups: Model[][], gap: number): Map<ModelId, { u: number; v: number }> {
  const out = new Map<ModelId, { u: number; v: number }>()
  let u = 0
  let prevDepth = 0
  rowGroups.forEach((row, i) => {
    if (row.length === 0) return
    const depth = Math.max(...row.map(depthHalf))
    if (i > 0) u -= prevDepth + gap + depth
    for (const slot of layoutRow(row, gap)) out.set(slot.model.id, { u, v: slot.v })
    prevDepth = depth
  })
  if (out.size > 0) {
    const us = [...out.values()].map((p) => p.u)
    const midU = (Math.min(...us) + Math.max(...us)) / 2
    for (const p of out.values()) p.u -= midU
  }
  return out
}

/** Splits `n` into `rows` groups as evenly as possible, front rows getting any remainder. */
function evenSplit(n: number, rows: number): number[] {
  const base = Math.floor(n / rows)
  const extra = n % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0)).filter((s) => s > 0)
}

function chunkInto(models: Model[], size: number): Model[][] {
  const rows: Model[][] = []
  for (let i = 0; i < models.length; i += size) rows.push(models.slice(i, i + size))
  return rows
}

function sliceByRowSizes(models: Model[], sizes: number[]): Model[][] {
  const rows: Model[][] = []
  let i = 0
  for (const size of sizes) {
    rows.push(models.slice(i, i + size))
    i += size
  }
  return rows
}

/** Body-only row groups (front to back) for a given formation kind — the leader (if any) is
 *  inserted separately by `formationRows` so every shape gets the same "attach the leader"
 *  treatment without duplicating it per-kind. Arrowhead is handled separately by `arrowheadOffsets`
 *  (a true hollow wedge, not a row-stack), so it's excluded from this type. */
function bodyRowGroups(models: Model[], kind: Exclude<FormationKind, 'keep' | 'arrowhead'>): Model[][] {
  const n = models.length
  switch (kind) {
    case 'line':
      return [models]
    case 'ranks2':
      return sliceByRowSizes(models, evenSplit(n, 2))
    case 'ranks3':
      return sliceByRowSizes(models, evenSplit(n, 3))
    case 'column':
      return chunkInto(models, 2)
    case 'phalanx':
    case 'spread': {
      const rows = Math.max(1, Math.round(Math.sqrt(n)))
      return sliceByRowSizes(models, evenSplit(n, rows))
    }
  }
}

/** Row groups including the attached leader, front to back — centre-rear for every shape (an extra
 *  row appended at the very back). Not used for arrowhead (see `arrowheadOffsets`). */
function formationRows(bodyModels: Model[], leaderModels: Model[], kind: Exclude<FormationKind, 'keep' | 'arrowhead'>): Model[][] {
  const rows = bodyRowGroups(bodyModels, kind)
  if (leaderModels.length === 0) return rows
  rows.push(leaderModels)
  return rows
}

/** Same-side rank step (both the lateral ±k·spacing increment and the k·rankGap depth increment share
 *  this one value): the tightest step that keeps adjacent-rank bases from overlapping (`2·rad` between
 *  ranks placed diagonally apart, plus a small edge gap), i.e. `(2·rad + EDGE_GAP_IN) / sqrt(2)` per
 *  axis. Deliberately the *minimum* safe value, not a wider one — a true open/hollow wedge's reach
 *  grows linearly with its rank count, and Combat Patrol's own deployment zones run as narrow as 10"
 *  wide (see `ARROWHEAD_REACH_BUDGET_IN`), so every inch of per-rank spacing is inches the whole
 *  formation may not have to spend once a 45°-rotated anchor is boxed in on both axes. */
function arrowheadStep(rad: number): number {
  return (2 * rad + EDGE_GAP_IN) / Math.SQRT2
}

/** How far in inches the wedge's own reach (point to its deepest rank) is allowed to grow before
 *  later models stop opening new diagonal ranks and instead widen the last one into a row (see
 *  `arrowheadOffsets`). Combat Patrol's narrowest deployment zones are 10" wide (5" either side of
 *  centre) — this keeps a 45°-rotated wedge's corner-to-anchor reach comfortably inside that even
 *  before accounting for terrain, so a 10+ model unit's Arrowhead is still choosable at the board's
 *  tightest zones, not just its widest ones. */
const ARROWHEAD_REACH_BUDGET_IN = 4.5

/** Arrowhead's true wedge/chevron layout: a lone point model on the facing axis, then symmetric pairs
 *  behind it at increasing lateral offsets ±k·step and increasing depth k·step (k = 1, 2, 3, ...) — an
 *  open back, not the solid filled triangle a widening-row layout would produce. Ranks keep opening
 *  while both (a) there are at least 2 body models left to pair up and (b) the *next* rank would still
 *  stay within `ARROWHEAD_REACH_BUDGET_IN` of the point — beyond that (a large unit, or one with a
 *  wide base), every remaining body model widens the *last* rank into a tight touching row instead of
 *  opening new ranks indefinitely, which is what would otherwise make a 20-model wedge too wide for
 *  any real deployment zone to hold. Any attached leader always rides in that same trailing group
 *  (tacked onto the tail row, or — for a unit small enough that no tail row was needed — starting one
 *  of its own at the next rank depth), never at the very tip.
 *
 *  Every rank up to the second-to-last has two same-side neighbours (k∓1) by construction; the last
 *  rank/row's own members are each other's neighbours (touching), plus the second-to-last rank's same-
 *  side model where that's in range. `generateFormation` still runs the result through the engine's
 *  own `repairCoherency` as a defensive fallback (see that function) for any base-size/rank-count
 *  combination this construction doesn't already cover. */
function arrowheadOffsets(bodyModels: Model[], leaderModels: Model[]): Map<ModelId, { u: number; v: number }> {
  const out = new Map<ModelId, { u: number; v: number }>()
  if (bodyModels.length === 0) return out
  const all = [...bodyModels, ...leaderModels]
  const rad = Math.max(...all.map((m) => Math.max(widthHalf(m), depthHalf(m))))
  const step = arrowheadStep(rad)
  const maxRanks = Math.max(1, Math.floor(ARROWHEAD_REACH_BUDGET_IN / step))
  const [point, ...rest] = bodyModels
  out.set(point.id, { u: 0, v: 0 })
  const placed: { u: number; v: number; r: number }[] = [{ u: 0, v: 0, r: rad }]
  let k = 1
  let i = 0
  while (i + 1 < rest.length && k < maxRanks) {
    const left = { u: -k * step, v: -k * step }
    const right = { u: -k * step, v: k * step }
    out.set(rest[i].id, left)
    out.set(rest[i + 1].id, right)
    placed.push({ ...left, r: rad }, { ...right, r: rad })
    i += 2
    k += 1
  }
  // Whatever's left — 0, 1, or (once the rank budget is spent) a whole remainder — plus any attached
  // leader, becomes one tight touching row. A *wide* remainder (many models widening the last rank at
  // once) can be wider than the legs ahead of it, so straight `-k·step` depth isn't always far enough
  // behind them to clear — the row is pushed straight back (its own internal layout unchanged) until
  // none of its members overlap any already-placed leg model.
  const tail: Model[] = [...rest.slice(i), ...leaderModels]
  if (tail.length > 0) {
    const rowSlots = layoutRow(tail, EDGE_GAP_IN)
    const rowRadii = rowSlots.map((s) => Math.max(widthHalf(s.model), depthHalf(s.model)))
    let depth = k * step
    for (let guard = 0; guard < 400; guard++) {
      const u = -depth
      const clear = rowSlots.every((s, idx) => placed.every((o) => Math.hypot(u - o.u, s.v - o.v) >= rowRadii[idx] + o.r + EDGE_GAP_IN * 0.5))
      if (clear) break
      depth += Math.max(0.05, rad * 0.1)
    }
    for (let idx = 0; idx < rowSlots.length; idx++) out.set(rowSlots[idx].model.id, { u: -depth, v: rowSlots[idx].v })
  }
  return out
}

/** Defensive coherency safety net for `arrowheadOffsets`'s output — the construction above (the
 *  skip-2 same-side step for legs, the search-based `placePocketSlot` for leader/leftover models) is
 *  coherent by construction for the common case, but this catches anything an edge-case base shape
 *  (e.g. a strongly oval base, or a unit mixing very different base sizes) slips past that, by reusing
 *  the engine's own `repairCoherency` (src/engine/phases/legal.ts, also used by the move/charge/
 *  pile-in/consolidate legal-move search) rather than re-deriving the same "nudge a stray model beside
 *  the main group" search here. `allowance` is unlimited because this is a from-scratch formation
 *  preview, not a movement-budget-constrained board move — the engine re-validates any real move/
 *  placement's distance separately when the player confirms it. A no-op whenever the construction
 *  above is already fully coherent (the normal case), since `repairCoherency` exits immediately once
 *  `isCoherent` holds. */
function repairArrowheadCoherency(models: Model[], placements: FormationPlacement[]): FormationPlacement[] {
  if (models.length < 2) return placements
  const initial: ModelPlacement[] = placements.map((p) => ({ modelId: p.modelId, pos: p.pos, facing: p.facing }))
  const repaired = repairCoherency(models, initial, { allowance: () => Infinity, blockers: [] })
  const byId = new Map(repaired.map((p) => [p.modelId, p]))
  return placements.map((p) => {
    const r = byId.get(p.modelId)
    return r ? { modelId: p.modelId, pos: r.pos, facing: p.facing } : p
  })
}

function gapFor(kind: Exclude<FormationKind, 'keep'>): number {
  return kind === 'spread' ? SPREAD_GAP_IN : EDGE_GAP_IN
}

function toWorld(anchor: Anchor2D, facing: number, offsets: Map<ModelId, { u: number; v: number }>, models: Model[]): FormationPlacement[] {
  const fwd = forwardOf(facing)
  const right = rightOf(facing)
  return models.map((m) => {
    const off = offsets.get(m.id) ?? { u: 0, v: 0 }
    return {
      modelId: m.id,
      pos: { x: anchor.x + off.u * fwd.x + off.v * right.x, y: m.pos.y, z: anchor.z + off.u * fwd.z + off.v * right.z },
      facing,
    }
  })
}

/** This unit's current shape, expressed as local (u, v) offsets from its own centroid at its own
 *  current average facing — used by 'keep' to re-centre/re-face the exact arrangement it already
 *  has rather than regenerating a fresh one. */
function currentShapeOffsets(models: Model[]): { offsets: Map<ModelId, { u: number; v: number }>; facing: number } {
  const cx = models.reduce((s, m) => s + m.pos.x, 0) / models.length
  const cz = models.reduce((s, m) => s + m.pos.z, 0) / models.length
  const sinSum = models.reduce((s, m) => s + Math.sin(m.facing), 0)
  const cosSum = models.reduce((s, m) => s + Math.cos(m.facing), 0)
  const facing = Math.atan2(sinSum, cosSum)
  const fwd = forwardOf(facing)
  const right = rightOf(facing)
  const offsets = new Map<ModelId, { u: number; v: number }>()
  for (const m of models) {
    const dx = m.pos.x - cx
    const dz = m.pos.z - cz
    offsets.set(m.id, { u: dx * fwd.x + dz * fwd.z, v: dx * right.x + dz * right.z })
  }
  return { offsets, facing }
}

/** The single entry point: `bodyModels` (the activated/target unit's own models) plus its attached
 *  `leaderModels` (empty if none), an anchor point and a facing (radians) -> every model's new
 *  placement. `kind: 'keep'` ignores `facing`'s caller-supplied default and instead keeps the
 *  combined unit's own current relative arrangement, just re-centred on `anchor` and turned to
 *  `facing`. */
export function generateFormation(
  bodyModels: Model[],
  leaderModels: Model[],
  anchor: Anchor2D,
  facing: number,
  kind: FormationKind,
): FormationPlacement[] {
  const all = [...bodyModels, ...leaderModels]
  if (all.length === 0) return []
  if (kind === 'keep') {
    const { offsets } = currentShapeOffsets(all)
    return toWorld(anchor, facing, offsets, all)
  }
  if (kind === 'arrowhead') {
    const offsets = arrowheadOffsets(bodyModels, leaderModels)
    return repairArrowheadCoherency(all, toWorld(anchor, facing, offsets, all))
  }
  const rows = formationRows(bodyModels, leaderModels, kind)
  const offsets = layoutRows(rows, gapFor(kind))
  return toWorld(anchor, facing, offsets, all)
}

/** Convenience wrapper for the three call sites that need "this unit's body+leader, laid out at
 *  (anchor, facing, kind)": the initial board click (boardClick.ts), a live kind/facing change from
 *  the formation picker, and its Reset button (both DecisionPrompt.tsx) — keeps the
 *  split-then-generate pairing in one place. */
export function formationPlacementsForUnit(
  state: GameState,
  unitId: UnitId,
  anchor: Anchor2D,
  facing: number,
  kind: FormationKind,
): FormationPlacement[] {
  const { body, leader } = splitBodyAndLeader(state, unitId)
  return generateFormation(body, leader, anchor, facing, kind)
}

/** A safe starting facing for a fresh deployment, before the player has rotated it: perpendicular to
 *  a deployment zone's own long axis, so a multi-model line/ranks spread runs along whichever
 *  dimension the zone is actually wide in rather than the click position tilting it — Combat Patrol
 *  zones are often just a few inches deep (e.g. 44" x 5"), so a spread that happens to run mostly
 *  across the shallow axis (which "face the click toward board centre" can produce for an
 *  off-centre click) would routinely poke out of the zone. */
export function zoneFacing(zone: { x: number; z: number }[]): number {
  if (zone.length === 0) return 0
  // face from the zone's centre toward the board centre, so each side deploys looking at the enemy
  return deployFacing(zone)
}

/** A sensible starting facing for a fresh formation before the player has rotated it: the direction
 *  of travel from `from` to `to` (moves/charges), falling back to `fallback` when the two points
 *  coincide (e.g. the very first click, or a pile-in that barely moves). */
export function directionFacing(from: Anchor2D, to: Anchor2D, fallback: number): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.hypot(dx, dz) < 1e-3) return fallback
  return Math.atan2(dz, dx)
}

export function normalizeAngle(a: number): number {
  let r = a % (2 * Math.PI)
  if (r > Math.PI) r -= 2 * Math.PI
  if (r < -Math.PI) r += 2 * Math.PI
  return r
}
