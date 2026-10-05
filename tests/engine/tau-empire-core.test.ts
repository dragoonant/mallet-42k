// T'au Empire engine changes beyond code hooks (docs/spec/factions/tau-empire.md 7.1, items C1-C7; checklist TAU-*).
// Real Combat Patrol data (Protectors of Aun'shar vs Gordrang's Gitstompas). The faction's own code hooks live elsewhere; these
// tests register tiny stand-in hooks (`test.*`) on a datasheet ability so each engine seam is exercised on its own.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup, type UnitId,
} from '../../src/engine'
import { attackService, shotThisTurn } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { hookService } from '../../src/engine/hooks-impl'
import { buildShootingWeaponEntries, shootingModule, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { startReactiveMove } from '../../src/engine/phases/movement'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TAU = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Tau', faction: 'tau-empire', patrolId: 'tau.cp.protectors-of-aun-shar', enhancementId: 'tau.e.ds13-experimental-drone',
  secondaryId: 'tau.sec.kauyon-lure', attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ST = 'A:strike-team', AUN = 'A:aunshar', STEALTH = 'A:stealth', BOYZ = 'B:boyz-a'

function makeState(): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TAU(), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'tau-empire-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}
function ctxOf(s: GameState, dice: number[] = []) { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

// a stand-in code hook attached as a datasheet ability of `unitId`'s datasheet
function addTestHook(s: GameState, unitId: UnitId, name: string, hook: Partial<EngineCodeHook>): void {
  codeHooks[name] = { name, kind: 'ability', hook: 'onHitRoll', run: () => undefined, ...hook } as unknown as EngineCodeHook
  const id = `test.a.${name}`
  s.abilities = { ...s.abilities, [id]: { id, name, text: '', trigger: 'always', code: name, source: 'datasheet', bearerModelId: null } as unknown as GameState['abilities'][string] }
  const dsId = s.units[unitId].datasheetId
  s.datasheets = { ...s.datasheets, [dsId]: { ...s.datasheets[dsId], abilities: [...s.datasheets[dsId].abilities, id] } }
}
function rifleModel(s: GameState, unitId: UnitId): { model: string; weapon: string } {
  for (const id of s.units[unitId].models) {
    const w = s.models[id].weapons.find((x) => x === 'tau.w.pulse-rifle')
    if (w) return { model: id, weapon: w }
  }
  throw new Error('no pulse rifle')
}
function layout(s: GameState): void {
  placeUnit(s, ST, s.units[ST].models.map((_, i): [number, number] => [-10 + (i % 5) * 1.3, 0 + Math.floor(i / 5) * 1.3]))
  placeUnit(s, BOYZ, [[0, 0]])
}
const decl = (modelId: string, weaponId: string, targetUnitId: string) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks: null })

