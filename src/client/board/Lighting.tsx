import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { usePresentationSettings } from '../presentation/settings'

/** Hemisphere + ambient fill, a single shadowed directional key light sized for the 44x30 board, and a
 *  weak shadowless fill from the opposite side so faces turned away from the key keep their colour.
 *  The shadow map is only re-rendered on demand (see ShadowSync) rather than every frame. */
export function Lighting() {
  const lowGraphics = usePresentationSettings((s) => s.lowGraphics)
  return (
    <>
      <hemisphereLight intensity={0.9} color="#dfe4ff" groundColor="#4a4a58" />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-18, 16, -12]} intensity={0.45} color="#cfd8ff" />
      <directionalLight
        position={[20, 34, 14]}
        intensity={1.2}
        castShadow={!lowGraphics}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
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

/** Makes the shadow map update on demand: figures flag it stale while animating (figures/anim.ts
 *  requestFrame); this flags it whenever `deps` change (unit positions, terrain) and a few times
 *  shortly after mount so late-loading terrain models get into the map. */
export function ShadowSync({ deps }: { deps: readonly unknown[] }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    const timers = [400, 1200, 3000].map((ms) =>
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true
        invalidate()
      }, ms),
    )
    return () => timers.forEach(clearTimeout)
  }, [gl, invalidate])
  useEffect(() => {
    gl.shadowMap.needsUpdate = true
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}
