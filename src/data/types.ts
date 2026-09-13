// TS mirror of docs/spec/schemas (20-data-schema). Shapes only; validation is ajv at build time.

export type Id = string
export type Keyword = string
export type Hex = string
// integer or "D6" | "2D6+1" | "D3+3"
export type DiceExpr = number | string
// 2..7; 7 = never
export type RollTarget = number

export interface Vec2 { x: number; z: number }
export type Polygon = Vec2[]

export type Phase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight' | 'any'

export type TimingWindowId =
  | 'deployment.unit'
  | 'command.start' | 'command.battleShock' | 'command.end'
  | 'movement.start' | 'movement.unitMoved' | 'movement.reinforcements' | 'movement.end'
  | 'shooting.start' | 'shooting.targetsDeclared' | 'shooting.attacksResolved'
  | 'charge.start' | 'charge.declared' | 'charge.rolled' | 'charge.moveEnded'
  | 'fight.start' | 'fight.unitSelected' | 'fight.attacksResolved'
  | 'any.unitDestroyed' | 'any.rollMade'
  | 'turn.end' | 'phase.end'

export interface Stats { M: number; T: number; Sv: RollTarget; W: number; Ld: RollTarget; OC: number }
export type PartialStats = Partial<Stats>

export interface Base { shape: 'round' | 'oval'; mm: number; mm2?: number }

export type StatName = 'A' | 'S' | 'AP' | 'D' | 'M' | 'T' | 'Sv' | 'W' | 'Ld' | 'OC' | 'BS' | 'WS' | 'range'
export type RollName = 'hit' | 'wound' | 'save' | 'charge' | 'advance' | 'battleShock' | 'damage' | 'feelNoPain'

export interface RangeBound { gte?: number; lte?: number; unmodified?: boolean }

export type WeaponAbilityName =
  | 'ASSAULT' | 'HEAVY' | 'RAPID_FIRE' | 'TORRENT' | 'BLAST' | 'SUSTAINED_HITS' | 'LETHAL_HITS'
  | 'DEVASTATING_WOUNDS' | 'ANTI' | 'TWIN_LINKED' | 'LANCE' | 'MELTA' | 'IGNORES_COVER' | 'INDIRECT_FIRE'
  | 'PISTOL' | 'HAZARDOUS' | 'PRECISION' | 'EXTRA_ATTACKS' | 'ONE_SHOT' | 'PSYCHIC' | 'CUSTOM'

export interface WeaponAbility { ability: WeaponAbilityName; value?: DiceExpr; keyword?: Keyword; ref?: Id }

export type CoreAbilityName =
  | 'DEEP_STRIKE' | 'SCOUTS' | 'INFILTRATORS' | 'LONE_OPERATIVE' | 'LEADER' | 'STEALTH'
  | 'DEADLY_DEMISE' | 'FIRING_DECK' | 'FEEL_NO_PAIN' | 'FIGHTS_FIRST'

export interface CoreAbility { ability: CoreAbilityName; value?: DiceExpr }

// all keys AND-ed; `any` ORs, `not` negates
export interface Condition {
  phase?: Phase
  ownTurn?: boolean
  attackerKeyword?: Keyword
  attackerNotKeyword?: Keyword
  targetKeyword?: Keyword
  targetNotKeyword?: Keyword
  weaponType?: 'ranged' | 'melee'
  weaponAbility?: WeaponAbilityName
  weaponId?: Id
  range?: 'half' | { within: number }
  targetInCover?: boolean
  targetOnObjective?: boolean
  unitOnObjective?: boolean
  unitBelowHalf?: boolean
  unitStationary?: boolean
  unitAdvanced?: boolean
  unitFellBack?: boolean
  unitCharged?: boolean
  unitBattleShocked?: boolean
  leaderAttached?: boolean
  roll?: RangeBound
  round?: RangeBound
  oathTarget?: boolean
  any?: Condition[]
  not?: Condition
  strengthVsToughness?: 'gt' | 'gte' | 'eq' | 'lte' | 'lt' | 'double' | 'half'
}