describe('C1 skillDeltaVsTarget: characteristic step, not a hit modifier (TAU-004, TAU-005, TAU-007)', () => {
  it('TAU-004 TAU-2.2: delta -1 makes BS 4+ hit on 3+; delta +1 makes it 5+; the clamp is 2..6', () => {
    for (const [delta, die, hit, needed] of [[-1, 3, true, 3], [-1, 2, false, 3], [1, 4, false, 5], [1, 5, true, 5], [-9, 2, true, 2], [9, 5, false, 6]] as const) {
      const s = makeState()
      layout(s)
      const { model, weapon } = rifleModel(s, ST)
      addTestHook(s, ST, 'test.skill', { skillDeltaVsTarget: () => delta })
      const { ctx, events } = ctxOf(s, [die, ...Array(40).fill(1)])
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: ST, overwatch: false, targets: [decl(model, weapon, BOYZ)] })
      attackService.advance(ctx)
      const hr = of(events, 'HitRolled')[0]
      expect(needed).toBeGreaterThan(1)
      expect(hr.hit).toBe(hit)
    }
  })

  it('TAU-005 TAU-2.2: Damaged Ghostkeel (-1) Guided (delta -1) vs Stealth (-1): the modifiers cap at -1 and the delta is outside the cap', () => {
    const s = makeState()
    const GK = 'A:ghostkeel'
    placeUnit(s, GK, [[-10, 0]])
    placeUnit(s, STEALTH, [[0, 0]])
    s.units[STEALTH].player = 'B' // treat the Stealth unit as the enemy for this check
    s.units[GK].models.forEach((id) => { s.models[id].woundsRemaining = 4 }) // Damaged: -1 to hit
    const model = s.units[GK].models[0]
    const weapon = s.models[model].weapons.find((w) => s.weapons[w].kind === 'ranged' && s.weapons[w].skill !== null)!
    const skill = s.weapons[weapon].skill as number
    addTestHook(s, GK, 'test.skill2', { skillDeltaVsTarget: () => -1 })
    expect(hookService.skillDeltaFor(s, model, s.weapons[weapon], STEALTH, { kind: 'ranged', overwatch: false })).toBe(-1)
    const needed = skill - 1
    // unmodified die = BS number: needs the delta (needed = BS-1) AND the -2 of modifiers capped to -1 (final = BS-1)
    const { ctx, events } = ctxOf(s, [skill, ...Array(40).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: GK, overwatch: false, targets: [decl(model, weapon, STEALTH)] })
    attackService.advance(ctx)
    const hr = of(events, 'HitRolled')[0]
    expect(hr.die).toBe(skill)
    expect(hr.final).toBe(needed)
    expect(hr.hit).toBe(true)
  })

  it('TAU-009 TAU-2.6: Overwatch never asks skillDeltaVsTarget', () => {
    const s = makeState()
    layout(s)
    const { model, weapon } = rifleModel(s, ST)
    let asked = 0
    addTestHook(s, ST, 'test.skill3', { skillDeltaVsTarget: () => { asked++; return -1 } })
    const { ctx } = ctxOf(s, [6, ...Array(40).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: ST, overwatch: true, targets: [decl(model, weapon, BOYZ)] })
    attackService.advance(ctx)
    expect(asked).toBe(0)
  })

  it('TAU-007 TAU-2.3: hookService.skillDeltaFor sums every active source', () => {
    const s = makeState()
    layout(s)
    const { model, weapon } = rifleModel(s, ST)
    addTestHook(s, ST, 'test.sk.a', { skillDeltaVsTarget: () => -1 })
    addTestHook(s, ST, 'test.sk.b', { skillDeltaVsTarget: () => 1 })
    addTestHook(s, ST, 'test.sk.c', { skillDeltaVsTarget: () => null })
    addTestHook(s, ST, 'test.sk.d', { skillDeltaVsTarget: () => 1 })
    expect(hookService.skillDeltaFor!(s, model, s.weapons[weapon], BOYZ, { kind: 'ranged', overwatch: false })).toBe(1)
  })
})

describe('C2 Overwatch hit threshold (TAU-030, TAU-031)', () => {
  function overwatchHit(hitOn: number | undefined, die: number): { hit: boolean; critical: boolean } {
    const s = makeState()
    layout(s)
    const { model, weapon } = rifleModel(s, ST)
    const { ctx, events } = ctxOf(s, [die, ...Array(40).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: ST, overwatch: true, targets: [decl(model, weapon, BOYZ)], overwatchHitOn: hitOn })
    attackService.advance(ctx)
    const hr = of(events, 'HitRolled')[0]
    return { hit: hr.hit, critical: hr.critical }
  }
  it('TAU-030 TAU-6.4: overwatchHitOn 4 hits on 4+ (crit only on 6)', () => {
    expect(overwatchHit(4, 4)).toEqual({ hit: true, critical: false })
    expect(overwatchHit(4, 3).hit).toBe(false)
    expect(overwatchHit(4, 6)).toMatchObject({ hit: true, critical: true })
  })
  it('TAU-031 TAU-6.4: default stays 6+', () => {
    expect(overwatchHit(undefined, 5)).toMatchObject({ hit: false })
    expect(overwatchHit(undefined, 6).hit).toBe(true)
  })
  it('TAU-030 TAU-6.4: overwatchHitOnFor takes the lowest answer and defaults to 6', () => {
    const s = makeState()
    layout(s)
    expect(hookService.overwatchHitOnFor!(s, ST, 'core.s.fire-overwatch')).toBe(6)
    addTestHook(s, ST, 'test.ow.a', { overwatchHitOn: (_s, _e, _u, strat) => (strat === 'core.s.fire-overwatch' ? 4 : null) })
    addTestHook(s, ST, 'test.ow.b', { overwatchHitOn: () => 5 })
    expect(hookService.overwatchHitOnFor!(s, ST, 'core.s.fire-overwatch')).toBe(4)
    expect(hookService.overwatchHitOnFor!(s, ST, 'other')).toBe(5)
  })
})

describe('C3 per-turn shot record (TAU-025)', () => {
  it('TAU-025 TAU-5: begin records the canonical shooter; the record resets on a new round/active player', () => {
    const s = makeState()
    layout(s)
    const { model, weapon } = rifleModel(s, ST)
    expect(shotThisTurn(s, ST)).toBe(false)
    const { ctx } = ctxOf(s, Array(40).fill(1))
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: ST, overwatch: true, targets: [decl(model, weapon, BOYZ)] })
    expect(shotThisTurn(s, ST)).toBe(true)
    expect(shotThisTurn(s, STEALTH)).toBe(false)
    s.activePlayer = 'B'
    expect(shotThisTurn(s, ST)).toBe(false)
  })
})

