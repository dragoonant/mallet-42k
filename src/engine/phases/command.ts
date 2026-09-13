// Command phase module (10-rules §4). Owner: W1-C. Steps: 'command' → 'battleShock' → 'scoring'.
// TODO(W1-C): R-4.1 both players +1 CP (CpChanged) after the `command.start` window (opened by the core);
// R-4.2 cap via Player.cpGainedThisRound; R-4.3 battle-shock tests one unit at a time (chooseOption topic
// 'battleShockOrder' when more than one unit must test, `command.battleShock` window before each test via
// ctx.window('command.battleShock', unitId, ctx.order.only(active))); R-4.6 effects; expiry of last round's shock
// (Unit.battleShockExpiresRound) at the start of the owner's Command phase; `command.end` window (scoring runs there
// through missions.onWindow). See ../phases/README.md for the state-machine pattern.
import { notImplementedHandle, type PhaseModule } from '../modules'

export const commandModule: PhaseModule = {
  name: 'command',
  enter(ctx) {
    ctx.state.step = 'command'
    ctx.state.phaseState.battleShockQueue = []
  },
  advance(ctx) {
    const s = ctx.state
    // TODO(W1-C): implement the steps; keep every step re-entrant (read progress from state, never from locals)
    if (s.step === 'command') s.step = 'battleShock'
    if (s.step === 'battleShock') s.step = 'scoring'
    if (ctx.window('command.end', 'end', ctx.order.active())) return 'pending'
    return 'done'
  },
  handle: notImplementedHandle('command'),
}
