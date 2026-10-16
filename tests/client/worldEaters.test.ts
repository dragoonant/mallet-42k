// World Eaters in the client: the faction is pickable for either seat, every unit and model resolves to its own
// procedural figure in the faction paint scheme (no GLBs yet, so the lookup must fall back cleanly), and the new
// rules read in our own words on the decision prompt.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { loadBundle } from '../../src/data'
import { patrolsForFaction, resolveFactionId, useGameStore } from '../../src/client/store/game'
import { resolveFigureKit, resolvePaintColors } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND } from '../../src/client/figures/kitConfigs'
import { ENABLED_GLB_SLUGS, GLB_SLUG_BY_MODEL, glbSlugFor } from '../../src/client/figures/glbModels'
import { weaponFlavour } from '../../src/client/weaponFlavour'

const bundle = await loadBundle()
const FACTION = 'world-eaters'
const sheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('we.'))

describe('world eaters: faction selection', () => {
  it('is a bundle faction with a patrol, and its id passes through unchanged', () => {
    expect(bundle.factions[FACTION]).toBeDefined()
    expect(resolveFactionId(FACTION)).toBe(FACTION)
    expect(patrolsForFaction(bundle, FACTION).length).toBeGreaterThan(0)
  })

  it('can be picked for either seat of a hotseat game', async () => {
    await useGameStore.getState().newGame({ playerFaction: FACTION, opponentFaction: 'orks', opponent: 'hotseat', seed: 'we-seat-a' })
    let s = useGameStore.getState().state!
    expect(s.players.A.faction).toBe(FACTION)
    expect(s.players.B.faction).toBe('ork')
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponentFaction: FACTION, opponent: 'hotseat', seed: 'we-seat-b' })
    s = useGameStore.getState().state!
    expect(s.players.A.faction).toBe('sm')
    expect(s.players.B.faction).toBe(FACTION)
  }, 60000)
})

describe('world eaters: figures', () => {
  it('there are three datasheets to check', () => {
    expect(sheets.length).toBe(3)
  })

  it('the paint scheme comes from the data (blood red plate, brass trim)', () => {
    const paint = resolvePaintColors(bundle.factions[FACTION])
    expect(paint.primary).toBe('#8e1b1b')
    expect(paint.trim).toBe('#b08a3e')
  })

  for (const ds of sheets) {
    for (const m of ds.composition) {
      it(`${ds.id}/${m.modelId} has its own World Eaters kit with a body config`, () => {
        const { kit } = resolveFigureKit(ds.id, ds, m.modelId)
        expect(kit.startsWith('we-'), kit).toBe(true)
        expect(BODY_KIND[kit]).toBe('biped')
        expect(BIPED_CONFIG[kit], kit).toBeDefined()
      })
    }

    it(`${ds.id} resolves to a World Eaters kit even with no model id`, () => {
      expect(resolveFigureKit(ds.id, ds).kit.startsWith('we-')).toBe(true)
    })

    it(`${ds.id} falls back to the procedural kit while it has no enabled GLB`, () => {
      for (const m of ds.composition) {
        const slug = glbSlugFor(ds.id, m.modelId)
        if (slug) expect(existsSync(`public/assets/models/${slug}.glb`), slug).toBe(true)
      }
      for (const [key, slug] of Object.entries(GLB_SLUG_BY_MODEL)) if (key.startsWith('we.')) expect(ENABLED_GLB_SLUGS, key).toContain(slug)
    })
  }

  it('Karagar rides a Juggernaut and the horned Berzerkers look different from the hooded Jakhals', () => {
    const karagar = BIPED_CONFIG[resolveFigureKit('we.karagar-the-blooded', bundle.datasheets['we.karagar-the-blooded']).kit]
    expect(karagar?.juggernaut).toBe(true)
    const bz = bundle.datasheets['we.khorne-berzerkers']
    const jk = bundle.datasheets['we.jakhals']
    expect(BIPED_CONFIG[resolveFigureKit(bz.id, bz, 'chainblade').kit]?.headShape).toBe('chaos-helmet')
    expect(BIPED_CONFIG[resolveFigureKit(jk.id, jk, 'jakhal').kit]?.headShape).toBe('cultist-hood')
    const kits = new Set(bz.composition.map((m) => resolveFigureKit(bz.id, bz, m.modelId).kit))
    expect(kits.size).toBe(bz.composition.length)
  })
})

describe('world eaters: weapon flavour', () => {
  it('chain blades cut, the skullsmasher crushes', () => {
    expect(weaponFlavour('we.w.berzerker-chainblade', bundle.weapons['we.w.berzerker-chainblade'], FACTION)).toBe('chain')
    expect(weaponFlavour('we.w.skullsmasher', bundle.weapons['we.w.skullsmasher'], FACTION)).toBe('crush')
  })
})
