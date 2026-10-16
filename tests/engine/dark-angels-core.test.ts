// Dark Angels engine changes beyond code hooks (docs/spec/factions/dark-angels.md 7.1): E1 turn-scoped charge record
// (Stoic Exemplar) and E2 turn-scoped "has shot" record (March of Vengeance). Synthetic fixtures; the faction's data
// and hook tests live in tests/data/dark-angels.test.ts and the hooks agent's own files.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, hashState, mmToInch,
  type Action, type EngineContext, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { pushReaction } from '../../src/engine/code-hooks'
import { CHARGE_LOG_KEY, chargeModule, chargersIntoThisTurn } from '../../src/engine/phases/charge'
import { SHOT_LOG_KEY, shootingModule, shotThisTurn } from '../../src/engine/phases/shooting'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems } from '../fixtures'

const DID = ''
const AW = 'A:walker', BB = 'B:brute'

function unattached(): Parameters<typeof makeSetup>[0] {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }
}

// ---------- charge (E1) ----------
function chargeAct(ctx: EngineContext, action: Action): void {
  if (!ctx.state.pending) chargeModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = chargeModule.validate ? chargeModule.validate(ctx.state, action, pending) : null
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = chargeModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  chargeModule.advance(ctx)
}

function chargeScenario(roll: number[], gap = 6) {
  const state = createGameState(makeSetup(unattached()), bundle, 'seed', ENGINE_VERSION)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx, events } = createContext(state, new ScriptedRng(roll), modules)
  chargeModule.enter(ctx)
  placeUnit(state, AW, [{ x: 0, y: 0, z: 0 }])
  const ra = state.models[`${AW}#0`].base.radius, rb = state.models[`${BB}#0`].base.radius
  placeUnit(state, BB, [{ x: ra + rb + gap, y: 0, z: 0 }])
  chargeAct(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: AW })
  chargeAct(ctx, { type: 'declareCharge', player: 'A', decisionId: DID, unitId: AW, targetUnitIds: [BB] })
  return { state, ctx, events, ra, rb }
}

function finishCharge(s: ReturnType<typeof chargeScenario>): void {
  const brute = s.state.models[`${BB}#0`]
  chargeAct(s.ctx, {
    type: 'chargeMove', player: 'A', decisionId: DID, unitId: AW,
    placements: [{ modelId: `${AW}#0`, pos: { x: brute.pos.x - s.rb - s.ra, y: 0, z: 0 } }],
  })
}

describe('Dark Angels E1: chargersIntoThisTurn', () => {
  it('DAR-005 a completed charge is logged against its target; the log is turn-scoped', () => {
    const s = chargeScenario([5, 5])
    expect(chargersIntoThisTurn(s.state, BB)).toEqual([])
    finishCharge(s)
    expect(s.events.some((e) => e.type === 'ChargeMoved')).toBe(true)
    expect(chargersIntoThisTurn(s.state, BB)).toEqual([AW])
    expect(chargersIntoThisTurn(s.state, AW)).toEqual([]) // only units charged INTO are keyed
    expect((s.state.mission.custom[CHARGE_LOG_KEY] as { pairs: unknown[] }).pairs).toHaveLength(1)
  })

  it('DAR-006 a failed charge is never logged', () => {
    const s = chargeScenario([1, 1])
    expect(s.events.some((e) => e.type === 'ChargeFailed')).toBe(true)
    expect(chargersIntoThisTurn(s.state, BB)).toEqual([])
    expect(s.state.mission.custom[CHARGE_LOG_KEY]).toBeUndefined()
  })

  it('DAR-007 a stale log (previous round or other player turn) returns []', () => {
    const s = chargeScenario([5, 5])
    finishCharge(s)
    expect(chargersIntoThisTurn(s.state, BB)).toEqual([AW])
    s.state.activePlayer = 'B'
    expect(chargersIntoThisTurn(s.state, BB)).toEqual([])
    s.state.activePlayer = 'A'
    s.state.round += 1
    expect(chargersIntoThisTurn(s.state, BB)).toEqual([])
  })

  it('DAR-007 Stoic Exemplar via Heroic Intervention: in the DA turn an enemy that heroically intervenes into the unit is logged as a charger of it', () => {
    const KOPTA = 'B:kopta'
    const s = chargeScenario([5, 5, 6, 6]) // the walker's 2D6, then the heroic Kopta's
    const { state, ctx, ra } = s
    // the Kopta starts out of the walker's path, 3" behind where the walker started; the opponent has already paid for Heroic Intervention
    const rk = state.models[`${KOPTA}#0`].base.radius
    placeUnit(state, KOPTA, [{ x: -(ra + rk + 3), y: 0, z: 0 }])
    pushReaction(ctx, { kind: 'heroicIntervention', stratagemId: 'core.s.heroic-intervention', player: 'B', unitId: KOPTA, enemyUnitId: AW, window: 'charge.moveEnded', distance: null })
    finishCharge(s)
    // the walker's own charge is logged; the heroic move is now the pending charge decision
    expect(chargersIntoThisTurn(state, BB)).toEqual([AW])
    expect(state.activePlayer).toBe('A')
    expect(state.phaseState.charge).toMatchObject({ unitId: KOPTA, targetUnitIds: [AW], heroic: true })
    expect(chargersIntoThisTurn(state, AW)).toEqual([]) // not logged until the heroic move is made
    if (!state.pending) chargeModule.advance(ctx)
    const pending = state.pending as PendingDecision
    expect(pending.kind).toBe('chargeMove')
    const moves = (chargeModule.legalActions!(state, pending) ?? []).filter((a) => a.type === 'chargeMove')
    expect(moves.length).toBeGreaterThan(0)
    chargeAct(ctx, { ...(moves[0] as Extract<Action, { type: 'chargeMove' }>), decisionId: DID })
    expect(s.events.filter((e) => e.type === 'ChargeMoved' && e.unitId === KOPTA)).toHaveLength(1)
    // the heroic mover is logged against the DA unit while it is still the DA (active) player's turn
    expect(chargersIntoThisTurn(state, AW)).toEqual([KOPTA])
    expect(state.activePlayer).toBe('A')
    state.activePlayer = 'B' // stale once it is the other player's turn
    expect(chargersIntoThisTurn(state, AW)).toEqual([])
  })
})

