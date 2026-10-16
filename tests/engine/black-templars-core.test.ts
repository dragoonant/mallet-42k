// Black Templars engine changes (docs/spec/factions/black-templars.md §7.1): E-BT2 Assault Vehicle (disembark after the
// transport Advanced) and E-BT3 combined Leader + bodyguard embarkation. E-BT1 (Condition targetModelKeyword) lives in
// hooks-impl.ts and is covered by BLA-025 / BLA-016 / BLA-017 in black-templars.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import { ENGINE_VERSION, createGameState, emptyPhaseState, type GameSetup, type GameState, type PlayerSetup } from '../../src/engine'
import { allowsDisembarkAfterAdvance, passengerHalves, transportService } from '../../src/engine/transports'
import { disembarkCandidates } from '../../src/engine/phases/movement'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const BT = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Templars', faction: 'black-templars', patrolId: 'bt.cp.siguard-s-crusaders', enhancementId: 'bt.e.crusaders-fervour',
  secondaryId: 'bt.sec.path-of-purgation', attachments: [{ leaderRef: 'marshal-siguard', bodyguardRef: 'intercessor-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const SIS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Sororitas', faction: 'adepta-sororitas', patrolId: 'ade.cp.the-penitent-host', enhancementId: 'ade.e.saintly-relic',
  secondaryId: 'ade.sec.divine-judgement', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sisters' }], reserves: [], battleReadyVp: 0, ...o,
})

function makeState(b: Partial<PlayerSetup> = {}, a?: PlayerSetup): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: a ?? BT(b), B: BT() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'bt-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.phase = 'movement'
  s.phaseState = emptyPhaseState()
  return s
}

const IMP = 'A:impulsor', INT = 'A:intercessor-squad', SIG = 'A:marshal-siguard', CRU = 'A:primaris-crusader-squad'

function embarkedIntercessors(): GameState {
  const s = makeState()
  placeUnit(s, IMP, [[0, 0]])
  placeUnit(s, INT, { x: -3, z: 0 })
  s.units[INT].location = 'board'
  transportService.embark(s, INT, IMP)
  s.round = 3 // the unit began this phase embarked (R-5.18)
  return s
}

describe('E-BT2 Assault Vehicle', () => {
  it('BLA-022 allowsDisembarkAfterAdvance is true for the Impulsor only (a Sororitas Rhino is not an Assault Vehicle)', () => {
    const s = makeState()
    expect(allowsDisembarkAfterAdvance(s, IMP)).toBe(true)
    expect(allowsDisembarkAfterAdvance(s, INT)).toBe(false)
    const r = makeState({}, SIS())
    expect(allowsDisembarkAfterAdvance(r, 'A:rhino')).toBe(false)
  })

  it('BLA-022 Impulsor Advanced: passengers may disembark, counting as a Normal move with no charge', () => {
    const s = embarkedIntercessors()
    s.units[IMP].turn.moveType = 'advance'
    expect(transportService.disembarkMode(s, INT)).toBe('countsAsNormalMove')
    const t = transportService.disembark(s, INT)
    expect(t).toBe(IMP)
    expect(transportService.disembarkModeThisPhase(s, INT)).toBe('countsAsNormalMove')
    expect(s.units[INT].turn.moveType).toBe('normal')
    expect(transportService.cannotChargeThisTurn(s, INT)).toBe(true)
    expect(transportService.transportOf(s, INT)).toBeNull()
  })

  it('BLA-022 Impulsor Advanced: the embarked unit is offered as a disembark candidate', () => {
    const s = embarkedIntercessors()
    s.units[IMP].turn.moveType = 'advance'
    expect(disembarkCandidates(s, 'A')).toContain(INT)
  })

  it('BLA-022 Impulsor Fell Back: no disembark', () => {
    const s = embarkedIntercessors()
    s.units[IMP].turn.moveType = 'fallBack'
    expect(transportService.disembarkMode(s, INT)).toBeNull()
    expect(disembarkCandidates(s, 'A')).not.toContain(INT)
  })

  it('BLA-022 Impulsor Normal move / stationary: unchanged (Normal counts as a move, otherwise acts normally)', () => {
    const s = embarkedIntercessors()
    s.units[IMP].turn.moveType = 'normal'
    expect(transportService.disembarkMode(s, INT)).toBe('countsAsNormalMove')
    s.units[IMP].turn.moveType = 'stationary'
    expect(transportService.disembarkMode(s, INT)).toBe('actsNormally')
    s.units[IMP].turn.moveType = null
    expect(transportService.disembarkMode(s, INT)).toBe('actsNormally')
  })

  it('BLA-022 a Sororitas Rhino after an Advance still refuses disembarkation', () => {
    const s = makeState({}, SIS())
    placeUnit(s, 'A:rhino', [[0, 0]])
    placeUnit(s, 'A:sisters', { x: -3, z: 0 })
    transportService.embark(s, 'A:sisters', 'A:rhino')
    s.round = 3
    s.units['A:rhino'].turn.moveType = 'advance'
    expect(transportService.disembarkMode(s, 'A:sisters')).toBeNull()
    s.units['A:rhino'].turn.moveType = 'normal'
    expect(transportService.disembarkMode(s, 'A:sisters')).toBe('countsAsNormalMove')
  })
})

describe('E-BT3 combined Leader + bodyguard embarkation', () => {
  it('BLA-023 Siguard leading the Intercessors (6 models) embarks as one unit and fills 6/6', () => {
    const s = makeState()
    expect(passengerHalves(s, INT).sort()).toEqual([INT, SIG].sort())
    expect(passengerHalves(s, INT)[0]).toBe(INT)
    placeUnit(s, IMP, [[0, 0]])
    placeUnit(s, INT, { x: -3, z: 0 })
    placeUnit(s, SIG, [[-3, 2]])
    expect(transportService.canCarry(s, INT, IMP)).toBe(true)
    transportService.embark(s, INT, IMP)
    expect(transportService.transportOf(s, INT)).toBe(IMP)
    expect(transportService.transportOf(s, SIG)).toBe(IMP)
    expect(s.units[INT].location).toBe('reserves')
    expect(s.units[SIG].location).toBe('reserves')
    expect(s.units[INT].models.length + s.units[SIG].models.length).toBe(6)
  })

  it('BLA-023 the group disembarks together and stays attached', () => {
    const s = makeState()
    placeUnit(s, IMP, [[0, 0]])
    placeUnit(s, INT, { x: -3, z: 0 })
    placeUnit(s, SIG, [[-3, 2]])
    transportService.embark(s, INT, IMP)
    transportService.disembark(s, INT)
    expect(transportService.transportOf(s, INT)).toBeNull()
    expect(transportService.transportOf(s, SIG)).toBeNull()
    expect(transportService.embarkedIn(s, IMP)).toEqual([])
    expect(passengerHalves(s, INT).sort()).toEqual([INT, SIG].sort())
    expect(s.units[SIG].bodyguardUnitId).toBe(INT)
    expect(s.units[INT].attachedLeaderId).toBe(SIG)
  })

  it('BLA-023 Siguard + the unsplit Crusader Squad (11 models) is refused; the Impulsor fits 6', () => {
    const s = makeState({ attachments: [{ leaderRef: 'marshal-siguard', bodyguardRef: 'primaris-crusader-squad' }] })
    placeUnit(s, IMP, [[0, 0]])
    expect(passengerHalves(s, CRU)).toContain(SIG)
    expect(transportService.canCarry(s, CRU, IMP)).toBe(false)
  })
})
