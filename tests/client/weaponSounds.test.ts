// Firing sounds are per weapon (owner playtest: "the shooting sound should correspond to the weapon
// being used" — every ranged attack used to play one generic 'bolter-burst', and every melee one
// 'melee-chainsword'). The classification lives in src/client/weaponFlavour.ts and is shared by the
// sound map (src/client/audio/eventSounds.ts) and the tracer look, so this pins BOTH: every weapon in
// the real data bundle, by id, and the events that voice them.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { weaponFlavour, isRangedFlavour, type WeaponFlavour } from '../../src/client/weaponFlavour'
import { soundsForEvent, weaponSound, type SoundLookup } from '../../src/client/audio/eventSounds'
import { SFX_IDS } from '../../src/client/audio/manifest'
import { existsSync } from 'node:fs'
import type { GameEvent } from '../../src/engine/events'

const bundle = await loadBundle()

// The faction string the client actually passes is the ENGINE's faction id (GameState.players[].faction,
// i.e. what faction.json declares), not the store's 'space-marines'/'orks' setup key — pinned here so a
// rename can't silently turn every ork gun back into a bolter.
const ORK = 'ork'
const SM = 'sm'
const NEC = 'necrons'
const CSM = 'chaos-space-marines'
const TYR = 'tyranids'
const ADE = 'adepta-sororitas'
const AM = 'astra-militarum'
const GK = 'grey-knights'
const TAU = 'tau-empire'
const GSC = 'genestealer-cults'
const LOV = 'leagues-of-votann'
const DRK = 'drukhari'
const ADM = 'adeptus-mechanicus'
const WE = 'world-eaters'
const CDM = 'chaos-daemons'

/** The engine faction id a weapon's own id prefix belongs to. */
const factionOfWeapon = (id: string): string => (id.startsWith('ork') ? ORK : id.startsWith('nec') ? NEC : id.startsWith('csm') ? CSM : id.startsWith('tyr') ? TYR : id.startsWith('ade') ? ADE : id.startsWith('am.') ? AM : id.startsWith('gk.') ? GK : id.startsWith('tau.') ? TAU : id.startsWith('gsc.') ? GSC : id.startsWith('cus.') ? 'adeptus-custodes' : id.startsWith('lov.') ? LOV : id.startsWith('drk.') ? DRK : id.startsWith('ael.') ? 'aeldari' : id.startsWith('adm.') ? ADM : id.startsWith('dg.') ? 'death-guard' : id.startsWith('we.') ? WE : id.startsWith('ths.') ? 'thousand-sons' : id.startsWith('cdm.') ? CDM : id.startsWith('sw.') ? 'space-wolves' : id.startsWith('da.') ? 'dark-angels' : id.startsWith('ba.') ? 'blood-angels' : id.startsWith('dw.') ? 'deathwatch' : id.startsWith('bt.') ? 'black-templars' : SM)
function lookupFor(faction: string): SoundLookup {
  return { weapon: (id) => bundle.weapons[id], factionOfUnit: () => faction }
}

/** A TargetsDeclared for one attacking unit firing `weaponIds` (one model each). */
function declared(weaponIds: string[], phase: 'shooting' | 'fight' = 'shooting'): GameEvent {
  return {
    type: 'TargetsDeclared',
    seq: 1, round: 1, turn: 'A', phase, player: 'A',
    unitId: 'u1',
    targets: weaponIds.map((weaponId, i) => ({ modelId: `m${i}`, weaponId, targetUnitId: 'u2' })),
  } as GameEvent
}

const soundIds = (event: GameEvent, faction: string): string[] =>
  soundsForEvent(event, 'A', lookupFor(faction)).map((s) => s.id)

