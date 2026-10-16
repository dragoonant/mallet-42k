// Leagues of Votann code hooks (docs/spec/factions/leagues-of-votann.md section 7, checklist LEA-*): Eye of the Ancestors gate,
// Judgement tokens, Grim Efficiency, Waste Feeds the Void / Comms Uplink, Toil Earns, Holy Apparatus, Payment in Kind and the
// declarative stratagems, Medipack / Scanner, Outflanking Mag-Riders and Cyberstimms. Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DeployUnitDecision, type DiceRoll, type EngineContext, type GameEvent,
  type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { deferredDeaths, fightOnDeathThreshold } from '../../src/engine/fight-on-death'
import { playerBattlefieldEdge } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { addJudgement, judgementTokens } from '../../src/engine/judgement'
import { leaderService } from '../../src/engine/leaders'
import { holyCandidates, leaguesOfVotannHooks, magRidersCandidates, toilCandidates } from '../../src/engine/factions/leagues-of-votann'
import { movementModule } from '../../src/engine/phases/movement'
import { deploymentZone, modelStats } from '../../src/engine/state'
import { stratagemService } from '../../src/engine/stratagems'
import { destroyTeleportingUnit, isTeleporting, removeUnitToReserves, teleportArrivalOpts } from '../../src/engine/teleport'
import { placeUnit } from '../fixtures'
import { HOLD_CP_SCORE, stratagemScore } from '../../src/ai/stratagems'
import { createUtilityDecider } from '../../src/ai/utility'
import { view as engineView } from '../../src/engine'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const LOV = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Votann', faction: 'leagues-of-votann', patrolId: 'lov.cp.warspekes-prospect', enhancementId: 'lov.e.waste-feeds-the-void', secondaryId: 'lov.sec.toil-earns',
  attachments: [{ leaderRef: 'kahl', bodyguardRef: 'hearthkyn' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const KAHL = 'A:kahl', HK = 'A:hearthkyn', PIO = 'A:pioneers', BES = 'A:beserks'
const ENEMY = 'B:terminator-squad', ENEMY2 = 'B:infernus-squad', ENEMY_CAP = 'B:captain-octavius'

function makeState(o: { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; active?: 'A' | 'B'; phase?: GameState['phase']; mirror?: boolean } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: LOV(o.a), B: o.mirror ? LOV(o.b) : SM(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'lov-hooks', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'B'
  s.phase = o.phase ?? 'command'
  s.phaseState = emptyPhaseState()
  return s
}
const ctxOf = (s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES): { ctx: EngineContext; events: GameEvent[] } => createContext(s, new ScriptedRng(dice), modules)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const pendingOption = (s: GameState): ChooseOptionDecision | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
const answerWithRejection = (ctx: EngineContext, optionId: string) => {
  const pending = ctx.state.pending as ChooseOptionDecision
  return hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
}

// everything visible: Grim Efficiency / Pan-Spectral windows do not depend on terrain here
const seeAll: ModuleTable = {
  phases: DEFAULT_MODULES.phases, topics: DEFAULT_MODULES.topics,
  services: { ...DEFAULT_MODULES.services, los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false } },
}

function layout(s: GameState): void {
  placeUnit(s, KAHL, [[-13, 0]])
  placeUnit(s, HK, { x: -12, z: -3, gap: 0.3 })
  placeUnit(s, PIO, { x: -10, z: 8, gap: 0.5 })
  placeUnit(s, BES, { x: -12, z: 12, gap: 0.3 })
  placeUnit(s, ENEMY, [[12, 0]])
  placeUnit(s, ENEMY2, [[12, 6]])
}

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
type RollResult = { kind: string; modifier?: number; reroll?: string; feelNoPain?: number }
const hitResults = (s: GameState, ctx: EngineContext, model: string, weapon: string, target: string, die = 4): RollResult[] =>
  hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, model, weapon, target), roll: rollOf(die, 'hit') }).map((r) => r.result as RollResult)
const woundResults = (s: GameState, ctx: EngineContext, model: string, weapon: string, target: string): RollResult[] =>
  hookService.collect(ctx, 'onWoundRoll', { attack: attackCtx(s, model, weapon, target), roll: rollOf(4, 'wound') }).map((r) => r.result as RollResult)
const mods = (rs: RollResult[]): number[] => rs.filter((r) => r.kind === 'roll' && r.modifier !== undefined).map((r) => r.modifier as number)
const rerolls = (rs: RollResult[]): string[] => rs.filter((r) => r.kind === 'roll' && r.reroll !== undefined).map((r) => r.reroll as string)

// first legal triple of positions along z = `z` (x step 1), or along x = `x` when `along` is 'z'
function legalSpots(s: GameState, pending: DeployUnitDecision, mk: (spots: [number, number][]) => Action, fixed: number, along: 'x' | 'z'): [number, number][] | null {
  for (let a = -19; a <= 13; a++) {
    const spots: [number, number][] = [0, 4, 8].map((d) => (along === 'x' ? [a + d, fixed] : [fixed, a + d]) as [number, number])
    if (movementModule.validate!(s, mk(spots), pending) === null) return spots
  }
  return null
}

const ION = 'lov.w.ion-blaster', CCW = 'lov.w.close-combat-weapon'
const HK_ION = `${HK}#1`
const killUnit = (s: GameState, ctx: EngineContext, unitId: string, by: Parameters<typeof attackService.destroyModel>[2]): void => {
  for (const m of [...s.units[unitId].models]) attackService.destroyModel(ctx, m, by)
}
const byEnemy = (unitId: string) => ({ player: 'B' as const, unitId, modelId: `${unitId}#0`, kind: 'ranged' as const })

// ---------------------------------------------------------------------------------------------------------------------
describe('registration', () => {
  it('LEA-001 all nine code hooks are registered in the code registry', () => {
    for (const k of ['eyeOfTheAncestors', 'grimEfficiencyPick', 'toilEarnsPick', 'toilEarnsScore', 'holyApparatusPick', 'holyApparatusScore', 'paymentInKind', 'outflankingMagRiders', 'cyberstimms']) {
      expect(codeHooks[k], k).toBeTruthy()
      expect(leaguesOfVotannHooks[k], k).toBeTruthy()
    }
  })
})

