// Tyranids code hooks (docs/spec/factions/tyranids.md §7, checklist TYR-*): Synapse, Shadow in the Warp, Psychostatic Veil,
// Secretion Goad, Alpha Xenoform, Chitinous Tide, Hyper-Reactive, Voracious Assault, Teeming Broods, Feeding Frenzy,
// Skulking Horrors, Disruption Bombardment, patrol load. The engine-level pieces (Death Blow, reserves, reactive move,
// Infiltrators, cost override, Patrol Squads) are covered in tyranids-core.test.ts. Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel, deploymentZone, modelStats,
  type AttackContext, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision,
  type PlayerSetup, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { hookService } from '../../src/engine/hooks-impl'
import { objectiveService } from '../../src/engine/objectives'
import { commandModule } from '../../src/engine/phases/command'
import { movementModule } from '../../src/engine/phases/movement'
import { keywordsOf, spawnUnitCopy } from '../../src/engine/state'
import type { Action } from '../../src/engine'
import { splitPatrolSquad } from '../../src/engine/setup'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { chitinousTideAmount } from '../../src/engine/factions/tyranids'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TYR = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Tyranids', faction: 'tyranids', patrolId: 'tyr.cp.vardenghast-swarm', enhancementId: 'tyr.e.psychostatic-veil', secondaryId: 'tyr.sec.alpha-xenoform',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const PRIME = 'A:prime', PSY = 'A:psychophage', TERM = 'A:termagants', BARB = 'A:barbgaunts', LEAP = 'A:leapers'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'
const SHADOW = 'tyr.a.shadow-in-the-warp'

function makeState(o: { round?: number; a?: Partial<PlayerSetup> } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TYR(o.a), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'tyranids-hooks', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
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

// a compact block of models (5 per row, 1.3" pitch) starting at (x, z)
function block(s: GameState, unitId: string, x: number, z: number): void {
  placeUnit(s, unitId, s.units[unitId].models.map((_, i): [number, number] => [x + (i % 5) * 1.3, z + Math.floor(i / 5) * 1.3]))
}

function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
const pendingOption = (s: GameState): ChooseOptionDecision | null => (s.pending && s.pending.kind === 'chooseOption' ? s.pending : null)

function attackOf(s: GameState, attackerUnit: string, targetUnit: string, kind: 'ranged' | 'melee'): AttackContext {
  const am = s.models[s.units[attackerUnit].models[0]]
  const wid = am.weapons.find((w) => s.weapons[w].kind === kind)!
  return {
    kind, overwatch: false, attackerUnitId: attackerUnit, attackerModelId: am.id, weapon: weaponService.effectiveWeapon(s, am.id, wid),
    targetUnitId: targetUnit, targetModelId: s.units[targetUnit].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget: false,
    attackerInEngagement: kind === 'melee',
  }
}
const rollCtx = (purpose: 'hit' | 'wound' | 'save') => ({ purpose, roll: null as never, dieIndex: 0, unmodified: 4, rerolled: false })
function hitMods(s: GameState, ctx: EngineContext, attack: AttackContext, hook: 'onHitRoll' | 'onWoundRoll'): { modifier: number; reroll?: string } {
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

function useStratagem(s: GameState, ctx: EngineContext, player: 'A' | 'B', stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string }, target: string): void {
  const action = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === target)
  if (!action) throw new Error(`${stratagemId} on ${target} not offered`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}

// =====================================================================================================================
describe('Synapse (TYR-2.1 – 2.3)', () => {
  it('TYR-001 TYR-2.2: Termagants within 6" of the Prime test on three dice added together', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, PRIME, [[0, 0]])
    block(s, TERM, 4, 0)
    const { ctx, events } = ctxOf(s, [3, 3, 3])
    hookService.battleShockTest(ctx, TERM, 'test')
    const rolls = of(events, 'DiceRolled').map((e) => e.roll)
    expect(rolls).toHaveLength(1)
    expect(rolls[0].dice).toHaveLength(3)
    expect(of(events, 'BattleShockTested')[0].roll).toBe(9)
  })

  it('TYR-002 TYR-2.1: Termagants with no model within 6" of the Prime test on 2D6', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, PRIME, [[0, 0]])
    block(s, TERM, 9, 0)
    const { ctx, events } = ctxOf(s, [3, 3])
    hookService.battleShockTest(ctx, TERM, 'test')
    expect(of(events, 'DiceRolled')[0].roll.dice).toHaveLength(2)
    expect(of(events, 'BattleShockTested')[0].roll).toBe(6)
  })

  it('TYR-003 TYR-2.3: the Prime tests on 3D6 while alive; once it is destroyed every Tyranid test is 2D6', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, PRIME, [[0, 0]])
    block(s, TERM, 4, 0)
    const a = ctxOf(s, [2, 2, 2])
    hookService.battleShockTest(a.ctx, PRIME, 'test')
    expect(of(a.events, 'DiceRolled')[0].roll.dice).toHaveLength(3)
    removeModel(s, s.units[PRIME].models[0])
    expect(s.units[PRIME].location).toBe('destroyed')
    const b = ctxOf(s, [2, 2])
    hookService.battleShockTest(b.ctx, TERM, 'test')
    expect(of(b.events, 'DiceRolled')[0].roll.dice).toHaveLength(2)
  })

  it('TYR-004 TYR-2.1: Synapse only helps its owner — an enemy unit within 6" of the Prime tests on 2D6', () => {
    const s = makeState()
    phase(s, 'command', 'B')
    placeUnit(s, PRIME, [[0, 0]])
    placeUnit(s, BOYZ, [[3, 0]])
    const { ctx, events } = ctxOf(s, [3, 3])
    hookService.battleShockTest(ctx, BOYZ, 'test')
    expect(of(events, 'DiceRolled')[0].roll.dice).toHaveLength(2)
  })
})

