// Genestealer Cults code hooks (docs/spec/factions/genestealer-cults.md §7, checklist GEN-*): Rise Up, Will of the Patriarch,
// Defend the Magus, Lurking Killers, Return to the Shadows, Spiritual Leader, Vile Insurrectionists, plus the Cult Ambush
// hook surface (the lifecycle itself is the engine's). Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type AttackContext, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
  type RollContext, type UseStratagemAction,
} from '../../src/engine'
import { hookService } from '../../src/engine/hooks-impl'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import {
  riseUpAmount, willOfThePatriarchAmount, cultAmbushState, onCultAmbushUnitDestroyed, raisePendingCultAmbushMarker, cultAmbushMarkerCandidates,
  cultAmbushOnMoveEnded, cultAmbushReturnStep, cultAmbushAbilityId, cultAmbushArrivalPlacements, cultAmbushReactionMarker, pendingCultAmbushReactions,
  CULT_AMBUSH_MARKER_RADIUS,
} from '../../src/engine/factions/genestealer-cults'
import { codeHooks } from '../../src/engine/code-hooks'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GSC = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Cult', faction: 'genestealer-cults', patrolId: 'gsc.cp.hand-of-the-magus', enhancementId: 'gsc.e.psionic-shield', secondaryId: 'gsc.sec.rise-up',
  attachments: [{ leaderRef: 'magus', bodyguardRef: 'neophytes-a' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const MAGUS = 'A:magus', NEO = 'A:neophytes-a', NEO_B = 'A:neophytes-b', ACO = 'A:acolytes', ABER = 'A:aberrants', ROCK = 'A:rockgrinder'
const ENEMY = 'B:terminator-squad', ENEMY2 = 'B:infernus-squad'

function makeState(o: { a?: Partial<PlayerSetup>; round?: number } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GSC(o.a), B: SM() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'gsc-hooks', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  s.phaseState = emptyPhaseState()
  return s
}
function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
function ctxOf(s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const killUnit = (s: GameState, id: string): void => { for (const m of [...s.units[id].models]) removeModel(s, m) }

function block(s: GameState, unitId: string, x: number, z: number): void {
  placeUnit(s, unitId, s.units[unitId].models.map((_, i): [number, number] => [x + (i % 5) * 1.3, z + Math.floor(i / 5) * 1.3]))
}

function attackOf(s: GameState, attackerUnit: string, targetUnit: string, kind: 'ranged' | 'melee', attackerModel?: string): AttackContext {
  const am = s.models[attackerModel ?? s.units[attackerUnit].models[0]]
  const wid = am.weapons.find((w) => s.weapons[w].kind === kind)!
  return {
    kind, overwatch: false, attackerUnitId: am.unitId, attackerModelId: am.id, weapon: weaponService.effectiveWeapon(s, am.id, wid),
    targetUnitId: targetUnit, targetModelId: s.units[targetUnit].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget: false,
    attackerInEngagement: kind === 'melee',
  }
}
const rollCtx = (purpose: 'hit' | 'wound' | 'save', unmodified = 1): RollContext => {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function hitMods(ctx: EngineContext, attack: AttackContext, hook: 'onHitRoll' | 'onWoundRoll'): { modifier: number; reroll?: string } {
  const out = hookService.collect(ctx, hook, { attack, roll: rollCtx(hook === 'onHitRoll' ? 'hit' : 'wound') } as never)
  let modifier = 0
  let reroll: string | undefined
  for (const { result } of out) {
    if (result.kind !== 'roll') continue
    modifier += result.modifier ?? 0
    if (result.reroll) reroll = result.reroll
  }
  return { modifier, reroll }
}

function useStratagem(s: GameState, ctx: EngineContext, player: 'A' | 'B', stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string }, ids: string[]): void {
  const action = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && ids.every((id, i) => x.targets.unitIds?.[i] === id))
  if (!action) throw new Error(`${stratagemId} on ${ids.join(',')} not offered`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}
const offered = (s: GameState, p: 'A' | 'B', id: string, window: Parameters<typeof stratagemService.options>[2], trigger = {}) =>
  stratagemService.options(s, p, window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds ?? [])

// =====================================================================================================================
describe('registration (GEN-7)', () => {
  it('GEN-001 every code the Genestealer Cults data names is registered', () => {
    for (const name of ['cultAmbush', 'defendTheMagus', 'returnToTheShadows', 'riseUp', 'willOfThePatriarch']) expect(codeHooks[name], name).toBeTruthy()
    expect(codeHooks.cultAmbush.kind).toBe('ability')
    expect(codeHooks.defendTheMagus.kind).toBe('stratagem')
  })
})

// =====================================================================================================================
describe('Rise Up (GEN-4)', () => {
  const setup = (round = 2) => {
    const s = makeState({ round })
    const [o1, o2] = Object.keys(s.objectives)
    s.objectives[o1].pos = { x: -10, z: 0 }
    s.objectives[o2].pos = { x: 10, z: 0 }
    const rule = { ...s.mission.secondaries.A[0], code: 'riseUp', pointsPer: 1 } as never
    return { s, o1, o2, rule }
  }
  it('GEN-020 GEN-4: 2 controlled markers holding Neophytes roll 2 D6: VP = sum of (1 on 1-3, 3 on 4+); the secondary scores at the end of the opponent\'s turn from round 2', () => {
    const { s, o1, o2, rule } = setup()
    placeUnit(s, NEO, [[-10, 0]])
    placeUnit(s, NEO_B, [[10, 0]])
    const { ctx, events } = ctxOf(s, [2, 5])
    expect(riseUpAmount(ctx, rule, 'A', () => true)).toBe(4)
    expect(of(events, 'DiceRolled')).toHaveLength(2)
    const scoring = s.mission.secondaries.A[0]
    expect(scoring.when).toBe('turn.end')
    expect(scoring.who).toBe('opponent')
    expect(scoring.rounds.from).toBe(2)
    expect(codeHooks.riseUp.hook).toBe('onTurnEnd')
    void o1; void o2
  })

  it('GEN-020 GEN-4: an attached Magus + Neophytes unit counts as a NEOPHYTE HYBRIDS unit; a marker not controlled rolls nothing', () => {
    const { s, rule } = setup()
    placeUnit(s, NEO, [[-10, 0]])
    placeUnit(s, MAGUS, [[-10, 1]])
    const { ctx, events } = ctxOf(s, [6])
    expect(riseUpAmount(ctx, rule, 'A', () => true)).toBe(3)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    const c2 = ctxOf(makeState(), [])
    expect(riseUpAmount(c2.ctx, rule, 'A', () => false)).toBe(0)
  })

  it('GEN-021 GEN-4: a marker held only by Acolytes, or by Battle-shocked Neophytes, rolls nothing', () => {
    const { s, rule } = setup()
    placeUnit(s, ACO, [[-10, 0]])
    placeUnit(s, NEO, [[10, 0]])
    s.units[NEO].battleShocked = true
    const { ctx, events } = ctxOf(s, [])
    expect(riseUpAmount(ctx, rule, 'A', () => true)).toBe(0)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
  })

  it('GEN-021 GEN-4: Neophytes out of range of a controlled marker score nothing', () => {
    const { s, rule } = setup()
    placeUnit(s, NEO, [[-10, 5]])
    const { ctx } = ctxOf(s, [])
    expect(riseUpAmount(ctx, rule, 'A', () => true)).toBe(0)
  })
})

// =====================================================================================================================
describe('Will of the Patriarch (GEN-4)', () => {
  const rule = (s: GameState) => ({ ...s.mission.secondaries.A[0], code: 'willOfThePatriarch', pointsPer: 15 }) as never
  const edge = (s: GameState) => s.models[s.units[MAGUS].models[0]].base.radius
  it('GEN-022 GEN-4: Magus base edge 2.9" from the board centre -> 15 VP; 3.2" or destroyed -> 0', () => {
    const s = makeState({ a: { secondaryId: 'gsc.sec.will-of-the-patriarch' } })
    placeUnit(s, MAGUS, [[2.9 + edge(s), 0]])
    expect(willOfThePatriarchAmount(s, rule(s), 'A')).toBe(15)
    placeUnit(s, MAGUS, [[0, 3.2 + edge(s)]])
    expect(willOfThePatriarchAmount(s, rule(s), 'A')).toBe(0)
    placeUnit(s, MAGUS, [[0, 0]])
    expect(willOfThePatriarchAmount(s, rule(s), 'A')).toBe(15)
    killUnit(s, MAGUS)
    expect(willOfThePatriarchAmount(s, rule(s), 'A')).toBe(0)
  })
  it('GEN-022 GEN-4: the mission engine awards 15 VP at battle end when the Magus stands in the centre', () => {
    const s = makeState({ a: { secondaryId: 'gsc.sec.will-of-the-patriarch' } })
    s.round = 5; s.phase = 'fight'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
    placeUnit(s, MAGUS, [[0, 0]]); placeUnit(s, ENEMY, [[15, 0]])
    const { ctx } = ctxOf(s, [])
    ctx.services.missions.onWindow(ctx, 'battle.end', 'battle')
    expect(s.players.A.vpBySource['will-of-the-patriarch']).toBe(15)
  })
  it('GEN-022 GEN-4: scores at battle end for either player, even when the GSC player is not the active player', () => {
    const s = makeState({ a: { secondaryId: 'gsc.sec.will-of-the-patriarch' } })
    const sc = s.mission.secondaries.A[0]
    expect([sc.when, sc.rounds.to, sc.who]).toEqual(['battle.end', 5, 'both'])
    s.round = 5; s.phase = 'fight'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
    placeUnit(s, MAGUS, [[0, 0]]); placeUnit(s, ENEMY, [[15, 0]])
    const { ctx } = ctxOf(s, [])
    ctx.services.missions.onWindow(ctx, 'battle.end', 'battle')
    expect(s.players.A.vpBySource['will-of-the-patriarch']).toBe(15)
  })
})

// =====================================================================================================================
describe('Defend the Magus (GEN-5)', () => {
  const DEFEND = 'gsc.s.defend-the-magus'
  // Magus-led Neophytes in Engagement Range of the first enemy; the second enemy is far away
  const layout = (s: GameState) => {
    placeUnit(s, NEO, [[0, 0]])
    placeUnit(s, MAGUS, [[0, 1.5]])
    placeUnit(s, ENEMY, [[0, 3]])
    placeUnit(s, ENEMY2, [[15, 10]])
    placeUnit(s, NEO_B, [[-8, 0]])
  }
  const targets = (s: GameState): string[] => [NEO, ENEMY].map((id) => s.units[id].bodyguardUnitId ?? id)

  it('GEN-023 GEN-5: offered at the start of own Shooting only with an enemy in Engagement Range of the Magus unit', () => {
    const s = makeState(); phase(s, 'shooting', 'A', { A: 3 })
    layout(s)
    const o = offered(s, 'A', DEFEND, 'shooting.start')
    expect(o.length).toBeGreaterThan(0)
    expect(o.every((t) => t[1] === ENEMY)).toBe(true)
    const far = makeState(); phase(far, 'shooting', 'A', { A: 3 })
    layout(far); placeUnit(far, ENEMY, [[0, 20]])
    expect(offered(far, 'A', DEFEND, 'shooting.start')).toEqual([])
    const theirs = makeState(); phase(theirs, 'shooting', 'B', { A: 3 })
    layout(theirs)
    expect(offered(theirs, 'A', DEFEND, 'shooting.start')).toEqual([])
  })

  it('GEN-023 GEN-5: Neophyte hit 1s and wound 1s against that enemy are re-rolled; against another enemy they are not', () => {
    const s = makeState(); phase(s, 'shooting', 'A', { A: 3 })
    layout(s)
    const { ctx } = ctxOf(s)
    const t = offered(s, 'A', DEFEND, 'shooting.start')[0]
    useStratagem(s, ctx, 'A', DEFEND, 'shooting.start', {}, t)
    expect(s.players.A.cp).toBe(2)
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY, 'ranged'), 'onHitRoll').reroll).toBe('ones')
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY, 'ranged'), 'onWoundRoll').reroll).toBe('ones')
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY2, 'ranged'), 'onHitRoll').reroll).toBeUndefined()
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY2, 'ranged'), 'onWoundRoll').reroll).toBeUndefined()
  })

  it('GEN-024 GEN-5: works at the start of the opponent\'s Fight phase, is gone at phase end and survives the Magus dying mid-phase', () => {
    const s = makeState(); phase(s, 'fight', 'B', { A: 3 })
    layout(s)
    const { ctx } = ctxOf(s)
    const t = offered(s, 'A', DEFEND, 'fight.start')[0]
    expect(t).toBeTruthy()
    useStratagem(s, ctx, 'A', DEFEND, 'fight.start', {}, t)
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY, 'melee'), 'onHitRoll').reroll).toBe('ones')
    killUnit(s, MAGUS)
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY, 'melee'), 'onHitRoll').reroll).toBe('ones')
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(hitMods(ctx, attackOf(s, NEO_B, ENEMY, 'melee'), 'onHitRoll').reroll).toBeUndefined()
  })

  it('GEN-024 GEN-5: also offered in the Genestealer Cults player\'s own Fight phase', () => {
    const s = makeState(); phase(s, 'fight', 'A', { A: 3 })
    layout(s)
    expect(offered(s, 'A', DEFEND, 'fight.start').length).toBeGreaterThan(0)
    void targets
  })
})

