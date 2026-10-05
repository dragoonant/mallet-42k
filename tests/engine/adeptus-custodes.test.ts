// Adeptus Custodes code hooks (docs/spec/factions/adeptus-custodes.md section 8, CUS-004..CUS-024; the spec's checklist prefix is CUS because
// ADE- is taken by Adepta Sororitas). Real Combat Patrol data. Unit-level: the hook bodies are driven directly against a fixture state.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  removeModel, type Action, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type PendingDecision, type PlayerSetup, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { effectService } from '../../src/engine/effects'
import { stratagemService } from '../../src/engine/stratagems'
import { chargeModule } from '../../src/engine/phases/charge'
import { missionService } from '../../src/engine/missions'
import { weaponService } from '../../src/engine/weapons'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import {
  gildedSpearApply, gildedSpearCheck, overawingApply, guardianOfTheRealmAmount, guardianOfTheRealmModelDestroyed, guardianOfTheRealmSnapshot, katahUnits,
  overawingCheck, standVigilGate, adeptusCustodesHooks,
} from '../../src/engine/factions/adeptus-custodes'
import { codeHooks, type StratagemEnv } from '../../src/engine/code-hooks'
import { view as engineView } from '../../src/engine'
import { createUtilityDecider } from '../../src/ai/utility'
import { HOLD_CP_SCORE, stratagemScore } from '../../src/ai/stratagems'
import { modelIdFor, modelStats } from '../../src/engine/state'
import { placeUnit, recordingStratagems } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CUS = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Custodes', faction: 'adeptus-custodes', patrolId: 'cus.cp.guardians-of-the-throne', enhancementId: 'cus.e.auramite-thunderbolt',
  secondaryId: 'cus.sec.guardian-of-the-realm', attachments: [{ leaderRef: 'captain', bodyguardRef: 'guard' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})
const CAP = 'A:captain', GUARD = 'A:guard', PRO = 'A:prosecutors', VIG = 'A:vigilators'
const BOYZ = 'B:boyz-a', BOSS = 'B:warboss'

function makeState(phase: GameState['phase'] = 'fight', active: 'A' | 'B' = 'A', a: Partial<PlayerSetup> = {}, b: Partial<PlayerSetup> = {}): GameState {
  const setup: GameSetup = { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: CUS(a), B: ORK(b) }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' }
  const s = createGameState(setup, bundle, 'cus', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = active
  s.phase = phase
  s.phaseState = emptyPhaseState()
  return s
}
function deploy(s: GameState): void {
  placeUnit(s, CAP, [[-10, -4]])
  placeUnit(s, GUARD, { x: -12, z: -6, gap: 0.3 })
  placeUnit(s, PRO, { x: -12, z: -12, gap: 0.3 })
  placeUnit(s, VIG, { x: -12, z: -16, gap: 0.3 })
  placeUnit(s, BOYZ, { x: -6, z: 8, gap: 0.3 })
}
const ctxOf = (s: GameState, dice: number[] = []): EngineContext => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES).ctx
function answer(ctx: EngineContext, optionId: string): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}
function weaponAbilities(s: GameState, unitId: string, weaponDataId: string): string[] {
  const m = s.units[unitId].models.map((id) => s.models[id]).find((mm) => mm.weapons.some((w) => s.weapons[w]?.id === weaponDataId || w === weaponDataId || w.endsWith(weaponDataId)))!
  const wid = m.weapons.find((w) => s.weapons[w]?.id === weaponDataId || w === weaponDataId || w.endsWith(weaponDataId))!
  return hookService.weaponAbilitiesFor(s, m.id, s.weapons[wid]).map((a) => a.ability)
}


// ---------- attack plumbing (real attack pipeline, scripted dice) ----------
const TAIL = Array(60).fill(6)
const target = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null = 1): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
function modelWith(s: GameState, unitId: string, weaponId: string): string {
  const id = s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId))
  if (!id) throw new Error(`no ${weaponId} on ${unitId}`)
  return id
}
// answers every attack decision with `pick(pending)` (an option id; default: first option); records the rerollOffer decisions it saw
function driveAttack(ctx: EngineContext, pick: (p: PendingDecision) => string | null = () => null): { offers: PendingDecision[] } {
  const offers: PendingDecision[] = []
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending as PendingDecision
    if (pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer') offers.push(pending)
    const want = pending.kind === 'chooseOption' ? pick(pending) : null
    const opts = ('options' in pending ? pending.options : []) as { id?: string; action: Action }[]
    const chosen = (want ? opts.find((o) => o.id === want) : null) ?? opts[0]
    const action = (chosen ? chosen.action : { type: 'pass', player: pending.player, decisionId: pending.id }) as Action
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return { offers }
}
function attack(s: GameState, dice: number[], kind: 'ranged' | 'melee', unitId: string, weaponId: string, targetUnitId: string, attacks: number | null = 1,
  pick?: (p: PendingDecision) => string | null) {
  const { ctx, events } = createContext(s, new ScriptedRng([...dice, ...TAIL]), { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } })
  attackService.begin(ctx, { kind, attackerUnitId: unitId, overwatch: false, targets: [target(modelWith(s, unitId, weaponId), weaponId, targetUnitId, attacks)] })
  const { offers } = driveAttack(ctx, pick)
  return { ctx, events, offers }
}
function useStratagem(s: GameState, ctx: EngineContext, player: 'A' | 'B', stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string }, targetUnit: string): void {
  const action = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === targetUnit)
  if (!action) throw new Error(`${stratagemId} on ${targetUnit} not offered`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}
