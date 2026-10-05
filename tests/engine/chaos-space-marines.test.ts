// Chaos Space Marines: Zarkan's Daemonkin (docs/spec/factions/chaos-space-marines.md, 12-checklist CHA-001..CHA-032), real Combat Patrol data.
// The code hooks (Dark Pacts, Foul Zealotry, Prey on the Weak, Sacrificial Dagger, Marked for Execution, Vindictive Strategy, Violent
// Unbinding, Daemonic Fervour). The engine seams they use (C1-C6) are covered in chaos-space-marines-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { fightOnDeathThreshold } from '../../src/engine/fight-on-death'
import { movementModule } from '../../src/engine/phases/movement'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CSM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Chaos', faction: 'chaos-space-marines', patrolId: 'csm.cp.zarkans-daemonkin', enhancementId: 'csm.e.foul-zealotry', secondaryId: 'csm.sec.marked-for-execution',
  attachments: [{ leaderRef: 'zarkan', bodyguardRef: 'possessed' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const ZAR = 'A:zarkan', POS = 'A:possessed', LEG = 'A:legionaries', CUL = 'A:cultists'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss'
const VS = 'csm.s.vindictive-strategy', VU = 'csm.s.violent-unbinding', DF = 'csm.s.daemonic-fervour'
const DAG = 'csm.a.sacrificial-dagger'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: CSM(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'csm', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  if (s.phase === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: s.activePlayer === 'A' ? 'B' : 'A', counterOffensive: false }
  return s
}

type Spot = { x: number; z: number; gap?: number } | [number, number][]
const SPOTS: Record<string, Spot> = {
  [LEG]: { x: -12, z: -3, gap: 0.3 }, [POS]: { x: -12, z: -9, gap: 0.3 }, [ZAR]: [[-10.4, -10.3]], [CUL]: { x: 8, z: -9, gap: 0.3 },
  [BOYZ]: { x: -6, z: 8, gap: 0.3 }, [BOYZ2]: { x: -6, z: 13, gap: 0.3 }, [BOSS]: [[20, 13]],
}
function deploy(s: GameState, ...ids: string[]): void { for (const id of ids) placeUnit(s, id, SPOTS[id]) }

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

// ---------- decisions ----------
function pendingOption(s: GameState): ChooseOptionDecision {
  if (s.pending?.kind !== 'chooseOption') throw new Error(`expected a chooseOption, got ${s.pending?.kind}`)
  return s.pending
}
const optionIds = (s: GameState): string[] => pendingOption(s).options.map((o) => o.id)
function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = pendingOption(ctx.state)
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
// the pick for a unit-selected window; returns whether a decision is now pending
function select(ctx: EngineContext, window: 'shooting.unitSelected' | 'fight.unitSelected', unitId: string): boolean {
  return hookService.offerPicks(ctx, window, unitId)
}

// attack plumbing (as necrons.test.ts): answer every attack decision with its first option until the sequence ends
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

const abilitiesOf = (s: GameState, modelId: string, weaponId: string) => hookService.weaponAbilitiesFor!(s, modelId, s.weapons[weaponId]).map((a) => a.ability)
const queued = (s: GameState) => s.phaseState.attack?.mortalQueue.map((q) => q.count) ?? []

// ---------- stratagem harness (mortal wounds recorded instead of resolved) ----------
function stratHarness(s: GameState) {
  const mortals: { targetUnitId: string; count: number; source: string }[] = []
  const services: Services = {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: (_ctx, targetUnitId, count, source) => { mortals.push({ targetUnitId, count, source }) }, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics }
  const made = (dice: number[]) => createContext(s, new ScriptedRng(dice), modules).ctx
  const useOption = (ctx: EngineContext, stratagemId: string, firstId?: string) => {
    const opts = ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((x) => x.action as UseStratagemAction)
    const opt = opts.find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    const pending = s.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    s.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { made, mortals, useOption }
}
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])

// =====================================================================================================================
describe('Dark Pacts (CHA-2.x)', () => {
  it('CHA-001 CHA-2.1: Legionaries selected to shoot -> lethal / sustained / decline; decline rolls nothing and grants nothing', () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    const { ctx } = ctxOf(s, []) // an empty script throws on any die
    expect(select(ctx, 'shooting.unitSelected', LEG)).toBe(true)
    expect(optionIds(s).sort()).toEqual(['decline', 'lethal', 'sustained'])
    answerOption(ctx, 'decline')
    expect(s.pending).toBeNull()
    expect(s.units[LEG].effects).toHaveLength(0)
    expect(select(ctx, 'shooting.unitSelected', LEG)).toBe(false) // once per selection
  })

  it('CHA-002 CHA-2.1: Possessed selected to fight -> the Pact is offered at fight.unitSelected', () => {
    const s = makeState({ a: { attachments: [] }, phase: 'fight' })
    deploy(s, POS, BOYZ)
    const { ctx } = ctxOf(s, [])
    expect(select(ctx, 'shooting.unitSelected', POS)).toBe(false) // wrong phase for that window
    expect(select(ctx, 'fight.unitSelected', POS)).toBe(true)
    expect(optionIds(s).sort()).toEqual(['decline', 'lethal', 'sustained'])
  })

  it('CHA-003 CHA-2.2: Leadership test 7 vs Ld 6 passes; no mortal wounds; the weapons gain the picked ability', () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    const { ctx, events } = ctxOf(s, [3, 4])
    select(ctx, 'shooting.unitSelected', LEG)
    answerOption(ctx, 'sustained')
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership test: 7 vs Ld 6 - passed'))).toBe(true)
    expect(s.phaseState.attack).toBeNull()
    const boltgun = s.units[LEG].models[3]
    expect(abilitiesOf(s, boltgun, s.models[boltgun].weapons.find((w) => w.includes('boltgun')) as string)).toContain('SUSTAINED_HITS')
    expect(abilitiesOf(s, boltgun, s.models[boltgun].weapons.find((w) => w.includes('boltgun')) as string)).not.toContain('LETHAL_HITS')
  })

  it('CHA-004 CHA-2.2: a failed Leadership test costs D3 mortal wounds (owner allocates) and the ability is still gained', () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    const { ctx, events } = ctxOf(s, [1, 2, 4]) // 3 vs Ld 6 fails, D3 = 2
    select(ctx, 'shooting.unitSelected', LEG)
    answerOption(ctx, 'lethal')
    expect(queued(s)).toHaveLength(1)
    expect(queued(s)[0]).toBe(2)
    drive(ctx)
    expect(of(events, 'DamageApplied').reduce((n, e) => n + e.amount, 0)).toBe(2)
    expect(s.phaseState.attack).toBeNull()
    const boltgun = s.units[LEG].models.find((id) => s.models[id]?.weapons.some((w) => w.includes('boltgun'))) as string
    expect(abilitiesOf(s, boltgun, s.models[boltgun].weapons.find((w) => w.includes('boltgun')) as string)).toContain('LETHAL_HITS')
  })

  it('CHA-005 CHA-2.2: the Leadership test is not a Battle-shock test: no BattleShockTested, never battle-shocked on a fail', () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    const { ctx, events } = ctxOf(s, [1, 1, 1])
    select(ctx, 'shooting.unitSelected', LEG)
    answerOption(ctx, 'sustained')
    drive(ctx)
    expect(s.units[LEG].battleShocked).toBe(false)
    expect(of(events, 'BattleShockTested')).toHaveLength(0)
    expect(of(events, 'BattleShocked')).toHaveLength(0)
    expect(of(events, 'DiceRolled').every((e) => e.roll.purpose !== 'battleShock')).toBe(true)
  })

  it('CHA-006 CHA-2.3: Lethal Hits pact: a critical hit auto-wounds; Sustained Hits pact: it adds a hit; both expire at the end of the phase', () => {
    const run = (pick: 'lethal' | 'sustained' | null) => {
      const s = makeState()
      deploy(s, LEG, BOYZ)
      const { ctx, events } = ctxOf(s, [6, 6, ...Array<number>(40).fill(1)])
      if (pick) { s.units[LEG].effects = []; ctx.services.effects.grant(ctx, LEG, [{ grantWeaponAbility: pick === 'lethal' ? { ability: 'LETHAL_HITS' } : { ability: 'SUSTAINED_HITS', value: 1 } }], { sourceAbilityId: 'csm.a.dark-pacts', sourceUnitId: LEG, scope: { who: 'self' }, duration: 'untilEndOfPhase' }) }
      const bolter = s.units[LEG].models.find((id) => s.models[id].weapons.some((w) => w.includes('csm.w.boltgun'))) as string
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: LEG, overwatch: false, targets: [target(bolter, s.models[bolter].weapons.find((w) => w.includes('csm.w.boltgun')) as string, BOYZ, 1)] })
      drive(ctx)
      const rolls = of(events, 'DiceRolled').map((e) => e.roll)
      return { s, ctx, hits: rolls.filter((r) => r.purpose === 'hit').flatMap((r) => r.dice).length, wounds: rolls.filter((r) => r.purpose === 'wound').flatMap((r) => r.dice).length }
    }
    const plain = run(null)
    expect(plain.hits).toBe(1)
    expect(plain.wounds).toBe(1)
    const lethal = run('lethal')
    expect(lethal.wounds).toBe(0) // the critical hit wounds automatically
    const sust = run('sustained')
    expect(sust.wounds).toBe(2) // 1 hit + 1 extra hit
    effectService.expire(sust.ctx, 'phaseEnd', null)
    expect(sust.s.units[LEG].effects).toHaveLength(0)
  })

  it('CHA-007 CHA-2.3: attached Zarkan + Possessed make one Pact: one Leadership test, the ability on both halves\' weapons', () => {
    const s = makeState()
    deploy(s, POS, ZAR, BOYZ)
    expect(leaderService.isAttached(s, POS)).toBe(true)
    const { ctx, events } = ctxOf(s, [3, 4]) // exactly one 2D6 available
    select(ctx, 'shooting.unitSelected', ZAR) // either half's id resolves to the one unit
    answerOption(ctx, 'both')
    expect(of(events, 'DiceRolled').filter((e) => e.roll.purpose === 'ability')).toHaveLength(1)
    const zarkanModel = s.units[ZAR].models[0]
    const rite = s.models[zarkanModel].weapons.find((w) => w.includes('rite-of-possession')) as string
    expect(abilitiesOf(s, zarkanModel, rite)).toEqual(expect.arrayContaining(['LETHAL_HITS', 'SUSTAINED_HITS']))
    const possessed = s.units[POS].models[0]
    expect(abilitiesOf(s, possessed, s.models[possessed].weapons[0])).toEqual(expect.arrayContaining(['LETHAL_HITS', 'SUSTAINED_HITS']))
    answerOption(ctx, 'decline') // the Dagger follows the Pact
    expect(select(ctx, 'shooting.unitSelected', POS)).toBe(false) // the mark is per unit, not per half
  })

  it('CHA-008 CHA-2.3: Pact mortal wounds that destroy the whole unit leave nothing to declare targets with and grant nothing useful', () => {
    const s = makeState({ a: { attachments: [] } })
    deploy(s, LEG, BOYZ)
    for (const id of s.units[LEG].models.slice(1)) removeModel(s, id)
    s.models[s.units[LEG].models[0]].woundsRemaining = 1
    const { ctx } = ctxOf(s, [1, 1, 6]) // fail, D3 = 3
    select(ctx, 'shooting.unitSelected', LEG)
    answerOption(ctx, 'sustained')
    drive(ctx)
    expect(s.units[LEG].location).toBe('destroyed')
    expect(leaderService.halves(s, LEG).some((id) => s.units[id].location === 'board')).toBe(false)
  })

  it('CHA-009 CHA-2.4: the Pact belongs to the unit-selected windows only: nothing is offered through a Fire Overwatch sequence', () => {
    const s = makeState({ phase: 'charge', active: 'B' })
    deploy(s, LEG, BOYZ)
    const { ctx, events } = ctxOf(s, Array<number>(40).fill(1))
    const bolter = s.units[LEG].models.find((id) => s.models[id].weapons.some((w) => w.includes('csm.w.boltgun'))) as string
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: LEG, overwatch: true, targets: [target(bolter, s.models[bolter].weapons.find((w) => w.includes('csm.w.boltgun')) as string, BOYZ, 1)] })
    drive(ctx)
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership test'))).toBe(false)
    expect(s.pending).toBeNull()
  })
})

