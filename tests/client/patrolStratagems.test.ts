// A Space Marines mirror (two different SM patrols): each side's stratagem list is its own patrol's plus core.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { ENGINE_VERSION, createGameState, type GameSetup } from '../../src/engine'
import { buildPlayerSetup, patrolsForFaction } from '../../src/client/store/game'
import { stratagemsFor } from '../../src/client/ui/stratagemInfo'

const bundle = await loadBundle()
const smPatrols = patrolsForFaction(bundle, 'space-marines')

describe('patrol-scoped stratagems (SM mirror)', () => {
  it('each side sees only its own patrol stratagems plus core', () => {
    expect(smPatrols.length).toBeGreaterThanOrEqual(2)
    const [pa, pb] = smPatrols
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
      players: { A: { ...buildPlayerSetup(bundle, 'space-marines', undefined, false, undefined, pa.id), name: 'A' }, B: { ...buildPlayerSetup(bundle, 'space-marines', undefined, false, undefined, pb.id), name: 'B' } },
    }
    const s = createGameState(setup, bundle, 'patrol-strats', ENGINE_VERSION)
    for (const [pid, patrol] of [['A', pa], ['B', pb]] as const) {
      const ids = stratagemsFor(s, pid).map((x) => x.id)
      const own = stratagemsFor(s, pid).filter((x) => x.faction !== 'core').map((x) => x.id).sort()
      expect(own).toEqual([...patrol.stratagems].sort())
      expect(ids.length).toBeGreaterThan(own.length)
    }
  })
})
