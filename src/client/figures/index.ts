// Per-model animation API for the wiring layer (src/client/interaction, src/client/store) to
// drive from engine events. This package owns all motion; callers only ever set target state.
//
//   <Figure
//     datasheetId={unit.datasheetId}   // resolves body kit + base size (src/client/figures/data.ts)
//     faction={faction}                // resolves paint colours
//     position={[m.pos.x, m.pos.y, m.pos.z]}   // optional — Figure eases toward this itself
//                                               // (snaps only on first mount), no wrapper needed
//     rotationY={facingRadians}        // optional — eased with a turn-speed limit, not snapped;
//                                       // set it to direction-of-travel while moving, then to the
//                                       // bearing of a target once an `action` starts, and the
//                                       // figure turns to face it instead of popping
//     moving={isMidMove}               // optional — omit to let Figure infer the walk cycle from
//                                       // `position` motion (>~0.01in from target counts as moving)
//     action={{ kind: 'shoot', t0: event.seq }}  // optional one-shot cue: 'shoot' | 'melee' |
//                                       // 'hit' | 'death'. `t0` is only ever compared for
//                                       // identity (!==) — any new value (a timestamp, an event's
//                                       // seq, a counter) restarts the animation, timed from the
//                                       // moment Figure first observes it, so caller and Figure
//                                       // clocks never need to agree on units or epoch. Clearing
//                                       // `action` (passing undefined) reverts to idle/walk;
//                                       // Figure also reverts on its own after the cue's window
//                                       // (shoot/melee ~700ms, hit ~300ms) — 'death' never reverts.
//     selected={isSelected}
//     highlighted={isClickable}
//     onClick={handleClick}
//   />
//
// `pose` (the raw Pose union: idle/walk/shoot/melee/hit/death) is still accepted as an escape
// hatch that bypasses action/moving inference entirely — used by the figure gallery and
// DeathGhosts, which already know exactly which static pose they want. Prefer `action`/`moving`
// for anything driven by live engine events; Figure owns the timing and reversion so the caller
// doesn't have to run its own setTimeout bookkeeping.
//
// Built-in motion: idle sway; a walk cycle (leg/arm swing, torso counter-twist, footfall bounce —
// heavier `bulk` kits get a slower, harder-stomping stride, no per-kit special-casing); shoot
// recoil; melee lunge-and-swing; a brief hit flinch/knockback; death topple, opacity fade, and
// sink. Vehicles (the Deffkopta) additionally get rotor spin + hover bob, and a ramming lunge for
// melee. See docs/spec/30-figures.md for the visual spec this implements.
export { Figure } from './Figure'
export type { FigureProps } from './Figure'
export { FigureGallery, FigureGalleryStage } from './FigureGallery'
export type { ArchetypeKind, KitId, Pose, FigureAction, FigureActionKind } from './types'
