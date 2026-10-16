// Tristraen's Gilded Blades code hooks (docs/spec/factions/adeptus-custodes--tristraen-s-gilded-blades.md section 7, TRI-xxx).
// Real Combat Patrol data. Unit-level: hook bodies are driven directly against a fixture state.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle, ScoringRule } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type ChooseOptionDecision, type UseStratagemAction, type EngineContext, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { hookService } from '../../src/engine/hooks-impl'
import { codeHooks, type StratagemEnv } from '../../src/engine/code-hooks'
import {
  tgbConsecratedGroundGain, tgbConsecratedGroundLoss, tgbOverawingApply, tgbOverawingCheck, vexillaObjectiveIds, warriorExemplarRun,
  watchmanOfTerraGate,
} from '../../src/engine/factions/adeptus-custodes'
import { missionService } from '../../src/engine/missions'
import { stratagemService } from '../../src/engine/stratagems'
import { modelStats } from '../../src/engine/state'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CUS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Custodes', faction: 'adeptus-custodes', patrolId: 'cus.cp.tristraen-s-gilded-blades', enhancementId: 'cus.e.watchman-of-terra',
  secondaryId: 'cus.sec.raise-the-vexillas', attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0,
})
const TRI = 'A:tristraen', GUARD = 'A:guard', WARD = 'A:wardens', BOYZ = 'B:boyz-a'

function makeState(phase: GameState['phase'] = 'fight', active: 'A' | 'B' = 'A', a: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: CUS(a), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
  const s = createGameState(setup, bundle, 'tri', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = active
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
function deploy(s: GameState): void {
  placeUnit(s, TRI, [[-10, -4]])
  placeUnit(s, GUARD, { x: -12, z: -8, gap: 0.3 })
  placeUnit(s, WARD, { x: -12, z: -14, gap: 0.3 })
  placeUnit(s, BOYZ, { x: 10, z: 10, gap: 0.3 })
}
const ctxOf = (s: GameState, dice: number[] = []): EngineContext => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES).ctx
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
// union of weapon abilities over the unit's melee weapons
function meleeAbilities(s: GameState, unitId: string): string[] {
  const out = new Set<string>()
  for (const mid of s.units[unitId].models) {
    for (const wid of s.models[mid].weapons) {
      const w = s.weapons[wid]
      if (w.kind !== 'melee') continue
      for (const a of hookService.weaponAbilitiesFor(s, mid, w)) out.add(a.ability)
    }
  }
  return [...out]
}
function rangedAbilities(s: GameState, unitId: string): string[] {
  const out = new Set<string>()
  for (const mid of s.units[unitId].models) {
    for (const wid of s.models[mid].weapons) {
      const w = s.weapons[wid]
      if (w.kind !== 'ranged') continue
      for (const a of hookService.weaponAbilitiesFor(s, mid, w)) out.add(a.ability)
    }
  }
  return [...out]
}
const ocOf = (s: GameState, unitId: string): number => hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'OC' }, modelStats(s, s.models[s.units[unitId].models[0]]).OC)