// Every weapon id in the bundle with the flavour it must classify as. Written out rather than
// derived so a datasheet edit that changes what a gun sounds like has to be an explicit change here.
const EXPECTED: Record<string, WeaponFlavour> = {
  'sm.w.storm-bolter': 'bolter',
  'sm.w.storm-bolter-captain': 'bolter',
  'sm.w.bolt-pistol': 'bolter',
  'sm.w.assault-cannon': 'heavy',
  'sm.w.pyreblaster': 'flame',
  'sm.w.smite': 'psychic',
  'sm.w.smite-focused': 'psychic',
  'sm.w.relic-weapon': 'chain',
  'sm.w.power-weapon': 'chain',
  'sm.w.close-combat-weapon': 'chain',
  'sm.w.power-fist': 'crush',
  'sm.w.force-weapon': 'force',
  'sm.w.bolt-pistol-solarien': 'bolter',
  'sm.w.master-crafted-scoped-bolt-carbine': 'bolter',
  'sm.w.marksman-bolt-carbine': 'bolter',
  'sm.w.accelerator-autocannon': 'heavy',
  'sm.w.paired-combat-blades': 'chain',
  // Dark Angels (da.*): the Redemptor's macro plasma incinerator is a plasma gun, not a flame template.
  'da.w.absolvor-bolt-pistol': 'bolter',
  'da.w.crozius-arcanum': 'chain',
  'da.w.bolt-rifle': 'bolter',
  'da.w.assault-bolters': 'bolter',
  'da.w.icarus-rocket-pod': 'heavy',
  'da.w.macro-plasma-incinerator': 'heavy',
  'da.w.macro-plasma-incinerator-supercharge': 'heavy',
  'da.w.onslaught-gatling-cannon': 'heavy',
  'da.w.twin-fragstorm-grenade-launcher': 'heavy',
  'da.w.redemptor-fist': 'crush',
  'da.w.boltstorm-gauntlet': 'bolter',
  'da.w.power-fist-zacharial': 'crush',
  'da.w.relic-chainsword': 'chain',
  'da.w.plasma-incinerator': 'heavy',
  'da.w.plasma-incinerator-supercharge': 'heavy',
  'da.w.heavy-bolt-pistol': 'bolter',
  'da.w.master-crafted-power-weapon': 'chain',
  // Black Templars (bt.*): the Impulsor's multi-melta is a melta beam (flame palette, like every melta weapon); its hull rams.
  'bt.w.plasma-pistol-standard': 'heavy',
  'bt.w.plasma-pistol-supercharge': 'heavy',
  'bt.w.master-crafted-power-weapon': 'chain',
  'bt.w.power-weapon': 'chain',
  'bt.w.bolt-rifle': 'bolter',
  'bt.w.heavy-bolt-pistol': 'bolter',
  'bt.w.neophyte-firearm': 'bolter',
  'bt.w.astartes-chainsword': 'chain',
  'bt.w.multi-melta': 'flame',
  'bt.w.storm-bolter-2': 'bolter',
  'bt.w.armoured-hull': 'crush',
  'ork.w.shoota': 'shoota',
  'ork.w.big-shoota': 'shoota',
  'ork.w.big-shoota-gordrang': 'shoota',
  'ork.w.slugga': 'shoota',
  'ork.w.rokkit-launcha': 'heavy',
  'ork.w.kopta-rokkits': 'heavy',
  'ork.w.kustom-mega-blasta': 'heavy',
  'ork.w.choppa': 'chain',
  'ork.w.big-choppa': 'chain',
  'ork.w.uge-choppa': 'chain',
  'ork.w.spinnin-blades': 'chain',
  'ork.w.close-combat-weapon': 'chain',
  'ork.w.power-klaw': 'crush',
  'ork.w.shoota-beastboss': 'shoota',
  'ork.w.beastchoppa': 'chain',
  'ork.w.beast-snagga-klaw': 'crush',
  'ork.w.thump-gun': 'heavy',
  'ork.w.choppa-snagga': 'chain',
  'ork.w.close-combat-weapon-snagga': 'chain',
  'ork.w.power-snappa': 'chain',
  'ork.w.saddlegit-weapons': 'shoota',
  'ork.w.stikka-ranged': 'shoota',
  'ork.w.stikka': 'chain',
  'ork.w.big-choppa-squighog': 'chain',
  'ork.w.squighog-jaws': 'chain',
  'ork.w.dread-klaw': 'crush',
  'nec.w.tachyon-arrow': 'heavy',
  'nec.w.gauss-flayer': 'psychic',
  'nec.w.gauss-reaper': 'psychic',
  'nec.w.twin-gauss-flayer': 'psychic',
  'nec.w.doomsday-blaster': 'heavy',
  'nec.w.overlords-blade': 'chain',
  'nec.w.close-combat-weapon': 'chain',
  'nec.w.skorpekh-hyperphase-weapons': 'chain',
  'nec.w.feeder-mandibles': 'chain',
  'nec.w.doomstalker-limbs': 'crush',
  'csm.w.bolt-pistol': 'bolter',
  'csm.w.rite-of-possession': 'psychic',
  'csm.w.rite-of-possession-focused': 'psychic',
  'csm.w.boltgun': 'bolter',
  'csm.w.heavy-bolter': 'heavy',
  'csm.w.meltagun': 'flame',
  'csm.w.plasma-pistol': 'heavy',
  'csm.w.plasma-pistol-supercharge': 'heavy',
  'csm.w.autopistol': 'shoota',
  'csm.w.bolt-pistol-cultist-champion': 'bolter',
  'csm.w.staff-of-possession': 'force',
  'csm.w.hideous-mutations': 'crush',
  'csm.w.accursed-weapon': 'chain',
  'csm.w.close-combat-weapon': 'chain',
  'csm.w.brutal-assault-weapon': 'chain',
  'csm.w.accursed-crozius': 'chain',
  'csm.w.dark-disciple-ccw': 'chain',
  'csm.w.astartes-chainsword': 'chain',
  'csm.w.havoc-astartes-chainsword': 'chain',
  'csm.w.havoc-heavy-bolter': 'heavy',
  'csm.w.havoc-lascannon': 'heavy',
  'csm.w.havoc-missile-launcher-frag': 'heavy',
  'csm.w.havoc-missile-launcher-krak': 'heavy',
  'csm.w.havoc-reaper-chaincannon': 'heavy',
  'csm.w.plasma-gun': 'heavy',
  'csm.w.plasma-gun-supercharge': 'heavy',
  'csm.w.helbrute-plasma-cannon': 'heavy',
  'csm.w.helbrute-hammer': 'crush',
  'tyr.w.psychoclastic-torrent': 'flame',
  'tyr.w.fleshborer': 'shoota',
  'tyr.w.barblauncher': 'heavy',
  'tyr.w.prime-talons': 'chain',
  'tyr.w.talons-and-betentacled-maw': 'chain',
  'tyr.w.chitinous-claws-and-teeth-termagant': 'chain',
  'tyr.w.chitinous-claws-and-teeth-barbgaunt': 'chain',
  'tyr.w.leapers-talons': 'chain',
  'tyr.w.piercing-claws-and-talons': 'chain',
  'tyr.w.lictor-claws-and-talons': 'chain',
  'am.w.bolt-pistol': 'bolter',
  'am.w.lasgun': 'bolter',
  'am.w.laspistol': 'bolter',
  'am.w.plasma-pistol': 'heavy',
  'am.w.plasma-pistol-supercharge': 'heavy',
  'am.w.drum-fed-autogun': 'bolter',
  'am.w.flamer': 'flame',
  'am.w.grenade-launcher-frag': 'heavy',
  'am.w.grenade-launcher-krak': 'heavy',
  'am.w.meltagun': 'flame',
  'am.w.plasma-gun': 'heavy',
  'am.w.plasma-gun-supercharge': 'heavy',
  'am.w.bombast-field-gun': 'heavy',
  'am.w.malleus-rocket-launcher': 'heavy',
  'am.w.hunter-killer-missile': 'heavy',
  'am.w.plasma-cannon': 'heavy',
  'am.w.plasma-cannon-supercharge': 'heavy',
  'am.w.power-weapon': 'chain',
  'am.w.power-fist': 'crush',
  'am.w.close-combat-weapon-command': 'chain',
  'am.w.chainsword': 'chain',
  'am.w.close-combat-weapon': 'chain',
  'am.w.battery-close-combat-weapons': 'chain',
  'am.w.close-combat-weapon-sentinel': 'crush',
  'gk.w.purge-soul-witchfire': 'psychic',
  'gk.w.purge-soul-focused': 'psychic',
  'gk.w.storm-bolter': 'bolter',
  'gk.w.psilencer': 'psychic',
  'gk.w.psycannon': 'psychic',
  'gk.w.heavy-psycannon': 'psychic',
  'gk.w.nemesis-force-weapon-librarian': 'force',
  'gk.w.nemesis-force-weapon-terminator': 'force',
  'gk.w.nemesis-force-weapon-strike': 'force',
  'gk.w.close-combat-weapon': 'chain',
  'gk.w.nemesis-greatsword-strike': 'force',
  'gk.w.nemesis-greatsword-sweep': 'force',
  'tau.w.fireblade-pulse-rifle': 'psychic',
  'tau.w.pulse-rifle': 'psychic',
  'tau.w.pulse-carbine': 'psychic',
  'tau.w.pulse-pistol': 'psychic',
  'tau.w.support-turret-missile-system': 'heavy',
  'tau.w.burst-cannon': 'shoota',
  'tau.w.fusion-blaster': 'flame',
  'tau.w.twin-fusion-blaster': 'flame',
  'tau.w.cyclic-ion-raker-standard': 'heavy',
  'tau.w.cyclic-ion-raker-overcharge': 'heavy',
  'tau.w.honour-stave': 'force',
  'tau.w.close-combat-weapon-fireblade': 'chain',
  'tau.w.close-combat-weapon': 'chain',
  'tau.w.battlesuit-fists': 'crush',
  'tau.w.ghostkeel-fists': 'crush',
  'tau.w.airbursting-fragmentation-projector': 'heavy',
  'tau.w.plasma-rifle': 'heavy',
  'tau.w.battlesuit-fists-commander': 'crush',
  'tau.w.rail-rifle': 'psychic',
  'tau.w.pulse-blaster': 'psychic',
  'tau.w.accelerator-burst-cannon': 'shoota',
  'tau.w.twin-pulse-carbine': 'psychic',
  'tau.w.twin-pulse-carbine-2': 'psychic',
  'tau.w.armoured-hull': 'crush',
  'gsc.w.autopistol-magus': 'shoota',
  'gsc.w.autopistol': 'shoota',
  'gsc.w.hybrid-firearm': 'shoota',
  'gsc.w.leader-pistol': 'shoota',
  'gsc.w.heavy-stubber': 'shoota',
  'gsc.w.seismic-cannon': 'heavy',
  'gsc.w.webber': 'flame',
  'gsc.w.demolition-charges': 'heavy',
  'gsc.w.clearance-incinerator': 'flame',
  'gsc.w.demolition-charge-cache': 'heavy',
  'gsc.w.magus-stave': 'force',
  'gsc.w.power-weapon': 'chain',
  'gsc.w.close-combat-weapon': 'chain',
  'gsc.w.cult-claws-and-knife': 'chain',
  'gsc.w.heavy-mining-tool': 'crush',
  'gsc.w.leaders-cult-weapons': 'chain',
  'gsc.w.heavy-improvised-weapon': 'crush',
  'gsc.w.heavy-power-weapon': 'crush',
  'gsc.w.hypermorph-tail': 'chain',
  'gsc.w.drilldozer-blade': 'crush',
  'gsc.w.cult-sniper-rifle': 'shoota',
  'gsc.w.ccw-shanus': 'chain',
  'gsc.w.hand-flamer': 'flame',
  'gsc.w.leaders-bio-weapons': 'chain',
  'gsc.w.metamorph-mutations-strike': 'crush',
  'gsc.w.metamorph-mutations-sweep': 'crush',
  'gsc.w.atalan-small-arms': 'shoota',
  'gsc.w.mining-laser': 'heavy',
  'gsc.w.atalan-power-weapon': 'chain',
  'gsc.w.ccw-jackal': 'chain',
  'gsc.w.achilles-missile-launcher': 'heavy',
  'gsc.w.twin-heavy-stubber': 'shoota',
  'gsc.w.armoured-hull': 'crush',
  'cus.w.sentinel-blade-ranged': 'bolter',
  'cus.w.guardian-spear-ranged': 'bolter',
  'cus.w.vertus-hurricane-bolter': 'bolter',
  'cus.w.boltgun': 'bolter',
  'cus.w.sentinel-blade-tyvan': 'chain',
  'cus.w.sentinel-blade-guard': 'chain',
  'cus.w.guardian-spear-melee': 'chain',
  'cus.w.misericordia': 'chain',
  'cus.w.interceptor-lance': 'chain',
  'cus.w.close-combat-weapon-prosecutor': 'chain',
  'cus.w.executioner-greatblade': 'chain',
  'cus.w.vaultswords-behemor': 'chain',
  'cus.w.vaultswords-hurricanus': 'chain',
  'cus.w.vaultswords-victus': 'chain',
  'cus.w.castellan-axe-ranged': 'bolter',
  'cus.w.castellan-axe-melee': 'chain',
  'cus.w.balistus-grenade-launcher': 'heavy',
  // Leagues of Votann: ion blasters, magna-rail rifles and the volkanite disintegrator are energy bolts; gauntlets crunch, axes and knives cut.
  'lov.w.volkanite-disintegrator': 'psychic',
  'lov.w.autoch-pattern-bolt-pistol': 'bolter',
  'lov.w.autoch-pattern-bolter': 'bolter',
  'lov.w.etacarn-plasma-pistol': 'heavy',
  'lov.w.hylas-auto-rifle': 'bolter',
  'lov.w.ion-blaster': 'psychic',
  'lov.w.magna-rail-rifle': 'psychic',
  'lov.w.bolt-revolver': 'bolter',
  'lov.w.bolt-shotgun': 'bolter',
  'lov.w.hylas-rotary-cannon': 'shoota',
  'lov.w.magna-coil-autocannon': 'heavy',
  'lov.w.mole-grenade-launcher': 'heavy',
  'lov.w.mass-gauntlet': 'crush',
  'lov.w.close-combat-weapon': 'chain',
  'lov.w.kin-melee-weapon': 'chain',
  'lov.w.plasma-knife': 'chain',
  'lov.w.heavy-plasma-axe-strike': 'chain',
  'lov.w.heavy-plasma-axe-sweep': 'chain',
  'lov.w.heavy-plasma-axe-strike-mole': 'chain',
  'lov.w.heavy-plasma-axe-sweep-mole': 'chain',
  'lov.w.twin-concussion-gauntlet': 'crush',
  'ael.w.eldritch-storm': 'psychic',
  'ael.w.shuriken-pistol': 'shoota',
  'ael.w.singing-spear-ranged': 'psychic',
  'ael.w.singing-spear': 'force',
  'ael.w.shuriken-catapult': 'shoota',
  'ael.w.starcannon': 'heavy',
  'ael.w.close-combat-weapon-guardian': 'chain',
  'ael.w.scatter-laser': 'shoota',
  'ael.w.twin-shuriken-catapult': 'shoota',
  'ael.w.close-combat-weapon-windrider': 'chain',
  'ael.w.bright-lance': 'heavy',
  'ael.w.shuriken-catapult-wraithlord-1': 'shoota',
  'ael.w.shuriken-catapult-wraithlord-2': 'shoota',
  'ael.w.ghostglaive-strike': 'chain',
  'ael.w.ghostglaive-sweep': 'chain',
  'adm.w.transonic-cannon': 'flame',
  'adm.w.omnissian-staff': 'force',
  'adm.w.mechanicus-pistol': 'bolter',
  'adm.w.arc-rifle': 'psychic',
  'adm.w.plasma-caliver-standard': 'heavy',
  'adm.w.plasma-caliver-supercharge': 'heavy',
  'adm.w.radium-carbine': 'bolter',
  'adm.w.alpha-combat-weapon': 'chain',
  'adm.w.close-combat-weapon': 'chain',
  'adm.w.phosphor-blast-carbine': 'flame',
  'adm.w.phosphor-pistol': 'flame',
  'adm.w.paired-phosphor-pistols': 'flame',
  'adm.w.sulphur-breath': 'flame',
  'adm.w.cavalry-arc-maul': 'crush',
  'adm.w.clawed-limbs': 'crush',
  'adm.w.flechette-blaster': 'shoota',
  'adm.w.phosphor-torch': 'flame',
  'adm.w.pteraxii-talons': 'chain',
  'adm.w.taser-goad': 'force',
  'adm.w.mechanicus-pistol-verask': 'bolter',
  'adm.w.omnissian-axe': 'chain',
  'adm.w.servo-arm': 'crush',
  'adm.w.galvanic-rifle': 'bolter',
  'adm.w.transuranic-arquebus': 'bolter',
  'adm.w.cognis-flamer': 'flame',
  'adm.w.heavy-grav-cannon': 'heavy',
  'adm.w.kataphron-plasma-culverin-standard': 'heavy',
  'adm.w.kataphron-plasma-culverin-supercharge': 'heavy',
  'adm.w.phosphor-blaster': 'flame',
  'adm.w.kataphron-close-combat-weapon': 'chain',
  'adm.w.cognis-heavy-stubber': 'bolter',
  'adm.w.daedalus-missile-launcher': 'heavy',
  'adm.w.icarus-array': 'heavy',
  'adm.w.dunecrawler-legs': 'crush',
  'dg.w.manreaper-strike': 'chain',
  'dg.w.manreaper-sweep': 'chain',
  'dg.w.hyper-blight-grenades': 'heavy',
  'dg.w.injector-pistol': 'bolter',
  'dg.w.plague-knives-grelch': 'chain',
  'dg.w.plague-knives': 'chain',
  'dg.w.plague-boltgun': 'bolter',
  'dg.w.blight-launcher': 'heavy',
  'dg.w.plague-spewer': 'flame',
  'dg.w.heavy-plague-weapon': 'crush',
  'dg.w.improvised-weapon': 'crush',
  // Thousand Sons (The Coven of Temporus)
  'ths.w.inferno-bolt-pistol': 'bolter',
  'ths.w.inferno-combi-bolter': 'bolter',
  'ths.w.soulreaper-cannon': 'heavy',
  'ths.w.hellfyre-missile-rack': 'heavy',
  'ths.w.screamer-invocation-witchfire': 'psychic',
  'ths.w.screamer-invocation-focused': 'psychic',
  'ths.w.warpsmite': 'psychic',
  'ths.w.autopistol': 'shoota',
  'ths.w.force-weapon': 'force',
  'ths.w.prosperine-khopesh': 'chain',
  'ths.w.chainsword': 'chain',
  'cdm.w.blade-of-blood': 'chain',
  'cdm.w.hellblade': 'chain',
  'cdm.w.juggernauts-bladed-horn': 'chain',
  'cdm.w.burning-roar': 'flame',
  'cdm.w.gore-drenched-fangs': 'chain',
}

