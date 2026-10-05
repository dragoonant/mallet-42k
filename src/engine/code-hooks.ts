// Code hook registry (20-data §3 `code`, STATUS "Code hooks the engine must implement"). Owner: W1-F.
// Every `code` name referenced by src/data has an entry here. Ability hooks gate or extend declarative descriptors
// (hooks-impl), stratagem hooks add legality checks and effects (stratagems.ts), mission hooks are placeholders whose
// behaviour lives in missions.ts (the registry only proves the name exists).
//
// Reactions (Fire Overwatch, Heroic Intervention, Rapid Ingress, Counter-offensive) and out-of-sequence moves (Krump da
// Gitz!) cannot be resolved inside a stratagem decision: they need the phase modules' placement / attack decisions.
// Using them records a request in phaseState.marks (`reaction:<json>`); the owning module reads it with
// `pendingReactions(state)` after its ctx.window(...) call returns false and removes it with `consumeReaction`.
import type { CoreAbility, Effect, Scope, TimingWindowId } from '../data/types'
import type { Action } from './actions'
import { astraMilitarumHooks } from './factions/astra-militarum'
import { tauEmpireHooks } from './factions/tau-empire'
import { genestealerCultsHooks } from './factions/genestealer-cults'
import { distance, withinEngagementRange, withinObjectiveRange, OBJECTIVE_MARKER_RADIUS } from './geometry'
import { adeptaSororitasHooks } from './factions/adepta-sororitas'
import { shotThisTurn } from './attack'
import type { AttackContext, CodeHook, HookName, HookResult } from './hooks'
import { chaosSpaceMarinesHooks } from './factions/chaos-space-marines'
import { greyKnightsHooks } from './factions/grey-knights'
import { adeptusCustodesHooks } from './factions/adeptus-custodes'
import { hookService, type HookSourceEntry } from './hooks-impl'
import { leaderService } from './leaders'
import type { EngineContext, Services, WindowTrigger } from './modules'
import * as tyr from './factions/tyranids'
import { keywordsOf, modelStats, mortalCredit, unitModels, type MortalCreditBy } from './state'
import { isTeleporting } from './teleport'
import type {
  ChooseOptionDecision, ChooseOptionTopic, GameState, ModelId, PendingDecision, PlayerId, ReactionWindowDecision, Rejection,
  RuntimeStratagem, RuntimeWeapon, Unit, UnitId, WeaponId,
} from './types'

export type ReactionKind = ReactionWindowDecision['context']['reaction']

export interface StratagemEnv {
  state: GameState
  services: Services
  player: PlayerId
  stratagem: RuntimeStratagem
  window: TimingWindowId
  trigger: WindowTrigger
}

// one id per expanded TargetSpec (unit id or model id, spec order) plus the chosen objective marker
export interface StratagemTuple { ids: string[]; objectiveId: string | null }

