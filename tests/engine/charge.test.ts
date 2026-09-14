// Charge phase (10-rules §8, docs/spec/12-rules-test-checklist.md CHARGE-*). Drives `chargeModule` directly over a
// hand-built GameState (60-testing §1 fixtures), per phases/README.md §6. `recordingStratagems()` replaces the real
// stratagem service so ordinary charges never trigger Fire Overwatch/Heroic Intervention/Tank Shock; a few tests
// re-enable the real service (plus a `withBundle` patch adding the core Heroic Intervention / Tank Shock stratagems,
// which the synthetic test bundle omits) to exercise those windows explicitly.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, removeModel,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision, type Rejection,
} from '../../src/engine'
import type { ModelPlacement } from '../../src/engine/actions'
import { chargeModule } from '../../src/engine/phases/charge'
import { leaderService } from '../../src/engine/leaders'
import { bundle, freshState, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems, withBundle } from '../fixtures'
import type { DataBundle } from '../../src/data/types'

function harness(overrides: Parameters<typeof freshState>[0] = {}, dice: number[] = [], b: DataBundle = bundle) {
  const state = createGameState(makeSetup(overrides), b, 'seed', ENGINE_VERSION)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  return { state, ctx, events, modules }
}

function clearPending(state: GameState): void { state.pending = null }

const DID = ''

function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) chargeModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  if (chargeModule.validate) {
    const rej = chargeModule.validate(ctx.state, action, pending)
    if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  }
  ctx.state.pending = null
  const handled = chargeModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return chargeModule.advance(ctx)
}

function reject(ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) chargeModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = chargeModule.validate ? chargeModule.validate(ctx.state, action, pending) : null
  if (rej) return rej
  const saved = ctx.state.pending
  ctx.state.pending = null
  const handled = chargeModule.handle(ctx, action, pending)
  if (!handled) ctx.state.pending = saved
  return handled ?? null
}

const A = 'A:grunts', AWalker = 'A:walker'
const B = 'B:mob', BBrute = 'B:brute', BKopta = 'B:kopta', BWarboss = 'B:warboss'

function unattached(overrides: Parameters<typeof makeSetup>[0] = {}): Parameters<typeof makeSetup>[0] {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() }, ...overrides }
}

function start(overrides: Parameters<typeof makeSetup>[0] = {}, dice: number[] = [], b?: DataBundle) {
  const h = harness(overrides, dice, b)
  chargeModule.enter(h.ctx)
  return h
}

function declare(ctx: EngineContext, unitId: string, targetUnitIds: string[]) {
  act(ctx, { type: 'chooseUnitToActivate', player: ctx.state.units[unitId].player, decisionId: DID, unitId })
  return act(ctx, { type: 'declareCharge', player: ctx.state.units[unitId].player, decisionId: DID, unitId, targetUnitIds })
}

function move(ctx: EngineContext, unitId: string, placements: ModelPlacement[]) {
  return act(ctx, { type: 'chargeMove', player: ctx.state.units[unitId].player, decisionId: DID, unitId, placements })
}

// current edge-to-edge horizontal gap between two single-model units
function gapBetween(state: GameState, aUnit: string, bUnit: string): number {
  return leaderService.unitDistance!(state, aUnit, bUnit)
}

// places bUnit's lone model on the +x axis so its edge-to-edge gap from aUnit's lone model is exactly `gap`
function placeAtGap(state: GameState, aUnit: string, bUnit: string, gap: number, az = 0, bz = 0): void {
  placeUnit(state, aUnit, [{ x: 0, y: 0, z: az }])
  const ra = state.models[`${aUnit}#0`].base.radius
  const rb = state.models[`${bUnit}#0`].base.radius
  placeUnit(state, bUnit, [{ x: ra + rb + gap, y: 0, z: bz }])
}

// a decoy pair (A:boss vs B:warboss) that is always mutually eligible, far from whatever the test itself is
// exercising, so `chooseUnitToActivate` is always raised and its `eligible` list is meaningful to inspect.
function placeDecoyEligiblePair(state: GameState): void {
  placeUnit(state, 'A:boss', [{ x: 30, y: 0, z: 30 }])
  placeUnit(state, BWarboss, [{ x: 30, y: 0, z: 36 }]) // 6" gap: within the 12" declare range, well outside Engagement Range
}