describe('C4 conditional weapon availability (TAU-032, TAU-033)', () => {
  it('TAU-033 TAU-6.5: an unavailable weapon is absent from the shooting entries and dropped by attack.begin; available again → offered (TAU-032)', () => {
    const s = makeState()
    layout(s)
    const { model, weapon } = rifleModel(s, ST)
    const before = buildShootingWeaponEntries(ctxOf(s).ctx, ST).filter((e) => e.weaponId === weapon).length
    expect(before).toBeGreaterThan(0)
    let available = false
    addTestHook(s, ST, 'test.avail', { weaponAvailable: (_s, _e, _m, w) => (w === weapon ? available : null) })
    expect(buildShootingWeaponEntries(ctxOf(s).ctx, ST).some((e) => e.weaponId === weapon)).toBe(false)
    const { ctx } = ctxOf(s, Array(40).fill(1))
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: ST, overwatch: false, targets: [decl(model, weapon, BOYZ)] })
    expect(s.phaseState.attack!.targets).toHaveLength(0)
    s.phaseState.attack = null
    available = true
    expect(buildShootingWeaponEntries(ctxOf(s).ctx, ST).filter((e) => e.weaponId === weapon)).toHaveLength(before)
  })
})

describe('C5 unitEligibleToShoot ignoreAdvance (TAU-010)', () => {
  it('TAU-010 TAU-2.5: an Advanced unit is ineligible unless ignoreAdvance is set; Fall Back still blocks', () => {
    const s = makeState()
    layout(s)
    s.units[ST].turn.moveType = 'advance'
    const ctx = ctxOf(s).ctx
    expect(unitEligibleToShoot(ctx, ST)).toBe(false)
    expect(unitEligibleToShoot(ctx, ST, { ignoreAdvance: true })).toBe(true)
    s.units[ST].turn.moveType = 'fallBack'
    expect(unitEligibleToShoot(ctx, ST, { ignoreAdvance: true })).toBe(false)
  })
})

describe('C6 reactive Normal move outside the Movement phase (TAU-020)', () => {
  it('TAU-020 TAU-5: startReactiveMove at phase.end is answered through the shooting module and never writes moveType', () => {
    const s = makeState()
    layout(s)
    s.units[ST].turn.moveType = null
    const { ctx, events } = ctxOf(s)
    startReactiveMove(ctx, ST, 5, 'tau.s.rapid-repositioning', 'phase.end')
    const pending = s.pending as PendingDecision & { kind: 'moveUnit' }
    expect(pending.kind).toBe('moveUnit')
    expect(pending.window).toBe('phase.end')
    expect(pending.player).toBe('A')
    const legal = shootingModule.legalActions!(s, pending)!
    expect(legal.some((a) => a.type === 'pass')).toBe(true)
    const mv = legal.find((a) => a.type === 'moveUnit') as Extract<Action, { type: 'moveUnit' }>
    expect(mv).toBeDefined()
    expect(shootingModule.validate!(s, mv, pending)).toBeNull()
    const far = { ...mv, placements: mv.placements.map((p) => ({ ...p, pos: { ...p.pos, x: p.pos.x + 9 } })) }
    expect(shootingModule.validate!(s, far, pending)).not.toBeNull()
    s.pending = null
    expect(shootingModule.handle(ctx, mv, pending)).toBeUndefined()
    expect(of(events, 'UnitMoved')[0]).toMatchObject({ unitId: ST, moveType: 'normal' })
    expect(s.units[ST].turn.moveType).toBeNull()
    expect(s.phaseState.marks.some((m) => m.startsWith('mv:reactive='))).toBe(false)
  })
})

describe('C7 enhancement with several descriptors (TAU-012, TAU-014)', () => {
  it('TAU-012 TAU-3: DS13 becomes two enhancement abilities on the warlord, each with its own scope', () => {
    const s = makeState()
    const abs = Object.values(s.abilities).filter((a) => a.source === 'enhancement' && a.id.startsWith('tau.'))
    expect(abs.map((a) => a.id).sort()).toEqual(['tau.e.ds13-experimental-drone.aura', 'tau.e.ds13-experimental-drone.effect'])
    expect(abs.every((a) => a.bearerModelId === s.units[AUN].models[0])).toBe(true)
    expect(abs.find((a) => a.id.endsWith('.effect'))!.scope).toEqual({ who: 'bearer' })
    expect(abs.find((a) => a.id.endsWith('.aura'))!.scope).toMatchObject({ who: 'friendly', within: 6 })
    expect(s.units[AUN].enhancementId).toBe('tau.e.ds13-experimental-drone')
  })
})
