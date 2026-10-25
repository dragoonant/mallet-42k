// Cinematic shooting camera (src/client/presentation/shotCamera.ts): the shoulder view behind the whole firing unit,
// the close-up on a target unit, the terrain check, and which cases skip the camera entirely.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine'
import { MIN_CAMERA_DISTANCE } from '../../src/client/board/cameraPresets'
import { clusterOf, MAX_POLAR, type Cluster, type Pt } from '../../src/client/presentation/framing'
import {
  cinematicOn, closeupView, closingBeat, damagedUnitOf, MAX_RAISE, shoulderView, shoulderViewClear, shotTimes, speedFactor, type SolidPiece,
} from '../../src/client/presentation/shotCamera'

const ASPECT = 1.7
const pt = (x: number, z: number, radius = 0.6): Pt => ({ x, y: 0, z, radius })
const cluster = (pts: Pt[]): Cluster => clusterOf(pts)!
const dist3 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
const polarOf = (v: { position: number[]; target: number[] }) =>
  Math.atan2(Math.hypot(v.position[0]! - v.target[0]!, v.position[2]! - v.target[2]!), v.position[1]! - v.target[1]!)

/** A squad of `n` models in a loose ring of radius `r` around (0, 0). */
const squad = (n: number, r: number): Pt[] => Array.from({ length: n }, (_, i) => pt(r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)))
const enemy = cluster([pt(0, 20), pt(2, 21), pt(-2, 22), pt(1, 19)])

