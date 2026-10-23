// One row of status icons per on-board unit, floating above its name tag: a cover shield (blue full / amber partial),
// the battle-shock bolt, temporary effects (stratagems, buffs, auras) and Advanced / Fell Back / Charged flags.
// Cover is per model and depends on the attacker: with a friendly unit selected during the active Shooting phase,
// enemy models that would get cover against all its ranged weapons are marked; otherwise every enemy that can see
// (and reach) a unit is checked against all its ranged weapons. Covered models also get a small blue ring on the board.
import { useMemo, useRef, type ReactElement } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { DoubleSide, Vector3, type PerspectiveCamera } from 'three'
import { DEFAULT_SERVICES, modelStats, type GameState, type Model, type ModelId, type RuntimeWeapon, type UnitId } from '@/engine'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore, type PlacementDraft } from '../ui/uiStore'
import { Tooltip } from '../ui/Tooltip'
import { useFormFactor } from '../ui/formFactor'
import { registerLabelPart } from './labelLayout'
import { compactLabelScale, DESKTOP_LABEL_MAX, LABEL_DISTANCE_FACTOR, rawLabelScale } from './labelScale'
import { effectEntries, turnFlagEntries } from './statusIcons'

type CoverKind = 'full' | 'partial'

/** Per-unit cover read-out. `covered` = models drawn with a marker (full: cover from every seeing enemy; partial: from
 *  at least one), `total` = models considered. Overview mode fills coveredFrom / exposedTo (enemy unit ids); selected
 *  shooter mode fills `shooter`. */
export interface UnitCover {
  kind: CoverKind
  covered: ModelId[]
  total: number
  coveredFrom: UnitId[]
  exposedTo: UnitId[]
  shooter?: UnitId
}

type Weapon = RuntimeWeapon

/** Distinct ranged weapon profiles carried by a unit (one per name/AP/range/abilities, not one per model). */
function rangedWeapons(state: GameState, unitId: UnitId): Weapon[] {
  const out = new Map<string, Weapon>()
  for (const id of state.units[unitId]?.models ?? []) {
    for (const wid of state.models[id]?.weapons ?? []) {
      const w = state.weapons[wid]
      if (w && w.kind === 'ranged') out.set(`${w.name}|${w.range}|${w.AP}|${w.abilities.map((x) => x.ability).join(',')}`, w)
    }
  }
  return [...out.values()]
}

function liveModels(state: GameState, unitId: UnitId): Model[] {
  return (state.units[unitId]?.models ?? []).map((id) => state.models[id]).filter((m): m is Model => !!m && m.woundsRemaining > 0)
}

/** Models of `unitId` with Benefit of Cover against every one of `weapons` (terrain, or a granted cover such as Go to
 *  Ground / Smokescreen for weapons without Ignores Cover; mirrors attack.ts coverFor). */
function modelsCoveredVs(state: GameState, unitId: UnitId, attackerId: UnitId, weapons: Weapon[]): ModelId[] {
  if (weapons.length === 0) return []
  let granted = false
  try { granted = !!DEFAULT_SERVICES.hooks.hasBenefitOfCover?.(state, unitId) } catch { /* no granted cover */ }
  const out: ModelId[] = []
  for (const m of liveModels(state, unitId)) {
    try {
      const ok = weapons.every((w) => {
        if (DEFAULT_SERVICES.los.benefitOfCover(state, m.id, attackerId, w)) return true
        if (!granted || w.abilities.some((x) => x.ability === 'IGNORES_COVER')) return false
        return !(w.AP === 0 && modelStats(state, m).Sv <= 3) // R-3.12
      })
      if (ok) out.push(m.id)
    } catch { /* treat as exposed */ }
  }
  return out
}

function canSee(state: GameState, attackerId: UnitId, targetId: UnitId): boolean {
  try {
    return state.units[attackerId]!.models.some((id) => state.models[id] && DEFAULT_SERVICES.los.unitVisible(state, id, targetId))
  } catch { return false }
}