describe('Foul Zealotry and Prey on the Weak (CHA-3)', () => {
  it('CHA-010 CHA-3: the bearer\'s unit takes both abilities together: options both / decline, and both are granted', () => {
    const s = makeState()
    deploy(s, POS, ZAR, BOYZ)
    const { ctx } = ctxOf(s, [6, 6])
    select(ctx, 'shooting.unitSelected', POS)
    expect(optionIds(s).sort()).toEqual(['both', 'decline'])
    answerOption(ctx, 'both')
    const eff = s.units[POS].effects.flatMap((e) => (Array.isArray(e.effect) ? e.effect : [e.effect])).map((e) => e.grantWeaponAbility?.ability)
    expect(eff).toEqual(expect.arrayContaining(['LETHAL_HITS', 'SUSTAINED_HITS']))
  })

  it('CHA-011 CHA-3: Foul Zealotry does not touch Cultists or a unit without the bearer (pick-one options)', () => {
    const s = makeState()
    deploy(s, CUL, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    select(ctx, 'shooting.unitSelected', CUL)
    expect(optionIds(s).sort()).toEqual(['decline', 'lethal', 'sustained'])
    answerOption(ctx, 'decline')
    select(ctx, 'shooting.unitSelected', LEG)
    expect(optionIds(s).sort()).toEqual(['decline', 'lethal', 'sustained'])
  })

  const preyState = () => makeState({ a: { enhancementId: 'csm.e.prey-on-the-weak' } })

  it('CHA-012 CHA-3: Rite of Possession hit enemy unit X -> after the unit shoots, pick X, X tests Battle-shock at -1', () => {
    const s = preyState()
    deploy(s, POS, ZAR, BOYZ, BOYZ2)
    const { ctx, events } = ctxOf(s, [3, 3])
    const rite = s.models[s.units[ZAR].models[0]].weapons.find((w) => w.includes('rite-of-possession')) as string
    const shooter = s.units[ZAR].models[0]
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: POS, overwatch: false, targets: [target(shooter, rite, BOYZ, 1)] })
    // a successful hit by the Rite is on record
    s.phaseState.marks.push(`hitBy:${POS}:${rite}:${BOYZ}`)
    s.phaseState.attack = null
    expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', POS)).toBe(true)
    expect(optionIds(s)).toEqual([BOYZ])
    answerOption(ctx, BOYZ)
    const tests = of(events, 'BattleShockTested')
    expect(tests).toHaveLength(1)
    expect(tests[0].unitId).toBe(BOYZ)
    const roll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'battleShock')
    expect(roll?.roll.modifiers.some((m) => m.value === -1)).toBe(true)
  })

  it('CHA-013 CHA-3: nothing hit by the Rite of Possession (only bolt pistol / boltguns, or all missed) -> no prompt', () => {
    const s = preyState()
    deploy(s, POS, ZAR, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    s.phaseState.marks.push(`hitBy:${LEG}:csm.w.boltgun:${BOYZ}`)
    s.phaseState.marks.push(`hitBy:${POS}:csm.w.bolt-pistol:${BOYZ}`)
    expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', POS)).toBe(false)
    expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', LEG)).toBe(false)
    expect(s.pending).toBeNull()
  })
})

