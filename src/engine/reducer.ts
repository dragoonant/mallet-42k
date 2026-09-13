// Reducer core (W1-A): step / validate / legalActions / replay / view / save / load / undo, the EngineContext handed to
// modules, the phase-turn-round state machine with its auto-advance loop, generic action validation and rejection,
// the action log and state hash. Module contract: src/engine/phases/README.md.
import type { DataBundle, DiceExpr, TimingWindowId } from '../data/types'
import type { Action, ActionType, ModelPlacement } from './actions'
import { applyReroll, makeRoll, parseDiceExpr, rollSum, type RollSpec } from './dice'
import type { ActionRejected, EventBase, GameEvent } from './events'
import { isCoherent } from './geometry'
import {
  isBattlePhase, nextPhase, otherPlayer, type BattlePhase, type DecisionHandler, type DecisionSpec, type EngineContext,
  type EventInput, type ModuleTable, type PhaseModule, type WindowTrigger,
} from './modules'
import { restoreRng, type Rng } from './rng'
import { cloneForStep, createGameState, emptyPhaseState, emptyTurnState, hashState, removeModel, unitModelsForCoherency } from './state'
import {
  EngineInvariantError,
  type DecisionOption, type DiceRoll, type GameResult, type GameSetup, type GameState, type PendingDecision, type PlayerId,
  type PlayerView, type Rejection, type SaveFile, type Unit,
} from './types'
import { ENGINE_VERSION, majorVersion } from './version'

export interface StepResult {
  // same reference as the input when rejected
  state: GameState
  events: GameEvent[]
  // null only when state.phase === 'ended'
  pending: PendingDecision | null
  rejection?: Rejection
}

export interface UndoOptions {
  // hotseat: true; vs AI: false — an action that rolled dice cannot be undone (00-arch §6)
  allowDice?: boolean
}

export interface EngineApi {
  createGame(setup: GameSetup, seed: string, bundle?: DataBundle): StepResult
  step(state: GameState, action: Action, rng?: Rng): StepResult
  validate(state: GameState, action: Action): Rejection | null
  legalActions(state: GameState, pending: PendingDecision): Action[] | null
  replay(setup: GameSetup, seed: string, actions: Action[], bundle?: DataBundle): StepResult
  view(state: GameState, player: PlayerId): PlayerView
  save(state: GameState): SaveFile
  load(save: SaveFile, bundle?: DataBundle): StepResult
  // null when refused (nothing to undo, or dice were rolled and allowDice is false)
  undo(state: GameState, options?: UndoOptions, bundle?: DataBundle): StepResult | null
  readonly modules: ModuleTable
}

// ---------- data bundle registry (the engine never imports data; the host registers the loaded bundle once) ----------
let registeredBundle: DataBundle | null = null
export function registerDataBundle(bundle: DataBundle | null): void { registeredBundle = bundle }
export function getDataBundle(): DataBundle | null { return registeredBundle }
function requireBundle(bundle?: DataBundle): DataBundle {
  const b = bundle ?? registeredBundle
  if (!b) throw new EngineInvariantError('no data bundle: pass one to createGame/replay or call registerDataBundle()')
  return b
}

// ---------- context ----------
interface StepRuntime { seq: number; events: GameEvent[]; diceRollIds: string[] }

