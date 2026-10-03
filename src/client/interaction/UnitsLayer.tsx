// One <Figure> per live model, wired to the click behaviour the current PendingDecision calls for
// (activate/select a friendly unit, target an enemy unit) via decisions.ts; clicking a unit that
// isn't a legal click for this decision just selects it for the unit card (src/client/ui/UnitCard.tsx).
//
// Shoot/melee/hit action cues and the brief "turn to face the target" facing override come from
// src/client/presentation's cue store (set by the presentation director as it plays engine events);
// the walk cycle itself needs no cue at all — Figure infers it from `position` motion on its own, so
// passing the model's real position (instead of pre-easing it in a wrapper) is all that's needed.
import { memo, useCallback, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { Figure, type FigureAction } from '../figures'
import { requestFrame } from '../figures/anim'
import { SelectionRing, TargetRing, LosMarker } from '../board'
import { colors } from '../ui/theme'
import { useGameStore } from '../store/game'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore } from '../ui/uiStore'
import { useCueStore } from '../presentation'
import { clickableUnitIds, unitClickAction } from './decisions'
import { losStatusByUnit } from './lineOfSight'

const POSITION_EASE_PER_SEC = 10
// Below this remaining distance (world-inches), an eased move counts as "arrived" — matches
// figures/Figure.tsx's own MOVE_EPS so a caller-driven `moving` flag agrees with what Figure would
// have inferred itself, for the (rare) figure that isn't wrapped by this component.
const MOVE_EPS = 0.01
const LOCAL_ORIGIN = { x: 0, z: 0 }

/** Wraps one model's Figure (+ rings) in a group that eases toward `position` every frame — the
 *  only thing that makes a move/pile-in/consolidate visually register — and tracks whether it's
 *  still mid-ease so Figure can play its walk cycle for exactly as long as the model is travelling.
 *  Does no per-frame work (and requests no frames) once arrived. */
function ModelFigure({ x, y, z, children }: { x: number; y: number; z: number; children: (moving: boolean) => ReactNode }) {
  const ref = useRef<Group>(null!)
  const initialized = useRef(false)
  const [moving, setMoving] = useState(false)
  const movingRef = useRef(false)

  useFrame((state, delta) => {
    const g = ref.current
    if (!g) return
    if (!initialized.current) {
      g.position.set(x, y, z)
      initialized.current = true
      requestFrame(state)
      return
    }
    if (g.position.x === x && g.position.y === y && g.position.z === z) return // arrived — idle
    const t = Math.min(1, delta * POSITION_EASE_PER_SEC)
    g.position.x += (x - g.position.x) * t
    g.position.y += (y - g.position.y) * t
    g.position.z += (z - g.position.z) * t

    const dx = x - g.position.x
    const dy = y - g.position.y
    const dz = z - g.position.z
    const stillMoving = dx * dx + dy * dy + dz * dz > MOVE_EPS * MOVE_EPS
    if (!stillMoving) g.position.set(x, y, z)
    if (stillMoving !== movingRef.current) {
      movingRef.current = stillMoving
      setMoving(stillMoving)
    }
    requestFrame(state)
  })

  return <group ref={ref}>{children(moving)}</group>
}

interface UnitModelProps {
  unitId: string
  datasheetId: string
  modelType: string
  faction: string
  x: number
  y: number
  z: number
  rotationY: number
  baseRadius: number
  action: FigureAction | undefined
  isSelected: boolean
  isClickable: boolean
  isHovered: boolean
  isHoveredModel: boolean
  los: ComponentProps<typeof LosMarker>['status'] | undefined
}

/** One model. Memoised on primitives so an unrelated store change re-renders no figures; the click
 *  handler reads live store state instead of closing over a per-render pending/legal/dispatch. */
const UnitModel = memo(function UnitModel(p: UnitModelProps) {
  const { unitId, isSelected, isClickable } = p
  const onClick = useCallback(
    (e: { stopPropagation(): void }) => {
      e.stopPropagation()
      const { pending, legal, dispatch } = useGameStore.getState()
      if (isClickable && pending) {
        const action = unitClickAction(pending, legal, unitId)
        if (action) {
          dispatch(action)
          return
        }
      }
      useUiStore.getState().selectUnit(isSelected ? null : unitId)
    },
    [unitId, isSelected, isClickable],
  )
  return (
    <ModelFigure x={p.x} y={p.y} z={p.z}>
      {(moving) => (
        <>
          <Figure
            datasheetId={p.datasheetId}
            modelId={p.modelType}
            faction={p.faction}
            rotationY={p.rotationY}
            moving={moving}
            action={p.action}
            selected={p.isSelected}
            highlighted={p.isClickable || p.isHoveredModel}
            onClick={onClick}
          />
          {p.isSelected && <SelectionRing pos={LOCAL_ORIGIN} baseRadius={p.baseRadius} />}
          {p.isClickable && <TargetRing pos={LOCAL_ORIGIN} baseRadius={p.baseRadius} />}
          {p.isHoveredModel && <SelectionRing pos={LOCAL_ORIGIN} baseRadius={p.baseRadius * 1.15} color={colors.accent} />}
          {p.isHovered && !p.isHoveredModel && !p.isSelected && !p.isClickable && <SelectionRing pos={LOCAL_ORIGIN} baseRadius={p.baseRadius} color={colors.accent} />}
          {p.los && <LosMarker pos={LOCAL_ORIGIN} baseRadius={p.baseRadius} status={p.los} />}
        </>
      )}
    </ModelFigure>
  )
})

export function UnitsLayer() {
  const state = useDisplayState()
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const selectUnit = useUiStore((s) => s.selectUnit)
  const hoveredUnitId = useUiStore((s) => s.hoveredUnitId)
  // Single-model hover: an allocateAttack prompt names one model of a unit, and lighting up the
  // whole unit wouldn't answer "which figure is this button?" (owner playtest).
  const hoveredModelId = useUiStore((s) => s.hoveredModelId)
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

        return (
          <group key={unit.id}>
            {unit.models.map((modelId) => {
              const m = state.models[modelId]
              if (!m) return null
              const action = modelAction[modelId] ?? unitAction[unit.id]
              const rotationY = modelFacing[modelId] ?? m.facing
              const isHoveredModel = modelId === hoveredModelId
              return (
                <UnitModel
                  key={modelId}
                  unitId={unit.id}
                  datasheetId={unit.datasheetId}
                  modelType={m.datasheetModelId}
                  faction={faction}
                  x={m.pos.x}
                  y={m.pos.y}
                  z={m.pos.z}
                  rotationY={rotationY}
                  baseRadius={m.base.radius}
                  action={action}
                  isSelected={isSelected}
                  isClickable={isClickable}
                  isHovered={isHovered}
                  isHoveredModel={isHoveredModel}
                  los={losOn ? losStatus[unit.id] : undefined}
                />
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