describe('Marked for Execution (CHA-4)', () => {
  const kill = (s: GameState, by: { player: 'A' | 'B' | null; unitId: string | null; modelId: string | null; kind: 'ranged' | 'melee' | 'mortal' | 'other' }) => {
    const { ctx } = ctxOf(s, Array<number>(10).fill(1))
    for (const id of [...s.units[BOSS].models]) attackService.finishDestroy(ctx, id, by)
    return s.players.A.vp
  }

  it('CHA-014 CHA-4: the opponent Warlord destroyed in round 2 scores 12 VP, in round 4 scores 6 VP, and never twice', () => {
    const s = makeState({ round: 2 })
    deploy(s, LEG, BOSS)
    expect(kill(s, { player: 'A', unitId: LEG, modelId: s.units[LEG].models[0], kind: 'ranged' })).toBe(12)
    const { ctx } = ctxOf(s, [])
    DEFAULT_MODULES.services.missions.unitDestroyed?.(ctx, { unitId: BOSS, byPlayer: 'A', byUnitId: LEG, byModelId: null })
    expect(s.players.A.vp).toBe(12)

    const late = makeState({ round: 4 })
    deploy(late, LEG, BOSS)
    expect(kill(late, { player: 'A', unitId: LEG, modelId: late.units[LEG].models[0], kind: 'melee' })).toBe(6)
  })

  it('CHA-015 CHA-4: a Warlord killed by its own Hazardous roll (no killer) still scores', () => {
    const s = makeState({ round: 3 })
    deploy(s, LEG, BOSS)
    expect(kill(s, { player: null, unitId: null, modelId: null, kind: 'other' })).toBe(12)
  })

  it('CHA-014 CHA-4: a non-Warlord unit dying scores nothing, and the opponent\'s own Warlord loss does not score for the orks', () => {
    const s = makeState({ round: 2 })
    deploy(s, LEG, BOYZ, BOSS)
    const { ctx } = ctxOf(s, Array<number>(10).fill(1))
    for (const id of [...s.units[BOYZ].models]) attackService.finishDestroy(ctx, id, { player: 'A', unitId: LEG, modelId: null, kind: 'ranged' })
    expect(s.units[BOYZ].location).toBe('destroyed')
    expect(s.players.A.vp).toBe(0)
    expect(s.players.B.vp).toBe(0)
  })
})

