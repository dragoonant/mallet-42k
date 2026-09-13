// Stratagems, reaction windows and Command Re-roll (10-rules §11, R-11.5, 00-arch §3). Owner: W1-F.
// ctx.window() calls `openWindow` for each player in order; this service decides whether the player has an affordable,
// legal stratagem (or reaction) for that window and raises the stratagemWindow / reactionWindow / commandReroll
// decision. It also answers those decisions (useStratagem / commandReroll / pass): pay CP (CpChanged), record
// Player.stratagemUses / oncePerBattleUsed, apply the effect (services.effects.grant, code hooks, reactions such as
// Fire Overwatch recorded for the phase modules — see code-hooks.ts `pendingReactions`) and emit StratagemUsed /
// StratagemWindowClosed. R-1.6: a die already re-rolled (DiceRoll.rerolled) cannot take Command Re-roll (E_NOT_AN_OPTION).
//
// Per (window, player, key) occurrence: reactionWindow first (only reaction stratagems as options), then
// stratagemWindow (every other usable stratagem). After a stratagem is used the same kind of window is offered again
// while something is still usable; a pass moves on (reaction → stratagem window → done).
import type { Effect, TargetSpec, TimingWindowId } from '../data/types'
import type { Action, StratagemTargets, UseStratagemAction } from './actions'
import { codeHooks, pushReaction, type EngineCodeHook, type StratagemEnv, type StratagemTuple } from './code-hooks'
import { canReroll } from './dice'
import { distance, withinEngagementRange, withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from './geometry'
import { evaluateCondition, hookService } from './hooks-impl'
import { leaderService } from './leaders'
import { losService } from './los'
import type { DecisionHandler, DecisionSpec, EngineContext, Services, WindowTrigger } from './modules'
import { unitModels } from './state'
import type {
  CommandRerollDecision, DecisionOption, DiceRoll, GameState, Model, PendingDecision, PlayerId, Rejection, RuntimeStratagem,
  StratagemId, Unit, UnitId,
} from './types'

export { pendingReactions, consumeReaction, eligibleToShootNow } from './code-hooks'
export type { ReactionRequest } from './code-hooks'

export interface StratagemService extends DecisionHandler {
  // raise a decision for `player` at this window occurrence if any stratagem/reaction is usable; true = decision pending.
  // The core has already recorded the occurrence in phaseState.windowsOpened, so this is called at most once per
  // (window, player, key).
  openWindow(ctx: EngineContext, window: TimingWindowId, player: PlayerId, key: string, trigger?: WindowTrigger): boolean
  // stratagems the player could use now (CP, once-per limits, `who`, `condition`, targets available)
  usable(state: GameState, player: PlayerId, window: TimingWindowId, trigger?: WindowTrigger): StratagemId[]
}

// additions (W1-F); optional on StratagemService so existing stubs stay valid, always present on `stratagemService`
export interface StratagemExtras {
  validate(state: GameState, action: Action, pending: PendingDecision): Rejection | null
  // every legal (stratagem, targets) pair as ready-made useStratagem actions (decisionId empty)
  options(state: GameState, player: PlayerId, window: TimingWindowId, trigger?: WindowTrigger): UseStratagemAction[]
  // modules call this when targets are declared so `targetedByAttack` survives until the attacks are resolved
  // (Krump da Gitz! at shooting.attacksResolved); phaseState.attack.targetUnitIds and trigger.targetUnitId also count
  recordTargets(ctx: EngineContext, attackerUnitId: UnitId, targetUnitIds: UnitId[]): void
}
export interface StratagemService extends Partial<StratagemExtras> {}

const COMMAND_REROLL_PURPOSES = new Set(['advance', 'charge', 'desperateEscape', 'hazardous', 'hit', 'wound', 'damage', 'save', 'attacks'])
// re-rolled as a whole (R-1.5; STRAT-006: a charge roll re-rolls both dice); fast-rolled per-die rolls pick one die
const WHOLE_ROLL_PURPOSES = new Set(['advance', 'charge', 'damage', 'attacks'])
const BATTLE_PHASES = new Set(['command', 'movement', 'shooting', 'charge', 'fight'])

type Stage = 'reaction' | 'strat'
interface WindowRecord { window: TimingWindowId; key: string; player: PlayerId; trigger: WindowTrigger; stage: Stage }

const WIN_PREFIX = 'stratwin='
const TARGETED_PREFIX = 'targeted:'

// services are static configuration; validate() has no context, so it uses the table seen last (or the defaults)
let servicesRef: Services | null = null
function servicesFor(ctx?: EngineContext): Services {
  if (ctx) servicesRef = ctx.services
  return servicesRef ?? ({ los: losService, hooks: hookService } as unknown as Services)
}

function currentWindow(state: GameState): WindowRecord | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(WIN_PREFIX))
  return m ? (JSON.parse(m.slice(WIN_PREFIX.length)) as WindowRecord) : null
}

