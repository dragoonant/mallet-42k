// Grey Knights code hooks (docs/spec/factions/grey-knights.md §7, checklist GRE-*): Teleport Assault pick, Daemonic Fervour,
// Banishment Stone, Champion of Titan, No Escape. Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { modelIdFor } from '../../src/engine/state'
import { teleportCandidates, noEscapeAmount, championOfTitanModelDestroyed } from '../../src/engine/factions/grey-knights'
import { grantTeleportFervour, isTeleporting } from '../../src/engine/teleport'
import { placeUnit } from '../fixtures'
import { removeModel } from '../../src/engine'
import type { Action, AttackContext, DeployUnitDecision, DiceRoll, ModuleTable, RollContext, Services, UseStratagemAction } from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { fightOnDeathThreshold, deferredDeaths } from '../../src/engine/fight-on-death'
import { stratagemService } from '../../src/engine/stratagems'
import { movementModule } from '../../src/engine/phases/movement'
import { objectiveService } from '../../src/engine/objectives'
import { removeUnitToReserves } from '../../src/engine/teleport'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const GK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Grey Knights', faction: 'grey-knights', patrolId: 'gk.cp.aurellios-banishers', enhancementId: 'gk.e.banishment-stone', secondaryId: 'gk.sec.champion-of-titan',
  attachments: [{ leaderRef: 'librarian', bodyguardRef: 'terminators' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const LIB = 'A:librarian', TERMS = 'A:terminators', STRIKE = 'A:strike', DK = 'A:dreadknight'
const ENEMY = 'B:terminator-squad', ENEMY_CAP = 'B:captain-octavius', ENEMY_INF = 'B:infernus-squad'

function makeState(o: { a?: Partial<PlayerSetup>; round?: number } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: GK(o.a), B: SM() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'gk-hooks', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'B'
  s.phase = 'command'
  s.phaseState = emptyPhaseState()
  return s
}
function ctxOf(s: GameState, dice: number[] = []): { ctx: EngineContext; events: GameEvent[] } { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const pendingOption = (s: GameState): ChooseOptionDecision | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}

function layout(s: GameState): void {
  // (Terminators placed below when fielded)
  if (s.units[LIB]) placeUnit(s, LIB, [[-13, 0]])
  placeUnit(s, STRIKE, [[-12, 8]])
  if (s.units[DK]) placeUnit(s, DK, [[-12, -8]])
  if (s.units[TERMS]) placeUnit(s, TERMS, [[-12, 0]])
  placeUnit(s, ENEMY, [[12, 0]])
}

describe('Teleport Assault pick (GRE-2.1)', () => {
  it('GRE-003 GRE-2.1: offered to the Grey Knights player at the opponent\'s turn end; Engagement Range units and the Dreadknight are excluded; picking removes the unit', () => {
    const s = makeState()
    layout(s)
    placeUnit(s, STRIKE, [[11, 0]]) // in Engagement Range of the enemy Terminators
    const { ctx, events } = ctxOf(s)
    expect(teleportCandidates(s, 'A')).toEqual([leaderService.canonicalUnitId(s, TERMS)])
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual([leaderService.canonicalUnitId(s, TERMS), 'decline'])
    answer(ctx, leaderService.canonicalUnitId(s, TERMS))
    expect(s.units[TERMS].location).toBe('reserves')
    expect(of(events, 'UnitRemovedFromBattlefield')).toHaveLength(1)
  })

  it('GRE-003 GRE-2.1: declining leaves the board unchanged', () => {
    const s = makeState()
    layout(s)
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(true)
    answer(ctx, 'decline')
    expect(s.units[TERMS].location).toBe('board')
    expect(s.units[STRIKE].location).toBe('board')
  })

  it('GRE-004 GRE-2.1: only one pick per opponent turn, and none at the end of the Grey Knights player\'s own turn', () => {
    const s = makeState()
    layout(s)
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(true)
    answer(ctx, STRIKE)
    expect(s.units[STRIKE].location).toBe('reserves')
    expect(s.pending).toBeNull()
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(false)
    const own = makeState()
    layout(own)
    own.activePlayer = 'A'
    const c2 = ctxOf(own)
    expect(hookService.offerPicks!(c2.ctx, 'turn.end', 'turn')).toBe(false)
  })

  it('GRE-005 GRE-2.1: attached Librarian + Terminators are removed together and stay attached', () => {
    const s = makeState()
    layout(s)
    const canonical = leaderService.canonicalUnitId(s, TERMS)
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(true)
    answer(ctx, canonical)
    expect(s.units[TERMS].location).toBe('reserves')
    expect(s.units[LIB].location).toBe('reserves')
    expect(leaderService.canonicalUnitId(s, LIB)).toBe(canonical)
    expect(isTeleporting(s, canonical)).toBe(true)
  })
})

describe('Daemonic Fervour (GRE-5.3)', () => {
  it('GRE-022 GRE-5.3: the grant lets a unit in Engagement Range be picked that turn only', () => {
    const s = makeState()
    layout(s)
    placeUnit(s, STRIKE, [[11, 0]])
    expect(teleportCandidates(s, 'A')).not.toContain(STRIKE)
    grantTeleportFervour(s, STRIKE)
    expect(teleportCandidates(s, 'A')).toContain(STRIKE)
    // later turn: the grant has lapsed
    s.activePlayer = 'A'
    s.round = 3
    s.activePlayer = 'B'
    expect(teleportCandidates(s, 'A')).not.toContain(STRIKE)
  })

  it('GRE-023 GRE-5.3: the Dreadknight is never a Teleport Assault candidate, even with a grant', () => {
    const s = makeState({ a: { unitChoices: { heavy: 'dreadknight' }, attachments: [] } })
    layout(s)
    placeUnit(s, DK, [[11, 0]])
    grantTeleportFervour(s, DK)
    expect(s.units[DK]).toBeDefined()
    expect(teleportCandidates(s, 'A')).not.toContain(DK)
  })
})

describe('Banishment Stone (GRE-3.1)', () => {
  const kill = (s: GameState, ctx: EngineContext, byModelId: string, victimUnit: string): void => {
    hookService.run(ctx, 'onModelDestroyed', {
      destroyedUnitId: victimUnit, destroyedModelId: s.units[victimUnit].models[0], byUnitId: byModelId.split('#')[0], byModelId, kind: 'melee',
    } as never)
  }

  it('GRE-012 GRE-3.1: bearer kills an enemy CHARACTER: D6 2 gives 1 CP, D6 1 gives none', () => {
    const s = makeState()
    layout(s)
    s.players.A.cp = 0
    const a = ctxOf(s, [2])
    kill(s, a.ctx, modelIdFor(LIB, 0), ENEMY_CAP)
    expect(s.players.A.cp).toBe(1)
    const s2 = makeState()
    layout(s2)
    s2.players.A.cp = 0
    const b = ctxOf(s2, [1])
    kill(s2, b.ctx, modelIdFor(LIB, 0), ENEMY_CAP)
    expect(s2.players.A.cp).toBe(0)
  })

  it('GRE-012 GRE-3.1: a Terminator killing the CHARACTER does not roll', () => {
    const s = makeState()
    layout(s)
    s.players.A.cp = 0
    const { ctx, events } = ctxOf(s, [6])
    kill(s, ctx, s.units[TERMS].models[0], ENEMY_CAP)
    expect(s.players.A.cp).toBe(0)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
  })

  it('GRE-013 GRE-3.1: bearer kills a non-CHARACTER model: no roll', () => {
    const s = makeState()
    layout(s)
    s.players.A.cp = 0
    const { ctx, events } = ctxOf(s, [6])
    kill(s, ctx, modelIdFor(LIB, 0), ENEMY_INF)
    expect(s.players.A.cp).toBe(0)
    expect(of(events, 'DiceRolled')).toHaveLength(0)
  })
})

describe('Champion of Titan (GRE-4.1)', () => {
  const info = (s: GameState, by: string, victim: string) => ({
    unitId: victim, modelId: s.units[victim].models[0], byPlayer: 'A' as const, byUnitId: by.split('#')[0], byModelId: by,
  })

  it('GRE-015 GRE-4.1: Warlord kills an enemy CHARACTER: +6 VP each; other killers or non-CHARACTER victims score nothing', () => {
    const s = makeState()
    layout(s)
    const warlord = modelIdFor(s.players.A.warlordUnitId, 0)
    const { ctx } = ctxOf(s)
    championOfTitanModelDestroyed(ctx, info(s, warlord, ENEMY_CAP))
    expect(s.players.A.vp).toBe(6)
    championOfTitanModelDestroyed(ctx, info(s, warlord, ENEMY_CAP))
    expect(s.players.A.vp).toBe(12)
    championOfTitanModelDestroyed(ctx, info(s, s.units[STRIKE].models[0], ENEMY_CAP))
    championOfTitanModelDestroyed(ctx, info(s, warlord, ENEMY_INF))
    expect(s.players.A.vp).toBe(12)
  })

  it('GRE-016 GRE-4.1: scores on the opponent\'s turn too (any phase)', () => {
    const s = makeState()
    layout(s)
    s.phase = 'fight'
    s.activePlayer = 'B'
    const { ctx } = ctxOf(s)
    championOfTitanModelDestroyed(ctx, info(s, modelIdFor(s.players.A.warlordUnitId, 0), ENEMY_CAP))
    expect(s.players.A.vp).toBe(6)
  })
})

describe('No Escape (GRE-4.2)', () => {
  const noEscape = (s: GameState) => s.mission.secondaries.A.find((r) => r.code === 'noEscape')!

  it('GRE-017 GRE-4.2: +10 only when both edge-closest markers are controlled', () => {
    const s = makeState({ a: { secondaryId: 'gk.sec.no-escape' } })
    layout(s)
    const { ctx } = ctxOf(s)
    const ids = Object.keys(s.objectives)
    for (const id of ids) s.objectives[id].securedBy = 'B'
    expect(noEscapeAmount(ctx, noEscape(s), 'A')).toBe(0)
    for (const id of ids) s.objectives[id].securedBy = 'A'
    expect(noEscapeAmount(ctx, noEscape(s), 'A')).toBe(10)
    // exactly one marker held: never enough (two distinct edge markers are needed)
    for (const id of ids) {
      for (const o of ids) s.objectives[o].securedBy = o === id ? 'A' : 'B'
      expect(noEscapeAmount(ctx, noEscape(s), 'A')).toBe(0)
    }
  })

  it('GRE-018 GRE-4.2: scores at most once per battle; a razed marker is skipped for "closest"', () => {
    const s = makeState({ a: { secondaryId: 'gk.sec.no-escape' } })
    layout(s)
    const { ctx } = ctxOf(s)
    for (const id of Object.keys(s.objectives)) s.objectives[id].securedBy = 'A'
    s.players.A.vpBySource[noEscape(s).id] = 10
    expect(noEscapeAmount(ctx, noEscape(s), 'A')).toBe(0)
    s.players.A.vpBySource[noEscape(s).id] = 0
    const first = Object.values(s.objectives)[0]
    first.removed = true
    first.securedBy = 'B'
    expect(noEscapeAmount(ctx, noEscape(s), 'A')).toBe(10)
  })
})

// =====================================================================================================================
// Verification-pass additions: regression for a Leader left alone by a destroyed bodyguard, the missing checklist IDs and
// the sub-cases the first pass skipped. Window / pipeline driven wherever the engine exposes the real entry point.
// =====================================================================================================================
const VS = 'gk.s.vindictive-strategy', VU = 'gk.s.violent-unbinding', DF = 'gk.s.daemonic-fervour'

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
function drive(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('drive: too many decisions')
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
function stratHarness(s: GameState) {
  const services: Services = {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics }
  const made = (dice: number[]) => createContext(s, new ScriptedRng(dice), modules).ctx
  const useOption = (ctx: EngineContext, stratagemId: string, firstId?: string) => {
    const opts = ((s.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((x) => x.action as UseStratagemAction)
    const opt = opts.find((x) => x.stratagemId === stratagemId && (firstId === undefined || [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])].includes(firstId)))
    if (!opt) throw new Error(`no option ${stratagemId} ${firstId ?? ''}`)
    const pending = s.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    s.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { made, useOption }
}
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])])
const killUnit = (s: GameState, id: string): void => { for (const m of [...s.units[id].models]) removeModel(s, m) }

