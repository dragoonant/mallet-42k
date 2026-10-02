// The phase/turn announcement banner (docs/spec/50-client.md §5). Shown for as long as the director
// holds its narration pause (src/client/presentation/announceStore.ts) — the visible half of the fix
// for phases that used to flash past under a pile-up of overlapping narrator voice lines whenever
// nothing actually happened in them.
//
// Clicking anywhere already ends the pause (announceStore attaches window listeners for the duration),
// so this component's own click handler is really just what makes the banner *look* clickable; the
// countdown bar underneath shows how long is left, so a wait never feels like a freeze.
import { useEffect, useState, type CSSProperties } from 'react'
import { useAnnouncementStore, skipAnnouncement } from '../presentation/announceStore'
import { colors, fontStack } from './theme'

const wrap: CSSProperties = {
  position: 'absolute',
  top: '24%',
  left: '50%',
  transform: 'translateX(-50%)',
  minWidth: 260,
  padding: '14px 28px 12px',
  borderRadius: 12,
  background: 'rgba(14, 15, 22, 0.86)',
  border: `1px solid ${colors.border}`,
  boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
  backdropFilter: 'blur(6px)',
  fontFamily: fontStack,
  color: colors.text,
  textAlign: 'center',
  cursor: 'pointer',
  pointerEvents: 'auto',
  userSelect: 'none',
}

const titleStyle: CSSProperties = { fontSize: 26, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.15 }
const subtitleStyle: CSSProperties = { fontSize: 13, color: colors.muted, marginTop: 4 }
const hintStyle: CSSProperties = { fontSize: 11, color: colors.muted, marginTop: 8, opacity: 0.85 }
const barTrack: CSSProperties = {
  marginTop: 10,
  height: 3,
  borderRadius: 2,
  background: 'rgba(255,255,255,0.12)',
  overflow: 'hidden',
}

export function PhaseBanner() {
  const current = useAnnouncementStore((s) => s.current)
  const id = current?.id ?? null
  // Two renders per announcement (full-width bar, then 0) so the CSS transition below has something
  // to animate from — a single render at the target width would just paint it empty.
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (id === null) return
    setRunning(false)
    const frame = requestAnimationFrame(() => setRunning(true))
    return () => cancelAnimationFrame(frame)
  }, [id])

  if (!current) return null
  const accent = current.player === 'A' ? colors.playerA : colors.playerB

  return (
    <div
      style={{ ...wrap, borderColor: accent }}
      data-testid="phase-banner"
      // Per-announcement, so an e2e run can tell "this pause ended" from "the next one took over the
      // banner straight away" — back-to-back announcements are exactly the case this feature exists for.
      data-announcement-id={String(current.id)}
      data-announcement-duration={String(current.durationMs)}
      role="status"
      aria-live="polite"
      onClick={skipAnnouncement}
      title="Click to continue"
    >
      <div style={{ ...titleStyle, color: accent }}>{current.title}</div>
      <div style={subtitleStyle}>{current.subtitle}</div>
      <div style={hintStyle}>Click anywhere to continue</div>
      <div style={barTrack}>
        <div
          style={{
            height: '100%',
            width: running ? '0%' : '100%',
            background: accent,
            transition: `width ${current.durationMs}ms linear`,
          }}
        />
      </div>
    </div>
  )
}
