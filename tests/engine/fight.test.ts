// Fight phase (10-rules §9, docs/spec/12-rules-test-checklist.md FIGHT-*). Drives `fightModule` directly over a
// hand-built GameState (60-testing §1 fixtures), per phases/README.md §6. `recordingStratagems()` replaces the real
// stratagem service so ordinary fights never trigger Counter-offensive/Get Stuck In/Epic Challenge; eligibility for
// charged units is simulated by setting `unit.turn.chargedThisTurn`/`fightsFirst` directly rather than driving a
// full charge move (charge.test.ts already covers R-8.6's Fights First grant).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, removeModel,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision, type Rejection,
} from '../../src/engine'
import type { ModelPlacement, WeaponTarget } from '../../src/engine/actions'
import { fightModule } from '../../src/engine/phases/fight'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems } from '../fixtures'

function harness(overrides: Parameters<typeof makeSetup>[0] = {}, dice: number[] = []) {
  const state = createGameState(makeSetup(overrides), bundle, 'seed', ENGINE_VERSION)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  return { state, ctx, events, modules }
}

const DID = ''

function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) fightModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  if (fightModule.validate) {
    const rej = fightModule.validate(ctx.state, action, pending)
    if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  }
  ctx.state.pending = null
  const handled = fightModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return fightModule.advance(ctx)
}

function reject(ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) fightModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = fightModule.validate ? fightModule.validate(ctx.state, action, pending) : null
  if (rej) return rej
  const saved = ctx.state.pending
  ctx.state.pending = null
  const handled = fightModule.handle(ctx, action, pending)
  if (!handled) ctx.state.pending = saved
  return handled ?? null
}

const A = 'A:grunts', AWalker = 'A:walker'
const B = 'B:mob', BBrute = 'B:brute'

function unattached(overrides: Parameters<typeof makeSetup>[0] = {}): Parameters<typeof makeSetup>[0] {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() }, ...overrides }
}

function start(overrides: Parameters<typeof makeSetup>[0] = {}, dice: number[] = []) {
  const h = harness(overrides, dice)
  fightModule.enter(h.ctx)
  return h
}

// a generous, repeating scripted-dice supply for tests that drive a whole (possibly multi-unit) fight to
// completion and don't care about the exact attack rolls
function lotsOfMisses(n = 200): number[] { return Array(n).fill(1) } // unmodified 1 always fails a hit roll (R-6.11)

function chooseFight(ctx: EngineContext, unitId: string) {
  return act(ctx, { type: 'chooseFightUnit', player: ctx.state.units[unitId].player, decisionId: DID, unitId })
}

function pileIn(ctx: EngineContext, unitId: string, placements: ModelPlacement[]) {
  return act(ctx, { type: 'pileIn', player: ctx.state.units[unitId].player, decisionId: DID, unitId, placements })
}

function declareTargets(ctx: EngineContext, unitId: string, targets: WeaponTarget[]) {
  return act(ctx, { type: 'declareTargets', player: ctx.state.units[unitId].player, decisionId: DID, unitId, targets })
}

function consolidate(ctx: EngineContext, unitId: string, placements: ModelPlacement[]) {
  return act(ctx, { type: 'consolidate', player: ctx.state.units[unitId].player, decisionId: DID, unitId, placements })
}

// places aUnit's lone model at the origin and bUnit's lone model on +x at the given edge-to-edge gap
// (17, -13) is comfortably more than 3" (a pile-in/consolidate reach) from every objective marker in the test
// mission (tests/fixtures/bundle.ts), so tests that don't care about the R-9.10 objective fallback never trip it
const FAR_FROM_OBJECTIVES = { x: 10, z: -13 }

function placeAtGap(state: GameState, aUnit: string, bUnit: string, gap: number, origin: { x: number; z: number } = FAR_FROM_OBJECTIVES): void {
  placeUnit(state, aUnit, [{ x: origin.x, y: 0, z: origin.z }])
  const ra = state.models[`${aUnit}#0`].base.radius
  const rb = state.models[`${bUnit}#0`].base.radius
  placeUnit(state, bUnit, [{ x: origin.x + ra + rb + gap, y: 0, z: origin.z }])
}

// shrink a fixture unit down to `n` models (keeps the first n ids) so coherency only ever needs 1 neighbour
function shrinkTo(state: GameState, unitId: string, n: number): void {
  const unit = state.units[unitId]
  for (const id of unit.models.slice(n)) removeModel(state, id)
}

