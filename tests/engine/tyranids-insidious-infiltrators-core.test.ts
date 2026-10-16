// Engine changes beyond code hooks for the Insidious Infiltrators patrol (docs/spec/factions/tyranids--insidious-infiltrators.md 7.1):
// C1 attack-sequence editing (Psionic Phantoms re-declare / drop) and C2 Predators, Not Prey movement effects. Checklist INF-*.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, createContext, removeModel,
  type Action, type DeclaredTarget, type EngineContext, type GameState, type ModuleTable,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { movementModule, unitAutoPassesDesperateEscape, unitMovesThroughModels } from '../../src/engine/phases/movement'
import { freshState, makePlayerA, makePlayerB, placeUnit, recordingStratagems } from '../fixtures'

const GRUNTS = 'A:grunts', MOB = 'B:mob', BRUTE = 'B:brute', BOSS = 'A:boss'

function harness(dice: number[] = [], opts: { attachments?: boolean } = {}) {
  const state = freshState({ players: { A: makePlayerA(opts.attachments === false ? { attachments: [] } : {}), B: makePlayerB() } })
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  return { state, ctx, events }
}
const tgt = (modelId: string, targetUnitId: string): DeclaredTarget => ({ modelId, weaponId: 'red.w.gun', targetUnitId, profileGroup: null, attacks: null })

function seq(ctx: EngineContext): void {
  placeUnit(ctx.state, GRUNTS, [{ x: 0, y: 0, z: 0 }, { x: 1.3, y: 0, z: 0 }, { x: 2.6, y: 0, z: 0 }])
  placeUnit(ctx.state, MOB, [{ x: 0, y: 0, z: 10 }])
  placeUnit(ctx.state, BRUTE, [{ x: 8, y: 0, z: 10 }])
  attackService.begin(ctx, {
    kind: 'ranged', attackerUnitId: GRUNTS, overwatch: false,
    targets: [tgt(`${GRUNTS}#0`, MOB), tgt(`${GRUNTS}#1`, MOB), tgt(`${GRUNTS}#2`, BRUTE)],
  })
}

describe('INF C1: attack sequence editing (Psionic Phantoms)', () => {
  it('INF-018 removeDeclaredTargets removes the matching pairs, their groups, and recomputes targetUnitIds', () => {
    const { ctx } = harness()
    seq(ctx)
    const removed = attackService.removeDeclaredTargets(ctx, (t) => t.targetUnitId === MOB)
    expect(removed.map((t) => t.modelId).sort()).toEqual([`${GRUNTS}#0`, `${GRUNTS}#1`])
    const a = ctx.state.phaseState.attack!
    expect(a.targets.map((t) => t.targetUnitId)).toEqual([BRUTE])
    expect(a.groups.map((g) => g.targetUnitId)).toEqual([BRUTE])
    expect(a.targetUnitIds).toEqual([BRUTE])
  })

  it('INF-018 appendDeclaredTargets adds groups for the new targets, emits TargetsDeclared, and keeps the others', () => {
    const { ctx, events } = harness()
    seq(ctx)
    const removed = attackService.removeDeclaredTargets(ctx, (t) => t.targetUnitId === MOB)
    const before = events.filter((e) => e.type === 'TargetsDeclared').length
    attackService.appendDeclaredTargets(ctx, removed.map((t) => ({ ...t, targetUnitId: BRUTE })))
    const a = ctx.state.phaseState.attack!
    expect(a.groups).toHaveLength(3)
    expect(a.groups.every((g) => g.targetUnitId === BRUTE)).toBe(true)
    expect(a.targets).toHaveLength(3)
    expect(a.targetUnitIds).toEqual([BRUTE])
    expect(events.filter((e) => e.type === 'TargetsDeclared').length).toBe(before + 1)
    expect(a.groups.map((g) => g.resolved)).toEqual([0, 0, 0])
    expect(ctx.state.phaseState.marks.some((m) => m.startsWith(`blastCount:${BRUTE}=`))).toBe(true)
  })

  it('INF-019 dropAttackerModels removes those models from every group, including weapons aimed at other units; empty groups vanish', () => {
    const { ctx } = harness()
    seq(ctx)
    attackService.dropAttackerModels(ctx, [`${GRUNTS}#0`, `${GRUNTS}#2`])
    const a = ctx.state.phaseState.attack!
    expect(a.groups.flatMap((g) => g.attackerModelIds)).toEqual([`${GRUNTS}#1`])
    expect(a.groups.map((g) => g.targetUnitId)).toEqual([MOB])
    expect(a.targets.map((t) => t.modelId)).toEqual([`${GRUNTS}#1`])
    expect(a.targetUnitIds).toEqual([MOB])
  })
})

