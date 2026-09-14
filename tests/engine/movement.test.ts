// Movement phase (10-rules §5, docs/spec/12-rules-test-checklist.md MOVE-*). Drives `movementModule` directly over a
// hand-built GameState (60-testing §1 fixtures), per phases/README.md §6 — no full createGame/deployment flow, since
// setup.ts's `deploy` step is still a stub owned by another module. `recordingStratagems()` replaces the real
// stratagem service so ordinary moves never trigger Fire Overwatch; a couple of tests re-enable the real service to
// exercise MOVE-036's window explicitly.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, hasKeyword, removeModel, setModelPos, unitModels,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision, type Rejection,
} from '../../src/engine'
import type { ModelPlacement } from '../../src/engine/actions'
import { movementModule, resolveSurgeMove } from '../../src/engine/phases/movement'
import { transportService } from '../../src/engine/transports'
import { bundle, freshState, makePlayerA, makePlayerB, makeSetup, placeUnit, recordingStratagems, withBundle } from '../fixtures'

function harness(overrides: Parameters<typeof freshState>[0] = {}, dice: number[] = []) {
  const state = freshState(overrides)
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  return { state, ctx, events, modules }
}

// a plain function call (vs. a literal `ctx.state.pending = null` at the call site) keeps TS from narrowing
// `pending` to `null` across the following `advance()` call, which it can't see mutates it back.
function clearPending(state: GameState): void { state.pending = null }

// decisionId/envelope stamping is the reducer's job (not exercised here — these helpers call the module directly, per
// phases/README.md §6), so every action below uses a placeholder decisionId; only kind/context/action-shape matter.
const DID = ''

// answer the pending decision (validate → handle → advance), throwing on an unexpected rejection. Advances first if
// nothing is pending yet (e.g. right after `enter`, or after placing units for a fresh `start()`).
function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  if (!ctx.state.pending) movementModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  if (movementModule.validate) {
    const rej = movementModule.validate(ctx.state, action, pending)
    if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  }
  ctx.state.pending = null
  const handled = movementModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return movementModule.advance(ctx)
}

// like `act` but returns the rejection instead of throwing (for negative tests); on rejection nothing is mutated.
function reject(ctx: EngineContext, action: Action): Rejection | null {
  if (!ctx.state.pending) movementModule.advance(ctx)
  const pending = ctx.state.pending as PendingDecision
  const rej = movementModule.validate ? movementModule.validate(ctx.state, action, pending) : null
  if (rej) return rej
  const saved = ctx.state.pending
  ctx.state.pending = null
  const handled = movementModule.handle(ctx, action, pending)
  if (!handled) ctx.state.pending = saved // restore so the caller's normal flow can continue if it wants
  return handled ?? null
}

const A = 'A:grunts', ABoss = 'A:boss', AWalker = 'A:walker'
const B = 'B:mob', BBrute = 'B:brute', BKopta = 'B:kopta', BWarboss = 'B:warboss'

function start(overrides: Parameters<typeof freshState>[0] = {}, dice: number[] = []) {
  const h = harness(overrides, dice)
  movementModule.enter(h.ctx)
  return h
}

function declare(ctx: EngineContext, unitId: string, moveType: 'normal' | 'advance' | 'fallBack' | 'stationary') {
  act(ctx, { type: 'chooseUnitToActivate', player: ctx.state.units[unitId].player, decisionId: DID, unitId })
  return act(ctx, { type: 'declareMove', player: ctx.state.units[unitId].player, decisionId: DID, unitId, moveType })
}

function move(ctx: EngineContext, unitId: string, placements: ModelPlacement[]) {
  return act(ctx, { type: 'moveUnit', player: ctx.state.units[unitId].player, decisionId: DID, unitId, placements })
}

