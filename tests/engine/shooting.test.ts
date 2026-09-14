// Shooting phase module (10-rules §6, docs/spec/12-rules-test-checklist.md SHOOT-*). Covers the phase-flow layer that
// sits above the shared attack sequence: which unit may be selected (R-6.1-R-6.3 eligibility, Engagement Range / Big
// Guns Never Tire / Pistol exceptions), which (model, weapon, target) tuples are legal to declare (R-6.4 range+LoS,
// Lone Operative's 12" cap, Indirect Fire waiving visibility, the target-side Engagement Range restriction, Blast's
// "never at a unit within the bearer's own Engagement Range"), R-6.7's per-model Pistol-xor-other-weapons rule and
// R-6.11's "one profile per activation", and R-6.1's "each unit shoots at most once per phase". Everything at or
// below R-6.10 (hit/wound/allocate/save/damage, Hazardous, Feel No Pain, Deadly Demise, Devastating Wounds, Big Guns
// Never Tire's -1 to hit, Stealth's -1 to hit, Indirect Fire's roll penalty, Overwatch's hits-only-on-6) is exercised
// directly by tests/engine/attack*.test.ts against the shared attack sequence and is not re-tested here.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, mmToInch, setModelPos,
  type Action, type EngineContext, type GameState, type PendingDecision, type Rejection, type WeaponTarget,
} from '../../src/engine'
import { buildShootingWeaponEntries, shootingModule } from '../../src/engine/phases/shooting'
import { leaderService } from '../../src/engine/leaders'
import type { DataBundle, TerrainPieceData } from '../../src/data/types'
import { bundle, withBundle } from '../fixtures/bundle'
import { makePlayerA, makePlayerB, makeSetup } from '../fixtures/setup'
import { placeUnit } from '../fixtures/state'
import { recordingStratagems } from '../fixtures/modules'

// ---------- harness ----------
function stateWith(setupOverrides: Parameters<typeof makeSetup>[0] = {}, patch?: (b: DataBundle) => void): GameState {
  const b = patch ? withBundle(patch) : bundle
  const state = createGameState(makeSetup(setupOverrides), b, 'seed', ENGINE_VERSION)
  state.phase = 'shooting'
  return state
}
// no attachments on either side, so "a unit" always means exactly one Unit record (simpler engagement geometry)
function unattached(overrides: Parameters<typeof makeSetup>[0] = {}): Parameters<typeof makeSetup>[0] {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() }, ...overrides }
}

// spreads a multi-model unit along x starting at (x,z) so its own models never exactly coincide (coincident models
// would spuriously block each other's line of sight — the LoS module only excludes the one model actually being
// tested from a segment, not every other body standing at the same point)
function rowPlace(state: GameState, unitId: string, x: number, z: number, gap = 0.3): void {
  placeUnit(state, unitId, { x, z, gap })
}
// places exactly the named models at exact positions and parks every other model of that unit far out of the way —
// for tests where one specific model's distance/visibility must be pinned precisely. `farBase` must differ between
// units placed in the same test (default per-unit hash) so two different units' parked models never land next to
// each other and become an accidental in-range "target".
function placeExact(state: GameState, unitId: string, positions: Record<string, { x: number; z: number }>, farBase?: number): void {
  const base = farBase ?? 2000 + [...unitId].reduce((a, c) => a + c.charCodeAt(0), 0) * 137
  state.units[unitId].location = 'board'
  state.units[unitId].models.forEach((id, i) => {
    const p = positions[id]
    // bypass setModelPos's 1/1000" rounding here: SHOOT-008/037 pin a distance to the exact inch, and rounding the
    // position can nudge the base-to-base gap the wrong side of that boundary
    state.models[id].pos = p ? { x: p.x, y: 0, z: p.z } : { x: base + i, y: 0, z: base + i }
  })
}

function harness(state: GameState, dice: number[] = []) { return createContext(state, new ScriptedRng(dice), DEFAULT_MODULES) }
function start(state: GameState, dice: number[] = []) {
  const h = harness(state, dice)
  shootingModule.enter(h.ctx)
  return h
}

const DID = ''

// a plain function call (vs. a literal `ctx.state.pending = null` at the call site) keeps TS from narrowing
// `pending` to `null` across the next read of `ctx.state.pending`
function clearPending(ctx: EngineContext): void { ctx.state.pending = null }

function pendingAs<K extends PendingDecision['kind']>(ctx: EngineContext, kind: K): Extract<PendingDecision, { kind: K }> {
  const p = ctx.state.pending
  if (!p || p.kind !== kind) throw new Error(`expected pending ${kind}, got ${p ? p.kind : 'null'}`)
  return p as Extract<PendingDecision, { kind: K }>
}

