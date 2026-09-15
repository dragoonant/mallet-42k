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
import type { GameState, Model, ModelId, UnitId, Vec3 } from '@/engine'
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

/** Arrowhead rank sizes: 1, 2, 3, ... until every model has a spot (the last rank absorbs any
 *  remainder), e.g. 10 models -> [1, 2, 3, 4] exactly. */
function arrowheadRowSizes(n: number): number[] {
  const sizes: number[] = []
  let remaining = n
  let k = 1
  while (remaining > 0) {
    const take = Math.min(k, remaining)
    sizes.push(take)
    remaining -= take
    k += 1
  }
  return sizes
}

/** Body-only row groups (front to back) for a given formation kind — the leader (if any) is
 *  inserted separately by `formationRows` so every shape gets the same "attach the leader"
 *  treatment without duplicating it per-kind. */
function bodyRowGroups(models: Model[], kind: Exclude<FormationKind, 'keep'>): Model[][] {
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
    case 'arrowhead':
      return sliceByRowSizes(models, arrowheadRowSizes(n))
  }
}

/** Row groups including the attached leader, front to back — centre-rear for every shape (an extra
 *  row appended at the very back), except arrowhead, where "centre-rear" means directly behind the
 *  point: a leader row inserted right after the tip so it rides in the heart of the wedge. */
function formationRows(bodyModels: Model[], leaderModels: Model[], kind: Exclude<FormationKind, 'keep'>): Model[][] {
  const rows = bodyRowGroups(bodyModels, kind)
  if (leaderModels.length === 0) return rows
  if (kind === 'arrowhead') {
    rows.splice(1, 0, leaderModels)
  } else {
    rows.push(leaderModels)
  }
  return rows
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
