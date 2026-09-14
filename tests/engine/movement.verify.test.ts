// Adversarial verification of the Command/Movement modules (docs/spec/12-rules-test-checklist.md MOVE-*/CMD-*).
// Each test targets a suspected deviation from 10-rules §4/§5; drives movementModule directly like movement.test.ts.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, horizontalGap, removeModel, setModelPos, unitModels,
  type Action, type EngineContext, type GameEvent, type GameState, type ModuleTable, type PendingDecision, type Rejection,
} from '../../src/engine'
import type { DataBundle } from '../../src/data/types'
import { movementModule, resolveSurgeMove } from '../../src/engine/phases/movement'
import { transportService } from '../../src/engine/transports'
import { commandModule } from '../../src/engine/phases/command'
import { hookService } from '../../src/engine/hooks-impl'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems, withBundle } from '../fixtures'

const DID = ''
const A = 'A:grunts', ABoss = 'A:boss', AWalker = 'A:walker'
const B = 'B:mob', BBrute = 'B:brute', BKopta = 'B:kopta', BWarboss = 'B:warboss'

function start(overrides: Parameters<typeof makeSetup>[0] = {}, dice: number[] = [], data: DataBundle = bundle) {
  const state = createGameState(makeSetup(overrides), data, 'fixture', ENGINE_VERSION)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  movementModule.enter(ctx)
  return { state, ctx, events }
}

function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) movementModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = movementModule.validate ? movementModule.validate(ctx.state, action, pending) : null
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = movementModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return movementModule.advance(ctx)
}

function reject(ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) movementModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  return movementModule.validate ? movementModule.validate(ctx.state, action, pending) : null
}

function declare(ctx: EngineContext, unitId: string, moveType: 'normal' | 'advance' | 'fallBack' | 'stationary') {
  const player = ctx.state.units[unitId].player
  act(ctx, { type: 'chooseUnitToActivate', player, decisionId: DID, unitId })
  return act(ctx, { type: 'declareMove', player, decisionId: DID, unitId, moveType })
}

function toReinforcements(state: GameState, round = 2) {
  state.round = round
  state.step = 'reinforcements'
}

const noAttach = () => ({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })

describe('movement verify — Desperate Escape', () => {
  it('MOVE-011-coherency a Desperate Escape casualty that splits the unit must not crash the engine', () => {
    const { ctx } = start(noAttach(), [3, 1, 3])
    removeModel(ctx.state, `${A}#4`)
    removeModel(ctx.state, `${A}#3`)
    // 32 mm bases 2.5" apart centre-to-centre (gap 1.24" — coherent); removing the middle leaves a 3.74" gap
    placeUnit(ctx.state, A, [{ x: 2.3, y: 0, z: 0 }, { x: 4.8, y: 0, z: 0 }, { x: 7.3, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: 1, y: 0, z: -0.9 }])
    ctx.state.units[A].battleShocked = true // every model tests, no crossing needed
    declare(ctx, A, 'fallBack')
    const placements = unitModels(ctx.state, A).map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: m.pos.z + 5 } }))
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements })
    expect(ctx.state.pending?.kind).toBe('chooseOption')
    expect(() => act(ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: `${A}#1` })).not.toThrow()
  })

  it('MOVE-011-leader Desperate Escape destroying the whole bodyguard: the leader detaches and still makes its move', () => {
    // R-5.6 / R-4.6b: a Battle-shocked attached unit rolls for all 6 models (Leader included); five 1s and a 6 give
    // exactly five casualties — the whole bodyguard — leaving the Leader alive to make its move
    const { ctx } = start({}, [1, 1, 1, 1, 1, 6])
    const xs = [0, 1.76, 3.52, 5.28, 7.04]
    placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
    placeUnit(ctx.state, ABoss, [{ x: -1.8, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: 0, y: 0, z: -1.8 }])
    ctx.state.units[A].battleShocked = true
    ctx.state.units[ABoss].battleShocked = true
    declare(ctx, A, 'fallBack')
    const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements: all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: 5 } })) })
    for (let i = 0; i < 5 && ctx.state.pending?.kind === 'chooseOption'; i++) {
      const grunt = ctx.state.units[A].models[ctx.state.units[A].models.length - 1] // far end first: keeps the chain coherent
      if (!grunt) break
      act(ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: grunt })
    }
    expect(ctx.state.units[A].location).toBe('destroyed')
    expect(ctx.state.units[ABoss].location).toBe('board')
    expect.soft(ctx.state.units[ABoss].bodyguardUnitId).toBeNull()
    expect.soft(ctx.state.models[`${ABoss}#0`].pos.z).toBe(5)
  })

  it('MOVE-011-contact a model in base contact that Falls Back straight away without crossing takes no test', () => {
    const { ctx, events } = start(noAttach(), [])
    const rb = ctx.state.models[`${ABoss}#0`].base.radius, re = ctx.state.models[`${BWarboss}#0`].base.radius
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 5 }])
    placeUnit(ctx.state, BWarboss, [{ x: rb + re, y: 0, z: 5 }])
    declare(ctx, ABoss, 'fallBack')
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -5, y: 0, z: 5 } }] })
    expect(events.some((e: GameEvent) => e.type === 'DesperateEscapeRolled')).toBe(false)
    expect(ctx.state.models[`${ABoss}#0`].pos.x).toBe(-5)
  })
})

