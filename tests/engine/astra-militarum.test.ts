// Astra Militarum: Karsk's Gunners (docs/spec/factions/astra-militarum.md, 12-checklist AST-001..AST-040). Real Combat Patrol data;
// covers the (b) code hooks: Voice of Command / Orders, Command Laurels, Gunnery Officer, Hold the Line, Methodical
// Destruction, Send in the Next Wave, Bring It Down, Artillery Strike, Rearm Reload Fire, Medi-pack, Regimental Standard.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, datasheetOf, deploymentZone, distance, emptyPhaseState, modelHasAttacked, recordModelAttacked,
  removeModel,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks, pendingReactions } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService, sourcesFor } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { missionService } from '../../src/engine/missions'
import { stratagemService } from '../../src/engine/stratagems'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const AM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Astra Militarum', faction: 'astra-militarum', patrolId: 'am.cp.karsks-gunners', enhancementId: 'am.e.command-laurels', secondaryId: 'am.sec.hold-the-line',
  attachments: [{ leaderRef: 'karsk', bodyguardRef: 'shock-a' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const KARSK = 'A:karsk', SHA = 'A:shock-a', SHB = 'A:shock-b', BAT = 'A:battery', SEN = 'A:sentinel'
const KM = 'A:karsk#0'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss', DREAD = 'B:deff-dread'
const MOVE = 'am.order.move-move-move', AIM = 'am.order.take-aim', COVER = 'am.order.take-cover'
const NEXT = 'am.s.send-in-the-next-wave', BID = 'am.s.bring-it-down', ARTY = 'am.s.artillery-strike'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: AM(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'astra', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  return s
}

// Karsk's unit joined to shock-a at the left, the Battery far to the right, the Sentinel 30" away
function deployArmy(s: GameState): void {
  placeUnit(s, SHA, { x: -12, z: -1, gap: 0.3 })
  placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
  placeUnit(s, SHB, { x: -12, z: 8, gap: 0.3 })
  placeUnit(s, BAT, [[-11, -6.5], [-9.5, -6.5]])
  placeUnit(s, SEN, [[16, 10]])
}

function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function answerOption(ctx: EngineContext, optionId: string, handler = hookService.handler): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const optionIds = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)

// Karsk issues one Order at command.end (default enhancement Laurels → "<order>@all"; Gunnery Officer → "<order>@<unit>")
function issue(ctx: EngineContext, optionId: string): void {
  expect(hookService.offerPicks(ctx, 'command.end', 'end')).toBe(true)
  answerOption(ctx, optionId)
}

function stat(s: GameState, unitId: string, modelId: string, stat: 'BS' | 'WS' | 'Sv' | 'M' | 'OC', weaponId: string | null, base: number): number {
  return hookService.statFor(s, { unitId, modelId, weapon: weaponId ? s.weapons[weaponId] : null, stat }, base)
}
const lasgunBS = (s: GameState, unitId: string) => stat(s, unitId, s.units[unitId].models[0], 'BS', 'am.w.lasgun', 4)

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}

