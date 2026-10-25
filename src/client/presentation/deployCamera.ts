// Deployment camera, pure parts (no three.js, no stores): which events make the camera visit a unit the bot puts on the
// board, and where it comes back to. The director feeds it events and the camera API does the flying.
//  - the human's own deployment: remember the view they had (the place to come back to)
//  - a bot unit set up on the board (UnitDeployed, not into reserves): fly to it, hold, fly back
//  - a bot unit arriving from reserves later (ReinforcementsArrived: deep strike and the rest): the same
//  - units put into reserves are not visited; hot-seat (no bot seat) and instant speed never move the camera
import type { GameEvent, PlayerId } from '@/engine'
import type { CameraView } from '../board/cameraApi'
import { clusterOf, discInFrame, fitDistance, withinLimits, type Pt } from './framing'

/** Base durations (ms at normal speed); the director multiplies by speedFactor. */
export const DEPLOY_FLY_MS = 550
export const DEPLOY_HOLD_MS = 900
/** Nearest the camera comes to a unit it is visiting (inches). */
export const DEPLOY_MIN_DISTANCE = 14
export const DEPLOY_MAX_DISTANCE = 36
/** Furthest a visit backs off to get a wide or steeply viewed unit wholly in frame. */
export const DEPLOY_FIT_MAX_DISTANCE = 70
/** Two visits this close in one batch are one unit group arriving together (a leader and its bodyguard). */
const SAME_SPOT = 2.5

export interface DeployCameraCtx {
  humanSeat: PlayerId
  /** the seat a bot plays; null in hot-seat */
  botSeat: PlayerId | null
  /** speedFactor of the animation setting; 0 = instant */
  factor: number
  /** where a unit's models stand now, with their base radii (empty when it is not on the board) */
  footprint(unitId: string): Pt[]
}

export type DeployBeat =
  | { kind: 'record' }
  | { kind: 'visit'; x: number; z: number; radius: number; /** arrived from reserves rather than set up */ arrival: boolean; /** the unit, and any that stand with it (one trip) */ unitIds: string[] }

/** The deployment beats of one batch, by event index. Empty unless a bot opponent is playing and speed is not instant. */
export function deployBeats(events: readonly GameEvent[], ctx: DeployCameraCtx): { index: number; beat: DeployBeat }[] {
  const out: { index: number; beat: DeployBeat }[] = []
  if (ctx.botSeat === null || ctx.factor <= 0) return out
  events.forEach((ev, index) => {
    if (ev.type !== 'UnitDeployed' && ev.type !== 'ReinforcementsArrived') return
    if (ev.type === 'UnitDeployed' && ev.toReserves) return // into reserves: nothing to see
    const isArrival = ev.type === 'ReinforcementsArrived'
    if (ev.player === ctx.humanSeat) {
      if (!isArrival) out.push({ index, beat: { kind: 'record' } })
      return
    }
    if (ev.player !== ctx.botSeat) return
    const c = clusterOf(ctx.footprint(ev.unitId))
    if (!c) return
    const twin = out.find((o) => o.beat.kind === 'visit' && Math.hypot(o.beat.x - c.x, o.beat.z - c.z) < SAME_SPOT)
    if (twin) {
      if (twin.beat.kind === 'visit') twin.beat.unitIds.push(ev.unitId)
      return
    }
    out.push({ index, beat: { kind: 'visit', x: c.x, z: c.z, radius: c.radius, arrival: isArrival, unitIds: [ev.unitId] } })
  })
  return out
}

/**
 * When the pending visits of a batch play, after the event at `index`:
 *  - 'step': the step ends here (the cursor may reach its seq, and the visit shows the step's result as the camera arrives)
 *  - 'now': more events of the same step follow that are not deployment (the first-turn roll-off, the phase banner...):
 *    the visit plays before them, with the visited units shown ahead of the cursor, so the camera is back before they start
 *  - 'wait': the next event is another deployment of the same step; the visits are gathered into one trip
 */
export function visitFlush(events: readonly Pick<GameEvent, 'type' | 'seq'>[], index: number): 'step' | 'now' | 'wait' {
  const next = events[index + 1]
  if (!next || next.seq !== events[index]!.seq) return 'step'
  return next.type === 'UnitDeployed' || next.type === 'ReinforcementsArrived' ? 'wait' : 'now'
}

export function deployTimes(factor: number): { fly: number; hold: number } {
  return { fly: Math.round(DEPLOY_FLY_MS * factor), hold: Math.round(DEPLOY_HOLD_MS * factor) }
}

/**
 * A view of a visited unit from the camera's current azimuth and tilt, close enough to see the unit's spread.
 * Keeps the player's own angle so the trip feels like a zoom, not a cut to somewhere else.
 */
export function visitView(current: CameraView, visit: { x: number; z: number; radius: number }, aspect: number): CameraView {
  const dx = current.position[0] - current.target[0]
  const dy = Math.max(current.position[1] - current.target[1], 1)
  const dz = current.position[2] - current.target[2]
  const l = Math.hypot(dx, dy, dz)
  const base = Math.min(DEPLOY_MAX_DISTANCE, Math.max(DEPLOY_MIN_DISTANCE, fitDistance(visit.radius + 1.5, aspect) + 6))
  const at = (dist: number): CameraView => {
    const k = dist / l
    return withinLimits({ position: [visit.x + dx * k, dy * k, visit.z + dz * k], target: [visit.x, 0, visit.z] })
  }
  // fitDistance only looks at the width; a wide unit seen from a steep angle can still run off the bottom of the screen, so back off until it is all in
  let dist = base
  let view = at(dist)
  while (dist < DEPLOY_FIT_MAX_DISTANCE && !discInFrame(view, visit.x, visit.z, visit.radius + 0.5, aspect)) {
    dist = Math.min(DEPLOY_FIT_MAX_DISTANCE, dist * 1.1)
    view = at(dist)
  }
  return view
}

/** The view to come back to: the player's view at their last deployment, else their deployment-zone view, else wherever the camera was. */
export function returnView<V>(lastPlayerView: V | null, zoneView: V | null, before: V): V {
  return lastPlayerView ?? zoneView ?? before
}