function makeContext(draft: GameState, rng: Rng, modules: ModuleTable, rt: StepRuntime): EngineContext {
  const s = draft
  const services = modules.services
  const envelope = (player?: PlayerId): EventBase => ({ seq: rt.seq, round: s.round, turn: s.activePlayer, phase: s.phase, player: player ?? s.activePlayer })
  const marks = () => s.phaseState.marks
  const ctx: EngineContext = {
    state: s,
    rng,
    modules,
    services,
    emit(e) {
      const { player, ...rest } = e
      rt.events.push({ ...(rest as object), ...envelope(player) } as GameEvent)
    },
    roll(spec) {
      const id = `r:${++s.rollCounter}`
      const roll = makeRoll(rng, spec, id)
      s.phaseState.lastRoll = roll
      rt.diceRollIds.push(id)
      ctx.emit({ type: 'DiceRolled', roll, player: spec.player })
      return roll
    },
    rollExpr(expr: DiceExpr, spec) {
      const p = parseDiceExpr(expr)
      if (p.count === 0 || p.sides === null) return { total: p.flat, roll: null }
      const modifiers = [...(spec.modifiers ?? [])]
      if (p.flat !== 0) modifiers.push({ source: 'flat', value: p.flat })
      const roll = ctx.roll({ ...spec, sides: p.sides, count: p.count, mode: 'sum', modifiers })
      return { total: rollSum(roll), roll }
    },
    rollOnce(key, spec) {
      const prefix = `roll:${key}=`
      let rollId = marks().find((m) => m.startsWith(prefix))?.slice(prefix.length) ?? null
      if (rollId === null) {
        const roll = ctx.roll(spec)
        rollId = roll.id
        marks().push(prefix + rollId)
      }
      if (ctx.window('any.rollMade', rollId, [spec.player], { rollId })) return null
      const last = s.phaseState.lastRoll
      if (!last || last.id !== rollId) throw new EngineInvariantError('rollOnce: phaseState.lastRoll no longer holds this roll — consume it before rolling again', { key, rollId })
      return last
    },
    reroll(roll, indexes, source) {
      const r = applyReroll(rng, roll, indexes)
      rt.diceRollIds.push(`${roll.id}#reroll`)
      ctx.emit({ type: 'DiceRerolled', rollId: roll.id, source, before: r.before, after: r.after, player: roll.player })
      if (s.phaseState.lastRoll?.id === roll.id) s.phaseState.lastRoll = r.roll
      return r.roll
    },
    decide(spec) {
      if (s.pending) throw new EngineInvariantError('decide: a decision is already pending', { pending: s.pending.id, kind: spec.kind })
      const id = `d:${++s.decisionCounter}`
      const pending = { ...spec, id } as PendingDecision
      if ('options' in pending && Array.isArray(pending.options)) {
        pending.options = pending.options.map((o: DecisionOption) => ({ ...o, action: { ...o.action, player: pending.player, decisionId: id } as Action }))
      }
      s.pending = pending
      ctx.emit({ type: 'DecisionRequested', pending, player: pending.player })
      return pending
    },
    window(id, key, order, trigger) {
      const occurrence = `window:${id}|${key}`
      if (ctx.once(occurrence)) {
        services.missions.onWindow(ctx, id, key, trigger)
        services.hooks.onWindow(ctx, id, key, trigger)
      }
      if (s.pending) return true
      for (const player of order) {
        if (s.phaseState.windowsOpened.some((w) => w.window === id && w.player === player && w.key === key)) continue
        s.phaseState.windowsOpened.push({ window: id, player, key })
        if (services.stratagems.openWindow(ctx, id, player, key, trigger)) return true
        if (s.pending) return true
      }
      return false
    },
    once(key) {
      if (marks().includes(key)) return false
      marks().push(key)
      return true
    },
    marked(key) { return marks().includes(key) },
    order: {
      active: () => [s.activePlayer, otherPlayer(s.activePlayer)],
      first: () => [s.firstPlayer, otherPlayer(s.firstPlayer)],
      defensive: (owner) => [owner, otherPlayer(owner)],
      only: (p) => [p],
    },
    opponentOf: otherPlayer,
  }
  return ctx
}

// Build an EngineContext over `state` (mutated in place — pass a clone) for module unit tests and tools. `events` and
// `diceRollIds` collect what the context emits; `seq` stamps the event envelope.
export function createContext(state: GameState, rng: Rng, modules: ModuleTable, seq = state.log.length): { ctx: EngineContext; events: GameEvent[]; diceRollIds: string[] } {
  const rt: StepRuntime = { seq, events: [], diceRollIds: [] }
  return { ctx: makeContext(state, rng, modules, rt), events: rt.events, diceRollIds: rt.diceRollIds }
}