describe('Judgement tokens (LEA-2.1 .. 2.4)', () => {
  it('LEA-003 an enemy unit that destroys the Beserks gains 1 Judgement token (AbilityTriggered)', () => {
    const s = makeState({ phase: 'shooting' })
    layout(s)
    const { ctx, events } = ctxOf(s)
    killUnit(s, ctx, BES, byEnemy(ENEMY))
    expect(s.units[BES].location).toBe('destroyed')
    expect(judgementTokens(s, 'A', ENEMY)).toBe(1)
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Judgement') && e.targetUnitId === ENEMY)).toBe(true)
    expect(judgementTokens(s, 'A', ENEMY2)).toBe(0)
  })

  it('LEA-004 a second destroyed Votann unit gives 2 tokens, a third still 2', () => {
    const s = makeState({ phase: 'shooting' })
    layout(s)
    const { ctx } = ctxOf(s)
    killUnit(s, ctx, BES, byEnemy(ENEMY))
    killUnit(s, ctx, PIO, byEnemy(ENEMY))
    expect(judgementTokens(s, 'A', ENEMY)).toBe(2)
    killUnit(s, ctx, HK, byEnemy(ENEMY))
    expect(judgementTokens(s, 'A', ENEMY)).toBe(2)
  })

  it('LEA-005 a Votann unit that dies with no attributed enemy (Hazardous / own unit / lost in Reserves) gives no token', () => {
    const s = makeState({ phase: 'shooting' })
    layout(s)
    const { ctx } = ctxOf(s)
    killUnit(s, ctx, BES, { player: 'A', unitId: BES, modelId: `${BES}#0`, kind: 'other' })
    killUnit(s, ctx, PIO, { player: null, unitId: null, modelId: null, kind: 'other' } as never)
    expect(judgementTokens(s, 'A', ENEMY)).toBe(0)
    expect(judgementTokens(s, 'A', BES)).toBe(0)
    // lost in Reserves
    const t = makeState({ phase: 'movement' })
    layout(t)
    const c2 = ctxOf(t)
    removeUnitToReserves(c2.ctx, PIO, 'x')
    destroyTeleportingUnit(c2.ctx, PIO)
    expect(t.units[PIO].location).toBe('destroyed')
    expect(Object.values(t.units).every((u) => judgementTokens(t, 'A', u.id) === 0 && judgementTokens(t, 'B', u.id) === 0)).toBe(true)
  })

  it('LEA-009 an attached enemy pair shares its tokens: the surviving leader keeps the count after the bodyguard dies', () => {
    const s = makeState({ phase: 'shooting', b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } })
    layout(s)
    placeUnit(s, ENEMY_CAP, [[11, 1]])
    expect(leaderService.canonicalUnitId(s, ENEMY_CAP)).toBe(ENEMY)
    const { ctx } = ctxOf(s)
    killUnit(s, ctx, BES, byEnemy(ENEMY))
    expect(judgementTokens(s, 'A', ENEMY)).toBe(1)
    expect(judgementTokens(s, 'A', ENEMY_CAP)).toBe(1)
    for (const m of [...s.units[ENEMY].models]) attackService.destroyModel(ctx, m, { player: 'A', unitId: HK, modelId: `${HK}#1`, kind: 'ranged' })
    expect(s.units[ENEMY].location).toBe('destroyed')
    expect(s.units[ENEMY_CAP].location).toBe('board')
    expect(judgementTokens(s, 'A', ENEMY_CAP)).toBe(1)
  })

  it('LEA-010 a unit with tokens keeps them after leaving to Reserves and returning', () => {
    const s = makeState({ phase: 'shooting' })
    layout(s)
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', ENEMY, 2, 't')
    s.units[ENEMY].location = 'reserves'
    expect(judgementTokens(s, 'A', ENEMY)).toBe(2)
    placeUnit(s, ENEMY, [[12, 0]])
    expect(judgementTokens(s, 'A', ENEMY)).toBe(2)
  })
})

