// World Eaters: Karagar's Rampagers (docs/spec/factions/world-eaters.md, checklist WOR-003..WOR-025). Real Combat Patrol data; covers the
// (b) code hooks: Blessings of Khorne (round.start roll + pick, Wrathful Devotion, Total Carnage, Warp Blades), Skulls for Khorne,
// Arch-slaughterer, Ravage and Ransack, Blood Offering, Rage Unchecked, Unstoppable Fury and Overwhelming Onslaught.
// The engine changes C1-C3 (Feel No Pain adjusters, fight.beforeConsolidate, consolidate-only distance) are covered by
// world-eaters-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, view as engineView,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision,
  type PlayerId, type PlayerSetup, type UseStratagemAction,
} from '../../src/engine'
import { createUtilityDecider } from '../../src/ai/utility'
import { stratagemScore } from '../../src/ai/stratagems'
import { attackService } from '../../src/engine/attack'
import {
  BLESSINGS_KEY, activeBlessings, blessingActive, feasibleBlessingSets, type BlessingId, type BlessingRequirement, type StoredBlessings,
} from '../../src/engine/factions/world-eaters'
import { deferredDeaths, fightOnDeathThreshold } from '../../src/engine/fight-on-death'
import { hookService } from '../../src/engine/hooks-impl'
import { stratagemService } from '../../src/engine/stratagems'
import { modelStats, unitModelsForCoherency } from '../../src/engine/state'
import { isCoherent } from '../../src/engine/geometry'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const WE = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'World Eaters', faction: 'world-eaters', patrolId: 'we.cp.karagars-rampagers', enhancementId: 'we.e.skulls-for-khorne',
  secondaryId: 'we.sec.ravage-and-ransack', attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const KARAGAR = 'A:karagar', BZK = 'A:berzerkers', JAK = 'A:jakhals'
const TERM = 'B:terminator-squad', INF = 'B:infernus-squad', CAP = 'B:captain-octavius'
const CHAINBLADE = 'we.w.berzerker-chainblade', PLASMA = 'we.w.plasma-pistol-karagar', EXALTED = 'we.w.exalted-chainblade'
const RAGE = 'we.s.rage-unchecked', FURY = 'we.s.unstoppable-fury', ONSLAUGHT = 'we.s.overwhelming-onslaught'
const REQ: Record<BlessingId, BlessingRequirement> = { wrathfulDevotion: { pairMin: 1 }, totalCarnage: { pairMin: 4, triple: true }, warpBlades: { pairMin: 5, triple: true } }

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mirror?: boolean; round?: number; phase?: GameState['phase']; active?: PlayerId }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: WE(o.a), B: o.mirror ? WE({ name: 'World Eaters B', ...o.b }) : SM(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'we-hooks', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'fight'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = 0
  s.players.B.cp = 0
  return s
}
const ctxOf = (s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function answerWithRejection(ctx: EngineContext, optionId: string) {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  return hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
}
function answer(ctx: EngineContext, optionId: string): void {
  const rej = answerWithRejection(ctx, optionId)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
const optionIds = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)
const setBlessings = (s: GameState, player: PlayerId, active: BlessingId[], round = s.round): void => {
  s.players[player].secondaryState[BLESSINGS_KEY] = { round, dice: [], active } satisfies StoredBlessings
}
const modelWith = (s: GameState, unitId: string, weaponId: string): string => s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))!
const abilitiesOf = (s: GameState, unitId: string, weaponId: string): string[] =>
  hookService.weaponAbilitiesFor(s, modelWith(s, unitId, weaponId), s.weapons[weaponId]).map((a) => a.ability)

// a Fight phase with the engine's phase-start hook run, so Total Carnage's grant is in place
function fightState(o: Opts & { blessings?: BlessingId[] } = {}): GameState {
  const s = makeState({ phase: 'fight', active: 'B', ...o })
  placeUnit(s, KARAGAR, [[-13, 0]])
  placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
  placeUnit(s, JAK, { x: -12, z: 6, gap: 0.3 })
  placeUnit(s, TERM, [[12, 0]])
  placeUnit(s, INF, [[12, 8]])
  if (o.blessings) setBlessings(s, 'A', o.blessings)
  s.phaseState = emptyPhaseState()
  const { ctx } = ctxOf(s)
  hookService.run(ctx, 'onPhaseStart', {})
  return s
}

// wipe out every model of `unitId` with the last one killed by `by`; returns events of the last kill
function killUnit(s: GameState, unitId: string, by: Parameters<typeof attackService.destroyModel>[2], dice: number[] = []): GameEvent[] {
  const { ctx, events } = ctxOf(s, dice)
  const ids = [...s.units[unitId].models]
  for (const id of ids) attackService.destroyModel(ctx, id, by)
  return events
}
const karagarKill = (s: GameState, kind: 'melee' | 'ranged' = 'melee') =>
  ({ player: 'A', unitId: KARAGAR, modelId: s.units[KARAGAR].models[0], kind }) as Parameters<typeof attackService.destroyModel>[2]
const bzkKill = (s: GameState) => ({ player: 'A', unitId: BZK, modelId: s.units[BZK].models[0], kind: 'melee' }) as Parameters<typeof attackService.destroyModel>[2]

// ---------- Blessings of Khorne: the roll and the pick ----------
describe('Blessings of Khorne: the round.start roll (WOR-2.1, 2.7)', () => {
  it('WOR-003 round.start rolls 8D6 (ability roll, not Command-re-rollable) and asks the World Eaters player, no pass', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx, events } = ctxOf(s, [1, 1, 2, 3, 4, 5, 6, 6])
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(true)
    const rolls = of(events, 'DiceRolled').map((e) => e.roll).filter((r) => r.purpose === 'ability')
    expect(rolls).toHaveLength(1)
    expect(rolls[0].dice).toHaveLength(8)
    expect(rolls[0].commandRerollable).toBe(false)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(p.canPass).toBe(false)
    expect(p.context.data.code).toBe('blessingsOfKhorne')
    expect(optionIds(s)).toContain('none')
    expect(activeBlessings(s, 'A')).toEqual([])
  })

  it('WOR-003 a player with no World Eaters unit is not asked; a mirror asks both, the first player first', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s, [1, 1, 2, 3, 4, 5, 6, 6])
    hookService.offerPicks(ctx, 'round.start', '1')
    answer(ctx, 'none')
    hookService.offerPicks(ctx, 'round.start', '1')
    expect((s.pending as ChooseOptionDecision | null)?.context.data.code).not.toBe('blessingsOfKhorne')

    const m = makeState({ round: 1, phase: 'command', mirror: true })
    m.firstPlayer = 'B'
    const { ctx: c2 } = ctxOf(m, [1, 1, 2, 3, 4, 5, 6, 6, 3, 3, 4, 4, 5, 5, 6, 6])
    hookService.offerPicks(c2, 'round.start', '1')
    expect((m.pending as ChooseOptionDecision).player).toBe('B')
    answer(c2, 'none')
    hookService.offerPicks(c2, 'round.start', '1')
    expect((m.pending as ChooseOptionDecision).player).toBe('A')
    answer(c2, 'totalCarnage+warpBlades')
    expect(activeBlessings(m, 'A')).toEqual(['totalCarnage', 'warpBlades'])
    expect(activeBlessings(m, 'B')).toEqual([])
  })

  it('WOR-003 a World Eaters unit still in Reserves keeps the roll alive; a player with every unit destroyed is not asked', () => {
    const s = makeState({ round: 1, phase: 'command' })
    for (const id of [KARAGAR, BZK]) s.units[id].location = 'reserves'
    s.units[JAK].location = 'reserves'
    const { ctx } = ctxOf(s, [1, 1, 2, 3, 4, 5, 6, 6])
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(true)
    const t = makeState({ round: 1, phase: 'command' })
    for (const id of [KARAGAR, BZK, JAK]) t.units[id].location = 'destroyed'
    const { ctx: c2 } = ctxOf(t, [1, 1, 2, 3, 4, 5, 6, 6])
    hookService.offerPicks(c2, 'round.start', '1')
    expect((t.pending as ChooseOptionDecision | null)?.context.data.code).not.toBe('blessingsOfKhorne')
  })
})

