// Death Guard in the client: selectable on either seat, every datasheet/model resolves to its own procedural kit
// (each also has an SD figure GLB, Poxwalkers alternating two sculpts), and the plague weapons voice as intended.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { useGameStore } from '../../src/client/store/game'
import { resolveFigureKit } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND } from '../../src/client/figures/kitConfigs'
import { glbSlugFor } from '../../src/client/figures/glbModels'

const bundle = await loadBundle()
const dgSheets = Object.values(bundle.datasheets).filter((d) => d.faction === 'death-guard')

describe('death-guard client plumbing', () => {
  it('has datasheets in the bundle', () => {
    expect(dgSheets.length).toBe(4)
  })

  it('every model resolves to a dg-* biped kit with a config, not a generic fallback', () => {
    for (const sheet of dgSheets) {
      for (const m of sheet.composition) {
        const { kit } = resolveFigureKit(sheet.id, sheet, m.modelId)
        expect(kit, `${sheet.id}/${m.modelId}`).toMatch(/^dg-/)
        expect(BODY_KIND[kit]).toBe('biped')
        expect(BIPED_CONFIG[kit], kit).toBeDefined()
      }
    }
  })

  it('the unit types read differently from each other', () => {
    const kits = new Set(dgSheets.flatMap((s) => s.composition.map((m) => resolveFigureKit(s.id, s, m.modelId).kit)))
    expect(kits.size).toBe(7)
  })

  it('every Death Guard model resolves to an enabled SD figure GLB', () => {
    for (const sheet of dgSheets) for (const m of sheet.composition) expect(glbSlugFor(sheet.id, m.modelId), `${sheet.id}/${m.modelId}`).toBeDefined()
  })

  it('newGame seats Death Guard on either side and in a mirror', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'death-guard', opponentFaction: 'sm', opponent: 'hotseat', seed: 'dg-vs-sm' })
    let s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['death-guard', 'sm'])
    await useGameStore.getState().newGame({ playerFaction: 'orks', opponentFaction: 'death-guard', opponent: 'hotseat', seed: 'ork-vs-dg' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['ork', 'death-guard'])
    await useGameStore.getState().newGame({ playerFaction: 'death-guard', opponentFaction: 'death-guard', opponent: 'hotseat', seed: 'dg-mirror' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['death-guard', 'death-guard'])
  })
})

describe('poxwalker sculpt variants', () => {
  it('alternate between the two Poxwalker GLBs by model instance id', () => {
    const slugs = new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => glbSlugFor('dg.poxwalkers', 'poxwalker', id)))
    expect(slugs).toEqual(new Set(['poxwalker', 'poxwalker-b']))
    expect(glbSlugFor('dg.poxwalkers', 'poxwalker')).toBe('poxwalker')
  })
})
