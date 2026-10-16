// Adeptus Mechanicus: Purge Corps Deltic-9 (docs/spec/factions/adeptus-mechanicus.md, checklist ADM-001..ADM-026). Real Combat Patrol
// data; covers the (b) code hooks: Doctrina Imperatives, Rad-saturation, Line-breakers, Optimised Efficiency (justFellBack),
// Targeted Purge, Prescribed Excoriation, plus the Searing Conflagration condition they sit beside.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, deploymentZone, emptyPhaseState, view,
  type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState, type ModuleTable,
  type PendingDecision, type PlayerId, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { attackService } from '../../src/engine/attack'
import { activeImperative, IMPERATIVE_KEY } from '../../src/engine/factions/adeptus-mechanicus'
import { etherealEdictOffer } from '../../src/engine/factions/tau-empire'
import { effectService } from '../../src/engine/effects'
import { withinEngagementRange } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { missionService } from '../../src/engine/missions'
import { resolveModelWeapons } from '../../src/engine/phases/fight'
import { reserveRouteFor } from '../../src/engine/phases/movement'
import { buildShootingWeaponEntries, unitEligibleToShoot, validateDeclareTargets } from '../../src/engine/phases/shooting'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const ADM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'AdMech', faction: 'adeptus-mechanicus', patrolId: 'adm.cp.purge-corps-deltic-9', enhancementId: 'adm.e.aspergilla-of-tarentum',
  secondaryId: 'adm.sec.targeted-purge', attachments: [{ leaderRef: 'skand', bodyguardRef: 'vanguard' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const VAN = 'A:vanguard', SKAND = 'A:skand', HOUNDS = 'A:sulphurhounds', PTER = 'A:pteraxii'
const VAN_B = 'B:vanguard'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', BOSS = 'B:warboss', KOPTAS = 'B:deffkoptas', DREAD = 'B:deff-dread'
const RADIUM = 'adm.w.radium-carbine'
const EFFICIENCY = 'adm.s.pcd-optimised-efficiency'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; mirror?: boolean; round?: number; phase?: GameState['phase'] }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: ADM(o.a), B: o.mirror ? ADM({ name: 'AdMech B', ...o.b }) : ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'adeptus-mechanicus', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.B.waaagh.used = true // keep the Ork Waaagh! pick out of the round.start picks under test
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

function answerOption(ctx: EngineContext, optionId: string) {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  return hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
}
const answerOk = (ctx: EngineContext, optionId: string): void => {
  const rej = answerOption(ctx, optionId)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
const optionIds = (s: GameState): string[] => ((s.pending as ChooseOptionDecision | null)?.options ?? []).map((o) => o.id)
const setImperative = (s: GameState, player: PlayerId, choice: 'protector' | 'conqueror', round = s.round): void => {
  s.players[player].secondaryState[IMPERATIVE_KEY] = { round, choice }
}
const modelWith = (s: GameState, unitId: string, weaponId: string): string => s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))!

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

// a copy of a state weapon with a different AP, registered under a fresh id (attackers with a known AP for the Doctrina tests)
function withAp(s: GameState, baseId: string, ap: number, kind?: 'ranged' | 'melee'): string {
  const id = `test.${baseId}.ap${ap}${kind ?? ''}`
  s.weapons = { ...s.weapons, [id]: { ...s.weapons[baseId], id, AP: ap, ...(kind ? { kind } : {}) } }
  return id
}
const apAt = (s: GameState, attackerModel: string, weaponId: string, target: string): number =>
  weaponService.effectiveWeapon(s, attackerModel, weaponId, attackCtx(s, attackerModel, weaponId, target)).AP

// a point just inside / outside a player's deployment zone (zones are full-width strips: A z -15..-10, B z 10..15)
const inZone = (s: GameState, p: PlayerId): [number, number] => { const z = deploymentZone(s, p); return [0, (z[0].z + z[2].z) / 2] }
const baseRadius = (s: GameState, unitId: string): number => s.models[s.units[unitId].models[0]].base.radius
// a unit whose nearest base edge is `gap` inches from the player's zone edge on the board-centre side
const placeOutsideZone = (s: GameState, unitId: string, p: PlayerId, gap: number): void => {
  const z = deploymentZone(s, p)
  const edge = p === 'A' ? Math.max(z[0].z, z[2].z) : Math.min(z[0].z, z[2].z)
  const r = baseRadius(s, unitId)
  placeUnit(s, unitId, [[0, p === 'A' ? edge + gap + r : edge - gap - r]])
}

// =====================================================================================================================
describe('Doctrina Imperatives: the pick (ADM-2.1)', () => {
  it('ADM-003 ADM-2.1: round.start asks the AdMech player to choose Protector or Conqueror (no pass); the choice is stored for that round only', () => {
    const s = makeState({ round: 1 })
    const { ctx } = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(p.canPass).toBe(false)
    expect(optionIds(s)).toEqual(['protector', 'conqueror'])
    expect(p.context.data.code).toBe('doctrinaImperatives')
    expect(activeImperative(s, 'A')).toBeNull()
    answerOk(ctx, 'conqueror')
    expect(s.players.A.secondaryState[IMPERATIVE_KEY]).toEqual({ round: 1, choice: 'conqueror' })
    expect(activeImperative(s, 'A')).toBe('conqueror')
    s.round = 2
    expect(activeImperative(s, 'A')).toBeNull()
  })

  it('ADM-003 ADM-2.1: anything but the two imperatives is rejected; a player without a Doctrina unit is not asked', () => {
    const s = makeState({ round: 1 })
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'round.start', '1')
    expect(answerOption(ctx, 'neither')?.code).toBe('E_NOT_AN_OPTION')
    const t = makeState({ round: 1 })
    // only Skand (no Doctrina ability) is left alive
    for (const id of [VAN, HOUNDS, PTER]) t.units[id].location = 'destroyed'
    const { ctx: c2 } = ctxOf(t)
    hookService.offerPicks(c2, 'round.start', '1')
    const data = (t.pending as ChooseOptionDecision | null)?.context.data as { code?: string } | undefined
    expect(data?.code).not.toBe('doctrinaImperatives')
    expect(activeImperative(t, 'A')).toBeNull()
  })

  it('ADM-003 ADM-2.1: an AdMech mirror asks both players, the first player first', () => {
    const s = makeState({ round: 1, mirror: true })
    s.firstPlayer = 'B'
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'round.start', '1')
    expect((s.pending as ChooseOptionDecision).player).toBe('B')
    answerOk(ctx, 'protector')
    expect((s.pending as ChooseOptionDecision).player).toBe('A')
    answerOk(ctx, 'conqueror')
    expect(s.pending).toBeNull()
    expect(activeImperative(s, 'B')).toBe('protector')
    expect(activeImperative(s, 'A')).toBe('conqueror')
  })
})

describe('Doctrina Imperatives: weapon abilities (ADM-2.2, 2.3)', () => {
  const carbineAbilities = (s: GameState): string[] => hookService.weaponAbilitiesFor(s, modelWith(s, VAN, RADIUM), s.weapons[RADIUM]).map((a) => a.ability)

  it('ADM-004 ADM-2.2/2.3: Protector gives ranged weapons HEAVY, Conqueror gives them ASSAULT, neither before a pick', () => {
    const s = makeState()
    expect(carbineAbilities(s)).not.toContain('HEAVY')
    expect(carbineAbilities(s)).not.toContain('ASSAULT')
    setImperative(s, 'A', 'protector')
    expect(carbineAbilities(s)).toContain('HEAVY')
    expect(carbineAbilities(s)).not.toContain('ASSAULT')
    setImperative(s, 'A', 'conqueror')
    expect(carbineAbilities(s)).toContain('ASSAULT')
    expect(carbineAbilities(s)).not.toContain('HEAVY')
  })

  it('ADM-004 ADM-2.2/2.3: melee weapons gain neither; a unit that Advanced shoots only under Conqueror', () => {
    const s = makeState()
    setImperative(s, 'A', 'protector')
    const ccw = hookService.weaponAbilitiesFor(s, modelWith(s, VAN, 'adm.w.close-combat-weapon'), s.weapons['adm.w.close-combat-weapon']).map((a) => a.ability)
    expect(ccw).not.toContain('HEAVY')
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 6]])
    s.units[VAN].turn.moveType = 'advance'
    s.units[SKAND].turn.moveType = 'advance'
    const { ctx } = ctxOf(s)
    expect(unitEligibleToShoot(ctx, VAN)).toBe(false)
    setImperative(s, 'A', 'conqueror')
    expect(unitEligibleToShoot(ctx, VAN)).toBe(true)
  })
})

