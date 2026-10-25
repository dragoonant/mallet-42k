// Deployment camera (src/client/presentation/deployCamera.ts): which events make the camera visit a bot unit, and where
// it comes back to.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine'
import { MIN_CAMERA_DISTANCE } from '../../src/client/board/cameraPresets'
import type { Pt } from '../../src/client/presentation/framing'
import { groundNdc as ndc } from '../../src/client/presentation/framing'
import { deployBeats, DEPLOY_FIT_MAX_DISTANCE, returnView, visitFlush, visitView, type DeployCameraCtx } from '../../src/client/presentation/deployCamera'

const pt = (x: number, z: number, radius = 0.6): Pt => ({ x, y: 0, z, radius })
const deployed = (player: 'A' | 'B', unitId: string, toReserves = false) => ({ type: 'UnitDeployed', player, unitId, toReserves }) as unknown as GameEvent
const arrived = (player: 'A' | 'B', unitId: string) => ({ type: 'ReinforcementsArrived', player, unitId, via: 'deepStrike' }) as unknown as GameEvent
const spots: Record<string, Pt[]> = {
  squad: [pt(10, -8), pt(12, -8), pt(11, -10), pt(13, -10)],
  twin: [pt(11, -9)],
  mine: [pt(-5, 9)],
}
const ctx: DeployCameraCtx = { humanSeat: 'A', botSeat: 'B', factor: 1, footprint: (id) => spots[id] ?? [] }

