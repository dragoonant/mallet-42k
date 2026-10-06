// Small floating name + wounds tag over each on-board unit — the board otherwise has no way to tell
// units apart or see how hurt they are at a glance beyond opening the unit card for one at a time.
import { Html } from '@react-three/drei'
import { useDisplayState } from '../presentation/presentedStore'
import { colors, fontStack } from '../ui/theme'

const SHOCK_COLOR = '#ffb84f'

const labelStyle = {
  fontFamily: fontStack,
  fontSize: 12,
  fontWeight: 700 as const,
  textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)',
  whiteSpace: 'nowrap' as const,
}

// Battle-shocked marker: a pulsing lightning bolt floating over the unit's name tag.
function ShockBolt({ unitId }: { unitId: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }} data-testid={`shock-bolt-${unitId}`}>
      <style>{'@keyframes m42k-shock-pulse { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.6; transform: scale(0.88) } }'}</style>
      <svg width={34} height={43} viewBox="0 0 22 28" style={{ animation: 'm42k-shock-pulse 1.2s ease-in-out infinite', filter: `drop-shadow(0 0 6px ${SHOCK_COLOR}) drop-shadow(0 1px 2px rgba(0,0,0,0.9))` }}>
        <path d="M13 1 L3 16 H10 L8 27 L19 10 H12 L13 1 Z" fill="#ffd23f" stroke="#7a3d00" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function UnitLabels() {
  const state = useDisplayState()
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
        const color = unit.battleShocked ? SHOCK_COLOR : unit.player === 'A' ? colors.playerA : colors.playerB
        return (
          <Html key={unit.id} position={[cx, topY, cz]} center distanceFactor={18} style={{ pointerEvents: 'none' }} occlude={false}>
            <div style={{ transform: 'translateY(-100%)' }}>
              {unit.battleShocked && <ShockBolt unitId={unit.id} />}
              <div style={{ ...labelStyle, color }} data-testid={`unit-label-${unit.id}`}>
                {unit.name} · {wounds} {wounds === 1 ? 'wound' : 'wounds'}{unit.battleShocked ? ' · Shocked' : ''}
              </div>
            </div>
          </Html>
        )
      })}
    </>
  )
}
