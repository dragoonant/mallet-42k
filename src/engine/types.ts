// Frozen engine contracts: code form of docs/spec/00-architecture §3–§7. Do not diverge from that file.
import type {
  AbilityDescriptor, CoreAbility, DiceExpr, EffectList, Id, Keyword, MissionData, Polygon, RollTarget,
  Scope, Stats, StratagemData, TerrainKind, TerrainTrait, TimingWindowId, Vec2, WallData, FloorData,
  WeaponAbility, ScoringRule, MissionRule,
} from '../data/types'
import type { Action } from './actions'

export type { TimingWindowId, Vec2, Polygon, Id, Keyword, DiceExpr, RollTarget } from '../data/types'

// ---------- identifiers ----------
export type PlayerId = 'A' | 'B'
export type UnitId = string
export type ModelId = string
export type WeaponId = Id
export type DatasheetId = Id
export type AbilityId = Id
export type StratagemId = Id
export type ObjectiveId = string
export type TerrainPieceId = string
// "d:<monotonic int>"
export type DecisionId = string

// ---------- phases and steps ----------
export type Phase = 'setup' | 'deployment' | 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'ended'

export type SetupStep = 'rollOffSides' | 'chooseSides' | 'deploy' | 'rollOffFirstTurn' | 'preBattle'
export type CommandStep = 'command' | 'battleShock' | 'scoring'
export type MovementStep = 'select' | 'declare' | 'move' | 'reinforcements'
export type ShootingStep = 'selectUnit' | 'declareTargets' | 'resolve' | 'hazardous'
export type ChargeStep = 'declare' | 'roll' | 'overwatch' | 'move'
export type FightStep = 'fightsFirst' | 'remaining'
export type FightSubStep = 'select' | 'pileIn' | 'declareTargets' | 'attacks' | 'consolidate'
export type PhaseStep = SetupStep | CommandStep | MovementStep | ShootingStep | ChargeStep | FightStep | 'none'

export type MoveType = 'normal' | 'advance' | 'fallBack' | 'stationary'
export type OutOfPhaseMove = 'charge' | 'pileIn' | 'consolidate' | 'surge' | 'scouts' | 'reinforcements'
export type AttackKind = 'ranged' | 'melee'

// ---------- geometry ----------
export interface Vec3 { x: number; y: number; z: number }
export interface ModelBase { shape: 'round' | 'oval'; radius: number; radius2?: number }
export type Path = Vec3[]

// ---------- runtime data (resolved from DataBundle at createGame) ----------
export interface RuntimeWeapon {
  id: WeaponId
  name: string
  kind: AttackKind
  range: number
  A: DiceExpr
  skill: RollTarget | null
  S: number
  AP: number
  D: DiceExpr
  abilities: WeaponAbility[]
  profileGroup: Id | null
}

export interface RuntimeAbility extends AbilityDescriptor {
  source: 'datasheet' | 'leader' | 'enhancement' | 'core' | 'stratagem'
  // set when scope.who === 'bearer' (enhancements): the one model the effect applies to
  bearerModelId: ModelId | null
}

export interface RuntimeModelProfile {
  modelId: string
  name: string
  champion: boolean
  base: ModelBase
  height: number
  stats: Stats
  weapons: WeaponId[]
}

export interface RuntimeDatasheet {
  id: DatasheetId
  name: string
  faction: Id
  keywords: Keyword[]
  factionKeywords: Keyword[]
  stats: Stats
  invuln: RollTarget | null
  models: RuntimeModelProfile[]
  abilities: AbilityId[]
  coreAbilities: CoreAbility[]
  leader: { attachTo: DatasheetId[]; effects: AbilityId[] } | null
  damaged: { threshold: number; effect: EffectList } | null
}

export type RuntimeStratagem = StratagemData

// ---------- board ----------
export interface TerrainPiece {
  id: TerrainPieceId
  kind: TerrainKind
  pos: Vec2
  rot: number
  // world-space polygon
  footprint: Polygon
  height: number
  traits: TerrainTrait[]
  walls: WallData[]
  floors: FloorData[]
}

export interface Board { w: number; h: number; pieces: Record<TerrainPieceId, TerrainPiece>; layoutId: Id }

