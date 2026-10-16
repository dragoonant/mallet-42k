import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

// Cross-reference check for the Thousand Sons "The Coven Temporus" patrol (THO-001, THO-002, THO-027).
describe('thousand-sons data', async () => {
  const bundle = await loadBundle()
  const faction = bundle.factions['thousand-sons']
  const patrol = bundle.patrols['ths.cp.the-coven-temporus']

  it('THO-001 patrol loads: 4 units, 26 models, Ahrak warlord with Temporal Sorceries, default secondary', () => {
    expect(faction.combatPatrols).toEqual(['ths.cp.the-coven-temporus'])
    expect(patrol.units.map((u) => u.size)).toEqual([1, 5, 10, 10])
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(26)
    expect(patrol.warlord).toBe('ahrak')
    expect(patrol.units.find((u) => u.ref === 'ahrak')!.enhancement).toBe('ths.e.temporal-sorceries')
    expect(patrol.secondaries.find((s) => s.default)?.id).toBe('ths.sec.sorcerous-ritual')
    expect(patrol.stratagems).toEqual(['ths.s.wreathed-in-warpflame', 'ths.s.mutant-cunning', 'ths.s.malign-entanglement'])
    expect(patrol.units.some((u) => u.attachTo)).toBe(false)
  })

  it('every referenced id resolves', () => {
    expect(bundle.abilities[faction.armyRule]).toBeDefined()
    for (const id of patrol.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
    for (const e of patrol.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const u of patrol.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.composition.reduce((n, c) => n + c.default, 0)).toBe(u.size)
      for (const c of ds.composition) for (const w of c.weapons.default) expect(bundle.weapons[w], w).toBeDefined()
      for (const a of ds.abilities) if (typeof a === 'string') expect(bundle.abilities[a], a).toBeDefined()
    }
  })

  it('THO-002 stats, invulns, and only the Sorcerer model is a PSYKER', () => {
    const ahrak = bundle.datasheets['ths.ahrak-the-time-weaver']
    expect(ahrak.stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1 })
    expect(ahrak.invuln).toBe(5)
    const sc = bundle.datasheets['ths.scarab-occult-terminators']
    expect(sc.stats).toMatchObject({ M: 5, T: 5, Sv: 2, W: 3, Ld: 6, OC: 1 })
    expect(sc.invuln).toBe(4)
    expect(sc.coreAbilities).toContainEqual({ ability: 'DEEP_STRIKE' })
    expect(sc.composition.filter((c) => c.keywords?.includes('PSYKER')).map((c) => c.modelId)).toEqual(['sorcerer'])
    expect(sc.keywords).not.toContain('PSYKER')
    const tz = bundle.datasheets['ths.tzaangors']
    expect(tz.stats).toMatchObject({ M: 6, T: 4, Sv: 6, W: 1, Ld: 7, OC: 2 })
    expect(tz.invuln).toBe(6)
    expect(tz.keywords).toContain('BATTLELINE')
    const sw = bundle.weapons['ths.w.screamer-invocation-witchfire']
    expect(sw.skill).toBeNull()
    expect(sw.profileGroup).toBe(bundle.weapons['ths.w.screamer-invocation-focused'].profileGroup)
    expect(sw.abilities).toContainEqual({ ability: 'TORRENT' })
  })

  it('THO-027 Implacable Guardians is a defender-side wound modifier gated on the Sorcerer', () => {
    const a = bundle.abilities['ths.a.implacable-guardians'] as any
    expect(a.trigger).toBe('woundRoll')
    expect(a.scope).toEqual({ who: 'attacker' })
    expect(a.when).toEqual({ strengthVsToughness: 'gt', unitHasModel: 'sorcerer' })
    expect(a.effect).toEqual({ modifyRoll: { roll: 'wound', value: -1 } })
  })

  it('Cabal values: Ahrak 2, Sorcerer 1; Weaver of Fates on every datasheet', () => {
    expect((bundle.abilities['ths.a.cabal-of-sorcerers-ahrak'] as any).params).toEqual({ value: 2 })
    expect((bundle.abilities['ths.a.cabal-of-sorcerers-sorcerer'] as any).params).toEqual({ value: 1, modelId: 'sorcerer' })
    for (const id of ['ths.ahrak-the-time-weaver', 'ths.scarab-occult-terminators', 'ths.tzaangors'])
      expect(bundle.datasheets[id].abilities).toContain('ths.a.weaver-of-fates')
  })
})
