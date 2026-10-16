// Morgrim's Butchas code hooks and mission scoring (docs/spec/factions/orks--morgrim-s-butchas.md §7, checklist MOR-*).
// Stratagem tests use the real Butchas patrol data; mission-scoring tests use the synthetic red/blu fixture like missions.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameSetup, type GameState,
  type PendingDecision, type PlayerSetup, type RollContext, type UseStratagemAction,
} from '../../src/engine'
import { hookService } from '../../src/engine/hooks-impl'
import { attackService } from '../../src/engine/attack'
import type { GameEvent } from '../../src/engine'
import { stratagemService } from '../../src/engine/stratagems'
import { freshState, placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const BUTCHAS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Butchas', faction: 'ork', patrolId: 'ork.cp.morgrims-butchas', enhancementId: 'ork.e.half-chewed', secondaryId: 'ork.sec.bag-the-big-un',
  attachments: [{ leaderRef: 'beastboss', bodyguardRef: 'snaggas-a' }], reserves: [], battleReadyVp: 0, ...o,
})
const GITS = (): PlayerSetup => ({
  name: 'Gitstompas', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const BOSS = 'A:beastboss', SNAG = 'A:snaggas-a', SNAG_B = 'A:snaggas-b', HOGS = 'A:squighogs', BOYZ = 'B:boyz-a'
const BELLOW = 'ork.s.bestial-bellow', SQUIG = 'ork.s.tough-as-squig-hide', GIT = 'ork.s.get-in-there'

function makeState(po: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: BUTCHAS(po), B: GITS() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'morgrim', ENGINE_VERSION)
  s.round = 2
  placeUnit(s, SNAG, { x: -4, z: -3 })
  placeUnit(s, BOSS, [[-6.5, -3]])
  placeUnit(s, SNAG_B, { x: -4, z: -20 })
  placeUnit(s, HOGS, { x: 10, z: -20, gap: 1 })
  placeUnit(s, BOYZ, { x: -6, z: 12, gap: 0.3 })
  placeUnit(s, 'B:boyz-b', { x: -6, z: 20, gap: 0.3 })
  placeUnit(s, 'B:warboss', [[30, 13]])
  placeUnit(s, 'B:deffkoptas', { x: 25, z: 6, gap: 1 })
  placeUnit(s, 'B:deff-dread', [[19, 0]])
  return s
}
function phase(s: GameState, p: GameState['phase'], active: 'A' | 'B', cp = 3): void {
  s.phase = p
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  if (p === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: active === 'A' ? 'B' : 'A', counterOffensive: false }
  s.players.A.cp = cp
  s.players.B.cp = cp
}
const targetsOf = (x: UseStratagemAction) => [...(x.targets.modelIds ?? []), ...(x.targets.unitIds ?? [])]
const ids = (xs: UseStratagemAction[], id: string) => xs.filter((x) => x.stratagemId === id).map(targetsOf)
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger = {}) => stratagemService.options(s, p, w, trigger)
// opens the real stratagem window for `player`, then uses the option whose first target is `first`
function useStrat(s: GameState, ctx: EngineContext, player: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger: Record<string, string>, id: string, first: string): void {
  expect(ctx.window(w, 'k:' + id, ctx.order.only(player), trigger)).toBe(true)
  const pending = s.pending as PendingDecision & { options: { action: Action }[] }
  const opt = pending.options.map((o) => o.action as UseStratagemAction).find((x) => x.stratagemId === id && targetsOf(x)[0] === first)
  if (!opt) throw new Error(`no option ${id} ${first}`)
  const rej = stratagemService.validate(s, opt, pending) ?? (s.pending = null, stratagemService.handle(ctx, opt, pending))
  if (rej) throw new Error(rej.reason)
}

