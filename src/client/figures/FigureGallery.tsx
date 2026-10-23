// Every archetype in a row on a plain ground, labelled — for screenshots (30-figures.md, task
// brief). FigureGallery is the R3F content, meant to sit inside any Canvas (e.g. Scene.tsx);
// FigureGalleryStage additionally brings its own Canvas + lights + camera so it can be dropped in
// on its own for a quick look without wiring anything else up.
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { Figure } from './Figure'
import { resolveBase, resolveFigureKit, useDataBundle } from './data'
import type { Pose } from './types'

interface GalleryEntry {
  datasheetId: string
  faction: string
  label: string
  /** Datasheet model type, for a unit whose models look different (resolveFigureKit's per-model kits). */
  modelId?: string
  /** Stable per-instance key, only to pick a model type's alternate GLB sculpt. */
  variantKey?: string
}

const GALLERY_ENTRIES: GalleryEntry[] = [
  { datasheetId: 'sm.captain-octavius', modelId: 'captain', faction: 'sm', label: "Captain Octavius" },
  { datasheetId: 'sm.librarian-tantus', modelId: 'librarian', faction: 'sm', label: "Librarian Tantus" },
  { datasheetId: 'sm.infernus-squad', modelId: 'sergeant', faction: 'sm', label: "Infernus Sergeant" },
  { datasheetId: 'sm.infernus-squad', modelId: 'marine', faction: 'sm', label: "Infernus Marine" },
  { datasheetId: 'sm.terminator-squad', modelId: 'sergeant', faction: 'sm', label: "Terminator Sergeant" },
  { datasheetId: 'sm.terminator-squad', modelId: 'gunner', faction: 'sm', label: "Terminator" },
  { datasheetId: 'ork.warboss-gordrang', modelId: 'gordrang', faction: 'ork', label: "Warboss Gordrang" },
  { datasheetId: 'ork.boyz', modelId: 'boss-nob', faction: 'ork', label: "Boss Nob" },
  { datasheetId: 'ork.boyz', modelId: 'boy-choppa', faction: 'ork', label: "Boy" },
  { datasheetId: 'ork.beastboss-morgrim', modelId: 'beastboss', faction: 'ork', label: "Beastboss Morgrim" },
  { datasheetId: 'ork.beast-snagga-boyz', modelId: 'nob', faction: 'ork', label: "Beast Snagga Nob" },
  { datasheetId: 'ork.beast-snagga-boyz', modelId: 'boy-thump-gun', faction: 'ork', label: "Snagga Thump Gun" },
  { datasheetId: 'ork.beast-snagga-boyz', modelId: 'boy-choppa', faction: 'ork', label: "Beast Snagga Boy" },
  { datasheetId: 'ork.squighog-boyz', modelId: 'squighog-boy', faction: 'ork', label: "Squighog Boy" },
  { datasheetId: 'ork.squighog-boyz', modelId: 'nob-smasha-squig', faction: 'ork', label: "Nob on Smasha Squig" },
  { datasheetId: 'ork.deff-dread', modelId: 'deff-dread', faction: 'ork', label: "Deff Dread" },
  { datasheetId: 'ork.deffkoptas', modelId: 'kopta-blasta', faction: 'ork', label: "Deffkopta" },
  { datasheetId: 'nec.necron-warriors', faction: 'necrons', label: 'Necron Warriors' },
  { datasheetId: 'nec.overlord-amonhotekh', faction: 'necrons', label: 'Overlord Amonhotekh' },
  { datasheetId: 'nec.skorpekh-destroyers', faction: 'necrons', label: 'Skorpekh Destroyers' },
  { datasheetId: 'nec.canoptek-doomstalker', faction: 'necrons', label: 'Canoptek Doomstalker' },
  { datasheetId: 'nec.canoptek-scarab-swarms', faction: 'necrons', label: 'Scarab Swarms' },
  { datasheetId: 'csm.aranis-zarkan', modelId: 'zarkan', faction: 'chaos-space-marines', label: "Aranis Zarkan" },
  { datasheetId: 'csm.possessed', modelId: 'possessed', faction: 'chaos-space-marines', label: "Possessed" },
  { datasheetId: 'csm.legionaries', modelId: 'champion', faction: 'chaos-space-marines', label: "Legionary Champion" },
  { datasheetId: 'csm.legionaries', modelId: 'boltgun', faction: 'chaos-space-marines', label: "Legionary" },
  { datasheetId: 'csm.cultist-mob', modelId: 'champion', faction: 'chaos-space-marines', label: "Cultist Champion" },
  { datasheetId: 'csm.cultist-mob', modelId: 'cultist', faction: 'chaos-space-marines', label: "Cultist" },
  { datasheetId: 'tyr.termagants', modelId: 'termagant', faction: 'tyranids', label: "Termagant" },
  { datasheetId: 'tyr.barbgaunts', modelId: 'barbgaunt', faction: 'tyranids', label: "Barbgaunt" },
  { datasheetId: 'tyr.von-ryans-leapers', modelId: 'leaper', faction: 'tyranids', label: "Von Ryan's Leaper" },
  { datasheetId: 'tyr.terror-of-vardenghast', modelId: 'prime', faction: 'tyranids', label: "Terror of Vardenghast" },
  { datasheetId: 'tyr.psychophage', modelId: 'psychophage', faction: 'tyranids', label: "Psychophage" },
  { datasheetId: 'tyr.lictor', modelId: 'lictor', faction: 'tyranids', label: "Lictor" },
  { datasheetId: 'tyr.deaths-shadow', modelId: 'neurolictor', faction: 'tyranids', label: "Death's Shadow" },
  { datasheetId: 'ade.canoness-adalya', faction: 'adepta-sororitas', label: 'Canoness Adalya', modelId: 'canoness' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister Superior', modelId: 'superior' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister (flamer)', modelId: 'sister-flamer' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister (heavy flamer)', modelId: 'sister-heavy-flamer' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister (Simulacrum)', modelId: 'sister-simulacrum' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Battle Sister', modelId: 'sister' },
  { datasheetId: 'ade.celestian-sacresants', faction: 'adepta-sororitas', label: 'Celestian Sacresant', modelId: 'sacresant' },
  { datasheetId: 'ade.arco-flagellants', faction: 'adepta-sororitas', label: 'Arco-flagellant', modelId: 'arco' },
  { datasheetId: 'ade.canoness-ellyrine', faction: 'adepta-sororitas', label: 'Canoness Ellyrine', modelId: 'canoness' },
  { datasheetId: 'ade.seraphim-squad', faction: 'adepta-sororitas', label: 'Seraphim Superior', modelId: 'superior' },
  { datasheetId: 'ade.seraphim-squad', faction: 'adepta-sororitas', label: 'Seraphim', modelId: 'seraphim' },
  { datasheetId: 'ade.repentia-squad', faction: 'adepta-sororitas', label: 'Repentia Superior', modelId: 'superior' },
  { datasheetId: 'ade.repentia-squad', faction: 'adepta-sororitas', label: 'Sister Repentia', modelId: 'repentia' },
  { datasheetId: 'ade.penitent-engine', faction: 'adepta-sororitas', label: 'Penitent Engine', modelId: 'engine' },
  { datasheetId: 'ade.sororitas-rhino', faction: 'adepta-sororitas', label: 'Sororitas Rhino', modelId: 'rhino' },
  { datasheetId: 'drk.archon', faction: 'drukhari', label: 'Archon', modelId: 'archon' },
  { datasheetId: 'drk.kabalite-warriors', faction: 'drukhari', label: 'Sybarite', modelId: 'sybarite' },
  { datasheetId: 'drk.kabalite-warriors', faction: 'drukhari', label: 'Kabalite Warrior', modelId: 'warrior' },
  { datasheetId: 'drk.kabalite-warriors', faction: 'drukhari', label: 'Kabalite (shredder)', modelId: 'shredder-warrior' },
  { datasheetId: 'drk.kabalite-warriors', faction: 'drukhari', label: 'Kabalite (splinter cannon)', modelId: 'cannon-warrior' },
  { datasheetId: 'drk.incubi', faction: 'drukhari', label: 'Klaivex', modelId: 'klaivex' },
  { datasheetId: 'drk.incubi', faction: 'drukhari', label: 'Incubus', modelId: 'incubus' },
  { datasheetId: 'drk.raider', faction: 'drukhari', label: 'Raider', modelId: 'raider' },
  { datasheetId: 'drk.ravager', faction: 'drukhari', label: 'Ravager', modelId: 'ravager' },
  { datasheetId: 'am.cadian-shock-troops', modelId: 'trooper', faction: 'astra-militarum', label: 'Shock Troops' },
  { datasheetId: 'am.cadian-shock-troops', modelId: 'sergeant', faction: 'astra-militarum', label: 'Shock Sergeant' },
  { datasheetId: 'am.command-squad-karsk', modelId: 'karsk', faction: 'astra-militarum', label: 'Lord Marshal Karsk' },
  { datasheetId: 'am.command-squad-karsk', modelId: 'veteran-standard', faction: 'astra-militarum', label: 'Standard Bearer' },
  { datasheetId: 'am.field-ordnance-battery', modelId: 'gun-bombast', faction: 'astra-militarum', label: 'Field Gun' },
  { datasheetId: 'am.field-ordnance-battery', modelId: 'gun-malleus', faction: 'astra-militarum', label: 'Rocket Battery' },
  { datasheetId: 'am.armoured-sentinels', modelId: 'sentinel', faction: 'astra-militarum', label: 'Armoured Sentinel' },
  { datasheetId: 'cus.custodian-guard', modelId: 'spear', faction: 'adeptus-custodes', label: 'Custodian Guard (spear)' },
  { datasheetId: 'cus.custodian-guard', modelId: 'blade', faction: 'adeptus-custodes', label: 'Custodian Guard (blade)' },
  { datasheetId: 'cus.custodian-guard', modelId: 'vexilla', faction: 'adeptus-custodes', label: 'Vexilla bearer' },
  { datasheetId: 'cus.shield-captain-tyvan', faction: 'adeptus-custodes', label: 'Shield-Captain Tyvan' },
  { datasheetId: 'cus.prosecutors', faction: 'adeptus-custodes', label: 'Prosecutors' },
  { datasheetId: 'cus.vigilators', faction: 'adeptus-custodes', label: 'Vigilators' },
  { datasheetId: 'lov.kahl-warspeke', modelId: 'kahl', faction: 'leagues-of-votann', label: 'Kahl Warspeke' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'theyn', faction: 'leagues-of-votann', label: 'Theyn' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'warrior', faction: 'leagues-of-votann', label: 'Hearthkyn Warrior' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'warrior-comms', faction: 'leagues-of-votann', label: 'Warrior (comms array)' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'warrior-medipack', faction: 'leagues-of-votann', label: 'Warrior (medipack)' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'warrior-scanner', faction: 'leagues-of-votann', label: 'Warrior (scanner)' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'warrior-hylas', faction: 'leagues-of-votann', label: 'Warrior (HYLas)' },
  { datasheetId: 'lov.hearthkyn-warriors', modelId: 'warrior-magna', faction: 'leagues-of-votann', label: 'Warrior (magna-rail)' },
  { datasheetId: 'lov.hernkyn-pioneers', modelId: 'pioneer-comms', faction: 'leagues-of-votann', label: 'Pioneer (comms)' },
  { datasheetId: 'lov.hernkyn-pioneers', modelId: 'pioneer-searchlight', faction: 'leagues-of-votann', label: 'Pioneer (searchlight)' },
  { datasheetId: 'lov.hernkyn-pioneers', modelId: 'pioneer-rotary', faction: 'leagues-of-votann', label: 'Pioneer (rotary cannon)' },
  { datasheetId: 'lov.cthonian-beserks', modelId: 'beserk', faction: 'leagues-of-votann', label: 'Beserk (plasma axe)' },
  { datasheetId: 'lov.cthonian-beserks', modelId: 'beserk-gauntlet', faction: 'leagues-of-votann', label: 'Beserk (gauntlets)' },
  { datasheetId: 'lov.cthonian-beserks', modelId: 'beserk-mole', faction: 'leagues-of-votann', label: 'Beserk (mole launcher)' },
  { datasheetId: 'cus.vertus-praetors', faction: 'adeptus-custodes', label: 'Vertus Praetors' },
  { datasheetId: 'cus.tristraen', modelId: 'champion', faction: 'adeptus-custodes', label: 'Tristraen' },
  { datasheetId: 'cus.custodian-guard-tgb', modelId: 'guard', faction: 'adeptus-custodes', label: 'Custodian Guard (sentinel blade)' },
  { datasheetId: 'cus.custodian-wardens', modelId: 'axe', faction: 'adeptus-custodes', label: 'Custodian Warden (axe)' },
  { datasheetId: 'cus.custodian-wardens', modelId: 'spear', faction: 'adeptus-custodes', label: 'Custodian Warden (spear)' },
  { datasheetId: 'cus.allarus-custodians', modelId: 'allarus', faction: 'adeptus-custodes', label: 'Allarus Custodian' },
  { datasheetId: 'gk.strike-squad', faction: 'grey-knights', label: 'Strike Squad' },
  { datasheetId: 'gk.brotherhood-terminator-squad', faction: 'grey-knights', label: 'Brotherhood Terminators' },
  { datasheetId: 'gk.librarian-aurellios', faction: 'grey-knights', label: 'Librarian Aurellios' },
  { datasheetId: 'gk.nemesis-dreadknight', faction: 'grey-knights', label: 'Nemesis Dreadknight', modelId: 'dreadknight' },
  { datasheetId: 'da.intercessor-squad', modelId: 'intercessor', faction: 'dark-angels', label: 'Intercessor' },
  { datasheetId: 'da.intercessor-squad', modelId: 'sergeant', faction: 'dark-angels', label: 'Intercessor Sergeant' },
  { datasheetId: 'da.chaplain-mordekai', modelId: 'mordekai', faction: 'dark-angels', label: 'Chaplain Mordekai' },
  { datasheetId: 'da.inceptor-squad', modelId: 'inceptor', faction: 'dark-angels', label: 'Inceptor' },
  { datasheetId: 'da.redemptor-dreadnought', modelId: 'redemptor', faction: 'dark-angels', label: 'Redemptor Dreadnought' },
  { datasheetId: 'da.hellblaster-squad', modelId: 'hellblaster', faction: 'dark-angels', label: 'Hellblaster' },
  { datasheetId: 'da.bladeguard-veteran-squad', modelId: 'bladeguard', faction: 'dark-angels', label: 'Bladeguard Veteran' },
  { datasheetId: 'da.master-zacharial', modelId: 'zacharial', faction: 'dark-angels', label: 'Master Zacharial' },
  { datasheetId: 'bt.intercessor-squad', modelId: 'intercessor', faction: 'black-templars', label: 'BT Intercessor' },
  { datasheetId: 'bt.primaris-crusader-squad', modelId: 'sword-brother', faction: 'black-templars', label: 'Sword Brother' },
  { datasheetId: 'bt.primaris-crusader-squad', modelId: 'initiate-bolt-rifle', faction: 'black-templars', label: 'Initiate (bolt rifle)' },
  { datasheetId: 'bt.primaris-crusader-squad', modelId: 'initiate-chainsword', faction: 'black-templars', label: 'Initiate (chainsword)' },
  { datasheetId: 'bt.primaris-crusader-squad', modelId: 'initiate-pyreblaster', faction: 'black-templars', label: 'Initiate (pyreblaster)' },
  { datasheetId: 'bt.primaris-crusader-squad', modelId: 'neophyte-chainsword', faction: 'black-templars', label: 'Neophyte (chainsword)' },
  { datasheetId: 'bt.primaris-crusader-squad', modelId: 'neophyte-firearm', faction: 'black-templars', label: 'Neophyte (firearm)' },
  { datasheetId: 'bt.marshal-siguard', modelId: 'siguard', faction: 'black-templars', label: 'Marshal Siguard' },
  { datasheetId: 'bt.impulsor', modelId: 'impulsor', faction: 'black-templars', label: 'Impulsor' },
  { datasheetId: 'tau.strike-team', modelId: 'fire-warrior-rifle', faction: 'tau-empire', label: 'Fire Warrior' },
  { datasheetId: 'tau.strike-team', modelId: 'shasui', faction: 'tau-empire', label: "Shas'ui" },
  { datasheetId: 'tau.shasnel-dtano', modelId: 'fireblade', faction: 'tau-empire', label: "Shas'nel D'tano" },
  { datasheetId: 'tau.aun-shar', modelId: 'aun-shar', faction: 'tau-empire', label: "Aun'Shar" },
  { datasheetId: 'tau.stealth-battlesuits', modelId: 'shasvre', faction: 'tau-empire', label: 'Stealth Battlesuit' },
  { datasheetId: 'tau.ghostkeel', modelId: 'ghostkeel', faction: 'tau-empire', label: 'Ghostkeel' },
  { datasheetId: 'tau.commander-cloudspear', modelId: 'cloudspear', faction: 'tau-empire', label: 'Commander Cloudspear' },
  { datasheetId: 'tau.pathfinder-team', modelId: 'shasui', faction: 'tau-empire', label: "Pathfinder Shas'ui" },
  { datasheetId: 'tau.pathfinder-team', modelId: 'pathfinder-carbine', faction: 'tau-empire', label: 'Pathfinder' },
  { datasheetId: 'tau.pathfinder-team', modelId: 'pathfinder-rail', faction: 'tau-empire', label: 'Pathfinder (rail rifle)' },
  { datasheetId: 'tau.breacher-team', modelId: 'shasui', faction: 'tau-empire', label: "Breacher Shas'ui" },
  { datasheetId: 'tau.breacher-team', modelId: 'breacher', faction: 'tau-empire', label: 'Breacher' },
  { datasheetId: 'tau.devilfish', modelId: 'devilfish', faction: 'tau-empire', label: 'Devilfish' },
  { datasheetId: 'gsc.neophyte-hybrids', modelId: 'hybrid', faction: 'genestealer-cults', label: 'Neophyte' },
  { datasheetId: 'gsc.neophyte-hybrids', modelId: 'leader', faction: 'genestealer-cults', label: 'Neophyte Leader' },
  { datasheetId: 'gsc.neophyte-hybrids', modelId: 'icon', faction: 'genestealer-cults', label: 'Cult Icon' },
  { datasheetId: 'gsc.neophyte-hybrids', modelId: 'webber', faction: 'genestealer-cults', label: 'Webber' },
  { datasheetId: 'gsc.acolyte-hybrids', modelId: 'hybrid', faction: 'genestealer-cults', label: 'Acolyte' },
  { datasheetId: 'gsc.acolyte-hybrids', modelId: 'leader', faction: 'genestealer-cults', label: 'Acolyte Leader' },
  { datasheetId: 'gsc.aberrants', modelId: 'aberrant', faction: 'genestealer-cults', label: 'Aberrant' },
  { datasheetId: 'gsc.aberrants', modelId: 'hypermorph', faction: 'genestealer-cults', label: 'Hypermorph' },
  { datasheetId: 'gsc.magus-veridielle', modelId: 'magus', faction: 'genestealer-cults', label: 'Magus Veridielle' },
  { datasheetId: 'gsc.goliath-rockgrinder', modelId: 'rockgrinder', faction: 'genestealer-cults', label: 'Goliath Rockgrinder' },
  { datasheetId: 'gsc.shanus-daskovian', modelId: 'shanus', faction: 'genestealer-cults', label: 'Shanus Daskovian' },
  { datasheetId: 'gsc.hybrid-metamorphs', modelId: 'mutant', faction: 'genestealer-cults', label: 'Hybrid Metamorph' },
  { datasheetId: 'gsc.atalan-jackals', modelId: 'rider', faction: 'genestealer-cults', label: 'Atalan Jackal' },
  { datasheetId: 'gsc.achilles-ridgerunner', modelId: 'ridgerunner', faction: 'genestealer-cults', label: 'Achilles Ridgerunner' },
  { datasheetId: 'sm.lieutenant-solarien', modelId: 'solarien', faction: 'sm', label: "Lieutenant Solarien" },
  { datasheetId: 'sm.librarian-xarius', modelId: 'xarius', faction: 'sm', label: "Librarian Xarius" },
  { datasheetId: 'sm.infiltrator-squad', modelId: 'infiltrator', faction: 'sm', label: "Infiltrator" },
  { datasheetId: 'sm.suppressor-squad', modelId: 'suppressor', faction: 'sm', label: "Suppressor" },
  { datasheetId: 'csm.ghallaron-the-pious', modelId: 'ghallaron', faction: 'chaos-space-marines', label: "Ghallaron the Pious" },
  { datasheetId: 'csm.ghallaron-the-pious', modelId: 'disciple', faction: 'chaos-space-marines', label: "Dark Disciple" },
  { datasheetId: 'csm.legionaries-dz', modelId: 'chainsword', faction: 'chaos-space-marines', label: "Legionary (chainsword)" },
  { datasheetId: 'csm.legionaries-dz', modelId: 'icon', faction: 'chaos-space-marines', label: "Legionary (icon)" },
  { datasheetId: 'csm.havocs', modelId: 'champion', faction: 'chaos-space-marines', label: "Havoc Champion" },
  { datasheetId: 'csm.havocs', modelId: 'heavy-bolter', faction: 'chaos-space-marines', label: "Havoc (heavy bolter)" },
  { datasheetId: 'csm.havocs', modelId: 'lascannon', faction: 'chaos-space-marines', label: "Havoc (lascannon)" },
  { datasheetId: 'csm.havocs', modelId: 'missile-launcher', faction: 'chaos-space-marines', label: "Havoc (missile launcher)" },
  { datasheetId: 'csm.havocs', modelId: 'reaper-chaincannon', faction: 'chaos-space-marines', label: "Havoc (reaper chaincannon)" },
  { datasheetId: 'dg.plague-marines', modelId: 'champion', faction: 'death-guard', label: 'Plague Champion' },
  { datasheetId: 'dg.plague-marines', modelId: 'boltgun', faction: 'death-guard', label: 'Plague Marine' },
  { datasheetId: 'dg.plague-marines', modelId: 'spewer', faction: 'death-guard', label: 'Plague Marine (spewer)' },
  { datasheetId: 'dg.plague-marines', modelId: 'blight-launcher', faction: 'death-guard', label: 'Plague Marine (blight launcher)' },
  { datasheetId: 'dg.folgoth-grelch', modelId: 'grelch', faction: 'death-guard', label: 'Folgoth Grelch' },
  { datasheetId: 'dg.typhus', modelId: 'typhus', faction: 'death-guard', label: 'Typhus' },
  { datasheetId: 'dg.poxwalkers', modelId: 'poxwalker', faction: 'death-guard', label: 'Poxwalker' },
  { datasheetId: 'dg.poxwalkers', modelId: 'poxwalker', variantKey: 'b1', faction: 'death-guard', label: 'Poxwalker (variant)' },
  { datasheetId: 'csm.helbrute', modelId: 'helbrute', faction: 'chaos-space-marines', label: "Helbrute" },
  { datasheetId: 'we.khorne-berzerkers', modelId: 'champion', faction: 'world-eaters', label: 'Berzerker Champion' },
  { datasheetId: 'we.khorne-berzerkers', modelId: 'plasma', faction: 'world-eaters', label: 'Berzerker (plasma pistol)' },
  { datasheetId: 'we.khorne-berzerkers', modelId: 'icon', faction: 'world-eaters', label: 'Berzerker (icon of Khorne)' },
  { datasheetId: 'we.khorne-berzerkers', modelId: 'eviscerator', faction: 'world-eaters', label: 'Berzerker (eviscerator)' },
  { datasheetId: 'we.khorne-berzerkers', modelId: 'chainblade', faction: 'world-eaters', label: 'Berzerker' },
  { datasheetId: 'we.jakhals', modelId: 'pack-leader', faction: 'world-eaters', label: 'Jakhal Pack Leader' },
  { datasheetId: 'we.jakhals', modelId: 'dishonoured', faction: 'world-eaters', label: 'Dishonoured' },
  { datasheetId: 'we.jakhals', modelId: 'mauler', faction: 'world-eaters', label: 'Jakhal (mauler)' },
  { datasheetId: 'we.jakhals', modelId: 'icon', faction: 'world-eaters', label: 'Jakhal (icon of Khorne)' },
  { datasheetId: 'we.jakhals', modelId: 'jakhal', faction: 'world-eaters', label: 'Jakhal' },
  { datasheetId: 'we.karagar-the-blooded', modelId: 'karagar', faction: 'world-eaters', label: 'Karagar the Blooded' },
  { datasheetId: 'ade.pen.battle-sisters-squad', modelId: 'superior', faction: 'adepta-sororitas', label: 'PEN Sister Superior' },
  { datasheetId: 'ade.pen.battle-sisters-squad', modelId: 'sister-storm-bolter', faction: 'adepta-sororitas', label: 'PEN Sister (storm bolter)' },
  { datasheetId: 'ade.pen.battle-sisters-squad', modelId: 'sister-flamer', faction: 'adepta-sororitas', label: 'PEN Sister (flamer)' },
  { datasheetId: 'ade.pen.battle-sisters-squad', modelId: 'sister-simulacrum', faction: 'adepta-sororitas', label: 'PEN Sister (Simulacrum)' },
  { datasheetId: 'ade.pen.battle-sisters-squad', modelId: 'sister', faction: 'adepta-sororitas', label: 'PEN Battle Sister' },
  { datasheetId: 'ade.pen.arco-flagellants', modelId: 'arco', faction: 'adepta-sororitas', label: 'PEN Arco-flagellant' },
  { datasheetId: 'gsc.hybrid-metamorphs', modelId: 'leader', faction: 'genestealer-cults', label: 'Metamorph Leader' },
  { datasheetId: 'gsc.hybrid-metamorphs', modelId: 'flamer', faction: 'genestealer-cults', label: 'Metamorph (flamer)' },
  { datasheetId: 'gsc.atalan-jackals', modelId: 'power-rider', faction: 'genestealer-cults', label: 'Atalan Jackal (power cleaver)' },
  { datasheetId: 'gsc.atalan-jackals', modelId: 'wolfquad', faction: 'genestealer-cults', label: 'Atalan Wolfquad' },
  { datasheetId: 'ael.farseer-iraneth', modelId: 'farseer', faction: 'aeldari', label: 'Farseer Iraneth' },
  { datasheetId: 'ael.guardian-defenders', modelId: 'guardian-defender', faction: 'aeldari', label: 'Guardian Defender' },
  { datasheetId: 'ael.guardian-defenders', modelId: 'heavy-weapon-platform', faction: 'aeldari', label: 'Heavy Weapon Platform' },
  { datasheetId: 'ael.windriders', modelId: 'windrider-catapult', faction: 'aeldari', label: 'Windrider (catapults)' },
  { datasheetId: 'ael.windriders', modelId: 'windrider-scatter', faction: 'aeldari', label: 'Windrider (scatter laser)' },
  { datasheetId: 'ael.wraithlord', modelId: 'wraithlord', faction: 'aeldari', label: 'Wraithlord' },
  { datasheetId: 'adm.manipulus-skand', modelId: 'skand', faction: 'adeptus-mechanicus', label: "Manipulus Skand" },
  { datasheetId: 'adm.skitarii-vanguard', modelId: 'alpha', faction: 'adeptus-mechanicus', label: "Vanguard Alpha" },
  { datasheetId: 'adm.skitarii-vanguard', modelId: 'arc-rifle', faction: 'adeptus-mechanicus', label: "Skitarius (arc rifle)" },
  { datasheetId: 'adm.skitarii-vanguard', modelId: 'plasma-caliver', faction: 'adeptus-mechanicus', label: "Skitarius (plasma caliver)" },
  { datasheetId: 'adm.skitarii-vanguard', modelId: 'vanguard', faction: 'adeptus-mechanicus', label: "Skitarius (radium carbine)" },
  { datasheetId: 'ba.intercessor-squad', modelId: 'sergeant', faction: 'blood-angels', label: 'Intercessor Sergeant' },
  { datasheetId: 'ba.intercessor-squad', modelId: 'intercessor', faction: 'blood-angels', label: 'Intercessor' },
  { datasheetId: 'ba.incursor-squad', modelId: 'sergeant', faction: 'blood-angels', label: 'Incursor Sergeant' },
  { datasheetId: 'ba.incursor-squad', modelId: 'incursor', faction: 'blood-angels', label: 'Incursor' },
  { datasheetId: 'ba.incursor-squad', modelId: 'incursor-haywire', faction: 'blood-angels', label: 'Incursor (haywire mine)' },
  { datasheetId: 'ba.aggressor-squad', modelId: 'aggressor', faction: 'blood-angels', label: 'Aggressor' },
  { datasheetId: 'ba.librarian-marcellos', modelId: 'marcellos', faction: 'blood-angels', label: 'Librarian Marcellos' },
  { datasheetId: 'ba.impulsor', modelId: 'impulsor', faction: 'blood-angels', label: 'Impulsor' },
  { datasheetId: 'cdm.bloodletters', modelId: 'bloodletter', faction: 'chaos-daemons', label: 'Bloodletter' },
  { datasheetId: 'cdm.bloodletters', modelId: 'bloodletter-icon', faction: 'chaos-daemons', label: 'Bloodletter (icon)' },
  { datasheetId: 'cdm.bloodletters', modelId: 'bloodletter-musician', faction: 'chaos-daemons', label: 'Bloodletter (horn)' },
  { datasheetId: 'cdm.khharret-the-butcher', modelId: 'khharret', faction: 'chaos-daemons', label: "Kh'har'ret the Butcher" },
  { datasheetId: 'cdm.bloodcrushers', modelId: 'bloodcrusher', faction: 'chaos-daemons', label: 'Bloodcrusher' },
  { datasheetId: 'cdm.bloodcrushers', modelId: 'bloodcrusher-icon', faction: 'chaos-daemons', label: 'Bloodcrusher (icon)' },
  { datasheetId: 'cdm.bloodcrushers', modelId: 'bloodcrusher-musician', faction: 'chaos-daemons', label: 'Bloodcrusher (horn)' },
  { datasheetId: 'cdm.flesh-hounds', modelId: 'flesh-hound', faction: 'chaos-daemons', label: 'Flesh Hound' },
  { datasheetId: 'cdm.flesh-hounds', modelId: 'gore-hound', faction: 'chaos-daemons', label: 'Gore Hound' },
  { datasheetId: 'adm.serberys-sulphurhounds', modelId: 'alpha', faction: 'adeptus-mechanicus', label: "Sulphurhound Alpha" },
  { datasheetId: 'adm.serberys-sulphurhounds', modelId: 'carbine', faction: 'adeptus-mechanicus', label: "Sulphurhound (blast carbine)" },
  { datasheetId: 'adm.serberys-sulphurhounds', modelId: 'pistols', faction: 'adeptus-mechanicus', label: "Sulphurhound (paired pistols)" },
  { datasheetId: 'adm.pteraxii-sterylizors', modelId: 'alpha', faction: 'adeptus-mechanicus', label: "Sterylizor Alpha" },
  { datasheetId: 'adm.pteraxii-sterylizors', modelId: 'sterylizor', faction: 'adeptus-mechanicus', label: "Pteraxii Sterylizor" },
  { datasheetId: 'adm.enginseer-verask', modelId: 'verask', faction: 'adeptus-mechanicus', label: "Enginseer Verask" },
  { datasheetId: 'adm.skitarii-rangers', modelId: 'alpha', faction: 'adeptus-mechanicus', label: "Ranger Alpha" },
  { datasheetId: 'adm.skitarii-rangers', modelId: 'ranger', faction: 'adeptus-mechanicus', label: "Skitarius (galvanic rifle)" },
  { datasheetId: 'adm.skitarii-rangers', modelId: 'arc-rifle', faction: 'adeptus-mechanicus', label: "Ranger (arc rifle)" },
  { datasheetId: 'adm.skitarii-rangers', modelId: 'arquebus', faction: 'adeptus-mechanicus', label: "Ranger (transuranic arquebus)" },
  { datasheetId: 'adm.kataphron-destroyers', modelId: 'grav', faction: 'adeptus-mechanicus', label: "Kataphron (heavy grav-cannon)" },
  { datasheetId: 'adm.kataphron-destroyers', modelId: 'plasma', faction: 'adeptus-mechanicus', label: "Kataphron (plasma culverin)" },
  { datasheetId: 'adm.onager-dunecrawler', modelId: 'dunecrawler', faction: 'adeptus-mechanicus', label: "Onager Dunecrawler" },
  { datasheetId: 'dw.lieutenant-alphion', modelId: 'alphion', faction: 'deathwatch', label: "Lieutenant Alphion" },
  { datasheetId: 'dw.apothecary-krenn', modelId: 'krenn', faction: 'deathwatch', label: "Apothecary Krenn" },
  { datasheetId: 'dw.intercessor-squad', modelId: 'sergeant', faction: 'deathwatch', label: "Deathwatch Intercessor Sergeant" },
  { datasheetId: 'dw.intercessor-squad', modelId: 'intercessor', faction: 'deathwatch', label: "Deathwatch Intercessor" },
  { datasheetId: 'dw.intercessor-squad', modelId: 'grenadier', faction: 'deathwatch', label: "Deathwatch Grenadier" },
  { datasheetId: 'dw.aggressor-squad', modelId: 'aggressor', faction: 'deathwatch', label: "Deathwatch Aggressor" },
  { datasheetId: 'sw.battle-leader-thoryk', modelId: 'thoryk', faction: 'space-wolves', label: "Battle Leader Thoryk" },
  { datasheetId: 'sw.intercessor-squad', modelId: 'sergeant', faction: 'space-wolves', label: "Wolf Intercessor Sergeant" },
  { datasheetId: 'sw.intercessor-squad', modelId: 'intercessor', faction: 'space-wolves', label: "Wolf Intercessor" },
  { datasheetId: 'sw.reiver-squad', modelId: 'reiver', faction: 'space-wolves', label: "Wolf Reiver" },
  { datasheetId: 'sw.invictor-tactical-warsuit', modelId: 'invictor', faction: 'space-wolves', label: "Invictor Tactical Warsuit" },
  { datasheetId: 'ths.ahrak-the-time-weaver', modelId: 'ahrak', faction: 'thousand-sons', label: 'Ahrak the Time Weaver' },
  { datasheetId: 'ths.scarab-occult-terminators', modelId: 'sorcerer', faction: 'thousand-sons', label: 'Scarab Sorcerer' },
  { datasheetId: 'ths.scarab-occult-terminators', modelId: 'combi', faction: 'thousand-sons', label: 'Scarab Terminator (combi-bolter)' },
  { datasheetId: 'ths.scarab-occult-terminators', modelId: 'soulreaper', faction: 'thousand-sons', label: 'Scarab Terminator (soulreaper cannon)' },
  { datasheetId: 'ths.scarab-occult-terminators', modelId: 'hellfyre', faction: 'thousand-sons', label: 'Scarab Terminator (hellfyre rack)' },
  { datasheetId: 'ths.tzaangors', modelId: 'tzaangor', faction: 'thousand-sons', label: 'Tzaangor' },
]

// Figures are true tabletop-miniature scale (~1-2 world-inches tall — see resolveBase), so packing
// them tightly and shooting from a modest elevation both matter for "fills a good part of the
// frame": at a fixed vertical FOV/aspect, an object's share of frame height is ~ height*aspect/rowWidth
// regardless of distance, so the row's total width is the one lever that actually helps.
const MIN_SPACING = 2.2
const BASE_CLEARANCE = 0.5 // gap between two adjacent bases' edges, on top of their own half-widths
const EDGE_MARGIN = 1.6 // clearance beyond the outermost figure for its base + label
const ELEVATION_DEG = 20 // camera pitch above the row — a flattering "product shot" angle
const TARGET_Y = 0.75 // roughly half an infantry figure's height (most entries are infantry/heavy)
const ASSUMED_ASPECT = 16 / 9 // this view is only ever shot at a fixed widescreen viewport

interface FigureGalleryProps {
  pose?: Pose
  /** Restrict the row to one faction's entries (e.g. "sm" | "ork") — used for close-up
   *  per-faction screenshots. Omit to show every archetype. */
  faction?: string
}

function entriesFor(faction?: string): GalleryEntry[] {
  return faction ? GALLERY_ENTRIES.filter((e) => e.faction === faction) : GALLERY_ENTRIES
}

/** Row x-positions spaced by each entry's own base half-width (plus a fixed clearance) rather than a
 *  single fixed spacing — a 60mm Dread and a 32mm Boy no longer share the same slot width, so big
 *  bases (Warboss, Deffkoptas, Dread) stop overlapping their neighbours. */
function useRowLayout(entries: GalleryEntry[]): { positions: number[]; totalWidth: number } {
  const bundle = useDataBundle()
  const halfWidths = entries.map((e) => {
    const datasheet = bundle?.datasheets[e.datasheetId]
    const { archetype } = resolveFigureKit(e.datasheetId, datasheet, e.modelId)
    const base = resolveBase(datasheet, archetype)
    return Math.max(base.radiusX, base.radiusZ, MIN_SPACING / 2 - BASE_CLEARANCE)
  })
  const positions: number[] = [0]
  for (let i = 1; i < entries.length; i++) {
    positions.push(positions[i - 1] + halfWidths[i - 1] + halfWidths[i] + BASE_CLEARANCE)
  }
  const totalWidth = entries.length > 0 ? positions[positions.length - 1] + halfWidths[0] + halfWidths[halfWidths.length - 1] : 0
  return { positions, totalWidth }
}

export function FigureGallery({ pose = 'idle', faction }: FigureGalleryProps) {
  const entries = entriesFor(faction)
  const { positions, totalWidth } = useRowLayout(entries)
  const startX = -(positions[entries.length - 1] ?? 0) / 2
  return (
    <group>
      <mesh position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[totalWidth + 4, 6]} />
        <meshStandardMaterial color="#2c2f38" />
      </mesh>
      {entries.map((entry, i) => (
        <group key={`${entry.datasheetId}/${entry.modelId ?? ''}/${entry.variantKey ?? ''}`} position={[startX + positions[i], 0, 0]}>
          <Figure datasheetId={entry.datasheetId} modelId={entry.modelId} variantKey={entry.variantKey} faction={entry.faction} pose={pose} />
          <Text position={[0, 0.15, 1.3]} fontSize={0.2} color="#e8e8f2" anchorX="center" anchorY="middle" maxWidth={MIN_SPACING - 0.4}>
            {entry.label}
          </Text>
        </group>
      ))}
    </group>
  )
}

