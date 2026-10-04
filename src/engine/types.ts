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
export type FightSubStep = 'select' | 'pileIn' | 'declareTargets' | 'attacks' | 'deferred' | 'consolidate'
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

// Tyranid Death Blow: a model whose removal is deferred until it has had its chance to fight (docs/spec/factions/tyranids.md TYR-6.1)
export interface PendingRemoval { byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null; kind: AttackKind | 'mortal' | 'other'; source: Id }

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
  // set while a Death Blow removal is deferred; such a model is skipped by allocation, OC, coherency and target lists
  pendingRemoval?: PendingRemoval | null
  // E4 (A Martyr's Death): at 0 W, ModelDestroyed already emitted; stays on the table until its deferred activation is
  // done. Cannot be targeted or allocated attacks, has no OC, and does not count towards unit strength or coherency.
  removalDeferred?: boolean
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
  // snapshot of every model removed from this unit, oldest first (filled by state.removeModel); Reanimation Protocols
  // (docs/spec/factions/necrons.md NEC-2.4) puts the most recent one back. Saves from before M10 lack the field.
  destroyedModels: Model[]
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
  // Adepta Sororitas Acts of Faith (E1): the player's pool of Miracle dice
  miracle: MiracleState
}

// values 1..6, pool order = gain order; spentThisPhase = units that made an Act of Faith this phase (reset at phase end)
export interface MiracleState { dice: number[]; spentThisPhase: UnitId[] }

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
  /** Fast-roll bookkeeping (M9): once the group's hit batch has been rolled this holds the successful hits, the queue of
   *  wounding attacks still to be allocated/saved, and the batched save roll. Absent until the hit batch finalises. */
  batch?: GroupBatch
  /** Index of the first group of this group's merge run: consecutive groups against the same target with the same
   *  weapon profile (different firing models) are fast-rolled together, and the lead group holds the `batch`. */
  runLead?: number
}

/** One successful hit of a fast-rolled group: `lethal` = auto-wounds (Lethal Hits), `extra` = Sustained Hits bonus hit. */
export interface BatchHit { groupIndex: number; attackerModelId: ModelId; die: number; final: number; critical: boolean; lethal: boolean; extra: boolean }
/** One wounding attack waiting to be allocated / saved / damaged. `saveDie` indexes into `GroupBatch.saveRoll.dice`. */
export interface WoundSlot {
  slot: number
  groupIndex: number
  attackerModelId: ModelId
  hit: { die: number; final: number; critical: boolean; extraHits: number }
  wound: { die: number; final: number; critical: boolean; auto: boolean }
  saveDie?: number
}
export interface GroupBatch {
  stage: 'wound' | 'save' | 'apply'
  hits: BatchHit[]
  queue: WoundSlot[]
  saveRoll: DiceRoll | null
  nextSlot: number
}

export interface CurrentAttack {
  groupIndex: number
  attackerModelId: ModelId
  stage: 'hit' | 'wound' | 'allocate' | 'save' | 'damage' | 'done'
  hit: { die: number; final: number; critical: boolean; extraHits: number } | null
  wound: { die: number; final: number; critical: boolean; auto: boolean } | null
  allocatedModelId: ModelId | null
  save: { kind: 'armour' | 'invuln' | 'none'; die: number; final: number; passed: boolean } | null
  /** What each save actually has to roll once AP, cover and any modifiers are in — the numbers the
   *  save stage judges the dice against, published so a UI can show them. Written when the save stage
   *  computes them (before it offers the armour-or-invulnerable choice, and before it rolls, so a
   *  Command Re-roll offer on the save can show the real target too); null until then, and null for
   *  `invuln` when the model has no invulnerable save. A target above 6 means the save cannot be made.
   *  Display only — the save stage recomputes from the modifiers in force rather than reading this. */
  saveTargets: { sv: number; ap: number; cover: boolean; armour: number; invuln: number | null } | null
  damage: number | null
  cover: boolean
  /** Ordinal of this wounding attack within its group (keys wound/save/damage rolls); set by the fast-roll flow. */
  slot?: number
  /** Index of this attack's die inside the group's batched save roll; undefined = roll the save individually. */
  saveDie?: number
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
  // E4: models at 0 W whose removal waits for `afterUnitId` to finish its shooting / fight activation
  deferredRemovals: { unitId: UnitId; modelIds: ModelId[]; kind: 'ranged' | 'melee'; afterUnitId: UnitId; source: string }[]
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
  /** Display only: the d6 each die has to reach (hit/wound/save fast-rolls). */
  needed?: number
  /** E1: die indexes whose value came from a Miracle die; never re-rollable. */
  substituted?: number[]
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
  | 'reserveArrival' | 'leaderAttach' | 'hazardousCasualty' | 'rerollOffer' | 'miracleDie' | 'abilityChoice' | 'stompTarget' | 'bagTarget' | 'treasureObjective' | 'other'
export interface ChooseOptionDecision extends DecisionBase {
  kind: 'chooseOption'
  // rerollOffer: data = { rollId, dieIndexes: number[], needed?, purpose?, key? } (R-6.24); options = reroll / keep; the
  //   `reroll` answer may carry `dieIndexes` (a non-empty subset of data.dieIndexes) to re-roll only those dice
  // miracleDie (E1, adepta-sororitas): data = { purpose: RollPurpose; unitId; count; maxSubstitutions; pool: number[]; key } raised before
  //   a D6 roll an Act of Faith may replace; options = skip / use (one `use` per distinct pool value, carrying dieIndexes = [index into pool])
  // saveType: RETIRED (M9) — the engine now picks the save that needs the lower roll (ties: armour); never raised
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
  // E5 Patrol Squads: patrol unit refs to split into their `patrolSquads` parts at Declare Battle Formations
  splitUnits?: string[]
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
