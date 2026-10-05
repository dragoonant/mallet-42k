// Genestealer Cults enhancements, wargear and datasheet rules driven through the real attack / state services with the
// real Combat Patrol data (docs/spec/factions/genestealer-cults.md GEN-018, 019, 032 to 037).
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, EngineInvariantError, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type Action, type AttackContext, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState, type ModuleTable,
  type PlayerSetup, type RollContext,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { hookService } from '../../src/engine/hooks-impl'
import { transportService } from '../../src/engine/transports'
import { weaponService } from '../../src/engine/weapons'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GSC = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Cult', faction: 'genestealer-cults', patrolId: 'gsc.cp.hand-of-the-magus', enhancementId: 'gsc.e.psionic-shield', secondaryId: 'gsc.sec.rise-up',
  attachments: [{ leaderRef: 'magus', bodyguardRef: 'neophytes-a' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const MAGUS = 'A:magus', NEO = 'A:neophytes-a', ACO = 'A:acolytes', ABB = 'A:aberrants', ROCK = 'A:rockgrinder'
const BOYZ = 'B:boyz-a', DREAD = 'B:deff-dread'

function makeState(a: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GSC(a), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'gsc-weapons', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}
const modules = (): ModuleTable => ({
  ...DEFAULT_MODULES,
  services: {
    ...DEFAULT_MODULES.services,
    stratagems: recordingStratagems(),
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
  },
})
const SIX = Array.from({ length: 200 }, () => 6)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const target = (modelId: string, weaponId: string, targetUnitId: string): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks: null })
const holder = (s: GameState, unitId: string, weaponId: string): string => s.units[unitId].models.find((id) => s.models[id].weapons.includes(weaponId))!

function driveAttack(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without decision')
    const action = ('options' in pending && pending.options.length > 0 ? pending.options[0].action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}
// one attack sequence by one model; `dice` are the scripted rolls in order, then plain sixes
function attack(s: GameState, kind: 'ranged' | 'melee', dice: number[], attackerUnit: string, modelId: string, weaponIds: string[], targetUnit: string): GameEvent[] {
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...SIX]), modules())
  attackService.begin(ctx, { kind, overwatch: false, targets: weaponIds.map((w) => target(modelId, w, targetUnit)), attackerUnitId: attackerUnit })
  driveAttack(ctx)
  return events
}
// keeps one model of an enemy unit and puts it `gap` inches (edge to edge) in front of `from`, on the +x side
function enemyAt(s: GameState, unitId: string, from: string, gap: number): string {
  const keep = s.units[unitId].models[0]
  for (const id of s.units[unitId].models.slice(1)) removeModel(s, id)
  const m = s.models[from]
  s.units[unitId].location = 'board'
  s.models[keep].pos = { x: m.pos.x + m.base.radius + s.models[keep].base.radius + gap, y: 0, z: m.pos.z }
  return keep
}
function ctxOf(s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } { return createContext(s, new ScriptedRng(dice), modules()) }
const rollCtx = (): RollContext => {
  const roll: DiceRoll = { id: 'r:x', purpose: 'hit', sides: 6, dice: [3], rerolled: null, modifiers: [], final: [3], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose: 'hit', roll, dieIndex: 0, unmodified: 3, rerolled: false }
}
// total hit-roll modifier the hooks give `modelId` firing `wid` at the Boyz
function hitModifier(s: GameState, kind: 'ranged' | 'melee', modelId: string, wid: string): number {
  const a: AttackContext = {
    kind, overwatch: false, attackerUnitId: s.models[modelId].unitId, attackerModelId: modelId, weapon: weaponService.effectiveWeapon(s, modelId, wid), targetUnitId: BOYZ,
    targetModelId: s.units[BOYZ].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: kind === 'melee',
  }
  return hookService.collect(ctxOf(s).ctx, 'onHitRoll', { attack: a, roll: rollCtx() } as never).reduce((n, { result }) => n + (result.kind === 'roll' ? (result.modifier ?? 0) : 0), 0)
}

