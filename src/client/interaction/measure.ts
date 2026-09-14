// Client-only geometry for the Measure tool (M2 battlefield gap): resolves a drag's raw start/cursor
// points into the actual line to draw. On a tabletop you touch your model's base and drag the tape
// to the enemy you want to check range to, reading edge-to-edge — this mirrors that: starting the
// drag on a model and hovering an enemy model snaps to base-edge-to-base-edge; anything else is a
// plain point-to-point ruler. Pure math, no dispatch — read-only against GameState.
import type { GameState, Model, PlayerId } from '@/engine'
import type { Vec2 } from '../ui/uiStore'

/** How far (inches, beyond a model's own base) the cursor still snaps to it — lets you land near a
 *  model without having to hit its exact centre. */
const SNAP_MARGIN_IN = 1.5

function baseRadiusOf(m: Model): number {
  return Math.max(m.base.radius, m.base.radius2 ?? m.base.radius)
}

function allBoardModels(state: GameState): Model[] {
  const out: Model[] = []
  for (const unit of Object.values(state.units)) {
    if (unit.location !== 'board') continue
    for (const modelId of unit.models) {
      const m = state.models[modelId]
      if (m) out.push(m)
    }
  }
  return out
}

function otherSide(player: PlayerId): PlayerId {
  return player === 'A' ? 'B' : 'A'
}

/** Nearest on-board model to `point` (optionally restricted to one side) within its own base radius
 *  plus a small snap margin, or null if nothing is close enough. */
export function modelNear(state: GameState, point: Vec2, opts: { side?: PlayerId } = {}): Model | null {
  let best: Model | null = null
  let bestDist = Infinity
  for (const m of allBoardModels(state)) {
    if (opts.side && state.units[m.unitId]?.player !== opts.side) continue
    const d = Math.hypot(point.x - m.pos.x, point.z - m.pos.z)
    if (d <= baseRadiusOf(m) + SNAP_MARGIN_IN && d < bestDist) {
      best = m
      bestDist = d
    }
  }
  return best
}

/** Point on the segment from `from` toward `toward`, offset `radius` inches from `from` — a model's
 *  base edge facing the other point. Clamped so it never overshoots `toward` itself. */
function edgePointToward(from: Vec2, toward: Vec2, radius: number): Vec2 {
  const dx = toward.x - from.x
  const dz = toward.z - from.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return { x: from.x, z: from.z }
  const t = Math.min(radius, len) / len
  return { x: from.x + dx * t, z: from.z + dz * t }
}

export interface MeasureLine {
  a: Vec2
  b: Vec2
}

/**
 * Resolves a Measure-tool drag into the line to draw:
 *  - starts on a model, cursor over an enemy model's base -> base edge to base edge
 *  - starts on a model, cursor over open board -> that model's near edge to the raw cursor point
 *  - starts on open board -> raw start point to raw cursor point
 */
export function resolveMeasureLine(state: GameState, start: Vec2, cursor: Vec2): MeasureLine {
  const fromModel = modelNear(state, start)
  if (!fromModel) return { a: start, b: cursor }

  const fromSide = state.units[fromModel.unitId]?.player
  const fromPos: Vec2 = { x: fromModel.pos.x, z: fromModel.pos.z }
  const toModel = fromSide ? modelNear(state, cursor, { side: otherSide(fromSide) }) : null
  if (toModel) {
    const toPos: Vec2 = { x: toModel.pos.x, z: toModel.pos.z }
    return {
      a: edgePointToward(fromPos, toPos, baseRadiusOf(fromModel)),
      b: edgePointToward(toPos, fromPos, baseRadiusOf(toModel)),
    }
  }
  return { a: edgePointToward(fromPos, cursor, baseRadiusOf(fromModel)), b: cursor }
}
