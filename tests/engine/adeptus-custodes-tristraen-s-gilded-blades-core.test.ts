// Tristraen's Gilded Blades engine change E1 (docs/spec/factions/adeptus-custodes--tristraen-s-gilded-blades.md §7.1):
// deductVp plus the Consecrated Ground destroy fan-outs in missions.ts. Uses a generic patrol; the rule is injected.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle, ScoringRule } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type GameEvent, type GameSetup, type GameState, type PlayerSetup,
} from '../../src/engine'
import { deductVp, missionService } from '../../src/engine/missions'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const P = (): PlayerSetup => ({
  name: 'P', faction: 'adepta-sororitas', patrolId: 'ade.cp.sanctuary-guardians', enhancementId: 'ade.e.defender-of-the-faith',
  secondaryId: 'ade.sec.hallowed-retribution', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sacresants' }], reserves: [], battleReadyVp: 0,
})

const RULE: ScoringRule = {
  id: 'consecrated-ground-tgb', when: 'battle.end', rounds: { from: 1, to: 5 }, who: 'both', rule: 'custom',
  code: 'tgbConsecratedGround', pointsPer: 3, cap: 999, params: { lossPerModel: 1, keyword: 'ADEPTA SORORITAS' },
} as unknown as ScoringRule

function makeState(): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: P(), B: P() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'tri-core', ENGINE_VERSION)
  s.round = 2; s.activePlayer = 'A'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
  s.mission.secondaries.A = [RULE]
  return s
}

function run(s: GameState) {
  const { ctx, events } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
  return { ctx, events: events as GameEvent[] }
}

describe('Consecrated Ground (TRI-4.2) engine plumbing', () => {
  it('TRI-4.2 deductVp removes at most the source total and never goes below 0', () => {
    const s = makeState()
    s.players.A.vp = 5; s.players.A.vpBySource[RULE.id] = 2
    const { ctx, events } = run(s)
    expect(deductVp(ctx, 'A', 5, RULE.id)).toBe(2)
    expect(s.players.A.vp).toBe(3)
    expect(s.players.A.vpBySource[RULE.id]).toBe(0)
    expect(deductVp(ctx, 'A', 1, RULE.id)).toBe(0)
    expect(events.filter((e) => e.type === 'VpScored')).toHaveLength(1)
  })

  it('TRI-4.2 an enemy unit destroyed awards the rule owner 3 VP', () => {
    const s = makeState()
    const { ctx } = run(s)
    missionService.unitDestroyed!(ctx, { unitId: 'B:sisters', byPlayer: 'A', byUnitId: 'A:sisters', byModelId: null })
    expect(s.players.A.vpBySource[RULE.id]).toBe(3)
    expect(s.players.A.vp).toBe(3)
  })

  it('TRI-4.2 losing a model of your own unit costs 1 VP, floored at the rule own total', () => {
    const s = makeState()
    const { ctx } = run(s)
    missionService.unitDestroyed!(ctx, { unitId: 'B:sisters', byPlayer: 'A', byUnitId: 'A:sisters', byModelId: null })
    const modelId = s.units['A:sisters'].models[0]
    for (let i = 0; i < 5; i++) missionService.modelDestroyed!(ctx, { unitId: 'A:sisters', modelId, byPlayer: 'B', byUnitId: null, byModelId: null })
    expect(s.players.A.vpBySource[RULE.id]).toBe(0)
    expect(s.players.A.vp).toBe(0)
  })

  it('TRI-4.2 a player without the rule neither gains nor loses', () => {
    const s = makeState()
    const { ctx } = run(s)
    missionService.unitDestroyed!(ctx, { unitId: 'A:sisters', byPlayer: 'B', byUnitId: 'B:sisters', byModelId: null })
    expect(s.players.B.vpBySource[RULE.id] ?? 0).toBe(0)
  })
})