export interface EngineCodeHook extends CodeHook {
  kind: 'ability' | 'stratagem' | 'mission'
  // declarative effects of the source only apply at these hooks (Veteran Instincts: wound rolls only)
  hooks?: HookName[]
  // E3: a descriptor with this code applies its `reroll` key at every hook listed here (Auramite Thunderbolt: charge + advance)
  rerollHooks?: HookName[]
  // false → the ability's own declarative effects are inactive right now (Waaagh! lives in ActiveEffects; Dead 'ard)
  // `data` is the hook-specific context (attack / roll ...) when evaluated for a roll hook; Resonant Focus reads the attack
  gate?(state: GameState, holder: Unit, entry: HookSourceEntry, data?: Record<string, unknown>): boolean
  // extra Battle-shock dice this source gives the testing unit (Tyranid Synapse); the highest value among sources is rolled
  battleShockDice?(state: GameState, testUnitId: UnitId, entry: HookSourceEntry): number
  // gate for the ActiveEffects a stratagem hook granted (ordinary `gate` is skipped for those): Bring It Down limits its
  // re-roll to the attackers snapshotted at use time
  gateActive?(state: GameState, entry: HookSourceEntry, data?: Record<string, unknown>): boolean
  // replaces the source's own scope (Resonant Focus: the enhancement data has no scope, which would default to `bearer`)
  forceScope?: Scope
  // like `gate`, but also consulted for effects an ActiveEffect carries (stratagem grants), where `gate` is skipped (Vindictive Strategy)
  gateEffect?(state: GameState, holder: Unit, entry: HookSourceEntry, data?: Record<string, unknown>): boolean
  // C4: true when this source lets its player re-roll the Attacks (A) roll of `weapon` fired by `attackerModelId`
  rerollsAttackCount?(state: GameState, entry: HookSourceEntry, attackerModelId: ModelId, weapon: RuntimeWeapon): boolean
  // C5: core abilities this source currently grants to `unitId` (Gunnery Officer: LONE_OPERATIVE)
  grantsCoreAbility?(state: GameState, entry: HookSourceEntry, unitId: UnitId): CoreAbility['ability'][]
  // C1 (T'au For the Greater Good): signed BS/WS step for one attack: -1 = one step better (4+ -> 3+), +1 = one step worse; null/0 = no opinion
  skillDeltaVsTarget?(state: GameState, entry: HookSourceEntry, attackerModelId: ModelId, weapon: RuntimeWeapon,
    targetUnitId: UnitId, info: { kind: 'ranged' | 'melee'; overwatch: boolean }): number | null
  // C2 (T'au Cover Fire): Overwatch hit threshold for the shooter under this stratagem (null = no opinion)
  overwatchHitOn?(state: GameState, entry: HookSourceEntry, shooterUnitId: UnitId, stratagemId: string): number | null
  // C4 (T'au DS8 Support Turret): false makes the weapon unavailable to the model (null = no opinion)
  weaponAvailable?(state: GameState, entry: HookSourceEntry, modelId: ModelId, weaponId: WeaponId): boolean | null
  // answers a chooseOption whose context.data.code names this hook, when the hook has no `pick` of its own
  answer?(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
  // side effects at the descriptor's trigger hook, after its `when` passed (Piston-driven Brutality)
  runAt?(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void
  // window-keyed pick raised as a chooseOption decision (Oath of Moment, Waaagh!)
  pick?: {
    window: TimingWindowId
    // further windows the same pick is offered at (Dark Pacts: shooting.unitSelected + fight.unitSelected)
    windows?: TimingWindowId[]
    topic: ChooseOptionTopic
    offer(ctx: EngineContext, window: TimingWindowId, key: string): boolean
    handle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
  }
  // answers collect() at `producesAt` for a source with no declarative form (A Martyr's Death returns a deferRemoval
  // request for the destroyed model). Called with the hook-specific data; null = nothing to report.
  producesAt?: HookName[]
  produce?(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): HookResult | null
  // ---- stratagems ----
  reaction?: ReactionKind
  // friendly unit candidates come from Reserves instead of the battlefield
  reserves?: boolean
  // friendly unit candidates come from destroyed units (Send in the Next Wave)
  destroyedTargets?: boolean
  // the hook grants the declarative effect itself (not to targets[0])
  grantsItself?: boolean
  // one option per objective marker (Duty and Honour)
  needsObjective?: boolean
  check?(env: StratagemEnv, tuple: StratagemTuple): boolean
  apply?(ctx: EngineContext, env: StratagemEnv, tuple: StratagemTuple): void
}

// ---------- reactions recorded for the phase modules ----------
export interface ReactionRequest {
  kind: ReactionKind | 'surge' | 'nextWave' | 'cultAmbush'
  stratagemId: string
  player: PlayerId
  // the reacting / moving friendly unit
  unitId: UnitId
  // the enemy unit that triggered it (overwatch target, charger, fought unit, shooter to move toward)
  enemyUnitId: UnitId | null
  window: TimingWindowId
  // surge: rolled distance (Krump da Gitz!)
  distance: number | null
}

const REACTION_PREFIX = 'reaction:'

export function pushReaction(ctx: EngineContext, r: ReactionRequest): void {
  ctx.state.phaseState.marks.push(REACTION_PREFIX + JSON.stringify(r))
}

export function pendingReactions(state: GameState, kind?: ReactionRequest['kind']): ReactionRequest[] {
  return state.phaseState.marks
    .filter((m) => m.startsWith(REACTION_PREFIX))
    .map((m) => JSON.parse(m.slice(REACTION_PREFIX.length)) as ReactionRequest)
    .filter((r) => kind === undefined || r.kind === kind)
}

// removes the first matching request (draft state only); returns it
export function consumeReaction(state: GameState, kind: ReactionRequest['kind'], unitId?: UnitId): ReactionRequest | null {
  const marks = state.phaseState.marks
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].startsWith(REACTION_PREFIX)) continue
    const r = JSON.parse(marks[i].slice(REACTION_PREFIX.length)) as ReactionRequest
    if (r.kind === kind && (unitId === undefined || r.unitId === unitId)) {
      marks.splice(i, 1)
      return r
    }
  }
  return null
}

// ---------- helpers ----------

function boardUnit(state: GameState, id: string | undefined): Unit | null {
  const u = id ? state.units[id] : undefined
  return u && u.location === 'board' ? u : null
}

function unitHasAny(state: GameState, unitId: UnitId, kw: string): boolean {
  return leaderService.halves(state, unitId).some((id) => keywordsOf(state, id).includes(kw))
}

function hasRangedWeapon(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => state.units[id].location === 'board' && unitModels(state, id).some((m) => m.weapons.some((w) => state.weapons[w]?.kind === 'ranged')))
}

// R-6.7 Pistol: a model equipped with a Pistol may be selected to shoot (or Fire Overwatch) while its unit is in
// Engagement Range, targeting only the unit(s) it is engaged with.
function hasPistolWeapon(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => state.units[id].location === 'board' && unitModels(state, id).some((m) =>
    m.weapons.some((wid) => {
      const w = state.weapons[wid]
      return !!w && w.kind === 'ranged' && hookService.weaponAbilitiesFor(state, m.id, w).some((a) => a.ability === 'PISTOL')
    })))
}

function isBigGunsUnit(state: GameState, unitId: UnitId): boolean {
  return unitHasAny(state, unitId, 'MONSTER') || unitHasAny(state, unitId, 'VEHICLE')
}

function anyModelSees(env: StratagemEnv, fromUnitId: UnitId, targetUnitId: UnitId): boolean {
  const models = leaderService.halves(env.state, fromUnitId).flatMap((id) => env.state.units[id].location === 'board' ? unitModels(env.state, id) : [])
  return models.some((m) => env.services.los.unitVisible(env.state, m.id, targetUnitId))
}

function unitWithAbilityCode(state: GameState, unit: Unit, code: string): string | null {
  const ds = state.datasheets[unit.datasheetId]
  for (const id of ds?.abilities ?? []) if (state.abilities[id]?.code === code) return id
  return null
}

function rollSuccesses(ctx: EngineContext, player: PlayerId, count: number, threshold: number, unitId: UnitId, targetUnitId: UnitId): number {
  if (count <= 0) return 0
  const roll = ctx.roll({ purpose: 'stratagem', player, count, mode: 'perDie', unitId, targetUnitId, commandRerollable: false })
  return roll.final.filter((d) => d >= threshold).length
}

function queueMortals(ctx: EngineContext, targetUnitId: UnitId, count: number, source: string, by?: MortalCreditBy): void {
  if (count <= 0) return
  const attack = ctx.services.attack
  attack.queueMortalWounds(ctx, targetUnitId, count, source, false, by)
  // resolve at once when nothing else is in flight; if allocation needs a decision the phase module keeps driving
  // services.attack.advance while phaseState.attack is set
  if (!ctx.state.pending && ctx.state.phaseState.attack) attack.advance(ctx)
}

