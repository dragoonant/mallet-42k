// Attack sequence tests (10-rules §6.2-§6.4, §7, R-10.4/R-10.5). Drives src/engine/attack.ts directly (begin/advance/
// handler) with a ScriptedRng, bypassing the (still-stub) shooting/fight phase modules per phases/README §6.
import { describe, expect, it } from 'vitest'
import {
  ENGINE_VERSION, ScriptedRng, engine, DEFAULT_MODULES, createGameState, createContext,
  type Action, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PendingDecision,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { leaderService } from '../../src/engine/leaders'
import { weaponService } from '../../src/engine/weapons'
import type { DataBundle } from '../../src/data/types'
import { bundle, withBundle } from '../fixtures/bundle'
import { makeSetup, makePlayerA, makePlayerB } from '../fixtures/setup'
import { placeUnit } from '../fixtures/state'

// ---------- harness ----------

function stateWith(setupOverrides: Parameters<typeof makeSetup>[0] = {}, patch?: (b: DataBundle) => void): GameState {
  const b = patch ? withBundle(patch) : bundle
  return createGameState(makeSetup(setupOverrides), b, 'seed', ENGINE_VERSION)
}

// default fixture attaches boss -> grunts; plain-sequence tests use no attachments to keep allocation simple
function unattached(overrides: Parameters<typeof makeSetup>[0] = {}): Parameters<typeof makeSetup>[0] {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() }, ...overrides }
}

function place(state: GameState): void {
  state.phase = 'shooting'
  placeUnit(state, 'A:grunts', { x: -10, z: -5, gap: 0.5 })
  if (state.units['A:boss']?.bodyguardUnitId) placeUnit(state, 'A:boss', [[-10, -5]])
  else if (state.units['A:boss']) placeUnit(state, 'A:boss', [[30, 30]]) // unattached: keep well clear of everything
  placeUnit(state, 'A:walker', [[-16, -5]])
  placeUnit(state, 'B:mob', { x: -10, z: 0, gap: 0.5 })
  if (state.units['B:warboss']?.bodyguardUnitId) placeUnit(state, 'B:warboss', [[-10, 0.6]])
  else if (state.units['B:warboss']) placeUnit(state, 'B:warboss', [[-30, 30]])
  placeUnit(state, 'B:brute', [[0, 0]])
  placeUnit(state, 'B:kopta', [[10, 0]])
}

function ctxFor(state: GameState, dice: number[]): { ctx: EngineContext; events: GameEvent[] } {
  return createContext(state, new ScriptedRng(dice), DEFAULT_MODULES)
}

type Choose = (pending: PendingDecision) => Action

const firstOption: Choose = (pending) => {
  if ('options' in pending && Array.isArray(pending.options) && pending.options.length > 0) return pending.options[0].action
  throw new Error(`no options to auto-choose for ${pending.kind}`)
}

function ownerFor(ctx: EngineContext, pending: PendingDecision) {
  if (pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll') return ctx.services.stratagems
  return attackService.handler
}

// drives attack.ts to completion, answering every raised decision with `choose` (default: first option)
function drive(h: { ctx: EngineContext; events: GameEvent[] }, choose: Choose = firstOption): GameEvent[] {
  const { ctx, events } = h
  let r = attackService.advance(ctx)
  let guard = 0
  while (r === 'pending') {
    if (++guard > 2000) throw new Error('drive(): too many decisions, likely an infinite loop')
    const pending = ctx.state.pending
    if (!pending) throw new Error('advance() returned pending without a decision')
    const action = choose(pending)
    ctx.state.pending = null
    const rej = ownerFor(ctx, pending).handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return events
}

function target(modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget {
  return { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
}

function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

// a large tail of dice that reliably ends any in-flight attack quickly (wound rolls of 2 fail against every T in the
// fixture bundle, so nothing needs a save/damage roll) — appended so exact-length bookkeeping isn't load-bearing
const TAIL = Array(40).fill(2)

// ---------- hit / wound math ----------

describe('attack sequence: hit and wound rolls', () => {
  it('SHOOT-016 modified hit succeeds/fails on non-critical dice; unmodified 6 always hits and is critical', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const hit = eventsOf(drive({ ctx, events }), 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 4, final: 4, hit: true, critical: false })
  })

  it('SHOOT-016b an unmodified 6 is always a critical hit', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const hit = eventsOf(drive({ ctx, events }), 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 6, hit: true, critical: true })
  })

  it('SHOOT-018 the wound target scales with S vs T (S4 vs T5 needs 5+)', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [6, 4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const wound = eventsOf(drive({ ctx, events }), 'WoundRolled')[0]
    expect(wound).toMatchObject({ die: 4, needed: 5, wounded: false })
  })

  it('SHOOT-049/LEAD-005 wounds against an attached unit use the bodyguard\'s Toughness', () => {
    const state = stateWith() // default: boss (T4) attached to grunts; target the leader record directly
    place(state)
    const { ctx, events } = ctxFor(state, [6, 4, ...TAIL])
    // red.w.blade S4 vs grunts' bodyguard T4 -> needed 4+ (not boss's own T, which happens to match here too,
    // so use a weapon whose S makes the two thresholds diverge: T4 needs 4+, a T9 bodyguard would need 6+)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.choppa', 'A:boss', 1)] })
    const wound = eventsOf(drive({ ctx, events }), 'WoundRolled')[0]
    expect(wound.needed).toBe(4) // S4 vs bodyguard T4, not boss's own stats (also T4 here, but this is the code path LEAD-005 covers)
  })
})

// ---------- allocation priority (R-6.13) ----------

describe('attack sequence: allocation priority', () => {
  it('SHOOT-020/021/022 the wounded/allocated-this-phase model is forced; otherwise the owner chooses', () => {
    const state = stateWith(unattached())
    place(state)
    const chooseSecond: Choose = (p) => {
      if (p.kind === 'allocateAttack') return { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: p.context.eligibleModels[1] }
      return firstOption(p)
    }
    // fast-roll order: hits [6,6], wounds [6,6], saves [1,1] (both fail)
    const { ctx, events } = ctxFor(state, [6, 6, 6, 6, 1, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 2)] })
    const decisions: PendingDecision[] = []
    const evs = drive({ ctx, events }, (p) => { if (p.kind === 'allocateAttack') decisions.push(p); return chooseSecond(p) })
    expect(decisions).toHaveLength(1) // the second attack's allocation was forced, not offered
    const alloc = eventsOf(evs, 'AttackAllocated')
    expect(alloc).toHaveLength(2)
    expect(alloc[1].modelId).toBe(alloc[0].modelId)
  })

  it('SHOOT-023 a model wounded in an earlier phase (no per-phase flag reset) is still allocated first', () => {
    const state = stateWith(unattached())
    place(state)
    state.models['A:grunts#1'].woundsRemaining = 1 // pre-damaged; W is 2
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'AttackAllocated')[0].modelId).toBe('A:grunts#1')
    expect(evs.some((e) => e.type === 'DecisionRequested' && e.pending.kind === 'allocateAttack')).toBe(false)
  })
})

