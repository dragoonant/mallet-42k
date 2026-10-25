// Deployment camera (src/client/presentation/deployCamera.ts): which events make the camera visit a bot unit, and where
// it comes back to.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine'
import { MIN_CAMERA_DISTANCE } from '../../src/client/board/cameraPresets'
import type { Pt } from '../../src/client/presentation/framing'
import { deployBeats, DEPLOY_MAX_DISTANCE, returnView, visitView, type DeployCameraCtx } from '../../src/client/presentation/deployCamera'

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
    expect(d(big)).toBeLessThan(DEPLOY_MAX_DISTANCE + 0.5)
  })
})
