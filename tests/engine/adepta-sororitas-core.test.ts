// Adepta Sororitas engine changes (docs/spec/factions/adepta-sororitas.md §7 E1-E4, 12-checklist ADE-004..013, 023-028, 031):
// Miracle dice (gain, substitution, spentThisPhase), FNP against mortal wounds, critical-wound AP, deferred removal.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, setModelPos,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { canReroll } from '../../src/engine/dice'
import { fightModule } from '../../src/engine/phases/fight'
import { shootingModule } from '../../src/engine/phases/shooting'
import {
  clearActsOfFaithPhase, discardMiracleDie, gainMiracleDie, hasActsOfFaith, miracleHandler, runActsOfFaithTurnStart, substitutionEligible,
} from '../../src/engine/miracle'
import { resolveDeferredActivations } from '../../src/engine/deferred'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const ADE = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Sororitas', faction: 'adepta-sororitas', patrolId: 'ade.cp.sanctuary-guardians', enhancementId: 'ade.e.defender-of-the-faith',
  secondaryId: 'ade.sec.hallowed-retribution', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sacresants' }], reserves: [], battleReadyVp: 0, ...o,
})

const SIS = 'A:sisters', SAC = 'A:sacresants', CAN = 'A:canoness', ARC = 'A:arcos'
const ESIS = 'B:sisters', ESAC = 'B:sacresants', ECAN = 'B:canoness', EARC = 'B:arcos'

function makeState(round = 2): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: ADE(), B: ADE() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'ade-core', ENGINE_VERSION)
  s.round = round
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = 0
  s.players.B.cp = 0
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
const SIX = Array.from({ length: 60 }, () => 6)