// answers the current (or next) pending decision (validate -> handle -> advance), throwing on a rejection
function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) shootingModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  if (shootingModule.validate) {
    const rej = shootingModule.validate(ctx.state, action, pending)
    if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  }
  ctx.state.pending = null
  const handled = shootingModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return shootingModule.advance(ctx)
}

// like `act` but returns the rejection instead of throwing; nothing is mutated on rejection
function reject(ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) shootingModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = shootingModule.validate ? shootingModule.validate(ctx.state, action, pending) : null
  if (rej) return rej
  const saved = ctx.state.pending
  ctx.state.pending = null
  const handled = shootingModule.handle(ctx, action, pending)
  if (!handled) ctx.state.pending = saved
  return handled ?? null
}

function selectUnit(ctx: EngineContext, unitId: string): 'pending' | 'done' {
  return act(ctx, { type: 'chooseUnitToActivate', player: ctx.state.units[unitId].player, decisionId: DID, unitId })
}
function declareTargets(ctx: EngineContext, unitId: string, targets: WeaponTarget[]): 'pending' | 'done' {
  return act(ctx, { type: 'declareTargets', player: ctx.state.units[unitId].player, decisionId: DID, unitId, targets })
}

// exhausts every allocateAttack / chooseOption / stratagemWindow decision raised mid-resolution (first option each
// time) until the next chooseUnitToActivate, or the phase ends
function driveToNextSelection(ctx: EngineContext): 'pending' | 'done' {
  let r: 'pending' | 'done' = ctx.state.pending ? 'pending' : shootingModule.advance(ctx)
  let guard = 0
  while (r === 'pending' && ctx.state.pending && ctx.state.pending.kind !== 'chooseUnitToActivate') {
    if (++guard > 5000) throw new Error('driveToNextSelection: too many decisions, likely an infinite loop')
    const pending = ctx.state.pending
    if (!('options' in pending) || !Array.isArray(pending.options) || pending.options.length === 0) {
      throw new Error(`no options to auto-choose for ${pending.kind}`)
    }
    const action = pending.options[0].action
    clearPending(ctx)
    const rej = shootingModule.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = shootingModule.advance(ctx)
  }
  return r
}

// ---------- SHOOT-001/002: eligibility to be selected at all ----------
describe('shooting: eligibility to be selected (SHOOT-001, SHOOT-002)', () => {
  it('SHOOT-001a a unit that Advanced this turn, with no Assault weapon, is not eligible', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    rowPlace(state, 'B:mob', 0, 0)
    state.units['A:grunts'].turn.moveType = 'advance'
    const { ctx } = start(state)
    expect(shootingModule.advance(ctx)).toBe('done')
    expect(ctx.state.pending).toBeNull()
  })

  it('SHOOT-001b Advanced with one Assault weapon: eligible, and only that weapon may be declared', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'ASSAULT' }] })
    rowPlace(state, 'A:grunts', 0, -5)
    rowPlace(state, 'B:mob', 0, 0)
    state.units['A:grunts'].turn.moveType = 'advance'
    const { ctx } = start(state)
    shootingModule.advance(ctx)
    expect(pendingAs(ctx, 'chooseUnitToActivate').context.eligible).toEqual(['A:grunts'])
    selectUnit(ctx, 'A:grunts')
    const weapons = pendingAs(ctx, 'declareTargets').context.weapons
    expect(weapons.some((w) => w.weaponId === 'red.w.gun')).toBe(true)
    expect(weapons.some((w) => w.weaponId === 'red.w.pistol')).toBe(false) // no [ASSAULT]: excluded while Advanced
    expect(weapons.some((w) => w.weaponId === 'red.w.blade')).toBe(false) // melee never offered in the Shooting phase
  })

  it('SHOOT-002 a unit with no weapon in range of any enemy cannot be selected', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.cannon'] as any).range = 1 })
    placeUnit(state, 'A:grunts', [[-22, -15]])
    placeUnit(state, 'B:mob', [[22, 15]]) // ~53" away: beyond gun (24") and pistol (12"); cannon neutralised above
    const { ctx } = start(state)
    expect(shootingModule.advance(ctx)).toBe('done')
    expect(ctx.state.pending).toBeNull()
  })
})