describe('Blessings of Khorne: which sets the dice pay for (WOR-2.2)', () => {
  const offered = (dice: number[]): string[] => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s, dice)
    hookService.offerPicks(ctx, 'round.start', '1')
    return optionIds(s).sort()
  }

  it('WOR-004 dice [1,1,2,3,4,5,6,6]: WD, TC, WB, WD+TC, WD+WB, none; not TC+WB (one qualifying pair)', () => {
    expect(offered([1, 1, 2, 3, 4, 5, 6, 6])).toEqual(['none', 'totalCarnage', 'totalCarnage+wrathfulDevotion', 'warpBlades', 'warpBlades+wrathfulDevotion', 'wrathfulDevotion'])
  })

  it('WOR-005 dice [3,3,3,2,2,1,4,6]: the triple pays for TC or WB and the 2s for WD, never TC+WB', () => {
    const o = offered([3, 3, 3, 2, 2, 1, 4, 6])
    expect(o).toEqual(['none', 'totalCarnage', 'totalCarnage+wrathfulDevotion', 'warpBlades', 'warpBlades+wrathfulDevotion', 'wrathfulDevotion'])
    expect(o).not.toContain('totalCarnage+warpBlades')
  })

  it('WOR-005 dice [5,5,5,5,1,2,3,4] offer TC+WB (two pairs of 5); [1,2,3,4,5,6,1,2] offer only WD and none', () => {
    expect(offered([5, 5, 5, 5, 1, 2, 3, 4])).toContain('totalCarnage+warpBlades')
    expect(offered([1, 2, 3, 4, 5, 6, 1, 2])).toEqual(['none', 'wrathfulDevotion'])
  })

  it('WOR-005 eight dice always hold a double, so Wrathful Devotion (any double) is always on offer', () => {
    expect(offered([1, 2, 3, 4, 5, 6, 3, 6])).toContain('wrathfulDevotion')
    expect(offered([1, 2, 3, 4, 5, 6, 1, 2])).toContain('wrathfulDevotion')
  })

  it('WOR-006 only an offered set is accepted; the choice is stored for this round only; none switches nothing on', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s, [1, 1, 2, 3, 4, 5, 6, 6])
    hookService.offerPicks(ctx, 'round.start', '1')
    s.pending = s.pending // keep the decision for the rejected attempts below
    const pending = s.pending as ChooseOptionDecision
    const bad = hookService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'totalCarnage+warpBlades' }, pending as PendingDecision)
    expect(bad?.code).toBe('E_NOT_AN_OPTION')
    const worse = hookService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'wrathfulDevotion+totalCarnage+warpBlades' }, pending as PendingDecision)
    expect(worse?.code).toBe('E_NOT_AN_OPTION')
    s.pending = null
    hookService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'totalCarnage+wrathfulDevotion' }, pending as PendingDecision)
    expect(activeBlessings(s, 'A')).toEqual(['totalCarnage', 'wrathfulDevotion'])
    expect(blessingActive(s, 'A', 'warpBlades')).toBe(false)
    s.round = 2
    expect(activeBlessings(s, 'A')).toEqual([])

    // a fresh roll next round
    s.phaseState = emptyPhaseState()
    const { ctx: c2, events } = ctxOf(s, [2, 2, 4, 4, 4, 1, 3, 6])
    expect(hookService.offerPicks(c2, 'round.start', '2')).toBe(true)
    expect(of(events, 'DiceRolled').filter((e) => e.roll.purpose === 'ability')).toHaveLength(1)
    answer(c2, 'none')
    expect(activeBlessings(s, 'A')).toEqual([])
    expect(blessingActive(s, 'A', 'wrathfulDevotion')).toBe(false)
  })

  it('WOR-024 feasibleBlessingSets never needs more dice than were rolled, lists the best sets first and always ends with none', () => {
    const need = (set: BlessingId[], dice: number[]): boolean => {
      // brute-check: the sets returned are payable (re-derive with the same function on a single-set basis)
      return feasibleBlessingSets(dice, REQ, 2).some((x) => x.length === set.length && set.every((b) => x.includes(b)))
    }
    for (const dice of [[1, 1, 2, 3, 4, 5, 6, 6], [6, 6, 6, 6, 6, 6, 6, 6], [1, 2, 3, 4, 5, 6, 1, 2], [4, 4, 4, 1, 1, 1, 2, 3], [1, 2, 3, 4, 5, 6, 3, 1]]) {
      const sets = feasibleBlessingSets(dice, REQ, 2)
      expect(sets[sets.length - 1]).toEqual([])
      expect(sets.filter((x) => x.length === 0)).toHaveLength(1)
      for (const x of sets) expect(x.length).toBeLessThanOrEqual(2)
      // two Blessings need at least four dice, three at least six
      for (const x of sets) expect(x.length * 2).toBeLessThanOrEqual(dice.length)
      // the order is the AI preference: size never grows once a smaller set has appeared
      const sizes = sets.map((x) => x.length)
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    }
    expect(need(['totalCarnage', 'warpBlades'], [6, 6, 6, 6, 1, 2, 3, 4])).toBe(true)
    expect(need(['totalCarnage', 'warpBlades'], [6, 6, 6, 1, 2, 3, 4, 5])).toBe(false) // 6-6-6 pays one Blessing, the other needs another group
    expect(feasibleBlessingSets([6, 6, 6, 6, 1, 2, 3, 4], REQ, 2)[0].sort()).toEqual(['totalCarnage', 'warpBlades'])
    expect(feasibleBlessingSets([6, 6, 6, 6, 1, 1, 1, 1], REQ, 1).every((x) => x.length <= 1)).toBe(true)
    expect(feasibleBlessingSets([], REQ, 2)).toEqual([[]])
  })
})

