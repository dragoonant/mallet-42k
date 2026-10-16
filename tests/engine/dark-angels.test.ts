// Dark Angels: Mordekai's Judgement (docs/spec/factions/dark-angels.md, DAR- checklist ids), real Combat Patrol data.
// Code hooks: Stoic Exemplar, March of Vengeance, Relic Munitions, and the Endless Hunt / Archeotech Reliquary secondaries.
// The engine seams they read (E1 charge log, E2 shot log) are covered in dark-angels-core.test.ts; the declarative parts of the
// faction (Litany of Hate, Zealous Wrath, Unyielding, Damaged) are exercised here through their data where they interact with hooks.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DeployUnitDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { coverMarkKey, hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { CHARGE_LOG_KEY, chargeModule } from '../../src/engine/phases/charge'
import { collectAdvanceRerollKinds, movementModule, reserveRouteFor } from '../../src/engine/phases/movement'
import { SHOT_LOG_KEY, buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { deploymentZone, modelStats } from '../../src/engine/state'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DA = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Dark Angels', faction: 'dark-angels', patrolId: 'da.cp.mordekais-judgement', enhancementId: 'da.e.stoic-exemplar',
  secondaryId: 'da.sec.endless-hunt', attachments: [{ leaderRef: 'chaplain-mordekai', bodyguardRef: 'intercessor-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const MORD = 'A:chaplain-mordekai', INT = 'A:intercessor-squad', INC = 'A:inceptor-squad', RED = 'A:redemptor-dreadnought'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DA(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'da', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  // everyone parked in a corner far from every marker, enemy well out of reach; tests move what they need
  placeUnit(s, MORD, [[-20, -13]])
  placeUnit(s, INT, { x: -19, z: -13, gap: 0.3 })
  placeUnit(s, INC, { x: -19, z: -11, gap: 0.3 })
  placeUnit(s, RED, [[-14, -13]])
  placeUnit(s, BOYZ, { x: 18, z: 12, gap: 0.3 })
  placeUnit(s, BOYZ2, { x: 18, z: 9, gap: 0.3 })
  placeUnit(s, BOSS, [[21, 13]])
  return s
}

const ctxOf = (s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) => createContext(s, new ScriptedRng(dice), modules)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 1, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
const woundMods = (s: GameState, a: AttackContext) =>
  hookService.collect(ctxOf(s).ctx, 'onWoundRoll', { attack: a, roll: rollOf(4, 'wound') }).map((r) => r.result)

function logCharge(s: GameState, charger: string, target: string, turn: 'A' | 'B' = 'B'): void {
  s.mission.custom[CHARGE_LOG_KEY] = { round: s.round, turn, pairs: [{ charger, target }] }
}

const centroid = (poly: { x: number; z: number }[]) => ({ x: poly.reduce((a, p) => a + p.x, 0) / poly.length, z: poly.reduce((a, p) => a + p.z, 0) / poly.length })
const markers = (s: GameState) => Object.values(s.objectives).filter((o) => !o.removed)
const neutralMarkers = (s: GameState) => markers(s).filter((o) => o.home === null)
function parkOn(s: GameState, unitId: string, obj: { pos: { x: number; z: number } }): void {
  placeUnit(s, unitId, s.units[unitId].models.map((): [number, number] => [obj.pos.x, obj.pos.z]))
}
function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}


// attack-sequence driver (as tests/engine/attack.test.ts): answers every stratagem window with a pass and every other decision with its first option
const TAIL = Array(40).fill(2)
function target(s: GameState, modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget {
  return { modelId, weaponId, targetUnitId, profileGroup: s.weapons[weaponId]?.profileGroup ?? null, attacks }
}
function drive(h: { ctx: EngineContext; events: GameEvent[] }): GameEvent[] {
  const { ctx } = h
  let r = attackService.advance(ctx)
  let guard = 0
  while (r === 'pending') {
    if (++guard > 2000) throw new Error('drive(): too many decisions')
    const pending = ctx.state.pending as PendingDecision
    const passes = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll'
    const action: Action = passes
      ? { type: 'pass', player: pending.player, decisionId: pending.id } as Action
      : (pending as { options: { action: Action }[] }).options[0].action
    ctx.state.pending = null
    const owner = passes ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, { ...action, decisionId: pending.id } as Action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return h.events
}
const withKeyword = (s: GameState, unitId: string, kw: string): void => {
  const id = s.units[unitId].datasheetId
  s.datasheets = { ...s.datasheets, [id]: { ...s.datasheets[id], keywords: [...s.datasheets[id].keywords, kw] } }
}

// ---------- registration ----------
describe('Dark Angels registration', () => {
  it('DAR-003 every code named by the faction data is registered; Oath of Moment is the shared Space Marines pick', () => {
    const codes = new Set<string>()
    const collect = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(collect)
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'code' && typeof v === 'string') codes.add(v); else collect(v) }
    }
    for (const id of Object.keys(bundle.patrols).filter((p) => p.startsWith('da.'))) collect(bundle.patrols[id])
    for (const table of [bundle.enhancements, bundle.abilities, bundle.stratagems] as Record<string, unknown>[]) {
      for (const [id, v] of Object.entries(table)) if (id.startsWith('da.')) collect(v)
    }
    for (const c of ['stoicExemplar', 'marchOfVengeance', 'relicMunitions', 'endlessHunt', 'archeotechReliquaryPick', 'archeotechReliquaryScore']) expect(codes.has(c) || c in codeHooks).toBe(true)
    for (const c of codes) expect(codeHooks[c], `code ${c}`).toBeDefined()
    const s = makeState({ phase: 'command' })
    expect(s.datasheets['da.intercessor-squad'].abilities).toContain('sm.a.oath-of-moment')
  })

  it('DAR-003 an Intercessor bolt rifle attack against the Oath target re-rolls a failed hit; against any other unit it does not', () => {
    const hitRerolls = (oath: string | null): { rerolls: number; hits: number } => {
      const s = makeState({ phase: 'shooting' })
      placeUnit(s, BOYZ, { x: -19, z: -5, gap: 0.3 })
      placeUnit(s, BOYZ2, { x: -10, z: -5, gap: 0.3 })
      s.players.A.oathTargetUnitId = oath
      const c = ctxOf(s, [1, 6, ...TAIL]) // first hit die fails (1), the re-roll succeeds (6)
      attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: INT, overwatch: false, targets: [target(s, `${INT}#0`, 'da.w.bolt-rifle', BOYZ, 1)] })
      drive(c)
      const hit = of(c.events, 'DiceRolled').find((e) => e.roll.purpose === 'hit')
      const rerolled = of(c.events, 'DiceRerolled').filter((e) => e.rollId === hit?.roll.id)
      return { rerolls: rerolled.length, hits: of(c.events, 'HitRolled').filter((e) => e.hit).length }
    }
    const oathed = hitRerolls(BOYZ)
    expect(oathed.rerolls).toBe(1)
    expect(oathed.hits).toBe(1) // the failed 1 became the re-rolled 6
    expect(hitRerolls(BOYZ2).rerolls).toBe(0) // the Oath is on another unit
    expect(hitRerolls(null).rerolls).toBe(0)
  })

  it('DAR-003 in a Space Marines vs Dark Angels game each player keeps their own Oath target', () => {
    const SMP = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
      name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
      attachments: [], reserves: [], battleReadyVp: 0, ...o,
    })
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DA(), B: SMP() },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const s = createGameState(setup, bundle, 'da-sm', ENGINE_VERSION)
    const daUnits = Object.values(s.units).filter((u) => u.player === 'A' && u.bodyguardUnitId === null).map((u) => u.id)
    const smUnits = Object.values(s.units).filter((u) => u.player === 'B' && u.bodyguardUnitId === null).map((u) => u.id)
    expect(daUnits.length).toBeGreaterThan(1)
    expect(smUnits.length).toBeGreaterThan(1)
    // both armies carry the shared Oath of Moment datasheet ability
    expect(s.datasheets['da.intercessor-squad'].abilities).toContain('sm.a.oath-of-moment')
    const smOath = Object.values(s.units).find((u) => u.player === 'B' && s.datasheets[u.datasheetId].abilities.includes('sm.a.oath-of-moment'))
    expect(smOath).toBeTruthy()
    s.players.A.oathTargetUnitId = smUnits[0]
    s.players.B.oathTargetUnitId = daUnits[1]
    // A's units oath the SM unit A picked, B's units oath the DA unit B picked; nobody shares the other's target
    expect(hookService.isOathTarget(s, INT, smUnits[0])).toBe(true)
    expect(hookService.isOathTarget(s, INT, smUnits[1])).toBe(false)
    expect(hookService.isOathTarget(s, smUnits[1], daUnits[1])).toBe(true)
    expect(hookService.isOathTarget(s, smUnits[1], daUnits[0])).toBe(false)
    expect(hookService.isOathTarget(s, smUnits[0], smUnits[0])).toBe(false)
    expect(s.players.A.oathTargetUnitId).not.toBe(s.players.B.oathTargetUnitId)
  })
})