function setCurrent(state: GameState, rec: WindowRecord | null): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(WIN_PREFIX))
  if (rec) state.phaseState.marks.push(WIN_PREFIX + JSON.stringify(rec))
}

const windowsOf = (s: RuntimeStratagem): TimingWindowId[] => (Array.isArray(s.window) ? s.window : [s.window])
const asList = (e: Effect | Effect[] | undefined): Effect[] => (e === undefined ? [] : Array.isArray(e) ? e : [e])
const codeOf = (s: RuntimeStratagem): EngineCodeHook | null => (s.code ? (codeHooks[s.code] ?? null) : null)
const isCommandReroll = (s: RuntimeStratagem): boolean => windowsOf(s).includes('any.rollMade')

function ownedBy(state: GameState, s: RuntimeStratagem, player: PlayerId): boolean {
  return s.faction === 'core' || s.faction === state.players[player].faction
}

function commandRerollStratagem(state: GameState): RuntimeStratagem | null {
  return Object.values(state.stratagems).find(isCommandReroll) ?? null
}

function limitUsed(state: GameState, player: PlayerId, s: RuntimeStratagem): boolean {
  const p = state.players[player]
  const uses = p.stratagemUses.filter((u) => u.stratagemId === s.id)
  // R-11.1: once per phase per player (a phase in each player's turn is distinct) for every stratagem
  if (uses.some((u) => u.round === state.round && u.turn === state.activePlayer && u.phase === state.phase)) return true
  switch (s.limit) {
    case 'oncePerTurn': return uses.some((u) => u.round === state.round && u.turn === state.activePlayer)
    case 'oncePerRound': return uses.some((u) => u.round === state.round)
    case 'oncePerBattle': return p.oncePerBattleUsed.includes(s.id) || uses.length > 0
    default: return false
  }
}

function timingOk(state: GameState, player: PlayerId, s: RuntimeStratagem, window: TimingWindowId, trigger: WindowTrigger): boolean {
  if (!windowsOf(s).includes(window)) return false
  // R-1.8: phase-specific windows only inside that phase (no Shooting-phase stratagems during Overwatch)
  const prefix = window.split('.')[0]
  if (BATTLE_PHASES.has(prefix) && prefix !== state.phase) return false
  const triggerOwner = trigger.unitId ? state.units[trigger.unitId]?.player : undefined
  if (s.who === 'active' && player !== state.activePlayer) {
    // STRAT-018 [interp]: Tank Shock also follows a Heroic Intervention charge by the reacting player's VEHICLE
    if (!(s.code === 'tankShockMortalWounds' && triggerOwner === player)) return false
  }
  if (s.who === 'reactive' && player === state.activePlayer) return false
  return evaluateCondition({ state, holder: null, player, attack: null, roll: null, weapon: null }, s.condition)
}

function expandSpecs(s: RuntimeStratagem): TargetSpec[] {
  const out: TargetSpec[] = []
  for (const spec of s.targets) for (let i = 0; i < Math.max(1, spec.count ?? 1); i++) out.push(spec)
  return out
}

// ---------- target candidates ----------
function boardModelsOfUnit(state: GameState, unitId: UnitId): Model[] {
  return leaderService.halves(state, unitId).flatMap((id) => state.units[id].location === 'board' ? unitModels(state, id) : [])
}

function footprintsOf(state: GameState, id: string): Model[] {
  if (state.models[id]) return [state.models[id]]
  return state.units[id] ? boardModelsOfUnit(state, id) : []
}

function withinInches(a: Model[], b: Model[], inches: number): boolean {
  if (inches <= 1) return a.some((x) => b.some((y) => withinEngagementRange(x, y)))
  return a.some((x) => b.some((y) => distance(x, y) <= inches + 1e-6))
}

function targetedSet(state: GameState, trigger: WindowTrigger): Set<UnitId> {
  const out = new Set<UnitId>()
  if (trigger.targetUnitId) out.add(trigger.targetUnitId)
  const attack = state.phaseState.attack
  if (attack && (!trigger.unitId || leaderService.sameUnit(state, attack.attackerUnitId, trigger.unitId))) for (const t of attack.targetUnitIds) out.add(t)
  for (const m of state.phaseState.marks) {
    if (!m.startsWith(TARGETED_PREFIX)) continue
    const [attacker, target] = m.slice(TARGETED_PREFIX.length).split('>')
    if (!trigger.unitId || leaderService.sameUnit(state, attacker, trigger.unitId)) out.add(target)
  }
  return out
}

