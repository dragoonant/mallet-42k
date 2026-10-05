// Adeptus Custodes engine changes beyond code hooks (docs/spec/factions/adeptus-custodes.md 7.1, items E1-E4). The spec's
// checklist prefix is CUS (ADE- belongs to Adepta Sororitas). Real Combat Patrol data vs Gordrang's Gitstompas.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type AttackContext, type ChooseOptionDecision, type EngineContext, type GameSetup, type GameState, type ModuleTable, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { movementModule, engagedAtMovementStart, snapshotEngagementAtMovementStart } from '../../src/engine/phases/movement'
import { modelIdFor } from '../../src/engine/state'
import { weaponService } from '../../src/engine/weapons'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CUS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Custodes', faction: 'adeptus-custodes', patrolId: 'cus.cp.guardians-of-the-throne', enhancementId: 'cus.e.auramite-thunderbolt',
  secondaryId: 'cus.sec.guardian-of-the-realm', attachments: [{ leaderRef: 'captain', bodyguardRef: 'guard' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const CAP = 'A:captain', GUARD = 'A:guard', PRO = 'A:prosecutors'
const BOYZ = 'B:boyz-a', BOSS = 'B:warboss'

function makeState(phase: GameState['phase'], active: 'A' | 'B' = 'A', a: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: CUS(a), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
  const s = createGameState(setup, bundle, 'cus-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = active
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
function ctxOf(s: GameState, dice: number[] = []): EngineContext {
  const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
  return createContext(s, new ScriptedRng(dice), modules).ctx
}
function weaponOf(s: GameState, unitId: string, kind: 'ranged' | 'melee'): { modelId: string; weaponId: string } {
  for (const id of s.units[unitId].models) {
    const w = s.models[id].weapons.find((x) => s.weapons[x]?.kind === kind)
    if (w) return { modelId: id, weaponId: w }
  }
  throw new Error(`no ${kind} weapon on ${unitId}`)
}
function attackCtx(s: GameState, attackerUnitId: string, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId, targetModelId: null,
    range: 12, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
const abilitiesOf = (s: GameState, unitId: string, kind: 'ranged' | 'melee', targetUnitId: string | null): string[] => {
  const { modelId, weaponId } = weaponOf(s, unitId, kind)
  const atk = targetUnitId ? attackCtx(s, unitId, modelId, weaponId, targetUnitId) : undefined
  return weaponService.effectiveWeapon(s, modelId, weaponId, atk).abilities.map((a) => a.ability)
}

describe('E2 target-aware weapon abilities (CUS-014, CUS-020, CUS-024)', () => {
  it('CUS-020 Purity of Execution: Prosecutor ranged weapons gain Precision + Devastating Wounds only against a PSYKER target', () => {
    const s = makeState('shooting')
    const ds = s.units[BOYZ].datasheetId
    s.datasheets = { ...s.datasheets, [ds]: { ...s.datasheets[ds], keywords: [...s.datasheets[ds].keywords, 'PSYKER'] } }
    const vs = abilitiesOf(s, PRO, 'ranged', BOYZ)
    expect(vs).toContain('PRECISION')
    expect(vs).toContain('DEVASTATING_WOUNDS')
    expect(abilitiesOf(s, PRO, 'ranged', BOSS)).not.toContain('PRECISION')
    expect(abilitiesOf(s, PRO, 'melee', BOYZ)).not.toContain('PRECISION')
    expect(abilitiesOf(s, PRO, 'ranged', null)).not.toContain('PRECISION')
  })

  it('CUS-014 target-held scope attacker: the grant on the killer unit buffs Custodes ranged attacks against it only', () => {
    const s = makeState('shooting')
    const ctx = ctxOf(s)
    effectService.grant(ctx, BOYZ, [{ when: { weaponType: 'ranged' }, grantWeaponAbility: { ability: 'SUSTAINED_HITS', value: 1 } }], {
      sourceAbilityId: 'cus.s.gilded-spear', sourceUnitId: null, scope: { who: 'attacker' }, duration: 'battle', when: { attackerKeyword: 'ADEPTUS CUSTODES' },
    })
    expect(abilitiesOf(s, GUARD, 'ranged', BOYZ)).toContain('SUSTAINED_HITS')
    expect(abilitiesOf(s, GUARD, 'ranged', BOSS)).not.toContain('SUSTAINED_HITS')
    expect(abilitiesOf(s, GUARD, 'melee', BOYZ)).not.toContain('SUSTAINED_HITS')
    // a target-less query is unchanged, and the marked unit's own weapons never gain it
    expect(abilitiesOf(s, GUARD, 'ranged', null)).not.toContain('SUSTAINED_HITS')
    const { modelId, weaponId } = weaponOf(s, BOYZ, 'ranged')
    expect(weaponService.effectiveWeapon(s, modelId, weaponId, attackCtx(s, BOYZ, modelId, weaponId, GUARD)).abilities.map((a) => a.ability)).not.toContain('SUSTAINED_HITS')
  })

  it('CUS-024 weapon-ability queries without an attack context are unchanged', () => {
    const s = makeState('shooting')
    const { modelId, weaponId } = weaponOf(s, GUARD, 'ranged')
    const base = s.weapons[weaponId]
    expect(hookService.weaponAbilitiesFor!(s, modelId, base)).toEqual(base.abilities)
    expect(weaponService.effectiveWeapon(s, modelId, weaponId).abilities).toEqual(base.abilities)
  })
})

describe('E3 Advance re-roll + rerollHooks (CUS-008)', () => {
  const place = (s: GameState): void => {
    placeUnit(s, CAP, [[-10, -4]]); placeUnit(s, GUARD, { x: -12, z: -6, gap: 0.3 }); placeUnit(s, PRO, { x: -12, z: -12, gap: 0.3 }); placeUnit(s, BOYZ, { x: 10, z: 8, gap: 0.3 })
  }
  const advance = (s: GameState, unitId: string, dice: number[]) => {
    const ctx = ctxOf(s, dice)
    movementModule.enter(ctx)
    const act = (action: Parameters<typeof movementModule.handle>[1]): void => {
      const pending = ctx.state.pending as PendingDecision
      ctx.state.pending = null
      const rej = movementModule.handle(ctx, action, pending)
      if (rej) throw new Error(`${rej.code} ${rej.reason}`)
      movementModule.advance(ctx)
    }
    movementModule.advance(ctx)
    act({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId })
    act({ type: 'declareMove', player: 'A', decisionId: '', unitId, moveType: 'advance' })
    return { ctx, act }
  }
  const offered = (s: GameState): boolean => s.pending?.kind === 'chooseOption' && (s.pending as ChooseOptionDecision).context.topic === 'rerollOffer'

  it('CUS-008 Tyvan\'s unit is offered a re-roll of its Advance roll; reroll replaces the die, keep keeps it', () => {
    const s = makeState('movement')
    place(s)
    const { ctx, act } = advance(s, GUARD, [2, 5])
    expect(offered(ctx.state)).toBe(true)
    act({ type: 'chooseOption', player: 'A', decisionId: (ctx.state.pending as ChooseOptionDecision).id, optionId: 'reroll' })
    expect(s.units[GUARD].turn.advanceRoll).toBe(5)

    const s2 = makeState('movement')
    place(s2)
    const r2 = advance(s2, GUARD, [2, 5])
    r2.act({ type: 'chooseOption', player: 'A', decisionId: (r2.ctx.state.pending as ChooseOptionDecision).id, optionId: 'keep' })
    expect(s2.units[GUARD].turn.advanceRoll).toBe(2)
  })

  it('CUS-008 other units get no Advance re-roll', () => {
    const s = makeState('movement')
    place(s)
    advance(s, PRO, [2])
    expect(s.units[PRO].turn.advanceRoll).toBe(2)
    expect(offered(s)).toBe(false)
  })
})

describe('E4 engagement snapshot at Movement-phase start (CUS-017, CUS-018)', () => {
  it('CUS-017 pairs in Engagement Range at phase start are remembered (canonical, either order) after the mover leaves', () => {
    const s = makeState('movement', 'B')
    placeUnit(s, GUARD, { x: -12, z: -6, gap: 0.3 })
    placeUnit(s, CAP, [[-12, -7]])
    placeUnit(s, PRO, { x: -12, z: -12, gap: 0.3 })
    placeUnit(s, BOYZ, { x: -12, z: -6.9, gap: 0.3 })
    snapshotEngagementAtMovementStart(s)
    expect(engagedAtMovementStart(s, GUARD, BOYZ)).toBe(true)
    expect(engagedAtMovementStart(s, BOYZ, GUARD)).toBe(true)
    expect(engagedAtMovementStart(s, CAP, BOYZ)).toBe(true) // the attached leader half canonicalises to its bodyguard unit
    placeUnit(s, BOYZ, { x: 10, z: 10, gap: 0.3 }) // fell back
    expect(engagedAtMovementStart(s, GUARD, BOYZ)).toBe(true)
    expect(engagedAtMovementStart(s, PRO, BOYZ)).toBe(false)
  })

  it('CUS-018 entering the Movement phase takes the snapshot; units not engaged at the start are not remembered', () => {
    const s = makeState('movement', 'B')
    placeUnit(s, GUARD, { x: -12, z: -6, gap: 0.3 })
    placeUnit(s, CAP, [[-12, -7]])
    placeUnit(s, PRO, { x: -12, z: -12, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 10, gap: 0.3 })
    movementModule.enter(ctxOf(s))
    expect(s.phaseState.marks.some((m) => m.startsWith('erAtStart:'))).toBe(false)
    expect(engagedAtMovementStart(s, GUARD, BOYZ)).toBe(false)
  })
})

describe('E1 mission plumbing (CUS-010, CUS-012)', () => {
  it('CUS-010 Guardian of the Realm: Tyvan\'s kill reaches the secondary through missionService.modelDestroyed and scores at phase end', () => {
    const s = makeState('fight', 'A')
    placeUnit(s, CAP, [[-10, -4]]); placeUnit(s, GUARD, { x: -12, z: -6, gap: 0.3 }); placeUnit(s, BOYZ, { x: -21, z: 14, gap: 0.3 })
    const ctx = ctxOf(s)
    missionService.onWindow(ctx, 'fight.start', 'fight')
    missionService.modelDestroyed!(ctx, { unitId: BOYZ, modelId: s.units[BOYZ].models[0], byPlayer: 'A', byUnitId: CAP, byModelId: modelIdFor(CAP, 0) })
    missionService.onWindow(ctx, 'phase.end', 'fight')
    expect(s.players.A.vp).toBe(1)
  })

  it('CUS-012 Drive the Talons Deep: the keyword param makes Custodes (not only NECRONS) score the flat award at the opponent\'s turn end', () => {
    const s = makeState('fight', 'B', { secondaryId: 'cus.sec.drive-the-talons-deep' })
    placeUnit(s, GUARD, { x: -4, z: 12, gap: 0.4 })
    placeUnit(s, CAP, [[-4, 11]])
    placeUnit(s, PRO, { x: -4, z: 14, gap: 0.4 })
    placeUnit(s, BOYZ, { x: 8, z: -8, gap: 0.4 })
    missionService.onWindow(ctxOf(s), 'turn.end', 'turn')
    expect(s.players.A.vp).toBe(3)
  })
})