// =====================================================================================================================
describe('Shadow in the Warp (TYR-2.4 – 2.5)', () => {
  it('TYR-005 TYR-2.4: offered at own command.start; used → every enemy board unit tests once; never offered again this battle', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, PRIME, [[0, 0]])
    placeUnit(s, BOYZ, [[-15, 8]])
    placeUnit(s, BOYZ2, [[-15, -8]])
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6])
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.context.abilityId).toBe(SHADOW)
    expect(pending.options.map((o) => o.id)).toEqual(['use', 'decline'])
    answer(ctx, 'use')
    expect(of(events, 'BattleShockTested').map((e) => e.unitId).sort()).toEqual([BOYZ, BOYZ2].sort())
    expect(s.players.A.oncePerBattleUsed).toContain(SHADOW)
    // a later Command phase: no offer
    phase(s, 'command', 'A')
    s.round = 3
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('TYR-005 TYR-2.4: declining keeps the use for a later Command phase', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, PRIME, [[0, 0]])
    placeUnit(s, BOYZ, [[-15, 8]])
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    answer(ctx, 'decline')
    expect(s.players.A.oncePerBattleUsed).not.toContain(SHADOW)
    phase(s, 'command', 'B')
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    expect(pendingOption(s)!.player).toBe('A')
  })

  it('TYR-006 TYR-2.5: offered to the Tyranid player in the opponent\'s Command phase; a failed unit stays shocked', () => {
    const s = makeState()
    phase(s, 'command', 'B')
    placeUnit(s, PRIME, [[0, 0]])
    placeUnit(s, BOYZ, [[-15, 8]])
    const { ctx, events } = ctxOf(s, [1, 1])
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    expect(pendingOption(s)!.player).toBe('A')
    answer(ctx, 'use')
    expect(of(events, 'BattleShocked').map((e) => e.unitId)).toEqual([BOYZ])
    expect(s.units[BOYZ].battleShocked).toBe(true)
  })

  it('TYR-007 TYR-2.4: not offered while the Prime is in Reserves or destroyed', () => {
    const s = makeState()
    phase(s, 'command', 'A')
    placeUnit(s, BOYZ, [[-15, 8]])
    s.units[PRIME].location = 'reserves'
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(false)
    placeUnit(s, PRIME, [[0, 0]])
    removeModel(s, s.units[PRIME].models[0])
    phase(s, 'command', 'A')
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(false)
    expect(s.pending).toBeNull()
  })
})

// =====================================================================================================================
describe('Psychostatic Veil (TYR-3)', () => {
  it('TYR-008 TYR-3: the Prime has a 4+ invuln; a melee hit roll against it gets -1; a ranged hit roll is unchanged', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    placeUnit(s, PRIME, [[0, 0]])
    placeUnit(s, BOYZ, [[1.5, 0]])
    const { ctx } = ctxOf(s, [])
    const melee = attackOf(s, BOYZ, PRIME, 'melee')
    const ranged = attackOf(s, BOYZ, PRIME, 'ranged')
    expect(hitMods(s, ctx, melee, 'onHitRoll').modifier).toBe(-1)
    expect(hitMods(s, ctx, ranged, 'onHitRoll').modifier).toBe(0)
    const saves = hookService.collect(ctx, 'onSaveRoll', { attack: melee, roll: rollCtx('save') } as never)
    expect(saves.some(({ result }) => result.kind === 'roll' && result.invuln === 4)).toBe(true)
  })

  it('TYR-008 TYR-3: the Veil gives nothing to a unit that is not the bearer', () => {
    const s = makeState()
    phase(s, 'fight', 'B')
    placeUnit(s, TERM, [[0, 0]])
    placeUnit(s, BOYZ, [[1.2, 0]])
    const { ctx } = ctxOf(s, [])
    expect(hitMods(s, ctx, attackOf(s, BOYZ, TERM, 'melee'), 'onHitRoll').modifier).toBe(0)
  })
})