describe('Psionic Shield and Resonance Stave (GEN-018, GEN-019)', () => {
  // the Orks (B) shoot / fight the Cult unit; scripted dice are hit 6, wound 6, then a save die. Returns the lowest save die
  // that passes, i.e. the save target number actually in force (7 when nothing saves)
  const saveTarget = (mk: () => GameState, kind: 'ranged' | 'melee', ap: number, targetUnit: string): number => {
    for (let die = 2; die <= 6; die++) {
      const s = mk()
      const wid = kind === 'ranged' ? 'ork.w.shoota' : 'ork.w.choppa'
      s.weapons = { ...s.weapons, [wid]: { ...s.weapons[wid], A: 1, AP: ap } }
      placeUnit(s, targetUnit, s.units[targetUnit].models.map((_, i): [number, number] => [-12 - i * 1.2, 0]))
      placeUnit(s, BOYZ, [[0, 0]])
      s.activePlayer = 'B'
      const ev = attack(s, kind, [6, 6, die], BOYZ, s.units[BOYZ].models[0], [wid], targetUnit)
      const save = of(ev, 'SaveRolled')[0]
      if (save.saved) return die
    }
    return 7
  }
  const led = (): GameState => makeState()

  it('GEN-018 Psionic Shield: a Magus-led Neophyte unit saves AP 0 ranged on 4+ and AP -1 ranged on 5+', () => {
    expect(saveTarget(led, 'ranged', 0, NEO)).toBe(4)
    expect(saveTarget(led, 'ranged', -1, NEO)).toBe(5)
  })

  it('GEN-018 Psionic Shield: melee saves are unchanged (5+ at AP 0, 6+ at AP -1)', () => {
    expect(saveTarget(led, 'melee', 0, NEO)).toBe(5)
    expect(saveTarget(led, 'melee', -1, NEO)).toBe(6)
  })

  it('GEN-018 Psionic Shield: no bonus while the Magus stands alone (5+), and none without the enhancement (5+)', () => {
    expect(saveTarget(() => makeState({ attachments: [] }), 'ranged', 0, MAGUS)).toBe(5)
    expect(saveTarget(() => makeState({ enhancementId: 'gsc.e.resonance-stave' }), 'ranged', 0, NEO)).toBe(5)
  })

  // the Magus (stave A3, S5, AP -1, D3) fights Orks; scripted dice: 3 hits, then 3 wound dice of 5
  const stave = (enh: string, targetUnit: string): GameEvent[] => {
    const s = makeState({ enhancementId: enh, attachments: [] })
    const mm = s.units[MAGUS].models[0]
    placeUnit(s, MAGUS, [[0, 0]])
    enemyAt(s, targetUnit, mm, 0.5)
    return attack(s, 'melee', [6, 6, 6, 5, 5, 5], MAGUS, mm, ['gsc.w.magus-stave'], targetUnit)
  }
  it('GEN-019 Resonance Stave: a 5 against INFANTRY is a critical wound and Devastating Wounds makes it mortal wounds', () => {
    const ev = stave('gsc.e.resonance-stave', BOYZ)
    const wounds = of(ev, 'WoundRolled')
    expect(wounds).toHaveLength(3)
    expect(wounds.every((w) => w.wounded && w.critical)).toBe(true)
    expect(of(ev, 'SaveRolled')).toHaveLength(0)
    expect(of(ev, 'DamageApplied').some((d) => d.mortal)).toBe(true)
  })
  it('GEN-019 Resonance Stave: against a VEHICLE a 5 wounds normally (no critical, no mortal wounds), and without the enhancement a 5 against INFANTRY is an ordinary roll', () => {
    const veh = stave('gsc.e.resonance-stave', DREAD)
    expect(of(veh, 'WoundRolled').every((w) => w.wounded && !w.critical)).toBe(true)
    expect(of(veh, 'DamageApplied').filter((d) => d.mortal)).toHaveLength(0)
    const plain = stave('gsc.e.psionic-shield', BOYZ)
    expect(of(plain, 'WoundRolled').every((w) => !w.critical)).toBe(true)
    expect(of(plain, 'DamageApplied').filter((d) => d.mortal)).toHaveLength(0)
  })
})

