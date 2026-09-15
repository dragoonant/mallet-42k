// Settings popover: audio mix (master/sfx/voice/music + mute, src/client/audio) and presentation
// pacing (animation speed, dice animation on/off, ambient on/off, src/client/presentation/settings.ts).
// Toggled from the Hud's gear button; purely a thin control surface over those two stores.
import type { CSSProperties } from 'react'
import { audio, useAudioSettings } from '../audio'
import { usePresentationSettings, type AnimSpeed } from '../presentation'
import { useUiStore } from './uiStore'
import { buttonActive, buttonBase, colors, fontStack, mutedText, panel } from './theme'

const wrapBase: CSSProperties = {
  ...panel,
  position: 'absolute',
  right: 12,
  width: 250,
  padding: 14,
  pointerEvents: 'auto',
  fontSize: 12.5,
  zIndex: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const sectionTitle: CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: colors.muted }
const row: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
const label: CSSProperties = { flex: 1 }
const slider: CSSProperties = { width: 110 }
const speedRow: CSSProperties = { display: 'flex', gap: 6 }
const speedBtn: CSSProperties = { ...buttonBase, flex: 1, padding: '5px 0', fontSize: 12, textAlign: 'center' }
const speedBtnActive: CSSProperties = { ...buttonActive, flex: 1, padding: '5px 0', fontSize: 12, textAlign: 'center' }
const checkboxRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

const SPEED_OPTIONS: { key: AnimSpeed; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'fast', label: 'Fast' },
  { key: 'instant', label: 'Instant' },
]

const VOLUME_ROWS: { key: 'master' | 'sfx' | 'voice' | 'music'; label: string }[] = [
  { key: 'master', label: 'Master' },
  { key: 'sfx', label: 'SFX' },
  { key: 'voice', label: 'Voice' },
  { key: 'music', label: 'Music' },
]

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsOpen)
  const helpOpen = useUiStore((s) => s.helpOpen)
  const { settings, setVolume, setMuted } = useAudioSettings(audio)
  const animSpeed = usePresentationSettings((s) => s.animSpeed)
  const diceOn = usePresentationSettings((s) => s.diceOn)
  const ambientOn = usePresentationSettings((s) => s.ambientOn)
  const setAnimSpeed = usePresentationSettings((s) => s.setAnimSpeed)
  const setDiceOn = usePresentationSettings((s) => s.setDiceOn)
  const setAmbientOn = usePresentationSettings((s) => s.setAmbientOn)

  if (!open) return null
  // Sits below the Keys popover when both happen to be open at once (same top-right corner).
  const wrap: CSSProperties = { ...wrapBase, top: helpOpen ? 260 : 56 }

  return (
    <div style={wrap} data-testid="settings-panel">
      <div style={sectionTitle}>Audio</div>
      <label style={checkboxRow}>
        <input type="checkbox" checked={settings.muted} onChange={(e) => setMuted(e.target.checked)} data-testid="settings-mute" />
        <span>Mute all sound</span>
      </label>
      {VOLUME_ROWS.map(({ key, label: rowLabel }) => (
        <div style={row} key={key}>
          <span style={{ ...label, fontFamily: fontStack }}>{rowLabel}</span>
          <input
            style={slider}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings[key]}
            disabled={settings.muted}
            onChange={(e) => setVolume(key, Number(e.target.value))}
            data-testid={`settings-volume-${key}`}
          />
        </div>
      ))}

      <div style={sectionTitle}>Presentation</div>
      <div>
        <div style={mutedText}>Animation speed</div>
        <div style={speedRow}>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              style={animSpeed === opt.key ? speedBtnActive : speedBtn}
              onClick={() => setAnimSpeed(opt.key)}
              data-testid={`settings-speed-${opt.key}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <label style={checkboxRow}>
        <input type="checkbox" checked={diceOn} onChange={(e) => setDiceOn(e.target.checked)} data-testid="settings-dice-on" />
        <span>Dice animation</span>
      </label>
      <label style={checkboxRow}>
        <input type="checkbox" checked={ambientOn} onChange={(e) => setAmbientOn(e.target.checked)} data-testid="settings-ambient-on" />
        <span>Ambient battlefield sound</span>
      </label>
    </div>
  )
}