describe('Sacrificial Dagger (CHA-6)', () => {
  it('CHA-025 CHA-6: Zarkan selected to shoot, use -> his unit suffers 1 mortal wound; Psychic weapons get +1 to hit and +1 to wound, others do not', () => {
    const s = makeState()
    deploy(s, POS, ZAR, BOYZ)
    const { ctx } = ctxOf(s, [6, 6]) // the Pact: both, 12 passes
    select(ctx, 'shooting.unitSelected', POS)
    answerOption(ctx, 'both')
    expect(pendingOption(s).context.data.code).toBe('sacrificialDagger')
    expect(optionIds(s).sort()).toEqual(['decline', 'use'])
    answerOption(ctx, 'use')
    expect(queued(s)).toEqual([1])
    const zarkanModel = s.units[ZAR].models[0]
    const rite = s.models[zarkanModel].weapons.find((w) => w.includes('csm.w.rite-of-possession')) as string
    const pistol = s.models[zarkanModel].weapons.find((w) => w.includes('csm.w.bolt-pistol')) as string
    const mods = (weaponId: string, hook: 'onHitRoll' | 'onWoundRoll', purpose: 'hit' | 'wound') =>
      hookService.collect(ctx, hook, { attack: attackCtx(s, zarkanModel, weaponId, BOYZ), roll: rollOf(4, purpose) }).map((r) => (r.result as { modifier?: number }).modifier).filter((m) => m !== undefined)
    expect(mods(rite, 'onHitRoll', 'hit')).toContain(1)
    expect(mods(rite, 'onWoundRoll', 'wound')).toContain(1)
    expect(mods(pistol, 'onHitRoll', 'hit')).not.toContain(1)
    expect(mods(pistol, 'onWoundRoll', 'wound')).not.toContain(1)
    // a Possessed model is not the bearer
    const possessed = s.units[POS].models[0]
    expect(hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, possessed, s.models[possessed].weapons[0], BOYZ), roll: rollOf(4, 'hit') }).map((r) => (r.result as { modifier?: number }).modifier)).not.toContain(1)
  })

  it('CHA-026 CHA-6: offered once per phase and only after the Dark Pact prompt', () => {
    const s = makeState()
    deploy(s, POS, ZAR, BOYZ)
    const { ctx } = ctxOf(s, [])
    select(ctx, 'shooting.unitSelected', POS)
    expect(pendingOption(s).context.data.code).toBe('darkPact')
    answerOption(ctx, 'decline')
    expect(pendingOption(s).context.data.code).toBe('sacrificialDagger')
    answerOption(ctx, 'decline')
    expect(s.pending).toBeNull()
    expect(select(ctx, 'shooting.unitSelected', POS)).toBe(false)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', ZAR)).toBe(false)
  })

  it('CHA-025 CHA-6: a unit without the bearer (Legionaries) is never offered the Dagger', () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    select(ctx, 'shooting.unitSelected', LEG)
    answerOption(ctx, 'decline')
    expect(s.pending).toBeNull()
    expect(s.abilities[DAG]).toBeDefined()
  })
})

