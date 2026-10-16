// Adepta Sororitas, The Penitent Host (docs/spec/factions/adepta-sororitas--the-penitent-host.md §7, checklist PEN-*).
// Covers the (b) code hooks: Saintly Relic gain, Divine Judgement pick + score, Rites of Reconsecration (reused
// reclaimAndDominate), Holy Radiance (extended aMartyrsDeath), Angelic Ascent, and the Sanctuary Guardians regression.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type ModuleTable, type PendingDecision, type PlayerSetup, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { evaluateCondition, hookService } from '../../src/engine/hooks-impl'
import { transportService } from '../../src/engine/transports'
import { buildShootingWeaponEntries, shootingModule } from '../../src/engine/phases/shooting'
import { datasheetOf, modelStats } from '../../src/engine/state'
import { missionService } from '../../src/engine/missions'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const PEN = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Penitents', faction: 'adepta-sororitas', patrolId: 'ade.cp.the-penitent-host', enhancementId: 'ade.e.saintly-relic',
  secondaryId: 'ade.sec.divine-judgement', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sisters' }], reserves: [], battleReadyVp: 0, ...o,
})
const SG = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Guardians', faction: 'adepta-sororitas', patrolId: 'ade.cp.sanctuary-guardians', enhancementId: 'ade.e.defender-of-the-faith',
  secondaryId: 'ade.sec.hallowed-retribution', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sacresants' }], reserves: [], battleReadyVp: 0, ...o,
})

const CAN = 'A:canoness', SIS = 'A:sisters', SER = 'A:seraphim', REP = 'A:repentia', RHINO = 'A:rhino', ENGINE = 'A:engine'
const B_ARC = 'B:arcos', B_REP = 'B:repentia'

