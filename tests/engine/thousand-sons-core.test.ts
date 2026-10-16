// Thousand Sons engine changes beyond code hooks (docs/spec/factions/thousand-sons.md 7.1, items C1-C5; checklist THO-*).
// Real Combat Patrol data (The Coven Temporus vs Gordrang's Gitstompas). The faction's own code hooks live in
// src/engine/factions/thousand-sons.ts; these tests register tiny stand-in hooks (restored afterwards) so each engine seam is
// exercised on its own.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type GameEvent, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type Services, type UnitId,
} from '../../src/engine'
import { attackService, psychicKillThisPhase } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { applyFixRoll, fixRollOffers } from '../../src/engine/fix-roll'
import { canReroll } from '../../src/engine/dice'
import { hookService } from '../../src/engine/hooks-impl'
import { reserveRouteFor } from '../../src/engine/phases/movement'
import { unitCanDeepStrike } from '../../src/engine/setup'
import { grantPhaseCostOverride, phaseCostOverrides, effectiveCost, stratagemService } from '../../src/engine/stratagems'
import { leaderService } from '../../src/engine/leaders'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const THS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'TS', faction: 'thousand-sons', patrolId: 'ths.cp.the-coven-temporus', enhancementId: 'ths.e.temporal-sorceries',
  secondaryId: 'ths.sec.sorcerous-ritual', attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const AHRAK = 'A:ahrak', SCARABS = 'A:scarabs', TZ1 = 'A:tzaangors-1', TZ2 = 'A:tzaangors-2', BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'

