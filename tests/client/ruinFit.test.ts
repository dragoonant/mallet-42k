import { describe, expect, it } from 'vitest'
import { fitScaleXZ, LEGACY_CATALOG, planRuin, planTurns, polygonBounds, wallsCoverPerimeter } from '@/client/board/ruinFit'

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

  it('fits uniformly (smaller scale) when x/z scales differ by more than 15%, else per axis', () => {
    const b = polygonBounds(rect(0, 0, 6, 4))
    expect(fitScaleXZ(1, 1, b)).toEqual([4, 4])
    const near = fitScaleXZ(1, 0.9, polygonBounds(rect(0, 0, 6, 6)))
    expect(near[0]).toBeCloseTo(6)
    expect(near[1]).toBeCloseTo(6 / 0.9)
  })

  it('picks among manifest variants deterministically by id, honouring shape', () => {
    const cat = [
      ...LEGACY_CATALOG,
      { slug: 'ruin-corner-b', shape: 'corner' as const },
      { slug: 'ruin-wide', shape: 'rect' as const, size: [1, 0.8, 0.5] },
    ]
    const slugs = new Set(['r1', 'r2', 'r3'].map((id) => planRuin(id, rect(0, 0, 6, 4), 3, cat)?.slug))
    expect(slugs.has('ruin-wide')).toBe(true)
    expect(planRuin('r2', rect(0, 0, 6, 4), 3, cat)).toEqual(planRuin('r2', rect(0, 0, 6, 4), 3, cat))
    const l = new Set(['a1', 'a2'].map((id) => planRuin(id, L1, 6, cat)?.slug))
    expect(l).toEqual(new Set(['ruin-corner', 'ruin-corner-b']))
  })

  it('never covers a rectangle whose data walls run all the way round with a wall-only model', () => {
    const cat = [
      ...LEGACY_CATALOG,
      { slug: 'ruin-citadel-wall-1', shape: 'rect' as const, size: [1, 0.65, 0.39], wallOnly: true },
      { slug: 'ruin-citadel-wall-2', shape: 'rect' as const, size: [1, 0.9, 0.33], wallOnly: true },
    ]
    const ids = ['ruin-s0', 'ruin-s1', 'ruin-s2', 'ruin-s3', 'ruin-s4', 'ruin-s5']
    const perimeter = new Set(ids.map((id) => planRuin(id, rect(0, 0, 6, 4), 4, cat, true)?.slug))
    expect(perimeter).toEqual(new Set(['ruin-small']))
    const open = new Set(ids.map((id) => planRuin(id, rect(0, 0, 6, 4), 4, cat, false)?.slug))
    expect(open.has('ruin-citadel-wall-1')).toBe(true)
  })

  it('wallsCoverPerimeter needs a wall on every footprint edge', () => {
    const poly = rect(0, 0, 6, 4)
    const edge = (a: number, b: number) => ({ a: poly[a], b: poly[b] })
    const all = [edge(0, 1), edge(1, 2), edge(2, 3), edge(3, 0)]
    expect(wallsCoverPerimeter(poly, all)).toBe(true)
    expect(wallsCoverPerimeter(poly, [edge(1, 0), edge(2, 1), edge(3, 2), edge(0, 3)])).toBe(true)
    expect(wallsCoverPerimeter(poly, all.slice(0, 3))).toBe(false)
  })
})
