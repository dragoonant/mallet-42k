import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('death-guard data', () => {
  it('DTG-001 patrol loads: 6 units, 39 models, Typhus WARLORD with Walking Plague attached to poxwalkers-a, Grelch attached to Plague Marines, default secondary Contaminate Ground', async () => {
    const b = await loadBundle()
    const patrol = b.patrols['dg.cp.the-shambling-horde']
    expect(patrol).toBeTruthy()
    expect(b.factions['death-guard'].factionKeyword).toBe('DEATH GUARD')
    expect(patrol.units).toHaveLength(6)
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(39)
    expect(patrol.warlord).toBe('typhus')
    const typhus = patrol.units.find((u) => u.ref === 'typhus')!
    expect(typhus.enhancement).toBe('dg.e.walking-plague')
    expect(typhus.attachTo).toBe('poxwalkers-a')
    expect(patrol.units.find((u) => u.ref === 'grelch')!.attachTo).toBe('plague-marines')
    expect(patrol.secondaries.find((s) => s.default)!.id).toBe('dg.sec.contaminate-ground')
  })

  it('DTG-002 leaders attach only to their allowed units', async () => {
    const b = await loadBundle()
    expect(b.datasheets['dg.typhus'].leader!.attachTo).toEqual(['dg.poxwalkers'])
    expect(b.datasheets['dg.folgoth-grelch'].leader!.attachTo).toEqual(['dg.plague-marines'])
  })

  it('DTG-003 datasheet and weapon stats match the spec', async () => {
    const b = await loadBundle()
    const t = b.datasheets['dg.typhus']
    expect(t.stats).toMatchObject({ M: 5, T: 6, Sv: 2, W: 6 })
    expect(t.invuln).toBe(4)
    expect(t.composition[0].base).toEqual({ shape: 'round', mm: 50 })
    const px = b.datasheets['dg.poxwalkers']
    expect(px.stats).toMatchObject({ M: 4, T: 4, Sv: 7, W: 1, Ld: 8 })
    expect(b.datasheets['dg.plague-marines'].stats.OC).toBe(2)
    const strike = b.weapons['dg.w.manreaper-strike']
    expect(strike).toMatchObject({ A: 5, S: 9, AP: -2, D: 3 })
    const sweep = b.weapons['dg.w.manreaper-sweep']
    expect(sweep).toMatchObject({ A: 10, S: 6, AP: -1, D: 1 })
    const spewer = b.weapons['dg.w.plague-spewer']
    expect(spewer.A).toBe('D6')
    expect(spewer.skill).toBeNull()
    const names = spewer.abilities.map((a) => a.ability)
    expect(names).toContain('TORRENT')
    expect(names).toContain('ANTI')
  })

  it('DTG-003 every datasheet carries Nurgle\'s Gift', async () => {
    const b = await loadBundle()
    for (const id of ['dg.typhus', 'dg.folgoth-grelch', 'dg.plague-marines', 'dg.poxwalkers']) {
      expect(b.datasheets[id].abilities).toContain('dg.a.nurgles-gift')
      expect(b.datasheets[id].factionKeywords).toEqual(['DEATH GUARD'])
    }
  })
})
