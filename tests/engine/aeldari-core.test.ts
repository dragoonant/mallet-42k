// Aeldari engine changes (docs/spec/factions/aeldari.md §7.1 E1-E3, E5; checklist AEL-005..010, 011, 013, 021):
// Strands of Fate Fate pool (generalised Miracle pool), damage-roll re-rolls, enhancement stratagem cost overrides,
// queued reactive moves. E4 (evaluateCondition) and the code hooks belong to the faction/hook agents.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type ModuleTable, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectiveCost, ignoresLimit } from '../../src/engine/stratagems'
import { miracleGate, miracleHandler, setFatePool, substitutionEligible, hasStrandsOfFate, unitHasStrandsOfFate, diePoolName } from '../../src/engine/miracle'
import { shootingModule } from '../../src/engine/phases/shooting'
import { startReactiveMove } from '../../src/engine/phases/movement'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const AEL = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Aeldari', faction: 'aeldari', patrolId: 'ael.cp.the-fatebreakers', enhancementId: 'ael.e.foresight',
  secondaryId: 'ael.sec.ineffable-agenda', attachments: [{ leaderRef: 'farseer', bodyguardRef: 'guardians' }], reserves: [], battleReadyVp: 0, ...o,
})
const ADE = (): PlayerSetup => ({
  name: 'Sororitas', faction: 'adepta-sororitas', patrolId: 'ade.cp.sanctuary-guardians', enhancementId: 'ade.e.defender-of-the-faith',
  secondaryId: 'ade.sec.hallowed-retribution', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sacresants' }], reserves: [], battleReadyVp: 0,
})
const FAR = 'A:farseer', GUA = 'A:guardians', WIN = 'A:windriders', WRA = 'A:wraithlord'
const EGUA = 'B:guardians', EWRA = 'B:wraithlord'

function makeState(a: PlayerSetup = AEL(), b: PlayerSetup = AEL()): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: a, B: b },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'ael-core', ENGINE_VERSION)
  s.round = 2; s.activePlayer = 'A'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
  s.players.A.cp = 0; s.players.B.cp = 0
  return s
}
function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const modelWith = (s: GameState, unitId: string, weaponId: string): string => {
  const id = s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))
  if (!id) throw new Error(`no model of ${unitId} carries ${weaponId}`)
  return id
}
const SIX = Array.from({ length: 80 }, () => 6)
const pool = (s: GameState, p: 'A' | 'B', dice: number[]): void => { s.players[p].miracle.dice = [...dice] }

