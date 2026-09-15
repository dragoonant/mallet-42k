// Generates the audio assets listed in tools/audio-manifest.json into public/audio/<id>.mp3 via the
// ElevenLabs API. Idempotent: any file that already exists on disk is skipped, so reruns never
// re-spend credits on assets that already landed. Run with:
//   export ELEVENLABS_API_KEY="..."
//   npx tsx tools/gen-audio.ts
//
// Owned by the audio task (tools/gen-audio.ts, tools/audio-manifest.json, public/audio/**,
// src/client/audio/**). Never print, log, or write the API key anywhere — it is read from the
// environment only.

import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const MANIFEST_PATH = join(REPO_ROOT, 'tools', 'audio-manifest.json')
const OUT_DIR = join(REPO_ROOT, 'public', 'audio')

// Hard budget for this generation run, in ElevenLabs "credits" (the character_count unit shared by
// both the sound-generation and text-to-speech endpoints on this account). This is a ceiling on
// spend for THIS run, independent of whatever the account's total remaining balance is.
const RUN_BUDGET_CREDITS = 9000
// Stop starting new generations once fewer than this many credits are left in the run budget, since
// we can't know a request's exact cost until after it completes.
const SAFETY_MARGIN_CREDITS = 200

interface SfxItem {
  id: string
  kind: 'sfx'
  prompt: string
  durationSeconds: number
  promptInfluence: number
  loop?: boolean
}

interface VoiceItem {
  id: string
  kind: 'voice'
  text: string
}

type ManifestItem = SfxItem | VoiceItem

interface Manifest {
  voice: { voiceId: string; voiceName: string; modelId: string }
  items: ManifestItem[]
}

interface Subscription {
  character_count: number
  character_limit: number
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY is not set. Export it from the token file before running this script.')
  }
  return key
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The API rate-limits bursts (429 rate_limited) well under our credit budget, so every call — sound
// generation, TTS, and the subscription check used for ground-truth spend — goes through this retry
// wrapper with exponential backoff instead of failing the whole run.
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let attempt = 0
  for (;;) {
    attempt++
    try {
      return await fn()
    } catch (err) {
      const rateLimited = err instanceof Error && err.message.includes('429')
      if (!rateLimited || attempt >= maxAttempts) throw err
      const backoffMs = 1000 * 2 ** (attempt - 1)
      console.log(`[gen-audio] ${label} rate-limited, retrying in ${backoffMs}ms (attempt ${attempt}/${maxAttempts})`)
      await sleep(backoffMs)
    }
  }
}

async function fetchSubscription(key: string): Promise<Subscription> {
  return withRetry('subscription check', async () => {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': key },
    })
    if (!res.ok) throw new Error(`GET /v1/user/subscription failed: ${res.status} ${await res.text()}`)
    return (await res.json()) as Subscription
  })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && s.size > 0
  } catch {
    return false
  }
}

async function generateSfx(key: string, item: SfxItem): Promise<Buffer> {
  return withRetry(`sound-generation "${item.id}"`, async () => {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: item.prompt,
        duration_seconds: item.durationSeconds,
        prompt_influence: item.promptInfluence,
      }),
    })
    if (!res.ok) throw new Error(`sound-generation "${item.id}" failed: ${res.status} ${await res.text()}`)
    return Buffer.from(await res.arrayBuffer())
  })
}

async function generateVoice(key: string, voiceId: string, modelId: string, item: VoiceItem): Promise<Buffer> {
  return withRetry(`text-to-speech "${item.id}"`, async () => {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text, model_id: modelId }),
      },
    )
    if (!res.ok) throw new Error(`text-to-speech "${item.id}" failed: ${res.status} ${await res.text()}`)
    return Buffer.from(await res.arrayBuffer())
  })
}

async function main(): Promise<void> {
  const key = apiKey()
  const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(MANIFEST_PATH, 'utf8')) as Manifest

  await mkdir(OUT_DIR, { recursive: true })

  const before = await fetchSubscription(key)
  const remainingOnAccount = before.character_limit - before.character_count
  console.log(
    `[gen-audio] account credits before: ${before.character_count}/${before.character_limit} (${remainingOnAccount} remaining) — run budget ${RUN_BUDGET_CREDITS}`,
  )

  let spentThisRun = 0
  let lastKnownCount = before.character_count
  let generated = 0
  let skipped = 0
  let stoppedForBudget = false

  for (const item of manifest.items) {
    const outPath = join(OUT_DIR, `${item.id}.mp3`)
    if (await fileExists(outPath)) {
      skipped++
      continue
    }

    if (spentThisRun >= RUN_BUDGET_CREDITS - SAFETY_MARGIN_CREDITS) {
      console.log(`[gen-audio] stopping: ${spentThisRun} credits spent this run, budget is ${RUN_BUDGET_CREDITS} — "${item.id}" and later items skipped`)
      stoppedForBudget = true
      break
    }

    try {
      const audio =
        item.kind === 'sfx'
          ? await generateSfx(key, item)
          : await generateVoice(key, manifest.voice.voiceId, manifest.voice.modelId, item)
      await writeFile(outPath, audio)
      generated++

      // Space out requests — the account rate-limits bursts well under our credit budget.
      await sleep(1500)

      // Ground truth for spend: re-read the account's character_count rather than estimating.
      const after = await fetchSubscription(key)
      const delta = after.character_count - lastKnownCount
      lastKnownCount = after.character_count
      spentThisRun += Math.max(0, delta)
      console.log(`[gen-audio] generated ${item.id}.mp3 (${item.kind}, +${delta} credits, ${spentThisRun}/${RUN_BUDGET_CREDITS} spent this run)`)
      await sleep(1500)
    } catch (err) {
      console.error(`[gen-audio] FAILED "${item.id}": ${err instanceof Error ? err.message : String(err)}`)
      await sleep(1500)
    }
  }

  const after = await fetchSubscription(key)
  console.log(
    `[gen-audio] account credits after: ${after.character_count}/${after.character_limit} (${after.character_limit - after.character_count} remaining)`,
  )
  console.log(`[gen-audio] done: ${generated} generated, ${skipped} already present, ${spentThisRun} credits spent this run${stoppedForBudget ? ' (stopped early for budget)' : ''}`)
}

main().catch((err) => {
  console.error('[gen-audio] fatal:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
