// Strike Team Solarien engine changes beyond code hooks (docs/spec/factions/space-marines--strike-team-solarien.md §7.1, E1-E4),
// exercised with Tau vs Orks data and stand-in code hooks. Hook-level behaviour is covered in space-marines-strike-team-solarien.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type GameEvent, type GameSetup, type GameState, type ModuleTable, type PlayerSetup, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { hookService } from '../../src/engine/hooks-impl'
import { movementModule, reserveExclusionPolygons } from '../../src/engine/phases/movement'
import { targetLegality } from '../../src/engine/phases/shooting'
import { removeUnitToReserves } from '../../src/engine/teleport'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TAU = (): PlayerSetup => ({
  name: 'Tau', faction: 'tau-empire', patrolId: 'tau.cp.protectors-of-aun-shar', enhancementId: 'tau.e.ds13-experimental-drone',
  secondaryId: 'tau.sec.kauyon-lure', attachments: [], reserves: [], battleReadyVp: 0,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const ST = 'A:strike-team', AUN = 'A:aunshar', BOYZ = 'B:boyz-a'

function makeState(): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TAU(), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'sol-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function addTestHook(s: GameState, unitId: UnitId, name: string, hook: Partial<EngineCodeHook>): void {
  codeHooks[name] = { name, kind: 'ability', hook: 'onHitRoll', run: () => undefined, ...hook } as unknown as EngineCodeHook
  const id = `test.a.${name}`
  s.abilities = { ...s.abilities, [id]: { id, name, text: '', trigger: 'always', code: name, source: 'datasheet', bearerModelId: null } as unknown as GameState['abilities'][string] }
  const dsId = s.units[unitId].datasheetId
  s.datasheets = { ...s.datasheets, [dsId]: { ...s.datasheets[dsId], abilities: [...s.datasheets[dsId].abilities, id] } }
}
function rifleModel(s: GameState, unitId: UnitId): { model: string; weapon: string } {
  for (const id of s.units[unitId].models) {
    const w = s.models[id].weapons.find((x) => x === 'tau.w.pulse-rifle')
    if (w) return { model: id, weapon: w }
  }
  throw new Error('no pulse rifle')
}
const decl = (modelId: string, weaponId: string, targetUnitId: string) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks: null })

describe('E1 Stealth honours granted core abilities', () => {
  function hitDie(grant: boolean): { die: number; final: number } {
    const s = makeState()
    placeUnit(s, ST, s.units[ST].models.map((_, i): [number, number] => [-10 + (i % 5) * 1.3, Math.floor(i / 5) * 1.3]))
    placeUnit(s, BOYZ, [[0, 0]])
    if (grant) addTestHook(s, BOYZ, 'test.grantStealth', { grantsCoreAbility: (_st, _e, unitId) => (unitId === BOYZ ? ['STEALTH'] : []) })
    const { model, weapon } = rifleModel(s, ST)
    const events: GameEvent[] = []
    const made = createContext(s, new ScriptedRng([4, ...Array(40).fill(1)]), DEFAULT_MODULES)
    const ctx = made.ctx
    events.push(...made.events)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: ST, overwatch: false, targets: [decl(model, weapon, BOYZ)] })
    attackService.advance(ctx)
    const hr = of(made.events, 'HitRolled')[0]
    return { die: hr.die, final: hr.final }
  }
  it('SOL-030 E1: a granted STEALTH gives -1 to ranged hits; without the grant there is none', () => {
    expect(hitDie(false)).toEqual({ die: 4, final: 4 })
    expect(hitDie(true)).toEqual({ die: 4, final: 3 })
  })
})

describe('E3 targetRangeCap', () => {
  it('SOL-022 E3: a hook cap of 12 makes a target at 13" illegal (E_NOT_IN_RANGE) and at 12" legal; min of answers; null = no opinion', () => {
    for (const [x, ok] of [[13, false], [12, true]] as const) {
      const s = makeState()
      placeUnit(s, ST, s.units[ST].models.map((): [number, number] => [-20, 0]))
      placeUnit(s, BOYZ, [[0, 0]])
      const { model, weapon } = rifleModel(s, ST)
      const w = s.weapons[weapon]
      const from = s.models[model]
      const tm = s.models[s.units[BOYZ].models[0]]
      // edge-to-edge distance of exactly x inches
      tm.pos = { x: from.pos.x + x + from.base.radius + tm.base.radius, y: 0, z: from.pos.z }
      expect(targetLegality(s, ST, model, w, BOYZ)).toBeNull()
      addTestHook(s, BOYZ, 'test.cap12', { targetRangeCap: () => 12 })
      addTestHook(s, ST, 'test.cap20', { targetRangeCap: () => 20 })
      addTestHook(s, ST, 'test.capNull', { targetRangeCap: () => null })
      expect(hookService.targetRangeCapFor(s, BOYZ, model)).toBe(12)
      const rej = targetLegality(s, ST, model, w, BOYZ)
      if (ok) expect(rej).toBeNull()
      else expect(rej?.code).toBe('E_NOT_IN_RANGE')
    }
  })
})

