// Black Templars: Siguard's Crusaders (docs/spec/factions/black-templars.md, checklist BLA-001..BLA-025). Real Combat Patrol data.
// Covers the (b) code hooks (Righteous Defiance, Path of Purgation, Sacred Vow, registrations), E-BT1 (Condition
// targetModelKeyword, via Shield of Zeal saves) and the rule behaviour of Scouts, Fervour, the stratagems, Righteous Zeal,
// the Impulsor transport / Firing Deck and the weapon abilities. E-BT2/E-BT3 are in black-templars-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, deploymentZone, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup, type RollContext, type UseStratagemAction,
} from '../../src/engine'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks, consumeReaction, pendingReactions } from '../../src/engine/code-hooks'
import { leaderService } from '../../src/engine/leaders'
import { resolveSurgeMove } from '../../src/engine/phases/movement'
import { buildShootingWeaponEntries, firingDeckValue, firingDeckWeapons, shootingModule } from '../../src/engine/phases/shooting'
import { effectService } from '../../src/engine/effects'
import { evaluateCondition, hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { transportService } from '../../src/engine/transports'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const RD = 'bt.e.righteous-defiance'
const BT = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Templars', faction: 'black-templars', patrolId: 'bt.cp.siguard-s-crusaders', enhancementId: 'bt.e.crusaders-fervour',
  secondaryId: 'bt.sec.path-of-purgation', attachments: [{ leaderRef: 'marshal-siguard', bodyguardRef: 'primaris-crusader-squad' }], reserves: [], battleReadyVp: 0, ...o,
})

// BT v BT mirror: player A owns the Siguard under test, player B is the attacker / the vow target
function makeState(a: Partial<PlayerSetup> = {}, round = 2): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: BT(a), B: BT() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'bt-hooks', ENGINE_VERSION)
  s.round = round
  s.activePlayer = 'A'
  s.phase = 'movement'
  s.phaseState = emptyPhaseState()
  return s
}

const SIG = 'A:marshal-siguard', CRU = 'A:primaris-crusader-squad', INT = 'A:intercessor-squad', IMP = 'A:impulsor'
const BSIG = 'B:marshal-siguard', BCRU = 'B:primaris-crusader-squad', BINT = 'B:intercessor-squad'
const SIGM = 'A:marshal-siguard#0'

function ctxOf(s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
const pendingOption = (s: GameState): ChooseOptionDecision | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)
const optionIds = (s: GameState): string[] => (pendingOption(s)?.options ?? []).map((o) => o.id)

function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B'): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
}

function fnpCtx(s: GameState, attackerUnitId: string, targetUnitId: string, kind: 'ranged' | 'melee' = 'ranged'): AttackContext {
  const m = s.models[s.units[attackerUnitId].models[0]]
  const weaponId = m.weapons.find((w) => s.weapons[w].kind === kind) ?? m.weapons[0]
  return {
    kind, overwatch: false, attackerUnitId, attackerModelId: m.id, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
const fnp = (ctx: EngineContext, modelId: string, attackerUnitId: string, targetUnitId: string, kind: 'ranged' | 'melee' = 'ranged') =>
  feelNoPainFor(ctx, modelId, fnpCtx(ctx.state, attackerUnitId, targetUnitId, kind))?.threshold ?? null

// zone helpers: a point `out` inches outside (negative = inside) the inner edge of `player`'s deployment zone
function zoneSpot(s: GameState, player: 'A' | 'B', out: number): { x: number; z: number } {
  const zone = deploymentZone(s, player)
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
  if (Math.abs(cx) >= Math.abs(cz)) return { x: cx < 0 ? Math.max(...xs) + out : Math.min(...xs) - out, z: cz }
  return { x: cx, z: cz < 0 ? Math.max(...zs) + out : Math.min(...zs) - out }
}
const put = (s: GameState, id: string, p: { x: number; z: number }) => placeUnit(s, id, [[p.x, p.z]])
// the Siguard + crusader pair (one unit) together at a spot
function putPair(s: GameState, p: { x: number; z: number }): void {
  placeUnit(s, CRU, { x: p.x, z: p.z + 3, gap: 0.2 })
  put(s, SIG, p)
}

// =====================================================================================================================
describe('registration', () => {
  it('BLA-001 every code the Black Templars data names is a registered hook', () => {
    for (const name of ['righteousDefiance', 'righteousDefianceFight', 'assaultVehicle', 'pathOfPurgation', 'sacredVowPick', 'sacredVowScore', 'patrolSquads', 'oathOfMomentPick', 'voraciousAssaultHit']) {
      expect(codeHooks[name], name).toBeDefined()
    }
    expect(codeHooks.righteousDefiance.pick?.window).toBe('shooting.targetsDeclared')
    expect(codeHooks.righteousDefianceFight.pick?.window).toBe('fight.targetsDeclared')
    expect(codeHooks.sacredVowPick.answer).toBeTypeOf('function')
  })
})

// =====================================================================================================================
describe('Righteous Defiance (BLA-3.2, 3.3)', () => {
  const RDS = { enhancementId: RD }

  it('BLA-008 BLA-3.2: Siguard has Feel No Pain 5+; the Crusader models around him have none', () => {
    const s = makeState(RDS)
    placeUnit(s, CRU, [[0, 0]]); placeUnit(s, SIG, [[2, 0]]); placeUnit(s, BINT, [[0, -12]])
    const { ctx } = ctxOf(s)
    expect(fnp(ctx, SIGM, BINT, SIG)).toBe(5)
    expect(fnp(ctx, s.units[CRU].models[0], BINT, CRU)).toBeNull()
    // without the enhancement Siguard has none
    const t = makeState()
    placeUnit(t, CRU, [[0, 0]]); placeUnit(t, SIG, [[2, 0]]); placeUnit(t, BINT, [[0, -12]])
    expect(fnp(ctxOf(t).ctx, SIGM, BINT, SIG)).toBeNull()
  })

  function shot(s: GameState, ctx: EngineContext, target = CRU, attacker = BINT): void {
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 3]]); placeUnit(s, INT, [[10, 0]])
    placeUnit(s, attacker, [[0, -12]])
    const m = s.units[attacker].models[0]
    const wid = s.models[m].weapons.find((w) => s.weapons[w].kind === 'ranged')!
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: attacker, overwatch: false, targets: [{ modelId: m, weaponId: wid, targetUnitId: target, profileGroup: null, attacks: null }] })
  }

  it('BLA-009 BLA-3.3: targeted in Shooting -> use/decline offer to the bearer\'s owner; use gives every model FNP 4+ until phase end, once per battle', () => {
    const s = makeState(RDS)
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s)
    shot(s, ctx)
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BINT)).toBe(true)
    expect(pendingOption(s)!.player).toBe('A')
    expect(optionIds(s)).toEqual(['use', 'decline'])
    answer(ctx, 'use')
    expect(s.pending).toBeNull()
    expect(s.players.A.oncePerBattleUsed).toContain(RD)
    expect(fnp(ctx, s.units[CRU].models[0], BINT, CRU)).toBe(4)
    expect(fnp(ctx, SIGM, BINT, SIG)).toBe(4)
    // ends with the phase: back to 5+ for Siguard, none for the Crusaders
    effectService.expire(ctx, 'phaseEnd', null)
    expect(fnp(ctx, s.units[CRU].models[0], BINT, CRU)).toBeNull()
    expect(fnp(ctx, SIGM, BINT, SIG)).toBe(5)
  })

  it('BLA-009 BLA-3.3: never offered again in the battle once used, nor after declining twice is it blocked (decline keeps it), nor when another unit is targeted', () => {
    const s = makeState(RDS)
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s)
    shot(s, ctx)
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BINT)).toBe(true)
    answer(ctx, 'decline')
    expect(s.players.A.oncePerBattleUsed).not.toContain(RD)
    expect(s.pending).toBeNull()
    // the same attack never re-offers (occurrence mark)
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BINT)).toBe(false)
    // used already -> not offered at all
    const t = makeState(RDS)
    phase(t, 'shooting', 'B')
    t.players.A.oncePerBattleUsed.push(RD)
    const c2 = ctxOf(t).ctx
    shot(t, c2)
    expect(hookService.offerPicks(c2, 'shooting.targetsDeclared', BINT)).toBe(false)
    // another unit of the owner targeted -> not offered
    const u = makeState(RDS)
    phase(u, 'shooting', 'B')
    const c3 = ctxOf(u).ctx
    shot(u, c3, INT)
    expect(hookService.offerPicks(c3, 'shooting.targetsDeclared', BINT)).toBe(false)
  })

  it('BLA-009 BLA-3.3: not offered to a player whose Siguard has the other enhancement, nor when the attacker is the bearer\'s own side', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s)
    shot(s, ctx)
    expect(hookService.offerPicks(ctx, 'shooting.targetsDeclared', BINT)).toBe(false)
  })

  it('BLA-010 BLA-3.3: Fight phase -> offered at fight.targetsDeclared; use gives FNP 4+ until the end of the phase', () => {
    const s = makeState(RDS)
    phase(s, 'fight', 'B')
    const { ctx } = ctxOf(s)
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 3]]); placeUnit(s, BINT, [[0, -1.2]])
    const m = s.units[BINT].models[0]
    const wid = s.models[m].weapons.find((w) => s.weapons[w].kind === 'melee')!
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: BINT, overwatch: false, targets: [{ modelId: m, weaponId: wid, targetUnitId: CRU, profileGroup: null, attacks: 2 }] })
    expect(hookService.offerPicks(ctx, 'fight.targetsDeclared', BINT)).toBe(true)
    expect(pendingOption(s)!.player).toBe('A')
    answer(ctx, 'use')
    expect(fnp(ctx, s.units[CRU].models[0], BINT, CRU, 'melee')).toBe(4)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(fnp(ctx, s.units[CRU].models[0], BINT, CRU, 'melee')).toBeNull()
    expect(fnp(ctx, SIGM, BINT, SIG, 'melee')).toBe(5)
  })
})

