// Surface selection near an intended height (docs/spec/12-rules-test-checklist.md MOVE-041, CHARGE-033, FIGHT-035).
// heightAt(x, z) with no hint is the TOPMOST surface; engine-computed end points that keep their level (charge,
// pile-in, consolidate, approach) resolve the surface nearest the model's starting height instead, so a model ending
// beneath a ruin upper floor stays on the ground and a model on a floor stays on it.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState,
  type Action, type EngineContext, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { chargeModule } from '../../src/engine/phases/charge'
import { fightModule } from '../../src/engine/phases/fight'
import { settleY, terrainService } from '../../src/engine/terrain'
import { bundle, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems, withBundle } from '../fixtures'
import type { DataBundle } from '../../src/data/types'

// an open (wall-less) ruin with two stacked floors over x in [x0, x1], z in [z0, z1]
function openRuinBundle(x0: number, x1: number, z0: number, z1: number, heights: number[]): DataBundle {
  const poly = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
  return withBundle((b) => {
    b.terrainLayouts['terrain.test'].pieces = [{
      id: 'ruin-open', kind: 'ruin', pos: { x: 0, z: 0 }, rot: 0, footprint: poly, height: 6, traits: ['cover', 'breachable'],
      walls: [], floors: heights.map((height) => ({ polygon: poly, height })),
    }]
  })
}

const unattached = () => ({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })

function harness(b: DataBundle, dice: number[] = []) {
  const state = createGameState(makeSetup(unattached()), b, 'seed', ENGINE_VERSION)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx } = createContext(state, new ScriptedRng(dice), modules)
  return { state, ctx }
}

describe('MOVE-041 surface height near an intended level', () => {
  const b = openRuinBundle(0, 12, -6, 6, [2.25, 4.5])
  const state = createGameState(makeSetup(unattached()), b, 'seed', ENGINE_VERSION)

  it('MOVE-041 without a hint heightAt is the topmost surface; with `near` it is the highest surface at or below it', () => {
    expect(terrainService.heightAt(state, 5, 0)).toBe(4.5)
    expect(terrainService.heightAt(state, 5, 0, { near: 0 })).toBe(0) // ground placement under a floor
    expect(terrainService.heightAt(state, 5, 0, { near: 2.25 })).toBe(2.25) // stays on the floor it is on
    expect(terrainService.heightAt(state, 5, 0, { near: 3 })).toBe(2.25)
    expect(terrainService.heightAt(state, 5, 0, { near: 4.5 })).toBe(4.5)
    expect(terrainService.heightAt(state, -5, 0, { near: 2.25 })).toBe(0) // stepping off the floor drops to the ground
    expect(terrainService.heightAt(state, 5, 0, { near: Number.NaN })).toBe(4.5) // garbage hint falls back to topmost
  })

  it('MOVE-041 settleY keeps the level when legal and falls back to another surface only when that one is illegal', () => {
    const boss = Object.values(state.models).find((m) => m.unitId === 'A:boss')!
    expect(settleY(state, boss, 5, 0, 0)).toBe(0)
    expect(settleY(state, boss, 5, 0, 2.25)).toBe(2.25)
    // a crate is solid at ground level: a ground-level mover that cannot stand inside it climbs onto its top
    const crate = createGameState(makeSetup(unattached()), withBundle((x) => {
      x.terrainLayouts['terrain.test'].pieces = [{ id: 'c', kind: 'crate', pos: { x: 0, z: 0 }, rot: 0, footprint: [{ x: -3, z: -3 }, { x: 3, z: -3 }, { x: 3, z: 3 }, { x: -3, z: 3 }], height: 3, traits: ['cover', 'scalable'] }]
    }), 'seed', ENGINE_VERSION)
    expect(settleY(crate, Object.values(crate.models).find((m) => m.unitId === 'A:boss')!, 0, 0, 0)).toBe(3)
  })
})

function chargeMoveOf(ctx: EngineContext, unitId: string) {
  const pending = ctx.state.pending as PendingDecision
  expect(pending.kind, JSON.stringify(pending).slice(0, 400)).toBe('chargeMove')
  const acts = chargeModule.legalActions!(ctx.state, pending) as Extract<Action, { type: 'chargeMove' }>[]
  expect(acts.length).toBeGreaterThan(0)
  return acts[0].placements.filter((p) => p.modelId.startsWith(unitId))
}

