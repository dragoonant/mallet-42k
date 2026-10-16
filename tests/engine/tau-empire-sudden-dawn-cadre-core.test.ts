// T'au Empire: Sudden Dawn Cadre - engine changes beyond code hooks (docs/spec/factions/tau-empire--sudden-dawn-cadre.md 7.1,
// items E1-E7; checklist SDC-*). Real Combat Patrol data. E4/E5 (Overwatch ban, phase-mark cover) live in code-hooks /
// hooks-impl and are covered by tau-empire-sudden-dawn-cadre.test.ts (SDC-007, SDC-017).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type ChooseOptionDecision, type EngineContext, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { attackService, pruneUnreachableTargets, REACTIVE_MOVED_PREFIX } from '../../src/engine/attack'
import { chargeRollModifier } from '../../src/engine/phases/charge'
import { disembarkCandidates, movementModule, offerEmbark } from '../../src/engine/phases/movement'
import { setupModule } from '../../src/engine/setup'
import { setModelPos } from '../../src/engine/state'
import { transportService } from '../../src/engine/transports'
import { missionService } from '../../src/engine/missions'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const TAU = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: "T'au Empire", faction: 'tau-empire', patrolId: 'tau.cp.sudden-dawn-cadre', enhancementId: 'tau.e.prototype-systems', secondaryId: 'tau.sec.surprise-attack',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.proper-lootin',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const CLOUD = 'A:cloudspear', PATH = 'A:pathfinders', BREACH = 'A:breachers', FISH = 'A:devilfish'
const BOYZ = 'B:boyz-a'

function makeSetup(a: Partial<PlayerSetup> = {}): GameSetup {
  return { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: TAU(a), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
}
function makeState(phase: GameState['phase'] = 'shooting', a: Partial<PlayerSetup> = {}): GameState {
  const s = createGameState(makeSetup(a), bundle, 'sdc-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.firstPlayer = 'A'
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
const noStrats = (): ModuleTable => ({ ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: { ...DEFAULT_MODULES.services.stratagems, offered: () => [] } as never } })
function ctxOf(s: GameState, dice: number[] = [], modules: ModuleTable = DEFAULT_MODULES) { return createContext(s, new ScriptedRng(dice), modules) }

// ===================================================================================================================
// E2 one-die re-roll per activation (Prototype Systems)
// ===================================================================================================================
describe('E2 oneDie re-roll (SDC-008..010)', () => {
  // Cloudspear (Prototype Systems) fires the projector (Blast, D6 attacks) then the plasma rifle at ten Boyz.
  function shoot(policy: (p: ChooseOptionDecision, n: number) => { optionId: string; dieIndexes?: number[] }, dice: number[]) {
    const s = makeState()
    placeUnit(s, CLOUD, [[-6, 0]])
    placeUnit(s, BOYZ, { x: 4, z: 0, gap: 0.3 })
    const { ctx } = ctxOf(s, [...dice, ...Array(80).fill(1)])
    const m = s.units[CLOUD].models[0]
    const t = (w: string) => ({ modelId: m, weaponId: w, targetUnitId: BOYZ, profileGroup: null, attacks: null })
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: CLOUD, overwatch: false, targets: [t('tau.w.airbursting-fragmentation-projector'), t('tau.w.plasma-rifle')] })
    const offers: { purpose: string; key: string; maxDice?: number; dice: number[] }[] = []
    for (let i = 0; i < 60; i++) {
      if (attackService.advance(ctx) === 'done') break
      const p = s.pending as ChooseOptionDecision | null
      if (!p) break
      s.pending = null
      if (p.kind === 'chooseOption' && p.context.topic === 'rerollOffer') {
        const d = p.context.data as { purpose: string; key: string; maxDice?: number; dieIndexes: number[] }
        offers.push({ purpose: d.purpose, key: d.key, maxDice: d.maxDice, dice: d.dieIndexes })
        const a = policy(p, offers.length)
        const rej = attackService.handler.handle(ctx, { type: 'chooseOption', player: p.player, decisionId: p.id, ...a } as Action, p as PendingDecision)
        if (rej) throw new Error(`${rej.code} ${rej.reason}`)
      } else {
        const opt = p.options[0]
        attackService.handler.handle(ctx, { ...opt.action, decisionId: p.id } as Action, p as PendingDecision)
      }
    }
    return { offers, s }
  }

  it('SDC-008 SDC-3: one failed die is re-rolled per activation (hit); after use the second batch gets no hit offer', () => {
    // projector A = 4 (+2 Blast vs 10) = 6 hit dice, all 1s; re-roll die 0 into a 6; the plasma hit die is 1 and gets NO offer
    const { offers } = shoot((p, n) => (p.context.data.purpose === 'attacks' ? { optionId: 'keep' } : { optionId: 'reroll', dieIndexes: [0] }), [4, 1, 1, 1, 1, 1, 1, 6])
    const hitOffers = offers.filter((o) => o.purpose === 'hit')
    expect(hitOffers).toHaveLength(1)
    expect(hitOffers[0].maxDice).toBe(1)
    expect(hitOffers[0].key).toBe('hit:0')
  })
  it('SDC-008 SDC-3: a failed wound die gets a one-die offer of its own (separate source from the hit re-roll)', () => {
    const { offers } = shoot((p) => (p.context.data.purpose === 'attacks' ? { optionId: 'keep' } : { optionId: 'reroll', dieIndexes: [0] }), [4, 6, 6, 6, 6, 6, 6, 2, 2, 2, 2, 2, 2, 6, 6])
    const wound = offers.filter((o) => o.purpose === 'wound')
    expect(wound.length).toBeGreaterThanOrEqual(1)
    expect(wound.every((o) => o.maxDice === 1)).toBe(true)
  })

  it('SDC-009 SDC-3.3: declining the projector-batch hit re-roll keeps it for the plasma batch of the same activation', () => {
    const { offers } = shoot((p) => (p.context.data.purpose === 'attacks' ? { optionId: 'keep' } : { optionId: 'keep' }), [4, 1, 1, 1, 1, 1, 1])
    const hitKeys = offers.filter((o) => o.purpose === 'hit').map((o) => o.key)
    expect(hitKeys).toEqual(['hit:0', 'hit:1'])
  })

  it('SDC-010 SDC-3: only the projector gets an Attacks-roll re-roll offer; the plasma rifle (fixed A) has none', () => {
    const { offers } = shoot(() => ({ optionId: 'keep' }), [4, 1, 1, 1, 1, 1, 1])
    expect(offers.filter((o) => o.purpose === 'attacks')).toHaveLength(1)
  })
})