function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp: { A?: number; B?: number } = {}) {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
function stratServices(): Services {
  return {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, queueMortalWounds: () => undefined, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
}
function stratHarness(s: GameState) {
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: stratServices(), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(s, new ScriptedRng([]), modules)
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
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])

function destroyUnit(s: GameState, unitId: string): void {
  for (const id of [...s.units[unitId].models]) removeModel(s, id)
  s.units[unitId].location = 'destroyed'
}

const gunnery = { enhancementId: 'am.e.gunnery-officer' }

// =====================================================================================================================
describe('patrol and Voice of Command (AST-1, AST-2)', () => {
  it('AST-001 AST-1: the patrol loads — 5 units, 28 models, Karsk is Warlord with Command Laurels on the Karsk model, attached to shock-a, default secondary Hold the Line', () => {
    const s = makeState()
    expect(Object.values(s.units).filter((u) => u.player === 'A')).toHaveLength(5)
    expect(Object.values(s.units).filter((u) => u.player === 'A').reduce((n, u) => n + u.models.length, 0)).toBe(28)
    expect(s.units[KARSK].isWarlord).toBe(true)
    expect(s.units[KARSK].bodyguardUnitId).toBe(SHA)
    expect(s.units[KARSK].enhancementId).toBe('am.e.command-laurels')
    expect(Object.values(s.abilities).find((a) => a.source === 'enhancement' && a.code === 'commandLaurels')?.bearerModelId).toBe(KM)
    expect(s.players.A.secondaryId).toBe('am.sec.hold-the-line')
    expect(hookService.keywordsFor(s, SEN)).toContain('SMOKE')
    for (const id of [KARSK, SHA, SHB, BAT, SEN]) expect(hookService.keywordsFor(s, id)).not.toContain('GRENADES')
  })

  it('AST-002 AST-2.1: at own command.end the Order is offered for REGIMENT units within 6" of Karsk only, never in the opponent\'s Command phase', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'command.end', 'end')).toBe(true)
    const ids = optionIds(s)
    expect(ids).toContain(`${AIM}@${SHA}`)
    expect(ids).toContain(`${COVER}@${SHA}`)
    expect(ids.some((i) => i.endsWith(`@${SEN}`))).toBe(false) // 30" away
    expect(ids.some((i) => i.endsWith(`@${SHB}`))).toBe(false) // shock-b is not within 6"
    expect(ids).toContain('decline')
    // the opponent's Command phase: nothing for the AM player
    const t = makeState({ a: gunnery })
    deployArmy(t)
    t.activePlayer = 'B'
    expect(hookService.offerPicks(ctxOf(t).ctx, 'command.end', 'end')).toBe(false)
  })

  it('AST-003 AST-2.1: Karsk model destroyed, veterans alive → no Order offered', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    removeModel(s, KM)
    expect(s.units[KARSK].models.length).toBeGreaterThan(0)
    expect(hookService.offerPicks(ctxOf(s).ctx, 'command.end', 'end')).toBe(false)
  })

  it('AST-004 AST-2.5: Take Aim! — lasgun hits on 3+ (was 4+) until the start of the next own turn, then 4+ again', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    const { ctx } = ctxOf(s)
    expect(lasgunBS(s, SHA)).toBe(4)
    issue(ctx, `${AIM}@${SHA}`)
    expect(lasgunBS(s, SHA)).toBe(3)
    expect(stat(s, KARSK, KM, 'BS', 'am.w.bolt-pistol', 4)).toBe(3) // Karsk's own models gain the Order (AST-010)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(lasgunBS(s, SHA)).toBe(4)
  })

  it('AST-005 AST-2.5: Move! Move! Move! — M 6 → 9', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    const { ctx } = ctxOf(s)
    const trooper = s.units[SHA].models[0]
    expect(stat(s, SHA, trooper, 'M', null, 6)).toBe(6)
    issue(ctx, `${MOVE}@${SHA}`)
    expect(stat(s, SHA, trooper, 'M', null, 6)).toBe(9)
  })

  it('AST-006 AST-2.5: Take Cover! — Shock Troops 5+ → 4+, Battery 4+ → 3+, Sentinel 2+ stays 2+, a 3+ model stays 3+ (never better than 3+)', () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    issue(ctx, `${COVER}@all`)
    expect(stat(s, SHA, s.units[SHA].models[0], 'Sv', null, 5)).toBe(4)
    expect(stat(s, BAT, s.units[BAT].models[0], 'Sv', null, 4)).toBe(3)
    expect(stat(s, SEN, s.units[SEN].models[0], 'Sv', null, 2)).toBe(2)
    expect(stat(s, SHB, s.units[SHB].models[0], 'Sv', null, 3)).toBe(3)
  })

  it('AST-007 AST-2.3: a second Order issued to an ordered unit replaces the first (EffectExpired for the old one)', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    const { ctx, events } = ctxOf(s)
    issue(ctx, `${AIM}@${SHA}`)
    s.phaseState.marks = []
    issue(ctx, `${MOVE}@${SHA}`)
    expect(of(events, 'EffectExpired')).toHaveLength(1)
    const orders = [...s.units[SHA].effects, ...s.units[KARSK].effects].map((e) => e.sourceAbilityId)
    expect(orders).toEqual([MOVE])
    expect(lasgunBS(s, SHA)).toBe(4)
  })

  it('AST-008 AST-2.4: the ordered unit fails a battle-shock test → the Order is removed at once', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    const { ctx } = ctxOf(s, [1, 1])
    issue(ctx, `${AIM}@${SHA}`)
    expect(lasgunBS(s, SHA)).toBe(3)
    expect(hookService.battleShockTest(ctx, SHA, 'test')).toBe(false)
    expect(lasgunBS(s, SHA)).toBe(4)
    expect(s.units[SHA].effects.concat(s.units[KARSK].effects)).toHaveLength(0)
  })

  it('AST-009 AST-2.4: an Order issued to a unit already Battle-shocked still applies', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    s.units[SHA].battleShocked = true
    const { ctx } = ctxOf(s)
    issue(ctx, `${AIM}@${SHA}`)
    expect(lasgunBS(s, SHA)).toBe(3)
  })

  it('AST-010 AST-2.2: an unattached Command Squad Karsk is not an eligible target (no REGIMENT); the attached one is', () => {
    const s = makeState({ a: { ...gunnery, attachments: [] } })
    deployArmy(s)
    placeUnit(s, KARSK, { x: -12, z: -3.5, gap: 0.3 })
    placeUnit(s, BAT, [[-11, -1.5], [-9.5, -1.5]])
    expect(hookService.offerPicks(ctxOf(s).ctx, 'command.end', 'end')).toBe(true)
    const ids = optionIds(s)
    expect(ids.some((i) => i.endsWith(`@${KARSK}`))).toBe(false)
    expect(ids).toContain(`${AIM}@${BAT}`)
    const t = makeState({ a: gunnery })
    deployArmy(t)
    expect(hookService.offerPicks(ctxOf(t).ctx, 'command.end', 'end')).toBe(true)
    expect(optionIds(t)).toContain(`${AIM}@${SHA}`)
  })

  it('AST-039 AST-2.3: an Order expires at the start of the next own turn even when no new Order is issued', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    const { ctx, events } = ctxOf(s)
    issue(ctx, `${COVER}@${SHA}`)
    effectService.expire(ctx, 'nextOwnTurn', 'B') // the opponent's turn start does not end it
    expect(stat(s, SHA, s.units[SHA].models[0], 'Sv', null, 5)).toBe(4)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(of(events, 'EffectExpired').length).toBeGreaterThan(0)
    expect(stat(s, SHA, s.units[SHA].models[0], 'Sv', null, 5)).toBe(5)
  })

  it('AST-038 AST-2.5: Take Aim! only touches ranged BS — a melee weapon\'s WS and BS query are unchanged', () => {
    const s = makeState({ a: gunnery })
    deployArmy(s)
    issue(ctxOf(s).ctx, `${AIM}@${SHA}`)
    const m = s.units[SHA].models[0]
    expect(stat(s, SHA, m, 'WS', 'am.w.close-combat-weapon', 4)).toBe(4)
    expect(stat(s, SHA, m, 'BS', 'am.w.close-combat-weapon', 4)).toBe(4)
  })
})