describe('Teleport Assault with a destroyed bodyguard (regression, GRE-2.1/2.3/2.5)', () => {
  it('GRE-005 a lone Leader is offered under its own id, never the destroyed bodyguard; it is removed, arrives and is not stranded', () => {
    const s = makeState({ round: 2 })
    layout(s)
    killUnit(s, TERMS) // the Terminators die; the Librarian still carries bodyguardUnitId = TERMS
    expect(s.units[LIB].bodyguardUnitId).toBe(TERMS)
    expect(s.units[TERMS].location).toBe('destroyed')
    expect(teleportCandidates(s, 'A')).toEqual([LIB, STRIKE].sort())
    const { ctx, events } = ctxOf(s)
    expect(hookService.offerPicks!(ctx, 'turn.end', 'turn')).toBe(true)
    expect(pendingOption(s)!.options.map((o) => o.id)).not.toContain(TERMS)
    answer(ctx, LIB) // used to throw 'removeUnitToReserves: unit A:terminators is not on the battlefield'
    expect(s.units[LIB].location).toBe('reserves')
    expect(s.units[TERMS].location).toBe('destroyed')
    expect(of(events, 'UnitRemovedFromBattlefield')[0].unitId).toBe(LIB)
    expect(isTeleporting(s, LIB)).toBe(true)
    // next own Movement phase: the lone Leader is an arrival (it used to be skipped because bodyguardUnitId was set)
    placeUnit(s, ENEMY, [[18, 8]])
    s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState(); s.step = 'reinforcements'
    const c = ctxOf(s)
    expect(movementModule.advance(c.ctx)).toBe('pending')
    const pending = s.pending as DeployUnitDecision
    expect(pending.kind).toBe('deployUnit')
    expect(pending.context.unitIds).toEqual([LIB])
    const spots: [number, number][] = [[-5, 8], [0, 10], [-18, 5], [-18, -8], [0, -10], [5, 0]]
    const place = (x: number, z: number): Action => ({ type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: LIB, placements: [{ modelId: s.units[LIB].models[0], pos: { x, y: 0, z }, facing: 0 }] })
    const ok = spots.find(([x, z]) => movementModule.validate!(s, place(x, z), pending) === null)!
    s.pending = null
    expect(movementModule.handle(c.ctx, place(ok[0], ok[1]), pending)).toBeUndefined()
    expect(s.units[LIB].location).toBe('board')
    expect(isTeleporting(s, LIB)).toBe(false)
    expect(of(c.events, 'ReinforcementsArrived')[0]).toMatchObject({ unitId: LIB, via: 'teleportAssault' })
  })
  it('GRE-005 the Terminators alone (Leader destroyed first) are still offered under their own id', () => {
    const s = makeState({ round: 2 })
    layout(s)
    killUnit(s, LIB)
    expect(teleportCandidates(s, 'A')).toContain(TERMS)
    const { ctx } = ctxOf(s)
    removeUnitToReserves(ctx, TERMS, 'x')
    expect(s.units[TERMS].location).toBe('reserves')
    expect(s.units[LIB].location).toBe('destroyed')
  })
})

