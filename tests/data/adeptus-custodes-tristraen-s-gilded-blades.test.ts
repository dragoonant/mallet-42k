import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PID = 'cus.cp.tristraen-s-gilded-blades'

describe('adeptus custodes - Tristraen\'s Gilded Blades data', () => {
  it('TRI-001 patrol loads: Tristraen WARLORD with Watchman of Terra, unattached; retinue choice defaults to Wardens; default secondary Raise the Vexillas', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    expect(p).toBeTruthy()
    expect(p.warlord).toBe('tristraen')
    const t = p.units.find((u) => u.ref === 'tristraen')!
    expect(t.enhancement).toBe('cus.e.watchman-of-terra')
    expect(t.attachTo).toBeUndefined()
    const g = p.unitChoices![0]
    expect(g.refs).toEqual(['wardens', 'allarus'])
    expect(g.default).toBe('wardens')
    const fielded = (pick: string) => p.units.filter((u) => !g.refs.includes(u.ref) || u.ref === pick)
    expect(fielded('wardens').reduce((n, u) => n + u.size, 0)).toBe(7)
    expect(fielded('allarus').reduce((n, u) => n + u.size, 0)).toBe(6)
    expect(p.secondaries.find((s) => s.default)!.id).toBe('cus.sec.raise-the-vexillas')
    expect(b.factions['adeptus-custodes'].combatPatrols).toContain(PID)
    expect(b.patrols['cus.cp.guardians-of-the-throne']).toBeTruthy()
  })

  it('TRI-003 stats: Guard has no BATTLELINE or Deep Strike and 4 W per model; Tristraen 6 W; Allarus T7 M5', async () => {
    const b = await loadBundle()
    const guard = b.datasheets['cus.custodian-guard-tgb']
    expect(guard.keywords).not.toContain('BATTLELINE')
    expect(guard.coreAbilities.some((c) => c.ability === 'DEEP_STRIKE')).toBe(false)
    expect(guard.composition[0].statsOverride).toEqual({ W: 4 })
    expect(b.datasheets['cus.tristraen'].stats.W).toBe(6)
    const al = b.datasheets['cus.allarus-custodians']
    expect(al.stats.T).toBe(7)
    expect(al.stats.M).toBe(5)
  })

  it('TRI-016 patrol stratagems are the tgb ones, disjoint from Guardians of the Throne', async () => {
    const b = await loadBundle()
    const tri = b.patrols[PID].stratagems
    const gk = b.patrols['cus.cp.guardians-of-the-throne'].stratagems
    expect(tri.every((id) => id.startsWith('cus.s.tgb-'))).toBe(true)
    expect(tri.some((id) => gk.includes(id))).toBe(false)
  })

  it('TRI-017 vaultswords are three profiles of one profileGroup', async () => {
    const b = await loadBundle()
    const t = b.datasheets['cus.tristraen'].composition[0].weapons.default
    expect(t).toHaveLength(3)
    const ws = t.map((id) => b.weapons[id])
    expect(new Set(ws.map((w) => w.profileGroup)).size).toBe(1)
    expect(ws.map((w) => w.A)).toEqual([6, 9, 5])
    expect(ws[0].abilities.map((a) => a.ability)).toContain('PRECISION')
    expect(ws[2].D).toBe(3)
  })

  it('TRI-019 Wardens wargear as built', async () => {
    const b = await loadBundle()
    const ws = b.datasheets['cus.custodian-wardens'].composition
    const axe = ws.find((m) => m.modelId === 'axe')!
    expect(axe.weapons.default).toEqual(['cus.w.castellan-axe-ranged', 'cus.w.castellan-axe-melee'])
    const m = b.weapons['cus.w.castellan-axe-melee']
    expect([m.A, m.S, m.AP, m.D]).toEqual([4, 9, -1, 3])
    expect(ws.find((x) => x.modelId === 'spear')!.weapons.default).toEqual(['cus.w.guardian-spear-ranged', 'cus.w.guardian-spear-melee'])
  })

  it('TRI-018 balistus grenade launcher is D6 Blast', async () => {
    const b = await loadBundle()
    const w = b.weapons['cus.w.balistus-grenade-launcher']
    expect(w.A).toBe('D6')
    expect(w.abilities.map((a) => a.ability)).toContain('BLAST')
  })
})
