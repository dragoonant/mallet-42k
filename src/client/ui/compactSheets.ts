// Compact (phone) layout: right-edge drawers (M11). Only one drawer is open at a time; all start closed.
// The Hud's menu and the Stratagems button toggle them, and each panel (Mission, Stratagems, Dice log,
// Event feed, Settings) wraps its content in <CompactDrawer id=...> when useFormFactor().compact.
// Desktop never mounts a drawer, so none of this touches the desktop layout.
//
// Drawer geometry: slides in over the board from the right edge of the overlay layer (which is already
// inset by the --safe-* vars), starts just under the 44px top bar, runs to the bottom, and is
// min(320px, 46vw) wide. It scrolls internally and sits above the bottom sheet (zIndex 50).
import { createElement, Fragment, type CSSProperties, type ReactNode } from 'react'
import { create } from 'zustand'
import { colors, fontStack, panel } from './theme'

export type SheetId = 'mission' | 'stratagems' | 'log' | 'feed' | 'settings'

interface CompactSheetsState {
  open: SheetId | null
  toggle(id: SheetId): void
  close(): void
}

export const useCompactSheets = create<CompactSheetsState>((set) => ({
  open: null,
  toggle: (id) => set((s) => ({ open: s.open === id ? null : id })),
  close: () => set({ open: null }),
}))

/** Height of the compact top bar, below any safe-area inset (the overlay layer already insets that). */
export const COMPACT_BAR_PX = 48

const STYLE = `
@keyframes mallet-drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) { [data-compact-drawer] { animation: none !important; } }
`

const drawer: CSSProperties = {
  ...panel,
  position: 'absolute',
  top: COMPACT_BAR_PX + 4,
  right: 0,
  bottom: 0,
  width: 'min(320px, 46vw)',
  borderRadius: '10px 0 0 10px',
  background: colors.bgSolid,
  borderRight: 'none',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  pointerEvents: 'auto',
  zIndex: 50,
  fontFamily: fontStack,
  animation: 'mallet-drawer-in 160ms ease-out',
  touchAction: 'pan-y',
}
const header: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 44,
  padding: '0 4px 0 12px',
  borderBottom: `1px solid ${colors.border}`,
}
const titleStyle: CSSProperties = { fontWeight: 700, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const closeBtn: CSSProperties = {
  flex: '0 0 auto',
  width: 44,
  height: 44,
  background: 'transparent',
  border: 'none',
  color: colors.muted,
  fontSize: 18,
  cursor: 'pointer',
}
const body: CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxSizing: 'border-box',
}

/** Slide-in drawer. Renders nothing unless `id` is the open sheet. */
export function CompactDrawer({ id, title, children }: { id: SheetId; title: string; children: ReactNode }) {
  const open = useCompactSheets((s) => s.open)
  const close = useCompactSheets((s) => s.close)
  if (open !== id) return null
  return createElement(
    Fragment,
    null,
    createElement('style', null, STYLE),
    createElement(
      'div',
      { style: drawer, 'data-testid': `drawer-${id}`, 'data-compact-drawer': id, role: 'dialog', 'aria-label': title },
      createElement(
        'div',
        { style: header },
        createElement('div', { style: titleStyle }, title),
        createElement('button', { style: closeBtn, 'aria-label': `Close ${title}`, 'data-testid': `drawer-${id}-close`, onClick: close }, '✕'),
      ),
      createElement('div', { style: body }, children),
    ),
  )
}
