// React binding for the AudioManager's persisted volume/mute settings, for whichever settings panel
// (owned outside this task) wants to render sliders/a mute toggle. Not imported by anything in this
// task — provided so that wiring is a one-line `useAudioSettings(audio)` away.
import { useCallback, useSyncExternalStore } from 'react'
import type { AudioManager } from './manager'
import type { AudioSettings } from './settings'

export function useAudioSettings(audio: AudioManager): {
  settings: AudioSettings
  setVolume: (channel: 'master' | 'sfx' | 'voice' | 'music', value: number) => void
  setMuted: (muted: boolean) => void
} {
  const settings = useSyncExternalStore(
    useCallback((onChange) => audio.onSettingsChange(onChange), [audio]),
    () => audio.getSettings(),
    () => audio.getSettings(),
  )

  const setVolume = useCallback(
    (channel: 'master' | 'sfx' | 'voice' | 'music', value: number) => audio.setVolume(channel, value),
    [audio],
  )
  const setMuted = useCallback((muted: boolean) => audio.setMuted(muted), [audio])

  return { settings, setVolume, setMuted }
}