// ---------- SHOOT-003/004/006: Engagement Range / Big Guns Never Tire / Pistol eligibility ----------
describe('shooting: Engagement Range eligibility and target legality (SHOOT-003, SHOOT-004, SHOOT-006)', () => {
  it('SHOOT-003a a non-Pistol, non-Big-Guns unit in Engagement Range of an enemy is not eligible', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.pistol'] as any).abilities = [] }) // nobody has a Pistol now
    rowPlace(state, 'A:grunts', 0, -0.5)
    rowPlace(state, 'B:mob', 0, 0.5) // ~1" apart centre-to-centre, well within Engagement Range
    const { ctx } = start(state)
    expect(shootingModule.advance(ctx)).toBe('done')
  })

  it('SHOOT-003b engaged with a Pistol: eligible, Pistols only, only at the unit it is engaged with', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -0.5)
    rowPlace(state, 'B:mob', 0, 0.5) // engaged with A:grunts
    placeUnit(state, 'B:brute', [[0, -8]]) // unengaged, within Pistol (12") and Gun (24") range
    const { ctx } = start(state)
    shootingModule.advance(ctx)
    expect(pendingAs(ctx, 'chooseUnitToActivate').context.eligible).toContain('A:grunts')
    selectUnit(ctx, 'A:grunts')
    const weapons = pendingAs(ctx, 'declareTargets').context.weapons
    expect(weapons.some((w) => w.weaponId === 'red.w.gun')).toBe(false)
    expect(weapons.some((w) => w.weaponId === 'red.w.cannon')).toBe(false)
    const pistol = weapons.find((w) => w.weaponId === 'red.w.pistol' && w.modelId === 'A:grunts#0')
    expect(pistol?.legalTargets).toEqual(['B:mob'])
  })

  it('SHOOT-004 an enemy engaged with a DIFFERENT friendly unit cannot be targeted, even by a Big-Guns unit', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -0.5)
    rowPlace(state, 'B:mob', 0, 0.5) // B:mob is engaged with A:grunts, not with A:walker
    placeUnit(state, 'A:walker', [[0, -20]]) // 20" from B:mob: well within the cannon's 36" range, itself unengaged
    const { ctx } = start(state)
    const cannon = buildShootingWeaponEntries(ctx, 'A:walker').find((e) => e.weaponId === 'red.w.cannon')
    expect(cannon?.legalTargets).not.toContain('B:mob')
  })

  it('SHOOT-006 a Big-Guns unit engaged with the enemy: Pistols may target it, Blast may not', () => {
    const state = stateWith(unattached(), (b) => {
      b.weapons['blu.w.rokkit'] = { ...b.weapons['blu.w.rokkit'], abilities: [...b.weapons['blu.w.rokkit'].abilities, { ability: 'BLAST' }] }
      b.datasheets['blu.kopta'].composition[0].weapons.default = ['blu.w.slugga', 'blu.w.rokkit', 'blu.w.spinnin-blades']
    })
    placeUnit(state, 'B:kopta', [[0, -0.5]])
    rowPlace(state, 'A:grunts', 0, 0.5) // engaged with the kopta
    const { ctx } = start(state)
    const entries = buildShootingWeaponEntries(ctx, 'B:kopta')
    expect(entries.find((e) => e.weaponId === 'blu.w.slugga')?.legalTargets).toContain('A:grunts')
    expect(entries.find((e) => e.weaponId === 'blu.w.rokkit')?.legalTargets).not.toContain('A:grunts')
  })
})

