// Dark Angels "The Vengeful Brethren" engine change beyond code hooks (docs/spec/factions/dark-angels--the-vengeful-brethren.md
// 7.1, item E1): the save kind on onSaveRoll payloads and a defender-side automatic re-roll of saves of 1. The real Bladeguard
// stance hook belongs to the hooks agent; a tiny stand-in registered under the same code name (restored afterwards) exercises the seam.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const DA = (): PlayerSetup => ({
  name: 'DA', faction: 'dark-angels', patrolId: 'da.cp.the-vengeful-brethren', enhancementId: 'da.e.determined-combatant',
  secondaryId: 'da.sec.hunters-of-heretics', attachments: [], reserves: [], battleReadyVp: 0,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const BG: UnitId = 'A:bladeguard', BOYZ: UnitId = 'B:boyz-a', DREAD: UnitId = 'B:deff-dread'

function makeState(): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: DA(), B: ORK() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'dav-core', ENGINE_VERSION)
  s.round = 2; s.activePlayer = 'B'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
  s.players.A.cp = 0; s.players.B.cp = 0
  placeUnit(s, BG, [[14, -10], [15.6, -10], [17.2, -10]])
  placeUnit(s, BOYZ, [[14, 2], [15.3, 2]])
  placeUnit(s, DREAD, [[8, 2]])
  return s
}
function ctxOf(s: GameState, dice: number[]) { return createContext(s, new ScriptedRng(dice), DEFAULT_MODULES) }
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const decl = (modelId: string, weaponId: string, targetUnitId: string) => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks: null })
function weaponModel(s: GameState, unitId: UnitId, weaponId: string): string {
  for (const id of s.units[unitId].models) if (s.models[id].weapons.includes(weaponId)) return id
  throw new Error(`no ${weaponId} in ${unitId}`)
}
function settle(ctx: ReturnType<typeof ctxOf>['ctx'], s: GameState): void {
  attackService.advance(ctx)
  for (let g = 0; g < 60 && s.pending?.kind === 'allocateAttack'; g++) {
    const p = s.pending as Extract<PendingDecision, { kind: 'allocateAttack' }>
    s.pending = null
    attackService.handler.handle(ctx, { type: 'allocateAttack', player: p.player, decisionId: p.id, modelId: p.context.eligibleModels[0] } as Action, p)
    attackService.advance(ctx)
  }
}

// stand-in for the real vbBladeguardStance: re-roll 1s on the defender's saves, optionally only for invulnerable saves
const saved = new Map<string, EngineCodeHook | undefined>()
function standIn(invulnOnly: boolean, open = true): void {
  if (!saved.has('vbBladeguardStance')) saved.set('vbBladeguardStance', codeHooks.vbBladeguardStance)
  codeHooks.vbBladeguardStance = {
    name: 'vbBladeguardStance', kind: 'ability', hook: 'onHitRoll', hooks: ['onSaveRoll'], run: () => undefined,
    gateEffect: (_s: unknown, _holder: unknown, entry: { params: Record<string, unknown> }, data?: Record<string, unknown>) => open && (invulnOnly ? entry.params.invulnOnly === true && data?.saveKind === 'invuln' : true),
  } as unknown as EngineCodeHook
}
afterEach(() => {
  for (const [name, h] of saved) { if (h) codeHooks[name] = h; else delete codeHooks[name] }
  saved.clear()
})

// Boyz Shoota: AP 0 -> the Bladeguard's 3+ armour save is the better save. Rokkit launcha: AP -2 -> armour 5+, invulnerable 4+ is better.
const shoot = (s: GameState, unit: UnitId, weapon: string, dice: number[]) => {
  const { ctx, events } = ctxOf(s, dice)
  attackService.begin(ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [decl(weaponModel(s, unit, weapon), weapon, BG)] })
  settle(ctx, s)
  return { ctx, events }
}

