// Stratagem / Command Re-roll scoring (src/ai/stratagems.ts, docs/spec/40-ai.md §5) on synthetic states built from the real
// data bundle: units are dropped on the board at hand-picked positions and scored through the exported scorers.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  ENGINE_VERSION, createGameState, emptyPhaseState,
  type Action, type DiceRoll, type GameSetup, type GameState, type PendingDecision, type PlayerId, type PlayerSetup, type UseStratagemAction,
} from '../../src/engine'
import { HOLD_CP_SCORE, commandRerollScore, cpThreshold, stratagemScore } from '../../src/ai/stratagems'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const PATROLS: Record<string, { faction: string; patrolId: string; enhancementId: string; secondaryId: string }> = {
  sm: { faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.wrath-of-the-emperor' },
  ork: { faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em' },
  nec: { faction: 'necrons', patrolId: 'nec.cp.amonhotekhs-guard', enhancementId: 'nec.e.overriding-control', secondaryId: 'nec.sec.reclaim-and-dominate' },
  csm: { faction: 'chaos-space-marines', patrolId: 'csm.cp.zarkans-daemonkin', enhancementId: 'csm.e.foul-zealotry', secondaryId: 'csm.sec.marked-for-execution' },
}
const side = (k: string): PlayerSetup => ({ name: k, ...PATROLS[k], attachments: [], reserves: [], battleReadyVp: 0 })

function makeState(a: string, b: string, o: { round?: number; phase?: GameState['phase']; active?: PlayerId; cpA?: number; cpB?: number } = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: side(a), B: side(b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'ai-stratagems', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.phase = o.phase ?? 'shooting'
  s.activePlayer = o.active ?? 'A'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = o.cpA ?? 2
  s.players.B.cp = o.cpB ?? 2
  return s
}

const at = (s: GameState, unitId: string, x: number, z: number) => placeUnit(s, unitId, { x, z, gap: 0.5 })
const use = (id: string, player: PlayerId, unitIds: string[]): UseStratagemAction =>
  ({ type: 'useStratagem', player, decisionId: 'd', stratagemId: id, targets: { unitIds } })
const targetsWindow = (attacker: string, target: string): PendingDecision =>
  ({ id: 'd', player: 'A', window: 'shooting.targetsDeclared', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: attacker, targetUnitId: target, rollId: null }, usable: [] }, options: [] }) as PendingDecision
const rollOf = (purpose: DiceRoll['purpose'], dice: number[], unitId: string | null, extra: Partial<DiceRoll> = {}): DiceRoll => ({
  id: 'r1', purpose, sides: 6, dice, rerolled: null, modifiers: [], final: dice, player: 'B', unitId, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true, ...extra,
})
const rerollWindow = (player: PlayerId, roll: DiceRoll): PendingDecision =>
  ({ id: 'd', player, window: 'any.rollMade', canPass: true, kind: 'commandReroll', context: { roll, selectableDice: true }, options: [] }) as PendingDecision
const rerollAction = (player: PlayerId, dieIndex?: number): Action => ({ type: 'commandReroll', player, decisionId: 'd', rollId: 'r1', ...(dieIndex !== undefined ? { dieIndex } : {}) }) as Action

describe('AI stratagem scoring', () => {
  it('CP threshold is lower with more CP and in the last round', () => {
    const s = makeState('sm', 'ork', { round: 1, cpA: 1 })
    const early1 = cpThreshold(s, 'A', 1)
    s.players.A.cp = 4
    expect(cpThreshold(s, 'A', 1)).toBeLessThan(early1)
    s.round = 5
    expect(cpThreshold(s, 'A', 1)).toBeLessThan(cpThreshold(makeState('sm', 'ork', { round: 1, cpA: 4 }), 'A', 1))
  })

  it('Overwatch against a weak target (hits only on 6s) is not worth a CP', () => {
    const s = makeState('sm', 'ork', { phase: 'movement', active: 'B', cpA: 2 })
    at(s, 'A:infernus-squad', 0, 0); at(s, 'B:boyz-a', 14, 0)
    const pending = { id: 'd', player: 'A', window: 'charge.moveEnded', canPass: true, kind: 'reactionWindow', context: { enemyUnitId: 'B:boyz-a', reaction: 'overwatch', eligibleUnits: ['A:infernus-squad'] }, options: [] } as PendingDecision
    const score = stratagemScore(s, 'A', pending, use('core.s.fire-overwatch', 'A', ['B:boyz-a', 'A:infernus-squad']), 1)
    expect(score).toBeLessThan(HOLD_CP_SCORE)
  })

  it('Command Re-roll is not used on a charge that already succeeded', () => {
    const s = makeState('sm', 'ork', { phase: 'charge', active: 'A', cpA: 3 })
    at(s, 'A:terminator-squad', 0, 0); at(s, 'B:boyz-a', 0, 8)
    s.phaseState.charge = { unitId: 'A:terminator-squad', targetUnitIds: ['B:boyz-a'], roll: [6, 5], rerolled: false, distance: 11, heroic: false }
    const done = rollOf('charge', [6, 5], 'A:terminator-squad', { player: 'A' })
    expect(commandRerollScore(s, 'A', rerollWindow('A', done), rerollAction('A', 0))).toBeLessThan(HOLD_CP_SCORE)
    // a failed charge on a gap that is reachable is worth fixing
    const failed = rollOf('charge', [1, 4], 'A:terminator-squad', { player: 'A' })
    expect(commandRerollScore(s, 'A', rerollWindow('A', failed), rerollAction('A', 0))).toBeGreaterThan(HOLD_CP_SCORE)
    // and a charge that cannot be made even with a lucky re-roll is not
    placeUnit(s, 'B:boyz-a', { x: 0, z: 30 })
    expect(commandRerollScore(s, 'A', rerollWindow('A', failed), rerollAction('A', 0))).toBeLessThan(HOLD_CP_SCORE)
  })

  it('a defensive stratagem fires for big incoming damage on an expensive unit, not for a trivial attack', () => {
    const s = makeState('sm', 'ork', { phase: 'shooting', active: 'B', cpA: 2, round: 3 })
    at(s, 'A:infernus-squad', 0, 0); at(s, 'B:boyz-a', 12, 0); at(s, 'B:deffkoptas', 12, 6)
    const gtg = use('core.s.go-to-ground', 'A', ['A:infernus-squad'])
    expect(stratagemScore(s, 'A', targetsWindow('B:deffkoptas', 'A:infernus-squad'), gtg, 1)).toBeGreaterThan(HOLD_CP_SCORE)
    expect(stratagemScore(s, 'A', targetsWindow('B:boyz-a', 'A:infernus-squad'), gtg, 1)).toBeLessThan(HOLD_CP_SCORE)
  })

  describe('Necron and Chaos Space Marine stratagems get modelled scores', () => {
    const finite = (n: number) => expect(Number.isFinite(n)).toBe(true)

    it('Mercurial Resilience when a Necron unit is shot', () => {
      const s = makeState('nec', 'ork', { phase: 'shooting', active: 'B', cpA: 3, round: 3 })
      at(s, 'A:warriors', 0, 0); at(s, 'B:deffkoptas', 0, 12)
      finite(stratagemScore(s, 'A', targetsWindow('B:deffkoptas', 'A:warriors'), use('nec.s.mercurial-resilience', 'A', ['A:warriors']), 1))
    })

    it('Disruption Fields for an engaged Necron melee unit', () => {
      const s = makeState('nec', 'sm', { phase: 'fight', active: 'A', cpA: 3, round: 3 })
      at(s, 'A:skorpekhs', 0, 0); at(s, 'B:infernus-squad', 0, 1.7)
      const pending = { id: 'd', player: 'A', window: 'fight.start', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: null, targetUnitId: null, rollId: null }, usable: [] }, options: [] } as PendingDecision
      finite(stratagemScore(s, 'A', pending, use('nec.s.disruption-fields', 'A', ['A:skorpekhs']), 1))
    })

    it('Will of the Overlord on a contested scoring objective', () => {
      const s = makeState('nec', 'ork', { phase: 'command', active: 'A', cpA: 3, round: 3 })
      const obj = Object.values(s.objectives)[0]
      at(s, 'A:warriors', obj.pos.x, obj.pos.z); at(s, 'B:boyz-a', obj.pos.x + 8, obj.pos.z)
      const pending = { id: 'd', player: 'A', window: 'command.start', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: null, targetUnitId: null, rollId: null }, usable: [] }, options: [] } as PendingDecision
      finite(stratagemScore(s, 'A', pending, use('nec.s.will-of-the-overlord', 'A', ['A:warriors']), 1))
    })

    it('Vindictive Strategy against a below-strength enemy unit', () => {
      const s = makeState('csm', 'ork', { phase: 'shooting', active: 'A', cpA: 3, round: 3 })
      at(s, 'A:legionaries', 0, 0); at(s, 'B:boyz-a', 12, 0)
      s.units['B:boyz-a'].models.pop(); s.units['B:boyz-a'].models.pop()
      const pending = { id: 'd', player: 'A', window: 'shooting.start', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: null, targetUnitId: null, rollId: null }, usable: [] }, options: [] } as PendingDecision
      finite(stratagemScore(s, 'A', pending, use('csm.s.vindictive-strategy', 'A', ['A:legionaries']), 1))
    })

    it('Violent Unbinding against the unit that just killed our Master of Possession', () => {
      const s = makeState('csm', 'ork', { phase: 'fight', active: 'B', cpA: 3, round: 3 })
      at(s, 'A:possessed', 0, 0); at(s, 'B:boyz-a', 0, 1.7)
      finite(stratagemScore(s, 'A', targetsWindow('B:boyz-a', 'A:possessed'), use('csm.s.violent-unbinding', 'A', ['A:possessed']), 1))
    })

    it('Daemonic Fervour when Possessed are being fought', () => {
      const s = makeState('csm', 'ork', { phase: 'fight', active: 'B', cpA: 3, round: 3 })
      at(s, 'A:possessed', 0, 0); at(s, 'B:warboss', 0, 1.7)
      finite(stratagemScore(s, 'A', targetsWindow('B:warboss', 'A:possessed'), use('csm.s.daemonic-fervour', 'A', ['A:possessed']), 1))
    })
  })
})