function stateOk(env: StratagemEnv, u: Unit, spec: TargetSpec): boolean {
  const { state, trigger } = env
  const halves = leaderService.halves(state, u.id).map((id) => state.units[id])
  switch (spec.state) {
    case undefined: return true
    case 'selectedToShoot': case 'selectedToFight': case 'chargedThisTurn': case 'justMoved':
      return leaderService.sameUnit(state, u.id, trigger.unitId)
    case 'notYetFought': {
      const fight = state.phaseState.fight
      return halves.every((h) => !h.turn.foughtThisPhase && !(fight?.fought.includes(h.id)) && fight?.currentUnitId !== h.id)
    }
    case 'targetedByAttack': {
      const set = targetedSet(state, trigger)
      return halves.some((h) => set.has(h.id))
    }
    case 'justDestroyed': return u.id === trigger.unitId
    case 'inEngagement': {
      const t = trigger.unitId ? state.units[trigger.unitId] : null
      if (t && t.player !== u.player) return leaderService.unitsInEngagement(state, u.id, t.id)
      return leaderService.inEngagementWithEnemy(state, u.id)
    }
    case 'belowHalf': return leaderService.isBelowHalfStrength(state, u.id)
    case 'battleShocked': return halves.some((h) => h.battleShocked)
  }
}

function withinOk(env: StratagemEnv, models: Model[], spec: TargetSpec, prevId: string | null): boolean {
  const w = spec.filter?.within
  if (!w) return true
  const { state } = env
  switch (w.of) {
    case 'previousTarget': return prevId !== null && withinInches(models, footprintsOf(state, prevId), w.inches)
    case 'self': return !!env.trigger.unitId && withinInches(models, footprintsOf(state, env.trigger.unitId), w.inches)
    case 'objective': case 'controlledObjective': {
      const radius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
      return Object.values(state.objectives).some((o) => !o.removed && (w.of === 'objective' || o.controller === env.player)
        && models.some((m) => withinObjectiveRange(m, o, 0, w.inches ?? OBJECTIVE_RANGE, radius)))
    }
  }
}

function keywordOk(state: GameState, unitIds: UnitId[], spec: TargetSpec): boolean {
  const kw = spec.filter?.keyword
  const not = spec.filter?.notKeyword
  // [interp] a unit "has" a filter keyword when every half of an attached unit has it; notKeyword excludes any half
  if (kw && !unitIds.every((id) => hookService.keywordsFor(state, id).includes(kw))) return false
  if (not && unitIds.some((id) => hookService.keywordsFor(state, id).includes(not))) return false
  return true
}

function candidates(env: StratagemEnv, spec: TargetSpec, prevId: string | null): string[] {
  const { state, player } = env
  const code = codeOf(env.stratagem)
  const friendly = spec.owner === 'friendly'
  const units = Object.values(state.units).filter((u) => (u.player === player) === friendly)
  const out: string[] = []
  if (spec.role === 'unit') {
    for (const u of units) {
      if (spec.state === 'justDestroyed') {
        if (u.location !== 'destroyed') continue
      } else if (friendly && code?.reserves) {
        if (u.location !== 'reserves') continue
      } else if (u.location !== 'board') continue
      // attached pairs are offered once, under the bodyguard id
      if (u.bodyguardUnitId && state.units[u.bodyguardUnitId]?.location === u.location) continue
      const halves = leaderService.halves(state, u.id).filter((id) => state.units[id].location === u.location)
      if (!keywordOk(state, halves, spec)) continue
      // R-11.2: a player cannot target their own Battle-shocked unit with a stratagem
      if (friendly && halves.some((id) => state.units[id].battleShocked)) continue
      if (!stateOk(env, u, spec)) continue
      if (u.location === 'board' && !withinOk(env, boardModelsOfUnit(state, u.id), spec, prevId)) continue
      if (u.location !== 'board' && spec.filter?.within) continue
      out.push(u.id)
    }
  } else {
    for (const u of units) {
      if (u.location !== 'board') continue
      if (!keywordOk(state, [u.id], spec)) continue
      if (friendly && leaderService.halves(state, u.id).some((id) => state.units[id].battleShocked)) continue
      if (!stateOk(env, u, spec)) continue
      for (const m of unitModels(state, u.id)) if (withinOk(env, [m], spec, prevId)) out.push(m.id)
    }
  }
  return out
}