const FOV_DEG = 42

/** Self-contained gallery: its own Canvas/lights/camera/controls, for screenshotting on its own.
 *  Camera distance is solved from the row's actual width so it just fits the frame (a filtered,
 *  single-faction row therefore zooms in automatically instead of keeping the full-row framing
 *  around a handful of figures), and the pitch is a fixed, flattering elevation rather than
 *  scaling with distance (which would turn the full 8-wide row into a washed-out bird's-eye shot). */
export function FigureGalleryStage({ pose = 'idle', faction }: FigureGalleryProps) {
  const entries = entriesFor(faction)
  const { totalWidth } = useRowLayout(entries)
  const rowFitWidth = totalWidth + 2 * EDGE_MARGIN
  const halfVFov = (FOV_DEG / 2) * (Math.PI / 180)
  const halfHFov = Math.atan(Math.tan(halfVFov) * ASSUMED_ASPECT)
  const distance = rowFitWidth / 2 / Math.tan(halfHFov)
  const height = TARGET_Y + distance * Math.tan((ELEVATION_DEG * Math.PI) / 180)
  return (
    <Canvas camera={{ position: [0, height, distance], fov: FOV_DEG, near: 0.1, far: 200 }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#0a0a10']} />
      <hemisphereLight intensity={1.0} groundColor="#2a2a34" />
      <directionalLight position={[6, 8, 4]} intensity={1.2} />
      <directionalLight position={[-6, 5, -3]} intensity={0.4} />
      <FigureGallery pose={pose} faction={faction} />
      <OrbitControls makeDefault minDistance={2} maxDistance={60} target={[0, TARGET_Y, 0]} />
    </Canvas>
  )
}
