// T'au Empire: Sudden Dawn Cadre (docs/spec/factions/tau-empire--sudden-dawn-cadre.md, checklist SDC-001..SDC-032). Real Combat Patrol
// data; covers the (b) code hooks: Electro-static Flares, Prototype Systems, Grav-inhibitor Drone, Lives Before Territory,
// Surprise Attack, Ethereal Edict (pick + score).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameState, type GameSetup,
  type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services,
} from '../../src/engine'
import { codeHooks } from '../../src/engine/code-hooks'
import { hookService } from '../../src/engine/hooks-impl'
import { attackService } from '../../src/engine/attack'
import { ftggObserverEligible } from '../../src/engine/factions/tau-empire'
import { missionService } from '../../src/engine/missions'
import { unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { transportService } from '../../src/engine/transports'
import { movementModule } from '../../src/engine/phases/movement'
import type { Action, GameEvent, UseStratagemAction } from '../../src/engine'
import { stratagemService } from '../../src/engine/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TAU = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: "T'au Empire", faction: 'tau-empire', patrolId: 'tau.cp.sudden-dawn-cadre', enhancementId: 'tau.e.electrostatic-flares', secondaryId: 'tau.sec.surprise-attack',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const CLOUD = 'A:cloudspear', PATH = 'A:pathfinders', BREACH = 'A:breachers', FISH = 'A:devilfish'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss'
const LIVES = 'tau.s.lives-before-territory'
const PROJECTOR = 'tau.w.airbursting-fragmentation-projector'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TAU(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'sdc', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
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

function deploy(s: GameState): void {
  placeUnit(s, CLOUD, [[-6, 0]])
  placeUnit(s, PATH, { x: -10, z: 6, gap: 0.3 })
  placeUnit(s, BREACH, { x: -6, z: 4, gap: 0.3 })
  placeUnit(s, FISH, [[-20, -10]])
  placeUnit(s, BOYZ, { x: 8, z: 0, gap: 0.3 })
  placeUnit(s, BOYZ2, { x: 8, z: 8, gap: 0.3 })
  placeUnit(s, BOSS, [[10, -6]])
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

// net to-hit modifier an Ork shoota volley at `targetId` receives
function hitModifier(s: GameState, targetId: string): number {
  const { ctx } = ctxOf(s)
  const out = hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, s.units[BOYZ].models[0], 'ork.w.shoota', targetId), roll: rollOf(4, 'hit') })
  return out.reduce((sum, r) => sum + ((r.result as { modifier?: number }).modifier ?? 0), 0)
}
function invulnOf(s: GameState, targetId: string): number | null {
  const { ctx } = ctxOf(s)
  const out = hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, s.units[BOYZ].models[0], 'ork.w.shoota', targetId), roll: rollOf(0, 'save') })
  const vals = out.map((r) => (r.result as { invuln?: number }).invuln).filter((v): v is number => typeof v === 'number')
  return vals.length ? Math.min(...vals) : null
}

function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

// =====================================================================================================================
describe('Electro-static Flares (SDC-3)', () => {
  it('SDC-005 SDC-3: Cloudspear has a 4+ invulnerable save; ranged attacks vs Breachers within 6" get -1 to hit; at 6.1" none; a Devilfish within 6" none', () => {
    const s = makeState(); deploy(s)
    expect(invulnOf(s, CLOUD)).toBe(4)
    placeUnit(s, BREACH, [[-6, 4]]) // 4" from Cloudspear
    expect(hitModifier(s, BREACH)).toBe(-1)
    placeUnit(s, BREACH, [[-6, 6.3 + s.models[s.units[BREACH].models[0]].base.radius + s.models[s.units[CLOUD].models[0]].base.radius]])
    expect(hitModifier(s, BREACH)).toBe(0)
    placeUnit(s, FISH, [[-6, -3]])
    expect(hitModifier(s, FISH)).toBe(0)
    expect(hitModifier(s, CLOUD)).toBe(-1) // the bearer's own unit is always in range
  })

  it('SDC-006 SDC-3.1: Flares -1 plus another -1 to hit is still capped at -1 by the attack pipeline', () => {
    const s = makeState(); deploy(s)
    // the aura contributes exactly one -1 (the cap itself is the shared R-6 clamp)
    placeUnit(s, BREACH, [[-6, 4]])
    expect(hitModifier(s, BREACH)).toBe(-1)
    expect(codeHooks.electrostaticFlares.forceScope).toMatchObject({ who: 'friendly', within: 6 })
  })

  it('SDC-007 SDC-3.2: Flares forbid Fire Overwatch against T\'au units within 6" of Cloudspear, never against a Devilfish or units beyond 6"', () => {
    const s = makeState(); deploy(s)
    const forbidden = (id: string) => hookService.overwatchForbiddenAgainst(s, id)
    placeUnit(s, BREACH, [[-6, 4]])
    expect(forbidden(BREACH)).toBe(true)
    expect(forbidden(CLOUD)).toBe(true)
    placeUnit(s, FISH, [[-6, -3]])
    expect(forbidden(FISH)).toBe(false)
    placeUnit(s, PATH, [[-6, 30]])
    expect(forbidden(PATH)).toBe(false)
    expect(forbidden(BOYZ)).toBe(false)
    const none = makeState({ a: { enhancementId: 'tau.e.prototype-systems' } }); deploy(none)
    expect(hookService.overwatchForbiddenAgainst(none, BREACH)).toBe(false)
  })
})

