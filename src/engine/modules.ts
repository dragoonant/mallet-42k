// Module interface (W1-A): what every phase module and service implements, and the EngineContext the reducer hands them.
// The contract is documented in src/engine/phases/README.md — read that before implementing a module.
import type { DiceExpr, TimingWindowId } from '../data/types'
import type { Action } from './actions'
import type { EventBase, GameEvent, GameEventType } from './events'
import type { Rng } from './rng'
import type { RollSpec } from './dice'
import type {
  ChooseOptionTopic, DecisionKind, DiceRoll, GameState, PendingDecision, Phase, PlayerId, Rejection, UnitId,
} from './types'
import type { TerrainService } from './terrain'
import type { LosService } from './los'
import type { HookService } from './hooks-impl'
import type { EffectService } from './effects'
import type { StratagemService } from './stratagems'
import type { EnhancementService } from './enhancements'
import type { LeaderService } from './leaders'
import type { AttackService } from './attack'
import type { WeaponService } from './weapons'
import type { TransportService } from './transports'
import type { ObjectiveService } from './objectives'
import type { MissionService } from './missions'

// event without the envelope the reducer fills in (seq, round, turn, phase; player defaults to the active player)
export type EventInput = { [E in GameEvent as E['type']]: Omit<E, keyof EventBase> & { player?: PlayerId } }[GameEventType]

// decision without its id (assigned from state.decisionCounter)
export type DecisionSpec = { [D in PendingDecision as D['kind']]: Omit<D, 'id'> }[DecisionKind]

export interface WindowTrigger { unitId?: UnitId | null; targetUnitId?: UnitId | null; rollId?: string | null }

export type AdvanceResult = 'pending' | 'done'

// The reducer's hand to a module for one step: a mutable draft state plus helpers. Everything a module does to the game
// goes through `state` (mutate freely — it is a fresh copy) and these helpers (which also mutate `state`).
export interface EngineContext {
  readonly state: GameState
  readonly rng: Rng
  readonly modules: ModuleTable
  readonly services: Services
  // append an event; envelope filled in
  emit(e: EventInput): void
  // one physical roll → DiceRoll record + DiceRolled event; sets state.phaseState.lastRoll
  roll(spec: RollSpec): DiceRoll
  // roll a DiceExpr; fixed expressions roll nothing (roll: null)
  rollExpr(expr: DiceExpr, spec: Omit<RollSpec, 'sides' | 'count' | 'mode'>): { total: number; roll: DiceRoll | null }
  // re-entrant roll + `any.rollMade` window (Command Re-roll): rolls once under `key`, opens the window for the roller,
  // returns null while the window's decision is pending, else the (possibly re-rolled) roll
  rollOnce(key: string, spec: RollSpec): DiceRoll | null
  // re-roll dice of a roll (R-1.6 enforced); emits DiceRerolled; updates phaseState.lastRoll when it is that roll
  reroll(roll: DiceRoll, indexes: number[], source: string): DiceRoll
  // raise the decision the game now needs; sets state.pending and emits DecisionRequested. Exactly one may be pending.
  decide(spec: DecisionSpec): PendingDecision
  // re-entrant timing window: runs mission/ability triggers once per (window, key), then offers stratagem/reaction
  // windows to `order` players in turn. Returns true when a decision is now pending — return 'pending' at once.
  window(id: TimingWindowId, key: string, order: PlayerId[], trigger?: WindowTrigger): boolean
  // progress markers (state.phaseState.marks, reset when a phase is entered): true the first time `key` is seen
  once(key: string): boolean
  marked(key: string): boolean
  // player orderings for windows (00-arch §3 / R-11.5)
  order: {
    active(): PlayerId[]
    first(): PlayerId[]
    defensive(targetOwner: PlayerId): PlayerId[]
    only(player: PlayerId): PlayerId[]
  }
  opponentOf(player: PlayerId): PlayerId
}

// answers a PendingDecision. `validate` is pure and MUST hold every domain check (E_OUT_OF_RANGE, E_COHERENCY, …) so
// engine.validate() agrees with step(); `handle` applies the accepted action to the draft and may still return a
// Rejection as a last resort (the draft is discarded). Without `validate`, finite decisions are checked for option
// membership and continuous ones only for envelope/schema.
export interface DecisionHandler {
  validate?(state: GameState, action: Action, pending: PendingDecision): Rejection | null
  handle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
  // default: options[].action (+ pass when canPass) for finite decisions, null for continuous ones
  legalActions?(state: GameState, pending: PendingDecision): Action[] | null
}

// A phase module is a state machine over (state.step, state.phaseState, unit/model flags). The reducer calls `advance`
// repeatedly until it returns 'done' or a decision is pending; every call must make progress from what the state says.
export interface PhaseModule extends DecisionHandler {
  readonly name: string
  // initialise phaseState for this phase and set state.step to the first step (never leave it 'none')
  enter(ctx: EngineContext): void
  advance(ctx: EngineContext): AdvanceResult
  // optional clean-up when the phase body is done (before onPhaseEnd hooks and PhaseEnded)
  exit?(ctx: EngineContext): void
}

export interface Services {
  terrain: TerrainService
  los: LosService
  hooks: HookService
  effects: EffectService
  stratagems: StratagemService
  enhancements: EnhancementService
  leaders: LeaderService
  attack: AttackService
  weapons: WeaponService
  transports: TransportService
  objectives: ObjectiveService
  missions: MissionService
}

export type BattlePhase = Exclude<Phase, 'ended'>

export interface ModuleTable {
  phases: Record<BattlePhase, PhaseModule>
  services: Services
  // chooseOption decisions are routed by topic to these handlers; unlisted topics go to the current phase module
  topics: Partial<Record<ChooseOptionTopic, DecisionHandler>>
}

export const PHASE_ORDER: readonly Phase[] = ['command', 'movement', 'shooting', 'charge', 'fight']

export function nextPhase(phase: Phase): Phase | null {
  const i = PHASE_ORDER.indexOf(phase)
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null
}

export function isBattlePhase(phase: Phase): boolean { return PHASE_ORDER.includes(phase) }

export function otherPlayer(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

// stub handler for decisions a module has not implemented yet
export function notImplementedHandle(name: string): DecisionHandler['handle'] {
  return () => ({ code: 'E_NOT_AN_OPTION', reason: `${name}: decision handling not implemented` })
}
