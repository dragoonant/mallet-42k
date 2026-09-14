// Smoke test (owner: src/ai). UtilityDecider vs RandomDecider on the real Combat Patrol rosters plays a full
// game through the public engine API without throwing or getting a legal action rejected. Not a strength or
// balance test — see tools/ai-bench.ts for that.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, view, type Decider, type PlayerId, type StepResult } from '../../src/engine'
import { RandomDecider } from '../../src/ai/random'
import { UtilityDecider } from '../../src/ai/utility'

describe('UtilityDecider', () => {
  it('plays a full game against RandomDecider without throwing or a rejected action', async () => {
    const bundle = await loadBundle()
    const patrols = Object.keys(bundle.patrols).sort()
    expect(patrols.length).toBeGreaterThanOrEqual(2)
    const [p0, p1] = patrols
    const setup = (id: string, name: string) => {
      const patrol = bundle.patrols[id]
      return {
        name, faction: patrol.faction, patrolId: id,
        enhancementId: (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id,
        secondaryId: (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id,
        attachments: [], reserves: [], battleReadyVp: 0,
      }
    }
    const gameSetup = {
      missionId: 'mission.cp-01',
      terrainLayoutId: Object.keys(bundle.terrainLayouts ?? {}).sort()[0] ?? 'terrain.cp-01',
      players: { A: setup(p0, 'UtilityAI'), B: setup(p1, 'Random') },
      sides: 'rollOff' as const, firstTurn: 'rollOff' as const, dataVersion: bundle.version,
    }

    const deciders: Record<PlayerId, Decider> = { A: new UtilityDecider('normal', 'ai-smoke-A'), B: new RandomDecider('ai-smoke-B') }
    let r: StepResult = createGame(gameSetup, 'ai-smoke', bundle)
    let steps = 0
    while (r.pending && steps < 5000) {
      const pending = r.pending
      const v = view(r.state, pending.player)
      const legal = legalActions(r.state, pending)
      const action = await deciders[pending.player].decide(v, pending, legal)
      const next = step(r.state, action)
      expect(next.rejection, `AI action ${action.type} rejected: ${JSON.stringify(next.rejection)}`).toBeFalsy()
      r = next
      steps++
    }
    expect(r.state.phase).toBe('ended')
    expect(r.state.result).not.toBeNull()
  }, 60000)
})
