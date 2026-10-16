import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('tyranids Insidious Infiltrators data', () => {
  it('INF-001 patrol loads: 5 units, 11 models, Death\'s Shadow WARLORD with Neurogoad, default Alpha Predation, three Leaper units', async () => {
    const b = await loadBundle()
    const p = b.patrols['tyr.cp.insidious-infiltrators']
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(5)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(11)
    expect(p.warlord).toBe('deaths-shadow')
    expect(p.units.find((u) => u.ref === 'deaths-shadow')!.enhancement).toBe('tyr.e.neurogoad')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('tyr.sec.alpha-predation')
    expect(p.units.filter((u) => u.datasheet === 'tyr.von-ryans-leapers-inf')).toHaveLength(3)
    expect(b.factions['tyranids'].combatPatrols).toEqual(['tyr.cp.vardenghast-swarm', 'tyr.cp.insidious-infiltrators'])
    expect(b.patrols['tyr.cp.vardenghast-swarm'].units).toHaveLength(5)
  })

  it('INF-003 Leapers variant differs from the original only by lacking Synapse', async () => {
    const b = await loadBundle()
    const a = b.datasheets['tyr.von-ryans-leapers']
    const c = b.datasheets['tyr.von-ryans-leapers-inf']
    expect(a.abilities).toContain('tyr.a.synapse')
    expect(c.abilities).toEqual(['tyr.a.pouncing-leap'])
    expect({ ...c, id: a.id, abilities: a.abilities }).toEqual(a)
  })

  it('INF-014 profiles match the CP page', async () => {
    const b = await loadBundle()
    expect(b.weapons['tyr.w.piercing-claws-and-talons']).toMatchObject({ type: 'melee', A: 6, skill: 2, S: 6, AP: -2, D: 1 })
    expect(b.weapons['tyr.w.lictor-claws-and-talons']).toMatchObject({ type: 'melee', A: 6, skill: 2, S: 7, AP: -2, D: 2 })
    const ds = b.datasheets['tyr.deaths-shadow']
    expect(ds.invuln).toBe(4)
    expect(ds.stats).toMatchObject({ M: 8, T: 5, Sv: 4, W: 7, Ld: 7, OC: 1 })
    expect(ds.abilities).not.toContain('tyr.a.synapse')
    const l = b.datasheets['tyr.lictor']
    expect(l.invuln).toBeUndefined()
    expect(l.stats).toMatchObject({ T: 6, W: 6 })
    expect(b.datasheets['tyr.von-ryans-leapers-inf'].invuln).toBe(6)
  })

  it('INF-033 every referenced id exists; Vardenghast records unchanged', async () => {
    const b = await loadBundle()
    const p = b.patrols['tyr.cp.insidious-infiltrators']
    for (const id of p.stratagems) expect(b.stratagems[id]).toBeTruthy()
    for (const e of p.enhancements) expect(b.enhancements[e.id]).toBeTruthy()
    for (const u of p.units) expect(b.datasheets[u.datasheet]).toBeTruthy()
    expect(b.weapons['tyr.w.leapers-talons']).toMatchObject({ A: 6, skill: 3, S: 5, AP: -1, D: 1 })
    expect(b.datasheets['tyr.terror-of-vardenghast'].abilities).toContain('tyr.a.synapse')
  })
})
