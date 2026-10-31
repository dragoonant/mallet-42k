// Rendering-only types for the procedural figure kit (docs/spec/30-figures.md). Nothing here
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
  | 'da-intercessor'
  | 'da-sergeant'
  | 'da-chaplain'
  | 'da-inceptor'
  | 'da-redemptor'
  | 'da-hellblaster'
  | 'da-bladeguard'
  | 'da-zacharial'
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
  | 'csm-apostle'
  | 'csm-havoc'
  | 'csm-helbrute'
  | 'we-berzerker'
  | 'we-berzerker-champion'
  | 'we-berzerker-plasma'
  | 'we-berzerker-icon'
  | 'we-berzerker-eviscerator'
  | 'we-jakhal'
  | 'we-jakhal-leader'
  | 'we-jakhal-icon'
  | 'we-jakhal-mauler'
  | 'we-dishonoured'
  | 'we-karagar'
  | 'tyr-prime'
  | 'tyr-psychophage'
  | 'tyr-termagant'
  | 'tyr-barbgaunt'
  | 'tyr-leaper'
  | 'tyr-lictor'
  | 'tyr-neurolictor'
  | 'ade-canoness'
  | 'ade-sister'
  | 'ade-sister-superior'
  | 'ade-sister-flamer'
  | 'ade-sister-heavy-flamer'
  | 'ade-sister-simulacrum'
  | 'ade-sacresant'
  | 'ade-arco'
  | 'ade-seraphim'
  | 'ade-seraphim-superior'
  | 'ade-repentia'
  | 'ade-repentia-superior'
  | 'ade-penitent-engine'
  | 'ade-rhino'
  | 'am-guardsman'
  | 'am-sergeant'
  | 'am-officer'
  | 'am-veteran'
  | 'am-medic'
  | 'am-standard'
  | 'am-sentinel'
  | 'am-field-gun'
  | 'am-rocket-battery'
  | 'gk-knight'
  | 'gk-terminator'
  | 'gk-librarian'
  | 'gk-dreadknight'
  | 'adm-vanguard'
  | 'adm-vanguard-alpha'
  | 'adm-vanguard-arc'
  | 'adm-vanguard-plasma'
  | 'adm-skand'
  | 'adm-pteraxii'
  | 'adm-pteraxii-alpha'
  | 'adm-hound-alpha'
  | 'adm-hound-carbine'
  | 'adm-hound-pistols'
  | 'adm-enginseer'
  | 'adm-arquebus'
  | 'adm-kataphron-grav'
  | 'adm-kataphron-plasma'
  | 'adm-dunecrawler'
  | 'tau-fire-warrior'
  | 'tau-shasui'
  | 'tau-fireblade'
  | 'tau-ethereal'
  | 'tau-stealth'
  | 'tau-ghostkeel'
  | 'tau-pathfinder'
  | 'tau-pathfinder-rail'
  | 'tau-breacher'
  | 'tau-cloudspear'
  | 'tau-devilfish'
  | 'gsc-neophyte'
  | 'gsc-neophyte-leader'
  | 'gsc-neophyte-icon'
  | 'gsc-neophyte-stubber'
  | 'gsc-neophyte-seismic'
  | 'gsc-neophyte-webber'
  | 'gsc-acolyte'
  | 'gsc-acolyte-leader'
  | 'gsc-acolyte-demolitions'
  | 'gsc-acolyte-mining'
  | 'gsc-aberrant'
  | 'gsc-hypermorph'
  | 'gsc-magus'
  | 'gsc-rockgrinder'
  | 'cus-guard-spear'
  | 'cus-guard-blade'
  | 'cus-vexilla'
  | 'cus-captain'
  | 'cus-prosecutor'
  | 'cus-vigilator'
  | 'cus-praetor'
  | 'lov-hearthkyn'
  | 'lov-theyn'
  | 'lov-hearthkyn-hylas'
  | 'lov-hearthkyn-magna'
  | 'lov-hearthkyn-medic'
  | 'lov-hearthkyn-comms'
  | 'lov-hearthkyn-scanner'
  | 'lov-kahl'
  | 'lov-beserk'
  | 'lov-beserk-gauntlet'
  | 'lov-beserk-mole'
  | 'lov-pioneer-comms'
  | 'lov-pioneer-searchlight'
  | 'lov-pioneer-rotary'
  | 'drk-sybarite'
  | 'drk-kabalite'
  | 'drk-kabalite-shredder'
  | 'drk-kabalite-cannon'
  | 'drk-archon'
  | 'drk-incubus'
  | 'drk-klaivex'
  | 'drk-raider'
  | 'drk-ravager'
  | 'ael-guardian'
  | 'ael-farseer'
  | 'ael-wraithlord'
  | 'ael-windrider-catapult'
  | 'ael-windrider-scatter'
  | 'ael-platform'
  | 'dg-plague-champion'
  | 'dg-plague-boltgun'
  | 'dg-plague-spewer'
  | 'dg-plague-launcher'
  | 'dg-poxwalker'
  | 'dg-grelch'
  | 'dg-typhus'
  | 'ths-ahrak'
  | 'ths-scarab-sorcerer'
  | 'ths-scarab-combi'
  | 'ths-scarab-soulreaper'
  | 'ths-scarab-hellfyre'
  | 'ths-tzaangor'
  | 'sw-intercessor'
  | 'sw-sergeant'
  | 'sw-thoryk'
  | 'sw-reiver'
  | 'sw-invictor'
  | 'dw-intercessor'
  | 'dw-sergeant'
  | 'dw-grenadier'
  | 'dw-alphion'
  | 'dw-krenn'
  | 'dw-aggressor'
  | 'bt-intercessor'
  | 'bt-initiate-rifle'
  | 'bt-initiate-chainsword'
  | 'bt-initiate-pyreblaster'
  | 'bt-neophyte-firearm'
  | 'bt-neophyte-chainsword'
  | 'bt-sword-brother'
  | 'bt-siguard'
  | 'bt-impulsor'
  | 'cdm-bloodletter'
  | 'cdm-bloodletter-icon'
  | 'cdm-bloodletter-musician'
  | 'cdm-bloodmaster'
  | 'cdm-bloodcrusher'
  | 'cdm-bloodcrusher-icon'
  | 'cdm-bloodcrusher-musician'
  | 'cdm-flesh-hound'
  | 'cdm-gore-hound'
  | 'ba-intercessor'
  | 'ba-intercessor-sergeant'
  | 'ba-incursor'
  | 'ba-incursor-sergeant'
  | 'ba-incursor-mine'
  | 'ba-aggressor'
  | 'ba-librarian'
  | 'ba-impulsor'
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
  | 'kabal-helm' | 'archon-crown' | 'incubus-helm'
  | 'guard-helmet' | 'officer-cap' | 'sentinel-cab' | 'tau-helmet' | 'tau-ethereal' | 'custodes-helm'
  | 'kin-helm' | 'kin-helm-crest'
  | 'aeldari-helm' | 'aeldari-farseer' | 'wraith-head'
  | 'skitarii-hood' | 'skitarii-alpha' | 'tech-priest-hood' | 'pteraxii-helm'
  | 'plague-helm' | 'plague-lord-helm' | 'poxwalker-head'
  | 'rubric-helm' | 'ths-sorcerer' | 'tzaangor-head'
  | 'bloodletter-head' | 'bloodmaster-head'
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
  | 'lasgun'
  | 'plasma-pistol'
  | 'power-sword'
  | 'plasma-cannon'
  | 'pulse-rifle'
  | 'fusion-blaster'
  | 'burst-cannon'
  | 'honour-stave'
  | 'ion-blaster'
  | 'rail-rifle'
  | 'plasma-axe'
  | 'splinter-rifle'
  | 'splinter-cannon'
  | 'shredder'
  | 'huskblade'
  | 'klaive'
  | 'shuriken-catapult'
  | 'singing-spear'
  | 'ghostglaive'
  | 'khopesh' | 'missile-rack'
  | 'arc-rifle' | 'plasma-caliver' | 'radium-carbine' | 'omnissian-staff' | 'taser-goad' | 'arc-maul' | 'transonic-cannon' | 'phosphor-torch' | 'phosphor-carbine'
  | 'blight-launcher' | 'plague-spewer' | 'manreaper'
  | 'grenade-launcher'
  | 'hellblade' | 'blood-blade' | 'war-horn' | 'daemon-icon'
