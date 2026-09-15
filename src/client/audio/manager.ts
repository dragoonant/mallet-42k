// Web Audio-backed sound manager for the client. A single AudioManager instance (the `audio` export
// from ./index) owns:
//  - a lazily-unlocked AudioContext (browsers block sound output before a user gesture; decoding can
//    happen earlier, so small SFX/voice lines are preloaded eagerly and only *playback* waits for
//    unlock),
//  - master/sfx/voice/music gain nodes so per-channel + master volume and mute persist and apply live,
//  - per-id throttling so a burst of identical triggers (e.g. 20 simultaneous shots) layers a
//    handful of instances instead of clipping/stacking all of them,
//  - the ambient battlefield loop, streamed through an <audio> element (not decoded into memory)
//    since it is the one long-running asset.
//
// This module does not know about GameEvent — see eventSounds.ts for the mapping — so it stays
// reusable for UI sounds (ui-click/ui-error) too.

import { ALL_SOUND_IDS, LOOPING_SOUNDS, SFX_IDS, VOICE_IDS, MUSIC_IDS, audioUrl, channelFor, type SoundChannel, type SoundId } from './manifest'
import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings, type AudioSettings } from './settings'

export interface PlayOptions {
  /** 0..1, multiplies the sound's channel volume. Defaults to 1. */
  volume?: number
  /** Max random pitch jitter in cents (+/-), applied per play so repeated triggers of the same
   *  sound don't phase-cancel into an obvious loop. Defaults to a small per-channel amount; pass 0
   *  to disable for a specific call (e.g. narrator lines, which should not warble). */
  detuneJitter?: number
}

// A single sound id playing more than this many times at once is dropped rather than layered
// further — this is what turns "20 simultaneous shots" into a few audible instances.
const MAX_CONCURRENT_PER_ID = 4
// Also floor how often the *same* id can (re)start, independent of concurrency, so a same-frame
// burst can't spike the mix.
const MIN_RETRIGGER_MS: Record<SoundChannel, number> = { sfx: 30, voice: 120, music: 0 }
const DEFAULT_JITTER_CENTS: Record<SoundChannel, number> = { sfx: 25, voice: 0, music: 0 }

interface ThrottleState {
  active: number
  lastStart: number
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export class AudioManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private channelGains: Partial<Record<SoundChannel, GainNode>> = {}

  private settings: AudioSettings = loadAudioSettings()
  private settingsListeners = new Set<(s: AudioSettings) => void>()

  private buffers = new Map<SoundId, AudioBuffer>()
  private loading = new Map<SoundId, Promise<AudioBuffer | null>>()
  private throttle = new Map<SoundId, ThrottleState>()

  private unlocked = false
  private unlockListenersAttached = false

  private ambientEl: HTMLAudioElement | null = null
  private ambientSource: MediaElementAudioSourceNode | null = null
  private ambientWanted = false

  /** Attaches one-time listeners so the first click/tap/keypress anywhere unlocks audio. Safe to
   *  call more than once (a no-op after the first). Call this once during app start-up. */
  attachAutoUnlock(target: EventTarget = typeof window !== 'undefined' ? window : ({} as EventTarget)): void {
    if (this.unlockListenersAttached || typeof window === 'undefined') return
    this.unlockListenersAttached = true
    const handler = () => {
      target.removeEventListener('pointerdown', handler)
      target.removeEventListener('keydown', handler)
      target.removeEventListener('touchstart', handler)
      void this.unlock()
    }
    target.addEventListener('pointerdown', handler, { once: true })
    target.addEventListener('keydown', handler, { once: true })
    target.addEventListener('touchstart', handler, { once: true })
  }

