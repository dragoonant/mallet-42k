import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

// Cross-reference check for the Chaos Space Marines "Dark Zealots" patrol (DZE-001, DZE-025, DZE-026).
describe('chaos-space-marines dark-zealots data', async () => {
  const bundle = await loadBundle()
  const faction = bundle.factions['chaos-space-marines']
  const patrol = bundle.patrols['csm.cp.dark-zealots']

  it('DZE-026 faction lists both patrols; every referenced id resolves', () => {
    expect(faction.combatPatrols).toEqual(['csm.cp.zarkans-daemonkin', 'csm.cp.dark-zealots'])
    expect(faction.armyRule).toBe('csm.a.dark-pacts')
    expect(bundle.patrols['csm.cp.zarkans-daemonkin']).toBeDefined()
    expect(patrol.armyRule).toBe('csm.a.dark-pacts-dz')
    expect(bundle.abilities[patrol.armyRule!]).toBeDefined()
    for (const id of patrol.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
    for (const e of patrol.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const u of patrol.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.composition.reduce((n, c) => n + c.default, 0)).toBe(u.size)
      for (const c of ds.composition) for (const w of c.weapons.default) expect(bundle.weapons[w], w).toBeDefined()
      for (const g of [...(u.wargear ?? []), ...(u.patrolSquads ?? []).flatMap((p) => p.wargear)]) {
        expect(ds.composition.some((c) => c.modelId === g.modelId), g.modelId).toBe(true)
        for (const w of g.weapons) expect(bundle.weapons[w], w).toBeDefined()
      }
      for (const a of ds.abilities) if (typeof a === 'string') expect(bundle.abilities[a], a).toBeDefined()
    }
  })

  it('DZE-001 four units, 19 models, Ghallaron is the warlord attached to Legionaries', () => {
    expect(patrol.units.map((u) => u.size)).toEqual([3, 10, 5, 1])
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(19)
    expect(patrol.warlord).toBe('ghallaron')
    const g = patrol.units.find((u) => u.ref === 'ghallaron')!
    expect(g.attachTo).toBe('legionaries')
    expect(g.enhancement).toBe('csm.e.hateful-exhortation')
    expect(patrol.secondaries.find((s) => s.default)?.id).toBe('csm.sec.champion-of-the-dark-gods')
    expect(bundle.datasheets[g.datasheet].leader?.attachTo).toContain('csm.legionaries-dz')
  })

  it('DZE-002 Ghallaron unit: Ghallaron W4 Sv3 Ld5, Disciples W1 Sv6 Ld7, unit 4+ invuln', () => {
    const ds = bundle.datasheets['csm.ghallaron-the-pious']
    expect(ds.stats).toMatchObject({ Sv: 6, W: 1, Ld: 7 })
    expect(ds.invuln).toBe(4)
    expect(ds.composition[0].statsOverride).toEqual({ Sv: 3, W: 4, Ld: 5 })
    expect(ds.composition[0].keywords).toEqual(expect.arrayContaining(['CHARACTER', 'DARK APOSTLE']))
    expect(ds.composition[1].default).toBe(2)
  })

  it('DZE-003 Patrol Squads split into two 5-model halves covering the DZE-1.2 wargear', () => {
    const l = patrol.units.find((u) => u.ref === 'legionaries')!
    expect(l.patrolSquads).toHaveLength(2)
    for (const p of l.patrolSquads!) expect(p.wargear.reduce((n, g) => n + g.count, 0)).toBe(5)
    expect(bundle.abilities['csm.a.patrol-squads-legionaries'].params).toEqual({ sizes: [5, 5] })
    expect(bundle.datasheets['csm.legionaries-dz'].abilities).toContain('csm.a.patrol-squads-legionaries')
  })

  it('DZE-025 Dark Pacts (DZ) tests after the attacks and is on all four datasheets; no Veterans', () => {
    expect(bundle.abilities['csm.a.dark-pacts-dz'].params).toMatchObject({ testTiming: 'afterAttacks', excludeOverwatch: true })
    for (const id of ['csm.ghallaron-the-pious', 'csm.legionaries-dz', 'csm.havocs', 'csm.helbrute'])
      expect(bundle.datasheets[id].abilities).toContain('csm.a.dark-pacts-dz')
    expect(bundle.datasheets['csm.legionaries-dz'].abilities).not.toContain('csm.a.veterans-of-the-long-war')
  })

  it('existing Zarkan records are untouched', () => {
    expect(bundle.abilities['csm.a.dark-pacts'].params).not.toHaveProperty('testTiming')
    expect(bundle.datasheets['csm.legionaries'].abilities).toContain('csm.a.veterans-of-the-long-war')
    expect(bundle.weapons['csm.w.boltgun'].S).toBe(4)
  })

  it('DZE-024 Helbrute is a VEHICLE WALKER with Deadly Demise 1', () => {
    const ds = bundle.datasheets['csm.helbrute']
    expect(ds.keywords).toEqual(expect.arrayContaining(['VEHICLE', 'WALKER']))
    expect(ds.coreAbilities).toContainEqual({ ability: 'DEADLY_DEMISE', value: 1 })
  })
})
