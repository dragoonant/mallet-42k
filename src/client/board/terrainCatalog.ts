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

// ---- VARIANT POOLS -------------------------------------------------------------------------------------------------
// Each visual family has a pool of GLB slugs; terrainVariants.ts deals them out per board from the game seed so two
// pieces of one kind differ when the pool has enough entries. TO ADD A VARIANT: append its slug to the matching list in
// NEW_TERRAIN_SLUGS below (that is the only edit; the model must have a manifest.json entry in public/assets/terrain/ruins,
// and tests/client/terrainCatalog.test.ts then checks its fit automatically).
export type VariantKind = 'ruinWall' | 'crate' | 'barricade' | 'crater'

/** LEGACY: the original models. While INCLUDE_LEGACY_TERRAIN_SLUGS is true they stay in the pools. */
const LEGACY_BY_KIND: Record<VariantKind, readonly string[]> = {
  ruinWall: ['ruin-citadel-wall-1', 'ruin-citadel-wall-3'],
  crate: ['bunker-a', 'bunker-b'],
  barricade: ['barricade'],
  crater: ['crater'],
}
export const LEGACY_TERRAIN_SLUGS: readonly string[] = Object.values(LEGACY_BY_KIND).flat()
/** Single switch: set to false once NEW_TERRAIN_SLUGS has entries and the legacy models should drop out of every pool
 *  (a kind with no new slug keeps its legacy ones so it never ends up empty). Files are kept either way. */
export const INCLUDE_LEGACY_TERRAIN_SLUGS = false

/** New variant slugs per kind: the painted v5 set (Gemini concepts -> Hunyuan3D, art/terrain-concepts-v5). */
export const NEW_TERRAIN_SLUGS: Record<VariantKind, readonly string[]> = {
  ruinWall: ['t5-wall-bulkhead', 't5-wall-cathedral', 't5-wall-colonnade', 't5-wall-forge', 't5-wall-hab', 't5-wall-shrine'],
  crate: ['t5-crate-container', 't5-crate-fuel', 't5-crate-pillbox', 't5-crate-supply'],
  barricade: ['t5-barricade-rockcrete', 't5-barricade-sandbag', 't5-barricade-tanktrap'],
  crater: ['t5-crater-pipe', 't5-crater-scorch', 't5-crater-wreck'],
}

/** Every slug declared for a kind, legacy included (what the fit tests must cover). */
function declared(kind: VariantKind): readonly string[] {
  return [...LEGACY_BY_KIND[kind], ...NEW_TERRAIN_SLUGS[kind]]
}
export const declaredPool = declared

/** The slugs the board may actually draw for a kind (legacy filtered out when the switch is off). */
export function variantPool(kind: VariantKind): readonly string[] {
  if (INCLUDE_LEGACY_TERRAIN_SLUGS) return declared(kind)
  const fresh = NEW_TERRAIN_SLUGS[kind]
  return fresh.length ? fresh : LEGACY_BY_KIND[kind]
}

/** Terrain kind -> variant family (kinds without a pool are procedural). */
export const VARIANT_KIND_OF: Partial<Record<TerrainPieceData['kind'], VariantKind>> = {
  ruin: 'ruinWall', crate: 'crate', barricade: 'barricade', crater: 'crater',
}

/** GLBs the ruin kit may cut wall panels from; only the slab-like ones (thin in depth, see RUIN_KIT_MAX_DEPTH_RATIO) are used.
 *  ruin-citadel-wall-2 is a plain sci-fi bulkhead (a blank slab from the front) and ruin-facade is thick, so both are left out:
 *  the gothic window wall (1) and the broken arch wall (3) read as citadel ruins. */
export const RUIN_KIT_WALL_SLUGS: readonly string[] = declared('ruinWall')
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
  ruin: { source: 'kit', slugs: declaredPool('ruinWall'), fitsFootprint: false },
  crate: { source: 'glb', slugs: declaredPool('crate'), fitsFootprint: true },
  barricade: { source: 'glb', slugs: declaredPool('barricade'), fitsFootprint: true },
  crater: { source: 'glb', slugs: declaredPool('crater'), fitsFootprint: true },
  wall: { source: 'procedural', slugs: [], fitsFootprint: false },
  forest: { source: 'procedural', slugs: [], fitsFootprint: false },
}

/** Visual height the art is fitted to for a footprint-fitted GLB piece. */
export function glbVisualHeight(kind: TerrainPieceData['kind'], pieceHeight: number): number {
  return kind === 'crater' ? Math.min(Math.max(pieceHeight, 0.05), CRATER_FLOOR_MAX_HEIGHT) : pieceHeight
}
