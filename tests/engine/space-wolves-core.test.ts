// Space Wolves engine changes beyond a code hook (docs/spec/factions/space-wolves.md 7.1: E1 enhancement cost overrides,
// E2 Bag-the-Big-Un parameters). Synthetic red/blu fixture like missions.test.ts; checklist IDs SPA-*.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, createContext,
  type Action, type ChooseOptionDecision, type EngineContext, type GameState, type PendingDecision, type RuntimeAbility, type RuntimeStratagem,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectiveCost, ignoresLimit } from '../../src/engine/stratagems'
import { freshState, placeUnit } from '../fixtures'

const modules = DEFAULT_MODULES
function ctxFor(state: GameState, dice: number[] = []) { return createContext(state, new ScriptedRng(dice), modules) }
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  modules.services.missions.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action, pending as PendingDecision)
}

// ---------- E1: enhancement-sourced stratagem cost override (Ferocious) ----------
const HI = { id: 'core.s.heroic-intervention', cost: 1 } as unknown as RuntimeStratagem
const FEROCIOUS = {
  id: 'sw.e.ferocious', name: 'Ferocious', text: '', trigger: 'always', source: 'enhancement', bearerModelId: 'B:warboss#0',
  code: 'stratagemCostOverride', params: { stratagemId: 'core.s.heroic-intervention', cost: 0, ignoreLimit: true }, scope: { who: 'bearer' },
} as unknown as RuntimeAbility

function withFerocious(): GameState {
  const s = freshState()
  s.abilities = { ...s.abilities, [FEROCIOUS.id]: FEROCIOUS }
  // the bearer leads the mob
  s.units['B:warboss'].bodyguardUnitId = 'B:mob'
  s.units['B:mob'].attachedLeaderId = 'B:warboss'
  return s
}

describe('E1 enhancement stratagem cost override', () => {
  it('SPA-010 the bearer unit (leader or attached bodyguard) pays 0 CP and ignores the limit; other units pay the printed cost', () => {
    const s = withFerocious()
    expect(effectiveCost(s, 'B', HI, ['B:warboss'])).toBe(0)
    expect(effectiveCost(s, 'B', HI, ['B:mob'])).toBe(0)
    expect(ignoresLimit(s, 'B', HI, ['B:mob'])).toBe(true)
    expect(effectiveCost(s, 'B', HI, ['B:brute'])).toBe(1)
    expect(ignoresLimit(s, 'B', HI, ['B:brute'])).toBe(false)
  })

  it('SPA-026 the override only applies while its bearer is alive', () => {
    const s = withFerocious()
    s.models['B:warboss#0'].woundsRemaining = 0
    expect(effectiveCost(s, 'B', HI, ['B:warboss'])).toBe(1)
    expect(effectiveCost(s, 'B', HI, ['B:mob'])).toBe(1)
    expect(ignoresLimit(s, 'B', HI, ['B:mob'])).toBe(false)
  })

  it('SPA-026 an override for another stratagem id is ignored', () => {
    const s = withFerocious()
    const other = { id: 'core.s.fire-overwatch', cost: 1 } as unknown as RuntimeStratagem
    expect(effectiveCost(s, 'B', other, ['B:warboss'])).toBe(1)
  })
})

// ---------- E2: Bag-the-Big-Un parameters (Mighty Saga) ----------
const SAGA_PICK = {
  id: 'saga-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick',
  params: { pickKeywords: ['CHARACTER', 'MONSTER', 'VEHICLE'], fallbackWarlord: false },
}
const SAGA_SCORE = {
  id: 'saga-score', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 0, cap: 12, code: 'bagTheBigUnScore',
  params: { unitPoints: 8, beastbossPoints: 12, bigScoreOn: 'unit' },
}
const BAG_PICK = { id: 'bag-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick' }

describe('E2 bagPick params', () => {
  it('SPA-011 pickKeywords widens the pool to CHARACTER/MONSTER/VEHICLE models; default stays MONSTER/VEHICLE', () => {
    const s = freshState()
    s.mission.secondaries.B = [SAGA_PICK as never]
    s.round = 1
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'round.start', '1')
    expect((ctx.state.pending as ChooseOptionDecision).options.map((o) => o.id).sort()).toEqual(['A:boss#0', 'A:walker#0'])
    const s2 = freshState()
    s2.mission.secondaries.B = [BAG_PICK as never]
    s2.round = 1
    const { ctx: c2 } = ctxFor(s2)
    modules.services.missions.onWindow(c2, 'round.start', '1')
    expect((c2.state.pending as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['A:walker#0'])
  })

  it('SPA-011 fallbackWarlord:false offers nothing when no unit qualifies (default falls back to the Warlord)', () => {
    const run = (params: Record<string, unknown>): GameState['pending'] => {
      const s = freshState()
      s.mission.secondaries.B = [{ ...SAGA_PICK, params } as never]
      s.round = 1
      s.units['A:walker'].location = 'destroyed'
      const { ctx } = ctxFor(s)
      modules.services.missions.onWindow(ctx, 'round.start', '1')
      return ctx.state.pending
    }
    expect(run({ pickKeywords: ['MONSTER'], fallbackWarlord: false })).toBeNull()
    expect((run({ pickKeywords: ['MONSTER'] }) as ChooseOptionDecision).options.map((o) => o.id)).toEqual(['A:boss#0'])
  })
})

