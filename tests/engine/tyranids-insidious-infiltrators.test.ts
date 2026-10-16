// Insidious Infiltrators code hooks (docs/spec/factions/tyranids--insidious-infiltrators.md 7, checklist INF-*): Shadow in the Warp, Neural
// Disruption, Neurogoad, Psychological Saboteur, Feeder Tendrils, Psionic Phantoms, Pheromonal Trace, Alpha Predation, Left to Last.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type AttackContext, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { hookService } from '../../src/engine/hooks-impl'
import { psionicPhantomsStep, phantomsOverwatchArm, phantomsOverwatchStep, PHANTOMS_PENDING_MARK } from '../../src/engine/factions/tyranids'
import { leaderService } from '../../src/engine/leaders'
import { chargeModule } from '../../src/engine/phases/charge'
import { movementModule, unitMovesThroughModels } from '../../src/engine/phases/movement'
import { buildShootingWeaponEntries, shootingModule } from '../../src/engine/phases/shooting'
import { hasCoreAbility } from '../../src/engine/state'
import { effectiveCost, ignoresLimit } from '../../src/engine/stratagems'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TYR = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Tyranids', faction: 'tyranids', patrolId: 'tyr.cp.insidious-infiltrators', enhancementId: 'tyr.e.neurogoad', secondaryId: 'tyr.sec.alpha-predation',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const DS = 'A:deaths-shadow', LIC = 'A:lictor', LEAP = 'A:leapers-a'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'
const NEURAL = 'tyr.a.neural-disruption', SHADOW = 'tyr.a.shadow-in-the-warp', GOAD = 'tyr.e.neurogoad.effect'

function makeState(o: { round?: number; a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; bundle?: DataBundle } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TYR(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, o.bundle ?? bundle, 'inf-hooks', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}
function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
function ctxOf(s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
const pendingOption = (s: GameState): ChooseOptionDecision | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)

const LEAP2 = 'A:leapers-b', LEAP3 = 'A:leapers-c'
const TAIL = Array(60).fill(2)
const radius = (s: GameState, unitId: string): number => s.models[s.units[unitId].models[0]].base.radius
const declare = (s: GameState, unitId: string, targetUnitId: string, kind: 'ranged' | 'melee', attacks: number | null = null) => {
  const m = s.models[s.units[unitId].models[0]]
  const weaponId = m.weapons.find((w) => s.weapons[w].kind === kind)!
  return { modelId: m.id, weaponId, targetUnitId, profileGroup: null, attacks }
}
// the weapon of the unit's first model with a patched Skill (state copy only; the shared bundle is never mutated)
function setSkill(s: GameState, unitId: string, kind: 'ranged' | 'melee', skill: number): void {
  const wid = s.models[s.units[unitId].models[0]].weapons.find((w) => s.weapons[w].kind === kind)!
  s.weapons = { ...s.weapons, [wid]: { ...s.weapons[wid], skill } as never }
}
function patchKeyword(s: GameState, unitId: string, keyword: string): void {
  const ds = s.datasheets[s.units[unitId].datasheetId]
  s.datasheets = { ...s.datasheets, [ds.id]: { ...ds, keywords: [...ds.keywords, keyword] } }
}
function driveAttack(ctx: EngineContext, events: GameEvent[]): GameEvent[] {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending || !('options' in pending) || pending.options.length === 0) throw new Error('driveAttack: nothing to answer')
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, pending.options[0].action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return events
}
// uses a stratagem for real (validate + handle) from a synthetic window decision
function useStratagem(ctx: EngineContext, player: 'A' | 'B', window: Parameters<typeof stratagemService.options>[2], stratagemId: string, unitId: string): void {
  const s = ctx.state
  const opt = stratagemService.options(s, player, window, {}).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === unitId)
  if (!opt) throw new Error(`${stratagemId} not offered for ${unitId}`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
  const act = { ...opt, decisionId: 'd:1' } as never
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}

// declines picks until the one with `abilityId` is open; returns false when it never comes up
function reachPick(ctx: EngineContext, window: Parameters<typeof hookService.offerPicks>[1], abilityId: string): boolean {
  const s = ctx.state
  if (!s.pending && !hookService.offerPicks(ctx, window, 'start')) return false
  for (let i = 0; i < 6; i++) {
    const p = pendingOption(s)
    if (!p) return false
    if (p.context.abilityId === abilityId) return true
    answer(ctx, 'decline')
    if (!s.pending && !hookService.offerPicks(ctx, window, 'start')) return false
  }
  return false
}

function attackOf(s: GameState, attackerUnit: string, targetUnit: string, kind: 'ranged' | 'melee'): AttackContext {
  const am = s.models[s.units[attackerUnit].models[0]]
  const wid = am.weapons.find((w) => s.weapons[w].kind === kind)!
  return {
    kind, overwatch: false, attackerUnitId: attackerUnit, attackerModelId: am.id, weapon: weaponService.effectiveWeapon(s, am.id, wid),
    targetUnitId: targetUnit, targetModelId: s.units[targetUnit].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget: false,
    attackerInEngagement: kind === 'melee',
  }
}
const rollCtx = (purpose: 'hit' | 'wound' | 'save' | 'charge') => ({ purpose, roll: null as never, dieIndex: 0, unmodified: 4, rerolled: false })
function mods(ctx: EngineContext, attack: AttackContext, hook: 'onHitRoll' | 'onWoundRoll'): { modifier: number; reroll?: string } {
  const out = hookService.collect(ctx, hook, { attack, roll: rollCtx(hook === 'onHitRoll' ? 'hit' : 'wound') } as never)
  let modifier = 0
  let reroll: string | undefined
  for (const { result } of out) {
    if (result.kind !== 'roll') continue
    modifier += result.modifier ?? 0
    if (result.reroll) reroll = result.reroll
  }
  return { modifier, reroll }
}