// ---------- SHOOT-005 (Blast half) / SHOOT-007 (Pistol-only half): moved/kept from shooting.verify.test.ts per the
// verifier's COVERAGE finding — the -1 to hit halves of SHOOT-005/007 live in attack*.test.ts against the shared
// attack sequence; these are the phase module's own target-legality halves (R-6.3's Blast and Pistol restrictions).
describe('shooting: Blast and Pistol-only Engagement Range targeting (SHOOT-005, SHOOT-007)', () => {
  it('SHOOT-005-blast-friendly a Blast weapon may never target a unit within Engagement Range of ANY friendly unit', () => {
    const state = stateWith(unattached())
    placeUnit(state, 'A:grunts', { x: 0, z: -0.5, gap: 0.3 })
    placeUnit(state, 'B:brute', [[0, 1.5]]) // MONSTER engaged with A:grunts (not with A:walker)
    placeUnit(state, 'A:walker', [[-12, -12]])
    const { ctx } = start(state)
    expect(leaderService.inEngagementWithEnemy(state, 'A:walker')).toBe(false) // the walker itself is unengaged
    const cannon = buildShootingWeaponEntries(ctx, 'A:walker').find((e) => e.weaponId === 'red.w.cannon')
    expect(cannon?.legalTargets).not.toContain('B:brute')
  })

  it('SHOOT-005-blast-control a non-Blast weapon on the same unit MAY target that same enemy MONSTER', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.cannon'] as any).abilities = [{ ability: 'HEAVY' }] })
    placeUnit(state, 'A:grunts', { x: 0, z: -0.5, gap: 0.3 })
    placeUnit(state, 'B:brute', [[0, 1.5]])
    placeUnit(state, 'A:walker', [[-12, -12]])
    const { ctx } = start(state)
    const cannon = buildShootingWeaponEntries(ctx, 'A:walker').find((e) => e.weaponId === 'red.w.cannon')
    expect(cannon?.legalTargets).toContain('B:brute')
  })

  it('SHOOT-007-pistol-only an engaged non-VEHICLE unit may shoot the VEHICLE it is engaged with using Pistols only, and nothing else', () => {
    const state = stateWith(unattached())
    state.activePlayer = 'B'
    placeUnit(state, 'A:walker', [[0, 0]])
    placeUnit(state, 'B:mob', { x: -2, z: 2.5, gap: 0.3 }) // engaged with A:walker
    placeUnit(state, 'A:grunts', { x: -2, z: 10, gap: 0.3 }) // unengaged, in range of B:mob's Gun-equivalent
    placeUnit(state, 'B:kopta', [[12, -8]])
    const { ctx } = start(state)
    expect(leaderService.unitsInEngagement(state, 'B:mob', 'A:walker')).toBe(true)
    const mob = buildShootingWeaponEntries(ctx, 'B:mob')
    expect(mob.length).toBeGreaterThan(0)
    expect(mob.every((e) => e.weaponId === 'blu.w.slugga')).toBe(true) // Pistol-only, no non-Pistol weapon offered
    expect(mob.every((e) => e.legalTargets.every((t) => t === 'A:walker'))).toBe(true) // only the unit it's engaged with
    expect(mob.some((e) => e.legalTargets.includes('A:walker'))).toBe(true)
    // unengaged kopta may still target the walker although it is in ER of friendly B:mob (enemy VEHICLE exception)
    expect(buildShootingWeaponEntries(ctx, 'B:kopta').find((e) => e.weaponId === 'blu.w.rokkit')?.legalTargets).toContain('A:walker')
  })
})

// ---------- SHOOT-015: attacks already declared still resolve after the target leaves range/sight ----------
describe('shooting: resolution continues after declaration even if the target later leaves range/sight (SHOOT-015)', () => {
  it('SHOOT-015 target teleports away mid-resolution: both already-declared attacks still fully resolve', () => {
    const state = stateWith(unattached())
    const r = mmToInch(32) / 2
    placeExact(state, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 }, 'A:grunts#3': { x: 0, z: 1.5 } })
    placeExact(state, 'B:mob', { 'B:mob#1': { x: 14 + 2 * r, z: 0 } })
    const { ctx, events } = start(state, Array(80).fill(6))
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: 'A:grunts' })
    act(ctx, {
      type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts',
      targets: [
        { modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
        { modelId: 'A:grunts#3', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
      ],
    })
    let moved = false
    let guard = 0
    while (ctx.state.pending && ctx.state.pending.kind !== 'chooseUnitToActivate') {
      if (++guard > 500) throw new Error('loop')
      if (!moved) { for (const id of state.units['B:mob'].models) state.models[id].pos = { x: 900, y: 0, z: 900 }; moved = true }
      const p = ctx.state.pending as PendingDecision & { options: { action: Action }[] }
      const action = p.options[0].action
      clearPending(ctx)
      const rej = shootingModule.handle(ctx, action, p)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      if (shootingModule.advance(ctx) === 'done') break
    }
    expect(moved).toBe(true) // precondition: the target really was moved out of range/sight mid-sequence
    expect(events.filter((e) => e.type === 'HitRolled')).toHaveLength(4) // 2 firing models x A=2 attacks each (beyond Rapid Fire's half range)
    expect(events.filter((e) => e.type === 'WoundRolled')).toHaveLength(4)
  })
})

