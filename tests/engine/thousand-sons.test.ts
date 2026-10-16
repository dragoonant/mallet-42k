// Thousand Sons: The Coven Temporus (docs/spec/factions/thousand-sons.md, 12-checklist THO-001..THO-031). Real Combat Patrol data.
// Covers the code-hook side: Cabal pool + Rituals, Weaver of Fates gate, Echoes cost override, Temporal Sorceries / Arch-Diabolist,
// Sorcerous Ritual / Bringer of Change, Relic Hunters, Glimpse of Eternity fixRoll, Malign Entanglement and the descriptor stratagems.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  createGame, legalActions, step, view, type Decider, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { codeHooks } from '../../src/engine/code-hooks'
import { fixRollOffers } from '../../src/engine/fix-roll'
import { cabalPoints, psykersOf } from '../../src/engine/factions/thousand-sons'
import { distance } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { phaseCostOverrides, stratagemService } from '../../src/engine/stratagems'
import { removeModel } from '../../src/engine/state'
import { placeUnit } from '../fixtures'
import { DATA_VERSION } from '../../src/data/index'
import { UtilityDecider } from '../../src/ai/utility'
import { attackService } from '../../src/engine/attack'
import { buildShootingWeaponEntries, targetLegality, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { handleReactiveMove, movementModule, validateReactiveMove } from '../../src/engine/phases/movement'
import { chargeModule } from '../../src/engine/phases/charge'
import { fightModule } from '../../src/engine/phases/fight'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const THS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Thousand Sons', faction: 'thousand-sons', patrolId: 'ths.cp.the-coven-temporus', enhancementId: 'ths.e.temporal-sorceries',
  secondaryId: 'ths.sec.sorcerous-ritual', attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const AHRAK = 'A:ahrak', SCARABS = 'A:scarabs', TZ1 = 'A:tzaangors-1', TZ2 = 'A:tzaangors-2'
const AHRAK_M = 'A:ahrak#0'
const BOYZ = 'B:boyz-a', DREAD = 'B:deff-dread'
const WARP = 'ths.s.wreathed-in-warpflame', CUNNING = 'ths.s.mutant-cunning', ENTANGLE = 'ths.s.malign-entanglement'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mirror?: boolean; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
    players: { A: THS(o.a), B: o.mirror ? THS({ name: 'Thousand Sons B', ...o.b }) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'thousand-sons', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }

function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}) {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const pendingOptions = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)

function rollOf(unmodified: number, purpose: DiceRoll['purpose'], unitId: string | null = null): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
const diceRoll = (purpose: DiceRoll['purpose'], unitId: string | null, die = 2): DiceRoll => rollOf(die, purpose, unitId).roll