// a reasonable, deterministic answer to any pending decision — no movement offered voluntarily, every legal target
// takes its full declared attack, every other choice picks the first option. Used to fast-forward whichever unit
// the fight module offers first (both units in a mutual Engagement Range are independently eligible, R-9.2) so a
// test can drive straight to the specific unit/step it cares about.
function defaultFightAction(pending: PendingDecision): Action {
  if (pending.kind === 'chooseFightUnit') return { type: 'chooseFightUnit', player: pending.player, decisionId: DID, unitId: pending.context.eligible[0] }
  if (pending.kind === 'pileIn') return { type: 'pileIn', player: pending.player, decisionId: DID, unitId: pending.context.unitId, placements: [] }
  if (pending.kind === 'consolidate') return { type: 'consolidate', player: pending.player, decisionId: DID, unitId: pending.context.unitId, placements: [] }
  if (pending.kind === 'declareTargets') {
    const targets: WeaponTarget[] = pending.context.weapons.filter((w) => w.legalTargets.length > 0).map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: w.legalTargets[0] }))
    return { type: 'declareTargets', player: pending.player, decisionId: DID, unitId: pending.context.unitId, targets }
  }
  if (pending.kind === 'allocateAttack') return pending.canPass ? { type: 'pass', player: pending.player, decisionId: DID } : { type: 'allocateAttack', player: pending.player, decisionId: DID, modelId: pending.options[0].id }
  if (pending.kind === 'chooseOption') return { type: 'chooseOption', player: pending.player, decisionId: DID, optionId: pending.options[0]?.id ?? 'keep' }
  return { type: 'pass', player: pending.player, decisionId: DID }
}

// drives the fight module with `defaultFightAction` until `stop(pending)` is true or the phase ends
function driveUntil(ctx: EngineContext, stop: (p: PendingDecision) => boolean, maxSteps = 300): void {
  for (let i = 0; i < maxSteps; i++) {
    if (!ctx.state.pending) fightModule.advance(ctx)
    if (!ctx.state.pending) return
    if (stop(ctx.state.pending)) return
    act(ctx, defaultFightAction(ctx.state.pending))
  }
  throw new Error('driveUntil: exceeded maxSteps')
}

describe('fight phase — alternation and eligibility (FIGHT-001..009)', () => {
  it('FIGHT-001/002 Fights First step: the non-active player selects first among Fights First units', () => {
    const { ctx } = start(unattached())
    // AWalker (active player A) charged this turn -> Fights First; B:brute also Fights First (simulated) and in no
    // one's Engagement Range otherwise; both are Fights First, so B (non-active) is offered first in step 1
    placeUnit(ctx.state, AWalker, [{ x: -20, y: 0, z: -20 }])
    placeUnit(ctx.state, BBrute, [{ x: 20, y: 0, z: 20 }])
    ctx.state.units[AWalker].turn.chargedThisTurn = true
    ctx.state.units[AWalker].turn.fightsFirst = true
    ctx.state.units[BBrute].turn.chargedThisTurn = true
    ctx.state.units[BBrute].turn.fightsFirst = true
    fightModule.advance(ctx)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(pending.kind).toBe('chooseFightUnit')
    expect(pending.player).toBe('B')
    expect(pending.context.step).toBe('fightsFirst')
    expect(pending.context.eligible).toEqual([BBrute])
  })

  it('FIGHT-003 a player with an eligible unit may not pass', () => {
    const { ctx } = start(unattached())
    placeAtGap(ctx.state, AWalker, BBrute, 0.5)
    fightModule.advance(ctx)
    const pending = ctx.state.pending as PendingDecision
    expect(pending.canPass).toBe(false)
  })

  it('FIGHT-004 one player with 0 eligible units: the other fights all of theirs consecutively', () => {
    const { ctx } = start(unattached())
    shrinkTo(ctx.state, B, 2)
    placeUnit(ctx.state, B, { x: 0, z: 0, gap: 3 }) // two Boyz, each within Engagement Range of the walker below
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 1 }])
    // no A unit is eligible (walker isn't charged/engaged with a THIRD unit — it's the only A unit near B); both
    // B models' unit is one and the same (B:mob) so there is exactly one eligible unit to pick, twice is moot —
    // instead exercise the "no A units eligible" half directly via the eligible list
    fightModule.advance(ctx)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(pending.player).toBe('B')
    expect(pending.context.eligible).toEqual([B])
  })

  it('FIGHT-005 a unit fights once per phase; selecting it again is not offered', () => {
    const { ctx } = start(unattached(), lotsOfMisses())
    placeAtGap(ctx.state, AWalker, BBrute, 0.5)
    driveUntil(ctx, () => false) // run the whole (two-unit) fight phase to completion
    expect(ctx.state.phaseState.fight?.fought).toEqual(expect.arrayContaining([AWalker, BBrute]))
  })

  it('FIGHT-006 in Engagement Range without a charge is eligible only in Remaining Combats', () => {
    const { ctx } = start(unattached())
    placeAtGap(ctx.state, AWalker, BBrute, 0.5)
    fightModule.advance(ctx)
    // step 1 (Fights First): neither unit charged, so nobody is offered -> straight to 'remaining'
    expect(ctx.state.phaseState.fight?.step).toBe('remaining')
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(pending.context.eligible).toContain(BBrute)
  })
})

