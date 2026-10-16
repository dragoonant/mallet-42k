// Dark Angels: The Vengeful Brethren (docs/spec/factions/dark-angels--the-vengeful-brethren.md, DAV- checklist ids), real Combat Patrol data.
// Code hooks: Wages of Retribution, Hunters of Heretics (+ end bonus), Take the Stronghold, Unyielding, the Bladeguard stances; plus the
// declarative parts that interact with them (Refuse to Yield, Determined Combatant, March of Vengeance, Relic Munitions). The E1 save
// re-roll seam itself is covered in dark-angels-the-vengeful-brethren-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { vbHuntersOfHereticsEndAmount, vbHuntersOfHereticsModelDestroyed } from '../../src/engine/factions/dark-angels'
import { fightOnDeathThreshold, deferredDeaths } from '../../src/engine/fight-on-death'
import { pointInPolygon } from '../../src/engine/geometry'
import { resolveModelWeapons } from '../../src/engine/phases/fight'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { deploymentZone } from '../../src/engine/state'
import { stratagemService } from '../../src/engine/stratagems'
import { runGame } from '../../tools/sim-core'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const VB = 'da.cp.the-vengeful-brethren'
const DA = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Dark Angels', faction: 'dark-angels', patrolId: VB, enhancementId: 'da.e.determined-combatant',
  secondaryId: 'da.sec.hunters-of-heretics', attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const ZAC = 'A:zacharial', INT = 'A:intercessors', HELL = 'A:hellblasters', BG = 'A:bladeguard'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss'
const ENEMY_CAP = 'B:captain-octavius', ENEMY_TERM = 'B:terminator-squad'
const UNY = 'da.s.vb-unyielding', MARCH = 'da.s.vb-march-of-vengeance', RELIC = 'da.s.vb-relic-munitions'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; sm?: boolean; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DA(o.a), B: o.sm ? SM(o.b) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'dav', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  if (s.phase === 'fight') s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: s.activePlayer === 'A' ? 'B' : 'A', counterOffensive: false }
  // everyone parked in a corner far from every marker; tests move what they need
  placeUnit(s, ZAC, [[-20, -13]])
  placeUnit(s, INT, { x: -19, z: -11, gap: 0.3 })
  placeUnit(s, HELL, { x: -19, z: -9, gap: 0.3 })
  placeUnit(s, BG, { x: -19, z: -7, gap: 0.3 })
  if (o.sm) {
    for (const [id, z] of [[ENEMY_CAP, 12], [ENEMY_TERM, 9]] as const) if (s.units[id]) placeUnit(s, id, { x: 18, z, gap: 0.3 })
  } else {
    placeUnit(s, BOYZ, { x: 18, z: 12, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: 18, z: 9, gap: 0.3 })
    placeUnit(s, BOSS, [[21, 13]])
  }
  return s
}

const ctxOf = (s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) => createContext(s, new ScriptedRng(dice), modules)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const markers = (s: GameState) => Object.values(s.objectives).filter((o) => !o.removed)

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

// ---------- stratagem harness (as dark-angels.test.ts) ----------
function servicesTable(): Services {
  return {
    ...DEFAULT_MODULES.services, hooks: hookService, effects: effectService, stratagems: stratagemService, leaders: leaderService,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
}
function harness(state: GameState, dice: number[] = []) {
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services: servicesTable(), topics: DEFAULT_MODULES.topics }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  const options = (): UseStratagemAction[] => ((state.pending as { options?: { action: Action }[] } | null)?.options ?? []).map((o) => o.action as UseStratagemAction).filter((a) => a.type === 'useStratagem')
  const use = (stratagemId: string, unitId: string) => {
    const opt = options().find((x) => x.stratagemId === stratagemId && (x.targets.unitIds ?? []).includes(unitId))
    if (!opt) throw new Error(`no option ${stratagemId} ${unitId}`)
    const pending = state.pending as PendingDecision
    const action = { ...opt, player: pending.player, decisionId: pending.id } as Action
    const rej = stratagemService.validate(state, action, pending)
    if (rej) return rej
    state.pending = null
    return stratagemService.handle(ctx, action, pending) ?? null
  }
  return { ctx, events, options, use }
}
const offeredUnits = (s: GameState, player: 'A' | 'B', id: string, window: Parameters<typeof stratagemService.options>[2], trigger = {}): string[] =>
  stratagemService.options(s, player, window, trigger).filter((o) => o.stratagemId === id).flatMap((o) => o.targets.unitIds ?? [])

function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 1, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
function rollOf(unmodified: number, purpose: DiceRoll['purpose']): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function weaponModel(s: GameState, unitId: string, weaponId: string): string {
  for (const id of s.units[unitId].models) if (s.models[id].weapons.includes(weaponId)) return id
  throw new Error(`no ${weaponId} in ${unitId}`)
}
const abilitiesOf = (s: GameState, modelId: string, weaponId: string) => hookService.weaponAbilitiesFor!(s, modelId, s.weapons[weaponId]).map((a) => a.ability)

// Drives a real attack sequence to the end (allocations and Hazardous casualty picks answered with the first option).
interface Tgt { modelId: string; weaponId: string; targetUnitId: string }
function runAttack(s: GameState, dice: number[], kind: 'ranged' | 'melee', attackerUnitId: string, targets: Tgt[]) {
  const { ctx, events } = ctxOf(s, dice)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: targets.map((t) => ({ ...t, profileGroup: null, attacks: null })) })
  attackService.advance(ctx)
  for (let g = 0; g < 80 && s.pending; g++) {
    const p = s.pending as PendingDecision
    s.pending = null
    if (p.kind === 'allocateAttack') attackService.handler.handle(ctx, { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: p.context.eligibleModels[0] } as Action, p)
    else if (p.kind === 'chooseOption') attackService.handler.handle(ctx, { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: p.options[0].id } as Action, p)
    else { s.pending = p; break }
    attackService.advance(ctx)
  }
  return events
}