// answers the open decision with `optionId` (+ dieIndexes) through the module that owns it
function answer(ctx: EngineContext, optionId: string, dieIndexes?: number[]): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const action = { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId, ...(dieIndexes ? { dieIndexes } : {}) } as Action
  const owner = pending.context.topic === 'miracleDie' ? miracleHandler : attackService.handler
  const rej = owner.handle(ctx, action, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

// drives the attack sequence; every open miracleDie decision is answered by `onMiracle` (default: skip), anything else takes option 0
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

function pool(s: GameState, p: 'A' | 'B', dice: number[]): void { s.players[p].miracle.dice = [...dice] }

// =====================================================================================================================
describe('Acts of Faith: gaining Miracle dice (E1)', () => {
  it('ADE-004 ADE-2.1: a die is gained at the start of every turn, for both players, and the marker ability is detected', () => {
    const s = makeState()
    expect(hasActsOfFaith(s, 'A')).toBe(true)
    const { ctx, events } = ctxOf(s, [3, 5])
    runActsOfFaithTurnStart(ctx)
    const gained = of(events, 'MiracleDieGained')
    expect(gained.map((e) => [e.player, e.value])).toEqual([['A', 3], ['B', 5]])
    expect(s.players.A.miracle.dice).toEqual([3])
    expect(s.players.B.miracle.dice).toEqual([5])
  })

  it('ADE-004 ADE-2.1: the gain roll leaves phaseState.lastRoll alone (an in-flight rollOnce re-entry still needs it)', () => {
    const s = makeState()
    const { ctx } = ctxOf(s, [4, 2])
    const mine = ctx.roll({ purpose: 'hit', player: 'A', count: 1 })
    gainMiracleDie(ctx, 'A', 'test')
    expect(s.phaseState.lastRoll?.id).toBe(mine.id)
  })

  it('ADE-005 ADE-2.1: an own ADEPTA SORORITAS unit destroyed -> +1 Miracle die; an enemy unit destroyed -> none', () => {
    const s = makeState()
    const { ctx } = ctxOf(s, [4, 2])
    ctx.emit({ type: 'UnitDestroyed', unitId: SIS, byPlayer: 'B', byUnitId: ESIS, byModelId: null, kind: 'ranged' })
    expect(s.players.A.miracle.dice).toEqual([4])
    expect(s.players.B.miracle.dice).toEqual([])
    ctx.emit({ type: 'UnitDestroyed', unitId: ESIS, byPlayer: 'A', byUnitId: SIS, byModelId: null, kind: 'ranged' })
    expect(s.players.B.miracle.dice).toEqual([2])
  })

  it('ADE-013 ADE-2.6: the led Sacresants (the attached bodyguard half) destroyed -> its own UnitDestroyed grants one die; the Canoness half does not unless it dies too', () => {
    const s = makeState()
    const { ctx } = ctxOf(s, [5])
    ctx.emit({ type: 'UnitDestroyed', unitId: SAC, byPlayer: 'B', byUnitId: ESIS, byModelId: null, kind: 'melee' })
    expect(s.players.A.miracle.dice).toEqual([5])
    expect(s.units[CAN].location).not.toBe('destroyed')
  })

  it('ADE-012 ADE-2.4: discarding a die records nothing in spentThisPhase; clearActsOfFaithPhase empties it', () => {
    const s = makeState()
    pool(s, 'A', [2, 6])
    const { ctx, events } = ctxOf(s)
    expect(discardMiracleDie(ctx, 'A', 1, SIS, 'test')).toBe(6)
    expect(s.players.A.miracle.dice).toEqual([2])
    expect(s.players.A.miracle.spentThisPhase).toEqual([])
    expect(of(events, 'MiracleDieSpent')[0]).toMatchObject({ mode: 'discard', value: 6, unitId: SIS })
    expect(() => discardMiracleDie(ctx, 'A', 4, SIS, 'test')).toThrow()
    s.players.A.miracle.spentThisPhase = [SIS]
    clearActsOfFaithPhase(s)
    expect(s.players.A.miracle.spentThisPhase).toEqual([])
  })
})

// =====================================================================================================================
describe('Acts of Faith: substituting a die (E1)', () => {
  it('ADE-008 ADE-2.2: only D6 hit/wound/save/damage/charge/advance/battle-shock rolls of an own ADEPTA SORORITAS unit with a non-empty pool qualify', () => {
    const s = makeState()
    pool(s, 'A', [6])
    const ok = (purpose: DiceRoll['purpose'], unitId: string | null = SIS, sides: 3 | 6 = 6, player: 'A' | 'B' = 'A') => substitutionEligible(s, { purpose, player, unitId, sides })
    for (const p of ['hit', 'wound', 'save', 'damage', 'charge', 'advance', 'battleShock'] as const) expect(ok(p)).toBe(true)
    for (const p of ['fnp', 'hazardous', 'desperateEscape', 'attacks', 'ability', 'deadlyDemise'] as const) expect(ok(p)).toBe(false)
    expect(ok('hit', null)).toBe(false)
    expect(ok('hit', ESIS)).toBe(false) // not the roller's unit
    pool(s, 'A', [])
    expect(ok('hit')).toBe(false)
  })

  it('ADE-011 ADE-2.3: a D3 damage roll is never eligible; a D6 damage roll is', () => {
    const s = makeState()
    pool(s, 'A', [6])
    expect(substitutionEligible(s, { purpose: 'damage', player: 'A', unitId: SIS, sides: 3 })).toBe(false)
    expect(substitutionEligible(s, { purpose: 'damage', player: 'A', unitId: SIS, sides: 6 })).toBe(true)
  })

  it('ADE-006 ADE-2.2: a Miracle die 6 replaces the hit die of a boltgun volley -> unmodified 6, die leaves the pool, MiracleDieSpent mode substitute', () => {
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, ESIS, { x: 8, z: -3, gap: 0.3 })
    pool(s, 'A', [6])
    const shooter = modelWith(s, SIS, 'ade.w.boltgun')
    // scripted: the real hit die is a 2 (a miss) and is overwritten by the 6; then every later roll is a 6
    const { ctx, events } = ctxOf(s, [2, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SIS, overwatch: false, targets: [target(shooter, 'ade.w.boltgun', ESIS)] })
    expect(attackService.advance(ctx)).toBe('pending')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.topic).toBe('miracleDie')
    expect(pending.context.data).toMatchObject({ purpose: 'hit', unitId: SIS, maxSubstitutions: 1, pool: [6] })
    expect(pending.options.map((o) => o.id)).toEqual(['skip', 'use:0'])
    answer(ctx, 'use', [0])
    expect(s.players.A.miracle.dice).toEqual([])
    expect(s.players.A.miracle.spentThisPhase).toEqual([SIS])
    drive(ctx)
    const hitRoll = of(events, 'DiceRolled').find((e) => e.roll.purpose === 'hit')!.roll
    expect(hitRoll.dice[0]).toBe(6)
    expect(hitRoll.substituted).toEqual([0])
    const hit = of(events, 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 6, critical: true, hit: true })
    expect(of(events, 'MiracleDieSpent')).toMatchObject([{ mode: 'substitute', value: 6, unitId: SIS, purpose: 'hit', player: 'A' }])
    // a second roll of the same unit this phase is not offered another substitution
    pool(s, 'A', [4])
    expect(substitutionEligible(s, { purpose: 'wound', player: 'A', unitId: SIS, sides: 6 })).toBe(false)
  })

  it('ADE-006 declining ("skip") rolls normally and keeps the pool', () => {
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, ESIS, { x: 8, z: -3, gap: 0.3 })
    pool(s, 'A', [6])
    const shooter = modelWith(s, SIS, 'ade.w.boltgun')
    const { ctx, events } = ctxOf(s, [1, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SIS, overwatch: false, targets: [target(shooter, 'ade.w.boltgun', ESIS)] })
    drive(ctx, () => ({ id: 'skip' }))
    expect(of(events, 'HitRolled')[0]).toMatchObject({ die: 1, hit: false })
    expect(s.players.A.miracle.dice).toEqual([6])
    expect(of(events, 'MiracleDieSpent')).toHaveLength(0)
  })

  it('ADE-007 ADE-2.2: a defending ADEPTA SORORITAS unit may substitute its save; the substituted value is the unmodified die, AP still applies', () => {
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, ESIS, { x: 8, z: -3, gap: 0.3 })
    pool(s, 'B', [6])
    const shooter = modelWith(s, SIS, 'ade.w.boltgun')
    // 6 to hit, 6 to wound, real save die 1 -> overwritten by the Miracle 6 -> saved
    const { ctx, events } = ctxOf(s, [6, 6, 1, ...SIX])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SIS, overwatch: false, targets: [target(shooter, 'ade.w.boltgun', ESIS)] })
    let asked: ChooseOptionDecision | null = null
    drive(ctx, (p) => { asked = p; return { id: 'use:0' } })
    expect(asked).not.toBeNull()
    expect((asked as unknown as ChooseOptionDecision).player).toBe('B')
    expect((asked as unknown as ChooseOptionDecision).context.data).toMatchObject({ purpose: 'save', unitId: ESIS })
    const save = of(events, 'SaveRolled')[0]
    expect(save).toMatchObject({ die: 6, saved: true })
    expect(of(events, 'DamageApplied')).toHaveLength(0)
    expect(s.players.B.miracle.spentThisPhase).toEqual([ESIS])
  })

  it('ADE-009 ADE-2.3: a charge roll replaces at most one of the 2D6 (the other is rolled), through rollOnce', () => {
    const s = makeState()
    s.phase = 'charge'
    pool(s, 'A', [5, 3])
    const { ctx } = ctxOf(s, [2, 4])
    const spec = { purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: SIS, commandRerollable: true } as const
    expect(ctx.rollOnce('charge:A:sisters', spec)).toBeNull()
    const pending = s.pending as ChooseOptionDecision
    expect(pending.context.data).toMatchObject({ purpose: 'charge', count: 2, maxSubstitutions: 1, pool: [5, 3] })
    // two distinct die values -> two options with unique ids (use:<index>), each naming one pool index
    expect(pending.options.filter((o) => o.id.startsWith('use')).map((o) => (o.action as { dieIndexes?: number[] }).dieIndexes)).toEqual([[0], [1]])
    answer(ctx, 'use', [1])
    expect(s.players.A.miracle.dice).toEqual([5])
    const roll = ctx.rollOnce('charge:A:sisters', spec) as DiceRoll
    expect(roll.dice).toEqual([3, 4])
    expect(roll.substituted).toEqual([0])
  })

  it('ADE-010 ADE-2.3: a substituted die cannot be re-rolled (canReroll and ctx.reroll leave it alone)', () => {
    const s = makeState()
    const { ctx } = ctxOf(s, [1, 1, 1, 6])
    const roll = ctx.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: SIS, substitute: [6] })
    expect(roll.dice[0]).toBe(6)
    expect(canReroll(roll, 0)).toBe(false)
    expect(canReroll(roll, 1)).toBe(true)
    const again = ctx.reroll(roll, [0, 1], 'test')
    expect(again.dice[0]).toBe(6)
    expect(again.rerolled).toEqual([1])
    // only the substituted die offered -> nothing happens
    const lone = ctx.roll({ purpose: 'hit', player: 'A', count: 1, unitId: SIS, substitute: [6] })
    expect(ctx.reroll(lone, [0], 'test')).toBe(lone)
  })

  it('ADE-012 ADE-2.5: after an Act of Faith the unit is in spentThisPhase and is not offered another this phase', () => {
    const s = makeState()
    pool(s, 'A', [6, 6])
    const { ctx } = ctxOf(s, [2, 2])
    const spec = { purpose: 'advance', player: 'A', sides: 6, count: 1, mode: 'sum', unitId: SIS } as const
    expect(ctx.rollOnce('advance:A:sisters', spec)).toBeNull()
    answer(ctx, 'use', [0])
    expect(ctx.rollOnce('advance:A:sisters', spec)?.dice).toEqual([6])
    expect(s.players.A.miracle.spentThisPhase).toEqual([SIS])
    expect(s.players.A.miracle.dice).toEqual([6])
    // a second roll of the same unit: straight through, no decision
    expect(ctx.rollOnce('advance:A:sisters:again', spec)?.dice).toEqual([2])
    expect(s.pending).toBeNull()
  })

  it('ADE-012 the miracleDie answer is validated: use needs exactly one in-range die index; skip takes none', () => {
    const s = makeState()
    pool(s, 'A', [6])
    const { ctx } = ctxOf(s, [2])
    ctx.rollOnce('advance:A:sisters', { purpose: 'advance', player: 'A', sides: 6, count: 1, mode: 'sum', unitId: SIS })
    const pending = s.pending as PendingDecision
    const base = { type: 'chooseOption', player: 'A', decisionId: pending.id } as const
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use' } as Action, pending)).not.toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use', dieIndexes: [0, 0] } as Action, pending)).not.toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use', dieIndexes: [3] } as Action, pending)).not.toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use', dieIndexes: [0] } as Action, pending)).toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'skip' } as Action, pending)).toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'maybe' } as Action, pending)).not.toBeNull()
  })
})

