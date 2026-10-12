// Which pre-made terrain GLBs (public/assets/terrain/ruins/<slug>.glb) the board may draw. Remove a
// slug to force that piece type back to its procedural look; a listed slug whose file is missing or
// fails to load also falls back silently (see ruinModels.ts). Visual only.
export type RuinSlug =
  | 'ruin-corner' | 'ruin-facade' | 'ruin-small' | 'ruin-tall' | 'barricade' | 'crater' | 'bunker-a' | 'bunker-b'
  | 'ruin-citadel-corner-1' | 'ruin-citadel-corner-3' | 'ruin-citadel-corner-4'
  | 'ruin-citadel-wall-1' | 'ruin-citadel-wall-2' | 'ruin-citadel-wall-3'

// L-shaped ruins (2in-wide arms) are deliberately NOT drawn from a GLB: every corner model ('ruin-corner',
// 'ruin-citadel-corner-*') is bulky at ground level, so fitted to the footprint it fills the narrow strip where the
// engine lets bases stand and/or spills into the notch (tests/e2e/terrain-fit.spec.ts measured 5-16% of legal ground
// inside mesh). Without a corner model the L ruins draw the procedural walls, which sit exactly on the data walls.
// Re-add a corner slug here only if terrain-fit stays under 2% with it.
export const ENABLED_RUIN_MODELS: readonly RuinSlug[] = [
  'ruin-facade',
  'ruin-small',
  'ruin-tall',
  'barricade',
  'crater',
  'bunker-a',
  'bunker-b',
  'ruin-citadel-wall-1',
  'ruin-citadel-wall-2',
  'ruin-citadel-wall-3',
]