// =====================================================================================================================
describe('enhancements (AST-3)', () => {
  it('AST-011 AST-3.1: Command Laurels — +1 CP in the own Command phase while Karsk is on the board; discarded when the R-4.2 cap is used; none after Karsk dies', () => {
    const s = makeState()
    deployArmy(s)
    s.players.A.cp = 3
    const { ctx } = ctxOf(s)
    hookService.run(ctx, 'onCommandPhase', {})
    expect(s.players.A.cp).toBe(4)
    hookService.run(ctx, 'onCommandPhase', {}) // second gain in the same round: capped
    expect(s.players.A.cp).toBe(4)
    const t = makeState()
    deployArmy(t)
    removeModel(t, KM)
    t.players.A.cp = 3
    hookService.run(ctxOf(t).ctx, 'onCommandPhase', {})
    expect(t.players.A.cp).toBe(3)
  })

  it('AST-012 AST-3.1: Command Laurels — one Order reaches every friendly AM unit on the board (Sentinel 30" away, Battery included)', () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'command.end', 'end')).toBe(true)
    expect(optionIds(s).sort()).toEqual([`${AIM}@all`, `${COVER}@all`, `${MOVE}@all`, 'decline'].sort())
    answerOption(ctx, `${AIM}@all`)
    for (const id of [SHA, SHB, BAT, SEN]) expect(s.units[id].effects.map((e) => e.sourceAbilityId)).toContain(AIM)
    expect(stat(s, SEN, s.units[SEN].models[0], 'BS', 'am.w.hunter-killer-missile', 4)).toBe(3)
  })

  it('AST-013 AST-3.0: the bearer is the Karsk model — veterans alive and Karsk dead → no Laurels CP and no Gunnery aura', () => {
    const s = makeState(); deployArmy(s); removeModel(s, KM); s.players.A.cp = 1
    hookService.run(ctxOf(s).ctx, 'onCommandPhase', {})
    expect(s.players.A.cp).toBe(1)
    const g = makeState({ a: gunnery }); deployArmy(g); removeModel(g, KM)
    const entry = sourcesFor(g).find((e) => e.code === 'gunneryOfficer')
    expect(entry).toBeUndefined()
  })

  it('AST-014 AST-3.2: Gunnery Officer — Battery within 6" of Karsk\'s unit re-rolls attack-count dice; beyond 6" it does not', () => {
    const s = makeState({ a: gunnery }); deployArmy(s)
    const entry = () => sourcesFor(s).find((e) => e.code === 'gunneryOfficer')!
    const hook = codeHooks.gunneryOfficer
    const bat = s.units[BAT].models[0]
    expect(hook.rerollsAttackCount!(s, entry(), bat, s.weapons['am.w.bombast-field-gun'])).toBe(true)
    placeUnit(s, BAT, [[10, 8], [11.5, 8]])
    expect(hook.rerollsAttackCount!(s, entry(), bat, s.weapons['am.w.bombast-field-gun'])).toBe(false)
  })

  it('AST-015 AST-3.2: Gunnery Officer — a Battery in the aura that has never attacked is a Lone Operative; out of the aura it is not', () => {
    const s = makeState({ a: gunnery }); deployArmy(s)
    const entry = () => sourcesFor(s).find((e) => e.code === 'gunneryOfficer')!
    expect(codeHooks.gunneryOfficer.grantsCoreAbility!(s, entry(), BAT)).toEqual(['LONE_OPERATIVE'])
    expect(codeHooks.gunneryOfficer.grantsCoreAbility!(s, entry(), SEN)).toEqual([])
    placeUnit(s, BAT, [[10, 8], [11.5, 8]])
    expect(codeHooks.gunneryOfficer.grantsCoreAbility!(s, entry(), BAT)).toEqual([])
  })

  it('AST-015 AST-3.2: Lone Operative on the Battery — an 18" ranged enemy 13" away has no target option on it, one 11" away does (with and without the aura)', () => {
    // the shooting phase reads terrain and blocking models straight from the state, so clear the board and put the enemy in the Battery's row
    const targetsOnBattery = (a: Partial<PlayerSetup>, gap: number): boolean => {
      const s = makeState({ a }); deployArmy(s); placeUnit(s, SHB, { x: 18, z: 12, gap: 0.3 })
      s.board = { ...s.board, pieces: {} }
      s.phase = 'shooting'; s.activePlayer = 'B'
      placeUnit(s, BOYZ, { x: 30, z: -6.5, gap: 0.3 })
      const shooters = s.units[BOYZ].models.filter((id) => s.models[id].weapons.includes('ork.w.shoota'))
      const near = Math.min(...s.units[BAT].models.flatMap((b) => shooters.map((o) => distance(s.models[b], s.models[o]))))
      for (const id of s.units[BOYZ].models) s.models[id].pos = { ...s.models[id].pos, x: s.models[id].pos.x - (near - gap) }
      const { ctx } = createContext(s, new ScriptedRng([]), { ...DEFAULT_MODULES })
      return buildShootingWeaponEntries(ctx, BOYZ).some((e) => e.weaponId === 'ork.w.shoota' && e.legalTargets.includes(BAT))
    }
    expect(targetsOnBattery(gunnery, 11)).toBe(true)
    expect(targetsOnBattery(gunnery, 13)).toBe(false)
    // without the Gunnery Officer the Battery is an ordinary target at 13" (the shoota reaches 18")
    expect(targetsOnBattery({}, 13)).toBe(true)
  })

  it('AST-016 AST-3.2: Gunnery Officer — Lone Operative is lost once a Battery model has made any attack', () => {
    const s = makeState({ a: gunnery }); deployArmy(s)
    const entry = () => sourcesFor(s).find((e) => e.code === 'gunneryOfficer')!
    expect(modelHasAttacked(s, s.units[BAT].models[0])).toBe(false)
    recordModelAttacked(s, s.units[BAT].models[0])
    expect(codeHooks.gunneryOfficer.grantsCoreAbility!(s, entry(), BAT)).toEqual([])
  })

  it('AST-017 AST-3.2: Gunnery Officer — +1 CP in the Command phase, and Orders stay limited to one unit within 6" (no Laurels broadcast)', () => {
    const s = makeState({ a: gunnery }); deployArmy(s); s.players.A.cp = 2
    const { ctx } = ctxOf(s)
    hookService.run(ctx, 'onCommandPhase', {})
    expect(s.players.A.cp).toBe(3)
    expect(hookService.offerPicks(ctx, 'command.end', 'end')).toBe(true)
    expect(optionIds(s).some((i) => i.endsWith('@all'))).toBe(false)
  })
})

