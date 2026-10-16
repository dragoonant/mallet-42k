// Drukhari: The Blades of Torment (docs/spec/factions/drukhari.md, 12-checklist DRU-001..DRU-027). Real Combat Patrol data. This file
// covers the code-hook side (Power from Pain spend + re-rolls, Rapacious Raiders, Murderous Monster, There and Gone, Tormentors) and the
// descriptor stratagems / enhancements that ride on existing engine machinery.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DeployUnitDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { stratagemService } from '../../src/engine/stratagems'
import { movementModule } from '../../src/engine/phases/movement'
import { firingDeckWeapons } from '../../src/engine/phases/shooting'
import { terrainService } from '../../src/engine/terrain'
import { passengerHalves, transportService } from '../../src/engine/transports'
import { gainPainToken, isEmpowered, onPainEvent, painTokens, startBattlePain } from '../../src/engine/pain'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DRK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Drukhari', faction: 'drukhari', patrolId: 'drk.cp.blades-of-torment', enhancementId: 'drk.e.shudderworm-bottle', secondaryId: 'drk.sec.rapacious-raiders',
  attachments: [{ leaderRef: 'archon', bodyguardRef: 'kabalites' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const ARC = 'A:archon', KAB = 'A:kabalites', INC = 'A:incubi', RAI = 'A:raider', RAV = 'A:ravager'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', DREAD = 'B:deff-dread'
const QR = 'drk.s.quicksilver-reactions', MC = 'drk.s.many-cuts', TG = 'drk.s.there-and-gone'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mirror?: boolean; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
    players: { A: DRK(o.a), B: o.mirror ? DRK({ name: 'Drukhari B', ...o.b }) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'drukhari', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}) {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const pendingOptions = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)

function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  const w = Object.values(s.weapons).find((x) => x.id === weaponId)!
  return {
    kind: w.kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: w, targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
const modelWith = (s: GameState, unitId: string, weaponId: string): string => s.units[unitId].models.find((m) => s.models[m].weapons.some((w) => w === weaponId || s.weapons[w]?.id === weaponId))!

function stratServices(): Services {
  return {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: () => undefined, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
}
function stratHarness(s: GameState) {
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: stratServices(), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(s, new ScriptedRng([]), modules)
  const useOption = (stratagemId: string, firstId?: string) => {
    const opts = ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((x) => x.action as UseStratagemAction)
    const opt = opts.find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    const pending = s.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    s.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { ctx, events, useOption }
}
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])

// a compact ring of `n` models around (cx, cz), `r` inches from the centre
function ring(n: number, cx: number, cz: number, r: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cz + r * Math.sin((2 * Math.PI * i) / n)] as [number, number])
}

// ---------------------------------------------------------------------------------------------------------------------
describe('Pain pool (DRU-2.1, E1)', () => {
  it('DRU-003 each Drukhari player starts with 1, gains for enemy kills and failed Battle-shock tests; a non-Drukhari opponent has no pool', () => {
    const s = makeState()
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, BOYZ, { x: -4, z: 10, gap: 0.3 })
    const { ctx } = ctxOf(s)
    startBattlePain(ctx)
    expect(painTokens(s, 'A')).toBe(1)
    expect(painTokens(s, 'B')).toBe(0)
    onPainEvent(ctx, { type: 'UnitDestroyed', unitId: BOYZ })
    expect(painTokens(s, 'A')).toBe(2)
    onPainEvent(ctx, { type: 'BattleShockTested', unitId: BOYZ, passed: false })
    expect(painTokens(s, 'A')).toBe(3)
    onPainEvent(ctx, { type: 'BattleShockTested', unitId: BOYZ, passed: true })
    onPainEvent(ctx, { type: 'UnitDestroyed', unitId: KAB })
    expect(painTokens(s, 'A')).toBe(3)
    expect(painTokens(s, 'B')).toBe(0)
    expect(s.players.B.secondaryState.painTokens).toBeUndefined()
  })
})

