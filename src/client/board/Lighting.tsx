import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { usePresentationSettings } from '../presentation/settings'

/** Sun direction (unit vector from the board towards the sun, y up) and colour — exported so other
 *  code (ambience flashes, decals, UI) can stay consistent with the key light. Elevation is ~32 degrees:
 *  low enough to rake across figures and terrain so forms show a light-to-shade gradient. */
export const SUN_DIRECTION: readonly [number, number, number] = [0.736, 0.534, 0.416]
export const SUN_COLOR = '#ffe2b8'
const SUN_DISTANCE = 60
const SUN_POSITION: [number, number, number] = [SUN_DIRECTION[0] * SUN_DISTANCE, SUN_DIRECTION[1] * SUN_DISTANCE, SUN_DIRECTION[2] * SUN_DISTANCE]

/** Sun-lit scene: a warm shadowed directional key, a cool sky / warm bounce hemisphere carrying most of the
 *  ambient, and a weak cool shadowless fill from the opposite side so faces turned away from the sun stay
 *  readable (darker and bluer than the lit side, never black). The shadow frustum is an orthographic box
 *  looking down the sun direction: +-30" across covers the 44x30 board's half-diagonal (26.6") plus the
 *  sideways shift of tall terrain, +-24" vertically covers the board's foreshortened depth (~14") plus terrain
 *  height, and far=130 reaches past the board from the 60" stand-off. The shadow map is only re-rendered on
 *  demand (see ShadowSync) rather than every frame. */
export function Lighting() {
  const lowGraphics = usePresentationSettings((s) => s.lowGraphics)
  return (
    <>
      <hemisphereLight intensity={1} color="#9dbaff" groundColor="#7a6446" />
      <ambientLight intensity={0.15} />
      <directionalLight position={[-24, 14, -16]} intensity={0.5} color="#a9c0ff" />
      <directionalLight
        position={SUN_POSITION}
        intensity={2.6}
        color={SUN_COLOR}
        castShadow={!lowGraphics}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={130}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
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
