// Adeptus Mechanicus: Maniple Verask-Alpha (docs/spec/factions/adeptus-mechanicus--maniple-verask-alpha.md, checklist MVA-003..MVA-019).
// Real Combat Patrol data. Covers the (b) code hooks: imperativeSurgeWafer, exploratorAcquisition, mvaHolyApparatus, retributionCodes,
// keywordAnyOf, enginseerLoneOperative, omnissiahsBlessing, plus the declarative pieces they sit beside (Data-Tether, Doctrina, Damaged).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGame, createGameState, legalActions, step, deploymentZone, emptyPhaseState, view,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type ModuleTable, type PendingDecision, type PlayerId, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { attackService } from '../../src/engine/attack'
import { IMPERATIVE_KEY, surgeOverwatchStep } from '../../src/engine/factions/adeptus-mechanicus'
import { codeHooks } from '../../src/engine/code-hooks'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { missionService } from '../../src/engine/missions'
import { targetLegality, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { effectService } from '../../src/engine/effects'
import { HOLD_CP_SCORE, stratagemScore } from '../../src/ai/stratagems'
import { runGame } from '../../tools/sim-core'
import { baseFitsRoom, deploymentRoom } from '../../src/data/rosterFit'
import { isOversizeForZone, oversizeEdgePlacementOk, snapToBattlefieldEdge } from '../../src/engine/geometry'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const MVA = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'AdMech', faction: 'adeptus-mechanicus', patrolId: 'adm.cp.maniple-verask-alpha', enhancementId: 'adm.e.omniballistic-data-tether',
  secondaryId: 'adm.sec.explorator-acquisition', attachments: [{ leaderRef: 'verask', bodyguardRef: 'rangers' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const VER = 'A:verask', RNG = 'A:rangers', KAT = 'A:kataphrons', DUNE = 'A:dunecrawler'
const BOYZ = 'B:boyz-a', BOSS = 'B:warboss'
const GALV = 'adm.w.galvanic-rifle', ARQ = 'adm.w.transuranic-arquebus', ICARUS = 'adm.w.icarus-array', PISTOL_V = 'adm.w.mechanicus-pistol-verask'
const CULV_STD = 'adm.w.kataphron-plasma-culverin-standard', CULV_SUP = 'adm.w.kataphron-plasma-culverin-supercharge'
const SURGE = 'adm.e.imperative-surge-wafer', TETHER = 'adm.e.omniballistic-data-tether'
const RETRIB = 'adm.s.mva-retribution-codes', SHROUD = 'adm.s.mva-reactive-field-shroud', RETRO = 'adm.s.mva-retrogradial-targeting'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mirror?: boolean; round?: number; phase?: GameState['phase']; active?: PlayerId }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: MVA(o.a), B: o.mirror ? MVA({ name: 'AdMech B', ...o.b }) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'adeptus-mechanicus', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.B.waaagh.used = true
  return s
}

function openServices(): Services {
  return {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
  }
}
function ctxOf(s: GameState, dice: number[] = [], open = true) {
  const modules: ModuleTable = open ? { phases: DEFAULT_MODULES.phases, services: openServices(), topics: DEFAULT_MODULES.topics } : DEFAULT_MODULES
  return createContext(s, new ScriptedRng(dice), modules)
}

const optionIds = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)
function answerOption(ctx: EngineContext, optionId: string) {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  return hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
}
const answerOk = (ctx: EngineContext, optionId: string): void => {
  const rej = answerOption(ctx, optionId)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const modelWith = (s: GameState, unitId: string, weaponId: string): string => s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))!
const setImperative = (s: GameState, player: PlayerId, choice: 'protector' | 'conqueror', round = s.round): void => {
  s.players[player].secondaryState[IMPERATIVE_KEY] = { round, choice }
}
const setPhase = (s: GameState, phase: GameState['phase'], active: PlayerId, cp: { A?: number; B?: number } = {}): void => {
  s.phase = phase
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string, o: Partial<AttackContext> = {}): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 12, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false, ...o,
  }
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function withAp(s: GameState, baseId: string, ap: number, kind?: 'ranged' | 'melee'): string {
  const id = `test.${baseId}.ap${ap}${kind ?? ''}`
  s.weapons = { ...s.weapons, [id]: { ...s.weapons[baseId], id, AP: ap, ...(kind ? { kind } : {}) } }
  return id
}
const apAt = (s: GameState, attackerModel: string, weaponId: string, target: string): number =>
  weaponService.effectiveWeapon(s, attackerModel, weaponId, attackCtx(s, attackerModel, weaponId, target)).AP
const abilitiesOf = (s: GameState, model: string, weaponId: string, target?: string): string[] =>
  hookService.weaponAbilitiesFor(s, model, s.weapons[weaponId], target ? attackCtx(s, model, weaponId, target) : undefined).map((a) => a.ability)

const inZone = (s: GameState, p: PlayerId): [number, number] => { const z = deploymentZone(s, p); return [0, (z[0].z + z[2].z) / 2] }

// ---- full attack sequences ----
const TAIL = Array(60).fill(2)
type StateWeapon = GameState['weapons'][string]
let armedCount = 0
function armed(s: GameState, modelId: string, baseId: string, patch: Partial<StateWeapon>): string {
  const id = `test.w${++armedCount}`
  s.weapons = { ...s.weapons, [id]: { ...s.weapons[baseId], ...patch, id } as StateWeapon }
  s.models[modelId].weapons = [...s.models[modelId].weapons, id]
  return id
}
const tgt = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const eventsOf = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

// runs one attack sequence to its end; every raised decision is answered by `choose(pending)` (default: the first option) and logged
interface AttackLog { events: GameEvent[]; offers: { purpose: string; optionIds: string[] }[] }
function runAttack(s: GameState, dice: number[], kind: 'ranged' | 'melee', attackerUnitId: string, targets: DeclaredTarget[],
  choose: (p: PendingDecision) => Action | null = () => null, overwatch = false): AttackLog {
  s.players.A.cp = 0
  s.players.B.cp = 0
  const { ctx, events } = ctxOf(s, [...dice, ...TAIL])
  const offers: AttackLog['offers'] = []
  attackService.begin(ctx, { kind, attackerUnitId, overwatch, targets })
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('attack sequence did not finish')
    const pending = ctx.state.pending as PendingDecision
    const opts = ('options' in pending ? pending.options : []) as { id: string; action: Action }[]
    if (pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer') offers.push({ purpose: String((pending.context.data as { purpose?: string }).purpose), optionIds: opts.map((o) => o.id) })
    const isWindow = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow'
    const action = choose(pending) ?? (isWindow ? ({ type: 'pass', player: pending.player, decisionId: pending.id } as Action) : opts[0].action)
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return { events, offers }
}
const rerollOption = (p: PendingDecision): Action | null => {
  if (p.kind !== 'chooseOption' || p.context.topic !== 'rerollOffer') return null
  return p.options.find((o) => o.id === 'reroll')?.action ?? null
}

function stratHarness(s: GameState) {
  const services: Services = {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: () => undefined, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
  const { ctx } = createContext(s, new ScriptedRng([]), { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics })
  const use = (stratagemId: string, firstId?: string) => {
    const opts = ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((x) => x.action as UseStratagemAction)
    const opt = opts.find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    const pending = s.pending as PendingDecision
    s.pending = null
    return stratagemService.handle(ctx, { ...opt, player: pending.player, decisionId: pending.id } as Action, pending) ?? null
  }
  return { ctx, use }
}
const offeredIds = (s: GameState, p: PlayerId, w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}): string[][] =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])
const byEnemy = (unitId: string) => ({ player: 'B' as const, unitId, modelId: `${unitId}#0`, kind: 'ranged' as const })
const killUnit = (s: GameState, ctx: EngineContext, unitId: string, by: Parameters<typeof attackService.destroyModel>[2]): void => {
  for (const m of [...s.units[unitId].models]) attackService.destroyModel(ctx, m, by)
}

