// Embark / disembark of an attached Leader + bodyguard pair (E3): the client reads the pair as one passenger.
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../src/engine'
import { groupLabel, groupUnitIds, soleDeployUnit } from '../../src/client/interaction/embarkGroup'

const state = {
  units: {
    kab: { id: 'kab', name: 'Kabalite Warriors', attachedLeaderId: 'arc', bodyguardUnitId: null },
    arc: { id: 'arc', name: 'Archon', attachedLeaderId: null, bodyguardUnitId: 'kab' },
    solo: { id: 'solo', name: 'Incubi', attachedLeaderId: null, bodyguardUnitId: null },
  },
} as unknown as GameState

describe('attached pair helpers', () => {
  it('lists the bodyguard first whichever half is asked about', () => {
    expect(groupUnitIds(state, 'kab')).toEqual(['kab', 'arc'])
    expect(groupUnitIds(state, 'arc')).toEqual(['kab', 'arc'])
    expect(groupUnitIds(state, 'solo')).toEqual(['solo'])
  })

  it('names a pair once and a lone unit plainly', () => {
    expect(groupLabel(state, 'arc')).toBe('Kabalite Warriors with Archon')
    expect(groupLabel(state, 'solo')).toBe('Incubi')
  })

  it('a deployment offering one unit, or both halves of one pair, has a sole unit to place', () => {
    expect(soleDeployUnit(state, ['solo'])).toBe('solo')
    expect(soleDeployUnit(state, ['kab', 'arc'])).toBe('kab')
    expect(soleDeployUnit(state, ['arc', 'kab'])).toBe('kab')
    expect(soleDeployUnit(state, ['kab', 'solo'])).toBeNull()
    expect(soleDeployUnit(state, [])).toBeNull()
  })
})
