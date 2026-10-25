// Cinematic shooting camera, pure parts (no three.js, no stores). The director feeds it unit positions and the camera
// API does the flying.
//  - shoulder view: behind the WHOLE firing unit, on the far side from the target unit, pulled back and up by how far
//    the unit spreads so the squad and the target both fit in frame; the lens leans a little to one side
//  - close-up: framed to one target unit's spread, from the shooter's side, looking down
//  - terrain: if the lens would sit inside a ruin or crate, try the other shoulder, then lift it (capped)
//  - a volley that gets nothing through just holds the shoulder view for a short beat
import type { GameEvent } from '@/engine'
import type { CameraView } from '../board/cameraApi'
import { fitDistance, insidePolygon, unit2, withinLimits, type Cluster } from './framing'

/** Base durations (ms at normal speed); the director multiplies by speedFactor. */
export const SHOT_SHOULDER_FLY_MS = 650
export const SHOT_CLOSEUP_FLY_MS = 380
export const SHOT_RETURN_FLY_MS = 650
/** Stay on a target this long before the camera moves on to the next one. */
export const SHOT_CLOSEUP_DWELL_MS = 450
/** Extra hold on the last target after the volley's last landing, so the wounds and falls can be read. */
export const SHOT_CLOSEUP_HOLD_MS = 800
/** Hold on the shoulder view when nothing got through (no close-up). */
export const SHOT_NO_HIT_BEAT_MS = 500

/** Shoulder view: how far behind the unit the lens sits (inches) = base + this much per inch of fit distance. */
export const SHOULDER_BACK_BASE = 3
export const SHOULDER_BACK_FIT = 1.5
export const SHOULDER_BACK_MAX = 24
/** Sideways lean of the lens (inches): base + a quarter of the unit's spread. */
export const SHOULDER_SIDE_BASE = 1.2
/** Lens height above the unit's footing (inches): base + most of the unit's spread. */
export const SHOULDER_HEIGHT_BASE = 3
export const SHOULDER_HEIGHT_PER_RADIUS = 0.8
/** Close-up: nearest and furthest the lens sits from the target unit's centre (inches, straight line). */
export const CLOSEUP_MIN = 9
export const CLOSEUP_MAX = 34
export const CLOSEUP_PITCH = (38 * Math.PI) / 180
/** The close-up sits this far round from the shooter-target line so the shooters are not in front of the lens (radians). */
export const CLOSEUP_SWING = 0.55
/** The most the lens is lifted to clear terrain (inches). */
export const MAX_RAISE = 6

/** How much of its normal length a timed camera beat plays at: 1 at normal speed, 0.35 at fast (the director's own factor), 0 at instant (skipped). */
export function speedFactor(speed: 'normal' | 'fast' | 'instant'): number {
  return speed === 'instant' ? 0 : speed === 'fast' ? 0.35 : 1
}

export interface ViewOpts {
  /** which shoulder (+1 right, -1 left, looking along the shot) */
  side?: 1 | -1
  /** extra lens height (inches), to clear terrain */
  raise?: number
}

/** Over the shoulder of the whole firing unit, looking at the target unit's centre. */
export function shoulderView(shooters: Cluster, targets: Cluster, aspect: number, opts: ViewOpts = {}): CameraView {
  const side = opts.side ?? 1
  const [ux, uz] = unit2(shooters.x, shooters.z, targets.x, targets.z)
  const rx = -uz
  const rz = ux
  const back = Math.min(SHOULDER_BACK_MAX, SHOULDER_BACK_BASE + SHOULDER_BACK_FIT * fitDistance(shooters.radius, aspect))
  const lean = side * (SHOULDER_SIDE_BASE + 0.25 * shooters.radius)
  const height = shooters.y + SHOULDER_HEIGHT_BASE + SHOULDER_HEIGHT_PER_RADIUS * shooters.radius + (opts.raise ?? 0)
  return withinLimits({
    position: [shooters.x - ux * back + rx * lean, height, shooters.z - uz * back + rz * lean],
    target: [targets.x, 0, targets.z],
  })
}

/** Close-up on one target unit, from the shooters' side, swung a little round and well above, framed to its spread. */
export function closeupView(shooters: Cluster, target: Cluster, aspect: number, opts: ViewOpts = {}): CameraView {
  const side = opts.side ?? 1
  const [bx, bz] = unit2(target.x, target.z, shooters.x, shooters.z)
  const a = CLOSEUP_SWING * side
  const dx = bx * Math.cos(a) - bz * Math.sin(a)
  const dz = bx * Math.sin(a) + bz * Math.cos(a)
  const dist = Math.min(CLOSEUP_MAX, Math.max(CLOSEUP_MIN, fitDistance(target.radius + 0.8, aspect) + 5))
  const flat = dist * Math.cos(CLOSEUP_PITCH)
  return withinLimits({
    position: [target.x + dx * flat, target.y + dist * Math.sin(CLOSEUP_PITCH) + (opts.raise ?? 0), target.z + dz * flat],
    target: [target.x, 0, target.z],
  })
}