// =====================================================================================================================
describe('registration', () => {
  it('MVA-019 all seven new code hooks are registered in the code registry', () => {
    for (const k of ['imperativeSurgeWafer', 'exploratorAcquisition', 'mvaHolyApparatus', 'retributionCodes', 'keywordAnyOf', 'enginseerLoneOperative', 'omnissiahsBlessing']) {
      expect(codeHooks[k], k).toBeTruthy()
    }
  })
})

// an Ork gun with a fixed profile, hitting on a 2+ so a die of 6 is a certain hit
function orkWeapon(s: GameState, patch: Partial<StateWeapon> = {}): { model: string; weapon: string } {
  const model = s.units[BOYZ].models[0]
  const base = s.models[model].weapons.map((w) => s.weapons[w]).find((w) => w.kind === 'ranged') ?? Object.values(s.weapons).find((w) => w.kind === 'ranged')!
  return { model, weapon: armed(s, model, base.id, { A: 1, skill: 2, AP: 0, D: 1, abilities: [], range: 24, ...patch }) }
}
const orkGunAp = (s: GameState, ap: number): { model: string; weapon: string } => {
  const model = s.units[BOYZ].models[0]
  const base = s.models[model].weapons.map((w) => s.weapons[w]).find((w) => w.kind === 'ranged')!
  return { model, weapon: withAp(s, base.id, ap) }
}
const SURGE_ABILITY = 'adm.e.imperative-surge-wafer.effect'

// =====================================================================================================================
describe('Doctrina Imperatives on the new units (MVA-2.2-2.4)', () => {
  it('MVA-003 MVA-2.1: round.start asks a Verask-Alpha player to choose Protector or Conqueror', () => {
    const s = makeState({ round: 1 })
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(true)
    expect(optionIds(s)).toEqual(['protector', 'conqueror'])
  })

  it('MVA-003 MVA-2.2/2.3: Protector gives the galvanic rifle and the culverin HEAVY, the arquebus keeps exactly one HEAVY', () => {
    const s = makeState()
    const rifle = modelWith(s, RNG, GALV), culv = modelWith(s, KAT, CULV_STD), arq = modelWith(s, RNG, ARQ)
    expect(abilitiesOf(s, rifle, GALV)).not.toContain('HEAVY')
    setImperative(s, 'A', 'protector')
    expect(abilitiesOf(s, rifle, GALV)).toContain('HEAVY')
    expect(abilitiesOf(s, culv, CULV_STD)).toContain('HEAVY')
    expect(abilitiesOf(s, arq, ARQ).filter((a) => a === 'HEAVY')).toHaveLength(1)
    // the Dunecrawler has Doctrina too
    expect(abilitiesOf(s, modelWith(s, DUNE, ICARUS), ICARUS)).toContain('HEAVY')
    setImperative(s, 'A', 'conqueror')
    expect(abilitiesOf(s, rifle, GALV)).toContain('ASSAULT')
  })

  it('MVA-003 MVA-2.3: Conqueror - Icarus array AP -1 becomes -2 against a target partly in the enemy zone, not outside it', () => {
    const s = makeState()
    setImperative(s, 'A', 'conqueror')
    const m = modelWith(s, DUNE, ICARUS)
    placeUnit(s, DUNE, [[0, 0]])
    const [x, z] = inZone(s, 'B')
    placeUnit(s, BOYZ, [[x, z]])
    expect(apAt(s, m, ICARUS, BOYZ)).toBe(-2)
    placeUnit(s, BOYZ, [[0, 2]])
    expect(apAt(s, m, ICARUS, BOYZ)).toBe(-1)
  })

  it('MVA-003 MVA-2.3: Protector - an AP -2 shot at the Dunecrawler in its own zone becomes AP -1; outside the zone it does not', () => {
    const s = makeState()
    setImperative(s, 'A', 'protector')
    const [x, z] = inZone(s, 'A')
    placeUnit(s, DUNE, [[x, z]])
    placeUnit(s, BOYZ, [[0, 0]])
    const g = orkGunAp(s, -2)
    expect(apAt(s, g.model, g.weapon, DUNE)).toBe(-1)
    placeUnit(s, DUNE, [[0, 5]])
    expect(apAt(s, g.model, g.weapon, DUNE)).toBe(-2)
  })

  it('MVA-004 MVA-2.4: Verask leading the Rangers shares Conqueror (his pistol gains ASSAULT); alone he gets nothing', () => {
    const joined = makeState()
    setImperative(joined, 'A', 'conqueror')
    expect(abilitiesOf(joined, joined.units[VER].models[0], PISTOL_V)).toContain('ASSAULT')
    const alone = makeState({ a: { attachments: [] } })
    setImperative(alone, 'A', 'conqueror')
    expect(abilitiesOf(alone, alone.units[VER].models[0], PISTOL_V)).not.toContain('ASSAULT')
    setImperative(alone, 'A', 'protector')
    expect(abilitiesOf(alone, alone.units[VER].models[0], PISTOL_V)).not.toContain('HEAVY')
  })

  it('MVA-004 MVA-2.3: a Damaged Dunecrawler (4 W) carries -1 to hit while Protector adds HEAVY, so the net is 0; at 5 W there is no -1', () => {
    const s = makeState()
    setImperative(s, 'A', 'protector')
    const m = modelWith(s, DUNE, ICARUS)
    const mods = (): unknown[] => hookService.collect(ctxOf(s).ctx, 'onHitRoll', { attack: attackCtx(s, m, ICARUS, BOYZ), roll: rollOf(4, 'hit') })
      .map((r) => r.result).filter((r) => r.kind === 'roll' && (r as { modifier?: number }).modifier !== undefined)
    s.models[m].woundsRemaining = 5
    expect(mods()).toEqual([])
    s.models[m].woundsRemaining = 4
    expect(mods()).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(abilitiesOf(s, m, ICARUS)).toContain('HEAVY')
  })
})

// =====================================================================================================================
describe('Omniballistic Data-Tether (MVA-3.1)', () => {
  const ready = (a: Partial<PlayerSetup> = {}): GameState => {
    const s = makeState({ a })
    placeUnit(s, RNG, [[0, 0]]); placeUnit(s, VER, [[0, 0]]); placeUnit(s, BOYZ, [[0, 10]])
    return s
  }
  const shoot = (s: GameState, dice: number[], overwatch = false): AttackLog => {
    const rifle = modelWith(s, RNG, GALV), v = s.units[VER]?.models[0]
    const targets = [tgt(rifle, GALV, BOYZ), ...(v && s.units[VER].location === 'board' ? [tgt(v, PISTOL_V, BOYZ)] : [])]
    return runAttack(s, dice, 'ranged', RNG, targets, rerollOption, overwatch)
  }
  const purposes = (log: AttackLog): string[] => log.offers.map((o) => o.purpose)

  it('MVA-005 MVA-3.1: Verask + Rangers shoot - one failed hit die is offered once across both halves, not a second one for the pistol', () => {
    const s = ready()
    expect(purposes(shoot(s, [1, 1, 1, 1, 1, 1, 1, 1]))).toEqual(['hit'])
  })

  it('MVA-005 MVA-3.1: a failed wound die is offered once as well (hits succeed, wounds fail)', () => {
    const s = ready()
    // galvanic S4 vs Ork T5 wounds on 5+; hit dice 6 6, wound dice 1 1, then the pistol group 6 / 1
    expect(purposes(shoot(s, [6, 6, 1, 1, 1, 6, 1]))).toEqual(['wound'])
  })

  it('MVA-005 MVA-3.1: melee attacks get no Data-Tether re-roll; Rangers without Verask get none either', () => {
    const s = ready()
    const ccw = modelWith(s, RNG, 'adm.w.close-combat-weapon')
    expect(purposes(runAttack(s, [1, 1, 1, 1], 'melee', RNG, [tgt(ccw, 'adm.w.close-combat-weapon', BOYZ)], rerollOption))).toEqual([])
    const alone = ready({ attachments: [] })
    expect(purposes(shoot(alone, [1, 1, 1, 1, 1, 1]))).toEqual([])
  })

  it('MVA-005 MVA-3.1: the budget returns in the next phase, and an Overwatch shot has a budget of its own', () => {
    const s = ready()
    expect(purposes(shoot(s, [1, 1, 1, 1, 1, 1, 1, 1]))).toEqual(['hit'])
    expect(purposes(shoot(s, [1, 1, 1, 1, 1, 1, 1, 1]))).toEqual([]) // same phase: spent
    setPhase(s, 'shooting', 'A')
    expect(purposes(shoot(s, [1, 1, 1, 1, 1, 1, 1, 1]))).toEqual(['hit'])
    setPhase(s, 'movement', 'B') // the opponent's Movement phase: Fire Overwatch hits on a 6 only
    expect(purposes(shoot(s, [5, 5, 5, 5, 5, 5, 5, 5], true))).toEqual(['hit'])
  })
})