describe('Eye of the Ancestors hit / wound bonus (LEA-2.2, 2.4)', () => {
  it('LEA-007 against a 1-token target: +1 to hit and no wound modifier; a Hearthkyn ion blaster 3 then hits', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    const { ctx } = ctxOf(s)
    expect(mods(hitResults(s, ctx, HK_ION, ION, ENEMY))).toEqual([])
    addJudgement(ctx, 'A', ENEMY, 1, 't')
    expect(mods(hitResults(s, ctx, HK_ION, ION, ENEMY))).toEqual([1])
    expect(mods(woundResults(s, ctx, HK_ION, ION, ENEMY))).toEqual([])
    expect(mods(hitResults(s, ctx, HK_ION, ION, ENEMY2))).toEqual([])
  })

  it('LEA-008 against a 2-token target: +1 hit and +1 wound; melee gets it too; a 0-token unit gets none', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', ENEMY, 2, 't')
    expect(mods(hitResults(s, ctx, HK_ION, ION, ENEMY))).toEqual([1])
    expect(mods(woundResults(s, ctx, HK_ION, ION, ENEMY))).toEqual([1])
    expect(mods(hitResults(s, ctx, HK_ION, CCW, ENEMY))).toEqual([1])
    expect(mods(woundResults(s, ctx, HK_ION, ION, ENEMY2))).toEqual([])
  })

  it('LEA-008 Heavy +1 plus the 1-token Eye +1 is still capped at +1 to hit through the real attack roll', () => {
    const MAGNA = 'lov.w.magna-rail-rifle'
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    const magnaModel = s.units[HK].models.find((m) => s.models[m].weapons.includes(MAGNA))
    expect(magnaModel).toBeDefined()
    s.units[HK].turn.moveType = 'stationary'
    s.units[HK].turn.arrivedThisTurn = false
    const { ctx, events } = ctxOf(s, [4, ...Array(60).fill(2)])
    addJudgement(ctx, 'A', ENEMY, 1, 't')
    // the Eye hook alone contributes +1; Heavy adds a second +1 as a manual modifier
    expect(mods(hitResults(s, ctx, magnaModel!, MAGNA, ENEMY))).toEqual([1])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: HK, overwatch: false, targets: [{ modelId: magnaModel!, weaponId: MAGNA, targetUnitId: ENEMY, profileGroup: null, attacks: null }] })
    let r = attackService.advance(ctx)
    let guard = 0
    while (r === 'pending' && ++guard < 500) {
      const pending = ctx.state.pending as PendingDecision & { options?: { action: Action }[] }
      ctx.state.pending = null
      const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
      const rej = owner.handle(ctx, pending.options![0].action, pending)
      if (rej) throw new Error(`${rej.code} ${rej.reason}`)
      r = attackService.advance(ctx)
    }
    const hit = of(events, 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 4, final: 5 }) // 4 + capped +1 (an uncapped +2 would be 6)
  })

  it('LEA-008 the Kahl and each Votann datasheet carry the bonus (one contribution per source across an attached unit)', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', ENEMY, 1, 't')
    expect(mods(hitResults(s, ctx, `${KAHL}#0`, 'lov.w.volkanite-disintegrator', ENEMY))).toEqual([1])
    expect(mods(hitResults(s, ctx, `${PIO}#0`, 'lov.w.bolt-shotgun', ENEMY))).toEqual([1])
    expect(mods(hitResults(s, ctx, `${BES}#0`, 'lov.w.heavy-plasma-axe-strike', ENEMY))).toEqual([1])
  })

  it('LEA-011 mirror match: tokens are per Votann player and never modify the other player\'s attacks', () => {
    const s = makeState({ phase: 'shooting', active: 'A', mirror: true, b: { attachments: [{ leaderRef: 'kahl', bodyguardRef: 'hearthkyn' }] } })
    placeUnit(s, KAHL, [[-13, 0]])
    placeUnit(s, HK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, 'B:hearthkyn', { x: 12, z: -3, gap: 0.3 })
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', 'B:hearthkyn', 1, 't') // A's token on B's unit
    expect(mods(hitResults(s, ctx, HK_ION, ION, 'B:hearthkyn'))).toEqual([1])
    // B's models attacking A's unit: B holds no tokens on it
    expect(mods(hitResults(s, ctx, 'B:hearthkyn#1', ION, HK))).toEqual([])
    expect(judgementTokens(s, 'B', 'B:hearthkyn')).toBe(0)
  })

  it('LEA-037 tokens live in secondaryState and leave a game with no Votann token untouched', () => {
    const s = makeState({ phase: 'shooting' })
    layout(s)
    expect(s.players.A.secondaryState['lov:judgement']).toBeUndefined()
    expect(s.players.B.secondaryState['lov:judgement']).toBeUndefined()
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', ENEMY, 1, 't')
    expect(s.players.A.secondaryState['lov:judgement']).toEqual({ [ENEMY]: 1 })
    expect(JSON.parse(JSON.stringify(s.players.A.secondaryState))).toEqual(s.players.A.secondaryState)
  })
})

describe('Grim Efficiency (LEA-6.1)', () => {
  const state = (active: 'A' | 'B') => {
    const s = makeState({ phase: 'command', active })
    layout(s)
    return s
  }
  it('LEA-012 offered at command.start of the owner\'s own turn over visible enemy units; the pick gives +1 token', () => {
    const s = state('A')
    const { ctx } = ctxOf(s, [], seeAll)
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.canPass).toBe(false)
    expect(pending.options.map((o) => o.id).sort()).toEqual([ENEMY, ENEMY2].sort())
    answer(ctx, ENEMY2)
    expect(judgementTokens(s, 'A', ENEMY2)).toBe(1)
    expect(judgementTokens(s, 'A', ENEMY)).toBe(0)
    // once per battle round
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(false)
  })

  it('LEA-012 only visible units are options; none visible, the opponent\'s Command phase, or a dead Kahl: no decision', () => {
    const s = state('A')
    const blind: ModuleTable = { ...seeAll, services: { ...seeAll.services, los: { ...seeAll.services.los, unitVisible: (_st: GameState, _m: string, u: string) => u === ENEMY } } }
    const { ctx } = ctxOf(s, [], blind)
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    expect(pendingOption(s)!.options.map((o) => o.id)).toEqual([ENEMY])

    const none = state('A')
    const nobody: ModuleTable = { ...seeAll, services: { ...seeAll.services, los: { ...seeAll.services.los, unitVisible: () => false } } }
    expect(hookService.offerPicks!(ctxOf(none, [], nobody).ctx, 'command.start', 'start')).toBe(false)

    const theirs = state('B')
    hookService.offerPicks!(ctxOf(theirs, [], seeAll).ctx, 'command.start', 'start')
    expect(pendingOption(theirs)?.context.data.code).not.toBe('grimEfficiencyPick') // the SM player's own Oath of Moment may be asked

    const dead = state('A')
    for (const m of [...dead.units[KAHL].models]) attackService.destroyModel(ctxOf(dead).ctx, m, byEnemy(ENEMY))
    expect(hookService.offerPicks!(ctxOf(dead, [], seeAll).ctx, 'command.start', 'start')).toBe(false)
  })

  it('LEA-012 an unseen or friendly unit is rejected as an answer', () => {
    const s = state('A')
    const { ctx } = ctxOf(s, [], seeAll)
    hookService.offerPicks!(ctx, 'command.start', 'start')
    expect(answerWithRejection(ctx, HK)).toBeTruthy()
  })

  it('LEA-013 picking a unit that already holds 2 tokens leaves it at 2', () => {
    const s = state('A')
    const { ctx } = ctxOf(s, [], seeAll)
    addJudgement(ctx, 'A', ENEMY, 2, 't')
    hookService.offerPicks!(ctx, 'command.start', 'start')
    answer(ctx, ENEMY)
    expect(judgementTokens(s, 'A', ENEMY)).toBe(2)
  })
})

