// Client-side stratagem ownership/eligibility helpers (src/client/ui/StratagemPanel.tsx,
// DecisionPrompt.tsx). src/engine/stratagems.ts owns the real legality check (targets, conditions,
// reaction windows) but its `stratagemService` instance isn't exported as a value from
// src/engine/index.ts, only its type — so this approximates the parts a player needs to see *why* a
// stratagem they own is greyed out, from data already on GameState: CP, the `limit` field, per-use
// history (Player.stratagemUses/oncePerBattleUsed), whose turn it is, and Forward Outpost's
// commandRerollLocked flag. It does not check per-stratagem targets/conditions, so an otherwise-legal
// stratagem with no valid target right now can still show as usable here.
import type { GameState, PlayerId, RuntimeStratagem, StratagemId } from '@/engine'

export function stratagemsFor(state: GameState, player: PlayerId): RuntimeStratagem[] {
  const faction = state.players[player].faction
  return Object.values(state.stratagems)
    .filter((s) => s.faction === 'core' || s.faction === faction)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface StratagemEligibility {
  ok: boolean
  reason?: string
}

export function stratagemEligibility(state: GameState, player: PlayerId, stratagemId: StratagemId): StratagemEligibility {
  const s = state.stratagems[stratagemId]
  const p = state.players[player]
  if (!s) return { ok: false, reason: 'unknown stratagem' }
  if (stratagemId === 'core.s.command-reroll' && p.commandRerollLocked) return { ok: false, reason: 'locked by Sabotage Comms' }
  if (p.cp < s.cost) return { ok: false, reason: `not enough CP (needs ${s.cost}, you have ${p.cp})` }
  if (s.who === 'active' && player !== state.activePlayer) return { ok: false, reason: "only on your turn" }
  if (s.who === 'reactive' && player === state.activePlayer) return { ok: false, reason: "only on the opponent's turn" }
  if (!s.phases.includes('any') && !(s.phases as string[]).includes(state.phase)) return { ok: false, reason: `only in the ${s.phases.join('/')} phase` }
  const uses = p.stratagemUses.filter((u) => u.stratagemId === stratagemId)
  switch (s.limit) {
    case 'oncePerBattle':
      if (p.oncePerBattleUsed.includes(stratagemId)) return { ok: false, reason: 'already used this battle' }
      break
    case 'oncePerRound':
      if (uses.some((u) => u.round === state.round)) return { ok: false, reason: 'already used this round' }
      break
    case 'oncePerTurn':
      if (uses.some((u) => u.round === state.round && u.turn === state.activePlayer)) return { ok: false, reason: 'already used this turn' }
      break
    case 'oncePerPhase':
      if (uses.some((u) => u.round === state.round && u.turn === state.activePlayer && u.phase === state.phase)) return { ok: false, reason: 'already used this phase' }
      break
    default:
      break
  }
  return { ok: true }
}

const WINDOW_TIMING: Partial<Record<string, string>> = {
  'any.rollMade': 'after a roll',
  'movement.moveStarted': 'when an enemy starts a move',
  'charge.moveStarted': 'when an enemy starts a charge move',
  'fight.attacksResolved': 'right after a unit fights',
  'fight.unitSelected': 'when a unit is selected to fight',
}

export function stratagemTimingLabel(s: RuntimeStratagem): string {
  const windows = Array.isArray(s.window) ? s.window : [s.window]
  const named = windows.map((w) => WINDOW_TIMING[w]).find((w) => !!w)
  if (named) return named
  if (s.phases.includes('any')) return 'any phase'
  return `${s.phases.join('/')} phase`
}