// =====================================================================================================================
describe('Feel No Pain against mortal wounds (E2)', () => {
  it('ADE-031 ADE-6: Null Rod gives 4+ FNP against mortal wounds only; a normal boltgun attack gets none', () => {
    const s = makeState()
    placeUnit(s, SAC, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, CAN, [[-11, -5]])
    placeUnit(s, ESIS, { x: 8, z: -3, gap: 0.3 })
    // give the Canoness's unit a Null Rod bearer: the datasheet-level marker lives on the ability record
    const nullRod = Object.values(s.abilities).find((a) => a.id === 'ade.a.null-rod')
    expect(nullRod).toBeTruthy()
    const holder = Object.values(s.units).find((u) => s.datasheets[u.datasheetId].abilities.includes('ade.a.null-rod') && u.player === 'A')
    expect(holder).toBeTruthy()
    const shooterModel = modelWith(s, ESIS, 'ade.w.boltgun')
    const targetModel = s.units[holder!.id].models[0]
    const actx: AttackContext = {
      kind: 'ranged', overwatch: false, attackerUnitId: ESIS, attackerModelId: shooterModel, weapon: s.weapons['ade.w.boltgun'], targetUnitId: holder!.id,
      targetModelId: targetModel, range: 10, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
    }
    const fake = { id: 'r:x', purpose: 'fnp', sides: 6, dice: [0], rerolled: null, modifiers: [], final: [0], player: 'A', unitId: holder!.id, modelId: targetModel, weaponId: null, targetUnitId: null, commandRerollable: false } as DiceRoll
    const roll = { purpose: 'fnp' as const, roll: fake, dieIndex: 0, unmodified: 0, rerolled: false }
    const { ctx } = ctxOf(s)
    const fnp = (mortal: boolean) => hookService.collect(ctx, 'onFeelNoPainRoll', { attack: actx, roll, ...(mortal ? { mortal: true } : {}) })
      .map((r) => r.result).filter((r) => r.kind === 'roll' && r.feelNoPain !== undefined)
    expect(fnp(true)).toHaveLength(1)
    expect(fnp(true)[0]).toMatchObject({ feelNoPain: 4 })
    expect(fnp(false)).toHaveLength(0)
  })
})