describe('E2 reserve-arrival exclusion zones', () => {
  function arrivalState() {
    const s = makeState()
    s.phase = 'movement'; s.step = 'reinforcements'; s.phaseState = emptyPhaseState()
    placeUnit(s, BOYZ, [[-18, 0]])
    placeUnit(s, AUN, [[18, 10]])
    addTestHook(s, BOYZ, 'test.omni', { reserveExclusion: (_st, _entry, arriving) => (arriving === 'A' ? { unitIds: [BOYZ], distance: 12 } : null) })
    removeUnitToReserves(createContext(s, new ScriptedRng([]), DEFAULT_MODULES).ctx, AUN, 'test')
    return s
  }
  const place = (s: GameState, pending: { id: string; context: { unitIds: string[] } }, x: number, z = 0): Action => ({
    type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
    placements: pending.context.unitIds.flatMap((u) => s.units[u].models).map((id, i) => ({ modelId: id, pos: { x: x + i * 2, y: 0, z }, facing: 0 })),
  })
  it('SOL-024 SOL-025 E2: arrival within the zone is rejected, outside accepted; zone polygons are in constraints.forbidden; owner unaffected', () => {
    const s = arrivalState()
    expect(hookService.reserveExclusionZones(s, 'A')).toContainEqual({ sourceUnitId: BOYZ, unitIds: [BOYZ], distance: 12 })
    expect(hookService.reserveExclusionZones(s, 'B')).toEqual([])
    expect(reserveExclusionPolygons(s, 'A').length).toBeGreaterThanOrEqual(s.units[BOYZ].models.length)
    expect(reserveExclusionPolygons(s, 'B')).toEqual([])
    const c = createContext(s, new ScriptedRng([]), DEFAULT_MODULES).ctx
    expect(movementModule.advance(c)).toBe('pending')
    const pending = s.pending as unknown as { id: string; kind: string; context: { unitIds: string[] }; constraints: { forbidden: unknown[] } }
    expect(pending.kind).toBe('deployUnit')
    expect(pending.constraints.forbidden.length).toBeGreaterThanOrEqual(reserveExclusionPolygons(s, 'A').length)
    const edge = s.models[s.units[BOYZ].models[0]].base.radius + s.models[s.units[AUN].models[0]].base.radius
    const rNear = movementModule.validate!(s, place(s, pending, -18 + 11.9 + edge), pending as never)
    expect(rNear?.code).toBe('E_ENGAGEMENT')
    expect(String(rNear?.reason)).toContain('Omni-scramblers')
    // some spot just outside 12" is accepted (terrain may block individual spots)
    const zs = [0, 4, -4, 8, -8, 12, -12, 13]
    expect(zs.some((z) => movementModule.validate!(s, place(s, pending, -18 + 12.1 + edge, z), pending as never) === null)).toBe(true)
    // the same spot a hair inside is rejected for the zone wherever it is not blocked earlier
    expect(zs.some((z) => movementModule.validate!(s, place(s, pending, -18 + 11.9 + edge, z), pending as never)?.code === 'E_ENGAGEMENT')).toBe(true)
  })
})

describe('E4 ranged-kill flag on unitDestroyed', () => {
  function kill(kind: 'ranged' | 'melee' | 'mortal' | 'other', by: { player: 'A' | 'B' | null; unitId: string | null }, rangedSequence = false, victim = BOYZ) {
    const s = makeState()
    placeUnit(s, ST, [[-10, 0]])
    placeUnit(s, BOYZ, [[0, 0]])
    if (rangedSequence) s.phaseState.attack = { kind: 'ranged', attackerUnitId: ST } as never
    const seen: { kind?: string; rangedAttack?: boolean }[] = []
    const modules: ModuleTable = {
      ...DEFAULT_MODULES,
      services: { ...DEFAULT_MODULES.services, missions: { ...DEFAULT_MODULES.services.missions, unitDestroyed: (_c, info) => { seen.push({ kind: info.kind, rangedAttack: info.rangedAttack }) } } },
    }
    const ctx = createContext(s, new ScriptedRng([]), modules).ctx
    for (const id of [...s.units[victim].models]) attackService.destroyModel(ctx, id, { player: by.player, unitId: by.unitId, modelId: null, kind })
    return seen
  }
  it('SOL-015 SOL-031 E4: ranged kills flag rangedAttack; melee / other / mortal outside a ranged sequence do not; kind is passed', () => {
    expect(kill('ranged', { player: 'A', unitId: ST })).toEqual([{ kind: 'ranged', rangedAttack: true }])
    expect(kill('melee', { player: 'A', unitId: ST })).toEqual([{ kind: 'melee', rangedAttack: false }])
    expect(kill('other', { player: null, unitId: null })).toEqual([{ kind: 'other', rangedAttack: false }])
    expect(kill('mortal', { player: 'A', unitId: ST })).toEqual([{ kind: 'mortal', rangedAttack: false }])
  })
  it('SOL-016 E4: mortal wounds inside a ranged sequence by the attacking side count; the defender\'s own mortals (Hazardous) never do', () => {
    expect(kill('mortal', { player: 'A', unitId: ST }, true)).toEqual([{ kind: 'mortal', rangedAttack: true }])
    expect(kill('mortal', { player: 'B', unitId: BOYZ }, true, ST)).toEqual([{ kind: 'mortal', rangedAttack: false }])
  })
})