// =====================================================================================================================
describe('Shadow in the Warp and Neural Disruption (INF-2.1, INF-6.1)', () => {
  it('INF-004 INF-2.1: Shadow in the Warp is offered at command.start; used, every enemy board unit tests once', () => {
    const s = makeState()
    phase(s, 'command', 'B')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, BOYZ, [[-20, 8]])
    placeUnit(s, BOYZ2, [[-20, -8]])
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6])
    expect(reachPick(ctx, 'command.start', SHADOW)).toBe(true)
    answer(ctx, 'use')
    expect(of(events, 'BattleShockTested').map((e) => e.unitId).sort()).toEqual([BOYZ, BOYZ2].sort())
  })

  it('INF-005 INF-6.1: Neural Disruption offers an enemy unit 11.9in away, not one 12.1in away; the pick takes one 2D6 Battle-shock test', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, BOYZ, [[11.9 + 0.7, 0]])
    placeUnit(s, BOYZ2, [[0, 15]])
    const { ctx, events } = ctxOf(s, [3, 3])
    expect(reachPick(ctx, 'command.start', NEURAL)).toBe(true)
    expect(pendingOption(s)!.options.map((o) => o.id)).toEqual([BOYZ, 'decline'])
    answer(ctx, BOYZ)
    expect(of(events, 'BattleShockTested').filter((e) => e.unitId === BOYZ)).toHaveLength(1)
    expect(of(events, 'DiceRolled')[0].roll.dice).toHaveLength(2)
  })

  it('INF-006 INF-6.1: Neural Disruption is not offered in the opponent Command phase, nor twice in one phase', () => {
    const s = makeState()
    phase(s, 'command', 'B')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, BOYZ, [[5, 0]])
    const { ctx } = ctxOf(s, [3, 3])
    expect(reachPick(ctx, 'command.start', NEURAL)).toBe(false)
    s.pending = null
    phase(s, 'command', 'A')
    expect(reachPick(ctx, 'command.start', NEURAL)).toBe(true)
    answer(ctx, BOYZ)
    s.pending = null
    expect(reachPick(ctx, 'command.start', NEURAL)).toBe(false)
  })
})

// =====================================================================================================================
describe('Neurogoad (INF-3.1, 3.3)', () => {
  it('INF-015 INF-3.1: a friendly unit 11in away is offered, one 12.5in away is not; the pick grants hit and charge re-rolls, kept through the opponent Fight phase, gone when the Tyranid turn starts', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[11 + 0.7, 0]])
    placeUnit(s, LEAP, [[0, 16]])
    placeUnit(s, BOYZ, [[-30, 0]])
    const { ctx } = ctxOf(s, [])
    expect(reachPick(ctx, 'command.start', GOAD)).toBe(true)
    expect(pendingOption(s)!.options.map((o) => o.id).sort()).toEqual([DS, LIC, 'decline'].sort())
    answer(ctx, LIC)
    expect(mods(ctx, attackOf(s, LIC, BOYZ, 'melee'), 'onHitRoll').reroll).toBe('all')
    const charge = () => hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: LIC, targetUnitIds: [BOYZ], roll: rollCtx('charge') } as never)
    expect(charge().some(({ result }) => result.kind === 'roll' && result.reroll === 'all')).toBe(true)
    expect(mods(ctx, attackOf(s, DS, BOYZ, 'melee'), 'onHitRoll').reroll).toBeUndefined()
    // the Tyranid turn ends, then the opponent's Fight phase: the phase and turn expiries do not touch it
    phase(s, 'fight', 'B')
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    ctx.services.effects.expire(ctx, 'turnEnd', 'A')
    expect(mods(ctx, attackOf(s, LIC, BOYZ, 'melee'), 'onHitRoll').reroll).toBe('all')
    // the opponent's own turn start does not expire it; the Tyranid player's next turn start does
    ctx.services.effects.expire(ctx, 'nextOwnTurn', 'B')
    expect(mods(ctx, attackOf(s, LIC, BOYZ, 'melee'), 'onHitRoll').reroll).toBe('all')
    ctx.services.effects.expire(ctx, 'nextOwnTurn', 'A')
    expect(mods(ctx, attackOf(s, LIC, BOYZ, 'melee'), 'onHitRoll').reroll).toBeUndefined()
    expect(charge().some(({ result }) => result.kind === 'roll' && result.reroll === 'all')).toBe(false)
  })

  it('INF-016 INF-3.3: Neurogoad is offered once per own Command phase and never in the opponent Command phase', () => {
    const s = makeState()
    phase(s, 'command', 'B')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[5, 0]])
    placeUnit(s, BOYZ, [[-30, 0]])
    const { ctx } = ctxOf(s, [])
    expect(reachPick(ctx, 'command.start', GOAD)).toBe(false)
    s.pending = null
    phase(s, 'command', 'A')
    expect(reachPick(ctx, 'command.start', GOAD)).toBe(true)
    answer(ctx, 'decline')
    s.pending = null
    expect(reachPick(ctx, 'command.start', GOAD)).toBe(false)
  })
})

// =====================================================================================================================
describe('Psychological Saboteur (INF-6.2)', () => {
  it('INF-007 INF-6.2: a Battle-shocked enemy unit within 12in of Death Shadow takes -1 to hit; not shocked, or out of range, no effect', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[0, 3]])
    placeUnit(s, BOYZ, [[10, 0]])
    const { ctx } = ctxOf(s, [])
    const atk = attackOf(s, BOYZ, LIC, 'ranged')
    expect(mods(ctx, atk, 'onHitRoll').modifier).toBe(0)
    s.units[BOYZ].battleShocked = true
    expect(mods(ctx, atk, 'onHitRoll').modifier).toBe(-1)
    placeUnit(s, BOYZ, [[16, 0]])
    expect(mods(ctx, atk, 'onHitRoll').modifier).toBe(0)
  })

  it('INF-008 INF-6.2: friendly TYRANIDS attacks against a shocked enemy within 12in of Death Shadow get +1 to wound', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[20, 0]])
    placeUnit(s, BOYZ, [[10, 0]])
    s.units[BOYZ].battleShocked = true
    const { ctx } = ctxOf(s, [])
    const atk = attackOf(s, LIC, BOYZ, 'melee')
    expect(mods(ctx, atk, 'onWoundRoll').modifier).toBe(1)
    placeUnit(s, BOYZ, [[16, 0]])
    expect(mods(ctx, atk, 'onWoundRoll').modifier).toBe(0)
    placeUnit(s, BOYZ, [[10, 0]])
    const dsModel = s.units[DS].models[0]
    s.models[dsModel].woundsRemaining = 0
    const c2 = ctxOf(s, Array<number>(10).fill(1))
    attackService.finishDestroy(c2.ctx, dsModel, { player: 'B', unitId: BOYZ, modelId: null, kind: 'ranged' })
    expect(mods(c2.ctx, atk, 'onWoundRoll').modifier).toBe(0)
  })

  it('INF-009 INF-6.2: the aura -1 stacks with another -1 to hit (Stealth) only up to the -1 cap', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[0, 3]])
    placeUnit(s, BOYZ, [[6, 0]])
    s.units[BOYZ].battleShocked = true
    setSkill(s, BOYZ, 'ranged', 3)
    // the aura alone is -1; Death's Shadow carries Stealth (-1) as the second source
    const { ctx: probe } = ctxOf(s, [])
    expect(mods(probe, attackOf(s, BOYZ, DS, 'ranged'), 'onHitRoll').modifier).toBe(-1)
    // unmodified 4 on a 3+ weapon: capped at -1 it is 3 and hits; uncapped -2 it would be 2 and miss
    const { ctx, events } = ctxOf(s, [4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [declare(s, BOYZ, DS, 'ranged', 1)] })
    const hit = of(driveAttack(ctx, events), 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 4, final: 3, hit: true })
  })
})

