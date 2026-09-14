// Adversarial verification of the Charge (phases/charge.ts) and Fight (phases/fight.ts) modules against
// docs/spec/10-rules-core.md §8/§9 and the CHARGE-*/FIGHT-* checklist. Drives the modules directly over a hand-built
// GameState, same harness style as tests/engine/{charge,fight}.test.ts.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, horizontalGap, removeModel,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision, type PhaseModule,
  type Rejection, type StratagemService, type Vec3,
} from '../../src/engine'
import type { ModelPlacement, WeaponTarget } from '../../src/engine/actions'
import { chargeModule } from '../../src/engine/phases/charge'
import { fightModule } from '../../src/engine/phases/fight'
import { pushReaction } from '../../src/engine/code-hooks'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems } from '../fixtures'

const DID = ''
const AWalker = 'A:walker', ABoss = 'A:boss'
const BMob = 'B:mob', BBrute = 'B:brute', BKopta = 'B:kopta', BWarboss = 'B:warboss'

function setupOverrides() {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }
}

function harness(mod: PhaseModule, dice: number[], strats: StratagemService = recordingStratagems(), active: 'A' | 'B' = 'A') {
  const state = createGameState(makeSetup(setupOverrides()), bundle, 'seed', ENGINE_VERSION)
  state.activePlayer = active
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: strats } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  mod.enter(ctx)
  return { state, ctx, events }
}

function act(mod: PhaseModule, ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) mod.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = mod.validate ? mod.validate(ctx.state, action, pending) : null
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = mod.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return mod.advance(ctx)
}

function validateOnly(mod: PhaseModule, ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) mod.advance(ctx)
  return mod.validate ? mod.validate(ctx.state, action, ctx.state.pending as PendingDecision) : null
}

const misses = (n = 300) => Array(n).fill(1)

// position for `unitId#idx` so its base edge sits `gap` inches from `anchorModelId` along `dir`
function rel(state: GameState, anchorModelId: string, unitId: string, gap: number, dir: [number, number], idx = 0): Vec3 {
  const a = state.models[anchorModelId]
  const m = state.models[`${unitId}#${idx}`]
  const len = Math.hypot(dir[0], dir[1])
  const ux = dir[0] / len, uz = dir[1] / len
  let lo = 0, hi = 40
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const fp = { pos: { x: a.pos.x + ux * mid, y: 0, z: a.pos.z + uz * mid }, facing: m.facing, base: m.base }
    if (horizontalGap(a, fp) < gap) lo = mid; else hi = mid
  }
  return { x: a.pos.x + ux * hi, y: 0, z: a.pos.z + uz * hi }
}

function defaultFightAction(p: PendingDecision): Action {
  if (p.kind === 'chooseFightUnit') return { type: 'chooseFightUnit', player: p.player, decisionId: DID, unitId: p.context.eligible[0] }
  if (p.kind === 'pileIn') return { type: 'pileIn', player: p.player, decisionId: DID, unitId: p.context.unitId, placements: [] }
  if (p.kind === 'consolidate') return { type: 'consolidate', player: p.player, decisionId: DID, unitId: p.context.unitId, placements: [] }
  if (p.kind === 'declareTargets') {
    const targets: WeaponTarget[] = p.context.weapons.filter((w) => w.legalTargets.length > 0).map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: w.legalTargets[0] }))
    return { type: 'declareTargets', player: p.player, decisionId: DID, unitId: p.context.unitId, targets }
  }
  if (p.kind === 'allocateAttack') return p.canPass ? { type: 'pass', player: p.player, decisionId: DID } : { type: 'allocateAttack', player: p.player, decisionId: DID, modelId: p.options[0].id }
  if (p.kind === 'chooseOption') return { type: 'chooseOption', player: p.player, decisionId: DID, optionId: p.options[0]?.id ?? 'keep' }
  return { type: 'pass', player: p.player, decisionId: DID }
}

function drive(ctx: EngineContext, stop: (p: PendingDecision) => boolean, max = 300): void {
  for (let i = 0; i < max; i++) {
    if (!ctx.state.pending) fightModule.advance(ctx)
    if (!ctx.state.pending) return
    if (stop(ctx.state.pending)) return
    act(fightModule, ctx, defaultFightAction(ctx.state.pending))
  }
  throw new Error('drive: too many steps')
}