describe('Power from Pain: spend and Empowered re-rolls (DRU-2.2 - 2.5)', () => {
  const placed = (o: Opts = {}) => {
    const s = makeState(o)
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]])
    placeUnit(s, INC, { x: -4, z: -4, gap: 0.3 }); placeUnit(s, RAI, [[8, -4]]); placeUnit(s, RAV, [[12, -4]])
    placeUnit(s, BOYZ, { x: -4, z: 12, gap: 0.3 }); placeUnit(s, BOYZ2, { x: -4, z: 16, gap: 0.3 })
    return s
  }

  it('DRU-004 the Empower offer lists on-board units plus Keep tokens; spending decrements the pool; an Empowered unit is not listed again', () => {
    const s = placed()
    phase(s, 'shooting', 'A')
    s.players.A.secondaryState.painTokens = 2
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.start', 'x')).toBe(true)
    const first = pendingOptions(s)
    expect(first).toContain('done')
    expect(first.filter((o) => o.startsWith('empower:')).sort()).toEqual([`empower:${INC}`, `empower:${KAB}`, `empower:${RAI}`, `empower:${RAV}`])
    answerOption(ctx, `empower:${KAB}`)
    expect(painTokens(s, 'A')).toBe(1)
    expect(isEmpowered(s, KAB)).toBe(true)
    expect(isEmpowered(s, ARC)).toBe(true) // the attached half is the same unit
    // the re-offer after the answer: Kabalites are gone from the list
    expect(pendingOptions(s)).not.toContain(`empower:${KAB}`)
    expect(pendingOptions(s)).toContain(`empower:${INC}`)
    answerOption(ctx, 'done')
    expect(s.pending).toBeNull()
  })

  it('DRU-004 no offer at command.start, with 0 tokens, or for a player without the ability; an embarked unit is not listed', () => {
    const s = placed()
    phase(s, 'command', 'A')
    s.players.A.secondaryState.painTokens = 2
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'movement.start', 'x')).toBe(false) // phase is Command
    phase(s, 'shooting', 'A')
    s.players.A.secondaryState.painTokens = 0
    expect(hookService.offerPicks(ctx, 'shooting.start', 'x')).toBe(false)
    phase(s, 'shooting', 'A')
    s.players.A.secondaryState.painTokens = 1
    transportService.embark(s, INC, RAI)
    expect(hookService.offerPicks(ctx, 'shooting.start', 'x')).toBe(true)
    expect(pendingOptions(s)).not.toContain(`empower:${INC}`)
    s.pending = null
    phase(s, 'shooting', 'B')
    s.players.A.secondaryState.painTokens = 0
    s.players.B.secondaryState.painTokens = 3
    expect(hookService.offerPicks(ctx, 'shooting.start', 'x')).toBe(false) // Orks have no pool to spend
  })

  it('DRU-004 both players are offered in a mirror match, the active player first', () => {
    const s = makeState({ mirror: true })
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]])
    placeUnit(s, 'B:kabalites', { x: -4, z: 12, gap: 0.3 })
    phase(s, 'fight', 'A')
    s.players.A.secondaryState.painTokens = 1
    s.players.B.secondaryState.painTokens = 1
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'fight.start', 'x')).toBe(true)
    expect((s.pending as ChooseOptionDecision).player).toBe('A')
    answerOption(ctx, 'done')
    expect((s.pending as ChooseOptionDecision).player).toBe('B')
    answerOption(ctx, 'empower:B:kabalites')
    expect(painTokens(s, 'B')).toBe(0)
    expect(s.pending).toBeNull()
  })

  it('DRU-004 ordering for the generic AI: Done first when Empowering is pointless, Empower first when a Kabalite can be engaged', () => {
    const s = placed()
    phase(s, 'fight', 'A')
    s.players.A.secondaryState.painTokens = 1
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'fight.start', 'x')
    expect(pendingOptions(s)[0]).toBe('done') // nobody is in Engagement Range
    s.pending = null
    s.phaseState.marks = []
    placeUnit(s, BOYZ, { x: -4, z: 1.9, gap: 0.3 })
    hookService.offerPicks(ctx, 'fight.start', 'x')
    expect(pendingOptions(s)[0]).toBe(`empower:${KAB}`)
  })

  it('DRU-005 Empowered in the Shooting phase: hit rolls of the unit re-roll (Archon half too); other units and the phase after do not', () => {
    const s = placed()
    phase(s, 'shooting', 'A')
    s.players.A.secondaryState.painTokens = 1
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.start', 'x')
    answerOption(ctx, `empower:${KAB}`)
    const rerolls = (unit: string, weapon: string, target = BOYZ) =>
      hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, modelWith(s, unit, weapon), weapon, target), roll: rollOf(1, 'hit') }).map((r) => r.result)
    expect(rerolls(KAB, 'drk.w.splinter-rifle')).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(rerolls(ARC, 'drk.w.archon-splinter-pistol')).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(rerolls(INC, 'drk.w.klaive')).not.toContainEqual({ kind: 'roll', reroll: 'all' })
    // a wound roll is never re-rolled by it
    expect(hookService.collect(ctx, 'onWoundRoll', { attack: attackCtx(s, modelWith(s, KAB, 'drk.w.splinter-rifle'), 'drk.w.splinter-rifle', BOYZ), roll: rollOf(1, 'wound') }).map((r) => r.result))
      .not.toContainEqual({ kind: 'roll', reroll: 'all' })
    // end of phase: the grant expires
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(rerolls(KAB, 'drk.w.splinter-rifle')).not.toContainEqual({ kind: 'roll', reroll: 'all' })
  })

  it('DRU-005 Empowered in the opponent\'s Fight phase: the Incubi fighting back re-roll hits', () => {
    const s = placed()
    placeUnit(s, BOYZ, { x: -4, z: -2.9, gap: 0.3 })
    phase(s, 'fight', 'B')
    s.players.A.secondaryState.painTokens = 1
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'fight.start', 'x')
    expect((s.pending as ChooseOptionDecision).player).toBe('A') // the active player (Orks) has no pool
    answerOption(ctx, `empower:${INC}`)
    const hit = hookService.collect(ctx, 'onHitRoll', { attack: { ...attackCtx(s, modelWith(s, INC, 'drk.w.klaive'), 'drk.w.klaive', BOYZ) }, roll: rollOf(2, 'hit') }).map((r) => r.result)
    expect(hit).toContainEqual({ kind: 'roll', reroll: 'all' })
  })

  it('DRU-006 Empowered in Movement: the Advance roll re-rolls; in Charge: the Charge roll re-rolls; Overwatch hit rolls get nothing', () => {
    const s = placed()
    phase(s, 'movement', 'A')
    s.players.A.secondaryState.painTokens = 2
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'movement.start', 'x')
    answerOption(ctx, `empower:${KAB}`)
    answerOption(ctx, `empower:${INC}`)
    const adv = (unit: string) => hookService.collect(ctx, 'onAdvanceRoll', { movingUnitId: unit, roll: rollOf(1, 'advance') }).map((r) => r.result)
    expect(adv(KAB)).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(adv(RAI)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
    // an Empowered unit shooting Overwatch in the Movement phase gets no hit re-roll
    const hit = hookService.collect(ctx, 'onHitRoll', { attack: { ...attackCtx(s, modelWith(s, KAB, 'drk.w.splinter-rifle'), 'drk.w.splinter-rifle', BOYZ), overwatch: true }, roll: rollOf(2, 'hit') }).map((r) => r.result)
    expect(hit).not.toContainEqual({ kind: 'roll', reroll: 'all' })

    const t = placed()
    phase(t, 'charge', 'A')
    t.players.A.secondaryState.painTokens = 1
    const c2 = ctxOf(t).ctx
    hookService.offerPicks(c2, 'charge.start', 'x')
    answerOption(c2, `empower:${INC}`)
    const chg = (unit: string) => hookService.collect(c2, 'onChargeRoll', { chargingUnitId: unit, targetUnitIds: [BOYZ], roll: rollOf(4, 'charge') }).map((r) => r.result)
    expect(chg(INC)).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(chg(KAB)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Enhancements (DRU-3)', () => {
  it('DRU-007 Shudderworm Bottle: FNP 5+ for the Archon and the led Kabalites; nothing once the Archon is detached', () => {
    const s = makeState()
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]]); placeUnit(s, BOYZ, { x: -4, z: 8, gap: 0.3 })
    const { ctx } = ctxOf(s)
    const bm = s.units[BOYZ].models[0]
    const fnp = (target: string) => hookService.collect(ctx, 'onFeelNoPainRoll', {
      attack: { ...attackCtx(s, bm, 'ork.w.shoota', target), targetModelId: s.units[target].models[0] }, roll: rollOf(3, 'fnp'),
    }).map((r) => r.result)
    expect(fnp(KAB)).toContainEqual({ kind: 'roll', feelNoPain: 5 })
    expect(fnp(ARC)).toContainEqual({ kind: 'roll', feelNoPain: 5 })
    // detached Archon: no FNP for anyone
    const t = makeState({ a: { attachments: [] } })
    placeUnit(t, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(t, ARC, [[-4, 1.5]]); placeUnit(t, BOYZ, { x: -4, z: 8, gap: 0.3 })
    const c2 = ctxOf(t).ctx
    for (const target of [KAB, ARC]) {
      const out = hookService.collect(c2, 'onFeelNoPainRoll', {
        attack: { ...attackCtx(t, t.units[BOYZ].models[0], 'ork.w.shoota', target), targetModelId: t.units[target].models[0] }, roll: rollOf(3, 'fnp'),
      }).map((r) => r.result)
      expect(out).not.toContainEqual({ kind: 'roll', feelNoPain: 5 })
    }
  })

  it('DRU-008 Spiteful Predator: the Archon\'s unit may shoot and charge after Falling Back; without it neither', () => {
    const s = makeState({ a: { enhancementId: 'drk.e.spiteful-predator' } })
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]]); placeUnit(s, INC, { x: -4, z: -4, gap: 0.3 })
    for (const id of [KAB, ARC, INC]) s.units[id].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, KAB, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, KAB, 'charge')).toBe(true)
    expect(hookService.eligibilityFor(s, INC, 'shoot')).toBe(false)
    const t = makeState()
    placeUnit(t, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(t, ARC, [[-4, 1.5]])
    for (const id of [KAB, ARC]) t.units[id].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(t, KAB, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(t, KAB, 'charge')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Secondary objectives (DRU-4)', () => {
  const ENEMY_Z = 12 // the opponent's deployment zone starts at z = 10
  const turnEnd = (s: GameState, active: 'A' | 'B' = 'A') => {
    const { ctx, events } = ctxOf(s)
    s.activePlayer = active
    missionService.onWindow(ctx, 'turn.end', 'turn')
    return { ctx, events }
  }
  const kabsIn = (s: GameState) => { placeUnit(s, KAB, { x: -8, z: ENEMY_Z, gap: 0.2 }); placeUnit(s, ARC, [[-8, ENEMY_Z + 1.4]]) }

  it('DRU-009 Rapacious Raiders: the attached Kabalites wholly in the enemy zone score 4; only the Ravager scores 3; Raider + Incubi still 4 (not 7)', () => {
    const s = makeState()
    kabsIn(s)
    turnEnd(s)
    expect(s.players.A.vp).toBe(4)
    const t = makeState()
    placeUnit(t, RAV, [[0, ENEMY_Z + 0.4]])
    turnEnd(t)
    expect(t.players.A.vp).toBe(3)
    const u = makeState()
    placeUnit(u, RAI, [[0, ENEMY_Z + 0.4]]); placeUnit(u, INC, { x: -6, z: ENEMY_Z + 1.5, gap: 0.2 })
    turnEnd(u)
    expect(u.players.A.vp).toBe(4)
    // one model straddling the line: 0
    const v = makeState()
    placeUnit(v, INC, { x: -6, z: ENEMY_Z + 1.5, gap: 0.2 })
    v.models[v.units[INC].models[0]].pos.z = 9.8
    turnEnd(v)
    expect(v.players.A.vp).toBe(0)
  })

  it('DRU-010 Rapacious Raiders: a Battle-shocked unit (either half), an embarked unit and the opponent\'s turn end score nothing; the Raider carrying them still scores 3', () => {
    const s = makeState()
    kabsIn(s)
    s.units[ARC].battleShocked = true
    turnEnd(s)
    expect(s.players.A.vp).toBe(0)
    const t = makeState()
    kabsIn(t)
    t.units[KAB].battleShocked = true
    turnEnd(t)
    expect(t.players.A.vp).toBe(0)
    const u = makeState()
    placeUnit(u, RAI, [[0, ENEMY_Z + 0.4]])
    placeUnit(u, KAB, { x: 0, z: ENEMY_Z, gap: 0.2 }); placeUnit(u, ARC, [[0, ENEMY_Z + 1.4]])
    transportService.embark(u, KAB, RAI)
    turnEnd(u)
    expect(u.players.A.vp).toBe(3)
    const v = makeState()
    kabsIn(v)
    turnEnd(v, 'B')
    expect(v.players.A.vp).toBe(0)
  })

  const murderous = () => makeState({ a: { secondaryId: 'drk.sec.murderous-monster' } })
  const kill = (ctx: EngineContext, s: GameState, by: string, victim = BOYZ) => {
    const v = s.units[victim].models[0]
    attackService.destroyModel(ctx, v, { player: 'A', unitId: by.split('#')[0], modelId: by, kind: 'melee' })
  }
  const phaseEnd = (ctx: EngineContext, s: GameState, p: GameState['phase'], active: 'A' | 'B' = 'A') => {
    phase(s, p, active)
    missionService.onWindow(ctx, 'phase.end', 'x')
  }

  it('DRU-011 Murderous Monster: the Archon killing a model in a Fight phase scores 3 at that phase end, in either turn', () => {
    const s = murderous()
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]]); placeUnit(s, BOYZ, { x: -4, z: 6, gap: 0.3 })
    const { ctx } = ctxOf(s, [1, 1, 1, 1])
    phase(s, 'fight', 'A')
    kill(ctx, s, `${ARC}#0`)
    phaseEnd(ctx, s, 'fight', 'A')
    expect(s.players.A.vp).toBe(3)
    phase(s, 'fight', 'B')
    kill(ctx, s, `${ARC}#0`)
    phaseEnd(ctx, s, 'fight', 'B')
    expect(s.players.A.vp).toBe(6)
  })

  it('DRU-012 Murderous Monster: Kabalite kills score 0; an Archon kill in the Shooting phase does not leak into the Fight phase; Rapacious Raiders chosen never scores it', () => {
    const s = murderous()
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]]); placeUnit(s, BOYZ, { x: -4, z: 6, gap: 0.3 })
    const { ctx } = ctxOf(s, [1, 1, 1, 1])
    phase(s, 'fight', 'A')
    kill(ctx, s, `${KAB}#0`)
    phaseEnd(ctx, s, 'fight', 'A')
    expect(s.players.A.vp).toBe(0)
    phase(s, 'shooting', 'A')
    kill(ctx, s, `${ARC}#0`, BOYZ)
    phaseEnd(ctx, s, 'shooting', 'A')
    expect(s.players.A.vp).toBe(0)
    phaseEnd(ctx, s, 'fight', 'A')
    expect(s.players.A.vp).toBe(0)
    const t = makeState()
    placeUnit(t, ARC, [[-4, 1.5]]); placeUnit(t, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(t, BOYZ, { x: -4, z: 6, gap: 0.3 })
    const c2 = ctxOf(t, [1, 1, 1, 1]).ctx
    phase(t, 'fight', 'A')
    kill(c2, t, `${ARC}#0`)
    phaseEnd(c2, t, 'fight', 'A')
    expect(t.players.A.vp).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Patrol stratagems (DRU-5)', () => {
  const placed = () => {
    const s = makeState()
    placeUnit(s, KAB, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-4, 1.5]])
    placeUnit(s, INC, { x: -4, z: -4, gap: 0.3 }); placeUnit(s, RAI, [[8, -4]]); placeUnit(s, RAV, [[12, -4]])
    placeUnit(s, BOYZ, { x: -4, z: 12, gap: 0.3 }); placeUnit(s, BOYZ2, { x: -4, z: 16, gap: 0.3 })
    return s
  }

  it('DRU-013 Quicksilver Reactions: offered for a targeted INFANTRY unit in the opponent\'s Shooting and in either Fight phase; -1 to hit until end of phase', () => {
    const s = placed()
    phase(s, 'shooting', 'B', { A: 2 })
    const trig = { unitId: BOYZ, targetUnitId: KAB }
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', QR, trig)).toEqual([[KAB]])
    const h = stratHarness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
    h.useOption(QR)
    const mods = hookService.collect(h.ctx, 'onHitRoll', { attack: attackCtx(s, s.units[BOYZ].models[0], 'ork.w.shoota', KAB), roll: rollOf(4, 'hit') }).map((r) => r.result)
    expect(mods).toContainEqual({ kind: 'roll', modifier: -1 })
    // the Drukhari's own Fight phase: an enemy unit targets the Incubi
    phase(s, 'fight', 'A', { A: 2 })
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', QR, { unitId: BOYZ, targetUnitId: INC })).toEqual([[INC]])
  })

  it('DRU-014 Quicksilver Reactions is not offered in the Drukhari\'s own Shooting phase, for vehicles, or a second time in the same phase', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 3 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', QR, { unitId: BOYZ, targetUnitId: KAB })).toEqual([])
    phase(s, 'shooting', 'B', { A: 3 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', QR, { unitId: BOYZ, targetUnitId: RAV })).toEqual([])
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', QR, { unitId: BOYZ, targetUnitId: RAI })).toEqual([])
    const h = stratHarness(s)
    const trig = { unitId: BOYZ, targetUnitId: KAB }
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
    h.useOption(QR)
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', QR, { unitId: BOYZ2, targetUnitId: INC })).toEqual([])
  })

  it('DRU-015 Many Cuts: offered in the own Shooting phase before the unit shoots; Sustained Hits 1 only against a target below Starting Strength; the cannon\'s own SH 1 stays 1', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 2 })
    expect(offeredIds(s, 'A', 'shooting.start', MC).map((x) => x[0]).sort()).toEqual([INC, KAB])
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'x', h.ctx.order.defensive('A'), {})
    h.useOption(MC, KAB)
    const abilities = (weapon: string, target: string) => {
      const mid = modelWith(s, KAB, weapon)
      return hookService.weaponAbilitiesFor(s, mid, Object.values(s.weapons).find((w) => w.id === weapon)!, attackCtx(s, mid, weapon, target))
        .filter((a) => a.ability === 'SUSTAINED_HITS')
    }
    expect(abilities('drk.w.splinter-rifle', BOYZ)).toHaveLength(0) // full strength
    const victim = s.units[BOYZ]
    victim.models = victim.models.slice(0, 7)
    expect(abilities('drk.w.splinter-rifle', BOYZ).map((a) => a.value)).toEqual([1])
    expect(abilities('drk.w.splinter-cannon', BOYZ).map((a) => a.value)).toEqual([1])
  })

  it('DRU-016 Many Cuts: Fight phase of either turn for units that have not fought; not once the unit has shot or fought, nor in the opponent\'s Shooting phase', () => {
    const s = placed()
    phase(s, 'fight', 'B', { A: 2 })
    expect(offeredIds(s, 'A', 'fight.start', MC).map((x) => x[0]).sort()).toEqual([INC, KAB])
    s.units[INC].turn.foughtThisPhase = true
    expect(offeredIds(s, 'A', 'fight.start', MC).map((x) => x[0])).toEqual([KAB])
    phase(s, 'fight', 'A', { A: 2 })
    expect(offeredIds(s, 'A', 'fight.start', MC).length).toBeGreaterThan(0)
    phase(s, 'shooting', 'B', { A: 2 })
    expect(offeredIds(s, 'A', 'shooting.start', MC)).toEqual([])
    phase(s, 'shooting', 'A', { A: 2 })
    s.units[KAB].turn.shotThisPhase = true
    expect(offeredIds(s, 'A', 'shooting.start', MC).map((x) => x[0])).toEqual([INC])
  })

  const thereAndGoneState = () => {
    const s = placed()
    placeUnit(s, RAI, [[0, -10]])
    placeUnit(s, INC, ring(5, 0, -10, 2.3))
    phase(s, 'fight', 'B', { A: 2 })
    return s
  }

  it('DRU-017 There and Gone: end of the opponent\'s Fight phase, Incubi within 3" of the Raider and out of ER -> embark; they may disembark next turn', () => {
    const s = thereAndGoneState()
    expect(offeredIds(s, 'A', 'phase.end', TG)).toContainEqual([INC, RAI])
    const h = stratHarness(s)
    h.ctx.window('phase.end', 'x', h.ctx.order.defensive('A'), {})
    h.useOption(TG, INC)
    expect(s.units[INC].location).toBe('reserves')
    expect(transportService.transportOf(s, INC)).toBe(RAI)
    expect(h.events.some((e) => e.type === 'AbilityTriggered' && /There and Gone/.test(e.summary))).toBe(true)
    // next own Movement phase: it began the phase embarked, so it may disembark
    phase(s, 'movement', 'A')
    s.round += 1
    expect(transportService.disembarkMode(s, INC)).not.toBeNull()
  })

  it('DRU-017 There and Gone: an Archon + Kabalites attached unit (11 models) embarks as one unit', () => {
    const s = placed()
    placeUnit(s, RAI, [[0, -10]])
    placeUnit(s, KAB, ring(10, 0, -10, 2.4)); placeUnit(s, ARC, [[0, -8.2]])
    phase(s, 'fight', 'B', { A: 2 })
    expect(offeredIds(s, 'A', 'phase.end', TG)).toContainEqual([KAB, RAI])
    const h = stratHarness(s)
    h.ctx.window('phase.end', 'x', h.ctx.order.defensive('A'), {})
    h.useOption(TG, KAB)
    expect(s.units[KAB].location).toBe('reserves')
    expect(s.units[ARC].location).toBe('reserves')
    expect(s.units[KAB].attachedLeaderId ?? s.units[ARC].bodyguardUnitId).toBeTruthy()
  })

  it('DRU-018 There and Gone is not offered: in Engagement Range, a model beyond 3", capacity short, the own Fight phase, a non-TRANSPORT', () => {
    const s = thereAndGoneState()
    placeUnit(s, BOYZ, [[0, -6.9]]) // right on top of the nearest Incubus
    s.models[s.units[BOYZ].models[0]].pos = { x: 2.3, y: 0, z: -10 + 1.3 }
    s.models[s.units[INC].models[0]].pos = { x: 2.3, y: 0, z: -10 }
    expect(offeredIds(s, 'A', 'phase.end', TG).filter((x) => x[0] === INC)).toEqual([])
    const t = thereAndGoneState()
    t.models[t.units[INC].models[0]].pos = { x: 9, y: 0, z: -10 }
    expect(offeredIds(t, 'A', 'phase.end', TG).filter((x) => x[0] === INC)).toEqual([])
    const u = thereAndGoneState()
    placeUnit(u, KAB, ring(10, 0, -10, 2.2)); placeUnit(u, ARC, [[0, -8.2]])
    transportService.embark(u, KAB, RAI)
    expect(offeredIds(u, 'A', 'phase.end', TG).filter((x) => x[0] === INC)).toEqual([]) // 10 + 5 > 11
    const v = thereAndGoneState()
    phase(v, 'fight', 'A', { A: 2 })
    expect(offeredIds(v, 'A', 'phase.end', TG)).toEqual([])
    const w = thereAndGoneState()
    expect(offeredIds(w, 'A', 'phase.end', TG).filter((x) => x[1] === RAV)).toEqual([]) // the Ravager is not a TRANSPORT
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Tormentors (DRU-6.2)', () => {
  it('DRU-021 at the start of the Fight phase each enemy unit in ER of the Incubi takes a Battle-shock test; a failure gives the Drukhari a Pain token; units out of ER are not tested', () => {
    const s = makeState()
    s.phase = 'fight'
    s.activePlayer = 'B'
    placeUnit(s, INC, { x: -4, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: -4, z: 1.9, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: -4, z: 12, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1, 1])
    hookService.run(ctx, 'onPhaseStart', {})
    const tests = of(events, 'BattleShockTested')
    expect(tests.map((e) => e.unitId)).toEqual([BOYZ])
    expect(tests[0].passed).toBe(false)
    expect(painTokens(s, 'A')).toBe(1) // the reducer's emit listener awarded it
    gainPainToken(ctx, 'A', 'battleStart')
    expect(painTokens(s, 'A')).toBe(2)
  })
})

