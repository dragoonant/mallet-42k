// "Dice on the battlefield" presentation: the same scripted throws as the table overlay (table/throw.ts), but
// played inside the main game canvas on the actual board, near where the player is looking. Driven by the
// shared dice queue (diceStore.ts): this only renders the roll that is `current`; the store's timers decide
// when it settles and resolves. Totals show as a compact HTML card; click or Space during the hold moves on.
import { useEffect, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three'
import { useGameStore } from '../../store/game'
import { isBoardActive, skipHold, useDiceStore } from '../diceStore'
import { makeRoll } from '../table/DiceTableOverlay'
import { RollDice, type ActiveRoll } from '../table/Scene'
import { TOTALS_CSS, TotalsCard } from '../table/Totals'
import { DIE } from '../table/throw'
import { pickSpot, rowLayout, type Obstacles } from './spot'

const TARGET_DIE_PX = 40

const CSS =
  TOTALS_CSS +
  `
.bd-wrap{position:absolute;left:0;right:0;top:104px;display:flex;justify-content:center;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.bd-wrap .dt-tot{pointer-events:auto;cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:2px 14px;padding:6px 12px;max-width:min(560px,calc(100vw - 480px))}
.bd-wrap h2{font-size:13px;margin:0}
.bd-wrap .sub{font-size:11px;margin:0}
.bd-wrap .dt-big{font-size:24px}
.bd-wrap .dt-big small{font-size:12px}
.bd-wrap .dt-tally{display:flex;gap:3px;margin:0}
.bd-wrap .dt-tally div{display:flex;align-items:center;gap:2px;padding:0 4px}
.bd-wrap .dt-tally .ic{font-size:16px}
.bd-wrap .dt-tally .n{font-size:11px}
.bd-wrap .dt-meta{font-size:11px;gap:10px}.bd-wrap .dt-meta b{font-size:13px}
.bd-wrap .dt-tot>.sub:last-child{flex-basis:100%;text-align:right}
`

interface Spot {
  x: number
  z: number
  y: number
  /** Yaw so the throw's local -x (where dice enter) points at the camera. */
  yaw: number
  scale: number
  slots: [number, number][]
}

const _ray = new Raycaster()
const _ground = new Plane(new Vector3(0, 1, 0), 0)
const _hit = new Vector3()

/** Ground point under the screen position (50% x, 45% y). */
function aimPoint(camera: PerspectiveCamera): { x: number; z: number } {
  _ray.setFromCamera(new Vector2(0, 0.1), camera)
  if (_ray.ray.intersectPlane(_ground, _hit)) return { x: _hit.x, z: _hit.z }
  return { x: 0, z: 0 }
}

function gatherObstacles(): Obstacles {
  const game = useGameStore.getState().state
  const discs: Obstacles['discs'] = []
  const polys: Obstacles['polys'] = []
  if (!game) return { discs, polys }
  for (const p of Object.values(game.board.pieces)) polys.push({ footprint: p.footprint, height: p.height })
  for (const u of Object.values(game.units)) {
    if (u.location !== 'board') continue
    for (const id of u.models) {
      const m = game.models[id]
      if (m) discs.push({ x: m.pos.x, z: m.pos.z, r: Math.max(m.base.radius, m.base.radius2 ?? m.base.radius) })
    }
  }
  return { discs, polys }
}

function chooseSpot(camera: PerspectiveCamera, size: { width: number; height: number }, n: number): Spot {
  const aim = aimPoint(camera)
  const dist = Math.max(1, camera.position.distanceTo(new Vector3(aim.x, 0, aim.z)))
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
  const pxPerInch = size.height / (2 * dist * tanHalf)
  const visW = 2 * dist * tanHalf * (size.width / Math.max(1, size.height))
  const { cols } = rowLayout(n)
  let scale = Math.max(1, TARGET_DIE_PX / pxPerInch / DIE)
  scale = Math.max(1, Math.min(scale, (visW * 0.55) / (cols * 1.3)))
  // Rows face the camera: local -x points from the spot toward the camera.
  const dx = camera.position.x - aim.x
  const dz = camera.position.z - aim.z
  const yaw = Math.atan2(dz, -dx)
  const r = pickSpot(aim, n, yaw, scale, gatherObstacles())
  return { x: r.x, z: r.z, y: r.y, yaw, scale: r.scale, slots: r.slots }
}

export function BoardDice() {
  const current = useDiceStore((s) => s.current)
  const speed = useDiceStore((s) => s.speed)
  const style = useDiceStore((s) => s.style)
  const active = isBoardActive(style, speed)
  const { camera, size, invalidate, gl } = useThree()

  const [rolls, setRolls] = useState<ActiveRoll[]>([])
  const [spot, setSpot] = useState<Spot | null>(null)
  const nextId = useRef(1)
  const lastId = useRef<string | null>(null)
  const lastSpot = useRef<Spot | null>(null)
  const hasDice = !!current && current.dice.length > 0
  const settled = active && hasDice && current.phase === 'settled'

  // New roll became current: lock a landing spot (re-throws reuse it) and throw.
  useEffect(() => {
    if (!active || !current || current.dice.length === 0 || lastId.current === current.id) return
    lastId.current = current.id
    let sp = lastSpot.current
    if (!current.request.skipTumble || !sp) {
      sp = chooseSpot(camera as PerspectiveCamera, size, current.dice.length)
      lastSpot.current = sp
    }
    setSpot(sp)
    const roll = makeRoll(nextId.current++, current, speed as 'normal' | 'fast')
    roll.leave = 'sink'
    roll.slots = sp.slots
    const now = performance.now() / 1000
    setRolls((prev) => {
      for (const r of prev) if (r.leaveAt == null) r.leaveAt = now
      return [...prev, roll]
    })
    const id = roll.id
    window.setTimeout(() => setRolls((prev) => prev.filter((r) => r.id >= id)), 500)
    invalidate()
  }, [current, active, speed, camera, size, invalidate])

  // Roll over (or style switched away): sink the dice out, then clear.
  useEffect(() => {
    if (active && hasDice) return
    const now = performance.now() / 1000
    setRolls((prev) => {
      for (const r of prev) if (r.leaveAt == null) r.leaveAt = now
      return prev
    })
    invalidate()
    const t = window.setTimeout(() => {
      setRolls([])
      lastId.current = null
      lastSpot.current = null
    }, 400)
    return () => window.clearTimeout(t)
  }, [active, hasDice, invalidate])

  // During the hold: Space continues; a click on the canvas continues without reaching the board.
  useEffect(() => {
    if (!settled) return
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      e.preventDefault()
      skipHold()
    }
    const swallow = (e: Event) => {
      if (e.target !== gl.domElement) return
      e.stopPropagation()
      if (e.type === 'click') skipHold()
    }
    window.addEventListener('keydown', key)
    for (const t of ['pointerdown', 'pointerup', 'click']) window.addEventListener(t, swallow, true)
    return () => {
      window.removeEventListener('keydown', key)
      for (const t of ['pointerdown', 'pointerup', 'click']) window.removeEventListener(t, swallow, true)
    }
  }, [settled, gl])

  // The main canvas renders on demand: keep frames coming while dice are visible, and refresh the shadow map.
  useFrame(() => {
    if (rolls.length === 0) return
    if (gl.shadowMap.enabled) gl.shadowMap.needsUpdate = true
    invalidate()
  })

  const dice = current?.dice ?? []
  const req = current?.request
  const judged = dice.some((d) => d.outcome !== 'neutral')
  const successes = judged ? dice.filter((d) => d.outcome === 'success').length : null

  return (
    <>
      {rolls.length > 0 && spot && (
        <group position={[spot.x, spot.y, spot.z]} rotation={[0, spot.yaw, 0]} scale={spot.scale}>
          {rolls.map((r) => (
            <RollDice key={r.id} roll={r} />
          ))}
        </group>
      )}
      {settled && req && current && (
        <Html fullscreen zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <style>{CSS}</style>
          <div className="bd-wrap">
            <TotalsCard
              key={current.id}
              title={req.label ?? req.purpose}
              note={req.note}
              faces={dice.map((d) => d.value)}
              target={req.target}
              successes={successes}
              onClick={() => skipHold()}
              footer="Click or press Space to continue"
            />
          </div>
        </Html>
      )}
    </>
  )
}
