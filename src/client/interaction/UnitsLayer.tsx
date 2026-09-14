// One <Figure> per live model, wired to the click behaviour the current PendingDecision calls for
// (activate/select a friendly unit, target an enemy unit) via decisions.ts; clicking a unit that
// isn't a legal click for this decision just selects it for the unit card (src/client/ui/UnitCard.tsx).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { Figure } from '../figures'
import type { Pose } from '../figures'
import { SelectionRing, TargetRing, LosMarker } from '../board'
import { colors } from '../ui/theme'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { clickableUnitIds, unitClickAction } from './decisions'
import { losStatusByUnit } from './lineOfSight'

// How long a unit keeps its shoot/melee pose after an AttackSequenceStarted event names it, before
// easing back to idle.
const ATTACK_POSE_MS = 700
const POSITION_EASE_PER_SEC = 10

/** Wraps a model's Figure (+ rings) in a group that eases toward `position` each frame instead of
 *  snapping there — the only thing that made a move/pile-in/consolidate visually register before. */
function EasedGroup({ position, children }: { position: readonly [number, number, number]; children: ReactNode }) {
  const ref = useRef<Group>(null!)
  const initialized = useRef(false)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    if (!initialized.current) {
      g.position.set(position[0], position[1], position[2])
      initialized.current = true
      return
    }
    const t = Math.min(1, delta * POSITION_EASE_PER_SEC)
    g.position.x += (position[0] - g.position.x) * t
    g.position.y += (position[1] - g.position.y) * t
    g.position.z += (position[2] - g.position.z) * t
  })
  return <group ref={ref}>{children}</group>
}

/** Tracks which units should currently render a shoot/melee pose, derived from the latest batch of
 *  AttackSequenceStarted events rather than any live/transient engine state (a whole attack
 *  sequence resolves within a single step(), so by the time the client sees the result it's already
 *  over — the event log is the only record that anything happened at all). */
function useAttackPoses(): Record<string, Pose> {
  const events = useGameStore((s) => s.events)
  const [poses, setPoses] = useState<Record<string, Pose>>({})
  // seq (not array length/index) survives the log's own [-EVENT_LOG_LIMIT:] trimming once a long
  // game fills it — an index-based "since last render" cursor would silently stop seeing new events
  // the moment the buffer starts dropping its oldest entries.
  const lastSeenSeq = useRef(-1)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (events.length === 0) return
    const latestSeq = events[events.length - 1].seq
    if (latestSeq < lastSeenSeq.current) {
      // a lower seq than we've already seen means a new game started under us
      lastSeenSeq.current = -1
      setPoses({})
    }
    const fresh = events.filter((e) => e.seq > lastSeenSeq.current)
    lastSeenSeq.current = latestSeq
    for (const e of fresh) {
      if (e.type !== 'AttackSequenceStarted') continue
      const pose: Pose = e.kind === 'melee' ? 'melee' : 'shoot'
      setPoses((prev) => ({ ...prev, [e.unitId]: pose }))
      clearTimeout(timers.current[e.unitId])
      timers.current[e.unitId] = setTimeout(() => {
        setPoses((prev) => {
          if (prev[e.unitId] !== pose) return prev
          const next = { ...prev }
          delete next[e.unitId]
          return next
        })
      }, ATTACK_POSE_MS)
    }
  }, [events])

  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach(clearTimeout)
  }, [])

  return poses
}

export function UnitsLayer() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const selectUnit = useUiStore((s) => s.selectUnit)
  const hoveredUnitId = useUiStore((s) => s.hoveredUnitId)
  const losOn = useUiStore((s) => s.losOn)
  const attackPoses = useAttackPoses()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const losStatus = useMemo(
    () => (losOn && selectedUnitId && state ? losStatusByUnit(state, selectedUnitId) : {}),
    [losOn, selectedUnitId, state],
  )

  if (!state) return null

  const interactive = !!pending && pending.player !== botSeat
  const clickable = pending ? clickableUnitIds(pending) : new Set<string>()
  const units = Object.values(state.units).filter((u) => u.location === 'board')

  return (
    <group>
      {units.map((unit) => {
        const faction = state.players[unit.player].faction
        const isSelected = unit.id === selectedUnitId
        const isClickable = interactive && clickable.has(unit.id)
        const isHovered = unit.id === hoveredUnitId
        const pose = attackPoses[unit.id] ?? 'idle'

        const handleClick = () => {
          if (isClickable && pending) {
            const action = unitClickAction(pending, legal, unit.id)
            if (action) {
              dispatch(action)
              return
            }
          }
          selectUnit(isSelected ? null : unit.id)
        }

        return (
          <group key={unit.id}>
            {unit.models.map((modelId) => {
              const m = state.models[modelId]
              if (!m) return null
              return (
                <EasedGroup key={modelId} position={[m.pos.x, m.pos.y, m.pos.z]}>
                  <Figure
                    datasheetId={unit.datasheetId}
                    faction={faction}
                    pose={pose}
                    rotationY={m.facing}
                    selected={isSelected}
                    highlighted={isClickable}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleClick()
                    }}
                  />
                  {isSelected && <SelectionRing pos={{ x: 0, z: 0 }} baseRadius={m.base.radius} />}
                  {isClickable && <TargetRing pos={{ x: 0, z: 0 }} baseRadius={m.base.radius} />}
                  {isHovered && !isSelected && !isClickable && <SelectionRing pos={{ x: 0, z: 0 }} baseRadius={m.base.radius} color={colors.accent} />}
                  {losOn && losStatus[unit.id] && <LosMarker pos={{ x: 0, z: 0 }} baseRadius={m.base.radius} status={losStatus[unit.id]} />}
                </EasedGroup>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
