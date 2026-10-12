// Move clamp (src/client/interaction/moveClamp.ts): a hover/click point is pulled back to the farthest legal
// destination — range first, then the engine's own validate() — so a proposed move can never be illegal by range.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, createContext, validate,
  type Action, type GameState, type ModuleTable, type PendingDecision,
} from '../../src/engine'
import { movementModule } from '../../src/engine/phases/movement'
import { clampMoveDraft } from '../../src/client/interaction/moveClamp'
import { freshState, makePlayerA, makePlayerB, placeUnit, recordingStratagems } from '../fixtures'

const BOSS = 'A:boss'
const FORMATION = { kind: 'line', facing: 0, auto: true } as const

// a Normal move declared for a lone infantry model (M6) in open ground, so the pending decision is a real moveUnit
function pendingNormalMove(): { state: GameState; pending: Extract<PendingDecision, { kind: 'moveUnit' }> } {
  const state = freshState({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx } = createContext(state, new ScriptedRng([]), modules)
  movementModule.enter(ctx)
  placeUnit(ctx.state, BOSS, [{ x: -10, y: 0, z: 0 }])
  const send = (action: Action) => {
    if (!ctx.state.pending) movementModule.advance(ctx)
    const p = ctx.state.pending as PendingDecision
    ctx.state.pending = null
    expect(movementModule.handle(ctx, action, p)).toBeUndefined()
    movementModule.advance(ctx)
  }
  send({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: BOSS })
  send({ type: 'declareMove', player: 'A', decisionId: '', unitId: BOSS, moveType: 'normal' })
  const pending = ctx.state.pending as PendingDecision
  expect(pending.kind).toBe('moveUnit')
  return { state: ctx.state, pending: pending as Extract<PendingDecision, { kind: 'moveUnit' }> }
}

const actionFor = (pending: PendingDecision, unitId: string, placements: unknown[]): Action =>
  ({ type: 'moveUnit', player: pending.player, decisionId: pending.id, unitId, placements }) as Action

describe('move clamp', () => {
  it('UI-MOVE-CLAMP-001 a click far outside the move range lands inside it and is legal', () => {
    const { state, pending } = pendingNormalMove()
    const r = clampMoveDraft(state, pending, { x: 30, z: 0 }, FORMATION)
    expect(r).not.toBeNull()
    expect(r!.distance).toBeLessThanOrEqual(r!.maxDistance + 1e-6)
    expect(r!.draft.anchor.x).toBeGreaterThan(-10)
    expect(r!.ok).toBe(true)
    expect(validate(state, actionFor(pending, BOSS, r!.draft.placements))).toBeNull()
  })

  it('UI-MOVE-CLAMP-002 a legal point inside the range comes back unchanged', () => {
    const { state, pending } = pendingNormalMove()
    const r = clampMoveDraft(state, pending, { x: -7, z: 1 }, FORMATION)
    expect(r!.ok).toBe(true)
    expect(r!.draft.anchor.x).toBeCloseTo(-7, 6)
    expect(r!.draft.anchor.z).toBeCloseTo(1, 6)
    expect(validate(state, actionFor(pending, BOSS, r!.draft.placements))).toBeNull()
  })
})
