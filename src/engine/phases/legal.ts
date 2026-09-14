// Shared helpers for phase modules' `legalActions` (W1-G). Continuous decisions (moves, charges, pile-ins, target
// declarations) have no finite option list; each phase module offers a small set of heuristic candidate answers,
// filtered through its own `validate`, so a generic Decider (random bot, AI, autoplay) always has >=1 legal action.
import type { Action, ModelPlacement } from '../actions'
import type { Model, PendingDecision, Rejection, Vec3 } from '../types'
import { basesOverlap, coherencyGroups, coherencyNeighboursNeeded, inCoherencyRange, isCoherent, type Footprint } from '../geometry'

// same as the reducer's default: options[].action (+ pass when canPass) for finite decisions, null otherwise
export function optionActions(pending: PendingDecision): Action[] | null {
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  const out: Action[] = pending.options.map((o) => ({ ...o.action, player: pending.player, decisionId: pending.id }) as Action)
  if (pending.canPass) out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
  return out
}

export function passAction(pending: PendingDecision): Action {
  return { type: 'pass', player: pending.player, decisionId: pending.id }
}

// rigid translation of every model by (dx, dz) with a straight-line path
export function translatePlacements(models: Model[], dx: number, dz: number): ModelPlacement[] {
  return models.map((m) => {
    const to: Vec3 = { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz }
    return { modelId: m.id, pos: to, facing: m.facing, path: [m.pos, to] }
  })
}

// regroup: a compact square block centred on `center` (greedy nearest-model slot assignment); null when some model
// would need more than its allowance. Used when a unit starts out of coherency (casualties mid-turn), where no rigid
// translation can end coherent.
export function formationPlacements(models: Model[], center: { x: number; z: number }, allowance: (m: Model) => number): ModelPlacement[] | null {
  if (models.length === 0) return []
  const rad = Math.max(...models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const spacing = 2 * rad + 0.2
  const cols = Math.ceil(Math.sqrt(models.length))
  const rows = Math.ceil(models.length / cols)
  const slots = models.map((_, i) => ({ x: center.x + ((i % cols) - (cols - 1) / 2) * spacing, z: center.z + (Math.floor(i / cols) - (rows - 1) / 2) * spacing }))
  const free = [...models]
  const out: ModelPlacement[] = []
  for (const slot of slots) {
    free.sort((a, b) => Math.hypot(a.pos.x - slot.x, a.pos.z - slot.z) - Math.hypot(b.pos.x - slot.x, b.pos.z - slot.z))
    const m = free.shift() as Model
    const to: Vec3 = { x: slot.x, y: m.pos.y, z: slot.z }
    if (Math.hypot(to.x - m.pos.x, to.z - m.pos.z) > allowance(m)) return null
    out.push({ modelId: m.id, pos: to, facing: m.facing, path: [m.pos, to] })
  }
  return out
}

export interface RepairOptions {
  // max 2D travel from the model's current (pre-move) position
  allowance: (m: Model) => number
  // bases a repaired model may not overlap (other friendly units + enemy models)
  blockers: Footprint[]
  // extra per-model legality for the new end point (closer-to-target, outside ER, …)
  ok?: (m: Model, to: Vec3) => boolean
}

// coherency repair for a planned arrangement (or a unit left split by mid-turn casualties): repeatedly moves one model
// that is outside the largest coherency group, or short of neighbours, to a free slot beside a main-group model with
// enough neighbours there. Models not repaired keep their original placement (and path). Returns the full placement
// list; the caller's validate() still decides legality.
export function repairCoherency(models: Model[], placements: ModelPlacement[], opts: RepairOptions): ModelPlacement[] {
  const original = new Map(placements.map((p) => [p.modelId, p]))
  const pos = new Map<string, Vec3>(models.map((m) => [m.id, original.get(m.id)?.pos ?? m.pos]))
  const repaired = new Set<string>()
  const fp = (m: Model, at?: Vec3): Footprint => ({ pos: at ?? (pos.get(m.id) as Vec3), facing: m.facing, base: m.base })
  const needed = Math.min(coherencyNeighboursNeeded(models.length), Math.max(models.length - 1, 0))
  const bigR = (b: Footprint['base']): number => Math.max(b.radius, b.radius2 ?? 0)
  for (let iter = 0; iter < models.length * 2; iter++) {
    const finals = models.map((m) => fp(m))
    if (models.length < 2 || isCoherent(finals)) break
    const main = new Set([...coherencyGroups(finals)].sort((a, b) => b.length - a.length)[0] ?? [])
    const neighbours = (i: number, at: Footprint): number => finals.reduce((n, o, j) => n + (j !== i && inCoherencyRange(at, o) ? 1 : 0), 0)
    const stray = models.map((_, i) => i).filter((i) => !main.has(i) || neighbours(i, finals[i]) < needed)
    let progressed = false
    for (const i of stray) {
      const m = models[i]
      let best: { to: Vec3; travel: number } | null = null
      for (const j of main) {
        if (j === i) continue
        const a = finals[j]
        for (const extra of [0.25, 0.7, 1.2]) for (let k = 0; k < 24; k++) {
          const r = bigR(a.base) + bigR(m.base) + extra
          const ang = (2 * Math.PI * k) / 24
          const to: Vec3 = { x: a.pos.x + Math.cos(ang) * r, y: m.pos.y, z: a.pos.z + Math.sin(ang) * r }
          const travel = Math.hypot(to.x - m.pos.x, to.z - m.pos.z)
          if (travel > opts.allowance(m) || (best && travel >= best.travel)) continue
          const f = fp(m, to)
          if (finals.some((o, oi) => oi !== i && basesOverlap(f, o)) || opts.blockers.some((b) => basesOverlap(f, b))) continue
          if (neighbours(i, f) < needed) continue
          if (opts.ok && !opts.ok(m, to)) continue
          best = { to, travel }
        }
      }
      if (best) { pos.set(m.id, best.to); repaired.add(m.id); progressed = true; break }
    }
    if (!progressed) break
  }
  const out: ModelPlacement[] = []
  for (const m of models) {
    if (repaired.has(m.id)) { const to = pos.get(m.id) as Vec3; out.push({ modelId: m.id, pos: to, facing: m.facing, path: [m.pos, to] }) }
    else if (original.has(m.id)) out.push(original.get(m.id) as ModelPlacement)
  }
  return out
}

export function centroid(models: { pos: Vec3 }[]): { x: number; z: number } {
  const n = Math.max(models.length, 1)
  return { x: models.reduce((a, m) => a + m.pos.x, 0) / n, z: models.reduce((a, m) => a + m.pos.z, 0) / n }
}

export function unitVector(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } | null {
  const dx = to.x - from.x, dz = to.z - from.z
  const d = Math.hypot(dx, dz)
  return d > 1e-6 ? { x: dx / d, z: dz / d } : null
}

// keeps the first `limit` candidates that validate, de-duplicated by their JSON form
export function filterValid(candidates: Action[], validate: (a: Action) => Rejection | null, limit = 8): Action[] {
  const out: Action[] = []
  const seen = new Set<string>()
  for (const a of candidates) {
    if (out.length >= limit) break
    const key = JSON.stringify(a)
    if (seen.has(key)) continue
    seen.add(key)
    if (validate(a) === null) out.push(a)
  }
  return out
}