describe('No Escape ordering and own-turn end (GRE-009, GRE-017)', () => {
  // finds the marker whose control needs the Terminators standing on it, secures every other marker for A
  function holdBoth(s: GameState, ctx: EngineContext): void {
    const rule = s.mission.secondaries.A.find((r) => r.code === 'noEscape')!
    for (const x of Object.keys(s.objectives)) {
      for (const o of Object.keys(s.objectives)) s.objectives[o].securedBy = o === x ? null : 'A'
      placeUnit(s, TERMS, [[s.objectives[x].pos.x, s.objectives[x].pos.z]])
      placeUnit(s, LIB, [[s.objectives[x].pos.x + 1.4, s.objectives[x].pos.z]])
      if (noEscapeAmount(ctx, rule, 'A') !== 10) continue
      s.units[TERMS].location = 'reserves'; s.units[LIB].location = 'reserves'
      const without = noEscapeAmount(ctx, rule, 'A')
      s.units[TERMS].location = 'board'; s.units[LIB].location = 'board'
      if (without === 0) return
    }
    throw new Error('no marker found whose control needs the Terminators')
  }
  it('GRE-009 GRE-2.5: No Escape is scored with the teleporting unit still on its marker; the removal happens after scoring', () => {
    const s = makeState({ a: { secondaryId: 'gk.sec.no-escape' } })
    layout(s)
    placeUnit(s, ENEMY, [[40, 40]])
    const { ctx } = ctxOf(s)
    holdBoth(s, ctx)
    s.phase = 'fight'
    expect(ctx.window('turn.end', 'turn', ctx.order.active())).toBe(true) // missions.onWindow first, then the pick
    expect(s.players.A.vp).toBe(10)
    expect(s.units[TERMS].location).toBe('board') // not removed yet: the pick is only now pending
    expect(pendingOption(s)).not.toBeNull()
    answer(ctx, leaderService.canonicalUnitId(s, TERMS))
    expect(s.units[TERMS].location).toBe('reserves')
    expect(s.players.A.vp).toBe(10)
  })
  it('GRE-017 GRE-4.2: the window scores at the end of the opponent\'s turn and gives 0 at the end of the Grey Knights player\'s own turn', () => {
    const mk = (active: 'A' | 'B') => {
      const s = makeState({ a: { secondaryId: 'gk.sec.no-escape' } })
      layout(s)
      for (const id of Object.keys(s.objectives)) s.objectives[id].securedBy = 'A'
      s.activePlayer = active; s.phase = 'fight'
      const { ctx } = ctxOf(s)
      ctx.window('turn.end', 'turn', ctx.order.active())
      return s
    }
    expect(mk('A').players.A.vp).toBe(0)
    expect(mk('B').players.A.vp).toBe(10)
  })
})

