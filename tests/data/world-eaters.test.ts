import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { CombatPatrolData, DataBundle, DatasheetData } from '../../src/data/types'
import { validateAllData } from '../../tools/validate-data'

// World Eaters: Karagar's Rampagers (docs/spec/factions/world-eaters.md, WOR-001..002).
const FACTION = 'world-eaters'
const PATROL = 'we.cp.karagars-rampagers'

let bundle: DataBundle
let patrol: CombatPatrolData
beforeAll(async () => {
  bundle = await loadBundle()
  patrol = bundle.patrols[PATROL]
})

const sheetOf = (ref: string): DatasheetData => bundle.datasheets[patrol.units.find((u) => u.ref === ref)!.datasheet]
const modelCount = (ds: DatasheetData): number => ds.composition.reduce((n, c) => n + c.default, 0)
const abilityIds = (ds: DatasheetData): string[] => ds.abilities.map((a) => (typeof a === 'string' ? a : a.id))

describe('world-eaters data', () => {
  it('every world-eaters file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith(`factions/${FACTION}/`))
    expect(reports.length).toBeGreaterThanOrEqual(9)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('WOR-001 patrol loads: 3 units, 21 models; Karagar WARLORD with Skulls for Khorne, not attached; Ravage and Ransack default', () => {
    const faction = bundle.factions[FACTION]
    expect(faction.factionKeyword).toBe('WORLD EATERS')
    expect(faction.combatPatrols).toEqual([PATROL])
    expect(bundle.abilities[faction.armyRule]).toBeDefined()
    expect(patrol.faction).toBe(FACTION)
    expect(patrol.units.map((u) => u.ref)).toEqual(['karagar', 'berzerkers', 'jakhals'])
    expect(patrol.units.reduce((n, u) => n + modelCount(bundle.datasheets[u.datasheet]), 0)).toBe(21)
    for (const u of patrol.units) expect(modelCount(bundle.datasheets[u.datasheet]), u.ref).toBe(u.size)
    expect(patrol.warlord).toBe('karagar')
    const karagar = patrol.units.find((u) => u.ref === 'karagar')!
    expect(karagar.enhancement).toBe('we.e.skulls-for-khorne')
    expect(karagar.attachTo).toBeUndefined()
    expect(patrol.enhancements).toEqual([
      { id: 'we.e.skulls-for-khorne', default: true },
      { id: 'we.e.arch-slaughterer', default: false },
    ])
    expect(patrol.secondaries.map((s) => [s.id, s.default])).toEqual([
      ['we.sec.ravage-and-ransack', true],
      ['we.sec.blood-offering', false],
    ])
    expect(patrol.stratagems).toEqual(['we.s.rage-unchecked', 'we.s.unstoppable-fury', 'we.s.overwhelming-onslaught'])
    expect(faction.detachments[0].stratagems).toEqual(patrol.stratagems)
  })

  it('WOR-001 every datasheet, weapon, ability, stratagem and enhancement reference resolves', () => {
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

  it('WOR-002 stats, keywords and Blessings ownership match the spec table', () => {
    const rows: [string, number[], string[]][] = [
      ['karagar', [10, 6, 2, 7, 6, 2], ['MOUNTED', 'CHARACTER', 'CHAOS', 'KHORNE', 'LORD ON JUGGERNAUT', 'KARAGAR THE BLOODED']],
      ['berzerkers', [6, 4, 3, 2, 6, 2], ['INFANTRY', 'CHAOS', 'KHORNE', 'BERZERKERS']],
      ['jakhals', [6, 3, 6, 1, 7, 1], ['INFANTRY', 'BATTLELINE', 'CHAOS', 'KHORNE', 'JAKHALS']],
    ]
    for (const [ref, [M, T, Sv, W, Ld, OC], kws] of rows) {
      const ds = sheetOf(ref)
      expect([ds.stats.M, ds.stats.T, ds.stats.Sv, ds.stats.W, ds.stats.Ld, ds.stats.OC], ref).toEqual([M, T, Sv, W, Ld, OC])
      expect(ds.factionKeywords, ref).toEqual(['WORLD EATERS'])
      for (const k of kws) expect(ds.keywords, `${ref} ${k}`).toContain(k)
      expect(abilityIds(ds), ref).toEqual([
        'we.a.blessings-of-khorne',
        'we.a.blessing-wrathful-devotion',
        'we.a.blessing-total-carnage',
        'we.a.blessing-warp-blades',
      ])
      expect(ds.leader, ref).toBeUndefined()
      expect(ds.coreAbilities.some((c) => c.ability === 'LEADER'), ref).toBe(false)
    }
    expect(sheetOf('karagar').invuln).toBe(4)
    expect(sheetOf('karagar').composition[0].base).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    expect(sheetOf('berzerkers').invuln).toBeUndefined()
    expect(sheetOf('jakhals').coreAbilities).toEqual([{ ability: 'FEEL_NO_PAIN', value: 6 }])
    expect(sheetOf('jakhals').composition.find((c) => c.modelId === 'dishonoured')!.base).toEqual({ shape: 'round', mm: 40 })
    expect(sheetOf('jakhals').composition.find((c) => c.modelId === 'jakhal')!.base).toEqual({ shape: 'round', mm: 28 })
    expect(sheetOf('berzerkers').composition.every((c) => c.base.shape === 'round' && c.base.mm === 32)).toBe(true)
  })

  it('WOR-002 weapon profiles match the spec table', () => {
    const w = bundle.weapons
    const row = (id: string) => {
      const x = w[id]
      return [x.type, x.range, x.A, x.skill, x.S, x.AP, x.D, x.abilities.map((a) => a.ability + (a.value !== undefined ? ` ${a.value}` : '')).sort()]
    }
    expect(row('we.w.plasma-pistol-karagar')).toEqual(['ranged', 12, 1, 2, 7, -2, 1, ['PISTOL']])
    expect(row('we.w.plasma-pistol-karagar-supercharge')).toEqual(['ranged', 12, 1, 2, 8, -3, 2, ['HAZARDOUS', 'PISTOL']])
    expect(w['we.w.plasma-pistol-karagar'].profileGroup).toBe(w['we.w.plasma-pistol-karagar-supercharge'].profileGroup)
    expect(row('we.w.exalted-chainblade')).toEqual(['melee', 0, 7, 2, 6, -1, 2, []])
    expect(row('we.w.juggernauts-bladed-horn')).toEqual(['melee', 0, 4, 3, 6, -1, 2, ['EXTRA_ATTACKS', 'LANCE']])
    expect(row('we.w.berzerker-chainblade')).toEqual(['melee', 0, 4, 3, 5, -1, 1, []])
    expect(row('we.w.khornate-eviscerator')).toEqual(['melee', 0, 3, 3, 8, -2, 2, []])
    expect(row('we.w.jakhal-chainblades')).toEqual(['melee', 0, 2, 4, 3, 0, 1, ['SUSTAINED_HITS 1']])
    expect(row('we.w.mauler-chainblade')).toEqual(['melee', 0, 2, 5, 5, -1, 2, ['SUSTAINED_HITS 1']])
    expect(row('we.w.skullsmasher')).toEqual(['melee', 0, 4, 4, 4, -1, 2, []])
    // shared pistols reuse the CSM profiles
    expect(row('csm.w.plasma-pistol')).toEqual(['ranged', 12, 1, 3, 7, -2, 1, ['PISTOL']])
    expect(row('csm.w.plasma-pistol-supercharge')).toEqual(['ranged', 12, 1, 3, 8, -3, 2, ['HAZARDOUS', 'PISTOL']])
    expect(row('csm.w.bolt-pistol')).toEqual(['ranged', 12, 1, 3, 4, 0, 1, ['PISTOL']])
    expect(row('csm.w.autopistol')).toEqual(['ranged', 12, 1, 4, 3, 0, 1, ['PISTOL']])
  })

  it('WOR-002 wargear per model matches the box build', () => {
    const loadout = (ref: string) => sheetOf(ref).composition.map((c) => [c.modelId, c.default, [...c.weapons.default]])
    const PP = ['csm.w.plasma-pistol', 'csm.w.plasma-pistol-supercharge']
    expect(loadout('karagar')).toEqual([
      ['karagar', 1, ['we.w.plasma-pistol-karagar', 'we.w.plasma-pistol-karagar-supercharge', 'we.w.exalted-chainblade', 'we.w.juggernauts-bladed-horn']],
    ])
    expect(loadout('berzerkers')).toEqual([
      ['champion', 1, [...PP, 'we.w.berzerker-chainblade']],
      ['plasma', 1, [...PP, 'we.w.berzerker-chainblade']],
      ['icon', 1, [...PP, 'we.w.berzerker-chainblade']],
      ['eviscerator', 2, ['csm.w.bolt-pistol', 'we.w.khornate-eviscerator']],
      ['chainblade', 5, ['csm.w.bolt-pistol', 'we.w.berzerker-chainblade']],
    ])
    expect(loadout('jakhals')).toEqual([
      ['pack-leader', 1, ['csm.w.autopistol', 'we.w.jakhal-chainblades']],
      ['dishonoured', 1, ['we.w.skullsmasher']],
      ['mauler', 1, ['csm.w.autopistol', 'we.w.mauler-chainblade']],
      ['icon', 1, ['csm.w.autopistol', 'we.w.jakhal-chainblades']],
      ['jakhal', 6, ['csm.w.autopistol', 'we.w.jakhal-chainblades']],
    ])
  })

  it('WOR hooks: code hooks and descriptors the engine expects are present', () => {
    expect(bundle.abilities['we.a.blessings-of-khorne'].code).toBe('blessingsOfKhorne')
    expect(bundle.abilities['we.a.blessings-of-khorne'].params).toMatchObject({ armyRule: true, dice: 8, max: 2 })
    expect(bundle.abilities['we.a.blessing-wrathful-devotion'].code).toBe('wrathfulDevotion')
    expect(bundle.abilities['we.a.blessing-total-carnage'].code).toBe('totalCarnage')
    const wb = bundle.abilities['we.a.blessing-warp-blades']
    expect(wb.code).toBe('blessingsOfKhorne')
    expect(wb.params).toEqual({ blessing: 'warpBlades' })
    expect((bundle.enhancements['we.e.skulls-for-khorne'].effect as { code?: string }).code).toBe('skullsForKhorne')
    expect(bundle.stratagems['we.s.unstoppable-fury'].window).toBe('fight.beforeConsolidate')
    expect(bundle.stratagems['we.s.rage-unchecked'].window).toEqual(['shooting.start', 'fight.start', 'fight.attacksResolved'])
    expect(bundle.stratagems['we.s.overwhelming-onslaught'].window).toBe('charge.moveEnded')
    expect(patrol.secondaries.flatMap((s) => s.scoring.map((r) => r.code))).toEqual(['ravageAndRansack', 'bloodOffering'])
  })
})