// ---------- saves (R-6.14) ----------

describe('attack sequence: saves', () => {
  it('SHOOT-024 with an invulnerable save available, the engine picks the save that needs the lower roll (no prompt)', () => {
    const state = stateWith(unattached())
    place(state)
    // walker's fist (AP-2) vs A:boss (Sv3+, invuln 4+): armour needs 5+, invuln needs 4+ -> invuln, judged against 4+
    const { ctx, events } = ctxFor(state, [6, 6, 4, ...TAIL])
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.fist', 'A:boss', 1)] })
    const evs = drive({ ctx, events })
    expect(evs.some((e) => e.type === 'DecisionRequested' && e.pending.kind === 'chooseOption' && e.pending.context.topic === 'saveType')).toBe(false)
    expect(eventsOf(evs, 'SaveRolled')[0]).toMatchObject({ kind: 'invuln', needed: 4, die: 4, saved: true })
  })

  it('SHOOT-024 a tie between armour and invulnerable goes to armour; the published target is the one the dice are judged against', () => {
    for (const [die, expectSaved] of [[3, false], [4, true]] as const) {
      // fist at AP-1: armour 3+ with AP-1 needs 4+, invuln 4+ needs 4+ -> tie -> armour
      const state = stateWith(unattached(), (b) => { (b.weapons['red.w.fist'] as any).AP = -1 })
      place(state)
      const { ctx, events } = ctxFor(state, [6, 6, die, ...TAIL])
      attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.fist', 'A:boss', 1)] })
      const evs = drive({ ctx, events })
      const save = eventsOf(evs, 'SaveRolled')[0]
      expect(save).toMatchObject({ kind: 'armour', needed: 3, die, saved: expectSaved })
      expect(eventsOf(evs, 'DiceRolled').find((e) => e.roll.purpose === 'save')?.roll.needed).toBe(4)
    }
  })

  it('SHOOT-024 the save roll carries the target it has to beat, for a Command Re-roll offer to show', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 5, ...TAIL])
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.fist', 'A:boss', 1)] })
    const evs = drive({ ctx, events })
    const roll = eventsOf(evs, 'DiceRolled').find((e) => e.roll.purpose === 'save')!.roll
    expect(roll.needed).toBe(4) // invulnerable 4+ beats armour 5+ (Sv3, AP-2)
  })

  it('SHOOT-025 an unmodified save roll of 1 always fails', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'SaveRolled')[0]).toMatchObject({ die: 1, saved: false })
  })

  it('SHOOT-026 an impossible save (needed > 6) is recorded as failed without rolling', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).AP = -4 })
    place(state)
    // Boy Sv5+, AP-4: even an unmodified 6 (final 6-4=2) can't reach 5+ -> impossible, no die rolled
    const { ctx, events } = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'SaveRolled')[0]).toMatchObject({ die: 0, needed: 5, saved: false })
  })
})

// ---------- damage, mortal wounds, Feel No Pain ----------

describe('attack sequence: damage, mortal wounds, FNP', () => {
  it('SHOOT-027 a damage-2 attack on a 1-wound model destroys it; the excess point is lost', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).D = 2 })
    state.units['B:mob'].models = ['B:mob#9'] // a plain Boy (W1), not the Nob (W2), for a deterministic single-point kill
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#9' || !id.startsWith('B:mob#')))
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 2, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied')).toHaveLength(1) // W1: only the first point is ever applied
    expect(eventsOf(evs, 'ModelDestroyed')).toHaveLength(1)
  })

  it('SHOOT-029 mortal wounds spill onto a fresh model one at a time', () => {
    const state = stateWith(unattached())
    state.units['B:mob'].models = state.units['B:mob'].models.slice(1) // drop the Nob (W2) so every model is W1
    place(state)
    const { ctx, events } = ctxFor(state, [])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [] })
    attackService.queueMortalWounds(ctx, 'B:mob', 3, 'test', false)
    const evs = drive({ ctx, events })
    const destroyed = eventsOf(evs, 'ModelDestroyed')
    expect(destroyed).toHaveLength(3)
    expect(new Set(destroyed.map((d) => d.modelId)).size).toBe(3)
  })

  it('SHOOT-033/035 Feel No Pain is a single roll at the best available threshold', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.cannon'] as any).D = 2; (b.weapons['red.w.cannon'] as any).A = 1 })
    place(state)
    // blu.brute has FNP 6+ (core ability); D2 damage -> up to two FNP rolls at threshold 6
    const { ctx, events } = ctxFor(state, [6, 6, 1, 4, 3, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.cannon', 'B:brute', 1)] })
    const evs = drive({ ctx, events })
    const fnp = eventsOf(evs, 'FeelNoPainRolled')
    expect(fnp.length).toBeGreaterThan(0)
    for (const f of fnp) expect(f.needed).toBe(6)
  })

  it('SHOOT-036 Stealth gives -1 to hit against ranged attacks only', () => {
    const state = stateWith(unattached(), (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'STEALTH' }] })
    place(state)
    // BS3+: an unmodified 3 (final 3) would normally hit, but Stealth's -1 drops it to final 2 -> miss
    const { ctx, events } = ctxFor(state, [3, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'HitRolled')[0]).toMatchObject({ die: 3, final: 2, hit: false })
  })
})

// ---------- overwatch, kill attribution, Deadly Demise ----------

describe('attack sequence: overwatch, kill attribution, Deadly Demise', () => {
  it('SHOOT-040 Overwatch hits only on an unmodified 6; criticals still count', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [5, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: true, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'HitRolled')[0]).toMatchObject({ die: 5, hit: false })
  })

  it('kill attribution: ModelDestroyed/UnitDestroyed carry the attacking unit and model', () => {
    const state = stateWith(unattached())
    state.units['B:mob'].models = ['B:mob#9']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#9' || !id.startsWith('B:mob#')))
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'UnitDestroyed')[0]).toMatchObject({ unitId: 'B:mob', byUnitId: 'A:grunts', byModelId: 'A:grunts#1', kind: 'ranged' })
  })

  it('SHOOT-044/045 Deadly Demise: a 6 hits every unit within 6" on both sides; a 5 does nothing', () => {
    const state = stateWith(unattached())
    place(state) // walker at x=-16,z=-5; grunts at x~-10,z=-5 (within 6")
    state.models['A:walker#0'].woundsRemaining = 1
    const { ctx, events } = ctxFor(state, [
      6, 6, 1, // hit, wound, save fail vs the walker -> destroyed
      6, // Deadly Demise trigger: 6 -> exploded
      3, // D3 mortal-wound count -> ceil(3/2) = 2
      ...TAIL,
    ])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 1)] })
    const evs = drive({ ctx, events })
    const demise = eventsOf(evs, 'DeadlyDemiseRolled')[0]
    expect(demise.exploded).toBe(true)
    expect(demise.affected).toContain('A:grunts')
    expect(eventsOf(evs, 'ModelDestroyed').some((e) => e.unitId === 'A:grunts')).toBe(true)
  })
})

