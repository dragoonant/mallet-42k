// Adversarial verification of src/engine/phases/shooting.ts (SHOOT-* phase-flow cases).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, mmToInch,
  type Action, type EngineContext, type GameEvent, type GameState, type PendingDecision, type Rejection,
} from '../../src/engine'
import { buildShootingWeaponEntries, shootingModule } from '../../src/engine/phases/shooting'
import { leaderService } from '../../src/engine/leaders'
import type { DataBundle } from '../../src/data/types'
import { bundle, withBundle } from '../fixtures/bundle'
import { makePlayerA, makePlayerB, makeSetup } from '../fixtures/setup'
import { placeUnit } from '../fixtures/state'
import { recordingStratagems } from '../fixtures/modules'

type SetupOv = Parameters<typeof makeSetup>[0]
function unattached(): SetupOv { return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } } }
function stateWith(ov: SetupOv = unattached(), patch?: (b: DataBundle) => void, b0?: DataBundle): GameState {
  const b = b0 ?? (patch ? withBundle(patch) : bundle)
  const s = createGameState(makeSetup(ov), b, 'verify', ENGINE_VERSION)
  s.phase = 'shooting'
  return s
}
function placeExact(state: GameState, unitId: string, positions: Record<string, { x: number; z: number }>): void {
  const base = 2000 + [...unitId].reduce((a, c) => a + c.charCodeAt(0), 0) * 137
  state.units[unitId].location = 'board'
  state.units[unitId].models.forEach((id, i) => {
    const p = positions[id]
    state.models[id].pos = p ? { x: p.x, y: 0, z: p.z } : { x: base + i, y: 0, z: base + i }
  })
}
function start(state: GameState, dice: number[] = [], modules = DEFAULT_MODULES) {
  const h = createContext(state, new ScriptedRng(dice), modules)
  shootingModule.enter(h.ctx)
  return h
}
function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) shootingModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = shootingModule.validate?.(ctx.state, action, pending)
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = shootingModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code}`)
  return shootingModule.advance(ctx)
}
function validateOnly(ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) shootingModule.advance(ctx)
  return shootingModule.validate?.(ctx.state, action, ctx.state.pending as PendingDecision) ?? null
}
function legal(ctx: EngineContext, unitId: string, weaponId: string, modelId?: string): string[] | undefined {
  return buildShootingWeaponEntries(ctx, unitId).find((e) => e.weaponId === weaponId && (!modelId || e.modelId === modelId))?.legalTargets
}
const of = <T extends GameEvent['type']>(evs: GameEvent[], t: T) => evs.filter((e) => e.type === t) as Extract<GameEvent, { type: T }>[]

function crateBundle(patch?: (b: DataBundle) => void): DataBundle {
  const b = withBundle(patch ?? (() => {}))
  b.terrainLayouts['terrain.v'] = {
    id: 'terrain.v', board: { w: 4000, h: 4000 },
    pieces: [{ id: 'box', kind: 'crate', pos: { x: 0, z: 0 }, rot: 0, footprint: [{ x: -0.5, z: -2 }, { x: 0.5, z: -2 }, { x: 0.5, z: 2 }, { x: -0.5, z: 2 }], height: 4, traits: ['cover', 'scalable'] as never }],
  }
  b.missions['mission.test'] = { ...b.missions['mission.test'], board: { w: 4000, h: 4000 }, terrainLayouts: ['terrain.v'] }
  return b
}

describe('shooting verify: Blast and Engagement Range (SHOOT-005, SHOOT-006, SHOOT-007)', () => {
  const setupBruteEngaged = (s: GameState) => {
    placeUnit(s, 'A:grunts', { x: 0, z: -0.5, gap: 0.3 })
    placeUnit(s, 'B:brute', [[0, 1.5]]) // MONSTER engaged with A:grunts (not with A:walker)
    placeUnit(s, 'A:walker', [[-12, -12]])
  }
  it('SHOOT-005-blast-control a non-Blast cannon may target an enemy MONSTER engaged with a different friendly unit', () => {
    const s = stateWith(unattached(), (b) => { (b.weapons['red.w.cannon'] as any).abilities = [{ ability: 'HEAVY' }] })
    setupBruteEngaged(s)
    const { ctx } = start(s)
    expect(leaderService.unitsInEngagement(s, 'A:grunts', 'B:brute')).toBe(true)
    expect(legal(ctx, 'A:walker', 'red.w.cannon')).toContain('B:brute')
  })
  it('SHOOT-005-blast-friendly a Blast weapon may never target a unit within Engagement Range of ANY friendly unit', () => {
    const s = stateWith(unattached())
    setupBruteEngaged(s)
    const { ctx } = start(s)
    expect(leaderService.inEngagementWithEnemy(s, 'A:walker')).toBe(false)
    expect(legal(ctx, 'A:walker', 'red.w.cannon')).not.toContain('B:brute')
  })
  it('SHOOT-007-pistol-only engaged non-VEHICLE unit may shoot the VEHICLE it is engaged with using Pistols only, and nothing else', () => {
    const s = stateWith(unattached())
    s.activePlayer = 'B'
    placeUnit(s, 'A:walker', [[0, 0]])
    placeUnit(s, 'B:mob', { x: -2, z: 2.5, gap: 0.3 })
    placeUnit(s, 'A:grunts', { x: -2, z: 10, gap: 0.3 })
    placeUnit(s, 'B:kopta', [[12, -8]])
    const { ctx } = start(s)
    expect(leaderService.unitsInEngagement(s, 'B:mob', 'A:walker')).toBe(true)
    const mob = buildShootingWeaponEntries(ctx, 'B:mob')
    expect(mob.length).toBeGreaterThan(0)
    expect(mob.every((e) => e.weaponId === 'blu.w.slugga')).toBe(true)
    expect(mob.every((e) => e.legalTargets.every((t) => t === 'A:walker'))).toBe(true)
    expect(mob.some((e) => e.legalTargets.includes('A:walker'))).toBe(true)
    // unengaged kopta may target the walker although it is in ER of friendly B:mob (enemy VEHICLE exception)
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).toContain('A:walker')
  })
  it('SHOOT-005-other-target engaged VEHICLE may shoot a non-Blast weapon at a different, unengaged unit', () => {
    const s = stateWith(unattached())
    s.activePlayer = 'B'
    placeUnit(s, 'B:kopta', [[0, -2]])
    placeUnit(s, 'A:walker', [[0, 0]])
    placeUnit(s, 'A:grunts', { x: -2, z: -12, gap: 0.3 })
    const { ctx } = start(s)
    expect(leaderService.unitsInEngagement(s, 'B:kopta', 'A:walker')).toBe(true)
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).toContain('A:grunts')
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).toContain('A:walker')
  })
  it('SHOOT-003-pistol-monster engaged Pistol unit cannot target a nearby MONSTER it is not engaged with', () => {
    const s = stateWith(unattached())
    placeUnit(s, 'A:grunts', { x: 0, z: -0.5, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: 0, z: 1.0, gap: 0.3 })
    placeUnit(s, 'B:brute', [[0, -8]])
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.pistol', 'A:grunts#0')).not.toContain('B:brute')
  })
  it('SHOOT-004-attached an attached enemy unit engaged with a friendly unit through its Leader only cannot be targeted', () => {
    const ov: SetupOv = { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } }
    const s = stateWith(ov, (b) => { (b.weapons['red.w.cannon'] as any).abilities = [{ ability: 'HEAVY' }] })
    placeUnit(s, 'B:mob', { x: 0, z: 5, gap: 0.3 })
    placeUnit(s, 'B:warboss', [[-1.5, 5]])
    placeUnit(s, 'A:grunts', { x: -9.5, z: 5, gap: 0.3 })
    placeUnit(s, 'A:walker', [[-5, -20]])
    const { ctx } = start(s)
    const canon = leaderService.canonicalUnitId(s, 'B:mob')
    expect(leaderService.unitsInEngagement(s, 'A:grunts', canon)).toBe(true)
    expect(legal(ctx, 'A:walker', 'red.w.cannon')).not.toContain(canon)
    placeUnit(s, 'A:grunts', { x: -30, z: -15, gap: 0.3 })
    expect(legal(ctx, 'A:walker', 'red.w.cannon')).toContain(canon)
  })
})

describe('shooting verify: eligibility and declaration (SHOOT-001, SHOOT-010, SHOOT-046)', () => {
  it('SHOOT-001-fellback a unit that Fell Back is not eligible even with Pistols in range', () => {
    const s = stateWith()
    placeUnit(s, 'A:grunts', { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: 0, z: 0, gap: 0.3 })
    s.units['A:grunts'].turn.moveType = 'fallBack'
    const { ctx } = start(s)
    expect(shootingModule.advance(ctx)).toBe('done')
  })
  it('SHOOT-010-attacks a ranged target carrying an attacks split is rejected E_SCHEMA', () => {
    const s = stateWith()
    placeUnit(s, 'A:grunts', { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: 0, z: 0, gap: 0.3 })
    const { ctx } = start(s)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    const rej = validateOnly(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob', attacks: 1 }] })
    expect(rej?.code).toBe('E_SCHEMA')
  })
  it('SHOOT-046-reselect choosing an already-activated unit again is rejected', () => {
    const s = stateWith()
    placeUnit(s, 'A:grunts', { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, 'A:walker', [[-10, -5]])
    placeUnit(s, 'B:mob', { x: 0, z: 0, gap: 0.3 })
    const { ctx } = start(s)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [] })
    expect(validateOnly(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })?.code).toBe('E_NOT_AN_OPTION')
  })
})

describe('shooting verify: visibility waivers (SHOOT-009, SHOOT-041)', () => {
  it('SHOOT-041-indirect-target an Indirect Fire weapon may target a unit no firing model can see; a normal weapon may not', () => {
    const b = crateBundle((bb) => { (bb.weapons['red.w.gun'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }] })
    const s = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.v' }), b, 'v', ENGINE_VERSION)
    s.phase = 'shooting'
    placeExact(s, 'A:grunts', { 'A:grunts#0': { x: -5, z: 0 }, 'A:grunts#2': { x: -5, z: 0.1 + mmToInch(32) } })
    placeExact(s, 'B:mob', { 'B:mob#0': { x: 5, z: 0 } })
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).toContain('B:mob')
    expect(legal(ctx, 'A:grunts', 'red.w.pistol', 'A:grunts#0')).not.toContain('B:mob')
  })
})

describe('shooting verify: resolution after declaration (SHOOT-015, SHOOT-005 timing)', () => {
  it('SHOOT-015 target moved out of range/sight after the first attack: all declared attacks still resolve', () => {
    const s = stateWith()
    const r = mmToInch(32) / 2
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 }, 'A:grunts#3': { x: 0, z: 1.5 } })
    placeExact(s, 'B:mob', { 'B:mob#1': { x: 14 + 2 * r, z: 0 } })
    const { ctx, events } = start(s, Array(80).fill(6))
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
      { modelId: 'A:grunts#3', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
    ] })
    let moved = false
    let guard = 0
    while (ctx.state.pending && ctx.state.pending.kind !== 'chooseUnitToActivate') {
      if (++guard > 500) throw new Error('loop')
      if (!moved) { for (const id of s.units['B:mob'].models) s.models[id].pos = { x: 900, y: 0, z: 900 }; moved = true }
      const p = ctx.state.pending as PendingDecision & { options: { action: Action }[] }
      const a = p.options[0].action
      ctx.state.pending = null
      shootingModule.handle(ctx, a, p)
      if (shootingModule.advance(ctx) === 'done') break
    }
    expect(moved).toBe(true)
    expect(of(events, 'HitRolled')).toHaveLength(4)
    expect(of(events, 'WoundRolled')).toHaveLength(4)
  })

  it('SHOOT-005-timing Big Guns -1 to hit applies when the unit was in ER at target selection, even if no longer engaged when rolling', () => {
    const run = (breakEngagement: boolean) => {
      const strat = recordingStratagems(['shooting.targetsDeclared'])
      const modules = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: strat } }
      const s = stateWith()
      s.activePlayer = 'B'
      placeUnit(s, 'B:kopta', [[0, -2]])
      placeUnit(s, 'A:walker', [[0, 0]])
      placeUnit(s, 'A:grunts', { x: -2, z: -12, gap: 0.3 })
      const { ctx, events } = start(s, [1, 5, 1, 1, 1, 1, 1, 1, 1, 1], modules)
      expect(leaderService.inEngagementWithEnemy(s, 'B:kopta')).toBe(true)
      act(ctx, { type: 'chooseUnitToActivate', player: 'B', decisionId: '', unitId: 'B:kopta' })
      act(ctx, { type: 'declareTargets', player: 'B', decisionId: '', unitId: 'B:kopta', targets: [{ modelId: 'B:kopta#0', weaponId: 'blu.w.rokkit', targetUnitId: 'A:grunts' }] })
      let guard = 0
      while (ctx.state.pending) {
        if (++guard > 100) throw new Error('loop')
        const p = ctx.state.pending
        if (p.kind === 'chooseUnitToActivate') break
        if (breakEngagement) s.models['A:walker#0'].pos = { x: 30, y: 0, z: 18 }
        ctx.state.pending = null
        const a: Action = p.kind === 'stratagemWindow' ? { type: 'pass', player: p.player, decisionId: '' } : (p as any).options[0].action
        const rej = p.kind === 'stratagemWindow' ? strat.handle(ctx, a, p) : shootingModule.handle(ctx, a, p)
        if (rej) throw new Error(`rej ${rej.code}`)
        if (shootingModule.advance(ctx) === 'done') break
      }
      return of(events, 'HitRolled')[0]
    }
    expect(run(false)).toMatchObject({ die: 5, final: 4, hit: false })
    expect(run(true)).toMatchObject({ die: 5, final: 4, hit: false })
  })
})

// ---------- verification round 2 (adversarial, phase-flow) ----------
function driveAll(ctx: EngineContext, stopAtSelect = true): 'pending' | 'done' {
  let r: 'pending' | 'done' = ctx.state.pending ? 'pending' : shootingModule.advance(ctx)
  let guard = 0
  while (r === 'pending' && ctx.state.pending) {
    if (++guard > 2000) throw new Error('loop')
    const p = ctx.state.pending
    if (stopAtSelect && p.kind === 'chooseUnitToActivate') return 'pending'
    ctx.state.pending = null
    const isStrat = p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll'
    const a: Action = isStrat ? { type: 'pass', player: p.player, decisionId: '' } : (p as any).options[0].action
    const rej = isStrat ? ctx.services.stratagems.handle(ctx, a, p) : shootingModule.handle(ctx, a, p)
    if (rej) throw new Error(`rej ${rej.code} ${rej.reason}`)
    r = shootingModule.advance(ctx)
  }
  return r
}
function keepOnly(state: GameState, unitId: string, keep: string[]): void {
  state.units[unitId].models = keep
  state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => keep.includes(id) || !id.startsWith(`${unitId}#`)))
}