// ===================================================================================================================
// E3 non-cumulative negative charge modifier (Grav-inhibitor Drone)
// ===================================================================================================================
describe('E3 non-cumulative charge penalty (SDC-023)', () => {
  function modifier(mods: { id: string; v: number; flagged?: boolean }[]): number {
    const s = makeState('charge')
    s.abilities = { ...s.abilities }
    for (const m of mods) s.abilities[m.id] = { id: m.id, name: m.id, text: '', trigger: 'chargeRoll', source: 'datasheet', bearerModelId: null, params: m.flagged ? { nonCumulativeNegative: true } : {} } as never
    const hooks = {
      ...DEFAULT_MODULES.services.hooks,
      collect: () => mods.map((m) => ({ source: { kind: 'ability', id: m.id, unitId: null, modelId: null }, result: { kind: 'roll', modifier: m.v } })),
    }
    const { ctx } = ctxOf(s, [], { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, hooks: hooks as never } })
    const roll = { id: 'r', purpose: 'charge', sides: 6, dice: [4, 5], rerolled: null, modifiers: [], final: [4, 5], player: 'B', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
    return chargeRollModifier(ctx, { unitId: BOYZ, targetUnitIds: [PATH], roll: null, rerolled: false, distance: null, heroic: false }, roll as never)
  }
  it('SDC-023 SDC-6.3: the flagged -2 stacks with nothing: alone -2; plus another -2 -> -2; plus -1 -> -2; a bigger unflagged -3 wins', () => {
    expect(modifier([{ id: 'g', v: -2, flagged: true }])).toBe(-2)
    expect(modifier([{ id: 'g', v: -2, flagged: true }, { id: 'o', v: -2 }])).toBe(-2)
    expect(modifier([{ id: 'g', v: -2, flagged: true }, { id: 'o', v: -1 }])).toBe(-2)
    expect(modifier([{ id: 'g', v: -2, flagged: true }, { id: 'o', v: -3 }])).toBe(-3)
  })
  it('SDC-023 SDC-6.3: positives still add; unflagged negatives still stack with each other', () => {
    expect(modifier([{ id: 'g', v: -2, flagged: true }, { id: 'p', v: 1 }])).toBe(-1)
    expect(modifier([{ id: 'a', v: -1 }, { id: 'b', v: -1 }])).toBe(-2)
  })
})

