// Hook dispatch (20-data §3, hooks.ts): evaluates every active AbilityDescriptor / stratagem effect / code hook at a
// hook point and applies EffectRequests. Owner: W1-F. Modules never iterate abilities themselves — they call
// services.hooks.collect (for modifiers) or services.hooks.run (for side effects) and pass the hook-specific data.
//
// Sources (per unit record, destroyed units excluded):
//   datasheet abilities (default scope self) · leader effects while the leader is attached (scope self) ·
//   enhancement abilities whose bearerModelId is in the unit (default scope bearer) · ActiveEffects on the unit.
// Scope is evaluated against the "party" of each effect key: attacker-side keys (hit/wound/damage rolls, re-rolls,
// lethalOn, ignoreCover, extraAttacks, weapon stats) look at the attacking model, defender-side keys (invuln, FNP,
// damage reduction/halving, stealth, save modifiers) at the target model; `scope.who: attacker` flips the side (the
// holder is attacked, the attacker's roll is modified — Gene-wrought Resilience), `target` flips it the other way.
// Non-attack hooks use their subject unit (charging unit, testing unit, queried model …); phase hooks the holder.
// The same source (ability id / stratagem id) contributes each effect key at most once per evaluation (R-10.11).
import type { Condition, DiceExpr, Effect, Scope, StatName, TimingWindowId, Trigger, WeaponAbility } from '../data/types'
import { codeHooks, type EngineCodeHook } from './code-hooks'
import { clampStat, parseDiceExpr, rollSum } from './dice'
import { withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from './geometry'
import {
  TRIGGER_HOOK,
  type AttackContext, type EffectRequest, type EffectSource, type HookContext, type HookContextBase, type HookContextFor, type HookName,
  type HookRegistry, type HookResult, type HookResultFor, type RollContext,
} from './hooks'
import { leaderService } from './leaders'
import type { DecisionHandler, EngineContext, WindowTrigger } from './modules'
import { keywordsOf, modelStats, unitModels } from './state'
import type { ActiveEffect, GameState, ModelId, PlayerId, RuntimeAbility, RuntimeWeapon, Unit, UnitId } from './types'

// the hook-specific part of a HookContext; the service fills in state/phase/activePlayer/source/unitId/hook per descriptor.
// hooks.ts HookContextFor<K> is `never` for contexts shared by several hooks (AttackRollHookContext, …) because Extract
// needs the whole `hook` union to match; this distributive form picks the member whose `hook` includes K.
type ContextOf<K extends HookName> = HookContext extends infer C ? (C extends { hook: infer H } ? (K extends H ? C : never) : never) : never
export type HookData<K extends HookName> = Omit<ContextOf<K>, keyof HookContextBase | 'hook'>

export interface StatQuery { unitId: UnitId; modelId: ModelId | null; weapon: RuntimeWeapon | null; stat: StatName }

export interface HookService {
  // bespoke `code` hooks by name (20-data §12 validates data against these keys)
  readonly registry: HookRegistry
  // evaluate all sources for a hook; returns their results without applying side effects (roll/stat/eligibility hooks)
  collect<K extends HookName>(ctx: EngineContext, hook: K, data: HookData<K>): { source: EffectSource; result: HookResultFor<K> }[]
  // collect and apply every EffectRequest (phase/turn/destroyed hooks); may raise decisions (topic 'abilityChoice')
  run<K extends HookName>(ctx: EngineContext, hook: K, data: HookData<K>): void
  // apply one EffectRequest (mortal wounds via services.attack, cp/vp via players, grantEffect via services.effects, …)
  apply(ctx: EngineContext, source: EffectSource, request: EffectRequest): void
  // called once per timing-window occurrence by ctx.window (before stratagem windows): window-keyed code abilities
  // such as Oath of Moment's pick (`params.pickWindow`), Waaagh! at round.start
  onWindow(ctx: EngineContext, window: TimingWindowId, key: string, trigger?: WindowTrigger): void
  // answers chooseOption topics oathTarget / waaagh / abilityChoice
  readonly handler: DecisionHandler
}

// additions (W1-F); optional on HookService so existing stubs stay valid, always present on `hookService`
export interface HookQueries {
  // R-1.9-clamped characteristic after modifyStat/setStat effects (weapon stats need `weapon`, model stats `modelId`)
  statFor(state: GameState, query: StatQuery, base: number): number
  // the weapon's own abilities plus grantWeaponAbility effects for this model (Champion Duellist, Veil of Time, Epic Challenge)
  weaponAbilitiesFor(state: GameState, modelId: ModelId, weapon: RuntimeWeapon): WeaponAbility[]
  // datasheet + faction keywords plus grantKeyword effects
  keywordsFor(state: GameState, unitId: UnitId): string[]
  // onEligibility folded: true when some effect allows the check (charge after Advance/Fall Back, shoot after …, Fights First)
  eligibilityFor(state: GameState, unitId: UnitId, check: HookContextFor<'onEligibility'>['check']): boolean
  // Get Stuck In (getStuckInDistance) — pile-in / consolidation allowance for the unit this phase
  pileInDistance(state: GameState, unitId: UnitId, base?: number): number
  consolidateDistance(state: GameState, unitId: UnitId, base?: number): number
  // Go to Ground / Smokescreen (grantBenefitOfCover) active on the unit (R-3.14)
  hasBenefitOfCover(state: GameState, unitId: UnitId): boolean
  // attacks by this unit's player against the Oath of Moment target (either half of an attached unit)
  isOathTarget(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): boolean
  // R-4.7 forced Battle-shock test (Piston-driven Brutality, Bestial Bellow): 2D6 + modifiers ≥ best Ld; returns passed
  battleShockTest(ctx: EngineContext, unitId: UnitId, source: string, modifier?: number): boolean
  // R-4.2: non-automatic CP gain, capped at +1 per player per battle round; negative amounts spend (floor 0)
  gainCp(ctx: EngineContext, player: PlayerId, amount: number, source: string): number
  // raise the next window-keyed pick (Oath / Waaagh!) for this occurrence if one is due; true when a decision is pending
  offerPicks(ctx: EngineContext, window: TimingWindowId, key: string): boolean
}
export interface HookService extends Partial<HookQueries> {}

// ---------- sources ----------
export interface HookSourceEntry {
  source: EffectSource
  holderUnitId: UnitId
  bearerModelId: ModelId | null
  // descriptor trigger (null for stratagem-granted ActiveEffects)
  trigger: Trigger | null
  when: Condition | null
  effects: Effect[]
  scope: Scope
  code: string | null
  params: Record<string, unknown>
  ability: RuntimeAbility | null
  active: ActiveEffect | null
}

const asList = (e: Effect | Effect[] | undefined): Effect[] => (e === undefined ? [] : Array.isArray(e) ? e : [e])

export function codeHookFor(name: string | null | undefined): EngineCodeHook | null {
  return name ? (codeHooks[name] ?? null) : null
}

export function sourcesFor(state: GameState): HookSourceEntry[] {
  const out: HookSourceEntry[] = []
  const enhancements = Object.values(state.abilities).filter((a) => a.source === 'enhancement' && a.bearerModelId !== null)
  for (const unit of Object.values(state.units)) {
    // R-10.1 / R-1.7: a destroyed half of an attached unit still carries its active effects for the surviving half
    // until detach copies them over (e.g. the last bodyguard dies mid-attack-sequence)
    const gone = unit.location === 'destroyed'
    const partner = gone ? leaderService.partnerOf(state, unit.id) : null
    if (gone && (!partner || state.units[partner]?.location === 'destroyed')) continue
    const ds = state.datasheets[unit.datasheetId]
    if (!ds) continue
    const fromAbility = (a: RuntimeAbility | undefined, kind: EffectSource['kind'], bearer: ModelId | null, defaultWho: Scope['who']) => {
      if (!a) return
      out.push({
        source: { kind, id: a.id, unitId: unit.id, modelId: bearer },
        holderUnitId: unit.id, bearerModelId: bearer, trigger: a.trigger, when: a.when ?? null, effects: asList(a.effect),
        scope: a.scope ?? { who: defaultWho }, code: a.code ?? null, params: a.params ?? {}, ability: a, active: null,
      })
    }
    if (!gone) {
      for (const id of ds.abilities) fromAbility(state.abilities[id], 'ability', null, 'self')
      if (unit.bodyguardUnitId && ds.leader) for (const id of ds.leader.effects) fromAbility(state.abilities[id], 'ability', null, 'self')
      for (const a of enhancements) if (unit.models.includes(a.bearerModelId as ModelId)) fromAbility(a, 'enhancement', a.bearerModelId, 'bearer')
    }
    for (const e of unit.effects) {
      const strat = state.stratagems[e.sourceAbilityId]
      const ab = state.abilities[e.sourceAbilityId]
      out.push({
        source: { kind: strat ? 'stratagem' : ab?.source === 'enhancement' ? 'enhancement' : 'ability', id: e.sourceAbilityId, unitId: unit.id, modelId: null },
        holderUnitId: unit.id, bearerModelId: null, trigger: strat ? null : (ab?.trigger ?? null), when: e.when ?? null,
        effects: asList(e.effect), scope: e.scope, code: strat?.code ?? ab?.code ?? null, params: strat?.params ?? ab?.params ?? {},
        ability: null, active: e,
      })
    }
  }
  return out
}

// ---------- conditions ----------
export interface ConditionEnv {
  state: GameState
  holder: Unit | null
  // owner of the holder (or the stratagem user for use-time conditions)
  player: PlayerId
  attack: AttackContext | null
  roll: RollContext | null
  weapon: RuntimeWeapon | null
}

function unitKeywordsAny(state: GameState, unitId: UnitId): string[] {
  const out = new Set<string>()
  for (const id of leaderService.halves(state, unitId)) for (const k of hookService.keywordsFor(state, id)) out.add(k)
  return [...out]
}

function unitOnObjective(state: GameState, unitId: UnitId): boolean {
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const models = leaderService.halves(state, unitId).flatMap((id) => state.units[id].location === 'board' ? unitModels(state, id) : [])
  return Object.values(state.objectives).some((o) => !o.removed && models.some((m) => withinObjectiveRange(m, o, 0, range, radius)))
}

function bound(v: number, b: { gte?: number; lte?: number }): boolean {
  return (b.gte === undefined || v >= b.gte) && (b.lte === undefined || v <= b.lte)
}

export function evaluateCondition(env: ConditionEnv, c: Condition | null | undefined): boolean {
  if (!c) return true
  const { state, holder, attack } = env
  const weapon = env.weapon ?? attack?.weapon ?? null
  if (c.phase !== undefined && c.phase !== 'any' && c.phase !== state.phase) return false
  if (c.ownTurn !== undefined && (state.activePlayer === env.player) !== c.ownTurn) return false
  if (c.attackerKeyword !== undefined && !(attack && unitKeywordsAny(state, attack.attackerUnitId).includes(c.attackerKeyword))) return false
  if (c.attackerNotKeyword !== undefined && !(attack && !unitKeywordsAny(state, attack.attackerUnitId).includes(c.attackerNotKeyword))) return false
  if (c.targetKeyword !== undefined) {
    const wanted = Array.isArray(c.targetKeyword) ? c.targetKeyword : [c.targetKeyword]
    if (!attack) return false
    const kws = unitKeywordsAny(state, attack.targetUnitId)
    if (!wanted.some((k) => kws.includes(k))) return false
  }
  if (c.targetNotKeyword !== undefined && !(attack && !unitKeywordsAny(state, attack.targetUnitId).includes(c.targetNotKeyword))) return false
  if (c.weaponType !== undefined && weapon?.kind !== c.weaponType) return false
  // [interp] weaponAbility tests the weapon's own abilities (granted abilities are derived from conditions themselves)
  if (c.weaponAbility !== undefined && !(weapon && weapon.abilities.some((a) => a.ability === c.weaponAbility))) return false
  if (c.weaponId !== undefined && weapon?.id !== c.weaponId) return false
  if (c.range !== undefined) {
    if (!attack) return false
    if (c.range === 'half' ? !attack.halfRange : attack.range > c.range.within + 1e-6) return false
  }
  if (c.targetInCover !== undefined && !(attack && attack.inCover === c.targetInCover)) return false
  if (c.targetOnObjective !== undefined && !(attack && unitOnObjective(state, attack.targetUnitId) === c.targetOnObjective)) return false
  const h = holder
  if (c.unitOnObjective !== undefined && !(h && unitOnObjective(state, h.id) === c.unitOnObjective)) return false
  if (c.unitBelowHalf !== undefined && !(h && leaderService.isBelowHalfStrength(state, h.id) === c.unitBelowHalf)) return false
  if (c.unitStationary !== undefined && !(h && (h.turn.moveType === 'stationary') === c.unitStationary)) return false
  if (c.unitAdvanced !== undefined && !(h && (h.turn.moveType === 'advance') === c.unitAdvanced)) return false
  if (c.unitFellBack !== undefined && !(h && (h.turn.moveType === 'fallBack') === c.unitFellBack)) return false
  if (c.unitCharged !== undefined && !(h && h.turn.chargedThisTurn === c.unitCharged)) return false
  if (c.unitBattleShocked !== undefined && !(h && h.battleShocked === c.unitBattleShocked)) return false
  if (c.leaderAttached !== undefined && !(h && leaderService.isAttached(state, h.id) === c.leaderAttached)) return false
  // [interp] roll bounds compare the unmodified die (modifiers are folded by the caller after collection)
  if (c.roll !== undefined && !(env.roll && bound(env.roll.unmodified, c.roll))) return false
  if (c.round !== undefined && !bound(state.round, c.round)) return false
  if (c.oathTarget !== undefined) {
    if (!attack) return false
    const marked = attack.oathTarget || hookService.isOathTarget(state, attack.attackerUnitId, attack.targetUnitId)
    if (marked !== c.oathTarget) return false
  }
  if (c.strengthVsToughness !== undefined) {
    if (!attack) return false
    // R-1.9: compare the attack's *modified* S (stat modifiers e.g. Waaagh!) against the target bodyguard's
    // (possibly modified) T (R-10.1: attacks against an attached unit use the bodyguard's T), not the raw datasheet values.
    const S = hookService.statFor(state, { unitId: attack.attackerUnitId, modelId: attack.attackerModelId, weapon: attack.weapon, stat: 'S' }, attack.weapon.S)
    const targetUnit = state.units[attack.targetUnitId]
    const bodyguardId = targetUnit?.bodyguardUnitId ?? attack.targetUnitId
    const bodyguard = state.units[bodyguardId]
    const tModelId = attack.targetModelId && bodyguard?.models.includes(attack.targetModelId) ? attack.targetModelId : bodyguard?.models[0] ?? null
    const T = hookService.statFor(state, { unitId: bodyguardId, modelId: tModelId, weapon: null, stat: 'T' }, leaderService.toughnessFor(state, attack.targetUnitId))
    const ok = { gt: S > T, gte: S >= T, eq: S === T, lte: S <= T, lt: S < T, double: S >= 2 * T, half: S * 2 <= T }[c.strengthVsToughness]
    if (!ok) return false
  }
  if (c.any !== undefined && !c.any.some((x) => evaluateCondition(env, x))) return false
  if (c.not !== undefined && evaluateCondition(env, c.not)) return false
  return true
}

// ---------- effect key → hook mapping and sides ----------
const ROLL_HOOK: Record<string, HookName> = {
  hit: 'onHitRoll', wound: 'onWoundRoll', save: 'onSaveRoll', damage: 'onDamageRoll', charge: 'onChargeRoll',
  advance: 'onAdvanceRoll', battleShock: 'onBattleShockTest', feelNoPain: 'onFeelNoPainRoll',
}
const DEFENDER_KEYS = new Set<keyof Effect>(['invuln', 'feelNoPain', 'damageReduction', 'halveDamage', 'stealth'])
const ELIGIBILITY_KEYS = ['fightsFirst', 'fightsLast', 'shootAfterAdvance', 'shootAfterFallBack', 'chargeAfterAdvance', 'chargeAfterFallBack'] as const

function triggerHook(entry: HookSourceEntry): HookName | null { return entry.trigger ? TRIGGER_HOOK[entry.trigger] : null }

function keyApplies(entry: HookSourceEntry, key: keyof Effect, effect: Effect, hook: HookName): boolean {
  const spec = codeHookFor(entry.code)
  if (spec?.hooks && !spec.hooks.includes(hook)) return false
  switch (key) {
    case 'when': return false
    case 'reroll': return triggerHook(entry) === hook || (entry.trigger === null && !!spec?.hooks)
    case 'modifyRoll': return ROLL_HOOK[effect.modifyRoll!.roll] === hook
    case 'autoResult': return ROLL_HOOK[effect.autoResult!.roll] === hook
    case 'ignoreModifiers': return effect.ignoreModifiers === 'all' ? hook === 'onHitRoll' || hook === 'onWoundRoll' : ROLL_HOOK[effect.ignoreModifiers!] === hook
    case 'invuln': case 'ignoreCover': return hook === 'onSaveRoll'
    case 'feelNoPain': return hook === 'onFeelNoPainRoll'
    case 'lethalOn': case 'stealth': return hook === 'onHitRoll'
    case 'mortalWounds': return triggerHook(entry) === hook && (hook === 'onHitRoll' || hook === 'onWoundRoll' || hook === 'onDamage')
    case 'damageReduction': case 'halveDamage': return hook === 'onDamage'
    case 'extraAttacks': return hook === 'onAttackCount'
    case 'cp': case 'vp': return triggerHook(entry) === hook
    case 'move': return hook === 'onMove' && triggerHook(entry) === hook
    case 'modifyStat': case 'setStat': case 'grantWeaponAbility': case 'grantKeyword': return hook === 'onStatQuery'
    default: return (ELIGIBILITY_KEYS as readonly string[]).includes(key) && hook === 'onEligibility'
  }
}

function naturalSide(key: keyof Effect, effect: Effect, hook: HookName): 'attacker' | 'defender' {
  if (DEFENDER_KEYS.has(key)) return 'defender'
  if (key === 'modifyRoll' && (effect.modifyRoll!.roll === 'save' || effect.modifyRoll!.roll === 'feelNoPain')) return 'defender'
  if (key === 'autoResult' && (effect.autoResult!.roll === 'save' || effect.autoResult!.roll === 'feelNoPain')) return 'defender'
  if (key === 'reroll' && (hook === 'onSaveRoll' || hook === 'onFeelNoPainRoll')) return 'defender'
  return 'attacker'
}

type Data = Record<string, unknown> & { attack?: AttackContext | null; roll?: RollContext | null; weapon?: RuntimeWeapon | null }
interface Party { unitId: UnitId | null; modelId: ModelId | null }

function subjectFor(hook: HookName, d: Data): Party | null {
  const u = (k: string) => (d[k] as UnitId | undefined) ?? null
  switch (hook) {
    case 'onChargeRoll': case 'onCharge': return { unitId: u('chargingUnitId'), modelId: null }
    case 'onAdvanceRoll': case 'onMove': return { unitId: u('movingUnitId'), modelId: null }
    case 'onBattleShockTest': return { unitId: u('testUnitId'), modelId: null }
    case 'onUnitSelectedToShoot': case 'onUnitSelectedToFight': return { unitId: u('selectedUnitId'), modelId: null }
    case 'onTargetsDeclared': return { unitId: u('attackerUnitId'), modelId: null }
    case 'onModelDestroyed': case 'onUnitDestroyed': return { unitId: u('destroyedUnitId'), modelId: (d.destroyedModelId as ModelId | null) ?? null }
    case 'onDeployment': case 'onReinforcements': return { unitId: u('deployingUnitId'), modelId: null }
    case 'onStatQuery': return { unitId: u('queryUnitId'), modelId: (d.queryModelId as ModelId | null) ?? null }
    case 'onEligibility': return { unitId: u('queryUnitId'), modelId: null }
    default: return null
  }
}

function partyFor(entry: HookSourceEntry, key: keyof Effect, effect: Effect, hook: HookName, d: Data): Party | 'holder' | null {
  const attack = d.attack ?? null
  if (attack || hook === 'onDamage') {
    let side = naturalSide(key, effect, hook)
    if (entry.scope.who === 'attacker') side = 'defender'
    else if (entry.scope.who === 'target') side = 'attacker'
    if (side === 'attacker') return attack ? { unitId: attack.attackerUnitId, modelId: attack.attackerModelId } : null
    return { unitId: attack?.targetUnitId ?? (d.targetUnitId as UnitId | undefined) ?? null, modelId: attack?.targetModelId ?? (d.targetModelId as ModelId | undefined) ?? null }
  }
  return subjectFor(hook, d) ?? 'holder'
}

function scopeMatches(state: GameState, entry: HookSourceEntry, party: Party | 'holder' | null): boolean {
  if (party === 'holder') return true
  if (!party || !party.unitId) return false
  const holder = state.units[entry.holderUnitId]
  const who = entry.scope.who
  if (entry.scope.keyword && !unitKeywordsAny(state, party.unitId).includes(entry.scope.keyword)) return false
  switch (who) {
    case 'self': case 'attacker': case 'target':
      return leaderService.sameUnit(state, party.unitId, holder.id)
    case 'bearer':
      if (entry.bearerModelId) return party.modelId === entry.bearerModelId
      return party.modelId ? holder.models.includes(party.modelId) : party.unitId === holder.id
    case 'friendly': case 'enemy': {
      const other = state.units[party.unitId]
      if (!other || (who === 'friendly') !== (other.player === holder.player)) return false
      if (leaderService.sameUnit(state, other.id, holder.id)) return who === 'friendly'
      const within = entry.scope.within
      return within === undefined || leaderService.unitDistance(state, other.id, holder.id) <= within + 1e-6
    }
  }
}

// what "the same key" means for the first-match rule: a stat / roll / granted ability is its own key
function keyIdentity(key: keyof Effect, e: Effect): string {
  switch (key) {
    case 'modifyStat': return `${key}:${e.modifyStat!.stat}`
    case 'setStat': return `${key}:${e.setStat!.stat}`
    case 'modifyRoll': return `${key}:${e.modifyRoll!.roll}`
    case 'autoResult': return `${key}:${e.autoResult!.roll}`
    case 'grantWeaponAbility': return `${key}:${JSON.stringify(e.grantWeaponAbility)}`
    case 'grantKeyword': return `${key}:${e.grantKeyword}`
    default: return key
  }
}

export interface EffectMatch { entry: HookSourceEntry; effect: Effect; key: keyof Effect; index: number }

function gateOpen(state: GameState, entry: HookSourceEntry): boolean {
  if (entry.active) return true
  const spec = codeHookFor(entry.code)
  return !spec?.gate || spec.gate(state, state.units[entry.holderUnitId], entry)
}

// every (source, effect entry, key) that applies at `hook` for this data; keys restricts the search
export function matchEffects(state: GameState, hook: HookName, data: Data, keys?: ReadonlySet<keyof Effect>): EffectMatch[] {
  const out: EffectMatch[] = []
  const seen = new Set<string>()
  for (const entry of sourcesFor(state)) {
    if (entry.effects.length === 0 || !gateOpen(state, entry)) continue
    const holder = state.units[entry.holderUnitId]
    const env: ConditionEnv = { state, holder, player: holder.player, attack: data.attack ?? null, roll: data.roll ?? null, weapon: data.weapon ?? null }
    if (!evaluateCondition(env, entry.when)) continue
    const usedKeys = new Set<string>()
    entry.effects.forEach((effect, index) => {
      for (const key of Object.keys(effect) as (keyof Effect)[]) {
        if (key === 'when' || (keys && !keys.has(key))) continue
        const identity = keyIdentity(key, effect)
        if (usedKeys.has(identity)) continue
        if (!keyApplies(entry, key, effect, hook)) continue
        if (!scopeMatches(state, entry, partyFor(entry, key, effect, hook, data))) continue
        if (!evaluateCondition(env, effect.when)) continue
        // first matching entry wins for the same key (Veteran Instincts); one contribution per source (R-10.11)
        const dedupe = `${entry.source.id}|${identity}`
        usedKeys.add(identity)
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        out.push({ entry, effect, key, index })
      }
    })
  }
  return out
}

function diceValue(ctx: EngineContext | null, expr: DiceExpr, player: PlayerId, unitId: UnitId | null): number {
  const p = parseDiceExpr(expr)
  if (p.count === 0 || p.sides === null) return p.flat
  if (!ctx) return p.flat + p.count * (p.sides === 6 ? 3.5 : 2)
  return ctx.rollExpr(expr, { purpose: 'ability', player, unitId }).total
}

function resultFor(ctx: EngineContext | null, state: GameState, hook: HookName, data: Data, m: EffectMatch): HookResult | null {
  const e = m.effect
  const holder = state.units[m.entry.holderUnitId]
  switch (m.key) {
    case 'reroll': return { kind: 'roll', reroll: e.reroll }
    case 'modifyRoll': return { kind: 'roll', modifier: e.modifyRoll!.value }
    case 'autoResult': return e.autoResult!.outcome === 'pass' ? { kind: 'roll', autoPass: true } : { kind: 'roll', autoFail: true }
    case 'ignoreModifiers': return { kind: 'roll', ignoreModifiers: true }
    case 'invuln': return { kind: 'roll', invuln: e.invuln }
    case 'ignoreCover': return { kind: 'roll', ignoreCover: true }
    case 'feelNoPain': return { kind: 'roll', feelNoPain: e.feelNoPain }
    case 'lethalOn': return { kind: 'roll', critThreshold: e.lethalOn }
    case 'stealth': return data.attack?.kind === 'ranged' ? { kind: 'roll', modifier: -1 } : null
    case 'mortalWounds': {
      const mw = e.mortalWounds!
      if (mw.on === 'unmodified6' && data.roll?.unmodified !== 6) return null
      const target = data.attack?.targetUnitId ?? (data.targetUnitId as UnitId | undefined)
      if (!target) return null
      return { kind: 'request', mortalWounds: [{ targetUnitId: target, count: diceValue(ctx, mw.count, holder.player, holder.id) }] }
    }
    case 'damageReduction': return { kind: 'damage', reduction: e.damageReduction }
    case 'halveDamage': return { kind: 'damage', halve: true }
    case 'extraAttacks': return { kind: 'attacks', delta: diceValue(ctx, e.extraAttacks!, holder.player, holder.id) }
    case 'cp': return { kind: 'request', cp: e.cp }
    case 'vp': return { kind: 'request', vp: { amount: e.vp!, source: m.entry.source.id } }
    case 'modifyStat': return e.modifyStat!.stat === data.stat ? { kind: 'stat', delta: e.modifyStat!.value } : null
    case 'setStat': {
      if (e.setStat!.stat !== data.stat) return null
      return { kind: 'stat', set: diceValue(ctx, e.setStat!.value, holder.player, holder.id) }
    }
    case 'grantWeaponAbility': case 'grantKeyword': case 'move': return null
    default: {
      if (hook !== 'onEligibility') return null
      const check = data.check as HookContextFor<'onEligibility'>['check']
      const u = state.units[(data.queryUnitId as UnitId) ?? '']
      const moved = u?.turn.moveType ?? null
      switch (m.key) {
        case 'fightsFirst': return check === 'fightFirst' ? { kind: 'eligibility', allow: true } : null
        case 'fightsLast': return check === 'fightFirst' ? { kind: 'eligibility', deny: true } : null
        case 'shootAfterAdvance': return check === 'shoot' && moved === 'advance' ? { kind: 'eligibility', allow: true } : null
        case 'shootAfterFallBack': return check === 'shoot' && moved === 'fallBack' ? { kind: 'eligibility', allow: true } : null
        case 'chargeAfterAdvance': return check === 'charge' && moved === 'advance' ? { kind: 'eligibility', allow: true } : null
        case 'chargeAfterFallBack': return check === 'charge' && moved === 'fallBack' ? { kind: 'eligibility', allow: true } : null
      }
      return null
    }
  }
}

function summaryOf(request: EffectRequest): string {
  const parts: string[] = []
  if (request.mortalWounds) parts.push(`mortal wounds ${request.mortalWounds.map((m) => `${m.count}→${m.targetUnitId}`).join(', ')}`)
  if (request.cp !== undefined) parts.push(`cp ${request.cp}`)
  if (request.vp) parts.push(`vp ${request.vp.amount}`)
  if (request.battleShockTest) parts.push(`battle-shock test ${request.battleShockTest.join(', ')}`)
  if (request.grantEffect) parts.push(`effect on ${request.grantEffect.unitId}`)
  if (request.log) parts.push(request.log)
  return parts.join('; ')
}

function stratCover(state: GameState, e: ActiveEffect): boolean {
  return state.stratagems[e.sourceAbilityId]?.code === 'grantBenefitOfCover' || state.abilities[e.sourceAbilityId]?.code === 'grantBenefitOfCover'
}

function getStuckIn(state: GameState, unitId: UnitId): { pileIn: number; consolidate: number | null } | null {
  let best: { pileIn: number; consolidate: number | null } | null = null
  for (const id of leaderService.halves(state, unitId)) {
    for (const e of state.units[id].effects) {
      const src = state.stratagems[e.sourceAbilityId] ?? state.abilities[e.sourceAbilityId]
      if (src?.code !== 'getStuckInDistance') continue
      const params = (src.params ?? {}) as { pileIn?: number; consolidate?: number; pileInOnly?: boolean }
      const pileIn = params.pileIn ?? 6
      best = { pileIn, consolidate: params.pileInOnly ? null : (params.consolidate ?? pileIn) }
    }
  }
  return best
}

// R-4.7 expiry: the start of the owner's next Command phase
function shockExpiryRound(state: GameState, owner: PlayerId): number {
  if (owner === state.activePlayer) return state.round + 1
  return state.activePlayer === state.firstPlayer ? state.round : state.round + 1
}

export const hookService: HookService & HookQueries = {
  get registry(): HookRegistry { return codeHooks },

  collect(ctx, hook, data) {
    const d = data as unknown as Data
    const out: { source: EffectSource; result: HookResultFor<typeof hook> }[] = []
    for (const m of matchEffects(ctx.state, hook, d)) {
      const result = resultFor(ctx, ctx.state, hook, d, m)
      if (result) out.push({ source: m.entry.source, result: result as HookResultFor<typeof hook> })
    }
    return out
  },

  run(ctx, hook, data) {
    const s = ctx.state
    const d = data as unknown as Data
    for (const { source, result } of hookService.collect(ctx, hook, data)) {
      if ((result as HookResult).kind === 'request') hookService.apply(ctx, source, result as EffectRequest)
    }
    for (const entry of sourcesFor(s)) {
      const spec = codeHookFor(entry.code)
      if (!spec?.runAt || entry.active || triggerHook(entry) !== hook) continue
      const holder = s.units[entry.holderUnitId]
      if (!holder || holder.location === 'destroyed') continue
      const env: ConditionEnv = { state: s, holder, player: holder.player, attack: d.attack ?? null, roll: d.roll ?? null, weapon: d.weapon ?? null }
      if (!gateOpen(s, entry) || !evaluateCondition(env, entry.when)) continue
      spec.runAt(ctx, entry, d)
    }
  },

  apply(ctx, source, request) {
    const s = ctx.state
    const owner: PlayerId = (source.unitId && s.units[source.unitId]?.player) || s.activePlayer
    if (request.mortalWounds) {
      for (const mw of request.mortalWounds) if (mw.count > 0) ctx.services.attack.queueMortalWounds(ctx, mw.targetUnitId, mw.count, source.id, false)
    }
    if (request.cp !== undefined && request.cp !== 0) hookService.gainCp(ctx, owner, request.cp, source.id)
    if (request.vp && request.vp.amount !== 0) {
      const p = s.players[owner]
      p.vp += request.vp.amount
      p.vpBySource[request.vp.source] = (p.vpBySource[request.vp.source] ?? 0) + request.vp.amount
      ctx.emit({ type: 'VpScored', source: request.vp.source, amount: request.vp.amount, total: p.vp, player: owner })
    }
    if (request.battleShockTest) for (const unitId of request.battleShockTest) hookService.battleShockTest(ctx, unitId, source.id)
    if (request.grantEffect) {
      const g = request.grantEffect
      ctx.services.effects.grant(ctx, g.unitId, g.effect, { sourceAbilityId: source.id, sourceUnitId: source.unitId, scope: { who: 'self' }, duration: g.duration ?? 'untilEndOfPhase' })
    }
    if (request.openDecision && !s.pending) {
      const od = request.openDecision
      ctx.decide({
        kind: 'chooseOption', player: owner, window: 'phase.end', canPass: false,
        context: { topic: 'abilityChoice', unitId: od.unitId, abilityId: source.id, data: { topic: od.topic } },
        options: od.options.map((o) => ({ id: o, label: o, action: { type: 'chooseOption', player: owner, decisionId: '', optionId: o } })),
      })
    }
    const summary = summaryOf(request)
    if (summary) ctx.emit({ type: 'AbilityTriggered', abilityId: source.id, sourceUnitId: source.unitId, targetUnitId: request.mortalWounds?.[0]?.targetUnitId ?? request.grantEffect?.unitId ?? null, summary, player: owner })
  },

  onWindow(ctx, window, key) {
    if (!ctx.state.pending) hookService.offerPicks(ctx, window, key)
  },

  offerPicks(ctx, window, key) {
    if (ctx.state.pending) return true
    for (const spec of Object.values(codeHooks)) {
      if (spec.pick && spec.pick.window === window && spec.pick.offer(ctx, window, key)) return true
    }
    return false
  },

  handler: {
    validate(_state, action, pending) {
      if (pending.kind !== 'chooseOption' || action.type === 'pass') return null
      if (action.type !== 'chooseOption' || !pending.options.some((o) => o.id === action.optionId)) {
        return { code: 'E_NOT_AN_OPTION', reason: 'answer is not one of the offered options' }
      }
      return null
    },
    handle(ctx, action, pending) {
      if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'hooks: chooseOption expected' }
      const topic = pending.context.topic
      const spec = Object.values(codeHooks).find((h) => h.pick?.topic === topic)
      let rej: ReturnType<DecisionHandler['handle']> = undefined
      if (spec?.pick) rej = spec.pick.handle(ctx, action, pending)
      else if (action.type === 'chooseOption') {
        ctx.emit({ type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? 'ability', sourceUnitId: pending.context.unitId, targetUnitId: null, summary: `chose ${action.optionId}`, player: pending.player })
      }
      if (rej) return rej
      const w = pending.context.data.window as TimingWindowId | undefined
      const k = pending.context.data.key as string | undefined
      if (w && k !== undefined) hookService.offerPicks(ctx, w, k)
    },
  },

  statFor(state, q, base) {
    const data: Data = { queryUnitId: q.unitId, queryModelId: q.modelId, weapon: q.weapon, stat: q.stat }
    let set: number | null = null
    let delta = 0
    for (const m of matchEffects(state, 'onStatQuery', data, new Set<keyof Effect>(['modifyStat', 'setStat']))) {
      const r = resultFor(null, state, 'onStatQuery', data, m)
      if (!r || r.kind !== 'stat') continue
      if (r.set !== undefined) set = r.set
      if (r.delta !== undefined) delta += r.delta
    }
    return clampStat(q.stat, (set ?? base) + delta)
  },

  weaponAbilitiesFor(state, modelId, weapon) {
    const model = state.models[modelId]
    const out: WeaponAbility[] = [...weapon.abilities]
    if (!model) return out
    const data: Data = { queryUnitId: model.unitId, queryModelId: modelId, weapon, stat: 'A' }
    for (const m of matchEffects(state, 'onStatQuery', data, new Set<keyof Effect>(['grantWeaponAbility']))) {
      const g = m.effect.grantWeaponAbility!
      if (!out.some((a) => a.ability === g.ability && a.keyword === g.keyword && String(a.value ?? '') === String(g.value ?? ''))) out.push({ ...g })
    }
    return out
  },

  keywordsFor(state, unitId) {
    const base = keywordsOf(state, unitId)
    const data: Data = { queryUnitId: unitId, queryModelId: null, weapon: null, stat: 'OC' }
    const extra = matchEffects(state, 'onStatQuery', data, new Set<keyof Effect>(['grantKeyword'])).map((m) => m.effect.grantKeyword!)
    return [...new Set([...base, ...extra])]
  },

  eligibilityFor(state, unitId, check) {
    const data: Data = { queryUnitId: unitId, check }
    let allow = false
    let deny = false
    for (const m of matchEffects(state, 'onEligibility', data)) {
      const r = resultFor(null, state, 'onEligibility', data, m)
      if (r?.kind !== 'eligibility') continue
      if (r.allow) allow = true
      if (r.deny) deny = true
    }
    return allow && !deny
  },

  pileInDistance(state, unitId, base = 3) {
    const g = getStuckIn(state, unitId)
    return g ? Math.max(base, g.pileIn) : base
  },

  consolidateDistance(state, unitId, base = 3) {
    const g = getStuckIn(state, unitId)
    return g && g.consolidate !== null ? Math.max(base, g.consolidate) : base
  },

  hasBenefitOfCover(state, unitId) {
    return leaderService.halves(state, unitId).some((id) => state.units[id].effects.some((e) => stratCover(state, e)))
  },

  isOathTarget(state, attackerUnitId, targetUnitId) {
    const attacker = state.units[attackerUnitId]
    if (!attacker) return false
    const oath = state.players[attacker.player].oathTargetUnitId
    return !!oath && leaderService.sameUnit(state, oath, targetUnitId)
  },

  battleShockTest(ctx, unitId, source, modifier = 0) {
    const s = ctx.state
    const unit = s.units[unitId]
    if (!unit || unit.location !== 'board') return true
    const halves = leaderService.halves(s, unitId).filter((id) => s.units[id].location === 'board')
    const models = halves.flatMap((id) => unitModels(s, id))
    const ld = Math.min(...models.map((m) => hookService.statFor(s, { unitId: m.unitId, modelId: m.id, weapon: null, stat: 'Ld' }, modelStats(s, m).Ld)))
    const results = hookService.collect(ctx, 'onBattleShockTest', { testUnitId: unitId, roll: null })
    const rolls = results.map((r) => r.result).filter((r): r is Extract<HookResult, { kind: 'roll' }> => r.kind === 'roll')
    let passed: boolean
    let total = 0
    if (rolls.some((r) => r.autoPass)) {
      passed = true
    } else if (rolls.some((r) => r.autoFail)) {
      passed = false
    } else {
      const modifiers = [...(modifier !== 0 ? [{ source, value: modifier }] : []), ...results.filter((r) => r.result.kind === 'roll' && (r.result as { modifier?: number }).modifier).map((r) => ({ source: r.source.id, value: (r.result as { modifier: number }).modifier }))]
      const roll = ctx.roll({ purpose: 'battleShock', player: unit.player, count: 2, mode: 'sum', modifiers, unitId, commandRerollable: false })
      total = rollSum(roll)
      passed = total >= ld
    }
    ctx.emit({ type: 'BattleShockTested', unitId, roll: total, ld, passed, player: unit.player })
    if (!passed) {
      for (const id of halves) {
        s.units[id].battleShocked = true
        s.units[id].battleShockExpiresRound = shockExpiryRound(s, unit.player)
      }
      ctx.emit({ type: 'BattleShocked', unitId, player: unit.player })
    }
    return passed
  },

  gainCp(ctx, player, amount, source) {
    const p = ctx.state.players[player]
    if (amount === 0) return 0
    if (amount < 0) {
      const spent = Math.min(p.cp, -amount)
      if (spent === 0) return 0
      p.cp -= spent
      ctx.emit({ type: 'CpChanged', delta: -spent, total: p.cp, source, player })
      return -spent
    }
    const allowed = Math.max(0, Math.min(amount, 1 - p.cpGainedThisRound))
    if (allowed === 0) {
      ctx.emit({ type: 'AbilityTriggered', abilityId: source, sourceUnitId: null, targetUnitId: null, summary: `CP gain of ${amount} discarded (R-4.2 cap)`, player })
      return 0
    }
    p.cp += allowed
    p.cpGainedThisRound += allowed
    ctx.emit({ type: 'CpChanged', delta: allowed, total: p.cp, source, player })
    return allowed
  },
}
