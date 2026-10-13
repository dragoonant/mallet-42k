// Public entry points for the dice presentation layer. Import from '@/client/dice' (index.ts),
// not from this file directly.
import { kick, nextId, useDiceStore } from './diceStore'
import type { DiceSpeed, DiceStyle, RollRequest } from './types'

/** Queue a roll for the tray to animate. Resolves once that roll has tumbled and settled (or,
 *  at `instant` speed, on the next tick). Rolls queued while another is playing wait their turn
 *  and play in order — call sites don't need to await one before firing the next. */
export function playRoll(roll: RollRequest): Promise<void> {
  return new Promise((resolve) => {
    useDiceStore.setState((s) => ({
      queue: [...s.queue, { id: nextId(), request: roll, resolve }],
    }))
    kick()
  })
}

/** Change animation speed for rolls queued from now on (does not rewind a roll already playing). */
export function setSpeed(speed: DiceSpeed): void {
  useDiceStore.setState({ speed })
}

export function getSpeed(): DiceSpeed {
  return useDiceStore.getState().speed
}

/** Choose the dice presentation: the quick 2D tray or the slow 3D table. Applies to rolls that start from now on. */
export function setDiceStyle(style: DiceStyle): void {
  useDiceStore.setState({ style })
}

export function getDiceStyle(): DiceStyle {
  return useDiceStore.getState().style
}

declare global {
  interface Window {
    /** Console hook for trying the dice styles: __malletDice.setDiceStyle('table'); __malletDice.playRoll({...}). */
    __malletDice?: { playRoll: typeof playRoll; setDiceStyle: typeof setDiceStyle }
  }
}
if (typeof window !== 'undefined') window.__malletDice = { playRoll, setDiceStyle }