// =====================================================================================================================
describe('secondary objectives (AST-4)', () => {
  // A's deployment zone centre, and a point `out` inches beyond its board-centre-facing edge
  function zoneSpot(s: GameState, out: number): { x: number; z: number } {
    const zone = deploymentZone(s, 'A')
    const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
    if (Math.abs(cx) >= Math.abs(cz)) return { x: cx < 0 ? Math.max(...xs) + out : Math.min(...xs) - out, z: cz }
    return { x: cx, z: cz < 0 ? Math.max(...zs) + out : Math.min(...zs) - out }
  }
  function centre(s: GameState): { x: number; z: number } { return zoneSpot(s, -2.5) }
  function endOpponentTurn(s: GameState): number {
    s.activePlayer = 'B'
    s.phase = 'fight'
    s.phaseState = emptyPhaseState()
    const before = s.players.A.vp
    missionService.onWindow(ctxOf(s).ctx, 'turn.end', 'k')
    return s.players.A.vp - before
  }
  const put = (s: GameState, id: string, p: { x: number; z: number }) => placeUnit(s, id, [[p.x, p.z]])

  it('AST-018 AST-4.1: Hold the Line — nothing wholly within 6" → 5 VP; one wholly within 6" but not in the zone → 3; wholly in the zone → 0', () => {
    const far = makeState(); put(far, BOSS, zoneSpot(far, 14))
    expect(endOpponentTurn(far)).toBe(5)
    const near = makeState(); put(near, BOSS, zoneSpot(near, 3))
    expect(endOpponentTurn(near)).toBe(3)
    const inside = makeState(); put(inside, BOSS, centre(inside))
    expect(endOpponentTurn(inside)).toBe(0)
  })

  it('AST-019 AST-4.1: Hold the Line ignores Battle-shocked enemies and never scores at the end of the owner\'s own turn', () => {
    const s = makeState(); put(s, BOSS, centre(s))
    s.units[BOSS].battleShocked = true
    expect(endOpponentTurn(s)).toBe(5)
    const t = makeState(); put(t, BOSS, zoneSpot(t, 14))
    t.activePlayer = 'A'; t.phase = 'fight'; t.phaseState = emptyPhaseState()
    missionService.onWindow(ctxOf(t).ctx, 'turn.end', 'k')
    expect(t.players.A.vp).toBe(0)
  })

  const MD = { secondaryId: 'am.sec.methodical-destruction' }
  // the Orks' Waaagh! pick shares the round.start window: decline it
  function settle(s: GameState, ctx: EngineContext): void {
    while (s.pending && (s.pending as ChooseOptionDecision).context.topic === 'waaagh') answerOption(ctx, 'wait')
  }
  function startRound(s: GameState, ctx: EngineContext): void {
    missionService.onWindow(ctx, 'round.start', 'r')
  }

  it('AST-020 AST-4.2: Methodical Destruction — the round-start pick lists canonical enemy units; the target destroyed that round scores 4 VP at round end, a survivor 0', () => {
    const s = makeState({ a: MD }); deployArmy(s); put(s, BOSS, zoneSpot(s, 14)); put(s, BOYZ, zoneSpot(s, 20))
    const { ctx } = ctxOf(s)
    startRound(s, ctx)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    expect(optionIds(s)).toContain(BOYZ)
    expect(optionIds(s)).toContain(BOSS)
    answerOption(ctx, BOYZ)
    settle(s, ctx)
    expect(s.pending).toBeNull()
    destroyUnit(s, BOYZ)
    missionService.onWindow(ctx, 'round.end', 'r')
    expect(s.players.A.vp).toBe(4)
    // a survivor scores nothing
    const t = makeState({ a: MD }); deployArmy(t); put(t, BOYZ, zoneSpot(t, 20))
    const c2 = ctxOf(t).ctx
    startRound(t, c2)
    answerOption(c2, BOYZ)
    settle(t, c2)
    missionService.onWindow(c2, 'round.end', 'r')
    expect(t.players.A.vp).toBe(0)
  })

  it('AST-021 AST-4.2: Methodical Destruction on an attached pair — only the bodyguard destroyed → 0 VP; both halves → 4', () => {
    const enemy = { faction: 'astra-militarum', patrolId: 'am.cp.karsks-gunners', enhancementId: 'am.e.command-laurels', secondaryId: 'am.sec.hold-the-line', attachments: [{ leaderRef: 'karsk', bodyguardRef: 'shock-a' }] }
    const BG = 'B:shock-a', LD = 'B:karsk'
    const build = () => { const s = makeState({ a: MD, b: enemy }); deployArmy(s); placeUnit(s, BG, { x: 6, z: 8, gap: 0.3 }); placeUnit(s, LD, { x: 6, z: 10, gap: 0.3 }); return s }
    const s = build()
    expect(leaderService.halves(s, BG)).toHaveLength(2)
    const { ctx } = ctxOf(s)
    startRound(s, ctx)
    expect(optionIds(s).filter((i) => i === BG || i === LD)).toEqual([BG]) // the pair is one candidate
    answerOption(ctx, BG)
    settle(s, ctx)
    destroyUnit(s, BG)
    missionService.onWindow(ctx, 'round.end', 'r')
    expect(s.players.A.vp).toBe(0)
    const t = build()
    const c2 = ctxOf(t).ctx
    startRound(t, c2)
    answerOption(c2, BG)
    settle(t, c2)
    destroyUnit(t, BG); destroyUnit(t, LD)
    missionService.onWindow(c2, 'round.end', 'r')
    expect(t.players.A.vp).toBe(4)
  })
})