// stub stratagem service: behaves like recordingStratagems, and when `coPlayer` is offered fight.attacksResolved after
// `triggerUnit` fought it applies Counter-offensive exactly the way code-hooks.ts's `counterOffensive.apply` does
function counterOffensiveStub(triggerUnit: string, coPlayer: 'A' | 'B', coUnit: string): StratagemService {
  const base = recordingStratagems()
  let used = false
  return {
    ...base,
    openWindow(ctx, window, player, key, trigger) {
      base.openWindow(ctx, window, player, key, trigger)
      if (!used && window === 'fight.attacksResolved' && player === coPlayer && key === triggerUnit) {
        used = true
        const f = ctx.state.phaseState.fight!
        f.counterOffensive = true
        f.nextToSelect = coPlayer
        pushReaction(ctx, { kind: 'counterOffensive', stratagemId: 'core.s.counter-offensive', player: coPlayer, unitId: coUnit, enemyUnitId: triggerUnit, window, distance: null } as never)
      }
      return false
    },
  }
}

// 10 models of B:mob crowded around a single target model: 6 in base contact in a ring, 4 nestled between ring
// models (within Engagement Range but physically unable to reach base contact). Returns end positions and
// the matching start positions at `startExtra` inches further out radially.
function crowd(state: GameState, targetModelId: string, startRing: number, startOuter: number) {
  const t = state.models[targetModelId]
  const rm = state.models[`${BMob}#0`].base.radius
  const R = t.base.radius + rm + 0.003
  const d = 2 * rm + 0.03
  const rOuter = R * Math.cos(Math.PI / 6) + Math.sqrt(d * d - (R * Math.sin(Math.PI / 6)) ** 2)
  const at = (r: number, deg: number): Vec3 => ({ x: t.pos.x + r * Math.cos((deg * Math.PI) / 180), y: 0, z: t.pos.z + r * Math.sin((deg * Math.PI) / 180) })
  const ends: Vec3[] = [], starts: Vec3[] = []
  for (let k = 0; k < 6; k++) { ends.push(at(R, k * 60)); starts.push(at(R + startRing, k * 60)) }
  for (let k = 0; k < 4; k++) { ends.push(at(rOuter, 30 + k * 60)); starts.push(at(startOuter, 30 + k * 60)) }
  expect(R >= 2 * rm + 0.01).toBe(true) // 6-ring does not self-overlap
  return { ends, starts, R, rOuter }
}

describe('fight verify — step membership (R-9.3)', () => {
  it('FIGHT-009 a Fights First unit that only becomes eligible after the step started fights in Remaining Combats', () => {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 2.5, [1, 0])])
    s.units[AWalker].turn.chargedThisTurn = true
    s.units[AWalker].turn.fightsFirst = true
    s.units[BBrute].turn.fightsFirst = true // Fights First from an ability; not charged, not in ER at the start of step 1
    fightModule.advance(ctx)
    const first = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(first.context.eligible).toEqual([AWalker])
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'A', decisionId: DID, unitId: AWalker })
    expect(s.pending?.kind).toBe('pileIn')
    const to = rel(s, `${BBrute}#0`, AWalker, 0.002, [-1, 0])
    act(fightModule, ctx, { type: 'pileIn', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: to }] })
    drive(ctx, (p) => p.kind === 'chooseFightUnit')
    const next = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }> | null
    expect(next?.kind).toBe('chooseFightUnit')
    expect(next!.context.step === 'fightsFirst' && next!.context.eligible.includes(BBrute)).toBe(false)
  })

  it('FIGHT-008 a Heroic Intervention unit (charged, no Fights First) is not offered in the Fights First step', () => {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 0.5, [1, 0])])
    s.units[BBrute].turn.chargedThisTurn = true // heroic: charged but no fightsFirst
    fightModule.advance(ctx)
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(p.context.step).toBe('remaining')
  })

  it('FIGHT-007 a charged unit not in Engagement Range is still eligible and may pile in', () => {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 2.5, [1, 0])])
    s.units[AWalker].turn.chargedThisTurn = true
    s.units[AWalker].turn.fightsFirst = true
    fightModule.advance(ctx)
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(p.context.step).toBe('fightsFirst')
    expect(p.context.eligible).toContain(AWalker)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'A', decisionId: DID, unitId: AWalker })
    expect(s.pending?.kind).toBe('pileIn')
  })
})

