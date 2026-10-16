// World Eaters engine changes beyond code hooks (docs/spec/factions/world-eaters.md 7.1 C1-C3, checklist WOR-008 / WOR-018 / WOR-019).
// Synthetic fixture data plus throw-away code hooks named like the real ones, so these tests do not depend on the faction module.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState,
  type Action, type EngineContext, type GameEvent, type GameState, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { hookService } from '../../src/engine/hooks-impl'
import { fightModule } from '../../src/engine/phases/fight'
import type { DataBundle } from '../../src/data/types'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems, withBundle } from '../fixtures'

// ---------- C1: Feel No Pain adjusters ----------

// stands in for World Eaters wrathfulDevotion: no FNP -> 6+ with no modifier, otherwise keep the threshold and add +1
const TEST_CODE = 'testAdjustFnp'
const adjuster: EngineCodeHook = {
  name: TEST_CODE, kind: 'ability', hook: 'onFeelNoPainRoll', run: () => undefined,
  adjustFeelNoPain(state, entry, modelId, current) {
    if (state.models[modelId]?.unitId !== entry.holderUnitId) return null
    return current === null ? { threshold: 6, modifier: 0 } : { threshold: current, modifier: 1 }
  },
}
afterEach(() => { delete codeHooks[TEST_CODE] })

type Ability = Exclude<DataBundle['datasheets'][string]['abilities'][number], string>
const ADJ: Ability = { id: 'wor.test.adjust', name: 'Adjust', text: 'Test adjuster.', trigger: 'feelNoPainRoll', code: TEST_CODE }
const plus = (value: number): Ability => ({ id: `wor.test.fnp${value}`, name: 'FNP mod', text: 'Test FNP modifier.', trigger: 'feelNoPainRoll', effect: { modifyRoll: { roll: 'feelNoPain', value } } })

function fnpState(unitDatasheet: 'blu.brute' | 'blu.mob', abilities: Ability[], withAdjuster = true): GameState {
  if (withAdjuster) codeHooks[TEST_CODE] = adjuster
  const b = withBundle((x) => { x.datasheets[unitDatasheet].abilities.push(...abilities) })
  const s = createGameState(makeSetup({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }), b, 'seed', ENGINE_VERSION)
  s.phase = 'shooting'
  placeUnit(s, 'A:grunts', { x: -10, z: -5, gap: 0.5 })
  placeUnit(s, 'A:boss', [[30, 30]])
  placeUnit(s, 'A:walker', [[-16, -5]])
  placeUnit(s, 'B:mob', { x: -10, z: 0, gap: 0.5 })
  placeUnit(s, 'B:warboss', [[-30, 30]])
  placeUnit(s, 'B:brute', [[0, 0]])
  placeUnit(s, 'B:kopta', [[10, 0]])
  return s
}

function drain(ctx: EngineContext): void {
  for (let i = 0; i < 200 && attackService.advance(ctx) === 'pending'; i++) {
    const pending = ctx.state.pending as PendingDecision
    const opts = 'options' in pending ? pending.options : []
    ctx.state.pending = null
    attackService.handler.handle(ctx, (opts[0]?.action ?? { type: 'pass', player: pending.player, decisionId: pending.id }) as Action, pending)
  }
}

// one mortal wound on `unitId`, FNP die = `die`; returns the first FeelNoPainRolled event (undefined when none was rolled)
function fnpRoll(s: GameState, unitId: string, die: number) {
  const { ctx, events } = createContext(s, new ScriptedRng([die, ...Array(40).fill(2)]), DEFAULT_MODULES)
  attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:grunts', overwatch: false, targets: [] })
  attackService.queueMortalWounds(ctx, unitId, 1, 'test', false)
  drain(ctx)
  return events.filter((e): e is Extract<GameEvent, { type: 'FeelNoPainRolled' }> => e.type === 'FeelNoPainRolled')[0]
}