// =====================================================================================================================
describe('Critical-wound AP (E3)', () => {
  function shootAt(woundDie: number): { saveFinal: number; die: number } {
    const s = makeState()
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, ESAC, { x: 8, z: -3, gap: 0.3 })
    const shooter = modelWith(s, SIS, 'ade.w.boltgun')
    // Ascetic Discipline's effect, granted the way the stratagem grants it
    const { ctx, events } = ctxOf(s, [6, woundDie, 5, ...SIX])
    effectService.grant(ctx, SIS, { critWoundAp: 2 }, { sourceAbilityId: 'ade.s.ascetic-discipline', sourceUnitId: SIS, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: SIS, overwatch: false, targets: [target(shooter, 'ade.w.boltgun', ESAC)] })
    drive(ctx)
    const save = of(events, 'SaveRolled')[0]
    return { saveFinal: save.final, die: save.die }
  }

  it('ADE-023 ADE-5: an unmodified 6 to wound with a boltgun improves its AP by 2 on that attack', () => {
    const { saveFinal, die } = shootAt(6)
    expect(saveFinal).toBe(die - 2)
  })

  it('ADE-023 ADE-5: a non-critical wound keeps AP 0', () => {
    const { saveFinal, die } = shootAt(5)
    expect(saveFinal).toBe(die)
  })

  it('ADE-024 ADE-5: notYetActivated -- true for an own unit that has neither shot nor fought, false once it has been selected', () => {
    const s = makeState()
    s.players.A.cp = 3
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    const ids = (shooting: boolean) => stratagemService.options(s, 'A', 'shooting.start', {}).filter((o) => o.stratagemId === 'ade.s.ascetic-discipline' && (!shooting || true))
      .flatMap((o) => o.targets.unitIds ?? [])
    expect(ids(true)).toContain(SIS)
    s.phaseState.activated = [SIS]
    expect(ids(true)).not.toContain(SIS)
    s.phaseState.activated = []
    s.units[SIS].turn.foughtThisPhase = true
    expect(ids(true)).not.toContain(SIS)
  })

  it('ADE-024 ADE-5: offered in the opponent Fight phase for an own unit that has not yet fought, not in the opponent Shooting phase', () => {
    const s = makeState()
    s.players.A.cp = 3
    placeUnit(s, SIS, { x: -12, z: -3, gap: 0.3 })
    s.activePlayer = 'B'
    s.phase = 'fight'
    s.phaseState.fight = { step: 'remaining', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: 'A', counterOffensive: false }
    const offered = (window: Parameters<typeof stratagemService.options>[2]) => stratagemService.options(s, 'A', window, {})
      .filter((o) => o.stratagemId === 'ade.s.ascetic-discipline').flatMap((o) => o.targets.unitIds ?? [])
    expect(offered('fight.start')).toContain(SIS)
    s.phaseState.fight.fought = [SIS]
    expect(offered('fight.start')).not.toContain(SIS)
    s.phaseState.fight.fought = []
    s.phase = 'shooting'
    expect(offered('shooting.start')).not.toContain(SIS)
  })
})