// =====================================================================================================================
describe('Imperative Surge-wafer (MVA-3.2)', () => {
  const ready = (b: Partial<PlayerSetup> = {}): GameState => {
    const s = makeState({ a: { enhancementId: SURGE }, b })
    placeUnit(s, RNG, [[0, 0]]); placeUnit(s, VER, [[0, 0]]); placeUnit(s, BOYZ, [[0, 10]])
    return s
  }
  const ranged = (s: GameState): string[] => abilitiesOf(s, modelWith(s, RNG, GALV), GALV, BOYZ)
  const pistol = (s: GameState): string[] => abilitiesOf(s, s.units[VER].models[0], PISTOL_V, BOYZ)

  it('MVA-006 MVA-3.2: use / decline is offered when the bearer\'s unit is selected to shoot; decline keeps it for the next Shooting phase', () => {
    const s = ready()
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', RNG)).toBe(true)
    expect(optionIds(s)).toEqual(['use', 'decline'])
    answerOk(ctx, 'decline')
    expect(ranged(s)).not.toContain('PRECISION')
    expect(s.players.A.oncePerBattleUsed).toEqual([])
    // not offered a second time in the same phase, offered again in the next one
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', RNG)).toBe(false)
    setPhase(s, 'shooting', 'A')
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', RNG)).toBe(true)
  })

  it('MVA-006 MVA-3.2: used, every ranged weapon of the attached unit has PRECISION this phase only, and it is never offered again', () => {
    const s = ready()
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.unitSelected', RNG)
    answerOk(ctx, 'use')
    expect(ranged(s)).toContain('PRECISION')
    expect(pistol(s)).toContain('PRECISION')
    expect(abilitiesOf(s, modelWith(s, RNG, 'adm.w.close-combat-weapon'), 'adm.w.close-combat-weapon', BOYZ)).not.toContain('PRECISION')
    expect(s.players.A.oncePerBattleUsed).toContain(SURGE_ABILITY)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(ranged(s)).not.toContain('PRECISION')
    setPhase(s, 'shooting', 'A')
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', RNG)).toBe(false)
  })

  it('MVA-006 MVA-3.2: not offered with the default Data-Tether, for another unit, or in the opponent\'s Shooting phase', () => {
    const t = makeState()
    placeUnit(t, RNG, [[0, 0]]); placeUnit(t, VER, [[0, 0]])
    expect(hookService.offerPicks(ctxOf(t).ctx, 'shooting.unitSelected', RNG)).toBe(false)
    const s = ready()
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', KAT)).toBe(false)
    setPhase(s, 'shooting', 'B')
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', RNG)).toBe(false)
  })

  it('MVA-006 MVA-3.2: with Precision a wound against an attached enemy unit lets the attacker pick its CHARACTER', () => {
    const s = makeState({ a: { enhancementId: SURGE }, mirror: true, b: { attachments: [{ leaderRef: 'verask', bodyguardRef: 'rangers' }] } })
    placeUnit(s, RNG, [[0, 0]]); placeUnit(s, VER, [[0, 0]]); placeUnit(s, 'B:rangers', [[0, 10]]); placeUnit(s, 'B:verask', [[0, 10]])
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.unitSelected', RNG)
    answerOk(ctx, 'use')
    const rifle = modelWith(s, RNG, GALV)
    let precisionSeen = false
    const log = runAttack(s, [6, 6, 6, 6], 'ranged', RNG, [tgt(rifle, GALV, 'B:rangers')], (p) => {
      if (p.kind === 'allocateAttack' && p.context.precision) {
        precisionSeen = true
        expect(p.context.eligibleModels).toContain(s.units['B:verask'].models[0])
      }
      return null
    })
    expect(log.events.length).toBeGreaterThan(0)
    expect(precisionSeen).toBe(true)
  })

  it('MVA-006 MVA-3.2a: also offered when the bearer\'s unit is selected to fire Overwatch, Precision lasting until the end of that phase', () => {
    const s = ready()
    setPhase(s, 'movement', 'B')
    const { ctx } = ctxOf(s)
    const rifle = modelWith(s, RNG, GALV)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: RNG, overwatch: true, targets: [tgt(rifle, GALV, BOYZ)] })
    expect(surgeOverwatchStep(ctx)).toBe('pending')
    expect(optionIds(s)).toEqual(['use', 'decline'])
    answerOk(ctx, 'use')
    expect(surgeOverwatchStep(ctx)).toBe('done')
    expect(ranged(s)).toContain('PRECISION')
    expect(s.players.A.oncePerBattleUsed).toContain(SURGE_ABILITY)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(ranged(s)).not.toContain('PRECISION')
  })

  it('MVA-006 MVA-3.2a: a non-Overwatch attack never opens the Overwatch step', () => {
    const s = ready()
    const { ctx } = ctxOf(s)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: RNG, overwatch: false, targets: [tgt(modelWith(s, RNG, GALV), GALV, BOYZ)] })
    expect(surgeOverwatchStep(ctx)).toBe('done')
    expect(s.pending).toBeNull()
  })
})