// Adepta Sororitas weapons, by datasheet NAME (lower-cased) so the check holds whatever id spelling the data uses.
// Exhaustive over the faction's weapons once its data is in the bundle: a new weapon has to be classified here.
const ADE_BY_NAME: Record<string, WeaponFlavour> = {
  'condemnor boltgun': 'bolter',
  'bolt pistol': 'bolter',
  boltgun: 'bolter',
  'combi-weapon': 'bolter',
  'ministorum flamer': 'flame',
  'ministorum heavy flamer': 'flame',
  'hallowed chainsword': 'chain',
  'power weapon': 'chain',
  'close combat weapon': 'chain',
  'hallowed mace': 'crush',
  'arco-flails': 'chain',
  'arco-flails (penitent host)': 'chain',
  'plasma pistol (ellyrine, standard)': 'heavy',
  'plasma pistol (ellyrine, supercharge)': 'heavy',
  'plasma pistol (seraphim, standard)': 'heavy',
  'plasma pistol (seraphim, supercharge)': 'heavy',
  'power weapon (ellyrine)': 'chain',
  'power weapon (seraphim)': 'chain',
  'close combat weapon (seraphim)': 'chain',
  'artificer-crafted storm bolter': 'bolter',
  chainsword: 'chain',
  'paired bolt pistols': 'bolter',
  'neural whips': 'chain',
  'penitent eviscerator': 'chain',
  'penitent flamers': 'flame',
  'twin penitent buzz-blades': 'chain',
  'storm bolter (rhino)': 'bolter',
  'armoured tracks': 'crush',
}
const adeWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('ade.'))