// =====================================================================================================================
describe('Feeder Tendrils (INF-6.3)', () => {

  it('INF-010 INF-6.3: the Lictor killing a non-CHARACTER gives no CP; the Lictor killing a CHARACTER gives 1 CP', () => {
    const s = makeState({ round: 2 })
    phase(s, 'fight', 'A')
    const warlord = s.players.B.warlordUnitId
    const grunt = warlord === BOYZ ? BOYZ2 : BOYZ
    placeUnit(s, LIC, [[0, 0]])
    placeUnit(s, warlord, [[1, 0]])
    placeUnit(s, grunt, [[2, 0]])
    const { ctx } = ctxOf(s, Array<number>(10).fill(1))
    const by = { player: 'A' as const, unitId: LIC, modelId: s.units[LIC].models[0], kind: 'melee' as const }
    attackService.finishDestroy(ctx, s.units[grunt].models[0], by)
    expect(s.players.A.cp).toBe(0)
    attackService.finishDestroy(ctx, s.units[warlord].models[0], by)
    expect(s.players.A.cp).toBe(1)
  })

  it('INF-010 INF-6.3: a CHARACTER killed by a Leaper gives no CP', () => {
    const s = makeState({ round: 2 })
    phase(s, 'fight', 'A')
    const warlord = s.players.B.warlordUnitId
    placeUnit(s, LEAP, [[0, 0]])
    placeUnit(s, warlord, [[1, 0]])
    const { ctx } = ctxOf(s, Array<number>(10).fill(1))
    attackService.finishDestroy(ctx, s.units[warlord].models[0], { player: 'A', unitId: LEAP, modelId: s.units[LEAP].models[0], kind: 'melee' })
    expect(s.players.A.cp).toBe(0)
  })
})

