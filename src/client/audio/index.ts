// Public surface of the client audio module. Usage, once someone wires it into the app shell:
//
//   import { audio } from './audio'
//   audio.attachAutoUnlock()          // once, at app start — unlocks on the player's first click/tap/key
//   audio.setAmbientEnabled(true)     // starts the battlefield bed once unlocked
//   audio.play('ui-click')            // one-shot SFX/voice; volume/detune jitter optional
//   playEventSounds(audio, newEvents, humanSeat)   // engine events -> sounds, see eventSounds.ts
//
// The singleton is created once per page load; every consumer should import `audio` from here
// rather than constructing their own AudioManager.

import { AudioManager, preloadAll } from './manager'

export const audio = new AudioManager()
preloadAll(audio)

export { AudioManager, preloadAll } from './manager'
export type { PlayOptions } from './manager'
export { loadAudioSettings, saveAudioSettings, DEFAULT_AUDIO_SETTINGS } from './settings'
export type { AudioSettings } from './settings'
export {
  ALL_SOUND_IDS,
  SFX_IDS,
  VOICE_IDS,
  MUSIC_IDS,
  LOOPING_SOUNDS,
  channelFor,
  audioUrl,
} from './manifest'
export type { SoundId, SfxId, VoiceId, MusicId, SoundChannel } from './manifest'
export { soundsForEvent, playEventSounds, endGameVoiceLine } from './eventSounds'
export type { EventSound } from './eventSounds'
export { useAudioSettings } from './useAudioSettings'
