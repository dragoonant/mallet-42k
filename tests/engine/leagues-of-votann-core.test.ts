// Leagues of Votann engine changes beyond code hooks (docs/spec/factions/leagues-of-votann.md 7.1 E1-E3, checklist LEA-*):
// Judgement tokens, Teleport-record edge-redeploy arrival (Outflanking Mag-Riders) and the Deploy Armies pick window.
// Real Combat Patrol data (Warspeke's Prospect vs Gordrang's Gitstompas).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ScriptedRng, createContext, createGameState, emptyPhaseState, ENGINE_VERSION,
  type Action, type ChooseOptionDecision, type DeployUnitDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { attackService, type DestroyedBy } from '../../src/engine/attack'
import { addJudgement, judgementOnUnitDestroyed, judgementTokens, JUDGEMENT_MAX } from '../../src/engine/judgement'
import { deploymentZone } from '../../src/engine/state'
import { playerBattlefieldEdge } from '../../src/engine/geometry'
import { magRidersArrivalConstraints, movementModule } from '../../src/engine/phases/movement'
import { setupModule } from '../../src/engine/setup'
import { destroyTeleportingUnit, isTeleporting, removeUnitToReserves, teleportState } from '../../src/engine/teleport'
import { transportService } from '../../src/engine/transports'
import { placeUnit } from '../fixtures/state'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const LOV = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Leagues of Votann', faction: 'leagues-of-votann', patrolId: 'lov.cp.warspekes-prospect', enhancementId: 'lov.e.waste-feeds-the-void',
  secondaryId: 'lov.sec.toil-earns', attachments: [{ leaderRef: 'kahl', bodyguardRef: 'hearthkyn' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const KAHL = 'A:kahl', HEARTH = 'A:hearthkyn', PIONEERS = 'A:pioneers', BESERKS = 'A:beserks'
const BOYZ = 'B:boyz-a', BOYZ_B = 'B:boyz-b', WARBOSS = 'B:warboss'

function makeState(o: { round?: number; ork?: Partial<PlayerSetup>; attacker?: 'A' | 'B'; mirror?: boolean } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: LOV(), B: o.mirror ? LOV() : ORK(o.ork) },
    sides: { attacker: o.attacker ?? 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'leagues-of-votann-core', ENGINE_VERSION)
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

const NO_KILLER: DestroyedBy = { player: null, unitId: null, modelId: null, kind: 'other' }
const killer = (unitId: string, player: 'A' | 'B', kind: DestroyedBy['kind'] = 'ranged'): DestroyedBy => ({ player, unitId, modelId: null, kind })

// destroy every model of a unit one by one, attributed to `by` (its first model is the attacking model)
function wipe(ctx: EngineContext, unitId: string, by: DestroyedBy): void {
  for (const id of [...ctx.state.units[unitId].models]) {
    attackService.destroyModel(ctx, id, { ...by, modelId: by.unitId ? ctx.state.units[by.unitId].models[0] : null })
  }
}

function board(s: GameState): void {
  placeUnit(s, HEARTH, { x: -10, z: 0, gap: 0.3 }); placeUnit(s, KAHL, [[-10, 3]])
  placeUnit(s, PIONEERS, { x: -10, z: -6, gap: 0.5 }); placeUnit(s, BESERKS, { x: -10, z: 8, gap: 0.3 })
  placeUnit(s, BOYZ, { x: 8, z: 0, gap: 0.3 }); placeUnit(s, BOYZ_B, { x: 8, z: 6, gap: 0.3 })
  placeUnit(s, WARBOSS, [[8, -4]])
}

// =====================================================================================================================
describe('E1 Judgement tokens (LEA-2.1 - 2.4)', () => {
  it('LEA-003 LEA-2.1: an enemy unit destroys the Beserks -> that enemy unit gets 1 Judgement token (AbilityTriggered)', () => {
    const s = makeState(); board(s); phase(s, 'shooting', 'B')
    const { ctx, events } = ctxOf(s, [1])
    expect(judgementTokens(s, 'A', BOYZ)).toBe(0)
    wipe(ctx, BESERKS, killer(BOYZ, 'B'))
    expect(s.units[BESERKS].location).toBe('destroyed')
    expect(judgementTokens(s, 'A', BOYZ)).toBe(1)
    expect(judgementTokens(s, 'A', BOYZ_B)).toBe(0)
    const ev = of(events, 'AbilityTriggered').filter((e) => e.abilityId === 'lov.a.eye-of-the-ancestors')
    expect(ev).toHaveLength(1)
    expect(ev[0].targetUnitId).toBe(BOYZ)
    expect(ev[0].summary).toMatch(/1 token\b/)
  })

  it('LEA-004 LEA-2.1: a second Votann unit destroyed by the same enemy -> 2 tokens; a third -> still 2', () => {
    const s = makeState(); board(s); phase(s, 'shooting', 'B')
    const { ctx, events } = ctxOf(s, [1])
    wipe(ctx, BESERKS, killer(BOYZ, 'B'))
    wipe(ctx, PIONEERS, killer(BOYZ, 'B'))
    expect(judgementTokens(s, 'A', BOYZ)).toBe(2)
    wipe(ctx, HEARTH, killer(BOYZ, 'B'))
    expect(judgementTokens(s, 'A', BOYZ)).toBe(JUDGEMENT_MAX)
    expect(of(events, 'AbilityTriggered').filter((e) => e.abilityId === 'lov.a.eye-of-the-ancestors')).toHaveLength(2) // the capped third emits nothing
  })

  it('LEA-005 LEA-2.1: no token for own Hazardous, a null-attribution loss, or a unit lost in Reserves', () => {
    const s = makeState(); board(s); phase(s, 'shooting', 'A')
    const { ctx } = ctxOf(s, [1])
    wipe(ctx, BESERKS, killer(PIONEERS, 'A')) // Hazardous: the unit's own player
    wipe(ctx, HEARTH, NO_KILLER)
    expect(Object.values(s.units).every((u) => judgementTokens(s, 'A', u.id) === 0 && judgementTokens(s, 'B', u.id) === 0)).toBe(true)
    const s2 = makeState({ round: 4 }); board(s2); phase(s2, 'command', 'B')
    removeUnitToReserves(ctxOf(s2).ctx, PIONEERS, 'x')
    destroyTeleportingUnit(ctxOf(s2, [1]).ctx, PIONEERS)
    expect(s2.units[PIONEERS].location).toBe('destroyed')
    expect(Object.values(s2.units).every((u) => judgementTokens(s2, 'A', u.id) === 0 && judgementTokens(s2, 'B', u.id) === 0)).toBe(true)
  })

  it("LEA-006 LEA-2.1: a mortal-wound kill (Deadly Demise) credits the exploding model's unit", () => {
    const s = makeState(); board(s); phase(s, 'fight', 'B')
    const { ctx } = ctxOf(s, [1])
    wipe(ctx, BESERKS, killer(BOYZ_B, 'B', 'mortal'))
    expect(judgementTokens(s, 'A', BOYZ_B)).toBe(1)
    expect(judgementTokens(s, 'A', BOYZ)).toBe(0)
  })

  it('LEA-2.1: only a Votann unit with Eye of the Ancestors destroyed by an enemy unit grants a token', () => {
    const s = makeState(); board(s); phase(s, 'shooting', 'A')
    const { ctx } = ctxOf(s, [1])
    judgementOnUnitDestroyed(ctx, BOYZ_B, killer(KAHL, 'A')) // an Ork unit dying gives nobody a token
    expect(judgementTokens(s, 'B', KAHL)).toBe(0)
    expect(judgementTokens(s, 'A', KAHL)).toBe(0)
    judgementOnUnitDestroyed(ctx, BESERKS, NO_KILLER) // no killer unit
    judgementOnUnitDestroyed(ctx, BESERKS, killer(PIONEERS, 'A')) // friendly killer
    expect(judgementTokens(s, 'A', PIONEERS)).toBe(0)
  })

  it('LEA-009 LEA-2.3: an attached enemy pair gains a token; its bodyguard later wiped -> the surviving leader keeps it', () => {
    const s = makeState({ mirror: true }) // the enemy is a second Votann army: Kahl leads its Hearthkyn
    placeUnit(s, HEARTH, { x: -10, z: 0, gap: 0.3 }); placeUnit(s, KAHL, [[-10, 3]]); placeUnit(s, BESERKS, { x: -10, z: 8, gap: 0.3 })
    placeUnit(s, 'B:hearthkyn', { x: 8, z: 0, gap: 0.3 }); placeUnit(s, 'B:kahl', [[8, 3]])
    expect(s.units['B:kahl'].bodyguardUnitId).toBe('B:hearthkyn')
    phase(s, 'shooting', 'B')
    const { ctx } = ctxOf(s, [1])
    wipe(ctx, BESERKS, killer('B:kahl', 'B')) // the attacker is the Leader half
    expect(judgementTokens(s, 'A', 'B:hearthkyn')).toBe(1)
    expect(judgementTokens(s, 'A', 'B:kahl')).toBe(1)
    phase(s, 'shooting', 'A')
    for (const id of [...s.units['B:hearthkyn'].models]) attackService.destroyModel(ctx, id, { player: 'A', unitId: PIONEERS, modelId: s.units[PIONEERS].models[0], kind: 'ranged' })
    expect(s.units['B:hearthkyn'].location).toBe('destroyed')
    expect(s.units['B:kahl'].location).toBe('board')
    expect(judgementTokens(s, 'A', 'B:kahl')).toBe(1)
  })

  it('LEA-010 LEA-2.3: tokens stay while the marked unit is in Reserves and after it returns', () => {
    const s = makeState(); board(s)
    const { ctx } = ctxOf(s)
    addJudgement(ctx, 'A', BOYZ, 1, 'test')
    s.units[BOYZ].location = 'reserves'
    expect(judgementTokens(s, 'A', BOYZ)).toBe(1)
    s.units[BOYZ].location = 'board'
    expect(judgementTokens(s, 'A', BOYZ)).toBe(1)
  })

  it('LEA-011 LEA-2.4: tokens are per player; addJudgement caps at 2 and reports the new count', () => {
    const s = makeState(); board(s)
    const { ctx, events } = ctxOf(s)
    expect(addJudgement(ctx, 'A', BOYZ, 1, 'test')).toBe(1)
    expect(judgementTokens(s, 'B', BOYZ)).toBe(0) // the Orks' own models see none of the Votann player's tokens
    expect(addJudgement(ctx, 'A', BOYZ, 5, 'test')).toBe(JUDGEMENT_MAX)
    expect(addJudgement(ctx, 'A', BOYZ, 1, 'test')).toBe(JUDGEMENT_MAX)
    expect(of(events, 'AbilityTriggered')).toHaveLength(2) // the unchanged count emits nothing
    addJudgement(ctx, 'B', KAHL, 1, 'test') // a mirror player's tokens live in the other secondaryState
    expect(judgementTokens(s, 'B', KAHL)).toBe(1)
    expect(judgementTokens(s, 'A', KAHL)).toBe(0)
  })
})

// =====================================================================================================================
describe('E2 Teleport-record edge-redeploy arrival (Outflanking Mag-Riders, LEA-6.3)', () => {
  const MAG = { minEnemyGap: 9, forbidChargeOnArrival: false, region: 'edgeNotOpponent' as const, eventVia: 'strategicReserves' as const }
  type Edge = 'L' | 'R' | 'T' | 'B'
  const hw = 22, hh = 15
  const opposite: Record<Edge, Edge> = { L: 'R', R: 'L', T: 'B', B: 'T' }
  const sideEdges: Record<Edge, Edge[]> = { L: ['T', 'B'], R: ['T', 'B'], T: ['L', 'R'], B: ['L', 'R'] }
  const oppEdge = (s: GameState): Edge => playerBattlefieldEdge(s.board, deploymentZone(s, 'B'))

  function reservesState(round: number, opts: Parameters<typeof removeUnitToReserves>[3] = MAG) {
    const s = makeState({ round })
    s.board = { ...s.board, pieces: {} } // an empty table: the tests probe arrival geometry only
    placeUnit(s, HEARTH, { x: -10, z: 0, gap: 0.3 }); placeUnit(s, KAHL, [[-10, 3]])
    placeUnit(s, PIONEERS, { x: -10, z: -6, gap: 0.5 })
    placeUnit(s, BOYZ, [[0, 0]])
    phase(s, 'command', 'B')
    removeUnitToReserves(ctxOf(s).ctx, PIONEERS, 'lov.a.outflanking-mag-riders', opts)
    phase(s, 'movement', 'A')
    s.step = 'reinforcements'
    return s
  }
  // three models in a row hugging `edge`, centred at `along` (inches along that edge)
  const spot = (edge: Edge, along: number): [number, number][] => [-3.8, 0, 3.8].map((d): [number, number] => {
    if (edge === 'L') return [-hw + 2, along + d]
    if (edge === 'R') return [hw - 2, along + d]
    if (edge === 'T') return [along + d, -hh + 2]
    return [along + d, hh - 2]
  })
  const place = (s: GameState, pending: DeployUnitDecision, pts: [number, number][]): Action => ({
    type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
    placements: pending.context.unitIds.flatMap((u) => s.units[u].models).map((id, i) => ({ modelId: id, pos: { x: pts[i][0], y: 0, z: pts[i][1] }, facing: 0 })),
  })

  it('LEA-028 LEA-6.3: arrival legal wholly within 6" of a non-opponent edge; rejected on the opponent strip, mid-board and within 9" of enemies', () => {
    const s = reservesState(2)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([PIONEERS])
    const e = oppEdge(s)
    const v = (pts: [number, number][]) => movementModule.validate!(s, place(s, pending, pts), pending)
    expect(v(spot(opposite[e], 0))).toBeNull()                       // the player's own edge
    for (const side of sideEdges[e]) expect(v(spot(side, 0))).toBeNull() // a side edge, away from the opponent strip
    expect(v(spot(e, 0))).not.toBeNull()                             // the middle of the opponent's edge strip
    expect(v([[0, 6], [3, 6], [6, 6]])).not.toBeNull()               // inside the 6" inset
    const own = spot(opposite[e], 0)
    placeUnit(s, BOYZ, [[own[0][0], own[0][1] + (own[0][1] > 0 ? -5 : 5)]]) // an enemy 5" from the spot
    expect(v(own)).not.toBeNull()
  })

  it('LEA-028 LEA-6.3: the corner squares beside the opponent edge stay legal (they are within 6" of a side edge)', () => {
    const s = reservesState(2)
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    const e = oppEdge(s)
    const side = sideEdges[e][0]
    // slide a 3-model row along the side edge until it sits against the opponent's edge
    const toOpp = (e === 'L' || e === 'T' ? -1 : 1) * ((side === 'T' || side === 'B' ? hw : hh) - 6.5)
    expect(movementModule.validate!(s, place(s, pending, spot(side, toOpp)), pending)).toBeNull()
  })

  it('LEA-030 LEA-6.3: a Mag-Riders unit waits in plain Reserves (mandatory arrival) and arrival emits via strategicReserves', () => {
    const s = reservesState(2)
    expect(s.units[PIONEERS].location).toBe('reserves')
    expect(isTeleporting(s, PIONEERS)).toBe(true)
    expect(teleportState(s, 'A').pending[0].arrival).toEqual(MAG)
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    const e = oppEdge(s)
    s.pending = null
    expect(movementModule.handle(c.ctx, place(s, pending, spot(opposite[e], 0)), pending)).toBeUndefined()
    expect(s.units[PIONEERS].location).toBe('board')
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ unitId: PIONEERS, via: 'strategicReserves' })
    expect(isTeleporting(s, PIONEERS)).toBe(false)
    expect(s.units[PIONEERS].turn.arrivedThisTurn).toBe(true)
    expect(transportService.cannotChargeThisTurn(s, PIONEERS)).toBe(false) // Mag-Riders do not forbid the charge
  })

  it('LEA-029 LEA-6.3: arrival is allowed in round 4, the unit is not culled, and declining the set-up destroys it', () => {
    const s = reservesState(4)
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    expect(s.units[PIONEERS].location).toBe('reserves')
    expect(of(c.events, 'UnitLostInReserves').filter((e) => e.unitId === PIONEERS)).toHaveLength(0)
    const pending = s.pending as DeployUnitDecision
    s.pending = null
    const pass: Action = { type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: PIONEERS, placements: [], toReserves: true }
    expect(movementModule.handle(c.ctx, pass, pending)).toBeUndefined()
    expect(s.units[PIONEERS].location).toBe('destroyed')
    expect(teleportState(s, 'A').pending).toHaveLength(0)
  })

  it('E2: a record without opts keeps the Teleport Assault geometry (anywhere, more than 9" from enemies, via teleportAssault)', () => {
    const s = makeState({ round: 2 })
    s.board = { ...s.board, pieces: {} }
    placeUnit(s, PIONEERS, { x: -10, z: -6, gap: 0.5 }); placeUnit(s, BOYZ, { x: 18, z: 8, gap: 0.3 })
    phase(s, 'command', 'B')
    removeUnitToReserves(ctxOf(s).ctx, PIONEERS, 'gk.a.teleport-assault')
    expect(teleportState(s, 'A').pending[0]).toEqual({ unitId: PIONEERS, removedRound: 2, removedInTurnOf: 'B', source: 'gk.a.teleport-assault' })
    phase(s, 'movement', 'A'); s.step = 'reinforcements'
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    const mid: [number, number][] = [[-9, 0], [-5.2, 0], [-1.4, 0]]
    expect(movementModule.validate!(s, place(s, pending, mid), pending)).toBeNull() // mid-board is fine for Deep Strike geometry
    s.pending = null
    movementModule.handle(c.ctx, place(s, pending, mid), pending)
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ via: 'teleportAssault' })
    expect(transportService.cannotChargeThisTurn(s, PIONEERS)).toBe(false)
  })

  it('E2: minEnemyGap is honoured and forbidChargeOnArrival blocks a charge declaration in the arrival turn', () => {
    const s = reservesState(2, { minEnemyGap: 12, forbidChargeOnArrival: true })
    const c = ctxOf(s)
    movementModule.advance(c.ctx)
    const pending = s.pending as DeployUnitDecision
    // the Boyz stand at x -2..: a mid-board row 10" away would pass at 9" but not at 12"
    const near: [number, number][] = [[8, 0], [11.8, 0], [15.6, 0]]
    expect(movementModule.validate!(s, place(s, pending, near), pending)).not.toBeNull()
    const far: [number, number][] = [[16, -3.8], [16, 0], [16, 3.8]]
    expect(movementModule.validate!(s, place(s, pending, far), pending)).toBeNull()
    s.pending = null
    movementModule.handle(c.ctx, place(s, pending, far), pending)
    expect(transportService.cannotChargeThisTurn(s, PIONEERS)).toBe(true)
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ via: 'teleportAssault' })
  })

  it('E2: magRidersArrivalConstraints = whole board minus the 6" inset and the opponent strip, min enemy gap as given', () => {
    const s = makeState()
    const c = magRidersArrivalConstraints(s, 'A', 9)
    expect(c.minDistanceFromEnemies).toBe(9)
    expect(c.forbidden).toHaveLength(2)
    expect(c.coherency).toBe(false)
  })
})

