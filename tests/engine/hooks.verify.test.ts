// engine/hooks — adversarial verification tests (STRAT-*, LEAD-*); written by the verifier, not the module owner
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type Action, type AttackContext, type DiceRoll, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
  type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

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
const FO = 'core.s.fire-overwatch', GW = 'sm.s.gene-wrought-resilience', CR = 'core.s.command-reroll', HI = 'core.s.heroic-intervention'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; bFull?: PlayerSetup; data?: DataBundle }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM(o.a), B: o.bFull ?? ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, o.data ?? bundle, 'verify', ENGINE_VERSION)
  s.round = 2
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

function harness(state: GameState, dice: number[] = []) {
  const mortal: { target: string; count: number; source: string }[] = []
  const services: Services = {
    ...DEFAULT_MODULES.services, hooks: hookService, effects: effectService, stratagems: stratagemService, leaders: leaderService,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: (_c, target, count, source) => { mortal.push({ target, count, source }) }, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics }
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
  return { ctx, events, mortal, answer, useOption }
}

const options = (s: GameState): UseStratagemAction[] => ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((o) => o.action as UseStratagemAction)
const ids = (xs: UseStratagemAction[], id: string) => xs.filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? []), ...(x.targets.objectiveId ? [x.targets.objectiveId] : [])])
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger = {}) => stratagemService.options(s, p, w, trigger)

