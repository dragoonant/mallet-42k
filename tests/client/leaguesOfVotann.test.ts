// Leagues of Votann in the client: the faction is pickable for either seat, every unit and model resolves to its own
// procedural figure in the faction paint scheme (no GLBs yet, so the lookup must fall back cleanly), and the Judgement
// token readout matches the shape the engine stores.
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { loadBundle } from '../../src/data'
import { patrolsForFaction, resolveFactionId, useGameStore } from '../../src/client/store/game'
import { resolveBase, resolveFigureKit, resolvePaintColors } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND, VEHICLE_CONFIG } from '../../src/client/figures/kitConfigs'
import { ENABLED_GLB_SLUGS, GLB_SLUG_BY_MODEL, glbSlugFor } from '../../src/client/figures/glbModels'
import { judgementCount, judgementLine } from '../../src/client/ui/judgement'
import type { GameState } from '../../src/engine/types'

const bundle = await loadBundle()
const FACTION = 'leagues-of-votann'
const sheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('lov.'))

describe('leagues of votann: faction selection', () => {
  it('is a bundle faction with a patrol, and its id passes through unchanged', () => {
    expect(bundle.factions[FACTION]).toBeDefined()
    expect(resolveFactionId(FACTION)).toBe(FACTION)
    expect(patrolsForFaction(bundle, FACTION).length).toBeGreaterThan(0)
  })

  it('can be picked for either seat of a hotseat game', async () => {
    await useGameStore.getState().newGame({ playerFaction: FACTION, opponentFaction: 'orks', opponent: 'hotseat', seed: 'lov-seat-a' })
    let s = useGameStore.getState().state!
    expect(s.players.A.faction).toBe(FACTION)
    expect(s.players.B.faction).toBe('ork')
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponentFaction: FACTION, opponent: 'hotseat', seed: 'lov-seat-b' })
    s = useGameStore.getState().state!
    expect(s.players.A.faction).toBe('sm')
    expect(s.players.B.faction).toBe(FACTION)
  }, 60000)
})

describe('leagues of votann: figures', () => {
  it('there are four datasheets to check', () => {
    expect(sheets.length).toBe(4)
  })

  it('the paint scheme comes from the data (slate teal plate, amber glow)', () => {
    const paint = resolvePaintColors(bundle.factions[FACTION])
    expect(paint.primary).toBe('#2f4a5c')
    expect(paint.secondary).toBe('#d08a2c')
  })

  for (const ds of sheets) {
    for (const m of ds.composition) {
      it(`${ds.id}/${m.modelId} has its own Votann kit with a body config`, () => {
        const { kit } = resolveFigureKit(ds.id, ds, m.modelId)
        expect(kit.startsWith('lov-'), kit).toBe(true)
        const body = BODY_KIND[kit]
        if (body === 'biped') expect(BIPED_CONFIG[kit], kit).toBeDefined()
        if (body === 'vehicle') expect(VEHICLE_CONFIG[kit], kit).toBeDefined()
      })
    }

    it(`${ds.id} resolves to a Votann kit even with no model id`, () => {
      expect(resolveFigureKit(ds.id, ds).kit.startsWith('lov-')).toBe(true)
    })

    it(`${ds.id} falls back to the procedural kit while it has no enabled GLB`, () => {
      for (const m of ds.composition) {
        const slug = glbSlugFor(ds.id, m.modelId)
        if (slug) expect(existsSync(`public/assets/models/${slug}.glb`), slug).toBe(true)
      }
      // every mapped slug must be a real, enabled one — or absent from the table entirely
      for (const [key, slug] of Object.entries(GLB_SLUG_BY_MODEL)) if (key.startsWith('lov.')) expect(ENABLED_GLB_SLUGS, key).toContain(slug)
    })
  }

  it('the Hearthkyn variants look different from a plain Warrior, and a Beserk with a gauntlet differs from the axe Beserk', () => {
    const hk = bundle.datasheets['lov.hearthkyn-warriors']
    const kit = (id: string) => resolveFigureKit(hk.id, hk, id).kit
    expect(new Set(['warrior', 'warrior-comms', 'warrior-medipack', 'warrior-scanner', 'warrior-hylas', 'warrior-magna', 'theyn'].map(kit)).size).toBe(7)
    const bs = bundle.datasheets['lov.cthonian-beserks']
    const beserkKit = (id: string) => resolveFigureKit(bs.id, bs, id).kit
    expect(new Set(['beserk', 'beserk-gauntlet', 'beserk-mole'].map(beserkKit)).size).toBe(3)
  })

  it('the three Pioneers ride grav-bikes with different rigs', () => {
    const p = bundle.datasheets['lov.hernkyn-pioneers']
    const rigs = p.composition.map((m) => VEHICLE_CONFIG[resolveFigureKit(p.id, p, m.modelId).kit]?.rig)
    expect(new Set(rigs).size).toBe(3)
    for (const m of p.composition) expect(VEHICLE_CONFIG[resolveFigureKit(p.id, p, m.modelId).kit]?.style).toBe('gravbike')
  })

  it('Votann are short: infantry under the human baseline, the Pioneer bike keeps its oval base', () => {
    const hk = bundle.datasheets['lov.hearthkyn-warriors']
    const kahl = bundle.datasheets['lov.kahl-warspeke']
    const pio = bundle.datasheets['lov.hernkyn-pioneers']
    expect(resolveBase(hk, 'infantry', 'warrior').height).toBeLessThan(1.1)
    expect(resolveBase(kahl, 'heavy', 'kahl').height).toBeCloseTo(1.05)
    const base = resolveBase(pio, 'vehicle', 'pioneer-comms')
    expect(base.radiusZ).toBeGreaterThan(base.radiusX)
  })
})

describe('leagues of votann: Judgement tokens on the unit card', () => {
  const state = {
    players: {
      A: { secondaryState: { 'lov:judgement': { 'B:u1': 1, 'B:u2': 2, 'B:u3': 9 } } },
      B: { secondaryState: {} },
    },
  } as unknown as GameState

  it('reads the per-player token map and caps at two', () => {
    expect(judgementCount(state, 'B:u1')).toBe(1)
    expect(judgementCount(state, 'B:u2')).toBe(2)
    expect(judgementCount(state, 'B:u3')).toBe(2)
    expect(judgementCount(state, 'B:none')).toBe(0)
  })

  it('says what the tokens do, in our own words, and nothing for zero', () => {
    expect(judgementLine(0)).toBeNull()
    expect(judgementLine(1)).toMatch(/hit/)
    expect(judgementLine(2)).toMatch(/wound/)
  })
})
