// Narration pauses (owner: src/client/presentation/announceStore.ts + idleStore.ts). The behaviour
// under test is the fix for phases that flashed past under overlapping narrator voice lines: an
// announced phase/turn now holds the director's queue for a beat, the player can end that beat with a
// click, and the bot loop's idle-wait treats the beat as deliberate rather than as a stalled director.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  announcementHoldMs, announcementHoldRemainingMs, clearAnnouncement, holdAnnouncement,
  isAnnouncementHolding, skipAnnouncement, useAnnouncementStore,
} from '../../src/client/presentation/announceStore'
import { setPresentationIdle, waitForPresentationIdle } from '../../src/client/presentation/idleStore'

function phaseHold(durationMs: number): Promise<void> {
  return holdAnnouncement({ kind: 'phase', title: 'Shooting Phase', subtitle: 'Round 2 · Octavius', player: 'A', durationMs })
}

afterEach(() => {
  clearAnnouncement()
  setPresentationIdle(true)
})

describe('announcement holds', () => {
  it('pauses 2-3s per phase at normal speed, scales down for fast and vanishes at instant', () => {
    const phase = announcementHoldMs('phase', 'normal')
    expect(phase).toBeGreaterThanOrEqual(2000)
    expect(phase).toBeLessThanOrEqual(3000)
    expect(announcementHoldMs('turn', 'normal')).toBeLessThan(phase)
    expect(announcementHoldMs('phase', 'fast')).toBeLessThan(phase)
    expect(announcementHoldMs('phase', 'instant')).toBe(0)
    expect(announcementHoldMs('turn', 'instant')).toBe(0)
  })

  it('shows the banner for the length of the pause, then clears it', async () => {
    const done = phaseHold(60)
    expect(isAnnouncementHolding()).toBe(true)
    expect(useAnnouncementStore.getState().current?.title).toBe('Shooting Phase')
    expect(announcementHoldRemainingMs()).toBeGreaterThan(0)
    await done
    expect(isAnnouncementHolding()).toBe(false)
    expect(useAnnouncementStore.getState().current).toBeNull()
  })

  it('a zero-length pause (instant speed) neither waits nor shows a banner', async () => {
    await holdAnnouncement({ kind: 'phase', title: 'Command Phase', subtitle: 'Round 1', player: 'B', durationMs: 0 })
    expect(useAnnouncementStore.getState().current).toBeNull()
  })

  it('skipping ends the pause early — the click the player makes to move things along', async () => {
    const started = Date.now()
    const done = phaseHold(5000)
    skipAnnouncement()
    await done
    expect(Date.now() - started).toBeLessThan(1000)
    expect(isAnnouncementHolding()).toBe(false)
  })

  it('a second announcement replaces the first instead of stacking two banners', async () => {
    const first = phaseHold(5000)
    const second = holdAnnouncement({ kind: 'turn', title: 'Your Turn', subtitle: 'Round 3', player: 'A', durationMs: 40 })
    await first // resolves as soon as it is superseded, so the director's queue never wedges
    expect(useAnnouncementStore.getState().current?.title).toBe('Your Turn')
    await second
    expect(isAnnouncementHolding()).toBe(false)
  })
})

// The click-to-skip wiring itself: announceStore attaches window listeners for the length of each
// pause. Vitest runs in the 'node' environment (vite.config.ts) and the project has no DOM shim, so
// this stands one up — just enough of addEventListener/removeEventListener to fire a pointerdown at
// the handler the store registered, and to notice if it ever forgets to unregister it.
interface FakeWindow {
  addEventListener(type: string, fn: () => void, opts?: unknown): void
  removeEventListener(type: string, fn: () => void, opts?: unknown): void
}

describe('click-to-skip wiring', () => {
  const handlers = new Map<string, Set<() => void>>()
  let realWindow: unknown

  beforeEach(() => {
    handlers.clear()
    realWindow = (globalThis as { window?: unknown }).window
    const fake: FakeWindow = {
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set())
        handlers.get(type)!.add(fn)
      },
      removeEventListener(type, fn) {
        handlers.get(type)?.delete(fn)
      },
    }
    ;(globalThis as { window?: unknown }).window = fake
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = realWindow
  })

  const fire = (type: string) => {
    for (const fn of [...(handlers.get(type) ?? [])]) fn()
  }
  const listenerCount = () => [...handlers.values()].reduce((n, set) => n + set.size, 0)

  it('a click anywhere ends the pause, and the listeners are cleaned up after', async () => {
    const started = Date.now()
    const done = phaseHold(5000)
    expect(listenerCount()).toBeGreaterThan(0)
    fire('pointerdown')
    await done
    expect(Date.now() - started).toBeLessThan(1000)
    expect(isAnnouncementHolding()).toBe(false)
    expect(listenerCount(), 'no stray listeners once the pause is over').toBe(0)
  })

  it('a key anywhere ends the pause too', async () => {
    const done = phaseHold(5000)
    fire('keydown')
    await done
    expect(isAnnouncementHolding()).toBe(false)
    expect(listenerCount()).toBe(0)
  })

  it('a pause that runs its course leaves no listeners behind either', async () => {
    await phaseHold(40)
    expect(listenerCount()).toBe(0)
  })
})

describe('presentation idle wait vs. a narration pause', () => {
  it('waits past its own timeout while a pause is on screen (the bot must not act over the banner)', async () => {
    setPresentationIdle(false)
    const hold = phaseHold(220)
    const started = Date.now()
    const wait = waitForPresentationIdle(40) // far shorter than the pause
    void hold.then(() => setPresentationIdle(true))
    await wait
    expect(Date.now() - started).toBeGreaterThanOrEqual(200)
  })

  it('still gives up at its timeout when nothing is being announced', async () => {
    setPresentationIdle(false)
    const started = Date.now()
    await waitForPresentationIdle(40)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
