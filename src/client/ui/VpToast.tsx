// "+10 VP — Raze and Ruin" pop-up (docs/spec/50-client.md §5, M6 gap: scoring events scrolled out of
// the Events list within seconds with no other visible reason). Auto-dismisses; click to dismiss early.
import { useEffect, type CSSProperties } from 'react'
import { useGameStore } from '../store/game'
import { colors, fontStack } from './theme'

const wrap: CSSProperties = {
  position: 'absolute',
  top: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(245, 217, 90, 0.16)',
  border: `1px solid ${colors.accent}`,
  color: colors.text,
  fontFamily: fontStack,
  fontSize: 13,
  fontWeight: 700,
  padding: '7px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  pointerEvents: 'auto',
}

export function VpToast() {
  const vpToast = useGameStore((s) => s.vpToast)
  const clearVpToast = useGameStore((s) => s.clearVpToast)

  useEffect(() => {
    if (!vpToast) return
    const t = setTimeout(clearVpToast, 3000)
    return () => clearTimeout(t)
  }, [vpToast, clearVpToast])

  if (!vpToast) return null
  return (
    <div style={wrap} data-testid="vp-toast" onClick={clearVpToast}>
      {vpToast.text}
    </div>
  )
}