export interface Objective {
  id: ObjectiveId
  pos: Vec2
  home: PlayerId | null
  controller: PlayerId | null
  securedBy: PlayerId | null
  stickyBy: PlayerId | null
  claimedBy: { player: PlayerId; modelId: ModelId; sinceTurn: number } | null
  // snapshot taken at the start of every turn (R-12.3); Shock Tactics, Duty and Honour
  controllerAtTurnStart: PlayerId | null
  removed: boolean
  used: boolean
  // Proper Lootin' is per army: players who have already looted this marker
  lootedBy: PlayerId[]
  tag: string | null
}

// ---------- units and models ----------
// "has lost wounds" (R-6.13 allocation) is derived: woundsRemaining < W — no flag, no reset
export interface ModelFlags {
  allocatedThisPhase: boolean
  inBaseContactWithEnemy: boolean
  desperateEscapeTested: boolean
}

export interface Model {
  id: ModelId
  unitId: UnitId
  datasheetModelId: string
  pos: Vec3
  facing: number
  base: ModelBase
  height: number
  woundsRemaining: number
  weapons: WeaponId[]
  oneShotUsed: WeaponId[]
  flags: ModelFlags
}

export interface UnitTurnState {
  moveType: MoveType | null
  advanceRoll: number | null
  chargedThisTurn: boolean
  chargeRoll: number | null
  shotThisPhase: boolean
  foughtThisPhase: boolean
  surgeMovedThisPhase: boolean
  arrivedThisTurn: boolean
  fightsFirst: boolean
  fightsLast: boolean
}

export interface ActiveEffect {
  id: string
  sourceAbilityId: AbilityId | StratagemId
  sourceUnitId: UnitId | null
  effect: EffectList
  scope: Scope
  expires: { kind: 'phaseEnd' | 'turnEnd' | 'nextOwnTurn' | 'roundEnd' | 'battle'; round: number; player: PlayerId | null }
  when: AbilityDescriptor['when'] | null
}

export type UnitLocation = 'board' | 'reserves' | 'destroyed'

export interface Unit {
  id: UnitId
  player: PlayerId
  ref: string
  datasheetId: DatasheetId
  name: string
  models: ModelId[]
  startingStrength: number
  location: UnitLocation
  attachedLeaderId: UnitId | null
  bodyguardUnitId: UnitId | null
  battleShocked: boolean
  battleShockExpiresRound: number | null
  turn: UnitTurnState
  effects: ActiveEffect[]
  enhancementId: Id | null
  isWarlord: boolean
  // set from PlayerSetup.enhancementChoice (Tellyporta): both units must arrive together within 3"
  deepStrikeWith: UnitId | null
  // modelId: the attacking model for ranged/melee kills; null for mortal wounds, Deadly Demise, culls
  destroyedBy: { player: PlayerId; kind: AttackKind | 'mortal' | 'other'; round: number; unitId: UnitId | null; modelId: ModelId | null } | null
}

// ---------- players ----------
export interface StratagemUse { stratagemId: StratagemId; round: number; turn: PlayerId; phase: Phase }

export interface Player {
  id: PlayerId
  name: string
  faction: Id
  patrolId: Id
  side: 'attacker' | 'defender' | null
  cp: number
  vp: number
  vpBySource: Record<string, number>
  cpGainedThisRound: number
  stratagemUses: StratagemUse[]
  oncePerBattleUsed: Id[]
  enhancementId: Id
  secondaryId: Id
  warlordUnitId: UnitId
  oathTargetUnitId: UnitId | null
  waaagh: { used: boolean; activeRound: number | null }
  commandRerollLocked: boolean
  battleReadyVp: number
  // secondary bookkeeping; reserved keys: killsThisPhase: Record<ModelId, number> (reset at phase end; Wrath of the Emperor),
  // stompTargetUnitId, bagTargetModelId
  secondaryState: Record<string, unknown>
}

// ---------- in-flight sequences ----------
// attacks: melee only — number of this weapon's attacks sent at targetUnitId (a model may split, R-9.7)
export interface DeclaredTarget { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId; profileGroup: Id | null; attacks: number | null }

export interface AttackGroup {
  weaponId: WeaponId
  targetUnitId: UnitId
  attackerModelIds: ModelId[]
  attacks: number
  resolved: number
  devastatingPending: number
}

