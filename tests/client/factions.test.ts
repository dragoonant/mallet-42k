// Faction plumbing in the client: every faction in the data bundle can be picked for either seat, and every
// Necron and Chaos Space Marine datasheet resolves to its own procedural kit (with GLB lookups falling back cleanly).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { resolveFactionId, useGameStore } from '../../src/client/store/game'
import { resolveFigureKit } from '../../src/client/figures/data'
import { BODY_KIND, BIPED_CONFIG } from '../../src/client/figures/kitConfigs'
import { glbSlugFor } from '../../src/client/figures/glbModels'

const bundle = await loadBundle()

describe('faction selection', () => {
  it('maps legacy setup keys and bare faction ids to engine faction ids', () => {
    expect(resolveFactionId('space-marines')).toBe('sm')
    expect(resolveFactionId('orks')).toBe('ork')
    expect(resolveFactionId('necrons')).toBe('necrons')
    expect(resolveFactionId('ork')).toBe('ork')
  })

  it('every faction in the bundle has a patrol the start screen can launch', () => {
    for (const id of Object.keys(bundle.factions)) {
      expect(Object.values(bundle.patrols).some((p) => p.faction === id), id).toBe(true)
    }
  })

  it('newGame seats the chosen faction on both sides, including a mirror match', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'necrons', opponentFaction: 'sm', opponent: 'hotseat', seed: 'nec-vs-sm' })
    let s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['necrons', 'sm'])

    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponentFaction: 'necrons', opponent: 'hotseat', seed: 'sm-vs-nec' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['sm', 'necrons'])

    await useGameStore.getState().newGame({ playerFaction: 'necrons', opponentFaction: 'necrons', opponent: 'hotseat', seed: 'nec-mirror' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['necrons', 'necrons'])
  }, 60000)

  it('chaos-space-marines can be seated on either side by its bare faction id', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'chaos-space-marines', opponentFaction: 'orks', opponent: 'hotseat', seed: 'csm-vs-ork' })
    let s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['chaos-space-marines', 'ork'])

    await useGameStore.getState().newGame({ playerFaction: 'necrons', opponentFaction: 'chaos-space-marines', opponent: 'hotseat', seed: 'nec-vs-csm' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['necrons', 'chaos-space-marines'])

    await useGameStore.getState().newGame({ playerFaction: 'chaos-space-marines', opponentFaction: 'chaos-space-marines', opponent: 'hotseat', seed: 'csm-mirror' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['chaos-space-marines', 'chaos-space-marines'])
  }, 60000)

  it('with no opponent chosen, the default is still a different faction', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'orks', opponent: 'hotseat', seed: 'default-opp-ork' })
    expect(useGameStore.getState().state!.players.B.faction).toBe('sm')
    await useGameStore.getState().newGame({ playerFaction: 'necrons', opponent: 'hotseat', seed: 'default-opp-nec' })
    expect(useGameStore.getState().state!.players.B.faction).toBe('sm')
  }, 60000)
})

describe('necron figures', () => {
  const necronSheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('nec.'))

  it('there are necron datasheets to check', () => {
    expect(necronSheets.length).toBe(5)
  })

  for (const ds of necronSheets) {
    it(`${ds.id} resolves to a necron kit with a body config`, () => {
      const { kit } = resolveFigureKit(ds.id, ds)
      expect(kit.startsWith('nec-'), kit).toBe(true)
      const body = BODY_KIND[kit]
      if (body === 'biped') expect(BIPED_CONFIG[kit], kit).toBeDefined()
    })

    it(`${ds.id} uses its generated GLB model`, () => {
      for (const m of ds.composition) expect(glbSlugFor(ds.id, m.modelId), m.modelId).toBeDefined()
    })
  }
})

describe('chaos space marine figures', () => {
  const sheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('csm.'))

  it('there are chaos datasheets to check', () => {
    expect(sheets.length).toBe(4)
  })

  it('the faction paint scheme is the one the data declares (figures read it, nothing is hard-coded)', () => {
    expect(bundle.factions['chaos-space-marines'].paintScheme.primary).toBe('#2b2f3a')
  })

  for (const ds of sheets) {
    it(`${ds.id} resolves to a chaos kit with a body config`, () => {
      const { kit } = resolveFigureKit(ds.id, ds)
      expect(kit.startsWith('csm-'), kit).toBe(true)
      const body = BODY_KIND[kit]
      if (body === 'biped') expect(BIPED_CONFIG[kit], kit).toBeDefined()
    })

    it(`${ds.id} falls back to the procedural figure while no GLB is enabled`, () => {
      for (const m of ds.composition) expect(glbSlugFor(ds.id, m.modelId), m.modelId).toBeUndefined()
    })
  }

  it('an unknown future datasheet still gets a generic kit, never nothing', () => {
    expect(resolveFigureKit('csm.future-unit', undefined).kit.startsWith('generic-')).toBe(true)
  })
})
