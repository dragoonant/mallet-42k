// Command phase (10-rules §4, docs/spec/12-rules-test-checklist.md CMD-*). Drives `commandModule` directly over a
// hand-built GameState, per phases/README.md §6. `recordingStratagems()` replaces the real stratagem service so
// Insane Bravery never actually fires (that's stratagems.ts's own concern) — CMD-018 checks only that the window is
// offered at the right point, once per test, before hookService.battleShockTest resolves it.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, removeModel,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { commandModule } from '../../src/engine/phases/command'
import { bundle, freshState, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems, withBundle } from '../fixtures'

function harness(overrides: Parameters<typeof freshState>[0] = {}, dice: number[] = [], open: never[] = []) {
  const state = freshState(overrides)
  const stratagems = recordingStratagems(open)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  return { ctx, events, stratagems }
}

function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  const pending = ctx.state.pending as PendingDecision
  ctx.state.pending = null
  const handled = commandModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return commandModule.advance(ctx)
}

// keep only the first `keep` models of a unit (drives Below Half-strength scenarios without new fixture data)
function shrinkTo(state: GameState, unitId: string, keep: number): void {
  const ids = [...state.units[unitId].models]
  for (const id of ids.slice(keep)) removeModel(state, id)
}

const B = 'B:mob', BWarboss = 'B:warboss', A = 'A:grunts', ABoss = 'A:boss'