export interface CurrentAttack {
  groupIndex: number
  attackerModelId: ModelId
  stage: 'hit' | 'wound' | 'allocate' | 'save' | 'damage' | 'done'
  hit: { die: number; final: number; critical: boolean; extraHits: number } | null
  wound: { die: number; final: number; critical: boolean; auto: boolean } | null
  allocatedModelId: ModelId | null
  save: { kind: 'armour' | 'invuln' | 'none'; die: number; final: number; passed: boolean } | null
  damage: number | null
  cover: boolean
}

export interface AttackSequenceState {
  kind: AttackKind
  attackerUnitId: UnitId
  overwatch: boolean
  targets: DeclaredTarget[]
  groups: AttackGroup[]
  current: CurrentAttack | null
  mortalQueue: { targetUnitId: UnitId; count: number; source: string; lostOnDeath: boolean }[]
  hazardousPending: WeaponId[]
  targetUnitIds: UnitId[]
}

export interface ChargeState {
  unitId: UnitId
  targetUnitIds: UnitId[]
  roll: [number, number] | null
  rerolled: boolean
  distance: number | null
  heroic: boolean
}

export interface FightState {
  step: FightStep
  subStep: FightSubStep
  currentUnitId: UnitId | null
  fought: UnitId[]
  nextToSelect: PlayerId
  counterOffensive: boolean
}

export interface PhaseState {
  activated: UnitId[]
  windowsOpened: { window: TimingWindowId; player: PlayerId; key: string }[]
  // progress markers for re-entrant sequences (EngineContext.once); reset when a phase is entered (W1-A)
  marks: string[]
  attack: AttackSequenceState | null
  charge: ChargeState | null
  fight: FightState | null
  battleShockQueue: UnitId[]
  lastRoll: DiceRoll | null
}

// ---------- dice ----------
export type RollPurpose =
  | 'hit' | 'wound' | 'save' | 'damage' | 'attacks' | 'fnp' | 'charge' | 'advance' | 'battleShock'
  | 'desperateEscape' | 'hazardous' | 'deadlyDemise' | 'mortal' | 'rollOff' | 'firstTurn' | 'mission' | 'ability'
  | 'stratagem' | 'random'

export interface RollModifier { source: string; value: number }

export interface DiceRoll {
  id: string
  purpose: RollPurpose
  sides: 3 | 6
  dice: number[]
  rerolled: number[] | null
  modifiers: RollModifier[]
  final: number[]
  player: PlayerId
  unitId: UnitId | null
  modelId: ModelId | null
  weaponId: WeaponId | null
  targetUnitId: UnitId | null
  commandRerollable: boolean
}

// ---------- decisions ----------
export type DecisionKind =
  | 'deployUnit' | 'chooseUnitToActivate' | 'declareMove' | 'moveUnit' | 'declareTargets' | 'allocateAttack'
  | 'declareCharge' | 'chargeMove' | 'pileIn' | 'consolidate' | 'chooseFightUnit'
  | 'stratagemWindow' | 'reactionWindow' | 'chooseOption' | 'commandReroll' | 'confirm'

export interface DecisionOption { id: string; label: string; action: Action; hint?: Record<string, unknown> }

export interface MoveConstraints {
  maxDistance: number
  perModel: Record<ModelId, number>
  forbidden: Polygon[]
  mustEndOutsideEngagement: boolean
  mustEndInEngagementWith: UnitId[]
  mustEndCloserTo: 'target' | 'closestEnemy' | 'objective' | null
  // surge moves (Krump da Gitz): every model ends as close as it can to that unit
  asCloseAsPossibleTo: UnitId | null
  region: Polygon | null
  minDistanceFromEnemies: number
  coherency: boolean
}

export interface DecisionBase {
  id: DecisionId
  player: PlayerId
  window: TimingWindowId
  canPass: boolean
  deadlineHint?: number
}