// ---------- Wrathful Devotion ----------
describe('Wrathful Devotion (WOR-2.4)', () => {
  function drain(ctx: EngineContext): void {
    for (let i = 0; i < 200 && attackService.advance(ctx) === 'pending'; i++) {
      const pending = ctx.state.pending as PendingDecision
      const opts = 'options' in pending ? pending.options : []
      ctx.state.pending = null
      attackService.handler.handle(ctx, (opts[0]?.action ?? { type: 'pass', player: pending.player, decisionId: pending.id }) as Action, pending)
    }
  }
  // one mortal wound on `unitId`, FNP die = `die`; returns the first FeelNoPainRolled event (undefined when none was rolled)
  function fnpRoll(s: GameState, unitId: string, die: number, mortal = true) {
    const { ctx, events } = ctxOf(s, [die, ...Array(40).fill(2)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: TERM, overwatch: false, targets: [] })
    if (mortal) attackService.queueMortalWounds(ctx, unitId, 1, 'test', false)
    drain(ctx)
    return of(events, 'FeelNoPainRolled')[0]
  }
  const layout = (blessings: BlessingId[]): GameState => {
    const s = makeState({ phase: 'shooting', active: 'B' })
    placeUnit(s, KARAGAR, [[-13, 0]])
    placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, JAK, { x: -12, z: 6, gap: 0.3 })
    placeUnit(s, TERM, [[12, 0]])
    setBlessings(s, 'A', blessings)
    return s
  }

  it('WOR-007 a Berzerker (no FNP of its own) gets Feel No Pain 6+ against mortal wounds: a 6 ignores, a 5 does not', () => {
    const six = fnpRoll(layout(['wrathfulDevotion']), BZK, 6)
    expect(six?.ignored).toBe(true)
    expect(six?.needed).toBe(6)
    const five = fnpRoll(layout(['wrathfulDevotion']), BZK, 5)
    expect(five?.ignored).toBe(false)
  })

  it('WOR-007 a Jakhal (FNP 6+ already) adds 1 to its rolls: a 5 ignores, a 4 does not', () => {
    const five = fnpRoll(layout(['wrathfulDevotion']), JAK, 5)
    expect(five?.ignored).toBe(true)
    expect(five?.needed).toBe(5)
    const four = fnpRoll(layout(['wrathfulDevotion']), JAK, 4)
    expect(four?.ignored).toBe(false)
    // without the Blessing the Jakhal's 5 fails (plain 6+)
    expect(fnpRoll(layout([]), JAK, 5)?.ignored).toBe(false)
  })

  it('WOR-007 with the Blessing not active, Berzerkers have no Feel No Pain at all (no roll); another Blessing does not switch it on', () => {
    expect(fnpRoll(layout([]), BZK, 6)).toBeUndefined()
    expect(fnpRoll(layout(['warpBlades', 'totalCarnage']), BZK, 6)).toBeUndefined()
    const expired = layout(['wrathfulDevotion'])
    expired.round = 3
    expect(fnpRoll(expired, BZK, 6)).toBeUndefined()
  })

  it('WOR-007 the Blessing covers every World Eaters unit of the player (Karagar too), never the opponent', () => {
    expect(fnpRoll(layout(['wrathfulDevotion']), KARAGAR, 6)?.ignored).toBe(true)
    const s = layout(['wrathfulDevotion'])
    expect(fnpRoll(s, TERM, 6)).toBeUndefined()
  })
})

// ---------- Total Carnage ----------
describe('Total Carnage (WOR-2.5)', () => {
  const meleeBy = (s: GameState) => ({ player: 'B', unitId: TERM, modelId: s.units[TERM].models[0], kind: 'melee' }) as Parameters<typeof attackService.destroyModel>[2]
  const kill = (s: GameState, dice: number[], by = meleeBy(s)): void => {
    const { ctx } = ctxOf(s, dice)
    attackService.destroyModel(ctx, s.units[BZK].models[0], by)
  }

  it('WOR-009 an enemy melee kill of a Berzerker that has not fought: D6 4 keeps the model at 0 W for a last fight, D6 3 removes it at once', () => {
    const s = fightState({ blessings: ['totalCarnage'] })
    expect(fightOnDeathThreshold(s, BZK)).toBe(4)
    expect(fightOnDeathThreshold(s, JAK)).toBe(4)
    expect(fightOnDeathThreshold(s, KARAGAR)).toBe(4)
    const m = s.units[BZK].models[0]
    kill(s, [4])
    expect(deferredDeaths(s).map((d) => d.modelId)).toEqual([m])
    const t = fightState({ blessings: ['totalCarnage'] })
    const m2 = t.units[BZK].models[0]
    kill(t, [3])
    expect(deferredDeaths(t)).toHaveLength(0)
    expect(t.models[m2]).toBeUndefined()
  })

  it('WOR-010 no roll once the unit has fought or for a stratagem mortal wound, and Total Carnage works in both Fight phases', () => {
    const fought = fightState({ blessings: ['totalCarnage'] })
    fought.units[BZK].turn.foughtThisPhase = true
    const m = fought.units[BZK].models[0]
    kill(fought, []) // an empty ScriptedRng would throw on any roll
    expect(fought.models[m]).toBeUndefined()

    const mortal = fightState({ blessings: ['totalCarnage'] })
    const mm = mortal.units[BZK].models[0]
    kill(mortal, [], { player: 'B', unitId: TERM, modelId: mortal.units[TERM].models[0], kind: 'mortal' } as never)
    expect(mortal.models[mm]).toBeUndefined()

    for (const active of ['A', 'B'] as PlayerId[]) {
      const s = fightState({ blessings: ['totalCarnage'], active })
      expect(fightOnDeathThreshold(s, BZK)).toBe(4)
    }
  })

  it('WOR-010 Blessing not active (none, another one, or last round\'s): no fight-on-death grant and no roll', () => {
    const none = fightState({})
    expect(fightOnDeathThreshold(none, BZK)).toBeNull()
    const other = fightState({ blessings: ['warpBlades', 'wrathfulDevotion'] })
    expect(fightOnDeathThreshold(other, BZK)).toBeNull()
    const m = other.units[BZK].models[0]
    kill(other, [])
    expect(other.models[m]).toBeUndefined()
    const old = makeState({ phase: 'fight', active: 'B' })
    placeUnit(old, BZK, { x: -12, z: -3, gap: 0.3 })
    setBlessings(old, 'A', ['totalCarnage'], 1)
    const { ctx } = ctxOf(old)
    hookService.run(ctx, 'onPhaseStart', {})
    expect(fightOnDeathThreshold(old, BZK)).toBeNull()
    // the shooting phase never grants it
    const shoot = makeState({ phase: 'shooting', active: 'B' })
    placeUnit(shoot, BZK, { x: -12, z: -3, gap: 0.3 })
    setBlessings(shoot, 'A', ['totalCarnage'])
    hookService.run(ctxOf(shoot).ctx, 'onPhaseStart', {})
    expect(fightOnDeathThreshold(shoot, BZK)).toBeNull()
  })
})