// ---------- generic action validation (00-arch §8) ----------
const ACTION_TYPES: ReadonlySet<string> = new Set<ActionType>([
  'deployUnit', 'chooseUnitToActivate', 'declareMove', 'moveUnit', 'declareTargets', 'allocateAttack', 'declareCharge', 'chargeMove',
  'pileIn', 'consolidate', 'chooseFightUnit', 'chooseOption', 'confirm', 'pass', 'useStratagem', 'commandReroll', 'resign',
])
const MOVE_TYPES = new Set(['normal', 'advance', 'fallBack', 'stationary'])

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec3 = (v: unknown): boolean => isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z)

function schema(reason: string, details?: Record<string, unknown>): Rejection { return { code: 'E_SCHEMA', reason, details } }

function checkPlacements(v: unknown): Rejection | null {
  if (!Array.isArray(v)) return schema('placements must be an array')
  for (const p of v as unknown[]) {
    if (!isObj(p) || !isStr(p.modelId)) return schema('placement.modelId must be a string')
    if (!isVec3(p.pos)) return schema('placement.pos must be {x, y, z} numbers')
    if (p.facing !== undefined && !isNum(p.facing)) return schema('placement.facing must be a number')
    if (p.path !== undefined && (!Array.isArray(p.path) || !p.path.every(isVec3))) return schema('placement.path must be Vec3[]')
  }
  return null
}

// payload shape per action type; envelope already checked
export function checkActionShape(action: Action): Rejection | null {
  const a = action as unknown as Record<string, unknown>
  switch (action.type) {
    case 'deployUnit':
      if (!isStr(a.unitId)) return schema('unitId required')
      if (a.toReserves !== undefined && typeof a.toReserves !== 'boolean') return schema('toReserves must be boolean')
      return checkPlacements(a.placements)
    case 'moveUnit': case 'chargeMove': case 'pileIn': case 'consolidate':
      if (!isStr(a.unitId)) return schema('unitId required')
      return checkPlacements(a.placements)
    case 'chooseUnitToActivate': case 'chooseFightUnit':
      return isStr(a.unitId) ? null : schema('unitId required')
    case 'declareMove':
      if (!isStr(a.unitId)) return schema('unitId required')
      return MOVE_TYPES.has(a.moveType as string) ? null : schema('moveType must be normal|advance|fallBack|stationary')
    case 'declareTargets': {
      if (!isStr(a.unitId)) return schema('unitId required')
      if (!Array.isArray(a.targets)) return schema('targets must be an array')
      for (const t of a.targets as unknown[]) {
        if (!isObj(t) || !isStr(t.modelId) || !isStr(t.weaponId) || !isStr(t.targetUnitId)) return schema('target needs modelId, weaponId, targetUnitId')
        if (t.profileGroup !== undefined && !isStr(t.profileGroup)) return schema('target.profileGroup must be a string')
        if (t.attacks !== undefined && (!Number.isInteger(t.attacks) || (t.attacks as number) < 1)) return schema('target.attacks must be a positive integer')
      }
      return null
    }
    case 'allocateAttack': return isStr(a.modelId) ? null : schema('modelId required')
    case 'declareCharge':
      if (!isStr(a.unitId)) return schema('unitId required')
      return Array.isArray(a.targetUnitIds) && a.targetUnitIds.length > 0 && a.targetUnitIds.every(isStr) ? null : schema('targetUnitIds must be a non-empty string array')
    case 'chooseOption': return isStr(a.optionId) ? null : schema('optionId required')
    case 'useStratagem': {
      if (!isStr(a.stratagemId)) return schema('stratagemId required')
      if (!isObj(a.targets)) return schema('targets object required')
      const t = a.targets
      for (const k of ['unitIds', 'modelIds'] as const) if (t[k] !== undefined && (!Array.isArray(t[k]) || !(t[k] as unknown[]).every(isStr))) return schema(`targets.${k} must be a string array`)
      if (t.objectiveId !== undefined && !isStr(t.objectiveId)) return schema('targets.objectiveId must be a string')
      if (t.optionId !== undefined && !isStr(t.optionId)) return schema('targets.optionId must be a string')
      return null
    }
    case 'commandReroll':
      if (!isStr(a.rollId)) return schema('rollId required')
      return a.dieIndex === undefined || (Number.isInteger(a.dieIndex) && (a.dieIndex as number) >= 0) ? null : schema('dieIndex must be a non-negative integer')
    case 'confirm': case 'pass': case 'resign': return null
  }
}