export type ShoulderPad = 'none' | 'small' | 'large'

export interface BipedConfig {
  headShape: HeadShape
  rightWeapon: WeaponShape
  leftWeapon: WeaponShape
  bulk: number // torso/limb thickness multiplier: ~1 infantry, ~1.5 heavy, ~2.2 monster
  hasBackpack: boolean
  shoulderPads: ShoulderPad
  hasCape: boolean
  skin: 'marine' | 'ork' | 'daemon' | 'pale' | 'sickly' | 'none' // 'none' = fully helmeted/armoured, no bare skin rendered
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
  /** A red cross patch on the chest (paintScheme.decal): the Guard medic's mark. */
  chestCross?: boolean
  /** Drukhari dressing: long swept spikes on the shoulders and back (a barbed, cruel silhouette). */
  spikedPauldrons?: boolean
  /** Adeptus Mechanicus dressing: a twin-thruster jump pack (Pteraxii), a floor-length robe over the legs and three
   *  reaching mechadendrites on the back (tech-priests). */
  jumpPack?: boolean
  robe?: boolean
  mechadendrites?: boolean
  /** Death Guard dressing (dgParts.tsx): 'plate' = hoses + rag tabard + pustules, 'biologus' = plate plus a vial rack,
   *  'lord' = plate with a heavier tabard and bell-weight, 'pox' = swollen belly, ragged loincloth and boils (Poxwalkers). */
  nurgle?: 'plate' | 'biologus' | 'lord' | 'pox'
  /** World Eaters dressing: swept brass horns on the helm, and an armoured Juggernaut mount under the rider. */
  horns?: boolean
  juggernaut?: boolean
  /** Helmet paint slot for the Chaos helm (default 'secondary'). */
  helmColor?: 'secondary' | 'metal' | 'primary'
  /** Chaos Daemons dressing: a barbed tail behind the hips and a pair of bat wings behind the shoulders. */
  daemonTail?: boolean
  daemonWings?: boolean
  /** Blood Angels dressing: the blood-drop chest badge (paintScheme.decal). */
  bloodDrop?: boolean
  /** A gold-cased mine satchel slung at the hip (the Incursor carrying a haywire mine). */
  satchel?: boolean
}

