// Death Guard: The Shambling Horde (docs/spec/factions/death-guard.md, checklist DTG-*). Real Combat Patrol data; covers the (b) code
// hooks: Nurgle's Gift (Contagion Range), Walking Plague, Contaminate Ground, Spread the Blight, Harbingers of Despair,
// Curse of the Walking Pox, plus the AI-vs-AI playthrough (DTG-030). E1/E2 (DTG-012, 028, 029) live in death-guard-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, createGame, emptyPhaseState, legalActions, step, view,
  type Action, type AttackContext, type ChooseOptionDecision, type Decider, type DeclaredTarget, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerId, type PlayerSetup,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { attackService } from '../../src/engine/attack'
import { contagionRange, withinContagionOf } from '../../src/engine/factions/death-guard'
import { inCoherencyRange, withinEngagementRange } from '../../src/engine/geometry'
import { evaluateCondition, hookService } from '../../src/engine/hooks-impl'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { leaderService } from '../../src/engine/leaders'
import { missionService } from '../../src/engine/missions'
import { removeModel } from '../../src/engine/state'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DG = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Death Guard', faction: 'death-guard', patrolId: 'dg.cp.the-shambling-horde', enhancementId: 'dg.e.walking-plague',
  secondaryId: 'dg.sec.contaminate-ground',
  attachments: [{ leaderRef: 'typhus', bodyguardRef: 'poxwalkers-a' }, { leaderRef: 'grelch', bodyguardRef: 'plague-marines' }],
  reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const TYPHUS = 'A:typhus', POX = 'A:poxwalkers-a', POX_B = 'A:poxwalkers-b', POX_C = 'A:poxwalkers-c', MARINES = 'A:plague-marines', GRELCH = 'A:grelch'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss', KOPTAS = 'B:deffkoptas', DREAD = 'B:deff-dread'
const ALL_B = [BOYZ, BOYZ2, BOSS, KOPTAS, DREAD]

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mirror?: boolean; round?: number; phase?: GameState['phase']; active?: PlayerId }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DG(o.a), B: o.mirror ? DG({ name: 'Death Guard B', ...o.b }) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'death-guard', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'command'
  s.phaseState = emptyPhaseState()
  s.players.B.waaagh.used = true // keep the Ork Waaagh! pick out of the picks under test
  return s
}
function setPhase(s: GameState, p: GameState['phase'], active: PlayerId): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
}
function ctxOf(s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const SIXES = Array<number>(60).fill(6)
const ONES = Array<number>(60).fill(1)

function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
const pendingOption = (s: GameState): ChooseOptionDecision | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)

// every model of `unitId` stacked on one point (enough for distance tests)
const stack = (s: GameState, unitId: string, x: number, z: number): void => placeUnit(s, unitId, [[x, z]])
const baseRadius = (s: GameState, unitId: string): number => s.models[s.units[unitId].models[0]].base.radius
// the enemy unit's models sit `gap` inches (edge to edge) east of the DG unit stacked at the origin
function placeAtGap(s: GameState, mine: string, enemy: string, gap: number, z = 0): void {
  stack(s, mine, 0, z)
  stack(s, enemy, baseRadius(s, mine) + baseRadius(s, enemy) + gap, z)
}
const toughness = (s: GameState, unitId: string, base = 5): number =>
  hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'T' }, base)
// destroy `n` models of a unit without any attack (they land in destroyedModels like a real casualty)
function casualties(s: GameState, unitId: string, n: number): void {
  for (const id of [...s.units[unitId].models].slice(-n)) removeModel(s, id)
}
function killAll(ctx: EngineContext, unitId: string, byUnit: string, kind: 'melee' | 'ranged' = 'melee'): void {
  const s = ctx.state
  const by = { player: s.units[byUnit].player, unitId: byUnit, modelId: s.units[byUnit].models[0], kind }
  for (const id of [...s.units[unitId].models]) attackService.finishDestroy(ctx, id, by)
}