const noop = () => undefined

// ---------- ability hooks ----------
const oathOfMomentPick: EngineCodeHook = {
  name: 'oathOfMomentPick', kind: 'ability', hook: 'onPhaseStart', run: noop,
  pick: {
    window: 'command.start',
    topic: 'oathTarget',
    offer(ctx, window, key) {
      const s = ctx.state
      const player = s.activePlayer
      const mark = `pick:oath:${s.round}:${player}`
      if (s.phaseState.marks.includes(mark)) return false
      const holder = Object.values(s.units).find((u) => u.player === player && u.location !== 'destroyed' && unitWithAbilityCode(s, u, 'oathOfMomentPick'))
      if (!holder) return false
      s.phaseState.marks.push(mark)
      s.players[player].oathTargetUnitId = null
      const enemies = Object.values(s.units).filter((u) => u.player !== player && u.location === 'board' && !u.bodyguardUnitId)
      if (enemies.length === 0) return false
      const abilityId = unitWithAbilityCode(s, holder, 'oathOfMomentPick')
      ctx.decide({
        kind: 'chooseOption', player, window, canPass: false,
        context: { topic: 'oathTarget', unitId: null, abilityId, data: { window, key } },
        options: enemies.map((u) => ({ id: u.id, label: u.name, action: { type: 'chooseOption', player, decisionId: '', optionId: u.id } })),
      })
      return true
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'oath target expects chooseOption' }
      const unit = ctx.state.units[action.optionId]
      if (!unit || unit.player === pending.player) return { code: 'E_INVALID_TARGET', reason: 'oath target must be an enemy unit' }
      ctx.state.players[pending.player].oathTargetUnitId = unit.id
      ctx.emit({ type: 'OathTargetChosen', unitId: unit.id, player: pending.player })
    },
  },
}

const waaaghCall: EngineCodeHook = {
  name: 'waaaghCall', kind: 'ability', hook: 'onStatQuery', run: noop,
  // the declarative effects are carried by the ActiveEffects granted when the Waaagh! is called
  gate: () => false,
  pick: {
    window: 'round.start',
    topic: 'waaagh',
    offer(ctx, window, key) {
      const s = ctx.state
      for (const player of [s.firstPlayer, s.firstPlayer === 'A' ? 'B' : 'A'] as PlayerId[]) {
        const mark = `pick:waaagh:${s.round}:${player}`
        if (s.phaseState.marks.includes(mark) || s.players[player].waaagh.used) continue
        const holder = Object.values(s.units).find((u) => u.player === player && u.location !== 'destroyed' && unitWithAbilityCode(s, u, 'waaaghCall'))
        if (!holder) continue
        s.phaseState.marks.push(mark)
        const abilityId = unitWithAbilityCode(s, holder, 'waaaghCall')
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'waaagh', unitId: null, abilityId, data: { window, key } },
          options: [
            { id: 'call', label: 'Call the Waaagh!', action: { type: 'chooseOption', player, decisionId: '', optionId: 'call' } },
            { id: 'wait', label: 'Not this round', action: { type: 'chooseOption', player, decisionId: '', optionId: 'wait' } },
          ],
        })
        return true
      }
      return false
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'waaagh expects chooseOption' }
      if (action.optionId !== 'call') return
      const s = ctx.state
      const p = s.players[pending.player]
      if (p.waaagh.used) return { code: 'E_STRATAGEM_USED', reason: 'the Waaagh! has already been called this battle' }
      p.waaagh = { used: true, activeRound: s.round }
      ctx.emit({ type: 'WaaaghCalled', player: pending.player })
      for (const unit of Object.values(s.units)) {
        if (unit.player !== pending.player || unit.location === 'destroyed') continue
        const id = unitWithAbilityCode(s, unit, 'waaaghCall')
        if (!id) continue
        const a = s.abilities[id]
        ctx.services.effects.grant(ctx, unit.id, a.effect ?? [], {
          sourceAbilityId: id, sourceUnitId: unit.id, scope: a.scope ?? { who: 'self' }, duration: a.duration ?? 'untilEndOfRound', when: a.when ?? null,
        })
      }
    },
  },
}

const deadArdFeelNoPain: EngineCodeHook = {
  name: 'deadArdFeelNoPain', kind: 'ability', hook: 'onFeelNoPainRoll', run: noop,
  gate: (state, holder) => state.players[holder.player].waaagh.activeRound === state.round,
}

const pistonDrivenBrutality: EngineCodeHook = {
  name: 'pistonDrivenBrutality', kind: 'ability', hook: 'onPhaseStart', run: noop,
  runAt(ctx, entry) {
    const s = ctx.state
    const holder = boardUnit(s, entry.holderUnitId)
    if (!holder) return
    const mine = unitModels(s, holder.id)
    const tested = new Set<UnitId>()
    for (const enemy of Object.values(s.units)) {
      if (enemy.player === holder.player || enemy.location !== 'board') continue
      const canonical = leaderService.canonicalUnitId(s, enemy.id)
      if (tested.has(canonical)) continue
      const theirs = leaderService.halves(s, enemy.id).flatMap((id) => s.units[id].location === 'board' ? unitModels(s, id) : [])
      if (!mine.some((m) => theirs.some((t) => withinEngagementRange(m, t)))) continue
      tested.add(canonical)
      ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: canonical, summary: 'Battle-shock test', player: holder.player })
      hookService.battleShockTest(ctx, canonical, entry.source.id)
    }
  },
}

const tellyportaGrant: EngineCodeHook = {
  // Deep Strike pairing is applied by createGame (Unit.deepStrikeWith); arrival together is the movement module's check
  name: 'tellyportaGrant', kind: 'ability', hook: 'onDeployment', run: noop,
}

const veteranInstincts: EngineCodeHook = {
  name: 'veteranInstincts', kind: 'stratagem', hook: 'onWoundRoll', run: noop, hooks: ['onWoundRoll'],
}