// =====================================================================================================================
describe('Registration and Patrol Squads', () => {
  it('DAV-003 every code named by the Vengeful Brethren data is registered', () => {
    const codes = new Set<string>()
    const collect = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(collect)
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'code' && typeof v === 'string') codes.add(v); else collect(v) }
    }
    collect(bundle.patrols[VB])
    for (const id of ['da.e.wages-of-retribution', 'da.a.vb-bladeguard', 'da.a.vb-swords-of-the-chapter', 'da.a.vb-shields-of-the-chapter', UNY, MARCH, RELIC]) {
      collect(bundle.enhancements[id]); collect(bundle.abilities[id]); collect(bundle.stratagems[id])
    }
    for (const c of ['vbWagesOfRetribution', 'vbHuntersOfHeretics', 'vbHuntersOfHereticsEnd', 'vbTakeTheStrongholdPick', 'vbTakeTheStrongholdScore', 'vbUnyielding', 'vbBladeguardPick', 'vbBladeguardStance', 'getStuckInDistance']) {
      expect(codes.has(c), `${c} named by data`).toBe(true)
      expect(codeHooks[c], `${c} registered`).toBeTruthy()
    }
  })

  it('DAV-003 DAV-1.2: Patrol Squads split the Intercessors into two 5-model BATTLELINE units, each its own stratagem target', () => {
    const whole = makeState()
    expect(whole.units[INT].models).toHaveLength(10)
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DA({ splitUnits: ['intercessors'] }), B: ORK() },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const s = createGameState(setup, bundle, 'dav-split', ENGINE_VERSION)
    expect(s.units[INT]).toBeUndefined()
    for (const id of ['A:intercessors-a', 'A:intercessors-b']) {
      expect(s.units[id].models).toHaveLength(5)
      expect(s.datasheets[s.units[id].datasheetId].keywords).toContain('BATTLELINE')
    }
    s.round = 2; s.phase = 'shooting'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState(); s.players.A.cp = 3
    placeUnit(s, 'A:intercessors-a', { x: -19, z: -11, gap: 0.3 })
    placeUnit(s, 'A:intercessors-b', { x: -19, z: -5, gap: 0.3 })
    const offered = offeredUnits(s, 'A', RELIC, 'shooting.start')
    expect(offered).toContain('A:intercessors-a')
    expect(offered).toContain('A:intercessors-b')
  })
})

describe('Refuse to Yield and Determined Combatant', () => {
  const damageMods = (s: GameState, targetUnit: string, attackerUnit: string, weaponId: string, damage: number) => {
    const { ctx } = ctxOf(s)
    const model = weaponModel(s, attackerUnit, weaponId)
    return hookService.collect(ctx, 'onDamage', { attack: attackCtx(s, model, weaponId, targetUnit), targetUnitId: targetUnit, targetModelId: s.units[targetUnit].models[0], damage, mortal: false })
      .map((r) => r.result as { kind: string; halve?: boolean })
  }
  it('DAV-004 DAV-6.1: attacks allocated to Zacharial are halved (ranged and melee); the Bladeguard take full damage', () => {
    const s = makeState()
    // Orks: shoota is ranged, choppa melee
    const ranged = damageMods(s, ZAC, BOYZ, 'ork.w.shoota', 2).filter((r) => r.halve)
    expect(ranged).toHaveLength(1)
    const melee = damageMods(s, ZAC, BOYZ, 'ork.w.choppa', 2).filter((r) => r.halve)
    expect(melee).toHaveLength(1)
    expect(damageMods(s, BG, BOYZ, 'ork.w.shoota', 2).filter((r) => r.halve)).toHaveLength(0)
  })

  it('DAV-004 DAV-6.1: a D2 attack costs Zacharial 1 wound, a D3 attack 2, a D1 attack 1 (halved, rounded up) through real damage resolution', () => {
    const lost = (damage: string | number, dice: number[], ally = false) => {
      const s = makeState({ phase: 'shooting', active: 'B' })
      placeUnit(s, ZAC, [[-5, 0]])
      placeUnit(s, BOYZ, { x: 2, z: 0, gap: 0.3 })
      const model = weaponModel(s, BOYZ, 'ork.w.shoota')
      s.weapons = { ...s.weapons, 'test.w.dmg': { ...s.weapons['ork.w.shoota'], id: 'test.w.dmg', A: 1, skill: 2, S: 12, AP: -4, D: damage, abilities: [] } as never }
      s.models[model].weapons.push('test.w.dmg')
      const target = ally ? BG : ZAC
      if (ally) placeUnit(s, BG, [[-5, 3], [-3.4, 3], [-1.8, 3]])
      const events = runAttack(s, dice, 'ranged', BOYZ, [{ modelId: model, weaponId: 'test.w.dmg', targetUnitId: target }])
      return of(events, 'DamageApplied').filter((e) => !e.mortal).reduce((n, e) => n + e.amount, 0) // damage lands point by point
    }
    expect(lost(2, [6, 6, 1])).toBe(1)
    expect(lost('D3', [6, 6, 1, 6])).toBe(2)
    expect(lost(1, [6, 6, 1])).toBe(1)
    // Bladeguard Veterans are not Zacharial: full damage
    expect(lost(2, [6, 6, 1], true)).toBe(2)
  })

  it('DAV-005 DAV-3.1: Determined Combatant grants Sustained Hits 1 to every weapon while the bearer is on a marker, not when away', () => {
    const s = makeState()
    const gauntlet = s.models[`${ZAC}#0`].weapons.find((w) => w === 'da.w.boltstorm-gauntlet') as string
    const fist = s.models[`${ZAC}#0`].weapons.find((w) => w === 'da.w.power-fist-zacharial') as string
    const mid = markers(s).find((m) => m.home === null) ?? markers(s)[0]
    placeUnit(s, ZAC, [[mid.pos.x + 2.5, mid.pos.z]])
    for (const w of [gauntlet, fist]) expect(abilitiesOf(s, `${ZAC}#0`, w)).toContain('SUSTAINED_HITS')
    placeUnit(s, ZAC, [[mid.pos.x + 6, mid.pos.z]])
    for (const w of [gauntlet, fist]) expect(abilitiesOf(s, `${ZAC}#0`, w)).not.toContain('SUSTAINED_HITS')
    placeUnit(s, ZAC, [[mid.pos.x + 2.5, mid.pos.z]])
    mid.removed = true
    for (const w of [gauntlet, fist]) expect(abilitiesOf(s, `${ZAC}#0`, w)).not.toContain('SUSTAINED_HITS')
  })
})

