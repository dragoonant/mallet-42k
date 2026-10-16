// Aeldari: The Fatebreakers (docs/spec/factions/aeldari.md, 12-checklist AEL-*). Real Combat Patrol data; covers the (b) code hooks:
// Strands of Fate pool creation, Foresight, Ineffable Agenda / A Greater Destiny, the three patrol stratagems, Fortune,
// Defenders of Fate, Crewed Platform, Patrol Squads and the Leader rule. The engine changes (E1-E5) have their own tests in
// aeldari-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { pendingReactions } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { evaluateCondition, hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { missionService } from '../../src/engine/missions'
import { reactiveMoveLegalActions } from '../../src/engine/phases/movement'
import { buildShootingWeaponEntries, shootingModule } from '../../src/engine/phases/shooting'
import { chargeModule } from '../../src/engine/phases/charge'
import { fightModule } from '../../src/engine/phases/fight'
import { movementModule } from '../../src/engine/phases/movement'
import { miracleHandler } from '../../src/engine/miracle'
import { objectiveService } from '../../src/engine/objectives'
import { stratagemService } from '../../src/engine/stratagems'
import { UtilityDecider } from '../../src/ai/utility'
import { stratagemScore } from '../../src/ai/stratagems'
import { hasKeyword, modelStats, removeModel, view } from '../../src/engine'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const AEL = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Aeldari', faction: 'aeldari', patrolId: 'ael.cp.the-fatebreakers', enhancementId: 'ael.e.foresight',
  secondaryId: 'ael.sec.ineffable-agenda', attachments: [{ leaderRef: 'farseer', bodyguardRef: 'guardians' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const FAR = 'A:farseer', GUA = 'A:guardians', WIN = 'A:windriders', WRA = 'A:wraithlord'
const WINA = 'A:windriders-a', WINB = 'A:windriders-b'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'
const OW = 'core.s.fire-overwatch'
const WHIP = 'ael.s.whip-fast-reactions', STORM = 'ael.s.storm-of-shots', ZEPH = 'ael.s.zephyr-swift'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; bAel?: boolean; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: AEL(o.a), B: o.bAel ? AEL(o.b) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'ael', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = 0
  s.players.B.cp = 0
  return s
}

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const SIX = Array.from({ length: 80 }, () => 6)

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const optionIds = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
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
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const modelWith = (s: GameState, unitId: string, weaponId: string): string => {
  const id = s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))
  if (!id) throw new Error(`no model of ${unitId} carries ${weaponId}`)
  return id
}

// a coherent Guardian Defenders block (2 rows of 5 plus the Heavy Weapon Platform beside them) with its top-left model at (x, z)
function placeGuardians(s: GameState, x: number, z: number): void {
  const pos: [number, number][] = Array.from({ length: 10 }, (_, i) => [x + (i % 5) * 1.3, z + Math.floor(i / 5) * 1.3])
  pos.push([x + 7.0, z + 0.65])
  placeUnit(s, GUA, pos)
  placeUnit(s, FAR, [[x + 2.6, z - 1.3]])
}

// drives the attack sequence to the end; every decision takes its first option
function drive(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('drive: too many decisions')
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

// ---------- stratagem harness (as adepta-sororitas.test.ts) ----------
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

// no option decision (second-unit pick) is open: the window is closed or simply offers further stratagems
const noSecondPick = (s: GameState): boolean => s.pending === null || s.pending.kind === 'stratagemWindow'

// answers a moveUnit (reactive move) decision through the Shooting module with the first legal placement, or passes
function answerMove(ctx: EngineContext, pass = false): void {
  const pending = ctx.state.pending as PendingDecision
  expect(pending.kind).toBe('moveUnit')
  const legal = reactiveMoveLegalActions(ctx.state, pending) ?? []
  const action = pass ? ({ type: 'pass', player: pending.player, decisionId: pending.id } as Action) : legal[0]
  expect(action).toBeDefined()
  ctx.state.pending = null
  const rej = shootingModule.handle(ctx, action, pending)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

// =====================================================================================================================
describe('Strands of Fate: pool creation (AEL-2.1)', () => {
  const round1 = (o: Opts = {}) => { const s = makeState({ ...o, round: 1 }); s.phase = 'command'; return s }
  const dice12 = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]

  it('AEL-003 AEL-2.1: round 1 start rolls 12 D6; reroll replaces the set with 11 fresh dice; keep makes them the Fate pool (one MiracleDieGained per die)', () => {
    const s = round1({ bAel: true })
    const fresh = [6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1]
    const { ctx, events } = ctxOf(s, [...dice12, ...fresh, ...dice12])
    expect(hookService.offerPicks(ctx, 'round.start', 'r1')).toBe(true)
    let p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A') // the first-turn player resolves first
    expect(p.context.data).toMatchObject({ code: 'strandsOfFate', draft: dice12 })
    expect(optionIds(s)).toEqual(['keep', 'reroll'])
    expect(p.options[1].label).toBe('Re-roll all as 11 dice')
    expect(of(events, 'DiceRolled')[0].roll.dice).toHaveLength(12)
    answerOption(ctx, 'reroll')
    p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(p.context.data.draft).toEqual(fresh) // the whole set is replaced, no die kept
    expect(s.players.A.miracle.dice).toEqual([])
    answerOption(ctx, 'keep')
    expect(s.players.A.miracle.dice).toEqual(fresh)
    expect(of(events, 'MiracleDieGained').filter((e) => e.player === 'A').map((e) => e.value)).toEqual(fresh)
    // the second Aeldari army is asked next, with its own 12 dice
    const q = s.pending as ChooseOptionDecision
    expect(q.player).toBe('B')
    expect(q.context.data.draft).toHaveLength(12)
  })

  it('AEL-003 the first-turn player resolves first even when it is player B', () => {
    const s = round1({ bAel: true })
    s.firstPlayer = 'B'
    const { ctx } = ctxOf(s, [...dice12, ...dice12])
    hookService.offerPicks(ctx, 'round.start', 'r1')
    expect((s.pending as ChooseOptionDecision).player).toBe('B')
    answerOption(ctx, 'keep')
    expect((s.pending as ChooseOptionDecision).player).toBe('A')
  })

  it('AEL-004 AEL-2.1: re-rolling down to one die ends the choice automatically with a 1-die pool', () => {
    const s = round1({ b: { name: 'Aeldari B' } })
    s.players.B.secondaryState.noop = true
    const seq = Array.from({ length: 78 }, (_, i) => (i % 6) + 1) // 12 + 11 + ... + 1 dice
    const { ctx } = ctxOf(s, seq)
    // the Ork opponent's own round-start pick (Waaagh!) comes first in the registry; decline it
    expect(hookService.offerPicks(ctx, 'round.start', 'r1')).toBe(true)
    if ((s.pending as ChooseOptionDecision).context.topic === 'waaagh') answerOption(ctx, 'wait')
    let guard = 0
    while (s.pending && (s.pending as ChooseOptionDecision).context.data.code === 'strandsOfFate') {
      if (guard++ > 20) throw new Error('too many rerolls')
      answerOption(ctx, 'reroll')
    }
    expect(s.pending).toBeNull()
    expect(s.players.A.miracle.dice).toEqual([6])
    expect(s.players.A.secondaryState['ael:fateDone']).toBe(true)
  })

  it('AEL-004 AEL-2.1: the non-Aeldari opponent gets no pool and no decision; the pick is not repeated after round 1 or once done', () => {
    const s = round1()
    const { ctx } = ctxOf(s, dice12)
    hookService.offerPicks(ctx, 'round.start', 'r1')
    if ((s.pending as ChooseOptionDecision).context.topic === 'waaagh') answerOption(ctx, 'wait')
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    answerOption(ctx, 'keep')
    expect(s.pending).toBeNull()
    expect(s.players.B.miracle.dice).toEqual([])
    expect(s.players.B.secondaryState['ael:fateDraft']).toBeUndefined()
    // done: a later window raises nothing
    expect(hookService.offerPicks(ctxOf(s, SIX).ctx, 'round.start', 'r1b')).toBe(false)
    // round 2: no pool is created at all
    const late = makeState({ bAel: true, round: 2 })
    expect(hookService.offerPicks(ctxOf(late, SIX).ctx, 'round.start', 'r2')).toBe(false)
    expect(late.players.A.miracle.dice).toEqual([])
  })
})

// =====================================================================================================================
describe('Foresight (AEL-3)', () => {
  function deploy(s: GameState) {
    placeGuardians(s, -21, 0)
    placeUnit(s, WIN, { x: -21, z: 5, gap: 0.3 })
    placeUnit(s, WRA, [[-16, -6]])
    placeUnit(s, BOYZ, { x: -4, z: 0, gap: 0.3 })
  }

  it('AEL-011 AEL-3: the bearer\'s unit is offered Fire Overwatch at 0 CP with 0 CP in the pool; other units are not; a second use the same turn is refused', () => {
    const s = makeState()
    deploy(s)
    phase(s, 'movement', 'B', { A: 0 })
    const trig = { unitId: BOYZ }
    const ids = offeredIds(s, 'A', 'movement.unitMoved', OW, trig).map((x) => x.join())
    expect(ids).toContain(`${BOYZ},${GUA}`)
    expect(ids.filter((x) => x.endsWith(WIN) || x.endsWith(WRA))).toEqual([])
    const h = stratHarness(s)
    h.ctx.window('movement.unitMoved', BOYZ, ['A'], trig)
    h.useOption(OW, GUA)
    expect(s.players.A.cp).toBe(0)
    const reactions = pendingReactions(s, 'overwatch')
    expect(reactions).toHaveLength(1)
    expect(reactions[0]).toMatchObject({ unitId: GUA, enemyUnitId: BOYZ, stratagemId: OW })
    // once per turn: the stratagem's own limit still applies
    expect(offeredIds(s, 'A', 'movement.unitMoved', OW, trig)).toEqual([])
  })

  it('AEL-011 without the enhancement the unit pays the usual 1 CP', () => {
    const s = makeState({ a: { enhancementId: 'ael.e.eldritch-might' } })
    deploy(s)
    phase(s, 'movement', 'B', { A: 0 })
    expect(offeredIds(s, 'A', 'movement.unitMoved', OW, { unitId: BOYZ })).toEqual([])
    s.players.A.cp = 1
    expect(offeredIds(s, 'A', 'movement.unitMoved', OW, { unitId: BOYZ }).map((x) => x.join())).toContain(`${BOYZ},${GUA}`)
  })

  it('AEL-012 AEL-3: Overwatch by Farseer + Guardians hits on 4+ on a controlled marker, 5+ elsewhere; other units and other stratagems get nothing; without the enhancement 6s only', () => {
    const s = makeState()
    deploy(s)
    const obj = Object.values(s.objectives)[0]
    placeUnit(s, GUA, [[obj.pos.x, obj.pos.z]])
    placeUnit(s, FAR, [[obj.pos.x, obj.pos.z + 1]])
    obj.controller = 'A'
    expect(hookService.overwatchHitOnFor(s, GUA, OW)).toBe(4)
    expect(hookService.overwatchHitOnFor(s, FAR, OW)).toBe(4) // the attached Farseer is the same unit
    obj.controller = 'B'
    expect(hookService.overwatchHitOnFor(s, GUA, OW)).toBe(5) // an enemy marker does not count
    obj.controller = null
    expect(hookService.overwatchHitOnFor(s, GUA, OW)).toBe(5)
    obj.controller = 'A'
    placeUnit(s, GUA, [[obj.pos.x + 25, obj.pos.z]])
    placeUnit(s, FAR, [[obj.pos.x + 25, obj.pos.z + 1]])
    expect(hookService.overwatchHitOnFor(s, GUA, OW)).toBe(5)
    expect(hookService.overwatchHitOnFor(s, WIN, OW)).toBe(6)
    expect(hookService.overwatchHitOnFor(s, GUA, 'tau.s.laser-marked-targets')).toBe(6)
    const none = makeState({ a: { enhancementId: 'ael.e.eldritch-might' } })
    deploy(none)
    expect(hookService.overwatchHitOnFor(none, GUA, OW)).toBe(6)
  })

  it('AEL-012 the threshold is applied as an unmodified roll: a 5 hits (not critical) at 5+, a 4 misses, a 6 is critical', () => {
    const run = (die: number) => {
      const s = makeState()
      deploy(s)
      const { ctx, events } = ctxOf(s, [die, ...SIX])
      const shooter = modelWith(s, FAR, 'ael.w.shuriken-pistol')
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: FAR, overwatch: true, overwatchHitOn: hookService.overwatchHitOnFor(s, FAR, OW), targets: [target(shooter, 'ael.w.shuriken-pistol', BOYZ)] })
      drive(ctx)
      return of(events, 'HitRolled')[0]
    }
    expect(run(5)).toMatchObject({ die: 5, hit: true, critical: false })
    expect(run(4)).toMatchObject({ die: 4, hit: false })
    expect(run(6)).toMatchObject({ die: 6, hit: true, critical: true })
  })
})

