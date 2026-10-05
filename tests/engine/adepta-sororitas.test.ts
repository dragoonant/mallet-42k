// Adepta Sororitas: Sanctuary Guardians (docs/spec/factions/adepta-sororitas.md, 12-checklist ADE-*). Covers the code hooks and
// declarative rules built on top of the Miracle dice engine: Defender of the Faith / Righteous Fury picks, the two secondaries,
// Holy Radiance, Lead the Righteous, Null Rod, Sworn Protectors, Simulacrum Imperialis, Extremis Trigger Word and A Martyr's Death.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { miracleHandler } from '../../src/engine/miracle'
import { commandModule } from '../../src/engine/phases/command'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const ADE = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Sisters', faction: 'adepta-sororitas', patrolId: 'ade.cp.sanctuary-guardians', enhancementId: 'ade.e.defender-of-the-faith',
  secondaryId: 'ade.sec.hallowed-retribution', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sacresants' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const CAN = 'A:canoness', SIS = 'A:sisters', SAC = 'A:sacresants', ARC = 'A:arcos'
const BOYZ = 'B:boyz-a', BOSS = 'B:warboss'
// well away from the centre of the battlefield (Consecrated Ground tests)
const farFromCentre = (s: GameState) => { placeUnit(s, SAC, { x: -20, z: -11, gap: 0.3 }); placeUnit(s, CAN, [[-19.2, -12.3]]) }
const HR = 'ade.s.holy-radiance', AD = 'ade.s.ascetic-discipline'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; bAde?: boolean; mission?: string; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: o.mission ?? 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: ADE(o.a), B: o.bAde ? ADE(o.b) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'ade', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}

type Spot = { x: number; z: number; gap?: number } | [number, number][]
const SPOTS: Record<string, Spot> = {
  [SAC]: { x: -12, z: -3, gap: 0.3 }, [CAN]: [[-11.2, -4.3]], [SIS]: { x: -12, z: -9, gap: 0.3 }, [ARC]: { x: 8, z: -9, gap: 0.3 },
  [BOYZ]: { x: -6, z: 8, gap: 0.3 }, [BOSS]: [[20, 13]],
}
function deploy(s: GameState, ...ids: string[]): void { for (const id of ids) placeUnit(s, id, SPOTS[id]) }

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function answerOption(ctx: EngineContext, optionId: string, handler = hookService.handler): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string, targetModelId?: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: targetModelId ?? s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}

// ---------- stratagem harness (as necrons.test.ts) ----------
function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}) {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
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

const oc = (s: GameState, model: string, base: number) => hookService.statFor(s, { unitId: s.models[model].unitId, modelId: model, weapon: null, stat: 'OC' }, base)
const chargeRerolls = (s: GameState, unitId: string) => {
  const { ctx } = ctxOf(s)
  return hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: unitId, targetUnitIds: [BOYZ], roll: rollOf(6, 'charge') }).map((r) => r.result)
}

// destroys every model of `unitId`, credited to `by` (the same path an attack sequence takes)
function killUnit(ctx: EngineContext, unitId: string, by: { player: 'A' | 'B' | null; unitId: string | null; modelId: string | null; kind: 'melee' | 'ranged' | 'mortal' | 'other' }): void {
  for (const id of [...ctx.state.units[unitId].models]) attackService.destroyModel(ctx, id, by)
}

