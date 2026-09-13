// GameEvent union emitted by the reducer; the only channel to UI, dice log and AI (00-arch §5). JSON-serialisable.
import type {
  AttackKind, DiceRoll, GameResult, Id, ModelId, MoveType, ObjectiveId, OutOfPhaseMove, Path, PendingDecision,
  Phase, PlayerId, Rejection, StratagemId, TimingWindowId, UnitId, WeaponId,
} from './types'

export interface EventBase { seq: number; round: number; turn: PlayerId; phase: Phase; player: PlayerId }

// game
export interface GameCreated extends EventBase { type: 'GameCreated'; seed: string; engineVersion: string; dataVersion: string }
export interface RoundStarted extends EventBase { type: 'RoundStarted' }
export interface TurnStarted extends EventBase { type: 'TurnStarted' }
export interface PhaseStarted extends EventBase { type: 'PhaseStarted' }
export interface PhaseEnded extends EventBase { type: 'PhaseEnded' }
export interface GameEnded extends EventBase { type: 'GameEnded'; result: GameResult }
export interface SidesChosen extends EventBase { type: 'SidesChosen'; attacker: PlayerId; defender: PlayerId }
export interface FirstTurnChosen extends EventBase { type: 'FirstTurnChosen'; first: PlayerId }
export interface UnitDeployed extends EventBase { type: 'UnitDeployed'; unitId: UnitId; toReserves: boolean }

// command
export interface CpChanged extends EventBase { type: 'CpChanged'; delta: number; total: number; source: string }
export interface BattleShockTested extends EventBase { type: 'BattleShockTested'; unitId: UnitId; roll: number; ld: number; passed: boolean }
export interface BattleShocked extends EventBase { type: 'BattleShocked'; unitId: UnitId }
export interface BattleShockRecovered extends EventBase { type: 'BattleShockRecovered'; unitId: UnitId }
export interface OathTargetChosen extends EventBase { type: 'OathTargetChosen'; unitId: UnitId }
export interface WaaaghCalled extends EventBase { type: 'WaaaghCalled' }

// movement
export interface UnitMoved extends EventBase {
  type: 'UnitMoved'
  unitId: UnitId
  moveType: MoveType | OutOfPhaseMove
  paths: Record<ModelId, Path>
}
export interface UnitAdvanced extends EventBase { type: 'UnitAdvanced'; unitId: UnitId; roll: number }
export interface UnitFellBack extends EventBase { type: 'UnitFellBack'; unitId: UnitId }
export interface UnitRemainedStationary extends EventBase { type: 'UnitRemainedStationary'; unitId: UnitId }
export interface DesperateEscapeRolled extends EventBase { type: 'DesperateEscapeRolled'; unitId: UnitId; dice: number[]; casualties: number }
export interface ReinforcementsArrived extends EventBase { type: 'ReinforcementsArrived'; unitId: UnitId; via: 'deepStrike' | 'strategicReserves' | 'rapidIngress' }
export interface UnitLostInReserves extends EventBase { type: 'UnitLostInReserves'; unitId: UnitId }
export interface CoherencyCulled extends EventBase { type: 'CoherencyCulled'; unitId: UnitId; modelIds: ModelId[] }

// shooting / fight
export interface AttackSequenceStarted extends EventBase { type: 'AttackSequenceStarted'; unitId: UnitId; kind: AttackKind; overwatch: boolean }
export interface TargetsDeclared extends EventBase {
  type: 'TargetsDeclared'
  unitId: UnitId
  targets: { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId }[]
}
export interface AttackRollContext { attackerUnitId: UnitId; attackerModelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId }
export interface HitRolled extends EventBase { type: 'HitRolled'; attack: AttackRollContext; die: number; final: number; hit: boolean; critical: boolean; extraHits: number; auto: boolean }
export interface WoundRolled extends EventBase { type: 'WoundRolled'; attack: AttackRollContext; die: number; final: number; needed: number; wounded: boolean; critical: boolean; auto: boolean }
export interface AttackAllocated extends EventBase { type: 'AttackAllocated'; attack: AttackRollContext; modelId: ModelId; cover: boolean }
export interface SaveRolled extends EventBase { type: 'SaveRolled'; attack: AttackRollContext; modelId: ModelId; kind: 'armour' | 'invuln' | 'none'; die: number; final: number; needed: number; saved: boolean }
export interface DamageApplied extends EventBase { type: 'DamageApplied'; unitId: UnitId; modelId: ModelId; amount: number; mortal: boolean; woundsRemaining: number; source: AttackRollContext | { abilityId: Id } | { stratagemId: StratagemId } }
export interface FeelNoPainRolled extends EventBase { type: 'FeelNoPainRolled'; unitId: UnitId; modelId: ModelId; die: number; needed: number; ignored: boolean }
export interface ModelDestroyed extends EventBase { type: 'ModelDestroyed'; unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; kind: AttackKind | 'mortal' | 'other' }
export interface UnitDestroyed extends EventBase { type: 'UnitDestroyed'; unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; kind: AttackKind | 'mortal' | 'other' }
export interface HazardousTested extends EventBase { type: 'HazardousTested'; unitId: UnitId; weaponId: WeaponId; die: number; failed: boolean; modelId: ModelId | null }
export interface DeadlyDemiseRolled extends EventBase { type: 'DeadlyDemiseRolled'; unitId: UnitId; modelId: ModelId; die: number; exploded: boolean; affected: UnitId[] }
export interface AttackSequenceEnded extends EventBase { type: 'AttackSequenceEnded'; unitId: UnitId; kind: AttackKind }
export interface LeaderDetached extends EventBase { type: 'LeaderDetached'; leaderId: UnitId; bodyguardId: UnitId; survivor: UnitId }