// =====================================================================================================================
describe('Wages of Retribution (DAV-3.2)', () => {
  const wages = { enhancementId: 'da.e.wages-of-retribution' }
  const kill = (ctx: EngineContext, victim: string, by: string | null = HELL) => {
    hookService.run(ctx, 'onUnitDestroyed', { destroyedUnitId: victim, destroyedModelId: null, byUnitId: by, byModelId: by ? ctx.state.units[by].models[0] : null, kind: 'ranged' } as never)
  }
  function ready(): GameState {
    const s = makeState({ a: wages })
    s.players.A.cp = 0
    s.players.A.oathTargetUnitId = BOYZ
    return s
  }
  it('DAV-006 DAV-3.2: Hellblasters destroy the Oath target: D6 4 gives 1 CP, D6 3 gives none', () => {
    const s = ready()
    const a = ctxOf(s, [4])
    kill(a.ctx, BOYZ)
    expect(s.players.A.cp).toBe(1)
    expect(of(a.events, 'AbilityTriggered').some((e) => e.summary.includes('rolled 4'))).toBe(true)
    const t = ready()
    kill(ctxOf(t, [3]).ctx, BOYZ)
    expect(t.players.A.cp).toBe(0)
  })

  it('DAV-006 DAV-3.2: no roll when Zacharial is in Reserves or destroyed, or the destroyed unit is not the Oath target', () => {
    const r = ready()
    r.units[ZAC].location = 'reserves'
    const ra = ctxOf(r, []) // an empty script throws on any die
    kill(ra.ctx, BOYZ)
    expect(r.players.A.cp).toBe(0)
    const d = ready()
    d.units[ZAC].location = 'destroyed'
    d.units[ZAC].models = []
    kill(ctxOf(d, []).ctx, BOYZ)
    expect(d.players.A.cp).toBe(0)
    const o = ready()
    kill(ctxOf(o, []).ctx, BOYZ2)
    expect(o.players.A.cp).toBe(0)
    expect(of(ctxOf(o, []).events, 'DiceRolled')).toHaveLength(0)
  })

  it('DAV-006 DAV-3.2: a second CP gain in the same battle round is discarded (R-4.2)', () => {
    const s = ready()
    s.players.A.oathTargetUnitId = BOYZ
    const { ctx, events } = ctxOf(s, [5, 5])
    kill(ctx, BOYZ)
    s.players.A.oathTargetUnitId = BOYZ
    kill(ctx, BOYZ)
    expect(s.players.A.cp).toBe(1)
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('discarded'))).toBe(true)
  })

  it('DAV-007 DAV-3.2a: an attached Oath target rolls for each destroyed half; the enemy\'s own Hazardous loss never rolls', () => {
    const s = makeState({ a: wages, sm: true, b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } })
    s.players.A.cp = 0
    expect(s.units[ENEMY_CAP].bodyguardUnitId).toBe(ENEMY_TERM)
    s.players.A.oathTargetUnitId = ENEMY_TERM
    const { ctx, events } = ctxOf(s, [4, 4])
    kill(ctx, ENEMY_TERM)
    kill(ctx, ENEMY_CAP)
    expect(of(events, 'AbilityTriggered').filter((e) => e.summary.startsWith('Wages of Retribution')).length).toBe(2)
    // own Hazardous: the destroyed unit is its own killer, an enemy of the bearer's player
    const h = makeState({ a: wages })
    h.players.A.oathTargetUnitId = BOYZ
    const cpBefore = h.players.A.cp
    const none = ctxOf(h, [])
    kill(none.ctx, BOYZ, BOYZ)
    expect(h.players.A.cp).toBe(cpBefore)
    expect(of(none.events, 'AbilityTriggered').filter((e) => e.summary.startsWith('Wages of Retribution'))).toHaveLength(0)
    // a non-ADEPTUS ASTARTES killer (none exists in this army) is not credited: killer from the other army
    const k = makeState({ a: wages })
    k.players.A.oathTargetUnitId = BOYZ
    kill(ctxOf(k, []).ctx, BOYZ, BOYZ2)
    expect(k.players.A.cp).toBe(0)
  })
})

// =====================================================================================================================
describe('Hunters of Heretics (DAV-4.1)', () => {
  const info = (s: GameState, victim: string, by: string = INT, byPlayer: 'A' | 'B' | null = 'A') => ({
    unitId: victim, modelId: s.units[victim].models[0] ?? `${victim}#0`, byPlayer, byUnitId: by, byModelId: s.units[by].models[0],
  })
  const hunters = (o: Opts = {}) => makeState({ ...o, a: { secondaryId: 'da.sec.hunters-of-heretics', ...(o.a ?? {}) } })

  it('DAV-008 DAV-4.1: an enemy CHARACTER model destroyed by a DA unit scores 5 VP in either turn; two of them 10; others 0', () => {
    const s = hunters()
    const { ctx } = ctxOf(s)
    DEFAULT_MODULES.services.missions.modelDestroyed?.(ctx, info(s, BOSS))
    expect(s.players.A.vp).toBe(5)
    vbHuntersOfHereticsModelDestroyed(ctx, info(s, BOSS, HELL))
    expect(s.players.A.vp).toBe(10)
    vbHuntersOfHereticsModelDestroyed(ctx, info(s, BOYZ)) // not a CHARACTER
    expect(s.players.A.vp).toBe(10)
    const t = hunters({ active: 'B', phase: 'fight' })
    vbHuntersOfHereticsModelDestroyed(ctxOf(t).ctx, info(t, BOSS, BG))
    expect(t.players.A.vp).toBe(5)
  })

  it('DAV-008 DAV-4.1a: a bodyguard model of an attached enemy unit is not a CHARACTER; own losses and unrelated killers score nothing', () => {
    const s = hunters({ sm: true, b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } })
    const { ctx } = ctxOf(s)
    vbHuntersOfHereticsModelDestroyed(ctx, info(s, ENEMY_TERM))
    expect(s.players.A.vp).toBe(0)
    vbHuntersOfHereticsModelDestroyed(ctx, info(s, ENEMY_CAP))
    expect(s.players.A.vp).toBe(5)
    // an enemy CHARACTER dying to its own Hazardous: credited to its own unit/player
    const o = hunters()
    vbHuntersOfHereticsModelDestroyed(ctxOf(o).ctx, { unitId: BOSS, modelId: o.units[BOSS].models[0], byPlayer: 'B', byUnitId: BOSS, byModelId: o.units[BOSS].models[0] })
    expect(o.players.A.vp).toBe(0)
    // no killer / mortal wounds without a credited unit
    vbHuntersOfHereticsModelDestroyed(ctxOf(o).ctx, { unitId: BOSS, modelId: o.units[BOSS].models[0], byPlayer: null, byUnitId: null, byModelId: null })
    expect(o.players.A.vp).toBe(0)
  })
})

