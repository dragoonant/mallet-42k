// On-screen size control for the distance-scaled in-world labels (unit name tags, objective labels).
// drei's <Html distanceFactor> scales a label by factor / (2 tan(fov/2) dist), so on a phone, where the camera is
// pulled in close, text balloons. In the compact layout the label's contents counter-scale to keep the net on-screen
// scale inside [min, max] and the width under a fraction of the screen. Desktop only gets a generous max
// (DESKTOP_LABEL_MAX) so a very close zoom never makes a tag fill the screen; at normal distances it is a no-op.
// Writes straight to the DOM from useFrame (no React state).
import { useMemo, type RefObject } from 'react'
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
    const raw = rawLabelScale(dist, fov)
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
