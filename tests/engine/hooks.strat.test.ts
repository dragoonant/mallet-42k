// engine/hooks — stratagems: windows, CP economy and limits, reactions, Command Re-roll, core + patrol stratagems
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, advanceGame, createContext, createEngine, createGameState, emptyPhaseState, restoreRng,
  type Action, type AttackContext, type DiceRoll, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
  type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { pendingReactions, stratagemService } from '../../src/engine/stratagems'
import { placeUnit, scriptedModule } from '../fixtures'

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
const FO = 'core.s.fire-overwatch', GTG = 'core.s.go-to-ground', GW = 'sm.s.gene-wrought-resilience', CR = 'core.s.command-reroll'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; bFull?: PlayerSetup; mission?: string; data?: DataBundle; place?: boolean }

// A: Terminators + Captain at z -3 (x -4…4.3), Librarian and Infernus far away; B spread out beyond 6" of A
function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: o.mission ?? 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM(o.a), B: o.bFull ?? ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, o.data ?? bundle, 'strat', ENGINE_VERSION)
  s.round = 2
  if (o.place !== false) {
    placeUnit(s, T, { x: -4, z: -3 })
    placeUnit(s, CAP, [[-6.5, -3]])
    placeUnit(s, LIB, [[-18, -12]])
    placeUnit(s, INF, { x: 10, z: -13 })
    if (!o.bFull) {
      placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 })
      placeUnit(s, BOYZ2, { x: -6, z: 13, gap: 0.3 })
      placeUnit(s, BOSS, [[20, 13]])
      placeUnit(s, KOPTAS, { x: 12, z: 6, gap: 1 })
      placeUnit(s, DREAD, [[19, 0]])
    }
  }
  return s
}

function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}) {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}

function servicesTable(mortal: { target: string; count: number; source: string }[]): Services {
  return {
    ...DEFAULT_MODULES.services, hooks: hookService, effects: effectService, stratagems: stratagemService, leaders: leaderService,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: (_c, target, count, source) => { mortal.push({ target, count, source }) }, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
}

function harness(state: GameState, dice: number[] = []) {
  const mortal: { target: string; count: number; source: string }[] = []
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: servicesTable(mortal), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  const answer = (a: Record<string, unknown> & { type: Action['type'] }) => {
    const pending = state.pending!
    const action = { ...a, player: pending.player, decisionId: pending.id } as Action
    const rej = stratagemService.validate(state, action, pending)
    if (rej) return rej
    state.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  const useOption = (stratagemId: string, firstId?: string) => {
    const opt = options(state).find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    return answer({ ...opt })
  }
  return { ctx, events, mortal, answer, useOption, modules }
}

const options = (s: GameState): UseStratagemAction[] => ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((o) => o.action as UseStratagemAction)
const ids = (xs: UseStratagemAction[], id: string) => xs.filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? []), ...(x.targets.objectiveId ? [x.targets.objectiveId] : [])])
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger = {}) => stratagemService.options(s, p, w, trigger)

function attack(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}

function withData(patch: (b: DataBundle) => void): DataBundle {
  const b = structuredClone(bundle)
  patch(b)
  return b
}

// Terminators in Engagement Range of a unit row placed just north of them
const engageTerms = (s: GameState, unitId: string, mm = 32) => placeUnit(s, unitId, { x: -4, z: -3 + 0.787 + mm / 25.4 / 2 + 0.5, gap: 0.3 })

