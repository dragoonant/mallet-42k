// Ability hook system: named hook points, context objects, modifier results, descriptor → hook mapping (20-data §3).
import type { AbilityDescriptor, Effect, Trigger } from '../data/types'
import type {
  AbilityId, AttackKind, DiceRoll, GameState, Id, ModelId, MoveType, OutOfPhaseMove, Phase, PlayerId, RollPurpose,
  RuntimeWeapon, StratagemId, UnitId, ObjectiveId,
} from './types'

export type HookName =
  | 'onPhaseStart' | 'onPhaseEnd' | 'onTurnStart' | 'onTurnEnd' | 'onCommandPhase'
  | 'onBattleShockTest' | 'onAdvanceRoll' | 'onChargeRoll' | 'onMove' | 'onCharge'
  | 'onUnitSelectedToShoot' | 'onUnitSelectedToFight' | 'onTargetsDeclared' | 'onAttacksAllocated'
  | 'onAttackCount' | 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll' | 'onDamageRoll' | 'onFeelNoPainRoll'
  | 'onDamage' | 'onModelDestroyed' | 'onUnitDestroyed' | 'onDeployment' | 'onReinforcements'
  | 'onObjectiveControl' | 'onStatQuery' | 'onEligibility'

// where an effect comes from, for logging and once-per limits
export interface EffectSource {
  kind: 'ability' | 'stratagem' | 'enhancement' | 'core' | 'weaponAbility'
  id: AbilityId | StratagemId | Id
  unitId: UnitId | null
  modelId: ModelId | null
}

export interface HookContextBase {
  state: GameState
  phase: Phase
  activePlayer: PlayerId
  source: EffectSource
  // the unit the descriptor is attached to
  unitId: UnitId | null
}

export interface AttackContext {
  kind: AttackKind
  overwatch: boolean
  attackerUnitId: UnitId
  attackerModelId: ModelId
  weapon: RuntimeWeapon
  targetUnitId: UnitId
  targetModelId: ModelId | null
  range: number
  halfRange: boolean
  inCover: boolean
  charged: boolean
  oathTarget: boolean
  attackerInEngagement: boolean
}

export interface RollContext { purpose: RollPurpose; roll: DiceRoll; dieIndex: number; unmodified: number; rerolled: boolean }