// ---------- stratagem hooks ----------
function notMovedAwayOrFled(u: Unit): boolean { return u.turn.moveType !== 'advance' && u.turn.moveType !== 'fallBack' }

// R-6.1 / R-6.2 / R-6.3 eligibility to shoot as if it were the unit's Shooting phase (Fire Overwatch)
export function eligibleToShootNow(state: GameState, unitId: UnitId): boolean {
  const u = boardUnit(state, unitId)
  if (!u) return false
  const halves = leaderService.halves(state, unitId).map((id) => state.units[id])
  if (halves.some((h) => h.turn.shotThisPhase || !notMovedAwayOrFled(h))) return false
  if (!hasRangedWeapon(state, unitId)) return false
  if (isBigGunsUnit(state, unitId)) return true
  if (!leaderService.inEngagementWithEnemy(state, unitId)) return true
  // R-6.2 / R-6.7 Pistol exception: otherwise an engaged unit may only be selected to shoot if it has a Pistol
  return hasPistolWeapon(state, unitId)
}

const fireOverwatch: EngineCodeHook = {
  name: 'fireOverwatch', kind: 'stratagem', hook: 'onMove', run: noop, reaction: 'overwatch',
  check(env, t) {
    const [enemyId, friendlyId] = t.ids
    const { state } = env
    // R-11.5 / 00-arch §4: in the Charge phase Overwatch fires only as the charge move starts (charge.moveStarted);
    // the data window list still names charge.moveEnded, which the spec does not allow
    if (env.window === 'charge.moveEnded') return false
    if (!boardUnit(state, enemyId) || !leaderService.sameUnit(state, enemyId, env.trigger.unitId)) return false
    const notAgainst = (env.stratagem.params?.notAgainstKeyword as string | undefined) ?? 'TITANIC'
    if (unitHasAny(state, enemyId, notAgainst)) return false
    if (!eligibleToShootNow(state, friendlyId)) return false
    if (shotThisTurn(state, friendlyId)) return false // C3: once per unit per turn (Laser-Marked Targets counts too)
    // R-6.7 Pistol exception: an engaged non-MONSTER/VEHICLE unit may only fire at a unit it is engaged with, not any
    // enemy in range — matters when the reacting unit is engaged with more than one enemy.
    if (!isBigGunsUnit(state, friendlyId) && leaderService.inEngagementWithEnemy(state, friendlyId) && !leaderService.unitsInEngagement(state, friendlyId, enemyId)) return false
    return anyModelSees(env, friendlyId, enemyId)
  },
  apply(ctx, env, t) {
    pushReaction(ctx, { kind: 'overwatch', stratagemId: env.stratagem.id, player: env.player, unitId: t.ids[1], enemyUnitId: t.ids[0], window: env.window, distance: null })
  },
}

const heroicInterventionCharge: EngineCodeHook = {
  name: 'heroicInterventionCharge', kind: 'stratagem', hook: 'onCharge', run: noop, reaction: 'heroicIntervention',
  check(env, t) {
    const [enemyId, friendlyId] = t.ids
    const { state } = env
    if (!boardUnit(state, enemyId) || !leaderService.sameUnit(state, enemyId, env.trigger.unitId)) return false
    // one Heroic Intervention per charge move: a queued one closes the window (a 0 CP / no-limit override such as Pouncing Leap would otherwise re-offer it forever)
    if (pendingReactions(state, 'heroicIntervention').some((r) => r.enemyUnitId === enemyId)) return false
    const f = boardUnit(state, friendlyId)
    if (!f) return false
    if (leaderService.halves(state, friendlyId).some((id) => !notMovedAwayOrFled(state.units[id]))) return false
    if (leaderService.inEngagementWithEnemy(state, friendlyId)) return false
    if (unitHasAny(state, friendlyId, 'AIRCRAFT')) return false
    if (unitHasAny(state, friendlyId, 'VEHICLE') && !unitHasAny(state, friendlyId, 'WALKER')) return false
    return true
  },
  apply(ctx, env, t) {
    pushReaction(ctx, { kind: 'heroicIntervention', stratagemId: env.stratagem.id, player: env.player, unitId: t.ids[1], enemyUnitId: t.ids[0], window: env.window, distance: null })
  },
}

const rapidIngressArrival: EngineCodeHook = {
  name: 'rapidIngressArrival', kind: 'stratagem', hook: 'onReinforcements', run: noop, reaction: 'rapidIngress', reserves: true,
  check(env, t) {
    const { state } = env
    const u = state.units[t.ids[0]]
    if (!u || u.location !== 'reserves') return false
    if (isTeleporting(state, u.id)) return false // GRE E3: Teleport Assault arrivals are not stratagem Reinforcements
    const ds = state.datasheets[u.datasheetId]
    const deepStrike = ds.coreAbilities.some((c) => c.ability === 'DEEP_STRIKE') || u.deepStrikeWith !== null
    if (!deepStrike) return false
    // R-5.14 / CP-1.9: Reserves never arrive in battle round 1; after round 3 they are already destroyed
    if (state.round < 2) return false
    if (state.mission.data.format === 'combatPatrol' && state.round > 3) return false
    return true
  },
  apply(ctx, env, t) {
    pushReaction(ctx, { kind: 'rapidIngress', stratagemId: env.stratagem.id, player: env.player, unitId: t.ids[0], enemyUnitId: null, window: env.window, distance: null })
  },
}

const counterOffensive: EngineCodeHook = {
  name: 'counterOffensive', kind: 'stratagem', hook: 'onUnitSelectedToFight', run: noop, reaction: 'counterOffensive',
  check(env, t) {
    const { state } = env
    const fought = env.trigger.unitId ? state.units[env.trigger.unitId] : null
    if (!fought || fought.player === env.player) return false
    // STATUS hook note: the unit must be in Engagement Range (TargetSpec only encodes notYetFought)
    return leaderService.inEngagementWithEnemy(state, t.ids[0])
  },
  apply(ctx, env, t) {
    const fight = ctx.state.phaseState.fight
    if (fight) {
      fight.counterOffensive = true
      fight.nextToSelect = env.player
    }
    pushReaction(ctx, { kind: 'counterOffensive', stratagemId: env.stratagem.id, player: env.player, unitId: t.ids[0], enemyUnitId: env.trigger.unitId ?? null, window: env.window, distance: null })
  },
}

