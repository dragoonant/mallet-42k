// Leagues of Votann: Eye of the Ancestors puts Judgement tokens on enemy units (docs/spec/factions/leagues-of-votann.md §2).
// The engine keeps them per Votann player in `players[owner].secondaryState['lov:judgement']` as { unitId: count }
// (src/engine/judgement.ts); the client only reads that shape, so it builds whether or not the engine file exists yet.
import type { GameState, PlayerId } from '../../engine/types'

export const JUDGEMENT_STATE_KEY = 'lov:judgement'
export const JUDGEMENT_MAX = 2

/** Tokens the Votann player(s) have placed on `unitId`, 0..2. In a Votann mirror match each side keeps its own
 *  set, so the larger count is shown. */
export function judgementCount(state: GameState, unitId: string): number {
  let best = 0
  for (const pid of Object.keys(state.players) as PlayerId[]) {
    const map = state.players[pid]?.secondaryState?.[JUDGEMENT_STATE_KEY]
    if (map && typeof map === 'object') {
      const n = (map as Record<string, unknown>)[unitId]
      if (typeof n === 'number' && n > best) best = n
    }
  }
  return Math.min(best, JUDGEMENT_MAX)
}

/** Own-words line for the unit card, or null when the unit holds no tokens. */
export function judgementLine(count: number): string | null {
  if (count <= 0) return null
  return count >= JUDGEMENT_MAX
    ? 'Judgement 2/2 — Votann attackers hit it more easily and wound it more easily'
    : 'Judgement 1/2 — Votann attackers hit it more easily'
}
