// One <Figure> per live model, wired to the click behaviour the current PendingDecision calls for
// (activate/select a friendly unit, target an enemy unit) via decisions.ts; clicking a unit that
// isn't a legal click for this decision just selects it for the unit card (src/client/ui/UnitCard.tsx).
import { Figure } from '../figures'
import { SelectionRing, TargetRing } from '../board'
import { useGameStore } from '../store/game'
import { useUiStore } from '../ui/uiStore'
import { clickableUnitIds, unitClickAction } from './decisions'

export function UnitsLayer() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const selectUnit = useUiStore((s) => s.selectUnit)

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
                <group key={modelId}>
                  <Figure
                    datasheetId={unit.datasheetId}
                    faction={faction}
                    position={[m.pos.x, m.pos.y, m.pos.z]}
                    rotationY={m.facing}
                    selected={isSelected}
                    highlighted={isClickable}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleClick()
                    }}
                  />
                  {isSelected && <SelectionRing pos={{ x: m.pos.x, z: m.pos.z }} baseRadius={m.base.radius} />}
                  {isClickable && <TargetRing pos={{ x: m.pos.x, z: m.pos.z }} baseRadius={m.base.radius} />}
                </group>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
