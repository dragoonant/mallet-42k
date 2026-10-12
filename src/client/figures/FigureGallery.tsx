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
  { datasheetId: 'ade.canoness-adalya', faction: 'adepta-sororitas', label: 'Canoness Adalya', modelId: 'canoness' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister Superior', modelId: 'superior' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister (flamer)', modelId: 'sister-flamer' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister (heavy flamer)', modelId: 'sister-heavy-flamer' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Sister (Simulacrum)', modelId: 'sister-simulacrum' },
  { datasheetId: 'ade.battle-sisters-squad', faction: 'adepta-sororitas', label: 'Battle Sister', modelId: 'sister' },
  { datasheetId: 'ade.celestian-sacresants', faction: 'adepta-sororitas', label: 'Celestian Sacresant', modelId: 'sacresant' },
  { datasheetId: 'ade.arco-flagellants', faction: 'adepta-sororitas', label: 'Arco-flagellant', modelId: 'arco' },
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
  { datasheetId: 'cus.vertus-praetors', faction: 'adeptus-custodes', label: 'Vertus Praetors' },
  { datasheetId: 'gk.strike-squad', faction: 'grey-knights', label: 'Strike Squad' },
  { datasheetId: 'gk.brotherhood-terminator-squad', faction: 'grey-knights', label: 'Brotherhood Terminators' },
  { datasheetId: 'gk.librarian-aurellios', faction: 'grey-knights', label: 'Librarian Aurellios' },
  { datasheetId: 'gk.nemesis-dreadknight', faction: 'grey-knights', label: 'Nemesis Dreadknight' },
  { datasheetId: 'tau.strike-team', modelId: 'fire-warrior-rifle', faction: 'tau-empire', label: 'Fire Warrior' },
  { datasheetId: 'tau.strike-team', modelId: 'shasui', faction: 'tau-empire', label: "Shas'ui" },
  { datasheetId: 'tau.shasnel-dtano', modelId: 'fireblade', faction: 'tau-empire', label: "Shas'nel D'tano" },
  { datasheetId: 'tau.aun-shar', modelId: 'aun-shar', faction: 'tau-empire', label: "Aun'Shar" },
  { datasheetId: 'tau.stealth-battlesuits', modelId: 'shasvre', faction: 'tau-empire', label: 'Stealth Battlesuit' },
  { datasheetId: 'tau.ghostkeel', modelId: 'ghostkeel', faction: 'tau-empire', label: 'Ghostkeel' },
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
        <group key={`${entry.datasheetId}/${entry.modelId ?? ''}`} position={[startX + positions[i], 0, 0]}>
          <Figure datasheetId={entry.datasheetId} modelId={entry.modelId} faction={entry.faction} pose={pose} />
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