function attack(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 1, halfRange: true, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
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
const engageTerms = (s: GameState, unitId: string, mm = 32) => placeUnit(s, unitId, { x: -4, z: -3 + 0.787 + mm / 25.4 / 2 + 0.5, gap: 0.3 })

describe('engine/hooks — verifier', () => {
  it('STRAT-002 verify: Counter-offensive is not offered to a not-yet-fought unit outside Engagement Range', () => {
    const s = makeState()
    phase(s, 'fight', 'B', { A: 2 })
    s.phaseState.fight!.fought.push(BOYZ)
    expect(offered(s, 'A', 'fight.attacksResolved', { unitId: BOYZ }).map((x) => x.stratagemId)).not.toContain('core.s.counter-offensive')
  })

  it('STRAT-003 verify: once per phase is per player and per phase — the next phase and the other player\'s phase are fresh', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 2 })
    const trig = { unitId: BOYZ2, targetUnitId: T }
    const h = harness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ2, h.ctx.order.defensive('A'), trig)
    expect(h.useOption(GW)).toBeNull()
    phase(s, 'shooting', 'B', { A: 1 })
    expect(ids(offered(s, 'A', 'shooting.targetsDeclared', trig), GW)).toEqual([])
    phase(s, 'fight', 'B', { A: 1 })
    expect(ids(offered(s, 'A', 'fight.targetsDeclared', trig), GW)).toEqual([[T]])
    phase(s, 'fight', 'A', { A: 1 })
    expect(ids(offered(s, 'A', 'fight.targetsDeclared', trig), GW)).toEqual([[T]])
  })

  it('STRAT-009 verify: a crafted second Insane Bravery in a later round is rejected with E_STRATAGEM_USED', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 2 })
    const h = harness(s)
    h.ctx.window('command.battleShock', INF, h.ctx.order.only('A'), { unitId: INF })
    h.useOption('core.s.insane-bravery')
    s.round = 3
    phase(s, 'command', 'A', { A: 2 })
    const fake = { id: 'd:50', kind: 'stratagemWindow', player: 'A', window: 'command.battleShock', canPass: true, context: { trigger: { unitId: INF, targetUnitId: null, rollId: null }, usable: [] }, options: [] } as PendingDecision
    const r = stratagemService.validate(s, { type: 'useStratagem', player: 'A', decisionId: 'd:50', stratagemId: 'core.s.insane-bravery', targets: { unitIds: [INF] } } as Action, fake)
    expect(r?.code).toBe('E_STRATAGEM_USED')
  })

  it('STRAT-033 verify: Epic Challenge for the Captain leading Terminators (selected under either id); Battle-shocked → not offered', () => {
    const smB: PlayerSetup = { ...SM(), name: 'SM2' }
    const s = makeState({ bFull: smB })
    placeUnit(s, 'B:terminator-squad', { x: -4, z: 3 })
    placeUnit(s, 'B:captain-octavius', [[-6.5, 5]])
    placeUnit(s, 'B:librarian-tantus', [[18, 12]])
    placeUnit(s, 'B:infernus-squad', { x: 8, z: 12 })
    placeUnit(s, T, { x: -4, z: 3 - 0.787 * 2 - 0.5 })
    placeUnit(s, CAP, [[-6.5, 3 - 0.787 * 2 - 0.5]])
    phase(s, 'fight', 'A', { A: 1 })
    const ec = (unitId: string) => ids(offered(s, 'A', 'fight.unitSelected', { unitId }), 'core.s.epic-challenge')
    expect(ec(T)).toEqual([['B:terminator-squad', 'A:captain-octavius#0']])
    expect(ec(CAP)).toEqual([['B:terminator-squad', 'A:captain-octavius#0']])
    s.units[T].battleShocked = true
    s.units[CAP].battleShocked = true
    expect(ec(T)).toEqual([])
  })

  it('STRAT-005 verify (Heroic Intervention): a Battle-shocked unit or a unit already in Engagement Range is not offered', () => {
    const s = makeState()
    phase(s, 'charge', 'A', { B: 1 })
    placeUnit(s, DREAD, [[0, 4.5]])
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), HI)).toContainEqual([T, DREAD])
    s.units[DREAD].battleShocked = true
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), HI)).not.toContainEqual([T, DREAD])
    s.units[DREAD].battleShocked = false
    engageTerms(s, BOYZ)
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), HI)).not.toContainEqual([T, BOYZ])
  })

  it('STRAT-019 verify: a VEHICLE in Engagement Range of the moving unit may still Fire Overwatch at it (R-6.3)', () => {
    const s = makeState()
    phase(s, 'movement', 'A', { B: 1 })
    placeUnit(s, DREAD, [[0.15, -3 + 0.787 + 1.18 + 0.5]])
    s.units[T].turn.moveType = 'fallBack'
    const h = harness(s)
    expect(h.ctx.window('movement.moveStarted', T, h.ctx.order.only('B'), { unitId: T })).toBe(true)
    expect(ids(options(s), FO)).toContainEqual([T, DREAD])
  })

  it('STRAT-019 verify: Boyz with Pistols in Engagement Range of the unit falling back may Fire Overwatch at it (R-6.2 Pistol exception)', () => {
    const s = makeState()
    phase(s, 'movement', 'A', { B: 1 })
    engageTerms(s, BOYZ)
    s.units[T].turn.moveType = 'fallBack'
    const h = harness(s)
    h.ctx.window('movement.moveStarted', T, h.ctx.order.only('B'), { unitId: T })
    expect(ids(options(s), FO)).toContainEqual([T, BOYZ])
  })

  it('STRAT-032 verify: a single +2 CP non-automatic gain is capped at +1 for the round (R-4.2)', () => {
    const s = makeState()
    const h = harness(s)
    expect(hookService.gainCp(h.ctx, 'B', 2, 'x')).toBe(1)
    expect(s.players.B.cp).toBe(1)
  })

  it('LEAD-010 verify (R-4.3): the attached unit tests against the best Ld among all its models', () => {
    const data = withData((b) => { b.datasheets['sm.captain-octavius'].stats.Ld = 5 })
    const s = makeState({ data })
    phase(s, 'command', 'A')
    expect(hookService.battleShockTest(harness(s, [2, 3]).ctx, T, 'test')).toBe(true)
    const alone = makeState({ data, a: { attachments: [] } })
    phase(alone, 'command', 'A')
    expect(hookService.battleShockTest(harness(alone, [2, 3]).ctx, T, 'test')).toBe(false)
  })

  it('STRAT-027 verify (R-4.7): a forced test failed by the second player in the first player\'s turn lasts until that player\'s Command phase this round', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    expect(hookService.battleShockTest(harness(s, [1, 1]).ctx, BOYZ, 'test')).toBe(false)
    expect(s.units[BOYZ].battleShockExpiresRound).toBe(2)
  })

  it('STRAT-006 verify: Command Re-roll is only offered to the player who made the roll', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 1, B: 1 })
    const h = harness(s, [2])
    const roll = h.ctx.roll({ purpose: 'save', player: 'B', unitId: BOYZ })
    expect(stratagemService.usable(s, 'A', 'any.rollMade', { rollId: roll.id })).toEqual([])
    expect(stratagemService.usable(s, 'B', 'any.rollMade', { rollId: roll.id })).toEqual([CR])
  })

  it('LEAD-006 verify: the surviving leader (SS 1, W6) is below half at 2 wounds, not at 3', () => {
    const s = makeState()
    const h = harness(s)
    for (const id of [...s.units[T].models]) removeModel(s, id)
    leaderService.detach(h.ctx, T)
    const cap = s.models[s.units[CAP].models[0]]
    cap.woundsRemaining = 3
    expect(leaderService.isBelowHalfStrength(s, CAP)).toBe(false)
    cap.woundsRemaining = 2
    expect(leaderService.isBelowHalfStrength(s, CAP)).toBe(true)
  })

  it('STRAT-018 verify: Tank Shock is not offered when no VEHICLE model of the charger is in Engagement Range of an enemy', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { B: 1 })
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: DREAD }), 'core.s.tank-shock')).toEqual([])
  })

  it('STRAT-022 verify: Gene-wrought compares the attack\'s modified Strength (Waaagh! +1 S) with T', () => {
    const data = withData((b) => { b.weapons['ork.w.choppa'].S = 5 })
    const s = makeState({ data })
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'B', { A: 1 })
    const h = harness(s)
    const w = s.abilities['ork.a.waaagh']
    effectService.grant(h.ctx, BOYZ, w.effect!, { sourceAbilityId: w.id, sourceUnitId: BOYZ, scope: { who: 'self' }, duration: 'untilEndOfRound' })
    const boy = 'B:boyz-a#1'
    const choppa = s.weapons['ork.w.choppa']
    expect(hookService.statFor(s, { unitId: BOYZ, modelId: boy, weapon: choppa, stat: 'S' }, choppa.S)).toBe(6)
    h.ctx.window('fight.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })
    h.useOption(GW)
    const res = hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, boy, 'ork.w.choppa', T), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(res).toEqual([{ kind: 'roll', modifier: -1 }])
  })

  it('STRAT-012 verify: Rapid Ingress is not offered for a Reserves unit without Deep Strike (Infernus)', () => {
    const s = makeState()
    s.units[INF].location = 'reserves'
    phase(s, 'movement', 'B', { A: 1 })
    expect(ids(offered(s, 'A', 'movement.end'), 'core.s.rapid-ingress')).toEqual([])
  })
})

