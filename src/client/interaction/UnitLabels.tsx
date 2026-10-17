// Small floating name + wounds tag over each on-board unit — the board otherwise has no way to tell
// units apart or see how hurt they are at a glance beyond opening the unit card for one at a time.
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { Camera } from 'three'
import { applyOffset, clearOffset, easeOffset, labelRegistry, registerLabelPart, screenScale, StaggerSolver, type LayoutBlock } from './labelLayout'
import { useDisplayState } from '../presentation/presentedStore'
import { colors, fontStack } from '../ui/theme'
import { useFormFactor } from '../ui/formFactor'
import { useUiStore } from '../ui/uiStore'
import {
  COMPACT_LABEL_WIDTH_FRAC, CULL_INTERVAL_MS, DESKTOP_LABEL_MAX, LABEL_DISTANCE_FACTOR, OVERLAP_FADE_OPACITY, coveredByHud, hudZoneRects,
  intersectionArea, rectArea, setCullOpacity, useLabelClamp, type ScreenRect,
} from './labelScale'

const SHOCK_COLOR = '#ffb84f'

const labelStyle = {
  fontFamily: fontStack,
  fontSize: 12,
  fontWeight: 700 as const,
  textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)',
  whiteSpace: 'nowrap' as const,
}

// Compact (phone): smaller type, name truncated with an ellipsis, wounds abbreviated; the zoom clamp lives in
// useLabelClamp. The tag keeps its data-testid element and the same full text in the accessible label.
const compactLabelStyle = { ...labelStyle, fontSize: 11, display: 'flex', alignItems: 'baseline', gap: 3 }

// The tag's contents render in drei's separate React root, so the useFrame clamp lives in UnitLabelItem (which owns
// the Html) and only the ref crosses over.
function UnitTag({ id, name, wounds, color, clamp, compact }: { id: string; name: string; wounds: number; color: string; clamp: RefObject<HTMLDivElement | null>; compact: boolean }) {
  if (!compact) {
    return (
      <div ref={clamp} style={{ transformOrigin: '50% 100%' }}>
        <div style={{ ...labelStyle, color }} data-testid={`unit-label-${id}`}>
          {name} · {wounds} {wounds === 1 ? 'wound' : 'wounds'}
        </div>
      </div>
    )
  }
  return (
    <div ref={clamp} style={{ transformOrigin: '50% 100%' }}>
      <div style={{ ...compactLabelStyle, color }} data-testid={`unit-label-${id}`} aria-label={`${name}, ${wounds} ${wounds === 1 ? 'wound' : 'wounds'}`}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        <span style={{ flexShrink: 0 }}>· {wounds}W</span>
      </div>
    </div>
  )
}

// World anchor of each on-board unit's tag, so the compact culler can rank overlapping labels by camera distance.
const unitAnchors = new Map<string, [number, number, number]>()

function UnitLabelItem({ id, name, wounds, color, position, compact }: { id: string; name: string; wounds: number; color: string; position: [number, number, number]; compact: boolean }) {
  const clamp = useRef<HTMLDivElement>(null)
  const [px, py, pz] = position
  useEffect(() => {
    unitAnchors.set(id, [px, py, pz])
    return () => { unitAnchors.delete(id) }
  }, [id, px, py, pz])
  useLabelClamp(clamp, position, true, compact ? { widthFrac: COMPACT_LABEL_WIDTH_FRAC } : { min: 0, max: DESKTOP_LABEL_MAX })
  return (
    <Html zIndexRange={[5, 0]} position={position} center distanceFactor={LABEL_DISTANCE_FACTOR} style={{ pointerEvents: 'none' }} occlude={false}>
      <div style={{ transform: 'translateY(-100%)' }}>
        <div ref={(el) => registerLabelPart(id, 'tagWrap', el)}>
          <UnitTag id={id} name={name} wounds={wounds} color={color} clamp={clamp} compact={compact} />
        </div>
      </div>
    </Html>
  )
}

