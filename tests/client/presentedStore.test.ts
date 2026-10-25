import { describe, expect, it } from 'vitest'
import type { GameState } from '../../src/engine'
import {
  catchUpPresented,
  mergeRevealedAhead,
  presentationCaughtUp,
  pruneRevealAhead,
  revealUnitsAhead,
  pickDisplaySnapshot,
  pushSnapshot,
  resetPresentation,
  setPresentedSeq,
  usePresentedStore,
} from '../../src/client/presentation/presentedStore'

const snap = (n: number) => ({ lastSeq: n, state: { tag: n } as unknown as GameState })

describe('presentedStore', () => {
  it('picks the newest snapshot at or before presentedSeq, else the oldest', () => {
    const snaps = [snap(5), snap(9), snap(14)]
    expect(pickDisplaySnapshot(snaps, 9)).toBe(snaps[1].state)
    expect(pickDisplaySnapshot(snaps, 13)).toBe(snaps[1].state)
    expect(pickDisplaySnapshot(snaps, 99)).toBe(snaps[2].state)
    expect(pickDisplaySnapshot(snaps, 1)).toBe(snaps[0].state)
    expect(pickDisplaySnapshot([], 1)).toBeNull()
  })

  it('advances monotonically, clamps to latest, and catches up', () => {
    const a = snap(3).state
    resetPresentation(3, a)
    pushSnapshot(8, snap(8).state)
    pushSnapshot(12, snap(12).state)
    expect(usePresentedStore.getState().presentedSeq).toBe(3)
    setPresentedSeq(8)
    setPresentedSeq(5)
    expect(usePresentedStore.getState().presentedSeq).toBe(8)
    setPresentedSeq(500)
    expect(usePresentedStore.getState().presentedSeq).toBe(12)
    resetPresentation(1, a)
    pushSnapshot(4, snap(4).state)
    catchUpPresented()
    expect(usePresentedStore.getState().presentedSeq).toBe(4)
  })

  const world = (tag: string, pos: number) =>
    ({
      tag,
      round: 1,
      phase: tag === 'later' ? 'command' : 'deployment',
      units: { 'B:u': { id: 'B:u', location: tag === 'later' ? 'board' : 'setup', models: ['m1', 'm2'] }, 'A:v': { id: 'A:v', location: 'board', models: ['m3'] } },
      models: { m1: { pos: { x: pos } }, m2: { pos: { x: pos + 1 } }, m3: { pos: { x: 0 } } },
    }) as unknown as GameState

  it('DEPLOYCAM-006 reveal ahead shows only the named unit from the step that placed it, not the step\'s phase', () => {
    const shown = world('shown', -1)
    const placed = world('later', 7)
    const snaps = [{ lastSeq: 5, state: shown }, { lastSeq: 9, state: placed }]
    expect(mergeRevealedAhead(shown, snaps, {})).toBe(shown)
    const merged = mergeRevealedAhead(shown, snaps, { 'B:u': 9 })!
    expect(merged).not.toBe(shown)
    expect(merged.phase).toBe('deployment') // the rest is still as the cursor shows it
    expect(merged.units['B:u']).toBe(placed.units['B:u'])
    expect(merged.models.m1).toBe(placed.models.m1)
    expect(merged.models.m3).toBe(shown.models.m3)
    expect(shown.units['B:u']!.location).toBe('setup') // the display state itself is untouched
    expect(mergeRevealedAhead(null, snaps, { 'B:u': 9 })).toBeNull()
    expect(mergeRevealedAhead(shown, snaps, { nobody: 9 })).toBe(shown)
  })

  it('DEPLOYCAM-007 revealed-ahead units clear once the cursor passes their step, on catch-up and on reset', () => {
    const a = world('shown', -1)
    resetPresentation(5, a)
    pushSnapshot(9, world('later', 7))
    revealUnitsAhead(['B:u'], 9)
    expect(usePresentedStore.getState().revealAhead).toEqual({ 'B:u': 9 })
    revealUnitsAhead(['B:w'], 9)
    expect(Object.keys(usePresentedStore.getState().revealAhead).sort()).toEqual(['B:u', 'B:w'])
    revealUnitsAhead(['x'], 3) // already presented: nothing to reveal ahead
    expect(usePresentedStore.getState().revealAhead.x).toBeUndefined()
    setPresentedSeq(7) // still short of seq 9
    expect(Object.keys(usePresentedStore.getState().revealAhead)).toHaveLength(2)
    setPresentedSeq(9)
    expect(usePresentedStore.getState().revealAhead).toEqual({})
    pushSnapshot(12, world('later', 9))
    revealUnitsAhead(['B:u'], 12)
    catchUpPresented()
    expect(usePresentedStore.getState().revealAhead).toEqual({})
    pushSnapshot(15, world('later', 9))
    revealUnitsAhead(['B:u'], 15)
    resetPresentation(2, a)
    expect(usePresentedStore.getState().revealAhead).toEqual({})
    expect(pruneRevealAhead({ a: 4, b: 8 }, 4)).toEqual({ b: 8 })
    const same = { a: 4 }
    expect(pruneRevealAhead(same, 3)).toBe(same)
  })

  it('HUDSYNC-001 the human is shown a decision once the cursor has reached it or the presentation is idle', () => {
    expect(presentationCaughtUp(4, 9, false)).toBe(false)
    expect(presentationCaughtUp(9, 9, false)).toBe(true)
    expect(presentationCaughtUp(4, 9, true)).toBe(true)
  })
})