// =====================================================================================================================
describe('Psionic Phantoms (INF-3.2, 3.4 - 3.8)', () => {
  const PH = { a: { enhancementId: 'tyr.e.psionic-phantoms' } }
  const setupShot = (s: GameState, ctx: EngineContext, extraTarget = false): void => {
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[0, 6]])
    placeUnit(s, BOYZ, [[0, -12]])
    placeUnit(s, BOYZ2, [[8, -12]])
    const bm = s.units[BOYZ].models
    const wid = s.models[bm[0]].weapons.find((w) => s.weapons[w].kind === 'ranged')!
    const targets = [{ modelId: bm[0], weaponId: wid, targetUnitId: DS, profileGroup: null, attacks: null }]
    if (extraTarget) targets.push({ modelId: bm[1], weaponId: wid, targetUnitId: LIC, profileGroup: null, attacks: null })
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets })
  }

  it('INF-017 INF-3.4: offered once the bearer is targeted by ranged attacks; used, a reactive move is raised', () => {
    const s = makeState(PH)
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s, [])
    setupShot(s, ctx)
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BOYZ)).toBe(true)
    const pick = pendingOption(s)!
    expect(pick.player).toBe('A')
    expect(pick.options.map((o) => o.id)).toEqual(['use', 'decline'])
    answer(ctx, 'use')
    expect(s.pending?.kind).toBe('moveUnit')
    expect(s.phaseState.marks.some((m) => m.startsWith(`${PHANTOMS_PENDING_MARK}=${BOYZ}|${DS}`))).toBe(true)
    expect(s.players.A.oncePerBattleUsed).toContain(`phantoms:${s.round}`)
  })

  it('INF-020 INF-3.4: not offered twice in a battle round, nor when only another unit is targeted', () => {
    const s = makeState(PH)
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s, [])
    setupShot(s, ctx)
    s.players.A.oncePerBattleUsed.push(`phantoms:${s.round}`)
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BOYZ)).toBe(false)
    s.players.A.oncePerBattleUsed = []
    s.phaseState.attack!.targetUnitIds = [LIC]
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BOYZ)).toBe(false)
  })

  it('INF-019 INF-3.8: bearer hidden, D6 = 5 -> models that targeted the bearer make no attacks; others still shoot', () => {
    const s = makeState(PH)
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s, [5])
    setupShot(s, ctx, true)
    ctx.services.los.unitVisible = () => false
    s.phaseState.marks.push(`${PHANTOMS_PENDING_MARK}=${BOYZ}|${DS}`)
    expect(psionicPhantomsStep(ctx, BOYZ)).toBe('done')
    expect(s.phaseState.attack!.targets.map((t) => t.targetUnitId)).toEqual([LIC])
  })

  // the bearer is hidden (every other unit stays visible); BOYZ model 0 aimed at the bearer, model 1 at LEAP (an extra visible target)
  const redeclareSetup = (dice: number[]) => {
    const s = makeState(PH)
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s, dice)
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, LIC, [[0, 6]])
    placeUnit(s, LEAP, [[-6, -8], [-6, -10], [-6, -6]])
    placeUnit(s, BOYZ, [[0, -12], [1.5, -12]])
    placeUnit(s, BOYZ2, [[8, -12]])
    const bm = s.units[BOYZ].models
    const wid = s.models[bm[0]].weapons.find((w) => s.weapons[w].kind === 'ranged')!
    attackService.begin(ctx, {
      kind: 'ranged', attackerUnitId: BOYZ, overwatch: false,
      targets: [{ modelId: bm[0], weaponId: wid, targetUnitId: DS, profileGroup: null, attacks: null }, { modelId: bm[1], weaponId: wid, targetUnitId: LEAP, profileGroup: null, attacks: null }],
    })
    ctx.services.los.unitVisible = (_s: GameState, _m: string, unitId: string) => unitId !== DS
    s.phaseState.marks.push(`${PHANTOMS_PENDING_MARK}=${BOYZ}|${DS}`)
    return { s, ctx, bm, wid }
  }
  const redeclareAction = (s: GameState, unitId: string, targets: { modelId: string; weaponId: string; targetUnitId: string }[]) => {
    const pending = s.pending as PendingDecision & { kind: 'declareTargets' }
    return { type: 'declareTargets' as const, player: pending.player, decisionId: pending.id, unitId, targets }
  }

  it('INF-018 INF-3.6, 3.7: bearer hidden, D6 = 2 -> re-declaration is raised for the pairs that targeted the bearer; a new target is accepted, the bearer is rejected', () => {
    const { s, ctx, bm, wid } = redeclareSetup([2])
    expect(psionicPhantomsStep(ctx, BOYZ)).toBe('pending')
    const pending = s.pending as PendingDecision & { kind: 'declareTargets' }
    expect(pending.kind).toBe('declareTargets')
    expect(pending.context.weapons.map((w) => w.modelId)).toEqual([bm[0]])
    expect(pending.context.weapons[0].legalTargets).toContain(LEAP)
    expect(pending.context.weapons[0].legalTargets).not.toContain(DS)
    // the other model's attacks (at LEAP) were untouched; the bearer's pair is gone from the sequence
    expect(s.phaseState.attack!.targets.map((t) => `${t.modelId}>${t.targetUnitId}`)).toEqual([`${bm[1]}>${LEAP}`])
    // the bearer is not a legal new target
    expect(shootingModule.validate!(s, redeclareAction(s, BOYZ, [{ modelId: bm[0], weaponId: wid, targetUnitId: DS }]), pending)).not.toBeNull()
    // a legal new target for the same model is accepted and joins the running sequence
    const act = redeclareAction(s, BOYZ, [{ modelId: bm[0], weaponId: wid, targetUnitId: LEAP }])
    expect(shootingModule.validate!(s, act, pending)).toBeNull()
    s.pending = null
    expect(shootingModule.handle(ctx, act, pending)).toBeUndefined()
    expect(s.phaseState.attack!.targets.map((t) => `${t.modelId}>${t.targetUnitId}`).sort()).toEqual([`${bm[0]}>${LEAP}`, `${bm[1]}>${LEAP}`].sort())
    expect(s.phaseState.marks.some((m) => m.startsWith('phantoms:redeclare='))).toBe(false)
  })

  it('INF-018 INF-3.7: bearer hidden, D6 = 3 -> passing the re-declaration drops those attacks; the other pair stands', () => {
    const { s, ctx, bm } = redeclareSetup([3])
    expect(psionicPhantomsStep(ctx, BOYZ)).toBe('pending')
    const pending = s.pending as PendingDecision
    s.pending = null
    expect(shootingModule.handle(ctx, { type: 'pass', player: pending.player, decisionId: pending.id }, pending)).toBeUndefined()
    expect(s.phaseState.attack!.targets.map((t) => `${t.modelId}>${t.targetUnitId}`)).toEqual([`${bm[1]}>${LEAP}`])
    expect(s.phaseState.marks.some((m) => m.startsWith('phantoms:redeclare='))).toBe(false)
  })

  it('INF-017 INF-3.6: the bearer still visible -> nothing changes and no die is rolled', () => {
    const s = makeState(PH)
    phase(s, 'shooting', 'B')
    const { ctx, events } = ctxOf(s, [])
    setupShot(s, ctx)
    ctx.services.los.unitVisible = () => true
    s.phaseState.marks.push(`${PHANTOMS_PENDING_MARK}=${BOYZ}|${DS}`)
    expect(psionicPhantomsStep(ctx, BOYZ)).toBe('done')
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(s.phaseState.attack!.targets.map((t) => t.targetUnitId)).toEqual([DS])
  })
})

// =====================================================================================================================
describe('Pheromonal Trace (INF-5.2, 5.5)', () => {
  it('INF-027 INF-5.2: Leapers within range of a marker you control secure it; INF-028 only Leapers are offered', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 3 })
    const obj = Object.values(s.objectives)[0]
    obj.controller = 'A'
    placeUnit(s, LEAP, [[obj.pos.x + 1, obj.pos.z]])
    placeUnit(s, LIC, [[obj.pos.x + 1.5, obj.pos.z]])
    const { ctx } = ctxOf(s, [])
    const opts = stratagemService.options(s, 'A', 'command.end', {}).filter((x) => x.stratagemId === 'tyr.s.pheromonal-trace')
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.every((x) => x.targets.unitIds?.[0] === LEAP)).toBe(true)
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'command.end', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    const act = { ...opts[0], decisionId: 'd:1' } as never
    expect(stratagemService.validate!(s, act, pending)).toBeNull()
    expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
    expect(obj.securedBy).toBe('A')
  })
})

