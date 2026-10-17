// Hover/focus tooltip for the unit card's rows. The popup is portalled to <body> because the card's
// panel style uses backdrop-filter, which would make it the containing block for position:fixed and
// clip the popup to the card. It is placed to the right of the card (the card hugs the screen's left
// edge), beside the hovered row, and clamped into the viewport.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { colors, panel } from './theme'

const GAP = 10
const MARGIN = 8
const TIP_WIDTH = 300

const tipBox: CSSProperties = {
  ...panel,
  position: 'fixed',
  width: TIP_WIDTH,
  maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
  padding: '10px 12px',
  fontSize: 12,
  lineHeight: 1.45,
  pointerEvents: 'none', // never steals the click the player is about to make
  zIndex: 1000,
  boxSizing: 'border-box',
}

export interface Anchor {
  left: number
  top: number
}

/** Popup placed at `anchor` (portalled, clamped into the viewport). `width` widens it for the datasheet view. */
export function TipPopup({ anchor, width, testId = 'unit-card-tooltip', children }: { anchor: Anchor; width?: number; testId?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Measure after render so the popup can be kept fully on screen; hidden until then to avoid a jump.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN))
    const top = Math.max(MARGIN, Math.min(anchor.top, window.innerHeight - height - MARGIN))
    setPos({ left, top })
  }, [anchor.left, anchor.top])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      data-testid={testId}
      style={{ ...tipBox, ...(width ? { width } : null), left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.top, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Where a popup for `el` goes: just right of the unit card, level with the hovered element. */
export function anchorBesideCard(el: HTMLElement): Anchor {
  const row = el.getBoundingClientRect()
  const card = el.closest('[data-testid="unit-card"]')?.getBoundingClientRect()
  return { left: (card?.right ?? row.right) + GAP, top: row.top - 6 }
}

/**
 * Hover + touch trigger shared by the unit card's detail popups. Mouse: enter/leave and keyboard focus show and hide
 * (as before). Touch: a tap toggles it, and a tap anywhere else closes it (same idea as Tooltip.tsx). The browser's
 * emulated mouse events after a tap are ignored so they cannot flicker the popup. Spread the result onto the element.
 */
export function useTipTrigger(open: boolean, onShow: (el: HTMLElement) => void, onHide: () => void) {
  const lastTouch = useRef(false)
  const touchOpen = useRef(false)
  const el = useRef<HTMLElement | null>(null)
  const show = useRef(onShow)
  const hide = useRef(onHide)
  show.current = onShow
  hide.current = onHide

  useEffect(() => {
    if (!open) touchOpen.current = false
    if (!open || !touchOpen.current) return
    const onDown = (e: PointerEvent) => {
      if (el.current && el.current.contains(e.target as Node)) return
      touchOpen.current = false
      hide.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const kind = (e: SyntheticEvent) => { lastTouch.current = (e.nativeEvent as PointerEvent).pointerType === 'touch' }
  return {
    onPointerDown: kind,
    onPointerEnter: kind,
    onMouseEnter: (e: SyntheticEvent<HTMLElement>) => { if (!lastTouch.current) show.current(e.currentTarget) },
    onMouseLeave: () => { if (!lastTouch.current) hide.current() },
    onFocus: (e: SyntheticEvent<HTMLElement>) => { if (!lastTouch.current) show.current(e.currentTarget) },
    onBlur: () => { if (!touchOpen.current) hide.current() },
    onClick: (e: SyntheticEvent<HTMLElement>) => {
      if (!lastTouch.current) return
      if (touchOpen.current) { touchOpen.current = false; hide.current() }
      else { touchOpen.current = true; el.current = e.currentTarget; show.current(e.currentTarget) }
    },
  }
}

/** A list row that shows `tip` in a popup beside the unit card while hovered, focused or (on touch) tapped. */
export function TipItem({ testId, tip, children }: { testId: string; tip: ReactNode; children: ReactNode }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const trigger = useTipTrigger(anchor !== null, (el) => setAnchor(anchorBesideCard(el)), () => setAnchor(null))

  const style: CSSProperties = {
    cursor: 'help',
    borderRadius: 4,
    padding: '1px 4px',
    margin: '0 -4px',
    outline: 'none',
    background: anchor ? 'rgba(255,255,255,0.1)' : 'transparent',
    transition: 'background 0.12s',
  }

  return (
    <li data-testid={testId} tabIndex={0} style={style} {...trigger}>
      {children}
      {anchor && <TipPopup anchor={anchor}>{tip}</TipPopup>}
    </li>
  )
}

export const tipTitle: CSSProperties = { fontWeight: 700, fontSize: 13, color: colors.text }
export const tipMuted: CSSProperties = { color: colors.muted }