describe('demolition charges, Hypermorph tail, Rockgrinder (GEN-032 to GEN-036)', () => {
  const entries = (s: GameState, unitId: string): string[] => buildShootingWeaponEntries(ctxOf(s).ctx, unitId).map((e) => e.weaponId)

  it('GEN-032 demolition charges are One Shot and Hazardous: fired once, then gone from the options, and the bearer takes a Hazardous test', () => {
    const s = makeState({ attachments: [] })
    placeUnit(s, ACO, s.units[ACO].models.map((_, i): [number, number] => [-30 + i * 1.3, 0]))
    const m = holder(s, ACO, 'gsc.w.demolition-charges')
    s.models[m].pos = { x: 0, y: 0, z: 0 }
    enemyAt(s, BOYZ, m, 2)
    const abilities = hookService.weaponAbilitiesFor(s, m, s.weapons['gsc.w.demolition-charges']).map((a) => a.ability)
    expect(abilities).toEqual(expect.arrayContaining(['ONE_SHOT', 'HAZARDOUS', 'BLAST', 'ASSAULT']))
    expect(entries(s, ACO)).toContain('gsc.w.demolition-charges')
    const ev = attack(s, 'ranged', [], ACO, m, ['gsc.w.demolition-charges'], BOYZ)
    expect(of(ev, 'HazardousTested').some((h) => h.weaponId === 'gsc.w.demolition-charges')).toBe(true)
    expect(s.models[m].oneShotUsed).toContain('gsc.w.demolition-charges')
    expect(entries(s, ACO)).not.toContain('gsc.w.demolition-charges')
  })

  it('GEN-032 the Rockgrinder cache is Hazardous but not One Shot: it fires again every turn', () => {
    const s = makeState()
    placeUnit(s, ROCK, [[0, 0]])
    const m = s.units[ROCK].models[0]
    enemyAt(s, BOYZ, m, 2)
    const abilities = hookService.weaponAbilitiesFor(s, m, s.weapons['gsc.w.demolition-charge-cache']).map((a) => a.ability)
    expect(abilities).toContain('HAZARDOUS')
    expect(abilities).not.toContain('ONE_SHOT')
    for (let i = 0; i < 2; i++) {
      expect(entries(s, ROCK)).toContain('gsc.w.demolition-charge-cache')
      const ev = attack(s, 'ranged', [], ROCK, m, ['gsc.w.demolition-charge-cache'], BOYZ)
      expect(of(ev, 'HazardousTested').some((h) => h.weaponId === 'gsc.w.demolition-charge-cache')).toBe(true)
    }
    expect(s.models[m].oneShotUsed).toEqual([])
  })

  it('GEN-033 the Hypermorph fights with the heavy improvised weapon (5 attacks) and the tail (1 Extra Attack): 6 attack rolls', () => {
    const s = makeState()
    const hyper = holder(s, ABB, 'gsc.w.hypermorph-tail')
    expect(s.models[hyper].weapons).toEqual(expect.arrayContaining(['gsc.w.heavy-improvised-weapon', 'gsc.w.hypermorph-tail']))
    expect(hookService.weaponAbilitiesFor(s, hyper, s.weapons['gsc.w.hypermorph-tail']).map((a) => a.ability)).toContain('EXTRA_ATTACKS')
    expect(weaponService.effectiveWeapon(s, hyper, 'gsc.w.heavy-improvised-weapon').A).toBe(5)
    expect(weaponService.effectiveWeapon(s, hyper, 'gsc.w.hypermorph-tail').A).toBe(1)
    placeUnit(s, ABB, [[0, 0]])
    enemyAt(s, BOYZ, hyper, 0.5)
    const ev = attack(s, 'melee', [], ABB, hyper, ['gsc.w.heavy-improvised-weapon', 'gsc.w.hypermorph-tail'], BOYZ)
    const hits = of(ev, 'HitRolled').filter((h) => h.attack.attackerModelId === hyper)
    expect(hits.filter((h) => h.attack.weaponId === 'gsc.w.heavy-improvised-weapon')).toHaveLength(5)
    expect(hits.filter((h) => h.attack.weaponId === 'gsc.w.hypermorph-tail')).toHaveLength(1)
  })

  it('GEN-034 Rockgrinder Damaged: -1 to hit at 3 wounds, none at 4', () => {
    const s = makeState()
    placeUnit(s, ROCK, [[0, 0]])
    const m = s.units[ROCK].models[0]
    const ranged = s.models[m].weapons.find((w) => s.weapons[w].kind === 'ranged')!
    const melee = s.models[m].weapons.find((w) => s.weapons[w].kind === 'melee')!
    s.models[m].woundsRemaining = 4
    expect(hitModifier(s, 'ranged', m, ranged)).toBe(0)
    expect(hitModifier(s, 'melee', m, melee)).toBe(0)
    s.models[m].woundsRemaining = 3
    expect(hitModifier(s, 'ranged', m, ranged)).toBe(-1)
    expect(hitModifier(s, 'melee', m, melee)).toBe(-1)
  })

  it('GEN-034 Rockgrinder Deadly Demise D3: a 6 deals D3 mortal wounds to units within 6", a 5 deals none', () => {
    for (const [dice, expected] of [[[6, 4], 2], [[5], 0]] as [number[], number][]) {
      const s = makeState()
      placeUnit(s, ROCK, [[0, 0]])
      const rock = s.units[ROCK].models[0]
      enemyAt(s, BOYZ, rock, 2)
      const queued: { unitId: string; count: number }[] = []
      const spy = vi.spyOn(attackService, 'queueMortalWounds').mockImplementation((_c, unitId, count) => { queued.push({ unitId, count }) })
      try {
        const { ctx, events } = createContext(s, new ScriptedRng(dice), modules())
        attackService.destroyModel(ctx, rock, { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
        expect(of(events, 'DeadlyDemiseRolled')[0]).toMatchObject({ exploded: expected > 0 })
        expect(queued.filter((q) => q.unitId === BOYZ)).toEqual(expected > 0 ? [{ unitId: BOYZ, count: expected }] : [])
      } finally { spy.mockRestore() }
    }
  })

  it('GEN-035 Deep Strike: Magus, Neophytes and Acolytes may start in Reserves; Aberrants and the Rockgrinder may not', () => {
    const start = (reserves: string[], attachments: PlayerSetup['attachments'] = []) => {
      const setup: GameSetup = {
        missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GSC({ reserves, attachments }), B: ORK() },
        sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
      }
      return createGameState(setup, bundle, 'gsc-reserves', ENGINE_VERSION)
    }
    expect(() => start(['magus'])).not.toThrow()
    expect(() => start(['neophytes-a'])).not.toThrow()
    expect(() => start(['acolytes'])).not.toThrow()
    expect(() => start(['magus', 'neophytes-a'], [{ leaderRef: 'magus', bodyguardRef: 'neophytes-a' }])).not.toThrow()
    expect(() => start(['aberrants'])).toThrow(EngineInvariantError)
    expect(() => start(['rockgrinder'])).toThrow(EngineInvariantError)
  })

  it('GEN-036 the Rockgrinder (Firing Deck, no TRANSPORT) has no capacity: no friendly unit can embark in it', () => {
    const s = makeState({ attachments: [] })
    s.phase = 'movement'
    placeUnit(s, ROCK, [[0, 0]])
    placeUnit(s, ACO, s.units[ACO].models.map((_, i): [number, number] => [-2 + i * 0.1, 0.5]))
    expect(transportService.capacity(s, ROCK)).toBe(0)
    for (const id of [MAGUS, NEO, ACO, ABB, 'A:neophytes-b']) expect(transportService.canEmbark(s, id, ROCK)).toBe(false)
  })
})

describe('Neophyte weapons (GEN-037)', () => {
  function neoWithEnemy(gap: number): { s: GameState; m: string } {
    const s = makeState({ attachments: [] })
    placeUnit(s, NEO, s.units[NEO].models.map((_, i): [number, number] => [-30 + (i % 5) * 1.2, Math.floor(i / 5) * 1.2]))
    const m = holder(s, NEO, 'gsc.w.seismic-cannon')
    s.models[m].pos = { x: 0, y: 0, z: 0 }
    enemyAt(s, BOYZ, m, gap)
    return { s, m }
  }

  it('GEN-037 seismic cannon: Heavy gives +1 to hit when the unit Remained Stationary, nothing when it moved', () => {
    const hit = (moveType: 'stationary' | 'normal'): boolean => {
      const { s, m } = neoWithEnemy(8)
      expect(hookService.weaponAbilitiesFor(s, m, s.weapons['gsc.w.seismic-cannon']).map((a) => a.ability)).toEqual(expect.arrayContaining(['HEAVY', 'RAPID_FIRE']))
      s.units[NEO].turn.moveType = moveType
      // BS 5+: an unmodified 4 only hits with the +1
      return of(attack(s, 'ranged', [4, 4, 4, 4, 4, 4], NEO, m, ['gsc.w.seismic-cannon'], BOYZ), 'HitRolled')[0].hit
    }
    expect(hit('stationary')).toBe(true)
    expect(hit('normal')).toBe(false)
  })

  it('GEN-037 seismic cannon: Rapid Fire 2 adds 2 attacks at 12" or less (6) but not beyond (4)', () => {
    const near = neoWithEnemy(11.5)
    expect(of(attack(near.s, 'ranged', [], NEO, near.m, ['gsc.w.seismic-cannon'], BOYZ), 'HitRolled')).toHaveLength(6)
    const far = neoWithEnemy(14)
    expect(of(attack(far.s, 'ranged', [], NEO, far.m, ['gsc.w.seismic-cannon'], BOYZ), 'HitRolled')).toHaveLength(4)
  })

  it('GEN-037 webber: Torrent auto-hits D6 times and Devastating Wounds turns a critical wound into mortal wounds (no save)', () => {
    const { s } = neoWithEnemy(5)
    const w = holder(s, NEO, 'gsc.w.webber')
    s.models[w].pos = { x: s.models[s.units[BOYZ].models[0]].pos.x - 3, y: 0, z: 1.5 }
    const abilities = hookService.weaponAbilitiesFor(s, w, s.weapons['gsc.w.webber']).map((a) => a.ability)
    expect(abilities).toEqual(expect.arrayContaining(['TORRENT', 'DEVASTATING_WOUNDS']))
    // D6 = 3 attacks, all auto hits, wound dice 6 (S2 against T5 only wounds on a critical 6)
    const ev = attack(s, 'ranged', [3], NEO, w, ['gsc.w.webber'], BOYZ)
    const hits = of(ev, 'HitRolled')
    expect(hits).toHaveLength(3)
    expect(hits.every((h) => h.auto && h.hit)).toBe(true)
    expect(of(ev, 'SaveRolled')).toHaveLength(0)
    expect(of(ev, 'DamageApplied').some((d) => d.mortal)).toBe(true)
  })

  it('GEN-037 clearance incinerator: Torrent (2D6 auto-hits) and Ignores Cover', () => {
    const s = makeState()
    placeUnit(s, ROCK, [[0, 0]])
    const m = s.units[ROCK].models[0]
    enemyAt(s, BOYZ, m, 4)
    const abilities = hookService.weaponAbilitiesFor(s, m, s.weapons['gsc.w.clearance-incinerator']).map((a) => a.ability)
    expect(abilities).toEqual(expect.arrayContaining(['TORRENT', 'IGNORES_COVER']))
    const ev = attack(s, 'ranged', [3, 4], ROCK, m, ['gsc.w.clearance-incinerator'], BOYZ)
    const hits = of(ev, 'HitRolled')
    expect(hits).toHaveLength(7)
    expect(hits.every((h) => h.auto && h.hit)).toBe(true)
  })
})