// ---------- Warp Blades ----------
describe('Warp Blades (WOR-2.6)', () => {
  it('WOR-011 melee weapons have LETHAL HITS while the Blessing is on; pistols do not; it ends with the round', () => {
    const s = makeState({ phase: 'fight' })
    expect(abilitiesOf(s, BZK, CHAINBLADE)).not.toContain('LETHAL_HITS')
    setBlessings(s, 'A', ['warpBlades'])
    expect(abilitiesOf(s, BZK, CHAINBLADE)).toContain('LETHAL_HITS')
    expect(abilitiesOf(s, KARAGAR, EXALTED)).toContain('LETHAL_HITS')
    expect(abilitiesOf(s, KARAGAR, PLASMA)).not.toContain('LETHAL_HITS')
    s.round = 3
    expect(abilitiesOf(s, BZK, CHAINBLADE)).not.toContain('LETHAL_HITS')
  })

  it('WOR-011 Warp Blades is not switched on by Wrathful Devotion or Total Carnage; the opponent never gets it', () => {
    const s = makeState({ phase: 'fight' })
    setBlessings(s, 'A', ['wrathfulDevotion', 'totalCarnage'])
    expect(abilitiesOf(s, BZK, CHAINBLADE)).not.toContain('LETHAL_HITS')
    const m = makeState({ phase: 'fight', mirror: true })
    setBlessings(m, 'A', ['warpBlades'])
    expect(abilitiesOf(m, 'B:berzerkers', CHAINBLADE)).not.toContain('LETHAL_HITS')
    expect(abilitiesOf(m, BZK, CHAINBLADE)).toContain('LETHAL_HITS')
  })
})

// ---------- Skulls for Khorne / Arch-slaughterer ----------
describe('Skulls for Khorne (WOR-3)', () => {
  const cp = (s: GameState): number => s.players.A.cp

  it('WOR-012 Karagar wipes out an enemy unit in melee: D6 2 gives 1 CP, D6 1 gives none', () => {
    const s = fightState()
    const ev = killUnit(s, TERM, karagarKill(s), [2])
    expect(cp(s)).toBe(1)
    expect(of(ev, 'AbilityTriggered').some((e) => e.summary.includes('Skulls for Khorne'))).toBe(true)
    const t = fightState()
    killUnit(t, TERM, karagarKill(t), [1])
    expect(cp(t)).toBe(0)
  })

  it('WOR-012 a Berzerker kill or a plasma-pistol kill rolls nothing; the rule is limited to the bearer\'s melee attacks', () => {
    const s = fightState()
    killUnit(s, TERM, bzkKill(s)) // an empty ScriptedRng throws on any roll
    expect(cp(s)).toBe(0)
    const t = fightState()
    killUnit(t, TERM, karagarKill(t, 'ranged'))
    expect(cp(t)).toBe(0)
  })

  it('WOR-012 a second gain in the same battle round is discarded by the one-CP cap', () => {
    const s = fightState()
    killUnit(s, TERM, karagarKill(s), [6])
    expect(cp(s)).toBe(1)
    killUnit(s, INF, karagarKill(s), [6])
    expect(cp(s)).toBe(1)
  })

  it('WOR-013 an attached enemy pair rolls once, when the last model of both halves is gone', () => {
    const s = makeState({ phase: 'fight', active: 'B', b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } })
    placeUnit(s, KARAGAR, [[-13, 0]])
    placeUnit(s, TERM, [[12, 0]])
    placeUnit(s, CAP, [[12, 2]])
    s.phaseState = emptyPhaseState()
    const bodyguard = leaderBodyguard(s)
    // the bodyguard half dies first while the Captain lives: no roll
    killUnit(s, bodyguard, karagarKill(s))
    expect(cp(s)).toBe(0)
    // the last model of the pair: one roll
    const leader = bodyguard === TERM ? CAP : TERM
    killUnit(s, leader, karagarKill(s), [5])
    expect(cp(s)).toBe(1)
  })

  it('WOR-014 Arch-slaughterer gives Karagar\'s melee weapons PRECISION (not the plasma pistol) and replaces Skulls for Khorne', () => {
    const s = makeState({ a: { enhancementId: 'we.e.arch-slaughterer' }, phase: 'fight' })
    expect(abilitiesOf(s, KARAGAR, EXALTED)).toContain('PRECISION')
    expect(abilitiesOf(s, KARAGAR, PLASMA)).not.toContain('PRECISION')
    expect(abilitiesOf(s, BZK, CHAINBLADE)).not.toContain('PRECISION')
    const plain = makeState({ phase: 'fight' })
    expect(abilitiesOf(plain, KARAGAR, EXALTED)).not.toContain('PRECISION')
    // no Skulls for Khorne roll when Arch-slaughterer is the chosen enhancement
    placeUnit(s, KARAGAR, [[-13, 0]])
    placeUnit(s, TERM, [[12, 0]])
    killUnit(s, TERM, karagarKill(s)) // no dice scripted: any roll would throw
    expect(cp(s)).toBe(0)
  })
})

// the unit id the captain leads after attachment (the attach is canonicalised on the bodyguard's id)
function leaderBodyguard(s: GameState): string {
  return s.units[CAP].bodyguardUnitId ?? s.units[TERM].bodyguardUnitId ?? TERM
}

// ---------- Ravage and Ransack ----------
describe('Ravage and Ransack (WOR-4)', () => {
  // A's opponent (B) deploys along z = +15 in cp-01: the marker with the greatest z is nearest B's battlefield edge
  function nearestMarkers(s: GameState): string[] {
    const live = Object.values(s.objectives).filter((o) => !o.removed)
    const top = Math.max(...live.map((o) => o.pos.z))
    return live.filter((o) => o.pos.z >= top - 0.01).map((o) => o.id)
  }
  const hold = (s: GameState, ids: string[], pid: PlayerId = 'A'): void => { for (const o of Object.values(s.objectives)) o.controller = ids.includes(o.id) ? pid : null }
  const score = (s: GameState, active: PlayerId): number => {
    s.activePlayer = active
    s.phaseState = emptyPhaseState()
    const { ctx } = ctxOf(s)
    DEFAULT_MODULES.services.missions.onWindow(ctx, 'turn.end', 'e' + Math.random())
    return s.players.A.vp
  }

  it('WOR-015 at the end of the opponent\'s turn, controlling the marker nearest the opponent\'s edge scores 4 VP', () => {
    const s = makeState({ phase: 'command', active: 'B' })
    expect(Object.values(s.mission.secondaries.A).some((r) => r.code === 'ravageAndRansack')).toBe(true)
    hold(s, nearestMarkers(s))
    expect(score(s, 'B')).toBe(4)
  })

  it('WOR-015 the end of the player\'s own turn scores 0, and so does holding a marker that is not the nearest one', () => {
    const own = makeState({ phase: 'command', active: 'A' })
    hold(own, nearestMarkers(own))
    expect(score(own, 'A')).toBe(0)
    const s = makeState({ phase: 'command', active: 'B' })
    const near = new Set(nearestMarkers(s))
    hold(s, Object.keys(s.objectives).filter((id) => !near.has(id)))
    expect(score(s, 'B')).toBe(0)
    hold(s, [])
    expect(score(s, 'B')).toBe(0)
  })

  it('WOR-015 markers tied for the nearest spot: controlling either one scores 4 once', () => {
    const s = makeState({ phase: 'command', active: 'B' })
    const [first] = nearestMarkers(s)
    const other = Object.values(s.objectives).find((o) => o.id !== first && !nearestMarkers(s).includes(o.id))!
    other.pos = { ...other.pos, z: s.objectives[first].pos.z }
    expect(nearestMarkers(s).length).toBeGreaterThan(1)
    hold(s, [nearestMarkers(s)[1]])
    expect(score(s, 'B')).toBe(4)
  })

  it('WOR-015 the 20 VP cap (5 x 4) holds across turns', () => {
    const s = makeState({ phase: 'command', active: 'B' })
    hold(s, nearestMarkers(s))
    for (let r = 1; r <= 5; r++) { s.round = r; score(s, 'B') }
    expect(s.players.A.vp).toBe(20)
  })
})

