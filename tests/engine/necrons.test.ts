// Necrons: Amonhotekh's Guard (docs/spec/factions/necrons.md, 12-checklist NEC-001..NEC-035). Real Combat Patrol data:
// Reanimation Protocols, Resonant Focus, Plasmacyte, Reclaim and Dominate, Treasures of Aeons, the three patrol stratagems
// and the datasheet rules (Implacable Resilience, One Shot, Damaged, Deadly Demise).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel, setModelPos, whollyOnBoard,
  isCoherent, basesOverlap, withinEngagementRange,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectService } from '../../src/engine/effects'
import { runReanimation } from '../../src/engine/factions/necrons'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { missionService } from '../../src/engine/missions'
import { commandModule } from '../../src/engine/phases/command'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { overwatchTargets } from '../../src/engine/phases/movement'
import { overwatchTargetsFor } from '../../src/engine/phases/charge'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { woundRollNeeded } from '../../src/engine/dice'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const NEC = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Necrons', faction: 'necrons', patrolId: 'nec.cp.amonhotekhs-guard', enhancementId: 'nec.e.overriding-control', secondaryId: 'nec.sec.reclaim-and-dominate',
  attachments: [{ leaderRef: 'overlord', bodyguardRef: 'warriors' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const OVR = 'A:overlord', WAR = 'A:warriors', SKO = 'A:skorpekhs', SCA = 'A:scarabs', DOOM = 'A:doomstalker'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss', KOPTAS = 'B:deffkoptas', DREAD = 'B:deff-dread'
const MR = 'nec.s.mercurial-resilience', DF = 'nec.s.disruption-fields', WILL = 'nec.s.will-of-the-overlord'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mission?: string; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: o.mission ?? 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: NEC(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'necrons', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}

type Spot = { x: number; z: number; gap?: number } | [number, number][]
const SPOTS: Record<string, Spot> = {
  [WAR]: { x: -12, z: -3, gap: 0.3 }, [OVR]: [[-11.2, -4.3]], [SKO]: { x: -12, z: -9, gap: 0.3 }, [SCA]: { x: 8, z: -9, gap: 0.3 }, [DOOM]: [[10, -3]],
  [BOYZ]: { x: -6, z: 8, gap: 0.3 }, [BOYZ2]: { x: -6, z: 13, gap: 0.3 }, [BOSS]: [[20, 13]], [KOPTAS]: { x: 12, z: 6, gap: 1 }, [DREAD]: [[19, 0]],
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

// ---------- attack plumbing (same pattern as attack.test.ts) ----------
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
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const SIX = Array.from({ length: 40 }, () => 6)

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

// ---------- stratagem harness (as hooks.strat.test.ts) ----------
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

// =====================================================================================================================
describe('Reanimation Protocols (NEC-2.x)', () => {
  it('NEC-001 NEC-2.1: end of own Command phase, Skorpekhs 2/3 models with one wounded, D3 = 3 → heal, return at 1W, heal the returned model', () => {
    const s = makeState()
    deploy(s, SKO)
    const [m0, , m2] = s.units[SKO].models
    removeModel(s, m2)
    s.models[m0].woundsRemaining = 2
    const { ctx, events } = ctxOf(s, [6])
    runReanimation(ctx)
    const steps = events.filter((e) => e.type === 'WoundsRegained' || e.type === 'ModelReturned').map((e) => `${e.type}:${(e as { modelId: string }).modelId}`)
    expect(steps).toEqual([`WoundsRegained:${m0}`, `ModelReturned:${m2}`, `WoundsRegained:${m2}`])
    expect(s.models[m0].woundsRemaining).toBe(3)
    expect(s.models[m2].woundsRemaining).toBe(2)
    expect(s.units[SKO].models).toHaveLength(3)
  })

  it('NEC-002 NEC-2.1: never in the opponent\'s Command phase, nor at the end of any other phase', () => {
    const s = makeState()
    deploy(s, SKO)
    removeModel(s, s.units[SKO].models[2])
    s.activePlayer = 'B'
    const { ctx, events } = ctxOf(s, [])
    runReanimation(ctx) // B's Command phase: B has nothing to reanimate and A's units are not rolled for (an empty script throws on any roll)
    s.activePlayer = 'A'
    s.phase = 'movement'
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(events.some((e) => e.type === 'ModelReturned' || e.type === 'WoundsRegained')).toBe(false)
    expect(s.units[SKO].models).toHaveLength(2)
  })

  it('NEC-003 NEC-2.2: full strength and full wounds → D3 rolled, nothing changes', () => {
    const s = makeState()
    deploy(s, SKO)
    const { ctx, events } = ctxOf(s, [4])
    runReanimation(ctx)
    expect(of(events, 'DiceRolled').filter((e) => e.roll.purpose === 'ability')).toHaveLength(1)
    expect(events.some((e) => e.type === 'ModelReturned' || e.type === 'WoundsRegained')).toBe(false)
    expect(s.units[SKO].models).toHaveLength(3)
  })

  it('NEC-004 NEC-2.2: healing comes first — Warriors 8/10 and the attached Overlord at 4/6 W, D3 = 2 → Overlord to 6 W, no Warrior returns', () => {
    const s = makeState()
    deploy(s, WAR, OVR)
    const warriors = s.units[WAR].models
    removeModel(s, warriors[8]); removeModel(s, warriors[9])
    s.models[`${OVR}#0`].woundsRemaining = 4
    const { ctx, events } = ctxOf(s, [3])
    runReanimation(ctx)
    expect(s.models[`${OVR}#0`].woundsRemaining).toBe(6)
    expect(s.units[WAR].models).toHaveLength(8)
    expect(of(events, 'WoundsRegained')).toHaveLength(2)
    expect(of(events, 'ModelReturned')).toHaveLength(0)
  })

  it('NEC-005 NEC-2.3: an attached Overlord + Warriors roll one D3 (Starting Strength 11)', () => {
    const s = makeState()
    deploy(s, WAR, OVR)
    expect(leaderService.startingStrength(s, WAR)).toBe(11)
    const { ctx, events } = ctxOf(s, [2]) // exactly one die available
    runReanimation(ctx)
    expect(of(events, 'DiceRolled').filter((e) => e.roll.purpose === 'ability')).toHaveLength(1)
  })

  it('NEC-006 NEC-2.3: Overlord destroyed → the bodyguard is its own unit and the Overlord never comes back', () => {
    const s = makeState()
    deploy(s, WAR, OVR)
    const { ctx, events } = ctxOf(s, [6])
    const warriors = s.units[WAR].models
    removeModel(s, warriors[8]); removeModel(s, warriors[9])
    removeModel(s, `${OVR}#0`)
    leaderService.detach(ctx, WAR)
    runReanimation(ctx)
    expect(of(events, 'ModelReturned').map((e) => e.modelId).sort()).toEqual([warriors[8], warriors[9]].sort())
    expect(s.units[OVR].location).toBe('destroyed')
    expect(s.units[OVR].models).toHaveLength(0)
    expect(s.units[WAR].models).toHaveLength(10)
  })

  it('NEC-007 NEC-2.3: all Warriors destroyed while led → the Overlord alone (Starting Strength 1) cannot return them', () => {
    const s = makeState()
    deploy(s, WAR, OVR)
    const { ctx, events } = ctxOf(s, [6])
    for (const id of [...s.units[WAR].models]) removeModel(s, id)
    leaderService.detach(ctx, OVR)
    runReanimation(ctx)
    expect(s.units[WAR].location).toBe('destroyed')
    expect(of(events, 'ModelReturned')).toHaveLength(0)
    expect(s.units[WAR].models).toHaveLength(0)
  })

  it('NEC-008 NEC-2.3: a unit whose location is destroyed never reanimates', () => {
    const s = makeState()
    deploy(s, SKO)
    for (const id of [...s.units[SKO].models]) removeModel(s, id)
    expect(s.units[SKO].location).toBe('destroyed')
    const { ctx, events } = ctxOf(s, [])
    runReanimation(ctx)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(s.units[SKO].models).toHaveLength(0)
  })

  it('NEC-009 NEC-2.4: a returned Warrior keeps its model id and loadout (a destroyed gauss reaper returns with a gauss reaper)', () => {
    const s = makeState()
    deploy(s, WAR, OVR)
    const reaper = s.units[WAR].models.find((id) => s.models[id].weapons.includes('nec.w.gauss-reaper')) as string
    const loadout = [...s.models[reaper].weapons]
    removeModel(s, reaper)
    const { ctx } = ctxOf(s, [1])
    runReanimation(ctx)
    expect(s.models[reaper]).toBeDefined()
    expect(s.models[reaper].weapons).toEqual(loadout)
    expect(s.models[reaper].datasheetModelId).toBe('warrior-reaper')
    expect(s.models[reaper].woundsRemaining).toBe(1)
    expect(s.units[WAR].models).toContain(reaper)
  })

  it('NEC-010 NEC-2.4: the returned model is on the board, in coherency, overlaps nothing and is not newly in Engagement Range', () => {
    const s = makeState()
    deploy(s, WAR, OVR, BOYZ)
    // an enemy row two inches beyond the warriors' line: some ring spots would fall within its Engagement Range
    placeUnit(s, BOYZ, { x: -12, z: -0.2, gap: 0.3 })
    const warriors = s.units[WAR].models
    const gone = [warriors[7], warriors[8], warriors[9]]
    for (const id of gone) removeModel(s, id)
    const { ctx, events } = ctxOf(s, [6])
    runReanimation(ctx)
    const returned = of(events, 'ModelReturned').map((e) => s.models[e.modelId])
    expect(returned.length).toBeGreaterThan(0)
    const mine = [...s.units[WAR].models, ...s.units[OVR].models].map((id) => s.models[id])
    expect(isCoherent(mine)).toBe(true)
    const everyone = Object.values(s.models)
    for (const m of returned) {
      expect(whollyOnBoard(m, s.board)).toBe(true)
      expect(everyone.filter((o) => o.id !== m.id && basesOverlap(m, o))).toEqual([])
      expect(s.units[BOYZ].models.some((id) => withinEngagementRange(m, s.models[id]))).toBe(false)
    }
  })

  it('NEC-011 NEC-2.4: no legal spot (unit boxed in) → the step is wasted and the model stays destroyed', () => {
    const s = makeState()
    deploy(s, SCA, BOYZ)
    const scarabs = s.units[SCA].models
    removeModel(s, scarabs[1]); removeModel(s, scarabs[2])
    const survivor = s.models[scarabs[0]]
    // ten enemy models on a ring around the lone survivor, close enough to cover every candidate spot yet not engaging it
    s.units[BOYZ].models.forEach((id, i) => {
      const a = (i / 10) * Math.PI * 2
      setModelPos(s.models[id], { x: survivor.pos.x + Math.cos(a) * 2.5, y: 0, z: survivor.pos.z + Math.sin(a) * 2.5 })
    })
    const { ctx, events } = ctxOf(s, [6])
    runReanimation(ctx)
    expect(of(events, 'ModelReturned')).toHaveLength(0)
    expect(s.units[SCA].models).toHaveLength(1)
  })

  it('NEC-012 NEC-2.6: returned Warriors count for OC in the same command.end primary scoring', () => {
    const s = makeState({ a: { attachments: [] } })
    // west marker at (-10, 0): one surviving Warrior on it, three ork Boyz in range → contested/lost without the returns
    deploy(s, WAR, BOYZ)
    const warriors = s.units[WAR].models
    for (const id of warriors.slice(1)) removeModel(s, id)
    setModelPos(s.models[warriors[0]], { x: -10, y: 0, z: 0 })
    s.units[BOYZ].models.forEach((id, i) => setModelPos(s.models[id], { x: -10 + (i % 5) * 1.0, y: 0, z: 3.4 + Math.floor(i / 5) * 1.0 }))
    for (const id of s.units[BOYZ].models.slice(3)) setModelPos(s.models[id], { x: 15, y: 0, z: 12 })
    const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: { ...DEFAULT_MODULES.services, stratagems: { ...stratagemService, openWindow: () => false } }, topics: DEFAULT_MODULES.topics }
    // 2D6 for the Battle-shock test the depleted unit must take, then the Reanimation D3
    const { ctx, events } = ctxOf(s, [6, 6, 6], modules)
    s.step = 'command'
    expect(commandModule.advance(ctx)).toBe('done')
    const order = events.map((e) => e.type)
    expect(order.indexOf('ModelReturned')).toBeGreaterThan(-1)
    expect(order.indexOf('ModelReturned')).toBeLessThan(order.indexOf('VpScored'))
    expect(of(events, 'VpScored').find((e) => e.player === 'A')?.amount).toBe(5)
  })
})

// =====================================================================================================================
describe('Overriding Control / Protocol of Resonant Focus (NEC-3)', () => {
  it('NEC-013 NEC-3: Overriding Control — led Warriors may shoot after Falling Back, but still may not declare a charge', () => {
    const s = makeState()
    deploy(s, WAR, OVR)
    for (const id of [WAR, OVR]) s.units[id].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, WAR, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, WAR, 'charge')).toBe(false)
    expect(hookService.eligibilityFor(s, OVR, 'shoot')).toBe(true)
  })

  it('NEC-014 NEC-3: Overriding Control — a unit other than the bearer\'s cannot shoot after Falling Back', () => {
    const s = makeState()
    deploy(s, WAR, OVR, SKO)
    s.units[SKO].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, SKO, 'shoot')).toBe(false)
  })

  const resonantState = () => {
    const s = makeState({ a: { enhancementId: 'nec.e.protocol-of-resonant-focus' } })
    deploy(s, WAR, OVR, DOOM)
    placeUnit(s, BOYZ, { x: -12, z: 6, gap: 0.3 }) // ~9" from the Overlord
    placeUnit(s, BOYZ2, { x: -12, z: 5.8, gap: 0.3 }) // alongside, but the line of sight to it is stubbed out
    placeUnit(s, BOSS, [[20, 13]]) // far beyond 12"
    s.phase = 'command'
    s.activePlayer = 'A'
    const modules: ModuleTable = {
      phases: DEFAULT_MODULES.phases, topics: DEFAULT_MODULES.topics,
      services: { ...DEFAULT_MODULES.services, los: { ...DEFAULT_MODULES.services.los, unitVisible: (_s, _m, unitId) => unitId !== BOYZ2 } },
    }
    return { s, modules }
  }

  it('NEC-015 NEC-3: the pick is offered at own command.start, only among enemies within 12" of and visible to the bearer', () => {
    const { s, modules } = resonantState()
    const { ctx } = ctxOf(s, [], modules)
    expect(hookService.offerPicks(ctx, 'command.start', 'start')).toBe(true)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual([BOYZ])
    // the opponent's own command.start never raises it
    const s2 = resonantState().s
    s2.activePlayer = 'B'
    const { ctx: ctx2 } = ctxOf(s2, [], modules)
    expect(hookService.offerPicks(ctx2, 'command.start', 'start')).toBe(false)
  })

  const mark = (s: GameState, modules: ModuleTable) => {
    const { ctx } = ctxOf(s, [], modules)
    hookService.offerPicks(ctx, 'command.start', 'start')
    answerOption(ctx, BOYZ)
  }
  const hitRerolls = (s: GameState, attackerModel: string, weapon: string, targetUnit: string, die = 1) => {
    const { ctx } = ctxOf(s)
    return hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, attackerModel, weapon, targetUnit), roll: rollOf(die, 'hit') }).map((r) => r.result)
  }

  it('NEC-016 NEC-3: friendly NECRONS attacks against the marked unit re-roll hit rolls of 1 (no other target, never a 2+)', () => {
    const { s, modules } = resonantState()
    mark(s, modules)
    const doom = `${DOOM}#0`
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toEqual([{ kind: 'roll', reroll: 'ones' }])
    expect(hitRerolls(s, `${WAR}#0`, 'nec.w.gauss-flayer', BOYZ)).toEqual([{ kind: 'roll', reroll: 'ones' }]) // any friendly NECRONS unit
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ2)).toEqual([])
    // end to end through the attack sequence: a hit die of 1 is re-rolled, a 2 is not
    const marked = ctxOf(s, [1, ...SIX])
    attackService.begin(marked.ctx, { kind: 'ranged', attackerUnitId: DOOM, overwatch: false, targets: [target(doom, 'nec.w.twin-gauss-flayer', BOYZ, 1)] })
    drive(marked.ctx)
    expect(of(marked.events, 'DiceRerolled').some((e) => e.before[0] === 1 && e.rollId === of(marked.events, 'HitRolled')[0]?.rollId)).toBe(true)
    const two = ctxOf(s, [2, ...SIX])
    attackService.begin(two.ctx, { kind: 'ranged', attackerUnitId: DOOM, overwatch: false, targets: [target(doom, 'nec.w.twin-gauss-flayer', BOYZ, 1)] })
    drive(two.ctx)
    expect(of(two.events, 'DiceRerolled')).toHaveLength(0)
  })

  it('NEC-017 NEC-3: the mark expires at the end of that turn (opponent\'s turn and later rounds: no re-roll)', () => {
    const { s, modules } = resonantState()
    mark(s, modules)
    const doom = `${DOOM}#0`
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toHaveLength(1)
    s.activePlayer = 'B'
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toEqual([])
    s.activePlayer = 'A'
    s.round += 1
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toEqual([])
  })

  it('NEC-036 NEC-3: the re-roll persists after the bearer is destroyed mid-turn (it lives on the marked unit, not on the Overlord)', () => {
    const { s, modules } = resonantState()
    mark(s, modules)
    const doom = `${DOOM}#0`
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toHaveLength(1)
    for (const id of [...s.units[OVR].models]) removeModel(s, id) // the Overlord dies after the mark was placed
    expect(s.units[OVR].location).toBe('destroyed')
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toEqual([{ kind: 'roll', reroll: 'ones' }])
    expect(hitRerolls(s, `${WAR}#0`, 'nec.w.gauss-flayer', BOYZ)).toEqual([{ kind: 'roll', reroll: 'ones' }])
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ2)).toEqual([])
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ, 2)).toEqual([{ kind: 'roll', reroll: 'ones' }]) // the effect itself only re-rolls 1s downstream
    const { ctx } = ctxOf(s)
    effectService.expire(ctx, 'turnEnd', 'A')
    expect(hitRerolls(s, doom, 'nec.w.twin-gauss-flayer', BOYZ)).toEqual([])
  })
})

