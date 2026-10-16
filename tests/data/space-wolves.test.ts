import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { CombatPatrolData, DataBundle, DatasheetData } from '../../src/data/types'
import { validateAllData } from '../../tools/validate-data'

// Space Wolves: Thoryk's Void Hunters (docs/spec/factions/space-wolves.md, SPA-001..003).
const FACTION = 'space-wolves'
const PATROL = 'sw.cp.thoryks-void-hunters'

let bundle: DataBundle
let patrol: CombatPatrolData
beforeAll(async () => {
  bundle = await loadBundle()
  patrol = bundle.patrols[PATROL]
})

const modelCount = (ds: DatasheetData): number => ds.composition.reduce((n, c) => n + c.default, 0)
const abilityIds = (ds: DatasheetData): string[] => ds.abilities.map((a) => (typeof a === 'string' ? a : a.id))

describe('space-wolves data', () => {
  it('every space-wolves file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith(`factions/${FACTION}/`))
    expect(reports.length).toBeGreaterThanOrEqual(9)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('SPA-001 patrol loads: 4 units, 17 models; Thoryk WARLORD with Tireless Hunter attached to Intercessors; Mighty Saga default; SM patrols unchanged', () => {
    const faction = bundle.factions[FACTION]
    expect(faction.factionKeyword).toBe('ADEPTUS ASTARTES')
    expect(faction.armyRule).toBe('sm.a.oath-of-moment')
    expect(faction.combatPatrols).toEqual([PATROL])
    expect(patrol.faction).toBe(FACTION)
    expect(patrol.units.map((u) => u.ref)).toEqual([
      'battle-leader-thoryk',
      'intercessor-squad',
      'reiver-squad',
      'invictor-tactical-warsuit',
    ])
    expect(patrol.units.reduce((n, u) => n + modelCount(bundle.datasheets[u.datasheet]), 0)).toBe(17)
    for (const u of patrol.units) expect(modelCount(bundle.datasheets[u.datasheet]), u.ref).toBe(u.size)
    expect(patrol.warlord).toBe('battle-leader-thoryk')
    const thoryk = patrol.units.find((u) => u.ref === 'battle-leader-thoryk')!
    expect(thoryk.enhancement).toBe('sw.e.tireless-hunter')
    expect(thoryk.attachTo).toBe('intercessor-squad')
    expect(patrol.enhancements).toEqual([
      { id: 'sw.e.tireless-hunter', default: true },
      { id: 'sw.e.ferocious', default: false },
    ])
    expect(patrol.secondaries.map((s) => [s.id, s.default])).toEqual([
      ['sw.sec.mighty-saga', true],
      ['sw.sec.reiving-conquerors', false],
    ])
    expect(patrol.stratagems).toEqual(['sw.s.a-warriors-death', 'sw.s.keen-senses', 'sw.s.pack-ambush'])
    expect(faction.detachments[0].stratagems).toEqual(patrol.stratagems)
    expect(faction.detachments[0].enhancements).toEqual(patrol.enhancements.map((e) => e.id))
    for (const id of patrol.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
    for (const e of patrol.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    expect(bundle.factions['sm'].combatPatrols).toEqual(['sm.cp.strike-force-octavius', 'sm.cp.strike-team-solarien'])
    expect(bundle.patrols['sm.cp.strike-force-octavius'].units).toHaveLength(4)
  })

  it('SPA-002 Patrol Squads: Intercessors split into 5 + 5, sergeant in half A; Thoryk may only lead the Intercessors', () => {
    const inter = patrol.units.find((u) => u.ref === 'intercessor-squad')!
    expect(inter.patrolSquads!.map((h) => h.size)).toEqual([5, 5])
    expect(inter.patrolSquads![0].wargear!.map((w) => [w.modelId, w.count])).toEqual([
      ['sergeant', 1],
      ['intercessor', 4],
    ])
    expect(inter.patrolSquads![1].wargear!.map((w) => [w.modelId, w.count])).toEqual([['intercessor', 5]])
    const ds = bundle.datasheets['sw.intercessor-squad']
    expect(abilityIds(ds)).toEqual(['sm.a.oath-of-moment', 'sm.a.patrol-squads'])
    expect(bundle.datasheets['sw.battle-leader-thoryk'].leader!.attachTo).toEqual(['sw.intercessor-squad'])
  })

  it('SPA-003 datasheet stats, profiles and ids match the spec; reused sm ids unchanged', () => {
    const d = bundle.datasheets
    expect(d['sw.intercessor-squad'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(d['sw.reiver-squad'].stats).toMatchObject({ M: 6, T: 4, W: 2, OC: 1 })
    expect(d['sw.invictor-tactical-warsuit'].stats).toMatchObject({ M: 8, T: 8, Sv: 3, W: 12, Ld: 6, OC: 4 })
    expect(d['sw.battle-leader-thoryk'].stats).toMatchObject({ M: 6, T: 4, W: 4, OC: 1 })
    for (const id of Object.keys(d).filter((k) => k.startsWith('sw.'))) {
      expect(d[id].factionKeywords).toEqual(['ADEPTUS ASTARTES', 'SPACE WOLVES'])
      expect(abilityIds(d[id])).toContain('sm.a.oath-of-moment')
      expect(d[id].keywords).toContain('IMPERIUM')
    }
    const core = (id: string) => Object.fromEntries(d[id].coreAbilities.map((c) => [c.ability, c.value ?? true]))
    expect(core('sw.reiver-squad')).toEqual({ DEEP_STRIKE: true, SCOUTS: 6 })
    expect(core('sw.invictor-tactical-warsuit')).toEqual({ DEADLY_DEMISE: 'D3', SCOUTS: 8 })
    expect(core('sw.battle-leader-thoryk')).toEqual({ LEADER: true })
    expect(d['sw.invictor-tactical-warsuit'].damaged).toEqual({
      threshold: 4,
      effect: { modifyRoll: { roll: 'hit', value: -1 } },
    })
    expect(d['sw.invictor-tactical-warsuit'].composition[0].base).toEqual({ shape: 'round', mm: 90 })
    expect(d['sw.battle-leader-thoryk'].keywords).toContain('BATTLE LEADER')
    expect(d['sw.intercessor-squad'].keywords).toContain('BATTLELINE')

    const w = bundle.weapons
    expect(w['sw.w.twin-ironhail-autocannon']).toMatchObject({ range: 48, A: 3, skill: 3, S: 9, AP: -1, D: 3 })
    expect(w['sw.w.twin-ironhail-autocannon'].abilities.map((a) => a.ability)).toEqual(['TWIN_LINKED'])
    expect(w['sw.w.twin-ironhail-heavy-stubber']).toMatchObject({ range: 36, A: 3, S: 4, AP: 0, D: 1 })
    expect(w['sw.w.twin-ironhail-heavy-stubber'].abilities).toEqual([
      { ability: 'RAPID_FIRE', value: 3 },
      { ability: 'TWIN_LINKED' },
    ])
    expect(w['sw.w.heavy-bolter']).toMatchObject({ range: 36, A: 3, S: 5, AP: -1, D: 2 })
    expect(w['sw.w.fragstorm-grenade-launcher']).toMatchObject({ range: 18, A: 'D6', S: 4, AP: 0, D: 1 })
    expect(w['sw.w.invictor-fist']).toMatchObject({ type: 'melee', A: 5, S: 14, AP: -2, D: 3 })
    expect(w['sw.w.bolt-pistol-thoryk']).toMatchObject({ skill: 2, range: 12, S: 4, AP: 0, D: 1 })
    expect(w['sw.w.master-crafted-bolter']).toMatchObject({ range: 24, A: 2, skill: 2, S: 4, AP: -1, D: 2 })
    expect(w['sw.w.master-crafted-power-weapon']).toMatchObject({ A: 5, skill: 2, S: 5, AP: -2, D: 2 })
    expect(w['sw.w.bolt-rifle']).toMatchObject({ range: 24, A: 2, skill: 3, S: 4, AP: -1, D: 1 })
    expect(w['sw.w.bolt-rifle'].abilities.map((a) => a.ability).sort()).toEqual(['ASSAULT', 'HEAVY'])
    expect(w['sw.w.astartes-chainsword']).toMatchObject({ A: 5, skill: 3, S: 4, AP: -1, D: 1 })
    expect(w['sw.w.special-issue-bolt-pistol']).toMatchObject({ range: 12, A: 1, S: 4, AP: -1, D: 1 })
    expect(w['sw.w.special-issue-bolt-pistol'].abilities.map((a) => a.ability).sort()).toEqual(['PISTOL', 'PRECISION'])
    expect(w['sw.w.combat-knife']).toMatchObject({ A: 4, S: 4, AP: 0, D: 1 })
    expect(w['sm.w.bolt-pistol']).toMatchObject({ skill: 3, range: 12 })
    expect(w['sm.w.close-combat-weapon']).toMatchObject({ A: 3, skill: 3, S: 4, AP: 0, D: 1 })
    // every referenced weapon exists
    for (const id of Object.keys(d).filter((k) => k.startsWith('sw.')))
      for (const c of d[id].composition) for (const wid of c.weapons.default) expect(w[wid], wid).toBeDefined()
  })

  it('SPA data: Tireless Hunter and Ferocious are BATTLE LEADER only; Ferocious reuses the Heroic Intervention override params', () => {
    const e = bundle.enhancements
    expect(e['sw.e.tireless-hunter'].restriction).toEqual({ keyword: ['BATTLE LEADER'] })
    expect(e['sw.e.ferocious'].restriction).toEqual({ keyword: ['BATTLE LEADER'] })
    const fer = e['sw.e.ferocious'].effect as { code?: string; params?: unknown }
    expect(fer.code).toBe('stratagemCostOverride')
    expect(fer.params).toEqual({ stratagemId: 'core.s.heroic-intervention', cost: 0, ignoreLimit: true })
    expect((e['sw.e.tireless-hunter'].effect as { code?: string }).code).toBe('tirelessHunter')
  })

  it('every sw.* id is unique across the bundle and every data-referenced ability id resolves', () => {
    const ids = [
      ...Object.keys(bundle.datasheets),
      ...Object.keys(bundle.weapons),
      ...Object.keys(bundle.stratagems),
      ...Object.keys(bundle.enhancements),
      ...Object.keys(bundle.abilities),
    ].filter((k) => k.startsWith('sw.'))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of Object.keys(bundle.datasheets).filter((k) => k.startsWith('sw.')))
      for (const a of abilityIds(bundle.datasheets[id])) expect(bundle.abilities[a], a).toBeDefined()
  })
})