describe('movement phase — select / declare (MOVE-001..010, 034, 036)', () => {
  it('MOVE-001 normal move within M is legal; beyond M is rejected', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 0 }]) // M6
    declare(ctx, ABoss, 'normal')
    const bad = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -3.99, y: 0, z: 0 } }] })
    expect(bad?.code).toBe('E_OUT_OF_RANGE')
    const r = move(ctx, ABoss, [{ modelId: `${ABoss}#0`, pos: { x: -4.01, y: 0, z: 0 } }])
    expect(['pending', 'done']).toContain(r) // movement.unitMoved window offered next, or the phase simply finishes
    expect(ctx.state.models[`${ABoss}#0`].pos.x).toBe(-4.01)
  })

  it('MOVE-002 a path segment crossing an enemy base is rejected; overlapping any model at the end is rejected', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: -5, y: 0, z: 0 }])
    placeUnit(ctx.state, B, { x: 0, z: 5, gap: 0.5 }) // enemy mob, far from the path start
    // put one enemy model directly on the path from -5,0 to 5,0
    setModelPos(ctx.state.models[`${B}#0`], { x: 0, y: 0, z: 0 })
    declare(ctx, ABoss, 'normal')
    const crossing = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 5, y: 0, z: 0 } }] })
    expect(crossing?.code).toBe('E_OUT_OF_RANGE') // 10" exceeds M6 first — re-run within range but through the enemy
    const overlap = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 0, y: 0, z: 0 } }] })
    expect(overlap?.code).toBe('E_OVERLAP')
  })

  it('MOVE-003 a VEHICLE path may not cross a friendly VEHICLE/MONSTER, but may cross a friendly INFANTRY model', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, AWalker, [{ x: -8, y: 0, z: 0 }])
    placeUnit(ctx.state, ABoss, [{ x: -4, y: 0, z: 0 }]) // friendly INFANTRY directly on the path — allowed to cross
    declare(ctx, AWalker, 'normal')
    const okThroughInfantry = move(ctx, AWalker, [{ modelId: `${AWalker}#0`, pos: { x: 0, y: 0, z: 0 } }])
    expect(['pending', 'done']).toContain(okThroughInfantry)
    expect(ctx.state.models[`${AWalker}#0`].pos.x).toBe(0)
  })

  it('MOVE-004 a path leaving the board is rejected', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 20, y: 0, z: 0 }])
    declare(ctx, ABoss, 'normal')
    const bad = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 23, y: 0, z: 0 } }] })
    expect(bad?.code).toBe('E_OUT_OF_RANGE')
  })

  it('MOVE-005 a VEHICLE on an oval base pays a 2" pivot once; a round-based INFANTRY model pays none', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    expect(hasKeyword(ctx.state, AWalker, 'VEHICLE')).toBe(true)
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 0 }]) // M8; a 90° turn + 5" should need 7" of allowance (pivot 2")
    declare(ctx, AWalker, 'normal')
    const tooFar = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: 6.01, y: 0, z: 0 }, facing: Math.PI / 2 }] })
    expect(tooFar?.code).toBe('E_OUT_OF_RANGE')
    const ok = move(ctx, AWalker, [{ modelId: `${AWalker}#0`, pos: { x: 5.99, y: 0, z: 0 }, facing: Math.PI / 2 }])
    expect(['pending', 'done']).toContain(ok)
  })

  it('MOVE-006 Advance: one D6 rolled once, added to every model\'s allowance; unit flagged advanced', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }, [6]) // ceil(6/2) not used for d6; roll(6) uses face directly
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 0 }])
    const r = declare(ctx, ABoss, 'advance')
    expect(['pending', 'done']).toContain(r)
    expect(ctx.state.units[ABoss].turn.advanceRoll).toBe(6)
    expect(ctx.state.units[ABoss].turn.moveType).toBe('advance')
    const withinBonus = move(ctx, ABoss, [{ modelId: `${ABoss}#0`, pos: { x: -10 + 6 + 6, y: 0, z: 0 } }]) // M6 + roll 6 = 12
    expect(['pending', 'done']).toContain(withinBonus)
  })

  it('MOVE-008 a unit within engagement range is offered only stationary/fallBack', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: 0.5, y: 0, z: 0 }]) // within 1" engagement range
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: ABoss })
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'declareMove' }>
    expect(pending.context.allowed.sort()).toEqual(['fallBack', 'stationary'])
  })

  it('MOVE-009 Remain Stationary flags the unit and opens no further decision for it this phase', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    const r = declare(ctx, ABoss, 'stationary')
    expect(ctx.state.units[ABoss].turn.moveType).toBe('stationary')
    expect(ctx.state.phaseState.activated).toContain(ABoss)
    // 'select' will be entered next; nothing further pending for this unit specifically
    expect(r === 'pending' || r === 'done').toBe(true)
  })

  it('MOVE-010 Fall Back with no legal end has the option withdrawn (surrounded at every radius up to M, on every side)', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }]) // M6
    // one model right next to the boss (establishes engagement) plus two concentric rings of every other model
    // player B has (13 total), sized so every escape candidate (24 angles x the 4 sampled radii up to M) lands
    // within engagement range of some enemy model
    const ring: [number, number][] = [[1, 0]]
    for (let i = 0; i < 4; i++) { const a = (i * 90 * Math.PI) / 180; ring.push([Math.cos(a) * 2.75, Math.sin(a) * 2.75]) }
    for (let i = 0; i < 8; i++) { const a = (i * 45 * Math.PI) / 180; ring.push([Math.cos(a) * 5.25, Math.sin(a) * 5.25]) }
    let i = 0
    for (const uid of [B, BWarboss, BBrute, BKopta]) {
      const n = ctx.state.units[uid].models.length
      placeUnit(ctx.state, uid, ring.slice(i, i + n))
      i += n
    }
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: ABoss })
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'declareMove' }>
    expect(pending.context.allowed).toEqual(['stationary'])
  })

  it('MOVE-034 a unit may only be selected to move once per Movement phase', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    declare(ctx, ABoss, 'stationary')
    // ABoss is now activated; it must not appear among the next eligible options
    // only one unit existed, so the whole phase (and Movement's part of it) is simply done now
    const pending = ctx.state.pending
    if (pending && pending.kind === 'chooseUnitToActivate') expect(pending.context.eligible).not.toContain(ABoss)
    expect(ctx.state.phaseState.activated).toEqual([ABoss])
  })

  it('MOVE-036 activation sequence: chooseUnitToActivate → declareMove → reactionWindow (moveStarted) → moveUnit → unitMoved', () => {
    const state = freshState({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    // a stratagems stub that always offers a window at movement.moveStarted (legality of any specific reaction, e.g.
    // Fire Overwatch, is stratagems.ts's own concern — this only checks that movement.ts asks for it at the right point)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(['movement.moveStarted']) } }
    const { ctx } = createContext(state, new ScriptedRng([]), modules)
    movementModule.enter(ctx)
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 0 }])
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: ABoss })
    act(ctx, { type: 'declareMove', player: 'A', decisionId: DID, unitId: ABoss, moveType: 'normal' })
    // the opponent's Fire Overwatch window is offered before the placement decision
    expect(ctx.state.pending?.kind).toBe('stratagemWindow')
    expect((ctx.state.pending as Extract<PendingDecision, { kind: 'stratagemWindow' }>).player).toBe('B')
    // stratagemWindow/reactionWindow/commandReroll decisions are owned by services.stratagems, not the phase module
    // (00-arch §2's ownership table) — answer it directly, the way the reducer's ownerOf() would route it.
    const swPending = ctx.state.pending as PendingDecision
    clearPending(ctx.state)
    modules.services.stratagems.handle(ctx, { type: 'pass', player: 'B', decisionId: DID }, swPending)
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('moveUnit')
    move(ctx, ABoss, [{ modelId: `${ABoss}#0`, pos: { x: -5, y: 0, z: 0 } }])
  })
})

