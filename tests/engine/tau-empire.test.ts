// T'au Empire: Protectors of Aun'shar (docs/spec/factions/tau-empire.md, 12-checklist TAU-001..TAU-040). Real Combat Patrol data;
// covers the (b) code hooks: For the Greater Good, Forward Observers, Coordinated Leadership, Cover Fire, DS8 Support Turret,
// Kauyon Lure, Leadership Caste, Rapid Repositioning, Laser-Marked Targets.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, deploymentZone, emptyPhaseState, removeModel,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameState, type GameSetup,
  type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService, shotThisTurn } from '../../src/engine/attack'
import { weaponService } from '../../src/engine/weapons'
import { buildShootingWeaponEntries, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { datasheetOf, modelStats } from '../../src/engine/state'
import { codeHooks, pendingReactions } from '../../src/engine/code-hooks'
import { hookService, sourcesFor } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { stratagemService } from '../../src/engine/stratagems'
import { chargeModule } from '../../src/engine/phases/charge'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TAU = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: "T'au Empire", faction: 'tau-empire', patrolId: 'tau.cp.protectors-of-aun-shar', enhancementId: 'tau.e.ds13-experimental-drone', secondaryId: 'tau.sec.kauyon-lure',
  attachments: [{ leaderRef: 'fireblade', bodyguardRef: 'strike-team' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const AUN = 'A:aunshar', FIRE = 'A:fireblade', ST = 'A:strike-team', STH = 'A:stealth', GK = 'A:ghostkeel'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss'
const FO = 'tau.a.forward-observers'
const CORE_OW = 'core.s.fire-overwatch'
const FUSIL = 'tau.s.defensive-fusillade', REPO = 'tau.s.rapid-repositioning', LASER = 'tau.s.laser-marked-targets'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; bundle?: DataBundle }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TAU(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, o.bundle ?? bundle, 'tau', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}

// every service sees everything, no terrain: the hooks under test only ask yes/no visibility questions
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

// Strike Team (with the Fireblade) at x, Stealth and Ghostkeel behind it, Boyz in front, Aun'Shar in the rear
function deployArmy(s: GameState): void {
  placeUnit(s, ST, { x: -6, z: 0, gap: 0.3 })
  placeUnit(s, FIRE, [[-6, 2]])
  placeUnit(s, STH, [[-8, 6], [-9.5, 6], [-11, 6]])
  placeUnit(s, GK, [[-8, -8]])
  placeUnit(s, AUN, [[-20, 12]])
  placeUnit(s, BOYZ, { x: 8, z: 0, gap: 0.3 })
  placeUnit(s, BOYZ2, { x: 8, z: 8, gap: 0.3 })
  placeUnit(s, BOSS, [[10, -6]])
}

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const optionIds = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)
const marks = (s: GameState, prefix: string) => s.phaseState.marks.filter((m) => m.startsWith(prefix))

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
const delta = (s: GameState, unitId: string, targetId: string, o: { overwatch?: boolean; kind?: 'ranged' | 'melee' } = {}) =>
  hookService.skillDeltaFor(s, s.units[unitId].models[0], s.weapons['tau.w.pulse-rifle'], targetId, { kind: o.kind ?? 'ranged', overwatch: o.overwatch ?? false })

function destroyUnit(s: GameState, unitId: string): void {
  for (const id of [...s.units[unitId].models]) removeModel(s, id)
  s.units[unitId].location = 'destroyed'
}

// raise and answer the For the Greater Good pick for `unitId` selected to shoot
function pick(ctx: EngineContext, unitId: string, optionId: string | null): string[] {
  const raised = hookService.offerPicks(ctx, 'shooting.unitSelected', unitId)
  if (!raised) return []
  const ids = optionIds(ctx.state)
  if (optionId) answerOption(ctx, optionId)
  return ids
}

// =====================================================================================================================
describe('For the Greater Good (TAU-2)', () => {
  it("TAU-002 TAU-2.1: selecting the Strike Team offers an FtGG pick listing Stealth/Ghostkeel as Observers and visible enemies; Aun'Shar is never an Observer", () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', ST)).toBe(true)
    const ids = optionIds(s)
    expect(ids).toContain(`${STH}@${BOYZ}`)
    expect(ids).toContain(`${GK}@${BOSS}`)
    expect(ids).toContain('decline')
    expect(ids.some((i) => i.startsWith(AUN))).toBe(false)
    expect(ids.every((i) => i === 'decline' || i.split('@')[1].startsWith('B:'))).toBe(true)
  })

  it('TAU-003 TAU-2.1: a Battle-shocked, already-shot or already-Observer candidate is absent from the options', () => {
    const s = makeState()
    deployArmy(s)
    s.units[STH].battleShocked = true
    s.units[GK].turn.shotThisPhase = true
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', ST)).toBe(false)
    const t = makeState()
    deployArmy(t)
    t.phaseState.marks.push(`ftgg:obs:${STH}`)
    const { ctx } = ctxOf(t)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', ST)).toBe(true)
    expect(optionIds(t).some((i) => i.startsWith(STH))).toBe(false)
    expect(optionIds(t).some((i) => i.startsWith(GK))).toBe(true)
  })

  it('TAU-004 TAU-2.2: a Guided unit has BS improved by one against the Spotted unit (4+ to 3+), nothing without a mark', () => {
    const s = makeState()
    deployArmy(s)
    expect(delta(s, ST, BOYZ)).toBe(0)
    const { ctx } = ctxOf(s)
    pick(ctx, ST, `${STH}@${BOYZ}`)
    expect(marks(s, 'ftgg:guided:')).toEqual([`ftgg:guided:${ST}=${STH}@${BOYZ}`])
    expect(delta(s, ST, BOYZ)).toBe(-1)
    // the Fireblade half carries the ability too: still one step, not two
    expect(hookService.skillDeltaFor(s, s.units[FIRE].models[0], s.weapons['tau.w.fireblade-pulse-rifle'], BOYZ, { kind: 'ranged', overwatch: false })).toBe(-1)
  })

  it('TAU-005 TAU-2.2: the BS step is a characteristic change, separate from the hit modifier (Damaged Ghostkeel -1 stays a roll modifier)', () => {
    const s = makeState()
    deployArmy(s)
    s.units[GK].models.forEach((id) => { s.models[id].woundsRemaining = 4 })
    const { ctx } = ctxOf(s)
    pick(ctx, ST, `${GK}@${BOYZ}`)
    expect(delta(s, ST, BOYZ)).toBe(-1)
    const dmg = hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, s.units[GK].models[0], 'tau.w.burst-cannon', BOYZ), roll: rollOf(4, 'hit') })
    expect(dmg.map((d) => (d.result as { modifier?: number }).modifier)).toContain(-1) // Damaged is a roll modifier; the BS step (delta -1) is separate
    expect(dmg.every((d) => (d.result as { modifier?: number }).modifier !== undefined)).toBe(true)
  })

  it('TAU-006 TAU-2.2: Guided attacks vs the Spotted unit ignore cover when the Observer has MARKERLIGHT; a Ghostkeel Observer does not', () => {
    const run = (observer: string) => {
      const s = makeState()
      deployArmy(s)
      const { ctx } = ctxOf(s)
      pick(ctx, ST, `${observer}@${BOYZ}`)
      const ignores = (target: string) => hookService.collect(ctx, 'onSaveRoll', {
        attack: attackCtx(s, s.units[ST].models[0], 'tau.w.pulse-rifle', target, { inCover: true }), roll: rollOf(0, 'save'),
      }).some((x) => (x.result as { ignoreCover?: boolean }).ignoreCover)
      return { vsSpotted: ignores(BOYZ), vsOther: ignores(BOYZ2) }
    }
    expect(run(STH)).toEqual({ vsSpotted: true, vsOther: false })
    expect(run(GK)).toEqual({ vsSpotted: false, vsOther: false })
  })

  it('TAU-007 TAU-2.3: a Guided unit splitting fire has BS worsened by one against any other enemy (4+ to 5+)', () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    pick(ctx, ST, `${STH}@${BOYZ}`)
    expect(delta(s, ST, BOYZ2)).toBe(1)
    expect(delta(s, ST, BOSS)).toBe(1)
  })

  it('TAU-008 TAU-2.4: after observing, the Observer can still shoot later but is offered no FtGG pick', () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    pick(ctx, ST, `${STH}@${BOYZ}`)
    expect(s.phaseState.marks).toContain(`ftgg:obs:${STH}`)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', STH)).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('TAU-009 TAU-2.6: Overwatch gets no BS change from an earlier mark; the marks are phase-scoped and gone in the next phase', () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    pick(ctx, ST, `${STH}@${BOYZ}`)
    expect(delta(s, ST, BOYZ, { overwatch: true })).toBe(0)
    expect(delta(s, ST, BOYZ, { kind: 'melee' })).toBe(0)
    s.phaseState = emptyPhaseState() // entering another phase clears the marks
    expect(delta(s, ST, BOYZ)).toBe(0)
  })

  it("TAU-010 TAU-2.5: an Advanced Stealth unit can observe while the Shas'vre lives; once he dies it cannot (and loses MARKERLIGHT)", () => {
    const s = makeState()
    deployArmy(s)
    s.units[STH].turn.moveType = 'advance'
    expect(hookService.keywordsFor(s, STH)).toContain('MARKERLIGHT')
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.unitSelected', ST)).toBe(true)
    expect(optionIds(s).some((i) => i.startsWith(STH))).toBe(true)
    const t = makeState()
    deployArmy(t)
    t.units[STH].turn.moveType = 'advance'
    const shasvre = t.units[STH].models.find((id) => t.models[id].datasheetModelId === 'shasvre')!
    removeModel(t, shasvre)
    expect(hookService.keywordsFor(t, STH)).not.toContain('MARKERLIGHT')
    expect(hookService.offerPicks(ctxOf(t).ctx, 'shooting.unitSelected', ST)).toBe(true)
    expect(optionIds(t).some((i) => i.startsWith(STH))).toBe(false)
  })

  it('TAU-011 TAU-2.5: an Advanced Strike Team (no marker drone rule) is not offered as Observer', () => {
    const s = makeState()
    deployArmy(s)
    s.units[ST].turn.moveType = 'advance'
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', STH)).toBe(true)
    expect(optionIds(s).some((i) => i.startsWith(ST))).toBe(false)
    expect(optionIds(s).some((i) => i.startsWith(GK))).toBe(true)
  })

  it('TAU-035 TAU-6.7: Forward Observers - the Observer lets the Guided unit re-roll wound rolls of 1 vs the Spotted unit only', () => {
    const s = makeState()
    deployArmy(s)
    const { ctx } = ctxOf(s)
    pick(ctx, ST, `${STH}@${BOYZ}`)
    const rerolls = (target: string, overwatch = false) => hookService.collect(ctx, 'onWoundRoll', {
      attack: attackCtx(s, s.units[ST].models[0], 'tau.w.pulse-rifle', target, { overwatch }), roll: rollOf(1, 'wound'),
    }).some((r) => (r.result as { reroll?: string }).reroll === 'ones')
    expect(rerolls(BOYZ)).toBe(true)
    expect(rerolls(BOYZ2)).toBe(false)
    expect(rerolls(BOYZ, true)).toBe(false)
    expect(sourcesFor(s).some((e) => e.source.id === FO)).toBe(true)
  })
})