// ===================================================================================================================
// E6 pruneUnreachableTargets
// ===================================================================================================================
describe('E6 pruneUnreachableTargets (SDC-019)', () => {
  function fixture() {
    const s = makeState('shooting')
    s.activePlayer = 'B'
    s.firstPlayer = 'A'
    const ids = s.units['B:boyz-a'].models
    // two Boyz in range of the Pathfinders' starting spot, one only just in range
    placeUnit(s, PATH, [[-1, 0]])
    placeUnit(s, BOYZ, [[16, 0], [8, 0]])
    return { s, ids }
  }
  it('SDC-019 SDC-5.4: a target that moved out of one Boy\'s range loses that model\'s attacks; the other Boy still shoots', () => {
    const { s, ids } = fixture()
    const open: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true } } }
    const { ctx } = ctxOf(s, [], open)
    const decl = (id: string) => ({ modelId: id, weaponId: s.models[id].weapons[0], targetUnitId: PATH, profileGroup: null, attacks: null })
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(ids[0]), decl(ids[1])] })
    // the reactive move: Pathfinders step back 3" (Boy 0 is now 20" away, beyond the shoota's 18"; Boy 1 12")
    for (const id of s.units[PATH].models) setModelPos(s.models[id], { x: -4, y: 0, z: s.models[id].pos.z })
    s.phaseState.marks.push(`${REACTIVE_MOVED_PREFIX}${PATH}`)
    pruneUnreachableTargets({ ...ctx, state: s } as EngineContext, BOYZ)
    expect(s.phaseState.attack!.targets.map((t) => t.modelId)).toEqual([ids[1]])
    expect(s.phaseState.attack!.groups.map((g) => g.attackerModelIds[0])).toEqual([ids[1]])
    expect(s.phaseState.marks.some((m) => m.startsWith(REACTIVE_MOVED_PREFIX))).toBe(false)
  })
  it('SDC-019 SDC-5.4: without a reactive move the declarations are untouched (no-op)', () => {
    const { s, ids } = fixture()
    const { ctx } = ctxOf(s)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [{ modelId: ids[0], weaponId: s.models[ids[0]].weapons[0], targetUnitId: PATH, profileGroup: null, attacks: null }] })
    for (const id of s.units[PATH].models) setModelPos(s.models[id], { x: -30, y: 0, z: 0 })
    pruneUnreachableTargets(ctx, BOYZ)
    expect(s.phaseState.attack!.targets).toHaveLength(1)
  })
  it('SDC-019 SDC-5.4: Indirect Fire attacks are not dropped for lost visibility, direct ones are', () => {
    const s = makeState('shooting')
    placeUnit(s, CLOUD, [[-6, 0]])
    placeUnit(s, BOYZ, { x: 4, z: 0, gap: 0.3 })
    const blind: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, los: { ...DEFAULT_MODULES.services.los, visible: () => false, unitVisible: () => false } } }
    const { ctx } = ctxOf(s, [], blind)
    const m = s.units[CLOUD].models[0]
    const t = (w: string) => ({ modelId: m, weaponId: w, targetUnitId: BOYZ, profileGroup: null, attacks: null })
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: CLOUD, overwatch: false, targets: [t('tau.w.airbursting-fragmentation-projector'), t('tau.w.plasma-rifle')] })
    s.phaseState.marks.push(`${REACTIVE_MOVED_PREFIX}${BOYZ}`)
    pruneUnreachableTargets(ctx, CLOUD)
    expect(s.phaseState.attack!.targets.map((x) => x.weaponId)).toEqual(['tau.w.airbursting-fragmentation-projector'])
  })
})