// ---------- SHOOT-008/009: range and per-model visibility ----------
describe('shooting: range and line-of-sight legality (SHOOT-008, SHOOT-009)', () => {
  it('SHOOT-008 the nearest target model at exactly 24.0" is in range; 24.1" is out of range', () => {
    const state = stateWith(unattached())
    const r = mmToInch(32) / 2
    placeExact(state, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 } }) // A:grunts#2 is a plain Gun-armed grunt (#1 is the cannon swap)
    placeExact(state, 'B:mob', { 'B:mob#0': { x: 24 + 2 * r, z: 0 } })
    const { ctx } = start(state)
    const gunOf = () => buildShootingWeaponEntries(ctx, 'A:grunts').find((e) => e.modelId === 'A:grunts#2' && e.weaponId === 'red.w.gun')
    expect(gunOf()?.legalTargets).toContain('B:mob')
    placeExact(state, 'B:mob', { 'B:mob#0': { x: 24.1 + 2 * r, z: 0 } })
    expect(gunOf()?.legalTargets).not.toContain('B:mob')
  })

  it('SHOOT-009 a target visible to one firing model but not another: the blocked model has no legal target there', () => {
    const b = withBundle(() => {})
    b.terrainLayouts['terrain.sh009'] = {
      id: 'terrain.sh009', board: { w: 4000, h: 4000 },
      pieces: [{
        id: 'box', kind: 'crate', pos: { x: 0, z: 0 }, rot: 0,
        footprint: [{ x: -0.5, z: -2 }, { x: 0.5, z: -2 }, { x: 0.5, z: 2 }, { x: -0.5, z: 2 }],
        height: 4, traits: ['cover', 'scalable'] as never,
      }],
    }
    b.missions['mission.test'] = { ...b.missions['mission.test'], board: { w: 4000, h: 4000 }, terrainLayouts: ['terrain.sh009'] }
    const state = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.sh009' }), b, 'sh-los', ENGINE_VERSION)
    state.phase = 'shooting'
    // sergeant (#0) stands clear of the crate; #2 (a Gun-armed grunt) stands directly behind it from the target
    placeExact(state, 'A:grunts', { 'A:grunts#0': { x: -5, z: 10 }, 'A:grunts#2': { x: -5, z: 0 } })
    placeExact(state, 'B:mob', { 'B:mob#0': { x: 5, z: 0 } })
    const { ctx } = start(state)
    const entries = buildShootingWeaponEntries(ctx, 'A:grunts')
    expect(entries.find((e) => e.modelId === 'A:grunts#0' && e.weaponId === 'red.w.gun')?.legalTargets).toContain('B:mob')
    expect(entries.find((e) => e.modelId === 'A:grunts#2' && e.weaponId === 'red.w.gun')?.legalTargets).not.toContain('B:mob')
  })

  it('SHOOT-041 Indirect Fire waives visibility, but not on a Torrent weapon', () => {
    const run = (abilities: { ability: string }[]) => {
      const b = withBundle((bb) => { (bb.weapons['red.w.gun'] as any).abilities = abilities })
      b.terrainLayouts['terrain.sh041'] = {
        id: 'terrain.sh041', board: { w: 4000, h: 4000 },
        pieces: [{ id: 'box', kind: 'crate', pos: { x: 0, z: 0 }, rot: 0, footprint: [{ x: -0.5, z: -2 }, { x: 0.5, z: -2 }, { x: 0.5, z: 2 }, { x: -0.5, z: 2 }], height: 4, traits: ['cover', 'scalable'] as never }],
      }
      b.missions['mission.test'] = { ...b.missions['mission.test'], board: { w: 4000, h: 4000 }, terrainLayouts: ['terrain.sh041'] }
      const state = createGameState(makeSetup({ ...unattached(), terrainLayoutId: 'terrain.sh041' }), b, 'sh-041', ENGINE_VERSION)
      state.phase = 'shooting'
      placeExact(state, 'A:grunts', { 'A:grunts#2': { x: -5, z: 0 } })
      placeExact(state, 'B:mob', { 'B:mob#0': { x: 5, z: 0 } })
      const { ctx } = start(state)
      return buildShootingWeaponEntries(ctx, 'A:grunts').find((e) => e.modelId === 'A:grunts#2' && e.weaponId === 'red.w.gun')?.legalTargets
    }
    expect(run([])).not.toContain('B:mob')
    expect(run([{ ability: 'INDIRECT_FIRE' }])).toContain('B:mob')
    expect(run([{ ability: 'TORRENT' }, { ability: 'INDIRECT_FIRE' }])).not.toContain('B:mob')
  })
})