describe('Hunters of Heretics end bonus (DAV-4.1b)', () => {
  const end = (s: GameState): number => {
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'battle.end', 'end')
    return s.players.A.vp - before
  }
  const gone = (s: GameState, id: string, how: 'destroyed' | 'reserves') => { s.units[id].location = how; if (how === 'destroyed') s.units[id].models = [] }
  const state = (o: Opts = {}) => makeState({ round: 5, ...o, a: { secondaryId: 'da.sec.hunters-of-heretics' } })

  it('DAV-009 DAV-4.1b: every enemy CHARACTER destroyed gives +5 at battle end; one alive gives 0', () => {
    const s = state()
    gone(s, BOSS, 'destroyed')
    expect(end(s)).toBe(5)
    expect(end(state())).toBe(0)
  })

  it('DAV-009 DAV-4.1b: a CHARACTER unit still in Reserves counts as destroyed (R-5.16)', () => {
    const s = state()
    gone(s, BOSS, 'reserves')
    expect(end(s)).toBe(5)
  })

  it('DAV-009 DAV-4.1b: an enemy army without any CHARACTER scores 0 (nothing was hunted); the bonus only fires in round 5', () => {
    const s = state()
    s.datasheets = Object.fromEntries(Object.entries(s.datasheets).map(([id, ds]) => [id, { ...ds, keywords: ds.keywords.filter((k) => k !== 'CHARACTER') }]))
    gone(s, BOSS, 'destroyed')
    const rule = s.mission.secondaries.A.find((r) => r.code === 'vbHuntersOfHereticsEnd')!
    expect(vbHuntersOfHereticsEndAmount(s, rule, 'A')).toBe(0)
    expect(end(s)).toBe(0)
    const early = state({ round: 3 })
    gone(early, BOSS, 'destroyed')
    expect(end(early)).toBe(0)
  })
})

// =====================================================================================================================
describe('Take the Stronghold (DAV-4.2)', () => {
  const secondary = { secondaryId: 'da.sec.take-the-stronghold' }
  function startDeploy(s: GameState) {
    const c = ctxOf(s)
    DEFAULT_MODULES.services.missions.onWindow(c.ctx, 'deployment.unit', 'deployArmies')
    return c
  }
  const turnEnd = (s: GameState): number => {
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }

  it('DAV-010 DAV-4.2: the OPPONENT picks a marker outside its own deployment zone; the pick is stored for the owner', () => {
    const s = makeState({ round: 0, phase: 'deployment' as GameState['phase'], a: secondary })
    // one marker inside the opponent's own zone: it must not be offered
    const zoneB = deploymentZone(s, 'B')
    markers(s)[0].pos = { x: zoneB.reduce((a, p) => a + p.x, 0) / zoneB.length, z: zoneB.reduce((a, p) => a + p.z, 0) / zoneB.length }
    const c = startDeploy(s)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.kind).toBe('chooseOption')
    expect(pending.player).toBe('B')
    expect(pending.canPass).toBe(false)
    const zone = deploymentZone(s, 'B')
    const expected = markers(s).filter((o) => !pointInPolygon({ x: o.pos.x, z: o.pos.z }, zone)).map((o) => o.id).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(expected.length).toBeLessThan(markers(s).length)
    expect(pending.options.map((o) => o.id).sort()).toEqual(expected)
    answerOption(c.ctx, expected[0])
    expect(s.players.A.secondaryState['da:stronghold']).toBe(expected[0])
    expect(s.players.B.secondaryState['da:stronghold']).toBeUndefined()
  })

  it('DAV-010 DAV-4.2: end of an own turn controlling the marker scores 5 (round 1 included); not controlled, opponent\'s turn or removed marker scores 0', () => {
    const s = makeState({ round: 0, phase: 'fight', a: secondary })
    const c = startDeploy(s)
    const id = (s.pending as ChooseOptionDecision).options[0].id
    answerOption(c.ctx, id)
    s.phaseState = emptyPhaseState()
    s.round = 1 // the pick lives in round 0; scoring starts in round 1
    s.objectives[id].controller = 'A'
    expect(turnEnd(s)).toBe(5)
    s.objectives[id].controller = 'B'
    expect(turnEnd(s)).toBe(0)
    s.objectives[id].controller = 'A'
    s.activePlayer = 'B'
    expect(turnEnd(s)).toBe(0)
    s.activePlayer = 'A'
    s.objectives[id].removed = true
    expect(turnEnd(s)).toBe(0)
  })

  it('DAV-010 DAV-4.2: Hunters of Heretics chosen means no pick', () => {
    const s = makeState({ round: 0, phase: 'deployment' as GameState['phase'] })
    startDeploy(s)
    expect(s.pending).toBeNull()
  })
})