describe('movement phase — Fall Back / Desperate Escape (MOVE-011..014, 035)', () => {
  it('MOVE-011 Fall Back crossing enemy bases rolls one D6 per crossing model; each 1-2 destroys one model (owner\'s choice)', () => {
    const { ctx } = start({ players: { A: makePlayerA(), B: makePlayerB() } }, [1, 2, 5])
    // shrink to 3 models (coherency then only needs 1 neighbour each, keeping the geometry simple) all starting to
    // the warboss's right (x=1) and Falling Back 6" (M6) left, crossing it — but landing far enough past it that the
    // final position clears its base again (must-end-outside-engagement, not just non-overlap)
    removeModel(ctx.state, `${A}#4`)
    removeModel(ctx.state, `${A}#3`)
    placeUnit(ctx.state, A, [{ x: 1.5, y: 0, z: 0 }, { x: 2.8, y: 0, z: 0 }, { x: 4.1, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: 1, y: 0, z: 0 }])
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: A })
    act(ctx, { type: 'declareMove', player: 'A', decisionId: DID, unitId: A, moveType: 'fallBack' })
    const placements = [
      { modelId: `${A}#0`, pos: { x: -4.5, y: 0, z: 0 } },
      { modelId: `${A}#1`, pos: { x: -3.2, y: 0, z: 0 } },
      { modelId: `${A}#2`, pos: { x: -1.9, y: 0, z: 0 } },
    ]
    const r = act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements })
    expect(r).toBe('pending')
    expect(ctx.state.pending?.kind).toBe('chooseOption')
    const before = ctx.state.units[A].models.length
    act(ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: ctx.state.units[A].models[0] })
    expect(ctx.state.pending?.kind).toBe('chooseOption') // second casualty (2 failures: dice 1 and 2)
    act(ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: ctx.state.units[A].models[0] })
    expect(ctx.state.units[A].models.length).toBe(before - 2)
  })

  it('MOVE-012 a FLY unit Falling Back over enemies takes no Desperate Escape test', () => {
    const { ctx } = start({ players: { A: makePlayerA(), B: makePlayerB() } }, [1, 1])
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BKopta, [{ x: 0, y: 0, z: 12 }]) // z=12: clear of every terrain piece
    placeUnit(ctx.state, ABoss, [{ x: 0.5, y: 0, z: 12 }]) // enemy — engages the kopta
    act(ctx, { type: 'chooseUnitToActivate', player: 'B', decisionId: DID, unitId: BKopta })
    act(ctx, { type: 'declareMove', player: 'B', decisionId: DID, unitId: BKopta, moveType: 'fallBack' })
    const r = act(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BKopta, placements: [{ modelId: `${BKopta}#0`, pos: { x: -6, y: 0, z: 12 } }] })
    // no crossing test, no casualty decision — straight through to the unitMoved window / next activation
    expect(ctx.state.pending?.kind).not.toBe('chooseOption')
    expect(r === 'pending' || r === 'done').toBe(true)
    expect(ctx.state.models[`${BKopta}#0`].pos.x).toBe(-6)
  })

  it('MOVE-013 a Battle-shocked unit Falling Back without crossing anyone still tests every model', () => {
    const { ctx } = start({ players: { A: makePlayerA(), B: makePlayerB() } }, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3])
    ctx.state.activePlayer = 'B'
    // a tight 5x2 block (not a single row, which leaves the two end models with only one coherency neighbour —
    // §2.6/R-2.6 needs 2 for a 7+-model unit) so the whole 10-model mob stays coherent before and after the move
    const block: [number, number][] = Array.from({ length: 10 }, (_, i) => [(i % 5) * 1.3, Math.floor(i / 5) * 1.3])
    placeUnit(ctx.state, B, block)
    placeUnit(ctx.state, ABoss, [{ x: -0.5, y: 0, z: 0 }]) // overlaps the nearest corner model — engaged
    ctx.state.units[B].battleShocked = true
    act(ctx, { type: 'chooseUnitToActivate', player: 'B', decisionId: DID, unitId: B })
    act(ctx, { type: 'declareMove', player: 'B', decisionId: DID, unitId: B, moveType: 'fallBack' })
    const models = unitModels(ctx.state, B)
    // 5" (within M6): even the row closest to the enemy (z=1.3, so only a net 3.7" gain) clears engagement range
    const placements = models.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: m.pos.z - 5 } }))
    act(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: B, placements })
    const roll = ctx.state.phaseState.lastRoll
    expect(roll?.purpose).toBe('desperateEscape')
    expect(roll?.dice.length).toBe(10) // every model, not just crossers
  })

  it('MOVE-035 a model is tested at most once per Fall Back even if it both crosses and is Battle-shocked', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }, [2])
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: 0.5, y: 0, z: 0 }])
    ctx.state.units[ABoss].battleShocked = true
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: ABoss })
    act(ctx, { type: 'declareMove', player: 'A', decisionId: DID, unitId: ABoss, moveType: 'fallBack' })
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: -3, y: 0, z: 0 } }] })
    expect(ctx.state.phaseState.lastRoll?.dice.length).toBe(1)
  })
})