// =====================================================================================================================
describe('Secretion Goad (TYR-3)', () => {
  const goadState = (): GameState => {
    const s = makeState({ a: { enhancementId: 'tyr.e.secretion-goad' } })
    phase(s, 'shooting', 'A')
    placeUnit(s, PRIME, [[0, -12]])
    block(s, BARB, 3, -12)
    return s
  }
  const apOf = (s: GameState, unitId: string): number => {
    const m = s.models[s.units[unitId].models[0]]
    const w = s.weapons[m.weapons.find((id) => s.weapons[id].kind === 'ranged')!]
    return hookService.statFor(s, { unitId, modelId: m.id, weapon: w, stat: 'AP' }, w.AP)
  }

  it('TYR-010 TYR-3: Barbgaunts within 6" of the bearer declare targets → offered; used → AP improves by 1 until the end of the phase only', () => {
    const s = goadState()
    const { ctx } = ctxOf(s, [])
    const base = apOf(s, BARB)
    expect(hookService.offerPicks!(ctx, 'shooting.targetsDeclared', BARB)).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.context.data).toMatchObject({ code: 'secretionGoadShoot' })
    answer(ctx, 'use')
    expect(apOf(s, BARB)).toBe(base - 1)
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(apOf(s, BARB)).toBe(base)
  })

  it('TYR-011 TYR-3: once per turn — used in Shooting it is not offered in that turn\'s Fight; the next turn (even the opponent\'s Fight phase) it is', () => {
    const s = goadState()
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.targetsDeclared', BARB)).toBe(true)
    answer(ctx, 'use')
    phase(s, 'fight', 'A')
    expect(hookService.offerPicks!(ctx, 'fight.unitSelected', BARB)).toBe(false)
    expect(s.pending).toBeNull()
    phase(s, 'fight', 'B')
    expect(hookService.offerPicks!(ctx, 'fight.unitSelected', BARB)).toBe(true)
    expect(pendingOption(s)!.context.data).toMatchObject({ code: 'secretionGoadFight' })
  })

  it('TYR-011 TYR-3: declining does not spend the once-per-turn use', () => {
    const s = goadState()
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.targetsDeclared', BARB)).toBe(true)
    answer(ctx, 'decline')
    block(s, TERM, 4, -8)
    expect(hookService.offerPicks!(ctx, 'shooting.targetsDeclared', TERM)).toBe(true)
  })

  it('TYR-012 TYR-3: not offered for a unit with no model within 6" of the bearer', () => {
    const s = goadState()
    block(s, BARB, 3, 9)
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.targetsDeclared', BARB)).toBe(false)
    expect(s.pending).toBeNull()
  })
})

// =====================================================================================================================
describe('Secondaries (TYR-4)', () => {
  const vpScored = (events: GameEvent[], player: 'A' | 'B') => of(events, 'VpScored').filter((e) => e.player === player).map((e) => e.amount)

  it('TYR-013 TYR-4: Alpha Xenoform — the Prime killed a model this phase → +4 VP at phase end; a kill by Termagants → 0', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    s.players.A.secondaryState.killsThisPhase = { [`${PRIME}#0`]: 1 }
    const a = ctxOf(s, [])
    a.ctx.services.missions.onWindow(a.ctx, 'phase.end', 'fight')
    expect(vpScored(a.events, 'A')).toEqual([4])
    expect(s.players.A.secondaryState.killsThisPhase).toEqual({})
    phase(s, 'fight', 'A')
    s.players.A.secondaryState.killsThisPhase = { [`${TERM}#0`]: 3 }
    const b = ctxOf(s, [])
    b.ctx.services.missions.onWindow(b.ctx, 'phase.end', 'fight')
    expect(vpScored(b.events, 'A')).toEqual([])
  })

  it('TYR-013 TYR-4: Alpha Xenoform scores at the end of the opponent\'s phases too', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    s.players.A.secondaryState.killsThisPhase = { [`${PRIME}#0`]: 1 }
    const { ctx, events } = ctxOf(s, [])
    ctx.services.missions.onWindow(ctx, 'phase.end', 'shooting')
    expect(vpScored(events, 'A')).toEqual([4])
  })

  describe('Chitinous Tide', () => {
    const rule = (s: GameState) => ({ ...s.mission.secondaries.A[0], pointsPer: 5, params: { withinInches: 6 } })
    const sideState = (): { s: GameState; place: (d: number) => { x: number; z: number } } => {
      const s = makeState({ a: { secondaryId: 'tyr.sec.chitinous-tide' } })
      const zone = deploymentZone(s, 'B')
      const xs = zone.map((p) => p.x)
      const zs = zone.map((p) => p.z)
      const left = Math.max(...xs) < 0
      const edgeX = left ? Math.max(...xs) : Math.min(...xs)
      const midZ = (Math.min(...zs) + Math.max(...zs)) / 2
      return { s, place: (d) => ({ x: left ? edgeX + d : edgeX - d, z: midZ }) }
    }
    const amountAt = (d: number, count = 1): number => {
      const { s, place } = sideState()
      const ids = Object.keys(s.objectives).slice(0, count)
      ids.forEach((id, i) => { const p = place(d); s.objectives[id].pos = { x: p.x, z: p.z + i * 6 } })
      const r = { ...rule(s), code: 'chitinousTide' } as never
      return chitinousTideAmount(s, r, 'A', (id) => ids.includes(id))
    }

    it('TYR-015 TYR-4: a controlled marker 5" outside the enemy zone → 5; 7" outside → 0; centre 6.5" outside (edge within 6") → 5; two markers → still 5', () => {
      expect(amountAt(5)).toBe(5)
      expect(amountAt(7)).toBe(0)
      expect(amountAt(6.5)).toBe(5)
      expect(amountAt(5, 2)).toBe(5)
    })

    it('TYR-015 TYR-4: a marker the player does not control does not count', () => {
      const { s, place } = sideState()
      const id = Object.keys(s.objectives)[0]
      s.objectives[id].pos = place(3)
      expect(chitinousTideAmount(s, { ...rule(s), code: 'chitinousTide' } as never, 'A', () => false)).toBe(0)
    })
  })
})