describe('Vindictive Strategy (CHA-5)', () => {
  const setup = () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    s.players.A.cp = 3
    return s
  }
  const rerolls = (s: GameState, ctx: EngineContext, hook: 'onHitRoll' | 'onWoundRoll', purpose: 'hit' | 'wound') => {
    const model = s.units[LEG].models[3]
    const boltgun = s.models[model].weapons.find((w) => w.includes('csm.w.boltgun')) as string
    return hookService.collect(ctx, hook, { attack: attackCtx(s, model, boltgun, BOYZ), roll: rollOf(1, purpose) }).map((r) => (r.result as { reroll?: string }).reroll).filter((r) => r !== undefined)
  }

  it('CHA-017 CHA-5: target at Starting Strength -> no re-roll; one model lost -> hit 1s re-rolled, wound 1s not', () => {
    const s = setup()
    const h = stratHarness(s)
    const ctx = h.made([])
    expect(offeredIds(s, 'A', 'shooting.start', VS).map((x) => x[0])).toContain(LEG)
    const c2 = ctx
    stratagemService.openWindow?.(ctx, 'shooting.start', 'A', 'start', {})
    h.useOption(ctx, VS, LEG)
    expect(rerolls(s, c2, 'onHitRoll', 'hit')).toEqual([])
    expect(rerolls(s, c2, 'onWoundRoll', 'wound')).toEqual([])
    removeModel(s, s.units[BOYZ].models[0])
    expect(rerolls(s, c2, 'onHitRoll', 'hit')).toEqual(['ones'])
    expect(rerolls(s, c2, 'onWoundRoll', 'wound')).toEqual([])
  })

  it('CHA-018 CHA-5: target below half-strength -> hit 1s and wound 1s both re-rolled', () => {
    const s = setup()
    const h = stratHarness(s)
    const ctx = h.made([])
    stratagemService.openWindow?.(ctx, 'shooting.start', 'A', 'start', {})
    h.useOption(ctx, VS, LEG)
    const boyz = s.units[BOYZ].models
    for (const id of boyz.slice(0, Math.floor(boyz.length / 2) + 1)) removeModel(s, id)
    expect(leaderService.isBelowHalfStrength(s, BOYZ)).toBe(true)
    expect(rerolls(s, ctx, 'onHitRoll', 'hit')).toEqual(['ones'])
    expect(rerolls(s, ctx, 'onWoundRoll', 'wound')).toEqual(['ones'])
  })

  it('CHA-017 CHA-018 CHA-5: a damaged single-model target (wounds left) gates hit and wound re-rolls consistently', () => {
    const s = setup()
    deploy(s, BOSS)
    const h = stratHarness(s)
    const ctx = h.made([])
    stratagemService.openWindow?.(ctx, 'shooting.start', 'A', 'start', {})
    h.useOption(ctx, VS, LEG)
    const model = s.units[LEG].models[3]
    const boltgun = s.models[model].weapons.find((w) => w.includes('csm.w.boltgun')) as string
    const against = (hook: 'onHitRoll' | 'onWoundRoll', purpose: 'hit' | 'wound') =>
      hookService.collect(ctx, hook, { attack: attackCtx(s, model, boltgun, BOSS), roll: rollOf(1, purpose) }).map((r) => (r.result as { reroll?: string }).reroll).filter((r) => r !== undefined)
    const bm = s.models[s.units[BOSS].models[0]]
    const W = bm.woundsRemaining
    // undamaged: neither
    expect(against('onHitRoll', 'hit')).toEqual([])
    expect(against('onWoundRoll', 'wound')).toEqual([])
    // at exactly half wounds: not below half-strength -> still neither
    bm.woundsRemaining = W / 2
    expect(against('onHitRoll', 'hit')).toEqual([])
    expect(against('onWoundRoll', 'wound')).toEqual([])
    // below half wounds: below half-strength implies below Starting Strength, so both re-roll
    bm.woundsRemaining = Math.max(1, Math.ceil(W / 2) - 1)
    expect(leaderService.isBelowHalfStrength(s, BOSS)).toBe(true)
    expect(against('onHitRoll', 'hit')).toEqual(['ones'])
    expect(against('onWoundRoll', 'wound')).toEqual(['ones'])
  })

  it('CHA-019 CHA-5: not offered for a unit already selected to shoot or that already fought this phase', () => {
    const s = setup()
    expect(offeredIds(s, 'A', 'shooting.start', VS).map((x) => x[0])).toContain(LEG)
    s.phaseState.activated.push(LEG)
    expect(offeredIds(s, 'A', 'shooting.start', VS).map((x) => x[0])).not.toContain(LEG)
    s.phaseState.activated = []
    s.units[LEG].turn.shotThisPhase = true
    expect(offeredIds(s, 'A', 'shooting.start', VS).map((x) => x[0])).not.toContain(LEG)
    // the opponent's Shooting phase: not offered to the inactive player
    const t = setup()
    t.activePlayer = 'B'
    expect(offeredIds(t, 'A', 'shooting.start', VS)).toEqual([])
    // fight phase
    const f = makeState({ phase: 'fight' })
    deploy(f, LEG, BOYZ)
    f.players.A.cp = 3
    expect(offeredIds(f, 'A', 'fight.start', VS).map((x) => x[0])).toContain(LEG)
    f.units[LEG].turn.foughtThisPhase = true
    expect(offeredIds(f, 'A', 'fight.start', VS).map((x) => x[0])).not.toContain(LEG)
  })
})