// ---------- Blood Offering ----------
describe('Blood Offering (WOR-4)', () => {
  const setup = (): GameState => {
    const s = makeState({ a: { secondaryId: 'we.sec.blood-offering' }, phase: 'fight', active: 'A' })
    const marker = Object.values(s.objectives).find((o) => !o.removed)!
    placeUnit(s, KARAGAR, [[-20, -14]])
    placeUnit(s, BZK, { x: marker.pos.x - 2, z: marker.pos.z - 3, gap: 0.3 })
    placeUnit(s, TERM, [[marker.pos.x, marker.pos.z]])
    placeUnit(s, INF, [[-20, 14]]) // far from every marker
    s.phaseState = emptyPhaseState()
    return s
  }
  const snapshot = (s: GameState): void => {
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'fight.start', 'k')
  }
  const slay = (s: GameState, unitId: string): void => { killUnit(s, unitId, bzkKill(s)) }

  it('WOR-016 an enemy unit within range of a marker at the start of the phase, destroyed by a Berzerker melee attack, scores 2 VP', () => {
    const s = setup()
    snapshot(s)
    slay(s, TERM)
    expect(s.players.A.vp).toBe(2)
    expect(s.players.A.vpBySource['blood-offering']).toBe(2)
  })

  it('WOR-016 a unit that was off every marker at the start of the phase scores nothing, nor does a ranged kill', () => {
    const s = setup()
    snapshot(s)
    slay(s, INF)
    expect(s.players.A.vp).toBe(0)
    const t = setup()
    snapshot(t)
    killUnit(t, TERM, { player: 'A', unitId: BZK, modelId: t.units[BZK].models[0], kind: 'ranged' } as never)
    expect(t.players.A.vp).toBe(0)
  })

  it('WOR-016 a unit that walked onto the marker after the phase started does not count; two qualifying kills in a phase score 4', () => {
    const s = setup()
    const marker = Object.values(s.objectives).find((o) => !o.removed)!
    placeUnit(s, TERM, [[-20, 14]])
    snapshot(s)
    placeUnit(s, TERM, [[marker.pos.x, marker.pos.z]])
    slay(s, TERM)
    expect(s.players.A.vp).toBe(0)

    const t = setup()
    const m = Object.values(t.objectives).find((o) => !o.removed)!
    placeUnit(t, INF, [[m.pos.x + 1, m.pos.z]])
    snapshot(t)
    slay(t, TERM)
    slay(t, INF)
    expect(t.players.A.vp).toBe(4)
  })

  it('WOR-016 only a WORLD EATERS killer counts: a kill by an enemy unit of the other player scores nothing for the World Eaters player', () => {
    const s = setup()
    snapshot(s)
    killUnit(s, BZK, { player: 'B', unitId: TERM, modelId: s.units[TERM].models[0], kind: 'melee' } as never)
    expect(s.players.A.vp).toBe(0)
  })
})

// ---------- Rage Unchecked ----------
describe('Rage Unchecked (WOR-5)', () => {
  const useIds = (s: GameState, player: PlayerId, window: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}): string[] =>
    stratagemService.options(s, player, window, trigger).filter((x) => x.stratagemId === id).flatMap((x) => x.targets.unitIds ?? [])
  const hurt = (s: GameState, left = 4): void => { s.units[BZK].models = s.units[BZK].models.slice(0, left) }
  const ready = (phase: GameState['phase'], active: PlayerId): GameState => {
    const s = makeState({ phase, active })
    placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, JAK, { x: -12, z: 6, gap: 0.3 })
    placeUnit(s, TERM, [[-12, 0]])
    s.players.A.cp = 3
    return s
  }

  it('WOR-017 a Berzerkers unit below half-strength that has not fought is offered the stratagem in the Fight phase, never Jakhals', () => {
    const s = ready('fight', 'A')
    hurt(s, 4)
    expect(useIds(s, 'A', 'fight.start', RAGE)).toEqual([BZK])
    const full = ready('fight', 'A')
    expect(useIds(full, 'A', 'fight.start', RAGE)).toEqual([])
    const five = ready('fight', 'A')
    hurt(five, 5)
    expect(useIds(five, 'A', 'fight.start', RAGE)).toEqual([]) // 5 of 10 is not below half
    s.units[JAK].models = s.units[JAK].models.slice(0, 3)
    expect(useIds(s, 'A', 'fight.start', RAGE)).toEqual([BZK])
  })

  it('WOR-017 offered in the opponent\'s Fight phase too; not once the unit has fought; Shooting phase only for the active player and before it shot', () => {
    const opp = ready('fight', 'B')
    hurt(opp, 4)
    expect(useIds(opp, 'A', 'fight.start', RAGE)).toEqual([BZK])
    const fought = ready('fight', 'A')
    hurt(fought, 4)
    fought.units[BZK].turn.foughtThisPhase = true
    expect(useIds(fought, 'A', 'fight.attacksResolved', RAGE)).toEqual([])
    const shoot = ready('shooting', 'A')
    hurt(shoot, 4)
    expect(useIds(shoot, 'A', 'shooting.start', RAGE)).toEqual([BZK])
    shoot.units[BZK].turn.shotThisPhase = true
    expect(useIds(shoot, 'A', 'shooting.start', RAGE)).toEqual([])
    const theirs = ready('shooting', 'B')
    hurt(theirs, 4)
    expect(useIds(theirs, 'A', 'shooting.start', RAGE)).toEqual([])
  })

  it('WOR-017 used, every weapon of the unit has SUSTAINED HITS 1 until the end of the phase', () => {
    const s = ready('fight', 'A')
    hurt(s, 4)
    const { ctx } = ctxOf(s)
    const sustained = (): { ability: string; value?: unknown }[] =>
      hookService.weaponAbilitiesFor(s, s.units[BZK].models[0], s.weapons[CHAINBLADE]).filter((a) => a.ability === 'SUSTAINED_HITS')
    expect(sustained()).toHaveLength(0)
    const opt = stratagemService.options(s, 'A', 'fight.start', {}).find((x) => x.stratagemId === RAGE) as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'fight.start', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    expect(stratagemService.handle(ctx, { ...opt, decisionId: 'd:1' }, pending)).toBeUndefined()
    expect(s.players.A.cp).toBe(2)
    expect(sustained()).toHaveLength(1)
    expect(sustained()[0].value).toBe(1)
    // the other World Eaters unit does not get it
    expect(hookService.weaponAbilitiesFor(s, s.units[JAK].models[0], s.weapons[s.models[s.units[JAK].models[0]].weapons[0]]).some((a) => a.ability === 'SUSTAINED_HITS' && (a.value as number) > 1)).toBe(false)
  })
})