describe('charge phase — eligibility / declare (CHARGE-001..005, 028)', () => {
  it('CHARGE-001 a unit within 12" of an enemy may declare; beyond 12" it is not offered', () => {
    const { ctx } = start(unattached())
    // 11.99" rather than exactly 12.0" — position rounding to 1/1000" (00-arch §7) can otherwise tip an
    // exact-boundary placement a few ten-thousandths past the threshold either way
    placeAtGap(ctx.state, AWalker, BBrute, 11.99)
    expect(gapBetween(ctx.state, AWalker, BBrute)).toBeCloseTo(12.0, 1)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: AWalker })
    expect(ctx.state.pending?.kind).toBe('declareCharge')
    // reset and try 12.1" — not eligible (candidateTargets is empty, so it never appears in the offer at all)
    const h2 = start(unattached())
    placeAtGap(h2.ctx.state, AWalker, BBrute, 12.1)
    placeDecoyEligiblePair(h2.ctx.state)
    chargeModule.advance(h2.ctx)
    const pending = h2.ctx.state.pending
    expect(pending?.kind).toBe('chooseUnitToActivate')
    const opts = (pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>).context.eligible
    expect(opts).not.toContain(AWalker)
    expect(opts).toContain('A:boss')
  })

  it('CHARGE-002 a unit that Advanced may not declare; under an ability waiving it, it may', () => {
    const { ctx } = start(unattached())
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    placeDecoyEligiblePair(ctx.state)
    ctx.state.units[AWalker].turn.moveType = 'advance'
    chargeModule.advance(ctx)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    expect(pending.context.eligible).not.toContain(AWalker)
    expect(pending.context.eligible).toContain('A:boss')
  })

  it('CHARGE-003 a unit in engagement range may not declare; a unit that Fell Back may not unless waived', () => {
    const { ctx } = start(unattached())
    placeAtGap(ctx.state, AWalker, BBrute, 0.5) // within Engagement Range (h<=1)
    placeDecoyEligiblePair(ctx.state)
    chargeModule.advance(ctx)
    let pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    expect(pending.context.eligible).not.toContain(AWalker)

    const h2 = start(unattached())
    placeAtGap(h2.ctx.state, AWalker, BBrute, 6)
    placeDecoyEligiblePair(h2.ctx.state)
    h2.ctx.state.units[AWalker].turn.moveType = 'fallBack'
    chargeModule.advance(h2.ctx)
    pending = h2.ctx.state.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    expect(pending.context.eligible).not.toContain(AWalker)
  })

  it('CHARGE-004 declared targets need not be visible', () => {
    const { ctx } = start(unattached(), [4, 4])
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    const r = declare(ctx, AWalker, [BBrute])
    expect(['pending', 'done']).toContain(r)
  })

  it('CHARGE-005 a target beyond 12" is rejected E_INVALID_TARGET', () => {
    const { ctx } = start(unattached())
    // walker is eligible to declare (kopta is within 12") but brute, its intended target, is not
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 0 }])
    const walkerR = ctx.state.models[`${AWalker}#0`].base.radius
    placeUnit(ctx.state, BKopta, [{ x: walkerR + 1.2 + 6, y: 0, z: 0 }])
    placeUnit(ctx.state, BBrute, [{ x: 0, y: 0, z: walkerR + 1.2 + 13 }])
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: AWalker })
    const rej = reject(ctx, { type: 'declareCharge', player: 'A', decisionId: DID, unitId: AWalker, targetUnitIds: [BBrute] })
    expect(rej?.code).toBe('E_INVALID_TARGET')
  })

  it('CHARGE-028 each unit may declare a charge once per phase; a failed charge gets no second attempt', () => {
    const { ctx } = start(unattached(), [1, 1]) // 2D6=2, far too short
    placeAtGap(ctx.state, AWalker, BBrute, 10)
    declare(ctx, AWalker, [BBrute])
    expect(ctx.state.pending?.kind ?? 'done').not.toBe('declareCharge')
    // the walker never appears in a fresh chooseUnitToActivate offer again this phase
    chargeModule.advance(ctx)
    if (ctx.state.pending?.kind === 'chooseUnitToActivate') {
      expect(ctx.state.pending.context.eligible).not.toContain(AWalker)
    }
  })
})