const epicChallenge: EngineCodeHook = {
  name: 'epicChallenge', kind: 'stratagem', hook: 'onUnitSelectedToFight', run: noop, grantsItself: true,
  check(env, t) {
    const { state } = env
    const [enemyId, modelId] = t.ids
    const selected = env.trigger.unitId
    if (!selected || state.units[selected]?.player !== env.player) return false
    if (!leaderService.isAttached(state, enemyId)) return false
    const model = state.models[modelId]
    if (!model || !leaderService.sameUnit(state, model.unitId, selected)) return false
    return leaderService.unitsInEngagement(state, selected, enemyId)
  },
  apply(ctx, env, t) {
    const model = ctx.state.models[t.ids[1]]
    const active = ctx.services.effects.grant(ctx, model.unitId, env.stratagem.effect ?? [], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: model.unitId, scope: { who: 'bearer' }, duration: env.stratagem.duration ?? 'untilEndOfPhase', when: env.stratagem.when ?? null,
    })
    // only the picked model (per-model keywords, AST-033) carries the effect, not its whole unit
    active.bearerModelId = model.id
  },
}

const tankShockMortalWounds: EngineCodeHook = {
  name: 'tankShockMortalWounds', kind: 'stratagem', hook: 'onCharge', run: noop,
  check(env, t) {
    const { state } = env
    const [vehicleUnitId, enemyId, modelId] = t.ids
    // STRAT-018: only the unit that has just made a Charge move in its own Charge phase (RC-041: not Heroic Intervention)
    if (!leaderService.sameUnit(state, vehicleUnitId, env.trigger.unitId)) return false
    const model = state.models[modelId]
    if (!model || !leaderService.sameUnit(state, model.unitId, vehicleUnitId)) return false
    const enemyModels = leaderService.halves(state, enemyId).flatMap((id) => state.units[id].location === 'board' ? unitModels(state, id) : [])
    return enemyModels.some((e) => withinEngagementRange(model, e))
  },
  apply(ctx, env, t) {
    const s = ctx.state
    const [, enemyId, modelId] = t.ids
    const model = s.models[modelId]
    const params = env.stratagem.params ?? {}
    const T = hookService.statFor(s, { unitId: model.unitId, modelId, weapon: null, stat: 'T' }, modelStats(s, model).T)
    const hits = rollSuccesses(ctx, env.player, T, (params.threshold as number | undefined) ?? 5, model.unitId, enemyId)
    const mortal = Math.min(hits, (params.maxMortalWounds as number | undefined) ?? 6)
    queueMortals(ctx, leaderService.canonicalUnitId(s, enemyId), mortal, env.stratagem.id, mortalCredit(s, model.unitId))
  },
}

const grenadeMortalWounds: EngineCodeHook = {
  name: 'grenadeMortalWounds', kind: 'stratagem', hook: 'onUnitSelectedToShoot', run: noop,
  check(env, t) {
    const { state } = env
    const [grenId, enemyId] = t.ids
    const g = boardUnit(state, grenId)
    if (!g || !boardUnit(state, enemyId)) return false
    const halves = leaderService.halves(state, grenId).map((id) => state.units[id])
    if (halves.some((h) => h.turn.shotThisPhase || !notMovedAwayOrFled(h) || state.phaseState.activated.includes(h.id))) return false
    if (leaderService.inEngagementWithEnemy(state, grenId)) return false
    // the enemy may not be within Engagement Range of any unit of the grenade player's army
    for (const f of Object.values(state.units)) {
      if (f.player !== env.player || f.location !== 'board') continue
      if (leaderService.unitsInEngagement(state, f.id, enemyId)) return false
    }
    const inches = 8
    const carriers = leaderService.halves(state, grenId).filter((id) => keywordsOf(state, id).includes('GRENADES')).flatMap((id) => unitModels(state, id))
    const enemyModels = leaderService.halves(state, enemyId).flatMap((id) => state.units[id].location === 'board' ? unitModels(state, id) : [])
    return carriers.some((c) => enemyModels.some((e) => distance(c, e) <= inches + 1e-6) && env.services.los.unitVisible(state, c.id, enemyId))
  },
  apply(ctx, env, t) {
    const params = env.stratagem.params ?? {}
    const hits = rollSuccesses(ctx, env.player, (params.dice as number | undefined) ?? 6, (params.threshold as number | undefined) ?? 4, t.ids[0], t.ids[1])
    queueMortals(ctx, leaderService.canonicalUnitId(ctx.state, t.ids[1]), hits, env.stratagem.id, mortalCredit(ctx.state, t.ids[0]))
  },
}

const getStuckInDistance: EngineCodeHook = {
  // pile-in / consolidation distance read by the fight module via services.hooks.pileInDistance / consolidateDistance
  name: 'getStuckInDistance', kind: 'stratagem', hook: 'onMove', run: noop,
  apply(ctx, env, t) {
    const unitId = t.ids[0]
    ctx.services.effects.grant(ctx, unitId, [], { sourceAbilityId: env.stratagem.id, sourceUnitId: unitId, scope: { who: 'self' }, duration: env.stratagem.duration ?? 'untilEndOfPhase' })
  },
}

const grantBenefitOfCover: EngineCodeHook = {
  // cover is read through services.hooks.hasBenefitOfCover; the data's invuln / stealth effect is granted generically
  name: 'grantBenefitOfCover', kind: 'stratagem', hook: 'onSaveRoll', run: noop,
}