describe('Doctrina Imperatives: the AP clauses (ADM-2.2-2.6)', () => {
  const orkGun = (s: GameState, ap: number, kind?: 'ranged' | 'melee'): { model: string; weapon: string } => {
    const base = Object.values(s.weapons).find((w) => w.kind === (kind ?? 'ranged') && s.models[s.units[BOYZ].models[0]].weapons.includes(w.id)) ?? Object.values(s.weapons).find((w) => w.kind === 'ranged')!
    return { model: s.units[BOYZ].models[0], weapon: withAp(s, base.id, ap, kind) }
  }

  it('ADM-005 ADM-2.2/2.4: Protector worsens the AP of ranged attacks on a Vanguard partly in its own zone, never past 0', () => {
    const s = makeState()
    setImperative(s, 'A', 'protector')
    const [x, z] = inZone(s, 'A')
    placeUnit(s, VAN, [[x, z]])
    placeUnit(s, SKAND, [[x + 1, z]])
    placeUnit(s, BOYZ, [[0, 0]])
    expect(apAt(s, orkGun(s, -1).model, orkGun(s, -1).weapon, VAN)).toBe(0)
    expect(apAt(s, orkGun(s, -2).model, orkGun(s, -2).weapon, VAN)).toBe(-1)
    expect(apAt(s, orkGun(s, 0).model, orkGun(s, 0).weapon, VAN)).toBe(0)
  })

  it('ADM-005 ADM-2.2/2.4: wholly outside the zone, in melee, or with no attack context nothing changes; no pick = no effect', () => {
    const s = makeState()
    setImperative(s, 'A', 'protector')
    placeOutsideZone(s, VAN, 'A', 3)
    placeUnit(s, SKAND, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 12]])
    const g = orkGun(s, -2)
    expect(apAt(s, g.model, g.weapon, VAN)).toBe(-2)
    const [x, z] = inZone(s, 'A')
    placeUnit(s, VAN, [[x, z]])
    const melee = orkGun(s, -2, 'melee')
    const mctx = attackCtx(s, melee.model, melee.weapon, VAN, { kind: 'melee' })
    expect(weaponService.effectiveWeapon(s, melee.model, melee.weapon, mctx).AP).toBe(-2)
    // the Vanguard's own weapon profile (no attack context) is never modified
    expect(weaponService.effectiveWeapon(s, modelWith(s, VAN, RADIUM), RADIUM).AP).toBe(s.weapons[RADIUM].AP)
    // in the zone but the Protector imperative is not the one picked
    setImperative(s, 'A', 'conqueror')
    expect(apAt(s, g.model, g.weapon, VAN)).toBe(-2)
  })

  it('ADM-005 ADM-2.4: a Vanguard with a single model reaching over the zone edge counts as in the zone', () => {
    const s = makeState()
    setImperative(s, 'A', 'protector')
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    const z = deploymentZone(s, 'A')
    const edge = Math.max(z[0].z, z[2].z)
    const r = baseRadius(s, VAN)
    placeUnit(s, BOYZ, [[0, 5]])
    // centre outside by less than the base radius: partly inside
    const models = s.units[VAN].models
    placeUnit(s, VAN, [[0, edge + r * 0.5], ...models.slice(1).map((): [number, number] => [0, 0])])
    const g = orkGun(s, -2)
    expect(apAt(s, g.model, g.weapon, VAN)).toBe(-1)
  })

  it('ADM-006 ADM-2.3/2.4: Conqueror improves the AP of ranged attacks on a target partly in the enemy zone, not outside it, not in melee', () => {
    const s = makeState()
    setImperative(s, 'A', 'conqueror')
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    const m = modelWith(s, VAN, RADIUM)
    const [x, z] = inZone(s, 'B')
    placeUnit(s, BOYZ, [[x, z]])
    expect(apAt(s, m, RADIUM, BOYZ)).toBe(-1)
    placeOutsideZone(s, BOYZ, 'B', 3)
    expect(apAt(s, m, RADIUM, BOYZ)).toBe(0)
    placeUnit(s, BOYZ, [[x, z]])
    const ccw = 'adm.w.close-combat-weapon'
    const cctx = attackCtx(s, modelWith(s, VAN, ccw), ccw, BOYZ, { kind: 'melee' })
    expect(weaponService.effectiveWeapon(s, modelWith(s, VAN, ccw), ccw, cctx).AP).toBe(0)
    setImperative(s, 'A', 'protector')
    expect(apAt(s, m, RADIUM, BOYZ)).toBe(0)
  })

  it('ADM-007 ADM-2.1: the imperative expires with the battle round', () => {
    const s = makeState()
    setImperative(s, 'A', 'conqueror', 2)
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    const [x, z] = inZone(s, 'B')
    placeUnit(s, BOYZ, [[x, z]])
    const m = modelWith(s, VAN, RADIUM)
    expect(apAt(s, m, RADIUM, BOYZ)).toBe(-1)
    s.round = 3
    expect(apAt(s, m, RADIUM, BOYZ)).toBe(0)
    setImperative(s, 'A', 'conqueror', 3)
    expect(apAt(s, m, RADIUM, BOYZ)).toBe(-1)
  })

  it('ADM-007 ADM-2.5: Skand alone gets nothing; attached he shares the Vanguard\'s HEAVY and its Protector AP penalty', () => {
    const alone = makeState({ a: { attachments: [] } })
    setImperative(alone, 'A', 'protector')
    const cannon = 'adm.w.transonic-cannon'
    expect(hookService.weaponAbilitiesFor(alone, alone.units[SKAND].models[0], alone.weapons[cannon]).map((a) => a.ability)).not.toContain('HEAVY')
    const [x, z] = inZone(alone, 'A')
    placeUnit(alone, SKAND, [[x, z]])
    placeUnit(alone, BOYZ, [[0, 0]])
    const g = orkGun(alone, -1)
    expect(apAt(alone, g.model, g.weapon, SKAND)).toBe(-1)

    const joined = makeState()
    setImperative(joined, 'A', 'protector')
    expect(hookService.weaponAbilitiesFor(joined, joined.units[SKAND].models[0], joined.weapons[cannon]).map((a) => a.ability)).toContain('HEAVY')
    placeUnit(joined, VAN, [[x, z]])
    placeUnit(joined, SKAND, [[x + 1, z]])
    placeUnit(joined, BOYZ, [[0, 0]])
    const g2 = orkGun(joined, -1)
    expect(apAt(joined, g2.model, g2.weapon, VAN)).toBe(0)
  })

  it('ADM-007 ADM-2.6: mirror - an attacker\'s Conqueror (-1) and the defender\'s Protector (+1, never past 0) both apply', () => {
    const s = makeState({ mirror: true })
    setImperative(s, 'A', 'conqueror')
    setImperative(s, 'B', 'protector')
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    const [x, z] = inZone(s, 'B')
    placeUnit(s, VAN_B, [[x, z]])
    placeUnit(s, 'B:skand', [[x + 1, z]])
    const m = modelWith(s, VAN, RADIUM)
    const ap1 = withAp(s, RADIUM, -1)
    expect(apAt(s, m, ap1, VAN_B)).toBe(-1) // -1 - 1 + 1
    const ap0 = withAp(s, RADIUM, 0)
    expect(apAt(s, m, ap0, VAN_B)).toBe(0) // -1 + 1, capped at 0
    // without the defender's Protector the Conqueror bonus stands
    setImperative(s, 'B', 'conqueror')
    expect(apAt(s, m, ap1, VAN_B)).toBe(-2)
  })
})

