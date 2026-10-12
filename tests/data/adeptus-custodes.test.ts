import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { ENGINE_VERSION, createGameState, type GameSetup, type PlayerSetup } from '../../src/engine'

describe('adeptus custodes data', () => {
  it('CUS-001 patrol loads: default build 4 units / 15 models, Tyvan WARLORD with Auramite Thunderbolt attached to the Guard, default secondary Guardian of the Realm', async () => {
    const b = await loadBundle()
    const patrol = b.patrols['cus.cp.guardians-of-the-throne']
    expect(patrol).toBeTruthy()
    const group = patrol.unitChoices![0]
    expect(group.refs).toEqual(['guard', 'praetors'])
    expect(group.default).toBe('guard')
    const fielded = (pick: string) => patrol.units.filter((u) => !group.refs.includes(u.ref) || u.ref === pick)
    expect(fielded('guard')).toHaveLength(4)
    expect(fielded('guard').reduce((n, u) => n + u.size, 0)).toBe(15)
    // CUS-002 data side: the Praetor build is 12 models
    expect(fielded('praetors').reduce((n, u) => n + u.size, 0)).toBe(12)
    expect(patrol.warlord).toBe('captain')
    const cap = patrol.units.find((u) => u.ref === 'captain')!
    expect(cap.enhancement).toBe('cus.e.auramite-thunderbolt')
    expect(cap.attachTo).toBe('guard')
    expect(patrol.secondaries.find((s) => s.default)!.id).toBe('cus.sec.guardian-of-the-realm')
    expect(b.factions['adeptus-custodes'].factionKeyword).toBe('ADEPTUS CUSTODES')
  })

  it('CUS-002 Praetor build: unitChoices escort=praetors gives 4 units / 12 models, no Guard unit, Tyvan unattached', async () => {
    const b = await loadBundle()
    const cus: PlayerSetup = {
      name: 'Custodes', faction: 'adeptus-custodes', patrolId: 'cus.cp.guardians-of-the-throne', enhancementId: 'cus.e.auramite-thunderbolt',
      secondaryId: 'cus.sec.guardian-of-the-realm', attachments: [], reserves: [], battleReadyVp: 0, unitChoices: { escort: 'praetors' },
    }
    const sm: PlayerSetup = { name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics', attachments: [], reserves: [], battleReadyVp: 0 }
    const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: cus, B: sm }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
    const s = createGameState(setup, b, 'cus-002', ENGINE_VERSION)
    const units = Object.values(s.units).filter((u) => u.player === 'A')
    expect(units).toHaveLength(4)
    expect(units.reduce((n, u) => n + u.models.length, 0)).toBe(12)
    expect(s.units['A:guard']).toBeUndefined()
    expect(s.units['A:praetors']).toBeTruthy()
    expect(s.units['A:captain'].bodyguardUnitId).toBeNull()
  })

  it('CUS-003 Guard wargear as built: vexilla bearer melee only, shield models 4 W, Tyvan 7 W', async () => {
    const b = await loadBundle()
    const guard = b.datasheets['cus.custodian-guard']
    const model = (id: string) => guard.composition.find((m) => m.modelId === id)!
    expect(model('vexilla').weapons.default).toEqual(['cus.w.misericordia'])
    expect(model('vexilla').statsOverride).toEqual({ W: 4 })
    expect(model('blade').statsOverride).toEqual({ W: 4 })
    expect(model('spear').statsOverride).toBeUndefined()
    expect(guard.stats.W).toBe(3)
    expect(b.datasheets['cus.shield-captain-tyvan'].composition[0].statsOverride).toEqual({ W: 7 })
  })

  it('CUS-023 Deep Strike: Tyvan and Guard have it; Praetors, Prosecutors, Vigilators do not', async () => {
    const b = await loadBundle()
    const has = (id: string) => b.datasheets[id].coreAbilities.some((c) => c.ability === 'DEEP_STRIKE')
    expect(has('cus.shield-captain-tyvan')).toBe(true)
    expect(has('cus.custodian-guard')).toBe(true)
    expect(has('cus.vertus-praetors')).toBe(false)
    expect(has('cus.prosecutors')).toBe(false)
    expect(has('cus.vigilators')).toBe(false)
  })
})