// Drukhari weapons, classified by weapon id (the flavour decides the firing/impact sound family and the tracer look).
const DRK_FLAVOUR: Record<string, WeaponFlavour> = {
  'drk.w.archon-splinter-pistol': 'shoota',
  'drk.w.huskblade': 'chain',
  'drk.w.splinter-pistol': 'shoota',
  'drk.w.splinter-rifle': 'shoota',
  'drk.w.shredder': 'flame',
  'drk.w.splinter-cannon': 'shoota',
  'drk.w.sybarite-weapon': 'chain',
  'drk.w.close-combat-weapon': 'chain',
  'drk.w.demiklaives-single': 'chain',
  'drk.w.demiklaives-dual': 'chain',
  'drk.w.klaive': 'chain',
  'drk.w.disintegrator-cannon': 'heavy',
  'drk.w.dark-lance': 'heavy',
  'drk.w.dark-lance-2': 'heavy',
  'drk.w.bladevanes': 'chain',
}
const drkWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('drk.'))

// World Eaters weapons, classified by weapon id (their csm.* pistols are covered by the Chaos table above).
const WE_FLAVOUR: Record<string, WeaponFlavour> = {
  'we.w.plasma-pistol-karagar': 'heavy',
  'we.w.plasma-pistol-karagar-supercharge': 'heavy',
  'we.w.exalted-chainblade': 'chain',
  'we.w.juggernauts-bladed-horn': 'chain',
  'we.w.berzerker-chainblade': 'chain',
  'we.w.khornate-eviscerator': 'chain',
  'we.w.jakhal-chainblades': 'chain',
  'we.w.mauler-chainblade': 'chain',
  'we.w.skullsmasher': 'crush',
}
const weWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('we.'))

