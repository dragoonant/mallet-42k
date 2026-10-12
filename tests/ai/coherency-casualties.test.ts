// AI casualty picks respect unit coherency (R-2.6): when the bot chooses which of its models takes a failed save, it
// must not pick the model whose death splits the unit (the end-of-turn cull would then take more), and in the cull it
// removes the stray model rather than the first one listed.
import { describe, expect, it } from 'vitest'
import { isCoherent, unitModelsForCoherency, view, type Action, type GameState, type PendingDecision } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { freshState, placeUnit } from '../fixtures/state'

async function pick(state: GameState, pending: PendingDecision): Promise<Action> {
  state.pending = pending
  const options = (pending as { options: { action: Action }[] }).options
  const legal = options.map((o) => ({ ...o.action, decisionId: pending.id }) as Action)
  return new UtilityDecider('normal', 'coherency').decide(view(state, pending.player), pending, legal)
}

function coherentWithout(state: GameState, unitId: string, modelId: string): boolean {
  return isCoherent(unitModelsForCoherency(state, unitId).filter((m) => m.id !== modelId))
}

describe('AI casualty selection keeps units coherent', () => {
  it('allocates a failed save to an end-of-line model, not a link in the chain', async () => {
    const state = freshState()
    // 5 grunts in a line, each only within 2" of its neighbours: removing any middle model splits the unit
    placeUnit(state, 'A:grunts', [[-10, 0], [-8, 0], [-6, 0], [-4, 0], [-2, 0]])
    const ids = state.units['A:grunts'].models
    const action = await pick(state, {
      id: 'd1', kind: 'allocateAttack', player: 'A', window: 'shooting.start', canPass: false,
      context: { targetUnitId: 'A:grunts', attackerUnitId: 'B:mob', eligibleModels: ids, precision: false, damage: null, mortal: false },
      options: ids.map((id) => ({ id, label: id, action: { type: 'allocateAttack', player: 'A', decisionId: '', modelId: id } })),
    } as PendingDecision)
    expect(action.type).toBe('allocateAttack')
    const chosen = (action as { modelId: string }).modelId
    expect(coherentWithout(state, 'A:grunts', chosen), `picked ${chosen}`).toBe(true)
  })

  it('in the end-of-turn cull removes the stray model that restores coherency', async () => {
    const state = freshState()
    placeUnit(state, 'A:grunts', [[-10, 0], [-8, 0], [-6, 0], [-4, 0], [10, 0]])
    const ids = state.units['A:grunts'].models
    const stray = ids[4]
    const action = await pick(state, {
      id: 'd2', kind: 'chooseOption', player: 'A', window: 'turn.end', canPass: false,
      context: { topic: 'coherencyCull', unitId: 'A:grunts', abilityId: null, data: { modelIds: ids } },
      options: ids.map((id) => ({ id, label: `remove ${id}`, action: { type: 'chooseOption', player: 'A', decisionId: '', optionId: id } })),
    } as PendingDecision)
    expect((action as { optionId: string }).optionId).toBe(stray)
  })
})