export interface DeployUnitDecision extends DecisionBase {
  kind: 'deployUnit'
  context: { unitIds: UnitId[]; zone: Polygon; infiltrators: UnitId[]; reservesAllowed: UnitId[] }
  constraints: MoveConstraints
}
export interface ChooseUnitToActivateDecision extends DecisionBase {
  kind: 'chooseUnitToActivate'
  context: { phase: Phase; eligible: UnitId[] }
  options: DecisionOption[]
}
// step 1 of a move: pick the move type; opens `movement.moveStarted` (Fire Overwatch) before any placement
export interface DeclareMoveDecision extends DecisionBase {
  kind: 'declareMove'
  context: { unitId: UnitId; allowed: MoveType[] }
  options: DecisionOption[]
}
// step 2: placements for the declared move type (advance roll already made)
export interface MoveUnitDecision extends DecisionBase {
  kind: 'moveUnit'
  context: { unitId: UnitId; moveType: MoveType; advanceRoll: number | null }
  constraints: MoveConstraints
}
export interface DeclareTargetsDecision extends DecisionBase {
  kind: 'declareTargets'
  context: {
    unitId: UnitId
    attackKind: AttackKind
    overwatch: boolean
    // attacks: melee attack count per (model, weapon) (random A rolled before declaration); null for ranged
    weapons: { modelId: ModelId; weaponId: WeaponId; profileGroup: Id | null; legalTargets: UnitId[]; attacks: number | null }[]
    engagedWith: UnitId[]
  }
}
export interface AllocateAttackDecision extends DecisionBase {
  kind: 'allocateAttack'
  context: { targetUnitId: UnitId; attackerUnitId: UnitId; eligibleModels: ModelId[]; precision: boolean; damage: number | null; mortal: boolean }
  options: DecisionOption[]
}
export interface DeclareChargeDecision extends DecisionBase {
  kind: 'declareCharge'
  context: { unitId: UnitId; candidateTargets: UnitId[]; heroic: boolean }
}
export interface ChargeMoveDecision extends DecisionBase {
  kind: 'chargeMove'
  context: { unitId: UnitId; targetUnitIds: UnitId[]; roll: number }
  constraints: MoveConstraints
}
export interface PileInDecision extends DecisionBase {
  kind: 'pileIn'
  context: { unitId: UnitId; distance: number }
  constraints: MoveConstraints
}
export interface ConsolidateDecision extends DecisionBase {
  kind: 'consolidate'
  context: { unitId: UnitId; distance: number; objectiveFallback: ObjectiveId | null }
  constraints: MoveConstraints
}
export interface ChooseFightUnitDecision extends DecisionBase {
  kind: 'chooseFightUnit'
  context: { step: FightStep; eligible: UnitId[] }
  options: DecisionOption[]
}
export interface StratagemWindowDecision extends DecisionBase {
  kind: 'stratagemWindow'
  context: { trigger: { unitId: UnitId | null; targetUnitId: UnitId | null; rollId: string | null }; usable: StratagemId[] }
  options: DecisionOption[]
}
export interface ReactionWindowDecision extends DecisionBase {
  kind: 'reactionWindow'
  // options are `useStratagem` actions (CP cost and limits enforced as for any stratagem) plus pass; see 10-rules R-11.5
  context: { enemyUnitId: UnitId | null; reaction: 'overwatch' | 'heroicIntervention' | 'rapidIngress' | 'counterOffensive'; eligibleUnits: UnitId[] }
  options: DecisionOption[]
}
export type ChooseOptionTopic =
  | 'chooseSide' | 'battleShockOrder' | 'desperateEscapeCasualty' | 'coherencyCull' | 'saveType'
  | 'meleeWeapon' | 'weaponProfile' | 'oathTarget' | 'waaagh' | 'razeObjective' | 'recoverObjective'
  | 'reserveArrival' | 'leaderAttach' | 'hazardousCasualty' | 'rerollOffer' | 'abilityChoice' | 'stompTarget' | 'bagTarget' | 'other'
export interface ChooseOptionDecision extends DecisionBase {
  kind: 'chooseOption'
  // rerollOffer: data = { rollId, dieIndexes: number[] } (R-6.24); options = one per re-rollable die + keep
  context: { topic: ChooseOptionTopic; unitId: UnitId | null; abilityId: Id | null; data: Record<string, unknown> }
  options: DecisionOption[]
}
export interface CommandRerollDecision extends DecisionBase {
  kind: 'commandReroll'
  context: { roll: DiceRoll; selectableDice: boolean }
  options: DecisionOption[]
}
export interface ConfirmDecision extends DecisionBase {
  kind: 'confirm'
  context: { topic: 'battleShockResult' | 'gameEnded' | 'roundStart' | 'info'; message: string; data: Record<string, unknown> }
  options: DecisionOption[]
}