export interface Effect {
  reroll?: 'ones' | 'fails' | 'all' | 'oneDie'
  modifyRoll?: { roll: RollName; value: number }
  modifyStat?: { stat: StatName; value: number }
  setStat?: { stat: StatName; value: DiceExpr }
  invuln?: RollTarget
  feelNoPain?: RollTarget
  ignoreCover?: true
  ignoreModifiers?: 'hit' | 'wound' | 'all'
  autoResult?: { roll: RollName; outcome: 'pass' | 'fail' }
  grantWeaponAbility?: WeaponAbility
  grantKeyword?: Keyword
  extraAttacks?: DiceExpr
  mortalWounds?: { count: DiceExpr; on?: 'unmodified6' | 'always' }
  damageReduction?: number
  halveDamage?: true
  cp?: number
  vp?: number
  move?: { distance: DiceExpr; kind: 'normal' | 'consolidate' | 'advance' }
  fightsFirst?: true
  fightsLast?: true
  shootAfterAdvance?: true
  shootAfterFallBack?: true
  chargeAfterAdvance?: true
  chargeAfterFallBack?: true
  stealth?: true
  lethalOn?: RollTarget
}
export type EffectList = Effect | Effect[]

export interface Scope { who: 'self' | 'target' | 'attacker' | 'friendly' | 'enemy'; within?: number; keyword?: Keyword }
export type Duration = 'instant' | 'untilEndOfPhase' | 'untilEndOfTurn' | 'untilNextTurn' | 'battle'
export type Limit = 'oncePerBattle' | 'oncePerRound' | 'oncePerTurn' | 'oncePerPhase'

export type Trigger =
  | 'always' | 'phaseStart' | 'phaseEnd' | 'turnStart' | 'turnEnd' | 'commandPhase' | 'battleShockTest'
  | 'advanceRoll' | 'chargeRoll' | 'unitMoved' | 'unitSelectedToShoot' | 'unitSelectedToFight'
  | 'targetsDeclared' | 'attacksAllocated' | 'hitRoll' | 'woundRoll' | 'saveRoll' | 'damageRoll'
  | 'feelNoPainRoll' | 'damageApplied' | 'modelDestroyed' | 'unitDestroyed' | 'deployment'
  | 'reinforcements' | 'objectiveControl'

export interface AbilityDescriptor {
  id: Id
  name: string
  text: string
  trigger: Trigger
  when?: Condition
  effect?: EffectList
  scope?: Scope
  duration?: Duration
  limit?: Limit
  code?: string
  params?: Record<string, unknown>
}
export type AbilityRef = Id | AbilityDescriptor

export interface TargetSpec {
  role: 'unit' | 'model'
  owner: 'friendly' | 'enemy'
  filter?: { keyword?: Keyword; notKeyword?: Keyword; within?: { of: 'previousTarget' | 'self' | 'objective'; inches: number } }
  state?: 'selectedToShoot' | 'selectedToFight' | 'targetedByAttack' | 'chargedThisTurn' | 'justDestroyed'
    | 'inEngagement' | 'belowHalf' | 'battleShocked' | 'justMoved'
  count?: number
}

export interface PaintScheme { primary: Hex; secondary: Hex; trim: Hex; metal: Hex; decal: Hex }
export type Archetype = 'infantry' | 'heavy' | 'monster' | 'vehicle'
export type Slot =
  | 'head' | 'torso' | 'backpack' | 'armL' | 'armR' | 'weaponL' | 'weaponR' | 'pauldronL' | 'pauldronR' | 'base'
  | 'shoulderMountL' | 'shoulderMountR' | 'hull' | 'turret' | 'sponsonL' | 'sponsonR'
export interface FigureSpec { archetype: Archetype; kit: Id; parts?: Partial<Record<Slot, Id>>; scale?: number }

export interface ScoringRule {
  id: string
  when: TimingWindowId
  rounds: { from: number; to: number }
  who?: 'active' | 'opponent' | 'both'
  rule: 'holdObjectives' | 'holdMore' | 'holdHome' | 'unitsInEnemyZone' | 'destroyedUnits' | 'custom'
  pointsPer: number
  cap: number
  params?: Record<string, unknown>
  code?: string
}

// weapon.schema.json
export interface WeaponData {
  id: Id
  name: string
  type: 'ranged' | 'melee'
  range: number
  A: DiceExpr
  skill: RollTarget | null
  S: number | 'user' | 'user+1' | 'user+2' | 'userx2'
  AP: number
  D: DiceExpr
  abilities: WeaponAbility[]
  profileGroup?: Id
  figure?: { part: Id; hands?: 1 | 2 }
}

