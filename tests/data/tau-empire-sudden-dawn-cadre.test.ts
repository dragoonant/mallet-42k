import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PID = 'tau.cp.sudden-dawn-cadre'

describe("tau empire - Sudden Dawn Cadre data", () => {
  it('SDC-001 patrol loads: 4 units, 22 models; Cloudspear WARLORD with Electro-static Flares; default secondary Surprise Attack; first patrol unchanged', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(4)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(22)
    expect(p.warlord).toBe('cloudspear')
    expect(p.units.find((u) => u.ref === 'cloudspear')!.enhancement).toBe('tau.e.electrostatic-flares')
    expect(p.units.some((u) => u.attachTo)).toBe(false)
    expect(p.secondaries.find((s) => s.default)!.id).toBe('tau.sec.surprise-attack')
    expect(b.factions['tau-empire'].combatPatrols).toEqual(['tau.cp.protectors-of-aun-shar', PID])
    const first = b.patrols['tau.cp.protectors-of-aun-shar']
    expect(first.units).toHaveLength(5)
    expect(first.stratagems.some((id) => p.stratagems.includes(id))).toBe(false)
  })

  it('SDC-002 Patrol Squads split: half A = Shas\'ui + 4 carbines, half B = 3 rail rifles + 2 carbines', async () => {
    const b = await loadBundle()
    const pf = b.patrols[PID].units.find((u) => u.ref === 'pathfinders')!
    const [a, bb] = pf.patrolSquads!
    expect([a.ref, a.size, bb.ref, bb.size]).toEqual(['pathfinders-a', 5, 'pathfinders-b', 5])
    expect(a.wargear.map((w) => [w.modelId, w.count])).toEqual([['shasui', 1], ['pathfinder-carbine', 4]])
    expect(bb.wargear.map((w) => [w.modelId, w.count])).toEqual([['pathfinder-rail', 3], ['pathfinder-carbine', 2]])
  })

  it('SDC-020 Cloudspear starts at W 8 (6 + 2 shield drones)', async () => {
    const b = await loadBundle()
    const d = b.datasheets['tau.commander-cloudspear']
    expect(d.stats.W).toBe(6)
    expect(d.composition[0].statsOverride).toEqual({ W: 8 })
    expect(d.coreAbilities.map((c) => c.ability)).toContain('DEEP_STRIKE')
    expect(d.keywords).toContain('BATTLESUIT')
  })

  it('SDC-027 Devilfish transport data: capacity 12, T\'AU EMPIRE INFANTRY only, no BATTLESUIT', async () => {
    const b = await loadBundle()
    const d = b.datasheets['tau.devilfish']
    expect(d.transport).toEqual({ capacity: 12, keywords: ["T'AU EMPIRE", 'INFANTRY'], excludeKeywords: ['BATTLESUIT', 'KROOT', 'VESPID STINGWINGS'] })
    expect(d.stats.W).toBe(13)
    expect(d.damaged).toBeUndefined()
    expect(d.coreAbilities).toContainEqual({ ability: 'DEADLY_DEMISE', value: 'D3' })
    expect(d.coreAbilities.some((c) => c.ability === 'DEEP_STRIKE')).toBe(false)
  })

  it('SDC-026 Pathfinders have Scouts 7', async () => {
    const b = await loadBundle()
    expect(b.datasheets['tau.pathfinder-team'].coreAbilities).toContainEqual({ ability: 'SCOUTS', value: 7 })
  })

  it('SDC-031 weapon profiles match the CP card', async () => {
    const b = await loadBundle()
    const rail = b.weapons['tau.w.rail-rifle']
    expect([rail.range, rail.A, rail.skill, rail.S, rail.AP, rail.D]).toEqual([30, 1, 5, 10, -4, 3])
    expect(rail.abilities.map((a) => a.ability).sort()).toEqual(['DEVASTATING_WOUNDS', 'HEAVY'])
    const pb = b.weapons['tau.w.pulse-blaster']
    expect([pb.range, pb.A, pb.skill, pb.S, pb.AP, pb.D]).toEqual([10, 2, 3, 6, -1, 1])
    expect(pb.abilities.map((a) => a.ability)).toEqual(['ASSAULT'])
    expect(b.weapons['tau.w.twin-pulse-carbine'].abilities.map((a) => a.ability).sort()).toEqual(['ASSAULT', 'TWIN_LINKED'])
    const proj = b.weapons['tau.w.airbursting-fragmentation-projector']
    expect(proj.A).toBe('D6')
    expect(proj.abilities.map((a) => a.ability).sort()).toEqual(['BLAST', 'INDIRECT_FIRE'])
    expect(b.weapons['tau.w.battlesuit-fists-commander'].A).toBe(3)
    // the first patrol's fists are untouched
    expect(b.weapons['tau.w.battlesuit-fists'].A).toBe(2)
  })

  it('SDC-005 enhancements: both grant a 4+ invulnerable; Flares carries the aura hook, Prototype the re-roll descriptors', async () => {
    const b = await loadBundle()
    const flares = b.enhancements['tau.e.electrostatic-flares']
    const proto = b.enhancements['tau.e.prototype-systems']
    expect(Array.isArray(flares.effect) && Array.isArray(proto.effect)).toBe(true)
    expect(flares.restriction).toEqual({ keyword: ['COMMANDER CLOUDSPEAR'] })
    const aura = (flares.effect as { id: string; code?: string }[]).find((e) => e.id.endsWith('.aura'))!
    expect(aura.code).toBe('electrostaticFlares')
    const ids = (proto.effect as { id: string }[]).map((e) => e.id)
    expect(ids).toEqual([
      'tau.e.prototype-systems.effect', 'tau.e.prototype-systems.hit',
      'tau.e.prototype-systems.wound', 'tau.e.prototype-systems.projector',
    ])
  })

  it('SDC-016 patrol stratagems and detachment', async () => {
    const b = await loadBundle()
    const ids = ['tau.s.fight-by-the-code', 'tau.s.rampart-of-fire', 'tau.s.lives-before-territory']
    expect(b.patrols[PID].stratagems).toEqual(ids)
    const det = b.factions['tau-empire'].detachments.find((d) => d.id === 'tau.d.sudden-dawn-cadre')!
    expect(det.stratagems).toEqual(ids)
    for (const id of ids) expect(b.stratagems[id].cost).toBe(1)
    expect(b.stratagems['tau.s.lives-before-territory'].window).toBe('shooting.targetsDeclared')
    expect(b.stratagems['tau.s.lives-before-territory'].who).toBe('reactive')
  })

  it('SDC-011 Surprise Attack scoring bands and Ethereal Edict pick + score rules', async () => {
    const b = await loadBundle()
    const sec = b.patrols[PID].secondaries
    const sa = sec.find((s) => s.id === 'tau.sec.surprise-attack')!
    expect(sa.scoring.map((r) => [r.rounds!.from, r.rounds!.to, r.pointsPer, r.cap])).toEqual([[1, 2, 4, 15], [3, 4, 2, 10], [5, 5, 2, 5]])
    expect(sa.scoring.every((r) => r.when === 'turn.end' && r.who === 'active')).toBe(true)
    const ee = sec.find((s) => s.id === 'tau.sec.ethereal-edict')!
    expect(ee.default).toBe(false)
    expect(ee.scoring.map((r) => [r.when, r.code, r.pointsPer])).toEqual([['round.start', 'etherealEdictPick', 0], ['battle.end', 'etherealEdictScore', 12]])
  })

  it('SDC-006 abilities: weapon support system ignores hit modifiers; grav-inhibitor is non-cumulative; breach and clear needs an objective', async () => {
    const b = await loadBundle()
    const wss = b.abilities['tau.a.weapon-support-system'] as unknown as { effect: { ignoreModifiers: string } }
    expect(wss.effect.ignoreModifiers).toBe('hit')
    const grav = b.abilities['tau.a.grav-inhibitor-drone'] as unknown as { params: { nonCumulativeNegative: boolean }; code: string }
    expect(grav.code).toBe('gravInhibitorDrone')
    expect(grav.params.nonCumulativeNegative).toBe(true)
    const bc = b.abilities['tau.a.breach-and-clear'] as unknown as { effect: { when: { targetOnObjective: boolean }; reroll: string } }
    expect(bc.effect.when.targetOnObjective).toBe(true)
    expect(bc.effect.reroll).toBe('all')
  })
})