// ---------- SHOOT-010/011/012/013: declaration schema and per-model weapon-choice rules ----------
describe('shooting: declaration rules (SHOOT-010, SHOOT-011, SHOOT-012, SHOOT-013)', () => {
  it('SHOOT-010 the same weapon cannot be declared against two targets; two different weapons on one model may split', () => {
    const state = stateWith(unattached(), (b) => {
      b.datasheets['blu.kopta'].composition[0].weapons.default = ['blu.w.slugga', 'blu.w.rokkit', 'blu.w.spinnin-blades']
    })
    state.activePlayer = 'B'
    placeUnit(state, 'B:kopta', [[0, -5]])
    rowPlace(state, 'A:grunts', 0, 0)
    placeUnit(state, 'A:walker', [[0, -12]])
    const { ctx } = start(state, Array(20).fill(2)) // unmodified 2s: hits fail immediately, no further decisions needed
    selectUnit(ctx, 'B:kopta')
    const bad = reject(ctx, {
      type: 'declareTargets', player: 'B', decisionId: DID, unitId: 'B:kopta',
      targets: [
        { modelId: 'B:kopta#0', weaponId: 'blu.w.slugga', targetUnitId: 'A:grunts' },
        { modelId: 'B:kopta#0', weaponId: 'blu.w.slugga', targetUnitId: 'A:walker' },
      ],
    })
    expect(bad?.code).toBe('E_SCHEMA')
    const ok = declareTargets(ctx, 'B:kopta', [
      { modelId: 'B:kopta#0', weaponId: 'blu.w.slugga', targetUnitId: 'A:grunts' },
      { modelId: 'B:kopta#0', weaponId: 'blu.w.rokkit', targetUnitId: 'A:walker' },
    ])
    expect(['pending', 'done']).toContain(ok)
  })

  it('SHOOT-011 only one profile of a shared profile group may be fired per model per activation', () => {
    const state = stateWith(unattached(), (b) => {
      b.weapons['red.w.smite'] = { id: 'red.w.smite', name: 'Smite', type: 'ranged', range: 18, A: 1, skill: 2, S: 6, AP: -1, D: 3, abilities: [], profileGroup: 'smite' }
      b.weapons['red.w.focused-smite'] = { id: 'red.w.focused-smite', name: 'Focused Smite', type: 'ranged', range: 18, A: 1, skill: 2, S: 9, AP: -3, D: 6, abilities: [], profileGroup: 'smite' }
      b.datasheets['red.boss'].composition[0].weapons.default = ['red.w.pistol', 'red.w.relic', 'red.w.smite', 'red.w.focused-smite']
    })
    placeUnit(state, 'A:boss', [[0, -5]])
    rowPlace(state, 'B:mob', 0, 0)
    const { ctx } = start(state, Array(20).fill(2)) // unmodified 2s: hits fail immediately, no further decisions needed
    selectUnit(ctx, 'A:boss')
    const bad = reject(ctx, {
      type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:boss',
      targets: [
        { modelId: 'A:boss#0', weaponId: 'red.w.smite', targetUnitId: 'B:mob' },
        { modelId: 'A:boss#0', weaponId: 'red.w.focused-smite', targetUnitId: 'B:mob' },
      ],
    })
    expect(bad?.code).toBe('E_INVALID_TARGET')
    const ok = declareTargets(ctx, 'A:boss', [{ modelId: 'A:boss#0', weaponId: 'red.w.focused-smite', targetUnitId: 'B:mob' }])
    expect(['pending', 'done']).toContain(ok)
  })

  it('SHOOT-012 a model must fire its Pistols or its other weapons this activation, not both', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    rowPlace(state, 'B:mob', 0, 0)
    const { ctx } = start(state)
    selectUnit(ctx, 'A:grunts')
    const bad = reject(ctx, {
      type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts',
      targets: [
        { modelId: 'A:grunts#0', weaponId: 'red.w.pistol', targetUnitId: 'B:mob' },
        { modelId: 'A:grunts#0', weaponId: 'red.w.gun', targetUnitId: 'B:mob' },
      ],
    })
    expect(bad?.code).toBe('E_INVALID_TARGET')
  })

  it('SHOOT-003-one-unit an engaged Pistol unit must put all its Pistol attacks into ONE of the units it is engaged with', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PISTOL' }] })
    rowPlace(state, 'A:grunts', 0, 0)
    rowPlace(state, 'B:mob', -14, 1.5)
    placeUnit(state, 'B:brute', [[state.models['A:grunts#4'].pos.x, -2]])
    const { ctx } = start(state, Array(40).fill(2))
    expect(leaderService.unitsInEngagement(state, 'A:grunts', 'B:mob')).toBe(true)
    expect(leaderService.unitsInEngagement(state, 'A:grunts', 'B:brute')).toBe(true)
    selectUnit(ctx, 'A:grunts')
    const bad = reject(ctx, {
      type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts',
      targets: [
        { modelId: 'A:grunts#0', weaponId: 'red.w.pistol', targetUnitId: 'B:mob' },
        { modelId: 'A:grunts#4', weaponId: 'red.w.gun', targetUnitId: 'B:brute' },
      ],
    })
    expect(bad?.code).toBe('E_INVALID_TARGET')
    const okRej = reject(ctx, {
      type: 'declareTargets', player: 'A', decisionId: DID, unitId: 'A:grunts',
      targets: [{ modelId: 'A:grunts#4', weaponId: 'red.w.gun', targetUnitId: 'B:brute' }],
    })
    expect(okRej).toBeNull()
  })

  it('SHOOT-013 a VEHICLE model may fire its Pistols and its other weapons together', () => {
    const state = stateWith(unattached(), (b) => {
      b.datasheets['blu.kopta'].composition[0].weapons.default = ['blu.w.slugga', 'blu.w.rokkit', 'blu.w.spinnin-blades']
    })
    state.activePlayer = 'B'
    placeUnit(state, 'B:kopta', [[0, -5]])
    rowPlace(state, 'A:grunts', 0, 0)
    const { ctx } = start(state, Array(20).fill(2)) // unmodified 2s: hits fail immediately, no further decisions needed
    selectUnit(ctx, 'B:kopta')
    const r = declareTargets(ctx, 'B:kopta', [
      { modelId: 'B:kopta#0', weaponId: 'blu.w.slugga', targetUnitId: 'A:grunts' },
      { modelId: 'B:kopta#0', weaponId: 'blu.w.rokkit', targetUnitId: 'A:grunts' },
    ])
    expect(['pending', 'done']).toContain(r)
  })
})

