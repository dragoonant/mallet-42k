// engine/hooks: descriptor evaluation, leaders / attached units, enhancements, faction abilities (real Combat Patrol data)
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle, Effect } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, EngineInvariantError, ScriptedRng, createContext, createGameState, removeModel, unitModelsForCoherency,
  type Action, type AttackContext, type DiceRoll, type GameSetup, type GameState, type ModuleTable, type PlayerSetup, type RollContext,
  type Services, type UseStratagemAction, emptyPhaseState,
} from '../../src/engine'
import { eligibleToShootNow } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { evaluateCondition, hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { pendingReactions, stratagemService } from '../../src/engine/stratagems'
import { makeSetup, placeUnit, withBundle } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'SM', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.wrath-of-the-emperor',
  attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const T = 'A:terminator-squad', CAP = 'A:captain-octavius', LIB = 'A:librarian-tantus', INF = 'A:infernus-squad'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss', KOPTAS = 'B:deffkoptas', DREAD = 'B:deff-dread'

function makeState(a: Partial<PlayerSetup> = {}, b: Partial<PlayerSetup> = {}, placeAll = true): GameState {
  const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM(a), B: ORK(b) }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
  const s = createGameState(setup, bundle, 'hooks', ENGINE_VERSION)
  s.round = 2
  s.phase = 'command'
  s.step = 'command'
  if (placeAll) {
    placeUnit(s, T, { x: -4, z: -3 })
    placeUnit(s, CAP, [[-6.5, -3]])
    placeUnit(s, LIB, [[-14, -9]])
    placeUnit(s, INF, { x: 8, z: -9 })
    placeUnit(s, BOYZ, { x: -6, z: 6, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: -6, z: 12, gap: 0.3 })
    placeUnit(s, BOSS, [[16, 12]])
    placeUnit(s, KOPTAS, { x: 12, z: 3, gap: 1 })
    placeUnit(s, DREAD, [[18, -2]])
  }
  return s
}

function harness(state: GameState, dice: number[] = []) {
  const mortal: { target: string; count: number; source: string }[] = []
  const services: Services = {
    ...DEFAULT_MODULES.services, hooks: hookService, effects: effectService, stratagems: stratagemService, leaders: leaderService,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: (_c, target, count, source) => { mortal.push({ target, count, source }) }, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined },
  }
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  const answer = (a: Record<string, unknown> & { type: Action['type'] }) => {
    const pending = state.pending!
    const action = { ...a, player: pending.player, decisionId: pending.id } as Action
    const owner = pending.kind === 'chooseOption' ? hookService.handler : stratagemService
    const rej = owner.validate?.(state, action, pending)
    if (rej) return rej
    state.pending = null
    return owner.handle(ctx, action, pending) ?? null
  }
  return { ctx, events, mortal, answer }
}

function attack(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string, over: Partial<AttackContext> = {}): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false, ...over,
  }
}

function rollOf(unmodified: number, purpose: DiceRoll['purpose'] = 'hit'): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}

const ocOf = (s: GameState, modelId: string) => hookService.statFor(s, { unitId: s.models[modelId].unitId, modelId, weapon: null, stat: 'OC' }, 1)
const kinds = (xs: { result: { kind: string } }[]) => xs.map((x) => x.result)

