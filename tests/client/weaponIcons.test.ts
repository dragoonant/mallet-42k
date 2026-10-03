import { describe, expect, it } from 'vitest'
import orks from '@/data/factions/orks/weapons.json'
import marines from '@/data/factions/space-marines/weapons.json'
import { WEAPON_ICON_KINDS, weaponIconKind } from '@/client/ui/weaponIcons'

describe('weapon icon matcher', () => {
  type W = { id: string; name: string; type: 'ranged' | 'melee'; range: number; abilities: { ability: string }[] }
  const all = [...(orks as unknown as W[]), ...(marines as unknown as W[])]

  it('resolves every shipped weapon to a known icon', () => {
    expect(all.length).toBeGreaterThan(20)
    for (const w of all) expect(WEAPON_ICON_KINDS).toContain(weaponIconKind(w))
  })

  it('picks sensible categories', () => {
    const kind = (id: string) => weaponIconKind(all.find((w) => w.id === id)!)
    expect(kind('ork.w.choppa')).toBe('axe')
    expect(kind('ork.w.power-klaw')).toBe('fist')
    expect(kind('sm.w.pyreblaster')).toBe('flamer')
    expect(kind('sm.w.bolt-pistol')).toBe('pistol')
    expect(kind('ork.w.rokkit-launcha')).toBe('rocket')
    expect(kind('sm.w.force-weapon')).toBe('staff')
  })
})
