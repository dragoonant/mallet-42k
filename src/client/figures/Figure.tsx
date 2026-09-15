// Public entry point: one datasheet's SD figure, procedurally built and posed. Rendering-only —
// the engine never imports this and never sees anything drawn here, only the Model.base/height
// numbers this reads from src/data (docs/spec/30-figures.md, top of file). See index.ts for the
// full per-model API contract this exposes to the wiring layer.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { resolveBase, resolveFigureKit, resolvePaintColors, useDataBundle } from './data'
import { BODY_KIND, BIPED_CONFIG, VEHICLE_CONFIG } from './kitConfigs'
import { BaseDisc, BASE_THICKNESS } from './BaseDisc'
import { BipedBody } from './BipedBody'
import { VehicleBody } from './VehicleBody'
import type { Pose, FigureAction, FigureActionKind } from './types'

const POSITION_EASE_PER_SEC = 10
const YAW_EASE_PER_SEC = 8
// Below this remaining distance (world-inches), an eased move counts as "arrived" for walk-cycle
// purposes even though the ease-toward-target math never technically reaches zero.
const MOVE_EPS = 0.01

// One-shot action durations (ms), how long each pose displays before Figure reverts to idle/walk
// on its own. 'death' is terminal — it has no entry and is simply never timed out.
const ACTION_MS: Record<Exclude<FigureActionKind, 'death'>, number> = { shoot: 700, melee: 700, hit: 300 }

export interface FigureProps {
  /** Datasheet id from the data bundle, e.g. "sm.terminator-squad". Unknown ids still render —
   *  see resolveFigureKit's fallback. */
  datasheetId: string
  /** Faction id, e.g. "sm" | "ork" — resolves the paintScheme. Unknown ids paint neutral grey. */
  faction: string
  /** Target world position. Figure eases its own group toward it every frame (snapping only on
   *  first mount, so placing a figure never makes it slide in from the origin) instead of
   *  requiring a wrapper — a caller that already eases position itself (e.g. wrapping Figure in
   *  its own per-frame lerp) can keep doing that too; easing a already-settled target is a no-op. */
  position?: readonly [number, number, number]
  /** Desired facing, radians. Eased with a turn-speed limit rather than snapped — drive it with
   *  the direction of travel while `moving`, then with the bearing to a target once an `action`
   *  starts, and the figure turns to face it instead of popping. */
  rotationY?: number
  /** Explicit walk-cycle override. Omit to let Figure infer it from `position` motion (distance
   *  to target above ~0.01in counts as moving) — pass it explicitly only when a caller wants the
   *  walk cycle to track something other than raw position (e.g. "still mid-move" from engine
   *  state even while eased position has already visually caught up). */
  moving?: boolean
  /** One-shot combat/death cue layered over the idle/walk base pose — shoot recoil, melee lunge
   *  + swing, hit flinch, death topple/fade/sink. See FigureAction (types.ts) for the `t0`
   *  contract. Clearing `action` (passing undefined) reverts to idle/walk on the next render;
   *  'death' never reverts on its own. */
  action?: FigureAction
  /** Escape hatch: forces this exact pose and ignores action/moving inference entirely. Used by
   *  the figure gallery and death-ghost callers, which already know precisely which static pose
   *  they want and have no ongoing action/movement to report. */
  pose?: Pose
  selected?: boolean
  highlighted?: boolean
  onClick?: (event: ThreeEvent<MouseEvent>) => void
}

export function Figure({
  datasheetId,
  faction,
  position = [0, 0, 0],
  rotationY = 0,
  moving,
  action,
  pose: poseOverride,
  selected,
  highlighted,
  onClick,
}: FigureProps) {
  const bundle = useDataBundle()
  const seedRef = useRef(Math.random() * 100)
  const groupRef = useRef<Group>(null!)
  const easedPos = useRef({ x: position[0], y: position[1], z: position[2] })
  const easedYaw = useRef(rotationY)
  const initialized = useRef(false)
  const [autoMoving, setAutoMoving] = useState(false)

  // Tracks one-shot actions: a change in `action.t0` (any type, compared by !==) restarts the
  // window; the window itself is timed off Figure's own clock via setTimeout, never off t0.
  const [actionExpired, setActionExpired] = useState(false)
  const actionToken = useRef<FigureAction['t0'] | undefined>(undefined)
  useEffect(() => {
    if (!action || action.t0 === actionToken.current) return
    actionToken.current = action.t0
    setActionExpired(false)
    if (action.kind === 'death') return // terminal — no reversion timer
    const timer = setTimeout(() => setActionExpired(true), ACTION_MS[action.kind])
    return () => clearTimeout(timer)
  }, [action])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    if (!initialized.current) {
      g.position.set(position[0], position[1], position[2])
      g.rotation.y = rotationY
      easedPos.current.x = position[0]
      easedPos.current.y = position[1]
      easedPos.current.z = position[2]
      easedYaw.current = rotationY
      initialized.current = true
      return
    }

    const p = easedPos.current
    const posT = Math.min(1, delta * POSITION_EASE_PER_SEC)
    p.x += (position[0] - p.x) * posT
    p.y += (position[1] - p.y) * posT
    p.z += (position[2] - p.z) * posT
    g.position.set(p.x, p.y, p.z)

    // Shortest-path yaw ease so a figure never spins the long way round to face a new target.
    let diff = rotationY - easedYaw.current
    diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
    easedYaw.current += diff * Math.min(1, delta * YAW_EASE_PER_SEC)
    g.rotation.y = easedYaw.current

    if (moving === undefined) {
      const dx = position[0] - p.x
      const dy = position[1] - p.y
      const dz = position[2] - p.z
      const stillMoving = dx * dx + dy * dy + dz * dz > MOVE_EPS * MOVE_EPS
      if (stillMoving !== autoMoving) setAutoMoving(stillMoving)
    }
  })

  const datasheet = bundle?.datasheets[datasheetId]
  const factionData = bundle?.factions[faction]

  const { archetype, kit } = useMemo(() => resolveFigureKit(datasheetId, datasheet), [datasheetId, datasheet])
  const base = useMemo(() => resolveBase(datasheet, archetype), [datasheet, archetype])
  const colors = useMemo(() => resolvePaintColors(factionData), [factionData])

  const bodyKind = BODY_KIND[kit]
  const isMoving = moving ?? autoMoving
  const actionPose = action && !actionExpired ? action.kind : null
  const pose: Pose = poseOverride ?? actionPose ?? (isMoving ? 'walk' : 'idle')

  return (
    <group ref={groupRef} onClick={onClick}>
      <BaseDisc radiusX={base.radiusX} radiusZ={base.radiusZ} colors={colors} selected={selected} highlighted={highlighted} />
      <group position={[0, BASE_THICKNESS, 0]} scale={[base.height, base.height, base.height]}>
        {bodyKind === 'vehicle' ? (
          <VehicleBody config={VEHICLE_CONFIG[kit] ?? { weapon: 'none', hasRotor: false }} colors={colors} pose={pose} seed={seedRef.current} />
        ) : (
          <BipedBody
            config={
              BIPED_CONFIG[kit] ?? {
                headShape: 'generic-head',
                rightWeapon: 'none',
                leftWeapon: 'none',
                bulk: 1,
                hasBackpack: false,
                shoulderPads: 'none',
                hasCape: false,
                skin: 'none',
              }
            }
            colors={colors}
            pose={pose}
            seed={seedRef.current}
          />
        )}
      </group>
    </group>
  )
}