// =====================================================================================================================
describe('secondary objectives (MVA-4)', () => {
  const vpOf = (s: GameState, key: string): number => Object.entries(s.players.A.vpBySource).filter(([k]) => k.includes(key)).reduce((n, [, v]) => n + v, 0)
  const control = (s: GameState, n: number, by: PlayerId | null = 'A'): void => {
    Object.values(s.objectives).forEach((o, i) => { o.controller = i < n ? by : null })
  }
  const commandEnd = (s: GameState, dice: number[]): GameEvent[] => {
    setPhase(s, 'command', s.activePlayer)
    const { ctx, events } = ctxOf(s, dice, false)
    missionService.onWindow(ctx, 'command.end', 'k')
    return events
  }

  it('MVA-007 MVA-4.1: round 1 rolls nothing; round 2 with 2 markers, die 5 -> 4 VP; die 4 -> 0', () => {
    const r1 = makeState({ round: 1, phase: 'command' })
    control(r1, 2)
    expect(eventsOf(commandEnd(r1, [6]), 'DiceRolled')).toHaveLength(0)
    expect(vpOf(r1, 'explorator')).toBe(0)

    const win = makeState({ round: 2, phase: 'command' })
    control(win, 2)
    commandEnd(win, [5])
    expect(vpOf(win, 'explorator')).toBe(4)

    const lose = makeState({ round: 2, phase: 'command' })
    control(lose, 2)
    commandEnd(lose, [4])
    expect(vpOf(lose, 'explorator')).toBe(0)
  })

  it('MVA-007 MVA-4.1: no roll at the end of the opponent\'s Command phase; removed markers do not count', () => {
    const opp = makeState({ round: 2, phase: 'command', active: 'B' })
    control(opp, 2)
    expect(eventsOf(commandEnd(opp, [6]), 'DiceRolled')).toHaveLength(0)
    expect(vpOf(opp, 'explorator')).toBe(0)

    const gone = makeState({ round: 2, phase: 'command' })
    control(gone, 2)
    Object.values(gone.objectives).filter((o) => o.controller === 'A').forEach((o) => { o.removed = true })
    commandEnd(gone, [5]) // 5 + 0 markers = 5: below 7
    expect(vpOf(gone, 'explorator')).toBe(0)
  })

  it('MVA-007 MVA-4.1: a total of exactly 7 scores, 12 VP is the cap and no die is rolled once it is reached', () => {
    const s = makeState({ round: 2, phase: 'command' })
    control(s, 3)
    commandEnd(s, [4]) // 4 + 3 = 7
    expect(vpOf(s, 'explorator')).toBe(4)
    for (const r of [3, 4]) { s.round = r; commandEnd(s, [6]) }
    expect(vpOf(s, 'explorator')).toBe(12)
    s.round = 5
    expect(eventsOf(commandEnd(s, [6]), 'DiceRolled')).toHaveLength(0)
    expect(vpOf(s, 'explorator')).toBe(12)
  })

  describe('Holy Apparatus', () => {
    const battleEnd = (s: GameState): number => {
      s.round = 5; s.phase = 'fight'; s.phaseState = emptyPhaseState()
      const before = vpOf(s, 'holy-apparatus')
      missionService.onWindow(ctxOf(s, [], false).ctx, 'battle.end', 'b')
      return vpOf(s, 'holy-apparatus') - before
    }
    const state = (): GameState => {
      const s = makeState({ round: 5, a: { secondaryId: 'adm.sec.holy-apparatus' } })
      for (const id of [RNG, VER, KAT, DUNE]) placeUnit(s, id, [[0, 0]])
      return s
    }
    const crawlerModel = (s: GameState): string => s.units[DUNE].models[0]
    const kill = (s: GameState, unitId: string): void => { killUnit(s, ctxOf(s, TAIL).ctx, unitId, byEnemy(BOYZ)) }

    it('MVA-008 MVA-4.2: Verask alive + Dunecrawler at 11 W -> 8; at 5 W -> 6; at 6 W -> 8', () => {
      const full = state()
      expect(battleEnd(full)).toBe(8)
      const hurt = state()
      hurt.models[crawlerModel(hurt)].woundsRemaining = 5
      expect(battleEnd(hurt)).toBe(6)
      const edge = state()
      edge.models[crawlerModel(edge)].woundsRemaining = 6
      expect(battleEnd(edge)).toBe(8)
    })

    it('MVA-008 MVA-4.2: Verask destroyed -> 4; Dunecrawler destroyed -> 4; both -> 0', () => {
      const a = state(); kill(a, VER)
      expect(battleEnd(a)).toBe(4)
      const b = state(); kill(b, DUNE)
      expect(battleEnd(b)).toBe(4)
      const c = state(); kill(c, VER); kill(c, DUNE)
      expect(battleEnd(c)).toBe(0)
    })

    it('MVA-008 MVA-4.2a: Verask alive after the Rangers are wiped still scores the WARLORD points; a Dunecrawler in Reserves counts as destroyed', () => {
      const s = state()
      kill(s, RNG)
      expect(s.units[VER].location).toBe('board')
      expect(battleEnd(s)).toBe(8)
      const r = state()
      r.units[DUNE].location = 'reserves'
      expect(battleEnd(r)).toBe(4)
    })

    it('MVA-008 MVA-4.2: nothing is scored before the battle ends', () => {
      const s = state()
      for (const w of ['round.start', 'turn.end', 'command.end'] as const) missionService.onWindow(ctxOf(s, [6, 6], false).ctx, w, 'k')
      expect(vpOf(s, 'holy-apparatus')).toBe(0)
    })

    it('MVA-009 MVA-4.2b: mvaHolyApparatus never opens a pick; the Leagues of Votann codes are separate hooks', () => {
      const s = makeState({ round: 1, phase: 'command', a: { secondaryId: 'adm.sec.holy-apparatus' } })
      missionService.onWindow(ctxOf(s, [], false).ctx, 'round.start', 'r1')
      expect(s.pending).toBeNull()
      expect(codeHooks.mvaHolyApparatus).toBeTruthy()
      for (const k of ['holyApparatusPick', 'holyApparatusScore']) expect(codeHooks[k], k).toBeTruthy()
      expect(codeHooks.mvaHolyApparatus).not.toBe(codeHooks.holyApparatusScore)
    })
  })
})

// =====================================================================================================================
describe('Retribution Codes (MVA-5.1)', () => {
  const ready = (a: Partial<PlayerSetup> = {}): GameState => {
    const s = makeState({ phase: 'shooting', active: 'B', a })
    placeUnit(s, RNG, [[-12, 0]]); placeUnit(s, VER, [[-12, 0]]); placeUnit(s, KAT, [[-12, 6]]); placeUnit(s, DUNE, [[-12, -8]])
    placeUnit(s, BOYZ, [[12, 0]]); placeUnit(s, BOSS, [[12, 6]])
    s.players.A.cp = 3
    return s
  }
  const hitRerolls = (s: GameState, ctx: EngineContext, model: string, weapon: string, target: string): string[] =>
    hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, model, weapon, target), roll: rollOf(1, 'hit') })
      .map((r) => r.result as { kind: string; reroll?: string }).filter((r) => r.kind === 'roll' && r.reroll !== undefined).map((r) => r.reroll as string)

  it('MVA-010 MVA-5.1: Verask killed by an enemy attack -> offered; used (1 CP) -> AdMech hit rolls of 1 against the killer are re-rolled, ranged and melee, later rounds too', () => {
    const s = ready({ attachments: [] })
    const h = stratHarness(s)
    killUnit(s, h.ctx, VER, byEnemy(BOYZ))
    expect(s.units[VER].location).toBe('destroyed')
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', RETRIB, { unitId: VER })).toEqual([[VER]])
    stratagemService.openWindow?.(h.ctx, 'attack.modelDestroyed', 'A', 'k', { unitId: VER })
    expect(h.use(RETRIB, VER)).toBeNull()
    expect(s.players.A.cp).toBe(2)
    const ccw = 'adm.w.close-combat-weapon'
    expect(hitRerolls(s, h.ctx, modelWith(s, RNG, GALV), GALV, BOYZ)).toEqual(['ones'])
    expect(hitRerolls(s, h.ctx, modelWith(s, RNG, ccw), ccw, BOYZ)).toEqual(['ones'])
    expect(hitRerolls(s, h.ctx, modelWith(s, DUNE, ICARUS), ICARUS, BOYZ)).toEqual(['ones'])
    expect(hitRerolls(s, h.ctx, modelWith(s, RNG, GALV), GALV, BOSS)).toEqual([])
    expect(s.units[VER].effects).toHaveLength(0) // granted to the killer's unit, not to the destroyed one
    s.round = 4; setPhase(s, 'fight', 'A')
    expect(hitRerolls(s, h.ctx, modelWith(s, RNG, GALV), GALV, BOYZ)).toEqual(['ones'])
  })

  it('MVA-010 MVA-5.1: a Ranger dying is not offered; neither is Verask destroyed by something that is not an attack', () => {
    const s = ready()
    const { ctx } = ctxOf(s)
    attackService.destroyModel(ctx, s.units[RNG].models[1], byEnemy(BOYZ))
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', RETRIB, { unitId: RNG })).toEqual([])
    const t = ready({ attachments: [] })
    const c2 = ctxOf(t)
    for (const m of [...t.units[VER].models]) attackService.destroyModel(c2.ctx, m, { player: 'A', unitId: VER, modelId: `${VER}#0`, kind: 'other' })
    expect(t.units[VER].location).toBe('destroyed')
    expect(offeredIds(t, 'A', 'attack.modelDestroyed', RETRIB, { unitId: VER })).toEqual([])
    const u = ready({ attachments: [] })
    const c3 = ctxOf(u)
    for (const m of [...u.units[VER].models]) attackService.destroyModel(c3.ctx, m, { player: 'B', unitId: BOYZ, modelId: null, kind: 'mortal' } as never)
    expect(offeredIds(u, 'A', 'attack.modelDestroyed', RETRIB, { unitId: VER })).toEqual([])
  })

  it('MVA-010 MVA-5.1: Verask already destroyed, then the last Ranger killed by an enemy attack -> not offered (the dead model must itself be a TECH-PRIEST)', () => {
    const s = ready()
    const { ctx } = ctxOf(s)
    for (const m of [...s.units[VER].models]) attackService.destroyModel(ctx, m, byEnemy(BOYZ))
    expect(s.units[VER].location).toBe('destroyed')
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('deathReaction:')) // Verask's own reaction window has passed
    for (const m of [...s.units[RNG].models]) attackService.destroyModel(ctx, m, byEnemy(BOYZ))
    expect(s.units[RNG].location).toBe('destroyed')
    expect(offeredIds(s, 'A', 'attack.modelDestroyed', RETRIB, { unitId: RNG })).toEqual([])
  })
})

