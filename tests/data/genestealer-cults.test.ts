import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

// GEN-001: Hand of the Magus loads with 6 units / 32 models, Magus WARLORD with Psionic Shield, default Rise Up
describe('genestealer-cults data', () => {
  it('GEN-001 patrol loads: 6 units, 32 models, Magus is WARLORD with Psionic Shield attached to neophytes-a, default secondary Rise Up', async () => {
    const b = await loadBundle()
    const patrol = b.patrols['gsc.cp.hand-of-the-magus']
    expect(patrol).toBeTruthy()
    expect(patrol.units).toHaveLength(6)
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(32)
    expect(patrol.warlord).toBe('magus')
    const magus = patrol.units.find((u) => u.ref === 'magus')!
    expect(magus.enhancement).toBe('gsc.e.psionic-shield')
    expect(magus.attachTo).toBe('neophytes-a')
    expect(patrol.secondaries.find((s) => s.default)!.id).toBe('gsc.sec.rise-up')
    expect(patrol.units.find((u) => u.ref === 'rockgrinder')!.size).toBe(1)
    expect(b.factions['genestealer-cults'].factionKeyword).toBe('GENESTEALER CULTS')
  })
})