// ---------- weapon abilities ----------

describe('weapon abilities', () => {
  it('WEAP-002 Heavy gives +1 to hit only when the bearer Remained Stationary', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HEAVY' }] })
    place(state)
    state.units['A:grunts'].turn.moveType = 'stationary'
    const { ctx, events } = ctxFor(state, [2, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'HitRolled')[0]).toMatchObject({ die: 2, final: 3, hit: true })
  })

  it('WEAP-003/004 Rapid Fire adds attacks only within half range, measured per firing model', () => {
    const near = stateWith(unattached())
    place(near)
    const { ctx: ctxNear, events: evNear } = ctxFor(near, [...TAIL])
    attackService.begin(ctxNear, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob')] })
    drive({ ctx: ctxNear, events: evNear })
    expect(eventsOf(evNear, 'HitRolled')).toHaveLength(3) // A2 + RF1 within half range (12") of the 24" gun

    const far = stateWith(unattached())
    place(far)
    placeUnit(far, 'B:mob', { x: -10, z: 18 }) // > half range from grunts at z=-5
    const { ctx: ctxFar, events: evFar } = ctxFor(far, [...TAIL])
    attackService.begin(ctxFar, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob')] })
    drive({ ctx: ctxFar, events: evFar })
    expect(eventsOf(evFar, 'HitRolled')).toHaveLength(2)
  })

  it('WEAP-005 Torrent auto-hits every attack with no hit roll and no critical', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'TORRENT' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [4, 4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 2)] })
    const evs = drive({ ctx, events })
    const hits = eventsOf(evs, 'HitRolled')
    expect(hits).toHaveLength(2)
    expect(hits.every((h) => h.auto && h.hit && !h.critical)).toBe(true)
    expect(eventsOf(evs, 'WoundRolled')).toHaveLength(2)
  })

  it('WEAP-006 Blast adds floor(target models / 5) attacks', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.cannon'] as any).A = 2 })
    place(state) // B:mob has 10 models -> +2 attacks (4 total)
    const { ctx, events } = ctxFor(state, [...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.cannon', 'B:mob')] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'HitRolled')).toHaveLength(4)
  })

  it('WEAP-008 Sustained Hits: a critical hit scores an extra hit, each resolved as its own wound roll', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'SUSTAINED_HITS', value: 1 }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 2, 2, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'HitRolled')).toHaveLength(1)
    expect(eventsOf(evs, 'WoundRolled')).toHaveLength(2)
  })

  it('WEAP-010 Lethal Hits: a critical hit skips the wound roll (auto-wound, not a critical wound)', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'LETHAL_HITS' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ auto: true, critical: false, wounded: true })
    expect(eventsOf(evs, 'SaveRolled')).toHaveLength(1) // Lethal Hits alone still takes a normal save
  })

  it('WEAP-012/013 Devastating Wounds: no save, D mortal wounds, resolved after the group\'s other attacks', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 6, 4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 2)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'SaveRolled')).toHaveLength(0) // the only wound that succeeded was the deferred critical
    expect(eventsOf(evs, 'DamageApplied').some((d) => d.mortal)).toBe(true)
  })

  it('WEAP-014 Anti-KEYWORD lowers the critical-wound threshold against a matching target', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'ANTI', keyword: 'MOB', value: 4 }] })
    place(state)
    // needed to wound is 5 (S4 vs T5); Anti-MOB 4+ makes an unmodified 4 a critical (and thus successful) wound
    const { ctx, events } = ctxFor(state, [6, 4, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: true })
  })

  it('WEAP-016 Twin-linked auto-rerolls a failed wound', () => {
    const state = stateWith(unattached())
    place(state)
    // rokkit (Twin-linked) S9 vs T5 mob-equivalent target A:grunts (T4): S9 >= 2*T4 -> needed 2+; force a fail then reroll
    const { ctx, events } = ctxFor(state, [6, 1, 5, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DiceRerolled').length).toBeGreaterThan(0)
    expect(eventsOf(evs, 'WoundRolled')).toHaveLength(1)
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ die: 5, wounded: true })
  })

  it('WEAP-016b Twin-linked offers a decision to re-roll a successful wound, which the player may decline', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [6, 5, ...TAIL])
    let sawOffer = false
    const keep: Choose = (p) => {
      if (p.kind === 'chooseOption' && p.context.topic === 'rerollOffer') { sawOffer = true; return { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: 'keep' } }
      return firstOption(p)
    }
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:grunts', 1)] })
    const evs = drive({ ctx, events }, keep)
    expect(sawOffer).toBe(true)
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ die: 5, wounded: true })
  })

  it('WEAP-017 Lance gives +1 to wound after the bearer made a Charge move this turn', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.blade'] as any).abilities = [{ ability: 'LANCE' }] })
    place(state)
    state.units['A:grunts'].turn.chargedThisTurn = true
    // blade S4 vs mob T5 needs 5+; +1 Lance turns an unmodified 4 into a success (final 5)
    const { ctx, events } = ctxFor(state, [6, 4, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.blade', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ die: 4, final: 5, wounded: true })
  })

  it('WEAP-018 Melta adds damage only within half range', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'MELTA', value: 2 }] })
    state.units['B:mob'].models = ['B:mob#0'] // the Nob (W2): D1+Melta2=3 total, so it takes exactly 2 points to kill
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#0' || !id.startsWith('B:mob#')))
    place(state) // within half range (12") of the gun's 24" range
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied')).toHaveLength(2) // D1 + Melta 2 = 3 total, but only 2 wounds exist -> the 3rd point is lost
  })

  it('WEAP-019 effectiveWeapon merges a granted Ignores Cover ability, and Ignores Cover always denies cover', () => {
    const state = stateWith(unattached(), (b) => {
      b.abilities['test.grant-ignores-cover'] = { id: 'test.grant-ignores-cover', name: 'Test', text: '', trigger: 'always', effect: { grantWeaponAbility: { ability: 'IGNORES_COVER' } } }
      b.datasheets['red.grunts'].abilities = [...b.datasheets['red.grunts'].abilities, 'test.grant-ignores-cover']
    })
    place(state)
    const eff = weaponService.effectiveWeapon(state, 'A:grunts#1', 'red.w.gun')
    expect(weaponService.hasAbility(eff, 'IGNORES_COVER')).toBe(true)
    expect(DEFAULT_MODULES.services.los.benefitOfCover(state, 'B:mob#1', 'A:grunts', eff)).toBe(false)
  })

  it('WEAP-023/024 Hazardous: one test per weapon after the unit finishes; a failure hits a carrier for 3 mortal wounds', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['blu.w.rokkit'] as any).abilities = [...(b.weapons['blu.w.rokkit'] as any).abilities, { ability: 'HAZARDOUS' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 1, /* hazardous test */ 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    const hz = eventsOf(evs, 'HazardousTested')[0]
    expect(hz).toMatchObject({ failed: true, modelId: 'B:kopta#0' })
    expect(eventsOf(evs, 'DamageApplied').some((d) => d.modelId === 'B:kopta#0' && d.mortal)).toBe(true)
  })

  it('WEAP-029 One Shot marks the weapon used once it fires', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'ONE_SHOT' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [2, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    drive({ ctx, events })
    expect(state.models['A:grunts#1'].oneShotUsed).toContain('red.w.gun')
  })

  it('WEAP-025/026 Precision on an attached unit: with the CHARACTER visible, mortal wounds (Devastating Wounds) may go to it', () => {
    const setup = { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } }
    const state = stateWith(setup, (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PRECISION' }, { ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const chooseCharacter: Choose = (p) => {
      if (p.kind === 'allocateAttack' && p.context.eligibleModels.includes('B:warboss#0')) {
        return { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: 'B:warboss#0' }
      }
      return firstOption(p)
    }
    const { ctx, events } = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events }, chooseCharacter)
    expect(eventsOf(evs, 'DamageApplied').some((d) => d.modelId === 'B:warboss#0' && d.mortal)).toBe(true)
  })
})

