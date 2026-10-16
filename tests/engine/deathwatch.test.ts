// Deathwatch: Vigil Force Alphion code hooks (docs/spec/factions/deathwatch.md section 7, checklist DEA-*): Special-Issue Ammunition,
// Deathwatch Teleportarium (the stratagem; the E1 arrival options are covered by deathwatch-core.test.ts), Narthecium, Hunters' Insight
// and Head-taker Doctrine, plus Veteran Instincts as the shared-mechanism row. Real data: Deathwatch (A) vs Space Marines (B).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
  type UseStratagemAction, type RuntimeWeapon,
} from '../../src/engine'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import type { AttackContext } from '../../src/engine/hooks'
import { pointInPolygon } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { deploymentZone } from '../../src/engine/state'
import { stratagemService } from '../../src/engine/stratagems'
import { buildShootingWeaponEntries, targetLegality, unitEligibleToShoot, validateDeclareTargets } from '../../src/engine/phases/shooting'
import { destroyStrandedTeleports, isTeleporting, teleportRecord } from '../../src/engine/teleport'
import { weaponService } from '../../src/engine/weapons'
import { setupModule } from '../../src/engine/setup'
import { stratagemScore } from '../../src/ai/stratagems'
import { unitRangedDamage } from '../../src/ai/expected'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DW = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Deathwatch', faction: 'deathwatch', patrolId: 'dw.cp.vigil-force-alphion', enhancementId: 'dw.e.aegis-vigilate', secondaryId: 'dw.sec.hunters-insight',
  attachments: [{ leaderRef: 'lieutenant-alphion', bodyguardRef: 'intercessor-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.wrath-of-the-emperor',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ALPHION = 'A:lieutenant-alphion', KRENN = 'A:apothecary-krenn', INT = 'A:intercessor-squad', AGG = 'A:aggressor-squad'
const CAPTAIN = 'B:captain-octavius', LIBRARIAN = 'B:librarian-tantus', TERM = 'B:terminator-squad', INFERNUS = 'B:infernus-squad'
const SIA = 'dw.s.special-issue-ammunition', TELEPORTARIUM = 'dw.s.deathwatch-teleportarium', VETERAN = 'dw.s.veteran-instincts'

function makeState(o: { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DW(o.a), B: SM(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'dw', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = 3
  s.players.B.cp = 3
  s.board = { ...s.board, pieces: {} } // open table: these tests probe rules, not terrain
  placeUnit(s, INT, { x: -12, z: -3, gap: 0.3 })
  placeUnit(s, ALPHION, [[-14.5, -3]])
  placeUnit(s, AGG, { x: -12, z: -12, gap: 0.3 })
  placeUnit(s, KRENN, [[-16, -8]])
  placeUnit(s, CAPTAIN, [[10, 14]])
  placeUnit(s, TERM, { x: 6, z: 14, gap: 0.3 })
  placeUnit(s, INFERNUS, { x: 14, z: 10, gap: 0.3 })
  placeUnit(s, LIBRARIAN, [[16, 14]])
  return s
}
const ctxOf = (s: GameState, dice: number[] = []) => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
const pendingOption = (s: GameState): ChooseOptionDecision => {
  if (s.pending?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${s.pending?.kind}`)
  return s.pending
}
function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = pendingOption(ctx.state)
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
// the mission handler answers mission-raised picks and resumes the window; the hooks handler answers code-named decisions
function answerMissionPick(ctx: EngineContext, optionId: string): void {
  answerOption(ctx, optionId)
  // the hooks handler goes on to offer the Oath of Moment pick of the same window: answer it too
  if (ctx.state.pending?.kind === 'chooseOption' && ctx.state.pending.context.topic === 'oathTarget') answerOption(ctx, TERM)
}
const allEffects = (s: GameState, source: string) => Object.values(s.units).flatMap((u) => u.effects).filter((e) => e.sourceAbilityId === source)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const targetsOf = (x: UseStratagemAction) => [...(x.targets.modelIds ?? []), ...(x.targets.unitIds ?? [])]
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger = {}) => stratagemService.options(s, p, w, trigger)
const offeredIds = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  offered(s, p, w, trigger).filter((x) => x.stratagemId === id).map(targetsOf)
function useStrat(s: GameState, ctx: EngineContext, player: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], trigger: Record<string, string>, id: string, first: string): void {
  expect(ctx.window(w, 'k:' + id, ctx.order.only(player), trigger)).toBe(true)
  const pending = s.pending as PendingDecision & { options: { action: Action }[] }
  const opt = pending.options.map((o) => o.action as UseStratagemAction).find((x) => x.stratagemId === id && targetsOf(x)[0] === first)
  if (!opt) throw new Error(`no option ${id} ${first}`)
  const rej = stratagemService.validate(s, opt, pending) ?? (s.pending = null, stratagemService.handle(ctx, opt, pending))
  if (rej) throw new Error(rej.reason)
}
const modelWith = (s: GameState, unit: string, weaponPart: string): string =>
  s.units[unit].models.find((id) => s.models[id].weapons.some((w) => w.includes(weaponPart))) as string
const weaponOf = (s: GameState, modelId: string, weaponPart: string): string => s.models[modelId].weapons.find((w) => w.includes(weaponPart)) as string
const abilitiesOf = (s: GameState, modelId: string, weaponId: string) => hookService.weaponAbilitiesFor!(s, modelId, s.weapons[weaponId])

// ---------- Narthecium (DEA-6.2) ----------
describe('Narthecium (DEA-6.2)', () => {
  const krennLeads = () => ({ attachments: [{ leaderRef: 'apothecary-krenn', bodyguardRef: 'intercessor-squad' }] })
  function lostGrenadier(s: GameState): string {
    const g = modelWith(s, INT, 'grenade-launcher')
    removeModel(s, g)
    return g
  }
  // Oath of Moment is the first pick at command.start; answer it so the Narthecium pick surfaces
  function toNarthecium(s: GameState, ctx: EngineContext): ChooseOptionDecision | null {
    expect(hookService.offerPicks(ctx, 'command.start', 'n1')).toBe(true)
    if (pendingOption(s).context.topic === 'oathTarget') answerOption(ctx, TERM)
    return s.pending?.kind === 'chooseOption' && (s.pending.context.data as { code?: string }).code === 'narthecium' ? s.pending : null
  }

  it('DEA-008 Krenn leading a squad that lost a grenadier: own command.start offers the destroyed kind + decline; the pick returns it at full 2 W with its launcher', () => {
    const s = makeState({ phase: 'command', a: krennLeads() })
    expect(s.units[KRENN].bodyguardUnitId).toBe(INT)
    const g = lostGrenadier(s)
    const { ctx, events } = ctxOf(s)
    const pending = toNarthecium(s, ctx)
    expect(pending).not.toBeNull()
    expect(pending!.player).toBe('A')
    expect(pending!.options.map((o) => o.id)).toEqual([g, 'decline'])
    answerOption(ctx, g)
    expect(s.pending).toBeNull()
    expect(s.units[INT].models).toHaveLength(10)
    expect(s.models[g].woundsRemaining).toBe(2) // full Wounds, not 1
    expect(s.models[g].weapons.some((w) => w.includes('grenade-launcher'))).toBe(true)
    expect(of(events, 'ModelReturned')).toMatchObject([{ unitId: INT, modelId: g }])
    expect(s.units[INT].destroyedModels).toHaveLength(0)
  })

  it('DEA-008 two destroyed kinds give one option each; declining returns nothing and the pick is not asked again that phase', () => {
    const s = makeState({ phase: 'command', a: krennLeads() })
    const g = lostGrenadier(s)
    const plain = s.units[INT].models.find((id) => !s.models[id].weapons.some((w) => w.includes('grenade-launcher')) && s.models[id].datasheetModelId.endsWith('intercessor'))!
    removeModel(s, plain)
    const { ctx } = ctxOf(s)
    const pending = toNarthecium(s, ctx)!
    expect(pending.options.map((o) => o.id).sort()).toEqual([g, plain, 'decline'].sort())
    answerOption(ctx, 'decline')
    expect(s.units[INT].models).toHaveLength(8)
    expect(hookService.offerPicks(ctx, 'command.start', 'n1')).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('DEA-009 not offered: Krenn unattached; squad at Starting Strength; opponent\'s Command phase; already used this Command phase', () => {
    // unattached Krenn (default attachments lead the squad with Alphion)
    let s = makeState({ phase: 'command' })
    lostGrenadier(s)
    expect(toNarthecium(s, ctxOf(s).ctx)).toBeNull()
    // squad at Starting Strength
    s = makeState({ phase: 'command', a: krennLeads() })
    expect(toNarthecium(s, ctxOf(s).ctx)).toBeNull()
    // the opponent's Command phase
    s = makeState({ phase: 'command', active: 'B', a: krennLeads() })
    lostGrenadier(s)
    const c = ctxOf(s)
    hookService.offerPicks(c.ctx, 'command.start', 'n1')
    const data = s.pending?.kind === 'chooseOption' ? (s.pending.context.data as { code?: string }) : {}
    expect(data.code).not.toBe('narthecium')
    // used already this Command phase
    s = makeState({ phase: 'command', a: krennLeads() })
    const g = lostGrenadier(s)
    const c2 = ctxOf(s)
    expect(toNarthecium(s, c2.ctx)).not.toBeNull()
    answerOption(c2.ctx, g)
    removeModel(s, modelWith(s, INT, 'grenade-launcher'))
    expect(hookService.offerPicks(c2.ctx, 'command.start', 'n1')).toBe(false)
  })

  it('DEA-009 no legal spot: the model stays destroyed', () => {
    const s = makeState({ phase: 'command', a: krennLeads() })
    const g = lostGrenadier(s)
    // surround the squad's footprint so no candidate position is legal: shrink the table to the squad's own bases
    s.board = { ...s.board, w: 1, h: 1 }
    const { ctx, events } = ctxOf(s)
    const pending = toNarthecium(s, ctx)
    expect(pending).not.toBeNull()
    answerOption(ctx, g)
    expect(s.units[INT].models).toHaveLength(9)
    expect(of(events, 'ModelReturned')).toHaveLength(0)
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('no room'))).toBe(true)
  })
})

// ---------- Hunters' Insight (DEA-4.1, 4.4) ----------
describe("Hunters' Insight (DEA-4.1)", () => {
  const objectivePos = (s: GameState, id: string) => s.objectives[id].pos
  function pickAtCommandStart(s: GameState, ctx: EngineContext, key: string): ChooseOptionDecision {
    ctx.services.missions.onWindow(ctx, 'command.start', key)
    return pendingOption(s)
  }
  function stand(s: GameState, unit: string, objectiveId: string): void {
    const p = objectivePos(s, objectiveId)
    placeUnit(s, unit, { x: p.x - 1.5, z: p.z, gap: 0.2 })
  }
  const hiVp = (s: GameState) => s.players.A.vpBySource['hunters-insight'] ?? 0
  const sec = (s: GameState) => s.players.A.secondaryState.huntersInsight as { objectiveId: string; round: number } | undefined

  it('DEA-011 own command.start: pick a marker outside the zone; at the end of the opponent\'s next turn, controlled with non-shocked Intercessors on it = +4 VP', () => {
    const s = makeState({ round: 1, phase: 'command' })
    const { ctx } = ctxOf(s)
    const pending = pickAtCommandStart(s, ctx, 'k1')
    expect(pending.player).toBe('A')
    const obj = pending.options[0].id
    answerMissionPick(ctx, obj)
    expect(s.pending).toBeNull()
    expect(sec(s)).toEqual({ objectiveId: obj, round: 1 })
    stand(s, INT, obj)
    s.activePlayer = 'B' // the opponent's turn ends
    ctx.services.missions.onWindow(ctx, 'turn.end', 'k2')
    expect(hiVp(s)).toBe(4)
    expect(s.players.A.vp).toBeGreaterThanOrEqual(4)
    expect(sec(s)).toBeUndefined() // consumed
  })

  it('DEA-012 markers in own deployment zone are not offered, nor are removed markers', () => {
    const s = makeState({ round: 1, phase: 'command' })
    s.objectives.south.pos = { ...s.objectives.south.pos, z: -12 } // cp-01 has no marker inside a zone: move one into ours
    const zone = deploymentZone(s, 'A')
    const inZone = Object.values(s.objectives).filter((o) => pointInPolygon({ x: o.pos.x, z: o.pos.z }, zone)).map((o) => o.id)
    expect(inZone.length).toBeGreaterThan(0)
    const removed = Object.values(s.objectives).find((o) => !inZone.includes(o.id))!
    removed.removed = true
    const { ctx } = ctxOf(s)
    const ids = pickAtCommandStart(s, ctx, 'k1').options.map((o) => o.id)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of inZone) expect(ids).not.toContain(id)
    expect(ids).not.toContain(removed.id)
    expect(ids.sort()).toEqual(Object.values(s.objectives).filter((o) => !o.removed && !inZone.includes(o.id)).map((o) => o.id).sort())
  })

  it('DEA-012 0 VP when the marker is uncontrolled, when the only unit in range is Battle-shocked, or when it is not ADEPTUS ASTARTES; the pick is cleared', () => {
    const run = (setup: (s: GameState) => void): { vp: number; cleared: boolean } => {
      const s = makeState({ round: 1, phase: 'command' })
      const { ctx } = ctxOf(s)
      pickAtCommandStart(s, ctx, 'k1')
      answerMissionPick(ctx, 'east')
      setup(s)
      s.activePlayer = 'B'
      ctx.services.missions.onWindow(ctx, 'turn.end', 'k2')
      return { vp: hiVp(s), cleared: sec(s) === undefined }
    }
    expect(run((s) => stand(s, INT, 'east'))).toEqual({ vp: 4, cleared: true }) // control case
    expect(run(() => undefined)).toEqual({ vp: 0, cleared: true }) // nobody near it: uncontrolled
    expect(run((s) => { stand(s, INT, 'east'); for (const u of [INT, ALPHION]) s.units[u].battleShocked = true })).toEqual({ vp: 0, cleared: true })
    expect(run((s) => {
      // the only unit in range carries no ADEPTUS ASTARTES keyword: strip it from this state's copy of the datasheets
      for (const id of [INT, ALPHION]) {
        const ds = s.datasheets[s.units[id].datasheetId]
        s.datasheets = { ...s.datasheets, [ds.id]: { ...ds, factionKeywords: ds.factionKeywords.filter((k) => k !== 'ADEPTUS ASTARTES') } }
      }
      stand(s, INT, 'east')
    })).toEqual({ vp: 0, cleared: true })
  })

  it('DEA-013 timing: moving second the pick is made in round 1 and scores at the end of the opponent\'s next turn, never at the end of the own turn', () => {
    const s = makeState({ round: 1, phase: 'command', active: 'A' })
    s.firstPlayer = 'B'
    const { ctx } = ctxOf(s)
    const obj = pickAtCommandStart(s, ctx, 'k1').options[0].id
    answerMissionPick(ctx, obj)
    stand(s, INT, obj)
    ctx.services.missions.onWindow(ctx, 'turn.end', 'k2') // end of the own (second) turn: round 1
    expect(hiVp(s)).toBe(0)
    expect(sec(s)).toBeDefined()
    s.round = 2
    s.activePlayer = 'B'
    ctx.services.missions.onWindow(ctx, 'turn.end', 'k3') // end of the opponent's round-2 turn
    expect(hiVp(s)).toBe(4)
  })

  it('DEA-013 a round-5 pick by the second player never scores (no later opponent turn)', () => {
    const s = makeState({ round: 5, phase: 'command', active: 'A' })
    s.firstPlayer = 'B'
    const { ctx } = ctxOf(s)
    const obj = pickAtCommandStart(s, ctx, 'k1').options[0].id
    answerMissionPick(ctx, obj)
    stand(s, INT, obj)
    ctx.services.missions.onWindow(ctx, 'turn.end', 'k2')
    expect(hiVp(s)).toBe(0)
  })
})

// ---------- Head-taker Doctrine (DEA-4.2, 4.3, 4.5) ----------
describe('Head-taker Doctrine (DEA-4.2, 4.3)', () => {
  const setup = () => makeState({ round: 2, phase: 'shooting', a: { secondaryId: 'dw.sec.head-taker-doctrine' } })
  const kill = (ctx: EngineContext, unit: string, by: { player: 'A' | 'B' | null; unitId: string | null }) =>
    attackService.destroyModel(ctx, ctx.state.units[unit].models[0], { ...by, modelId: null, kind: 'ranged' })
  const vpOf = (s: GameState, source: string) => s.players.A.vpBySource[source] ?? 0

  it('DEA-014 Intercessors kill an enemy CHARACTER model: +5 VP; a non-CHARACTER model: 0; a CHARACTER dying with no attacker attribution: 0', () => {
    const s = setup()
    const { ctx } = ctxOf(s)
    kill(ctx, TERM, { player: 'A', unitId: INT })
    expect(vpOf(s, 'head-taker-doctrine')).toBe(0)
    kill(ctx, LIBRARIAN, { player: null, unitId: null }) // Hazardous, Reserves loss, Desperate Escape
    expect(vpOf(s, 'head-taker-doctrine')).toBe(0)
    kill(ctx, CAPTAIN, { player: 'A', unitId: INT })
    expect(vpOf(s, 'head-taker-doctrine')).toBe(5)
    expect(s.players.A.vp).toBe(5)
  })

  it('DEA-014 no per-turn cap: a second CHARACTER kill scores another 5; the opponent\'s own kills never score for us', () => {
    const s = setup()
    const { ctx } = ctxOf(s)
    kill(ctx, CAPTAIN, { player: 'A', unitId: AGG })
    kill(ctx, LIBRARIAN, { player: 'A', unitId: INT })
    expect(vpOf(s, 'head-taker-doctrine')).toBe(10)
    // an enemy unit killing our CHARACTER gives Deathwatch nothing
    kill(ctx, ALPHION, { player: 'B', unitId: TERM })
    expect(vpOf(s, 'head-taker-doctrine')).toBe(10)
  })

  it('DEA-015 sweep: at battle end every enemy CHARACTER destroyed = +5 VP; one alive = 0', () => {
    let s = setup()
    let c = ctxOf(s)
    kill(c.ctx, CAPTAIN, { player: 'A', unitId: INT })
    c.ctx.services.missions.onWindow(c.ctx, 'battle.end', 'e1')
    expect(vpOf(s, 'head-taker-sweep')).toBe(0) // the Librarian lives
    s = setup()
    c = ctxOf(s)
    kill(c.ctx, CAPTAIN, { player: 'A', unitId: INT })
    kill(c.ctx, LIBRARIAN, { player: 'A', unitId: AGG })
    c.ctx.services.missions.onWindow(c.ctx, 'battle.end', 'e1')
    expect(vpOf(s, 'head-taker-sweep')).toBe(5)
  })
})

// ---------- Special-Issue Ammunition (DEA-5.2) ----------
describe('Special-Issue Ammunition (DEA-5.2)', () => {
  function use(s: GameState, ctx: EngineContext, option: 'A' | 'B'): void {
    useStrat(s, ctx, 'A', 'shooting.start', {}, SIA, INT)
    const pending = pendingOption(s)
    expect(pending.player).toBe('A')
    expect(pending.options.map((o) => o.id)).toEqual(['A', 'B'])
    answerOption(ctx, option)
    expect(s.pending).toBeNull()
  }

  it('DEA-017 set A: bolt rifles gain Anti-Monster 5+, Anti-Vehicle 5+ and Melta 2; both halves of the attached unit; the effect ends with the phase', () => {
    const s = makeState()
    const { ctx, events } = ctxOf(s)
    expect(abilitiesOf(s, modelWith(s, INT, 'bolt-rifle'), weaponOf(s, modelWith(s, INT, 'bolt-rifle'), 'bolt-rifle')).map((a) => a.ability)).not.toContain('MELTA')
    use(s, ctx, 'A')
    const rifle = modelWith(s, INT, 'bolt-rifle')
    const abil = abilitiesOf(s, rifle, weaponOf(s, rifle, 'bolt-rifle'))
    expect(abil.filter((a) => a.ability === 'ANTI').map((a) => [a.keyword, a.value]).sort()).toEqual([['MONSTER', 5], ['VEHICLE', 5]])
    expect(abil.find((a) => a.ability === 'MELTA')?.value).toBe(2)
    expect(abil.map((a) => a.ability)).not.toContain('SUSTAINED_HITS')
    // the krak launcher is covered too, and the attached Leader's pistol (a ranged weapon of the same unit)
    const gren = modelWith(s, INT, 'grenade-launcher')
    expect(abilitiesOf(s, gren, weaponOf(s, gren, 'grenade-launcher-krak')).map((a) => a.ability)).toContain('MELTA')
    const al = s.units[ALPHION].models[0]
    expect(abilitiesOf(s, al, weaponOf(s, al, 'bolt-pistol')).map((a) => a.ability)).toContain('MELTA')
    // other units are unaffected
    const ag = s.units[AGG].models[0]
    expect(abilitiesOf(s, ag, weaponOf(s, ag, 'flamestorm')).map((a) => a.ability)).not.toContain('MELTA')
    expect(allEffects(s, SIA).every((e) => e.expires.kind === 'phaseEnd')).toBe(true)
    expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === SIA)).toBe(true)
    expect(s.players.A.cp).toBe(2)
  })

  it('DEA-018 set B: bolt rifles gain Assault, Ignores Cover and Sustained Hits 2; not offered again this phase nor for a unit that already shot', () => {
    const s = makeState()
    const { ctx } = ctxOf(s)
    use(s, ctx, 'B')
    const rifle = modelWith(s, INT, 'bolt-rifle')
    const abil = abilitiesOf(s, rifle, weaponOf(s, rifle, 'bolt-rifle'))
    const names = abil.map((a) => a.ability)
    expect(names).toEqual(expect.arrayContaining(['ASSAULT', 'IGNORES_COVER', 'SUSTAINED_HITS']))
    expect(abil.find((a) => a.ability === 'SUSTAINED_HITS')?.value).toBe(2)
    expect(names).not.toContain('MELTA')
    expect(offeredIds(s, 'A', 'shooting.start', SIA)).toEqual([]) // oncePerPhase
    const t = makeState()
    for (const h of [INT, ALPHION]) t.units[h].turn.shotThisPhase = true
    expect(offeredIds(t, 'A', 'shooting.start', SIA).some((ids) => ids[0] === INT)).toBe(false)
    expect(offeredIds(makeState(), 'A', 'shooting.start', SIA).some((ids) => ids[0] === INT)).toBe(true)
  })

  it('DEA-018 not offered in the opponent\'s Shooting phase', () => {
    const s = makeState({ active: 'B' })
    expect(offeredIds(s, 'A', 'shooting.start', SIA)).toEqual([])
  })
})

// ---------- Deathwatch Teleportarium (DEA-5.3) ----------
describe('Deathwatch Teleportarium (DEA-5.3)', () => {
  const endOfEnemyFight = (o: { active?: 'A' | 'B' } = {}) => makeState({ phase: 'fight', active: o.active ?? 'B' })

  it('DEA-019 end of the opponent\'s Fight phase: an unengaged unit is removed (UnitRemovedFromBattlefield) with the 3" / no-charge arrival record; 1 CP', () => {
    const s = endOfEnemyFight()
    expect(offeredIds(s, 'A', 'phase.end', TELEPORTARIUM).some((ids) => ids[0] === INT)).toBe(true)
    const { ctx, events } = ctxOf(s)
    useStrat(s, ctx, 'A', 'phase.end', {}, TELEPORTARIUM, INT)
    expect(s.units[INT].location).toBe('reserves')
    expect(s.units[ALPHION].location).toBe('reserves') // the attached Leader goes with it
    expect(isTeleporting(s, INT)).toBe(true)
    expect(teleportRecord(s, INT)).toMatchObject({ source: TELEPORTARIUM, arrival: { minEnemyGap: 3, forbidChargeOnArrival: true } })
    expect(of(events, 'UnitRemovedFromBattlefield')).toMatchObject([{ unitId: INT }])
    expect(s.players.A.cp).toBe(2)
  })

  it('DEA-021 a Teleportarium unit still off the board when the battle ends is destroyed with its Leader (UnitLostInReserves), and no VP source credits the enemy', () => {
    const s = endOfEnemyFight()
    const { ctx, events } = ctxOf(s)
    useStrat(s, ctx, 'A', 'phase.end', {}, TELEPORTARIUM, INT)
    expect(s.units[INT].location).toBe('reserves')
    expect(isTeleporting(s, INT)).toBe(true)
    s.round = 5
    destroyStrandedTeleports(ctx)
    expect(s.units[INT].location).toBe('destroyed')
    expect(s.units[ALPHION].location).toBe('destroyed')
    expect(of(events, 'UnitLostInReserves').map((e) => e.unitId).sort()).toEqual([ALPHION, INT].sort())
    expect(isTeleporting(s, INT)).toBe(false)
    expect(s.players.B.vp).toBe(0)
    // a unit that never teleported is untouched
    expect(s.units[AGG].location).toBe('board')
  })

  it('DEA-020 not offered: for an engaged unit, in the Deathwatch player\'s own turn, or a second time in the battle', () => {
    const engaged = endOfEnemyFight()
    placeUnit(engaged, TERM, { x: -12, z: -1.1, gap: 0.3 }) // within 1" of the Intercessors
    const ids = offeredIds(engaged, 'A', 'phase.end', TELEPORTARIUM).map((x) => x[0])
    expect(ids).not.toContain(INT)
    expect(ids).toContain(AGG) // an unengaged unit can still go
    expect(offeredIds(endOfEnemyFight({ active: 'A' }), 'A', 'phase.end', TELEPORTARIUM)).toEqual([])
    const s = endOfEnemyFight()
    const { ctx } = ctxOf(s)
    useStrat(s, ctx, 'A', 'phase.end', {}, TELEPORTARIUM, INT)
    expect(offeredIds(s, 'A', 'phase.end', TELEPORTARIUM)).toEqual([])
  })
})

// ---------- Veteran Instincts (DEA-5.1, data-driven) ----------
describe('Veteran Instincts (DEA-5.1)', () => {
  const fnpEffects = (s: GameState) => allEffects(s, VETERAN)

  // Feel No Pain for `unit`'s first model against a Marine rifle shot
  const fnpOf = (s: GameState, ctx: EngineContext, unit: string) => {
    const gun = firstWeapon(s, TERM, 'ranged')
    const model = s.units[unit].models[0]
    return feelNoPainFor(ctx, model, actxOf(s, TERM, gun.model, gun.weaponId, unit, { targetModelId: model }))
  }

  it('DEA-016 after an enemy targets Intercessors in its Shooting phase: Feel No Pain 5+ until the phase ends, and the Aggressors beside them get none', () => {
    const s = makeState({ active: 'B' })
    const trigger = { unitId: TERM, targetUnitId: INT }
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', VETERAN, trigger).map((x) => x[0])).toContain(INT)
    const { ctx } = ctxOf(s)
    expect(fnpOf(s, ctx, INT)).toBeNull()
    useStrat(s, ctx, 'A', 'shooting.targetsDeclared', trigger, VETERAN, INT)
    expect(fnpEffects(s).every((e) => e.expires.kind === 'phaseEnd')).toBe(true)
    expect(fnpOf(s, ctx, INT)).toEqual({ threshold: 5, modifier: 0 })
    expect(fnpOf(s, ctx, AGG)).toBeNull()
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(fnpOf(s, ctx, INT)).toBeNull()
  })

  it('DEA-016 on the GRAVIS Aggressors the same stratagem gives Feel No Pain 4+', () => {
    const s = makeState({ active: 'B' })
    const trigger = { unitId: TERM, targetUnitId: AGG }
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', VETERAN, trigger).map((x) => x[0])).toContain(AGG)
    const { ctx } = ctxOf(s)
    expect(fnpOf(s, ctx, AGG)).toBeNull()
    useStrat(s, ctx, 'A', 'shooting.targetsDeclared', trigger, VETERAN, AGG)
    expect(fnpOf(s, ctx, AGG)).toEqual({ threshold: 4, modifier: 0 })
    expect(fnpOf(s, ctx, INT)).toBeNull()
  })

  it('DEA-016 not offered in the own Shooting phase', () => {
    const own = makeState({ active: 'A' })
    expect(offeredIds(own, 'A', 'shooting.targetsDeclared', VETERAN, { unitId: INT, targetUnitId: TERM })).toEqual([])
  })

  it('DEA-016 offered in the Fight phase of either player', () => {
    for (const active of ['A', 'B'] as const) {
      const s = makeState({ phase: 'fight', active })
      const trigger = { unitId: TERM, targetUnitId: INT }
      expect(offeredIds(s, 'A', 'fight.targetsDeclared', VETERAN, trigger).map((x) => x[0])).toContain(INT)
    }
  })
})

// ---------- real attack helpers (datasheet rules DEA-2.1, 3.x, 6.x) ----------
type AttackKindName = 'ranged' | 'melee'
interface Shot { unit: string; model: string; weaponId: string; target: string; kind?: AttackKindName }
// runs one attack sequence to its end on scripted dice; every decision is logged and answered by `choose` (default: its first option or a pass)
function fire(s: GameState, shot: Shot, dice: number[], choose?: (p: PendingDecision) => Action | undefined): { events: GameEvent[]; decisions: PendingDecision[] } {
  const made = createContext(s, new ScriptedRng([...dice, ...Array(40).fill(1)]), DEFAULT_MODULES)
  attackService.begin(made.ctx, {
    kind: shot.kind ?? 'ranged', attackerUnitId: shot.unit, overwatch: false,
    targets: [{ modelId: shot.model, weaponId: shot.weaponId, targetUnitId: shot.target, profileGroup: null, attacks: null }],
  })
  const decisions: PendingDecision[] = []
  let r = attackService.advance(made.ctx)
  for (let g = 0; r === 'pending' && g < 200; g++) {
    const p = made.ctx.state.pending
    if (!p) break
    decisions.push(p)
    // an optional re-roll offered on dice that already succeeded is kept
    const picked = choose?.(p) ?? (p.kind === 'chooseOption' && p.context.topic === 'rerollOffer' ? { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: 'keep' } as Action : undefined)
    const isWindow = p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll'
    // stratagem / Command Re-roll windows are declined unless the test answers them
    const action = (picked ?? (!isWindow && 'options' in p && p.options.length > 0 ? p.options[0].action : { type: 'pass', player: p.player, decisionId: p.id })) as Action
    made.ctx.state.pending = null
    const owner = isWindow ? made.ctx.services.stratagems : attackService.handler
    owner.handle(made.ctx, action, p)
    r = attackService.advance(made.ctx)
  }
  return { events: made.events, decisions }
}
// an AttackContext for the declarative queries (effective weapon stats, Feel No Pain) outside a running sequence
function actxOf(s: GameState, unit: string, model: string, weaponId: string, target: string, over: Partial<AttackContext> = {}): AttackContext {
  return {
    kind: 'ranged', overwatch: false, attackerUnitId: unit, attackerModelId: model, weapon: s.weapons[weaponId], targetUnitId: target,
    targetModelId: s.units[target].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false, ...over,
  }
}
// pins the attacking weapon to a known profile (the state's own copy of the weapon) so the roll thresholds under test are exact
function pinWeapon(s: GameState, weaponId: string, stats: Partial<Pick<RuntimeWeapon, 'S' | 'AP' | 'D' | 'A'>>): void {
  s.weapons = { ...s.weapons, [weaponId]: { ...s.weapons[weaponId], A: 1, abilities: [], ...stats } }
}
const firstWeapon = (s: GameState, unit: string, kind: AttackKindName): { model: string; weaponId: string } => {
  const model = s.units[unit].models.find((id) => s.models[id].weapons.some((w) => s.weapons[w].kind === kind)) as string
  return { model, weaponId: s.models[model].weapons.find((w) => s.weapons[w].kind === kind) as string }
}
// both players fight from the same table; `active` is the shooter's player
const asActive = (s: GameState, p: 'A' | 'B', phase: GameState['phase'] = 'shooting'): void => { s.activePlayer = p; s.phase = phase; s.phaseState = emptyPhaseState() }

// the 10-model squad's row is ~16" wide: park it and its Leader on the west edge so enemies placed at x >= 0 stay clear of Engagement Range
const parkWest = (s: GameState): void => { placeUnit(s, INT, { x: -21, z: -3, gap: 0.3 }); placeUnit(s, ALPHION, [[-21, -6]]) }

// ---------- Oath of Moment (DEA-2.1) ----------
describe('Oath of Moment (DEA-2.1)', () => {
  function oathShot(s: GameState, target: string, dice: number[]) {
    const model = modelWith(s, INT, 'bolt-rifle')
    // the failed die is re-rolled at once; a kept success is never worth re-rolling
    return fire(s, { unit: INT, model, weaponId: weaponOf(s, model, 'bolt-rifle'), target }, dice, (p) =>
      p.kind === 'chooseOption' && p.context.topic === 'rerollOffer' ? { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: 'keep' } : undefined)
  }
  const setup = () => {
    const s = makeState()
    parkWest(s)
    placeUnit(s, TERM, { x: 2, z: -3, gap: 0.3 })
    placeUnit(s, INFERNUS, { x: 2, z: 6, gap: 0.3 })
    s.players.A.oathTargetUnitId = TERM
    return s
  }
  it('DEA-004 a failed bolt-rifle hit roll against the Oath target is re-rolled; against any other unit it stands', () => {
    // two attacks: dice 1 (fail) and 6 (hit); the re-roll of the failure comes up 6
    const oath = oathShot(setup(), TERM, [1, 6, 6])
    expect(of(oath.events, 'HitRolled').map((h) => [h.die, h.hit])).toEqual([[6, true], [6, true]])
    expect(of(oath.events, 'DiceRerolled' as never).length).toBeGreaterThan(0)
    const other = oathShot(setup(), INFERNUS, [1, 6, 6])
    expect(of(other.events, 'HitRolled').map((h) => [h.die, h.hit])).toEqual([[1, false], [6, true]])
    expect(other.events.some((e) => e.type === 'DiceRerolled')).toBe(false)
    expect(other.decisions.some((d) => d.kind === 'chooseOption' && d.context.topic === 'rerollOffer')).toBe(false)
  })

  it('DEA-004 in a Deathwatch-vs-Marines game each player keeps their own Oath target', () => {
    const s = setup()
    s.players.B.oathTargetUnitId = INT
    expect(hookService.isOathTarget(s, INT, TERM)).toBe(true) // ours: the Terminators
    expect(hookService.isOathTarget(s, INT, INFERNUS)).toBe(false)
    expect(hookService.isOathTarget(s, TERM, INT)).toBe(true) // theirs: our Intercessors
    expect(hookService.isOathTarget(s, TERM, AGG)).toBe(false)
    expect(hookService.isOathTarget(s, ALPHION, TERM)).toBe(true) // the attached Leader shares the player's pick
  })
})

// ---------- Aegis Vigilate (DEA-3.1) ----------
describe('Aegis Vigilate (DEA-3.1)', () => {
  // the Marines' lead Terminator fires one pinned S5 AP-3 shot at `target`
  function shoot(s: GameState, target: string, dice: number[]) {
    const { model, weaponId } = firstWeapon(s, TERM, 'ranged')
    pinWeapon(s, weaponId, { S: 5, AP: -3, D: 1 })
    asActive(s, 'B')
    return fire(s, { unit: TERM, model, weaponId, target }, dice)
  }
  const setup = () => {
    const s = makeState()
    parkWest(s)
    placeUnit(s, TERM, { x: 2, z: -3, gap: 0.3 })
    return s
  }
  const toughness = (s: GameState, unit: string) =>
    hookService.statFor(s, { unitId: unit, modelId: s.units[unit].models[0], weapon: null, stat: 'T' }, 4)

  it('DEA-005 the attached Intercessors (and Alphion) are T5; unattached Krenn and the Aggressors are unaffected', () => {
    const s = setup()
    expect(toughness(s, INT)).toBe(5)
    expect(toughness(s, ALPHION)).toBe(5)
    expect(toughness(s, KRENN)).toBe(4)
    expect(hookService.statFor(s, { unitId: AGG, modelId: s.units[AGG].models[0], weapon: null, stat: 'T' }, 6)).toBe(6)
  })

  it('DEA-005 an S5 attack wounds the attached Intercessors on 4+ (3 fails, 4 wounds) but the unattached Krenn on 3+', () => {
    const fail = of(shoot(setup(), INT, [6, 3]).events, 'WoundRolled')[0]
    expect(fail).toMatchObject({ needed: 4, die: 3, wounded: false })
    const ok = of(shoot(setup(), INT, [6, 4]).events, 'WoundRolled')[0]
    expect(ok).toMatchObject({ needed: 4, die: 4, wounded: true })
    const krenn = of(shoot(setup(), KRENN, [6, 3]).events, 'WoundRolled')[0]
    expect(krenn).toMatchObject({ needed: 3, die: 3, wounded: true })
  })

  it('DEA-005 an AP-3 attack is saved on the 4+ invulnerable save (3 fails, 4 saves); Krenn only has his 3+ armour, cut to 6+ by the AP', () => {
    const fail = of(shoot(setup(), INT, [6, 6, 3]).events, 'SaveRolled')[0]
    expect(fail).toMatchObject({ kind: 'invuln', needed: 4, die: 3, final: 3, saved: false })
    const ok = of(shoot(setup(), INT, [6, 6, 4]).events, 'SaveRolled')[0]
    expect(ok).toMatchObject({ kind: 'invuln', needed: 4, die: 4, final: 4, saved: true })
    const krenn = of(shoot(setup(), KRENN, [6, 6, 4]).events, 'SaveRolled')[0]
    expect(krenn).toMatchObject({ kind: 'armour', needed: 3, die: 4, final: 1, saved: false }) // 4 - 3 AP < 3+
  })
})

// ---------- Aliens' Bane (DEA-3.2) ----------
describe("Aliens' Bane (DEA-3.2)", () => {
  const BANE = { enhancementId: 'dw.e.aliens-bane' }
  const withBane = (o: { b?: Partial<PlayerSetup> } = {}) => {
    const s = makeState({ phase: 'fight', a: BANE, b: o.b })
    placeUnit(s, INFERNUS, { x: -12, z: 2, gap: 0.3 })
    asActive(s, 'A', 'fight')
    return s
  }
  const alphionGun = (s: GameState, kind: AttackKindName, part: string) => {
    const model = s.units[ALPHION].models[0]
    return { model, weaponId: s.models[model].weapons.find((w) => w.includes(part) && s.weapons[w].kind === kind) as string }
  }
  // the +1 rides on the wound roll (final = die + 1), the threshold itself stays S v T
  const woundRoll = (s: GameState, shot: Shot, die: number) => {
    const ev = of(fire(s, shot, [6, die]).events, 'WoundRolled')[0]
    return { needed: ev.needed, final: ev.final, wounded: ev.wounded }
  }

  it("DEA-006 Alphion's power weapon (S5) v T4 needs a 3+ and adds 1 to the wound roll with Aliens' Bane: a 2 wounds, a 1 does not; without it a 2 fails", () => {
    const { model, weaponId } = alphionGun(withBane(), 'melee', 'master-crafted')
    const shot = (): Shot => ({ unit: INT, model, weaponId, target: INFERNUS, kind: 'melee' })
    const s1 = withBane(); pinWeapon(s1, weaponId, { S: 5, AP: -2, D: 2 })
    expect(woundRoll(s1, shot(), 2)).toEqual({ needed: 3, final: 3, wounded: true })
    expect(woundRoll(s1, shot(), 1)).toEqual({ needed: 3, final: 2, wounded: false })
    const s2 = makeState({ phase: 'fight' }) // default enhancement: Aegis Vigilate
    placeUnit(s2, INFERNUS, { x: -12, z: 2, gap: 0.3 }); asActive(s2, 'A', 'fight'); pinWeapon(s2, weaponId, { S: 5, AP: -2, D: 2 })
    expect(woundRoll(s2, shot(), 2)).toEqual({ needed: 3, final: 2, wounded: false })
    expect(woundRoll(s2, shot(), 3)).toEqual({ needed: 3, final: 3, wounded: true })
  })

  it("DEA-006 the bonus is Alphion's alone: his bolt pistol and the Intercessors' close combat weapons wound as before", () => {
    const plain = makeState({ phase: 'fight' })
    const bane = withBane()
    placeUnit(plain, INFERNUS, { x: -12, z: 2, gap: 0.3 }); asActive(plain, 'A', 'fight')
    const pistol = alphionGun(bane, 'ranged', 'bolt-pistol')
    const rifleman = firstWeapon(bane, INT, 'melee')
    for (const [kind, g] of [['ranged', pistol], ['melee', rifleman]] as const) {
      const run = (s: GameState) => {
        pinWeapon(s, g.weaponId, { S: 4, AP: 0, D: 1 })
        return woundRoll(s, { unit: INT, model: g.model, weaponId: g.weaponId, target: INFERNUS, kind }, 3)
      }
      expect(run(bane)).toEqual(run(plain))
      expect(run(bane)).toEqual({ needed: 4, final: 3, wounded: false }) // S4 v T4: no +1
    }
  })

  it("DEA-006 Precision: Alphion's power weapon may allocate to the attached CHARACTER; the bolt pistol and the Intercessors may not; no enhancement, no Precision", () => {
    const lead = { b: { attachments: [{ leaderRef: 'captain-octavius', bodyguardRef: 'terminator-squad' }] } }
    const s = withBane(lead)
    const power = alphionGun(s, 'melee', 'master-crafted')
    const abil = (sx: GameState, g: { model: string; weaponId: string }) => abilitiesOf(sx, g.model, g.weaponId).map((a) => a.ability)
    expect(abil(s, power)).toContain('PRECISION')
    expect(abil(s, alphionGun(s, 'ranged', 'bolt-pistol'))).not.toContain('PRECISION')
    expect(abil(s, firstWeapon(s, INT, 'melee'))).not.toContain('PRECISION')
    const captainModel = s.units[CAPTAIN].models[0]
    const run = (sx: GameState) => {
      placeUnit(sx, TERM, { x: -12, z: 2, gap: 0.3 })
      placeUnit(sx, CAPTAIN, [[-12, 4]])
      pinWeapon(sx, power.weaponId, { S: 5, AP: -2, D: 2 })
      return fire(sx, { unit: INT, model: power.model, weaponId: power.weaponId, target: TERM, kind: 'melee' }, [6, 6, 1])
    }
    const precise = run(s)
    const pick = precise.decisions.find((d) => d.kind === 'allocateAttack' && d.context.precision === true)
    expect(pick).toBeTruthy()
    expect((pick as { options: { id: string }[] }).options.map((o) => o.id)).toContain(captainModel)
    expect(of(precise.events, 'AttackAllocated')[0].modelId).toBe(captainModel)
    const plain = makeState({ phase: 'fight', b: lead.b })
    asActive(plain, 'A', 'fight')
    expect(run(plain).decisions.some((d) => d.kind === 'allocateAttack' && d.context.precision === true)).toBe(false)
  })
})

// ---------- Target Priority (DEA-6.1) ----------
describe('Target Priority (DEA-6.1)', () => {
  const setup = (a: Partial<PlayerSetup> = {}) => {
    const s = makeState({ a })
    parkWest(s)
    placeUnit(s, TERM, { x: 2, z: -3, gap: 0.3 })
    placeUnit(s, INFERNUS, { x: -22, z: -12, gap: 0.3 }) // within the flamestorm's 12" of the Aggressors
    return s
  }
  const fellBack = (s: GameState, ...units: string[]) => { for (const u of units) s.units[u].turn.moveType = 'fallBack' }

  it("DEA-007 Alphion's unit (the attached Intercessors included) can shoot and charge after Falling Back; Aggressors that Fell Back cannot", () => {
    const s = setup()
    fellBack(s, INT, ALPHION, AGG)
    const { ctx } = ctxOf(s)
    expect(hookService.eligibilityFor(s, INT, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, INT, 'charge')).toBe(true)
    expect(unitEligibleToShoot(ctx, INT)).toBe(true)
    expect(hookService.eligibilityFor(s, AGG, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(s, AGG, 'charge')).toBe(false)
    expect(unitEligibleToShoot(ctx, AGG)).toBe(false)
    // the same Aggressors are fine to shoot when they did not Fall Back (the enemy is in range)
    s.units[AGG].turn.moveType = 'normal'
    expect(unitEligibleToShoot(ctx, AGG)).toBe(true)
  })

  it('DEA-007 the permission belongs to Alphion: Krenn leading the squad gets nothing; unattached Alphion keeps it for himself', () => {
    const krenn = setup({ attachments: [{ leaderRef: 'apothecary-krenn', bodyguardRef: 'intercessor-squad' }] })
    fellBack(krenn, INT, KRENN)
    expect(krenn.units[KRENN].bodyguardUnitId).toBe(INT)
    expect(hookService.eligibilityFor(krenn, INT, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(krenn, INT, 'charge')).toBe(false)
    const alone = setup({ attachments: [] })
    fellBack(alone, INT, ALPHION)
    expect(hookService.eligibilityFor(alone, INT, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(alone, ALPHION, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(alone, ALPHION, 'charge')).toBe(true)
  })

  it('DEA-007 a unit that only Advanced gets no help from Target Priority (it covers Falling Back)', () => {
    const s = setup()
    s.units[INT].turn.moveType = 'advance'
    s.units[ALPHION].turn.moveType = 'advance'
    expect(hookService.eligibilityFor(s, INT, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(s, INT, 'charge')).toBe(false)
  })
})

// ---------- Close-quarters Firepower (DEA-6.3) ----------
describe('Close-quarters Firepower (DEA-6.3)', () => {
  const setup = () => {
    const s = makeState()
    parkWest(s)
    placeUnit(s, TERM, { x: -12, z: -7, gap: 0.3 }) // closest to the Aggressors
    placeUnit(s, INFERNUS, { x: 0, z: -12, gap: 0.3 }) // in range, but farther
    return s
  }
  const apAgainst = (s: GameState, weaponPart: string, target: string): number => {
    const model = s.units[AGG].models[0]
    const weaponId = weaponOf(s, model, weaponPart)
    const kind = s.weapons[weaponId].kind
    return weaponService.effectiveWeapon(s, model, weaponId, actxOf(s, AGG, model, weaponId, target, { kind })).AP
  }

  it('DEA-010 the flamestorm gauntlets get AP -1 against the closest eligible enemy unit and AP 0 against a farther one', () => {
    const s = setup()
    expect(apAgainst(s, 'flamestorm', TERM)).toBe(-1)
    expect(apAgainst(s, 'flamestorm', INFERNUS)).toBe(0)
    // when the nearer unit is gone, the other becomes the closest eligible target
    s.units[TERM].location = 'destroyed'
    expect(apAgainst(s, 'flamestorm', INFERNUS)).toBe(-1)
  })

  it('DEA-010 only ranged attacks improve: the twin power fists keep AP -2 against either unit', () => {
    const s = setup()
    expect(apAgainst(s, 'twin-power-fists', TERM)).toBe(-2)
    expect(apAgainst(s, 'twin-power-fists', INFERNUS)).toBe(-2)
  })

  it('DEA-010 the Intercessors do not have it: bolt rifle AP stays -1 at the closest target', () => {
    const s = setup()
    placeUnit(s, TERM, { x: 2, z: -3, gap: 0.3 })
    const model = modelWith(s, INT, 'bolt-rifle')
    const weaponId = weaponOf(s, model, 'bolt-rifle')
    expect(weaponService.effectiveWeapon(s, model, weaponId, actxOf(s, INT, model, weaponId, TERM)).AP).toBe(-1)
  })
})

// ---------- weapon profiles (DEA-6) ----------
describe('Astartes grenade launcher (DEA-6)', () => {
  const mirror = (): GameState => {
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DW(), B: DW({ attachments: [] }) },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const s = createGameState(setup, bundle, 'dw-mirror', ENGINE_VERSION)
    s.round = 2; s.activePlayer = 'A'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    s.board = { ...s.board, pieces: {} }
    placeUnit(s, INT, { x: -21, z: -3, gap: 0.3 })
    placeUnit(s, 'B:intercessor-squad', { x: 4, z: -3, gap: 0.3 })
    return s
  }
  const grenadier = (s: GameState): string => modelWith(s, INT, 'grenade-launcher')
  const frag = (s: GameState) => weaponOf(s, grenadier(s), 'grenade-launcher-frag')
  const krak = (s: GameState) => weaponOf(s, grenadier(s), 'grenade-launcher-krak')

  it('DEA-022 krak is S9 AP-2 damage D3, one shot; frag is D3 shots at S4 AP0 damage 1 with Blast', () => {
    const s = makeState()
    const k = s.weapons[krak(s)], f = s.weapons[frag(s)]
    expect([k.range, k.A, k.S, k.AP, k.D]).toEqual([24, 1, 9, -2, 'D3'])
    expect([f.range, f.A, f.S, f.AP, f.D]).toEqual([24, 'D3', 4, 0, 1])
    expect(f.abilities.map((a) => a.ability)).toContain('BLAST')
    expect(k.abilities.map((a) => a.ability)).not.toContain('BLAST')
  })

  it('DEA-022 the two profiles share one group, and a declaration may fire only one of them per model', () => {
    const s = makeState()
    parkWest(s)
    placeUnit(s, TERM, { x: 2, z: -3, gap: 0.3 })
    expect(s.weapons[frag(s)].profileGroup).toBe(s.weapons[krak(s)].profileGroup)
    expect(s.weapons[frag(s)].profileGroup).not.toBeNull()
    const { ctx } = ctxOf(s)
    const weapons = buildShootingWeaponEntries(ctx, INT)
    const model = grenadier(s)
    expect(weapons.filter((w) => w.modelId === model && w.profileGroup).map((w) => w.weaponId).sort()).toEqual([frag(s), krak(s)].sort())
    const pending = { kind: 'declareTargets', id: 'd1', player: 'A', window: 'shooting.start', canPass: true, context: { unitId: INT, attackKind: 'ranged', overwatch: false, weapons, engagedWith: [] } } as unknown as PendingDecision & { kind: 'declareTargets' }
    const target = (weaponId: string) => ({ modelId: model, weaponId, targetUnitId: TERM, profileGroup: s.weapons[weaponId].profileGroup ?? undefined })
    const declare = (...ids: string[]): Action => ({ type: 'declareTargets', player: 'A', decisionId: 'd1', unitId: INT, targets: ids.map(target) }) as Action
    expect(validateDeclareTargets(s, declare(frag(s)), pending)).toBeNull()
    expect(validateDeclareTargets(s, declare(krak(s)), pending)).toBeNull()
    expect(validateDeclareTargets(s, declare(frag(s), krak(s)), pending)).not.toBeNull()
  })

  it('DEA-022 frag Blast: D3 shots plus 1 per 5 target models: 2 + 2 against a 10-model unit, 2 + 1 against 5 models', () => {
    const big = mirror()
    const bigHits = of(fire(big, { unit: INT, model: grenadier(big), weaponId: frag(big), target: 'B:intercessor-squad' }, [3]).events, 'HitRolled')
    expect(big.units['B:intercessor-squad'].models.length).toBe(10)
    expect(bigHits).toHaveLength(4)
    const small = makeState()
    parkWest(small)
    placeUnit(small, TERM, { x: 2, z: -3, gap: 0.3 })
    const smallHits = of(fire(small, { unit: INT, model: grenadier(small), weaponId: frag(small), target: TERM }, [3]).events, 'HitRolled')
    expect(smallHits).toHaveLength(3)
  })
})

// ---------- Bolt rifle (DEA-6) ----------
describe('Bolt rifle: Assault and Heavy (DEA-6)', () => {
  const setup = () => {
    const s = makeState()
    parkWest(s)
    placeUnit(s, TERM, { x: 2, z: -3, gap: 0.3 })
    return s
  }
  const moved = (s: GameState, moveType: 'stationary' | 'normal' | 'advance') => { for (const u of [INT, ALPHION]) s.units[u].turn.moveType = moveType }
  const weaponIdsOfUnit = (s: GameState): Set<string> => new Set(buildShootingWeaponEntries(ctxOf(s).ctx, INT).map((e) => e.weaponId))

  it('DEA-023 Assault: after Advancing the squad is still eligible and may declare only the bolt rifles (pistols and launchers stay home)', () => {
    const s = setup()
    moved(s, 'advance')
    expect(unitEligibleToShoot(ctxOf(s).ctx, INT)).toBe(true)
    expect([...weaponIdsOfUnit(s)]).toEqual(['dw.w.bolt-rifle'])
    const still = setup()
    moved(still, 'normal')
    expect(weaponIdsOfUnit(still)).toEqual(new Set(['dw.w.bolt-rifle', 'sm.w.bolt-pistol', 'dw.w.bolt-pistol-alphion', 'dw.w.grenade-launcher-frag', 'dw.w.grenade-launcher-krak']))
  })

  it('DEA-023 Heavy: a stationary squad adds 1 to the bolt rifle hit roll (a 2 hits); one that made a Normal move does not (a 2 misses)', () => {
    const shot = (moveType: 'stationary' | 'normal') => {
      const s = setup()
      moved(s, moveType)
      const model = modelWith(s, INT, 'bolt-rifle')
      return of(fire(s, { unit: INT, model, weaponId: weaponOf(s, model, 'bolt-rifle'), target: TERM }, [2, 2]).events, 'HitRolled')[0]
    }
    expect(shot('stationary')).toMatchObject({ die: 2, final: 3, hit: true })
    expect(shot('normal')).toMatchObject({ die: 2, final: 2, hit: false })
  })

  it('DEA-023 the rifle itself: 24" range, 2 attacks, BS 3+, S4 AP-1 damage 1, with Assault and Heavy', () => {
    const s = makeState()
    const w = s.weapons['dw.w.bolt-rifle']
    expect([w.range, w.A, w.skill, w.S, w.AP, w.D]).toEqual([24, 2, 3, 4, -1, 1])
    expect(w.abilities.map((a) => a.ability).sort()).toEqual(['ASSAULT', 'HEAVY'])
  })
})

// ---------- Twin-linked and Torrent (DEA-6) ----------
describe('Aggressor weapons: Twin-linked and Torrent (DEA-6)', () => {
  const setup = () => {
    const s = makeState()
    parkWest(s)
    placeUnit(s, INFERNUS, { x: -12, z: -7, gap: 0.3 }) // inside the flamestorm's 12"
    return s
  }
  const aggressor = (s: GameState, part: string) => ({ model: s.units[AGG].models[0], weaponId: weaponOf(s, s.units[AGG].models[0], part) })
  const rerolls = (events: GameEvent[]) => events.filter((e) => e.type === 'DiceRerolled' && (e as { source?: string }).source === 'wound')

  it('DEA-024 twin power fists: a failed wound roll is re-rolled (1 then 6 wounds); with the ability stripped the same dice leave the wound failed', () => {
    const s = setup()
    asActive(s, 'A', 'fight')
    const g = aggressor(s, 'twin-power-fists')
    // 3 attacks: three hits on 6s, wound dice 1 / 6 / 6, the re-roll of the 1 comes up 6
    const dice = [6, 6, 6, 1, 6, 6, 6]
    const twin = fire(s, { unit: AGG, model: g.model, weaponId: g.weaponId, target: INFERNUS, kind: 'melee' }, dice)
    expect(of(twin.events, 'WoundRolled').map((w) => [w.die, w.wounded])).toEqual([[6, true], [6, true], [6, true]])
    expect(rerolls(twin.events)).toHaveLength(1)
    const plain = setup()
    asActive(plain, 'A', 'fight')
    plain.weapons = { ...plain.weapons, [g.weaponId]: { ...plain.weapons[g.weaponId], abilities: [] } }
    const none = fire(plain, { unit: AGG, model: g.model, weaponId: g.weaponId, target: INFERNUS, kind: 'melee' }, dice)
    expect(of(none.events, 'WoundRolled').map((w) => [w.die, w.wounded])).toEqual([[1, false], [6, true], [6, true]])
    expect(rerolls(none.events)).toHaveLength(0)
  })

  it('DEA-024 flamestorm gauntlets: Torrent auto-hits (no hit dice), Twin-linked re-rolls the failed wound, and the weapon ignores cover', () => {
    const s = setup()
    const g = aggressor(s, 'flamestorm')
    expect(abilitiesOf(s, g.model, g.weaponId).map((a) => a.ability).sort()).toEqual(['IGNORES_COVER', 'TORRENT', 'TWIN_LINKED'])
    // D6+1 attacks on a 1 = 2 attacks; wound dice 1 and 6 (S4 v T4 = 4+); the re-roll of the 1 is a 6. No hit dice are consumed.
    const r = fire(s, { unit: AGG, model: g.model, weaponId: g.weaponId, target: INFERNUS }, [1, 1, 6, 6])
    const hits = of(r.events, 'HitRolled')
    expect(hits).toHaveLength(2)
    expect(hits.every((h) => h.auto && h.hit)).toBe(true)
    expect(of(r.events, 'WoundRolled').map((w) => [w.die, w.wounded])).toEqual([[6, true], [6, true]])
    expect(rerolls(r.events)).toHaveLength(1)
  })
})

// ---------- Reductor pistol (DEA-6) ----------
describe('Reductor pistol (DEA-6)', () => {
  const setup = (gap: number, a: Partial<PlayerSetup> = { attachments: [] }) => {
    const s = makeState({ a })
    placeUnit(s, KRENN, [[0, 0]])
    const r1 = s.models[s.units[KRENN].models[0]].base.radius
    const r2 = s.models[s.units[CAPTAIN].models[0]].base.radius
    placeUnit(s, CAPTAIN, [[r1 + r2 + gap, 0]])
    return s
  }
  const reductor = (s: GameState) => weaponOf(s, s.units[KRENN].models[0], 'reductor-pistol')
  const legality = (s: GameState) => targetLegality(s, KRENN, s.units[KRENN].models[0], weaponService.effectiveWeapon(s, s.units[KRENN].models[0], reductor(s)), CAPTAIN)

  it('DEA-025 the profile: 3" Pistol, S4 AP-4 damage 2', () => {
    const w = setup(2).weapons[reductor(setup(2))]
    expect([w.range, w.A, w.skill, w.S, w.AP, w.D]).toEqual([3, 1, 3, 4, -4, 2])
    expect(w.abilities.map((a) => a.ability)).toEqual(['PISTOL'])
  })

  it('DEA-025 legal only at 3" or less: a target 2.9" away is legal, 3.1" away is out of range', () => {
    expect(legality(setup(2.9))).toBeNull()
    expect(legality(setup(3.1))).toMatchObject({ code: 'E_NOT_IN_RANGE' })
  })

  it('DEA-025 as a Pistol it may be fired in Engagement Range, at the unit Krenn is engaged with (his absolvor too)', () => {
    const s = setup(0.5)
    expect(leaderService.inEngagementWithEnemy(s, KRENN)).toBe(true)
    const { ctx } = ctxOf(s)
    expect(unitEligibleToShoot(ctx, KRENN)).toBe(true)
    const entries = buildShootingWeaponEntries(ctx, KRENN)
    expect(entries.map((e) => e.weaponId).sort()).toEqual(['dw.w.absolvor-bolt-pistol', 'dw.w.reductor-pistol'])
    for (const e of entries) expect(e.legalTargets).toEqual([CAPTAIN])
  })

  it('DEA-025 leading the squad: an engaged squad offers only Pistols, Krenn\'s reductor among them; the rifles stay quiet', () => {
    const s = makeState({ a: { attachments: [{ leaderRef: 'apothecary-krenn', bodyguardRef: 'intercessor-squad' }] } })
    placeUnit(s, INT, { x: -10, z: -3, gap: 0.3 })
    placeUnit(s, KRENN, [[-10, 0]])
    const r1 = s.models[s.units[KRENN].models[0]].base.radius
    const r2 = s.models[s.units[CAPTAIN].models[0]].base.radius
    placeUnit(s, CAPTAIN, [[-10 - r1 - r2 - 0.5, 0]])
    const entries = buildShootingWeaponEntries(ctxOf(s).ctx, INT)
    const ids = new Set(entries.map((e) => e.weaponId))
    expect(ids.has('dw.w.reductor-pistol')).toBe(true)
    expect(ids.has('dw.w.bolt-rifle')).toBe(false)
    expect(ids.has('dw.w.grenade-launcher-frag')).toBe(false)
  })
})

describe('Patrol Squads split by the in-engine prompt (DEA-002) and the AI use of Veteran Instincts', () => {
  const grenadiers = (st: GameState, id: string): number => st.units[id].models.filter((m) => st.models[m].weapons.includes('dw.w.grenade-launcher-frag')).length
  const hasSergeant = (st: GameState, id: string): boolean => st.units[id].models.some((m) => st.models[m].datasheetModelId === 'sergeant')

  it('DEA-002 DEA-1.2: the in-engine Keep/Split prompt deals one grenadier to each half, Sergeant with the first half', () => {
    const s = createGameState({ missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DW(), B: SM() }, sides: { attacker: 'B' }, firstTurn: 'A', dataVersion: 'test' }, bundle, 'dw-split', ENGINE_VERSION)
    s.phase = 'deployment'
    s.round = 0
    s.phaseState = emptyPhaseState()
    s.step = 'deploy'
    const ctx = ctxOf(s).ctx
    expect(setupModule.advance(ctx)).toBe('pending')
    const offer = pendingOption(s)
    expect((offer.context.data as { choice?: string }).choice).toBe('patrolSquads')
    expect(s.units[INT].models).toHaveLength(10)
    expect(grenadiers(s, INT)).toBe(2)
    answerSetup(ctx, 'split')
    const half = `${INT}~a`
    expect(s.units[INT].models).toHaveLength(5)
    expect(s.units[half].models).toHaveLength(5)
    expect(grenadiers(s, INT)).toBe(1)
    expect(grenadiers(s, half)).toBe(1)
    expect(hasSergeant(s, INT)).toBe(true)
    expect(hasSergeant(s, half)).toBe(false)
    // every model of both halves keeps its bolt rifle
    for (const id of [INT, half]) for (const m of s.units[id].models) expect(s.models[m].weapons).toContain('dw.w.bolt-rifle')
  })

  it('AI: Veteran Instincts has a finite positive gain when Intercessors are being shot (granted Feel No Pain is counted)', () => {
    const s = makeState()
    placeUnit(s, INT, { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, TERM, { x: -12, z: 8, gap: 0.3 })
    const pending = { id: 'd', player: 'A', window: 'shooting.targetsDeclared', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: TERM, targetUnitId: INT, rollId: null }, usable: [] }, options: [] } as unknown as PendingDecision
    const action: UseStratagemAction = { type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: VETERAN, targets: { unitIds: [INT] } }
    const plain = unitRangedDamage(s, TERM, INT, {})
    expect(plain).toBeGreaterThan(0)
    expect(unitRangedDamage(s, TERM, INT, { fnp: 5 })).toBeCloseTo(plain * (2 / 3), 5)
    expect(unitRangedDamage(s, TERM, INT, { fnp: 4 })).toBeLessThan(unitRangedDamage(s, TERM, INT, { fnp: 5 }))
    s.players.A.cp = 6
    expect(stratagemScore(s, 'A', pending, action, 1)).toBeGreaterThan(-Infinity)
  })
})

function answerSetup(ctx: EngineContext, optionId: string): void {
  const pending = pendingOption(ctx.state)
  ctx.state.pending = null
  const rej = setupModule.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`${rej.code} ${rej.reason}`)
}
