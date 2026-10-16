import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PATROL = 'da.cp.mordekais-judgement'

describe('dark-angels data', () => {
  it('DAR-001 patrol loads: 4 units, 10 models; Mordekai WARLORD with Stoic Exemplar attached to the Intercessors; Endless Hunt default', async () => {
    const b = await loadBundle()
    const p = b.patrols[PATROL]
    expect(p).toBeTruthy()
    expect(p.faction).toBe('dark-angels')
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(10)
    expect(p.warlord).toBe('chaplain-mordekai')
    const m = p.units.find((u) => u.ref === 'chaplain-mordekai')!
    expect(m.enhancement).toBe('da.e.stoic-exemplar')
    expect(m.attachTo).toBe('intercessor-squad')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('da.sec.endless-hunt')
    expect(p.stratagems).toEqual(['da.s.mj-unyielding', 'da.s.mj-march-of-vengeance', 'da.s.mj-relic-munitions'])
    const f = b.factions['dark-angels']
    expect(f.combatPatrols).toEqual([PATROL, 'da.cp.the-vengeful-brethren'])
    expect(f.factionKeyword).toBe('ADEPTUS ASTARTES')
    expect(f.armyRule).toBe('sm.a.oath-of-moment')
  })

  it('DAR-002 every datasheet carries ADEPTUS ASTARTES + DARK ANGELS and stat rows match the CP page; SM patrols unchanged', async () => {
    const b = await loadBundle()
    const sheets = ['da.chaplain-mordekai', 'da.intercessor-squad', 'da.inceptor-squad', 'da.redemptor-dreadnought']
    for (const id of sheets) {
      expect(b.datasheets[id].factionKeywords).toEqual(['ADEPTUS ASTARTES', 'DARK ANGELS'])
      expect(b.datasheets[id].keywords).toContain('IMPERIUM')
      expect(b.datasheets[id].abilities).toContain('sm.a.oath-of-moment')
    }
    expect(b.datasheets['da.chaplain-mordekai']).toMatchObject({ stats: { M: 6, T: 4, Sv: 3, W: 4, Ld: 5, OC: 1 }, invuln: 4 })
    expect(b.datasheets['da.intercessor-squad'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(b.datasheets['da.inceptor-squad'].stats).toMatchObject({ M: 10, T: 6, Sv: 3, W: 3, Ld: 6, OC: 1 })
    expect(b.datasheets['da.redemptor-dreadnought'].stats).toMatchObject({ M: 8, T: 10, Sv: 2, W: 12, Ld: 6, OC: 4 })
    expect(b.datasheets['da.chaplain-mordekai'].keywords).not.toContain('INFANTRY')
    expect(b.datasheets['da.intercessor-squad'].keywords).toContain('BATTLELINE')
    expect(b.datasheets['da.inceptor-squad'].coreAbilities.map((c) => c.ability)).toEqual(['DEEP_STRIKE'])
    expect(b.datasheets['da.redemptor-dreadnought'].coreAbilities).toEqual([{ ability: 'DEADLY_DEMISE', value: 'D3' }])
    expect(b.datasheets['da.redemptor-dreadnought'].damaged).toMatchObject({ threshold: 4 })
    expect(b.datasheets['da.chaplain-mordekai'].leader).toMatchObject({ attachTo: ['da.intercessor-squad'], effects: ['da.a.litany-of-hate'] })
    const comp = b.datasheets['da.intercessor-squad'].composition
    expect(comp.map((c) => [c.modelId, c.min, c.max, c.default])).toEqual([['sergeant', 1, 1, 1], ['intercessor', 4, 9, 4]])
    expect(b.patrols['sm.cp.strike-force-octavius'].units).toHaveLength(4)
    expect(b.patrols['sm.cp.strike-team-solarien'].units).toHaveLength(4)
  })

  it('DAR-002 weapon profiles match the CP page; reused SM weapon ids exist and are unchanged', async () => {
    const b = await loadBundle()
    const row = (id: string) => {
      const w = b.weapons[id]
      expect(w, id).toBeTruthy()
      return [w.type, w.range, w.A, w.skill, w.S, w.AP, w.D, w.abilities.map((a) => a.ability).sort()]
    }
    expect(row('da.w.absolvor-bolt-pistol')).toEqual(['ranged', 18, 1, 3, 5, -1, 2, ['PISTOL']])
    expect(row('da.w.crozius-arcanum')).toEqual(['melee', 0, 5, 2, 6, -1, 2, []])
    expect(row('da.w.bolt-rifle')).toEqual(['ranged', 24, 2, 3, 4, -1, 1, ['ASSAULT', 'HEAVY']])
    expect(row('da.w.assault-bolters')).toEqual(['ranged', 18, 3, 3, 5, -1, 2, ['ASSAULT', 'PISTOL', 'SUSTAINED_HITS', 'TWIN_LINKED']])
    expect(b.weapons['da.w.assault-bolters'].abilities.find((a) => a.ability === 'SUSTAINED_HITS')!.value).toBe(2)
    expect(row('da.w.icarus-rocket-pod')).toEqual(['ranged', 24, 'D3', 3, 8, -1, 2, ['ANTI']])
    expect(b.weapons['da.w.icarus-rocket-pod'].abilities[0]).toMatchObject({ keyword: 'FLY', value: 2 })
    expect(row('da.w.macro-plasma-incinerator')).toEqual(['ranged', 36, 'D6+1', 3, 8, -3, 2, ['BLAST']])
    expect(row('da.w.macro-plasma-incinerator-supercharge')).toEqual(['ranged', 36, 'D6+1', 3, 9, -4, 3, ['BLAST', 'HAZARDOUS']])
    expect(b.weapons['da.w.macro-plasma-incinerator'].profileGroup).toBe('da.w.macro-plasma-incinerator')
    expect(b.weapons['da.w.macro-plasma-incinerator-supercharge'].profileGroup).toBe('da.w.macro-plasma-incinerator')
    expect(row('da.w.onslaught-gatling-cannon')).toEqual(['ranged', 24, 8, 3, 5, 0, 1, ['DEVASTATING_WOUNDS']])
    expect(row('da.w.twin-fragstorm-grenade-launcher')).toEqual(['ranged', 18, 'D6', 3, 4, 0, 1, ['BLAST', 'TWIN_LINKED']])
    expect(row('da.w.redemptor-fist')).toEqual(['melee', 0, 5, 3, 12, -2, 3, []])
    expect(row('sm.w.bolt-pistol')).toEqual(['ranged', 12, 1, 3, 4, 0, 1, ['PISTOL']])
    expect(row('sm.w.close-combat-weapon')).toEqual(['melee', 0, 3, 3, 4, 0, 1, []])
    expect(row('sm.w.power-weapon')).toEqual(['melee', 0, 4, 3, 5, -2, 1, []])
    // every weapon a Dark Angels model carries resolves
    for (const id of ['da.chaplain-mordekai', 'da.intercessor-squad', 'da.inceptor-squad', 'da.redemptor-dreadnought']) {
      for (const c of b.datasheets[id].composition) for (const w of c.weapons.default) expect(b.weapons[w], `${id} ${w}`).toBeTruthy()
    }
  })

  it('DAR-003..006 abilities, enhancements, stratagems and secondaries are wired to the spec ids and hooks', async () => {
    const b = await loadBundle()
    expect(b.abilities['da.a.litany-of-hate']).toMatchObject({ trigger: 'woundRoll', effect: { modifyRoll: { roll: 'wound', value: 1 } } })
    const stoic = b.enhancements['da.e.stoic-exemplar']
    expect(stoic.restriction).toEqual({ keyword: ['CHAPLAIN'] })
    expect(b.enhancements['da.e.zealous-wrath'].restriction).toEqual({ keyword: ['CHAPLAIN'] })
    expect(b.factions['dark-angels'].detachments[0].enhancements).toEqual(['da.e.stoic-exemplar', 'da.e.zealous-wrath'])
    expect(b.stratagems['da.s.mj-march-of-vengeance']).toMatchObject({ code: 'marchOfVengeance', cost: 1 })
    expect(b.stratagems['da.s.mj-relic-munitions']).toMatchObject({ code: 'relicMunitions', cost: 1 })
    expect(b.stratagems['da.s.mj-unyielding']).toMatchObject({ category: 'strategicPloy', cost: 1 })
    const secs = b.patrols[PATROL].secondaries
    expect(secs.map((s) => s.id)).toEqual(['da.sec.endless-hunt', 'da.sec.archeotech-reliquary'])
    expect(secs[0].scoring[0]).toMatchObject({ code: 'endlessHunt', when: 'turn.end', who: 'active', rounds: { from: 2, to: 5 } })
    expect(secs[1].scoring.map((r) => r.code)).toEqual(['archeotechReliquaryPick', 'archeotechReliquaryScore'])
  })
})