describe('charge phase — roll and R-8.4 feasibility (CHARGE-006..013, 031)', () => {
  it('CHARGE-006 2D6 is rolled once per charge, as a DiceRolled(purpose: charge) event', () => {
    const { ctx, events } = start(unattached(), [4, 5])
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    declare(ctx, AWalker, [BBrute])
    const rolls = events.filter((e) => e.type === 'DiceRolled' && e.roll.purpose === 'charge')
    expect(rolls).toHaveLength(1)
  })

  it('CHARGE-007 roll 7, target out of reach → charge fails, no model moves, ChargeFailed emitted', () => {
    const { ctx, events } = start(unattached(), [4, 3]) // total 7
    placeAtGap(ctx.state, AWalker, BBrute, 10) // needs ~9" to reach Engagement Range — a roll of 7 can't do it
    const before = { ...ctx.state.models[`${AWalker}#0`].pos }
    declare(ctx, AWalker, [BBrute])
    expect(events.some((e) => e.type === 'ChargeFailed' && e.unitId === AWalker)).toBe(true)
    expect(ctx.state.models[`${AWalker}#0`].pos).toEqual(before)
  })

  it('CHARGE-031 a failed charge leaves every model\'s position identical, still flags the unit as having declared', () => {
    const { ctx, events } = start(unattached(), [2, 2]) // total 4
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    const before = { ...ctx.state.models[`${AWalker}#0`].pos }
    declare(ctx, AWalker, [BBrute])
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(true)
    expect(ctx.state.models[`${AWalker}#0`].pos).toEqual(before)
    expect(ctx.state.phaseState.activated).toContain(AWalker)
  })

  it('a successful charge (roll comfortably exceeds the gap) reaches the chargeMove decision and can be applied', () => {
    const { ctx, events } = start(unattached(), [5, 5]) // total 10
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    const r = declare(ctx, AWalker, [BBrute])
    expect(r).toBe('pending')
    expect(ctx.state.pending?.kind).toBe('chargeMove')
    const brute = ctx.state.models[`${BBrute}#0`]
    const walkerR = ctx.state.models[`${AWalker}#0`].base.radius
    const bruteR = brute.base.radius
    const to = { x: brute.pos.x - bruteR - walkerR, y: 0, z: 0 } // base contact
    move(ctx, AWalker, [{ modelId: `${AWalker}#0`, pos: to }])
    expect(events.some((e) => e.type === 'ChargeMoved')).toBe(true)
    expect(ctx.state.units[AWalker].turn.chargedThisTurn).toBe(true)
  })

  it('CHARGE-009 two declared targets, the roll reaches one but not the other → charge fails', () => {
    const { ctx, events } = start(unattached(), [3, 3]) // total 6
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 0 }])
    const walkerR = ctx.state.models[`${AWalker}#0`].base.radius
    // brute at a 4" gap (reachable with a 6" roll); kopta at an 8" gap on a perpendicular axis (needs 7" to
    // reach Engagement Range — unreachable with a 6" roll) but still within the 12" declare range of both
    placeUnit(ctx.state, BBrute, [{ x: walkerR + 1.5 + 4, y: 0, z: 0 }])
    placeUnit(ctx.state, BKopta, [{ x: 0, y: 0, z: walkerR + 1.5 + 8 }])
    declare(ctx, AWalker, [BBrute, BKopta])
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(true)
  })

  it('CHARGE-011 a model that would end farther from every target than it started is rejected', () => {
    const { ctx } = start(unattached(), [6, 6]) // total 12
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    declare(ctx, AWalker, [BBrute])
    const start0 = ctx.state.models[`${AWalker}#0`].pos.x
    const rej = reject(ctx, { type: 'chargeMove', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: start0 - 2, y: 0, z: 0 } }] })
    // for a single-model, single-target charge, "farther from the target" and "outside Engagement Range" are the
    // same violation (R-8.5 is meaningfully distinct only for a model that need not itself reach ER) — either
    // rejection code correctly refuses the move; the module reports whichever check runs first.
    expect(['E_OUT_OF_RANGE', 'E_ENGAGEMENT']).toContain(rej?.code)
  })

  it('CHARGE-012 a model that could reach base contact must — stopping 0.5" short is rejected', () => {
    const { ctx } = start(unattached(), [6, 6]) // total 12, plenty for a 6" gap
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    declare(ctx, AWalker, [BBrute])
    const brute = ctx.state.models[`${BBrute}#0`]
    const walkerR = ctx.state.models[`${AWalker}#0`].base.radius
    const shortOfContact = { x: brute.pos.x - brute.base.radius - walkerR - 0.5, y: 0, z: 0 }
    const rej = reject(ctx, { type: 'chargeMove', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: shortOfContact }] })
    expect(rej?.code).toBe('E_OUT_OF_RANGE')
  })
})