// =====================================================================================================================
describe('Stratagems (TYR-5)', () => {
  it('TYR-016 TYR-5.1: Hyper-Reactive after the enemy targets Termagants in the opponent\'s Shooting → their hit rolls -1; not offered for the Psychophage', () => {
    const s = makeState()
    phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, TERM, [[0, 0]])
    placeUnit(s, PSY, [[0, 6]])
    placeUnit(s, BOYZ, [[0, 12]])
    const { ctx } = ctxOf(s, [])
    stratagemService.recordTargets(ctx, BOYZ, [TERM, PSY])
    const offered = stratagemService.options(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ }).filter((x) => x.stratagemId === 'tyr.s.hyper-reactive')
    expect(offered.map((x) => x.targets.unitIds![0])).toEqual([TERM])
    useStratagem(s, ctx, 'A', 'tyr.s.hyper-reactive', 'shooting.targetsDeclared', { unitId: BOYZ }, TERM)
    expect(s.players.A.cp).toBe(2)
    expect(hitMods(s, ctx, attackOf(s, BOYZ, TERM, 'ranged'), 'onHitRoll').modifier).toBe(-1)
    expect(hitMods(s, ctx, attackOf(s, BOYZ, PSY, 'ranged'), 'onHitRoll').modifier).toBe(0)
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(hitMods(s, ctx, attackOf(s, BOYZ, TERM, 'ranged'), 'onHitRoll').modifier).toBe(0)
  })

  it('TYR-016 TYR-5.1: not offered in the Tyranid player\'s own Shooting phase', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    placeUnit(s, TERM, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 12]])
    const { ctx } = ctxOf(s, [])
    stratagemService.recordTargets(ctx, BOYZ, [TERM])
    expect(stratagemService.options(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ }).some((x) => x.stratagemId === 'tyr.s.hyper-reactive')).toBe(false)
  })

  it('TYR-017 TYR-5.1: Hyper-Reactive in a Fight phase after an enemy selects the Leapers as its melee target', () => {
    const s = makeState()
    phase(s, 'fight', 'B', { A: 3 })
    placeUnit(s, LEAP, [[0, 0]])
    placeUnit(s, BOYZ, [[1.4, 0]])
    const { ctx } = ctxOf(s, [])
    stratagemService.recordTargets(ctx, BOYZ, [LEAP])
    useStratagem(s, ctx, 'A', 'tyr.s.hyper-reactive', 'fight.targetsDeclared', { unitId: BOYZ }, LEAP)
    expect(hitMods(s, ctx, attackOf(s, BOYZ, LEAP, 'melee'), 'onHitRoll').modifier).toBe(-1)
  })

  it('TYR-018 TYR-5.2: Voracious Assault — a hit re-roll against the closest eligible enemy, none against a farther unit', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    placeUnit(s, TERM, [[-14, 0]])
    placeUnit(s, BOYZ, [[-14, 7]])
    placeUnit(s, BOYZ2, [[-14, 12]])
    const { ctx } = ctxOf(s, [])
    useStratagem(s, ctx, 'A', 'tyr.s.voracious-assault', 'shooting.start', {}, TERM)
    expect(s.players.A.cp).toBe(2)
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ, 'ranged'), 'onHitRoll').reroll).toBe('all')
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ2, 'ranged'), 'onHitRoll').reroll).toBeUndefined()
  })

  it('TYR-019 TYR-5.2: two enemy units tied for closest both get the re-roll', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    placeUnit(s, TERM, [[-14, 0]])
    placeUnit(s, BOYZ, [[-17, 7]])
    placeUnit(s, BOYZ2, [[-11, 7]])
    const { ctx } = ctxOf(s, [])
    useStratagem(s, ctx, 'A', 'tyr.s.voracious-assault', 'shooting.start', {}, TERM)
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ, 'ranged'), 'onHitRoll').reroll).toBe('all')
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ2, 'ranged'), 'onHitRoll').reroll).toBe('all')
  })

  describe('Teeming Broods', () => {
    const reinforcements = (s: GameState, ctx: EngineContext, target: string): void =>
      useStratagem(s, ctx, 'A', 'tyr.s.teeming-broods', 'movement.reinforcements', {}, target)

    it('TYR-020 TYR-5.3: Termagants at 12/20, D6 = 4 → 16 models, back at full wounds, in coherency and out of Engagement Range', () => {
      const s = makeState()
      phase(s, 'movement', 'A', { A: 2 })
      block(s, TERM, 4, 0)
      placeUnit(s, BOYZ, [[-20, 0]])
      for (const id of s.units[TERM].models.slice(12)) removeModel(s, id)
      expect(s.units[TERM].models).toHaveLength(12)
      const { ctx, events } = ctxOf(s, [4])
      reinforcements(s, ctx, TERM)
      expect(s.units[TERM].models).toHaveLength(16)
      expect(s.players.A.cp).toBe(1)
      const returned = of(events, 'ModelReturned')
      expect(returned).toHaveLength(4)
      for (const e of returned) {
        const m = s.models[e.modelId]
        expect(m.woundsRemaining).toBe(modelStats(s, m).W)
        const near = s.units[TERM].models.filter((id) => id !== m.id).some((id) => Math.hypot(s.models[id].pos.x - m.pos.x, s.models[id].pos.z - m.pos.z) <= m.base.radius * 2 + 2.01)
        expect(near).toBe(true)
        expect(Math.hypot(m.pos.x + 20, m.pos.z)).toBeGreaterThan(3)
      }
    })

    it('TYR-021 TYR-5.3: a split 10-model unit at 8/10 with D6 = 5 → only 2 models return (Starting Strength cap)', () => {
      const s = makeState()
      phase(s, 'movement', 'A', { A: 2 })
      splitPatrolSquad(s, TERM, [10, 10])
      expect(s.units[TERM].startingStrength).toBe(10)
      block(s, TERM, 4, 0)
      for (const id of s.units[TERM].models.slice(8)) removeModel(s, id)
      const { ctx, events } = ctxOf(s, [5])
      reinforcements(s, ctx, TERM)
      expect(of(events, 'ModelReturned')).toHaveLength(2)
      expect(s.units[TERM].models).toHaveLength(10)
    })

    it('TYR-022 TYR-5.4: on a destroyed Termagants unit, 2D6 = 7 → a new Reserves unit with 7 models (Starting Strength 7); the original stays destroyed', () => {
      const s = makeState()
      phase(s, 'movement', 'A', { A: 2 })
      block(s, TERM, 4, 0)
      for (const id of [...s.units[TERM].models]) removeModel(s, id)
      expect(s.units[TERM].location).toBe('destroyed')
      const { ctx, events } = ctxOf(s, [3, 4])
      reinforcements(s, ctx, TERM)
      const copy = Object.values(s.units).find((u) => u.id.startsWith(`${TERM}~`))!
      expect(copy).toBeDefined()
      expect(copy.location).toBe('reserves')
      expect(copy.models).toHaveLength(7)
      expect(copy.startingStrength).toBe(7)
      expect(s.units[TERM].location).toBe('destroyed')
      expect(of(events, 'UnitDeployed')).toMatchObject([{ unitId: copy.id, toReserves: true }])
    })

    it('TYR-022 TYR-5.4: the new unit is capped at 20 models', () => {
      const s = makeState()
      phase(s, 'movement', 'A', { A: 2 })
      block(s, TERM, 4, 0)
      for (const id of [...s.units[TERM].models]) removeModel(s, id)
      const { ctx } = ctxOf(s, [6, 6])
      reinforcements(s, ctx, TERM)
      expect(Object.values(s.units).find((u) => u.id.startsWith(`${TERM}~`))!.models).toHaveLength(12)
    })
  })
})