function unitOfTargetId(state: GameState, id: string): UnitId | null {
  return state.models[id]?.unitId ?? (state.units[id] ? id : null)
}

// rules not expressible in TargetSpec that hold for every stratagem
function genericChecks(env: StratagemEnv, tuple: StratagemTuple): boolean {
  const { state, stratagem: s, trigger } = env
  const first = tuple.ids[0] ? unitOfTargetId(state, tuple.ids[0]) : null
  // Insane Bravery: the unit about to take this Battle-shock test
  if (env.window === 'command.battleShock' && trigger.unitId && first && !leaderService.sameUnit(state, first, trigger.unitId)) return false
  // Display of Might — Break Their Spirit (11-combat-patrol CP §2.5 mission 6)
  for (const rule of state.mission.rules) {
    if (rule.code !== 'breakTheirSpirit') continue
    const params = rule.params ?? {}
    if ((params.restrictsStratagem ?? 'core.s.insane-bravery') !== s.id || !first) continue
    const warlord = state.units[state.players[env.player].warlordUnitId]
    if (!warlord || warlord.location !== 'board') return false
    const max = (params.maxRangeFromWarlordInches as number | undefined) ?? 6
    if (!leaderService.sameUnit(state, first, warlord.id) && leaderService.unitDistance(state, first, warlord.id) > max + 1e-6) return false
  }
  // R-5.9 surge moves (Krump da Gitz!): not while in Engagement Range, once per phase
  if (asList(s.effect).some((e) => e.move?.kind === 'surge') && first) {
    if (leaderService.inEngagementWithEnemy(state, first)) return false
    if (leaderService.halves(state, first).some((id) => state.units[id].turn.surgeMovedThisPhase)) return false
  }
  return true
}

function enumerate(env: StratagemEnv, limit = 400): StratagemTuple[] {
  const specs = expandSpecs(env.stratagem)
  const code = codeOf(env.stratagem)
  const out: StratagemTuple[] = []
  const pick = (i: number, ids: string[]) => {
    if (out.length >= limit) return
    if (i === specs.length) {
      const objectiveIds = code?.needsObjective ? Object.values(env.state.objectives).filter((o) => !o.removed).map((o) => o.id) : [null]
      for (const objectiveId of objectiveIds) {
        const tuple = { ids: [...ids], objectiveId }
        if (genericChecks(env, tuple) && (!code?.check || code.check(env, tuple))) out.push(tuple)
      }
      return
    }
    const prev = i > 0 ? ids[i - 1] : null
    for (const c of candidates(env, specs[i], prev)) {
      if (ids.includes(c)) continue
      pick(i + 1, [...ids, c])
    }
  }
  pick(0, [])
  return out
}

function tupleToTargets(state: GameState, s: RuntimeStratagem, t: StratagemTuple): StratagemTargets {
  const specs = expandSpecs(s)
  const unitIds: UnitId[] = []
  const modelIds: string[] = []
  specs.forEach((spec, i) => (spec.role === 'unit' ? unitIds : modelIds).push(t.ids[i]))
  void state
  return { unitIds, modelIds, ...(t.objectiveId ? { objectiveId: t.objectiveId } : {}) }
}

function targetsToTuple(s: RuntimeStratagem, targets: StratagemTargets): StratagemTuple | null {
  const units = [...(targets.unitIds ?? [])]
  const models = [...(targets.modelIds ?? [])]
  const ids: string[] = []
  for (const spec of expandSpecs(s)) {
    const next = spec.role === 'unit' ? units.shift() : models.shift()
    if (next === undefined) return null
    ids.push(next)
  }
  if (units.length > 0 || models.length > 0) return null
  return { ids, objectiveId: targets.objectiveId ?? null }
}

function sameTuple(a: StratagemTuple, b: StratagemTuple): boolean {
  return a.objectiveId === b.objectiveId && a.ids.length === b.ids.length && a.ids.every((x, i) => x === b.ids[i])
}

interface Offer { stratagem: RuntimeStratagem; tuple: StratagemTuple }

function offersFor(state: GameState, services: Services, player: PlayerId, window: TimingWindowId, trigger: WindowTrigger, stage: Stage | null): Offer[] {
  const p = state.players[player]
  const out: Offer[] = []
  for (const s of Object.values(state.stratagems)) {
    if (isCommandReroll(s) || !ownedBy(state, s, player)) continue
    const code = codeOf(s)
    if (stage !== null && (stage === 'reaction') !== !!code?.reaction) continue
    if (s.cost > p.cp || !timingOk(state, player, s, window, trigger) || limitUsed(state, player, s)) continue
    const env: StratagemEnv = { state, services, player, stratagem: s, window, trigger }
    for (const tuple of enumerate(env)) out.push({ stratagem: s, tuple })
  }
  return out
}