function answer(ctx: EngineContext, optionId: string, dieIndexes?: number[]): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const action = { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId, ...(dieIndexes ? { dieIndexes } : {}) } as Action
  const owner = pending.context.topic === 'miracleDie' ? miracleHandler : attackService.handler
  const rej = owner.handle(ctx, action, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
function drive(ctx: EngineContext, onMiracle: (p: ChooseOptionDecision) => { id: string; dice?: number[] } = () => ({ id: 'skip' })): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('drive: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without decision')
    if (pending.kind === 'chooseOption' && pending.context.topic === 'miracleDie') {
      const a = onMiracle(pending)
      answer(ctx, a.id, a.dice)
    } else {
      const action = ('options' in pending && pending.options.length > 0 ? pending.options[0].action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
      ctx.state.pending = null
      const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
      const rej = owner.handle(ctx, action, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    }
    r = attackService.advance(ctx)
  }
}

// =====================================================================================================================
describe('E1 Strands of Fate: the Fate pool (generalised Miracle pool)', () => {
  it('AEL-010 AEL-2.5: marker queries - Farseer, Guardians and Windriders carry Strands of Fate, the Wraithlord does not', () => {
    const s = makeState()
    expect(hasStrandsOfFate(s, 'A')).toBe(true)
    expect(unitHasStrandsOfFate(s, FAR)).toBe(true)
    expect(unitHasStrandsOfFate(s, GUA)).toBe(true)
    expect(unitHasStrandsOfFate(s, WIN)).toBe(true)
    expect(unitHasStrandsOfFate(s, WRA)).toBe(false)
    expect(diePoolName(s, 'A')).toBe('Fate')
    expect(diePoolName(makeState(AEL(), ADE()), 'B')).toBe('Miracle')
  })

  it('AEL-010 AEL-2.5: Wraithlord rolls are never eligible even with a non-empty pool', () => {
    const s = makeState()
    pool(s, 'A', [6, 5])
    for (const p of ['hit', 'wound', 'save', 'charge'] as const) expect(substitutionEligible(s, { purpose: p, player: 'A', unitId: WRA, sides: 6 })).toBe(false)
    expect(substitutionEligible(s, { purpose: 'hit', player: 'A', unitId: GUA, sides: 6 })).toBe(true)
  })

  it('AEL-009 AEL-2.4: only D6 hit/wound/save/damage/charge/advance/battle-shock rolls qualify - not a D3 Damage, Hazardous, Deadly Demise, an attack count or an ability roll', () => {
    const s = makeState()
    pool(s, 'A', [6])
    for (const p of ['hit', 'wound', 'save', 'damage', 'charge', 'advance', 'battleShock'] as const) expect(substitutionEligible(s, { purpose: p, player: 'A', unitId: FAR, sides: 6 })).toBe(true)
    for (const p of ['hazardous', 'deadlyDemise', 'attacks', 'ability', 'fnp'] as const) expect(substitutionEligible(s, { purpose: p, player: 'A', unitId: FAR, sides: 6 })).toBe(false)
    expect(substitutionEligible(s, { purpose: 'damage', player: 'A', unitId: FAR, sides: 3 })).toBe(false)
    pool(s, 'A', [])
    expect(substitutionEligible(s, { purpose: 'hit', player: 'A', unitId: GUA, sides: 6 })).toBe(false)
    pool(s, 'A', [6])
    expect(substitutionEligible(s, { purpose: 'hit', player: 'A', unitId: EGUA, sides: 6 })).toBe(false) // the opponent's unit is not the roller's
  })

  it('AEL-008 AEL-2.3: no per-phase cap - a unit that already spent a Fate die this phase stays eligible', () => {
    const s = makeState()
    pool(s, 'A', [6, 5])
    s.players.A.miracle.spentThisPhase = [GUA, FAR]
    expect(substitutionEligible(s, { purpose: 'hit', player: 'A', unitId: GUA, sides: 6 })).toBe(true)
  })

  it('AEL-003 AEL-2.1: setFatePool replaces the pool and emits one MiracleDieGained per die; bad values are refused', () => {
    const s = makeState()
    pool(s, 'A', [1, 1, 1])
    const { ctx, events } = ctxOf(s)
    setFatePool(ctx, 'A', [6, 2, 4], 'ael.a.strands-of-fate')
    expect(s.players.A.miracle.dice).toEqual([6, 2, 4])
    expect(of(events, 'MiracleDieGained').map((e) => [e.player, e.value, e.source])).toEqual([['A', 6, 'ael.a.strands-of-fate'], ['A', 2, 'ael.a.strands-of-fate'], ['A', 4, 'ael.a.strands-of-fate']])
    expect(() => setFatePool(ctx, 'A', [7], 'x')).toThrow()
    expect(() => setFatePool(ctx, 'A', [0], 'x')).toThrow()
    expect(s.players.A.miracle.dice).toEqual([6, 2, 4])
  })

  it('AEL-005 AEL-2.2: a Fate die 6 replaces a catapult hit die -> unmodified 6, leaves the pool, option label says Fate', () => {
    const s = makeState()
    placeUnit(s, GUA, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, EGUA, { x: 8, z: -3, gap: 0.3 })
    pool(s, 'A', [6])
    const shooter = modelWith(s, GUA, 'ael.w.shuriken-catapult')
    const { ctx, events } = ctxOf(s, [2, 2, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: GUA, overwatch: false, targets: [target(shooter, 'ael.w.shuriken-catapult', EGUA)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.topic).toBe('miracleDie')
    expect(pending.options.map((o) => o.label)).toEqual(['Roll normally', 'Use Fate die 6'])
    answer(ctx, 'use:0')
    expect(s.players.A.miracle.dice).toEqual([])
    drive(ctx)
    const hitRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'hit')!.roll
    expect(hitRoll.dice[0]).toBe(6)
    expect(hitRoll.substituted).toEqual([0])
    expect(of(events, 'MiracleDieSpent')).toMatchObject([{ mode: 'substitute', value: 6, unitId: GUA, purpose: 'hit', player: 'A', source: 'strandsOfFate' }])
  })

  it('AEL-008 AEL-2.3: a 2-attack batch accepts two Fate dice in one decision; both leave the pool and both MiracleDieSpent events fire', () => {
    const s = makeState()
    placeUnit(s, GUA, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, EGUA, { x: 8, z: -3, gap: 0.3 })
    pool(s, 'A', [6, 5, 4])
    const shooter = modelWith(s, GUA, 'ael.w.shuriken-catapult')
    const { ctx, events } = ctxOf(s, [1, 1, 1, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: GUA, overwatch: false, targets: [target(shooter, 'ael.w.shuriken-catapult', EGUA)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.data).toMatchObject({ purpose: 'hit', count: 2, maxSubstitutions: 2, pool: [6, 5, 4] })
    // more than the cap, or the same die twice, is refused (pool untouched)
    const bad = (idx: number[]) => miracleHandler.validate!(s, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'use', dieIndexes: idx } as Action, pending as PendingDecision)
    expect(bad([0, 1, 2])).not.toBeNull()
    expect(bad([1, 1])).not.toBeNull()
    expect(bad([0, 3])).not.toBeNull()
    expect(bad([])).not.toBeNull()
    expect(bad([2, 0])).toBeNull()
    answer(ctx, 'use', [2, 0])
    expect(s.players.A.miracle.dice).toEqual([5])
    drive(ctx)
    const hitRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'hit')!.roll
    expect(hitRoll.dice.slice(0, 2)).toEqual([4, 6])
    expect(hitRoll.substituted).toEqual([0, 1])
    expect(of(events, 'MiracleDieSpent').map((e) => e.value)).toEqual([4, 6])
  })

  it('AEL-008 AEL-2.3: single rolls and 2D6 rolls stay at 1 die; a batch is capped by the pool size; the Sororitas batch caps at 1', () => {
    const s = makeState()
    pool(s, 'A', [6, 5, 4])
    const { ctx } = ctxOf(s)
    // charge 2D6: one Fate die only
    expect(miracleGate(ctx, 'k1', { purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: WIN })).toBe('pending')
    expect((s.pending as unknown as ChooseOptionDecision).context.data).toMatchObject({ maxSubstitutions: 1 })
    s.pending = null
    // a 10-attack batch with a 3-die pool: 3
    expect(miracleGate(ctx, 'k2', { purpose: 'hit', player: 'A', sides: 6, count: 10, mode: 'perDie', unitId: GUA }, true)).toBe('pending')
    expect((s.pending as unknown as ChooseOptionDecision).context.data).toMatchObject({ maxSubstitutions: 3 })
    s.pending = null
    // a one-attack batch: 1
    expect(miracleGate(ctx, 'k3', { purpose: 'hit', player: 'A', sides: 6, count: 1, mode: 'perDie', unitId: GUA }, true)).toBe('pending')
    expect((s.pending as unknown as ChooseOptionDecision).context.data).toMatchObject({ maxSubstitutions: 1 })

    const t = makeState(ADE(), AEL())
    t.players.A.miracle.dice = [6, 5, 4]
    const c2 = ctxOf(t).ctx
    expect(miracleGate(c2, 'k4', { purpose: 'hit', player: 'A', sides: 6, count: 6, mode: 'perDie', unitId: 'A:sisters' }, true)).toBe('pending')
    expect((t.pending as ChooseOptionDecision).context.data).toMatchObject({ maxSubstitutions: 1 })
    expect((t.pending as ChooseOptionDecision).options.map((o) => o.label)).toContain('Use Miracle die 6')
    // ... and a Sororitas answer naming two dice is refused
    expect(miracleHandler.validate!(t, { type: 'chooseOption', player: 'A', decisionId: (t.pending as PendingDecision).id, optionId: 'use', dieIndexes: [0, 1] } as Action, t.pending as PendingDecision)).not.toBeNull()
  })

  it('AEL-009 AEL-2.4: a Fate-substituted die is not re-rollable (the Command Re-roll / re-roll path leaves it alone)', () => {
    const s = makeState()
    const { ctx } = ctxOf(s, [3, 3, 3, 3])
    const roll = ctx.roll({ purpose: 'hit', player: 'A', count: 2, mode: 'perDie', unitId: GUA, substitute: [6] })
    expect(roll.substituted).toEqual([0])
    const after = ctx.reroll(roll, [0, 1], 'test')
    expect(after.dice[0]).toBe(6)
  })
})

// =====================================================================================================================
describe('E2 Damage-roll re-rolls (Eldritch Might)', () => {
  const eldritch = () => makeState(AEL({ enhancementId: 'ael.e.eldritch-might' }), AEL())

  it('AEL-013 AEL-3: the bearer Psychic weapon re-rolls a Damage roll of 1 (D3 result 1 -> new roll)', () => {
    const s = eldritch()
    placeUnit(s, FAR, [[-12, -3]])
    placeUnit(s, EGUA, { x: 8, z: -3, gap: 0.3 })
    // attacks D6 -> 1 (Blast adds 2); hits 1,6,6 and the 1 is re-rolled to a 6; wounds 6,6,6; saves 1,1,6; first Damage D3 roll 1 -> re-rolled to 6 (= 3)
    const { ctx, events } = ctxOf(s, [1, 1, 6, 6, 6, 6, 6, 6, 1, 1, 6, 1, 6, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: FAR, overwatch: false, targets: [target(s.units[FAR].models[0], 'ael.w.eldritch-storm', EGUA)] })
    drive(ctx)
    const dmgRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'damage')
    if (dmgRoll?.roll.dice[0] !== 1) throw new Error(events.map((e) => e.type + (e.type === 'DiceRolled' ? ':' + e.roll.purpose + ':' + e.roll.dice.join('') : '')).join(' '))
    expect(dmgRoll!.roll.dice[0]).toBe(1)
    const rr = of(events, 'DiceRerolled').filter((r) => r.rollId === dmgRoll!.roll.id)
    expect(rr).toHaveLength(1)
    expect(rr[0].before).toEqual([1])
  })

  it('AEL-013 AEL-3: without the enhancement the Damage 1 stands', () => {
    const s = makeState() // Foresight, not Eldritch Might
    placeUnit(s, FAR, [[-12, -3]])
    placeUnit(s, EGUA, { x: 8, z: -3, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1, 1, 6, 6, 6, 6, 1, 1, 1, 6, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: FAR, overwatch: false, targets: [target(s.units[FAR].models[0], 'ael.w.eldritch-storm', EGUA)] })
    drive(ctx)
    const dmgRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'damage')
    expect(dmgRoll?.roll.dice[0]).toBe(1)
    expect(of(events, 'DiceRerolled').some((r) => r.rollId === dmgRoll!.roll.id)).toBe(false)
  })
})