describe('movement verify — Normal/Advance restrictions', () => {
  it('MOVE-019-er a FLY model making a Normal move may not end within Engagement Range', () => {
    const { ctx } = start(noAttach())
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BKopta, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: 8, y: 0, z: 12 }])
    declare(ctx, BKopta, 'normal')
    // kopta oval 60x35 mm; end with its centre 2.2" from the boss centre → base gap well under 1"
    const bad = reject(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BKopta, placements: [{ modelId: `${BKopta}#0`, pos: { x: 5.8, y: 0, z: 12 } }] })
    expect(bad?.code).toBe('E_ENGAGEMENT')
  })

  it('MOVE-003-neg a MONSTER path may not cross a friendly VEHICLE', () => {
    const { ctx } = start(noAttach())
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BBrute, [{ x: -6, y: 0, z: 12 }])
    placeUnit(ctx.state, BKopta, [{ x: -2, y: 0, z: 12 }])
    declare(ctx, BBrute, 'normal')
    const bad = reject(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BBrute, placements: [{ modelId: `${BBrute}#0`, pos: { x: 2, y: 0, z: 12 } }] })
    expect(bad?.code).toBe('E_OVERLAP')
  })

  it('MOVE-018 INFANTRY on an upper floor: fully on → legal, overhanging → rejected; VEHICLE on upper floor → rejected', () => {
    const { ctx } = start(noAttach())
    placeUnit(ctx.state, ABoss, [{ x: -4.5, y: 0, z: 4 }])
    declare(ctx, ABoss, 'normal')
    const over = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -3.2, y: 3, z: 4 }, path: [{ x: -4.5, y: 0, z: 4 }, { x: -4.5, y: 3, z: 4 }, { x: -3.2, y: 3, z: 4 }] }] })
    expect(over).not.toBeNull()
    const ok = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -5, y: 3, z: 4 }, path: [{ x: -4.5, y: 0, z: 4 }, { x: -4.5, y: 3, z: 4 }, { x: -5, y: 3, z: 4 }] }] })
    expect(ok).toBeNull()
    const h2 = start(noAttach())
    placeUnit(h2.ctx.state, AWalker, [{ x: -6, y: 0, z: 4 }])
    declare(h2.ctx, AWalker, 'normal')
    const walker = reject(h2.ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: -6, y: 3, z: 4 } }] })
    expect(walker).not.toBeNull()
  })
})