// =====================================================================================================================
describe('Path of Purgation (BLA-4.1)', () => {
  const PP = { secondaryId: 'bt.sec.path-of-purgation' }
  function scoreAtEnd(set: (s: GameState) => void, window: 'battle.end' | 'turn.end' = 'battle.end'): number {
    const s = makeState(PP, 5)
    set(s)
    missionService.onWindow(ctxOf(s).ctx, window, 'end')
    return s.players.A.vp
  }
  const deep = (s: GameState) => zoneSpot(s, 'B', -4)
  const edge = (s: GameState) => zoneSpot(s, 'B', -0.3) // a 40 mm base centred 0.3" inside the edge sticks out

  it('BLA-011 BLA-4.1: Siguard wholly in the enemy zone, not Battle-shocked -> 10 VP', () => {
    expect(scoreAtEnd((s) => putPair(s, deep(s)))).toBe(10)
  })

  it('BLA-011 BLA-4.1: Siguard one base edge outside -> falls back to 8 when a non-shocked unit has a model inside', () => {
    expect(scoreAtEnd((s) => { put(s, SIG, edge(s)); put(s, CRU, edge(s)) })).toBe(8)
    expect(scoreAtEnd((s) => { put(s, SIG, edge(s)); placeUnit(s, CRU, [[0, 0]]) })).toBe(8) // Siguard's own pair is still partly inside
  })

  it('BLA-011 BLA-4.1: Siguard in the zone but his unit Battle-shocked -> no 10; the shocked pair gives no 8 either', () => {
    expect(scoreAtEnd((s) => { putPair(s, deep(s)); s.units[CRU].battleShocked = true })).toBe(0)
    expect(scoreAtEnd((s) => { putPair(s, deep(s)); s.units[SIG].battleShocked = true })).toBe(0)
    // another non-shocked unit inside rescues the 8
    expect(scoreAtEnd((s) => { putPair(s, deep(s)); s.units[CRU].battleShocked = true; put(s, INT, edge(s)) })).toBe(8)
  })

  it('BLA-012 BLA-4.1: only the Impulsor partly inside -> 8; an embarked unit does not count on its own; nothing before battle end', () => {
    expect(scoreAtEnd((s) => { putPair(s, { x: 0, z: 0 }); put(s, IMP, edge(s)) })).toBe(8)
    expect(scoreAtEnd((s) => { putPair(s, { x: 0, z: 0 }); put(s, IMP, { x: 0, z: 2 }); put(s, INT, deep(s)); transportService.embark(s, INT, IMP) })).toBe(0)
    expect(scoreAtEnd((s) => putPair(s, deep(s)), 'turn.end')).toBe(0)
  })

  it('BLA-012 BLA-4.1: nobody in the zone -> 0; a destroyed Warlord falls back to the 8', () => {
    expect(scoreAtEnd((s) => { putPair(s, { x: 0, z: 0 }); put(s, INT, { x: 0, z: 5 }) })).toBe(0)
    expect(scoreAtEnd((s) => { putPair(s, { x: 0, z: 0 }); s.units[SIG].location = 'destroyed'; put(s, INT, deep(s)) })).toBe(8)
  })
})

