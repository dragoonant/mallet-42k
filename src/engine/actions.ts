// Every legal player input: decision answers plus pass / useStratagem / commandReroll / resign (00-arch §5).
import type { DecisionId, Id, ModelId, MoveType, Path, PlayerId, StratagemId, UnitId, Vec3, WeaponId } from './types'

// seq is assigned by the engine on accept (= index in state.log)
export interface ActionBase { player: PlayerId; decisionId: DecisionId; seq?: number }

export interface ModelPlacement { modelId: ModelId; pos: Vec3; facing?: number; path?: Path }

export interface DeployUnitAction extends ActionBase {
  type: 'deployUnit'
  unitId: UnitId
  placements: ModelPlacement[]
  toReserves?: boolean
}
export interface ChooseUnitToActivateAction extends ActionBase { type: 'chooseUnitToActivate'; unitId: UnitId }
export interface MoveUnitAction extends ActionBase {
  type: 'moveUnit'
  unitId: UnitId
  moveType: MoveType
  placements: ModelPlacement[]
}
export interface WeaponTarget { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId; profileGroup?: Id }
export interface DeclareTargetsAction extends ActionBase {
  type: 'declareTargets'
  unitId: UnitId
  targets: WeaponTarget[]
}
export interface AllocateAttackAction extends ActionBase { type: 'allocateAttack'; modelId: ModelId }
export interface DeclareChargeAction extends ActionBase { type: 'declareCharge'; unitId: UnitId; targetUnitIds: UnitId[] }
export interface ChargeMoveAction extends ActionBase { type: 'chargeMove'; unitId: UnitId; placements: ModelPlacement[] }
export interface PileInAction extends ActionBase { type: 'pileIn'; unitId: UnitId; placements: ModelPlacement[] }
export interface ConsolidateAction extends ActionBase { type: 'consolidate'; unitId: UnitId; placements: ModelPlacement[] }
export interface ChooseFightUnitAction extends ActionBase { type: 'chooseFightUnit'; unitId: UnitId }
export interface ChooseOptionAction extends ActionBase { type: 'chooseOption'; optionId: string }
export interface ConfirmAction extends ActionBase { type: 'confirm' }
export interface PassAction extends ActionBase { type: 'pass' }
export interface StratagemTargets { unitIds?: UnitId[]; modelIds?: ModelId[]; objectiveId?: string; optionId?: string }
export interface UseStratagemAction extends ActionBase {
  type: 'useStratagem'
  stratagemId: StratagemId
  targets: StratagemTargets
}
// dieIndex only when the roll is fast-rolled and a single die must be picked
export interface CommandRerollAction extends ActionBase { type: 'commandReroll'; rollId: string; dieIndex?: number }
export interface ResignAction extends ActionBase { type: 'resign' }

export type Action =
  | DeployUnitAction | ChooseUnitToActivateAction | MoveUnitAction | DeclareTargetsAction | AllocateAttackAction
  | DeclareChargeAction | ChargeMoveAction | PileInAction | ConsolidateAction | ChooseFightUnitAction
  | ChooseOptionAction | ConfirmAction | PassAction | UseStratagemAction | CommandRerollAction | ResignAction

export type ActionType = Action['type']
