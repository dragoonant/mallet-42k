import { describe, expect, it } from 'vitest'
import { effectCategory, turnFlagEntries } from '@/client/interaction/statusIcons'
import type { Unit } from '@/engine'

describe('status icons', () => {
  it('categorises effects by what they change', () => {
    expect(effectCategory([{ modifyRoll: { roll: 'hit', value: 1 } }], false, 'self')).toBe('buffHit')
    expect(effectCategory([{ modifyRoll: { roll: 'wound', value: 1 } }], false, 'self')).toBe('buffWound')
    expect(effectCategory([{ invuln: 4 }], false, 'self')).toBe('buffSave')
    expect(effectCategory([{ stealth: true }], false, 'friendly')).toBe('aura')
    expect(effectCategory([{ invuln: 4 }], true, 'self')).toBe('stratagem')
    expect(effectCategory([], false, undefined)).toBe('effect')
  })
  it('reads turn flags', () => {
    const u = { turn: { moveType: 'advance', chargedThisTurn: true } } as unknown as Unit
    expect(turnFlagEntries(u).map((f) => f.kind)).toEqual(['advanced', 'charged'])
  })
})