// =====================================================================================================================
describe('patrol stratagems (AST-5)', () => {
  it('AST-022 AST-5.1: Send in the Next Wave — offered in the own Movement phase only when a Shock Troops unit is destroyed; a fresh 10-model copy with the original loadouts', () => {
    const s = makeState(); deployArmy(s); placeUnit(s, BOYZ, { x: 14, z: -10, gap: 0.3 })
    phase(s, 'movement', 'A', { A: 3 })
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toHaveLength(0)
    const original = s.units[SHB].models.map((id) => s.models[id].weapons.join('+'))
    destroyUnit(s, SHB)
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toEqual([[SHB]])
    expect(offeredIds(s, 'B', 'movement.end', NEXT)).toHaveLength(0)
    const h = stratHarness(s)
    expect(stratagemService.openWindow(h.ctx, 'movement.end', 'A', 'x', {})).toBe(true)
    expect(h.useOption(NEXT, SHB)).toBeNull()
    const copy = Object.values(s.units).find((u) => u.id.startsWith(`${SHB}~`))!
    expect(copy.models).toHaveLength(10)
    expect(copy.models.map((id) => s.models[id].weapons.join('+'))).toEqual(original)
    expect(copy.models.every((id) => s.models[id].woundsRemaining === 1)).toBe(true)
    expect(copy.models.some((id) => s.units[SHB].models.includes(id))).toBe(false)
    expect(pendingReactions(s, 'nextWave')).toHaveLength(1)
    expect(s.players.A.cp).toBe(2)
  })

  it('AST-024 AST-5.1: Next Wave is usable in round 1, can target the same destroyed unit again later, and is never offered for Command Squad Karsk or the Battery', () => {
    const s = makeState({ round: 1 }); deployArmy(s)
    phase(s, 'movement', 'A', { A: 3 })
    destroyUnit(s, BAT)
    destroyUnit(s, KARSK)
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toHaveLength(0)
    destroyUnit(s, SHB)
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toEqual([[SHB]])
    s.round = 3
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toEqual([[SHB]])
  })

  it('AST-025 AST-5.2: Bring It Down — AM attacks against the chosen enemy get the hit re-roll; other targets and Battle-shocked units at use time do not', () => {
    const s = makeState(); deployArmy(s); placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 }); placeUnit(s, BOYZ2, { x: -6, z: 13, gap: 0.3 })
    s.units[BAT].battleShocked = true
    phase(s, 'shooting', 'A', { A: 2 })
    expect(offeredIds(s, 'A', 'shooting.start', BID).map((t) => t[0]).sort()).toEqual([BOYZ, BOYZ2].sort())
    const h = stratHarness(s)
    expect(stratagemService.openWindow(h.ctx, 'shooting.start', 'A', 'x', {})).toBe(true)
    expect(h.useOption(BID, BOYZ)).toBeNull()
    const rerolls = (attackerModel: string, weapon: string, target: string) =>
      hookService.collect(h.ctx, 'onHitRoll', { attack: attackCtx(s, attackerModel, weapon, target), roll: rollOf(2, 'hit') })
        .filter((r) => r.result.kind === 'roll' && (r.result as { reroll?: string }).reroll === 'all').length
    const trooper = s.units[SHB].models[0]
    expect(rerolls(trooper, 'am.w.lasgun', BOYZ)).toBe(1)
    expect(rerolls(trooper, 'am.w.lasgun', BOYZ2)).toBe(0)
    expect(rerolls(s.units[BAT].models[0], 'am.w.bombast-field-gun', BOYZ)).toBe(0)
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(rerolls(trooper, 'am.w.lasgun', BOYZ)).toBe(0)
  })

  it('AST-027 AST-5.3: Artillery Strike — only at the opponent\'s command.start, 2 CP, once per battle, targets the Karsk model only (AST-033)', () => {
    const s = makeState(); deployArmy(s)
    phase(s, 'command', 'A', { A: 3 })
    expect(offeredIds(s, 'A', 'command.start', ARTY)).toHaveLength(0) // own turn
    phase(s, 'command', 'B', { A: 1 })
    expect(offeredIds(s, 'A', 'command.start', ARTY)).toHaveLength(0) // 1 CP is not enough
    s.players.A.cp = 3
    expect(offeredIds(s, 'A', 'command.start', ARTY)).toEqual([[KM]])
    const h = stratHarness(s)
    expect(stratagemService.openWindow(h.ctx, 'command.start', 'A', 'x', {})).toBe(true)
    expect(h.useOption(ARTY, KM)).toBeNull()
    expect(s.players.A.cp).toBe(1)
    s.players.A.cp = 3
    expect(offeredIds(s, 'A', 'command.start', ARTY)).toHaveLength(0) // once per battle
    // no OFFICER model on the board → not offered
    const t = makeState(); deployArmy(t); removeModel(t, KM)
    phase(t, 'command', 'B', { A: 3 })
    expect(offeredIds(t, 'A', 'command.start', ARTY)).toHaveLength(0)
  })

  it('AST-026 AST-5.3: Artillery Strike — enemy M halved, Advance halved, no charge, ranged hit -1 (melee unaffected), all gone at turn end', () => {
    const s = makeState(); deployArmy(s); placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 })
    phase(s, 'command', 'B', { A: 3 })
    const h = stratHarness(s)
    expect(stratagemService.openWindow(h.ctx, 'command.start', 'A', 'x', {})).toBe(true)
    expect(h.useOption(ARTY, KM)).toBeNull()
    const boy = s.units[BOYZ].models[0]
    expect(stat(s, BOYZ, boy, 'M', null, 6)).toBe(3)
    expect(stat(s, BOYZ, boy, 'M', null, 5)).toBe(3)
    const hs = hookService as unknown as { chargeForbidden?: (state: GameState, unitId: string) => boolean; advanceRollFor?: (state: GameState, unitId: string, rolled: number) => number }
    expect(hs.chargeForbidden?.(s, BOYZ)).toBe(true)
    expect(hs.advanceRollFor?.(s, BOYZ, 5)).toBe(3)
    const ranged = hookService.collect(h.ctx, 'onHitRoll', { attack: { ...attackCtx(s, boy, 'ork.w.shoota', SHA), attackerUnitId: BOYZ }, roll: rollOf(4, 'hit') })
    expect(ranged.some((r) => (r.result as { modifier?: number }).modifier === -1)).toBe(true)
    effectService.expire(h.ctx, 'turnEnd', null)
    expect(stat(s, BOYZ, boy, 'M', null, 6)).toBe(6)
    expect(hs.chargeForbidden?.(s, BOYZ)).toBe(false)
  })
})

