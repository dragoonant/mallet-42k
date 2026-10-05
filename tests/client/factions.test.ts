// Faction plumbing in the client: every faction in the data bundle can be picked for either seat, and every
// Necron and Chaos Space Marine datasheet resolves to its own procedural kit (with GLB lookups falling back cleanly).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { resolveFactionId, splittablePatrolRefs, useGameStore } from '../../src/client/store/game'
import { resolveFigureKit } from '../../src/client/figures/data'
import { BODY_KIND, BIPED_CONFIG, ARTILLERY_CONFIG } from '../../src/client/figures/kitConfigs'
import { glbSlugFor } from '../../src/client/figures/glbModels'
import { weaponIconKind, WEAPON_ICON_KINDS } from '../../src/client/ui/weaponIcons'

const bundle = await loadBundle()

describe('faction selection', () => {
  it('maps legacy setup keys and bare faction ids to engine faction ids', () => {
    expect(resolveFactionId('space-marines')).toBe('sm')
    expect(resolveFactionId('orks')).toBe('ork')
    expect(resolveFactionId('necrons')).toBe('necrons')
    expect(resolveFactionId('tyranids')).toBe('tyranids')
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
  it('newGame seats Tyranids against each other faction and in a mirror', async () => {
    for (const opp of ['space-marines', 'orks', 'necrons', 'tyranids']) {
      await useGameStore.getState().newGame({ playerFaction: 'tyranids', opponentFaction: opp, opponent: 'hotseat', seed: `tyr-vs-${opp}` })
      const s = useGameStore.getState().state!
      expect([s.players.A.faction, s.players.B.faction], opp).toEqual(['tyranids', resolveFactionId(opp)])
    }
    await useGameStore.getState().newGame({ playerFaction: 'orks', opponentFaction: 'tyranids', opponent: 'hotseat', seed: 'ork-vs-tyr' })
    expect(useGameStore.getState().state!.players.B.faction).toBe('tyranids')
  }, 120000)

  it('astra-militarum can be picked for either seat, by bare faction id', async () => {
    expect(resolveFactionId('astra-militarum')).toBe('astra-militarum')
    await useGameStore.getState().newGame({ playerFaction: 'astra-militarum', opponentFaction: 'orks', opponent: 'hotseat', seed: 'am-vs-ork' })
    let s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['astra-militarum', 'ork'])
    await useGameStore.getState().newGame({ playerFaction: 'necrons', opponentFaction: 'astra-militarum', opponent: 'hotseat', seed: 'nec-vs-am' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['necrons', 'astra-militarum'])
  }, 60000)

  it('with no opponent chosen, the default is still a different faction', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'orks', opponent: 'hotseat', seed: 'default-opp-ork' })
    expect(useGameStore.getState().state!.players.B.faction).toBe('sm')
    await useGameStore.getState().newGame({ playerFaction: 'necrons', opponent: 'hotseat', seed: 'default-opp-nec' })
    expect(useGameStore.getState().state!.players.B.faction).toBe('sm')
  }, 60000)
})

describe('adepta sororitas figures', () => {
  const sheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('ade.'))

  it('the bundle carries the adepta sororitas datasheets', () => {
    expect(sheets.length).toBeGreaterThan(0)
  })

  for (const ds of sheets) {
    for (const m of ds.composition) {
      it(`${ds.id}/${m.modelId} resolves to a sororitas kit with a body config`, () => {
        const { kit } = resolveFigureKit(ds.id, ds, m.modelId)
        expect(kit.startsWith('ade-'), kit).toBe(true)
        if (BODY_KIND[kit] === 'biped') expect(BIPED_CONFIG[kit], kit).toBeDefined()
      })
    }

    it(`${ds.id} uses its enabled SD figure GLB`, () => {
      for (const m of ds.composition) expect(glbSlugFor(ds.id, m.modelId), m.modelId).toBeDefined()
    })
  }

  it('the per-model kits read as different silhouettes (weapons / head differ across a mixed squad)', () => {
    const squad = ['superior', 'sister-flamer', 'sister-heavy-flamer', 'sister-simulacrum', 'sister'].map(
      (m) => resolveFigureKit('ade.battle-sisters-squad', undefined, m).kit,
    )
    expect(new Set(squad).size).toBe(5)
    const shapes = squad.map((k) => `${BIPED_CONFIG[k]!.rightWeapon}/${BIPED_CONFIG[k]!.leftWeapon}`)
    expect(new Set(shapes).size).toBe(5)
  })

  it('an unknown model of a sororitas datasheet still gets the datasheet kit', () => {
    expect(resolveFigureKit('ade.battle-sisters-squad', undefined, 'mystery').kit).toBe('ade-sister')
  })
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

    it(`${ds.id} uses its enabled SD figure GLB`, () => {
      for (const m of ds.composition) expect(glbSlugFor(ds.id, m.modelId), m.modelId).toBeDefined()
    })
  }

  it('an unknown future datasheet still gets a generic kit, never nothing', () => {
    expect(resolveFigureKit('csm.future-unit', undefined).kit.startsWith('generic-')).toBe(true)
  })
})