// charge
export interface ChargeDeclared extends EventBase { type: 'ChargeDeclared'; unitId: UnitId; targetUnitIds: UnitId[]; heroic: boolean }
export interface ChargeRolled extends EventBase { type: 'ChargeRolled'; unitId: UnitId; dice: [number, number]; total: number; needed: number | null }
export interface ChargeFailed extends EventBase { type: 'ChargeFailed'; unitId: UnitId }
export interface ChargeMoved extends EventBase { type: 'ChargeMoved'; unitId: UnitId; paths: Record<ModelId, Path> }
export interface PiledIn extends EventBase { type: 'PiledIn'; unitId: UnitId; paths: Record<ModelId, Path> }
export interface Consolidated extends EventBase { type: 'Consolidated'; unitId: UnitId; paths: Record<ModelId, Path> }
export interface FightUnitSelected extends EventBase { type: 'FightUnitSelected'; unitId: UnitId; step: 'fightsFirst' | 'remaining' }

// stratagem / ability
export interface StratagemUsed extends EventBase { type: 'StratagemUsed'; stratagemId: StratagemId; cost: number; targets: { unitIds: UnitId[]; modelIds: ModelId[]; objectiveId: ObjectiveId | null } }
export interface StratagemWindowOpened extends EventBase { type: 'StratagemWindowOpened'; window: TimingWindowId; usable: StratagemId[] }
export interface StratagemWindowClosed extends EventBase { type: 'StratagemWindowClosed'; window: TimingWindowId; used: StratagemId | null }
export interface AbilityTriggered extends EventBase { type: 'AbilityTriggered'; abilityId: Id; sourceUnitId: UnitId | null; targetUnitId: UnitId | null; summary: string }
export interface EffectExpired extends EventBase { type: 'EffectExpired'; effectId: string; unitId: UnitId | null }

// dice: one per physical roll, always emitted even when a family event covers it
export interface DiceRolled extends EventBase { type: 'DiceRolled'; roll: DiceRoll }
export interface DiceRerolled extends EventBase { type: 'DiceRerolled'; rollId: string; source: 'commandReroll' | Id; before: number[]; after: number[] }

// objectives
export interface ObjectiveControlChanged extends EventBase { type: 'ObjectiveControlChanged'; objectiveId: ObjectiveId; from: PlayerId | null; to: PlayerId | null; levels: Record<PlayerId, number> }
export interface ObjectiveSecured extends EventBase { type: 'ObjectiveSecured'; objectiveId: ObjectiveId; by: PlayerId | null; flag: 'secured' | 'sticky' }
export interface ObjectiveRemoved extends EventBase { type: 'ObjectiveRemoved'; objectiveId: ObjectiveId; reason: string }
export interface VpScored extends EventBase { type: 'VpScored'; source: string; amount: number; total: number }

// meta
export interface ActionRejected extends EventBase { type: 'ActionRejected'; rejection: Rejection }
export interface DecisionRequested extends EventBase { type: 'DecisionRequested'; pending: PendingDecision }

export type GameEvent =
  | GameCreated | RoundStarted | TurnStarted | PhaseStarted | PhaseEnded | GameEnded | SidesChosen | FirstTurnChosen | UnitDeployed
  | CpChanged | BattleShockTested | BattleShocked | BattleShockRecovered | OathTargetChosen | WaaaghCalled
  | UnitMoved | UnitAdvanced | UnitFellBack | UnitRemainedStationary | DesperateEscapeRolled | ReinforcementsArrived | UnitLostInReserves | CoherencyCulled
  | AttackSequenceStarted | TargetsDeclared | HitRolled | WoundRolled | AttackAllocated | SaveRolled | DamageApplied | FeelNoPainRolled
  | ModelDestroyed | UnitDestroyed | HazardousTested | DeadlyDemiseRolled | AttackSequenceEnded | LeaderDetached
  | ChargeDeclared | ChargeRolled | ChargeFailed | ChargeMoved | PiledIn | Consolidated | FightUnitSelected
  | StratagemUsed | StratagemWindowOpened | StratagemWindowClosed | AbilityTriggered | EffectExpired
  | DiceRolled | DiceRerolled
  | ObjectiveControlChanged | ObjectiveSecured | ObjectiveRemoved | VpScored
  | ActionRejected | DecisionRequested

export type GameEventType = GameEvent['type']