// ---------- leaders (attached units) ----------

describe('leaders (attached units)', () => {
  it('LEAD-006/007/008 destroying the bodyguard leaves the leader as its own unit', () => {
    const state = stateWith() // default: boss attached to grunts
    place(state)
    state.units['A:grunts'].models = ['A:grunts#1']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'A:grunts#1' || !id.startsWith('A:grunts#')))
    state.models['A:grunts#1'].woundsRemaining = 1 // one point of damage finishes it
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    const ud = eventsOf(evs, 'UnitDestroyed')[0]
    expect(ud.unitId).toBe('A:grunts')
    expect(eventsOf(evs, 'LeaderDetached')).toHaveLength(1)
    expect(state.units['A:boss'].bodyguardUnitId).toBeNull()
    expect(leaderService.isCharacterUnitDestroyed(state, 'A:grunts')).toBe(false) // bodyguard alone isn't the CHARACTER unit
  })

  it('LEAD-013 Precision allocation pool includes the CHARACTER only when it is reported visible', () => {
    const state = stateWith() // default: boss attached to grunts, bodyguard alive
    place(state)
    const withoutVisibility = leaderService.allocatableModels(state, 'A:grunts', { precision: true, visibleCharacterIds: [] })
    expect(withoutVisibility).not.toContain('A:boss#0')
    const withVisibility = leaderService.allocatableModels(state, 'A:grunts', { precision: true, visibleCharacterIds: ['A:boss#0'] })
    expect(withVisibility).toContain('A:boss#0')
  })
})

// ---------- regression coverage for verifier findings (see STATUS/issues) ----------

describe('attack sequence: per-sequence and per-slot roll isolation', () => {
  it('SHOOT-046-dice a second unit shooting in the same phase gets its own dice, not the first unit\'s cached rolls', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [2, 6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    drive({ ctx, events })
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:grunts', 1)] })
    const hits = eventsOf(drive({ ctx, events }), 'HitRolled')
    expect(hits.map((h) => h.die)).toEqual([2, 6])
  })

  it('WEAP-008-dice a Sustained Hits extra hit rolls its own wound die, independent of the primary attack\'s', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'SUSTAINED_HITS', value: 1 }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 2, 5, ...TAIL]) // hit 6 crit (+1 extra hit); primary wound 2 (fail); extra hit's wound 5
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const wounds = eventsOf(drive({ ctx, events }), 'WoundRolled')
    expect(wounds.map((w) => w.die)).toEqual([2, 5])
  })

  it('WEAP-011 Lethal Hits + Sustained Hits: the primary auto-wound\'s save and the extra hit\'s save roll independently', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'LETHAL_HITS' }, { ability: 'SUSTAINED_HITS', value: 1 }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 5, 4, 2, ...TAIL]) // hit 6 crit+lethal (auto-wound); extra hit's wound 5 (success); then saves: #1 die 4, #2 die 2
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'SaveRolled').map((s) => s.die)).toEqual([4, 2])
  })

  it('WEAP-012-dmg two Devastating Wounds criticals in one group roll independent damage', () => {
    const state = stateWith(unattached(), (b) => { const w = b.weapons['blu.w.slugga'] as any; w.D = 'D6'; w.abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 6, 6, 4, 2, ...TAIL]) // 2 attacks: both crit-hit, crit-wound (deferred); damage rolls 4 then 2
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 2)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied').filter((d) => d.mortal)).toHaveLength(6) // 4 + 2, not the same roll doubled
  })

  it('WEAP-013-order Devastating Wounds mortal wounds wait for the rest of the sequence\'s attacks to finish', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    // grunts#1: hit 6, wound 6 (critical -> deferred); grunts#2: hit 6, wound 5 (normal success), save 1 (fail)
    const { ctx, events } = ctxFor(state, [6, 6, 6, 5, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1), target('A:grunts#2', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    const save = evs.findIndex((e) => e.type === 'SaveRolled')
    const firstMortal = evs.findIndex((e) => e.type === 'DamageApplied' && e.mortal)
    expect(save).toBeGreaterThanOrEqual(0)
    expect(firstMortal).toBeGreaterThan(save)
  })

  it('WEAP-024-per-model two models firing the same Hazardous weapon each get their own test', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HAZARDOUS' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1), target('A:grunts#2', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'HazardousTested')).toHaveLength(2)
  })
})