// =====================================================================================================================
describe('Secondaries (AEL-4)', () => {
  const marker = (s: GameState, id: string) => s.objectives[id]
  const vp = (s: GameState, source: string) => s.players.A.vpBySource[source] ?? 0
  function turnEnd(s: GameState, who: 'A' | 'B' = 'A'): number {
    s.phase = 'fight'; s.activePlayer = who; s.phaseState = emptyPhaseState()
    const before = vp(s, 'ineffable-agenda')
    missionService.onWindow(ctxOf(s, [], DEFAULT_MODULES).ctx, 'turn.end', 't')
    return vp(s, 'ineffable-agenda') - before
  }
  const setMarker = (s: GameState, id: string, controller: 'A' | 'B' | null, atStart: 'A' | 'B' | null) => {
    marker(s, id).controller = controller
    marker(s, id).controllerAtTurnStart = atStart
  }
  const ids = (s: GameState) => Object.keys(s.objectives)

  it('AEL-014 AEL-4: a marker outside the own zone held by the opponent or nobody at turn start and held now scores 3; one already held scores 0; one inside the own zone scores 0', () => {
    const s = makeState()
    const [west, east] = ids(s)
    for (const id of ids(s)) setMarker(s, id, null, null)
    setMarker(s, west, 'A', 'B')
    expect(turnEnd(s)).toBe(3)
    const nobody = makeState()
    for (const id of ids(nobody)) setMarker(nobody, id, null, null)
    setMarker(nobody, west, 'A', null)
    expect(turnEnd(nobody)).toBe(3)
    const held = makeState()
    for (const id of ids(held)) setMarker(held, id, null, null)
    setMarker(held, west, 'A', 'A')
    expect(turnEnd(held)).toBe(0)
    // a newly taken marker whose centre is inside the Aeldari deployment zone does not count
    const home = makeState()
    for (const id of ids(home)) setMarker(home, id, null, null)
    marker(home, east).pos = { x: 0, z: -12 }
    setMarker(home, east, 'A', null)
    expect(turnEnd(home)).toBe(0)
    // not controlled at the end of the turn: nothing
    const lost = makeState()
    for (const id of ids(lost)) setMarker(lost, id, null, null)
    setMarker(lost, west, 'B', 'B')
    expect(turnEnd(lost)).toBe(0)
  })

  it('AEL-015 AEL-4: two newly taken markers still score 3 (flat, not per marker); the opponent\'s turn end scores nothing', () => {
    const s = makeState()
    const [west, east] = ids(s)
    for (const id of ids(s)) setMarker(s, id, null, null)
    setMarker(s, west, 'A', null)
    setMarker(s, east, 'A', 'B')
    expect(turnEnd(s)).toBe(3)
    const t = makeState()
    for (const id of ids(t)) setMarker(t, id, null, null)
    setMarker(t, west, 'A', null)
    expect(turnEnd(t, 'B')).toBe(0)
  })

  it('AEL-015 the award is capped at 15 over the battle (5 turns x 3)', () => {
    const s = makeState()
    for (const id of ids(s)) setMarker(s, id, null, null)
    setMarker(s, ids(s)[0], 'A', null)
    let total = 0
    for (let round = 1; round <= 5; round++) { s.round = round; total += turnEnd(s) }
    expect(total).toBe(15)
  })

  describe('A Greater Destiny', () => {
    const zoneB = (s: GameState, unitId: string, z = 13) => (unitId === GUA ? placeGuardians(s, -2, z) : placeUnit(s, unitId, { x: -2, z, gap: 0.3 }))
    function battleEnd(s: GameState): number {
      s.round = 5; s.phase = 'fight'; s.phaseState = emptyPhaseState()
      const before = s.players.A.vp
      missionService.onWindow(ctxOf(s, []).ctx, 'battle.end', 'b')
      return s.players.A.vp - before
    }
    const destiny = () => makeState({ a: { secondaryId: 'ael.sec.a-greater-destiny' } })

    it('AEL-016 AEL-4: Windriders wholly in the enemy deployment zone at battle end -> +10 VP', () => {
      const s = destiny()
      zoneB(s, WIN)
      expect(battleEnd(s)).toBe(10)
    })

    it('AEL-016 AEL-4: one model outside the zone, or a Battle-shocked unit -> 0', () => {
      const s = destiny()
      zoneB(s, WIN)
      s.models[s.units[WIN].models[0]].pos = { x: -2, y: 0, z: 0 }
      expect(battleEnd(s)).toBe(0)
      const shocked = destiny()
      zoneB(shocked, WIN)
      shocked.units[WIN].battleShocked = true
      expect(battleEnd(shocked)).toBe(0)
    })

    it('AEL-016 AEL-4: the attached Farseer + Guardians count as one unit (every model of both halves must be in the zone)', () => {
      const s = destiny()
      zoneB(s, GUA)
      placeUnit(s, FAR, [[-2, 13]])
      expect(battleEnd(s)).toBe(10)
      const apart = destiny()
      zoneB(apart, GUA)
      placeUnit(apart, FAR, [[-2, 0]])
      expect(battleEnd(apart)).toBe(0)
    })
  })
})

