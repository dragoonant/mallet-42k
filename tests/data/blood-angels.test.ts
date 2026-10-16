import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('blood-angels Strike Force Marcellos data', () => {
  it('BLO-001 patrol loads under faction blood-angels: 5 units, 15 models, Marcellos WARLORD with Baalite Bladesman attached to Intercessors', async () => {
    const b = await loadBundle()
    const p = b.patrols['ba.cp.strike-force-marcellos']
    expect(p).toBeTruthy()
    expect(p.faction).toBe('blood-angels')
    expect(p.units).toHaveLength(5)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    expect(p.warlord).toBe('librarian-marcellos')
    const m = p.units.find((u) => u.ref === 'librarian-marcellos')!
    expect(m.enhancement).toBe('ba.e.baalite-bladesman')
    expect(m.attachTo).toBe('intercessor-squad')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('ba.sec.angelic-wrath')
    expect(b.factions['blood-angels'].combatPatrols).toEqual(['ba.cp.strike-force-marcellos'])
    expect(b.factions['blood-angels'].armyRule).toBe('sm.a.oath-of-moment')
  })

  it('BLO-002 reused sm.* ids resolve; Octavius and Solarien patrols unchanged', async () => {
    const b = await loadBundle()
    for (const id of ['sm.w.bolt-pistol', 'sm.w.smite', 'sm.w.smite-focused', 'sm.w.force-weapon', 'sm.w.close-combat-weapon', 'sm.w.storm-bolter']) {
      expect(b.weapons[id], id).toBeTruthy()
    }
    expect(b.abilities['sm.a.oath-of-moment']).toBeTruthy()
    for (const ds of Object.values(b.datasheets).filter((d) => d.faction === 'blood-angels')) {
      expect(ds.factionKeywords).toEqual(['ADEPTUS ASTARTES', 'BLOOD ANGELS'])
      expect(ds.abilities).toContain('sm.a.oath-of-moment')
      for (const c of ds.composition) for (const wid of c.weapons.default) expect(b.weapons[wid], wid).toBeTruthy()
    }
    expect(b.patrols['sm.cp.strike-force-octavius'].units).toHaveLength(4)
    expect(b.patrols['sm.cp.strike-team-solarien'].units).toHaveLength(4)
  })

  it('BLO-003 Marcellos may lead only the Intercessor Squad', async () => {
    const b = await loadBundle()
    expect(b.datasheets['ba.librarian-marcellos'].leader!.attachTo).toEqual(['ba.intercessor-squad'])
  })

  it('BLO-014 datasheet stats exact', async () => {
    const b = await loadBundle()
    expect(b.datasheets['ba.librarian-marcellos'].stats).toEqual({ M: 6, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1 })
    expect(b.datasheets['ba.intercessor-squad'].stats).toMatchObject({ OC: 2 })
    expect(b.datasheets['ba.intercessor-squad'].keywords).toContain('BATTLELINE')
    expect(b.datasheets['ba.aggressor-squad'].stats).toMatchObject({ M: 5, T: 6, W: 3 })
    expect(b.datasheets['ba.impulsor'].stats).toMatchObject({ M: 12, T: 9, W: 11, OC: 2 })
    const t = b.datasheets['ba.impulsor'].transport!
    expect(t.capacity).toBe(6)
    expect(t.firingDeck).toBe(6)
    expect(t.excludeKeywords).toContain('GRAVIS')
  })

  it('BLO-023 weapon profiles match the spec', async () => {
    const b = await loadBundle()
    const w = b.weapons
    const ab = (id: string) => w[id].abilities.map((a) => a.ability)
    expect(w['ba.w.flamestorm-gauntlets']).toMatchObject({ range: 12, A: 'D6+1', skill: null, S: 4, AP: 0, D: 1 })
    expect(ab('ba.w.flamestorm-gauntlets')).toEqual(expect.arrayContaining(['TORRENT', 'TWIN_LINKED', 'IGNORES_COVER']))
    expect(w['ba.w.bolt-rifle']).toMatchObject({ range: 24, A: 2, skill: 3, S: 4, AP: -1, D: 1 })
    expect(ab('ba.w.bolt-rifle')).toEqual(expect.arrayContaining(['ASSAULT', 'HEAVY']))
    expect(ab('ba.w.occulus-bolt-carbine')).toEqual(expect.arrayContaining(['ASSAULT', 'IGNORES_COVER']))
    expect(w['ba.w.paired-combat-blades']).toMatchObject({ A: 3, skill: 3, S: 4, AP: 0, D: 1 })
    expect(ab('ba.w.paired-combat-blades')).toEqual(['SUSTAINED_HITS'])
    expect(w['ba.w.twin-power-fists']).toMatchObject({ A: 3, skill: 4, S: 8, AP: -2, D: 2 })
    expect(w['sm.w.paired-combat-blades']).toMatchObject({ A: 5, skill: 2 })
  })

  it('BLO-024 Bellicatus array: three profiles in one profile group', async () => {
    const b = await loadBundle()
    const ids = ['ba.w.bellicatus-frag', 'ba.w.bellicatus-icarus', 'ba.w.bellicatus-krak']
    expect(new Set(ids.map((i) => b.weapons[i].profileGroup)).size).toBe(1)
    expect(b.weapons['ba.w.bellicatus-frag'].abilities.map((a) => a.ability)).toContain('BLAST')
    expect(b.weapons['ba.w.bellicatus-icarus'].abilities[0]).toMatchObject({ ability: 'ANTI', keyword: 'FLY', value: 2 })
    expect(b.weapons['ba.w.bellicatus-krak']).toMatchObject({ A: 1, S: 8, AP: -2, D: 'D6' })
    const imp = b.datasheets['ba.impulsor'].composition[0].weapons.default
    expect(imp).toEqual(expect.arrayContaining(ids))
  })

  it('BLO-025 Incursors have Scouts 6 and exactly one haywire bearer model', async () => {
    const b = await loadBundle()
    const ds = b.datasheets['ba.incursor-squad']
    expect(ds.coreAbilities.find((c) => c.ability === 'SCOUTS')!.value).toBe(6)
    expect(ds.composition.map((c) => [c.modelId, c.default])).toEqual([['sergeant', 1], ['incursor', 3], ['incursor-haywire', 1]])
    expect(b.datasheets['ba.intercessor-squad'].coreAbilities.some((c) => c.ability === 'SCOUTS')).toBe(false)
  })

  it('BLO-005/006 enhancements restricted to LIBRARIAN; exactly one default', async () => {
    const b = await loadBundle()
    const p = b.patrols['ba.cp.strike-force-marcellos']
    expect(p.enhancements.filter((e) => e.default).map((e) => e.id)).toEqual(['ba.e.baalite-bladesman'])
    for (const e of p.enhancements) expect(b.enhancements[e.id].restriction?.keyword).toEqual(['LIBRARIAN'])
  })
})
