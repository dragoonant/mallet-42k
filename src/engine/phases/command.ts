// Command phase module (10-rules §4). Owner: W1-C. Steps: 'command' → 'battleShock' → 'scoring'.
// R-4.1: both players +1 CP (uncapped — the R-4.2 cap only governs *other* CP sources, via hookService.gainCp,
// which command.ts never calls). R-4.3/R-4.4/R-4.5: battle-shock tests, one unit at a time in owner-chosen order,
// for board units Below Half-strength (leaderService.isBelowHalfStrength already folds attached-unit SS, R-4.5);
// Insane Bravery and the roll itself are entirely handled by stratagems.ts / hookService.battleShockTest — this
// module only opens `command.battleShock` before each test and calls that service. R-4.3 recovery ("until the start
// of that player's next Command phase") runs before any new test this phase, using Unit.battleShockExpiresRound
// (set by hookService.battleShockTest, R-4.8 "remains shocked" already handled there — a single boolean flag).
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import { notImplementedHandle, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import type { PlayerId, Rejection, UnitId } from '../types'

const SEL_PREFIX = 'cmd:bsSelected='
const TESTED_PREFIX = 'cmd:bsTested:'

function selectedUnit(ctx: EngineContext): UnitId | null {
  const m = ctx.state.phaseState.marks.find((x) => x.startsWith(SEL_PREFIX))
  return m ? m.slice(SEL_PREFIX.length) : null
}

function setSelected(ctx: EngineContext, unitId: UnitId | null): void {
  const s = ctx.state
  s.phaseState.marks = s.phaseState.marks.filter((x) => !x.startsWith(SEL_PREFIX))
  if (unitId !== null) s.phaseState.marks.push(SEL_PREFIX + unitId)
}

// canonical below-half-strength candidates for the active player: one id per (possibly attached) unit — the
// bodyguard half is canonical (matches reducer.ts's coherencyCull convention), leaders skipped via bodyguardUnitId.
function eligibleForTest(ctx: EngineContext): UnitId[] {
  const s = ctx.state
  const out: UnitId[] = []
  for (const u of Object.values(s.units)) {
    if (u.player !== s.activePlayer || u.location !== 'board' || u.bodyguardUnitId) continue
    if (s.phaseState.marks.includes(TESTED_PREFIX + u.id)) continue
    if (leaderService.isBelowHalfStrength(s, u.id)) out.push(u.id)
  }
  return out.sort()
}

// R-4.3: recover last round's shock at the start of the owner's Command phase, before any new test.
function recoverExpiredShock(ctx: EngineContext): void {
  const s = ctx.state
  for (const u of Object.values(s.units)) {
    if (u.player !== s.activePlayer || !u.battleShocked || u.battleShockExpiresRound === null) continue
    if (s.round < u.battleShockExpiresRound) continue
    u.battleShocked = false
    u.battleShockExpiresRound = null
    ctx.emit({ type: 'BattleShockRecovered', unitId: u.id, player: u.player })
  }
}

// R-4.3: test units one at a time; owner picks the order via chooseOption('battleShockOrder') when >1 remain.
function runBattleShockTests(ctx: EngineContext): AdvanceResult {
  const s = ctx.state
  for (;;) {
    let unitId = selectedUnit(ctx)
    if (unitId === null) {
      const remaining = eligibleForTest(ctx)
      if (remaining.length === 0) return 'done'
      if (remaining.length === 1) {
        unitId = remaining[0]
        setSelected(ctx, unitId)
      } else {
        ctx.decide({
          kind: 'chooseOption',
          player: s.activePlayer,
          window: 'command.battleShock',
          canPass: false,
          context: { topic: 'battleShockOrder', unitId: null, abilityId: null, data: { remaining } },
          options: remaining.map((id) => ({
            id,
            label: `test ${id}`,
            action: { type: 'chooseOption', player: s.activePlayer, decisionId: '', optionId: id },
          })),
        })
        return 'pending'
      }
    }
    if (ctx.window('command.battleShock', unitId, ctx.order.only(s.activePlayer), { unitId })) return 'pending'
    hookService.battleShockTest(ctx, unitId, 'command')
    s.phaseState.marks.push(TESTED_PREFIX + unitId)
    setSelected(ctx, null)
  }
}

export const commandModule: PhaseModule = {
  name: 'command',
  enter(ctx) {
    ctx.state.step = 'command'
    ctx.state.phaseState.battleShockQueue = []
  },
  advance(ctx) {
    const s = ctx.state
    if (s.step === 'command') {
      if (ctx.once('cmd:cpGain')) {
        for (const pid of ['A', 'B'] as PlayerId[]) {
          const p = s.players[pid]
          p.cp += 1
          ctx.emit({ type: 'CpChanged', delta: 1, total: p.cp, source: 'commandPhase', player: pid })
        }
      }
      s.step = 'battleShock'
    }
    if (s.step === 'battleShock') {
      if (ctx.once('cmd:recover')) recoverExpiredShock(ctx)
      const r = runBattleShockTests(ctx)
      if (r === 'pending') return 'pending'
      s.step = 'scoring'
    }
    // 'scoring': missions.onWindow runs the mission's ScoringRules at this window (R-4.1's "resolve other
    // Command-phase rules"); Oath of Moment / Waaagh! picks are offered at command.start (opened by the core).
    if (ctx.window('command.end', 'end', ctx.order.active())) return 'pending'
    return 'done'
  },
  handle(ctx, action, pending): Rejection | void {
    if (pending.kind !== 'chooseOption' || pending.context.topic !== 'battleShockOrder') {
      return notImplementedHandle('command')(ctx, action, pending)
    }
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'expected chooseOption' }
    setSelected(ctx, action.optionId)
  },
}