function makeState(o: { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; sg?: boolean } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
    players: { A: o.sg ? SG(o.a) : PEN(o.a), B: PEN({ enhancementId: 'ade.e.armour-of-faith', secondaryId: 'ade.sec.rites-of-reconsecration', ...o.b }) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'pen', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  s.phaseState = emptyPhaseState()
  return s
}

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

const marker = (s: GameState) => Object.values(s.objectives).find((o) => !o.removed)!
const relicBearerModel = (s: GameState): string => {
  const a = Object.values(s.abilities).find((x) => x.code === 'saintlyRelicGain')
  if (!a?.bearerModelId) throw new Error('no Saintly Relic bearer')
  return a.bearerModelId
}

// =====================================================================================================================
describe('Saintly Relic gain (PEN-007)', () => {
  function relicState() {
    const s = makeState()
    const o = marker(s)
    const bearer = relicBearerModel(s)
    placeUnit(s, SIS, { x: o.pos.x - 3, z: o.pos.z, gap: 0.3 })
    placeUnit(s, CAN, [[o.pos.x, o.pos.z - 1]])
    return { s, o, bearer }
  }

  it('PEN-007 PEN-3.1: end of own Command phase, bearer within range of a controlled marker -> exactly one Miracle die', () => {
    const { s } = relicState()
    const { ctx, events } = ctxOf(s, [4])
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(s.players.A.miracle.dice).toContain(4)
    expect(of(events, 'MiracleDieGained')).toHaveLength(1)
    // a second run in the same phase never double-awards
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(of(events, 'MiracleDieGained')).toHaveLength(1)
  })

  it('PEN-007 PEN-3.1: bearer Battle-shocked -> no die', () => {
    const { s } = relicState()
    s.units[CAN].battleShocked = true
    const { ctx, events } = ctxOf(s, [4])
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(of(events, 'MiracleDieGained')).toHaveLength(0)
  })

  it('PEN-007 PEN-3.1: bearer away from every marker -> no die', () => {
    const { s } = relicState()
    placeUnit(s, CAN, [[-20, -12]])
    placeUnit(s, SIS, { x: -20, z: -11, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [4])
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(of(events, 'MiracleDieGained')).toHaveLength(0)
  })

  it('PEN-007 PEN-3.1: the opponent\'s Command phase -> no die', () => {
    const { s } = relicState()
    s.activePlayer = 'B'
    const { ctx, events } = ctxOf(s, [4])
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(of(events, 'MiracleDieGained')).toHaveLength(0)
  })

  it('PEN-007 PEN-3.1: a marker the owner does not control -> no die (enemy unit holds it with more OC)', () => {
    const { s, o } = relicState()
    placeUnit(s, SIS, { x: -20, z: -11, gap: 0.3 })
    placeUnit(s, 'B:sisters', { x: o.pos.x + 2, z: o.pos.z, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [4])
    hookService.run(ctx, 'onPhaseEnd', {})
    expect(of(events, 'MiracleDieGained')).toHaveLength(0)
  })
})

// =====================================================================================================================
describe('Divine Judgement (PEN-009, PEN-010)', () => {
  it('PEN-009 PEN-4.1: round 1 start -> the OPPONENT picks; MONSTER and VEHICLE units are not candidates; choice stored for the owner', () => {
    const s = makeState({ round: 1 })
    s.phase = 'command'
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'round.start', 'r1')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.kind).toBe('chooseOption')
    expect(pending.player).toBe('B')
    const ids = pending.options.map((x) => x.id)
    expect(ids).toContain('B:arcos')
    expect(ids).not.toContain('B:rhino')
    expect(ids).not.toContain('B:engine')
    answerOption(ctx, 'B:arcos')
    expect(s.players.A.secondaryState.divineJudgementUnitId).toBe('B:arcos')
    expect(s.players.B.secondaryState.divineJudgementUnitId).toBeUndefined()
  })

  it('PEN-009 PEN-4.1: no pick is offered in round 2', () => {
    const s = makeState({ round: 2 })
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'round.start', 'r2')
    expect(s.pending).toBeNull()
  })

  function scored(set: (s: GameState) => void) {
    const s = makeState({ round: 5 })
    s.players.A.secondaryState.divineJudgementUnitId = B_ARC
    placeUnit(s, B_ARC, { x: -8, z: -3, gap: 0.3 })
    set(s)
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'battle.end', 'end')
    return s
  }
  const destroy = (s: GameState, by: { player: 'A' | 'B' | null; unitId: string | null; kind: 'melee' | 'ranged' | 'mortal' | 'other' }) => {
    s.units[B_ARC].location = 'destroyed'
    s.units[B_ARC].destroyedBy = { player: by.player as 'A', kind: by.kind, round: 4, unitId: by.unitId, modelId: null }
  }

  it('PEN-010 PEN-4.2: destroyed by Repentia melee -> 10 VP', () => {
    const s = scored((x) => destroy(x, { player: 'A', unitId: REP, kind: 'melee' }))
    expect(s.players.A.vp).toBe(10)
  })

  it('PEN-010 PEN-4.2: destroyed by shooting -> 6 VP; by its own side (Hazardous) -> 6 VP', () => {
    expect(scored((x) => destroy(x, { player: 'A', unitId: SIS, kind: 'ranged' })).players.A.vp).toBe(6)
    expect(scored((x) => destroy(x, { player: 'B', unitId: B_ARC, kind: 'melee' })).players.A.vp).toBe(6)
  })

  it('PEN-010 PEN-4.2: survives -> 0; stranded Reserves cull (no killer) -> 6', () => {
    expect(scored(() => undefined).players.A.vp).toBe(0)
    expect(scored((x) => { x.units[B_ARC].location = 'destroyed'; x.units[B_ARC].destroyedBy = null }).players.A.vp).toBe(6)
  })

  it('PEN-010 PEN-4.2: nothing is scored before battle end', () => {
    const s = makeState({ round: 3 })
    s.players.A.secondaryState.divineJudgementUnitId = B_ARC
    s.units[B_ARC].location = 'destroyed'
    s.units[B_ARC].destroyedBy = { player: 'A', kind: 'melee', round: 3, unitId: REP, modelId: null }
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'turn.end', 't3')
    expect(s.players.A.vp).toBe(0)
  })
})

