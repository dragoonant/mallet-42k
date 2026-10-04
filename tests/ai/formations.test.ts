// Formation generators + AI deployment (owner: src/ai). Shapes must be coherent, overlap-free, the right size and (for a
// 10-model infantry block) at least two ranks deep; an AI-deployed 10-model unit in a real setup must not be a single row.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data/index'
import {
  basesOverlap, createGame, isCoherent, legalActions, modelStats, step, unitModels, view,
  type Footprint, type ModelBase, type PlayerId, type StepResult,
} from '../../src/engine'
import { buildFormation, type FormationModel, type FormationShape } from '../../src/ai/formations'
import { UtilityDecider } from '../../src/ai/utility'

const SHAPES: FormationShape[] = ['block', 'phalanx', 'wedge', 'arc', 'checker', 'line']
const mk = (n: number, base: ModelBase): FormationModel[] => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, base }))
const round32: ModelBase = { shape: 'round', radius: 32 / 25.4 / 2 }
const oval: ModelBase = { shape: 'oval', radius: 0.9, radius2: 0.5 }

// depth of the formation along its facing, in base diameters
function depthRanks(ps: { pos: { x: number; z: number } }[], facing: number, diameter: number): number {
  const v = ps.map((p) => p.pos.x * Math.cos(facing) + p.pos.z * Math.sin(facing))
  return (Math.max(...v) - Math.min(...v)) / diameter + 1
}

describe('formation shapes', () => {
  for (const facing of [0, 1.1, Math.PI, -Math.PI / 2]) {
    for (const [name, base] of [['round', round32], ['oval', oval]] as const) {
      for (const shape of SHAPES) {
        for (const n of [5, 10, 12]) {
          // a line of big ovals can't keep two neighbours at 7+ models; the generator must then refuse rather than return junk
          it(`formation ${shape} ${name} n=${n} facing=${facing.toFixed(1)} is coherent, overlap-free and complete or refused`, () => {
            const ps = buildFormation(shape, mk(n, base), { x: 3, z: -4 }, facing)
            if (ps === null) { expect(shape === 'line' || shape === 'arc' || name === 'oval').toBe(true); return }
            expect(ps).toHaveLength(n)
            expect(new Set(ps.map((p) => p.modelId)).size).toBe(n)
            const feet: Footprint[] = ps.map((p) => ({ pos: p.pos, facing, base }))
            expect(isCoherent(feet)).toBe(true)
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(basesOverlap(feet[i], feet[j])).toBe(false)
          })
        }
      }
    }
  }

  it('formation: a 10-model infantry block, phalanx, wedge and checkerboard are at least 2 ranks deep', () => {
    for (const shape of ['block', 'phalanx', 'wedge', 'checker'] as const) {
      const ps = buildFormation(shape, mk(10, round32), { x: 0, z: 0 }, 0)
      expect(ps, shape).not.toBeNull()
      expect(depthRanks(ps!, 0, 2 * round32.radius), shape).toBeGreaterThanOrEqual(shape === 'checker' ? 1.5 : 2)
    }
  })

  it('formation: a single model gets just its anchor point', () => {
    const ps = buildFormation('wedge', mk(1, round32), { x: 5, z: 6 }, 0.3)
    expect(ps).toEqual([{ modelId: 'm0', pos: { x: 5, y: 0, z: 6 }, facing: 0.3 }])
  })

  it('formation: a wedge points toward the facing (apex furthest forward)', () => {
    const ps = buildFormation('wedge', mk(10, round32), { x: 0, z: 0 }, 0)!
    const fwd = ps.map((p) => p.pos.x)
    expect(ps[0].pos.x).toBe(Math.max(...fwd))
  })
})

