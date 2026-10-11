// "In cover" / "Partial cover" badge over units that would currently get Benefit of Cover. Cover depends on the
// attacker, so: with a friendly unit selected during the active player's Shooting phase, enemy units that
// would get cover against it (LosService.benefitOfCover, first ranged weapon) are flagged; otherwise any
// unit partly within a ruin footprint is flagged (area-terrain cover). Computed per state/selection change.
import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { DEFAULT_SERVICES, type GameState, type UnitId } from '@/engine'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore, type PlacementDraft } from '../ui/uiStore'
import { fontStack } from '../ui/theme'

type CoverKind = 'full' | 'partial'

function firstRanged(state: GameState, unitId: UnitId) {
  const u = state.units[unitId]
  if (!u) return null
  for (const id of u.models) {
    const w = state.models[id]?.weapons.map((wid) => state.weapons[wid]).find((x) => x && x.kind === 'ranged')
    if (w) return w
  }
  return null
}

function coveredVs(state: GameState, unitId: UnitId, attackerId: UnitId, weapon: NonNullable<ReturnType<typeof firstRanged>>): boolean {
  try {
    return state.units[unitId]!.models.some((id) => state.models[id] && DEFAULT_SERVICES.los.benefitOfCover(state, id, attackerId, weapon))
  } catch { return false }
}

function canSee(state: GameState, attackerId: UnitId, targetId: UnitId): boolean {
  try {
    return state.units[attackerId]!.models.some((id) => state.models[id] && DEFAULT_SERVICES.los.unitVisible(state, id, targetId))
  } catch { return false }
}

function withDraft(state: GameState, draft: PlacementDraft | null, unitId: string | null): GameState {
  if (!draft || !unitId || draft.unitId !== unitId || !state.units[unitId]) return state
  const models = { ...state.models }
  for (const p of draft.placements) {
    const m = models[p.modelId]
    if (m) models[p.modelId] = { ...m, pos: { ...m.pos, ...p.pos } }
  }
  return { ...state, models }
}

function coverUnits(base: GameState, selectedUnitId: string | null, draft: PlacementDraft | null): Map<UnitId, CoverKind> {
  const out = new Map<UnitId, CoverKind>()
  const state = withDraft(base, draft, selectedUnitId)
  const selected = selectedUnitId ? state.units[selectedUnitId] : undefined
  const shooting = state.phase === 'shooting' && selected && selected.location === 'board' && selected.player === state.activePlayer
  if (shooting && selected) {
    const weapon = firstRanged(state, selected.id)
    if (weapon) {
      for (const unit of Object.values(state.units)) {
        if (unit.location !== 'board' || unit.player === selected.player) continue
        if (coveredVs(state, unit.id, selected.id, weapon)) out.set(unit.id, 'full')
      }
      return out
    }
  }
  const onBoard = Object.values(state.units).filter((u) => u.location === 'board')
  for (const unit of onBoard) {
    let seen = 0
    let covered = 0
    for (const enemy of onBoard) {
      if (enemy.player === unit.player) continue
      const weapon = firstRanged(state, enemy.id)
      if (!weapon || !canSee(state, enemy.id, unit.id)) continue
      seen++
      if (coveredVs(state, unit.id, enemy.id, weapon)) covered++
    }
    if (seen > 0 && covered > 0) out.set(unit.id, covered === seen ? 'full' : 'partial')
  }
  return out
}

export function CoverBadges() {
  const state = useDisplayState()
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const draft = useUiStore((s) => s.draft)
  const ids = useMemo(() => (state ? coverUnits(state, selectedUnitId, draft) : new Map<UnitId, CoverKind>()), [state, selectedUnitId, draft])
  if (!state) return null
  return (
    <>
      {[...ids].map(([id, kind]) => {
        const unit = state.units[id]
        const live = draft && draft.unitId === id && selectedUnitId === id
        const models = unit?.models.map((mid) => (live ? withDraft(state, draft, id) : state).models[mid]).filter((m): m is NonNullable<typeof m> => !!m) ?? []
        if (models.length === 0) return null
        const cx = models.reduce((s, m) => s + m.pos.x, 0) / models.length
        const cz = models.reduce((s, m) => s + m.pos.z, 0) / models.length
        const topY = Math.max(...models.map((m) => m.pos.y + m.height)) + 0.25
        const partial = kind === 'partial'
        return (
          <Html key={id} zIndexRange={[5, 0]} position={[cx, topY, cz]} center distanceFactor={18} style={{ pointerEvents: 'none' }} occlude={false}>
            <div
              data-testid={`cover-badge-${id}`}
              data-cover={kind}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: fontStack, fontSize: 24, fontWeight: 800, color: partial ? '#ffe3a8' : '#bfe8ff', background: 'rgba(14,30,48,0.88)', border: `2px solid ${partial ? 'rgba(255,184,79,0.8)' : 'rgba(120,200,255,0.7)'}`, borderRadius: 18, padding: '2px 14px 2px 8px', whiteSpace: 'nowrap', transform: `translateY(calc(-100% - ${unit?.battleShocked ? 64 : 22}px))` }}
            >
              <svg width={24} height={27} viewBox="0 0 12 14"><path d="M6 1 L11 3 V7 C11 10 8.5 12.2 6 13 C3.5 12.2 1 10 1 7 V3 Z" fill={partial ? '#ffb84f' : '#5fb4ff'} stroke="#e8f6ff" strokeWidth={1} /></svg>
              {partial ? 'Partial cover' : 'In cover'}
            </div>
          </Html>
        )
      })}
    </>
  )
}