// an attack by `attackerModelId` with a weapon of the given id (or any weapon of the model) against `targetUnitId`
function attackCtx(s: GameState, attackerModelId: string, targetUnitId: string, weaponId?: string, patch: Partial<AttackContext['weapon']> = {}): AttackContext {
  const m = s.models[attackerModelId]
  const wid = weaponId ? m.weapons.find((w) => w === weaponId || s.weapons[w]?.id === weaponId)! : m.weapons[0]
  const w = { ...s.weapons[wid], ...patch }
  return {
    kind: w.kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: w, targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}

function openServices(): Services {
  return {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: () => undefined, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
}
function stratHarness(s: GameState, dice: number[] = []) {
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: openServices(), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(s, new ScriptedRng(dice), modules)
  const useOption = (stratagemId: string, firstId?: string) => {
    const opts = ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((x) => x.action as UseStratagemAction)
    const opt = opts.find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    const pending = s.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    s.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { ctx, events, useOption }
}
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])

// every unit tucked into a corner away from every marker, then the ones a test cares about are moved
function parkAll(s: GameState): void {
  placeUnit(s, AHRAK, [[-20, -13]])
  placeUnit(s, SCARABS, { x: -18, z: -13, gap: 0.3 })
  placeUnit(s, TZ1, { x: 6, z: -13, gap: 0.3 })
  placeUnit(s, TZ2, { x: 10, z: -13, gap: 0.3 })
}
const sorcererId = (s: GameState): string => s.units[SCARABS].models.find((m) => s.models[m].datasheetModelId === 'sorcerer')!
const terminatorId = (s: GameState): string => s.units[SCARABS].models.find((m) => s.models[m].datasheetModelId === 'combi')!
const at = (s: GameState, id: string, x: number, z: number) => { s.models[id].pos = { x, y: 0, z } }

// ---------------------------------------------------------------------------------------------------------------------
describe('data (THO-001, THO-002)', () => {
  it('THO-001 the patrol loads: 4 units / 26 models, Ahrak is the Warlord with Temporal Sorceries, the three ths.s stratagems, no attachments', () => {
    const s = makeState()
    expect(Object.values(s.units).filter((u) => u.player === 'A').length).toBe(4)
    expect(Object.values(s.units).filter((u) => u.player === 'A').reduce((n, u) => n + u.models.length, 0)).toBe(26)
    expect(s.units[AHRAK].isWarlord).toBe(true)
    expect(s.units[AHRAK].enhancementId).toBe('ths.e.temporal-sorceries')
    expect(s.players.A.stratagemIds).toEqual(expect.arrayContaining([WARP, CUNNING, ENTANGLE]))
    expect(Object.values(s.units).some((u) => u.attachedLeaderId || u.bodyguardUnitId)).toBe(false)
  })

  it('THO-002 only the Sorcerer model has PSYKER among the Scarabs; Ahrak is a PSYKER; Screamer Invocation is Torrent with no skill', () => {
    const s = makeState()
    expect(psykersOf(s, 'A').map((p) => p.modelId).sort()).toEqual([AHRAK_M, sorcererId(s)].sort())
    const screamer = Object.values(s.weapons).filter((w) => w.id.startsWith('ths.w.screamer-invocation'))
    expect(screamer.length).toBeGreaterThanOrEqual(2)
    for (const w of screamer) {
      expect(w.skill).toBeNull()
      expect(w.abilities.some((a) => a.ability === 'TORRENT')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Cabal pool (THO-003 - THO-005)', () => {
  it('THO-003 end of own Command phase: Ahrak 2 + Sorcerer 1 + Temporal Sorceries D3 (rolled 2)', () => {
    const s = makeState(); parkAll(s); phase(s, 'command', 'A')
    const { ctx } = ctxOf(s, [4]) // D3 face 4 -> 2
    hookService.offerPicks(ctx, 'command.end', 'x')
    expect(cabalPoints(s, 'A')).toBe(5)
    // idempotent for the same occurrence
    hookService.offerPicks(ctx, 'command.end', 'x')
    expect(cabalPoints(s, 'A')).toBe(5)
  })

  it('THO-003 the opponent without the ability gets no pool; Arch-Diabolist has no D3', () => {
    const s = makeState({ a: { enhancementId: 'ths.e.arch-diabolist' } }); parkAll(s); phase(s, 'command', 'A')
    const { ctx } = ctxOf(s, []) // no dice may be rolled
    hookService.offerPicks(ctx, 'command.end', 'x')
    expect(cabalPoints(s, 'A')).toBe(3)
    expect(s.players.B.secondaryState.cabalPoints).toBeUndefined()
  })

  it('THO-004 Battle-shocked Scarabs add 0 for the Sorcerer; a dead Sorcerer adds 0; Ahrak in Reserves adds neither his 2 nor the D3', () => {
    const shocked = makeState(); parkAll(shocked); phase(shocked, 'command', 'A')
    shocked.units[SCARABS].battleShocked = true
    hookService.offerPicks(ctxOf(shocked, [6]).ctx, 'command.end', 'x')
    expect(cabalPoints(shocked, 'A')).toBe(2 + 3) // Ahrak 2 + D3 (face 6 -> 3)

    const dead = makeState(); parkAll(dead); phase(dead, 'command', 'A')
    removeModel(dead, sorcererId(dead))
    hookService.offerPicks(ctxOf(dead, [2]).ctx, 'command.end', 'x')
    expect(cabalPoints(dead, 'A')).toBe(2 + 1) // Ahrak 2 + D3 (face 2 -> 1)

    const reserves = makeState(); parkAll(reserves); phase(reserves, 'command', 'A')
    reserves.units[AHRAK].location = 'reserves'
    hookService.offerPicks(ctxOf(reserves, []).ctx, 'command.end', 'x')
    expect(cabalPoints(reserves, 'A')).toBe(1)
  })

  it('THO-005 pool left over from the opponent\'s turn is reset at the start of own Command phase, before any Ritual offer', () => {
    const s = makeState(); parkAll(s); phase(s, 'command', 'A')
    s.players.A.secondaryState.cabalPoints = 4
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'command.start', 'x')).toBe(false)
    expect(cabalPoints(s, 'A')).toBe(0)
    expect(s.pending).toBeNull()
    // unchanged during the opponent's turn
    const t = makeState(); parkAll(t); phase(t, 'movement', 'B')
    t.players.A.secondaryState.cabalPoints = 4
    hookService.offerPicks(ctxOf(t).ctx, 'movement.start', 'x')
    expect(cabalPoints(t, 'A')).toBe(4)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Rituals (THO-006, THO-007, THO-011, THO-012)', () => {
  it('THO-006 opponent\'s Shooting start with pool 2: Weaver per Psyker and done, no Echoes; pool 1: no offer', () => {
    const s = makeState(); parkAll(s); phase(s, 'shooting', 'B')
    s.players.A.secondaryState.cabalPoints = 2
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.start', 'x')).toBe(true)
    expect((s.pending as ChooseOptionDecision).player).toBe('A')
    expect(pendingOptions(s).sort()).toEqual(['done', `weaver:${AHRAK_M}`, `weaver:${sorcererId(s)}`].sort())
    const t = makeState(); parkAll(t); phase(t, 'shooting', 'B')
    t.players.A.secondaryState.cabalPoints = 1
    expect(hookService.offerPicks(ctxOf(t).ctx, 'shooting.start', 'x')).toBe(false)
  })

  it('THO-007 Weaver is paid once per phase (pool -2), not offered again that phase, offered again next phase', () => {
    const s = makeState(); parkAll(s); phase(s, 'shooting', 'B')
    s.players.A.secondaryState.cabalPoints = 4
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.start', 'x')
    answerOption(ctx, `weaver:${AHRAK_M}`)
    expect(cabalPoints(s, 'A')).toBe(2)
    expect(s.pending).toBeNull() // nothing else to buy in this phase
    expect(hookService.offerPicks(ctx, 'shooting.start', 'y')).toBe(false)
    phase(s, 'charge', 'B')
    expect(hookService.offerPicks(ctx, 'charge.start', 'x')).toBe(true)
    expect(pendingOptions(s)).toContain(`weaver:${AHRAK_M}`)
  })

  it('THO-007 a Ritual needs a PSYKER on the battlefield: Ahrak in Reserves cannot be the Weaver psyker but can be the Echoes psyker', () => {
    const s = makeState(); parkAll(s); phase(s, 'shooting', 'B')
    s.units[AHRAK].location = 'reserves'
    s.units[SCARABS].location = 'reserves'
    s.players.A.secondaryState.cabalPoints = 6
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'shooting.start', 'x')
    expect(pendingOptions(s).some((o) => o.startsWith('weaver:'))).toBe(false)
    expect(pendingOptions(s)).toContain(`echoes:${AHRAK_M}`)
  })

  it('THO-011 Echoes (pool 6) on Ahrak\'s unit grants a one-shot 0 CP override that expires with the phase', () => {
    const s = makeState(); parkAll(s); phase(s, 'fight', 'B', { A: 3 })
    s.players.A.secondaryState.cabalPoints = 6
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'fight.start', 'x')
    expect(pendingOptions(s)).toContain(`echoes:${AHRAK_M}`)
    answerOption(ctx, `echoes:${AHRAK_M}`)
    expect(cabalPoints(s, 'A')).toBe(0)
    const ov = phaseCostOverrides(s, 'A', AHRAK)
    expect(ov).toHaveLength(1)
    expect(ov[0]).toMatchObject({ cost: 0, ignoreLimit: true, source: 'ths.a.echoes-from-the-warp' })
    expect(phaseCostOverrides(s, 'A', SCARABS)).toHaveLength(0)
    phase(s, 'shooting', 'A') // phase marks reset: the override is gone unused
    expect(phaseCostOverrides(s, 'A', AHRAK)).toHaveLength(0)
  })

  it('THO-012 Echoes on the Scarabs: Wreathed in Warpflame used on Ahrak at the normal price, then allowed again on the Scarabs for 0 CP', () => {
    const s = makeState(); parkAll(s); phase(s, 'fight', 'A', { A: 3 })
    s.players.A.secondaryState.cabalPoints = 6
    const h = stratHarness(s)
    h.ctx.window('fight.start', 'k1', ['A'], {}) // the Ritual offer comes first
    answerOption(h.ctx, `echoes:${sorcererId(s)}`)
    expect(phaseCostOverrides(s, 'A', SCARABS)).toHaveLength(1)
    h.ctx.window('fight.start', 'k1', ['A'], {})
    h.useOption(WARP, AHRAK)
    expect(s.players.A.cp).toBe(2) // Ahrak has no override: full price
    expect(phaseCostOverrides(s, 'A', SCARABS)).toHaveLength(1) // not spent by another unit's use
    // once per phase: only the unit with the Echoes override may use it again
    expect(offered(s, 'A', 'fight.start', WARP).flat()).toEqual([SCARABS])
    h.ctx.window('fight.start', 'k2', ['A'], {})
    h.useOption(WARP, SCARABS)
    expect(s.players.A.cp).toBe(2) // free
    expect(phaseCostOverrides(s, 'A', SCARABS)).toHaveLength(0) // one Stratagem per Ritual
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Weaver of Fates (THO-008, THO-010)', () => {
  // a Weaver Ritual has been paid for with the chosen Psyker model; Boyz shoot a Tzaangors unit
  const weaverSetup = (o: Opts = {}, chosen = AHRAK_M) => {
    const s = makeState(o); parkAll(s); phase(s, 'shooting', 'B')
    placeUnit(s, BOYZ, { x: 0, z: 0, gap: 0.3 })
    s.phaseState.marks.push(`ths:weaver:A:${chosen}`)
    return s
  }
  const rerolls = (s: GameState, target: string) => {
    const { ctx } = ctxOf(s)
    const atk = attackCtx(s, s.units[BOYZ].models[0], target)
    return hookService.collect(ctx, 'onSaveRoll', { attack: atk, roll: rollOf(2, 'save') }).filter((r) => r.source.id === 'ths.a.weaver-of-fates' && (r.result as { reroll?: string }).reroll === 'oneDie')
  }

  it('THO-008 Tzaangors 17" from Ahrak get the one-die save re-roll; 19" away they do not', () => {
    const s = weaverSetup()
    at(s, AHRAK_M, 0, -13)
    placeUnit(s, TZ1, [[0 + 18.4, -13]])
    expect(distance(s.models[AHRAK_M], s.models[s.units[TZ1].models[0]])).toBeLessThan(18)
    expect(rerolls(s, TZ1)).toHaveLength(1)
    placeUnit(s, TZ1, [[0 + 20.5, -13]])
    expect(distance(s.models[AHRAK_M], s.models[s.units[TZ1].models[0]])).toBeGreaterThan(18)
    expect(rerolls(s, TZ1)).toHaveLength(0)
  })

  it('THO-008 once used this phase (oneDie mark) it is not offered again', () => {
    const s = weaverSetup()
    placeUnit(s, TZ1, [[-10, -13]])
    expect(rerolls(s, TZ1)).toHaveLength(1)
    s.phaseState.marks.push('oneDie:ths.a.weaver-of-fates:save:A')
    expect(rerolls(s, TZ1)).toHaveLength(0)
  })

  it('THO-008 with the Sorcerer chosen, range is measured from the Sorcerer model, not the closest Terminator', () => {
    const s = weaverSetup({}, '')
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('ths:weaver:'))
    const sorc = sorcererId(s), term = terminatorId(s)
    s.phaseState.marks.push(`ths:weaver:A:${sorc}`)
    placeUnit(s, TZ1, [[0, -13]])
    at(s, sorc, -30, -13) // far away (outside 18" of the Tzaangors)
    at(s, term, -2, -13) // right next to the Tzaangors
    expect(rerolls(s, TZ1)).toHaveLength(0)
    at(s, sorc, -10, -13)
    expect(rerolls(s, TZ1)).toHaveLength(1)
  })

  it('THO-008 mirror match: each player has their own once-per-phase re-roll', () => {
    const s = makeState({ mirror: true }); parkAll(s); phase(s, 'shooting', 'B')
    for (const id of ['B:ahrak', 'B:scarabs', 'B:tzaangors-1', 'B:tzaangors-2']) placeUnit(s, id, [[0, 13]])
    s.phaseState.marks.push(`ths:weaver:A:${AHRAK_M}`, 'ths:weaver:B:B:ahrak#0')
    placeUnit(s, TZ1, [[-15, -13]])
    const { ctx } = ctxOf(s)
    const saves = (attackerUnit: string, target: string) =>
      hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, s.units[attackerUnit].models[0], target), roll: rollOf(2, 'save') })
        .filter((r) => r.source.id === 'ths.a.weaver-of-fates')
    expect(saves('B:tzaangors-1', TZ1)).toHaveLength(1)
    expect(saves('A:tzaangors-1', 'B:tzaangors-1')).toHaveLength(1)
    s.phaseState.marks.push('oneDie:ths.a.weaver-of-fates:save:A')
    expect(saves('B:tzaangors-1', TZ1)).toHaveLength(0)
    expect(saves('A:tzaangors-1', 'B:tzaangors-1')).toHaveLength(1)
  })

  it('THO-010 does not apply to an enemy unit\'s saves, nor when the chosen Psyker has left the battlefield', () => {
    const s = weaverSetup()
    placeUnit(s, TZ1, [[-10, -13]])
    placeUnit(s, DREAD, [[-2, -13]])
    expect(rerolls(s, DREAD)).toHaveLength(0)
    expect(rerolls(s, TZ1)).toHaveLength(1)
    s.units[AHRAK].location = 'reserves'
    expect(rerolls(s, TZ1)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Temporal Sorceries / Arch-Diabolist (THO-013 - THO-015)', () => {
  it('THO-013 Temporal Sorceries gives Ahrak (only) Deep Strike and Lone Operative', () => {
    const s = makeState(); parkAll(s)
    expect(hookService.hasCoreAbility(s, AHRAK, 'DEEP_STRIKE')).toBe(true)
    expect(hookService.hasCoreAbility(s, AHRAK, 'LONE_OPERATIVE')).toBe(true)
    expect(hookService.hasCoreAbility(s, TZ1, 'DEEP_STRIKE')).toBe(false)
    expect(hookService.hasCoreAbility(s, SCARABS, 'LONE_OPERATIVE')).toBe(false)
  })

  it('THO-013 Ahrak may be set up in Reserves at battle formation', () => {
    expect(() => createGameState({
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: THS({ reserves: ['ahrak'] }), B: ORK() },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }, bundle, 'thousand-sons-reserves', ENGINE_VERSION)).not.toThrow()
  })

  it('THO-014 Lone Operative with either enhancement: an enemy 13" away cannot target Ahrak, one 11" away can; the Scarabs at 13" can be targeted', () => {
    for (const enhancementId of ['ths.e.temporal-sorceries', 'ths.e.arch-diabolist']) {
      const s = makeState({ a: { enhancementId } }); parkAll(s)
      s.phase = 'shooting'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
      const shooter = s.units[BOYZ].models.find((m) => s.models[m].weapons.some((w) => s.weapons[w].id === 'ork.w.shoota'))!
      const shoota = s.models[shooter].weapons.find((w) => s.weapons[w].id === 'ork.w.shoota')!
      const rB = s.models[shooter].base.radius
      const legal = (target: string, gap: number, face: number) => {
        placeUnit(s, BOYZ, [[-6, 9]])
        const tm = s.models[s.units[target].models[0]]
        // spread across the line of sight: models of one unit stacked on a point block each other's LOS
        placeUnit(s, target, s.units[target].models.map((_, i) => [-6 + face * (gap + rB + tm.base.radius), 9 + i * 1.8] as [number, number]))
        return targetLegality(s, BOYZ, shooter, s.weapons[shoota], target)
      }
      expect(legal(AHRAK, 13, -1)?.code, enhancementId).toBe('E_NOT_IN_RANGE')
      expect(legal(AHRAK, 11, -1), enhancementId).toBeNull()
      // the cap is Ahrak's alone: the Scarabs at the same 13" are fair game for the same Shoota
      placeUnit(s, AHRAK, [[-20, -13]])
      expect(legal(SCARABS, 13, 1), enhancementId).toBeNull()
    }
  })

  it('THO-015 Arch-Diabolist: both Screamer Invocation profiles gain PISTOL, so engaged Ahrak fires them at the unit he is engaged with; Deep Strike stays, no D3 Cabal points at Command end', () => {
    const engaged = (enhancementId: string) => {
      const s = makeState({ a: { enhancementId } }); parkAll(s)
      s.phase = 'shooting'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
      const rA = s.models[AHRAK_M].base.radius
      const rB = s.models[s.units[BOYZ].models[0]].base.radius
      placeUnit(s, AHRAK, [[0, 0]])
      placeUnit(s, BOYZ, [[rA + rB + 0.4, 0]])
      return s
    }
    const screamers = (s: GameState) => buildShootingWeaponEntries(ctxOf(s).ctx, AHRAK).filter((e) => s.weapons[e.weaponId].id.startsWith('ths.w.screamer-invocation'))
    const s = engaged('ths.e.arch-diabolist')
    expect(unitEligibleToShoot(ctxOf(s).ctx, AHRAK)).toBe(true)
    const entries = screamers(s)
    expect(entries.map((e) => s.weapons[e.weaponId].id).sort()).toEqual(['ths.w.screamer-invocation-focused', 'ths.w.screamer-invocation-witchfire'])
    for (const e of entries) {
      expect(hookService.weaponAbilitiesFor(s, AHRAK_M, s.weapons[e.weaponId]).some((a) => a.ability === 'PISTOL')).toBe(true)
      expect(e.legalTargets).toEqual([BOYZ])
    }
    // and the shot really goes off: Torrent auto-hits the engaged unit
    const sc = s.models[AHRAK_M].weapons.find((w) => s.weapons[w].id === 'ths.w.screamer-invocation-witchfire')!
    s.players.A.secondaryState[`ths:glimpse:${AHRAK_M}`] = `${s.round}:${s.activePlayer}` // keep Glimpse out of the way
    const { ctx, events } = ctxOf(s, [2, 1, ...Array(60).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: AHRAK, overwatch: false, targets: [{ modelId: AHRAK_M, weaponId: sc, targetUnitId: BOYZ, profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    expect(events.filter((e) => e.type === 'HitRolled' && e.auto).length).toBeGreaterThan(0)

    expect(hookService.hasCoreAbility(s, AHRAK, 'DEEP_STRIKE')).toBe(true)
    phase(s, 'command', 'A')
    hookService.offerPicks(ctxOf(s, []).ctx, 'command.end', 'x')
    expect(cabalPoints(s, 'A')).toBe(3)
    // without it the Screamer is not a Pistol: an engaged Ahrak cannot fire it at all
    const plain = engaged('ths.e.temporal-sorceries')
    for (const e of screamers(plain)) expect(e.legalTargets).toEqual([])
    for (const wid of plain.models[AHRAK_M].weapons) {
      const w = plain.weapons[wid]
      if (w.id.startsWith('ths.w.screamer-invocation')) expect(hookService.weaponAbilitiesFor(plain, AHRAK_M, w).some((a) => a.ability === 'PISTOL')).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Secondaries (THO-016 - THO-020)', () => {
  // round 2, end of the opponent's (B) Fight phase, Ahrak on the west marker (outside A's zone), A holds it
  const ritualState = (o: Opts = {}) => {
    const s = makeState({ round: 2, ...o }); parkAll(s)
    placeUnit(s, AHRAK, [[-10, 0]])
    phase(s, 'fight', 'B')
    return s
  }
  const phaseEnd = (ctx: EngineContext) => missionService.onWindow(ctx, 'phase.end', 'x')

  it('THO-016 Sorcerous Ritual: D6 3 + pool 2 = 5 scores 3 VP; D6 2 + 2 = 4 scores 0', () => {
    const win = ritualState(); win.players.A.secondaryState.cabalPoints = 2
    phaseEnd(ctxOf(win, [3]).ctx)
    expect(win.players.A.vp).toBe(3)
    const lose = ritualState(); lose.players.A.secondaryState.cabalPoints = 2
    phaseEnd(ctxOf(lose, [2]).ctx)
    expect(lose.players.A.vp).toBe(0)
    // it never spends the pool
    expect(cabalPoints(win, 'A')).toBe(2)
  })

  it('THO-017 Sorcerous Ritual: bonus capped at +3, round 1 and the own Fight phase do not roll, marker in own zone does not roll', () => {
    const capped = ritualState(); capped.players.A.secondaryState.cabalPoints = 5
    phaseEnd(ctxOf(capped, [1]).ctx) // 1 + min(3, 5) = 4 -> 0
    expect(capped.players.A.vp).toBe(0)
    const r1 = ritualState({ round: 1 }); r1.players.A.secondaryState.cabalPoints = 5
    phaseEnd(ctxOf(r1, []).ctx) // no dice: rolling would throw
    expect(r1.players.A.vp).toBe(0)
    const own = ritualState(); own.players.A.secondaryState.cabalPoints = 5
    phase(own, 'fight', 'A')
    phaseEnd(ctxOf(own, []).ctx)
    expect(own.players.A.vp).toBe(0)
    const zone = ritualState(); zone.players.A.secondaryState.cabalPoints = 5
    zone.objectives.west.pos = { x: -10, z: -12 }
    placeUnit(zone, AHRAK, [[-10, -12]])
    phaseEnd(ctxOf(zone, []).ctx)
    expect(zone.players.A.vp).toBe(0)
  })

  it('THO-018 Sorcerous Ritual: only a Terminator on the marker gives no roll; the Sorcerer on it rolls', () => {
    const s = ritualState(); s.players.A.secondaryState.cabalPoints = 3
    placeUnit(s, AHRAK, [[-20, -13]])
    at(s, terminatorId(s), -10, 0)
    phaseEnd(ctxOf(s, []).ctx)
    expect(s.players.A.vp).toBe(0)
    at(s, sorcererId(s), -10, 0.5)
    phaseEnd(ctxOf(s, [3]).ctx) // 3 + 3 = 6
    expect(s.players.A.vp).toBe(3)
  })

  const killStamp = (s: GameState, player: 'A' | 'B') => { s.players[player].secondaryState.psychicKillStamp = `${s.round}:${s.activePlayer}:${s.phase}` }
  const bringer = (o: Opts = {}) => {
    const s = makeState({ round: 2, a: { secondaryId: 'ths.sec.bringer-of-change' }, ...o }); parkAll(s)
    return s
  }

  it('THO-019 Bringer of Change: a Psychic kill this phase scores D3 at phase end; no Psychic kill scores 0', () => {
    const s = bringer(); phase(s, 'shooting', 'A'); killStamp(s, 'A')
    missionService.onWindow(ctxOf(s, [6]).ctx, 'phase.end', 'x') // D3 face 6 -> 3
    expect(s.players.A.vp).toBe(3)
    const none = bringer(); phase(none, 'shooting', 'A')
    missionService.onWindow(ctxOf(none, []).ctx, 'phase.end', 'x')
    expect(none.players.A.vp).toBe(0)
  })

  it('THO-020 Bringer of Change: scores in either turn, a stale stamp does not count, total is capped at 12', () => {
    const s = bringer(); phase(s, 'fight', 'B'); killStamp(s, 'A')
    missionService.onWindow(ctxOf(s, [6]).ctx, 'phase.end', 'x')
    expect(s.players.A.vp).toBe(3)
    // stamp from the previous phase is ignored
    phase(s, 'shooting', 'A'); s.players.A.secondaryState.psychicKillStamp = `${s.round}:A:movement`
    missionService.onWindow(ctxOf(s, []).ctx, 'phase.end', 'x')
    expect(s.players.A.vp).toBe(3)
    // cap: 10 already scored, D3 = 3 -> only 2 more
    const c = bringer(); phase(c, 'shooting', 'A'); killStamp(c, 'A')
    c.players.A.vpBySource['bringer-of-change'] = 10; c.players.A.vp = 10
    missionService.onWindow(ctxOf(c, [6]).ctx, 'phase.end', 'x')
    expect(c.players.A.vp).toBe(12)
    phase(c, 'fight', 'A'); killStamp(c, 'A')
    missionService.onWindow(ctxOf(c, []).ctx, 'phase.end', 'x')
    expect(c.players.A.vp).toBe(12)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Stratagems (THO-021 - THO-023)', () => {
  it('THO-021 Wreathed in Warpflame: offered for the Scarabs and Ahrak, not for Tzaangors or a unit that already fought', () => {
    const s = makeState(); parkAll(s); phase(s, 'fight', 'A', { A: 3 })
    const ids = offered(s, 'A', 'fight.start', WARP).flat()
    expect(ids).toEqual(expect.arrayContaining([SCARABS, AHRAK]))
    expect(ids).not.toContain(TZ1)
    expect(ids).not.toContain(TZ2)
    s.phaseState.fight!.fought.push(SCARABS)
    expect(offered(s, 'A', 'fight.start', WARP).flat()).not.toContain(SCARABS)
  })

  it('THO-021 Wreathed in Warpflame: grants Lethal Hits to melee, and a crit on an unmodified 5 against a VEHICLE only', () => {
    const s = makeState(); parkAll(s); placeUnit(s, DREAD, [[-18, -8]]); placeUnit(s, BOYZ, [[-18, -9]])
    phase(s, 'fight', 'A', { A: 3 })
    const h = stratHarness(s)
    h.ctx.window('fight.start', 'k', ['A'], {})
    h.useOption(WARP, SCARABS)
    const khopesh = s.models[terminatorId(s)].weapons.find((w) => s.weapons[w].kind === 'melee')!
    const vs = (target: string) => attackCtx(s, terminatorId(s), target, khopesh)
    const crit = (target: string, die: number) => hookService.collect(h.ctx, 'onHitRoll', { attack: vs(target), roll: rollOf(die, 'hit', SCARABS) })
      .map((r) => r.result as { critThreshold?: number }).filter((r) => r.critThreshold !== undefined)
    expect(crit(DREAD, 5).some((r) => r.critThreshold === 5)).toBe(true)
    expect(crit(BOYZ, 5).some((r) => r.critThreshold === 5)).toBe(false)
    expect(hookService.weaponAbilitiesFor(s, terminatorId(s), s.weapons[khopesh]).some((a) => a.ability === 'LETHAL_HITS')).toBe(true)
  })

  it('THO-022 Mutant Cunning: offered for a targeted Tzaangors unit that is not engaged; not for the Scarabs', () => {
    const s = makeState(); parkAll(s); placeUnit(s, BOYZ, { x: 6, z: -4, gap: 0.3 })
    phase(s, 'shooting', 'B'); s.players.A.cp = 3
    const trig = { unitId: BOYZ, targetUnitId: TZ1 }
    expect(offered(s, 'A', 'shooting.targetsDeclared', CUNNING, trig).flat()).toContain(TZ1)
    expect(offered(s, 'A', 'shooting.targetsDeclared', CUNNING, { unitId: BOYZ, targetUnitId: SCARABS }).flat()).not.toContain(SCARABS)
    // engaged Tzaangors are not eligible
    const e = makeState(); parkAll(e); placeUnit(e, BOYZ, [[6, -12]])
    phase(e, 'shooting', 'B'); e.players.A.cp = 3
    expect(offered(e, 'A', 'shooting.targetsDeclared', CUNNING, trig).flat()).not.toContain(TZ1)
  })

  it('THO-022 Mutant Cunning: the D6" Normal move is capped at the rolled distance, and every ranged attack on the unit has the Benefit of Cover until the phase ends', () => {
    const s = makeState(); parkAll(s)
    // Tzaangors in the open south-east, two rows; the Boyz shooter further north; the other Tzaangors out of the way
    placeUnit(s, TZ1, s.units[TZ1].models.map((_, i) => [12 + (i % 5) * 1.6, -12 + Math.floor(i / 5) * 1.6] as [number, number]))
    placeUnit(s, TZ2, [[-20, 8]])
    placeUnit(s, BOYZ, [[16, -1]])
    phase(s, 'shooting', 'B'); s.players.A.cp = 3
    const h = stratHarness(s, [4]) // the D6: 4"
    h.ctx.window('shooting.targetsDeclared', 'k', ['A'], { unitId: BOYZ, targetUnitId: TZ1 })
    h.useOption(CUNNING, TZ1)
    expect(s.players.A.cp).toBe(2)
    const pending = s.pending as PendingDecision & { kind: 'moveUnit' }
    expect(pending.kind).toBe('moveUnit')
    expect(pending.context.unitId).toBe(TZ1)
    expect(Object.values(pending.constraints.perModel ?? {}).every((d) => d === 4)).toBe(true)
    const before = Object.fromEntries(s.units[TZ1].models.map((id) => [id, { ...s.models[id].pos }]))
    const move = (dz: number) => ({ type: 'moveUnit', player: 'A', decisionId: pending.id, unitId: TZ1, placements: s.units[TZ1].models.map((id) => ({ modelId: id, pos: { x: before[id].x, y: 0, z: before[id].z + dz } })) }) as Action
    expect(validateReactiveMove(s, move(5), pending)?.code).toBe('E_OUT_OF_RANGE') // more than the 4" rolled
    expect(validateReactiveMove(s, move(3.9), pending)).toBeNull()
    s.pending = null
    expect(handleReactiveMove(h.ctx, move(3.9), pending)).toBeUndefined()
    const moved = Math.max(...s.units[TZ1].models.map((id) => Math.hypot(s.models[id].pos.x - before[id].x, s.models[id].pos.z - before[id].z)))
    expect(moved).toBeGreaterThan(3.8)
    expect(moved).toBeLessThanOrEqual(4)
    // Benefit of Cover for the rest of the phase: a real ranged attack allocates with cover; the next phase's does not
    const shoot = (dice: number[]) => {
      const m = s.units[BOYZ].models.find((id) => s.models[id].weapons.some((w) => s.weapons[w].id === 'ork.w.shoota'))!
      const w = s.models[m].weapons.find((x) => s.weapons[x].id === 'ork.w.shoota')!
      s.players.A.cp = 0; s.players.B.cp = 0 // no Command Re-roll prompts
      const { ctx, events } = ctxOf(s, dice)
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [{ modelId: m, weaponId: w, targetUnitId: TZ1, profileGroup: null, attacks: null }] })
      attackService.advance(ctx)
      return events.filter((e): e is Extract<GameEvent, { type: 'AttackAllocated' }> => e.type === 'AttackAllocated')
    }
    const covered = shoot([6, 6, 6, 6, 6, 6, 6, 6, ...Array(30).fill(1)])
    expect(covered.length).toBeGreaterThan(0)
    expect(covered.every((e) => e.cover)).toBe(true)
    s.pending = null
    s.phaseState = emptyPhaseState() // the phase has ended
    const bare = shoot([6, 6, 6, 6, 6, 6, 6, 6, ...Array(30).fill(1)])
    expect(bare.length).toBeGreaterThan(0)
    expect(bare.some((e) => e.cover)).toBe(false)
  })

  const chargeState = () => {
    const s = makeState(); parkAll(s); placeUnit(s, BOYZ, { x: -18, z: -6, gap: 0.3 })
    phase(s, 'charge', 'B', { A: 3 })
    s.phaseState.charge = { unitId: BOYZ, targetUnitIds: [SCARABS], roll: null, rerolled: false, distance: null, heroic: false }
    return s
  }

  it('THO-023 Malign Entanglement: offered for the charged Scarabs only; using it subtracts 2 from the charge roll until phase end', () => {
    const s = chargeState()
    const trig = { unitId: BOYZ }
    const ids = offered(s, 'A', 'charge.declared', ENTANGLE, trig)
    expect(ids.some((t) => t.includes(SCARABS))).toBe(true)
    expect(ids.some((t) => t.includes(TZ1))).toBe(false)
    const h = stratHarness(s)
    h.ctx.window('charge.declared', 'k', ['A'], trig)
    h.useOption(ENTANGLE, BOYZ)
    const res = hookService.collect(h.ctx, 'onChargeRoll', { chargingUnitId: BOYZ, roll: rollOf(9, 'charge', BOYZ) } as never)
    expect(res.some((r) => (r.result as { modifier?: number }).modifier === -2)).toBe(true)
    // expires at phase end
    h.ctx.services.effects.expire(h.ctx, 'phaseEnd', null)
    expect(hookService.collect(h.ctx, 'onChargeRoll', { chargingUnitId: BOYZ, roll: rollOf(9, 'charge', BOYZ) } as never).some((r) => (r.result as { modifier?: number }).modifier === -2)).toBe(false)
  })

  it('THO-023 Malign Entanglement: a 2D6 charge roll of 9 (4+5) counts as 7 once it is used, so a charge that needs 8 fails; without it the same roll succeeds', () => {
    const run = (useIt: boolean) => {
      const s = makeState(); parkAll(s)
      placeUnit(s, SCARABS, s.units[SCARABS].models.map((_, i) => [12 + i * 1.8, -8] as [number, number]))
      placeUnit(s, TZ1, [[-20, 8]]); placeUnit(s, TZ2, [[-20, 12]])
      // the Boyz row sits so the closest gap to the Scarabs is 9" (the charge needs 8" to reach Engagement Range)
      placeUnit(s, BOYZ, s.units[BOYZ].models.map((_, i) => [12 + i * 1.3, -8 + 9 + s.models[s.units[BOYZ].models[0]].base.radius + s.models[s.units[SCARABS].models[0]].base.radius] as [number, number]))
      phase(s, 'charge', 'B', { A: 3 })
      const { ctx, events } = ctxOf(s, [4, 5, ...Array(30).fill(3)])
      chargeModule.enter(ctx)
      const act = (action: Action) => {
        if (!s.pending) chargeModule.advance(ctx)
        const pending = s.pending as PendingDecision
        const rej = chargeModule.validate ? chargeModule.validate(s, action, pending) : null
        if (rej) throw new Error(`rejected ${rej.code} ${rej.reason}`)
        s.pending = null
        const h = chargeModule.handle(ctx, action, pending)
        if (h) throw new Error(`rejected ${h.code} ${h.reason}`)
        chargeModule.advance(ctx)
      }
      act({ type: 'chooseUnitToActivate', player: 'B', decisionId: '', unitId: BOYZ })
      act({ type: 'declareCharge', player: 'B', decisionId: '', unitId: BOYZ, targetUnitIds: [SCARABS] })
      return { s, ctx, events, act }
    }
    // with it: the opponent's window opens after the declaration, Malign Entanglement is taken
    const withIt = run(true)
    expect(withIt.s.pending?.kind).toBe('stratagemWindow')
    const opt = (withIt.s.pending as unknown as { options: { action: UseStratagemAction }[] }).options.find((o) => o.action.stratagemId === ENTANGLE && o.action.targets.unitIds?.includes(SCARABS))!
    const pending = withIt.s.pending as PendingDecision
    withIt.s.pending = null
    expect(stratagemService.handle(withIt.ctx, { ...opt.action, player: pending.player, decisionId: pending.id } as Action, pending)).toBeFalsy()
    chargeModule.advance(withIt.ctx)
    const rolled = withIt.events.filter((e): e is Extract<GameEvent, { type: 'ChargeRolled' }> => e.type === 'ChargeRolled')
    expect(rolled).toHaveLength(1)
    expect(rolled[0].dice).toEqual([4, 5])
    expect(rolled[0].total).toBe(7)
    expect(withIt.events.some((e) => e.type === 'ChargeFailed' && e.unitId === BOYZ)).toBe(true)
    // without it (the opponent passes on the stratagem): the 9 clears the 8" needed and the Boyz are asked to move
    const without = run(false)
    expect(without.s.pending?.kind).toBe('stratagemWindow')
    const p2 = without.s.pending as PendingDecision
    without.s.pending = null
    without.ctx.services.stratagems.handle(without.ctx, { type: 'pass', player: p2.player, decisionId: p2.id } as Action, p2)
    chargeModule.advance(without.ctx)
    const rolled2 = without.events.filter((e): e is Extract<GameEvent, { type: 'ChargeRolled' }> => e.type === 'ChargeRolled')
    expect(rolled2[0].total).toBe(9)
    expect(without.events.some((e) => e.type === 'ChargeFailed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Abilities (THO-024 - THO-028)', () => {
  const hook = codeHooks.glimpseOfEternity
  const entry = (s: GameState) => ({ holderUnitId: AHRAK, bearerModelId: null, source: { kind: 'ability', id: 'ths.a.glimpse-of-eternity', unitId: AHRAK, modelId: null } }) as never

  it('THO-024 Glimpse: fixes Ahrak\'s hit, wound, damage and save dice to 6, once per turn', () => {
    const s = makeState(); parkAll(s)
    for (const purpose of ['hit', 'wound', 'damage', 'save'] as const) {
      expect(hook.fixRoll!(s, entry(s), diceRoll(purpose, AHRAK))).toEqual({ value: 6, usedKey: `ths:glimpse:${AHRAK_M}` })
    }
    s.players.A.secondaryState[`ths:glimpse:${AHRAK_M}`] = `${s.round}:${s.activePlayer}`
    expect(hook.fixRoll!(s, entry(s), diceRoll('wound', AHRAK))).toBeNull()
    s.activePlayer = 'B' // the next turn
    expect(hook.fixRoll!(s, entry(s), diceRoll('wound', AHRAK))).not.toBeNull()
  })

  it('THO-024 the engine offers it through fixRollOffers with the ability as source', () => {
    const s = makeState(); parkAll(s)
    const offers = fixRollOffers(s, diceRoll('wound', AHRAK))
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ sourceAbilityId: 'ths.a.glimpse-of-eternity', value: 6 })
  })

  it('THO-026 Glimpse is never offered for Scarab or Tzaangor rolls, nor on Hazardous, charge or Battle-shock rolls', () => {
    const s = makeState(); parkAll(s)
    expect(fixRollOffers(s, diceRoll('hit', SCARABS))).toHaveLength(0)
    expect(fixRollOffers(s, diceRoll('save', TZ1))).toHaveLength(0)
    for (const purpose of ['hazardous', 'charge', 'battleShock', 'attacks', 'deadlyDemise'] as const) {
      expect(fixRollOffers(s, diceRoll(purpose, AHRAK))).toHaveLength(0)
    }
  })

  it('THO-027 Implacable Guardians: Strength above Toughness 5 subtracts 1 from the wound roll; equal Strength or a dead Sorcerer does not', () => {
    const s = makeState(); parkAll(s); placeUnit(s, BOYZ, [[-18, -8]])
    const { ctx } = ctxOf(s)
    const wound = (strength: number) => {
      const atk = attackCtx(s, s.units[BOYZ].models[0], SCARABS, undefined, { S: strength })
      return hookService.collect(ctx, 'onWoundRoll', { attack: atk, roll: rollOf(4, 'wound', BOYZ) }).map((r) => (r.result as { modifier?: number }).modifier).filter((m) => m !== undefined)
    }
    expect(wound(6)).toEqual([-1])
    expect(wound(5)).toEqual([])
    removeModel(s, sorcererId(s))
    expect(wound(6)).toEqual([])
  })

  it('THO-028 Relic Hunters: Tzaangors on 2 controlled markers roll 2 dice (4+ = +1); two units on one marker roll 1; an uncontrolled marker rolls none', () => {
    const base = () => {
      const s = makeState({ a: { enhancementId: 'ths.e.arch-diabolist' } }); parkAll(s); phase(s, 'command', 'A')
      s.units[AHRAK].location = 'reserves'; s.units[SCARABS].location = 'reserves'
      return s
    }
    const two = base()
    placeUnit(two, TZ1, [[-10, 0]]); placeUnit(two, TZ2, [[10, 0]])
    hookService.offerPicks(ctxOf(two, [4, 3]).ctx, 'command.end', 'x') // west 4 (+1), east 3 (0)
    expect(cabalPoints(two, 'A')).toBe(1)
    const both = base()
    placeUnit(both, TZ1, [[-10, 0]]); placeUnit(both, TZ2, [[-10, 0.2]])
    hookService.offerPicks(ctxOf(both, [5]).ctx, 'command.end', 'x') // one die only
    expect(cabalPoints(both, 'A')).toBe(1)
    const lost = base()
    placeUnit(lost, TZ1, [[-10, 0]]); placeUnit(lost, BOYZ, [[-10, 0.5]]) // ten stacked Boyz outnumber one Tzaangor on OC
    for (const id of lost.units[TZ1].models.slice(1)) lost.models[id].pos = { x: 40, y: 0, z: 40 }
    hookService.offerPicks(ctxOf(lost, []).ctx, 'command.end', 'x')
    expect(cabalPoints(lost, 'A')).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Weapons and reserves (THO-029, THO-030)', () => {
  const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
  const weaponOf = (s: GameState, modelId: string, id: string): string => s.models[modelId].weapons.find((w) => s.weapons[w].id === id)!
  const modelWith = (s: GameState, unitId: string, id: string): string => s.units[unitId].models.find((m) => weaponOf(s, m, id) !== undefined)!

  // A shoots. Both sides at 0 CP so no Command Re-roll prompts; Glimpse of Eternity spent so it does not interrupt.
  function shootState(): GameState {
    const s = makeState(); parkAll(s)
    phase(s, 'shooting', 'A')
    s.players.A.secondaryState[`ths:glimpse:${AHRAK_M}`] = `${s.round}:${s.activePlayer}`
    return s
  }
  // the target unit spread in a column `gap` inches (edge to edge) east of the firing model
  function placeTarget(s: GameState, shooter: string, targetUnitId: string, gap: number): void {
    const sm = s.models[shooter]
    const x = sm.pos.x + gap + sm.base.radius + s.models[s.units[targetUnitId].models[0]].base.radius
    placeUnit(s, targetUnitId, s.units[targetUnitId].models.map((_, i) => [x, sm.pos.z + i * 1.3] as [number, number]))
  }
  function fire(s: GameState, shooterUnit: string, shooter: string, weapon: string, target: string, dice: number[]) {
    const { ctx, events } = ctxOf(s, dice)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: shooterUnit, overwatch: false, targets: [{ modelId: shooter, weaponId: weaponOf(s, shooter, weapon), targetUnitId: target, profileGroup: null, attacks: null }] })
    for (let g = 0; g < 80; g++) {
      attackService.advance(ctx)
      const p = s.pending
      if (p?.kind !== 'allocateAttack') break
      s.pending = null
      attackService.handler.handle(ctx, { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: p.context.eligibleModels[0] } as Action, p)
    }
    return events
  }
  const mortals = (events: GameEvent[]) => of(events, 'DamageApplied').filter((e) => e.mortal)

  it('THO-029 Warpsmite: Anti-INFANTRY 4+ makes an unmodified 4 a critical wound against INFANTRY (not a VEHICLE), and Devastating Wounds turns it into mortal wounds with no saves', () => {
    const s = shootState()
    const sorc = sorcererId(s)
    at(s, sorc, -10, 0)
    placeTarget(s, sorc, BOYZ, 10)
    const ev = fire(s, SCARABS, sorc, 'ths.w.warpsmite', BOYZ, [3, 3, 3, 4, 4, 4, ...Array(20).fill(1)])
    const wounds = of(ev, 'WoundRolled')
    expect(wounds).toHaveLength(3)
    expect(wounds.every((w) => w.final === 4 && w.needed === 5 && w.wounded && w.critical)).toBe(true) // S4 vs T5 needs 5+, yet the 4 is a critical wound
    expect(mortals(ev)).toHaveLength(3)
    expect(of(ev, 'SaveRolled')).toHaveLength(0)
    expect(mortals(ev).reduce((n, d) => n + d.amount, 0)).toBe(3) // 1 damage each, applied in spite of the unit's saves
    // a 3 is not a critical wound: it fails (S4 vs T5 needs 5+)
    const m = shootState()
    at(m, sorcererId(m), -10, 0)
    placeTarget(m, sorcererId(m), BOYZ, 10)
    const miss = fire(m, SCARABS, sorcererId(m), 'ths.w.warpsmite', BOYZ, [3, 3, 3, 3, 3, 3, ...Array(20).fill(1)])
    expect(of(miss, 'WoundRolled').some((w) => w.wounded)).toBe(false)
    // Anti-INFANTRY does nothing against a VEHICLE: the same 4 does not wound the Deff Dread
    const v = shootState()
    at(v, sorcererId(v), -10, 0)
    placeTarget(v, sorcererId(v), DREAD, 10)
    const vs = fire(v, SCARABS, sorcererId(v), 'ths.w.warpsmite', DREAD, [3, 3, 3, 4, 4, 4, ...Array(20).fill(1)])
    expect(of(vs, 'WoundRolled').some((w) => w.wounded)).toBe(false)
    expect(mortals(vs)).toHaveLength(0)
  })

  it('THO-029 Screamer Invocation: the focused profile rolls 2D6 attacks, all auto-hit (Torrent) and it takes a Hazardous test; the witchfire profile does not', () => {
    const s = shootState()
    at(s, AHRAK_M, -10, 0)
    placeTarget(s, AHRAK_M, BOYZ, 6)
    // 2D6 = 3 + 4 = 7 attacks; wounds on 3+ (S6 vs T5); the saves fail; the Hazardous die is a 1
    const ev = fire(s, AHRAK, AHRAK_M, 'ths.w.screamer-invocation-focused', BOYZ, [3, 4, ...Array(7).fill(6), ...Array(7).fill(1), 1, ...Array(20).fill(1)])
    const hits = of(ev, 'HitRolled')
    expect(hits).toHaveLength(7)
    expect(hits.every((h) => h.auto && h.hit)).toBe(true)
    const haz = of(ev, 'HazardousTested')
    expect(haz).toHaveLength(1)
    expect(haz[0]).toMatchObject({ unitId: AHRAK, failed: true })
    expect(of(ev, 'DamageApplied').some((d) => d.modelId === AHRAK_M && d.mortal)).toBe(true) // the failed test hurts Ahrak
    // witchfire: 2D3, Torrent, no Hazardous
    const w = shootState()
    at(w, AHRAK_M, -10, 0)
    placeTarget(w, AHRAK_M, BOYZ, 6)
    const wev = fire(w, AHRAK, AHRAK_M, 'ths.w.screamer-invocation-witchfire', BOYZ, [4, 6, ...Array(5).fill(6), ...Array(20).fill(1)])
    expect(of(wev, 'HitRolled')).toHaveLength(5)
    expect(of(wev, 'HitRolled').every((h) => h.auto)).toBe(true)
    expect(of(wev, 'HazardousTested')).toHaveLength(0)
  })

  it('THO-029 inferno combi-bolter: Rapid Fire 2 gives 4 attacks within half range (12") and 2 beyond it', () => {
    const shots = (gap: number) => {
      const s = shootState()
      const m = modelWith(s, SCARABS, 'ths.w.inferno-combi-bolter')
      at(s, m, -10, 0)
      placeTarget(s, m, BOYZ, gap)
      return of(fire(s, SCARABS, m, 'ths.w.inferno-combi-bolter', BOYZ, Array(40).fill(1)), 'HitRolled').length
    }
    expect(shots(10)).toBe(4)
    expect(shots(11.9)).toBe(4)
    expect(shots(12.5)).toBe(2)
  })

  it('THO-029 soulreaper cannon: Devastating Wounds - an unmodified 6 to wound is a mortal wound with no save, other wounds are saved normally', () => {
    const s = shootState()
    const m = modelWith(s, SCARABS, 'ths.w.soulreaper-cannon')
    at(s, m, -10, 0)
    placeTarget(s, m, BOYZ, 8)
    // 6 attacks hit on 3+, wounds 6,6,6,3,3,3 (S6 vs T5 wounds on 3+), the three ordinary wounds are saved on a 6 (AP-1 vs Sv5+)
    const ev = fire(s, SCARABS, m, 'ths.w.soulreaper-cannon', BOYZ, [...Array(6).fill(3), 6, 6, 6, 3, 3, 3, ...Array(3).fill(6), ...Array(20).fill(1)])
    const wounds = of(ev, 'WoundRolled')
    expect(wounds.filter((x) => x.critical)).toHaveLength(3)
    expect(wounds.every((x) => x.wounded)).toBe(true)
    expect(mortals(ev)).toHaveLength(3)
    expect(of(ev, 'SaveRolled')).toHaveLength(3) // only the non-critical wounds are saved against
    expect(of(ev, 'SaveRolled').every((x) => x.saved)).toBe(true)
    expect(mortals(ev).reduce((n, d) => n + d.amount, 0)).toBe(3) // 1 damage each, applied in spite of the unit's saves
  })

  // --- THO-030 ---
  // the Scarabs in Reserves in the Movement phase's reinforcements step; the Orks hold a column of models at x = 10
  function reinforcements(round: number) {
    const s = makeState({ a: { reserves: ['scarabs'] }, round }); parkAll(s)
    s.units[SCARABS].location = 'reserves'
    for (const id of Object.keys(s.units)) if (s.units[id].player === 'B') placeUnit(s, id, [[-20, 13]])
    placeUnit(s, BOYZ, s.units[BOYZ].models.map((_, i) => [10, -6 + i * 1.3] as [number, number]))
    const { ctx } = ctxOf(s)
    s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
    movementModule.enter(ctx)
    s.step = 'reinforcements'
    s.phaseState.activated = Object.values(s.units).filter((u) => u.player === 'A' && u.location === 'board').map((u) => u.id)
    return { s, ctx }
  }
  const column = (s: GameState, x: number) => s.units[SCARABS].models.map((id, i) => ({ modelId: id, pos: { x, y: 0, z: -4 + i * 2 } }))

  it('THO-030 Scarabs Deep Strike: no arrival in round 1; from round 2 they must land more than 9" from every enemy model', () => {
    const r1 = reinforcements(1)
    expect(movementModule.advance(r1.ctx)).toBe('done')
    expect(r1.s.pending).toBeNull()
    expect(r1.s.units[SCARABS].location).toBe('reserves')

    const { s, ctx } = reinforcements(2)
    movementModule.advance(ctx)
    const pending = s.pending as PendingDecision & { kind: 'deployUnit' }
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toContain(SCARABS)
    const rB = s.models[s.units[BOYZ].models[0]].base.radius
    const rS = s.models[s.units[SCARABS].models[0]].base.radius
    const place = (gap: number) => ({ type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: SCARABS, placements: column(s, 10 + gap + rB + rS) }) as Action
    const check = (gap: number) => (movementModule.validate ? movementModule.validate(s, place(gap), pending) : null)
    expect(check(8.5)?.code).toBe('E_ENGAGEMENT')
    expect(check(8.99)?.code).toBe('E_ENGAGEMENT') // just inside 9"
    expect(check(9.3)).toBeNull()
    s.pending = null
    expect(movementModule.handle(ctx, place(9.3), pending)).toBeFalsy()
    expect(s.units[SCARABS].location).toBe('board')
  })

  it('THO-030 the Sorcerer fights with either the force weapon or the prosperine khopesh - the choice is asked each fight and only the chosen weapon attacks', () => {
    const fightWith = (choice: string) => {
      const s = makeState()
      s.phase = 'fight'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
      s.players.A.cp = 0; s.players.B.cp = 0
      s.players.A.secondaryState[`ths:glimpse:${AHRAK_M}`] = `${s.round}:${s.activePlayer}`
      parkAll(s)
      const sorc = sorcererId(s)
      const r = s.models[sorc].base.radius + s.models[s.units[BOYZ].models[0]].base.radius
      placeUnit(s, SCARABS, [[0, -11]])
      placeUnit(s, BOYZ, [[r + 0.4, -11]])
      const { ctx, events } = ctxOf(s, Array(60).fill(6))
      const run = (action: Action): string => {
        if (!s.pending) fightModule.advance(ctx)
        const pending = s.pending as PendingDecision
        const rej = fightModule.validate ? fightModule.validate(s, action, pending) : null
        if (rej) return rej.code
        s.pending = null
        const h = fightModule.handle(ctx, action, pending)
        if (h) return h.code
        fightModule.advance(ctx)
        return 'ok'
      }
      fightModule.enter(ctx)
      expect(run({ type: 'chooseFightUnit', player: 'A', decisionId: '', unitId: SCARABS })).toBe('ok')
      const ask = s.pending as ChooseOptionDecision
      expect(ask.context.topic).toBe('meleeWeapon')
      expect((ask.context.data as { modelId: string }).modelId).toBe(sorc)
      expect(ask.options.map((o) => s.weapons[o.id].id).sort()).toEqual(['ths.w.force-weapon', 'ths.w.prosperine-khopesh'])
      expect(run({ type: 'chooseOption', player: 'A', decisionId: '', optionId: weaponOf(s, sorc, choice) })).toBe('ok')
      const decl = s.pending as PendingDecision & { kind: 'declareTargets' }
      expect(decl.kind).toBe('declareTargets')
      const sorcWeapons = decl.context.weapons.filter((w) => w.modelId === sorc).map((w) => s.weapons[w.weaponId].id)
      expect(sorcWeapons).toEqual([choice]) // never both
      // the whole unit fights: every model declares the weapons it was offered
      expect(run({ type: 'declareTargets', player: 'A', decisionId: '', unitId: SCARABS, targets: decl.context.weapons.map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: BOYZ })) })).toBe('ok')
      return of(events, 'HitRolled').filter((e) => e.attack.attackerModelId === sorc).map((e) => s.weapons[e.attack.weaponId].id)
    }
    const force = fightWith('ths.w.force-weapon')
    expect(force).toHaveLength(4) // A4
    expect(new Set(force)).toEqual(new Set(['ths.w.force-weapon']))
    const khopesh = fightWith('ths.w.prosperine-khopesh')
    expect(khopesh).toHaveLength(3) // A3
    expect(new Set(khopesh)).toEqual(new Set(['ths.w.prosperine-khopesh']))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('registry', () => {
  it('every Thousand Sons code hook is registered', () => {
    for (const name of ['cabalOfSorcerers', 'cabalRituals', 'weaverOfFates', 'temporalSorceries', 'archDiabolist', 'relicHunters', 'glimpseOfEternity', 'malignEntanglement', 'sorcerousRitual', 'bringerOfChange']) {
      expect(codeHooks[name], name).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('AI (THO-031)', () => {
  const decide = async (s: GameState, seed: string) => {
    const pending = s.pending as PendingDecision
    return new UtilityDecider('normal', seed).decide(view(s, pending.player), pending, legalActions(s, pending))
  }

  it('THO-031 the Ritual AI keeps its points at its own Movement start and spends Weaver at the opponent Shooting start', async () => {
    const own = makeState(); parkAll(own); phase(own, 'movement', 'A')
    own.players.A.secondaryState.cabalPoints = 4
    hookService.offerPicks(ctxOf(own).ctx, 'movement.start', 'x')
    expect(own.pending).not.toBeNull()
    expect(await decide(own, 'a')).toMatchObject({ type: 'chooseOption', optionId: 'done' })

    const opp = makeState(); parkAll(opp); phase(opp, 'shooting', 'B')
    placeUnit(opp, TZ1, [[-15, -13]])
    opp.players.A.secondaryState.cabalPoints = 4
    hookService.offerPicks(ctxOf(opp).ctx, 'shooting.start', 'x')
    const answer = await decide(opp, 'b')
    expect(answer).toMatchObject({ type: 'chooseOption' })
    expect((answer as { optionId: string }).optionId.startsWith('weaver:')).toBe(true)
  })

  it('THO-031 a full AI-vs-AI game with this patrol finishes without a stuck decision or a rejection', async () => {
    const mk = (patrolId: string, enh?: string, sec?: string): PlayerSetup => {
      const p = bundle.patrols[patrolId]
      return { name: patrolId, faction: p.faction, patrolId, enhancementId: enh ?? p.enhancements[0].id, secondaryId: sec ?? p.secondaries[0].id, attachments: [], reserves: [], battleReadyVp: 0 }
    }
    for (const [i, mine] of [mk('ths.cp.the-coven-temporus'), mk('ths.cp.the-coven-temporus', 'ths.e.arch-diabolist', 'ths.sec.bringer-of-change')].entries()) {
      const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: mine, B: ORK() }, sides: 'rollOff', firstTurn: 'rollOff', dataVersion: DATA_VERSION }
      const deciders: Record<'A' | 'B', Decider> = { A: new UtilityDecider('normal', `tho031-${i}-A`), B: new UtilityDecider('normal', `tho031-${i}-B`) }
      let r = createGame(setup, `tho031-${i}`, bundle)
      let steps = 0
      while (r.pending && steps < 2000) {
        steps++
        const pending = r.pending
        const next = step(r.state, await deciders[pending.player].decide(view(r.state, pending.player), pending, legalActions(r.state, pending)))
        expect(next.rejection).toBeFalsy()
        r = next
      }
      expect(r.state.result).toBeTruthy()
    }
  }, 120_000)
})

void (null as unknown as GameEvent)