// =====================================================================================================================
describe('Patrol stratagems (AEL-5)', () => {
  const placed = (o: Opts = {}) => {
    const s = makeState(o)
    placeGuardians(s, -21, 0)
    placeUnit(s, WRA, [[-16, -6]])
    if (s.units[WIN]) placeUnit(s, WIN, { x: -21, z: 6, gap: 0.3 })
    if (s.units[WINA]) { placeUnit(s, WINA, { x: -21, z: 6, gap: 0.3 }); placeUnit(s, WINB, { x: -21, z: 9, gap: 0.3 }) }
    placeUnit(s, BOYZ, { x: 8, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: 8, z: 8, gap: 0.3 })
    return s
  }
  const split = () => placed({ a: { splitUnits: ['windriders'] } })
  const hitMods = (s: GameState, ctx: EngineContext, a: AttackContext) => hookService.collect(ctx, 'onHitRoll', { attack: a, roll: rollOf(3, 'hit') }).map((r) => r.result).filter((r) => r.kind === 'roll' && r.modifier !== undefined)
  const orkShot = (s: GameState, target: string) => attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', target)
  const orkMelee = (s: GameState, target: string) => attackCtx(s, `${BOYZ}#1`, 'ork.w.choppa', target)

  it('AEL-017 AEL-5: Whip-fast Reactions - offered for a targeted INFANTRY / MOUNTED unit in the opponent\'s Shooting phase, never for the Wraithlord, not in own Shooting phase', () => {
    const s = placed()
    phase(s, 'shooting', 'B', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', WHIP, { unitId: BOYZ, targetUnitId: WIN })).toEqual([[WIN]])
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', WHIP, { unitId: BOYZ, targetUnitId: GUA })).toEqual([[GUA]])
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', WHIP, { unitId: BOYZ, targetUnitId: WRA })).toEqual([])
    phase(s, 'shooting', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', WHIP, { unitId: BOYZ, targetUnitId: WIN })).toEqual([])
  })

  it('AEL-017 AEL-5: used in the opponent\'s Shooting phase, attacks against the unit get -1 to hit (not other units), until the end of the phase', () => {
    const s = placed()
    phase(s, 'shooting', 'B', { A: 1 })
    const h = stratHarness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: WIN })
    h.useOption(WHIP, WIN)
    expect(hitMods(s, h.ctx, orkShot(s, WIN))).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(hitMods(s, h.ctx, orkMelee(s, WIN))).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(hitMods(s, h.ctx, orkShot(s, GUA))).toEqual([])
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(hitMods(s, h.ctx, orkShot(s, WIN))).toEqual([])
  })

  it('AEL-017 AEL-5: also offered in a Fight phase (either player\'s), where melee attacks against the unit get -1 to hit', () => {
    const s = placed()
    phase(s, 'fight', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', WHIP, { unitId: BOYZ, targetUnitId: WIN })).toEqual([[WIN]])
    phase(s, 'fight', 'B', { A: 1 })
    const h = stratHarness(s)
    h.ctx.window('fight.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), { unitId: BOYZ, targetUnitId: WIN })
    h.useOption(WHIP, WIN)
    expect(hitMods(s, h.ctx, orkMelee(s, WIN))).toEqual([{ kind: 'roll', modifier: -1 }])
  })

  it('AEL-018 AEL-5: Storm of Shots on the Guardians - +1 to hit for their attacks (a 2 hits on a 3+ weapon); with a -1 source the +-1 cap nets 0', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 1 })
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    expect(offeredIds(s, 'A', 'shooting.start', STORM).flat()).not.toContain(WRA) // the Wraithlord is not a legal target
    h.useOption(STORM, GUA)
    expect(noSecondPick(s)).toBe(true) // INFANTRY target: no second pick
    const shooter = modelWith(s, GUA, 'ael.w.shuriken-catapult')
    expect(hitMods(s, h.ctx, attackCtx(s, shooter, 'ael.w.shuriken-catapult', BOYZ))).toEqual([{ kind: 'roll', modifier: 1 }])
    expect(hitMods(s, h.ctx, attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', GUA))).toEqual([])
    const fire = (dice: number[]) => {
      const { ctx, events } = ctxOf(s, [...dice, ...SIX])
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: GUA, overwatch: false, targets: [target(shooter, 'ael.w.shuriken-catapult', BOYZ)] })
      drive(ctx)
      return of(events, 'HitRolled')[0]
    }
    expect(fire([2, 2])).toMatchObject({ die: 2, hit: true })
    // a -1 to hit source on the same unit: +1 and -1 net 0, so the 2 misses a 3+ weapon again
    effectService.grant(h.ctx, GUA, { modifyRoll: { roll: 'hit', value: -1 } }, { sourceAbilityId: 'test', sourceUnitId: GUA, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    expect(fire([2, 2])).toMatchObject({ die: 2, hit: false })
  })

  it('AEL-019 AEL-5: after a Patrol Squads split the second Windriders squad is offered and accepted -> both get +1 to hit; declining keeps it to the first', () => {
    const s = split()
    expect(s.units[WINA].models).toHaveLength(3)
    phase(s, 'shooting', 'A', { A: 2 })
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    h.useOption(STORM, WINA)
    expect(optionIds(s)).toEqual([WINB, 'decline'])
    answerOption(h.ctx, WINB)
    const shot = (unit: string) => hitMods(s, h.ctx, attackCtx(s, modelWith(s, unit, 'ael.w.scatter-laser'), 'ael.w.scatter-laser', BOYZ))
    expect(shot(WINA)).toEqual([{ kind: 'roll', modifier: 1 }])
    expect(shot(WINB)).toEqual([{ kind: 'roll', modifier: 1 }])
    // decline: only the first squad
    const t = split()
    phase(t, 'shooting', 'A', { A: 2 })
    const g = stratHarness(t)
    g.ctx.window('shooting.start', 'start', g.ctx.order.active())
    g.useOption(STORM, WINA)
    answerOption(g.ctx, 'decline')
    expect(hitMods(t, g.ctx, attackCtx(t, modelWith(t, WINB, 'ael.w.scatter-laser'), 'ael.w.scatter-laser', BOYZ))).toEqual([])
    expect(hitMods(t, g.ctx, attackCtx(t, modelWith(t, WINA, 'ael.w.scatter-laser'), 'ael.w.scatter-laser', BOYZ))).toEqual([{ kind: 'roll', modifier: 1 }])
  })

  it('AEL-019 a second squad that has already shot is not offered; an unsplit Windriders unit has no second pick', () => {
    const s = split()
    phase(s, 'shooting', 'A', { A: 2 })
    s.units[WINB].turn.shotThisPhase = true
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    h.useOption(STORM, WINA)
    expect(noSecondPick(s)).toBe(true)
    const u = placed()
    phase(u, 'shooting', 'A', { A: 2 })
    const g = stratHarness(u)
    g.ctx.window('shooting.start', 'start', g.ctx.order.active())
    g.useOption(STORM, WIN)
    expect(noSecondPick(u)).toBe(true)
  })

  it('AEL-020 AEL-5: Zephyr-swift on the Guardians - a Normal move of up to 6" in the own Shooting phase; the unit may still shoot afterwards, cannot charge, and its movement state is untouched', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.start', ZEPH).flat()).not.toContain(WRA)
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    const before = s.units[GUA].turn.moveType
    h.useOption(ZEPH, GUA)
    const mv = s.pending as unknown as { kind: string; context: { unitId: string; moveType: string }; constraints: { maxDistance?: number } }
    expect(mv.kind).toBe('moveUnit')
    expect(mv.context).toMatchObject({ unitId: GUA, moveType: 'normal' })
    expect(JSON.stringify(mv.constraints)).toContain('6')
    expect(JSON.stringify(s.units[GUA].effects)).toContain('"forbid":"charge"')
    const start = { ...s.models[s.units[GUA].models[0]].pos }
    answerMove(h.ctx)
    const end = s.models[s.units[GUA].models[0]].pos
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(0.5)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThanOrEqual(6.001)
    expect(s.units[GUA].turn.moveType).toBe(before) // Remained Stationary / Advanced state untouched
    expect(s.units[GUA].turn.shotThisPhase).toBe(false) // may still shoot
    expect(s.pending).toBeNull()
  })

  it('AEL-020 not offered to a unit in Engagement Range of an enemy', () => {
    const s = placed()
    phase(s, 'shooting', 'A', { A: 1 })
    const near = s.models[s.units[BOYZ].models[0]]
    placeUnit(s, GUA, [[near.pos.x - near.base.radius - 0.4 - 0.5, near.pos.z]])
    expect(offeredIds(s, 'A', 'shooting.start', ZEPH).flat()).not.toContain(GUA)
  })

  it('AEL-021 AEL-5, E5: Zephyr-swift on two Windriders squads - two reactive moves run one after the other, neither changing the movement state', () => {
    const s = split()
    phase(s, 'shooting', 'A', { A: 2 })
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    const before = [s.units[WINA].turn.moveType, s.units[WINB].turn.moveType]
    h.useOption(ZEPH, WINA)
    expect(optionIds(s)).toEqual([WINB, 'decline'])
    answerOption(h.ctx, WINB)
    expect((s.pending as unknown as { context: { unitId: string } }).context.unitId).toBe(WINA)
    answerMove(h.ctx)
    expect((s.pending as unknown as { kind: string; context: { unitId: string } }).kind).toBe('moveUnit')
    expect((s.pending as unknown as { context: { unitId: string } }).context.unitId).toBe(WINB)
    answerMove(h.ctx)
    expect(s.pending).toBeNull()
    expect([s.units[WINA].turn.moveType, s.units[WINB].turn.moveType]).toEqual(before)
    // both squads are barred from charging
    expect(JSON.stringify(s.units[WINA].effects)).toContain('"forbid":"charge"')
    expect(JSON.stringify(s.units[WINB].effects)).toContain('"forbid":"charge"')
  })

  it('AEL-021 a squad in Engagement Range is not offered as the second unit (nor as the first); declining moves the first squad only', () => {
    const s = split()
    phase(s, 'shooting', 'A', { A: 2 })
    const near = s.models[s.units[BOYZ].models[0]]
    placeUnit(s, WINB, [[near.pos.x - near.base.radius - 0.4 - 0.65, near.pos.z]])
    expect(offeredIds(s, 'A', 'shooting.start', ZEPH).flat()).not.toContain(WINB)
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    h.useOption(ZEPH, WINA)
    expect(s.pending && (s.pending as unknown as { kind: string }).kind).toBe('moveUnit') // no second pick: straight to the move
    answerMove(h.ctx)
    expect(s.pending).toBeNull()
    const t = split()
    phase(t, 'shooting', 'A', { A: 2 })
    const g = stratHarness(t)
    g.ctx.window('shooting.start', 'start', g.ctx.order.active())
    g.useOption(ZEPH, WINA)
    answerOption(g.ctx, 'decline')
    expect((t.pending as unknown as { context: { unitId: string } }).context.unitId).toBe(WINA)
    answerMove(g.ctx)
    expect(t.pending).toBeNull()
  })
})

