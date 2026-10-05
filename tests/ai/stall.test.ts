// Regression (owner: src/ai + engine): two Combat Patrol AI-vs-AI games (spike seeds spike-1-5 / spike-1-6, SM vs Tyranids
// pairings) never finished — Heroic Intervention was re-offered forever because Pouncing Leap makes it 0 CP and un-limited
// for Leapers, so a queued reaction never closed its window. SIM-STALL-001.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, view, type Decider, type GameSetup, type PlayerId } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'

const STALL_DECISIONS = 2_000

describe('AI-vs-AI stall regression', () => {
  it.each([5, 6])('SIM-STALL-001 spike game %i (UtilityDecider vs UtilityDecider) finishes within the decision budget', async (g) => {
    const bundle = await loadBundle()
    const patrols = Object.keys(bundle.patrols).sort()
    const ps = (id: string, name: string) => {
      const p = bundle.patrols[id]
      return {
        name, faction: p.faction, patrolId: id,
        enhancementId: (p.enhancements.find((e) => e.default) ?? p.enhancements[0]).id,
        secondaryId: (p.secondaries.find((s) => s.default) ?? p.secondaries[0]).id,
        attachments: p.units.filter((u) => u.attachTo).map((u) => ({ leaderRef: u.ref, bodyguardRef: u.attachTo as string })),
        reserves: [] as string[], battleReadyVp: 0,
      }
    }
    const a = g % patrols.length
    const bb = (a + 1 + Math.floor(g / patrols.length)) % patrols.length
    const b = bb === a ? (a + 1) % patrols.length : bb
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
      players: { A: ps(patrols[a], 'Bot A'), B: ps(patrols[b], 'Bot B') },
      sides: 'rollOff', firstTurn: 'rollOff', dataVersion: DATA_VERSION,
    }
    const seed = `spike-1-${g}`
    const deciders: Record<PlayerId, Decider> = { A: new UtilityDecider('normal', `${seed}-A`), B: new UtilityDecider('normal', `${seed}-B`) }
    let r = createGame(setup, seed, bundle)
    let steps = 0
    while (r.pending && steps < STALL_DECISIONS) {
      steps++
      const pending = r.pending
      const action = await deciders[pending.player].decide(view(r.state, pending.player), pending, legalActions(r.state, pending))
      const next = step(r.state, action)
      expect(next.rejection).toBeFalsy()
      r = next
    }
    expect(r.state.result).toBeTruthy()
    expect(steps).toBeLessThan(STALL_DECISIONS)
  }, 120_000)
})
