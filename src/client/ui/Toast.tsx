// Rejection toast (docs/spec/50-client.md §5). Shown whenever store.dispatch's step() call comes
// back with a rejection — auto-dismisses, click to dismiss early.
import { useEffect, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { colors, fontStack } from './theme'
import { useFormFactor } from './formFactor'

const wrap: CSSProperties = {
  position: 'absolute',
  bottom: 200,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(255, 90, 80, 0.16)',
  border: '1px solid rgba(255, 106, 95, 0.6)',
  color: colors.text,
  fontFamily: fontStack,
  fontSize: 13,
  padding: '9px 16px',
  borderRadius: 8,
  cursor: 'pointer',
  pointerEvents: 'auto',
  maxWidth: 420,
  textAlign: 'center',
}

// Compact: floats just above the bottom sheet's tallest extent (45dvh), never over its buttons and clear of the
// dice tray under the top bar.
const wrapCompact: CSSProperties = {
  ...wrap,
  bottom: 'calc(45dvh + 8px)',
  fontSize: 12,
  padding: '7px 12px',
  maxWidth: 'min(420px, calc(100% - 200px))',
  zIndex: 35,
}

const codeStyle: CSSProperties = { color: colors.danger, fontWeight: 700, marginRight: 6 }

export function Toast() {
  const toast = useGameStore((s) => s.toast)
  const clearToast = useGameStore((s) => s.clearToast)
  const { compact } = useFormFactor()

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 4000)
    return () => clearTimeout(t)
  }, [toast, clearToast])

  if (!toast) return null
  return (
    <div style={compact ? wrapCompact : wrap} onClick={clearToast}>
      {toast.code && <span style={codeStyle}>{toast.code}</span>}
      {toast.text}
    </div>
  )
}