// ---------- Stoic Exemplar ----------
describe('Stoic Exemplar', () => {
  const choppa = (s: GameState, unit: string, target: string) => attackCtx(s, `${unit}#0`, 'ork.w.choppa', target)
  it('DAR-005 once an enemy ended a Charge move in Engagement Range of the bearer unit, every enemy melee wound roll against it is -1 (also from a unit that did not charge); ranged attacks are not', () => {
    const s = makeState({ phase: 'fight', active: 'B' })
    expect(woundMods(s, choppa(s, BOYZ, INT))).toEqual([]) // nothing charged yet
    logCharge(s, BOYZ, INT)
    expect(woundMods(s, choppa(s, BOYZ, INT))).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(woundMods(s, choppa(s, BOYZ2, INT))).toEqual([{ kind: 'roll', modifier: -1 }]) // a second unit that did not charge
    expect(woundMods(s, attackCtx(s, `${BOYZ}#0`, 'ork.w.slugga', INT))).toEqual([]) // ranged
    // the bearer's own melee attacks are untouched
    expect(woundMods(s, attackCtx(s, `${INT}#0`, 'sm.w.close-combat-weapon', BOYZ))).not.toContainEqual({ kind: 'roll', modifier: -1 })
  })

  it('DAR-006 not active: charge into a different unit, no log, an attached-Leader-less unit, or a charger of the bearer own side', () => {
    let s = makeState({ phase: 'fight', active: 'B' })
    logCharge(s, BOYZ, INC) // charged the Inceptors, not the bearer's unit
    expect(woundMods(s, choppa(s, BOYZ, INT))).toEqual([])
    s = makeState({ phase: 'fight', active: 'B' })
    logCharge(s, INC, INT) // one of our own units charging does not count
    expect(woundMods(s, choppa(s, BOYZ, INT))).toEqual([])
    s = makeState({ phase: 'fight', active: 'B', a: { attachments: [] } })
    logCharge(s, BOYZ, INT) // Mordekai is no longer in that unit
    expect(woundMods(s, choppa(s, BOYZ, INT))).toEqual([])
    expect(woundMods(s, choppa(s, BOYZ, MORD))).toEqual([])
  })

  it('DAR-007 unattached Mordekai is his own unit; the effect ends with the turn (stale log) and when the bearer is gone', () => {
    const s = makeState({ phase: 'fight', active: 'B', a: { attachments: [] } })
    logCharge(s, BOYZ, MORD)
    expect(woundMods(s, choppa(s, BOYZ2, MORD))).toEqual([{ kind: 'roll', modifier: -1 }])
    s.round += 1 // next battle round: the old log is stale
    expect(woundMods(s, choppa(s, BOYZ2, MORD))).toEqual([])
    s.round -= 1
    s.activePlayer = 'A'
    expect(woundMods(s, choppa(s, BOYZ2, MORD))).toEqual([])
  })
})