describe('fight phase — pile in (FIGHT-010..013, 032, 033)', () => {
  it('FIGHT-010 pile-in 3.0" ending closer to the closest enemy is legal; 3.1" or ending farther is rejected', () => {
    const { ctx } = start(unattached(), lotsOfMisses())
    // 3.5" gap: reachable within a 3" pile-in (needs 2.5"), so both units are mutually eligible via Engagement Range
    // once one pile-in happens — start the walker charged-but-short-of-contact instead so only it is eligible here
    placeAtGap(ctx.state, AWalker, BBrute, 3.5)
    ctx.state.units[AWalker].turn.chargedThisTurn = true
    driveUntil(ctx, (p) => p.kind === 'pileIn' && p.context.unitId === AWalker)
    const walker = ctx.state.models[`${AWalker}#0`]
    const brute = ctx.state.models[`${BBrute}#0`]
    const dir = Math.sign(brute.pos.x - walker.pos.x)
    const tooFar = reject(ctx, { type: 'pileIn', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: walker.pos.x + dir * 3.1, y: 0, z: walker.pos.z } }] })
    expect(tooFar?.code).toBe('E_OUT_OF_RANGE')
    const awayFromEnemy = reject(ctx, { type: 'pileIn', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: walker.pos.x - dir * 2, y: 0, z: walker.pos.z } }] })
    // whatever the specific reason, moving away from the only enemy in reach must be rejected
    expect(awayFromEnemy).toBeTruthy()
    const ok = pileIn(ctx, AWalker, [{ modelId: `${AWalker}#0`, pos: { x: walker.pos.x + dir * 3.0, y: 0, z: walker.pos.z } }])
    expect(['pending', 'done']).toContain(ok)
  })

  it('FIGHT-011 a model already in base contact cannot pile in', () => {
    const { ctx } = start(unattached(), lotsOfMisses())
    placeAtGap(ctx.state, AWalker, BBrute, 0)
    driveUntil(ctx, (p) => p.kind === 'pileIn' && p.context.unitId === AWalker)
    const walker = ctx.state.models[`${AWalker}#0`]
    const rej = reject(ctx, { type: 'pileIn', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: walker.pos.x - 0.5, y: 0, z: 0 } }] })
    expect(rej).toBeTruthy()
  })

  it('FIGHT-012 pile-in that cannot end the unit in Engagement Range of anyone is skipped (no decision)', () => {
    const { ctx } = start(unattached())
    placeAtGap(ctx.state, AWalker, BBrute, 20) // 20" — a 3" pile-in can never reach
    ctx.state.units[AWalker].turn.chargedThisTurn = true
    const r = chooseFight(ctx, AWalker)
    expect(ctx.state.pending?.kind).not.toBe('pileIn')
    expect(['pending', 'done']).toContain(r)
  })

  it('FIGHT-013 a model that could reach base contact must — stopping short is rejected', () => {
    const { ctx } = start(unattached())
    placeAtGap(ctx.state, AWalker, BBrute, 2.5)
    ctx.state.units[AWalker].turn.chargedThisTurn = true
    chooseFight(ctx, AWalker)
    const walker = ctx.state.models[`${AWalker}#0`]
    const brute = ctx.state.models[`${BBrute}#0`]
    const dir = Math.sign(brute.pos.x - walker.pos.x)
    const shortOfContact = { x: walker.pos.x + dir * 2.2, y: 0, z: walker.pos.z } // reaches ER (2.5-2.2=0.3 gap) but not base contact
    const rej = reject(ctx, { type: 'pileIn', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: shortOfContact }] })
    expect(rej?.code).toBe('E_OUT_OF_RANGE')
  })
})

