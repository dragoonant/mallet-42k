import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { AbilityDescriptor, CombatPatrolData, DataBundle, DatasheetData } from '../../src/data/types'
import { validateAllData } from '../../tools/validate-data'

// Adepta Sororitas: Sanctuary Guardians (docs/spec/factions/adepta-sororitas.md, ADE-001..003). Checks that the faction
// is in the bundle, passes schema validation, and that every cross-reference inside it resolves.
const FACTION = 'adepta-sororitas'
const PATROL = 'ade.cp.sanctuary-guardians'

let bundle: DataBundle
let patrol: CombatPatrolData
beforeAll(async () => {
  bundle = await loadBundle()
  patrol = bundle.patrols[PATROL]
})

const sheetOf = (ref: string): DatasheetData => {
  const unit = patrol.units.find((u) => u.ref === ref)!
  return bundle.datasheets[unit.datasheet]
}
const modelCount = (ds: DatasheetData): number => ds.composition.reduce((n, c) => n + c.default, 0)

describe('adepta-sororitas data', () => {
  it('every adepta-sororitas file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith(`factions/${FACTION}/`))
    expect(reports.length).toBeGreaterThanOrEqual(9)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('ADE-001 faction and patrol load: 4 units, 26 models, Canoness WARLORD with Defender of the Faith attached to Sacresants', () => {
    const faction = bundle.factions[FACTION]
    expect(faction.factionKeyword).toBe('ADEPTA SORORITAS')
    expect(faction.combatPatrols).toEqual([PATROL])
    expect(patrol.faction).toBe(FACTION)
    expect(patrol.units.map((u) => u.ref)).toEqual(['canoness', 'sisters', 'sacresants', 'arcos'])
    expect(patrol.units.reduce((n, u) => n + modelCount(bundle.datasheets[u.datasheet]), 0)).toBe(26)
    for (const u of patrol.units) expect(modelCount(bundle.datasheets[u.datasheet]), u.ref).toBe(u.size)
    expect(patrol.warlord).toBe('canoness')
    const canoness = patrol.units.find((u) => u.ref === 'canoness')!
    expect(canoness.enhancement).toBe('ade.e.defender-of-the-faith')
    expect(canoness.attachTo).toBe('sacresants')
    expect(patrol.enhancements.filter((e) => e.default).map((e) => e.id)).toEqual(['ade.e.defender-of-the-faith'])
    expect(patrol.secondaries.filter((s) => s.default).map((s) => s.id)).toEqual(['ade.sec.hallowed-retribution'])
  })

  it('ADE-002 the Canoness may lead the Battle Sisters or the Sacresants, never the Arco-flagellants', () => {
    const leads = sheetOf('canoness').leader!.attachTo
    expect(leads).toContain('ade.battle-sisters-squad')
    expect(leads).toContain('ade.celestian-sacresants')
    expect(leads).not.toContain('ade.arco-flagellants')
    expect(sheetOf('canoness').coreAbilities.some((c) => c.ability === 'LEADER')).toBe(true)
  })

  it('ADE-003 Patrol Squads: the two parts of the Battle Sisters cover the unit exactly, 5 models each', () => {
    const sisters = patrol.units.find((u) => u.ref === 'sisters')!
    const ds = bundle.datasheets[sisters.datasheet]
    const parts = sisters.patrolSquads!
    expect(parts.map((p) => p.ref)).toEqual(['sisters-a', 'sisters-b'])
    const perModel: Record<string, number> = {}
    for (const part of parts) {
      expect(part.wargear.reduce((n, w) => n + w.count, 0), part.ref).toBe(part.size)
      expect(part.size).toBe(5)
      for (const w of part.wargear) {
        perModel[w.modelId] = (perModel[w.modelId] ?? 0) + w.count
        const comp = ds.composition.find((c) => c.modelId === w.modelId)
        expect(comp, `${part.ref}: ${w.modelId}`).toBeDefined()
        expect(w.weapons, `${part.ref}: ${w.modelId}`).toEqual(comp!.weapons.default)
      }
    }
    for (const c of ds.composition) expect(perModel[c.modelId], c.modelId).toBe(c.default)
  })

  it('every id in the faction is prefixed ade. and every reference resolves', () => {
    const resolveAbility = (a: string | AbilityDescriptor) => (typeof a === 'string' ? bundle.abilities[a] : a)
    for (const u of patrol.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds, u.datasheet).toBeDefined()
      expect(ds.id.startsWith('ade.')).toBe(true)
      expect(ds.factionKeywords).toEqual(['ADEPTA SORORITAS'])
      expect(ds.abilities, ds.id).toContain('ade.a.acts-of-faith')
      for (const a of ds.abilities) expect(resolveAbility(a), `${ds.id}: ${String(a)}`).toBeDefined()
      for (const c of ds.composition) for (const w of c.weapons.default) expect(bundle.weapons[w], `${ds.id}/${c.modelId}: ${w}`).toBeDefined()
      if (u.attachTo) expect(sheetOf(u.ref).leader!.attachTo).toContain(patrol.units.find((x) => x.ref === u.attachTo)!.datasheet)
    }
    for (const id of patrol.stratagems) expect(bundle.stratagems[id], id).toBeDefined()
    for (const e of patrol.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const id of bundle.factions[FACTION].detachments[0].stratagems) expect(patrol.stratagems).toContain(id)
    expect(bundle.abilities[bundle.factions[FACTION].armyRule]).toBeDefined()
  })

  it('ADE-035 Arco-flagellants have Sv 7+ (no armour save) and Feel No Pain 5+', () => {
    const arco = sheetOf('arcos')
    expect(arco.stats.Sv).toBe(7)
    expect(arco.coreAbilities).toContainEqual({ ability: 'FEEL_NO_PAIN', value: 5 })
  })

  it('uses the new descriptor keys the spec requires', () => {
    expect(bundle.stratagems['ade.s.ascetic-discipline'].effect).toEqual({ critWoundAp: 2 })
    expect(bundle.stratagems['ade.s.ascetic-discipline'].targets[0].state).toBe('notYetActivated')
    expect(bundle.abilities['ade.a.null-rod'].when).toEqual({ any: [{ weaponAbility: 'PSYCHIC' }, { mortalWound: true }] })
    expect(bundle.abilities['ade.a.sworn-protectors'].scope).toEqual({ who: 'attacker' })
    expect(bundle.stratagems['ade.s.holy-radiance'].scope).toEqual({ who: 'attacker' })
    const martyr = bundle.stratagems['ade.s.a-martyrs-death']
    expect(martyr.code).toBe('aMartyrsDeath')
    expect(martyr.targets[0].filter).toEqual({ keyword: 'ADEPTA SORORITAS' })
  })
})
