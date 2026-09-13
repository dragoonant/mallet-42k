import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, EngineInvariantError, TRIGGER_HOOK, hooksForDescriptor, createGame, DEFAULT_MODULES } from '../../src/engine'
import { schemas } from '../../src/data/schema'
import { makeSetup } from '../fixtures'

describe('engine contracts', () => {
  it('exports version; createGame without a registered bundle is a programmer error', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(() => createGame(makeSetup(), 'seed')).toThrow(EngineInvariantError)
    expect(new EngineInvariantError('x').name).toBe('EngineInvariantError')
  })
  it('maps every data trigger to a hook and ships every schema', () => {
    expect(Object.keys(TRIGGER_HOOK)).toHaveLength(25)
    for (const s of Object.values(schemas)) expect(s.$id).toMatch(/^https:\/\/mallet42k\.dev\/schemas\/.+\.schema\.json$/)
  })
  it('hooksForDescriptor = trigger hook + every hook its effect keys need', () => {
    expect(hooksForDescriptor({ id: 'x', name: 'x', text: 'x', trigger: 'always', effect: { invuln: 4 } })).toEqual(['onStatQuery', 'onSaveRoll'])
    expect(hooksForDescriptor({ id: 'x', name: 'x', text: 'x', trigger: 'hitRoll', effect: [{ reroll: 'ones' }, { modifyRoll: { roll: 'hit', value: 1 } }] })).toEqual(
      ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onDamageRoll', 'onChargeRoll', 'onAdvanceRoll', 'onBattleShockTest'],
    )
    expect(hooksForDescriptor({ id: 'x', name: 'x', text: 'x', trigger: 'phaseStart', code: 'foo' })).toEqual(['onPhaseStart'])
  })
  it('every phase has a module and every service is registered', () => {
    expect(Object.keys(DEFAULT_MODULES.phases).sort()).toEqual(['charge', 'command', 'deployment', 'fight', 'movement', 'setup', 'shooting'])
    expect(Object.keys(DEFAULT_MODULES.services).sort()).toEqual(['attack', 'effects', 'enhancements', 'hooks', 'leaders', 'los', 'missions', 'objectives', 'stratagems', 'terrain', 'transports', 'weapons'])
  })
})