describe('shooting verify round 2', () => {
  it('SHOOT-046-detach a Leader whose bodyguard died to its own Hazardous test cannot be selected to shoot again this phase', () => {
    const s = stateWith({}, (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HAZARDOUS' }] })
    keepOnly(s, 'A:grunts', ['A:grunts#2'])
    placeUnit(s, 'A:grunts', [[0, -5]])
    placeUnit(s, 'A:boss', [[-2, -5]])
    placeUnit(s, 'B:mob', { x: -4, z: 13, gap: 0.3 }) // beyond the boss's 12" pistol range, within the gun's 24"
    placeUnit(s, 'B:kopta', [[-2, 5]]) // within the boss's 12" pistol range
    const { ctx, events } = start(s, Array(200).fill(1))
    expect(s.units['A:boss'].bodyguardUnitId).toBe('A:grunts')
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    const p = ctx.state.pending as PendingDecision
    ctx.state.pending = null
    shootingModule.handle(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' }] }, p)
    const r = driveAll(ctx)
    expect(of(events, 'HazardousTested')[0]).toMatchObject({ failed: true })
    expect(s.units['A:grunts'].models).toHaveLength(0)
    expect(s.units['A:boss'].bodyguardUnitId).toBeFalsy()
    // R-6.1: the (now separate) Leader already shot as part of the attached unit this phase
    if (r === 'pending') {
      const sel = ctx.state.pending as unknown as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
      expect(sel.context.eligible).not.toContain('A:boss')
    } else {
      expect(r).toBe('done')
    }
  })

  it('SHOOT-003-one-unit an engaged Pistol unit may target only ONE of the enemy units it is in Engagement Range of', () => {
    const s = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PISTOL' }] })
    placeUnit(s, 'A:grunts', { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -14, z: 1.5, gap: 0.3 })
    const g4 = s.models['A:grunts#4'].pos
    placeUnit(s, 'B:brute', [[g4.x, -2]])
    const { ctx } = start(s)
    expect(leaderService.unitsInEngagement(s, 'A:grunts', 'B:mob')).toBe(true)
    expect(leaderService.unitsInEngagement(s, 'A:grunts', 'B:brute')).toBe(true)
    expect(legal(ctx, 'A:grunts', 'red.w.pistol', 'A:grunts#0')).toContain('B:mob')
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#4')).toContain('B:brute')
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    const rej = validateOnly(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#0', weaponId: 'red.w.pistol', targetUnitId: 'B:mob' },
      { modelId: 'A:grunts#4', weaponId: 'red.w.gun', targetUnitId: 'B:brute' },
    ] })
    expect(rej).not.toBeNull()
  })

  it('SHOOT-014-order all attacks vs target 1 (grouped by weapon profile) resolve before any vs target 2, whatever the declaration order', () => {
    const s = stateWith(unattached())
    placeUnit(s, 'A:grunts', { x: -3, z: -5, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -8, z: 8, gap: 0.3 })
    placeUnit(s, 'B:brute', [[10, 3]])
    const { ctx, events } = start(s, Array(200).fill(2))
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
      { modelId: 'A:grunts#3', weaponId: 'red.w.gun', targetUnitId: 'B:brute' },
      { modelId: 'A:grunts#1', weaponId: 'red.w.cannon', targetUnitId: 'B:mob' },
      { modelId: 'A:grunts#4', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
    ] })
    driveAll(ctx)
    const seq = of(events, 'HitRolled').map((e) => `${e.attack.targetUnitId}|${e.attack.weaponId}`)
    expect(seq.length).toBeGreaterThan(4)
    const firstBrute = seq.findIndex((x) => x.startsWith('B:brute'))
    expect(seq.slice(firstBrute).every((x) => x.startsWith('B:brute'))).toBe(true)
    const mob = seq.slice(0, firstBrute).map((x) => x.split('|')[1])
    const firstCannon = mob.indexOf('red.w.cannon')
    expect(firstCannon).toBeGreaterThan(0)
    expect(mob.slice(firstCannon).every((w) => w === 'red.w.cannon')).toBe(true)
  })

  it('SHOOT-008-vertical range is plain 3D distance: 23" horizontal + 10" vertical is out of a 24" range', () => {
    const s = stateWith(unattached())
    const r = mmToInch(32) / 2
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 } })
    placeExact(s, 'B:mob', { 'B:mob#0': { x: 23 + 2 * r, z: 0 } })
    s.models['B:mob#0'].pos.y = 10
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).not.toContain('B:mob')
    s.models['B:mob#0'].pos = { x: 20 + 2 * r, y: 10, z: 0 } // sqrt(400+100)=22.4
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).toContain('B:mob')
  })

  it('SHOOT-009-same-model the in-range model must itself be visible: hidden in-range model + visible out-of-range model is not a legal target', () => {
    const b = crateBundle((bb) => { (bb.weapons['red.w.gun'] as any).range = 12 })
    const s = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.v' }), b, 'v', ENGINE_VERSION)
    s.phase = 'shooting'
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: -5, z: 0 } })
    placeExact(s, 'B:mob', { 'B:mob#0': { x: 5, z: 0 }, 'B:mob#1': { x: -5, z: 20 } })
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).not.toContain('B:mob')
  })

  it('SHOOT-041-torrent a Torrent weapon cannot use Indirect Fire, so it still needs a visible target', () => {
    const b = crateBundle((bb) => { (bb.weapons['red.w.gun'] as any).abilities = [{ ability: 'TORRENT' }, { ability: 'INDIRECT_FIRE' }] })
    const s = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.v' }), b, 'v', ENGINE_VERSION)
    s.phase = 'shooting'
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: -5, z: 0 } })
    placeExact(s, 'B:mob', { 'B:mob#0': { x: 5, z: 0 } })
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).not.toContain('B:mob')
  })

  it('SHOOT-037-indirect Lone Operative 12" cap still applies to an Indirect Fire weapon', () => {
    const b = withBundle((bb) => { (bb.weapons['red.w.gun'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }]; bb.datasheets['blu.brute'].coreAbilities = [{ ability: 'LONE_OPERATIVE' }] })
    const s = stateWith(unattached(), undefined, b)
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 } })
    placeUnit(s, 'B:brute', [[16, 0]])
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).not.toContain('B:brute')
  })

  it('SHOOT-004-bgnt an engaged VEHICLE may target (non-Blast) the unit it is engaged with even if that unit is also engaged with another friendly unit', () => {
    const s = stateWith(unattached())
    s.activePlayer = 'B'
    placeUnit(s, 'A:grunts', { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, 'B:kopta', [[s.models['A:grunts#0'].pos.x, -1.6]])
    placeUnit(s, 'B:mob', { x: -14, z: 1.5, gap: 0.3 })
    const { ctx } = start(s)
    expect(leaderService.unitsInEngagement(s, 'B:kopta', 'A:grunts')).toBe(true)
    expect(leaderService.unitsInEngagement(s, 'B:mob', 'A:grunts')).toBe(true)
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).toContain('A:grunts')
    // B:mob (engaged, non-VEHICLE) may only use sluggas at A:grunts
    const mob = buildShootingWeaponEntries(ctx, 'B:mob')
    expect(mob.every((e) => e.weaponId === 'blu.w.slugga')).toBe(true)
  })

  it('SHOOT-001-advance-hook shootAfterAdvance lets an Advanced unit fire every weapon but does not waive Fall Back', () => {
    const b = withBundle((bb) => { bb.datasheets['red.grunts'].abilities = [{ id: 't.run', name: 'Run', text: '', trigger: 'always', effect: { shootAfterAdvance: true } } as any] })
    const s = stateWith(unattached(), undefined, b)
    placeUnit(s, 'A:grunts', { x: 0, z: -5, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: 0, z: 5, gap: 0.3 })
    s.units['A:grunts'].turn.moveType = 'advance'
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).toContain('B:mob')
    s.units['A:grunts'].turn.moveType = 'fallBack'
    expect(shootingModule.advance(ctx)).toBe('done')
  })
})