describe('Ravager damage (DRU-6.3)', () => {
  it('DRU-022 Ravager at 4 wounds remaining hits at -1; at 5 no penalty', () => {
    const s = makeState()
    placeUnit(s, RAV, [[0, 0]]); placeUnit(s, BOYZ, { x: -4, z: 12, gap: 0.3 })
    const { ctx } = ctxOf(s)
    const mid = s.units[RAV].models[0]
    const hit = () => hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, mid, 'drk.w.dark-lance', BOYZ), roll: rollOf(4, 'hit') }).map((r) => r.result)
    s.models[mid].woundsRemaining = 5
    expect(hit()).not.toContainEqual({ kind: 'roll', modifier: -1 })
    s.models[mid].woundsRemaining = 4
    expect(hit()).toContainEqual({ kind: 'roll', modifier: -1 })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Datasheet / weapon rules driven through the real hit / wound / damage / reserves / Deadly Demise paths (DRU-023..026)
// ---------------------------------------------------------------------------------------------------------------------

// drives one whole attack through attack.ts with a scripted dice stream (attack-count, hit, wound, save, damage ... in roll order)
function runAttack(s: GameState, modelId: string, weaponId: string, targetUnitId: string, dice: number[], kind: 'melee' | 'ranged', attacks: number | null = 1): GameEvent[] {
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: { ...DEFAULT_MODULES.services.stratagems, offered: () => [] } as never } }
  const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...Array(60).fill(2)]), modules)
  attackService.begin(ctx, { kind, attackerUnitId: s.models[modelId].unitId, overwatch: false, targets: [{ modelId, weaponId, targetUnitId, profileGroup: null, attacks }] })
  let r = attackService.advance(ctx)
  let guard = 0
  while (r === 'pending') {
    if (++guard > 500) throw new Error('attack loop')
    const p = ctx.state.pending as PendingDecision & { options: { action: Action }[] }
    const a = p.options[0].action
    ctx.state.pending = null
    const rej = (p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler).handle(ctx, a, p)
    if (rej) throw new Error(rej.reason)
    r = attackService.advance(ctx)
  }
  return events as GameEvent[]
}
const weaponIdsOf = (s: GameState, modelId: string): string[] => s.models[modelId].weapons.map((w) => s.weapons[w]?.id ?? w)