describe('attack sequence: Blast snapshot and leader/mortal spillover (R-10.1)', () => {
  it('WEAP-006-selection Blast count is fixed at target selection, unaffected by an earlier group thinning the target', () => {
    const state = stateWith(unattached(), (b) => { const w = b.weapons['red.w.gun'] as any; w.A = 1; w.abilities = [{ ability: 'BLAST' }] })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 1, 6, 6, 1, 6, 6, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob'), target('A:grunts#2', 'red.w.gun', 'B:mob')] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')).toHaveLength(6) // 10 models at selection -> (1+2) each, even after group 1 kills models
  })

  it('WEAP-006-attached Blast counts the attached leader\'s models too', () => {
    const setup = { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } }
    const state = stateWith(setup, (b) => { const w = b.weapons['red.w.gun'] as any; w.A = 1; w.abilities = [{ ability: 'BLAST' }] })
    state.units['B:mob'].models = state.units['B:mob'].models.slice(0, 9)
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => state.units['B:mob'].models.includes(id) || !id.startsWith('B:mob#')))
    place(state)
    const { ctx, events } = ctxFor(state, [...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob')] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')).toHaveLength(3) // base 1 + floor((9 Boyz + 1 Warboss) / 5) = 1 + 2
  })

  it('SHOOT-048 the last bodyguard model dying mid-volley routes the rest of the attacks to the attached leader', () => {
    const state = stateWith() // default: boss attached to grunts
    place(state)
    state.units['A:grunts'].models = ['A:grunts#1']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'A:grunts#1' || !id.startsWith('A:grunts#')))
    state.models['A:grunts#1'].woundsRemaining = 1
    // 3 hits, 3 wounds, 3 failed saves (batched)
    const { ctx, events } = ctxFor(state, [6, 6, 6, 6, 6, 6, 1, 1, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied').filter((d) => d.modelId === 'A:boss#0')).toHaveLength(2) // 2 of the 3 attacks spill onto the leader
    // R-10.1: the leader/bodyguard split happens only after the attacking unit's whole sequence is done
    const detachIdx = evs.findIndex((e) => e.type === 'LeaderDetached')
    const lastHit = evs.map((e) => e.type).lastIndexOf('HitRolled')
    expect(detachIdx).toBeGreaterThan(lastHit)
  })

  it('LEAD-014 mortal wounds spill from the last bodyguard model onto the attached CHARACTER', () => {
    const state = stateWith()
    place(state)
    state.units['A:grunts'].models = ['A:grunts#1']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'A:grunts#1' || !id.startsWith('A:grunts#')))
    state.models['A:grunts#1'].woundsRemaining = 1
    const { ctx, events } = ctxFor(state, [...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [] })
    attackService.queueMortalWounds(ctx, 'A:grunts', 3, 'test', false)
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied').filter((d) => d.modelId === 'A:boss#0')).toHaveLength(2)
  })

  it('SHOOT-029-batches two equal-size mortal-wound batches on one unit in a phase both fully resolve', () => {
    const state = stateWith(unattached())
    state.units['B:mob'].models = state.units['B:mob'].models.slice(1) // drop the W2 Nob so every model is W1
    place(state)
    const { ctx, events } = ctxFor(state, [])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [] })
    attackService.queueMortalWounds(ctx, 'B:mob', 2, 'test', false)
    attackService.queueMortalWounds(ctx, 'B:mob', 2, 'test', false)
    expect(eventsOf(drive({ ctx, events }), 'ModelDestroyed')).toHaveLength(4)
  })
})

describe('attack sequence: Indirect Fire, Big Guns Never Tire, damage-reduction floor', () => {
  it('SHOOT-041/WEAP-020 Indirect Fire vs a target with no visible model: −1 to hit and an unmodified 3 fails', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }] })
    place(state)
    placeUnit(state, 'A:grunts', [[-6, -5]])
    state.units['B:mob'].models = ['B:mob#9']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#9' || !id.startsWith('B:mob#')))
    placeUnit(state, 'B:mob', [[-6, 10]])
    expect(DEFAULT_MODULES.services.los.visible(state, 'A:grunts#1', 'B:mob#9')).toBe(false) // precondition: behind the ruin
    const { ctx, events } = ctxFor(state, [4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    // BS3+: unmodified 4 with −1 -> final 3 still hits; confirms the modifier is actually applied
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')[0]).toMatchObject({ die: 4, final: 3, hit: true })
  })

  it('SHOOT-005 Big Guns Never Tire: a VEHICLE attacker in Engagement Range gets −1 to hit with a non-Pistol weapon', () => {
    const state = stateWith(unattached())
    place(state)
    placeUnit(state, 'B:mob', [[-16, -2.6]])
    ;(state.units['A:walker'].turn as any).moveType = 'normal'
    expect(leaderService.inEngagementWithEnemy(state, 'A:walker')).toBe(true) // precondition
    const { ctx, events } = ctxFor(state, [4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.cannon', 'B:brute', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')[0]).toMatchObject({ die: 4, final: 3, hit: false })
  })

  it('SHOOT-017 stacked −1 hit modifiers (Stealth + Big Guns Never Tire) cap the net modifier at −1, not −2', () => {
    const state = stateWith(unattached(), (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'STEALTH' }] })
    place(state)
    placeUnit(state, 'B:mob', [[-16, -2.6]]) // adjacent to the walker -> the walker is in Engagement Range too
    ;(state.units['A:walker'].turn as any).moveType = 'normal'
    expect(leaderService.inEngagementWithEnemy(state, 'A:walker')).toBe(true)
    // BS4+ cannon: unmodified 5, two −1 sources would be −2 uncapped (final 3, a miss) but R-6.20 caps the net at −1
    const { ctx, events } = ctxFor(state, [5, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.cannon', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')[0]).toMatchObject({ die: 5, final: 4, hit: true })
  })

  it('WEAP-037-min damage reduction never takes a live attack below 1 point of damage', () => {
    const state = stateWith(unattached(), (b) => {
      b.datasheets['red.walker'].abilities = [{ id: 'test.dr', name: 'DR', text: '', trigger: 'damageApplied', effect: { damageReduction: 1 } } as any]
    })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL]) // hit, wound (S4 vs T9 needs 6+), armour save 1
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'DamageApplied')).toHaveLength(1)
  })
})

