// engine/core: RNG, dice, reducer purity and rejections, action log, replay, save/load, undo, view (12-checklist CORE-*)
import { describe, expect, it } from 'vitest'
import {
  ENGINE_VERSION, EngineInvariantError, ScriptedRng, SeededRng, applyReroll, canReroll, clampStat, createRng, d3FromD6,
  emptyMoveConstraints, makeRoll, parseDiceExpr, restoreRng, rollDiceExpr, setModelPos,
  type Action, type DiceRolled, type GameState, type Rng,
} from '../../src/engine'
import { autoplay, bundle, deployAll, makeEngine, makeSetup, pingEngine, pingPhases, scriptedModule, withBundle } from '../fixtures'

const seedSetup = makeSetup()

describe('engine/core rng + dice', () => {
  it('CORE-001 SeededRng is reproducible per seed and differs across seeds', () => {
    const a1 = new SeededRng('a'), a2 = new SeededRng('a'), b = new SeededRng('b')
    const va = Array.from({ length: 1000 }, () => a1.next())
    const va2 = Array.from({ length: 1000 }, () => a2.next())
    const vb = Array.from({ length: 1000 }, () => b.next())
    expect(va).toEqual(va2)
    expect(va).not.toEqual(vb)
    for (const v of va) expect(v >= 0 && v < 1).toBe(true)
  })

  it('CORE-002 serialize after 17 rolls then restoreRng continues the same sequence', () => {
    const rng = createRng('serial')
    for (let i = 0; i < 17; i++) rng.roll(6)
    const copy = restoreRng(rng.serialize())
    const a = Array.from({ length: 50 }, () => rng.roll(6))
    const b = Array.from({ length: 50 }, () => copy.roll(6))
    expect(a).toEqual(b)
    expect(rng.serialize()).toBe(copy.serialize())
  })

  it('CORE-003 roll(6) is uniform within 3% over 6000 samples; roll(3) ∈ 1..3', () => {
    const rng = createRng('uniform')
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < 6000; i++) counts[rng.roll(6)]++
    for (let f = 1; f <= 6; f++) expect(Math.abs(counts[f] / 6000 - 1 / 6)).toBeLessThanOrEqual(0.03)
    for (let i = 0; i < 600; i++) { const d = rng.roll(3); expect(d >= 1 && d <= 3).toBe(true) }
  })

  it('CORE-004 DiceExpr parse: 3, D6, 2D6+1, D3+3; D7 and -1 are E_SCHEMA at data load', () => {
    expect(parseDiceExpr(3)).toEqual({ count: 0, sides: null, flat: 3 })
    expect(parseDiceExpr('3')).toEqual({ count: 0, sides: null, flat: 3 })
    expect(parseDiceExpr('D6')).toEqual({ count: 1, sides: 6, flat: 0 })
    expect(parseDiceExpr('2D6+1')).toEqual({ count: 2, sides: 6, flat: 1 })
    expect(parseDiceExpr('D3+3')).toEqual({ count: 1, sides: 3, flat: 3 })
    for (const bad of ['D7', '-1', '', 'x', -2, 1.5]) {
      let err: unknown = null
      try { parseDiceExpr(bad as never) } catch (e) { err = e }
      expect(err).toBeInstanceOf(EngineInvariantError)
      expect((err as EngineInvariantError).details?.code).toBe('E_SCHEMA')
    }
    const badBundle = withBundle((b) => { b.weapons['red.w.gun'].A = 'D7' })
    let loadErr: unknown = null
    try { pingEngine().createGame(seedSetup, 's', badBundle) } catch (e) { loadErr = e }
    expect(loadErr).toBeInstanceOf(EngineInvariantError)
    expect((loadErr as EngineInvariantError).details?.code).toBe('E_SCHEMA')
  })

  it('CORE-005 "2D6" with ScriptedRng [3,4] → 7 and one DiceRolled with dice [3,4]', () => {
    const { total, roll } = rollDiceExpr(new ScriptedRng([3, 4]), '2D6', { purpose: 'charge', player: 'A' }, 'r:1')
    expect(total).toBe(7)
    expect(roll?.dice).toEqual([3, 4])
    // through the reducer: a module rolls 2D6 when its confirm is answered
    const engine = makeEngine({ phases: { ...pingPhases(), command: scriptedModule('command', {
      advance(ctx) {
        if (ctx.marked('asked')) return 'done'
        ctx.once('asked')
        ctx.decide({ kind: 'confirm', player: 'A', window: 'command.start', canPass: false, context: { topic: 'info', message: 'roll', data: {} }, options: [{ id: 'ok', label: 'ok', action: { type: 'confirm', player: 'A', decisionId: '' } }] })
        return 'pending'
      },
      handle(ctx) { ctx.state.mission.custom.total = ctx.rollExpr('2D6', { purpose: 'charge', player: 'A' }).total },
    }) } })
    const r0 = deployAll(engine, engine.createGame(seedSetup, 's', bundle)).final
    const r1 = engine.step(r0.state, { type: 'confirm', player: 'A', decisionId: r0.pending!.id }, new ScriptedRng([3, 4]))
    const rolled = r1.events.filter((e): e is DiceRolled => e.type === 'DiceRolled')
    expect(rolled).toHaveLength(1)
    expect(rolled[0].roll.dice).toEqual([3, 4])
    expect(rolled[0].roll.purpose).toBe('charge')
    expect(r1.state.mission.custom.total).toBe(7)
  })

  it('MEAS-016 D3 mapping: D6 1,2→1; 3,4→2; 5,6→3', () => {
    expect([1, 2, 3, 4, 5, 6].map(d3FromD6)).toEqual([1, 1, 2, 2, 3, 3])
    const rng = new ScriptedRng([1, 2, 3, 4, 5, 6])
    expect(Array.from({ length: 6 }, () => rng.roll(3))).toEqual([1, 1, 2, 2, 3, 3])
  })

  it('MEAS-017 a die re-rolled once cannot be re-rolled by a second source', () => {
    const roll = makeRoll(new ScriptedRng([1, 5]), { purpose: 'hit', player: 'A', count: 2, mode: 'perDie' }, 'r:1')
    const first = applyReroll(new ScriptedRng([6]), roll, [0])
    expect(first.roll.dice).toEqual([6, 5])
    expect(first.roll.rerolled).toEqual([0])
    expect(canReroll(first.roll, 0)).toBe(false)
    expect(canReroll(first.roll, 1)).toBe(true)
    expect(() => applyReroll(new ScriptedRng([2]), first.roll, [0])).toThrow(EngineInvariantError)
  })

  it('MEAS-019 characteristic floors/caps: Sv 1+ → 2+, AP +1 → 0, D 0 → 1', () => {
    expect(clampStat('Sv', 1)).toBe(2)
    expect(clampStat('AP', 1)).toBe(0)
    expect(clampStat('D', 0)).toBe(1)
    expect(clampStat('Ld', 10)).toBe(9)
    expect(clampStat('Ld', 3)).toBe(4)
    expect(clampStat('M', 0)).toBe(1)
    expect(clampStat('OC', -1)).toBe(0)
  })

  it('modifiers: perDie rolls clamp hit/wound to ±1, sum rolls keep final = dice', () => {
    const hit = makeRoll(new ScriptedRng([3, 6]), { purpose: 'hit', player: 'A', count: 2, mode: 'perDie', modifiers: [{ source: 'a', value: 2 }, { source: 'b', value: 1 }], modifierCap: 1 }, 'r:1')
    expect(hit.final).toEqual([4, 7])
    const charge = makeRoll(new ScriptedRng([3, 6]), { purpose: 'charge', player: 'A', count: 2, mode: 'sum', modifiers: [{ source: 'a', value: 2 }] }, 'r:2')
    expect(charge.final).toEqual([3, 6])
  })

  it('ScriptedRng serialises its remaining queue and throws when exhausted', () => {
    const rng = new ScriptedRng([4, 2])
    expect(rng.roll(6)).toBe(4)
    expect(rng.serialize()).toBe('scripted:2')
    const restored = restoreRng('scripted:2')
    expect(restored.roll(6)).toBe(2)
    expect(() => restored.roll(6)).toThrow(EngineInvariantError)
    expect(() => restoreRng('nope:1')).toThrow(EngineInvariantError)
  })
})