export interface PhaseHookContext extends HookContextBase { hook: 'onPhaseStart' | 'onPhaseEnd' | 'onTurnStart' | 'onTurnEnd' | 'onCommandPhase' }
export interface BattleShockHookContext extends HookContextBase { hook: 'onBattleShockTest'; testUnitId: UnitId; roll: RollContext | null }
export interface AdvanceRollHookContext extends HookContextBase { hook: 'onAdvanceRoll'; movingUnitId: UnitId; roll: RollContext }
export interface ChargeRollHookContext extends HookContextBase { hook: 'onChargeRoll'; chargingUnitId: UnitId; targetUnitIds: UnitId[]; roll: RollContext }
export interface MoveHookContext extends HookContextBase { hook: 'onMove'; movingUnitId: UnitId; moveType: MoveType | OutOfPhaseMove; distance: number }
export interface ChargeHookContext extends HookContextBase { hook: 'onCharge'; chargingUnitId: UnitId; targetUnitIds: UnitId[]; stage: 'declared' | 'moved' | 'failed' }
export interface UnitSelectedHookContext extends HookContextBase { hook: 'onUnitSelectedToShoot' | 'onUnitSelectedToFight'; selectedUnitId: UnitId }
export interface TargetsDeclaredHookContext extends HookContextBase { hook: 'onTargetsDeclared'; attackerUnitId: UnitId; targetUnitIds: UnitId[]; kind: AttackKind }
export interface AttacksAllocatedHookContext extends HookContextBase { hook: 'onAttacksAllocated'; attack: AttackContext }
export interface AttackCountHookContext extends HookContextBase { hook: 'onAttackCount'; attack: AttackContext; attacks: number }
export interface AttackRollHookContext extends HookContextBase { hook: 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll' | 'onDamageRoll' | 'onFeelNoPainRoll'; attack: AttackContext; roll: RollContext }
export interface DamageHookContext extends HookContextBase { hook: 'onDamage'; attack: AttackContext | null; targetUnitId: UnitId; targetModelId: ModelId; damage: number; mortal: boolean }
export interface DestroyedHookContext extends HookContextBase { hook: 'onModelDestroyed' | 'onUnitDestroyed'; destroyedUnitId: UnitId; destroyedModelId: ModelId | null; byUnitId: UnitId | null; byModelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }
export interface DeploymentHookContext extends HookContextBase { hook: 'onDeployment' | 'onReinforcements'; deployingUnitId: UnitId }
export interface ObjectiveHookContext extends HookContextBase { hook: 'onObjectiveControl'; objectiveId: ObjectiveId; levels: Record<PlayerId, number> }
export interface StatQueryHookContext extends HookContextBase { hook: 'onStatQuery'; queryUnitId: UnitId; queryModelId: ModelId | null; weapon: RuntimeWeapon | null; stat: NonNullable<Effect['modifyStat']>['stat'] }
export interface EligibilityHookContext extends HookContextBase { hook: 'onEligibility'; queryUnitId: UnitId; check: 'shoot' | 'charge' | 'fightFirst' | 'stationaryBonus' | 'surge' }

export type HookContext =
  | PhaseHookContext | BattleShockHookContext | AdvanceRollHookContext | ChargeRollHookContext | MoveHookContext | ChargeHookContext
  | UnitSelectedHookContext | TargetsDeclaredHookContext | AttacksAllocatedHookContext | AttackCountHookContext | AttackRollHookContext
  | DamageHookContext | DestroyedHookContext | DeploymentHookContext | ObjectiveHookContext | StatQueryHookContext | EligibilityHookContext

export type HookContextFor<K extends HookName> = Extract<HookContext, { hook: K }>

// ---------- results ----------
export type RerollKind = 'ones' | 'fails' | 'all' | 'oneDie'

// returned by roll hooks; engine sums modifiers then clamps hit/wound to ±1 and save improvement to +1
export interface RollModifierResult {
  kind: 'roll'
  modifier?: number
  reroll?: RerollKind
  autoPass?: boolean
  autoFail?: boolean
  ignoreModifiers?: boolean
  critThreshold?: number
  ignoreCover?: boolean
  invuln?: number
  feelNoPain?: number
}
export interface StatModifierResult { kind: 'stat'; delta?: number; set?: number }
export interface AttackCountResult { kind: 'attacks'; delta?: number }
export interface DamageModifierResult { kind: 'damage'; delta?: number; halve?: boolean; reduction?: number; set?: number }
export interface EligibilityResult { kind: 'eligibility'; allow?: boolean; deny?: boolean }
export interface MoveModifierResult { kind: 'move'; extraDistance?: number; forbid?: boolean }
// side effects a hook asks the engine to perform (engine applies them and emits events)
export interface EffectRequest {
  kind: 'request'
  mortalWounds?: { targetUnitId: UnitId; count: number }[]
  cp?: number
  vp?: { amount: number; source: string }
  battleShockTest?: UnitId[]
  openDecision?: { topic: string; unitId: UnitId | null; options: string[] }
  grantEffect?: { unitId: UnitId; effect: Effect; duration: AbilityDescriptor['duration'] }
  log?: string
}
export type HookResult =
  | RollModifierResult | StatModifierResult | AttackCountResult | DamageModifierResult | EligibilityResult | MoveModifierResult | EffectRequest

export type HookResultFor<K extends HookName> =
  K extends 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll' | 'onDamageRoll' | 'onFeelNoPainRoll' | 'onBattleShockTest' | 'onAdvanceRoll' | 'onChargeRoll'
    ? RollModifierResult | EffectRequest
    : K extends 'onStatQuery' ? StatModifierResult
    : K extends 'onAttackCount' ? AttackCountResult
    : K extends 'onDamage' ? DamageModifierResult | EffectRequest
    : K extends 'onEligibility' ? EligibilityResult
    : K extends 'onMove' ? MoveModifierResult | EffectRequest
    : EffectRequest

export type HookFn<K extends HookName = HookName> = (ctx: HookContextFor<K>) => HookResultFor<K> | HookResultFor<K>[] | void

// bespoke `code` hook, registered by name in src/engine/hooks/registry.ts; `estimate` feeds the AI damage calculator
export interface CodeHook<K extends HookName = HookName> {
  name: string
  hook: K
  run: HookFn<K>
  estimate?: (ctx: HookContextFor<K>) => Partial<Record<'hitMod' | 'woundMod' | 'saveMod' | 'damageMult' | 'attacksDelta', number>>
}
export type HookRegistry = Record<string, CodeHook>

// ---------- declarative descriptor → hook mapping ----------
export const TRIGGER_HOOK: Record<Trigger, HookName> = {
  always: 'onStatQuery',
  phaseStart: 'onPhaseStart',
  phaseEnd: 'onPhaseEnd',
  turnStart: 'onTurnStart',
  turnEnd: 'onTurnEnd',
  commandPhase: 'onCommandPhase',
  battleShockTest: 'onBattleShockTest',
  advanceRoll: 'onAdvanceRoll',
  chargeRoll: 'onChargeRoll',
  unitMoved: 'onMove',
  unitSelectedToShoot: 'onUnitSelectedToShoot',
  unitSelectedToFight: 'onUnitSelectedToFight',
  targetsDeclared: 'onTargetsDeclared',
  attacksAllocated: 'onAttacksAllocated',
  hitRoll: 'onHitRoll',
  woundRoll: 'onWoundRoll',
  saveRoll: 'onSaveRoll',
  damageRoll: 'onDamageRoll',
  feelNoPainRoll: 'onFeelNoPainRoll',
  damageApplied: 'onDamage',
  modelDestroyed: 'onModelDestroyed',
  unitDestroyed: 'onUnitDestroyed',
  deployment: 'onDeployment',
  reinforcements: 'onReinforcements',
  objectiveControl: 'onObjectiveControl',
}

// which hooks each Effect key is evaluated at, independent of the descriptor's trigger (e.g. `always` + invuln)
export const EFFECT_HOOKS: Record<keyof Effect, HookName[]> = {
  when: [],
  reroll: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onDamageRoll', 'onChargeRoll', 'onAdvanceRoll', 'onBattleShockTest'],
  modifyRoll: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onDamageRoll', 'onChargeRoll', 'onAdvanceRoll', 'onBattleShockTest'],
  modifyStat: ['onStatQuery'],
  setStat: ['onStatQuery'],
  invuln: ['onSaveRoll'],
  feelNoPain: ['onFeelNoPainRoll'],
  ignoreCover: ['onSaveRoll'],
  ignoreModifiers: ['onHitRoll', 'onWoundRoll'],
  autoResult: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onBattleShockTest', 'onChargeRoll', 'onAdvanceRoll'],
  grantWeaponAbility: ['onStatQuery'],
  grantKeyword: ['onStatQuery'],
  extraAttacks: ['onAttackCount'],
  mortalWounds: ['onHitRoll', 'onWoundRoll', 'onDamage'],
  damageReduction: ['onDamage'],
  halveDamage: ['onDamage'],
  cp: ['onCommandPhase', 'onPhaseEnd', 'onTurnEnd'],
  vp: ['onPhaseEnd', 'onTurnEnd', 'onCommandPhase'],
  move: ['onMove'],
  fightsFirst: ['onEligibility'],
  fightsLast: ['onEligibility'],
  shootAfterAdvance: ['onEligibility'],
  shootAfterFallBack: ['onEligibility'],
  chargeAfterAdvance: ['onEligibility'],
  chargeAfterFallBack: ['onEligibility'],
  stealth: ['onHitRoll'],
  lethalOn: ['onHitRoll'],
}

// hooks a descriptor must be registered at: its trigger's hook plus every hook its effect keys need
export function hooksForDescriptor(descriptor: AbilityDescriptor): HookName[] {
  void descriptor
  throw new Error('not implemented')
}
