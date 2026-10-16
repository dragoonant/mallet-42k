// Which name a player's saved-dice pool goes by. The engine keeps one pool per player (state.players[id].miracle)
// that two rules fill: Adepta Sororitas' Acts of Faith ("Miracle dice") and Aeldari's Strands of Fate ("Fate dice",
// engine code `strandsOfFate`). Client copy that names the pool asks here, so each army reads its own rule.
import type { GameState, PlayerId } from '../../engine/types'

const FATE_FACTION = 'aeldari'
const FATE_CODE = 'strandsOfFate'

/** True when the player's army carries Strands of Fate: an Aeldari patrol, or any unit with the ability. */
export function hasFatePool(state: GameState, id: PlayerId): boolean {
  if (state.players[id]?.faction === FATE_FACTION) return true
  return Object.values(state.units).some((u) => {
    if (u.player !== id) return false
    const ds = state.datasheets[u.datasheetId]
    return !!ds && ds.abilities.some((ab) => (state.abilities[ab] as { code?: string } | undefined)?.code === FATE_CODE)
  })
}

/** 'Fate' for an Aeldari player, otherwise 'Miracle' (matches the engine's own option labels). */
export function diePoolName(state: GameState | undefined, id: PlayerId | undefined): 'Fate' | 'Miracle' {
  return state && id && hasFatePool(state, id) ? 'Fate' : 'Miracle'
}

/** A miracleDie decision that lets the player spend several pool dice at once (Strands of Fate on a fast-rolled batch):
 *  the pool and the cap, or null for the usual one-die offer. The engine takes the answer as optionId 'use' + dieIndexes. */
export function multiDiePick(data: Record<string, unknown> | undefined): { pool: number[]; max: number } | null {
  const pool = Array.isArray(data?.pool) ? (data.pool as unknown[]).filter((v): v is number => typeof v === 'number') : []
  const max = typeof data?.maxSubstitutions === 'number' ? Math.min(data.maxSubstitutions, pool.length) : 1
  return max > 1 ? { pool, max } : null
}

/** Toggle pool index `i` in the ordered selection: adds it (dropped if the cap is reached), or removes it. */
export function toggleDie(selected: readonly number[], i: number, max: number): number[] {
  if (selected.includes(i)) return selected.filter((x) => x !== i)
  return selected.length >= max ? [...selected] : [...selected, i]
}