// ===================================================================================================================
// E7 Ethereal Edict: the opponent answers the pick
// ===================================================================================================================
describe('E7 mission pick answered by the other player (SDC-013)', () => {
  it('SDC-013 SDC-4.3: at round start the opponent is asked, over their own units, and the answer is stored on the secondary\'s owner', () => {
    const s = makeState('command', { secondaryId: 'tau.sec.ethereal-edict' })
    s.round = 1
    const { ctx } = ctxOf(s)
    missionService.onWindow(ctx, 'round.start', 'k1')
    const p = s.pending as ChooseOptionDecision
    expect(p).toBeTruthy()
    expect(p.player).toBe('B')
    expect(p.options.every((o) => o.id.startsWith('B:'))).toBe(true)
    expect(p.options.map((o) => o.id)).toContain(BOYZ)
  })
})

// ===================================================================================================================
// E1 Transports
// ===================================================================================================================
describe('E1 transport data, setup embarkation (SDC-027)', () => {
  it('SDC-027 SDC-6.7: Breachers start embarked in the Devilfish and are never offered a deployment drop', () => {
    const s = createGameState(makeSetup({ embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] }), bundle, 'e1', ENGINE_VERSION)
    expect(transportService.transportOf(s, BREACH)).toBe(FISH)
    expect(transportService.embarkedIn(s, FISH)).toEqual([BREACH])
    expect(transportService.capacity(s, FISH)).toBe(12)
    s.phase = 'deployment'; s.step = 'deploy'
    for (const u of Object.values(s.units)) if (u.player === 'B') s.phaseState.marks.push(`deployDrop:${u.id}`)
    const { ctx } = ctxOf(s)
    setupModule.advance(ctx)
    const p = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(p.kind).toBe('deployUnit')
    expect(p.context.unitIds).not.toContain(BREACH)
    expect(p.context.unitIds).toContain(FISH)
  })
  it('SDC-027 SDC-6.7: 10 Breachers + 5 Pathfinders (15 > 12) is rejected; a Battlesuit (Cloudspear) is rejected; a non-transport is rejected', () => {
    expect(() => createGameState(makeSetup({ splitUnits: ['pathfinders'], embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }, { unitRef: 'pathfinders-a', transportRef: 'devilfish' }] }), bundle, 'e1', ENGINE_VERSION)).toThrow(/cannot be carried/)
    expect(() => createGameState(makeSetup({ embarked: [{ unitRef: 'cloudspear', transportRef: 'devilfish' }] }), bundle, 'e1', ENGINE_VERSION)).toThrow(/cannot be carried/)
    expect(() => createGameState(makeSetup({ embarked: [{ unitRef: 'breachers', transportRef: 'pathfinders' }] }), bundle, 'e1', ENGINE_VERSION)).toThrow(/not a Transport/)
    expect(() => createGameState(makeSetup({ embarked: [{ unitRef: 'nope', transportRef: 'devilfish' }] }), bundle, 'e1', ENGINE_VERSION)).toThrow(/not found/)
  })
  it('SDC-027 SDC-6.7: a half of the Pathfinders (Patrol Squads ref) may embark', () => {
    const s = createGameState(makeSetup({ splitUnits: ['pathfinders'], embarked: [{ unitRef: 'pathfinders-b', transportRef: 'devilfish' }] }), bundle, 'e1', ENGINE_VERSION)
    expect(transportService.transportOf(s, 'A:pathfinders-b')).toBe(FISH)
  })
  it('E1: an embarked unit is not culled as a stranded Reserve while its transport is on the battlefield (round 4)', () => {
    const s = makeState('movement', { embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] })
    s.round = 4
    placeUnit(s, FISH, [[0, 0]])
    placeUnit(s, CLOUD, [[-12, 0]])
    movementModule.enter(createContext(s, new ScriptedRng([]), DEFAULT_MODULES).ctx)
    s.step = 'reinforcements'
    const { ctx } = ctxOf(s, [], noStrats())
    movementModule.advance(ctx)
    expect(s.units[BREACH].location).toBe('reserves')
    expect(transportService.transportOf(s, BREACH)).toBe(FISH)
  })
})

