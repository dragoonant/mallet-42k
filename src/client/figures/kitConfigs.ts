// Per-kit visual dressing (30-figures.md §2/§4 flavour, not rules data). Keyed by KitId so
// Figure.tsx can go straight from resolveFigureKit() to "what does this look like".
import type { BipedConfig, KitId, VehicleConfig } from './types'

export const BODY_KIND: Record<KitId, 'biped' | 'vehicle'> = {
  'sm-tacticus': 'biped',
  'sm-terminator': 'biped',
  'ork-boy': 'biped',
  'ork-warboss': 'biped',
  'ork-deff-dread': 'biped',
  'ork-deffkopta': 'vehicle',
  'generic-infantry': 'biped',
  'generic-heavy': 'biped',
  'generic-monster': 'biped',
  'generic-vehicle': 'vehicle',
}

export const BIPED_CONFIG: Partial<Record<KitId, BipedConfig>> = {
  'sm-tacticus': {
    headShape: 'marine-helmet',
    rightWeapon: 'bolt-rifle',
    leftWeapon: 'none',
    bulk: 1,
    hasBackpack: true,
    shoulderPads: 'small',
    hasCape: false,
    skin: 'none',
  },
  'sm-terminator': {
    headShape: 'terminator-helmet',
    rightWeapon: 'storm-bolter',
    leftWeapon: 'power-fist',
    bulk: 1.5,
    hasBackpack: true,
    shoulderPads: 'large',
    hasCape: false,
    skin: 'none',
  },
  'ork-boy': {
    headShape: 'ork-head',
    rightWeapon: 'choppa',
    leftWeapon: 'slugga',
    bulk: 1.15,
    hasBackpack: false,
    shoulderPads: 'none',
    hasCape: false,
    skin: 'ork',
  },
  'ork-warboss': {
    headShape: 'ork-boss-head',
    rightWeapon: 'power-klaw',
    leftWeapon: 'boss-choppa',
    bulk: 1.7,
    hasBackpack: false,
    shoulderPads: 'large',
    hasCape: true,
    skin: 'ork',
  },
  'ork-deff-dread': {
    headShape: 'ork-head',
    rightWeapon: 'twin-claw',
    leftWeapon: 'twin-claw',
    bulk: 2.3,
    hasBackpack: false,
    shoulderPads: 'none',
    hasCape: false,
    skin: 'none',
  },
  'generic-infantry': {
    headShape: 'generic-head',
    rightWeapon: 'bolt-rifle',
    leftWeapon: 'none',
    bulk: 1,
    hasBackpack: false,
    shoulderPads: 'none',
    hasCape: false,
    skin: 'none',
  },
  'generic-heavy': {
    headShape: 'generic-head',
    rightWeapon: 'storm-bolter',
    leftWeapon: 'none',
    bulk: 1.5,
    hasBackpack: true,
    shoulderPads: 'small',
    hasCape: false,
    skin: 'none',
  },
  'generic-monster': {
    headShape: 'generic-head',
    rightWeapon: 'twin-claw',
    leftWeapon: 'twin-claw',
    bulk: 2.2,
    hasBackpack: false,
    shoulderPads: 'none',
    hasCape: false,
    skin: 'none',
  },
}

export const VEHICLE_CONFIG: Partial<Record<KitId, VehicleConfig>> = {
  'ork-deffkopta': { weapon: 'kustom-mega-blasta', hasRotor: true },
  'generic-vehicle': { weapon: 'none', hasRotor: false },
}