describe('AI deployment uses formations', () => {
  it('formation: an AI-deployed 10-model infantry unit in a real setup is not a single row', async () => {
    const bundle = await loadBundle()
    const patrols = Object.keys(bundle.patrols).sort()
    const necrons = patrols.find((p) => bundle.patrols[p].faction === 'necrons') ?? patrols[0]
    const other = patrols.find((p) => p !== necrons) as string
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
      players: { A: setup(necrons, 'A'), B: setup(other, 'B') },
      sides: 'rollOff' as const, firstTurn: 'rollOff' as const, dataVersion: bundle.version,
    }
    const deciders = { A: new UtilityDecider('normal', 'form-A'), B: new UtilityDecider('normal', 'form-B') }
    let r: StepResult = createGame(gameSetup, 'formations', bundle)
    let n = 0
    while (r.pending && (r.state.phase === 'setup' || r.state.phase === 'deployment') && n++ < 400) {
      const pending = r.pending
      const action = await deciders[pending.player as PlayerId].decide(view(r.state, pending.player), pending, legalActions(r.state, pending))
      const next = step(r.state, action)
      expect(next.rejection).toBeFalsy()
      r = next
    }
    const big = Object.values(r.state.units).filter((u) => u.location === 'board' && unitModels(r.state, u.id).length >= 10 && modelStats(r.state, unitModels(r.state, u.id)[0]).Sv < 5)
    expect(big.length).toBeGreaterThan(0)
    for (const u of big) {
      const ms = unitModels(r.state, u.id)
      const xs = ms.map((m) => m.pos.x), zs = ms.map((m) => m.pos.z)
      const d = 2 * ms[0].base.radius
      // centres of a single row (or zig-zag line) spread < 0.5 diameter on one axis; a 2+ rank formation spreads more
      expect(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), u.name).toBeGreaterThan(d * 0.5)
    }
  }, 60000)
})

describe('AI deployment spreads out near objectives', () => {
  // Regression: every Space Marine unit used to pile onto the one in-zone marker (objective pull saturated, weak crowding)
  it('formation: Space Marine units do not all deploy in one spot and stay within reach of objectives', async () => {
    const bundle = await loadBundle()
    const patrols = Object.keys(bundle.patrols).sort()
    const sm = patrols.find((p) => bundle.patrols[p].faction === 'sm') as string
    const opp = patrols.find((p) => bundle.patrols[p].faction === 'necrons') as string
    const setup = (id: string, name: string) => {
      const patrol = bundle.patrols[id]
      return {
        name, faction: patrol.faction, patrolId: id,
        enhancementId: (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id,
        secondaryId: (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id,
        attachments: [], reserves: [], battleReadyVp: 0,
      }
    }
    const spreads: number[] = [], dists: number[] = []
    for (const seed of ['d1', 'd2', 'd3']) {
      const gameSetup = {
        missionId: 'mission.cp-02',
        terrainLayoutId: Object.keys(bundle.terrainLayouts ?? {}).sort()[0] ?? 'terrain.cp-01',
        players: { A: setup(sm, 'A'), B: setup(opp, 'B') },
        sides: 'rollOff' as const, firstTurn: 'rollOff' as const, dataVersion: bundle.version,
      }
      const deciders = { A: new UtilityDecider('normal', seed + 'A'), B: new UtilityDecider('normal', seed + 'B') }
      let r: StepResult = createGame(gameSetup, seed, bundle)
      let n = 0
      while (r.pending && (r.state.phase === 'setup' || r.state.phase === 'deployment') && n++ < 400) {
        const pending = r.pending
        r = step(r.state, await deciders[pending.player as PlayerId].decide(view(r.state, pending.player), pending, legalActions(r.state, pending)))
      }
      const objs = Object.values(r.state.objectives)
      const cs = Object.values(r.state.units).filter((u) => u.player === 'A' && u.location === 'board').map((u) => {
        const ms = unitModels(r.state, u.id)
        return { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
      })
      expect(cs.length).toBeGreaterThanOrEqual(3)
      let maxPair = 0
      for (const a of cs) for (const b of cs) maxPair = Math.max(maxPair, Math.hypot(a.x - b.x, a.z - b.z))
      spreads.push(maxPair)
      for (const c of cs) dists.push(Math.min(...objs.map((o) => Math.hypot(o.pos.x - c.x, o.pos.z - c.z))))
      // not all in one corner of the board: the units' centroids cover a clearly wider area than one blob
      expect(maxPair, seed).toBeGreaterThan(10)
    }
    expect(spreads.reduce((a, b) => a + b, 0) / spreads.length).toBeGreaterThan(12)
    expect(dists.reduce((a, b) => a + b, 0) / dists.length).toBeLessThan(7)
  }, 60000)
})