// ---------- stratagem harness (as hooks.strat.test.ts) ----------
function servicesTable(): Services {
  return {
    ...DEFAULT_MODULES.services, hooks: hookService, effects: effectService, stratagems: stratagemService, leaders: leaderService,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
}
function harness(state: GameState, dice: number[] = []) {
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: servicesTable(), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  const options = (): UseStratagemAction[] => ((state.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((o) => o.action as UseStratagemAction).filter((a) => a.type === 'useStratagem')
  const use = (stratagemId: string, unitId: string) => {
    const opt = options().find((x) => x.stratagemId === stratagemId && (x.targets.unitIds ?? []).includes(unitId))
    if (!opt) throw new Error(`no option ${stratagemId} ${unitId}`)
    const pending = state.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    const rej = stratagemService.validate(state, action, pending)
    if (rej) return rej
    state.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { ctx, events, options, use }
}
const offeredUnits = (s: GameState, player: 'A' | 'B', id: string, window: Parameters<typeof stratagemService.options>[2], trigger = {}): string[] =>
  stratagemService.options(s, player, window, trigger).filter((o) => o.stratagemId === id).flatMap((o) => o.targets.unitIds ?? [])
const UNY = 'da.s.mj-unyielding', MARCH = 'da.s.mj-march-of-vengeance', RELIC = 'da.s.mj-relic-munitions'

// ---------- Unyielding / keywords ----------
describe('Unyielding and the INFANTRY filter', () => {
  it('DAR-013 Unyielding is offered for the Intercessors and Inceptors in the own Command phase; not for the Redemptor, and not for the opponent\'s phase', () => {
    const s = makeState({ phase: 'command' })
    s.players.A.cp = 3
    const units = offeredUnits(s, 'A', UNY, 'command.start')
    expect(units).toContain(INT)
    expect(units).toContain(INC)
    expect(units).not.toContain(RED)
    const t = makeState({ phase: 'command', active: 'B' })
    t.players.A.cp = 3
    expect(offeredUnits(t, 'A', UNY, 'command.start')).toEqual([])
  })

  it("DAR-013 Unyielding: Intercessors OC 2 -> 3 through the opponent's turn, back to 2 at the next own Command phase", () => {
    const s = makeState({ phase: 'command' })
    s.players.A.cp = 3
    const oc = (unitId: string, i = 0): number => {
      const model = s.models[`${unitId}#${i}`]
      return hookService.statFor(s, { unitId, modelId: model.id, weapon: null, stat: 'OC' }, modelStats(s, model).OC)
    }
    expect(oc(INT)).toBe(2)
    expect(oc(INC)).toBe(1)
    const h = harness(s)
    s.phaseState.marks.push(`pick:oath:${s.round}:A`) // Oath of Moment already picked this turn; the Command-phase window goes straight to stratagems
    h.ctx.window('command.start', 'start', h.ctx.order.active())
    expect(h.use(UNY, INT)).toBeNull()
    expect(s.players.A.cp).toBe(2)
    expect(oc(INT)).toBe(3)
    expect(oc(INT, 4)).toBe(3) // every model in the unit
    expect(oc(INC)).toBe(1) // only the chosen unit
    // survives the end of the phase and of the turn
    effectService.expire(h.ctx, 'phaseEnd', null)
    effectService.expire(h.ctx, 'turnEnd', null)
    expect(oc(INT)).toBe(3)
    // the opponent's turn starts (their own-turn expiry does not touch it), through to the end of that turn and round
    s.activePlayer = 'B'
    effectService.expire(h.ctx, 'nextOwnTurn', 'B')
    effectService.expire(h.ctx, 'turnEnd', null)
    effectService.expire(h.ctx, 'roundEnd', null)
    expect(oc(INT)).toBe(3)
    // next own turn (Command phase) begins: the bonus is gone
    s.round += 1
    s.activePlayer = 'A'
    effectService.expire(h.ctx, 'nextOwnTurn', 'A')
    expect(oc(INT)).toBe(2)
  })

  it('DAR-018 Mordekai alone (no INFANTRY keyword) is not a legal target; attached to the Intercessors he is covered', () => {
    const solo = makeState({ phase: 'command', a: { attachments: [] } })
    solo.players.A.cp = 3
    expect(offeredUnits(solo, 'A', UNY, 'command.start')).not.toContain(MORD)
    expect(offeredUnits(solo, 'A', UNY, 'command.start')).toContain(INT)
    const led = makeState({ phase: 'command' })
    led.players.A.cp = 3
    const units = offeredUnits(led, 'A', UNY, 'command.start')
    expect(units).not.toContain(MORD) // the Leader is part of the bodyguard unit
    expect(units).toContain(INT)
    expect(leaderService.halves(led, INT)).toContain(MORD)
  })
})

// ---------- March of Vengeance ----------
describe('March of Vengeance', () => {
  function ready(unit: string, moveType: 'fallBack' | 'normal' | 'advance') {
    const s = makeState({ phase: 'movement' })
    s.players.A.cp = 3
    for (const h of leaderService.halves(s, unit)) s.units[h].turn.moveType = moveType
    return s
  }
  it('DAR-014 offered after the Intercessors Fall Back; using it makes them eligible to shoot and to charge', () => {
    const s = ready(INT, 'fallBack')
    expect(offeredUnits(s, 'A', MARCH, 'movement.unitMoved', { unitId: INT })).toContain(INT)
    expect(hookService.eligibilityFor(s, INT, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(s, INT, 'charge')).toBe(false)
    const h = harness(s)
    h.ctx.window('movement.unitMoved', INT, h.ctx.order.active(), { unitId: INT })
    expect(h.use(MARCH, INT)).toBeNull()
    expect(hookService.eligibilityFor(s, INT, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, INT, 'charge')).toBe(true)
  })

  it('DAR-015 once the unit has been selected to shoot it may no longer charge; not offered after a Normal move or Advance, nor for the Redemptor', () => {
    const s = ready(INT, 'fallBack')
    const h = harness(s)
    h.ctx.window('movement.unitMoved', INT, h.ctx.order.active(), { unitId: INT })
    h.use(MARCH, INT)
    s.mission.custom[SHOT_LOG_KEY] = { round: s.round, turn: 'A', unitIds: [INT] }
    expect(hookService.eligibilityFor(s, INT, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, INT, 'charge')).toBe(false)

    for (const mt of ['normal', 'advance'] as const) expect(offeredUnits(ready(INT, mt), 'A', MARCH, 'movement.unitMoved', { unitId: INT })).not.toContain(INT)
    expect(offeredUnits(ready(RED, 'fallBack'), 'A', MARCH, 'movement.unitMoved', { unitId: RED })).not.toContain(RED)
    const opp = ready(INT, 'fallBack')
    opp.activePlayer = 'B'
    expect(offeredUnits(opp, 'A', MARCH, 'movement.unitMoved', { unitId: INT })).toEqual([])

    // expires at the end of the turn: the Fall Back grant is gone and the unit is ineligible again
    const e = ready(INT, 'fallBack')
    const he = harness(e)
    he.ctx.window('movement.unitMoved', INT, he.ctx.order.active(), { unitId: INT })
    he.use(MARCH, INT)
    expect(hookService.eligibilityFor(e, INT, 'shoot')).toBe(true)
    effectService.expire(he.ctx, 'phaseEnd', null)
    expect(hookService.eligibilityFor(e, INT, 'shoot')).toBe(true) // still the same turn
    effectService.expire(he.ctx, 'turnEnd', null)
    expect(hookService.eligibilityFor(e, INT, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(e, INT, 'charge')).toBe(false)
  })

  it('DAR-015 an Overwatch shot is never written to the shot log, so it does not cost the unit its charge', () => {
    const s = ready(INT, 'fallBack')
    const h = harness(s)
    h.ctx.window('movement.unitMoved', INT, h.ctx.order.active(), { unitId: INT })
    h.use(MARCH, INT)
    expect(s.mission.custom[SHOT_LOG_KEY]).toBeUndefined()
    // Overwatch fired by the Intercessors (a ranged attack sequence flagged overwatch) at an enemy unit
    placeUnit(s, BOYZ, { x: -19, z: -5, gap: 0.3 })
    const c = ctxOf(s, [6, 2, ...TAIL])
    attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: INT, overwatch: true, targets: [target(s, `${INT}#0`, 'da.w.bolt-rifle', BOYZ, 1)] })
    drive(c)
    expect(of(c.events, 'HitRolled').length).toBeGreaterThan(0)
    expect(s.mission.custom[SHOT_LOG_KEY]).toBeUndefined()
    expect(hookService.eligibilityFor(s, INT, 'charge')).toBe(true)
  })
})

// ---------- Relic Munitions ----------
describe('Relic Munitions', () => {
  function setup(): { s: GameState; marker: ReturnType<typeof markers>[number] } {
    const s = makeState({ phase: 'shooting', active: 'B' })
    s.players.A.cp = 3
    const marker = neutralMarkers(s)[0]
    marker.controller = 'A'
    parkOn(s, INT, marker)
    placeUnit(s, MORD, [[marker.pos.x + 1, marker.pos.z]])
    placeUnit(s, BOYZ, { x: marker.pos.x - 10, z: marker.pos.z + 5, gap: 0.3 })
    return { s, marker }
  }
  const trig = (target: string) => ({ unitId: BOYZ, targetUnitId: target })
  it('DAR-016 the targeted Intercessors on a marker the DA control may use it: the unit gets the Benefit of Cover for the phase', () => {
    const { s } = setup()
    expect(offeredUnits(s, 'A', RELIC, 'shooting.targetsDeclared', trig(INT))).toContain(INT)
    expect(hookService.hasBenefitOfCover?.(s, INT) ?? false).toBe(false)
    const h = harness(s)
    h.ctx.window('shooting.targetsDeclared', 'k1', h.ctx.order.defensive('A'), trig(INT))
    expect(h.use(RELIC, INT)).toBeNull()
    expect(s.phaseState.marks).toContain(coverMarkKey(INT))
    expect(hookService.hasBenefitOfCover?.(s, INT)).toBe(true)
    expect(of(h.events, 'AbilityTriggered').some((e) => /Relic Munitions/.test(e.summary))).toBe(true)
    // the mark is phase-scoped: a fresh phase state clears it
    s.phaseState = emptyPhaseState()
    expect(hookService.hasBenefitOfCover?.(s, INT) ?? false).toBe(false)
  })

  it('DAR-016 with the cover mark the Intercessors save one better against an AP -1 shot; an Ignores Cover weapon gets no such bonus', () => {
    const shoota = (ignoresCover: boolean, covered: boolean) => {
      const { s } = setup()
      const w = s.weapons['ork.w.shoota']
      s.weapons = { ...s.weapons, 'ork.w.shoota': { ...w, AP: -1, abilities: ignoresCover ? [...w.abilities, { ability: 'IGNORES_COVER' }] : w.abilities } }
      if (covered) s.phaseState.marks.push(coverMarkKey(INT))
      const c = ctxOf(s, [5, 6, 4, ...TAIL])
      attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [target(s, `${BOYZ}#0`, 'ork.w.shoota', INT, 1)] })
      drive(c)
      return of(c.events, 'SaveRolled')[0]
    }
    const plain = shoota(false, false)
    const covered = shoota(false, true)
    const ignored = shoota(true, true)
    expect(plain.kind).toBe('armour')
    expect(plain.final).toBe(plain.die - 1) // AP -1
    expect(covered.final).toBe(plain.final + 1) // Benefit of Cover: +1 to the save roll
    expect(ignored.final).toBe(plain.final) // Ignores Cover bypasses the Benefit of Cover
    // cover grants nothing against AP 0 for a 3+ save (R-3.12), even with the mark
    const { s } = setup()
    s.phaseState.marks.push(coverMarkKey(INT))
    const c = ctxOf(s, [5, 6, 4, ...TAIL])
    attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [target(s, `${BOYZ}#0`, 'ork.w.shoota', INT, 1)] })
    drive(c)
    const flat = of(c.events, 'SaveRolled')[0]
    expect(flat.final).toBe(flat.die)
  })

  it('DAR-017 not offered: off the marker, marker held by the enemy, an unrelated target, the Redemptor, or the own Shooting phase', () => {
    let { s } = setup()
    placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, MORD, [[1, 1]])
    s.objectives[neutralMarkers(s)[0].id].pos = { x: 15, z: 0 }
    expect(offeredUnits(s, 'A', RELIC, 'shooting.targetsDeclared', trig(INT))).not.toContain(INT)

    let t = setup()
    t.marker.controller = 'B'
    placeUnit(t.s, BOYZ, { x: t.marker.pos.x + 10, z: t.marker.pos.z + 5, gap: 0.3 })
    placeUnit(t.s, BOYZ2, { x: t.marker.pos.x + 8, z: t.marker.pos.z + 7, gap: 0.3 })
    parkOn(t.s, BOYZ2, t.marker) // enemy OC takes the marker back
    expect(offeredUnits(t.s, 'A', RELIC, 'shooting.targetsDeclared', trig(INT))).not.toContain(INT)

    t = setup()
    expect(offeredUnits(t.s, 'A', RELIC, 'shooting.targetsDeclared', trig(INC))).not.toContain(INT) // INT was not the unit chosen as a target
    placeUnit(t.s, RED, [[t.marker.pos.x - 1, t.marker.pos.z + 3]])
    expect(offeredUnits(t.s, 'A', RELIC, 'shooting.targetsDeclared', trig(RED))).not.toContain(RED)

    s = makeState({ phase: 'shooting', active: 'A' })
    s.players.A.cp = 3
    expect(offeredUnits(s, 'A', RELIC, 'shooting.targetsDeclared', trig(INT))).toEqual([])
  })
})

