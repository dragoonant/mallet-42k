import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, hasKeyword, modelIdFor } from '../../src/engine'
import { terrainService } from '../../src/engine/terrain'
import { withBundle } from '../fixtures/bundle'
import { makeSetup } from '../fixtures/setup'
import type { Model, UnitId } from '../../src/engine'

// CP-3.5: the upper floor of every ruin in the three WTC layouts has room for a 40 mm base (1.575" across) with margin,
// judged by the engine's own terrainService.canEndAt (wall clearance and "base wholly on the floor" included).
const LAYOUTS = ['terrain.cp-long-edges', 'terrain.cp-short-edges', 'terrain.cp-diagonal']
const real = await loadBundle()
const BASE_R = 40 / 25.4 / 2
const MARGIN = 0.1 // the base must still fit when its radius is this much larger on every side

describe.each(LAYOUTS)('%s', (layoutId) => {
  const layout = real.terrainLayouts[layoutId]
  const bundle = withBundle((b) => {
    b.terrainLayouts['terrain.floors'] = { ...layout, id: 'terrain.floors' }
    b.missions['mission.test'] = { ...b.missions['mission.test'], board: layout.board, terrainLayouts: ['terrain.floors'] }
  })
  const state = createGameState(makeSetup({ terrainLayoutId: 'terrain.floors' }), bundle, 'floors-fixture', ENGINE_VERSION)
  const infantry = state.models[modelIdFor('A:grunts' as UnitId, 0)]
  expect(hasKeyword(state, infantry.unitId, 'INFANTRY')).toBe(true)
  const withRadius = (r: number): Model => ({ ...infantry, base: { shape: 'round', radius: r } as Model['base'] })

  it('MISSION-049 CP-3.5: every ruin has an upper-floor spot where a 40 mm base fits wholly on the floor, clear of the walls, with 0.1" to spare', () => {
    const ruins = Object.values(state.board.pieces).filter((p) => p.kind === 'ruin')
    expect(ruins.length).toBeGreaterThanOrEqual(8)
    const bad: string[] = []
    for (const ruin of ruins) {
      let found = false
      for (const f of ruin.floors.filter((fl) => fl.height > 0)) {
        const xs = f.polygon.map((p) => p.x), zs = f.polygon.map((p) => p.z)
        for (let x = Math.min(...xs); x <= Math.max(...xs) && !found; x += 0.05) {
          for (let z = Math.min(...zs); z <= Math.max(...zs) && !found; z += 0.05) {
            const pos = { x, y: f.height, z }
            if (terrainService.canEndAt(state, withRadius(BASE_R), pos).ok && terrainService.canEndAt(state, withRadius(BASE_R + MARGIN), pos).ok) found = true
          }
        }
      }
      if (!found) bad.push(ruin.id)
    }
    expect(bad).toEqual([])
  })

  it('MISSION-049 CP-3.5: every upper floor lies inside its ruin footprint', () => {
    for (const p of layout.pieces.filter((q) => q.kind === 'ruin')) {
      for (const f of p.floors ?? []) {
        for (const v of f.polygon) {
          // inside the (convex) footprint: on the inner side of every edge
          const fp = p.footprint
          for (let i = 0; i < fp.length; i++) {
            const a = fp[i], b = fp[(i + 1) % fp.length]
            const cross = (b.x - a.x) * (v.z - a.z) - (b.z - a.z) * (v.x - a.x)
            expect(cross, `${p.id} floor vertex (${v.x}, ${v.z}) outside footprint edge ${i}`).toBeGreaterThanOrEqual(-1e-6)
          }
        }
      }
    }
  })
})
