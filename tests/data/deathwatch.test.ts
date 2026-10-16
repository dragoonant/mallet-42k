import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { validateAllData } from '../../tools/validate-data'

describe('deathwatch: Vigil Force Alphion data', () => {
  it('every deathwatch file passes schema validation', () => {
    const reports = validateAllData().filter((r) => r.file.startsWith('factions/deathwatch/'))
    expect(reports.length).toBeGreaterThanOrEqual(9)
    for (const r of reports) expect(r.errors, r.file).toEqual([])
  })

  it('DEA-001 patrol loads: faction deathwatch, 4 units, 15 models, Alphion WARLORD with Aegis Vigilate attached to the Intercessor Squad; Hunters\' Insight default; SM patrols unchanged', async () => {
    const b = await loadBundle()
    const f = b.factions['deathwatch']
    expect(f).toBeTruthy()
    expect(f.factionKeyword).toBe('DEATHWATCH')
    expect(f.armyRule).toBe('sm.a.oath-of-moment')
    expect(f.combatPatrols).toEqual(['dw.cp.vigil-force-alphion'])
    const p = b.patrols['dw.cp.vigil-force-alphion']
    expect(p).toBeTruthy()
    expect(p.faction).toBe('deathwatch')
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    expect(p.warlord).toBe('lieutenant-alphion')
    const alphion = p.units.find((u) => u.ref === 'lieutenant-alphion')!
    expect(alphion.enhancement).toBe('dw.e.aegis-vigilate')
    expect(alphion.attachTo).toBe('intercessor-squad')
    expect(p.units.find((u) => u.ref === 'apothecary-krenn')!.attachTo).toBeUndefined()
    expect(p.secondaries.find((s) => s.default)!.id).toBe('dw.sec.hunters-insight')
    expect(p.enhancements.find((e) => e.default)!.id).toBe('dw.e.aegis-vigilate')
    expect(p.stratagems).toEqual(f.detachments[0].stratagems)
    expect(b.factions['sm'].combatPatrols).toEqual(['sm.cp.strike-force-octavius', 'sm.cp.strike-team-solarien'])
    expect(b.patrols['sm.cp.strike-force-octavius'].units).toHaveLength(4)
    for (const id of ['dw.lieutenant-alphion', 'dw.apothecary-krenn', 'dw.intercessor-squad', 'dw.aggressor-squad']) {
      expect(b.datasheets[id].factionKeywords).toEqual(['ADEPTUS ASTARTES', 'DEATHWATCH'])
      expect(b.datasheets[id].abilities).toContain('sm.a.oath-of-moment')
    }
  })

  it('DEA-002 Patrol Squads halves: every model carries a bolt rifle, one grenade launcher per half, Alphion and Krenn can each attach', async () => {
    const b = await loadBundle()
    const sq = b.patrols['dw.cp.vigil-force-alphion'].units.find((u) => u.ref === 'intercessor-squad')!
    expect(sq.patrolSquads!.map((h) => h.ref)).toEqual(['intercessor-squad-a', 'intercessor-squad-b'])
    expect(sq.patrolSquads!.map((h) => h.size)).toEqual([5, 5])
    const [a, bb] = sq.patrolSquads!
    const count = (h: typeof a, id: string) => h.wargear.filter((w) => w.weapons.includes(id)).reduce((n, w) => n + w.count, 0)
    for (const h of [a, bb]) {
      expect(h.wargear.reduce((n, w) => n + w.count, 0)).toBe(5)
      expect(count(h, 'dw.w.bolt-rifle')).toBe(5)
      expect(count(h, 'dw.w.grenade-launcher-frag')).toBe(1)
      expect(count(h, 'dw.w.grenade-launcher-krak')).toBe(1)
    }
    expect(a.wargear.find((w) => w.modelId === 'sergeant')!.count).toBe(1)
    expect(bb.wargear.find((w) => w.modelId === 'sergeant')).toBeUndefined()
    expect(b.datasheets['dw.intercessor-squad'].abilities).toContain('sm.a.patrol-squads')
    for (const t of ['dw.lieutenant-alphion', 'dw.apothecary-krenn']) {
      expect(b.datasheets[t].leader!.attachTo).toEqual(['dw.intercessor-squad'])
      expect(b.datasheets[t].coreAbilities.map((c) => c.ability)).toEqual(['LEADER'])
    }
    // the full squad: 10 bolt rifles + 2 launchers
    const comp = b.datasheets['dw.intercessor-squad'].composition
    expect(comp.reduce((n, c) => n + c.default, 0)).toBe(10)
    expect(comp.filter((c) => c.weapons.default.includes('dw.w.bolt-rifle')).reduce((n, c) => n + c.default, 0)).toBe(10)
    expect(comp.filter((c) => c.weapons.default.includes('dw.w.grenade-launcher-frag')).reduce((n, c) => n + c.default, 0)).toBe(2)
  })

  it('DEA-003 stat lines and weapon profiles match the CP page; reused sm. ids unchanged', async () => {
    const b = await loadBundle()
    const w = b.weapons
    expect(w['dw.w.bolt-pistol-alphion']).toMatchObject({ range: 12, A: 1, skill: 2, S: 4, AP: 0, D: 1 })
    expect(w['dw.w.master-crafted-power-weapon']).toMatchObject({ type: 'melee', A: 5, skill: 2, S: 5, AP: -2, D: 2 })
    expect(w['dw.w.absolvor-bolt-pistol']).toMatchObject({ range: 18, A: 1, skill: 3, S: 5, AP: -1, D: 2 })
    expect(w['dw.w.reductor-pistol']).toMatchObject({ range: 3, A: 1, skill: 3, S: 4, AP: -4, D: 2 })
    expect(w['dw.w.close-combat-weapon-krenn']).toMatchObject({ type: 'melee', A: 4, skill: 3, S: 4, AP: 0, D: 1 })
    expect(w['dw.w.bolt-rifle']).toMatchObject({ range: 24, A: 2, skill: 3, S: 4, AP: -1, D: 1 })
    expect(w['dw.w.bolt-rifle'].abilities.map((a) => a.ability)).toEqual(['ASSAULT', 'HEAVY'])
    expect(w['dw.w.grenade-launcher-frag']).toMatchObject({ range: 24, A: 'D3', skill: 3, S: 4, AP: 0, D: 1, profileGroup: 'dw.w.grenade-launcher' })
    expect(w['dw.w.grenade-launcher-frag'].abilities.map((a) => a.ability)).toEqual(['BLAST'])
    expect(w['dw.w.grenade-launcher-krak']).toMatchObject({ range: 24, A: 1, skill: 3, S: 9, AP: -2, D: 'D3', profileGroup: 'dw.w.grenade-launcher' })
    expect(w['dw.w.flamestorm-gauntlets']).toMatchObject({ range: 12, A: 'D6+1', skill: null, S: 4, AP: 0, D: 1 })
    expect(w['dw.w.flamestorm-gauntlets'].abilities.map((a) => a.ability).sort()).toEqual(['IGNORES_COVER', 'TORRENT', 'TWIN_LINKED'])
    expect(w['dw.w.twin-power-fists']).toMatchObject({ type: 'melee', A: 3, skill: 3, S: 8, AP: -2, D: 2 })
    expect(w['dw.w.twin-power-fists'].abilities.map((a) => a.ability)).toEqual(['TWIN_LINKED'])
    expect(w['sm.w.bolt-pistol']).toMatchObject({ range: 12, A: 1, skill: 3, S: 4, AP: 0, D: 1 })
    expect(w['sm.w.close-combat-weapon']).toMatchObject({ A: 3, skill: 3, S: 4, AP: 0, D: 1 })

    const d = b.datasheets
    expect(d['dw.lieutenant-alphion'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1 })
    expect(d['dw.apothecary-krenn'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 4, Ld: 6, OC: 1 })
    expect(d['dw.intercessor-squad'].stats).toMatchObject({ M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(d['dw.aggressor-squad'].stats).toMatchObject({ M: 5, T: 6, Sv: 3, W: 3, Ld: 6, OC: 1 })
    expect(d['dw.aggressor-squad'].keywords).toContain('GRAVIS')
    expect(d['dw.intercessor-squad'].keywords).toContain('BATTLELINE')
    expect(d['dw.lieutenant-alphion'].keywords).toContain('LIEUTENANT')
    expect(d['dw.lieutenant-alphion'].composition[0].base).toEqual({ shape: 'round', mm: 40 })
    expect(d['dw.intercessor-squad'].composition.every((c) => c.base.mm === 32)).toBe(true)
    expect(d['dw.aggressor-squad'].abilities).toContain('dw.a.close-quarters-firepower')
    expect(d['dw.apothecary-krenn'].abilities).toContain('dw.a.narthecium')
    expect(d['dw.lieutenant-alphion'].abilities).toContain('dw.a.target-priority')
  })

  it('DEA-003b enhancements, stratagems and secondaries wire to the hooks the spec names', async () => {
    const b = await loadBundle()
    for (const id of ['dw.e.aegis-vigilate', 'dw.e.aliens-bane']) expect(b.enhancements[id].restriction).toEqual({ keyword: ['LIEUTENANT'] })
    expect(b.stratagems['dw.s.special-issue-ammunition'].code).toBe('specialIssueAmmunition')
    expect(Object.keys((b.stratagems['dw.s.special-issue-ammunition'].params as { sets: object }).sets)).toEqual(['A', 'B'])
    expect(b.stratagems['dw.s.deathwatch-teleportarium']).toMatchObject({ code: 'deathwatchTeleportarium', limit: 'oncePerBattle', cost: 1, params: { minEnemyGap: 3 } })
    expect(b.stratagems['dw.s.veteran-instincts'].code).toBeUndefined()
    expect(b.stratagems['sm.s.veteran-instincts']).toBeTruthy()
    expect(b.abilities['dw.a.narthecium'].code).toBe('narthecium')
    const sec = b.patrols['dw.cp.vigil-force-alphion'].secondaries
    expect(sec.map((s) => s.id)).toEqual(['dw.sec.hunters-insight', 'dw.sec.head-taker-doctrine'])
    expect(sec[0].scoring.map((r) => r.code)).toEqual(['huntersInsightPick', 'huntersInsightScore'])
    expect(sec[1].scoring.map((r) => r.code)).toEqual(['headTakerDoctrine', 'headTakerSweep'])
  })
})
