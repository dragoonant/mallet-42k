// Rendering-only types for the procedural SD figure kit (docs/spec/30-figures.md). Nothing here
// is read by the engine; the engine only ever sees `base` (mm) and `height` on its own Model type.

/** Animation clip driving procedural transforms (30-figures.md §5, Phase A: code-defined, no glTF).
 *  'hit' is a brief flinch, not a resting state — nothing asks for it as an explicit `pose` prop,
 *  it only ever arrives via `FigureAction`. */
export type Pose = 'idle' | 'walk' | 'shoot' | 'melee' | 'hit' | 'death'

/** One-shot animation cue Figure layers over its idle/walk base pose — see FigureProps.action
 *  (Figure.tsx) for the full contract. */
export type FigureActionKind = 'shoot' | 'melee' | 'hit' | 'death'
export interface FigureAction {
  kind: FigureActionKind
  /** Compared only for identity (`!==`) — any new value (a timestamp, an event's `seq`, a
   *  counter) starts a fresh one-shot animation, timed from the moment Figure first observes it
   *  rather than from `t0`'s own value. Caller and Figure clocks never need to agree on units. */
  t0: number | string
}

/** Body-plan family (30-figures.md §2). Drives which renderer + proportions a kit uses. */
export type ArchetypeKind = 'infantry' | 'heavy' | 'monster' | 'vehicle'

/** Every kit this file ships a look for, one per datasheet-listed figure.kit plus generic fallbacks
 *  for any datasheet id this kit doesn't recognise yet (mapped by archetype). */
export type KitId =
  | 'sm-tacticus'
  | 'sm-terminator'
  | 'ork-boy'
  | 'ork-warboss'
  | 'ork-deff-dread'
  | 'ork-deffkopta'
  | 'nec-warrior'
  | 'nec-overlord'
  | 'nec-skorpekh'
  | 'nec-doomstalker'
  | 'nec-scarab'
  | 'csm-legionary'
  | 'csm-zarkan'
  | 'csm-possessed'
  | 'csm-cultist'
  | 'tyr-prime'
  | 'tyr-psychophage'
  | 'tyr-termagant'
  | 'tyr-barbgaunt'
  | 'tyr-leaper'
  | 'ade-canoness'
  | 'ade-sister'
  | 'ade-sister-superior'
  | 'ade-sister-flamer'
  | 'ade-sister-heavy-flamer'
  | 'ade-sister-simulacrum'
  | 'ade-sacresant'
  | 'ade-arco'
  | 'generic-infantry'
  | 'generic-heavy'
  | 'generic-monster'
  | 'generic-vehicle'

/** Faction paintScheme resolved to five colour slots (30-figures.md §4), always fully populated
 *  (falls back to a neutral grey scheme when faction data isn't loaded yet or is unknown). */
export interface PaintColors {
  primary: string
  secondary: string
  trim: string
  metal: string
  decal: string
}

/** Body geometry + weapon dressing for a biped kit (infantry/heavy/monster archetypes — every
 *  datasheet in this data set that isn't a flyer resolves to a biped). */
export type HeadShape = 'marine-helmet' | 'terminator-helmet' | 'ork-head' | 'ork-boss-head' | 'necron-skull' | 'necron-lord' | 'sister-bob' | 'sister-hood' | 'arco-mask' | 'tyranid-head' | 'tyranid-prime-head' | 'tyranid-brute-head' | 'generic-head'
  | 'chaos-helmet' | 'chaos-sorcerer' | 'possessed-head' | 'cultist-hood'
export type WeaponShape =
  | 'none'
  | 'bolt-rifle'
  | 'storm-bolter'
  | 'power-fist'
  | 'slugga'
  | 'choppa'
  | 'boss-choppa'
  | 'power-klaw'
  | 'twin-claw'
  | 'gauss-flayer'
  | 'warscythe'
  | 'hyperphase-blade'
  | 'doomsday-blaster'
  | 'chaos-bolter'
  | 'ritual-staff'
  | 'mutant-claw'
  | 'rusty-blade'
  | 'scything-talons'
  | 'rending-claws'
  | 'fleshborer'
  | 'barblauncher'
  | 'torrent-maw'
  | 'flamer'
  | 'heavy-flamer'
  | 'power-sword'
  | 'mace'
  | 'tower-shield'
  | 'flails'
  | 'banner'
export type ShoulderPad = 'none' | 'small' | 'large'

export interface BipedConfig {
  headShape: HeadShape
  rightWeapon: WeaponShape
  leftWeapon: WeaponShape
  bulk: number // torso/limb thickness multiplier: ~1 infantry, ~1.5 heavy, ~2.2 monster
  hasBackpack: boolean
  shoulderPads: ShoulderPad
  hasCape: boolean
  skin: 'marine' | 'ork' | 'daemon' | 'pale' | 'none' // 'none' = fully helmeted/armoured, no bare skin rendered
  /** Which paint slot the arms use (default 'secondary'). Necron kits take 'metal' so the green stays a glow accent. */
  limbColor?: 'secondary' | 'metal' | 'primary' | 'skin'
  /** A small glowing core on the chest (paintScheme.secondary, emissive). */
  chestCore?: boolean
  /** A brass chest plate with a violet-glow sigil (paintScheme.trim + decal). */
  chestPlate?: boolean
  /** Which paint slot the torso uses (default 'primary'). Robed cultists take 'secondary'. */
  torsoColor?: 'primary' | 'secondary'
  /** Tyranid dressing: a swept-back crest of spines on the back (decal-coloured tips). */
  dorsalSpines?: boolean
  /** Tyranid dressing: a tapering tail behind the hips. */
  tail?: boolean
  /** Tyranid dressing: a pair of membrane wings behind the shoulders (Winged Prime). */
  wings?: boolean
  /** Tyranid dressing: a second, smaller pair of grasping arms below the main pair. */
  extraArms?: boolean
  /** Torso pitch forward, in radians — a hunched, predatory stance. */
  hunch?: number
  /** Sororitas dressing: a glowing halo disc behind the head, a bone-coloured tabard over the torso front,
   *  the cape in trim colour (crimson) rather than secondary, bare skin for the torso (Arco-flagellants),
   *  and the leg colour (a crimson loincloth reads from the trim slot). */
  halo?: boolean
  tabard?: boolean
  capeColor?: 'secondary' | 'trim'
  bareTorso?: boolean
  legColor?: 'primary' | 'trim'
}

export interface VehicleConfig {
  weapon: 'kustom-mega-blasta' | 'kopta-rokkits' | 'none'
  hasRotor: boolean
}

/** Props shared by every body renderer (BipedBody / VehicleBody). Authored at unit height
 *  (feet at y=0, crown at y≈1); Figure wraps the result in a group scaled to the real height. */
export interface BodyProps {
  colors: PaintColors
  pose: Pose
  seed: number
}