describe('Dominating Aura (GRE-014)', () => {
  it('GRE-014 GRE-3.2: the bearer counts OC 3 on a marker, the Terminators stay at 2 each, Battle-shock drops the bearer to 0', () => {
    const mk = () => {
      const s = makeState({ a: { enhancementId: 'gk.e.dominating-aura' } })
      const obj = Object.values(s.objectives)[0]
      placeUnit(s, TERMS, { x: 40, z: 40, gap: 0.3 })
      placeUnit(s, STRIKE, { x: 40, z: 45, gap: 0.3 })
      placeUnit(s, ENEMY, [[40, -40]])
      return { s, obj }
    }
    const { s, obj } = mk()
    placeUnit(s, LIB, [[obj.pos.x, obj.pos.z]])
    expect(objectiveService.levelOfControl(s, obj.id).A).toBe(3)
    s.units[LIB].battleShocked = true
    expect(objectiveService.levelOfControl(s, obj.id).A).toBe(0)
    const t = mk()
    placeUnit(t.s, TERMS, [[t.obj.pos.x, t.obj.pos.z]]) // every Terminator on the marker
    expect(objectiveService.levelOfControl(t.s, t.obj.id).A).toBe(10) // 5 Terminators x OC 2: the aura does not touch them
  })
})

describe('Banishment Stone: R-4.2 cap (GRE-012)', () => {
  it('GRE-012 GRE-3.1: a second gain in the same battle round is discarded by R-4.2', () => {
    const s = makeState()
    layout(s)
    s.players.A.cp = 0
    const { ctx, events } = ctxOf(s, [2, 2])
    const kill = () => hookService.run(ctx, 'onModelDestroyed', { destroyedUnitId: ENEMY_CAP, destroyedModelId: s.units[ENEMY_CAP].models[0], byUnitId: LIB, byModelId: modelIdFor(LIB, 0), kind: 'melee' } as never)
    kill()
    expect(s.players.A.cp).toBe(1)
    kill()
    expect(s.players.A.cp).toBe(1)
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('discarded'))).toBe(true)
  })
})