describe('MOR-5.2 Bestial Bellow', () => {
  it('MOR-020 Fight phase start, Morgrim 2" from an enemy unit → offered, costs 1 CP; the forced test subtracts 1 (7 -1 = 6 vs Ld 6+ passes, 6 -1 = 5 fails)', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    const boss = s.models[s.units[BOSS].models[0]]
    // one enemy Boy about 2" (edge to edge) from Morgrim
    s.models[s.units[BOYZ].models[0]].pos = { x: boss.pos.x, y: 0, z: boss.pos.z + boss.base.radius + s.models[s.units[BOYZ].models[0]].base.radius + 2 }
    expect(ids(offered(s, 'A', 'fight.start', {}), BELLOW).some((t) => t[0] === boss.id && t[1] === BOYZ)).toBe(true)
    const { ctx, events } = createContext(s, new ScriptedRng([3, 4]), DEFAULT_MODULES)
    useStrat(s, ctx, 'A', 'fight.start', {}, BELLOW, boss.id)
    expect(s.players.A.cp).toBe(2)
    expect(s.units[BOYZ].battleShocked).toBe(true) // 7 - 1 = 6 fails the Boyz' Ld 7+
    expect(events.some((e) => e.type === 'AbilityTriggered' && e.abilityId === BELLOW && e.targetUnitId === BOYZ)).toBe(true)
  })

  it('MOR-020b forced Battle-shock test with -1 on a Ld 6+ unit: 2D6 7 passes, 6 fails', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    const h = createContext(s, new ScriptedRng([3, 4, 3, 3]), DEFAULT_MODULES)
    // Beast Snagga Boyz are Ld 7+, Morgrim 6+; an attached unit uses the best (6+)
    expect(hookService.battleShockTest(h.ctx, SNAG, BELLOW, -1)).toBe(true)
    expect(hookService.battleShockTest(h.ctx, SNAG, BELLOW, -1)).toBe(false)
    expect(s.units[SNAG].battleShocked).toBe(true)
  })

  it('MOR-021b costs 1 CP, spent once', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    const hog = s.models[s.units[HOGS].models[0]]
    const near = s.models[s.units[BOYZ].models[0]]
    near.pos = { x: hog.pos.x, y: 0, z: hog.pos.z + hog.base.radius2! + near.base.radius + 1 }
    const { ctx } = createContext(s, new ScriptedRng([3, 3]), DEFAULT_MODULES)
    useStrat(s, ctx, 'A', 'fight.start', {}, BELLOW, hog.id)
    expect(s.players.A.cp).toBe(2)
  })

  it('MOR-021 offered for a Squighog Boy model; not for a Beast Snagga Boy model; not for an enemy 4" away', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    const hog = s.models[s.units[HOGS].models[0]]
    const near = s.models[s.units[BOYZ].models[0]]
    near.pos = { x: hog.pos.x, y: 0, z: hog.pos.z + hog.base.radius2! + near.base.radius + 1 }
    const firsts = new Set(ids(offered(s, 'A', 'fight.start', {}), BELLOW).map((t) => t[0]))
    expect(firsts.has(hog.id)).toBe(true)
    expect([...firsts].some((m) => s.models[m].unitId === SNAG || s.models[m].unitId === SNAG_B)).toBe(false)
    // an enemy unit 4" from Morgrim (and nobody else near) gives him no target
    for (const id of s.units[BOYZ].models) s.models[id].pos = { x: -6.5, y: 0, z: 40 }
    const boss = s.models[s.units[BOSS].models[0]]
    s.models[s.units[BOYZ].models[0]].pos = { x: boss.pos.x, y: 0, z: boss.pos.z + boss.base.radius + near.base.radius + 4 }
    const far = ids(offered(s, 'A', 'fight.start', {}), BELLOW).filter((t) => t[0] === boss.id && t[1] === BOYZ)
    expect(far).toEqual([])
  })
})

describe('MOR-5.1 Tough As Squig-hide', () => {
  it('MOR-019 offered in the opponent\'s Shooting and in the Fight phase for INFANTRY, not MOUNTED Squighogs; S6 vs T5 gets -1 to wound, S5 unchanged', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    expect(ids(offered(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: SNAG }), SQUIG).length).toBeGreaterThan(0)
    expect(ids(offered(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: HOGS }), SQUIG)).toEqual([])
    phase(s, 'fight', 'B')
    expect(ids(offered(s, 'A', 'fight.targetsDeclared', { unitId: BOYZ, targetUnitId: SNAG }), SQUIG).length).toBeGreaterThan(0)

    phase(s, 'shooting', 'B')
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    const first = ids(offered(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: SNAG }), SQUIG)[0][0]
    useStrat(s, ctx, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: SNAG }, SQUIG, first)
    const am = s.models[s.units[BOYZ].models[0]]
    const wid = am.weapons.find((w) => s.weapons[w].kind === 'ranged') ?? am.weapons[0]
    const mk = (S: number): AttackContext => ({
      kind: 'ranged', overwatch: false, attackerUnitId: BOYZ, attackerModelId: am.id, weapon: { ...s.weapons[wid], S }, targetUnitId: SNAG,
      targetModelId: s.units[SNAG].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
    })
    const roll: DiceRoll = { id: 'r:x', purpose: 'wound', sides: 6, dice: [4], rerolled: null, modifiers: [], final: [4], player: 'B', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
    const rc: RollContext = { purpose: 'wound', roll, dieIndex: 0, unmodified: 4, rerolled: false }
    const mod = (S: number) => hookService.collect(ctx, 'onWoundRoll', { attack: mk(S), roll: rc }).reduce((a, r) => a + ((r.result as { modifier?: number }).modifier ?? 0), 0)
    expect(mod(6)).toBe(-1)
    expect(mod(5)).toBe(0)
  })
})