function declareCharge(ctx: EngineContext, unitId: string, targetUnitIds: string[]) {
  const player = ctx.state.units[unitId].player
  const step = (a: Action) => {
    if (!ctx.state.pending) chargeModule.advance(ctx)
    const pending = ctx.state.pending as PendingDecision
    const rej = chargeModule.validate?.(ctx.state, a, pending)
    if (rej) throw new Error(`${rej.code} ${rej.reason}`)
    ctx.state.pending = null
    const h = chargeModule.handle(ctx, a, pending)
    if (h) throw new Error(`${h.code} ${h.reason}`)
    chargeModule.advance(ctx)
  }
  step({ type: 'chooseUnitToActivate', player, decisionId: '', unitId })
  step({ type: 'declareCharge', player, decisionId: '', unitId, targetUnitIds })
  // decline any re-roll offer so the roll stands
  while (ctx.state.pending?.kind === 'chooseOption') step({ type: 'chooseOption', player, decisionId: '', optionId: 'keep' })
}

describe('CHARGE-033 a charge keeps the charger on its level under a ruin upper floor', () => {
  // ruin floors at 2.25" and 4.5" over x in [0, 14]; the charger starts at x = -1, the target stands at x = 6
  const b = openRuinBundle(0, 14, -6, 6, [2.25, 4.5])

  it('CHARGE-033 ground charger ending beneath the floors is placed at ground level, not on the topmost floor', () => {
    const { ctx } = harness(b, [4, 4])
    chargeModule.enter(ctx)
    placeUnit(ctx.state, 'A:boss', [{ x: -1, y: 0, z: 0 }])
    placeUnit(ctx.state, 'B:warboss', [{ x: 6, y: 0, z: 0 }])
    declareCharge(ctx, 'A:boss', ['B:warboss'])
    const pl = chargeMoveOf(ctx, 'A:boss')
    expect(pl[0].pos.x).toBeGreaterThan(0) // ends under the floors
    expect(pl[0].pos.y).toBe(0)
  })

  it('CHARGE-033 a charger on the 2.25" floor charging along it stays on that floor', () => {
    const { ctx } = harness(b, [4, 4])
    chargeModule.enter(ctx)
    placeUnit(ctx.state, 'A:boss', [{ x: 2, y: 2.25, z: 0 }])
    placeUnit(ctx.state, 'B:warboss', [{ x: 8, y: 2.25, z: 0 }])
    declareCharge(ctx, 'A:boss', ['B:warboss'])
    const pl = chargeMoveOf(ctx, 'A:boss')
    expect(pl[0].pos.x).toBeGreaterThan(2)
    expect(pl[0].pos.y).toBe(2.25)
  })
})

describe('FIGHT-035 pile-in keeps the model on its level under a ruin upper floor', () => {
  it('FIGHT-035 a ground-level pile-in beneath the floors ends at ground level', () => {
    const b = openRuinBundle(5, 22, -15, -5, [2.25, 4.5])
    const { ctx } = harness(b, Array(50).fill(1))
    fightModule.enter(ctx)
    const origin = { x: 12, z: -13 }
    placeUnit(ctx.state, 'A:walker', [{ x: origin.x, y: 0, z: origin.z }])
    const ra = ctx.state.models['A:walker#0'].base.radius, rb = ctx.state.models['B:brute#0'].base.radius
    placeUnit(ctx.state, 'B:brute', [{ x: origin.x + ra + rb + 3.5, y: 0, z: origin.z }])
    ctx.state.units['A:walker'].turn.chargedThisTurn = true
    for (let i = 0; i < 20 && !(ctx.state.pending?.kind === 'pileIn' && ctx.state.pending.context.unitId === 'A:walker'); i++) {
      if (!ctx.state.pending) { fightModule.advance(ctx); continue }
      const p = ctx.state.pending
      let a: Action
      if (p.kind === 'chooseFightUnit') a = { type: 'chooseFightUnit', player: p.player, decisionId: '', unitId: p.context.eligible[0] }
      else if (p.kind === 'pileIn') a = { type: 'pileIn', player: p.player, decisionId: '', unitId: p.context.unitId, placements: [] }
      else break
      ctx.state.pending = null
      fightModule.handle(ctx, a, p)
      fightModule.advance(ctx)
    }
    const pending = ctx.state.pending as PendingDecision
    expect(pending.kind).toBe('pileIn')
    const moves = (fightModule.legalActions!(ctx.state, pending) as Extract<Action, { type: 'pileIn' }>[]).filter((a) => a.placements.length > 0)
    expect(moves.length).toBeGreaterThan(0)
    for (const a of moves) for (const p of a.placements) expect(p.pos.y).toBe(0)
  })
})