// =====================================================================================================================
describe('Prototype Systems (SDC-3)', () => {
  const proto = () => makeState({ a: { enhancementId: 'tau.e.prototype-systems' } })

  it('SDC-008 SDC-3: Prototype Systems gives a 4+ invulnerable save and a one-die hit and wound re-roll', () => {
    const s = proto(); deploy(s)
    expect(invulnOf(s, CLOUD)).toBe(4)
    const { ctx } = ctxOf(s)
    const kinds = (hook: 'onHitRoll' | 'onWoundRoll') => hookService.collect(ctx, hook, {
      attack: attackCtx(s, s.units[CLOUD].models[0], 'tau.w.plasma-rifle', BOYZ), roll: rollOf(1, hook === 'onHitRoll' ? 'hit' : 'wound'),
    }).map((r) => (r.result as { reroll?: string }).reroll)
    expect(kinds('onHitRoll')).toContain('oneDie')
    expect(kinds('onWoundRoll')).toContain('oneDie')
  })

  it('SDC-010 SDC-3: Prototype Systems lets the projector\'s Attacks roll be re-rolled; the plasma rifle has no such offer', () => {
    const s = proto(); deploy(s)
    const model = s.units[CLOUD].models[0]
    expect(hookService.attackCountRerollSource(s, model, s.weapons[PROJECTOR])).toBe('tau.e.prototype-systems.projector')
    expect(hookService.attackCountRerollSource(s, model, s.weapons['tau.w.plasma-rifle'])).toBeNull()
    const flares = makeState(); deploy(flares)
    expect(hookService.attackCountRerollSource(flares, flares.units[CLOUD].models[0], flares.weapons[PROJECTOR])).toBeNull()
  })
})

// =====================================================================================================================
describe('Grav-inhibitor Drone (SDC-6.3)', () => {
  const chargeMod = (s: GameState, charger: string, targets: string[]): number => {
    s.phase = 'charge'; s.activePlayer = 'B'; s.phaseState = emptyPhaseState()
    const { ctx } = ctxOf(s)
    const out = hookService.collect(ctx, 'onChargeRoll', {
      chargingUnitId: charger, targetUnitIds: targets, roll: { purpose: 'charge', roll: { ...rollOf(0, 'charge').roll, dice: [4, 5], final: [4, 5] }, dieIndex: 0, unmodified: 9, rerolled: false },
    })
    return out.reduce((sum, r) => sum + ((r.result as { modifier?: number }).modifier ?? 0), 0)
  }

  it('SDC-022 SDC-6.3: an enemy charge that targets the Pathfinders gets -2; a charge at another T\'au unit does not', () => {
    const s = makeState(); deploy(s)
    expect(chargeMod(s, BOYZ, [PATH])).toBe(-2)
    expect(chargeMod(s, BOYZ, [BREACH])).toBe(0)
    expect(chargeMod(s, BOYZ, [BREACH, PATH])).toBe(-2)
  })

  it('SDC-023 SDC-6.3: the drone entry is flagged non-cumulative so the charge module applies only the worst negative', () => {
    const s = makeState()
    expect(s.abilities['tau.a.grav-inhibitor-drone'].params).toMatchObject({ nonCumulativeNegative: true, modelId: 'shasui' })
    expect(s.abilities['tau.a.grav-inhibitor-drone'].effect).toMatchObject({ modifyRoll: { roll: 'charge', value: -2 } })
  })

  it('SDC-024 SDC-6.3: the drone stops working once the Shas\'ui is destroyed', () => {
    const s = makeState(); deploy(s)
    expect(chargeMod(s, BOYZ, [PATH])).toBe(-2)
    const shasui = s.units[PATH].models.find((id) => s.models[id].datasheetModelId === 'shasui')!
    s.units[PATH].models = s.units[PATH].models.filter((id) => id !== shasui)
    delete s.models[shasui]
    expect(chargeMod(s, BOYZ, [PATH])).toBe(0)
  })
})