// =====================================================================================================================
describe('secondary objectives (TAU-4)', () => {
  function zoneCentre(s: GameState): { x: number; z: number } {
    const zone = deploymentZone(s, 'A')
    const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
  }
  function commandEnd(s: GameState): number {
    s.phase = 'command'
    s.activePlayer = 'A'
    s.phaseState = emptyPhaseState()
    const before = s.players.A.vpBySource['kauyon-lure'] ?? 0
    missionService.onWindow(ctxOf(s, [], false).ctx, 'command.end', 'k')
    return (s.players.A.vpBySource['kauyon-lure'] ?? 0) - before
  }
  const away = (s: GameState) => { deployArmy(s); for (const id of [ST, FIRE, STH, GK, AUN]) placeUnit(s, id, [[0, 0]]) }

  it('TAU-016 TAU-4: Kauyon Lure - round 1 scores 0; round 2 with the Strike Team partly in own zone scores 5', () => {
    const r1 = makeState({ round: 1 }); away(r1)
    const c1 = zoneCentre(r1); placeUnit(r1, ST, [[c1.x, c1.z]])
    expect(commandEnd(r1)).toBe(0)
    const r2 = makeState({ round: 2 }); away(r2)
    const c2 = zoneCentre(r2); placeUnit(r2, ST, [[c2.x, c2.z]])
    expect(commandEnd(r2)).toBe(5)
    const none = makeState({ round: 2 }); away(none)
    expect(commandEnd(none)).toBe(0)
  })

  it('TAU-017 TAU-4: Kauyon Lure - only qualifying unit Battle-shocked scores 0; two qualifying units still score 5', () => {
    const s = makeState(); away(s)
    const c = zoneCentre(s); placeUnit(s, ST, [[c.x, c.z]])
    s.units[ST].battleShocked = true
    expect(commandEnd(s)).toBe(0)
    const t = makeState(); away(t)
    placeUnit(t, ST, [[c.x, c.z]]); placeUnit(t, GK, [[c.x, c.z + 4]])
    expect(commandEnd(t)).toBe(5)
  })

  it("TAU-018 TAU-4: Leadership Caste - Aun'Shar alive at battle end scores 20; destroyed scores 0", () => {
    const end = (s: GameState): number => {
      s.round = 5
      s.phase = 'fight'
      s.phaseState = emptyPhaseState()
      const before = s.players.A.vpBySource['leadership-caste'] ?? 0
      missionService.onWindow(ctxOf(s, [], false).ctx, 'battle.end', 'battle')
      return (s.players.A.vpBySource['leadership-caste'] ?? 0) - before
    }
    const alive = makeState({ a: { secondaryId: 'tau.sec.leadership-caste' } }); deployArmy(alive)
    expect(end(alive)).toBe(20)
    const dead = makeState({ a: { secondaryId: 'tau.sec.leadership-caste' } }); deployArmy(dead)
    destroyUnit(dead, AUN)
    expect(end(dead)).toBe(0)
  })
})

