// Full seeded games through the public engine API with the real Combat Patrol data (both rosters, real missions and
// terrain), driven by the headless simulator's random-legal-move bots (tools/sim-core.ts).
// SIM-001 games reach GameEnded within 5 rounds; SIM-002 wounds within [0, W] and destroyed at 0; SIM-003 no NaN;
// SIM-007 CP never negative; SIM-009 replay of the action log reproduces the final hash; SIM-015 every pending
// decision has at least one legal action. (LEAN: 3 games; `npm run sim -- --games 100 --seed 1` covers the rest.)
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { replay } from '../../src/engine'
import { runGame } from '../../tools/sim-core'

describe('full seeded games (SIM-001/002/003/007/009/015)', () => {
  for (const game of [0, 1, 2]) {
    it(`game ${game}: finishes with a GameResult, no invariant violations, replay reproduces the hash`, async () => {
      const bundle = await loadBundle()
      const run = runGame(bundle, 'fullgame', game, DATA_VERSION)
      expect(run.violations).toEqual([])
      expect(run.final.phase).toBe('ended')
      expect(run.final.result).not.toBeNull()
      expect(run.rounds).toBeLessThanOrEqual(5)
      const replayed = replay(run.setup, run.seed, run.actions, bundle)
      expect(replayed.state.hash).toBe(run.finalHash)
    }, 180_000)
  }
})