// =====================================================================================================================
describe('Lives Before Territory (SDC-5)', () => {
  const env = (s: GameState) => ({ state: s, services: openServices(), player: 'A' as const, stratagem: s.stratagems[LIVES], window: 'shooting.targetsDeclared' as const, trigger: { unitId: BOYZ, targetUnitId: PATH } })
  const offered = (s: GameState, targetId: string) =>
    stratagemService.options(s, 'A', 'shooting.targetsDeclared', { unitId: BOYZ, targetUnitId: targetId }).filter((x) => x.stratagemId === LIVES).flatMap((x) => x.targets.unitIds ?? [])
  const theirTurn = (s: GameState) => { s.activePlayer = 'B'; s.phase = 'shooting'; s.phaseState = emptyPhaseState(); s.players.A.cp = 3 }

  it('SDC-017 SDC-5: using it marks the Benefit of Cover for the phase and raises a reactive move of the rolled D6', () => {
    const s = makeState(); deploy(s); theirTurn(s)
    const { ctx } = ctxOf(s, [4])
    codeHooks.livesBeforeTerritory.apply!(ctx, env(s), { ids: [PATH], objectiveId: null })
    expect(s.phaseState.marks).toContain(`cover:${PATH}`)
    expect(hookService.hasBenefitOfCover(s, PATH)).toBe(true)
    expect(hookService.hasBenefitOfCover(s, BREACH)).toBe(false)
    const p = s.pending as unknown as { kind: string; context: { unitId: string }; constraints: { perModel?: Record<string, number> } }
    expect(p.kind).toBe('moveUnit')
    expect(p.context.unitId).toBe(PATH)
    expect(Object.values(p.constraints.perModel ?? {})[0]).toBe(4)
  })

  it('SDC-018 SDC-5.3: offered for a targeted Pathfinder/Breacher/Cloudspear unit only; not the Devilfish, an untargeted unit, an engaged unit, or in own turn', () => {
    const s = makeState(); deploy(s); theirTurn(s)
    expect(offered(s, PATH)).toContain(PATH)
    expect(offered(s, BREACH)).toContain(BREACH)
    expect(offered(s, CLOUD)).toContain(CLOUD)
    expect(offered(s, FISH)).not.toContain(FISH)
    expect(offered(s, PATH)).not.toContain(BREACH) // only the targeted unit
    // engaged unit
    const near = s.models[s.units[BOYZ].models[0]]
    placeUnit(s, BREACH, [[near.pos.x - near.base.radius - s.models[s.units[BREACH].models[0]].base.radius - 0.4, near.pos.z]])
    expect(offered(s, BREACH)).not.toContain(BREACH)
    // own turn
    const own = makeState(); deploy(own); own.players.A.cp = 3
    expect(offered(own, PATH)).toEqual([])
  })
})

