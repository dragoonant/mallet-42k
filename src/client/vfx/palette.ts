// Colour choices for the VFX layer. Kept separate from pool.ts/VfxLayer.tsx so tuning a look never
// touches the pooling/update logic.
import * as THREE from 'three'
import type { ShotKind } from './types'

export interface ShotPalette {
  /** Colour of the trailing tracer streak. */
  trail: THREE.Color
  /** Colour of the small bright point leading the tracer. */
  head: THREE.Color
}

const SHOT_PALETTE: Record<ShotKind, ShotPalette> = {
  bolter: { trail: new THREE.Color('#ff8a2a'), head: new THREE.Color('#fff3c4') },
  shoota: { trail: new THREE.Color('#7dff5a'), head: new THREE.Color('#e9ffcf') },
  heavy: { trail: new THREE.Color('#7fe0ff'), head: new THREE.Color('#ffffff') },
  flame: { trail: new THREE.Color('#ff5a1f'), head: new THREE.Color('#ffcf6b') },
  psychic: { trail: new THREE.Color('#b46bff'), head: new THREE.Color('#f1e3ff') },
}

export function shotPalette(kind: ShotKind): ShotPalette {
  return SHOT_PALETTE[kind] ?? SHOT_PALETTE.bolter
}

/** Per-shot tracer thickness (inches) and travel time (seconds, bullets only — flame is handled
 *  as a growing cone rather than a travelling tracer). */
export const TRACER_THICKNESS: Record<ShotKind, number> = {
  bolter: 0.05,
  shoota: 0.05,
  heavy: 0.09,
  flame: 0.05,
  psychic: 0.04,
}

export const TRACER_TRAVEL_S: Record<ShotKind, number> = {
  bolter: 0.18,
  shoota: 0.16,
  heavy: 0.22,
  flame: 0.3,
  psychic: 0.26,
}

const FACTION_COLOR: Record<string, string> = {
  sm: '#5aa7ff',
  ork: '#8dff5a',
}

const NEUTRAL_MELEE_COLOR = '#e8e8f0'

export function factionColor(faction: string): THREE.Color {
  return new THREE.Color(FACTION_COLOR[faction] ?? NEUTRAL_MELEE_COLOR)
}

export const IMPACT_COLOR = new THREE.Color('#ffb14a')
export const IMPACT_FLASH_COLOR = new THREE.Color('#fff6d8')
export const SAVE_COLOR = new THREE.Color('#5ad2ff')
export const DUST_COLOR = new THREE.Color('#a08868')
export const DEBRIS_COLOR = new THREE.Color('#7a6650')
export const MORTAL_COLOR = new THREE.Color('#7a1fd6')
export const MORTAL_FLASH_COLOR = new THREE.Color('#e8d4ff')