// =====================================================================================================================
describe('Alpha Predation and Left to Last (INF-4)', () => {
  const killUnit = (s: GameState, unit: string, by: 'A' | null): void => {
    const { ctx } = ctxOf(s, Array<number>(10).fill(1))
    for (const id of [...s.units[unit].models]) {
      s.models[id].woundsRemaining = 0
      attackService.finishDestroy(ctx, id, by ? { player: by, unitId: LIC, modelId: s.units[LIC].models[0], kind: 'melee' } : { player: null, unitId: null, modelId: null, kind: 'other' })
    }
  }

  it('INF-021 INF-4.1: the enemy Warlord destroyed in round 2 scores 15 VP, round 3 scores 10, round 5 scores 5, once only', () => {
    for (const [round, vp] of [[2, 15], [3, 10], [5, 5]] as const) {
      const s = makeState({ round })
      phase(s, 'fight', 'A')
      placeUnit(s, LIC, [[0, 0]])
      const warlord = s.players.B.warlordUnitId
      placeUnit(s, warlord, [[1, 0]])
      killUnit(s, warlord, 'A')
      expect(s.players.A.vp).toBe(vp)
      const { ctx } = ctxOf(s, [])
      DEFAULT_MODULES.services.missions.unitDestroyed?.(ctx, { unitId: warlord, byPlayer: 'A', byUnitId: LIC, byModelId: null })
      expect(s.players.A.vp).toBe(vp)
    }
  })

  it('INF-023 INF-4.2, 4.4: Left to Last scores 4 VP per kill while the Warlord lives; the Warlord unit and later kills score 0', () => {
    const s = makeState({ a: { secondaryId: 'tyr.sec.left-to-last' } })
    phase(s, 'fight', 'A')
    placeUnit(s, LIC, [[0, 0]])
    const warlord = s.players.B.warlordUnitId
    const other = warlord === BOYZ ? BOYZ2 : BOYZ
    placeUnit(s, other, [[1, 0]])
    placeUnit(s, warlord, [[2, 0]])
    killUnit(s, other, 'A')
    expect(s.players.A.vp).toBe(4)
    killUnit(s, warlord, 'A')
    expect(s.players.A.vp).toBe(4)
  })

  it('INF-024 INF-4.4: a unit lost with no killer scores nothing for Left to Last', () => {
    const s = makeState({ a: { secondaryId: 'tyr.sec.left-to-last' } })
    phase(s, 'fight', 'A')
    placeUnit(s, LIC, [[0, 0]])
    const warlord = s.players.B.warlordUnitId
    const other = warlord === BOYZ ? BOYZ2 : BOYZ
    placeUnit(s, other, [[1, 0]])
    placeUnit(s, warlord, [[2, 0]])
    killUnit(s, other, null)
    expect(s.players.A.vp).toBe(0)
  })
})

// =====================================================================================================================
describe('Psionic Phantoms vs Fire Overwatch (INF-3.4)', () => {
  const PH = { a: { enhancementId: 'tyr.e.psionic-phantoms' } }
  // BOYZ is the Overwatching unit, Death's Shadow the unit that just moved / charged
  const owSetup = (dice: number[] = [], inEngagement = false) => {
    const s = makeState(PH)
    phase(s, 'movement', 'A')
    const { ctx, events } = ctxOf(s, dice)
    placeUnit(s, DS, [[0, 0]])
    placeUnit(s, BOYZ, [[0, -12], [1.5, -12]])
    if (inEngagement) placeUnit(s, BOYZ2, [[0, radius(s, DS) + radius(s, BOYZ2) + 0.4]])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: true, targets: [declare(s, BOYZ, DS, 'ranged', 1)], overwatchHitOn: 6 })
    return { s, ctx, events }
  }

  it('INF-020 INF-3.4: offered against Overwatch after set-up, after a move ends and after a charge declaration; used, a reactive move is raised', () => {
    for (const window of ['movement.reinforcements', 'movement.unitMoved', 'charge.moveStarted'] as const) {
      const { s, ctx } = owSetup()
      phantomsOverwatchArm(ctx, BOYZ, window)
      expect(phantomsOverwatchStep(ctx)).toBe('pending')
      const pick = pendingOption(s)!
      expect(pick.player).toBe('A')
      expect(pick.options.map((o) => o.id)).toEqual(['use', 'decline'])
      answer(ctx, 'use')
      expect(s.pending?.kind).toBe('moveUnit')
      expect(s.pending?.window).toBe(window)
      expect(s.players.A.oncePerBattleUsed).toContain(`phantoms:${s.round}`)
      expect(s.phaseState.marks.some((m) => m.startsWith(`${PHANTOMS_PENDING_MARK}=${BOYZ}|${DS}`))).toBe(true)
    }
  })

  it('INF-020 INF-3.4: not offered against the Overwatch of a unit that starts a move (the bearer is mid-move)', () => {
    const { s, ctx } = owSetup()
    phantomsOverwatchArm(ctx, BOYZ, 'movement.moveStarted')
    expect(phantomsOverwatchStep(ctx)).toBe('done')
    expect(s.pending).toBeNull()
    expect(s.phaseState.attack!.targets).toHaveLength(1)
  })

  it('INF-020 INF-3.4: not offered while the bearer is in Engagement Range, nor a second time in the same battle round; offered again next round', () => {
    const er = owSetup([], true)
    phantomsOverwatchArm(er.ctx, BOYZ, 'movement.unitMoved')
    expect(leaderService.inEngagementWithEnemy(er.s, DS)).toBe(true)
    expect(phantomsOverwatchStep(er.ctx)).toBe('done')
    expect(er.s.pending).toBeNull()

    const used = owSetup()
    used.s.players.A.oncePerBattleUsed.push(`phantoms:${used.s.round}`)
    phantomsOverwatchArm(used.ctx, BOYZ, 'movement.unitMoved')
    expect(phantomsOverwatchStep(used.ctx)).toBe('done')
    expect(used.s.pending).toBeNull()

    const next = owSetup()
    next.s.players.A.oncePerBattleUsed.push(`phantoms:${next.s.round - 1}`)
    phantomsOverwatchArm(next.ctx, BOYZ, 'movement.unitMoved')
    expect(phantomsOverwatchStep(next.ctx)).toBe('pending')
  })

  it('INF-020 INF-3.8: against Overwatch, bearer hidden after the move and D6 = 5 -> that Overwatch makes no attacks', () => {
    const { s, ctx, events } = owSetup([5])
    phantomsOverwatchArm(ctx, BOYZ, 'movement.unitMoved')
    expect(phantomsOverwatchStep(ctx)).toBe('pending')
    answer(ctx, 'use')
    expect(phantomsOverwatchStep(ctx)).toBe('pending') // the 6in move is still open
    s.pending = null // the move was made
    ctx.services.los.unitVisible = () => false
    expect(phantomsOverwatchStep(ctx)).toBe('done')
    expect(s.phaseState.attack!.targets).toHaveLength(0)
    expect(s.phaseState.attack!.groups).toHaveLength(0)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(s.phaseState.marks.some((m) => m.startsWith(PHANTOMS_PENDING_MARK))).toBe(false)
  })

  it('INF-020 INF-3.6, 3.7: against Overwatch, D6 = 2 loses the Overwatch attacks (the bearer is the only legal Overwatch target and is hidden); still visible -> no die rolled', () => {
    const low = owSetup([2])
    phantomsOverwatchArm(low.ctx, BOYZ, 'movement.unitMoved')
    phantomsOverwatchStep(low.ctx)
    answer(low.ctx, 'use')
    low.s.pending = null
    low.ctx.services.los.unitVisible = () => false
    expect(phantomsOverwatchStep(low.ctx)).toBe('done')
    expect(low.s.phaseState.attack!.targets).toHaveLength(0)
    expect(low.s.phaseState.attack!.groups).toHaveLength(0)

    const seen = owSetup([])
    phantomsOverwatchArm(seen.ctx, BOYZ, 'movement.unitMoved')
    phantomsOverwatchStep(seen.ctx)
    answer(seen.ctx, 'use')
    seen.s.pending = null
    seen.ctx.services.los.unitVisible = () => true
    expect(phantomsOverwatchStep(seen.ctx)).toBe('done')
    expect(of(seen.events, 'DiceRolled')).toHaveLength(0)
    expect(seen.s.phaseState.attack!.targets).toHaveLength(1)
  })

  it('INF-020 INF-3.4: in the Charge phase the reactive 6in move is answered through chargeModule (no soft-lock)', () => {
    const { s, ctx } = owSetup([4])
    s.phase = 'charge'
    s.phaseState = emptyPhaseState()
    // the Overwatch sequence was begun by owSetup in the movement phase; re-begin it under the charge phase state
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: true, targets: [declare(s, BOYZ, DS, 'ranged', 1)], overwatchHitOn: 6 })
    phantomsOverwatchArm(ctx, BOYZ, 'charge.moveStarted')
    expect(phantomsOverwatchStep(ctx)).toBe('pending')
    answer(ctx, 'use')
    const pending = s.pending as PendingDecision
    expect(pending.kind).toBe('moveUnit')
    const legal = chargeModule.legalActions!(s, pending)
    expect(legal && legal.length).toBeGreaterThan(0)
    const move = legal!.find((a) => a.type === 'moveUnit')!
    expect(chargeModule.validate!(s, move, pending)).toBeNull()
    s.pending = null
    expect(chargeModule.handle(ctx, move, pending)).toBeUndefined()
    expect(s.phaseState.marks.some((m) => m.startsWith('mv:reactive'))).toBe(false)
    // the bearer is hidden from the Overwatch unit: the step now rolls and, on 4, drops the attacks
    ctx.services.los.unitVisible = () => false
    expect(phantomsOverwatchStep(ctx)).toBe('done')
    expect(s.phaseState.attack!.targets).toHaveLength(0)
  })

  it('INF-020 INF-3.5: declining against Overwatch leaves the attacks as declared', () => {
    const { s, ctx } = owSetup()
    phantomsOverwatchArm(ctx, BOYZ, 'charge.moveStarted')
    expect(phantomsOverwatchStep(ctx)).toBe('pending')
    answer(ctx, 'decline')
    expect(phantomsOverwatchStep(ctx)).toBe('done')
    expect(s.phaseState.attack!.targets).toHaveLength(1)
  })
})

