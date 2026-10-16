import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('orks: Morgrim\'s Butchas data', () => {
  it('MOR-001 patrol loads: 4 units / 25 models, Morgrim WARLORD attached to snaggas-a, listed after the Gitstompas', async () => {
    const b = await loadBundle()
    const p = b.patrols['ork.cp.morgrims-butchas']
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(25)
    expect(p.warlord).toBe('beastboss')
    expect(p.units.find((u) => u.ref === 'beastboss')!.attachTo).toBe('snaggas-a')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('ork.sec.bag-the-big-un')
    expect(b.factions['ork'].combatPatrols).toEqual(['ork.cp.gordrangs-gitstompas', 'ork.cp.morgrims-butchas'])
  })

  it('MOR-002 Morgrim profile', async () => {
    const d = (await loadBundle()).datasheets['ork.beastboss-morgrim']
    expect(d.stats).toEqual({ M: 6, T: 5, Sv: 4, W: 6, Ld: 6, OC: 1 })
    expect(d.invuln).toBe(5)
    expect(d.composition[0].base).toEqual({ shape: 'round', mm: 50 })
    expect(d.keywords).toEqual(expect.arrayContaining(['BEASTBOSS', 'WARBOSS']))
    expect(d.coreAbilities).toEqual(expect.arrayContaining([{ ability: 'FEEL_NO_PAIN', value: 6 }, { ability: 'LEADER' }]))
    expect(d.leader!.attachTo).toEqual(['ork.beast-snagga-boyz'])
  })

  it('MOR-003 Beast Snagga Boyz profile and wargear', async () => {
    const d = (await loadBundle()).datasheets['ork.beast-snagga-boyz']
    expect(d.stats).toMatchObject({ T: 5, Sv: 5, W: 1, OC: 2 })
    expect(d.keywords).toContain('BATTLELINE')
    const nob = d.composition.find((c) => c.modelId === 'nob')!
    expect(nob.statsOverride).toEqual({ W: 2 })
    expect(nob.weapons.default).toEqual(['ork.w.slugga', 'ork.w.power-snappa'])
    expect(d.composition.find((c) => c.modelId === 'boy-thump-gun')!.weapons.default).toEqual(['ork.w.thump-gun', 'ork.w.close-combat-weapon-snagga'])
    expect(d.composition.find((c) => c.modelId === 'boy-choppa')!.weapons.default).toEqual(['ork.w.slugga', 'ork.w.choppa-snagga'])
    expect(d.composition.reduce((n, c) => n + c.default, 0)).toBe(10)
    expect(d.composition.every((c) => c.base.shape === 'round' && c.base.mm === 32)).toBe(true)
  })

  it('MOR-004 Squighog Boyz profile and oval bases', async () => {
    const d = (await loadBundle()).datasheets['ork.squighog-boyz']
    expect(d.stats).toMatchObject({ M: 10, T: 7, Sv: 4, W: 3 })
    expect(d.keywords).toContain('MOUNTED')
    expect(d.keywords).not.toContain('INFANTRY')
    expect(d.coreAbilities).toContainEqual({ ability: 'FEEL_NO_PAIN', value: 5 })
    expect(d.composition.find((c) => c.modelId === 'nob-smasha-squig')!.statsOverride).toEqual({ W: 4 })
    expect(d.composition.find((c) => c.modelId === 'nob-smasha-squig')!.base).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    expect(d.composition.find((c) => c.modelId === 'squighog-boy')!.base).toEqual({ shape: 'oval', mm: 75, mm2: 42 })
  })

  it('MOR-005 new weapon profiles match the spec; Gitstompas weapons are unchanged', async () => {
    const w = (await loadBundle()).weapons
    expect(w['ork.w.shoota-beastboss']).toMatchObject({ range: 18, A: 2, skill: 4, S: 4, AP: 0, D: 1 })
    expect(w['ork.w.beastchoppa']).toMatchObject({ A: 6, skill: 2, S: 6, AP: -1, D: 2 })
    expect(w['ork.w.beast-snagga-klaw']).toMatchObject({ A: 4, skill: 3, S: 10, AP: -2, D: 2 })
    expect(w['ork.w.thump-gun']).toMatchObject({ range: 18, A: 'D3', skill: 5, S: 6, D: 2 })
    expect(w['ork.w.power-snappa']).toMatchObject({ A: 4, S: 7, AP: -1, D: 2 })
    expect(w['ork.w.stikka'].abilities.map((a) => a.ability)).toEqual(expect.arrayContaining(['ANTI', 'LANCE']))
    expect(w['ork.w.squighog-jaws'].abilities).toEqual([{ ability: 'EXTRA_ATTACKS' }])
    expect(w['ork.w.shoota']).toMatchObject({ skill: 5 })
    expect(w['ork.w.choppa']).toMatchObject({ S: 4 })
    expect(w['ork.w.close-combat-weapon']).toMatchObject({ S: 4 })
    expect(w['ork.w.big-choppa']).toMatchObject({ A: 3, S: 7, abilities: [] })
  })

  it('MOR-005 enhancements, stratagems and secondaries are wired', async () => {
    const b = await loadBundle()
    const p = b.patrols['ork.cp.morgrims-butchas']
    expect(p.stratagems).toEqual(['ork.s.tough-as-squig-hide', 'ork.s.bestial-bellow', 'ork.s.get-in-there'])
    for (const id of p.stratagems) expect(b.stratagems[id]).toBeTruthy()
    expect(p.enhancements.find((e) => e.default)!.id).toBe('ork.e.half-chewed')
    expect(p.enhancements).toHaveLength(2)
    expect(p.secondaries.map((s) => s.id)).toEqual(['ork.sec.bag-the-big-un', 'ork.sec.krumpin-spree'])
  })
})
