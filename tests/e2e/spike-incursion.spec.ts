import { test } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

// Measurement spike (docs/spike-incursion.md), not a regression test: loads ?spike=cp and ?spike=incursion (bot-vs-bot, driven
// to the end of deployment, then paused), samples ~10 s of rendering from two camera views, and writes e2e-out/spike-incursion.json.
// Headless Chromium here renders on CPU (SwiftShader): compare the ratios and the draw-call/triangle counts, not absolute FPS.

const PW_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
if (existsSync(PW_CHROME)) test.use({ launchOptions: { executablePath: PW_CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })
test.use({ viewport: { width: 1280, height: 720 } })
test.describe.configure({ mode: 'serial' })

type Perf = { fps: number; calls: number; triangles: number; geometries: number; textures: number; models: number }
const SAMPLE_MS = 10_000

async function measure(page: import('@playwright/test').Page, mode: 'cp' | 'incursion', shot: string) {
  await page.addInitScript(() => {
    const w = window as unknown as { __long: { n: number; ms: number } }
    w.__long = { n: 0, ms: 0 }
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { w.__long.n++; w.__long.ms += e.duration } }).observe({ entryTypes: ['longtask'] })
    } catch { /* unsupported */ }
  })
  await page.goto(`/?spike=${mode}`)
  await page.waitForSelector('canvas', { timeout: 60_000 })
  // bot-vs-bot until deployment ends (first phase after it), then freeze the driver so both scales sample a static battlefield
  await page.waitForFunction(() => {
    const m = (window as unknown as { __mallet?: { useGameStore: { getState(): { state: { phase: string } | null } } } }).__mallet
    const ph = m?.useGameStore.getState().state?.phase
    return !!ph && ph !== 'setup' && ph !== 'deployment'
  }, null, { timeout: 240_000, polling: 500 })
  await page.evaluate(() => { (window as unknown as { __spikeDriver: { paused: boolean } }).__spikeDriver.paused = true })
  await page.waitForTimeout(3000)

  const views: Record<string, unknown> = {}
  for (const [name, dist] of [['default', 0], ['wide', 110]] as const) {
    if (dist) await page.evaluate((d) => (window as unknown as { __malletCamera: { lookAt(x: number, z: number, d: number): void } }).__malletCamera.lookAt(0, 0, d), dist)
    await page.waitForTimeout(2000)
    if (name === 'default') await page.screenshot({ path: shot })
    const r = await page.evaluate(async (ms) => {
      const w = window as unknown as { __spikePerf?: Perf; __long: { n: number; ms: number } }
      const mem = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null
      const l0 = { ...w.__long }
      const samples: Perf[] = []
      const t0 = performance.now()
      await new Promise<void>((res) => {
        const t = setInterval(() => { if (w.__spikePerf) samples.push({ ...w.__spikePerf }); if (performance.now() - t0 >= ms) { clearInterval(t); res() } }, 250)
      })
      const avg = (k: keyof Perf) => samples.reduce((a, s) => a + s[k], 0) / Math.max(1, samples.length)
      return {
        samples: samples.length, fps: avg('fps'), calls: avg('calls'), triangles: avg('triangles'), geometries: avg('geometries'),
        textures: avg('textures'), models: samples.at(-1)?.models ?? 0, heapMB: mem() === null ? null : (mem() as number) / 1048576,
        longTasks: w.__long.n - l0.n, longTaskMs: w.__long.ms - l0.ms,
      }
    }, SAMPLE_MS)
    views[name] = r
  }
  return views
}

test('spike: render cost, CP vs Incursion', async ({ browser }) => {
  test.setTimeout(900_000)
  mkdirSync('e2e-out', { recursive: true })
  const out: Record<string, unknown> = {}
  for (const [mode, shot] of [['cp', 'e2e-out/spike-cp.png'], ['incursion', 'e2e-out/spike-incursion.png']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await ctx.newPage()
    out[mode] = await measure(page, mode, shot)
    await ctx.close()
  }
  writeFileSync('e2e-out/spike-incursion.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
})
