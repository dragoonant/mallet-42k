// Spike-only: starts a bot-vs-bot game (seat B is the store's own bot; this drives seat A with the same AI) and skips the start screen.
import { legalActions, view } from '../engine'
import { UtilityDecider } from '../ai/utility'
import { useGameStore } from '../client/store/game'
import { spikeMode, spikeParam } from './flag'
import { toIncursion } from './incursion'

export interface SpikeDriver { paused: boolean }

let started = false

export async function startSpikeGame(): Promise<void> {
  const mode = spikeMode()
  if (!mode || started) return
  started = true
  const seed = spikeParam('seed', 'spike-1')
  const driver: SpikeDriver = { paused: false }
  ;(window as unknown as { __spikeDriver: SpikeDriver }).__spikeDriver = driver
  await useGameStore.getState().newGame({
    playerFaction: spikeParam('a', 'space-marines'), opponentFaction: spikeParam('b', 'orks'), opponent: 'bot', seed,
    ...(mode === 'incursion' ? { transform: toIncursion } : {}),
  })
  const decider = new UtilityDecider('normal', `${seed}:ai:A`)
  let busy = false
  const tick = async () => {
    const { state, pending } = useGameStore.getState()
    if (busy || driver.paused || !state || !pending || pending.player !== 'A') return
    busy = true
    try {
      const legal = legalActions(state, pending)
      const action = await decider.decide(view(state, 'A'), pending, legal)
      if (useGameStore.getState().pending === pending) useGameStore.getState().dispatch(action)
    } catch (e) {
      console.warn('spike driver', e)
    } finally {
      busy = false
    }
  }
  useGameStore.subscribe(() => { void tick() })
  setInterval(() => { void tick() }, 200)
  void tick()
}
