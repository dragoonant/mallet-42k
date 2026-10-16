import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { AbilityDescriptor, CombatPatrolData, DataBundle, DatasheetData } from '../../src/data/types'
import { validateAllData } from '../../tools/validate-data'

// Chaos Daemons: Butchers of Hyporia (docs/spec/factions/chaos-daemons.md, CHA-101..130 / DMN-). Data-side checks only:
// the faction is in the bundle, passes schema validation, every cross-reference resolves and the §6 rows match.
const FACTION = 'chaos-daemons'
const PATROL = 'cdm.cp.butchers-of-hyporia'

let bundle: DataBundle
let patrol: CombatPatrolData
beforeAll(async () => {
  bundle = await loadBundle()
  patrol = bundle.patrols[PATROL]
})

const sheetOf = (ref: string): DatasheetData => bundle.datasheets[patrol.units.find((u) => u.ref === ref)!.datasheet]
const modelCount = (ds: DatasheetData): number => ds.composition.reduce((n, c) => n + c.default, 0)
const effectOf = (id: string): AbilityDescriptor => bundle.enhancements[id].effect as AbilityDescriptor
const abilityIds = (ds: DatasheetData): string[] => ds.abilities.map((a) => (typeof a === 'string' ? a : a.id))

describe('chaos-daemons data', () => {
  it('every chaos-daemons file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith(`factions/${FACTION}/`))
    expect(reports.length).toBeGreaterThanOrEqual(10)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('CHA-101 patrol loads: 6 units, 34 models; Kh\'har\'ret WARLORD with Incarnated Rage attached to bloodletters-1; Worthy Offerings default', () => {
    const faction = bundle.factions[FACTION]
    expect(faction.factionKeyword).toBe('LEGIONES DAEMONICA')
    expect(faction.combatPatrols).toEqual([PATROL])
    expect(bundle.abilities[faction.armyRule]).toBeDefined()
    expect(patrol.faction).toBe(FACTION)
    expect(patrol.units.map((u) => u.ref)).toEqual(['khharret', 'bloodletters-1', 'bloodletters-2', 'flesh-hounds-1', 'flesh-hounds-2', 'bloodcrushers'])
    expect(patrol.units.reduce((n, u) => n + modelCount(bundle.datasheets[u.datasheet]), 0)).toBe(34)
    for (const u of patrol.units) expect(modelCount(bundle.datasheets[u.datasheet]), u.ref).toBe(u.size)
    expect(patrol.warlord).toBe('khharret')
    const k = patrol.units.find((u) => u.ref === 'khharret')!
    expect(k.enhancement).toBe('cdm.e.incarnated-rage')
    expect(k.attachTo).toBe('bloodletters-1')
    expect(sheetOf('khharret').keywords).toContain('BLOODMASTER')
    expect(patrol.enhancements).toEqual([
      { id: 'cdm.e.incarnated-rage', default: true },
      { id: 'cdm.e.warp-locus', default: false },
    ])
    expect(patrol.secondaries.map((s) => [s.id, s.default])).toEqual([
      ['cdm.sec.worthy-offerings', true],
      ['cdm.sec.dark-conjunction', false],
    ])
    expect(patrol.stratagems).toEqual(['cdm.s.blood-maddened-banishment', 'cdm.s.empyric-predators', 'cdm.s.manifest-hate'])
    expect(faction.detachments[0].stratagems).toEqual(patrol.stratagems)
    expect(faction.detachments[0].enhancements).toEqual(['cdm.e.incarnated-rage', 'cdm.e.warp-locus'])
  })

  it('CHA-101 every datasheet, weapon, ability, stratagem and enhancement reference resolves', () => {
    for (const u of patrol.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.faction).toBe(FACTION)
      for (const id of abilityIds(ds)) expect(bundle.abilities[id], id).toBeDefined()
      for (const c of ds.composition) for (const w of c.weapons.default) expect(bundle.weapons[w], w).toBeDefined()
      if (u.enhancement) expect(bundle.enhancements[u.enhancement]).toBeDefined()
    }
    for (const id of patrol.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
    for (const e of patrol.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
  })

  it('CHA-102 stats, keywords, invulnerable saves, bases and the Shadow of Chaos ability match the spec table', () => {
    const rows: [string, number[], number, number, string[]][] = [
      // ref, [M, T, Sv, W, Ld, OC], invuln, mm of first model, extra keywords
      ['khharret', [6, 4, 5, 4, 7, 1], 4, 40, ['INFANTRY', 'CHARACTER', 'BLOODMASTER', 'KH\'HAR\'RET THE BUTCHER']],
      ['bloodletters-1', [6, 4, 7, 1, 7, 2], 5, 32, ['INFANTRY', 'BATTLELINE', 'BLOODLETTERS']],
      ['bloodcrushers', [10, 7, 4, 4, 7, 2], 4, 90, ['MOUNTED', 'BLOODCRUSHERS']],
      ['flesh-hounds-1', [12, 4, 7, 2, 7, 1], 5, 60, ['BEAST', 'FLESH HOUNDS']],
    ]
    for (const [ref, [M, T, Sv, W, Ld, OC], inv, mm, kws] of rows) {
      const ds = sheetOf(ref)
      expect([ds.stats.M, ds.stats.T, ds.stats.Sv, ds.stats.W, ds.stats.Ld, ds.stats.OC], ref).toEqual([M, T, Sv, W, Ld, OC])
      expect(ds.factionKeywords, ref).toEqual(['LEGIONES DAEMONICA'])
      expect(ds.invuln, ref).toBe(inv)
      expect(ds.composition[0].base.mm, ref).toBe(mm)
      for (const k of [...kws, 'CHAOS', 'DAEMON', 'KHORNE']) expect(ds.keywords, `${ref} ${k}`).toContain(k)
      expect(abilityIds(ds), ref).toContain('cdm.a.shadow-of-chaos')
    }
    expect(sheetOf('bloodcrushers').composition[0].base).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    expect(sheetOf('flesh-hounds-1').composition[0].base).toEqual({ shape: 'oval', mm: 60, mm2: 35 })
    expect(sheetOf('khharret').coreAbilities).toEqual([{ ability: 'DEEP_STRIKE' }, { ability: 'LEADER' }])
    expect(sheetOf('khharret').leader!.attachTo).toEqual(['cdm.bloodletters'])
    expect(sheetOf('bloodletters-1').coreAbilities).toEqual([{ ability: 'DEEP_STRIKE' }])
    expect(sheetOf('bloodcrushers').coreAbilities).toEqual([])
    expect(sheetOf('flesh-hounds-1').coreAbilities).toEqual([])
    expect(abilityIds(sheetOf('khharret'))).toContain('cdm.a.a-gory-path')
    expect(abilityIds(sheetOf('flesh-hounds-1'))).toContain('cdm.a.collar-of-khorne')
    expect(bundle.abilities['cdm.a.a-gory-path'].code).toBe('getStuckInDistance')
    expect(bundle.abilities['cdm.a.a-gory-path'].params).toEqual({ pileIn: 3, consolidate: 6 })
    expect(bundle.abilities['cdm.a.collar-of-khorne'].effect).toEqual({ feelNoPain: 3 })
    expect(bundle.abilities['cdm.a.collar-of-khorne'].when).toEqual({ sourcePsychic: true })
  })

  it('CHA-102 weapon profiles match the spec table', () => {
    const w = bundle.weapons
    const row = (id: string) => {
      const x = w[id]
      return [x.type, x.range, x.A, x.skill, x.S, x.AP, x.D, x.abilities.map((a) => a.ability + (a.value !== undefined ? ` ${a.value}` : '')).sort()]
    }
    expect(row('cdm.w.blade-of-blood')).toEqual(['melee', 0, 5, 2, 6, -2, 3, []])
    expect(row('cdm.w.hellblade')).toEqual(['melee', 0, 2, 3, 5, -2, 2, []])
    expect(row('cdm.w.juggernauts-bladed-horn')).toEqual(['melee', 0, 4, 4, 6, -1, 1, ['EXTRA_ATTACKS', 'LANCE']])
    expect(row('cdm.w.burning-roar')).toEqual(['ranged', 12, 'D6', null, 4, 0, 1, ['IGNORES_COVER', 'TORRENT']])
    expect(row('cdm.w.gore-drenched-fangs')).toEqual(['melee', 0, 3, 3, 5, -1, 1, []])
  })

  it('CHA-102 / CHA-126 / CHA-130 wargear per model matches the box build; icon and musician models add no rules', () => {
    const loadout = (ref: string) => sheetOf(ref).composition.map((c) => [c.modelId, c.default, [...c.weapons.default]])
    expect(loadout('khharret')).toEqual([['khharret', 1, ['cdm.w.blade-of-blood']]])
    expect(loadout('bloodletters-1')).toEqual([
      ['bloodletter', 8, ['cdm.w.hellblade']],
      ['bloodletter-icon', 1, ['cdm.w.hellblade']],
      ['bloodletter-musician', 1, ['cdm.w.hellblade']],
    ])
    expect(loadout('bloodcrushers')).toEqual([
      ['bloodcrusher', 1, ['cdm.w.hellblade', 'cdm.w.juggernauts-bladed-horn']],
      ['bloodcrusher-icon', 1, ['cdm.w.hellblade', 'cdm.w.juggernauts-bladed-horn']],
      ['bloodcrusher-musician', 1, ['cdm.w.hellblade', 'cdm.w.juggernauts-bladed-horn']],
    ])
    expect(loadout('flesh-hounds-1')).toEqual([
      ['gore-hound', 1, ['cdm.w.burning-roar', 'cdm.w.gore-drenched-fangs']],
      ['flesh-hound', 4, ['cdm.w.gore-drenched-fangs']],
    ])
    for (const ref of ['bloodletters-1', 'bloodcrushers', 'flesh-hounds-1']) {
      for (const c of sheetOf(ref).composition) {
        expect(c.statsOverride, `${ref}/${c.modelId}`).toBeUndefined()
        expect(c.champion, `${ref}/${c.modelId}`).toBeFalsy()
      }
    }
  })

  it('DMN-3 / DMN-5 enhancements and stratagems carry the spec mechanics', () => {
    const rage = bundle.enhancements['cdm.e.incarnated-rage']
    expect(rage.restriction?.keyword).toEqual(['BLOODMASTER'])
    expect(effectOf("cdm.e.incarnated-rage").when).toEqual({ weaponType: 'melee', leaderAttached: true })
    expect(effectOf("cdm.e.incarnated-rage").effect).toEqual({ grantWeaponAbility: { ability: 'LETHAL_HITS' } })
    const locus = bundle.enhancements['cdm.e.warp-locus']
    expect(locus.restriction?.keyword).toEqual(['BLOODMASTER'])
    expect(effectOf("cdm.e.warp-locus").code).toBe('warpLocus')
    expect(effectOf("cdm.e.warp-locus").params).toEqual({ range: 3 })

    const banish = bundle.stratagems['cdm.s.blood-maddened-banishment']
    expect(banish.code).toBe('daemonicFervour')
    expect(banish.params).toEqual({ threshold: 4 })
    expect(banish.window).toBe('fight.targetsDeclared')
    expect(banish.targets[0].filter).toEqual({ keyword: 'BLOODLETTERS' })
    const predators = bundle.stratagems['cdm.s.empyric-predators']
    expect(predators.code).toBe('empyricPredators')
    expect(predators.params).toEqual({ range: 6, distance: 6 })
    expect(predators.window).toBe('movement.unitMoved')
    expect(predators.targets[0].filter).toEqual({ keyword: 'FLESH HOUNDS' })
    const hate = bundle.stratagems['cdm.s.manifest-hate']
    expect(hate.effect).toEqual({ invuln: 4 })
    expect(hate.window).toBe('shooting.targetsDeclared')
    expect(hate.targets[0].filter).toEqual({ keyword: 'LEGIONES DAEMONICA' })
    for (const s of [banish, predators, hate]) expect(s.cost, s.id).toBe(1)
  })

  it('DMN-4 secondary objectives use the spec scoring codes', () => {
    const [worthy, conj] = patrol.secondaries
    expect(worthy.scoring).toEqual([
      { id: 'worthy-offerings', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 6, cap: 10, code: 'worthyOfferings', params: { unitPoints: 6, warlordPoints: 10 } },
    ])
    expect(conj.scoring).toEqual([
      { id: 'dark-conjunction', when: 'turn.end', rounds: { from: 2, to: 5 }, who: 'active', rule: 'custom', pointsPer: 1, cap: 999, code: 'darkConjunction' },
    ])
  })
})