// =====================================================================================================================
describe('Enhancements (ADE-3)', () => {
  it('ADE-014 ADE-3: Defender of the Faith — Canoness Sv 3+ → 2+ and the led Sacresants 3+ → 2+; other units untouched', () => {
    const s = makeState()
    deploy(s, CAN, SAC, SIS)
    const sv = (model: string) => hookService.statFor(s, { unitId: s.models[model].unitId, modelId: model, weapon: null, stat: 'Sv' }, 3)
    expect(sv(`${CAN}#0`)).toBe(2)
    expect(sv(`${SAC}#0`)).toBe(2)
    expect(sv(`${SAC}#4`)).toBe(2)
    expect(sv(`${SIS}#0`)).toBe(3)
    // led Battle Sisters get it too
    const s2 = makeState({ a: { attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sisters' }] } })
    deploy(s2, CAN, SAC, SIS)
    expect(hookService.statFor(s2, { unitId: SIS, modelId: `${SIS}#3`, weapon: null, stat: 'Sv' }, 3)).toBe(2)
    expect(hookService.statFor(s2, { unitId: SAC, modelId: `${SAC}#0`, weapon: null, stat: 'Sv' }, 3)).toBe(3)
  })

  it('ADE-015 ADE-3: Defender of the Faith OC — discard at own command.start gives the bearer\'s unit +1 OC per model until own next Command phase; pool −1; not offered with an empty pool', () => {
    const s = makeState()
    deploy(s, CAN, SAC, SIS)
    s.players.A.miracle.dice = [2, 5, 5]
    const { ctx, events } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'command.start', 'start')).toBe(true)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual(['discard:2', 'discard:5', 'decline'])
    answerOption(ctx, 'discard:5')
    expect(s.players.A.miracle.dice).toEqual([2, 5])
    expect(of(events, 'MiracleDieSpent')[0]).toMatchObject({ mode: 'discard', value: 5, player: 'A' })
    expect(oc(s, `${SAC}#0`, 1)).toBe(2)
    expect(oc(s, `${SAC}#4`, 1)).toBe(2)
    expect(oc(s, `${CAN}#0`, 1)).toBe(2)
    expect(oc(s, `${SIS}#0`, 2)).toBe(2) // another unit is unaffected
    effectService.expire(ctx, 'nextOwnTurn', 'B')
    expect(oc(s, `${SAC}#0`, 1)).toBe(2) // not the opponent's turn start
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(oc(s, `${SAC}#0`, 1)).toBe(1)
    // empty pool: nothing is offered; opponent's Command phase: nothing either
    const e = makeState()
    deploy(e, CAN, SAC)
    expect(hookService.offerPicks(ctxOf(e).ctx, 'command.start', 'start')).toBe(false)
    const o = makeState()
    deploy(o, CAN, SAC)
    o.players.A.miracle.dice = [4]
    o.activePlayer = 'B'
    expect(hookService.offerPicks(ctxOf(o).ctx, 'command.start', 'start')).toBe(false)
  })

  it('ADE-015 ADE-3: declining the Defender of the Faith pick spends nothing', () => {
    const s = makeState()
    deploy(s, CAN, SAC)
    s.players.A.miracle.dice = [3]
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'command.start', 'start')
    answerOption(ctx, 'decline')
    expect(s.players.A.miracle.dice).toEqual([3])
    expect(oc(s, `${SAC}#0`, 1)).toBe(1)
  })

  const FURY = { enhancementId: 'ade.e.righteous-fury' }

  it('ADE-016 ADE-3: Righteous Fury — the bearer\'s unit shoots and charges after Advancing or Falling Back; Arco-flagellants and a Defender bearer cannot', () => {
    const s = makeState({ a: FURY })
    deploy(s, CAN, SAC, ARC)
    for (const id of [CAN, SAC, ARC]) s.units[id].turn.moveType = 'advance'
    expect(hookService.eligibilityFor(s, SAC, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, SAC, 'charge')).toBe(true)
    expect(hookService.eligibilityFor(s, CAN, 'charge')).toBe(true)
    expect(hookService.eligibilityFor(s, ARC, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(s, ARC, 'charge')).toBe(false)
    for (const id of [CAN, SAC]) s.units[id].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, SAC, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, SAC, 'charge')).toBe(true)
    const d = makeState()
    deploy(d, CAN, SAC)
    for (const id of [CAN, SAC]) d.units[id].turn.moveType = 'advance'
    expect(hookService.eligibilityFor(d, SAC, 'charge')).toBe(false)
  })

  it('ADE-017 ADE-3: Righteous Fury charge re-roll — discard at own command.start; the bearer\'s unit may re-roll charge rolls that turn only', () => {
    const s = makeState({ a: FURY })
    deploy(s, CAN, SAC, SIS)
    s.players.A.miracle.dice = [1, 6]
    const { ctx } = ctxOf(s)
    expect(chargeRerolls(s, SAC)).toEqual([]) // nothing before the discard
    expect(hookService.offerPicks(ctx, 'command.start', 'start')).toBe(true)
    expect((s.pending as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['discard:1', 'discard:6', 'decline'])
    answerOption(ctx, 'discard:1')
    expect(s.players.A.miracle.dice).toEqual([6])
    expect(chargeRerolls(s, SAC)).toEqual([{ kind: 'roll', reroll: 'all' }])
    expect(chargeRerolls(s, CAN)).toEqual([{ kind: 'roll', reroll: 'all' }]) // the leader half is the same unit
    expect(chargeRerolls(s, SIS)).toEqual([])
    effectService.expire(ctx, 'turnEnd', 'A')
    expect(chargeRerolls(s, SAC)).toEqual([])
    // declining: no re-roll
    const d = makeState({ a: FURY })
    deploy(d, CAN, SAC)
    d.players.A.miracle.dice = [4]
    const dctx = ctxOf(d).ctx
    hookService.offerPicks(dctx, 'command.start', 'start')
    answerOption(dctx, 'decline')
    expect(d.players.A.miracle.dice).toEqual([4])
    expect(chargeRerolls(d, SAC)).toEqual([])
  })
})