describe('Enhancements (LEA-3)', () => {
  it('LEA-014 Waste Feeds the Void: the bearer\'s unit (Hearthkyn + attached Kahl) re-rolls ranged hit rolls of 1; melee and the Pioneers do not', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    const { ctx } = ctxOf(s)
    expect(rerolls(hitResults(s, ctx, HK_ION, ION, ENEMY, 1))).toEqual(['ones'])
    expect(rerolls(hitResults(s, ctx, `${KAHL}#0`, 'lov.w.volkanite-disintegrator', ENEMY, 1))).toEqual(['ones'])
    expect(rerolls(hitResults(s, ctx, HK_ION, CCW, ENEMY, 1))).toEqual([])
    expect(rerolls(hitResults(s, ctx, `${PIO}#0`, 'lov.w.bolt-shotgun', ENEMY, 1))).toEqual([])
  })

  it('LEA-015 Waste Feeds the Void: the led Hearthkyn may shoot after Falling Back', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    s.units[HK].turn.moveType = 'fallBack'
    s.units[KAHL].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, HK, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, KAHL, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, HK, 'charge')).toBe(false)
    s.units[PIO].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, PIO, 'shoot')).toBe(false)
  })

  it('LEA-016 Pragmaat Comms Uplink: +1 OC for the Hearthkyn and the Kahl; the unit re-rolls failed Battle-shock tests', () => {
    const base = makeState({ phase: 'command' })
    const upg = makeState({ phase: 'command', a: { enhancementId: 'lov.e.pragmaat-comms-uplink' } })
    for (const s of [base, upg]) layout(s)
    const oc = (s: GameState, u: string) => hookService.statFor(s, { unitId: u, modelId: s.units[u].models[0], weapon: null, stat: 'OC' }, modelStats(s, s.models[s.units[u].models[0]]).OC)
    expect(oc(base, HK)).toBe(2)
    expect(oc(base, KAHL)).toBe(1)
    expect(oc(upg, HK)).toBe(3)
    expect(oc(upg, KAHL)).toBe(2)
    expect(oc(upg, PIO)).toBe(oc(base, PIO))
    const { ctx } = ctxOf(upg)
    const shock = hookService.collect(ctx, 'onBattleShockTest', { testUnitId: HK, roll: null } as never).map((r) => r.result as RollResult)
    expect(rerolls(shock)).toEqual(['fails'])
  })
})

describe('Toil Earns (LEA-4.1)', () => {
  const setupWindow = (insideOwnZone = false): { s: GameState; ctx: EngineContext } => {
    const s = makeState({ round: 0, phase: 'setup' as GameState['phase'], active: 'A' })
    // cp-01 has no marker in either zone; drag 'south' into the Votann zone to exercise the exclusion
    if (insideOwnZone) s.objectives.south.pos = { x: 0, z: -12 }
    const { ctx } = ctxOf(s)
    return { s, ctx }
  }
  it('LEA-017 the pick is offered in the Deploy Armies window; markers inside the player\'s own zone are excluded; the answer is stored', () => {
    const { s, ctx } = setupWindow()
    ctx.services.missions.onWindow(ctx, 'deployment.unit', 'deployArmies')
    const pending = pendingOption(s)!
    expect(pending).not.toBeNull()
    expect(pending.player).toBe('A')
    expect(pending.canPass).toBe(false)
    const ids = pending.options.map((o) => o.id)
    expect(ids).toEqual(toilCandidates(s, 'A'))
    expect(ids).toEqual(['east', 'north', 'south', 'west'])
    answer(ctx, ids[0])
    expect(s.players.A.secondaryState['lov:toilEarns']).toBe(ids[0])
    expect(s.pending).toBeNull()
  })

  it('LEA-017 an answer for a marker inside the own zone is rejected; the other player (no Toil Earns) is not asked', () => {
    const { s, ctx } = setupWindow(true)
    ctx.services.missions.onWindow(ctx, 'deployment.unit', 'deployArmies')
    expect(toilCandidates(s, 'A')).toEqual(['east', 'north', 'west'])
    expect(deploymentZone(s, 'A').some((p) => p.z === -10)).toBe(true)
    expect(pendingOption(s)!.options.map((o) => o.id)).not.toContain('south')
    expect(answerWithRejection(ctx, 'south')).toBeTruthy()
    expect(pendingOption(s)!.player).toBe('A')
    expect(s.players.B.secondaryState['lov:toilEarns']).toBeUndefined()
  })

  it('LEA-018 scores 4 VP at the end of the owner\'s own turn from round 2 on if the marker is held; 0 in round 1 and in the opponent\'s turn', () => {
    const run = (round: number, active: 'A' | 'B'): number => {
      const s = makeState({ round, active, phase: 'fight' })
      layout(s)
      const target = 'west'
      s.players.A.secondaryState['lov:toilEarns'] = target
      s.objectives[target].securedBy = 'A'
      const { ctx } = ctxOf(s)
      ctx.services.missions.onWindow(ctx, 'turn.end', 'turn')
      return s.players.A.vp
    }
    expect(run(1, 'A')).toBe(0)
    expect(run(2, 'A')).toBe(4)
    expect(run(5, 'A')).toBe(4)
    expect(run(2, 'B')).toBe(0)
    // marker not held: 0
    const s = makeState({ round: 2, active: 'A', phase: 'fight' })
    layout(s)
    const target = 'east' // the Marines stand on it
    s.players.A.secondaryState['lov:toilEarns'] = target
    s.objectives[target].securedBy = 'B'
    const { ctx } = ctxOf(s)
    ctx.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.A.vp).toBe(0)
  })
})