// =====================================================================================================================
describe('datasheet abilities (AST-6)', () => {
  it('AST-028 AST-6.5: Rearm, Reload, Fire — Battery with an Order that stood still gets Sustained Hits 1 on Heavy guns; moved, no Order, other weapons or the opponent\'s turn → none', () => {
    const s = makeState(); deployArmy(s)
    const bat = s.units[BAT].models[0]
    const sustained = (w: string) => hookService.weaponAbilitiesFor(s, bat, s.weapons[w]).some((a) => a.ability === 'SUSTAINED_HITS')
    s.units[BAT].turn.moveType = 'stationary'
    expect(sustained('am.w.bombast-field-gun')).toBe(false) // no Order yet
    issue(ctxOf(s).ctx, `${AIM}@all`)
    expect(sustained('am.w.bombast-field-gun')).toBe(true)
    expect(sustained('am.w.malleus-rocket-launcher')).toBe(true)
    expect(sustained('am.w.battery-close-combat-weapons')).toBe(false)
    s.units[BAT].turn.moveType = 'normal'
    expect(sustained('am.w.bombast-field-gun')).toBe(false)
    s.units[BAT].turn.moveType = 'stationary'
    s.activePlayer = 'B'
    expect(sustained('am.w.bombast-field-gun')).toBe(false)
  })

  it('AST-030 AST-6.2: Medi-pack — Karsk\'s attached unit has Feel No Pain 6+ while the medic lives; medic destroyed → none', () => {
    const s = makeState(); deployArmy(s)
    placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 })
    const fnp = () => hookService.collect(ctxOf(s).ctx, 'onFeelNoPainRoll', { attack: attackCtx(s, s.units[BOYZ].models[0], 'ork.w.shoota', SHA), roll: rollOf(6, 'fnp') })
      .filter((r) => (r.result as { feelNoPain?: number }).feelNoPain !== undefined).length
    expect(fnp()).toBe(1)
    const medic = s.units[KARSK].models.find((id) => s.models[id].datasheetModelId === 'veteran-medic')!
    removeModel(s, medic)
    expect(fnp()).toBe(0)
  })

  it('AST-031 AST-6.3: Regimental Standard — Shock Troops OC 3, Karsk\'s unit OC 2 while the bearer lives; destroyed → base OC', () => {
    const s = makeState(); deployArmy(s)
    const trooper = s.units[SHA].models[0]
    expect(stat(s, SHA, trooper, 'OC', null, 2)).toBe(3)
    expect(stat(s, KARSK, s.units[KARSK].models[1], 'OC', null, 1)).toBe(2)
    const bearer = s.units[KARSK].models.find((id) => s.models[id].datasheetModelId === 'veteran-standard')!
    removeModel(s, bearer)
    expect(stat(s, SHA, trooper, 'OC', null, 2)).toBe(2)
    expect(stat(s, KARSK, s.units[KARSK].models[1], 'OC', null, 1)).toBe(1)
  })
})