// which action types answer which decision kind (besides pass)
const ANSWERS: Record<PendingDecision['kind'], ActionType[]> = {
  deployUnit: ['deployUnit'], chooseUnitToActivate: ['chooseUnitToActivate'], declareMove: ['declareMove'], moveUnit: ['moveUnit'],
  declareTargets: ['declareTargets'], allocateAttack: ['allocateAttack'], declareCharge: ['declareCharge'], chargeMove: ['chargeMove'],
  pileIn: ['pileIn'], consolidate: ['consolidate'], chooseFightUnit: ['chooseFightUnit'], stratagemWindow: ['useStratagem'],
  reactionWindow: ['useStratagem'], chooseOption: ['chooseOption'], commandReroll: ['commandReroll'], confirm: ['confirm'],
}

function envelopeCheck(state: GameState, action: Action): Rejection | null {
  if (state.phase === 'ended') return { code: 'E_GAME_OVER', reason: 'the battle has ended' }
  if (!isObj(action) || !ACTION_TYPES.has(String(action.type))) return schema('unknown action type')
  if (action.player !== 'A' && action.player !== 'B') return schema('player must be A or B')
  if (action.type === 'resign') return null
  const pending = state.pending
  if (!pending) throw new EngineInvariantError('no pending decision while the battle is running')
  if (!isStr(action.decisionId)) return schema('decisionId required')
  if (action.decisionId !== pending.id) return { code: 'E_WRONG_DECISION', reason: `expected answer to ${pending.id}, got ${action.decisionId}`, details: { expected: pending.id } }
  if (action.player !== pending.player) return { code: 'E_WRONG_PLAYER', reason: `player ${pending.player} must answer`, details: { expected: pending.player } }
  const shape = checkActionShape(action)
  if (shape) return shape
  if (action.type === 'pass') return pending.canPass ? null : { code: 'E_PASS_NOT_ALLOWED', reason: 'this decision cannot be passed' }
  if (!ANSWERS[pending.kind].includes(action.type)) return { code: 'E_NOT_AN_OPTION', reason: `${action.type} does not answer a ${pending.kind} decision` }
  const contextUnit = (pending as { context?: { unitId?: unknown } }).context?.unitId
  const actionUnit = (action as { unitId?: unknown }).unitId
  if (isStr(contextUnit) && isStr(actionUnit) && pending.kind !== 'chooseUnitToActivate' && pending.kind !== 'chooseFightUnit' && pending.kind !== 'deployUnit') {
    if (actionUnit !== contextUnit) return { code: 'E_INVALID_TARGET', reason: `decision concerns unit ${contextUnit}`, details: { expected: contextUnit } }
  }
  return null
}

// canonical identity of an answer: action without envelope fields
function actionKey(a: Action): string {
  const { seq: _s, decisionId: _d, player: _p, ...rest } = a as Action & { seq?: number }
  return JSON.stringify(rest, Object.keys(rest).sort())
}