// =====================================================================================================================
describe('Unyielding (DAV-5.1)', () => {
  const fightState = (active: 'A' | 'B' = 'B') => {
    const s = makeState({ phase: 'fight', active })
    s.players.A.cp = 3
    return s
  }
  const trig = (target: string) => ({ unitId: BOYZ, targetUnitId: target })
  const use = (s: GameState, unit: string) => {
    const h = harness(s)
    h.ctx.window('fight.targetsDeclared', 'k1', h.ctx.order.defensive('A'), trig(unit))
    expect(h.use(UNY, unit)).toBeNull()
    return h
  }
  // destroy one model of `unit` through the real attack path, as an enemy melee attack in the Fight phase
  function slay(s: GameState, unit: string, dice: number[]) {
    const c = ctxOf(s, dice)
    attackService.destroyModel(c.ctx, s.units[unit].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'melee' })
    return c
  }

  it('DAV-011 DAV-5.1: Intercessors targeted in the Fight phase are offered; using it, a destroyed model stays on a 4+ and is removed on a 3', () => {
    const s = fightState()
    expect(offeredUnits(s, 'A', UNY, 'fight.targetsDeclared', trig(INT))).toEqual([INT])
    use(s, INT)
    expect(fightOnDeathThreshold(s, INT)).toBe(4)
    const stay = slay(s, INT, [4])
    expect(deferredDeaths(s, BOYZ)).toHaveLength(1)
    expect(of(stay.events, 'ModelDestroyed')).toHaveLength(0)
    const t = fightState()
    use(t, INT)
    const gone = slay(t, INT, [3])
    expect(deferredDeaths(t, BOYZ)).toHaveLength(0)
    expect(of(gone.events, 'ModelDestroyed')).toHaveLength(1)
  })

  it('DAV-012 DAV-5.1a: Bladeguard add 1 to the roll (threshold 3): a 3 stays, a 2 is removed', () => {
    const s = fightState()
    use(s, BG)
    expect(fightOnDeathThreshold(s, BG)).toBe(3)
    slay(s, BG, [3])
    expect(deferredDeaths(s, BOYZ)).toHaveLength(1)
    const t = fightState()
    use(t, BG)
    slay(t, BG, [2])
    expect(deferredDeaths(t, BOYZ)).toHaveLength(0)
  })

  it('DAV-012 DAV-5.1a: not offered for a unit that already fought, nor in the Shooting phase; offered in both players\' Fight phases', () => {
    const s = fightState()
    s.units[INT].turn.foughtThisPhase = true
    expect(offeredUnits(s, 'A', UNY, 'fight.targetsDeclared', trig(INT))).toEqual([])
    const shoot = makeState({ phase: 'shooting', active: 'B' })
    shoot.players.A.cp = 3
    expect(offeredUnits(shoot, 'A', UNY, 'fight.targetsDeclared', trig(INT))).toEqual([])
    expect(offeredUnits(fightState('A'), 'A', UNY, 'fight.targetsDeclared', trig(INT))).toEqual([INT])
    expect(offeredUnits(fightState('B'), 'A', UNY, 'fight.targetsDeclared', trig(INT))).toEqual([INT])
  })
})

// =====================================================================================================================
describe('March of Vengeance (DAV-5.2)', () => {
  const MARCH_WINDOWS = ['fight.start', 'fight.attacksResolved', 'fight.beforeConsolidate'] as const
  it('DAV-013 DAV-5.2: used on the Bladeguard, Consolidation is 6" (both forms), Pile-in stays 3"; expires at the end of the phase', () => {
    const s = makeState({ phase: 'fight' })
    s.players.A.cp = 3
    expect(hookService.consolidateDistance(s, BG)).toBe(3)
    for (const w of MARCH_WINDOWS) expect(offeredUnits(s, 'A', MARCH, w)).toContain(BG)
    const h = harness(s)
    h.ctx.window('fight.attacksResolved', 'k', h.ctx.order.active(), {})
    expect(h.use(MARCH, BG)).toBeNull()
    expect(hookService.consolidateDistance(s, BG)).toBe(6)
    expect(hookService.consolidateDistance(s, BG, 3, 'enemy')).toBe(6)
    expect(hookService.consolidateDistance(s, BG, 3, 'objective')).toBe(6)
    expect(hookService.pileInDistance(s, BG)).toBe(3)
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(hookService.consolidateDistance(s, BG)).toBe(3)
  })

  it('DAV-013 DAV-5.2: usable in the opponent\'s Fight phase too', () => {
    const s = makeState({ phase: 'fight', active: 'B' })
    s.players.A.cp = 3
    expect(offeredUnits(s, 'A', MARCH, 'fight.start')).toContain(INT)
  })
})

// =====================================================================================================================
describe('Relic Munitions (DAV-5.3)', () => {
  const ready = () => {
    const s = makeState({ phase: 'shooting' })
    s.players.A.cp = 3
    return s
  }
  it('DAV-014 DAV-5.3: Intercessors gain Lethal Hits on the bolt rifle; Hellblasters keep the plasma incinerator as it is, their bolt pistols gain it', () => {
    const s = ready()
    expect(offeredUnits(s, 'A', RELIC, 'shooting.start')).toEqual(expect.arrayContaining([INT, HELL]))
    const h = harness(s)
    h.ctx.window('shooting.start', 'k', h.ctx.order.active(), {})
    expect(h.use(RELIC, INT)).toBeNull()
    const rifle = weaponModel(s, INT, 'da.w.bolt-rifle')
    expect(abilitiesOf(s, rifle, 'da.w.bolt-rifle')).toContain('LETHAL_HITS')
    expect(abilitiesOf(s, weaponModel(s, HELL, 'sm.w.bolt-pistol'), 'sm.w.bolt-pistol')).not.toContain('LETHAL_HITS') // other unit

    const t = ready()
    const g = harness(t)
    g.ctx.window('shooting.start', 'k', g.ctx.order.active(), {})
    expect(g.use(RELIC, HELL)).toBeNull()
    const hm = weaponModel(t, HELL, 'da.w.plasma-incinerator')
    expect(abilitiesOf(t, hm, 'da.w.plasma-incinerator')).not.toContain('LETHAL_HITS')
    expect(abilitiesOf(t, hm, 'da.w.plasma-incinerator-supercharge')).not.toContain('LETHAL_HITS')
    expect(abilitiesOf(t, hm, 'sm.w.bolt-pistol')).toContain('LETHAL_HITS')
    effectService.expire(g.ctx, 'phaseEnd', null)
    expect(abilitiesOf(t, hm, 'sm.w.bolt-pistol')).not.toContain('LETHAL_HITS')
  })

  it('DAV-014 DAV-5.3: not offered for a unit that already shot, nor in the opponent\'s Shooting phase', () => {
    const s = ready()
    s.units[INT].turn.shotThisPhase = true
    const offered = offeredUnits(s, 'A', RELIC, 'shooting.start')
    expect(offered).not.toContain(INT)
    expect(offered).toContain(HELL)
    const o = makeState({ phase: 'shooting', active: 'B' })
    o.players.A.cp = 3
    expect(offeredUnits(o, 'A', RELIC, 'shooting.start')).toEqual([])
  })
})

