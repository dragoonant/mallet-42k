import { describe, expect, it } from 'vitest'
import { summariseEvents, turnTotals } from '../../src/client/ui/eventSummary'
import type { GameEvent, GameState } from '../../src/engine'

const base = { round: 1, turn: 'A', phase: 'shooting', player: 'A' } as const
const atk = { attackerUnitId: 'u1', attackerModelId: 'm1', weaponId: 'w1', targetUnitId: 'u2' }

const state = {
  units: { u1: { id: 'u1', name: 'Infernus Squad' }, u2: { id: 'u2', name: 'Boyz' } },
  players: { A: { name: 'Marines' }, B: { name: 'Orks' } },
  weapons: { w1: { id: 'w1', name: 'pyreblaster', skill: 3 } },
  stratagems: {}, abilities: {}, mission: { rules: [], scoring: [] },
} as unknown as GameState

describe('eventSummary', () => {
  it('groups one weapon profile into a single attack line', () => {
    let seq = 0
    const e = (x: object): GameEvent => ({ ...base, seq: ++seq, ...x }) as unknown as GameEvent
    const events: GameEvent[] = [
      e({ type: 'AttackSequenceStarted', unitId: 'u1', kind: 'ranged', overwatch: true }),
      e({ type: 'HitRolled', attack: atk, die: 6, final: 6, hit: true, critical: true, extraHits: 1, auto: false }),
      e({ type: 'HitRolled', attack: atk, die: 2, final: 2, hit: false, critical: false, extraHits: 0, auto: false }),
      e({ type: 'WoundRolled', attack: atk, die: 5, final: 5, needed: 4, wounded: true, critical: false, auto: false }),
      e({ type: 'WoundRolled', attack: atk, die: 4, final: 4, needed: 4, wounded: true, critical: false, auto: false }),
      e({ type: 'SaveRolled', attack: atk, modelId: 'x', kind: 'armour', die: 6, final: 6, needed: 6, saved: true }),
      e({ type: 'SaveRolled', attack: atk, modelId: 'x', kind: 'armour', die: 1, final: 1, needed: 6, saved: false }),
      e({ type: 'DamageApplied', unitId: 'u2', modelId: 'x', amount: 1, mortal: false, woundsRemaining: 0, source: atk }),
      e({ type: 'ModelDestroyed', unitId: 'u2', modelId: 'x', byPlayer: 'A', byUnitId: 'u1', byModelId: 'm1', kind: 'ranged' }),
    ]
    const lines = summariseEvents(events, state, null).filter((l) => l.kind === 'attack')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Infernus Squad — pyreblaster → Boyz [Overwatch]: 2 shots, 2 hit (exp 1.3 base) (1 crit, 1 extra), 2 wound (exp 1.0), 1 saved (exp 0.3), 1 dmg, 1 slain')
  })

  it('totals damage per unit for the newest turn only', () => {
    const d = (seq: number, round: number, amount: number): GameEvent =>
      ({ ...base, seq, round, type: 'DamageApplied', unitId: 'u2', modelId: 'x', amount, mortal: false, woundsRemaining: 0, source: atk }) as unknown as GameEvent
    const rows = turnTotals([d(1, 1, 5), d(2, 2, 2), d(3, 2, 1)], state)
    expect(rows.find((r) => r.unitId === 'u1')?.dealt).toBe(3)
    expect(rows.find((r) => r.unitId === 'u2')?.taken).toBe(3)
  })
})
