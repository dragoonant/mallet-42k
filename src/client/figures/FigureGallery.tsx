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

const SPACING = 3.2

export function FigureGallery({ pose = 'idle' }: { pose?: Pose }) {
  const startX = -((GALLERY_ENTRIES.length - 1) * SPACING) / 2
  return (
    <group>
      <mesh position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GALLERY_ENTRIES.length * SPACING + 4, 6]} />
        <meshStandardMaterial color="#2c2f38" />
      </mesh>
      {GALLERY_ENTRIES.map((entry, i) => (
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

/** Self-contained gallery: its own Canvas/lights/camera/controls, for screenshotting on its own. */
export function FigureGalleryStage({ pose = 'idle' }: { pose?: Pose }) {
  return (
    <Canvas camera={{ position: [0, 4.5, 17], fov: 42, near: 0.1, far: 200 }} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#0a0a10']} />
      <hemisphereLight intensity={1.0} groundColor="#2a2a34" />
      <directionalLight position={[6, 8, 4]} intensity={1.2} />
      <FigureGallery pose={pose} />
      <OrbitControls makeDefault minDistance={2} maxDistance={60} target={[0, 0.5, 0]} />
    </Canvas>
  )
}