// Space Wolves (Thoryk's Void Hunters) weapons, classified by weapon id.
const SW = 'space-wolves'
const SW_FLAVOUR: Record<string, WeaponFlavour> = {
  'sw.w.bolt-pistol-thoryk': 'bolter',
  'sw.w.master-crafted-bolter': 'bolter',
  'sw.w.master-crafted-power-weapon': 'chain',
  'sw.w.bolt-rifle': 'bolter',
  'sw.w.astartes-chainsword': 'chain',
  'sw.w.special-issue-bolt-pistol': 'bolter',
  'sw.w.combat-knife': 'chain',
  'sw.w.fragstorm-grenade-launcher': 'heavy',
  'sw.w.heavy-bolter': 'heavy',
  'sw.w.twin-ironhail-autocannon': 'heavy',
  'sw.w.twin-ironhail-heavy-stubber': 'bolter',
  'sw.w.invictor-fist': 'crush',
}
const swWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('sw.'))

// Blood Angels weapons (Strike Force Marcellos), classified by weapon id; their sm.* pistols and Librarian powers are in EXPECTED.
const BA_FLAVOUR: Record<string, WeaponFlavour> = {
  'ba.w.bolt-rifle': 'bolter',
  'ba.w.astartes-chainsword': 'chain',
  'ba.w.occulus-bolt-carbine': 'bolter',
  'ba.w.paired-combat-blades': 'chain',
  'ba.w.flamestorm-gauntlets': 'flame',
  'ba.w.twin-power-fists': 'crush',
  'ba.w.bellicatus-frag': 'heavy',
  'ba.w.bellicatus-icarus': 'heavy',
  'ba.w.bellicatus-krak': 'heavy',
  'ba.w.impulsor-storm-bolter': 'bolter',
  'ba.w.armoured-hull': 'crush',
}
const baWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('ba.'))