describe('C1 Feel No Pain adjusters (WOR-008)', () => {
  it('WOR-008 a model with no FNP gets {6, +0} from the adjuster: 6 ignores the wound, 5 does not', () => {
    expect(fnpRoll(fnpState('blu.mob', [ADJ]), 'B:mob', 6)).toMatchObject({ die: 6, needed: 6, ignored: true })
    expect(fnpRoll(fnpState('blu.mob', [ADJ]), 'B:mob', 5)).toMatchObject({ die: 5, needed: 6, ignored: false })
  })

  it('WOR-008 a model that already has FNP 6+ keeps its threshold and gains +1 (a 5 ignores; needed shows the effective target 5)', () => {
    expect(fnpRoll(fnpState('blu.brute', [ADJ]), 'B:brute', 5)).toMatchObject({ die: 5, needed: 5, ignored: true })
    expect(fnpRoll(fnpState('blu.brute', [ADJ]), 'B:brute', 4)).toMatchObject({ die: 4, needed: 5, ignored: false })
  })

  it('WOR-008 an adjuster held by another unit gives no opinion about this model', () => {
    const s = fnpState('blu.mob', [ADJ])
    expect(fnpRoll(s, 'B:brute', 5)).toMatchObject({ die: 5, needed: 6, ignored: false }) // brute: plain FNP 6+, no bonus
  })

  it('WOR-008 data modifyRoll feelNoPain is now applied (+1 on FNP 6+: a 5 ignores)', () => {
    expect(fnpRoll(fnpState('blu.brute', [plus(1)], false), 'B:brute', 5)).toMatchObject({ die: 5, needed: 5, ignored: true })
  })

  it('WOR-008 the total modifier is capped at +1 (data +1 and adjuster +1: a 4 still fails) and at -1', () => {
    expect(fnpRoll(fnpState('blu.brute', [plus(1), ADJ]), 'B:brute', 4)).toMatchObject({ die: 4, needed: 5, ignored: false })
    expect(fnpRoll(fnpState('blu.brute', [plus(1), ADJ]), 'B:brute', 5)).toMatchObject({ needed: 5, ignored: true })
    expect(fnpRoll(fnpState('blu.brute', [plus(-1), plus(-1)], false), 'B:brute', 6)).toMatchObject({ die: 6, needed: 7, ignored: false })
  })

  it('WOR-008 a model with no FNP source rolls nothing; plain FNP is unchanged', () => {
    expect(fnpRoll(fnpState('blu.mob', [], false), 'B:mob', 6)).toBeUndefined()
    expect(fnpRoll(fnpState('blu.brute', [], false), 'B:brute', 6)).toMatchObject({ die: 6, needed: 6, ignored: true })
  })
})

// ---------- C2 / C3: consolidation ----------

const AWalker = 'A:walker', BBrute = 'B:brute', DID = ''
const FURY = { consolidate: 6, consolidateOnly: true, enemyOnly: true }

function fightHarness(dice: number[] = []) {
  const b = withBundle((x) => {
    for (const [code, params] of [['unstoppableFury', FURY], ['getStuckInDistance', {}]] as const) {
      x.stratagems[`test.s.${code}`] = { ...x.stratagems['red.s.hold'], id: `test.s.${code}`, code, params } as DataBundle['stratagems'][string]
      x.patrols['red.patrol'].stratagems.push(`test.s.${code}`)
    }
  })
  const state = createGameState(makeSetup({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }), b, 'seed', ENGINE_VERSION)
  const strat = recordingStratagems()
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: strat } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  fightModule.enter(ctx)
  return { state, ctx, events, strat }
}

function act(ctx: EngineContext, action: Action): void {
  const pending = ctx.state.pending as PendingDecision
  const rej = fightModule.validate ? fightModule.validate(ctx.state, action, pending) : null
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = fightModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  fightModule.advance(ctx)
}

function defaultAction(p: PendingDecision): Action {
  if (p.kind === 'chooseFightUnit') return { type: 'chooseFightUnit', player: p.player, decisionId: DID, unitId: p.context.eligible[0] }
  if (p.kind === 'pileIn') return { type: 'pileIn', player: p.player, decisionId: DID, unitId: p.context.unitId, placements: [] }
  if (p.kind === 'consolidate') return { type: 'consolidate', player: p.player, decisionId: DID, unitId: p.context.unitId, placements: [] }
  if (p.kind === 'declareTargets') {
    const targets = p.context.weapons.filter((w) => w.legalTargets.length > 0).map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: w.legalTargets[0] }))
    return { type: 'declareTargets', player: p.player, decisionId: DID, unitId: p.context.unitId, targets }
  }
  if (p.kind === 'allocateAttack') return p.canPass ? { type: 'pass', player: p.player, decisionId: DID } : { type: 'allocateAttack', player: p.player, decisionId: DID, modelId: p.options[0].id }
  if (p.kind === 'chooseOption') return { type: 'chooseOption', player: p.player, decisionId: DID, optionId: p.options[0]?.id ?? 'keep' }
  return { type: 'pass', player: p.player, decisionId: DID }
}

function driveUntil(ctx: EngineContext, stop: (p: PendingDecision) => boolean): PendingDecision | null {
  for (let i = 0; i < 300; i++) {
    if (!ctx.state.pending) fightModule.advance(ctx)
    const p = ctx.state.pending
    if (!p) return null
    if (stop(p)) return p
    act(ctx, defaultAction(p))
  }
  throw new Error('driveUntil: exceeded maxSteps')
}

// puts a Fury-style (or Get Stuck In-style) bonus on the unit; getStuckIn finds it through the source's code and params
function grantBonus(s: GameState, unitId: string, code: 'unstoppableFury' | 'getStuckInDistance'): void {
  const id = `test.s.${code}`
  if (!s.stratagems[id]) throw new Error('fightHarness does not register ' + code)
  s.units[unitId].effects.push({
    id: `eff.${code}`, sourceAbilityId: id, sourceUnitId: unitId, effect: [], scope: { who: 'self' },
    expires: { kind: 'phaseEnd', round: s.round, player: null }, when: null,
  } as unknown as GameState['units'][string]['effects'][number])
}

