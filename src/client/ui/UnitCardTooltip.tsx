// Hover/focus tooltip for the unit card's rows. The popup is portalled to <body> because the card's
// panel style uses backdrop-filter, which would make it the containing block for position:fixed and
// clip the popup to the card. It is placed to the right of the card (the card hugs the screen's left
// edge), beside the hovered row, and clamped into the viewport.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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

interface Anchor {
  left: number
  top: number
}

function TipPopup({ anchor, children }: { anchor: Anchor; children: ReactNode }) {
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
      data-testid="unit-card-tooltip"
      style={{ ...tipBox, left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.top, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** A list row that shows `tip` in a popup beside the unit card while hovered or focused. */
export function TipItem({ testId, tip, children }: { testId: string; tip: ReactNode; children: ReactNode }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  const show = (el: HTMLElement) => {
    const row = el.getBoundingClientRect()
    const card = el.closest('[data-testid="unit-card"]')?.getBoundingClientRect()
    setAnchor({ left: (card?.right ?? row.right) + GAP, top: row.top - 6 })
  }
  const hide = () => setAnchor(null)

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
    <li
      data-testid={testId}
      tabIndex={0}
      style={style}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
    >
      {children}
      {anchor && <TipPopup anchor={anchor}>{tip}</TipPopup>}
    </li>
  )
}

export const tipTitle: CSSProperties = { fontWeight: 700, fontSize: 13, color: colors.text }
export const tipMuted: CSSProperties = { color: colors.muted }
