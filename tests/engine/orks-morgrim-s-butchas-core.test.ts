// Morgrim's Butchas engine change beyond a code hook (docs/spec/factions/orks--morgrim-s-butchas.md 7.1 C1; checklist MOR-3.1).
// Drives attack.ts directly with a stand-in ability on the defending leader (Sv3+, invuln 4+).
import { describe, expect, it } from 'vitest'
import {
  ENGINE_VERSION, ScriptedRng, DEFAULT_MODULES, createGameState, createContext,
  type DeclaredTarget, type GameEvent, type GameState, type PendingDecision,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import type { DataBundle } from '../../src/data/types'
import { withBundle } from '../fixtures/bundle'
import { makeSetup, makePlayerA, makePlayerB } from '../fixtures/setup'
import { placeUnit } from '../fixtures/state'

function stateWith(modifyRoll: { roll: 'save'; value: number; armourOnly?: boolean }, ap: number): GameState {
  const b = withBundle((d: DataBundle) => {
    ;(d.weapons['red.w.fist'] as any).AP = ap
    d.abilities['test.save-bonus'] = { id: 'test.save-bonus', name: 'Test', text: '', trigger: 'saveRoll', effect: { modifyRoll }, scope: { who: 'self' } } as any
    d.datasheets['red.boss'].abilities = [...d.datasheets['red.boss'].abilities, 'test.save-bonus']
  })
  const s = createGameState(makeSetup({ players: { A: makePlayerA({ attachments: [] }), B: makePlayerB() } }), b, 'seed', ENGINE_VERSION)
  s.phase = 'fight'
  placeUnit(s, 'A:grunts', { x: -10, z: -5, gap: 0.5 })
  placeUnit(s, 'A:boss', [[30, 30]])
  placeUnit(s, 'A:walker', [[-16, -5]])
  placeUnit(s, 'B:mob', { x: -10, z: 0, gap: 0.5 })
  placeUnit(s, 'B:brute', [[0, 0]])
  placeUnit(s, 'B:kopta', [[10, 0]])
  return s
}

function saveOnBoss(state: GameState, die: number) {
  const { ctx, events } = createContext(state, new ScriptedRng([6, 6, die, ...Array(40).fill(2)]), DEFAULT_MODULES)
  const t: DeclaredTarget = { modelId: 'A:walker#0', weaponId: 'red.w.fist', targetUnitId: 'A:boss', profileGroup: null, attacks: 1 }
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:walker', overwatch: false, targets: [t] })
  let r = attackService.advance(ctx)
  let guard = 0
  while (r === 'pending') {
    if (++guard > 500) throw new Error('loop')
    const p = ctx.state.pending as PendingDecision
    const a = (p as any).options[0].action
    ctx.state.pending = null
    const rej = (p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler).handle(ctx, a, p)
    if (rej) throw new Error(rej.reason)
    r = attackService.advance(ctx)
  }
  return (events as GameEvent[]).filter((e): e is Extract<GameEvent, { type: 'SaveRolled' }> => e.type === 'SaveRolled')[0]
}

describe('armour-only save modifier', () => {
  it('MOR-011 armourOnly +1 improves the armour save', () => {
    // AP-1: Sv3+ needs 4+; +1 makes a 3 pass (3-1+1 = 3 >= 3), invuln 4+ is not better
    const save = saveOnBoss(stateWith({ roll: 'save', value: 1, armourOnly: true }, -1), 3)
    expect(save).toMatchObject({ kind: 'armour', saved: true })
  })

  it('MOR-012 armourOnly +1 never improves the invulnerable save', () => {
    // AP-3: armour 6+ (5+ with the bonus) loses to invuln 4+; a 3 must fail because the bonus does not apply to the invuln
    const save = saveOnBoss(stateWith({ roll: 'save', value: 1, armourOnly: true }, -3), 3)
    expect(save).toMatchObject({ kind: 'invuln', needed: 4, saved: false })
    expect(saveOnBoss(stateWith({ roll: 'save', value: 1, armourOnly: true }, -3), 4)).toMatchObject({ kind: 'invuln', saved: true })
  })

  it('MOR-3.1 control: a plain +1 save modifier still improves the invulnerable save', () => {
    const save = saveOnBoss(stateWith({ roll: 'save', value: 1 }, -3), 3)
    expect(save).toMatchObject({ kind: 'invuln', saved: true })
  })
})