// =====================================================================================================================
// Real-data checks: per-model Epic Challenge, Mobile Hunter-killers, Sentinel / Battery wargear, Next Wave with no room
describe('real patrol data (AST-033..036, AST-040)', () => {
  const atkModules = (visible = true): ModuleTable => ({
    ...DEFAULT_MODULES,
    services: {
      ...DEFAULT_MODULES.services,
      stratagems: recordingStratagems(),
      los: { ...DEFAULT_MODULES.services.los, visible: () => visible, unitVisible: () => visible, fullyVisible: () => visible, unitFullyVisible: () => visible, benefitOfCover: () => false },
    },
  })
  const atkTarget = (modelId: string, weaponId: string, targetUnitId: string): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks: null })
  function driveAttack(ctx: EngineContext): void {
    let r = attackService.advance(ctx)
    for (let guard = 0; r === 'pending'; guard++) {
      if (guard > 500) throw new Error('driveAttack: too many decisions')
      const pending = ctx.state.pending
      if (!pending) throw new Error('pending without decision')
      const action = ('options' in pending && pending.options.length > 0 ? pending.options[0].action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
      ctx.state.pending = null
      const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
      const rej = owner.handle(ctx, action, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      r = attackService.advance(ctx)
    }
  }
  const SIX = Array.from({ length: 120 }, () => 6)
  function fire(s: GameState, dice: number[], attackerUnit: string, modelId: string, weaponId: string, targetUnit: string, visible = true): GameEvent[] {
    s.phase = 'shooting'; s.activePlayer = 'A'
    const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...SIX]), atkModules(visible))
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: attackerUnit, overwatch: false, targets: [atkTarget(modelId, weaponId, targetUnit)] })
    driveAttack(ctx)
    return events
  }
  const holder = (s: GameState, unitId: string, weaponId: string) => s.units[unitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const minGap = (s: GameState, a: string, b: string) => Math.min(...s.units[a].models.flatMap((x) => s.units[b].models.map((y) => distance(s.models[x], s.models[y]))))
  // slide a row-shaped unit along z until its nearest model is `gap` inches from the unit `from`
  function placeAtGap(s: GameState, unitId: string, from: string, gap: number, x: number): void {
    placeUnit(s, unitId, { x, z: 30, gap: 0.3 })
    const dz = minGap(s, from, unitId) - gap
    for (const id of s.units[unitId].models) s.models[id].pos = { ...s.models[id].pos, z: s.models[id].pos.z - dz }
  }

  it('AST-033 AST-6.1: Epic Challenge lists only the Karsk model and gives Precision to Karsk\'s melee weapons, not to a veteran\'s', () => {
    const s = makeState(); deployArmy(s)
    // the Ork patrol has no Leader pairing, so join the Warboss to the Boyz by hand: only the AM side is under test
    s.units[BOSS].bodyguardUnitId = BOYZ; s.units[BOYZ].attachedLeaderId = BOSS
    placeUnit(s, BOYZ, { x: -12, z: 0.6, gap: 0.3 }); placeUnit(s, BOSS, [[-12, 2.4]])
    phase(s, 'fight', 'A', { A: 1 })
    const picks = offeredIds(s, 'A', 'fight.unitSelected', 'core.s.epic-challenge', { unitId: KARSK })
    expect(picks.length).toBeGreaterThan(0)
    expect(picks.every((t) => t[1] === KM)).toBe(true)
    const h = stratHarness(s)
    expect(stratagemService.openWindow(h.ctx, 'fight.unitSelected', 'A', 'x', { unitId: KARSK })).toBe(true)
    expect(h.useOption('core.s.epic-challenge', KM)).toBeNull()
    const meleeOf = (id: string) => s.models[id].weapons.filter((w) => s.weapons[w].kind === 'melee')
    const vet = s.units[KARSK].models[1]
    expect(meleeOf(KM).length).toBeGreaterThan(0)
    expect(meleeOf(vet).length).toBeGreaterThan(0)
    const precision = (m: string, w: string) => hookService.weaponAbilitiesFor(s, m, s.weapons[w]).some((a) => a.ability === 'PRECISION')
    expect(meleeOf(KM).every((w) => precision(KM, w))).toBe(true)
    expect(meleeOf(vet).some((w) => precision(vet, w))).toBe(false)
    // the Karsk model's ranged weapons never gain it, and it ends with the phase
    expect(s.models[KM].weapons.filter((w) => s.weapons[w].kind === 'ranged').some((w) => precision(KM, w))).toBe(false)
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(meleeOf(KM).some((w) => precision(KM, w))).toBe(false)
  })

  it('AST-034 AST-6.7: Mobile Hunter-killers — Sentinel wound re-roll against VEHICLE targets, none against INFANTRY', () => {
    const s = makeState(); deployArmy(s)
    placeUnit(s, BOYZ, { x: 14, z: 10, gap: 0.3 }); placeUnit(s, DREAD, [[22, 4]])
    const sen = s.units[SEN].models[0]
    const woundRerolls = (model: string, weapon: string, target: string) =>
      hookService.collect(ctxOf(s).ctx, 'onWoundRoll', { attack: attackCtx(s, model, weapon, target), roll: rollOf(2, 'wound') })
        .filter((r) => r.result.kind === 'roll' && (r.result as { reroll?: string }).reroll === 'all').length
    expect(woundRerolls(sen, 'am.w.plasma-cannon', DREAD)).toBe(1)
    expect(woundRerolls(sen, 'am.w.plasma-cannon', BOYZ)).toBe(0)
    // another AM unit does not have it
    expect(woundRerolls(s.units[SHB].models[0], 'am.w.lasgun', DREAD)).toBe(0)
  })

  it('AST-035 AST-6.7: hunter-killer is One Shot, the plasma cannon supercharge is Hazardous, Deadly Demise 1 on the Sentinel', () => {
    const s = makeState(); deployArmy(s); placeUnit(s, BOYZ, { x: 16, z: 18, gap: 0.3 }); placeUnit(s, DREAD, [[22, 10]])
    const sen = s.units[SEN].models[0]
    const abilities = (w: string) => hookService.weaponAbilitiesFor(s, sen, s.weapons[w]).map((a) => a.ability)
    expect(abilities('am.w.hunter-killer-missile')).toContain('ONE_SHOT')
    expect(abilities('am.w.plasma-cannon-supercharge')).toContain('HAZARDOUS')
    expect(abilities('am.w.plasma-cannon')).not.toContain('HAZARDOUS')
    // One Shot: fired once, then it drops out of the shooting options
    const entries = () => buildShootingWeaponEntries(createContext(s, new ScriptedRng([]), atkModules()).ctx, SEN).map((e) => e.weaponId)
    expect(entries()).toContain('am.w.hunter-killer-missile')
    fire(s, [], SEN, sen, 'am.w.hunter-killer-missile', DREAD)
    expect(s.models[sen].oneShotUsed).toContain('am.w.hunter-killer-missile')
    expect(entries()).not.toContain('am.w.hunter-killer-missile')
    expect(entries()).toContain('am.w.plasma-cannon')
    // Hazardous: only the supercharged profile is tested
    expect(of(fire(s, [], SEN, sen, 'am.w.plasma-cannon', DREAD), 'HazardousTested')).toHaveLength(0)
    expect(of(fire(s, [], SEN, sen, 'am.w.plasma-cannon-supercharge', DREAD), 'HazardousTested').some((e) => e.weaponId === 'am.w.plasma-cannon-supercharge')).toBe(true)
    // Deadly Demise 1: a 6 hurts every unit within 6" for exactly 1 mortal wound
    const t = makeState(); deployArmy(t); placeUnit(t, BOYZ, [[17, 10], [18.5, 10]]); placeUnit(t, DREAD, [[40, 25]])
    t.phase = 'shooting'
    expect(datasheetOf(t, SEN).coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE')).toMatchObject({ ability: 'DEADLY_DEMISE', value: 1 })
    const queued: { unitId: string; count: number }[] = []
    const spy = vi.spyOn(attackService, 'queueMortalWounds').mockImplementation((_c, unitId, count) => { queued.push({ unitId, count }) })
    try {
      const { ctx, events } = createContext(t, new ScriptedRng([6]), atkModules())
      attackService.destroyModel(ctx, t.units[SEN].models[0], { player: 'B', unitId: BOYZ, modelId: t.units[BOYZ].models[0], kind: 'ranged' })
      expect(of(events, 'DeadlyDemiseRolled')[0]).toMatchObject({ exploded: true })
      expect(queued.filter((q) => q.unitId === BOYZ)).toEqual([{ unitId: BOYZ, count: 1 }])
    } finally { spy.mockRestore() }
  })

  it('AST-036 AST-6: real weapons — meltagun +2 D at half range, frag Blast, bombast Indirect Fire, flamer Torrent, lasgun Rapid Fire 1', () => {
    // meltagun D6+2 inside 6", plain D6 beyond
    const melta = (gap: number) => {
      const s = makeState(); deployArmy(s)
      const m = holder(s, SHA, 'am.w.meltagun')
      const dread = s.units[DREAD].models[0]
      s.models[m].pos = { ...s.models[m].pos, x: 12, z: -10 }
      placeUnit(s, DREAD, [[12, 12]])
      s.models[dread].pos = { ...s.models[dread].pos, z: s.models[dread].pos.z - (distance(s.models[m], s.models[dread]) - gap) }
      const ev = fire(s, [6, 6, 1, 3], SHA, m, 'am.w.meltagun', DREAD)
      return of(ev, 'DamageApplied').filter((d) => !d.mortal).reduce((n, d) => n + d.amount, 0)
    }
    expect(melta(4)).toBe(5)
    expect(melta(9)).toBe(3)
    // frag launcher: D3 attacks +2 against a 10-model unit
    const blast = makeState(); deployArmy(blast); placeUnit(blast, BOYZ, { x: -12, z: 20, gap: 0.3 })
    expect(of(fire(blast, [4], SHB, holder(blast, SHB, 'am.w.grenade-launcher-frag'), 'am.w.grenade-launcher-frag', BOYZ), 'HitRolled')).toHaveLength(4)
    // flamer: Torrent auto-hits D6 attacks without a hit roll
    const flame = makeState(); deployArmy(flame); placeUnit(flame, BOYZ, { x: -12, z: 4.5, gap: 0.3 })
    const fl = of(fire(flame, [3], SHA, holder(flame, SHA, 'am.w.flamer'), 'am.w.flamer', BOYZ), 'HitRolled')
    expect(fl).toHaveLength(3)
    expect(fl.every((h) => h.auto && h.hit)).toBe(true)
    // bombast: Indirect Fire at a target no model can see is -1 to hit
    const bomb = (visible: boolean) => {
      const s = makeState(); deployArmy(s); placeUnit(s, BOYZ, { x: -12, z: 8, gap: 0.3 }); s.units[BAT].turn.moveType = 'stationary'
      return of(fire(s, [3, 6], BAT, s.units[BAT].models[0], 'am.w.bombast-field-gun', BOYZ, visible), 'HitRolled')[0]
    }
    expect(bomb(true).final - bomb(false).final).toBe(1)
    // lasgun: Rapid Fire 1 adds an attack only inside half range (12")
    const rf = (gap: number) => {
      const s = makeState(); deployArmy(s); placeAtGap(s, BOYZ, SHB, gap, -12)
      return of(fire(s, [], SHB, holder(s, SHB, 'am.w.lasgun'), 'am.w.lasgun', BOYZ), 'HitRolled').length
    }
    expect(rf(5)).toBe(2)
    expect(rf(16)).toBe(1)
  })

  it('AST-040 AST-5.1: Send in the Next Wave is not offered when the strip has no legal set-up', () => {
    const s = makeState(); deployArmy(s); phase(s, 'movement', 'A', { A: 3 })
    destroyUnit(s, SHB)
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toEqual([[SHB]])
    // a strip too shallow to hold a 32 mm base leaves no legal place for any model
    s.stratagems = { ...s.stratagems, [NEXT]: { ...s.stratagems[NEXT], params: { ...(s.stratagems[NEXT].params ?? {}), depth: 1 } } }
    expect(offeredIds(s, 'A', 'movement.end', NEXT)).toHaveLength(0)
  })
})