describe('attack sequence: additional checklist coverage', () => {
  it('SHOOT-019 an unmodified 6 wound roll still succeeds and is critical even under a −1 modifier', () => {
    const state = stateWith(unattached(), (b) => {
      b.abilities['test.wound-minus-one'] = { id: 'test.wound-minus-one', name: 'Test', text: '', trigger: 'woundRoll', effect: { modifyRoll: { roll: 'wound', value: -1 } } }
      b.datasheets['red.grunts'].abilities = [...b.datasheets['red.grunts'].abilities, 'test.wound-minus-one']
    })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 1, ...TAIL]) // hit 6; wound unmodified 6 (final 5) still succeeds and criticals; save 1
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'WoundRolled')[0]).toMatchObject({ die: 6, final: 5, wounded: true, critical: true })
  })

  it('SHOOT-019b an unmodified 1 wound roll always fails even under a +1 modifier', () => {
    const state = stateWith(unattached(), (b) => {
      b.abilities['test.wound-plus-one'] = { id: 'test.wound-plus-one', name: 'Test', text: '', trigger: 'woundRoll', effect: { modifyRoll: { roll: 'wound', value: 1 } } }
      b.datasheets['red.grunts'].abilities = [...b.datasheets['red.grunts'].abilities, 'test.wound-plus-one']
    })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 1, ...TAIL]) // hit 6; wound unmodified 1 (final 2) still fails
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'WoundRolled')[0]).toMatchObject({ die: 1, final: 2, wounded: false })
  })

  it('SHOOT-028 a second, D3-damage attack forced onto an already-wounded model loses its excess, not a spill', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['blu.w.slugga'] as any).D = 'D3' })
    place(state)
    // attack 1: hit 6, wound 4 (S4 vs T4 needs 4+), save 1 (fail), D3 damage face 1 -> 1 (grunts model to 1W remaining)
    // attack 2: forced onto the same model (now wounded); hit 6, wound 4, save 1 (fail), D3 damage face 6 -> 3 (overkill)
    const { ctx, events } = ctxFor(state, [6, 6, 4, 4, 1, 1, 1, 6, ...TAIL]) // hits, wounds, saves (all fail), then damage D3: 1 then 6
    attackService.begin(ctx, {
      kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false,
      targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 1), target('B:mob#2', 'blu.w.slugga', 'A:grunts', 1)],
    })
    const evs = drive({ ctx, events })
    const allocated = eventsOf(evs, 'AttackAllocated')
    expect(allocated[1].modelId).toBe(allocated[0].modelId) // forced onto the wounded model, no decision needed
    expect(eventsOf(evs, 'DamageApplied').filter((d) => d.modelId === allocated[0].modelId)).toHaveLength(2) // 1 + the fatal point; 2 more lost
    expect(eventsOf(evs, 'ModelDestroyed')).toHaveLength(1)
  })

  it('SHOOT-030 a Devastating Wounds critical for D3=3 on a W1 model kills it, losing the other 2', () => {
    const state = stateWith(unattached(), (b) => { const w = b.weapons['red.w.gun'] as any; w.D = 'D3'; w.abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    state.units['B:mob'].models = ['B:mob#9'] // a plain Boy (W1)
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#9' || !id.startsWith('B:mob#')))
    place(state)
    const { ctx, events } = ctxFor(state, [6, 6, 6, ...TAIL]) // hit crit; wound crit (deferred); D3 damage face 6 -> 3
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied').filter((d) => d.mortal)).toHaveLength(1) // only the fatal point is ever applied
    expect(eventsOf(evs, 'ModelDestroyed')).toHaveLength(1)
  })

  it('SHOOT-031 a Hazardous failure\'s mortal wounds do not spill past the one carrier that dies', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['blu.w.slugga'] as any).abilities = [{ ability: 'PISTOL' }, { ability: 'HAZARDOUS' }] })
    state.units['B:mob'].models = ['B:mob#9'] // a lone W1 Boy carrying the weapon
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#9' || !id.startsWith('B:mob#')))
    place(state)
    const { ctx, events } = ctxFor(state, [6, 4, 1, 1, ...TAIL]) // hit, wound, save fail, then a failed Hazardous test (3 MW)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#9', 'blu.w.slugga', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'DamageApplied').filter((d) => d.mortal)).toHaveLength(1) // W1: only 1 of the 3 MW ever lands
    expect(eventsOf(evs, 'ModelDestroyed').filter((d) => d.modelId === 'B:mob#9')).toHaveLength(1)
  })

  it('SHOOT-032 within one group, normal wounds are allocated and saved before a Devastating Wounds critical resolves', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    // 2 normal attacks (wound 5 = success vs T5, save 1 = fail) then a critical wound (deferred to the end)
    const { ctx, events } = ctxFor(state, [6, 6, 6, 5, 5, 6, 1, 1, ...TAIL]) // hits, wounds (5,5,6=crit), saves (fail, fail)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 3)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'SaveRolled')).toHaveLength(2)
    const lastSave = evs.map((e) => e.type).lastIndexOf('SaveRolled')
    const firstMortal = evs.findIndex((e) => e.type === 'DamageApplied' && e.mortal)
    expect(firstMortal).toBeGreaterThan(lastSave)
  })

  it('SHOOT-034 Feel No Pain applies to mortal wounds, not just normal damage', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [3, ...TAIL]) // FNP roll (die 3, needs 6+) fails -> the mortal wound still lands
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [] })
    attackService.queueMortalWounds(ctx, 'B:brute', 1, 'test', false)
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'FeelNoPainRolled')[0]).toMatchObject({ needed: 6, die: 3, ignored: false })
    expect(eventsOf(evs, 'DamageApplied').some((d) => d.mortal && d.unitId === 'B:brute')).toBe(true)
  })

  it('SHOOT-042 a variable attack-count weapon fired by two different models each rolls its own dice', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).A = 'D3' })
    place(state)
    const { ctx, events } = ctxFor(state, [3, 5, ...TAIL]) // face 3 -> D3=2 attacks for model 1; face 5 -> D3=3 attacks for model 2
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob'), target('A:grunts#2', 'red.w.gun', 'B:mob')] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')).toHaveLength(7) // (2 + Rapid Fire 1) + (3 + 1): each model rolled its own attack count
  })
})

// ---------- verification round 2 fixes (Precision chooser, BGNT vs engaged target, S double-count, R-3.12, attached Stealth/Deadly Demise) ----------

