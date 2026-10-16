// A hand-placed disembark lands on the side of the transport that was clicked (boardClick.findDisembarkSpot).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import { DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, type GameSetup, type GameState } from '../../src/engine'
import { movementModule } from '../../src/engine/phases/movement'
import { combinedUnitModels } from '../../src/client/interaction/geometry'
import { findDisembarkSpot } from '../../src/client/interaction/boardClick'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

describe('disembark placement follows the click', () => {
  it('drops on the clicked side of the Devilfish', () => {
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
      players: {
        A: { name: "T'au Empire", faction: 'tau-empire', patrolId: 'tau.cp.sudden-dawn-cadre', enhancementId: 'tau.e.prototype-systems', secondaryId: 'tau.sec.surprise-attack', attachments: [], reserves: [], battleReadyVp: 0, embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] },
        B: { name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin', attachments: [], reserves: [], battleReadyVp: 0 },
      },
    }
    const s: GameState = createGameState(setup, bundle, 'dis-click', ENGINE_VERSION)
    s.round = 2; s.activePlayer = 'A'; s.firstPlayer = 'A'; s.phase = 'movement'; s.phaseState = emptyPhaseState()
    placeUnit(s, 'A:devilfish', [[-10, 0]])
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    movementModule.enter(ctx)
    movementModule.advance(ctx)
    ;(movementModule.handle as (c: unknown, a: unknown, p: unknown) => unknown)(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: s.pending!.id, unitId: 'A:breachers' }, s.pending)
    s.pending = null
    movementModule.advance(ctx)
    expect((s.pending as { kind?: string } | null)?.kind).toBe('deployUnit')
    const models = combinedUnitModels(s, 'A:breachers')
    const cz = (r: { placements: { pos: { z: number } }[] }) => r.placements.reduce((a, p) => a + p.pos.z, 0) / r.placements.length
    const south = findDisembarkSpot(s, 'A:breachers', models, { x: -10, z: -6 }, 0, 'line')
    const north = findDisembarkSpot(s, 'A:breachers', models, { x: -10, z: 6 }, 0, 'line')
    expect([!!south, !!north]).toEqual([true, true])
    expect(cz(south!)).toBeLessThan(0)
    expect(cz(north!)).toBeGreaterThan(0)
  })
})
