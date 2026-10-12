// "In cover" / "Partial cover" badge over units that would currently get Benefit of Cover. Cover depends on the
// attacker, so: with a friendly unit selected during the active player's Shooting phase, enemy units that
// would get cover against it (LosService.benefitOfCover, first ranged weapon) are flagged; otherwise any
// unit partly within a ruin footprint is flagged (area-terrain cover). Computed per state/selection change.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3 } from 'three'
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

// On-screen width the badge targets: BADGE_PX at the default overview distance, growing as the camera zooms in and
// shrinking as it zooms out, but always clamped to [BADGE_MIN_PX, BADGE_MAX_PX] so it never balloons when zoomed in.
const BADGE_PX = 110
const BADGE_MIN_PX = 70
const BADGE_MAX_PX = 140
const BADGE_REF_DISTANCE = 36

function CoverBadge({ id, kind, position, shocked }: { id: UnitId; kind: CoverKind; position: [number, number, number]; shocked: boolean }) {
  const badge = useRef<HTMLDivElement>(null)
  const camera = useThree((s) => s.camera)
  const anchor = useMemo(() => new Vector3(), [])
  const partial = kind === 'partial'
  useFrame(() => {
    const el = badge.current
    if (!el) return
    const natural = el.offsetWidth // layout width, unaffected by the transform below
    if (natural <= 0) return
    const dist = Math.max(camera.position.distanceTo(anchor.set(...position)), 0.1)
    const px = Math.min(BADGE_MAX_PX, Math.max(BADGE_MIN_PX, (BADGE_PX * BADGE_REF_DISTANCE) / dist))
    const scale = `scale(${(px / natural).toFixed(3)})`
    if (el.style.transform !== scale) el.style.transform = scale
  })
  return (
    <Html zIndexRange={[5, 0]} position={position} center style={{ pointerEvents: 'none' }} occlude={false}>
      {/* The outer box keeps natural size and sits above the unit label; the inner badge scales about its bottom centre. */}
      <div style={{ transform: `translateY(calc(-100% - ${shocked ? 64 : 22}px))` }}>
        <div
          ref={badge}
          data-testid={`cover-badge-${id}`}
          data-cover={kind}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: fontStack, fontSize: 24, fontWeight: 800, color: partial ? '#ffe3a8' : '#bfe8ff', background: 'rgba(14,30,48,0.88)', border: `2px solid ${partial ? 'rgba(255,184,79,0.8)' : 'rgba(120,200,255,0.7)'}`, borderRadius: 18, padding: '2px 14px 2px 8px', whiteSpace: 'nowrap', transformOrigin: '50% 100%' }}
        >
          <svg width={24} height={27} viewBox="0 0 12 14"><path d="M6 1 L11 3 V7 C11 10 8.5 12.2 6 13 C3.5 12.2 1 10 1 7 V3 Z" fill={partial ? '#ffb84f' : '#5fb4ff'} stroke="#e8f6ff" strokeWidth={1} /></svg>
          {partial ? 'Partial cover' : 'In cover'}
        </div>
      </div>
    </Html>
  )
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
        return <CoverBadge key={id} id={id} kind={kind} position={[cx, topY, cz]} shocked={!!unit?.battleShocked} />
      })}
    </>
  )
}