describe('MOR-5.3 Get In There!', () => {
  it('MOR-022 offered when an own ORKS unit is picked to fight; Pile-in 6", consolidation 3"; not for an enemy unit', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    const trig = { unitId: SNAG }
    expect(ids(offered(s, 'A', 'fight.unitSelected', trig), GIT).some((t) => t[0] === SNAG)).toBe(true)
    expect(ids(offered(s, 'A', 'fight.unitSelected', { unitId: BOYZ }), GIT).some((t) => t[0] === BOYZ)).toBe(false)
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    expect(hookService.pileInDistance(s, SNAG)).toBe(3)
    useStrat(s, ctx, 'A', 'fight.unitSelected', trig, GIT, SNAG)
    expect(hookService.pileInDistance(s, SNAG)).toBe(6)
    expect(hookService.consolidateDistance(s, SNAG)).toBe(3)
  })
})

// ---------- secondary scoring on the synthetic fixture ----------
const modules = DEFAULT_MODULES
function ctxFor(state: GameState, dice: number[] = []) { return createContext(state, new ScriptedRng(dice), modules) }
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  modules.services.missions.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action, pending as PendingDecision)
}
const BAG_PICK = { id: 'bag-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick' }
const BAG_SCORE = { id: 'bag-score', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 0, cap: 12, code: 'bagTheBigUnScore', params: { beastbossPoints: 12, unitPoints: 8 } }

