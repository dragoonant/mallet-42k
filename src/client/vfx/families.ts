// The look of each ranged weapon family, as plain data (no three.js here, so tests and the gallery can read it).
// fx.ts turns one of these into pooled sprites/strips/models; tuning a family never touches the engine.
//
// Reading guide: a shot = muzzle flash -> projectile -> impact. Distances are inches, speeds inches/second,
// times seconds. Colours are CSS hex. Sprite/model names are the files under /assets/vfx/.
import type { VfxFamily } from './types'
import type { SpriteName } from './textures'
import type { ModelName } from './models'

export type ProjectileType =
  | 'streak' // a bright tracer streak (optionally with a 3D slug at its head), flies muzzle -> target
  | 'orb' // a glowing sprite orb with a glow trail
  | 'beam' // instant thick beam, bright core that fades
  | 'arc' // instant jagged lightning arc
  | 'cone' // a cone of fire_blob particles
  | 'lob' // an arcing lob (model and/or sprite)
  | 'rocket' // a rocket model on a near-straight flight with a smoke trail

export type ImpactKind =
  | 'sparks' | 'zap' | 'small' | 'blast' | 'big' | 'acid' | 'warp' | 'plasma' | 'melta' | 'beam' | 'fire'

export interface TrailSpec {
  sprite: SpriteName
  /** Puffs per second. */
  rate: number
  size0: number
  size1: number
  life: number
  /** Starting opacity (fades to 0). */
  alpha: number
  additive: boolean
  color: string
  /** Sideways scatter speed. */
  spread?: number
  /** Upward drift speed (smoke rises). */
  rise?: number
}

export interface FamilyFx {
  family: VfxFamily
  label: string
  /** Example weapons shown on the gallery page. */
  examples: string
  muzzle: { sprite: SpriteName | null; color: string; size: number; life: number; sparks: number; smoke: boolean }
  projectile: {
    type: ProjectileType
    /** Inches per second for travelling projectiles. */
    speed: number
    /** Fixed duration in seconds for beams/arcs/cones (travelling types ignore it). */
    duration?: number
    color: string
    /** Hot centre colour (beam core, orb centre, streak head). */
    core: string
    /** Tracer / beam thickness in inches. */
    width: number
    /** Tracer streak length, or the model's length, in inches. */
    length: number
    sprite?: SpriteName
    model?: ModelName
    /** Lob/rocket arc height as a fraction of the flight distance. */
    arc?: number
    /** Model tumble, radians/second. */
    spin?: number
    /** Glow orb size at the projectile head (0/undefined = none). */
    head?: number
    /** Beam shimmer amplitude (0..1), for melta heat. */
    wobble?: number
    trail?: TrailSpec
  }
  impact: ImpactKind
  /** Multiplies the impact recipe's size. */
  impactScale: number
  impactColor: string
  /** Default gap between consecutive projectiles of a volley, ms. */
  staggerMs: number
}