describe('movement verify — Deep Strike arrival', () => {
  it('MOVE-021-terrain a Deep Strike arrival may not be set up inside a solid crate footprint', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    toReinforcements(ctx.state)
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('deployUnit')
    const bad = reject(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 5, y: 0, z: -10.5 } }] })
    expect(bad).not.toBeNull()
  })

  it('MOVE-021-air a Deep Strike arrival may not be set up floating in mid-air', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    toReinforcements(ctx.state)
    movementModule.advance(ctx)
    const bad = reject(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 18, y: 7, z: -12 } }] })
    expect(bad).not.toBeNull()
  })

  it('MOVE-022 Deep Strike placement breaking coherency → E_COHERENCY; unit may stay in Reserves', () => {
    const data = withBundle((b) => { b.datasheets['red.grunts'].coreAbilities = [{ ability: 'DEEP_STRIKE' }] })
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['grunts'], attachments: [] }), B: makePlayerB() } }, [], data)
    placeUnit(ctx.state, ABoss, [{ x: -18, y: 0, z: -12 }]) // harness default leaves undeployed units in 'reserves'
    toReinforcements(ctx.state)
    movementModule.advance(ctx)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(pending.context.unitIds).toContain(A)
    // z=12: clear of every terrain piece (ruin/crate/crater all sit at z <= 7) — MOVE-021-terrain's canEndAt check
    // must not pre-empt this test's E_COHERENCY with an unrelated E_OVERLAP from solid terrain at the old z=-12 spot.
    const spread = unitModels(ctx.state, A).map((m, i) => ({ modelId: m.id, pos: { x: -2 + i * 4, y: 0, z: 12 } }))
    expect(reject(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: A, placements: spread })?.code).toBe('E_COHERENCY')
    act(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: A, placements: [], toReserves: true } as Action)
    expect(ctx.state.units[A].location).toBe('reserves')
  })

  it('MOVE-021-attached a Leader and its Bodyguard in Reserves arrive as one unit (single deployUnit for both)', () => {
    const data = withBundle((b) => { b.datasheets['red.grunts'].coreAbilities = [{ ability: 'DEEP_STRIKE' }] })
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss', 'grunts'] }), B: makePlayerB() } }, [], data)
    expect(ctx.state.units[ABoss].bodyguardUnitId).toBe(A)
    toReinforcements(ctx.state)
    movementModule.advance(ctx)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(pending.kind).toBe('deployUnit')
    expect([...pending.context.unitIds].sort()).toEqual([A, ABoss].sort())
  })
})

describe('movement verify — transports and surge', () => {
  it('MOVE-029-3in a unit more than 3" from the transport cannot embark', () => {
    const data = withBundle((b) => { b.datasheets['red.walker'].keywords = [...b.datasheets['red.walker'].keywords, 'TRANSPORT:10'] })
    const { ctx } = start(noAttach(), [], data)
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 0 }])
    placeUnit(ctx.state, A, { x: 15, z: 0 })
    expect(transportService.capacity(ctx.state, AWalker)).toBe(10)
    expect(transportService.canEmbark(ctx.state, A, AWalker)).toBe(false)
  })

  it('MOVE-027-closest a surge move ends as close as possible to the target (R-5.9), not a halved fraction', () => {
    const { ctx } = start(noAttach())
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 12 }])
    placeUnit(ctx.state, BWarboss, [{ x: 0, y: 0, z: 12 }])
    expect(resolveSurgeMove(ctx, ABoss, 8, BWarboss)).toBe(true)
    const gap = horizontalGap(
      { pos: ctx.state.models[`${ABoss}#0`].pos, facing: 0, base: ctx.state.models[`${ABoss}#0`].base },
      { pos: ctx.state.models[`${BWarboss}#0`].pos, facing: 0, base: ctx.state.models[`${BWarboss}#0`].base },
    )
    expect(gap).toBeGreaterThan(1)
    expect(gap).toBeLessThan(1.5) // 8.43" start gap, 8" allowance → best legal end is just outside 1"
  })
})

// ---------- round 2 adversarial additions ----------
describe('movement verify r2 — path and Fall Back restrictions', () => {
  it('MOVE-004-path a path that leaves the board mid-move and comes back is rejected', () => {
    const { ctx } = start(noAttach())
    placeUnit(ctx.state, ABoss, [{ x: 20, y: 0, z: 0 }])
    declare(ctx, ABoss, 'normal')
    // 2.5" to x=22.5 (centre off the 22" edge) then 3.2" back on: 5.7" <= M6, end position wholly on the board
    const bad = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 20, y: 0, z: 2 }, path: [{ x: 20, y: 0, z: 0 }, { x: 22.5, y: 0, z: 0 }, { x: 20, y: 0, z: 2 }] }] })
    expect(bad).not.toBeNull()
  })

  it('MOVE-003-fallback a MONSTER Falling Back may still not pass through a friendly VEHICLE (R-5.2 applies to Fall Back)', () => {
    const { ctx } = start(noAttach())
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BBrute, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 10 }]) // gap ~0.03" -> engaged
    placeUnit(ctx.state, BKopta, [{ x: 3, y: 0, z: 12 }])
    declare(ctx, BBrute, 'fallBack')
    const bad = reject(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BBrute, placements: [{ modelId: `${BBrute}#0`, pos: { x: 6.5, y: 0, z: 12 } }] })
    expect(bad?.code).toBe('E_OVERLAP')
  })

  it('MOVE-019-mixedfly an attached unit with a FLY Leader and non-FLY Bodyguard: bodyguard paths may not cross enemies', () => {
    const xs = [0, 1.76, 3.52, 5.28, 7.04]
    const setupAndTry = (data: DataBundle) => {
      const { ctx } = start({}, [], data)
      placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
      placeUnit(ctx.state, ABoss, [{ x: -1.8, y: 0, z: 0 }])
      placeUnit(ctx.state, BWarboss, [{ x: 3.52, y: 0, z: -3 }])
      declare(ctx, A, 'normal')
      const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
      return reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements: all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: -5.7 } })) })
    }
    expect(setupAndTry(bundle)).not.toBeNull() // control: nobody flies
    const flyBoss = withBundle((b) => { b.datasheets['red.boss'].keywords = [...b.datasheets['red.boss'].keywords, 'FLY'] })
    expect(setupAndTry(flyBoss)).not.toBeNull()
  })
})

