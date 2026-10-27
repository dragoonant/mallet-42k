// Fire Overwatch used in the movement.unitMoved window (as the enemy move ends) must actually shoot, not just spend CP.
// Drives the real movement module + stratagem service with the shipped data bundle.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import { DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, unitModels, type Action, type GameSetup, type PendingDecision } from '../../src/engine'
import { movementModule } from '../../src/engine/phases/movement'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })
const T = 'A:terminator-squad', BOYZ = 'B:boyz-a'

// B moves the Boyz 1" away; A answers the Overwatch window named by `useAt` with the Terminators, passes everything else
function overwatchAt(useAt: 'movement.moveStarted' | 'movement.unitMoved') {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    players: {
      A: { name: 'SM', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.wrath-of-the-emperor', attachments: [], reserves: [], battleReadyVp: 0 },
      B: { name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em', attachments: [], reserves: [], battleReadyVp: 0 },
    },
  }
  const s = createGameState(setup, bundle, 'ow', ENGINE_VERSION)
  s.round = 1; s.phase = 'movement'; s.activePlayer = 'B'; s.players.A.cp = 3
  placeUnit(s, T, { x: -4, z: -3 })
  placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 })
  const { ctx, events } = createContext(s, new ScriptedRng(Array(400).fill(6)), DEFAULT_MODULES)
  movementModule.enter(ctx)
  movementModule.advance(ctx)
  let activated = false
  while (s.pending) {
    const p = s.pending as PendingDecision
    let a: Action | undefined
    if (p.kind === 'chooseUnitToActivate') { if (activated) break; activated = true; a = { type: 'chooseUnitToActivate', player: 'B', decisionId: p.id, unitId: BOYZ } as Action }
    else if (p.kind === 'declareMove') a = { type: 'declareMove', player: 'B', decisionId: p.id, unitId: BOYZ, moveType: 'normal' } as Action
    else if (p.kind === 'moveUnit') a = { type: 'moveUnit', player: 'B', decisionId: p.id, unitId: BOYZ, placements: unitModels(s, BOYZ).map((m) => ({ modelId: m.id, pos: { x: m.pos.x, y: 0, z: m.pos.z + 1 } })) } as Action
    else if (p.kind === 'reactionWindow') {
      a = p.window === useAt ? (p.options ?? []).find((o) => o.action.type === 'useStratagem' && JSON.stringify(o.action).includes(T))?.action : undefined
      a ??= { type: 'pass', player: p.player, decisionId: p.id } as Action
    } else break // first attack-sequence decision (re-roll offer etc.): the shots have started
    s.pending = null
    const r = p.kind === 'reactionWindow' ? DEFAULT_MODULES.services.stratagems.handle(ctx, a, p) : movementModule.handle(ctx, a, p)
    if (r) throw new Error(`${r.code} ${r.reason}`)
    movementModule.advance(ctx)
  }
  return { cp: s.players.A.cp, attacks: events.filter((e) => e.type === 'AttackSequenceStarted' && e.unitId === T && e.overwatch).length }
}

describe('Fire Overwatch resolves in every movement window it is offered in', () => {
  it('CHARGE-019-moveStarted Overwatch as the enemy move starts shoots', () => {
    expect(overwatchAt('movement.moveStarted')).toEqual({ cp: 2, attacks: 1 })
  })

  it('CHARGE-019-unitMoved Overwatch as the enemy move ends shoots (not just spends the CP)', () => {
    expect(overwatchAt('movement.unitMoved')).toEqual({ cp: 2, attacks: 1 })
  })
})