describe('E1 save kind + re-roll of saves of 1 (DAV-6.3)', () => {
  it('DAV-016 DAV-6.3: a fast-rolled batch (one kind for every die) re-rolls its invulnerable saves of 1 automatically (source "save"), the new die counts, a 1 again stays failed', () => {
    const s = makeState()
    standIn(true)
    // Rokkit launcha: A = D3 (raw 6 -> 3 attacks), 3 hits (6,6,6), 3 wounds (6,6,6), 3 saves (1,1,5): the two 1s re-roll to 5 (saved) and 1 (failed)
    const { events } = shoot(s, DREAD, 'ork.w.rokkit-launcha', [6, 6, 6, 6, 6, 6, 6, 1, 1, 5, 5, 1])
    const saves = of(events, 'SaveRolled')
    expect(saves.map((e) => e.kind)).toEqual(['invuln', 'invuln', 'invuln'])
    const rr = of(events, 'DiceRerolled')
    expect(rr).toHaveLength(1)
    expect(rr[0]).toMatchObject({ source: 'save', before: [1, 1], after: [5, 1], indexes: [0, 1] })
    expect(saves.map((e) => e.saved)).toEqual([true, false, true])
    expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === 'da.a.vb-shields-of-the-chapter')).toBe(true)
  })

  it('DAV-016 DAV-6.3: an armour save of 1 is not re-rolled by an invulnOnly source (saveKind gate)', () => {
    const s = makeState()
    standIn(true)
    // Shoota 2 attacks (2 models): hits 6,6, wounds 6,6, saves 1,1: armour 3+ -> no re-roll
    const { events } = shoot(s, BOYZ, 'ork.w.shoota', [6, 6, 6, 6, 1, 1, 6, 6])
    expect(of(events, 'SaveRolled').map((e) => e.kind)).toEqual(['armour', 'armour'])
    expect(of(events, 'DiceRerolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled').map((e) => e.saved)).toEqual([false, false])
  })

  it('DAV-016 DAV-6.3: a source without the invuln gate re-rolls an armour 1 too; non-1 dice are never re-rolled', () => {
    const s = makeState()
    standIn(false)
    const { events } = shoot(s, BOYZ, 'ork.w.shoota', [6, 6, 6, 6, 1, 2, 6, 6])
    const rr = of(events, 'DiceRerolled')
    expect(rr).toHaveLength(1)
    expect(rr[0]).toMatchObject({ source: 'save', before: [1], indexes: [0] })
    expect(of(events, 'SaveRolled')[0].die).toBe(6)
  })

  it('DAV-016 DAV-6.3: with the stance gate closed nothing is re-rolled (existing behaviour unchanged)', () => {
    const s = makeState()
    standIn(false, false)
    const { events } = shoot(s, BOYZ, 'ork.w.shoota', [6, 6, 6, 6, 1, 1])
    expect(of(events, 'DiceRerolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled').map((e) => e.saved)).toEqual([false, false])
  })

  it('DAV-016 DAV-6.3: the free re-roll of a 1 happens before the Command Re-roll window, so a lone re-rolled die is never offered a Command Re-roll (CP is kept)', () => {
    const s = makeState()
    standIn(true)
    s.players.A.cp = 2
    // Rokkit launcha: D3 raw 1 -> 1 attack, 1 hit (6), 1 wound (6), save 1 -> Shields re-rolls it (1 again, still failed). The roll is
    // then final: no Command Re-roll window may open for the defender, and the 1 CP stays unspent.
    const { events } = shoot(s, DREAD, 'ork.w.rokkit-launcha', [1, 6, 6, 1, 1])
    expect(s.pending?.kind).not.toBe('commandReroll')
    expect(s.players.A.cp).toBe(2)
    const rr = of(events, 'DiceRerolled')
    expect(rr).toHaveLength(1)
    expect(rr[0]).toMatchObject({ source: 'save', before: [1], after: [1], indexes: [0] })
    expect(of(events, 'SaveRolled').map((e) => e.saved)).toEqual([false])
  })

  it('DAV-016 DAV-6.3: in a fast-rolled batch the Command Re-roll window lists only dice Shields has not re-rolled', () => {
    const s = makeState()
    standIn(true)
    s.players.A.cp = 2
    // saves 1,1,5: the two 1s are re-rolled by Shields (to 5 and 1); only die 2 (never re-rolled) can still be Command Re-rolled
    shoot(s, DREAD, 'ork.w.rokkit-launcha', [6, 6, 6, 6, 6, 6, 6, 1, 1, 5, 5, 1])
    const p = s.pending
    expect(p?.kind).toBe('commandReroll')
    if (p?.kind !== 'commandReroll') return
    expect(p.options.map((o) => o.id)).toEqual(['reroll:2'])
  })
})

// A Thousand Sons defender with the Weaver of Fates one-die save re-roll (stand-in gate): the new automatic-1s path must not disturb it.
describe('Weaver of Fates oneDie save offers still work (DAV-016 regression)', () => {
  it('DAV-016 THO-2.4: a failed save of a fast-rolled batch still raises the oneDie offer and re-rolls one die with the Weaver as source', () => {
    saved.set('weaverOfFates', codeHooks.weaverOfFates)
    codeHooks.weaverOfFates = { name: 'weaverOfFates', kind: 'ability', hook: 'onSaveRoll', forceScope: { who: 'friendly' }, run: () => undefined, gateEffect: () => true } as unknown as EngineCodeHook
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
      players: {
        A: { name: 'TS', faction: 'thousand-sons', patrolId: 'ths.cp.the-coven-temporus', enhancementId: 'ths.e.temporal-sorceries', secondaryId: 'ths.sec.sorcerous-ritual', attachments: [], reserves: [], battleReadyVp: 0 },
        B: ORK(),
      },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    const s = createGameState(setup, bundle, 'dav-weaver', ENGINE_VERSION)
    s.round = 2; s.activePlayer = 'B'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    s.players.A.cp = 0
    placeUnit(s, 'A:tzaangors-1', [[0, 0], [1, 0]])
    placeUnit(s, BOYZ, [[0, 12], [1.3, 12]])
    const m = weaponModel(s, BOYZ, 'ork.w.shoota')
    // 2 hits (6,6), 2 wounds (6,6), 2 saves (2,3: both fail), re-roll of die 0 -> 6 (saved)
    const { ctx, events } = ctxOf(s, [6, 6, 6, 6, 2, 3, 6])
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: BOYZ, overwatch: false, targets: [decl(m, 'ork.w.shoota', 'A:tzaangors-1')] })
    settle(ctx, s)
    expect(s.pending?.kind).toBe('chooseOption')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.context.topic).toBe('rerollOffer')
    expect(p.context.data).toMatchObject({ purpose: 'save', dieIndexes: [0, 1], maxDice: 1, source: 'ths.a.weaver-of-fates' })
    s.pending = null
    expect(attackService.handler.handle(ctx, { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: 'reroll', dieIndexes: [0] } as Action, p)).toBeFalsy()
    settle(ctx, s)
    const rr = of(events, 'DiceRerolled')
    expect(rr).toHaveLength(1)
    expect(rr[0]).toMatchObject({ source: 'ths.a.weaver-of-fates', before: [2], after: [6], indexes: [0] })
    expect(of(events, 'SaveRolled').map((e) => e.saved)).toEqual([true, false])
  })
})