// =====================================================================================================================
describe('secondary objectives (ADM-4)', () => {
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
  const markKeyword = (s: GameState, unitId: string, keyword: string): void => {
    const ds = s.units[unitId].datasheetId
    s.datasheets = { ...s.datasheets, [ds]: { ...s.datasheets[ds], keywords: [...s.datasheets[ds].keywords, keyword] } }
  }

  it('ADM-011 ADM-4.1: at round 1 the OPPONENT picks one of their own units; MONSTER and VEHICLE units are not listed', () => {
    const s = makeState({ round: 1 })
    roundStart(s)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('B')
    expect(p.context.data.code).toBe('targetedPurgePick')
    const ids = optionIds(s)
    expect(ids).toEqual(expect.arrayContaining([BOYZ, BOYZ2, BOSS]))
    expect(ids).not.toContain(KOPTAS)
    expect(ids).not.toContain(DREAD)
  })

  it('ADM-011 ADM-4.1: an attached pair with a MONSTER half is not listed', () => {
    const s = makeState({ round: 1, mirror: true })
    markKeyword(s, 'B:skand', 'MONSTER')
    roundStart(s)
    const ids = optionIds(s)
    expect(ids).not.toContain(VAN_B)
    expect(ids).not.toContain('B:skand')
    expect(ids).toContain('B:sulphurhounds')
  })

  it('ADM-011 ADM-4.1: the picked unit destroyed at battle end scores 12 VP; alive scores 0; still in Reserves scores 12', () => {
    const run = (end: 'dead' | 'alive' | 'reserves'): number => {
      const s = makeState({ round: 1 })
      const ctx = roundStart(s)
      answerOk(ctx, BOYZ)
      placeUnit(s, BOYZ, [[0, 0]])
      expect(s.players.A.secondaryState['tau:edict']).toMatchObject({ halves: [BOYZ] })
      if (end === 'dead') s.units[BOYZ].location = 'destroyed'
      if (end === 'reserves') s.units[BOYZ].location = 'reserves'
      return battleEnd(s)
    }
    expect(run('dead')).toBe(12)
    expect(run('alive')).toBe(0)
    expect(run('reserves')).toBe(12)
  })

  it('ADM-012 ADM-4.1: answering with a VEHICLE unit (or an enemy unit) is rejected', () => {
    const s = makeState({ round: 1 })
    const ctx = roundStart(s)
    expect(answerOption(ctx, KOPTAS)?.code).toBe('E_INVALID_TARGET')
    const t = makeState({ round: 1 })
    const c2 = roundStart(t)
    expect(answerOption(c2, VAN)?.code).toBe('E_INVALID_TARGET')
  })

  it('ADM-012 ADM-4.1: an opponent with only MONSTER/VEHICLE units gives no pick and no VP; another secondary gives no pick', () => {
    const s = makeState({ round: 1 })
    for (const id of [BOYZ, BOYZ2, BOSS]) markKeyword(s, id, 'VEHICLE')
    roundStart(s)
    expect(s.pending).toBeNull()
    expect(battleEnd(s)).toBe(0)
    const t = makeState({ round: 1, a: { secondaryId: 'adm.sec.prescribed-excoriation' } })
    roundStart(t)
    expect((t.pending as ChooseOptionDecision | null)?.context.data.code).not.toBe('targetedPurgePick')
  })

  it('ADM-012 regression: Ethereal Edict (default options) still lists every unit, VEHICLEs included', () => {
    const s = makeState({ round: 1 })
    const { ctx } = ctxOf(s)
    etherealEdictOffer(ctx, 'A', 'round.start', 'k')
    const p = s.pending as ChooseOptionDecision
    expect(p.context.data.code).toBe('etherealEdictPick')
    expect(optionIds(s)).toEqual(expect.arrayContaining([KOPTAS, DREAD, BOYZ]))
    answerOk(ctx, KOPTAS)
    expect(s.players.A.secondaryState['tau:edict']).toMatchObject({ halves: [KOPTAS] })
  })

  // ---- Prescribed Excoriation ----
  const excoriation = () => makeState({ round: 2, a: { secondaryId: 'adm.sec.prescribed-excoriation' } })
  function turnEnd(s: GameState, active: PlayerId = 'A'): number {
    s.phase = 'fight'; s.activePlayer = active; s.phaseState = emptyPhaseState()
    const before = s.players.A.vp
    missionService.onWindow(ctxOf(s, [], false).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }
  const farAway = (s: GameState): void => {
    for (const id of [BOYZ, BOYZ2, BOSS, KOPTAS, DREAD]) placeUnit(s, id, [[18, 8]])
    for (const id of [VAN, SKAND, HOUNDS, PTER]) placeUnit(s, id, [[-20, -12]])
  }

  it('ADM-013 ADM-4.2: round 1 scores 0; round 2 with the closest enemy 6.5" from the zone scores 5', () => {
    const r1 = makeState({ round: 1, a: { secondaryId: 'adm.sec.prescribed-excoriation' } })
    farAway(r1)
    expect(turnEnd(r1)).toBe(0)
    const s = excoriation(); farAway(s)
    placeOutsideZone(s, BOYZ, 'A', 6.5)
    expect(turnEnd(s)).toBe(5)
  })

  it('ADM-013 ADM-4.2: an enemy 4" from the zone (outside it) scores 3; one partly inside the zone scores 0', () => {
    const s = excoriation(); farAway(s)
    placeOutsideZone(s, BOYZ, 'A', 4)
    expect(turnEnd(s)).toBe(3)
    const t = excoriation(); farAway(t)
    const [x, z] = inZone(t, 'A')
    placeUnit(t, BOYZ, [[x, z]])
    expect(turnEnd(t)).toBe(0)
  })

  it('ADM-013 ADM-4.2: the opponent\'s turn end scores nothing for the AdMech player', () => {
    const s = excoriation(); farAway(s)
    placeOutsideZone(s, BOYZ, 'A', 6.5)
    expect(turnEnd(s, 'B')).toBe(0)
  })

  it('ADM-014 ADM-4.2: a Battle-shocked enemy inside the zone is ignored; embarked / Reserves units are ignored', () => {
    const s = excoriation(); farAway(s)
    const [x, z] = inZone(s, 'A')
    placeUnit(s, BOYZ, [[x, z]])
    s.units[BOYZ].battleShocked = true
    expect(turnEnd(s)).toBe(5)
    const t = excoriation(); farAway(t)
    placeUnit(t, BOYZ, [[x, z]])
    t.units[BOYZ].location = 'reserves'
    expect(turnEnd(t)).toBe(5)
  })

  it('ADM-014 ADM-4.2: an attached enemy pair with one half Battle-shocked is ignored', () => {
    const s = makeState({ round: 2, mirror: true, a: { secondaryId: 'adm.sec.prescribed-excoriation' } })
    for (const id of [VAN_B, 'B:skand', 'B:sulphurhounds', 'B:pteraxii']) placeUnit(s, id, [[18, 8]])
    for (const id of [VAN, SKAND, HOUNDS, PTER]) placeUnit(s, id, [[-20, -12]])
    const [x, z] = inZone(s, 'A')
    placeUnit(s, VAN_B, [[x, z]])
    placeUnit(s, 'B:skand', [[x + 1, z]])
    expect(turnEnd(s)).toBe(0)
    s.units['B:skand'].battleShocked = true
    expect(turnEnd(s)).toBe(5)
  })
})

// =====================================================================================================================
describe('Optimised Efficiency (ADM-5)', () => {
  const ready = (): GameState => { const s = makeState({ phase: 'movement' }); s.players.A.cp = 3; for (const id of [VAN, SKAND, HOUNDS, PTER]) placeUnit(s, id, [[-10, -5]]); return s }
  const offeredTo = (s: GameState, trigger: { unitId?: string }): string[] =>
    stratagemService.options(s, 'A', 'movement.unitMoved', trigger).filter((x) => x.stratagemId === EFFICIENCY).flatMap((x) => x.targets.unitIds ?? [])

  it('ADM-016 ADM-5: offered for the unit that just Fell Back, not after a Normal move or Advance, not for another unit', () => {
    const s = ready()
    s.units[HOUNDS].turn.moveType = 'fallBack'
    expect(offeredTo(s, { unitId: HOUNDS })).toContain(HOUNDS)
    expect(offeredTo(s, { unitId: HOUNDS })).not.toContain(VAN)
    for (const mv of ['normal', 'advance'] as const) {
      const t = ready()
      t.units[HOUNDS].turn.moveType = mv
      expect(offeredTo(t, { unitId: HOUNDS })).not.toContain(HOUNDS)
    }
    // the Vanguard fell back earlier but the window is for the Hounds
    const u = ready()
    u.units[VAN].turn.moveType = 'fallBack'
    u.units[HOUNDS].turn.moveType = 'fallBack'
    expect(offeredTo(u, { unitId: HOUNDS })).toEqual([HOUNDS])
  })

  it('ADM-016 ADM-5: used, the unit is eligible to shoot and to charge although it Fell Back (own Shooting phase)', () => {
    const s = ready()
    s.units[HOUNDS].turn.moveType = 'fallBack'
    placeUnit(s, HOUNDS, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 8]])
    s.phase = 'shooting'
    const { ctx } = ctxOf(s)
    expect(unitEligibleToShoot(ctx, HOUNDS)).toBe(false)
    expect(hookService.eligibilityFor(s, HOUNDS, 'charge')).toBe(false)
    s.phase = 'movement'
    const action = stratagemService.options(s, 'A', 'movement.unitMoved', { unitId: HOUNDS }).find((x) => x.stratagemId === EFFICIENCY)! as UseStratagemAction
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'movement.unitMoved', canPass: true, context: { trigger: { unitId: HOUNDS } }, options: [] } as unknown as PendingDecision
    expect(stratagemService.validate!(s, { ...action, decisionId: 'd:1' }, pending)).toBeNull()
    expect(stratagemService.handle(ctx, { ...action, decisionId: 'd:1' }, pending)).toBeUndefined()
    expect(s.players.A.cp).toBe(2)
    s.phase = 'shooting'
    expect(unitEligibleToShoot(ctx, HOUNDS)).toBe(true)
    expect(hookService.eligibilityFor(s, HOUNDS, 'charge')).toBe(true)
  })
})

