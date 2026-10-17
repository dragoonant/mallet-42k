import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { AbilityDescriptor } from '../../src/data/types'

const PATROL = 'bt.cp.siguard-s-crusaders'

describe('black-templars data', () => {
  it("BLA-001 patrol loads: 4 units, 17 models; Siguard WARLORD with Crusaders' Fervour attached to the Crusader Squad; Path of Purgation default", async () => {
    const b = await loadBundle()
    const p = b.patrols[PATROL]
    expect(p).toBeTruthy()
    expect(p.faction).toBe('black-templars')
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(17)
    expect(p.warlord).toBe('marshal-siguard')
    const s = p.units.find((u) => u.ref === 'marshal-siguard')!
    expect(s.enhancement).toBe('bt.e.crusaders-fervour')
    expect(s.attachTo).toBe('primaris-crusader-squad')
    expect(p.secondaries.find((x) => x.default)!.id).toBe('bt.sec.path-of-purgation')
    expect(p.secondaries.map((x) => x.id)).toEqual(['bt.sec.path-of-purgation', 'bt.sec.sacred-vow'])
    expect(p.stratagems).toEqual(['bt.s.shield-of-zeal', 'bt.s.hate-fuelled-strength', 'bt.s.goaded-to-fury'])
    const f = b.factions['black-templars']
    expect(f.combatPatrols).toEqual([PATROL])
    expect(f.factionKeyword).toBe('ADEPTUS ASTARTES')
    expect(f.armyRule).toBe('sm.a.oath-of-moment')
    expect(f.detachments[0].stratagems).toEqual(p.stratagems)
    expect(f.detachments[0].enhancements).toEqual(['bt.e.crusaders-fervour', 'bt.e.righteous-defiance'])
  })

  it('BLA-002 datasheet stat rows match the CP page; every sheet carries ADEPTUS ASTARTES + BLACK TEMPLARS and Oath of Moment; SM patrols unchanged', async () => {
    const b = await loadBundle()
    const ids = ['bt.marshal-siguard', 'bt.primaris-crusader-squad', 'bt.intercessor-squad', 'bt.impulsor']
    for (const id of ids) {
      const d = b.datasheets[id]
      expect(d.factionKeywords).toEqual(['ADEPTUS ASTARTES', 'BLACK TEMPLARS'])
      expect(d.keywords).toContain('IMPERIUM')
      expect(d.abilities).toContain('sm.a.oath-of-moment')
    }
    expect(b.datasheets['bt.marshal-siguard']).toMatchObject({ stats: { M: 6, T: 4, Sv: 3, W: 5, Ld: 6, OC: 1 }, invuln: 4 })
    expect(b.datasheets['bt.marshal-siguard'].keywords).toEqual(['INFANTRY', 'CHARACTER', 'IMPERIUM', 'TACTICUS', 'MARSHAL', 'SIGUARD'])
    expect(b.datasheets['bt.primaris-crusader-squad'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(b.datasheets['bt.primaris-crusader-squad'].keywords).toContain('BATTLELINE')
    expect(b.datasheets['bt.intercessor-squad'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(b.datasheets['bt.impulsor'].stats).toMatchObject({ M: 12, T: 9, Sv: 3, W: 11, Ld: 6, OC: 2 })
    expect(b.datasheets['bt.impulsor'].invuln).toBeUndefined()
    expect(b.datasheets['bt.impulsor'].coreAbilities).toEqual([{ ability: 'DEADLY_DEMISE', value: 'D3' }, { ability: 'FIRING_DECK', value: 6 }])
    expect(b.datasheets['bt.impulsor'].transport).toMatchObject({ capacity: 6, firingDeck: 6, keywords: ['ADEPTUS ASTARTES', 'INFANTRY', 'TACTICUS'] })
    expect(b.datasheets['bt.primaris-crusader-squad'].coreAbilities).toEqual([{ ability: 'SCOUTS', value: 6 }])
    expect(b.datasheets['bt.marshal-siguard'].leader).toMatchObject({ attachTo: ['bt.intercessor-squad', 'bt.primaris-crusader-squad'] })
    expect(b.datasheets['bt.marshal-siguard'].coreAbilities).toEqual([{ ability: 'LEADER' }])
    expect(b.patrols['sm.cp.strike-force-octavius'].units).toHaveLength(4)
    expect(b.patrols['sm.cp.strike-team-solarien'].units).toHaveLength(4)
  })

  it('BLA-002 Crusader Squad composition: Neophytes Sv 4+ at 28 mm with PRIMARIS NEOPHYTE, Initiates 32 mm, Sword Brother 40 mm', async () => {
    const b = await loadBundle()
    const comp = b.datasheets['bt.primaris-crusader-squad'].composition
    expect(comp.map((c) => [c.modelId, c.default])).toEqual([
      ['sword-brother', 1], ['initiate-chainsword', 2], ['initiate-bolt-rifle', 2], ['initiate-pyreblaster', 1],
      ['neophyte-chainsword', 2], ['neophyte-firearm', 2],
    ])
    expect(comp.reduce((n, c) => n + c.default, 0)).toBe(10)
    const by = (id: string) => comp.find((c) => c.modelId === id)!
    for (const id of ['neophyte-chainsword', 'neophyte-firearm']) {
      expect(by(id).statsOverride).toEqual({ Sv: 4 })
      expect(by(id).keywords).toEqual(['PRIMARIS NEOPHYTE'])
      expect(by(id).base).toEqual({ shape: 'round', mm: 28 })
    }
    for (const id of ['initiate-chainsword', 'initiate-bolt-rifle', 'initiate-pyreblaster']) {
      expect(by(id).statsOverride).toBeUndefined()
      expect(by(id).keywords).toEqual(['PRIMARIS INITIATE'])
      expect(by(id).base).toEqual({ shape: 'round', mm: 32 })
    }
    expect(by('sword-brother').base).toEqual({ shape: 'round', mm: 40 })
    expect(by('sword-brother').statsOverride).toBeUndefined()
    expect(b.datasheets['bt.intercessor-squad'].composition.map((c) => [c.modelId, c.default])).toEqual([['intercessor', 5]])
    expect(b.datasheets['bt.impulsor'].composition[0].base).toEqual({ shape: 'round', mm: 100 })
  })

  it('BLA-002 weapon profiles match the CP page; reused SM weapon ids exist', async () => {
    const b = await loadBundle()
    const row = (id: string) => {
      const w = b.weapons[id]
      expect(w, id).toBeTruthy()
      return [w.type, w.range, w.A, w.skill, w.S, w.AP, w.D, w.abilities.map((a) => a.ability).sort()]
    }
    expect(row('bt.w.plasma-pistol-standard')).toEqual(['ranged', 12, 1, 2, 7, -2, 1, ['PISTOL']])
    expect(row('bt.w.plasma-pistol-supercharge')).toEqual(['ranged', 12, 1, 2, 8, -3, 2, ['HAZARDOUS', 'PISTOL']])
    expect(b.weapons['bt.w.plasma-pistol-standard'].profileGroup).toBe(b.weapons['bt.w.plasma-pistol-supercharge'].profileGroup)
    expect(row('bt.w.master-crafted-power-weapon')).toEqual(['melee', 0, 6, 2, 5, -2, 2, []])
    expect(row('bt.w.bolt-rifle')).toEqual(['ranged', 24, 2, 3, 4, -1, 1, ['ASSAULT', 'HEAVY']])
    expect(row('bt.w.heavy-bolt-pistol')).toEqual(['ranged', 18, 1, 3, 4, -1, 1, ['PISTOL']])
    expect(row('bt.w.neophyte-firearm')).toEqual(['ranged', 18, 2, 3, 4, 0, 1, ['ASSAULT']])
    expect(row('bt.w.astartes-chainsword')).toEqual(['melee', 0, 5, 3, 4, -1, 1, []])
    expect(row('bt.w.power-weapon')).toEqual(['melee', 0, 3, 3, 5, -2, 1, []])
    expect(row('bt.w.multi-melta')).toEqual(['ranged', 18, 2, 3, 9, -4, 'D6', ['MELTA']])
    expect(b.weapons['bt.w.multi-melta'].abilities).toEqual([{ ability: 'MELTA', value: 2 }])
    expect(row('bt.w.storm-bolter-2')).toEqual(row('sm.w.storm-bolter'))
    expect(row('bt.w.armoured-hull')).toEqual(['melee', 0, 3, 4, 6, 0, 1, []])
    expect(row('sm.w.bolt-pistol')).toEqual(['ranged', 12, 1, 3, 4, 0, 1, ['PISTOL']])
    expect(row('sm.w.pyreblaster')).toEqual(['ranged', 12, 'D6', null, 5, 0, 1, ['IGNORES_COVER', 'TORRENT']])
    expect(row('sm.w.close-combat-weapon')).toEqual(['melee', 0, 3, 3, 4, 0, 1, []])
    // sm.w.power-weapon has A4: the Sword Brother needs his own A3 profile
    expect(b.weapons['sm.w.power-weapon'].A).toBe(4)
    expect(b.datasheets['bt.impulsor'].composition[0].weapons.default).toEqual(['bt.w.multi-melta', 'sm.w.storm-bolter', 'bt.w.storm-bolter-2', 'bt.w.armoured-hull'])
  })

  it('BLA-004 Siguard may lead the Intercessors or the Crusader Squad, not the Impulsor', async () => {
    const b = await loadBundle()
    const attach = b.datasheets['bt.marshal-siguard'].leader!.attachTo
    expect(attach).toContain('bt.intercessor-squad')
    expect(attach).toContain('bt.primaris-crusader-squad')
    expect(attach).not.toContain('bt.impulsor')
  })

  it('BLA-005 Patrol Squads: Initiates half and Brethren half, each Starting Strength 5; default unsplit', async () => {
    const b = await loadBundle()
    const sq = b.patrols[PATROL].units.find((u) => u.ref === 'primaris-crusader-squad')!
    expect(sq.size).toBe(10)
    expect(b.datasheets['bt.primaris-crusader-squad'].abilities).toContain('bt.a.patrol-squads')
    expect(b.abilities['bt.a.patrol-squads'].code).toBe('patrolSquads')
    expect(sq.patrolSquads!.map((h) => [h.ref, h.size])).toEqual([['crusader-squad-initiates', 5], ['crusader-squad-brethren', 5]])
    const [init, bre] = sq.patrolSquads!
    expect(init.wargear.map((g) => [g.modelId, g.count])).toEqual([['initiate-chainsword', 2], ['initiate-bolt-rifle', 2], ['initiate-pyreblaster', 1]])
    expect(bre.wargear.map((g) => [g.modelId, g.count])).toEqual([['sword-brother', 1], ['neophyte-chainsword', 2], ['neophyte-firearm', 2]])
    for (const h of sq.patrolSquads!) expect(h.wargear.reduce((n, g) => n + g.count, 0)).toBe(5)
    // the two halves use up the whole squad
    const total = new Map<string, number>()
    for (const h of sq.patrolSquads!) for (const g of h.wargear) total.set(g.modelId, (total.get(g.modelId) ?? 0) + g.count)
    for (const c of b.datasheets['bt.primaris-crusader-squad'].composition) expect(total.get(c.modelId)).toBe(c.default)
  })

  it("BLA-003/007/008/020 abilities and enhancements: Oath of Moment shared, Righteous Zeal re-rolls, Fervour +1 melee A, Defiance FNP 5+ and hooks", async () => {
    const b = await loadBundle()
    expect(b.abilities['sm.a.oath-of-moment'].code).toBe('oathOfMomentPick')
    expect(b.abilities['bt.a.righteous-zeal']).toMatchObject({ name: 'Righteous Zeal', trigger: 'chargeRoll', effect: { reroll: 'all' } })
    expect(b.abilities['bt.a.righteous-zeal-advance']).toMatchObject({ name: 'Righteous Zeal', trigger: 'advanceRoll', effect: { reroll: 'all' } })
    expect(b.datasheets['bt.intercessor-squad'].abilities).not.toContain('bt.a.righteous-zeal')
    expect(b.abilities['bt.a.assault-vehicle'].code).toBe('assaultVehicle')
    const fer = b.enhancements['bt.e.crusaders-fervour']
    expect(fer.restriction).toEqual({ keyword: ['MARSHAL'] })
    expect(fer.effect).toMatchObject({ trigger: 'always', scope: { who: 'self' }, effect: { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } } })
    const def = b.enhancements['bt.e.righteous-defiance']
    expect(def.restriction).toEqual({ keyword: ['MARSHAL'] })
    const eff = (Array.isArray(def.effect) ? def.effect : [def.effect]) as AbilityDescriptor[]
    expect(eff.find((e) => e.effect && 'feelNoPain' in e.effect)!.effect).toEqual({ feelNoPain: 5 })
    expect(eff.filter((e) => e.trigger === 'targetsDeclared').map((e) => e.code)).toEqual(['righteousDefiance', 'righteousDefianceFight'])
  })

  it('BLA-016/018/019 stratagems carry the descriptors the spec names', async () => {
    const b = await loadBundle()
    const sz = b.stratagems['bt.s.shield-of-zeal']
    expect(sz).toMatchObject({ cost: 1, category: 'battleTactic', window: ['shooting.targetsDeclared', 'fight.targetsDeclared'], who: 'either', duration: 'untilEndOfPhase' })
    expect(sz.targets[0]).toMatchObject({ owner: 'friendly', filter: { keyword: 'INFANTRY' }, state: 'targetedByAttack' })
    expect(sz.effect).toEqual([
      { when: { range: { within: 6 }, targetModelKeyword: 'PRIMARIS NEOPHYTE' }, invuln: 5 },
      { when: { range: { within: 6 }, not: { targetModelKeyword: 'PRIMARIS NEOPHYTE' } }, invuln: 4 },
    ])
    const hf = b.stratagems['bt.s.hate-fuelled-strength']
    expect(hf).toMatchObject({ code: 'voraciousAssaultHit', effect: { when: { targetIsClosestEligible: true }, reroll: 'all' } })
    expect(hf.targets[0].state).toBe('notYetShot')
    const gf = b.stratagems['bt.s.goaded-to-fury']
    expect(gf).toMatchObject({ category: 'strategicPloy', window: 'shooting.attacksResolved', who: 'reactive', effect: { move: { distance: 6, kind: 'surge' } }, params: { asCloseAsPossibleTo: 'target' } })
  })

  it('BLA-011/013/014 secondaries: Path of Purgation (battle end, 8/10) and Sacred Vow (pick + score, rounds 2-5)', async () => {
    const b = await loadBundle()
    const [pp, sv] = b.patrols[PATROL].secondaries
    expect(pp.scoring).toHaveLength(1)
    expect(pp.scoring[0]).toMatchObject({ when: 'battle.end', code: 'pathOfPurgation', pointsPer: 8, cap: 10, params: { warlordPoints: 10, keyword: 'ADEPTUS ASTARTES' } })
    expect(sv.default).toBe(false)
    expect(sv.scoring.map((s) => [s.when, s.code, s.rounds])).toEqual([
      ['round.start', 'sacredVowPick', { from: 2, to: 5 }],
      ['round.end', 'sacredVowScore', { from: 2, to: 5 }],
    ])
    expect(sv.scoring[1]).toMatchObject({ pointsPer: 3, cap: 4, params: { crusaderPoints: 4 } })
  })

  it('every bt.* reference resolves (weapons, abilities, stratagems, enhancements) and no GW text markers sneak in', async () => {
    const b = await loadBundle()
    const sheets = Object.values(b.datasheets).filter((d) => d.id.startsWith('bt.'))
    expect(sheets).toHaveLength(4)
    for (const d of sheets) {
      for (const a of d.abilities as string[]) expect(b.abilities[a], a).toBeTruthy()
      for (const c of d.composition) for (const w of c.weapons.default) expect(b.weapons[w], w).toBeTruthy()
    }
    for (const s of Object.values(b.stratagems).filter((x) => x.id.startsWith('bt.'))) expect(s.text.length).toBeGreaterThan(20)
    expect(Object.values(b.stratagems).filter((x) => x.id.startsWith('bt.'))).toHaveLength(3)
    expect(Object.values(b.enhancements).filter((x) => x.id.startsWith('bt.'))).toHaveLength(2)
  })
})