describe('attack sequence: verification round 2 regressions', () => {
  const attachedB = () => ({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } })

  it('WEAP-025-attacker Precision: the attacker gets the CHARACTER offer; passing hands a normal allocation to the defender', () => {
    const state = stateWith(attachedB(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PRECISION' }] })
    place(state)
    const seen: PendingDecision[] = []
    const { ctx, events } = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const decline: Choose = (p) => {
      seen.push(p)
      if (p.kind === 'allocateAttack' && p.player === 'A') return { type: 'pass', player: 'A', decisionId: p.id }
      return firstOption(p)
    }
    const evs = drive({ ctx, events }, decline)
    const allocs = seen.filter((p) => p.kind === 'allocateAttack')
    expect(allocs[0]).toMatchObject({ player: 'A', canPass: true })
    expect((allocs[0].context as any).eligibleModels).toEqual(['B:warboss#0'])
    expect(allocs.slice(1).every((p) => p.player === 'B' && !(p.context as any).eligibleModels.includes('B:warboss#0'))).toBe(true)
    expect(eventsOf(evs, 'AttackAllocated')[0].modelId).not.toBe('B:warboss#0')
  })

  it('WEAP-025-wounded Precision reaches the CHARACTER even when a bodyguard model is already wounded', () => {
    const state = stateWith(attachedB(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PRECISION' }] })
    place(state)
    const nob = state.units['B:mob'].models.find((id) => state.models[id].woundsRemaining === 2)!
    state.models[nob].woundsRemaining = 1
    const { ctx, events } = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'AttackAllocated')[0].modelId).toBe('B:warboss#0')
  })

  it('WEAP-026 Precision + Devastating Wounds: the attacker puts the mortal wounds on the visible CHARACTER', () => {
    const state = stateWith(attachedB(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PRECISION' }, { ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const seen: PendingDecision[] = []
    const { ctx, events } = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive({ ctx, events }, (p) => { seen.push(p); return firstOption(p) })
    expect(seen.find((p) => p.kind === 'allocateAttack')).toMatchObject({ player: 'A' })
    expect(eventsOf(evs, 'DamageApplied').some((d) => d.modelId === 'B:warboss#0' && d.mortal)).toBe(true)
  })

  it('SHOOT-007 Big Guns Never Tire: -1 to hit vs a VEHICLE engaged with a friendly unit other than the shooter', () => {
    const state = stateWith(unattached())
    place(state)
    placeUnit(state, 'B:brute', [[-16, -2.05]])
    expect(leaderService.unitsInEngagement(state, 'B:brute', 'A:walker')).toBe(true) // precondition
    const { ctx, events } = ctxFor(state, [5, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:walker', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')[0]).toMatchObject({ die: 5, final: 4, hit: false })
  })

  it('SHOOT-018-statmod a +1 S modifier counts once on the wound roll (S5 vs T5 needs 4+)', () => {
    const state = stateWith(unattached(), (b) => {
      b.datasheets['red.grunts'].abilities = [{ id: 't.str', name: 'Str', text: '', trigger: 'always', effect: { modifyStat: { stat: 'S', value: 1 } } } as any]
    })
    place(state)
    const { ctx, events } = ctxFor(state, [6, 3, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'WoundRolled')[0]).toMatchObject({ needed: 4, wounded: false })
  })

  it('SHOOT-041-sv3 R-3.12: granted/Indirect cover gives a Sv3+ model nothing against AP0', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['blu.w.slugga'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }] })
    place(state)
    state.units['A:grunts'].models = ['A:grunts#1']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'A:grunts#1' || !id.startsWith('A:grunts#')))
    placeUnit(state, 'A:grunts', [[-6, -5]])
    state.units['B:mob'].models = ['B:mob#9']
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => id === 'B:mob#9' || !id.startsWith('B:mob#')))
    placeUnit(state, 'B:mob', [[-6, 10]])
    const { ctx, events } = ctxFor(state, [6, 6, 2, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#9', 'blu.w.slugga', 'A:grunts', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'AttackAllocated')[0].cover).toBe(false)
    expect(eventsOf(evs, 'SaveRolled')[0]).toMatchObject({ die: 2, final: 2, saved: false })
  })

  it('SHOOT-036-attached Stealth on the bodyguard only (leader lacks it) gives no -1 to hit', () => {
    const state = stateWith(attachedB(), (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'STEALTH' }] as any })
    place(state)
    const { ctx, events } = ctxFor(state, [3, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')[0]).toMatchObject({ die: 3, final: 3, hit: true })
  })

  it('SHOOT-036-attached Stealth on BOTH halves of an attached unit still gives -1 to hit', () => {
    const state = stateWith(attachedB(), (b) => {
      b.datasheets['blu.mob'].coreAbilities = [{ ability: 'STEALTH' }] as any
      b.datasheets['blu.warboss'].coreAbilities = [{ ability: 'STEALTH' }] as any
    })
    place(state)
    const { ctx, events } = ctxFor(state, [3, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(eventsOf(drive({ ctx, events }), 'HitRolled')[0]).toMatchObject({ die: 3, final: 2, hit: false })
  })

  it('SHOOT-044-attached Deadly Demise treats an attached Leader+bodyguard as one affected unit (one batch)', () => {
    const state = stateWith() // boss attached to grunts
    place(state)
    const { ctx, events } = ctxFor(state, [6, 1, 1, 1, 1, 1, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [] })
    attackService.queueMortalWounds(ctx, 'A:walker', 8, 'test', false)
    const dd = eventsOf(drive({ ctx, events }), 'DeadlyDemiseRolled')[0]
    expect(dd.exploded).toBe(true)
    expect(dd.affected.filter((u) => u === 'A:grunts' || u === 'A:boss')).toEqual(['A:grunts'])
  })
})

