// Aeldari client wiring: every datasheet model resolves to its own procedural kit (never a generic fallback),
// every ranged weapon has a tracer family by keyword, and the pool of saved dice reads "Fate" for them.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { resolveFigureKit } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND, VEHICLE_CONFIG } from '../../src/client/figures/kitConfigs'
import { diePoolName, hasFatePool, multiDiePick, toggleDie } from '../../src/client/ui/fate'
import type { GameState } from '../../src/engine/types'

const bundle = await loadBundle()
const datasheets = Object.values(bundle.datasheets).filter((d) => d.faction === 'aeldari')

describe('aeldari figures', () => {
  it('the bundle carries the four Fatebreakers datasheets', () => {
    expect(datasheets.map((d) => d.id).sort()).toEqual(['ael.farseer-iraneth', 'ael.guardian-defenders', 'ael.windriders', 'ael.wraithlord'])
  })

  it('every model of every datasheet has its own ael-* kit with a configured look', () => {
    for (const ds of datasheets) {
      for (const c of ds.composition) {
        const { kit } = resolveFigureKit(ds.id, ds, c.modelId)
        expect(kit, `${ds.id}/${c.modelId}`).toMatch(/^ael-/)
        const cfg = BODY_KIND[kit] === 'vehicle' ? VEHICLE_CONFIG[kit] : BIPED_CONFIG[kit]
        expect(cfg, `${kit} has no config`).toBeDefined()
      }
    }
  })

  it('the two Windrider loadouts and the platform look different', () => {
    const w = (id: string) => resolveFigureKit('ael.windriders', bundle.datasheets['ael.windriders'], id).kit
    expect(w('windrider-catapult')).not.toBe(w('windrider-scatter'))
    expect(resolveFigureKit('ael.guardian-defenders', bundle.datasheets['ael.guardian-defenders'], 'heavy-weapon-platform').kit).toBe('ael-platform')
  })
})

describe('Fate dice naming', () => {
  const fakeState = (faction: string): GameState => ({
    players: { A: { faction }, B: { faction: 'sm' } },
    units: {}, datasheets: {}, abilities: {},
  }) as unknown as GameState

  it('an Aeldari player has a Fate pool; others keep Miracle', () => {
    expect(hasFatePool(fakeState('aeldari'), 'A')).toBe(true)
    expect(diePoolName(fakeState('aeldari'), 'A')).toBe('Fate')
    expect(diePoolName(fakeState('aeldari'), 'B')).toBe('Miracle')
    expect(diePoolName(undefined, 'A')).toBe('Miracle')
  })

  it('any unit carrying the strandsOfFate ability also counts', () => {
    const s = {
      players: { A: { faction: 'other' }, B: { faction: 'sm' } },
      units: { u1: { player: 'A', datasheetId: 'x' } },
      datasheets: { x: { abilities: ['ab'] } },
      abilities: { ab: { code: 'strandsOfFate' } },
    } as unknown as GameState
    expect(hasFatePool(s, 'A')).toBe(true)
  })
})

describe('Fate dice multi-select', () => {
  it('only a batch offer with maxSubstitutions above 1 gets the picker, capped by the pool', () => {
    expect(multiDiePick({ pool: [3, 5, 6], maxSubstitutions: 1 })).toBeNull()
    expect(multiDiePick({ pool: [3, 5, 6] })).toBeNull()
    expect(multiDiePick({ pool: [3, 5, 6], maxSubstitutions: 2 })).toEqual({ pool: [3, 5, 6], max: 2 })
    expect(multiDiePick({ pool: [4], maxSubstitutions: 3 })).toBeNull()
  })

  it('toggling adds in pick order, removes on a second click, and stops at the cap', () => {
    let sel: number[] = []
    sel = toggleDie(sel, 2, 2)
    sel = toggleDie(sel, 0, 2)
    expect(sel).toEqual([2, 0])
    expect(toggleDie(sel, 1, 2)).toEqual([2, 0])
    expect(toggleDie(sel, 2, 2)).toEqual([0])
  })
})
