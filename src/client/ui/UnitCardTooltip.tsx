// Hover/focus tooltip for the unit card's rows. The popup is portalled to <body> because the card's
// panel style uses backdrop-filter, which would make it the containing block for position:fixed and
// clip the popup to the card. It is placed to the right of the card (the card hugs the screen's left
// edge), beside the hovered row, and clamped into the viewport.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { colors, panel } from './theme'
import { useFormFactor } from './formFactor'

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
  maxHeight: 'calc(100dvh - 16px)',
  overflow: 'hidden',
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

/**
 * Phone version of a datasheet popup: a full-screen sheet with a 44px-plus close button, scrollable inside the safe
 * areas. Portalled to <body>; events are stopped here so taps inside never reach the row that opened it (which would
 * toggle it shut). `onClose` must clear whatever state opened it.
 */
export function FullScreenSheet({ onClose, testId = 'unit-datasheet-sheet', children }: { onClose: () => void; testId?: string; children: ReactNode }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation()
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      data-tip-sticky=""
      onClick={stop}
      onPointerDown={stop}
      onFocus={stop}
      onBlur={stop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: colors.bgSolid,
        color: colors.text,
        boxSizing: 'border-box',
        paddingTop: 'var(--safe-top, 0px)',
        paddingRight: 'var(--safe-right, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
        paddingLeft: 'var(--safe-left, 0px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          padding: '10px 12px 16px',
        }}
      >
        {children}
      </div>
      <button
        type="button"
        data-testid="unit-datasheet-close"
        aria-label="Close datasheet"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 'calc(var(--safe-top, 0px) + 4px)',
          right: 'calc(var(--safe-right, 0px) + 4px)',
          width: 48,
          height: 48,
          fontSize: 20,
          lineHeight: 1,
          color: colors.text,
          background: 'rgba(255,255,255,0.12)',
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
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
  // Compact (phone) layout is tap-only: hover never opens anything, so a mouse used to test it behaves like a finger.
  const tapOnly = useFormFactor().compact
  const lastTouch = useRef(tapOnly)
  const tapOnlyRef = useRef(tapOnly)
  tapOnlyRef.current = tapOnly
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
      // A full-screen sheet (FullScreenSheet) stays open until its own close button is pressed.
      if ((e.target as Element | null)?.closest?.('[data-tip-sticky]')) return
      touchOpen.current = false
      hide.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const kind = (e: SyntheticEvent) => { lastTouch.current = tapOnlyRef.current || (e.nativeEvent as PointerEvent).pointerType === 'touch' }
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
  const { compact } = useFormFactor()

  const style: CSSProperties = {
    cursor: 'help',
    borderRadius: 4,
    padding: compact ? '12px 4px' : '1px 4px',
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