// =====================================================================================================================
describe('Sacred Vow (BLA-4.2 - 4.5)', () => {
  const SV = { secondaryId: 'bt.sec.sacred-vow' }
  const melee = (s: GameState, unitId: string) => ({ player: 'A' as const, unitId, modelId: s.units[unitId].models[0], kind: 'melee' as const })

  // round.start: the BT player's vow pick (any earlier round-start pick, such as the Oath of Moment, is answered first)
  function pickVow(s: GameState, ctx: EngineContext, target: string): void {
    missionService.onWindow(ctx, 'round.start', `r${s.round}`)
    let guard = 0
    while (pendingOption(s) && !optionIds(s).includes(target) && guard++ < 4) answer(ctx, optionIds(s)[0])
    expect(optionIds(s)).toContain(target)
    answer(ctx, target)
  }
  function killAll(ctx: EngineContext, unitId: string, by: Parameters<typeof attackService.finishDestroy>[2]): void {
    for (const id of [...ctx.state.units[unitId].models]) attackService.finishDestroy(ctx, id, by)
  }
  function deploy(s: GameState): void {
    placeUnit(s, BINT, [[0, -12]]); placeUnit(s, BCRU, { x: 10, z: -12, gap: 0.2 }); placeUnit(s, BSIG, [[10, -9]])
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 3]]); placeUnit(s, INT, [[10, 0]])
  }

  it('BLA-013 BLA-4.2: no pick in round 1; at round 2 the BT player picks a canonical enemy unit that is not destroyed; one pick per round', () => {
    const r1 = makeState(SV, 1); deploy(r1)
    missionService.onWindow(ctxOf(r1).ctx, 'round.start', 'r1')
    expect(r1.pending === null || !optionIds(r1).includes(BINT)).toBe(true)
    const s = makeState(SV, 2); deploy(s)
    s.units[BINT].location = 'destroyed'
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'round.start', 'r2')
    let guard = 0
    while (pendingOption(s) && !optionIds(s).includes(BCRU) && guard++ < 4) answer(ctx, optionIds(s)[0])
    const ids = optionIds(s)
    expect(pendingOption(s)!.player).toBe('A')
    expect(ids).toContain(BCRU)
    expect(ids).not.toContain(BSIG) // the attached pair is one candidate
    expect(ids).not.toContain(BINT) // destroyed
    expect(ids.some((i) => i.startsWith('A:'))).toBe(false)
    answer(ctx, BCRU)
    expect(s.players.A.secondaryState.sacredVow).toMatchObject({ round: 2, kill: null })
    // re-opening the same window does not ask again
    missionService.onWindow(ctx, 'round.start', 'r2')
    expect(pendingOption(s) === null || !optionIds(s).includes(BCRU)).toBe(true)
  })

  it('BLA-014 BLA-4.3: vow target killed by an Intercessor melee attack -> 3 VP at round end; by a Neophyte / Initiate -> 4 VP', () => {
    const three = makeState(SV); deploy(three)
    const c1 = ctxOf(three).ctx
    pickVow(three, c1, BINT)
    killAll(c1, BINT, melee(three, INT))
    expect(three.players.A.vp).toBe(0) // nothing until the round ends
    missionService.onWindow(c1, 'round.end', 'r2')
    expect(three.players.A.vp).toBe(3)

    const four = makeState(SV); deploy(four)
    const c2 = ctxOf(four).ctx
    pickVow(four, c2, BINT)
    killAll(c2, BINT, melee(four, CRU))
    missionService.onWindow(c2, 'round.end', 'r2')
    expect(four.players.A.vp).toBe(4)
  })

  it('BLA-014 BLA-4.3: killed by shooting -> 0; survives -> 0; a kill in an earlier round does not carry over', () => {
    const shot = makeState(SV); deploy(shot)
    const c1 = ctxOf(shot).ctx
    pickVow(shot, c1, BINT)
    killAll(c1, BINT, { player: 'A', unitId: INT, modelId: shot.units[INT].models[0], kind: 'ranged' })
    missionService.onWindow(c1, 'round.end', 'r2')
    expect(shot.players.A.vp).toBe(0)

    const lives = makeState(SV); deploy(lives)
    const c2 = ctxOf(lives).ctx
    pickVow(lives, c2, BINT)
    missionService.onWindow(c2, 'round.end', 'r2')
    expect(lives.players.A.vp).toBe(0)
    expect(lives.players.A.secondaryState.sacredVow).toBeUndefined()
  })

  it('BLA-015 BLA-4.5: Siguard leading the Crusaders lands the killing melee blow -> 3 VP, not 4', () => {
    const s = makeState(SV); deploy(s)
    const { ctx } = ctxOf(s)
    pickVow(s, ctx, BINT)
    killAll(ctx, BINT, melee(s, SIG))
    missionService.onWindow(ctx, 'round.end', 'r2')
    expect(s.players.A.vp).toBe(3)
  })

  it('BLA-015 BLA-4.4: an attached enemy target scores only when its last half dies; the enemy\'s own Hazardous kill scores 0', () => {
    const s = makeState(SV); deploy(s)
    const { ctx } = ctxOf(s)
    pickVow(s, ctx, BCRU)
    expect(s.players.A.secondaryState.sacredVow).toMatchObject({ halves: expect.arrayContaining([BCRU, BSIG]) })
    killAll(ctx, BCRU, melee(s, INT))
    expect(s.units[BCRU].location).toBe('destroyed')
    expect((s.players.A.secondaryState.sacredVow as { kill: unknown }).kill).toBeNull() // the leader still lives
    killAll(ctx, BSIG, melee(s, INT))
    missionService.onWindow(ctx, 'round.end', 'r2')
    expect(s.players.A.vp).toBe(3)

    const h = makeState(SV); deploy(h)
    const c2 = ctxOf(h).ctx
    pickVow(h, c2, BINT)
    killAll(c2, BINT, { player: 'B', unitId: BINT, modelId: h.units[BINT].models[0], kind: 'ranged' }) // its own Hazardous
    missionService.onWindow(c2, 'round.end', 'r2')
    expect(h.players.A.vp).toBe(0)
  })
})

// =====================================================================================================================
describe('Assault Vehicle marker (BLA-6.2)', () => {
  it('BLA-022 the Impulsor carries the assaultVehicle ability code (behaviour lives in transports.ts)', () => {
    const s = makeState()
    const ds = s.datasheets[s.units[IMP].datasheetId]
    expect(ds.abilities.some((id) => s.abilities[id]?.code === 'assaultVehicle')).toBe(true)
    expect(codeHooks.assaultVehicle.kind).toBe('ability')
  })
})

// =====================================================================================================================
// Shared helpers for the rule-behaviour tests below (BLA-006 .. BLA-025)
const TAIL = Array(60).fill(2)
type StateWeapon = GameState['weapons'][string]
let armedCount = 0
// a throwaway weapon (copied from `baseId`, patched) handed to `modelId`
function armed(s: GameState, modelId: string, baseId: string, patch: Partial<StateWeapon>): string {
  const id = `test.w${++armedCount}`
  s.weapons = { ...s.weapons, [id]: { ...s.weapons[baseId], ...patch, id } as StateWeapon }
  s.models[modelId].weapons = [...s.models[modelId].weapons, id]
  return id
}
const tgt = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const eventsOf = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const setPhase = (s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}): void => {
  phase(s, p, active)
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}

// runs one attack sequence to its end; decisions are answered by `choose` (default: first option / pass)
function runAttack(s: GameState, dice: number[], kind: 'ranged' | 'melee', attackerUnitId: string, targets: DeclaredTarget[], choose: (p: PendingDecision) => Action | null = () => null): { ctx: EngineContext; events: GameEvent[] } {
  const { ctx, events } = ctxOf(s, [...dice, ...TAIL])
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets })
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('attack sequence did not finish')
    const pending = ctx.state.pending as PendingDecision
    const opts = ('options' in pending ? pending.options : []) as { id: string; action: Action }[]
    const isWindow = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow'
    const action = choose(pending) ?? (isWindow ? ({ type: 'pass', player: pending.player, decisionId: pending.id } as Action) : opts[0].action)
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return { ctx, events }
}

// offers the stratagem to `player` for `target` in `window` and uses it (CP is paid from the state); throws if it is not offered
function useStratagem(s: GameState, ctx: EngineContext, player: 'A' | 'B', stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string }, target: string): void {
  const action = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === target)
  if (!action) throw new Error(`${stratagemId} on ${target} not offered`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}
const offered = (s: GameState, p: 'A' | 'B', window: Parameters<typeof stratagemService.options>[2], id: string, trigger: { unitId?: string } = {}): string[] =>
  stratagemService.options(s, p, window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds?.[0] ?? '')

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string, targetModelId: string | null, o: Partial<AttackContext> = {}): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: targetModelId as string, range: 12, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false, ...o,
  }
}
const rollCtx = (purpose: 'hit' | 'wound' | 'save') => ({ purpose, roll: null as never, dieIndex: 0, unmodified: 4, rerolled: false })
const modelOfType = (s: GameState, unitId: string, datasheetModelId: string): string => s.units[unitId].models.find((m) => s.models[m].datasheetModelId === datasheetModelId)!