// =====================================================================================================================
describe('stratagems (TAU-5)', () => {
  const offered = (s: GameState, id: string, window: Parameters<typeof stratagemService.options>[2], trigger = {}) =>
    stratagemService.options(s, 'A', window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds ?? [])
  const env = (s: GameState, id: string, window: 'phase.end' | 'charge.declared', trigger = {}) =>
    ({ state: s, services: openServices(), player: 'A' as const, stratagem: s.stratagems[id], window, trigger })
  const moveDistance = (s: GameState): number | undefined => {
    const p = s.pending as unknown as { kind: string; constraints: { maxDistance?: number; perModel?: Record<string, number> } }
    expect(p.kind).toBe('moveUnit')
    return p.constraints.maxDistance ?? Object.values(p.constraints.perModel ?? {})[0]
  }

  it('TAU-019 TAU-5: Defensive Fusillade - offered for a Strike Team that has not shot; not for one that already shot', () => {
    const s = makeState(); deployArmy(s); s.players.A.cp = 3
    expect(offered(s, FUSIL, 'shooting.start').flat()).toContain(ST)
    s.units[ST].turn.shotThisPhase = true
    expect(offered(s, FUSIL, 'shooting.start').flat()).not.toContain(ST)
  })

  it('TAU-020 TAU-5: Rapid Repositioning - Strike Team moves D6 (rolled), Stealth gets a flat 6" with no roll', () => {
    const s = makeState(); deployArmy(s); s.players.A.cp = 3
    expect(offered(s, REPO, 'phase.end').flat()).toEqual(expect.arrayContaining([ST, STH, GK]))
    const a = ctxOf(s, [4])
    codeHooks.rapidRepositioning.apply!(a.ctx, env(s, REPO, 'phase.end'), { ids: [ST], objectiveId: null })
    expect(moveDistance(s)).toBe(4)
    expect((s.pending as unknown as { context: { unitId: string } }).context.unitId).toBe(ST)
    expect(a.events.some((e) => e.type === 'DiceRolled')).toBe(true)
    const t = makeState(); deployArmy(t)
    const b = ctxOf(t, [])
    codeHooks.rapidRepositioning.apply!(b.ctx, env(t, REPO, 'phase.end'), { ids: [STH], objectiveId: null })
    expect(moveDistance(t)).toBe(6)
    expect(b.events.some((e) => e.type === 'DiceRolled')).toBe(false)
  })

  it('TAU-021 TAU-5: Rapid Repositioning is not offered to a unit in Engagement Range, and forbids a charge', () => {
    const s = makeState(); deployArmy(s); s.players.A.cp = 3
    const near = s.models[s.units[BOYZ].models[0]]
    placeUnit(s, GK, [[near.pos.x - 1 - near.base.radius - 0.8, near.pos.z]])
    expect(offered(s, REPO, 'phase.end').flat()).not.toContain(GK)
    expect(offered(s, REPO, 'phase.end').flat()).toContain(ST)
    expect(s.stratagems[REPO].effect).toMatchObject({ forbid: 'charge' })
  })

  const chargeEnv = (s: GameState, charger: string, targets: string[]) => {
    s.phase = 'charge'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
    s.phaseState.charge = { unitId: charger, targetUnitIds: targets, roll: null, rerolled: false, distance: null, heroic: false }
    s.players.A.cp = 3
  }
  const chargeOffers = (s: GameState, charger: string) => offered(s, LASER, 'charge.declared', { unitId: charger })

  it('TAU-022 TAU-5: Laser-Marked Targets - offered vs a charge declared on the Strike Team; queues an Overwatch-style reaction at the charger', () => {
    const s = makeState(); deployArmy(s)
    chargeEnv(s, BOYZ, [ST])
    expect(chargeOffers(s, BOYZ).map((ids) => ids.join())).toContain(`${BOYZ},${ST}`)
    const { ctx } = ctxOf(s)
    codeHooks.laserMarkedTargets.apply!(ctx, env(s, LASER, 'charge.declared', { unitId: BOYZ }), { ids: [BOYZ, ST], objectiveId: null })
    const reactions = pendingReactions(s, 'overwatch')
    expect(reactions).toHaveLength(1)
    expect(reactions[0]).toMatchObject({ unitId: ST, enemyUnitId: BOYZ, stratagemId: LASER })
    // the shot rides the Overwatch sequence: 6s only, no FtGG step
    expect(hookService.overwatchHitOnFor(s, ST, LASER)).toBe(6)
  })

  it('TAU-023 TAU-5: Laser-Marked Targets - the -2 Charge-roll effect is scoped to the charger only', () => {
    const s = makeState(); deployArmy(s)
    expect(s.stratagems[LASER].effect).toMatchObject({ modifyRoll: { roll: 'charge', value: -2 } })
    expect(s.stratagems[LASER].targets[0]).toMatchObject({ role: 'unit', owner: 'enemy' })
    expect(s.stratagems[LASER].duration).toBe('untilEndOfPhase')
  })

  it('TAU-025 TAU-5: Laser-Marked Targets refused for a unit that already shot this turn (Overwatch or otherwise)', () => {
    const s = makeState(); deployArmy(s)
    chargeEnv(s, BOYZ, [ST])
    expect(chargeOffers(s, BOYZ).length).toBeGreaterThan(0)
    s.players.A.secondaryState['shotTurn'] = { key: `${s.round}:${s.activePlayer}`, unitIds: [ST] }
    expect(shotThisTurn(s, ST)).toBe(true)
    expect(chargeOffers(s, BOYZ).map((ids) => ids.join())).not.toContain(`${BOYZ},${ST}`)
  })

  it("TAU-026 TAU-5: Laser-Marked Targets not offered for a unit that is not a charge target, nor in the T'au player's own turn", () => {
    const s = makeState(); deployArmy(s)
    chargeEnv(s, BOYZ, [STH])
    expect(chargeOffers(s, BOYZ).map((ids) => ids.join())).not.toContain(`${BOYZ},${ST}`)
    expect(chargeOffers(s, BOYZ).map((ids) => ids.join())).toContain(`${BOYZ},${STH}`)
    const t = makeState(); deployArmy(t)
    chargeEnv(t, BOYZ, [ST])
    t.activePlayer = 'A'
    expect(chargeOffers(t, BOYZ)).toEqual([])
  })
})

