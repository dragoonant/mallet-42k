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

/** How often to stop the game for a human-owned `commandReroll` offer (src/client/store/game.ts reads
 *  this to decide whether to auto-answer Pass instead of showing the prompt) — a single attack can
 *  otherwise raise 16+ of these in one round. 'always' is the pre-existing behaviour (every offer shown);
 *  'onlyWhenItMatters' (default) shows it only for rolls a player would actually consider re-rolling —
 *  see commandRerollMatters() in game.ts for the exact rules; 'never' auto-passes every offer (safe to do
 *  unconditionally: the engine never even raises the decision when the player can't afford Command
 *  Re-roll in the first place, so there's no affordability check left to make here). */
export type CommandRerollSetting = 'always' | 'onlyWhenItMatters' | 'never'

export interface PresentationSettings {
  animSpeed: AnimSpeed
  diceOn: boolean
  ambientOn: boolean
  commandRerollSetting: CommandRerollSetting
}

const STORAGE_KEY = 'mallet42k:presentation-settings'
const DEFAULTS: PresentationSettings = { animSpeed: 'normal', diceOn: true, ambientOn: true, commandRerollSetting: 'onlyWhenItMatters' }

function isAnimSpeed(v: unknown): v is AnimSpeed {
  return v === 'normal' || v === 'fast' || v === 'instant'
}

function isCommandRerollSetting(v: unknown): v is CommandRerollSetting {
  return v === 'always' || v === 'onlyWhenItMatters' || v === 'never'
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
      commandRerollSetting: isCommandRerollSetting(parsed.commandRerollSetting) ? parsed.commandRerollSetting : DEFAULTS.commandRerollSetting,
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
  setCommandRerollSetting(setting: CommandRerollSetting): void
}

export const usePresentationSettings = create<PresentationSettingsStore>((set, get) => ({
  ...load(),

  setAnimSpeed(animSpeed) {
    setDiceSpeed(animSpeed)
    set({ animSpeed })
    persist({ animSpeed, diceOn: get().diceOn, ambientOn: get().ambientOn, commandRerollSetting: get().commandRerollSetting })
  },

  setDiceOn(diceOn) {
    set({ diceOn })
    persist({ animSpeed: get().animSpeed, diceOn, ambientOn: get().ambientOn, commandRerollSetting: get().commandRerollSetting })
  },

  setAmbientOn(ambientOn) {
    audio.setAmbientEnabled(ambientOn)
    set({ ambientOn })
    persist({ animSpeed: get().animSpeed, diceOn: get().diceOn, ambientOn, commandRerollSetting: get().commandRerollSetting })
  },

  setCommandRerollSetting(commandRerollSetting) {
    set({ commandRerollSetting })
    persist({ animSpeed: get().animSpeed, diceOn: get().diceOn, ambientOn: get().ambientOn, commandRerollSetting })
  },
}))

// Apply the persisted values once at module init — a reload keeps the player's chosen pacing/
// ambient without needing the Settings panel opened first. Requesting ambient here is harmless
// before audio.unlock(): AudioManager just remembers the request and honours it once unlocked.
setDiceSpeed(usePresentationSettings.getState().animSpeed)
audio.setAmbientEnabled(usePresentationSettings.getState().ambientOn)