// =====================================================================================================================
describe('Secondary objectives (ADE-4)', () => {
  const by = (unitId: string) => ({ player: 'A' as const, unitId, modelId: `${unitId}#0`, kind: 'melee' as const })

  it('ADE-018 ADE-4: Hallowed Retribution — Sacresants destroy an enemy unit → +3 VP, once per unit', () => {
    const s = makeState()
    deploy(s, CAN, SAC, SIS)
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    const { ctx } = ctxOf(s)
    killUnit(ctx, BOYZ, by(SAC))
    expect(s.players.A.vp).toBe(3)
    expect(s.players.B.vp).toBe(0)
    expect(s.players.A.vpBySource['hallowed-retribution']).toBe(3)
  })

  it('ADE-019 ADE-4: Hallowed Retribution — the killer made an Act of Faith earlier this phase → +4 VP; in a previous phase → +3', () => {
    const s = makeState()
    deploy(s, CAN, SAC)
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    s.players.A.miracle.spentThisPhase = [SAC]
    killUnit(ctxOf(s).ctx, BOYZ, by(SAC))
    expect(s.players.A.vp).toBe(4)
    const p = makeState()
    deploy(p, CAN, SAC)
    placeUnit(p, BOYZ, SPOTS[BOYZ])
    p.players.A.miracle.spentThisPhase = [] // cleared at the previous phase end
    killUnit(ctxOf(p).ctx, BOYZ, by(SAC))
    expect(p.players.A.vp).toBe(3)
    // another unit's Act of Faith does not count for this killer
    const o = makeState()
    deploy(o, CAN, SAC, SIS)
    placeUnit(o, BOYZ, SPOTS[BOYZ])
    o.players.A.miracle.spentThisPhase = [SIS]
    killUnit(ctxOf(o).ctx, BOYZ, by(SAC))
    expect(o.players.A.vp).toBe(3)
  })

  it('ADE-020 ADE-4: Hallowed Retribution — a kill with no attacker (Hazardous, own losses) scores 0; the opponent\'s kills of our units score nothing for us', () => {
    const s = makeState()
    deploy(s, CAN, SAC)
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    killUnit(ctxOf(s).ctx, BOYZ, { player: null, unitId: null, modelId: null, kind: 'other' })
    expect(s.players.A.vp).toBe(0)
    const o = makeState()
    deploy(o, CAN, SAC)
    placeUnit(o, BOYZ, SPOTS[BOYZ])
    killUnit(ctxOf(o, [1, 1, 1, 1, 1, 1]).ctx, SAC, { player: 'B', unitId: BOYZ, modelId: `${BOYZ}#0`, kind: 'melee' })
    expect(o.players.A.vp).toBe(0)
    expect(o.players.B.vp).toBe(0)
  })

  it('ADE-018 ADE-4: Hallowed Retribution — two separate enemy units each score once', () => {
    const s = makeState()
    deploy(s, CAN, SAC)
    const o = makeState()
    o.players.A.secondaryId = o.players.A.secondaryId
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    // the Ork player attaches nothing here: destroy two separate enemy units to confirm each scores once
    const { ctx } = ctxOf(s)
    killUnit(ctx, BOYZ, by(SAC))
    killUnit(ctx, 'B:warboss', by(SAC))
    expect(s.players.A.vp).toBe(6)
  })

  const turnEnd = (s: GameState) => {
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'turn.end', 'turn')
  }
  const CG = { secondaryId: 'ade.sec.consecrated-ground' }

  it('ADE-021 ADE-4: Consecrated Ground — round 1 → 0; round 2+ unit model within 6" of the centre → +3; with the WARLORD in it → +4 (not 7); two units → one award', () => {
    const r1 = makeState({ a: CG, round: 1 })
    placeUnit(r1, SIS, { x: -3, z: 0, gap: 0.3 })
    turnEnd(r1)
    expect(r1.players.A.vp).toBe(0)
    const s = makeState({ a: CG, round: 2 })
    placeUnit(s, SIS, { x: -3, z: 0, gap: 0.3 })
    farFromCentre(s)
    turnEnd(s)
    expect(s.players.A.vp).toBe(3)
    const w = makeState({ a: CG, round: 3 })
    placeUnit(w, SAC, { x: -3, z: 0, gap: 0.3 })
    placeUnit(w, CAN, [[-3, 1.4]])
    placeUnit(w, SIS, { x: -3, z: 3, gap: 0.3 })
    turnEnd(w)
    expect(w.players.A.vp).toBe(4)
    // too far: the nearest base edge is more than 6" from the centre
    const far = makeState({ a: CG, round: 2 })
    placeUnit(far, SIS, { x: 7, z: 0, gap: 0.3 })
    farFromCentre(far)
    turnEnd(far)
    expect(far.players.A.vp).toBe(0)
  })

  it('ADE-022 ADE-4: Consecrated Ground — only Battle-shocked units within 6" → 0 VP; the opponent\'s turn end scores nothing', () => {
    const s = makeState({ a: CG, round: 2 })
    placeUnit(s, SIS, { x: -3, z: 0, gap: 0.3 })
    farFromCentre(s)
    s.units[SIS].battleShocked = true
    turnEnd(s)
    expect(s.players.A.vp).toBe(0)
    const o = makeState({ a: CG, round: 2 })
    placeUnit(o, SIS, { x: -3, z: 0, gap: 0.3 })
    farFromCentre(o)
    o.activePlayer = 'B'
    turnEnd(o)
    expect(o.players.A.vp).toBe(0)
  })
})