// =====================================================================================================================
describe('datasheet abilities (TAU-6)', () => {
  it('TAU-027 TAU-6.1: Coordinated Leadership - a 4+ at own Command phase end gains 1 CP, a 3 gains none, the per-round cap holds', () => {
    const run = (die: number, prior = false): number => {
      const s = makeState()
      deployArmy(s)
      s.phase = 'command'
      s.phaseState = emptyPhaseState()
      s.players.A.cp = 0
      if (prior) hookService.gainCp(ctxOf(s).ctx, 'A', 1, 'test')
      const before = s.players.A.cp
      const { ctx } = ctxOf(s, [die])
      hookService.run(ctx, 'onPhaseEnd', { hook: 'onPhaseEnd' } as never)
      return s.players.A.cp - before
    }
    expect(run(4)).toBe(1)
    expect(run(3)).toBe(0)
    expect(run(6, true)).toBe(0) // a second CP gain in the same round is capped
  })

  it('TAU-030 TAU-6.4: Cover Fire - Strike Team on a controlled marker hits Overwatch on 4+; off the marker or on an enemy marker only 6s', () => {
    const s = makeState(); deployArmy(s)
    const obj = Object.values(s.objectives)[0]
    placeUnit(s, ST, [[obj.pos.x, obj.pos.z]])
    obj.controller = 'A'
    expect(hookService.overwatchHitOnFor(s, ST, CORE_OW)).toBe(4)
    obj.controller = 'B'
    expect(hookService.overwatchHitOnFor(s, ST, CORE_OW)).toBe(6)
    obj.controller = 'A'
    placeUnit(s, ST, [[obj.pos.x + 20, obj.pos.z]])
    expect(hookService.overwatchHitOnFor(s, ST, CORE_OW)).toBe(6)
  })

  it('TAU-031 TAU-6.4: Cover Fire does not apply to Laser-Marked Targets shooting', () => {
    const s = makeState(); deployArmy(s)
    const obj = Object.values(s.objectives)[0]
    placeUnit(s, ST, [[obj.pos.x, obj.pos.z]])
    obj.controller = 'A'
    expect(hookService.overwatchHitOnFor(s, ST, LASER)).toBe(6)
  })

  const TURRET = 'tau.w.support-turret-missile-system'
  const shasui = (s: GameState) => s.units[ST].models.find((id) => s.models[id].datasheetModelId === 'shasui')!
  const available = (s: GameState, modelId: string, weaponId: string) => DEFAULT_MODULES.services.weapons.isAvailable!(s, modelId, weaponId)
  const movementEnd = (s: GameState) => {
    s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
    hookService.run(ctxOf(s).ctx, 'onPhaseEnd', { hook: 'onPhaseEnd' } as never)
  }

  it("TAU-032 TAU-6.5: DS8 - Strike Team Remained Stationary: the support turret is available in own Shooting phase and the opponent's turn", () => {
    const s = makeState(); deployArmy(s)
    expect(s.weapons[TURRET]).toBeDefined()
    s.units[ST].turn.moveType = 'stationary'
    movementEnd(s)
    expect(available(s, shasui(s), TURRET)).toBe(true)
    s.activePlayer = 'B'; s.phase = 'shooting'
    expect(available(s, shasui(s), TURRET)).toBe(true)
  })

  it('TAU-033 TAU-6.5: DS8 - a unit that moved loses the turret; it is also absent before the first Movement phase', () => {
    const s = makeState(); deployArmy(s)
    expect(available(s, shasui(s), TURRET)).toBe(false)
    s.units[ST].turn.moveType = 'stationary'
    movementEnd(s)
    expect(available(s, shasui(s), TURRET)).toBe(true)
    s.units[ST].turn.moveType = 'normal'
    movementEnd(s)
    expect(available(s, shasui(s), TURRET)).toBe(false)
    expect(available(s, s.units[ST].models[0], 'tau.w.pulse-rifle')).toBe(true) // other weapons are untouched
  })
})