// =====================================================================================================================
describe('Datasheet rules: enhancement placement, Lone Operative, Precision, core abilities (INF-1.2, INF-6)', () => {
  it('INF-002 INF-1.2: Psionic Phantoms selected -> its ability sits on Death\'s Shadow\'s only model (no CHARACTER in the army)', () => {
    const s = makeState({ a: { enhancementId: 'tyr.e.psionic-phantoms' } })
    const ability = Object.values(s.abilities).find((a) => a.source === 'enhancement' && a.code === 'psionicPhantoms')!
    expect(ability).toBeTruthy()
    expect(s.units[DS].models).toHaveLength(1)
    expect(ability.bearerModelId).toBe(s.units[DS].models[0])
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('CHARACTER')
  })

  it('INF-011 INF-6.6: Precision - the Lictor\'s claws and talons vs an attached unit let the attacker allocate to the Leader model', () => {
    // the Ork data lists no leader rule for the Warboss, so this copy of the bundle lets him lead the Boyz (the shared bundle is never mutated)
    const wds = bundle.datasheets['ork.warboss-gordrang']
    const leadBundle: DataBundle = { ...bundle, datasheets: { ...bundle.datasheets, [wds.id]: { ...wds, leader: { attachTo: ['ork.boyz'], effects: [] } } } }
    const s = makeState({ bundle: leadBundle, b: { attachments: [{ leaderRef: 'warboss', bodyguardRef: 'boyz-a' }] } })
    phase(s, 'fight', 'A')
    const BOSS = 'B:warboss'
    placeUnit(s, LIC, [[0, 0]])
    placeUnit(s, BOYZ, [[0, radius(s, LIC) + radius(s, BOYZ) + 0.4]])
    placeUnit(s, BOSS, [[3, radius(s, LIC) + radius(s, BOYZ) + 0.4]])
    expect(leaderService.halves(s, BOYZ)).toContain(BOSS)
    const m = s.models[s.units[LIC].models[0]]
    const wid = m.weapons.find((w) => s.weapons[w].kind === 'melee')!
    expect(weaponService.hasAbility(weaponService.effectiveWeapon(s, m.id, wid), 'PRECISION')).toBe(true)
    const { ctx } = ctxOf(s, Array<number>(60).fill(6))
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: LIC, overwatch: false, targets: [declare(s, LIC, BOYZ, 'melee', 1)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const pending = s.pending as PendingDecision & { kind: 'allocateAttack' }
    expect(pending).toMatchObject({ kind: 'allocateAttack', player: 'A', canPass: true })
    expect(pending.context.eligibleModels).toEqual([s.units[BOSS].models[0]])
  })

  it('INF-012 INF-6.5: Lone Operative - Death\'s Shadow and the Lictor can be shot from 12in but not 12.1in; an ordinary unit is reachable at 13in', () => {
    const shootaTargets = (s: GameState): string[] => {
      const { ctx } = ctxOf(s, [])
      const shoota = buildShootingWeaponEntries(ctx, BOYZ).filter((e) => e.weaponId === 'ork.w.shoota')
      expect(shoota.length, 'the Boyz carry shootas (18in)').toBeGreaterThan(0)
      return shoota.flatMap((e) => e.legalTargets)
    }
    const withGap = (target: string, gap: number): GameState => {
      const s = makeState()
      phase(s, 'shooting', 'B')
      placeUnit(s, target, s.units[target].models.map((_, i) => [0, i * 2] as [number, number]))
      placeUnit(s, BOYZ, [[radius(s, target) + radius(s, BOYZ) + gap, 0]])
      return s
    }
    for (const unit of [DS, LIC]) {
      expect(shootaTargets(withGap(unit, 12))).toContain(unit)
      expect(shootaTargets(withGap(unit, 12.1))).not.toContain(unit)
    }
    expect(shootaTargets(withGap(LEAP, 13))).toContain(LEAP)
  })

  it('INF-013 INF-6: core abilities - Fights First on the Lictor and Leapers but not Death\'s Shadow; Infiltrators and Stealth on all three', () => {
    const s = makeState()
    for (const u of [LIC, LEAP, LEAP2, LEAP3]) expect(hasCoreAbility(s, u, 'FIGHTS_FIRST')).toBe(true)
    expect(hasCoreAbility(s, DS, 'FIGHTS_FIRST')).toBe(false)
    for (const u of [DS, LIC, LEAP]) {
      expect(hasCoreAbility(s, u, 'INFILTRATORS')).toBe(true)
      expect(hasCoreAbility(s, u, 'STEALTH')).toBe(true)
    }
  })

  it('INF-013 INF-6: Stealth - a ranged hit roll against each of the Shadow, the Lictor and the Leapers gets -1', () => {
    for (const target of [DS, LIC, LEAP]) {
      const s = makeState()
      phase(s, 'shooting', 'B')
      placeUnit(s, target, [[0, 0]])
      placeUnit(s, BOYZ, [[6, 0]])
      setSkill(s, BOYZ, 'ranged', 3)
      const { ctx, events } = ctxOf(s, [3, ...TAIL])
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [declare(s, BOYZ, target, 'ranged', 1)] })
      const hit = of(driveAttack(ctx, events), 'HitRolled')[0]
      expect(hit, target).toMatchObject({ die: 3, final: 2, hit: false })
    }
  })
})