describe('deployment camera', () => {
  it('DEPLOYCAM-001 a bot unit set up on the board is a visit framed to its models; the human own set-up only records their view', () => {
    const beats = deployBeats([deployed('B', 'squad'), deployed('A', 'mine')], ctx)
    expect(beats).toHaveLength(2)
    const visit = beats[0]!.beat
    expect(beats[0]!.index).toBe(0)
    expect(visit.kind).toBe('visit')
    if (visit.kind !== 'visit') return
    expect(visit.x).toBeCloseTo(11.5, 6)
    expect(visit.z).toBeCloseTo(-9, 6)
    expect(visit.radius).toBeGreaterThan(1.5) // the spread of the models, not one base
    expect(visit.arrival).toBe(false)
    expect(beats[1]).toEqual({ index: 1, beat: { kind: 'record' } })
  })

  it('DEPLOYCAM-002 units put into reserves get no visit; a bot unit arriving from reserves later does', () => {
    expect(deployBeats([deployed('B', 'squad', true), deployed('A', 'mine', true)], ctx)).toEqual([])
    const later = deployBeats([arrived('B', 'squad'), arrived('A', 'mine')], ctx)
    expect(later).toHaveLength(1)
    const beat = later[0]!.beat
    expect(beat.kind === 'visit' && beat.arrival).toBe(true)
    // a unit that is not on the board has nothing to look at
    expect(deployBeats([deployed('B', 'nowhere')], ctx)).toEqual([])
    // a leader and its bodyguard set up together are one trip, not two
    expect(deployBeats([deployed('B', 'squad'), deployed('B', 'twin')], ctx)).toHaveLength(1)
  })

  it('DEPLOYCAM-003 hot-seat, instant speed and non-bot events never move the camera', () => {
    const events = [deployed('B', 'squad'), deployed('A', 'mine')]
    expect(deployBeats(events, { ...ctx, botSeat: null })).toEqual([])
    expect(deployBeats(events, { ...ctx, factor: 0 })).toEqual([])
    expect(deployBeats([{ type: 'PhaseStarted', player: 'B' } as unknown as GameEvent], ctx)).toEqual([])
  })

  it('DEPLOYCAM-004 the way back is the last deployment view, else the deployment-zone view, else where the camera was', () => {
    const last = { position: [1, 20, 20], target: [1, 0, 8] }
    const zone = { position: [0, 25, 26], target: [0, 0, 8] }
    const before = { position: [0, 25, 21], target: [0, 0, 1] }
    expect(returnView(last, zone, before)).toBe(last)
    expect(returnView(null, zone, before)).toBe(zone)
    expect(returnView(null, null, before)).toBe(before)
  })

  it('DEPLOYCAM-005 a visit keeps the player angle, looks at the unit and fits a bigger unit further out within the limits', () => {
    const now = { position: [0, 28, 23.8] as [number, number, number], target: [0, 0, 1.2] as [number, number, number] }
    const small = visitView(now, { x: 11, z: -9, radius: 1 }, 1.7)
    const big = visitView(now, { x: 11, z: -9, radius: 12 }, 1.7)
    expect(small.target).toEqual([11, 0, -9])
    // same azimuth as the player's view: the lens stays on the +z side of the unit, in line with x
    expect(small.position[2]).toBeGreaterThan(-9)
    expect(small.position[0]).toBeCloseTo(11, 6)
    const d = (v: { position: number[]; target: number[] }) => Math.hypot(v.position[0]! - v.target[0]!, v.position[1]! - v.target[1]!, v.position[2]! - v.target[2]!)
    expect(d(small)).toBeGreaterThan(MIN_CAMERA_DISTANCE)
    expect(d(big)).toBeGreaterThan(d(small))
    expect(d(big)).toBeLessThan(DEPLOY_FIT_MAX_DISTANCE + 0.5)
  })

  it('DEPLOYCAM-008 a visit plays before the rest of its step (roll-off, banners), after the last deployment of a run', () => {
    const at = (type: string, seq: number) => ({ type, seq }) as unknown as GameEvent
    const shared = [at('UnitDeployed', 7), at('UnitDeployed', 7), at('FirstTurnChosen', 7), at('PhaseStarted', 7)]
    expect(visitFlush(shared, 0)).toBe('wait') // another deployment follows in the step: one trip
    expect(visitFlush(shared, 1)).toBe('now') // the step goes on with the roll-off: the camera visits first
    // an ordinary deployment step ends with its deployment (or the next step starts): flushed at the step end as before
    expect(visitFlush([at('UnitDeployed', 3), at('UnitDeployed', 4)], 0)).toBe('step')
    expect(visitFlush([at('UnitDeployed', 3)], 0)).toBe('step')
    expect(visitFlush([at('ReinforcementsArrived', 9), at('PhaseEnded', 9)], 0)).toBe('now')
  })

  it('DEPLOYCAM-009 a leader and its bodyguard set up together are one visit that names both units', () => {
    const beats = deployBeats([deployed('B', 'squad'), deployed('B', 'twin')], ctx)
    const beat = beats[0]!.beat
    expect(beat.kind === 'visit' && beat.unitIds).toEqual(['squad', 'twin'])
  })

  it('DEPLOYCAM-010 a unit set up at the board edge or in a corner is centred under the lens and wholly in frame', () => {
    const now = { position: [0, 61.6, 38.72] as [number, number, number], target: [0, 0, 7.04] as [number, number, number] } // the opening overview
    const aspect = 1600 / 900
    const cases = [
      { x: -18, z: -14, radius: 2 }, // far-left edge of the bot's zone
      { x: 21, z: -14.3, radius: 1.5 }, // far corner
      { x: -21.5, z: 14.5, radius: 1.2 }, // the near corner
      { x: 1.5, z: -13.5, radius: 7.5 }, // a wide row of ten bases along the back edge
    ]
    for (const c of cases) {
      const v = visitView(now, c, aspect)
      expect(v.target).toEqual([c.x, 0, c.z]) // centred on the unit: nothing clamps or shifts the target
      // inside what the orbit rig keeps the target to (the board plus its 4" margin)
      expect(Math.abs(v.target[0])).toBeLessThanOrEqual(22 + 4)
      expect(Math.abs(v.target[2])).toBeLessThanOrEqual(15 + 4)
      const centre = ndc(v, c.x, c.z, aspect)
      expect(Math.abs(centre.x)).toBeLessThan(1e-6)
      expect(Math.abs(centre.y)).toBeLessThan(1e-6)
      // every side of the unit's footprint is on screen, clear of the edges and of the HUD strip across the top
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const p = ndc(v, c.x + dx * c.radius, c.z + dz * c.radius, aspect)
        expect(p.depth).toBeGreaterThan(0)
        expect(Math.abs(p.x)).toBeLessThan(0.9)
        expect(Math.abs(p.y)).toBeLessThan(0.8)
      }
    }
  })
})