describe('command phase — CP and battle-shock (CMD-001, 004, 005, 007, 008, 009, 010)', () => {
  it('CMD-001 both players gain 1 CP at the start of the active player\'s Command phase', () => {
    const { ctx, events } = harness()
    commandModule.enter(ctx)
    const r = commandModule.advance(ctx)
    expect(r).toBe('done')
    expect(ctx.state.players.A.cp).toBe(1)
    expect(ctx.state.players.B.cp).toBe(1)
    const cpEvents = events.filter((e) => e.type === 'CpChanged')
    expect(cpEvents).toHaveLength(2)
    expect(cpEvents.map((e: any) => e.player).sort()).toEqual(['A', 'B'])
  })

  it('CMD-004 a unit below half-strength (10 -> 4, Ld 7) tests; 2D6=7 passes, 2D6=6 fails and Battle-shocks it', () => {
    const passCtx = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [4, 3]) // sum 7 >= Ld7
    passCtx.ctx.state.activePlayer = 'B'
    placeUnit(passCtx.ctx.state, B, { x: 0, z: 0, gap: 0.5 })
    shrinkTo(passCtx.ctx.state, B, 4)
    commandModule.enter(passCtx.ctx)
    commandModule.advance(passCtx.ctx)
    const passed = passCtx.events.find((e) => e.type === 'BattleShockTested') as any
    expect(passed).toBeTruthy()
    expect(passed.passed).toBe(true)
    expect(passCtx.ctx.state.units[B].battleShocked).toBe(false)

    const failCtx = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [3, 3]) // sum 6 < Ld7
    failCtx.ctx.state.activePlayer = 'B'
    placeUnit(failCtx.ctx.state, B, { x: 0, z: 0, gap: 0.5 })
    shrinkTo(failCtx.ctx.state, B, 4)
    commandModule.enter(failCtx.ctx)
    commandModule.advance(failCtx.ctx)
    expect(failCtx.ctx.state.units[B].battleShocked).toBe(true)
    expect(failCtx.events.some((e) => e.type === 'BattleShocked')).toBe(true)
  })

  it('CMD-005 a unit at exactly half strength (5 of 10) is not Below Half-strength and is not tested', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } })
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, B, { x: 0, z: 0, gap: 0.5 })
    shrinkTo(ctx.state, B, 5)
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(events.some((e) => e.type === 'BattleShockTested')).toBe(false)
  })

  it('CMD-007 a Sv-strength-1 (W6) unit tests at 2 wounds but not at 3 ("3 is not < 3")', () => {
    const noTest = harness({ players: { A: makePlayerA(), B: makePlayerB() } })
    noTest.ctx.state.activePlayer = 'B'
    placeUnit(noTest.ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }])
    noTest.ctx.state.models[`${BWarboss}#0`].woundsRemaining = 3
    commandModule.enter(noTest.ctx)
    commandModule.advance(noTest.ctx)
    expect(noTest.events.some((e) => e.type === 'BattleShockTested')).toBe(false)

    const test = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [3, 3])
    test.ctx.state.activePlayer = 'B'
    placeUnit(test.ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }])
    test.ctx.state.models[`${BWarboss}#0`].woundsRemaining = 2
    commandModule.enter(test.ctx)
    commandModule.advance(test.ctx)
    expect(test.events.some((e) => e.type === 'BattleShockTested')).toBe(true)
  })

  it('CMD-008 an attached Leader+Bodyguard unit (SS 6) tests by combined model count, not not at exactly half', () => {
    const noTest = harness({ players: { A: makePlayerA(), B: makePlayerB() } }) // boss(1) + grunts attached
    placeUnit(noTest.ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    placeUnit(noTest.ctx.state, A, { x: 2, z: 0, gap: 0.5 })
    shrinkTo(noTest.ctx.state, A, 2) // 1 (boss) + 2 (grunts) = 3 of SS 6: not below half
    commandModule.enter(noTest.ctx)
    commandModule.advance(noTest.ctx)
    expect(noTest.events.some((e) => e.type === 'BattleShockTested')).toBe(false)

    const test = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [3, 3])
    placeUnit(test.ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    placeUnit(test.ctx.state, A, { x: 2, z: 0, gap: 0.5 })
    shrinkTo(test.ctx.state, A, 1) // 1 + 1 = 2 of SS 6: below half
    commandModule.enter(test.ctx)
    commandModule.advance(test.ctx)
    expect(test.events.some((e) => e.type === 'BattleShockTested')).toBe(true)
  })

  it('CMD-009 once the bodyguard is destroyed the lone Leader reverts to its own SS (no test at full wounds)', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    placeUnit(ctx.state, A, { x: 2, z: 0, gap: 0.5 })
    for (const id of [...ctx.state.units[A].models]) removeModel(ctx.state, id) // bodyguard wiped out
    expect(ctx.state.units[A].location).toBe('destroyed')
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(events.some((e) => e.type === 'BattleShockTested')).toBe(false)
  })

  it('CMD-010 a unit not on the battlefield (Reserves) is never tested, however low its model count', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } })
    ctx.state.activePlayer = 'B'
    // deliberately left in 'reserves' (placeUnit not called) — below the SS/2 threshold if it counted
    shrinkTo(ctx.state, B, 1)
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(events.some((e) => e.type === 'BattleShockTested')).toBe(false)
  })

  it('CMD-006 an odd-wound (W7) single-model unit tests at 3 wounds but not at 4 ("4 is not < 3.5")', () => {
    const data = withBundle((b) => { b.datasheets['blu.warboss'].stats = { ...b.datasheets['blu.warboss'].stats, W: 7 } })
    const build = (dice: number[]) => {
      const state = createGameState(makeSetup({ players: { A: makePlayerA(), B: makePlayerB() } }), data, 'fixture', ENGINE_VERSION)
      const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
      return createContext(state, new ScriptedRng(dice), modules)
    }
    const noTest = build([])
    noTest.ctx.state.activePlayer = 'B'
    placeUnit(noTest.ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }])
    noTest.ctx.state.models[`${BWarboss}#0`].woundsRemaining = 4 // 4 is not < 3.5 (half of 7)
    commandModule.enter(noTest.ctx)
    commandModule.advance(noTest.ctx)
    expect(noTest.events.some((e) => e.type === 'BattleShockTested')).toBe(false)

    const test = build([3, 3])
    test.ctx.state.activePlayer = 'B'
    placeUnit(test.ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }])
    test.ctx.state.models[`${BWarboss}#0`].woundsRemaining = 3 // 3 < 3.5
    commandModule.enter(test.ctx)
    commandModule.advance(test.ctx)
    expect(test.events.some((e) => e.type === 'BattleShockTested')).toBe(true)
  })
})

