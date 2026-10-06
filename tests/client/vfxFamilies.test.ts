// Every ranged weapon in the data bundle must land in one of the 14 vfx families by a real rule (its name or
// abilities), not by the plain faction default, and every family needs a look defined. Per-attack hit/miss
// planning for volleys is pinned too.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { classifyVfxFamily, vfxFamily, VFX_FAMILIES } from '../../src/client/weaponFlavour'
import { FAMILY_FX } from '../../src/client/vfx/families'
import { averageAttacks, hitChance } from '../../src/client/presentation/volleys'

const bundle = await loadBundle()
const ranged = Object.entries(bundle.weapons).filter(([, w]) => w.type === 'ranged')

describe('vfx weapon families', () => {
  it('every ranged weapon in the data maps to a family, by keyword rather than a fallback', () => {
    expect(ranged.length).toBeGreaterThan(50)
    const fallbacks = ranged.map(([id, w]) => ({ id, ...classifyVfxFamily(id, w, '') })).filter((c) => c.via !== 'keyword').map((c) => `${c.id} -> ${c.family}`)
    expect(fallbacks).toEqual([])
    for (const [id, w] of ranged) expect(VFX_FAMILIES, id).toContain(vfxFamily(id, w, ''))
  })

  it('classifies the headline weapons of each family', () => {
    const f = (id: string): string => vfxFamily(id, bundle.weapons[id], '')
    expect(f('sm.w.storm-bolter')).toBe('bolt')
    expect(f('sm.w.assault-cannon')).toBe('autocannon')
    expect(f('am.w.lasgun')).toBe('las')
    expect(f('am.w.plasma-gun')).toBe('plasma')
    expect(f('am.w.meltagun')).toBe('melta')
    expect(f('sm.w.pyreblaster')).toBe('flamer')
    expect(f('ork.w.rokkit-launcha')).toBe('missile')
    expect(f('am.w.grenade-launcher-krak')).toBe('grenade')
    expect(f('nec.w.gauss-flayer')).toBe('gauss')
    expect(f('tau.w.pulse-rifle')).toBe('pulse')
    expect(f('ork.w.big-shoota')).toBe('dakka')
    expect(f('tyr.w.fleshborer')).toBe('bio')
    expect(f('sm.w.smite')).toBe('psychic')
  })

  it('every family has an effect definition', () => {
    for (const fam of VFX_FAMILIES) {
      const fx = FAMILY_FX[fam]
      expect(fx.family).toBe(fam)
      expect(fx.projectile.type).toBeTruthy()
      expect(fx.staggerMs).toBeGreaterThan(0)
    }
  })
})

describe('volley planning helpers', () => {
  it('averages dice-expression attack counts', () => {
    expect(averageAttacks(3)).toBe(3)
    expect(averageAttacks('D3')).toBe(2)
    expect(averageAttacks('D6')).toBe(4)
    expect(averageAttacks('2D6')).toBe(7)
  })
  it('derives hit chance from skill; no skill auto-hits', () => {
    expect(hitChance({ skill: 3 } as never)).toBeCloseTo(4 / 6)
    expect(hitChance({ skill: null } as never)).toBe(1)
    expect(hitChance(undefined)).toBe(1)
  })
})