describe('Holy Apparatus (LEA-4.2)', () => {
  const holy = (o: { round?: number } = {}): GameState => {
    const s = makeState({ round: o.round ?? 2, active: 'A', phase: 'command', a: { secondaryId: 'lov.sec.holy-apparatus' } })
    layout(s)
    return s
  }
  it('LEA-019 no pick in round 1; at round 2 start only enemy units with a token are listed; none means no decision', () => {
    const r1 = holy({ round: 1 })
    const c1 = ctxOf(r1)
    addJudgement(c1.ctx, 'A', ENEMY, 1, 't')
    c1.ctx.services.missions.onWindow(c1.ctx, 'round.start', '1')
    expect(r1.pending).toBeNull()

    const none = holy()
    const c2 = ctxOf(none)
    c2.ctx.services.missions.onWindow(c2.ctx, 'round.start', '2')
    expect(none.pending).toBeNull()
    expect(none.players.A.secondaryState['lov:holyApparatus']).toBeNull()

    const s = holy()
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', ENEMY, 1, 't')
    ctx.services.missions.onWindow(ctx, 'round.start', '2')
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual([ENEMY])
    expect(holyCandidates(s, 'A')).toEqual([ENEMY])
    answer(ctx, ENEMY)
    expect(s.players.A.secondaryState['lov:holyApparatus']).toMatchObject({ unitId: ENEMY, round: 2 })
  })

  const scoreAfter = (destroy: (s: GameState, ctx: EngineContext) => void, setup?: (s: GameState) => void): number => {
    const s = holy()
    setup?.(s)
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', ENEMY, 1, 't')
    ctx.services.missions.onWindow(ctx, 'round.start', '2')
    answer(ctx, leaderService.canonicalUnitId(s, ENEMY))
    destroy(s, ctx)
    ctx.services.missions.onWindow(ctx, 'round.end', '2')
    return s.players.A.vp
  }
  it('LEA-020 the target destroyed by any means during the round scores 4 VP at round end; surviving scores 0', () => {
    expect(scoreAfter((s, ctx) => killUnit(s, ctx, ENEMY, { player: 'A', unitId: HK, modelId: `${HK}#1`, kind: 'ranged' }))).toBe(4)
    expect(scoreAfter((s, ctx) => killUnit(s, ctx, ENEMY, { player: null, unitId: null, modelId: null, kind: 'other' } as never))).toBe(4)
    expect(scoreAfter(() => undefined)).toBe(0)
  })

  it('LEA-020 an attached target with one half alive scores nothing; both halves destroyed scores', () => {
    const attached = (s: GameState) => { placeUnit(s, ENEMY_CAP, [[11, 1]]) }
    const mk = (kill: string[]) => {
      const s = makeState({ round: 2, active: 'A', phase: 'command', a: { secondaryId: 'lov.sec.holy-apparatus' }, b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } })
      layout(s)
      attached(s)
      const { ctx } = ctxOf(s)
      addJudgement(ctx, 'A', ENEMY, 1, 't')
      ctx.services.missions.onWindow(ctx, 'round.start', '2')
      answer(ctx, ENEMY)
      for (const u of kill) for (const m of [...s.units[u].models]) attackService.destroyModel(ctx, m, { player: 'A', unitId: HK, modelId: `${HK}#1`, kind: 'ranged' })
      ctx.services.missions.onWindow(ctx, 'round.end', '2')
      return s.players.A.vp
    }
    expect(mk([ENEMY])).toBe(0)
    expect(mk([ENEMY_CAP])).toBe(0)
    expect(mk([ENEMY, ENEMY_CAP])).toBe(4)
  })
})

// ---------- stratagems ----------
const PIK = 'lov.s.payment-in-kind', SWEEP = 'lov.s.pan-spectral-sweep', SKEIN = 'lov.s.skeinwrought-physiology'
function stratHarness(s: GameState) {
  const services: Services = {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics }
  const made = (dice: number[] = []) => createContext(s, new ScriptedRng(dice), modules).ctx
  const useOption = (ctx: EngineContext, stratagemId: string, firstId?: string) => {
    const opts = ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((x) => x.action as UseStratagemAction)
    const opt = opts.find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    const pending = s.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    s.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { made, useOption }
}
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])

describe('Payment in Kind (LEA-5)', () => {
  const noAttach = { attachments: [] as PlayerSetup['attachments'] }
  it('LEA-021 offered just after an enemy attack destroys the last Hearthkyn; used: Votann hit rolls of 1 against the killer\'s unit are re-rolled, against other units not', () => {
    const s = makeState({ phase: 'shooting', active: 'B', a: noAttach })
    layout(s)
    s.players.A.cp = 3
    const h = stratHarness(s)
    const ctx = h.made()
    // a model that is not the last one: no window target
    attackService.destroyModel(ctx, s.units[HK].models[0], byEnemy(ENEMY))
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', PIK, { unitId: HK })).toEqual([])
    for (const m of [...s.units[HK].models]) attackService.destroyModel(ctx, m, byEnemy(ENEMY))
    expect(s.units[HK].location).toBe('destroyed')
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', PIK, { unitId: HK })).toEqual([[HK]])
    stratagemService.openWindow?.(ctx, 'attack.modelDestroyed', 'A', 'k', { unitId: HK })
    h.useOption(ctx, PIK, HK)
    expect(s.players.A.cp).toBe(2)
    const beserkAxe = `${BES}#0`, axe = 'lov.w.heavy-plasma-axe-strike'
    expect(rerolls(hitResults(s, ctx, beserkAxe, axe, ENEMY, 1))).toEqual(['ones'])
    expect(rerolls(hitResults(s, ctx, `${PIO}#0`, 'lov.w.bolt-shotgun', ENEMY, 1))).toEqual(['ones'])
    expect(rerolls(hitResults(s, ctx, beserkAxe, axe, ENEMY2, 1))).toEqual([])
    // the re-roll is granted to the killer's unit, not to the destroyed unit
    expect(s.units[HK].effects).toHaveLength(0)
  })

  it('LEA-021 the effect lasts for the rest of the battle (a later turn still re-rolls)', () => {
    const s = makeState({ phase: 'shooting', active: 'B', a: noAttach })
    layout(s)
    s.players.A.cp = 3
    const h = stratHarness(s)
    const ctx = h.made()
    for (const m of [...s.units[HK].models]) attackService.destroyModel(ctx, m, byEnemy(ENEMY))
    stratagemService.openWindow?.(ctx, 'attack.modelDestroyed', 'A', 'k', { unitId: HK })
    h.useOption(ctx, PIK, HK)
    s.round = 4; s.activePlayer = 'A'; s.phase = 'fight'; s.phaseState = emptyPhaseState()
    expect(rerolls(hitResults(s, ctx, `${BES}#0`, 'lov.w.heavy-plasma-axe-strike', ENEMY, 1))).toEqual(['ones'])
  })

  it('LEA-022 not offered when the Votann unit died to its own Hazardous / a non-attack effect', () => {
    const s = makeState({ phase: 'shooting', active: 'A', a: noAttach })
    layout(s)
    s.players.A.cp = 3
    const { ctx } = ctxOf(s)
    for (const m of [...s.units[HK].models]) attackService.destroyModel(ctx, m, { player: 'A', unitId: HK, modelId: `${HK}#0`, kind: 'other' })
    expect(s.units[HK].location).toBe('destroyed')
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', PIK, { unitId: HK })).toEqual([])
    const t = makeState({ phase: 'shooting', active: 'B', a: noAttach })
    layout(t)
    t.players.A.cp = 3
    const c2 = ctxOf(t)
    for (const m of [...t.units[HK].models]) attackService.destroyModel(c2.ctx, m, { player: 'B', unitId: ENEMY, modelId: null, kind: 'mortal' } as never)
    expect(offeredIds(t, 'A', 'attack.modelDestroyed', PIK, { unitId: HK })).toEqual([])
  })
})