function useAction(state: GameState, player: PlayerId, o: Offer): UseStratagemAction {
  return { type: 'useStratagem', player, decisionId: '', stratagemId: o.stratagem.id, targets: tupleToTargets(state, o.stratagem, o.tuple) }
}

function optionOf(state: GameState, player: PlayerId, o: Offer): DecisionOption {
  const ids = [...o.tuple.ids, ...(o.tuple.objectiveId ? [o.tuple.objectiveId] : [])]
  return { id: `${o.stratagem.id}|${ids.join(',')}`, label: `${o.stratagem.name} (${o.stratagem.cost} CP): ${ids.join(', ')}`, action: useAction(state, player, o) }
}

function offer(ctx: EngineContext, rec: WindowRecord): boolean {
  const s = ctx.state
  const services = servicesFor(ctx)
  let stage = rec.stage
  if (stage === 'reaction') {
    const offers = offersFor(s, services, rec.player, rec.window, rec.trigger, 'reaction')
    if (offers.length > 0) {
      const usable = [...new Set(offers.map((o) => o.stratagem.id))]
      // several reaction kinds in one window (e.g. Heroic Intervention alongside another reaction): the context
      // names the most specific one (the stratagem with the fewest windows); options still carry every reaction
      const primary = [...offers].sort((a, b) => windowsOf(a.stratagem).length - windowsOf(b.stratagem).length)[0].stratagem
      const reaction = codeOf(primary)!.reaction!
      const eligibleUnits = [...new Set(offers.filter((o) => o.stratagem.id === primary.id).map((o) => {
        const specs = expandSpecs(o.stratagem)
        const i = specs.findIndex((sp) => sp.owner === 'friendly')
        return unitOfTargetId(s, o.tuple.ids[Math.max(0, i)]) as UnitId
      }))]
      ctx.emit({ type: 'StratagemWindowOpened', window: rec.window, usable, player: rec.player })
      ctx.decide({
        kind: 'reactionWindow', player: rec.player, window: rec.window, canPass: true,
        context: { enemyUnitId: rec.trigger.unitId ?? null, reaction, eligibleUnits },
        options: offers.map((o) => optionOf(s, rec.player, o)),
      })
      setCurrent(s, { ...rec, stage: 'reaction' })
      return true
    }
    stage = 'strat'
  }
  const offers = offersFor(s, services, rec.player, rec.window, rec.trigger, 'strat')
  if (offers.length === 0) {
    setCurrent(s, null)
    return false
  }
  const usable = [...new Set(offers.map((o) => o.stratagem.id))]
  ctx.emit({ type: 'StratagemWindowOpened', window: rec.window, usable, player: rec.player })
  ctx.decide({
    kind: 'stratagemWindow', player: rec.player, window: rec.window, canPass: true,
    context: { trigger: { unitId: rec.trigger.unitId ?? null, targetUnitId: rec.trigger.targetUnitId ?? null, rollId: rec.trigger.rollId ?? null }, usable },
    options: offers.map((o) => optionOf(s, rec.player, o)),
  })
  setCurrent(s, { ...rec, stage })
  return true
}

// ---------- Command Re-roll ----------
interface RerollOption { indexes: number[]; dieIndex?: number }

function rerollOptions(roll: DiceRoll): { options: RerollOption[]; selectable: boolean } {
  if (!roll.commandRerollable || !COMMAND_REROLL_PURPOSES.has(roll.purpose)) return { options: [], selectable: false }
  if (roll.dice.length === 1 || WHOLE_ROLL_PURPOSES.has(roll.purpose)) {
    const all = roll.dice.map((_, i) => i)
    return { options: all.every((i) => canReroll(roll, i)) ? [{ indexes: all }] : [], selectable: false }
  }
  return { options: roll.dice.map((_, i) => i).filter((i) => canReroll(roll, i)).map((i) => ({ indexes: [i], dieIndex: i })), selectable: true }
}

function commandRerollBlocked(state: GameState, player: PlayerId): Rejection | null {
  const s = commandRerollStratagem(state)
  const p = state.players[player]
  if (!s || !ownedBy(state, s, player)) return { code: 'E_NOT_AN_OPTION', reason: 'Command Re-roll is not available' }
  if (p.commandRerollLocked) return { code: 'E_NOT_AN_OPTION', reason: 'Command Re-roll is locked for this player (Sabotage Enemy Comms)' }
  if (limitUsed(state, player, s)) return { code: 'E_STRATAGEM_USED', reason: 'Command Re-roll was already used this phase' }
  if (p.cp < s.cost) return { code: 'E_INSUFFICIENT_CP', reason: `Command Re-roll costs ${s.cost} CP` }
  return null
}

