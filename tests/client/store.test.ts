// e2e-ish smoke check (owner: src/client/store, src/ai/random.ts): newGame() builds a real GameSetup from the data
// bundle, and RandomDecider can drive both seats through step() for many decisions without the engine or the store
// throwing. Not a rules test — see tests/engine for those.
import { describe, expect, it } from 'vitest'
import { useGameStore } from '../../src/client/store/game'
import { RandomDecider } from '../../src/ai/random'

describe('client game store', () => {
  it('newGame + random bot on both seats plays 300 steps without throwing', async () => {
    await useGameStore.getState().newGame({
      playerFaction: 'space-marines',
      opponent: 'hotseat', // both seats driven manually below; no internal bot timer to race against
      seed: 'store-smoke-test',
    })

    expect(useGameStore.getState().state).not.toBeNull()
    expect(useGameStore.getState().pending).not.toBeNull()

    const deciders = { A: new RandomDecider('store-smoke-test:A'), B: new RandomDecider('store-smoke-test:B') }

    for (let i = 0; i < 300; i++) {
      const { state, pending, legal } = useGameStore.getState()
      if (!state || !pending) break // game ended before the step budget ran out
      const view = { player: pending.player, state, hidden: { opponentReserveCount: 0 }, lastRejection: null }
      const action = await deciders[pending.player].decide(view, pending, legal)
      expect(() => useGameStore.getState().dispatch(action)).not.toThrow()
    }

    // sanity: we actually made progress (round advanced, or the battle already concluded)
    const final = useGameStore.getState()
    expect(final.state).not.toBeNull()
    expect(final.events.length).toBeGreaterThan(0)
  }, 30000) // 300 legalActions() calls over the full engine (movement/shooting/charge/fight heuristics) is slow, not stuck
})