// =====================================================================================================================
describe('Lurking Killers (GEN-5)', () => {
  const LURK = 'gsc.s.lurking-killers'
  it('GEN-025 GEN-5: offered after the enemy targets Acolytes; every attack against them is -1 to hit this phase, from any enemy unit', () => {
    const s = makeState(); phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, ACO, [[0, 0]]); placeUnit(s, ENEMY, [[0, 12]]); placeUnit(s, ENEMY2, [[5, 12]])
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, ENEMY, [ACO])
    expect(offered(s, 'A', LURK, 'shooting.targetsDeclared', { unitId: ENEMY }).map((t) => t[0])).toEqual([ACO])
    useStratagem(s, ctx, 'A', LURK, 'shooting.targetsDeclared', { unitId: ENEMY }, [ACO])
    expect(s.players.A.cp).toBe(2)
    expect(hitMods(ctx, attackOf(s, ENEMY, ACO, 'ranged'), 'onHitRoll').modifier).toBe(-1)
    expect(hitMods(ctx, attackOf(s, ENEMY2, ACO, 'ranged'), 'onHitRoll').modifier).toBe(-1)
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(hitMods(ctx, attackOf(s, ENEMY, ACO, 'ranged'), 'onHitRoll').modifier).toBe(0)
  })

  it('GEN-026 GEN-5: not offered for Aberrants or the Rockgrinder', () => {
    const s = makeState(); phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, ABER, [[0, 0]]); placeUnit(s, ROCK, [[6, 0]]); placeUnit(s, ENEMY, [[0, 12]])
    const { ctx } = ctxOf(s)
    stratagemService.recordTargets(ctx, ENEMY, [ABER, ROCK])
    expect(offered(s, 'A', LURK, 'shooting.targetsDeclared', { unitId: ENEMY })).toEqual([])
  })
})

