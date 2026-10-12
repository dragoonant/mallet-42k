// Shared types for the VFX layer (src/client/vfx/**). Presentational only — nothing here is read
// by the engine or by any other src/client/** module; callers reach this layer only through the
// imperative `vfx` API (see index.ts).

/** A board-space point in inches, y-up (matches engine Model.pos / src/client/board conventions). */
export interface Vec3Like {
  x: number
  y: number
  z: number
}

/** Ranged weapon look driving tracer colour/thickness/behaviour in vfx.shoot(). */
export type ShotKind = 'bolter' | 'shoota' | 'heavy' | 'flame' | 'psychic'

/** The 14 ranged visual families (src/client/vfx/families.ts holds each one's look). Classified from a
 *  weapon's name / abilities / faction by weaponFlavour.ts's `vfxFamily`. */
export type VfxFamily =
  | 'bolt' | 'autocannon' | 'las' | 'lascannon' | 'plasma' | 'melta' | 'flamer'
  | 'missile' | 'grenade' | 'gauss' | 'pulse' | 'dakka' | 'bio' | 'psychic'

/** One projectile of a volley: where it leaves, where it is aimed (the target model), and whether it lands. */
export interface VolleyShot {
  from: Vec3Like
  to: Vec3Like
  /** true = lands on `to`; false = flies past/near it and strikes the ground beside it. */
  hit: boolean
}

export interface VolleyOptions {
  family: VfxFamily
  shots: VolleyShot[]
  /** Override the family's default gap between consecutive projectiles, in ms. */
  staggerMs?: number
}

/** Loose faction id (e.g. the engine's 'sm' | 'ork') used only to pick a melee spark colour;
 *  an unrecognised id falls back to a neutral colour rather than throwing. */
export type FactionLike = string

/** Imperative surface other client code calls into. Every method is fire-and-forget and safe to
 *  call even before/after <VfxLayer/> is mounted (a no-op when no layer is registered). */
export interface VfxApi {
  /** Tracer + muzzle flash from a firer position to an impact/target point. */
  shoot(from: Vec3Like, to: Vec3Like, kind: ShotKind): void
  /** A staggered volley of per-attack projectiles of one weapon family (capped at ~20 visible). */
  volley(opts: VolleyOptions): void
  /** Impact spark burst at a hit location; severity in [0,1] scales the burst size/count. */
  hit(at: Vec3Like, severity: number): void
  /** Small cyan shield flicker where an attack was saved. */
  save(at: Vec3Like): void
  /** Melee clash (sparks + slash streaks) tinted by the attacking model's faction. */
  melee(at: Vec3Like, attackerFaction: FactionLike): void
  /** Dust puff + debris where a model was destroyed. */
  death(at: Vec3Like): void
  /** A trail of dust puffs rippling along a charge/pile-in/consolidate path. */
  chargeDust(path: Vec3Like[]): void
  /** Expanding pulse ring at an objective, in a caller-chosen colour (control change feedback). */
  objectivePulse(at: Vec3Like, colour: string): void
  /** Distinct void-purple burst for mortal wound damage (vs. the orange of a normal hit). */
  mortal(at: Vec3Like): void
}