describe('Raider transport and Firing Deck (DRU-6.4)', () => {
  it('DRU-023 only DRUKHARI INFANTRY can embark in the Raider: Kabalites, Incubi and the attached pair can; a Ravager (VEHICLE) and a non-DRUKHARI unit cannot', () => {
    const s = makeState()
    expect(transportService.capacity(s, RAI)).toBe(11)
    expect(transportService.canCarry(s, KAB, RAI)).toBe(true) // Archon + 10 Kabalites = 11 models, both halves qualify
    expect(transportService.canCarry(s, INC, RAI)).toBe(true)
    expect(transportService.canCarry(s, RAV, RAI)).toBe(false) // DRUKHARI but a VEHICLE, not INFANTRY
    // hand the Boyz to the Drukhari player so only the keyword gate (not ownership or capacity) can refuse them
    s.units[BOYZ].player = 'A'
    expect(s.units[BOYZ].models.length).toBeLessThanOrEqual(11)
    expect(transportService.canCarry(s, BOYZ, RAI)).toBe(false) // INFANTRY but not DRUKHARI
  })

  it('DRU-023 Firing Deck 11: embarked Kabalites\' rifles, shredder, cannon and pistols are listed to fire through the Raider; Incubi (melee only) add nothing', () => {
    const s = makeState({ a: { embarked: [{ unitRef: 'kabalites', transportRef: 'raider' }] } })
    transportService.embark(s, INC, RAI) // bookkeeping only: a second passenger unit alongside the pair
    placeUnit(s, RAI, [[0, 0]])
    phase(s, 'shooting', 'A')
    const deck = firingDeckWeapons(s, RAI)
    const ids = deck.flatMap((d) => d.weaponIds.map((w) => s.weapons[w]?.id ?? w))
    expect(ids.filter((w) => w === 'drk.w.splinter-rifle')).toHaveLength(7)
    for (const w of ['drk.w.shredder', 'drk.w.splinter-cannon', 'drk.w.splinter-pistol', 'drk.w.archon-splinter-pistol']) expect(ids).toContain(w)
    expect(deck.every((d) => s.models[d.modelId].unitId !== INC)).toBe(true)
  })
})