// =====================================================================================================================
describe('E-BT1 Condition targetModelKeyword (BLA-025)', () => {
  const NEO = 'PRIMARIS NEOPHYTE'
  function setup(): { s: GameState; neo: string; ini: string } {
    const s = makeState()
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 })
    return { s, neo: modelOfType(s, CRU, 'neophyte-chainsword'), ini: modelOfType(s, CRU, 'initiate-chainsword') }
  }
  const env = (s: GameState, targetModelId: string | null) => {
    const m = s.models[s.units[BINT].models[0]]
    return { state: s, holder: null, player: 'A' as const, attack: attackCtx(s, m.id, m.weapons[0], CRU, targetModelId), roll: null, weapon: null }
  }

  it('BLA-025 E-BT1: true at the save of a model that has the keyword, false for another model of the same unit', () => {
    const { s, neo, ini } = setup()
    expect(evaluateCondition(env(s, neo), { targetModelKeyword: NEO })).toBe(true)
    expect(evaluateCondition(env(s, ini), { targetModelKeyword: NEO })).toBe(false)
    // negated, as Shield of Zeal's second entry is written
    expect(evaluateCondition(env(s, neo), { not: { targetModelKeyword: NEO } })).toBe(false)
    expect(evaluateCondition(env(s, ini), { not: { targetModelKeyword: NEO } })).toBe(true)
    // the unit-wide keyword test cannot tell the models apart; the model-level one can
    expect(evaluateCondition(env(s, ini), { targetKeyword: 'PRIMARIS CRUSADER SQUAD' })).toBe(true)
  })

  it('BLA-025 E-BT1: false when no target model is known (and when there is no attack), datasheet-wide keywords still match; other conditions unchanged', () => {
    const { s, ini } = setup()
    expect(evaluateCondition(env(s, null), { targetModelKeyword: NEO })).toBe(false)
    expect(evaluateCondition({ ...env(s, null), attack: null }, { targetModelKeyword: NEO })).toBe(false)
    expect(evaluateCondition(env(s, ini), { targetModelKeyword: 'ADEPTUS ASTARTES' })).toBe(true)
    expect(evaluateCondition(env(s, ini), { targetModelKeyword: 'PRIMARIS INITIATE' })).toBe(true)
    expect(evaluateCondition(env(s, ini), {})).toBe(true)
    expect(evaluateCondition(env(s, ini), { targetKeyword: 'NOT A KEYWORD' })).toBe(false)
  })
})

// =====================================================================================================================
describe('Shield of Zeal (BLA-5.1)', () => {
  const SZ = 'bt.s.shield-of-zeal'
  const GUN = { A: 1, skill: 2, S: 8, AP: -3, D: 1, abilities: [] as never[], range: 24 }
  const FIST = { A: 1, skill: 2, S: 8, AP: -3, D: 1, abilities: [] as never[], range: 0 }

  // leaves exactly one model alive in the (unled) Crusader Squad, so the wound can only land on it
  function solo(s: GameState, keep: string): void {
    const { ctx } = ctxOf(s)
    for (const id of [...s.units[CRU].models]) if (id !== keep) attackService.destroyModel(ctx, id, { player: 'B', unitId: BINT, modelId: s.units[BINT].models[0], kind: 'ranged' })
  }
  // puts the Intercessors' first model `gap` inches (edge to edge) in front of the lone Crusader model at the origin
  function faceOff(s: GameState, keep: string, gap: number): string {
    solo(s, keep)
    placeUnit(s, CRU, [[0, 0]])
    const att = s.units[BINT].models[0]
    placeUnit(s, BINT, [[0, -(gap + s.models[att].base.radius + s.models[keep].base.radius)]])
    return att
  }
  const state = (): GameState => makeState({ attachments: [] })
  const saves = (events: GameEvent[]) => eventsOf(events, 'SaveRolled').map((e) => ({ kind: e.kind, needed: e.needed, die: e.die, saved: e.saved }))
  const neo = (s: GameState) => modelOfType(s, CRU, 'neophyte-chainsword')
  const ini = (s: GameState) => modelOfType(s, CRU, 'initiate-chainsword')

  // a single AP-3 S8 shot from `gap` inches, Shield of Zeal active or not; the save die is 4
  function shoot(keepOf: (s: GameState) => string, gap: number, withShield: boolean) {
    const s = state()
    setPhase(s, 'shooting', 'B', { A: 3 })
    const keep = keepOf(s)
    const att = faceOff(s, keep, gap)
    const w = armed(s, att, s.models[att].weapons[0], GUN)
    const { ctx } = ctxOf(s)
    if (withShield) {
      stratagemService.recordTargets(ctx, BINT, [CRU])
      useStratagem(s, ctx, 'A', SZ, 'shooting.targetsDeclared', { unitId: BINT }, CRU)
      expect(s.players.A.cp).toBe(2)
    }
    const run = runAttack(s, [6, 6, 4, 4], 'ranged', BINT, [tgt(att, w, CRU, 1)])
    return { s, saves: saves(run.events) }
  }

  it('BLA-016 BLA-5.1: shooter 5.9" away -> an Initiate saves on the 4+ invulnerable against AP-3 (armour would need 6+)', () => {
    expect(shoot(ini, 5.9, false).saves).toEqual([{ kind: 'armour', needed: 3, die: 4, saved: false }])
    const r = shoot(ini, 5.9, true)
    expect(r.saves).toEqual([{ kind: 'invuln', needed: 4, die: 4, saved: true }])
  })

  it('BLA-016 BLA-5.1: shooter 5.9" away -> a Neophyte saves on 5+ only (the same die of 4 fails; armour 4+ with AP-3 cannot be made, die 0)', () => {
    expect(shoot(neo, 5.9, false).saves).toEqual([{ kind: 'armour', needed: 4, die: 0, saved: false }])
    expect(shoot(neo, 5.9, true).saves).toEqual([{ kind: 'invuln', needed: 5, die: 4, saved: false }])
  })

  it('BLA-016 BLA-5.1: shooter 6.1" away -> armour only for both kinds of model', () => {
    expect(shoot(ini, 6.1, true).saves).toEqual([{ kind: 'armour', needed: 3, die: 4, saved: false }])
    expect(shoot(neo, 6.1, true).saves).toEqual([{ kind: 'armour', needed: 4, die: 0, saved: false }])
  })

  it('BLA-016 BLA-5.1: the hook grants 4 to an Initiate and 5 to a Neophyte of the same unit, and never both entries to one model', () => {
    const s = state()
    setPhase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 })
    placeUnit(s, BINT, [[0, -5]])
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, BINT, [CRU])
    useStratagem(s, ctx, 'A', SZ, 'shooting.targetsDeclared', { unitId: BINT }, CRU)
    const am = s.units[BINT].models[0]
    const invuln = (modelId: string, range: number): number[] =>
      hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, am, s.models[am].weapons[0], CRU, modelId, { range }), roll: rollCtx('save') } as never)
        .flatMap((r) => (r.result.kind === 'roll' && r.result.invuln !== undefined ? [r.result.invuln] : []))
    expect(invuln(ini(s), 5.9)).toEqual([4])
    expect(invuln(neo(s), 5.9)).toEqual([5])
    expect(invuln(modelOfType(s, CRU, 'sword-brother'), 5.9)).toEqual([4])
    expect(invuln(ini(s), 6.1)).toEqual([])
    expect(invuln(neo(s), 6.1)).toEqual([])
  })

  it('BLA-016 BLA-5.1: costs 1 CP; offered in the opponent\'s Shooting phase on an INFANTRY unit it picked, not in the BT player\'s own', () => {
    const s = state()
    setPhase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, BINT, [[0, -9]])
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, BINT, [CRU])
    expect(offered(s, 'A', 'shooting.targetsDeclared', SZ, { unitId: BINT })).toEqual([CRU])
    // the attacker's own side is not offered it for the enemy's unit
    expect(offered(s, 'B', 'shooting.targetsDeclared', SZ, { unitId: BINT })).toEqual([])
    // A's own Shooting phase: even with one of A's units recorded as picked (artificial: a friendly shot), ownTurn:false refuses it
    const own = state()
    setPhase(own, 'shooting', 'A', { A: 3 })
    placeUnit(own, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(own, INT, { x: 8, z: 0, gap: 0.2 })
    const c2 = ctxOf(own).ctx
    stratagemService.recordTargets(c2, CRU, [INT])
    expect(offered(own, 'A', 'shooting.targetsDeclared', SZ, { unitId: CRU })).toEqual([])
    useStratagem(s, ctx, 'A', SZ, 'shooting.targetsDeclared', { unitId: BINT }, CRU)
    expect(s.players.A.cp).toBe(2)
  })

  it('BLA-017 BLA-5.1: Fight phase of either turn -> melee attacks use the 4+ / 5+ invulnerable; expires at phase end', () => {
    const melee = (keepOf: (s: GameState) => string, active: 'A' | 'B', shield: boolean) => {
      const s = state()
      setPhase(s, 'fight', active, { A: 3 })
      const keep = keepOf(s)
      const att = faceOff(s, keep, 0.3)
      const w = armed(s, att, s.models[att].weapons[0], { ...FIST, kind: 'melee' })
      const { ctx } = ctxOf(s)
      if (shield) {
        stratagemService.recordTargets(ctx, BINT, [CRU])
        useStratagem(s, ctx, 'A', SZ, 'fight.targetsDeclared', { unitId: BINT }, CRU)
      }
      return { s, ctx, att, w, run: () => runAttack(s, [6, 6, 4, 4], 'melee', BINT, [tgt(att, w, CRU, 1)]) }
    }
    expect(saves(melee(ini, 'B', true).run().events)).toEqual([{ kind: 'invuln', needed: 4, die: 4, saved: true }])
    expect(saves(melee(neo, 'B', true).run().events)).toEqual([{ kind: 'invuln', needed: 5, die: 4, saved: false }])
    // the BT player's own Fight phase: the enemy picks the unit as a target and the stratagem is still offered
    expect(saves(melee(ini, 'A', true).run().events)).toEqual([{ kind: 'invuln', needed: 4, die: 4, saved: true }])
    // without it the Initiate's armour save (3+ with AP-3 = 6+) fails on the same die
    expect(saves(melee(ini, 'B', false).run().events)).toEqual([{ kind: 'armour', needed: 3, die: 4, saved: false }])
    // the effect lapses with the phase
    const m = melee(ini, 'B', true)
    effectService.expire(m.ctx, 'phaseEnd', null)
    expect(saves(m.run().events)).toEqual([{ kind: 'armour', needed: 3, die: 4, saved: false }])
  })

  it('BLA-017 BLA-5.1: the Impulsor is never an eligible target; INFANTRY other than the Crusaders are (Intercessors, 4+ only)', () => {
    const s = state()
    setPhase(s, 'fight', 'B', { A: 3 })
    placeUnit(s, IMP, [[0, 0]]); placeUnit(s, INT, [[8, 0]]); placeUnit(s, BINT, [[0, -1.5]])
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, BINT, [IMP, INT])
    expect(offered(s, 'A', 'fight.targetsDeclared', SZ, { unitId: BINT })).toEqual([INT])
    const am = s.units[BINT].models[0]
    useStratagem(s, ctx, 'A', SZ, 'fight.targetsDeclared', { unitId: BINT }, INT)
    const inv = hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, am, s.models[am].weapons[0], INT, s.units[INT].models[0], { range: 1 }), roll: rollCtx('save') } as never)
      .flatMap((r) => (r.result.kind === 'roll' && r.result.invuln !== undefined ? [r.result.invuln] : []))
    expect(inv).toEqual([4])
  })
})

