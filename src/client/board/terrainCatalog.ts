// Whirr-style terrain catalog: for every terrain kind, where its visual comes from and the box that visual MUST fit.
// The rules (src/engine/terrain.ts) use the data footprint / walls / floors; the art is fitted to those boxes and
// tests/client/terrainCatalog.test.ts asserts the fitted bboxes stay inside them (the TER-121 idea).
//
//   kind       visual source                         box the art must fit                       visual height
//   ruin       KIT (ruinKit.ts): wall panels cut     each data wall: length x height x          wall.height (exact);
//              from RUIN_KIT_WALL_SLUGS GLBs, floor  (thickness + RUIN_KIT_DEPTH_PAD); pillars  floors: top at floor.height
//              slabs, corner pillars. Procedural     at wall joins; floor slab = floor polygon
//              plain walls only as a load fallback
//   crate      GLB bunker-a / bunker-b                footprint bbox (+-5%)                       piece.height
//   barricade  GLB barricade                          footprint bbox (+-5%)                       piece.height
//   crater     GLB crater (flattened) + rim rocks    footprint bbox (+-5%) (rim rocks may        min(piece.height, CRATER_FLOOR_MAX_HEIGHT)
//                                                    overhang <= 0.3in, they are not the model)
import type { TerrainPieceData } from '@/data/types'

export type VisualSource = 'kit' | 'glb' | 'procedural'

/** GLBs the ruin kit may cut wall panels from; only the slab-like ones (thin in depth, see RUIN_KIT_MAX_DEPTH_RATIO) are used.
 *  ruin-citadel-wall-2 is a plain sci-fi bulkhead (a blank slab from the front) and ruin-facade is thick, so both are left out:
 *  the gothic window wall (1) and the broken arch wall (3) read as citadel ruins. */
export const RUIN_KIT_WALL_SLUGS = ['ruin-citadel-wall-1', 'ruin-citadel-wall-3'] as const
/** A model counts as slab-like when depth / length is at most this. */
export const RUIN_KIT_MAX_DEPTH_RATIO = 0.45
/** Panel depth = wall thickness + this (0.1in of surface relief each side; the tolerance is 0.15in each side). */
export const RUIN_KIT_DEPTH_PAD = 0.2
/** Upper-floor slab thickness (top face exactly at floor.height). */
export const RUIN_KIT_FLOOR_THICKNESS = 0.2
export const ENGINE_DEFAULT_WALL_THICKNESS = 0.25 // matches engine wallOccupiesPoint default
/** A crater is standable ground: nothing inside its footprint may poke above this. */
export const CRATER_FLOOR_MAX_HEIGHT = 0.28

export interface CatalogEntry {
  source: VisualSource
  /** GLB slugs ('kit' lists the wall slugs the kit cuts panels from). */
  slugs: readonly string[]
  /** Pieces whose GLB is fitted to the footprint bbox (all but the kit). */
  fitsFootprint: boolean
}

export const TERRAIN_CATALOG: Record<TerrainPieceData['kind'], CatalogEntry> = {
  ruin: { source: 'kit', slugs: RUIN_KIT_WALL_SLUGS, fitsFootprint: false },
  crate: { source: 'glb', slugs: ['bunker-a', 'bunker-b'], fitsFootprint: true },
  barricade: { source: 'glb', slugs: ['barricade'], fitsFootprint: true },
  crater: { source: 'glb', slugs: ['crater'], fitsFootprint: true },
  wall: { source: 'procedural', slugs: [], fitsFootprint: false },
  forest: { source: 'procedural', slugs: [], fitsFootprint: false },
}

/** Visual height the art is fitted to for a footprint-fitted GLB piece. */
export function glbVisualHeight(kind: TerrainPieceData['kind'], pieceHeight: number): number {
  return kind === 'crater' ? Math.min(Math.max(pieceHeight, 0.05), CRATER_FLOOR_MAX_HEIGHT) : pieceHeight
}