// =====================================================================================================================
// Laser-Marked Targets driven through the real charge module (TAU-022/023/024): window -> stratagem -> reaction shots -> roll
describe('Laser-Marked Targets through the charge phase (TAU-5)', () => {
  const TOTAL_DICE = 400
  function run(opts: { charger?: string; laser: boolean; before?: number[]; roll?: number[]; tweak?: (s: GameState) => void; fill?: number; attach?: boolean }) {
    // the Warboss cannot lead Boyz in the real data: a cloned bundle lets this test exercise the attached-charger path
    const forced = opts.attach ? structuredClone(bundle) : undefined
    if (forced) { const wb = Object.values(forced.datasheets).find((d) => d.id === 'ork.warboss-gordrang')!; wb.leader ??= { attachTo: [], effects: [] }; wb.leader.attachTo.push('ork.boyz') }
    const s = makeState(opts.attach ? { bundle: forced, b: { attachments: [{ leaderRef: 'warboss', bodyguardRef: 'boyz-a' }] } } : {}); deployArmy(s)
    opts.tweak?.(s)
    const charger = opts.charger ?? BOYZ
    s.phase = 'charge'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
    s.phaseState.charge = { unitId: charger, targetUnitIds: [ST], roll: null, rerolled: false, distance: null, heroic: false }
    s.players.A.cp = 3
    const dice = [...(opts.before ?? []), ...(opts.roll ?? []), ...Array(TOTAL_DICE).fill(opts.fill ?? 1)]
    const { ctx, events } = ctxOf(s, dice)
    let guard = 0
    let r = chargeModule.advance(ctx)
    while (s.pending && (s.pending.kind === 'stratagemWindow' || s.pending.kind === 'commandReroll') && guard++ < 40) {
      const pending = s.pending
      const laserOpt = opts.laser && pending.kind === 'stratagemWindow' ? pending.options.find((o) => o.action.type === 'useStratagem') : undefined
      const action: Action = laserOpt
        ? (laserOpt.action as Action)
        : ({ type: 'pass', player: pending.player, decisionId: pending.id } as Action)
      const rej = stratagemService.validate!(s, action, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      s.pending = null
      stratagemService.handle(ctx, action, pending)
      r = chargeModule.advance(ctx)
    }
    return { s, events, r }
  }
  const idx = (events: { type: string }[], type: string) => events.findIndex((e) => e.type === type)

  it('TAU-022 TAU-5: Laser-Marked Targets - the Strike Team shoots (hits only on a 6) before the charge roll is made', () => {
    const { events } = run({ laser: true })
    const seq = idx(events, 'AttackSequenceStarted'), roll = idx(events, 'ChargeRolled')
    expect(seq).toBeGreaterThanOrEqual(0)
    expect(roll).toBeGreaterThan(seq)
    expect(events.slice(0, roll).some((e) => e.type === 'AttackSequenceEnded')).toBe(true)
    const hits = events.filter((e) => e.type === 'HitRolled') as unknown as { die: number; hit: boolean }[]
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => !h.hit)).toBe(true) // all dice were 1s
  })

  it('TAU-022 TAU-5: a die of 5 misses, a 6 hits (Overwatch-style threshold)', () => {
    const five = run({ laser: true, fill: 5 }).events.filter((e) => e.type === 'HitRolled') as unknown as { hit: boolean }[]
    const six = run({ laser: true, fill: 6 }).events.filter((e) => e.type === 'HitRolled') as unknown as { hit: boolean }[]
    expect(five.length).toBeGreaterThan(0)
    expect(five.some((h) => h.hit)).toBe(false)
    expect(six.some((h) => h.hit)).toBe(true)
  })

  it('TAU-023 TAU-5: the charge roll is reduced by 2 (9 -> 7) for the marked charger; a second charger is unaffected', () => {
    // pass 1: count the dice the reaction shots consume before the charge roll
    const probe = run({ laser: true })
    const shotDice = probe.events.slice(0, idx(probe.events, 'ChargeRolled')).filter((e) => e.type === 'DiceRolled')
      .filter((e) => (e as unknown as { roll: { purpose: string } }).roll.purpose !== 'charge')
      .reduce((n, e) => n + (e as unknown as { roll: { dice: number[] } }).roll.dice.length, 0)
    const marked = run({ laser: true, before: Array(shotDice).fill(1), roll: [4, 5] })
    const cr = marked.events.find((e) => e.type === 'ChargeRolled') as unknown as { dice: [number, number]; total: number }
    expect(cr.dice).toEqual([4, 5])
    expect(cr.total).toBe(7)
    const other = run({ charger: BOYZ2, laser: false, roll: [4, 5] })
    const cr2 = other.events.find((e) => e.type === 'ChargeRolled') as unknown as { dice: [number, number]; total: number }
    expect(cr2.total).toBe(9)
  })

  it('TAU-024 TAU-5: an attached charger that loses its bodyguard half to the shots still charges with the surviving Leader', () => {
    const { events, s } = run({
      laser: true, fill: 6,
      tweak: (t) => {
        for (const id of t.units[ST].models.slice(3)) removeModel(t, id) // only 3 rifles shoot
        for (const id of t.units[BOYZ].models.slice(1)) removeModel(t, id)
        t.units[BOYZ].models.forEach((id) => { t.models[id].woundsRemaining = 1 })
        for (const u of [BOYZ, BOSS]) {
          const ds = t.units[u].datasheetId
          t.datasheets = { ...t.datasheets, [ds]: { ...t.datasheets[ds], models: t.datasheets[ds].models.map((m) => ({ ...m, stats: { ...m.stats, Sv: 7 } })) } }
        }
      },
      attach: true,
    })
    expect(s.units[BOYZ].location).toBe('destroyed')
    expect(s.units[BOSS].location).toBe('board')
    expect(events.some((e) => e.type === 'ChargeRolled')).toBe(true) // the Warboss still rolls
    expect(s.phaseState.marks.some((m) => m.startsWith('ch:halves:'))).toBe(true)
  })

  it('TAU-024 TAU-5: a charger destroyed by the Laser-Marked shots makes no charge roll and no move', () => {
    const { events, s } = run({
      laser: true, fill: 6,
      tweak: (t) => {
        for (const id of t.units[BOYZ].models.slice(1)) removeModel(t, id)
        t.units[BOYZ].models.forEach((id) => { t.models[id].woundsRemaining = 1 })
        const ds = t.units[BOYZ].datasheetId
        t.datasheets = { ...t.datasheets, [ds]: { ...t.datasheets[ds], models: t.datasheets[ds].models.map((m) => ({ ...m, stats: { ...m.stats, Sv: 7 } })) } }
      },
    })
    expect(events.some((e) => e.type === 'ModelDestroyed' || e.type === 'UnitDestroyed')).toBe(true)
    expect(s.units[BOYZ].location).toBe('destroyed')
    expect(events.some((e) => e.type === 'ChargeRolled' || e.type === 'ChargeMoved')).toBe(false)
    expect(s.phaseState.charge).toBeNull()
  })
})