// datasheet.schema.json
export interface WargearOption { replace: Id[]; with: Id[]; max?: number | 'any'; perModels?: number }
export interface Composition {
  modelId: string
  name: string
  min: number
  max: number
  default: number
  champion?: boolean
  base: Base
  statsOverride?: PartialStats
  weapons: { default: Id[]; options?: WargearOption[] }
  figure?: FigureSpec
}
export interface DatasheetData {
  id: Id
  faction: Id
  name: string
  keywords: Keyword[]
  factionKeywords: Keyword[]
  stats: Stats
  invuln?: RollTarget
  composition: Composition[]
  abilities: AbilityRef[]
  coreAbilities: CoreAbility[]
  leader?: { attachTo: Id[]; effects: AbilityRef[] }
  damaged?: { threshold: number; effect: EffectList }
  points: { models: number; points: number }[]
  figure: FigureSpec
}

// stratagem.schema.json
export interface StratagemData {
  id: Id
  faction: Id | 'core'
  detachment?: Id
  name: string
  text: string
  cost: number
  category: 'battleTactic' | 'strategicPloy' | 'wargear' | 'epicDeed'
  phases: Phase[]
  window: TimingWindowId | TimingWindowId[]
  who: 'active' | 'reactive' | 'either'
  condition?: Condition
  when?: Condition
  targets: TargetSpec[]
  effect?: EffectList
  scope?: Scope
  duration?: Duration
  limit?: Limit
  code?: string
  params?: Record<string, unknown>
}

// enhancement.schema.json
export interface EnhancementData {
  id: Id
  faction: Id
  detachment?: Id
  name: string
  text: string
  cost: number
  restriction: { keyword?: Keyword[]; notKeyword?: Keyword[] }
  effect: AbilityRef
}

// faction.schema.json
export interface FactionData {
  id: Id
  name: string
  factionKeyword: Keyword
  armyRule: Id
  detachments: { id: Id; name: string; rule: Id; stratagems: Id[]; enhancements: Id[] }[]
  paintScheme: PaintScheme
  combatPatrols: Id[]
}

// combat-patrol.schema.json
export interface PatrolUnitData {
  ref: string
  datasheet: Id
  size: number
  wargear?: { modelId: string; count: number; weapons: Id[] }[]
  attachTo?: string
  enhancement?: Id
}
export interface SecondaryData { id: Id; name: string; text: string; default: boolean; scoring: ScoringRule[] }
export interface CombatPatrolData {
  id: Id
  faction: Id
  name: string
  detachment?: Id
  units: PatrolUnitData[]
  stratagems: Id[]
  enhancements: { id: Id; default: boolean }[]
  secondaries: SecondaryData[]
  warlord: string
}

// mission.schema.json
export interface MissionData {
  id: Id
  name: string
  text?: string
  format: 'combatPatrol' | 'incursion' | 'strikeForce'
  board: { w: number; h: number }
  deploymentZones: { A: Polygon; B: Polygon }
  objectives: { id: string; x: number; z: number; home?: 'A' | 'B' }[]
  objectiveRange?: number
  objectiveMarkerRadius?: number
  rounds: number
  firstTurn: 'roll' | 'attackerChoice'
  scoring: ScoringRule[]
  victory: { tie: 'draw' | 'fewerDestroyed'; maxVp?: number }
  terrainLayouts: Id[]
}

// terrain-layout.schema.json
export type TerrainKind = 'ruin' | 'crate' | 'barricade' | 'crater' | 'wall' | 'forest'
export type TerrainTrait = 'obscuring' | 'cover' | 'breachable' | 'scalable' | 'difficult' | 'impassable' | 'unstable'
export interface WallGap { from: number; to: number; bottom?: number; top?: number }
export interface WallData { a: Vec2; b: Vec2; height: number; thickness?: number; gaps?: WallGap[] }
export interface FloorData { polygon: Polygon; height: number }
export interface TerrainPieceData {
  id: string
  kind: TerrainKind
  pos: Vec2
  rot: number
  footprint: Polygon
  height: number
  traits: TerrainTrait[]
  walls?: WallData[]
  floors?: FloorData[]
  visual?: Id
}
export interface TerrainLayoutData { id: Id; name?: string; board: { w: number; h: number }; pieces: TerrainPieceData[] }

// assembled by src/data/index.ts; duplicate ids / dangling refs throw at load
export interface DataBundle {
  version: string
  factions: Record<Id, FactionData>
  datasheets: Record<Id, DatasheetData>
  weapons: Record<Id, WeaponData>
  abilities: Record<Id, AbilityDescriptor>
  stratagems: Record<Id, StratagemData>
  enhancements: Record<Id, EnhancementData>
  patrols: Record<Id, CombatPatrolData>
  missions: Record<Id, MissionData>
  terrainLayouts: Record<Id, TerrainLayoutData>
}