function defaultValidate(_state: GameState, action: Action, pending: PendingDecision): Rejection | null {
  if (action.type === 'pass') return null
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  if (action.type === 'chooseOption') {
    return pending.options.some((o) => o.id === action.optionId) ? null : { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered`, details: { options: pending.options.map((o) => o.id) } }
  }
  const key = actionKey(action)
  return pending.options.some((o) => actionKey(o.action) === key) ? null : { code: 'E_NOT_AN_OPTION', reason: 'answer is not one of the offered options' }
}

function defaultLegalActions(pending: PendingDecision): Action[] | null {
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  const out: Action[] = pending.options.map((o) => o.action)
  if (pending.canPass) out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
  return out
}

// ---------- core-owned decisions ----------
function coherencyCullHandler(): DecisionHandler {
  return {
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'coherency cull expects chooseOption' }
      const modelId = action.optionId
      const model = ctx.state.models[modelId]
      if (!model) return { code: 'E_NOT_AN_OPTION', reason: `model ${modelId} no longer exists` }
      const unitId = model.unitId
      const destroyed = removeModel(ctx.state, modelId)
      ctx.emit({ type: 'CoherencyCulled', unitId, modelIds: [modelId], player: pending.player })
      ctx.emit({ type: 'ModelDestroyed', unitId, modelId, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: pending.player })
      if (destroyed) ctx.emit({ type: 'UnitDestroyed', unitId, byPlayer: null, byUnitId: null, byModelId: null, kind: 'other', player: pending.player })
    },
  }
}

// R-2.6: at the end of every turn each unit out of coherency loses models (owner's choice) until it is coherent.
// Attached units are checked as one; leaders (bodyguardUnitId set) are covered by their bodyguard's check.
function coherencyCull(ctx: EngineContext): boolean {
  const s = ctx.state
  for (const unit of Object.values(s.units)) {
    if (unit.location !== 'board' || unit.bodyguardUnitId) continue
    const models = unitModelsForCoherency(s, unit.id)
    if (isCoherent(models)) continue
    ctx.decide({
      kind: 'chooseOption',
      player: unit.player,
      window: 'turn.end',
      canPass: false,
      context: { topic: 'coherencyCull', unitId: unit.id, abilityId: null, data: { modelIds: models.map((m) => m.id) } },
      options: models.map((m) => ({ id: m.id, label: `remove ${m.id}`, action: { type: 'chooseOption', player: unit.player, decisionId: '', optionId: m.id } })),
    })
    return true
  }
  return false
}

// ---------- state machine ----------
function ownerOf(state: GameState, pending: PendingDecision, modules: ModuleTable, core: { cull: DecisionHandler }): DecisionHandler {
  switch (pending.kind) {
    case 'stratagemWindow': case 'reactionWindow': case 'commandReroll':
      return modules.services.stratagems
    case 'chooseOption': {
      if (pending.context.topic === 'coherencyCull') return core.cull
      const h = modules.topics[pending.context.topic]
      if (h) return h
      break
    }
    default: break
  }
  if (state.phase === 'ended') throw new EngineInvariantError('no decision owner after the battle ended')
  return modules.phases[state.phase as BattlePhase]
}

function resetPhaseFlags(s: GameState): void {
  for (const u of Object.values(s.units)) {
    u.turn.shotThisPhase = false
    u.turn.foughtThisPhase = false
    u.turn.surgeMovedThisPhase = false
  }
  for (const m of Object.values(s.models)) m.flags.allocatedThisPhase = false
}

function enterPhase(ctx: EngineContext, modules: ModuleTable, phase: BattlePhase): void {
  const s = ctx.state
  s.phase = phase
  s.step = 'none'
  s.phaseState = emptyPhaseState()
  resetPhaseFlags(s)
  ctx.emit({ type: 'PhaseStarted' })
  if (isBattlePhase(phase)) modules.services.hooks.run(ctx, 'onPhaseStart', {})
  const mod = modules.phases[phase]
  mod.enter(ctx)
  if (s.step === 'none') throw new EngineInvariantError(`phase module ${mod.name}.enter must set state.step`, { phase })
}

function finishPhaseBody(ctx: EngineContext, modules: ModuleTable, mod: PhaseModule): void {
  const s = ctx.state
  mod.exit?.(ctx)
  if (isBattlePhase(s.phase)) {
    modules.services.hooks.run(ctx, 'onPhaseEnd', {})
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    modules.services.effects.expire(ctx, 'phaseEnd', null)
  }
  ctx.emit({ type: 'PhaseEnded' })
  s.step = 'none'
}

function endBattle(ctx: EngineContext, modules: ModuleTable, reason: GameResult['reason'], winner?: PlayerId): void {
  const s = ctx.state
  const result = winner ? { ...modules.services.missions.finalResult(s, reason), winner, reason } : modules.services.missions.finalResult(s, reason)
  s.result = result
  s.pending = null
  ctx.emit({ type: 'GameEnded', result })
  s.phase = 'ended'
  s.step = 'none'
}

function endBattleChain(ctx: EngineContext, modules: ModuleTable, reason: GameResult['reason']): void {
  const s = ctx.state
  if (ctx.once('battleEnd')) s.phaseState.marks.push(`battleEndReason:${reason}`)
  const stored = s.phaseState.marks.find((m) => m.startsWith('battleEndReason:'))?.slice('battleEndReason:'.length) as GameResult['reason'] | undefined
  if (ctx.window('battle.end', 'battle', ctx.order.first())) return
  endBattle(ctx, modules, stored ?? reason)
}

function startTurn(ctx: EngineContext, modules: ModuleTable, player: PlayerId): void {
  const s = ctx.state
  if (ctx.once('turnStarted')) {
    s.activePlayer = player
    for (const u of Object.values(s.units)) u.turn = emptyTurnState()
    ctx.emit({ type: 'TurnStarted' })
    modules.services.effects.expire(ctx, 'nextOwnTurn', player)
    modules.services.objectives.evaluateControl(ctx, 'turnStart')
    modules.services.hooks.run(ctx, 'onTurnStart', {})
  }
  if (s.pending) return
  enterPhase(ctx, modules, 'command')
}

function startRoundChain(ctx: EngineContext, modules: ModuleTable): void {
  const s = ctx.state
  const missions = modules.services.missions
  if (ctx.once('roundStart')) {
    s.round += 1
    for (const p of Object.values(s.players)) p.cpGainedThisRound = 0
    ctx.emit({ type: 'RoundStarted' })
  }
  if (ctx.window('round.start', `${s.round}`, ctx.order.first())) return
  const first = s.firstPlayer
  const second = otherPlayer(first)
  const startWith = missions.playerHasForces(s, first) ? first : missions.playerHasForces(s, second) ? second : null
  if (startWith === null) { endBattleChain(ctx, modules, 'tabled'); return }
  startTurn(ctx, modules, startWith)
}

// runs whenever state.step === 'none' (a phase body has finished); re-entrant via marks and keyed windows
function transition(ctx: EngineContext, modules: ModuleTable): void {
  const s = ctx.state
  const services = modules.services
  if (ctx.marked('turnStarted')) { startTurn(ctx, modules, s.activePlayer); return }
  if (ctx.marked('battleEnd')) { endBattleChain(ctx, modules, 'vp'); return }
  if (ctx.marked('roundStart')) { startRoundChain(ctx, modules); return }
  if (s.phase === 'setup') { enterPhase(ctx, modules, 'deployment'); return }
  if (s.phase === 'deployment') { startRoundChain(ctx, modules); return }

  if (ctx.window('phase.end', s.phase, ctx.order.active())) return
  if (services.missions.isTabled(s)) { endBattleChain(ctx, modules, 'tabled'); return }
  const next = nextPhase(s.phase)
  if (next) { enterPhase(ctx, modules, next as BattlePhase); return }

  // end of the turn (after the Fight phase): R-2.6 cull, turn.end, then the next turn / round end
  if (coherencyCull(ctx)) return
  if (ctx.window('turn.end', 'turn', ctx.order.active())) return
  if (ctx.once('turnEnd')) {
    services.objectives.evaluateControl(ctx, 'turnEnd')
    services.hooks.run(ctx, 'onTurnEnd', {})
    services.effects.expire(ctx, 'turnEnd', s.activePlayer)
  }
  if (s.pending) return
  const nextPlayer = otherPlayer(s.activePlayer)
  const roundOver = s.activePlayer !== s.firstPlayer || !services.missions.playerHasForces(s, nextPlayer)
  if (!roundOver) { startTurn(ctx, modules, nextPlayer); return }
  if (ctx.window('round.end', `${s.round}`, ctx.order.first())) return
  if (ctx.once('roundEnd')) {
    services.effects.expire(ctx, 'roundEnd', null)
    ctx.emit({ type: 'RoundEnded' })
  }
  if (s.pending) return
  if (s.round >= s.mission.data.rounds || services.missions.isTabled(s)) { endBattleChain(ctx, modules, services.missions.isTabled(s) ? 'tabled' : 'vp'); return }
  startRoundChain(ctx, modules)
}

const MAX_ADVANCE_ITERATIONS = 100_000

export function advanceGame(ctx: EngineContext, modules: ModuleTable): void {
  const s = ctx.state
  for (let i = 0; i < MAX_ADVANCE_ITERATIONS; i++) {
    if (s.pending) return
    if (s.phase === 'ended') return
    if (s.step === 'none') { transition(ctx, modules); continue }
    const mod = modules.phases[s.phase as BattlePhase]
    if (isBattlePhase(s.phase) && ctx.window(`${s.phase}.start` as TimingWindowId, 'start', ctx.order.active())) continue
    const r = mod.advance(ctx)
    if (r === 'done') { finishPhaseBody(ctx, modules, mod); continue }
    if (!s.pending) throw new EngineInvariantError(`phase module ${mod.name}.advance returned 'pending' without raising a decision`, { phase: s.phase, step: s.step })
  }
  throw new EngineInvariantError('auto-advance did not settle', { phase: s.phase, step: s.step })
}

// ---------- engine factory ----------
export function createEngine(modules: ModuleTable): EngineApi {
  const core = { cull: coherencyCullHandler() }

  function finalize(draft: GameState, rng: Rng, prev: GameState | null, action: Action | null, rt: StepRuntime): void {
    draft.rng = rng.serialize()
    if (draft.phase !== 'ended' && !draft.pending) throw new EngineInvariantError('no pending decision after step', { phase: draft.phase, step: draft.step })
    if (draft.phase === 'ended') draft.pending = null
    draft.hash = ''
    draft.hash = hashState(draft)
    if (prev && action) {
      const logged = { ...action, seq: rt.seq }
      draft.log = [...prev.log, { seq: rt.seq, action: logged, hashAfter: draft.hash, diceRollIds: rt.diceRollIds }]
    }
  }

  function rejected(state: GameState, action: Action, rejection: Rejection): StepResult {
    const ev: ActionRejected = {
      type: 'ActionRejected', rejection, seq: state.log.length, round: state.round, turn: state.activePlayer, phase: state.phase,
      player: isObj(action) && (action.player === 'A' || action.player === 'B') ? action.player : state.pending?.player ?? state.activePlayer,
    }
    return { state, events: [ev], pending: state.pending, rejection }
  }

  function validate(state: GameState, action: Action): Rejection | null {
    const env = envelopeCheck(state, action)
    if (env) return env
    if (action.type === 'resign') return null
    const pending = state.pending as PendingDecision
    const owner = ownerOf(state, pending, modules, core)
    return owner.validate ? owner.validate(state, action, pending) : defaultValidate(state, action, pending)
  }

  function createGame(setup: GameSetup, seed: string, bundle?: DataBundle): StepResult {
    if (typeof seed !== 'string' || seed.length === 0) throw new EngineInvariantError('createGame: seed must be a non-empty string')
    const state = createGameState(setup, requireBundle(bundle), seed, ENGINE_VERSION)
    const rng = restoreRng(state.rng)
    const rt: StepRuntime = { seq: -1, events: [], diceRollIds: [] }
    const ctx = makeContext(state, rng, modules, rt)
    ctx.emit({ type: 'GameCreated', seed, engineVersion: ENGINE_VERSION, dataVersion: setup.dataVersion })
    enterPhase(ctx, modules, 'setup')
    advanceGame(ctx, modules)
    finalize(state, rng, null, null, rt)
    return { state, events: rt.events, pending: state.pending }
  }

  function step(state: GameState, action: Action, rng?: Rng): StepResult {
    const rej = validate(state, action)
    if (rej) return rejected(state, action, rej)
    const draft = cloneForStep(state)
    const pending = draft.pending as PendingDecision | null
    draft.pending = null
    const r = rng ?? restoreRng(state.rng)
    const rt: StepRuntime = { seq: state.log.length, events: [], diceRollIds: [] }
    const ctx = makeContext(draft, r, modules, rt)
    if (action.type === 'resign') {
      endBattle(ctx, modules, 'resign', otherPlayer(action.player))
    } else {
      const owner = ownerOf(state, pending as PendingDecision, modules, core)
      const domain = owner.handle(ctx, action, pending as PendingDecision)
      if (domain) return rejected(state, action, domain)
      advanceGame(ctx, modules)
    }
    finalize(draft, r, state, action, rt)
    return { state: draft, events: rt.events, pending: draft.pending }
  }

  function legalActions(state: GameState, pending: PendingDecision): Action[] | null {
    if (state.phase === 'ended') return []
    const owner = ownerOf(state, pending, modules, core)
    return owner.legalActions ? owner.legalActions(state, pending) : defaultLegalActions(pending)
  }

  function replay(setup: GameSetup, seed: string, actions: Action[], bundle?: DataBundle): StepResult {
    let r = createGame(setup, seed, bundle)
    for (let i = 0; i < actions.length; i++) {
      const { seq: _seq, ...action } = actions[i] as Action & { seq?: number }
      r = step(r.state, action as Action)
      if (r.rejection) throw new EngineInvariantError(`replay: action ${i} rejected (${r.rejection.code}: ${r.rejection.reason})`, { seq: i, rejection: r.rejection })
    }
    return r
  }

  function view(state: GameState, player: PlayerId): PlayerView {
    const opp = otherPlayer(player)
    const inDeployment = state.phase === 'setup' || state.phase === 'deployment'
    const oppSetup = state.setup.players[opp]
    const redacted = inDeployment
      ? { ...state, setup: { ...state.setup, players: { ...state.setup.players, [opp]: { ...oppSetup, reserves: [] } } } }
      : state
    return { player, state: redacted, hidden: { opponentReserveCount: inDeployment ? oppSetup.reserves.length : 0 }, lastRejection: null }
  }

  function save(state: GameState): SaveFile {
    return { version: 1, engineVersion: state.engineVersion, setup: state.setup, seed: state.seed, actions: state.log.map((e) => e.action), finalHash: state.hash }
  }

  function load(file: SaveFile, bundle?: DataBundle): StepResult {
    if (file.version !== 1) throw new EngineInvariantError(`unsupported save version ${String(file.version)}`)
    if (majorVersion(file.engineVersion) !== majorVersion(ENGINE_VERSION)) {
      throw new EngineInvariantError(`save was made with engine ${file.engineVersion}; this engine is ${ENGINE_VERSION}`, { code: 'E_VERSION' })
    }
    const r = replay(file.setup, file.seed, file.actions, bundle)
    if (r.state.hash !== file.finalHash) throw new EngineInvariantError('save hash mismatch after replay', { expected: file.finalHash, actual: r.state.hash })
    if (file.snapshot && file.snapshot.hash !== r.state.hash) throw new EngineInvariantError('snapshot hash does not match the replayed state')
    return r
  }

  function undo(state: GameState, options: UndoOptions = {}, bundle?: DataBundle): StepResult | null {
    if (state.log.length === 0) return null
    const last = state.log[state.log.length - 1]
    if (!options.allowDice && last.diceRollIds.length > 0) return null
    return replay(state.setup, state.seed, state.log.slice(0, -1).map((e) => e.action), bundle)
  }

  return { createGame, step, validate, legalActions, replay, view, save, load, undo, modules }
}

// unit helper for modules: throws when the unit is missing (corrupt state)
export function requireUnit(state: GameState, unitId: string): Unit {
  const u = state.units[unitId]
  if (!u) throw new EngineInvariantError(`unknown unit ${unitId}`)
  return u
}

export type { ModelPlacement, DiceRoll, WindowTrigger, DecisionSpec, EventInput }