describe('Champion of Titan inside an attached enemy unit (GRE-016)', () => {
  it('GRE-016 GRE-4.1: the Warlord killing the CHARACTER leader of an attached enemy unit scores 6 VP', () => {
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
      players: { A: GK(), B: SM({ attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] }) },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const att = createGameState(setup, bundle, 'gk-hooks', ENGINE_VERSION)
    att.round = 2; att.activePlayer = 'B'; att.phase = 'fight'; att.phaseState = emptyPhaseState()
    expect(att.units[ENEMY_CAP].bodyguardUnitId).toBe(ENEMY)
    layout(att)
    const { ctx } = ctxOf(att)
    championOfTitanModelDestroyed(ctx, { unitId: ENEMY_CAP, modelId: att.units[ENEMY_CAP].models[0], byPlayer: 'A', byUnitId: LIB, byModelId: modelIdFor(att.players.A.warlordUnitId, 0) })
    expect(att.players.A.vp).toBe(6)
  })
})

describe('Vindictive Strategy (GRE-019)', () => {
  const woundMods = (s: GameState, ctx: EngineContext, weaponId: string) =>
    hookService.collect(ctx, 'onWoundRoll', { attack: attackCtx(s, `${ENEMY}#0`, weaponId, STRIKE), roll: rollOf(4, 'wound') })
      .map((r) => r.result as { kind: string; modifier?: number }).filter((r) => r.kind === 'roll' && r.modifier !== undefined)
  it('GRE-019 GRE-5.1: S5 against the Strike Squad (T4) -> -1 to wound; S4 -> no change', () => {
    const s = makeState({ round: 2 })
    layout(s)
    s.phase = 'shooting'; s.activePlayer = 'B'; s.players.A.cp = 3
    const h = stratHarness(s)
    const ctx = h.made([])
    stratagemService.openWindow?.(ctx, 'shooting.targetsDeclared', 'A', 'k', { unitId: ENEMY, targetUnitId: STRIKE })
    h.useOption(ctx, VS, STRIKE)
    const s5 = Object.values(s.weapons).find((w) => w.S === 5 && w.kind === 'ranged')
    const s4 = Object.values(s.weapons).find((w) => w.S === 4 && w.kind === 'ranged')
    expect(s5 && s4).toBeTruthy()
    expect(woundMods(s, ctx, s5!.id)).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(woundMods(s, ctx, s4!.id)).toEqual([])
  })
  it('GRE-019 GRE-5.1: offered in the opponent\'s Shooting and in either Fight phase, not in the own Shooting phase, not for the Dreadknight', () => {
    const s = makeState({ round: 2 })
    layout(s)
    s.players.A.cp = 3
    s.phase = 'shooting'; s.activePlayer = 'B'
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', VS, { unitId: ENEMY, targetUnitId: STRIKE })).toEqual([[STRIKE]])
    s.phase = 'fight'; s.activePlayer = 'B'
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', VS, { unitId: ENEMY, targetUnitId: STRIKE })).toEqual([[STRIKE]])
    s.activePlayer = 'A'
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', VS, { unitId: ENEMY, targetUnitId: STRIKE })).toEqual([[STRIKE]])
    s.phase = 'shooting'; s.activePlayer = 'A'
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', VS, { unitId: ENEMY, targetUnitId: STRIKE })).toEqual([])
    const d = makeState({ a: { unitChoices: { heavy: 'dreadknight' }, attachments: [] } })
    layout(d)
    d.players.A.cp = 3; d.phase = 'shooting'; d.activePlayer = 'B'
    expect(offeredIds(d, 'A', 'shooting.targetsDeclared', VS, { unitId: ENEMY, targetUnitId: DK })).toEqual([])
  })
})

