import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PID = 'ael.cp.the-fatebreakers'

describe('aeldari - The Fatebreakers data', () => {
  it('AEL-001 patrol loads: 4 units, 19 models; Farseer WARLORD with Foresight attached to the Guardians; default secondary Ineffable Agenda; patrol stratagems', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    expect(p).toBeTruthy()
    expect(p.faction).toBe('aeldari')
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(19)
    expect(p.warlord).toBe('farseer')
    const f = p.units.find((u) => u.ref === 'farseer')!
    expect(f.enhancement).toBe('ael.e.foresight')
    expect(f.attachTo).toBe('guardians')
    expect(p.enhancements).toEqual([
      { id: 'ael.e.foresight', default: true },
      { id: 'ael.e.eldritch-might', default: false },
    ])
    expect(p.secondaries.find((s) => s.default)!.id).toBe('ael.sec.ineffable-agenda')
    expect(p.secondaries.map((s) => s.id)).toEqual(['ael.sec.ineffable-agenda', 'ael.sec.a-greater-destiny'])
    expect(p.stratagems).toEqual(['ael.s.whip-fast-reactions', 'ael.s.storm-of-shots', 'ael.s.zephyr-swift'])
    expect(b.factions.aeldari.combatPatrols).toEqual([PID])
    expect(b.factions.aeldari.armyRule).toBe('ael.a.strands-of-fate')
    for (const id of p.stratagems) expect(b.stratagems[id]).toBeTruthy()
  })

  it('AEL-002 stats and profiles match the spec; Platform OC 0 / W 2 / 40 mm; Wraithlord has two shuriken catapults and no Strands of Fate', async () => {
    const b = await loadBundle()
    const far = b.datasheets['ael.farseer-iraneth']
    expect(far.stats).toEqual({ M: 7, T: 3, Sv: 6, W: 4, Ld: 6, OC: 1 })
    expect(far.invuln).toBe(4)
    expect(far.coreAbilities).toEqual([{ ability: 'LEADER' }])
    expect(far.leader!.attachTo).toEqual(['ael.guardian-defenders'])
    expect(far.abilities).toEqual(['ael.a.strands-of-fate', 'ael.a.fortune'])

    const g = b.datasheets['ael.guardian-defenders']
    expect(g.stats).toEqual({ M: 7, T: 3, Sv: 4, W: 1, Ld: 6, OC: 2 })
    expect(g.keywords).toContain('BATTLELINE')
    const crew = g.composition.find((c) => c.modelId === 'guardian-defender')!
    const plat = g.composition.find((c) => c.modelId === 'heavy-weapon-platform')!
    expect([crew.min, crew.max, crew.base.mm]).toEqual([10, 10, 28])
    expect([plat.min, plat.max, plat.base.mm]).toEqual([1, 1, 40])
    expect(plat.statsOverride).toEqual({ W: 2, OC: 0 })
    expect(plat.weapons.default).toContain('ael.w.starcannon')
    expect(g.abilities).toEqual(['ael.a.strands-of-fate', 'ael.a.defenders-of-fate', 'ael.a.crewed-platform'])

    const w = b.datasheets['ael.windriders']
    expect(w.stats).toEqual({ M: 14, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 })
    expect(w.keywords).toEqual(['MOUNTED', 'FLY', 'WINDRIDERS'])
    expect(w.composition.map((c) => [c.modelId, c.max])).toEqual([['windrider-catapult', 4], ['windrider-scatter', 2]])
    expect(w.abilities).toEqual(['ael.a.strands-of-fate', 'ael.a.swift-demise', 'ael.a.patrol-squads'])

    const wl = b.datasheets['ael.wraithlord']
    expect(wl.stats).toEqual({ M: 8, T: 11, Sv: 2, W: 10, Ld: 6, OC: 3 })
    expect(wl.invuln).toBeUndefined()
    expect(wl.coreAbilities).toEqual([{ ability: 'DEADLY_DEMISE', value: 1 }])
    expect(wl.abilities).not.toContain('ael.a.strands-of-fate')
    const wlw = wl.composition[0].weapons.default
    expect(wlw.filter((id) => id.startsWith('ael.w.shuriken-catapult-wraithlord-'))).toHaveLength(2)
    for (const ds of Object.values(b.datasheets).filter((d) => d.faction === 'aeldari')) expect(ds.factionKeywords).toEqual(['AELDARI'])
  })

  it('AEL-002 weapon profiles', async () => {
    const b = await loadBundle()
    const w = (id: string) => b.weapons[`ael.w.${id}`]
    const row = (id: string) => { const x = w(id); return [x.range, x.A, x.skill, x.S, x.AP, x.D, x.abilities.map((a) => a.ability)] }
    expect(row('eldritch-storm')).toEqual([24, 'D6', 3, 6, -2, 'D3', ['BLAST', 'PSYCHIC']])
    expect(row('shuriken-pistol')).toEqual([12, 1, 2, 4, -1, 1, ['ASSAULT', 'PISTOL']])
    expect(row('singing-spear-ranged')).toEqual([12, 1, 2, 9, 0, 3, ['ASSAULT', 'PSYCHIC']])
    expect(row('singing-spear')).toEqual([0, 2, 2, 3, 0, 3, ['PSYCHIC']])
    expect(w('singing-spear').type).toBe('melee')
    expect(row('shuriken-catapult')).toEqual([18, 2, 3, 4, -1, 1, ['ASSAULT']])
    expect(row('starcannon')).toEqual([36, 2, 3, 8, -3, 2, []])
    expect(row('close-combat-weapon-guardian')).toEqual([0, 1, 3, 3, 0, 1, []])
    expect(row('scatter-laser')).toEqual([36, 6, 3, 5, 0, 1, []])
    expect(row('twin-shuriken-catapult')).toEqual([18, 2, 3, 4, -1, 1, ['ASSAULT', 'TWIN_LINKED']])
    expect(row('close-combat-weapon-windrider')).toEqual([0, 3, 3, 3, 0, 1, []])
    expect(row('bright-lance')).toEqual([36, 1, 4, 12, -3, 'D6+2', []])
    expect(row('shuriken-catapult-wraithlord-1')).toEqual([18, 2, 4, 4, -1, 1, ['ASSAULT']])
    expect(row('shuriken-catapult-wraithlord-2')).toEqual(row('shuriken-catapult-wraithlord-1'))
    expect(row('ghostglaive-strike')).toEqual([0, 4, 4, 10, -3, 'D6+1', []])
    expect(row('ghostglaive-sweep')).toEqual([0, 8, 4, 7, -2, 2, []])
    expect(w('ghostglaive-strike').profileGroup).toBe('ael.pg.ghostglaive')
    expect(w('ghostglaive-sweep').profileGroup).toBe('ael.pg.ghostglaive')
  })

  it('AEL-029 Patrol Squads: Windriders split into two units of 3, each with one scatter laser and two twin catapults', async () => {
    const b = await loadBundle()
    const wr = b.patrols[PID].units.find((u) => u.ref === 'windriders')!
    expect(wr.size).toBe(6)
    const [a, bb] = wr.patrolSquads!
    expect([a.ref, a.size, bb.ref, bb.size]).toEqual(['windriders-a', 3, 'windriders-b', 3])
    for (const half of [a, bb]) {
      expect(half.wargear.map((x) => [x.modelId, x.count])).toEqual([['windrider-scatter', 1], ['windrider-catapult', 2]])
    }
    const ps = b.abilities['ael.a.patrol-squads']
    expect(ps.code).toBe('patrolSquads')
    expect(ps.params).toEqual({ sizes: [3, 3] })
  })

  it('AEL-3 enhancements: Foresight is a cost override plus a hit threshold; Eldritch Might re-rolls hit / wound / damage 1s on Psychic weapons for the bearer', async () => {
    const b = await loadBundle()
    const fs = b.enhancements['ael.e.foresight'].effect as { code?: string; params?: Record<string, unknown> }[]
    expect(fs.map((e) => e.code)).toEqual(['stratagemCostOverride', 'foresight'])
    expect(fs[0].params).toEqual({ stratagemId: 'core.s.fire-overwatch', cost: 0, ignoreLimit: false })
    expect(fs[1].params).toEqual({ onObjective: 4, otherwise: 5, stratagemId: 'core.s.fire-overwatch' })
    const em = b.enhancements['ael.e.eldritch-might'].effect as { trigger: string; when?: unknown; effect?: unknown; scope?: unknown }[]
    expect(em.map((e) => e.trigger)).toEqual(['hitRoll', 'woundRoll', 'damageRoll'])
    for (const e of em) {
      expect(e.when).toEqual({ weaponAbility: 'PSYCHIC' })
      expect(e.effect).toEqual({ reroll: 'ones' })
      expect(e.scope).toEqual({ who: 'bearer' })
    }
  })

  it('AEL-4 secondaries use the planned scoring rules', async () => {
    const b = await loadBundle()
    const [ia, gd] = b.patrols[PID].secondaries
    expect(ia.scoring).toHaveLength(1)
    expect(ia.scoring[0]).toMatchObject({ when: 'turn.end', who: 'active', rule: 'custom', code: 'ineffableAgenda', pointsPer: 3 })
    expect(gd.default).toBe(false)
    expect(gd.scoring[0]).toMatchObject({ when: 'battle.end', rule: 'custom', code: 'reclaimAndDominate', pointsPer: 10, cap: 10, params: { keyword: 'AELDARI' } })
  })

  it('AEL-5 stratagems carry the planned windows, hooks and descriptors', async () => {
    const b = await loadBundle()
    const wf = b.stratagems['ael.s.whip-fast-reactions']
    expect([wf.cost, wf.category, wf.code]).toEqual([1, 'battleTactic', 'infantryOrMounted'])
    expect(wf.window).toEqual(['shooting.targetsDeclared', 'fight.targetsDeclared'])
    expect(wf.effect).toEqual({ modifyRoll: { roll: 'hit', value: -1 } })
    expect(wf.scope).toEqual({ who: 'attacker' })
    const ss = b.stratagems['ael.s.storm-of-shots']
    expect([ss.cost, ss.code, ss.targets[0].state]).toEqual([1, 'stormOfShots', 'notYetShot'])
    expect(ss.effect).toEqual({ modifyRoll: { roll: 'hit', value: 1 } })
    const zs = b.stratagems['ael.s.zephyr-swift']
    expect([zs.cost, zs.category, zs.code, zs.params]).toEqual([1, 'strategicPloy', 'zephyrSwift', { distance: 6 }])
    expect(zs.window).toEqual(['shooting.start', 'shooting.attacksResolved', 'phase.end'])
    expect(zs.effect).toEqual({ forbid: 'charge' })
  })

  it('AEL-6 abilities: Strands of Fate on every datasheet but the Wraithlord; Swift Demise, Fortune and Crewed Platform shapes', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    for (const u of p.units) {
      const has = b.datasheets[u.datasheet].abilities.includes('ael.a.strands-of-fate')
      expect(has).toBe(u.datasheet !== 'ael.wraithlord')
    }
    expect(b.abilities['ael.a.strands-of-fate'].code).toBe('strandsOfFate')
    expect(b.abilities['ael.a.fortune']).toMatchObject({ trigger: 'commandPhase', code: 'fortune', params: { range: 12, on: 2 } })
    expect(b.abilities['ael.a.fortune'].text.startsWith('Psychic.')).toBe(true)
    expect(b.abilities['ael.a.defenders-of-fate']).toMatchObject({ trigger: 'phaseEnd', code: 'simulacrumImperialis', params: { modelId: 'guardian-defender', dieThreshold: 1, label: 'Defenders of Fate' } })
    expect(b.abilities['ael.a.crewed-platform']).toMatchObject({ trigger: 'modelDestroyed', code: 'crewedPlatform', params: { crewModelId: 'guardian-defender', platformModelId: 'heavy-weapon-platform' } })
    const sd = b.abilities['ael.a.swift-demise']
    expect(sd.when).toEqual({ weaponType: 'ranged', targetIsClosestEligible: true })
    expect(sd.effect).toEqual([{ when: { targetOnObjectiveControlledBy: 'opponent' }, reroll: 'all' }, { reroll: 'ones' }])
  })
})
