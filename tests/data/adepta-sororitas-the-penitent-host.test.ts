import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'

const PID = 'ade.cp.the-penitent-host'

describe('adepta sororitas - The Penitent Host data', () => {
  it('PEN-001 patrol loads: 7 units, 26 models; Ellyrine WARLORD with Armour of Faith attached to the Battle Sisters; default secondary Divine Judgement; pen stratagems', async () => {
    const b = await loadBundle()
    const p = b.patrols[PID]
    expect(p).toBeTruthy()
    expect(p.units).toHaveLength(7)
    expect(p.units.reduce((n, u) => n + u.size, 0)).toBe(26)
    expect(p.warlord).toBe('canoness')
    const c = p.units.find((u) => u.ref === 'canoness')!
    expect(c.enhancement).toBe('ade.e.armour-of-faith')
    expect(c.attachTo).toBe('sisters')
    expect(p.secondaries.find((s) => s.default)!.id).toBe('ade.sec.divine-judgement')
    expect(p.stratagems).toEqual(['ade.s.pen.ascetic-discipline', 'ade.s.pen.a-martyrs-death', 'ade.s.pen.holy-radiance'])
    expect(b.factions['adepta-sororitas'].combatPatrols).toEqual(['ade.cp.sanctuary-guardians', PID])
  })

  it('PEN-002 first patrol untouched; new ids do not collide with existing datasheets', async () => {
    const b = await loadBundle()
    const first = b.patrols['ade.cp.sanctuary-guardians']
    expect(first.units.map((u) => u.datasheet)).toEqual(['ade.canoness-adalya', 'ade.battle-sisters-squad', 'ade.celestian-sacresants', 'ade.arco-flagellants'])
    expect(b.datasheets['ade.battle-sisters-squad'].abilities).toContain('ade.a.simulacrum-imperialis')
    expect(b.datasheets['ade.pen.battle-sisters-squad'].abilities).not.toContain('ade.a.simulacrum-imperialis')
    expect(b.datasheets['ade.arco-flagellants'].composition[0].max).toBe(10)
    expect(b.datasheets['ade.pen.arco-flagellants'].composition[0].max).toBe(3)
    expect(first.stratagems.some((id) => b.patrols[PID].stratagems.includes(id))).toBe(false)
  })

  it('PEN-003 Ellyrine may lead only the PEN Battle Sisters', async () => {
    const b = await loadBundle()
    expect(b.datasheets['ade.canoness-ellyrine'].leader!.attachTo).toEqual(['ade.pen.battle-sisters-squad'])
  })

  it('PEN-004 Patrol Squads split: A = Superior, flamer, 3 boltgun; B = storm bolter, Simulacrum, 3 boltgun', async () => {
    const b = await loadBundle()
    const s = b.patrols[PID].units.find((u) => u.ref === 'sisters')!
    const [a, bb] = s.patrolSquads!
    expect([a.ref, a.size, bb.ref, bb.size]).toEqual(['sisters-a', 5, 'sisters-b', 5])
    expect(a.wargear.map((w) => [w.modelId, w.count])).toEqual([['superior', 1], ['sister-flamer', 1], ['sister', 3]])
    expect(bb.wargear.map((w) => [w.modelId, w.count])).toEqual([['sister-storm-bolter', 1], ['sister-simulacrum', 1], ['sister', 3]])
  })

  it('PEN-005 every datasheet carries Acts of Faith', async () => {
    const b = await loadBundle()
    for (const u of b.patrols[PID].units) expect(b.datasheets[u.datasheet].abilities).toContain('ade.a.acts-of-faith')
  })

  it('PEN-006/008 enhancements: Armour of Faith has bearer and unit FNP; Saintly Relic has gain and re-roll hooks', async () => {
    const b = await loadBundle()
    const af = b.enhancements['ade.e.armour-of-faith'].effect as { effect?: unknown }[]
    expect(af).toHaveLength(2)
    const sr = b.enhancements['ade.e.saintly-relic'].effect as { code?: string }[]
    expect(sr.map((e) => e.code)).toEqual(['saintlyRelicGain', 'saintlyRelic'])
  })

  it('PEN-009/010/011 secondaries use the planned scoring rules', async () => {
    const b = await loadBundle()
    const [dj, rites] = b.patrols[PID].secondaries
    expect(dj.scoring.map((r) => r.code)).toEqual(['divineJudgementPick', 'divineJudgementScore'])
    expect(dj.scoring[1]).toMatchObject({ when: 'battle.end', pointsPer: 6, cap: 10 })
    expect(rites.scoring[0]).toMatchObject({ code: 'reclaimAndDominate', when: 'turn.end', pointsPer: 3, cap: 3, params: { keyword: 'ADEPTA SORORITAS' } })
  })

  it('PEN-014 Holy Radiance costs 2 and skips the roll and the Miracle discard', async () => {
    const b = await loadBundle()
    const s = b.stratagems['ade.s.pen.holy-radiance']
    expect(s.cost).toBe(2)
    expect(s.code).toBe('aMartyrsDeath')
    expect(s.params).toMatchObject({ roll: false, discardsMiracleDie: false })
  })

  it('PEN-018/017 Seraphim: Deep Strike, FLY + JUMP PACK, Angelic Ascent', async () => {
    const b = await loadBundle()
    const d = b.datasheets['ade.seraphim-squad']
    expect(d.coreAbilities).toContainEqual({ ability: 'DEEP_STRIKE' })
    expect(d.keywords).toEqual(expect.arrayContaining(['FLY', 'JUMP PACK']))
    expect(d.abilities).toContain('ade.a.angelic-ascent')
    expect(d.stats.M).toBe(12)
  })

  it('PEN-019/020 Repentia: FNP 5+, Sister Repentia Sv 7+ Ld 8+, Overseer abilities use unitHasModel', async () => {
    const b = await loadBundle()
    const d = b.datasheets['ade.repentia-squad']
    expect(d.coreAbilities).toContainEqual({ ability: 'FEEL_NO_PAIN', value: 5 })
    expect(d.invuln).toBe(6)
    expect(d.composition.find((m) => m.modelId === 'repentia')!.statsOverride).toEqual({ Sv: 7, Ld: 8 })
    expect(b.abilities['ade.a.overseer-of-redemption.hit'].when).toMatchObject({ unitHasModel: 'superior' })
    expect(b.abilities['ade.a.overseer-of-redemption.wound'].when).toMatchObject({ unitHasModel: 'superior', unitCharged: true })
  })

  it('PEN-021 PEN Arco-flagellants: 3 models, FNP 4+, flails Twin-linked + Sustained Hits 1, no Extremis', async () => {
    const b = await loadBundle()
    const d = b.datasheets['ade.pen.arco-flagellants']
    expect(d.coreAbilities).toContainEqual({ ability: 'FEEL_NO_PAIN', value: 4 })
    expect(d.abilities).not.toContain('ade.a.extremis-trigger-word')
    expect(b.weapons['ade.w.pen-arco-flails'].abilities.map((a) => a.ability).sort()).toEqual(['SUSTAINED_HITS', 'TWIN_LINKED'])
  })

  it('PEN-022 Penitent Engine: T6 W5 Sv4+ no invuln, FNP 5+, Deadly Demise 1, Endless Suffering', async () => {
    const b = await loadBundle()
    const d = b.datasheets['ade.penitent-engine']
    expect([d.stats.T, d.stats.W, d.stats.Sv, d.invuln]).toEqual([6, 5, 4, undefined])
    expect(d.coreAbilities).toEqual(expect.arrayContaining([{ ability: 'DEADLY_DEMISE', value: 1 }, { ability: 'FEEL_NO_PAIN', value: 5 }]))
    expect(b.abilities['ade.a.endless-suffering'].effect).toEqual({ chargeAfterAdvance: true })
    expect(b.weapons['ade.w.penitent-flamers'].A).toBe('2D6')
  })

  it('PEN-023/024 Rhino: T9 W10 Sv3+ inv 6+, Deadly Demise D3, transport 12 no JUMP PACK, Firing Deck 2', async () => {
    const b = await loadBundle()
    const d = b.datasheets['ade.sororitas-rhino']
    expect([d.stats.T, d.stats.W, d.stats.Sv, d.invuln]).toEqual([9, 10, 3, 6])
    expect(d.keywords).toEqual(expect.arrayContaining(['TRANSPORT', 'DEDICATED TRANSPORT', 'SMOKE']))
    expect(d.coreAbilities).toEqual(expect.arrayContaining([{ ability: 'DEADLY_DEMISE', value: 'D3' }, { ability: 'FIRING_DECK', value: 2 }]))
    expect(d.transport).toEqual({ capacity: 12, keywords: ['ADEPTA SORORITAS', 'INFANTRY'], excludeKeywords: ['JUMP PACK'], firingDeck: 2 })
  })

  it('PEN-026 weapon profiles', async () => {
    const b = await loadBundle()
    const sc = b.weapons['ade.w.ellyrine-plasma-pistol-supercharge']
    expect([sc.skill, sc.S, sc.AP, sc.D]).toEqual([2, 8, -3, 2])
    expect(sc.abilities.map((a) => a.ability)).toContain('HAZARDOUS')
    const ss = b.weapons['ade.w.seraphim-plasma-pistol-supercharge']
    expect(ss.skill).toBe(3)
    const sb = b.weapons['ade.w.artificer-storm-bolter']
    expect([sb.A, sb.D]).toEqual([2, 2])
    expect(b.weapons['ade.w.neural-whips'].abilities).toContainEqual({ ability: 'ANTI', keyword: 'INFANTRY', value: 4 })
    const ev = b.weapons['ade.w.penitent-eviscerator']
    expect([ev.S, ev.AP, ev.D]).toEqual([6, -2, 2])
  })
})
