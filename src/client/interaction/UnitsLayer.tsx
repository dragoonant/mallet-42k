// One <Figure> per live model, wired to the click behaviour the current PendingDecision calls for
// (activate/select a friendly unit, target an enemy unit) via decisions.ts; clicking a unit that
// isn't a legal click for this decision just selects it for the unit card (src/client/ui/UnitCard.tsx).
//
// Shoot/melee/hit action cues and the brief "turn to face the target" facing override come from
// src/client/presentation's cue store (set by the presentation director as it plays engine events);
// the walk cycle itself needs no cue at all — Figure infers it from `position` motion on its own, so
// passing the model's real position (instead of pre-easing it in a wrapper) is all that's needed.
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { Figure } from '../figures'
import { SelectionRing, TargetRing, LosMarker } from '../board'
import { colors } from '../ui/theme'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { useCueStore } from '../presentation'
import { clickableUnitIds, unitClickAction } from './decisions'
import { losStatusByUnit } from './lineOfSight'

const POSITION_EASE_PER_SEC = 10
// Below this remaining distance (world-inches), an eased move counts as "arrived" — matches
// figures/Figure.tsx's own MOVE_EPS so a caller-driven `moving` flag agrees with what Figure would
// have inferred itself, for the (rare) figure that isn't wrapped by this component.
const MOVE_EPS = 0.01

/** Wraps one model's Figure (+ rings) in a group that eases toward `position` every frame — the
 *  only thing that makes a move/pile-in/consolidate visually register — and tracks whether it's
 *  still mid-ease so Figure can play its walk cycle for exactly as long as the model is travelling. */
function ModelFigure({
  position,
  children,
}: {
  position: readonly [number, number, number]
  children: (moving: boolean) => ReactNode
}) {
  const ref = useRef<Group>(null!)
  const initialized = useRef(false)
  const [moving, setMoving] = useState(false)
  const movingRef = useRef(false)

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

    const dx = position[0] - g.position.x
    const dy = position[1] - g.position.y
    const dz = position[2] - g.position.z
    const stillMoving = dx * dx + dy * dy + dz * dz > MOVE_EPS * MOVE_EPS
    if (stillMoving !== movingRef.current) {
      movingRef.current = stillMoving
      setMoving(stillMoving)
    }
  })

  return <group ref={ref}>{children(moving)}</group>
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
  const unitAction = useCueStore((s) => s.unitAction)
  const modelAction = useCueStore((s) => s.modelAction)
  const modelFacing = useCueStore((s) => s.modelFacing)

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
              const action = modelAction[modelId] ?? unitAction[unit.id]
              const rotationY = modelFacing[modelId] ?? m.facing
              return (
                <ModelFigure key={modelId} position={[m.pos.x, m.pos.y, m.pos.z]}>
                  {(moving) => (
                    <>
                      <Figure
                        datasheetId={unit.datasheetId}
                        faction={faction}
                        rotationY={rotationY}
                        moving={moving}
                        action={action}
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
                    </>
                  )}
                </ModelFigure>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