// =====================================================================================================================
describe('Datasheet abilities (AEL-6)', () => {
  const hitWound = (s: GameState, ctx: EngineContext, a: AttackContext) => hookService.collect(ctx, 'onWoundRoll', { attack: a, roll: rollOf(4, 'wound') }).map((r) => r.result)

  describe('Fortune (AEL-6.1)', () => {
    function command() {
      const s = makeState()
      s.phase = 'command'
      s.phaseState = emptyPhaseState()
      placeGuardians(s, 1.5, 0)
      placeUnit(s, FAR, [[0, 0]])
      placeUnit(s, WIN, [[11, 0]]) // edge to edge: 11 - 0.49 - 0.63 = 9.9"
      placeUnit(s, WRA, [[13.9, 0]]) // edge to edge: 13.9 - 0.49 - 1.18 = 12.2"
      placeUnit(s, BOYZ, { x: 8, z: 10, gap: 0.3 })
      return s
    }

    it('AEL-022 AEL-6.1: a roll of 1 does nothing', () => {
      const s = command()
      const { ctx, events } = ctxOf(s, [1])
      expect(hookService.offerPicks(ctx, 'command.start', 'start')).toBe(false)
      expect(s.pending).toBeNull()
      expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === 'ael.a.fortune')).toBe(true)
      // once per Command phase: a repeated window does not roll again
      expect(hookService.offerPicks(ctx, 'command.start', 'start2')).toBe(false)
      expect(of(events, 'DiceRolled')).toHaveLength(1)
    })

    it('AEL-022 AEL-6.1: a 4 offers AELDARI units within 12" (not the Wraithlord at 12.2"); the pick gets -1 to be wounded until the next own Command phase', () => {
      const s = command()
      const { ctx } = ctxOf(s, [4])
      expect(hookService.offerPicks(ctx, 'command.start', 'start')).toBe(true)
      expect(optionIds(s).sort()).toEqual([GUA, WIN].sort())
      answerOption(ctx, WIN)
      const wound = (target: string) => hitWound(s, ctx, attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', target))
      expect(wound(WIN)).toEqual([{ kind: 'roll', modifier: -1 }])
      expect(wound(GUA)).toEqual([])
      // survives the rest of this turn and the opponent's turn, gone when the owner's next turn starts
      effectService.expire(ctx, 'phaseEnd', null)
      effectService.expire(ctx, 'turnEnd', null)
      expect(wound(WIN)).toEqual([{ kind: 'roll', modifier: -1 }])
      effectService.expire(ctx, 'nextOwnTurn', 'B')
      expect(wound(WIN)).toEqual([{ kind: 'roll', modifier: -1 }])
      effectService.expire(ctx, 'nextOwnTurn', 'A')
      expect(wound(WIN)).toEqual([])
    })

    it('AEL-022 a unit at 12.1" is not offered; a roll of 2 is enough', () => {
      const s = command()
      placeUnit(s, WIN, [[13.2, 0]]) // 13.2 - 0.49 - 0.63 = 12.08"
      const { ctx } = ctxOf(s, [2])
      expect(hookService.offerPicks(ctx, 'command.start', 'start')).toBe(true)
      expect(optionIds(s)).toEqual([GUA])
    })

    it('AEL-023 AEL-6.1: the Farseer\'s own unit (the attached Guardians) is a legal pick', () => {
      const s = command()
      placeUnit(s, WIN, [[30, 0]])
      placeUnit(s, WRA, [[30, 5]])
      const { ctx } = ctxOf(s, [6])
      hookService.offerPicks(ctx, 'command.start', 'start')
      expect(optionIds(s)).toEqual([GUA])
      answerOption(ctx, GUA)
      expect(hitWound(s, ctx, attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', GUA))).toEqual([{ kind: 'roll', modifier: -1 }])
      expect(hitWound(s, ctx, attackCtx(s, `${BOYZ}#1`, 'ork.w.rokkit-launcha', FAR))).toEqual([{ kind: 'roll', modifier: -1 }]) // the same unit
    })

    it('AEL-023 only the active player\'s Farseer rolls, and a Farseer off the battlefield does not', () => {
      const s = command()
      s.activePlayer = 'B'
      expect(hookService.offerPicks(ctxOf(s, [6]).ctx, 'command.start', 'start')).toBe(false)
      const t = command()
      t.units[FAR].location = 'destroyed'
      expect(hookService.offerPicks(ctxOf(t, [6]).ctx, 'command.start', 'start')).toBe(false)
    })
  })

  describe('Defenders of Fate (AEL-6.3)', () => {
    function commandEnd(s: GameState, dice: number[]) {
      s.phase = 'command'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
      const { ctx, events } = ctxOf(s, dice)
      hookService.run(ctx, 'onPhaseEnd', { hook: 'onPhaseEnd' } as never)
      return { ctx, events }
    }

    it('AEL-024 AEL-6.3: Guardians on one controlled marker -> a D6 is rolled and added to the Fate pool with that value (a 1 is kept too)', () => {
      const s = makeState()
      const obj = Object.values(s.objectives)[0]
      placeUnit(s, GUA, [[obj.pos.x, obj.pos.z]])
      placeUnit(s, FAR, [[obj.pos.x, obj.pos.z + 1]])
      const { events } = commandEnd(s, [1])
      expect(s.players.A.miracle.dice).toEqual([1])
      expect(of(events, 'MiracleDieGained')).toMatchObject([{ player: 'A', value: 1 }])
    })

    it('AEL-024 the event log names the rule Defenders of Fate, not the Sororitas Simulacrum Imperialis it reuses', () => {
      const s = makeState()
      const obj = Object.values(s.objectives)[0]
      placeUnit(s, GUA, [[obj.pos.x, obj.pos.z]])
      const { events } = commandEnd(s, [4])
      const logged = of(events, 'AbilityTriggered').filter((e) => e.abilityId === 'ael.a.defenders-of-fate')
      expect(logged).toHaveLength(1)
      expect(logged[0].summary).toBe(`Defenders of Fate: rolled 4 at ${obj.id}`)
    })

    it('AEL-024 AEL-6.3: two controlled markers with Guardians in range -> two dice; no controlled marker -> none', () => {
      const s = makeState()
      const [a, b] = Object.values(s.objectives)
      placeUnit(s, GUA, [[a.pos.x, a.pos.z], [a.pos.x, a.pos.z], [a.pos.x, a.pos.z], [a.pos.x, a.pos.z], [a.pos.x, a.pos.z], [b.pos.x, b.pos.z]])
      commandEnd(s, [3, 5])
      expect([...s.players.A.miracle.dice].sort()).toEqual([3, 5])
      const none = makeState()
      placeUnit(none, GUA, [[40, 40]])
      const { events } = commandEnd(none, [3, 5])
      expect(none.players.A.miracle.dice).toEqual([])
      expect(of(events, 'MiracleDieGained')).toHaveLength(0)
    })

    it('AEL-024 only the owner\'s own Command phase end counts; a Guardians unit off the marker gets nothing', () => {
      const s = makeState()
      const obj = Object.values(s.objectives)[0]
      placeUnit(s, GUA, [[obj.pos.x, obj.pos.z]])
      s.phase = 'command'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
      hookService.run(ctxOf(s, [4]).ctx, 'onPhaseEnd', { hook: 'onPhaseEnd' } as never)
      expect(s.players.A.miracle.dice).toEqual([])
      s.phase = 'shooting'; s.activePlayer = 'A'
      hookService.run(ctxOf(s, [4]).ctx, 'onPhaseEnd', { hook: 'onPhaseEnd' } as never)
      expect(s.players.A.miracle.dice).toEqual([])
    })
  })

  describe('Crewed Platform (AEL-6.4)', () => {
    const by = { player: 'B' as const, unitId: BOYZ, modelId: `${BOYZ}#0`, kind: 'ranged' as const }
    const platform = (s: GameState) => s.units[GUA].models.find((m) => s.models[m]?.datasheetModelId === 'heavy-weapon-platform')
    const guardians = (s: GameState) => s.units[GUA].models.filter((m) => s.models[m]?.datasheetModelId === 'guardian-defender')
    function deploy() {
      const s = makeState()
      s.phase = 'shooting'; s.activePlayer = 'B'
      placeGuardians(s, -21, 0)
      placeUnit(s, BOYZ, { x: 8, z: 0, gap: 0.3 })
      return s
    }

    it('AEL-025 AEL-6.4: the last Guardian Defender destroyed removes the Heavy Weapon Platform at once; the unit is destroyed, credited to the attacker; the Farseer survives alone', () => {
      const s = deploy()
      const { ctx, events } = ctxOf(s, [])
      const ids = [...guardians(s)]
      const plat = platform(s) as string
      for (const id of ids.slice(0, 9)) attackService.destroyModel(ctx, id, by)
      expect(platform(s)).toBe(plat) // still crewed
      expect(s.units[GUA].location).toBe('board')
      attackService.destroyModel(ctx, ids[9], by)
      expect(s.models[plat]).toBeUndefined()
      expect(s.units[GUA].location).toBe('destroyed')
      const gone = of(events, 'ModelDestroyed').find((e) => e.modelId === plat)!
      expect(gone).toMatchObject({ byPlayer: 'B', byUnitId: BOYZ, byModelId: `${BOYZ}#0` })
      expect(of(events, 'UnitDestroyed').filter((e) => e.unitId === GUA)).toMatchObject([{ byPlayer: 'B', byUnitId: BOYZ }])
      // the attached Farseer is not affected and now operates alone
      expect(s.units[FAR].location).toBe('board')
      expect(s.units[FAR].models).toHaveLength(1)
      expect(s.units[FAR].bodyguardUnitId ?? null).toBeNull()
    })

    it('AEL-026 AEL-6.4: the platform destroyed while Guardians live changes nothing else; Guardians die one by one with the platform staying until the last', () => {
      const s = deploy()
      const { ctx } = ctxOf(s, [])
      const plat = platform(s) as string
      attackService.destroyModel(ctx, plat, by)
      expect(guardians(s)).toHaveLength(10)
      expect(s.units[GUA].location).toBe('board')
      // with the platform gone the last Guardian simply ends the unit
      for (const id of [...guardians(s)]) attackService.destroyModel(ctx, id, by)
      expect(s.units[GUA].location).toBe('destroyed')
      const t = deploy()
      const c2 = ctxOf(t, [])
      for (const id of [...guardians(t)].slice(0, 5)) attackService.destroyModel(c2.ctx, id, by)
      expect(platform(t)).toBeDefined()
      expect(guardians(t)).toHaveLength(5)
    })

    it('AEL-025 the hook ignores models destroyed in other units', () => {
      const s = deploy()
      const { ctx } = ctxOf(s, [])
      for (const id of [...s.units[BOYZ].models]) attackService.destroyModel(ctx, id, { player: 'A', unitId: GUA, modelId: null, kind: 'ranged' })
      expect(platform(s)).toBeDefined()
      expect(guardians(s)).toHaveLength(10)
    })
  })

  describe('Patrol Squads and Leader (AEL-6.2 / 6.6)', () => {
    const build = (a: Partial<PlayerSetup> = {}) => createGameState({
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: AEL(a), B: ORK() },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }, bundle, 'ael-split', ENGINE_VERSION)

    it('AEL-029 AEL-6.6: splitting the Windriders gives two units of 3, each with one scatter laser and Starting Strength 3; the default stays one unit of 6', () => {
      const whole = build()
      expect(whole.units[WIN].models).toHaveLength(6)
      expect(whole.units[WINA]).toBeUndefined()
      const s = build({ splitUnits: ['windriders'] })
      expect(s.units[WIN]).toBeUndefined()
      for (const id of [WINA, WINB]) {
        expect(s.units[id].models).toHaveLength(3)
        expect(s.units[id].startingStrength).toBe(3)
        expect(s.units[id].models.filter((m) => s.models[m].weapons.includes('ael.w.scatter-laser'))).toHaveLength(1)
        expect(s.units[id].models.filter((m) => s.models[m].weapons.includes('ael.w.twin-shuriken-catapult'))).toHaveLength(2)
      }
      // each half keeps Strands of Fate
      expect(s.datasheets[s.units[WINA].datasheetId].abilities).toContain('ael.a.strands-of-fate')
    })

    it('AEL-030 AEL-6.2: the Farseer leads only the Guardian Defenders; attacks on the attached unit allocate to the Guardians first', () => {
      expect(() => build({ attachments: [{ leaderRef: 'farseer', bodyguardRef: 'windriders' }] })).toThrow()
      expect(() => build({ attachments: [{ leaderRef: 'farseer', bodyguardRef: 'wraithlord' }] })).toThrow()
      const s = build()
      expect(s.units[GUA].attachedLeaderId).toBe(FAR)
      expect(s.units[FAR].bodyguardUnitId).toBe(GUA)
      const pool = leaderService.allocatableModels!(s, GUA)
      expect(pool).toHaveLength(11)
      expect(pool).not.toContain(s.units[FAR].models[0])
      expect(leaderService.allocatableModels!(s, GUA, { precision: true, visibleCharacterIds: [s.units[FAR].models[0]] })).toContain(s.units[FAR].models[0])
    })
  })
})

