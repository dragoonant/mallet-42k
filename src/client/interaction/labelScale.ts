// On-screen size control for the distance-scaled in-world labels (unit name tags, objective labels).
// drei's <Html distanceFactor> scales a label by factor / (2 tan(fov/2) dist), so on a phone, where the camera is
// pulled in close, text balloons. In the compact layout the label's contents counter-scale to keep the net on-screen
// scale inside [min, max] and the width under a fraction of the screen. Desktop only gets a generous max
// (DESKTOP_LABEL_MAX) so a very close zoom never makes a tag fill the screen; at normal distances it is a no-op.
// Writes straight to the DOM from useFrame (no React state).
import { useEffect, useMemo, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'

export const LABEL_DISTANCE_FACTOR = 18

/** Net scale drei applies to an Html with distanceFactor at `dist` world units from a camera of vertical `fovDeg`. */
export function rawLabelScale(dist: number, fovDeg: number, factor = LABEL_DISTANCE_FACTOR): number {
  return factor / (2 * Math.tan((fovDeg * Math.PI) / 360) * Math.max(dist, 0.1))
}

export const COMPACT_LABEL_MIN = 0.95
export const COMPACT_LABEL_MAX = 1.3
export const COMPACT_LABEL_WIDTH_FRAC = 1 / 3
export const DESKTOP_LABEL_MAX = 2.4

/** Net on-screen scale a compact label should have at this camera distance. */
export function compactLabelScale(raw: number, min = COMPACT_LABEL_MIN, max = COMPACT_LABEL_MAX): number {
  return Math.min(max, Math.max(min, raw))
}

export interface LabelClampOptions {
  min?: number
  max?: number
  /** CSS transform-origin of the counter-scale; the label's anchor edge (default bottom centre). */
  origin?: string
  /** Cap the label width at this fraction of the window width (omit for no cap). */
  widthFrac?: number
}

/**
 * The scale drei currently has on the Html wrapper above `el`. drei writes `translate3d(x, y, 0) scale(s)` there, but a
 * re-render of the Html (label text changing) rewrites it as a bare `translate3d(...)` until the label's projected
 * position next changes, so a wrapper with a translate and no scale means the label is really at scale 1.
 * Null when no wrapper is found (fall back to the computed value).
 */
export function appliedHtmlScale(el: HTMLElement): number | null {
  let p = el.parentElement
  for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
    const t = p.style.transform
    if (!/translate3d\(-?[\d.]+px/.test(t)) continue // skip the `center` wrapper, whose translate is in %
    const m = /scale\(([\d.]+)\)/.exec(t)
    if (!m) return 1
    const v = Number(m[1])
    return Number.isFinite(v) && v > 0 ? v : null
  }
  return null
}

/** Counter-scales `ref` so the label's net on-screen scale is clamped, and optionally caps its width. */
export function useLabelClamp(ref: RefObject<HTMLElement | null>, position: [number, number, number], enabled: boolean, opts: LabelClampOptions = {}) {
  const camera = useThree((s) => s.camera)
  const anchor = useMemo(() => new Vector3(), [])
  const { min = COMPACT_LABEL_MIN, max = COMPACT_LABEL_MAX } = opts
  useFrame(() => {
    const el = ref.current
    if (!el || !enabled) return
    const fov = (camera as PerspectiveCamera).fov
    if (!Number.isFinite(fov)) return
    const dist = camera.position.distanceTo(anchor.set(...position))
    // drei refreshes an Html scale only when its projected position changes, so after a pure dolly it can lag the camera.
    // Counter-scale against the scale actually applied in the DOM.
    const raw = appliedHtmlScale(el) ?? rawLabelScale(dist, fov)
    const net = compactLabelScale(raw, min, max)
    const scale = `scale(${(net / raw).toFixed(3)})`
    if (el.style.transform !== scale) el.style.transform = scale
    if (!el.style.transformOrigin) el.style.transformOrigin = opts.origin ?? '50% 100%'
    if (opts.widthFrac) {
      const maxW = `${Math.round((window.innerWidth * opts.widthFrac) / net)}px`
      if (el.style.maxWidth !== maxW) el.style.maxWidth = maxW
    }
  })
}

// ---- Compact HUD culling -------------------------------------------------------------------------------------
// In-world labels always paint beneath the HUD (drei zIndexRange [5, 0] under the overlay layer's zIndex 10). On a phone
// the top bar and the bottom stack cover a big share of the board, so a label whose tag sits under them would just show
// as a clipped sliver. In compact, labels mostly covered by those zones are faded out instead.

export interface ScreenRect { l: number; t: number; r: number; b: number }

/** CSS selectors of the HUD surfaces that cover the board on a phone: slim top bar, bottom sheet(s), staged-move bar, formation strip. */
const HUD_ZONE_SELECTORS = ['[data-testid="hud-bar"]', '.m42-sheet', '[data-testid="touch-action-bar"]', '[data-testid="formation-picker"]']

/** Current on-screen rects of the HUD zones (empty when none are mounted). */
export function hudZoneRects(): ScreenRect[] {
  const out: ScreenRect[] = []
  if (typeof document === 'undefined') return out
  document.querySelectorAll(HUD_ZONE_SELECTORS.join(',')).forEach((el) => {
    const q = el.getBoundingClientRect()
    if (q.width > 0 && q.height > 0) out.push({ l: q.left, t: q.top, r: q.right, b: q.bottom })
  })
  return out
}

export function rectArea(a: ScreenRect): number {
  return Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t)
}

export function intersectionArea(a: ScreenRect, b: ScreenRect): number {
  return Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
}

/** True when more than `frac` of the label rect lies under one of the HUD zones. */
export function coveredByHud(rect: ScreenRect, zones: ScreenRect[], frac = 0.3): boolean {
  const area = rectArea(rect)
  if (area <= 0) return false
  return zones.some((z) => intersectionArea(rect, z) / area > frac)
}

/** Fades `el` in/out with a short transition (used by the compact label culling). */
export function setCullOpacity(el: HTMLElement | null | undefined, opacity: number): void {
  if (!el) return
  if (!el.style.transition) el.style.transition = 'opacity 0.2s'
  const v = String(opacity)
  if (el.style.opacity !== v) el.style.opacity = v
}

export const CULL_INTERVAL_MS = 250
export const OVERLAP_FADE_OPACITY = 0.25

/** Compact only: a few times a second, hides `ref`'s element while it is mostly under the top bar / bottom stack. No React state. */
export function useHudCull(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined
    const tick = () => {
      const el = ref.current
      if (!el) return
      const q = el.getBoundingClientRect()
      if (q.width === 0 && q.height === 0) return
      setCullOpacity(el, coveredByHud({ l: q.left, t: q.top, r: q.right, b: q.bottom }, hudZoneRects()) ? 0 : 1)
    }
    const timer = window.setInterval(tick, CULL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      if (ref.current) ref.current.style.opacity = ''
    }
  }, [ref, enabled])
}