describe('Violent Unbinding (CHA-5)', () => {
  // Zarkan has just been destroyed by BOYZ' attack; the engine left a death-reaction request for the window
  function zarkanSlain(range = 3) {
    const s = makeState({ phase: 'fight', active: 'B' })
    deploy(s, POS, ZAR, BOYZ)
    s.players.A.cp = 3
    const model = s.units[ZAR].models[0]
    const snapshot = { ...s.models[model] }
    // BOYZ sits `range` inches from the spot where Zarkan died
    const boyz = s.models[s.units[BOYZ].models[0]]
    const req = { modelId: model, unitId: ZAR, player: 'A', attackerUnitId: BOYZ, pos: { x: boyz.pos.x - boyz.base.radius - snapshot.base.radius - range, y: 0, z: boyz.pos.z }, phase: 'fight' }
    s.phaseState.marks.push(`deathReaction:${JSON.stringify(req)}`)
    removeModel(s, model)
    return s
  }

  it('CHA-020 CHA-5: enemy melee attack destroys Zarkan with the attacker within 6" -> offered; D6 = 6 -> 3 mortal wounds to the attacker, request spent', () => {
    const s = zarkanSlain(3)
    const h = stratHarness(s)
    const ctx = h.made([6])
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', VU, { unitId: ZAR })).toEqual([[ZAR]])
    stratagemService.openWindow?.(ctx, 'attack.modelDestroyed', 'A', 'm', { unitId: ZAR })
    h.useOption(ctx, VU, ZAR)
    expect(h.mortals).toEqual([{ targetUnitId: BOYZ, count: 3, source: VU }])
    expect(s.phaseState.marks.some((m) => m.startsWith('deathReaction:'))).toBe(false)
  })

  it('CHA-020 CHA-5: D6 2-5 -> D3 mortal wounds', () => {
    const s = zarkanSlain(2)
    const h = stratHarness(s)
    const ctx = h.made([4, 4]) // D6 = 4, then D3 = 2
    stratagemService.openWindow?.(ctx, 'attack.modelDestroyed', 'A', 'm', { unitId: ZAR })
    h.useOption(ctx, VU, ZAR)
    expect(h.mortals).toEqual([{ targetUnitId: BOYZ, count: 2, source: VU }])
  })

  it('CHA-021 CHA-5: attacker more than 6" away -> not offered; D6 = 1 -> nothing happens', () => {
    const far = zarkanSlain(9)
    expect(offeredIds(far, 'A', 'attack.modelDestroyed', VU, { unitId: ZAR })).toEqual([])
    const s = zarkanSlain(4)
    const h = stratHarness(s)
    const ctx = h.made([1])
    stratagemService.openWindow?.(ctx, 'attack.modelDestroyed', 'A', 'm', { unitId: ZAR })
    h.useOption(ctx, VU, ZAR)
    expect(h.mortals).toEqual([])
  })

  it('CHA-021 CHA-5: nothing is offered without a death-reaction request, or for a unit other than the destroyed one', () => {
    const s = makeState({ phase: 'fight', active: 'B' })
    deploy(s, POS, ZAR, BOYZ)
    s.players.A.cp = 3
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', VU, { unitId: ZAR })).toEqual([])
  })
})