// ---------- verification round 3 (adversarial, phase-flow) ----------
function driveWith(ctx: EngineContext, strat: ReturnType<typeof recordingStratagems>, onPending: (p: PendingDecision) => void): void {
  let guard = 0
  while (ctx.state.pending) {
    if (++guard > 2000) throw new Error('loop')
    const p = ctx.state.pending
    if (p.kind === 'chooseUnitToActivate') return
    onPending(p)
    ctx.state.pending = null
    const isStrat = p.kind === 'stratagemWindow'
    const a: Action = isStrat ? { type: 'pass', player: p.player, decisionId: '' } : (p as any).options[0].action
    const rej = isStrat ? strat.handle(ctx, a, p) : shootingModule.handle(ctx, a, p)
    if (rej) throw new Error(`rej ${rej.code} ${rej.reason}`)
    if (shootingModule.advance(ctx) === 'done') return
  }
}
function withStrat(open: Parameters<typeof recordingStratagems>[0]) {
  const strat = recordingStratagems(open)
  return { strat, modules: { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: strat } } }
}
function eligibleNow(ctx: EngineContext): string[] {
  const r = shootingModule.advance(ctx)
  if (r === 'done') return []
  return (ctx.state.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>).context.eligible
}

describe('shooting verify round 3', () => {
  it('SHOOT-004-pistol-unengaged an UNengaged unit\'s Pistol cannot target an enemy engaged with a different friendly unit', () => {
    const s = stateWith()
    placeUnit(s, 'B:mob', { x: -2, z: -12, gap: 0.3 })
    placeUnit(s, 'A:grunts', { x: -2, z: -13.5, gap: 0.3 })
    placeUnit(s, 'A:boss', [[0, -5]])
    const { ctx } = start(s)
    expect(leaderService.unitsInEngagement(s, 'A:grunts', 'B:mob')).toBe(true)
    expect(leaderService.inEngagementWithEnemy(s, 'A:boss')).toBe(false)
    expect(legal(ctx, 'A:boss', 'red.w.pistol')).not.toContain('B:mob')
    placeUnit(s, 'A:grunts', { x: -2, z: -30, gap: 0.3 })
    expect(legal(ctx, 'A:boss', 'red.w.pistol')).toContain('B:mob')
  })

  it('SHOOT-006-bgnt-third-party an engaged VEHICLE may not target an enemy engaged only with a DIFFERENT friendly unit', () => {
    const s = stateWith()
    s.activePlayer = 'B'
    placeUnit(s, 'B:kopta', [[0, -2]])
    placeUnit(s, 'A:walker', [[0, 0]])
    placeUnit(s, 'A:grunts', { x: -2, z: -12, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -2, z: -13.5, gap: 0.3 })
    const { ctx } = start(s)
    expect(leaderService.inEngagementWithEnemy(s, 'B:kopta')).toBe(true)
    expect(leaderService.unitsInEngagement(s, 'B:mob', 'A:grunts')).toBe(true)
    expect(leaderService.unitsInEngagement(s, 'B:kopta', 'A:grunts')).toBe(false)
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).toContain('A:walker')
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).not.toContain('A:grunts')
    placeUnit(s, 'B:mob', { x: -2, z: -30, gap: 0.3 })
    expect(legal(ctx, 'B:kopta', 'blu.w.rokkit')).toContain('A:grunts')
  })

  it('SHOOT-001-fellback-vehicle Big Guns Never Tire does not let a VEHICLE that Fell Back shoot', () => {
    const s = stateWith()
    placeUnit(s, 'A:walker', [[0, -5]])
    placeUnit(s, 'B:mob', { x: -2, z: 5, gap: 0.3 })
    s.units['A:walker'].turn.moveType = 'fallBack'
    const { ctx } = start(s)
    expect(eligibleNow(ctx)).not.toContain('A:walker')
  })

  it('SHOOT-001-advance-pistol an Advanced unit cannot fire a non-Assault Pistol', () => {
    const s = stateWith()
    placeUnit(s, 'A:grunts', { x: -2, z: -3, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -2, z: 3, gap: 0.3 })
    s.units['A:grunts'].turn.moveType = 'advance'
    const { ctx } = start(s)
    expect(buildShootingWeaponEntries(ctx, 'A:grunts')).toHaveLength(0)
    expect(eligibleNow(ctx)).not.toContain('A:grunts')
  })

  it('SHOOT-037-los a Lone Operative within 12" still has to be visible to the firing model', () => {
    const b = crateBundle((bb) => { bb.datasheets['blu.mob'].coreAbilities = [{ ability: 'LONE_OPERATIVE' }] })
    const s = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.v' }), b, 'v', ENGINE_VERSION)
    s.phase = 'shooting'
    keepOnly(s, 'B:mob', ['B:mob#0'])
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: -5, z: 0 } })
    placeExact(s, 'B:mob', { 'B:mob#0': { x: 5, z: 0 } })
    const { ctx } = start(s)
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).not.toContain('B:mob')
    s.models['B:mob#0'].pos = { x: 5, y: 0, z: 6 }
    expect(legal(ctx, 'A:grunts', 'red.w.gun', 'A:grunts#2')).toContain('B:mob')
  })

  it('SHOOT-012-split-models one model fires its Pistol while a different model of the unit fires its gun', () => {
    const s = stateWith()
    placeUnit(s, 'A:grunts', { x: -2, z: -3, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -2, z: 3, gap: 0.3 })
    const { ctx } = start(s)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    expect(validateOnly(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#0', weaponId: 'red.w.pistol', targetUnitId: 'B:mob' },
      { modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
    ] })).toBeNull()
  })

  it('SHOOT-011-two-models two different models may each pick a different profile of the same weapon', () => {
    const s = stateWith(unattached(), (b) => {
      b.weapons['red.w.smite'] = { id: 'red.w.smite', name: 'Smite', type: 'ranged', range: 18, A: 1, skill: 2, S: 6, AP: -1, D: 3, abilities: [], profileGroup: 'smite' } as any
      b.weapons['red.w.focused-smite'] = { id: 'red.w.focused-smite', name: 'Focused Smite', type: 'ranged', range: 18, A: 1, skill: 2, S: 9, AP: -3, D: 6, abilities: [], profileGroup: 'smite' } as any
      b.datasheets['red.grunts'].composition[1].weapons.default = ['red.w.smite', 'red.w.focused-smite']
    })
    placeUnit(s, 'A:grunts', { x: -2, z: -3, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -2, z: 3, gap: 0.3 })
    const { ctx } = start(s)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    expect(validateOnly(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#2', weaponId: 'red.w.smite', targetUnitId: 'B:mob' },
      { modelId: 'A:grunts#3', weaponId: 'red.w.focused-smite', targetUnitId: 'B:mob' },
    ] })).toBeNull()
  })

  it('SHOOT-010-foreign a weapon of a model outside the activated unit, or a melee weapon, is rejected', () => {
    const s = stateWith()
    placeUnit(s, 'A:grunts', { x: -2, z: -3, gap: 0.3 })
    placeUnit(s, 'A:boss', [[-8, -3]])
    placeUnit(s, 'B:mob', { x: -2, z: 3, gap: 0.3 })
    const { ctx } = start(s)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    expect(validateOnly(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:boss#0', weaponId: 'red.w.pistol', targetUnitId: 'B:mob' },
    ] })).not.toBeNull()
    expect(validateOnly(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#2', weaponId: 'red.w.blade', targetUnitId: 'B:mob' },
    ] })).not.toBeNull()
  })

  it('SHOOT-007-hitmod unengaged unit shooting an enemy MONSTER engaged with a friendly unit: -1 to hit, but not with a Pistol', () => {
    const s = stateWith()
    placeUnit(s, 'B:brute', [[0, 0]])
    placeUnit(s, 'A:walker', [[0, -2.4]])
    placeExact(s, 'A:grunts', { 'A:grunts#0': { x: 6, z: 1 }, 'A:grunts#2': { x: 6, z: 3 } })
    const { strat, modules } = withStrat([])
    const { ctx, events } = start(s, Array(200).fill(3), modules)
    expect(leaderService.unitsInEngagement(s, 'A:walker', 'B:brute')).toBe(true)
    expect(leaderService.inEngagementWithEnemy(s, 'A:grunts')).toBe(false)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [
      { modelId: 'A:grunts#0', weaponId: 'red.w.pistol', targetUnitId: 'B:brute' },
      { modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:brute' },
    ] })
    driveWith(ctx, strat, () => {})
    const hits = of(events, 'HitRolled')
    const gun = hits.filter((h) => h.attack.weaponId === 'red.w.gun')
    const pistol = hits.filter((h) => h.attack.weaponId === 'red.w.pistol')
    expect(gun.length).toBeGreaterThan(0)
    expect(pistol.length).toBeGreaterThan(0)
    expect(gun.every((h) => h.die === 3 && h.final === 2 && !h.hit)).toBe(true)
    expect(pistol.every((h) => h.die === 3 && h.final === 3 && h.hit)).toBe(true)
  })

  it('SHOOT-006-hitmod engaged VEHICLE: Pistol at the engaged unit has no -1, its other weapon does', () => {
    const s = stateWith(unattached(), (b) => { b.datasheets['blu.kopta'].composition[0].weapons.default = ['blu.w.slugga', 'blu.w.rokkit', 'blu.w.spinnin-blades'] })
    s.activePlayer = 'B'
    placeUnit(s, 'B:kopta', [[0, -2]])
    placeUnit(s, 'A:walker', [[0, 0]])
    const { strat, modules } = withStrat([])
    const { ctx, events } = start(s, Array(200).fill(5), modules)
    expect(leaderService.unitsInEngagement(s, 'B:kopta', 'A:walker')).toBe(true)
    act(ctx, { type: 'chooseUnitToActivate', player: 'B', decisionId: '', unitId: 'B:kopta' })
    act(ctx, { type: 'declareTargets', player: 'B', decisionId: '', unitId: 'B:kopta', targets: [
      { modelId: 'B:kopta#0', weaponId: 'blu.w.slugga', targetUnitId: 'A:walker' },
      { modelId: 'B:kopta#0', weaponId: 'blu.w.rokkit', targetUnitId: 'A:walker' },
    ] })
    driveWith(ctx, strat, () => {})
    const hits = of(events, 'HitRolled')
    expect(hits.filter((h) => h.attack.weaponId === 'blu.w.slugga').every((h) => h.die === 5 && h.final === 5 && h.hit)).toBe(true)
    expect(hits.filter((h) => h.attack.weaponId === 'blu.w.rokkit').every((h) => h.die === 5 && h.final === 4 && !h.hit)).toBe(true)
    expect(hits.some((h) => h.attack.weaponId === 'blu.w.rokkit')).toBe(true)
  })

  it('SHOOT-038-order R-6.10: Hazardous tests are made before shooting.attacksResolved opens', () => {
    const s = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HAZARDOUS' }] })
    placeUnit(s, 'A:grunts', { x: -2, z: -3, gap: 0.3 })
    placeUnit(s, 'B:mob', { x: -2, z: 3, gap: 0.3 })
    const { strat, modules } = withStrat(['shooting.attacksResolved'])
    const { ctx, events } = start(s, Array(200).fill(2), modules)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' }] })
    let hazardousBeforeWindow: boolean | null = null
    driveWith(ctx, strat, (p) => {
      if (p.kind === 'stratagemWindow' && p.window === 'shooting.attacksResolved' && hazardousBeforeWindow === null) hazardousBeforeWindow = of(events, 'HazardousTested').length > 0
    })
    expect(hazardousBeforeWindow).toBe(true)
  })

  it('SHOOT-041-cover-snapshot Indirect Fire at a target unseen when selected keeps the cover benefit even if it becomes visible before allocation', () => {
    const b = crateBundle((bb) => { (bb.weapons['red.w.gun'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }] })
    const s = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.v' }), b, 'v', ENGINE_VERSION)
    s.phase = 'shooting'
    keepOnly(s, 'B:mob', ['B:mob#1'])
    placeExact(s, 'A:grunts', { 'A:grunts#2': { x: -5, z: 0 } })
    placeExact(s, 'B:mob', { 'B:mob#1': { x: 5, z: 0 } })
    const { strat, modules } = withStrat(['shooting.targetsDeclared'])
    const { ctx, events } = start(s, Array(200).fill(6), modules)
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' })
    act(ctx, { type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts', targets: [{ modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' }] })
    driveWith(ctx, strat, (p) => {
      if (p.kind === 'stratagemWindow' && p.window === 'shooting.targetsDeclared') s.models['B:mob#1'].pos = { x: 5, y: 0, z: 6 }
    })
    const hit = of(events, 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 6, final: 5 }) // -1 snapshotted at selection
    const alloc = of(events, 'AttackAllocated')[0]
    expect(alloc?.cover).toBe(true)
  })
})