// =====================================================================================================================
describe('Rites of Reconsecration (PEN-011)', () => {
  const zoneSpot = (s: GameState, p: 'A' | 'B') => {
    const poly = s.mission.data.deploymentZones[p]
    const pts = poly as unknown as { x: number; z?: number; y?: number }[]
    return { x: pts.reduce((a, q) => a + q.x, 0) / pts.length, z: pts.reduce((a, q) => a + (q.z ?? q.y ?? 0), 0) / pts.length }
  }
  const run = (round: number, mutate: (s: GameState) => void) => {
    const s = makeState({ round, a: { secondaryId: 'ade.sec.rites-of-reconsecration' } })
    s.phase = 'fight'
    const z = zoneSpot(s, 'B')
    placeUnit(s, REP, { x: z.x, z: z.z, gap: 0.3 })
    mutate(s)
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'turn.end', `t${round}`)
    return s
  }

  it('PEN-011 PEN-4.3: round 2+, unit wholly inside the enemy zone -> 3 VP; round 1 -> 0', () => {
    expect(run(2, () => undefined).players.A.vp).toBe(3)
    expect(run(1, () => undefined).players.A.vp).toBe(0)
  })

  it('PEN-011 PEN-4.3: Battle-shocked -> 0; one model outside -> 0', () => {
    expect(run(2, (s) => { s.units[REP].battleShocked = true }).players.A.vp).toBe(0)
    expect(run(2, (s) => { const m = s.units[REP].models[0]; s.models[m].pos = { x: 0, y: 0, z: 0 } }).players.A.vp).toBe(0)
  })
})

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
function stratHarness(s: GameState, dice: number[] = []) {
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: stratServices(), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(s, new ScriptedRng(dice), modules)
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

describe('Holy Radiance (PEN-014, PEN-015)', () => {
  const HR = 'ade.s.pen.holy-radiance'
  function armed(dice: number[]) {
    const s = makeState()
    placeUnit(s, REP, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, B_ARC, { x: -8, z: -3, gap: 0.3 })
    phase(s, 'fight', 'B', { A: 2 })
    s.players.A.miracle.dice = [2, 5]
    const h = stratHarness(s, dice)
    h.ctx.window('fight.targetsDeclared', B_ARC, h.ctx.order.defensive('A'), { unitId: B_ARC, targetUnitId: REP })
    return { s, h }
  }

  it('PEN-014 PEN-5.3: no Miracle discard prompt; a not-yet-fought model is destroyed with no D6 -> it stays and is removed after the enemy unit fights', () => {
    const { s, h } = armed([])
    h.useOption(HR, REP)
    expect(s.pending).toBeNull() // no discard prompt although the pool holds dice
    expect(s.players.A.miracle.dice).toEqual([2, 5])
    expect(s.players.A.cp).toBe(0)
    const { ctx, events } = ctxOf(s, []) // an empty script throws if anything rolls
    const victim = s.units[REP].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: B_ARC, modelId: null, kind: 'melee' })
    expect(s.models[victim]?.removalDeferred).toBe(true)
    expect(of(events, 'ModelRemovalDeferred').map((e) => e.modelId)).toEqual([victim])
  })

  it('PEN-014 PEN-5.3: a model whose unit already fought is removed at once', () => {
    const { s, h } = armed([])
    h.useOption(HR, REP)
    s.phaseState.fight!.fought.push(REP)
    const { ctx } = ctxOf(s, [])
    const victim = s.units[REP].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: B_ARC, modelId: null, kind: 'melee' })
    expect(s.models[victim]).toBeUndefined()
  })

  it('PEN-014 PEN-5.3: not offered in the Shooting phase', () => {
    const s = makeState()
    placeUnit(s, REP, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, B_ARC, { x: -8, z: -3, gap: 0.3 })
    phase(s, 'shooting', 'B', { A: 2 })
    const offered = stratagemService.options(s, 'A', 'shooting.targetsDeclared', { unitId: B_ARC, targetUnitId: REP }).filter((x) => x.stratagemId === HR)
    expect(offered).toHaveLength(0)
  })

  it('PEN-015 PEN-5.3: Sanctuary Guardians A Martyr\'s Death still prompts for a Miracle discard and rolls a D6', () => {
    const s = makeState({ sg: true, a: {} })
    placeUnit(s, 'A:sacresants', { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, 'B:arcos', { x: -8, z: -3, gap: 0.3 })
    phase(s, 'shooting', 'B', { A: 1 })
    s.players.A.miracle.dice = [2, 5]
    const h = stratHarness(s, [3])
    h.ctx.window('shooting.targetsDeclared', 'B:arcos', h.ctx.order.defensive('A'), { unitId: 'B:arcos', targetUnitId: 'A:sacresants' })
    h.useOption('ade.s.a-martyrs-death', 'A:sacresants')
    expect((s.pending as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['keep', 'discard:2', 'discard:5'])
    answerOption(h.ctx, 'keep')
    const { ctx } = ctxOf(s, [3])
    const victim = s.units['A:sacresants'].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: 'B:arcos', modelId: null, kind: 'ranged' })
    expect(s.models[victim]).toBeUndefined() // D6 3 < 4 -> falls
  })
})