function unionRect(els: (Element | null | undefined)[]): { l: number; t: number; r: number; b: number } | null {
  let u: { l: number; t: number; r: number; b: number } | null = null
  for (const el of els) {
    if (!el) continue
    const q = el.getBoundingClientRect()
    if (q.width === 0 && q.height === 0) continue
    u = u ? { l: Math.min(u.l, q.left), t: Math.min(u.t, q.top), r: Math.max(u.r, q.right), b: Math.max(u.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom }
  }
  return u
}

// Measures every unit's tag + icon-row block on screen, resolves overlaps and eases each block's offset toward its
// target. Runs on the existing demand-frame loop; keeps invalidating while easing.
// Never-bounce rule: measurements must not depend on the offset we applied. Applied shifts are cleared before
// measuring (one forced layout per frame, no paint in between), so the solver's input is the true anchor position and
// the output cannot feed back into the next frame's input. Offsets are in screen px and converted per wrapper,
// because the tag lives in a distance-scaled Html and the icon row does not.
function LabelLayoutDriver() {
  const invalidate = useThree((s) => s.invalidate)
  const solver = useMemo(() => new StaggerSolver(), [])
  useFrame((_, delta) => {
    const entries = [...labelRegistry].filter(([id, e]) => {
      if (e.tagWrap?.isConnected || e.rowWrap?.isConnected) return true
      labelRegistry.delete(id)
      return false
    })
    for (const [, e] of entries) clearOffset(e)
    const blocks: LayoutBlock[] = []
    for (const [id, e] of entries) {
      e.tagScale = screenScale(e.tagWrap)
      e.rowScale = screenScale(e.rowWrap)
      const r = unionRect([e.tagWrap?.querySelector('[data-testid]'), e.rowWrap?.querySelector('[data-testid]')])
      if (!r) { e.offset = 0; continue }
      blocks.push({ id, x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t })
    }
    const targets = solver.update(blocks)
    let moving = false
    for (const [id, target] of targets) {
      const e = labelRegistry.get(id)!
      const next = easeOffset(e.offset, target, delta)
      if (next !== target) moving = true
      e.offset = next
    }
    for (const [, e] of entries) applyOffset(e)
    if (moving) invalidate()
  })
  return null
}

// Compact only. A few times a second: fade a unit's whole label block out when it is mostly under the top bar / bottom
// stack, and when two blocks overlap on screen keep the selected unit's (else the one nearer the camera) and drop the other
// to 25%. Pure DOM + registry reads on a timer, so no React state and no per-frame cost.
function CompactLabelCuller() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const tick = () => {
      const zones = hudZoneRects()
      const selected = useUiStore.getState().selectedUnitId
      const live: { id: string; rect: ScreenRect; dist: number; tag?: HTMLElement | null; row?: HTMLElement | null }[] = []
      for (const [id, e] of labelRegistry) {
        if (!(e.tagWrap?.isConnected || e.rowWrap?.isConnected)) continue
        const rect = unionRect([e.tagWrap?.querySelector('[data-testid]'), e.rowWrap?.querySelector('[data-testid]')])
        if (!rect) continue
        const a = unitAnchors.get(id)
        const dist = a ? distanceTo(camera, a) : Infinity
        const r: ScreenRect = { l: rect.l, t: rect.t, r: rect.r, b: rect.b }
        if (coveredByHud(r, zones)) { setCullOpacity(e.tagWrap, 0); setCullOpacity(e.rowWrap, 0); continue }
        live.push({ id, rect: r, dist, tag: e.tagWrap, row: e.rowWrap })
      }
      // Highest priority first: the selected unit, then nearest to the camera.
      live.sort((x, y) => (x.id === selected ? -1 : y.id === selected ? 1 : x.dist - y.dist))
      const kept: ScreenRect[] = []
      for (const u of live) {
        const area = rectArea(u.rect)
        const clash = kept.some((k) => intersectionArea(u.rect, k) > 0.1 * Math.min(area, rectArea(k)))
        if (!clash) kept.push(u.rect)
        const o = clash ? OVERLAP_FADE_OPACITY : 1
        setCullOpacity(u.tag, o)
        setCullOpacity(u.row, o)
      }
    }
    const timer = window.setInterval(tick, CULL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      for (const [, e] of labelRegistry) for (const el of [e.tagWrap, e.rowWrap]) if (el) el.style.opacity = ''
    }
  }, [camera])
  return null
}

function distanceTo(camera: Camera, a: [number, number, number]): number {
  const p = camera.position
  return Math.hypot(p.x - a[0], p.y - a[1], p.z - a[2])
}

export function UnitLabels() {
  const state = useDisplayState()
  const { compact } = useFormFactor()
  if (!state) return null
  const units = Object.values(state.units).filter((u) => u.location === 'board')

  return (
    <>
      <LabelLayoutDriver />
      {compact && <CompactLabelCuller />}
      {units.map((unit) => {
        const models = unit.models.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
        if (models.length === 0) return null
        const cx = models.reduce((sum, m) => sum + m.pos.x, 0) / models.length
        const cz = models.reduce((sum, m) => sum + m.pos.z, 0) / models.length
        const topY = Math.max(...models.map((m) => m.pos.y + m.height)) + 0.25
        const wounds = models.reduce((sum, m) => sum + m.woundsRemaining, 0)
        const color = unit.battleShocked ? SHOCK_COLOR : unit.player === 'A' ? colors.playerA : colors.playerB
        return (
          <UnitLabelItem key={unit.id} id={unit.id} name={unit.name} wounds={wounds} color={color} position={[cx, topY, cz]} compact={compact} />
        )
      })}
    </>
  )
}