function attackCtxOf(s: GameState, attackerModelId: string, weaponId: string, targetUnitId: string): AttackContext {
  const m = s.models[attackerModelId]
  return {
    kind: s.weapons[weaponId].kind, overwatch: false, attackerUnitId: m.unitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId,
    targetModelId: s.units[targetUnitId].models[0], range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
  }
}
const offered = (s: GameState, p: 'A' | 'B', w: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
  stratagemService.options(s, p, w, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds?.[0])
const ocOf = (s: GameState, unitId: string): number => hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'OC' }, 0)
describe('adeptus custodes code hooks', () => {
  it('CUS-001 hooks registered in the code registry', () => {
    for (const k of ['martialKatahPick', 'auramiteThunderbolt', 'standVigil', 'gildedSpear', 'overawingMagnificence', 'guardianOfTheRealm']) expect(codeHooks[k], k).toBeTruthy()
    expect(adeptusCustodesHooks.auramiteThunderbolt.rerollHooks).toEqual(['onChargeRoll', 'onAdvanceRoll'])
  })

  it('CUS-004 Ka\'tah pick is offered at fight.start to the active player first, mandatory, once per phase; none without a Ka\'tah unit', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    expect(katahUnits(s, 'A')).toEqual([GUARD])
    const ctx = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'fight.start', 'start')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(p.canPass).toBe(false)
    expect(p.options.map((o) => o.id).sort()).toEqual(['dacatarai', 'rendax'])
    answer(ctx, 'dacatarai')
    expect(s.pending).toBeNull()
    expect(hookService.offerPicks(ctx, 'fight.start', 'start')).toBe(false)
    // no Custodes unit on the battlefield: no pick
    const s2 = makeState('fight', 'B')
    expect(hookService.offerPicks(ctxOf(s2), 'fight.start', 'start')).toBe(false)
  })

  it('CUS-005 Dacatarai: Guard melee gains Sustained Hits 1; Prosecutors and ranged unaffected', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    hookService.offerPicks(ctx, 'fight.start', 'start')
    answer(ctx, 'dacatarai')
    expect(weaponAbilities(s, GUARD, 'cus.w.guardian-spear-melee')).toContain('SUSTAINED_HITS')
    expect(weaponAbilities(s, PRO, 'cus.w.close-combat-weapon-prosecutor')).not.toContain('SUSTAINED_HITS')
    expect(weaponAbilities(s, GUARD, 'cus.w.guardian-spear-ranged')).not.toContain('SUSTAINED_HITS')
  })

  it('CUS-006 Rendax: melee gains Lethal Hits, and the stance ends with the phase', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    hookService.offerPicks(ctx, 'fight.start', 'start')
    answer(ctx, 'rendax')
    expect(weaponAbilities(s, GUARD, 'cus.w.guardian-spear-melee')).toContain('LETHAL_HITS')
    expect(weaponAbilities(s, GUARD, 'cus.w.guardian-spear-melee')).not.toContain('SUSTAINED_HITS')
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(weaponAbilities(s, GUARD, 'cus.w.guardian-spear-melee')).not.toContain('LETHAL_HITS')
  })

  it('CUS-007 attached Tyvan gains the stance too', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    hookService.offerPicks(ctx, 'fight.start', 'start')
    answer(ctx, 'dacatarai')
    expect(weaponAbilities(s, CAP, 'cus.w.sentinel-blade-tyvan')).toContain('SUSTAINED_HITS')
  })

  it('CUS-008 Auramite Thunderbolt re-rolls charge rolls for Tyvan\'s unit only', () => {
    const s = makeState('charge', 'A')
    deploy(s)
    const ctx = ctxOf(s)
    const kindsFor = (unit: string) => {
      const out = new Set<string>()
      for (const r of hookService.collect(ctx, 'onChargeRoll', {
        chargingUnitId: unit, targetUnitIds: [BOYZ],
        roll: { purpose: 'charge', roll: { id: 'r', dice: [1, 2], final: [1, 2], rerolled: [] } as never, dieIndex: 0, unmodified: 3, rerolled: false },
      })) if (r.result.kind === 'roll' && r.result.reroll) out.add(r.result.reroll)
      return out
    }
    expect(kindsFor(GUARD).has('all')).toBe(true)
    expect(kindsFor(PRO).has('all')).toBe(false)
  })

  it('CUS-010 Guardian of the Realm: kill by Tyvan scores 1, or 2 if the victim began in range of a marker, capped per phase', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const rule = { pointsPer: 1, params: { bonusPoints: 2 } }
    const ctx = ctxOf(s)
    guardianOfTheRealmSnapshot(s)
    s.players.A.secondaryState.gotrNearAtStart = []
    const victim = s.units[BOYZ]
    guardianOfTheRealmModelDestroyed(ctx, { unitId: victim.id, modelId: victim.models[0], byPlayer: 'A', byUnitId: CAP, byModelId: modelIdFor(CAP, 0) })
    guardianOfTheRealmModelDestroyed(ctx, { unitId: victim.id, modelId: victim.models[1], byPlayer: 'A', byUnitId: CAP, byModelId: modelIdFor(CAP, 0) })
    expect(guardianOfTheRealmAmount(s, rule as never, 'A')).toBe(1)
    // consumed
    expect(guardianOfTheRealmAmount(s, rule as never, 'A')).toBe(0)
    // victim started in range
    s.players.A.secondaryState.gotrNearAtStart = [BOYZ]
    guardianOfTheRealmModelDestroyed(ctx, { unitId: victim.id, modelId: victim.models[0], byPlayer: 'A', byUnitId: CAP, byModelId: modelIdFor(CAP, 0) })
    expect(guardianOfTheRealmAmount(s, rule as never, 'A')).toBe(2)
  })

  it('CUS-011 Guardian of the Realm: a Guard model\'s kill does not count', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const rule = { pointsPer: 1, params: { bonusPoints: 2 } }
    guardianOfTheRealmModelDestroyed(ctxOf(s), { unitId: BOYZ, modelId: s.units[BOYZ].models[0], byPlayer: 'A', byUnitId: GUARD, byModelId: modelIdFor(GUARD, 0) })
    expect(guardianOfTheRealmAmount(s, rule as never, 'A')).toBe(0)
  })

  it('CUS-014 Gilded Spear is offered only for Tyvan\'s own death by an enemy attack', () => {
    const s = makeState('shooting', 'B')
    deploy(s)
    const env = { state: s, player: 'A' } as unknown as StratagemEnv
    expect(gildedSpearCheck(env, { ids: [CAP], objectiveId: null })).toBe(false)
    s.phaseState.marks.push(`deathReaction:${JSON.stringify({ modelId: modelIdFor(CAP, 0), unitId: CAP, player: 'A', attackerUnitId: BOYZ })}`)
    expect(gildedSpearCheck(env, { ids: [CAP], objectiveId: null })).toBe(true)
    expect(gildedSpearCheck(env, { ids: [GUARD], objectiveId: null })).toBe(false)
  })

  it('CUS-017 Overawing Magnificence needs a Fall Back by an enemy that was engaged with the target at phase start', () => {
    const s = makeState('movement', 'B')
    deploy(s)
    const env = { state: s, player: 'A', trigger: { unitId: BOYZ } } as unknown as StratagemEnv
    const t = { ids: [PRO], objectiveId: null }
    s.units[BOYZ].turn.moveType = 'fallBack'
    expect(overawingCheck(env, t)).toBe(false) // not engaged at phase start
    const [x, y] = PRO < BOYZ ? [PRO, BOYZ] : [BOYZ, PRO]
    s.phaseState.marks.push(`erAtStart:${x}|${y}`)
    expect(overawingCheck(env, t)).toBe(true)
    s.units[BOYZ].turn.moveType = 'normal'
    expect(overawingCheck(env, t)).toBe(false)
  })

  it('CUS-019 Stand Vigil gate: only while within range of a marker the player controls', () => {
    const s = makeState('fight', 'A')
    deploy(s)
    const obj = Object.values(s.objectives)[0]
    const m = s.models[s.units[GUARD].models[0]]
    obj.pos = { x: m.pos.x, z: m.pos.z }
    obj.controller = null
    expect(standVigilGate(s, s.units[GUARD])).toBe(false)
    obj.controller = 'B'
    expect(standVigilGate(s, s.units[GUARD])).toBe(false)
    obj.controller = 'A'
    expect(standVigilGate(s, s.units[GUARD])).toBe(true)
    // the attached leader's half shares the answer
    expect(leaderService.canonicalUnitId(s, CAP)).toBe(GUARD)
    expect(standVigilGate(s, s.units[CAP])).toBe(true)
  })

  it('CUS-024 weapon-ability queries without an attack context are unchanged for a plain Prosecutor boltgun', () => {
    const s = makeState('shooting', 'A')
    deploy(s)
    const abilities = weaponAbilities(s, PRO, 'cus.w.boltgun')
    expect(abilities).toContain('RAPID_FIRE')
    expect(abilities).not.toContain('PRECISION')
  })

  // ---------- CUS-004: the pick in the opponent's Fight phase ----------
  it("CUS-004 opponent's Fight phase (active player B, no Ka'tah unit): the Custodes player still gets the mandatory pick, and the stance applies", () => {
    const s = makeState('fight', 'B')
    deploy(s)
    const ctx = ctxOf(s)
    expect(hookService.offerPicks(ctx, 'fight.start', 'start')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('A')
    expect(p.canPass).toBe(false)
    answer(ctx, 'dacatarai')
    expect(weaponAbilities(s, GUARD, 'cus.w.guardian-spear-melee')).toContain('SUSTAINED_HITS')
    expect(hookService.offerPicks(ctx, 'fight.start', 'start')).toBe(false)
  })

  // ---------- CUS-008: the charge path ----------
  describe('charge re-rolls', () => {
    const DID = ''
    function chargeAct(ctx: EngineContext, action: Action): void {
      if (!ctx.state.pending) chargeModule.advance(ctx)
      const pending = ctx.state.pending as PendingDecision
      const rej = chargeModule.validate ? chargeModule.validate(ctx.state, action, pending) : null
      if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
      ctx.state.pending = null
      const handled = chargeModule.handle(ctx, action, pending)
      if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
      chargeModule.advance(ctx)
    }
    function chargeState(charger: string, dice: number[]) {
      const s = makeState('charge', 'A')
      for (const other of [CAP, GUARD, PRO, VIG]) placeUnit(s, other, [[-30, -14]])
      placeUnit(s, charger, { x: 0, z: 0, gap: 0.3 })
      if (charger === GUARD) placeUnit(s, CAP, [[0, -2]])
      placeUnit(s, BOYZ, { x: 0, z: 6.5, gap: 0.3 })
      const modules = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems() } }
      const made = createContext(s, new ScriptedRng(dice), modules)
      chargeModule.enter(made.ctx)
      chargeAct(made.ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: charger })
      chargeAct(made.ctx, { type: 'declareCharge', player: 'A', decisionId: DID, unitId: charger, targetUnitIds: [BOYZ] })
      return made
    }
    const isOffer = (s: GameState): boolean => s.pending?.kind === 'chooseOption' && (s.pending as ChooseOptionDecision).context.topic === 'rerollOffer'

    it("CUS-008 a failed charge roll of Tyvan's unit is re-rolled automatically (2D6 = 2 fails, the re-roll 3+3 stands)", () => {
      const { events } = chargeState(GUARD, [1, 1, 3, 3])
      expect(of(events, 'ChargeRolled').map((e) => e.dice)).toEqual([[3, 3]])
      expect(of(events, 'ChargeFailed')).toHaveLength(0)
    })

    it("CUS-008 a passing charge roll of Tyvan's unit is only offered a re-roll; reroll replaces the dice, keep keeps them", () => {
      const a = chargeState(GUARD, [3, 3, 6, 6])
      expect(isOffer(a.ctx.state)).toBe(true)
      expect(of(a.events, 'ChargeRolled')).toHaveLength(0)
      chargeAct(a.ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: 'reroll' })
      expect(of(a.events, 'ChargeRolled').map((e) => e.dice)).toEqual([[6, 6]])
      const b = chargeState(GUARD, [3, 3, 6, 6])
      chargeAct(b.ctx, { type: 'chooseOption', player: 'A', decisionId: DID, optionId: 'keep' })
      expect(of(b.events, 'ChargeRolled').map((e) => e.dice)).toEqual([[3, 3]])
    })

    it('CUS-008 other units get nothing: a failed Prosecutors charge is not re-rolled', () => {
      const { ctx, events } = chargeState(PRO, [1, 1, 6, 6])
      expect(of(events, 'ChargeRolled').map((e) => e.dice)).toEqual([[1, 1]])
      expect(of(events, 'ChargeFailed')).toHaveLength(1)
      expect(isOffer(ctx.state)).toBe(false)
    })
  })

  // ---------- CUS-009 Blade of the Vaults ----------
  it("CUS-009 Blade of the Vaults: the bearer's critical wound resolves at AP -3, a plain wound stays -2, a Guard model's critical wound is unchanged", () => {
    const saveFinal = (unit: string, weapon: string, woundDie: number): number => {
      const s = makeState('fight', 'A', { enhancementId: 'cus.e.blade-of-the-vaults' })
      deploy(s)
      const { events } = attack(s, [4, woundDie, 5], 'melee', unit, weapon, BOSS)
      const sv = of(events, 'SaveRolled')[0]
      return sv.final
    }
    // save die scripted to 5 against the Warboss (2+ armour): the final value shows the AP applied
    const crit = saveFinal(CAP, 'cus.w.sentinel-blade-tyvan', 6)
    expect(crit).toBe(2)
    const plain = saveFinal(CAP, 'cus.w.sentinel-blade-tyvan', 4)
    expect(plain).toBe(3)
    const guard = saveFinal(GUARD, 'cus.w.guardian-spear-melee', 6)
    expect(guard).toBe(3)
  })

  // ---------- CUS-013 ----------
  it('CUS-013 Reclaim and Dominate still filters on NECRONS when the rule has no keyword param; the Custodes rule needs its ADEPTUS CUSTODES param', () => {
    const nec: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
      players: {
        A: { name: 'Necrons', faction: 'necrons', patrolId: 'nec.cp.amonhotekhs-guard', enhancementId: 'nec.e.overriding-control', secondaryId: 'nec.sec.reclaim-and-dominate', attachments: [{ leaderRef: 'overlord', bodyguardRef: 'warriors' }], reserves: [], battleReadyVp: 0 },
        B: ORK(),
      },
    }
    const n = createGameState(nec, bundle, 'cus-013', ENGINE_VERSION)
    n.round = 2; n.activePlayer = 'A'; n.phase = 'command'
    placeUnit(n, 'A:scarabs', { x: -4, z: 12, gap: 0.4 })
    expect(n.mission.secondaries.A[0].params?.keyword).toBeUndefined()
    missionService.onWindow(ctxOf(n), 'turn.end', 'turn')
    expect(n.players.A.vp).toBe(4)
    const place = (s: GameState) => { placeUnit(s, GUARD, { x: -4, z: 12, gap: 0.4 }); placeUnit(s, CAP, [[-4, 11]]); placeUnit(s, PRO, { x: -4, z: 14, gap: 0.4 }); placeUnit(s, BOYZ, { x: 8, z: -8, gap: 0.4 }) }
    const c = makeState('fight', 'B', { secondaryId: 'cus.sec.drive-the-talons-deep' })
    place(c)
    c.mission.secondaries.A = [{ ...c.mission.secondaries.A[0], params: {} }] // a copy: the bundle's rule objects are shared
    missionService.onWindow(ctxOf(c), 'turn.end', 'turn')
    expect(c.players.A.vp).toBe(0)
    const d = makeState('fight', 'B', { secondaryId: 'cus.sec.drive-the-talons-deep' })
    place(d)
    expect(d.mission.secondaries.A[0].params?.keyword).toBe('ADEPTUS CUSTODES')
    missionService.onWindow(ctxOf(d), 'turn.end', 'turn')
    expect(d.players.A.vp).toBe(3)
  })

  // ---------- CUS-015 Gilded Spear edge cases ----------
  it('CUS-015 Gilded Spear is not offered for deaths outside an enemy attack (mortal wounds, own Hazardous) nor for a non-Captain model; it is for the Captain slain by an attack', () => {
    type By = { player: 'A' | 'B' | null; unitId: string | null; modelId: string | null; kind: 'melee' | 'mortal' | 'other' }
    const slay = (modelUnit: string, by: By) => {
      const s = makeState('shooting', 'B')
      deploy(s)
      s.players.A.cp = 3
      attackService.destroyModel(ctxOf(s), s.units[modelUnit].models[0], by)
      return s
    }
    const reactions = (s: GameState) => s.phaseState.marks.filter((m) => m.startsWith('deathReaction:'))
    const spear = (s: GameState, unit: string) => offered(s, 'A', 'attack.modelDestroyed', 'cus.s.gilded-spear', { unitId: unit })
    const mortal = slay(CAP, { player: 'B', unitId: BOYZ, modelId: null, kind: 'mortal' })
    expect(reactions(mortal)).toHaveLength(0)
    expect(spear(mortal, CAP)).toEqual([])
    const hazard = slay(CAP, { player: 'A', unitId: CAP, modelId: modelIdFor(CAP, 0), kind: 'other' })
    expect(reactions(hazard)).toHaveLength(0)
    expect(spear(hazard, CAP)).toEqual([])
    const guardKill = slay(GUARD, { player: 'B', unitId: BOYZ, modelId: 'B:boyz-a#0', kind: 'melee' })
    expect(spear(guardKill, GUARD)).toEqual([])
    const slain = slay(CAP, { player: 'B', unitId: BOYZ, modelId: 'B:boyz-a#0', kind: 'melee' })
    expect(reactions(slain)).toHaveLength(1)
    expect(spear(slain, CAP)).toEqual([CAP])
  })

  it('CUS-015 an attached enemy killer is marked as one unit: both halves stay marked after the leader dies', () => {
    const mirror = { faction: 'adeptus-custodes', patrolId: 'cus.cp.guardians-of-the-throne', enhancementId: 'cus.e.auramite-thunderbolt', secondaryId: 'cus.sec.guardian-of-the-realm', attachments: [{ leaderRef: 'captain', bodyguardRef: 'guard' }] }
    const s = makeState('shooting', 'B', {}, mirror)
    const ECAP = 'B:captain', EGUARD = 'B:guard'
    placeUnit(s, CAP, [[-10, -4]]); placeUnit(s, GUARD, { x: -12, z: -6, gap: 0.3 })
    placeUnit(s, EGUARD, { x: -6, z: 8, gap: 0.3 }); placeUnit(s, ECAP, [[-6, 6.5]])
    expect(leaderService.canonicalUnitId(s, ECAP)).toBe(EGUARD)
    s.phaseState.marks.push(`deathReaction:${JSON.stringify({ modelId: modelIdFor(CAP, 0), unitId: CAP, player: 'A', attackerUnitId: ECAP })}`)
    const env = { state: s, player: 'A', stratagem: { id: 'cus.s.gilded-spear' }, trigger: {} } as unknown as StratagemEnv
    gildedSpearApply(ctxOf(s), env, { ids: [CAP], objectiveId: null })
    const spear = modelWith(s, GUARD, 'cus.w.guardian-spear-ranged')
    const sustained = (targetUnit: string) => weaponService.effectiveWeapon(s, spear, 'cus.w.guardian-spear-ranged', attackCtxOf(s, spear, 'cus.w.guardian-spear-ranged', targetUnit)).abilities.map((a) => a.ability).includes('SUSTAINED_HITS')
    expect(sustained(EGUARD)).toBe(true)
    expect(sustained(ECAP)).toBe(true)
    removeModel(s, s.units[ECAP].models[0])
    expect(sustained(EGUARD)).toBe(true)
  })

  // ---------- CUS-016 Inescapable Vengeance ----------
  it("CUS-016 Inescapable Vengeance: +1 OC (Guard 3, Prosecutors 3) for 2 CP; persists through the opponent's turn, ends at the owner's next turn; a Battle-shocked unit is not a target", () => {
    const oc = (s: GameState, u: string) => hookService.statFor(s, { unitId: u, modelId: s.units[u].models[0], weapon: null, stat: 'OC' }, modelStats(s, s.models[s.units[u].models[0]]).OC)
    const s = makeState('command', 'A')
    deploy(s)
    s.players.A.cp = 3
    s.units[VIG].battleShocked = true
    const ctx = ctxOf(s)
    expect(oc(s, GUARD)).toBe(2)
    expect(offered(s, 'A', 'command.start', 'cus.s.inescapable-vengeance')).not.toContain(VIG)
    expect(offered(s, 'A', 'command.start', 'cus.s.inescapable-vengeance')).toContain(GUARD)
    useStratagem(s, ctx, 'A', 'cus.s.inescapable-vengeance', 'command.start', {}, GUARD)
    expect(s.players.A.cp).toBe(1)
    expect(oc(s, GUARD)).toBe(3)
    expect(oc(s, PRO)).toBe(2)
    effectService.expire(ctx, 'phaseEnd', null)
    effectService.expire(ctx, 'turnEnd', null)
    effectService.expire(ctx, 'nextOwnTurn', 'B') // the opponent's turn begins
    expect(oc(s, GUARD)).toBe(3)
    effectService.expire(ctx, 'nextOwnTurn', 'A') // the owner's next turn begins
    expect(oc(s, GUARD)).toBe(2)
    const s2 = makeState('command', 'A')
    deploy(s2)
    s2.players.A.cp = 3
    useStratagem(s2, ctxOf(s2), 'A', 'cus.s.inescapable-vengeance', 'command.start', {}, PRO)
    expect(oc(s2, PRO)).toBe(3)
  })

  // ---------- CUS-017: the move itself ----------
  it('CUS-017 Overawing Magnificence apply: opens a Normal move of up to 6" for the freed unit that must end outside Engagement Range', () => {
    const s = makeState('movement', 'B')
    deploy(s)
    const env = { state: s, player: 'A', stratagem: { id: 'cus.s.overawing-magnificence' }, trigger: { unitId: BOYZ } } as unknown as StratagemEnv
    overawingApply(ctxOf(s), env, { ids: [PRO], objectiveId: null })
    const p = s.pending
    expect(p?.kind).toBe('moveUnit')
    if (p?.kind !== 'moveUnit') return
    expect(p.player).toBe('A')
    expect(p.context).toMatchObject({ unitId: PRO, moveType: 'normal' })
    expect(p.constraints.maxDistance).toBe(6)
    expect(p.constraints.mustEndOutsideEngagement).toBe(true)
    expect(p.constraints.coherency).toBe(true)
    expect(Object.values(p.constraints.perModel).every((d) => d === 6)).toBe(true)
  })

  // ---------- CUS-019 Stand Vigil through the real wound roll ----------
  describe('Stand Vigil wound re-rolls', () => {
    const spearShot = (marker: 'none' | 'held' | 'enemy', unit: string, weapon: string, dice: number[]) => {
      const s = makeState('shooting', 'A')
      deploy(s)
      const obj = Object.values(s.objectives)[0]
      const m = s.models[s.units[GUARD].models[0]]
      obj.pos = { x: m.pos.x, z: m.pos.z }
      obj.controller = marker === 'held' ? 'A' : marker === 'enemy' ? 'B' : null
      return attack(s, dice, 'ranged', unit, weapon, BOYZ, 1, (p) => (p.kind === 'chooseOption' && p.context.topic === 'rerollOffer' ? 'reroll' : null))
    }
    // spear S4 vs Boyz T5 wounds on 5+
    it('CUS-019 a wound roll of 1 is re-rolled anywhere (the 5 stands and wounds)', () => {
      const r = spearShot('none', GUARD, 'cus.w.guardian-spear-ranged', [4, 1, 5])
      expect(of(r.events, 'WoundRolled')[0]).toMatchObject({ die: 5, wounded: true })
      expect(r.offers).toHaveLength(0)
    })

    it('CUS-019 on a marker the player controls a failed 4 is re-rolled too (the 6 stands); a passing 5 is only offered a re-roll', () => {
      const r = spearShot('held', GUARD, 'cus.w.guardian-spear-ranged', [4, 4, 6])
      expect(r.offers).toHaveLength(0)
      expect(of(r.events, 'WoundRolled')[0]).toMatchObject({ die: 6, wounded: true })
      const pass = spearShot('held', GUARD, 'cus.w.guardian-spear-ranged', [4, 5, 2])
      expect(pass.offers).toHaveLength(1)
      expect(of(pass.events, 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: false })
    })

    it('CUS-019 on an uncontrolled or enemy-held marker only 1s are re-rolled: the failed 4 stands', () => {
      for (const m of ['none', 'enemy'] as const) {
        const r = spearShot(m, GUARD, 'cus.w.guardian-spear-ranged', [4, 4, 6])
        expect(r.offers).toHaveLength(0)
        expect(of(r.events, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: false })
      }
    })

    it("CUS-019 the attached Shield-Captain's own attacks benefit too (1 re-rolled; held marker offers the re-roll)", () => {
      const one = spearShot('none', CAP, 'cus.w.sentinel-blade-ranged', [4, 1, 5])
      expect(of(one.events, 'WoundRolled')[0]).toMatchObject({ die: 5, wounded: true })
      const held = spearShot('held', CAP, 'cus.w.sentinel-blade-ranged', [4, 4, 6])
      expect(held.offers).toHaveLength(0)
      expect(of(held.events, 'WoundRolled')[0]).toMatchObject({ die: 6, wounded: true })
    })

    it('CUS-019 a unit without Stand Vigil (Prosecutors) re-rolls nothing', () => {
      const s = makeState('shooting', 'A')
      deploy(s)
      const r = attack(s, [3, 1, 6], 'ranged', PRO, 'cus.w.boltgun', BOYZ)
      expect(of(r.events, 'WoundRolled')[0]).toMatchObject({ die: 1, wounded: false })
    })
  })

  // ---------- CUS-021 Deft Parry ----------
  it('CUS-021 Deft Parry: melee attacks against Vigilators take -1 to hit (capped at -1 with another -1); ranged attacks are unchanged', () => {
    const hitFinal = (kind: 'melee' | 'ranged', extraMinus: boolean) => {
      const s = makeState('fight', 'B')
      deploy(s)
      if (extraMinus) effectService.grant(ctxOf(s), BOYZ, { modifyRoll: { roll: 'hit', value: -1 } } as never, { sourceAbilityId: 'test', sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
      const weapon = kind === 'melee' ? 'ork.w.choppa' : 'ork.w.shoota'
      const r = attack(s, [4], kind, BOYZ, weapon, VIG)
      return of(r.events, 'HitRolled')[0]
    }
    expect(hitFinal('melee', false)).toMatchObject({ die: 4, final: 3 })
    expect(hitFinal('melee', true)).toMatchObject({ die: 4, final: 3 })
    expect(hitFinal('ranged', false)).toMatchObject({ die: 4, final: 4 })
  })

  // ---------- CUS-022 weapon rules ----------
  describe('weapon abilities in play', () => {
    it('CUS-022 executioner greatblade: Anti-PSYKER 4+ makes a wound roll of 4 critical (Devastating Wounds -> mortal, no save) against a PSYKER only', () => {
      const run = (psyker: boolean) => {
        const s = makeState('fight', 'A')
        deploy(s)
        if (psyker) { const ds = s.units[BOYZ].datasheetId; s.datasheets = { ...s.datasheets, [ds]: { ...s.datasheets[ds], keywords: [...s.datasheets[ds].keywords, 'PSYKER'] } } }
        return attack(s, [4, 4, 5], 'melee', VIG, 'cus.w.executioner-greatblade', BOYZ).events
      }
      const vs = run(true)
      expect(of(vs, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: true })
      expect(of(vs, 'SaveRolled')).toHaveLength(0)
      expect(of(vs, 'DamageApplied').some((d) => d.mortal)).toBe(true)
      const plain = run(false)
      expect(of(plain, 'WoundRolled')[0]).toMatchObject({ die: 4, wounded: true, critical: false })
      expect(of(plain, 'SaveRolled').length).toBeGreaterThan(0)
    })

    it('CUS-022 interceptor lance: +1 to wound only on the turn it charged (S7 vs T5 wants 3+, a 2 wounds when charged)', () => {
      const run = (charged: boolean) => {
        const s = makeState('fight', 'A', { unitChoices: { escort: 'praetors' }, attachments: [] })
        placeUnit(s, 'A:praetors', [[0, 0]])
        placeUnit(s, BOYZ, { x: 0, z: 3, gap: 0.3 })
        s.units['A:praetors'].turn.chargedThisTurn = charged
        return attack(s, [4, 2, 5], 'melee', 'A:praetors', 'cus.w.interceptor-lance', BOYZ).events
      }
      expect(of(run(true), 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: true })
      expect(of(run(false), 'WoundRolled')[0]).toMatchObject({ die: 2, wounded: false })
    })

    it('CUS-022 Vertus hurricane bolter: Rapid Fire 3 (6 attacks inside half range, 3 outside) and Twin-linked', () => {
      const shots = (z: number) => {
        const s = makeState('shooting', 'A', { unitChoices: { escort: 'praetors' }, attachments: [] })
        placeUnit(s, 'A:praetors', [[0, 0]])
        placeUnit(s, BOYZ, { x: 0, z, gap: 0.3 })
        const mid = s.units['A:praetors'].models[0]
        const ab = weaponService.effectiveWeapon(s, mid, 'cus.w.vertus-hurricane-bolter').abilities
        expect(ab).toContainEqual({ ability: 'RAPID_FIRE', value: 3 })
        expect(ab.map((a) => a.ability)).toContain('TWIN_LINKED')
        return of(attack(s, [], 'ranged', 'A:praetors', 'cus.w.vertus-hurricane-bolter', BOYZ, null).events, 'HitRolled').length
      }
      expect(shots(5)).toBe(6)
      expect(shots(14)).toBe(3)
    })

    it('CUS-022 sentinel blade (ranged) is a Pistol and an Assault weapon, so it is usable in Engagement Range', () => {
      const s = makeState('shooting', 'A')
      deploy(s)
      const ab = weaponService.effectiveWeapon(s, modelWith(s, CAP, 'cus.w.sentinel-blade-ranged'), 'cus.w.sentinel-blade-ranged').abilities.map((a) => a.ability)
      expect(ab).toContain('PISTOL')
      expect(ab).toContain('ASSAULT')
    })
  })

  // ---------- AI policies for the Custodes rules (not engine rules: no checklist id) ----------
  describe('bot policies', () => {
    const decide = async (s: GameState, pending: PendingDecision) => {
      s.pending = pending
      const legal = (pending as { options: { action: Action }[] }).options.map((o) => ({ ...o.action, decisionId: pending.id }) as Action)
      return createUtilityDecider('normal', 'cus-ai').decide(engineView(s, pending.player), pending, legal)
    }
    const choose = (player: 'A' | 'B', topic: string, data: Record<string, unknown>, ids: string[], unitId: string | null = null): PendingDecision => ({
      id: 'd:ai', kind: 'chooseOption', player, window: 'fight.start', canPass: false,
      context: { topic, unitId, abilityId: null, data },
      options: ids.map((id) => ({ id, label: id, action: { type: 'chooseOption', player, decisionId: 'd:ai', optionId: id } })),
    }) as unknown as PendingDecision

    it('an Advance re-roll offer is taken on a 1-3 and declined on a 4-6', async () => {
      for (const [die, want] of [[2, 'reroll'], [3, 'reroll'], [5, 'keep'], [6, 'keep']] as const) {
        const s = makeState('movement', 'A')
        deploy(s)
        s.phaseState.lastRoll = { id: 'r:adv', purpose: 'advance', sides: 6, dice: [die], rerolled: null, modifiers: [], final: [die], player: 'A', unitId: GUARD, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: false } as never
        const a = await decide(s, choose('A', 'rerollOffer', { rollId: 'r:adv', dieIndexes: [0], purpose: 'advance' }, ['reroll', 'keep'], GUARD))
        expect(a).toMatchObject({ type: 'chooseOption', optionId: want })
      }
    })

    it("Martial Ka'tah: Dacatarai against soft targets, Rendax against tough ones (T7+ or wounding on 5+)", async () => {
      const pick = async (toughness: number) => {
        const s = makeState('fight', 'A')
        deploy(s)
        const dsId = s.units[BOYZ].datasheetId
        s.datasheets = { ...s.datasheets, [dsId]: { ...s.datasheets[dsId], models: s.datasheets[dsId].models.map((m) => ({ ...m, stats: { ...m.stats, T: toughness } })) } }
        placeUnit(s, BOYZ, { x: -12, z: -3.5, gap: 0.3 }) // right next to the Guard
        const a = await decide(s, choose('A', 'abilityChoice', { window: 'fight.start', key: 'start', code: 'martialKatahPick' }, ['dacatarai', 'rendax'], GUARD))
        return (a as { optionId: string }).optionId
      }
      expect(await pick(5)).toBe('dacatarai') // S7 vs T5 wounds on 3+
      expect(await pick(7)).toBe('rendax')
      expect(await pick(14)).toBe('rendax')
    })

    it('the bot spends CP on Inescapable Vengeance for a unit on a contested marker, and holds for a unit far from any', () => {
      const score = (near: boolean) => {
        const s = makeState('command', 'A')
        deploy(s)
        s.players.A.cp = 4
        const obj = Object.values(s.objectives)[0]
        const gm = s.models[s.units[GUARD].models[0]]
        obj.pos = near ? { x: gm.pos.x, z: gm.pos.z } : { x: gm.pos.x + 30, z: gm.pos.z }
        placeUnit(s, BOYZ, { x: obj.pos.x, z: obj.pos.z + 6, gap: 0.3 })
        const pending = { id: 'd', player: 'A', window: 'command.start', canPass: true, kind: 'stratagemWindow', context: { trigger: {}, usable: [] }, options: [] } as unknown as PendingDecision
        return stratagemScore(s, 'A', pending, { type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: 'cus.s.inescapable-vengeance', targets: { unitIds: [GUARD] } } as UseStratagemAction, 2)
      }
      expect(score(true)).toBeGreaterThan(HOLD_CP_SCORE)
      expect(score(false)).toBe(-Infinity)
    })

    it('the bot uses The Gilded Spear when its gunners can reach the killer, and Overawing Magnificence when the freed unit can reach a marker', () => {
      const s = makeState('shooting', 'B')
      deploy(s)
      s.players.A.cp = 4
      s.phaseState.marks.push(`deathReaction:${JSON.stringify({ modelId: modelIdFor(CAP, 0), unitId: CAP, player: 'A', attackerUnitId: BOYZ })}`)
      const window = { id: 'd', player: 'A', window: 'attack.modelDestroyed', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: CAP }, usable: [] }, options: [] } as unknown as PendingDecision
      const spear = { type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: 'cus.s.gilded-spear', targets: { unitIds: [CAP] } } as UseStratagemAction
      expect(stratagemScore(s, 'A', window, spear, 1)).toBeGreaterThan(HOLD_CP_SCORE)

      const m = makeState('movement', 'B')
      deploy(m)
      m.players.A.cp = 4
      const obj = Object.values(m.objectives)[0]
      const pm = m.models[m.units[PRO].models[0]]
      obj.pos = { x: pm.pos.x + 4, z: pm.pos.z }
      const mwin = { id: 'd', player: 'A', window: 'movement.unitMoved', canPass: true, kind: 'stratagemWindow', context: { trigger: { unitId: BOYZ }, usable: [] }, options: [] } as unknown as PendingDecision
      const over = { type: 'useStratagem', player: 'A', decisionId: 'd', stratagemId: 'cus.s.overawing-magnificence', targets: { unitIds: [PRO] } } as UseStratagemAction
      expect(stratagemScore(m, 'A', mwin, over, 1)).toBeGreaterThan(HOLD_CP_SCORE)
      obj.pos = { x: pm.pos.x + 40, z: pm.pos.z }
      expect(stratagemScore(m, 'A', mwin, over, 1)).toBeLessThan(HOLD_CP_SCORE)
    })
  })
})