// =====================================================================================================================
describe('Angelic Ascent (PEN-017)', () => {
  function shot() {
    const s = makeState()
    phase(s, 'shooting', 'A')
    placeUnit(s, SER, { x: -12, z: -3, gap: 0.3 })
    return s
  }

  it('PEN-017 PEN-6.3: after shooting, outside Engagement Range -> offered a Normal move; using it forbids a charge and opens a 6" move', () => {
    const s = shot()
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', SER)).toBe(true)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.options.map((o) => o.id)).toEqual(['use', 'decline'])
    answerOption(ctx, 'use')
    const move = s.pending as unknown as { kind: string; constraints: { maxDistance?: number } }
    expect(move.kind).toBe('moveUnit')
    // PEN-6.3: choosing 'use' alone does not cost the charge — only taking the move does (params.forfeitCharge)
    expect(JSON.stringify(s.units[SER].effects)).not.toContain('"forbid":"charge"')
    expect(s.abilities[Object.keys(s.abilities).find((k) => s.abilities[k].code === 'angelicAscent')!].params?.forfeitCharge).toBe(true)
  })

  it('PEN-017 PEN-6.3: use then pass the move keeps the charge', () => {
    const s = shot()
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.attacksResolved', SER)
    answerOption(ctx, 'use')
    const mv = s.pending as unknown as { id: string; player: 'A' | 'B' }
    s.pending = null
    shootingModule.handle(ctx, { type: 'pass', player: mv.player, decisionId: mv.id } as Action, mv as never)
    expect(JSON.stringify(s.units[SER].effects)).not.toContain('forbid')
  })

  it('PEN-017 PEN-6.3: declining keeps the charge; within Engagement Range -> no offer', () => {
    const s = shot()
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.attacksResolved', SER)
    answerOption(ctx, 'decline')
    expect(s.pending).toBeNull()
    expect(JSON.stringify(s.units[SER].effects)).not.toContain('forbid')
    const t = shot()
    placeUnit(t, B_ARC, { x: -12, z: -1.6, gap: 0.2 })
    expect(hookService.offerPicks(ctxOf(t).ctx, 'shooting.attacksResolved', SER)).toBe(false)
  })

  it('PEN-017 PEN-6.3: not offered to a unit without the ability, nor in the opponent\'s turn', () => {
    const s = shot()
    placeUnit(s, REP, { x: -12, z: 6, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.attacksResolved', REP)).toBe(false)
    s.activePlayer = 'B'
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.attacksResolved', SER)).toBe(false)
  })
})

// =====================================================================================================================
// ---------- hook-level behaviour checks (PEN-006, 010, 012, 013, 016, 019, 027) ----------
function attackOf(s: GameState, modelId: string, weaponId: string, targetUnitId: string, targetModelId?: string, charged = false) {
  const m = s.models[modelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId: modelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: targetModelId ?? s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged, oathTarget: false, attackerInEngagement: false,
  } as never
}
function rollCtx(unmodified: number, purpose: 'hit' | 'wound' | 'save' | 'feelNoPain'): never {
  const roll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false } as never
}
const modelOfDatasheet = (s: GameState, unitId: string, key: string): string =>
  s.units[unitId].models.find((id) => s.models[id].datasheetModelId === key || s.models[id].datasheetModelId.endsWith(`/${key}`))!
const meleeWeaponOf = (s: GameState, modelId: string): string => s.models[modelId].weapons.find((w) => s.weapons[w].kind === 'melee')!
const rangedWeaponOf = (s: GameState, modelId: string): string => s.models[modelId].weapons.find((w) => s.weapons[w].kind === 'ranged')!
const hitResults = (s: GameState, atk: never, die: number) =>
  hookService.collect(ctxOf(s).ctx, 'onHitRoll', { attack: atk, roll: rollCtx(die, 'hit') }).map((r) => r.result)

describe('Penitent Host datasheet and stratagem behaviour', () => {
  it('PEN-027 E-PEN3: unitHasModel is true only while a matching live model exists', () => {
    const s = makeState()
    placeUnit(s, REP, { x: -12, z: -3, gap: 0.3 })
    const env = { state: s, holder: s.units[REP], player: 'A' as const, attack: null, roll: null, weapon: null }
    expect(evaluateCondition(env, { unitHasModel: 'superior' })).toBe(true)
    expect(evaluateCondition(env, { unitHasModel: 'no-such-model' })).toBe(false)
    const { ctx } = ctxOf(s)
    attackService.destroyModel(ctx, modelOfDatasheet(s, REP, 'superior'), { player: 'B', unitId: B_ARC, modelId: null, kind: 'melee' })
    expect(evaluateCondition({ state: s, holder: s.units[REP], player: 'A', attack: null, roll: null, weapon: null }, { unitHasModel: 'superior' })).toBe(false)
  })

  it('PEN-019 PEN-6.4: Overseer of Redemption re-rolls melee hits while the Superior lives, not after', () => {
    const s = makeState()
    placeUnit(s, REP, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, B_ARC, { x: -10, z: -3, gap: 0.3 })
    const rm = modelOfDatasheet(s, REP, 'repentia')
    const melee = meleeWeaponOf(s, rm)
    expect(hitResults(s, attackOf(s, rm, melee, B_ARC), 2)).toContainEqual({ kind: 'roll', reroll: 'all' })
    const { ctx } = ctxOf(s)
    attackService.destroyModel(ctx, modelOfDatasheet(s, REP, 'superior'), { player: 'B', unitId: B_ARC, modelId: null, kind: 'melee' })
    expect(hitResults(s, attackOf(s, rm, melee, B_ARC), 2)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
  })

  it('PEN-016 PEN-6.1: Lead the Righteous re-rolls hits for a led unit only', () => {
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, CAN, [[-12, -1]])
    placeUnit(s, B_ARC, { x: -8, z: -3, gap: 0.3 })
    const sm = s.units[SIS].models[0]
    const w = rangedWeaponOf(s, sm)
    expect(s.units[CAN].bodyguardUnitId).toBe(SIS)
    expect(hitResults(s, attackOf(s, sm, w, B_ARC), 2)).toContainEqual({ kind: 'roll', reroll: 'all' })
    const u = makeState({ a: { attachments: [] } })
    placeUnit(u, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(u, B_ARC, { x: -8, z: -3, gap: 0.3 })
    expect(hitResults(u, attackOf(u, u.units[SIS].models[0], w, B_ARC), 2)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
  })

  it('PEN-012 PEN-5.1: Ascetic Discipline gives Repentia a 5+ invuln and Battle Sisters 4+; not in own Shooting phase', () => {
    const AD = 'ade.s.pen.ascetic-discipline'
    const invulnFor = (target: string): unknown[] => {
      const s = makeState()
      placeUnit(s, target, { x: -12, z: -3, gap: 0.3 })
      placeUnit(s, SIS, { x: -6, z: -3, gap: 0.3 })
      phase(s, 'shooting', 'A', { B: 2 })
      const h = stratHarness(s)
      h.ctx.window('shooting.targetsDeclared', SIS, h.ctx.order.defensive('B'), { unitId: SIS, targetUnitId: target })
      h.useOption(AD, target)
      const am = s.units[SIS].models[0]
      return hookService.collect(h.ctx, 'onSaveRoll', { attack: attackOf(s, am, rangedWeaponOf(s, am), target), roll: rollCtx(3, 'save') }).map((r) => r.result)
    }
    expect(invulnFor(B_REP)).toContainEqual({ kind: 'roll', invuln: 5 })
    expect(invulnFor('B:sisters')).toContainEqual({ kind: 'roll', invuln: 4 })
    const o = makeState()
    placeUnit(o, SIS, { x: -6, z: -3, gap: 0.3 })
    phase(o, 'shooting', 'A', { A: 2 })
    expect(stratagemService.options(o, 'A', 'shooting.targetsDeclared', { unitId: B_ARC, targetUnitId: SIS }).filter((x) => x.stratagemId === AD)).toHaveLength(0)
  })

  it('PEN-013 PEN-5.2: A Martyr\'s Death grants Lethal Hits to the unit\'s weapons until phase end; not in the opponent\'s turn', () => {
    const MD = 'ade.s.pen.a-martyrs-death'
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, B_ARC, { x: -8, z: -3, gap: 0.3 })
    phase(s, 'shooting', 'A', { A: 2 })
    const sm = s.units[SIS].models[0]
    const w = rangedWeaponOf(s, sm)
    const lethal = () => hookService.weaponAbilitiesFor(s, sm, s.weapons[w], attackOf(s, sm, w, B_ARC)).some((a) => a.ability === 'LETHAL_HITS')
    expect(lethal()).toBe(false)
    const h = stratHarness(s)
    h.ctx.window('shooting.start', SIS, h.ctx.order.active(), { unitId: SIS })
    h.useOption(MD, SIS)
    expect(lethal()).toBe(true)
    const t = makeState()
    placeUnit(t, SIS, { x: -12, z: -3, gap: 0.3 })
    phase(t, 'shooting', 'B', { A: 2 })
    expect(stratagemService.options(t, 'A', 'shooting.start', { unitId: SIS }).filter((x) => x.stratagemId === MD)).toHaveLength(0)
  })

  it('PEN-006 PEN-3: Armour of Faith gives the bearer FNP 4+ and the led Battle Sisters FNP 5+, until the bearer dies', () => {
    const s = makeState({ a: { enhancementId: 'ade.e.armour-of-faith' } })
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, CAN, [[-12, -1]])
    placeUnit(s, 'B:sisters', { x: -8, z: -3, gap: 0.3 })
    const bm = s.units['B:sisters'].models[0]
    const bw = rangedWeaponOf(s, bm)
    const fnp = (target: string, model: string) =>
      hookService.collect(ctxOf(s).ctx, 'onFeelNoPainRoll', { attack: attackOf(s, bm, bw, target, model), roll: rollCtx(3, 'feelNoPain') }).map((r) => r.result)
    const canModel = s.units[CAN].models[0]
    expect(fnp(CAN, canModel)).toContainEqual({ kind: 'roll', feelNoPain: 4 })
    expect(fnp(SIS, s.units[SIS].models[0])).toContainEqual({ kind: 'roll', feelNoPain: 5 })
    const { ctx } = ctxOf(s, [1, 1, 1, 1])
    attackService.destroyModel(ctx, canModel, { player: 'B', unitId: 'B:sisters', modelId: null, kind: 'ranged' })
    expect(fnp(SIS, s.units[SIS].models[0])).not.toContainEqual({ kind: 'roll', feelNoPain: 5 })
  })

  it('PEN-010 PEN-4.2: judged unit embarked in a transport at battle end -> 0', () => {
    const s = makeState({ round: 5 })
    s.players.A.secondaryState.divineJudgementUnitId = 'B:sisters'
    placeUnit(s, 'B:rhino', [[-10, 0]])
    s.units['B:sisters'].location = 'board'
    transportService.embark(s, 'B:sisters', 'B:rhino')
    missionService.onWindow(ctxOf(s).ctx, 'battle.end', 'end')
    expect(s.players.A.vp).toBe(0)
  })

  it('PEN-010 PEN-4.2: each half of an attached unit is a candidate; only the picked half must be destroyed', () => {
    const s = makeState({ round: 1 })
    s.phase = 'command'
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'round.start', 'r1')
    const ids = (s.pending as ChooseOptionDecision).options.map((o) => o.id)
    expect(ids).toContain('B:canoness')
    expect(ids).toContain('B:sisters')
    answerOption(ctx, 'B:canoness')
    expect(s.players.A.secondaryState.divineJudgementUnitId).toBe('B:canoness')
    s.units['B:canoness'].location = 'destroyed'
    s.units['B:canoness'].destroyedBy = { player: 'A', kind: 'ranged', round: 3, unitId: SIS, modelId: null }
    s.round = 5
    missionService.onWindow(ctxOf(s).ctx, 'battle.end', 'end')
    expect(s.players.A.vp).toBe(6)
  })
})