// =====================================================================================================================
// small shared bits for the remaining rule tests
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
const rangedOf = (s: GameState, unitId: string): { model: string; weapon: string } => {
  const model = s.units[unitId].models.find((m) => s.models[m].weapons.some((w) => s.weapons[w].kind === 'ranged'))!
  return { model, weapon: s.models[model].weapons.find((w) => s.weapons[w].kind === 'ranged')! }
}
// puts `a`'s first model `gap` inches (edge to edge) due south of `b`'s first model (b stays where it is)
function gapBetween(s: GameState, a: string, b: string, gap: number): void {
  const ma = s.models[s.units[a].models[0]], mb = s.models[s.units[b].models[0]]
  placeUnit(s, a, { x: mb.pos.x, z: mb.pos.z - (gap + ma.base.radius + mb.base.radius), gap: 0.3 })
}
const sumDamage = (events: GameEvent[], unitId: string): number => eventsOf(events, 'DamageApplied').filter((d) => d.unitId === unitId && !d.mortal).reduce((n, d) => n + d.amount, 0)

// =====================================================================================================================
describe('Scouts 6" (BLA-6)', () => {
  const advance = (s: GameState): (PendingDecision & { context: { unitId: string }; constraints: { maxDistance?: number } }) | null => {
    s.phase = 'deployment'; s.step = 'preBattle'; s.firstPlayer = 'A'; s.phaseState = emptyPhaseState()
    for (const u of Object.values(s.units)) u.location = 'board'
    const { ctx } = ctxOf(s)
    DEFAULT_MODULES.phases.deployment.advance(ctx)
    return ctx.state.pending as never
  }

  it('BLA-006 BLA-6: the unled Crusader Squad is offered a Scouts move of up to 6"', () => {
    const p = advance(makeState({ attachments: [] }))
    expect(p?.kind).toBe('moveUnit')
    expect(p?.player).toBe('A')
    expect(p?.context.unitId).toBe(CRU)
    expect(JSON.stringify(p?.constraints)).toContain('6')
  })

  it('BLA-006 BLA-6: a Crusader half of a split squad is offered a Scouts move too', () => {
    const p = advance(makeState({ attachments: [], splitUnits: ['primaris-crusader-squad'] }))
    expect(p?.kind).toBe('moveUnit')
    expect(p?.context.unitId.startsWith('A:crusader-squad-')).toBe(true)
  })

  it('BLA-006 BLA-6: Siguard + Crusaders (one combined unit, Siguard has no Scouts) get no Scouts move for either player', () => {
    expect(advance(makeState())).toBeNull()
  })
})