describe('engine/core reducer', () => {
  const engine = pingEngine()

  it('CORE-006 step leaves the input state untouched and returns a new object on accept', () => {
    const r0 = engine.createGame(seedSetup, 'pure', bundle)
    const before = structuredClone(r0.state)
    const legal = engine.legalActions(r0.state, r0.pending!)!
    const r1 = engine.step(r0.state, legal[0])
    expect(r1.rejection).toBeUndefined()
    expect(r1.state).not.toBe(r0.state)
    expect(r0.state).toEqual(before)
    expect(r1.state.log).toHaveLength(1)
    expect(r1.state.log[0].seq).toBe(0)
    expect(r1.state.log[0].action.seq).toBe(0)
  })

  it('CORE-007 wrong decisionId → E_WRONG_DECISION, same state reference, [ActionRejected], pending unchanged', () => {
    const r0 = engine.createGame(seedSetup, 'rej', bundle)
    const r1 = engine.step(r0.state, { type: 'confirm', player: r0.pending!.player, decisionId: 'd:999' })
    expect(r1.rejection?.code).toBe('E_WRONG_DECISION')
    expect(r1.state).toBe(r0.state)
    expect(r1.events.map((e) => e.type)).toEqual(['ActionRejected'])
    expect(r1.pending).toBe(r0.pending)
    expect(engine.validate(r0.state, { type: 'confirm', player: 'A', decisionId: 'd:999' })?.code).toBe('E_WRONG_DECISION')
  })

  it('CORE-008 action.player ≠ pending.player → E_WRONG_PLAYER', () => {
    const r0 = engine.createGame(seedSetup, 'rej', bundle)
    const other = r0.pending!.player === 'A' ? 'B' : 'A'
    const r1 = engine.step(r0.state, { type: 'confirm', player: other, decisionId: r0.pending!.id })
    expect(r1.rejection?.code).toBe('E_WRONG_PLAYER')
    expect(r1.state).toBe(r0.state)
  })

  it('CORE-009 any action after GameEnded → E_GAME_OVER; pending null', () => {
    const r0 = engine.createGame(seedSetup, 'end', bundle)
    const r1 = engine.step(r0.state, { type: 'resign', player: 'A', decisionId: r0.pending!.id })
    expect(r1.events.some((e) => e.type === 'GameEnded')).toBe(true)
    expect(r1.state.phase).toBe('ended')
    expect(r1.pending).toBeNull()
    expect(r1.state.result).toEqual({ winner: 'B', reason: 'resign', vp: { A: 0, B: 0 } })
    const r2 = engine.step(r1.state, { type: 'confirm', player: 'A', decisionId: 'd:1' })
    expect(r2.rejection?.code).toBe('E_GAME_OVER')
    expect(r2.pending).toBeNull()
    expect(engine.legalActions(r1.state, r0.pending!)).toEqual([])
  })

  it('CORE-010 moveUnit with placements missing / pos.x a string → E_SCHEMA', () => {
    const moveEngine = makeEngine({ phases: { ...pingPhases(), command: scriptedModule('command', {
      advance(ctx) {
        if (ctx.marked('asked')) return 'done'
        ctx.once('asked')
        ctx.decide({ kind: 'moveUnit', player: 'A', window: 'movement.start', canPass: false, context: { unitId: 'A:grunts', moveType: 'normal', advanceRoll: null }, constraints: emptyMoveConstraints(6) })
        return 'pending'
      },
    }) } })
    const r0 = deployAll(moveEngine, moveEngine.createGame(seedSetup, 'schema', bundle)).final
    expect(r0.pending?.kind).toBe('moveUnit')
    expect(moveEngine.legalActions(r0.state, r0.pending!)).toBeNull()
    const id = r0.pending!.id
    const missing = moveEngine.step(r0.state, { type: 'moveUnit', player: 'A', decisionId: id, unitId: 'A:grunts' } as unknown as Action)
    expect(missing.rejection?.code).toBe('E_SCHEMA')
    expect(missing.state).toBe(r0.state)
    const badPos = moveEngine.step(r0.state, { type: 'moveUnit', player: 'A', decisionId: id, unitId: 'A:grunts', placements: [{ modelId: 'A:grunts#0', pos: { x: 'a', y: 0, z: 0 } }] } as unknown as Action)
    expect(badPos.rejection?.code).toBe('E_SCHEMA')
    const wrongUnit = moveEngine.step(r0.state, { type: 'moveUnit', player: 'A', decisionId: id, unitId: 'A:walker', placements: [] })
    expect(wrongUnit.rejection?.code).toBe('E_INVALID_TARGET')
    const wrongKind = moveEngine.step(r0.state, { type: 'confirm', player: 'A', decisionId: id })
    expect(wrongKind.rejection?.code).toBe('E_NOT_AN_OPTION')
    const pass = moveEngine.step(r0.state, { type: 'pass', player: 'A', decisionId: id })
    expect(pass.rejection?.code).toBe('E_PASS_NOT_ALLOWED')
    const unknownType = moveEngine.step(r0.state, { type: 'teleport', player: 'A', decisionId: id } as unknown as Action)
    expect(unknownType.rejection?.code).toBe('E_SCHEMA')
  })

  it('CORE-011 log[seq].hashAfter equals the replayed hash at every seq of a 200-step game', () => {
    const big = pingEngine({ confirms: 4, rollOnAnswer: true })
    const start = big.createGame(seedSetup, 'log', bundle)
    const { actions, final } = autoplay(big, start)
    expect(actions.length).toBeGreaterThanOrEqual(200)
    expect(final.state.phase).toBe('ended')
    expect(final.state.log).toHaveLength(actions.length)
    // incremental replay: fold step from createGame and compare at every seq
    let r = big.createGame(seedSetup, 'log', bundle)
    for (let seq = 0; seq < actions.length; seq++) {
      r = big.step(r.state, actions[seq])
      expect(r.rejection).toBeUndefined()
      expect(r.state.hash).toBe(final.state.log[seq].hashAfter)
    }
    // and replay() at a few cut points
    for (const cut of [1, 57, 123, actions.length]) {
      expect(big.replay(seedSetup, 'log', actions.slice(0, cut), bundle).state.hash).toBe(final.state.log[cut - 1].hashAfter)
    }
  })

  it('SIM-009 replay of the action log reproduces the final hash and every logged hash', () => {
    const e = pingEngine({ confirms: 2, rollOnAnswer: true })
    const { actions, final } = autoplay(e, e.createGame(seedSetup, 'sim9', bundle))
    const again = e.replay(seedSetup, 'sim9', final.state.log.map((l) => l.action), bundle)
    expect(again.state.hash).toBe(final.state.hash)
    expect(again.state.log.map((l) => l.hashAfter)).toEqual(final.state.log.map((l) => l.hashAfter))
    expect(actions).toHaveLength(final.state.log.length)
  })

  it('CORE-012 step without rng uses state.rng; the same state + action twice → identical events and hash', () => {
    const e = pingEngine({ rollOnAnswer: true })
    const r0 = deployAll(e, e.createGame(seedSetup, 'det', bundle)).final
    const action = e.legalActions(r0.state, r0.pending!)![0]
    const a = e.step(r0.state, action)
    const b = e.step(r0.state, action)
    expect(a.events).toEqual(b.events)
    expect(a.state.hash).toBe(b.state.hash)
    expect(a.state.rng).toBe(b.state.rng)
    expect(a.state.rng).not.toBe(r0.state.rng)
    expect(a.events.some((ev) => ev.type === 'DiceRolled')).toBe(true)
  })

  it('CORE-013 ScriptedRng override is written back as scripted:<remaining>; a later step continues the queue', () => {
    const e = pingEngine({ rollOnAnswer: true })
    const r0 = deployAll(e, e.createGame(seedSetup, 'scripted', bundle)).final
    const a1 = e.legalActions(r0.state, r0.pending!)![0]
    const r1 = e.step(r0.state, a1, new ScriptedRng([5, 2, 6]))
    expect(r1.state.rng).toBe('scripted:2,6')
    expect(r1.events.filter((ev): ev is DiceRolled => ev.type === 'DiceRolled')[0].roll.dice).toEqual([5])
    const a2 = e.legalActions(r1.state, r1.pending!)![0]
    const r2 = e.step(r1.state, a2)
    expect(r2.events.filter((ev): ev is DiceRolled => ev.type === 'DiceRolled')[0].roll.dice).toEqual([2])
    expect(r2.state.rng).toBe('scripted:6')
  })

  it('SIM-010 every rng.roll inside step produces a DiceRolled die', () => {
    const e = pingEngine({ confirms: 3, rollOnAnswer: true })
    let rolls = 0
    const counting: Rng = { next: () => { rolls++; return 0.5 }, roll: (s) => { rolls++; return s === 3 ? 2 : 4 }, serialize: () => 'scripted:' }
    const r0 = deployAll(e, e.createGame(seedSetup, 'count', bundle)).final
    let r = r0
    let dice = 0
    for (let i = 0; i < 10; i++) {
      r = e.step(r.state, e.legalActions(r.state, r.pending!)![0], counting)
      for (const ev of r.events) if (ev.type === 'DiceRolled') dice += ev.roll.dice.length
    }
    expect(dice).toBe(rolls)
    expect(dice).toBe(10)
  })

  it('CORE-014 SaveFile round trip at seq 120; a different major engineVersion is refused', () => {
    const e = pingEngine({ confirms: 4, rollOnAnswer: true })
    const { results } = autoplay(e, e.createGame(seedSetup, 'save', bundle), 121)
    const at120 = results[120].state
    expect(at120.log).toHaveLength(121)
    const file = e.save(at120)
    expect(file.version).toBe(1)
    expect(file.engineVersion).toBe(ENGINE_VERSION)
    expect(file.actions).toHaveLength(121)
    const loaded = e.load(file, bundle)
    expect(loaded.state.hash).toBe(file.finalHash)
    expect(loaded.state.hash).toBe(at120.hash)
    expect(loaded.pending?.id).toBe(at120.pending?.id)
    expect(() => e.load({ ...file, engineVersion: '9.0.0' }, bundle)).toThrow(EngineInvariantError)
    expect(() => e.load({ ...file, finalHash: 'deadbeefdeadbeef' }, bundle)).toThrow(EngineInvariantError)
  })

  it('CORE-015 hotseat undo replays to seq − 1 and restores positions; vs AI, undo of a dice-rolling action is refused', () => {
    // a command module that moves a grunt one inch per confirm, rolling a die on the second confirm
    const mover = scriptedModule('command', {
      advance(ctx) {
        const n = ctx.state.phaseState.marks.filter((m) => m.startsWith('done:')).length
        if (n >= 2) return 'done'
        ctx.decide({ kind: 'confirm', player: 'A', window: 'command.start', canPass: false, context: { topic: 'info', message: 'move', data: { n } }, options: [{ id: 'ok', label: 'ok', action: { type: 'confirm', player: 'A', decisionId: '' } }] })
        return 'pending'
      },
      handle(ctx) {
        const n = ctx.state.phaseState.marks.filter((m) => m.startsWith('done:')).length
        ctx.state.phaseState.marks.push(`done:${n}`)
        const m = ctx.state.models['A:grunts#0']
        setModelPos(m, { x: m.pos.x + 1, y: 0, z: m.pos.z })
        if (n === 1) ctx.roll({ purpose: 'random', player: 'A' })
      },
    })
    const e = makeEngine({ phases: { ...pingPhases(), command: mover } })
    const create = e.createGame(seedSetup, 'undo', bundle)
    const r0 = deployAll(e, create).final
    const startX = r0.state.models['A:grunts#0'].pos.x
    const r1 = e.step(r0.state, { type: 'confirm', player: 'A', decisionId: r0.pending!.id })
    expect(r1.state.models['A:grunts#0'].pos.x).toBe(startX + 1)
    const undone = e.undo(r1.state, { allowDice: true }, bundle)
    expect(undone?.state.models['A:grunts#0'].pos.x).toBe(startX)
    expect(undone?.state.hash).toBe(r0.state.hash)
    const r2 = e.step(r1.state, { type: 'confirm', player: 'A', decisionId: r1.pending!.id })
    expect(r2.state.log[r2.state.log.length - 1].diceRollIds).toHaveLength(1)
    expect(e.undo(r2.state, { allowDice: false }, bundle)).toBeNull()
    expect(e.undo(r2.state, { allowDice: true }, bundle)?.state.hash).toBe(r1.state.hash)
    expect(e.undo(create.state, { allowDice: true }, bundle)).toBeNull()
  })

  it('CORE-016 view() hides the opponent reserves list during setup/deployment and reveals it afterwards', () => {
    const setup = makeSetup({ sides: 'rollOff', players: { A: seedSetup.players.A, B: { ...seedSetup.players.B, reserves: ['warboss'] } } })
    const r0 = engine.createGame(setup, 'view', bundle)
    expect(r0.state.phase).toBe('setup')
    const vA = engine.view(r0.state, 'A')
    expect(vA.player).toBe('A')
    expect(vA.state.setup.players.B.reserves).toEqual([])
    expect(vA.hidden.opponentReserveCount).toBe(1)
    expect(vA.lastRejection).toBeNull()
    const vB = engine.view(r0.state, 'B')
    expect(vB.state.setup.players.B.reserves).toEqual(['warboss'])
    expect(vB.hidden.opponentReserveCount).toBe(0)
    expect(r0.state.setup.players.B.reserves).toEqual(['warboss'])
    // answer the side choice → real deployment (warboss stays in Reserves) → round 1 command phase
    const sideChosen = engine.step(r0.state, engine.legalActions(r0.state, r0.pending!)![0])
    const r1 = deployAll(engine, sideChosen).final
    expect(r1.state.phase).toBe('command')
    expect(engine.view(r1.state, 'A').state.setup.players.B.reserves).toEqual(['warboss'])
    expect(engine.view(r1.state, 'A').hidden.opponentReserveCount).toBe(0)
  })

  it('CORE-017 positions written with 4 decimals are stored rounded to 1/1000"; hash identical across two runs', () => {
    const write = (x: number, z: number) => scriptedModule('command', {
      advance(ctx) {
        if (ctx.marked('asked')) return 'done'
        ctx.once('asked')
        ctx.decide({ kind: 'confirm', player: 'A', window: 'command.start', canPass: false, context: { topic: 'info', message: 'pos', data: {} }, options: [{ id: 'ok', label: 'ok', action: { type: 'confirm', player: 'A', decisionId: '' } }] })
        return 'pending'
      },
      handle(ctx) { setModelPos(ctx.state.models['A:grunts#0'], { x, y: 0, z }) },
    })
    const run = (x: number, z: number): GameState => {
      const e = makeEngine({ phases: { ...pingPhases(), command: write(x, z) } })
      const r0 = deployAll(e, e.createGame(seedSetup, 'round', bundle)).final
      return e.step(r0.state, { type: 'confirm', player: 'A', decisionId: r0.pending!.id }).state
    }
    const s1 = run(1.2345, 2.3456)
    expect(s1.models['A:grunts#0'].pos).toEqual({ x: 1.235, y: 0, z: 2.346 })
    const s2 = run(1.2345, 2.3456)
    expect(s2.hash).toBe(s1.hash)
    const s3 = run(1.2354, 2.3464)
    expect(s3.hash).toBe(s1.hash)
  })

  it('createGame validates the setup and throws EngineInvariantError', () => {
    expect(() => engine.createGame({ ...seedSetup, missionId: 'mission.nope' }, 's', bundle)).toThrow(EngineInvariantError)
    expect(() => engine.createGame({ ...seedSetup, players: { ...seedSetup.players, A: { ...seedSetup.players.A, enhancementId: 'blu.e.big' } } }, 's', bundle)).toThrow(EngineInvariantError)
    expect(() => engine.createGame({ ...seedSetup, players: { ...seedSetup.players, A: { ...seedSetup.players.A, attachments: [{ leaderRef: 'boss', bodyguardRef: 'walker' }] } } }, 's', bundle)).toThrow(EngineInvariantError)
    expect(() => engine.createGame({ ...seedSetup, players: { ...seedSetup.players, B: { ...seedSetup.players.B, enhancementId: 'blu.e.port' } } }, 's', bundle)).toThrow(/enhancementChoice/)
    expect(() => engine.createGame({ ...seedSetup, players: { ...seedSetup.players, B: { ...seedSetup.players.B, enhancementChoice: { unitRef: 'mob' } } } }, 's', bundle)).toThrow(/no enhancementChoice/)
    expect(() => engine.createGame({ ...seedSetup, players: { ...seedSetup.players, A: { ...seedSetup.players.A, reserves: ['walker'] } } }, 's', bundle)).toThrow(/Deep Strike/)
    expect(() => engine.createGame(seedSetup, 's')).toThrow(/data bundle/)
    const ok = engine.createGame({ ...seedSetup, players: { ...seedSetup.players, B: { ...seedSetup.players.B, enhancementId: 'blu.e.port', enhancementChoice: { unitRef: 'mob' } } } }, 's', bundle)
    expect(ok.state.units['B:mob'].deepStrikeWith).toBe('B:warboss')
    expect(ok.state.units['B:warboss'].deepStrikeWith).toBe('B:mob')
  })

  it('createGame resolves runtime data: models, wargear, bases, leaders, enhancement bearer, objectives, board', () => {
    const r = engine.createGame(seedSetup, 'data', bundle)
    const s = r.state
    expect(Object.keys(s.units)).toEqual(['A:boss', 'A:grunts', 'A:walker', 'B:warboss', 'B:mob', 'B:brute', 'B:kopta'])
    expect(s.units['A:grunts'].models).toHaveLength(5)
    expect(s.units['B:mob'].models).toHaveLength(10)
    expect(s.units['B:mob'].startingStrength).toBe(10)
    expect(s.models['A:grunts#1'].weapons).toEqual(['red.w.cannon', 'red.w.blade'])
    expect(s.models['A:grunts#2'].weapons).toEqual(['red.w.gun', 'red.w.blade'])
    expect(s.models['A:grunts#0'].base.radius).toBeCloseTo(0.63, 2)
    expect(s.models['A:walker#0'].base).toMatchObject({ shape: 'oval' })
    expect(s.models['A:walker#0'].base.radius2).toBeCloseTo(1.181, 3)
    expect(s.models['B:mob#0'].woundsRemaining).toBe(2)
    expect(s.models['B:mob#1'].woundsRemaining).toBe(1)
    expect(s.units['A:boss'].bodyguardUnitId).toBe('A:grunts')
    expect(s.units['A:grunts'].attachedLeaderId).toBe('A:boss')
    expect(s.units['A:boss'].isWarlord).toBe(true)
    expect(s.units['A:boss'].enhancementId).toBe('red.e.sharp')
    expect(s.abilities['red.e.sharp.effect']).toMatchObject({ source: 'enhancement', bearerModelId: 'A:boss#0' })
    expect(s.abilities['red.a.lead'].source).toBe('leader')
    expect(s.abilities['red.a.rule'].source).toBe('core')
    expect(Object.keys(s.stratagems).sort()).toEqual(['blu.s.smash', 'core.s.command-reroll', 'core.s.fire-overwatch', 'red.s.hold'])
    expect(s.weapons['red.w.cannon'].A).toBe('D6')
    expect(s.players.A.side).toBe('attacker')
    expect(s.objectives['obj-home-a'].home).toBe('A')
    expect(s.objectives['obj-home-b'].home).toBe('B')
    expect(s.board.pieces['ruin-1'].footprint[0]).toEqual({ x: -9, z: 1 })
    expect(s.board.pieces['ruin-1'].walls[0].a).toEqual({ x: -9, z: 1 })
    expect(s.players.A.cp).toBe(0)
    expect(s.mission.secondaries.A[0].rule).toBe('holdMore')
    expect(Object.isFrozen(s.datasheets['red.grunts'])).toBe(true)
    expect(r.events[0].type).toBe('GameCreated')
    expect(r.events[0].seq).toBe(-1)
  })
})