// Deathwatch (Vigil Force Alphion) weapons, classified by weapon id.
const DW = 'deathwatch'
const DW_FLAVOUR: Record<string, WeaponFlavour> = {
  'dw.w.bolt-pistol-alphion': 'bolter',
  'dw.w.master-crafted-power-weapon': 'chain',
  'dw.w.absolvor-bolt-pistol': 'bolter',
  'dw.w.reductor-pistol': 'bolter',
  'dw.w.close-combat-weapon-krenn': 'chain',
  'dw.w.bolt-rifle': 'bolter',
  'dw.w.grenade-launcher-frag': 'heavy',
  'dw.w.grenade-launcher-krak': 'heavy',
  'dw.w.flamestorm-gauntlets': 'flame',
  'dw.w.twin-power-fists': 'crush',
}
const dwWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('dw.'))

describe('weapon flavour', () => {
  it('covers every weapon in the data bundle (a new weapon has to be classified here)', () => {
    const known = Object.keys(EXPECTED).concat(adeWeapons.map(([id]) => id), drkWeapons.map(([id]) => id), weWeapons.map(([id]) => id), swWeapons.map(([id]) => id), baWeapons.map(([id]) => id), dwWeapons.map(([id]) => id))
    expect(known.sort()).toEqual(Object.keys(bundle.weapons).sort())
  })

  it('the faction ids this classifier is tuned for are the ones the data actually declares', () => {
    for (const id of [NEC, ORK, SM, CSM, TYR, ADE, AM, GK, TAU]) expect(Object.keys(bundle.factions), id).toContain(id)
  })

  it('every adepta-sororitas weapon is classified, by name', () => {
    for (const [id, weapon] of adeWeapons) {
      const expected = ADE_BY_NAME[weapon.name.toLowerCase()]
      expect(expected, `${id} (${weapon.name}) needs an entry in ADE_BY_NAME`).toBeDefined()
      expect(weaponFlavour(id, weapon, ADE), id).toBe(expected)
    }
  })

  it('every drukhari weapon is classified, by id', () => {
    expect(drkWeapons.length).toBeGreaterThan(0)
    for (const [id, weapon] of drkWeapons) {
      expect(DRK_FLAVOUR[id], `${id} (${weapon.name}) needs an entry in DRK_FLAVOUR`).toBeDefined()
      expect(weaponFlavour(id, weapon, DRK), id).toBe(DRK_FLAVOUR[id])
    }
  })

  it('every blood-angels weapon is classified, by id', () => {
    expect(baWeapons.length).toBe(Object.keys(BA_FLAVOUR).length)
    for (const [id, weapon] of baWeapons) {
      const expected = BA_FLAVOUR[id]
      expect(expected, `${id} (${weapon.name}) needs an entry in BA_FLAVOUR`).toBeDefined()
      expect(weaponFlavour(id, weapon, 'blood-angels'), id).toBe(expected)
    }
  })

  it('every world-eaters weapon is classified, by id', () => {
    expect(weWeapons.length).toBeGreaterThan(0)
    for (const [id, weapon] of weWeapons) {
      expect(WE_FLAVOUR[id], `${id} (${weapon.name}) needs an entry in WE_FLAVOUR`).toBeDefined()
      expect(weaponFlavour(id, weapon, WE), id).toBe(WE_FLAVOUR[id])
    }
  })

  it('every space-wolves weapon is classified, by id, and voiced by the matching sound', () => {
    expect(swWeapons.length).toBeGreaterThan(0)
    for (const [id, weapon] of swWeapons) {
      expect(SW_FLAVOUR[id], `${id} (${weapon.name}) needs an entry in SW_FLAVOUR`).toBeDefined()
      expect(weaponFlavour(id, weapon, SW), id).toBe(SW_FLAVOUR[id])
    }
    expect(soundIds(declared(['sw.w.bolt-rifle']), SW)).toEqual(['wpn-boltgun'])
    expect(soundIds(declared(['sw.w.heavy-bolter']), SW)).toEqual(['wpn-heavy-bolter'])
    expect(soundIds(declared(['sw.w.astartes-chainsword'], 'fight'), SW)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['sw.w.invictor-fist'], 'fight'), SW)).toEqual(['wpn-power-fist'])
  })

  it('every deathwatch weapon is classified, by id, and voiced by the matching sound', () => {
    expect(dwWeapons.length).toBeGreaterThan(0)
    for (const [id, weapon] of dwWeapons) {
      expect(DW_FLAVOUR[id], `${id} (${weapon.name}) needs an entry in DW_FLAVOUR`).toBeDefined()
      expect(weaponFlavour(id, weapon, DW), id).toBe(DW_FLAVOUR[id])
    }
    expect(soundIds(declared(['dw.w.bolt-rifle']), DW)).toEqual(['wpn-boltgun'])
    expect(soundIds(declared(['dw.w.reductor-pistol']), DW)).toEqual(['wpn-bolt-pistol'])
    expect(soundIds(declared(['dw.w.flamestorm-gauntlets']), DW)).toEqual(['wpn-flamer'])
    expect(soundIds(declared(['dw.w.twin-power-fists'], 'fight'), DW)).toEqual(['wpn-power-fist'])
  })

  it('world-eaters melee weapons sound as chain blades, bludgeons and a relic blade', () => {
    expect(soundIds(declared(['we.w.berzerker-chainblade'], 'fight'), WE)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['we.w.khornate-eviscerator'], 'fight'), WE)).toEqual(['wpn-brutal-assault-weapon'])
    expect(soundIds(declared(['we.w.exalted-chainblade'], 'fight'), WE)).toEqual(['wpn-relic-weapon'])
    expect(soundIds(declared(['we.w.skullsmasher'], 'fight'), WE)).toEqual(['wpn-power-fist'])
  })

  it("a sister's flamer and mace voice as themselves even with no datasheet to read", () => {
    expect(weaponFlavour('ade.w.ministorum-flamer', undefined, ADE)).toBe('flame')
    expect(weaponFlavour('ade.w.hallowed-mace', undefined, ADE)).toBe('crush')
    expect(weaponFlavour('ade.w.boltgun', undefined, ADE)).toBe('bolter')
  })

  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(`classifies ${id} as ${expected}`, () => {
      expect(weaponFlavour(id, bundle.weapons[id], factionOfWeapon(id))).toBe(expected)
    })
  }

  it('every melee weapon gets a melee flavour and every ranged one a tracer-capable flavour', () => {
    for (const [id, weapon] of Object.entries(bundle.weapons)) {
      const flavour = weaponFlavour(id, weapon, factionOfWeapon(id))
      expect(isRangedFlavour(flavour), `${id} (${weapon.type})`).toBe(weapon.type === 'ranged')
    }
  })

  it('falls back on the firing unit\'s faction when the weapon is unknown to the bundle', () => {
    expect(weaponFlavour('mystery.gun', undefined, ORK)).toBe('shoota')
    expect(weaponFlavour('mystery.gun', undefined, SM)).toBe('bolter')
    expect(weaponFlavour('mystery.gun', undefined, NEC)).toBe('psychic')
    expect(weaponFlavour('mystery.gun', undefined, TYR)).toBe('shoota')
    expect(weaponFlavour('mystery.gun', undefined, AM)).toBe('bolter')
    // the store's own setup keys ('orks'/'space-marines') classify the same way, in case a caller
    // ever passes one of those instead
    expect(weaponFlavour('mystery.gun', undefined, 'orks')).toBe('shoota')
    // ...and on the id alone when there's no faction either — a stale id still describes itself.
    expect(weaponFlavour('ork.w.rokkit-launcha', undefined, '')).toBe('heavy')
    expect(weaponFlavour('sm.w.pyreblaster', undefined, '')).toBe('flame')
  })
})