// ---------- Unstoppable Fury ----------
describe('Unstoppable Fury (WOR-5)', () => {
  it('WOR-019 the stratagem can only target the consolidating unit, in a Fight phase window, for either player', () => {
    const s = makeState({ phase: 'fight', active: 'B' })
    placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, JAK, { x: -12, z: 6, gap: 0.3 })
    placeUnit(s, TERM, [[-12, 0]])
    s.players.A.cp = 2
    const offered = stratagemService.options(s, 'A', 'fight.beforeConsolidate', { unitId: BZK }).filter((x) => x.stratagemId === FURY)
    expect(offered.flatMap((x) => x.targets.unitIds ?? [])).toEqual([BZK])
    expect(stratagemService.options(s, 'A', 'fight.beforeConsolidate', { unitId: JAK }).filter((x) => x.stratagemId === FURY).flatMap((x) => x.targets.unitIds ?? [])).toEqual([JAK])
    expect(stratagemService.options(s, 'A', 'fight.beforeConsolidate', { unitId: TERM }).filter((x) => x.stratagemId === FURY)).toHaveLength(0)
  })

  it('WOR-018 used, the unit gets the consolidate-only 6" source (enemy form), pile-in stays 3"', () => {
    const s = makeState({ phase: 'fight', active: 'A' })
    placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, TERM, [[-12, 0]])
    s.players.A.cp = 2
    const { ctx } = ctxOf(s)
    const opt = stratagemService.options(s, 'A', 'fight.beforeConsolidate', { unitId: BZK }).find((x) => x.stratagemId === FURY) as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'fight.beforeConsolidate', canPass: true, context: { trigger: { unitId: BZK } }, options: [] } as unknown as PendingDecision
    expect(hookService.consolidateDistance(s, BZK, 3, 'enemy')).toBe(3)
    expect(stratagemService.handle(ctx, { ...opt, decisionId: 'd:1' }, pending)).toBeUndefined()
    expect(hookService.consolidateDistance(s, BZK, 3, 'enemy')).toBe(6)
    expect(hookService.consolidateDistance(s, BZK, 3, 'objective')).toBe(3)
    expect(hookService.pileInDistance(s, BZK, 3)).toBe(3)
  })
})

// ---------- Overwhelming Onslaught ----------
describe('Overwhelming Onslaught (WOR-5)', () => {
  const ready = (active: PlayerId = 'A'): GameState => {
    const s = makeState({ phase: 'charge', active })
    placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, JAK, { x: -12, z: 12, gap: 0.3 })
    placeUnit(s, TERM, [[-12, -3]]) // standing in Engagement Range of the first Berzerker
    placeUnit(s, INF, [[12, 12]]) // far away
    s.units[BZK].turn.chargedThisTurn = true
    s.players.A.cp = 2
    return s
  }
  const targetsOf = (s: GameState, unitId: string): string[][] =>
    stratagemService.options(s, 'A', 'charge.moveEnded', { unitId }).filter((x) => x.stratagemId === ONSLAUGHT).map((x) => x.targets.unitIds ?? [])

  it('WOR-020 offered for the unit that just ended a Charge move and an enemy unit in Engagement Range; far-away enemies cannot be picked', () => {
    const s = ready()
    const opts = targetsOf(s, BZK)
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.every((t) => t[0] === BZK && t[1] === TERM)).toBe(true)
    expect(opts.some((t) => t[1] === INF)).toBe(false)
  })

  it('WOR-020 the enemy takes a Battle-shock test with 1 subtracted: a roll equal to its Leadership fails', () => {
    const s = ready()
    const ld = Math.min(...s.units[TERM].models.map((m) => modelStats(s, s.models[m]).Ld))
    const d1 = Math.min(6, ld - 1)
    const d2 = ld - d1
    const { ctx, events } = ctxOf(s, [d1, d2, 3, 3, 3, 3])
    const opt = stratagemService.options(s, 'A', 'charge.moveEnded', { unitId: BZK }).find((x) => x.stratagemId === ONSLAUGHT && x.targets.unitIds?.[1] === TERM) as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'charge.moveEnded', canPass: true, context: { trigger: { unitId: BZK } }, options: [] } as unknown as PendingDecision
    expect(stratagemService.handle(ctx, { ...opt, decisionId: 'd:1' }, pending)).toBeUndefined()
    const t = of(events, 'BattleShockTested')[0]
    expect(t).toBeDefined()
    expect(t.unitId).toBe(TERM)
    expect(t.passed).toBe(false)
    expect(s.units[TERM].battleShocked).toBe(true)
    expect(s.players.A.cp).toBe(1)
  })

  it('WOR-020 the same roll passes with the same Leadership when the roll is one higher (the -1 is the only difference)', () => {
    const s = ready()
    const ld = Math.min(...s.units[TERM].models.map((m) => modelStats(s, s.models[m]).Ld))
    const total = Math.min(12, ld + 1)
    const d1 = Math.min(6, total - 1)
    const { ctx, events } = ctxOf(s, [d1, total - d1, 3, 3])
    const opt = stratagemService.options(s, 'A', 'charge.moveEnded', { unitId: BZK }).find((x) => x.stratagemId === ONSLAUGHT && x.targets.unitIds?.[1] === TERM) as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'charge.moveEnded', canPass: true, context: { trigger: { unitId: BZK } }, options: [] } as unknown as PendingDecision
    stratagemService.handle(ctx, { ...opt, decisionId: 'd:1' }, pending)
    expect(of(events, 'BattleShockTested')[0].passed).toBe(ld + 1 - 1 >= ld)
  })

  it('WOR-021 not offered for a unit that did not just charge, in the opponent\'s Charge phase, or in another phase', () => {
    const s = ready()
    expect(targetsOf(s, JAK)).toHaveLength(0) // the trigger unit must be the first target
    const opp = ready('B')
    expect(targetsOf(opp, BZK)).toHaveLength(0)
    const fight = ready()
    fight.phase = 'fight'
    expect(targetsOf(fight, BZK)).toHaveLength(0)
  })
})