describe('engine/stratagems — CP, limits, windows', () => {
  it('STRAT-001 0 CP → no stratagem or reaction decision in any window', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    const { ctx } = harness(s, [3])
    expect(ctx.window('shooting.targetsDeclared', BOYZ, ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })).toBe(false)
    expect(ctx.window('shooting.attacksResolved', BOYZ, ctx.order.active(), { unitId: BOYZ })).toBe(false)
    ctx.roll({ purpose: 'save', player: 'A', unitId: T })
    expect(ctx.window('any.rollMade', s.phaseState.lastRoll!.id, ['A'], { rollId: s.phaseState.lastRoll!.id })).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('STRAT-002 Counter-offensive costs 2 CP: with 1 CP it is not offered', () => {
    const s = makeState()
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'B', { A: 1 })
    s.phaseState.fight!.fought.push(BOYZ)
    const trig = { unitId: BOYZ }
    expect(offered(s, 'A', 'fight.attacksResolved', trig).map((x) => x.stratagemId)).not.toContain('core.s.counter-offensive')
    s.players.A.cp = 2
    expect(ids(offered(s, 'A', 'fight.attacksResolved', trig), 'core.s.counter-offensive')).toEqual([[T]])
  })

  it('STRAT-003 the same stratagem cannot be used twice in one phase (not offered; crafted use → E_STRATAGEM_USED)', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 3 })
    const h = harness(s)
    h.ctx.window('shooting.targetsDeclared', 'k1', h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })
    expect(h.useOption(GTG)).toBeNull()
    const pending = s.pending as PendingDecision
    expect(options(s).map((x) => x.stratagemId)).not.toContain(GTG)
    const crafted = { type: 'useStratagem', player: 'A', decisionId: pending.id, stratagemId: GTG, targets: { unitIds: [T] } } as Action
    expect(stratagemService.validate(s, crafted, pending)?.code).toBe('E_STRATAGEM_USED')
    s.players.A.stratagemUses = []
    s.players.A.cp = 0
    expect(stratagemService.validate(s, crafted, pending)?.code).toBe('E_INSUFFICIENT_CP')
  })

  it('STRAT-004 Command Re-roll in A\'s Shooting phase and again in B\'s Shooting phase → both legal', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 2 })
    const h = harness(s, [2, 5, 1, 6, 4])
    expect(h.ctx.rollOnce('hit', { purpose: 'hit', player: 'A', unitId: T })).toBeNull()
    expect(s.pending?.kind).toBe('commandReroll')
    expect(h.answer({ type: 'commandReroll', rollId: s.phaseState.lastRoll!.id })).toBeNull()
    h.ctx.roll({ purpose: 'hit', player: 'A', unitId: T })
    expect(h.ctx.window('any.rollMade', s.phaseState.lastRoll!.id, ['A'], { rollId: s.phaseState.lastRoll!.id })).toBe(false)
    s.activePlayer = 'B'
    s.phaseState = emptyPhaseState()
    expect(h.ctx.rollOnce('save', { purpose: 'save', player: 'A', unitId: T })).toBeNull()
    expect(h.answer({ type: 'commandReroll', rollId: s.phaseState.lastRoll!.id })).toBeNull()
    expect(s.players.A.cp).toBe(0)
    expect(s.players.A.stratagemUses.map((u) => `${u.turn}:${u.phase}`)).toEqual(['A:shooting', 'B:shooting'])
  })

  it('STRAT-005 a stratagem cannot target the player\'s own Battle-shocked unit (R-11.2)', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 2 })
    s.units[T].battleShocked = true
    s.units[CAP].battleShocked = true
    const h = harness(s)
    expect(h.ctx.window('shooting.targetsDeclared', 'k', h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })).toBe(false)
    const fake = { id: 'd:99', kind: 'stratagemWindow', player: 'A', window: 'shooting.targetsDeclared', canPass: true, context: { trigger: { unitId: BOYZ, targetUnitId: T, rollId: null }, usable: [] }, options: [] } as PendingDecision
    const r = stratagemService.validate(s, { type: 'useStratagem', player: 'A', decisionId: 'd:99', stratagemId: GTG, targets: { unitIds: [T] } } as Action, fake)
    expect(r?.code).toBe('E_INVALID_TARGET')
  })

  it('STRAT-006 Command Re-roll: Advance → re-rolled; charge 2D6 → both dice; one save of a fast roll → one die', () => {
    const s = makeState()
    phase(s, 'movement', 'A', { A: 1 })
    const h = harness(s, [2, 5])
    expect(h.ctx.rollOnce('adv', { purpose: 'advance', player: 'A', unitId: INF })).toBeNull()
    expect((s.pending as { options: unknown[] }).options).toHaveLength(1)
    h.answer({ type: 'commandReroll', rollId: s.phaseState.lastRoll!.id })
    expect(s.phaseState.lastRoll).toMatchObject({ dice: [5], rerolled: [0] })

    phase(s, 'charge', 'A', { A: 1 })
    const c = harness(s, [1, 2, 4, 6])
    c.ctx.rollOnce('charge', { purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: T })
    expect(s.pending).toMatchObject({ kind: 'commandReroll', context: { selectableDice: false } })
    c.answer({ type: 'commandReroll', rollId: s.phaseState.lastRoll!.id })
    expect(s.phaseState.lastRoll).toMatchObject({ dice: [4, 6], rerolled: [0, 1] })

    phase(s, 'shooting', 'B', { A: 1 })
    const v = harness(s, [1, 5, 6, 3])
    v.ctx.rollOnce('saves', { purpose: 'save', player: 'A', count: 3, mode: 'perDie', unitId: T })
    expect(s.pending).toMatchObject({ kind: 'commandReroll', context: { selectableDice: true } })
    expect((s.pending as { options: { id: string }[] }).options.map((o) => o.id)).toEqual(['reroll:0', 'reroll:1', 'reroll:2'])
    expect(v.answer({ type: 'commandReroll', rollId: s.phaseState.lastRoll!.id })?.code).toBe('E_NOT_AN_OPTION')
    v.answer({ type: 'commandReroll', rollId: s.phaseState.lastRoll!.id, dieIndex: 0 })
    expect(s.phaseState.lastRoll).toMatchObject({ dice: [3, 5, 6], rerolled: [0] })
    expect(v.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CpChanged', 'StratagemUsed', 'DiceRerolled']))
  })

  it('STRAT-007 a die already re-rolled (Oath of Moment) is not offered to Command Re-roll (R-1.6)', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 1 })
    const h = harness(s, [1, 2, 2, 6, 1])
    const roll = h.ctx.roll({ purpose: 'hit', player: 'A', unitId: T })
    h.ctx.reroll(roll, [0], 'sm.a.oath-of-moment')
    expect(h.ctx.window('any.rollMade', roll.id, ['A'], { rollId: roll.id })).toBe(false)
    const fast = h.ctx.roll({ purpose: 'hit', player: 'A', count: 2, mode: 'perDie', unitId: T })
    h.ctx.reroll(fast, [0], 'sm.a.oath-of-moment')
    expect(h.ctx.window('any.rollMade', fast.id, ['A'], { rollId: fast.id })).toBe(true)
    expect((s.pending as { options: { id: string }[] }).options.map((o) => o.id)).toEqual(['reroll:1'])
  })

  it('STRAT-008 Sabotage Enemy Comms lockout → Command Re-roll never offered to that player', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    s.players.A.commandRerollLocked = true
    const h = harness(s, [1])
    expect(h.ctx.rollOnce('hit', { purpose: 'hit', player: 'A', unitId: T })).not.toBeNull()
    expect(s.pending).toBeNull()
    expect(stratagemService.usable(s, 'A', 'any.rollMade', { rollId: s.phaseState.lastRoll!.id })).toEqual([])
  })

  it('STRAT-009 Insane Bravery: only before that unit\'s test, auto-pass with no dice, once per battle', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 2 })
    const h = harness(s)
    expect(h.ctx.window('command.battleShock', INF, h.ctx.order.only('A'), { unitId: INF })).toBe(true)
    expect(ids(options(s), 'core.s.insane-bravery')).toEqual([[INF]])
    h.useOption('core.s.insane-bravery')
    const before = h.events.length
    expect(hookService.battleShockTest(h.ctx, INF, 'test')).toBe(true)
    const after = h.events.slice(before).map((e) => e.type)
    expect(after).toEqual(['BattleShockTested'])
    expect(s.players.A.oncePerBattleUsed).toEqual(['core.s.insane-bravery'])
    s.round = 3
    phase(s, 'command', 'A', { A: 2 })
    expect(offered(s, 'A', 'command.battleShock', { unitId: INF }).map((x) => x.stratagemId)).not.toContain('core.s.insane-bravery')
  })

  it('STRAT-010 Display of Might: Insane Bravery only for a unit within 6" of its WARLORD (6.1" → not offered)', () => {
    const s = makeState({ mission: 'mission.cp-06', a: { attachments: [] } })
    phase(s, 'command', 'A', { A: 1 })
    placeUnit(s, CAP, [[0, 0]])
    const gap = (g: number) => placeUnit(s, INF, { x: 50 / 25.4 / 2 + 32 / 25.4 / 2 + g, z: 0, gap: 0.5 })
    gap(6.1)
    expect(offered(s, 'A', 'command.battleShock', { unitId: INF }).map((x) => x.stratagemId)).not.toContain('core.s.insane-bravery')
    gap(5.9)
    expect(ids(offered(s, 'A', 'command.battleShock', { unitId: INF }), 'core.s.insane-bravery')).toEqual([[INF]])
  })

  it('STRAT-011 Grenade: never offered without GRENADES; with a GRENADES fixture 6D6, each 4+ is a mortal wound (8", visible, not in ER)', () => {
    const plain = makeState()
    phase(plain, 'shooting', 'A', { A: 1 })
    expect(offered(plain, 'A', 'shooting.start').map((x) => x.stratagemId)).not.toContain('core.s.grenade')
    const data = withData((b) => { b.datasheets['sm.infernus-squad'].keywords.push('GRENADES') })
    const s = makeState({ data })
    phase(s, 'shooting', 'A', { A: 1 })
    placeUnit(s, DREAD, [[19, 13]])
    placeUnit(s, INF, { x: 14, z: -6 })
    placeUnit(s, KOPTAS, { x: 14, z: 1, gap: 0.3 }) // ~5.5" away
    placeUnit(s, BOSS, [[10, 9.5]]) // > 8"
    engageTerms(s, BOYZ) // in ER of the Terminators → not a legal target
    expect(ids(offered(s, 'A', 'shooting.start'), 'core.s.grenade')).toEqual([[INF, KOPTAS]])
    const h = harness(s, [4, 1, 6, 3, 5, 2])
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    h.useOption('core.s.grenade')
    expect(h.mortal).toEqual([{ target: KOPTAS, count: 3, source: 'core.s.grenade' }])
  })

  it('STRAT-012 Rapid Ingress: end of the opponent\'s Movement phase, round 2, Terminators in Reserves → reactionWindow; round 1 → none', () => {
    const s = makeState()
    s.units[T].location = 'reserves'
    s.units[CAP].location = 'reserves'
    phase(s, 'movement', 'B', { A: 1 })
    const h = harness(s)
    expect(h.ctx.window('movement.end', 'end', h.ctx.order.active())).toBe(true)
    expect(s.pending).toMatchObject({ kind: 'reactionWindow', player: 'A', context: { reaction: 'rapidIngress', eligibleUnits: [T] } })
    h.useOption('core.s.rapid-ingress')
    expect(pendingReactions(s, 'rapidIngress')).toMatchObject([{ unitId: T, player: 'A' }])
    s.round = 1
    phase(s, 'movement', 'B', { A: 1 })
    expect(offered(s, 'A', 'movement.end').map((x) => x.stratagemId)).not.toContain('core.s.rapid-ingress')
  })

  it('STRAT-013 a unit that arrived by Rapid Ingress may still Fire Overwatch later that turn', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { A: 2 })
    s.players.A.stratagemUses.push({ stratagemId: 'core.s.rapid-ingress', round: 2, turn: 'B', phase: 'movement' })
    s.units[T].turn.arrivedThisTurn = true
    s.units[CAP].turn.arrivedThisTurn = true
    expect(ids(offered(s, 'A', 'charge.moveStarted', { unitId: BOYZ }), FO)).toContainEqual([BOYZ, T])
  })

  it('STRAT-014 Go to Ground: 6+ invulnerable (the unit keeps choosing its better 4+) and Benefit of Cover until the end of the phase', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 1 })
    const h = harness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ2, h.ctx.order.defensive('A'), { unitId: BOYZ2, targetUnitId: T })
    expect(ids(options(s), GTG)).toEqual([[T]])
    h.useOption(GTG)
    const res = hookService.collect(h.ctx, 'onSaveRoll', { attack: attack(s, 'B:boyz-b#0', 'ork.w.slugga', T), roll: rollOf(5, 'save') }).map((r) => r.result)
    expect(res).toEqual([{ kind: 'roll', invuln: 6 }])
    expect(s.datasheets[s.units[T].datasheetId].invuln).toBe(4)
    expect(hookService.hasBenefitOfCover(s, T) && hookService.hasBenefitOfCover(s, CAP)).toBe(true)
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(hookService.hasBenefitOfCover(s, T)).toBe(false)
  })

  it('STRAT-015 Go to Ground is not offered for a VEHICLE target (Deff Dread); Boyz → offered', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { B: 1 })
    expect(offered(s, 'B', 'shooting.targetsDeclared', { unitId: T, targetUnitId: DREAD }).map((x) => x.stratagemId)).not.toContain(GTG)
    expect(ids(offered(s, 'B', 'shooting.targetsDeclared', { unitId: T, targetUnitId: BOYZ }), GTG)).toEqual([[BOYZ]])
  })

  it('STRAT-016 Smokescreen: no SMOKE unit in either roster → never offered', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 3, B: 3 })
    expect(stratagemService.usable(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: T })).not.toContain('core.s.smokescreen')
    phase(s, 'shooting', 'A', { A: 3, B: 3 })
    for (const u of [BOYZ, KOPTAS, DREAD, BOSS]) expect(stratagemService.usable(s, 'B', 'shooting.targetsDeclared', { unitId: T, targetUnitId: u })).not.toContain('core.s.smokescreen')
  })

  it('STRAT-018 Tank Shock: offered at charge.moveEnded only for the VEHICLE that just made a Charge move (Heroic Intervention included)', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { B: 1 })
    placeUnit(s, DREAD, [[0.15, -3 + 0.787 + 1.18 + 0.5]])
    placeUnit(s, BOYZ, { x: -6, z: 12, gap: 0.3 })
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: DREAD }), 'core.s.tank-shock')).toEqual([[DREAD, T, 'B:deff-dread#0']])
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: BOYZ }), 'core.s.tank-shock')).toEqual([])
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: KOPTAS }), 'core.s.tank-shock')).toEqual([])
    // the Dread Heroically Intervened in the SM turn
    phase(s, 'charge', 'A', { B: 1 })
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: DREAD }), 'core.s.tank-shock')).toEqual([[DREAD, T, 'B:deff-dread#0']])
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), 'core.s.tank-shock')).toEqual([])
  })

  it('STRAT-019 Fire Overwatch is once per turn across the Movement and Charge phases', () => {
    const s = makeState()
    phase(s, 'movement', 'B', { A: 2 })
    const h = harness(s)
    h.ctx.window('movement.moveStarted', BOYZ, h.ctx.order.only('A'), { unitId: BOYZ })
    h.useOption(FO)
    expect(s.pending).toBeNull()
    phase(s, 'charge', 'B', { A: 2 })
    s.players.A.cp = 2
    expect(offered(s, 'A', 'charge.moveStarted', { unitId: BOYZ }).map((x) => x.stratagemId)).not.toContain(FO)
    s.activePlayer = 'A'
    s.round = 3
    s.activePlayer = 'B'
    expect(ids(offered(s, 'A', 'charge.moveStarted', { unitId: BOYZ }), FO).length).toBeGreaterThan(0)
  })

  it('STRAT-021 Duty and Honour: end of own Command phase, unit in range of a marker it controls → marker flagged sticky', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 1 })
    placeUnit(s, INF, { x: 2, z: -6 })
    placeUnit(s, T, { x: -20, z: -13 })
    placeUnit(s, CAP, [[-12, -13]])
    s.objectives.south.controller = 'A'
    s.objectives.west.controller = 'A' // no SM unit in range
    const h = harness(s)
    h.ctx.window('command.end', 'end', h.ctx.order.active())
    expect(ids(options(s), 'sm.s.duty-and-honour')).toEqual([[INF, 'south']])
    h.useOption('sm.s.duty-and-honour')
    expect(s.objectives.south.stickyBy).toBe('A')
    expect(h.events.some((e) => e.type === 'ObjectiveSecured' && e.flag === 'sticky' && e.objectiveId === 'south')).toBe(true)
    const other = makeState()
    phase(other, 'command', 'A', { A: 1 })
    placeUnit(other, INF, { x: 2, z: -6 })
    other.objectives.south.controller = 'B'
    expect(ids(offered(other, 'A', 'command.end'), 'sm.s.duty-and-honour')).toEqual([])
  })

  it('STRAT-022 Gene-wrought Resilience: opponent\'s Shooting and either Fight phase targetsDeclared windows, never fight.unitSelected; −1 to wound for every attacker with S > T', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 1 })
    const trig = { unitId: BOYZ2, targetUnitId: T }
    expect(ids(offered(s, 'A', 'shooting.targetsDeclared', trig), GW)).toEqual([[T]])
    phase(s, 'shooting', 'A', { A: 1 })
    expect(ids(offered(s, 'A', 'shooting.targetsDeclared', trig), GW)).toEqual([])
    phase(s, 'fight', 'A', { A: 1 })
    expect(ids(offered(s, 'A', 'fight.targetsDeclared', trig), GW)).toEqual([[T]])
    expect(ids(offered(s, 'A', 'fight.unitSelected', trig), GW)).toEqual([])
    phase(s, 'shooting', 'B', { A: 1 })
    const h = harness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ2, h.ctx.order.defensive('A'), trig)
    h.useOption(GW)
    const wound = (model: string, weapon: string) => hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, model, weapon, T), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(wound('B:boyz-b#9', 'ork.w.rokkit-launcha')).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(wound('B:deff-dread#0', 'ork.w.rokkit-launcha')).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(wound('B:boyz-b#1', 'ork.w.slugga')).toEqual([])
  })

  it('FIGHT-031 Gene-wrought in the Fight phase: choppa S4 vs T5 → no −1; \'uge choppa S12 → −1', () => {
    const s = makeState()
    phase(s, 'fight', 'B', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.targetsDeclared', BOSS, h.ctx.order.defensive('A'), { unitId: BOSS, targetUnitId: T })
    h.useOption(GW)
    const wound = (model: string, weapon: string) => hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, model, weapon, T), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(wound('B:boyz-a#1', 'ork.w.choppa')).toEqual([])
    expect(wound('B:warboss#0', 'ork.w.uge-choppa')).toEqual([{ kind: 'roll', modifier: -1 }])
  })

  it('STRAT-023 Veteran Instincts: TERMINATOR unit not yet selected to fight (Infernus never); wound re-rolls only', () => {
    const s = makeState()
    phase(s, 'fight', 'A', { A: 1 })
    placeUnit(s, INF, { x: 10, z: -9 })
    expect(ids(offered(s, 'A', 'fight.start'), 'sm.s.veteran-instincts')).toEqual([[LIB], [T]])
    s.phaseState.fight!.fought.push(T)
    expect(ids(offered(s, 'A', 'fight.attacksResolved', { unitId: BOYZ }), 'sm.s.veteran-instincts')).toEqual([[LIB]])
    s.phaseState.fight!.fought = []
    const h = harness(s)
    h.ctx.window('fight.start', 'start', h.ctx.order.active())
    h.useOption('sm.s.veteran-instincts', T)
    const col = (hook: 'onWoundRoll' | 'onHitRoll', target: string) => hookService.collect(h.ctx, hook, { attack: attack(s, 'A:terminator-squad#2', 'sm.w.power-fist', target), roll: rollOf(1, 'wound') }).map((r) => r.result)
    expect(col('onWoundRoll', BOYZ)).toEqual([{ kind: 'roll', reroll: 'ones' }])
    expect(col('onWoundRoll', DREAD)).toEqual([{ kind: 'roll', reroll: 'all' }])
    expect(col('onHitRoll', DREAD)).toEqual([])
  })

  it('FIGHT-030 Veteran Instincts must be used before the unit is selected to fight', () => {
    const s = makeState()
    phase(s, 'fight', 'A', { A: 1 })
    s.phaseState.fight!.currentUnitId = T
    expect(ids(offered(s, 'A', 'fight.start'), 'sm.s.veteran-instincts')).toEqual([[LIB]])
    expect(ids(offered(s, 'A', 'fight.unitSelected', { unitId: LIB }), 'sm.s.veteran-instincts')).toEqual([])
  })

  it('STRAT-024 Get Stuck In: fight.start and fight.attacksResolved, not fight.unitSelected nor once selected; 6" pile-in and consolidation', () => {
    const s = makeState()
    phase(s, 'fight', 'A', { B: 1 })
    expect(ids(offered(s, 'B', 'fight.start'), 'ork.s.get-stuck-in').map((x) => x[0])).toEqual([BOSS, BOYZ, BOYZ2, KOPTAS, DREAD])
    expect(ids(offered(s, 'B', 'fight.unitSelected', { unitId: BOYZ }), 'ork.s.get-stuck-in')).toEqual([])
    s.phaseState.fight!.currentUnitId = BOYZ
    expect(ids(offered(s, 'B', 'fight.attacksResolved', { unitId: T }), 'ork.s.get-stuck-in').map((x) => x[0])).not.toContain(BOYZ)
    const h = harness(s)
    h.ctx.window('fight.attacksResolved', T, h.ctx.order.defensive('A'), { unitId: T })
    h.useOption('ork.s.get-stuck-in', BOYZ2)
    expect(hookService.pileInDistance(s, BOYZ2)).toBe(6)
    expect(hookService.consolidateDistance(s, BOYZ2)).toBe(6)
    expect(hookService.pileInDistance(s, BOYZ)).toBe(3)
  })

  it('FIGHT-014 Get Stuck In lasts the phase: pile-in and consolidation back to 3" after it ends', () => {
    const s = makeState()
    phase(s, 'fight', 'B', { B: 1 })
    const h = harness(s)
    h.ctx.window('fight.start', 'start', h.ctx.order.active())
    h.useOption('ork.s.get-stuck-in', BOYZ)
    expect([hookService.pileInDistance(s, BOYZ), hookService.consolidateDistance(s, BOYZ)]).toEqual([6, 6])
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect([hookService.pileInDistance(s, BOYZ), hookService.consolidateDistance(s, BOYZ)]).toEqual([3, 3])
  })

  it('STRAT-025 Krump da Gitz!: after an enemy unit shot the Boyz → surge move D6" toward it; Battle-shocked or engaged → not offered', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { B: 1 })
    const h = harness(s, [4])
    stratagemService.recordTargets(h.ctx, T, [BOYZ])
    expect(h.ctx.window('shooting.attacksResolved', T, h.ctx.order.active(), { unitId: T })).toBe(true)
    expect(s.pending?.player).toBe('B')
    expect(ids(options(s), 'ork.s.krump-da-gitz')).toEqual([[BOYZ]])
    h.useOption('ork.s.krump-da-gitz')
    expect(pendingReactions(s, 'surge')).toMatchObject([{ unitId: BOYZ, enemyUnitId: T, distance: 4, player: 'B' }])
    expect(s.units[BOYZ].turn.surgeMovedThisPhase).toBe(true)

    const shocked = makeState()
    phase(shocked, 'shooting', 'A', { B: 1 })
    shocked.units[BOYZ].battleShocked = true
    const hs = harness(shocked)
    stratagemService.recordTargets(hs.ctx, T, [BOYZ])
    expect(ids(offered(shocked, 'B', 'shooting.attacksResolved', { unitId: T }), 'ork.s.krump-da-gitz')).toEqual([])

    const engaged = makeState()
    phase(engaged, 'shooting', 'A', { B: 1 })
    engageTerms(engaged, BOYZ)
    const he = harness(engaged)
    stratagemService.recordTargets(he.ctx, INF, [BOYZ])
    expect(ids(offered(engaged, 'B', 'shooting.attacksResolved', { unitId: INF }), 'ork.s.krump-da-gitz')).toEqual([])
  })

  it('STRAT-027 forced Battle-shock test with −1 (Bestial Bellow procedure): 2D6 7 −1 vs Ld 6+ passes; 6 −1 fails', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    const h = harness(s, [3, 4, 3, 3])
    expect(hookService.battleShockTest(h.ctx, INF, 'bestial-bellow', -1)).toBe(true)
    expect(hookService.battleShockTest(h.ctx, INF, 'bestial-bellow', -1)).toBe(false)
    expect(s.units[INF].battleShocked).toBe(true)
  })

  it('STRAT-028 Tough as Squig-hide fixture (ORKS INFANTRY filter): MOUNTED unit → not offered; INFANTRY Boyz → offered', () => {
    const data = withData((b) => {
      b.datasheets['ork.deffkoptas'].keywords = ['MOUNTED', 'DEFFKOPTAS']
      b.stratagems['ork.s.tough-as-squig-hide'] = {
        id: 'ork.s.tough-as-squig-hide', faction: 'ork', name: 'Tough as Squig-hide', text: 'fixture', cost: 1, category: 'battleTactic', phases: ['shooting', 'fight'],
        window: ['shooting.targetsDeclared', 'fight.targetsDeclared'], who: 'either', condition: { any: [{ phase: 'shooting', ownTurn: false }, { phase: 'fight' }] },
        targets: [{ role: 'unit', owner: 'friendly', filter: { keyword: 'INFANTRY' }, state: 'targetedByAttack', count: 1 }],
        when: { strengthVsToughness: 'gt' }, effect: { modifyRoll: { roll: 'wound', value: -1 } }, scope: { who: 'attacker' }, duration: 'untilEndOfPhase',
      }
      b.patrols['ork.cp.gordrangs-gitstompas'].stratagems.push('ork.s.tough-as-squig-hide')
    })
    const s = makeState({ data })
    phase(s, 'fight', 'A', { B: 1 })
    expect(ids(offered(s, 'B', 'fight.targetsDeclared', { unitId: T, targetUnitId: KOPTAS }), 'ork.s.tough-as-squig-hide')).toEqual([])
    expect(ids(offered(s, 'B', 'fight.targetsDeclared', { unitId: T, targetUnitId: BOYZ }), 'ork.s.tough-as-squig-hide')).toEqual([[BOYZ]])
  })

  it('STRAT-029 both players can act at shooting.targetsDeclared → the targeted unit\'s owner is offered first, then the attacker', () => {
    const data = withData((b) => {
      b.stratagems['ork.s.test-aim'] = {
        id: 'ork.s.test-aim', faction: 'ork', name: 'Test Aim', text: 'fixture', cost: 1, category: 'battleTactic', phases: ['shooting'], window: 'shooting.targetsDeclared',
        who: 'active', targets: [{ role: 'unit', owner: 'friendly', state: 'selectedToShoot', count: 1 }], effect: { modifyRoll: { roll: 'hit', value: 1 } }, duration: 'untilEndOfPhase',
      }
      b.patrols['ork.cp.gordrangs-gitstompas'].stratagems.push('ork.s.test-aim')
    })
    const s = makeState({ data })
    phase(s, 'shooting', 'B', { A: 1, B: 1 })
    const h = harness(s)
    expect(h.ctx.window('shooting.targetsDeclared', BOYZ2, h.ctx.order.defensive('A'), { unitId: BOYZ2, targetUnitId: T })).toBe(true)
    expect(s.pending).toMatchObject({ kind: 'stratagemWindow', player: 'A' })
    expect(h.answer({ type: 'pass' })).toBeNull()
    expect(h.ctx.window('shooting.targetsDeclared', BOYZ2, h.ctx.order.defensive('A'), { unitId: BOYZ2, targetUnitId: T })).toBe(true)
    expect(s.pending).toMatchObject({ kind: 'stratagemWindow', player: 'B' })
    expect(ids(options(s), 'ork.s.test-aim')).toEqual([[BOYZ2]])
  })

  it('STRAT-030 Overwatch shooting happens outside the Shooting phase: Shooting-phase stratagems (Grenade, Go to Ground) are not usable', () => {
    const data = withData((b) => { b.datasheets['sm.infernus-squad'].keywords.push('GRENADES') })
    const s = makeState({ data })
    placeUnit(s, DREAD, [[19, 13]])
    placeUnit(s, INF, { x: 10, z: -2 })
    placeUnit(s, KOPTAS, { x: 10, z: 5, gap: 1 })
    phase(s, 'shooting', 'A', { A: 2, B: 2 })
    expect(offered(s, 'A', 'shooting.start').map((x) => x.stratagemId)).toContain('core.s.grenade')
    phase(s, 'charge', 'B', { A: 2, B: 2 })
    expect(offered(s, 'A', 'shooting.start')).toEqual([])
    expect(offered(s, 'B', 'shooting.targetsDeclared', { unitId: T, targetUnitId: BOYZ })).toEqual([])
  })

  it('STRAT-031 the battle starts with 0 CP for both players', () => {
    const s = makeState()
    expect([s.players.A.cp, s.players.B.cp]).toEqual([0, 0])
    expect([s.players.A.cpGainedThisRound, s.players.B.cpGainedThisRound]).toEqual([0, 0])
  })

  it('STRAT-032 R-4.2: +1 CP from a mission rule in round 2, a second non-automatic gain that round is discarded; next round kept', () => {
    const s = makeState()
    s.players.A.cp = 2
    const h = harness(s)
    expect(hookService.gainCp(h.ctx, 'A', 1, 'retrieve-intelligence')).toBe(1)
    expect(hookService.gainCp(h.ctx, 'A', 1, 'supply-lines')).toBe(0)
    expect(s.players.A.cp).toBe(3)
    expect(h.events.filter((e) => e.type === 'CpChanged')).toHaveLength(1)
    s.round = 3
    s.players.A.cpGainedThisRound = 0
    expect(hookService.gainCp(h.ctx, 'A', 1, 'supply-lines')).toBe(1)
    expect(s.players.A.cp).toBe(4)
  })

  it('STRAT-033 Epic Challenge: only for a unit with a CHARACTER model in ER of an enemy unit with a leader attached', () => {
    const smB: PlayerSetup = { ...SM(), name: 'SM2' }
    const s = makeState({ a: { attachments: [], enhancementId: 'sm.e.oathsworn-determination' }, bFull: smB })
    const BT = 'B:terminator-squad', BI = 'B:infernus-squad'
    placeUnit(s, BT, { x: -4, z: 3 })
    placeUnit(s, 'B:captain-octavius', [[-6.5, 3]])
    placeUnit(s, 'B:librarian-tantus', [[18, 12]])
    placeUnit(s, BI, { x: 8, z: -11.2 })
    placeUnit(s, T, { x: -4, z: -3 })
    placeUnit(s, CAP, [[0.15, 3 - 0.787 - 0.984 - 0.5]])
    placeUnit(s, INF, { x: 8, z: -13 })
    phase(s, 'fight', 'A', { A: 1 })
    const ec = (unitId: string) => ids(offered(s, 'A', 'fight.unitSelected', { unitId }), 'core.s.epic-challenge')
    expect(ec(CAP)).toEqual([[BT, 'A:captain-octavius#0']])
    // Infernus has no CHARACTER; enemy Infernus has no leader
    expect(ec(INF)).toEqual([])
    placeUnit(s, CAP, [[20, -13]])
    placeUnit(s, T, { x: -4, z: 3 - 0.787 * 2 - 0.5 })
    expect(ec(T)).toEqual([])
  })

  it('FIGHT-027 Epic Challenge gives the CHARACTER\'s melee attacks Precision until the end of the phase', () => {
    const smB: PlayerSetup = { ...SM(), name: 'SM2' }
    const s = makeState({ a: { attachments: [], enhancementId: 'sm.e.oathsworn-determination' }, bFull: smB })
    placeUnit(s, 'B:terminator-squad', { x: -4, z: 3 })
    placeUnit(s, 'B:captain-octavius', [[-6.5, 3]])
    placeUnit(s, 'B:librarian-tantus', [[18, 12]])
    placeUnit(s, 'B:infernus-squad', { x: 8, z: 12 })
    placeUnit(s, CAP, [[0.15, 3 - 0.787 - 0.984 - 0.5]])
    placeUnit(s, T, { x: -18, z: -12 })
    phase(s, 'fight', 'A', { A: 1 })
    const h = harness(s)
    const cap = 'A:captain-octavius#0'
    expect(hookService.weaponAbilitiesFor(s, cap, s.weapons['sm.w.relic-weapon']).map((a) => a.ability)).not.toContain('PRECISION')
    h.ctx.window('fight.unitSelected', CAP, h.ctx.order.defensive('A'), { unitId: CAP })
    h.useOption('core.s.epic-challenge')
    expect(hookService.weaponAbilitiesFor(s, cap, s.weapons['sm.w.relic-weapon']).map((a) => a.ability)).toContain('PRECISION')
    expect(hookService.weaponAbilitiesFor(s, cap, s.weapons['sm.w.storm-bolter-captain']).map((a) => a.ability)).not.toContain('PRECISION')
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(hookService.weaponAbilitiesFor(s, cap, s.weapons['sm.w.relic-weapon']).map((a) => a.ability)).not.toContain('PRECISION')
  })

  it('CHARGE-029 Brutal but Kunnin\': used on Boyz that Fell Back → only that unit may charge this phase', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { B: 1 })
    s.units[BOYZ].turn.moveType = 'fallBack'
    s.units[BOYZ2].turn.moveType = 'fallBack'
    const h = harness(s)
    h.ctx.window('charge.start', 'start', h.ctx.order.active())
    h.useOption('ork.s.brutal-but-kunnin', BOYZ)
    expect(hookService.eligibilityFor(s, BOYZ, 'charge')).toBe(true)
    expect(hookService.eligibilityFor(s, BOYZ2, 'charge')).toBe(false)
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(hookService.eligibilityFor(s, BOYZ, 'charge')).toBe(false)
  })

  it('CHARGE-024 Heroic Intervention: the Dread (WALKER) may intervene; Deffkoptas (VEHICLE, not WALKER) may not', () => {
    const s = makeState()
    phase(s, 'charge', 'A', { B: 1 })
    placeUnit(s, DREAD, [[0, 4.5]])
    placeUnit(s, KOPTAS, { x: -4, z: 5.5, gap: 1 })
    placeUnit(s, BOYZ, { x: -6, z: 13, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: 8, z: 13, gap: 0.3 })
    const hi = ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), 'core.s.heroic-intervention')
    expect(hi).toEqual([[T, DREAD]])
  })

  it('CHARGE-025 Heroic Intervention: intervening unit 6.1" away → not offered; 5.9" → offered', () => {
    const s = makeState()
    phase(s, 'charge', 'A', { B: 1 })
    placeUnit(s, BOYZ2, { x: -6, z: 13, gap: 0.3 })
    placeUnit(s, KOPTAS, { x: 12, z: 13, gap: 1 })
    const at = (gap: number) => placeUnit(s, BOYZ, [[0.15, -3 + 0.787 + 0.63 + gap], [-2, 12], [-4, 12], [-6, 12], [-8, 12], [-10, 12], [-12, 12], [-14, 12], [-16, 12], [-18, 12]])
    at(6.1)
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), 'core.s.heroic-intervention')).toEqual([])
    at(5.9)
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), 'core.s.heroic-intervention')).toEqual([[T, BOYZ]])
    s.units[BOYZ].turn.moveType = 'advance'
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), 'core.s.heroic-intervention')).toEqual([])
  })

  it('CHARGE-026 Tank Shock with the Deff Dread (T9): 9 dice, each 5+ a mortal wound, at most 6', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { B: 1 })
    placeUnit(s, DREAD, [[0.15, -3 + 0.787 + 1.18 + 0.5]])
    const h = harness(s, [5, 6, 5, 6, 5, 6, 5, 1, 2])
    h.ctx.window('charge.moveEnded', DREAD, h.ctx.order.defensive('A'), { unitId: DREAD })
    expect(s.pending).toMatchObject({ kind: 'stratagemWindow', player: 'B' })
    h.useOption('core.s.tank-shock')
    const roll = h.events.find((e) => e.type === 'DiceRolled')
    expect(roll && roll.type === 'DiceRolled' && roll.roll.dice).toHaveLength(9)
    expect(h.mortal).toEqual([{ target: T, count: 6, source: 'core.s.tank-shock' }])
  })

  it('CHARGE-027 Tank Shock with a Deffkopta (T6) rolls 6 dice', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { B: 1 })
    placeUnit(s, KOPTAS, [[0.15, -3 + 0.787 + 42 / 25.4 / 2 + 0.3], [3.5, 4], [6.5, 4]])
    const h = harness(s, [5, 1, 1, 1, 6, 2])
    h.ctx.window('charge.moveEnded', KOPTAS, h.ctx.order.defensive('A'), { unitId: KOPTAS })
    h.useOption('core.s.tank-shock')
    const roll = h.events.find((e) => e.type === 'DiceRolled')
    expect(roll && roll.type === 'DiceRolled' && roll.roll.dice).toHaveLength(6)
    expect(h.mortal).toEqual([{ target: T, count: 2, source: 'core.s.tank-shock' }])
  })

  it('STRAT-034 Fire Overwatch, Heroic Intervention, Rapid Ingress, Counter-offensive are reactionWindows of useStratagem options; Tank Shock and Go to Ground are stratagemWindows', () => {
    const s = makeState()
    phase(s, 'movement', 'B', { A: 1 })
    const h = harness(s)
    expect(h.ctx.window('movement.moveStarted', BOYZ, h.ctx.order.only('A'), { unitId: BOYZ })).toBe(true)
    expect(s.pending).toMatchObject({ kind: 'reactionWindow', player: 'A', window: 'movement.moveStarted', canPass: true, context: { reaction: 'overwatch', enemyUnitId: BOYZ } })
    expect(options(s).every((a) => a.type === 'useStratagem' && a.stratagemId === FO)).toBe(true)
    expect(ids(options(s), FO)).toContainEqual([BOYZ, T])
    h.useOption(FO, T)
    expect(pendingReactions(s, 'overwatch')).toMatchObject([{ unitId: T, enemyUnitId: BOYZ, stratagemId: FO }])
    // same stratagem again in the phase
    const fake = { id: 'd:77', kind: 'reactionWindow', player: 'A', window: 'movement.unitMoved', canPass: true, context: { enemyUnitId: BOYZ, reaction: 'overwatch', eligibleUnits: [T] }, options: [] } as PendingDecision
    s.players.A.cp = 1
    expect(stratagemService.validate(s, { type: 'useStratagem', player: 'A', decisionId: 'd:77', stratagemId: FO, targets: { unitIds: [BOYZ, T] } } as Action, fake)?.code).toBe('E_STRATAGEM_USED')
    // 0 CP → no window
    phase(s, 'movement', 'B', { A: 0 })
    expect(h.ctx.window('movement.unitMoved', BOYZ2, h.ctx.order.only('A'), { unitId: BOYZ })).toBe(false)

    const hi = makeState()
    phase(hi, 'charge', 'A', { B: 1 })
    placeUnit(hi, DREAD, [[0, 4.5]])
    const hh = harness(hi)
    hh.ctx.window('charge.moveEnded', T, hh.ctx.order.defensive('B'), { unitId: T })
    expect(hi.pending).toMatchObject({ kind: 'reactionWindow', player: 'B', context: { reaction: 'heroicIntervention', eligibleUnits: [DREAD] } })
    hh.useOption('core.s.heroic-intervention')
    expect(pendingReactions(hi, 'heroicIntervention')).toMatchObject([{ unitId: DREAD, enemyUnitId: T }])

    const co = makeState()
    engageTerms(co, BOYZ)
    phase(co, 'fight', 'B', { A: 2 })
    co.phaseState.fight!.fought.push(BOYZ)
    const hc = harness(co)
    hc.ctx.window('fight.attacksResolved', BOYZ, hc.ctx.order.defensive('B'), { unitId: BOYZ })
    expect(co.pending).toMatchObject({ kind: 'reactionWindow', player: 'A', context: { reaction: 'counterOffensive' } })
    hc.useOption('core.s.counter-offensive')
    expect(co.phaseState.fight).toMatchObject({ counterOffensive: true, nextToSelect: 'A' })
    expect(pendingReactions(co, 'counterOffensive')).toMatchObject([{ unitId: T, enemyUnitId: BOYZ }])

    const gtg = makeState()
    phase(gtg, 'shooting', 'B', { A: 1 })
    const hg = harness(gtg)
    hg.ctx.window('shooting.targetsDeclared', BOYZ2, hg.ctx.order.defensive('A'), { unitId: BOYZ2, targetUnitId: T })
    expect(gtg.pending?.kind).toBe('stratagemWindow')
    expect(options(gtg).map((a) => a.stratagemId)).toContain(GTG)
  })

  it('STRAT-034 through the reducer: a reactionWindow answered with useStratagem pays CP, logs the use and the sequence resumes', () => {
    const s = makeState()
    s.step = 'select'
    phase(s, 'movement', 'B', { A: 1 })
    s.step = 'select'
    const mortal: { target: string; count: number; source: string }[] = []
    const services = servicesTable(mortal)
    const movement = scriptedModule('movement', {
      advance(ctx) {
        if (ctx.window('movement.moveStarted', BOYZ, ctx.order.only('A'), { unitId: BOYZ })) return 'pending'
        if (!ctx.marked('ack')) {
          const player = ctx.state.activePlayer
          ctx.decide({ kind: 'confirm', player, window: 'movement.unitMoved', canPass: false, context: { topic: 'info', message: 'moved', data: {} }, options: [{ id: 'ok', label: 'ok', action: { type: 'confirm', player, decisionId: '' } }] })
          return 'pending'
        }
        return 'done'
      },
      handle(ctx) { ctx.once('ack') },
    })
    const modules: ModuleTable = { phases: { ...DEFAULT_MODULES.phases, movement }, services, topics: DEFAULT_MODULES.topics }
    const engine = createEngine(modules)
    const { ctx } = createContext(s, restoreRng(s.rng), modules)
    s.phaseState.marks.push('window:movement.start|start')
    s.phaseState.windowsOpened.push({ window: 'movement.start', player: 'B', key: 'start' }, { window: 'movement.start', player: 'A', key: 'start' })
    advanceGame(ctx, modules)
    expect(s.pending?.kind).toBe('reactionWindow')
    const opt = (s.pending as { options: { action: Action }[] }).options.find((o) => (o.action as UseStratagemAction).targets.unitIds?.includes(T))!
    const r = engine.step(s, opt.action)
    expect(r.rejection).toBeUndefined()
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CpChanged', 'StratagemUsed', 'StratagemWindowClosed']))
    expect(r.state.players.A.cp).toBe(0)
    expect(r.state.players.A.stratagemUses).toEqual([{ stratagemId: FO, round: 2, turn: 'B', phase: 'movement' }])
    expect(r.pending?.kind).toBe('confirm')
    expect(pendingReactions(r.state, 'overwatch')).toHaveLength(1)
    expect(s.players.A.cp).toBe(1)
  })
})