// =====================================================================================================================
describe('auras, datasheet rules and weapons (TAU-3, TAU-6)', () => {
  const GKW = 'tau.w.cyclic-ion-raker-standard'
  const sv = (s: GameState, unitId: string) => {
    const m = s.models[s.units[unitId].models[0]]
    return hookService.statFor(s, { unitId, modelId: m.id, weapon: null, stat: 'Sv' }, modelStats(s, m).Sv)
  }
  const base = (s: GameState, unitId: string) => modelStats(s, s.models[s.units[unitId].models[0]]).Sv
  const hitsOf = (s: GameState, attacker: string, weapon: string, target: string, die: number) => {
    const model = s.units[attacker].models.find((id) => s.models[id].weapons.includes(weapon))!
    const { ctx, events } = ctxOf(s, [die, ...Array(60).fill(1)])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: attacker, overwatch: false, targets: [{ modelId: model, weaponId: weapon, targetUnitId: target, profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    return events.filter((e) => e.type === 'HitRolled') as unknown as { die: number; final: number; hit: boolean }[]
  }

  it('TAU-013 TAU-3: DS13 improves the Save of INFANTRY within 6 inches of Aun-Shar (Strike Team) but gives the Ghostkeel nothing', () => {
    const s = makeState(); deployArmy(s)
    placeUnit(s, AUN, [[-6, 4]]); placeUnit(s, GK, [[-6, -4]])
    expect(sv(s, ST)).toBe(base(s, ST) - 1)
    expect(sv(s, GK)).toBe(base(s, GK))
    placeUnit(s, AUN, [[-6, 12]]) // out of the 6" aura
    expect(sv(s, ST)).toBe(base(s, ST))
  })

  it('TAU-014 TAU-3: Aun-Shar has Lone Operative (no targeting beyond 12 inches) and Stealth (-1 to hit vs ranged)', () => {
    const t = makeState(); deployArmy(t)
    const { ctx } = ctxOf(t)
    placeUnit(t, AUN, [[-8, 0]]) // 16 inches from the Boyz: outside the Lone Operative bubble
    expect(buildShootingWeaponEntries(ctx, BOYZ).some((e) => e.legalTargets.includes(AUN))).toBe(false)
    placeUnit(t, AUN, [[0, 0]]) // 8" away
    expect(buildShootingWeaponEntries(ctx, BOYZ).some((e) => e.legalTargets.includes(AUN))).toBe(true)
    // Stealth: BS 4+ rifle, die 4 -> final 3 -> miss against Aun-Shar, hit against an ordinary unit
    const u = makeState(); deployArmy(u); u.units[AUN].player = 'B'
    expect(hitsOf(u, ST, 'tau.w.pulse-rifle', AUN, 4)[0].hit).toBe(false)
    expect(hitsOf(u, ST, 'tau.w.pulse-rifle', BOYZ, 4)[0].hit).toBe(true)
  })

  it('TAU-015 TAU-3: DS15 - a Ghostkeel within 6 inches of Aun-Shar has Lethal Hits on ranged weapons, not on melee', () => {
    const s = makeState({ a: { enhancementId: 'tau.e.ds15-experimental-drone' } }); deployArmy(s)
    placeUnit(s, AUN, [[-8, -6]])
    const m = s.units[GK].models[0]
    expect(weaponService.hasAbility(weaponService.effectiveWeapon(s, m, GKW), 'LETHAL_HITS')).toBe(true)
    expect(weaponService.hasAbility(weaponService.effectiveWeapon(s, m, 'tau.w.ghostkeel-fists'), 'LETHAL_HITS')).toBe(false)
    placeUnit(s, AUN, [[-20, 12]])
    expect(weaponService.hasAbility(weaponService.effectiveWeapon(s, m, GKW), 'LETHAL_HITS')).toBe(false)
  })

  it('TAU-028 TAU-6.2: Hover Drone - Aun-Shar has Move 10 and FLY', () => {
    const s = makeState(); deployArmy(s)
    const m = s.models[s.units[AUN].models[0]]
    expect(hookService.statFor(s, { unitId: AUN, modelId: m.id, weapon: null, stat: 'M' }, modelStats(s, m).M)).toBe(10)
    expect([...datasheetOf(s, AUN).keywords, ...datasheetOf(s, AUN).factionKeywords]).toContain('FLY')
  })

  it('TAU-029 TAU-6.3: Volley Fire - a led Strike Team rifle has A 2 (Fireblade rifle too); without the Fireblade A 1', () => {
    const rifle = (s: GameState) => s.units[ST].models.find((id) => s.models[id].weapons.includes('tau.w.pulse-rifle'))!
    const flat = (n: number) => expect.objectContaining({ flat: n })
    const led = makeState(); deployArmy(led)
    expect(weaponService.effectiveWeapon(led, rifle(led), 'tau.w.pulse-rifle').A).toBe(2)
    expect(weaponService.effectiveWeapon(led, led.units[FIRE].models[0], 'tau.w.fireblade-pulse-rifle').A).toBe(2)
    const solo = makeState({ a: { attachments: [] } }); deployArmy(solo)
    expect(weaponService.effectiveWeapon(solo, rifle(solo), 'tau.w.pulse-rifle').A).toBe(1)
  })

  it('TAU-034 TAU-6.5: support turret is Indirect Fire and Twin-linked', () => {
    const s = makeState()
    expect(weaponService.hasAbility(s.weapons['tau.w.support-turret-missile-system'], 'INDIRECT_FIRE')).toBe(true)
    expect(weaponService.hasAbility(s.weapons['tau.w.support-turret-missile-system'], 'TWIN_LINKED')).toBe(true)
  })

  it('TAU-036 TAU-6.8: a Ghostkeel that Fell Back can still be selected to shoot; a Stealth unit that Fell Back cannot', () => {
    const s = makeState(); deployArmy(s)
    s.units[GK].turn.moveType = 'fallBack'; s.units[STH].turn.moveType = 'fallBack'
    const { ctx } = ctxOf(s)
    expect(unitEligibleToShoot(ctx, GK)).toBe(true)
    expect(unitEligibleToShoot(ctx, STH)).toBe(false)
  })

  it('TAU-037 TAU-6.9: Damaged 1-4 - a Ghostkeel at 4 wounds takes -1 to hit; Deadly Demise D3 is on the datasheet', () => {
    const w = 'tau.w.cyclic-ion-raker-standard'
    const bs = (s: GameState) => weaponService.effectiveWeapon(s, s.units[GK].models[0], w).skill as number
    const healthy = makeState(); deployArmy(healthy)
    const hurt = makeState(); placeUnit(hurt, GK, [[-8, -8]]); placeUnit(hurt, BOYZ, { x: 8, z: 0, gap: 0.3 }); hurt.units[GK].models.forEach((id) => { hurt.models[id].woundsRemaining = 4 })
    expect(sourcesFor(hurt).some((e) => e.source.id.includes('damaged'))).toBe(true)
    hurt.units[GK].models.forEach((id) => { hurt.models[id].woundsRemaining = 4 })
    
    expect(hitsOf(hurt, GK, w, BOYZ, bs(hurt))[0].hit).toBe(false)
    expect(datasheetOf(hurt, GK).coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE')).toMatchObject({ value: 'D3' })
  })

  it('TAU-038 TAU-6: weapon profiles - fusion blaster Melta 2, overcharged raker Hazardous, pulse pistol Pistol', () => {
    const s = makeState()
    expect(String(weaponService.abilityValue(s.weapons['tau.w.fusion-blaster'], 'MELTA'))).toBe('2')
    expect(weaponService.hasAbility(s.weapons['tau.w.cyclic-ion-raker-overcharge'], 'HAZARDOUS')).toBe(true)
    expect(weaponService.hasAbility(s.weapons['tau.w.cyclic-ion-raker-standard'], 'HAZARDOUS')).toBe(false)
    expect(weaponService.hasAbility(s.weapons['tau.w.pulse-pistol'], 'PISTOL')).toBe(true)
    expect(weaponService.hasAbility(s.weapons['tau.w.pulse-rifle'], 'PISTOL')).toBe(false)
  })

  it('TAU-039 TAU-6: Infiltrators on the Stealth Battlesuits and the Ghostkeel only', () => {
    const s = makeState()
    const has = (id: string) => datasheetOf(s, id).coreAbilities.some((c) => c.ability === 'INFILTRATORS')
    expect(has(STH)).toBe(true)
    expect(has(GK)).toBe(true)
    expect(has(ST)).toBe(false)
    expect(has(AUN)).toBe(false)
  })

  it('TAU-040 TAU-6: Stealth gives -1 to hit vs ranged (Stealth Battlesuits, Ghostkeel); the Ghostkeel is also a Lone Operative', () => {
    for (const target of [STH, GK]) {
      const s = makeState(); deployArmy(s); s.units[target].player = 'B'
      expect(hitsOf(s, ST, 'tau.w.pulse-rifle', target, 4)[0].hit).toBe(false) // BS 4+ at -1
      expect(hitsOf(s, ST, 'tau.w.pulse-rifle', target, 5)[0].hit).toBe(true)
    }
    const s = makeState(); deployArmy(s)
    expect(datasheetOf(s, GK).coreAbilities.some((c) => c.ability === 'LONE_OPERATIVE')).toBe(true)
  })

  it('TAU-032 TAU-6.5 (DS8, never activated): a Strike Team never selected to move Remained Stationary and keeps the turret; one that arrived this turn does not', () => {
    const TURRET = 'tau.w.support-turret-missile-system'
    const run = (arrived: boolean) => {
      const s = makeState(); deployArmy(s)
      s.units[ST].turn.moveType = null
      s.units[ST].turn.arrivedThisTurn = arrived
      s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
      hookService.run(ctxOf(s).ctx, 'onPhaseEnd', { hook: 'onPhaseEnd' } as never)
      const shasui = s.units[ST].models.find((id) => s.models[id].datasheetModelId === 'shasui')!
      return DEFAULT_MODULES.services.weapons.isAvailable!(s, shasui, TURRET)
    }
    expect(run(false)).toBe(true)
    expect(run(true)).toBe(false)
  })
})