// =====================================================================================================================
describe('Feeding Frenzy (TYR-6.2)', () => {
  it('TYR-029 TYR-6.2: Psychophage melee — full-strength target no modifier; 19/20 → +1 hit; 9/20 → +1 hit and +1 wound', () => {
    const s = makeState()
    phase(s, 'fight', 'A')
    placeUnit(s, PSY, [[0, 0]])
    block(s, TERM, 4, 0)
    const { ctx } = ctxOf(s, [])
    const melee = () => attackOf(s, PSY, TERM, 'melee')
    expect(hitMods(s, ctx, melee(), 'onHitRoll').modifier).toBe(0)
    expect(hitMods(s, ctx, melee(), 'onWoundRoll').modifier).toBe(0)
    removeModel(s, s.units[TERM].models[19])
    expect(hitMods(s, ctx, melee(), 'onHitRoll').modifier).toBe(1)
    expect(hitMods(s, ctx, melee(), 'onWoundRoll').modifier).toBe(0)
    for (const id of s.units[TERM].models.slice(9)) removeModel(s, id)
    expect(s.units[TERM].models).toHaveLength(9)
    expect(hitMods(s, ctx, melee(), 'onHitRoll').modifier).toBe(1)
    expect(hitMods(s, ctx, melee(), 'onWoundRoll').modifier).toBe(1)
  })

  it('TYR-030 TYR-6.2: Feeding Frenzy does not apply to the psychoclastic torrent (ranged)', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    placeUnit(s, PSY, [[0, 0]])
    block(s, TERM, 4, 0)
    for (const id of s.units[TERM].models.slice(9)) removeModel(s, id)
    const { ctx } = ctxOf(s, [])
    expect(hitMods(s, ctx, attackOf(s, PSY, TERM, 'ranged'), 'onHitRoll').modifier).toBe(0)
    expect(hitMods(s, ctx, attackOf(s, PSY, TERM, 'ranged'), 'onWoundRoll').modifier).toBe(0)
  })
})

