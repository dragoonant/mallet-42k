// Drukhari: engine changes beyond code hooks (docs/spec/factions/drukhari.md 7.1, items E1-E3; checklist DRU-*).
// E1 Pain token pool (pain.ts), E2 single-failure invulnerable save (fragile-invuln.ts + attack.ts), E3 attached
// Leader + bodyguard embark / disembark as one unit (transports.ts, movement.ts, state.ts). Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGame, createGameState, emptyPhaseState, legalActions, step,
  type Action, type EngineContext, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { fragileInvulnLost, hasFragileInvuln } from '../../src/engine/fragile-invuln'
import { gainPainToken, hasPowerFromPain, isEmpowered, painTokens, spendPainToken, startBattlePain } from '../../src/engine/pain'
import { disembarkCandidates, movementModule, offerEmbark } from '../../src/engine/phases/movement'
import { firingDeckWeapons } from '../../src/engine/phases/shooting'
import { setupModule } from '../../src/engine/setup'
import { setModelPos } from '../../src/engine/state'
import { passengerHalves, transportService } from '../../src/engine/transports'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DRK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Drukhari', faction: 'drukhari', patrolId: 'drk.cp.blades-of-torment', enhancementId: 'drk.e.shudderworm-bottle', secondaryId: 'drk.sec.rapacious-raiders',
  attachments: [{ leaderRef: 'archon', bodyguardRef: 'kabalites' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
// A = Drukhari, B = Orks (unit ids A:archon, A:kabalites (canonical), A:incubi, A:raider, A:ravager / B:boyz-a ...)
const ARCHON = 'A:archon', KAB = 'A:kabalites', RAIDER = 'A:raider', INCUBI = 'A:incubi'
const BOYZ = 'B:boyz-a'

function setupOf(a: PlayerSetup, b: PlayerSetup): GameSetup {
  return { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: a, B: b }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
}
function makeState(phase: GameState['phase'] = 'movement', a: Partial<PlayerSetup> = {}): GameState {
  const s = createGameState(setupOf(DRK(a), ORK()), bundle, 'drk-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.firstPlayer = 'A'
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
const noStrats = (): ModuleTable => ({ ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: { ...DEFAULT_MODULES.services.stratagems, offered: () => [] } as never } })
function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }

// ===================================================================================================================
// E1 Pain token pool
// ===================================================================================================================
describe('E1 Pain token pool (DRU-003)', () => {
  it('DRU-003 DRU-2.1: hasPowerFromPain is true for a Drukhari player only; the opponent has no pool', () => {
    const s = makeState()
    expect(hasPowerFromPain(s, 'A')).toBe(true)
    expect(hasPowerFromPain(s, 'B')).toBe(false)
    expect(painTokens(s, 'A')).toBe(0)
  })

  it('DRU-003 DRU-2.1: startBattlePain gives one token to each Drukhari player; a non-Drukhari player gets no key at all', () => {
    const s = makeState()
    const { ctx, events } = ctxOf(s)
    startBattlePain(ctx)
    expect(painTokens(s, 'A')).toBe(1)
    expect(painTokens(s, 'B')).toBe(0)
    expect('painTokens' in s.players.B.secondaryState).toBe(false)
    const msg = events.find((e) => e.type === 'AbilityTriggered') as { abilityId: string; summary: string }
    expect(msg.abilityId).toBe('drk.a.power-from-pain')
    expect(msg.summary).toContain('battleStart')
  })

  it('DRU-003 DRU-2.1: mirror match - each player keeps an independent pool', () => {
    const s = createGameState(setupOf(DRK(), DRK({ attachments: [] })), bundle, 'drk-mirror', ENGINE_VERSION)
    const { ctx } = ctxOf(s)
    startBattlePain(ctx)
    expect([painTokens(s, 'A'), painTokens(s, 'B')]).toEqual([1, 1])
    gainPainToken(ctx, 'A', 'unitDestroyed')
    expect([painTokens(s, 'A'), painTokens(s, 'B')]).toEqual([2, 1])
    // A's own unit destroyed: B (the opponent) gains, A does not
    ctx.emit({ type: 'UnitDestroyed', unitId: KAB, byPlayer: 'B', byUnitId: null, byModelId: null, kind: 'ranged', player: 'A' })
    expect([painTokens(s, 'A'), painTokens(s, 'B')]).toEqual([2, 2])
  })

  it('DRU-003 DRU-2.1: an enemy unit destroyed earns a token; each half of an attached unit counts; own losses and a non-Drukhari opponent earn nothing', () => {
    const s = createGameState(setupOf(ORK(), DRK()), bundle, 'drk-gain', ENGINE_VERSION) // A = Orks, B = Drukhari (attached Archon + Kabalites)
    const { ctx } = ctxOf(s)
    // enemy (Ork) unit destroyed -> Drukhari B gains
    ctx.emit({ type: 'UnitDestroyed', unitId: 'A:boyz-a', byPlayer: 'B', byUnitId: null, byModelId: null, kind: 'ranged', player: 'A' })
    expect(painTokens(s, 'B')).toBe(1)
    expect(painTokens(s, 'A')).toBe(0)
    // Drukhari's own unit destroyed -> the Ork opponent has no pool, nothing for the Drukhari either
    ctx.emit({ type: 'UnitDestroyed', unitId: 'B:raider', byPlayer: 'A', byUnitId: null, byModelId: null, kind: 'ranged', player: 'B' })
    expect(painTokens(s, 'B')).toBe(1)
    expect('painTokens' in s.players.A.secondaryState).toBe(false)
  })

  it('DRU-003 DRU-2.1: each half of a destroyed attached enemy unit counts (two tokens)', () => {
    const s = createGameState(setupOf(DRK(), DRK({ attachments: [{ leaderRef: 'archon', bodyguardRef: 'kabalites' }] })), bundle, 'drk-halves', ENGINE_VERSION)
    const { ctx } = ctxOf(s)
    ctx.emit({ type: 'UnitDestroyed', unitId: 'B:archon', byPlayer: 'A', byUnitId: null, byModelId: null, kind: 'melee', player: 'B' })
    ctx.emit({ type: 'UnitDestroyed', unitId: 'B:kabalites', byPlayer: 'A', byUnitId: null, byModelId: null, kind: 'melee', player: 'B' })
    expect(painTokens(s, 'A')).toBe(2)
    expect(painTokens(s, 'B')).toBe(0)
  })

  it('DRU-003 DRU-2.1: an enemy failing a Battle-shock test earns a token; an enemy passing one does not; own failure does not', () => {
    const s = makeState()
    const { ctx } = ctxOf(s)
    ctx.emit({ type: 'BattleShockTested', unitId: BOYZ, roll: 4, ld: 7, passed: false, player: 'B' })
    expect(painTokens(s, 'A')).toBe(1)
    ctx.emit({ type: 'BattleShockTested', unitId: BOYZ, roll: 9, ld: 7, passed: true, player: 'B' })
    expect(painTokens(s, 'A')).toBe(1)
    ctx.emit({ type: 'BattleShockTested', unitId: KAB, roll: 2, ld: 6, passed: false, player: 'A' })
    expect(painTokens(s, 'A')).toBe(1)
    expect('painTokens' in s.players.B.secondaryState).toBe(false)
  })

  it('DRU-004 DRU-2.2: spendPainToken decrements, records the canonical unit as Empowered for this phase only, and refuses at 0', () => {
    const s = makeState('shooting')
    const { ctx } = ctxOf(s)
    expect(spendPainToken(ctx, 'A', KAB)).toBe(false) // empty pool: no change
    expect(isEmpowered(s, KAB)).toBe(false)
    gainPainToken(ctx, 'A', 'unitDestroyed')
    gainPainToken(ctx, 'A', 'unitDestroyed')
    expect(spendPainToken(ctx, 'A', ARCHON)).toBe(true) // the Leader half spends: the canonical (bodyguard) id is recorded
    expect(painTokens(s, 'A')).toBe(1)
    expect(isEmpowered(s, KAB)).toBe(true)
    expect(isEmpowered(s, ARCHON)).toBe(true) // sameUnit compare: either half is Empowered
    expect(isEmpowered(s, RAIDER)).toBe(false)
    expect(spendPainToken(ctx, 'A', RAIDER)).toBe(true)
    expect(isEmpowered(s, RAIDER)).toBe(true)
    expect(isEmpowered(s, KAB)).toBe(true) // both recorded in the one phase record
    // the record is stale as soon as the phase changes
    s.phase = 'charge'
    expect(isEmpowered(s, KAB)).toBe(false)
    s.phase = 'shooting'
    s.activePlayer = 'B'
    expect(isEmpowered(s, KAB)).toBe(false)
  })

  it('DRU-027 E1: a Drukhari battle reaches round 1 with one token each side that has the ability; a non-Drukhari battle creates no key', () => {
    const drive = (a: PlayerSetup, b: PlayerSetup): GameState => {
      let r = createGame(setupOf(a, b), 'drk-r1', bundle)
      let guard = 0
      while (r.state.round < 1 && guard++ < 400) {
        const pending = r.state.pending as PendingDecision | null
        if (!pending) break
        const acts = legalActions(r.state, pending)
        if (!acts || acts.length === 0) break
        r = step(r.state, acts[0] as Action)
      }
      return r.state
    }
    const s = drive(DRK(), ORK())
    expect(s.round).toBeGreaterThanOrEqual(1)
    expect(painTokens(s, 'A')).toBe(1)
    expect('painTokens' in s.players.B.secondaryState).toBe(false)
    const o = drive(ORK(), ORK())
    expect(o.round).toBeGreaterThanOrEqual(1)
    expect('painTokens' in o.players.A.secondaryState).toBe(false)
    expect('painTokens' in o.players.B.secondaryState).toBe(false)
  })

  it('DRU-027 E1: same seed + same actions give the same hash with the pool in secondaryState', () => {
    const run = (): string => {
      let r = createGame(setupOf(DRK(), ORK()), 'drk-hash', bundle)
      for (let i = 0; i < 60; i++) {
        const pending = r.state.pending as PendingDecision | null
        if (!pending) break
        const acts = legalActions(r.state, pending)
        if (!acts || acts.length === 0) break
        r = step(r.state, acts[0] as Action)
      }
      return r.state.hash
    }
    expect(run()).toBe(run())
    expect(DATA_VERSION).toBeTruthy()
  })
})

// ===================================================================================================================
// E2 single-failure invulnerable save (Shadowfield)
// ===================================================================================================================
describe('E2 Shadowfield single-failure invulnerable save (DRU-020)', () => {
  // A = Orks (a Boy fires a slugga: BS5+, S4 AP0 D1), B = Drukhari Archon alone (T3, Sv4+, invuln 2+, W4)
  const ARC = 'B:archon'
  function shoot(s: GameState, ctx: EngineContext): void {
    const boy = s.units['A:boyz-a'].models[0]
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:boyz-a', overwatch: false, targets: [{ modelId: boy, weaponId: 'ork.w.slugga', targetUnitId: ARC, profileGroup: null, attacks: null }] })
    for (let i = 0; i < 40; i++) {
      if (attackService.advance(ctx) === 'done') break
      const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }> | null
      if (!p) break
      s.pending = null
      attackService.handler.handle(ctx, { ...p.options[0].action, decisionId: p.id } as Action, p as PendingDecision)
    }
  }
  function archonState(): GameState {
    const s = createGameState(setupOf(ORK(), DRK({ attachments: [] })), bundle, 'drk-sf', ENGINE_VERSION)
    s.round = 2; s.activePlayer = 'A'; s.firstPlayer = 'A'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    placeUnit(s, 'A:boyz-a', [[-6, 0]])
    placeUnit(s, ARC, [[0, 0]])
    return s
  }
  const lastSave = (events: { type: string }[]) => [...events].reverse().find((e) => e.type === 'SaveRolled') as { kind: string; saved: boolean; needed: number } | undefined
  const saveRolls = (events: { type: string }[]) => (events.filter((e) => e.type === 'DiceRolled') as unknown as { roll: { purpose: string; commandRerollable: boolean } }[]).filter((e) => e.roll.purpose === 'save')

  it('DRU-020 DRU-6.1: the Archon datasheet carries the Shadowfield code; an ordinary model does not', () => {
    const s = archonState()
    expect(hasFragileInvuln(s, s.units[ARC].models[0])).toBe(true)
    expect(hasFragileInvuln(s, s.units['A:boyz-a'].models[0])).toBe(false)
    expect(fragileInvulnLost(s, s.units[ARC].models[0])).toBe(false)
  })

  it('DRU-020 DRU-6.1: invulnerable 2+ is used against AP 0; a passed invuln save keeps it and may not be Command Re-rolled', () => {
    const s = archonState()
    const { ctx, events } = ctxOf(s, [6, 6, 4], noStrats())
    shoot(s, ctx)
    const save = lastSave(events)!
    expect(save.kind).toBe('invuln')
    expect(save.saved).toBe(true)
    expect(saveRolls(events).every((e) => e.roll.commandRerollable === false)).toBe(true)
    expect(fragileInvulnLost(s, s.units[ARC].models[0])).toBe(false)
  })

  it('DRU-020 DRU-6.1: the first failed invuln save is not re-rollable and collapses the field for the rest of the battle', () => {
    const s = archonState()
    const { ctx, events } = ctxOf(s, [6, 6, 1], noStrats())
    shoot(s, ctx)
    const save = lastSave(events)!
    expect(save.kind).toBe('invuln')
    expect(save.saved).toBe(false)
    expect(saveRolls(events)[0].roll.commandRerollable).toBe(false)
    expect(fragileInvulnLost(s, s.units[ARC].models[0])).toBe(true)
    expect(s.players.B.oncePerBattleUsed).toContain(`shadowfield:lost:${s.units[ARC].models[0]}`)
    const lost = events.find((e) => e.type === 'AbilityTriggered' && (e as { summary: string }).summary.includes('invulnerable save lost')) as { summary: string } | undefined
    expect(lost).toBeTruthy()
  })

  it('DRU-020 DRU-6.1: after the collapse later saves use Sv 4+ (re-rollable again), so a roll of 2 fails and a 4 passes', () => {
    const s = archonState()
    s.players.B.oncePerBattleUsed.push(`shadowfield:lost:${s.units[ARC].models[0]}`)
    const a = ctxOf(s, [6, 6, 2], noStrats())
    shoot(s, a.ctx)
    const failed = lastSave(a.events)!
    expect(failed.kind).toBe('armour')
    expect(failed.needed).toBe(4)
    expect(failed.saved).toBe(false)
    expect(saveRolls(a.events)[0].roll.commandRerollable).toBe(true)

    const s2 = archonState()
    s2.players.B.oncePerBattleUsed.push(`shadowfield:lost:${s2.units[ARC].models[0]}`)
    const b = ctxOf(s2, [6, 6, 4], noStrats())
    shoot(s2, b.ctx)
    expect(lastSave(b.events)!.saved).toBe(true)
  })

  it('DRU-020 DRU-6.1: a model lacking the code keeps its normal re-rollable saves (no regression for other factions)', () => {
    const s = createGameState(setupOf(DRK({ attachments: [] }), ORK()), bundle, 'drk-sf2', ENGINE_VERSION)
    s.round = 2; s.activePlayer = 'B'; s.firstPlayer = 'B'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    placeUnit(s, 'B:boyz-a', [[-6, 0]])
    placeUnit(s, KAB, [[0, 0]])
    const { ctx, events } = ctxOf(s, [6, 6, 2], noStrats())
    const boy = s.units['B:boyz-a'].models[0]
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'B:boyz-a', overwatch: false, targets: [{ modelId: boy, weaponId: 'ork.w.slugga', targetUnitId: KAB, profileGroup: null, attacks: null }] })
    for (let i = 0; i < 40; i++) {
      if (attackService.advance(ctx) === 'done') break
      const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }> | null
      if (!p) break
      s.pending = null
      attackService.handler.handle(ctx, { ...p.options[0].action, decisionId: p.id } as Action, p as PendingDecision)
    }
    expect(saveRolls(events)[0].roll.commandRerollable).toBe(true)
  })
})

