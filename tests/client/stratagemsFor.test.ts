// stratagemsFor mirrors the engine's ownedBy: with two same-faction patrols, each player sees only their own.
import { describe, expect, it } from 'vitest'
import type { GameState, RuntimeStratagem } from '../../src/engine'
import { stratagemsFor } from '../../src/client/ui/stratagemInfo'

const strat = (id: string, faction: string) => ({ id, name: id, faction } as unknown as RuntimeStratagem)
const state = {
  stratagems: {
    'core.s.a': strat('core.s.a', 'core'),
    'sm.s.octavius': strat('sm.s.octavius', 'space-marines'),
    'sm.s.solarien': strat('sm.s.solarien', 'space-marines'),
    'ork.s.x': strat('ork.s.x', 'orks'),
  },
  players: {
    0: { faction: 'space-marines', stratagemIds: ['sm.s.octavius'] },
    1: { faction: 'space-marines', stratagemIds: ['sm.s.solarien'] },
  },
} as unknown as GameState

describe('stratagemsFor (Octavius v Solarien mirror)', () => {
  it('shows core plus only the own patrol stratagems', () => {
    expect(stratagemsFor(state, 0 as never).map((s) => s.id)).toEqual(['core.s.a', 'sm.s.octavius'])
    expect(stratagemsFor(state, 1 as never).map((s) => s.id)).toEqual(['core.s.a', 'sm.s.solarien'])
  })
  it('falls back to faction when no stratagemIds', () => {
    const s2 = { ...state, players: { 0: { faction: 'space-marines' }, 1: { faction: 'orks' } } } as unknown as GameState
    expect(stratagemsFor(s2, 0 as never)).toHaveLength(3)
    expect(stratagemsFor(s2, 1 as never).map((s) => s.id)).toEqual(['core.s.a', 'ork.s.x'])
  })
})