describe('MOR-4.1 Bag the Big \'Un', () => {
  it('MOR-014 round 1 start offers enemy MONSTER/VEHICLE models; with none, only the enemy WARLORD', () => {
    const s = freshState()
    s.mission.secondaries.B = [BAG_PICK as never]
    s.round = 1
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'round.start', '1')
    expect((ctx.state.pending as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['A:walker#0'])
    const s2 = freshState()
    s2.mission.secondaries.B = [BAG_PICK as never]
    s2.round = 1
    s2.units['A:walker'].location = 'destroyed'
    const { ctx: c2 } = ctxFor(s2)
    modules.services.missions.onWindow(c2, 'round.start', '1')
    expect((c2.state.pending as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['A:boss#0'])
  })

  it('MOR-015 real model death: Morgrim\'s own model kills the picked model 12 VP; a model of his attached bodyguard 8; mortal wounds (no model) 8; alive 0; Reserves never arrived 8', () => {
    const run = (setup: (s: GameState, ctx: EngineContext) => void, killIt = true): number => {
      const s = freshState()
      s.mission.secondaries.B = [BAG_PICK as never]
      s.round = 1
      const { ctx } = ctxFor(s)
      modules.services.missions.onWindow(ctx, 'round.start', '1')
      answer(ctx, 'A:walker#0')
      s.mission.secondaries.B = [BAG_SCORE as never]
      s.round = 5
      placeUnit(s, 'A:walker', [[0, 0]])
      // the warlord (B:warboss) leads the mob, so mob models are bodyguard models of his attached unit
      s.units['B:warboss'].bodyguardUnitId = 'B:mob'
      s.units['B:mob'].attachedLeaderId = 'B:warboss'
      const { ctx: c2 } = ctxFor(s, [1, 1, 1, 1, 1, 1]) // spare dice for a Deadly Demise roll
      setup(s, c2)
      if (!killIt) return 0
      modules.services.missions.onWindow(c2, 'battle.end', 'end')
      return s.players.B.vp
    }
    const kill = (by: { unitId: string | null; modelId: string | null }) => (s: GameState, ctx: EngineContext) => {
      s.models['A:walker#0'].woundsRemaining = 0
      attackService.destroyModel(ctx, 'A:walker#0', { player: by.unitId ? 'B' : null, unitId: by.unitId, modelId: by.modelId, kind: by.unitId ? 'melee' : 'other' } as never)
    }
    expect(run(kill({ unitId: 'B:warboss', modelId: 'B:warboss#0' }))).toBe(12)
    expect(run(kill({ unitId: 'B:mob', modelId: 'B:mob#2' }))).toBe(8)
    expect(run(kill({ unitId: null, modelId: null }))).toBe(8)
    expect(run(() => undefined)).toBe(0)
    expect(run((s) => { s.units['A:walker'].location = 'reserves' })).toBe(8)
  })

  it('MOR-016 one model of a multi-model VEHICLE unit picked → its death alone scores 8 even though the unit survives; a coherency cull of that model also counts', () => {
    const build = (): { s: GameState; ctx: EngineContext } => {
      const s = freshState()
      s.mission.secondaries.B = [BAG_PICK as never]
      s.round = 1
      const walker = s.units['A:walker']
      for (const n of [1, 2]) {
        const m = structuredClone(s.models[walker.models[0]])
        m.id = `A:walker#${n}`
        s.models[m.id] = m
        walker.models.push(m.id)
      }
      const { ctx } = ctxFor(s)
      modules.services.missions.onWindow(ctx, 'round.start', '1')
      expect((ctx.state.pending as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['A:walker#0', 'A:walker#1', 'A:walker#2'])
      answer(ctx, 'A:walker#1')
      expect(s.players.B.secondaryState.bagTargetModelId).toBe('A:walker#1')
      s.mission.secondaries.B = [BAG_SCORE as never]
      s.round = 5
      return { s, ctx: ctxFor(s, [1, 1, 1, 1, 1, 1]).ctx }
    }
    const a = build()
    a.s.models['A:walker#1'].woundsRemaining = 0
    attackService.destroyModel(a.ctx, 'A:walker#1', { player: 'B', unitId: 'B:mob', modelId: 'B:mob#0', kind: 'melee' } as never)
    expect(a.s.units['A:walker'].location).not.toBe('destroyed')
    modules.services.missions.onWindow(a.ctx, 'battle.end', 'end')
    expect(a.s.players.B.vp).toBe(8)
    // coherency cull (reducer) removes the picked model with no killer: still scores 8
    const b = build()
    modules.services.missions.modelDestroyed?.(b.ctx, { unitId: 'A:walker', modelId: 'A:walker#1', byPlayer: null, byUnitId: null, byModelId: null })
    b.s.models['A:walker#1'].woundsRemaining = 0
    b.s.units['A:walker'].models = b.s.units['A:walker'].models.filter((m) => m !== 'A:walker#1')
    modules.services.missions.onWindow(b.ctx, 'battle.end', 'end')
    expect(b.s.players.B.vp).toBe(8)
  })
})

describe('MOR-4.2 Krumpin\' Spree', () => {
  const KRUMP = { id: 'krumpin-spree', when: 'turn.end', who: 'active', rounds: { from: 1, to: 5 }, rule: 'custom', code: 'krumpinSpreeScore', pointsPer: 3, cap: 99, params: { nearestPoints: 3, otherPoints: 1 } }
  function setup(): GameState {
    const s = freshState()
    s.mission.secondaries.B = [KRUMP as never]
    s.round = 2
    s.activePlayer = 'B'
    return s
  }
  const holdOnly = (s: GameState, held: string[]) => { for (const o of Object.values(s.objectives)) o.controller = held.includes(o.id) ? 'B' : null }
  const score = (s: GameState): number => {
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'e' + Math.random())
    return s.players.B.vp
  }
  it('MOR-017 end of own turn: holding nothing scores 0; the marker nearest the enemy edge plus one more outside own DZ is exactly 4; only a marker in own DZ is 0; every marker is 3 + 4', () => {
    // fixture: B's opponent (A) deploys along z = -15, so obj-home-a (z -12) is nearest; obj-home-b is inside B's own zone
    expect(score(Object.assign(setup(), {}))).toBe(0)
    const s1 = setup(); holdOnly(s1, ['obj-home-a', 'obj-w'])
    expect(score(s1)).toBe(4)
    const s2 = setup(); holdOnly(s2, ['obj-home-b'])
    expect(score(s2)).toBe(0)
    const s3 = setup(); holdOnly(s3, ['obj-w', 'obj-e'])
    expect(score(s3)).toBe(2) // not holding the nearest marker: only the 1-per-other part
    const s4 = setup(); holdOnly(s4, Object.keys(s4.objectives))
    expect(score(s4)).toBe(3 + 4) // home-a pays 3; w, e, n, s are outside B's zone; home-b is inside it
  })

  it('MOR-018 not scored at the end of the opponent turn; two markers tied for nearest and both held → 3 + 1 = 4', () => {
    const s = setup()
    holdOnly(s, Object.keys(s.objectives))
    s.activePlayer = 'A'
    expect(score(s)).toBe(0)
    const t2 = setup()
    t2.objectives['obj-e'].pos = { x: 10, z: -12 } // level with obj-home-a for distance to A's edge
    holdOnly(t2, ['obj-home-a', 'obj-e'])
    expect(score(t2)).toBe(4)
  })
})

// ---------- datasheet / ability / enhancement rules (real Butchas data) ----------
function rollOf(unmodified: number, purpose: DiceRoll['purpose'] = 'hit'): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function atk(s: GameState, modelId: string, weaponId: string, targetUnitId: string, over: Partial<AttackContext> = {}): AttackContext {
  const m = s.models[modelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId: modelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false, ...over,
  }
}
const results = (s: GameState, hook: 'onHitRoll' | 'onSaveRoll' | 'onFeelNoPainRoll', a: AttackContext, die = 4) => {
  const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
  return hookService.collect(ctx, hook, { attack: a, roll: rollOf(die, hook === 'onHitRoll' ? 'hit' : hook === 'onSaveRoll' ? 'save' : 'fnp') }).map((r) => r.result as unknown as Record<string, unknown>)
}
const callWaaagh = (s: GameState): void => {
  const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
  hookService.onWindow(ctx, 'round.start', String(s.round))
  const pending = s.pending as ChooseOptionDecision
  s.pending = null
  hookService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'call' } as Action, pending as PendingDecision)
  s.pending = null // the other player's own Waaagh! offer is not under test
}
const BOY = 'A:snaggas-a#3'

