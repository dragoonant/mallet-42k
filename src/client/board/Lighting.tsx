/** Hemisphere fill + a single shadowed directional key light, sized for the 44x30 board. */
export function Lighting() {
  return (
    <>
      <hemisphereLight intensity={0.9} color="#dfe4ff" groundColor="#2a2a34" />
      <directionalLight
        position={[20, 34, 14]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0005}
      />
    </>
  )
}
