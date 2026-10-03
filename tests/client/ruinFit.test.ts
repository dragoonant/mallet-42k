import { describe, expect, it } from 'vitest'
import { planRuin, planTurns, polygonBounds } from '@/client/board/ruinFit'

const L1 = [
  { x: -8, z: 0 }, { x: -2, z: 0 }, { x: -2, z: 2 }, { x: -6, z: 2 }, { x: -6, z: 6 }, { x: -8, z: 6 },
]
const L2 = [
  { x: 8, z: 0 }, { x: 2, z: 0 }, { x: 2, z: -2 }, { x: 6, z: -2 }, { x: 6, z: -6 }, { x: 8, z: -6 },
]
const rect = (x0: number, z0: number, x1: number, z1: number) => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
]

describe('terrain GLB fitting', () => {
  it('puts the corner model at the L corner', () => {
    expect(planRuin('ruin-l1', L1, 6)).toEqual({ shape: 'L', slug: 'ruin-corner', turns: 0 }) // corner at min x, min z
    expect(planRuin('ruin-l2', L2, 6)).toEqual({ shape: 'L', slug: 'ruin-corner', turns: 2 }) // corner at max x, max z
  })

  it('picks different rectangle models for the two default rectangles', () => {
    const a = planRuin('ruin-s1', rect(-19, -14, -13, -10), 4)
    const b = planRuin('ruin-s2', rect(13, 10, 19, 14), 4)
    expect(a?.slug).not.toBe(b?.slug)
  })

  it('uses ruin-tall for pieces taller than wide and rotates to match the long side', () => {
    expect(planRuin('t', rect(0, 0, 3, 3), 5)?.slug).toBe('ruin-tall')
    const plan = planRuin('ruin-s1', rect(0, 0, 4, 6), 3)!
    expect(planTurns(plan, [1, 0.5, 0.6], polygonBounds(rect(0, 0, 4, 6))) % 2).toBe(1)
  })
})