// =====================================================================================================================
describe('Bladeguard stances (DAV-6.3)', () => {
  const fightState = (active: 'A' | 'B' = 'A') => {
    const s = makeState({ phase: 'fight', active })
    return s
  }
  const sword = 'da.w.master-crafted-power-weapon'
  const hitRerolls = (s: GameState): string[] => {
    const { ctx } = ctxOf(s)
    const m = weaponModel(s, BG, sword)
    return hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, m, sword, BOYZ), roll: rollOf(1, 'hit') })
      .map((r) => (r.result as { reroll?: string }).reroll).filter((r): r is string => !!r)
  }
  const saveRerolls = (s: GameState, kind: 'armour' | 'invuln'): string[] => {
    const { ctx } = ctxOf(s)
    const gun = 'ork.w.shoota'
    const m = weaponModel(s, BOYZ, gun)
    return hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, m, gun, BG), roll: rollOf(1, 'save'), saveKind: kind } as never)
      .map((r) => (r.result as { reroll?: string }).reroll).filter((r): r is string => !!r)
  }
  const pick = (s: GameState, choice: string) => {
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'fight.start', 'fs')).toBe(true)
    const pending = s.pending as ChooseOptionDecision
    expect(pending.options.map((o) => o.id).sort()).toEqual(['decline', 'shields', 'swords'])
    answerOption(c.ctx, choice)
    return c
  }

  it('DAV-015 DAV-6.3: the pick is offered at the start of each Fight phase, in both turns; Swords re-rolls melee Hit rolls of 1 only', () => {
    for (const active of ['A', 'B'] as const) {
      const s = fightState(active)
      expect(hitRerolls(s)).toEqual([])
      const c = pick(s, 'swords')
      expect(s.pending).toBeNull()
      expect(of(c.events, 'AbilityTriggered').some((e) => /Swords of the Chapter/.test(e.summary))).toBe(true)
      expect(hitRerolls(s)).toEqual(['ones'])
      expect(saveRerolls(s, 'invuln')).toEqual([]) // saves unchanged under Swords
      // one decision per unit and phase
      expect(hookService.offerPicks(ctxOf(s).ctx, 'fight.start', 'fs2')).toBe(false)
    }
  })

  it('DAV-015 DAV-6.3: Shields re-rolls a 1 on an invulnerable save, not melee Hit rolls; decline gives neither; the next phase is a fresh choice', () => {
    const s = fightState('B')
    pick(s, 'shields')
    expect(saveRerolls(s, 'invuln')).toEqual(['ones'])
    expect(hitRerolls(s)).toEqual([])
    const d = fightState()
    pick(d, 'decline')
    expect(saveRerolls(d, 'invuln')).toEqual([])
    expect(hitRerolls(d)).toEqual([])
    s.phaseState = emptyPhaseState()
    expect(saveRerolls(s, 'invuln')).toEqual([])
    expect(hookService.offerPicks(ctxOf(s).ctx, 'fight.start', 'fs3')).toBe(true)
  })

  it('DAV-016 DAV-6.3: Shields never re-rolls an armour save', () => {
    const s = fightState('B')
    pick(s, 'shields')
    expect(saveRerolls(s, 'armour')).toEqual([])
    expect(saveRerolls(s, 'invuln')).toEqual(['ones'])
  })

  it('DAV-015 DAV-6.3: no pick when the Bladeguard are not on the battlefield', () => {
    const s = fightState()
    s.units[BG].location = 'reserves'
    expect(hookService.offerPicks(ctxOf(s).ctx, 'fight.start', 'fs')).toBe(false)
  })
})

