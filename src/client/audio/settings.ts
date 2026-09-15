// Volume/mute settings, persisted to localStorage so a player's mix survives a reload. Read/written
// only through loadAudioSettings/saveAudioSettings — the AudioManager (manager.ts) is the only other
// module that should touch the storage key.

export interface AudioSettings {
  master: number
  sfx: number
  voice: number
  music: number
  muted: boolean
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 1,
  sfx: 1,
  voice: 1,
  music: 0.6,
  muted: false,
}

const STORAGE_KEY = 'mallet42k:audio-settings'

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function loadAudioSettings(): AudioSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_AUDIO_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AudioSettings>
    return {
      master: clamp01(parsed.master ?? DEFAULT_AUDIO_SETTINGS.master),
      sfx: clamp01(parsed.sfx ?? DEFAULT_AUDIO_SETTINGS.sfx),
      voice: clamp01(parsed.voice ?? DEFAULT_AUDIO_SETTINGS.voice),
      music: clamp01(parsed.music ?? DEFAULT_AUDIO_SETTINGS.music),
      muted: parsed.muted === true,
    }
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // best-effort only (quota, private browsing, no storage) — nothing to surface here
  }
}