// R-11.2: no stratagem (Command Re-roll included) for a roll made for the player's own Battle-shocked unit
function rollForShockedUnit(state: GameState, player: PlayerId, roll: DiceRoll): boolean {
  if (!roll.unitId || state.units[roll.unitId]?.player !== player) return false
  return leaderService.halves(state, roll.unitId).some((h) => state.units[h]?.battleShocked)
}

function rollFor(state: GameState, key: string, trigger?: WindowTrigger): DiceRoll | null {
  const id = trigger?.rollId ?? key
  const last = state.phaseState.lastRoll
  return last && last.id === id ? last : null
}

function openCommandReroll(ctx: EngineContext, player: PlayerId, key: string, trigger?: WindowTrigger): boolean {
  const s = ctx.state
  const roll = rollFor(s, key, trigger)
  if (!roll || roll.player !== player || commandRerollBlocked(s, player) || rollForShockedUnit(s, player, roll)) return false
  const { options, selectable } = rerollOptions(roll)
  if (options.length === 0) return false
  const strat = commandRerollStratagem(s)!
  ctx.emit({ type: 'StratagemWindowOpened', window: 'any.rollMade', usable: [strat.id], player })
  const spec: DecisionSpec = {
    kind: 'commandReroll', player, window: 'any.rollMade', canPass: true,
    context: { roll: structuredClone(roll), selectableDice: selectable },
    options: options.map((o) => ({
      id: o.dieIndex === undefined ? 'reroll' : `reroll:${o.dieIndex}`,
      label: o.dieIndex === undefined ? `Command Re-roll (${roll.purpose})` : `Command Re-roll die ${o.dieIndex + 1} (${roll.dice[o.dieIndex]})`,
      action: { type: 'commandReroll', player, decisionId: '', rollId: roll.id, ...(o.dieIndex === undefined ? {} : { dieIndex: o.dieIndex }) },
    })),
  }
  ctx.decide(spec)
  setCurrent(s, { window: 'any.rollMade', key, player, trigger: trigger ?? { rollId: roll.id }, stage: 'strat' })
  return true
}

function validateCommandReroll(state: GameState, action: { rollId: string; dieIndex?: number; player: PlayerId }, pending: CommandRerollDecision): Rejection | null {
  const blocked = commandRerollBlocked(state, action.player)
  if (blocked) return blocked
  const roll = state.phaseState.lastRoll
  if (action.rollId !== pending.context.roll.id || !roll || roll.id !== action.rollId) return { code: 'E_NOT_AN_OPTION', reason: 'not the roll this decision concerns' }
  if (rollForShockedUnit(state, action.player, roll)) return { code: 'E_INVALID_TARGET', reason: 'R-11.2: cannot use Command Re-roll on a roll for your own Battle-shocked unit' }
  const { options } = rerollOptions(roll)
  const ok = options.some((o) => o.dieIndex === action.dieIndex)
  return ok ? null : { code: 'E_NOT_AN_OPTION', reason: 'that die cannot be re-rolled (R-1.6)' }
}

// ---------- paying and applying ----------
function pay(ctx: EngineContext, player: PlayerId, s: RuntimeStratagem, targets: StratagemTargets): void {
  const st = ctx.state
  const p = st.players[player]
  if (s.cost !== 0) {
    p.cp -= s.cost
    ctx.emit({ type: 'CpChanged', delta: -s.cost, total: p.cp, source: s.id, player })
  }
  p.stratagemUses.push({ stratagemId: s.id, round: st.round, turn: st.activePlayer, phase: st.phase })
  if (s.limit === 'oncePerBattle' && !p.oncePerBattleUsed.includes(s.id)) p.oncePerBattleUsed.push(s.id)
  ctx.emit({ type: 'StratagemUsed', stratagemId: s.id, cost: s.cost, targets: { unitIds: targets.unitIds ?? [], modelIds: targets.modelIds ?? [], objectiveId: targets.objectiveId ?? null }, player })
}