// ---- verifier round 2 ----
const GTG2 = 'core.s.go-to-ground', VI = 'sm.s.veteran-instincts', RI = 'core.s.rapid-ingress', EC = 'core.s.epic-challenge', TS = 'core.s.tank-shock'

describe('engine/hooks — verifier round 2', () => {
  it('STRAT-005 verify (R-11.2): Command Re-roll is not offered for a roll made for the player\'s own Battle-shocked unit', () => {
    const s = makeState()
    phase(s, 'movement', 'A', { A: 1 })
    s.units[INF].battleShocked = true
    const h = harness(s, [2, 5])
    h.ctx.rollOnce('adv', { purpose: 'advance', player: 'A', unitId: INF })
    expect(s.pending).toBeNull()
  })

  it('STRAT-019 verify (R-11.5, 00-arch §4): Fire Overwatch is offered at charge.moveStarted but not at charge.moveEnded', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { A: 2 })
    expect(ids(offered(s, 'A', 'charge.moveStarted', { unitId: BOYZ }), FO).length).toBeGreaterThan(0)
    expect(ids(offered(s, 'A', 'charge.moveEnded', { unitId: BOYZ }), FO)).toEqual([])
  })

  it('LEAD-009 verify (R-10.1/R-1.7): Gene-wrought still applies to attacks on the CHARACTER after the last bodyguard dies, before the split', () => {
    const data = withData((b) => { b.weapons['ork.w.choppa'].S = 6 })
    const s = makeState({ data })
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'B', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })
    h.useOption(GW)
    for (const id of [...s.units[T].models]) removeModel(s, id)
    const res = hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, 'B:boyz-a#1', 'ork.w.choppa', CAP), roll: rollOf(4, 'wound') }).filter((r) => r.source.id === GW)
    expect(res.map((r) => r.result)).toEqual([{ kind: 'roll', modifier: -1 }])
  })

  it('FIGHT-027/STRAT-033 verify: Epic Challenge grants Precision to the CHARACTER\'s melee weapons only, and it ends with the phase', () => {
    const smB: PlayerSetup = { ...SM(), name: 'SM2' }
    const s = makeState({ bFull: smB, a: { attachments: [{ leaderRef: 'librarian-tantus', bodyguardRef: 'terminator-squad' }] } })
    placeUnit(s, 'B:terminator-squad', { x: -4, z: 3 })
    placeUnit(s, 'B:captain-octavius', [[-6.5, 5]])
    placeUnit(s, 'B:librarian-tantus', [[18, 12]])
    placeUnit(s, 'B:infernus-squad', { x: 8, z: 12 })
    const z = 3 - 0.787 * 2 - 0.5
    placeUnit(s, T, { x: -4, z })
    placeUnit(s, LIB, [[-6.5, z]])
    placeUnit(s, CAP, [[-18, -12]])
    phase(s, 'fight', 'A', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.unitSelected', T, h.ctx.order.only('A'), { unitId: T })
    expect(h.useOption(EC, 'A:librarian-tantus#0')).toBeNull()
    const lib = 'A:librarian-tantus#0'
    const has = (m: string, w: string) => hookService.weaponAbilitiesFor(s, m, s.weapons[w]).some((a) => a.ability === 'PRECISION')
    expect(has(lib, 'sm.w.force-weapon')).toBe(true)
    expect(has(lib, 'sm.w.smite')).toBe(false)
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(has(lib, 'sm.w.force-weapon')).toBe(false)
  })

  it('STRAT-014 verify: Go to Ground on the attached Captain+Terminators (targeted via the Captain) → one option, cover + 6+ invuln for both halves until phase end', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 1 })
    const trig = { unitId: BOYZ, targetUnitId: CAP }
    expect(ids(offered(s, 'A', 'shooting.targetsDeclared', trig), GTG2)).toEqual([[T]])
    const h = harness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
    h.useOption(GTG2)
    expect(hookService.hasBenefitOfCover(s, CAP)).toBe(true)
    const inv = hookService.collect(h.ctx, 'onSaveRoll', { attack: attack(s, 'B:boyz-a#1', 'ork.w.slugga', CAP), roll: rollOf(3, 'save') }).map((r) => r.result)
    expect(inv).toContainEqual({ kind: 'roll', invuln: 6 })
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(hookService.hasBenefitOfCover(s, T)).toBe(false)
  })

  it('STRAT-018 verify: the reacting player\'s engaged Dread that did not charge is not offered Tank Shock after the active player\'s charge', () => {
    const s = makeState()
    phase(s, 'charge', 'A', { B: 2 })
    placeUnit(s, DREAD, [[0.15, -3 + 0.787 + 1.18 + 0.5]])
    expect(ids(offered(s, 'B', 'charge.moveEnded', { unitId: T }), TS)).toEqual([])
  })

  it('STRAT-023 verify: Veteran Instincts on Captain+Terminators → Captain wound rolls re-roll 1s vs Boyz, all vs VEHICLE; never hit rolls', () => {
    const s = makeState()
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'A', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.start', 'fs', h.ctx.order.only('A'), {})
    expect(h.useOption(VI, T)).toBeNull()
    const cap = 'A:captain-octavius#0'
    const vi = (hook: 'onWoundRoll' | 'onHitRoll', target: string, purpose: DiceRoll['purpose']) =>
      hookService.collect(h.ctx, hook, { attack: attack(s, cap, 'sm.w.relic-weapon', target), roll: rollOf(1, purpose) }).filter((r) => r.source.id === VI).map((r) => r.result)
    expect(vi('onWoundRoll', BOYZ, 'wound')).toEqual([{ kind: 'roll', reroll: 'ones' }])
    expect(vi('onWoundRoll', DREAD, 'wound')).toEqual([{ kind: 'roll', reroll: 'all' }])
    expect(vi('onHitRoll', BOYZ, 'hit')).toEqual([])
  })

  it('STRAT-012 verify: Rapid Ingress is reactive — not offered at the end of the player\'s own Movement phase', () => {
    const s = makeState()
    s.units[T].location = 'reserves'
    s.units[CAP].location = 'reserves'
    phase(s, 'movement', 'A', { A: 1 })
    expect(ids(offered(s, 'A', 'movement.end'), RI)).toEqual([])
    phase(s, 'movement', 'B', { A: 1 })
    expect(ids(offered(s, 'A', 'movement.end'), RI)).toEqual([[T]])
  })

  it('STRAT-005 verify (CMD-013, R-4.6c): Fire Overwatch may target an enemy Battle-shocked unit that moves', () => {
    const s = makeState()
    phase(s, 'movement', 'B', { A: 1 })
    s.units[BOYZ].battleShocked = true
    expect(ids(offered(s, 'A', 'movement.moveStarted', { unitId: BOYZ }), FO)).toContainEqual([BOYZ, T])
  })

  it('STRAT-004 verify: Command Re-roll is usable on an Overwatch hit roll in the opponent\'s Movement phase (not phase-locked)', () => {
    const s = makeState()
    phase(s, 'movement', 'B', { A: 1 })
    const h = harness(s, [1, 6, 2])
    h.ctx.rollOnce('ow', { purpose: 'hit', player: 'A', count: 2, mode: 'perDie', unitId: T })
    expect(s.pending).toMatchObject({ kind: 'commandReroll', player: 'A' })
  })
})

