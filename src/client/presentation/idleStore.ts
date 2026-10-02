// Presentation idle signal (owner: src/client/presentation, src/client/store). director.ts is the sole
// writer: it flips this to `false` the instant a fresh batch of engine events is queued, and back to
// `true` the instant its playback queue drains empty again. src/client/store/game.ts's bot loop is the
// reader: it waits (briefly, capped — see waitForPresentationIdle) for this to go idle before asking the
// bot to decide its next action, so the bot doesn't race ahead of the animations/dice still playing out
// the *previous* decision. Kept as its own tiny module (not folded into settings.ts or cueStore.ts) so
// the store can depend on just this one flag without pulling in the rest of the presentation surface.
import { create } from 'zustand'
import { announcementHoldRemainingMs } from './announceStore'

interface PresentationIdleState {
  idle: boolean
}

const usePresentationIdleStore = create<PresentationIdleState>(() => ({ idle: true }))

/** Director-only: report whether the playback queue is empty right now. */
export function setPresentationIdle(idle: boolean): void {
  if (usePresentationIdleStore.getState().idle !== idle) usePresentationIdleStore.setState({ idle })
}

export function isPresentationIdle(): boolean {
  return usePresentationIdleStore.getState().idle
}

/** Longest waitForPresentationIdle will extend past its own timeout for narration pauses it can see
 *  are still running (announceStore.ts). Several phase announcements can land in one batch — a whole
 *  turn's worth of "nothing to do here" phases, which is exactly the case the pauses exist for — so
 *  this is sized for a few of them, not one. */
const MAX_HOLD_EXTENSION_MS = 15000

/** Resolves as soon as the presentation queue is idle — immediately if it already is — or after
 *  `timeoutMs`, whichever comes first. The timeout exists so a director that's stalled (or simply
 *  slower than expected on a heavy batch) can never block the bot loop for more than this cap; it's a
 *  rare safety net, not the normal path (see src/client/store/game.ts's PRESENTATION_IDLE_TIMEOUT_MS).
 *  A deliberate narration pause is not a stall, so the cap is extended (up to MAX_HOLD_EXTENSION_MS in
 *  total) for as long as one is actually on screen — otherwise the bot would act over the top of the
 *  phase banner the player is still being shown. */
export function waitForPresentationIdle(timeoutMs: number): Promise<void> {
  if (isPresentationIdle()) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    let extendedMs = 0
    let timer: ReturnType<typeof setTimeout>
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const onTimeout = () => {
      const remaining = announcementHoldRemainingMs()
      if (remaining > 0 && extendedMs < MAX_HOLD_EXTENSION_MS) {
        // +50ms so the retry lands just after the pause's own timer, not in a tie with it.
        const extra = Math.min(remaining + 50, MAX_HOLD_EXTENSION_MS - extendedMs)
        extendedMs += extra
        timer = setTimeout(onTimeout, extra)
        return
      }
      finish()
    }
    const unsubscribe = usePresentationIdleStore.subscribe((s) => {
      if (s.idle) finish()
    })
    timer = setTimeout(onTimeout, timeoutMs)
  })
}
