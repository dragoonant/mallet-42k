import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('grey knights data', () => {
  it('GRE-001 patrol loads: 4 listed units, default build 3 units / 11 models, Librarian WARLORD with Banishment Stone, default secondary Champion of Titan', async () => {
    const b = await loadBundle()
    const patrol = b.patrols['gk.cp.aurellios-banishers']
    expect(patrol).toBeTruthy()
    const group = patrol.unitChoices![0]
    expect(group.refs).toContain(group.default)
    const fielded = patrol.units.filter((u) => !group.refs.includes(u.ref) || u.ref === group.default)
    expect(fielded).toHaveLength(3)
    expect(fielded.reduce((n, u) => n + u.size, 0)).toBe(11)
    expect(patrol.units.filter((u) => !group.refs.includes(u.ref) || u.ref === 'dreadknight').reduce((n, u) => n + u.size, 0)).toBe(7)
    expect(patrol.warlord).toBe('librarian')
    const lib = patrol.units.find((u) => u.ref === 'librarian')!
    expect(lib.enhancement).toBe('gk.e.banishment-stone')
    expect(lib.attachTo).toBe('terminators')
    expect(patrol.secondaries.find((s) => s.default)!.id).toBe('gk.sec.champion-of-titan')
    expect(b.factions['grey-knights'].factionKeyword).toBe('GREY KNIGHTS')
  })
})