describe('Daemonic Fervour (CHA-5)', () => {
  const fightState = (attach: boolean) => {
    const s = makeState({ a: attach ? {} : { attachments: [] }, phase: 'fight', active: 'B' })
    deploy(s, POS, ZAR, BOYZ)
    s.players.A.cp = 3
    return s
  }

  it('CHA-022 CHA-5: Possessed targeted in the Fight phase -> offered; using it grants fight-on-death 4+ for the phase', () => {
    const s = fightState(false)
    const h = stratHarness(s)
    const ctx = h.made([])
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', DF, { unitId: BOYZ, targetUnitId: POS })).toEqual([[POS]])
    stratagemService.openWindow?.(ctx, 'fight.targetsDeclared', 'A', 'k', { unitId: BOYZ, targetUnitId: POS })
    h.useOption(ctx, DF, POS)
    expect(fightOnDeathThreshold(s, POS)).toBe(4)
  })

  it('CHA-023 CHA-5: not offered once the unit has fought, nor for a unit that is not POSSESSED', () => {
    const s = fightState(false)
    s.units[POS].turn.foughtThisPhase = true
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', DF, { unitId: BOYZ, targetUnitId: POS })).toEqual([])
    const t = fightState(false)
    deploy(t, LEG)
    expect(offeredIds(t, 'A', 'fight.targetsDeclared', DF, { unitId: BOYZ, targetUnitId: LEG })).toEqual([])
  })

  it('CHA-022 CHA-5: Zarkan leading the Possessed does not stop the unit being targeted for Daemonic Fervour', () => {
    const s = fightState(true)
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', DF, { unitId: BOYZ, targetUnitId: POS }).map((x) => x[0])).toEqual([POS])
  })
})

