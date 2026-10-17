// Camera presets are pure maths (src/client/board/cameraPresets.ts): mirrored edge views, a viewer-side flip,
// a focus-centred follow pose, and a bounded easing curve.
import { describe, expect, it } from 'vitest'
import { cameraPose, easeInOut, maxDistanceFor, PRESET_CYCLE, TRANSITION_MS } from '../../src/client/board/cameraPresets'

const BOARD = { w: 44, h: 30 }

describe('camera presets', () => {
  it('edgeA and edgeB are mirrors in z for sideA = 1', () => {
    const a = cameraPose('edgeA', BOARD)
    const b = cameraPose('edgeB', BOARD)
    expect(a.position[2]).toBeGreaterThan(0)
    expect(b.position[2]).toBeCloseTo(-a.position[2])
    expect(b.target[2]).toBeCloseTo(-a.target[2])
    expect(b.position[1]).toBeCloseTo(a.position[1])
    expect(b.position[0]).toBeCloseTo(a.position[0])
  })

  it('sideA = -1 flips edgeA to the -z edge', () => {
    const a = cameraPose('edgeA', BOARD, undefined, -1)
    const flipped = cameraPose('edgeA', BOARD, undefined, 1)
    expect(a.position[2]).toBeLessThan(0)
    expect(a.position[2]).toBeCloseTo(-flipped.position[2])
    expect(a.target[2]).toBeCloseTo(-flipped.target[2])
  })

  it('follow centres on the focus point', () => {
    const p = cameraPose('follow', BOARD, { x: 7, z: -5 })
    expect(p.target).toEqual([7, 0, -5])
    expect(p.position[0]).toBe(7)
    expect(p.position[2]).toBeGreaterThan(-5)
  })

  it('easeInOut hits 0, 1 and the midpoint', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('transitions are at most 600 ms and the cycle covers all four presets', () => {
    expect(TRANSITION_MS).toBeLessThanOrEqual(600)
    expect(PRESET_CYCLE).toEqual(['top', 'edgeA', 'edgeB', 'follow'])
    expect(maxDistanceFor(BOARD)).toBeCloseTo(44 * 2.4)
  })
})