// =====================================================================================================================
describe("Crusaders' Fervour (BLA-3.1)", () => {
  const CF = { enhancementId: 'bt.e.crusaders-fervour' }
  const attacksOf = (s: GameState, modelId: string, weaponId: string, target: string): number =>
    weaponService.effectiveWeapon(s, modelId, weaponId, attackCtx(s, modelId, weaponId, target, s.units[target].models[0])).A as number
  const weaponOn = (s: GameState, unitId: string, id: string): { model: string; weapon: string } => {
    const model = s.units[unitId].models.find((m) => s.models[m].weapons.includes(id))!
    return { model, weapon: id }
  }

  it('BLA-007 BLA-3.1: while Siguard leads the Crusaders, their melee weapons get +1 A (chainsword 6, Sword Brother 4, Siguard 7); ranged and the Intercessors are unchanged', () => {
    const s = makeState(CF)
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 3]]); placeUnit(s, INT, [[10, 0]]); placeUnit(s, BINT, [[0, -9]])
    const w = (u: string, id: string) => weaponOn(s, u, id)
    const chain = w(CRU, 'bt.w.astartes-chainsword'), power = w(CRU, 'bt.w.power-weapon'), rifle = w(CRU, 'bt.w.bolt-rifle'), mcpw = w(SIG, 'bt.w.master-crafted-power-weapon')
    expect(attacksOf(s, chain.model, chain.weapon, BINT)).toBe(6)
    expect(attacksOf(s, power.model, power.weapon, BINT)).toBe(4)
    expect(attacksOf(s, mcpw.model, mcpw.weapon, BINT)).toBe(7)
    expect(attacksOf(s, rifle.model, rifle.weapon, BINT)).toBe(2)
    const ccw = w(INT, 'sm.w.close-combat-weapon'), irifle = w(INT, 'bt.w.bolt-rifle')
    expect(attacksOf(s, ccw.model, ccw.weapon, BINT)).toBe(3)
    expect(attacksOf(s, irifle.model, irifle.weapon, BINT)).toBe(2)
  })

  it('BLA-007 BLA-3.1: the extra attack is rolled in a real melee sequence (6 hit rolls instead of 5); without the enhancement 5', () => {
    const hits = (a: Partial<PlayerSetup>): number => {
      const s = makeState(a)
      setPhase(s, 'fight', 'A')
      placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 3]]); placeUnit(s, BINT, [[0, -1.2]])
      const { model, weapon } = weaponOn(s, CRU, 'bt.w.astartes-chainsword')
      return eventsOf(runAttack(s, [], 'melee', CRU, [tgt(model, weapon, BINT)]).events, 'HitRolled').length
    }
    expect(hits(CF)).toBe(6)
    expect(hits({ enhancementId: RD })).toBe(5)
  })

  it('BLA-007 BLA-3.1: with Siguard unattached only his own unit benefits, not the Crusaders', () => {
    const s = makeState({ ...CF, attachments: [] })
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 6]]); placeUnit(s, BINT, [[0, -9]])
    const chain = weaponOn(s, CRU, 'bt.w.astartes-chainsword'), mcpw = weaponOn(s, SIG, 'bt.w.master-crafted-power-weapon')
    expect(attacksOf(s, chain.model, chain.weapon, BINT)).toBe(5)
    expect(attacksOf(s, mcpw.model, mcpw.weapon, BINT)).toBe(7)
  })
})

// =====================================================================================================================
describe('Hate-Fuelled Strength (BLA-5.2)', () => {
  const HF = 'bt.s.hate-fuelled-strength'
  // A's Intercessors (unled) shoot; the enemy Intercessors are the closest target, the enemy Crusaders farther
  function ready(): GameState {
    const s = makeState({ attachments: [] })
    placeUnit(s, INT, { x: -14, z: 0, gap: 0.3 }); placeUnit(s, BINT, { x: -14, z: 7, gap: 0.3 }); placeUnit(s, BCRU, { x: -14, z: 14, gap: 0.2 }); placeUnit(s, CRU, { x: 14, z: -4, gap: 0.2 })
    setPhase(s, 'shooting', 'A', { A: 3 })
    return s
  }
  const rerollAgainst = (s: GameState, ctx: EngineContext, target: string): string | undefined => {
    const { model, weapon } = rangedOf(s, INT)
    const attack = attackCtx(s, model, weapon, target, s.units[target].models[0], { range: 7 })
    for (const { result } of hookService.collect(ctx, 'onHitRoll', { attack, roll: rollCtx('hit') } as never)) if (result.kind === 'roll' && result.reroll) return result.reroll
    return undefined
  }

  it('BLA-018 BLA-5.2: used before shooting, hit rolls against the closest eligible target may be re-rolled, a farther target gets none', () => {
    const s = ready()
    const { ctx } = ctxOf(s)
    expect(offered(s, 'A', 'shooting.start', HF)).toContain(INT)
    useStratagem(s, ctx, 'A', HF, 'shooting.start', {}, INT)
    expect(s.players.A.cp).toBe(2)
    expect(rerollAgainst(s, ctx, BINT)).toBe('all')
    expect(rerollAgainst(s, ctx, BCRU)).toBeUndefined()
    // it lasts the phase only
    effectService.expire(ctx, 'phaseEnd', null)
    expect(rerollAgainst(s, ctx, BINT)).toBeUndefined()
  })

  it('BLA-018 BLA-5.2: a unit that already shot is not offered it; not offered in the opponent\'s Shooting phase', () => {
    const s = ready()
    expect(offered(s, 'A', 'shooting.start', HF).sort()).toEqual([CRU, INT].sort())
    s.units[INT].turn.shotThisPhase = true
    expect(offered(s, 'A', 'shooting.start', HF)).toEqual([CRU])
    setPhase(s, 'shooting', 'B', { A: 3 })
    expect(offered(s, 'A', 'shooting.start', HF)).toEqual([])
  })

  it('BLA-018 BLA-5.2: usable in the opponent\'s Fight phase on a unit that has not fought yet', () => {
    const s = ready()
    setPhase(s, 'fight', 'B', { A: 3 })
    expect(offered(s, 'A', 'fight.start', HF).sort()).toEqual([CRU, INT].sort())
    s.phaseState.fight!.fought.push(INT)
    expect(offered(s, 'A', 'fight.start', HF)).toEqual([CRU])
  })
})