// =====================================================================================================================
describe('Rad-saturation (ADM-6.2)', () => {
  const oc = (s: GameState, unitId: string, base: number): number =>
    hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'OC' }, base)
  // single-model stacks: Vanguard at the origin, `unitId` slid along +x until the closest-model gap is `gap`
  const gapPlace = (s: GameState, unitId: string, gap: number): void => {
    placeUnit(s, unitId, [[20, 0]])
    const d0 = leaderService.unitDistance(s, unitId, VAN)
    placeUnit(s, unitId, [[20 + gap - d0, 0]])
    expect(leaderService.unitDistance(s, unitId, VAN)).toBeCloseTo(gap, 2)
  }

  it('ADM-018 ADM-6.2: enemy OC drops by 1 within 3" (never below 0); at 3.1" and beyond it does not', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    gapPlace(s, BOYZ, 2.9)
    expect(oc(s, BOYZ, 2)).toBe(1)
    expect(oc(s, BOYZ, 1)).toBe(0)
    expect(oc(s, BOYZ, 0)).toBe(0)
    gapPlace(s, BOYZ, 3.1)
    expect(oc(s, BOYZ, 2)).toBe(2)
  })

  it('ADM-018 ADM-6.2: VEHICLE units and friendly units are unaffected; the aura works while the Vanguard is Battle-shocked', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    gapPlace(s, KOPTAS, 2)
    expect(oc(s, KOPTAS, 1)).toBe(1)
    gapPlace(s, HOUNDS, 2)
    expect(oc(s, HOUNDS, 2)).toBe(2)
    gapPlace(s, BOYZ, 2)
    s.units[VAN].battleShocked = true
    expect(oc(s, BOYZ, 2)).toBe(1)
  })

  it('ADM-018 ADM-6.2: two Vanguard-type sources are not cumulative; a Vanguard off the board has no aura', () => {
    const s = makeState({ mirror: true })
    placeUnit(s, VAN, [[0, 0]])
    placeUnit(s, SKAND, [[0, 0]])
    placeUnit(s, VAN_B, [[0, 1]])
    placeUnit(s, 'B:skand', [[0, 1]])
    placeUnit(s, HOUNDS, [[0, 2]])
    // A's Hounds (OC 2) sit within 3" of B's Vanguard: -1 once
    expect(oc(s, HOUNDS, 2)).toBe(1)
    s.units[VAN_B].location = 'reserves'
    expect(oc(s, HOUNDS, 2)).toBe(2)
  })
})

// =====================================================================================================================
describe('Line-breakers (ADM-6.3, 6.5)', () => {
  // resolve the queued mortal wounds: answer every allocation decision with its first option
  function drive(ctx: EngineContext): void {
    if (ctx.state.pending || !ctx.state.phaseState.attack) return
    let r = attackService.advance(ctx)
    for (let guard = 0; r === 'pending' && guard < 200; guard++) {
      const pending = ctx.state.pending as unknown as PendingDecision
      const opts = ('options' in pending ? pending.options : []) as { action: UseStratagemAction }[]
      ctx.state.pending = null
      const rej = attackService.handler.handle(ctx, opts[0].action, pending)
      if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
      r = attackService.advance(ctx)
    }
  }
  // Sulphurhounds engaged with the Boyz: models stacked so every Hound is within Engagement Range of a Boy
  function engage(s: GameState, targets: string[] = [BOYZ]): void {
    placeUnit(s, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    targets.forEach((t, i) => placeUnit(s, t, [[1.6, i * 40]]))
    for (const h of s.units[HOUNDS].models) expect(withinEngagementRange(s.models[h], s.models[s.units[targets[0]].models[0]])).toBe(true)
  }

  function charge(s: GameState, dice: number[], startAt: [number, number] | null, targets: string[] = [BOYZ]): { ctx: EngineContext; woundsBefore: number } {
    const { ctx } = ctxOf(s, [...dice, ...Array(30).fill(1)])
    s.phase = 'charge'
    s.phaseState = emptyPhaseState()
    // the start position: where the Hounds stood when the charge move began
    if (startAt) placeUnit(s, HOUNDS, [startAt])
    expect(hookService.offerPicks(ctx, 'charge.moveStarted', HOUNDS)).toBe(false)
    engage(s, targets)
    const woundsBefore = totalWounds(s, targets[0])
    hookService.offerPicks(ctx, 'charge.moveEnded', HOUNDS)
    drive(ctx)
    return { ctx, woundsBefore }
  }
  const totalWounds = (s: GameState, unitId: string): number => s.units[unitId].models.reduce((a, m) => a + s.models[m].woundsRemaining, 0)

  it('ADM-019 ADM-6.3: three Hounds end a charge in Engagement Range, started more than 6" from the Vanguard: 3 dice, each 4+ is a mortal wound', () => {
    const s = makeState({ phase: 'charge' })
    placeUnit(s, VAN, [[-33, 0]])
    placeUnit(s, SKAND, [[-33, 0]])
    const { woundsBefore } = charge(s, [4, 3, 6], [-22, 0])
    expect(woundsBefore - totalWounds(s, BOYZ)).toBe(2)
  })

  it('ADM-019 ADM-6.3: started within 6" of the Vanguard (BATTLELINE): +2 to each die, so 2+ succeeds', () => {
    const s = makeState({ phase: 'charge' })
    placeUnit(s, VAN, [[-8, 0]])
    placeUnit(s, SKAND, [[-8, 0]])
    const { woundsBefore } = charge(s, [1, 2, 3], [-3, 0])
    expect(woundsBefore - totalWounds(s, BOYZ)).toBe(2)
  })

  it('ADM-019 ADM-6.3: two enemy units in Engagement Range - the owner chooses which takes the mortal wounds', () => {
    const s = makeState({ phase: 'charge' })
    placeUnit(s, VAN, [[-33, 0]])
    placeUnit(s, SKAND, [[-33, 0]])
    const { ctx } = ctxOf(s, [6, 6, 6, ...Array(30).fill(1)])
    s.phaseState = emptyPhaseState()
    placeUnit(s, HOUNDS, [[-22, 0]])
    hookService.offerPicks(ctx, 'charge.moveStarted', HOUNDS)
    placeUnit(s, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    placeUnit(s, BOYZ, [[1.6, 0]])
    placeUnit(s, BOYZ2, [[-1.6, 0]])
    expect(hookService.offerPicks(ctx, 'charge.moveEnded', HOUNDS)).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(optionIds(s).sort()).toEqual([BOYZ, BOYZ2])
    expect(answerOption(ctx, BOSS)?.code).toBeDefined() // not engaged: not an offered option, the hook refuses it
    s.pending = p
    const before = totalWounds(s, BOYZ2)
    const boyzBefore = totalWounds(s, BOYZ)
    answerOk(ctx, BOYZ2)
    drive(ctx)
    expect(before - totalWounds(s, BOYZ2)).toBe(3)
    expect(totalWounds(s, BOYZ)).toBe(boyzBefore)
  })

  it('ADM-020 ADM-6.3: a Hound not within Engagement Range of the chosen unit rolls no die', () => {
    const s = makeState({ phase: 'charge' })
    placeUnit(s, VAN, [[-33, 0]])
    placeUnit(s, SKAND, [[-33, 0]])
    const { ctx } = ctxOf(s, [6, 6, 6, ...Array(30).fill(1)])
    s.phaseState = emptyPhaseState()
    placeUnit(s, HOUNDS, [[-22, 0]])
    hookService.offerPicks(ctx, 'charge.moveStarted', HOUNDS)
    placeUnit(s, HOUNDS, [[0, 0], [0, 12], [0, 24]])
    placeUnit(s, BOYZ, [[1.6, 0]])
    const before = totalWounds(s, BOYZ)
    hookService.offerPicks(ctx, 'charge.moveEnded', HOUNDS)
    drive(ctx)
    expect(before - totalWounds(s, BOYZ)).toBe(1) // one Hound in ER: one die (a 6)
  })

  it('ADM-020 ADM-6.3: no enemy in Engagement Range means no roll and nothing happens; the hook fires once', () => {
    const s = makeState({ phase: 'charge' })
    placeUnit(s, VAN, [[-33, 0]])
    const { ctx } = ctxOf(s, [6, 6, 6])
    s.phaseState = emptyPhaseState()
    placeUnit(s, HOUNDS, [[-22, 0], [-22, 0.2], [-22, 0.4]])
    placeUnit(s, BOYZ, [[10, 0]])
    const boyzWounds = totalWounds(s, BOYZ)
    hookService.offerPicks(ctx, 'charge.moveStarted', HOUNDS)
    expect(hookService.offerPicks(ctx, 'charge.moveEnded', HOUNDS)).toBe(false)
    expect(s.phaseState.attack).toBeFalsy()
    expect(totalWounds(s, BOYZ)).toBe(boyzWounds)
  })

  it('ADM-020 ADM-6.3/6.5: only Skand (not BATTLELINE) within 6" at the start gives no bonus', () => {
    const s = makeState({ phase: 'charge', a: { attachments: [] } })
    placeUnit(s, VAN, [[-40, 0]])
    placeUnit(s, SKAND, [[-8, 0]])
    const { woundsBefore } = charge(s, [1, 2, 3], [-3, 0])
    expect(woundsBefore - totalWounds(s, BOYZ)).toBe(0)
  })

  it('ADM-020 ADM-6.5: the BATTLELINE snapshot is judged on the Hounds that survive Fire Overwatch', () => {
    // one Hound starts within 6" of the Vanguard, two far away; dice 1,2,1 become 3,4,3 with the +2 and only the 4 is a mortal wound
    const run = (killNear: boolean): number => {
      const s = makeState({ phase: 'charge' })
      placeUnit(s, VAN, [[-8, 0]])
      placeUnit(s, SKAND, [[-8, 0]])
      const { ctx } = ctxOf(s, [1, 2, 1, ...Array(30).fill(1)])
      s.phaseState = emptyPhaseState()
      const [near] = s.units[HOUNDS].models
      placeUnit(s, HOUNDS, [[-3, 0], [-30, 0], [-30, 0.5]])
      expect(hookService.offerPicks(ctx, 'charge.moveStarted', HOUNDS)).toBe(false)
      // Fire Overwatch then removes the near Hound before the charge move
      if (killNear) attackService.destroyModel(ctx, near, { player: 'B', unitId: BOYZ, modelId: null, kind: 'ranged' })
      engage(s)
      const before = totalWounds(s, BOYZ)
      hookService.offerPicks(ctx, 'charge.moveEnded', HOUNDS)
      drive(ctx)
      return before - totalWounds(s, BOYZ)
    }
    expect(run(false)).toBe(1) // control: the near Hound survives, so +2 applies
    expect(run(true)).toBe(0) // the only near Hound died to Overwatch: no +2 (1 and 2 stay below 4)
  })

  it('ADM-020 ADM-6.5: a Heroic Intervention charge move (no start snapshot) still triggers it, without the +2', () => {
    const s = makeState({ phase: 'charge' })
    placeUnit(s, VAN, [[-6, 0]])
    placeUnit(s, SKAND, [[-6, 0]])
    const { ctx } = ctxOf(s, [2, 2, 2, ...Array(30).fill(1)])
    s.phaseState = emptyPhaseState()
    engage(s)
    const before = totalWounds(s, BOYZ)
    hookService.offerPicks(ctx, 'charge.moveEnded', HOUNDS) // no charge.moveStarted window ever ran for it
    drive(ctx)
    expect(before - totalWounds(s, BOYZ)).toBe(0) // 2 + 0 < 4
  })
})

// =====================================================================================================================
describe('Searing Conflagration (ADM-6.4, E-ADM1)', () => {
  const TORCH = 'adm.w.phosphor-torch'
  function woundReroll(s: GameState, weaponId: string, die: number): string | null {
    const { ctx } = ctxOf(s)
    const model = modelWith(s, PTER, weaponId)
    const results = hookService.collect(ctx, 'onWoundRoll', { attack: attackCtx(s, model, weaponId, BOYZ), roll: rollOf(die, 'wound') })
    const r = results.map((x) => x.result as { kind: string; reroll?: string }).find((x) => x.kind === 'roll' && x.reroll)
    return r?.reroll ?? null
  }
  const objective = (s: GameState) => Object.values(s.objectives)[0]

  it('ADM-021 ADM-6.4: phosphor torch vs an enemy on an objective: a wound roll of 1 is re-rolled, higher results are not', () => {
    const s = makeState()
    const o = objective(s)
    placeUnit(s, BOYZ, [[o.pos.x, o.pos.z]])
    placeUnit(s, PTER, [[o.pos.x, o.pos.z - 8]])
    placeUnit(s, VAN, [[-40, 12]])
    placeUnit(s, SKAND, [[-40, 12]])
    expect(woundReroll(s, TORCH, 1)).toBe('ones')
  })

  it('ADM-021 ADM-6.4: within 6" of the friendly Vanguard (BATTLELINE) any wound roll may be re-rolled', () => {
    const s = makeState()
    const o = objective(s)
    placeUnit(s, BOYZ, [[o.pos.x, o.pos.z]])
    placeUnit(s, PTER, [[o.pos.x, o.pos.z - 8]])
    placeUnit(s, VAN, [[o.pos.x + 3, o.pos.z - 8]])
    placeUnit(s, SKAND, [[o.pos.x + 3, o.pos.z - 8]])
    expect(woundReroll(s, TORCH, 2)).toBe('all')
  })

  it('ADM-021 ADM-6.4: a target off every objective, or a different weapon, gets no re-roll', () => {
    const s = makeState()
    const o = { ...objective(s).pos }
    for (const ob of Object.values(s.objectives)) ob.pos = { x: ob.pos.x + 200, z: ob.pos.z + 200 }
    placeUnit(s, BOYZ, [[o.x, o.z]])
    placeUnit(s, PTER, [[o.x, o.z - 8]])
    expect(woundReroll(s, TORCH, 1)).toBeNull()
    const t = makeState()
    const ob = objective(t)
    placeUnit(t, BOYZ, [[ob.pos.x, ob.pos.z]])
    placeUnit(t, PTER, [[ob.pos.x, ob.pos.z - 8]])
    expect(woundReroll(t, 'adm.w.flechette-blaster', 1)).toBeNull()
    expect(woundReroll(t, 'adm.w.taser-goad', 1)).toBeNull()
  })
})

// =====================================================================================================================
describe('AI (ADM-026)', () => {
  const decide = async (s: GameState, player: PlayerId): Promise<string> => {
    const pending = s.pending as ChooseOptionDecision
    const legal = pending.options.map((o) => ({ ...o.action, decisionId: pending.id }))
    const a = await new UtilityDecider('normal', 'adm').decide(view(s, player), pending, legal)
    return (a as { optionId: string }).optionId
  }

  it('ADM-026 ADM-2.1: Doctrina AI picks Conqueror only when an enemy unit in its own zone is within 18" of a Doctrina unit, else Protector', async () => {
    const s = makeState({ round: 1 })
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 40]]); placeUnit(s, BOYZ2, [[10, 40]]); placeUnit(s, BOSS, [[12, 40]])
    const { ctx } = ctxOf(s)
    hookService.offerPicks(ctx, 'round.start', '1')
    expect(await decide(s, 'A')).toBe('protector')
    // an enemy unit in its own (B) zone, within 18" of the Vanguard
    const t = makeState({ round: 1 })
    const [x, z] = inZone(t, 'B')
    placeUnit(t, VAN, [[x, z - 10]]); placeUnit(t, SKAND, [[x, z - 10]])
    placeUnit(t, BOYZ, [[x, z]]); placeUnit(t, BOYZ2, [[x + 10, z]]); placeUnit(t, BOSS, [[x + 12, z]])
    hookService.offerPicks(ctxOf(t).ctx, 'round.start', '1')
    expect(await decide(t, 'A')).toBe('conqueror')
    // the same enemy but 30" away from every Doctrina unit
    const u = makeState({ round: 1 })
    placeUnit(u, VAN, [[x, -40]]); placeUnit(u, SKAND, [[x, -40]])
    placeUnit(u, BOYZ, [[x, z]]); placeUnit(u, BOYZ2, [[x + 10, z]]); placeUnit(u, BOSS, [[x + 12, z]])
    hookService.offerPicks(ctxOf(u).ctx, 'round.start', '1')
    expect(await decide(u, 'A')).toBe('protector')
  })

  it('ADM-026 ADM-4.1: the Targeted Purge picker names the eligible unit with the highest sum(W) x T', async () => {
    const s = makeState({ round: 1 })
    s.phase = 'command'
    s.phaseState = emptyPhaseState()
    missionService.onWindow(ctxOf(s, [], false).ctx, 'round.start', 'r1')
    const ids = optionIds(s)
    const pick = await decide(s, 'B')
    expect(ids).toContain(pick)
    // Boyz (10 x W1 x T5) outweigh the lone Warboss (W6 x T5 = 30 < 50)
    expect([BOYZ, BOYZ2]).toContain(pick)
  })
})