function applyStratagem(ctx: EngineContext, rec: WindowRecord, s: RuntimeStratagem, tuple: StratagemTuple): void {
  const st = ctx.state
  const env: StratagemEnv = { state: st, services: servicesFor(ctx), player: rec.player, stratagem: s, window: rec.window, trigger: rec.trigger }
  const code = codeOf(s)
  pay(ctx, rec.player, s, tupleToTargets(st, s, tuple))
  const first = tuple.ids[0] ? unitOfTargetId(st, tuple.ids[0]) : null
  if (!code?.grantsItself && first) {
    const lasting: Effect[] = []
    for (const e of asList(s.effect)) {
      if (e.move) {
        const { total } = ctx.rollExpr(e.move.distance, { purpose: 'stratagem', player: rec.player, unitId: first, commandRerollable: false })
        for (const id of leaderService.halves(st, first)) if (e.move.kind === 'surge') st.units[id].turn.surgeMovedThisPhase = true
        const toward = s.params?.asCloseAsPossibleTo === 'target' ? (rec.trigger.unitId ?? null) : null
        pushReaction(ctx, { kind: 'surge', stratagemId: s.id, player: rec.player, unitId: first, enemyUnitId: toward, window: rec.window, distance: total })
        continue
      }
      const { cp, vp, ...rest } = e
      if (cp !== undefined || vp !== undefined) {
        ctx.services.hooks.apply(ctx, { kind: 'stratagem', id: s.id, unitId: first, modelId: null }, { kind: 'request', ...(cp !== undefined ? { cp } : {}), ...(vp !== undefined ? { vp: { amount: vp, source: s.id } } : {}) })
      }
      if (Object.keys(rest).some((k) => k !== 'when')) lasting.push(rest)
    }
    if (lasting.length > 0) {
      ctx.services.effects.grant(ctx, first, lasting, {
        sourceAbilityId: s.id, sourceUnitId: first, scope: s.scope ?? { who: 'self' }, duration: s.duration ?? 'instant', when: s.when ?? null,
      })
    }
  }
  code?.apply?.(ctx, env, tuple)
}

function validateUse(state: GameState, services: Services, action: UseStratagemAction, pending: PendingDecision, rec: WindowRecord): Rejection | { stratagem: RuntimeStratagem; tuple: StratagemTuple } {
  const s = state.stratagems[action.stratagemId]
  if (!s || !ownedBy(state, s, action.player) || isCommandReroll(s)) return { code: 'E_NOT_AN_OPTION', reason: `stratagem ${action.stratagemId} is not available to player ${action.player}` }
  const code = codeOf(s)
  if ((pending.kind === 'reactionWindow') !== !!code?.reaction) return { code: 'E_NOT_AN_OPTION', reason: `${s.name} is not offered in a ${pending.kind}` }
  if (!timingOk(state, action.player, s, rec.window, rec.trigger)) return { code: 'E_NOT_AN_OPTION', reason: `${s.name} cannot be used in ${rec.window} now` }
  if (limitUsed(state, action.player, s)) return { code: 'E_STRATAGEM_USED', reason: `${s.name} was already used (${s.limit ?? 'oncePerPhase'})` }
  if (state.players[action.player].cp < s.cost) return { code: 'E_INSUFFICIENT_CP', reason: `${s.name} costs ${s.cost} CP` }
  const tuple = targetsToTuple(s, action.targets)
  if (!tuple) return { code: 'E_INVALID_TARGET', reason: 'targets do not match the stratagem target specification' }
  for (const id of tuple.ids) {
    const u = unitOfTargetId(state, id)
    if (!u) return { code: 'E_INVALID_TARGET', reason: `unknown target ${id}` }
    if (state.units[u].player === action.player && leaderService.halves(state, u).some((h) => state.units[h].battleShocked)) {
      return { code: 'E_INVALID_TARGET', reason: 'R-11.2: cannot target your own Battle-shocked unit with a stratagem' }
    }
  }
  const env: StratagemEnv = { state, services, player: action.player, stratagem: s, window: rec.window, trigger: rec.trigger }
  if (!enumerate(env, 10_000).some((t) => sameTuple(t, tuple))) return { code: 'E_INVALID_TARGET', reason: `illegal targets for ${s.name}` }
  return { stratagem: s, tuple }
}

function recordOf(state: GameState, pending: PendingDecision): WindowRecord {
  const cur = currentWindow(state)
  if (cur && cur.window === pending.window && cur.player === pending.player) return cur
  const trigger: WindowTrigger = pending.kind === 'stratagemWindow'
    ? { ...pending.context.trigger }
    : pending.kind === 'reactionWindow' ? { unitId: pending.context.enemyUnitId } : {}
  return { window: pending.window, key: '', player: pending.player, trigger, stage: pending.kind === 'reactionWindow' ? 'reaction' : 'strat' }
}