// ---------- shooting (E2) ----------
function shootStart() {
  const state = createGameState(makeSetup(unattached()), bundle, 'seed', ENGINE_VERSION)
  state.phase = 'shooting'
  const r = mmToInch(32) / 2
  placeUnit(state, 'A:grunts', { x: 0, z: 0, gap: 0.3 })
  placeUnit(state, 'B:mob', { x: 14 + 2 * r, z: 0, gap: 0.3 })
  const h = createContext(state, new ScriptedRng(Array(200).fill(1)), DEFAULT_MODULES)
  shootingModule.enter(h.ctx)
  return { state, ...h }
}
function shootAct(ctx: EngineContext, action: Action): void {
  if (!ctx.state.pending) shootingModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  ctx.state.pending = null
  const handled = shootingModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  shootingModule.advance(ctx)
}

describe('Dark Angels E2: shotThisTurn', () => {
  it('DAR-015 a unit that declared targets has shot; selecting it alone does not count', () => {
    const { state, ctx } = shootStart()
    shootingModule.advance(ctx)
    expect(shotThisTurn(state, 'A:grunts')).toBe(false)
    shootAct(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: 'A:grunts' })
    expect(shotThisTurn(state, 'A:grunts')).toBe(false)
    const weapons = (state.pending as Extract<PendingDecision, { kind: 'declareTargets' }>).context.weapons
    const w = weapons.find((e) => e.legalTargets.includes('B:mob'))
    expect(w).toBeTruthy()
    shootAct(ctx, {
      type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts',
      targets: [{ modelId: w!.modelId, weaponId: w!.weaponId, targetUnitId: 'B:mob' }],
    })
    expect(shotThisTurn(state, 'A:grunts')).toBe(true)
    expect(shotThisTurn(state, 'B:mob')).toBe(false)
    state.round += 1 // stale once the round moves on
    expect(shotThisTurn(state, 'A:grunts')).toBe(false)
  })

  it('DAR-015 declaring no targets is not shooting', () => {
    const { state, ctx } = shootStart()
    shootingModule.advance(ctx)
    shootAct(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: 'A:grunts' })
    shootAct(ctx, { type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts', targets: [] })
    expect(shotThisTurn(state, 'A:grunts')).toBe(false)
    expect(state.mission.custom[SHOT_LOG_KEY]).toBeUndefined()
  })
})

describe('Dark Angels E1/E2 determinism', () => {
  it('DAR-025 the charge log keeps state hashes deterministic', () => {
    const hashOf = (): string => {
      const s = chargeScenario([5, 5])
      finishCharge(s)
      return hashState(s.state)
    }
    expect(hashOf()).toBe(hashOf())
  })
})
