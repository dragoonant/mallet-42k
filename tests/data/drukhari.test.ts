import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('drukhari The Blades of Torment data', () => {
  it('DRU-001 patrol loads: 5 units, 18 models, Archon WARLORD with Shudderworm Bottle attached to the Kabalites, default Rapacious Raiders', async () => {
    const b = await loadBundle()
    const p = b.patrols['drk.cp.blades-of-torment']
    expect(p).toBeTruthy()
    expect(p.faction).toBe('drukhari')
    expect(p.units).toHaveLength(5)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(18)
    expect(p.warlord).toBe('archon')
    const archon = p.units.find((u) => u.ref === 'archon')!
    expect(archon.enhancement).toBe('drk.e.shudderworm-bottle')
    expect(archon.attachTo).toBe('kabalites')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('drk.sec.rapacious-raiders')
    expect(p.stratagems).toEqual(['drk.s.quicksilver-reactions', 'drk.s.many-cuts', 'drk.s.there-and-gone'])
    expect(b.factions['drukhari'].combatPatrols).toEqual(['drk.cp.blades-of-torment'])
    expect(b.factions['drukhari'].factionKeyword).toBe('DRUKHARI')
  })

  it('DRU-002 datasheet stats, keywords, invulnerable saves and transport match the spec', async () => {
    const b = await loadBundle()
    const ds = (id: string) => b.datasheets[id]
    expect(ds('drk.archon')).toMatchObject({ invuln: 2, stats: { M: 8, T: 3, Sv: 4, W: 4, Ld: 6, OC: 1 } })
    expect(ds('drk.archon').leader!.attachTo).toEqual(['drk.kabalite-warriors'])
    expect(ds('drk.archon').composition[0].keywords).toEqual(['ARCHON'])
    expect(ds('drk.kabalite-warriors')).toMatchObject({ invuln: 6, stats: { M: 8, T: 3, Sv: 4, W: 1, Ld: 6, OC: 2 } })
    expect(ds('drk.incubi')).toMatchObject({ invuln: 5, stats: { M: 7, T: 3, Sv: 3, W: 1, Ld: 6, OC: 1 } })
    expect(ds('drk.incubi').composition.find((m) => m.modelId === 'klaivex')!.statsOverride).toEqual({ W: 2 })
    expect(ds('drk.raider')).toMatchObject({ invuln: 6, stats: { M: 14, T: 8, Sv: 4, W: 10, Ld: 6, OC: 2 } })
    expect(ds('drk.ravager')).toMatchObject({ invuln: 6, stats: { M: 14, T: 9, Sv: 4, W: 11, Ld: 6, OC: 3 } })
    expect(ds('drk.ravager').damaged!.threshold).toBe(4)
    expect(ds('drk.raider').transport).toEqual({ capacity: 11, keywords: ['DRUKHARI', 'INFANTRY'], firingDeck: 11 })
    for (const id of ['drk.archon', 'drk.kabalite-warriors', 'drk.incubi', 'drk.raider', 'drk.ravager']) {
      expect(ds(id).factionKeywords, id).toEqual(['DRUKHARI'])
      expect(ds(id).keywords, id).toContain('AELDARI')
      expect(ds(id).abilities, id).toContain('drk.a.power-from-pain')
    }
    expect(ds('drk.incubi').abilities).toContain('drk.a.tormentors')
    expect(ds('drk.archon').abilities).toContain('drk.a.shadowfield')
    const kabModels = Object.fromEntries(ds('drk.kabalite-warriors').composition.map((m) => [m.modelId, m.default]))
    expect(kabModels).toEqual({ sybarite: 1, warrior: 7, 'shredder-warrior': 1, 'cannon-warrior': 1 })
  })

  it('DRU-002 weapon profiles match the spec (incl. splinter cannon BS 4+, dark lance D6+2)', async () => {
    const b = await loadBundle()
    const w = (id: string) => b.weapons[`drk.w.${id}`]
    expect(w('splinter-cannon')).toMatchObject({ range: 36, A: 3, skill: 4, S: 3, AP: -1, D: 2 })
    expect(w('splinter-rifle')).toMatchObject({ range: 24, A: 2, skill: 3, S: 2, AP: 0, D: 1 })
    expect(w('shredder')).toMatchObject({ range: 18, A: 'D6', skill: null, S: 6 })
    expect(w('shredder').abilities.map((a) => a.ability)).toEqual(['ASSAULT', 'TORRENT'])
    expect(w('huskblade')).toMatchObject({ type: 'melee', A: 5, skill: 2, S: 3, AP: -2, D: 2 })
    expect(w('demiklaives-single')).toMatchObject({ A: 3, S: 4, AP: -2, D: 2 })
    expect(w('demiklaives-dual')).toMatchObject({ A: 6, S: 4, AP: -1, D: 1 })
    expect(w('demiklaives-dual').abilities.map((a) => a.ability)).toContain('TWIN_LINKED')
    expect(w('demiklaives-single').profileGroup).toBe(w('demiklaives-dual').profileGroup)
    expect(w('dark-lance')).toMatchObject({ range: 36, A: 1, skill: 3, S: 12, AP: -3, D: 'D6+2' })
    expect(w('disintegrator-cannon')).toMatchObject({ range: 36, A: 3, skill: 3, S: 5, AP: -2, D: 2 })
    expect(w('bladevanes')).toMatchObject({ A: 3, skill: 4, S: 6, AP: 0, D: 1 })
    expect(w('splinter-rifle').abilities).toContainEqual({ ability: 'ANTI', keyword: 'INFANTRY', value: 3 })
  })

  it('DRU-001 every referenced id exists and the hook-backed abilities carry their code names', async () => {
    const b = await loadBundle()
    const p = b.patrols['drk.cp.blades-of-torment']
    for (const id of p.stratagems) expect(b.stratagems[id], id).toBeTruthy()
    for (const e of p.enhancements) expect(b.enhancements[e.id], e.id).toBeTruthy()
    for (const u of p.units) {
      const d = b.datasheets[u.datasheet]
      expect(d, u.datasheet).toBeTruthy()
      for (const m of d.composition) for (const wid of m.weapons.default) expect(b.weapons[wid], wid).toBeTruthy()
      for (const a of d.abilities) if (typeof a === 'string') expect(b.abilities[a], a).toBeTruthy()
    }
    expect(b.abilities['drk.a.power-from-pain'].code).toBe('powerFromPain')
    expect(b.abilities['drk.a.shadowfield'].code).toBe('shadowfield')
    expect(b.abilities['drk.a.tormentors'].code).toBe('pistonDrivenBrutality')
    expect(b.stratagems['drk.s.there-and-gone'].code).toBe('thereAndGone')
    const codes = p.secondaries.flatMap((s) => s.scoring.map((r) => r.code))
    expect(codes).toEqual(['reclaimAndDominate', 'murderousMonster'])
  })
})