// =====================================================================================================================
describe('Secondary objectives (NEC-4)', () => {
  const inEnemyZone = (s: GameState, unitId: string, z = 12) => placeUnit(s, unitId, { x: -4, z, gap: 0.4 })
  const turnEnd = (s: GameState) => {
    const { ctx, events } = ctxOf(s)
    s.activePlayer = 'A'
    missionService.onWindow(ctx, 'turn.end', 'turn')
    return { ctx, events }
  }

  it('NEC-018 NEC-4: Reclaim and Dominate — Scarabs wholly in the enemy zone at the end of own turn → +4 VP once, even with two qualifying units', () => {
    const s = makeState()
    inEnemyZone(s, SCA, 12)
    inEnemyZone(s, SKO, 13.5)
    turnEnd(s)
    expect(s.players.A.vp).toBe(4)
    expect(s.players.B.vp).toBe(0)
  })

  it('NEC-019 NEC-4: Reclaim and Dominate — one base partly outside the zone, or the unit Battle-shocked → 0 VP', () => {
    const s = makeState()
    inEnemyZone(s, SCA, 12)
    setModelPos(s.models[s.units[SCA].models[2]], { x: -2, y: 0, z: 9.9 }) // the zone starts at z = 10
    turnEnd(s)
    expect(s.players.A.vp).toBe(0)
    const s2 = makeState()
    inEnemyZone(s2, SCA, 12)
    s2.units[SCA].battleShocked = true
    turnEnd(s2)
    expect(s2.players.A.vp).toBe(0)
  })

  const treasureState = (mission = 'mission.cp-01') => makeState({ mission, a: { secondaryId: 'nec.sec.treasures-of-aeons' }, round: 1 })

  it('NEC-020 NEC-4: Treasures of Aeons — the pick is offered at the start of round 1 among No Man\'s Land markers only', () => {
    const s = treasureState('mission.cp-02')
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'round.start', '1')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id).sort()).toEqual(['center', 'nw', 'se'])
    answerOption(ctx, 'nw', missionService.handler)
    expect(s.players.A.secondaryState.treasureObjectiveId).toBe('nw')
  })

  const kill = (ctx: EngineContext, unitId: string, by: { player: 'A' | 'B' | null; unitId: string | null; modelId: string | null; kind: 'ranged' | 'mortal' }) => {
    for (const id of [...ctx.state.units[unitId].models]) attackService.destroyModel(ctx, id, by)
  }
  const byWarriors = { player: 'A' as const, unitId: WAR, modelId: `${WAR}#0`, kind: 'ranged' as const }

  it('NEC-021 NEC-4: an enemy unit near the treasure marker at the start of the phase, destroyed by Warriors that phase (after moving away) → +3 VP', () => {
    const s = treasureState()
    s.players.A.secondaryState.treasureObjectiveId = 'west' // (-10, 0)
    deploy(s, WAR)
    placeUnit(s, BOYZ, { x: -11, z: 1, gap: 0.3 })
    s.phase = 'shooting'
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'shooting.start', 'start')
    for (const id of s.units[BOYZ].models) setModelPos(s.models[id], { x: 15, y: 0, z: 12 }) // moved away before dying
    kill(ctx, BOYZ, byWarriors)
    expect(s.players.A.vp).toBe(3)
  })

  it('NEC-022 NEC-4: the owner\'s own deployment-zone marker also counts; a unit outside both at phase start scores nothing', () => {
    const s = treasureState('mission.cp-02')
    s.players.A.secondaryState.treasureObjectiveId = 'center'
    deploy(s, WAR)
    placeUnit(s, BOYZ, [[-16, -6.5]]) // near attacker-home (-16, -8)
    placeUnit(s, BOYZ2, { x: -6, z: 13, gap: 0.3 }) // nowhere near a counted marker at phase start
    s.phase = 'shooting'
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'shooting.start', 'start')
    for (const id of s.units[BOYZ2].models) setModelPos(s.models[id], { x: 0, y: 0, z: 0 }) // wanders onto the treasure marker, too late
    kill(ctx, BOYZ2, byWarriors)
    expect(s.players.A.vp).toBe(0)
    kill(ctx, BOYZ, byWarriors)
    expect(s.players.A.vp).toBe(3)
  })

  it('NEC-023 NEC-4: a kill with no attributed model (Deadly Demise, other mortal wounds) scores nothing', () => {
    const s = treasureState()
    s.players.A.secondaryState.treasureObjectiveId = 'west'
    deploy(s, WAR)
    placeUnit(s, BOYZ, { x: -11, z: 1, gap: 0.3 })
    s.phase = 'shooting'
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'shooting.start', 'start')
    kill(ctx, BOYZ, { player: null, unitId: null, modelId: null, kind: 'mortal' })
    expect(s.players.A.vp).toBe(0)
  })

  it('NEC-038 NEC-4: a unit finished off by Devastating Wounds from a NECRONS attack near the treasure marker still scores +3 VP', () => {
    const s = treasureState()
    s.players.A.secondaryState.treasureObjectiveId = 'west'
    deploy(s, OVR)
    placeUnit(s, BOYZ, { x: -11, z: 1, gap: 0.3 })
    for (const id of s.units[BOYZ].models.slice(1)) removeModel(s, id) // one Boy left, so the first critical wound destroys the unit
    s.phase = 'fight'
    const snap = ctxOf(s)
    missionService.onWindow(snap.ctx, 'fight.start', 'start')
    expect(s.players.A.vp).toBe(0)
    const run = ctxOf(s, SIX)
    attackService.begin(run.ctx, { kind: 'melee', attackerUnitId: OVR, overwatch: false, targets: [target(`${OVR}#0`, 'nec.w.overlords-blade', BOYZ, 4)] })
    drive(run.ctx)
    expect(s.units[BOYZ].location).toBe('destroyed')
    expect(s.units[BOYZ].destroyedBy?.modelId).toBe(`${OVR}#0`)
    expect(s.players.A.vp).toBe(3)
  })
})