// =====================================================================================================================
describe('Penitent Host review fixes', () => {
  it('PEN-019 PEN-6.4: wound re-roll only after a Charge move; bolt-pistol shots are unaffected', () => {
    const s = makeState()
    placeUnit(s, REP, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, B_ARC, { x: -10, z: -3, gap: 0.3 })
    const rm = modelOfDatasheet(s, REP, 'repentia')
    const melee = meleeWeaponOf(s, rm)
    s.units[REP].turn.chargedThisTurn = true
    const wound = (charged: boolean, model = rm, w = melee) =>
      hookService.collect(ctxOf(s).ctx, 'onWoundRoll', { attack: attackOf(s, model, w, B_ARC, undefined, charged), roll: rollCtx(2, 'wound') }).map((r) => r.result)
    expect(wound(true)).toContainEqual({ kind: 'roll', reroll: 'all' })
    s.units[REP].turn.chargedThisTurn = false
    expect(wound(false)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
    const sup = modelOfDatasheet(s, REP, 'superior')
    const ranged = s.models[sup].weapons.find((w) => s.weapons[w].kind === 'ranged')
    if (ranged) {
      expect(hitResults(s, attackOf(s, sup, ranged, B_ARC), 2)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
      s.units[REP].turn.chargedThisTurn = true
      expect(wound(true, sup, ranged)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
    }
  })

  it('PEN-012 PEN-5.1: Ascetic Discipline expires at phase end', () => {
    const AD = 'ade.s.pen.ascetic-discipline'
    const s = makeState()
    placeUnit(s, B_REP, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, SIS, { x: -6, z: -3, gap: 0.3 })
    phase(s, 'shooting', 'A', { B: 2 })
    const h = stratHarness(s)
    h.ctx.window('shooting.targetsDeclared', SIS, h.ctx.order.defensive('B'), { unitId: SIS, targetUnitId: B_REP })
    h.useOption(AD, B_REP)
    const am = s.units[SIS].models[0]
    const inv = () => hookService.collect(h.ctx, 'onSaveRoll', { attack: attackOf(s, am, rangedWeaponOf(s, am), B_REP), roll: rollCtx(3, 'save') }).map((r) => r.result)
    expect(inv()).toContainEqual({ kind: 'roll', invuln: 5 })
    s.phase = 'fight'
    s.phaseState = emptyPhaseState()
    h.ctx.services.effects.expire(h.ctx, 'phaseEnd', null)
    s.phase = 'shooting'
    expect(inv()).not.toContainEqual({ kind: 'roll', invuln: 5 })
  })

  it('PEN-020 PEN-6: Repentia per-model stats - Superior Sv 3+ Ld 7+; Sister Repentia Sv 7+ Ld 8+, 6+ invuln, FNP 5+', () => {
    const s = makeState()
    placeUnit(s, REP, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, B_ARC, { x: -8, z: -3, gap: 0.3 })
    const sup = modelOfDatasheet(s, REP, 'superior')
    const rep = modelOfDatasheet(s, REP, 'repentia')
    expect(modelStats(s, s.models[sup])).toMatchObject({ Sv: 3, Ld: 7 })
    expect(modelStats(s, s.models[rep])).toMatchObject({ Sv: 7, Ld: 8 })
    const fnp = datasheetOf(s, REP).coreAbilities.find((c) => c.ability === 'FEEL_NO_PAIN')
    expect(Number(fnp?.value)).toBe(5)
    expect(datasheetOf(s, REP).invuln).toBe(6)
  })

  it('PEN-024 E-PEN2: Battle Sisters may embark in the Rhino, Seraphim (JUMP PACK) may not, capacity counts models (12)', () => {
    const s = makeState({ a: { attachments: [] } })
    placeUnit(s, RHINO, [[-10, 0]])
    placeUnit(s, SIS, { x: -10, z: 4, gap: 0.3 })
    placeUnit(s, SER, { x: -10, z: -4, gap: 0.3 })
    for (const u of [SIS, SER]) s.units[u].turn = { ...(s.units[u].turn ?? {}), moveType: 'normal' } as never
    expect(transportService.canCarry(s, SIS, RHINO)).toBe(true)
    expect(transportService.canCarry(s, SER, RHINO)).toBe(false)
    expect(transportService.canEmbark(s, SER, RHINO)).toBe(false)
    const cap = s.units[RHINO].models.length
    expect(cap).toBeGreaterThan(0)
    transportService.embark(s, SIS, RHINO)
    expect(transportService.canCarry(s, REP, RHINO)).toBe(s.units[SIS].models.length + s.units[REP].models.length <= 12)
  })

  function loadedRhino() {
    const s = makeState()
    s.phase = 'shooting'
    placeUnit(s, RHINO, [[-10, 0]])
    placeUnit(s, B_ARC, { x: -4, z: 0, gap: 0.3 })
    s.units[SIS].location = 'board'
    transportService.embark(s, SIS, RHINO)
    return s
  }

  it('PEN-025 E-PEN2: legalActions for a Rhino loaded with Sisters still offers the Rhino storm bolter', () => {
    const s = loadedRhino()
    const { ctx } = ctxOf(s)
    const entries = buildShootingWeaponEntries(ctx, RHINO)
    const pending = { kind: 'declareTargets', id: 'd:x', player: 'A', window: 'shooting.start', canPass: true, context: { unitId: RHINO, attackKind: 'ranged', overwatch: false, weapons: entries, engagedWith: [] } } as never
    const acts = shootingModule.legalActions!(s, pending) as Action[]
    const decls = acts.filter((a) => a.type === 'declareTargets') as Array<Extract<Action, { type: 'declareTargets' }>>
    expect(decls.length).toBeGreaterThan(0)
    const own = decls.find((d) => d.targets.every((t) => s.models[t.modelId].unitId === RHINO))
    expect(own).toBeTruthy()
    expect(own!.targets.some((t) => t.weaponId.includes('storm-bolter'))).toBe(true)
    // the Firing Deck variant (if offered) never exceeds 2 passenger models
    for (const d of decls) expect(new Set(d.targets.filter((t) => s.models[t.modelId].unitId === SIS).map((t) => t.modelId)).size).toBeLessThanOrEqual(2)
  })

  it('PEN-025 E-PEN2: a failed Hazardous test on a Firing Deck weapon wounds the transport (RULING: transport model takes it)', () => {
    const s = loadedRhino()
    placeUnit(s, SER, { x: -10, z: 6, gap: 0.3 })
    s.units[SER].location = 'board'
    transportService.embark(s, SER, RHINO)
    const sm = s.units[SER].models.find((m) => s.models[m].weapons.includes('ade.w.seraphim-plasma-pistol-supercharge'))!
    const before = s.units[RHINO].models.reduce((n, m) => n + s.models[m].woundsRemaining, 0)
    const { ctx, events } = ctxOf(s, Array(60).fill(1))
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: RHINO, overwatch: false, targets: [{ modelId: sm, weaponId: 'ade.w.seraphim-plasma-pistol-supercharge', targetUnitId: B_ARC }] as never })
    for (let i = 0; i < 20 && attackService.advance(ctx) === 'pending' && s.pending; i++) {
      const p = s.pending as ChooseOptionDecision
      if (p.kind !== 'chooseOption') break
      answerOption(ctx, p.options[0].id)
    }
    const haz = events.filter((e) => e.type === 'HazardousTested')
    expect(haz.length).toBeGreaterThan(0)
    const after = s.units[RHINO].models.reduce((n, m) => n + (s.models[m]?.woundsRemaining ?? 0), 0)
    expect(after).toBeLessThan(before)
  })
})