// =====================================================================================================================
// Full attack sequences, weapon profiles, enhancements and the stratagems that change them (ADM-008..010, 015, 017, 023..025)
const TAIL = Array(60).fill(2)
type StateWeapon = GameState['weapons'][string]

// a copy of a state weapon registered under a fresh id and handed to the model (attackers with a known profile)
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

// runs one attack sequence to its end, answering every raised decision with its first option
function runAttack(s: GameState, dice: number[], kind: 'ranged' | 'melee', attackerUnitId: string, targets: DeclaredTarget[]): GameEvent[] {
  s.players.A.cp = 0 // no Command Re-roll windows: the scripted dice are consumed in sequence order only
  s.players.B.cp = 0
  const { ctx, events } = ctxOf(s, [...dice, ...TAIL])
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets })
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('attack sequence did not finish')
    const pending = ctx.state.pending as PendingDecision
    const opts = ('options' in pending ? pending.options : []) as { action: Action }[]
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, opts[0].action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return events
}

// a stratagem window harness: stubbed attack/mission services so only the stratagem machinery runs
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
const setPhase = (s: GameState, phase: GameState['phase'], active: PlayerId, cp: { A?: number; B?: number } = {}): void => {
  s.phase = phase
  s.activePlayer = active
  s.phaseState = emptyPhaseState()
  s.players.A.cp = cp.A ?? 0
  s.players.B.cp = cp.B ?? 0
}
const woundMods = (s: GameState, attackerModel: string, weaponId: string, targetUnit: string, die = 4): unknown[] =>
  hookService.collect(ctxOf(s).ctx, 'onWoundRoll', { attack: attackCtx(s, attackerModel, weaponId, targetUnit), roll: rollOf(die, 'wound') })
    .map((r) => r.result).filter((r) => r.kind === 'roll' && (r as { modifier?: number }).modifier !== undefined)