// =====================================================================================================================
describe('Patrol stratagems (ADE-5)', () => {
  const placed = () => { const s = makeState(); deploy(s, CAN, SAC, SIS, ARC, BOYZ, BOSS); return s }

  it('ADE-029 ADE-5: Holy Radiance — −1 to hit for attacks against the unit (not its own) and FNP 5+, opponent\'s Shooting only, until phase end', () => {
    const s = placed()
    phase(s, 'shooting', 'B', { A: 1 })
    const trig = { unitId: BOYZ, targetUnitId: SAC }
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', HR, trig)).toEqual([[SAC]])
    phase(s, 'shooting', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', HR, trig)).toEqual([]) // never in own Shooting phase
    phase(s, 'fight', 'B', { A: 1 })
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', HR, trig)).toEqual([])
    phase(s, 'shooting', 'B', { A: 1 })
    const h = stratHarness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
    h.useOption(HR)
    const against = attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', SAC)
    const hit = (a: AttackContext) => hookService.collect(h.ctx, 'onHitRoll', { attack: a, roll: rollOf(3, 'hit') }).map((r) => r.result)
    expect(hit(against)).toEqual([{ kind: 'roll', modifier: -1 }])
    const penalties = (a: AttackContext) => hit(a).filter((r) => r.kind === 'roll' && r.modifier !== undefined)
    expect(penalties(attackCtx(s, `${SAC}#1`, 'ade.w.bolt-pistol', BOYZ))).toEqual([]) // the unit's own hit rolls are unaffected
    expect(penalties(attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', SIS))).toEqual([])
    const fnp = hookService.collect(h.ctx, 'onFeelNoPainRoll', { attack: against, roll: rollOf(3, 'fnp') }).map((r) => r.result)
    expect(fnp).toEqual([{ kind: 'roll', feelNoPain: 5 }])
    phase(s, 'shooting', 'B')
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(penalties(against)).toEqual([])
  })

  it('ADE-024 ADE-5: Ascetic Discipline — offered for a unit that has not been selected to shoot or fight; own Shooting, either Fight phase; not the opponent\'s Shooting', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.start', AD).map((x) => x[0]).sort()).toEqual([ARC, SAC, SIS].sort())
    s.units[SIS].turn.shotThisPhase = true
    expect(offeredIds(s, 'A', 'shooting.start', AD).map((x) => x[0])).not.toContain(SIS)
    s.units[SIS].turn.shotThisPhase = false // flags reset at every phase start
    phase(s, 'shooting', 'B', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.start', AD)).toEqual([]) // not in the opponent's Shooting phase
    phase(s, 'fight', 'B', { A: 1 })
    expect(offeredIds(s, 'A', 'fight.start', AD).map((x) => x[0]).sort()).toEqual([ARC, SAC, SIS].sort()) // opponent's Fight phase
    s.phaseState.fight!.fought.push(SIS)
    expect(offeredIds(s, 'A', 'fight.start', AD).map((x) => x[0])).not.toContain(SIS)
  })

  it('ADE-023 ADE-5: Ascetic Discipline — an unmodified 6 to wound improves AP by 2 on that attack; a plain success keeps AP; expires at phase end', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 1 })
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    h.useOption(AD, SAC)
    const woundHook = (attackerModel: string, weapon: string, die: number) =>
      hookService.collect(h.ctx, 'onWoundRoll', { attack: attackCtx(s, attackerModel, weapon, BOYZ), roll: rollOf(die, 'wound') }).map((r) => r.result)
    expect(woundHook(`${SAC}#1`, 'ade.w.bolt-pistol', 6)).toContainEqual({ kind: 'roll', critWoundAp: 2 })
    expect(woundHook(`${SIS}#1`, 'ade.w.boltgun', 6)).not.toContainEqual({ kind: 'roll', critWoundAp: 2 }) // another unit
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(woundHook(`${SAC}#1`, 'ade.w.bolt-pistol', 6)).toEqual([])
  })
})