// ---------- Endless Hunt ----------
describe('Endless Hunt', () => {
  function score(s: GameState, ctxDice: number[] = []): number {
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s, ctxDice).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }
  // a marker outside both zones, controlled by A, with `unit` parked on it
  function onNeutral(s: GameState, unit: string) {
    const o = neutralMarkers(s).find((m) => !m.removed)!
    const mid = { x: 0, z: 0 }
    o.pos = mid
    o.controller = 'A'
    parkOn(s, unit, o)
    return o
  }
  it('DAR-009 round 2 own turn end: Intercessors on a controlled No Man\'s Land marker score 3; on one in the opponent\'s zone 5 (not 8); own zone 0', () => {
    let s = makeState({ phase: 'fight' })
    onNeutral(s, INT)
    expect(score(s)).toBe(3)

    s = makeState({ phase: 'fight' })
    const enemyZone = centroid(deploymentZone(s, 'B'))
    const far = onNeutral(s, INT)
    far.pos = enemyZone
    parkOn(s, INT, far)
    // a second marker in no man's land is also held by the unit's range? no: one marker each, best award only
    expect(score(s)).toBe(5)

    s = makeState({ phase: 'fight' })
    const o = onNeutral(s, INT)
    o.pos = centroid(deploymentZone(s, 'A'))
    parkOn(s, INT, o)
    expect(score(s)).toBe(0)
  })

  it('DAR-009 only Mordekai is in range: the attached unit still qualifies (3 on No Man\'s Land, 5 in the enemy zone)', () => {
    let s = makeState({ phase: 'fight' })
    let o = onNeutral(s, INT)
    placeUnit(s, INT, { x: -19, z: -13, gap: 0.3 }) // bodyguard back home; only the Leader on the marker
    placeUnit(s, MORD, [[o.pos.x, o.pos.z]])
    expect(score(s)).toBe(3)

    s = makeState({ phase: 'fight' })
    o = onNeutral(s, INT)
    o.pos = centroid(deploymentZone(s, 'B'))
    placeUnit(s, INT, { x: -19, z: -13, gap: 0.3 })
    placeUnit(s, MORD, [[o.pos.x, o.pos.z]])
    expect(score(s)).toBe(5)
  })

  it('DAR-010 nothing in round 1, when Battle-shocked (either half), when the marker is not controlled, for Inceptors alone, or at the end of the opponent\'s turn', () => {
    let s = makeState({ phase: 'fight', round: 1 })
    onNeutral(s, INT)
    expect(score(s)).toBe(0)

    s = makeState({ phase: 'fight' })
    onNeutral(s, INT)
    s.units[INT].battleShocked = true
    expect(score(s)).toBe(0)

    s = makeState({ phase: 'fight' })
    let o = onNeutral(s, INT)
    s.units[MORD].battleShocked = true // the attached Leader counts as part of the unit
    expect(score(s)).toBe(0)

    s = makeState({ phase: 'fight' })
    o = onNeutral(s, INT)
    placeUnit(s, BOYZ, { x: o.pos.x + 1.5, z: o.pos.z + 3, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: o.pos.x - 1.5, z: o.pos.z - 3, gap: 0.3 })
    expect(score(s)).toBe(0) // the Orks out-OC them

    s = makeState({ phase: 'fight' })
    onNeutral(s, INC)
    expect(score(s)).toBe(0)

    s = makeState({ phase: 'fight', active: 'B' })
    onNeutral(s, INT)
    expect(score(s)).toBe(0)
  })
})

