// Pre-battle sequence (10-rules §13): phase 'setup' (P4 sides) and phase 'deployment' (P6 deploy, P7 first turn, P8 Scouts).
// Owner: W1-F (missions). W1-A implemented the roll-offs and side/first-turn choices; deployment and Scouts are TODO.
import type { EngineContext, PhaseModule } from './modules'
import { otherPlayer } from './modules'
import { assignSides } from './state'
import type { GameState, PlayerId } from './types'

// R-1.4: each player rolls 1D6, higher wins, ties re-roll; never modified or re-rolled
export function rollOff(ctx: EngineContext, purpose: 'rollOff' | 'firstTurn' = 'rollOff'): PlayerId {
  for (let i = 0; i < 1000; i++) {
    const a = ctx.roll({ purpose, player: 'A', commandRerollable: false }).dice[0]
    const b = ctx.roll({ purpose, player: 'B', commandRerollable: false }).dice[0]
    if (a !== b) return a > b ? 'A' : 'B'
  }
  throw new Error('rollOff: no winner after 1000 rounds')
}

function sidesChosen(state: GameState): boolean { return state.players.A.side !== null }

export const setupModule: PhaseModule = {
  name: 'setup',

  enter(ctx) {
    ctx.state.step = ctx.state.phase === 'setup' ? 'rollOffSides' : 'deploy'
  },

  advance(ctx) {
    const s = ctx.state
    for (;;) {
      switch (s.step) {
        // ---- phase 'setup' ----
        case 'rollOffSides': {
          if (sidesChosen(s)) return 'done'
          const winner = rollOff(ctx)
          s.step = 'chooseSides'
          ctx.decide({
            kind: 'chooseOption', player: winner, window: 'deployment.unit', canPass: false,
            context: { topic: 'chooseSide', unitId: null, abilityId: null, data: { winner } },
            options: [
              { id: 'attacker', label: 'Attacker', action: { type: 'chooseOption', player: winner, decisionId: '', optionId: 'attacker' } },
              { id: 'defender', label: 'Defender', action: { type: 'chooseOption', player: winner, decisionId: '', optionId: 'defender' } },
            ],
          })
          return 'pending'
        }
        case 'chooseSides':
          return sidesChosen(s) ? 'done' : 'pending'
        // ---- phase 'deployment' ----
        case 'deploy': {
          // TODO(W1-F): P6 — alternate `deployUnit` decisions, Defender first, wholly within the owner's zone
          // (state.deploymentZone), Infiltrators (R-10.7), Reserves (`toReserves`), units set up after both armies deployed.
          // Every unit starts with location 'reserves'; deploying sets location 'board' and model positions.
          s.step = 'rollOffFirstTurn'
          continue
        }
        case 'rollOffFirstTurn': {
          if (s.setup.firstTurn !== 'rollOff') {
            s.firstPlayer = s.setup.firstTurn
          } else if (s.mission.data.firstTurn === 'attackerChoice') {
            // TODO(W1-F): offer the attacker a chooseOption (topic 'other', data.choice = 'firstTurn'); attacker goes first for now
            s.firstPlayer = s.players.A.side === 'attacker' ? 'A' : 'B'
          } else {
            s.firstPlayer = rollOff(ctx, 'firstTurn')
          }
          s.activePlayer = s.firstPlayer
          ctx.emit({ type: 'FirstTurnChosen', first: s.firstPlayer, player: s.firstPlayer })
          s.step = 'preBattle'
          continue
        }
        case 'preBattle':
          // TODO(W1-F): P8 — Scouts moves alternating from the first-turn player (R-10.8)
          return 'done'
        default:
          return 'done'
      }
    }
  },

  handle(ctx, action, pending) {
    const s = ctx.state
    if (pending.kind === 'chooseOption' && pending.context.topic === 'chooseSide' && action.type === 'chooseOption') {
      const attacker = action.optionId === 'attacker' ? pending.player : otherPlayer(pending.player)
      assignSides(s, attacker)
      ctx.emit({ type: 'SidesChosen', attacker, defender: otherPlayer(attacker), player: pending.player })
      return
    }
    // TODO(W1-F): deployUnit answers (validate placements with checkPlacements + region = deployment zone), Scouts moves
    return { code: 'E_NOT_AN_OPTION', reason: `setup: no handler for ${action.type} at step ${s.step}` }
  },
}