describe('Violent Unbinding (GRE-020, GRE-021)', () => {
  const fightState = () => {
    const s = makeState({ round: 2 })
    layout(s)
    placeUnit(s, ENEMY, [[-12, 6.9]])
    s.phase = 'fight'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState(); s.players.A.cp = 3
    return s
  }
  const useIt = (s: GameState) => {
    const h = stratHarness(s)
    const ctx = h.made([])
    stratagemService.openWindow?.(ctx, 'fight.targetsDeclared', 'A', 'k', { unitId: ENEMY, targetUnitId: STRIKE })
    h.useOption(ctx, VU, STRIKE)
  }
  const killOne = (s: GameState, dice: number[]) => {
    const { ctx } = createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
    attackService.destroyModel(ctx, s.units[STRIKE].models[0], { player: 'B', unitId: ENEMY, modelId: `${ENEMY}#0`, kind: 'melee' })
  }
  it('GRE-020 GRE-5.2: D6 4 -> the model stays at 0 W until the attacker has finished; D6 3 -> removed at once', () => {
    const s = fightState()
    useIt(s)
    expect(fightOnDeathThreshold(s, STRIKE)).toBe(4)
    const m = s.units[STRIKE].models[0]
    killOne(s, [4])
    expect(deferredDeaths(s).map((d) => d.modelId)).toEqual([m])
    const t = fightState()
    useIt(t)
    const m2 = t.units[STRIKE].models[0]
    killOne(t, [3])
    expect(deferredDeaths(t)).toHaveLength(0)
    expect(t.models[m2]).toBeUndefined()
  })
  it('GRE-021 GRE-5.2: a model of a unit that already fought this phase gets no roll', () => {
    const s = fightState()
    useIt(s)
    s.units[STRIKE].turn.foughtThisPhase = true
    const m = s.units[STRIKE].models[0]
    killOne(s, []) // an empty ScriptedRng would throw on any roll
    expect(s.models[m]).toBeUndefined()
  })
})

describe('Daemonic Fervour offers (GRE-023)', () => {
  const state = (active: 'A' | 'B') => {
    const s = makeState({ round: 2 })
    layout(s)
    placeUnit(s, STRIKE, [[11, 0]]) // in Engagement Range of the enemy
    s.phase = 'fight'; s.activePlayer = active; s.players.A.cp = 3
    return s
  }
  it('GRE-023 GRE-5.3: offered in the opponent\'s Fight phase for a unit in Engagement Range', () => {
    expect(offeredIds(state('B'), 'A', 'fight.start', DF).map((x) => x[0])).toContain(STRIKE)
  })
  it('GRE-023 GRE-5.3: not offered in the Grey Knights player\'s own Fight phase', () => {
    expect(offeredIds(state('A'), 'A', 'fight.start', DF)).toEqual([])
  })
  it('GRE-023 GRE-5.3: not offered for a unit outside Engagement Range', () => {
    const s = state('B')
    placeUnit(s, STRIKE, [[-12, 8]])
    expect(offeredIds(s, 'A', 'fight.start', DF).map((x) => x[0])).not.toContain(STRIKE)
  })
})