// =====================================================================================================================
describe('Reactive Field-Shroud (MVA-5.2)', () => {
  const ready = (a: Partial<PlayerSetup> = {}): GameState => {
    const s = makeState({ a })
    placeUnit(s, RNG, [[0, 0]]); placeUnit(s, VER, [[0, 0]]); placeUnit(s, KAT, [[8, 0]]); placeUnit(s, DUNE, [[-8, 0]]); placeUnit(s, BOYZ, [[0, 10]])
    setPhase(s, 'shooting', 'B', { A: 2 })
    return s
  }
  const trig = (target: string) => ({ unitId: BOYZ, targetUnitId: target })

  it('MVA-011 MVA-5.2: offered when the opponent shoots the Rangers (with or without Verask) or the Dunecrawler, never the Kataphrons', () => {
    const s = ready()
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SHROUD, trig(RNG)).flat().length).toBeGreaterThan(0)
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SHROUD, trig(DUNE)).flat()).toContain(DUNE)
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SHROUD, trig(KAT))).toEqual([])
    const alone = ready({ attachments: [] })
    expect(offeredIds(alone, 'A', 'shooting.targetsDeclared', SHROUD, trig(VER)).flat()).toContain(VER)
    expect(offeredIds(alone, 'A', 'shooting.targetsDeclared', SHROUD, trig(RNG)).flat()).toContain(RNG)
  })

  it('MVA-011 MVA-5.2: not offered in the AdMech player\'s own Shooting phase; offered in the Fight phase of either turn', () => {
    const s = ready()
    setPhase(s, 'shooting', 'A', { A: 2 })
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', SHROUD, trig(RNG))).toEqual([])
    for (const active of ['A', 'B'] as const) {
      setPhase(s, 'fight', active, { A: 2 })
      expect(offeredIds(s, 'A', 'fight.targetsDeclared', SHROUD, trig(RNG)).flat().length).toBeGreaterThan(0)
    }
  })

  it('MVA-011 MVA-5.2: used, an AP -3 shot at the Rangers is saved on a 4 (4+ invulnerable) this phase, and not the next', () => {
    const run = (shroud: boolean, phase: 'now' | 'next'): number => {
      const s = ready({ attachments: [] })
      const h = stratHarness(s)
      if (shroud) {
        h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig(RNG))
        expect(h.use(SHROUD, RNG)).toBeNull()
        expect(s.players.A.cp).toBe(1)
        if (phase === 'next') effectService.expire(h.ctx, 'phaseEnd', null)
      }
      const { model, weapon } = orkWeapon(s, { S: 8, AP: -3 })
      const log = runAttack(s, [6, 6, 4], 'ranged', BOYZ, [tgt(model, weapon, RNG, 1)])
      return eventsOf(log.events, 'ModelDestroyed').length
    }
    expect(run(false, 'now')).toBe(1)
    expect(run(true, 'now')).toBe(0)
    expect(run(true, 'next')).toBe(1)
  })
})

// =====================================================================================================================
describe('Retrogradial Targeting (MVA-5.3)', () => {
  const ready = (a: Partial<PlayerSetup> = {}): GameState => {
    const s = makeState({ a })
    placeUnit(s, VER, [[0, 0]]); placeUnit(s, RNG, [[-15, 0]]); placeUnit(s, KAT, [[15, 0]]); placeUnit(s, DUNE, [[-8, -8]])
    placeUnit(s, BOYZ, [[0, 7]])
    setPhase(s, 'movement', 'A', { A: 3 })
    return s
  }
  const offered = (s: GameState, unitId: string): string[] => offeredIds(s, 'A', 'movement.unitMoved', RETRO, { unitId }).flat()
  const fell = (s: GameState, ids: string[], moveType: 'fallBack' | 'normal' = 'fallBack'): void => { for (const id of ids) s.units[id].turn.moveType = moveType }

  it('MVA-012 MVA-5.3: costs 2 CP; Verask alone, or leading the Rangers, is offered after a Fall Back, not after a Normal move', () => {
    expect(offered(ready(), VER)).toEqual([]) // no Fall Back this turn -> nothing offered
    expect(ready().stratagems[RETRO].cost).toBe(2)
    const alone = ready({ attachments: [] })
    fell(alone, [VER])
    expect(offered(alone, VER)).toEqual([VER])
    const joined = ready()
    fell(joined, [VER, RNG])
    expect(offered(joined, VER).length).toBe(1)
    const normal = ready()
    fell(normal, [VER, RNG], 'normal')
    expect(offered(normal, VER)).toEqual([])
  })

  it('MVA-012 MVA-5.3: the Kataphrons and the Dunecrawler are never offered it', () => {
    const s = ready()
    fell(s, [KAT, DUNE])
    expect(offered(s, KAT)).toEqual([])
    expect(offered(s, DUNE)).toEqual([])
  })

  it('MVA-012 MVA-5.3: used, the unit may shoot although it Fell Back but still cannot charge; the 2 CP are paid', () => {
    const s = ready({ attachments: [] })
    fell(s, [VER])
    const { ctx } = ctxOf(s)
    s.phase = 'shooting'
    expect(unitEligibleToShoot(ctx, VER)).toBe(false)
    s.phase = 'movement'
    const action = stratagemService.options(s, 'A', 'movement.unitMoved', { unitId: VER }).find((x) => x.stratagemId === RETRO)! as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'movement.unitMoved', canPass: true, context: { trigger: { unitId: VER } }, options: [] } as unknown as PendingDecision
    expect(stratagemService.validate!(s, { ...action, decisionId: 'd:1' }, pending)).toBeNull()
    expect(stratagemService.handle(ctx, { ...action, decisionId: 'd:1' }, pending)).toBeUndefined()
    expect(s.players.A.cp).toBe(1)
    s.phase = 'shooting'
    expect(unitEligibleToShoot(ctx, VER)).toBe(true)
    expect(hookService.eligibilityFor(s, VER, 'charge')).toBe(false)
  })
})

