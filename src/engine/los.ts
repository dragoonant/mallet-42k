// Line of sight and Benefit of Cover (10-rules §3.1, §3.3). Owner: W1-B. Pure queries over state; the shooting module
// asks `unitVisible` when targets are declared and `benefitOfCover` when an attack is allocated.
import { baseEdgePoints } from './geometry'
import type { GameState, Model, ModelId, RuntimeWeapon, UnitId, Vec3 } from './types'

export interface LosService {
  // 00-arch §7: base centre at heights {0.2, height/2, height} plus 4 base-edge points at height/2
  samplePoints(model: Model): Vec3[]
  // R-3.1: any sample point of `to` visible from any sample point of `from`
  visible(state: GameState, fromModelId: ModelId, toModelId: ModelId): boolean
  // R-3.3
  fullyVisible(state: GameState, fromModelId: ModelId, toModelId: ModelId): boolean
  // R-3.2 / R-3.4
  unitVisible(state: GameState, fromModelId: ModelId, targetUnitId: UnitId): boolean
  unitFullyVisible(state: GameState, fromModelId: ModelId, targetUnitId: UnitId): boolean
  // R-3.11–R-3.14 for one allocated ranged attack (IGNORES COVER, Sv 3+ vs AP0 exception, cover-granting effects)
  benefitOfCover(state: GameState, targetModelId: ModelId, attackerUnitId: UnitId, weapon: RuntimeWeapon): boolean
}

// permissive placeholder: everything is visible and nothing has cover until W1-B lands the raycasts
export const losService: LosService = {
  samplePoints(model) {
    const { x, y, z } = model.pos
    const h = model.height
    const pts: Vec3[] = [{ x, y: y + 0.2, z }, { x, y: y + h / 2, z }, { x, y: y + h, z }]
    for (const e of baseEdgePoints(model, 4)) pts.push({ x: e.x, y: y + h / 2, z: e.z })
    return pts
  },
  // TODO(W1-B): raycasts against Board.pieces walls/floors, obscuring ruins (R-3.7), other-unit models as blockers
  visible: () => true,
  fullyVisible: () => true,
  unitVisible: () => true,
  unitFullyVisible: () => true,
  // TODO(W1-B)
  benefitOfCover: () => false,
}