describe('fight verify — Counter-offensive (R-9.12)', () => {
  it('FIGHT-025 Counter-offensive during the Fights First step lets a unit without Fights First fight next', () => {
    const { ctx } = harness(fightModule, misses(), counterOffensiveStub(AWalker, 'B', BBrute))
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 0.5, [1, 0])])
    placeUnit(s, ABoss, [{ x: 15, y: 0, z: -6 }]) // second A Fights First unit (charged, target gone)
    for (const id of [AWalker, ABoss]) { s.units[id].turn.chargedThisTurn = true; s.units[id].turn.fightsFirst = true }
    fightModule.advance(ctx)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'A', decisionId: DID, unitId: AWalker })
    drive(ctx, (p) => p.kind === 'chooseFightUnit')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect({ player: p.player, eligible: p.context.eligible }).toEqual({ player: 'B', eligible: [BBrute] })
  })

  it('FIGHT-025-unit Counter-offensive fights the unit it targeted, not any eligible unit', () => {
    const { ctx } = harness(fightModule, misses(), counterOffensiveStub(AWalker, 'B', BBrute))
    const s = ctx.state
    for (const id of s.units[BMob].models.slice(1)) removeModel(s, id)
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 0.5, [1, 0])])
    placeUnit(s, BMob, [rel(s, `${AWalker}#0`, BMob, 0.5, [0, -1])])
    s.units[AWalker].turn.chargedThisTurn = true
    s.units[AWalker].turn.fightsFirst = true
    fightModule.advance(ctx)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'A', decisionId: DID, unitId: AWalker })
    drive(ctx, (p) => p.kind === 'chooseFightUnit')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(p.player).toBe('B')
    expect(p.context.eligible).toEqual([BBrute])
  })
})

describe('fight verify — pile in / consolidate (R-9.5, R-9.10)', () => {
  it('FIGHT-013-crowd base contact is only required where physically possible: nestled models behind a full ring are legal', () => {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    placeUnit(s, ABoss, [{ x: 15, y: 0, z: -6 }])
    const { ends, starts } = crowd(s, `${ABoss}#0`, 2.5, 0)
    const R = s.models[`${ABoss}#0`].base.radius + s.models[`${BMob}#0`].base.radius
    // outer (nestled) models start close enough that base contact is within 3" in isolation
    for (let k = 6; k < 10; k++) {
      const e = ends[k]; const dx = e.x - 15, dz = e.z + 6; const r = Math.hypot(dx, dz)
      starts[k] = { x: 15 + (dx / r) * (R + 2.9), y: 0, z: -6 + (dz / r) * (R + 2.9) }
    }
    placeUnit(s, BMob, starts)
    s.units[BMob].turn.chargedThisTurn = true
    fightModule.advance(ctx)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'B', decisionId: DID, unitId: BMob })
    expect(s.pending?.kind).toBe('pileIn')
    const placements: ModelPlacement[] = ends.map((pos, i) => ({ modelId: `${BMob}#${i}`, pos }))
    const rej = validateOnly(fightModule, ctx, { type: 'pileIn', player: 'B', decisionId: DID, unitId: BMob, placements })
    expect(rej, JSON.stringify(rej)).toBeNull()
  })

  it('FIGHT-023-toward the objective fallback must move models toward the marker, not away from it', () => {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: 10, y: 0, z: -3.8 }])
    placeUnit(s, BBrute, [{ x: -18, y: 0, z: 10 }])
    s.units[AWalker].turn.chargedThisTurn = true
    fightModule.advance(ctx)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'A', decisionId: DID, unitId: AWalker })
    const p = s.pending as Extract<PendingDecision, { kind: 'consolidate' }>
    expect(p?.kind).toBe('consolidate')
    expect(p.context.objectiveFallback).toBe('obj-e')
    const away = { x: 10, y: 0, z: -4.3 } // 0.5" farther from obj-e (10,0), still within range of it
    const rej = validateOnly(fightModule, ctx, { type: 'consolidate', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: away }] })
    expect(rej).not.toBeNull()
  })
})

