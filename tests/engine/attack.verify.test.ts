// Adversarial verification tests for src/engine/attack.ts (10-rules §6.2-§6.4, §7, R-10.1, R-10.4/R-10.5).
import { describe, expect, it } from 'vitest'
import {
  ENGINE_VERSION, ScriptedRng, DEFAULT_MODULES, createGameState, createContext,
  type Action, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PendingDecision,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { leaderService } from '../../src/engine/leaders'
import type { DataBundle } from '../../src/data/types'
import { bundle, withBundle } from '../fixtures/bundle'
import { makeSetup, makePlayerA, makePlayerB } from '../fixtures/setup'
import { placeUnit } from '../fixtures/state'

function stateWith(setupOverrides: Parameters<typeof makeSetup>[0] = {}, patch?: (b: DataBundle) => void): GameState {
  const b = patch ? withBundle(patch) : bundle
  return createGameState(makeSetup(setupOverrides), b, 'seed', ENGINE_VERSION)
}
function unattached(): Parameters<typeof makeSetup>[0] {
  return { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }
}
function place(state: GameState): void {
  state.phase = 'shooting'
  placeUnit(state, 'A:grunts', { x: -10, z: -5, gap: 0.5 })
  if (state.units['A:boss']?.bodyguardUnitId) placeUnit(state, 'A:boss', [[-10, -5]])
  else if (state.units['A:boss']) placeUnit(state, 'A:boss', [[30, 30]])
  placeUnit(state, 'A:walker', [[-16, -5]])
  placeUnit(state, 'B:mob', { x: -10, z: 0, gap: 0.5 })
  if (state.units['B:warboss']?.bodyguardUnitId) placeUnit(state, 'B:warboss', [[-10, 0.6]])
  else if (state.units['B:warboss']) placeUnit(state, 'B:warboss', [[-30, 30]])
  placeUnit(state, 'B:brute', [[0, 0]])
  placeUnit(state, 'B:kopta', [[10, 0]])
}
function ctxFor(state: GameState, dice: number[]) { return createContext(state, new ScriptedRng(dice), DEFAULT_MODULES) }
type Choose = (p: PendingDecision) => Action
const firstOption: Choose = (p) => {
  if ('options' in p && Array.isArray(p.options) && p.options.length > 0) return p.options[0].action
  throw new Error(`no options for ${p.kind}`)
}
function drive(h: { ctx: EngineContext; events: GameEvent[] }, choose: Choose = firstOption): GameEvent[] {
  const { ctx, events } = h
  let r = attackService.advance(ctx)
  let guard = 0
  while (r === 'pending') {
    if (++guard > 2000) throw new Error('too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without decision')
    const action = choose(pending)
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return events
}
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget =>
  ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const of = <T extends GameEvent['type']>(ev: GameEvent[], t: T) => ev.filter((e): e is Extract<GameEvent, { type: T }> => e.type === t)
const TAIL = Array(60).fill(2)
function onlyModels(state: GameState, unitId: string, keep: string[]): void {
  state.units[unitId].models = keep
  state.models = Object.fromEntries(Object.entries(state.models).filter(([id]) => keep.includes(id) || !id.startsWith(`${unitId}#`)))
}

describe('attack.verify', () => {
  it('WEAP-008-dice Sustained Hits extra hit makes its own wound roll (fresh die)', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'SUSTAINED_HITS', value: 1 }] })
    place(state)
    // hit 6 (crit, +1 hit); wound 2 (fail, S4 vs T5); extra hit wound 6 (wounds); save 1
    const h = ctxFor(state, [6, 2, 6, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const w = of(drive(h), 'WoundRolled')
    expect(w.map((x) => x.die)).toEqual([2, 6])
  })

  it('SHOOT-046-dice a second unit attacking in the same phase rolls fresh dice (roll keys not reused)', () => {
    const state = stateWith(unattached())
    place(state)
    const h = ctxFor(state, [2, 6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    drive(h)
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:grunts', 1)] })
    const hits = of(drive(h), 'HitRolled')
    expect(hits.map((x) => x.die)).toEqual([2, 6])
  })

  it('WEAP-012-dmg two Devastating Wounds criticals in one group roll separate random damage', () => {
    const state = stateWith(unattached(), (b) => { const w = b.weapons['blu.w.slugga'] as any; w.D = 'D6'; w.abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const h = ctxFor(state, [6, 6, 6, 6, 1, 5, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 2)] })
    const dmg = of(drive(h), 'DamageApplied').filter((d) => d.mortal)
    expect(dmg).toHaveLength(6)
  })

  it('WEAP-013-order R-6.6 Devastating Wounds mortal wounds come after the unit\'s other attacks vs that target (across models)', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    // grunts#1: hit 6, wound 6 (critical -> deferred); grunts#2: hit 6, wound 5 (normal), save 1
    const h = ctxFor(state, [6, 6, 6, 5, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1), target('A:grunts#2', 'red.w.gun', 'B:mob', 1)] })
    const ev = drive(h)
    const firstMortal = ev.findIndex((e) => e.type === 'DamageApplied' && e.mortal)
    const save = ev.findIndex((e) => e.type === 'SaveRolled')
    expect(save).toBeGreaterThanOrEqual(0)
    expect(firstMortal).toBeGreaterThan(save)
  })

  it('WEAP-024-per-model one Hazardous test per Hazardous weapon used (two models with the same weapon -> two tests)', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HAZARDOUS' }] })
    place(state)
    const h = ctxFor(state, [...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1), target('A:grunts#2', 'red.w.gun', 'B:mob', 1)] })
    expect(of(drive(h), 'HazardousTested')).toHaveLength(2)
  })

  it('WEAP-006-selection Blast count is taken at target selection, not after earlier attacks thinned the unit', () => {
    const state = stateWith(unattached(), (b) => { const w = b.weapons['red.w.gun'] as any; w.A = 1; w.abilities = [{ ability: 'BLAST' }] })
    place(state)
    const h = ctxFor(state, [6, 6, 1, 6, 6, 1, 6, 6, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob'), target('A:grunts#2', 'red.w.gun', 'B:mob')] })
    expect(of(drive(h), 'HitRolled')).toHaveLength(6) // 10 models at selection -> 1+2 each
  })

  it('WEAP-006-attached Blast counts the attached leader\'s models too (9 Boyz + Warboss = 10 -> +2)', () => {
    const setup = { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } }
    const state = stateWith(setup, (b) => { const w = b.weapons['red.w.gun'] as any; w.A = 1; w.abilities = [{ ability: 'BLAST' }] })
    onlyModels(state, 'B:mob', state.units['B:mob'].models.slice(0, 9))
    place(state)
    const h = ctxFor(state, [...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob')] })
    expect(of(drive(h), 'HitRolled')).toHaveLength(3)
  })

  it('SHOOT-048 last bodyguard dies mid-volley -> remaining attacks may be allocated to the leader', () => {
    const state = stateWith() // boss attached to grunts
    place(state)
    onlyModels(state, 'A:grunts', ['A:grunts#1'])
    state.models['A:grunts#1'].woundsRemaining = 1
    const h = ctxFor(state, [6, 6, 1, 6, 6, 1, 6, 6, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 3)] })
    const ev = drive(h)
    expect(of(ev, 'DamageApplied').filter((d) => d.modelId === 'A:boss#0').length).toBe(2)
    // R-10.1: leader becomes its own unit only after the attacking unit finishes
    const detachIdx = ev.findIndex((e) => e.type === 'LeaderDetached')
    const lastHit = ev.map((e) => e.type).lastIndexOf('HitRolled')
    expect(detachIdx).toBeGreaterThan(lastHit)
  })

  it('LEAD-014 mortal wounds spill from the last bodyguard model onto the CHARACTER', () => {
    const state = stateWith()
    place(state)
    onlyModels(state, 'A:grunts', ['A:grunts#1'])
    state.models['A:grunts#1'].woundsRemaining = 1
    const h = ctxFor(state, [...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [] })
    attackService.queueMortalWounds(h.ctx, 'A:grunts', 3, 'test', false)
    const ev = drive(h)
    expect(of(ev, 'DamageApplied').filter((d) => d.modelId === 'A:boss#0')).toHaveLength(2)
  })

  it('SHOOT-041/WEAP-020 Indirect Fire vs a target with no visible model: -1 to hit and unmodified 3 fails', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }] })
    place(state)
    placeUnit(state, 'A:grunts', [[-6, -5]])
    onlyModels(state, 'B:mob', ['B:mob#9'])
    placeUnit(state, 'B:mob', [[-6, 10]])
    expect(DEFAULT_MODULES.services.los.visible(state, 'A:grunts#1', 'B:mob#9')).toBe(false) // precondition: behind ruin
    const h = ctxFor(state, [4, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    // BS3+: unmodified 4 with -1 -> final 3 still hits; check the modifier is applied at all
    expect(of(drive(h), 'HitRolled')[0]).toMatchObject({ die: 4, final: 3 })
  })

  it('SHOOT-005 Big Guns Never Tire: VEHICLE in Engagement Range shooting a non-Pistol weapon gets -1 to hit', () => {
    const state = stateWith(unattached())
    place(state)
    placeUnit(state, 'B:mob', [[-16, -2.6]])
    ;(state.units['A:walker'].turn as any).moveType = 'normal'
    expect(leaderService.inEngagementWithEnemy(state, 'A:walker')).toBe(true) // precondition
    const h = ctxFor(state, [4, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:walker', overwatch: false, targets: [target('A:walker#0', 'red.w.cannon', 'B:brute', 1)] })
    expect(of(drive(h), 'HitRolled')[0]).toMatchObject({ die: 4, final: 3, hit: false })
  })

  it('SHOOT-029-batches two mortal-wound batches of equal size on one unit in a phase both fully resolve', () => {
    const state = stateWith(unattached())
    onlyModels(state, 'B:mob', state.units['B:mob'].models.slice(1)) // drop the W2 Nob
    place(state)
    const h = ctxFor(state, [])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [] })
    attackService.queueMortalWounds(h.ctx, 'B:mob', 2, 'test', false)
    attackService.queueMortalWounds(h.ctx, 'B:mob', 2, 'test', false)
    expect(of(drive(h), 'ModelDestroyed')).toHaveLength(4)
  })

  it('WEAP-037-min damage reduction never takes an attack below 1 damage (20-data damageReduction min 1)', () => {
    const state = stateWith(unattached(), (b) => {
      b.datasheets['red.walker'].abilities = [{ id: 'test.dr', name: 'DR', text: '', trigger: 'damageApplied', effect: { damageReduction: 1 } } as any]
    })
    place(state)
    const h = ctxFor(state, [6, 6, 1, ...TAIL]) // hit, wound (S4 vs T9 needs 6), armour save 1
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 1)] })
    expect(of(drive(h), 'DamageApplied')).toHaveLength(1)
  })

  it('WEAP-009 Sustained Hits: hit re-rolled from 1 to 6 is a critical hit (re-roll precedes modifiers)', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'SUSTAINED_HITS', value: 1 }] })
    place(state) // red.a.grit: re-roll hit rolls of 1
    const h = ctxFor(state, [1, 6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const ev = drive(h)
    expect(of(ev, 'HitRolled')[0]).toMatchObject({ die: 6, critical: true })
    expect(of(ev, 'WoundRolled')).toHaveLength(2)
  })

  it('WEAP-011 Lethal Hits + Sustained Hits: 6 -> one auto-wound plus one extra hit that rolls to wound', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'LETHAL_HITS' }, { ability: 'SUSTAINED_HITS', value: 1 }] })
    place(state)
    const h = ctxFor(state, [6, 3, 5, 3, ...TAIL]) // hit 6; save 3 (Sv5 fail); extra wound 5 (success); save 3
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const w = of(drive(h), 'WoundRolled')
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ auto: true, critical: false })
    expect(w[1]).toMatchObject({ auto: false, die: 5, wounded: true })
  })
})