// ---------- Archeotech Reliquary ----------
describe('Archeotech Reliquary', () => {
  const secondary = { secondaryId: 'da.sec.archeotech-reliquary' }
  function startRound(s: GameState) {
    const c = ctxOf(s)
    DEFAULT_MODULES.services.missions.onWindow(c.ctx, 'round.start', 'r')
    return c
  }
  it('DAR-011 at the start of round 1 the OPPONENT picks a live marker; holding it at battle end scores 10, not holding it 0', () => {
    const s = makeState({ phase: 'command', round: 1, a: secondary })
    const c = startRound(s)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.kind).toBe('chooseOption')
    expect(pending.player).toBe('B')
    expect(pending.canPass).toBe(false)
    const live = markers(s)
    expect(pending.options.map((o) => o.id).sort()).toEqual(live.map((o) => o.id).sort())
    const target = live[0]
    answerOption(c.ctx, target.id)
    expect(s.players.A.secondaryState['da:reliquary']).toBe(target.id)
    expect(s.players.B.secondaryState['da:reliquary']).toBeUndefined()

    // battle end
    s.round = 5
    target.controller = 'A'
    parkOn(s, INT, target)
    let before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'battle.end', 'end')
    expect(s.players.A.vp - before).toBe(10)

    const s2 = makeState({ phase: 'command', round: 1, a: secondary })
    const c2 = startRound(s2)
    answerOption(c2.ctx, markers(s2)[0].id)
    s2.round = 5
    before = s2.players.A.vp
    markers(s2)[0].controller = 'B'
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s2).ctx, 'battle.end', 'end')
    expect(s2.players.A.vp - before).toBe(0)
  })

  it('DAR-012 a removed marker scores 0; no pick in rounds 2-5; Endless Hunt chosen means no pick', () => {
    const s = makeState({ phase: 'command', round: 1, a: secondary })
    const c = startRound(s)
    const target = markers(s)[0]
    answerOption(c.ctx, target.id)
    target.removed = true
    s.round = 5
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'battle.end', 'end')
    expect(s.players.A.vp - before).toBe(0)

    const late = makeState({ phase: 'command', round: 2, a: secondary, b: { secondaryId: 'ork.sec.proper-lootin' } })
    startRound(late)
    expect(late.pending).toBeNull()

    const hunt = makeState({ phase: 'command', round: 1, b: { secondaryId: 'ork.sec.proper-lootin' } })
    startRound(hunt)
    expect(hunt.pending).toBeNull()
  })
})