describe('fight verify — attacks (R-9.6..R-9.8)', () => {
  function mobVsBoss(gap0: number) {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    for (const id of s.units[BMob].models.slice(2)) removeModel(s, id)
    placeUnit(s, ABoss, [{ x: 15, y: 0, z: -6 }])
    const p0 = rel(s, `${ABoss}#0`, BMob, gap0, [1, 0], 0)
    placeUnit(s, BMob, [p0, p0])
    const p1 = rel(s, `${BMob}#0`, BMob, 0.002, [1, 0], 1)
    placeUnit(s, BMob, [p0, p1])
    fightModule.advance(ctx)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'B', decisionId: DID, unitId: BMob })
    if (s.pending?.kind === 'pileIn') act(fightModule, ctx, { type: 'pileIn', player: 'B', decisionId: DID, unitId: BMob, placements: [] })
    const d = s.pending as Extract<PendingDecision, { kind: 'declareTargets' }>
    expect(d.kind).toBe('declareTargets')
    return d.context.weapons.map((w) => w.modelId)
  }

  it('FIGHT-015 a model 1.2"+ away but touching a friend in base contact with the enemy may attack', () => {
    expect(mobVsBoss(0.002)).toContain(`${BMob}#1`)
  })

  it('FIGHT-016 a model touching a friend that is only within Engagement Range (no base contact) may not attack', () => {
    expect(mobVsBoss(0.5)).not.toContain(`${BMob}#1`)
  })

  it('FIGHT-018 a model engaged with two units may split its attacks; the per-weapon sum must equal A', () => {
    const { ctx } = harness(fightModule, misses())
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 0.5, [1, 0])])
    placeUnit(s, BKopta, [rel(s, `${AWalker}#0`, BKopta, 0.5, [0, -1])])
    s.units[AWalker].turn.chargedThisTurn = true
    s.units[AWalker].turn.fightsFirst = true
    fightModule.advance(ctx)
    act(fightModule, ctx, { type: 'chooseFightUnit', player: 'A', decisionId: DID, unitId: AWalker })
    if (s.pending?.kind === 'pileIn') act(fightModule, ctx, { type: 'pileIn', player: 'A', decisionId: DID, unitId: AWalker, placements: [] })
    const d = s.pending as Extract<PendingDecision, { kind: 'declareTargets' }>
    const w = d.context.weapons.find((x) => x.weaponId === 'red.w.fist')!
    expect(w.legalTargets.sort()).toEqual([BBrute, BKopta].sort())
    const mk = (a: number, b: number): Action => ({ type: 'declareTargets', player: 'A', decisionId: DID, unitId: AWalker, targets: [
      { modelId: w.modelId, weaponId: w.weaponId, targetUnitId: BBrute, attacks: a },
      { modelId: w.modelId, weaponId: w.weaponId, targetUnitId: BKopta, attacks: b },
    ] })
    expect(validateOnly(fightModule, ctx, mk(2, 2))).toBeNull()
    expect(validateOnly(fightModule, ctx, mk(3, 2))?.code).toBe('E_SCHEMA')
  })
})