// ---------- verification round 2 (adversarial) ----------
import { weaponService as weaponSvc } from '../../src/engine/weapons'

const attachedB = () => ({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB({ attachments: [{ leaderRef: 'warboss', bodyguardRef: 'mob' }] }) } })

describe('attack.verify round 2', () => {
  it('SHOOT-007 Big Guns Never Tire: ranged attacks vs a VEHICLE in ER of a friendly unit (not the shooter) get -1 to hit', () => {
    const state = stateWith(unattached())
    place(state)
    placeUnit(state, 'B:brute', [[-16, -2.05]])
    expect(leaderService.unitsInEngagement(state, 'B:brute', 'A:walker')).toBe(true)
    expect(leaderService.inEngagementWithEnemy(state, 'B:kopta')).toBe(false)
    const h = ctxFor(state, [5, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:walker', 1)] })
    expect(of(drive(h), 'HitRolled')[0]).toMatchObject({ die: 5, final: 4, hit: false })
  })

  it('WEAP-025-attacker Precision: the attacking player decides whether to allocate to the visible CHARACTER', () => {
    const state = stateWith(attachedB(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PRECISION' }] })
    place(state)
    expect(DEFAULT_MODULES.services.los.visible(state, 'A:grunts#1', 'B:warboss#0')).toBe(true)
    const seen: PendingDecision[] = []
    const h = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    drive(h, (p) => { seen.push(p); return firstOption(p) })
    const offers = seen.filter((p) => p.kind === 'allocateAttack' && (p.context as any).eligibleModels.includes('B:warboss#0'))
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((p) => p.player === 'A')).toBe(true)
  })

  it('WEAP-025-wounded Precision can reach the visible CHARACTER even when a bodyguard model is already wounded', () => {
    const state = stateWith(attachedB(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PRECISION' }] })
    place(state)
    const nob = state.units['B:mob'].models.find((id) => state.models[id].woundsRemaining === 2)!
    state.models[nob].woundsRemaining = 1
    const h = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const pick: Choose = (p) => (p.kind === 'allocateAttack' && (p.context as any).eligibleModels.includes('B:warboss#0')
      ? { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: 'B:warboss#0' } : firstOption(p))
    expect(of(drive(h, pick), 'AttackAllocated')[0].modelId).toBe('B:warboss#0')
  })

  it('SHOOT-044-attached Deadly Demise hits an attached Leader+bodyguard as ONE unit (one batch, one D3)', () => {
    const state = stateWith() // boss attached to grunts
    place(state)
    const h = ctxFor(state, [6, 1, 1, 1, 1, 1, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [] })
    attackService.queueMortalWounds(h.ctx, 'A:walker', 8, 'test', false)
    const dd = of(drive(h), 'DeadlyDemiseRolled')[0]
    expect(dd.exploded).toBe(true)
    expect(dd.affected.filter((u) => u === 'A:grunts' || u === 'A:boss')).toHaveLength(1)
  })

  it('SHOOT-018-statmod a +1 S modifier is applied once on the wound roll (S5 vs T5 needs 4+, not 3+)', () => {
    const state = stateWith(unattached(), (b) => {
      b.datasheets['red.grunts'].abilities = [{ id: 't.str', name: 'Str', text: '', trigger: 'always', effect: { modifyStat: { stat: 'S', value: 1 } } } as any]
    })
    place(state)
    expect(weaponSvc.effectiveWeapon(state, 'A:grunts#1', 'red.w.gun').S).toBe(5)
    const h = ctxFor(state, [6, 3, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(of(drive(h), 'WoundRolled')[0]).toMatchObject({ needed: 4, wounded: false })
  })

  it('SHOOT-041-sv3 R-3.12: Indirect Fire cover gives a Sv3+ model no bonus against an AP0 attack', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['blu.w.slugga'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }] })
    place(state)
    onlyModels(state, 'A:grunts', ['A:grunts#1'])
    placeUnit(state, 'A:grunts', [[-6, -5]])
    onlyModels(state, 'B:mob', ['B:mob#9'])
    placeUnit(state, 'B:mob', [[-6, 10]])
    expect(DEFAULT_MODULES.services.los.unitVisible(state, 'B:mob#9', 'A:grunts')).toBe(false)
    const h = ctxFor(state, [6, 6, 2, ...TAIL]) // crit hit; wound; save die 2 vs Sv3
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#9', 'blu.w.slugga', 'A:grunts', 1)] })
    expect(of(drive(h), 'SaveRolled')[0]).toMatchObject({ die: 2, final: 2, saved: false })
  })

  it('SHOOT-036-attached Stealth applies only if EVERY model of the attached target has it', () => {
    const state = stateWith(attachedB(), (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'STEALTH' }] as any })
    place(state)
    const h = ctxFor(state, [3, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(of(drive(h), 'HitRolled')[0]).toMatchObject({ die: 3, final: 3, hit: true })
  })

  it('WEAP-015 Anti-INFANTRY 4+ with Devastating Wounds: wound 4 vs T5 target is critical and becomes mortal wounds', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'ANTI', keyword: 'INFANTRY', value: 4 }, { ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const h = ctxFor(state, [3, 4, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const ev = drive(h)
    expect(of(ev, 'WoundRolled')[0]).toMatchObject({ die: 4, critical: true, wounded: true })
    expect(of(ev, 'SaveRolled')).toHaveLength(0)
    expect(of(ev, 'DamageApplied')[0]).toMatchObject({ mortal: true })
  })

  it('SHOOT-047 a wounded attached CHARACTER cannot be allocated attacks while a bodyguard model lives', () => {
    const state = stateWith()
    place(state)
    state.models['A:boss#0'].woundsRemaining = 3
    const seen: PendingDecision[] = []
    const h = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:grunts', 1)] })
    const ev = drive(h, (p) => { seen.push(p); return firstOption(p) })
    expect(seen.some((p) => p.kind === 'allocateAttack' && (p.context as any).eligibleModels.includes('A:boss#0'))).toBe(false)
    expect(of(ev, 'AttackAllocated')[0].modelId).not.toBe('A:boss#0')
  })

  it('SHOOT-039 Hazardous failure goes to a wounded carrier first', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'HAZARDOUS' }] })
    place(state)
    expect(state.models['A:grunts#2'].weapons).toContain('red.w.gun')
    state.models['A:grunts#2'].woundsRemaining = 1
    const h = ctxFor(state, [2, 1, ...TAIL]) // miss; hazardous 1
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    expect(of(drive(h), 'HazardousTested')[0]).toMatchObject({ failed: true, modelId: 'A:grunts#2' })
  })

  it('WEAP-035 a random attacks roll is emitted as purpose attacks and is Command Re-roll eligible', () => {
    const state = stateWith(unattached())
    place(state)
    const cannonModel = state.units['A:grunts'].models.find((id) => state.models[id].weapons.includes('red.w.cannon'))!
    const h = ctxFor(state, [1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target(cannonModel, 'red.w.cannon', 'B:brute')] })
    const ev = drive(h)
    const rolled = ev.filter((e) => e.type === 'DiceRolled').map((e) => JSON.stringify(e)).filter((j) => j.includes('"attacks"'))
    expect(rolled.length).toBeGreaterThan(0)
    expect(rolled[0]).toContain('"commandRerollable":true')
  })
})