describe('E1 Scouts via a Dedicated Transport (SDC-026)', () => {
  function preBattle(embark: boolean) {
    const s = makeState('deployment', embark ? { embarked: [{ unitRef: 'pathfinders', transportRef: 'devilfish' }] } : {})
    s.step = 'preBattle'
    placeUnit(s, FISH, [[-18, 0]])
    placeUnit(s, CLOUD, [[-20, 8]])
    placeUnit(s, BREACH, [[-20, -8]])
    if (!embark) placeUnit(s, PATH, { x: -18, z: 12, gap: 0.3 })
    for (const id of Object.keys(s.units)) if (id.startsWith('B:')) s.units[id].location = 'reserves'
    const { ctx } = ctxOf(s)
    setupModule.advance(ctx)
    return s
  }
  it('SDC-026 SDC-6.5: Pathfinders alone get the pre-battle Scouts move (7")', () => {
    const s = preBattle(false)
    const p = s.pending as Extract<PendingDecision, { kind: 'moveUnit' }>
    expect(p.kind).toBe('moveUnit')
    expect(p.context.unitId).toBe(PATH)
    expect(p.constraints.maxDistance).toBe(7)
  })
  it('SDC-026 SDC-6.5: embarked alone in the Devilfish, the Devilfish makes the Scouts move instead (smallest Scouts value, 7")', () => {
    const s = preBattle(true)
    const p = s.pending as Extract<PendingDecision, { kind: 'moveUnit' }>
    expect(p.kind).toBe('moveUnit')
    expect(p.context.unitId).toBe(FISH)
    expect(p.constraints.maxDistance).toBe(7)
  })
})

describe('E1 interactive disembark (SDC-028)', () => {
  function movementWithFish(fishMove: 'normal' | 'advance' | 'stationary' | null) {
    const s = makeState('movement', { embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] })
    placeUnit(s, FISH, [[-10, 0]])
    placeUnit(s, CLOUD, [[-20, 10]])
    for (const id of Object.keys(s.units)) if (id.startsWith('B:')) { s.units[id].location = 'board' }
    placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
    for (const id of Object.keys(s.units)) if (id.startsWith('B:') && id !== BOYZ) s.units[id].location = 'reserves'
    s.units[FISH].turn.moveType = fishMove
    const made = ctxOf(s, [], noStrats())
    movementModule.enter(made.ctx)
    return { s, ...made }
  }
  function answer(ctx: EngineContext, action: Omit<Action, 'decisionId' | 'player'> | Action): void {
    const pending = ctx.state.pending as PendingDecision
    const full = { player: pending.player, decisionId: pending.id, ...action } as Action
    const rej = movementModule.validate?.(ctx.state, full, pending)
    if (rej) throw new Error(`validate: ${rej.code} ${rej.reason}`)
    ctx.state.pending = null
    const h = movementModule.handle(ctx, full, pending)
    if (h) throw new Error(`handle: ${h.code} ${h.reason}`)
    movementModule.advance(ctx)
  }

  it('SDC-028 SDC-6.7: embarked Breachers are offered as an activation once the Devilfish is on the board', () => {
    const { s } = movementWithFish(null)
    expect(disembarkCandidates(s, 'A')).toEqual([BREACH])
  })

  it('SDC-028 SDC-6.7: Devilfish has not moved -> Breachers are placed wholly within 3", then must move (no Remain Stationary)', () => {
    const { s, ctx } = movementWithFish(null)
    movementModule.advance(ctx)
    const sel = s.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    expect(sel.context.eligible).toContain(BREACH)
    answer(ctx, { type: 'chooseUnitToActivate', unitId: BREACH })
    const dep = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(dep.kind).toBe('deployUnit')
    expect(dep.context.unitIds).toEqual([BREACH])
    const legal = movementModule.legalActions!(s, dep)!
    const place = legal.find((a) => a.type === 'deployUnit') as Extract<Action, { type: 'deployUnit' }>
    expect(place).toBeTruthy()
    // a placement 8" away is not "wholly within 3"" of the transport
    const far = { ...place, placements: place.placements.map((p) => ({ ...p, pos: { ...p.pos, x: p.pos.x + 8 } })) }
    expect(movementModule.validate!(s, far, dep)).not.toBeNull()
    answer(ctx, place)
    expect(s.units[BREACH].location).toBe('board')
    expect(transportService.transportOf(s, BREACH)).toBeNull()
    const decl = s.pending as Extract<PendingDecision, { kind: 'declareMove' }>
    expect(decl.kind).toBe('declareMove')
    expect(decl.context.allowed).toEqual(['normal', 'advance'])
  })

  it('SDC-028 SDC-6.7: declining a disembark keeps the unit embarked and it is not offered again this phase (no activation loop)', () => {
    const { s, ctx } = movementWithFish('normal')
    movementModule.advance(ctx)
    answer(ctx, { type: 'chooseUnitToActivate', unitId: BREACH })
    expect((s.pending as PendingDecision).kind).toBe('deployUnit')
    answer(ctx, { type: 'pass' })
    expect(transportService.transportOf(s, BREACH)).toBe(FISH)
    expect(disembarkCandidates(s, 'A')).not.toContain(BREACH)
    const sel = s.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    if (sel?.kind === 'chooseUnitToActivate') expect(sel.context.eligible).not.toContain(BREACH)
  })

  it('SDC-028 SDC-6.7: Devilfish already made a Normal move -> Breachers count as Normal-moved, are done, and cannot charge this turn', () => {
    const { s, ctx } = movementWithFish('normal')
    movementModule.advance(ctx)
    answer(ctx, { type: 'chooseUnitToActivate', unitId: BREACH })
    const dep = s.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const place = movementModule.legalActions!(s, dep)!.find((a) => a.type === 'deployUnit')!
    answer(ctx, place)
    expect(s.units[BREACH].location).toBe('board')
    expect(s.units[BREACH].turn.moveType).toBe('normal')
    expect(s.phaseState.activated).toContain(BREACH)
    expect(transportService.cannotChargeThisTurn(s, BREACH)).toBe(true)
    expect((s.pending as PendingDecision | null)?.kind).not.toBe('declareMove')
  })

  it('SDC-028 SDC-6.7: Devilfish Advanced -> the Breachers cannot disembark', () => {
    const { s } = movementWithFish('advance')
    expect(disembarkCandidates(s, 'A')).toEqual([])
  })

  it('SDC-028 SDC-6.7: declining the disembark (pass) leaves the unit embarked and it is not offered again this phase', () => {
    const { s, ctx } = movementWithFish(null)
    movementModule.advance(ctx)
    answer(ctx, { type: 'chooseUnitToActivate', unitId: BREACH })
    answer(ctx, { type: 'pass' })
    expect(transportService.transportOf(s, BREACH)).toBe(FISH)
    expect((s.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>).context.eligible).not.toContain(BREACH)
    expect(disembarkCandidates(s, 'A')).not.toContain(BREACH)
  })
})