// ===================================================================================================================
// E3 attached Leader + bodyguard in a transport
// ===================================================================================================================
describe('E3 attached unit in a transport (DRU-019)', () => {
  it('DRU-019 E3: passengerHalves returns canonical first for an attached pair and [id] for a plain unit', () => {
    const s = makeState()
    expect(passengerHalves(s, KAB)).toEqual([KAB, ARCHON])
    expect(passengerHalves(s, ARCHON)).toEqual([KAB, ARCHON])
    expect(passengerHalves(s, INCUBI)).toEqual([INCUBI])
  })

  it('DRU-019 E3: canCarry sums both halves (Archon + 10 Kabalites = 11 fit the Raider; plus Incubi do not) and checks keywords on each half', () => {
    const s = makeState()
    expect(transportService.canCarry(s, KAB, RAIDER)).toBe(true)
    expect(transportService.canCarry(s, ARCHON, RAIDER)).toBe(true) // either id names the same unit
    expect(transportService.canCarry(s, INCUBI, RAIDER)).toBe(true) // 5 alone fit
    transportService.embark(s, KAB, RAIDER)
    expect(transportService.canCarry(s, INCUBI, RAIDER)).toBe(false) // 11 + 5 > 11
    expect(transportService.canCarry(s, KAB, RAIDER)).toBe(true) // re-evaluating the same passenger excludes itself
    expect(transportService.canCarry(s, 'A:ravager', RAIDER)).toBe(false) // not INFANTRY
  })

  it('DRU-019 E3: embark / disembark act on both halves, keep the attach link and record both phase keys', () => {
    const s = makeState()
    s.units[KAB].location = 'board'; s.units[ARCHON].location = 'board'
    transportService.embark(s, KAB, RAIDER)
    for (const id of [KAB, ARCHON]) {
      expect(s.units[id].location).toBe('reserves')
      expect(transportService.transportOf(s, id)).toBe(RAIDER)
    }
    expect(transportService.embarkedIn(s, RAIDER).sort()).toEqual([ARCHON, KAB])
    expect(s.units[KAB].attachedLeaderId).toBe(ARCHON)
    expect(s.units[ARCHON].bodyguardUnitId).toBe(KAB)
    expect(transportService.disembark(s, ARCHON)).toBe(RAIDER) // the Leader id works as well
    for (const id of [KAB, ARCHON]) {
      expect(transportService.transportOf(s, id)).toBeNull()
      expect(transportService.disembarkedThisPhase(s, id)).toBe(true)
    }
    expect(transportService.embarkedIn(s, RAIDER)).toEqual([])
    expect(s.units[KAB].attachedLeaderId).toBe(ARCHON) // link untouched
  })

  it('DRU-019 E3: a transport that made a Normal move carries both halves out as having Normal-moved (and unable to charge)', () => {
    const s = makeState()
    transportService.embark(s, KAB, RAIDER)
    s.phaseState = emptyPhaseState()
    s.phase = 'shooting' // a later phase than embarkation, so disembarking is legal
    s.units[RAIDER].turn.moveType = 'normal'
    transportService.disembark(s, KAB)
    for (const id of [KAB, ARCHON]) {
      expect(s.units[id].turn.moveType).toBe('normal')
      expect(transportService.cannotChargeThisTurn(s, id)).toBe(true)
    }
  })

  function atEnd(gapOf: (i: number) => number = () => 1.5) {
    const s = makeState()
    placeUnit(s, RAIDER, [[0, 0]])
    const r0 = s.models[s.units[RAIDER].models[0]].base.radius
    // two rows of Kabalites hugging the Raider, the Archon beside them
    const all = [...s.units[KAB].models, ...s.units[ARCHON].models]
    all.forEach((id, i) => {
      const m = s.models[id]
      setModelPos(m, { x: r0 + gapOf(i) + m.base.radius, y: 0, z: (i - 5) * (m.base.radius * 2 + 0.1) * 0.4 })
    })
    s.units[KAB].location = 'board'; s.units[ARCHON].location = 'board'
    s.units[KAB].turn.moveType = 'normal'; s.units[ARCHON].turn.moveType = 'normal'
    return s
  }

  it('DRU-019 E3: after a Normal move the attached pair is offered embark (all 11 models within 3") and both halves board together', () => {
    const s = atEnd()
    const { ctx } = ctxOf(s)
    expect(offerEmbark(ctx, KAB)).toBe(true)
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.options.map((o) => o.id)).toEqual([`embark:${RAIDER}`, 'stay'])
    s.pending = null
    const rej = movementModule.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: `embark:${RAIDER}` }, p as PendingDecision)
    expect(rej).toBeUndefined()
    for (const id of [KAB, ARCHON]) {
      expect(s.units[id].location).toBe('reserves')
      expect(transportService.transportOf(s, id)).toBe(RAIDER)
    }
  })

  it('DRU-019 E3: one Archon model 3.1" away -> the pair cannot embark (every model of every half must be within 3")', () => {
    const s = atEnd((i) => (i === 10 ? 3.1 : 1.5)) // index 10 = the Archon (listed after the 10 Kabalites)
    const { ctx } = ctxOf(s)
    expect(offerEmbark(ctx, KAB)).toBe(false)
    expect(transportService.canEmbark(s, KAB, RAIDER)).toBe(false)
  })

  it('DRU-019 E3 / DRU-017: canEmbarkOutOfMove ignores move type and arrival, but needs both on the board, in range, and not freshly disembarked', () => {
    const s = atEnd()
    s.units[KAB].turn.moveType = 'stationary'
    s.units[KAB].turn.arrivedThisTurn = true
    expect(transportService.canEmbark(s, KAB, RAIDER)).toBe(false) // a real move-embark is refused
    expect(transportService.canEmbarkOutOfMove(s, KAB, RAIDER)).toBe(true) // the stratagem embark is not a move
    expect(transportService.canEmbarkOutOfMove(s, KAB, KAB)).toBe(false)
    expect(transportService.canEmbarkOutOfMove(s, INCUBI, RAIDER)).toBe(false) // Incubi are in Reserves (not on the board)
    // out of range
    const m = s.models[s.units[ARCHON].models[0]]
    setModelPos(m, { x: 20, y: 0, z: 0 })
    expect(transportService.canEmbarkOutOfMove(s, KAB, RAIDER)).toBe(false)
    // capacity: bring the Incubi on the board next to the Raider, already 11 inside
    const s2 = atEnd()
    transportService.embark(s2, KAB, RAIDER)
    placeUnit(s2, INCUBI, [[0, 2.5]])
    expect(transportService.canEmbarkOutOfMove(s2, INCUBI, RAIDER)).toBe(false)
    // a unit that disembarked this phase may not embark again
    const s3 = atEnd()
    transportService.embark(s3, KAB, RAIDER)
    s3.phaseState = emptyPhaseState()
    s3.phase = 'movement'
    transportService.embark(s3, KAB, RAIDER)
    transportService.disembark(s3, KAB)
    for (const id of [KAB, ARCHON]) s3.units[id].location = 'board'
    expect(transportService.canEmbarkOutOfMove(s3, KAB, RAIDER)).toBe(false)
  })

  it('DRU-019 E3: the pair may start the battle embarked (setup), is not offered a deployment drop, and the attach link survives', () => {
    const s = createGameState(setupOf(DRK({ embarked: [{ unitRef: 'kabalites', transportRef: 'raider' }] }), ORK()), bundle, 'drk-e3', ENGINE_VERSION)
    for (const id of [KAB, ARCHON]) {
      expect(s.units[id].location).toBe('reserves')
      expect(transportService.transportOf(s, id)).toBe(RAIDER)
    }
    expect(s.units[KAB].attachedLeaderId).toBe(ARCHON)
    s.phase = 'deployment'; s.step = 'deploy'
    for (const u of Object.values(s.units)) if (u.player === 'B') s.phaseState.marks.push(`deployDrop:${u.id}`)
    const { ctx } = ctxOf(s)
    setupModule.advance(ctx)
    const p = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(p.kind).toBe('deployUnit')
    expect(p.context.unitIds).not.toContain(KAB)
    expect(p.context.unitIds).not.toContain(ARCHON)
    expect(p.context.unitIds).toContain(RAIDER)
  })

  it('DRU-019 E3: the leader side referenced as the passenger also starts embarked (either unitRef names the pair)', () => {
    const s = createGameState(setupOf(DRK({ embarked: [{ unitRef: 'archon', transportRef: 'raider' }] }), ORK()), bundle, 'drk-e3b', ENGINE_VERSION)
    expect(transportService.embarkedIn(s, RAIDER).sort()).toEqual([ARCHON, KAB])
  })

  describe('interactive disembark', () => {
    function movementWithRaider(raiderMove: 'normal' | 'advance' | null) {
      const s = makeState('movement', { embarked: [{ unitRef: 'kabalites', transportRef: 'raider' }] })
      placeUnit(s, RAIDER, [[-10, 0]])
      for (const id of Object.keys(s.units)) if (id.startsWith('B:')) s.units[id].location = 'reserves'
      placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
      s.units[RAIDER].turn.moveType = raiderMove
      const made = ctxOf(s, [], noStrats())
      movementModule.enter(made.ctx)
      return { s, ...made }
    }
    function answer(ctx: EngineContext, action: Omit<Action, 'decisionId' | 'player'> | Action): void {
      const pending = ctx.state.pending as PendingDecision
      const full = { player: pending.player, decisionId: pending.id, ...action } as Action
      const rej = movementModule.validate?.(ctx.state, full, pending)
      if (rej) throw new Error(`validate: ${rej.code} ${rej.reason}`)
      ctx.state.pending = null
      const h = movementModule.handle(ctx, full, pending)
      if (h) throw new Error(`handle: ${h.code} ${h.reason}`)
      movementModule.advance(ctx)
    }

    it('DRU-019 E3: the pair is one disembark candidate (the canonical id only)', () => {
      const { s } = movementWithRaider(null)
      expect(disembarkCandidates(s, 'A')).toEqual([KAB])
    })

    it('DRU-019 E3: disembarking places all 11 models together within 3" of the Raider, both halves land on the board, link kept', () => {
      const { s, ctx } = movementWithRaider(null)
      movementModule.advance(ctx)
      answer(ctx, { type: 'chooseUnitToActivate', unitId: KAB })
      const dep = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
      expect(dep.kind).toBe('deployUnit')
      expect(dep.context.unitIds).toEqual([KAB, ARCHON])
      const place = movementModule.legalActions!(s, dep)!.find((a) => a.type === 'deployUnit') as Extract<Action, { type: 'deployUnit' }>
      expect(place).toBeTruthy()
      expect(place.placements).toHaveLength(11)
      // a placement that leaves the Archon far from the Raider is rejected (every model wholly within 3")
      const far = { ...place, placements: place.placements.map((p) => (p.modelId === s.units[ARCHON].models[0] ? { ...p, pos: { ...p.pos, x: p.pos.x + 9 } } : p)) }
      expect(movementModule.validate!(s, far, dep)).not.toBeNull()
      // placing only the bodyguard (as the old single-unit flow did) is rejected
      const partial = { ...place, placements: place.placements.filter((p) => s.models[p.modelId].unitId === KAB) }
      expect(movementModule.validate!(s, partial, dep)).not.toBeNull()
      answer(ctx, place)
      for (const id of [KAB, ARCHON]) {
        expect(s.units[id].location).toBe('board')
        expect(transportService.transportOf(s, id)).toBeNull()
      }
      expect(s.units[KAB].attachedLeaderId).toBe(ARCHON)
      // the Raider has not moved: the pair now acts normally (declares its move) as the canonical unit
      const decl = s.pending as Extract<PendingDecision, { kind: 'declareMove' }>
      expect(decl.kind).toBe('declareMove')
      expect(decl.context.unitId).toBe(KAB)
    })

    it('DRU-019 E3: Raider already Normal-moved -> both halves count as Normal-moved, are done, and cannot charge', () => {
      const { s, ctx } = movementWithRaider('normal')
      movementModule.advance(ctx)
      answer(ctx, { type: 'chooseUnitToActivate', unitId: KAB })
      const dep = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
      answer(ctx, movementModule.legalActions!(s, dep)!.find((a) => a.type === 'deployUnit')!)
      for (const id of [KAB, ARCHON]) {
        expect(s.units[id].location).toBe('board')
        expect(s.units[id].turn.moveType).toBe('normal')
        expect(transportService.cannotChargeThisTurn(s, id)).toBe(true)
      }
      expect(s.phaseState.activated).toContain(KAB)
    })

    it('DRU-019 E3: declining the disembark keeps both halves embarked and not offered again', () => {
      const { s, ctx } = movementWithRaider(null)
      movementModule.advance(ctx)
      answer(ctx, { type: 'chooseUnitToActivate', unitId: KAB })
      answer(ctx, { type: 'pass' })
      for (const id of [KAB, ARCHON]) expect(transportService.transportOf(s, id)).toBe(RAIDER)
      expect(disembarkCandidates(s, 'A')).toEqual([])
    })

    it('DRU-019 E3: a Raider that Advanced lets nobody out', () => {
      const { s } = movementWithRaider('advance')
      expect(disembarkCandidates(s, 'A')).toEqual([])
    })
  })

  it('DRU-019 E3 / DRU-023: Firing Deck lists the weapons of both embarked halves (Archon pistol included)', () => {
    const s = makeState('shooting', { embarked: [{ unitRef: 'kabalites', transportRef: 'raider' }] })
    placeUnit(s, RAIDER, [[0, 0]])
    const deck = firingDeckWeapons(s, RAIDER)
    const owners = new Set(deck.map((d) => s.models[d.modelId].unitId))
    expect(owners).toEqual(new Set([KAB, ARCHON]))
    expect(deck.some((d) => d.modelId === s.units[ARCHON].models[0])).toBe(true)
    expect(deck.length).toBe(11)
  })

  it('DRU-019 E3: Raider destroyed with the pair aboard -> both halves emergency-disembark together, Battle-shocked, link kept, no charge', () => {
    const s = makeState('shooting', { embarked: [{ unitRef: 'kabalites', transportRef: 'raider' }] })
    s.activePlayer = 'B'
    placeUnit(s, RAIDER, [[0, 0]])
    placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
    // Deadly Demise trigger die 1 (nothing), then 11 passenger dice: one 1 (a mortal wound), the rest 6
    const { ctx, events } = ctxOf(s, [1, 1, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6])
    attackService.destroyModel(ctx, s.units[RAIDER].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
    expect(s.units[RAIDER].location).toBe('destroyed')
    expect(events.filter((e) => e.type === 'AbilityTriggered' && (e as { abilityId: string }).abilityId === 'transport.emergencyDisembark')).toHaveLength(1)
    for (const id of [KAB, ARCHON]) {
      expect(s.units[id].location).toBe('board')
      expect(transportService.transportOf(s, id)).toBeNull()
      expect(s.units[id].battleShocked).toBe(true)
      expect(s.units[id].turn.moveType).toBe('normal')
      expect(transportService.cannotChargeThisTurn(s, id)).toBe(true)
    }
    expect(s.units[KAB].models).toHaveLength(10)
    expect(s.units[ARCHON].models).toHaveLength(1)
    expect(s.units[KAB].attachedLeaderId).toBe(ARCHON)
    expect(s.phaseState.attack?.mortalQueue.some((q) => q.targetUnitId === KAB && q.count === 1)).toBe(true)
  })

  it('DRU-019 E3: an unattached unit (Incubi) still embarks and disembarks as a single record (regression)', () => {
    const s = makeState('movement', { embarked: [{ unitRef: 'incubi', transportRef: 'raider' }] })
    expect(transportService.embarkedIn(s, RAIDER)).toEqual([INCUBI])
    expect(passengerHalves(s, INCUBI)).toEqual([INCUBI])
    expect(transportService.disembark(s, INCUBI)).toBe(RAIDER)
    expect(transportService.embarkedIn(s, RAIDER)).toEqual([])
  })
})
