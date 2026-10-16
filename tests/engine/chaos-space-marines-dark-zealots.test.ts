// Chaos Space Marines: Dark Zealots (docs/spec/factions/chaos-space-marines--dark-zealots.md, checklist DZE-*). Engine hooks only:
// the late Dark Pact test, Hateful Exhortation, Champion of the Dark Gods, and the patrol army-rule override.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState, removeModel,
  type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup,
  type Action, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup, type RollContext, type Services, type UseStratagemAction,
  type WeaponTarget, setModelPos,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { fightModule } from '../../src/engine/phases/fight'
import { shootingModule } from '../../src/engine/phases/shooting'
import { stratagemService } from '../../src/engine/stratagems'
import { effectService } from '../../src/engine/effects'
import { fightOnDeathThreshold, grantFightOnDeath, isDeferredDead } from '../../src/engine/fight-on-death'
import { leaderService } from '../../src/engine/leaders'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { championOfTheDarkGodsAmount } from '../../src/engine/factions/chaos-space-marines'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DZ = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Chaos', faction: 'chaos-space-marines', patrolId: 'csm.cp.dark-zealots', enhancementId: 'csm.e.hateful-exhortation',
  secondaryId: 'csm.sec.champion-of-the-dark-gods', attachments: [{ leaderRef: 'ghallaron', bodyguardRef: 'legionaries' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const GHA = 'A:ghallaron', LEG = 'A:legionaries', HAV = 'A:havocs', HEL = 'A:helbrute'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'
const DPDZ = 'csm.a.dark-pacts-dz'

function makeState(o: { a?: Partial<PlayerSetup>; b?: PlayerSetup; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DZ(o.a), B: o.b ?? ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'dz', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}
const SPOTS: Record<string, { x: number; z: number; gap?: number }> = {
  [LEG]: { x: -12, z: -3, gap: 0.3 }, [GHA]: { x: -12, z: -7, gap: 0.3 }, [HAV]: { x: -12, z: -12, gap: 0.3 }, [HEL]: { x: -3, z: -12 },
  [BOYZ]: { x: -6, z: 8, gap: 0.3 }, [BOYZ2]: { x: -6, z: 13, gap: 0.3 },
}
function deploy(s: GameState, ...ids: string[]): void { for (const id of ids) placeUnit(s, id, SPOTS[id]) }
function ctxOf(s: GameState, dice: number[] = []) { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
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
function skipWaaagh(ctx: EngineContext): void { if (ctx.state.pending?.kind === 'chooseOption' && ctx.state.pending.options.some((o) => o.id === 'wait')) answerOption(ctx, 'wait') }
const queued = (s: GameState) => s.phaseState.attack?.mortalQueue.map((q) => q.count) ?? []
function rollOf(unmodified: number, purpose: DiceRoll['purpose'] = 'wound'): RollContext {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function attackCtx(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
const critAp = (ctx: EngineContext, s: GameState, attacker: string, target: string): number => {
  const modelId = s.units[attacker].models.find((id) => s.models[id].weapons.some((w) => w.includes('boltgun'))) as string
  const weaponId = s.models[modelId].weapons.find((w) => w.includes('boltgun')) as string
  return hookService.collect(ctx, 'onWoundRoll', { attack: attackCtx(s, modelId, weaponId, target), roll: rollOf(6) })
    .reduce((n, r) => n + ((r.result as { critWoundAp?: number }).critWoundAp ?? 0), 0)
}

describe('Dark Pacts, late test (DZE-2.x)', () => {
  it('DZE-004 DZE-2.1: Havocs selected to shoot -> lethal / sustained / decline; decline rolls nothing, now or later', () => {
    const s = makeState()
    deploy(s, HAV, BOYZ)
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', HAV)).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id).sort()).toEqual(['decline', 'lethal', 'sustained'])
    answerOption(ctx, 'decline')
    expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', HAV)).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('DZE-005 DZE-2.2: making the Pact rolls no Leadership test at selection; the unit gains the ability anyway', () => {
    const s = makeState()
    deploy(s, HAV, BOYZ)
    const { ctx, events } = ctxOf(s, []) // an empty script throws on any die
    hookService.offerPicks(ctx, 'shooting.unitSelected', HAV)
    answerOption(ctx, 'sustained')
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership'))).toBe(false)
    expect(s.phaseState.marks.some((m) => m.startsWith(`pactTestDue:${HAV}:`))).toBe(true)
    const m = s.units[HAV].models[0]
    const w = s.models[m].weapons.find((x) => x.includes('heavy-bolter')) ?? s.models[m].weapons[0]
    expect(hookService.weaponAbilitiesFor!(s, m, s.weapons[w]).map((a) => a.ability)).toContain('SUSTAINED_HITS')
  })

  it('DZE-006 DZE-2.3: Ld test at shooting.attacksResolved; fail -> D3 mortal wounds queued, pass -> none', () => {
    for (const [dice, expected] of [[[1, 1, 4], [2]], [[6, 6], []]] as const) {
      const s = makeState()
      deploy(s, HAV, BOYZ)
      const { ctx, events } = ctxOf(s, [...dice])
      hookService.offerPicks(ctx, 'shooting.unitSelected', HAV)
      answerOption(ctx, 'lethal')
      expect(queued(s)).toEqual([])
      expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', HAV)).toBe(false) // never raises a decision
      expect(queued(s)).toEqual(expected)
      expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership test'))).toBe(true)
      expect(hookService.offerPicks(ctx, 'shooting.attacksResolved', HAV)).toBe(false) // the test happens once
    }
  })

  it('DZE-007 DZE-2.3: Helbrute in the Fight phase tests at fight.attacksResolved; attached Ghallaron unit tests as one unit', () => {
    const s = makeState({ phase: 'fight' })
    deploy(s, HEL, BOYZ)
    const { ctx } = ctxOf(s, [1, 1, 5])
    hookService.offerPicks(ctx, 'fight.unitSelected', HEL)
    answerOption(ctx, 'lethal')
    hookService.offerPicks(ctx, 'fight.attacksResolved', HEL)
    expect(queued(s)).toEqual([3])

    const s2 = makeState({ phase: 'fight' })
    deploy(s2, GHA, LEG, BOYZ)
    const { ctx: c2, events } = ctxOf(s2, [3, 4]) // 7 vs best Ld 5
    hookService.offerPicks(c2, 'fight.unitSelected', GHA)
    answerOption(c2, 'sustained')
    hookService.offerPicks(c2, 'fight.attacksResolved', LEG) // keyed by either half
    expect(queued(s2)).toEqual([])
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Ld 5') && e.summary.includes('passed'))).toBe(true)
  })

  it('DZE-008 DZE-2.3: a unit wiped out before the test is not tested and nothing throws', () => {
    const s = makeState()
    deploy(s, HAV, BOYZ)
    const { ctx } = ctxOf(s, [])
    hookService.offerPicks(ctx, 'shooting.unitSelected', HAV)
    answerOption(ctx, 'lethal')
    for (const id of [...s.units[HAV].models]) removeModel(s, id)
    expect(() => hookService.offerPicks(ctx, 'shooting.attacksResolved', HAV)).not.toThrow()
    expect(queued(s)).toEqual([])
    expect(s.phaseState.marks.some((m) => m.startsWith('pactTestDue:'))).toBe(false)
  })
})

describe('Hateful Exhortation (DZE-3.1)', () => {
  it('DZE-010 DZE-3.1: round-1 pick of an enemy unit, once; a Legionary critical wound vs it improves AP by 1, vs another unit not', () => {
    const s = makeState({ round: 1, phase: 'command' })
    deploy(s, GHA, LEG, BOYZ, BOYZ2)
    const { ctx } = ctxOf(s, [])
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(true)
    skipWaaagh(ctx)
    const ids = pendingOption(s).options.map((o) => o.id)
    expect(ids).toContain(BOYZ)
    expect(ids).toContain(BOYZ2)
    answerOption(ctx, BOYZ)
    expect(s.players.A.secondaryState.hatefulTarget).toBe(BOYZ)
    expect(hookService.offerPicks(ctx, 'round.start', '1')).toBe(false)
    expect(critAp(ctx, s, LEG, BOYZ)).toBe(1)
    expect(critAp(ctx, s, LEG, BOYZ2)).toBe(0)
  })

  it('DZE-010 DZE-3.1: never offered after round 1', () => {
    const s = makeState({ round: 2, phase: 'command' })
    deploy(s, GHA, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    hookService.offerPicks(ctx, 'round.start', '2')
    if (s.pending) answerOption(ctx, 'wait') // the Ork Waaagh! call
    expect(s.pending).toBeNull()
  })

  it('DZE-011 DZE-3.1: the bonus stops once Ghallaron is destroyed', () => {
    const s = makeState({ round: 1, phase: 'command' })
    deploy(s, GHA, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    hookService.offerPicks(ctx, 'round.start', '1')
    skipWaaagh(ctx)
    answerOption(ctx, BOYZ)
    expect(critAp(ctx, s, LEG, BOYZ)).toBe(1)
    const ghallaron = s.units[GHA].models.find((id) => s.models[id].datasheetModelId === 'ghallaron') as string
    removeModel(s, ghallaron)
    expect(critAp(ctx, s, LEG, BOYZ)).toBe(0)
  })
})

describe('Champion of the Dark Gods (DZE-4.1)', () => {
  const rule = () => bundle.patrols['csm.cp.dark-zealots'].secondaries.find((x) => x.id === 'csm.sec.champion-of-the-dark-gods')!.scoring[0]
  it('DZE-013 DZE-4.1: a kill by Ghallaron himself scores 3; a Disciple or Legionary kill alone scores 0; the record resets', () => {
    const s = makeState()
    deploy(s, GHA, LEG)
    const ghallaron = s.units[GHA].models.find((id) => s.models[id].datasheetModelId === 'ghallaron') as string
    const disciple = s.units[GHA].models.find((id) => s.models[id].datasheetModelId === 'disciple') as string
    s.players.A.secondaryState.killsThisPhase = { [disciple]: 2, [s.units[LEG].models[0]]: 1 }
    expect(championOfTheDarkGodsAmount(s, rule(), 'A')).toBe(0)
    s.players.A.secondaryState.killsThisPhase = { [ghallaron]: 1 }
    expect(championOfTheDarkGodsAmount(s, rule(), 'A')).toBe(3)
    expect(championOfTheDarkGodsAmount(s, rule(), 'A')).toBe(0)
  })

  it('DZE-014 DZE-4.1: still scores when Ghallaron died in the same phase; scores again in a later qualifying phase', () => {
    const s = makeState()
    deploy(s, GHA, LEG)
    const ghallaron = s.units[GHA].models.find((id) => s.models[id].datasheetModelId === 'ghallaron') as string
    s.players.A.secondaryState.killsThisPhase = { [ghallaron]: 1 }
    removeModel(s, ghallaron)
    expect(championOfTheDarkGodsAmount(s, rule(), 'A')).toBe(3)
    s.players.A.secondaryState.killsThisPhase = { [ghallaron]: 1 }
    expect(championOfTheDarkGodsAmount(s, rule(), 'A')).toBe(3)
  })

  it('DZE-013 DZE-4.1: wired through the mission service at phase.end', () => {
    const s = makeState()
    deploy(s, GHA, LEG)
    const ghallaron = s.units[GHA].models.find((id) => s.models[id].datasheetModelId === 'ghallaron') as string
    s.players.A.secondaryState.killsThisPhase = { [ghallaron]: 1 }
    const { ctx } = ctxOf(s, [])
    const before = s.players.A.vp
    missionService.onWindow(ctx, 'phase.end', 'shooting')
    expect(s.players.A.vp - before).toBe(3)
  })
})

describe('Patrol army rule (DZE-025)', () => {
  it('DZE-025 C2: the Dark Zealots patrol registers csm.a.dark-pacts-dz', () => {
    const s = makeState()
    expect(bundle.patrols['csm.cp.dark-zealots'].armyRule).toBe(DPDZ)
    expect(s.datasheets[s.units[HAV].datasheetId].abilities).toContain(DPDZ)
    expect(s.abilities[DPDZ]).toBeDefined()
  })
})

// ---------- real phase activations (DZE-006 / DZE-C1) ----------
type PhaseMod = typeof shootingModule
function stepWith(mod: PhaseMod, ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) mod.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = mod.validate ? mod.validate(ctx.state, action, pending) : null
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handler = pending.kind === 'chooseOption' ? hookService.handler
    : pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems
    : pending.kind === 'allocateAttack' ? attackService.handler : mod
  const handled = handler.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason} (${pending.kind})`)
  return mod.advance(ctx)
}
const DID = ''
// default answer: lethal for the Pact, only `weaponMatch` weapons fire, no movement, first option otherwise
function defaultAction(pending: PendingDecision, weaponMatch: string): Action {
  const base = { player: pending.player, decisionId: DID }
  if (pending.kind === 'chooseUnitToActivate') return { type: 'chooseUnitToActivate', ...base, unitId: pending.context.eligible[0] } as Action
  if (pending.kind === 'chooseFightUnit') return { type: 'chooseFightUnit', ...base, unitId: pending.context.eligible.find((u) => u.startsWith('A:')) ?? pending.context.eligible[0] }
  if (pending.kind === 'pileIn') return { type: 'pileIn', ...base, unitId: pending.context.unitId, placements: [] }
  if (pending.kind === 'consolidate') return { type: 'consolidate', ...base, unitId: pending.context.unitId, placements: [] }
  if (pending.kind === 'declareTargets') {
    const targets: WeaponTarget[] = pending.context.weapons.filter((w) => w.legalTargets.length > 0 && (w.weaponId.includes(weaponMatch) || pending.player === 'B')).map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: w.legalTargets[0], ...(pending.context.attackKind === 'melee' && w.attacks ? { attacks: w.attacks } : {}) }))
    return { type: 'declareTargets', ...base, unitId: pending.context.unitId, targets }
  }
  if (pending.kind === 'allocateAttack') return { type: 'allocateAttack', ...base, modelId: pending.options[0].id } as Action
  if (pending.kind === 'chooseOption') return { type: 'chooseOption', ...base, optionId: pending.options.some((o) => o.id === 'lethal') ? 'lethal' : pending.options[0]?.id ?? 'keep' }
  if ('options' in pending && Array.isArray(pending.options) && pending.options.length > 0) return pending.options[0].action
  return { type: 'pass', ...base }
}
// drives until `stop` is true for the pending decision (checked before answering) or the phase reports done
function drivePhase(mod: PhaseMod, ctx: EngineContext, weaponMatch: string, stop: (p: PendingDecision) => boolean): 'stopped' | 'done' {
  for (let i = 0; i < 400; i++) {
    const r = ctx.state.pending ? 'pending' : mod.advance(ctx)
    if (!ctx.state.pending) return r === 'done' ? 'done' : 'done'
    if (stop(ctx.state.pending)) return 'stopped'
    stepWith(mod, ctx, defaultAction(ctx.state.pending, weaponMatch))
  }
  throw new Error('drivePhase: too many steps')
}
const pactDamage = (events: GameEvent[]) => of(events, 'DamageApplied').filter((e) => e.mortal && 'abilityId' in e.source && e.source.abilityId.startsWith(DPDZ))

describe('Late Dark Pact test through a real Shooting activation (DZE-006)', () => {
  it('DZE-006 DZE-2.3: failed test in a real activation -> the D3 mortal wounds apply before the next unit is selected', () => {
    const s = makeState()
    deploy(s, HAV, LEG, BOYZ)
    // eight reaper-chaincannon hit rolls miss (1s), then the Pact test 1+1 fails, then D3 (4 -> 2)
    const { ctx, events } = ctxOf(s, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, ...Array(60).fill(1)])
    shootingModule.enter(ctx)
    expect(drivePhase(shootingModule, ctx, 'reaper', (p) => p.kind === 'chooseUnitToActivate')).toBe('stopped') // first selection
    stepWith(shootingModule, ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: HAV })
    expect(drivePhase(shootingModule, ctx, 'reaper', (p) => p.kind === 'chooseUnitToActivate')).toBe('stopped') // next selection
    expect(pactDamage(events).reduce((n, e) => n + e.amount, 0)).toBe(2)
    expect(s.phaseState.attack).toBeNull()
  })

  it('DZE-006 DZE-2.3: the wounds also apply when the Pact unit is the last to shoot (phase ends)', () => {
    const s = makeState()
    deploy(s, HAV, BOYZ)
    const { ctx, events } = ctxOf(s, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, ...Array(60).fill(1)])
    shootingModule.enter(ctx)
    expect(drivePhase(shootingModule, ctx, 'reaper', (p) => p.kind === 'chooseUnitToActivate')).toBe('stopped')
    stepWith(shootingModule, ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: HAV })
    drivePhase(shootingModule, ctx, 'reaper', (p) => p.kind === 'chooseUnitToActivate' && p.context.eligible.length === 0)
    expect(pactDamage(events).reduce((n, e) => n + e.amount, 0)).toBe(2)
  })
})

describe('Late Dark Pact test through a real Fight activation (DZE-C1)', () => {
  it('DZE-C1 DZE-2.3: failed test after the Helbrute fights -> the mortal wounds are applied before the unit finishes and the next is selected', () => {
    const s = makeState({ phase: 'fight' })
    placeUnit(s, HEL, [[0, 0]])
    placeUnit(s, BOYZ, { x: 2.4, z: 0, gap: 0.3 })
    for (const id of s.units[BOYZ].models.slice(1)) removeModel(s, id) // one Boyz model: its three attacks (the opponent fights first) miss
    // three Boyz misses, five Helbrute misses, Ld 1+1 fails, D3 4 -> 2
    const { ctx, events } = ctxOf(s, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, ...Array(60).fill(1)])
    fightModule.enter(ctx)
    drivePhase(fightModule, ctx, 'hammer', () => s.units[HEL].turn.foughtThisPhase)
    expect(s.units[HEL].turn.foughtThisPhase).toBe(true)
    expect(pactDamage(events).reduce((n, e) => n + e.amount, 0)).toBe(2)
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership test failed'))).toBe(true)
    expect(s.phaseState.attack).toBeNull()
  })
})

// ---------- shared helpers for the remaining rules ----------
type StratWindow = Parameters<typeof stratagemService.options>[2]
function stratHarness(s: GameState) {
  const services: Services = {
    ...DEFAULT_MODULES.services,
    los: { ...DEFAULT_MODULES.services.los, visible: () => true, unitVisible: () => true, fullyVisible: () => true, unitFullyVisible: () => true, benefitOfCover: () => false },
    attack: { ...DEFAULT_MODULES.services.attack, advance: () => 'done' },
    missions: { ...DEFAULT_MODULES.services.missions, onWindow: () => undefined, playerHasForces: () => true, isTabled: () => false },
    objectives: { ...DEFAULT_MODULES.services.objectives, evaluateControl: () => undefined },
  }
  const modules: ModuleTable = { phases: DEFAULT_MODULES.phases, services, topics: DEFAULT_MODULES.topics }
  const made = () => createContext(s, new ScriptedRng([]), modules).ctx
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
const offeredIds = (s: GameState, p: 'A' | 'B', w: StratWindow, id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => [...(x.targets.unitIds ?? []), ...(x.targets.modelIds ?? [])][0])
function driveAttack(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
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
const declared = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = null) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const weaponOf = (s: GameState, modelId: string, part: string) => s.models[modelId].weapons.find((w) => w.includes(part)) as string
const modelOf = (s: GameState, unitId: string, dsModel: string) => s.units[unitId].models.find((id) => s.models[id].datasheetModelId === dsModel) as string
const ES = 'csm.s.empyric-rites', BB = 'csm.s.bitter-blows', MV = 'csm.s.malicious-volleys'

describe('Fire Overwatch and the patrol split (DZE-009)', () => {
  it('DZE-009 DZE-2.1: Fire Overwatch by Legionaries / Havocs raises no Pact prompt and no Leadership test', () => {
    for (const [unit, part] of [[LEG, 'csm.w.boltgun'], [HAV, 'havoc-reaper']] as const) {
      const s = makeState({ phase: 'charge', active: 'B' })
      deploy(s, LEG, HAV, BOYZ)
      placeUnit(s, HAV, { x: -6, z: 0, gap: 0.3 })
      const { ctx, events } = ctxOf(s, Array<number>(60).fill(1))
      const m = s.units[unit].models.find((id) => s.models[id].weapons.some((w) => w.includes(part))) as string
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: true, targets: [declared(m, weaponOf(s, m, part), BOYZ, 1)] })
      driveAttack(ctx)
      expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership'))).toBe(false)
      expect(s.pending).toBeNull()
    }
  })

  it('DZE-009 CHA-003 regression: the Zarkan patrol units still pick and test before attacking', () => {
    const s = makeState({ a: { patrolId: 'csm.cp.zarkans-daemonkin', enhancementId: 'csm.e.foul-zealotry', secondaryId: 'csm.sec.marked-for-execution', attachments: [{ leaderRef: 'zarkan', bodyguardRef: 'possessed' }] } })
    placeUnit(s, 'A:legionaries', { x: -12, z: -3, gap: 0.3 })
    placeUnit(s, BOYZ, SPOTS[BOYZ])
    const { ctx, events } = ctxOf(s, [6, 6])
    expect(hookService.offerPicks(ctx, 'shooting.unitSelected', 'A:legionaries')).toBe(true)
    answerOption(ctx, 'lethal')
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership test'))).toBe(true)
  })
})

describe('Hateful Exhortation marks both halves (DZE-011)', () => {
  it('DZE-011 DZE-3.1: a marked attached enemy unit stays marked on both halves after its leader detaches', () => {
    // the enemy is a second Chaos army so that it has a real attached unit: Zarkan leading the Possessed
    const enemy: PlayerSetup = { ...ORK(), name: 'Rival', faction: 'chaos-space-marines', patrolId: 'csm.cp.zarkans-daemonkin', enhancementId: 'csm.e.foul-zealotry', secondaryId: 'csm.sec.marked-for-execution', attachments: [{ leaderRef: 'zarkan', bodyguardRef: 'possessed' }] }
    const s2 = makeState({ round: 1, phase: 'command', b: enemy })
    const POSS = 'B:possessed', ZARK = 'B:zarkan'
    deploy(s2, GHA, LEG)
    placeUnit(s2, POSS, { x: -6, z: 8, gap: 0.3 })
    placeUnit(s2, ZARK, [[-4, 8]])
    placeUnit(s2, BOYZ2.replace('B:boyz-b', 'B:cultists'), { x: -6, z: 13, gap: 0.3 })
    const { ctx } = ctxOf(s2, [])
    hookService.offerPicks(ctx, 'round.start', '1')
    const opts = pendingOption(s2).options.map((o) => o.id)
    expect(opts.filter((id) => id === POSS || id === ZARK)).toEqual([POSS]) // an attached unit is offered once
    answerOption(ctx, POSS)
    expect(critAp(ctx, s2, LEG, POSS)).toBe(1)
    expect(critAp(ctx, s2, LEG, ZARK)).toBe(1)
    // the Possessed are wiped out: Zarkan detaches and stands alone, but is still marked
    for (const id of [...s2.units[POSS].models]) removeModel(s2, id)
    leaderService.detach(ctx, POSS)
    expect(leaderService.isAttached(s2, ZARK)).toBe(false)
    expect(critAp(ctx, s2, LEG, ZARK)).toBe(1)
    expect(critAp(ctx, s2, LEG, 'B:cultists')).toBe(0)
  })
})

describe('Infernal Blessing (DZE-012)', () => {
  it('DZE-012 DZE-3.2: Ghallaron ignores lost wounds on 5+ (normal and mortal); Disciples and Legionaries get no FNP', () => {
    const s = makeState({ a: { enhancementId: 'csm.e.infernal-blessing' } })
    deploy(s, GHA, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    const shooter = s.units[BOYZ].models[0]
    const weapon = s.models[shooter].weapons.find((w) => s.weapons[w].kind === 'ranged') as string
    const fnp = (modelId: string, mortal: boolean) => hookService.collect(ctx, 'onFeelNoPainRoll', {
      attack: { ...attackCtx(s, shooter, weapon, GHA), targetModelId: modelId }, roll: rollOf(3, 'fnp'), ...(mortal ? { mortal: true } : {}),
    } as never).map((r) => r.result).filter((r) => r.kind === 'roll' && r.feelNoPain !== undefined)
    const ghallaron = modelOf(s, GHA, 'ghallaron'), disciple = modelOf(s, GHA, 'disciple')
    for (const mortal of [false, true]) {
      expect(fnp(ghallaron, mortal)).toEqual([{ kind: 'roll', feelNoPain: 5 }])
      expect(fnp(disciple, mortal)).toEqual([])
      expect(fnp(s.units[LEG].models[0], mortal)).toEqual([])
    }
  })
})

describe('Idolatrous Despoilers (DZE-015)', () => {
  const state = (active: 'A' | 'B') => makeState({ a: { secondaryId: 'csm.sec.idolatrous-despoilers' }, active })
  const turnEnd = (s: GameState) => { const { ctx } = ctxOf(s); missionService.onWindow(ctx, 'turn.end', 'turn') }
  const inZone = (s: GameState, unitId: string, z = 12) => placeUnit(s, unitId, { x: -4, z, gap: 0.4 })

  it('DZE-015 DZE-4.2: end of the opponent turn, a unit wholly in the enemy zone -> +4 VP, flat with two units', () => {
    const s = state('B')
    inZone(s, HAV, 12)
    turnEnd(s)
    expect(s.players.A.vp).toBe(4)
    const t = state('B')
    inZone(t, HAV, 12)
    inZone(t, LEG, 13.5)
    turnEnd(t)
    expect(t.players.A.vp).toBe(4)
  })

  it('DZE-015 DZE-4.2: one model outside the zone, or Battle-shocked -> 0 VP; end of own turn -> 0 VP', () => {
    const s = state('B')
    inZone(s, HAV, 12)
    setModelPos(s.models[s.units[HAV].models[2]], { x: -2, y: 0, z: 9.9 })
    turnEnd(s)
    expect(s.players.A.vp).toBe(0)
    const t = state('B')
    inZone(t, HAV, 12)
    t.units[HAV].battleShocked = true
    turnEnd(t)
    expect(t.players.A.vp).toBe(0)
    const u = state('A')
    inZone(u, HAV, 12)
    turnEnd(u)
    expect(u.players.A.vp).toBe(0)
  })
})

describe('Empyric Rites (DZE-016)', () => {
  const saveInvuln = (s: GameState, ctx: EngineContext, targetUnit: string) => {
    const shooter = s.units[BOYZ].models[0]
    const weapon = s.models[shooter].weapons.find((w) => s.weapons[w].kind === 'ranged') as string
    return hookService.collect(ctx, 'onSaveRoll', { attack: attackCtx(s, shooter, weapon, targetUnit), roll: rollOf(3, 'save') }).map((r) => r.result).filter((r) => r.kind === 'roll' && r.invuln !== undefined)
  }
  const setup = (phase: GameState['phase'], active: 'A' | 'B') => {
    const s = makeState({ phase, active })
    deploy(s, HAV, HEL, BOYZ)
    s.players.A.cp = 3
    return s
  }

  it('DZE-016 DZE-5.1: Havocs targeted in the opponent Shooting phase -> 4+ invulnerable save until the phase ends', () => {
    const s = setup('shooting', 'B')
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', ES, { unitId: BOYZ, targetUnitId: HAV })).toEqual([HAV])
    const h = stratHarness(s)
    const ctx = h.made()
    expect(saveInvuln(s, ctx, HAV)).toEqual([])
    stratagemService.openWindow?.(ctx, 'shooting.targetsDeclared', 'A', 'k', { unitId: BOYZ, targetUnitId: HAV })
    h.useOption(ctx, ES, HAV)
    expect(saveInvuln(s, ctx, HAV)).toEqual([{ kind: 'roll', invuln: 4 }])
    expect(saveInvuln(s, ctx, HEL)).toEqual([])
    effectService.expire(ctx, 'phaseEnd', null)
    expect(saveInvuln(s, ctx, HAV)).toEqual([])
  })

  it('DZE-016 DZE-5.1: not offered for the Helbrute (VEHICLE) or in the own Shooting phase; offered in either Fight phase', () => {
    const s = setup('shooting', 'B')
    expect(offeredIds(s, 'A', 'shooting.targetsDeclared', ES, { unitId: BOYZ, targetUnitId: HEL })).toEqual([])
    const own = setup('shooting', 'A')
    expect(offeredIds(own, 'A', 'shooting.targetsDeclared', ES, { unitId: BOYZ, targetUnitId: HAV })).toEqual([])
    for (const active of ['A', 'B'] as const) {
      const f = setup('fight', active)
      expect(offeredIds(f, 'A', 'fight.targetsDeclared', ES, { unitId: BOYZ, targetUnitId: HAV })).toEqual([HAV])
    }
  })
})

describe('Bitter Blows (DZE-017, DZE-018)', () => {
  const setup = (active: 'A' | 'B' = 'B') => {
    const s = makeState({ phase: 'fight', active })
    deploy(s, LEG, HEL, BOYZ)
    s.players.A.cp = 3
    return s
  }
  const trig = (target: string) => ({ unitId: BOYZ, targetUnitId: target })
  const slay = (s: GameState, modelId: string, d6: number) =>
    attackService.destroyModel(createContext(s, new ScriptedRng([d6]), DEFAULT_MODULES).ctx, modelId, { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'melee' })

  it('DZE-017 DZE-5.2: Legionaries targeted in a Fight phase -> offered; used, a destroyed model on D6 4+ stays (deferred) to fight, on 3 is removed', () => {
    const s = setup()
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', BB, trig(LEG))).toEqual([LEG])
    const h = stratHarness(s)
    const ctx = h.made()
    stratagemService.openWindow?.(ctx, 'fight.targetsDeclared', 'A', 'k', trig(LEG))
    h.useOption(ctx, BB, LEG)
    expect(fightOnDeathThreshold(s, LEG)).toBe(4)
    const [first, second] = s.units[LEG].models
    slay(s, first, 4)
    slay(s, second, 3)
    expect(isDeferredDead(s, first)).toBe(true)
    expect(s.models[second]).toBeUndefined()
  })

  it('DZE-017 DZE-5.2: a unit that already fought gets no offer (so no roll)', () => {
    const s = setup()
    s.units[LEG].turn.foughtThisPhase = true
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', BB, trig(LEG))).toEqual([])
  })

  it('DZE-018 DZE-5.2: not offered for the Helbrute; without the stratagem no model is deferred', () => {
    const s = setup()
    expect(offeredIds(s, 'A', 'fight.targetsDeclared', BB, trig(HEL))).toEqual([])
    const id = s.units[LEG].models[0]
    slay(s, id, 6)
    expect(s.models[id]).toBeUndefined()
  })

  it('DZE-018 DZE-2.4: a deferred model gets no Dark Pact prompt or test', () => {
    const s = setup()
    const { events } = ctxOf(s, [])
    grantFightOnDeath(s, LEG, 4)
    const id = s.units[LEG].models[0]
    slay(s, id, 6)
    expect(isDeferredDead(s, id)).toBe(true)
    expect(s.phaseState.marks.some((m) => m.startsWith('pactTestDue:'))).toBe(false) // nothing owed for the deferred model
    expect(of(events, 'AbilityTriggered').some((e) => e.summary.includes('Leadership'))).toBe(false)
    expect(s.pending).toBeNull()
  })
})

describe('Malicious Volleys (DZE-019, DZE-020)', () => {
  const setup = () => {
    const s = makeState()
    deploy(s, HAV, LEG, HEL, BOYZ)
    s.players.A.cp = 3
    return s
  }
  const hitRerolls = (s: GameState, ctx: EngineContext) => {
    const model = s.units[HAV].models[0]
    const weapon = s.models[model].weapons[0]
    return hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, model, weapon, BOYZ), roll: rollOf(1, 'hit') }).map((r) => (r.result as { reroll?: string }).reroll).filter((r) => r !== undefined)
  }

  it('DZE-019 DZE-5.3: full-strength target -> only hit rolls of 1 re-rolled; Below Half-strength target -> any failed hit re-rolled', () => {
    const s = setup()
    const h = stratHarness(s)
    const ctx = h.made()
    stratagemService.openWindow?.(ctx, 'shooting.start', 'A', 'start', {})
    h.useOption(ctx, MV, HAV)
    expect(hitRerolls(s, ctx)).toEqual(['ones'])
    const boyz = s.units[BOYZ].models
    for (const id of boyz.slice(0, Math.floor(boyz.length / 2) + 1)) removeModel(s, id)
    expect(leaderService.isBelowHalfStrength(s, BOYZ)).toBe(true)
    expect(hitRerolls(s, ctx)).toContain('all')
  })

  it('DZE-020 DZE-5.3: not offered for a unit already selected to shoot, for the Helbrute, or outside the own Shooting phase', () => {
    const s = setup()
    expect(offeredIds(s, 'A', 'shooting.start', MV)).toEqual(expect.arrayContaining([HAV, LEG]))
    expect(offeredIds(s, 'A', 'shooting.start', MV)).not.toContain(HEL)
    s.phaseState.activated.push(HAV)
    expect(offeredIds(s, 'A', 'shooting.start', MV)).not.toContain(HAV)
    const t = setup()
    t.activePlayer = 'B'
    expect(offeredIds(t, 'A', 'shooting.start', MV)).toEqual([])
    const f = makeState({ phase: 'fight' })
    deploy(f, HAV, BOYZ)
    f.players.A.cp = 3
    expect(offeredIds(f, 'A', 'fight.start', MV)).toEqual([])
  })
})

describe('Dark Zealotry (DZE-021)', () => {
  const woundMods = (s: GameState, ctx: EngineContext, unit: string, dsModel: string, weaponPart: string, target = BOYZ) => {
    const model = modelOf(s, unit, dsModel)
    return hookService.collect(ctx, 'onWoundRoll', { attack: attackCtx(s, model, weaponOf(s, model, weaponPart), target), roll: rollOf(3, 'wound') })
      .map((r) => r.result).filter((r) => r.kind === 'roll' && r.modifier !== undefined)
  }

  it('DZE-021 DZE-6.1: attached Ghallaron + Legionaries -> +1 to the melee wound roll (chainsword S4 vs T4 wounds on 3+); ranged unaffected', () => {
    const s = makeState()
    deploy(s, GHA, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    expect(s.weapons[weaponOf(s, modelOf(s, LEG, 'chainsword'), 'astartes-chainsword')].S).toBe(4)
    expect(woundMods(s, ctx, LEG, 'chainsword', 'astartes-chainsword')).toEqual([{ kind: 'roll', modifier: 1 }])
    expect(woundMods(s, ctx, GHA, 'ghallaron', 'crozius')).toEqual([{ kind: 'roll', modifier: 1 }])
    expect(woundMods(s, ctx, GHA, 'disciple', 'disciple-ccw')).toEqual([{ kind: 'roll', modifier: 1 }])
    expect(woundMods(s, ctx, LEG, 'boltgun', 'csm.w.boltgun')).toEqual([])
  })

  it('DZE-021 DZE-6.1: unattached Ghallaron unit -> no bonus; Ghallaron dead (Disciples alive) -> no bonus', () => {
    const lone = makeState({ a: { attachments: [] } })
    deploy(lone, GHA, LEG, BOYZ)
    const c1 = ctxOf(lone, []).ctx
    expect(woundMods(lone, c1, LEG, 'chainsword', 'astartes-chainsword')).toEqual([])
    expect(woundMods(lone, c1, GHA, 'ghallaron', 'crozius')).toEqual([])

    const s = makeState()
    deploy(s, GHA, LEG, BOYZ)
    const { ctx } = ctxOf(s, [])
    const chainsword = modelOf(s, LEG, 'chainsword')
    const before = woundMods(s, ctx, LEG, 'chainsword', 'astartes-chainsword')
    expect(before).toHaveLength(1)
    removeModel(s, modelOf(s, GHA, 'ghallaron'))
    expect(s.models[chainsword]).toBeDefined()
    expect(woundMods(s, ctx, LEG, 'chainsword', 'astartes-chainsword')).toEqual([])
    expect(woundMods(s, ctx, GHA, 'disciple', 'disciple-ccw')).toEqual([])
  })
})

describe('Havoc and plasma weapon rules (DZE-022, DZE-023)', () => {
  const abilityNames = (id: string) => s0().weapons[id].abilities.map((a) => a.ability)
  const s0 = () => makeState()

  it('DZE-022 DZE-6.2: Havoc heavy bolter has no Heavy and Sustained Hits 1; the Legionary heavy bolter keeps Heavy', () => {
    expect(abilityNames('csm.w.havoc-heavy-bolter')).not.toContain('HEAVY')
    const sh = s0().weapons['csm.w.havoc-heavy-bolter'].abilities.find((a) => a.ability === 'SUSTAINED_HITS')
    expect(sh?.value).toBe(1)
    expect(abilityNames('csm.w.heavy-bolter')).toContain('HEAVY')
    for (const id of ['csm.w.havoc-lascannon', 'csm.w.havoc-missile-launcher-frag', 'csm.w.havoc-reaper-chaincannon', 'csm.w.plasma-gun']) expect(abilityNames(id)).not.toContain('HEAVY')
  })

  it('DZE-022 DZE-6.2: a Havoc heavy bolter that stood still gains no +1 to hit', () => {
    const s = makeState()
    deploy(s, HAV, BOYZ)
    const { ctx } = ctxOf(s, [])
    const model = modelOf(s, HAV, 'heavy-bolter')
    const hits = (roll: number) => hookService.collect(ctx, 'onHitRoll', { attack: attackCtx(s, model, weaponOf(s, model, 'havoc-heavy-bolter'), BOYZ), roll: rollOf(roll, 'hit') })
      .map((r) => r.result).filter((r) => r.kind === 'roll' && r.modifier !== undefined)
    s.units[HAV].turn.moveType = 'stationary'
    expect(hits(4)).toEqual([])
  })

  const hitCount = (s: GameState, unit: string, dsModel: string, part: string, dice: number[]) => {
    const { ctx, events } = ctxOf(s, [...dice, ...Array(80).fill(1)])
    const m = modelOf(s, unit, dsModel)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [declared(m, weaponOf(s, m, part), BOYZ)] })
    driveAttack(ctx)
    return of(events, 'HitRolled').length
  }

  it('DZE-023 DZE-6: missile launcher frag Blast adds one attack per 5 models in the target', () => {
    const s = makeState()
    deploy(s, HAV, BOYZ)
    const size = s.units[BOYZ].models.length
    expect(size).toBeGreaterThanOrEqual(5)
    expect(hitCount(s, HAV, 'missile-launcher', 'havoc-missile-launcher-frag', [3])).toBe(3 + Math.floor(size / 5))
  })

  it('DZE-023 DZE-6: plasma gun Rapid Fire 1 adds an attack only at half range; supercharge is Hazardous', () => {
    const far = makeState()
    deploy(far, HAV, BOYZ)
    expect(hitCount(far, HAV, 'champion', 'csm.w.plasma-gun', [])).toBe(1)
    const near = makeState()
    deploy(near, BOYZ)
    placeUnit(near, HAV, { x: -6, z: 0, gap: 0.3 })
    expect(hitCount(near, HAV, 'champion', 'csm.w.plasma-gun', [])).toBe(2)
    expect(abilityNames('csm.w.plasma-gun-supercharge')).toEqual(expect.arrayContaining(['HAZARDOUS', 'RAPID_FIRE']))
  })
})

describe('Stratagem ownership is per patrol (DZE-030)', () => {
  it('DZE-030 mirror: Dark Zealots vs Zarkan offers neither side the other patrol stratagems', () => {
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
      players: {
        A: DZ(),
        B: { name: 'Zarkan', faction: 'chaos-space-marines', patrolId: 'csm.cp.zarkans-daemonkin', enhancementId: 'csm.e.foul-zealotry',
          secondaryId: 'csm.sec.marked-for-execution', attachments: [{ leaderRef: 'zarkan', bodyguardRef: 'possessed' }], reserves: [], battleReadyVp: 0 },
      },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const s = createGameState(setup, bundle, 'dz-mirror', ENGINE_VERSION)
    const dzOnly = ['csm.s.empyric-rites', 'csm.s.bitter-blows', 'csm.s.malicious-volleys']
    const zkOnly = ['csm.s.vindictive-strategy', 'csm.s.violent-unbinding', 'csm.s.daemonic-fervour']
    expect(s.players.A.stratagemIds).toEqual(expect.arrayContaining(dzOnly))
    expect(s.players.A.stratagemIds).not.toEqual(expect.arrayContaining([zkOnly[0]]))
    s.players.A.cp = 5; s.players.B.cp = 5
    const windows = new Set(Object.values(s.stratagems).flatMap((x) => (Array.isArray(x.window) ? x.window : [x.window])))
    for (const w of windows) {
      for (const o of stratagemService.options(s, 'A', w)) expect(zkOnly).not.toContain(o.stratagemId)
      for (const o of stratagemService.options(s, 'B', w)) expect(dzOnly).not.toContain(o.stratagemId)
      expect(stratagemService.usable(s, 'A', w).some((id) => zkOnly.includes(id))).toBe(false)
      expect(stratagemService.usable(s, 'B', w).some((id) => dzOnly.includes(id))).toBe(false)
    }
  })
})