// an Ork gun with a fixed profile, hitting on a 2+ so a die of 6 is a certain hit
function orkWeapon(s: GameState, kind: 'ranged' | 'melee', patch: Partial<StateWeapon> = {}): { model: string; weapon: string } {
  const model = s.units[BOYZ].models[0]
  const base = s.models[model].weapons.map((w) => s.weapons[w]).find((w) => w.kind === kind) ?? Object.values(s.weapons).find((w) => w.kind === kind)!
  return { model, weapon: armed(s, model, base.id, { A: 1, skill: 2, AP: 0, D: 1, abilities: [], ...(kind === 'ranged' ? { range: 24 } : {}), ...patch }) }
}

describe('Aspergilla of Tarentum (ADM-3)', () => {
  const wound = (events: GameEvent[]) => eventsOf(events, 'WoundRolled')[0]

  it('ADM-008 ADM-3: an S3 attack on Skand + Vanguard (T3) wounds on 5+ instead of 4+, shooting and fighting', () => {
    for (const kind of ['ranged', 'melee'] as const) {
      const lost = (die: number) => {
        const s = makeState()
        placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, BOYZ, [[0, 5]])
        const { model, weapon } = orkWeapon(s, kind, { S: 3 })
        return wound(runAttack(s, [6, die], kind, BOYZ, [tgt(model, weapon, VAN, 1)]))
      }
      expect(lost(4)).toMatchObject({ die: 4, final: 3, needed: 4, wounded: false })
      expect(lost(5)).toMatchObject({ die: 5, final: 4, needed: 4, wounded: true })
    }
  })

  it('ADM-008 ADM-3: Skand alone (T4) also gets it; the Sulphurhounds do not', () => {
    const s = makeState({ a: { attachments: [] } })
    placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, HOUNDS, [[10, 0]]); placeUnit(s, BOYZ, [[0, 5]])
    const { model, weapon } = orkWeapon(s, 'ranged', { S: 4 })
    const w = wound(runAttack(s, [6, 4], 'ranged', BOYZ, [tgt(model, weapon, SKAND, 1)]))
    expect(w).toMatchObject({ die: 4, final: 3, needed: 4, wounded: false }) // S4 v T4 is 4+, a 4 would pass unmodified
    const t = makeState({ a: { attachments: [] } })
    placeUnit(t, SKAND, [[0, 0]]); placeUnit(t, HOUNDS, [[10, 0]]); placeUnit(t, BOYZ, [[0, 5]])
    const o = orkWeapon(t, 'ranged', { S: 4 })
    expect(woundMods(t, o.model, o.weapon, SKAND)).toEqual([{ kind: 'roll', modifier: -1 }])
    expect(woundMods(t, o.model, o.weapon, HOUNDS)).toEqual([])
  })

  it('ADM-008 ADM-3: the total wound-roll modifier is capped at -1 even with a second -1 on the same unit', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, BOYZ, [[0, 5]])
    const effect = 'adm.e.aspergilla-of-tarentum.effect'
    expect(s.abilities[effect]).toBeTruthy()
    // a second, identical -1 source carried by a Vanguard model
    s.abilities = { ...s.abilities, 'test.second-aspergilla': { ...s.abilities[effect], id: 'test.second-aspergilla', bearerModelId: s.units[VAN].models[1] } }
    const { model, weapon } = orkWeapon(s, 'ranged', { S: 3 })
    expect(woundMods(s, model, weapon, VAN).length).toBeGreaterThanOrEqual(2)
    // a 5 minus 2 would be 3 and fail 4+, but modifiers never total worse than -1
    expect(wound(runAttack(s, [6, 5], 'ranged', BOYZ, [tgt(model, weapon, VAN, 1)]))).toMatchObject({ die: 5, final: 4, wounded: true })
  })
})

describe('Overcharged Electropositors (ADM-3)', () => {
  const OE = { enhancementId: 'adm.e.overcharged-electropositors' }
  const eff = (s: GameState, unitId: string, weaponId: string) => weaponService.effectiveWeapon(s, modelWith(s, unitId, weaponId), weaponId, attackCtx(s, modelWith(s, unitId, weaponId), weaponId, BOYZ))

  it('ADM-009 ADM-3: the Vanguard radium carbine reaches 24" (18 + 6) and ignores cover; melee and other units are unchanged', () => {
    const s = makeState({ a: OE })
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, HOUNDS, [[10, 0]]); placeUnit(s, BOYZ, [[0, 20]])
    const carbine = eff(s, VAN, RADIUM)
    expect(carbine.range).toBe(24)
    expect(weaponService.hasAbility(carbine, 'IGNORES_COVER')).toBe(true)
    expect(carbine.range).toBeGreaterThanOrEqual(23.5) // a target 23.5" away is in range, one 24.5" away is not
    expect(carbine.range).toBeLessThan(24.5)
    const base = makeState()
    placeUnit(base, VAN, [[0, 0]]); placeUnit(base, SKAND, [[0, 0]])
    const ccw = eff(s, VAN, 'adm.w.close-combat-weapon')
    expect(ccw.range).toBe(eff(base, VAN, 'adm.w.close-combat-weapon').range)
    expect(weaponService.hasAbility(ccw, 'IGNORES_COVER')).toBe(false)
    expect(eff(s, HOUNDS, 'adm.w.phosphor-pistol').range).toBe(s.weapons['adm.w.phosphor-pistol'].range)
    expect(eff(s, HOUNDS, 'adm.w.sulphur-breath').range).toBe(s.weapons['adm.w.sulphur-breath'].range)
    expect(eff(s, PTER, 'adm.w.flechette-blaster').range).toBe(s.weapons['adm.w.flechette-blaster'].range)
  })

  it('ADM-009 ADM-3: the default enhancement leaves the carbine at 18" without Ignores Cover', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, BOYZ, [[0, 20]])
    const carbine = eff(s, VAN, RADIUM)
    expect(carbine.range).toBe(18)
    expect(weaponService.hasAbility(carbine, 'IGNORES_COVER')).toBe(false)
  })
})

describe('Galvanic Field (ADM-6.1)', () => {
  const lethal = (s: GameState, unitId: string, weaponId: string): boolean => {
    const m = modelWith(s, unitId, weaponId)
    return hookService.weaponAbilitiesFor!(s, m, s.weapons[weaponId], attackCtx(s, m, weaponId, BOYZ)).some((a) => a.ability === 'LETHAL_HITS')
  }

  it('ADM-010 ADM-6.1: with Skand attached the Vanguard\'s radium carbine and close combat weapon have Lethal Hits, and so do Skand\'s own', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, HOUNDS, [[10, 0]]); placeUnit(s, BOYZ, [[0, 5]])
    expect(lethal(s, VAN, RADIUM)).toBe(true)
    expect(lethal(s, VAN, 'adm.w.close-combat-weapon')).toBe(true)
    expect(lethal(s, SKAND, 'adm.w.transonic-cannon')).toBe(true)
    expect(lethal(s, HOUNDS, 'adm.w.phosphor-pistol')).toBe(false)
  })

  it('ADM-010 ADM-6.1: an unmodified hit roll of 6 from the Vanguard auto-wounds (no wound die is rolled)', () => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, BOYZ, [[0, 8]])
    const m = modelWith(s, VAN, RADIUM)
    const evs = runAttack(s, [6], 'ranged', VAN, [tgt(m, RADIUM, BOYZ, 1)])
    expect(eventsOf(evs, 'HitRolled')[0]).toMatchObject({ die: 6, critical: true })
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ auto: true, wounded: true })
  })

  it('ADM-010 ADM-6.1: Skand detached or never attached gives no Lethal Hits, and the hit still has to roll to wound', () => {
    const s = makeState({ a: { attachments: [] } })
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[30, 0]]); placeUnit(s, BOYZ, [[0, 8]])
    expect(lethal(s, VAN, RADIUM)).toBe(false)
    expect(lethal(s, SKAND, 'adm.w.transonic-cannon')).toBe(false)
    const m = modelWith(s, VAN, RADIUM)
    const evs = runAttack(s, [6, 2], 'ranged', VAN, [tgt(m, RADIUM, BOYZ, 1)])
    expect(eventsOf(evs, 'WoundRolled')[0]).toMatchObject({ auto: false, die: 2 })
  })
})

