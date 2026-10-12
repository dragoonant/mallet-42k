// Grey Knights engine changes beyond code hooks (docs/spec/factions/grey-knights.md 7.1 E1-E4, checklist GRE-*): unit choice,
// Teleport Assault removal / arrival / cull / battle end, and the mission model-destroyed plumbing (Champion of Titan).
// Real Combat Patrol data (Aurellios' Banishers vs Gordrang's Gitstompas).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, advanceGame, ENGINE_VERSION, EngineInvariantError, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type DeployUnitDecision, type GameEvent, type GameSetup, type GameState, type PlayerSetup,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { movementModule } from '../../src/engine/phases/movement'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { destroyStrandedTeleports, grantTeleportFervour, hasTeleportFervour, isTeleporting, removeUnitToReserves, teleportState } from '../../src/engine/teleport'
import { placeUnit } from '../fixtures/state'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Grey Knights', faction: 'grey-knights', patrolId: 'gk.cp.aurellios-banishers', enhancementId: 'gk.e.banishment-stone',
  secondaryId: 'gk.sec.champion-of-titan', attachments: [{ leaderRef: 'librarian', bodyguardRef: 'terminators' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const LIB = 'A:librarian', TERM = 'A:terminators', STRIKE = 'A:strike'
const BOYZ = 'B:boyz-a'

function makeState(o: { round?: number; gk?: Partial<PlayerSetup> } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GK(o.gk), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'grey-knights-core', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}
function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B'): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
}
function ctxOf(s: GameState, dice: number[] = []) { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function deployGK(s: GameState): void {
  placeUnit(s, TERM, { x: -10, z: 0, gap: 0.3 })
  placeUnit(s, LIB, [[-10, 3]])
  placeUnit(s, STRIKE, { x: -10, z: -6, gap: 0.3 })
}

describe('E1 unit choice (GRE-1.1, 1.2)', () => {
  it('GRE-002 GRE-1.1: default fields the Terminators and no Dreadknight; the Librarian leads them', () => {
    const s = makeState()
    expect(s.units[TERM]).toBeDefined()
    expect(s.units['A:dreadknight']).toBeUndefined()
    expect(s.units[LIB].bodyguardUnitId).toBe(TERM)
  })
  it('GRE-002 GRE-1.2: unitChoices {heavy: dreadknight} drops the Terminators and the attachment; unknown group / ref throw', () => {
    const s = makeState({ gk: { unitChoices: { heavy: 'dreadknight' } } })
    expect(s.units[TERM]).toBeUndefined()
    expect(s.units['A:dreadknight']).toBeDefined()
    expect(s.units[LIB].bodyguardUnitId).toBeNull()
    expect(Object.values(s.units).filter((u) => u.player === 'A')).toHaveLength(3)
    expect(() => makeState({ gk: { unitChoices: { heavy: 'strike' } } })).toThrow(EngineInvariantError)
    expect(() => makeState({ gk: { unitChoices: { nope: 'dreadknight' } } })).toThrow(EngineInvariantError)
  })
})

describe('E2 Teleport Assault removal (GRE-2.1)', () => {
  it('GRE-005 GRE-2.1: removing an attached pair sends both halves to Reserves, keeps the attachment, emits one event', () => {
    const s = makeState()
    deployGK(s)
    phase(s, 'command', 'B')
    const { ctx, events } = ctxOf(s)
    removeUnitToReserves(ctx, LIB, 'gk.a.teleport-assault') // either half names the pair
    expect(s.units[TERM].location).toBe('reserves')
    expect(s.units[LIB].location).toBe('reserves')
    expect(s.units[LIB].bodyguardUnitId).toBe(TERM)
    expect(isTeleporting(s, LIB)).toBe(true)
    expect(isTeleporting(s, TERM)).toBe(true)
    expect(teleportState(s, 'A').pending).toEqual([{ unitId: TERM, removedRound: 2, removedInTurnOf: 'B', source: 'gk.a.teleport-assault' }])
    expect(of(events, 'UnitRemovedFromBattlefield')).toHaveLength(1)
    expect(of(events, 'UnitRemovedFromBattlefield')[0].unitId).toBe(TERM)
    expect(() => removeUnitToReserves(ctx, TERM, 'x')).toThrow(EngineInvariantError) // no longer on the board
  })
  it('GRE-022 GRE-5.3: the Daemonic Fervour grant is valid only for the round and turn it was made in', () => {
    const s = makeState({ round: 2 })
    deployGK(s)
    phase(s, 'fight', 'B')
    grantTeleportFervour(s, LIB)
    expect(hasTeleportFervour(s, TERM)).toBe(true)
    expect(hasTeleportFervour(s, STRIKE)).toBe(false)
    s.activePlayer = 'A'
    expect(hasTeleportFervour(s, TERM)).toBe(false)
    s.activePlayer = 'B'
    s.round = 3
    expect(hasTeleportFervour(s, TERM)).toBe(false)
  })
})

describe('E3 Teleport Assault arrival / cull / battle end (GRE-2.2-2.7)', () => {
  function teleportedState(round: number) {
    const s = makeState({ round })
    deployGK(s)
    placeUnit(s, BOYZ, { x: 18, z: 8, gap: 0.3 })
    phase(s, 'command', 'B')
    removeUnitToReserves(ctxOf(s).ctx, TERM, 'gk.a.teleport-assault')
    phase(s, 'movement', 'A')
    s.step = 'reinforcements'
    return s
  }
  const place = (s: GameState, pending: DeployUnitDecision, x: number, z: number): Action => ({
    type: 'deployUnit', player: 'A', decisionId: pending.id,
    unitId: pending.context.unitIds[0],
    placements: pending.context.unitIds.flatMap((u) => s.units[u].models).map((id, i) => ({ modelId: id, pos: { x: x + (i % 3) * 1.8, y: 0, z: z + Math.floor(i / 3) * 1.8 }, facing: 0 })),
  })

  it('GRE-006 GRE-2.2: a teleporting unit is offered in round 1 and arrives by Deep Strike (>9") as one attached pair', () => {
    const s = teleportedState(1)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect([...pending.context.unitIds].sort()).toEqual([LIB, TERM].sort())
    expect(movementModule.validate!(s, place(s, pending, 10, 8), pending)).not.toBeNull() // under 9" from the Boyz
    const spots: [number, number][] = [[-5, 8], [0, 10], [-18, 5], [-18, -8], [0, -10], [5, 0]]
    const ok = spots.find(([x, z]) => movementModule.validate!(s, place(s, pending, x, z), pending) === null)
    expect(ok).toBeDefined()
    s.pending = null
    expect(movementModule.handle(c.ctx, place(s, pending, ok![0], ok![1]), pending)).toBeUndefined()
    expect(s.units[TERM].location).toBe('board')
    expect(s.units[LIB].location).toBe('board')
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ via: 'teleportAssault' })
    expect(isTeleporting(s, TERM)).toBe(false)
    expect(s.units[TERM].turn.arrivedThisTurn).toBe(true)
    // arrives having made a Normal move: it cannot move again (moveType set), but Normal movers may still shoot and charge
    for (const id of [TERM, LIB]) expect(s.units[id].turn.moveType).toBe('normal')
  })
  it('GRE-007 GRE-2.3: a teleporting unit is never culled by the Reserves cull and arrives in round 4', () => {
    const s = teleportedState(4)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    expect(s.units[TERM].location).toBe('reserves')
    expect((s.pending as DeployUnitDecision).kind).toBe('deployUnit')
    expect(of(c.events, 'UnitLostInReserves').filter((e) => e.unitId === TERM || e.unitId === LIB)).toHaveLength(0)
  })
  it('GRE-010 GRE-2.6: declining the mandatory arrival destroys the unit (both halves, null attribution)', () => {
    const s = teleportedState(2)
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    const pass: Action = { type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: TERM, placements: [], toReserves: true }
    s.pending = null
    expect(movementModule.handle(c.ctx, pass, pending)).toBeUndefined()
    expect(s.units[TERM].location).toBe('destroyed')
    expect(s.units[LIB].location).toBe('destroyed')
    expect(of(c.events, 'UnitLostInReserves').filter((e) => e.unitId === TERM || e.unitId === LIB)).toHaveLength(2)
    expect(of(c.events, 'UnitDestroyed').every((e) => e.byPlayer === null)).toBe(true)
    expect(teleportState(s, 'A').pending).toHaveLength(0)
  })
  it('GRE-008 GRE-2.4: destroyStrandedTeleports destroys units still off-board (battle end)', () => {
    // real end of battle: GK (first player) already played round 5; at the end of the opponent's turn the unit is picked for
    // Teleport Assault and is never placed; the reducer then runs the round/battle end chain
    const s = makeState({ round: 5 })
    deployGK(s)
    placeUnit(s, BOYZ, { x: 18, z: 8, gap: 0.3 })
    s.firstPlayer = 'A'
    phase(s, 'fight', 'B')
    s.step = 'none'
    const c = ctxOf(s)
    advanceGame(c.ctx, DEFAULT_MODULES)
    const pick = s.pending as { id: string; player: 'A' | 'B'; options: { id: string }[] }
    expect(pick.options.map((o) => o.id)).toContain(TERM)
    s.pending = null
    hookService.handler.handle(c.ctx, { type: 'chooseOption', player: pick.player, decisionId: pick.id, optionId: TERM }, pick as never)
    advanceGame(c.ctx, DEFAULT_MODULES)
    expect(s.phase).toBe('ended')
    expect(s.units[TERM].location).toBe('destroyed')
    expect(s.units[LIB].location).toBe('destroyed')
    const types = c.events.map((e) => e.type)
    const lost = c.events.findIndex((e) => e.type === 'UnitLostInReserves' && (e.unitId === TERM || e.unitId === LIB))
    const destroyed = of(c.events, 'UnitDestroyed').filter((e) => e.unitId === TERM || e.unitId === LIB)
    expect(lost).toBeGreaterThanOrEqual(0)
    expect(destroyed.length).toBeGreaterThan(0)
    expect(destroyed.every((e) => e.byPlayer === null)).toBe(true) // no kill attribution
    const ended = types.indexOf('GameEnded')
    expect(ended).toBeGreaterThan(lost)
    const lastDestroy = Math.max(...c.events.map((e, i) => (e.type === 'UnitDestroyed' && (e.unitId === TERM || e.unitId === LIB) ? i : -1)))
    const vpIdx = c.events.map((e, i) => (e.type === 'VpScored' && /battle.end|battleEnd|end/i.test(e.source) ? i : -1)).filter((i) => i >= 0)
    for (const i of vpIdx) expect(i).toBeGreaterThan(lastDestroy) // destroyed before any battle.end scoring
    expect(lastDestroy).toBeLessThan(ended)
  })
  it('GRE-011 GRE-2.7: a player with only a teleporting unit left still has forces, in any round', () => {
    const s = makeState({ round: 5 })
    deployGK(s)
    phase(s, 'command', 'B')
    removeUnitToReserves(ctxOf(s).ctx, TERM, 'x')
    removeUnitToReserves(ctxOf(s).ctx, STRIKE, 'x')
    expect(missionService.playerHasForces(s, 'A')).toBe(true)
    destroyStrandedTeleports(ctxOf(s).ctx)
    expect(missionService.playerHasForces(s, 'A')).toBe(false)
  })
})

describe('E4 mission model-destroyed plumbing (GRE-4.1)', () => {
  const kill = (victim: string, by: string, byModel?: string): GameState => {
    const s = makeState()
    deployGK(s)
    placeUnit(s, victim, [[-8, 0]])
    phase(s, 'fight', 'A')
    const { ctx } = ctxOf(s, [1])
    attackService.destroyModel(ctx, s.units[victim].models[0], { player: 'A', unitId: by, modelId: byModel ?? s.units[by].models[0], kind: 'melee' })
    return s
  }
  it('GRE-015 GRE-4.1: the Warlord model killing an enemy CHARACTER scores 6 VP', () => {
    expect(kill('B:warboss', LIB).players.A.vp).toBe(6)
  })
  it('GRE-015 GRE-4.1: a CHARACTER killed by the Strike Squad scores 0', () => {
    expect(kill('B:warboss', STRIKE).players.A.vp).toBe(0)
  })
  it('GRE-015 GRE-4.1: a non-CHARACTER killed by the Warlord scores 0', () => {
    expect(kill(BOYZ, LIB).players.A.vp).toBe(0)
  })
})