// ---------- declarative pieces that rely on the hooks above ----------
describe('Dark Angels declarative abilities (data-level checks through the hook pipeline)', () => {
  it('DAR-004 Litany of Hate: melee wound rolls of the led unit get +1; ranged and the unattached case do not', () => {
    const s = makeState({ phase: 'fight' })
    const melee = hookService.collect(ctxOf(s).ctx, 'onWoundRoll', { attack: attackCtx(s, `${INT}#1`, 'sm.w.close-combat-weapon', BOYZ), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(melee).toContainEqual({ kind: 'roll', modifier: 1 })
    const ranged = hookService.collect(ctxOf(s).ctx, 'onWoundRoll', { attack: attackCtx(s, `${INT}#1`, 'da.w.bolt-rifle', BOYZ), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(ranged).not.toContainEqual({ kind: 'roll', modifier: 1 })
    const u = makeState({ phase: 'fight', a: { attachments: [] } })
    const none = hookService.collect(ctxOf(u).ctx, 'onWoundRoll', { attack: attackCtx(u, `${INT}#1`, 'sm.w.close-combat-weapon', BOYZ), roll: rollOf(4, 'wound') }).map((r) => r.result)
    expect(none).not.toContainEqual({ kind: 'roll', modifier: 1 })
  })

  it('DAR-019 Redemptor Damaged: hit rolls -1 at 4 wounds remaining, none at 5', () => {
    const s = makeState({ phase: 'shooting' })
    const m = s.models[`${RED}#0`]
    const hit = () => hookService.collect(ctxOf(s).ctx, 'onHitRoll', { attack: attackCtx(s, m.id, 'da.w.onslaught-gatling-cannon', BOYZ), roll: rollOf(4, 'hit') }).map((r) => r.result)
    m.woundsRemaining = 5
    expect(hit()).not.toContainEqual({ kind: 'roll', modifier: -1 })
    m.woundsRemaining = 4
    expect(hit()).toContainEqual({ kind: 'roll', modifier: -1 })
  })
})

// ---------- Zealous Wrath (enhancement, declarative) ----------
describe('Zealous Wrath', () => {
  const ZEALOUS = { enhancementId: 'da.e.zealous-wrath' }
  const advanceKinds = (s: GameState, unit: string): string[] => [...collectAdvanceRerollKinds(ctxOf(s).ctx, unit, rollOf(2, 'advance').roll)]
  const chargeKinds = (s: GameState, unit: string) =>
    hookService.collect(ctxOf(s).ctx, 'onChargeRoll', { chargingUnitId: unit, targetUnitIds: [BOYZ], roll: rollOf(4, 'charge') }).map((r) => r.result)

  it('DAR-008 the Advance roll and the Charge roll of both halves of the attached unit offer a re-roll of everything; other units and the default bearer give none', () => {
    const s = makeState({ phase: 'movement', a: ZEALOUS })
    for (const half of [INT, MORD]) {
      expect(advanceKinds(s, half)).toEqual(['all'])
      expect(chargeKinds(s, half)).toEqual([{ kind: 'roll', reroll: 'all' }])
    }
    expect(advanceKinds(s, INC)).toEqual([])
    expect(chargeKinds(s, INC)).toEqual([])
    expect(advanceKinds(s, BOYZ)).toEqual([])
    // without the enhancement (Stoic Exemplar) nothing is offered
    const plain = makeState({ phase: 'movement' })
    expect(advanceKinds(plain, INT)).toEqual([])
    expect(chargeKinds(plain, INT)).toEqual([])
    // Mordekai unattached: the bearer alone still gets it, the Intercessors no longer do
    const solo = makeState({ phase: 'movement', a: { ...ZEALOUS, attachments: [] } })
    expect(advanceKinds(solo, MORD)).toEqual(['all'])
    expect(advanceKinds(solo, INT)).toEqual([])
  })

  function chargeState(dice: number[]) {
    const s = makeState({ phase: 'charge', a: ZEALOUS })
    placeUnit(s, MORD, [[0, -2]])
    placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 0, z: 6.5, gap: 0.3 })
    const c = createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
    const act = (action: Action): void => {
      if (!c.ctx.state.pending) chargeModule.advance(c.ctx)
      const pending = c.ctx.state.pending as PendingDecision
      const rej = chargeModule.validate ? chargeModule.validate(c.ctx.state, action, pending) : null
      if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
      c.ctx.state.pending = null
      const handled = chargeModule.handle(c.ctx, action, pending)
      if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
      chargeModule.advance(c.ctx)
    }
    chargeModule.enter(c.ctx)
    act({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: INT })
    act({ type: 'declareCharge', player: 'A', decisionId: '', unitId: INT, targetUnitIds: [BOYZ] })
    return { s, act, ...c }
  }
  const isOffer = (s: GameState): boolean => s.pending?.kind === 'chooseOption' && (s.pending as ChooseOptionDecision).context.topic === 'rerollOffer'

  it('DAR-008 a charge roll that falls short is re-rolled automatically and the new dice stand; a die already re-rolled is never re-rolled again', () => {
    // 1+1 cannot reach; the automatic re-roll gives 1+2, also short: it stands (no second re-roll, no offer)
    const { s, events } = chargeState([1, 1, 1, 2, 6, 6])
    expect(of(events, 'ChargeRolled').map((e) => e.dice)).toEqual([[1, 2]])
    expect(of(events, 'ChargeFailed')).toHaveLength(1)
    expect(isOffer(s)).toBe(false)
    // short roll then a good re-roll
    const ok = chargeState([1, 1, 3, 3])
    expect(of(ok.events, 'ChargeRolled').map((e) => e.dice)).toEqual([[3, 3]])
    expect(of(ok.events, 'ChargeFailed')).toHaveLength(0)
  })

  it('DAR-008 a roll that already makes the charge is only offered a re-roll; the re-roll is taken once and not offered again', () => {
    const a = chargeState([3, 3, 6, 6])
    expect(isOffer(a.s)).toBe(true)
    expect(of(a.events, 'ChargeRolled')).toHaveLength(0)
    a.act({ type: 'chooseOption', player: 'A', decisionId: '', optionId: 'reroll' })
    expect(of(a.events, 'ChargeRolled').map((e) => e.dice)).toEqual([[6, 6]])
    expect(isOffer(a.s)).toBe(false)
    const b = chargeState([3, 3, 6, 6])
    b.act({ type: 'chooseOption', player: 'A', decisionId: '', optionId: 'keep' })
    expect(of(b.events, 'ChargeRolled').map((e) => e.dice)).toEqual([[3, 3]])
  })
})

// ---------- Redemptor Dreadnought ----------
describe('Redemptor Dreadnought weapons and Deadly Demise', () => {
  function fire(s: GameState, shooter: string, weaponId: string, targetUnit: string, attacks: number | null, dice: number[]) {
    const c = ctxOf(s, dice)
    attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: shooter, overwatch: false, targets: [target(s, `${shooter}#0`, weaponId, targetUnit, attacks)] })
    drive(c)
    return c.events
  }
  function cleanState(): GameState {
    const s = makeState({ phase: 'shooting' })
    s.players.A.cp = 0
    s.players.B.cp = 0
    placeUnit(s, RED, [[0, 0]])
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    return s
  }

  it('DAR-020 Deadly Demise D3: a destroyed Redemptor rolls a D6; on a 6 every unit within 6" takes D3 mortal wounds, on a 5 nothing happens', () => {
    const ds = makeState().datasheets['da.redemptor-dreadnought']
    expect(ds.coreAbilities).toContainEqual({ ability: 'DEADLY_DEMISE', value: 'D3' })
    const boom = (trigger: number, d3: number) => {
      const s = makeState({ phase: 'shooting', active: 'B' })
      placeUnit(s, RED, [[0, 0]]); placeUnit(s, BOYZ, { x: 3, z: 0, gap: 0.3 }); placeUnit(s, BOYZ2, { x: 30, z: 0, gap: 0.3 })
      const { ctx, events } = ctxOf(s, [trigger, d3])
      attackService.destroyModel(ctx, s.units[RED].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
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

  it('DAR-021 the incinerator is one weapon with two profiles: only the supercharge profile is Hazardous, and both are Blast', () => {
    const s = cleanState()
    const std = weaponService.effectiveWeapon(s, `${RED}#0`, 'da.w.macro-plasma-incinerator')
    const sup = weaponService.effectiveWeapon(s, `${RED}#0`, 'da.w.macro-plasma-incinerator-supercharge')
    expect(std.profileGroup).toBe(sup.profileGroup)
    expect(std.profileGroup).toBe('da.w.macro-plasma-incinerator')
    expect(weaponService.hasAbility(std, 'HAZARDOUS')).toBe(false)
    expect(weaponService.hasAbility(sup, 'HAZARDOUS')).toBe(true)
    expect(weaponService.hasAbility(std, 'BLAST') && weaponService.hasAbility(sup, 'BLAST')).toBe(true)
    expect([std.S, std.AP, std.D, sup.S, sup.AP, sup.D]).toEqual([8, -3, 2, 9, -4, 3])
    const entries = buildShootingWeaponEntries(ctxOf(s).ctx, RED).filter((e) => e.profileGroup === 'da.w.macro-plasma-incinerator')
    expect(entries.map((e) => e.weaponId).sort()).toEqual(['da.w.macro-plasma-incinerator', 'da.w.macro-plasma-incinerator-supercharge'])
  })

  it('DAR-021 supercharge: a Hazardous test of 1 gives the Redemptor 3 mortal wounds; a 2+ costs nothing; the standard profile is never tested', () => {
    const SUPER = 'da.w.macro-plasma-incinerator-supercharge'
    const failed = fire(cleanState(), RED, SUPER, BOYZ, 1, [4, 2, 1, ...TAIL])
    expect(of(failed, 'HazardousTested')[0]).toMatchObject({ failed: true, modelId: `${RED}#0` })
    const hurt = of(failed, 'DamageApplied').filter((d) => d.modelId === `${RED}#0` && d.mortal)
    expect(hurt.reduce((n, d) => n + d.amount, 0)).toBe(3)
    const passed = fire(cleanState(), RED, SUPER, BOYZ, 1, [4, 2, 2, ...TAIL])
    expect(of(passed, 'HazardousTested')[0]).toMatchObject({ failed: false })
    expect(of(passed, 'DamageApplied').some((d) => d.modelId === `${RED}#0`)).toBe(false)
    const standard = fire(cleanState(), RED, 'da.w.macro-plasma-incinerator', BOYZ, 1, [4, 2, 1, ...TAIL])
    expect(of(standard, 'HazardousTested')).toHaveLength(0)
  })

  it('DAR-021 Blast adds one attack for every five models in the target unit (D6+1 attacks, 10 Boyz = +2)', () => {
    const s = cleanState()
    const models = s.units[BOYZ].models.length
    expect(models).toBeGreaterThanOrEqual(5)
    const evs = fire(s, RED, 'da.w.macro-plasma-incinerator', BOYZ, null, [3, ...TAIL]) // D6 = 3 -> 4 attacks
    expect(of(evs, 'HitRolled')).toHaveLength(4 + Math.floor(models / 5))
  })

  it('DAR-022 Icarus rocket pod: Anti-FLY 2+, an unmodified wound roll of 2 is a critical wound against a FLY unit and just a failure against anything else', () => {
    const pod = 'da.w.icarus-rocket-pod'
    expect(weaponService.effectiveWeapon(cleanState(), `${RED}#0`, pod).abilities).toContainEqual({ ability: 'ANTI', keyword: 'FLY', value: 2 })
    const s = cleanState()
    withKeyword(s, BOYZ, 'FLY')
    const fly = fire(s, RED, pod, BOYZ, 1, [4, 2, ...TAIL])
    expect(of(fly, 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: true, critical: true })
    const ground = fire(cleanState(), RED, pod, BOYZ, 1, [4, 2, ...TAIL])
    expect(of(ground, 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: false, critical: false })
  })

  it('DAR-022 onslaught gatling cannon: Devastating Wounds, a critical wound skips the save and deals its damage as mortal wounds', () => {
    const gat = 'da.w.onslaught-gatling-cannon'
    expect(weaponService.hasAbility(weaponService.effectiveWeapon(cleanState(), `${RED}#0`, gat), 'DEVASTATING_WOUNDS')).toBe(true)
    const crit = fire(cleanState(), RED, gat, BOYZ, 1, [4, 6, ...TAIL])
    expect(of(crit, 'WoundRolled')[0]).toMatchObject({ die: 6, critical: true })
    expect(of(crit, 'SaveRolled')).toHaveLength(0)
    expect(of(crit, 'DamageApplied').some((d) => d.unitId === BOYZ && d.mortal)).toBe(true)
    // a plain successful wound (S5 vs T5 wounds on 4+) is saved normally
    const plain = fire(cleanState(), RED, gat, BOYZ, 1, [4, 4, 4, ...TAIL])
    expect(of(plain, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: false })
    expect(of(plain, 'SaveRolled')).toHaveLength(1)
  })
})

// ---------- Inceptor Squad ----------
describe('Inceptor Squad', () => {
  function reservesState(round: number) {
    const s = makeState({ round, phase: 'movement' })
    s.units[INC].location = 'reserves'
    s.step = 'reinforcements'
    return s
  }
  const arrive = (s: GameState, pending: DeployUnitDecision, x: number, z: number): Action => ({
    type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
    placements: pending.context.unitIds.flatMap((u) => s.units[u].models).map((id, i) => ({ modelId: id, pos: { x: x + (i % 3) * 2, y: 0, z }, facing: 0 })),
  })

  it('DAR-023 Deep Strike: not offered in round 1; from round 2 it arrives anywhere more than 9" from every enemy and is refused closer', () => {
    expect(makeState().datasheets['da.inceptor-squad'].coreAbilities).toContainEqual({ ability: 'DEEP_STRIKE' })
    const r1 = reservesState(1)
    movementModule.advance(ctxOf(r1).ctx)
    expect(r1.pending?.kind === 'deployUnit').toBe(false)
    expect(r1.units[INC].location).toBe('reserves')

    const s = reservesState(2)
    expect(reserveRouteFor(s, INC)).toBe('deepStrike')
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([INC])
    expect(movementModule.validate!(s, arrive(s, pending, 10, 12), pending)).not.toBeNull() // 8" from the Boyz at x 18
    expect(movementModule.validate!(s, arrive(s, pending, 0, -8), pending)).toBeNull()
    s.pending = null
    expect(movementModule.handle(c.ctx, arrive(s, pending, 0, -8), pending)).toBeUndefined()
    expect(s.units[INC].location).toBe('board')
    expect(c.events.some((e) => e.type === 'ReinforcementsArrived' && e.unitId === INC && e.via === 'deepStrike')).toBe(true)
  })

  it('DAR-023 the assault bolters are Assault, Pistol, Sustained Hits 2 and Twin-linked, so they still fire while the Inceptors are in Engagement Range', () => {
    const s = makeState({ phase: 'shooting' })
    placeUnit(s, INC, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 0, z: 2.2, gap: 0.3 }) // base to base with the Inceptors
    expect(leaderService.inEngagementWithEnemy(s, INC)).toBe(true)
    const w = weaponService.effectiveWeapon(s, `${INC}#0`, 'da.w.assault-bolters')
    for (const ab of ['PISTOL', 'ASSAULT', 'TWIN_LINKED', 'SUSTAINED_HITS']) expect(weaponService.hasAbility(w, ab as never)).toBe(true)
    expect(weaponService.abilityValue(w, 'SUSTAINED_HITS')).toBe(2)
    const entries = buildShootingWeaponEntries(ctxOf(s).ctx, INC)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.weaponId === 'da.w.assault-bolters')).toBe(true)
    expect(entries.some((e) => e.legalTargets.includes(BOYZ))).toBe(true)
    // Intercessors in Engagement Range lose the bolt rifle (no Pistol)
    placeUnit(s, INT, { x: -10, z: 0, gap: 0.3 })
    placeUnit(s, MORD, [[-10, -2]])
    placeUnit(s, BOYZ2, { x: -10, z: 2.2, gap: 0.3 })
    const engaged = buildShootingWeaponEntries(ctxOf(s).ctx, INT).map((e) => e.weaponId)
    expect(engaged).not.toContain('da.w.bolt-rifle')
  })

  it('DAR-023 Sustained Hits 2: a critical hit scores two extra hits, each wound rolled on its own', () => {
    const s = makeState({ phase: 'shooting' })
    s.players.A.cp = 0; s.players.B.cp = 0
    placeUnit(s, INC, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    const c = ctxOf(s, [6, ...TAIL])
    attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: INC, overwatch: false, targets: [target(s, `${INC}#0`, 'da.w.assault-bolters', BOYZ, 1)] })
    drive(c)
    expect(of(c.events, 'HitRolled')[0]).toMatchObject({ die: 6, hit: true, critical: true, extraHits: 2 })
    expect(of(c.events, 'WoundRolled')).toHaveLength(3)
  })

  it('DAR-023 Twin-linked: a failed wound roll is re-rolled automatically', () => {
    const s = makeState({ phase: 'shooting' })
    s.players.A.cp = 0; s.players.B.cp = 0
    placeUnit(s, INC, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    // hit 4, wound 1 (S5 vs T5 needs 4+, fails) -> re-rolled to 6, which wounds
    const c = ctxOf(s, [4, 1, 6, ...TAIL])
    attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: INC, overwatch: false, targets: [target(s, `${INC}#0`, 'da.w.assault-bolters', BOYZ, 1)] })
    drive(c)
    expect(of(c.events, 'DiceRerolled').length).toBeGreaterThan(0)
    expect(of(c.events, 'WoundRolled')).toHaveLength(1)
    expect(of(c.events, 'WoundRolled')[0]).toMatchObject({ die: 6, wounded: true })
  })
})