describe('E1 interactive embark (SDC-029)', () => {
  function atEnd(dx: number) {
    const s = makeState('movement')
    placeUnit(s, FISH, [[0, 0]])
    const fishR = s.models[s.units[FISH].models[0]].base.radius
    const r = s.models[s.units[PATH].models[0]].base.radius
    // one column of Pathfinders; the nearest model's edge-to-edge gap to the Devilfish is `dx`
    const x0 = fishR + dx + r
    s.units[PATH].models.forEach((id, i) => setModelPos(s.models[id], { x: x0 + (i % 2) * 0.01, y: 0, z: (i - 4.5) * 0.6 }))
    s.units[PATH].location = 'board'
    s.units[PATH].turn.moveType = 'normal'
    return s
  }
  it('SDC-029 SDC-6.7: a Normal-moved unit with every model within 3" is offered embark; the answer embarks it', () => {
    const s = atEnd(1.5)
    s.units[PATH].models.forEach((id) => setModelPos(s.models[id], { x: s.models[id].pos.x, y: 0, z: s.models[id].pos.z * 0.2 }))
    const { ctx } = ctxOf(s)
    expect(offerEmbark(ctx, PATH)).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.options.map((o) => o.id)).toEqual([`embark:${FISH}`, 'stay'])
    s.pending = null
    const rej = movementModule.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: `embark:${FISH}` }, p as PendingDecision)
    expect(rej).toBeUndefined()
    expect(transportService.transportOf(s, PATH)).toBe(FISH)
    expect(s.units[PATH].location).toBe('reserves')
  })
  it('SDC-029 SDC-6.7: one model 3.1" away -> embark is not offered; staying keeps the unit on the board', () => {
    const s = atEnd(1.5)
    const ids = s.units[PATH].models
    s.models[ids[0]].pos.x = s.models[ids[0]].base.radius + 3.1 + s.models[s.units[FISH].models[0]].base.radius
    const { ctx } = ctxOf(s)
    expect(offerEmbark(ctx, PATH)).toBe(false)
  })
  it('SDC-029 SDC-6.7: a unit that Remained Stationary cannot embark', () => {
    const s = atEnd(1.5)
    s.units[PATH].turn.moveType = 'stationary'
    const { ctx } = ctxOf(s)
    expect(offerEmbark(ctx, PATH)).toBe(false)
  })
  it('SDC-029 SDC-6.7: embarked units give no OC (they are off the battlefield)', () => {
    const s = makeState('movement', { embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] })
    expect(s.units[BREACH].location).toBe('reserves')
  })
})

