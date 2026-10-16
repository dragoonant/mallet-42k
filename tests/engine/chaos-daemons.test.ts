// Chaos Daemons: Butchers of Hyporia (docs/spec/factions/chaos-daemons.md §7-8, checklist CHA-101..CHA-130), real Combat Patrol data.
// The (b) code hooks: Worthy Offerings, Dark Conjunction, Blood-Maddened Banishment (CSM Daemonic Fervour reused), Empyric Predators.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type Action, type AttackContext, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup, type RollContext, type UseStratagemAction,
} from '../../src/engine'
import { codeHooks } from '../../src/engine/code-hooks'
import { attackService } from '../../src/engine/attack'
import { effectService } from '../../src/engine/effects'
import { fightOnDeathThreshold } from '../../src/engine/fight-on-death'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { resolveModelWeapons } from '../../src/engine/phases/fight'
import { movementModule, reserveRouteFor } from '../../src/engine/phases/movement'
import { SHADOW_KEY, type ShadowRecord } from '../../src/engine/shadow'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CDM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Daemons', faction: 'chaos-daemons', patrolId: 'cdm.cp.butchers-of-hyporia', enhancementId: 'cdm.e.incarnated-rage', secondaryId: 'cdm.sec.worthy-offerings',
  attachments: [{ leaderRef: 'khharret', bodyguardRef: 'bloodletters-1' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const KHA = 'A:khharret', BL1 = 'A:bloodletters-1', BL2 = 'A:bloodletters-2', FH1 = 'A:flesh-hounds-1', FH2 = 'A:flesh-hounds-2', BC = 'A:bloodcrushers'
const ENEMY = 'B:terminator-squad'

function makeState(o: { a?: Partial<PlayerSetup>; round?: number } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: CDM(o.a), B: SM() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'cdm', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'command'
  s.phaseState = emptyPhaseState()
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
const modules = DEFAULT_MODULES

function useStratagem(s: GameState, ctx: EngineContext, player: 'A' | 'B', stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string; targetUnitId?: string }, ids: string[]): void {
  const action = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && ids.every((id, i) => x.targets.unitIds?.[i] === id))
  if (!action) throw new Error(`${stratagemId} on ${ids.join(',')} not offered`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}
const offered = (s: GameState, p: 'A' | 'B', id: string, window: Parameters<typeof stratagemService.options>[2], trigger = {}) =>
  stratagemService.options(s, p, window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds ?? [])

function kill(s: GameState, unitId: string, by: { kind: 'ranged' | 'melee' | 'mortal' | 'other'; unitId: string | null; modelId: string | null } | null): void {
  const u = s.units[unitId]
  u.location = 'destroyed'
  u.destroyedBy = by ? { player: 'A', round: 3, ...by } : null
}


const SIX = Array.from({ length: 80 }, () => 6)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const rollOf = (unmodified: number, purpose: DiceRoll['purpose']): RollContext => ({
  purpose, unmodified, dieIndex: 0, rerolled: false,
  roll: { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true },
})
function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string, o: Partial<AttackContext> = {}): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false, ...o,
  }
}
const firstWeapon = (s: GameState, unitId: string, kind: 'ranged' | 'melee'): { modelId: string; weaponId: string } => {
  for (const modelId of s.units[unitId].models) {
    const weaponId = s.models[modelId].weapons.find((w) => s.weapons[w].kind === kind)
    if (weaponId) return { modelId, weaponId }
  }
  throw new Error(`${unitId} has no ${kind} weapon`)
}
// runs an attack to the end, passing every stratagem / re-roll window and taking the first eligible model on a Precision offer
function driveAttack(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without a decision')
    const action: Action = pending.kind === 'allocateAttack'
      ? { type: 'allocateAttack', player: pending.player, decisionId: pending.id, modelId: pending.context.eligibleModels[0] }
      : { type: 'pass', player: pending.player, decisionId: pending.id }
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}
// one attack of `weaponId` (carried by `modelId`) at `targetUnitId`, one attack; the dice are scripted, then 6s
function runAttack(s: GameState, kind: 'ranged' | 'melee', attackerUnitId: string, modelId: string, weaponId: string, targetUnitId: string, dice: number[]): GameEvent[] {
  const { ctx, events } = ctxOf(s, [...dice, ...SIX])
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [{ modelId, weaponId, targetUnitId, profileGroup: null, attacks: 1 }] })
  driveAttack(ctx)
  return events
}
// the Marines' storm bolter at AP `ap`, optionally Psychic
function enemyShot(s: GameState, targetUnitId: string, dice: number[], o: { ap?: number; psychic?: boolean } = {}): GameEvent[] {
  const { modelId, weaponId } = firstWeapon(s, ENEMY, 'ranged')
  // the weapon table is frozen and shared with the bundle: swap in a fresh table holding a modified copy
  const w = s.weapons[weaponId]
  s.weapons = { ...s.weapons, [weaponId]: { ...w, AP: o.ap ?? 0, abilities: [...w.abilities.filter((a) => a.ability !== 'PSYCHIC'), ...(o.psychic ? [{ ability: 'PSYCHIC' as const }] : [])] } }
  return runAttack(s, 'ranged', ENEMY, modelId, weaponId, targetUnitId, dice)
}

