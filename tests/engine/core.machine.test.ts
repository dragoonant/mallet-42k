// engine/core state machine: phase/turn/round sequencing, timing windows and ordering, coherency cull, roll-offs, game end
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, EngineInvariantError, ScriptedRng, advanceGame, createContext, rollOff,
  type GameEvent, type PhaseStarted, type PlayerId, type TimingWindowId,
} from '../../src/engine'
import { autoplay, bundle, deployAll, freshState, makeEngine, makeSetup, pingEngine, pingPhases, placeUnit, recordingStratagems, scriptedModule } from '../fixtures'

const setup = makeSetup()
const types = (events: GameEvent[]) => events.map((e) => e.type)

describe('engine/core state machine', () => {
  it('runs 5 rounds × 2 turns × 5 phases in order and ends on VP', () => {
    const engine = pingEngine()
    const create = engine.createGame(setup, 'machine', bundle)
    expect(types(create.events).slice(0, 3)).toEqual(['GameCreated', 'PhaseStarted', 'PhaseEnded'])
    const deploy = deployAll(engine, create)
    const r0 = deploy.final
    expect(r0.state.phase).toBe('command')
    expect(r0.state.round).toBe(1)
    expect(r0.state.activePlayer).toBe('A')
    const { results, final } = autoplay(engine, r0)
    expect(final.state.phase).toBe('ended')
    expect(final.pending).toBeNull()
    expect(final.state.result).toEqual({ winner: 'draw', reason: 'vp', vp: { A: 0, B: 0 } })
    expect(final.state.log).toHaveLength(50 + deploy.results.length)
    const all = [...create.events, ...deploy.results.flatMap((r) => r.events), ...results.flatMap((r) => r.events)]
    const phases = all.filter((e): e is PhaseStarted => e.type === 'PhaseStarted').map((e) => `${e.round}${e.turn}${e.phase}`)
    const expected: string[] = ['0Asetup', '0Adeployment']
    for (let round = 1; round <= 5; round++) for (const p of ['A', 'B']) for (const ph of ['command', 'movement', 'shooting', 'charge', 'fight']) expected.push(`${round}${p}${ph}`)
    expect(phases).toEqual(expected)
    expect(all.filter((e) => e.type === 'RoundStarted')).toHaveLength(5)
    expect(all.filter((e) => e.type === 'RoundEnded')).toHaveLength(5)
    expect(all.filter((e) => e.type === 'TurnStarted').map((e) => e.turn)).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'])
    expect(all.filter((e) => e.type === 'GameEnded')).toHaveLength(1)
    expect(all.filter((e) => e.type === 'DecisionRequested')).toHaveLength(50 + deploy.results.length)
    // the last event sequence: fight ends, round 5 ends, battle ends
    expect(types(final.events).slice(-3)).toEqual(['PhaseEnded', 'RoundEnded', 'GameEnded'])
  })

  it('opens timing windows in the specified order: active then opponent; round/battle windows first-turn player first', () => {
    const strat = recordingStratagems()
    const engine = pingEngine({}, { stratagems: strat })
    autoplay(engine, engine.createGame(makeSetup({ firstTurn: 'B' }), 'windows', bundle))
    const at = (w: TimingWindowId) => strat.offers.filter((o) => o.window === w)
    // command.start of round 1 (B goes first): B then A
    const cmd = at('command.start')
    expect(cmd.slice(0, 4).map((o) => `${o.turn}:${o.player}`)).toEqual(['B:B', 'B:A', 'A:A', 'A:B'])
    expect(cmd).toHaveLength(20)
    for (const w of ['movement.start', 'shooting.start', 'charge.start', 'fight.start'] as TimingWindowId[]) {
      expect(at(w)).toHaveLength(20)
      for (const o of at(w)) expect(o.turn === o.player || o.turn !== o.player).toBe(true)
      expect(at(w).filter((_, i) => i % 2 === 0).every((o) => o.player === o.turn)).toBe(true)
      expect(at(w).filter((_, i) => i % 2 === 1).every((o) => o.player !== o.turn)).toBe(true)
    }
    expect(at('phase.end')).toHaveLength(100)
    expect(at('turn.end')).toHaveLength(20)
    expect(at('round.start').map((o) => `${o.round}${o.player}`)).toEqual(['1B', '1A', '2B', '2A', '3B', '3A', '4B', '4A', '5B', '5A'])
    expect(at('round.end').map((o) => `${o.round}${o.player}`)).toEqual(['1B', '1A', '2B', '2A', '3B', '3A', '4B', '4A', '5B', '5A'])
    expect(at('battle.end').map((o) => o.player)).toEqual(['B', 'A'])
    // each (window, player, key) offered once
    const keys = strat.offers.map((o) => `${o.round}|${o.turn}|${o.phase}|${o.window}|${o.player}|${o.key}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('a window that raises a decision interrupts the sequence and resumes where it left off', () => {
    const strat = recordingStratagems(['phase.end', 'round.start'])
    const engine = pingEngine({}, { stratagems: strat })
    const deploy = deployAll(engine, engine.createGame(setup, 'interrupt', bundle))
    const r0 = deploy.final
    // round.start of round 1 opened for A (first) before the first command phase
    expect(r0.pending?.kind).toBe('stratagemWindow')
    expect(r0.pending?.window).toBe('round.start')
    expect(r0.pending?.player).toBe('A')
    const r1 = engine.step(r0.state, { type: 'pass', player: 'A', decisionId: r0.pending!.id })
    expect(r1.pending?.player).toBe('B')
    expect(r1.pending?.window).toBe('round.start')
    const r2 = engine.step(r1.state, { type: 'pass', player: 'B', decisionId: r1.pending!.id })
    expect(r2.pending?.kind).toBe('confirm')
    expect(r2.state.phase).toBe('command')
    const r3 = engine.step(r2.state, { type: 'confirm', player: 'A', decisionId: r2.pending!.id })
    expect(r3.pending?.window).toBe('phase.end')
    expect(r3.pending?.player).toBe('A')
    expect(r3.state.phase).toBe('command')
    expect(r3.state.step).toBe('none')
    const r4 = engine.step(r3.state, { type: 'pass', player: 'A', decisionId: r3.pending!.id })
    expect(r4.pending?.player).toBe('B')
    const r5 = engine.step(r4.state, { type: 'pass', player: 'B', decisionId: r4.pending!.id })
    expect(r5.state.phase).toBe('movement')
    expect(r5.pending?.kind).toBe('confirm')
    const { final } = autoplay(engine, r5)
    expect(final.state.phase).toBe('ended')
    expect(final.state.log.length).toBe(deploy.results.length + 50 + 100 + 10)
  })

  it('rollOnce opens any.rollMade for the roller keyed by the roll id and returns the roll afterwards', () => {
    const strat = recordingStratagems(['any.rollMade'])
    const engine = pingEngine({ rollOnceBefore: true }, { stratagems: strat })
    const r0 = deployAll(engine, engine.createGame(setup, 'rollonce', bundle)).final
    expect(r0.pending?.kind).toBe('stratagemWindow')
    expect(r0.pending?.window).toBe('any.rollMade')
    expect(r0.events.filter((e) => e.type === 'DiceRolled')).toHaveLength(1)
    const r1 = engine.step(r0.state, { type: 'pass', player: 'A', decisionId: r0.pending!.id })
    expect(r1.pending?.kind).toBe('confirm')
    expect(r1.events.filter((e) => e.type === 'DiceRolled')).toHaveLength(0)
    const { final } = autoplay(engine, r1)
    expect(final.state.phase).toBe('ended')
    const rollWindows = strat.offers.filter((o) => o.window === 'any.rollMade')
    expect(rollWindows).toHaveLength(50)
    expect(rollWindows.every((o) => o.key.startsWith('r:') && o.player === o.turn)).toBe(true)
  })

  it('MEAS-014 at turn end a unit split 3 + 2 is culled by its owner until one group remains; no destruction triggers', () => {
    const engine = pingEngine()
    const state = freshState()
    placeUnit(state, 'A:grunts', [[-10, -12], [-8, -12], [-6, -12], [10, -12], [12, -12]])
    placeUnit(state, 'B:mob', { x: -10, z: 12, gap: 0.3 })
    state.round = 1
    state.activePlayer = 'A'
    state.firstPlayer = 'A'
    state.phase = 'fight'
    state.step = 'none' // fight body finished → transition runs the end-of-turn chain
    const { ctx, events } = createContext(state, new ScriptedRng([]), engine.modules)
    advanceGame(ctx, engine.modules)
    expect(state.pending?.kind).toBe('chooseOption')
    expect(state.pending?.player).toBe('A')
    if (state.pending?.kind !== 'chooseOption') throw new Error('expected chooseOption')
    expect(state.pending.context.topic).toBe('coherencyCull')
    expect(state.pending.options.map((o) => o.id)).toEqual(['A:grunts#0', 'A:grunts#1', 'A:grunts#2', 'A:grunts#3', 'A:grunts#4'])
    expect(events.some((e) => e.type === 'DecisionRequested')).toBe(true)
    // remove #4 → still two groups (3 + 1) → asked again; remove #3 → coherent → turn ends
    const r1 = engine.step(state, { type: 'chooseOption', player: 'A', decisionId: state.pending.id, optionId: 'A:grunts#4' })
    expect(r1.rejection).toBeUndefined()
    expect(types(r1.events)).toEqual(['CoherencyCulled', 'ModelDestroyed', 'DecisionRequested'])
    expect(r1.state.units['A:grunts'].models).toHaveLength(4)
    expect(r1.state.models['A:grunts#4']).toBeUndefined()
    const r2 = engine.step(r1.state, { type: 'chooseOption', player: 'A', decisionId: r1.pending!.id, optionId: 'A:grunts#3' })
    expect(r2.rejection).toBeUndefined()
    expect(r2.state.units['A:grunts'].models).toHaveLength(3)
    expect(r2.state.units['A:grunts'].location).toBe('board')
    expect(types(r2.events)).toContain('TurnStarted')
    expect(r2.state.activePlayer).toBe('B')
    expect(r2.state.phase).toBe('command')
    const destroyed = [...r1.events, ...r2.events].filter((e) => e.type === 'ModelDestroyed')
    expect(destroyed).toHaveLength(2)
    for (const d of destroyed) expect(d).toMatchObject({ byPlayer: null, byUnitId: null, byModelId: null, kind: 'other' })
    expect([...r1.events, ...r2.events].some((e) => e.type === 'UnitDestroyed' || e.type === 'DeadlyDemiseRolled' || e.type === 'AbilityTriggered')).toBe(false)
    const wrong = engine.step(r1.state, { type: 'chooseOption', player: 'A', decisionId: r1.pending!.id, optionId: 'A:grunts#4' })
    expect(wrong.rejection?.code).toBe('E_NOT_AN_OPTION')
  })

  it('MEAS-018 roll-off ties are re-rolled until decided; roll-offs are never re-rollable', () => {
    const state = freshState({ sides: 'rollOff' })
    const { ctx, events } = createContext(state, new ScriptedRng([3, 3, 5, 5, 2, 6]), DEFAULT_MODULES)
    expect(rollOff(ctx)).toBe('B')
    const rolls = events.filter((e) => e.type === 'DiceRolled')
    expect(rolls).toHaveLength(6)
    expect(rolls.map((e) => (e.type === 'DiceRolled' ? e.roll.player : ''))).toEqual(['A', 'B', 'A', 'B', 'A', 'B'])
    expect(rolls.every((e) => e.type === 'DiceRolled' && e.roll.commandRerollable === false && e.roll.purpose === 'rollOff')).toBe(true)
    // through createGame: sides and first turn by roll-off
    const engine = pingEngine()
    const r0 = engine.createGame(makeSetup({ sides: 'rollOff', firstTurn: 'rollOff' }), 'rolloff', bundle)
    expect(r0.state.phase).toBe('setup')
    expect(r0.pending?.kind).toBe('chooseOption')
    if (r0.pending?.kind !== 'chooseOption') throw new Error('expected chooseOption')
    expect(r0.pending.context.topic).toBe('chooseSide')
    const winner = r0.pending.player
    const r1 = engine.step(r0.state, { type: 'chooseOption', player: winner, decisionId: r0.pending.id, optionId: 'defender' })
    expect(r1.state.players[winner].side).toBe('defender')
    expect(r1.state.players[winner === 'A' ? 'B' : 'A'].side).toBe('attacker')
    expect(r1.state.objectives['obj-home-a'].home).toBe(winner === 'A' ? 'B' : 'A')
    expect(types(r1.events)).toContain('SidesChosen')
    const deploy = deployAll(engine, r1)
    const r2 = deploy.final
    expect(types(deploy.results.flatMap((r) => r.events))).toContain('FirstTurnChosen')
    expect(r2.state.phase).toBe('command')
    expect(r2.state.activePlayer).toBe(r2.state.firstPlayer)
  })

  it('R-12.6 a player without forces has their turns skipped; both without → tabled', () => {
    const skipB = pingEngine({}, { missions: { ...DEFAULT_MODULES.services.missions, playerHasForces: (_s, p: PlayerId) => p === 'A' } })
    const g1 = autoplay(skipB, skipB.createGame(setup, 'skip', bundle))
    const turns = [...g1.results.flatMap((r) => r.events)].filter((e) => e.type === 'TurnStarted').map((e) => e.turn)
    expect(turns).toEqual(['A', 'A', 'A', 'A', 'A'])
    expect(g1.final.state.log).toHaveLength(6 + 25)
    expect(g1.final.state.result?.reason).toBe('vp')

    const tabled = pingEngine({}, { missions: { ...DEFAULT_MODULES.services.missions, isTabled: (s) => s.round >= 2, playerHasForces: (s) => s.round < 2 } })
    const g2 = autoplay(tabled, tabled.createGame(setup, 'tabled', bundle))
    expect(g2.final.state.result?.reason).toBe('tabled')
    expect(g2.final.state.round).toBe(2)
    expect(g2.final.state.log).toHaveLength(6 + 10)
  })

  it('resign ends the game at once with the other player as victor', () => {
    const engine = pingEngine()
    const r0 = engine.createGame(setup, 'resign', bundle)
    const r1 = engine.step(r0.state, { type: 'resign', player: 'B', decisionId: 'whatever' })
    expect(r1.rejection).toBeUndefined()
    expect(r1.state.result).toEqual({ winner: 'A', reason: 'resign', vp: { A: 0, B: 0 } })
    expect(types(r1.events)).toEqual(['GameEnded'])
    expect(r1.state.log).toHaveLength(1)
  })

  it('legalActions: finite decisions list their options (+ pass when allowed); continuous decisions are null', () => {
    const engine = pingEngine()
    const r0 = deployAll(engine, engine.createGame(setup, 'legal', bundle)).final
    const legal = engine.legalActions(r0.state, r0.pending!)
    expect(legal).toEqual([{ type: 'confirm', player: 'A', decisionId: r0.pending!.id }])
    const passable = recordingStratagems(['phase.end'])
    const e2 = pingEngine({}, { stratagems: passable })
    const deployed2 = deployAll(e2, e2.createGame(setup, 'legal2', bundle)).final
    const { final } = autoplay(e2, deployed2, 1)
    expect(final.pending?.kind).toBe('stratagemWindow')
    expect(e2.legalActions(final.state, final.pending!)).toEqual([{ type: 'pass', player: 'A', decisionId: final.pending!.id }])
  })

  it('a module that returns pending without a decision, or enters without setting a step, is a programmer error', () => {
    const bad = makeEngine({ phases: { ...pingPhases(), command: scriptedModule('command', { advance: () => 'pending' }) } })
    expect(() => deployAll(bad, bad.createGame(setup, 'bad', bundle))).toThrow(EngineInvariantError)
    const noStep = makeEngine({ phases: { ...pingPhases(), command: scriptedModule('command', { enter: () => undefined }) } })
    expect(() => deployAll(noStep, noStep.createGame(setup, 'bad2', bundle))).toThrow(/must set state.step/)
  })

  it('per-phase and per-turn unit flags reset at the right boundaries', () => {
    const engine = makeEngine({ phases: { ...pingPhases(), shooting: scriptedModule('shooting', {
      advance(ctx) {
        const u = ctx.state.units['A:grunts']
        u.turn.shotThisPhase = true
        u.turn.chargedThisTurn = true
        ctx.state.models['A:grunts#0'].flags.allocatedThisPhase = true
        return 'done'
      },
    }) } })
    const r0 = deployAll(engine, engine.createGame(setup, 'flags', bundle)).final
    const afterShooting = autoplay(engine, r0, 2).final // command, movement confirmed → shooting ran → charge pending
    expect(afterShooting.state.phase).toBe('charge')
    expect(afterShooting.state.units['A:grunts'].turn.shotThisPhase).toBe(false)
    expect(afterShooting.state.units['A:grunts'].turn.chargedThisTurn).toBe(true)
    expect(afterShooting.state.models['A:grunts#0'].flags.allocatedThisPhase).toBe(false)
    const nextTurn = autoplay(engine, afterShooting, 2).final
    expect(nextTurn.state.activePlayer).toBe('B')
    expect(nextTurn.state.units['A:grunts'].turn.chargedThisTurn).toBe(false)
  })
})
