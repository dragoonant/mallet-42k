import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

// Cross-reference check for the Astra Militarum data (the schema validator only checks shapes).
describe('astra-militarum data', async () => {
  const bundle = await loadBundle()
  const faction = bundle.factions['astra-militarum']
  const patrol = bundle.patrols['am.cp.karsks-gunners']

  it('faction lists its patrol, army rule and detachment content', () => {
    expect(faction).toBeDefined()
    expect(faction.combatPatrols).toEqual(['am.cp.karsks-gunners'])
    expect(bundle.abilities[faction.armyRule]).toBeDefined()
    for (const d of faction.detachments) {
      for (const id of d.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
      for (const id of d.enhancements) expect(bundle.enhancements[id], id).toBeDefined()
    }
  })

  it('patrol has 5 units and 28 models, all datasheets and weapons resolve', () => {
    expect(patrol.units).toHaveLength(5)
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(28)
    for (const u of patrol.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.composition.reduce((n, c) => n + c.default, 0)).toBe(u.size)
      for (const c of ds.composition) for (const w of c.weapons.default) expect(bundle.weapons[w], w).toBeDefined()
      for (const g of u.wargear ?? []) {
        expect(ds.composition.some((c) => c.modelId === g.modelId), g.modelId).toBe(true)
        for (const w of g.weapons) expect(bundle.weapons[w], w).toBeDefined()
      }
      for (const a of ds.abilities) if (typeof a === 'string') expect(bundle.abilities[a], a).toBeDefined()
    }
  })

  it('Karsk unit is the warlord, a Leader attached to shock-a, with an OFFICER model first', () => {
    expect(patrol.warlord).toBe('karsk')
    const karsk = patrol.units.find((u) => u.ref === 'karsk')!
    expect(karsk.attachTo).toBe('shock-a')
    expect(karsk.enhancement).toBe('am.e.command-laurels')
    const ds = bundle.datasheets[karsk.datasheet]
    expect(ds.composition[0].keywords).toContain('OFFICER')
    expect(ds.leader?.attachTo).toContain('am.cadian-shock-troops')
    expect(patrol.secondaries.find((s) => s.default)?.id).toBe('am.sec.hold-the-line')
  })

  it('orders referenced by Voice of Command exist and end on battle-shock', () => {
    const voc = bundle.abilities['am.a.voice-of-command']
    for (const id of voc.params!.orderIds as string[]) expect(bundle.abilities[id].params?.endsOnBattleShock).toBe(true)
  })

  it('field ordnance battery can split into two single-model units', () => {
    expect(bundle.abilities['am.a.patrol-squads'].params).toEqual({ sizes: [1, 1] })
    expect(bundle.datasheets['am.field-ordnance-battery'].abilities).toContain('am.a.patrol-squads')
  })
})