describe('movement verify r2 — Desperate Escape with attached Leaders', () => {
  const xs = [0.3, 2.06, 3.82, 5.58, 7.34]

  it('MOVE-013-leader a Battle-shocked Leader+Bodyguard unit Falling Back rolls one die for EVERY model (Leader included)', () => {
    const { ctx, events } = start({}, [6, 6, 6, 6, 6, 6])
    placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
    placeUnit(ctx.state, ABoss, [{ x: -1.8, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: -1.8, y: 0, z: -1.62 }])
    ctx.state.units[A].battleShocked = true
    ctx.state.units[ABoss].battleShocked = true
    declare(ctx, A, 'fallBack')
    const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements: all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: 3 } })) })
    const de = events.find((e: GameEvent) => e.type === 'DesperateEscapeRolled') as Extract<GameEvent, { type: 'DesperateEscapeRolled' }> | undefined
    expect(de?.dice.length).toBe(6)
  })

  it('MOVE-011-leadercross a Leader whose own path crosses an enemy base takes a Desperate Escape test', () => {
    const { ctx, events } = start({}, [6])
    placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
    placeUnit(ctx.state, ABoss, [{ x: -1.8, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: -1.8, y: 0, z: -1.62 }])
    declare(ctx, A, 'fallBack')
    const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements: all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: -4.4 } })) })
    const de = events.find((e: GameEvent) => e.type === 'DesperateEscapeRolled') as Extract<GameEvent, { type: 'DesperateEscapeRolled' }> | undefined
    expect(de?.dice.length).toBe(1)
  })
})

describe('movement verify r2 — vertical measurement', () => {
  it('MOVE-020 FLY measures the straight 3D line onto an upper floor (10" h + 3" v = 10.44" <= M12)', () => {
    const { ctx } = start(noAttach())
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BKopta, [{ x: -16, y: 0, z: 4 }])
    declare(ctx, BKopta, 'normal')
    const r = reject(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BKopta, placements: [{ modelId: `${BKopta}#0`, pos: { x: -6, y: 3, z: 4 } }] })
    expect(r).toBeNull()
  })

  it('MOVE-015-diagonal a non-FLY model climbing on a diagonal segment still pays horizontal + vertical', () => {
    const { ctx } = start(noAttach())
    placeUnit(ctx.state, ABoss, [{ x: -12.5, y: 0, z: 4 }])
    declare(ctx, ABoss, 'normal')
    // 4.5" h + 3" v = 7.5" > M6 (straight 3D would be 5.41")
    const r = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -8, y: 3, z: 4 } }] })
    expect(r?.code).toBe('E_OUT_OF_RANGE')
  })
})

describe('movement verify r2 — arrivals and transports', () => {
  it('MOVE-021-edge a Deep Strike arrival overhanging the board edge is rejected', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    toReinforcements(ctx.state)
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('deployUnit')
    const bad = reject(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 21.5, y: 0, z: 0 } }] })
    expect(bad).not.toBeNull()
  })

  it('MOVE-029-enemy a unit cannot embark in an ENEMY transport (R-5.17 friendly TRANSPORT only)', () => {
    const data = withBundle((b) => { b.datasheets['blu.brute'].keywords = [...b.datasheets['blu.brute'].keywords, 'TRANSPORT:10'] })
    const { ctx } = start(noAttach(), [], data)
    placeUnit(ctx.state, BBrute, [{ x: 0, y: 0, z: 0 }])
    placeUnit(ctx.state, ABoss, [{ x: 2.5, y: 0, z: 0 }])
    expect(transportService.capacity(ctx.state, BBrute)).toBe(10)
    expect(transportService.canEmbark(ctx.state, ABoss, BBrute)).toBe(false)
  })
})

