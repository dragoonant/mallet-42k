import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const ID = 'gsc.cp.claw-of-ascension'

describe('genestealer-cults Claw of Ascension data', () => {
  it('CLA-001 patrol loads: 5 units, 17 models, Shanus WARLORD with Priority Kill Order attached to Jackals; Hand of the Magus unchanged', async () => {
    const b = await loadBundle()
    const p = b.patrols[ID]
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(5)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(17)
    expect(p.warlord).toBe('shanus')
    const shanus = p.units.find((u) => u.ref === 'shanus')!
    expect(shanus.enhancement).toBe('gsc.e.priority-kill-order')
    expect(shanus.attachTo).toBe('jackals')
    expect(b.datasheets['gsc.shanus-daskovian'].leader!.attachTo).toEqual(['gsc.atalan-jackals'])
    expect(p.secondaries.find((s) => s.default)!.id).toBe('gsc.sec.infiltration-agenda')
    expect(b.factions['genestealer-cults'].combatPatrols).toEqual(['gsc.cp.hand-of-the-magus', ID])
    expect(b.factions['genestealer-cults'].armyRule).toBe('gsc.a.cult-ambush')
    expect(b.patrols['gsc.cp.hand-of-the-magus'].units).toHaveLength(6)
  })

  it('CLA-002 wargear as built: mutant has no ranged weapon, 3 flamers, Wolfquad 4 W with mining laser, riders 2 W', async () => {
    const b = await loadBundle()
    const meta = b.datasheets['gsc.hybrid-metamorphs']
    const model = (id: string) => meta.composition.find((c) => c.modelId === id)!
    const ranged = (ids: string[]) => ids.filter((w) => b.weapons[w].type === 'ranged')
    expect(ranged(model('mutant').weapons.default)).toEqual([])
    expect(model('flamer').min).toBe(3)
    expect(model('flamer').weapons.default).toContain('gsc.w.hand-flamer')
    expect(model('leader').weapons.default).toContain('gsc.w.leaders-bio-weapons')
    const jk = b.datasheets['gsc.atalan-jackals']
    const wolf = jk.composition.find((c) => c.modelId === 'wolfquad')!
    expect(wolf.statsOverride).toEqual({ W: 4 })
    expect(wolf.weapons.default).toContain('gsc.w.mining-laser')
    expect(jk.stats.W).toBe(2)
    expect(jk.composition.reduce((n, c) => n + c.default, 0)).toBe(5)
  })

  it('data: Cult Ambush Claw variant is a patrol-scoped ability; Hand variant untouched', async () => {
    const b = await loadBundle()
    const claw = b.abilities['gsc.a.cult-ambush-claw']
    expect(claw.code).toBe('cultAmbush')
    expect(claw.params).toMatchObject({ success: 5, earlyRoundBonus: 1, earlyRoundsTo: 2, battlelineBonus: 0, firstRound: 2, lastRound: 3, whollyWithin: 3, resetOneShot: true, poolIsReserves: true })
    expect(b.datasheets['gsc.hybrid-metamorphs'].abilities).toEqual(['gsc.a.cult-ambush-claw'])
    expect(b.abilities['gsc.a.cult-ambush'].params).toEqual({ battlelineBonus: 3, success: 4, markerGap: 9, lastRound: 3 })
    for (const id of ['gsc.atalan-jackals', 'gsc.shanus-daskovian', 'gsc.achilles-ridgerunner']) {
      expect(b.datasheets[id].abilities).not.toContain('gsc.a.cult-ambush-claw')
    }
  })

  it('data: weapon profiles match the CP page', async () => {
    const b = await loadBundle()
    const w = b.weapons
    expect(w['gsc.w.cult-sniper-rifle']).toMatchObject({ range: 36, A: 1, skill: 3, S: 5, AP: -2, D: 3 })
    expect(w['gsc.w.hand-flamer']).toMatchObject({ range: 12, A: 'D6', skill: null, S: 3 })
    expect(w['gsc.w.leaders-bio-weapons']).toMatchObject({ A: 5, S: 5, AP: -1, D: 2 })
    expect(w['gsc.w.leaders-cult-weapons']).toMatchObject({ AP: -2, D: 1 })
    expect(w['gsc.w.metamorph-mutations-strike'].profileGroup).toBe(w['gsc.w.metamorph-mutations-sweep'].profileGroup)
    expect(w['gsc.w.mining-laser']).toMatchObject({ range: 24, S: 12, AP: -3, D: 'D6+1' })
    expect(w['gsc.w.achilles-missile-launcher']).toMatchObject({ range: 36, A: 3, S: 9, AP: -2, D: 3 })
    expect(w['gsc.w.twin-heavy-stubber'].abilities.map((a) => a.ability)).toEqual(['RAPID_FIRE', 'TWIN_LINKED'])
  })

  it('data: datasheet stats, bases and core abilities', async () => {
    const b = await loadBundle()
    const rr = b.datasheets['gsc.achilles-ridgerunner']
    expect(rr.stats).toMatchObject({ M: 12, T: 7, Sv: 3, W: 8, OC: 3 })
    expect(rr.composition[0].base).toEqual({ shape: 'oval', mm: 120, mm2: 92 })
    expect(rr.coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE')!.value).toBe(1)
    const meta = b.datasheets['gsc.hybrid-metamorphs']
    expect(meta.coreAbilities.find((c) => c.ability === 'FEEL_NO_PAIN')!.value).toBe(5)
    expect(meta.coreAbilities.find((c) => c.ability === 'SCOUTS')!.value).toBe(6)
    expect(b.datasheets['gsc.atalan-jackals'].coreAbilities.map((c) => c.ability)).toEqual(['SCOUTS', 'STEALTH'])
    expect(b.datasheets['gsc.shanus-daskovian'].keywords).toContain('JACKAL ALPHUS')
  })

  it('CLA-029 Scouts: Shanus, Jackals and the Ridgerunner 9", Metamorphs 6"; nobody has Deep Strike', async () => {
    const b = await loadBundle()
    const scouts = (id: string) => b.datasheets[id].coreAbilities.find((c) => c.ability === 'SCOUTS')?.value
    expect(scouts('gsc.shanus-daskovian')).toBe(9)
    expect(scouts('gsc.atalan-jackals')).toBe(9)
    expect(scouts('gsc.achilles-ridgerunner')).toBe(9)
    expect(scouts('gsc.hybrid-metamorphs')).toBe(6)
    for (const id of ['gsc.shanus-daskovian', 'gsc.atalan-jackals', 'gsc.achilles-ridgerunner', 'gsc.hybrid-metamorphs']) {
      expect(b.datasheets[id].coreAbilities.map((c) => c.ability)).not.toContain('DEEP_STRIKE')
    }
  })

  it('CLA-030 Feel No Pain 5+ on the Metamorphs only', async () => {
    const b = await loadBundle()
    expect(b.datasheets['gsc.hybrid-metamorphs'].coreAbilities.find((c) => c.ability === 'FEEL_NO_PAIN')!.value).toBe(5)
    expect(b.datasheets['gsc.atalan-jackals'].coreAbilities.map((c) => c.ability)).not.toContain('FEEL_NO_PAIN')
  })

  it('CLA-031 Stealth on Shanus and the Jackals', async () => {
    const b = await loadBundle()
    expect(b.datasheets['gsc.shanus-daskovian'].coreAbilities.map((c) => c.ability)).toContain('STEALTH')
    expect(b.datasheets['gsc.atalan-jackals'].coreAbilities.map((c) => c.ability)).toContain('STEALTH')
    expect(b.datasheets['gsc.hybrid-metamorphs'].coreAbilities.map((c) => c.ability)).not.toContain('STEALTH')
  })

  it('CLA-032 Ridgerunner Deadly Demise 1', async () => {
    const b = await loadBundle()
    expect(b.datasheets['gsc.achilles-ridgerunner'].coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE')!.value).toBe(1)
  })

  it('CLA-033 cult sniper rifle has Precision and Heavy', async () => {
    const b = await loadBundle()
    expect(b.weapons['gsc.w.cult-sniper-rifle'].abilities.map((a) => a.ability).sort()).toEqual(['HEAVY', 'PRECISION'])
  })

  it('CLA-034 hand flamer, twin heavy stubber and mining laser profiles', async () => {
    const b = await loadBundle()
    const abil = (id: string) => b.weapons[id].abilities.map((a) => a.ability)
    expect(b.weapons['gsc.w.hand-flamer'].A).toBe('D6')
    expect(b.weapons['gsc.w.hand-flamer'].skill).toBeNull()
    expect(abil('gsc.w.hand-flamer')).toEqual(expect.arrayContaining(['TORRENT', 'IGNORES_COVER', 'PISTOL']))
    expect(abil('gsc.w.twin-heavy-stubber')).toEqual(expect.arrayContaining(['TWIN_LINKED', 'RAPID_FIRE']))
    expect(b.weapons['gsc.w.twin-heavy-stubber'].abilities.find((a) => a.ability === 'RAPID_FIRE')!.value).toBe(3)
    expect(b.weapons['gsc.w.mining-laser'].D).toBe('D6+1')
  })

  it('CLA-035 Metamorph mutations are two profiles of one weapon: strike 3 A, sweep 5 A', async () => {
    const b = await loadBundle()
    const strike = b.weapons['gsc.w.metamorph-mutations-strike'], sweep = b.weapons['gsc.w.metamorph-mutations-sweep']
    expect(strike.profileGroup).toBe(sweep.profileGroup)
    expect(strike.A).toBe(3)
    expect(sweep.A).toBe(5)
    const meta = b.datasheets['gsc.hybrid-metamorphs']
    for (const c of meta.composition.filter((m) => m.modelId !== 'leader')) {
      const profiles = c.weapons.default.filter((w) => b.weapons[w].profileGroup === 'gsc.w.metamorph-mutations')
      expect(profiles.length).toBe(2)
    }
  })
})