// =====================================================================================================================
describe('Patrol stratagems (NEC-5)', () => {
  const placed = () => { const s = makeState(); deploy(s, WAR, OVR, SKO, SCA, DOOM, BOYZ, BOYZ2, BOSS, KOPTAS, DREAD); return s }
  const saveHook = (s: GameState, ctx: EngineContext, model: string, weapon: string, targetUnit: string, targetModel: string) => {
    const attack = { ...attackCtx(s, model, weapon, targetUnit), targetModelId: targetModel }
    return hookService.collect(ctx, 'onSaveRoll', { attack, roll: rollOf(3, 'save') }).map((r) => r.result)
  }

  it('NEC-024 NEC-5: Mercurial Resilience — offered after enemy targets are declared in the opponent\'s Shooting; 5+ invuln for the Warriors, the Overlord keeps its 4+', () => {
    const s = placed()
    phase(s, 'shooting', 'B', { A: 1 })
    const trig = { unitId: BOYZ, targetUnitId: WAR }
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', MR, trig)).toEqual([[WAR]])
    phase(s, 'shooting', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', MR, trig)).toEqual([]) // never in own Shooting phase
    phase(s, 'shooting', 'B', { A: 1 })
    const h = stratHarness(s)
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
    h.useOption(MR)
    expect(saveHook(s, h.ctx, 'B:boyz-a#1', 'ork.w.rokkit-launcha', WAR, `${WAR}#0`)).toEqual([{ kind: 'roll', invuln: 5 }])
    expect(saveHook(s, h.ctx, 'B:boyz-a#1', 'ork.w.rokkit-launcha', WAR, `${OVR}#0`)).toEqual([{ kind: 'roll', invuln: 5 }])
    // the engine takes the better of the datasheet invuln and the granted one (attack.ts preResults merge)
    expect(s.datasheets['nec.overlord-amonhotekh'].invuln).toBe(4)
    // end to end: an AP-3 shot (any shooter) leaves the Warriors a 6+ armour save even in cover, so the granted 5+ invulnerable save is the one rolled
    const run = ctxOf(s, [6, 6, 6, ...SIX])
    run.ctx.state.phase = 'shooting'
    attackService.begin(run.ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [target('B:boyz-a#1', 'nec.w.doomsday-blaster', WAR, 1)] })
    drive(run.ctx)
    const saves = of(run.events, 'SaveRolled')
    expect(saves.length).toBeGreaterThan(0)
    expect(saves[0].kind).toBe('invuln')
    expect(saves[0].needed).toBe(5)
  })

  it('NEC-025 NEC-5: Mercurial Resilience in either Fight phase after an enemy unit selects targets', () => {
    const s = placed()
    const trig = { unitId: BOYZ, targetUnitId: SKO }
    phase(s, 'fight', 'B', { A: 1 })
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', MR, trig)).toEqual([[SKO]])
    phase(s, 'fight', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', MR, { unitId: BOYZ, targetUnitId: SCA })).toEqual([[SCA]])
    expect(offeredIds(s, 'A', 'fight.unitSelected', MR, trig)).toEqual([])
  })

  it('NEC-026 NEC-5: Disruption Fields — +1 Strength to melee weapons only (S7 → S8 turns a 5+ into a 4+ against T8); not offered once the unit has fought', () => {
    const s = placed()
    phase(s, 'fight', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'fight.start', DF).map((x) => x[0]).sort()).toEqual([DOOM, SCA, SKO, WAR].sort())
    s.phaseState.fight!.fought.push(SKO)
    expect(offeredIds(s, 'A', 'fight.attacksResolved', DF, { unitId: BOYZ }).map((x) => x[0])).not.toContain(SKO)
    s.phaseState.fight!.fought = []
    const hyper = 'nec.w.skorpekh-hyperphase-weapons'
    const m = `${SKO}#0`
    expect(woundRollNeeded(weaponService.effectiveWeapon(s, m, hyper).S, 8)).toBe(5)
    const h = stratHarness(s)
    h.ctx.window('fight.start', 'start', h.ctx.order.active())
    h.useOption(DF, SKO)
    expect(weaponService.effectiveWeapon(s, m, hyper).S).toBe(8)
    expect(woundRollNeeded(weaponService.effectiveWeapon(s, m, hyper).S, 8)).toBe(4)
    expect(weaponService.effectiveWeapon(s, `${DOOM}#0`, 'nec.w.doomstalker-limbs').S).toBe(6) // other units untouched
  })

  it('NEC-027 NEC-5: Will of the Overlord — +1 OC per model until the start of the owner\'s next Command phase', () => {
    const s = placed()
    phase(s, 'command', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'command.start', WILL).map((x) => x[0]).sort()).toEqual([DOOM, SCA, SKO, WAR].sort())
    const h = stratHarness(s)
    h.ctx.window('command.start', 'start', h.ctx.order.active())
    h.useOption(WILL, SKO)
    const oc = (model: string, base: number) => hookService.statFor(s, { unitId: s.models[model].unitId, modelId: model, weapon: null, stat: 'OC' }, base)
    expect(oc(`${SKO}#0`, 2)).toBe(3)
    expect(oc(`${SKO}#2`, 2)).toBe(3)
    expect(oc(`${SCA}#0`, 0)).toBe(0)
    s.phase = 'command'
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(oc(`${SKO}#0`, 2)).toBe(3) // survives the phase end
    s.activePlayer = 'B'
    effectService.expire(h.ctx, 'nextOwnTurn', 'B')
    expect(oc(`${SKO}#0`, 2)).toBe(3) // not the opponent's turn start
    effectService.expire(h.ctx, 'nextOwnTurn', 'A')
    expect(oc(`${SKO}#0`, 2)).toBe(2)
  })

  it('NEC-028 NEC-5: Will of the Overlord is not offered when no OVERLORD model is on the battlefield', () => {
    const s = placed()
    phase(s, 'command', 'A', { A: 1 })
    expect(offeredIds(s, 'A', 'command.start', WILL)).not.toEqual([])
    removeModel(s, `${OVR}#0`)
    expect(offeredIds(s, 'A', 'command.start', WILL)).toEqual([])
  })
})