// ---------------------------------------------------------------- terrain

/** The part of a terrain piece the lens can be walled in by. */
export interface SolidPiece {
  kind: string
  height: number
  footprint: readonly { x: number; z: number }[]
}

/** Low or open terrain the lens can sit in without anything in the way. */
const NOT_SOLID = new Set(['crater', 'barricade'])
const MIN_SOLID_HEIGHT = 2

/** Top of the highest solid piece the point (x, y, z) is inside, or null when it is in the clear. */
function solidTopAt(pieces: readonly SolidPiece[], x: number, y: number, z: number): number | null {
  let top: number | null = null
  for (const p of pieces) {
    if (NOT_SOLID.has(p.kind) || p.height < MIN_SOLID_HEIGHT || y >= p.height) continue
    if (insidePolygon(x, z, p.footprint) && (top === null || p.height > top)) top = p.height
  }
  return top
}

/** How high the lens must rise to clear the terrain it sits in (or that is on the way to `anchor`); 0 when it is in the clear. */
export function lensBlockedTop(pieces: readonly SolidPiece[], view: CameraView, anchor: readonly [number, number, number]): number {
  const [px, py, pz] = view.position
  let top = 0
  for (const t of [0, 0.25, 0.5]) {
    const hit = solidTopAt(pieces, px + (anchor[0] - px) * t, py + (anchor[1] - py) * t, pz + (anchor[2] - pz) * t)
    if (hit !== null) top = Math.max(top, hit)
  }
  return top
}

/**
 * The first of: the right shoulder, the left shoulder, the right shoulder lifted above whatever the lens is inside
 * (capped at MAX_RAISE). `anchor` is the thing the lens must not be walled off from.
 */
export function clearView(pieces: readonly SolidPiece[], make: (o: ViewOpts) => CameraView, anchor: readonly [number, number, number]): CameraView {
  const right = make({ side: 1 })
  if (lensBlockedTop(pieces, right, anchor) === 0) return right
  const left = make({ side: -1 })
  if (lensBlockedTop(pieces, left, anchor) === 0) return left
  const top = lensBlockedTop(pieces, right, anchor)
  return make({ side: 1, raise: Math.min(MAX_RAISE, Math.max(0, top + 0.3 - right.position[1])) })
}

export function shoulderViewClear(pieces: readonly SolidPiece[], shooters: Cluster, targets: Cluster, aspect: number): CameraView {
  return clearView(pieces, (o) => shoulderView(shooters, targets, aspect, o), [shooters.x, shooters.y + 1, shooters.z])
}

export function closeupViewClear(pieces: readonly SolidPiece[], shooters: Cluster, target: Cluster, aspect: number): CameraView {
  return clearView(pieces, (o) => closeupView(shooters, target, aspect, o), [target.x, target.y + 0.8, target.z])
}

// ---------------------------------------------------------------- what earns a close-up

/**
 * The unit a landing hurts, or null when nothing got through (a save shimmer or a miss earns no close-up).
 * A landing is the held events one shot plays when it arrives (director.ts landingsOf).
 */
export function damagedUnitOf(events: readonly GameEvent[]): string | null {
  for (const e of events) if (e.type === 'DamageApplied' || e.type === 'ModelDestroyed') return e.unitId
  return null
}

/** The closing beat of a volley: stay on the last target when one was hit, else a short hold on the shoulder view. */
export function closingBeat(closeupsSeen: number): 'closeup-hold' | 'shoulder-hold' {
  return closeupsSeen > 0 ? 'closeup-hold' : 'shoulder-hold'
}

/**
 * The cinematic runs at all: switched on, not instant speed (factor 0), a camera exists, and a bot opponent is playing
 * (hot-seat players pass the device, so the camera stays where they put it).
 */
export function cinematicOn(enabled: boolean, factor: number, hasCamera: boolean, versusBot: boolean): boolean {
  return enabled && factor > 0 && hasCamera && versusBot
}

export interface ShotTimes {
  shoulder: number
  closeup: number
  back: number
  dwell: number
  hold: number
  beat: number
}

export function shotTimes(factor: number): ShotTimes {
  const s = (ms: number) => Math.round(ms * factor)
  return {
    shoulder: s(SHOT_SHOULDER_FLY_MS),
    closeup: s(SHOT_CLOSEUP_FLY_MS),
    back: s(SHOT_RETURN_FLY_MS),
    dwell: s(SHOT_CLOSEUP_DWELL_MS),
    hold: s(SHOT_CLOSEUP_HOLD_MS),
    beat: s(SHOT_NO_HIT_BEAT_MS),
  }
}