// =====================================================================================================================
describe('E3 Foresight: enhancement-sourced stratagem cost override', () => {
  it('AEL-011 AEL-3: the bearer unit (Farseer + Guardians, either half) fires Overwatch for 0 CP; other units pay 1 CP; the once-per-turn limit still applies', () => {
    const s = makeState()
    const ow = s.stratagems['core.s.fire-overwatch']
    expect(ow).toBeDefined()
    expect(effectiveCost(s, 'A', ow, [GUA])).toBe(0)
    expect(effectiveCost(s, 'A', ow, [FAR])).toBe(0)
    expect(effectiveCost(s, 'A', ow, [WIN])).toBe(1)
    expect(effectiveCost(s, 'B', ow, [EGUA])).toBe(0) // the opponent's Foresight bearer
    expect(ignoresLimit(s, 'A', ow, [GUA])).toBe(false)
  })
})

// =====================================================================================================================
describe('E5 queued reactive moves (Zephyr-swift on two squads)', () => {
  it('AEL-021 AEL-5: reactive moves run one after the other, each raised under the same window', () => {
    const s = makeState()
    placeUnit(s, GUA, s.units[GUA].models.map((_, i): [number, number] => [-20 + (i % 6) * 1.5, -12 + Math.floor(i / 6) * 1.5]))
    placeUnit(s, WIN, { x: -20, z: 0, gap: 0.3 })
    placeUnit(s, WRA, [[-20, 12]])
    const { ctx, events } = ctxOf(s)
    startReactiveMove(ctx, GUA, 6, 'ael.s.zephyr-swift', 'shooting.start', [{ unitId: WIN, distance: 6 }, { unitId: WRA, distance: 6 }])
    let pending = s.pending as unknown as PendingDecision & { kind: "moveUnit" }
    expect(pending.kind).toBe('moveUnit')
    expect(pending.context.unitId).toBe(GUA)
    expect(pending.window).toBe('shooting.start')
    // first unit moves
    let legal = shootingModule.legalActions!(s, pending)!
    if (!legal.some((a) => a.type === 'moveUnit')) throw new Error('legal: ' + JSON.stringify(legal.map((a) => a.type)) + ' models ' + s.units[GUA].models.map((m) => JSON.stringify(s.models[m].pos)).join(' '))
    let mv = legal.find((a) => a.type === 'moveUnit') as Extract<Action, { type: 'moveUnit' }>
    s.pending = null
    expect(shootingModule.handle(ctx, mv, pending)).toBeUndefined()
    // the second starts at once, same window
    pending = s.pending as unknown as PendingDecision & { kind: "moveUnit" }
    expect(pending).not.toBeNull()
    expect(pending.context.unitId).toBe(WIN)
    expect(pending.window).toBe('shooting.start')
    // the second passes -> the third starts
    s.pending = null
    expect(shootingModule.handle(ctx, { type: 'pass', player: 'A', decisionId: pending.id }, pending)).toBeUndefined()
    pending = s.pending as unknown as PendingDecision & { kind: "moveUnit" }
    expect(pending.context.unitId).toBe(WRA)
    legal = shootingModule.legalActions!(s, pending)!
    mv = legal.find((a) => a.type === 'moveUnit') as Extract<Action, { type: 'moveUnit' }>
    s.pending = null
    expect(shootingModule.handle(ctx, mv, pending)).toBeUndefined()
    expect(s.pending).toBeNull() // queue empty
    expect(of(events, 'UnitMoved').map((e) => e.unitId)).toEqual([GUA, WRA])
    expect(s.phaseState.marks.some((m) => m.startsWith('mv:reactive='))).toBe(false)
  })

  it('AEL-021 AEL-5: a queued unit now in Engagement Range of an enemy is skipped; with no queue the call is unchanged', () => {
    const s = makeState()
    placeUnit(s, GUA, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, WIN, { x: 0, z: 3, gap: 0.3 })
    placeUnit(s, EWRA, [[0, 4.5]]) // touching the Windriders
    const { ctx } = ctxOf(s)
    startReactiveMove(ctx, GUA, 6, 'ael.s.zephyr-swift', 'shooting.start', [{ unitId: WIN, distance: 6 }])
    const pending = s.pending as unknown as PendingDecision & { kind: "moveUnit" }
    s.pending = null
    expect(shootingModule.handle(ctx, { type: 'pass', player: 'A', decisionId: pending.id }, pending)).toBeUndefined()
    expect(s.pending).toBeNull()

    const t = makeState()
    placeUnit(t, GUA, { x: -12, z: -3, gap: 0.3 })
    const c2 = ctxOf(t).ctx
    startReactiveMove(c2, GUA, 6, 'x')
    expect((t.pending as PendingDecision & { kind: 'moveUnit' }).window).toBe('movement.unitMoved')
  })
})
