import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

// TYR-040: the Vardenghast Swarm loads with 5 units / 30 models, the Prime as WARLORD with Psychostatic Veil
describe('tyranids data', () => {
  it('TYR-040 patrol loads: 5 units, 30 models, Prime is WARLORD with Psychostatic Veil, default secondary Alpha Xenoform', async () => {
    const b = await loadBundle()
    const patrol = b.patrols["tyr.cp.vardenghast-swarm"]
    expect(patrol).toBeTruthy()
    expect(patrol.units).toHaveLength(5)
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(30)
    expect(patrol.warlord).toBe('prime')
    expect(patrol.units.find((u) => u.ref === 'prime')!.enhancement).toBe('tyr.e.psychostatic-veil')
    expect(patrol.secondaries.find((s) => s.default)!.id).toBe('tyr.sec.alpha-xenoform')
    expect(b.factions['tyranids'].factionKeyword).toBe('TYRANIDS')
  })
})
