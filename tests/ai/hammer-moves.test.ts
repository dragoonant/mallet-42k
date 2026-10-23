// Regression (owner: src/ai): the Black Templars Primaris Crusader Squad (+ Marshal Siguard) declared Remain
// Stationary every round of every game and sat in its deployment corner — scoreDeclareMove treated "some model
// carries a HEAVY gun" as a whole-unit trait, so two bolt rifles among ten chainswords outscored moving. A
// melee-leaning unit must walk. Plays the AI-vs-AI opening of one such game (Sweeping Raid, the seed that froze).
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, view, type GameSetup, type PlayerId } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'

describe('AI melee-leaning units move', () => {
  it('MOVE-AI-HAMMER-001 the Crusader squad does not Remain Stationary through rounds 1-2', async () => {
    const bundle = await loadBundle()
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
    const setup: GameSetup = {
      missionId: 'mission.cp-05', terrainLayoutId: bundle.missions['mission.cp-05'].terrainLayouts[0],
      players: { A: ps('da.cp.the-vengeful-brethren', 'A'), B: ps('bt.cp.siguard-s-crusaders', 'B') },
      sides: 'rollOff', firstTurn: 'rollOff', dataVersion: DATA_VERSION,
    }
    const seed = 'stuck-0'
    const ai: Record<PlayerId, UtilityDecider> = { A: new UtilityDecider('normal', `${seed}-A`), B: new UtilityDecider('normal', `${seed}-B`) }
    let r = createGame(setup, seed, bundle)
    const crusaders = Object.values(r.state.units).find((u) => u.player === 'B' && u.id.includes('crusader'))
    expect(crusaders).toBeTruthy()
    const declared: string[] = []
    let n = 0
    while (r.pending && r.state.round <= 2 && n++ < 3000) {
      const p = r.pending
      const action = await ai[p.player].decide(view(r.state, p.player), p, legalActions(r.state, p))
      if (p.kind === 'declareMove' && p.player === 'B' && p.context.unitId === crusaders!.id && action.type === 'declareMove') declared.push(action.moveType)
      const next = step(r.state, action)
      expect(next.rejection).toBeFalsy()
      r = next
    }
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.some((m) => m !== 'stationary')).toBe(true)
  }, 120_000)
})