const dutyAndHonour: EngineCodeHook = {
  name: 'dutyAndHonour', kind: 'stratagem', hook: 'onObjectiveControl', run: noop, needsObjective: true,
  check(env, t) {
    const { state } = env
    const obj = t.objectiveId ? state.objectives[t.objectiveId] : null
    // STATUS hook note: the marker must be controlled by the active player (the stratagem user)
    if (!obj || obj.removed || obj.controller !== env.player || state.activePlayer !== env.player) return false
    const models = leaderService.halves(state, t.ids[0]).flatMap((id) => state.units[id].location === 'board' ? unitModels(state, id) : [])
    const range = state.mission.data.objectiveRange ?? 3
    const radius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
    return models.some((m) => withinObjectiveRange(m, obj, 0, range, radius))
  },
  apply(ctx, env, t) {
    const obj = ctx.state.objectives[t.objectiveId as string]
    obj.stickyBy = env.player
    ctx.emit({ type: 'ObjectiveSecured', objectiveId: obj.id, by: env.player, flag: 'sticky', player: env.player })
  },
}

// ---------- necrons (docs/spec/factions/necrons.md §7) ----------
// Reanimation Protocols: the roll / heal / return work lives in factions/necrons.ts and is called by the Command phase
// module before command.end (NEC-2.6); the hook only names the ability so the data validates and the descriptor is inert
// at its own `phaseEnd` trigger (that fires after command.end, too late for primary scoring).
const reanimationProtocols: EngineCodeHook = { name: 'reanimationProtocols', kind: 'ability', hook: 'onPhaseEnd', run: noop }

function markName(params: Record<string, unknown> | undefined): string { return (params?.markName as string | undefined) ?? 'resonantFocus' }

function resonantBearer(s: GameState, player: PlayerId): { abilityId: string; modelId: string; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== 'resonantFocusReroll' || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    const unit = model ? s.units[model.unitId] : undefined
    if (unit && unit.player === player && unit.location === 'board') return { abilityId: a.id, modelId: a.bearerModelId, unitId: unit.id }
  }
  return null
}

// Protocol of Resonant Focus, pick half: opened at command.start of the bearer's own turn
const resonantFocusPick: EngineCodeHook = {
  name: 'resonantFocusPick', kind: 'ability', hook: 'onCommandPhase', run: noop,
  pick: {
    window: 'command.start',
    topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      const player = s.activePlayer
      const mark = `pick:resonant:${s.round}:${player}`
      if (s.phaseState.marks.includes(mark)) return false
      const bearer = resonantBearer(s, player)
      if (!bearer) return false
      s.phaseState.marks.push(mark)
      const params = s.abilities[bearer.abilityId].params ?? {}
      const range = (params.range as number | undefined) ?? 12
      const bearerModel = s.models[bearer.modelId]
      const candidates: Unit[] = []
      for (const e of Object.values(s.units)) {
        if (e.player === player || e.location !== 'board' || e.bodyguardUnitId) continue
        const theirs = leaderService.halves(s, e.id).flatMap((id) => s.units[id].location === 'board' ? unitModels(s, id) : [])
        if (!theirs.some((m) => distance(bearerModel, m) <= range + 1e-6)) continue
        if (params.requireVisible !== false && !ctx.services.los.unitVisible(s, bearer.modelId, e.id)) continue
        candidates.push(e)
      }
      if (candidates.length === 0) return false
      ctx.decide({
        kind: 'chooseOption', player, window, canPass: false,
        context: { topic: 'abilityChoice', unitId: bearer.unitId, abilityId: bearer.abilityId, data: { window, key, code: 'resonantFocusPick' } },
        options: candidates.map((u) => ({ id: u.id, label: u.name, action: { type: 'chooseOption', player, decisionId: '', optionId: u.id }, hint: { unitId: u.id } })),
      })
      return true
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'resonant focus expects chooseOption' }
      const s = ctx.state
      const unit = s.units[action.optionId]
      if (!unit || unit.player === pending.player || unit.location !== 'board') return { code: 'E_INVALID_TARGET', reason: 'resonant focus must target an enemy unit on the battlefield' }
      const target = leaderService.canonicalUnitId(s, unit.id)
      const params = s.abilities[pending.context.abilityId ?? '']?.params
      s.players[pending.player].secondaryState[markName(params)] = { unitId: target, round: s.round }
      const abilityId = pending.context.abilityId ?? 'nec.e.protocol-of-resonant-focus'
      const keyword = (params?.attackerFactionKeyword as string | undefined) ?? 'NECRONS'
      const effect = (s.abilities[abilityId]?.effect ?? { reroll: 'ones' }) as Effect
      // the holder is the enemy unit, so `ownTurn: false` means "the marker's turn"; `round` pins it to this one turn
      ctx.services.effects.grant(ctx, target, [effect], {
        sourceAbilityId: abilityId, sourceUnitId: pending.context.unitId ?? null, scope: { who: 'attacker' }, duration: 'untilEndOfTurn',
        when: { ownTurn: false, attackerKeyword: keyword, round: { gte: s.round, lte: s.round } },
      })
      ctx.emit({ type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? 'nec.e.protocol-of-resonant-focus', sourceUnitId: pending.context.unitId, targetUnitId: target, summary: `Protocol of Resonant Focus: ${unit.name} marked`, player: pending.player })
    },
  },
}

// Protocol of Resonant Focus, re-roll half: once the pick is answered the re-roll lives as an ActiveEffect held by the MARKED
// enemy unit (scope 'attacker' = "attacks whose target is this unit"), gated to friendly NECRONS attackers and to the
// marker's own turn. It therefore no longer depends on the bearer surviving (NEC-3: "until the end of that turn" once
// selected; range and visibility matter only at selection). The bearer's own enhancement entry never fires by itself.
const resonantFocusReroll: EngineCodeHook = {
  name: 'resonantFocusReroll', kind: 'ability', hook: 'onHitRoll', run: noop, hooks: ['onHitRoll'],
  gate() { return false },
}

