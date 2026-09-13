import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'

// 1 world unit = 1 inch. Combat Patrol board: 44" x 30", centred at the origin.
const BOARD_WIDTH_IN = 44
const BOARD_DEPTH_IN = 30
const GRID_STEP_IN = 6

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 40, 34], fov: 45, near: 0.1, far: 500 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0a0a10']} />
      <hemisphereLight intensity={0.6} groundColor="#1a1a20" />
      <directionalLight position={[20, 30, 10]} intensity={1.1} />

      {/* Battlefield surface, laid flat in the XZ plane so Y stays "up". */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD_WIDTH_IN, BOARD_DEPTH_IN]} />
        <meshStandardMaterial color="#20222a" />
      </mesh>

      <Grid
        args={[BOARD_WIDTH_IN, BOARD_DEPTH_IN]}
        position={[0, 0.01, 0]}
        cellSize={GRID_STEP_IN}
        cellThickness={0.6}
        cellColor="#3d4050"
        sectionSize={GRID_STEP_IN}
        sectionThickness={0.6}
        sectionColor="#4d5064"
        fadeDistance={120}
        fadeStrength={1}
        infiniteGrid={false}
      />

      <OrbitControls makeDefault minDistance={5} maxDistance={150} />
    </Canvas>
  )
}