export const FAMILY_FX: Record<VfxFamily, FamilyFx> = {
  bolt: {
    family: 'bolt', label: 'Bolt', examples: 'Boltgun, bolt pistol, storm bolter, combi-weapon',
    muzzle: { sprite: 'muzzle_ballistic', color: '#ffd27a', size: 0.7, life: 0.07, sparks: 2, smoke: false },
    projectile: { type: 'streak', speed: 95, color: '#ff9a3a', core: '#fff1c0', width: 0.1, length: 1.5, head: 0.28 },
    impact: 'sparks', impactScale: 1, impactColor: '#ffb04a', staggerMs: 55,
  },
  autocannon: {
    family: 'autocannon', label: 'Autocannon', examples: 'Heavy bolter, heavy stubber, assault cannon, seismic cannon',
    muzzle: { sprite: 'muzzle_ballistic', color: '#ffc45a', size: 1.2, life: 0.09, sparks: 4, smoke: true },
    projectile: { type: 'streak', speed: 80, color: '#ffc040', core: '#fff0b0', width: 0.17, length: 2.4, model: 'slug', head: 0.4 },
    impact: 'small', impactScale: 0.9, impactColor: '#ffb040', staggerMs: 70,
  },
  las: {
    family: 'las', label: 'Las', examples: 'Lasgun, laspistol',
    muzzle: { sprite: 'muzzle_energy', color: '#ff5a46', size: 0.55, life: 0.07, sparks: 0, smoke: false },
    projectile: { type: 'streak', speed: 130, color: '#ff3a2a', core: '#ffd8cc', width: 0.07, length: 2.2, head: 0.3 },
    impact: 'zap', impactScale: 0.9, impactColor: '#ff6a50', staggerMs: 60,
  },
  lascannon: {
    family: 'lascannon', label: 'Lascannon', examples: 'Lascannon, heavy beam weapons',
    muzzle: { sprite: 'muzzle_energy', color: '#ff6a4a', size: 1.5, life: 0.2, sparks: 3, smoke: false },
    projectile: { type: 'beam', speed: 0, duration: 0.45, color: '#ff4a2a', core: '#fff4ee', width: 0.45, length: 0 },
    impact: 'beam', impactScale: 1.2, impactColor: '#ff7a4a', staggerMs: 300,
  },
  plasma: {
    family: 'plasma', label: 'Plasma', examples: 'Plasma gun, plasma pistol, plasma cannon (and supercharged)',
    muzzle: { sprite: 'muzzle_energy', color: '#7ac0ff', size: 0.95, life: 0.12, sparks: 3, smoke: false },
    projectile: {
      type: 'orb', speed: 48, color: '#6fb6ff', core: '#ffffff', width: 0.6, length: 0, sprite: 'plasma_orb', head: 1.1,
      trail: { sprite: 'glow_orb', rate: 60, size0: 0.55, size1: 0.1, life: 0.22, alpha: 0.7, additive: true, color: '#4f9bff', spread: 0.3 },
    },
    impact: 'plasma', impactScale: 1, impactColor: '#8cc8ff', staggerMs: 130,
  },
  melta: {
    family: 'melta', label: 'Melta', examples: 'Meltagun, fusion blaster',
    muzzle: { sprite: 'muzzle_energy', color: '#ffa040', size: 1.1, life: 0.18, sparks: 4, smoke: false },
    projectile: {
      type: 'beam', speed: 0, duration: 0.55, color: '#ff8a2a', core: '#fff0c0', width: 0.5, length: 0, wobble: 0.45,
      trail: { sprite: 'smoke_puff_2', rate: 30, size0: 0.4, size1: 1.1, life: 0.5, alpha: 0.28, additive: true, color: '#ff9a3a', spread: 0.5, rise: 0.8 },
    },
    impact: 'melta', impactScale: 1, impactColor: '#ff9a40', staggerMs: 260,
  },
  flamer: {
    family: 'flamer', label: 'Flamer', examples: 'Flamer, heavy flamer, pyreblaster, incinerator',
    muzzle: { sprite: 'fire_blob', color: '#ffb050', size: 0.9, life: 0.16, sparks: 0, smoke: false },
    projectile: { type: 'cone', speed: 20, duration: 0.7, color: '#ff7a20', core: '#ffe08a', width: 1, length: 0, sprite: 'fire_blob' },
    impact: 'fire', impactScale: 1, impactColor: '#ff8030', staggerMs: 110,
  },
  missile: {
    family: 'missile', label: 'Missile', examples: 'Rokkit launcha, hunter-killer missile, malleus rocket launcher, field gun',
    muzzle: { sprite: 'muzzle_ballistic', color: '#ffc880', size: 1.4, life: 0.14, sparks: 3, smoke: true },
    projectile: {
      type: 'rocket', speed: 38, color: '#ffb050', core: '#fff0c0', width: 0.3, length: 1.5, model: 'rocket', arc: 0.07, head: 0.9,
      trail: { sprite: 'smoke_puff_1', rate: 26, size0: 0.3, size1: 0.95, life: 0.65, alpha: 0.42, additive: false, color: '#d8d8d8', spread: 0.25, rise: 0.3 },
    },
    impact: 'big', impactScale: 1, impactColor: '#ffa040', staggerMs: 150,
  },
  grenade: {
    family: 'grenade', label: 'Grenade', examples: 'Grenade launcher (frag and krak), demolition charges',
    muzzle: { sprite: 'muzzle_ballistic', color: '#ffd090', size: 0.8, life: 0.09, sparks: 2, smoke: true },
    projectile: { type: 'lob', speed: 22, color: '#a8b070', core: '#ffffff', width: 0.3, length: 0.8, model: 'frag_grenade', arc: 0.22, spin: 9 },
    impact: 'blast', impactScale: 1.15, impactColor: '#ffa040', staggerMs: 140,
  },
  gauss: {
    family: 'gauss', label: 'Gauss', examples: 'Gauss flayer, gauss reaper, tachyon arrow, doomsday blaster',
    muzzle: { sprite: 'muzzle_energy', color: '#5dff8a', size: 0.7, life: 0.1, sparks: 0, smoke: false },
    projectile: { type: 'arc', speed: 0, duration: 0.22, color: '#3dff72', core: '#eafff0', width: 0.22, length: 0 },
    impact: 'zap', impactScale: 1.1, impactColor: '#52ff86', staggerMs: 65,
  },
  pulse: {
    family: 'pulse', label: 'Pulse', examples: 'Pulse rifle, pulse carbine, burst cannon, ion raker, rail weapons',
    muzzle: { sprite: 'muzzle_energy', color: '#6fdcff', size: 0.6, life: 0.07, sparks: 0, smoke: false },
    projectile: { type: 'streak', speed: 115, color: '#4fcfff', core: '#e6fbff', width: 0.09, length: 1.1, head: 0.5 },
    impact: 'zap', impactScale: 1, impactColor: '#6fdcff', staggerMs: 50,
  },
  dakka: {
    family: 'dakka', label: 'Dakka', examples: 'Shoota, slugga, big shoota, kustom mega-blasta',
    muzzle: { sprite: 'muzzle_ballistic', color: '#ffc050', size: 0.85, life: 0.06, sparks: 3, smoke: true },
    projectile: { type: 'streak', speed: 72, color: '#ffb02a', core: '#fff4c8', width: 0.13, length: 1.0, head: 0.3 },
    impact: 'sparks', impactScale: 1.1, impactColor: '#ffa83a', staggerMs: 38,
  },
  bio: {
    family: 'bio', label: 'Bio', examples: 'Fleshborer, barblauncher, devourers, spinefists, webber',
    muzzle: { sprite: 'muzzle_energy', color: '#9aff5a', size: 0.7, life: 0.12, sparks: 2, smoke: false },
    projectile: {
      type: 'lob', speed: 26, color: '#7ee04a', core: '#e0ffb0', width: 0.45, length: 0.7, sprite: 'bio_glob', model: 'bio_borer', arc: 0.17, spin: 6, head: 0.75,
      trail: { sprite: 'glow_orb', rate: 36, size0: 0.3, size1: 0.08, life: 0.3, alpha: 0.6, additive: true, color: '#6ad43a', spread: 0.4 },
    },
    impact: 'acid', impactScale: 1, impactColor: '#8cff4a', staggerMs: 85,
  },
  psychic: {
    family: 'psychic', label: 'Psychic', examples: 'Smite, purge soul, psilencer, psycannon, rite of possession',
    muzzle: { sprite: 'muzzle_energy', color: '#c488ff', size: 1.0, life: 0.14, sparks: 2, smoke: false },
    projectile: {
      type: 'orb', speed: 52, color: '#b46bff', core: '#f6e8ff', width: 0.5, length: 0, sprite: 'warp_wisp', head: 1.0,
      trail: { sprite: 'warp_wisp', rate: 40, size0: 0.55, size1: 0.15, life: 0.35, alpha: 0.7, additive: true, color: '#b46bff', spread: 0.6 },
    },
    impact: 'warp', impactScale: 1, impactColor: '#c488ff', staggerMs: 110,
  },
}

/** Most projectiles drawn for one volley; a bigger one is thinned evenly (hit ratio preserved). */
export const MAX_VOLLEY_SHOTS = 20