describe('command verify r2 — CP cap and shock expiry', () => {
  it('CMD-002 a second non-automatic CP gain in the same round is discarded; the Command-phase CP does not use up the cap', () => {
    const state = createGameState(makeSetup(), bundle, 'fixture', ENGINE_VERSION)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
    const { ctx } = createContext(state, new ScriptedRng([]), modules)
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(ctx.state.players.A.cp).toBe(1)
    expect(hookService.gainCp(ctx, 'A', 1, 'supplyLines')).toBe(1)
    expect(hookService.gainCp(ctx, 'A', 1, 'clashOfPatrols')).toBe(0)
    expect(ctx.state.players.A.cp).toBe(2)
  })

  it('CMD-015-second second player unit shocked during the first player\'s turn recovers at its own Command phase the same round', () => {
    const state = createGameState(makeSetup(), bundle, 'fixture', ENGINE_VERSION)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
    const { ctx, events } = createContext(state, new ScriptedRng([1, 1]), modules)
    state.round = 2
    state.firstPlayer = 'A'
    state.activePlayer = 'A'
    placeUnit(state, BWarboss, [{ x: 0, y: 0, z: 10 }])
    expect(hookService.battleShockTest(ctx, BWarboss, 'test')).toBe(false)
    expect(state.units[BWarboss].battleShocked).toBe(true)
    state.activePlayer = 'B'
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(events.some((e: GameEvent) => e.type === 'BattleShockRecovered' && e.unitId === BWarboss)).toBe(true)
    expect(state.units[BWarboss].battleShocked).toBe(false)
  })
})

void setModelPos

// ---------- round 3 adversarial additions ----------
const transportData = () => withBundle((b) => { b.datasheets['red.walker'].keywords = [...b.datasheets['red.walker'].keywords, 'TRANSPORT:10'] })

describe('movement verify r3 — windows', () => {
  it('MOVE-036-unitMoved an actually-opened movement.unitMoved window (Fire Overwatch) does not strand/crash the phase', () => {
    const state = createGameState(makeSetup(noAttach()), bundle, 'fixture', ENGINE_VERSION)
    const stratagems = recordingStratagems(['movement.unitMoved'])
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems } }
    const { ctx } = createContext(state, new ScriptedRng([]), modules)
    movementModule.enter(ctx)
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 12 }])
    placeUnit(ctx.state, AWalker, [{ x: 12, y: 0, z: 12 }])
    declare(ctx, ABoss, 'normal')
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -6, y: 0, z: 12 } }] })
    expect(ctx.state.pending?.kind).toBe('stratagemWindow')
    const sw = ctx.state.pending as PendingDecision
    ctx.state.pending = null
    stratagems.handle(ctx, { type: 'pass', player: sw.player, decisionId: DID }, sw)
    const pendingOf = (st: GameState): PendingDecision | null => st.pending
    let threw: unknown = null
    try {
      movementModule.advance(ctx)
      const p = pendingOf(ctx.state)
      if (p && p.kind === 'stratagemWindow') { ctx.state.pending = null; stratagems.handle(ctx, { type: 'pass', player: p.player, decisionId: DID }, p); movementModule.advance(ctx) }
    } catch (e) { threw = e }
    expect(threw).toBeNull()
    expect(pendingOf(ctx.state)?.kind).toBe('chooseUnitToActivate')
  })
})