// =====================================================================================================================
describe('AI (src/ai) plays the faction', () => {
  it('AEL-003 AI: re-rolls the opening Fate dice only while the smaller set is expected to beat the 5s and 6s already showing', async () => {
    const decide = async (draft: number[]) => {
      const s = makeState({ round: 1 })
      s.phase = 'command'
      const { ctx } = ctxOf(s, draft)
      hookService.offerPicks(ctx, 'round.start', 'r1')
      if ((s.pending as ChooseOptionDecision).context.topic === 'waaagh') answerOption(ctx, 'wait')
      const pending = s.pending as ChooseOptionDecision
      return (await new UtilityDecider('normal', 'ael').decide(view(s, 'A'), pending, pending.options.map((o) => o.action))) as { optionId: string }
    }
    expect((await decide([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 6])).optionId).toBe('reroll') // one high die in 12
    expect((await decide([5, 6, 5, 6, 5, 6, 1, 2, 3, 4, 5, 6])).optionId).toBe('keep') // six high dice in 12
  })

  it('AEL-018 AI: Storm of Shots is worth its CP for a unit with a real volley in range, Whip-fast Reactions for a targeted unit, and neither without a target', () => {
    const s = makeState()
    placeGuardians(s, -4, 0)
    placeUnit(s, WIN, { x: -4, z: 6, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 4, z: 0, gap: 0.3 })
    phase(s, 'shooting', 'A', { A: 3 })
    const storm = stratagemService.options(s, 'A', 'shooting.start').find((o) => o.stratagemId === STORM && o.targets.unitIds?.[0] === GUA)!
    const pendingA = { kind: 'stratagemWindow', id: 'd:x', player: 'A', window: 'shooting.start', canPass: true, options: [], context: { usable: [STORM], trigger: { rollId: null, unitId: null, targetUnitId: null } } } as unknown as PendingDecision
    expect(stratagemScore(s, 'A', pendingA, storm as UseStratagemAction, 1)).toBeGreaterThan(1)
    const far = makeState()
    placeGuardians(far, -21, 0)
    for (const id of Object.keys(far.units).filter((u) => u.startsWith('B:'))) far.units[id].location = 'reserves'
    phase(far, 'shooting', 'A', { A: 3 })
    const none = { ...storm, targets: { unitIds: [GUA], modelIds: [] } } as UseStratagemAction
    expect(stratagemScore(far, 'A', pendingA, none, 1)).toBe(-Infinity)
    // Whip-fast Reactions: the opponent's Shooting phase, Boyz shooting at the Guardians
    phase(s, 'shooting', 'B', { A: 3 })
    const pendingB = { kind: 'stratagemWindow', id: 'd:y', player: 'A', window: 'shooting.targetsDeclared', canPass: true, options: [], context: { usable: [WHIP], trigger: { rollId: null, unitId: BOYZ, targetUnitId: GUA } } } as unknown as PendingDecision
    const whip = stratagemService.options(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: GUA }).find((o) => o.stratagemId === WHIP)!
    expect(stratagemScore(s, 'A', pendingB, whip, 1)).not.toBe(-Infinity)
  })
})