describe('An Evaluation of Mettle (ADM-5.1)', () => {
  const EM = 'adm.s.pcd-evaluation-of-mettle'
  const trig = { unitId: BOYZ, targetUnitId: VAN }
  const fnp = (s: GameState, ctx: EngineContext, mortal: boolean) => {
    const ork = s.units[BOYZ].models[0]
    return hookService.collect(ctx, 'onFeelNoPainRoll', { attack: attackCtx(s, ork, s.models[ork].weapons[0], VAN), roll: rollOf(3, 'fnp'), ...(mortal ? { mortal: true } : {}) })
      .map((r) => r.result).filter((r) => r.kind === 'roll' && (r as { feelNoPain?: number }).feelNoPain !== undefined)
  }
  const ready = (): GameState => {
    const s = makeState()
    for (const id of [VAN, SKAND, HOUNDS, PTER]) placeUnit(s, id, [[0, 0]])
    placeUnit(s, BOYZ, [[0, 10]])
    setPhase(s, 'shooting', 'B', { A: 1 })
    return s
  }

  it('ADM-015 ADM-5.1: offered when the opponent shoots the Vanguard, for the targeted unit only; not in own Shooting phase', () => {
    const s = ready()
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', EM, trig).flat()).toContain(VAN)
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', EM, trig).flat()).not.toContain(HOUNDS)
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', EM, { unitId: BOYZ, targetUnitId: HOUNDS }).flat()).toEqual([HOUNDS])
    setPhase(s, 'shooting', 'A', { A: 1 }) // the AdMech player's own Shooting phase
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', EM, trig)).toEqual([])
  })

  it('ADM-015 ADM-5.1: offered in the Fight phase of either turn', () => {
    for (const active of ['A', 'B'] as const) {
      const s = ready()
      setPhase(s, 'fight', active, { A: 1 })
      expect(offeredIds(s, 'A', 'fight.targetsDeclared', EM, trig).flat()).toContain(VAN)
    }
  })

  it('ADM-015 ADM-5.1: used, the unit has Feel No Pain 5+ (mortal wounds included) until the end of the phase', () => {
    const s = ready()
    const h = stratHarness(s)
    expect(fnp(s, h.ctx, false)).toEqual([])
    h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
    expect(h.use(EM, VAN)).toBeNull()
    expect(s.players.A.cp).toBe(0)
    expect(fnp(s, h.ctx, false)).toEqual([{ kind: 'roll', feelNoPain: 5 }])
    expect(fnp(s, h.ctx, true)).toEqual([{ kind: 'roll', feelNoPain: 5 }])
    effectService.expire(h.ctx, 'phaseEnd', null)
    expect(fnp(s, h.ctx, false)).toEqual([])
  })

  it('ADM-015 ADM-5.1: in a real attack a lost wound is ignored on a 5 (needs 5+) and kept on a 4', () => {
    const lost = (fnpDie: number) => {
      const s = ready()
      const h = stratHarness(s)
      h.ctx.window('shooting.targetsDeclared', BOYZ, h.ctx.order.defensive('A'), trig)
      h.use(EM, VAN)
      const { model, weapon } = orkWeapon(s, 'ranged', { S: 8, D: 1 })
      const evs = runAttack(s, [6, 6, 1, fnpDie], 'ranged', BOYZ, [tgt(model, weapon, VAN, 1)])
      return { f: eventsOf(evs, 'FeelNoPainRolled')[0], killed: eventsOf(evs, 'ModelDestroyed').length }
    }
    expect(lost(5)).toMatchObject({ f: { die: 5, needed: 5, ignored: true }, killed: 0 })
    expect(lost(4)).toMatchObject({ f: { die: 4, needed: 5, ignored: false }, killed: 1 })
  })
})

describe('Acceptable Risk Ratio (ADM-5.2)', () => {
  const ARR = 'adm.s.pcd-acceptable-risk-ratio'
  const ready = (): GameState => {
    const s = makeState()
    placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, HOUNDS, [[8, 0]]); placeUnit(s, PTER, [[-8, 0]]); placeUnit(s, BOYZ, [[0, 10]])
    setPhase(s, 'shooting', 'A', { A: 2 })
    return s
  }
  const activate = (s: GameState): void => {
    const h = stratHarness(s)
    h.ctx.window('shooting.start', 'start', h.ctx.order.active())
    h.use(ARR, VAN)
  }
  const ap = (s: GameState, unitId: string, weaponId: string): number => {
    const m = modelWith(s, unitId, weaponId)
    return weaponService.effectiveWeapon(s, m, weaponId, attackCtx(s, m, weaponId, BOYZ)).AP
  }

  it('ADM-017 ADM-5.2: offered in own Shooting phase for a unit that has not shot; not after it shot, nor in the opponent\'s turn', () => {
    const s = ready()
    expect(offeredIds(s, 'A', 'shooting.start', ARR).flat()).toEqual(expect.arrayContaining([VAN, HOUNDS, PTER]))
    s.units[VAN].turn.shotThisPhase = true
    expect(offeredIds(s, 'A', 'shooting.start', ARR).flat()).not.toContain(VAN)
    const t = ready()
    setPhase(t, 'shooting', 'B', { A: 2 })
    expect(offeredIds(t, 'A', 'shooting.start', ARR)).toEqual([])
  })

  it('ADM-017 ADM-5.2: used on the Vanguard, ranged AP improves by 1 (carbine 0 to -1, supercharge caliver -3 to -4), Hazardous is gained; melee is untouched', () => {
    const s = ready()
    const SUPER = 'adm.w.plasma-caliver-supercharge'
    expect(ap(s, VAN, RADIUM)).toBe(0)
    expect(ap(s, VAN, SUPER)).toBe(-3)
    activate(s)
    expect(s.players.A.cp).toBe(1)
    expect(ap(s, VAN, RADIUM)).toBe(-1)
    expect(ap(s, VAN, SUPER)).toBe(-4)
    expect(ap(s, VAN, 'adm.w.close-combat-weapon')).toBe(0)
    const m = modelWith(s, VAN, RADIUM)
    expect(hookService.weaponAbilitiesFor!(s, m, s.weapons[RADIUM], attackCtx(s, m, RADIUM, BOYZ)).some((a) => a.ability === 'HAZARDOUS')).toBe(true)
    expect(ap(s, HOUNDS, 'adm.w.phosphor-pistol')).toBe(0) // another unit is untouched
  })

  it('ADM-017 ADM-5.2: a Hazardous test of 1 on a Vanguard carbine destroys one Vanguard model; a 2+ is safe', () => {
    for (const die of [1, 2]) {
      const s = ready()
      activate(s)
      const m = modelWith(s, VAN, RADIUM)
      const evs = runAttack(s, [2, die], 'ranged', VAN, [tgt(m, RADIUM, BOYZ, 1)])
      const hz = eventsOf(evs, 'HazardousTested')
      expect(hz).toHaveLength(1)
      expect(hz[0]).toMatchObject({ die, failed: die === 1 })
      const lostVanguard = eventsOf(evs, 'ModelDestroyed').filter((e) => e.unitId === VAN).length
      expect(lostVanguard).toBe(die === 1 ? 1 : 0)
    }
  })

  it('ADM-017 ADM-5.2: Skand rolling a 1 on his transonic cannon takes 3 mortal wounds (he survives on 1 of 4 W)', () => {
    const s = ready()
    activate(s)
    const m = s.units[SKAND].models[0]
    const evs = runAttack(s, [2, 1], 'ranged', SKAND, [tgt(m, 'adm.w.transonic-cannon', BOYZ, 1)])
    expect(eventsOf(evs, 'HazardousTested')[0]).toMatchObject({ failed: true, modelId: m })
    const dmg = eventsOf(evs, 'DamageApplied').filter((d) => d.modelId === m && d.mortal)
    expect(dmg.reduce((a, d) => a + d.amount, 0)).toBe(3)
    expect(s.models[m].woundsRemaining).toBe(1)
  })
})