describe('shot camera views', () => {
  it('SHOTCAM-001 the shoulder view sits behind the whole firing unit, opposite the target unit, above the models', () => {
    const shooters = cluster(squad(5, 2.5))
    const v = shoulderView(shooters, enemy, ASPECT)
    // the target is +z of the squad, so the lens is behind (-z of) every model, not just the centre
    for (const m of squad(5, 2.5)) expect(v.position[2]).toBeLessThan(m.z - 1)
    expect(v.position[1]).toBeGreaterThan(3)
    // it looks at the target unit's centre, on the ground (where the orbit rig keeps its target)
    expect(v.target[0]).toBeCloseTo(enemy.x, 6)
    expect(v.target[1]).toBe(0)
    expect(v.target[2]).toBeCloseTo(enemy.z, 6)
    // the squad is in front of the lens: the way the lens looks and the way it sees the squad centre nearly agree
    const look = [v.target[0] - v.position[0], v.target[2] - v.position[2]]
    const toSquad = [shooters.x - v.position[0], shooters.z - v.position[2]]
    const cos = (look[0]! * toSquad[0]! + look[1]! * toSquad[1]!) / (Math.hypot(...look) * Math.hypot(...toSquad))
    expect(cos).toBeGreaterThan(0.95)
    // a diagonal shot keeps the lens behind the squad too
    const diag = shoulderView(shooters, cluster([pt(15, 15)]), ASPECT)
    expect((diag.position[0] - shooters.x) * 15 + (diag.position[2] - shooters.z) * 15).toBeLessThan(0)
    // the other shoulder is on the opposite side at the same height and distance back
    const other = shoulderView(shooters, enemy, ASPECT, { side: -1 })
    expect(Math.abs(other.position[0] - v.position[0])).toBeGreaterThan(2)
    expect(other.position[1]).toBeCloseTo(v.position[1], 6)
  })

  it('SHOTCAM-002 the framing pulls back and up as the firing unit spreads, and always obeys the orbit limits', () => {
    const tight = cluster(squad(1, 0))
    const wide = cluster(squad(10, 5))
    const a = shoulderView(tight, enemy, ASPECT)
    const b = shoulderView(wide, enemy, ASPECT)
    const behind = (v: { position: number[] }, s: Cluster) => s.z - v.position[2]
    expect(behind(b, wide)).toBeGreaterThan(behind(a, tight) + 5)
    expect(b.position[1]).toBeGreaterThan(a.position[1] + 2)
    // even with the target 5" away the lens stays a legal camera distance from its orbit target, and not flatter than the rig allows
    const near = cluster([pt(0, 5)])
    for (const s of [tight, wide]) {
      const v = shoulderView(s, near, ASPECT)
      expect(dist3(v.position, v.target)).toBeGreaterThan(MIN_CAMERA_DISTANCE)
      expect(polarOf(v)).toBeLessThan(MAX_POLAR + 1e-6)
    }
  })

  it('SHOTCAM-003 the close-up frames the target unit from the shooters side, and fits a bigger unit further out', () => {
    const shooters = cluster(squad(5, 2.5))
    const small = cluster([pt(0, 20)])
    const big = cluster(squad(10, 6).map((p) => ({ ...p, z: p.z + 20 })))
    const a = closeupView(shooters, small, ASPECT)
    const b = closeupView(shooters, big, ASPECT)
    expect(a.target).toEqual([small.x, 0, small.z])
    expect(b.target[0]).toBeCloseTo(big.x, 6)
    expect(b.target[2]).toBeCloseTo(big.z, 6)
    // on the shooters' side of the target (they are at z = 0, the target at z = 20), looking down
    expect(a.position[2]).toBeLessThan(small.z)
    expect(polarOf(a)).toBeLessThan((60 * Math.PI) / 180)
    expect(dist3(b.position, b.target)).toBeGreaterThan(dist3(a.position, a.target))
    expect(dist3(a.position, a.target)).toBeGreaterThan(MIN_CAMERA_DISTANCE)
  })

  it('SHOTCAM-004 terrain: the other shoulder clears a wall, a raised lens clears two, and the raise is capped', () => {
    const shooters = cluster(squad(3, 1.5))
    const right = shoulderView(shooters, enemy, ASPECT)
    const left = shoulderView(shooters, enemy, ASPECT, { side: -1 })
    const ruin = (x0: number, x1: number, height = 5): SolidPiece => ({
      kind: 'ruin',
      height,
      footprint: [{ x: x0, z: -30 }, { x: x1, z: -30 }, { x: x1, z: 3 }, { x: x0, z: 3 }],
    })
    // a ruin on the right-hand lens only: the left shoulder is picked
    const onRight = [ruin(right.position[0] - 0.5, right.position[0] + 0.5)]
    expect(shoulderViewClear(onRight, shooters, enemy, ASPECT).position[0]).toBeCloseTo(left.position[0], 6)
    // a ruin across both shoulders: the lens rises above its top
    const both = [ruin(-6, 6)]
    expect(right.position[1]).toBeLessThan(5)
    expect(shoulderViewClear(both, shooters, enemy, ASPECT).position[1]).toBeGreaterThan(5)
    // craters and barricades never block; a clear lens is untouched
    expect(shoulderViewClear([{ ...ruin(-6, 6), kind: 'crater' }], shooters, enemy, ASPECT)).toEqual(right)
    expect(shoulderViewClear([], shooters, enemy, ASPECT)).toEqual(right)
    // a tower far taller than any sensible lift: the raise stops at the cap
    const tower = [ruin(-6, 6, 60)]
    expect(shoulderViewClear(tower, shooters, enemy, ASPECT).position[1]).toBeLessThan(right.position[1] + MAX_RAISE + 0.01)
  })

  it('SHOTCAM-005 only a landing that gets through earns a close-up; a volley with none holds the shoulder view', () => {
    const ev = (o: Record<string, unknown>) => o as unknown as GameEvent
    expect(damagedUnitOf([ev({ type: 'SaveRolled', saved: true })])).toBeNull()
    expect(damagedUnitOf([ev({ type: 'SaveRolled', saved: false }), ev({ type: 'DamageApplied', unitId: 'U7' })])).toBe('U7')
    expect(damagedUnitOf([ev({ type: 'ModelDestroyed', unitId: 'U9' })])).toBe('U9')
    expect(closingBeat(0)).toBe('shoulder-hold')
    expect(closingBeat(2)).toBe('closeup-hold')
  })

  it('SHOTCAM-006 switched off, instant speed, no camera or hot-seat: the camera is never touched', () => {
    expect(cinematicOn(true, 1, true, true)).toBe(true)
    expect(cinematicOn(false, 1, true, true)).toBe(false)
    expect(cinematicOn(true, speedFactor('instant'), true, true)).toBe(false)
    expect(cinematicOn(true, 1, false, true)).toBe(false)
    expect(cinematicOn(true, 1, true, false)).toBe(false)
    expect(speedFactor('normal')).toBe(1)
    expect(speedFactor('fast')).toBeLessThan(1)
    expect(shotTimes(0).shoulder).toBe(0)
    expect(shotTimes(1).closeup).toBeGreaterThan(shotTimes(0.35).closeup)
  })
})