// =====================================================================================================================
// Checklist IDs added after the first build: save / charge / Battle-shock substitution, Swift Demise (E4), Deadly Demise,
// weapon abilities, the Wraithlord's two catapults and ghostglaive profiles, FLY and the Platform's OC 0.
describe('Fate substitution on saves, charges and Battle-shock (AEL-2.2 / 2.3)', () => {
  const giveFate = (s: GameState, dice: number[]) => { s.players.A.miracle.dice = [...dice] }
  const miracleAnswer = (ctx: EngineContext, optionId: string, dieIndexes?: number[]) => {
    const pending = ctx.state.pending as ChooseOptionDecision
    ctx.state.pending = null
    const rej = miracleHandler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId, ...(dieIndexes ? { dieIndexes } : {}) } as Action, pending as PendingDecision)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
  }

  // the Aeldari player (A) is the target; B's Guardians (also Aeldari, empty pool) shoot catapults at A's Guardians
  function volley(attackers: number) {
    const s = makeState({ bAel: true })
    s.activePlayer = 'B'
    const bGua = 'B:guardians'
    placeUnit(s, bGua, s.units[bGua].models.map((_, i) => [8 + (i % 5) * 1.3, 3 + Math.floor(i / 5) * 1.3] as [number, number]))
    placeUnit(s, GUA, s.units[GUA].models.map((_, i) => [-12 + (i % 5) * 1.3, 3 + Math.floor(i / 5) * 1.3] as [number, number]))
    placeUnit(s, FAR, [[-9.4, 1.7]])
    const shooters = s.units[bGua].models.filter((m) => s.models[m].weapons.includes('ael.w.shuriken-catapult')).slice(0, attackers)
    return { s, bGua, shooters }
  }

  it('AEL-006 AEL-2.2: a Fate die 5 replaces one save die against the substituted unmodified 5 clears the save target and the save succeeds', () => {
    const { s, bGua, shooters } = volley(1)
    giveFate(s, [5])
    // 2 attacks: both hit (6), both wound (6); the single Fate die goes on the first save die, the second is rolled (1)
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 1, 1, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: bGua, overwatch: false, targets: [target(shooters[0], 'ael.w.shuriken-catapult', GUA)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.topic).toBe('miracleDie')
    expect(pending.context.data).toMatchObject({ purpose: 'save', pool: [5], needed: 4 })
    expect(pending.options.map((o) => o.label)).toEqual(['Roll normally', 'Use Fate die 5'])
    miracleAnswer(ctx, 'use:0')
    expect(s.players.A.miracle.dice).toEqual([])
    drive(ctx)
    const saves = of(events, 'SaveRolled')
    expect(saves[0]).toMatchObject({ die: 5, final: 5, needed: 4, saved: true }) // the substituted 5 counts as an unmodified 5 and clears the target
    expect(saves[1]).toMatchObject({ die: 1, saved: false })
    expect(of(events, 'MiracleDieSpent')).toMatchObject([{ mode: 'substitute', value: 5, purpose: 'save', player: 'A', unitId: GUA }])
    const saveRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'save')!.roll
    expect(saveRoll.substituted).toEqual([0])
  })

  it('AEL-006 AEL-2.3: a fast-rolled save batch counts as one Save roll per attack -> it accepts several Fate dice in one decision', () => {
    const { s, bGua, shooters } = volley(2)
    giveFate(s, [5, 6, 2])
    // 4 attacks (2 catapults x 2): all hit and wound
    const { ctx, events } = ctxOf(s, [...SIX.slice(0, 8), 1, 1, 1, 1, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: bGua, overwatch: false, targets: shooters.map((m) => target(m, 'ael.w.shuriken-catapult', GUA)) })
    expect(attackService.advance(ctx)).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.data).toMatchObject({ purpose: 'save', count: 4, maxSubstitutions: 3, pool: [5, 6, 2] })
    // one die at most per attack, never more dice than the pool holds
    const bad = (idx: number[]) => miracleHandler.validate!(s, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'use', dieIndexes: idx } as Action, pending as PendingDecision)
    expect(bad([0, 1, 2, 3])).not.toBeNull()
    expect(bad([0, 1])).toBeNull()
    miracleAnswer(ctx, 'use', [0, 1])
    expect(s.players.A.miracle.dice).toEqual([2])
    drive(ctx)
    const saveRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'save')!.roll
    expect(saveRoll.dice).toHaveLength(4)
    expect(saveRoll.dice.slice(0, 2)).toEqual([5, 6])
    expect(saveRoll.substituted).toEqual([0, 1])
    expect(of(events, 'MiracleDieSpent').map((e) => [e.value, e.purpose])).toEqual([[5, 'save'], [6, 'save']])
  })

  it('AEL-007 AEL-2.2: a Windriders charge roll accepts one Fate die, which replaces one of the 2D6 (the other is rolled)', () => {
    const s = makeState()
    s.phase = 'charge'; s.phaseState = emptyPhaseState()
    placeUnit(s, WIN, [[0, 0], [1.5, 0], [3, 0], [0, 1.5], [1.5, 1.5], [3, 1.5]])
    placeUnit(s, BOYZ, { x: 12, z: 0, gap: 0.3 })
    giveFate(s, [6, 3])
    const { ctx, events } = ctxOf(s, [2, 4])
    chargeModule.enter(ctx)
    const act = (action: Action) => {
      if (!ctx.state.pending) chargeModule.advance(ctx)
      const pending = ctx.state.pending as PendingDecision
      ctx.state.pending = null
      const rej = chargeModule.handle(ctx, action, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      return chargeModule.advance(ctx)
    }
    act({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: WIN })
    expect(act({ type: 'declareCharge', player: 'A', decisionId: '', unitId: WIN, targetUnitIds: [BOYZ] })).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.topic).toBe('miracleDie')
    expect(pending.context.data).toMatchObject({ purpose: 'charge', unitId: WIN, count: 2, maxSubstitutions: 1, pool: [6, 3] })
    expect(pending.options.map((o) => o.label)).toEqual(['Roll normally', 'Use Fate die 6', 'Use Fate die 3'])
    // two dice at once are refused: a 2D6 charge takes a single die
    expect(miracleHandler.validate!(s, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'use', dieIndexes: [0, 1] } as Action, pending as PendingDecision)).not.toBeNull()
    miracleAnswer(ctx, 'use:0')
    chargeModule.advance(ctx)
    expect(s.players.A.miracle.dice).toEqual([3])
    expect(of(events, 'ChargeRolled')[0]).toMatchObject({ unitId: WIN, dice: [6, 4], total: 10 })
    expect(of(events, 'MiracleDieSpent')).toMatchObject([{ value: 6, purpose: 'charge', mode: 'substitute', player: 'A' }])
  })

  it('AEL-007 AEL-2.2: a Battle-shock test takes one Fate die in place of one of the 2D6; declining rolls both normally', () => {
    const build = () => {
      const s = makeState()
      s.phase = 'command'; s.phaseState = emptyPhaseState()
      placeUnit(s, WIN, [[0, 0], [1.5, 0], [3, 0], [0, 1.5], [1.5, 1.5], [3, 1.5]])
      giveFate(s, [6])
      return s
    }
    const s = build()
    const { ctx, events } = ctxOf(s, [1, 1])
    expect(hookService.battleShockTest(ctx, WIN, 'test')).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.data).toMatchObject({ purpose: 'battleShock', unitId: WIN, count: 2, maxSubstitutions: 1, pool: [6] })
    miracleAnswer(ctx, 'use:0')
    // Fate die 6 + the rolled 1 = 7 against Leadership 6: passed
    expect(of(events, 'BattleShockTested')).toMatchObject([{ unitId: WIN, roll: 7, passed: true }])
    expect(s.units[WIN].battleShocked).toBe(false)
    expect(s.players.A.miracle.dice).toEqual([])
    const t = build()
    const c2 = ctxOf(t, [1, 1])
    expect(hookService.battleShockTest(c2.ctx, WIN, 'test')).toBe('pending')
    miracleAnswer(c2.ctx, 'skip')
    expect(of(c2.events, 'BattleShockTested')).toMatchObject([{ roll: 2, passed: false }])
    expect(t.units[WIN].battleShocked).toBe(true)
    expect(t.players.A.miracle.dice).toEqual([6])
  })
})

describe('Swift Demise (AEL-6.5, E4)', () => {
  // open ground south of the ruins: the Windriders on the left, the "east" marker moved to (10, -11) on the right
  function layout() {
    const s = makeState()
    const east = s.objectives.east
    east.pos = { x: 10, z: -11 }
    placeUnit(s, WIN, [[-12, -11], [-12, -9.5], [-12, -8], [-13.5, -11], [-13.5, -9.5], [-13.5, -8]])
    placeUnit(s, BOYZ2, { x: 16, z: -8, gap: 0.3 })
    return { s, east }
  }
  // Windriders (the scatter laser Windrider fires 6 attacks at 3+) shoot Boyz; the first hit batch is [1, 2, 2, 6, 6, 1]
  function shoot(o: { target: 'near' | 'far'; controller: 'A' | 'B' | null; nearOnMarker?: boolean }) {
    const { s, east } = layout()
    east.controller = o.controller
    placeUnit(s, BOYZ, { x: o.nearOnMarker === false ? 2 : east.pos.x, z: o.nearOnMarker === false ? -12 : east.pos.z, gap: 0.3 })
    const laser = modelWith(s, WIN, 'ael.w.scatter-laser')
    const { ctx, events } = ctxOf(s, [1, 2, 2, 6, 6, 1, ...SIX])
    const tgt = o.target === 'near' ? BOYZ : BOYZ2
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: WIN, overwatch: false, targets: [target(laser, 'ael.w.scatter-laser', tgt)] })
    drive(ctx)
    const hitRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'hit')!.roll
    const rerolled = of(events, 'DiceRerolled').find((e) => e.rollId === hitRoll.id)
    return { rerolled: rerolled ? [...(rerolled.indexes ?? [])].sort() : [], before: rerolled?.before ?? [] }
  }

  it('AEL-027 AEL-6.5: shooting the closest eligible target re-rolls Hit rolls of 1 only', () => {
    const r = shoot({ target: 'near', controller: null, nearOnMarker: false })
    expect(r.rerolled).toEqual([0, 5])
    expect(r.before).toEqual([1, 1])
  })

  it('AEL-027 AEL-6.5: a target that is not the closest eligible one gets no re-roll at all, even on a marker the opponent controls', () => {
    // BOYZ2 stands on the opponent-held marker but BOYZ is nearer, so the closest-eligible condition fails first
    const { s, east } = layout()
    east.controller = 'B'
    placeUnit(s, BOYZ, { x: 2, z: -12, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: east.pos.x, z: east.pos.z, gap: 0.3 })
    const laser = modelWith(s, WIN, 'ael.w.scatter-laser')
    const { ctx, events } = ctxOf(s, [1, 2, 2, 6, 6, 1, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: WIN, overwatch: false, targets: [target(laser, 'ael.w.scatter-laser', BOYZ2)] })
    drive(ctx)
    const hitRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'hit')!.roll
    expect(of(events, 'DiceRerolled').filter((e) => e.rollId === hitRoll.id)).toHaveLength(0)
  })

  it('AEL-028 AEL-6.5, E4: a closest target on a marker the opponent controls -> every failed Hit roll is re-rolled', () => {
    const r = shoot({ target: 'near', controller: 'B' })
    expect(r.rerolled).toEqual([0, 1, 2, 5])
    expect(r.before).toEqual([1, 2, 2, 1])
  })

  it('AEL-028 AEL-6.5, E4: a marker the Aeldari control, or one nobody controls, leaves it at re-rolling 1s', () => {
    for (const controller of ['A', null] as const) expect(shoot({ target: 'near', controller }).rerolled).toEqual([0, 5])
  })

  it('AEL-028 E4 condition: targetOnObjectiveControlledBy is true only with an attack, a non-removed marker of that controller in range of a target model (either half)', () => {
    const { s, east } = layout()
    placeUnit(s, BOYZ, { x: east.pos.x, z: east.pos.z, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: 16, z: -8, gap: 0.3 })
    const { ctx } = ctxOf(s)
    const a = attackCtx(s, modelWith(s, WIN, 'ael.w.scatter-laser'), 'ael.w.scatter-laser', BOYZ)
    const env = (attack: AttackContext | null) => ({ state: s, holder: s.units[WIN], player: 'A' as const, attack, roll: null, weapon: null })
    east.controller = 'B'
    expect(evaluateCondition(env(a), { targetOnObjectiveControlledBy: 'opponent' })).toBe(true)
    expect(evaluateCondition(env(a), { targetOnObjectiveControlledBy: 'self' })).toBe(false)
    expect(evaluateCondition(env(null), { targetOnObjectiveControlledBy: 'opponent' })).toBe(false) // no attack
    east.controller = 'A'
    expect(evaluateCondition(env(a), { targetOnObjectiveControlledBy: 'opponent' })).toBe(false)
    expect(evaluateCondition(env(a), { targetOnObjectiveControlledBy: 'self' })).toBe(true)
    east.controller = 'B'
    east.removed = true
    expect(evaluateCondition(env(a), { targetOnObjectiveControlledBy: 'opponent' })).toBe(false) // a razed marker never counts
    void ctx
  })
})

