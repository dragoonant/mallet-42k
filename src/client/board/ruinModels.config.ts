// Which pre-made terrain GLBs (public/assets/terrain/ruins/<slug>.glb) the board may draw. Remove a
// slug to force that piece type back to its procedural look; a listed slug whose file is missing or
// fails to load also falls back silently (see ruinModels.ts). Visual only.
export type RuinSlug = 'ruin-corner' | 'ruin-facade' | 'ruin-small' | 'ruin-tall' | 'barricade' | 'crater'

export const ENABLED_RUIN_MODELS: readonly RuinSlug[] = [
  'ruin-corner',
  'ruin-facade',
  'ruin-small',
  'ruin-tall',
  'barricade',
  'crater',
]
