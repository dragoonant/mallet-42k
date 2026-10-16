import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('space-marines Strike Team Solarien data', () => {
  it('SOL-001 patrol loads: 4 units, 15 models, Solarien WARLORD with Auto-choral Resonators attached to Infiltrators; Octavius unchanged', async () => {
    const b = await loadBundle()
    const p = b.patrols['sm.cp.strike-team-solarien']
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    expect(p.warlord).toBe('lieutenant-solarien')
    const sol = p.units.find((u) => u.ref === 'lieutenant-solarien')!
    expect(sol.enhancement).toBe('sm.e.auto-choral-resonators')
    expect(sol.attachTo).toBe('infiltrator-squad')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('sm.sec.reconnaissance-in-force')
    expect(b.factions['sm'].combatPatrols).toEqual(['sm.cp.strike-force-octavius', 'sm.cp.strike-team-solarien'])
    expect(b.patrols['sm.cp.strike-force-octavius'].units).toHaveLength(4)
  })

  it('SOL-002 Patrol Squads: Infiltrators split into two 5-model halves, each keeping Omni-scramblers', async () => {
    const b = await loadBundle()
    const inf = b.patrols['sm.cp.strike-team-solarien'].units.find((u) => u.ref === 'infiltrator-squad')!
    expect(inf.patrolSquads!.map((h) => h.size)).toEqual([5, 5])
    const ds = b.datasheets['sm.infiltrator-squad']
    expect(ds.abilities).toContain('sm.a.omni-scramblers')
    expect(ds.abilities).toContain('sm.a.patrol-squads')
    for (const t of ['sm.lieutenant-solarien', 'sm.librarian-xarius']) {
      expect(b.datasheets[t].leader!.attachTo).toEqual(['sm.infiltrator-squad'])
    }
  })

  it('SOL-003 profiles match the CP page; reused weapon ids unchanged', async () => {
    const b = await loadBundle()
    const w = b.weapons
    expect(w['sm.w.accelerator-autocannon']).toMatchObject({ range: 48, A: 3, skill: 4, S: 8, AP: -1, D: 2 })
    expect(w['sm.w.bolt-pistol-solarien']).toMatchObject({ range: 12, A: 1, skill: 2, S: 4, AP: 0, D: 1 })
    expect(w['sm.w.master-crafted-scoped-bolt-carbine']).toMatchObject({ range: 24, A: 2, skill: 2, S: 4, D: 2 })
    expect(w['sm.w.paired-combat-blades']).toMatchObject({ A: 5, skill: 2, S: 4, AP: 0, D: 1 })
    expect(w['sm.w.marksman-bolt-carbine']).toMatchObject({ range: 24, A: 2, skill: 3, S: 4, D: 1 })
    expect(w['sm.w.bolt-pistol']).toMatchObject({ skill: 3 })
    const sup = b.datasheets['sm.suppressor-squad']
    expect(sup.stats.M).toBe(12)
    expect(sup.coreAbilities).toEqual([])
    expect(b.datasheets['sm.infiltrator-squad'].composition[0].min).toBe(10)
    const sol = b.datasheets['sm.lieutenant-solarien']
    expect(sol.coreAbilities.find((c) => c.ability === 'SCOUTS')!.value).toBe(6)
    expect(sol.stats).toMatchObject({ M: 6, T: 4, W: 4, OC: 1 })
  })
})
