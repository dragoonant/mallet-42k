import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { chokepoints, largestBase, missionsUsing, objectiveClearances, reachability, symmetryErrors } from '../../tools/terrain/lanes'

// The three WTC-2025-derived mission layouts (tools/terrain/wtc-to-cp.mjs, docs/spec/11-combat-patrol.md CP-3.2/3.4).
// The geometry lives in tools/terrain/lanes.ts so `npx tsx tools/terrain/check-lanes.ts` prints the same report.
const LAYOUTS = ['terrain.cp-long-edges', 'terrain.cp-short-edges', 'terrain.cp-diagonal']
const bundle = await loadBundle()
const big = largestBase(bundle)

describe('CP-3.4 lane width: the largest non-INFANTRY base', () => {
  it('MISSION-046 CP-3.4: L = smallest side of the largest roster base + 0.5" (130 mm round → 5.62")', () => {
    expect(big.mm).toBe(130)
    expect(big.laneWidth).toBeCloseTo(130 / 25.4 + 0.5, 6)
    expect(big.keywords).not.toContain('INFANTRY')
  })
})

describe.each(LAYOUTS)('%s', (layoutId) => {
  const layout = bundle.terrainLayouts[layoutId]
  const missions = missionsUsing(bundle, layoutId)

  it('MISSION-046 CP-3.4: every mission lists this layout first, and the layout exists', () => {
    expect(layout).toBeTruthy()
    expect(missions.length).toBeGreaterThan(0)
  })

  it('MISSION-046 CP-3.4: no choke point — every place an L-wide base fits is joined to the rest by lanes ≥ L wide, or sealed (< 0.25")', () => {
    const chokes = chokepoints(layout, big.laneWidth)
    expect(chokes.map((c) => `(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) via ${c.bottleneck.toFixed(2)}"`)).toEqual([])
  })

  it('MISSION-047 CP-3.4: the largest base can travel from each deployment zone to within objective range of every marker of every mission using the layout', () => {
    for (const m of missions) {
      const r = reachability(layout, m, big.radius)
      for (const [zone, cells] of Object.entries(r.startCells)) expect(cells, `${m.id} zone ${zone} start cells`).toBeGreaterThan(0)
      expect(r.reach.filter((x) => !x.ok).map((x) => `${m.id}: ${x.zone} → ${x.objective}`)).toEqual([])
    }
  })

  it('MISSION-048 CP-3.2: the piece set is invariant under 180° rotation about the origin', () => {
    expect(symmetryErrors(layout)).toEqual([])
  })

  it('MISSION-048 R-3.10 / RC-052: every ruin wall and crate is more than 1" from the edge of every objective marker', () => {
    for (const m of missions) {
      expect(objectiveClearances(layout, m).filter((c) => c.gap <= 1).map((c) => `${m.id}/${c.objective} ↔ ${c.piece}: ${c.gap.toFixed(2)}"`)).toEqual([])
    }
  })

  it('MISSION-048 CP-3.2: all terrain stays on the 44×30 board', () => {
    for (const p of layout.pieces) for (const v of [...p.footprint, ...(p.floors ?? []).flatMap((f) => f.polygon)]) {
      expect(Math.abs(v.x)).toBeLessThanOrEqual(22 + 1e-6)
      expect(Math.abs(v.z)).toBeLessThanOrEqual(15 + 1e-6)
    }
  })
})