// the walker at the given point with the brute's edge `gap` inches away on +x
function placeAt(s: GameState, origin: { x: number; z: number }, gap: number): void {
  placeUnit(s, AWalker, [{ x: origin.x, y: 0, z: origin.z }])
  const ra = s.models[`${AWalker}#0`].base.radius
  const rb = s.models[`${BBrute}#0`].base.radius
  placeUnit(s, BBrute, [{ x: origin.x + ra + rb + gap, y: 0, z: origin.z }])
}
const FAR = { x: 10, z: -13 }

describe('C2 fight.beforeConsolidate window (WOR-018)', () => {
  it('WOR-018 opens once per activation, after the attacks and before the Consolidation move (and before fight.attacksResolved)', () => {
    const { ctx, strat } = fightHarness(Array(200).fill(1))
    placeAt(ctx.state, FAR, 0.9)
    const p = driveUntil(ctx, (x) => x.kind === 'consolidate' && x.context.unitId === AWalker)
    expect(p?.kind).toBe('consolidate')
    const names = strat.offers.map((o) => o.window)
    const bc = strat.offers.filter((o) => o.window === 'fight.beforeConsolidate' && o.key === AWalker)
    expect(bc.map((o) => o.player)).toEqual(['A', 'B']) // one pass over both players, the active player first (here also the unit's owner)
    expect(names.indexOf('fight.beforeConsolidate')).toBeGreaterThan(names.indexOf('fight.targetsDeclared'))
    expect(strat.offers.some((o) => o.window === 'fight.attacksResolved' && o.key === AWalker)).toBe(false) // not yet: the Consolidation move is still pending
    act(ctx, defaultAction(ctx.state.pending as PendingDecision))
    expect(strat.offers.filter((o) => o.window === 'fight.beforeConsolidate' && o.key === AWalker)).toHaveLength(2) // still one pass, not reopened
    expect(strat.offers.some((o) => o.window === 'fight.attacksResolved' && o.key === AWalker)).toBe(true)
  })
})

describe('C3 consolidate-only, enemy-only distance (WOR-019)', () => {
  it('WOR-019 Fury source: pile-in stays 3", enemy-form consolidation is 6", objective-form stays 3"', () => {
    const { state } = fightHarness()
    grantBonus(state, AWalker, 'unstoppableFury')
    expect(hookService.pileInDistance(state, AWalker)).toBe(3)
    expect(hookService.consolidateDistance(state, AWalker, 3)).toBe(6)
    expect(hookService.consolidateDistance(state, AWalker, 3, 'enemy')).toBe(6)
    expect(hookService.consolidateDistance(state, AWalker, 3, 'objective')).toBe(3)
  })

  it('WOR-019 Get Stuck In (getStuckInDistance) is unchanged: 6" for pile-in and both consolidation forms', () => {
    const { state } = fightHarness()
    grantBonus(state, AWalker, 'getStuckInDistance')
    expect([hookService.pileInDistance(state, AWalker), hookService.consolidateDistance(state, AWalker), hookService.consolidateDistance(state, AWalker, 3, 'objective')]).toEqual([6, 6, 6])
  })

  it('WOR-019 Fury plus Get Stuck In on one unit: the unrestricted 6" still reaches the objective form', () => {
    const { state } = fightHarness()
    grantBonus(state, AWalker, 'unstoppableFury')
    grantBonus(state, AWalker, 'getStuckInDistance')
    expect([hookService.pileInDistance(state, AWalker), hookService.consolidateDistance(state, AWalker, 3, 'enemy'), hookService.consolidateDistance(state, AWalker, 3, 'objective')]).toEqual([6, 6, 6])
  })

  it('WOR-019 no source: both forms are the base distance', () => {
    const { state } = fightHarness()
    expect([hookService.consolidateDistance(state, AWalker), hookService.consolidateDistance(state, AWalker, 3, 'objective'), hookService.pileInDistance(state, AWalker)]).toEqual([3, 3, 3])
  })

  it('WOR-019 enemy 5" away: with Fury the consolidation decision is 6" toward the enemy; without it there is none', () => {
    const plain = fightHarness(Array(200).fill(1))
    placeAt(plain.ctx.state, FAR, 5)
    plain.ctx.state.units[AWalker].turn.chargedThisTurn = true
    expect(driveUntil(plain.ctx, (x) => x.kind === 'consolidate' && x.context.unitId === AWalker)).toBeNull()

    const fury = fightHarness(Array(200).fill(1))
    placeAt(fury.ctx.state, FAR, 5)
    fury.ctx.state.units[AWalker].turn.chargedThisTurn = true
    grantBonus(fury.ctx.state, AWalker, 'unstoppableFury')
    const p = driveUntil(fury.ctx, (x) => x.kind === 'consolidate' && x.context.unitId === AWalker) as Extract<PendingDecision, { kind: 'consolidate' }>
    expect(p).not.toBeNull()
    expect(p.context.distance).toBe(6)
    expect(p.context.objectiveFallback).toBeNull()
  })
})
