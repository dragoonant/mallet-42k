// MOVE-010b: a declared Fall Back that ends up with no legal end (Overwatch casualties / models moved in after the declaration)
// stays put and still counts as having fallen back (docs/spec/10-rules-core.md R-5.5 ruling). Same harness as movement.test.ts.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, createContext, setModelPos,
  type Action, type EngineContext, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { movementModule } from '../../src/engine/phases/movement'
import { freshState, makePlayerA, makePlayerB, placeUnit, recordingStratagems } from '../fixtures'

const ABoss = 'A:boss'
const ENEMIES = ['B:mob', 'B:warboss', 'B:brute', 'B:kopta']

function setup() {
  const state = freshState({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx } = createContext(state, new ScriptedRng([]), modules)
  movementModule.enter(ctx)
  placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }]) // M6
  ENEMIES.forEach((uid, i) => placeUnit(ctx.state, uid, { x: 18, z: 10 + i * 4, gap: 1 }))
  return ctx
}

// enemy models laid out: contact model at 1", rings at 2.75" and 5.25" (as in MOVE-010), or parked far away
function layEnemies(ctx: EngineContext, boxed: boolean) {
  const ring: [number, number][] = [[1, 0]]
  for (let i = 0; i < 4; i++) { const a = (i * 90 * Math.PI) / 180; ring.push([Math.cos(a) * 2.75, Math.sin(a) * 2.75]) }
  for (let i = 0; i < 8; i++) { const a = (i * 45 * Math.PI) / 180; ring.push([Math.cos(a) * 5.25, Math.sin(a) * 5.25]) }
  let i = 0
  for (const uid of ENEMIES) {
    const ids = ctx.state.units[uid].models
    ids.forEach((mid, k) => {
      const [x, z] = boxed || i + k === 0 ? (ring[i + k] ?? [20 + k, 12]) : [18 + k * 1.5, 12 + (i % 3)]
      if (ctx.state.models[mid]) setModelPos(ctx.state.models[mid], { x, y: 0, z })
    })
    i += ids.length
  }
}

function declareFallBack(ctx: EngineContext) {
  movementModule.advance(ctx)
  const send = (action: Action) => {
    const pending = ctx.state.pending as PendingDecision
    ctx.state.pending = null
    expect(movementModule.handle(ctx, action, pending)).toBeUndefined()
    movementModule.advance(ctx)
  }
  send({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: ABoss })
  send({ type: 'declareMove', player: 'A', decisionId: '', unitId: ABoss, moveType: 'fallBack' })
}

const stay: Action = { type: 'moveUnit', player: 'A', decisionId: '', unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 0, y: 0, z: 0 } }] }

describe('movement phase — stuck Fall Back (MOVE-010b)', () => {
  it('MOVE-010b a boxed-in declared Fall Back may stay put and is still marked fallBack', () => {
    const ctx = setup()
    layEnemies(ctx, false)
    declareFallBack(ctx)
    layEnemies(ctx, true) // the escape routes close after the declaration
    const pending = ctx.state.pending as PendingDecision
    expect(pending.kind).toBe('moveUnit')
    expect(movementModule.validate?.(ctx.state, stay, pending)).toBeNull()
    ctx.state.pending = null
    expect(movementModule.handle(ctx, stay, pending)).toBeUndefined()
    expect(ctx.state.models[`${ABoss}#0`].pos.x).toBe(0)
    expect(ctx.state.units[ABoss].turn.moveType).toBe('fallBack')
  })

  it('MOVE-010b staying put (or empty placements) is rejected while any strict Fall Back destination exists', () => {
    const ctx = setup()
    layEnemies(ctx, false)
    declareFallBack(ctx)
    const pending = ctx.state.pending as PendingDecision
    expect(movementModule.validate?.(ctx.state, stay, pending)?.code).toBeTruthy()
    expect(movementModule.validate?.(ctx.state, { ...stay, placements: [] } as Action, pending)?.code).toBeTruthy()
  })
})
