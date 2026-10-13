import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import {
  CircleGeometry,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Group,
} from 'three'
import { DIE, FACE_NORMAL, HALF, TRAY_H, TRAY_W, buildPlans, layout, mulberry32, poseAt, type Plan } from './throw'

export interface ActiveRoll {
  id: number
  faces: number[]
  target?: number
  /** Per-die pass/fail (same order as faces); overrides target for highlighting. */
  pass?: boolean[]
  /** Re-throw mode: only dice flagged here are thrown at t0; the rest rest settled from the start. */
  rethrow?: boolean[]
  /** With rethrow: faces the re-thrown dice were showing before they were picked up. */
  prevFaces?: number[]
  seed: number
  t0: number // seconds (performance.now()/1000) when thrown
  dur: number // seconds for one die's throw
  leaveAt?: number
  /** How the dice leave: fly off the mat (default) or sink into the ground and shrink (battlefield style). */
  leave?: 'sink'
  /** Fixed landing slots (local units) instead of the mat grid; battlefield style. */
  slots?: [number, number][]
  settled: boolean
}

const PIP_GEO = new CircleGeometry(0.058, 16)
const PIP_MAT = new MeshBasicMaterial({ color: '#16181c' })
const ACE_MAT = new MeshBasicMaterial({ color: '#b3202a' })
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
}
interface PipXf { pos: [number, number, number]; quat: [number, number, number, number]; ace: boolean }
const PIP_XFS: PipXf[] = (() => {
  const out: PipXf[] = []
  for (let v = 1; v <= 6; v++) {
    const n = FACE_NORMAL[v]
    const u = Math.abs(n.y) > 0.5 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0).cross(n).normalize()
    const w = new Vector3().crossVectors(n, u)
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n)
    for (const [a, b] of PIPS[v]) {
      const p = n.clone().multiplyScalar(HALF + 0.002).addScaledVector(u, a * 0.15).addScaledVector(w, b * 0.15)
      out.push({ pos: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w], ace: v === 1 })
    }
  }
  return out
})()

const BASE = new Color('#ece5d2')
const DIM = new Color('#6c6a62')
const ONE = new Color('#d98a8a')
const GOLD = new Color('#f2c94c')
const CRIT = new Color('#7df9ff')

