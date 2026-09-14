// Random-legal-action bot (owner: src/ai). Implements the engine's Decider interface (00-arch §3) so it can play
// either seat through the same GameRunner/store loop a human uses. Picks uniformly among the actions
// legalActions() returns for the current decision, with a small bias against `pass` when something else is legal —
// every phase module guarantees a non-empty, finite legalActions() list even for continuous decisions
// (src/engine/phases/legal.ts), so this never has to solve placement/targeting itself.
import { legalActions, type Action, type Decider, type PendingDecision, type PlayerView } from '../engine'
import { createRng, restoreRng, type Rng } from '../engine/rng'

// Chance we re-roll away from a `pass` action when at least one non-pass action is also legal.
const AVOID_PASS_BIAS = 0.85

export class RandomDecider implements Decider {
  private rng: Rng

  constructor(seed: string | Rng) {
    this.rng = typeof seed === 'string' ? createRng(seed) : seed
  }

  static fromSerialized(serialized: string): RandomDecider {
    return new RandomDecider(restoreRng(serialized))
  }

  async decide(_view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action> {
    const options = legal ?? legalActions(_view.state, pending)
    if (!options || options.length === 0) {
      throw new Error(`RandomDecider: no legal action for decision ${pending.id} (${pending.kind})`)
    }
    const nonPass = options.filter((a) => a.type !== 'pass')
    const pool = nonPass.length > 0 && this.rng.next() < AVOID_PASS_BIAS ? nonPass : options
    const idx = Math.floor(this.rng.next() * pool.length) % pool.length
    return pool[idx]
  }

  serialize(): string {
    return this.rng.serialize()
  }
}

export function createRandomDecider(seed: string): Decider {
  return new RandomDecider(seed)
}