/** Towed/emplaced gun with its crew (Astra Militarum Field Ordnance Battery): a long barrel or a rocket rack. */
export interface ArtilleryConfig {
  barrel: 'field-gun' | 'rocket-rack'
}

/** A Serberys Sulphurhound: a cyber-mastiff with a Skitarii rider whose weapons are drawn on the arms. */
export interface HoundConfig {
  rightWeapon: WeaponShape
  leftWeapon: WeaponShape
  /** A brass crest on the rider's hood (the pack's alpha). */
  crest?: boolean
  /** Chaos Daemons beasts: a Flesh Hound / Gore Hound (no rider, red hide, fanged maw; the Gore Hound's mouth glows) or a
   *  Juggernaut (a broader, armoured beast with a bladed horn). Omitted = the Skitarii cyber-mastiff. */
  beast?: 'flesh-hound' | 'gore-hound' | 'juggernaut'
  /** Who sits on the beast: the Skitarii hooded rider (default), a Bloodletter, or nobody. */
  rider?: 'skitarii' | 'bloodletter' | 'none'
}

export interface VehicleConfig {
  weapon: 'kustom-mega-blasta' | 'kopta-rokkits' | 'twin-catapult' | 'scatter-laser' | 'starcannon' | 'none'
  hasRotor: boolean
  /** 'dozer' = a tracked mining crawler (Goliath Rockgrinder); 'hover' = a skimmer transport (Devilfish); default is the gyrocopter rig. */
  style?: 'copter' | 'dozer' | 'hover' | 'gravbike' | 'skiff' | 'gunboat' | 'jetbike' | 'platform' | 'impulsor' | 'templar-impulsor'
  /** Grav-bike dressing (Hernkyn Pioneers): which kit the bike carries on top of its nose gun. */
  rig?: 'comms' | 'searchlight' | 'rotary'
}

/** Props shared by every body renderer (BipedBody / VehicleBody). Authored at unit height
 *  (feet at y=0, crown at y≈1); Figure wraps the result in a group scaled to the real height. */
export interface BodyProps {
  colors: PaintColors
  pose: Pose
  seed: number
}