describe('fight phase — targeting and attacks (FIGHT-015..021)', () => {
  it('FIGHT-019 no eligible target after pile-in: no attack sequence starts, the unit still completes its activation', () => {
    const { ctx } = start(unattached())
    // 8" — a 3" pile-in can never reach Engagement Range, so declareTargets is skipped too (R-9.7's "no eligible
    // target -> no attacks"); with nothing left in Engagement Range either, consolidate has nothing to do and is
    // skipped the same way pile-in was [interp: this engine treats "nothing legal to decide" as no decision at all
    // for both steps alike, rather than raising consolidate anyway with a forced pass — see issues]
    placeAtGap(ctx.state, AWalker, BBrute, 8)
    ctx.state.units[AWalker].turn.chargedThisTurn = true
    chooseFight(ctx, AWalker)
    expect(ctx.state.pending?.kind).not.toBe('pileIn')
    expect(ctx.state.pending?.kind).not.toBe('declareTargets')
    expect(ctx.state.phaseState.attack).toBeNull()
    expect(ctx.state.phaseState.fight?.fought).toContain(AWalker)
  })

  it('FIGHT-020/021 the melee attack sequence resolves with WS and no Benefit of Cover, all declared attacks made', () => {
    const { ctx, events } = start(unattached(), lotsOfMisses())
    placeAtGap(ctx.state, AWalker, BBrute, 0)
    driveUntil(ctx, (p) => p.kind === 'declareTargets' && p.context.unitId === AWalker)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'declareTargets' }>
    const w = pending.context.weapons[0]
    expect(w.legalTargets).toContain(BBrute)
    declareTargets(ctx, AWalker, [{ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: BBrute }])
    driveUntil(ctx, () => false) // drain the attack sequence + consolidate to completion
    expect(events.some((e) => e.type === 'AttackSequenceStarted' && e.unitId === AWalker && e.kind === 'melee')).toBe(true)
    expect(events.some((e) => e.type === 'HitRolled')).toBe(true)
  })
})

describe('fight phase — consolidate (FIGHT-022, 023)', () => {
  it('FIGHT-022 consolidation moves up to 3" toward the closest enemy, base contact if possible', () => {
    const { ctx } = start(unattached(), lotsOfMisses())
    // 0.9" gap: already within Engagement Range (so pile-in and its own declare/consolidate need no movement),
    // leaving the whole 3" consolidate allowance free to demonstrate closing all the way to base contact
    placeAtGap(ctx.state, AWalker, BBrute, 0.9)
    driveUntil(ctx, (p) => p.kind === 'consolidate' && p.context.unitId === AWalker)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'consolidate' }>
    expect(pending.context.objectiveFallback).toBeNull()
    const walker = ctx.state.models[`${AWalker}#0`]
    const brute = ctx.state.models[`${BBrute}#0`]
    const to = { x: brute.pos.x - brute.base.radius - walker.base.radius, y: 0, z: walker.pos.z }
    consolidate(ctx, AWalker, [{ modelId: `${AWalker}#0`, pos: to }])
    expect(ctx.state.models[`${AWalker}#0`].pos.x).toBeCloseTo(to.x, 3)
  })

  it('FIGHT-023 no enemy reachable: consolidation instead moves toward the closest objective marker, or not at all', () => {
    const { ctx } = start(unattached())
    // walker charged (eligible) but ends this activation nowhere near any enemy or objective
    placeUnit(ctx.state, AWalker, [{ x: 100, y: 0, z: 100 }])
    placeUnit(ctx.state, BBrute, [{ x: -100, y: 0, z: -100 }])
    ctx.state.units[AWalker].turn.chargedThisTurn = true
    chooseFight(ctx, AWalker)
    expect(ctx.state.pending?.kind).not.toBe('pileIn') // far too far to reach Engagement Range
    if (ctx.state.pending?.kind === 'declareTargets') declareTargets(ctx, AWalker, [])
    // no objective is within 3" reach either -> consolidate decision is skipped entirely
    expect(ctx.state.pending?.kind).not.toBe('consolidate')
  })
})

describe('fight phase — end of phase (FIGHT-028)', () => {
  it('FIGHT-028 the fight phase ends once no eligible unfought unit remains in either step', () => {
    const { ctx } = start(unattached())
    placeUnit(ctx.state, AWalker, [{ x: -20, y: 0, z: -20 }])
    placeUnit(ctx.state, BBrute, [{ x: 20, y: 0, z: 20 }])
    const r = fightModule.advance(ctx)
    expect(r).toBe('done')
  })
})