// ---- verifier round 3 ----
const KRUMP = 'ork.s.krump-da-gitz', CO = 'core.s.counter-offensive', IB = 'core.s.insane-bravery'

describe('engine/hooks — verifier round 3', () => {
  it('STRAT-006 verify: a Battle-shock test is not a Command Re-roll roll type, even when flagged rerollable', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 1 })
    const h = harness(s, [3, 3])
    const roll = h.ctx.roll({ purpose: 'battleShock', player: 'A', count: 2, mode: 'sum', unitId: INF, commandRerollable: true })
    expect(stratagemService.usable(s, 'A', 'any.rollMade', { rollId: roll.id })).toEqual([])
  })

  it('STRAT-003 verify: Command Re-roll used by B in A\'s Shooting phase blocks B for the phase but not A', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 1, B: 2 })
    const h = harness(s, [2, 5, 3, 4])
    h.ctx.rollOnce('sv1', { purpose: 'save', player: 'B', unitId: BOYZ })
    expect(s.pending).toMatchObject({ kind: 'commandReroll', player: 'B' })
    const rollId = (s.pending as unknown as { context: { roll: { id: string } } }).context.roll.id
    expect(h.answer({ type: 'commandReroll', rollId })).toBeNull()
    expect(s.players.B.cp).toBe(1)
    const r2 = h.ctx.roll({ purpose: 'save', player: 'B', unitId: BOYZ })
    expect(stratagemService.usable(s, 'B', 'any.rollMade', { rollId: r2.id })).toEqual([])
    const r3 = h.ctx.roll({ purpose: 'hit', player: 'A', unitId: T })
    expect(stratagemService.usable(s, 'A', 'any.rollMade', { rollId: r3.id })).toEqual([CR])
  })

  it('STRAT-022 verify: Gene-wrought needs S strictly greater than T — S5 vs T5 gets no −1', () => {
    const data = withData((b) => { b.weapons['ork.w.choppa'].S = 5 })
    const s = makeState({ data })
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'B', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })
    h.useOption(GW)
    const res = hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, 'B:boyz-a#1', 'ork.w.choppa', T), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(res).toEqual([])
  })

  it('STRAT-022 verify: Gene-wrought on the Terminators does not modify the Terminators\' own wound rolls', () => {
    const s = makeState()
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'B', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: T })
    h.useOption(GW)
    const res = hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, 'A:terminator-squad#1', 'sm.w.power-fist', BOYZ), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(res).toEqual([])
  })

  it('STRAT-023 verify: Veteran Instincts re-rolls only the Terminators\' own wound rolls — not wound rolls against them, not their saves', () => {
    const s = makeState()
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'A', { A: 1 })
    const h = harness(s)
    h.ctx.window('fight.start', 'start', h.ctx.order.active())
    h.useOption(VI, T)
    const own = hookService.collect(h.ctx, 'onWoundRoll', { attack: attack(s, 'A:terminator-squad#1', 'sm.w.power-fist', BOYZ), roll: rollOf(1, 'wound') }).map((r) => r.result)
    expect(own).toEqual([{ kind: 'roll', reroll: 'ones' }])
    const against = attack(s, 'B:boyz-a#1', 'ork.w.choppa', T)
    expect(hookService.collect(h.ctx, 'onWoundRoll', { attack: against, roll: rollOf(1, 'wound') }).map((r) => r.result)).toEqual([])
    expect(hookService.collect(h.ctx, 'onSaveRoll', { attack: against, roll: rollOf(1, 'save') }).map((r) => r.result).filter((r) => 'reroll' in r)).toEqual([])
  })

  it('LEAD-007 verify: after the leader dies the bodyguard judges below half against its own SS 5 (3 → no, 2 → yes); attached SS 6 before', () => {
    const s = makeState()
    const h = harness(s)
    const terms = [...s.units[T].models]
    removeModel(s, terms[0]); removeModel(s, terms[1])
    expect(leaderService.isBelowHalfStrength(s, T)).toBe(false) // 4 of 6
    removeModel(s, terms[2])
    expect(leaderService.isBelowHalfStrength(s, T)).toBe(false) // 3 of 6
    removeModel(s, s.units[CAP].models[0])
    leaderService.detach(h.ctx, CAP)
    expect(leaderService.isAttached(s, T)).toBe(false)
    expect(leaderService.startingStrength(s, T)).toBe(5)
    expect(leaderService.isBelowHalfStrength(s, T)).toBe(true) // 2 of 5
  })

  it('LEAD-016 verify: Champion Duellist (melee only) grants nothing to the Captain\'s storm bolter', () => {
    const s = makeState()
    const abil = hookService.weaponAbilitiesFor(s, 'A:captain-octavius#0', s.weapons['sm.w.storm-bolter-captain']).map((a) => a.ability)
    expect(abil).not.toContain('PRECISION')
    expect(abil).not.toContain('LETHAL_HITS')
    expect(hookService.weaponAbilitiesFor(s, 'A:captain-octavius#0', s.weapons['sm.w.relic-weapon']).map((a) => a.ability)).toEqual(expect.arrayContaining(['PRECISION', 'LETHAL_HITS']))
  })

  it('STRAT-025 verify: Krump da Gitz! only for Orks targeted by the unit that just finished shooting, not by an earlier shooter', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { B: 1 })
    const h = harness(s)
    stratagemService.recordTargets(h.ctx, INF, [BOYZ])
    stratagemService.recordTargets(h.ctx, T, [BOYZ2])
    expect(ids(offered(s, 'B', 'shooting.attacksResolved', { unitId: T }), KRUMP)).toEqual([[BOYZ2]])
    expect(ids(offered(s, 'B', 'shooting.attacksResolved', { unitId: INF }), KRUMP)).toEqual([[BOYZ]])
  })

  it('STRAT-002 verify: Counter-offensive follows an enemy unit that fought, never a friendly one', () => {
    const s = makeState()
    engageTerms(s, BOYZ)
    phase(s, 'fight', 'A', { A: 2, B: 2 })
    s.phaseState.fight!.fought.push(INF)
    expect(ids(offered(s, 'A', 'fight.attacksResolved', { unitId: INF }), CO)).toEqual([])
    expect(ids(offered(s, 'B', 'fight.attacksResolved', { unitId: INF }), CO)).toEqual([[BOYZ]])
    s.phaseState.fight!.fought.push(BOYZ2)
    expect(ids(offered(s, 'A', 'fight.attacksResolved', { unitId: BOYZ2 }), CO)).toEqual([[T]])
  })

  it('STRAT-009 verify: Insane Bravery auto-passes only the chosen unit\'s test, not another unit tested in the same phase', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 1 })
    const h = harness(s, [1, 1])
    h.ctx.window('command.battleShock', INF, h.ctx.order.only('A'), { unitId: INF })
    h.useOption(IB)
    expect(hookService.battleShockTest(h.ctx, INF, 'test')).toBe(true)
    expect(hookService.battleShockTest(h.ctx, T, 'test')).toBe(false)
  })

  it('STRAT-033 verify: Epic Challenge is not offered when the CHARACTER is engaged only with a non-attached enemy unit', () => {
    const smB: PlayerSetup = { ...SM(), name: 'SM2' }
    const s = makeState({ a: { attachments: [], enhancementId: 'sm.e.oathsworn-determination' }, bFull: smB })
    placeUnit(s, 'B:terminator-squad', { x: -4, z: 14 })
    placeUnit(s, 'B:captain-octavius', [[-6.5, 14]])
    placeUnit(s, 'B:librarian-tantus', [[18, 12]])
    placeUnit(s, 'B:infernus-squad', { x: 0.15, z: 0.984 + 0.63 + 0.5, gap: 0.3 })
    placeUnit(s, CAP, [[0.15, 0]])
    placeUnit(s, T, { x: -18, z: -6 })
    phase(s, 'fight', 'A', { A: 1 })
    const ec = () => ids(offered(s, 'A', 'fight.unitSelected', { unitId: CAP }), EC)
    expect(ec()).toEqual([])
    placeUnit(s, 'B:captain-octavius', [[-2.3, 0]])
    expect(ec()).toEqual([['B:terminator-squad', 'A:captain-octavius#0']])
  })

  it('STRAT-019 verify: Fire Overwatch needs the reacting unit within 24" of the moving enemy (24.2" → no, 23.8" → yes)', () => {
    const s = makeState()
    phase(s, 'movement', 'B', { A: 1 })
    placeUnit(s, BOYZ, [[-20, 12]])
    placeUnit(s, BOYZ2, { x: -6, z: -14, gap: 0.3 }) // keep the Infernus out of Engagement Range of other enemies (Pistol rule)
    placeUnit(s, T, { x: 40, z: 40 })
    placeUnit(s, CAP, [[40, 45]])
    placeUnit(s, LIB, [[45, 45]])
    const h = harness(s)
    placeUnit(s, INF, [[-20 + 24.2 + 0.63 * 2, 12]])
    h.ctx.window('movement.unitMoved', BOYZ, h.ctx.order.only('A'), { unitId: BOYZ })
    expect(s.pending).toBeNull()
    placeUnit(s, INF, [[-20 + 23.8 + 0.63 * 2, 12]])
    expect(ids(offered(s, 'A', 'movement.unitMoved', { unitId: BOYZ }), FO)).toEqual([[BOYZ, INF]])
  })
})