describe('Eldritch Might re-roll scope (AEL-3)', () => {
  const might = () => makeState({ a: { enhancementId: 'ael.e.eldritch-might' }, bAel: true })
  const rerolls = (events: GameEvent[], purpose: DiceRoll['purpose']) => {
    const roll = of(events, 'DiceRolled').find((e) => e.roll.purpose === purpose)!.roll
    return of(events, 'DiceRerolled').filter((e) => e.rollId === roll.id)
  }

  it('AEL-013 AEL-3: Eldritch Storm re-rolls a Hit roll of 1 and a Wound roll of 1 (only the 1s, once)', () => {
    const s = might()
    placeUnit(s, FAR, [[-12, -11]])
    placeUnit(s, 'B:guardians', { x: 8, z: -11, gap: 0.3 })
    // attacks D6 = 1 (+2 Blast); hits 1,6,6 -> the 1 is re-rolled to a 6; wounds 1,6,6 -> the 1 is re-rolled to a 6
    const { ctx, events } = ctxOf(s, [1, 1, 6, 6, 6, 1, 6, 6, 6, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: FAR, overwatch: false, targets: [target(s.units[FAR].models[0], 'ael.w.eldritch-storm', 'B:guardians')] })
    drive(ctx)
    expect(of(events, 'HitRolled')).toHaveLength(3)
    const hit = rerolls(events, 'hit')
    expect(hit).toHaveLength(1)
    expect(hit[0]).toMatchObject({ before: [1], indexes: [0] })
    const wound = rerolls(events, 'wound')
    expect(wound).toHaveLength(1)
    expect(wound[0]).toMatchObject({ before: [1], indexes: [0] })
  })

  it('AEL-013 AEL-3: a Damage roll of 1 is re-rolled free before Command Re-roll can be offered for it', () => {
    // drives the attack declining every decision, and reports the purposes Command Re-roll was offered for
    const run = (s: GameState) => {
      placeUnit(s, FAR, [[-12, -11]])
      placeUnit(s, 'B:guardians', { x: -6, z: -11, gap: 0.3 })
      s.players.A.cp = 3
      // Eldritch Storm (D3 damage, Blast): Attacks D6 = 1 (+2 Blast = 3), hits 6,6,6, wounds 6,6,6, saves 1,1,1, first Damage D3 rolls 1 (then 2 on a re-roll)
      const { ctx, events } = ctxOf(s, [1, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 2, ...SIX])
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: FAR, overwatch: false, targets: [target(s.units[FAR].models[0], 'ael.w.eldritch-storm', 'B:guardians')] })
      const offered: string[] = []
      let r = attackService.advance(ctx)
      for (let guard = 0; r === 'pending'; guard++) {
        if (guard > 500) throw new Error('too many decisions')
        const pending = ctx.state.pending!
        if (pending.kind === 'commandReroll') offered.push(pending.context.roll.purpose)
        const action = ('options' in pending && pending.kind !== 'commandReroll' && pending.options.length > 0 ? pending.options[0].action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
        ctx.state.pending = null
        const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
        const rej = owner.handle(ctx, action, pending)
        if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
        r = attackService.advance(ctx)
      }
      return { offered, events }
    }
    const withMight = run(might())
    expect(withMight.offered).not.toContain('damage')
    expect(rerolls(withMight.events, 'damage')).toHaveLength(1)
    expect(rerolls(withMight.events, 'damage')[0]).toMatchObject({ before: [1] })
    // control: without the enhancement the same Damage roll of 1 does get a Command Re-roll offer
    expect(run(makeState({ bAel: true })).offered).toContain('damage')
  })

  it('AEL-013 AEL-3: the shuriken pistol (not a Psychic weapon) and the Guardians\' catapults get no Eldritch Might re-roll', () => {
    const s = might()
    placeUnit(s, FAR, [[-12, -11]])
    placeUnit(s, 'B:guardians', { x: 8, z: -11, gap: 0.3 })
    const pistol = attackCtx(s, s.units[FAR].models[0], 'ael.w.shuriken-pistol', 'B:guardians')
    const storm = attackCtx(s, s.units[FAR].models[0], 'ael.w.eldritch-storm', 'B:guardians')
    placeUnit(s, GUA, { x: -12, z: -8, gap: 0.3 })
    const catapult = attackCtx(s, modelWith(s, GUA, 'ael.w.shuriken-catapult'), 'ael.w.shuriken-catapult', 'B:guardians')
    const { ctx } = ctxOf(s)
    const kinds = (hook: 'onHitRoll' | 'onWoundRoll', a: AttackContext) => hookService.collect(ctx, hook, { attack: a, roll: rollOf(1, hook === 'onHitRoll' ? 'hit' : 'wound') }).map((r) => r.result)
    expect(kinds('onHitRoll', storm)).toEqual([{ kind: 'roll', reroll: 'ones' }])
    expect(kinds('onWoundRoll', storm)).toEqual([{ kind: 'roll', reroll: 'ones' }])
    for (const a of [pistol, catapult]) {
      expect(kinds('onHitRoll', a)).toEqual([])
      expect(kinds('onWoundRoll', a)).toEqual([])
    }
    // end to end: the pistol's Hit roll of 1 stands
    const run = (unit: string, model: string, weapon: string) => {
      const { ctx: c, events } = ctxOf(s, [1, 1, 1, 1, 1, 1, ...SIX])
      attackService.begin(c, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [target(model, weapon, 'B:guardians')] })
      drive(c)
      return of(events, 'DiceRerolled').length
    }
    expect(run(FAR, s.units[FAR].models[0], 'ael.w.shuriken-pistol')).toBe(0)
  })
})