// =====================================================================================================================
describe('Datasheet rules (ADE-6)', () => {
  const sacAttack = (s: GameState) => attackCtx(s, `${BOSS}#0`, 'ork.w.big-choppa', SAC, `${SAC}#0`)

  it('ADE-030 ADE-6: Lead the Righteous — a led unit may re-roll any hit die; not when the Canoness is not attached', () => {
    const s = makeState()
    deploy(s, CAN, SAC)
    const hits = (st: GameState, model: string, weapon: string, die = 6) =>
      hookService.collect(ctxOf(st).ctx, 'onHitRoll', { attack: attackCtx(st, model, weapon, BOYZ), roll: rollOf(die, 'hit') }).map((r) => r.result)
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    expect(hits(s, `${SAC}#0`, 'ade.w.hallowed-mace')).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(hits(s, `${SAC}#0`, 'ade.w.hallowed-mace', 3)).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(hits(s, `${CAN}#0`, 'ade.w.hallowed-chainsword')).toContainEqual({ kind: 'roll', reroll: 'all' })
    const u = makeState({ a: { attachments: [] } })
    deploy(u, CAN, SAC)
    placeUnit(u, BOYZ, SPOTS[BOYZ])
    expect(hits(u, `${SAC}#0`, 'ade.w.hallowed-mace')).toEqual([])
  })

  it('ADE-031 ADE-6: Null Rod — FNP 4+ vs a mortal wound and vs a Psychic weapon attack (bearer\'s unit); none vs a normal attack', () => {
    const s = makeState()
    deploy(s, CAN, SAC, SIS)
    const { ctx } = ctxOf(s)
    const fnp = (attack: AttackContext, mortal: boolean) =>
      hookService.collect(ctx, 'onFeelNoPainRoll', { attack, roll: rollOf(3, 'fnp'), mortal }).map((r) => r.result)
    const normal = sacAttack(s)
    expect(fnp(normal, false)).toEqual([])
    expect(fnp(normal, true)).toEqual([{ kind: 'roll', feelNoPain: 4 }])
    const psychic = { ...normal, weapon: { ...normal.weapon, abilities: [...normal.weapon.abilities, { ability: 'PSYCHIC' as const }] } }
    expect(fnp(psychic, false)).toEqual([{ kind: 'roll', feelNoPain: 4 }])
    expect(fnp({ ...attackCtx(s, `${BOSS}#0`, 'ork.w.big-choppa', SIS), weapon: psychic.weapon }, true)).toEqual([]) // other units do not have the Null Rod
    expect(fnp({ ...psychic, targetModelId: `${CAN}#0`, targetUnitId: CAN }, false)).toEqual([{ kind: 'roll', feelNoPain: 4 }])
  })

  it('ADE-033 ADE-6: Sworn Protectors — attacks against led Sacresants get −1 to wound (their own wound rolls unaffected); unled → no modifier', () => {
    const s = makeState()
    deploy(s, CAN, SAC, SIS)
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    const wound = (st: GameState, a: AttackContext) => hookService.collect(ctxOf(st).ctx, 'onWoundRoll', { attack: a, roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(wound(s, sacAttack(s))).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(wound(s, attackCtx(s, `${SAC}#0`, 'ade.w.hallowed-mace', BOYZ))).toEqual([])
    expect(wound(s, attackCtx(s, `${BOSS}#0`, 'ork.w.big-choppa', SIS, `${SIS}#0`))).toEqual([])
    const u = makeState({ a: { attachments: [] } })
    deploy(u, CAN, SAC)
    expect(wound(u, sacAttack(u))).toEqual([])
  })

  it('ADE-032 ADE-6: Simulacrum Imperialis — end of own Command phase, bearer in range of a controlled marker: D6 5 → +1 Miracle die of value 5; 3 → none', () => {
    const marker = (s: GameState) => Object.values(s.objectives).find((o) => !o.removed)!
    const setup = () => {
      const s = makeState()
      deploy(s, CAN, SAC)
      const o = marker(s)
      placeUnit(s, SIS, { x: o.pos.x - 6, z: o.pos.z, gap: 0.3 })
      const bearer = s.units[SIS].models.find((id) => s.models[id].datasheetModelId === 'sister-simulacrum') as string
      return { s, o, bearer }
    }
    const { s, o, bearer } = setup()
    s.models[bearer].pos = { x: o.pos.x, y: 0, z: o.pos.z - 1 }
    const run = ctxOf(s, [5])
    hookService.run(run.ctx, 'onPhaseEnd', {})
    expect(s.players.A.miracle.dice).toEqual([5])
    expect(of(run.events, 'MiracleDieGained')[0]).toMatchObject({ player: 'A', value: 5 })
    const low = setup()
    low.s.models[low.bearer].pos = { x: low.o.pos.x, y: 0, z: low.o.pos.z - 1 }
    hookService.run(ctxOf(low.s, [3]).ctx, 'onPhaseEnd', {})
    expect(low.s.players.A.miracle.dice).toEqual([])
  })

  it('ADE-032 ADE-6: Simulacrum Imperialis — bearer dead → no roll; bearer out of range but another model of the unit in range → roll; opponent\'s Command phase → no roll', () => {
    const marker = (s: GameState) => Object.values(s.objectives).find((o) => !o.removed)!
    const build = () => {
      const s = makeState()
      deploy(s, CAN, SAC)
      const o = marker(s)
      placeUnit(s, SIS, { x: o.pos.x - 6, z: o.pos.z, gap: 0.3 })
      const ids = s.units[SIS].models
      const bearer = ids.find((id) => s.models[id].datasheetModelId === 'sister-simulacrum') as string
      const other = ids.find((id) => id !== bearer) as string
      return { s, o, bearer, other }
    }
    const dead = build()
    dead.s.models[dead.other].pos = { x: dead.o.pos.x, y: 0, z: dead.o.pos.z - 1 }
    const { ctx } = ctxOf(dead.s, []) // an empty script throws on any roll
    // remove the bearer
    dead.s.units[SIS].models = dead.s.units[SIS].models.filter((id) => id !== dead.bearer)
    delete dead.s.models[dead.bearer]
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(dead.s.players.A.miracle.dice).toEqual([])
    const far = build()
    far.s.models[far.other].pos = { x: far.o.pos.x, y: 0, z: far.o.pos.z - 1 } // another model on the marker; the bearer stays 6" away
    hookService.run(ctxOf(far.s, [6]).ctx, 'onPhaseEnd', {})
    expect(far.s.players.A.miracle.dice).toEqual([6])
    const opp = build()
    opp.s.models[opp.other].pos = { x: opp.o.pos.x, y: 0, z: opp.o.pos.z - 1 }
    opp.s.activePlayer = 'B'
    hookService.run(ctxOf(opp.s, []).ctx, 'onPhaseEnd', {})
    expect(opp.s.players.A.miracle.dice).toEqual([])
  })

  it('ADE-032 RC-ADE-17: Simulacrum Imperialis — the attached Canoness on the marker counts as range for the bearer\'s unit (one roll)', () => {
    const s = makeState({ a: { attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sisters' }] } })
    const o = Object.values(s.objectives).find((x) => !x.removed)!
    placeUnit(s, SIS, { x: -20, z: -12.5, gap: 0.3 }) // well clear of every marker: only the Canoness on `o` can supply range
    placeUnit(s, CAN, [[o.pos.x, o.pos.z]])
    expect(s.units[CAN].bodyguardUnitId).toBe(SIS)
    hookService.run(ctxOf(s, [6]).ctx, 'onPhaseEnd', {})
    expect(s.players.A.miracle.dice).toEqual([6])
  })

  const arcoMelee = (s: GameState) => weaponService.effectiveWeapon(s, `${ARC}#0`, 'ade.w.arco-flails')

  it('ADE-034 ADE-6: Extremis Trigger Word — triggered → arco-flails A 6 and Hazardous this phase; declined → A 4, no Hazardous', () => {
    const s = makeState()
    deploy(s, ARC)
    s.phase = 'fight'
    const { ctx } = ctxOf(s)
    expect(arcoMelee(s).A).toBe(4)
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', ARC)).toBe(true)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual(['use', 'decline'])
    answerOption(ctx, 'use')
    expect(Number(arcoMelee(s).A)).toBe(6)
    expect(arcoMelee(s).abilities.some((a) => a.ability === 'HAZARDOUS')).toBe(true)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(Number(arcoMelee(s).A)).toBe(4)
    expect(arcoMelee(s).abilities.some((a) => a.ability === 'HAZARDOUS')).toBe(false)
    const d = makeState()
    deploy(d, ARC)
    d.phase = 'fight'
    const dctx = ctxOf(d).ctx
    hookService.offerPicks(dctx, 'fight.unitSelected', ARC)
    answerOption(dctx, 'decline')
    expect(Number(arcoMelee(d).A)).toBe(4)
    expect(arcoMelee(d).abilities.some((a) => a.ability === 'HAZARDOUS')).toBe(false)
    // not offered for another unit
    const o = makeState()
    deploy(o, SAC)
    o.phase = 'fight'
    expect(hookService.offerPicks(ctxOf(o).ctx, 'fight.unitSelected', SAC)).toBe(false)
  })
})

// =====================================================================================================================
// local helpers for the attack-sequence / command-phase tests below
const ESAC = 'B:sacresants', ECAN = 'B:canoness'
const SIX = Array.from({ length: 60 }, () => 6)
const targetOf = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const modelWith = (s: GameState, unitId: string, weaponId: string): string => {
  const id = s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))
  if (!id) throw new Error(`no model of ${unitId} carries ${weaponId}`)
  return id
}
// drives the attack sequence; a Precision (allocateAttack) offer is taken for its first eligible model and recorded in `seen`
function driveAttack(ctx: EngineContext, seen: PendingDecision[] = []): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without decision')
    seen.push(pending)
    let action: Action
    if (pending.kind === 'allocateAttack') action = { type: 'allocateAttack', player: pending.player, decisionId: pending.id, modelId: pending.context.eligibleModels[0] }
    else if ('options' in pending && pending.options.length > 0) action = pending.options[0].action
    else action = { type: 'pass', player: pending.player, decisionId: pending.id }
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}
const withKeyword = (s: GameState, unitId: string, keyword: string) => {
  const id = s.units[unitId].datasheetId
  // datasheets are frozen and shared with the bundle: swap in a fresh table holding a copy of this one
  s.datasheets = { ...s.datasheets, [id]: { ...s.datasheets[id], keywords: [...s.datasheets[id].keywords, keyword] } }
}

// =====================================================================================================================
describe('Battle-shock and Acts of Faith (ADE-2.2)', () => {
  // advances the Command phase, declining the Insane Bravery window the Battle-shock test opens (1 CP each), until it stops on a miracleDie decision or finishes
  function advanceCommand(ctx: EngineContext): void {
    for (let i = 0; i < 5; i++) {
      const r = commandModule.advance(ctx)
      const p = ctx.state.pending
      if (r !== 'pending' || !p || p.kind === 'chooseOption' && p.context.topic === 'miracleDie') return
      ctx.state.pending = null
      const rej = ctx.services.stratagems.handle(ctx, { type: 'pass', player: p.player, decisionId: p.id }, p)
      if (rej) throw new Error(`rejected: ${rej.code}`)
    }
  }

  function shockedSisters(): GameState {
    const s = makeState()
    deploy(s, SIS, CAN, SAC)
    for (const id of s.units[SIS].models.slice(1)) delete s.models[id]
    s.units[SIS].models = s.units[SIS].models.slice(0, 1) // below half strength -> tested in the Command phase
    return s
  }

  it('ADE-008 ADE-2.2: a Sororitas unit\'s Command-phase Battle-shock test raises a miracleDie decision; the substituted die is one of the 2D6', () => {
    const s = shockedSisters()
    s.players.A.miracle.dice = [6]
    const { ctx, events } = ctxOf(s, [1, 2]) // both dice are rolled; the Miracle die replaces the first
    commandModule.enter(ctx)
    advanceCommand(ctx)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.topic).toBe('miracleDie')
    expect(pending.context.data).toMatchObject({ purpose: 'battleShock', unitId: SIS, count: 2, needed: 7, pool: [6] })
    expect(of(events, 'BattleShockTested')).toHaveLength(0)
    s.pending = null
    expect(miracleHandler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'use', dieIndexes: [0] }, pending)).toBeUndefined()
    expect(s.players.A.miracle.dice).toEqual([])
    advanceCommand(ctx)
    // Miracle die 6 + the one rolled die 2 = 8 against Ld 7
    expect(of(events, 'BattleShockTested')).toMatchObject([{ unitId: SIS, roll: 8, ld: 7, passed: true }])
    expect(s.players.A.miracle.spentThisPhase).toContain(SIS)
  })

  it('ADE-008 declining the Miracle die rolls the whole 2D6; an empty pool never asks', () => {
    const s = shockedSisters()
    s.players.A.miracle.dice = [6]
    const { ctx, events } = ctxOf(s, [1, 2])
    commandModule.enter(ctx)
    advanceCommand(ctx)
    const pending = s.pending as ChooseOptionDecision
    s.pending = null
    miracleHandler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'skip' }, pending)
    advanceCommand(ctx)
    expect(of(events, 'BattleShockTested')).toMatchObject([{ roll: 3, ld: 7, passed: false }])
    expect(s.players.A.miracle.dice).toEqual([6])
    const e = shockedSisters()
    const ectx = ctxOf(e, [1, 2])
    commandModule.enter(ectx.ctx)
    advanceCommand(ectx.ctx)
    expect(e.pending).toBeNull()
    expect(of(ectx.events, 'BattleShockTested')).toHaveLength(1)
  })
})