// =====================================================================================================================
describe('Surprise Attack (SDC-4)', () => {
  const nmlMarkers = (s: GameState) => Object.values(s.objectives).filter((o) => o.home === null)
  function turnEnd(s: GameState, who: 'A' | 'B' = 'A'): number {
    s.phase = 'fight'; s.activePlayer = who; s.phaseState = emptyPhaseState()
    const sa = () => Object.entries(s.players.A.vpBySource).filter(([k]) => k.startsWith('surprise-attack')).reduce((n, [, v]) => n + v, 0)
    const before = sa()
    missionService.onWindow(ctxOf(s, [], false).ctx, 'turn.end', 't')
    return sa() - before
  }
  const control = (s: GameState, ids: string[]) => {
    for (const o of Object.values(s.objectives)) o.controller = ids.includes(o.id) ? 'A' : null
    for (const o of Object.values(s.objectives)) if (ids.includes(o.id)) { o.securedBy = 'A' }
  }

  it('SDC-011 SDC-4.1: round 1 controlling NML markers scores 4 each at own turn end; home markers and the opponent\'s turn end score nothing', () => {
    const s = makeState({ round: 1 }); deploy(s)
    const nml = nmlMarkers(s)
    expect(nml.length).toBeGreaterThanOrEqual(2)
    control(s, nml.slice(0, 2).map((o) => o.id))
    expect(turnEnd(s)).toBe(8)
    const home = makeState({ round: 1 }); deploy(home); placeUnit(home, CLOUD, [[-20, -12]]); placeUnit(home, BREACH, [[-20, -13]]); placeUnit(home, PATH, [[-20, -14]])
    const inZone = nmlMarkers(home).slice(0, 2)
    inZone[0].pos = { x: 0, z: -12 }; inZone[1].pos = { x: 5, z: 12 } // centres inside the two deployment zones
    control(home, inZone.map((o) => o.id))
    expect(turnEnd(home)).toBe(0)
    const theirs = makeState({ round: 1 }); deploy(theirs)
    control(theirs, nmlMarkers(theirs).slice(0, 2).map((o) => o.id))
    expect(turnEnd(theirs, 'B')).toBe(0)
  })

  it('SDC-012 SDC-4.2: round 3 scores 2 per NML marker; round 5 is capped at 5', () => {
    const r3 = makeState({ round: 3 }); deploy(r3)
    control(r3, nmlMarkers(r3).slice(0, 2).map((o) => o.id))
    expect(turnEnd(r3)).toBe(4)
    const r5 = makeState({ round: 5 }); deploy(r5)
    for (const o of nmlMarkers(r5).slice(0, 3)) o.pos = { ...o.pos } // centres untouched
    control(r5, nmlMarkers(r5).map((o) => o.id))
    expect(turnEnd(r5)).toBe(Math.min(5, 2 * nmlMarkers(r5).length))
  })
})

// =====================================================================================================================
describe('Ethereal Edict (SDC-4.3)', () => {
  const edict = () => makeState({ round: 1, a: { secondaryId: 'tau.sec.ethereal-edict' } })
  function roundStart(s: GameState) {
    s.phase = 'command'; s.activePlayer = 'A'; s.phaseState = emptyPhaseState()
    const c = ctxOf(s, [], false)
    missionService.onWindow(c.ctx, 'round.start', 'r1')
    return c.ctx
  }
  function battleEnd(s: GameState): number {
    s.round = 5; s.phase = 'fight'; s.phaseState = emptyPhaseState()
    const before = s.players.A.vp
    missionService.onWindow(ctxOf(s, [], false).ctx, 'battle.end', 'b')
    return s.players.A.vp - before
  }

  it('SDC-013 SDC-4.3: at round 1 the OPPONENT is asked to pick one of their own canonical units', () => {
    const s = edict(); deploy(s)
    roundStart(s)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('B')
    const ids = p.options.map((o) => o.id).filter((id) => id !== 'decline')
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => s.units[id].player === 'B')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('SDC-014 SDC-4.3: a chosen unit alive inside a transport at battle end is not destroyed (0 VP)', () => {
    const s = edict(); deploy(s)
    const ctx = roundStart(s)
    answerOption(ctx, BOYZ)
    transportService.embark(s, BOYZ, BOYZ2) // stored as reserves, but linked to a transport: alive
    expect(s.units[BOYZ].location).toBe('reserves')
    expect(battleEnd(s)).toBe(0)
    transportService.disembark(s, BOYZ) // an unlinked Reserves unit never arrived: counts as destroyed
    expect(battleEnd(s)).toBe(12)
  })

  it('SDC-014 SDC-4.3: the chosen unit destroyed by battle end scores 12 VP; alive scores 0', () => {
    const run = (kill: boolean): number => {
      const s = edict(); deploy(s)
      const ctx = roundStart(s)
      answerOption(ctx, BOYZ)
      expect(s.players.A.secondaryState['tau:edict']).toMatchObject({ halves: [BOYZ] })
      if (kill) s.units[BOYZ].location = 'destroyed'
      return battleEnd(s)
    }
    expect(run(true)).toBe(12)
    expect(run(false)).toBe(0)
  })
})

// =====================================================================================================================
// SDC-003, 004, 015, 021, 025
// =====================================================================================================================
const optIds = (s: GameState): string[] => (s.pending as ChooseOptionDecision).options.map((o) => o.id)

// run a real attack sequence to completion with scripted dice; returns the emitted events
function runAttack(s: GameState, modelId: string, weaponId: string, targetUnitId: string, dice: number[], modules?: ModuleTable): GameEvent[] {
  const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...Array(60).fill(1)]), modules ?? DEFAULT_MODULES)
  attackService.begin(ctx, { kind: s.weapons[weaponId].kind, attackerUnitId: s.models[modelId].unitId, overwatch: false, targets: [{ modelId, weaponId, targetUnitId, profileGroup: null, attacks: 1 }] })
  for (let i = 0; i < 200; i++) {
    if (attackService.advance(ctx) === 'done') break
    const p = s.pending as (PendingDecision & { options?: { action: Action }[] }) | null
    if (!p) break
    s.pending = null
    const opt = p.options?.[0]
    if (!opt) throw new Error(`no option for ${p.kind}`)
    const owner = p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll' ? DEFAULT_MODULES.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, { ...opt.action, decisionId: p.id } as Action, p as PendingDecision)
    if (rej) throw new Error(`${rej.code} ${rej.reason}`)
  }
  return events
}
const hitsOf = (ev: GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { type: 'HitRolled' }> => e.type === 'HitRolled')
const woundsOf = (ev: GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { type: 'WoundRolled' }> => e.type === 'WoundRolled')