describe('Pan-Spectral Sweep and Skeinwrought Physiology (LEA-5)', () => {
  const lethal = (s: GameState, model: string, weapon: string) => hookService.weaponAbilitiesFor!(s, model, s.weapons[weapon]).map((a) => a.ability).includes('LETHAL_HITS')

  it('LEA-023 Pan-Spectral Sweep: own Shooting phase, a unit that has not shot: ranged weapons gain Lethal Hits until phase end; not offered after the unit shot', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    s.players.A.cp = 3
    expect(offeredIds(s, 'A', 'shooting.start', SWEEP).map((x) => x[0]).sort()).toEqual([BES, HK, PIO].sort())
    s.units[HK].turn.shotThisPhase = true
    expect(offeredIds(s, 'A', 'shooting.start', SWEEP).map((x) => x[0])).not.toContain(HK)
    s.units[HK].turn.shotThisPhase = false
    const h = stratHarness(s)
    const ctx = h.made()
    stratagemService.openWindow?.(ctx, 'shooting.start', 'A', 'k', {})
    h.useOption(ctx, SWEEP, HK)
    expect(lethal(s, HK_ION, ION)).toBe(true)
    expect(lethal(s, `${KAHL}#0`, 'lov.w.volkanite-disintegrator')).toBe(true) // the attached Kahl shares the unit
    expect(lethal(s, HK_ION, CCW)).toBe(false) // melee weapons not
    expect(lethal(s, `${PIO}#0`, 'lov.w.bolt-shotgun')).toBe(false)
    expect(s.players.A.cp).toBe(2)
  })

  it('LEA-023 Pan-Spectral Sweep is not offered in the opponent\'s Shooting phase', () => {
    const s = makeState({ phase: 'shooting', active: 'B' })
    layout(s)
    s.players.A.cp = 3
    expect(offeredIds(s, 'A', 'shooting.start', SWEEP)).toEqual([])
  })

  it('LEA-024 Skeinwrought Physiology: in the opponent\'s Shooting after targets are declared, Hearthkyn save 4+ to 3+ and the Kahl 3+ to 2+, the invulnerable save is unchanged', () => {
    const s = makeState({ phase: 'shooting', active: 'B' })
    layout(s)
    s.players.A.cp = 3
    const sv = (u: string) => hookService.statFor(s, { unitId: u, modelId: s.units[u].models[0], weapon: null, stat: 'Sv' }, modelStats(s, s.models[s.units[u].models[0]]).Sv)
    expect(sv(HK)).toBe(4)
    expect(sv(KAHL)).toBe(3)
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SKEIN, { unitId: ENEMY, targetUnitId: HK }).map((x) => x[0])).toEqual([HK])
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SKEIN, { unitId: ENEMY, targetUnitId: PIO }).map((x) => x[0])).toEqual([PIO])
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SKEIN, { unitId: ENEMY, targetUnitId: ENEMY2 })).toEqual([])
    const h = stratHarness(s)
    const ctx = h.made()
    stratagemService.openWindow?.(ctx, 'shooting.targetsDeclared', 'A', 'k', { unitId: ENEMY, targetUnitId: HK })
    h.useOption(ctx, SKEIN, HK)
    expect(sv(HK)).toBe(3)
    expect(sv(KAHL)).toBe(2)
    expect(sv(PIO)).toBe(4)
    expect(s.datasheets[s.units[KAHL].datasheetId].invuln).toBe(4)
    // expires with the phase
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(sv(HK)).toBe(4)
    expect(sv(KAHL)).toBe(3)
  })
})

describe('Medipack and Pan-Spectral Scanner (LEA-6.2)', () => {
  const fnp = (s: GameState, ctx: EngineContext, target: string): (number | undefined)[] =>
    hookService.collect(ctx, 'onFeelNoPainRoll', { attack: attackCtx(s, `${ENEMY}#0`, s.models[`${ENEMY}#0`].weapons[0], target), roll: rollOf(0, 'fnp'), mortal: false, psychicSource: false })
      .map((r) => (r.result as RollResult).feelNoPain).filter((n) => n !== undefined)
  const modelOf = (s: GameState, unitId: string, dsModel: string) => s.units[unitId].models.find((m) => s.models[m].datasheetModelId === dsModel)!

  it('LEA-025 Medipack: Hearthkyn and the attached Kahl get FNP 6+ while the medipack Warrior lives; gone once he dies', () => {
    const s = makeState({ phase: 'shooting', active: 'B' })
    layout(s)
    const { ctx } = ctxOf(s)
    expect(fnp(s, ctx, HK)).toEqual([6])
    expect(fnp(s, ctx, KAHL)).toEqual([6])
    expect(fnp(s, ctx, PIO)).toEqual([])
    attackService.destroyModel(ctx, modelOf(s, HK, 'warrior-medipack'), byEnemy(ENEMY))
    expect(fnp(s, ctx, HK)).toEqual([])
    expect(fnp(s, ctx, KAHL)).toEqual([])
  })

  it('LEA-026 Pan-Spectral Scanner: Hearthkyn ranged weapons ignore cover while the scanner Warrior lives', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    layout(s)
    const ign = () => hookService.weaponAbilitiesFor!(s, HK_ION, s.weapons[ION]).map((a) => a.ability).includes('IGNORES_COVER')
    expect(ign()).toBe(true)
    expect(hookService.weaponAbilitiesFor!(s, HK_ION, s.weapons[CCW]).map((a) => a.ability)).not.toContain('IGNORES_COVER')
    expect(hookService.weaponAbilitiesFor!(s, `${PIO}#0`, s.weapons['lov.w.bolt-shotgun']).map((a) => a.ability)).not.toContain('IGNORES_COVER')
    const { ctx } = ctxOf(s)
    attackService.destroyModel(ctx, modelOf(s, HK, 'warrior-scanner'), byEnemy(ENEMY))
    expect(ign()).toBe(false)
  })
})

