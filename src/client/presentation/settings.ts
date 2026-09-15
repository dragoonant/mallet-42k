// Persisted presentation settings (animation speed, dice animation on/off, ambient on/off) — the
// non-audio-mix half of the Settings popover (src/client/ui/SettingsPanel.tsx); volume/mute lives
// in src/client/audio/settings.ts and is read through useAudioSettings there instead. Kept separate
// from the director (director.ts) so the director can read the latest value on every event without
// re-subscribing, and so the settings panel can change it without importing the director.
import { create } from 'zustand'
import { setSpeed as setDiceSpeed, type DiceSpeed } from '../dice'
import { audio } from '../audio'

/** Same vocabulary as the dice tray's own speed (src/client/dice/types.ts) — 'instant' skips both
 *  the dice tumble and the director's own pacing gaps between events. */
export type AnimSpeed = DiceSpeed

export interface PresentationSettings {
  animSpeed: AnimSpeed
  diceOn: boolean
  ambientOn: boolean
}

const STORAGE_KEY = 'mallet42k:presentation-settings'
const DEFAULTS: PresentationSettings = { animSpeed: 'normal', diceOn: true, ambientOn: true }

function isAnimSpeed(v: unknown): v is AnimSpeed {
  return v === 'normal' || v === 'fast' || v === 'instant'
}

function load(): PresentationSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PresentationSettings>
    return {
      animSpeed: isAnimSpeed(parsed.animSpeed) ? parsed.animSpeed : DEFAULTS.animSpeed,
      diceOn: parsed.diceOn !== false,
      ambientOn: parsed.ambientOn !== false,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(s: PresentationSettings): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // best-effort only (quota, private browsing, no storage)
  }
}

interface PresentationSettingsStore extends PresentationSettings {
  setAnimSpeed(speed: AnimSpeed): void
  setDiceOn(on: boolean): void
  setAmbientOn(on: boolean): void
}

export const usePresentationSettings = create<PresentationSettingsStore>((set, get) => ({
  ...load(),

  setAnimSpeed(animSpeed) {
    setDiceSpeed(animSpeed)
    set({ animSpeed })
    persist({ animSpeed, diceOn: get().diceOn, ambientOn: get().ambientOn })
  },

  setDiceOn(diceOn) {
    set({ diceOn })
    persist({ animSpeed: get().animSpeed, diceOn, ambientOn: get().ambientOn })
  },

  setAmbientOn(ambientOn) {
    audio.setAmbientEnabled(ambientOn)
    set({ ambientOn })
    persist({ animSpeed: get().animSpeed, diceOn: get().diceOn, ambientOn })
  },
}))

// Apply the persisted values once at module init — a reload keeps the player's chosen pacing/
// ambient without needing the Settings panel opened first. Requesting ambient here is harmless
// before audio.unlock(): AudioManager just remembers the request and honours it once unlocked.
setDiceSpeed(usePresentationSettings.getState().animSpeed)
audio.setAmbientEnabled(usePresentationSettings.getState().ambientOn)