// =====================================================================================================================
describe('Miracle die option ids and forced Battle-shock tests', () => {
  it('ADE-012 miracleDie options carry unique ids (use:<index>) and the handler resolves the die from the id', () => {
    const s = makeState()
    s.players.A.miracle.dice = [5, 3, 5]
    placeUnit(s, SIS, { x: 0, z: 0, gap: 0.3 })
    const { ctx } = ctxOf(s, [2, 4])
    const spec = { purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: SIS, commandRerollable: true } as const
    expect(ctx.rollOnce('charge:A:uid', spec)).toBeNull()
    const pending = s.pending as ChooseOptionDecision
    const ids = pending.options.map((o) => o.id)
    expect(ids).toEqual(['skip', 'use:0', 'use:1'])
    expect(new Set(ids).size).toBe(ids.length)
    const base = { type: 'chooseOption', player: 'A', decisionId: pending.id } as const
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use:2' } as Action, pending)).toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use:3' } as Action, pending)).not.toBeNull()
    expect(miracleHandler.validate!(s, { ...base, optionId: 'use:1', dieIndexes: [0] } as Action, pending)).not.toBeNull()
    answer(ctx, 'use:1')
    expect(s.players.A.miracle.dice).toEqual([5, 5])
  })

  it('ADE-039 ADE-2.2: a Battle-shock test forced by an ability / stratagem opens a miracleDie decision; the spent die replaces one die and the test finishes on the answer', () => {
    const s = makeState()
    s.players.A.miracle.dice = [6]
    placeUnit(s, SIS, { x: 0, z: 0, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1, 1])
    expect(hookService.battleShockTest(ctx, SIS, 'some-ability')).toBe('pending')
    expect(s.pending && (s.pending as ChooseOptionDecision).context.topic).toBe('miracleDie')
    expect(of(events, 'BattleShockTested')).toHaveLength(0)
    answer(ctx, 'use:0')
    // 6 (Miracle die) + 1 = 7 against the unit's Leadership: passed, die spent, no stale gate marks left
    const tested = of(events, 'BattleShockTested')
    expect(tested).toHaveLength(1)
    expect(tested[0].roll).toBe(7)
    expect(tested[0].passed).toBe(true)
    expect(s.units[SIS].battleShocked).toBe(false)
    expect(s.players.A.miracle.dice).toEqual([])
    expect(s.phaseState.marks.some((m) => m.startsWith('bsresume:') || m.startsWith('miracle:battleShock'))).toBe(false)
  })

  it('ADE-039 ADE-2.2: declining the Miracle die rolls the forced Battle-shock test normally; an already-pending decision or an empty pool never pauses', () => {
    const s = makeState()
    s.players.A.miracle.dice = [6]
    placeUnit(s, SIS, { x: 0, z: 0, gap: 0.3 })
    const { ctx, events } = ctxOf(s, [1, 1])
    expect(hookService.battleShockTest(ctx, SIS, 'some-ability')).toBe('pending')
    answer(ctx, 'skip')
    expect(of(events, 'BattleShockTested')[0]).toMatchObject({ roll: 2, passed: false })
    expect(s.units[SIS].battleShocked).toBe(true)
    expect(s.players.A.miracle.dice).toEqual([6])
    // empty pool: straight through
    const t = makeState()
    placeUnit(t, SIS, { x: 0, z: 0, gap: 0.3 })
    const c2 = ctxOf(t, [1, 1])
    expect(hookService.battleShockTest(c2.ctx, SIS, 'some-ability')).toBe(false)
    expect(t.pending).toBeNull()
  })
})