describe('Veterans of the Long War and datasheet rules (CHA-6)', () => {
  const woundRerolls = (s: GameState, ctx: EngineContext, modelId: string, weaponId: string) =>
    hookService.collect(ctx, 'onWoundRoll', { attack: { ...attackCtx(s, modelId, weaponId, BOYZ) }, roll: rollOf(1, 'wound') }).map((r) => (r.result as { reroll?: string }).reroll).filter((r) => r !== undefined)

  it('CHA-027 CHA-6: Legionaries re-roll a melee wound roll of 1; ranged attacks are unaffected', () => {
    const s = makeState()
    deploy(s, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    const model = s.units[LEG].models[3]
    const melee = s.models[model].weapons.find((w) => w.includes('close-combat')) as string
    const gun = s.models[model].weapons.find((w) => w.includes('csm.w.boltgun')) as string
    expect(woundRerolls(s, ctx, model, melee)).toEqual(['ones'])
    expect(woundRerolls(s, ctx, model, gun)).toEqual([])
  })

  it('CHA-028 CHA-6: Rite of Possession carries Anti-PSYKER 2+, Precision and Psychic', () => {
    const s = makeState()
    const rite = Object.values(s.weapons).find((w) => w.id.includes('rite-of-possession') && !w.id.includes('focused'))
    expect(rite?.abilities.map((a) => a.ability)).toEqual(expect.arrayContaining(['ANTI', 'PRECISION', 'PSYCHIC']))
    expect(rite?.abilities.find((a) => a.ability === 'ANTI')).toMatchObject({ keyword: 'PSYKER', value: 2 })
  })

  it('CHA-029 CHA-6: Zarkan and the Possessed have a 5+ invulnerable save', () => {
    const s = makeState()
    expect(s.datasheets['csm.aranis-zarkan'].invuln).toBe(5)
    expect(s.datasheets['csm.possessed'].invuln).toBe(5)
  })

  it('CHA-030 CHA-6: heavy bolter has Heavy, the meltagun has Melta 2', () => {
    const s = makeState()
    expect(s.weapons['csm.w.heavy-bolter'].abilities.map((a) => a.ability)).toContain('HEAVY')
    expect(s.weapons['csm.w.meltagun'].abilities.find((a) => a.ability === 'MELTA')?.value).toBe(2)
  })
})

describe('Patrol and attachments (CHA-1)', () => {
  it('CHA-031 CHA-1: 4 units, 26 models, Zarkan is the Warlord with Foul Zealotry and attached to the Possessed; default secondary Marked for Execution', () => {
    const s = makeState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(26)
    expect(s.players.A.warlordUnitId).toBe(ZAR)
    expect(leaderService.isAttached(s, POS)).toBe(true)
    const zealotry = Object.values(s.abilities).find((a) => a.code === 'foulZealotry')
    expect(zealotry?.bearerModelId).toBe(s.units[ZAR].models[0])
    expect(Object.values(s.mission.secondaries.A).some((r) => r.code === 'markedForExecution')).toBe(true)
  })

  it('CHA-032 CHA-1: Zarkan may attach to the Legionaries instead, and never to the Cultists', () => {
    const s = makeState({ a: { attachments: [{ leaderRef: 'zarkan', bodyguardRef: 'legionaries' }] } })
    expect(leaderService.isAttached(s, LEG)).toBe(true)
    expect(() => makeState({ a: { attachments: [{ leaderRef: 'zarkan', bodyguardRef: 'cultists' }] } })).toThrow()
  })
})

describe('Marked for Execution on a stranded Warlord (CSM-06)', () => {
  it('CHA-014 CSM-06 CHA-4: a Warlord still in Reserves at the end of round 3 counts as destroyed and scores 12 VP, once', () => {
    const s = makeState({ round: 3, phase: 'movement', active: 'B' })
    s.firstPlayer = 'A'
    s.step = 'reinforcements'
    Object.values(s.units).filter((u) => u.location === 'reserves' && u.id !== BOSS).forEach((u, i) => placeUnit(s, u.id, [[-20 + i * 3, 12]]))
    expect(s.units[BOSS].location).toBe('reserves')
    const { ctx } = ctxOf(s, [])
    expect(movementModule.advance(ctx)).toBe('pending') // the Warlord is offered its arrival; the owner leaves it in Reserves
    const pending = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    s.pending = null
    expect(movementModule.handle(ctx, { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: BOSS, placements: [], toReserves: true }, pending)).toBeUndefined()
    expect(movementModule.advance(ctx)).toBe('done')
    expect(s.units[BOSS].location).toBe('destroyed')
    expect(s.players.A.vp).toBe(12)
    expect(s.players.A.secondaryState.markedScored).toBe(true)
  })
})
