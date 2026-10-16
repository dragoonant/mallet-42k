// Blood Angels engine change beyond a code hook (docs/spec/factions/blood-angels.md 7.1): bagPick `params.fallbackKeyword`.
import { describe, expect, it } from 'vitest'
import { createContext, DEFAULT_MODULES, ScriptedRng, type Action, type ChooseOptionDecision, type EngineContext, type GameState, type PendingDecision } from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { freshState, placeUnit } from '../fixtures'

const aggressionPick = { id: 'aggression-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick', params: { fallbackKeyword: 'CHARACTER' } } as const
const morgrimPick = { id: 'bag-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick' } as const

// Blood Angels Strategic Aggression: both points values are 10, so the killer never matters
const aggressionScore = { id: 'aggression-score', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 0, cap: 10, code: 'bagTheBigUnScore', params: { unitPoints: 10, beastbossPoints: 10 } } as const

function pickOptions(s: GameState, rule: any): string[] | null {
  s.mission.secondaries.B = [rule]
  s.round = 1
  const ctx = createContext(s, new ScriptedRng([]), DEFAULT_MODULES).ctx
  DEFAULT_MODULES.services.missions.onWindow(ctx, 'round.start', '1')
  const p = ctx.state.pending as ChooseOptionDecision | null
  return p && p.kind === 'chooseOption' ? p.options.map((o) => o.id) : null
}

describe('Strategic Aggression pick (bagPick fallbackKeyword)', () => {
  it('BLO-008 candidates are enemy MONSTER/VEHICLE models first; with none, every enemy CHARACTER model (not only the WARLORD); with none of either, no decision', () => {
    // A has a VEHICLE (walker): offered ahead of any fallback
    expect(pickOptions(freshState(), aggressionPick)).toEqual(['A:walker#0'])

    // no MONSTER/VEHICLE left: the fallback is every CHARACTER, even when the Warlord is a different unit
    const s2 = freshState()
    s2.units['A:walker'].location = 'destroyed'
    s2.players.A.warlordUnitId = 'A:grunts'
    expect(pickOptions(s2, aggressionPick)).toEqual(['A:boss#0'])

    // neither MONSTER/VEHICLE nor CHARACTER alive: nothing to pick
    const s3 = freshState()
    s3.units['A:walker'].location = 'destroyed'
    s3.units['A:boss'].location = 'destroyed'
    expect(pickOptions(s3, aggressionPick)).toBeNull()
  })

  it('BLO-009 without fallbackKeyword the fallback is still the enemy WARLORD (Morgrim\'s Bag the Big \'Un unchanged)', () => {
    const s = freshState()
    s.units['A:walker'].location = 'destroyed'
    s.players.A.warlordUnitId = 'A:grunts'
    const ids = pickOptions(s, morgrimPick)
    expect(ids).not.toBeNull()
    expect(ids!.every((id) => id.startsWith('A:grunts#'))).toBe(true) // Warlord unit only, never the CHARACTER
  })

  it('BLO-009 Strategic Aggression scores 10 VP at battle end when the picked model is destroyed, whoever killed it (warlord or not, or no one); 0 while it is alive', () => {
    const run = (kill: ((s: GameState, ctx: EngineContext) => void) | null): number => {
      const s = freshState()
      s.mission.secondaries.B = [aggressionPick as never]
      s.round = 1
      const first = createContext(s, new ScriptedRng([]), DEFAULT_MODULES).ctx
      DEFAULT_MODULES.services.missions.onWindow(first, 'round.start', '1')
      const pending = s.pending as ChooseOptionDecision
      s.pending = null
      DEFAULT_MODULES.services.missions.handler.handle(first, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId: 'A:walker#0' } as Action, pending as PendingDecision)
      expect(s.players.B.secondaryState.bagTargetModelId).toBe('A:walker#0')
      s.mission.secondaries.B = [aggressionScore as never]
      s.round = 5
      placeUnit(s, 'A:walker', [[0, 0]])
      s.units['B:warboss'].bodyguardUnitId = 'B:mob'
      s.units['B:mob'].attachedLeaderId = 'B:warboss'
      const ctx = createContext(s, new ScriptedRng([1, 1, 1, 1, 1, 1]), DEFAULT_MODULES).ctx // spare dice for a Deadly Demise roll
      kill?.(s, ctx)
      DEFAULT_MODULES.services.missions.onWindow(ctx, 'battle.end', 'end')
      return s.players.B.vp
    }
    const destroy = (unitId: string | null, modelId: string | null) => (s: GameState, ctx: EngineContext) => {
      s.models['A:walker#0'].woundsRemaining = 0
      attackService.destroyModel(ctx, 'A:walker#0', { player: unitId ? 'B' : null, unitId, modelId, kind: unitId ? 'melee' : 'other' } as never)
    }
    expect(run(destroy('B:warboss', 'B:warboss#0'))).toBe(10) // the warlord's own model
    expect(run(destroy('B:mob', 'B:mob#2'))).toBe(10) // someone else
    expect(run(destroy(null, null))).toBe(10) // mortal wounds / no credited killer
    expect(run(null)).toBe(0) // still alive at the end of the battle
  })
})