// Will of the Overlord restriction: only while a model with `params.keyword` (OVERLORD) is on the battlefield
const requireFriendlyKeywordOnBoard: EngineCodeHook = {
  name: 'requireFriendlyKeywordOnBoard', kind: 'stratagem', hook: 'onCommandPhase', run: noop,
  check(env) {
    const keyword = (env.stratagem.params?.keyword as string | undefined) ?? 'OVERLORD'
    return Object.values(env.state.units).some((u) => u.player === env.player && u.location === 'board' && u.models.length > 0 && keywordsOf(env.state, u.id).includes(keyword))
  },
}

function plasmaUses(s: GameState, player: PlayerId, abilityId: string, unitId: UnitId): number {
  return s.players[player].oncePerBattleUsed.filter((k) => k.startsWith(`${abilityId}:${unitId}:`)).length
}

// Plasmacyte: when the carrying unit is selected to fight (window key = the unit id) its owner may spend one charge
const plasmacyteSurge: EngineCodeHook = {
  name: 'plasmacyteSurge', kind: 'ability', hook: 'onUnitSelectedToFight', run: noop,
  pick: {
    window: 'fight.unitSelected',
    topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      const unit = boardUnit(s, key)
      if (!unit) return false
      const abilityId = unitWithAbilityCode(s, unit, 'plasmacyteSurge')
      if (!abilityId) return false
      const mark = `pick:plasmacyte:${unit.id}`
      if (s.phaseState.marks.includes(mark)) return false
      const charges = (s.abilities[abilityId].params?.charges as number | undefined) ?? 1
      if (plasmaUses(s, unit.player, abilityId, unit.id) >= charges) return false
      s.phaseState.marks.push(mark)
      ctx.decide({
        kind: 'chooseOption', player: unit.player, window, canPass: false,
        context: { topic: 'abilityChoice', unitId: unit.id, abilityId, data: { window, key, code: 'plasmacyteSurge' } },
        options: [
          { id: 'use', label: 'Spend the plasmacyte (Devastating Wounds)', action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: 'use' }, hint: { unitId: unit.id, priority: 1 } },
          { id: 'decline', label: 'Decline', action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: 'decline' } },
        ],
      })
      return true
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'plasmacyte expects chooseOption' }
      if (action.optionId === 'decline') return
      if (action.optionId !== 'use') return { code: 'E_NOT_AN_OPTION', reason: 'plasmacyte: use or decline' }
      const s = ctx.state
      const unit = s.units[pending.context.unitId ?? '']
      const abilityId = pending.context.abilityId
      const ability = abilityId ? s.abilities[abilityId] : undefined
      if (!unit || !abilityId || !ability) return { code: 'E_NOT_AN_OPTION', reason: 'plasmacyte: unit or ability missing' }
      const params = ability.params ?? {}
      const used = plasmaUses(s, unit.player, abilityId, unit.id)
      if (used >= ((params.charges as number | undefined) ?? 1)) return { code: 'E_STRATAGEM_USED', reason: 'no plasmacyte left to spend' }
      s.players[unit.player].oncePerBattleUsed.push(`${abilityId}:${unit.id}:${used}`)
      const grant = (params.grant ?? { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'DEVASTATING_WOUNDS' } }) as Effect
      ctx.services.effects.grant(ctx, unit.id, [grant], {
        sourceAbilityId: abilityId, sourceUnitId: unit.id, scope: { who: 'self' }, duration: (params.duration as 'untilEndOfPhase' | undefined) ?? 'untilEndOfPhase', when: null,
      })
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unit.id, targetUnitId: unit.id, summary: 'Plasmacyte spent: melee weapons gain Devastating Wounds this phase', player: unit.player })
    },
  },
}

// ---------- mission / scoring hooks (implemented in missions.ts; names registered for data validation) ----------
function missionHook(name: string, hook: HookName = 'onPhaseEnd'): EngineCodeHook {
  return { name, kind: 'mission', hook, run: noop }
}

// ---------- tyranids (docs/spec/factions/tyranids.md §7); bodies in factions/tyranids.ts, called lazily (import cycle) ----------
const synapseBattleShock: EngineCodeHook = {
  name: 'synapseBattleShock', kind: 'ability', hook: 'onBattleShockTest', run: noop,
  battleShockDice: (state, testUnitId, entry) => tyr.synapseExtraDice(state, testUnitId, entry),
}

const shadowInTheWarp: EngineCodeHook = {
  name: 'shadowInTheWarp', kind: 'ability', hook: 'onCommandPhase', run: noop,
  pick: { window: 'command.start', topic: 'abilityChoice', offer: (ctx, w, k) => tyr.shadowOffer(ctx, w, k), handle: (ctx, a, p) => tyr.shadowHandle(ctx, a, p) },
}

const secretionGoadShoot: EngineCodeHook = {
  name: 'secretionGoadShoot', kind: 'ability', hook: 'onTargetsDeclared', run: noop,
  pick: { window: 'shooting.targetsDeclared', topic: 'abilityChoice', offer: (ctx, w, k) => tyr.goadShootOffer(ctx, w, k), handle: (ctx, a, p) => tyr.goadHandle(ctx, a, p) },
}

const secretionGoadFight: EngineCodeHook = {
  name: 'secretionGoadFight', kind: 'ability', hook: 'onUnitSelectedToFight', run: noop,
  pick: { window: 'fight.unitSelected', topic: 'abilityChoice', offer: (ctx, w, k) => tyr.goadFightOffer(ctx, w, k), handle: (ctx, a, p) => tyr.goadHandle(ctx, a, p) },
}

const skulkingHorrors: EngineCodeHook = {
  name: 'skulkingHorrors', kind: 'ability', hook: 'onMove', run: noop,
  pick: { window: 'movement.unitMoved', topic: 'abilityChoice', offer: (ctx, w, k) => tyr.skulkingOffer(ctx, w, k), handle: (ctx, a, p) => tyr.skulkingHandle(ctx, a, p) },
}