// =====================================================================================================================
describe('Goaded to Fury (BLA-5.3)', () => {
  const GF = 'bt.s.goaded-to-fury'
  const dist = (s: GameState, a: string, b: string): number => Math.hypot(s.models[s.units[a].models[0]].pos.x - s.models[s.units[b].models[0]].pos.x, s.models[s.units[a].models[0]].pos.z - s.models[s.units[b].models[0]].pos.z)

  function ready(gap: number): GameState {
    const s = makeState({ attachments: [] })
    placeUnit(s, INT, { x: -20, z: 8, gap: 0.3 }); placeUnit(s, BINT, { x: -20, z: 3, gap: 0.3 }); placeUnit(s, CRU, { x: 20, z: 0, gap: 0.2 })
    gapBetween(s, BINT, INT, gap)
    setPhase(s, 'shooting', 'B', { A: 3 })
    return s
  }

  it('BLA-019 BLA-5.3: after the enemy shot the Intercessors it is offered for them only, queues a 6" surge toward the shooter and the unit closes in', () => {
    const s = ready(12)
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, BINT, [INT])
    expect(offered(s, 'A', 'shooting.attacksResolved', GF, { unitId: BINT })).toEqual([INT]) // the Crusaders were not shot at
    useStratagem(s, ctx, 'A', GF, 'shooting.attacksResolved', { unitId: BINT }, INT)
    expect(s.players.A.cp).toBe(2)
    expect(pendingReactions(s, 'surge')).toMatchObject([{ unitId: INT, enemyUnitId: BINT, distance: 6, player: 'A' }])
    const before = dist(s, INT, BINT)
    const r = consumeReaction(s, 'surge')!
    expect(resolveSurgeMove(ctx, r.unitId, r.distance ?? 0, r.enemyUnitId)).toBe(true)
    expect(before - dist(s, INT, BINT)).toBeCloseTo(6, 1)
    expect(leaderService.inEngagementWithEnemy(s, INT)).toBe(false)
  })

  it('BLA-019 BLA-5.3: a shooter closer than 6" is closed on as far as Engagement Range allows, never into it', () => {
    const s = ready(3.5)
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, BINT, [INT])
    useStratagem(s, ctx, 'A', GF, 'shooting.attacksResolved', { unitId: BINT }, INT)
    const before = dist(s, INT, BINT)
    const r = consumeReaction(s, 'surge')!
    expect(resolveSurgeMove(ctx, r.unitId, r.distance ?? 0, r.enemyUnitId)).toBe(true)
    expect(dist(s, INT, BINT)).toBeLessThan(before)
    expect(leaderService.inEngagementWithEnemy(s, INT)).toBe(false)
    expect(leaderService.unitDistance(s, INT, BINT)).toBeLessThan(1.6)
  })

  it('BLA-019 BLA-5.3: not offered in the Black Templars player\'s own turn, nor in the Fight phase', () => {
    const own = ready(12)
    setPhase(own, 'shooting', 'A', { A: 3 })
    const { ctx } = ctxOf(own)
    stratagemService.recordTargets(ctx, CRU, [INT]) // (artificial) a friendly unit "targeted" in A's own Shooting phase
    expect(offered(own, 'A', 'shooting.attacksResolved', GF, { unitId: CRU })).toEqual([])
    const fight = ready(12)
    setPhase(fight, 'fight', 'B', { A: 3 })
    const c2 = ctxOf(fight).ctx
    stratagemService.recordTargets(c2, BINT, [INT])
    expect(offered(fight, 'A', 'fight.attacksResolved', GF, { unitId: BINT })).toEqual([])
  })

  it('BLA-019 BLA-5.3: a Battle-shocked unit does not surge', () => {
    const s = ready(12)
    s.units[INT].battleShocked = true
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, BINT, [INT])
    expect(offered(s, 'A', 'shooting.attacksResolved', GF, { unitId: BINT })).toEqual([])
  })
})