describe('engine/hooks — leaders and attached units (LEAD)', () => {
  it('LEAD-001 Captain attaches to the Terminators as one unit of 6; the Librarian cannot also attach', () => {
    const s = makeState()
    expect(s.units[T].attachedLeaderId).toBe(CAP)
    expect(s.units[CAP].bodyguardUnitId).toBe(T)
    expect(leaderService.combinedModels(s, T)).toHaveLength(6)
    expect(leaderService.startingStrength(s, T)).toBe(6)
    expect(leaderService.startingStrength(s, CAP)).toBe(6)
    expect(leaderService.canAttach(s, LIB, T)).toBe(false)
    expect(leaderService.attachOptions(s, 'A')).toEqual([])
    expect(() => makeState({ attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }, { leaderRef: 'librarian-tantus', bodyguardRef: 'terminator-squad' }] })).toThrow(EngineInvariantError)
  })

  it('LEAD-002 Librarian attaches instead → the Captain is a separate unit', () => {
    const s = makeState({ attachments: [{ leaderRef: 'librarian-tantus', bodyguardRef: 'terminator-squad' }] })
    expect(s.units[T].attachedLeaderId).toBe(LIB)
    expect(leaderService.isAttached(s, CAP)).toBe(false)
    expect(leaderService.combinedModels(s, CAP)).toHaveLength(1)
    expect(leaderService.canAttach(s, CAP, T)).toBe(false)
    const free = makeState({ attachments: [] })
    expect(leaderService.attachOptions(free, 'A')).toEqual([
      { leaderUnitId: CAP, bodyguardUnitIds: [T] },
      { leaderUnitId: LIB, bodyguardUnitIds: [T] },
    ])
  })

  it('LEAD-003 Gordrang has no Leader ability → no attach option; setup attaching him throws', () => {
    const s = makeState()
    expect(leaderService.attachOptions(s, 'B')).toEqual([])
    expect(leaderService.canAttach(s, BOSS, BOYZ)).toBe(false)
    expect(() => makeState({}, { attachments: [{ leaderRef: 'warboss', bodyguardRef: 'boyz-a' }] })).toThrow(EngineInvariantError)
  })

  it('LEAD-004 the attached unit is one unit: coherency set, halves, and a single stratagem target option', () => {
    const s = makeState()
    expect(unitModelsForCoherency(s, T).map((m) => m.id)).toEqual([...s.units[T].models, ...s.units[CAP].models])
    expect(leaderService.halves(s, CAP)).toEqual([T, CAP])
    expect(leaderService.sameUnit(s, CAP, T)).toBe(true)
    expect(leaderService.canonicalUnitId(s, CAP)).toBe(T)
    s.phase = 'fight'
    s.players.A.cp = 1
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: 'B', counterOffensive: false }
    const vi = stratagemService.options(s, 'A', 'fight.start', {}).filter((a) => a.stratagemId === 'sm.s.veteran-instincts').map((a) => a.targets.unitIds)
    expect(vi).toEqual([[LIB], [T]])
  })

  it('LEAD-005 attacks against an attached unit use the bodyguard T (either unit id)', () => {
    const s = makeState()
    expect(leaderService.toughnessFor(s, CAP)).toBe(5)
    const b = withBundle((x) => { x.datasheets['red.boss'].stats.T = 6 })
    const f = createGameState(makeSetup(), b, 'lead5', ENGINE_VERSION)
    expect(leaderService.toughnessFor(f, 'A:boss')).toBe(4)
    expect(leaderService.toughnessFor(f, 'A:grunts')).toBe(4)
    const atk: AttackContext = { ...attack(f, 'B:mob#0', 'blu.w.choppa', 'A:boss'), weapon: { ...f.weapons['blu.w.choppa'], S: 5 } }
    expect(evaluateCondition({ state: f, holder: null, player: 'B', attack: atk, roll: null, weapon: null }, { strengthVsToughness: 'gt' })).toBe(true)
  })

  it('LEAD-006 bodyguard destroyed → leader becomes its own unit (SS 1); only LeaderDetached, no UnitDestroyed from the split', () => {
    const s = makeState()
    const { ctx, events } = harness(s)
    for (const id of [...s.units[T].models]) removeModel(s, id)
    expect(s.units[T].location).toBe('destroyed')
    leaderService.detach(ctx, T)
    expect(events.map((e) => e.type)).toEqual(['LeaderDetached'])
    expect(events[0]).toMatchObject({ leaderId: CAP, bodyguardId: T, survivor: CAP })
    expect(s.units[CAP].bodyguardUnitId).toBeNull()
    expect(leaderService.startingStrength(s, CAP)).toBe(1)
    expect(leaderService.isBelowHalfStrength(s, CAP)).toBe(false)
  })

  it('LEAD-007 leader destroyed → bodyguard continues with SS 5; the CHARACTER unit counts as destroyed', () => {
    const s = makeState()
    const { ctx, events } = harness(s)
    removeModel(s, s.units[CAP].models[0])
    leaderService.detach(ctx, CAP)
    expect(events[0]).toMatchObject({ type: 'LeaderDetached', survivor: T })
    expect(leaderService.startingStrength(s, T)).toBe(5)
    expect(leaderService.isCharacterUnitDestroyed(s, CAP)).toBe(true)
  })

  it('LEAD-008 destroying only the bodyguard does not satisfy "destroyed a CHARACTER unit"', () => {
    const s = makeState()
    for (const id of [...s.units[T].models]) removeModel(s, id)
    expect(leaderService.isCharacterUnitDestroyed(s, T)).toBe(false)
    expect(leaderService.isCharacterUnitDestroyed(s, CAP)).toBe(false)
  })

  it('LEAD-009 a persisting effect on the attached unit keeps applying to the surviving half after the split', () => {
    const s = makeState()
    s.phase = 'shooting'
    s.activePlayer = 'B'
    const { ctx } = harness(s)
    const gw = s.stratagems['sm.s.gene-wrought-resilience']
    effectService.grant(ctx, T, gw.effect!, { sourceAbilityId: gw.id, sourceUnitId: T, scope: gw.scope!, duration: 'untilEndOfPhase', when: gw.when })
    const vsCaptain = () => hookService.collect(ctx, 'onWoundRoll', { attack: attack(s, 'B:deff-dread#0', 'ork.w.rokkit-launcha', CAP), roll: rollOf(4, 'wound') })
    expect(kinds(vsCaptain())).toEqual([{ kind: 'roll', modifier: -1 }])
    for (const id of [...s.units[T].models]) removeModel(s, id)
    leaderService.detach(ctx, T)
    expect(s.units[CAP].effects.map((e) => e.sourceAbilityId)).toEqual([gw.id])
    expect(kinds(vsCaptain())).toEqual([{ kind: 'roll', modifier: -1 }])

    const s2 = makeState()
    const h2 = harness(s2)
    effectService.grant(h2.ctx, CAP, gw.effect!, { sourceAbilityId: gw.id, sourceUnitId: CAP, scope: gw.scope!, duration: 'untilEndOfPhase', when: gw.when })
    removeModel(s2, s2.units[CAP].models[0])
    leaderService.detach(h2.ctx, CAP)
    expect(kinds(hookService.collect(h2.ctx, 'onWoundRoll', { attack: attack(s2, 'B:deff-dread#0', 'ork.w.rokkit-launcha', T), roll: rollOf(4, 'wound') }))).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(effectService.activeFor(s2, T)).toHaveLength(1)
  })

  it('LEAD-010 attached unit below half-strength is judged once for the whole unit (SS 6)', () => {
    const s = makeState()
    const terms = s.units[T].models
    removeModel(s, terms[4]); removeModel(s, terms[3]); removeModel(s, terms[2])
    expect(leaderService.isBelowHalfStrength(s, T)).toBe(false) // 3 of 6
    removeModel(s, terms[1])
    expect(leaderService.isBelowHalfStrength(s, T)).toBe(true) // 2 of 6
    expect(leaderService.isBelowHalfStrength(s, CAP)).toBe(true)
  })

  it('LEAD-011 Oathsworn Determination: Captain + 5 Terminators → LoC 12; Captain alone → 2', () => {
    const s = makeState({ enhancementId: 'sm.e.oathsworn-determination' })
    const all = leaderService.combinedModels(s, T)
    expect(all.reduce((n, m) => n + ocOf(s, m.id), 0)).toBe(12)
    const alone = makeState({ enhancementId: 'sm.e.oathsworn-determination', attachments: [] })
    expect(ocOf(alone, alone.units[CAP].models[0])).toBe(2)
    expect(alone.units[T].models.reduce((n, id) => n + ocOf(alone, id), 0)).toBe(5)
  })

  it('LEAD-012 Veil of Time: Tantus leading the Terminators grants their weapons Sustained Hits 1; lost once Tantus dies', () => {
    const s = makeState({ attachments: [{ leaderRef: 'librarian-tantus', bodyguardRef: 'terminator-squad' }] })
    const term = s.units[T].models[2]
    const sh = (st: GameState, w: string) => hookService.weaponAbilitiesFor(st, term, st.weapons[w]).filter((a) => a.ability === 'SUSTAINED_HITS')
    expect(sh(s, 'sm.w.storm-bolter')).toEqual([{ ability: 'SUSTAINED_HITS', value: 1 }])
    expect(sh(s, 'sm.w.power-fist')).toEqual([{ ability: 'SUSTAINED_HITS', value: 1 }])
    const { ctx } = harness(s)
    removeModel(s, s.units[LIB].models[0])
    leaderService.detach(ctx, LIB)
    expect(sh(s, 'sm.w.storm-bolter')).toEqual([])
    const unled = makeState()
    expect(hookService.weaponAbilitiesFor(unled, unled.units[T].models[2], unled.weapons['sm.w.power-fist']).some((a) => a.ability === 'SUSTAINED_HITS')).toBe(false)
  })

  it('LEAD-013 Precision against an attached unit when the CHARACTER is not visible → normal allocation pool', () => {
    const s = makeState()
    const cap = s.units[CAP].models[0]
    expect(leaderService.allocatableModels(s, T)).not.toContain(cap)
    expect(leaderService.allocatableModels(s, T, { precision: true, visibleCharacterIds: [] })).not.toContain(cap)
    expect(leaderService.allocatableModels(s, T, { precision: true, visibleCharacterIds: [cap] })).toContain(cap)
    expect(leaderService.allocatableModels(s, T, { precision: false, visibleCharacterIds: [cap] })).not.toContain(cap)
  })

  it('LEAD-014 once the last bodyguard model is gone the CHARACTER can take the remaining wounds', () => {
    const s = makeState()
    for (const id of [...s.units[T].models]) removeModel(s, id)
    expect(leaderService.allocatableModels(s, T)).toEqual([s.units[CAP].models[0]])
  })

  it('LEAD-015 Champion Duellist: Precision applies to every melee weapon of the bearer without Epic Challenge', () => {
    const s = makeState()
    const cap = s.units[CAP].models[0]
    const names = (w: string) => hookService.weaponAbilitiesFor(s, cap, s.weapons[w]).map((a) => a.ability)
    expect(names('sm.w.relic-weapon')).toEqual(expect.arrayContaining(['PRECISION', 'LETHAL_HITS']))
    expect(names('sm.w.storm-bolter-captain')).not.toContain('PRECISION')
    expect(s.units[CAP].effects).toEqual([])
  })

  it('LEAD-016 bearer vs self scope: relic weapon gains Lethal Hits + Precision, Terminator fists neither; Oathsworn gives every model OC 2', () => {
    const s = makeState()
    const fist = hookService.weaponAbilitiesFor(s, s.units[T].models[1], s.weapons['sm.w.power-fist']).map((a) => a.ability)
    expect(fist).not.toContain('PRECISION')
    expect(fist).not.toContain('LETHAL_HITS')
    const o = makeState({ enhancementId: 'sm.e.oathsworn-determination' })
    expect(leaderService.combinedModels(o, T).map((m) => ocOf(o, m.id))).toEqual([2, 2, 2, 2, 2, 2])
    expect(ocOf(o, o.units[INF].models[0])).toBe(1)
  })
})

