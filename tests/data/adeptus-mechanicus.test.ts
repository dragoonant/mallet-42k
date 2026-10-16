import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { AbilityDescriptor, CombatPatrolData, DataBundle, DatasheetData } from '../../src/data/types'
import { validateAllData } from '../../tools/validate-data'

// Adeptus Mechanicus: Purge Corps Deltic-9 (docs/spec/factions/adeptus-mechanicus.md, ADM-001..002). Checks that the faction
// is in the bundle, passes schema validation, that every cross-reference resolves and that the §6 rows match.
const FACTION = 'adeptus-mechanicus'
const PATROL = 'adm.cp.purge-corps-deltic-9'

let bundle: DataBundle
let patrol: CombatPatrolData
beforeAll(async () => {
  bundle = await loadBundle()
  patrol = bundle.patrols[PATROL]
})

const sheetOf = (ref: string): DatasheetData => bundle.datasheets[patrol.units.find((u) => u.ref === ref)!.datasheet]
const modelCount = (ds: DatasheetData): number => ds.composition.reduce((n, c) => n + c.default, 0)
const abilityIds = (ds: DatasheetData): string[] => ds.abilities.map((a) => (typeof a === 'string' ? a : a.id))

describe('adeptus-mechanicus data', () => {
  it('every adeptus-mechanicus file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith(`factions/${FACTION}/`))
    expect(reports.length).toBeGreaterThanOrEqual(9)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('ADM-001 patrol loads: 4 units, 19 models; Skand WARLORD with Aspergilla of Tarentum attached to the Vanguard; Targeted Purge default', () => {
    const faction = bundle.factions[FACTION]
    expect(faction.factionKeyword).toBe('ADEPTUS MECHANICUS')
    expect(faction.combatPatrols[0]).toBe(PATROL)
    expect(bundle.abilities[faction.armyRule]).toBeDefined()
    expect(patrol.faction).toBe(FACTION)
    expect(patrol.units.map((u) => u.ref)).toEqual(['skand', 'vanguard', 'sulphurhounds', 'pteraxii'])
    expect(patrol.units.reduce((n, u) => n + modelCount(bundle.datasheets[u.datasheet]), 0)).toBe(19)
    for (const u of patrol.units) expect(modelCount(bundle.datasheets[u.datasheet]), u.ref).toBe(u.size)
    expect(patrol.warlord).toBe('skand')
    const skand = patrol.units.find((u) => u.ref === 'skand')!
    expect(skand.enhancement).toBe('adm.e.aspergilla-of-tarentum')
    expect(skand.attachTo).toBe('vanguard')
    expect(patrol.enhancements).toEqual([
      { id: 'adm.e.aspergilla-of-tarentum', default: true },
      { id: 'adm.e.overcharged-electropositors', default: false },
    ])
    expect(patrol.secondaries.map((s) => [s.id, s.default])).toEqual([
      ['adm.sec.targeted-purge', true],
      ['adm.sec.prescribed-excoriation', false],
    ])
    expect(patrol.stratagems).toEqual(['adm.s.pcd-evaluation-of-mettle', 'adm.s.pcd-optimised-efficiency', 'adm.s.pcd-acceptable-risk-ratio'])
    expect(faction.detachments[0].stratagems).toEqual(patrol.stratagems)
  })

  it('ADM-001 every datasheet, weapon, ability, stratagem and enhancement reference resolves', () => {
    for (const u of patrol.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.faction).toBe(FACTION)
      for (const id of abilityIds(ds)) expect(bundle.abilities[id], id).toBeDefined()
      for (const id of ds.leader?.effects ?? []) expect(bundle.abilities[typeof id === 'string' ? id : id.id], String(id)).toBeDefined()
      for (const c of ds.composition) for (const w of c.weapons.default) expect(bundle.weapons[w], w).toBeDefined()
      if (u.enhancement) expect(bundle.enhancements[u.enhancement]).toBeDefined()
    }
    for (const id of patrol.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
    for (const e of patrol.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
  })

  it('ADM-002 stats, keywords, invulnerable saves and Doctrina ownership match the spec table', () => {
    const rows: [string, number[], number, string[]][] = [
      // ref, [M, T, Sv, W, Ld, OC], mm of first model, extra keywords
      ['skand', [6, 4, 2, 4, 7, 1], 50, ['INFANTRY', 'CHARACTER', 'TECH-PRIEST', 'MANIPULUS SKAND']],
      ['vanguard', [6, 3, 4, 1, 7, 2], 25, ['INFANTRY', 'BATTLELINE', 'SKITARII', 'VANGUARD']],
      ['sulphurhounds', [12, 4, 4, 2, 7, 2], 60, ['MOUNTED', 'SKITARII', 'SERBERYS SULPHURHOUNDS']],
      ['pteraxii', [12, 4, 4, 2, 7, 1], 40, ['INFANTRY', 'FLY', 'JUMP PACK', 'SKITARII', 'PTERAXII', 'STERYLIZORS']],
    ]
    for (const [ref, [M, T, Sv, W, Ld, OC], mm, kws] of rows) {
      const ds = sheetOf(ref)
      expect([ds.stats.M, ds.stats.T, ds.stats.Sv, ds.stats.W, ds.stats.Ld, ds.stats.OC], ref).toEqual([M, T, Sv, W, Ld, OC])
      expect(ds.factionKeywords, ref).toEqual(['ADEPTUS MECHANICUS'])
      expect(ds.invuln, ref).toBe(5)
      expect(ds.composition[0].base.mm, ref).toBe(mm)
      for (const k of kws) expect(ds.keywords, `${ref} ${k}`).toContain(k)
      expect(ds.keywords, ref).toContain('IMPERIUM')
    }
    expect(sheetOf('sulphurhounds').composition[0].base).toEqual({ shape: 'oval', mm: 60, mm2: 35 })
    const doctrina = (ds: DatasheetData) => abilityIds(ds).filter((id) => id.startsWith('adm.a.doctrina-'))
    expect(doctrina(sheetOf('skand'))).toEqual([])
    for (const ref of ['vanguard', 'sulphurhounds', 'pteraxii']) {
      expect(doctrina(sheetOf(ref)).sort(), ref).toEqual([
        'adm.a.doctrina-conqueror-ap',
        'adm.a.doctrina-conqueror-assault',
        'adm.a.doctrina-protector-ap',
        'adm.a.doctrina-protector-heavy',
      ])
    }
    expect(sheetOf('skand').coreAbilities).toEqual([{ ability: 'LEADER' }])
    expect(sheetOf('skand').leader!.attachTo).toEqual(['adm.skitarii-vanguard'])
    expect(sheetOf('skand').leader!.effects).toEqual(['adm.a.galvanic-field'])
    expect(sheetOf('pteraxii').coreAbilities).toEqual([{ ability: 'DEEP_STRIKE' }])
    // only the Vanguard leads Skitarii models; nothing else accepts Skand
    for (const ref of ['sulphurhounds', 'pteraxii']) expect(sheetOf(ref).leader).toBeUndefined()
  })

  it('ADM-002 weapon profiles match the spec table', () => {
    const w = bundle.weapons
    const row = (id: string) => {
      const x = w[id]
      return [x.type, x.range, x.A, x.skill, x.S, x.AP, x.D, x.abilities.map((a) => a.ability + (a.value !== undefined ? ` ${a.value}` : '') + (a.keyword ? `:${a.keyword}` : '')).sort()]
    }
    expect(row('adm.w.transonic-cannon')).toEqual(['ranged', 12, 'D6', null, 4, 0, 2, ['DEVASTATING_WOUNDS', 'TORRENT']])
    expect(row('adm.w.omnissian-staff')).toEqual(['melee', 0, 4, 3, 6, -1, 2, []])
    expect(row('adm.w.mechanicus-pistol')).toEqual(['ranged', 12, 1, 4, 6, -1, 1, ['DEVASTATING_WOUNDS', 'PISTOL']])
    expect(row('adm.w.arc-rifle')).toEqual(['ranged', 30, 1, 4, 8, -1, 'D3', ['ANTI 4:VEHICLE', 'DEVASTATING_WOUNDS', 'RAPID_FIRE 1']])
    expect(row('adm.w.plasma-caliver-standard')).toEqual(['ranged', 30, 2, 4, 7, -2, 1, []])
    expect(row('adm.w.plasma-caliver-supercharge')).toEqual(['ranged', 30, 2, 4, 8, -3, 2, ['HAZARDOUS']])
    expect(w['adm.w.plasma-caliver-standard'].profileGroup).toBe(w['adm.w.plasma-caliver-supercharge'].profileGroup)
    expect(row('adm.w.radium-carbine')).toEqual(['ranged', 18, 3, 4, 3, 0, 1, ['ANTI 4:INFANTRY']])
    expect(row('adm.w.alpha-combat-weapon')).toEqual(['melee', 0, 2, 4, 5, -1, 1, []])
    expect(row('adm.w.close-combat-weapon')).toEqual(['melee', 0, 1, 4, 3, 0, 1, []])
    expect(row('adm.w.phosphor-blast-carbine')).toEqual(['ranged', 18, 'D6', 4, 6, 0, 1, ['BLAST', 'IGNORES_COVER']])
    expect(row('adm.w.phosphor-pistol')).toEqual(['ranged', 12, 1, 4, 4, 0, 1, ['IGNORES_COVER', 'PISTOL']])
    expect(row('adm.w.paired-phosphor-pistols')).toEqual(['ranged', 12, 2, 4, 4, 0, 1, ['IGNORES_COVER', 'PISTOL']])
    expect(row('adm.w.sulphur-breath')).toEqual(['ranged', 9, 'D6', null, 3, -1, 1, ['IGNORES_COVER', 'PISTOL', 'TORRENT']])
    expect(row('adm.w.cavalry-arc-maul')).toEqual(['melee', 0, 1, 4, 5, -1, 1, ['ANTI 4:VEHICLE', 'DEVASTATING_WOUNDS', 'EXTRA_ATTACKS']])
    expect(row('adm.w.clawed-limbs')).toEqual(['melee', 0, 4, 4, 4, 0, 1, []])
    expect(row('adm.w.flechette-blaster')).toEqual(['ranged', 12, 5, 4, 3, 0, 1, ['PISTOL']])
    expect(row('adm.w.phosphor-torch')).toEqual(['ranged', 12, 'D6', null, 4, 0, 1, ['IGNORES_COVER', 'TORRENT']])
    expect(row('adm.w.pteraxii-talons')).toEqual(['melee', 0, 2, 4, 4, 0, 1, []])
    expect(row('adm.w.taser-goad')).toEqual(['melee', 0, 3, 4, 6, 0, 1, ['SUSTAINED_HITS 2']])
  })

  it('ADM-002 wargear per model matches the box build', () => {
    const loadout = (ref: string) => sheetOf(ref).composition.map((c) => [c.modelId, c.default, [...c.weapons.default]])
    expect(loadout('skand')).toEqual([['skand', 1, ['adm.w.transonic-cannon', 'adm.w.omnissian-staff']]])
    expect(loadout('vanguard')).toEqual([
      ['alpha', 1, ['adm.w.mechanicus-pistol', 'adm.w.alpha-combat-weapon']],
      ['arc-rifle', 1, ['adm.w.arc-rifle', 'adm.w.close-combat-weapon']],
      ['plasma-caliver', 1, ['adm.w.plasma-caliver-standard', 'adm.w.plasma-caliver-supercharge', 'adm.w.close-combat-weapon']],
      ['vanguard', 7, ['adm.w.radium-carbine', 'adm.w.close-combat-weapon']],
    ])
    expect(loadout('sulphurhounds').map((l) => [l[0], l[1]])).toEqual([['alpha', 1], ['carbine', 1], ['pistols', 1]])
    expect(loadout('pteraxii')).toEqual([
      ['alpha', 1, ['adm.w.flechette-blaster', 'adm.w.phosphor-torch', 'adm.w.taser-goad', 'adm.w.pteraxii-talons']],
      ['sterylizor', 4, ['adm.w.phosphor-torch', 'adm.w.pteraxii-talons']],
    ])
  })

  it('ADM-003..026 descriptors carry the code hooks and declarative effects the engine maps (Doctrina, Rad-saturation, Line-breakers, secondaries)', () => {
    const a = (id: string): AbilityDescriptor => bundle.abilities[id]
    expect(a('adm.a.doctrina-protector-ap').params).toEqual({ imperative: 'protector', zone: 'holderInOwnZone' })
    expect(a('adm.a.doctrina-protector-ap').scope).toEqual({ who: 'attacker' })
    expect(a('adm.a.doctrina-conqueror-ap').params).toEqual({ imperative: 'conqueror', zone: 'targetInEnemyZone' })
    expect(a('adm.a.rad-saturation').scope).toEqual({ who: 'enemy', within: 3 })
    expect(a('adm.a.rad-saturation').code).toBe('radSaturation')
    expect(a('adm.a.line-breakers').code).toBe('lineBreakers')
    expect(a('adm.a.searing-conflagration').when).toEqual({ weaponId: 'adm.w.phosphor-torch', targetOnObjective: true })
    const codes = new Set<string>()
    for (const s of patrol.secondaries) for (const r of s.scoring) if (r.code) codes.add(r.code)
    expect([...codes].sort()).toEqual(['prescribedExcoriation', 'targetedPurgePick', 'targetedPurgeScore'])
    expect(bundle.stratagems['adm.s.pcd-optimised-efficiency'].code).toBe('justFellBack')
    expect(bundle.stratagems['adm.s.pcd-evaluation-of-mettle'].effect).toEqual({ feelNoPain: 5 })
  })
})