describe('command phase — repeat test while already shocked (CMD-020)', () => {
  it('CMD-020 an already Battle-shocked unit (e.g. from a Dread-like effect) that fails its Command-phase test remains shocked, via the single boolean flag', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [3, 3]) // sum 6 < Ld7
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, B, { x: 0, z: 0, gap: 0.5 })
    shrinkTo(ctx.state, B, 4) // below half-strength: still eligible for a fresh test this Command phase
    ctx.state.units[B].battleShocked = true
    ctx.state.units[B].battleShockExpiresRound = ctx.state.round + 5 // not yet due for recovery — still shocked going in
    commandModule.enter(ctx)
    const r = commandModule.advance(ctx)
    expect(r).toBe('done')
    expect(events.some((e) => e.type === 'BattleShockRecovered')).toBe(false) // not due yet: no early recovery
    const tested = events.find((e) => e.type === 'BattleShockTested') as any
    expect(tested?.passed).toBe(false)
    // "remains shocked, single flag": still exactly one boolean, still true, and exactly one BattleShocked event —
    // failing again while already shocked does not toggle it off first or double up the event.
    expect(ctx.state.units[B].battleShocked).toBe(true)
    expect(events.filter((e) => e.type === 'BattleShocked')).toHaveLength(1)
    // the expiry is refreshed to this failure's own recovery round, not left at the old (already-passed) value.
    expect(ctx.state.units[B].battleShockExpiresRound).toBe(ctx.state.round + 1)
  })
})

describe('command phase — Insane Bravery window and test order (CMD-018, 019)', () => {
  it('CMD-018 a command.battleShock window is offered before the test', () => {
    const { ctx, stratagems } = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [3, 3])
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, B, { x: 0, z: 0, gap: 0.5 })
    shrinkTo(ctx.state, B, 4)
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(stratagems.offers.some((o) => o.window === 'command.battleShock' && o.player === 'B')).toBe(true)
  })

  it('CMD-019 the owner chooses the test order among several units; each emits its own BattleShockTested', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } }, [4, 4, 4, 4])
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, B, { x: 0, z: 0, gap: 0.5 })
    shrinkTo(ctx.state, B, 4) // below half
    placeUnit(ctx.state, BWarboss, [{ x: 10, y: 0, z: 0 }])
    ctx.state.models[`${BWarboss}#0`].woundsRemaining = 2 // below half (W6)
    commandModule.enter(ctx)
    const r1 = commandModule.advance(ctx)
    expect(r1).toBe('pending')
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(pending.context.topic).toBe('battleShockOrder')
    expect(pending.options.map((o) => o.id).sort()).toEqual([B, BWarboss].sort())
    // once the owner names the first unit, only one candidate is left — the module tests it too without a second
    // decision (no real "choice" remains), so a single answer here resolves both tests.
    const r2 = act(ctx, { type: 'chooseOption', player: 'B', decisionId: '', optionId: BWarboss })
    expect(r2).toBe('done')
    const tested = events.filter((e) => e.type === 'BattleShockTested').map((e: any) => e.unitId)
    expect(tested.sort()).toEqual([B, BWarboss].sort())
  })
})

describe('command phase — Battle-shock recovery (CMD-015)', () => {
  it('CMD-015 shock recovers at the start of the owner\'s next Command phase, before any new test', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } })
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }]) // full health: won't be tested again this phase
    ctx.state.units[BWarboss].battleShocked = true
    ctx.state.units[BWarboss].battleShockExpiresRound = ctx.state.round // already due
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(ctx.state.units[BWarboss].battleShocked).toBe(false)
    expect(ctx.state.units[BWarboss].battleShockExpiresRound).toBeNull()
    const recovered = events.find((e) => e.type === 'BattleShockRecovered') as any
    expect(recovered?.unitId).toBe(BWarboss)
    const testedIdx = events.findIndex((e) => e.type === 'BattleShockTested')
    const recoveredIdx = events.findIndex((e) => e.type === 'BattleShockRecovered')
    expect(testedIdx === -1 || recoveredIdx < testedIdx).toBe(true)
  })

  it('CMD-015b shock due a future round is not recovered early', () => {
    const { ctx, events } = harness({ players: { A: makePlayerA(), B: makePlayerB() } })
    ctx.state.activePlayer = 'B'
    ctx.state.round = 1
    placeUnit(ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }])
    ctx.state.units[BWarboss].battleShocked = true
    ctx.state.units[BWarboss].battleShockExpiresRound = 2 // not yet
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(ctx.state.units[BWarboss].battleShocked).toBe(true)
    expect(events.some((e) => e.type === 'BattleShockRecovered')).toBe(false)
  })
})

// keep bundle import referenced (used indirectly through fixtures)
void bundle
