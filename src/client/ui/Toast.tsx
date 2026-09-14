// Rejection toast (docs/spec/50-client.md §5). Shown whenever store.dispatch's step() call comes
// back with a rejection — auto-dismisses, click to dismiss early.
import { useEffect, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { colors, fontStack } from './theme'

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

const codeStyle: CSSProperties = { color: colors.danger, fontWeight: 700, marginRight: 6 }

export function Toast() {
  const toast = useGameStore((s) => s.toast)
  const clearToast = useGameStore((s) => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 4000)
    return () => clearTimeout(t)
  }, [toast, clearToast])

  if (!toast) return null
  return (
    <div style={wrap} onClick={clearToast}>
      {toast.code && <span style={codeStyle}>{toast.code}</span>}
      {toast.text}
    </div>
  )
}