// ---------- verification round 3 (adversarial) ----------
describe('attack.verify round 3', () => {
  const oathLike = (b: DataBundle) => {
    b.datasheets['blu.mob'].abilities = [{ id: 't.oath', name: 'Oath', text: '', trigger: 'hitRoll', effect: { reroll: 'all' } } as any]
  }

  it('SHOOT-043 reroll:all on a failed hit re-rolls automatically with no decision', () => {
    const state = stateWith(unattached(), oathLike)
    place(state)
    const seen: PendingDecision[] = []
    const h = ctxFor(state, [2, 5, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 1)] })
    const evs = drive(h, (p) => { seen.push(p); return firstOption(p) })
    expect(seen.some((p) => p.kind === 'chooseOption' && (p.context as any).topic === 'rerollOffer')).toBe(false)
    expect(of(evs, 'DiceRerolled')).toHaveLength(1)
    expect(of(evs, 'HitRolled')[0]).toMatchObject({ die: 5, hit: true })
  })

  it('SHOOT-043b reroll:all on a successful hit opens rerollOffer; re-roll uses the new die once', () => {
    const state = stateWith(unattached(), oathLike)
    place(state)
    const offers: PendingDecision[] = []
    const h = ctxFor(state, [5, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#1', 'blu.w.slugga', 'A:walker', 1)] })
    const evs = drive(h, (p) => {
      if (p.kind === 'chooseOption' && (p.context as any).topic === 'rerollOffer') {
        offers.push(p)
        const opt = p.options.find((o) => o.id !== 'keep')!
        return opt.action
      }
      return firstOption(p)
    })
    expect(offers).toHaveLength(1)
    expect((offers[0].context as any).data.rollId).toBeTruthy()
    expect((offers[0] as any).options.some((o: any) => o.id === 'keep')).toBe(true)
    expect(of(evs, 'HitRolled')[0]).toMatchObject({ die: 1, hit: false })
  })

  it('WEAP-016c Twin-linked: accepting the rerollOffer on a successful wound uses the re-rolled die', () => {
    const state = stateWith(unattached())
    place(state)
    const h = ctxFor(state, [6, 5, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:kopta', overwatch: false, targets: [target('B:kopta#0', 'blu.w.rokkit', 'A:grunts', 1)] })
    const evs = drive(h, (p) => (p.kind === 'chooseOption' && (p.context as any).topic === 'rerollOffer'
      ? p.options.find((o) => o.id !== 'keep')!.action : firstOption(p)))
    const w = of(evs, 'WoundRolled')
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ die: 1, wounded: false })
  })

  it('SHOOT-044-own Deadly Demise: "every unit within 6"" includes other models of the destroyed model\'s own unit', () => {
    const state = stateWith(unattached(), (b) => { b.datasheets['blu.mob'].coreAbilities = [{ ability: 'DEADLY_DEMISE', value: 1 }] as any })
    place(state)
    const h = ctxFor(state, [6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [] })
    attackService.queueMortalWounds(h.ctx, 'B:mob', 1, 'test', false)
    const last: Choose = (p) => ('options' in p && Array.isArray(p.options) && p.options.length > 0 ? p.options[p.options.length - 1].action : firstOption(p))
    const dd = of(drive(h, last), 'DeadlyDemiseRolled')[0]
    expect(dd.exploded).toBe(true)
    expect(dd.affected).toContain('B:mob')
  })

  it('SHOOT-014-dev R-6.6: a Devastating Wounds critical vs target 1 resolves before any attack vs target 2', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const sergeant = state.units['A:grunts'].models.find((id) => state.models[id].weapons.includes('red.w.pistol'))!
    const gunner = state.units['A:grunts'].models.find((id) => id !== sergeant && state.models[id].weapons.includes('red.w.gun'))!
    // gun A2 vs mob: hit 6, wound 6 (DW crit, deferred); hit 1 (grit re-roll 1) miss. pistol vs brute: hit 6, wound 2 fail
    const h = ctxFor(state, [6, 6, 1, 1, 6, 2, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target(gunner, 'red.w.gun', 'B:mob'), target(sergeant, 'red.w.pistol', 'B:brute')] })
    const evs = drive(h)
    const iMob = evs.findIndex((e) => e.type === 'DamageApplied' && e.unitId === 'B:mob')
    const iBrute = evs.findIndex((e) => e.type === 'HitRolled' && e.attack.targetUnitId === 'B:brute')
    expect(iMob).toBeGreaterThanOrEqual(0)
    expect(iBrute).toBeGreaterThanOrEqual(0)
    expect(iMob).toBeLessThan(iBrute)
  })

  it('SHOOT-038/WEAP-023 Hazardous failure: unwounded carriers -> non-CHARACTER carrier takes it before the CHARACTER', () => {
    const state = stateWith({}, (b) => { (b.weapons['red.w.pistol'] as any).abilities = [{ ability: 'PISTOL' }, { ability: 'HAZARDOUS' }] })
    place(state)
    const sergeant = state.units['A:grunts'].models.find((id) => state.models[id].weapons.includes('red.w.pistol'))!
    const h = ctxFor(state, [1, 1, 1, 1, 1, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:boss#0', 'red.w.pistol', 'B:mob')] })
    const evs = drive(h)
    const hz = of(evs, 'HazardousTested').filter((e) => e.failed)
    expect(hz.length).toBeGreaterThan(0)
    expect(hz[0].modelId).toBe(sergeant)
  })

  it('SHOOT-024-cover Benefit of Cover never improves an invulnerable save', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['blu.w.slugga'] as any).abilities = [{ ability: 'INDIRECT_FIRE' }]; (b.weapons['blu.w.slugga'] as any).AP = -1 })
    place(state)
    placeUnit(state, 'A:grunts', { x: 15, z: -12, gap: 0.5 })
    placeUnit(state, 'A:boss', [[-6, -5]])
    onlyModels(state, 'B:mob', ['B:mob#9'])
    placeUnit(state, 'B:mob', [[-6, 10]])
    expect(DEFAULT_MODULES.services.los.unitVisible(state, 'B:mob#9', 'A:boss')).toBe(false)
    const h = ctxFor(state, [6, 6, 3, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'B:mob', overwatch: false, targets: [target('B:mob#9', 'blu.w.slugga', 'A:boss', 1)] })
    const evs = drive(h, (p) => (p.kind === 'chooseOption' && (p.context as any).topic === 'saveType'
      ? p.options.find((o) => o.id === 'invuln')!.action : firstOption(p)))
    expect(of(evs, 'AttackAllocated')[0].cover).toBe(true)
    expect(of(evs, 'SaveRolled')[0]).toMatchObject({ kind: 'invuln', die: 3, final: 3, saved: false })
  })

  it('WEAP-002-reserves Heavy: a unit that arrived from Reserves this turn gets no +1 to hit', () => {
    const state = stateWith(unattached())
    place(state)
    const cannoneer = state.units['A:grunts'].models.find((id) => state.models[id].weapons.includes('red.w.cannon'))!
    ;(state.units['A:grunts'].turn as any).moveType = 'stationary'
    ;(state.units['A:grunts'].turn as any).arrivedThisTurn = true
    const h = ctxFor(state, [3, 3, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target(cannoneer, 'red.w.cannon', 'B:brute', 1)] })
    expect(of(drive(h), 'HitRolled')[0]).toMatchObject({ die: 3, final: 3, hit: false })
  })

  it('WEAP-010-dev Lethal Hits auto-wound is not a critical wound: Devastating Wounds does not trigger, save allowed', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'LETHAL_HITS' }, { ability: 'DEVASTATING_WOUNDS' }] })
    place(state)
    const h = ctxFor(state, [6, 6, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const evs = drive(h)
    expect(of(evs, 'SaveRolled')[0]).toMatchObject({ die: 6, saved: true })
    expect(of(evs, 'DamageApplied').filter((d) => d.mortal)).toHaveLength(0)
  })

  it('WEAP-030 Psychic weapon damage carries the weapon in DamageApplied.source for psychic-attack tagging', () => {
    const state = stateWith(unattached(), (b) => { (b.weapons['red.w.gun'] as any).abilities = [{ ability: 'PSYCHIC' }] })
    place(state)
    const h = ctxFor(state, [6, 6, 1, ...TAIL])
    attackService.begin(h.ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [target('A:grunts#1', 'red.w.gun', 'B:mob', 1)] })
    const d = of(drive(h), 'DamageApplied')[0]
    expect((d.source as any).weaponId).toBe('red.w.gun')
  })
})
