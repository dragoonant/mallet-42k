import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PID = 'lov.cp.warspekes-prospect'

describe('leagues of votann - Warspeke\'s Prospect data', () => {
  it('LEA-001 patrol loads: 4 units, 19 models; Kahl WARLORD with Waste Feeds the Void, attached to Hearthkyn; default secondary Toil Earns', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(19)
    expect(p.warlord).toBe('kahl')
    const k = p.units.find((u) => u.ref === 'kahl')!
    expect(k.enhancement).toBe('lov.e.waste-feeds-the-void')
    expect(k.attachTo).toBe('hearthkyn')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('lov.sec.toil-earns')
    expect(b.factions['leagues-of-votann'].combatPatrols).toContain(PID)
    expect(b.datasheets['lov.kahl-warspeke'].leader!.attachTo).toEqual(['lov.hearthkyn-warriors'])
    for (const id of ['lov.kahl-warspeke', 'lov.hearthkyn-warriors', 'lov.hernkyn-pioneers', 'lov.cthonian-beserks']) {
      expect(b.datasheets[id].factionKeywords).toEqual(['LEAGUES OF VOTANN'])
    }
  })

  it('LEA-002 Patrol Squads: Hearthkyn split into two 5-model parts holding the LEA-1.2 wargear', async () => {
    const b = await loadBundle()
    const h = b.patrols[PID].units.find((u) => u.ref === 'hearthkyn')!
    expect(h.patrolSquads!.map((s) => s.ref)).toEqual(['hearthkyn-a', 'hearthkyn-b'])
    for (const s of h.patrolSquads!) expect(s.wargear.reduce((n, w) => n + w.count, 0)).toBe(s.size)
    const ds = b.datasheets['lov.hearthkyn-warriors']
    const total = new Map<string, number>()
    for (const s of h.patrolSquads!) for (const w of s.wargear) total.set(w.modelId, (total.get(w.modelId) ?? 0) + w.count)
    for (const c of ds.composition) expect(total.get(c.modelId)).toBe(c.default)
    expect(ds.abilities).toContain('lov.a.patrol-squads-hearthkyn')
  })

  it('LEA-033 mole-launcher Beserk has W3 and 50 mm base; axe A4/A7, launcher D6+1 Blast Indirect Fire; others A3/A6', async () => {
    const b = await loadBundle()
    const comp = b.datasheets['lov.cthonian-beserks'].composition
    const mole = comp.find((m) => m.modelId === 'beserk-mole')!
    expect(mole.statsOverride).toEqual({ W: 3 })
    expect(mole.base.mm).toBe(50)
    expect(b.datasheets['lov.cthonian-beserks'].stats.W).toBe(2)
    expect(mole.weapons.default.map((w) => b.weapons[w].A)).toEqual(['D6+1', 4, 7])
    expect(comp.find((m) => m.modelId === 'beserk')!.weapons.default.map((w) => b.weapons[w].A)).toEqual([3, 6])
    expect(b.weapons['lov.w.mole-grenade-launcher'].abilities.map((a) => a.ability)).toEqual(['BLAST', 'INDIRECT_FIRE'])
  })

  it('LEA-034 Beserks FNP 5+; Pioneers Scouts 9 and MOUNTED (not INFANTRY)', async () => {
    const b = await loadBundle()
    expect(b.datasheets['lov.cthonian-beserks'].coreAbilities).toContainEqual({ ability: 'FEEL_NO_PAIN', value: 5 })
    const pi = b.datasheets['lov.hernkyn-pioneers']
    expect(pi.coreAbilities).toContainEqual({ ability: 'SCOUTS', value: 9 })
    expect(pi.keywords).toContain('MOUNTED')
    expect(pi.keywords).not.toContain('INFANTRY')
  })

  it('LEA-035 weapon profiles: magna-rail rifle and volkanite disintegrator', async () => {
    const b = await loadBundle()
    const ab = (id: string) => b.weapons[id].abilities.map((a) => a.ability)
    expect(ab('lov.w.magna-rail-rifle')).toEqual(['DEVASTATING_WOUNDS', 'HEAVY'])
    expect(b.weapons['lov.w.magna-rail-rifle'].D).toBe('D3+3')
    expect(ab('lov.w.volkanite-disintegrator')).toEqual(['DEVASTATING_WOUNDS'])
  })

  it('LEA-036 weapon profiles: HYLas auto rifle, rotary cannon, concussion gauntlet', async () => {
    const b = await loadBundle()
    const ab = (id: string) => b.weapons[id].abilities.map((a) => a.ability)
    expect(b.weapons['lov.w.hylas-auto-rifle'].abilities).toContainEqual({ ability: 'RAPID_FIRE', value: 3 })
    expect(ab('lov.w.hylas-auto-rifle')).toContain('ASSAULT')
    expect(b.weapons['lov.w.hylas-rotary-cannon'].abilities).toContainEqual({ ability: 'SUSTAINED_HITS', value: 1 })
    expect(ab('lov.w.twin-concussion-gauntlet')).toEqual(['TWIN_LINKED'])
  })

  it('LEA-016/014 enhancements and stratagems are the patrol set and resolve', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    expect(p.enhancements.map((e) => e.id).sort()).toEqual(['lov.e.pragmaat-comms-uplink', 'lov.e.waste-feeds-the-void'])
    for (const e of p.enhancements) expect(b.enhancements[e.id]).toBeTruthy()
    expect(p.stratagems).toEqual(['lov.s.payment-in-kind', 'lov.s.pan-spectral-sweep', 'lov.s.skeinwrought-physiology'])
    for (const s of p.stratagems) expect(b.stratagems[s]).toBeTruthy()
  })

  it('LEA-017 Toil Earns pick runs in the Deploy Armies window (round 0); Holy Apparatus is the optional secondary', async () => {
    const b = await loadBundle()
    const [toil, holy] = b.patrols[PID].secondaries
    expect(toil.scoring[0]).toMatchObject({ when: 'deployment.unit', rounds: { from: 0, to: 0 }, code: 'toilEarnsPick' })
    expect(toil.scoring[1]).toMatchObject({ when: 'turn.end', rounds: { from: 2, to: 5 }, who: 'active', pointsPer: 4 })
    expect(holy.default).toBe(false)
    expect(holy.scoring.map((r) => r.code)).toEqual(['holyApparatusPick', 'holyApparatusScore'])
  })

  it('every datasheet carries Eye of the Ancestors (hit and wound descriptors)', async () => {
    const b = await loadBundle()
    for (const id of ['lov.kahl-warspeke', 'lov.hearthkyn-warriors', 'lov.hernkyn-pioneers', 'lov.cthonian-beserks']) {
      expect(b.datasheets[id].abilities).toEqual(expect.arrayContaining(['lov.a.eye-of-the-ancestors', 'lov.a.eye-of-the-ancestors-wound']))
    }
    expect(b.abilities['lov.a.eye-of-the-ancestors'].params).toEqual({ min: 1 })
    expect(b.abilities['lov.a.eye-of-the-ancestors-wound'].params).toEqual({ min: 2 })
  })
})