// =====================================================================================================================
describe('E3 Deploy Armies pick window (LEA-4.1)', () => {
  type Missions = EngineContext['services']['missions']
  function deploymentState(onWindow: (real: Missions, calls: string[]) => Missions['onWindow']): { s: GameState; ctx: EngineContext; calls: string[] } {
    const s = makeState({ attacker: 'B' })
    s.phase = 'deployment'
    s.round = 0
    s.phaseState = emptyPhaseState()
    s.step = 'deploy'
    const ctx = ctxOf(s, []).ctx
    const calls: string[] = []
    const real = ctx.services.missions
    ;(ctx as { services: unknown }).services = { ...ctx.services, missions: { ...real, onWindow: onWindow(real, calls) } }
    return { s, ctx, calls }
  }
  const answer = (ctx: EngineContext, optionId: string): void => {
    const pending = ctx.state.pending as ChooseOptionDecision
    ctx.state.pending = null
    const rej = setupModule.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
    if (rej) throw new Error(`${rej.code} ${rej.reason}`)
  }
  const isSquadOffer = (p: PendingDecision | null): boolean => !!p && p.kind === 'chooseOption' && (p.context.data as { choice?: string }).choice === 'patrolSquads'

  it('LEA-017 LEA-4.1: the pick window opens once, after Patrol Squads and before the first deployUnit', () => {
    const { s, ctx, calls } = deploymentState((real, c) => (cx, w, k) => { c.push(`${w}|${k}`); real.onWindow(cx, w, k) })
    expect(setupModule.advance(ctx)).toBe('pending')
    expect(isSquadOffer(s.pending)).toBe(true)
    expect(calls).toEqual([]) // not before Declare Battle Formations is done
    for (let i = 0; i < 6 && (s.pending === null || isSquadOffer(s.pending)); i++) {
      if (s.pending === null) setupModule.advance(ctx); else answer(ctx, 'keep')
    }
    // the real pick (Toil Earns, raised by the faction hook) or, without one, the first deployUnit - never a deployUnit first
    expect(calls).toEqual(['deployment.unit|deployArmies'])
    if (s.pending?.kind === 'chooseOption') {
      expect(s.pending.context.topic).toBe('abilityChoice')
      expect((s.pending.context.data as { code?: string }).code).toBe('toilEarnsPick')
    } else expect(s.pending?.kind).toBe('deployUnit')
    s.pending = null // the pick answered
    expect(setupModule.advance(ctx)).toBe('pending')
    expect((s.pending as PendingDecision | null)?.kind).toBe('deployUnit')
    expect(calls).toHaveLength(1) // re-entering never reopens the window
  })

  it('LEA-017 LEA-4.1: a decision raised by the window pauses setup before any deployUnit; once answered setup resumes without reopening it', () => {
    let raised = 0
    const { s, ctx } = deploymentState(() => (cx) => {
      raised++
      cx.decide({
        kind: 'chooseOption', player: 'A', window: 'deployment.unit', canPass: false,
        context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { code: 'toilEarnsPick' } },
        options: [{ id: 'obj', label: 'obj', action: { type: 'chooseOption', player: 'A', decisionId: '', optionId: 'obj' } }],
      })
    })
    for (let i = 0; i < 6 && (s.pending === null || isSquadOffer(s.pending)); i++) {
      if (s.pending === null) setupModule.advance(ctx); else answer(ctx, 'keep')
    }
    expect((s.pending as ChooseOptionDecision).context.topic).toBe('abilityChoice')
    expect(raised).toBe(1)
    s.pending = null // the pick answered
    expect(setupModule.advance(ctx)).toBe('pending')
    expect(raised).toBe(1)
    expect((s.pending as PendingDecision | null)?.kind).toBe('deployUnit')
  })
})
