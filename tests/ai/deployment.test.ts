// Regression + sweep: AI deployment must always complete (never throw "no legal action for decision deployUnit").
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, view, type Decider, type PlayerId, type StepResult } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import type { DataBundle } from '../../src/data/index'

async function deployOnly(bundle: DataBundle, missionId: string, pa: string, pb: string, seed: string): Promise<StepResult> {
  const setup = (id: string, name: string) => {
    const patrol = bundle.patrols[id]
    return {
      name, faction: patrol.faction, patrolId: id,
      enhancementId: (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id,
      secondaryId: (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id,
      attachments: [], reserves: [], battleReadyVp: 0,
    }
  }
  const mission = bundle.missions[missionId]
  const layout = (mission as unknown as { terrainLayoutId?: string }).terrainLayoutId ?? Object.keys(bundle.terrainLayouts ?? {}).sort()[0] ?? 'terrain.cp-01'
  const gameSetup = {
    missionId, terrainLayoutId: layout,
    players: { A: setup(pa, 'A'), B: setup(pb, 'B') },
    sides: 'rollOff' as const, firstTurn: 'rollOff' as const, dataVersion: bundle.version,
  }
  const deciders: Record<PlayerId, Decider> = { A: new UtilityDecider('normal', seed + 'A'), B: new UtilityDecider('normal', seed + 'B') }
  let r: StepResult = createGame(gameSetup, seed, bundle)
  let steps = 0
  while (r.pending && (r.state.phase === 'setup' || r.state.phase === 'deployment') && steps < 2000) {
    const pending = r.pending
    let action
    try { action = await deciders[pending.player].decide(view(r.state, pending.player), pending, legalActions(r.state, pending)) }
    catch (e) {
      const ids = pending.kind === 'deployUnit' ? pending.context.unitIds.map((id) => id + '(' + Object.values(r.state.models).filter((m) => m.unitId === id).length + ')') : []
      throw new Error(missionId + ' ' + pa + ' vs ' + pb + ' ' + seed + ': ' + (e as Error).message + ' units=' + ids.join(','))
    }
    const next = step(r.state, action)
    expect(next.rejection, `${missionId} ${pa} vs ${pb} ${seed}: ${action.type} rejected ${JSON.stringify(next.rejection)}`).toBeFalsy()
    r = next
    steps++
  }
  expect(steps).toBeLessThan(2000)
  return r
}

describe('AI deployment completes', () => {
  it('cp-01 Space Marines vs Karsk\'s Gunners, seeds s1-s3', async () => {
    const bundle = await loadBundle()
    const sm = 'sm.cp.strike-force-octavius'
    for (const seed of ['s1', 's2', 's3']) {
      const r = await deployOnly(bundle, 'mission.cp-01', sm, 'am.cp.karsks-gunners', seed)
      const left = Object.values(r.state.units).filter((u) => u.location === 'notDeployed' as never)
      expect(left).toHaveLength(0)
    }
  }, 60000)

  // exhaustive (every ordered pair on every mission, ~5 min) with SWEEP_FULL=1; the default is a rotating sample that still
  // gives every mission and every patrol a few pairings and stays fast
  it('patrol pairs on every mission, deployment only', async () => {
    const bundle = await loadBundle()
    const patrols = Object.keys(bundle.patrols).sort()
    const missions = Object.keys(bundle.missions).sort()
    const full = process.env.SWEEP_FULL === '1'
    for (let m = 0; m < missions.length; m++) {
      if (full) {
        for (const a of patrols) for (const b of patrols) if (a !== b) await deployOnly(bundle, missions[m], a, b, 'sweep')
      } else {
        for (let k = 0; k < 2; k++) {
          const ai = (m + 2 * k) % patrols.length
          const bi = (ai + 1 + m) % patrols.length
          if (ai !== bi) await deployOnly(bundle, missions[m], patrols[ai], patrols[bi], 'sweep')
        }
      }
    }
  }, 600000)
})
