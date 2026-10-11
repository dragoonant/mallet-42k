// Which pre-made terrain GLBs (public/assets/terrain/ruins/<slug>.glb) the board may draw. Remove a
// slug to force that piece type back to its procedural look; a listed slug whose file is missing or
// fails to load also falls back silently (see ruinModels.ts). Visual only.
export type RuinSlug =
  | 'ruin-corner' | 'ruin-facade' | 'ruin-small' | 'ruin-tall' | 'barricade' | 'crater' | 'bunker-a' | 'bunker-b'
  | 'ruin-corner-2' | 'ruin-corner-3' | 'ruin-corner-4' | 'ruin-corner-5'
  | 'ruin-rect-1' | 'ruin-rect-2' | 'ruin-rect-3' | 'ruin-rect-4'

export const ENABLED_RUIN_MODELS: readonly RuinSlug[] = [
  'ruin-corner',
  'ruin-facade',
  'ruin-small',
  'ruin-tall',
  'barricade',
  'crater',
  'bunker-a',
  'bunker-b',
  // 'ruin-corner-2' disabled: a sealed box, not an L, so it hides units standing on the upper floor.
  'ruin-corner-3',
  'ruin-corner-4',
  'ruin-corner-5',
  'ruin-rect-1',
  'ruin-rect-2',
  'ruin-rect-3',
  'ruin-rect-4',
]
