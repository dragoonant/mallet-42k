// GameSetup fixtures matching tests/fixtures/bundle.ts
import type { GameSetup, PlayerSetup } from '../../src/engine'

export function makePlayerA(overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return {
    name: 'Red', faction: 'red', patrolId: 'red.patrol', enhancementId: 'red.e.sharp', secondaryId: 'red.sec.hold',
    attachments: [{ leaderRef: 'boss', bodyguardRef: 'grunts' }], reserves: [], battleReadyVp: 0, ...overrides,
  }
}

export function makePlayerB(overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return {
    name: 'Blu', faction: 'blu', patrolId: 'blu.patrol', enhancementId: 'blu.e.big', secondaryId: 'blu.sec.zone',
    attachments: [], reserves: [], battleReadyVp: 0, ...overrides,
  }
}

// default: sides and first turn fixed so tests skip the roll-offs; pass sides: 'rollOff' / firstTurn: 'rollOff' to exercise them
export function makeSetup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    missionId: 'mission.test',
    terrainLayoutId: 'terrain.test',
    players: { A: makePlayerA(), B: makePlayerB() },
    sides: { attacker: 'A' },
    firstTurn: 'A',
    dataVersion: 'test-1',
    ...overrides,
  }
}
