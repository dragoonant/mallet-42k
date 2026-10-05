// Builds composite SFX from generated sources in tools/audio-src/ (decoded in headless Chromium,
// re-encoded with lamejs) for sounds a single ElevenLabs prompt couldn't get right:
//   wpn-boltgun     — the owner-approved single shot layered into a 4-round burst
//   wpn-arco-flails — the owner-approved chain lashing with a bullwhip crack appended
// Always overwrites its outputs; gen-audio.ts skips them because they already exist. Run with:
//   npx tsx tools/compose-audio.ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { Mp3Encoder } from '@breezystack/lamejs'

const SR = 44100
const root = join(import.meta.dirname, '..')
const src = (f: string) => join(root, 'tools', 'audio-src', f)
const out = (id: string) => join(root, 'public', 'audio', `${id}.mp3`)

const browser = await chromium.launch()
const page = await browser.newPage()
async function decode(path: string): Promise<Float32Array> {
  const b64 = (await readFile(path)).toString('base64')
  const data: number[] = await page.evaluate(async (d) => {
    const bytes = Uint8Array.from(atob(d), (c) => c.charCodeAt(0))
    const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer)
    return Array.from(buf.getChannelData(0))
  }, b64)
  return Float32Array.from(data)
}

function encode(pcm: Float32Array): Buffer {
  const enc = new Mp3Encoder(1, SR, 128)
  const i16 = Int16Array.from(pcm, (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767))))
  const parts: Uint8Array[] = []
  for (let i = 0; i < i16.length; i += 1152) parts.push(enc.encodeBuffer(i16.subarray(i, i + 1152)))
  parts.push(enc.flush())
  return Buffer.concat(parts.map((p) => Buffer.from(p)))
}

/** Index of the first sample within 30% of the peak, backed off 5 ms so the attack is kept. */
function onset(pcm: Float32Array): number {
  let peak = 0
  for (const v of pcm) peak = Math.max(peak, Math.abs(v))
  const i = pcm.findIndex((v) => Math.abs(v) >= peak * 0.3)
  return Math.max(0, i - Math.round(SR * 0.005))
}

/** tanh soft-clip keeps the summed transients punchy without hard clipping. */
const soft = (pcm: Float32Array) => pcm.map((v) => Math.tanh(v * 1.2) / Math.tanh(1.2))

function burst(shot: Float32Array, rounds: number, spacing: number, gains: number[]): Float32Array {
  const s = shot.subarray(onset(shot))
  const step = Math.round(SR * spacing)
  const outPcm = new Float32Array(step * (rounds - 1) + s.length)
  for (let r = 0; r < rounds; r++) for (let i = 0; i < s.length; i++) outPcm[r * step + i] += s[i] * gains[r] * 0.75
  return soft(outPcm)
}

function append(a: Float32Array, b: Float32Array, overlap: number): Float32Array {
  const bs = b.subarray(onset(b))
  const start = Math.max(0, a.length - Math.round(SR * overlap))
  const outPcm = new Float32Array(start + bs.length > a.length ? start + bs.length : a.length)
  outPcm.set(a)
  for (let i = 0; i < bs.length; i++) outPcm[start + i] += bs[i]
  return soft(outPcm)
}

await writeFile(out('wpn-boltgun'), encode(burst(await decode(src('boltgun-shot.mp3')), 4, 0.2, [1, 0.92, 0.97, 0.9])))
await writeFile(out('wpn-arco-flails'), encode(append(await decode(src('arco-flails-chains.mp3')), await decode(src('whip-crack.mp3')), 0.15)))
await browser.close()
console.log('[compose-audio] wrote wpn-boltgun, wpn-arco-flails')
