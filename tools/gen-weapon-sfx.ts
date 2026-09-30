// Synthesises weapon SFX into public/audio/<id>.mp3 from a physical layer model, as an alternative
// to the ElevenLabs generation in tools/gen-audio.ts. Run with:
//   npx tsx tools/gen-weapon-sfx.ts            # write every sound below
//   npx tsx tools/gen-weapon-sfx.ts bolter-burst
//
// Why a second generator: the ElevenLabs 'bolter-burst' came back squashed flat (owner playtest:
// "sounds more like a silenced pistol than a bolt gun"). Measured, it had a crest factor of 2.2 —
// peak barely above its own RMS, i.e. a clipped continuous blob with no transient — where a real
// gunshot is 8-20 and its whole character lives in that spike. Prompting can't reliably fix dynamics,
// so this builds the shot the way a sound designer layers one: crack, snap, punch, body, sub thump,
// room wash, and the bolt cycling between rounds, then limits with a soft knee that leaves the
// transient intact.
//
// Unlike gen-audio.ts this ALWAYS overwrites its targets (it spends nothing and is deterministic —
// same seed, same bytes). 'bolter-burst' is still listed in tools/audio-manifest.json, so deleting
// the file and running gen-audio.ts regenerates the ElevenLabs version instead; whichever lands in
// public/audio wins. Ids must exist in src/client/audio/manifest.ts.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Mp3Encoder } from '@breezystack/lamejs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'audio')

const SR = 44100
const KBPS = 128

// ---------- deterministic noise ----------
// xorshift32 rather than Math.random so a rerun writes byte-identical audio and a regenerated asset
// shows up as "no change" in git unless the recipe below actually changed.
let seed = 0x2545f491
function resetNoise(): void {
  seed = 0x2545f491
}
function noise(): number {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  seed |= 0
  return ((seed >>> 0) / 0xffffffff) * 2 - 1
}

// ---------- layer primitives ----------
type FilterSpec = { type: 'lp' | 'hp' | 'bp'; fc: number; q?: number }

/** Filtered noise burst with an exponential decay of time-constant `tau` (seconds). 'hp' is two
 *  one-pole stages, because a single pole leaves a gunshot's crack too dull to hear over the body. */
function noiseLayer(out: Float32Array, t0: number, o: { tau: number; gain: number; filter: FilterSpec }): void {
  const n = Math.ceil(o.tau * 6 * SR)
  const a = 1 - Math.exp((-2 * Math.PI * o.filter.fc) / SR)
  const f = 2 * Math.sin((Math.PI * o.filter.fc) / SR)
  const q = 1 / (o.filter.q ?? 0.8)
  let lp1 = 0, lp2 = 0, band = 0, low = 0
  const start = Math.round(t0 * SR)
  for (let i = 0; i < n; i++) {
    const idx = start + i
    if (idx >= out.length) break
    const x = noise()
    let y: number
    if (o.filter.type === 'lp') {
      lp1 += (x - lp1) * a
      y = lp1
    } else if (o.filter.type === 'hp') {
      lp1 += (x - lp1) * a
      const h1 = x - lp1
      lp2 += (h1 - lp2) * a
      y = h1 - lp2
    } else {
      // Chamberlin state-variable band-pass — cheap, stable well below Nyquist.
      const high = x - low - q * band
      band += f * high
      low += f * band
      y = band
    }
    out[idx] += y * o.gain * Math.exp(-i / (o.tau * SR))
  }
}

/** Exponential pitch sweep — the muzzle blast's chest thump, falling as the pressure wave expands. */
function sweep(out: Float32Array, t0: number, o: { f1: number; f2: number; dur: number; tau: number; gain: number }): void {
  const n = Math.ceil(o.tau * 6 * SR)
  const start = Math.round(t0 * SR)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const idx = start + i
    if (idx >= out.length) break
    const u = Math.min(1, i / (o.dur * SR))
    phase += (2 * Math.PI * (o.f1 * Math.pow(o.f2 / o.f1, u))) / SR
    out[idx] += Math.sin(phase) * o.gain * Math.exp(-i / (o.tau * SR))
  }
}

/** Inharmonic metal ring — the bolt//breech cycling after each round. */
function metallic(out: Float32Array, t0: number, o: { partials: number[]; tau: number; gain: number }): void {
  const n = Math.ceil(o.tau * 6 * SR)
  const start = Math.round(t0 * SR)
  for (let i = 0; i < n; i++) {
    const idx = start + i
    if (idx >= out.length) break
    let v = 0
    for (const f of o.partials) v += Math.sin((2 * Math.PI * f * i) / SR)
    out[idx] += (v / o.partials.length) * o.gain * Math.exp(-i / (o.tau * SR))
  }
}

