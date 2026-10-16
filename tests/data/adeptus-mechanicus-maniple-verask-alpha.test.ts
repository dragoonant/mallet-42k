import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { CombatPatrolData, DataBundle, DatasheetData } from '../../src/data/types'
import { validateAllData } from '../../tools/validate-data'

// Adeptus Mechanicus: Maniple Verask-Alpha (docs/spec/factions/adeptus-mechanicus--maniple-verask-alpha.md, MVA-001..002).
const FACTION = 'adeptus-mechanicus'
const PATROL = 'adm.cp.maniple-verask-alpha'
const FIRST = 'adm.cp.purge-corps-deltic-9'

let bundle: DataBundle
let patrol: CombatPatrolData
beforeAll(async () => {
  bundle = await loadBundle()
  patrol = bundle.patrols[PATROL]
})

const sheetOf = (ref: string): DatasheetData => bundle.datasheets[patrol.units.find((u) => u.ref === ref)!.datasheet]
const modelCount = (ds: DatasheetData): number => ds.composition.reduce((n, c) => n + c.default, 0)
const abilityIds = (ds: DatasheetData): string[] => ds.abilities.map((a) => (typeof a === 'string' ? a : a.id))

describe('adeptus-mechanicus Maniple Verask-Alpha data', () => {
  it('every adeptus-mechanicus file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith(`factions/${FACTION}/`))
    expect(reports.length).toBeGreaterThanOrEqual(14)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('MVA-001 patrol loads: 4 units, 15 models; Verask WARLORD with Omniballistic Data-Tether attached to the Rangers; Explorator Acquisition default; Deltic-9 unchanged', () => {
    const faction = bundle.factions[FACTION]
    expect(faction.combatPatrols).toEqual([FIRST, PATROL])
    expect(faction.armyRule).toBe('adm.a.doctrina-imperatives')
    expect(patrol.faction).toBe(FACTION)
    expect(patrol.units.map((u) => u.ref)).toEqual(['verask', 'rangers', 'kataphrons', 'dunecrawler'])
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    for (const u of patrol.units) expect(modelCount(bundle.datasheets[u.datasheet]), u.ref).toBe(u.size)
    expect(patrol.warlord).toBe('verask')
    const verask = patrol.units.find((u) => u.ref === 'verask')!
    expect(verask.enhancement).toBe('adm.e.omniballistic-data-tether')
    expect(verask.attachTo).toBe('rangers')
    expect(patrol.enhancements).toEqual([
      { id: 'adm.e.omniballistic-data-tether', default: true },
      { id: 'adm.e.imperative-surge-wafer', default: false },
    ])
    expect(patrol.secondaries.map((s) => [s.id, s.default])).toEqual([
      ['adm.sec.explorator-acquisition', true],
      ['adm.sec.holy-apparatus', false],
    ])
    expect(patrol.stratagems).toEqual(['adm.s.mva-retribution-codes', 'adm.s.mva-reactive-field-shroud', 'adm.s.mva-retrogradial-targeting'])
    expect(bundle.stratagems['adm.s.mva-retrogradial-targeting'].cost).toBe(2)
    expect(bundle.stratagems['adm.s.mva-retribution-codes'].cost).toBe(1)
    // Purge Corps Deltic-9 still loads unchanged
    const first = bundle.patrols[FIRST]
    expect(first.units.map((u) => u.ref)).toEqual(['skand', 'vanguard', 'sulphurhounds', 'pteraxii'])
    expect(first.stratagems.some((id) => patrol.stratagems.includes(id))).toBe(false)
    expect(bundle.factions[FACTION].detachments[0].stratagems).toEqual(first.stratagems)
  })

  it('MVA-001 every datasheet, weapon, ability, stratagem and enhancement reference resolves', () => {
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

  it('MVA-002 stats, keywords, invulnerable saves, bases and Doctrina ownership match the spec table', () => {
    const rows: [string, number[], number, number, string[]][] = [
      // ref, [M, T, Sv, W, Ld, OC], invuln, mm of first model, extra keywords
      ['verask', [6, 4, 3, 3, 7, 1], 5, 32, ['INFANTRY', 'CHARACTER', 'TECH-PRIEST', 'ENGINSEER', 'VERASK']],
      ['rangers', [6, 3, 5, 1, 7, 2], 6, 25, ['INFANTRY', 'BATTLELINE', 'SKITARII', 'RANGERS']],
      ['kataphrons', [5, 6, 3, 3, 7, 1], 6, 60, ['INFANTRY', 'KATAPHRON', 'DESTROYERS']],
      ['dunecrawler', [8, 10, 2, 11, 7, 3], 4, 130, ['VEHICLE', 'WALKER', 'SKITARII', 'ONAGER DUNECRAWLER']],
    ]
    for (const [ref, [M, T, Sv, W, Ld, OC], invuln, mm, kws] of rows) {
      const ds = sheetOf(ref)
      expect([ds.stats.M, ds.stats.T, ds.stats.Sv, ds.stats.W, ds.stats.Ld, ds.stats.OC], ref).toEqual([M, T, Sv, W, Ld, OC])
      expect(ds.factionKeywords, ref).toEqual(['ADEPTUS MECHANICUS'])
      expect(ds.invuln, ref).toBe(invuln)
      expect(ds.composition[0].base.mm, ref).toBe(mm)
      for (const k of kws) expect(ds.keywords, `${ref} ${k}`).toContain(k)
      expect(ds.keywords, ref).toContain('IMPERIUM')
    }
    const arquebus = sheetOf('rangers').composition.find((c) => c.modelId === 'arquebus')!
    expect(arquebus.base).toEqual({ shape: 'oval', mm: 60, mm2: 35 })
    for (const c of sheetOf('rangers').composition.filter((c) => c.modelId !== 'arquebus')) expect(c.base).toEqual({ shape: 'round', mm: 25 })
    const doctrina = (ds: DatasheetData) => abilityIds(ds).filter((id) => id.startsWith('adm.a.doctrina-'))
    expect(doctrina(sheetOf('verask'))).toEqual([])
    for (const ref of ['rangers', 'kataphrons', 'dunecrawler']) {
      expect(doctrina(sheetOf(ref)).sort(), ref).toEqual([
        'adm.a.doctrina-conqueror-ap',
        'adm.a.doctrina-conqueror-assault',
        'adm.a.doctrina-protector-ap',
        'adm.a.doctrina-protector-heavy',
      ])
    }
    expect(abilityIds(sheetOf('verask')).sort()).toEqual(['adm.a.enginseer', 'adm.a.omnissiahs-blessing'])
    // Verask leads only the Rangers
    expect(sheetOf('verask').coreAbilities).toEqual([{ ability: 'LEADER' }])
    expect(sheetOf('verask').leader!.attachTo).toEqual(['adm.skitarii-rangers'])
    expect(sheetOf('rangers').coreAbilities).toEqual([{ ability: 'SCOUTS', value: 6 }])
    expect(sheetOf('dunecrawler').coreAbilities).toEqual([{ ability: 'DEADLY_DEMISE', value: 'D3' }])
    expect(sheetOf('dunecrawler').damaged).toEqual({ threshold: 4, effect: { modifyRoll: { roll: 'hit', value: -1 } } })
    expect(sheetOf('kataphrons').leader).toBeUndefined()
  })

  it('MVA-002 weapon profiles match the spec table; reused ids are unchanged', () => {
    const w = bundle.weapons
    const row = (id: string) => {
      const x = w[id]
      return [x.type, x.range, x.A, x.skill, x.S, x.AP, x.D, x.abilities.map((a) => a.ability + (a.value !== undefined ? ` ${a.value}` : '') + (a.keyword ? `:${a.keyword}` : '')).sort()]
    }
    expect(row('adm.w.mechanicus-pistol-verask')).toEqual(['ranged', 12, 1, 3, 6, -1, 1, ['DEVASTATING_WOUNDS', 'PISTOL']])
    expect(row('adm.w.omnissian-axe')).toEqual(['melee', 0, 3, 4, 6, -2, 2, []])
    expect(row('adm.w.servo-arm')).toEqual(['melee', 0, 1, 4, 6, -2, 2, ['EXTRA_ATTACKS']])
    expect(row('adm.w.galvanic-rifle')).toEqual(['ranged', 30, 2, 4, 4, 0, 1, []])
    expect(row('adm.w.transuranic-arquebus')).toEqual(['ranged', 36, 1, 4, 7, -2, 'D3', ['HEAVY', 'PRECISION']])
    expect(row('adm.w.cognis-flamer')).toEqual(['ranged', 12, 'D6', null, 4, 0, 1, ['IGNORES_COVER', 'TORRENT']])
    expect(row('adm.w.heavy-grav-cannon')).toEqual(['ranged', 30, 4, 4, 6, -1, 2, ['ANTI 2:VEHICLE']])
    expect(row('adm.w.kataphron-plasma-culverin-standard')).toEqual(['ranged', 36, 4, 4, 7, -2, 1, []])
    expect(row('adm.w.kataphron-plasma-culverin-supercharge')).toEqual(['ranged', 36, 4, 4, 8, -3, 2, ['HAZARDOUS']])
    expect(w['adm.w.kataphron-plasma-culverin-standard'].profileGroup).toBe(w['adm.w.kataphron-plasma-culverin-supercharge'].profileGroup)
    expect(row('adm.w.phosphor-blaster')).toEqual(['ranged', 24, 1, 4, 5, 0, 1, ['IGNORES_COVER', 'RAPID_FIRE 1']])
    expect(row('adm.w.kataphron-close-combat-weapon')).toEqual(['melee', 0, 2, 4, 5, 0, 1, []])
    expect(row('adm.w.cognis-heavy-stubber')).toEqual(['ranged', 36, 3, 4, 4, 0, 1, ['RAPID_FIRE 3', 'SUSTAINED_HITS 1']])
    expect(row('adm.w.daedalus-missile-launcher')).toEqual(['ranged', 48, 1, 4, 10, -2, 'D6+1', ['ANTI 2:FLY']])
    expect(row('adm.w.icarus-array')).toEqual(['ranged', 48, 6, 4, 8, -1, 2, ['ANTI 4:FLY', 'TWIN_LINKED']])
    expect(row('adm.w.dunecrawler-legs')).toEqual(['melee', 0, 3, 4, 6, 0, 1, []])
    // reused Purge Corps weapons keep their values
    expect(row('adm.w.mechanicus-pistol')).toEqual(['ranged', 12, 1, 4, 6, -1, 1, ['DEVASTATING_WOUNDS', 'PISTOL']])
    expect(row('adm.w.arc-rifle')).toEqual(['ranged', 30, 1, 4, 8, -1, 'D3', ['ANTI 4:VEHICLE', 'DEVASTATING_WOUNDS', 'RAPID_FIRE 1']])
    expect(row('adm.w.alpha-combat-weapon')).toEqual(['melee', 0, 2, 4, 5, -1, 1, []])
    expect(row('adm.w.close-combat-weapon')).toEqual(['melee', 0, 1, 4, 3, 0, 1, []])
  })

  it('MVA-002 wargear per model matches the box build', () => {
    const loadout = (ref: string) => sheetOf(ref).composition.map((c) => [c.modelId, c.default, [...c.weapons.default]])
    expect(loadout('verask')).toEqual([['verask', 1, ['adm.w.mechanicus-pistol-verask', 'adm.w.omnissian-axe', 'adm.w.servo-arm']]])
    expect(loadout('rangers')).toEqual([
      ['alpha', 1, ['adm.w.mechanicus-pistol', 'adm.w.alpha-combat-weapon']],
      ['ranger', 6, ['adm.w.galvanic-rifle', 'adm.w.close-combat-weapon']],
      ['data-tether', 1, ['adm.w.galvanic-rifle', 'adm.w.close-combat-weapon']],
      ['arc-rifle', 1, ['adm.w.arc-rifle', 'adm.w.close-combat-weapon']],
      ['arquebus', 1, ['adm.w.transuranic-arquebus', 'adm.w.close-combat-weapon']],
    ])
    expect(loadout('kataphrons')).toEqual([
      ['grav', 1, ['adm.w.heavy-grav-cannon', 'adm.w.phosphor-blaster', 'adm.w.kataphron-close-combat-weapon']],
      ['plasma', 2, ['adm.w.kataphron-plasma-culverin-standard', 'adm.w.kataphron-plasma-culverin-supercharge', 'adm.w.cognis-flamer', 'adm.w.kataphron-close-combat-weapon']],
    ])
    expect(loadout('dunecrawler')).toEqual([
      ['dunecrawler', 1, ['adm.w.daedalus-missile-launcher', 'adm.w.cognis-heavy-stubber', 'adm.w.icarus-array', 'adm.w.dunecrawler-legs']],
    ])
  })

  it('MVA-002 enhancements, stratagems, secondaries and abilities carry the spec descriptors and code hooks', () => {
    const tether = bundle.enhancements['adm.e.omniballistic-data-tether']
    expect(tether.restriction).toEqual({ keyword: ['ENGINSEER'] })
    expect((tether.effect as { id: string; trigger: string }[]).map((e) => [e.id, e.trigger])).toEqual([
      ['adm.e.omniballistic-data-tether.hit', 'hitRoll'],
      ['adm.e.omniballistic-data-tether.wound', 'woundRoll'],
    ])
    const wafer = (bundle.enhancements['adm.e.imperative-surge-wafer'].effect as { code?: string; limit?: string; trigger: string }[])[0]
    expect([wafer.trigger, wafer.code, wafer.limit]).toEqual(['unitSelectedToShoot', 'imperativeSurgeWafer', 'oncePerBattle'])
    expect(bundle.stratagems['adm.s.mva-retribution-codes'].code).toBe('retributionCodes')
    expect(bundle.stratagems['adm.s.mva-retribution-codes'].window).toBe('attack.modelDestroyed')
    expect(bundle.stratagems['adm.s.mva-reactive-field-shroud'].code).toBe('keywordAnyOf')
    expect(bundle.stratagems['adm.s.mva-retrogradial-targeting'].code).toBe('justFellBack')
    const sec = patrol.secondaries
    expect(sec[0].scoring.map((r) => [r.when, r.code, r.pointsPer, r.cap, r.rounds])).toEqual([['command.end', 'exploratorAcquisition', 4, 12, { from: 2, to: 5 }]])
    expect(sec[1].scoring.map((r) => [r.when, r.code, r.pointsPer, r.cap])).toEqual([['battle.end', 'mvaHolyApparatus', 4, 8]])
    expect((bundle.abilities['adm.a.enginseer'] as unknown as { code: string }).code).toBe('enginseerLoneOperative')
    expect((bundle.abilities['adm.a.omnissiahs-blessing'] as unknown as { code: string }).code).toBe('omnissiahsBlessing')
  })
})