describe('Sanctic Hood (GRE-024)', () => {
  const fnp = (s: GameState, ctx: EngineContext, weaponId: string, target: string, mortal = false) =>
    hookService.collect(ctx, 'onFeelNoPainRoll', { attack: attackCtx(s, `${ENEMY}#0`, weaponId, target), roll: rollOf(0, 'fnp'), mortal, psychicSource: s.weapons[weaponId].abilities.some((a) => a.ability === 'PSYCHIC') })
      .map((r) => (r.result as { feelNoPain?: number }).feelNoPain).filter((n) => n !== undefined)
  it('GRE-024 GRE-6.1: attached Terminators and Librarian get FNP 4+ vs a Psychic weapon; none vs a bolter; none when the Librarian is not attached', () => {
    const s = makeState()
    layout(s)
    const { ctx } = ctxOf(s)
    const psy = 'gk.w.nemesis-force-weapon-terminator'
    const bolter = s.models[`${ENEMY}#0`].weapons.find((w) => !s.weapons[w].abilities.some((a) => a.ability === 'PSYCHIC'))!
    expect(fnp(s, ctx, psy, TERMS)).toEqual([4])
    expect(fnp(s, ctx, psy, LIB)).toEqual([4])
    expect(fnp(s, ctx, bolter, TERMS)).toEqual([])
    const u = makeState({ a: { attachments: [] } })
    layout(u)
    const c2 = ctxOf(u)
    expect(fnp(u, c2.ctx, psy, LIB)).toEqual([])
    expect(fnp(u, c2.ctx, psy, TERMS)).toEqual([])
  })
  it('GRE-024 GRE-6.1: mortal wounds from an enemy Psychic ability also get FNP 4+; non-Psychic mortal wounds do not', () => {
    const run = (source: string) => {
      const s = makeState()
      layout(s)
      s.phase = 'shooting'; s.activePlayer = 'B'
      const { ctx, events } = createContext(s, new ScriptedRng(Array(60).fill(1)), DEFAULT_MODULES)
      attackService.queueMortalWounds(ctx, TERMS, 2, source, false)
      drive(ctx)
      return of(events, 'FeelNoPainRolled')
    }
    const withPsy = run('gk.a.hammerhand') // ability text begins "Psychic." -> Psychic-tagged
    expect(withPsy.length).toBe(2)
    expect(withPsy.every((e) => e.needed === 4)).toBe(true)
    expect(run('deadlyDemise')).toHaveLength(0)
  })
  it('GRE-024 GRE-6.1: a failed focused Purge Soul Hazardous test on the attached Librarian rolls no FNP (a test is not a Psychic attack)', () => {
    const s = makeState()
    layout(s)
    placeUnit(s, ENEMY, [[-13, 12]])
    s.phase = 'shooting'; s.activePlayer = 'A'
    const { ctx, events } = createContext(s, new ScriptedRng(Array(80).fill(1)), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: LIB, overwatch: false, targets: [{ modelId: modelIdFor(LIB, 0), weaponId: 'gk.w.purge-soul-focused', targetUnitId: ENEMY, profileGroup: null, attacks: null }] } as never)
    drive(ctx)
    expect(of(events, 'HazardousTested').some((e) => e.failed)).toBe(true)
    expect(of(events, 'DamageApplied').filter((e) => e.unitId === LIB).length).toBeGreaterThan(0)
    expect(of(events, 'FeelNoPainRolled').filter((e) => e.unitId === LIB)).toHaveLength(0)
  })
})

describe('Hammerhand (GRE-025)', () => {
  const lethal = (s: GameState, modelId: string, weaponId: string) => hookService.weaponAbilitiesFor!(s, modelId, s.weapons[weaponId]).map((a) => a.ability).includes('LETHAL_HITS')
  it('GRE-025 GRE-6.2: after a Charge move the Terminators\' and the attached Librarian\'s force weapons have Lethal Hits; none without a charge', () => {
    const s = makeState()
    layout(s)
    const tm = s.units[TERMS].models[0], lm = s.units[LIB].models[0]
    const tw = 'gk.w.nemesis-force-weapon-terminator', lw = 'gk.w.nemesis-force-weapon-librarian'
    expect(lethal(s, tm, tw)).toBe(false)
    for (const h of leaderService.halves(s, TERMS)) s.units[h].turn.chargedThisTurn = true // applyChargeMove sets this on every half, Heroic Intervention included
    expect(lethal(s, tm, tw)).toBe(true)
    expect(lethal(s, lm, lw)).toBe(true)
    // next turn: the per-turn flags reset, no charge -> no Lethal Hits
    for (const h of leaderService.halves(s, TERMS)) s.units[h].turn.chargedThisTurn = false
    expect(lethal(s, tm, tw)).toBe(false)
    expect(lethal(s, lm, lw)).toBe(false)
  })
})