// =====================================================================================================================
describe('Weapons and datasheet rules (DAV-6)', () => {
  it('DAV-017 DAV-6.4-6.6: incinerator supercharge is Hazardous, the standard profile is not; chainsword Extra Attacks; gauntlet and pistols are Pistols', () => {
    const s = makeState()
    const hm = weaponModel(s, HELL, 'da.w.plasma-incinerator')
    expect(abilitiesOf(s, hm, 'da.w.plasma-incinerator-supercharge')).toContain('HAZARDOUS')
    expect(abilitiesOf(s, hm, 'da.w.plasma-incinerator')).not.toContain('HAZARDOUS')
    for (const w of ['da.w.plasma-incinerator', 'da.w.plasma-incinerator-supercharge']) expect(abilitiesOf(s, hm, w)).toEqual(expect.arrayContaining(['ASSAULT', 'HEAVY']))
    expect(abilitiesOf(s, `${ZAC}#0`, 'da.w.relic-chainsword')).toContain('EXTRA_ATTACKS')
    expect(abilitiesOf(s, `${ZAC}#0`, 'da.w.boltstorm-gauntlet')).toContain('PISTOL')
    expect(abilitiesOf(s, weaponModel(s, BG, 'da.w.heavy-bolt-pistol'), 'da.w.heavy-bolt-pistol')).toContain('PISTOL')
  })

  describe('engine-level weapon rules', () => {
    const SUPER = 'da.w.plasma-incinerator-supercharge', STD = 'da.w.plasma-incinerator'
    function volley(weaponId: string, dice: number[], tweak?: (s: GameState) => void) {
      const s = makeState({ phase: 'shooting' })
      placeUnit(s, HELL, { x: -14, z: 0, gap: 0.3 })
      placeUnit(s, BOYZ, { x: 3, z: 0, gap: 0.3 })
      s.units[HELL].turn.moveType = 'stationary'
      tweak?.(s)
      const model = weaponModel(s, HELL, weaponId)
      const events = runAttack(s, dice, 'ranged', HELL, [{ modelId: model, weaponId, targetUnitId: BOYZ }])
      return { s, events, model }
    }
    // A2: 2 hits (6,6), 2 wounds (6,6); S8 AP-3 leaves a Boy with no save (no die), then the Hazardous test
    const VOLLEY = [6, 6, 6, 6]
    const hellSize = () => makeState().units[HELL].models.length

    it('DAV-017 DAV-6.4: a supercharged volley with a Hazardous 1 destroys a Hellblaster; a 2+ costs nothing; the standard profile never tests', () => {
      const bad = volley(SUPER, [...VOLLEY, 1])
      expect(of(bad.events, 'HazardousTested').map((e) => [e.weaponId, e.die, e.failed])).toEqual([[SUPER, 1, true]])
      expect(of(bad.events, 'ModelDestroyed').filter((e) => e.unitId === HELL)).toHaveLength(1)
      expect(bad.s.units[HELL].models).toHaveLength(hellSize() - 1)
      const ok = volley(SUPER, [...VOLLEY, 4])
      expect(of(ok.events, 'HazardousTested').map((e) => e.failed)).toEqual([false])
      expect(of(ok.events, 'ModelDestroyed').filter((e) => e.unitId === HELL)).toHaveLength(0)
      expect(ok.s.units[HELL].models).toHaveLength(hellSize())
      const std = volley(STD, [...VOLLEY, 1, 1])
      expect(of(std.events, 'HazardousTested')).toHaveLength(0)
      expect(std.s.units[HELL].models).toHaveLength(hellSize())
    })

    it('DAV-017 DAV-6.4: Heavy gives +1 to hit when stationary and not when the unit moved (a 2 hits only when stationary)', () => {
      const hits = (moveType: 'stationary' | 'normal') => of(volley(STD, [2, 2, 6, 6, 1, 1], (s) => { s.units[HELL].turn.moveType = moveType }).events, 'HitRolled').map((e) => e.hit)
      expect(hits('stationary')).toEqual([true, true])
      expect(hits('normal')).toEqual([false, false])
    })

    it('DAV-017 DAV-6.4: Assault lets the incinerator profiles fire after an Advance; non-Assault weapons are withheld', () => {
      const s = makeState({ phase: 'shooting' })
      placeUnit(s, HELL, { x: -14, z: 0, gap: 0.3 })
      placeUnit(s, BOYZ, { x: 3, z: 0, gap: 0.3 })
      const ids = () => new Set(buildShootingWeaponEntries(ctxOf(s).ctx, HELL).map((e) => e.weaponId))
      s.units[HELL].turn.moveType = 'stationary'
      const still = ids()
      expect(still.has(STD)).toBe(true)
      expect(still.has(SUPER)).toBe(true)
      s.units[HELL].turn.moveType = 'advance'
      const adv = ids()
      expect(adv.has(STD)).toBe(true)
      expect(adv.has(SUPER)).toBe(true)
      expect([...adv].every((w) => abilitiesOf(s, weaponModel(s, HELL, w), w).includes('ASSAULT'))).toBe(true)
      expect([...still].some((w) => !abilitiesOf(s, weaponModel(s, HELL, w), w).includes('ASSAULT'))).toBe(true) // a non-Assault weapon exists and was dropped
    })

    it('DAV-017 DAV-6.5: Zacharial fights with the power fist and the relic chainsword together (Extra Attacks): 5 + 3 attacks', () => {
      const s = makeState({ phase: 'fight' })
      placeUnit(s, BOYZ, { x: -4, z: 3, gap: 0.3 })
      placeUnit(s, ZAC, [[-4, 3 - 0.787 * 2 - 0.5]])
      const zm = `${ZAC}#0`
      expect(resolveModelWeapons(ctxOf(s).ctx, zm)).toEqual(expect.arrayContaining(['da.w.power-fist-zacharial', 'da.w.relic-chainsword']))
      expect(resolveModelWeapons(ctxOf(s).ctx, zm)).toHaveLength(2)
      // a real melee sequence declaring both weapons: 8 Hit rolls, 5 + 3
      const targets = ['da.w.power-fist-zacharial', 'da.w.relic-chainsword'].map((weaponId) => ({ modelId: zm, weaponId, targetUnitId: BOYZ }))
      const hits = of(runAttack(s, Array(8).fill(1), 'melee', ZAC, targets), 'HitRolled')
      expect(hits).toHaveLength(8)
      expect(hits.filter((h) => h.attack.weaponId === 'da.w.power-fist-zacharial')).toHaveLength(5)
      expect(hits.filter((h) => h.attack.weaponId === 'da.w.relic-chainsword')).toHaveLength(3)
    })

    it('DAV-017 DAV-6.6: the Boltstorm gauntlet (Pistol) is the one ranged weapon Zacharial may fire in Engagement Range', () => {
      const s = makeState({ phase: 'shooting' })
      placeUnit(s, BOYZ, { x: -12, z: -8, gap: 0.3 })
      placeUnit(s, ZAC, [[-12, -8 - 0.63 - 0.787 - 0.5]])
      const entries = buildShootingWeaponEntries(ctxOf(s).ctx, ZAC)
      expect(entries.map((e) => e.weaponId)).toEqual(['da.w.boltstorm-gauntlet'])
      expect(entries[0].legalTargets).toContain(BOYZ)
    })
  })

  it('DAV-018 DAV-1.4: Zacharial operates alone: no Leader, never attached; Go to Ground and Epic Challenge are legal for him', () => {
    const s = makeState()
    const ds = s.datasheets[s.units[ZAC].datasheetId]
    expect(ds.coreAbilities.some((c) => c.ability === 'LEADER')).toBe(false)
    expect(s.units[ZAC].attachedLeaderId).toBeNull()
    expect(s.units[ZAC].bodyguardUnitId).toBeNull()
    expect(s.players.A.warlordUnitId).toBe(ZAC)
    expect(ds.keywords).toEqual(expect.arrayContaining(['INFANTRY', 'CHARACTER']))
    // no Leader ability means no attach option exists for him, in either direction
    expect(leaderService.attachOptions(s, 'A').filter((o) => o.leaderUnitId === ZAC)).toEqual([])
    for (const id of Object.keys(s.units).filter((u) => s.units[u].player === 'A' && u !== ZAC)) expect(leaderService.canAttach(s, ZAC, id)).toBe(false)
    // Go to Ground is offered with Zacharial as the targeted INFANTRY unit
    const shoot = makeState({ phase: 'shooting', active: 'B' })
    shoot.players.A.cp = 3
    expect(offeredUnits(shoot, 'A', 'core.s.go-to-ground', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: ZAC })).toContain(ZAC)
    // Epic Challenge: Zacharial is a CHARACTER in Engagement Range of an enemy unit with a leader attached
    const fight = makeState({ phase: 'fight', sm: true, b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } })
    fight.players.A.cp = 3
    placeUnit(fight, ENEMY_TERM, { x: -4, z: 3, gap: 0.3 })
    placeUnit(fight, ENEMY_CAP, [[-6.5, 3]])
    placeUnit(fight, ZAC, [[-4, 3 - 0.787 * 2 - 0.5]])
    const ec = stratagemService.options(fight, 'A', 'fight.unitSelected', { unitId: ZAC }).filter((o) => o.stratagemId === 'core.s.epic-challenge')
    expect(ec.length).toBeGreaterThan(0)
    expect(ec.some((o) => (o.targets.modelIds ?? []).includes(`${ZAC}#0`))).toBe(true)
  })
})