// =====================================================================================================================
describe('A Martyr\'s Death with a discarded die (ADE-026)', () => {
  const MD = 'ade.s.a-martyrs-death'
  function armed() {
    const s = makeState()
    deploy(s, CAN, SAC, SIS, BOYZ)
    phase(s, 'shooting', 'B', { A: 1 })
    s.players.A.miracle.dice = [2, 5]
    const h = stratHarness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: SAC })
    h.useOption(MD, SAC)
    return { s, h }
  }

  it('ADE-026 ADE-5: discarding a die adds +1 to the last-stand roll (D6 3 + 1 = 4 -> the model stays) and takes the die from the pool', () => {
    const { s, h } = armed()
    const pending = s.pending as ChooseOptionDecision
    expect(pending.options.map((o) => o.id)).toEqual(['keep', 'discard:2', 'discard:5'])
    answerOption(h.ctx, 'discard:2')
    expect(s.players.A.miracle.dice).toEqual([5])
    expect(of(h.events, 'MiracleDieSpent')[0]).toMatchObject({ mode: 'discard', value: 2, player: 'A' })
    expect(s.phaseState.marks).toContain(`martyrBonus:${SAC}`)
    // a model of the unit is destroyed before it has shot: D6 3 + 1 = 4 -> removal deferred
    const { ctx, events } = ctxOf(s, [3])
    const victim = s.units[SAC].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: BOYZ, modelId: null, kind: 'ranged' })
    expect(s.models[victim]?.removalDeferred).toBe(true)
    expect(of(events, 'ModelRemovalDeferred').map((e) => e.modelId)).toEqual([victim])
    expect(s.players.A.miracle.dice).toEqual([5])
  })

  it('ADE-026 ADE-5: keeping the dice leaves the pool alone and D6 3 falls short (model removed at once)', () => {
    const { s, h } = armed()
    answerOption(h.ctx, 'keep')
    expect(s.players.A.miracle.dice).toEqual([2, 5])
    const { ctx, events } = ctxOf(s, [3])
    const victim = s.units[SAC].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: BOYZ, modelId: null, kind: 'ranged' })
    expect(s.models[victim]).toBeUndefined()
    expect(of(events, 'ModelRemovalDeferred')).toHaveLength(0)
  })
})