describe('movement verify r3 — transports', () => {
  it('MOVE-026-embark a unit that arrived from Reserves this phase cannot then embark', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } }, [], transportData())
    placeUnit(ctx.state, AWalker, [{ x: 15, y: 0, z: 12 }])
    ctx.state.units[AWalker].turn.moveType = 'stationary'
    ctx.state.phaseState.activated = [AWalker]
    toReinforcements(ctx.state)
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('deployUnit')
    act(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 11, y: 0, z: 12 } }] })
    expect(ctx.state.units[ABoss].location).toBe('board')
    expect(transportService.canEmbark(ctx.state, ABoss, AWalker)).toBe(false)
  })

  it('MOVE-029-stationary a unit that Remained Stationary (made no Normal/Advance/Fall Back move) cannot embark', () => {
    const { ctx } = start(noAttach(), [], transportData())
    placeUnit(ctx.state, AWalker, [{ x: 15, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: 11, y: 0, z: 12 }])
    declare(ctx, ABoss, 'stationary')
    expect(ctx.state.units[ABoss].turn.moveType).toBe('stationary')
    expect(transportService.canEmbark(ctx.state, ABoss, AWalker)).toBe(false)
  })

  it('MOVE-025-embarked units embarked in a transport still in Reserves after round 3 are destroyed with it (R-5.14)', () => {
    const { ctx } = start(noAttach(), [], transportData())
    expect(ctx.state.units[AWalker].location).toBe('reserves')
    transportService.embark(ctx.state, ABoss, AWalker)
    toReinforcements(ctx.state, 4)
    movementModule.advance(ctx)
    expect(ctx.state.units[AWalker].location).toBe('destroyed')
    expect(ctx.state.units[ABoss].location).toBe('destroyed')
  })

  it('MOVE-031-destroyed passengers of a destroyed transport are not left embarked in limbo (R-5.20)', () => {
    const { ctx } = start(noAttach(), [], transportData())
    placeUnit(ctx.state, AWalker, [{ x: 15, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: 11, y: 0, z: 12 }])
    transportService.embark(ctx.state, ABoss, AWalker)
    removeModel(ctx.state, `${AWalker}#0`)
    expect(ctx.state.units[AWalker].location).toBe('destroyed')
    toReinforcements(ctx.state, 4)
    movementModule.advance(ctx)
    // either emergency-disembarked onto the board or destroyed — never still an embarked passenger of a dead transport
    expect(ctx.state.units[ABoss].location).not.toBe('reserves')
  })
})

describe('movement verify r3 — Desperate Escape / surge', () => {
  it('MOVE-013-fly a Battle-shocked FLY unit Falling Back still takes a Desperate Escape test for every model (R-4.6b)', () => {
    const { ctx, events } = start(noAttach(), [6])
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BKopta, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: 2, y: 0, z: 12 }])
    ctx.state.units[BKopta].battleShocked = true
    declare(ctx, BKopta, 'fallBack')
    act(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BKopta, placements: [{ modelId: `${BKopta}#0`, pos: { x: -6, y: 0, z: 12 } }] })
    const de = events.find((e: GameEvent) => e.type === 'DesperateEscapeRolled') as Extract<GameEvent, { type: 'DesperateEscapeRolled' }> | undefined
    expect(de?.dice.length).toBe(1)
  })

  it('MOVE-027-path a surge move may not pass through an intervening enemy model', () => {
    const { ctx } = start(noAttach())
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 12 }])
    placeUnit(ctx.state, BBrute, [{ x: -5, y: 0, z: 12 }])
    placeUnit(ctx.state, BWarboss, [{ x: 5, y: 0, z: 12 }])
    resolveSurgeMove(ctx, ABoss, 12, BWarboss)
    expect(ctx.state.models[`${ABoss}#0`].pos.x).toBeLessThan(-5)
  })
})

describe('command verify r3 — forced tests and expiry', () => {
  it('CMD-017 a -1 modifier to a forced Battle-shock test: 3+4-1=6 vs Ld 6 passes; 3+3-1=5 fails', () => {
    const state = createGameState(makeSetup(), bundle, 'fixture', ENGINE_VERSION)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
    const { ctx } = createContext(state, new ScriptedRng([3, 4, 3, 3]), modules)
    placeUnit(state, BWarboss, [{ x: 0, y: 0, z: 10 }])
    expect(hookService.battleShockTest(ctx, BWarboss, 'bellow', -1)).toBe(true)
    expect(state.units[BWarboss].battleShocked).toBe(false)
    expect(hookService.battleShockTest(ctx, BWarboss, 'bellow', -1)).toBe(false)
    expect(state.units[BWarboss].battleShocked).toBe(true)
  })

  it('CMD-015-first first player unit shocked in the second player\'s turn is not recovered in that player\'s Command phase, only at its own next one', () => {
    const state = createGameState(makeSetup(noAttach()), bundle, 'fixture', ENGINE_VERSION)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
    const { ctx } = createContext(state, new ScriptedRng([1, 1]), modules)
    state.round = 2
    state.firstPlayer = 'A'
    state.activePlayer = 'B'
    placeUnit(state, ABoss, [{ x: 0, y: 0, z: -10 }])
    expect(hookService.battleShockTest(ctx, ABoss, 'test')).toBe(false)
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(state.units[ABoss].battleShocked).toBe(true)
    state.round = 3
    state.activePlayer = 'A'
    state.phaseState.marks = []
    state.phaseState.windowsOpened = []
    commandModule.enter(ctx)
    commandModule.advance(ctx)
    expect(state.units[ABoss].battleShocked).toBe(false)
  })
})