describe('fight verify — window ordering (R-9.4, R-11.5)', () => {
  function run() {
    const strats = recordingStratagems()
    const { ctx } = harness(fightModule, misses(), strats)
    const s = ctx.state
    placeUnit(s, AWalker, [{ x: -14, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${AWalker}#0`, BBrute, 0.5, [1, 0])])
    drive(ctx, () => false)
    const order = (w: string, key: string) => strats.offers.filter((o) => o.window === w && o.key === key).map((o) => o.player)
    return { order, strats }
  }

  it('FIGHT-034 fight.targetsDeclared offers the targeted unit\'s owner first, then the fighting player', () => {
    const { order } = run()
    expect(order('fight.targetsDeclared', BBrute)).toEqual(['A', 'B'])
    expect(order('fight.targetsDeclared', AWalker)).toEqual(['B', 'A'])
  })

  it('FIGHT-034-order non-defensive fight windows (unitSelected, attacksResolved) offer the active player first', () => {
    const { order } = run()
    expect(order('fight.unitSelected', BBrute)).toEqual(['A', 'B'])
    expect(order('fight.attacksResolved', BBrute)).toEqual(['A', 'B'])
  })
})

describe('charge verify (R-8.4, R-8.5, R-8.8)', () => {
  function declareCharge(ctx: EngineContext, unitId: string, targets: string[]) {
    const player = ctx.state.units[unitId].player
    act(chargeModule, ctx, { type: 'chooseUnitToActivate', player, decisionId: DID, unitId })
    act(chargeModule, ctx, { type: 'declareCharge', player, decisionId: DID, unitId, targetUnitIds: targets })
    if (ctx.state.pending?.kind === 'chooseOption') act(chargeModule, ctx, { type: 'chooseOption', player, decisionId: DID, optionId: 'keep' })
  }

  it('CHARGE-008 reaching the target requires passing through a non-target unit\'s Engagement Range → charge fails', () => {
    const { ctx, events } = harness(chargeModule, [3, 3, 3, 3])
    const s = ctx.state
    placeUnit(s, ABoss, [{ x: -18, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${ABoss}#0`, BBrute, 6, [1, 0])])
    placeUnit(s, BWarboss, [{ x: -14, y: 0, z: -3 }]) // squarely on the line
    declareCharge(ctx, ABoss, [BBrute])
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(true)
  })

  it('CHARGE-008-detour a straight line clipping a non-target\'s Engagement Range does not fail a charge a short detour makes', () => {
    const { ctx, events } = harness(chargeModule, [6, 6, 6, 6])
    const s = ctx.state
    placeUnit(s, ABoss, [{ x: -18, y: 0, z: -3 }])
    placeUnit(s, BBrute, [rel(s, `${ABoss}#0`, BBrute, 6, [1, 0])])
    const rb = s.models[`${ABoss}#0`].base.radius, rw = s.models[`${BWarboss}#0`].base.radius
    placeUnit(s, BWarboss, [{ x: -15.5, y: 0, z: -3 + rb + rw + 0.5 }])
    declareCharge(ctx, ABoss, [BBrute])
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(false)
    expect(s.pending?.kind).toBe('chargeMove')
  })

  it('CHARGE-015 a FLY charger may path over an enemy model but may not end overlapping one', () => {
    const { ctx, events } = harness(chargeModule, [6, 6], recordingStratagems(), 'B')
    const s = ctx.state
    placeUnit(s, BKopta, [{ x: -18, y: 0, z: -3 }])
    placeUnit(s, AWalker, [rel(s, `${BKopta}#0`, AWalker, 10, [1, 0])])
    placeUnit(s, ABoss, [rel(s, `${BKopta}#0`, ABoss, 2.2, [1, 0])]) // non-target squarely in the path
    declareCharge(ctx, BKopta, [AWalker])
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(false)
    expect(s.pending?.kind).toBe('chargeMove')
    const w = s.models[`${AWalker}#0`]
    const rej = validateOnly(chargeModule, ctx, { type: 'chargeMove', player: 'B', decisionId: DID, unitId: BKopta, placements: [{ modelId: `${BKopta}#0`, pos: { x: w.pos.x - 0.5, y: 0, z: w.pos.z } }] })
    expect(rej).not.toBeNull()
  })

  it('CHARGE-012-crowd base contact is only required where physically possible: nestled models behind a full ring are legal', () => {
    const { ctx, events } = harness(chargeModule, [6, 6, 6, 6], recordingStratagems(), 'B')
    const s = ctx.state
    placeUnit(s, ABoss, [{ x: 15, y: 0, z: -6 }])
    const { ends, starts } = crowd(s, `${ABoss}#0`, 0, 6.5)
    for (let k = 0; k < 6; k++) { const e = ends[k]; const dx = e.x - 15, dz = e.z + 6; const r = Math.hypot(dx, dz); starts[k] = { x: 15 + (dx / r) * 6, y: 0, z: -6 + (dz / r) * 6 } }
    placeUnit(s, BMob, starts)
    void events
    // validate() only reads pending.context, so hand it a chargeMove decision directly (isolates R-8.5 from the
    // R-8.4 feasibility heuristic, which is exercised separately by CHARGE-010-blob)
    const pending = { id: 'd:x', kind: 'chargeMove', player: 'B', window: 'charge.moveEnded', canPass: false, context: { unitId: BMob, targetUnitIds: [ABoss], roll: 12 }, constraints: {} } as unknown as PendingDecision
    const placements: ModelPlacement[] = ends.map((pos, i) => ({ modelId: `${BMob}#${i}`, pos }))
    const rej = chargeModule.validate!(s, { type: 'chargeMove', player: 'B', decisionId: DID, unitId: BMob, placements }, pending)
    expect(rej, JSON.stringify(rej)).toBeNull()
  })

  it('CHARGE-010-blob a 10-model mob in an ordinary 2x5 block, roll 12, 5" from a lone target → charge does not fail', () => {
    const { ctx, events } = harness(chargeModule, [6, 6, 6, 6], recordingStratagems(), 'B')
    const s = ctx.state
    placeUnit(s, ABoss, [{ x: 15, y: 0, z: -3 }])
    const rb = s.models[`${ABoss}#0`].base.radius, rm = s.models[`${BMob}#0`].base.radius
    const x1 = 15 - (rb + rm + 5), x2 = x1 - (2 * rm + 0.1)
    const pos: Vec3[] = []
    for (const x of [x1, x2]) for (let i = 0; i < 5; i++) pos.push({ x, y: 0, z: -3 + (i - 2) * (2 * rm + 0.1) })
    placeUnit(s, BMob, pos)
    declareCharge(ctx, BMob, [ABoss])
    expect(events.some((e) => e.type === 'ChargeFailed')).toBe(false)
    expect(s.pending?.kind).toBe('chargeMove')
  })
})