describe('engine/hooks — faction abilities, enhancements, code hooks', () => {
  it('CMD-021 Oath of Moment: pick at command.start; attacks by SM models against the target may re-roll hits', () => {
    const s = makeState()
    s.activePlayer = 'A'
    const { ctx, answer, events } = harness(s)
    hookService.onWindow(ctx, 'command.start', 'start')
    expect(s.pending).toMatchObject({ kind: 'chooseOption', player: 'A', context: { topic: 'oathTarget' } })
    const opts = (s.pending as { options: { id: string }[] }).options.map((o) => o.id)
    expect(opts).toEqual([BOSS, BOYZ, BOYZ2, KOPTAS, DREAD])
    expect(answer({ type: 'chooseOption', optionId: BOYZ })).toBeNull()
    expect(s.players.A.oathTargetUnitId).toBe(BOYZ)
    expect(events.some((e) => e.type === 'OathTargetChosen')).toBe(true)
    const infernus = hookService.collect(ctx, 'onHitRoll', { attack: attack(s, 'A:infernus-squad#0', 'sm.w.bolt-pistol', BOYZ), roll: rollOf(2) })
    expect(kinds(infernus)).toEqual([{ kind: 'roll', reroll: 'all' }])
    expect(hookService.collect(ctx, 'onHitRoll', { attack: attack(s, 'A:infernus-squad#0', 'sm.w.bolt-pistol', BOYZ2), roll: rollOf(2) })).toEqual([])
    // a second visit of the same window does not re-offer the pick
    hookService.onWindow(ctx, 'command.start', 'start')
    expect(s.pending).toBeNull()
  })

  it('WEAP-038 Fury of the First: a Terminator attacking the Oath target has the hit re-roll and +1 to hit', () => {
    const s = makeState()
    s.players.A.oathTargetUnitId = BOYZ
    const { ctx } = harness(s)
    const r = kinds(hookService.collect(ctx, 'onHitRoll', { attack: attack(s, 'A:terminator-squad#2', 'sm.w.storm-bolter', BOYZ), roll: rollOf(3) }))
    expect(r).toEqual(expect.arrayContaining([{ kind: 'roll', reroll: 'all' }, { kind: 'roll', modifier: 1 }]))
    expect(r).toHaveLength(2)
    expect(hookService.collect(ctx, 'onWoundRoll', { attack: attack(s, 'A:terminator-squad#2', 'sm.w.storm-bolter', BOYZ), roll: rollOf(3, 'wound') })).toEqual([])
  })

  it('WEAP-039 Unstoppable Valour: the Captain\'s unit may re-roll its charge roll; the Terminators alone may not', () => {
    const s = makeState()
    const { ctx } = harness(s)
    const data = (unit: string) => ({ chargingUnitId: unit, targetUnitIds: [BOYZ], roll: rollOf(4, 'charge') })
    expect(kinds(hookService.collect(ctx, 'onChargeRoll', data(T)))).toEqual([{ kind: 'roll', reroll: 'all' }])
    const alone = makeState({ attachments: [] })
    expect(hookService.collect(harness(alone).ctx, 'onChargeRoll', data(T))).toEqual([])
  })

  it('WEAP-033 Waaagh! is called in the round.start window; effects last until the end of the round', () => {
    const s = makeState()
    s.round = 3
    const { ctx, answer, events } = harness(s)
    hookService.onWindow(ctx, 'round.start', '3')
    expect(s.pending).toMatchObject({ kind: 'chooseOption', player: 'B', window: 'round.start', context: { topic: 'waaagh' } })
    expect(answer({ type: 'chooseOption', optionId: 'call' })).toBeNull()
    expect(events.some((e) => e.type === 'WaaaghCalled')).toBe(true)
    expect(s.units[BOYZ].effects[0].expires.kind).toBe('roundEnd')
    const boy = 'B:boyz-a#1'
    const choppa = s.weapons['ork.w.choppa']
    expect(hookService.statFor(s, { unitId: BOYZ, modelId: boy, weapon: choppa, stat: 'A' }, choppa.A as number)).toBe(4)
    expect(hookService.statFor(s, { unitId: BOYZ, modelId: boy, weapon: choppa, stat: 'S' }, choppa.S)).toBe(5)
    const slugga = s.weapons['ork.w.slugga']
    expect(hookService.statFor(s, { unitId: BOYZ, modelId: boy, weapon: slugga, stat: 'S' }, slugga.S)).toBe(4)
    const save = hookService.collect(ctx, 'onSaveRoll', { attack: attack(s, 'A:terminator-squad#0', 'sm.w.storm-bolter', BOYZ, { targetModelId: boy }), roll: rollOf(4, 'save') })
    expect(kinds(save)).toEqual([{ kind: 'roll', invuln: 5 }])
    s.units[BOYZ].turn.moveType = 'advance'
    expect(hookService.eligibilityFor(s, BOYZ, 'charge')).toBe(true)
    s.units[INF].turn.moveType = 'advance'
    expect(hookService.eligibilityFor(s, INF, 'charge')).toBe(false)
    effectService.expire(ctx, 'roundEnd', null)
    expect(events.filter((e) => e.type === 'EffectExpired').length).toBe(5)
    expect(hookService.statFor(s, { unitId: BOYZ, modelId: boy, weapon: choppa, stat: 'A' }, 3)).toBe(3)
  })

  it('WEAP-034 Waaagh! cannot be called twice; declining keeps it available for a later round', () => {
    const s = makeState()
    const { ctx, answer } = harness(s)
    hookService.onWindow(ctx, 'round.start', '2')
    answer({ type: 'chooseOption', optionId: 'wait' })
    expect(s.players.B.waaagh.used).toBe(false)
    s.round = 3
    hookService.onWindow(ctx, 'round.start', '3')
    answer({ type: 'chooseOption', optionId: 'call' })
    s.round = 4
    hookService.onWindow(ctx, 'round.start', '4')
    expect(s.pending).toBeNull()
    hookService.onWindow(ctx, 'command.start', 'start')
    expect(s.pending?.context).not.toMatchObject({ topic: 'waaagh' })
  })

  it('WEAP-036 Dead \'ard: Gordrang has Feel No Pain 4+ only while the Waaagh! is active', () => {
    const s = makeState()
    const { ctx } = harness(s)
    const fnp = () => kinds(hookService.collect(ctx, 'onFeelNoPainRoll', { attack: attack(s, 'A:terminator-squad#0', 'sm.w.storm-bolter', BOSS), roll: rollOf(4, 'fnp') }))
    expect(fnp()).toEqual([])
    s.players.B.waaagh = { used: true, activeRound: s.round }
    expect(fnp()).toEqual([{ kind: 'roll', feelNoPain: 4 }])
    s.round += 1
    expect(fnp()).toEqual([])
  })

  it('WEAP-037 Grizzled Skarboy halves ranged Damage allocated to the bearer only', () => {
    const s = makeState()
    const { ctx } = harness(s)
    const dmg = (weapon: string, target: string) => kinds(hookService.collect(ctx, 'onDamage', {
      attack: attack(s, 'A:terminator-squad#1', weapon, target), targetUnitId: target, targetModelId: s.units[target].models[0], damage: 3, mortal: false,
    }))
    expect(dmg('sm.w.assault-cannon', BOSS)).toEqual([{ kind: 'damage', halve: true }])
    expect(dmg('sm.w.power-fist', BOSS)).toEqual([])
    expect(dmg('sm.w.assault-cannon', BOYZ)).toEqual([])
  })

  it('CMD-016 Piston-driven Brutality: at the start of the Fight phase enemy units in ER of the Dread test; failure shocks the whole attached unit', () => {
    const s = makeState()
    s.phase = 'fight'
    s.activePlayer = 'B'
    placeUnit(s, DREAD, [[0, 0]])
    placeUnit(s, T, { x: -4, z: 2.47 })
    placeUnit(s, CAP, [[-7, 2.47]])
    placeUnit(s, INF, { x: -2, z: -2.31, gap: 0.5 })
    placeUnit(s, BOYZ, { x: -6, z: 10, gap: 0.3 })
    const { ctx, events } = harness(s, [3, 2, 6, 6])
    hookService.run(ctx, 'onPhaseStart', {})
    const tests = events.filter((e) => e.type === 'BattleShockTested')
    expect(tests.map((e) => [e.unitId, e.passed])).toEqual([[T, false], [INF, true]])
    expect(s.units[T].battleShocked && s.units[CAP].battleShocked).toBe(true)
    expect(s.units[INF].battleShocked).toBe(false)
    expect(s.units[T].battleShockExpiresRound).toBe(3)
  })

  it('FIGHT-029 Piston-driven Brutality tests each engaged enemy unit once, never the Dread, and only in the Fight phase', () => {
    const s = makeState()
    s.phase = 'shooting'
    placeUnit(s, DREAD, [[0, 0]])
    placeUnit(s, INF, { x: -2, z: -2.31, gap: 0.5 })
    const h = harness(s, [6, 6])
    hookService.run(h.ctx, 'onPhaseStart', {})
    expect(h.events.filter((e) => e.type === 'BattleShockTested')).toHaveLength(0)
    s.phase = 'fight'
    hookService.run(h.ctx, 'onPhaseStart', {})
    expect(h.events.filter((e) => e.type === 'BattleShockTested').map((e) => e.unitId)).toEqual([INF])
  })
})