// ---------------------------------------------------------------------------------------------------------------------
describe('Nurgle\'s Gift: Contagion Range (DTG-2)', () => {
  it('DTG-004 Contagion Range is 3" in round 1, 6" in round 2 and 9" in rounds 3-5', () => {
    const s = makeState()
    stack(s, MARINES, 0, 0); stack(s, GRELCH, 0, 0)
    const ranges = [1, 2, 3, 4, 5].map((r) => { s.round = r; return contagionRange(s, MARINES) })
    expect(ranges).toEqual([3, 6, 9, 9, 9])
    // either half of an attached unit answers
    s.round = 2
    expect(contagionRange(s, GRELCH)).toBe(6)
    expect(contagionRange(s, 'A:nope')).toBe(0)
  })

  it('DTG-005 round 1: an enemy unit 2.9" away has T-1, 3.1" away keeps its Toughness', () => {
    const s = makeState({ round: 1 })
    placeAtGap(s, MARINES, BOYZ, 2.9)
    expect(leaderService.unitDistance(s, BOYZ, MARINES)).toBeCloseTo(2.9, 3)
    expect(toughness(s, BOYZ)).toBe(4)
    placeAtGap(s, MARINES, BOYZ, 3.1)
    expect(toughness(s, BOYZ)).toBe(5)
    expect(withinContagionOf(s, BOYZ, 'A')).toBe(false)
    s.round = 2
    expect(withinContagionOf(s, BOYZ, 'A')).toBe(true)
    expect(toughness(s, BOYZ)).toBe(4)
  })

  it('DTG-006 the penalty does not stack across three Death Guard units, and Toughness never drops below 1', () => {
    const s = makeState({ round: 3 })
    stack(s, MARINES, 0, 0); stack(s, GRELCH, 0, 0); stack(s, POX, 1, 0); stack(s, TYPHUS, 1, 0); stack(s, POX_B, 0, 1)
    stack(s, BOYZ, 3, 0)
    expect(toughness(s, BOYZ)).toBe(4)
    expect(toughness(s, BOYZ, 1)).toBe(1)
  })

  it('DTG-007 the aura is live: leaving the range restores Toughness at once; an attached enemy unit loses 1 T on both halves', () => {
    // mirror match: the opposing Typhus leads the opposing Poxwalkers (Poxwalkers T4, Typhus T6)
    const s = makeState({ round: 2, mirror: true })
    const EP = 'B:poxwalkers-a', ET = 'B:typhus'
    placeAtGap(s, MARINES, EP, 2)
    stack(s, ET, 0, 40) // the leader half is far away: the pair is still in range through the bodyguard half
    expect(toughness(s, EP, 4)).toBe(3)
    expect(toughness(s, ET, 6)).toBe(5)
    stack(s, EP, 20, 0)
    expect(toughness(s, EP, 4)).toBe(4)
    expect(toughness(s, ET, 6)).toBe(6)
    // the leader half alone in range also drags the bodyguard half down
    stack(s, ET, baseRadius(s, MARINES) + baseRadius(s, ET) + 2, 0)
    expect(toughness(s, EP, 4)).toBe(3)
    expect(toughness(s, ET, 6)).toBe(5)
  })

  it('DTG-008 units in Reserves project no Contagion Range, enemies in Reserves are never affected, friends are never affected', () => {
    const s = makeState({ round: 3 })
    placeAtGap(s, MARINES, BOYZ, 1)
    expect(toughness(s, BOYZ)).toBe(4)
    s.units[MARINES].location = 'reserves'; s.units[GRELCH].location = 'reserves'
    expect(contagionRange(s, MARINES)).toBe(0)
    expect(toughness(s, BOYZ)).toBe(5)
    // an enemy in Reserves is not within anything
    s.units[MARINES].location = 'board'; s.units[GRELCH].location = 'board'
    s.units[BOYZ].location = 'reserves'
    expect(withinContagionOf(s, BOYZ, 'A')).toBe(false)
    // friendly units are untouched by their own aura
    stack(s, POX_B, 1, 0)
    expect(toughness(s, POX_B, 4)).toBe(4)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Walking Plague (DTG-3)', () => {
  // Typhus leads POX (stacked at the origin); POX loses `lost` models; optional far enemy
  function plagueState(lost: number, round = 2): GameState {
    const s = makeState({ round })
    placeUnit(s, POX, { x: 0, z: 0, gap: 0.3 })
    stack(s, TYPHUS, -1, 0)
    for (const id of ALL_B) stack(s, id, 30, 15)
    casualties(s, POX, lost)
    return s
  }

  it('DTG-009 a D6 of 6 returns up to Starting Strength at full wounds, in coherency and clear of enemies', () => {
    const s = plagueState(4)
    const { ctx, events } = ctxOf(s, SIXES)
    // one enemy model close to the Poxwalkers: returned models must not newly end in its Engagement Range
    stack(s, BOYZ, 6, 6)
    expect(hookService.offerPicks(ctx, 'command.start', 'k')).toBe(true)
    const p = pendingOption(s) as ChooseOptionDecision
    expect(p.window).toBe('command.start')
    expect(p.options.map((o) => o.id)).toEqual([POX, 'decline'])
    answer(ctx, POX)
    expect(of(events, 'ModelReturned')).toHaveLength(4)
    expect(s.units[POX].models).toHaveLength(10)
    expect(s.units[POX].destroyedModels).toHaveLength(0)
    const live = s.units[POX].models.map((id) => s.models[id])
    expect(live.every((m) => m.woundsRemaining === 1)).toBe(true)
    const returned = new Set(of(events, 'ModelReturned').map((e) => e.modelId))
    for (const m of live.filter((x) => returned.has(x.id))) {
      expect(live.some((o) => o.id !== m.id && inCoherencyRange(m, o))).toBe(true)
      expect(s.units[BOYZ].models.some((id) => withinEngagementRange(m, s.models[id]))).toBe(false)
    }
    // the roll was a D6, so 3 casualties and a roll of 6 also stop at Starting Strength; a roll of 2 returns 2
    const t = plagueState(5)
    const c2 = ctxOf(t, [2])
    hookService.offerPicks(c2.ctx, 'command.start', 'k')
    answer(c2.ctx, POX)
    expect(t.units[POX].models).toHaveLength(7)
    expect(t.units[POX].destroyedModels).toHaveLength(3)
  })

  it('DTG-010 only damaged Poxwalkers within the bearer\'s Contagion Range are offered; no candidate means no decision; once per Command phase', () => {
    // full strength: nothing to return
    const full = plagueState(0)
    expect(hookService.offerPicks(ctxOf(full).ctx, 'command.start', 'k')).toBe(false)
    // POX_B is 12" from Typhus but the range in round 2 is 6"
    const far = plagueState(0)
    stack(far, POX_B, 12, 0)
    casualties(far, POX_B, 3)
    expect(hookService.offerPicks(ctxOf(far).ctx, 'command.start', 'k')).toBe(false)
    // round 3 range is 9": still out at 12", in at 6"
    far.round = 3
    expect(hookService.offerPicks(ctxOf(far).ctx, 'command.start', 'k')).toBe(false)
    stack(far, POX_B, 6, 0)
    const { ctx } = ctxOf(far, SIXES)
    expect(hookService.offerPicks(ctx, 'command.start', 'k')).toBe(true)
    expect((pendingOption(far) as ChooseOptionDecision).options.map((o) => o.id)).toEqual([POX_B, 'decline'])
    answer(ctx, POX_B)
    expect(far.units[POX_B].models).toHaveLength(10)
    // offered once: the same Command phase never asks again
    casualties(far, POX_B, 2)
    expect(hookService.offerPicks(ctx, 'command.start', 'k2')).toBe(false)
    // declining spends the offer too
    const d = plagueState(2)
    const dc = ctxOf(d).ctx
    hookService.offerPicks(dc, 'command.start', 'k')
    answer(dc, 'decline')
    expect(d.units[POX].models).toHaveLength(8)
    expect(hookService.offerPicks(dc, 'command.start', 'k')).toBe(false)
  })

  it('DTG-011 a model with no legal spot, and every return after it, is lost; a wholly destroyed unit cannot be picked', () => {
    // a lone Poxwalker ringed by enemy models just outside its own Engagement Range: every spot beside it would be newly engaged
    const s = makeState({ round: 2 })
    stack(s, TYPHUS, 0, 0)
    stack(s, POX, 0, 0)
    casualties(s, POX, 9)
    const ring = [...s.units[BOYZ].models, ...s.units[BOYZ2].models, ...s.units[BOSS].models.slice(0, 0)]
    s.units[BOYZ].location = 'board'; s.units[BOYZ2].location = 'board'
    ring.forEach((id, i) => {
      const a = (i / ring.length) * Math.PI * 2
      const m = s.models[id]
      m.pos = { x: Math.cos(a) * 2.9, y: 0, z: Math.sin(a) * 2.9 }
    })
    // Typhus takes the same square; move him out of the way so the ring stays the only constraint
    s.models[s.units[TYPHUS].models[0]].pos = { x: 0, y: 0, z: 0 }
    const { ctx, events } = ctxOf(s, SIXES)
    expect(hookService.offerPicks(ctx, 'command.start', 'k')).toBe(true)
    answer(ctx, POX)
    expect(of(events, 'ModelReturned')).toHaveLength(0)
    expect(s.units[POX].models).toHaveLength(1)
    expect(s.units[POX].destroyedModels).toHaveLength(9)

    // a wholly destroyed Poxwalkers unit is no longer on the battlefield and is never a candidate
    const t = plagueState(0)
    stack(t, POX_B, 3, 0)
    for (const id of [...t.units[POX_B].models]) removeModel(t, id)
    expect(t.units[POX_B].location).toBe('destroyed')
    expect(hookService.offerPicks(ctxOf(t).ctx, 'command.start', 'k')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Secondaries (DTG-4)', () => {
  function turnEnd(s: GameState, active: PlayerId = 'A'): number {
    s.phase = 'fight'; s.activePlayer = active; s.phaseState = emptyPhaseState()
    const before = s.players.A.vp
    missionService.onWindow(ctxOf(s).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }
  const nearCentre = (s: GameState, unitId: string, gap: number): void => stack(s, unitId, baseRadius(s, unitId) + gap, 0)

  it('DTG-013 Contaminate Ground: nothing in round 1; 3 VP from round 2 at 2.9", none at 3.1"; two units in still score 3', () => {
    const s = makeState({ round: 1 })
    nearCentre(s, MARINES, 2.9); stack(s, GRELCH, 3, 0)
    expect(turnEnd(s)).toBe(0)
    s.round = 2
    expect(turnEnd(s)).toBe(3)
    nearCentre(s, MARINES, 3.1); stack(s, GRELCH, 30, 0)
    expect(turnEnd(s)).toBe(0)
    nearCentre(s, MARINES, 2.9)
    nearCentre(s, POX_B, 1)
    expect(turnEnd(s)).toBe(3)
  })

  it('DTG-014 Contaminate Ground: a Battle-shocked unit (either half) does not count; the opponent\'s turn end scores nothing', () => {
    const s = makeState({ round: 2 })
    nearCentre(s, MARINES, 1); stack(s, GRELCH, 1, 0)
    s.units[MARINES].battleShocked = true
    expect(turnEnd(s)).toBe(0)
    s.units[MARINES].battleShocked = false
    s.units[GRELCH].battleShocked = true
    expect(turnEnd(s)).toBe(0)
    s.units[GRELCH].battleShocked = false
    expect(turnEnd(s, 'B')).toBe(0)
    expect(turnEnd(s, 'A')).toBe(3)
  })

  describe('Spread the Blight', () => {
    const blight = (o: Opts = {}) => makeState({ round: 2, phase: 'fight', ...o, a: { secondaryId: 'dg.sec.spread-the-blight', ...o.a } })
    const snapshot = (s: GameState): EngineContext => {
      const { ctx } = ctxOf(s, ONES)
      missionService.onWindow(ctx, 'fight.start', 'k')
      return ctx
    }

    it('DTG-015 an enemy unit within Contagion Range at the start of the phase, destroyed by a Death Guard unit, scores 2 VP; two kills score 4', () => {
      const s = blight()
      setPhase(s, 'fight', 'A')
      placeAtGap(s, POX_B, BOYZ, 4)
      stack(s, BOYZ2, baseRadius(s, POX_B) + baseRadius(s, BOYZ2) + 5, 0.2)
      const ctx = snapshot(s)
      const before = s.players.A.vp
      killAll(ctx, BOYZ, POX_B)
      expect(s.players.A.vp - before).toBe(2)
      killAll(ctx, BOYZ2, POX_B)
      expect(s.players.A.vp - before).toBe(4)
      expect(s.mission.scored.filter((x) => x.ruleId === 'spread-the-blight').map((x) => x.amount)).toEqual([2, 2])
      // the opponent's own kills never pay the Death Guard
      expect(s.players.B.vp).toBe(0)
    })

    it('DTG-016 a unit that was out of range or in Reserves at the start of the phase does not score, even if it is in range when it dies', () => {
      const s = blight()
      setPhase(s, 'fight', 'A')
      stack(s, POX_B, 0, 0)
      stack(s, BOYZ, 30, 0) // outside the 6" range when the phase starts
      s.units[BOYZ2].location = 'reserves'
      const ctx = snapshot(s)
      stack(s, BOYZ, baseRadius(s, POX_B) + baseRadius(s, BOYZ) + 2, 0) // walks into range afterwards
      stack(s, BOYZ2, baseRadius(s, POX_B) + baseRadius(s, BOYZ2) + 3, 0) // arrives from Reserves afterwards
      const before = s.players.A.vp
      killAll(ctx, BOYZ, POX_B)
      killAll(ctx, BOYZ2, POX_B)
      expect(s.players.A.vp - before).toBe(0)
    })

    it('DTG-015 a kill by a non-Death-Guard unit, or in a later phase than the snapshot, does not score', () => {
      const s = blight()
      setPhase(s, 'fight', 'A')
      placeAtGap(s, POX_B, BOYZ, 2)
      stack(s, BOYZ2, 40, 0)
      const ctx = snapshot(s)
      const before = s.players.A.vp
      // the Death Guard player's own unit credited with a kill on a unit that was not in the snapshot
      killAll(ctx, BOYZ2, POX_B)
      expect(s.players.A.vp - before).toBe(0)
      // phase changes without a fresh snapshot (as if a window were skipped): stale snapshots never pay
      s.phase = 'shooting'
      killAll(ctx, BOYZ, POX_B, 'ranged')
      expect(s.players.A.vp - before).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Harbingers of Despair (DTG-5)', () => {
  function useHarbingers(ctx: EngineContext, unitId: string): void {
    const s = ctx.state
    const opt = stratagemService.options(s, 'A', 'fight.start', {}).find((x) => x.stratagemId === 'dg.s.harbingers-of-despair' && x.targets.unitIds?.[0] === unitId)
    if (!opt) throw new Error(`Harbingers not offered for ${unitId}`)
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'fight.start', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    const act = { ...opt, decisionId: 'd:1' } as never
    expect(stratagemService.validate!(s, act, pending)).toBeNull()
    expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
  }

  it('DTG-018 every enemy unit in Engagement Range takes one Battle-shock test (an attached pair once); not offered when not engaged', () => {
    const s = makeState({ round: 2, phase: 'fight', mirror: true })
    const EP = 'B:poxwalkers-a', ET = 'B:typhus', EP2 = 'B:poxwalkers-b'
    setPhase(s, 'fight', 'A')
    s.players.A.cp = 3
    stack(s, POX_B, 0, 0)
    const r = baseRadius(s, POX_B) + baseRadius(s, EP) + 0.5
    stack(s, EP, r, 0)
    stack(s, ET, r, 1.2) // the attached leader half, also in Engagement Range
    stack(s, EP2, -r, 0)
    stack(s, POX_C, -25, -25) // not engaged: no Harbingers target
    const { ctx, events } = ctxOf(s, SIXES)
    const offered = stratagemService.options(s, 'A', 'fight.start', {}).filter((x) => x.stratagemId === 'dg.s.harbingers-of-despair').map((x) => x.targets.unitIds?.[0])
    expect(offered).toContain(POX_B)
    expect(offered).not.toContain(POX_C)
    useHarbingers(ctx, POX_B)
    const tested = of(events, 'BattleShockTested')
    expect(tested.map((x) => x.unitId).sort()).toEqual([EP, EP2].sort())
    expect(s.players.A.cp).toBe(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Curse of the Walking Pox (DTG-6.4)', () => {
  function curseState(lost: number): { s: GameState; ctx: EngineContext; events: GameEvent[] } {
    const s = makeState({ round: 2, phase: 'fight' })
    setPhase(s, 'fight', 'A')
    placeUnit(s, POX, { x: 0, z: 0, gap: 0.3 })
    stack(s, TYPHUS, -1, 0)
    stack(s, BOYZ, 2, 5); stack(s, DREAD, 4, 8); stack(s, KOPTAS, 6, 8)
    for (const id of [BOYZ2, BOSS]) stack(s, id, 30, 20)
    casualties(s, POX, lost)
    return { s, ...ctxOf(s, ONES) }
  }
  const by = (s: GameState, unitId: string) => ({ player: 'A' as const, unitId, modelId: s.units[unitId].models[0], kind: 'melee' as const })

  it('DTG-023 a Poxwalker kill of an enemy INFANTRY model returns one destroyed model at full wounds, up to Starting Strength', () => {
    const { s, ctx, events } = curseState(3)
    attackService.finishDestroy(ctx, s.units[BOYZ].models[0], by(s, POX))
    expect(of(events, 'ModelReturned')).toHaveLength(1)
    expect(s.units[POX].models).toHaveLength(8)
    expect(s.models[of(events, 'ModelReturned')[0].modelId].woundsRemaining).toBe(1)
    attackService.finishDestroy(ctx, s.units[BOYZ].models[0], by(s, POX))
    attackService.finishDestroy(ctx, s.units[BOYZ].models[0], by(s, POX))
    expect(s.units[POX].models).toHaveLength(10)
    // at Starting Strength nothing more returns
    attackService.finishDestroy(ctx, s.units[BOYZ].models[0], by(s, POX))
    expect(of(events, 'ModelReturned')).toHaveLength(3)
    expect(s.units[POX].models).toHaveLength(10)
  })

  it('DTG-024 a VEHICLE or MONSTER kill returns nothing; Typhus\'s own kill does return a Poxwalker; an enemy kill of its own model does not', () => {
    const { s, ctx, events } = curseState(3)
    attackService.finishDestroy(ctx, s.units[DREAD].models[0], by(s, POX))
    expect(of(events, 'ModelReturned')).toHaveLength(0)
    expect(s.units[POX].models).toHaveLength(7)
    attackService.finishDestroy(ctx, s.units[BOYZ].models[0], by(s, TYPHUS))
    expect(of(events, 'ModelReturned')).toHaveLength(1)
    expect(s.units[POX].models).toHaveLength(8)
    // an Ork killing a Death Guard model gives the Death Guard nothing
    attackService.finishDestroy(ctx, s.units[POX].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'melee' })
    expect(of(events, 'ModelReturned')).toHaveLength(1)
    expect(s.units[POX].models).toHaveLength(7)
    // a kill by a unit that is not the holder (or its leader) never counts
    const other = curseState(2)
    attackService.finishDestroy(other.ctx, other.s.units[BOYZ].models[0], by(other.s, MARINES))
    expect(of(other.events, 'ModelReturned')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Rules-outcome tests driven through the real attack pipeline with scripted dice (DTG-017/019/020/021/022/025/026/027/028)
const TAIL = Array<number>(80).fill(6)
const dTarget = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = 1): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
// the (model, runtime weapon id) in `unitId` (either half of an attached unit) that carries the weapon with data id `dataId`
function weaponOn(s: GameState, unitId: string, dataId: string): { modelId: string; weaponId: string } {
  for (const half of leaderService.halves(s, unitId)) for (const mid of s.units[half].models) {
    const wid = s.models[mid].weapons.find((w) => w === dataId || s.weapons[w]?.id === dataId)
    if (wid) return { modelId: mid, weaponId: wid }
  }
  throw new Error(`no ${dataId} on ${unitId}`)
}
function mk(s: GameState, dice: number[]): { ctx: EngineContext; events: GameEvent[] } {
  return createContext(s, new ScriptedRng([...dice, ...TAIL]), { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } })
}
function driveAttack(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending as PendingDecision
    const opts = ('options' in pending ? pending.options : []) as { id?: string; action: Action }[]
    const strat = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll'
    const action = (opts[0] && !strat ? opts[0].action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
    ctx.state.pending = null
    const owner = strat ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}
function fire(ctx: EngineContext, kind: 'ranged' | 'melee', unitId: string, dataId: string, targetUnitId: string, attacks: number | null = 1): void {
  const { modelId, weaponId } = weaponOn(ctx.state, unitId, dataId)
  attackService.begin(ctx, { kind, attackerUnitId: unitId, overwatch: false, targets: [dTarget(modelId, weaponId, targetUnitId, attacks)] })
  driveAttack(ctx)
}
// give the weapon with data id `dataId` on `unitId` custom stats (the state owns its own weapon table copy per game)
function tweakWeapon(s: GameState, unitId: string, dataId: string, patch: Record<string, unknown>): void {
  const { weaponId } = weaponOn(s, unitId, dataId)
  s.weapons = { ...s.weapons, [weaponId]: { ...s.weapons[weaponId], ...patch } } as never
}
function useStrat(s: GameState, ctx: EngineContext, player: PlayerId, stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string; targetUnitId?: string }, unitId: string): void {
  const opt = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === unitId)
  if (!opt) throw new Error(`${stratagemId} not offered for ${unitId}`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...opt, decisionId: 'd:1' } as never
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}
const offeredFor = (s: GameState, player: PlayerId, window: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}): (string | undefined)[] =>
  stratagemService.options(s, player, window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds?.[0])
const parkDG = (s: GameState, ids: string[]): void => { for (const id of ids) if (s.units[id]) stack(s, id, 40, 40) }
const parkOrks = (s: GameState, ids: string[] = ALL_B): void => { for (const id of ids) stack(s, id, 25, 25) }

describe('Corrosive Effluents (DTG-5)', () => {
  const setup = (phase: 'shooting' | 'fight', active: PlayerId = 'A') => {
    const s = makeState({ round: 2 })
    setPhase(s, phase, active)
    s.players.A.cp = 3
    placeUnit(s, MARINES, { x: -12, z: -6, gap: 0.3 })
    stack(s, GRELCH, -12, -5)
    parkDG(s, [TYPHUS, POX, POX_B, POX_C])
    parkOrks(s)
    if (phase === 'shooting') stack(s, BOYZ, -12, 4)
    else stack(s, DREAD, -12, -6 + baseRadius(s, MARINES) + baseRadius(s, DREAD) + 0.2)
    return s
  }
  // SaveRolled.needed is the model's Sv; the AP that was applied is what `final` adds to the die (the scripted die is 6)
  const apUsed = (events: GameEvent[]): number => { const e = of(events, 'SaveRolled')[0]; return e.final - e.die }
  const apOf = (s: GameState, unitId: string, dataId: string): number => {
    const w = weaponOn(s, unitId, dataId)
    return hookService.statFor(s, { unitId, modelId: w.modelId, weapon: s.weapons[w.weaponId], stat: 'AP' }, s.weapons[w.weaponId].AP)
  }

  it('DTG-017 improves the weapon AP by 1 until the end of the phase: plague boltgun 0 -> -1, heavy plague weapon -2 -> -3, used in the save', () => {
    // ranged: Shooting phase of the owner
    const plain = setup('shooting')
    const pc = mk(plain, [])
    fire(pc.ctx, 'ranged', MARINES, 'dg.w.plague-boltgun', BOYZ)
    expect(apUsed(pc.events)).toBe(0)
    const s = setup('shooting')
    const { ctx, events } = mk(s, [])
    expect(offeredFor(s, 'A', 'shooting.start', 'dg.s.corrosive-effluents')).toContain(MARINES)
    expect(apOf(s, MARINES, 'dg.w.plague-boltgun')).toBe(0)
    useStrat(s, ctx, 'A', 'dg.s.corrosive-effluents', 'shooting.start', {}, MARINES)
    expect(s.players.A.cp).toBe(2)
    expect(apOf(s, MARINES, 'dg.w.plague-boltgun')).toBe(-1)
    fire(ctx, 'ranged', MARINES, 'dg.w.plague-boltgun', BOYZ)
    expect(apUsed(events)).toBe(-1)
    // melee: either player's Fight phase (here the opponent's), heavy plague weapon AP -2 becomes -3
    const f = setup('fight', 'B')
    const fb = mk(f, [])
    fire(fb.ctx, 'melee', MARINES, 'dg.w.heavy-plague-weapon', DREAD)
    expect(apUsed(fb.events)).toBe(-2)
    const g = setup('fight', 'B')
    const gc = mk(g, [])
    expect(offeredFor(g, 'A', 'fight.start', 'dg.s.corrosive-effluents')).toContain(MARINES)
    expect(apOf(g, MARINES, 'dg.w.heavy-plague-weapon')).toBe(-2)
    useStrat(g, gc.ctx, 'A', 'dg.s.corrosive-effluents', 'fight.start', {}, MARINES)
    expect(apOf(g, MARINES, 'dg.w.heavy-plague-weapon')).toBe(-3)
    fire(gc.ctx, 'melee', MARINES, 'dg.w.heavy-plague-weapon', DREAD)
    expect(apUsed(gc.events)).toBe(-3)
  })

  it('DTG-017 not offered for a unit (either half) that already shot or fought this phase, nor in the opponent\'s Shooting phase', () => {
    const s = setup('shooting')
    expect(offeredFor(s, 'A', 'shooting.start', 'dg.s.corrosive-effluents')).toContain(MARINES)
    s.units[MARINES].turn.shotThisPhase = true
    expect(offeredFor(s, 'A', 'shooting.start', 'dg.s.corrosive-effluents')).not.toContain(MARINES)
    s.units[MARINES].turn.shotThisPhase = false
    s.units[GRELCH].turn.shotThisPhase = true
    expect(offeredFor(s, 'A', 'shooting.start', 'dg.s.corrosive-effluents')).not.toContain(MARINES)
    const f = setup('fight')
    f.units[MARINES].turn.foughtThisPhase = true
    expect(offeredFor(f, 'A', 'fight.start', 'dg.s.corrosive-effluents')).not.toContain(MARINES)
    const o = setup('shooting', 'B')
    expect(offeredFor(o, 'A', 'shooting.start', 'dg.s.corrosive-effluents')).not.toContain(MARINES)
  })
})

describe('Disgustingly Resilient (DTG-5)', () => {
  // the Orks (active) shoot the Plague Marines; `patch` retunes the shoota's Damage
  function run(patch: Record<string, unknown> | null, dice: number[], resilient: boolean, targetId = MARINES) {
    const s = makeState({ round: 2, a: targetId === TYPHUS ? { attachments: [] } : {} })
    setPhase(s, 'shooting', 'B')
    s.players.A.cp = 3
    placeUnit(s, MARINES, { x: -12, z: -6, gap: 0.3 })
    stack(s, GRELCH, -12, -5)
    parkDG(s, [TYPHUS, POX, POX_B, POX_C])
    if (targetId === TYPHUS) stack(s, TYPHUS, -12, -6)
    parkOrks(s)
    stack(s, BOYZ, -12, 4)
    if (patch) tweakWeapon(s, BOYZ, 'ork.w.shoota', patch)
    const { ctx, events } = mk(s, dice)
    if (resilient) useStrat(s, ctx, 'A', 'dg.s.disgustingly-resilient', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: targetId }, targetId)
    fire(ctx, 'ranged', BOYZ, 'ork.w.shoota', targetId)
    // damage is applied one point at a time: total = what the attack dealt
    const points = of(events, 'DamageApplied').filter((d) => !d.mortal)
    return { s, events, total: points.reduce((n, d) => n + d.amount, 0), left: points[points.length - 1]?.woundsRemaining }
  }
  // hit 6, wound 6, save 1 (fails against Sv 3+)
  const FAIL = [6, 6, 1]

  it('DTG-019 a D2 attack allocated to the unit deals 1 instead of 2; a D1 attack stays 1', () => {
    expect(run({ D: 2 }, FAIL, false)).toMatchObject({ total: 2, left: 0 })
    const resilient = run({ D: 2 }, FAIL, true)
    expect(resilient).toMatchObject({ total: 1, left: 1 })
    expect(resilient.s.players.A.cp).toBe(2)
    expect(run(null, FAIL, true).total).toBe(1)
  })

  it('DTG-019 a random Damage is rolled first, then reduced by 1 (D3 rolling a 3 deals 2); never below 1', () => {
    // Typhus (W6) shows the full difference: a D3 result of 3 (die 6) deals 3 normally and 2 under the stratagem
    expect(run({ D: 'D3' }, [6, 6, 1, 6], false, TYPHUS).total).toBe(3)
    expect(run({ D: 'D3' }, [6, 6, 1, 6], true, TYPHUS).total).toBe(2)
    expect(run({ D: 'D3' }, [6, 6, 1, 1], true, TYPHUS).total).toBe(1)
  })

  it('DTG-019 only in the opponent\'s Shooting phase, once the unit has been picked as a target', () => {
    const offered = (active: PlayerId, trigger: { unitId?: string; targetUnitId?: string }) => {
      const s = makeState({ round: 2 })
      setPhase(s, 'shooting', active)
      s.players.A.cp = 3
      placeUnit(s, MARINES, { x: -12, z: -6, gap: 0.3 })
      return offeredFor(s, 'A', 'shooting.targetsDeclared', 'dg.s.disgustingly-resilient', trigger)
    }
    expect(offered('B', { unitId: BOYZ, targetUnitId: MARINES })).toContain(MARINES)
    expect(offered('A', { unitId: BOYZ, targetUnitId: MARINES })).not.toContain(MARINES)
    expect(offered('B', { unitId: BOYZ })).not.toContain(MARINES)
  })
})

describe('Typhus abilities (DTG-6)', () => {
  const field = (attachments: PlayerSetup['attachments'], phase: 'shooting' | 'fight', active: PlayerId) => {
    const s = makeState({ round: 2, a: { attachments } })
    setPhase(s, phase, active)
    stack(s, TYPHUS, -12, -6)
    stack(s, POX, -12 + 1.2, -6)
    parkDG(s, [POX_B, POX_C, MARINES, GRELCH])
    parkOrks(s)
    return s
  }

  it('DTG-020 The Destroyer Hive: melee attacks against Typhus + Poxwalkers get -1 to hit; ranged do not; unattached Typhus gets nothing', () => {
    const attached = [{ leaderRef: 'typhus', bodyguardRef: 'poxwalkers-a' }]
    // the Boyz hit on 3+ in melee and 5+ shooting: a hit roll sitting exactly on the threshold is lost at -1
    const meleeDie = 3
    const rangedDie = 5
    const m = (attachments: PlayerSetup['attachments'], targetId: string) => {
      const s = field(attachments, 'fight', 'B')
      stack(s, BOYZ, -12, -6 + baseRadius(s, TYPHUS) + baseRadius(s, BOYZ) + 0.2)
      const { ctx, events } = mk(s, [meleeDie])
      fire(ctx, 'melee', BOYZ, 'ork.w.choppa', targetId)
      return of(events, 'HitRolled')[0]
    }
    const r = (attachments: PlayerSetup['attachments'], targetId: string) => {
      const s = field(attachments, 'shooting', 'B')
      stack(s, BOYZ, -12, 4)
      const { ctx, events } = mk(s, [rangedDie])
      fire(ctx, 'ranged', BOYZ, 'ork.w.shoota', targetId)
      return of(events, 'HitRolled')[0]
    }
    expect(m(attached, POX)).toMatchObject({ die: meleeDie, final: meleeDie - 1, hit: false })
    expect(r(attached, POX)).toMatchObject({ die: rangedDie, final: rangedDie, hit: true })
    expect(m([], TYPHUS)).toMatchObject({ die: meleeDie, final: meleeDie, hit: true })
  })

  it('DTG-027 Typhus: the 4+ invulnerable save is used against AP -3 (2+ armour becomes 5+); an AP -1 attack uses the better armour', () => {
    const save = (ap: number) => {
      const s = field([], 'shooting', 'B')
      stack(s, BOYZ, -12, 4)
      tweakWeapon(s, BOYZ, 'ork.w.shoota', { AP: ap })
      const { ctx, events } = mk(s, [6, 6, 3])
      fire(ctx, 'ranged', BOYZ, 'ork.w.shoota', TYPHUS)
      return of(events, 'SaveRolled')[0]
    }
    expect(save(-3)).toMatchObject({ kind: 'invuln', needed: 4, die: 3, final: 3, saved: false })
    expect(save(-1)).toMatchObject({ kind: 'armour', needed: 2, die: 3, final: 2, saved: true }) // 3 - 1 = 2 meets the 2+ armour
  })
})

describe('Folgoth Grelch (DTG-6)', () => {
  const field = (round = 2) => {
    const s = makeState({ round })
    setPhase(s, 'shooting', 'A')
    placeUnit(s, MARINES, { x: -12, z: -6, gap: 0.3 })
    stack(s, GRELCH, -12, -5)
    parkDG(s, [TYPHUS, POX, POX_B, POX_C])
    parkOrks(s)
    return s
  }

  it('DTG-021 Foul Infusion: with Grelch attached a plague boltgun unmodified hit of 5 is a Critical Hit and auto-wounds; without Grelch only 6 is', () => {
    const shoot = (die: number, withGrelch: boolean) => {
      const s = makeState({ round: 2, a: { attachments: withGrelch ? [{ leaderRef: 'grelch', bodyguardRef: 'plague-marines' }] : [] } })
      setPhase(s, 'shooting', 'A')
      placeUnit(s, MARINES, { x: -12, z: -6, gap: 0.3 })
      parkDG(s, [GRELCH, TYPHUS, POX, POX_B, POX_C])
      parkOrks(s)
      stack(s, BOYZ, -12, 4)
      const { ctx, events } = mk(s, [die])
      fire(ctx, 'ranged', MARINES, 'dg.w.plague-boltgun', BOYZ)
      return { hit: of(events, 'HitRolled')[0], wound: of(events, 'WoundRolled')[0] }
    }
    const five = shoot(5, true)
    expect(five.hit).toMatchObject({ die: 5, hit: true, critical: true })
    expect(five.wound).toMatchObject({ auto: true, wounded: true })
    const noGrelch5 = shoot(5, false)
    expect(noGrelch5.hit).toMatchObject({ die: 5, hit: true, critical: false })
    expect(noGrelch5.wound.auto).toBe(false)
    expect(shoot(6, false).hit.critical).toBe(true)
    expect(shoot(4, true).hit).toMatchObject({ hit: true, critical: false })
  })

  it('DTG-025 Deadly Demise 1: destroyed Grelch on a D6 of 6 gives 1 mortal wound to each unit within 6"; 1-5 does nothing', () => {
    const run = (die: number) => {
      const s = field()
      s.activePlayer = 'B'
      stack(s, BOYZ, -12, -1)
      stack(s, BOYZ2, 30, 20)
      const { ctx, events } = ctxOf(s, [die])
      attackService.destroyModel(ctx, s.units[GRELCH].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
      return { s, demise: of(events, 'DeadlyDemiseRolled')[0] }
    }
    const boom = run(6)
    expect(boom.demise).toMatchObject({ unitId: GRELCH, die: 6, exploded: true })
    expect(boom.demise.affected).toEqual(expect.arrayContaining([BOYZ]))
    expect(boom.demise.affected).not.toContain(BOYZ2)
    const queue = boom.s.phaseState.attack?.mortalQueue ?? []
    expect(queue).toHaveLength(boom.demise.affected.length)
    expect(queue.every((q) => q.count === 1)).toBe(true)
    const quiet = run(5)
    expect(quiet.demise).toMatchObject({ die: 5, exploded: false, affected: [] })
    expect(quiet.s.phaseState.attack?.mortalQueue ?? []).toHaveLength(0)
  })

  it('DTG-027 Grelch: hyper blight grenades gain Blast +2 attacks against a 10-model unit; Assault fires after Advancing; the injector pistol fires in Engagement Range', () => {
    const volley = (targetModels: number) => {
      const s = field()
      stack(s, BOYZ, -12, 4)
      for (const id of s.units[BOYZ].models.slice(targetModels)) removeModel(s, id)
      const { ctx, events } = mk(s, [3])
      fire(ctx, 'ranged', MARINES, 'dg.w.hyper-blight-grenades', BOYZ, null)
      return of(events, 'HitRolled').length
    }
    expect(makeState().units[BOYZ].models.length).toBeGreaterThanOrEqual(10)
    expect(volley(10)).toBe(3 + 2) // D6 rolled 3, +1 per 5 models in the target
    expect(volley(4)).toBe(3)
    const ids = (s: GameState): string[] => buildShootingWeaponEntries(mk(s, []).ctx, MARINES).map((e) => s.weapons[e.weaponId].id)
    // Advanced: only Assault weapons are available (grenades yes, boltgun and pistol no)
    const adv = field()
    stack(adv, BOYZ, -12, 4)
    adv.units[MARINES].turn.moveType = 'advance'
    expect(ids(adv)).toContain('dg.w.hyper-blight-grenades')
    expect(ids(adv)).not.toContain('dg.w.plague-boltgun')
    expect(ids(adv)).not.toContain('dg.w.injector-pistol')
    // Engagement Range: only Pistols are available
    const eng = field()
    stack(eng, BOYZ, -12, -5 + baseRadius(eng, GRELCH) + baseRadius(eng, BOYZ) + 0.2)
    const inEng = ids(eng)
    expect(inEng).toContain('dg.w.injector-pistol')
    expect(inEng).not.toContain('dg.w.hyper-blight-grenades')
    expect(inEng).not.toContain('dg.w.plague-boltgun')
  })
})

describe('Poxwalkers durability (DTG-6.7)', () => {
  function shootPox(cover: boolean, dice: number[]) {
    const s = makeState({ round: 2 })
    setPhase(s, 'shooting', 'B')
    stack(s, POX, -12, -6)
    parkDG(s, [TYPHUS, POX_B, POX_C, MARINES, GRELCH])
    parkOrks(s)
    stack(s, BOYZ, -12, 4)
    s.units[POX].models.slice(1).forEach((id) => removeModel(s, id)) // a single Poxwalker keeps the dice order simple
    const mods = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(), los: { ...DEFAULT_MODULES.services.los, benefitOfCover: () => cover } } }
    const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...TAIL]), mods)
    fire(ctx, 'ranged', BOYZ, 'ork.w.shoota', POX)
    return { s, events }
  }

  it('DTG-026 an AP 0 attack finds no armour save at Sv 7+; in cover the 6+ save is rolled; Feel No Pain 5+ ignores wounds, mortal ones included', () => {
    // a 7+ save cannot be made: even a 6 is not rolled, the save is recorded as failed
    const bare = shootPox(false, [6, 6, 6])
    expect(of(bare.events, 'SaveRolled')[0]).toMatchObject({ kind: 'armour', needed: 7, die: 0, saved: false })
    // Benefit of Cover: +1 to the save makes 7+ a 6+ roll (a 5 fails, a 6 saves)
    expect(of(shootPox(true, [6, 6, 5]).events, 'SaveRolled')[0]).toMatchObject({ kind: 'armour', needed: 7, die: 5, final: 6, saved: false })
    expect(of(shootPox(true, [6, 6, 6]).events, 'SaveRolled')[0]).toMatchObject({ kind: 'armour', needed: 7, die: 6, final: 7, saved: true })
    // Feel No Pain 5+: a 5 ignores the wound, a 4 does not
    expect(of(shootPox(false, [6, 6, 5]).events, 'FeelNoPainRolled')[0]).toMatchObject({ needed: 5, die: 5, ignored: true })
    expect(of(shootPox(false, [6, 6, 4]).events, 'FeelNoPainRolled')[0]).toMatchObject({ needed: 5, die: 4, ignored: false })
    // mortal wounds are rolled against Feel No Pain too
    const s = makeState({ round: 2 })
    setPhase(s, 'shooting', 'B')
    stack(s, POX, -12, -6)
    stack(s, BOYZ, -12, 4)
    const { ctx, events } = mk(s, [5, 4])
    attackService.queueMortalWounds(ctx, POX, 2, 'ability', false, { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0] })
    driveAttack(ctx)
    const rolls = of(events, 'FeelNoPainRolled')
    expect(rolls.length).toBeGreaterThanOrEqual(2)
    expect(rolls[0]).toMatchObject({ needed: 5, die: 5, ignored: true })
    expect(rolls[1]).toMatchObject({ die: 4, ignored: false })
  })
})

describe('Remorseless (DTG-6.3, E2)', () => {
  const objective = (s: GameState) => Object.values(s.objectives).find((o) => !o.removed)!
  const holderEnv = (s: GameState, unitId: string, player: PlayerId = 'A') => ({ state: s, holder: s.units[unitId], player, attack: null, roll: null, weapon: null })
  function field(controller: PlayerId | null, place: 'on' | 'off' = 'on') {
    const s = makeState({ round: 2 })
    const o = objective(s)
    o.controller = controller
    parkDG(s, [TYPHUS, POX, POX_B, POX_C])
    parkOrks(s)
    if (place === 'on') { stack(s, MARINES, o.pos.x, o.pos.z); stack(s, GRELCH, o.pos.x, o.pos.z) }
    else { stack(s, MARINES, o.pos.x + 20, o.pos.z + 12); stack(s, GRELCH, o.pos.x + 20, o.pos.z + 12) }
    return s
  }
  const bsTest = (s: GameState, dice: number[]) => {
    const { ctx, events } = ctxOf(s, [...dice, ...TAIL])
    hookService.battleShockTest(ctx, MARINES, 'test')
    return of(events, 'BattleShockTested')[0]
  }

  it('DTG-022 +1 to the Battle-shock test within range of a marker the unit\'s side controls (2D6 = 5 vs Ld 6 passes); none off it, or on a contested / enemy-controlled marker', () => {
    expect(bsTest(field('A'), [2, 3])).toMatchObject({ roll: 6, ld: 6, passed: true })
    expect(bsTest(field('A', 'off'), [2, 3])).toMatchObject({ roll: 5, ld: 6, passed: false })
    expect(bsTest(field(null), [2, 3])).toMatchObject({ roll: 5, passed: false })
    expect(bsTest(field('B'), [2, 3])).toMatchObject({ roll: 5, passed: false })
    // the bonus is +1 only: a 4 stays a failure on the marker
    expect(bsTest(field('A'), [2, 2])).toMatchObject({ roll: 5, passed: false })
  })

  it('DTG-022 the bonus also applies when Grelch (not the Marines) is the half on the marker', () => {
    const s = field('A', 'off')
    const o = objective(s)
    stack(s, GRELCH, o.pos.x, o.pos.z)
    expect(bsTest(s, [2, 3])).toMatchObject({ roll: 6, passed: true })
  })

  it('DTG-028 unitOnObjectiveControlledBy is true only when the holder (either half) is in range of a marker controlled by the named side', () => {
    const on = field('A')
    expect(evaluateCondition(holderEnv(on, MARINES), { unitOnObjectiveControlledBy: 'self' })).toBe(true)
    expect(evaluateCondition(holderEnv(on, MARINES), { unitOnObjectiveControlledBy: 'opponent' })).toBe(false)
    // seen from the other player's side the same marker is the opponent's
    expect(evaluateCondition(holderEnv(on, MARINES, 'B'), { unitOnObjectiveControlledBy: 'self' })).toBe(false)
    expect(evaluateCondition(holderEnv(on, MARINES, 'B'), { unitOnObjectiveControlledBy: 'opponent' })).toBe(true)
    // enemy-controlled / uncontrolled / far away
    expect(evaluateCondition(holderEnv(field('B'), MARINES), { unitOnObjectiveControlledBy: 'self' })).toBe(false)
    expect(evaluateCondition(holderEnv(field('B'), MARINES), { unitOnObjectiveControlledBy: 'opponent' })).toBe(true)
    expect(evaluateCondition(holderEnv(field(null), MARINES), { unitOnObjectiveControlledBy: 'self' })).toBe(false)
    expect(evaluateCondition(holderEnv(field('A', 'off'), MARINES), { unitOnObjectiveControlledBy: 'self' })).toBe(false)
    // either half counts
    const half = field('A', 'off')
    stack(half, GRELCH, objective(half).pos.x, objective(half).pos.z)
    expect(evaluateCondition(holderEnv(half, MARINES), { unitOnObjectiveControlledBy: 'self' })).toBe(true)
    // no holder, no answer; an absent key leaves the condition alone
    expect(evaluateCondition({ ...holderEnv(on, MARINES), holder: null }, { unitOnObjectiveControlledBy: 'self' })).toBe(false)
    expect(evaluateCondition(holderEnv(field('A', 'off'), MARINES), {})).toBe(true)
  })

  it('DTG-028 the existing targetOnObjectiveControlledBy still reads the attack target, unchanged', () => {
    const s = field('B')
    const o = objective(s)
    stack(s, BOYZ, o.pos.x, o.pos.z)
    const attack = { attackerUnitId: MARINES, targetUnitId: BOYZ } as unknown as AttackContext
    const env = { ...holderEnv(s, MARINES), attack }
    expect(evaluateCondition(env, { targetOnObjectiveControlledBy: 'opponent' })).toBe(true)
    expect(evaluateCondition(env, { targetOnObjectiveControlledBy: 'self' })).toBe(false)
    expect(evaluateCondition({ ...env, attack: null }, { targetOnObjectiveControlledBy: 'opponent' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('AI-vs-AI (DTG-030)', () => {
  const STALL_DECISIONS = 3_000
  const ps = (patrolId: string, name: string, extra: Partial<PlayerSetup> = {}): PlayerSetup => {
    const p = bundle.patrols[patrolId]
    return {
      name, faction: p.faction, patrolId,
      enhancementId: (p.enhancements.find((e) => e.default) ?? p.enhancements[0]).id,
      secondaryId: (p.secondaries.find((x) => x.default) ?? p.secondaries[0]).id,
      attachments: p.units.filter((u) => u.attachTo).map((u) => ({ leaderRef: u.ref, bodyguardRef: u.attachTo as string })),
      reserves: [], battleReadyVp: 0, ...extra,
    }
  }

  async function play(setup: GameSetup, seed: string): Promise<GameState> {
    const deciders: Record<PlayerId, Decider> = { A: new UtilityDecider('normal', `${seed}-A`), B: new UtilityDecider('normal', `${seed}-B`) }
    let r = createGame(setup, seed, bundle)
    let steps = 0
    while (r.pending && steps < STALL_DECISIONS) {
      steps++
      const pending = r.pending
      const action = await deciders[pending.player].decide(view(r.state, pending.player), pending, legalActions(r.state, pending))
      const next = step(r.state, action)
      expect(next.rejection).toBeFalsy()
      r = next
    }
    expect(r.state.result).toBeTruthy()
    expect(steps).toBeLessThan(STALL_DECISIONS)
    return r.state
  }

  it('DTG-030 a full AI game finishes without a stuck decision: Death Guard vs Orks (Walking Plague, Spread the Blight) and the mirror (Miasmic Arrival)', async () => {
    const dg = 'dg.cp.the-shambling-horde'
    const base = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', sides: 'rollOff', firstTurn: 'rollOff', dataVersion: DATA_VERSION } as const
    const vsOrks = await play({ ...base, players: { A: ps(dg, 'Death Guard', { secondaryId: 'dg.sec.spread-the-blight' }), B: ps('ork.cp.gordrangs-gitstompas', 'Orks') } }, 'dtg-ai-1')
    expect(vsOrks.phase).toBe('ended')
    const mirror = await play({ ...base, players: { A: ps(dg, 'Death Guard A'), B: ps(dg, 'Death Guard B', { enhancementId: 'dg.e.miasmic-arrival', secondaryId: 'dg.sec.spread-the-blight' }) } }, 'dtg-ai-2')
    expect(mirror.phase).toBe('ended')
  }, 240_000)
})

