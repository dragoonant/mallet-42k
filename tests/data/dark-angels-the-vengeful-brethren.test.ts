import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PATROL = 'da.cp.the-vengeful-brethren'

describe('dark-angels the-vengeful-brethren data', () => {
  it('DAV-001 patrol loads: 4 units, 19 models; Zacharial WARLORD unattached with Determined Combatant; Hunters default; faction lists both patrols', async () => {
    const b = await loadBundle()
    const p = b.patrols[PATROL]
    expect(p).toBeTruthy()
    expect(p.faction).toBe('dark-angels')
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(19)
    expect(p.warlord).toBe('zacharial')
    const z = p.units.find((u) => u.ref === 'zacharial')!
    expect(z.enhancement).toBe('da.e.determined-combatant')
    expect(p.units.some((u) => u.attachTo)).toBe(false)
    expect(p.secondaries.find((s) => s.default)!.id).toBe('da.sec.hunters-of-heretics')
    expect(p.secondaries.map((s) => s.id)).toEqual(['da.sec.hunters-of-heretics', 'da.sec.take-the-stronghold'])
    expect(p.stratagems).toEqual(['da.s.vb-unyielding', 'da.s.vb-march-of-vengeance', 'da.s.vb-relic-munitions'])
    expect(p.enhancements.map((e) => [e.id, e.default])).toEqual([['da.e.determined-combatant', true], ['da.e.wages-of-retribution', false]])
    for (const id of p.stratagems) expect(b.stratagems[id], id).toBeDefined()
    for (const e of p.enhancements) expect(b.enhancements[e.id], e.id).toBeDefined()
    for (const u of p.units) {
      const ds = b.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.composition.reduce((n, c) => n + c.default, 0)).toBe(u.size)
      for (const c of ds.composition) for (const w of c.weapons.default) expect(b.weapons[w], w).toBeDefined()
      for (const a of ds.abilities) if (typeof a === 'string') expect(b.abilities[a], a).toBeDefined()
    }
    const f = b.factions['dark-angels']
    expect(f.combatPatrols).toEqual(['da.cp.mordekais-judgement', PATROL])
    expect(f.armyRule).toBe('sm.a.oath-of-moment')
    // Mordekai's Judgement is untouched
    const mj = b.patrols['da.cp.mordekais-judgement']
    expect(mj.units.map((u) => u.datasheet)).toEqual(['da.chaplain-mordekai', 'da.intercessor-squad', 'da.inceptor-squad', 'da.redemptor-dreadnought'])
    expect(b.datasheets['da.intercessor-squad'].composition.map((c) => c.modelId)).toEqual(['sergeant', 'intercessor'])
    expect(b.datasheets['da.intercessor-squad'].abilities).toEqual(['sm.a.oath-of-moment'])
  })

  it('DAV-002 datasheet stats, abilities and keywords match the CP page; Zacharial has no Leader; VB Intercessors are 10 identical models with Patrol Squads', async () => {
    const b = await loadBundle()
    const z = b.datasheets['da.master-zacharial']
    expect(z.stats).toMatchObject({ M: 5, T: 6, Sv: 3, W: 6, Ld: 6, OC: 1 })
    expect(z.invuln).toBe(4)
    expect(z.keywords).toEqual(['INFANTRY', 'CHARACTER', 'IMPERIUM', 'GRAVIS', 'CAPTAIN', 'MASTER ZACHARIAL'])
    expect(z.coreAbilities.some((c) => c.ability === 'LEADER')).toBe(false)
    expect(z.leader).toBeUndefined()
    expect(z.abilities).toEqual(['sm.a.oath-of-moment', 'da.a.refuse-to-yield'])
    expect(z.composition[0].base.mm).toBe(40)
    expect(z.composition[0].weapons.default).toEqual(['da.w.boltstorm-gauntlet', 'da.w.power-fist-zacharial', 'da.w.relic-chainsword'])

    const i = b.datasheets['da.vb.intercessor-squad']
    expect(i.stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(i.invuln).toBeUndefined()
    expect(i.keywords).toEqual(['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'TACTICUS', 'INTERCESSOR SQUAD'])
    expect(i.abilities).toEqual(['sm.a.oath-of-moment', 'sm.a.patrol-squads'])
    expect(i.composition.map((c) => [c.modelId, c.min, c.max, c.default, c.base.mm])).toEqual([['intercessor', 5, 10, 10, 32]])
    expect(i.composition[0].weapons.default).toEqual(['sm.w.bolt-pistol', 'da.w.bolt-rifle', 'sm.w.close-combat-weapon'])
    expect(b.abilities['sm.a.patrol-squads'].params).toEqual({ sizes: [5, 5] })
    const sq = b.patrols[PATROL].units.find((u) => u.ref === 'intercessors')!.patrolSquads!
    expect(sq.map((s) => [s.ref, s.size])).toEqual([['intercessors-a', 5], ['intercessors-b', 5]])
    for (const s of sq) expect(s.wargear.reduce((n, g) => n + g.count, 0)).toBe(5)

    const h = b.datasheets['da.hellblaster-squad']
    expect(h.stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 1 })
    expect(h.keywords).toEqual(['INFANTRY', 'IMPERIUM', 'TACTICUS', 'HELLBLASTER SQUAD'])
    expect(h.composition.map((c) => [c.modelId, c.default, c.base.mm])).toEqual([['hellblaster', 5, 32]])
    expect(h.composition[0].weapons.default).toEqual(['sm.w.bolt-pistol', 'da.w.plasma-incinerator', 'da.w.plasma-incinerator-supercharge', 'sm.w.close-combat-weapon'])

    const g = b.datasheets['da.bladeguard-veteran-squad']
    expect(g.stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 3, Ld: 6, OC: 1 })
    expect(g.invuln).toBe(4)
    expect(g.keywords).toEqual(['INFANTRY', 'IMPERIUM', 'TACTICUS', 'BLADEGUARD VETERAN SQUAD'])
    expect(g.abilities).toEqual(['sm.a.oath-of-moment', 'da.a.vb-bladeguard', 'da.a.vb-swords-of-the-chapter', 'da.a.vb-shields-of-the-chapter'])
    expect(g.composition.map((c) => [c.modelId, c.default, c.base.mm])).toEqual([['bladeguard', 3, 40]])
    expect(g.composition[0].weapons.default).toEqual(['da.w.heavy-bolt-pistol', 'da.w.master-crafted-power-weapon'])

    for (const id of ['da.master-zacharial', 'da.vb.intercessor-squad', 'da.hellblaster-squad', 'da.bladeguard-veteran-squad']) {
      expect(b.datasheets[id].factionKeywords).toEqual(['ADEPTUS ASTARTES', 'DARK ANGELS'])
      expect(b.datasheets[id].abilities).toContain('sm.a.oath-of-moment')
    }
  })

  it('DAV-002 weapon profiles match the CP page; reused ids unchanged; incinerator profiles share a group', async () => {
    const b = await loadBundle()
    const row = (id: string) => {
      const w = b.weapons[id]
      expect(w, id).toBeTruthy()
      return [w.type, w.range, w.A, w.skill, w.S, w.AP, w.D, w.abilities.map((a) => a.ability).sort()]
    }
    expect(row('da.w.boltstorm-gauntlet')).toEqual(['ranged', 12, 3, 2, 4, -1, 1, ['PISTOL']])
    expect(row('da.w.power-fist-zacharial')).toEqual(['melee', 0, 5, 2, 8, -2, 2, []])
    expect(row('da.w.relic-chainsword')).toEqual(['melee', 0, 3, 2, 4, -1, 2, ['EXTRA_ATTACKS']])
    expect(row('da.w.plasma-incinerator')).toEqual(['ranged', 24, 2, 3, 7, -2, 1, ['ASSAULT', 'HEAVY']])
    expect(row('da.w.plasma-incinerator-supercharge')).toEqual(['ranged', 24, 2, 3, 8, -3, 2, ['ASSAULT', 'HAZARDOUS', 'HEAVY']])
    expect(b.weapons['da.w.plasma-incinerator'].profileGroup).toBe('da.w.plasma-incinerator')
    expect(b.weapons['da.w.plasma-incinerator-supercharge'].profileGroup).toBe('da.w.plasma-incinerator')
    expect(row('da.w.heavy-bolt-pistol')).toEqual(['ranged', 18, 1, 3, 4, -1, 1, ['PISTOL']])
    expect(row('da.w.master-crafted-power-weapon')).toEqual(['melee', 0, 4, 3, 5, -2, 2, []])
    // reused / untouched
    expect(row('sm.w.bolt-pistol')).toEqual(['ranged', 12, 1, 3, 4, 0, 1, ['PISTOL']])
    expect(row('da.w.bolt-rifle')).toEqual(['ranged', 24, 2, 3, 4, -1, 1, ['ASSAULT', 'HEAVY']])
    expect(row('sm.w.close-combat-weapon')).toEqual(['melee', 0, 3, 3, 4, 0, 1, []])
    expect(row('sm.w.power-fist')).toEqual(['melee', 0, 3, 3, 8, -2, 2, []])
  })

  it('DAV-001 wiring: abilities, enhancements, stratagems and secondaries are wired to the spec ids and hooks', async () => {
    const b = await loadBundle()
    expect(b.abilities['da.a.refuse-to-yield']).toMatchObject({ trigger: 'damageApplied', effect: { halveDamage: true } })
    expect(b.abilities['da.a.refuse-to-yield'].when).toBeUndefined()
    expect(b.abilities['da.a.vb-bladeguard']).toMatchObject({ trigger: 'phaseStart', code: 'vbBladeguardPick', params: { pickWindow: 'fight.start' } })
    expect(b.abilities['da.a.vb-swords-of-the-chapter']).toMatchObject({ trigger: 'hitRoll', when: { weaponType: 'melee' }, effect: { reroll: 'ones' }, code: 'vbBladeguardStance', params: { stance: 'swords' } })
    expect(b.abilities['da.a.vb-shields-of-the-chapter']).toMatchObject({ trigger: 'saveRoll', effect: { reroll: 'ones' }, code: 'vbBladeguardStance', params: { stance: 'shields', invulnOnly: true } })

    const dc = b.enhancements['da.e.determined-combatant']
    expect(dc.restriction).toEqual({ keyword: ['CAPTAIN'] })
    expect(dc.effect).toMatchObject({ trigger: 'always', when: { unitOnObjective: true }, effect: { grantWeaponAbility: { ability: 'SUSTAINED_HITS', value: 1 } }, scope: { who: 'bearer' } })
    const wr = b.enhancements['da.e.wages-of-retribution']
    expect(wr.restriction).toEqual({ keyword: ['CAPTAIN'] })
    expect(wr.effect).toMatchObject({ trigger: 'unitDestroyed', code: 'vbWagesOfRetribution', params: { threshold: 4, cp: 1 } })

    const un = b.stratagems['da.s.vb-unyielding']
    expect(un).toMatchObject({ cost: 1, category: 'epicDeed', phases: ['fight'], window: 'fight.targetsDeclared', who: 'either', code: 'vbUnyielding', params: { threshold: 4, bonusKeyword: 'BLADEGUARD VETERAN SQUAD' } })
    expect(un.targets[0]).toMatchObject({ state: 'targetedByAttack', filter: { keyword: 'ADEPTUS ASTARTES' } })
    const mv = b.stratagems['da.s.vb-march-of-vengeance']
    expect(mv).toMatchObject({ cost: 1, category: 'strategicPloy', window: ['fight.start', 'fight.attacksResolved', 'fight.beforeConsolidate'], code: 'getStuckInDistance', params: { consolidate: 6, consolidateOnly: true } })
    const rm = b.stratagems['da.s.vb-relic-munitions']
    expect(rm).toMatchObject({ cost: 1, category: 'battleTactic', phases: ['shooting'], who: 'active' })
    expect(rm.code).toBeUndefined()
    expect(rm.targets[0]).toMatchObject({ state: 'notYetShot' })
    expect(JSON.stringify(rm.effect)).toContain('da.w.plasma-incinerator-supercharge')
    // Mordekai's Judgement stratagem ids are separate
    expect(b.stratagems['da.s.mj-unyielding']).toBeDefined()

    const p = b.patrols[PATROL]
    const hunters = p.secondaries.find((s) => s.id === 'da.sec.hunters-of-heretics')!
    expect(hunters.scoring.map((s) => [s.when, s.code, s.pointsPer, s.cap])).toEqual([['any.unitDestroyed', 'vbHuntersOfHeretics', 5, 999], ['battle.end', 'vbHuntersOfHereticsEnd', 5, 5]])
    const stronghold = p.secondaries.find((s) => s.id === 'da.sec.take-the-stronghold')!
    expect(stronghold.default).toBe(false)
    expect(stronghold.scoring.map((s) => [s.when, s.code, s.pointsPer, s.cap])).toEqual([['deployment.unit', 'vbTakeTheStrongholdPick', 0, 0], ['turn.end', 'vbTakeTheStrongholdScore', 5, 25]])
  })
})
