// Every archetype in a row on a plain ground, labelled — for screenshots (30-figures.md, task
// brief). FigureGallery is the R3F content, meant to sit inside any Canvas (e.g. Scene.tsx);
// FigureGalleryStage additionally brings its own Canvas + lights + camera so it can be dropped in
// on its own for a quick look without wiring anything else up.
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { Figure } from './Figure'
import type { Pose } from './types'

interface GalleryEntry {
  datasheetId: string
  faction: string
  label: string
}

const GALLERY_ENTRIES: GalleryEntry[] = [
  { datasheetId: 'sm.captain-octavius', faction: 'sm', label: 'Captain Octavius' },
  { datasheetId: 'sm.librarian-tantus', faction: 'sm', label: 'Librarian Tantus' },
  { datasheetId: 'sm.infernus-squad', faction: 'sm', label: 'Infernus Squad' },
  { datasheetId: 'sm.terminator-squad', faction: 'sm', label: 'Terminator Squad' },
  { datasheetId: 'ork.boyz', faction: 'ork', label: 'Boyz' },
  { datasheetId: 'ork.warboss-gordrang', faction: 'ork', label: 'Warboss Gordrang' },
  { datasheetId: 'ork.deffkoptas', faction: 'ork', label: 'Deffkoptas' },
  { datasheetId: 'ork.deff-dread', faction: 'ork', label: 'Deff Dread' },
]

// Figures are true tabletop-miniature scale (~1-2 world-inches tall — see resolveBase), so packing
// them tightly and shooting from a modest elevation both matter for "fills a good part of the
// frame": at a fixed vertical FOV/aspect, an object's share of frame height is ~ height*aspect/rowWidth
// regardless of distance, so the row's total width is the one lever that actually helps.
const SPACING = 2.2
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

export function FigureGallery({ pose = 'idle', faction }: FigureGalleryProps) {
  const entries = faction ? GALLERY_ENTRIES.filter((e) => e.faction === faction) : GALLERY_ENTRIES
  const startX = -((entries.length - 1) * SPACING) / 2
  return (
    <group>
      <mesh position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[entries.length * SPACING + 4, 6]} />
        <meshStandardMaterial color="#2c2f38" />
      </mesh>
      {entries.map((entry, i) => (
        <group key={entry.datasheetId} position={[startX + i * SPACING, 0, 0]}>
          <Figure datasheetId={entry.datasheetId} faction={entry.faction} pose={pose} />
          <Text position={[0, 0.15, 1.3]} fontSize={0.2} color="#e8e8f2" anchorX="center" anchorY="middle" maxWidth={SPACING - 0.4}>
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
  const count = (faction ? GALLERY_ENTRIES.filter((e) => e.faction === faction) : GALLERY_ENTRIES).length
  const rowFitWidth = (count - 1) * SPACING + 2 * EDGE_MARGIN
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