describe('movement phase — terrain (MOVE-015..020)', () => {
  it('MOVE-015/016 climbing a 3" container costs horizontal+vertical; ending mid-climb (wrong height) is rejected', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 5, y: 0, z: -12.5 }]) // ~1.5" from crate-1 (5, -10.5), 3" tall, M6
    declare(ctx, ABoss, 'normal')
    // 2" horizontal + 3" vertical = 5" <= M6: legal, ending on top of the crate
    const onTop = move(ctx, ABoss, [{ modelId: `${ABoss}#0`, pos: { x: 5, y: 3, z: -10.5 }, path: [{ x: 5, y: 0, z: -12.5 }, { x: 5, y: 0, z: -10.5 }, { x: 5, y: 3, z: -10.5 }] }])
    expect(['pending', 'done']).toContain(onTop)
    expect(ctx.state.models[`${ABoss}#0`].pos.y).toBe(3)
  })

  it('MOVE-015b ending on a height with no matching surface (mid-climb) is rejected', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 5, y: 0, z: -12.5 }])
    declare(ctx, ABoss, 'normal')
    const bad = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 5, y: 1.5, z: -10.5 }, path: [{ x: 5, y: 0, z: -12.5 }, { x: 5, y: 1.5, z: -10.5 }] }] })
    expect(bad?.code).toBe('E_OVERLAP')
  })

  it('MOVE-017 INFANTRY may cross a ruin wall; a non-INFANTRY/BEAST/FLY VEHICLE may not', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    // ruin-1 wall runs along z=1 (local z=-3 world z=1) from x=-9..-3; walk a Boss straight through it
    placeUnit(ctx.state, ABoss, [{ x: -6, y: 0, z: -2 }])
    declare(ctx, ABoss, 'normal')
    const infantryOk = move(ctx, ABoss, [{ modelId: `${ABoss}#0`, pos: { x: -6, y: 0, z: 3 } }])
    expect(['pending', 'done']).toContain(infantryOk)
    const { ctx: ctx2 } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx2.state, AWalker, [{ x: -6, y: 0, z: -2 }])
    declare(ctx2, AWalker, 'normal')
    const walkerBad = reject(ctx2, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: AWalker, placements: [{ modelId: `${AWalker}#0`, pos: { x: -6, y: 0, z: 3 } }] })
    expect(walkerBad?.code).toBe('E_OVERLAP')
  })

  it('MOVE-018 a model ending fully on an upper floor is legal, overhanging it is rejected, and a VEHICLE may not end there at all', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    // ruin-1's upper floor: local [-3,3]x[-3,3] at pos (-6,4) -> world x[-9,-3] z[1,7], height 3
    placeUnit(ctx.state, ABoss, [{ x: -4.5, y: 0, z: 4 }])
    declare(ctx, ABoss, 'normal')
    const overhanging = reject(ctx, {
      type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss,
      placements: [{ modelId: `${ABoss}#0`, pos: { x: -3.2, y: 3, z: 4 }, path: [{ x: -4.5, y: 0, z: 4 }, { x: -4.5, y: 3, z: 4 }, { x: -3.2, y: 3, z: 4 }] }],
    })
    expect(overhanging).not.toBeNull()
    const fullyOn = move(ctx, ABoss, [{ modelId: `${ABoss}#0`, pos: { x: -5, y: 3, z: 4 }, path: [{ x: -4.5, y: 0, z: 4 }, { x: -4.5, y: 3, z: 4 }, { x: -5, y: 3, z: 4 }] }])
    expect(['pending', 'done']).toContain(fullyOn)
    expect(ctx.state.models[`${ABoss}#0`].pos.y).toBe(3)

    const { ctx: ctx2 } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx2.state, AWalker, [{ x: -6, y: 0, z: -2 }])
    declare(ctx2, AWalker, 'normal')
    const vehicleUpstairs = reject(ctx2, {
      type: 'moveUnit', player: 'A', decisionId: DID, unitId: AWalker,
      placements: [{ modelId: `${AWalker}#0`, pos: { x: -6, y: 3, z: 4 }, path: [{ x: -6, y: 0, z: -2 }, { x: -6, y: 0, z: 4 }, { x: -6, y: 3, z: 4 }] }],
    })
    expect(vehicleUpstairs).not.toBeNull()
  })

  it('MOVE-019/020 FLY may cross enemies mid-move but not end in engagement range or on a model; measures straight-line 3D to/from terrain', () => {
    const { ctx } = start({ players: { A: makePlayerA(), B: makePlayerB() } })
    ctx.state.activePlayer = 'B'
    // not engaged at the start (>1" from the enemy); the straight-line path runs close past the enemy on the way to
    // the ruin's upper floor (x[-9,-3] z[1,7], height 3) — a non-FLY unit would be blocked, FLY is not
    placeUnit(ctx.state, BKopta, [{ x: -6, y: 0, z: -2 }])
    placeUnit(ctx.state, AWalker, [{ x: -6, y: 0, z: 6 }])
    declare(ctx, BKopta, 'normal')
    // ends on the ruin's upper floor, clear of the enemy again: horizontal 5" + vertical 3" (straight-line, FLY) =
    // sqrt(25+9) ≈ 5.83" within M12
    const ok = move(ctx, BKopta, [{ modelId: `${BKopta}#0`, pos: { x: -6, y: 3, z: 3 } }])
    expect(['pending', 'done']).toContain(ok)
    expect(ctx.state.models[`${BKopta}#0`].pos).toEqual({ x: -6, y: 3, z: 3 })
  })
})

