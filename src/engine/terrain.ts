// Terrain service (10-rules §3.2, R-5.7). Owner: W1-B. Movement/charge/fight modules call this for climbs, walls,
// impassable areas and end-of-move legality; LoS uses the same pieces for rays (los.ts).
import { whollyWithinPolygon } from './geometry'
import type { GameState, Model, Path, TerrainPieceId, Vec3 } from './types'

export interface TerrainService {
  // surface height under (x, z): 0 on open ground, a floor height inside a ruin, the top of a HILL/container
  heightAt(state: GameState, x: number, z: number): number
  // may a model end its move with its base centred at pos? (R-5.7: not mid-climb; barricades never; ruin floors only for
  // INFANTRY/BEAST/FLY; hills only if the base does not overhang)
  canEndAt(state: GameState, model: Model, pos: Vec3): { ok: boolean; reason?: string }
  // does the path cross a wall this model cannot pass (ruin walls for non-INFANTRY/BEAST/FLY, impassable pieces)?
  crossesImpassable(state: GameState, model: Model, path: Path): boolean
  // extra movement cost beyond geometry.pathLength (which already charges |Δy|); 0 unless a rule adds more
  extraMoveCost(state: GameState, model: Model, path: Path): number
  // AREA TERRAIN pieces the model is wholly within (R-3.6)
  piecesWhollyWithin(state: GameState, model: Model): TerrainPieceId[]
}

export const terrainService: TerrainService = {
  // TODO(W1-B): floors and hill tops from Board.pieces
  heightAt: () => 0,
  // TODO(W1-B): walls, floors, barricades, hill overhang
  canEndAt: () => ({ ok: true }),
  // TODO(W1-B)
  crossesImpassable: () => false,
  extraMoveCost: () => 0,
  piecesWhollyWithin(state, model) {
    return Object.values(state.board.pieces).filter((p) => whollyWithinPolygon(model, p.footprint)).map((p) => p.id)
  },
}