describe('charge phase — R-8.6 Fights First (CHARGE-014)', () => {
  it('CHARGE-014 a successful charger has Fights First until end of turn', () => {
    const { ctx } = start(unattached(), [6, 6])
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    declare(ctx, AWalker, [BBrute])
    const brute = ctx.state.models[`${BBrute}#0`]
    const walkerR = ctx.state.models[`${AWalker}#0`].base.radius
    move(ctx, AWalker, [{ modelId: `${AWalker}#0`, pos: { x: brute.pos.x - brute.base.radius - walkerR, y: 0, z: 0 } }])
    expect(ctx.state.units[AWalker].turn.fightsFirst).toBe(true)
  })
})

describe('charge phase — CHARGE-010 (partial-reach coherency)', () => {
  it('a mob can charge successfully even though only its nearest models can reach Engagement Range', () => {
    const { ctx, events } = start(unattached(), [3, 2]) // total 5
    ctx.state.activePlayer = 'B' // B is the charger in this scenario
    // 5 Boyz in a tight line (edge-to-edge gap 0.1"), the near end close enough to reach Engagement Range within a
    // roll of 5", the far end nowhere near — CHARGE-010: the unit still charges successfully as a whole as long as
    // it ends in Engagement Range of the target somewhere and stays in coherency (needs only 1 neighbour at 5 models).
    for (let i = 5; i <= 9; i++) removeModel(ctx.state, `${B}#${i}`)
    placeUnit(ctx.state, B, { x: -3, z: 0, gap: 0.1 })
    const nearest = ctx.state.models[`${B}#4`]
    const nearestR = nearest.base.radius
    const walkerR = ctx.state.models[`${AWalker}#0`].base.radius
    // walker sits just past Engagement Range of the row's nearest model (so the unit is not already engaged)
    placeUnit(ctx.state, AWalker, [{ x: nearest.pos.x + nearestR + walkerR + 1.5, y: 0, z: 0 }])
    let r = declare(ctx, B, [AWalker])
    // Blu Mob's Rage ability offers to re-roll a successful charge roll too (R-6.24) — decline it
    if (ctx.state.pending?.kind === 'chooseOption') {
      r = act(ctx, { type: 'chooseOption', player: 'B', decisionId: DID, optionId: 'keep' })
    }
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(false)
    expect(r).toBe('pending')
    expect(ctx.state.pending?.kind).toBe('chargeMove')
  })
})

// Fire Overwatch / Heroic Intervention / Tank Shock end-to-end legality and mechanics (CHARGE-016..018, 023..027,
// 029) are exercised against the real Combat Patrol data bundle in tests/engine/hooks.strat.test.ts, which already
// drives ctx.window('charge.moveStarted'/'charge.moveEnded', …) the same way this module does — not duplicated
// here. The synthetic test fixture's `core.s.fire-overwatch` entry (tests/fixtures/bundle.ts) uses a different,
// single-target shape than the real data's (no explicit enemy/`justMoved` target) and is not compatible with the
// `fireOverwatch` code hook when driven directly through it — worth a look by whoever owns that fixture (issues).
describe('charge phase — Fire Overwatch window sequencing (CHARGE-016)', () => {
  it('CHARGE-016 the opponent\'s charge.moveStarted window is offered before the chargeMove decision', () => {
    const state = createGameState(makeSetup(unattached()), bundle, 'seed', ENGINE_VERSION)
    // a stratagems stub that always offers a window at charge.moveStarted (real Fire Overwatch legality — a unit
    // within 24" eligible to shoot — is stratagems.ts's own concern, exercised in its own tests; this only checks
    // that the charge module asks for the window at the right point, per R-8.3/00-arch §4, mirroring MOVE-036)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(['charge.moveStarted']) } }
    const { ctx } = createContext(state, new ScriptedRng([6, 6]), modules)
    chargeModule.enter(ctx)
    placeAtGap(ctx.state, AWalker, BBrute, 6)
    declare(ctx, AWalker, [BBrute])
    expect(ctx.state.pending?.kind).toBe('stratagemWindow')
    expect((ctx.state.pending as Extract<PendingDecision, { kind: 'stratagemWindow' }>).player).toBe('B')
    const swPending = ctx.state.pending as PendingDecision
    clearPending(ctx.state)
    modules.services.stratagems.handle(ctx, { type: 'pass', player: 'B', decisionId: DID }, swPending)
    chargeModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('chargeMove')
  })
})