function setupOf(a: Partial<PlayerSetup> = {}): GameSetup {
  return { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: THS(a), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
}
function makeState(phase: GameState['phase'] = 'shooting', active: 'A' | 'B' = 'B'): GameState {
  // the faction's real Glimpse hook (when present) must not interfere with the seam under test
  standIn('glimpseOfEternity', { fixRoll: () => null })
  const s = createGameState(setupOf(), bundle, 'thousand-sons-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = active
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
function ctxOf(s: GameState, dice: number[] = []) { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const decl = (modelId: string, weaponId: string, targetUnitId: string) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks: null })

// stand-in code hooks, restored after each test
const saved = new Map<string, EngineCodeHook | undefined>()
function standIn(name: string, hook: Partial<EngineCodeHook>): void {
  if (!saved.has(name)) saved.set(name, codeHooks[name])
  codeHooks[name] = { name, kind: 'ability', hook: 'onHitRoll', run: () => undefined, ...hook } as unknown as EngineCodeHook
}
afterEach(() => {
  for (const [name, h] of saved) { if (h) codeHooks[name] = h; else delete codeHooks[name] }
  saved.clear()
})

function weaponModel(s: GameState, unitId: UnitId, weaponId: string): string {
  for (const id of s.units[unitId].models) if (s.models[id].weapons.includes(weaponId)) return id
  throw new Error(`no ${weaponId} in ${unitId}`)
}

// advances the attack sequence; the defender's allocation prompts are answered with the first eligible model
function settle(ctx: ReturnType<typeof ctxOf>['ctx'], s: GameState): void {
  attackService.advance(ctx)
  for (let g = 0; g < 60 && s.pending?.kind === 'allocateAttack'; g++) {
    const p = s.pending
    s.pending = null
    attackService.handler.handle(ctx, { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: p.context.eligibleModels[0] } as Action, p)
    attackService.advance(ctx)
  }
}

// answers the open decision through the attack module's handler (what the reducer does), then re-enters the sequence
function answer(ctx: ReturnType<typeof ctxOf>['ctx'], s: GameState, a: Record<string, unknown> & { type: Action['type'] }): void {
  const pending = s.pending as PendingDecision
  const action = { ...a, player: pending.player, decisionId: pending.id } as Action
  s.pending = null
  const handler = pending.kind === 'chooseOption' && pending.context.topic === 'fixRollOffer' ? DEFAULT_MODULES.topics.fixRollOffer! : attackService.handler
  const rej = handler.handle(ctx, action, pending)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
  settle(ctx, s)
}
const topic = (s: GameState): string | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending.context.topic : null)

// ---------------------------------------------------------------------------------------------------------------------------
describe('C1 hook-granted Deep Strike counts for Reserves (THO-013)', () => {
  it('THO-013 THO-3.1: a grantsCoreAbility Deep Strike lets Ahrak start in Reserves; without the grant the setup is refused', () => {
    standIn('temporalSorceries', { kind: 'ability', hook: 'onStatQuery', grantsCoreAbility: (_s, _e, unitId) => (unitId === AHRAK ? ['DEEP_STRIKE'] : []) })
    const s = createGameState(setupOf({ reserves: ['ahrak'] }), bundle, 'c1', ENGINE_VERSION)
    expect(s.units[AHRAK].location).toBe('reserves')
    expect(unitCanDeepStrike(s, s.units[AHRAK])).toBe(true)
    expect(unitCanDeepStrike(s, s.units[TZ1])).toBe(false)
    standIn('temporalSorceries', { kind: 'ability', hook: 'onStatQuery', grantsCoreAbility: () => [] })
    expect(() => createGameState(setupOf({ reserves: ['ahrak'] }), bundle, 'c1', ENGINE_VERSION)).toThrow(/no Deep Strike/)
  })

  it('THO-013 THO-3.1: Ahrak arrives by Deep Strike (not Strategic Reserves) and Rapid Ingress is allowed for him from round 2', () => {
    standIn('temporalSorceries', { kind: 'ability', hook: 'onStatQuery', grantsCoreAbility: (_s, _e, unitId) => (unitId === AHRAK ? ['DEEP_STRIKE'] : []) })
    const s = createGameState(setupOf({ reserves: ['ahrak'] }), bundle, 'c1b', ENGINE_VERSION)
    s.round = 2
    expect(reserveRouteFor(s, AHRAK)).toBe('deepStrike')
    const env = { state: s } as unknown as Parameters<NonNullable<typeof codeHooks.rapidIngressArrival.check>>[0]
    expect(codeHooks.rapidIngressArrival.check!(env, { ids: [AHRAK] } as never)).toBe(true)
    s.round = 1
    expect(codeHooks.rapidIngressArrival.check!(env, { ids: [AHRAK] } as never)).toBe(false)
    s.round = 2
    // the Tzaangors have no Deep Strike: Strategic Reserves
    s.units[TZ1].location = 'reserves'
    expect(reserveRouteFor(s, TZ1)).toBe('strategicReserves')
    expect(codeHooks.rapidIngressArrival.check!(env, { ids: [TZ1] } as never)).toBe(false)
  })

  it('THO-013 a datasheet Deep Strike (Scarabs) and a Tellyporta-style pairing still count', () => {
    const s = createGameState(setupOf({ reserves: ['scarabs'] }), bundle, 'c1c', ENGINE_VERSION)
    expect(unitCanDeepStrike(s, s.units[SCARABS])).toBe(true)
    expect(s.units[SCARABS].location).toBe('reserves')
    s.units[TZ2].deepStrikeWith = SCARABS
    expect(unitCanDeepStrike(s, s.units[TZ2])).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('C2 oneDie re-roll on saves (THO-009)', () => {
  function weaverState(gate: () => boolean = () => true): GameState {
    standIn('weaverOfFates', { kind: 'ability', hook: 'onSaveRoll', forceScope: { who: 'friendly' }, gateEffect: gate })
    const s = makeState('shooting', 'B')
    placeUnit(s, AHRAK, [[0, -4]])
    placeUnit(s, TZ1, [[0, 0], [1, 0]])
    placeUnit(s, TZ2, [[-18, 12]])
    placeUnit(s, SCARABS, [[18, 12]])
    placeUnit(s, BOYZ, [[0, 12], [1.3, 12]])
    placeUnit(s, BOYZ2, [[10, 18]])
    return s
  }
  const shoota = (s: GameState, unit: UnitId, i = 0) => s.units[unit].models.filter((m) => s.models[m].weapons.includes('ork.w.shoota'))[i]

  it('THO-009 THO-2.4, C2: a fast-rolled save batch — the offer lists the failed dice, one is re-rolled with source ths.a.weaver-of-fates, once per phase', () => {
    const s = weaverState()
    const m = shoota(s, BOYZ)
    // 2 hits (6,6), 2 wounds (6,6), 2 saves (2,3: both fail), re-roll of die 0 -> 6 (saved)
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 2, 3, 6])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.shoota', TZ1)] })
    settle(ctx, s)
    expect(topic(s)).toBe('rerollOffer')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.player).toBe('A')
    expect(p.context.data).toMatchObject({ purpose: 'save', dieIndexes: [0, 1], maxDice: 1, source: 'ths.a.weaver-of-fates' })
    answer(ctx, s, { type: 'chooseOption', optionId: 'reroll', dieIndexes: [0] })
    const rr = of(events, 'DiceRerolled')
    expect(rr).toHaveLength(1)
    expect(rr[0]).toMatchObject({ source: 'ths.a.weaver-of-fates', before: [2], after: [6], indexes: [0] })
    expect(s.phaseState.marks).toContain('oneDie:ths.a.weaver-of-fates:save:A')
    // one die saved, one failed
    expect(of(events, 'SaveRolled').map((e) => e.saved)).toEqual([true, false])
    expect(s.pending).toBeNull()
  })

  it('THO-009 THO-2.4: the second failed save in the same phase gets no Weaver offer (once per phase per player)', () => {
    const s = weaverState()
    const m = shoota(s, BOYZ)
    s.phaseState.marks.push('oneDie:ths.a.weaver-of-fates:save:A')
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 2, 3])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.shoota', TZ1)] })
    settle(ctx, s)
    expect(s.pending).toBeNull()
    expect(of(events, 'DiceRerolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled').map((e) => e.saved)).toEqual([false, false])
  })

  it('THO-009 THO-2.4: declining (keep) spends nothing; a save that passes raises no offer; the Weaver mark is per defending player', () => {
    const s = weaverState()
    const m = shoota(s, BOYZ)
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 2, 3])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.shoota', TZ1)] })
    settle(ctx, s)
    answer(ctx, s, { type: 'chooseOption', optionId: 'keep' })
    expect(of(events, 'DiceRerolled')).toHaveLength(0)
    expect(s.phaseState.marks.some((x) => x.startsWith('oneDie:'))).toBe(false)
    // all saves pass: no offer
    const s2 = weaverState()
    const { ctx: c2 } = ctxOf(s2, [6, 6, 6, 6, 6, 6])
    attackService.begin(c2, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(shoota(s2, BOYZ), 'ork.w.shoota', TZ1)] })
    settle(c2, s2)
    expect(s2.pending).toBeNull()
    // a mark for player B does not block player A's offer
    const s3 = weaverState()
    s3.phaseState.marks.push('oneDie:ths.a.weaver-of-fates:save:B')
    const { ctx: c3 } = ctxOf(s3, [6, 6, 6, 6, 2, 3])
    attackService.begin(c3, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(shoota(s3, BOYZ), 'ork.w.shoota', TZ1)] })
    settle(c3, s3)
    expect(topic(s3)).toBe('rerollOffer')
  })

  it('THO-010 THO-2.4: no offer when the hook gate is closed (not a friendly unit in range / no chosen Psyker)', () => {
    const s = weaverState(() => false)
    const m = shoota(s, BOYZ)
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 2, 3])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.shoota', TZ1)] })
    settle(ctx, s)
    expect(s.pending).toBeNull()
    expect(of(events, 'DiceRerolled')).toHaveLength(0)
  })

  it('THO-009 a one-attack save roll is offered the same way, and a re-rolled save die cannot be re-rolled again', () => {
    const s = weaverState()
    const model = s.units[BOYZ].models.find((id) => s.models[id].weapons.includes('ork.w.slugga'))!
    // hit 6, wound 6, save 2 (fails), re-roll -> 3 (fails again)
    const { ctx, events } = ctxOf(s, [6, 6, 2, 3])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(model, 'ork.w.slugga', TZ1)] })
    settle(ctx, s)
    expect(topic(s)).toBe('rerollOffer')
    expect((s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>).context.data).toMatchObject({ purpose: 'save', dieIndexes: [0] })
    answer(ctx, s, { type: 'chooseOption', optionId: 'reroll', dieIndexes: [0] })
    expect(of(events, 'DiceRerolled')).toHaveLength(1)
    expect(s.pending).toBeNull()
    expect(of(events, 'SaveRolled').map((e) => [e.die, e.saved])).toEqual([[3, false]])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('C3 one-shot phase cost override (THO-011, THO-012)', () => {
  const GTG = 'core.s.go-to-ground'
  function reactiveState(cpA: number) {
    const s = makeState('shooting', 'B')
    placeUnit(s, TZ1, [[0, 0], [1, 0]])
    placeUnit(s, TZ2, [[0, 6], [1, 6]])
    placeUnit(s, BOYZ, [[0, 14], [1, 14]])
    s.players.A.cp = cpA
    s.players.B.cp = 0
    return s
  }
  const services = (): Services => ({ ...DEFAULT_MODULES.services, hooks: hookService, effects: effectService, stratagems: stratagemService, leaders: leaderService })
  function open(s: GameState) {
    const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: services(), topics: DEFAULT_MODULES.topics }
    const { ctx, events } = createContext(s, new ScriptedRng([]), modules)
    stratagemService.recordTargets(ctx, BOYZ, [TZ1, TZ2])
    return { ctx, events }
  }
  const optionsOf = (s: GameState): { stratagemId: string; targets: { unitIds?: string[] } }[] => stratagemService.options(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: TZ1 }) as never
  const gtgTargets = (s: GameState) => optionsOf(s).filter((o) => o.stratagemId === GTG).map((o) => o.targets.unitIds?.[0])

  it('THO-011 THO-2.5, C3: Echoes on a unit makes its next stratagem cost 0 CP (offered at 0 CP) and the override is spent by that use', () => {
    const s = reactiveState(0)
    const { ctx, events } = open(s)
    expect(gtgTargets(s)).toEqual([])
    grantPhaseCostOverride(s, { player: 'A', unitId: TZ1, cost: 0, ignoreLimit: true, source: 'ths.a.echoes-from-the-warp' })
    expect(phaseCostOverrides(s, 'A', TZ1)).toHaveLength(1)
    expect(phaseCostOverrides(s, 'A', TZ2)).toHaveLength(0)
    expect(effectiveCost(s, 'A', s.stratagems[GTG], [TZ1])).toBe(0)
    expect(effectiveCost(s, 'A', s.stratagems[GTG], [TZ2])).toBe(s.stratagems[GTG].cost)
    expect(gtgTargets(s)).toEqual([TZ1])
    const use = optionsOf(s).find((o) => o.stratagemId === GTG)!
    ctx.window('shooting.targetsDeclared', 'k', ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: TZ1 })
    const pending = s.pending as PendingDecision
    s.pending = null
    const rej = stratagemService.handle(ctx, { ...(use as unknown as Action), player: 'A', decisionId: pending.id } as Action, pending)
    expect(rej).toBeUndefined()
    expect(s.players.A.cp).toBe(0)
    expect(of(events, 'StratagemUsed')[0]).toMatchObject({ stratagemId: GTG, cost: 0 })
    // spent: one Stratagem per Ritual
    expect(phaseCostOverrides(s, 'A', TZ1)).toHaveLength(0)
    expect(effectiveCost(s, 'A', s.stratagems[GTG], [TZ1])).toBe(s.stratagems[GTG].cost)
  })

  it('THO-012 THO-2.5, C3: the override also waives the once-per-phase limit (the stratagem was already used on another unit this phase)', () => {
    const s = reactiveState(0)
    s.players.A.stratagemUses.push({ stratagemId: GTG, round: s.round, turn: s.activePlayer, phase: s.phase })
    open(s)
    expect(gtgTargets(s)).toEqual([])
    grantPhaseCostOverride(s, { player: 'A', unitId: TZ2, cost: 0, ignoreLimit: true, source: 'ths.a.echoes-from-the-warp' })
    expect(gtgTargets(s)).toEqual([TZ2])
    // a cost-only override (limit not waived) does not open a used stratagem
    const s2 = reactiveState(3)
    s2.players.A.stratagemUses.push({ stratagemId: GTG, round: s2.round, turn: s2.activePlayer, phase: s2.phase })
    open(s2)
    grantPhaseCostOverride(s2, { player: 'A', unitId: TZ1, cost: 0, ignoreLimit: false, source: 'x' })
    expect(gtgTargets(s2)).toEqual([])
  })

  it('THO-012 THO-2.5, C3: the override expires with the phase (marks are cleared) and belongs to one player and the canonical unit', () => {
    const s = reactiveState(0)
    grantPhaseCostOverride(s, { player: 'A', unitId: TZ1, cost: 0, ignoreLimit: true, source: 'ths.a.echoes-from-the-warp' })
    expect(phaseCostOverrides(s, 'B', TZ1)).toHaveLength(0)
    s.phaseState = emptyPhaseState()
    expect(phaseCostOverrides(s, 'A', TZ1)).toHaveLength(0)
    expect(effectiveCost(s, 'A', s.stratagems[GTG], [TZ1])).toBe(s.stratagems[GTG].cost)
  })

  it('THO-011 an attached leader resolves to the bodyguard\'s canonical id', () => {
    const s = reactiveState(0)
    s.units[TZ1].attachedLeaderId = AHRAK
    s.units[AHRAK].bodyguardUnitId = TZ1
    grantPhaseCostOverride(s, { player: 'A', unitId: TZ1, cost: 0, ignoreLimit: true, source: 'x' })
    expect(phaseCostOverrides(s, 'A', AHRAK)).toHaveLength(1)
    expect(phaseCostOverrides(s, 'A', TZ1)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('C4 fix-a-die-to-6 offer (THO-024, THO-025, THO-026)', () => {
  // stand-in Glimpse: the roll's unit is Ahrak's, once per turn (usedKey in the roller's secondaryState)
  function glimpse(): void {
    standIn('glimpseOfEternity', {
      kind: 'ability', hook: 'onStatQuery',
      fixRoll(state, entry, roll) {
        if (entry.holderUnitId !== AHRAK || roll.unitId !== AHRAK) return null
        if (!['hit', 'wound', 'damage', 'save'].includes(roll.purpose)) return null
        const key = `ths:glimpse:${entry.bearerModelId ?? 'ahrak'}`
        if (state.players[roll.player].secondaryState[key] === `${state.round}:${state.activePlayer}`) return null
        return { value: 6, usedKey: key }
      },
    })
  }
  function shootState(): GameState {
    const s = makeState('shooting', 'A')
    glimpse()
    placeUnit(s, AHRAK, [[0, 0]])
    placeUnit(s, TZ1, [[-18, -12]])
    placeUnit(s, TZ2, [[-18, -16]])
    placeUnit(s, SCARABS, [[18, -12]])
    placeUnit(s, BOYZ, [[0, 12], [1.3, 12]])
    placeUnit(s, BOYZ2, [[10, 18]])
    return s
  }
  const IBP = 'ths.w.inferno-bolt-pistol'

  it('THO-024 THO-6.1, C4: a failed hit roll of Ahrak — fix to 6 offered, applied, becomes a critical hit, DiceRerolled names Glimpse; not offered twice in the turn', () => {
    const s = shootState()
    const { ctx, events } = ctxOf(s, [2, 3, ...Array(30).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: AHRAK, overwatch: false, targets: [decl(s.units[AHRAK].models[0], IBP, BOYZ)] })
    settle(ctx, s)
    expect(topic(s)).toBe('fixRollOffer')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.player).toBe('A')
    expect(p.options.map((o) => o.id)).toEqual(['fix:0', 'keep'])
    answer(ctx, s, { type: 'chooseOption', optionId: 'fix:0' })
    const hr = of(events, 'HitRolled')[0]
    expect(hr).toMatchObject({ die: 6, hit: true, critical: true })
    const rr = of(events, 'DiceRerolled')
    expect(rr[0]).toMatchObject({ source: 'ths.a.glimpse-of-eternity', before: [2], after: [6], indexes: [0] })
    expect(s.players.A.secondaryState['ths:glimpse:ahrak']).toBe(`${s.round}:${s.activePlayer}`)
    // the wound roll that follows (die 3) is NOT offered a second fix this turn
    expect(topic(s)).not.toBe('fixRollOffer')
  })

  it('THO-024 the offer returns next turn (the used stamp is per round:turn) and "keep" spends nothing', () => {
    const s = shootState()
    const { ctx, events } = ctxOf(s, [2, ...Array(30).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: AHRAK, overwatch: false, targets: [decl(s.units[AHRAK].models[0], IBP, BOYZ)] })
    settle(ctx, s)
    expect(topic(s)).toBe('fixRollOffer')
    answer(ctx, s, { type: 'chooseOption', optionId: 'keep' })
    expect(of(events, 'DiceRerolled')).toHaveLength(0)
    expect(of(events, 'HitRolled')[0].die).toBe(2)
    expect(s.players.A.secondaryState['ths:glimpse:ahrak']).toBeUndefined()
  })

  it('THO-025 THO-6.1, C4: a fixed die is marked re-rolled (no second re-roll) and a roll already at 6 is not offered', () => {
    const s = shootState()
    const { ctx } = ctxOf(s, [6, ...Array(30).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: AHRAK, overwatch: false, targets: [decl(s.units[AHRAK].models[0], IBP, BOYZ)] })
    settle(ctx, s)
    // hit roll 6: nothing to fix; the wound roll (1) is offered instead
    expect(topic(s)).toBe('fixRollOffer')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect((p.context.data as { purpose: string }).purpose).toBe('wound')
    answer(ctx, s, { type: 'chooseOption', optionId: 'fix:0' })
  })

  it('THO-026 THO-6.1: never offered to other units\' rolls (Scarabs, Tzaangors) nor for a roll that is not hit/wound/damage/save', () => {
    const s = shootState()
    placeUnit(s, SCARABS, [[0, 4]])
    placeUnit(s, BOYZ, [[0, 14], [1, 14]])
    const sorc = weaponModel(s, SCARABS, 'ths.w.warpsmite')
    const { ctx } = ctxOf(s, [2, ...Array(30).fill(1)])
    s.activePlayer = 'A'
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SCARABS, overwatch: false, targets: [decl(sorc, 'ths.w.warpsmite', BOYZ)] })
    settle(ctx, s)
    expect(topic(s)).not.toBe('fixRollOffer')
    const roll = (purpose: string, unitId: UnitId | null) => ({ id: 'r', purpose, sides: 6, dice: [1], rerolled: null, modifiers: [], final: [1], player: 'A', unitId, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: false }) as never
    expect(fixRollOffers(s, roll('hit', AHRAK))).toHaveLength(1)
    expect(fixRollOffers(s, roll('hit', SCARABS))).toHaveLength(0)
    expect(fixRollOffers(s, roll('hit', TZ1))).toHaveLength(0)
    expect(fixRollOffers(s, roll('hazardous', AHRAK))).toHaveLength(0)
    expect(fixRollOffers(s, roll('charge', AHRAK))).toHaveLength(0)
    expect(fixRollOffers(s, roll('battleShock', AHRAK))).toHaveLength(0)
  })

  it('THO-025 THO-6.1, C4: a save die of the roll for Ahrak — fixed to 6 and saved', () => {
    const s = makeState('shooting', 'B')
    glimpse()
    placeUnit(s, AHRAK, [[0, 0]])
    placeUnit(s, TZ1, [[-18, -12]])
    placeUnit(s, TZ2, [[-18, -16]])
    placeUnit(s, SCARABS, [[18, -12]])
    placeUnit(s, BOYZ, [[0, 12]])
    placeUnit(s, BOYZ2, [[10, 18]])
    const m = s.units[BOYZ].models.find((id) => s.models[id].weapons.includes('ork.w.slugga'))!
    // hit 6, wound 6, save 1 (fails; Ahrak 3+ with AP0 / invuln 5+), fix -> 6 saved
    const { ctx, events } = ctxOf(s, [6, 6, 1, ...Array(10).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.slugga', AHRAK)] })
    settle(ctx, s)
    expect(topic(s)).toBe('fixRollOffer')
    expect(((s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>).context.data as { purpose: string }).purpose).toBe('save')
    answer(ctx, s, { type: 'chooseOption', optionId: 'fix:0' })
    expect(of(events, 'SaveRolled')[0]).toMatchObject({ die: 6, saved: true })
    expect(s.players.A.secondaryState['ths:glimpse:ahrak']).toBe(`${s.round}:${s.activePlayer}`)
  })

  it('THO-025 THO-6.1, C4: a D3 damage roll is fixed to 3 (the force weapon\'s DD3), summed into the damage dealt', () => {
    const s = makeState('fight', 'A')
    glimpse()
    placeUnit(s, AHRAK, [[0, 0]])
    placeUnit(s, TZ1, [[-18, -12]])
    placeUnit(s, TZ2, [[-18, -16]])
    placeUnit(s, SCARABS, [[18, -12]])
    // a durable target: the Ork warboss
    placeUnit(s, 'B:warboss', [[1.2, 0]])
    placeUnit(s, BOYZ, [[20, 12]])
    placeUnit(s, BOYZ2, [[10, 18]])
    const boss = s.units['B:warboss'].models[0]
    s.models[boss].woundsRemaining = 10
    // 4 attacks: hits 6, wounds 6, boss saves 1 (all fail), then D3 damage rolls of 1; the first damage roll is offered -> 3
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 1, 1, 1, 1])
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: AHRAK, overwatch: false, targets: [decl(s.units[AHRAK].models[0], 'ths.w.force-weapon', 'B:warboss')] })
    settle(ctx, s)
    expect(topic(s)).toBe('fixRollOffer')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.context.data).toMatchObject({ purpose: 'damage', value: 3, dieIndexes: [0] })
    answer(ctx, s, { type: 'chooseOption', optionId: 'fix:0' })
    expect(of(events, 'DiceRerolled')[0]).toMatchObject({ before: [1], after: [3] })
    // one fix per turn: the other three attacks deal the rolled 1 each
    expect(topic(s)).toBeNull()
    expect(s.models[boss].woundsRemaining).toBe(10 - 3 - 1 - 1 - 1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('applyFixRoll', () => {
  it('THO-025 THO-6.1: a fixed die is marked re-rolled, keeps its modifier delta and the D3 value caps at 3', () => {
    const s = makeState()
    const { ctx } = ctxOf(s, [])
    const roll = { id: 'r:9', purpose: 'hit', sides: 6, dice: [2, 5], rerolled: null, modifiers: [{ source: 'x', value: -1 }], final: [1, 4], player: 'A', unitId: AHRAK, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true } as never as Parameters<typeof applyFixRoll>[1]
    const out = applyFixRoll(ctx, roll, 0, { sourceAbilityId: 'ths.a.glimpse-of-eternity', value: 6, usedKey: 'ths:glimpse:ahrak' })
    expect(out.dice).toEqual([6, 5])
    expect(out.final).toEqual([5, 4])
    expect(out.rerolled).toEqual([0])
    expect(canReroll(out, 0)).toBe(false)
    expect(canReroll(out, 1)).toBe(true)
    const d3 = applyFixRoll(ctx, { ...roll, sides: 3, dice: [1], final: [1], modifiers: [] }, 0, { sourceAbilityId: 'x', value: 6, usedKey: 'k' })
    expect(d3.dice).toEqual([3])
  })
})

describe('C5 Psychic kill attribution (THO-019, THO-020)', () => {
  function psychicState(): GameState {
    const s = makeState('shooting', 'A')
    placeUnit(s, AHRAK, [[18, -12]])
    placeUnit(s, TZ1, [[-18, -12]])
    placeUnit(s, TZ2, [[-18, -16]])
    placeUnit(s, SCARABS, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]])
    placeUnit(s, BOYZ, [[0, 10]])
    placeUnit(s, BOYZ2, [[10, 18]])
    return s
  }
  const target = (s: GameState) => s.units[BOYZ].models[0]

  it('THO-019 THO-4.2: a Warpsmite (PSYCHIC) kill stamps the killer\'s player and psychicKillThisPhase is true for the phase only', () => {
    const s = psychicState()
    const sorc = weaponModel(s, SCARABS, 'ths.w.warpsmite')
    // 3 attacks: hits 6,6,6 (BS3+), wounds 6,6,6, saves (Boyz 5+ save... AP-3): 1,1,1 ... enough dice
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 6, 6, ...Array(30).fill(1)])
    s.models[target(s)].woundsRemaining = 1
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SCARABS, overwatch: false, targets: [decl(sorc, 'ths.w.warpsmite', BOYZ)] })
    settle(ctx, s)
    expect(of(events, 'ModelDestroyed').length).toBeGreaterThan(0)
    expect(psychicKillThisPhase(s, 'A')).toBe(true)
    expect(psychicKillThisPhase(s, 'B')).toBe(false)
    s.phase = 'charge'
    expect(psychicKillThisPhase(s, 'A')).toBe(false)
    s.phase = 'shooting'
    s.round = 3
    expect(psychicKillThisPhase(s, 'A')).toBe(false)
  })

  it('THO-019 THO-4.2: a non-Psychic kill (soulreaper cannon) does not stamp', () => {
    const s = psychicState()
    const m = weaponModel(s, SCARABS, 'ths.w.soulreaper-cannon')
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, ...Array(40).fill(1)])
    s.models[target(s)].woundsRemaining = 1
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SCARABS, overwatch: false, targets: [decl(m, 'ths.w.soulreaper-cannon', BOYZ)] })
    settle(ctx, s)
    expect(of(events, 'ModelDestroyed').length).toBeGreaterThan(0)
    expect(psychicKillThisPhase(s, 'A')).toBe(false)
  })

  it('THO-020 THO-4.2, C5: a Devastating Wounds mortal-wound kill of a Psychic weapon counts', () => {
    const s = psychicState()
    const sorc = weaponModel(s, SCARABS, 'ths.w.warpsmite')
    // Warpsmite crit wound (unmodified 6) with Devastating Wounds -> mortal; the Boy has no save against it
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 6, 6, ...Array(30).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SCARABS, overwatch: false, targets: [decl(sorc, 'ths.w.warpsmite', BOYZ)] })
    settle(ctx, s)
    expect(of(events, 'ModelDestroyed').some((e) => e.byPlayer === 'A')).toBe(true)
    expect(psychicKillThisPhase(s, 'A')).toBe(true)
  })

  it('THO-020 THO-4.2, C5: a Psychic melee weapon (force weapon) kill in the OPPONENT\'s Fight phase counts for its owner', () => {
    const s = makeState('fight', 'B')
    placeUnit(s, AHRAK, [[0, 0]])
    placeUnit(s, TZ1, [[-18, -12]])
    placeUnit(s, TZ2, [[-18, -16]])
    placeUnit(s, SCARABS, [[18, -12]])
    placeUnit(s, BOYZ, [[1.2, 0]])
    placeUnit(s, BOYZ2, [[10, 18]])
    s.models[s.units[BOYZ].models[0]].woundsRemaining = 1
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 6, 6, 6, 6, ...Array(30).fill(1)])
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: AHRAK, overwatch: false, targets: [decl(s.units[AHRAK].models[0], 'ths.w.force-weapon', BOYZ)] })
    settle(ctx, s)
    expect(of(events, 'ModelDestroyed').length).toBeGreaterThan(0)
    expect(psychicKillThisPhase(s, 'A')).toBe(true)
  })

  it('THO-020 THO-4.2, C5: the enemy killing a Thousand Sons model with ordinary weapons never sets it; own Hazardous losses never set it', () => {
    const s = makeState('shooting', 'B')
    placeUnit(s, AHRAK, [[18, -12]])
    placeUnit(s, TZ1, [[0, 0]])
    placeUnit(s, TZ2, [[-18, -16]])
    placeUnit(s, SCARABS, [[18, 12]])
    placeUnit(s, BOYZ, [[0, 10]])
    placeUnit(s, BOYZ2, [[10, 18]])
    const m = s.units[BOYZ].models.find((id) => s.models[id].weapons.includes('ork.w.slugga'))!
    s.models[s.units[TZ1].models[0]].woundsRemaining = 1
    const { ctx, events } = ctxOf(s, [6, 6, 1, ...Array(30).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.slugga', TZ1)] })
    settle(ctx, s)
    expect(of(events, 'ModelDestroyed').length).toBeGreaterThan(0)
    expect(psychicKillThisPhase(s, 'A')).toBe(false)
    expect(psychicKillThisPhase(s, 'B')).toBe(false)
    // a Hazardous-style loss (no killer) of a Psychic user
    attackService.destroyModel(ctx, s.units[SCARABS].models[0], { player: null, unitId: null, modelId: null, kind: 'mortal', psychic: true })
    expect(psychicKillThisPhase(s, 'A')).toBe(false)
    // a Psychic mortal-wound source credited to a player does stamp, but never for the same player's own model
    attackService.destroyModel(ctx, s.units[SCARABS].models[1], { player: 'A', unitId: SCARABS, modelId: null, kind: 'mortal', psychic: true })
    expect(psychicKillThisPhase(s, 'A')).toBe(false)
  })
})