// =====================================================================================================================
describe('AI and full games (DAV-019)', () => {
  it('DAV-019 DAV-3.2, 4.2, 5.1, 6.3: AI-vs-AI games with the patrol finish with no violations and no stuck decision', () => {
    const prev = process.env.SIM_PATROL
    process.env.SIM_PATROL = VB
    try {
      const seen = new Set<string>()
      for (let g = 0; g < 4; g++) {
        const run = runGame(bundle, 5, g, 'test')
        expect(run.violations, `game ${g}`).toEqual([])
        expect(run.final.phase).toBe('ended')
        const patrols = [run.setup.players.A.patrolId, run.setup.players.B.patrolId]
        expect(patrols).toContain(VB)
        for (const p of patrols) seen.add(p)
      }
      expect(seen.size).toBeGreaterThan(1)
    } finally {
      if (prev === undefined) delete process.env.SIM_PATROL; else process.env.SIM_PATROL = prev
    }
  }, 300_000)
})

// =====================================================================================================================
describe('Bladeguard Shields through a real attack sequence (DAV-016)', () => {
  const DREAD = 'B:deff-dread'
  function shootAtBladeguard(stance: string | null, dice: number[], weapon: string, shooter: string) {
    const s = makeState({ phase: 'shooting', active: 'B' })
    placeUnit(s, BG, [[14, -10], [15.6, -10], [17.2, -10]])
    placeUnit(s, shooter, [[8, -10]])
    if (shooter !== DREAD) placeUnit(s, shooter, { x: 14, z: 2, gap: 0.3 })
    if (stance) s.phaseState.marks.push(`vbBladeguard:${BG}=${stance}`)
    const { ctx, events } = ctxOf(s, dice)
    const model = weaponModel(s, shooter, weapon)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: shooter, overwatch: false, targets: [{ modelId: model, weaponId: weapon, targetUnitId: BG, profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    for (let g = 0; g < 60 && s.pending?.kind === 'allocateAttack'; g++) {
      const p = s.pending as Extract<PendingDecision, { kind: 'allocateAttack' }>
      s.pending = null
      attackService.handler.handle(ctx, { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: p.context.eligibleModels[0] } as Action, p)
      attackService.advance(ctx)
    }
    return events
  }
  it('DAV-016 DAV-6.3, E1: Shields re-rolls invulnerable saves of 1 in a real attack (AP -2 rokkit, 4+ invuln beats the 5+ armour); Swords does not', () => {
    // Rokkit launcha: A = D3 (raw 6 -> 3 attacks), 3 hits (6,6,6), 3 wounds (6,6,6), 3 saves (1,1,5): the two 1s re-roll to 5 and 1
    const dice = [6, 6, 6, 6, 6, 6, 6, 1, 1, 5, 5, 1]
    const shields = shootAtBladeguard('shields', dice, 'ork.w.rokkit-launcha', DREAD)
    expect(of(shields, 'SaveRolled').map((e) => e.kind)).toEqual(['invuln', 'invuln', 'invuln'])
    expect(of(shields, 'DiceRerolled').filter((e) => e.source === 'save')).toHaveLength(1)
    expect(of(shields, 'SaveRolled').map((e) => e.saved)).toEqual([true, false, true])
    const swords = shootAtBladeguard('swords', dice, 'ork.w.rokkit-launcha', DREAD)
    expect(of(swords, 'DiceRerolled').filter((e) => e.source === 'save')).toHaveLength(0)
  })

  it('DAV-016 DAV-6.3, E1: Shields never re-rolls an armour save of 1 (AP 0 shoota)', () => {
    const events = shootAtBladeguard('shields', [6, 6, 6, 6, 1, 1, 6, 6], 'ork.w.shoota', BOYZ)
    expect(of(events, 'SaveRolled').every((e) => e.kind === 'armour')).toBe(true)
    expect(of(events, 'DiceRerolled').filter((e) => e.source === 'save')).toHaveLength(0)
  })
})