export const stratagemService: StratagemService & StratagemExtras = {
  openWindow(ctx, window, player, key, trigger) {
    const s = ctx.state
    servicesFor(ctx)
    if (s.pending) return true
    if (window === 'any.rollMade') return openCommandReroll(ctx, player, key, trigger)
    // window-keyed ability picks deferred because another decision was pending when the occurrence started
    const hooks = ctx.services.hooks
    if (typeof hooks.offerPicks === 'function' && hooks.offerPicks(ctx, window, key)) {
      const opened = s.phaseState.windowsOpened
      for (let i = opened.length - 1; i >= 0; i--) {
        if (opened[i].window === window && opened[i].player === player && opened[i].key === key) { opened.splice(i, 1); break }
      }
      return true
    }
    return offer(ctx, { window, key, player, trigger: trigger ?? {}, stage: 'reaction' })
  },

  usable(state, player, window, trigger) {
    if (window === 'any.rollMade') {
      const roll = rollFor(state, '', trigger)
      const strat = commandRerollStratagem(state)
      return roll && strat && roll.player === player && !commandRerollBlocked(state, player) && !rollForShockedUnit(state, player, roll) && rerollOptions(roll).options.length > 0 ? [strat.id] : []
    }
    return [...new Set(offersFor(state, servicesFor(), player, window, trigger ?? {}, null).map((o) => o.stratagem.id))]
  },

  options(state, player, window, trigger) {
    return offersFor(state, servicesFor(), player, window, trigger ?? {}, null).map((o) => useAction(state, player, o))
  },

  recordTargets(ctx, attackerUnitId, targetUnitIds) {
    for (const t of targetUnitIds) {
      const mark = `${TARGETED_PREFIX}${attackerUnitId}>${t}`
      if (!ctx.state.phaseState.marks.includes(mark)) ctx.state.phaseState.marks.push(mark)
    }
  },

  validate(state, action, pending) {
    if (action.type === 'pass') return null
    if (pending.kind === 'commandReroll') {
      if (action.type !== 'commandReroll') return { code: 'E_NOT_AN_OPTION', reason: 'commandReroll expected' }
      return validateCommandReroll(state, action, pending)
    }
    if (action.type !== 'useStratagem') return { code: 'E_NOT_AN_OPTION', reason: 'useStratagem expected' }
    const r = validateUse(state, servicesFor(), action, pending, recordOf(state, pending))
    return 'code' in r ? r : null
  },

  handle(ctx, action, pending) {
    const s = ctx.state
    servicesFor(ctx)
    if (pending.kind === 'commandReroll') {
      if (action.type === 'pass') {
        ctx.emit({ type: 'StratagemWindowClosed', window: 'any.rollMade', used: null, player: pending.player })
        setCurrent(s, null)
        return
      }
      if (action.type !== 'commandReroll') return { code: 'E_NOT_AN_OPTION', reason: 'commandReroll expected' }
      const rej = validateCommandReroll(s, action, pending)
      if (rej) return rej
      const strat = commandRerollStratagem(s)!
      const roll = s.phaseState.lastRoll as DiceRoll
      pay(ctx, pending.player, strat, { unitIds: roll.unitId ? [roll.unitId] : [], modelIds: roll.modelId ? [roll.modelId] : [] })
      const indexes = action.dieIndex === undefined ? roll.dice.map((_, i) => i) : [action.dieIndex]
      ctx.reroll(roll, indexes, 'commandReroll')
      ctx.emit({ type: 'StratagemWindowClosed', window: 'any.rollMade', used: strat.id, player: pending.player })
      setCurrent(s, null)
      return
    }
    if (pending.kind !== 'stratagemWindow' && pending.kind !== 'reactionWindow') return { code: 'E_NOT_AN_OPTION', reason: 'stratagems: unexpected decision' }
    const rec = recordOf(s, pending)
    if (action.type === 'pass') {
      ctx.emit({ type: 'StratagemWindowClosed', window: rec.window, used: null, player: rec.player })
      if (pending.kind === 'reactionWindow') offer(ctx, { ...rec, stage: 'strat' })
      else setCurrent(s, null)
      return
    }
    if (action.type !== 'useStratagem') return { code: 'E_NOT_AN_OPTION', reason: 'useStratagem expected' }
    const v = validateUse(s, servicesFor(ctx), action, pending, rec)
    if ('code' in v) return v
    applyStratagem(ctx, rec, v.stratagem, v.tuple)
    ctx.emit({ type: 'StratagemWindowClosed', window: rec.window, used: v.stratagem.id, player: rec.player })
    if (!s.pending) offer(ctx, { ...rec, stage: pending.kind === 'reactionWindow' ? 'reaction' : 'strat' })
    else setCurrent(s, null)
  },
}