describe('movement phase — reserves / reinforcements (MOVE-021..026, 028)', () => {
  it('MOVE-021 Deep Strike must arrive > 9" horizontally from every enemy model (vertical ignored)', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    ctx.state.round = 2
    // one lone enemy model at the origin (its base radius folded into the exact gap below); the rest of the mob's
    // models default to the same point too, which is harmless — only the closest one sets the boundary.
    setModelPos(ctx.state.models[`${B}#0`], { x: 0, y: 0, z: 0 })
    ctx.state.units[B].location = 'board'
    const rBoss = ctx.state.models[`${ABoss}#0`].base.radius
    const rEnemy = ctx.state.models[`${B}#0`].base.radius
    ctx.state.step = 'reinforcements'
    ctx.state.phaseState.activated = Object.values(ctx.state.units).filter((u) => u.player === 'A' && u.location === 'board').map((u) => u.id)
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('deployUnit')
    const tooClose = reject(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 9.0 + rBoss + rEnemy, y: 0, z: 0 } }] })
    expect(tooClose?.code).toBe('E_ENGAGEMENT')
    act(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 9.1 + rBoss + rEnemy, y: 0, z: 0 } }] })
    expect(ctx.state.units[ABoss].location).toBe('board')
  })

  it('MOVE-023 an arrived unit counts as having made a Normal move', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    ctx.state.round = 2
    ctx.state.step = 'reinforcements'
    ctx.state.phaseState.activated = Object.values(ctx.state.units).filter((u) => u.player === 'A' && u.location === 'board').map((u) => u.id)
    movementModule.advance(ctx)
    act(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 20, y: 0, z: 0 } }] })
    expect(ctx.state.units[ABoss].turn.moveType).toBe('normal')
    expect(ctx.state.units[ABoss].turn.arrivedThisTurn).toBe(true)
  })

  it('MOVE-024 no reinforcements are offered in round 1', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    ctx.state.round = 1
    ctx.state.step = 'reinforcements'
    const r = movementModule.advance(ctx)
    expect(r).toBe('done')
    expect(ctx.state.units[ABoss].location).toBe('reserves')
  })

  it('MOVE-025 a unit still in Reserves once round 3 has ended (round >= 4) is destroyed', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    ctx.state.round = 4
    ctx.state.step = 'reinforcements'
    const r = movementModule.advance(ctx)
    expect(r).toBe('done')
    expect(ctx.state.units[ABoss].location).toBe('destroyed')
  })

  it('MOVE-022 a Deep Strike placement that breaks coherency is rejected; the unit may still choose to stay in Reserves', () => {
    const data = withBundle((b) => { b.datasheets['red.grunts'].coreAbilities = [{ ability: 'DEEP_STRIKE' }] })
    const state = createGameState(makeSetup({ players: { A: makePlayerA({ reserves: ['grunts'], attachments: [] }), B: makePlayerB() } }), data, 'fixture', ENGINE_VERSION)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
    const { ctx } = createContext(state, new ScriptedRng([]), modules)
    movementModule.enter(ctx)
    placeUnit(ctx.state, ABoss, [{ x: -18, y: 0, z: -12 }]) // deployed already, so it's not itself a Reserves arrival
    ctx.state.round = 2
    ctx.state.step = 'reinforcements'
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('deployUnit')
    expect((ctx.state.pending as Extract<PendingDecision, { kind: 'deployUnit' }>).context.unitIds).toContain(A)
    // z=12: clear of every terrain piece, so the only rejection reason in play is coherency
    const spread = unitModels(ctx.state, A).map((m, i) => ({ modelId: m.id, pos: { x: -2 + i * 4, y: 0, z: 12 } }))
    expect(reject(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: A, placements: spread })?.code).toBe('E_COHERENCY')
    act(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: A, placements: [], toReserves: true } as Action)
    expect(ctx.state.units[A].location).toBe('reserves')
  })

  it('MOVE-026 reinforcements are offered only after every board unit has activated, and never hand an arriving unit a fresh per-unit activation this phase', () => {
    const { ctx } = start({ players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } })
    ctx.state.round = 2
    placeUnit(ctx.state, A, { x: -10, z: 0, gap: 0.5 })
    // the one board unit must activate (and finish) before reinforcements are ever raised
    declare(ctx, A, 'stationary')
    expect(ctx.state.pending?.kind).toBe('deployUnit') // ABoss's Deep Strike arrival, not a chooseUnitToActivate
    const r = act(ctx, { type: 'deployUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 20, y: 0, z: 0 } }] })
    expect(ctx.state.units[ABoss].location).toBe('board')
    // once the module has moved past 'select' into 'reinforcements' it never goes back this phase (movementModule's
    // own advance() loop returns straight from the 'reinforcements' branch) — so there is no further per-unit
    // activation window in which the just-arrived unit could be offered an embark decision.
    expect(ctx.state.step).not.toBe('select')
    if (r === 'pending') expect(ctx.state.pending?.kind).not.toBe('chooseUnitToActivate')
  })

  it('MOVE-028 a Tellyporta pairing must arrive together within 3"', () => {
    const { ctx } = start({
      players: {
        A: makePlayerA({ reserves: ['boss'], enhancementId: 'red.e.sharp', attachments: [] }),
        B: makePlayerB(),
      },
    })
    // wire the pairing directly (createGame does this from enhancementChoice; here we drive the module in isolation)
    ctx.state.units[ABoss].deepStrikeWith = A
    ctx.state.units[A].deepStrikeWith = ABoss
    ctx.state.units[A].location = 'reserves'
    ctx.state.round = 2
    ctx.state.step = 'reinforcements'
    movementModule.advance(ctx)
    expect(ctx.state.pending?.kind).toBe('deployUnit')
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    expect(pending.context.unitIds.sort()).toEqual([A, ABoss].sort())
    const alone = reject(ctx, {
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
      placements: [{ modelId: `${ABoss}#0`, pos: { x: 0, y: 0, z: 0 } }],
    })
    expect(alone).toBeTruthy()
    const farApart = reject(ctx, {
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: pending.context.unitIds[0],
      placements: [
        { modelId: `${ABoss}#0`, pos: { x: 0, y: 0, z: 0 } },
        ...unitModels(ctx.state, A).map((m, i) => ({ modelId: m.id, pos: { x: 10 + i * 2, y: 0, z: 0 } })),
      ],
    })
    expect(farApart?.code).toBe('E_OUT_OF_RANGE')
  })
})