describe('Wraithlord and weapon rules (AEL-6)', () => {
  // open ground south of the ruins (z about -11) so line of sight is never in question
  const south = (s: GameState) => { s.phase = 'shooting'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState() }

  it('AEL-031 AEL-6.7: a destroyed Wraithlord rolls Deadly Demise 1 - on a 6, 1 mortal wound to every unit within 6" (friend or foe); a 5 does nothing', () => {
    const run = (die: number) => {
      const s = makeState()
      south(s); s.activePlayer = 'B'
      placeUnit(s, WRA, [[0, -11]])
      placeUnit(s, GUA, [[3, -11], [3, -12.5]]) // within 6" of the Wraithlord's base edge
      placeUnit(s, BOYZ, [[5, -8]])
      placeUnit(s, BOYZ2, [[30, -11]])
      const { ctx, events } = ctxOf(s, [die])
      attackService.destroyModel(ctx, s.units[WRA].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
      return { s, demise: of(events, 'DeadlyDemiseRolled')[0] }
    }
    const boom = run(6)
    expect(boom.demise).toMatchObject({ unitId: WRA, die: 6, exploded: true })
    expect(boom.demise.affected).toEqual(expect.arrayContaining([GUA, BOYZ]))
    expect(boom.demise.affected).not.toContain(BOYZ2)
    const queue = boom.s.phaseState.attack?.mortalQueue ?? []
    expect(queue.length).toBe(boom.demise.affected.length)
    expect(queue.every((q) => q.count === 1)).toBe(true)
    const quiet = run(5)
    expect(quiet.demise).toMatchObject({ die: 5, exploded: false, affected: [] })
    expect(quiet.s.phaseState.attack?.mortalQueue ?? []).toHaveLength(0)
  })

  it('AEL-032 AEL-6: Eldritch Storm [BLAST] adds 1 attack per 5 target models (10 Boyz: +2 on the D6; 4 Boyz: +0)', () => {
    const attacks = (remove: number) => {
      const s = makeState()
      south(s)
      placeUnit(s, FAR, [[-12, -11]])
      placeUnit(s, BOYZ, { x: 8, z: -11, gap: 0.3 })
      const { ctx, events } = ctxOf(s, [2, ...SIX])
      for (const m of s.units[BOYZ].models.slice(s.units[BOYZ].models.length - remove)) removeModel(s, m)
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: FAR, overwatch: false, targets: [target(s.units[FAR].models[0], 'ael.w.eldritch-storm', BOYZ)] })
      drive(ctx)
      return { hits: of(events, 'HitRolled').length, models: s.units[BOYZ].models.length }
    }
    const full = attacks(0)
    expect(full.models).toBeGreaterThanOrEqual(10)
    expect(full.hits).toBe(2 + Math.floor(full.models / 5))
    const small = attacks(full.models - 4)
    expect(small.models).toBe(4)
    expect(small.hits).toBe(2)
  })

  it('AEL-032 AEL-6: [TWIN-LINKED] - the twin shuriken catapult re-rolls failed Wound rolls, the plain Guardian catapult does not', () => {
    const wounds = (unit: string, weapon: string, place: (s: GameState) => void) => {
      const s = makeState()
      south(s)
      place(s)
      placeUnit(s, BOYZ, { x: 8, z: -11, gap: 0.3 })
      // 2 hits (6), 2 wounds that fail (1; S4 vs T5 needs 5+), then 6s for any re-roll
      const { ctx, events } = ctxOf(s, [6, 6, 1, 1, ...SIX])
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [target(modelWith(s, unit, weapon), weapon, BOYZ)] })
      drive(ctx)
      const roll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'wound')!.roll
      return of(events, 'DiceRerolled').filter((e) => e.rollId === roll.id)
    }
    const twin = wounds(WIN, 'ael.w.twin-shuriken-catapult', (s) => placeUnit(s, WIN, [[-12, -11], [-12, -9.5], [-12, -8], [-13.5, -11], [-13.5, -9.5], [-13.5, -8]]))
    expect(twin).toHaveLength(1)
    expect(twin[0]).toMatchObject({ before: [1, 1], indexes: [0, 1] })
    const plain = wounds(GUA, 'ael.w.shuriken-catapult', (s) => placeUnit(s, GUA, { x: -12, z: -11, gap: 0.3 }))
    expect(plain).toHaveLength(0)
  })

  it('AEL-032 AEL-6: [PISTOL] - an engaged unit may fire only the shuriken pistol (at the unit it is engaged with); [ASSAULT] weapons stay usable after Advancing, others do not', () => {
    const s = makeState()
    south(s)
    placeGuardians(s, -12, -12)
    // Boyz right against the Guardians' row: Engagement Range
    placeUnit(s, BOYZ, { x: -12, z: -9.2, gap: 0.3 })
    expect(leaderService.inEngagementWithEnemy(s, GUA)).toBe(true)
    const { ctx } = ctxOf(s)
    const engaged = buildShootingWeaponEntries(ctx, GUA).map((e) => e.weaponId)
    expect(engaged).toContain('ael.w.shuriken-pistol')
    expect(engaged).not.toContain('ael.w.shuriken-catapult')
    expect(engaged).not.toContain('ael.w.starcannon')
    expect(buildShootingWeaponEntries(ctx, GUA).find((e) => e.weaponId === 'ael.w.shuriken-pistol')!.legalTargets).toEqual([BOYZ])

    const t = makeState()
    south(t)
    placeUnit(t, WIN, [[-12, -11], [-12, -9.5], [-12, -8], [-13.5, -11], [-13.5, -9.5], [-13.5, -8]])
    placeUnit(t, BOYZ, { x: 8, z: -11, gap: 0.3 })
    t.units[WIN].turn.moveType = 'advance'
    const adv = buildShootingWeaponEntries(ctxOf(t).ctx, WIN).map((e) => e.weaponId)
    expect(adv).toContain('ael.w.twin-shuriken-catapult') // [ASSAULT]
    expect(adv).not.toContain('ael.w.scatter-laser') // no [ASSAULT]
    t.units[WIN].turn.moveType = 'stationary'
    expect(buildShootingWeaponEntries(ctxOf(t).ctx, WIN).map((e) => e.weaponId)).toContain('ael.w.scatter-laser')
  })

  it('AEL-033 AEL-6: the Wraithlord fires its two shuriken catapults at two different targets in the same activation', () => {
    const s = makeState()
    south(s)
    placeUnit(s, WRA, [[-12, -11]])
    placeUnit(s, BOYZ, { x: 4, z: -13, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: 4, z: -8, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, ...SIX])
    const entries = buildShootingWeaponEntries(ctx, WRA)
    const c1 = entries.find((e) => e.weaponId === 'ael.w.shuriken-catapult-wraithlord-1')!
    const c2 = entries.find((e) => e.weaponId === 'ael.w.shuriken-catapult-wraithlord-2')!
    expect(c1.legalTargets).toEqual(expect.arrayContaining([BOYZ, BOYZ2]))
    expect(c2.legalTargets).toEqual(expect.arrayContaining([BOYZ, BOYZ2]))
    const wid = s.units[WRA].models[0]
    attackService.begin(ctx, {
      kind: 'ranged', attackerUnitId: WRA, overwatch: false,
      targets: [target(wid, 'ael.w.shuriken-catapult-wraithlord-1', BOYZ), target(wid, 'ael.w.shuriken-catapult-wraithlord-2', BOYZ2)],
    })
    drive(ctx)
    const hitsBy = (t: string) => of(events, 'HitRolled').filter((e) => e.attack.targetUnitId === t && e.attack.weaponId.startsWith('ael.w.shuriken-catapult-wraithlord'))
    expect(hitsBy(BOYZ).map((e) => e.attack.weaponId)).toEqual(['ael.w.shuriken-catapult-wraithlord-1', 'ael.w.shuriken-catapult-wraithlord-1'])
    expect(hitsBy(BOYZ2).map((e) => e.attack.weaponId)).toEqual(['ael.w.shuriken-catapult-wraithlord-2', 'ael.w.shuriken-catapult-wraithlord-2'])
  })

  it('AEL-033 AEL-6: the ghostglaive asks which profile to use each fight - strike (4 attacks) or sweep (8 attacks) - and only the chosen one attacks', () => {
    const fightWith = (choice: string) => {
      const s = makeState()
      s.phase = 'fight'; s.activePlayer = 'B' // the non-active player (the Aeldari) selects first in the remaining-combats step
      s.phaseState = emptyPhaseState()
      const r = s.models[s.units[WRA].models[0]].base.radius + s.models[`${BOYZ}#0`].base.radius
      placeUnit(s, WRA, [[0, -11]])
      placeUnit(s, BOYZ, [[r + 0.4, -11]])
      const { ctx, events } = ctxOf(s, [...SIX])
      const run = (action: Action): string => {
        if (!ctx.state.pending) fightModule.advance(ctx)
        const pending = ctx.state.pending as PendingDecision
        const rej = fightModule.validate ? fightModule.validate(ctx.state, action, pending) : null
        if (rej) return rej.code
        ctx.state.pending = null
        const h = fightModule.handle(ctx, action, pending)
        if (h) return h.code
        fightModule.advance(ctx)
        return 'ok'
      }
      fightModule.enter(ctx)
      expect(run({ type: 'chooseFightUnit', player: 'A', decisionId: '', unitId: WRA })).toBe('ok')
      expect(run({ type: 'pileIn', player: 'A', decisionId: '', unitId: WRA, placements: [] })).toBe('ok')
      const ask = s.pending as ChooseOptionDecision
      expect(ask.context.topic).toBe('meleeWeapon')
      expect(ask.options.map((o) => o.id).sort()).toEqual(['ael.w.ghostglaive-strike', 'ael.w.ghostglaive-sweep'])
      expect(run({ type: 'chooseOption', player: 'A', decisionId: '', optionId: choice })).toBe('ok')
      const decl = s.pending as PendingDecision & { kind: 'declareTargets' }
      expect(decl.kind).toBe('declareTargets')
      expect(decl.context.weapons.map((w) => w.weaponId)).toEqual([choice]) // the other profile is not offered
      const m = s.units[WRA].models[0]
      run({ type: 'declareTargets', player: 'A', decisionId: '', unitId: WRA, targets: [{ modelId: m, weaponId: choice, targetUnitId: BOYZ }] })
      return of(events, 'HitRolled').filter((e) => e.attack.attackerUnitId === WRA)
    }
    const sweep = fightWith('ael.w.ghostglaive-sweep')
    expect(sweep).toHaveLength(8)
    expect(new Set(sweep.map((e) => e.attack.weaponId))).toEqual(new Set(['ael.w.ghostglaive-sweep']))
    const strike = fightWith('ael.w.ghostglaive-strike')
    expect(strike).toHaveLength(4)
    expect(new Set(strike.map((e) => e.attack.weaponId))).toEqual(new Set(['ael.w.ghostglaive-strike']))
  })
})

describe('Movement and objective control (AEL-6)', () => {
  it('AEL-034 AEL-6: Windriders are M14 FLY - a 12" Normal move crosses an enemy unit that blocks a non-FLY unit; 15" is refused', () => {
    const build = (fly: boolean) => {
      const s = makeState()
      s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
      if (!fly) s.datasheets = { ...s.datasheets, [s.units[WIN].datasheetId]: { ...s.datasheets[s.units[WIN].datasheetId], keywords: s.datasheets[s.units[WIN].datasheetId].keywords.filter((k) => k !== 'FLY') } }
      const xs = [-19, -19, -19, -20.5, -20.5, -20.5]
      const zs = [-12, -10.5, -9, -12, -10.5, -9]
      placeUnit(s, WIN, xs.map((x, i) => [x, zs[i]] as [number, number]))
      // a wall of Boyz across the whole path, 6" in front
      placeUnit(s, BOYZ, Array.from({ length: s.units[BOYZ].models.length }, (_, i) => [-14, -14 + i * 1.5] as [number, number]))
      return s
    }
    const move = (s: GameState, dx: number) => {
      const { ctx } = ctxOf(s)
      movementModule.enter(ctx)
      const go = (action: Action) => {
        if (!ctx.state.pending) movementModule.advance(ctx)
        const pending = ctx.state.pending as PendingDecision
        const rej = movementModule.validate ? movementModule.validate(ctx.state, action, pending) : null
        if (rej) return `${rej.code} ${rej.reason}`
        ctx.state.pending = null
        const h = movementModule.handle(ctx, action, pending)
        return h ? h.code : 'ok'
      }
      expect(go({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: WIN })).toBe('ok')
      expect(go({ type: 'declareMove', player: 'A', decisionId: '', unitId: WIN, moveType: 'normal' })).toBe('ok')
      return go({ type: 'moveUnit', player: 'A', decisionId: '', unitId: WIN, placements: s.units[WIN].models.map((id) => ({ modelId: id, pos: { x: s.models[id].pos.x + dx, y: 0, z: s.models[id].pos.z } })) })
    }
    const s = build(true)
    expect(hasKeyword(s, WIN, 'FLY')).toBe(true)
    expect(modelStats(s, s.models[s.units[WIN].models[0]]).M).toBe(14)
    expect(move(build(true), 12)).toBe('ok')
    expect(move(build(false), 12)).toMatch(/^E_OVERLAP/) // the same move without FLY cannot cross the Boyz
    expect(move(build(true), 15)).toMatch(/^E_OUT_OF_RANGE/) // beyond M14
  })

  it('AEL-034 AEL-6: the Heavy Weapon Platform has OC 0 - alone on a marker it gives no control, and beside a Guardian it adds nothing', () => {
    const s = makeState()
    const obj = s.objectives.south
    const guardians = s.units[GUA].models.filter((m) => s.models[m].datasheetModelId === 'guardian-defender')
    const platform = s.units[GUA].models.find((m) => s.models[m].datasheetModelId === 'heavy-weapon-platform') as string
    expect(modelStats(s, s.models[platform]).OC).toBe(0)
    expect(modelStats(s, s.models[guardians[0]]).OC).toBe(2)
    const at = (onMarker: string[]) => placeUnit(s, GUA, s.units[GUA].models.map((id, i) => (onMarker.includes(id) ? [obj.pos.x, obj.pos.z] : [-20 + i * 1.3, 14]) as [number, number]))
    at([platform])
    expect(objectiveService.levelOfControl(s, obj.id).A).toBe(0)
    at([platform, guardians[0]])
    expect(objectiveService.levelOfControl(s, obj.id).A).toBe(2) // the Guardian's 2, the platform adds 0
    at([platform, guardians[0], guardians[1]])
    expect(objectiveService.levelOfControl(s, obj.id).A).toBe(4)
  })
})