// Cheap reach test: closest centre-to-centre gap minus both base radii (a slight over-estimate of reach is fine here).
function inReach(state: GameState, attackerId: UnitId, targetId: UnitId, range: number): boolean {
  const a = liveModels(state, attackerId)
  const t = liveModels(state, targetId)
  const r = (m: Model) => Math.max(m.base.radius, m.base.radius2 ?? 0)
  return a.some((x) => t.some((y) => Math.hypot(x.pos.x - y.pos.x, x.pos.z - y.pos.z) - r(x) - r(y) <= range))
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

export function coverUnits(base: GameState, selectedUnitId: string | null, draft: PlacementDraft | null): Map<UnitId, UnitCover> {
  const out = new Map<UnitId, UnitCover>()
  const state = withDraft(base, draft, selectedUnitId)
  const selected = selectedUnitId ? state.units[selectedUnitId] : undefined
  const shooting = state.phase === 'shooting' && selected && selected.location === 'board' && selected.player === state.activePlayer
  if (shooting && selected) {
    const weapons = rangedWeapons(state, selected.id)
    if (weapons.length > 0) {
      for (const unit of Object.values(state.units)) {
        if (unit.location !== 'board' || unit.player === selected.player) continue
        const covered = modelsCoveredVs(state, unit.id, selected.id, weapons)
        if (covered.length > 0) out.set(unit.id, { kind: 'full', covered, total: liveModels(state, unit.id).length, coveredFrom: [], exposedTo: [], shooter: selected.id })
      }
      return out
    }
  }
  const onBoard = Object.values(state.units).filter((u) => u.location === 'board')
  for (const unit of onBoard) {
    const total = liveModels(state, unit.id).length
    if (total === 0) continue
    const coveredFrom: UnitId[] = []
    const exposedTo: UnitId[] = []
    let all: Set<ModelId> | null = null // covered against every seeing enemy
    const any = new Set<ModelId>() // covered against at least one
    for (const enemy of onBoard) {
      if (enemy.player === unit.player) continue
      const weapons = rangedWeapons(state, enemy.id)
      if (weapons.length === 0) continue
      const reach = Math.max(...weapons.map((w) => w.range))
      if (!inReach(state, enemy.id, unit.id, reach) || !canSee(state, enemy.id, unit.id)) continue
      const covered = modelsCoveredVs(state, unit.id, enemy.id, weapons)
      if (covered.length > 0) coveredFrom.push(enemy.id); else exposedTo.push(enemy.id)
      covered.forEach((id) => any.add(id))
      all = all ? new Set(covered.filter((id) => all!.has(id))) : new Set(covered)
    }
    if (coveredFrom.length === 0) continue
    const everywhere = exposedTo.length === 0 && !!all && all.size > 0
    out.set(unit.id, { kind: everywhere ? 'full' : 'partial', covered: [...(everywhere ? all! : any)], total, coveredFrom, exposedTo })
  }
  return out
}

function nameList(state: GameState, ids: UnitId[]): string {
  const names = [...new Set(ids.map((id) => state.units[id]?.name ?? id))]
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function coverCopy(state: GameState, c: UnitCover): { title: string; body: string } {
  const n = c.covered.length
  if (c.shooter) {
    return { title: `In cover from ${state.units[c.shooter]?.name ?? 'this unit'}`, body: `${n} of ${c.total} models have cover against this unit's shots.` }
  }
  if (c.kind === 'full') {
    return { title: 'In cover', body: `${n} of ${c.total} models have cover from every enemy that can see this unit. Covered models get +1 to armour saves against shooting; assign wounds to them first.` }
  }
  if (c.exposedTo.length === 0) {
    return { title: 'Cover from some angles', body: `Every enemy that can see this unit is blocked for some of its models, but no model is covered from all of them. ${n} of ${c.total} models have some cover.` }
  }
  return {
    title: 'Cover from some angles',
    body: `Covered from ${nameList(state, c.coveredFrom)}. Exposed to ${nameList(state, c.exposedTo)}. ${n} of ${c.total} models have some cover.`,
  }
}

// Row scale: 1 at the default overview distance (22px icons), growing as the camera zooms in and shrinking as it zooms
// out, clamped so it never balloons or vanishes (the old cover pill's 70-140px clamp, as a scale).
const ROW_REF_DISTANCE = 36
const ROW_MIN_SCALE = 0.64
const ROW_MAX_SCALE = 1.27
const ICON_PX = 22
const COMPACT_HIT_PX = 32 // compact: secondary-but-tappable hit area around the 22px badge
const COMPACT_TAG_PX = 15 // compact name tag height in CSS px (11px type)
const COMPACT_ROW_MIN_SCALE = 1

const BLUE = '#5fb4ff'
const AMBER = '#ffb84f'
const RED = '#ff6a5f'
const GREEN = '#7be08a'
const LIGHT = '#e8f6ff'

interface Icon { testid?: string; kind: string; tint: string; title: string; body?: string; data?: Record<string, string>; pulse?: boolean }

const SHIELD = 'M6 1 L11 3 V7 C11 10 8.5 12.2 6 13 C3.5 12.2 1 10 1 7 V3 Z'
const STAR = 'M7 1 L8.8 5 L13 5.4 L9.8 8.2 L10.8 12.4 L7 10.2 L3.2 12.4 L4.2 8.2 L1 5.4 L5.2 5 Z'

function glyph(kind: string, tint: string): ReactElement {
  const line = { stroke: LIGHT, strokeWidth: 1, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'cover': return <path d={SHIELD} fill={tint} {...line} transform="translate(1 0)" />
    case 'shock': return <path d="M8 1 L3 8 H6.5 L5.5 13 L11 6 H7.5 L8 1 Z" fill="#ffd23f" stroke="#7a3d00" strokeWidth={1} strokeLinejoin="round" />
    case 'stratagem': return <path d="M7 1 L12 4 V10 L7 13 L2 10 V4 Z" fill={tint} {...line} />
    case 'buffHit': return <g fill="none" {...line} stroke={tint}><circle cx={7} cy={7} r={4.2} /><path d="M7 1 V4 M7 10 V13 M1 7 H4 M10 7 H13" /></g>
    case 'buffWound': return <path d="M3 11 L11 3 M8.5 3 H11 V5.5 M2.5 8.5 L5.5 11.5" fill="none" {...line} stroke={tint} strokeWidth={1.6} />
    case 'buffSave': return <g><path d={SHIELD} fill={tint} {...line} transform="translate(1 0)" /><path d="M7 4.5 V9 M4.8 6.8 H9.2" stroke="#10243a" strokeWidth={1.3} strokeLinecap="round" /></g>
    case 'aura': return <path d={STAR} fill={tint} {...line} />
    case 'advanced': return <path d="M2 3 L7 7 L2 11 M7 3 L12 7 L7 11" fill="none" {...line} stroke={tint} strokeWidth={1.6} />
    case 'fellBack': return <path d="M12 3 L7 7 L12 11 M7 3 L2 7 L7 11" fill="none" {...line} stroke={tint} strokeWidth={1.6} />
    case 'charged': return <path d="M7 1 L9 6 L13 7 L9 8 L7 13 L5 8 L1 7 L5 6 Z" fill={tint} {...line} />
    default: return <circle cx={7} cy={7} r={4} fill={tint} {...line} />
  }
}

function IconBadge({ icon, compact }: { icon: Icon; compact: boolean }) {
  const outer = ICON_PX + 3 // 22px content + 1.5px border each side, as before
  const hit = compact ? COMPACT_HIT_PX : outer
  const pad = (hit - outer) / 2
  return (
    <Tooltip title={icon.title} body={icon.body} placement="top">
      <div
        data-testid={icon.testid ?? `status-icon-${icon.kind}`}
        data-status-icon={icon.kind}
        {...icon.data}
        style={{ pointerEvents: 'auto', width: hit, height: hit, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}
      >
        <div style={{ width: ICON_PX, height: ICON_PX, margin: pad, borderRadius: '50%', background: 'rgba(14,30,48,0.88)', border: `1.5px solid ${icon.tint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: icon.pulse ? 'm42k-shock-pulse 1.2s ease-in-out infinite' : undefined, boxShadow: icon.pulse ? `0 0 6px ${AMBER}` : undefined }}>
          <svg width={ICON_PX - 6} height={ICON_PX - 6} viewBox="0 0 14 14" aria-hidden="true">{glyph(icon.kind, icon.tint)}</svg>
        </div>
      </div>
    </Tooltip>
  )
}

/** Flat ring just outside a covered model's base (same style family as the selection / target rings in board/Rings.tsx). */
function CoverMarker({ x, y, z, radius, color }: { x: number; y: number; z: number; radius: number; color: string }) {
  return (
    <mesh position={[x, y + 0.06, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <ringGeometry args={[radius + 0.14, radius + 0.24, 32, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} side={DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function StatusRow({ id, icons, position }: { id: UnitId; icons: Icon[]; position: [number, number, number] }) {
  const { compact } = useFormFactor()
  const row = useRef<HTMLDivElement>(null)
  const lift = useRef<HTMLDivElement>(null)
  const camera = useThree((s) => s.camera)
  const anchor = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const el = row.current
    if (!el) return
    const dist = Math.max(camera.position.distanceTo(anchor.set(...position)), 0.1)
    const s = Math.min(ROW_MAX_SCALE, Math.max(compact ? COMPACT_ROW_MIN_SCALE : ROW_MIN_SCALE, ROW_REF_DISTANCE / dist))
    const scale = `scale(${s.toFixed(3)})`
    if (el.style.transform !== scale) el.style.transform = scale
    // Lift the row by the name tag's on-screen height to never overlap it. Desktop: the tag scales with distance
    // (drei distanceFactor 18, 12px text), capped at DESKTOP_LABEL_MAX. Compact: the tag's net scale is clamped (see labelScale.ts).
    const outer = lift.current
    if (outer) {
      const raw = rawLabelScale(dist, (camera as PerspectiveCamera).fov)
      const tagPx = compact ? COMPACT_TAG_PX * compactLabelScale(raw) : 24 * LABEL_DISTANCE_FACTOR / dist * Math.min(1, DESKTOP_LABEL_MAX / raw)
      const tag = `translateY(calc(-100% - ${(tagPx + 4).toFixed(1)}px))`
      if (outer.style.transform !== tag) outer.style.transform = tag
    }
  })
  return (
    <Html zIndexRange={[5, 0]} position={position} center style={{ pointerEvents: 'none' }} occlude={false}>
      {/* The outer box keeps natural size and sits above the unit label; the inner row scales about its bottom centre. */}
      <div ref={(el) => registerLabelPart(id, 'rowWrap', el)}>
      <div ref={lift} style={{ transform: 'translateY(calc(-100% - 22px))', pointerEvents: 'none' }}>
        <style>{'@keyframes m42k-shock-pulse { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.6; transform: scale(0.88) } }'}</style>
        <div ref={row} data-testid={`unit-status-${id}`} style={{ display: 'flex', gap: compact ? 0 : 4, justifyContent: 'center', transformOrigin: '50% 100%', pointerEvents: 'none' }}>
          {icons.map((icon, i) => <IconBadge key={`${icon.kind}-${i}`} icon={icon} compact={compact} />)}
        </div>
      </div>
      </div>
    </Html>
  )
}

export function UnitStatusIcons() {
  const state = useDisplayState()
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const draft = useUiStore((s) => s.draft)
  const cover = useMemo(() => (state ? coverUnits(state, selectedUnitId, draft) : new Map<UnitId, UnitCover>()), [state, selectedUnitId, draft])
  if (!state) return null
  return (
    <>
      {[...cover.entries()].map(([unitId, c]) => {
        const live = draft && draft.unitId === unitId && selectedUnitId === unitId
        const s = live ? withDraft(state, draft, unitId) : state
        const tint = c.kind === 'partial' ? AMBER : BLUE
        return c.covered.map((mid) => {
          const m = s.models[mid]
          return m ? <CoverMarker key={mid} x={m.pos.x} y={m.pos.y} z={m.pos.z} radius={Math.max(m.base.radius, m.base.radius2 ?? 0)} color={tint} /> : null
        })
      })}
      {Object.values(state.units).filter((u) => u.location === 'board').map((unit) => {
        const live = draft && draft.unitId === unit.id && selectedUnitId === unit.id
        const models = unit.models.map((mid) => (live ? withDraft(state, draft, unit.id) : state).models[mid]).filter((m): m is NonNullable<typeof m> => !!m)
        if (models.length === 0) return null
        const icons: Icon[] = []
        const c = cover.get(unit.id)
        if (c) {
          const copy = coverCopy(state, c)
          icons.push({ testid: `cover-badge-${unit.id}`, kind: 'cover', tint: c.kind === 'partial' ? AMBER : BLUE, data: { 'data-cover': c.kind }, ...copy })
        }
        if (unit.battleShocked) icons.push({ testid: `shock-bolt-${unit.id}`, kind: 'shock', tint: AMBER, pulse: true, title: 'Battle-shocked', body: 'This unit is rattled and cannot hold objectives until it recovers.' })
        for (const e of effectEntries(state, unit)) {
          const tint = e.hostile ? RED : e.kind === 'stratagem' ? '#c9a0ff' : e.kind === 'aura' ? '#ffe27a' : e.kind === 'buffSave' ? BLUE : GREEN
          icons.push({ kind: e.kind, tint, title: `${e.name}${e.hostile ? ' (enemy effect)' : ''}`, body: e.hint })
        }
        for (const f of turnFlagEntries(unit)) icons.push({ kind: f.kind, tint: '#cfd8e3', title: f.name, body: f.hint })
        if (icons.length === 0) return null
        const cx = models.reduce((s, m) => s + m.pos.x, 0) / models.length
        const cz = models.reduce((s, m) => s + m.pos.z, 0) / models.length
        const topY = Math.max(...models.map((m) => m.pos.y + m.height)) + 0.25
        return <StatusRow key={unit.id} id={unit.id} icons={icons} position={[cx, topY, cz]} />
      })}
    </>
  )
}