describe('Skand and Vanguard weapon profiles (ADM-6)', () => {
  it('ADM-023 ADM-6: transonic cannon auto-hits D6 times (no hit rolls), and a wound roll of 6 becomes mortal wounds (Devastating Wounds)', () => {
    const s = makeState()
    placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, VAN, [[20, 0]]); placeUnit(s, BOYZ, [[0, 8]])
    const m = s.units[SKAND].models[0]
    const evs = runAttack(s, [4, 2, 2, 2, 2], 'ranged', SKAND, [tgt(m, 'adm.w.transonic-cannon', BOYZ)])
    expect(eventsOf(evs, 'WoundRolled')).toHaveLength(4) // the D6 rolled a 4
    expect(eventsOf(evs, 'HitRolled').every((h) => h.auto)).toBe(true)
    const t = makeState()
    placeUnit(t, SKAND, [[0, 0]]); placeUnit(t, VAN, [[20, 0]]); placeUnit(t, BOYZ, [[0, 8]])
    const e2 = runAttack(t, [1, 6], 'ranged', SKAND, [tgt(t.units[SKAND].models[0], 'adm.w.transonic-cannon', BOYZ)])
    expect(eventsOf(e2, 'WoundRolled')[0]).toMatchObject({ die: 6, critical: true })
    const mortal = eventsOf(e2, 'DamageApplied').filter((d) => d.mortal)
    expect(mortal.reduce((a, d) => a + d.amount, 0)).toBeGreaterThanOrEqual(1)
    expect(eventsOf(e2, 'SaveRolled')).toHaveLength(0) // unsavable
  })

  it('ADM-023 ADM-6: arc rifle Rapid Fire 1 gives 2 shots within half range (15"), 1 beyond it', () => {
    const shots = (dist: number): number => {
      const s = makeState()
      placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[0, 0]]); placeUnit(s, BOYZ, [[0, dist]])
      const m = modelWith(s, VAN, 'adm.w.arc-rifle')
      return eventsOf(runAttack(s, [], 'ranged', VAN, [tgt(m, 'adm.w.arc-rifle', BOYZ)]), 'HitRolled').length
    }
    expect(shots(10)).toBe(2)
    expect(shots(20)).toBe(1)
  })

  it('ADM-023 ADM-6: Anti-Vehicle 4+ (arc rifle) and Anti-Infantry 4+ (radium carbine) make a wound roll of 4 critical only against the keyword', () => {
    const crit = (weaponId: string, targetUnit: string): boolean => {
      const s = makeState({ a: { attachments: [] } })
      placeUnit(s, VAN, [[0, 0]]); placeUnit(s, SKAND, [[30, 0]]); placeUnit(s, BOYZ, [[0, 8]]); placeUnit(s, DREAD, [[6, 8]])
      const m = modelWith(s, VAN, weaponId)
      return eventsOf(runAttack(s, [6, 4], 'ranged', VAN, [tgt(m, weaponId, targetUnit, 1)]), 'WoundRolled')[0].critical
    }
    expect(crit('adm.w.arc-rifle', DREAD)).toBe(true)
    expect(crit('adm.w.arc-rifle', BOYZ)).toBe(false)
    expect(crit(RADIUM, BOYZ)).toBe(true)
    expect(crit(RADIUM, DREAD)).toBe(false)
  })

  it('ADM-023 ADM-6: the plasma caliver supercharge profile is Hazardous, the standard profile is not', () => {
    const s = makeState()
    expect(weaponService.hasAbility(s.weapons['adm.w.plasma-caliver-supercharge'], 'HAZARDOUS')).toBe(true)
    expect(weaponService.hasAbility(s.weapons['adm.w.plasma-caliver-standard'], 'HAZARDOUS')).toBe(false)
    expect(s.weapons['adm.w.plasma-caliver-standard'].S).toBe(7)
    expect(s.weapons['adm.w.plasma-caliver-supercharge'].D).toBe(2)
  })
})

describe('Sulphurhound weapon profiles (ADM-6.6)', () => {
  const declare = (s: GameState, unitId: string, targets: DeclaredTarget[]) => {
    const { ctx } = ctxOf(s)
    const weapons = buildShootingWeaponEntries(ctx, unitId)
    const pending = { id: 'd:1', kind: 'declareTargets', player: 'A', window: 'shooting.start', canPass: true, context: { unitId, attackKind: 'ranged', overwatch: false, weapons, engagedWith: [] } } as unknown as PendingDecision & { kind: 'declareTargets' }
    return validateDeclareTargets(s, { type: 'declareTargets', player: 'A', decisionId: 'd:1', unitId, targets } as Action, pending)
  }
  const carbineModel = (s: GameState): string => modelWith(s, HOUNDS, 'adm.w.phosphor-blast-carbine')

  it('ADM-024 ADM-6.6: sulphur breath is a Torrent Pistol and fires while in Engagement Range; the Blast carbine does not', () => {
    const s = makeState()
    placeUnit(s, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    placeUnit(s, BOYZ, [[1.6, 0]])
    const breath = s.weapons['adm.w.sulphur-breath']
    expect(weaponService.hasAbility(breath, 'TORRENT')).toBe(true)
    expect(weaponService.hasAbility(breath, 'PISTOL')).toBe(true)
    const ids = buildShootingWeaponEntries(ctxOf(s).ctx, HOUNDS).map((e) => e.weaponId)
    expect(ids).toContain('adm.w.sulphur-breath')
    expect(ids).toContain('adm.w.phosphor-pistol')
    expect(ids).not.toContain('adm.w.phosphor-blast-carbine')
    const loose = makeState()
    placeUnit(loose, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    placeUnit(loose, BOYZ, [[0, 12]])
    expect(buildShootingWeaponEntries(ctxOf(loose).ctx, HOUNDS).map((e) => e.weaponId)).toContain('adm.w.phosphor-blast-carbine')
  })

  it('ADM-024 ADM-6.6: the carbine model fires either its pistols or the carbine, never both', () => {
    const s = makeState()
    placeUnit(s, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    placeUnit(s, BOYZ, [[0, 8]])
    const m = carbineModel(s)
    const carbine = tgt(m, 'adm.w.phosphor-blast-carbine', BOYZ)
    const pistol = tgt(m, 'adm.w.phosphor-pistol', BOYZ)
    const breath = tgt(m, 'adm.w.sulphur-breath', BOYZ)
    expect(declare(s, HOUNDS, [carbine])).toBeNull()
    expect(declare(s, HOUNDS, [pistol, breath])).toBeNull()
    expect(declare(s, HOUNDS, [carbine, pistol])?.code).toBe('E_INVALID_TARGET')
    expect(declare(s, HOUNDS, [carbine, breath])?.code).toBe('E_INVALID_TARGET')
  })

  it('ADM-024 ADM-6.6: the carbine\'s Blast adds +2 Attacks against a 10-model unit (+1 per 5 models, rounded down)', () => {
    const s = makeState()
    placeUnit(s, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    placeUnit(s, BOYZ, [[0, 12]])
    const size = s.units[BOYZ].models.length
    const m = carbineModel(s)
    const evs = runAttack(s, [3], 'ranged', HOUNDS, [tgt(m, 'adm.w.phosphor-blast-carbine', BOYZ)])
    expect(eventsOf(evs, 'HitRolled')).toHaveLength(3 + Math.floor(size / 5))
    expect(size).toBe(10)
  })

  it('ADM-024 ADM-6.6: the arc maul (Extra Attacks) is fought alongside the clawed limbs, adding its attack to theirs', () => {
    const s = makeState({ phase: 'fight' })
    placeUnit(s, HOUNDS, [[0, 0], [0, 0.2], [0, 0.4]])
    placeUnit(s, BOYZ, [[0, 1.6]])
    const m = modelWith(s, HOUNDS, 'adm.w.cavalry-arc-maul')
    const { ctx } = ctxOf(s)
    const used = resolveModelWeapons(ctx, m)
    expect(used).toEqual(expect.arrayContaining(['adm.w.clawed-limbs', 'adm.w.cavalry-arc-maul']))
    expect(weaponService.hasAbility(s.weapons['adm.w.cavalry-arc-maul'], 'EXTRA_ATTACKS')).toBe(true)
    expect(weaponService.hasAbility(s.weapons['adm.w.clawed-limbs'], 'EXTRA_ATTACKS')).toBe(false)
    const evs = runAttack(s, [], 'melee', HOUNDS, [tgt(m, 'adm.w.clawed-limbs', BOYZ), tgt(m, 'adm.w.cavalry-arc-maul', BOYZ)])
    expect(eventsOf(evs, 'HitRolled')).toHaveLength(4 + 1)
  })
})

describe('Pteraxii weapon profiles and movement (ADM-6)', () => {
  it('ADM-025 ADM-6: Deep Strike (reserves arrive by Deep Strike) and FLY', () => {
    const s = makeState({ round: 2 })
    expect(s.datasheets[s.units[PTER].datasheetId].coreAbilities.some((c) => c.ability === 'DEEP_STRIKE')).toBe(true)
    expect(hookService.keywordsFor!(s, PTER)).toContain('FLY')
    s.units[PTER].location = 'reserves'
    expect(reserveRouteFor(s, PTER)).toBe('deepStrike')
    s.units[HOUNDS].location = 'reserves'
    expect(reserveRouteFor(s, HOUNDS)).toBe('strategicReserves')
  })

  it('ADM-025 ADM-6: taser goad Sustained Hits 2 adds 2 extra hits on a critical hit', () => {
    const s = makeState({ phase: 'fight' })
    placeUnit(s, PTER, [[0, 0]]); placeUnit(s, BOYZ, [[0, 1.6]])
    const m = modelWith(s, PTER, 'adm.w.taser-goad')
    const evs = runAttack(s, [6], 'melee', PTER, [tgt(m, 'adm.w.taser-goad', BOYZ, 1)])
    expect(eventsOf(evs, 'HitRolled')[0]).toMatchObject({ die: 6, critical: true, extraHits: 2 })
    expect(eventsOf(evs, 'WoundRolled').length).toBe(3) // the hit plus two extra
  })

  it('ADM-025 ADM-6: Alpha\'s flechette blaster (Pistol) can be fired in Engagement Range, the phosphor torch cannot', () => {
    const s = makeState()
    placeUnit(s, PTER, [[0, 0], [0, 0.2], [0, 0.4], [0, 0.6], [0, 0.8]])
    placeUnit(s, BOYZ, [[1.6, 0]])
    const entries = buildShootingWeaponEntries(ctxOf(s).ctx, PTER)
    const flech = entries.filter((e) => e.weaponId === 'adm.w.flechette-blaster')
    expect(flech).toHaveLength(1)
    expect(flech[0].legalTargets).toContain(BOYZ)
    expect(entries.some((e) => e.weaponId === 'adm.w.phosphor-torch')).toBe(false)
  })
})