// =====================================================================================================================
describe('Sororitas weapons and Arco-flagellants through the attack sequence (ADE-035..038)', () => {
  // the B player's Ork Boyz shoot a slugga at the Arco-flagellants
  function shootArco(dice: number[]) {
    const s = makeState()
    s.activePlayer = 'B'
    s.phase = 'shooting'
    placeUnit(s, ARC, { x: 8, z: -3, gap: 0.3 })
    placeUnit(s, BOYZ, { x: -12, z: -3, gap: 0.3 })
    const shooter = modelWith(s, BOYZ, 'ork.w.slugga')
    const wounds = (id: string) => s.models[id].woundsRemaining
    const before = s.units[ARC].models.map(wounds)
    const { ctx, events } = ctxOf(s, [...dice, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [targetOf(shooter, 'ork.w.slugga', ARC, 1)] })
    driveAttack(ctx)
    return { s, events, before, after: s.units[ARC].models.map(wounds) }
  }

  it('ADE-035 ADE-6: Arco-flagellants get no armour save (Sv 7+), and Feel No Pain 5+ is rolled per wound point', () => {
    // hit 6, wound 6, a save die of 5 that cannot pass 7+ (not even with a cover bonus), then the FNP die 4 -> fails -> the wound is suffered
    const hurt = shootArco([6, 6, 5, 4])
    expect(of(hurt.events, 'SaveRolled')[0]).toMatchObject({ die: 5, needed: 7, saved: false })
    expect(of(hurt.events, 'FeelNoPainRolled')).toMatchObject([{ die: 4, needed: 5 }])
    expect(hurt.after).not.toEqual(hurt.before)
    // FNP die 5 -> the wound is ignored
    const shrugged = shootArco([6, 6, 5, 5])
    expect(of(shrugged.events, 'FeelNoPainRolled')).toMatchObject([{ die: 5, needed: 5 }])
    expect(shrugged.after).toEqual(shrugged.before)
  })

  function shootCanoness(woundDie: number, o: { psyker: boolean }) {
    const s = makeState({ a: { attachments: [] }, bAde: true })
    placeUnit(s, CAN, [[-12, -3]])
    placeUnit(s, ESAC, { x: 8, z: -3, gap: 0.3 })
    placeUnit(s, ECAN, [[9, -6]])
    if (o.psyker) withKeyword(s, ESAC, 'PSYKER')
    s.activePlayer = 'A'
    s.phase = 'shooting'
    // hit 5, wound die, then a failed Null Rod Feel No Pain (1) against the mortal wound
    const { ctx, events } = ctxOf(s, [5, woundDie, 1, ...SIX])
    const seen: PendingDecision[] = []
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: CAN, overwatch: false, targets: [targetOf(`${CAN}#0`, 'ade.w.condemnor-boltgun', ESAC, 1)] })
    driveAttack(ctx, seen)
    return { s, events, seen }
  }

  it('ADE-036 ADE-6: Condemnor boltgun — an unmodified 2 to wound a PSYKER is critical (Anti 2+) -> Devastating mortal wound, no save; Precision lets the attacker pick the attached CHARACTER', () => {
    const r = shootCanoness(2, { psyker: true })
    expect(of(r.events, 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: true, critical: true })
    expect(of(r.events, 'SaveRolled')).toHaveLength(0)
    const alloc = r.seen.find((p) => p.kind === 'allocateAttack')
    expect(alloc).toMatchObject({ player: 'A' })
    expect((alloc as { context: { eligibleModels: string[] } }).context.eligibleModels).toEqual([`${ECAN}#0`])
    expect(of(r.events, 'DamageApplied').some((d) => d.modelId === `${ECAN}#0` && d.mortal)).toBe(true)
  })

  it('ADE-036 the same 2 against a non-PSYKER is an ordinary failed wound roll (no mortal wound, no allocation)', () => {
    const r = shootCanoness(2, { psyker: false })
    expect(of(r.events, 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: false, critical: false })
    expect(of(r.events, 'DamageApplied')).toHaveLength(0)
  })

  function shootCombi(woundDie: number) {
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 8, z: -3, gap: 0.3 })
    s.activePlayer = 'A'
    s.phase = 'shooting'
    const shooter = modelWith(s, SIS, 'ade.w.combi-weapon')
    const { ctx, events } = ctxOf(s, [4, woundDie, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SIS, overwatch: false, targets: [targetOf(shooter, 'ade.w.combi-weapon', BOYZ, 1)] })
    driveAttack(ctx)
    return { s, events }
  }

  it('ADE-037 ADE-6: combi-weapon Anti-Infantry 4+ — an unmodified 4 to wound INFANTRY is critical -> Devastating Wounds mortal; a 3 is not', () => {
    const crit = shootCombi(4)
    expect(of(crit.events, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: true })
    expect(of(crit.events, 'SaveRolled')).toHaveLength(0)
    expect(of(crit.events, 'DamageApplied').some((d) => d.mortal)).toBe(true)
    const miss = shootCombi(3)
    expect(of(miss.events, 'WoundRolled')[0]).toMatchObject({ die: 3, wounded: false })
  })

  it('ADE-038 ADE-6: Ministorum flamer — Torrent auto-hits D6 attacks (no hit roll) and Ignores Cover (a granted Benefit of Cover adds nothing to the save)', () => {
    function flame(weaponId: string) {
      const s = makeState()
      placeUnit(s, SIS, { x: 2, z: -3, gap: 0.3 })
      placeUnit(s, BOYZ, { x: 8, z: -3, gap: 0.3 })
      s.activePlayer = 'A'
      s.phase = 'shooting'
      const shooter = modelWith(s, SIS, weaponId)
      const { ctx, events } = ctxOf(s, [3, ...SIX])
      effectService.grant(ctx, BOYZ, [], { sourceAbilityId: 'core.s.smokescreen', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SIS, overwatch: false, targets: [targetOf(shooter, weaponId, BOYZ, null)] })
      driveAttack(ctx)
      return events
    }
    const ev = flame('ade.w.ministorum-flamer')
    expect(of(ev, 'HitRolled').map((h) => h.auto)).toEqual([true, true, true]) // D6 = 3 attacks, none rolled to hit
    expect(of(ev, 'WoundRolled')).toHaveLength(3)
    // Boyz Sv 5+: cover would make it 4+; the flamer ignores it, the combi-weapon does not
    expect(of(ev, 'SaveRolled').every((x) => x.needed === 5)).toBe(true)
    const bolt = flame('ade.w.combi-weapon')
    expect(of(bolt, 'SaveRolled').every((x) => x.needed === 4)).toBe(true)
  })

  it('ADE-038 ADE-6: hallowed mace — Lethal Hits: a critical hit wounds automatically (no wound roll)', () => {
    const s = makeState()
    s.activePlayer = 'A'
    s.phase = 'fight'
    placeUnit(s, SAC, [[0, 0]])
    placeUnit(s, BOYZ, [[1.6, 0]])
    const { ctx, events } = ctxOf(s, [6, ...SIX])
    const mace = modelWith(s, SAC, 'ade.w.hallowed-mace')
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: SAC, overwatch: false, targets: [targetOf(mace, 'ade.w.hallowed-mace', BOYZ, 1)] })
    driveAttack(ctx)
    expect(of(events, 'HitRolled')[0]).toMatchObject({ die: 6, critical: true })
    expect(of(events, 'WoundRolled')[0]).toMatchObject({ auto: true, wounded: true })
  })
})

