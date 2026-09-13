import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, EngineInvariantError, TRIGGER_HOOK, step } from '../../src/engine'
import { schemas } from '../../src/data/schema'

describe('engine contracts (M0 stubs)', () => {
  it('exports version and stubbed step', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(() => step({} as never, {} as never, {} as never)).toThrow('not implemented')
    expect(new EngineInvariantError('x').name).toBe('EngineInvariantError')
  })
  it('maps every data trigger to a hook and ships every schema', () => {
    expect(Object.keys(TRIGGER_HOOK)).toHaveLength(25)
    for (const s of Object.values(schemas)) expect(s.$id).toMatch(/^https:\/\/mallet42k\.dev\/schemas\/.+\.schema\.json$/)
  })
})