// =====================================================================================================================
describe('Enginseer (MVA-6.1)', () => {
  // Verask unattached, the Dunecrawler `gap` inches (edge to edge) away
  const ready = (gap: number, a: Partial<PlayerSetup> = { attachments: [] }): GameState => {
    const s = makeState({ a })
    placeUnit(s, VER, [[0, 0]])
    const r = s.models[s.units[VER].models[0]].base.radius + s.models[s.units[DUNE].models[0]].base.radius
    placeUnit(s, DUNE, [[r + gap, 0]])
    placeUnit(s, RNG, [[-10, 0]]); placeUnit(s, KAT, [[0, -10]]); placeUnit(s, BOYZ, [[0, 30]])
    return s
  }
  const lone = (s: GameState): boolean => hookService.hasCoreAbility(s, VER, 'LONE_OPERATIVE')

  it('MVA-013 MVA-6.1: unattached and within 3" of the Dunecrawler he has Lone Operative; 3.5" away he does not', () => {
    expect(lone(ready(2.5))).toBe(true)
    expect(lone(ready(3.5))).toBe(false)
  })

  it('MVA-013 MVA-6.1: leading the Rangers he is never a Lone Operative', () => {
    const s = ready(2.5, {})
    expect(leaderService.isAttached(s, VER)).toBe(true)
    expect(lone(s)).toBe(false)
  })

  it('MVA-013 MVA-6.1: only an ADEPTUS MECHANICUS VEHICLE counts (the Kataphrons are not VEHICLEs; an enemy VEHICLE does not count)', () => {
    const s = ready(8)
    placeUnit(s, KAT, [[0, 1.5]])
    expect(lone(s)).toBe(false)
    placeUnit(s, 'B:deff-dread', [[0, -1.5]])
    expect(lone(s)).toBe(false)
  })

  it('MVA-013 MVA-6.1: a ranged attack on him from 13" is illegal and from 11.5" legal while he is a Lone Operative; from 24" it is legal otherwise', () => {
    const rangedFrom = (s: GameState, gap: number): boolean => {
      const model = s.units[BOYZ].models[0]
      const w = Object.values(s.weapons).find((x) => s.models[model].weapons.includes(x.id) && x.kind === 'ranged')!
      const r = s.models[s.units[VER].models[0]].base.radius + s.models[model].base.radius
      placeUnit(s, BOYZ, [[0, r + gap]])
      return targetLegality(s, BOYZ, model, { ...w, range: 36 }, VER) === null
    }
    const near = ready(2.5)
    expect(rangedFrom(near, 13)).toBe(false)
    expect(rangedFrom(near, 11.5)).toBe(true)
    const far = ready(3.5)
    expect(rangedFrom(far, 24)).toBe(true)
  })
})

// =====================================================================================================================
describe("Omnissiah's Blessing (MVA-6.2)", () => {
  const ready = (a: Partial<PlayerSetup> = {}): GameState => {
    const s = makeState({ a, phase: 'command' })
    placeUnit(s, VER, [[0, 0]]); placeUnit(s, RNG, [[0, 0]]); placeUnit(s, KAT, [[0, -12]])
    const r = s.models[s.units[VER].models[0]].base.radius + s.models[s.units[DUNE].models[0]].base.radius
    placeUnit(s, DUNE, [[r + 1, 0]])
    placeUnit(s, BOYZ, [[0, 30]])
    setPhase(s, 'command', 'A')
    return s
  }
  const crawler = (s: GameState): string => s.units[DUNE].models[0]
  const offer = (s: GameState, dice: number[] = []) => {
    const c = ctxOf(s, dice)
    return { ...c, offered: hookService.offerPicks(c.ctx, 'command.start', 'k') }
  }

  it('MVA-014 MVA-6.2: the wounded Dunecrawler within 3" is offered (Verask, unwounded, is not); D3 = 2 heals it to 6 W and the Damaged -1 is gone', () => {
    const s = ready()
    s.models[crawler(s)].woundsRemaining = 4
    const { ctx, offered, events } = offer(s, [3])
    expect(offered).toBe(true)
    expect(optionIds(s)).toEqual([crawler(s), 'decline'])
    answerOk(ctx, crawler(s))
    expect(s.models[crawler(s)].woundsRemaining).toBe(6)
    expect(eventsOf(events, 'WoundsRegained')[0]).toMatchObject({ modelId: crawler(s), amount: 2 })
    // 6 W: above the Damaged threshold of 4
    const hits = hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, modelWith(s, DUNE, ICARUS), ICARUS, BOYZ), roll: rollOf(4, 'hit') })
      .map((r) => r.result).filter((r) => r.kind === 'roll' && (r as { modifier?: number }).modifier !== undefined)
    expect(hits).toEqual([])
  })

  it('MVA-014 MVA-6.2: never above W; Verask may pick himself; a wounded model 3.5" away and unwounded models are not listed', () => {
    const s = ready()
    s.models[crawler(s)].woundsRemaining = 10
    const v = s.units[VER].models[0]
    s.models[v].woundsRemaining = 1
    const { ctx } = offer(s, [6])
    expect(optionIds(s).sort()).toEqual([crawler(s), 'decline', v].sort())
    answerOk(ctx, crawler(s))
    expect(s.models[crawler(s)].woundsRemaining).toBe(11)

    const far = ready()
    far.models[far.units[KAT].models[0]].woundsRemaining = 1
    const kataphron = far.units[KAT].models[0]
    expect(far.models[kataphron].woundsRemaining).toBe(1)
    expect(offer(far).offered).toBe(false)
  })

  it('MVA-014 MVA-6.2: decline is allowed and spends nothing; a model is blessed once per Command phase; not offered in the opponent\'s Command phase', () => {
    const s = ready()
    s.models[crawler(s)].woundsRemaining = 4
    const { ctx } = offer(s)
    answerOk(ctx, 'decline')
    expect(s.models[crawler(s)].woundsRemaining).toBe(4)
    expect(hookService.offerPicks(ctx, 'command.start', 'k')).toBe(false) // one offer per phase

    const t = ready()
    t.models[crawler(t)].woundsRemaining = 4
    setPhase(t, 'command', 'B')
    expect(offer(t).offered).toBe(false)
  })

  it('MVA-014 MVA-6.2: answering the offer with a pass action (the reducer lists pass as legal) declines it instead of rejecting', () => {
    const s = ready()
    s.models[crawler(s)].woundsRemaining = 4
    const { ctx } = offer(s)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.canPass).toBe(true)
    s.pending = null
    const rej = hookService.handler.handle(ctx, { type: 'pass', player: pending.player, decisionId: pending.id }, pending as PendingDecision)
    expect(rej).toBeUndefined()
    expect(s.models[crawler(s)].woundsRemaining).toBe(4)
    expect(hookService.offerPicks(ctx, 'command.start', 'k')).toBe(false)
  })

  it('MVA-014 MVA-6.2: destroyed Rangers never return - only wounds are restored, a unit with no wounded model is not offered', () => {
    const s = ready()
    const before = s.units[RNG].models.length
    attackService.destroyModel(ctxOf(s).ctx, s.units[RNG].models[2], byEnemy(BOYZ))
    expect(offer(s).offered).toBe(false)
    expect(s.units[RNG].models.length).toBe(before - 1)
  })
})

// =====================================================================================================================
describe('Rangers: Scouts (MVA-6.3, 1.1)', () => {
  const advance = (s: GameState): PendingDecision | null => {
    s.phase = 'deployment'; s.step = 'preBattle'; s.firstPlayer = 'A'; s.phaseState = emptyPhaseState()
    for (const u of Object.values(s.units)) { u.location = 'board' }
    const { ctx } = ctxOf(s, [], false)
    DEFAULT_MODULES.phases.deployment.advance(ctx)
    return ctx.state.pending
  }

  it('MVA-015 MVA-6.3: unattached Rangers get a Scouts move of up to 6"', () => {
    const s = makeState({ a: { attachments: [] } })
    const p = advance(s) as (PendingDecision & { context: { unitId: string }; constraints: { maxDistance?: number } }) | null
    expect(p?.kind).toBe('moveUnit')
    expect(p?.context.unitId).toBe(RNG)
    expect(JSON.stringify(p?.constraints)).toContain('6')
  })

  it('MVA-015 MVA-1.1: Rangers led by Verask get no Scouts move', () => {
    const s = makeState()
    expect(advance(s)).toBeNull()
  })
})

