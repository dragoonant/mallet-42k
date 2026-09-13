// State helpers for engine tests: build models/footprints for geometry tests and put fixture units on the board.
import { createGameState, mmToInch, setModelPos, type Footprint, type GameState, type Model, type ModelId, type UnitId, type Vec3 } from '../../src/engine'
import { ENGINE_VERSION } from '../../src/engine'
import { bundle } from './bundle'
import { makeSetup } from './setup'

// a standalone footprint (base centre at x,z, contact height y, base diameter in mm)
export function footprint(x: number, z: number, mm = 32, y = 0, facing = 0, mm2?: number): Footprint {
  return { pos: { x, y, z }, facing, base: { shape: mm2 === undefined ? 'round' : 'oval', radius: mmToInch(mm) / 2, ...(mm2 !== undefined ? { radius2: mmToInch(mm2) / 2 } : {}) } }
}

export function model(id: ModelId, unitId: UnitId, x: number, z: number, mm = 32, y = 0): Model {
  const f = footprint(x, z, mm, y)
  return {
    id, unitId, datasheetModelId: 'test', pos: f.pos, facing: 0, base: f.base, height: 1.6, woundsRemaining: 1, weapons: [], oneShotUsed: [],
    flags: { allocatedThisPhase: false, inBaseContactWithEnemy: false, desperateEscapeTested: false },
  }
}

// n round-based models of one unit in a row along x, `gap` inches between base edges
export function row(unitId: UnitId, n: number, startX: number, z: number, gap: number, mm = 32): Model[] {
  const d = mmToInch(mm)
  return Array.from({ length: n }, (_, i) => model(`${unitId}#${i}`, unitId, startX + i * (d + gap), z, mm))
}

// a fresh GameState from the fixtures (no reducer involved; setup roll-offs skipped)
export function freshState(overrides: Parameters<typeof makeSetup>[0] = {}): GameState {
  return createGameState(makeSetup(overrides), bundle, 'fixture', ENGINE_VERSION)
}

// put a unit on the board with its models at the given positions (index order); positions default to a row at z
export function placeUnit(state: GameState, unitId: UnitId, positions: (Vec3 | [number, number])[] | { x: number; z: number; gap?: number }): void {
  const unit = state.units[unitId]
  if (!unit) throw new Error(`placeUnit: unknown unit ${unitId}`)
  unit.location = 'board'
  const ids = unit.models
  if (Array.isArray(positions)) {
    ids.forEach((id, i) => {
      const p = positions[i] ?? positions[positions.length - 1]
      const pos: Vec3 = Array.isArray(p) ? { x: p[0], y: 0, z: p[1] } : p
      setModelPos(state.models[id], pos)
    })
  } else {
    const gap = positions.gap ?? 0.5
    ids.forEach((id, i) => {
      const m = state.models[id]
      setModelPos(m, { x: positions.x + i * (m.base.radius * 2 + gap), y: 0, z: positions.z })
    })
  }
}