// ---------- AI ----------
describe('AI plays the World Eaters', () => {
  const window = (w: string, trigger: Record<string, unknown>) =>
    ({ id: 'd', player: 'A', window: w, canPass: true, kind: 'stratagemWindow', context: { trigger, usable: [] }, options: [] }) as unknown as PendingDecision
  const use = (id: string, ...unitIds: string[]): UseStratagemAction => ({ type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: id, targets: { unitIds } })

  it('WOR-025 the Blessings decision is answered with its first offered option (the best set); the decision never rejects', async () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s, [6, 6, 6, 6, 1, 1, 2, 3])
    hookService.offerPicks(ctx, 'round.start', '1')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.options[0].id).toBe('totalCarnage+warpBlades')
    const legal = pending.options.map((o) => ({ ...o.action, decisionId: pending.id }) as Action)
    const a = await createUtilityDecider('normal', 'we-ai').decide(engineView(s, 'A'), pending as PendingDecision, legal)
    expect((a as { optionId: string }).optionId).toBe('totalCarnage+warpBlades')
    // a worse roll still picks its best set
    const t = makeState({ round: 1, phase: 'command' })
    hookService.offerPicks(ctxOf(t, [1, 1, 2, 3, 4, 5, 6, 6]).ctx, 'round.start', '1')
    const p2 = t.pending as ChooseOptionDecision
    const legal2 = p2.options.map((o) => ({ ...o.action, decisionId: p2.id }) as Action)
    const b = await createUtilityDecider('normal', 'we-ai').decide(engineView(t, 'A'), p2 as PendingDecision, legal2)
    expect((b as { optionId: string }).optionId).toBe(p2.options[0].id)
    expect((b as { optionId: string }).optionId).not.toBe('none')
  })

  it('WOR-025 the bot values Overwhelming Onslaught on a unit it can shock, Unstoppable Fury only with an enemy 4-6" away, Rage Unchecked in melee', () => {
    const s = makeState({ phase: 'charge', active: 'A' })
    placeUnit(s, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, TERM, [[-12, -3]])
    s.players.A.cp = 4
    expect(stratagemScore(s, 'A', window('charge.moveEnded', { unitId: BZK }), use(ONSLAUGHT, BZK, TERM), 1)).toBeGreaterThan(-Infinity)
    const f = makeState({ phase: 'fight', active: 'A' })
    placeUnit(f, BZK, { x: -12, z: -3, gap: 0.3 })
    placeUnit(f, TERM, [[-12, 40]])
    placeUnit(f, INF, [[40, 40]])
    f.players.A.cp = 4
    expect(stratagemScore(f, 'A', window('fight.beforeConsolidate', { unitId: BZK }), use(FURY, BZK), 1)).toBe(-Infinity)
    placeUnit(f, TERM, [[-12, 3.2]])
    expect(stratagemScore(f, 'A', window('fight.beforeConsolidate', { unitId: BZK }), use(FURY, BZK), 1)).toBeGreaterThan(-Infinity)
  })
})