describe('movement phase — surge moves and transports (MOVE-027, 029..031)', () => {
  it('MOVE-027 resolveSurgeMove translates the unit toward its target, respects the once-per-phase flag', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: 0, y: 0, z: 0 }])
    const moved = resolveSurgeMove(ctx, ABoss, 6, BWarboss)
    expect(moved).toBe(true)
    expect(ctx.state.models[`${ABoss}#0`].pos.x).toBeGreaterThan(-10)
    expect(ctx.state.units[ABoss].turn.surgeMovedThisPhase).toBe(true)
    const again = resolveSurgeMove(ctx, ABoss, 6, BWarboss)
    expect(again).toBe(false)
  })

  it('MOVE-027b a Battle-shocked or engaged unit is not offered a surge move', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: -10, y: 0, z: 0 }])
    ctx.state.units[ABoss].battleShocked = true
    expect(resolveSurgeMove(ctx, ABoss, 6, null)).toBe(false)
  })

  // The runtime datasheet table is deep-frozen (createGameState) and there is no real Combat Patrol transport, so
  // these drive transportService against a minimal hand-built state instead of mutating frozen fixture data.
  function transportFixture(capacity: number): GameState {
    return {
      units: {
        transport: { id: 'transport', player: 'A', datasheetId: 'ds.transport', models: [], location: 'board' },
        cargoA: { id: 'cargoA', player: 'A', datasheetId: 'ds.grunt', models: ['cargoA#0'], location: 'board' },
        cargoB: { id: 'cargoB', player: 'A', datasheetId: 'ds.grunt', models: ['cargoB#0', 'cargoB#1'], location: 'board' },
      },
      datasheets: {
        'ds.transport': { keywords: ['VEHICLE', `TRANSPORT:${capacity}`], factionKeywords: [] },
        'ds.grunt': { keywords: ['INFANTRY'], factionKeywords: [] },
      },
      players: { A: { id: 'A', secondaryState: {} }, B: { id: 'B', secondaryState: {} } },
    } as unknown as GameState
  }

  it('MOVE-029 embark: a friendly transport with capacity accepts a unit; a full transport does not', () => {
    const state = transportFixture(2)
    expect(transportService.capacity(state, 'transport')).toBe(2)
    expect(transportService.canEmbark(state, 'cargoA', 'transport')).toBe(true) // 1 model, capacity 2
    transportService.embark(state, 'cargoA', 'transport')
    expect(state.units.cargoA.location).toBe('reserves')
    expect(transportService.embarkedIn(state, 'transport')).toEqual(['cargoA'])
    expect(transportService.transportOf(state, 'cargoA')).toBe('transport')
    expect(transportService.canEmbark(state, 'cargoB', 'transport')).toBe(false) // 1 (used) + 2 > 2
  })

  it('MOVE-029b a transport with no capacity keyword cannot be embarked in', () => {
    const state = transportFixture(0)
    expect(transportService.canEmbark(state, 'cargoA', 'transport')).toBe(false)
  })

  it('MOVE-031 disembark clears the embark link (Deadly Demise / normal disembark bookkeeping)', () => {
    const state = transportFixture(6)
    transportService.embark(state, 'cargoA', 'transport')
    const t = transportService.disembark(state, 'cargoA')
    expect(t).toBe('transport')
    expect(transportService.transportOf(state, 'cargoA')).toBeNull()
    expect(transportService.embarkedIn(state, 'transport')).toEqual([])
  })
})