// ---------- Outflanking Mag-Riders ----------
describe('Outflanking Mag-Riders (LEA-6.3)', () => {
  // the Pioneers sit close to the top edge; the Hearthkyn stay inside; enemies are far from the edge
  const state = (o: { round?: number; active?: 'A' | 'B' } = {}) => {
    const s = makeState({ phase: 'fight', round: o.round ?? 2, active: o.active ?? 'B' })
    layout(s)
    placeUnit(s, PIO, [[-4, -12.5], [0, -12.5], [4, -12.5]])
    placeUnit(s, ENEMY, [[15, 8]])
    placeUnit(s, ENEMY2, [[15, 0]])
    return s
  }
  it('LEA-027 offered at the end of the opponent\'s turn from round 2 for Pioneers within 6" of an edge and not engaged; not in round 1 or when too far from every edge', () => {
    const s = state()
    const { ctx } = ctxOf(s)
    expect(magRidersCandidates(s, 'A')).toEqual([PIO])
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual([PIO, 'decline'])

    const r1 = state({ round: 1 })
    expect(magRidersCandidates(r1, 'A')).toEqual([])
    expect(hookService.offerPicks!(ctxOf(r1).ctx, 'turn.end', 'turn')).toBe(false)

    const far = state()
    placeUnit(far, PIO, [[-4, -3], [0, -3], [4, -3]])
    expect(magRidersCandidates(far, 'A')).toEqual([])

    const engaged = state()
    placeUnit(engaged, ENEMY2, [[0, -10]])
    expect(magRidersCandidates(engaged, 'A')).toEqual([])

    const own = state({ active: 'A' })
    expect(hookService.offerPicks!(ctxOf(own).ctx, 'turn.end', 'turn')).toBe(false)
  })

  it('LEA-027 only units with the ability qualify (the Hearthkyn at the edge are not offered)', () => {
    const s = state()
    placeUnit(s, HK, { x: -4, z: -12.5, gap: 0.3 })
    expect(magRidersCandidates(s, 'A')).toEqual([PIO])
  })

  it('LEA-028 picking removes the unit into Reserves with the edge arrival record; the arrival is mandatory and respects the edge strip', () => {
    const s = state()
    const { ctx, events } = ctxOf(s)
    hookService.offerPicks!(ctx, 'turn.end', 'turn')
    answer(ctx, PIO)
    expect(s.units[PIO].location).toBe('reserves')
    expect(isTeleporting(s, PIO)).toBe(true)
    expect(of(events, 'UnitRemovedFromBattlefield')).toHaveLength(1)
    expect(teleportArrivalOpts(s, PIO)).toMatchObject({ minEnemyGap: 9, forbidChargeOnArrival: false, region: 'edgeNotOpponent', eventVia: 'strategicReserves' })

    // the owner's next Reinforcements step
    s.phase = 'movement'; s.activePlayer = 'A'; s.round = 3; s.phaseState = emptyPhaseState(); s.step = 'reinforcements'
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([PIO])
    const ids = s.units[PIO].models
    const place = (spots: [number, number][]): Action => ({ type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: PIO, placements: ids.map((id, i) => ({ modelId: id, pos: { x: spots[i][0], y: 0, z: spots[i][1] }, facing: 0 })) })
    // cp-01: the Marines' edge is the bottom (z = +15); the Votann's own edge and both side edges are legal
    expect(playerBattlefieldEdge(s.board, deploymentZone(s, 'B'))).toBe('B')
    const own = legalSpots(s, pending, place, -13, 'x')
    expect(own).not.toBeNull() // own edge
    expect(legalSpots(s, pending, place, -20.2, 'z')).not.toBeNull() // side edge
    expect(movementModule.validate!(s, place([[-4, 0], [0, 0], [4, 0]]), pending)).not.toBeNull() // middle of the board
    expect(movementModule.validate!(s, place([[-4, 13], [0, 13], [4, 13]]), pending)).not.toBeNull() // the Marines' edge strip
    expect(legalSpots(s, pending, place, 12.3, 'z')).toBeNull() // no spot along x = 12.3 is within 6" of an edge that is not the Marines'
    // more than 9" from every enemy model
    placeUnit(s, ENEMY, [[own![1][0], own![1][1] + 6]])
    expect(movementModule.validate!(s, place(own!), pending)).not.toBeNull()
  })

  it('LEA-029 the arrival is allowed in round 4, the unit is not culled at the end of round 3, and declining destroys it; at battle end it counts as destroyed', () => {
    const s = state({ round: 3 })
    const { ctx } = ctxOf(s)
    hookService.offerPicks!(ctx, 'turn.end', 'turn')
    answer(ctx, PIO)
    // end of round 3 cull of Strategic Reserves does not touch it
    expect(s.units[PIO].location).toBe('reserves')
    s.round = 4; s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState(); s.step = 'reinforcements'
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    expect((s.pending as DeployUnitDecision).context.unitIds).toEqual([PIO])
    // stranded off the board at battle end -> destroyed with no attribution
    destroyTeleportingUnit(c.ctx, PIO)
    expect(s.units[PIO].location).toBe('destroyed')
    expect(judgementTokens(s, 'B', PIO)).toBe(0)
    expect(Object.values(s.units).every((u) => judgementTokens(s, 'A', u.id) === 0)).toBe(true)
  })

  it('LEA-030 the arrival reports ReinforcementsArrived via strategicReserves', () => {
    const s = state()
    const { ctx } = ctxOf(s)
    hookService.offerPicks!(ctx, 'turn.end', 'turn')
    answer(ctx, PIO)
    s.phase = 'movement'; s.activePlayer = 'A'; s.round = 3; s.phaseState = emptyPhaseState(); s.step = 'reinforcements'
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    const ids = s.units[PIO].models
    const mk = (spots: [number, number][]): Action => ({ type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: PIO, placements: ids.map((id, i) => ({ modelId: id, pos: { x: spots[i][0], y: 0, z: spots[i][1] }, facing: 0 })) })
    const action = mk(legalSpots(s, pending, mk, -13, 'x')!)
    expect(movementModule.validate!(s, action, pending)).toBeNull()
    s.pending = null
    expect(movementModule.handle(c.ctx, action, pending)).toBeUndefined()
    expect(s.units[PIO].location).toBe('board')
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ unitId: PIO, via: 'strategicReserves' })
    expect(isTeleporting(s, PIO)).toBe(false)
  })
})

