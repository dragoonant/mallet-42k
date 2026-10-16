// Adeptus Mechanicus engine changes beyond code hooks (docs/spec/factions/adeptus-mechanicus.md 7.1, item E-ADM1; checklist ADM-022).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  ENGINE_VERSION, createGameState, emptyPhaseState,
  type GameSetup, type GameState, type PlayerSetup, type UnitId,
} from '../../src/engine'
import { evaluateCondition, friendlyKeywordWithin } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const ADM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'AdMech', faction: 'adeptus-mechanicus', patrolId: 'adm.cp.purge-corps-deltic-9', enhancementId: 'adm.e.aspergilla-of-tarentum',
  secondaryId: 'adm.sec.targeted-purge', attachments: [{ leaderRef: 'skand', bodyguardRef: 'vanguard' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const VAN = 'A:vanguard', SKAND = 'A:skand', HOUNDS = 'A:sulphurhounds', PTER = 'A:pteraxii', BOYZ = 'B:boyz-a'

function makeState(): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: ADM(), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'adeptus-mechanicus-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}

// stack every model of `unitId` on one point, then slide the unit along +x until its closest-model distance to `anchor` is ~`gap`.
// Oval-base distances are sampled from the outline, so unitDistance is not exactly linear in x: converge a few times, assert
// to 2 decimals, and return the distance actually achieved (for the "exactly at the range" case).
function placeAtGap(s: GameState, unitId: UnitId, anchor: UnitId, gap: number): number {
  let x = 20
  placeUnit(s, unitId, [[x, 0]])
  for (let i = 0; i < 6; i++) {
    x += gap - leaderService.unitDistance(s, unitId, anchor)
    placeUnit(s, unitId, [[x, 0]])
  }
  const d = leaderService.unitDistance(s, unitId, anchor)
  expect(Math.abs(d - gap)).toBeLessThan(0.02)
  return d
}

describe('E-ADM1 Condition friendlyKeywordWithin (ADM-022)', () => {
  it('ADM-022 true just inside the range, false just outside, of another friendly BATTLELINE unit', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]])
    placeAtGap(s, PTER, VAN, 5.9)
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', 6)).toBe(true)
    placeAtGap(s, PTER, VAN, 6.1)
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', 6)).toBe(false)
  })

  it('ADM-022 exactly at the range counts (tolerance) and the factionKeyword filter applies', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]])
    const d = placeAtGap(s, PTER, VAN, 6)
    // a range equal to the real gap counts (inclusive), one a hair short does not (tolerance is 1e-6)
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', d, 'ADEPTUS MECHANICUS')).toBe(true)
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', d - 1e-4, 'ADEPTUS MECHANICUS')).toBe(false)
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', d, 'ORKS')).toBe(false)
  })

  it('ADM-022 a BATTLELINE holder (and its attached leader) never satisfies the condition by itself', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0.5, 0]])
    placeUnit(s, HOUNDS, [[40, 0]])
    expect(friendlyKeywordWithin(s, VAN, 'BATTLELINE', 6)).toBe(false)
    expect(friendlyKeywordWithin(s, SKAND, 'BATTLELINE', 6)).toBe(false)
    // a different friendly unit that is not BATTLELINE does not help either
    placeUnit(s, HOUNDS, [[3, 0]])
    expect(friendlyKeywordWithin(s, VAN, 'BATTLELINE', 6)).toBe(false)
    // but the Vanguard is another unit from the Hounds' point of view
    expect(friendlyKeywordWithin(s, HOUNDS, 'BATTLELINE', 6)).toBe(true)
  })

  it('ADM-022 enemy BATTLELINE units never count, and a holder with no board model is false', () => {
    const s = makeState()
    placeUnit(s, PTER, [[0, 0]])
    placeUnit(s, BOYZ, [[2, 0]])
    placeUnit(s, VAN, [[40, 0]])
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', 6)).toBe(false)
    s.units[VAN].location = 'reserves'
    s.units[PTER].location = 'reserves'
    expect(friendlyKeywordWithin(s, PTER, 'BATTLELINE', 6)).toBe(false)
  })

  it('ADM-022 evaluateCondition wires the key through; an empty condition and the other keys are unchanged', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]])
    placeAtGap(s, PTER, VAN, 5.9)
    const env = { state: s, holder: s.units[PTER], player: 'A' as const, attack: null, roll: null, weapon: null }
    expect(evaluateCondition(env, { friendlyKeywordWithin: { keyword: 'BATTLELINE', within: 6 } })).toBe(true)
    expect(evaluateCondition(env, { friendlyKeywordWithin: { keyword: 'BATTLELINE', within: 5 } })).toBe(false)
    expect(evaluateCondition({ ...env, holder: null }, { friendlyKeywordWithin: { keyword: 'BATTLELINE', within: 6 } })).toBe(false)
    expect(evaluateCondition(env, {})).toBe(true)
    expect(evaluateCondition(env, null)).toBe(true)
  })
})
