// Decodes public/audio/<prefix>*.mp3 in headless Chromium and prints RMS, peak and crest factor
// (peak / RMS) per file, so playback trims are measured rather than guessed. A gunshot should have a
// crest of roughly 8+; ~2 means the transient was squashed flat. Run with:
//   npx tsx tools/measure-audio.ts wpn-
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const dir = join(import.meta.dirname, '..', 'public', 'audio')
const prefix = process.argv[2] ?? ''
const files = (await readdir(dir)).filter((f) => f.startsWith(prefix) && f.endsWith('.mp3')).sort()
const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of files) {
  const b64 = (await readFile(join(dir, f))).toString('base64')
  const r = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer)
    const ch = buf.getChannelData(0)
    let sum = 0, peak = 0
    for (const v of ch) { sum += v * v; peak = Math.max(peak, Math.abs(v)) }
    const rms = Math.sqrt(sum / ch.length)
    return { rms, peak, crest: peak / rms, dur: buf.duration }
  }, b64)
  console.log(`${f.replace('.mp3', '').padEnd(30)} rms ${r.rms.toFixed(3)} peak ${r.peak.toFixed(2)} crest ${r.crest.toFixed(1)} ${r.dur.toFixed(2)}s`)
}
await browser.close()