// =====================================================================================================================
describe('hook registry', () => {
  it('CHA-101 every Chaos Daemons code is registered', () => {
    for (const name of ['shadowOfChaos', 'warpLocus', 'empyricPredators', 'worthyOfferings', 'darkConjunction', 'daemonicFervour', 'getStuckInDistance']) expect(codeHooks[name], name).toBeTruthy()
  })
})

// =====================================================================================================================
describe('Worthy Offerings (DMN-4.1)', () => {
  const score = (s: GameState): number => {
    s.round = 5
    const { ctx } = ctxOf(s)
    modules.services.missions.onWindow(ctx, 'battle.end', 'battle')
    return s.players.A.vp
  }

  it('CHA-114 DMN-4.1: opposing Warlord alive -> 0; destroyed by Bloodletters -> 6; destroyed by Kh\'har\'ret\'s own attack -> 10', () => {
    const s = makeState()
    placeUnit(s, s.players.B.warlordUnitId, [[0, 0]])
    expect(score(s)).toBe(0)
    const t = makeState()
    kill(t, t.players.B.warlordUnitId, { kind: 'melee', unitId: BL2, modelId: `${BL2}#0` })
    expect(score(t)).toBe(6)
    const u = makeState()
    kill(u, u.players.B.warlordUnitId, { kind: 'melee', unitId: KHA, modelId: `${KHA}#0` })
    expect(score(u)).toBe(10)
  })

  it('CHA-114 R-5.16 [interp]: a Warlord that never arrived from Reserves counts as destroyed with no killer -> 6; stranded cull -> 6', () => {
    const s = makeState()
    s.units[s.players.B.warlordUnitId].location = 'reserves'
    expect(score(s)).toBe(6)
    const t = makeState()
    kill(t, t.players.B.warlordUnitId, null)
    expect(score(t)).toBe(6)
  })

  it('CHA-115 DMN-4.1: Kh\'har\'ret leading Bloodletters -> his kill (credited to his model) scores 10; a Bloodletter of his unit scores 6; a mortal-wound kill with no model scores 6', () => {
    const s = makeState()
    kill(s, s.players.B.warlordUnitId, { kind: 'melee', unitId: KHA, modelId: s.units[KHA].models[0] })
    expect(score(s)).toBe(10)
    const t = makeState()
    kill(t, t.players.B.warlordUnitId, { kind: 'melee', unitId: BL1, modelId: t.units[BL1].models[2] })
    expect(score(t)).toBe(6)
    const u = makeState()
    kill(u, u.players.B.warlordUnitId, { kind: 'mortal', unitId: null, modelId: null })
    expect(score(u)).toBe(6)
    // he kills while attached to Bloodletters (attacker unit = the Bloodletters), then is destroyed himself -> still 10
    const v = makeState()
    const khaModel = v.units[KHA].models[0]
    kill(v, v.players.B.warlordUnitId, { kind: 'melee', unitId: BL1, modelId: khaModel })
    removeModel(v, khaModel)
    expect(v.units[KHA].models).not.toContain(khaModel)
    expect(score(v)).toBe(10)
  })
})

