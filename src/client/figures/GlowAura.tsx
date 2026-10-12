// Unit-card hover glow: a soft, pulsing halo around the figure plus a light pool on the ground, so
// hovering a unit (or one row of its models) in the unit card shows exactly which figures those are.
// Additive and depth-write-free, so it brightens whatever is behind it without hiding the figure.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, DoubleSide, SRGBColorSpace, type Mesh, type MeshBasicMaterial, type Sprite, type SpriteMaterial, type Texture } from 'three'

const GLOW_COLOR = '#ffd966'

/** White centre fading to transparent — tinted by the material colour. */
function makeGlowTexture(): Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function GlowAura({ height, radius }: { height: number; radius: number }) {
  const map = useMemo(makeGlowTexture, [])
  useEffect(() => () => map?.dispose(), [map])
  const halo = useRef<Sprite>(null!)
  const pool = useRef<Mesh>(null!)
  const haloSize = Math.max(height * 1.9, radius * 3.6)
  const poolSize = radius * 5

  // The demand frameloop only renders on invalidate, so the pulse asks for the next frame itself.
  useFrame((state) => {
    const k = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4)
    if (halo.current) {
      ;(halo.current.material as SpriteMaterial).opacity = 0.75 + 0.25 * k
      halo.current.scale.setScalar(haloSize * (0.95 + 0.08 * k))
    }
    if (pool.current) (pool.current.material as MeshBasicMaterial).opacity = 0.8 + 0.2 * k
    state.invalidate()
  })

  return (
    <group>
      <sprite ref={halo} position={[0, height * 0.5, 0]} renderOrder={3}>
        <spriteMaterial map={map} color={GLOW_COLOR} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh ref={pool} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[poolSize, poolSize]} />
        <meshBasicMaterial map={map} color={GLOW_COLOR} transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