describe('tyranid figures', () => {
  const tyrSheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('tyr.'))

  it('there are tyranid datasheets to check', () => {
    expect(tyrSheets.length).toBe(5)
  })

  it('every tyranid unit gets its own kit, and the five kits look different', () => {
    const kits = tyrSheets.map((ds) => resolveFigureKit(ds.id, ds).kit)
    for (const k of kits) expect(k.startsWith('tyr-'), k).toBe(true)
    expect(new Set(kits).size).toBe(tyrSheets.length)
    const heads = new Set(kits.map((k) => BIPED_CONFIG[k]?.headShape))
    expect(heads.size).toBeGreaterThanOrEqual(3)
  })

  for (const ds of tyrSheets) {
    it(`${ds.id} resolves to a tyranid kit with a body config`, () => {
      const { kit } = resolveFigureKit(ds.id, ds)
      expect(BODY_KIND[kit]).toBeDefined()
      if (BODY_KIND[kit] === 'biped') expect(BIPED_CONFIG[kit], kit).toBeDefined()
    })

    it(`${ds.id} uses its enabled SD figure GLB`, () => {
      for (const m of ds.composition) expect(glbSlugFor(ds.id, m.modelId), m.modelId).toBeDefined()
    })
  }

  it('the faction paint scheme is declared, so figures are painted in it', () => {
    expect(bundle.factions.tyranids.paintScheme.primary).toBeTruthy()
  })
})

describe('astra militarum figures', () => {
  const amSheets = Object.values(bundle.datasheets).filter((d) => d.id.startsWith('am.'))

  it('there are astra militarum datasheets to check', () => {
    expect(amSheets.length).toBe(4)
  })

  for (const ds of amSheets) {
    for (const m of ds.composition) {
      it(`${ds.id}/${m.modelId} resolves to its own am- kit with a body config`, () => {
        const { kit } = resolveFigureKit(ds.id, ds, m.modelId)
        expect(kit.startsWith('am-'), kit).toBe(true)
        const body = BODY_KIND[kit]
        if (body === 'biped') expect(BIPED_CONFIG[kit], kit).toBeDefined()
        if (body === 'artillery') expect(ARTILLERY_CONFIG[kit], kit).toBeDefined()
      })

      it(`${ds.id}/${m.modelId} uses its enabled SD figure GLB`, () => {
        expect(glbSlugFor(ds.id, m.modelId)).toBeDefined()
      })
    }
  }

  it('the two guns of the battery are different kits, and rank shows in the command squad', () => {
    expect(resolveFigureKit('am.field-ordnance-battery', undefined, 'gun-bombast').kit).not.toBe(resolveFigureKit('am.field-ordnance-battery', undefined, 'gun-malleus').kit)
    expect(resolveFigureKit('am.command-squad-karsk', undefined, 'karsk').kit).not.toBe(resolveFigureKit('am.command-squad-karsk', undefined, 'veteran').kit)
  })

  it('every astra militarum weapon resolves to a known icon', () => {
    for (const w of Object.values(bundle.weapons).filter((x) => x.id.startsWith('am.'))) expect(WEAPON_ICON_KINDS).toContain(weaponIconKind(w))
  })
})

describe('Patrol Squads for both seats', () => {
  it('Astra Militarum: the engine offers the Battery split to Player B as well as Player A, and a bot seat answers it', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'astra-militarum', opponentFaction: 'astra-militarum', opponent: 'hotseat', seed: 'am-squads-both' })
    const owners: string[] = []
    for (let i = 0; i < 30; i++) {
      const { pending } = useGameStore.getState()
      if (!pending || pending.kind === 'deployUnit') break
      if (pending.kind !== 'chooseOption') throw new Error(`unexpected ${pending.kind}`)
      if ((pending.context.data as { choice?: string }).choice === 'patrolSquads') owners.push(pending.player)
      const first = pending.options[0].action
      useGameStore.getState().dispatch({ ...first, decisionId: pending.id } as typeof first)
    }
    expect(owners.sort()).toEqual(['A', 'B'])
  }, 60000)

  it('Sororitas: splitSquads applies per seat (A only, B only, both) and defaults to whole units, so a hotseat Player B can split', async () => {
    const run = async (a: boolean, b: boolean) => {
      await useGameStore.getState().newGame({ playerFaction: 'adepta-sororitas', opponentFaction: 'adepta-sororitas', opponent: 'hotseat', seed: 'ade-split', splitSquads: a, opponentSplitSquads: b })
      const s = useGameStore.getState().state!
      return [Boolean(s.units['A:sisters-a']), Boolean(s.units['B:sisters-a'])]
    }
    expect(await run(false, false)).toEqual([false, false])
    expect(await run(true, false)).toEqual([true, false])
    expect(await run(false, true)).toEqual([false, true])
    expect(await run(true, true)).toEqual([true, true])
    expect(splittablePatrolRefs(bundle, 'adepta-sororitas')).toEqual(['sisters'])
    expect(splittablePatrolRefs(bundle, 'space-marines')).toEqual([])
  }, 60000)
})