// =====================================================================================================================
describe('Dunecrawler, Kataphron and Verask weapons (MVA-6.4-6.6)', () => {
  const hitCount = (log: AttackLog): number => eventsOf(log.events, 'HitRolled').length
  const ready = (): GameState => {
    const s = makeState()
    for (const id of [RNG, VER, KAT, DUNE]) placeUnit(s, id, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 10]])
    return s
  }

  it('MVA-016 MVA-6.4/6.5: Damaged at 4 W (-1 to hit) and not at 5 W; Deadly Demise D3 is on the datasheet', () => {
    const s = ready()
    const ds = s.datasheets[s.units[DUNE].datasheetId]
    expect(ds.coreAbilities).toContainEqual({ ability: 'DEADLY_DEMISE', value: 'D3' })
    expect(ds.damaged?.threshold).toBe(4)
  })

  it('MVA-016 MVA-6: Icarus array is Twin-linked and Anti-Fly 4+, Daedalus launcher Anti-Fly 2+ with D6+1 damage', () => {
    const s = ready()
    const m = modelWith(s, DUNE, ICARUS)
    expect(abilitiesOf(s, m, ICARUS)).toEqual(expect.arrayContaining(['TWIN_LINKED', 'ANTI']))
    expect(s.weapons[ICARUS].abilities.find((a) => a.ability === 'ANTI')).toMatchObject({ keyword: 'FLY', value: 4 })
    const dae = 'adm.w.daedalus-missile-launcher'
    expect(s.weapons[dae].abilities.find((a) => a.ability === 'ANTI')).toMatchObject({ keyword: 'FLY', value: 2 })
    expect(s.weapons[dae].D).toBe('D6+1')
  })

  it('MVA-016 MVA-6: the cognis heavy stubber fires 6 attacks within 18" (Rapid Fire 3) and 3 beyond', () => {
    const near = ready()
    const stub = 'adm.w.cognis-heavy-stubber'
    const m = modelWith(near, DUNE, stub)
    expect(hitCount(runAttack(near, [1, 1, 1, 1, 1, 1], 'ranged', DUNE, [tgt(m, stub, BOYZ)]))).toBe(6)
    const far = ready()
    placeUnit(far, BOYZ, [[0, 25]])
    expect(hitCount(runAttack(far, [1, 1, 1], 'ranged', DUNE, [tgt(modelWith(far, DUNE, stub), stub, BOYZ)]))).toBe(3)
  })

  it('MVA-017 MVA-6: heavy grav-cannon Anti-Vehicle 2+; the supercharge culverin is Hazardous and the standard profile is not', () => {
    const s = ready()
    expect(s.weapons['adm.w.heavy-grav-cannon'].abilities.find((a) => a.ability === 'ANTI')).toMatchObject({ keyword: 'VEHICLE', value: 2 })
    const m = modelWith(s, KAT, CULV_SUP)
    expect(abilitiesOf(s, m, CULV_SUP)).toContain('HAZARDOUS')
    expect(abilitiesOf(s, modelWith(s, KAT, CULV_STD), CULV_STD)).not.toContain('HAZARDOUS')
    // a Hazardous test of 1 destroys the Kataphron (it is neither a CHARACTER nor a VEHICLE)
    const hz = eventsOf(runAttack(s, [2, 1], 'ranged', KAT, [tgt(m, CULV_SUP, BOYZ, 1)]).events, 'HazardousTested')
    expect(hz).toHaveLength(1)
    const std = ready()
    expect(eventsOf(runAttack(std, [2, 1], 'ranged', KAT, [tgt(modelWith(std, KAT, CULV_STD), CULV_STD, BOYZ, 1)]).events, 'HazardousTested')).toHaveLength(0)
  })

  it('MVA-017 MVA-6: the cognis flamer is a Torrent with Ignores Cover; the phosphor blaster fires 2 shots within 12"', () => {
    const s = ready()
    const flamer = 'adm.w.cognis-flamer', blaster = 'adm.w.phosphor-blaster'
    expect(abilitiesOf(s, modelWith(s, KAT, flamer), flamer)).toEqual(expect.arrayContaining(['TORRENT', 'IGNORES_COVER']))
    placeUnit(s, BOYZ, [[0, 6]])
    expect(hitCount(runAttack(s, [1, 1], 'ranged', KAT, [tgt(modelWith(s, KAT, blaster), blaster, BOYZ)]))).toBe(2)
  })

  it('MVA-018 MVA-6: Verask\'s pistol hits on 3+; the servo-arm is Extra Attacks beside the Omnissian axe; the arquebus is Heavy + Precision; the galvanic rifle has 2 attacks at 30"', () => {
    const s = ready()
    expect(s.weapons[PISTOL_V].skill).toBe(3)
    expect(s.weapons['adm.w.mechanicus-pistol'].skill).toBe(4)
    const v = s.units[VER].models[0]
    expect(abilitiesOf(s, v, 'adm.w.servo-arm')).toContain('EXTRA_ATTACKS')
    expect(abilitiesOf(s, v, 'adm.w.omnissian-axe')).not.toContain('EXTRA_ATTACKS')
    expect(abilitiesOf(s, modelWith(s, RNG, ARQ), ARQ)).toEqual(expect.arrayContaining(['HEAVY', 'PRECISION']))
    expect(s.weapons[GALV]).toMatchObject({ range: 30, A: 2 })
  })

  it('MVA-018 MVA-6: the arc rifle (Rapid Fire 1) makes 2 shots within 15" and 1 beyond', () => {
    const arc = 'adm.w.arc-rifle'
    const near = ready()
    placeUnit(near, BOYZ, [[0, 8]])
    expect(hitCount(runAttack(near, [1, 1], 'ranged', RNG, [tgt(modelWith(near, RNG, arc), arc, BOYZ)]))).toBe(2)
    const far = ready()
    placeUnit(far, BOYZ, [[0, 20]])
    expect(hitCount(runAttack(far, [1], 'ranged', RNG, [tgt(modelWith(far, RNG, arc), arc, BOYZ)]))).toBe(1)
  })
})

