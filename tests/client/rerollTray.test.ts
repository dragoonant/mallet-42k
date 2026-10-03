// The dice behind the interactive re-roll tray (src/client/ui/rerollInfo.ts): which dice of a batch pass,
// what the tray lets the player pick, and which action each answer dispatches.
import { describe, expect, it } from 'vitest'
import type { ChooseOptionDecision, CommandRerollDecision, DiceRoll, GameState } from '../../src/engine'
import { critWouldPay, dieOutcomes, rerollSummary, rerollTrayModel } from '../../src/client/ui/rerollInfo'

const state = {
  units: { u1: { id: 'u1', name: 'Intercessors' }, u2: { id: 'u2', name: 'Boyz' } },
  weapons: {
    bolt: { id: 'bolt', name: 'Bolt rifle', skill: 3, abilities: [{ ability: 'SUSTAINED_HITS' }] },
    plain: { id: 'plain', name: 'Slugga', skill: 5, abilities: [] },
  },
} as unknown as GameState

function roll(over: Partial<DiceRoll>): DiceRoll {
  return {
    id: 'r1', purpose: 'hit', sides: 6, dice: [1, 3, 6, 2], rerolled: null, modifiers: [], final: [1, 3, 6, 2],
    player: 'A', unitId: 'u1', modelId: null, weaponId: 'bolt', targetUnitId: 'u2', commandRerollable: true, needed: 3, ...over,
  } as DiceRoll
}

const cmd = (r: DiceRoll, selectable: boolean): CommandRerollDecision => ({
  id: 'd:1', kind: 'commandReroll', player: 'A', window: 'any.rollMade', canPass: true,
  context: { roll: r, selectableDice: selectable },
  options: selectable
    ? r.dice.map((_, i) => i).filter((i) => !(r.rerolled ?? []).includes(i)).map((i) => ({ id: `reroll:${i}`, label: '', action: { type: 'commandReroll', player: 'A', decisionId: 'd:1', rollId: r.id, dieIndex: i } }))
    : [{ id: 'reroll', label: '', action: { type: 'commandReroll', player: 'A', decisionId: 'd:1', rollId: r.id } }],
} as unknown as CommandRerollDecision)

const offer = (r: DiceRoll, dieIndexes: number[], purpose = 'hit'): ChooseOptionDecision => ({
  id: 'd:2', kind: 'chooseOption', player: 'A', window: 'any.rollMade', canPass: false,
  context: { topic: 'rerollOffer', unitId: 'u1', abilityId: null, data: { rollId: r.id, dieIndexes, needed: 3, purpose } },
  options: [
    { id: 'reroll', label: 'Re-roll', action: { type: 'chooseOption', player: 'A', decisionId: 'd:2', optionId: 'reroll' } },
    { id: 'keep', label: 'Keep', action: { type: 'chooseOption', player: 'A', decisionId: 'd:2', optionId: 'keep' } },
  ],
} as unknown as ChooseOptionDecision)

describe('re-roll tray model', () => {
  it('judges each die of a batch against the roll\'s needed number (1 fails, 6 passes)', () => {
    expect(dieOutcomes(state, [], roll({}))).toEqual(['fail', 'success', 'success', 'fail'])
    expect(dieOutcomes(state, [], roll({ purpose: 'save', dice: [1, 6, 2, 3], needed: 3 }))).toEqual(['fail', 'success', 'fail', 'success'])
    expect(dieOutcomes(state, [], roll({ purpose: 'advance', needed: undefined }))).toEqual(['neutral', 'neutral', 'neutral', 'neutral'])
  })

  it('summarises a batch without reading per-die events', () => {
    const s = rerollSummary(state, [], roll({}))
    expect(s.line).toBe('Rolled 4 dice — needs 3+ to hit. 2 of 4 failed.')
    expect(s.failed).toBe(true)
  })

  it('Command Re-roll of a batch picks exactly one die and dispatches that die', () => {
    const r = roll({ rerolled: [2] })
    const m = rerollTrayModel(state, [], cmd(r, true), r)!
    expect(m.mode).toBe('one')
    expect(m.free).toBe(false)
    expect(m.selectable).toEqual([0, 1, 3])
    expect(m.locked).toEqual([2])
    expect(m.reroll([3])).toMatchObject({ type: 'commandReroll', dieIndex: 3 })
    expect(m.reroll([0, 1])).toBeNull()
    expect(m.reroll([])).toBeNull()
  })

  it('a whole-roll Command Re-roll has no die picker', () => {
    const r = roll({ purpose: 'charge', dice: [3, 4], final: [3, 4], needed: undefined })
    const m = rerollTrayModel(state, [], cmd(r, false), r)!
    expect(m.mode).toBe('whole')
    expect(m.reroll([])).toMatchObject({ type: 'commandReroll', rollId: 'r1' })
  })

  it('an ability offer lets any offered die be toggled and sends the chosen subset', () => {
    const r = roll({ dice: [4, 5, 6, 3], final: [4, 5, 6, 3] })
    const m = rerollTrayModel(state, [], offer(r, [0, 1, 3]), r)!
    expect(m.mode).toBe('many')
    expect(m.free).toBe(true)
    expect(m.selectable).toEqual([0, 1, 3])
    expect(m.failedSelectable).toEqual([])
    expect(m.reroll([3, 0])).toMatchObject({ type: 'chooseOption', optionId: 'reroll', dieIndexes: [0, 3] })
  })

  it('a charge offer re-rolls the whole roll with no dieIndexes', () => {
    const r = roll({ purpose: 'charge', dice: [2, 3], final: [2, 3], needed: undefined })
    const m = rerollTrayModel(state, [], offer(r, [0, 1], 'charge'), r)!
    expect(m.mode).toBe('whole')
    expect(m.reroll([])).toEqual(expect.not.objectContaining({ dieIndexes: expect.anything() }))
  })
})

describe('critWouldPay on batches', () => {
  it('is true only while an offered die can still turn into a 6 for a crit-paying weapon', () => {
    const r = roll({ dice: [3, 6, 4, 6], final: [3, 6, 4, 6] })
    expect(critWouldPay(state, r, [0, 2])).toBe(true)
    expect(critWouldPay(state, r, [1, 3])).toBe(false)
    expect(critWouldPay(state, roll({ weaponId: 'plain' }), [0])).toBe(false)
  })
})