// a stand-in for the effect Predators, Not Prey grants (stratagem effect list on the holder, scope self)
function grantPredators(state: GameState, unitId: string): void {
  state.units[unitId].effects.push({
    id: 'e-pnp', sourceAbilityId: 'tyr.s.predators-not-prey', sourceUnitId: null,
    effect: [{ moveThroughModels: true }, { autoPassDesperateEscape: true }],
    scope: { who: 'self' }, expires: { kind: 'phaseEnd', round: state.round, player: null }, when: null,
  } as never)
}
const DID = ''
function act(ctx: EngineContext, action: Action): void {
  if (!ctx.state.pending) movementModule.advance(ctx)
  const pending = ctx.state.pending!
  const rej = movementModule.validate?.(ctx.state, action, pending)
  if (rej) throw new Error(`rejected ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const h = movementModule.handle(ctx, action, pending)
  if (h) throw new Error(`handle rejected ${h.code} ${h.reason}`)
  movementModule.advance(ctx)
}

describe('INF C2: Predators, Not Prey movement effects', () => {
  it('INF-029 the helpers read the granted effect; without it both are false', () => {
    const { state } = harness()
    expect(unitMovesThroughModels(state, GRUNTS)).toBe(false)
    expect(unitAutoPassesDesperateEscape(state, GRUNTS)).toBe(false)
    grantPredators(state, GRUNTS)
    expect(unitMovesThroughModels(state, GRUNTS)).toBe(true)
    expect(unitAutoPassesDesperateEscape(state, GRUNTS)).toBe(true)
    expect(unitMovesThroughModels(state, MOB)).toBe(false)
  })

  it('INF-029 a Normal move crossing an enemy model is rejected normally, accepted with the effect; ending on it is still rejected', () => {
    const { ctx } = harness([], { attachments: false })
    movementModule.enter(ctx)
    placeUnit(ctx.state, BOSS, [{ x: -2.9, y: 0, z: 0 }])
    placeUnit(ctx.state, MOB, [{ x: 0, y: 0, z: 0 }])
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: BOSS })
    act(ctx, { type: 'declareMove', player: 'A', decisionId: DID, unitId: BOSS, moveType: 'normal' })
    const pending = ctx.state.pending!
    const through: Action = { type: 'moveUnit', player: 'A', decisionId: DID, unitId: BOSS, placements: [{ modelId: `${BOSS}#0`, pos: { x: 3, y: 0, z: 0 } }] }
    grantPredators(ctx.state, BOSS)
    expect(movementModule.validate?.(ctx.state, through, pending) ?? null).toBeNull()
    const onto: Action = { type: 'moveUnit', player: 'A', decisionId: DID, unitId: BOSS, placements: [{ modelId: `${BOSS}#0`, pos: { x: 0, y: 0, z: 0 } }] }
    expect(movementModule.validate?.(ctx.state, onto, pending)?.code).toBe('E_OVERLAP')
    ctx.state.units[BOSS].effects = []
    expect(['E_OVERLAP', 'E_ENGAGEMENT']).toContain(movementModule.validate?.(ctx.state, through, pending)?.code)
  })

  it('INF-030 a Fall Back crossing an enemy rolls no Desperate Escape dice and loses no models', () => {
    const { ctx, events } = harness([1, 1, 1], { attachments: false })
    ctx.state.activePlayer = 'B'
    movementModule.enter(ctx)
    for (let i = 9; i >= 1; i--) removeModel(ctx.state, `${MOB}#${i}`)
    placeUnit(ctx.state, MOB, [{ x: 1, y: 0, z: 0 }])
    placeUnit(ctx.state, BOSS, [{ x: 0, y: 0, z: 0 }])
    grantPredators(ctx.state, MOB)
    const before = ctx.state.units[MOB].models.length
    act(ctx, { type: 'chooseUnitToActivate', player: 'B', decisionId: DID, unitId: MOB })
    act(ctx, { type: 'declareMove', player: 'B', decisionId: DID, unitId: MOB, moveType: 'fallBack' })
    act(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: MOB, placements: ctx.state.units[MOB].models.map((id, i) => ({ modelId: id, pos: { x: -4, y: 0, z: i * 1.3 } })) })
    const de = events.filter((e) => e.type === 'DesperateEscapeRolled') as { dice: number[]; casualties: number }[]
    expect(de.every((e) => e.dice.length === 0 && e.casualties === 0)).toBe(true)
    expect(ctx.state.units[MOB].models.length).toBe(before)
  })
})