// =====================================================================================================================
describe('Skulking Horrors (TYR-6.3)', () => {
  const skulkState = (gap: number, moveType: 'normal' | 'advance' | 'fallBack' | null = 'normal'): GameState => {
    const s = makeState()
    phase(s, 'movement', 'B')
    block(s, TERM, 4, 0)
    // the enemy's nearest edge sits `gap` inches from the Termagants block
    placeUnit(s, BOYZ, [[4 + 4 * 1.3 + 0.55 + gap + 0.6, 0]])
    s.units[BOYZ].turn.moveType = moveType
    return s
  }

  it('TYR-031 TYR-6.3: an enemy ends a Normal move 8" away → offered to the Tyranid player; used → D6" Normal move; a second enemy move this turn → no offer', () => {
    const s = skulkState(8)
    const { ctx, events } = ctxOf(s, [4])
    expect(hookService.offerPicks!(ctx, 'movement.unitMoved', BOYZ)).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.player).toBe('A')
    expect(pending.context.data).toMatchObject({ code: 'skulkingHorrors' })
    answer(ctx, 'use')
    expect(s.pending?.kind).toBe('moveUnit')
    expect(s.pending && s.pending.kind === 'moveUnit' && s.pending.constraints.maxDistance).toBe(4)
    expect(of(events, 'DiceRolled')[0].roll.dice).toEqual([4])
    s.pending = null
    placeUnit(s, BOYZ2, [[4 + 4 * 1.3 + 0.55 + 8 + 0.6, 4]])
    s.units[BOYZ2].turn.moveType = 'advance'
    expect(hookService.offerPicks!(ctx, 'movement.unitMoved', BOYZ2)).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('TYR-031 TYR-6.3: declining leaves the use available for a later enemy move', () => {
    const s = skulkState(8)
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'movement.unitMoved', BOYZ)).toBe(true)
    answer(ctx, 'decline')
    placeUnit(s, BOYZ2, [[4 + 4 * 1.3 + 0.55 + 8 + 0.6, 4]])
    s.units[BOYZ2].turn.moveType = 'fallBack'
    expect(hookService.offerPicks!(ctx, 'movement.unitMoved', BOYZ2)).toBe(true)
  })

  it('TYR-032 TYR-6.3: not offered when the enemy ends 10" away, when the Termagants are in Engagement Range, or after a non-move', () => {
    expect(hookService.offerPicks!(ctxOf(skulkState(10)).ctx, 'movement.unitMoved', BOYZ)).toBe(false)
    const engaged = skulkState(8)
    placeUnit(engaged, BOYZ2, [[6, 5.4]])
    block(engaged, TERM, 4, 0)
    expect(hookService.offerPicks!(ctxOf(engaged).ctx, 'movement.unitMoved', BOYZ)).toBe(false)
    expect(hookService.offerPicks!(ctxOf(skulkState(8, null)).ctx, 'movement.unitMoved', BOYZ)).toBe(false)
  })
})

// =====================================================================================================================
describe('Disruption Bombardment (TYR-6.4)', () => {
  const effectsOn = (s: GameState, unitId: string): number => s.units[unitId].effects.length
  const moveOf = (s: GameState, unitId: string): number => {
    const m = s.models[s.units[unitId].models[0]]
    return hookService.statFor(s, { unitId, modelId: m.id, weapon: null, stat: 'M' }, modelStats(s, m).M)
  }

  it('TYR-033 TYR-6.4: Barbgaunts hit enemy INFANTRY → -2 M, -2 Advance, -2 Charge until the start of the Tyranid player\'s next turn', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    block(s, BARB, 0, 0)
    placeUnit(s, BOYZ, [[0, 14]])
    s.phaseState.marks.push(`hit:${BARB}>${BOYZ}`)
    const base = moveOf(s, BOYZ)
    const { ctx, events } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.attacksResolved', BARB)).toBe(false)
    expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === 'tyr.a.disruption-bombardment')).toBe(true)
    expect(moveOf(s, BOYZ)).toBe(base - 2)
    const adv = hookService.collect(ctx, 'onAdvanceRoll', { movingUnitId: BOYZ, roll: rollCtx('hit') } as never)
    expect(adv.some(({ result }) => result.kind === 'roll' && result.modifier === -2)).toBe(true)
    const chg = hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: BOYZ, targetUnitIds: [BARB], roll: rollCtx('hit') } as never)
    expect(chg.some(({ result }) => result.kind === 'roll' && result.modifier === -2)).toBe(true)
    // the opponent's own turn starting does not end it; the Tyranid player's next turn start does
    ctx.services.effects.expire(ctx, 'nextOwnTurn', 'B')
    expect(effectsOn(s, BOYZ)).toBe(1)
    ctx.services.effects.expire(ctx, 'nextOwnTurn', 'A')
    expect(effectsOn(s, BOYZ)).toBe(0)
    expect(moveOf(s, BOYZ)).toBe(base)
  })

  it('TYR-033 TYR-6.4: several INFANTRY units were hit → the owner chooses one', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    block(s, BARB, 0, 0)
    placeUnit(s, BOYZ, [[0, 14]])
    placeUnit(s, BOYZ2, [[8, 14]])
    s.phaseState.marks.push(`hit:${BARB}>${BOYZ}`, `hit:${BARB}>${BOYZ2}`)
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.attacksResolved', BARB)).toBe(true)
    const pending = pendingOption(s)!
    expect(pending.options.map((o) => o.id).sort()).toEqual([BOYZ, BOYZ2].sort())
    answer(ctx, BOYZ2)
    expect(effectsOn(s, BOYZ2)).toBe(1)
    expect(effectsOn(s, BOYZ)).toBe(0)
  })

  it('TYR-034 TYR-6.4: nothing hit, or only a non-INFANTRY unit was hit → no effect', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    block(s, BARB, 0, 0)
    placeUnit(s, BOYZ, [[0, 14]])
    const big = Object.values(s.units).find((u) => u.player === 'B' && !keywordsOf(s, u.id).includes('INFANTRY'))
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.attacksResolved', BARB)).toBe(false)
    expect(effectsOn(s, BOYZ)).toBe(0)
    if (big) {
      placeUnit(s, big.id, [[8, 14]])
      s.phaseState.marks.push(`hit:${BARB}>${big.id}`)
      s.phaseState.marks = s.phaseState.marks.filter((m) => m !== `pick:disrupt:${BARB}`)
      expect(hookService.offerPicks!(ctx, 'shooting.attacksResolved', BARB)).toBe(false)
      expect(effectsOn(s, big.id)).toBe(0)
    }
  })

  it('TYR-034 TYR-6.4: not triggered in the opponent\'s phase', () => {
    const s = makeState()
    phase(s, 'shooting', 'B')
    block(s, BARB, 0, 0)
    placeUnit(s, BOYZ, [[0, 14]])
    s.phaseState.marks.push(`hit:${BARB}>${BOYZ}`)
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks!(ctx, 'shooting.attacksResolved', BARB)).toBe(false)
    expect(effectsOn(s, BOYZ)).toBe(0)
  })
})