  /** Creates/resumes the AudioContext and starts the ambient loop if one was requested before
   *  unlock. Idempotent. Called automatically by attachAutoUnlock's listeners; expose it too so a
   *  "tap to enable sound" button can call it directly from a click handler. */
  async unlock(): Promise<void> {
    if (!this.ctx) this.ensureContext()
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // some browsers reject resume() outside a "fresh" gesture — the next real click will retry
      }
    }
    this.unlocked = this.ctx?.state === 'running'
    if (this.unlocked) {
      this.preload(SFX_IDS)
      this.preload(VOICE_IDS)
      if (this.ambientWanted) this.startAmbientPlayback()
    }
  }

  private ensureContext(): void {
    if (this.ctx || typeof window === 'undefined') return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.masterGain = this.ctx.createGain()
    this.masterGain.connect(this.ctx.destination)
    for (const channel of ['sfx', 'voice', 'music'] as const) {
      const gain = this.ctx.createGain()
      gain.connect(this.masterGain)
      this.channelGains[channel] = gain
    }
    this.applyGains()
  }

  private applyGains(): void {
    if (!this.masterGain) return
    const muted = this.settings.muted
    this.masterGain.gain.value = muted ? 0 : clamp01(this.settings.master)
    for (const channel of ['sfx', 'voice', 'music'] as const) {
      const gain = this.channelGains[channel]
      if (gain) gain.gain.value = clamp01(this.settings[channel])
    }
  }

  // ---------- preloading ----------

  /** Fetches + decodes the given ids into memory (skips any already cached/in-flight). Safe to call
   *  before unlock — decoding doesn't need a user gesture, only starting playback does. */
  preload(ids: readonly SoundId[]): void {
    for (const id of ids) void this.ensureBuffer(id)
  }

  private async ensureBuffer(id: SoundId): Promise<AudioBuffer | null> {
    if (LOOPING_SOUNDS.has(id)) return null // the ambient loop streams via <audio>, never decoded
    const cached = this.buffers.get(id)
    if (cached) return cached
    const inFlight = this.loading.get(id)
    if (inFlight) return inFlight

    const promise = (async () => {
      try {
        this.ensureContext()
        if (!this.ctx) return null
        const res = await fetch(audioUrl(id))
        if (!res.ok) throw new Error(`${res.status}`)
        const arrayBuffer = await res.arrayBuffer()
        const buffer = await this.ctx.decodeAudioData(arrayBuffer)
        this.buffers.set(id, buffer)
        return buffer
      } catch (err) {
        console.warn(`[audio] failed to load "${id}":`, err)
        return null
      } finally {
        this.loading.delete(id)
      }
    })()
    this.loading.set(id, promise)
    return promise
  }

  // ---------- one-shot playback ----------

  /** Plays a sound. No-ops (silently) before unlock, while a sound is still decoding, or once its
   *  per-id concurrency/retrigger throttle is hit — callers never need to check readiness first. */
  play(id: SoundId, opts: PlayOptions = {}): void {
    if (LOOPING_SOUNDS.has(id)) return // use setAmbientEnabled for the music loop
    const channel = channelFor(id)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const state = this.throttle.get(id) ?? { active: 0, lastStart: 0 }
    if (state.active >= MAX_CONCURRENT_PER_ID) return
    if (now - state.lastStart < MIN_RETRIGGER_MS[channel]) return

    const buffer = this.buffers.get(id)
    if (buffer) {
      this.playBuffer(id, channel, buffer, opts, state, now)
      return
    }
    // Not decoded yet (e.g. played before preload finished) — kick off loading and play once ready,
    // as long as it's still worth playing (best-effort; a slightly-late one-shot beats a silent one).
    void this.ensureBuffer(id).then((buf) => {
      if (buf && this.unlocked) this.play(id, opts)
    })
  }

  private playBuffer(id: SoundId, channel: SoundChannel, buffer: AudioBuffer, opts: PlayOptions, state: ThrottleState, now: number): void {
    if (!this.unlocked || !this.ctx) return
    const destination = this.channelGains[channel]
    if (!destination) return

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const jitter = opts.detuneJitter ?? DEFAULT_JITTER_CENTS[channel]
    if (jitter) source.detune.value = (Math.random() * 2 - 1) * jitter

    const gain = this.ctx.createGain()
    gain.gain.value = clamp01(opts.volume ?? 1)
    source.connect(gain).connect(destination)

    state.active++
    state.lastStart = now
    this.throttle.set(id, state)
    source.onended = () => {
      state.active = Math.max(0, state.active - 1)
      source.disconnect()
      gain.disconnect()
    }
    source.start()
  }

  // ---------- ambient music loop ----------

  /** Starts (true) or stops (false) the looping ambient battlefield bed. Streamed via a plain
   *  <audio> element rather than decoded, since it's the one ~20s asset. If audio isn't unlocked
   *  yet, the request is remembered and honoured as soon as unlock() runs. */
  setAmbientEnabled(enabled: boolean): void {
    this.ambientWanted = enabled
    if (!enabled) {
      this.ambientEl?.pause()
      return
    }
    if (this.unlocked) this.startAmbientPlayback()
  }

  private startAmbientPlayback(): void {
    this.ensureContext()
    if (!this.ctx) return
    const musicGain = this.channelGains.music
    if (!musicGain) return
    if (!this.ambientEl) {
      const el = new Audio(audioUrl(MUSIC_IDS[0]))
      el.loop = true
      el.crossOrigin = 'anonymous'
      this.ambientEl = el
      this.ambientSource = this.ctx.createMediaElementSource(el)
      this.ambientSource.connect(musicGain)
    }
    void this.ambientEl.play().catch(() => {
      // autoplay can still be refused in edge cases; the next unlock-triggering gesture retries
    })
  }

  // ---------- settings ----------

  getSettings(): AudioSettings {
    return this.settings
  }

  setMuted(muted: boolean): void {
    this.updateSettings({ ...this.settings, muted })
  }

  setVolume(channel: 'master' | SoundChannel, value: number): void {
    this.updateSettings({ ...this.settings, [channel]: clamp01(value) })
  }

  private updateSettings(next: AudioSettings): void {
    this.settings = next
    saveAudioSettings(next)
    this.applyGains()
    for (const listener of this.settingsListeners) listener(next)
  }

  /** Subscribes to settings changes (volume/mute); returns an unsubscribe function. For a React
   *  hook wrapper see useAudioSettings.ts. */
  onSettingsChange(listener: (settings: AudioSettings) => void): () => void {
    this.settingsListeners.add(listener)
    return () => this.settingsListeners.delete(listener)
  }

  /** True once the AudioContext is running and sound can actually be heard. */
  isUnlocked(): boolean {
    return this.unlocked
  }
}

/** Preloads everything (SFX + voice) eagerly; call after unlock, or rely on attachAutoUnlock which
 *  does this itself once the context is running. Exposed for callers that want to warm the cache
 *  ahead of unlock (decoding doesn't need a gesture). */
export function preloadAll(manager: AudioManager): void {
  manager.preload(ALL_SOUND_IDS.filter((id) => !LOOPING_SOUNDS.has(id)))
}

export { DEFAULT_AUDIO_SETTINGS }