// =====================================================================================================================
describe('AI (MVA-019)', () => {
  const decide = async (s: GameState, player: PlayerId): Promise<string> => {
    const pending = s.pending as ChooseOptionDecision
    const legal = pending.options.map((o) => ({ ...o.action, decisionId: pending.id }))
    const a = await new UtilityDecider('normal', 'mva').decide(view(s, player), pending, legal)
    return (a as { optionId: string }).optionId
  }
  const window = (w: string, trigger: Record<string, unknown>) =>
    ({ id: 'd', player: 'A', window: w, canPass: true, kind: 'stratagemWindow', context: { trigger, usable: [] }, options: [] }) as unknown as PendingDecision

  it('MVA-019 MVA-6.2: the Blessing AI picks the most-wounded candidate', async () => {
    const s = makeState({ phase: 'command' })
    placeUnit(s, VER, [[0, 0]]); placeUnit(s, RNG, [[0, 0]]); placeUnit(s, KAT, [[0, -12]]); placeUnit(s, BOYZ, [[0, 30]])
    const r = s.models[s.units[VER].models[0]].base.radius + s.models[s.units[DUNE].models[0]].base.radius
    placeUnit(s, DUNE, [[r + 1, 0]])
    setPhase(s, 'command', 'A')
    const crawler = s.units[DUNE].models[0]
    s.models[crawler].woundsRemaining = 3
    s.models[s.units[VER].models[0]].woundsRemaining = 2
    hookService.offerPicks(ctxOf(s).ctx, 'command.start', 'k')
    expect(await decide(s, 'A')).toBe(crawler)
  })

  it('MVA-019 MVA-3.2: the Surge-wafer AI uses it with an attached enemy CHARACTER in range or in round 5, else declines', async () => {
    const mk = (round: number, attachedEnemy: boolean): GameState => {
      const s = makeState({ a: { enhancementId: SURGE }, mirror: true, round, b: { attachments: attachedEnemy ? [{ leaderRef: 'verask', bodyguardRef: 'rangers' }] : [] } })
      placeUnit(s, RNG, [[0, 0]]); placeUnit(s, VER, [[0, 0]])
      placeUnit(s, 'B:rangers', [[0, 15]]); placeUnit(s, 'B:verask', [[0, 15]])
      if (!attachedEnemy) placeUnit(s, 'B:verask', [[0, 60]])
      hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', RNG)
      return s
    }
    expect(await decide(mk(2, true), 'A')).toBe('use')
    expect(await decide(mk(2, false), 'A')).toBe('decline')
    expect(await decide(mk(5, false), 'A')).toBe('use')
  })

  it('MVA-019 MVA-5.1/5.2/5.3: the bot spends CP on Retribution Codes, Reactive Field-Shroud and Retrogradial Targeting when they pay off', () => {
    const s = makeState({ phase: 'shooting', active: 'B', a: { attachments: [] } })
    placeUnit(s, RNG, [[-8, 0]]); placeUnit(s, VER, [[-12, 0]]); placeUnit(s, KAT, [[-12, 6]]); placeUnit(s, DUNE, [[-12, -8]]); placeUnit(s, BOYZ, [[0, 0]])
    s.players.A.cp = 4
    const use = (id: string, unitId: string): UseStratagemAction => ({ type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: id, targets: { unitIds: [unitId] } })
    s.phaseState.marks.push(`deathReaction:${JSON.stringify({ modelId: `${VER}#0`, unitId: VER, player: 'A', attackerUnitId: BOYZ })}`)
    expect(stratagemScore(s, 'A', window('attack.modelDestroyed', { unitId: VER }), use(RETRIB, VER), 1)).toBeGreaterThan(HOLD_CP_SCORE)
    orkWeapon(s, { S: 8, AP: -3, A: 6 }) // heavy AP so cover cannot matter
    expect(stratagemScore(s, 'A', window('shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: RNG }), use(SHROUD, RNG), 1)).toBeGreaterThan(-Infinity)

    const m = makeState({ phase: 'movement', active: 'A', a: { attachments: [] } })
    placeUnit(m, VER, [[0, 0]]); placeUnit(m, BOYZ, [[0, 14]]); placeUnit(m, RNG, [[-20, 0]])
    m.players.A.cp = 4
    m.units[VER].turn.moveType = 'fallBack'
    expect(stratagemScore(m, 'A', window('movement.unitMoved', { unitId: VER }), use(RETRO, VER), 2)).toBeGreaterThan(-Infinity)
  })

  it(`MVA-021 (Rules Commentary: Deploying Units) the Dunecrawler's 130 mm base cannot stand in cp-01's 5" strips, so it is set up touching its battlefield edge; nothing starts in Reserves`, async () => {
    const id = 'adm.cp.maniple-verask-alpha'
    // the geometry: 5.12" does not fit cp-01's narrowest zone side, but fits every other mission's
    const room = (m: string) => deploymentRoom(bundle.missions[m].deploymentZones)
    const dune = { radius: 130 / 25.4 / 2 }
    expect(baseFitsRoom(dune, room('mission.cp-01'))).toBe(false)
    for (const m of ['mission.cp-02', 'mission.cp-03', 'mission.cp-04', 'mission.cp-05', 'mission.cp-06']) expect(baseFitsRoom(dune, room(m)), m).toBe(true)
    const patrol = bundle.patrols[id]
    const pl = (name: string): PlayerSetup => ({ name, faction: patrol.faction, patrolId: id, enhancementId: patrol.enhancements.find((e) => e.default)?.id ?? patrol.enhancements[0].id,
      secondaryId: patrol.secondaries.find((x) => x.default)?.id ?? patrol.secondaries[0].id, attachments: [{ leaderRef: 'verask', bodyguardRef: 'rangers' }], reserves: [], battleReadyVp: 0 })
    const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: Object.keys(bundle.terrainLayouts ?? {}).sort()[0] ?? 'terrain.cp-01',
      players: { A: pl('A'), B: pl('B') }, sides: 'rollOff', firstTurn: 'rollOff', dataVersion: 'test' }
    const deciders = { A: new UtilityDecider('normal', 'mva21A'), B: new UtilityDecider('normal', 'mva21B') }
    let r = createGame(setup, 'mva21', bundle)
    // no workaround: neither seat's Dunecrawler is set aside in Reserves
    for (const p of ['A', 'B'] as PlayerId[]) expect(r.state.setup.players[p].reserves, p).toEqual([])
    for (const u of Object.values(r.state.units)) expect(u.location === 'reserves' && r.state.setup.players[u.player].reserves.includes(u.ref), u.id).toBe(false)

    // advance to the first deployment decision and probe it with hand-made placements
    let steps = 0
    while (r.pending && !(r.pending.kind === 'deployUnit' && r.pending.window === 'deployment.unit') && steps++ < 200) {
      r = step(r.state, await deciders[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legalActions(r.state, r.pending)))
    }
    const pending = r.pending
    if (!pending || pending.kind !== 'deployUnit') throw new Error('no deployUnit decision reached')
    const P = pending.player
    const dcId = `${P}:dunecrawler`
    expect(pending.context.unitIds).toContain(dcId)
    const dcModel = r.state.models[r.state.units[dcId].models[0]]
    const zone = pending.context.zone
    const at = snapToBattlefieldEdge({ pos: { x: 0, y: 0, z: 0 }, facing: 0, base: dcModel.base }, zone, r.state.board)
    const place = (x: number, z: number) => ({ type: 'deployUnit' as const, player: P, decisionId: pending.id, unitId: dcId, placements: [{ modelId: dcModel.id, pos: { x, y: 0, z }, facing: 0 }] })
    // a human placement touching the battlefield edge is accepted
    expect(step(r.state, place(at.x, at.z)).rejection).toBeFalsy()
    // one inch in from the edge is rejected (the base is too big for the zone and no longer touches the edge)
    const inward = Math.abs(at.x) > Math.abs(at.z) ? { x: at.x - Math.sign(at.x), z: at.z } : { x: at.x, z: at.z - Math.sign(at.z) }
    expect(step(r.state, place(inward.x, inward.z)).rejection).toBeTruthy()
    // a normal-size unit placed outside the zone is still rejected
    const other = pending.context.unitIds.find((u) => u !== dcId && !r.state.units[u].bodyguardUnitId && r.state.units[u].models.every((m) => !isOversizeForZone(r.state.models[m].base, zone)))
    if (!other) throw new Error('no normal-size unit to test')
    const outside = { type: 'deployUnit' as const, player: P, decisionId: pending.id, unitId: other, placements: r.state.units[other].models.map((m) => ({ modelId: m, pos: { x: 0, y: 0, z: 0 }, facing: 0 })) }
    expect(step(r.state, outside).rejection?.code).toBe('E_OUT_OF_RANGE')

    // the AI deploys both Dunecrawlers touching their own battlefield edge, and the game runs on past deployment
    steps = 0
    while (r.pending && r.state.phase === 'deployment' && steps++ < 400) {
      const a = await deciders[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legalActions(r.state, r.pending))
      r = step(r.state, a)
      expect(r.rejection).toBeFalsy()
    }
    expect(r.state.phase).not.toBe('deployment')
    for (const p of ['A', 'B'] as PlayerId[]) {
      const u = r.state.units[`${p}:dunecrawler`]
      expect(u.location, p).toBe('board')
      const m = r.state.models[u.models[0]]
      expect(oversizeEdgePlacementOk(m, deploymentZone(r.state, p), r.state.board), p).toBe(true)
    }
  }, 120_000)

  it('MVA-019 short sim-bot games with this patrol (odd games take the Surge-wafer and Holy Apparatus variants; the mirror included) finish without a stuck decision', () => {
    process.env.SIM_PATROL = 'adm.cp.maniple-verask-alpha'
    process.env.SIM_VARIANTS = '1'
    try {
      for (const gameIndex of [0, 1, 2, 3]) {
        const run = runGame(bundle, 'mva-test', gameIndex, 'test')
        expect(run.violations, `game ${gameIndex}`).toEqual([])
        expect(run.final.phase).toBe('ended')
      }
    } finally { delete process.env.SIM_PATROL; delete process.env.SIM_VARIANTS }
  }, 240_000)
})