// =====================================================================================================================
describe('Datasheet rules (NEC-6)', () => {
  it('NEC-029 NEC-6: Implacable Resilience — Damage −1 (min 1) on attacks allocated to the Overlord; Deadly Demise mortal wounds are not reduced', () => {
    const s = makeState({ a: { attachments: [] } })
    deploy(s, OVR, DOOM, BOSS)
    s.phase = 'fight'
    const { ctx } = ctxOf(s)
    const dmg = (damage: number) => hookService.collect(ctx, 'onDamage', { attack: attackCtx(s, `${BOSS}#0`, 'ork.w.big-choppa', OVR), targetUnitId: OVR, targetModelId: `${OVR}#0`, damage, mortal: false }).map((r) => r.result)
    expect(dmg(2)).toEqual([{ kind: 'damage', reduction: 1 }])
    const other = hookService.collect(ctx, 'onDamage', { attack: attackCtx(s, `${BOSS}#0`, 'ork.w.big-choppa', DOOM), targetUnitId: DOOM, targetModelId: `${DOOM}#0`, damage: 2, mortal: false })
    expect(other).toEqual([])
    // end to end: a Damage 2 melee attack that wounds and is not saved costs the Overlord 1 wound, not 2
    s.models[`${BOSS}#0`].pos = { x: -13.9, y: 0, z: -1 }
    const run = ctxOf(s, [6, 6, 1, ...SIX])
    run.ctx.state.phase = 'fight'
    attackService.begin(run.ctx, { kind: 'melee', attackerUnitId: BOSS, overwatch: false, targets: [target(`${BOSS}#0`, 'ork.w.big-choppa', OVR, 1)] })
    drive(run.ctx)
    expect(s.models[`${OVR}#0`].woundsRemaining).toBe(5)
    // Deadly Demise D3 on a destroyed Doomstalker next to the Overlord: 3 mortal wounds, each 1 damage, unreduced
    s.models[`${OVR}#0`].woundsRemaining = 6
    setModelPos(s.models[`${DOOM}#0`], { x: -10, y: 0, z: -3 })
    const demise = ctxOf(s, [6, 6, ...SIX])
    demise.ctx.state.phase = 'shooting'
    attackService.destroyModel(demise.ctx, `${DOOM}#0`, { player: 'B', unitId: BOSS, modelId: `${BOSS}#0`, kind: 'ranged' })
    drive(demise.ctx)
    expect(s.models[`${OVR}#0`].woundsRemaining).toBe(3)
  })

  it('NEC-030 NEC-6: Plasmacyte — offered when the Skorpekhs are selected to fight; spent → hyperphase weapons gain Devastating Wounds this phase; never offered again', () => {
    const s = makeState()
    deploy(s, SKO)
    s.phase = 'fight'
    s.phaseState = emptyPhaseState()
    const hyper = 'nec.w.skorpekh-hyperphase-weapons'
    const { ctx } = ctxOf(s)
    const dw = () => weaponService.effectiveWeapon(s, `${SKO}#0`, hyper).abilities.some((a) => a.ability === 'DEVASTATING_WOUNDS')
    expect(dw()).toBe(false)
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', SKO)).toBe(true)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual(['use', 'decline'])
    answerOption(ctx, 'use')
    expect(dw()).toBe(true)
    expect(s.players.A.oncePerBattleUsed).toHaveLength(1)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(dw()).toBe(false)
    s.phaseState = emptyPhaseState() // a later fight phase
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', SKO)).toBe(false)
    expect(s.pending).toBeNull()
    // declining spends nothing
    const d = makeState()
    deploy(d, SKO)
    d.phase = 'fight'
    const dctx = ctxOf(d).ctx
    hookService.offerPicks(dctx, 'fight.unitSelected', SKO)
    answerOption(dctx, 'decline')
    expect(d.players.A.oncePerBattleUsed).toHaveLength(0)
    d.phaseState = emptyPhaseState()
    expect(hookService.offerPicks(dctx, 'fight.unitSelected', SKO)).toBe(true)
  })

  it('NEC-031 NEC-6: the tachyon arrow is One Shot — once fired it is no longer a legal weapon', () => {
    const s = makeState({ a: { attachments: [] } })
    deploy(s, OVR, BOYZ)
    s.phase = 'shooting'
    const { ctx } = ctxOf(s)
    const arrow = () => buildShootingWeaponEntries(ctx, OVR).filter((e) => e.weaponId === 'nec.w.tachyon-arrow')
    expect(s.weapons['nec.w.tachyon-arrow'].abilities.some((a) => a.ability === 'ONE_SHOT')).toBe(true)
    expect(arrow()).toHaveLength(1)
    const run = ctxOf(s, SIX)
    attackService.begin(run.ctx, { kind: 'ranged', attackerUnitId: OVR, overwatch: false, targets: [target(`${OVR}#0`, 'nec.w.tachyon-arrow', BOYZ, 1)] })
    drive(run.ctx)
    expect(s.models[`${OVR}#0`].oneShotUsed).toContain('nec.w.tachyon-arrow')
    expect(arrow()).toHaveLength(0)
  })

  it('NEC-037 NEC-6: One Shot — a fired tachyon arrow is not a legal Fire Overwatch weapon in either the Movement or the Charge phase', () => {
    const s = makeState({ a: { attachments: [] } })
    deploy(s, OVR, BOYZ)
    const arrowIn = (list: DeclaredTarget[]) => list.filter((e) => e.weaponId === 'nec.w.tachyon-arrow')
    expect(arrowIn(overwatchTargets(s, OVR, BOYZ))).toHaveLength(1)
    expect(arrowIn(overwatchTargetsFor(s, OVR, BOYZ))).toHaveLength(1)
    s.phase = 'shooting'
    const run = ctxOf(s, SIX)
    attackService.begin(run.ctx, { kind: 'ranged', attackerUnitId: OVR, overwatch: false, targets: [target(`${OVR}#0`, 'nec.w.tachyon-arrow', BOYZ, 1)] })
    drive(run.ctx)
    expect(s.models[`${OVR}#0`].oneShotUsed).toContain('nec.w.tachyon-arrow')
    expect(arrowIn(overwatchTargets(s, OVR, BOYZ))).toHaveLength(0)
    expect(arrowIn(overwatchTargetsFor(s, OVR, BOYZ))).toHaveLength(0)
    // and attackService.begin refuses it centrally, whoever built the declaration
    const again = ctxOf(s, SIX)
    attackService.begin(again.ctx, { kind: 'ranged', attackerUnitId: OVR, overwatch: true, targets: [target(`${OVR}#0`, 'nec.w.tachyon-arrow', BOYZ, 1)] })
    expect(s.phaseState.attack!.groups).toHaveLength(0)
  })

  it('NEC-032 NEC-6: Damaged — Doomstalker with 4 wounds left is −1 to hit, with 5 no modifier', () => {
    const s = makeState()
    deploy(s, DOOM)
    const { ctx } = ctxOf(s)
    const mods = () => hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, `${DOOM}#0`, 'nec.w.doomsday-blaster', BOYZ), roll: rollOf(4, 'hit') }).map((r) => r.result)
    s.models[`${DOOM}#0`].woundsRemaining = 5
    expect(mods()).toEqual([])
    s.models[`${DOOM}#0`].woundsRemaining = 4
    expect(mods()).toEqual([{ kind: 'roll', modifier: -1 }])
    s.models[`${DOOM}#0`].woundsRemaining = 1
    expect(mods()).toEqual([{ kind: 'roll', modifier: -1 }])
  })

  it('NEC-033 NEC-6: Deadly Demise — a destroyed Scarab model rolls a D6 (6: 1 mortal wound to units within 6"), a Doomstalker D3 mortal wounds', () => {
    const s = makeState()
    deploy(s, SCA, DOOM, SKO)
    const nearSca = ctxOf(s, [6])
    const scarab = s.units[SCA].models[0]
    setModelPos(s.models[s.units[SKO].models[0]], { x: s.models[scarab].pos.x - 3, y: 0, z: s.models[scarab].pos.z })
    attackService.destroyModel(nearSca.ctx, scarab, { player: 'B', unitId: BOSS, modelId: `${BOSS}#0`, kind: 'ranged' })
    const d1 = of(nearSca.events, 'DeadlyDemiseRolled')[0]
    expect(d1.exploded).toBe(true)
    expect(d1.affected).toContain(SCA)
    expect(s.phaseState.attack?.mortalQueue.every((q) => q.count === 1)).toBe(true)
    const miss = ctxOf(s, [5])
    attackService.destroyModel(miss.ctx, s.units[SCA].models[0], { player: 'B', unitId: BOSS, modelId: `${BOSS}#0`, kind: 'ranged' })
    expect(of(miss.events, 'DeadlyDemiseRolled')[0].exploded).toBe(false)
    // Doomstalker: D3 (face 6 → 3) mortal wounds on each unit within 6"
    const s2 = makeState()
    deploy(s2, DOOM, SKO)
    setModelPos(s2.models[s2.units[SKO].models[0]], { x: 7, y: 0, z: -3 })
    const doom = ctxOf(s2, [6, 6, 6])
    attackService.destroyModel(doom.ctx, `${DOOM}#0`, { player: 'B', unitId: BOSS, modelId: `${BOSS}#0`, kind: 'ranged' })
    expect(of(doom.events, 'DeadlyDemiseRolled')[0].exploded).toBe(true)
    expect(s2.phaseState.attack?.mortalQueue.map((q) => q.count)).toContain(3)
  })

  it('NEC-034 NEC-6: gauss weapons — Lethal Hits auto-wound on a critical hit, Rapid Fire 1 at half range, Twin-linked re-rolls the wound', () => {
    const s = makeState()
    deploy(s, WAR, DOOM, BOYZ)
    const flayer = s.weapons['nec.w.gauss-flayer']
    expect(flayer.abilities).toEqual(expect.arrayContaining([{ ability: 'LETHAL_HITS' }, { ability: 'RAPID_FIRE', value: 1 }]))
    expect(s.weapons['nec.w.twin-gauss-flayer'].abilities.map((a) => a.ability)).toContain('TWIN_LINKED')
    const shooter = s.units[WAR].models.find((id) => s.models[id].weapons.includes('nec.w.gauss-flayer')) as string
    // critical hit (6) wounds automatically
    setModelPos(s.models[shooter], { x: -6, y: 0, z: 6 }) // in the flayer's 24" range, well beyond half range of the Boyz
    placeUnit(s, BOYZ, { x: -6, z: 12, gap: 0.3 })
    const lethal = ctxOf(s, SIX)
    attackService.begin(lethal.ctx, { kind: 'ranged', attackerUnitId: WAR, overwatch: false, targets: [target(shooter, 'nec.w.gauss-flayer', BOYZ, 1)] })
    drive(lethal.ctx)
    expect(of(lethal.events, 'HitRolled').length).toBe(1)
    expect(of(lethal.events, 'WoundRolled')[0].auto).toBe(true)
    // Rapid Fire 1 at half range: two attacks (hit dice) instead of one
    setModelPos(s.models[shooter], { x: -6, y: 0, z: 10.5 }) // 1.5" from the Boyz
    const rapid = ctxOf(s, [1, 1, 1, 1, 1, 1])
    attackService.begin(rapid.ctx, { kind: 'ranged', attackerUnitId: WAR, overwatch: false, targets: [target(shooter, 'nec.w.gauss-flayer', BOYZ)] })
    drive(rapid.ctx)
    expect(of(rapid.events, 'HitRolled')).toHaveLength(2)
    // Twin-linked: a failed wound roll (die 2 vs 5+) is re-rolled
    const twin = ctxOf(s, [4, 2, 6, ...SIX])
    attackService.begin(twin.ctx, { kind: 'ranged', attackerUnitId: DOOM, overwatch: false, targets: [target(`${DOOM}#0`, 'nec.w.twin-gauss-flayer', BOYZ, 1)] })
    drive(twin.ctx)
    expect(of(twin.events, 'DiceRerolled').some((e) => e.before[0] === 2)).toBe(true)
  })
})

describe('Patrol (NEC-1)', () => {
  it('NEC-035 NEC-1: the patrol loads — 5 units, 18 models, the Overlord is the Warlord with Overriding Control attached to the Warriors, default secondary Reclaim and Dominate', () => {
    const s = makeState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(18)
    expect(s.units[OVR].isWarlord).toBe(true)
    expect(s.units[OVR].enhancementId).toBe('nec.e.overriding-control')
    expect(s.units[WAR].attachedLeaderId).toBe(OVR)
    expect(s.units[OVR].bodyguardUnitId).toBe(WAR)
    expect(s.players.A.secondaryId).toBe('nec.sec.reclaim-and-dominate')
    const patrol = bundle.patrols['nec.cp.amonhotekhs-guard']
    expect(patrol.secondaries.find((x) => x.default)?.id).toBe('nec.sec.reclaim-and-dominate')
    expect(patrol.enhancements.find((e) => e.default)?.id).toBe('nec.e.overriding-control')
  })
})
