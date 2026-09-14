// Small floating name + wounds tag over each on-board unit — the board otherwise has no way to tell
// units apart or see how hurt they are at a glance beyond opening the unit card for one at a time.
import { Html } from '@react-three/drei'
import { useGameStore } from '../store/game'
import { colors, fontStack } from '../ui/theme'

const labelStyle = {
  fontFamily: fontStack,
  fontSize: 12,
  fontWeight: 700 as const,
  textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)',
  whiteSpace: 'nowrap' as const,
  transform: 'translateY(-100%)',
}

export function UnitLabels() {
  const state = useGameStore((s) => s.state)
  if (!state) return null
  const units = Object.values(state.units).filter((u) => u.location === 'board')

  return (
    <>
      {units.map((unit) => {
        const models = unit.models.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
        if (models.length === 0) return null
        const cx = models.reduce((sum, m) => sum + m.pos.x, 0) / models.length
        const cz = models.reduce((sum, m) => sum + m.pos.z, 0) / models.length
        const topY = Math.max(...models.map((m) => m.pos.y + m.height)) + 0.25
        const wounds = models.reduce((sum, m) => sum + m.woundsRemaining, 0)
        const color = unit.player === 'A' ? colors.playerA : colors.playerB
        return (
          <Html key={unit.id} position={[cx, topY, cz]} center distanceFactor={18} style={{ pointerEvents: 'none' }} occlude={false}>
            <div style={{ ...labelStyle, color }}>
              {unit.name} · {wounds}W
            </div>
          </Html>
        )
      })}
    </>
  )
}