describe('For the Greater Good: Observer rules (SDC-2)', () => {
  const ignoresCover = (s: GameState, ctx: EngineContext, target: string): boolean => hookService.collect(ctx, 'onSaveRoll', {
    attack: attackCtx(s, s.units[PATH].models[0], 'tau.w.plasma-rifle', target, { inCover: true }), roll: rollOf(0, 'save'),
  }).some((x) => (x.result as { ignoreCover?: boolean }).ignoreCover)
  const guide = (observer: string) => {
    const s = makeState(); deploy(s)
    placeUnit(s, FISH, [[-2, -6]]) // in range and sight of the Boyz
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', PATH)).toBe(true)
    expect(optIds(s)).toContain(`${observer}@${BOYZ}`)
    answerOption(ctx, `${observer}@${BOYZ}`)
    return { s, ctx }
  }

  it('SDC-003 SDC-2.1: Breachers observing (MARKERLIGHT) give Guided attacks vs the Spotted unit Ignores Cover; a Devilfish observing does not', () => {
    const viaBreachers = guide(BREACH)
    expect(ignoresCover(viaBreachers.s, viaBreachers.ctx, BOYZ)).toBe(true)
    expect(ignoresCover(viaBreachers.s, viaBreachers.ctx, BOYZ2)).toBe(false)
    const viaFish = guide(FISH)
    expect(ignoresCover(viaFish.s, viaFish.ctx, BOYZ)).toBe(false)
  })

  it('SDC-004 SDC-2.2: an embarked unit is never an Observer and is never offered its own FtGG pick', () => {
    const s = makeState(); deploy(s)
    transportService.embark(s, BREACH, FISH)
    expect(s.units[BREACH].location).toBe('reserves')
    const { ctx } = ctxOf(s)
    expect(ftggObserverEligible(ctx, BREACH)).toBe(false)
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', BREACH)).toBe(false)
    // the Pathfinders' pick lists no embarked Observer (the Devilfish may still observe)
    placeUnit(s, FISH, [[-2, -6]])
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', PATH)).toBe(true)
    expect(optIds(s).some((id) => id.startsWith(BREACH))).toBe(false)
  })
})

describe('Fight by the Code (SDC-5.1)', () => {
  const FBC = 'tau.s.fight-by-the-code'
  const ready = () => { const s = makeState(); deploy(s); s.players.A.cp = 3; return s }
  const offeredTo = (s: GameState): string[] =>
    stratagemService.options(s, 'A', 'shooting.start', {}).filter((x) => x.stratagemId === FBC).flatMap((x) => x.targets.unitIds ?? [])

  it('SDC-015 SDC-5.1: offered only for a unit that Fell Back and has not shot; with it the unit shoots, without it it cannot', () => {
    const s = ready()
    expect(offeredTo(s)).toEqual([]) // nobody Fell Back
    s.units[PATH].turn.moveType = 'fallBack'
    expect(offeredTo(s)).toEqual([PATH]) // only the unit that Fell Back
    const done = ready(); done.units[PATH].turn.moveType = 'fallBack'; done.units[PATH].turn.shotThisPhase = true
    expect(offeredTo(done)).toEqual([]) // already shot
    const { ctx } = ctxOf(s)
    expect(unitEligibleToShoot(ctx, PATH)).toBe(false) // a Fell-Back unit cannot shoot on its own
    const action = stratagemService.options(s, 'A', 'shooting.start', {}).find((x) => x.stratagemId === FBC)! as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'shooting.start', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    expect(stratagemService.validate!(s, { ...action, decisionId: 'd:1' }, pending)).toBeNull()
    expect(stratagemService.handle(ctx, { ...action, decisionId: 'd:1' }, pending)).toBeUndefined()
    expect(unitEligibleToShoot(ctx, PATH)).toBe(true)
    expect(s.players.A.cp).toBe(2)
  })
})