/** Soft knee above KNEE only, then normalise to `peak`. A full-range tanh (or the hard clip the
 *  ElevenLabs asset arrived with) flattens exactly the spike that makes a gunshot a gunshot. */
function finish(out: Float32Array, peakTarget = 0.95): Float32Array {
  const KNEE = 0.72
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i])
    if (a > KNEE) out[i] = Math.sign(out[i]) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)))
    peak = Math.max(peak, Math.abs(out[i]))
  }
  const g = peakTarget / (peak || 1)
  for (let i = 0; i < out.length; i++) out[i] *= g
  const fade = Math.round(0.004 * SR) // 4ms, so the encoder has no edge to ring on
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade
  return out
}

// ---------- the sounds ----------

/** One bolt round: a .75 calibre mass-reactive shell — deep report, hard crack, mechanical cycling. */
function boltShot(out: Float32Array, t0: number, level: number, pitch: number): void {
  noiseLayer(out, t0, { tau: 0.0016, gain: 1.6 * level, filter: { type: 'hp', fc: 3000 } })
  noiseLayer(out, t0, { tau: 0.0035, gain: 0.7 * level, filter: { type: 'bp', fc: 7000, q: 2.0 } })
  noiseLayer(out, t0 + 0.0008, { tau: 0.008, gain: 1.2 * level, filter: { type: 'bp', fc: 4200 * pitch, q: 1.5 } })
  noiseLayer(out, t0 + 0.001, { tau: 0.014, gain: 1.3 * level, filter: { type: 'bp', fc: 1650 * pitch, q: 0.9 } })
  noiseLayer(out, t0 + 0.001, { tau: 0.032, gain: 1.5 * level, filter: { type: 'bp', fc: 820 * pitch, q: 0.7 } })
  noiseLayer(out, t0 + 0.002, { tau: 0.055, gain: 0.62 * level, filter: { type: 'bp', fc: 300 * pitch, q: 0.7 } })
  sweep(out, t0 + 0.002, { f1: 165 * pitch, f2: 48, dur: 0.08, tau: 0.042, gain: 0.55 * level })
  noiseLayer(out, t0 + 0.006, { tau: 0.16, gain: 0.18 * level, filter: { type: 'lp', fc: 2200 } })
  metallic(out, t0 + 0.045, { partials: [1900 * pitch, 2750 * pitch, 4100 * pitch], tau: 0.02, gain: 0.22 * level })
}

/** Three rounds at ~610rpm, each slightly off the last in level and pitch so the burst doesn't read
 *  as one sample pasted three times. */
function bolterBurst(): Float32Array {
  const out = new Float32Array(Math.round(0.86 * SR))
  boltShot(out, 0.0, 1.0, 1.0)
  boltShot(out, 0.098, 0.93, 1.05)
  boltShot(out, 0.196, 0.97, 0.96)
  noiseLayer(out, 0.24, { tau: 0.28, gain: 0.12, filter: { type: 'lp', fc: 1100 } }) // room decay
  return finish(out)
}

const SOUNDS: Record<string, () => Float32Array> = {
  'bolter-burst': bolterBurst,
}

// ---------- mp3 ----------
function encodeMp3(samples: Float32Array): Buffer {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)))
  const encoder = new Mp3Encoder(1, SR, KBPS)
  const chunks: Buffer[] = []
  const BLOCK = 1152 // one MP3 frame's worth of samples
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const buf = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK))
    if (buf.length) chunks.push(Buffer.from(buf))
  }
  const end = encoder.flush()
  if (end.length) chunks.push(Buffer.from(end))
  return Buffer.concat(chunks)
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2)
  const ids = requested.length > 0 ? requested : Object.keys(SOUNDS)
  const unknown = ids.filter((id) => !SOUNDS[id])
  if (unknown.length > 0) {
    throw new Error(`no recipe for: ${unknown.join(', ')} (have: ${Object.keys(SOUNDS).join(', ')})`)
  }
  await mkdir(OUT_DIR, { recursive: true })
  for (const id of ids) {
    resetNoise()
    const mp3 = encodeMp3(SOUNDS[id]())
    const path = join(OUT_DIR, `${id}.mp3`)
    await writeFile(path, mp3)
    console.log(`[gen-weapon-sfx] ${id}.mp3  ${(mp3.length / 1024).toFixed(1)}KB`)
  }
}

main().catch((err: unknown) => {
  console.error('[gen-weapon-sfx] failed:', err)
  process.exitCode = 1
})