// =====================================================================================================================
describe("Deferred removal -- A Martyr's Death (E4)", () => {
  // B's Battle Sisters shoot A's Sacresants (A is the defender in B's Shooting phase); A has A Martyr's Death live on the Sacresants
  function setupShooting(): { s: GameState; shooter: string } {
    const s = makeState()
    s.activePlayer = 'B'
    s.phase = 'shooting'
    placeUnit(s, ESIS, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, SAC, { x: 8, z: -3, gap: 0.3 })
    placeUnit(s, CAN, [[9, -5]])
    for (const id of s.units[SAC].models.slice(1)) s.models[id].woundsRemaining = 1
    s.models[s.units[SAC].models[0]].woundsRemaining = 1
    return { s, shooter: modelWith(s, ESIS, 'ade.w.boltgun') }
  }

  it('ADE-025 ADE-5 / ADE-027: a destroyed Sacresant with A Martyr\'s Death live stays (0 W, untargetable, no OC) until the destroying unit has finished, shoots / is removed after', () => {
    const { s } = setupShooting()
    const { ctx, events } = ctxOf(s, [4])
    effectService.grant(ctx, SAC, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SAC, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const victim = s.units[SAC].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: ESIS, modelId: null, kind: 'ranged' })
    // rolled D6 4 -> deferred: still on the table, flagged, announced as destroyed
    expect(s.models[victim]).toBeTruthy()
    expect(s.models[victim].removalDeferred).toBe(true)
    expect(of(events, 'ModelDestroyed').map((e) => e.modelId)).toEqual([victim])
    expect(of(events, 'ModelRemovalDeferred').map((e) => e.modelId)).toEqual([victim])
    expect(s.phaseState.deferredRemovals).toMatchObject([{ unitId: SAC, modelIds: [victim], kind: 'ranged', afterUnitId: ESIS }])
    // not a living model of the unit any more
    expect(hookService.statFor(s, { unitId: SAC, modelId: victim, weapon: null, stat: 'OC' }, 1)).toBeDefined()
    expect(s.units[SAC].models).toContain(victim)
    // nothing left to shoot with (a Sacresant has only a mace) -> resolves at once and the model leaves
    const r = resolveDeferredActivations(ctx, ESIS)
    expect(r).toBe('done')
    expect(s.models[victim]).toBeUndefined()
    expect(s.phaseState.deferredRemovals).toEqual([])
  })

  it('ADE-025 ADE-5: D6 3 (no discard) -> the model is removed at once', () => {
    const { s } = setupShooting()
    const { ctx, events } = ctxOf(s, [3])
    effectService.grant(ctx, SAC, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SAC, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const victim = s.units[SAC].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: ESIS, modelId: null, kind: 'ranged' })
    expect(s.models[victim]).toBeUndefined()
    expect(of(events, 'ModelRemovalDeferred')).toHaveLength(0)
  })

  it('ADE-027 ADE-5: deferred Battle Sisters get a declareTargets decision after the enemy unit finishes shooting, shoot, then leave; UnitDestroyed (and its die) comes with the last model', () => {
    const s = makeState()
    s.activePlayer = 'B'
    s.phase = 'shooting'
    placeUnit(s, EARC, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, SIS, { x: -2, z: -3, gap: 0.3 })
    // reduce the Sisters to a single model so its destruction destroys the unit
    for (const id of s.units[SIS].models.slice(1)) delete s.models[id]
    s.units[SIS].models = s.units[SIS].models.slice(0, 1)
    const lone = s.units[SIS].models[0]
    s.models[lone].woundsRemaining = 1
    const { ctx, events } = ctxOf(s, [4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6])
    effectService.grant(ctx, SIS, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SIS, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    attackService.destroyModel(ctx, lone, { player: 'B', unitId: EARC, modelId: null, kind: 'ranged' })
    expect(s.models[lone].removalDeferred).toBe(true)
    expect(of(events, 'UnitDestroyed')).toHaveLength(0)
    // A's Sisters unit is the *shooter's* enemy here: the engine phase module raises the deferred declareTargets
    s.step = 'resolve'
    s.phaseState.marks.push(`sh:resolveUnit=${EARC}`)
    const r = resolveDeferredActivations(ctx, EARC)
    expect(r).toBe('awaiting')
    const pending = s.pending
    expect(pending?.kind).toBe('declareTargets')
    if (pending?.kind !== 'declareTargets') return
    expect(pending.player).toBe('A')
    expect(pending.context.unitId).toBe(SIS)
    expect(pending.context.weapons.every((w) => w.modelId === lone)).toBe(true)
    expect(pending.context.weapons.some((w) => w.legalTargets.includes(EARC))).toBe(true)
    // answer: shoot the boltgun at the Arco-flagellants through the shooting module
    const bolt = pending.context.weapons.find((w) => w.legalTargets.includes(EARC))!
    s.pending = null
    const rej = shootingModule.handle(ctx, { type: 'declareTargets', player: 'A', decisionId: pending.id, unitId: SIS, targets: [{ modelId: lone, weaponId: bolt.weaponId, targetUnitId: EARC }] }, pending)
    expect(rej).toBeUndefined()
    expect(s.phaseState.attack?.attackerUnitId).toBe(SIS)
    drive(ctx)
    // the shot is done: the deferred model is removed now and the unit (its last model) is destroyed
    expect(resolveDeferredActivations(ctx, EARC)).toBe('done')
    expect(s.models[lone]).toBeUndefined()
    expect(of(events, 'UnitDestroyed').map((e) => e.unitId)).toEqual([SIS])
    expect(s.units[SIS].location).toBe('destroyed')
    expect(s.players.A.miracle.dice.length).toBe(1)
  })

  it('ADE-027 ADE-5: A Martyr\'s Death lasts the phase -- two enemy units in turn each destroy a model of the same unit and both groups get their own last stand', () => {
    const s = makeState()
    s.activePlayer = 'B'
    s.phase = 'shooting'
    placeUnit(s, EARC, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, ESIS, { x: -12, z: 3, gap: 0.3 })
    placeUnit(s, SIS, { x: -2, z: 0, gap: 0.3 })
    const [m1, m2] = s.units[SIS].models
    s.models[m1].woundsRemaining = 1
    s.models[m2].woundsRemaining = 1
    const { ctx, events } = ctxOf(s, [4, 4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6])
    effectService.grant(ctx, SIS, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SIS, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    s.step = 'resolve'
    const lastStand = (by: string): void => {
      expect(resolveDeferredActivations(ctx, by)).toBe('awaiting')
      const pending = s.pending
      expect(pending?.kind).toBe('declareTargets')
      if (pending?.kind !== 'declareTargets') return
      expect(pending.context.unitId).toBe(SIS)
      s.pending = null
      expect(shootingModule.handle(ctx, { type: 'pass', player: 'A', decisionId: pending.id }, pending)).toBeUndefined()
      expect(resolveDeferredActivations(ctx, by)).toBe('done')
    }
    attackService.destroyModel(ctx, m1, { player: 'B', unitId: EARC, modelId: null, kind: 'ranged' })
    expect(s.models[m1].removalDeferred).toBe(true)
    lastStand(EARC)
    expect(s.models[m1]).toBeUndefined()
    attackService.destroyModel(ctx, m2, { player: 'B', unitId: ESIS, modelId: null, kind: 'ranged' })
    expect(s.models[m2].removalDeferred).toBe(true)
    lastStand(ESIS)
    expect(s.models[m2]).toBeUndefined()
    expect(of(events, 'ModelRemovalDeferred').map((e) => e.modelId)).toEqual([m1, m2])
  })

  it('ADE-028 ADE-5: a model whose unit has already acted gets no roll (the hook gates on that) and is removed normally', () => {
    const { s } = setupShooting()
    const { ctx, events } = ctxOf(s, [])
    effectService.grant(ctx, SAC, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SAC, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    s.units[SAC].turn.shotThisPhase = true // already acted -> no D6 (an empty script throws on any roll)
    const victim = s.units[SAC].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: ESIS, modelId: null, kind: 'ranged' })
    expect(s.models[victim]).toBeUndefined()
    expect(of(events, 'DiceRolled')).toHaveLength(0)
  })

  it('ADE-025 ADE-5 (Fight): kind melee is recorded and the deferred model fights after the destroying unit (fightModule exports the step)', () => {
    const { s } = setupShooting()
    s.phase = 'fight'
    s.phaseState = emptyPhaseState()
    s.phaseState.fight = { step: 'remaining', subStep: 'attacks', currentUnitId: ESIS, fought: [], nextToSelect: 'A', counterOffensive: false }
    const { ctx } = ctxOf(s, [4])
    effectService.grant(ctx, SAC, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SAC, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const victim = s.units[SAC].models[0]
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: ESIS, modelId: null, kind: 'melee' })
    expect(s.phaseState.deferredRemovals).toMatchObject([{ unitId: SAC, kind: 'melee', afterUnitId: ESIS }])
    expect(fightModule.name).toBe('fight')
    // no enemy within Engagement Range of the deferred model -> nothing to fight, removed without a decision
    expect(resolveDeferredActivations(ctx, ESIS)).toBe('done')
    expect(s.models[victim]).toBeUndefined()
  })
})