// =====================================================================================================================
describe('Patrol load (TYR-040)', () => {
  it('TYR-040 TYR-1: 5 units, 30 models, the Prime is WARLORD with Psychostatic Veil; default secondary Alpha Xenoform', () => {
    const s = makeState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(30)
    expect(s.units[PRIME].isWarlord).toBe(true)
    expect(s.players.A.warlordUnitId).toBe(PRIME)
    const veil = Object.values(s.abilities).find((a) => a.source === 'enhancement' && a.id.startsWith('tyr.e.psychostatic-veil'))
    expect(veil?.bearerModelId).toBe(s.units[PRIME].models[0])
    expect(s.mission.secondaries.A.map((r) => r.id)).toEqual(['alpha-xenoform'])
  })
})

// =====================================================================================================================
// small attack-sequence driver for the tests below (answers every decision with its first option)
function driveAttack(ctx: EngineContext, events: GameEvent[]): GameEvent[] {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending || !('options' in pending) || pending.options.length === 0) throw new Error('driveAttack: nothing to answer')
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, pending.options[0].action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return events
}
const declare = (s: GameState, unitId: string, targetUnitId: string, kind: 'ranged' | 'melee', attacks: number | null = null, weaponHint?: string) => {
  const m = s.models[s.units[unitId].models[0]]
  const weaponId = m.weapons.find((w) => (weaponHint ? w === weaponHint : s.weapons[w].kind === kind))!
  return { modelId: m.id, weaponId, targetUnitId, profileGroup: null, attacks }
}
const TAIL = Array(60).fill(2)
const radius = (s: GameState, unitId: string) => s.models[s.units[unitId].models[0]].base.radius
// swaps in a copy of an enemy datasheet carrying an extra keyword / core ability (the shared bundle is never mutated)
function patchDatasheet(s: GameState, unitId: string, patch: { keyword?: string; core?: string }): void {
  const ds = s.datasheets[s.units[unitId].datasheetId]
  s.datasheets = {
    ...s.datasheets,
    [ds.id]: { ...ds, keywords: patch.keyword ? [...ds.keywords, patch.keyword] : ds.keywords, coreAbilities: patch.core ? [...ds.coreAbilities, { ability: patch.core } as never] : ds.coreAbilities },
  }
}

describe('Voracious Assault closest target is fixed at declaration (TYR-5.2)', () => {
  it('TYR-018 TYR-5.2: split fire — when the closest unit is wiped out by an earlier group, the farther unit still gets no re-roll', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    placeUnit(s, TERM, [[-14, 0], [-12.7, 0]])
    placeUnit(s, BOYZ, [[-14, 7]])
    placeUnit(s, BOYZ2, [[-14, 12]])
    const { ctx } = ctxOf(s, [])
    useStratagem(s, ctx, 'A', 'tyr.s.voracious-assault', 'shooting.start', {}, TERM)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: TERM, overwatch: false, targets: [declare(s, TERM, BOYZ, 'ranged', 1), declare(s, TERM, BOYZ2, 'ranged', 1)] })
    // the first group kills the whole nearest unit before the second group rolls
    for (const id of [...s.units[BOYZ].models]) removeModel(s, id)
    expect(s.units[BOYZ].location).toBe('destroyed')
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ2, 'ranged'), 'onHitRoll').reroll).toBeUndefined()
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ, 'ranged'), 'onHitRoll').reroll).toBe('all')
  })

  it('TYR-018 TYR-5.2: a unit that could not be targeted (Lone Operative beyond 12") does not count as closest', () => {
    const s = makeState()
    phase(s, 'shooting', 'A', { A: 3 })
    placeUnit(s, TERM, [[-20, -12]])
    placeUnit(s, 'B:deffkoptas', [[-20, 2]])
    placeUnit(s, BOYZ2, [[-16, 3]])
    patchDatasheet(s, 'B:deffkoptas', { core: 'LONE_OPERATIVE' })
    const { ctx } = ctxOf(s, [])
    useStratagem(s, ctx, 'A', 'tyr.s.voracious-assault', 'shooting.start', {}, TERM)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: TERM, overwatch: false, targets: [declare(s, TERM, BOYZ2, 'ranged', 1)] })
    expect(hitMods(s, ctx, attackOf(s, TERM, BOYZ2, 'ranged'), 'onHitRoll').reroll).toBe('all')
  })
})

