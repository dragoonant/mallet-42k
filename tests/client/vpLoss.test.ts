import { describe, expect, it } from 'vitest'
import { vpToastFrom } from '../../src/client/store/game'
import { summariseEvents } from '../../src/client/ui/eventSummary'
import type { GameEvent, GameState } from '../../src/engine'

const state = {
  units: {}, players: { A: { name: 'Custodes' }, B: { name: 'Orks' } },
  weapons: {}, stratagems: {}, abilities: {}, mission: { rules: [], scoring: [] },
} as unknown as GameState

const ev = (amount: number): GameEvent =>
  ({ seq: 1, round: 1, turn: 'A', phase: 'scoring', player: 'A', type: 'VpScored', amount, total: 0, source: 'consecrated-ground' }) as unknown as GameEvent

describe('VP loss display', () => {
  it('TRI-4.2 negative VpScored shows no plus sign in toast or summary', () => {
    const toast = vpToastFrom(state, null, [ev(-1)])
    expect(toast?.text).toContain('-1 VP')
    expect(toast?.text).not.toContain('+-')
    expect(vpToastFrom(state, null, [ev(2)])?.text).toContain('+2 VP')
    const lines = summariseEvents([ev(-1)], state, null).map((l) => l.text).join('\n')
    expect(lines).toContain('-1 VP')
    expect(lines).not.toContain('+-')
  })
})