describe('E2 bigScoreOn unit', () => {
  const boss = { unitId: 'B:warboss', modelId: 'B:warboss#0' }
  const kill = (id: string, by: { unitId: string | null; modelId: string | null }) => (s: GameState, ctx: EngineContext) => {
    s.models[id].woundsRemaining = 0
    attackService.destroyModel(ctx, id, { player: by.unitId ? 'B' : null, unitId: by.unitId, modelId: by.modelId, kind: by.unitId ? 'melee' : 'other' } as never)
  }
  const grow = (s: GameState, extra: number): void => {
    const walker = s.units['A:walker']
    for (let n = 1; n <= extra; n++) {
      const m = structuredClone(s.models[walker.models[0]])
      m.id = `A:walker#${n}`
      s.models[m.id] = m
      walker.models.push(m.id)
    }
  }
  const run = (scoreRule: unknown, pickRule: unknown, pickId: string, extra: number, act: (s: GameState, ctx: EngineContext) => void): number => {
    const s = freshState()
    s.mission.secondaries.B = [pickRule as never]
    s.round = 1
    grow(s, extra)
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'round.start', '1')
    answer(ctx, pickId)
    s.mission.secondaries.B = [scoreRule as never]
    s.round = 5
    placeUnit(s, 'A:walker', [[0, 0]])
    s.units['B:warboss'].bodyguardUnitId = 'B:mob'
    s.units['B:mob'].attachedLeaderId = 'B:warboss'
    const { ctx: c2 } = ctxFor(s, [1, 1, 1, 1, 1, 1])
    act(s, c2)
    modules.services.missions.onWindow(c2, 'battle.end', 'end')
    return s.players.B.vp
  }

  it('SPA-012 the picked model unit destroyed by the Warlord own model is 12 VP; by an attached bodyguard model 8; alive 0', () => {
    expect(run(SAGA_SCORE, SAGA_PICK, 'A:walker#0', 0, kill('A:walker#0', boss))).toBe(12)
    expect(run(SAGA_SCORE, SAGA_PICK, 'A:walker#0', 0, kill('A:walker#0', { unitId: 'B:mob', modelId: 'B:mob#2' }))).toBe(8)
    expect(run(SAGA_SCORE, SAGA_PICK, 'A:walker#0', 0, () => undefined)).toBe(0)
  })

  it('SPA-012 the Warlord destroys the picked unit and is destroyed himself before battle.end: still 12 VP (not 8)', () => {
    const killThenDie = (s: GameState, ctx: EngineContext) => {
      kill('A:walker#0', boss)(s, ctx)
      kill('B:warboss#0', { unitId: null, modelId: null })(s, ctx)
      expect(s.units['B:warboss'].models).toEqual([]) // removeModel took him out of unit.models
    }
    expect(run(SAGA_SCORE, SAGA_PICK, 'A:walker#0', 0, killThenDie)).toBe(12)
  })

  it('SPA-012 the Warlord killing only the picked model of a surviving multi-model unit scores 8, not 12; wiping the unit scores 12', () => {
    expect(run(SAGA_SCORE, SAGA_PICK, 'A:walker#1', 2, kill('A:walker#1', boss))).toBe(8)
    const wipe = (s: GameState, ctx: EngineContext) => { for (const id of ['A:walker#0', 'A:walker#1', 'A:walker#2']) kill(id, boss)(s, ctx) }
    expect(run(SAGA_SCORE, SAGA_PICK, 'A:walker#1', 2, wipe)).toBe(12)
  })

  it('SPA-012 default (model) mode is unchanged: the Warlord killing only the picked model scores 12', () => {
    const modelScore = { ...SAGA_SCORE, params: { unitPoints: 8, beastbossPoints: 12 } }
    expect(run(modelScore, BAG_PICK, 'A:walker#1', 2, kill('A:walker#1', boss))).toBe(12)
  })
})