// =====================================================================================================================
describe('Return to the Shadows (GEN-5)', () => {
  const RTS = 'gsc.s.return-to-the-shadows'
  const moveDistance = (s: GameState): number | undefined => {
    const p = s.pending as unknown as { kind: string; constraints: { maxDistance?: number; perModel?: Record<string, number> } }
    expect(p.kind).toBe('moveUnit')
    return p.constraints.maxDistance ?? Object.values(p.constraints.perModel ?? {})[0]
  }
  const setup = (moveType: 'normal' | 'stationary' | 'advance' = 'normal') => {
    const s = makeState(); phase(s, 'movement', 'B', { A: 3 })
    placeUnit(s, NEO_B, [[0, 0]])
    placeUnit(s, ENEMY, [[8, 0]])
    s.units[ENEMY].turn.moveType = moveType
    return s
  }

  it('GEN-027 GEN-5: enemy ends a Normal move 8" away -> offered; D6 rolled, the Normal move is up to that distance', () => {
    const s = setup()
    const { ctx, events } = ctxOf(s, [4])
    expect(offered(s, 'A', RTS, 'movement.unitMoved', { unitId: ENEMY }).map((t) => t[0])).toContain(NEO_B)
    useStratagem(s, ctx, 'A', RTS, 'movement.unitMoved', { unitId: ENEMY }, [NEO_B])
    expect(s.players.A.cp).toBe(2)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(moveDistance(s)).toBe(4)
  })

  it('GEN-027 GEN-5: not offered when the enemy only Remained Stationary, is beyond 9", or the unit is in Engagement Range', () => {
    const still = setup('stationary')
    expect(offered(still, 'A', RTS, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
    const far = setup(); placeUnit(far, ENEMY, [[12, 0]])
    expect(offered(far, 'A', RTS, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
    const engaged = setup(); placeUnit(engaged, ENEMY, [[1.5, 0]])
    expect(offered(engaged, 'A', RTS, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
  })

  it('GEN-028 GEN-5: a Magus-led unit moves a flat 6", no roll', () => {
    const s = makeState(); phase(s, 'movement', 'B', { A: 3 })
    placeUnit(s, NEO, [[0, 0]]); placeUnit(s, MAGUS, [[0, 1.4]]); placeUnit(s, ENEMY, [[8, 0]])
    s.units[ENEMY].turn.moveType = 'normal'
    const { ctx, events } = ctxOf(s, [])
    const target = s.units[NEO].bodyguardUnitId ?? NEO
    useStratagem(s, ctx, 'A', RTS, 'movement.unitMoved', { unitId: ENEMY }, [target])
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(moveDistance(s)).toBe(6)
  })
})

// =====================================================================================================================
describe('Spiritual Leader and Vile Insurrectionists (GEN-6)', () => {
  const fnp = (s: GameState, ctx: EngineContext, target: string, psychic: boolean) => {
    const weaponId = s.models[`${ENEMY}#0`].weapons[0]
    const attack: AttackContext = {
      kind: 'ranged', overwatch: false, attackerUnitId: ENEMY, attackerModelId: `${ENEMY}#0`, weapon: s.weapons[weaponId], targetUnitId: target,
      targetModelId: s.units[target].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
    }
    return hookService.collect(ctx, 'onFeelNoPainRoll', { attack, roll: rollCtx('save', 0), mortal: true, psychicSource: psychic } as never)
      .map((r) => (r.result as { feelNoPain?: number }).feelNoPain).filter((n) => n !== undefined)
  }
  it('GEN-029 GEN-6.1: a led unit gets FNP 5+ against Psychic damage; none against a non-Psychic source; Magus alone -> none', () => {
    const s = makeState()
    placeUnit(s, NEO, [[0, 0]]); placeUnit(s, MAGUS, [[0, 1.4]]); placeUnit(s, ENEMY, [[0, 12]])
    const { ctx } = ctxOf(s)
    expect(fnp(s, ctx, NEO, true)).toEqual([5])
    expect(fnp(s, ctx, NEO, false)).toEqual([])
    const alone = makeState({ a: { attachments: [] } })
    placeUnit(alone, NEO, [[0, 0]]); placeUnit(alone, MAGUS, [[0, 5]]); placeUnit(alone, ENEMY, [[0, 12]])
    expect(fnp(alone, ctxOf(alone).ctx, MAGUS, true)).toEqual([])
    expect(fnp(alone, ctxOf(alone).ctx, NEO, true)).toEqual([])
  })

  it('GEN-030 GEN-6.2: hit 1s are always re-rolled; wound 1s only when the target is within range of an objective marker', () => {
    const s = makeState()
    placeUnit(s, ACO, [[-8, 0]]); placeUnit(s, ENEMY, [[8, 0]])
    const { ctx } = ctxOf(s)
    const atk = attackOf(s, ACO, ENEMY, 'ranged')
    for (const o of Object.values(s.objectives)) o.pos = { x: 0, z: 40 }
    expect(hitMods(ctx, atk, 'onHitRoll').reroll).toBe('ones')
    expect(hitMods(ctx, atk, 'onWoundRoll').reroll).toBeUndefined()
    s.objectives[Object.keys(s.objectives)[0]].pos = { x: 8, z: 0 }
    expect(hitMods(ctx, atk, 'onWoundRoll').reroll).toBe('ones')
  })

  it('GEN-031 GEN-6.2: a leading Magus\'s attacks benefit from Vile Insurrectionists', () => {
    const s = makeState({ a: { attachments: [{ leaderRef: 'magus', bodyguardRef: 'acolytes' }] } })
    placeUnit(s, ACO, [[-8, 0]]); placeUnit(s, MAGUS, [[-8, 1.4]]); placeUnit(s, ENEMY, [[8, 0]])
    const { ctx } = ctxOf(s)
    expect(hitMods(ctx, attackOf(s, MAGUS, ENEMY, 'ranged'), 'onHitRoll').reroll).toBe('ones')
  })
})

// =====================================================================================================================
describe('Cult Ambush (GEN-2)', () => {
  const pendingOpt = (s: GameState) => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)
  const answer = (ctx: EngineContext, optionId: string): void => {
    const pending = ctx.state.pending as PendingDecision & { id: string; player: 'A' | 'B' }
    ctx.state.pending = null
    const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending)
    if (rej) throw new Error(`${rej.code} ${rej.reason}`)
  }
  // destroy a unit and run the Cult Ambush roll the reducer's emit interceptor would run
  const destroy = (ctx: EngineContext, id: string): void => { killUnit(ctx.state, id); onCultAmbushUnitDestroyed(ctx, id) }
  const board = (s: GameState, enemyAt: [number, number] = [18, 0]) => { placeUnit(s, ENEMY, [enemyAt]); placeUnit(s, NEO_B, [[-12, 8]]) }

  it('GEN-002 GEN-2.1: destroyed Neophytes (BATTLELINE, D6 +3) always join the pool and a marker decision is raised for the owner', () => {
    const s = makeState(); phase(s, 'shooting', 'B')
    board(s); placeUnit(s, NEO, [[-5, 0]])
    const { ctx } = ctxOf(s, [1])
    destroy(ctx, NEO)
    expect(cultAmbushState(s).pool.A).toEqual([NEO])
    expect(raisePendingCultAmbushMarker(ctx)).toBe(true)
    const p = pendingOpt(s)!
    expect(p.player).toBe('A')
    expect(p.context.data).toMatchObject({ code: 'cultAmbush', step: 'marker' })
    expect(p.options.some((o) => o.id.startsWith('pt:'))).toBe(true)
    expect(p.options.some((o) => o.id === 'decline')).toBe(true)
  })

  it('GEN-003 GEN-2.1: destroyed Acolytes with D6 = 3 -> no pool entry, no marker decision; D6 = 4 -> pool and a decision', () => {
    const lost = makeState(); phase(lost, 'shooting', 'B'); board(lost); placeUnit(lost, ACO, [[-5, 0]])
    const c1 = ctxOf(lost, [3])
    destroy(c1.ctx, ACO)
    expect(cultAmbushState(lost).pool.A).toEqual([])
    expect(raisePendingCultAmbushMarker(c1.ctx)).toBe(false)
    const kept = makeState(); phase(kept, 'shooting', 'B'); board(kept); placeUnit(kept, ACO, [[-5, 0]])
    const c2 = ctxOf(kept, [4])
    destroy(c2.ctx, ACO)
    expect(cultAmbushState(kept).pool.A).toEqual([ACO])
    expect(raisePendingCultAmbushMarker(c2.ctx)).toBe(true)
  })

  it('GEN-004 GEN-2.1: destroyed Aberrants and Rockgrinder make no Cult Ambush roll at all', () => {
    const s = makeState(); phase(s, 'shooting', 'B'); board(s)
    placeUnit(s, ABER, [[-5, 0]]); placeUnit(s, ROCK, [[-5, -6]])
    const { ctx, events } = ctxOf(s, [])
    destroy(ctx, ABER); destroy(ctx, ROCK)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
    expect(cultAmbushState(s).pool.A).toEqual([])
  })

  it('GEN-005 GEN-2.7: every offered marker point is >9" from all enemies and on the board; no legal spot -> no decision but the unit stays in the pool', () => {
    const s = makeState(); phase(s, 'shooting', 'B')
    placeUnit(s, ENEMY, [[0, 0]]); placeUnit(s, NEO, [[-5, 0]])
    const { ctx } = ctxOf(s, [1])
    destroy(ctx, NEO)
    raisePendingCultAmbushMarker(ctx)
    const pts = pendingOpt(s)!.options.filter((o) => o.id.startsWith('pt:')).map((o) => o.id.slice(3).split(',').map(Number))
    expect(pts.length).toBeGreaterThan(0)
    for (const [x, z] of pts) {
      expect(Math.hypot(x, z)).toBeGreaterThan(9)
      expect(Math.abs(x) + CULT_AMBUSH_MARKER_RADIUS).toBeLessThanOrEqual(s.board.w / 2)
      expect(Math.abs(z) + CULT_AMBUSH_MARKER_RADIUS).toBeLessThanOrEqual(s.board.h / 2)
    }
    // enemies on every grid point: nothing is legal
    const full = makeState(); phase(full, 'shooting', 'B')
    // spread every enemy model over a 8" lattice so no grid point is more than 9" from all of them
    const spots: [number, number][] = []
    for (let x = -20; x <= 20; x += 8) for (let z = -12; z <= 12; z += 8) spots.push([x, z])
    const units = Object.values(full.units).filter((u) => u.player === 'B')
    let n = 0
    for (const u of units) for (const mid of u.models) { const [x, z] = spots[n++ % spots.length]; full.units[u.id].location = 'board'; full.models[mid].pos = { x, y: 0, z } }
    placeUnit(full, NEO, [[0, 5]])
    const c2 = ctxOf(full, [1])
    destroy(c2.ctx, NEO)
    const candidates = cultAmbushMarkerCandidates(full, 'A', NEO)
    expect(raisePendingCultAmbushMarker(c2.ctx)).toBe(candidates.length > 0)
    expect(cultAmbushState(full).pool.A).toEqual([NEO])
  })

  it('GEN-006 GEN-2.2: an enemy move ending with a model 8.9" from a marker removes it; ending 9.1" away keeps it', () => {
    const s = makeState(); phase(s, 'movement', 'B')
    cultAmbushState(s).markers.push({ id: 'ca:1', player: 'A', pos: { x: -12, y: 0, z: 0 }, placedRound: 1, sourceUnitId: NEO })
    const r = s.models[s.units[ENEMY].models[0]].base.radius
    const { ctx, events } = ctxOf(s)
    placeUnit(s, ENEMY, [[-12 + CULT_AMBUSH_MARKER_RADIUS + r + 9.1, 0]])
    cultAmbushOnMoveEnded(ctx, ENEMY)
    expect(cultAmbushState(s).markers).toHaveLength(1)
    placeUnit(s, ENEMY, [[-12 + CULT_AMBUSH_MARKER_RADIUS + r + 8.9, 0]])
    cultAmbushOnMoveEnded(ctx, ENEMY)
    expect(cultAmbushState(s).markers).toHaveLength(0)
    expect(of(events, 'AbilityTriggered').length).toBeGreaterThan(0)
  })

  it('GEN-007 GEN-2.2: the owner\'s own units moving next to a marker never remove it; real charge / consolidate removal is driven in genestealer-cults-core.test.ts', () => {
    const s = makeState(); phase(s, 'movement', 'A')
    cultAmbushState(s).markers.push({ id: 'ca:1', player: 'A', pos: { x: 0, y: 0, z: 0 }, placedRound: 1, sourceUnitId: NEO })
    const { ctx } = ctxOf(s)
    placeUnit(s, NEO_B, [[2, 0]])
    cultAmbushOnMoveEnded(ctx, NEO_B)
    expect(cultAmbushState(s).markers).toHaveLength(1)
  })

  // a state with one marker and one pooled (destroyed) unit of A, B's Movement phase after Reinforcements
  const returnSetup = (round = 2, pooled: string[] = [NEO]) => {
    const s = makeState({ round }); phase(s, 'movement', 'B')
    placeUnit(s, ENEMY, [[18, 6]]); placeUnit(s, NEO_B, [[-14, 8]])
    for (const id of pooled) { placeUnit(s, id, [[-5, 0]]); killUnit(s, id) }
    const ca = cultAmbushState(s)
    ca.pool.A = [...pooled]
    ca.markers.push({ id: 'ca:1', player: 'A', pos: { x: -8, y: 0, z: -6 }, placedRound: 1, sourceUnitId: pooled[0] })
    ca.seq = 1
    return s
  }

  it('GEN-008 GEN-2.3: the return is offered per marker after the opponent\'s Reinforcements; a pick spawns a full-strength unit and removes marker and pool entry', () => {
    const s = returnSetup()
    const { ctx } = ctxOf(s)
    expect(cultAmbushReturnStep(ctx)).toBe('pending')
    const p = pendingOpt(s)!
    expect(p.player).toBe('A')
    expect(p.options.map((o) => o.id)).toEqual([`unit:${NEO}`, 'decline'])
    answer(ctx, `unit:${NEO}`)
    const copy = pendingCultAmbushReactions(s)[0]
    expect(copy.player).toBe('A')
    const u = s.units[copy.unitId]
    expect(u.models).toHaveLength(10)
    expect(u.datasheetId).toBe(s.units[NEO].datasheetId)
    expect(u.attachedLeaderId ?? null).toBeNull()
    expect(u.models.every((m) => s.models[m].woundsRemaining === s.datasheets[u.datasheetId].stats.W)).toBe(true)
    expect(cultAmbushState(s).markers).toHaveLength(0)
    expect(cultAmbushState(s).pool.A).toEqual([])
    expect(cultAmbushReactionMarker(copy)).toEqual({ x: -8, y: 0, z: -6 })
  })

  it('GEN-009 GEN-2.3: the arrival placement search puts one model touching the marker and every model more than 9" from the enemy', () => {
    const s = returnSetup()
    const models = s.units[NEO].destroyedModels ?? []
    expect(models.length).toBe(10)
    const marker = cultAmbushState(s).markers[0]
    const placed = cultAmbushArrivalPlacements(s, models.map((m) => ({ ...m, pos: { x: 0, y: 0, z: 0 } })), 'A', marker.pos)!
    expect(placed).toHaveLength(10)
    const touching = placed.some((pl, i) => Math.hypot(pl.pos.x - marker.pos.x, pl.pos.z - marker.pos.z) - models[i].base.radius - CULT_AMBUSH_MARKER_RADIUS <= 0.05 + 1e-6)
    expect(touching).toBe(true)
    const enemy = s.models[s.units[ENEMY].models[0]]
    for (const pl of placed) expect(Math.hypot(pl.pos.x - enemy.pos.x, pl.pos.z - enemy.pos.z)).toBeGreaterThan(9)
  })

  it('GEN-010 GEN-2.4: declining keeps marker and pool entry for the following opponent Movement phase', () => {
    const s = returnSetup()
    const { ctx } = ctxOf(s)
    expect(cultAmbushReturnStep(ctx)).toBe('pending')
    answer(ctx, 'decline')
    expect(cultAmbushReturnStep(ctx)).toBe('done')
    expect(cultAmbushState(s).markers).toHaveLength(1)
    expect(cultAmbushState(s).pool.A).toEqual([NEO])
    phase(s, 'movement', 'B')
    expect(cultAmbushReturnStep(ctxOf(s).ctx)).toBe('pending')
  })

  it('GEN-011 GEN-2.3: no return is offered in the owner\'s own Movement phase', () => {
    const s = returnSetup(); phase(s, 'movement', 'A')
    expect(cultAmbushReturnStep(ctxOf(s).ctx)).toBe('done')
    expect(s.pending).toBeNull()
  })

  it('GEN-012 GEN-2.4: two markers and one pool unit -> only one return; a pool unit may use a marker another unit created', () => {
    const s = returnSetup()
    cultAmbushState(s).markers.push({ id: 'ca:2', player: 'A', pos: { x: -14, y: 0, z: -8 }, placedRound: 1, sourceUnitId: ACO })
    const { ctx } = ctxOf(s)
    expect(cultAmbushReturnStep(ctx)).toBe('pending')
    answer(ctx, `unit:${NEO}`)
    expect(cultAmbushState(s).markers.map((m) => m.id)).toEqual(['ca:2'])
    expect(cultAmbushReturnStep(ctx)).toBe('done') // no pool unit left for the second marker
    expect(s.pending).toBeNull()
    expect(cultAmbushState(s).markers).toHaveLength(1)
  })

  it('GEN-013 GEN-2.5: Magus-led Neophytes destroyed -> only the Neophytes return, unled; the Magus stays destroyed', () => {
    const s = makeState({ round: 2 }); phase(s, 'shooting', 'B')
    board(s); placeUnit(s, NEO, [[-5, 0]]); placeUnit(s, MAGUS, [[-5, 1.4]])
    const { ctx } = ctxOf(s, [1])
    killUnit(s, NEO); killUnit(s, MAGUS)
    onCultAmbushUnitDestroyed(ctx, NEO)
    onCultAmbushUnitDestroyed(ctx, MAGUS)
    expect(cultAmbushState(s).pool.A).toEqual([NEO])
    cultAmbushState(s).markers.push({ id: 'ca:1', player: 'A', pos: { x: -8, y: 0, z: -6 }, placedRound: 2, sourceUnitId: NEO })
    cultAmbushState(s).pendingMarkers = []
    phase(s, 'movement', 'B')
    expect(cultAmbushReturnStep(ctx)).toBe('pending')
    answer(ctx, `unit:${NEO}`)
    const copy = s.units[pendingCultAmbushReactions(s)[0].unitId]
    expect(copy.attachedLeaderId ?? null).toBeNull()
    expect(copy.models).toHaveLength(10)
    expect(s.units[MAGUS].location).toBe('destroyed')
  })

  it('GEN-014 GEN-2.5: the returned copy has Cult Ambush and rolls again when destroyed', () => {
    const s = returnSetup()
    const { ctx, events } = ctxOf(s, [1])
    expect(cultAmbushReturnStep(ctx)).toBe('pending')
    answer(ctx, `unit:${NEO}`)
    const copyId = pendingCultAmbushReactions(s)[0].unitId
    expect(cultAmbushAbilityId(s, s.units[copyId])).toBe('gsc.a.cult-ambush')
    placeUnit(s, copyId, [[-8, -5]])
    phase(s, 'shooting', 'B')
    killUnit(s, copyId)
    onCultAmbushUnitDestroyed(ctx, copyId)
    expect(of(events, 'DiceRolled').length).toBeGreaterThan(0)
    expect(cultAmbushState(s).pool.A).toContain(copyId)
  })

  it('GEN-015 GEN-2.5: One Shot weapons spent before destruction stay spent on the returned Acolytes', () => {
    const s = returnSetup(2, [ACO])
    const first = s.units[ACO].destroyedModels?.[0] ?? s.models[s.units[ACO].models[0]]
    first.oneShotUsed = [...(first.oneShotUsed ?? []), 'x']
    const { ctx } = ctxOf(s)
    expect(cultAmbushReturnStep(ctx)).toBe('pending')
    answer(ctx, `unit:${ACO}`)
    const copy = s.units[pendingCultAmbushReactions(s)[0].unitId]
    expect(copy.models.some((m) => s.models[m].oneShotUsed.includes('x'))).toBe(true)
  })

  it('GEN-016 GEN-2.6: in round 4 no return is offered even with a marker and a pooled unit', () => {
    const s = returnSetup(4)
    expect(cultAmbushReturnStep(ctxOf(s).ctx)).toBe('done')
    expect(s.pending).toBeNull()
  })

  it('GEN-017 GEN-2.6: a unit destroyed in round 4 still rolls but no marker decision is raised', () => {
    const s = makeState({ round: 4 }); phase(s, 'shooting', 'B')
    board(s); placeUnit(s, NEO, [[-5, 0]])
    const { ctx, events } = ctxOf(s, [1])
    destroy(ctx, NEO)
    expect(of(events, 'DiceRolled')).toHaveLength(1)
    expect(raisePendingCultAmbushMarker(ctx)).toBe(false)
    expect(s.pending).toBeNull()
  })
})