describe('Cloudspear and Breachers abilities (SDC-6)', () => {
  // a copy of the real bundle where the Boyz have Stealth (-1 to be hit by ranged attacks)
  const stealthState = (): GameState => {
    const b = structuredClone(bundle) as DataBundle
    const ds = b.datasheets['ork.boyz']
    ds.coreAbilities = [...ds.coreAbilities, { ability: 'STEALTH' }] as never
    const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TAU(), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
    const st = createGameState(setup, b, 'sdc', ENGINE_VERSION)
    st.round = 2; st.activePlayer = 'A'; st.phase = 'shooting'; st.phaseState = emptyPhaseState()
    return st
  }
  const unseen = (): ModuleTable => ({
    phases: DEFAULT_MODULES.phases, topics: DEFAULT_MODULES.topics,
    services: { ...DEFAULT_MODULES.services, los: { ...DEFAULT_MODULES.services.los, visible: () => false, unitVisible: () => false } },
  })

  it('SDC-021 SDC-6.2: Weapon Support System - the Cloudspear ignores a -1 to hit; an unmodified 1-3 vs an unseen Indirect target still fails', () => {
    // Stealth target: Cloudspear (BS3+) unmodified 3 still hits; a Pathfinder pulse rifle (BS4+) unmodified 4 is dragged to 3 and misses
    const s = stealthState(); deploy(s)
    placeUnit(s, CLOUD, [[-6, 0]]); placeUnit(s, BOYZ, { x: 4, z: 0, gap: 0.3 })
    expect(hitsOf(runAttack(s, s.units[CLOUD].models[0], 'tau.w.plasma-rifle', BOYZ, [3]))[0]).toMatchObject({ die: 3, final: 3, hit: true })
    const t = stealthState(); deploy(t)
    const bs4 = Object.values(t.weapons).find((w) => w.kind === 'ranged' && w.skill === 4)! // any BS4+ gun of the roster
    placeUnit(t, PATH, [[-6, 0]]); placeUnit(t, BOYZ, { x: 4, z: 0, gap: 0.3 })
    expect(hitsOf(runAttack(t, t.units[PATH].models[0], bs4.id, BOYZ, [4]))[0]).toMatchObject({ die: 4, final: 3, hit: false })
    // Indirect projector at a target nobody can see: an unmodified 4 hits, an unmodified 3 fails despite BS 3+
    const proj = 'tau.w.airbursting-fragmentation-projector'
    const hit4 = makeState(); deploy(hit4); placeUnit(hit4, CLOUD, [[-6, 0]]); placeUnit(hit4, BOYZ, { x: 4, z: 0, gap: 0.3 })
    expect(hitsOf(runAttack(hit4, hit4.units[CLOUD].models[0], proj, BOYZ, [4], unseen()))[0]).toMatchObject({ die: 4, final: 4, hit: true })
    const hit3 = makeState(); deploy(hit3); placeUnit(hit3, CLOUD, [[-6, 0]]); placeUnit(hit3, BOYZ, { x: 4, z: 0, gap: 0.3 })
    expect(hitsOf(runAttack(hit3, hit3.units[CLOUD].models[0], proj, BOYZ, [3], unseen()))[0]).toMatchObject({ die: 3, hit: false })
  })

  it('SDC-025 SDC-6.4: Breach and Clear - Breacher ranged wound rolls are re-rolled against a unit on an objective, not off one, and never in melee', () => {
    const wounds = (onObjective: boolean) => {
      const s = makeState(); deploy(s)
      const obj = Object.values(s.objectives)[0]
      const at = onObjective ? { x: obj.pos.x, z: obj.pos.z } : { x: 0, z: 100 }
      if (!onObjective) for (const o of Object.values(s.objectives)) o.pos = { x: o.pos.x + 200, z: o.pos.z + 200 }
      placeUnit(s, BOYZ, [[at.x, at.z]])
      placeUnit(s, BREACH, [[at.x - 5, at.z]])
      // S6 pulse blaster vs T5 boyz wounds on 3+: hit 6, wound 1 (fails), re-roll 6
      return woundsOf(runAttack(s, s.units[BREACH].models[0], 'tau.w.pulse-blaster', BOYZ, [6, 1, 6]))
    }
    const on = wounds(true), off = wounds(false)
    // one roll event each: on the marker the unmodified 1 is re-rolled into the 6; off it the 1 stands
    expect(on).toHaveLength(1)
    expect(on[0]).toMatchObject({ die: 6, wounded: true })
    expect(off).toHaveLength(1)
    expect(off[0]).toMatchObject({ die: 1, wounded: false })
    // melee is unaffected: no re-roll for a melee weapon even on a marker
    const m = makeState(); deploy(m)
    const o0 = Object.values(m.objectives)[0]
    placeUnit(m, BOYZ, [[o0.pos.x, o0.pos.z]])
    const { ctx } = ctxOf(m)
    const rerolls = (weapon: string) => hookService.collect(ctx, 'onWoundRoll', {
      attack: attackCtx(m, m.units[BREACH].models[0], weapon, BOYZ), roll: rollOf(1, 'wound'),
    }).map((r) => (r.result as { reroll?: string }).reroll).filter(Boolean)
    expect(rerolls('tau.w.pulse-blaster')).toContain('all')
    expect(rerolls('tau.w.close-combat-weapon')).not.toContain('all')
  })
})