// =====================================================================================================================
describe('Stratagems and Pouncing Leap (INF-5, INF-6.4)', () => {
  it('INF-025 INF-5.1, 5.4: Swift Kills on Leapers not yet fought - talons AP -1 -> -2, Anti-Monster 4+ and Anti-Vehicle 4+; ends at phase end', () => {
    const s = makeState()
    phase(s, 'fight', 'A', { A: 3 })
    placeUnit(s, LEAP, [[0, 0]])
    placeUnit(s, BOYZ, [[0, radius(s, LEAP) + radius(s, BOYZ) + 0.4]])
    const m = s.units[LEAP].models[0]
    const wid = s.models[m].weapons.find((w) => s.weapons[w].kind === 'melee')!
    const { ctx } = ctxOf(s, [])
    expect(weaponService.effectiveWeapon(s, m, wid).AP).toBe(-1)
    useStratagem(ctx, 'A', 'fight.start', 'tyr.s.swift-kills', LEAP)
    const boosted = weaponService.effectiveWeapon(s, m, wid)
    expect(boosted.AP).toBe(-2)
    expect(boosted.abilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ ability: 'ANTI', keyword: 'MONSTER', value: 4 }),
      expect.objectContaining({ ability: 'ANTI', keyword: 'VEHICLE', value: 4 }),
    ]))
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    const after = weaponService.effectiveWeapon(s, m, wid)
    expect(after.AP).toBe(-1)
    expect(after.abilities.some((a) => a.ability === 'ANTI')).toBe(false)
  })

  it('INF-025 INF-5.4: an unmodified wound roll of 4 is critical against a VEHICLE with Swift Kills, not against INFANTRY', () => {
    const run = (vehicle: boolean) => {
      const s = makeState()
      phase(s, 'fight', 'A', { A: 3 })
      placeUnit(s, LEAP, [[0, 0]])
      placeUnit(s, BOYZ, [[0, radius(s, LEAP) + radius(s, BOYZ) + 0.4]])
      if (vehicle) patchKeyword(s, BOYZ, 'VEHICLE')
      const { ctx, events } = ctxOf(s, Array<number>(60).fill(4))
      useStratagem(ctx, 'A', 'fight.start', 'tyr.s.swift-kills', LEAP)
      attackService.begin(ctx, { kind: 'melee', attackerUnitId: LEAP, overwatch: false, targets: [declare(s, LEAP, BOYZ, 'melee', 1)] })
      return of(driveAttack(ctx, events), 'WoundRolled')[0]
    }
    expect(run(true)).toMatchObject({ die: 4, wounded: true, critical: true })
    expect(run(false)).toMatchObject({ die: 4, wounded: true, critical: false })
  })

  it('INF-026 INF-5.1: Swift Kills is offered in both players\' Fight phases, and not for a unit that has already fought', () => {
    const s = makeState()
    placeUnit(s, LEAP, [[0, 0]])
    placeUnit(s, LEAP2, [[4, 0]])
    placeUnit(s, BOYZ, [[0, 5]])
    const offered = (): string[] => stratagemService.options(s, 'A', 'fight.start', {}).filter((x) => x.stratagemId === 'tyr.s.swift-kills').map((x) => x.targets.unitIds?.[0] ?? '')
    phase(s, 'fight', 'A', { A: 3 })
    expect(offered()).toEqual(expect.arrayContaining([LEAP, LEAP2]))
    phase(s, 'fight', 'B', { A: 3 })
    expect(offered()).toEqual(expect.arrayContaining([LEAP, LEAP2]))
    s.phaseState.fight!.fought.push(LEAP)
    expect(offered()).toContain(LEAP2)
    expect(offered()).not.toContain(LEAP)
  })

  it('INF-028 INF-5.2: Pheromonal Trace is not offered for the Lictor or Death\'s Shadow, for a marker you do not control, or for Leapers out of range', () => {
    const s = makeState()
    phase(s, 'command', 'A', { A: 3 })
    const obj = Object.values(s.objectives)[0]
    const offered = (): string[] => stratagemService.options(s, 'A', 'command.end', {}).filter((x) => x.stratagemId === 'tyr.s.pheromonal-trace').map((x) => x.targets.unitIds?.[0] ?? '')
    placeUnit(s, DS, [[obj.pos.x + 1, obj.pos.z]])
    placeUnit(s, LIC, [[obj.pos.x - 1, obj.pos.z]])
    placeUnit(s, LEAP, [[obj.pos.x, obj.pos.z + 1]])
    obj.controller = 'A'
    expect(offered()).toEqual([LEAP])
    obj.controller = 'B'
    expect(offered()).toEqual([])
    obj.controller = null
    expect(offered()).toEqual([])
    obj.controller = 'A'
    placeUnit(s, LEAP, [[obj.pos.x + 9, obj.pos.z]])
    expect(offered()).toEqual([])
  })

  it('INF-031 INF-5.3, 5.7: Predators, Not Prey before a charge is declared lets the charge move cross models; not offered once the unit has acted, nor in the opponent turn', () => {
    const s = makeState()
    phase(s, 'charge', 'A', { A: 3 })
    placeUnit(s, LEAP, [[0, 0]])
    placeUnit(s, LIC, [[6, 0]])
    placeUnit(s, BOYZ, [[0, 14]])
    const offered = (player: 'A' | 'B' = 'A'): string[] => stratagemService.options(s, player, 'charge.start', {}).filter((x) => x.stratagemId === 'tyr.s.predators-not-prey').map((x) => x.targets.unitIds?.[0] ?? '')
    expect(offered()).toEqual(expect.arrayContaining([LEAP, LIC]))
    expect(unitMovesThroughModels(s, LEAP)).toBe(false)
    const { ctx } = ctxOf(s, [])
    useStratagem(ctx, 'A', 'charge.start', 'tyr.s.predators-not-prey', LEAP)
    expect(unitMovesThroughModels(s, LEAP)).toBe(true)
    expect(unitMovesThroughModels(s, LIC)).toBe(false)
    s.phaseState.activated.push(LIC) // already declared a charge this phase
    expect(offered()).not.toContain(LIC)
    phase(s, 'charge', 'B', { A: 3 })
    expect(offered()).toEqual([])
  })

  it('INF-032 INF-6.4: Pouncing Leap - Heroic Intervention costs 0 CP on every Leaper unit, even after it was used on another Leaper unit this phase; the Lictor pays 1 CP', () => {
    const s = makeState()
    phase(s, 'charge', 'B', { A: 0 })
    placeUnit(s, BOYZ, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, LEAP, { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, LEAP2, { x: 6, z: -5, gap: 0.3 })
    placeUnit(s, LEAP3, { x: -6, z: -5, gap: 0.3 })
    placeUnit(s, LIC, { x: 0, z: 5, gap: 0.3 })
    s.units[BOYZ].turn.chargedThisTurn = true
    const hi = s.stratagems['core.s.heroic-intervention']
    for (const u of [LEAP, LEAP2, LEAP3]) {
      expect(effectiveCost(s, 'A', hi, [BOYZ, u]), u).toBe(0)
      expect(ignoresLimit(s, 'A', hi, [BOYZ, u]), u).toBe(true)
    }
    expect(effectiveCost(s, 'A', hi, [BOYZ, LIC])).toBe(1)
    expect(ignoresLimit(s, 'A', hi, [BOYZ, LIC])).toBe(false)
    const offers = (): string[] => stratagemService.options(s, 'A', 'charge.moveEnded', { unitId: BOYZ })
      .filter((x) => x.stratagemId === 'core.s.heroic-intervention').map((x) => x.targets.unitIds![1]).sort()
    expect(offers()).toEqual([LEAP, LEAP2, LEAP3].sort()) // 0 CP: only the free ones are affordable
    s.players.A.stratagemUses.push({ stratagemId: 'core.s.heroic-intervention', round: s.round, turn: 'B', phase: 'charge' })
    expect(offers()).toEqual([LEAP, LEAP2, LEAP3].sort()) // used on another unit this phase: each Leaper unit still has its own exemption
  })
})

