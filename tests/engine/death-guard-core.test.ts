// Death Guard engine changes beyond code hooks (docs/spec/factions/death-guard.md 7.1). Checklist prefix DTG (DEA- belongs to
// Deathwatch). E1 = hasDeepStrike (this file); E2 (unitOnObjectiveControlledBy, DTG-028) lives in hooks-impl.ts and is covered
// by the agent that owns that file.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import { ENGINE_VERSION, createGameState, type GameSetup, type GameState, type PlayerSetup } from '../../src/engine'
import { hasDeepStrike } from '../../src/engine/state'
import { emptyPhaseState } from '../../src/engine'
import { stratagemService } from '../../src/engine/stratagems'
import { reserveRouteFor } from '../../src/engine/phases/movement'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DG = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Death Guard', faction: 'death-guard', patrolId: 'dg.cp.the-shambling-horde', enhancementId: 'dg.e.miasmic-arrival',
  secondaryId: 'dg.sec.contaminate-ground',
  attachments: [{ leaderRef: 'typhus', bodyguardRef: 'poxwalkers-a' }, { leaderRef: 'grelch', bodyguardRef: 'plague-marines' }],
  reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
function makeState(a: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DG(a), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
  return createGameState(setup, bundle, 'dtg-core', ENGINE_VERSION)
}

const TYPHUS = 'A:typhus', POX = 'A:poxwalkers-a', POX_B = 'A:poxwalkers-b', MARINES = 'A:plague-marines', GRELCH = 'A:grelch'

describe('E1 hasDeepStrike', () => {
  it('DTG-029 true for a datasheet DEEP_STRIKE and for either half of a pair carrying grantDeepStrike; false otherwise', () => {
    const s = makeState()
    // Typhus has DEEP_STRIKE on his datasheet; the Poxwalkers get it only through Typhus's enhancement (either half answers true)
    expect(hasDeepStrike(s, TYPHUS)).toBe(true)
    expect(hasDeepStrike(s, POX)).toBe(true)
    // other units, and the other player's units, do not
    expect(hasDeepStrike(s, POX_B)).toBe(false)
    expect(hasDeepStrike(s, MARINES)).toBe(false)
    expect(hasDeepStrike(s, GRELCH)).toBe(false)
    expect(hasDeepStrike(s, 'B:boyz-a')).toBe(false)
    expect(hasDeepStrike(s, 'A:nope')).toBe(false)
  })

  it('DTG-029 without the enhancement the Poxwalkers have no Deep Strike (datasheet-only behaviour unchanged)', () => {
    const s = makeState({ enhancementId: 'dg.e.walking-plague' })
    expect(hasDeepStrike(s, TYPHUS)).toBe(true)
    expect(hasDeepStrike(s, POX)).toBe(false)
    expect(hasDeepStrike(s, MARINES)).toBe(false)
  })

  it('DTG-012 Typhus + Poxwalkers may start in Reserves with Miasmic Arrival and arrive by Deep Strike; without it they cannot', () => {
    const s = makeState({ reserves: ['typhus', 'poxwalkers-a'] })
    expect(s.units[TYPHUS].location).toBe('reserves')
    expect(s.units[POX].location).toBe('reserves')
    expect(reserveRouteFor(s, POX)).toBe('deepStrike')
    expect(reserveRouteFor(s, TYPHUS)).toBe('deepStrike')
    expect(() => makeState({ enhancementId: 'dg.e.walking-plague', reserves: ['typhus', 'poxwalkers-a'] })).toThrow(/cannot start in Reserves/)
    expect(() => makeState({ reserves: ['poxwalkers-b'] })).toThrow(/cannot start in Reserves/)
  })

  it('DTG-029 DTG-012 Rapid Ingress is offered for the Miasmic Arrival pair in Reserves (attached unit = one target) (Deep Strike through the enhancement counts)', () => {
    const s = makeState({ reserves: ['typhus', 'poxwalkers-a'] })
    s.round = 2
    s.phase = 'movement'
    s.activePlayer = 'B'
    s.phaseState = emptyPhaseState()
    s.players.A.cp = 2
    const offered = stratagemService.options(s, 'A', 'movement.end', {}).filter((x) => x.stratagemId === 'core.s.rapid-ingress').map((x) => x.targets.unitIds?.[0])
    expect(offered).toContain(POX)
    // round 1 Reserves never arrive
    s.round = 1
    expect(stratagemService.options(s, 'A', 'movement.end', {}).filter((x) => x.stratagemId === 'core.s.rapid-ingress')).toHaveLength(0)
  })
})