const disruptionBombardment: EngineCodeHook = {
  name: 'disruptionBombardment', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
  pick: { window: 'shooting.attacksResolved', topic: 'abilityChoice', offer: (ctx, w, k) => tyr.disruptionOffer(ctx, w, k), handle: (ctx, a, p) => tyr.disruptionHandle(ctx, a, p) },
}

// marker abilities: the logic lives in the engine (deathblow.ts, stratagems.ts effectiveCost, setup.ts splitPatrolSquad)
const deathBlow: EngineCodeHook = { name: 'deathBlow', kind: 'ability', hook: 'onModelDestroyed', run: noop }
const stratagemCostOverride: EngineCodeHook = { name: 'stratagemCostOverride', kind: 'ability', hook: 'onCharge', run: noop }
const patrolSquads: EngineCodeHook = { name: 'patrolSquads', kind: 'ability', hook: 'onDeployment', run: noop }

// Voracious Assault: the re-roll is declarative (descriptor 'when' targetIsClosestEligible); the hook only lets the stratagem's
// ActiveEffect re-roll apply at the hit roll
const voraciousAssaultHit: EngineCodeHook = { name: 'voraciousAssaultHit', kind: 'stratagem', hook: 'onHitRoll', run: noop, hooks: ['onHitRoll'] }

const teemingBroods: EngineCodeHook = {
  name: 'teemingBroods', kind: 'stratagem', hook: 'onReinforcements', run: noop,
  // only offered when something could return: a destroyed unit (a new copy joins) or an on-board unit below Starting Strength
  check(env, t) {
    const u = env.state.units[t.ids[0]]
    if (!u) return false
    if (u.location === 'destroyed') return true
    return u.location === 'board' && u.destroyedModels.length > 0 && u.models.length < u.startingStrength
  },
  apply: (ctx, env, t) => tyr.teemingBroodsApply(ctx, env.stratagem.id, env.player, t.ids[0]),
}

// secondaries are scored in missions.ts (custom amounts); names registered for data validation
const alphaXenoform = missionHook('alphaXenoform')
const chitinousTide = missionHook('chitinousTide', 'onTurnEnd')

export const codeHooks: Record<string, EngineCodeHook> = {
  oathOfMomentPick, waaaghCall, deadArdFeelNoPain, pistonDrivenBrutality, tellyportaGrant, veteranInstincts,
  fireOverwatch, heroicInterventionCharge, rapidIngressArrival, counterOffensive, epicChallenge, tankShockMortalWounds,
  grenadeMortalWounds, getStuckInDistance, grantBenefitOfCover, dutyAndHonour,
  reanimationProtocols, resonantFocusPick, resonantFocusReroll, requireFriendlyKeywordOnBoard, plasmacyteSurge,
  ...chaosSpaceMarinesHooks,
  ...greyKnightsHooks,
  ...adeptusCustodesHooks,
  guardianOfTheRealm: missionHook('guardianOfTheRealm', 'onPhaseEnd'),
  championOfTitan: missionHook('championOfTitan', 'onModelDestroyed'),
  noEscape: missionHook('noEscape', 'onTurnEnd'),
  markedForExecution: missionHook('markedForExecution', 'onUnitDestroyed'),
  synapseBattleShock, shadowInTheWarp, secretionGoadShoot, secretionGoadFight, skulkingHorrors, disruptionBombardment,
  deathBlow, stratagemCostOverride, patrolSquads, voraciousAssaultHit, teemingBroods, alphaXenoform, chitinousTide,
  ...adeptaSororitasHooks,
  hallowedRetribution: missionHook('hallowedRetribution', 'onUnitDestroyed'),
  consecratedGround: missionHook('consecratedGround', 'onTurnEnd'),
  breakTheirSpirit: missionHook('breakTheirSpirit', 'onBattleShockTest'),
  claimSites: missionHook('claimSites'),
  irradiatedPowerCells: missionHook('irradiatedPowerCells'),
  properLootin: missionHook('properLootin'),
  reclaimAndDominate: missionHook('reclaimAndDominate', 'onTurnEnd'),
  treasuresOfAeonsPick: missionHook('treasuresOfAeonsPick'),
  treasuresOfAeonsScore: missionHook('treasuresOfAeonsScore', 'onUnitDestroyed'),
  razeAndRuin: missionHook('razeAndRuin'),
  retrieveIntelligence: missionHook('retrieveIntelligence'),
  sabotageComms: missionHook('sabotageComms', 'onTurnEnd'),
  shockTactics: missionHook('shockTactics', 'onTurnEnd'),
  stompEmPick: missionHook('stompEmPick'),
  stompEmScore: missionHook('stompEmScore'),
  supplyLines: missionHook('supplyLines'),
  sweepingRaidEndgameBonus: missionHook('sweepingRaidEndgameBonus'),
  wrathOfTheEmperor: missionHook('wrathOfTheEmperor'),
  // astra-militarum (docs/spec/factions/astra-militarum.md §7): voiceOfCommand, commandLaurels, gunneryOfficer, requireActiveOrder,
  // wargearBearerAlive, holdTheLine, methodicalDestructionPick/Score, sendInTheNextWave, bringItDown, artilleryStrike
  ...astraMilitarumHooks(),
  // tau-empire (docs/spec/factions/tau-empire.md §7): forTheGreaterGood, forwardObservers, coordinatedLeadership, coverFire, ds8SupportTurret,
  // kauyonLure, leadershipCaste, rapidRepositioning, laserMarkedTargets
  ...tauEmpireHooks(),
  // genestealer-cults (docs/spec/factions/genestealer-cults.md §7): cultAmbush, defendTheMagus, returnToTheShadows, riseUp, willOfThePatriarch
  ...genestealerCultsHooks(),
}

export type { ChooseOptionDecision }