describe('Teeming Broods spawn is culled in Reserves (TYR-5.4)', () => {
  it('TYR-024 TYR-5.4: a spawned unit still in Reserves at the end of round 3 is destroyed and the opponent gets no kill credit', () => {
    const s = makeState({ round: 3 })
    phase(s, 'movement', 'B')
    s.firstPlayer = 'A'
    s.step = 'reinforcements'
    block(s, TERM, 4, 0)
    for (const id of [...s.units[TERM].models]) removeModel(s, id)
    Object.values(s.units).filter((u) => u.location === 'reserves').forEach((u, i) => placeUnit(s, u.id, [[-20 + i * 3, 12]]))
    const copy = spawnUnitCopy(s, TERM, 7)
    expect(copy.location).toBe('reserves')
    const vpB = s.players.B.vp
    const { ctx, events } = ctxOf(s, [])
    const r0 = movementModule.advance(ctx) // every other unit is deployed, so only the spawned copy is left in Reserves
    expect(r0).toBe('done')
    expect(s.units[copy.id].location).toBe('destroyed')
    expect(of(events, 'UnitLostInReserves').map((e) => e.unitId)).toContain(copy.id)
    const kills = of(events, 'ModelDestroyed').filter((e) => e.unitId === copy.id)
    expect(kills).toHaveLength(7)
    expect(kills.every((e) => e.byPlayer === null && e.byUnitId === null && e.byModelId === null)).toBe(true)
    expect(of(events, 'UnitDestroyed').find((e) => e.unitId === copy.id)).toMatchObject({ byPlayer: null, byUnitId: null, byModelId: null })
    expect(s.players.B.vp).toBe(vpB)
    expect(s.players.B.secondaryState.killsThisPhase ?? {}).toEqual({})
  })
})

describe('Psychophage weapons (TYR-6)', () => {
  const TORRENT = 'tyr.w.psychoclastic-torrent', MAW = 'tyr.w.talons-and-betentacled-maw'

  it('TYR-039 TYR-6: psychoclastic torrent auto-hits (no hit dice) and ignores a target\'s benefit of cover', () => {
    const s = makeState()
    phase(s, 'shooting', 'A')
    placeUnit(s, PSY, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 8]])
    // Go to Ground active on the target: cover that other ranged weapons would respect
    s.units[BOYZ].effects.push({ id: 'fx:gtg', sourceAbilityId: 'core.s.go-to-ground', sourceUnitId: BOYZ, effect: { invuln: 6 }, scope: { who: 'self' }, expires: { kind: 'phaseEnd', round: s.round, player: null }, when: null } as never)
    expect(hookService.hasBenefitOfCover!(s, BOYZ)).toBe(true)
    const { ctx, events } = ctxOf(s, [4, 4, 4, ...TAIL])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: PSY, overwatch: false, targets: [declare(s, PSY, BOYZ, 'ranged', 3, TORRENT)] })
    const out = driveAttack(ctx, events)
    const hits = of(out, 'HitRolled')
    expect(hits).toHaveLength(3)
    expect(hits.every((h) => h.auto && h.hit)).toBe(true)
    const allocated = of(out, 'AttackAllocated')
    expect(allocated.length).toBeGreaterThan(0)
    expect(allocated.every((a) => a.cover === false)).toBe(true)
  })

  it('TYR-039 TYR-6: the maw\'s Anti-Psyker 4+ makes an unmodified 4 to wound a critical against a PSYKER, so Devastating Wounds applies', () => {
    const run = (psyker: boolean) => {
      const s = makeState()
      phase(s, 'fight', 'A')
      placeUnit(s, PSY, [[0, 0]])
      placeUnit(s, BOYZ, [[radius(s, PSY) + radius(s, BOYZ) + 0.5, 0]])
      if (psyker) patchDatasheet(s, BOYZ, { keyword: 'PSYKER' })
      const { ctx, events } = ctxOf(s, [4, 4, ...TAIL]) // hit 4 (WS 3+), wound 4
      attackService.begin(ctx, { kind: 'melee', attackerUnitId: PSY, overwatch: false, targets: [declare(s, PSY, BOYZ, 'melee', 1, MAW)] })
      return driveAttack(ctx, events)
    }
    const vs = run(true)
    expect(of(vs, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: true })
    expect(of(vs, 'SaveRolled')).toHaveLength(0) // the critical wound skips the save...
    expect(of(vs, 'DamageApplied').some((d) => d.mortal)).toBe(true) // ...and becomes mortal wounds
    expect(of(run(false), 'WoundRolled')[0].critical).toBe(false)
  })
})

describe('Shadow in the Warp recovery timing (TYR-2.5)', () => {
  it('TYR-006 TYR-2.5: a unit that fails the test stays shocked through the rest of that Command phase — recovery does not clear it and it contributes 0 OC', () => {
    const s = makeState()
    phase(s, 'command', 'B')
    s.firstPlayer = 'A'
    s.step = 'command'
    placeUnit(s, PRIME, [[0, 0]])
    const obj = Object.values(s.objectives)[0]
    placeUnit(s, BOYZ, [[obj.pos.x, obj.pos.z]])
    expect(objectiveService.levelOfControl(s, obj.id).B).toBeGreaterThan(0)
    const { ctx, events } = ctxOf(s, [1, 1])
    expect(hookService.offerPicks!(ctx, 'command.start', 'start')).toBe(true)
    answer(ctx, 'use')
    expect(s.units[BOYZ].battleShocked).toBe(true)
    // the Command phase's own R-4.3 step: recovery of the previous round's shock runs now, before the scoring window
    commandModule.advance(ctx)
    expect(of(events, 'BattleShockRecovered').map((e) => e.unitId)).not.toContain(BOYZ)
    expect(s.units[BOYZ].battleShocked).toBe(true)
    expect(s.units[BOYZ].battleShockExpiresRound).toBe(s.round + 1)
    expect(objectiveService.levelOfControl(s, obj.id).B).toBe(0)
  })
})