// =====================================================================================================================
describe('Hallowed Retribution on attached units / Consecrated Ground geometry (ADE-018, ADE-021)', () => {
  it('ADE-018 ADE-4: Hallowed Retribution — each half of an attached enemy unit scores: +3 VP per destroyed half (RC-ADE-13), 6 VP total', () => {
    const s = makeState({ bAde: true })
    deploy(s, CAN, SAC, SIS)
    placeUnit(s, ESAC, { x: -6, z: 8, gap: 0.3 })
    placeUnit(s, ECAN, [[-4, 10]])
    expect(s.units[ECAN].bodyguardUnitId).toBe(ESAC)
    const { ctx } = ctxOf(s, [3, 3, 3, 3])
    const by = { player: 'A' as const, unitId: SAC, modelId: `${SAC}#0`, kind: 'melee' as const }
    killUnit(ctx, ESAC, by)
    expect(s.players.A.vp).toBe(3) // RC-ADE-13: each destroyed half scores
    killUnit(ctx, ECAN, by)
    expect(s.players.A.vp).toBe(6)
    expect(s.players.A.vpBySource['hallowed-retribution']).toBe(6)
  })

  it('ADE-021 ADE-4: Consecrated Ground measures horizontally — a unit on an elevated level above the centre still counts', () => {
    const s = makeState({ a: { secondaryId: 'ade.sec.consecrated-ground' }, round: 2 })
    placeUnit(s, SIS, [{ x: 0, y: 14, z: 0 }])
    farFromCentre(s)
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.A.vp).toBe(3)
  })
})
