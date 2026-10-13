import { describe, expect, it } from 'vitest'
import { BOARD_HALF_D, BOARD_HALF_W, localSlots, pickSpot, spreadFits, worldOffset, type Obstacles } from '@/client/dice/board/spot'

const ob: Obstacles = {
  discs: Array.from({ length: 10 }, (_, i) => ({ x: (i % 5) * 1.5 - 3, z: Math.floor(i / 5) * 1.5, r: 0.7 })),
  polys: [{ footprint: [{ x: 6, z: -4 }, { x: 12, z: -4 }, { x: 12, z: 2 }, { x: 6, z: 2 }], height: 4 }],
}

describe('board dice spot picker', () => {
  for (const n of [10, 25]) {
    for (const yaw of [0, 1.3, -1.45]) {
      it(`keeps ${n} dice inside the board and off bases/terrain (yaw ${yaw})`, () => {
        const r = pickSpot({ x: 0, z: 0 }, n, yaw, 2.4, ob)
        expect(r.fits).toBe(true)
        expect(r.slots).toHaveLength(n)
        const offs = r.slots.map((s) => worldOffset(s, yaw, r.scale))
        const dieR = 0.6 * r.scale * 0.75
        expect(spreadFits(r.x, r.z, offs, dieR, ob)).toBe(true)
        for (const o of offs) {
          expect(Math.abs(r.x + o.x)).toBeLessThanOrEqual(BOARD_HALF_W - 1)
          expect(Math.abs(r.z + o.z)).toBeLessThanOrEqual(BOARD_HALF_D - 1)
        }
      })
    }
  }
  it('pulls an off-board aim back inside', () => {
    const r = pickSpot({ x: 40, z: 40 }, 10, 0.5, 2, { discs: [], polys: [] })
    expect(r.fits).toBe(true)
    expect(Math.abs(r.x)).toBeLessThan(BOARD_HALF_W)
  })
  it('lays dice in few rows', () => {
    const zs = new Set(localSlots(25).map((s) => s[0]))
    expect(zs.size).toBeLessThanOrEqual(3)
  })
})