// ---------- SHOOT-037: Lone Operative ----------
describe('shooting: Lone Operative (SHOOT-037)', () => {
  it('caps range at 12" when unattached; at 12" it may be targeted, at 12.1" it may not', () => {
    const r = mmToInch(32) / 2
    const state = stateWith(unattached(), (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'LONE_OPERATIVE' }] })
    placeExact(state, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 } })
    placeExact(state, 'B:mob', { 'B:mob#0': { x: 12 + 2 * r, z: 0 } })
    const { ctx } = start(state)
    const gunOf = () => buildShootingWeaponEntries(ctx, 'A:grunts').find((e) => e.modelId === 'A:grunts#2' && e.weaponId === 'red.w.gun')
    expect(gunOf()?.legalTargets).toContain('B:mob')
    placeExact(state, 'B:mob', { 'B:mob#0': { x: 12.1 + 2 * r, z: 0 } })
    expect(gunOf()?.legalTargets).not.toContain('B:mob')
  })

  it('does not apply once attached to a unit: the weapon\'s normal range is used', () => {
    const state = stateWith(
      { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } },
      (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'LONE_OPERATIVE' }] },
    )
    placeExact(state, 'A:grunts', { 'A:grunts#2': { x: 0, z: 0 } })
    placeExact(state, 'B:mob', { 'B:mob#0': { x: 20, z: 0 } }) // beyond Lone Operative's 12" cap, within the gun's normal 24" range
    placeUnit(state, 'B:warboss', [[20, 0]])
    const { ctx } = start(state)
    const gun = buildShootingWeaponEntries(ctx, 'A:grunts').find((e) => e.modelId === 'A:grunts#2' && e.weaponId === 'red.w.gun')
    expect(gun?.legalTargets).toContain('B:mob')
  })
})