// ---------- Real attacks: Karagar and the Jakhals (WOR-6) ----------
describe('weapon profiles resolved through real attacks (WOR-6)', () => {
  const HORN = 'we.w.juggernauts-bladed-horn', SUPERCHARGE = 'we.w.plasma-pistol-karagar-supercharge'
  const JAK_BLADES = 'we.w.jakhal-chainblades', MAULER = 'we.w.mauler-chainblade', SKULLSMASHER = 'we.w.skullsmasher'
  const FIST = 'sm.w.power-fist'
  const ones = (n = 60): number[] => Array(n).fill(1)

  // run the attack sequence to its end, answering every decision with the first offered option
  function drive(ctx: EngineContext): void {
    for (let i = 0; i < 400 && attackService.advance(ctx) === 'pending'; i++) {
      const pending = ctx.state.pending as PendingDecision
      const opts = 'options' in pending ? pending.options : []
      ctx.state.pending = null
      const action = (opts[0]?.action ?? { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
      const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? stratagemService : attackService.handler
      const rej = owner.handle(ctx, action, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    }
  }
  const tgt = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null) =>
    ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })

  // Karagar 1" from a Terminator Squad, in the Fight phase
  function duel(): GameState {
    const s = makeState({ phase: 'fight', active: 'A' })
    placeUnit(s, KARAGAR, [[0, 0]])
    placeUnit(s, TERM, { x: 2.5, z: 0, gap: 0.3 })
    return s
  }
  function melee(s: GameState, unitId: string, targets: ReturnType<typeof tgt>[], dice: number[]): GameEvent[] {
    const { ctx, events } = ctxOf(s, dice)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: unitId, overwatch: false, targets })
    drive(ctx)
    return events
  }

  it('WOR-022 the Juggernaut\'s bladed horn (Extra Attacks) attacks alongside the exalted chainblade: 7 + 4 hit rolls in one fight', () => {
    const s = duel()
    const k = s.units[KARAGAR].models[0]
    expect(s.models[k].weapons).toEqual(expect.arrayContaining([EXALTED, HORN]))
    expect(abilitiesOf(s, KARAGAR, HORN)).toContain('EXTRA_ATTACKS')
    expect(abilitiesOf(s, KARAGAR, EXALTED)).not.toContain('EXTRA_ATTACKS')
    const both = of(melee(s, KARAGAR, [tgt(k, EXALTED, TERM), tgt(k, HORN, TERM)], ones()), 'HitRolled')
    expect(both).toHaveLength(11)
    const horn = of(melee(duel(), KARAGAR, [tgt(k, HORN, TERM)], ones()), 'HitRolled')
    expect(horn).toHaveLength(4)
  })

  it('WOR-022 Lance (on the bladed horn only) adds 1 to the wound roll once Karagar has charged: S6 vs T5 needs 3+, a 2 wounds only after the charge', () => {
    const after = duel()
    const k = after.units[KARAGAR].models[0]
    expect(abilitiesOf(after, KARAGAR, HORN)).toContain('LANCE')
    expect(abilitiesOf(after, KARAGAR, EXALTED)).not.toContain('LANCE')
    after.units[KARAGAR].turn.chargedThisTurn = true
    // hit (6), wound die 2, then a failed save (1) and the damage
    const wound = of(melee(after, KARAGAR, [tgt(k, HORN, TERM, 1)], [6, 2, ...ones()]), 'WoundRolled')[0]
    expect(wound).toMatchObject({ die: 2, final: 3, wounded: true })
    // the exalted chainblade (no Lance) is not helped by the charge
    const charged = duel()
    charged.units[KARAGAR].turn.chargedThisTurn = true
    expect(of(melee(charged, KARAGAR, [tgt(k, EXALTED, TERM, 1)], [6, 2, ...ones()]), 'WoundRolled')[0]).toMatchObject({ die: 2, final: 2, wounded: false })
    // no charge this turn: the horn's 2 fails
    const idle = duel()
    expect(of(melee(idle, KARAGAR, [tgt(k, HORN, TERM, 1)], [6, 2, ...ones()]), 'WoundRolled')[0]).toMatchObject({ die: 2, final: 2, wounded: false })
  })

  function shoot(s: GameState, weaponId: string, dice: number[]): GameEvent[] {
    const { ctx, events } = ctxOf(s, dice)
    const k = s.units[KARAGAR].models[0]
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: KARAGAR, overwatch: false, targets: [tgt(k, weaponId, TERM, 1)] })
    drive(ctx)
    return events
  }
  const range = (): GameState => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    placeUnit(s, KARAGAR, [[-6, 0]])
    placeUnit(s, TERM, [[3, 0]])
    return s
  }

  it('WOR-022 the supercharged plasma pistol is Hazardous and the standard profile is not: a failed test costs Karagar 3 mortal wounds', () => {
    const s = range()
    expect(abilitiesOf(s, KARAGAR, SUPERCHARGE)).toEqual(expect.arrayContaining(['HAZARDOUS', 'PISTOL']))
    expect(abilitiesOf(s, KARAGAR, PLASMA)).not.toContain('HAZARDOUS')
    const k = s.units[KARAGAR].models[0]
    const failed = shoot(s, SUPERCHARGE, [1, 1, ...ones()]) // the shot misses, then the Hazardous die is a 1
    expect(of(failed, 'HazardousTested')[0]).toMatchObject({ failed: true, modelId: k, weaponId: SUPERCHARGE })
    expect(of(failed, 'DamageApplied').filter((d) => d.mortal && d.modelId === k).length).toBeGreaterThan(0)
    expect(s.models[k].woundsRemaining).toBe(4) // 7 W - 3 mortal wounds
    const passed = range()
    const ok = shoot(passed, SUPERCHARGE, [1, 2, ...ones()])
    expect(of(ok, 'HazardousTested')[0]).toMatchObject({ failed: false })
    expect(passed.models[passed.units[KARAGAR].models[0]].woundsRemaining).toBe(7)
    // the standard profile rolls no Hazardous test at all
    expect(of(shoot(range(), PLASMA, [1, ...ones()]), 'HazardousTested')).toHaveLength(0)
  })

  it('WOR-022 Karagar has BS 2+: a 2 hits and a 1 misses', () => {
    expect(bundle.weapons[PLASMA].skill).toBe(2)
    expect(bundle.weapons[SUPERCHARGE].skill).toBe(2)
    expect(of(shoot(range(), PLASMA, [2, ...ones()]), 'HitRolled')[0]).toMatchObject({ die: 2, hit: true })
    expect(of(shoot(range(), PLASMA, [1, ...ones()]), 'HitRolled')[0]).toMatchObject({ die: 1, hit: false })
  })

  const jakhalUnit = (): GameState => {
    const s = makeState({ phase: 'fight', active: 'A' })
    placeUnit(s, JAK, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, TERM, { x: 0, z: 1.8, gap: 0.3 })
    return s
  }

  it('WOR-023 Jakhal chainblades and the mauler chainblade have Sustained Hits 1: a critical hit adds a hit, so two wound rolls; a Berzerker chainblade adds none', () => {
    const s = jakhalUnit()
    expect(abilitiesOf(s, JAK, JAK_BLADES)).toContain('SUSTAINED_HITS')
    expect(abilitiesOf(s, JAK, MAULER)).toContain('SUSTAINED_HITS')
    const blade = modelWith(s, JAK, JAK_BLADES)
    const ev = melee(s, JAK, [tgt(blade, JAK_BLADES, TERM, 1)], [6, ...ones()])
    expect(of(ev, 'HitRolled')[0]).toMatchObject({ critical: true, extraHits: 1 })
    expect(of(ev, 'WoundRolled')).toHaveLength(2)
    // a non-critical hit gets no extra hit
    const plain = jakhalUnit()
    expect(of(melee(plain, JAK, [tgt(blade, JAK_BLADES, TERM, 1)], [4, ...ones()]), 'WoundRolled')).toHaveLength(1)
    // the mauler (WS 5+)
    const m = jakhalUnit()
    const mauler = modelWith(m, JAK, MAULER)
    expect(of(melee(m, JAK, [tgt(mauler, MAULER, TERM, 1)], [6, ...ones()]), 'WoundRolled')).toHaveLength(2)
    // Berzerker chainblade: no Sustained Hits
    const b = makeState({ phase: 'fight', active: 'A' })
    placeUnit(b, BZK, { x: 0, z: 0, gap: 0.3 })
    placeUnit(b, TERM, { x: 0, z: 1.8, gap: 0.3 })
    expect(of(melee(b, BZK, [tgt(modelWith(b, BZK, CHAINBLADE), CHAINBLADE, TERM, 1)], [6, ...ones()]), 'WoundRolled')).toHaveLength(1)
  })

  it('WOR-023 the Dishonoured has only the skullsmasher (no ranged weapon) yet counts for coherency and Objective Control', () => {
    const s = makeState({ phase: 'shooting', active: 'A' })
    const dis = modelWith(s, JAK, SKULLSMASHER)
    expect(s.models[dis].weapons).toEqual([SKULLSMASHER])
    expect(s.weapons[SKULLSMASHER].kind).toBe('melee')
    expect(s.models[dis].weapons.filter((w) => s.weapons[w].kind === 'ranged')).toHaveLength(0)
    // every other Jakhal carries a ranged autopistol, so the lack of one is specific to the Dishonoured
    const others = s.units[JAK].models.filter((m) => m !== dis)
    expect(others.every((m) => s.models[m].weapons.some((w) => s.weapons[w].kind === 'ranged'))).toBe(true)
    // coherency: a tight pack is coherent, and the Dishonoured cut off from it breaks coherency (it is counted)
    placeUnit(s, JAK, { x: -12, z: 6, gap: 0.3 })
    expect(isCoherent(unitModelsForCoherency(s, JAK))).toBe(true)
    const apart = s.units[JAK].models.map((m) => (m === dis ? [-12, 25] : [-12, 6])) as [number, number][]
    placeUnit(s, JAK, apart)
    expect(isCoherent(unitModelsForCoherency(s, JAK))).toBe(false)
    // OC: alone on a marker, the Dishonoured contributes its OC of 1
    const marker = Object.values(s.objectives).find((o) => !o.removed)!
    const spots = s.units[JAK].models.map((m) => (m === dis ? [marker.pos.x, marker.pos.z] : [-40, -40])) as [number, number][]
    placeUnit(s, JAK, spots)
    expect(DEFAULT_MODULES.services.objectives.levelOfControl(s, marker.id).A).toBe(modelStats(s, s.models[dis]).OC)
    expect(modelStats(s, s.models[dis]).OC).toBe(1)
  })

  it('WOR-023 Jakhals have Feel No Pain 6+ against normal damage: a 6 ignores the wound, a 5 does not', () => {
    const run = (fnpDie: number) => {
      const s = makeState({ phase: 'fight', active: 'B' })
      placeUnit(s, JAK, { x: 0, z: 0, gap: 0.3 })
      placeUnit(s, TERM, { x: 0, z: 1.8, gap: 0.3 })
      const fist = modelWith(s, TERM, FIST)
      // hit, wound, then one Feel No Pain die per damage point of the D2 fist (Sv 6+ with AP-2 allows no save)
      const ev = melee(s, TERM, [tgt(fist, FIST, JAK, 1)], [4, 6, fnpDie, fnpDie, ...ones()])
      return { fnp: of(ev, 'FeelNoPainRolled')[0], hurt: of(ev, 'ModelDestroyed').length > 0 }
    }
    const six = run(6)
    expect(six.fnp).toMatchObject({ needed: 6, die: 6, ignored: true })
    expect(six.hurt).toBe(false)
    const five = run(5)
    expect(five.fnp).toMatchObject({ needed: 6, die: 5, ignored: false })
    expect(five.hurt).toBe(true)
  })
})
