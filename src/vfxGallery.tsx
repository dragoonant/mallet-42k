// Weapon-effects gallery (vfx.html): a small board with a shooter on the left and a target squad on the right.
// One button per ranged family fires a 6-shot volley of mixed hits and misses; "Loop all" cycles every family.
// Query: ?family=missile (select + auto-loop it), ?loop=1 (loop all). Uses the same VfxLayer/vfx.volley the game uses.
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { FAMILY_FX, VfxLayer, vfx, type VfxFamily } from './client/vfx'
import { VFX_FAMILIES } from './client/weaponFlavour'
import { spriteSources } from './client/vfx/textures'
import { modelSources } from './client/vfx/models'

const SHOOTERS = [{ x: -8.6, z: -2.2 }, { x: -9.4, z: 0 }, { x: -8.6, z: 2.2 }]
const TARGETS = [{ x: 8.6, z: -1.6 }, { x: 10, z: 0.4 }, { x: 8.2, z: 2 }]
const PATTERN = [true, true, false, true, false, true]

function fire(family: VfxFamily): void {
  vfx.volley({
    family,
    shots: PATTERN.map((hit, i) => {
      const s = SHOOTERS[i % SHOOTERS.length]
      const t = TARGETS[i % TARGETS.length]
      return { from: { x: s.x, y: 0, z: s.z }, to: { x: t.x, y: 0, z: t.z }, hit }
    }),
  })
}

function Figure({ x, z, color, face }: { x: number; z: number; color: string; face: number }) {
  // chunky chibi stand-in: stubby body, huge head
  return (
    <group position={[x, 0, z]} rotation={[0, face, 0]}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.38, 0.45, 0.7, 12]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 1.0, 0]}><sphereGeometry args={[0.52, 16, 12]} /><meshStandardMaterial color="#d9c9b0" /></mesh>
      <mesh position={[0.4, 0.55, 0]}><boxGeometry args={[0.7, 0.14, 0.14]} /><meshStandardMaterial color="#333" /></mesh>
    </group>
  )
}

function Stage() {
  return (
    <Canvas camera={{ position: [0, 11, 18], fov: 38, near: 0.1, far: 200 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)} style={{ position: 'absolute', inset: 0 }}>
      <color attach="background" args={['#1b1f26']} />
      <hemisphereLight args={['#9dbaff', '#7a6446', 1]} />
      <directionalLight position={[10, 18, 8]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[44, 30]} /><meshStandardMaterial color="#4a5646" /></mesh>
      {SHOOTERS.map((p, i) => <Figure key={`s${i}`} x={p.x} z={p.z} color="#3d6fd1" face={0} />)}
      {TARGETS.map((p, i) => <Figure key={`t${i}`} x={p.x} z={p.z} color="#c24a3a" face={Math.PI} />)}
      <VfxLayer />
    </Canvas>
  )
}

function Gallery() {
  const params = new URLSearchParams(window.location.search)
  const initial = (params.get('family') as VfxFamily | null) ?? 'bolt'
  const [family, setFamily] = useState<VfxFamily>(VFX_FAMILIES.includes(initial) ? initial : 'bolt')
  const [loopAll, setLoopAll] = useState(params.get('loop') === '1')
  const [auto, setAuto] = useState(params.has('family'))
  const idx = useRef(0)
  const [art, setArt] = useState('')

  const play = useCallback((f: VfxFamily) => {
    setFamily(f)
    fire(f)
  }, [])

  useEffect(() => {
    if (!loopAll && !auto) return
    const step = (): void => {
      if (loopAll) {
        idx.current = (idx.current + 1) % VFX_FAMILIES.length
        play(VFX_FAMILIES[idx.current])
      } else fire(family)
    }
    const first = window.setTimeout(step, 600)
    const id = window.setInterval(step, loopAll ? 3200 : 2800)
    return () => { window.clearTimeout(first); window.clearInterval(id) }
  }, [loopAll, auto, family, play])

  useEffect(() => {
    ;(window as unknown as { __fire: (f: VfxFamily) => void }).__fire = play
    const t = window.setInterval(() => {
      const s = { ...spriteSources(), ...modelSources() }
      const real = Object.values(s).filter((v) => v === 'real').length
      setArt(`${real}/${Object.keys(s).length} art files loaded (rest procedural)`)
    }, 1000)
    return () => window.clearInterval(t)
  }, [play])

  const fx = FAMILY_FX[family]
  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? '#c9a227' : '#262b33', color: active ? '#14161a' : '#e8e6e1', border: '1px solid #3a414c', borderRadius: 6,
    padding: '7px 12px', cursor: 'pointer', font: 'inherit', textTransform: 'capitalize',
  })
  return (
    <>
      <Stage />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '12px 16px', background: 'linear-gradient(#14161aee, #14161a00)', pointerEvents: 'none' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#c9a227' }}>{fx.label}</div>
        <div style={{ color: '#b9b6ae' }}>{fx.examples}</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, background: '#14161ad9' }}>
        {VFX_FAMILIES.map((f) => <button key={f} style={btn(f === family && !loopAll)} onClick={() => { setLoopAll(false); setAuto(false); play(f) }}>{f}</button>)}
        <button style={btn(loopAll)} onClick={() => setLoopAll((v) => !v)}>{loopAll ? 'Stop loop' : 'Loop all'}</button>
        <button style={btn(auto && !loopAll)} onClick={() => { setLoopAll(false); setAuto((v) => !v) }}>{auto && !loopAll ? 'Stop repeat' : 'Repeat'}</button>
        <span style={{ alignSelf: 'center', color: '#8d8a82', fontSize: 12 }}>{art} - <a href="./" style={{ color: '#c9a227' }}>game</a></span>
      </div>
    </>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><Gallery /></StrictMode>)