// ---------- Cyberstimms ----------
describe('Cyberstimms (LEA-6.4)', () => {
  const fightState = (active: 'A' | 'B' = 'B') => {
    const s = makeState({ phase: 'fight', active })
    layout(s)
    placeUnit(s, ENEMY, [[-12, 11]])
    s.phaseState = emptyPhaseState()
    const { ctx } = ctxOf(s)
    hookService.run(ctx, 'onPhaseStart', {}) // the reducer runs this on entering a phase, after the phase state reset
    return s
  }
  const kill = (s: GameState, dice: number[], by: Parameters<typeof attackService.destroyModel>[2] = { player: 'B', unitId: ENEMY, modelId: `${ENEMY}#0`, kind: 'melee' }) => {
    const { ctx } = createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
    attackService.destroyModel(ctx, s.units[BES].models[0], by)
  }
  it('LEA-031 a Fight phase start grants the Beserks fight-on-death at 4+: D6 4 keeps the model for one more attack, D6 3 removes it at once', () => {
    const s = fightState()
    expect(fightOnDeathThreshold(s, BES)).toBe(4)
    const m = s.units[BES].models[0]
    kill(s, [4])
    expect(deferredDeaths(s).map((d) => d.modelId)).toEqual([m])
    const t = fightState()
    const m2 = t.units[BES].models[0]
    kill(t, [3])
    expect(deferredDeaths(t)).toHaveLength(0)
    expect(t.models[m2]).toBeUndefined()
  })

  it('LEA-032 works in both players\' Fight phases; no roll once the Beserks have fought; no roll outside the Fight phase (ranged attacks in Shooting)', () => {
    const own = fightState('A')
    expect(fightOnDeathThreshold(own, BES)).toBe(4)
    const fought = fightState()
    fought.units[BES].turn.foughtThisPhase = true
    const m = fought.units[BES].models[0]
    kill(fought, []) // an empty ScriptedRng would throw on any roll
    expect(fought.models[m]).toBeUndefined()
    const shoot = makeState({ phase: 'shooting', active: 'B' })
    layout(shoot)
    const { ctx } = ctxOf(shoot)
    hookService.run(ctx, 'onPhaseStart', {})
    expect(fightOnDeathThreshold(shoot, BES)).toBeNull()
    const sm = shoot.units[BES].models[0]
    kill(shoot, [], byEnemy(ENEMY))
    expect(shoot.models[sm]).toBeUndefined()
  })

  it('LEA-032 other Votann units get nothing', () => {
    const s = fightState()
    expect(fightOnDeathThreshold(s, HK)).toBeNull()
    expect(fightOnDeathThreshold(s, PIO)).toBeNull()
  })
})

// ---------- AI ----------
describe('AI handling of Votann decisions', () => {
  const window = (w: string, trigger: Record<string, unknown>) =>
    ({ id: 'd', player: 'A', window: w, canPass: true, kind: 'stratagemWindow', context: { trigger, usable: [] }, options: [] }) as unknown as PendingDecision
  const use = (id: string, unitId: string): UseStratagemAction => ({ type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: id, targets: { unitIds: [unitId] } })

  it('LEA-AI the bot uses Payment in Kind when its units can reach the killer, Pan-Spectral Sweep on a shooter with a target, Skeinwrought under fire', () => {
    const s = makeState({ phase: 'shooting', active: 'B', a: { attachments: [] } })
    layout(s)
    placeUnit(s, ENEMY, [[-5, 0]])
    s.players.A.cp = 4
    s.phaseState.marks.push(`deathReaction:${JSON.stringify({ modelId: `${HK}#0`, unitId: HK, player: 'A', attackerUnitId: ENEMY })}`)
    expect(stratagemScore(s, 'A', window('attack.modelDestroyed', { unitId: HK }), use(PIK, HK), 1)).toBeGreaterThan(HOLD_CP_SCORE)

    const mine = makeState({ phase: 'shooting', active: 'A', a: { attachments: [] } })
    layout(mine)
    placeUnit(mine, ENEMY, [[-5, 0]])
    mine.players.A.cp = 4
    expect(stratagemScore(mine, 'A', window('shooting.start', {}), use(SWEEP, HK), 1)).toBeGreaterThan(HOLD_CP_SCORE)
    placeUnit(mine, ENEMY, [[40, 40]]); placeUnit(mine, ENEMY2, [[40, 40]])
    expect(stratagemScore(mine, 'A', window('shooting.start', {}), use(SWEEP, HK), 1)).toBe(-Infinity)

    expect(stratagemScore(s, 'A', window('shooting.targetsDeclared', { unitId: ENEMY, targetUnitId: HK }), use(SKEIN, HK), 1)).toBeGreaterThan(-Infinity)
  })

  const decide = async (s: GameState, pending: ChooseOptionDecision): Promise<string> => {
    s.pending = pending
    const legal = pending.options.map((o) => ({ ...o.action, decisionId: pending.id }) as Action)
    const a = await createUtilityDecider('normal', 'lov-ai').decide(engineView(s, pending.player), pending as PendingDecision, legal)
    return (a as { optionId: string }).optionId
  }
  it('LEA-AI the bot declines Mag-Riders when the battle ends before the arrival, takes Toil Earns on a marker', async () => {
    const s = makeState({ phase: 'fight', round: 5, active: 'B' })
    layout(s)
    placeUnit(s, PIO, [[-4, -12.5], [0, -12.5], [4, -12.5]])
    s.firstPlayer = 'A' // the Votann player moved first in round 5, so its Reinforcements step would come after the last turn
    const { ctx } = ctxOf(s)
    hookService.offerPicks!(ctx, 'turn.end', 'turn')
    const pending = pendingOption(s)!
    expect(pending.options.map((o) => o.id)).toContain('decline')
    expect(await decide(s, pending)).toBe('decline')

    const t = makeState({ round: 0, phase: 'setup' as GameState['phase'], active: 'A' })
    const c2 = ctxOf(t)
    c2.ctx.services.missions.onWindow(c2.ctx, 'deployment.unit', 'deployArmies')
    expect(['north', 'south', 'east', 'west']).toContain(await decide(t, pendingOption(t)!))
  })
})