// ---------- fast-roll batches (M9): one decision per batch, dice picked by index ----------
describe('attack sequence: fast-roll batches', () => {
  const pass = (p: PendingDecision): Action => ({ type: 'pass', player: p.player, decisionId: p.id })
  // answers a Command Re-roll with the die at `dieIndex`, passes any other stratagem window, picks the first option otherwise
  const commandRerollDie = (dieIndex: number, seen: PendingDecision[]): Choose => (p) => {
    seen.push(p)
    if (p.kind === 'commandReroll') return p.options.find((o) => o.id === `reroll:${dieIndex}`)!.action
    if (p.kind === 'stratagemWindow' || p.kind === 'reactionWindow') return pass(p)
    return firstOption(p)
  }
  const oathLike = (b: DataBundle) => {
    b.datasheets['blu.mob'].abilities = [{ id: 't.oath', name: 'Oath', text: '', trigger: 'hitRoll', effect: { reroll: 'all' } } as any]
  }

  it('SHOOT-043c a batch of hit dice opens ONE commandReroll decision (selectableDice) and re-rolls exactly the picked die', () => {
    const state = stateWith(unattached())
    place(state)
    state.players.B.cp = 2
    const { ctx, events } = ctxFor(state, [2, 2, 2, 6, ...TAIL]) // three hit dice (all miss at BS5+); the pick re-rolls die 1 -> 6
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    const seen: PendingDecision[] = []
    const evs = drive({ ctx, events }, commandRerollDie(1, seen))
    const offers = seen.filter((p) => p.kind === 'commandReroll' && p.context.roll.purpose === 'hit')
    expect(offers).toHaveLength(1)
    const offer = offers[0] as Extract<PendingDecision, { kind: 'commandReroll' }>
    expect(offer.context.selectableDice).toBe(true)
    expect(offer.context.roll.dice).toHaveLength(3)
    expect(offer.context.roll.needed).toBe(5)
    expect(eventsOf(evs, 'DiceRerolled')[0]).toMatchObject({ source: 'commandReroll', before: [2], after: [6], indexes: [1] })
    expect(eventsOf(evs, 'HitRolled').map((h) => h.die)).toEqual([2, 6, 2]) // one HitRolled per die, in batch order
    expect(eventsOf(evs, 'HitRolled').map((h) => h.dieIndex)).toEqual([0, 1, 2])
  })

  it('SHOOT-043d a rerollOffer re-rolls only the dice named in dieIndexes; the rest keep their result', () => {
    const state = stateWith(unattached(), oathLike)
    place(state)
    const { ctx, events } = ctxFor(state, [5, 5, 5, 1, ...TAIL]) // three hits offered; only die 1 is re-rolled -> 1 (miss)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    const offers: PendingDecision[] = []
    const evs = drive({ ctx, events }, (p) => {
      if (p.kind === 'chooseOption' && p.context.topic === 'rerollOffer') {
        offers.push(p)
        return { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: 'reroll', dieIndexes: [1] }
      }
      return firstOption(p)
    })
    expect(offers).toHaveLength(1) // ONE offer for the whole batch, not one per die
    expect((offers[0] as Extract<PendingDecision, { kind: 'chooseOption' }>).context.data).toMatchObject({ dieIndexes: [0, 1, 2], needed: 5, purpose: 'hit' })
    expect(eventsOf(evs, 'DiceRerolled')[0]).toMatchObject({ source: 'rerollOffer', before: [5], after: [1], indexes: [1] })
    expect(eventsOf(evs, 'HitRolled').map((h) => [h.die, h.hit])).toEqual([[5, true], [1, false], [5, true]])
  })

  it('SHOOT-043e a rerollOffer answer with an empty, unoffered or repeated die index is rejected', () => {
    const state = stateWith(unattached(), oathLike)
    place(state)
    const { ctx } = ctxFor(state, [5, 5, 5, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const p = ctx.state.pending as PendingDecision
    expect(p.kind === 'chooseOption' && p.context.topic).toBe('rerollOffer')
    const ask = (dieIndexes: number[], optionId = 'reroll') => engine.validate(ctx.state, { type: 'chooseOption', player: p.player, decisionId: p.id, optionId, dieIndexes })
    expect(ask([])?.code).toBe('E_NOT_AN_OPTION')
    expect(ask([3])?.code).toBe('E_NOT_AN_OPTION')
    expect(ask([0, 0])?.code).toBe('E_NOT_AN_OPTION')
    expect(ask([0], 'keep')?.code).toBe('E_NOT_AN_OPTION')
    expect(ask([0, 2])).toBeNull()
  })

  it('R-1.6 a die re-rolled by an ability is not offered to Command Re-roll again', () => {
    const state = stateWith(unattached(), oathLike)
    place(state)
    state.players.B.cp = 2
    const { ctx, events } = ctxFor(state, [5, 5, 5, 1, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    const seen: PendingDecision[] = []
    drive({ ctx, events }, (p) => {
      seen.push(p)
      if (p.kind === 'chooseOption' && p.context.topic === 'rerollOffer') return { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: 'reroll', dieIndexes: [1] }
      if (p.kind === 'commandReroll' || p.kind === 'stratagemWindow' || p.kind === 'reactionWindow') return pass(p)
      return firstOption(p)
    })
    const cr = seen.find((p) => p.kind === 'commandReroll' && p.context.roll.purpose === 'hit') as Extract<PendingDecision, { kind: 'commandReroll' }>
    expect(cr.options.map((o) => o.id)).toEqual(['reroll:0', 'reroll:2']) // die 1 already re-rolled
  })

  it('SHOOT-050a the saves of one group are ONE roll with one Command Re-roll window; only the failed save asks where to allocate', () => {
    const state = stateWith(unattached())
    place(state)
    state.players.A.cp = 2
    const { ctx, events } = ctxFor(state, [6, 6, 6, 6, 6, 6, 5, 1, 5, ...TAIL]) // 3 hits, 3 wounds, then saves 5 (pass) 1 (fail) 5 (pass)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    const seen: PendingDecision[] = []
    const evs = drive({ ctx, events }, (p) => {
      seen.push(p)
      if (p.kind === 'commandReroll' || p.kind === 'stratagemWindow' || p.kind === 'reactionWindow') return pass(p)
      return firstOption(p)
    })
    const saveRolls = eventsOf(evs, 'DiceRolled').filter((e) => e.roll.purpose === 'save')
    expect(saveRolls).toHaveLength(1)
    expect(saveRolls[0].roll.dice).toEqual([5, 1, 5])
    expect(seen.filter((p) => p.kind === 'commandReroll' && p.context.roll.purpose === 'save')).toHaveLength(1)
    expect(eventsOf(evs, 'SaveRolled').map((s) => s.saved)).toEqual([true, false, true])
    expect(eventsOf(evs, 'SaveRolled').map((s) => s.dieIndex)).toEqual([0, 1, 2])
    expect(seen.filter((p) => p.kind === 'allocateAttack')).toHaveLength(1) // fresh 4-model squad: a real choice, but only for the failure
  })

  it('SHOOT-050b two firing models with the same weapon at one target share ONE hit roll', () => {
    const state = stateWith(unattached())
    place(state)
    const { ctx, events } = ctxFor(state, [2, 2, 2, 2, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 2), target('B:mob#2', 'blu.w.slugga', 'A:grunts', 2)] })
    const evs = drive({ ctx, events })
    const hitRolls = eventsOf(evs, 'DiceRolled').filter((e) => e.roll.purpose === 'hit')
    expect(hitRolls).toHaveLength(1)
    expect(hitRolls[0].roll.dice).toHaveLength(4)
    expect(new Set(eventsOf(evs, 'HitRolled').map((h) => h.attack.attackerModelId))).toEqual(new Set(['B:mob#1', 'B:mob#2']))
  })

  it('SHOOT-051 attacks aimed at a target with no models left are lost: no dice, no events; other targets still resolve', () => {
    const state = stateWith(unattached())
    place(state)
    const dead = state.units['A:grunts']
    for (const id of dead.models) delete state.models[id]
    dead.models = []
    dead.location = 'destroyed'
    const { ctx, events } = ctxFor(state, [...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3), target('B:mob#2', 'blu.w.slugga', 'A:walker', 1)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'HitRolled')).toHaveLength(1)
    expect(eventsOf(evs, 'HitRolled')[0].attack.targetUnitId).toBe('A:walker')
    expect(eventsOf(evs, 'DiceRolled').filter((e) => e.roll.targetUnitId === 'A:grunts')).toHaveLength(0)
  })

  it('SHOOT-051b a target that dies partway through drops its remaining saves and later groups (nothing rolled for them)', () => {
    const state = stateWith(unattached())
    place(state)
    for (const id of state.units['A:walker'].models) state.models[id].woundsRemaining = 1
    const { ctx, events } = ctxFor(state, [...Array(10).fill(6), ...Array(5).fill(1), ...TAIL]) // 5 hits, 5 wounds, 5 failed saves
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 3), target('B:mob#2', 'blu.w.slugga', 'A:walker', 2)] })
    const evs = drive({ ctx, events })
    expect(eventsOf(evs, 'ModelDestroyed').filter((m) => m.unitId === 'A:walker')).toHaveLength(1)
    expect(eventsOf(evs, 'SaveRolled')).toHaveLength(1) // the first failed save kills it; the other 4 wounding attacks are lost
    expect(eventsOf(evs, 'DiceRolled').filter((e) => e.roll.purpose === 'damage')).toHaveLength(0)
  })
})