describe("Tristraen's Gilded Blades code hooks", () => {
  it('TRI-001 hooks registered in the code registry', () => {
    for (const k of ['katahOnSelect', 'watchmanOfTerra', 'warriorExemplar', 'tgbOverawing', 'raiseTheVexillas', 'tgbConsecratedGround']) expect(codeHooks[k], k).toBeTruthy()
  })

  it("TRI-004 Ka'tah is offered per activation at fight.unitSelected, mandatory, once per unit per phase", () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', GUARD)).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(p.canPass).toBe(false)
    expect(p.context.unitId).toBe(GUARD)
    answer(ctx, 'dacatarai')
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', GUARD)).toBe(false)
    // a different unit gets its own pick; an enemy unit gets none
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', WARD)).toBe(true)
    answer(ctx, 'rendax')
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', BOYZ)).toBe(false)
  })

  it("TRI-004 Ka'tah is also offered in the opponent's Fight phase", () => {
    const s = makeState('fight', 'B')
    deploy(s)
    const ctx = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'fight.unitSelected', TRI)).toBe(true)
    expect((s.pending as ChooseOptionDecision).player).toBe('A')
  })

  it("TRI-005 each unit gets only its own stance on melee weapons; ranged weapons are never touched", () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    const rangedBefore = rangedAbilities(s, WARD)
    hookService.offerPicks(ctx, 'fight.unitSelected', GUARD)
    answer(ctx, 'dacatarai')
    hookService.offerPicks(ctx, 'fight.unitSelected', WARD)
    answer(ctx, 'rendax')
    expect(meleeAbilities(s, GUARD)).toContain('SUSTAINED_HITS')
    expect(meleeAbilities(s, GUARD)).not.toContain('LETHAL_HITS')
    expect(meleeAbilities(s, WARD)).toContain('LETHAL_HITS')
    expect(rangedAbilities(s, WARD)).toEqual(rangedBefore)
    expect(rangedAbilities(s, GUARD)).not.toContain('LETHAL_HITS')
  })

  it("TRI-006 the army-wide Guardians Ka'tah pick is never offered to a Tristraen-only army", () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'fight.start', 'start')).toBe(false)
    expect(s.pending).toBeNull()
  })

  it('TRI-007 Watchman of Terra: OC 4 only while the bearer is in Engagement Range of an enemy', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    expect(watchmanOfTerraGate(s, s.units[TRI])).toBe(false)
    expect(ocOf(s, TRI)).toBe(2)
    placeUnit(s, BOYZ, { x: -10, z: -2.5, gap: 0.3 })
    expect(watchmanOfTerraGate(s, s.units[TRI])).toBe(true)
    expect(ocOf(s, TRI)).toBe(4)
  })

  it('TRI-007 a Battle-shocked bearer contributes 0 OC to objective control even in Engagement Range', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const obj = Object.values(s.objectives)[0]
    placeUnit(s, TRI, [[obj.pos.x, obj.pos.z]])
    placeUnit(s, BOYZ, { x: obj.pos.x, z: obj.pos.z + 1.5, gap: 0.3 })
    const lv = () => DEFAULT_MODULES.services.objectives.levelOfControl(s, obj.id).A
    expect(lv()).toBeGreaterThanOrEqual(4)
    s.units[TRI].battleShocked = true
    expect(lv()).toBe(0)
  })

  it("TRI-002 unitChoices {retinue:'allarus'} fields 3 units and 6 models, no Wardens", () => {
    const s = makeState('movement', 'A', { unitChoices: { retinue: 'allarus' } })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(3)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(6)
    expect(s.units[WARD]).toBeUndefined()
  })

  function useStrat(s: GameState, ctx: EngineContext, id: string, window: Parameters<typeof stratagemService.options>[2], target: string, trigger: { unitId?: string } = {}): boolean {
    const action = stratagemService.options(s, 'A', window, trigger).find((x) => x.stratagemId === id && x.targets.unitIds?.[0] === target)
    if (!action) return false
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
    const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
    expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
    return true
  }

  it('TRI-013 Gilded Spear: pile-in 6" and consolidate still 3"; not targetable once the unit has fought; either turn', () => {
    for (const active of ['A', 'B'] as const) {
      const s = makeState('fight', active)
      deploy(s)
      s.players.A.cp = 3
      const ctx = ctxOf(s)
      expect(hookService.pileInDistance(s, GUARD)).toBe(3)
      expect(useStrat(s, ctx, 'cus.s.tgb-gilded-spear', 'fight.start', GUARD)).toBe(true)
      expect(hookService.pileInDistance(s, GUARD)).toBe(6)
      expect(hookService.consolidateDistance(s, GUARD)).toBe(3)
    }
    const s = makeState('fight', 'A')
    deploy(s)
    s.players.A.cp = 3
    s.units[GUARD].turn.foughtThisPhase = true
    expect(useStrat(s, ctxOf(s), 'cus.s.tgb-gilded-spear', 'fight.start', GUARD)).toBe(false)
  })

  it('TRI-014 Inescapable Vengeance: Advance roll +2 in own Movement phase; not targetable once the unit moved; not in the opponent turn', () => {
    const s = makeState('movement', 'A')
    deploy(s)
    s.players.A.cp = 3
    const ctx = ctxOf(s)
    expect(hookService.advanceRollFor(s, GUARD, 3)).toBe(3)
    expect(useStrat(s, ctx, 'cus.s.tgb-inescapable-vengeance', 'movement.start', GUARD)).toBe(true)
    expect(hookService.advanceRollFor(s, GUARD, 3)).toBe(5)
    expect(hookService.advanceRollFor(s, WARD, 3)).toBe(3)
    const m = makeState('movement', 'A')
    deploy(m)
    m.players.A.cp = 3
    m.phaseState.activated.push(GUARD)
    expect(useStrat(m, ctxOf(m), 'cus.s.tgb-inescapable-vengeance', 'movement.unitMoved', GUARD)).toBe(false)
    const o = makeState('movement', 'B')
    deploy(o)
    o.players.A.cp = 3
    expect(useStrat(o, ctxOf(o), 'cus.s.tgb-inescapable-vengeance', 'movement.start', GUARD)).toBe(false)
  })

  it('TRI-020 Dacatarai does not stack on Hurricanus; Rendax on Hurricanus gives Lethal plus Sustained', () => {
    const count = (s: GameState, unitId: string): { sustained: number; lethal: number } => {
      let sustained = 0, lethal = 0
      for (const mid of s.units[unitId].models) {
        for (const wid of s.models[mid].weapons) {
          const w = s.weapons[wid]
          if (!w.id.includes('vaultswords-hurricanus')) continue
          const ab = hookService.weaponAbilitiesFor(s, mid, w)
          sustained = Math.max(sustained, ab.filter((a) => a.ability === 'SUSTAINED_HITS').length)
          lethal = Math.max(lethal, ab.filter((a) => a.ability === 'LETHAL_HITS').length)
        }
      }
      return { sustained, lethal }
    }
    for (const [stance, want] of [['dacatarai', { sustained: 1, lethal: 0 }], ['rendax', { sustained: 1, lethal: 1 }]] as const) {
      const s = makeState('fight', 'A')
      deploy(s)
      const ctx = ctxOf(s)
      hookService.offerPicks(ctx, 'fight.unitSelected', TRI)
      answer(ctx, stance)
      expect(count(s, TRI)).toEqual(want)
    }
  })

  describe('Warrior Exemplar (TRI-008)', () => {
    function setup() {
      const s = makeState('fight', 'A', { enhancementId: 'cus.e.warrior-exemplar' })
      deploy(s)
      const bearer = s.units[TRI].models[0]
      const entry = { source: { id: 'cus.e.warrior-exemplar.effect' }, holderUnitId: TRI, bearerModelId: bearer, params: { threshold: 3, cp: 1 } } as unknown as Parameters<typeof warriorExemplarRun>[1]
      return { s, bearer, entry }
    }
    it('TRI-008 a roll of 3+ gains 1 CP; 1-2 gains nothing', () => {
      const a = setup()
      const cp0 = a.s.players.A.cp
      warriorExemplarRun(ctxOf(a.s, [3]), a.entry, { byModelId: a.bearer, destroyedUnitId: BOYZ })
      expect(a.s.players.A.cp).toBe(cp0 + 1)
      const b = setup()
      warriorExemplarRun(ctxOf(b.s, [2]), b.entry, { byModelId: b.bearer, destroyedUnitId: BOYZ })
      expect(b.s.players.A.cp).toBe(cp0)
    })
    it('TRI-008 a kill by another model, or of a friendly unit, rolls nothing', () => {
      const { s, bearer, entry } = setup()
      const cp0 = s.players.A.cp
      warriorExemplarRun(ctxOf(s, []), entry, { byModelId: s.units[GUARD].models[0], destroyedUnitId: BOYZ })
      warriorExemplarRun(ctxOf(s, []), entry, { byModelId: bearer, destroyedUnitId: GUARD })
      expect(s.players.A.cp).toBe(cp0)
    })
    it('TRI-008 the second gain in one round is capped', () => {
      const { s, bearer, entry } = setup()
      s.players.A.cpGainedThisRound = 0
      const cp0 = s.players.A.cp
      warriorExemplarRun(ctxOf(s, [6]), entry, { byModelId: bearer, destroyedUnitId: BOYZ })
      warriorExemplarRun(ctxOf(s, [6]), entry, { byModelId: bearer, destroyedUnitId: BOYZ })
      expect(s.players.A.cp).toBe(cp0 + 1)
    })
  })

  describe('Raise the Vexillas scoring (TRI-009)', () => {
    function score(round: number, active: 'A' | 'B', hold: 'both' | 'one'): number {
      const s = makeState('movement', active)
      s.round = round
      s.mission.secondaries.A = bundle.patrols['cus.cp.tristraen-s-gilded-blades'].secondaries!.find((x) => x.id === 'cus.sec.raise-the-vexillas')!.scoring as ScoringRule[]
      const v = vexillaObjectiveIds(s, 'A')
      for (const o of Object.values(s.objectives)) o.securedBy = null
      s.objectives[v.own[0]].securedBy = 'A'
      if (hold === 'both') s.objectives[v.enemy[0]].securedBy = 'A'
      const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
      missionService.onWindow(ctx, 'turn.end', `k${round}${active}${hold}`)
      return s.players.A.vp
    }
    it('TRI-009 round 3+, own turn end, both edge-closest markers -> 3 VP', () => { expect(score(3, 'A', 'both')).toBe(3); expect(score(5, 'A', 'both')).toBe(3) })
    it('TRI-009 only one marker -> 0', () => { expect(score(3, 'A', 'one')).toBe(0) })
    it('TRI-009 round 2 -> 0', () => { expect(score(2, 'A', 'both')).toBe(0) })
    it("TRI-009 end of the opponent's turn -> 0", () => { expect(score(3, 'B', 'both')).toBe(0) })
  })

  it('TRI-010 vexillaObjectiveIds picks the markers closest to each edge, all tied ids, ignoring removed markers', () => {
    const s = makeState('movement', 'A')
    const { own, enemy } = vexillaObjectiveIds(s, 'A')
    expect(own.length).toBeGreaterThan(0)
    expect(enemy.length).toBeGreaterThan(0)
    expect(own.some((id) => enemy.includes(id))).toBe(false)
    const swapped = vexillaObjectiveIds(s, 'B')
    expect(swapped.own).toEqual(enemy)
    expect(swapped.enemy).toEqual(own)
    // other deployment orientation: swap the two zones, the edge-closest sets swap with them
    const z = s.mission.data.deploymentZones
    const keep = { A: z.A, B: z.B }
    z.A = keep.B; z.B = keep.A
    const flipped = vexillaObjectiveIds(s, 'A')
    expect(flipped.own).toEqual(enemy)
    expect(flipped.enemy).toEqual(own)
    z.A = keep.A; z.B = keep.B
    for (const id of own) s.objectives[id].removed = true
    expect(vexillaObjectiveIds(s, 'A').own.every((id) => !own.includes(id))).toBe(true)
  })

  const RULE = { id: 'consecrated-ground-tgb', pointsPer: 3, cap: 999, params: { lossPerModel: 1, keyword: 'ADEPTUS CUSTODES' } } as unknown as ScoringRule
  it('TRI-011 Consecrated Ground gain: 3 VP when an enemy unit is destroyed, nothing for your own', () => {
    const s = makeState('fight', 'A')
    expect(tgbConsecratedGroundGain(s, { unitId: BOYZ, byPlayer: 'A', byUnitId: TRI, byModelId: null }, 'A', RULE)).toBe(3)
    expect(tgbConsecratedGroundGain(s, { unitId: GUARD, byPlayer: 'B', byUnitId: null, byModelId: null }, 'A', RULE)).toBe(0)
  })
  it('TRI-012 Consecrated Ground loss: 1 per own Custodes model, none for enemy models', () => {
    const s = makeState('fight', 'A')
    const m = s.units[GUARD].models[0]
    expect(tgbConsecratedGroundLoss(s, { unitId: GUARD, modelId: m, byPlayer: 'B', byUnitId: null, byModelId: null }, 'A', RULE)).toBe(1)
    expect(tgbConsecratedGroundLoss(s, { unitId: BOYZ, modelId: s.units[BOYZ].models[0], byPlayer: 'A', byUnitId: null, byModelId: null }, 'A', RULE)).toBe(0)
    expect(tgbConsecratedGroundLoss(s, { unitId: GUARD, modelId: m, byPlayer: 'B', byUnitId: null, byModelId: null }, 'B', RULE)).toBe(0)
  })

  describe('Overawing Magnificence (TRI-015)', () => {
    function env(s: GameState): StratagemEnv {
      return { state: s, player: 'A', stratagem: { id: 'cus.s.tgb-overawing-magnificence' }, trigger: { unitId: BOYZ } } as unknown as StratagemEnv
    }
    it('TRI-015 check needs the charger to be the declaring unit and the Custodes unit to be a charge target', () => {
      const s = makeState('charge', 'B')
      deploy(s)
      const t = { ids: [BOYZ, GUARD], objectiveId: null }
      expect(tgbOverawingCheck(env(s), t)).toBe(false)
      s.phaseState.charge = { targetUnitIds: [GUARD] } as unknown as GameState['phaseState']['charge']
      expect(tgbOverawingCheck(env(s), t)).toBe(true)
      expect(tgbOverawingCheck(env(s), { ids: [BOYZ, WARD], objectiveId: null })).toBe(false)
    })
    it('TRI-015 failed Leadership test gives the charger -2 to its charge roll; a pass changes nothing', () => {
      const failed = makeState('charge', 'B')
      deploy(failed)
      tgbOverawingApply(ctxOf(failed, [1, 1]), env(failed), { ids: [BOYZ, GUARD], objectiveId: null })
      const fx = failed.units[BOYZ].effects.map((e) => JSON.stringify(e.effect))
      expect(fx.some((j) => j.includes('"charge"') && j.includes('-2'))).toBe(true)
      const passed = makeState('charge', 'B')
      deploy(passed)
      tgbOverawingApply(ctxOf(passed, [6, 6]), env(passed), { ids: [BOYZ, GUARD], objectiveId: null })
      expect(passed.units[BOYZ].effects).toHaveLength(0)
    })
  })
})