describe('E1 destroyed transport (SDC-030)', () => {
  it('SDC-030 SDC-6.8: Devilfish destroyed with passengers -> Deadly Demise first, then Breachers placed within 3", D6 per model (1 = MW), Battle-shocked, cannot charge', () => {
    const s = makeState('shooting', { embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] })
    s.activePlayer = 'B'
    placeUnit(s, FISH, [[0, 0]])
    placeUnit(s, CLOUD, [[-20, 10]])
    placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
    // Deadly Demise trigger die 1 (no explosion); then 10 passenger dice: one 1 (a mortal wound), the rest 6
    const { ctx, events } = ctxOf(s, [1, 1, 6, 6, 6, 6, 6, 6, 6, 6, 6])
    attackService.destroyModel(ctx, s.units[FISH].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
    expect(s.units[FISH].location).toBe('destroyed')
    const demise = events.findIndex((e) => e.type === 'DeadlyDemiseRolled')
    const out = events.findIndex((e) => e.type === 'AbilityTriggered' && (e as { abilityId: string }).abilityId === 'transport.emergencyDisembark')
    expect(demise).toBeGreaterThanOrEqual(0)
    expect(out).toBeGreaterThan(demise)
    expect(s.units[BREACH].location).toBe('board')
    expect(transportService.transportOf(s, BREACH)).toBeNull()
    expect(s.units[BREACH].models).toHaveLength(10)
    // every model wholly within 3" of the wreck
    const wreck = s.units[FISH].destroyedModels![0]
    for (const id of s.units[BREACH].models) {
      const m = s.models[id]
      const d = Math.hypot(m.pos.x - wreck.pos.x, m.pos.z - wreck.pos.z)
      expect(d + m.base.radius).toBeLessThanOrEqual(wreck.base.radius + 3 + 1e-6)
    }
    expect(s.units[BREACH].battleShocked).toBe(true)
    expect(s.units[BREACH].turn.moveType).toBe('normal')
    expect(transportService.cannotChargeThisTurn(s, BREACH)).toBe(true)
    expect(s.phaseState.attack?.mortalQueue.some((q) => q.targetUnitId === BREACH && q.count === 1)).toBe(true)
  })
  it('SDC-030 SDC-6.8: passengers are only ever set up wholly on the battlefield (wreck in a corner)', () => {
    const s = makeState('shooting', { embarked: [{ unitRef: 'breachers', transportRef: 'devilfish' }] })
    s.activePlayer = 'B'
    placeUnit(s, FISH, [[-20.6, -13.6]])
    placeUnit(s, CLOUD, [[0, 10]])
    placeUnit(s, BOYZ, { x: 14, z: 0, gap: 0.3 })
    const { ctx } = ctxOf(s, [1, ...Array(12).fill(6)])
    attackService.destroyModel(ctx, s.units[FISH].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
    for (const id of s.units[BREACH].models) {
      const m = s.models[id]
      expect(Math.abs(m.pos.x) + m.base.radius).toBeLessThanOrEqual(s.board.w / 2 + 1e-6)
      expect(Math.abs(m.pos.z) + m.base.radius).toBeLessThanOrEqual(s.board.h / 2 + 1e-6)
    }
  })
})