describe('engine/hooks — stratagem code hooks (STRAT)', () => {
  it('STRAT-022 strengthVsToughness folds stat modifiers into both S (Waaagh!) and T (a modifyStat on the bodyguard)', () => {
    const s = makeState()
    const h = harness(s)
    const boy = `${BOYZ}#0`
    const choppa = s.weapons['ork.w.choppa']
    // choppa S4 vs Terminator T5 (either unit id of the attached pair) — base values, not gt
    const atk = attack(s, boy, 'ork.w.choppa', T, { targetModelId: s.units[T].models[0] })
    const atkViaLeaderId = attack(s, boy, 'ork.w.choppa', CAP, { targetModelId: s.units[T].models[0] })
    const env = (a: AttackContext) => ({ state: s, holder: null, player: 'B' as const, attack: a, roll: null, weapon: null })
    expect(evaluateCondition(env(atk), { strengthVsToughness: 'gt' })).toBe(false)

    // Waaagh! grants melee weapons +1 S; still equal (S5 vs T5), not gt — proves the modifier is folded, not skipped
    const w = s.abilities['ork.a.waaagh']
    effectService.grant(h.ctx, BOYZ, w.effect!, { sourceAbilityId: w.id, sourceUnitId: BOYZ, scope: { who: 'self' }, duration: 'untilEndOfRound' })
    expect(hookService.statFor(s, { unitId: BOYZ, modelId: boy, weapon: choppa, stat: 'S' }, choppa.S)).toBe(5)
    expect(evaluateCondition(env(atk), { strengthVsToughness: 'gt' })).toBe(false)
    expect(evaluateCondition(env(atk), { strengthVsToughness: 'gte' })).toBe(true)

    // a -1 T effect on the bodyguard (T) now makes the modified S(5) > modified T(4); works targeting either unit id
    // of the attached pair (R-10.1: T is always the bodyguard's)
    const debuff: Effect = { modifyStat: { stat: 'T', value: -1 } }
    effectService.grant(h.ctx, T, debuff, { sourceAbilityId: 'test.debuff', sourceUnitId: BOYZ, scope: { who: 'self' }, duration: 'untilEndOfRound' })
    expect(hookService.statFor(s, { unitId: T, modelId: s.units[T].models[0], weapon: null, stat: 'T' }, 5)).toBe(4)
    expect(evaluateCondition(env(atk), { strengthVsToughness: 'gt' })).toBe(true)
    expect(evaluateCondition(env(atkViaLeaderId), { strengthVsToughness: 'gt' })).toBe(true)
  })

  it('STRAT-019 eligibleToShootNow: an engaged unit may only fire as Overwatch if it is MONSTER/VEHICLE or has a Pistol (R-6.2/R-6.7)', () => {
    const s = makeState()
    // bring the Terminators (no Pistol weapons) and Boyz (sluggas, PISTOL) into Engagement Range of each other
    placeUnit(s, T, { x: -4, z: -3 })
    placeUnit(s, BOYZ, { x: -4, z: -3 + 0.787 * 2 + 0.5, gap: 0.3 })
    expect(leaderService.inEngagementWithEnemy!(s, T)).toBe(true)
    expect(leaderService.inEngagementWithEnemy!(s, BOYZ)).toBe(true)

    // out of Engagement Range: both are simply eligible if they have a ranged weapon
    placeUnit(s, BOYZ, { x: 20, z: 20, gap: 0.3 })
    expect(eligibleToShootNow(s, T)).toBe(true)
    expect(eligibleToShootNow(s, BOYZ)).toBe(true)

    // in Engagement Range: the Terminators (no Pistol) lose eligibility, the Boyz (sluggas) keep it
    placeUnit(s, BOYZ, { x: -4, z: -3 + 0.787 * 2 + 0.5, gap: 0.3 })
    expect(eligibleToShootNow(s, T)).toBe(false)
    expect(eligibleToShootNow(s, BOYZ)).toBe(true)

    // a MONSTER/VEHICLE stays eligible even engaged and without a Pistol (R-6.3)
    placeUnit(s, DREAD, [[-4 + 0.787 + 1.181 + 0.5, -3]])
    expect(leaderService.inEngagementWithEnemy!(s, DREAD)).toBe(true)
    expect(eligibleToShootNow(s, DREAD)).toBe(true)
  })
})