describe('firing sounds', () => {
  it('every weapon in the data bundle has its own sound, and the file exists', () => {
    for (const id of Object.keys(bundle.weapons)) {
      const sound = weaponSound(id)
      expect(sound, id).toBeDefined()
      expect(SFX_IDS).toContain(sound!.id)
      expect(existsSync(`public/audio/${sound!.id}.mp3`), sound!.id).toBe(true)
    }
  })

  it('bolt weapons are explosive shells, each with its own report', () => {
    expect(soundIds(declared(['sm.w.storm-bolter']), SM)).toEqual(['wpn-storm-bolter'])
    expect(soundIds(declared(['csm.w.boltgun', 'csm.w.boltgun']), CSM)).toEqual(['wpn-boltgun'])
    expect(soundIds(declared(['csm.w.heavy-bolter']), CSM)).toEqual(['wpn-heavy-bolter'])
    expect(soundIds(declared(['ade.w.condemnor-boltgun']), ADE)).toEqual(['wpn-condemnor-boltgun'])
    expect(soundIds(declared(['csm.w.bolt-pistol-cultist-champion']), CSM)).toEqual(['wpn-bolt-pistol'])
  })

  it('choppas swing like blades, chainswords keep the chainsword, flamers roar', () => {
    expect(soundIds(declared(['ork.w.choppa'], 'fight'), ORK)).toEqual(['wpn-choppa'])
    expect(soundIds(declared(['ork.w.big-choppa'], 'fight'), ORK)).toEqual(['wpn-big-choppa'])
    expect(soundIds(declared(['ork.w.uge-choppa'], 'fight'), ORK)).toEqual(['wpn-uge-choppa'])
    expect(soundIds(declared(['am.w.chainsword'], 'fight'), AM)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['ade.w.hallowed-chainsword'], 'fight'), ADE)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['ade.w.ministorum-flamer']), ADE)).toEqual(['wpn-flamer'])
    expect(soundIds(declared(['ade.w.ministorum-heavy-flamer']), ADE)).toEqual(['wpn-heavy-flamer'])
    expect(soundIds(declared(['sm.w.pyreblaster']), SM)).toEqual(['wpn-pyreblaster'])
  })

  it('drukhari splinter weapons patter, blades ring, lances thrum', () => {
    expect(soundIds(declared(['drk.w.splinter-rifle']), DRK)).toEqual(['wpn-autogun'])
    expect(soundIds(declared(['drk.w.splinter-cannon']), DRK)).toEqual(['wpn-big-shoota'])
    expect(soundIds(declared(['drk.w.huskblade'], 'fight'), DRK)).toEqual(['wpn-power-weapon'])
    expect(soundIds(declared(['drk.w.dark-lance', 'drk.w.dark-lance-2']), DRK)).toEqual(['wpn-tachyon-arrow'])
  })

  it('profile variants share their weapon\'s sound', () => {
    expect(soundIds(declared(['am.w.plasma-gun-supercharge']), AM)).toEqual(['wpn-plasma-gun'])
    expect(soundIds(declared(['nec.w.twin-gauss-flayer']), NEC)).toEqual(['wpn-gauss-flayer'])
    expect(soundIds(declared(['tyr.w.leapers-talons'], 'fight'), TYR)).toEqual(['wpn-talons'])
    expect(soundIds(declared(['ork.w.power-klaw'], 'fight'), ORK)).toEqual(['power-klaw-crunch'])
  })

  it('Votann guns and gauntlets borrow the closest existing voice', () => {
    expect(soundIds(declared(['lov.w.ion-blaster', 'lov.w.ion-blaster']), LOV)).toEqual(['pulse-rifle-shot'])
    expect(soundIds(declared(['lov.w.magna-rail-rifle']), LOV)).toEqual(['ion-raker'])
    expect(soundIds(declared(['lov.w.mass-gauntlet'], 'fight'), LOV)).toEqual(['wpn-power-fist'])
    expect(soundIds(declared(['lov.w.heavy-plasma-axe-sweep-mole'], 'fight'), LOV)).toEqual(['wpn-relic-weapon'])
    expect(soundIds(declared(['lov.w.autoch-pattern-bolt-pistol']), LOV)).toEqual(['wpn-bolt-pistol'])
  })

  it('Khorne daemon weapons ring, crash, tear and roar with their own voices', () => {
    expect(weaponSound('cdm.w.hellblade')!.id).toBe('wpn-power-weapon')
    expect(weaponSound('cdm.w.blade-of-blood')!.id).toBe('wpn-power-weapon')
    expect(weaponSound('cdm.w.juggernauts-bladed-horn')!.id).toBe('wpn-brutal-assault-weapon')
    expect(weaponSound('cdm.w.gore-drenched-fangs')!.id).toBe('wpn-talons')
    expect(weaponSound('cdm.w.burning-roar')!.id).toBe('wpn-flamer')
  })

  it('an unknown weapon falls back to its flavour sound', () => {
    expect(soundIds(declared(['mystery.w.flame-thing']), SM)).toEqual(['flamer'])
  })

  it('ten models firing the same gun is one shot sound, not ten', () => {
    const tenBoyz = declared(Array.from({ length: 10 }, () => 'ork.w.shoota'))
    expect(soundIds(tenBoyz, ORK)).toEqual(['wpn-shoota'])
  })

  it('a squad firing two different weapons plays both, with the second ducked', () => {
    const mixed = soundsForEvent(declared(['sm.w.storm-bolter', 'sm.w.pyreblaster']), 'A', lookupFor(SM))
    expect(mixed.map((s) => s.id)).toEqual(['wpn-storm-bolter', 'wpn-pyreblaster'])
    expect(mixed[1].opts?.volume).toBeLessThan(mixed[0].opts?.volume ?? 1)
  })

  it('AttackSequenceStarted no longer voices the shot itself (TargetsDeclared does)', () => {
    const started = { type: 'AttackSequenceStarted', seq: 1, round: 1, turn: 'A', phase: 'shooting', player: 'A', unitId: 'u1', kind: 'ranged', overwatch: false } as GameEvent
    expect(soundsForEvent(started, 'A', lookupFor(SM))).toEqual([])
  })

  it('without a lookup, firing still makes the weapon\'s own sound', () => {
    expect(soundsForEvent(declared(['ork.w.big-shoota']), 'A').map((s) => s.id)).toEqual(['wpn-big-shoota'])
  })
})