export type PendingDecision =
  | DeployUnitDecision | ChooseUnitToActivateDecision | DeclareMoveDecision | MoveUnitDecision | DeclareTargetsDecision
  | AllocateAttackDecision | DeclareChargeDecision | ChargeMoveDecision | PileInDecision | ConsolidateDecision
  | ChooseFightUnitDecision | StratagemWindowDecision | ReactionWindowDecision | ChooseOptionDecision
  | CommandRerollDecision | ConfirmDecision

// ---------- rejection / errors ----------
export type RejectionCode =
  | 'E_WRONG_DECISION' | 'E_WRONG_PLAYER' | 'E_NOT_AN_OPTION' | 'E_OUT_OF_RANGE' | 'E_COHERENCY' | 'E_OVERLAP'
  | 'E_ENGAGEMENT' | 'E_NO_LOS' | 'E_NOT_IN_RANGE' | 'E_INVALID_TARGET' | 'E_INSUFFICIENT_CP' | 'E_STRATAGEM_USED'
  | 'E_PASS_NOT_ALLOWED' | 'E_GAME_OVER' | 'E_SCHEMA'

export interface Rejection { code: RejectionCode; reason: string; details?: Record<string, unknown> }

// thrown only on corrupt state / programmer error
export class EngineInvariantError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message)
    this.name = 'EngineInvariantError'
  }
}

// ---------- setup and state ----------
export interface PlayerSetup {
  name: string
  faction: Id
  patrolId: Id
  enhancementId: Id
  // required when the enhancement data has `choice` (Tellyporta: one BOYZ unit of this player); createGame throws EngineInvariantError otherwise
  enhancementChoice?: { unitRef: string }
  secondaryId: Id
  attachments: { leaderRef: string; bodyguardRef: string }[]
  reserves: string[]
  battleReadyVp: number
}

export interface GameSetup {
  missionId: Id
  terrainLayoutId: Id
  players: Record<PlayerId, PlayerSetup>
  sides: { attacker: PlayerId } | 'rollOff'
  firstTurn: PlayerId | 'rollOff'
  dataVersion: string
}

// tabled: neither player has a model on the battlefield nor one that can still arrive → battle ends at once on VP (R-12.6)
export interface GameResult { winner: PlayerId | 'draw'; reason: 'vp' | 'resign' | 'tabled'; vp: Record<PlayerId, number> }

export interface MissionState {
  id: Id
  data: MissionData
  scoring: ScoringRule[]
  rules: MissionRule[]
  secondaries: Record<PlayerId, ScoringRule[]>
  scored: { ruleId: string; player: PlayerId; round: number; turn: PlayerId; amount: number }[]
  // keys per mission listed in 11-combat-patrol §2.6
  custom: Record<string, unknown>
}

export interface ActionLogEntry { seq: number; action: Action; hashAfter: string; diceRollIds: string[] }

export interface GameState {
  engineVersion: string
  dataVersion: string
  seed: string
  rng: string
  setup: GameSetup
  round: number
  activePlayer: PlayerId
  firstPlayer: PlayerId
  phase: Phase
  step: PhaseStep
  players: Record<PlayerId, Player>
  units: Record<UnitId, Unit>
  models: Record<ModelId, Model>
  datasheets: Record<DatasheetId, RuntimeDatasheet>
  weapons: Record<WeaponId, RuntimeWeapon>
  abilities: Record<AbilityId, RuntimeAbility>
  stratagems: Record<StratagemId, RuntimeStratagem>
  board: Board
  objectives: Record<ObjectiveId, Objective>
  mission: MissionState
  phaseState: PhaseState
  pending: PendingDecision | null
  decisionCounter: number
  rollCounter: number
  log: ActionLogEntry[]
  hash: string
  result: GameResult | null
}

// what a Decider sees: redacted state plus the last rejection of its own action
export interface PlayerView {
  player: PlayerId
  state: GameState
  hidden: { opponentReserveCount: number }
  lastRejection: Rejection | null
}

export interface SaveFile {
  version: 1
  engineVersion: string
  setup: GameSetup
  seed: string
  actions: Action[]
  finalHash: string
  snapshot?: GameState
}