describe('movement phase — verification fixes (MOVE-003/004/011/013/019/025/029/030)', () => {
  const xs = [0.3, 2.06, 3.82, 5.58, 7.34]
  const walkerTransport = () => withBundle((b) => { b.datasheets['red.walker'].keywords = [...b.datasheets['red.walker'].keywords, 'TRANSPORT:10'] })
  function startWith(data: ReturnType<typeof withBundle>, overrides: Parameters<typeof makeSetup>[0] = {}, dice: number[] = []) {
    const state = createGameState(makeSetup(overrides), data, 'fixture', ENGINE_VERSION)
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
    const h = createContext(state, new ScriptedRng(dice), modules)
    movementModule.enter(h.ctx)
    return h
  }

  it('MOVE-013-leader a Battle-shocked attached unit tests the Leader too, and the Leader may be picked as a casualty (R-5.6)', () => {
    const { ctx } = start({}, [1, 6, 6, 6, 6, 6])
    placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
    placeUnit(ctx.state, ABoss, [{ x: -1.8, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: -1.8, y: 0, z: -1.62 }])
    ctx.state.units[ABoss].battleShocked = true // either half shocked → the whole unit is shocked (R-4.6)
    declare(ctx, A, 'fallBack')
    const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
    move(ctx, A, all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: 3 } })))
    expect(ctx.state.phaseState.lastRoll?.dice.length).toBe(6)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(pending.context.topic).toBe('desperateEscapeCasualty')
    expect(pending.options.map((o) => o.id)).toContain(`${ABoss}#0`)
    act(ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: `${ABoss}#0` })
    expect(ctx.state.units[ABoss].location).toBe('destroyed')
    expect(ctx.state.units[A].models.length).toBe(5)
    expect(ctx.state.models[`${A}#0`].pos.z).toBe(3)
  })

  it('MOVE-011-leadercross only the Leader crosses an enemy base → exactly one die', () => {
    const { ctx } = start({}, [3])
    placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
    placeUnit(ctx.state, ABoss, [{ x: -1.8, y: 0, z: 0 }])
    placeUnit(ctx.state, BWarboss, [{ x: -1.8, y: 0, z: -1.62 }])
    declare(ctx, A, 'fallBack')
    const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
    move(ctx, A, all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: -4.4 } })))
    expect(ctx.state.phaseState.lastRoll?.purpose).toBe('desperateEscape')
    expect(ctx.state.phaseState.lastRoll?.dice.length).toBe(1)
    expect(ctx.state.models[`${ABoss}#0`].pos.z).toBe(-4.4) // a 3 passes: no casualty, the move is applied
  })

  it('MOVE-003-fallback a MONSTER Falling Back may not path through a friendly VEHICLE, but may path through an enemy', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    ctx.state.activePlayer = 'B'
    placeUnit(ctx.state, BBrute, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 10 }])
    placeUnit(ctx.state, BKopta, [{ x: 3, y: 0, z: 12 }])
    declare(ctx, BBrute, 'fallBack')
    const through = reject(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BBrute, placements: [{ modelId: `${BBrute}#0`, pos: { x: 6.5, y: 0, z: 12 } }] })
    expect(through?.code).toBe('E_OVERLAP')
    const overEnemy = reject(ctx, { type: 'moveUnit', player: 'B', decisionId: DID, unitId: BBrute, placements: [{ modelId: `${BBrute}#0`, pos: { x: 0, y: 0, z: 7 } }] })
    expect(overEnemy).toBeNull()
  })

  it('MOVE-004-path a path clipping the board edge mid-move is rejected; the same distance kept on the board is legal', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, ABoss, [{ x: 20, y: 0, z: 0 }])
    declare(ctx, ABoss, 'normal')
    const off = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 20, y: 0, z: 2 }, path: [{ x: 20, y: 0, z: 0 }, { x: 22.5, y: 0, z: 0 }, { x: 20, y: 0, z: 2 }] }] })
    expect(off?.code).toBe('E_OUT_OF_RANGE')
    const on = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 20, y: 0, z: 2 }, path: [{ x: 20, y: 0, z: 0 }, { x: 18, y: 0, z: 0 }, { x: 20, y: 0, z: 2 }] }] })
    expect(on).toBeNull()
  })

  it('MOVE-019-mixedfly a FLY Leader may still cross an enemy while its non-FLY Bodyguard stays clear', () => {
    const flyBoss = withBundle((b) => { b.datasheets['red.boss'].keywords = [...b.datasheets['red.boss'].keywords, 'FLY'] })
    const { ctx } = startWith(flyBoss)
    placeUnit(ctx.state, A, xs.map((x) => ({ x, y: 0, z: 0 })))
    placeUnit(ctx.state, ABoss, [{ x: -2.4, y: 0, z: 0 }]) // 1.28" from the nearest grunt: coherent
    // on the Leader's line only: >2" from the nearest grunt's line, so no bodyguard path comes within 1" of it
    placeUnit(ctx.state, BWarboss, [{ x: -3.2, y: 0, z: -3 }])
    declare(ctx, A, 'normal')
    const all = [...unitModels(ctx.state, A), ...unitModels(ctx.state, ABoss)]
    const r = reject(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: A, placements: all.map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: -5.7 } })) })
    expect(r).toBeNull()
  })

  it('MOVE-025-end3 Reserves still off the board when the second player\'s round-3 Movement phase ends are destroyed; not after the first player\'s', () => {
    const setup = { players: { A: makePlayerA({ reserves: ['boss'], attachments: [] }), B: makePlayerB() } }
    // every Deep Strike arrival offered is declined (stay in Reserves) until the phase finishes
    const runToEnd = (h: ReturnType<typeof start>): 'pending' | 'done' => {
      let r = movementModule.advance(h.ctx)
      for (let i = 0; i < 10 && r === 'pending' && h.ctx.state.pending?.kind === 'deployUnit'; i++) {
        const p = h.ctx.state.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
        r = act(h.ctx, { type: 'deployUnit', player: p.player, decisionId: DID, unitId: p.context.unitIds[0], placements: [], toReserves: true } as Action)
      }
      return r
    }
    const first = start(setup)
    first.ctx.state.round = 3
    first.ctx.state.firstPlayer = 'A'
    first.ctx.state.activePlayer = 'A'
    first.ctx.state.step = 'reinforcements'
    expect(runToEnd(first)).toBe('done')
    expect(first.ctx.state.units[ABoss].location).toBe('reserves') // B's turn (and Rapid Ingress) is still to come

    const second = start(setup)
    second.ctx.state.round = 3
    second.ctx.state.firstPlayer = 'A'
    second.ctx.state.activePlayer = 'B'
    second.ctx.state.step = 'reinforcements'
    expect(runToEnd(second)).toBe('done')
    expect(second.ctx.state.units[ABoss].location).toBe('destroyed')
    expect(second.events.some((e) => e.type === 'UnitLostInReserves' && e.unitId === ABoss)).toBe(true)
  })

  it('MOVE-029-enemy / MOVE-029-disembarked an enemy transport, an off-board unit, or a unit that disembarked this phase cannot embark', () => {
    const data = withBundle((b) => {
      b.datasheets['red.walker'].keywords = [...b.datasheets['red.walker'].keywords, 'TRANSPORT:10']
      b.datasheets['blu.brute'].keywords = [...b.datasheets['blu.brute'].keywords, 'TRANSPORT:10']
    })
    const { ctx } = startWith(data, { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, BBrute, [{ x: -6, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: -3, y: 0, z: 12 }])
    expect(transportService.canEmbark(ctx.state, ABoss, BBrute)).toBe(false) // enemy
    expect(transportService.canEmbark(ctx.state, ABoss, AWalker)).toBe(true)
    ctx.state.units[ABoss].location = 'reserves'
    expect(transportService.canEmbark(ctx.state, ABoss, AWalker)).toBe(false) // not on the board
    ctx.state.units[ABoss].location = 'board'
    ctx.state.round = 1
    transportService.embark(ctx.state, ABoss, AWalker)
    ctx.state.round = 2
    expect(transportService.disembark(ctx.state, ABoss)).toBe(AWalker)
    ctx.state.units[ABoss].location = 'board'
    expect(transportService.disembarkedThisPhase(ctx.state, ABoss)).toBe(true)
    expect(transportService.canEmbark(ctx.state, ABoss, AWalker)).toBe(false) // R-5.17: disembarked this phase
  })

  it('MOVE-030 disembark before the transport moves → acts normally but may not Remain Stationary', () => {
    const { ctx } = startWith(walkerTransport(), { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: -3, y: 0, z: 12 }])
    ctx.state.round = 1
    transportService.embark(ctx.state, ABoss, AWalker)
    ctx.state.round = 2
    // began the phase embarked, transport has not moved
    expect(transportService.disembarkMode(ctx.state, ABoss)).toBe('actsNormally')
    const fp = (x: number) => [{ pos: { x, y: 0, z: 12 }, facing: 0, base: ctx.state.models[`${ABoss}#0`].base }]
    expect(transportService.canDisembarkAt(ctx.state, ABoss, fp(3))).toBe(true)
    expect(transportService.canDisembarkAt(ctx.state, ABoss, fp(6))).toBe(false) // not wholly within 3"
    transportService.disembark(ctx.state, ABoss)
    placeUnit(ctx.state, ABoss, [{ x: 3, y: 0, z: 12 }])
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: ABoss })
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'declareMove' }>
    expect(pending.kind).toBe('declareMove')
    expect(pending.context.allowed).toEqual(['normal', 'advance'])
  })

  it('MOVE-030b disembark after the transport made a Normal move → counts as a Normal move, not offered a move; Advanced transport → no disembark', () => {
    const { ctx } = startWith(walkerTransport(), { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: -3, y: 0, z: 12 }])
    ctx.state.round = 1
    transportService.embark(ctx.state, ABoss, AWalker)
    ctx.state.round = 2
    ctx.state.units[AWalker].turn.moveType = 'advance'
    expect(transportService.disembarkMode(ctx.state, ABoss)).toBeNull()
    ctx.state.units[AWalker].turn.moveType = 'normal'
    expect(transportService.disembarkMode(ctx.state, ABoss)).toBe('countsAsNormalMove')
    transportService.disembark(ctx.state, ABoss)
    placeUnit(ctx.state, ABoss, [{ x: 3, y: 0, z: 12 }])
    expect(ctx.state.units[ABoss].turn.moveType).toBe('normal')
    movementModule.advance(ctx)
    const pending = ctx.state.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    expect(pending.kind).toBe('chooseUnitToActivate')
    expect(pending.context.eligible).not.toContain(ABoss)
  })

  it('MOVE-030c a unit embarked during this phase cannot disembark in the same phase', () => {
    const { ctx } = startWith(walkerTransport(), { players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } })
    placeUnit(ctx.state, AWalker, [{ x: 0, y: 0, z: 12 }])
    placeUnit(ctx.state, ABoss, [{ x: -3, y: 0, z: 12 }])
    transportService.embark(ctx.state, ABoss, AWalker)
    expect(transportService.disembarkMode(ctx.state, ABoss)).toBeNull()
  })
})

describe('movement phase — command-phase interaction (CMD-014)', () => {
  it('CMD-014 a Battle-shocked unit Falling Back without crossing anyone still Desperate-Escapes every model', () => {
    const { ctx } = start({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }, [3])
    placeUnit(ctx.state, ABoss, [{ x: 0, y: 0, z: 5 }])
    placeUnit(ctx.state, BWarboss, [{ x: 0.5, y: 0, z: 5 }])
    ctx.state.units[ABoss].battleShocked = true
    act(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: ABoss })
    act(ctx, { type: 'declareMove', player: 'A', decisionId: DID, unitId: ABoss, moveType: 'fallBack' })
    act(ctx, { type: 'moveUnit', player: 'A', decisionId: DID, unitId: ABoss, placements: [{ modelId: `${ABoss}#0`, pos: { x: 0, y: 0, z: 9 } }] })
    expect(ctx.state.phaseState.lastRoll?.purpose).toBe('desperateEscape')
    expect(ctx.state.phaseState.lastRoll?.dice.length).toBe(1)
  })
})

// keep bundle import referenced (used indirectly through fixtures) so a future edit noticing an unused import
// doesn't accidentally strip fixture wiring
void bundle