describe('Dreadknight Damaged and Deadly Demise (GRE-026)', () => {
  const dk = () => {
    const s = makeState({ a: { unitChoices: { heavy: 'dreadknight' }, attachments: [] } })
    layout(s)
    return s
  }
  const hitMods = (s: GameState, ctx: EngineContext, weaponId: string) =>
    hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, s.units[DK].models[0], weaponId, ENEMY), roll: rollOf(4, 'hit') })
      .map((r) => r.result as { kind: string; modifier?: number }).filter((r) => r.kind === 'roll' && r.modifier !== undefined)
  it('GRE-026 GRE-6.3: at 4 W -1 to hit on the heavy psycannon and the greatsword; at 5 W no modifier', () => {
    const s = dk()
    const { ctx } = ctxOf(s)
    const m = s.units[DK].models[0]
    const ws = s.models[m].weapons
    const heavy = ws.find((w) => w.includes('heavy-psycannon'))!, sword = ws.find((w) => w.includes('greatsword-strike'))!
    s.models[m].woundsRemaining = 4
    expect(hitMods(s, ctx, heavy)).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(hitMods(s, ctx, sword)).toEqual([{ kind: 'roll', modifier: -1 }])
    s.models[m].woundsRemaining = 5
    expect(hitMods(s, ctx, heavy)).toEqual([])
    expect(hitMods(s, ctx, sword)).toEqual([])
  })
  it('GRE-026 GRE-6.3: destroyed -> Deadly Demise D3 mortal wounds on a 6 to units within 6"', () => {
    const s = dk()
    placeUnit(s, ENEMY, [[-12, -11]]) // within 6" of the Dreadknight
    s.phase = 'shooting'; s.activePlayer = 'B'
    const { ctx, events } = createContext(s, new ScriptedRng([6, 6, 6, 6, 6, 6, 6, 6]), DEFAULT_MODULES) // D6 6 triggers, each D3 roll of 6 -> 3 mortal wounds
    attackService.destroyModel(ctx, s.units[DK].models[0], { player: 'B', unitId: ENEMY, modelId: `${ENEMY}#0`, kind: 'ranged' })
    expect(of(events, 'DeadlyDemiseRolled')[0]).toMatchObject({ die: 6, exploded: true })
    const queue = s.phaseState.attack!.mortalQueue
    expect(queue.map((q) => q.targetUnitId)).toContain(ENEMY)
    expect(queue.find((q) => q.targetUnitId === ENEMY)!.count).toBe(3)
  })
})

describe('Weapon abilities (GRE-027)', () => {
  const abilities = (s: GameState, id: string) => s.weapons[id].abilities
  it('GRE-027 GRE-6: psilencer Sustained Hits 1, storm bolter Rapid Fire 2, greatsword strike D6 damage, Purge Soul focused Hazardous + Precision + Psychic', () => {
    const s = makeState({ a: { unitChoices: { heavy: 'dreadknight' } } })
    layout(s)
    expect(abilities(s, 'gk.w.psilencer')).toContainEqual({ ability: 'SUSTAINED_HITS', value: 1 })
    expect(abilities(s, 'gk.w.storm-bolter')).toContainEqual({ ability: 'RAPID_FIRE', value: 2 })
    expect(String(s.weapons['gk.w.nemesis-greatsword-strike'].D)).toBe('D6')
    expect(abilities(s, 'gk.w.purge-soul-focused').map((a) => a.ability).sort()).toEqual(['HAZARDOUS', 'PRECISION', 'PSYCHIC'])
  })
  it('GRE-027 GRE-6: the focused Purge Soul rolls its Hazardous test after the shooting attack', () => {
    const s = makeState()
    layout(s)
    placeUnit(s, ENEMY, [[-13, 12]])
    s.phase = 'shooting'; s.activePlayer = 'A'
    const { ctx, events } = createContext(s, new ScriptedRng(Array(80).fill(2)), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: LIB, overwatch: false, targets: [{ modelId: modelIdFor(LIB, 0), weaponId: 'gk.w.purge-soul-focused', targetUnitId: ENEMY, profileGroup: null, attacks: null }] })
    drive(ctx)
    const hz = of(events, 'HazardousTested')
    expect(hz).toHaveLength(1)
    expect(hz[0]).toMatchObject({ weaponId: 'gk.w.purge-soul-focused' })
    const types = events.map((e) => e.type)
    expect(types.indexOf('HazardousTested')).toBeGreaterThan(types.lastIndexOf('HitRolled'))
  })
})