// =====================================================================================================================
describe('Dark Conjunction (DMN-4.2)', () => {
  const DC = { a: { secondaryId: 'cdm.sec.dark-conjunction' } }
  // Fight-phase Shadow record, as refreshShadow would write it at fight.start of the Daemons' own turn
  const withRecord = (s: GameState, flags: { noMansLand: boolean; enemyZone: boolean }, turn: 'A' | 'B' = 'A') => {
    s.activePlayer = turn; s.phase = 'fight'
    s.players.A.secondaryState[SHADOW_KEY] = { round: s.round, turn, phase: 'fight', ...flags } satisfies ShadowRecord
  }
  const endTurn = (s: GameState): number => {
    const { ctx } = ctxOf(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn-end')
    return s.players.A.vp
  }

  it('CHA-116 DMN-4.2: round 1 -> 0; round 2 with the central markers in the Shadow -> 1 VP per marker (controlled or not); the opponent turn end -> 0', () => {
    const r1 = makeState({ ...DC, round: 1 }); withRecord(r1, { noMansLand: true, enemyZone: false })
    expect(endTurn(r1)).toBe(0)
    const r2 = makeState({ ...DC, round: 2 }); withRecord(r2, { noMansLand: true, enemyZone: false })
    expect(Object.values(r2.objectives)).toHaveLength(4)
    expect(endTurn(r2)).toBe(4)
    const opp = makeState({ ...DC, round: 2 }); withRecord(opp, { noMansLand: true, enemyZone: false }, 'B')
    expect(endTurn(opp)).toBe(0)
  })

  it('CHA-116 DMN-4.2: a marker inside the Daemon own deployment zone never scores', () => {
    const s = makeState(DC); withRecord(s, { noMansLand: true, enemyZone: false })
    const zone = s.mission.data.deploymentZones.A as { x: number; z: number }[]
    const cx = zone.reduce((n, p) => n + p.x, 0) / zone.length, cz = zone.reduce((n, p) => n + p.z, 0) / zone.length
    s.objectives['home'] = { ...s.objectives.west, id: 'home', pos: { x: cx, z: cz } }
    expect(endTurn(s)).toBe(4)
  })

  it('CHA-117 DMN-4.2: the central markers outside the Shadow -> 0; Warp Locus within 3" of a marker adds it; a controlled enemy zone adds its markers', () => {
    const none = makeState(DC); withRecord(none, { noMansLand: false, enemyZone: false })
    expect(endTurn(none)).toBe(0)
    const locus = makeState({ a: { ...DC.a, enhancementId: 'cdm.e.warp-locus' } }); withRecord(locus, { noMansLand: false, enemyZone: false })
    const north = locus.objectives.north.pos
    placeUnit(locus, KHA, [[north.x, north.z + 2.5 + 0.8]]) // base edge ~2.5" from the marker centre
    expect(endTurn(locus)).toBe(1)
    const far = makeState({ a: { ...DC.a, enhancementId: 'cdm.e.warp-locus' } }); withRecord(far, { noMansLand: false, enemyZone: false })
    placeUnit(far, KHA, [[north.x, north.z + 3.5 + 0.8]])
    expect(endTurn(far)).toBe(0)
    const enemy = makeState(DC); withRecord(enemy, { noMansLand: false, enemyZone: true })
    const zone = enemy.mission.data.deploymentZones.B as { x: number; z: number }[]
    enemy.objectives['theirs'] = { ...enemy.objectives.west, id: 'theirs', pos: { x: zone.reduce((n, p) => n + p.x, 0) / zone.length, z: zone.reduce((n, p) => n + p.z, 0) / zone.length } }
    expect(endTurn(enemy)).toBe(1)
  })
})

// =====================================================================================================================
describe('Blood-Maddened Banishment (DMN-5.1, CSM Daemonic Fervour reused)', () => {
  const BMB = 'cdm.s.blood-maddened-banishment'
  const fightState = () => {
    const s = makeState(); phase(s, 'fight', 'B', { A: 3 })
    placeUnit(s, BL1, [[0, 0]]); placeUnit(s, KHA, [[0, 1.5]]); placeUnit(s, BL2, [[10, 0]]); placeUnit(s, FH1, [[0, 10]]); placeUnit(s, BC, [[10, 10]]); placeUnit(s, ENEMY, [[1.5, 0]])
    return s
  }

  it('CHA-118 DMN-5.1: enemy targets Bloodletters (Kh\'har\'ret attached) in the Fight phase -> offered; using it grants fight-on-death 4+ to the unit', () => {
    const s = fightState()
    const { ctx } = ctxOf(s)
    const target = s.units[BL1].bodyguardUnitId ?? BL1
    const opts = offered(s, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BL1 })
    expect(opts.map((o) => o[0])).toContain(target)
    useStratagem(s, ctx, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BL1 }, [target])
    expect(s.players.A.cp).toBe(2)
    expect(fightOnDeathThreshold(s, BL1)).toBe(4)
    expect(fightOnDeathThreshold(s, KHA)).toBe(4)
  })

  it('CHA-119 DMN-5.1: not offered for Flesh Hounds / Bloodcrushers, once the Bloodletters have fought, or a second time in the same phase', () => {
    const s = fightState()
    expect(offered(s, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: FH1 })).toEqual([])
    expect(offered(s, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BC })).toEqual([])
    s.units[BL2].turn.foughtThisPhase = true
    expect(offered(s, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 })).toEqual([])
    s.units[BL2].turn.foughtThisPhase = false
    const { ctx } = ctxOf(s)
    useStratagem(s, ctx, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 }, [BL2])
    expect(offered(s, 'A', BMB, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BL1 })).toEqual([])
  })
})