function Die({ plan, prev, index, roll }: { plan: Plan; prev?: Plan; index: number; roll: ActiveRoll }) {
  const g = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const body = useMemo(() => new MeshStandardMaterial({ color: BASE, roughness: 0.35, metalness: 0.05 }), [])
  const ringMat = useMemo(
    () => new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide }),
    [],
  )
  const ring2Mat = useMemo(
    () => new MeshBasicMaterial({ color: CRIT, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: DoubleSide }),
    [],
  )
  const reveal = useRef(0)
  const tmpP = useMemo(() => new Vector3(), [])
  const tmpQ = useMemo(() => new Quaternion(), [])
  const judged = roll.target != null || roll.pass != null
  const crit = judged && plan.value === 6
  const pass = judged && (roll.pass ? roll.pass[index] === true : plan.value >= (roll.target ?? 7))
  const ace = judged && plan.value === 1
  const thrown = roll.rethrow ? roll.rethrow[index] === true : true

  useEffect(
    () => () => {
      body.dispose()
      ringMat.dispose()
      ring2Mat.dispose()
    },
    [body, ringMat, ring2Mat],
  )

  useFrame((_, dt) => {
    const grp = g.current
    if (!grp) return
    const now = performance.now() / 1000
    const el = thrown ? now - roll.t0 - plan.delay : Infinity
    const u = Math.min(1, Math.max(0, el / roll.dur))
    // A die waiting to be re-thrown rests on its old face; once picked up it flies with the new one.
    const waiting = prev != null && el < 0
    grp.visible = el >= 0 || waiting
    poseAt(waiting ? prev : plan, waiting ? 1 : u, tmpP, tmpQ)
    grp.position.copy(tmpP)
    grp.quaternion.copy(tmpQ)
    if (u >= 1 && judged) reveal.current = Math.min(1, reveal.current + dt * 4)
    const r = reveal.current
    const tint = ace ? ONE : pass ? BASE : DIM
    body.color.copy(BASE).lerp(tint, r)
    body.emissive.copy(crit ? CRIT : GOLD)
    body.emissiveIntensity = pass ? r * (crit ? 0.5 : 0.28) : 0
    ringMat.color.copy(crit ? CRIT : GOLD)
    ringMat.opacity = pass ? r * 0.95 : 0
    ring2Mat.opacity = crit ? r * 0.8 : 0
    if (ring.current) ring.current.visible = r > 0
    if (roll.leaveAt != null) {
      const lv = Math.min(1, (now - roll.leaveAt) / (roll.leave === 'sink' ? 0.3 : 0.35))
      if (roll.leave === 'sink') {
        grp.position.y -= lv * DIE * 0.9
        grp.scale.setScalar(1 - lv * 0.6)
      } else {
        grp.position.x += lv * lv * 22
        grp.position.y += lv * 2
        grp.quaternion.premultiply(tmpQ.setFromAxisAngle(plan.axis, lv * 6))
      }
      ringMat.opacity *= 1 - lv
      ring2Mat.opacity *= 1 - lv
      if (lv >= 1) {
        grp.visible = false
        if (ring.current) ring.current.visible = false
      }
    }
  })

  return (
    <>
      <group ref={g} visible={false}>
        <RoundedBox args={[DIE, DIE, DIE]} radius={0.075} smoothness={3} castShadow material={body} />
        {PIP_XFS.map((p, i) => (
          <mesh key={i} position={p.pos} quaternion={p.quat} geometry={PIP_GEO} material={p.ace ? ACE_MAT : PIP_MAT} />
        ))}
      </group>
      <group ref={ring} position={[plan.end.x, 0.02, plan.end.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <mesh material={ringMat}>
          <ringGeometry args={[0.46, 0.58, 40]} />
        </mesh>
        <mesh material={ring2Mat}>
          <ringGeometry args={[0.64, 0.72, 40]} />
        </mesh>
      </group>
    </>
  )
}

export function RollDice({ roll }: { roll: ActiveRoll }) {
  const plans = useMemo(() => buildPlans(roll.faces, mulberry32(roll.seed), roll.slots), [roll])
  // Same seed + same dice count gives the same slots, so the old faces rest exactly where the new ones land.
  const prevPlans = useMemo(
    () => (roll.prevFaces ? buildPlans(roll.prevFaces, mulberry32(roll.seed), roll.slots) : null),
    [roll],
  )
  return (
    <>
      {plans.map((p, i) => (
        <Die key={i} plan={p} prev={roll.rethrow?.[i] ? prevPlans?.[i] : undefined} index={i} roll={roll} />
      ))}
    </>
  )
}

function Felt({ overlay }: { overlay: boolean }) {
  const t = 0.1
  const edges: [number, number, number, number][] = [
    [0, TRAY_H / 2, TRAY_W, t],
    [0, -TRAY_H / 2, TRAY_W, t],
    [TRAY_W / 2, 0, t, TRAY_H],
    [-TRAY_W / 2, 0, t, TRAY_H],
  ]
  return (
    <group>
      {overlay ? (
        // In the game the panel's CSS supplies the dark felt and its soft edge; this is just the mat the dice land on.
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
          <planeGeometry args={[TRAY_W + 6, TRAY_H + 4]} />
          <shadowMaterial opacity={0.45} />
        </mesh>
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[80, 60]} />
            <meshStandardMaterial color="#183f2f" roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
            <planeGeometry args={[TRAY_W, TRAY_H]} />
            <meshStandardMaterial color="#1f5240" roughness={1} />
          </mesh>
        </>
      )}
      {!overlay &&
        edges.map(([x, z, w, h], i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.008, z]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color="#c9b27a" />
          </mesh>
        ))}
    </group>
  )
}

function CameraRig({ n }: { n: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const L = layout(n)
    const t = Math.tan((40 / 2) * (Math.PI / 180))
    const elev = (52 * Math.PI) / 180
    const hw = L.width / 2 + 0.9
    const hh = (L.depth / 2 + 0.9) * Math.sin(elev) + 0.5
    const dist = Math.max(hw / (t * aspect), hh / t)
    camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, n])
  return null
}

function Watcher({ rolls, onSettled }: { rolls: ActiveRoll[]; onSettled: (id: number) => void }) {
  useFrame(() => {
    const now = performance.now() / 1000
    for (const r of rolls) {
      if (r.settled || r.leaveAt != null) continue
      if (now >= r.t0 + r.dur + 0.4) {
        r.settled = true
        onSettled(r.id)
      }
    }
  })
  return null
}

export function Scene({
  rolls,
  onSettled,
  overlay = false,
  idle = false,
}: {
  rolls: ActiveRoll[]
  onSettled: (id: number) => void
  /** In-game panel: transparent background, no big felt plane (the panel's CSS is the mat). */
  overlay?: boolean
  /** Stop rendering while nothing is on the table. */
  idle?: boolean
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.5, far: 200 }}
      gl={{ antialias: true, alpha: overlay }}
      frameloop={idle ? 'never' : 'always'}
    >
      {!overlay && <color attach="background" args={['#0e1512']} />}
      <CameraRig n={rolls.filter((r) => r.leaveAt == null).at(-1)?.faces.length ?? 10} />
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[-6, 16, 7]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
      />
      <Felt overlay={overlay} />
      {rolls.map((r) => (
        <RollDice key={r.id} roll={r} />
      ))}
      <Watcher rolls={rolls} onSettled={onSettled} />
    </Canvas>
  )
}