describe('Deep Strike (SDC-032)', () => {
  const arrive = (s: GameState, x: number): string | null => {
    const { ctx } = ctxOf(s)
    const m = s.models[`${CLOUD}#0`]
    s.phase = 'movement'; s.step = 'reinforcements'
    s.phaseState = emptyPhaseState()
    s.phaseState.activated = Object.values(s.units).filter((u) => u.player === 'A' && u.location === 'board').map((u) => u.id)
    movementModule.advance(ctx)
    expect(s.pending?.kind).toBe('deployUnit')
    const action: Action = { type: 'deployUnit', player: 'A', decisionId: '', unitId: CLOUD, placements: [{ modelId: m.id, pos: { x, y: 0, z: 0 } }] }
    return movementModule.validate!(s, action, s.pending!)?.code ?? null
  }
  const reservesState = (round: number): GameState => {
    const s = makeState({ a: { reserves: ['cloudspear'] }, round })
    placeUnit(s, FISH, [[-20, -10]]); placeUnit(s, PATH, { x: -10, z: 6, gap: 0.3 }); placeUnit(s, BREACH, { x: -6, z: 4, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 }); placeUnit(s, BOYZ2, { x: 10, z: 8, gap: 0.3 }); placeUnit(s, BOSS, [[10, -6]])
    return s
  }

  it('SDC-032 SDC-6: Cloudspear may start in Reserves; not offered in round 1; round 2 arrival within 9" of an enemy is rejected, beyond 9" accepted', () => {
    const r1 = reservesState(1)
    expect(r1.units[CLOUD].location).toBe('reserves')
    r1.phase = 'movement'; r1.step = 'reinforcements'; r1.phaseState = emptyPhaseState()
    expect(movementModule.advance(ctxOf(r1).ctx)).toBe('done')
    expect(r1.units[CLOUD].location).toBe('reserves')
    // enemy models are around x=10, z=-6..8; the origin row is far from the Boyz at x=10 only along x
    const enemyX = Math.min(...Object.values(reservesState(2).models).filter((m) => [BOYZ, BOYZ2, BOSS].includes(m.unitId)).map((m) => m.pos.x))
    expect(arrive(reservesState(2), enemyX - 5)).toBe('E_ENGAGEMENT')
    expect(arrive(reservesState(2), enemyX - 25)).toBeNull()
  })

  it('SDC-032 SDC-6: the Devilfish has no Deep Strike and cannot start in Reserves', () => {
    expect(() => makeState({ a: { reserves: ['devilfish'] } })).toThrow(/Deep Strike/)
  })
})
