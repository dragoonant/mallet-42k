import { describe, expect, it } from 'vitest'
import type { GameState } from '../../src/engine'
import {
  catchUpPresented,
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
})