describe('Deferred removal in the Fight phase (E4)', () => {
  it('ADE-025 ADE-5: the deferred Sacresant fights (declareTargets for it alone, enemies in Engagement Range only) after the destroying unit, then is removed', () => {
    const s = makeState()
    s.activePlayer = 'B'
    s.phase = 'fight'
    s.phaseState = emptyPhaseState()
    placeUnit(s, SAC, [[0, 0]])
    placeUnit(s, EARC, [[1.4, 0]])
    s.phaseState.fight = { step: 'remaining', subStep: 'deferred', currentUnitId: EARC, fought: [], nextToSelect: 'A', counterOffensive: false }
    const { ctx, events } = ctxOf(s, [4, ...SIX])
    effectService.grant(ctx, SAC, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SAC, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const victim = s.units[SAC].models[0]
    s.models[victim].woundsRemaining = 1
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: EARC, modelId: null, kind: 'melee' })
    expect(s.models[victim]?.removalDeferred).toBe(true)
    expect(resolveDeferredActivations(ctx, EARC)).toBe('awaiting')
    const pending = s.pending
    expect(pending?.kind).toBe('declareTargets')
    if (pending?.kind !== 'declareTargets') return
    expect(pending.player).toBe('A')
    expect(pending.context).toMatchObject({ unitId: SAC, attackKind: 'melee' })
    expect(pending.context.weapons.every((w) => w.modelId === victim)).toBe(true)
    const w = pending.context.weapons.find((x) => x.legalTargets.includes(EARC))!
    expect(w).toBeTruthy()
    s.pending = null
    expect(fightModule.validate!(s, { type: 'declareTargets', player: 'A', decisionId: pending.id, unitId: SAC, targets: [{ modelId: victim, weaponId: w.weaponId, targetUnitId: EARC, attacks: w.attacks as number }] }, pending)).toBeNull()
    const rej = fightModule.handle(ctx, { type: 'declareTargets', player: 'A', decisionId: pending.id, unitId: SAC, targets: [{ modelId: victim, weaponId: w.weaponId, targetUnitId: EARC, attacks: w.attacks as number }] }, pending)
    expect(rej).toBeUndefined()
    // the deferred attack does not use up the Sacresants' own declare step
    expect(s.phaseState.marks).not.toContain(`fi:declared:${SAC}`)
    drive(ctx)
    expect(resolveDeferredActivations(ctx, EARC)).toBe('done')
    expect(s.models[victim]).toBeUndefined()
    expect(of(events, 'AttackSequenceEnded').some((e) => e.unitId === SAC)).toBe(true)
  })
})