// ---- verification round 2 fixes (STRAT-005 Command Re-roll, LEAD-009, STRAT-019, CHARGE-023/STRAT-017) ----
const FO_ID = 'core.s.fire-overwatch', GW_ID = 'sm.s.gene-wrought-resilience', HI_ID = 'core.s.heroic-intervention'
const toPhase = (s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}) => {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])

describe('engine/hooks — verification round 2 fixes', () => {
  it('STRAT-005 (R-11.2): Command Re-roll is neither offered nor accepted for a roll made for your own Battle-shocked unit', () => {
    const s = makeState()
    toPhase(s, 'movement', 'A', { A: 1 })
    const h = harness(s, [2, 5, 2, 5])
    h.ctx.rollOnce('adv1', { purpose: 'advance', player: 'A', unitId: INF })
    expect(s.pending?.kind).toBe('commandReroll')
    const pending = s.pending!
    s.pending = null
    s.units[INF].battleShocked = true
    const roll = s.phaseState.lastRoll!
    expect(stratagemService.usable(s, 'A', 'any.rollMade', { rollId: roll.id })).toEqual([])
    const action = { type: 'commandReroll', player: 'A', decisionId: pending.id, rollId: roll.id } as Action
    expect(stratagemService.validate(s, action, pending)?.code).toBe('E_INVALID_TARGET')
    h.ctx.rollOnce('adv2', { purpose: 'advance', player: 'A', unitId: INF })
    expect(s.pending).toBeNull()
    // the attached pair: a Battle-shocked leader half blocks rolls made for the bodyguard id too
    s.units[INF].battleShocked = false
    s.units[CAP].battleShocked = true
    h.ctx.rollOnce('adv3', { purpose: 'advance', player: 'A', unitId: T })
    expect(s.pending).toBeNull()
  })

  it('LEAD-009 (R-10.1/R-1.7): a stratagem effect on the bodyguard keeps protecting the CHARACTER after the last bodyguard dies, before detach', () => {
    const data = structuredClone(bundle)
    data.weapons['ork.w.choppa'].S = 6
    const s = createGameState({ missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM(), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }, data, 'hooks', ENGINE_VERSION)
    s.round = 2
    placeUnit(s, T, { x: -4, z: -3 })
    placeUnit(s, CAP, [[-6.5, -3]])
    placeUnit(s, BOYZ, { x: -4, z: -3 + 0.787 + 32 / 25.4 / 2 + 0.5, gap: 0.3 })
    toPhase(s, 'fight', 'B')
    const h = harness(s)
    const gw = s.stratagems[GW_ID]
    effectService.grant(h.ctx, T, gw.effect!, { sourceAbilityId: GW_ID, sourceUnitId: T, scope: gw.scope ?? { who: 'self' }, duration: gw.duration ?? 'untilEndOfPhase', when: gw.when ?? null })
    const onCap = () => hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, `${BOYZ}#1`, 'ork.w.choppa', CAP), roll: rollOf(4, 'wound') }).filter((r) => r.source.id === GW_ID).map((r) => r.result)
    expect(onCap()).toEqual([{ kind: 'roll', modifier: -1 }])
    for (const id of [...s.units[T].models]) removeModel(s, id)
    expect(s.units[T].location).toBe('destroyed')
    expect(onCap()).toEqual([{ kind: 'roll', modifier: -1 }])
    // after detach the survivor holds its own copy: still exactly one contribution (R-10.11)
    leaderService.detach(h.ctx, T)
    expect(s.units[CAP].bodyguardUnitId).toBeNull()
    expect(onCap()).toEqual([{ kind: 'roll', modifier: -1 }])
    // once both halves are gone nothing is collected from the destroyed pair
    const lone = makeState()
    removeModel(lone, lone.units[CAP].models[0])
    for (const id of [...lone.units[T].models]) removeModel(lone, id)
    const hl = harness(lone)
    effectService.grant(hl.ctx, CAP, { reroll: 'ones' } as Effect, { sourceAbilityId: 'test.gone', sourceUnitId: CAP, scope: { who: 'self' }, duration: 'untilEndOfRound' })
    expect(hookService.collect(hl.ctx, 'onHitRoll', { attack: attack(lone, `${BOYZ}#0`, 'ork.w.choppa', INF), roll: rollOf(1) }).filter((r) => r.source.id === 'test.gone')).toEqual([])
  })

  it('STRAT-019 (R-11.5, R-8.3): Fire Overwatch fires at charge.moveStarted only, never at charge.moveEnded', () => {
    const s = makeState()
    toPhase(s, 'charge', 'B', { A: 2 })
    expect(offeredIds(s, 'A', 'charge.moveStarted', FO_ID, { unitId: BOYZ }).length).toBeGreaterThan(0)
    expect(offeredIds(s, 'A', 'charge.moveEnded', FO_ID, { unitId: BOYZ })).toEqual([])
    expect(stratagemService.usable(s, 'A', 'charge.moveEnded', { unitId: BOYZ })).not.toContain(FO_ID)
  })

  it('CHARGE-023 / STRAT-017 Heroic Intervention: enemy ends a charge 5.9" from my Boyz → reactionWindow, 2 CP paid, heroic charge queued against that unit', () => {
    const s = makeState()
    toPhase(s, 'charge', 'A', { B: 2 })
    placeUnit(s, BOYZ2, { x: -6, z: 13, gap: 0.3 })
    placeUnit(s, KOPTAS, { x: 12, z: 13, gap: 1 })
    placeUnit(s, DREAD, [[20, 13]])
    placeUnit(s, BOYZ, [[0.15, -3 + 0.787 + 0.63 + 5.9], [-2, 12], [-4, 12], [-6, 12], [-8, 12], [-10, 12], [-12, 12], [-14, 12], [-16, 12], [-18, 12]])
    expect(leaderService.inEngagementWithEnemy!(s, BOYZ)).toBe(false)
    const h = harness(s)
    h.ctx.window('charge.moveEnded', T, h.ctx.order.defensive('B'), { unitId: T })
    expect(s.pending).toMatchObject({ kind: 'reactionWindow', player: 'B', context: { reaction: 'heroicIntervention', eligibleUnits: [BOYZ] } })
    // Fire Overwatch is not among the charge.moveEnded options (R-11.5)
    const opts = ((s.pending as { options: { action: Action }[] }).options).map((o) => o.action).filter((a) => a.type === 'useStratagem') as UseStratagemAction[]
    expect(opts.map((a) => a.stratagemId)).toEqual([HI_ID])
    const cost = s.stratagems[HI_ID].cost
    expect(h.answer({ ...opts[0] })).toBeNull()
    expect(s.players.B.cp).toBe(2 - cost)
    expect(pendingReactions(s, 'heroicIntervention')).toMatchObject([{ unitId: BOYZ, enemyUnitId: T, player: 'B', stratagemId: HI_ID }])
  })
})