// drives one whole attack through attack.ts with a scripted dice stream (hit, wound, save, ... in roll order)
function runAttack(s: GameState, modelId: string, weaponId: string, targetUnitId: string, dice: number[], kind: 'melee' | 'ranged', modules = DEFAULT_MODULES, attacks = 1): GameEvent[] {
  const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...Array(60).fill(2)]), modules)
  const t = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  attackService.begin(ctx, { kind, attackerUnitId: s.models[modelId].unitId, overwatch: false, targets: [t] })
  let r = attackService.advance(ctx)
  let guard = 0
  while (r === 'pending') {
    if (++guard > 500) throw new Error('loop')
    const p = ctx.state.pending as PendingDecision & { options: { action: Action }[] }
    const a = p.options[0].action
    ctx.state.pending = null
    const rej = (p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler).handle(ctx, a, p)
    if (rej) throw new Error(rej.reason)
    r = attackService.advance(ctx)
  }
  return events as GameEvent[]
}
const of = <T extends GameEvent['type']>(evs: GameEvent[], type: T) => evs.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const coverModules = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, los: { ...DEFAULT_MODULES.services.los, benefitOfCover: () => true } } }

describe('MOR-2.1 Waaagh!', () => {
  it('MOR-006 Waaagh! called: Snagga choppa S5 A3 -> S6 A4 with a 5+ invuln; squighog jaws S6 -> S7 but A stays 3; Squighogs may charge after Advancing', () => {
    const s = makeState()
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    hookService.onWindow(ctx, 'round.start', '2')
    const pending = s.pending as ChooseOptionDecision
    expect(pending.player).toBe('A')
    s.pending = null
    expect(hookService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: 'call' } as Action, pending as PendingDecision)).toBeFalsy()
    const boy = s.models[BOY]
    const choppa = s.weapons['ork.w.choppa-snagga']
    const stat = (unitId: string, modelId: string, w: typeof choppa, st: 'S' | 'A', base: number) => hookService.statFor(s, { unitId, modelId, weapon: w, stat: st }, base)
    expect(stat(SNAG, boy.id, choppa, 'S', choppa.S)).toBe(6)
    expect(stat(SNAG, boy.id, choppa, 'A', choppa.A as number)).toBe(4)
    const hog = s.units[HOGS].models[0]
    const jaws = s.weapons['ork.w.squighog-jaws']
    expect(stat(HOGS, hog, jaws, 'S', jaws.S)).toBe(7)
    expect(stat(HOGS, hog, jaws, 'A', jaws.A as number)).toBe(3)
    expect(results(s, 'onSaveRoll', atk(s, 'B:boyz-a#1', 'ork.w.slugga', SNAG, { targetModelId: boy.id }))).toContainEqual({ kind: 'roll', invuln: 5 })
    s.units[HOGS].turn.moveType = 'advance'
    expect(hookService.eligibilityFor(s, HOGS, 'charge')).toBe(true)
  })
})

