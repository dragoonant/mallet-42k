// Space Wolves: Thoryk's Void Hunters code hooks (docs/spec/factions/space-wolves.md §7, checklist SPA-*): Tireless Hunter, Keen Senses,
// Pack Ambush, plus the shared-mechanism rows (Fearsome Assault, Target Priority, Damaged) that run on the real patrol data.
// E1 / E2 engine changes are covered by space-wolves-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type PendingDecision, type PlayerSetup, type RollContext, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { resolveDeferredActivations } from '../../src/engine/deferred'
import { hookService } from '../../src/engine/hooks-impl'
import { setupModule } from '../../src/engine/setup'
import { fightModule } from '../../src/engine/phases/fight'
import { movementModule } from '../../src/engine/phases/movement'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const SW = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Wolves', faction: 'space-wolves', patrolId: 'sw.cp.thoryks-void-hunters', enhancementId: 'sw.e.tireless-hunter', secondaryId: 'sw.sec.mighty-saga',
  attachments: [{ leaderRef: 'battle-leader-thoryk', bodyguardRef: 'intercessor-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.wrath-of-the-emperor',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const THORYK = 'A:battle-leader-thoryk', INT = 'A:intercessor-squad', REIVER = 'A:reiver-squad', INVICTOR = 'A:invictor-tactical-warsuit'
const CAPTAIN = 'B:captain-octavius', TERM = 'B:terminator-squad', INFERNUS = 'B:infernus-squad'
const HUNTER = 'sw.e.tireless-hunter'
const KEEN = 'sw.s.keen-senses', AMBUSH = 'sw.s.pack-ambush'

function makeState(o: { a?: Partial<PlayerSetup>; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SW(o.a), B: SM() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'sw', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = 3
  s.players.B.cp = 3
  placeUnit(s, INT, { x: -12, z: -3, gap: 0.3 })
  placeUnit(s, THORYK, [[-14.5, -3]])
  placeUnit(s, REIVER, { x: -12, z: -12, gap: 0.3 })
  placeUnit(s, INVICTOR, [[-3, -12]])
  placeUnit(s, CAPTAIN, [[-6, 12]])
  placeUnit(s, TERM, { x: -6, z: 16, gap: 0.3 })
  placeUnit(s, INFERNUS, { x: 6, z: 12, gap: 0.3 })
  placeUnit(s, 'B:librarian-tantus', [[15, 12]])
  return s
}
const ctxOf = (s: GameState, dice: number[] = []) => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
const pendingOption = (s: GameState): ChooseOptionDecision => {
  if (s.pending?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${s.pending?.kind}`)
  return s.pending
}
function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = pendingOption(ctx.state)
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
// sum of the roll modifiers the engine's hooks give an attack at `hook`
function rollMod(ctx: EngineContext, s: GameState, hook: 'onWoundRoll' | 'onHitRoll', attacker: string, weaponPart: string, target: string): number {
  const modelId = s.units[attacker].models.find((id) => s.models[id].weapons.some((w) => w.includes(weaponPart))) as string
  const weaponId = s.models[modelId].weapons.find((w) => w.includes(weaponPart)) as string
  const roll = rollOf(4, hook === 'onWoundRoll' ? 'wound' : 'hit')
  return hookService.collect(ctx, hook, { attack: attackCtx(s, modelId, weaponId, target), roll })
    .reduce((n, r) => n + ((r.result as { modifier?: number }).modifier ?? 0), 0)
}
function rerollOf(ctx: EngineContext, s: GameState, attacker: string, weaponPart: string, target: string): string | undefined {
  const modelId = s.units[attacker].models.find((id) => s.models[id].weapons.some((w) => w.includes(weaponPart))) as string
  const weaponId = s.models[modelId].weapons.find((w) => w.includes(weaponPart)) as string
  return hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, modelId, weaponId, target), roll: rollOf(1, 'hit') })
    .map((r) => (r.result as { reroll?: string }).reroll).find((x) => !!x)
}
const targetsOf = (x: UseStratagemAction) => [...(x.targets.modelIds ?? []), ...(x.targets.unitIds ?? [])]
const ids = (xs: UseStratagemAction[], id: string) => xs.filter((x) => x.stratagemId === id).map(targetsOf)
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger = {}) => stratagemService.options(s, p, w, trigger)
function useStrat(s: GameState, ctx: EngineContext, player: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger: Record<string, string>, id: string, first: string): void {
  expect(ctx.window(w, 'k:' + id, ctx.order.only(player), trigger)).toBe(true)
  const pending = s.pending as PendingDecision & { options: { action: Action }[] }
  const opt = pending.options.map((o) => o.action as UseStratagemAction).find((x) => x.stratagemId === id && targetsOf(x)[0] === first)
  if (!opt) throw new Error(`no option ${id} ${first}`)
  const rej = stratagemService.validate(s, opt, pending) ?? (s.pending = null, stratagemService.handle(ctx, opt, pending))
  if (rej) throw new Error(rej.reason)
}
const firstOf = (s: GameState, unit: string, weaponPart: string): string =>
  s.units[unit].models.map((m) => s.models[m]).find((m) => m.weapons.some((w) => w.includes(weaponPart)))!.weapons.find((w) => w.includes(weaponPart)) as string
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

describe('Tireless Hunter (SPA-3.1)', () => {
  it('SPA-008 round 1 start: pick offered to the Space Wolves player (one option per enemy unit); Thoryk\'s ranged and melee attacks vs the picked unit get +1 to wound', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(true)
    const pending = pendingOption(s)
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id).sort()).toEqual([CAPTAIN, TERM, INFERNUS, 'B:librarian-tantus'].sort())
    answerOption(ctx, TERM)
    expect(s.pending).toBeNull()
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(false) // asked once
    expect(rollMod(ctx, s, 'onWoundRoll', THORYK, 'master-crafted-bolter', TERM)).toBe(1) // ranged
    expect(rollMod(ctx, s, 'onWoundRoll', THORYK, 'master-crafted-power-weapon', TERM)).toBe(1) // melee
  })

  it('SPA-009 Intercessors and other targets get no bonus; the pick is not offered in round 2; the bonus is still live in round 3', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'round.start', '1')
    answerOption(ctx, TERM)
    expect(rollMod(ctx, s, 'onWoundRoll', INT, 'bolt-rifle', TERM)).toBe(0) // other models of the attached unit get nothing
    expect(rollMod(ctx, s, 'onWoundRoll', THORYK, 'master-crafted-bolter', CAPTAIN)).toBe(0) // another unit
    s.round = 2
    expect(hookService.offerPicks(ctx, 'round.start', '2')).toBe(false)
    expect(s.pending).toBeNull()
    s.round = 3
    expect(hookService.offerPicks(ctx, 'round.start', '3')).toBe(false)
    expect(rollMod(ctx, s, 'onWoundRoll', THORYK, 'master-crafted-bolter', TERM)).toBe(1)
  })

  it('SPA-009 the bonus stops once the bearer is destroyed; a unit still in Reserves can be named', () => {
    const s = makeState({ round: 1, phase: 'command' })
    s.units[TERM].location = 'reserves'
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'round.start', '1')
    expect(pendingOption(s).options.map((o) => o.id)).toContain(TERM)
    answerOption(ctx, TERM)
    s.units[TERM].location = 'board'
    // Thoryk's own attack context, built while he is alive (a destroyed model leaves state.models)
    const bearer = s.units[THORYK].models[0]
    const weaponId = s.models[bearer].weapons.find((w) => w.includes('master-crafted-bolter')) as string
    const attack = attackCtx(s, bearer, weaponId, TERM)
    const woundMod = () => hookService.collect(ctx, 'onWoundRoll', { attack, roll: rollOf(4, 'wound') })
      .reduce((n, r) => n + ((r.result as { modifier?: number }).modifier ?? 0), 0)
    expect(woundMod()).toBe(1)
    removeModel(s, bearer)
    expect(s.models[bearer]).toBeUndefined()
    expect(woundMod()).toBe(0) // the gate sees a dead bearer
  })

  it('SPA-009 an invalid pick (own unit) is rejected', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'round.start', '1')
    const pending = pendingOption(s)
    s.pending = null
    const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: INT }, pending as PendingDecision)
    expect(rej?.code).toBe('E_INVALID_TARGET')
  })
})

describe('Keen Senses (SPA-5.2)', () => {
  it('SPA-017 offered at shooting.start for a unit that has not shot; grants IGNORES COVER to its ranged weapons and re-rolls hit rolls of 1 vs a CHARACTER unit only', () => {
    const s = makeState()
    const boltRifle = firstOf(s, INT, 'bolt-rifle')
    expect(ids(offered(s, 'A', 'shooting.start'), KEEN).some((t) => t[0] === INT)).toBe(true)
    const { ctx } = ctxOf(s)
    const model = s.units[INT].models.find((m) => s.models[m].weapons.includes(boltRifle)) as string
    const abilities = () => hookService.weaponAbilitiesFor!(s, model, s.weapons[boltRifle]).map((a) => a.ability)
    expect(abilities()).not.toContain('IGNORES_COVER')
    expect(rerollOf(ctx, s, INT, 'bolt-rifle', CAPTAIN)).toBeUndefined()
    useStrat(s, ctx, 'A', 'shooting.start', {}, KEEN, INT)
    expect(s.players.A.cp).toBe(2)
    expect(abilities()).toContain('IGNORES_COVER')
    expect(rerollOf(ctx, s, INT, 'bolt-rifle', CAPTAIN)).toBe('ones')
    expect(rerollOf(ctx, s, INT, 'bolt-rifle', TERM)).toBeUndefined()
    // another unit of the army gets nothing
    const reiverPistol = firstOf(s, REIVER, 'special-issue-bolt-pistol')
    const rmodel = s.units[REIVER].models.find((m) => s.models[m].weapons.includes(reiverPistol)) as string
    expect(hookService.weaponAbilitiesFor!(s, rmodel, s.weapons[reiverPistol]).map((a) => a.ability)).not.toContain('IGNORES_COVER')
  })

  it('SPA-017 not offered for a unit that already shot, nor outside the own Shooting phase', () => {
    const s = makeState()
    for (const h of [INT, THORYK]) s.units[h].turn.shotThisPhase = true
    expect(ids(offered(s, 'A', 'shooting.start'), KEEN).some((t) => t[0] === INT)).toBe(false)
    expect(ids(offered(s, 'A', 'shooting.start'), KEEN).some((t) => t[0] === REIVER)).toBe(true)
    const s2 = makeState({ phase: 'fight' })
    expect(ids(offered(s2, 'A', 'shooting.start'), KEEN)).toEqual([])
    const s3 = makeState({ active: 'B' })
    expect(ids(offered(s3, 'A', 'shooting.start'), KEEN)).toEqual([])
  })
})

describe('Pack Ambush (SPA-5.3)', () => {
  const pistolHit = (s: GameState, target: string) => {
    const wid = firstOf(s, REIVER, 'special-issue-bolt-pistol')
    s.phaseState.marks.push(`hitBy:${REIVER}:${wid}:${target}`)
  }

  it('SPA-018 after the Reivers shoot and hit an enemy unit: offered, costs 1 CP, and the Battle-shock test subtracts 2 (2D6 8 passes, 7 fails vs Ld 6+)', () => {
    for (const [dice, shocked] of [[[4, 4], false], [[3, 4], true]] as const) {
      const s = makeState()
      pistolHit(s, INFERNUS)
      expect(ids(offered(s, 'A', 'shooting.attacksResolved', { unitId: REIVER }), AMBUSH).some((t) => t[0] === REIVER && t[1] === INFERNUS)).toBe(true)
      const { ctx, events } = ctxOf(s, [...dice])
      useStrat(s, ctx, 'A', 'shooting.attacksResolved', { unitId: REIVER }, AMBUSH, REIVER)
      expect(s.players.A.cp).toBe(2)
      expect(s.units[INFERNUS].battleShocked).toBe(shocked)
      expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === AMBUSH && e.targetUnitId === INFERNUS)).toBe(true)
    }
  })

  it('SPA-019 not offered: enemy not hit by the Reivers\' pistol, a non-Reiver unit just shot, or the enemy is within Engagement Range of the Reivers', () => {
    const s = makeState()
    // nothing hit yet
    expect(ids(offered(s, 'A', 'shooting.attacksResolved', { unitId: REIVER }), AMBUSH)).toEqual([])
    pistolHit(s, INFERNUS)
    // a different unit of ours just finished shooting
    expect(ids(offered(s, 'A', 'shooting.attacksResolved', { unitId: INT }), AMBUSH)).toEqual([])
    // hit by another weapon only
    const s2 = makeState()
    s2.phaseState.marks.push(`hitBy:${REIVER}:${firstOf(s2, INT, 'bolt-rifle')}:${INFERNUS}`)
    expect(ids(offered(s2, 'A', 'shooting.attacksResolved', { unitId: REIVER }), AMBUSH)).toEqual([])
    // enemy within Engagement Range of the Reivers
    const s3 = makeState()
    pistolHit(s3, INFERNUS)
    const r = s3.models[s3.units[REIVER].models[0]]
    const e = s3.models[s3.units[INFERNUS].models[0]]
    e.pos = { x: r.pos.x, y: 0, z: r.pos.z + r.base.radius + e.base.radius + 0.5 }
    expect(ids(offered(s3, 'A', 'shooting.attacksResolved', { unitId: REIVER }), AMBUSH)).toEqual([])
  })
})

describe('shared mechanisms on the real patrol data', () => {
  it('SPA-021 Fearsome Assault: at the start of the Fight phase each enemy unit in Engagement Range of the Reivers takes one Battle-shock test; unengaged enemies do not', () => {
    const s = makeState({ phase: 'fight' })
    const r = s.models[s.units[REIVER].models[0]]
    const e = s.models[s.units[INFERNUS].models[0]]
    e.pos = { x: r.pos.x, y: 0, z: r.pos.z + r.base.radius + e.base.radius + 0.5 }
    const { ctx, events } = ctxOf(s, [1, 1, 1, 1, 1, 1])
    hookService.run(ctx, 'onPhaseStart', {})
    expect(events.filter((e) => e.type === 'BattleShockTested').map((e) => e.unitId)).toEqual([INFERNUS])
  })

  it('SPA-022 Damaged: the Invictor at 4 W subtracts 1 from its Hit rolls, at 5 W it does not', () => {
    const s = makeState()
    const { ctx } = ctxOf(s)
    const model = s.units[INVICTOR].models[0]
    s.models[model].woundsRemaining = 5
    expect(rollMod(ctx, s, 'onHitRoll', INVICTOR, 'heavy-bolter', TERM)).toBe(0)
    s.models[model].woundsRemaining = 4
    expect(rollMod(ctx, s, 'onHitRoll', INVICTOR, 'heavy-bolter', TERM)).toBe(-1)
  })

  it('SPA-020 Target Priority: the Thoryk unit may shoot and charge after Falling Back; the Reivers (no such ability) may not', () => {
    const s = makeState()
    const { ctx } = ctxOf(s)
    for (const u of [INT, THORYK, REIVER]) s.units[u].turn.moveType = 'fallBack'
    const allowed = (unit: string, check: 'shoot' | 'charge') =>
      hookService.collect(ctx, 'onEligibility', { queryUnitId: unit, check }).some((r) => (r.result as { allow?: boolean }).allow === true)
    expect(allowed(INT, 'shoot')).toBe(true)
    expect(allowed(THORYK, 'charge')).toBe(true)
    expect(allowed(REIVER, 'shoot')).toBe(false)
    expect(allowed(REIVER, 'charge')).toBe(false)
  })
})

describe('A Warrior\'s Death (SPA-5.1)', () => {
  it('SPA-016 offered after an enemy unit picks targets in the Fight phase (target = the attacked ADEPTUS ASTARTES unit); not in the Shooting phase', () => {
    const WD = 'sw.s.a-warriors-death'
    const s = makeState({ phase: 'fight', active: 'B' })
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: 'B', counterOffensive: false }
    const opts = offered(s, 'A', 'fight.targetsDeclared', { unitId: CAPTAIN, targetUnitId: INT })
    expect(ids(opts, WD).some((t) => t[0] === INT)).toBe(true)
    const s2 = makeState({ phase: 'shooting', active: 'B' })
    expect(ids(offered(s2, 'A', 'shooting.targetsDeclared', { unitId: CAPTAIN, targetUnitId: INT }), WD)).toEqual([])
  })
})

// ---------- A Warrior's Death (SPA-015/016), end to end ----------
describe('A Warrior\'s Death in a real Fight phase (SPA-5.1)', () => {
  const WD = 'sw.s.a-warriors-death'
  // B's Captain is fighting A's Intercessors; A (the defender) uses A Warrior's Death on them
  function armed(dice: number[]) {
    const s = makeState({ phase: 'fight', active: 'B' })
    const victim = s.units[INT].models[0]
    const captainModel = s.models[s.units[CAPTAIN].models[0]]
    const v = s.models[victim]
    captainModel.pos = { x: v.pos.x, y: 0, z: v.pos.z + v.base.radius + captainModel.base.radius + 0.4 }
    s.models[victim].woundsRemaining = 1
    s.phaseState.fight = { step: 'remaining', subStep: 'attacks', currentUnitId: CAPTAIN, fought: [], nextToSelect: 'A', counterOffensive: false }
    const { ctx, events } = ctxOf(s, dice)
    useStrat(s, ctx, 'A', 'fight.targetsDeclared', { unitId: CAPTAIN, targetUnitId: INT }, WD, INT)
    return { s, ctx, events, victim }
  }

  it('SPA-015 roll 4: the destroyed Intercessor stays, fights once the Captain has finished, then is removed; no Miracle-die prompt', () => {
    const { s, ctx, events, victim } = armed([4, ...Array.from({ length: 40 }, () => 6)])
    expect(s.players.A.cp).toBe(2)
    expect(s.pending).toBeNull() // nothing to choose: the Sororitas Miracle-die question does not exist here
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: CAPTAIN, modelId: null, kind: 'melee' })
    expect(s.models[victim]?.removalDeferred).toBe(true)
    expect(of(events, 'ModelRemovalDeferred').map((e) => e.modelId)).toEqual([victim])
    // the log names this stratagem, not the Sororitas one
    expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === WD && /Warrior's Death/.test(e.summary) && !/Martyr/.test(e.summary))).toBe(true)
    // the Captain finishes: the deferred Intercessor gets a declareTargets decision for itself alone
    expect(resolveDeferredActivations(ctx, CAPTAIN)).toBe('awaiting')
    const pending = s.pending
    expect(pending?.kind).toBe('declareTargets')
    if (pending?.kind !== 'declareTargets') return
    expect(pending.player).toBe('A')
    expect(pending.context.unitId).toBe(INT)
    expect(pending.context.weapons.every((w) => w.modelId === victim)).toBe(true)
    const w = pending.context.weapons.find((x) => x.legalTargets.includes(CAPTAIN))!
    expect(w).toBeTruthy()
    s.pending = null
    const rej = fightModule.handle(ctx, { type: 'declareTargets', player: 'A', decisionId: pending.id, unitId: INT, targets: [{ modelId: victim, weaponId: w.weaponId, targetUnitId: CAPTAIN, attacks: w.attacks as number }] }, pending)
    expect(rej).toBeUndefined()
    driveAttack(ctx)
    expect(of(events, 'AttackSequenceEnded').some((e) => e.unitId === INT)).toBe(true)
    expect(resolveDeferredActivations(ctx, CAPTAIN)).toBe('done')
    expect(s.models[victim]).toBeUndefined()
    expect(s.phaseState.deferredRemovals).toEqual([])
  })

  it('SPA-015 roll 3: the destroyed Intercessor is removed at once, no deferral', () => {
    const { s, ctx, events, victim } = armed([3])
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: CAPTAIN, modelId: null, kind: 'melee' })
    expect(s.models[victim]).toBeUndefined()
    expect(of(events, 'ModelRemovalDeferred')).toHaveLength(0)
    expect(s.phaseState.deferredRemovals ?? []).toEqual([])
  })

  it('SPA-016 a model whose unit already fought this phase gets no roll and is removed normally (an empty script throws on any die)', () => {
    const { s, ctx, events, victim } = armed([])
    s.units[INT].turn.foughtThisPhase = true
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: CAPTAIN, modelId: null, kind: 'melee' })
    expect(s.models[victim]).toBeUndefined()
    expect(of(events, 'ModelRemovalDeferred')).toHaveLength(0)
  })
})

// ---------- scoring: Reiving Conquerors (SPA-013/014) ----------
describe('Reiving Conquerors (SPA-4.2)', () => {
  const RC = { secondaryId: 'sw.sec.reiving-conquerors' }
  const neutral = (s: GameState) => Object.values(s.objectives).filter((o) => !o.removed && o.home === null)
  function control(s: GameState, a: number, b: number): void {
    neutral(s).forEach((o, i) => { o.controller = i < a ? 'A' : i < a + b ? 'B' : null })
  }
  function score(s: GameState): number {
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }

  it('SPA-013 end of the opponent\'s turn: 1 v 1 -> 3, 2 v 1 -> 3, 1 v 2 -> 0, 0 v 0 -> 0; home markers are ignored; round 1 counts', () => {
    for (const [round, a, b, vp] of [[2, 1, 1, 3], [2, 2, 1, 3], [2, 1, 2, 0], [2, 0, 0, 0], [2, 0, 1, 0], [1, 1, 0, 3]] as const) {
      const s = makeState({ a: RC, round, phase: 'fight', active: 'B' })
      expect(neutral(s).length).toBeGreaterThanOrEqual(3)
      control(s, a, b)
      for (const o of Object.values(s.objectives)) if (o.home) o.controller = o.home === 'A' ? 'B' : 'A' // home markers held by the wrong side: must not matter
      expect(score(s), `${a} v ${b} round ${round}`).toBe(vp)
    }
  })

  it('SPA-014 end of the Space Wolves player\'s own turn scores nothing', () => {
    const s = makeState({ a: RC, round: 2, phase: 'fight', active: 'A' })
    control(s, 2, 0)
    expect(score(s)).toBe(0)
  })
})

// ---------- Oath of Moment, Scouts, Deep Strike (SPA-004/006/007) ----------
describe('army and datasheet abilities', () => {
  it('SPA-004 Oath of Moment: an Intercessor or Invictor attack against the Oath target re-rolls the hit roll; against another unit it does not', () => {
    const s = makeState()
    const { ctx } = ctxOf(s)
    const rerollsAll = (unit: string, weaponPart: string, target: string, oathTarget: boolean): boolean => {
      const modelId = s.units[unit].models.find((id) => s.models[id].weapons.some((w) => w.includes(weaponPart))) as string
      const weaponId = s.models[modelId].weapons.find((w) => w.includes(weaponPart)) as string
      const attack = { ...attackCtx(s, modelId, weaponId, target), oathTarget }
      return hookService.collect(ctx, 'onHitRoll', { attack, roll: rollOf(2, 'hit') })
        .some(({ result }) => (result as { reroll?: string }).reroll === 'all')
    }
    expect(rerollsAll(INT, 'bolt-rifle', TERM, true)).toBe(true)
    expect(rerollsAll(INVICTOR, 'heavy-bolter', TERM, true)).toBe(true)
    expect(rerollsAll(INT, 'bolt-rifle', TERM, false)).toBe(false)
    expect(rerollsAll(INVICTOR, 'twin-ironhail-autocannon', INFERNUS, false)).toBe(false)
  })

  function preBattle(a: Partial<PlayerSetup>): GameState {
    const s = makeState({ phase: 'deployment', a })
    s.step = 'preBattle'
    s.firstPlayer = 'A'
    for (const id of Object.keys(s.units)) if (s.units[id].location !== 'reserves') placeUnit(s, id, [[s.units[id].player === 'A' ? -12 : 12, 0]])
    return s
  }
  // runs the Scouts offers, passing each, and returns who was offered how far
  function scoutOffers(s: GameState): Record<string, number> {
    const out: Record<string, number> = {}
    const { ctx } = ctxOf(s)
    for (let guard = 0; guard < 10; guard++) {
      const r = setupModule.advance(ctx)
      if (r !== 'pending') break
      const p = s.pending
      if (p?.kind !== 'moveUnit') throw new Error(`expected moveUnit, got ${p?.kind}`)
      out[p.context.unitId] = p.constraints.maxDistance
      s.pending = null
      const rej = setupModule.handle(ctx, { type: 'pass', player: p.player, decisionId: p.id }, p)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    }
    return out
  }

  it('SPA-006 Scouts: the Reivers are offered a 6" move and the Invictor an 8" one; the attached Thoryk unit has none; Reivers in Reserves are not offered Scouts', () => {
    expect(scoutOffers(preBattle({}))).toEqual({ [REIVER]: 6, [INVICTOR]: 8 })
    const s = preBattle({ reserves: ['reiver-squad'] })
    s.units[REIVER].location = 'reserves' // makeState deploys everyone; send the Reivers back to Reserves
    expect(scoutOffers(s)).toEqual({ [INVICTOR]: 8 })
  })

  it('SPA-007 Deep Strike: Reivers may start in Reserves and arrive more than 9" from enemies from round 2; Intercessors, Thoryk and the Invictor may not', () => {
    const build = (ref: string, attachments: PlayerSetup['attachments'] = []) => createGameState(
      { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SW({ reserves: [ref], attachments }), B: SM() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' },
      bundle, 'sw-ds', ENGINE_VERSION,
    )
    const s = build('reiver-squad')
    expect(s.units[REIVER].location).toBe('reserves')
    for (const ref of ['intercessor-squad', 'battle-leader-thoryk', 'invictor-tactical-warsuit']) expect(() => build(ref)).toThrow(/Deep Strike/)
    // arrival: round 2 Movement phase, reinforcements step
    s.round = 2; s.activePlayer = 'A'; s.phase = 'movement'; s.phaseState = emptyPhaseState(); s.step = 'reinforcements'
    const spots: Record<string, [number, number]> = {
      [INT]: [-20, -12], [THORYK]: [-17, -12], [INVICTOR]: [-12, -12], [CAPTAIN]: [0, 0], [TERM]: [20, -12], [INFERNUS]: [20, -8], 'B:librarian-tantus': [20, -4],
    }
    for (const [id, pos] of Object.entries(spots)) placeUnit(s, id, [pos])
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    const pending = s.pending
    expect(pending?.kind).toBe('deployUnit')
    if (pending?.kind !== 'deployUnit') return
    expect(pending.context.unitIds).toContain(REIVER)
    const placeAt = (x: number, z: number) => s.units[REIVER].models.map((id, i) => ({ modelId: id, pos: { x: x + i * 1.5, y: 0, z } }))
    const check = (x: number, z: number) => movementModule.validate!(s, { type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: REIVER, placements: placeAt(x, z) } as Action, pending)
    expect(check(4, 6)?.reason).toMatch(/9/) // about 7" from Captain Octavius: inside 9"
    expect(check(-18, 12)).toBeNull() // well clear
  })
})

// ---------- weapons (SPA-023/024) and Invictor Deadly Demise (SPA-025) ----------
describe('weapons and Deadly Demise', () => {
  const SIX = Array.from({ length: 80 }, () => 6)
  const targetOf = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
  const open = (s: GameState) => { s.phase = 'shooting'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState(); s.players.A.cp = 0; s.players.B.cp = 0 }
  const modelWith = (s: GameState, unit: string, part: string) => s.units[unit].models.find((id) => s.models[id].weapons.some((w) => w.includes(part))) as string
  function shoot(s: GameState, ctx: EngineContext, unit: string, part: string, target: string, attacks: number | null = null): void {
    const m = modelWith(s, unit, part)
    const weaponId = s.models[m].weapons.find((w) => w.includes(part)) as string
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [targetOf(m, weaponId, target, attacks)] })
    driveAttack(ctx)
  }

  it('SPA-023 twin ironhail heavy stubber: 6 shots at half range, 3 beyond; failed wound rolls are re-rolled (Twin-linked)', () => {
    const run = (targetX: number, dice: number[]) => {
      const s = makeState(); open(s)
      placeUnit(s, INVICTOR, [[-12, -11]])
      placeUnit(s, TERM, { x: targetX, z: -11, gap: 0.3 })
      const { ctx, events } = ctxOf(s, dice)
      shoot(s, ctx, INVICTOR, 'twin-ironhail-heavy-stubber', TERM)
      return { s, events }
    }
    const near = run(-2, SIX)
    expect(of(near.events, 'HitRolled')).toHaveLength(6)
    const far = run(20, SIX)
    expect(of(far.events, 'HitRolled')).toHaveLength(3)
    // 6 hits (6), the first wound roll fails (1; S4 vs T5 needs 5+) and is re-rolled
    const tl = run(-2, [6, 6, 6, 6, 6, 6, 1, 6, 6, 6, 6, 6, ...SIX])
    const wound = of(tl.events, 'DiceRolled').find((e) => e.roll.purpose === 'wound')!.roll
    const twin = of(tl.events, 'DiceRerolled').filter((e) => e.rollId === wound.id && e.source === 'wound')
    expect(twin).toHaveLength(1)
    expect(twin[0]).toMatchObject({ before: [1], indexes: [0] }) // only the failed wound die is re-rolled
  })

  it('SPA-023 fragstorm grenade launcher [BLAST]: +1 Attack per 5 models in the target unit', () => {
    const hits = (target: string, trim?: number) => {
      const s = makeState(); open(s)
      placeUnit(s, INVICTOR, [[-12, -11]])
      placeUnit(s, target, target === CAPTAIN ? [[-2, -11]] : { x: -2, z: -11, gap: 0.3 })
      if (trim !== undefined) for (const m of s.units[target].models.slice(trim)) removeModel(s, m)
      const { ctx, events } = ctxOf(s, [3, ...SIX]) // D6 = 3
      shoot(s, ctx, INVICTOR, 'fragstorm-grenade-launcher', target)
      return of(events, 'HitRolled').length
    }
    expect(hits(TERM)).toBe(3 + 1) // 5 models
    expect(hits(TERM, 4)).toBe(3) // 4 models
    expect(hits(CAPTAIN)).toBe(3)
  })

  it('SPA-023 Reiver special issue bolt pistol and combat knife carry PRECISION; the pistol lets the attacker pick a visible attached CHARACTER', () => {
    const base = makeState()
    for (const w of ['sw.w.special-issue-bolt-pistol', 'sw.w.combat-knife']) expect(base.weapons[w].abilities.map((a) => a.ability)).toContain('PRECISION')
    // Octavius leads the Terminators: the Reivers' pistol offers the allocation choice
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
      players: { A: SW(), B: { ...SM(), attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const p = createGameState(setup, bundle, 'sw-prec', ENGINE_VERSION)
    p.round = 2; open(p)
    placeUnit(p, REIVER, { x: -12, z: -11, gap: 0.3 })
    placeUnit(p, TERM, { x: -6, z: -11, gap: 0.3 })
    placeUnit(p, CAPTAIN, [[-5, -9.5]])
    const { ctx } = ctxOf(p, SIX)
    const seen: PendingDecision[] = []
    const m = modelWith(p, REIVER, 'special-issue-bolt-pistol')
    const weaponId = p.models[m].weapons.find((w) => w.includes('special-issue-bolt-pistol')) as string
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: REIVER, overwatch: false, targets: [targetOf(m, weaponId, TERM, 1)] })
    driveAttack(ctx, seen)
    expect(seen.some((d) => d.kind === 'allocateAttack')).toBe(true)
  })

  it('SPA-024 bolt rifle: Intercessors may Advance and still shoot (Assault); Remaining Stationary gives +1 to hit (Heavy)', () => {
    const s = makeState(); open(s)
    const { ctx } = ctxOf(s)
    s.units[INT].turn.moveType = 'advance'
    const abil = hookService.weaponAbilitiesFor!(s, modelWith(s, INT, 'bolt-rifle'), s.weapons[firstOf(s, INT, 'bolt-rifle')]).map((a) => a.ability)
    expect(abil).toEqual(expect.arrayContaining(['ASSAULT', 'HEAVY']))
    expect(hookService.collect(ctx, 'onEligibility', { queryUnitId: INT, check: 'shoot' }).some((r) => (r.result as { allow?: boolean }).allow === false)).toBe(false)
    const firstHit = (moveType: 'stationary' | 'normal') => {
      const t = makeState(); open(t)
      t.units[INT].turn.moveType = moveType
      placeUnit(t, TERM, { x: -2, z: -3, gap: 0.3 })
      const c = ctxOf(t, [2, ...SIX])
      shoot(t, c.ctx, INT, 'bolt-rifle', TERM, 1)
      return of(c.events, 'HitRolled')[0]
    }
    expect(firstHit('stationary')).toMatchObject({ die: 2, final: 3 })
    expect(firstHit('normal')).toMatchObject({ die: 2, final: 2 })
  })

  it('SPA-025 Invictor Deadly Demise D3: on a 6, D3 mortal wounds to each unit within 6"; a 5 does nothing', () => {
    const run = (dice: number[]) => {
      const s = makeState(); open(s); s.activePlayer = 'B'
      placeUnit(s, INVICTOR, [[8, -11]])
      placeUnit(s, TERM, { x: 12, z: -11, gap: 0.3 })
      placeUnit(s, INFERNUS, [[-20, 13]])
      const { ctx, events } = ctxOf(s, dice)
      attackService.destroyModel(ctx, s.units[INVICTOR].models[0], { player: 'B', unitId: CAPTAIN, modelId: s.units[CAPTAIN].models[0], kind: 'ranged' })
      return { s, demise: of(events, 'DeadlyDemiseRolled')[0] }
    }
    const boom = run([6, 6]) // trigger 6, D3 roll 6 -> 3
    expect(boom.demise).toMatchObject({ unitId: INVICTOR, die: 6, exploded: true })
    expect(boom.demise.affected).toContain(TERM)
    expect(boom.demise.affected).not.toContain(INFERNUS)
    const queue = boom.s.phaseState.attack?.mortalQueue ?? []
    expect(queue.find((q) => q.targetUnitId === TERM)?.count).toBe(3)
    const small = run([6, 1]) // D3 roll 1 -> 1
    expect((small.s.phaseState.attack?.mortalQueue ?? []).find((q) => q.targetUnitId === TERM)?.count).toBe(1)
    const quiet = run([5])
    expect(quiet.demise).toMatchObject({ die: 5, exploded: false, affected: [] })
  })
})

// drives the attack sequence; an allocateAttack (Precision) offer is taken for its first eligible model
function driveAttack(ctx: EngineContext, seen: PendingDecision[] = []): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without decision')
    seen.push(pending)
    let action: Action
    if (pending.kind === 'allocateAttack') action = { type: 'allocateAttack', player: pending.player, decisionId: pending.id, modelId: pending.context.eligibleModels[0] }
    else if (pending.kind !== 'stratagemWindow' && pending.kind !== 'reactionWindow' && pending.kind !== 'commandReroll' && 'options' in pending && pending.options.length > 0) action = pending.options[0].action
    else action = { type: 'pass', player: pending.player, decisionId: pending.id }
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}