// =====================================================================================================================
describe('Empyric Predators (DMN-5.2)', () => {
  const EP = 'cdm.s.empyric-predators'
  const OVERWATCH = 'core.s.fire-overwatch'
  const setup = (moveType: 'normal' | 'advance' | 'stationary' = 'normal', enemyX = 5) => {
    const s = makeState(); phase(s, 'movement', 'B', { A: 3 })
    placeUnit(s, FH1, [[0, 0]]); placeUnit(s, FH2, [[0, 12]]); placeUnit(s, BL2, [[0, -4]])
    placeUnit(s, ENEMY, [[enemyX, 0]])
    s.units[ENEMY].turn.moveType = moveType
    return s
  }
  const moveDistance = (s: GameState): number | undefined => {
    const p = s.pending as unknown as { kind: string; constraints: { maxDistance?: number; perModel?: Record<string, number> } }
    expect(p.kind).toBe('moveUnit')
    return p.constraints.maxDistance ?? Object.values(p.constraints.perModel ?? {})[0]
  }

  it('CHA-120 DMN-5.2: enemy ends a Normal or Advance move 5" from Flesh Hounds -> offered; used -> a Normal move of up to 6", 1 CP', () => {
    const s = setup()
    const { ctx } = ctxOf(s)
    const targets = offered(s, 'A', EP, 'movement.unitMoved', { unitId: ENEMY }).map((t) => t[0])
    expect(targets).toContain(FH1)
    expect(targets).not.toContain(BL2) // only FLESH HOUNDS
    expect(targets).not.toContain(FH2) // 12" away
    useStratagem(s, ctx, 'A', EP, 'movement.unitMoved', { unitId: ENEMY }, [FH1])
    expect(s.players.A.cp).toBe(2)
    expect(moveDistance(s)).toBe(6)
    const adv = setup('advance')
    expect(offered(adv, 'A', EP, 'movement.unitMoved', { unitId: ENEMY }).map((t) => t[0])).toContain(FH1)
  })

  it('CHA-121 DMN-5.2: enemy 9" away, or only Remained Stationary, or the Hounds already in Engagement Range -> not offered; own Movement phase -> not offered', () => {
    expect(offered(setup('normal', 9), 'A', EP, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
    expect(offered(setup('stationary'), 'A', EP, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
    expect(offered(setup('normal', 1.5), 'A', EP, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
    const own = setup(); phase(own, 'movement', 'A', { A: 3 })
    expect(offered(own, 'A', EP, 'movement.unitMoved', { unitId: ENEMY })).toEqual([])
  })

  it('CHA-121 DMN-5.2: Flesh Hounds that already fired Overwatch this phase are not eligible targets', () => {
    const s = setup()
    s.players.A.secondaryState['shotTurn'] = { key: `${s.round}:${s.activePlayer}`, unitIds: [FH1] }
    expect(offered(s, 'A', EP, 'movement.unitMoved', { unitId: ENEMY }).map((t) => t[0])).not.toContain(FH1)
  })

  it('CHA-121 DMN-5.2, E3: after Empyric Predators the Hounds cannot Fire Overwatch for the rest of the phase', () => {
    const s = setup()
    // spread the hounds and the Terminators out in clear ground so the hounds really can see the enemy
    placeUnit(s, FH1, [-3.6, -1.8, 0, 1.8, 3.6].map((z) => [-8, z] as [number, number]))
    placeUnit(s, ENEMY, [-3.6, -1.8, 0, 1.8, 3.6].map((z) => [-3, z] as [number, number]))
    const trigger = { unitId: ENEMY }
    const overwatchHounds = (): string[] => offered(s, 'A', OVERWATCH, 'movement.unitMoved', trigger).filter((t) => t[1] === FH1).map((t) => t[1])
    // before the stratagem the hounds are a legal Overwatch shooter (so the later refusal is the hook, not the setup)
    expect(hookService.overwatchForbidden?.(s, FH1)).toBe(false)
    expect(overwatchHounds()).toEqual([FH1])
    const { ctx } = ctxOf(s)
    useStratagem(s, ctx, 'A', EP, 'movement.unitMoved', { unitId: ENEMY }, [FH1])
    expect(hookService.overwatchForbidden?.(s, FH1)).toBe(true)
    expect(hookService.overwatchForbidden?.(s, FH2)).toBe(false)
    expect(overwatchHounds()).toEqual([])
    // the ban lasts the rest of the phase: the Hounds have moved away from the trigger but still cannot react to a later move
    expect(offered(s, 'A', OVERWATCH, 'movement.unitMoved', { unitId: ENEMY }).some((t) => t.includes(FH1))).toBe(false)
    // and it ends with the phase
    effectService.expire(ctx, 'phaseEnd', null)
    expect(hookService.overwatchForbidden?.(s, FH1)).toBe(false)
    expect(overwatchHounds()).toEqual([FH1])
  })
})

// =====================================================================================================================
describe('A Gory Path (DMN-6.1, E4)', () => {
  it('CHA-123 DMN-6.1: Kh\'har\'ret\'s unit consolidates up to 6" while its pile-in stays 3"; Bloodletters without him consolidate 3"', () => {
    const s = makeState()
    placeUnit(s, BL1, [[0, 0]]); placeUnit(s, KHA, [[0, 1.5]]); placeUnit(s, BL2, [[10, 0]])
    expect(hookService.consolidateDistance?.(s, BL1)).toBe(6)
    expect(hookService.consolidateDistance?.(s, KHA)).toBe(6)
    expect(hookService.pileInDistance?.(s, BL1)).toBe(3)
    expect(hookService.consolidateDistance?.(s, BL2)).toBe(3)
    expect(hookService.pileInDistance?.(s, BL2)).toBe(3)
  })

  it('CHA-123 DMN-6.1: once Kh\'har\'ret is destroyed the Bloodletters are back to 3"', () => {
    const s = makeState()
    placeUnit(s, BL1, [[0, 0]]); placeUnit(s, KHA, [[0, 1.5]])
    s.units[KHA].location = 'destroyed'
    expect(hookService.consolidateDistance?.(s, BL1)).toBe(3)
  })
})

// =====================================================================================================================
describe('Manifest Hate (DMN-5.3)', () => {
  const MH = 'cdm.s.manifest-hate'
  it('CHA-122 DMN-5.3: offered in the opponent Shooting phase when an enemy targets Bloodletters; not in the Fight phase or the Daemons\' own Shooting phase', () => {
    const s = makeState(); phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, BL2, [[0, 0]]); placeUnit(s, ENEMY, [[12, 0]])
    expect(offered(s, 'A', MH, 'shooting.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 }).map((t) => t[0])).toContain(BL2)
    const fight = makeState(); phase(fight, 'fight', 'B', { A: 3 })
    placeUnit(fight, BL2, [[0, 0]]); placeUnit(fight, ENEMY, [[1.5, 0]])
    expect(offered(fight, 'A', MH, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 })).toEqual([])
    const own = makeState(); phase(own, 'shooting', 'A', { A: 3 })
    placeUnit(own, BL2, [[0, 0]]); placeUnit(own, ENEMY, [[12, 0]])
    expect(offered(own, 'A', MH, 'shooting.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 })).toEqual([])
  })

  const shootingState = () => {
    const s = makeState(); phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, BL2, { x: 0, z: 0, gap: 0.3 }); placeUnit(s, ENEMY, { x: 12, z: 0, gap: 0.3 })
    return s
  }
  // the save the Bloodletters get against an AP -3 shot: kind and the D6 value that is needed
  const saveAgainstAp3 = (s: GameState) => of(enemyShot(s, BL2, [6, 6, 1], { ap: -3 }), 'SaveRolled')[0]
  const invulnFrom = (s: GameState, ctx: EngineContext): unknown[] => {
    const { modelId, weaponId } = firstWeapon(s, ENEMY, 'ranged')
    return hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, modelId, weaponId, BL2), roll: rollOf(3, 'save') }).map((r) => r.result).filter((r) => r.kind === 'roll' && r.invuln !== undefined)
  }

  it('CHA-122 DMN-5.3: used -> the Bloodletters save on a 4+ invulnerable against AP -3 (5+ before), and the effect ends with the phase', () => {
    // without the stratagem: Sv 7+ cannot save at AP -3, so the 5+ invulnerable is rolled
    expect(saveAgainstAp3(shootingState())).toMatchObject({ kind: 'invuln', needed: 5, saved: false })
    const s = shootingState()
    const { ctx } = ctxOf(s)
    expect(invulnFrom(s, ctx)).toEqual([])
    useStratagem(s, ctx, 'A', MH, 'shooting.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 }, [BL2])
    expect(s.players.A.cp).toBe(2)
    expect(invulnFrom(s, ctx)).toEqual([{ kind: 'roll', invuln: 4 }])
    // the whole attack sequence now judges the save against a 4
    expect(saveAgainstAp3(s)).toMatchObject({ kind: 'invuln', needed: 4 })
    // a 4 saves now where a 4 failed a 5+ before
    const t = shootingState()
    useStratagem(t, ctxOf(t).ctx, 'A', MH, 'shooting.targetsDeclared', { unitId: ENEMY, targetUnitId: BL2 }, [BL2])
    expect(of(enemyShot(t, BL2, [6, 6, 4], { ap: -3 }), 'SaveRolled')[0]).toMatchObject({ die: 4, needed: 4, saved: true })
    // other Daemon units are untouched, and the effect is gone once the phase ends
    placeUnit(s, FH1, { x: 0, z: 6, gap: 0.3 })
    expect(of(enemyShot(s, FH1, [6, 6, 1], { ap: -3 }), 'SaveRolled')[0]).toMatchObject({ needed: 5 })
    effectService.expire(ctx, 'phaseEnd', null)
    expect(invulnFrom(s, ctx)).toEqual([])
    expect(saveAgainstAp3(s)).toMatchObject({ kind: 'invuln', needed: 5 })
  })
})

// =====================================================================================================================
describe('Incarnated Rage (DMN-3.1)', () => {
  const meleeIds = (s: GameState, unitId: string): { modelId: string; weapon: string }[] =>
    s.units[unitId].models.flatMap((modelId) => s.models[modelId].weapons.filter((w) => s.weapons[w].kind === 'melee').map((weapon) => ({ modelId, weapon })))
  const abilities = (s: GameState, modelId: string, weaponId: string) => hookService.weaponAbilitiesFor!(s, modelId, s.weapons[weaponId]).map((a) => a.ability)

  it('CHA-112 DMN-3.1: Kh\'har\'ret leading Bloodletters -> every melee weapon of the unit (hellblades and the blade of blood) has Lethal Hits', () => {
    const s = makeState()
    placeUnit(s, BL1, [[0, 0]]); placeUnit(s, KHA, [[0, 1.5]])
    expect(leaderService.isAttached(s, BL1)).toBe(true)
    const bl = meleeIds(s, BL1), kha = meleeIds(s, KHA)
    expect(bl.length).toBe(s.units[BL1].models.length)
    expect(kha).toHaveLength(1)
    expect(s.weapons[kha[0].weapon].name).toBe('Blade of blood')
    for (const { modelId, weapon } of [...bl, ...kha]) expect(abilities(s, modelId, weapon), `${modelId} ${weapon}`).toContain('LETHAL_HITS')
  })

  it('CHA-112 DMN-3.1: detached (never attached, or the Bloodletters wiped out) -> no Lethal Hits for the blade of blood or any other Bloodletters', () => {
    const lone = makeState({ a: { attachments: [] } })
    placeUnit(lone, BL1, [[0, 0]]); placeUnit(lone, KHA, [[0, 1.5]]); placeUnit(lone, BL2, [[10, 0]])
    expect(leaderService.isAttached(lone, KHA)).toBe(false)
    for (const { modelId, weapon } of [...meleeIds(lone, BL1), ...meleeIds(lone, KHA), ...meleeIds(lone, BL2)]) expect(abilities(lone, modelId, weapon), `${modelId} ${weapon}`).not.toContain('LETHAL_HITS')
    // the bearer leads one unit only: the other Bloodletters squad never gets it
    const s = makeState()
    placeUnit(s, BL1, [[0, 0]]); placeUnit(s, KHA, [[0, 1.5]]); placeUnit(s, BL2, [[10, 0]])
    for (const { modelId, weapon } of meleeIds(s, BL2)) expect(abilities(s, modelId, weapon)).not.toContain('LETHAL_HITS')
    // the Bloodletters die, Kh'har'ret detaches and stands alone: the rule stops the moment he is no longer leading
    const { ctx } = ctxOf(s)
    for (const id of [...s.units[BL1].models]) removeModel(s, id)
    leaderService.detach(ctx, BL1)
    expect(leaderService.isAttached(s, KHA)).toBe(false)
    const { modelId, weapon } = meleeIds(s, KHA)[0]
    expect(abilities(s, modelId, weapon)).not.toContain('LETHAL_HITS')
  })
})

// =====================================================================================================================
describe('Collar of Khorne (DMN-6.2)', () => {
  const fnpRolls = (events: GameEvent[]) => of(events, 'FeelNoPainRolled').map((e) => e.needed)
  const fnpHook = (s: GameState, ctx: EngineContext, targetUnitId: string, o: { mortal: boolean; psychicSource: boolean }) => {
    const { modelId, weaponId } = firstWeapon(s, ENEMY, 'ranged')
    return hookService.collect(ctx, 'onFeelNoPainRoll', { attack: attackCtx(s, modelId, weaponId, targetUnitId), roll: rollOf(3, 'fnp'), ...o } as never)
      .map((r) => r.result).filter((r) => r.kind === 'roll' && r.feelNoPain !== undefined)
  }
  const shootingState = () => {
    const s = makeState(); phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, FH1, { x: 0, z: 0, gap: 0.3 }); placeUnit(s, BL2, { x: 0, z: 6, gap: 0.3 }); placeUnit(s, ENEMY, { x: 12, z: 0, gap: 0.3 })
    return s
  }

  it('CHA-124 DMN-6.2: a Psychic weapon wounding Flesh Hounds -> FNP 3+ is rolled; the same weapon without [PSYCHIC] (a bolter) gives no FNP', () => {
    // hit 6, wound 6, save 1 (fails), FNP 2 (fails) -> the wound is suffered after a 3+ FNP roll
    const psychic = enemyShot(shootingState(), FH1, [6, 6, 1, 2], { psychic: true })
    expect(of(psychic, 'FeelNoPainRolled')).toMatchObject([{ die: 2, needed: 3, ignored: false }])
    expect(of(psychic, 'DamageApplied')).toHaveLength(1)
    // FNP 3 -> ignored
    const shrugged = enemyShot(shootingState(), FH1, [6, 6, 1, 3], { psychic: true })
    expect(of(shrugged, 'FeelNoPainRolled')).toMatchObject([{ die: 3, needed: 3, ignored: true }])
    expect(of(shrugged, 'DamageApplied')).toHaveLength(0)
    // a plain bolter: no FNP die at all, the wound goes through
    const bolter = enemyShot(shootingState(), FH1, [6, 6, 1])
    expect(fnpRolls(bolter)).toEqual([])
    expect(of(bolter, 'DamageApplied')).toHaveLength(1)
  })

  it('CHA-124 DMN-6.2: only Flesh Hounds have it - a Psychic weapon wounding Bloodletters gets no FNP', () => {
    const events = enemyShot(shootingState(), BL2, [6, 6, 1], { psychic: true })
    expect(fnpRolls(events)).toEqual([])
    expect(of(events, 'DamageApplied')).toHaveLength(1)
  })

  it('CHA-124 DMN-6.2: mortal wounds from a Psychic ability get FNP 3+ on Flesh Hounds; non-Psychic mortal wounds, and other units, get none', () => {
    const s = shootingState()
    const { ctx } = ctxOf(s)
    expect(fnpHook(s, ctx, FH1, { mortal: true, psychicSource: true })).toEqual([{ kind: 'roll', feelNoPain: 3 }])
    expect(fnpHook(s, ctx, FH1, { mortal: true, psychicSource: false })).toEqual([])
    expect(fnpHook(s, ctx, BL2, { mortal: true, psychicSource: true })).toEqual([])
  })
})

// =====================================================================================================================
describe('Bloodcrushers (DMN-6)', () => {
  const fightState = () => {
    const s = makeState(); phase(s, 'fight', 'A', { A: 3 })
    placeUnit(s, BC, { x: 0, z: 0, gap: 0.3 }); placeUnit(s, ENEMY, { x: 0, z: 3.5, gap: 0.3 })
    return s
  }
  const HORN = 'cdm.w.juggernauts-bladed-horn', HELL = 'cdm.w.hellblade'
  const withWeapon = (s: GameState, dataId: string) => {
    const modelId = s.units[BC].models.find((m) => s.models[m].weapons.some((w) => s.weapons[w].id === dataId)) as string
    return { modelId, weaponId: s.models[modelId].weapons.find((w) => s.weapons[w].id === dataId) as string }
  }

  it('CHA-125 DMN-6: every Bloodcrusher fights with its hellblade AND its bladed horn (Extra Attacks), the horn being the only Extra Attacks weapon', () => {
    const s = fightState()
    const { ctx } = ctxOf(s)
    const hellblade = withWeapon(s, HELL), horn = withWeapon(s, HORN)
    const abilitiesOf = (w: { modelId: string; weaponId: string }) => hookService.weaponAbilitiesFor!(s, w.modelId, s.weapons[w.weaponId]).map((a) => a.ability)
    expect(abilitiesOf(horn)).toEqual(expect.arrayContaining(['EXTRA_ATTACKS', 'LANCE']))
    expect(abilitiesOf(hellblade)).not.toContain('EXTRA_ATTACKS')
    expect(abilitiesOf(hellblade)).not.toContain('LANCE')
    for (const modelId of s.units[BC].models) {
      const resolved = resolveModelWeapons(ctx, modelId)
      expect(resolved, modelId).not.toBe('pending')
      expect((resolved as string[]).map((w) => s.weapons[w].id).sort()).toEqual([HELL, HORN].sort())
    }
  })

  it('CHA-125 DMN-6: Lance - the bladed horn gets +1 to wound only on the turn the Bloodcrushers charged; the hellblade never does', () => {
    // horn S6 vs Terminator T5: wounds on a 3+. A wound die of 2 fails uncharged and passes with Lance's +1 (final 3).
    const woundOf = (weaponDataId: string, charged: boolean, die: number) => {
      const s = fightState()
      s.units[BC].turn.chargedThisTurn = charged
      const { modelId, weaponId } = withWeapon(s, weaponDataId)
      return of(runAttack(s, 'melee', BC, modelId, weaponId, ENEMY, [6, die]), 'WoundRolled')[0]
    }
    expect(woundOf(HORN, false, 2)).toMatchObject({ die: 2, final: 2, needed: 3, wounded: false })
    expect(woundOf(HORN, true, 2)).toMatchObject({ die: 2, final: 3, needed: 3, wounded: true })
    // hellblade S5 vs T5 wounds on a 4+: a charge adds nothing
    expect(woundOf(HELL, true, 3)).toMatchObject({ die: 3, final: 3, needed: 4, wounded: false })
    expect(woundOf(HELL, true, 4)).toMatchObject({ die: 4, final: 4, wounded: true })
  })
})

// =====================================================================================================================
describe('Deep Strike (DMN-6.3)', () => {
  // Kh'har'ret and the Bloodletters start in Reserves; everything else is on the board
  const reservesState = (round: number) => {
    const s = makeState({ a: { reserves: ['bloodletters-1'] }, round })
    s.phase = 'movement'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState(); s.step = 'reinforcements'
    placeUnit(s, BL2, { x: -12, z: 8, gap: 0.3 }); placeUnit(s, FH1, { x: -12, z: -8, gap: 0.3 }); placeUnit(s, FH2, { x: -12, z: -12, gap: 0.3 }); placeUnit(s, BC, { x: -12, z: 12, gap: 0.3 })
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    return s
  }

  it('CHA-127 DMN-6.3: the attached pair is one Deep Strike arrival in round 2, offered together; the datasheets carry Deep Strike', () => {
    const s = reservesState(2)
    expect(s.units[BL1].location).toBe('reserves')
    expect(s.units[KHA].location).toBe('reserves')
    expect(leaderService.isAttached(s, BL1)).toBe(true)
    expect(reserveRouteFor(s, BL1)).toBe('deepStrike')
    expect(reserveRouteFor(s, KHA)).toBe('deepStrike')
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    const pending = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(pending.kind).toBe('deployUnit')
    expect([...pending.context.unitIds].sort()).toEqual([BL1, KHA].sort())
  })

  it('CHA-127 DMN-6.3: the arrival must be more than 9" from every enemy model; a legal landing is accepted', () => {
    const s = reservesState(2)
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).toBe('pending')
    const pending = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const legal = (movementModule.legalActions!(s, pending) as Action[]).filter((a): a is Extract<Action, { type: 'deployUnit' }> => a.type === 'deployUnit' && !a.toReserves)
    expect(legal.length).toBeGreaterThan(0)
    const good = legal[0]
    expect(movementModule.validate!(s, good, pending)).toBeNull()
    const enemy = s.models[s.units[ENEMY].models[0]].pos
    for (const p of good.placements) expect(Math.hypot(p.pos.x - enemy.x, p.pos.z - enemy.z)).toBeGreaterThan(9)
    // the same landing shifted next to the Terminators (inside 9") is refused
    const close = { ...good, placements: good.placements.map((p, i) => ({ ...p, pos: { ...p.pos, x: enemy.x - 5, z: enemy.z + (i - 5) * 1.5 } })) }
    expect(movementModule.validate!(s, close, pending)?.reason).toMatch(/9|enem|distance/i)
  })

  it('CHA-127 DMN-6.3: refused in round 1 - no arrival is offered and the pair stays in Reserves', () => {
    const s = reservesState(1)
    const { ctx } = ctxOf(s)
    expect(movementModule.advance(ctx)).not.toBe('pending')
    expect(s.pending).toBeNull()
    expect(s.units[BL1].location).toBe('reserves')
    expect(s.units[KHA].location).toBe('reserves')
  })
})

// =====================================================================================================================
describe('Sv 7+ and the invulnerable saves (DMN-6)', () => {
  const shootingState = (attachments: PlayerSetup['attachments'] = []) => {
    const s = makeState({ a: { attachments } }); phase(s, 'shooting', 'B', { A: 3 })
    placeUnit(s, BL2, { x: 0, z: 0, gap: 0.3 }); placeUnit(s, KHA, [[0, 8]]); placeUnit(s, ENEMY, { x: 12, z: 0, gap: 0.3 })
    return s
  }

  it('CHA-128 DMN-6: Sv 7+ - a Bloodletter hit at AP 0 saves only with its 5+ invulnerable (a 4 fails, a 5 saves)', () => {
    const s = shootingState()
    expect(s.datasheets['cdm.bloodletters'].stats.Sv).toBe(7)
    const failed = of(enemyShot(shootingState(), BL2, [6, 6, 4]), 'SaveRolled')[0]
    expect(failed).toMatchObject({ kind: 'invuln', needed: 5, die: 4, saved: false })
    const saved = of(enemyShot(shootingState(), BL2, [6, 6, 5]), 'SaveRolled')[0]
    expect(saved).toMatchObject({ kind: 'invuln', needed: 5, die: 5, saved: true })
    expect(of(enemyShot(shootingState(), BL2, [6, 6, 5]), 'DamageApplied')).toHaveLength(0)
  })

  it('CHA-128 DMN-6: Kh\'har\'ret saves on his 4+ invulnerable rather than his 5+ armour, also at AP 0', () => {
    const s = shootingState()
    expect(s.datasheets['cdm.khharret-the-butcher'].stats.Sv).toBe(5)
    // a 4 saves on the 4+ invulnerable (it would fail the 5+ armour)
    expect(of(enemyShot(shootingState(), KHA, [6, 6, 4]), 'SaveRolled')[0]).toMatchObject({ kind: 'invuln', needed: 4, die: 4, saved: true })
    // a 3 fails either way
    expect(of(enemyShot(shootingState(), KHA, [6, 6, 3]), 'SaveRolled')[0]).toMatchObject({ kind: 'invuln', needed: 4, saved: false })
    // at AP -2 armour is hopeless and the invulnerable is unchanged
    expect(of(enemyShot(shootingState(), KHA, [6, 6, 4], { ap: -2 }), 'SaveRolled')[0]).toMatchObject({ kind: 'invuln', needed: 4, saved: true })
  })
})
