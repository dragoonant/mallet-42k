import { describe, expect, it } from 'vitest'
import type { GameState, PendingDecision } from '@/engine'
import { AREA_MARGIN_IN, DRAG_PX, dragStartsInArea, oneFingerDragIntent, pointInDeployArea, type DragIntentInput } from '../../src/client/interaction/dragIntent'

const base: DragIntentInput = {
  movedPx: 40,
  slopPx: DRAG_PX,
  measureOn: false,
  onDraggable: false,
  deployOpen: false,
  inDeployArea: false,
  moveOpen: false,
  inMoveRange: false,
}
const intent = (o: Partial<DragIntentInput>) => oneFingerDragIntent({ ...base, ...o })

describe('one-finger drag on the phone board', () => {
  it('a drag that starts on a draggable model or ghost drags it, even inside a placement area', () => {
    expect(intent({ onDraggable: true })).toBe('drag-model')
    expect(intent({ onDraggable: true, deployOpen: true, inDeployArea: true })).toBe('drag-model')
  })
  it('deploying: inside the allowed area previews the formation, outside pans', () => {
    expect(intent({ deployOpen: true, inDeployArea: true })).toBe('deploy-preview')
    expect(intent({ deployOpen: true, inDeployArea: false })).toBe('pan')
  })
  it('moving: inside the move range previews the move, outside pans', () => {
    expect(intent({ moveOpen: true, inMoveRange: true })).toBe('move-preview')
    expect(intent({ moveOpen: true, inMoveRange: false })).toBe('pan')
  })
  it('the measure tool keeps the finger (no pan), even over a move range', () => {
    expect(intent({ measureOn: true })).toBe('measure')
    expect(intent({ measureOn: true, moveOpen: true, inMoveRange: true })).toBe('measure')
  })
  it('a drag with nothing to preview pans', () => {
    expect(intent({})).toBe('pan')
  })
  it('a finger inside the tap slop is a tap: no pan, no preview', () => {
    expect(intent({ movedPx: 3 })).toBe('tap')
    expect(intent({ movedPx: DRAG_PX - 0.1, deployOpen: true, inDeployArea: true })).toBe('tap')
    expect(intent({ movedPx: DRAG_PX })).toBe('pan')
  })
})

describe('placement area test for a deployUnit drag', () => {
  const zone = [{ x: -22, z: 10 }, { x: 22, z: 10 }, { x: 22, z: 15 }, { x: -22, z: 15 }]
  const pending = { kind: 'deployUnit', player: 'A', context: { zone, unitIds: ['u'], infiltrators: [], reservesAllowed: [] } } as unknown as PendingDecision
  const state = {} as GameState
  it('inside the zone polygon is the area, outside is not', () => {
    expect(pointInDeployArea(state, pending, 'u', { x: 0, z: 12 })).toBe(true)
    expect(pointInDeployArea(state, pending, 'u', { x: 0, z: 0 })).toBe(false)
  })
  it('a finger just outside a 5" edge zone whose lifted point is inside previews; one well outside pans', () => {
    const inside = (p: { x: number; z: number }) => pointInDeployArea(state, pending, 'u', p, AREA_MARGIN_IN)
    // finger 1.8" past the near edge (beyond the margin), but the formation drawn above it lands in the zone
    const finger = { x: 0, z: 16.8 }
    expect(inside(finger)).toBe(false)
    const inArea = dragStartsInArea(finger, { x: 0, z: 14.2 }, inside)
    expect(inArea).toBe(true)
    expect(intent({ deployOpen: true, inDeployArea: inArea })).toBe('deploy-preview')
    // well outside: neither the finger nor its lifted point is near the zone
    const far = dragStartsInArea({ x: 0, z: -2 }, { x: 0, z: -4 }, inside)
    expect(far).toBe(false)
    expect(intent({ deployOpen: true, inDeployArea: far })).toBe('pan')
  })
  it('a finger within the margin of the zone counts as inside', () => {
    expect(pointInDeployArea(state, pending, 'u', { x: 0, z: 16.2 }, AREA_MARGIN_IN)).toBe(true)
    expect(pointInDeployArea(state, pending, 'u', { x: 0, z: 16.2 })).toBe(false)
  })
})