describe('Drukhari weapon rules (DRU-024, DRU-025)', () => {
  const rifle = (s: GameState) => modelWith(s, KAB, 'drk.w.splinter-rifle')
  const woundOf = (evs: GameEvent[]) => of(evs, 'WoundRolled')[0]

  it('DRU-024 splinter rifle Anti-INFANTRY 3+: an unmodified wound roll of 3 is a critical wound against INFANTRY whatever the Toughness (T3 and T5), and fails at 2', () => {
    for (const [mirror, target] of [[true, 'B:kabalites'], [false, BOYZ]] as const) {
      const s = makeState({ mirror })
      phase(s, 'shooting', 'A')
      placeUnit(s, KAB, [[0, 0]]); placeUnit(s, target, [[0, 10]])
      expect(s.weapons['drk.w.splinter-rifle'].abilities.some((a) => a.ability === 'ANTI' && a.keyword === 'INFANTRY' && Number(a.value) === 3)).toBe(true)
      const hit = woundOf(runAttack(s, rifle(s), 'drk.w.splinter-rifle', target, [4, 3], 'ranged'))
      expect(hit).toMatchObject({ die: 3, wounded: true, critical: true })
      const miss = woundOf(runAttack(s, rifle(s), 'drk.w.splinter-rifle', target, [4, 2], 'ranged'))
      expect(miss).toMatchObject({ die: 2, wounded: false, critical: false })
    }
  })

  it('DRU-024 the same rifle against a VEHICLE wounds as plain S2: needs 6+ on a T8 Raider, so a 3 or 5 fails and a 6 wounds', () => {
    const s = makeState({ mirror: true })
    phase(s, 'shooting', 'A')
    placeUnit(s, KAB, [[0, 0]]); placeUnit(s, 'B:raider', [[0, 12]])
    const run = (die: number) => woundOf(runAttack(s, rifle(s), 'drk.w.splinter-rifle', 'B:raider', [4, die], 'ranged'))
    expect(run(3)).toMatchObject({ needed: 6, wounded: false, critical: false })
    expect(run(5)).toMatchObject({ wounded: false })
    expect(run(6)).toMatchObject({ wounded: true, critical: true })
  })

  it('DRU-025 shredder: Torrent rolls D6 attacks and every one auto-hits with no hit roll', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    placeUnit(s, KAB, [[0, 0]]); placeUnit(s, BOYZ, [[0, 10]])
    const evs = runAttack(s, modelWith(s, KAB, 'drk.w.shredder'), 'drk.w.shredder', BOYZ, [4], 'ranged', null) // D6 attacks = 4
    const hits = of(evs, 'HitRolled')
    expect(hits).toHaveLength(4)
    expect(hits.every((h) => h.auto && h.hit && !h.critical)).toBe(true)
    expect(of(evs, 'WoundRolled')).toHaveLength(4)
  })

  it('DRU-025 Klaivex demiklaives: one profile group with a single-blade profile (A3 AP-2 D2) and a dual-blade profile (A6 AP-1 D1, Twin-linked); only the Klaivex has them', () => {
    const s = makeState()
    const single = s.weapons['drk.w.demiklaives-single'], dual = s.weapons['drk.w.demiklaives-dual']
    expect(single.profileGroup).toBe('drk.w.demiklaives')
    expect(dual.profileGroup).toBe('drk.w.demiklaives')
    expect([single.A, single.S, single.AP, single.D]).toEqual([3, 4, -2, 2])
    expect([dual.A, dual.S, dual.AP, dual.D]).toEqual([6, 4, -1, 1])
    expect(single.abilities.some((a) => a.ability === 'TWIN_LINKED')).toBe(false)
    expect(dual.abilities.some((a) => a.ability === 'TWIN_LINKED')).toBe(true)
    const klaivex = modelWith(s, INC, 'drk.w.demiklaives-single')
    expect(weaponIdsOf(s, klaivex)).toEqual(expect.arrayContaining(['drk.w.demiklaives-single', 'drk.w.demiklaives-dual']))
    expect(weaponIdsOf(s, modelWith(s, INC, 'drk.w.klaive'))).not.toContain('drk.w.demiklaives-dual')
  })

  it('DRU-025 the chosen profile is what fights: the dual blades re-roll a failed wound (Twin-linked), the single blade does not', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    placeUnit(s, INC, { x: -4, z: 0, gap: 0.3 }); placeUnit(s, BOYZ, { x: -4, z: 1.9, gap: 0.3 })
    const klaivex = modelWith(s, INC, 'drk.w.demiklaives-single')
    // hit 4, wound 1 (fails), then the Twin-linked re-roll 6
    const dualEvs = runAttack(s, klaivex, 'drk.w.demiklaives-dual', BOYZ, [4, 1, 6], 'melee')
    expect(of(dualEvs, 'DiceRerolled').length).toBeGreaterThan(0)
    expect(of(dualEvs, 'WoundRolled')[0]).toMatchObject({ die: 6, wounded: true })
    const singleEvs = runAttack(s, klaivex, 'drk.w.demiklaives-single', BOYZ, [4, 1, 6], 'melee')
    expect(of(singleEvs, 'DiceRerolled')).toHaveLength(0)
    expect(of(singleEvs, 'WoundRolled')[0]).toMatchObject({ die: 1, wounded: false })
  })

  it('DRU-025 dark lance damage is D6+2: a damage die of 4 deals 6, a die of 1 deals 3', () => {
    const lance = makeState().weapons['drk.w.dark-lance']
    expect([lance.S, lance.AP]).toEqual([12, -3])
    for (const [die, dmg] of [[4, 6], [1, 3]] as const) {
      const s = makeState()
      phase(s, 'shooting', 'A')
      placeUnit(s, RAV, [[0, 0]]); placeUnit(s, DREAD, [[0, 12]])
      const evs = runAttack(s, modelWith(s, RAV, 'drk.w.dark-lance'), 'drk.w.dark-lance', DREAD, [4, 6, 1, die], 'ranged') // hit, wound, failed save, damage
      expect(of(evs, 'DamageApplied').filter((x) => !x.mortal).reduce((n, x) => n + x.amount, 0)).toBe(dmg) // applied wound by wound, so sum it
      expect(of(evs, 'DiceRolled').find((e) => e.roll.purpose === 'damage')?.roll.dice).toEqual([die])
    }
  })
})

