// Screen-space stagger for unit name tags + status-icon rows. Each unit's tag and icon row form one block; blocks that
// overlap on screen are pushed upward (greedy, lowest block keeps its spot). The solver is pure; the registry and the
// easing helpers below are used by LabelLayoutDriver (UnitLabels.tsx) and the two components that apply the offset.

export interface LayoutBlock { id: string; x: number; y: number; w: number; h: number }

export const STAGGER_GAP = 4

/** Returns id -> upward shift in px (>= 0). Blocks are sorted bottom-first; each is lifted above anything it overlaps. */
export function resolveStagger(blocks: LayoutBlock[], gap = STAGGER_GAP): Map<string, number> {
  const out = new Map<string, number>()
  const placed: LayoutBlock[] = [] // rects at their final (shifted) position
  const sorted = [...blocks].sort((a, b) => (b.y + b.h) - (a.y + a.h) || a.id.localeCompare(b.id))
  for (const b of sorted) {
    let shift = 0
    for (let guard = 0; guard <= sorted.length; guard++) {
      const top = b.y - shift
      const hit = placed.find((p) => b.x < p.x + p.w && p.x < b.x + b.w && top < p.y + p.h + 0 && p.y < top + b.h + gap)
      if (!hit) break
      // Overlap (or within the gap): lift so our bottom sits `gap` above the obstacle's top.
      shift = b.y + b.h + gap - hit.y
    }
    out.set(b.id, shift)
    placed.push({ ...b, y: b.y - shift })
  }
  return out
}

export const RESOLVE_THRESHOLD = 3 // px an un-offset block must move before the layout is re-solved
const QUANT = 8 // px grid used for the bottom-first ordering so sub-pixel jitter can never swap a pair

/**
 * Stateful wrapper around resolveStagger. Inputs are un-offset anchor rects; the previous solution is reused until a
 * block appears/disappears, resizes, or moves more than RESOLVE_THRESHOLD px, so measurement jitter (Html rounding,
 * the previous frame's applied offset) cannot make blocks flip between stacked and unstacked.
 */
export class StaggerSolver {
  private last = new Map<string, LayoutBlock>()
  private result = new Map<string, number>()
  update(blocks: LayoutBlock[]): Map<string, number> {
    let changed = blocks.length !== this.last.size
    if (!changed) {
      for (const b of blocks) {
        const o = this.last.get(b.id)
        if (!o || Math.abs(o.x - b.x) > RESOLVE_THRESHOLD || Math.abs(o.y - b.y) > RESOLVE_THRESHOLD || Math.abs(o.w - b.w) > RESOLVE_THRESHOLD || Math.abs(o.h - b.h) > RESOLVE_THRESHOLD) { changed = true; break }
      }
    }
    if (!changed) return this.result
    this.last = new Map(blocks.map((b) => [b.id, b]))
    // Quantise y so near-ties order by id, not by jitter.
    const q = blocks.map((b) => ({ ...b, y: Math.round(b.y / QUANT) * QUANT, x: Math.round(b.x / QUANT) * QUANT }))
    this.result = resolveStagger(q)
    return this.result
  }
}

/** One exponential-ease step toward `target` with a ~120ms settle. */
export function easeOffset(current: number, target: number, dtSeconds: number): number {
  const k = 1 - Math.exp(-Math.max(dtSeconds, 0) / 0.04)
  const next = current + (target - current) * k
  return Math.abs(target - next) < 0.3 ? target : next
}

export interface LabelEntry {
  tagWrap?: HTMLElement | null
  rowWrap?: HTMLElement | null
  /** Current upward shift in SCREEN px. */
  offset: number
  /** Screen px per CSS px for each wrapper (drei distanceFactor scales the tag but not the row). */
  tagScale?: number
  rowScale?: number
}
export const labelRegistry = new Map<string, LabelEntry>()

export function registerLabelPart(id: string, part: 'tagWrap' | 'rowWrap', el: HTMLElement | null) {
  const e = labelRegistry.get(id) ?? { offset: 0 }
  e[part] = el
  labelRegistry.set(id, e)
}

/** Removes the applied shift so the next getBoundingClientRect reads the true, un-offset position. */
export function clearOffset(e: LabelEntry) {
  for (const el of [e.tagWrap, e.rowWrap]) if (el && el.style.transform !== '') el.style.transform = ''
}

/** Screen px per CSS px for an un-transformed wrapper (its ancestors may be scaled). */
export function screenScale(el: HTMLElement | null | undefined): number {
  if (!el || el.offsetHeight === 0) return 1
  const s = el.getBoundingClientRect().height / el.offsetHeight
  return Number.isFinite(s) && s > 0 ? s : 1
}

/** Applies `e.offset` (screen px) to both wrappers, converting to each wrapper's local CSS px. */
export function applyOffset(e: LabelEntry) {
  const parts: [HTMLElement | null | undefined, number | undefined][] = [[e.tagWrap, e.tagScale], [e.rowWrap, e.rowScale]]
  for (const [el, scale] of parts) {
    if (!el) continue
    const t = e.offset === 0 ? '' : `translateY(${(-e.offset / (scale || 1)).toFixed(2)}px)`
    if (el.style.transform !== t) el.style.transform = t
  }
}
