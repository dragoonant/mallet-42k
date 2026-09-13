// Engine public API (00-arch §2). Default engine bound to the module table in DEFAULT_MODULES; tests and tools may build
// their own with createEngine(). The engine never imports data: pass a DataBundle to createGame/replay or call
// registerDataBundle() once at startup (W1-A).
import type { DataBundle } from '../data/types'
import type { Action } from './actions'
import type { Rng } from './rng'
import type { GameSetup, GameState, PendingDecision, PlayerId, PlayerView, Rejection, SaveFile } from './types'
import { createEngine, type StepResult, type UndoOptions } from './reducer'
import type { ModuleTable, Services } from './modules'
import { setupModule } from './setup'
import { commandModule } from './phases/command'
import { movementModule } from './phases/movement'
import { shootingModule } from './phases/shooting'
import { chargeModule } from './phases/charge'
import { fightModule } from './phases/fight'
import { terrainService } from './terrain'
import { losService } from './los'
import { hookService } from './hooks-impl'
import { effectService } from './effects'
import { stratagemService } from './stratagems'
import { enhancementService } from './enhancements'
import { leaderService } from './leaders'
import { attackService } from './attack'
import { weaponService } from './weapons'
import { transportService } from './transports'
import { objectiveService } from './objectives'
import { missionService } from './missions'

export * from './types'
export * from './actions'
export * from './events'
export * from './hooks'
export * from './rng'
export * from './decider'
export * from './dice'
export * from './geometry'
export * from './modules'
export {
  emptyPhaseState, emptyTurnState, hashState, canonicalJson, cloneForStep, unitModels, unitModelsForCoherency, unitsOf,
  boardUnitsOf, boardModelsOf, enemyModelsOnBoard, datasheetOf, modelProfile, modelStats, keywordsOf, hasKeyword, setModelPos,
  removeModel, assignSides, deploymentZone, unitIdFor, modelIdFor, createGameState,
} from './state'
export { createEngine, registerDataBundle, getDataBundle, checkActionShape, advanceGame, createContext, requireUnit } from './reducer'
export { rollOff, setupModule } from './setup'
export type { TerrainService } from './terrain'
export type { LosService } from './los'
export type { HookService, HookData } from './hooks-impl'
export type { EffectService, EffectGrant } from './effects'
export { expiryFor } from './effects'
export type { StratagemService } from './stratagems'
export type { EnhancementService } from './enhancements'
export type { LeaderService } from './leaders'
export type { AttackService, AttackBegin, DestroyedBy } from './attack'
export type { WeaponService } from './weapons'
export type { TransportService } from './transports'
export type { ObjectiveService, ControlMoment } from './objectives'
export type { MissionService } from './missions'
export type { StepResult, EngineApi, UndoOptions } from './reducer'
export { ENGINE_VERSION, majorVersion } from './version'

export const DEFAULT_SERVICES: Services = {
  terrain: terrainService,
  los: losService,
  hooks: hookService,
  effects: effectService,
  stratagems: stratagemService,
  enhancements: enhancementService,
  leaders: leaderService,
  attack: attackService,
  weapons: weaponService,
  transports: transportService,
  objectives: objectiveService,
  missions: missionService,
}

export const DEFAULT_MODULES: ModuleTable = {
  phases: {
    setup: setupModule,
    deployment: setupModule,
    command: commandModule,
    movement: movementModule,
    shooting: shootingModule,
    charge: chargeModule,
    fight: fightModule,
  },
  services: DEFAULT_SERVICES,
  topics: {
    oathTarget: hookService.handler,
    waaagh: hookService.handler,
    abilityChoice: hookService.handler,
    razeObjective: missionService.handler,
    recoverObjective: missionService.handler,
    stompTarget: missionService.handler,
    bagTarget: missionService.handler,
  },
}

export const engine = createEngine(DEFAULT_MODULES)

// builds initial state; first `pending` is the first setup/deployment decision. Throws EngineInvariantError on a bad setup.
export function createGame(setup: GameSetup, seed: string, bundle?: DataBundle): StepResult { return engine.createGame(setup, seed, bundle) }

// pure reducer; never throws for illegal actions, only EngineInvariantError on corrupt state.
// The RNG is restored from state.rng (restoreRng); `rng` is an optional test override (e.g. ScriptedRng) whose
// serialize() output is written back to state.rng, so a game stays replayable from the action log alone.
export function step(state: GameState, action: Action, rng?: Rng): StepResult { return engine.step(state, action, rng) }

// null for continuous decisions (moves)
export function legalActions(state: GameState, pending: PendingDecision): Action[] | null { return engine.legalActions(state, pending) }

export function validate(state: GameState, action: Action): Rejection | null { return engine.validate(state, action) }

export function replay(setup: GameSetup, seed: string, actions: Action[], bundle?: DataBundle): StepResult { return engine.replay(setup, seed, actions, bundle) }

export function view(state: GameState, player: PlayerId): PlayerView { return engine.view(state, player) }

export function save(state: GameState): SaveFile { return engine.save(state) }
export function load(file: SaveFile, bundle?: DataBundle): StepResult { return engine.load(file, bundle) }
export function undo(state: GameState, options?: UndoOptions, bundle?: DataBundle): StepResult | null { return engine.undo(state, options, bundle) }