describe('MOR-6 Beast Snagga datasheets', () => {
  it('MOR-007 Beastboss: attached, a Boy melee hit roll gets +1 (a natural 2 hits on 3+); ranged unchanged; a detached Snagga unit gets nothing', () => {
    const s = makeState()
    const mod = (st: GameState, weapon: string) => results(st, 'onHitRoll', atk(st, BOY, weapon, BOYZ)).filter((r) => typeof r.modifier === 'number').reduce((n, r) => n + (r.modifier as number), 0)
    expect(mod(s, 'ork.w.choppa-snagga')).toBe(1)
    expect(mod(s, 'ork.w.slugga')).toBe(0)
    const loose = makeState({ attachments: [] })
    expect(mod(loose, 'ork.w.choppa-snagga')).toBe(0)
    const evs = runAttack(s, BOY, 'ork.w.choppa-snagga', BOYZ, [2], 'melee', DEFAULT_MODULES, 1)
    expect(of(evs, 'HitRolled')[0]).toMatchObject({ die: 2, hit: true })
  })

  it('MOR-008 Monster Hunters: Snagga Boyz may re-roll hits vs a VEHICLE, not vs INFANTRY; an attached Morgrim re-rolls vs a VEHICLE too', () => {
    const s = makeState()
    const rerolls = (model: string, weapon: string, target: string) => results(s, 'onHitRoll', atk(s, model, weapon, target)).filter((r) => r.reroll === 'all').length
    expect(rerolls(BOY, 'ork.w.choppa-snagga', 'B:deff-dread')).toBeGreaterThan(0)
    expect(rerolls(BOY, 'ork.w.choppa-snagga', BOYZ)).toBe(0)
    expect(rerolls(s.units[BOSS].models[0], 'ork.w.beastchoppa', 'B:deff-dread')).toBeGreaterThan(0)
    expect(rerolls(s.units[BOSS].models[0], 'ork.w.beastchoppa', BOYZ)).toBe(0)
  })

  it('MOR-009 Anti-VEHICLE 4+ makes an unmodified wound 4 critical; Lance +1 to wound only on a charge; Assault weapons may fire after Advancing', () => {
    const s = makeState()
    const boss = s.units[BOSS].models[0]
    const evs = runAttack(s, boss, 'ork.w.beastchoppa', 'B:deff-dread', Array(12).fill(4), 'melee')
    expect(of(evs, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: true })
    const infantry = runAttack(makeState(), boss, 'ork.w.beastchoppa', BOYZ, Array(12).fill(4), 'melee')
    expect(of(infantry, 'WoundRolled')[0].critical).toBe(false)
    const woundFinal = (charged: boolean): number => {
      const st = makeState()
      st.units[HOGS].turn.chargedThisTurn = charged
      return of(runAttack(st, st.units[HOGS].models[1], 'ork.w.stikka', BOYZ, [6, 6, 6, 3, 3, 3], 'melee'), 'WoundRolled')[0].final
    }
    expect(woundFinal(true)).toBe(woundFinal(false) + 1) // Lance
    expect(s.weapons['ork.w.saddlegit-weapons'].abilities.some((a) => a.ability === 'ASSAULT')).toBe(true)
  })

  it('MOR-010 Half-chewed: an attached Snagga Boy loses a wound -> Feel No Pain 5+ (not 6+), a single roll', () => {
    const s = makeState()
    const fnp = results(s, 'onFeelNoPainRoll', atk(s, 'B:boyz-a#1', 'ork.w.slugga', SNAG, { targetModelId: BOY }))
    expect(fnp).toContainEqual({ kind: 'roll', feelNoPain: 5 })
    const evs = runAttack(s, 'B:boyz-a#1', 'ork.w.slugga', SNAG, [6, 6, 1, 5], 'ranged')
    const rolls = of(evs, 'FeelNoPainRolled')
    expect(rolls).toHaveLength(1)
    expect(rolls[0].needed).toBe(5)
    expect(rolls[0]).toMatchObject({ die: 5, ignored: true })
    const plain = makeState({ enhancementId: 'ork.e.bosskilla' })
    expect(of(runAttack(plain, 'B:boyz-a#1', 'ork.w.slugga', SNAG, [6, 6, 1, 5], 'ranged'), 'FeelNoPainRolled')[0]).toMatchObject({ needed: 6, ignored: false })
  })

  it('MOR-011 Half-chewed: ranged AP0 vs a Snagga Boy (Sv5+) saves on 4+; melee AP0 stays 5+; with cover still 4+ (total +1 cap)', () => {
    const save = (kind: 'ranged' | 'melee', die: number, modules = DEFAULT_MODULES) => {
      const s = makeState()
      const weapon = kind === 'ranged' ? 'ork.w.slugga' : 'ork.w.close-combat-weapon'
      s.weapons = { ...s.weapons, [weapon]: { ...s.weapons[weapon], AP: 0 } }
      return of(runAttack(s, 'B:boyz-a#1', weapon, SNAG, [6, 6, die], kind, modules), 'SaveRolled')[0]
    }
    expect(save('ranged', 4)).toMatchObject({ kind: 'armour', die: 4, final: 5, saved: true })
    expect(save('ranged', 3)).toMatchObject({ saved: false })
    expect(save('melee', 4)).toMatchObject({ die: 4, final: 4, saved: false })
    expect(save('ranged', 4, coverModules)).toMatchObject({ final: 5, saved: true })
    expect(save('ranged', 3, coverModules)).toMatchObject({ final: 4, saved: false })
  })

  it('MOR-012 Half-chewed C1: during a Waaagh!, ranged AP-2 vs a Snagga Boy -> armour 6+, invuln 5+ taken; the +1 never improves the invuln to 4+', () => {
    const run = (die: number) => {
      const s = makeState()
      callWaaagh(s)
      s.weapons = { ...s.weapons, 'ork.w.slugga': { ...s.weapons['ork.w.slugga'], AP: -2 } }
      return of(runAttack(s, 'B:boyz-a#1', 'ork.w.slugga', SNAG, [6, 6, die], 'ranged'), 'SaveRolled')[0]
    }
    expect(run(5)).toMatchObject({ kind: 'invuln', needed: 5, saved: true })
    expect(run(4)).toMatchObject({ kind: 'invuln', needed: 5, saved: false })
  })

  it('MOR-013 Bosskilla: Morgrim beastchoppa gains Sustained Hits 1 and Precision; the Boyz choppas and his shoota do not; a hit 6 adds an extra hit', () => {
    const s = makeState({ enhancementId: 'ork.e.bosskilla' })
    const boss = s.units[BOSS].models[0]
    const abil = (modelId: string, w: string) => hookService.weaponAbilitiesFor(s, modelId, s.weapons[w]).map((a) => a.ability)
    expect(abil(boss, 'ork.w.beastchoppa')).toEqual(expect.arrayContaining(['SUSTAINED_HITS', 'PRECISION']))
    expect(abil(BOY, 'ork.w.choppa-snagga')).not.toContain('PRECISION')
    expect(abil(BOY, 'ork.w.choppa-snagga')).not.toContain('SUSTAINED_HITS')
    expect(abil(boss, 'ork.w.shoota-beastboss')).not.toContain('SUSTAINED_HITS')
    const evs = runAttack(s, boss, 'ork.w.beastchoppa', BOYZ, [6], 'melee', DEFAULT_MODULES, 1)
    expect(of(evs, 'HitRolled')[0]).toMatchObject({ critical: true, extraHits: 1 })
  })
})