// ---------- Intercessor bolt rifle ----------
describe('Intercessor bolt rifle', () => {
  it('DAR-024 Assault: after an Advance the Intercessors may still fire the bolt rifle, while Mordekai pistol (no Assault) may not', () => {
    const s = makeState({ phase: 'shooting' })
    placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, MORD, [[0, -2]])
    placeUnit(s, BOYZ, { x: 12, z: 0, gap: 0.3 })
    const bolt = weaponService.effectiveWeapon(s, `${INT}#0`, 'da.w.bolt-rifle')
    expect(weaponService.hasAbility(bolt, 'ASSAULT') && weaponService.hasAbility(bolt, 'HEAVY')).toBe(true)
    const ids = (): string[] => buildShootingWeaponEntries(ctxOf(s).ctx, INT).map((e) => e.weaponId)
    for (const h of leaderService.halves(s, INT)) s.units[h].turn.moveType = 'normal'
    expect(ids()).toContain('da.w.bolt-rifle')
    expect(ids()).toContain('da.w.absolvor-bolt-pistol')
    for (const h of leaderService.halves(s, INT)) s.units[h].turn.moveType = 'advance'
    expect(ids()).toContain('da.w.bolt-rifle')
    expect(ids()).not.toContain('da.w.absolvor-bolt-pistol')
    // the Redemptor has no Assault weapon at all: it cannot shoot after Advancing
    placeUnit(s, RED, [[-8, 0]])
    s.units[RED].turn.moveType = 'advance'
    expect(buildShootingWeaponEntries(ctxOf(s).ctx, RED)).toEqual([])
  })

  it('DAR-024 Heavy: +1 to hit when the unit Remained Stationary, none after a Normal move', () => {
    const hit = (moveType: 'stationary' | 'normal') => {
      const s = makeState({ phase: 'shooting' })
      s.players.A.cp = 0; s.players.B.cp = 0
      placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
      placeUnit(s, MORD, [[0, -2]])
      placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
      for (const h of leaderService.halves(s, INT)) s.units[h].turn.moveType = moveType
      const c = ctxOf(s, [2, ...TAIL])
      attackService.begin(c.ctx, { kind: 'ranged', attackerUnitId: INT, overwatch: false, targets: [target(s, `${INT}#1`, 'da.w.bolt-rifle', BOYZ, 1)] })
      drive(c)
      return of(c.events, 'HitRolled')[0]
    }
    expect(hit('stationary')).toMatchObject({ die: 2, final: 3, hit: true })
    expect(hit('normal')).toMatchObject({ die: 2, final: 2, hit: false })
  })
})