// ---------- SHOOT-046: once per phase ----------
describe('shooting: each unit shoots at most once per phase (SHOOT-046)', () => {
  it('an activated unit is not offered again, even after declaring no targets', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    placeUnit(state, 'A:walker', [[-10, -5]])
    rowPlace(state, 'B:mob', 0, 0)
    const { ctx } = start(state)
    selectUnit(ctx, 'A:grunts')
    declareTargets(ctx, 'A:grunts', [])
    const p = pendingAs(ctx, 'chooseUnitToActivate')
    expect(p.context.eligible).not.toContain('A:grunts')
    expect(p.context.eligible).toContain('A:walker')
  })

  it('SHOOT-046-detach a Leader detached mid-attack (bodyguard wiped by its own Hazardous) is not offered again', () => {
    const state = stateWith({}, (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HAZARDOUS' }] })
    const keep = ['A:grunts#2']
    state.units['A:grunts'].models = keep
    state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => keep.includes(id) || !id.startsWith('A:grunts#')))
    placeUnit(state, 'A:grunts', [[0, -5]])
    placeUnit(state, 'A:boss', [[-2, -5]])
    rowPlace(state, 'B:mob', -4, 13)
    placeUnit(state, 'B:kopta', [[-2, 5]]) // within the boss's own Pistol range, so it would otherwise be eligible
    const { ctx } = start(state, Array(200).fill(1))
    expect(state.units['A:boss'].bodyguardUnitId).toBe('A:grunts')
    selectUnit(ctx, 'A:grunts')
    expect(state.phaseState.activated).toEqual(expect.arrayContaining(['A:grunts', 'A:boss']))
    declareTargets(ctx, 'A:grunts', [{ modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' }])
    let r: 'pending' | 'done' = ctx.state.pending ? 'pending' : shootingModule.advance(ctx)
    for (let guard = 0; r === 'pending' && ctx.state.pending && ctx.state.pending.kind !== 'chooseUnitToActivate'; guard++) {
      if (guard > 2000) throw new Error('loop')
      const p = ctx.state.pending
      clearPending(ctx)
      const isStrat = p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll'
      const a: Action = isStrat ? { type: 'pass', player: p.player, decisionId: DID } : (p as any).options[0].action
      const rej = isStrat ? ctx.services.stratagems.handle(ctx, a, p) : shootingModule.handle(ctx, a, p)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      r = shootingModule.advance(ctx)
    }
    expect(state.units['A:grunts'].models).toHaveLength(0)
    expect(state.units['A:boss'].bodyguardUnitId).toBeFalsy()
    expect(state.units['A:boss'].turn.shotThisPhase).toBe(true)
    if (r === 'pending') expect(pendingAs(ctx, 'chooseUnitToActivate').context.eligible).not.toContain('A:boss')
    else expect(r).toBe('done')
  })

  it('SHOOT-046-shot a unit already flagged shotThisPhase is not offered even if absent from activated', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    placeUnit(state, 'A:walker', [[-10, -5]])
    rowPlace(state, 'B:mob', 0, 0)
    state.units['A:grunts'].turn.shotThisPhase = true
    const { ctx } = start(state)
    shootingModule.advance(ctx)
    expect(pendingAs(ctx, 'chooseUnitToActivate').context.eligible).toEqual(['A:walker'])
  })

  it('with only one eligible unit, the phase ends once it has activated', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    rowPlace(state, 'B:mob', 0, 0)
    const { ctx } = start(state)
    selectUnit(ctx, 'A:grunts')
    const r = declareTargets(ctx, 'A:grunts', [])
    expect(r).toBe('done')
  })
})

// ---------- end-to-end sanity ----------
describe('shooting: end-to-end flow', () => {
  it('a declared attack drives through the shared attack sequence to the end of the phase', () => {
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    rowPlace(state, 'B:mob', 0, 0)
    const { ctx } = start(state, Array(60).fill(2)) // unmodified 2s: BS3+ hits fail immediately, no further decisions needed
    selectUnit(ctx, 'A:grunts')
    declareTargets(ctx, 'A:grunts', [{ modelId: 'A:grunts#2', weaponId: 'red.w.gun', targetUnitId: 'B:mob' }])
    const r = driveToNextSelection(ctx)
    expect(r).toBe('done') // A:grunts was the only eligible A unit on the board
  })

  // regression: `shooting.attacksResolved` opens AFTER services.attack clears phaseState.attack, and the window
  // itself can raise a decision per player (active, then opponent) — the acting unit id must survive both.
  it('the shooting.attacksResolved window can raise a decision for each player without losing the acting unit', () => {
    const strat = recordingStratagems(['shooting.attacksResolved'])
    const modules = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: strat } }
    const state = stateWith(unattached())
    rowPlace(state, 'A:grunts', 0, -5)
    rowPlace(state, 'B:mob', 0, 0)
    const { ctx } = createContext(state, new ScriptedRng(Array(20).fill(2)), modules)
    shootingModule.enter(ctx)

    shootingModule.advance(ctx) // -> chooseUnitToActivate
    let pending = ctx.state.pending as PendingDecision
    clearPending(ctx)
    shootingModule.handle(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:grunts' }, pending)

    shootingModule.advance(ctx) // -> declareTargets
    pending = ctx.state.pending as PendingDecision
    clearPending(ctx)
    shootingModule.handle(ctx, {
      type: 'declareTargets', player: 'A', decisionId: '', unitId: 'A:grunts',
      targets: [{ modelId: 'A:grunts#0', weaponId: 'red.w.pistol', targetUnitId: 'B:mob' }],
    }, pending)

    let r = shootingModule.advance(ctx)
    let guard = 0
    while (r === 'pending') {
      if (++guard > 200) throw new Error('too many decisions')
      pending = ctx.state.pending as PendingDecision
      expect(pending.kind).toBe('stratagemWindow')
      clearPending(ctx)
      const rej = strat.handle(ctx, { type: 'pass', player: pending.player, decisionId: '' }, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      r = shootingModule.advance(ctx)
    }
    expect(r).toBe('done')
    expect(strat.offers.filter((o) => o.window === 'shooting.attacksResolved').map((o) => o.player)).toEqual(['A', 'B'])
  })
})