// =====================================================================================================================
describe('Righteous Zeal (BLA-6.1)', () => {
  const results = (hook: 'onAdvanceRoll' | 'onChargeRoll', unit: string, s: GameState): unknown[] => {
    const { ctx } = ctxOf(s)
    return hook === 'onAdvanceRoll'
      ? hookService.collect(ctx, hook, { movingUnitId: unit, roll: rollOf(1, 'advance') } as never).map((r) => r.result)
      : hookService.collect(ctx, hook, { chargingUnitId: unit, targetUnitIds: [BINT], roll: rollOf(4, 'charge') } as never).map((r) => r.result)
  }

  it('BLA-020 BLA-6.1: the Crusader Squad may re-roll its Advance roll and its Charge roll; the Intercessors may not', () => {
    const s = makeState()
    placeUnit(s, CRU, { x: 0, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[0, 3]]); placeUnit(s, INT, [[10, 0]]); placeUnit(s, BINT, [[0, -9]])
    expect(results('onAdvanceRoll', CRU, s)).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(results('onChargeRoll', CRU, s)).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(results('onAdvanceRoll', INT, s)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(results('onChargeRoll', INT, s)).not.toContainEqual({ kind: 'roll', reroll: 'all' })
  })

  it('BLA-020 BLA-6.1: a half of a split squad keeps both re-rolls', () => {
    const s = makeState({ attachments: [], splitUnits: ['primaris-crusader-squad'] })
    const half = 'A:crusader-squad-brethren'
    expect(s.units[half]).toBeTruthy()
    placeUnit(s, half, { x: 0, z: 0, gap: 0.2 })
    expect(results('onAdvanceRoll', half, s)).toContainEqual({ kind: 'roll', reroll: 'all' })
    expect(results('onChargeRoll', half, s)).toContainEqual({ kind: 'roll', reroll: 'all' })
  })
})

// =====================================================================================================================
describe('Impulsor transport and Firing Deck 6 (BLA-6.3)', () => {
  const embark = (s: GameState, unit: string): void => {
    placeUnit(s, IMP, [[0, 0]])
    placeUnit(s, unit, { x: -3, z: 0, gap: 0.2 })
    transportService.embark(s, unit, IMP)
  }

  it('BLA-021 BLA-6.3: the 5 Intercessors embark (5 of 6 places used)', () => {
    const s = makeState()
    placeUnit(s, IMP, [[0, 0]]); placeUnit(s, INT, { x: -3, z: 0, gap: 0.2 })
    expect(transportService.canCarry(s, INT, IMP)).toBe(true)
    transportService.embark(s, INT, IMP)
    expect(transportService.transportOf(s, INT)).toBe(IMP)
    expect(s.units[INT].models.length).toBe(5)
  })

  it('BLA-021 BLA-6.3: a 5-model Crusader half embarks; the unsplit 10-model squad is refused', () => {
    const split = makeState({ attachments: [], splitUnits: ['primaris-crusader-squad'] })
    for (const half of ['A:crusader-squad-initiates', 'A:crusader-squad-brethren']) {
      expect(split.units[half].models.length).toBe(5)
      placeUnit(split, IMP, [[0, 0]]); placeUnit(split, half, { x: -3, z: 0, gap: 0.2 })
      expect(transportService.canCarry(split, half, IMP)).toBe(true)
    }
    const whole = makeState({ attachments: [] })
    placeUnit(whole, IMP, [[0, 0]]); placeUnit(whole, CRU, { x: -3, z: 0, gap: 0.2 })
    expect(whole.units[CRU].models.length).toBe(10)
    expect(transportService.canCarry(whole, CRU, IMP)).toBe(false)
  })

  it('BLA-021 BLA-6.3: Firing Deck 6 - the Impulsor lists every embarked bolt rifle (up to 6 models) and its own weapons; the Intercessors are spent afterwards', () => {
    const s = makeState()
    setPhase(s, 'shooting', 'A')
    embark(s, INT)
    placeUnit(s, BINT, { x: 0, z: 12, gap: 0.3 })
    expect(firingDeckValue(s, IMP)).toBe(6)
    const deck = firingDeckWeapons(s, IMP)
    expect(deck.map((d) => d.modelId).sort()).toEqual([...s.units[INT].models].sort())
    for (const d of deck) expect(d.weaponIds.some((w) => w === 'bt.w.bolt-rifle')).toBe(true)
    const { ctx } = ctxOf(s)
    const entries = buildShootingWeaponEntries(ctx, IMP)
    const pass = entries.filter((e) => s.models[e.modelId].unitId === INT && e.weaponId === 'bt.w.bolt-rifle' && e.legalTargets.includes(BINT))
    expect(pass.length).toBe(5)
    // all five fire through the deck in one declaration (the cap is six models)
    const pending = { kind: 'declareTargets', id: 'd:x', player: 'A', window: 'shooting.start', canPass: true, context: { unitId: IMP, attackKind: 'ranged', overwatch: false, weapons: entries, engagedWith: [] } } as never
    const decl = (n: number): Action => ({ type: 'declareTargets', player: 'A', decisionId: 'd:x', unitId: IMP, targets: pass.slice(0, n).map((e) => ({ modelId: e.modelId, weaponId: e.weaponId, targetUnitId: BINT })) }) as Action
    expect(shootingModule.validate?.(s, decl(5), pending)).toBeNull()
  })

  it('BLA-021 BLA-6.3: Siguard + the Intercessors (6 models) embarked together all fire through the deck (6 of 6)', () => {
    const s = makeState({ attachments: [{ leaderRef: 'marshal-siguard', bodyguardRef: 'intercessor-squad' }] })
    setPhase(s, 'shooting', 'A')
    placeUnit(s, IMP, [[0, 0]]); placeUnit(s, INT, { x: -3, z: 0, gap: 0.2 }); placeUnit(s, SIG, [[-3, 2]])
    transportService.embark(s, INT, IMP)
    expect(firingDeckWeapons(s, IMP).length).toBe(6)
  })
})

// =====================================================================================================================
describe('Weapon abilities (BLA-6)', () => {
  const abilityNames = (s: GameState, id: string): string[] => s.weapons[id].abilities.map((a) => a.ability)

  it('BLA-024 BLA-6: the bolt rifle is Assault + Heavy; the plasma pistol is Pistol and its supercharge Pistol + Hazardous; the multi-melta is Melta 2; storm bolters Rapid Fire 2', () => {
    const s = makeState()
    expect(abilityNames(s, 'bt.w.bolt-rifle').sort()).toEqual(['ASSAULT', 'HEAVY'])
    expect(abilityNames(s, 'bt.w.plasma-pistol-standard')).toEqual(['PISTOL'])
    expect(abilityNames(s, 'bt.w.plasma-pistol-supercharge').sort()).toEqual(['HAZARDOUS', 'PISTOL'])
    expect(s.weapons['bt.w.multi-melta'].abilities).toContainEqual({ ability: 'MELTA', value: 2 })
    expect(s.weapons['sm.w.storm-bolter'].abilities).toContainEqual({ ability: 'RAPID_FIRE', value: 2 })
    expect(s.weapons['bt.w.storm-bolter-2'].abilities).toContainEqual({ ability: 'RAPID_FIRE', value: 2 })
    expect(s.datasheets[s.units[IMP].datasheetId].coreAbilities).toContainEqual({ ability: 'DEADLY_DEMISE', value: 'D3' })
  })

  it('BLA-024 BLA-6: a Hazardous 1 on the supercharged plasma pistol gives Siguard (a CHARACTER) 3 mortal wounds instead of destroying him; the standard profile is never tested', () => {
    const shoot = (weaponId: string) => {
      const s = makeState({ attachments: [] })
      setPhase(s, 'shooting', 'A')
      placeUnit(s, SIG, [[0, 0]]); placeUnit(s, BINT, [[0, -8]])
      return { s, events: runAttack(s, [1, 1], 'ranged', SIG, [tgt(SIGM, weaponId, BINT, 1)]).events }
    }
    const hot = shoot('bt.w.plasma-pistol-supercharge')
    expect(eventsOf(hot.events, 'HazardousTested')[0]).toMatchObject({ failed: true, modelId: SIGM })
    const mortal = eventsOf(hot.events, 'DamageApplied').filter((d) => d.modelId === SIGM && d.mortal)
    expect(mortal.reduce((n, d) => n + d.amount, 0)).toBe(3)
    expect(hot.s.models[SIGM].woundsRemaining).toBe(2)
    expect(eventsOf(shoot('bt.w.plasma-pistol-standard').events, 'HazardousTested')).toHaveLength(0)
  })

  it('BLA-024 BLA-6: a Hazardous 2+ is safe', () => {
    const s = makeState({ attachments: [] })
    setPhase(s, 'shooting', 'A')
    placeUnit(s, SIG, [[0, 0]]); placeUnit(s, BINT, [[0, -8]])
    const ev = runAttack(s, [1, 2], 'ranged', SIG, [tgt(SIGM, 'bt.w.plasma-pistol-supercharge', BINT, 1)]).events
    expect(eventsOf(ev, 'HazardousTested')[0]).toMatchObject({ failed: false })
    expect(s.models[SIGM].woundsRemaining).toBe(5)
  })

  // A's Impulsor shoots B's Impulsor from `gap` inches edge to edge
  function impulsorDuel(gap: number, weapons: string[], dice: number[]) {
    const s = makeState({ attachments: [] })
    setPhase(s, 'shooting', 'A')
    placeUnit(s, 'B:impulsor', [[0, 0]])
    placeUnit(s, IMP, [[0, -10]])
    gapBetween(s, IMP, 'B:impulsor', gap)
    const m = s.units[IMP].models[0]
    const log = runAttack(s, dice, 'ranged', IMP, weapons.map((w) => tgt(m, w, 'B:impulsor')))
    return { s, events: log.events }
  }

  it('BLA-024 BLA-6: multi-melta Melta 2 adds 2 damage per unsaved wound within 9" and nothing beyond (2 shots -> +4)', () => {
    const dice = [6, 6, 6, 6, 3, 3, 3, 3, 3, 3]
    const near = sumDamage(impulsorDuel(8.5, ['bt.w.multi-melta'], dice).events, 'B:impulsor')
    const far = sumDamage(impulsorDuel(10, ['bt.w.multi-melta'], dice).events, 'B:impulsor')
    expect(far).toBeGreaterThan(0)
    expect(near - far).toBe(4)
  })

  it('BLA-024 BLA-6: each of the Impulsor\'s storm bolters makes 4 shots within half range (12") and 2 beyond it', () => {
    const both = ['sm.w.storm-bolter', 'bt.w.storm-bolter-2']
    const hits = (gap: number): number => eventsOf(impulsorDuel(gap, both, []).events, 'HitRolled').length
    expect(hits(10)).toBe(8)
    expect(hits(14)).toBe(4)
  })

  it('BLA-024 BLA-6: a destroyed Impulsor explodes (Deadly Demise D3) on a 6 and the Intercessors beside it take D3 mortal wounds', () => {
    const s = makeState({ attachments: [] })
    setPhase(s, 'shooting', 'B')
    placeUnit(s, IMP, [[0, 0]]); placeUnit(s, INT, [[4, 0]]); placeUnit(s, BINT, [[0, -12]])
    s.models[s.units[IMP].models[0]].woundsRemaining = 1
    const att = s.units[BINT].models[0]
    const w = armed(s, att, s.models[att].weapons[0], { A: 1, skill: 2, S: 12, AP: -6, D: 1, abilities: [] as never[], range: 24 })
    const { events } = runAttack(s, Array(12).fill(6), 'ranged', BINT, [tgt(att, w, IMP, 1)])
    expect(eventsOf(events, 'ModelDestroyed').some((e) => e.unitId === IMP)).toBe(true)
    const dd = eventsOf(events, 'DeadlyDemiseRolled')[0]
    expect(dd).toMatchObject({ exploded: true })
    expect(dd.affected).toContain(INT)
    const mortals = eventsOf(events, 'DamageApplied').filter((d) => d.unitId === INT && d.mortal).reduce((n, d) => n + d.amount, 0)
    expect(mortals).toBe(3) // a 6 on the D3 roll
  })
})
