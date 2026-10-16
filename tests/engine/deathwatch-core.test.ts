// Deathwatch engine change beyond code hooks (docs/spec/factions/deathwatch.md 7.1 E1, checklist DEA-*): Teleport arrival options
// (minEnemyGap + forbidChargeOnArrival) carried on the Teleport Assault record. Real data, Grey Knights vs Orks as the
// carrier of the teleport path (the Deathwatch hook only calls removeUnitToReserves with these options).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type DeployUnitDecision, type GameEvent, type GameSetup, type GameState, type PlayerSetup,
} from '../../src/engine'
import { movementModule } from '../../src/engine/phases/movement'
import {
  DEFAULT_TELEPORT_ARRIVAL, isTeleporting, removeUnitToReserves, teleportArrivalOpts, teleportRecord, teleportState,
  type TeleportArrivalOpts,
} from '../../src/engine/teleport'
import { transportService } from '../../src/engine/transports'
import { placeUnit } from '../fixtures/state'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GK = (): PlayerSetup => ({
  name: 'Grey Knights', faction: 'grey-knights', patrolId: 'gk.cp.aurellios-banishers', enhancementId: 'gk.e.banishment-stone',
  secondaryId: 'gk.sec.champion-of-titan', attachments: [{ leaderRef: 'librarian', bodyguardRef: 'terminators' }], reserves: [], battleReadyVp: 0,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const STRIKE = 'A:strike', BOYZ = 'B:boyz-a'
const TELE: TeleportArrivalOpts = { minEnemyGap: 3, forbidChargeOnArrival: true }
const TELEPORTARIUM = 'dw.s.deathwatch-teleportarium'

function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B'): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
}
function ctxOf(s: GameState) { return createContext(s, new ScriptedRng([]), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

// the Strike Squad is removed in the opponent's turn and the Reinforcements step of its owner's next Movement phase is open;
// one enemy model stands at (18, 8)
function reservesState(round: number, opts?: TeleportArrivalOpts): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GK(), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'deathwatch-core', ENGINE_VERSION)
  s.round = round
  s.board = { ...s.board, pieces: {} } // an empty table: the tests probe arrival geometry only
  placeUnit(s, STRIKE, { x: -10, z: -6, gap: 0.3 })
  placeUnit(s, BOYZ, [[18, 8]])
  phase(s, 'fight', 'B')
  removeUnitToReserves(ctxOf(s).ctx, STRIKE, TELEPORTARIUM, opts)
  phase(s, 'movement', 'A')
  s.step = 'reinforcements'
  return s
}
// a column of the squad's models whose nearest base edge is `gap` inches from the enemy model, on its western side
function column(s: GameState, pending: DeployUnitDecision, gap: number): Action {
  const enemyR = s.models[s.units[BOYZ].models[0]].base.radius
  return {
    type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
    placements: pending.context.unitIds.flatMap((u) => s.units[u].models).map((id, i) => {
      const r = s.models[id].base.radius
      return { modelId: id, pos: { x: 18 - enemyR - gap - r, y: 0, z: 8 + i * (2 * r + 0.1) }, facing: 0 }
    }),
  }
}

describe('E1 Teleport arrival options (Deathwatch Teleportarium, DEA-5.3 / 5.5)', () => {
  it('DEA-019 DEA-5.3: removal stores the options on the record; teleportRecord / teleportArrivalOpts read them', () => {
    const s = reservesState(2, TELE)
    expect(s.units[STRIKE].location).toBe('reserves')
    expect(isTeleporting(s, STRIKE)).toBe(true)
    expect(teleportState(s, 'A').pending[0]).toEqual({ unitId: STRIKE, removedRound: 2, removedInTurnOf: 'B', source: TELEPORTARIUM, arrival: TELE })
    expect(teleportRecord(s, STRIKE)).toMatchObject({ unitId: STRIKE, source: TELEPORTARIUM, arrival: TELE })
    expect(teleportArrivalOpts(s, STRIKE)).toEqual(TELE)
    expect(teleportRecord(s, BOYZ)).toBeNull()
  })

  it('DEA-019 DEA-5.3: arrival set-up 3.1" from enemy models is accepted, 2.9" is rejected', () => {
    const s = reservesState(2, TELE)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(movementModule.validate!(s, column(s, pending, 3.1), pending)).toBeNull()
    expect(movementModule.validate!(s, column(s, pending, 2.9), pending)).not.toBeNull()
  })

  it('DEA-020 DEA-5.3: the arrived unit cannot declare a charge that turn; arrival still emits via teleportAssault', () => {
    const s = reservesState(2, TELE)
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    s.pending = null
    expect(transportService.cannotChargeThisTurn(s, STRIKE)).toBe(false)
    expect(movementModule.handle(c.ctx, column(s, pending, 3.1), pending)).toBeUndefined()
    expect(s.units[STRIKE].location).toBe('board')
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ unitId: STRIKE, via: 'teleportAssault' })
    expect(isTeleporting(s, STRIKE)).toBe(false)
    expect(teleportRecord(s, STRIKE)).toBeNull()
    expect(transportService.cannotChargeThisTurn(s, STRIKE)).toBe(true)
    expect(s.units[STRIKE].turn.moveType).toBe('normal') // a Normal move: shooting stays open
  })

  it('DEA-021 DEA-5.5: arrival is mandatory in round 1 (not culled); declining destroys the unit with UnitLostInReserves', () => {
    const s = reservesState(1, TELE)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    expect(s.units[STRIKE].location).toBe('reserves')
    const pending = s.pending as DeployUnitDecision
    const pass: Action = { type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: STRIKE, placements: [], toReserves: true }
    s.pending = null
    expect(movementModule.handle(c.ctx, pass, pending)).toBeUndefined()
    expect(s.units[STRIKE].location).toBe('destroyed')
    expect(of(c.events, 'UnitLostInReserves').filter((e) => e.unitId === STRIKE)).toHaveLength(1)
    expect(teleportState(s, 'A').pending).toHaveLength(0)
  })

  it('DEA-026 E1: a record without options keeps the 9" gap and allows a charge after arrival', () => {
    const s = reservesState(2)
    expect(teleportState(s, 'A').pending[0]).toEqual({ unitId: STRIKE, removedRound: 2, removedInTurnOf: 'B', source: TELEPORTARIUM })
    expect(teleportArrivalOpts(s, STRIKE)).toEqual(DEFAULT_TELEPORT_ARRIVAL)
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    expect(movementModule.validate!(s, column(s, pending, 3.1), pending)).not.toBeNull()
    expect(movementModule.validate!(s, column(s, pending, 8.9), pending)).not.toBeNull()
    expect(movementModule.validate!(s, column(s, pending, 9.1), pending)).toBeNull()
    s.pending = null
    movementModule.handle(c.ctx, column(s, pending, 9.1), pending)
    expect(s.units[STRIKE].location).toBe('board')
    expect(transportService.cannotChargeThisTurn(s, STRIKE)).toBe(false)
  })
})