describe('Raider and Ravager reserves and wrecks (DRU-6.5)', () => {
  function reservesState(round: number) {
    const s = makeState({ round })
    placeUnit(s, KAB, { x: -18, z: 0, gap: 0.3 }); placeUnit(s, ARC, [[-18, 3]]); placeUnit(s, INC, { x: -18, z: -6, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 18, z: 8, gap: 0.3 })
    s.units[RAI].location = 'reserves'
    s.units[RAV].location = 'reserves'
    phase(s, 'movement', 'A')
    s.step = 'reinforcements'
    return s
  }
  const place = (s: GameState, pending: DeployUnitDecision, x: number, z: number): Action => ({
    type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
    placements: pending.context.unitIds.flatMap((u) => s.units[u].models).map((id, i) => ({ modelId: id, pos: { x: x + (i % 3) * 3, y: 0, z }, facing: 0 })),
  })

  it('DRU-026 round 1: neither the Raider nor the Ravager is offered a Deep Strike arrival and both stay in Reserves', () => {
    const s = reservesState(1)
    const { ctx } = ctxOf(s)
    movementModule.advance(ctx)
    expect(s.pending?.kind === 'deployUnit').toBe(false)
    expect(s.units[RAI].location).toBe('reserves')
    expect(s.units[RAV].location).toBe('reserves')
  })

  it('DRU-026 round 2: a Deep Strike arrival is offered, refused within 9" of an enemy and accepted beyond it', () => {
    const s = reservesState(2)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([RAI])
    expect(movementModule.validate!(s, place(s, pending, 12, 8), pending)).not.toBeNull() // 6" from the Boyz
    expect(movementModule.validate!(s, place(s, pending, 0, -8), pending)).toBeNull()
    s.pending = null
    expect(movementModule.handle(c.ctx, place(s, pending, 0, -8), pending)).toBeUndefined()
    expect(s.units[RAI].location).toBe('board')
    expect(c.events.some((e) => e.type === 'ReinforcementsArrived' && e.unitId === RAI && e.via === 'deepStrike')).toBe(true)
  })

  it('DRU-026 Deadly Demise D3: both vehicles carry it; a destroyed Ravager that rolls a 6 deals D3 mortal wounds to units within 6", and nothing on a 5', () => {
    const demise = (id: string) => { const s = makeState(); return s.datasheets[s.units[id].datasheetId].coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE') }
    expect(demise(RAI)?.value).toBe('D3')
    expect(demise(RAV)?.value).toBe('D3')
    const boom = (trigger: number, d3: number) => {
      const s = makeState()
      phase(s, 'shooting', 'B')
      placeUnit(s, RAV, [[0, 0]]); placeUnit(s, BOYZ, { x: 3, z: 0, gap: 0.3 }); placeUnit(s, BOYZ2, { x: 30, z: 0, gap: 0.3 })
      const { ctx, events } = ctxOf(s, [trigger, d3])
      attackService.destroyModel(ctx, s.units[RAV].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
      return { s, events }
    }
    const big = boom(6, 5) // D3 of a 5 is 3
    expect(of(big.events, 'DeadlyDemiseRolled')[0]).toMatchObject({ exploded: true, affected: [BOYZ] })
    expect(big.s.phaseState.attack?.mortalQueue.some((q) => q.targetUnitId === BOYZ && q.count === 3)).toBe(true)
    const small = boom(6, 2) // D3 of a 2 is 1
    expect(small.s.phaseState.attack?.mortalQueue.some((q) => q.targetUnitId === BOYZ && q.count === 1)).toBe(true)
    const fizzle = boom(5, 5)
    expect(of(fizzle.events, 'DeadlyDemiseRolled')[0]).toMatchObject({ exploded: false, affected: [] })
    expect(fizzle.s.phaseState.attack?.mortalQueue?.length ?? 0).toBe(0)
  })
})

describe('E3 wreck with an attached pair aboard (DRU-019 regression)', () => {
  function embarkedPair() {
    const s = makeState({ a: { embarked: [{ unitRef: 'kabalites', transportRef: 'raider' }] } })
    phase(s, 'shooting', 'B')
    placeUnit(s, RAI, [[0, 0]])
    placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
    return s
  }

  it('DRU-019 passengerHalves skips a half that has been wiped out while the attach link survives', () => {
    const s = embarkedPair()
    expect(passengerHalves(s, KAB)).toEqual([KAB, ARC])
    s.units[ARC].models = []
    s.units[ARC].location = 'destroyed'
    expect(s.units[KAB].attachedLeaderId).toBe(ARC) // link not cleared yet
    expect(passengerHalves(s, KAB)).toEqual([KAB])
    expect(passengerHalves(s, ARC)).toEqual([KAB]) // asked via the dead half: still only the living one
  })

  it('DRU-019 crowded wreck: the Archon cannot be placed and is destroyed, the Kabalites land, the attach link is cleared and the dead Archon is never moved again', () => {
    const s = embarkedPair()
    const archonModel = s.units[ARC].models[0]
    const real = terrainService.canEndAt.bind(terrainService)
    const spy = vi.spyOn(terrainService, 'canEndAt').mockImplementation((st, m, pos) => (m.id === archonModel ? { ok: false } : real(st, m, pos)))
    try {
      const { ctx, events } = ctxOf(s, [1, 1, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6])
      attackService.destroyModel(ctx, s.units[RAI].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
      expect(s.units[ARC].location).toBe('destroyed')
      expect(s.units[ARC].models).toHaveLength(0)
      expect(s.units[KAB].location).toBe('board')
      expect(s.units[KAB].models).toHaveLength(10)
      expect(s.units[KAB].attachedLeaderId).toBeNull()
      expect(s.units[ARC].bodyguardUnitId).toBeNull()
      expect(of(events, 'LeaderDetached')).toHaveLength(1)
      expect(of(events, 'UnitDestroyed').some((e) => e.unitId === ARC)).toBe(true)
      // a later embark of the Kabalites must not drag the dead Archon into Reserves / onto the board
      expect(passengerHalves(s, KAB)).toEqual([KAB])
      transportService.embark(s, KAB, RAV)
      expect(s.units[ARC].location).toBe('destroyed')
    } finally { spy.mockRestore() }
  })
})
