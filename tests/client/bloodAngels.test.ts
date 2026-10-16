// Blood Angels in the client: the faction is pickable for either seat, every unit and model resolves to its own
// procedural figure in the faction paint scheme (no GLBs yet, so the lookup must fall back cleanly), the weapons voice
// as themselves, and the new rules read in our own words on the decision prompt.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { loadBundle } from '../../src/data'
import { patrolsForFaction, resolveFactionId, useGameStore } from '../../src/client/store/game'
import { resolveFigureKit, resolvePaintColors, resolveBase } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND, VEHICLE_CONFIG } from '../../src/client/figures/kitConfigs'
import { ENABLED_GLB_SLUGS, GLB_SLUG_BY_MODEL, glbSlugFor } from '../../src/client/figures/glbModels'
import { weaponFlavour } from '../../src/client/weaponFlavour'

const bundle = await loadBundle()
const FACTION = 'blood-angels'
const sheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('ba.'))

describe('blood angels: faction selection', () => {
  it('is a bundle faction with a patrol, and its id passes through unchanged', () => {
    expect(bundle.factions[FACTION]).toBeDefined()
    expect(resolveFactionId(FACTION)).toBe(FACTION)
    expect(patrolsForFaction(bundle, FACTION).length).toBeGreaterThan(0)
  })

  it('can be picked for either seat of a hotseat game', async () => {
    await useGameStore.getState().newGame({ playerFaction: FACTION, opponentFaction: 'orks', opponent: 'hotseat', seed: 'ba-seat-a' })
    let s = useGameStore.getState().state!
    expect(s.players.A.faction).toBe(FACTION)
    expect(s.players.B.faction).toBe('ork')
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponentFaction: FACTION, opponent: 'hotseat', seed: 'ba-seat-b' })
    s = useGameStore.getState().state!
    expect(s.players.A.faction).toBe('sm')
    expect(s.players.B.faction).toBe(FACTION)
    await useGameStore.getState().newGame({ playerFaction: FACTION, opponentFaction: FACTION, opponent: 'hotseat', seed: 'ba-mirror' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual([FACTION, FACTION])
  }, 90000)
})

describe('blood angels: figures', () => {
  it('there are five datasheets to check', () => {
    expect(sheets.length).toBe(5)
  })

  it('the paint scheme comes from the data (crimson plate, gold trim)', () => {
    const paint = resolvePaintColors(bundle.factions[FACTION])
    expect(paint.primary).toBe('#9e1b1b')
    expect(paint.secondary).toBe('#c9a227')
  })

  for (const ds of sheets) {
    for (const m of ds.composition) {
      it(`${ds.id}/${m.modelId} has its own Blood Angels kit with a body config`, () => {
        const { kit } = resolveFigureKit(ds.id, ds, m.modelId)
        expect(kit.startsWith('ba-'), kit).toBe(true)
        if (ds.id === 'ba.impulsor') {
          expect(BODY_KIND[kit]).toBe('vehicle')
          expect(VEHICLE_CONFIG[kit], kit).toBeDefined()
        } else {
          expect(BODY_KIND[kit]).toBe('biped')
          expect(BIPED_CONFIG[kit], kit).toBeDefined()
        }
      })
    }

    it(`${ds.id} resolves to a Blood Angels kit even with no model id`, () => {
      expect(resolveFigureKit(ds.id, ds).kit.startsWith('ba-')).toBe(true)
    })

    it(`${ds.id} falls back to the procedural kit while it has no enabled GLB`, () => {
      for (const m of ds.composition) {
        const slug = glbSlugFor(ds.id, m.modelId)
        if (slug) expect(existsSync(`public/assets/models/${slug}.glb`), slug).toBe(true)
      }
      for (const [key, slug] of Object.entries(GLB_SLUG_BY_MODEL)) if (key.startsWith('ba.')) expect(ENABLED_GLB_SLUGS, key).toContain(slug)
    })
  }

  it('sergeants, mine carriers and the Librarian read differently from the rank and file', () => {
    const inter = bundle.datasheets['ba.intercessor-squad']
    const incur = bundle.datasheets['ba.incursor-squad']
    expect(new Set(inter.composition.map((m) => resolveFigureKit(inter.id, inter, m.modelId).kit)).size).toBe(inter.composition.length)
    expect(new Set(incur.composition.map((m) => resolveFigureKit(incur.id, incur, m.modelId).kit)).size).toBe(incur.composition.length)
    const mine = BIPED_CONFIG[resolveFigureKit(incur.id, incur, 'incursor-haywire').kit]
    expect(mine?.satchel).toBe(true)
    const lib = BIPED_CONFIG[resolveFigureKit('ba.librarian-marcellos', bundle.datasheets['ba.librarian-marcellos']).kit]
    expect(lib?.rightWeapon).toBe('ritual-staff')
  })

  it('Aggressors are bulkier than Intercessors and the Impulsor is a tall vehicle on a big base', () => {
    const agg = bundle.datasheets['ba.aggressor-squad']
    const { archetype, kit } = resolveFigureKit(agg.id, agg)
    expect(archetype).toBe('heavy')
    expect(BIPED_CONFIG[kit]!.bulk).toBeGreaterThan(1.3)
    const imp = bundle.datasheets['ba.impulsor']
    const k = resolveFigureKit(imp.id, imp)
    expect(k.archetype).toBe('vehicle')
    expect(resolveBase(imp, k.archetype).radiusX).toBeGreaterThan(1.5)
  })
})

describe('blood angels: weapon flavour', () => {
  it('flamestorm gauntlets burn, power fists crush, the chainsword cuts, bolters bark', () => {
    const f = (id: string) => weaponFlavour(id, bundle.weapons[id], FACTION)
    expect(f('ba.w.flamestorm-gauntlets')).toBe('flame')
    expect(f('ba.w.twin-power-fists')).toBe('crush')
    expect(f('ba.w.astartes-chainsword')).toBe('chain')
    expect(f('ba.w.bolt-rifle')).toBe('bolter')
  })
})

describe('blood angels: rule prompts', () => {
  const src = readFileSync('src/client/ui/DecisionPrompt.tsx', 'utf8')
  it('Multi-spectrum Array and the Haywire Mine have own-words prompt text', () => {
    expect(src).toMatch(/multi-\?spectrum-\?array/)
    expect(src).toMatch(/haywire-\?mine/)
  })
})