describe('Patrol Squads (E5)', () => {
  const build = (splitUnits?: string[]): GameState => createGameState({
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: ADE(splitUnits ? { splitUnits } : {}), B: ADE() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }, bundle, 'ade-split', ENGINE_VERSION)

  it('ADE-003 ADE-1.2: splitUnits [sisters] -> two 5-model units with the listed wargear, each Starting Strength 5; the default stays one unit of 10', () => {
    const whole = build()
    expect(whole.units['A:sisters'].models).toHaveLength(10)
    expect(whole.units['A:sisters-a']).toBeUndefined()
    const s = build(['sisters'])
    expect(s.units['A:sisters']).toBeUndefined()
    expect(s.units['A:sisters-a'].models).toHaveLength(5)
    expect(s.units['A:sisters-b'].models).toHaveLength(5)
    expect(s.units['A:sisters-a'].startingStrength).toBe(5)
    expect(s.units['A:sisters-b'].startingStrength).toBe(5)
    const weaponsOf = (id: string) => s.units[id].models.flatMap((m) => s.models[m].weapons)
    expect(weaponsOf('A:sisters-a')).toContain('ade.w.ministorum-flamer')
    expect(weaponsOf('A:sisters-a')).toContain('ade.w.combi-weapon')
    expect(weaponsOf('A:sisters-a')).not.toContain('ade.w.ministorum-heavy-flamer')
    expect(weaponsOf('A:sisters-b')).toContain('ade.w.ministorum-heavy-flamer')
    // the other side's untouched unit and the Acts of Faith ability still resolve
    expect(hasActsOfFaith(s, 'A')).toBe(true)
  })

  it('ADE-003 a ref without patrolSquads cannot be split', () => {
    expect(() => build(['arcos'])).toThrow()
  })
})

export type { Services, UseStratagemAction }
void setModelPos

describe('Deferred removal in the Fight phase -- pile-in (RC-ADE-10)', () => {
  it('ADE-025 RC-ADE-10: a deferred Sacresant out of Engagement Range piles in first (3", coherency vs the live models), then fights what it now reaches', () => {
    const s = makeState()
    s.activePlayer = 'B'
    s.phase = 'fight'
    s.phaseState = emptyPhaseState()
    placeUnit(s, SAC, s.units[SAC].models.map((_, i) => [-15, i * 1.5] as [number, number]))
    placeUnit(s, EARC, [[-11.6, 0]])
    s.phaseState.fight = { step: 'remaining', subStep: 'deferred', currentUnitId: EARC, fought: [], nextToSelect: 'A', counterOffensive: false }
    const { ctx } = ctxOf(s, [4, ...SIX])
    effectService.grant(ctx, SAC, [], { sourceAbilityId: 'ade.s.a-martyrs-death', sourceUnitId: SAC, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const victim = s.units[SAC].models[0]
    s.models[victim].woundsRemaining = 1
    attackService.destroyModel(ctx, victim, { player: 'B', unitId: EARC, modelId: null, kind: 'melee' })
    expect(s.models[victim]?.removalDeferred).toBe(true)
    expect(resolveDeferredActivations(ctx, EARC)).toBe('awaiting')
    const pile = s.pending
    expect(pile?.kind).toBe('pileIn')
    if (pile?.kind !== 'pileIn') return
    expect(pile.player).toBe('A')
    expect(pile.context.unitId).toBe(SAC)
    const options = fightModule.legalActions!(s, pile) as Action[]
    const moved = options.find((a) => a.type === 'pileIn' && a.placements.length > 0)
    expect(moved, 'a pile-in that moves the deferred model is offered').toBeDefined()
    s.pending = null
    expect(fightModule.validate!(s, { ...(moved as Action), decisionId: pile.id } as Action, pile)).toBeNull()
    expect(fightModule.handle(ctx, { ...(moved as Action), decisionId: pile.id } as Action, pile)).toBeUndefined()
    expect(s.models[victim].pos.x).toBeGreaterThan(-15)
    expect(resolveDeferredActivations(ctx, EARC)).toBe('awaiting')
    const next = s.pending as unknown as PendingDecision | null
    expect(next?.kind).toBe('declareTargets')
    if (next?.kind !== 'declareTargets') return
    expect(next.context.weapons.some((w) => w.modelId === victim && w.legalTargets.includes(EARC))).toBe(true)
  })
})
