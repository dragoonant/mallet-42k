// Small "In cover" badge over units that would currently get Benefit of Cover. Cover depends on the
// attacker, so: with a friendly unit selected during the active player's Shooting phase, enemy units that
// would get cover against it (LosService.benefitOfCover, first ranged weapon) are flagged; otherwise any
// unit partly within a ruin footprint is flagged (area-terrain cover). Computed per state/selection change.
import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { DEFAULT_SERVICES, partlyWithinPolygon, type GameState, type UnitId } from '@/engine'
import type { TerrainPieceData } from '@/data/types'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore } from '../ui/uiStore'
import { fontStack } from '../ui/theme'

function coverUnitIds(state: GameState, selectedUnitId: string | null): Set<UnitId> {
  const out = new Set<UnitId>()
  const selected = selectedUnitId ? state.units[selectedUnitId] : undefined
  const shooting = state.phase === 'shooting' && selected && selected.location === 'board' && selected.player === state.activePlayer
  if (shooting && selected) {
    let weapon = null
    for (const id of selected.models) {
      const m = state.models[id]
      const w = m?.weapons.map((wid) => state.weapons[wid]).find((x) => x && x.kind === 'ranged')
      if (w) { weapon = w; break }
    }
    if (weapon) {
      for (const unit of Object.values(state.units)) {
        if (unit.location !== 'board' || unit.player === selected.player) continue
        try {
          if (unit.models.some((id) => state.models[id] && DEFAULT_SERVICES.los.benefitOfCover(state, id, selected.id, weapon))) out.add(unit.id)
        } catch { /* ignore */ }
      }
      return out
    }
  }
  const ruins = (Object.values(state.board.pieces) as TerrainPieceData[]).filter((p) => p.kind === 'ruin')
  if (ruins.length === 0) return out
  for (const unit of Object.values(state.units)) {
    if (unit.location !== 'board') continue
    const inRuin = unit.models.some((id) => {
      const m = state.models[id]
      return !!m && ruins.some((p) => partlyWithinPolygon(m as never, p.footprint as never))
    })
    if (inRuin) out.add(unit.id)
  }
  return out
}

export function CoverBadges() {
  const state = useDisplayState()
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const ids = useMemo(() => (state ? coverUnitIds(state, selectedUnitId) : new Set<UnitId>()), [state, selectedUnitId])
  if (!state) return null
  return (
    <>
      {[...ids].map((id) => {
        const unit = state.units[id]
        const models = unit?.models.map((mid) => state.models[mid]).filter((m): m is NonNullable<typeof m> => !!m) ?? []
        if (models.length === 0) return null
        const cx = models.reduce((s, m) => s + m.pos.x, 0) / models.length
        const cz = models.reduce((s, m) => s + m.pos.z, 0) / models.length
        const topY = Math.max(...models.map((m) => m.pos.y + m.height)) + 1.0
        return (
          <Html key={id} position={[cx, topY, cz]} center distanceFactor={18} style={{ pointerEvents: 'none' }} occlude={false}>
            <div
              data-testid={`cover-badge-${id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: fontStack, fontSize: 11, fontWeight: 700, color: '#bfe8ff', background: 'rgba(14,30,48,0.82)', border: '1px solid rgba(120,200,255,0.6)', borderRadius: 10, padding: '1px 7px 1px 4px', whiteSpace: 'nowrap', transform: 'translateY(-100%)' }}
            >
              <svg width={12} height={13} viewBox="0 0 12 14"><path d="M6 1 L11 3 V7 C11 10 8.5 12.2 6 13 C3.5 12.2 1 10 1 7 V3 Z" fill="#5fb4ff" stroke="#e8f6ff" strokeWidth={1} /></svg>
              In cover
            </div>
          </Html>
        )
      })}
    </>
  )
}