describe('death sounds', () => {
  const died = (unitId: string) => ({ type: 'ModelDestroyed', seq: 1, round: 1, turn: 'A', phase: 'shooting', unitId, modelId: 'm1', byPlayer: 'B', byUnitId: null, byModelId: null, kind: 'ranged' }) as unknown as GameEvent
  const lookup = (faction: string): SoundLookup => ({ weapon: () => undefined, factionOfUnit: () => faction })
  it('each faction dies in its own voice', () => {
    expect(soundsForEvent(died('u'), 'A', lookup(ADE))[0].id).toBe('death-adepta-sororitas')
    expect(soundsForEvent(died('u'), 'A', lookup(ORK))[0].id).toBe('death-orks')
    expect(soundsForEvent(died('u'), 'A', lookup(SM))[0].id).toBe('death-space-marines')
    expect(soundsForEvent(died('u'), 'A', lookup(NEC))[0].id).toBe('death-necrons')
  })
  it('thousand sons die with the chaos cry', () => {
    expect(soundsForEvent(died('u'), 'A', lookup('thousand-sons'))[0].id).toBe('death-chaos-space-marines')
  })
  it('thousand sons weapons: sorcery crackles like Smite, inferno bolters bark, the khopesh rings', () => {
    const THS = 'thousand-sons'
    expect(soundIds(declared(['ths.w.screamer-invocation-witchfire']), THS)).toEqual(['wpn-smite'])
    expect(soundIds(declared(['ths.w.warpsmite']), THS)).toEqual(['wpn-smite'])
    expect(soundIds(declared(['ths.w.hellfyre-missile-rack']), THS)).toEqual(['wpn-hunter-killer-missile'])
    expect(soundIds(declared(['ths.w.prosperine-khopesh'], 'fight'), THS)).toEqual(['wpn-power-weapon'])
  })
  it('chaos daemons die with the guttural chaos voice', () => {
    expect(soundsForEvent(died('u'), 'A', lookup(CDM))[0].id).toBe('death-chaos-space-marines')
  })
  it('an unknown faction falls back to the generic death', () => {
    expect(soundsForEvent(died('u'), 'A')[0].id).toBe('model-death')
  })
})
