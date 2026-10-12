import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

describe('tau empire data', () => {
  it("TAU-001 patrol loads: 5 units, 16 models; Aun'Shar WARLORD with DS13 unattached; Fireblade attached to Strike Team; default secondary Kauyon Lure", async () => {
    const b = await loadBundle()
    const patrol = b.patrols['tau.cp.protectors-of-aun-shar']
    expect(patrol).toBeTruthy()
    expect(patrol.units).toHaveLength(5)
    expect(patrol.units.reduce((n, u) => n + u.size, 0)).toBe(16)
    expect(patrol.warlord).toBe('aunshar')
    const aun = patrol.units.find((u) => u.ref === 'aunshar')!
    expect(aun.enhancement).toBe('tau.e.ds13-experimental-drone')
    expect(aun.attachTo).toBeUndefined()
    expect(patrol.units.find((u) => u.ref === 'fireblade')!.attachTo).toBe('strike-team')
    expect(patrol.secondaries.find((s) => s.default)!.id).toBe('tau.sec.kauyon-lure')
    expect(b.factions['tau-empire'].factionKeyword).toBe("T'AU EMPIRE")
    for (const e of Object.values(b.enhancements).filter((x) => x.faction === 'tau-empire')) expect(Array.isArray(e.effect)).toBe(true)
  })
})