// =====================================================================================================================
describe('Alpha Predation on a stranded Warlord (INF-4.3)', () => {
  it('INF-022 INF-4.3: the enemy Warlord still in Reserves at the end of round 3 is culled and scores 10 VP, once', () => {
    const s = makeState({ round: 3 })
    s.phase = 'movement'
    s.activePlayer = 'B'
    s.phaseState = emptyPhaseState()
    s.firstPlayer = 'A'
    s.step = 'reinforcements'
    const BOSS = 'B:warboss'
    expect(s.players.B.warlordUnitId).toBe(BOSS)
    Object.values(s.units).filter((u) => u.location === 'reserves').forEach((u, i) => placeUnit(s, u.id, [[-20 + i * 3, 12]]))
    s.units[BOSS].location = 'reserves' // the Ork data cannot start a Warboss in Reserves, so strand him by hand
    const { ctx } = ctxOf(s, [])
    expect(movementModule.advance(ctx)).toBe('pending') // the Warlord is offered its arrival; the owner leaves it in Reserves
    const pending = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    s.pending = null
    expect(movementModule.handle(ctx, { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: BOSS, placements: [], toReserves: true }, pending)).toBeUndefined()
    expect(movementModule.advance(ctx)).toBe('done')
    expect(s.units[BOSS].location).toBe('destroyed')
    expect(s.players.A.vp).toBe(10)
    expect(s.players.A.secondaryState.alphaPredationScored).toBe(true)
  })
})
