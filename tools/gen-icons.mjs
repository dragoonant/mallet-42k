// Renders the app icon (an SD-style mallet over a dark disc) to public/icons/*.png with Playwright's chromium.
// Usage: node tools/gen-icons.mjs
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url))
mkdirSync(outDir, { recursive: true })

// Accent colours from src/client/ui/theme.ts.
const ACCENT = '#f5d95a'
const PLAYER_A = '#4fb0ff'
const BG = '#0a0a10'

// 512x512 design space. `scale` shrinks the artwork toward the centre for the maskable safe zone.
const mark = (scale) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="214" fill="#161826" stroke="${PLAYER_A}" stroke-width="12"/>
    <g transform="rotate(-38 256 256)">
      <rect x="236" y="150" width="40" height="250" rx="14" fill="#8a5a34" stroke="#2a1a0c" stroke-width="8"/>
      <rect x="236" y="330" width="40" height="22" fill="#6a4020"/>
      <rect x="150" y="96" width="212" height="104" rx="26" fill="${ACCENT}" stroke="#2a2410" stroke-width="10"/>
      <rect x="150" y="96" width="46" height="104" rx="22" fill="#d9b93a" stroke="#2a2410" stroke-width="10"/>
      <rect x="316" y="96" width="46" height="104" rx="22" fill="#d9b93a" stroke="#2a2410" stroke-width="10"/>
      <rect x="170" y="112" width="172" height="20" rx="10" fill="#fff6c2" opacity="0.7"/>
    </g>
    <text x="256" y="452" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="64" fill="${ACCENT}" stroke="#0a0a10" stroke-width="6" paint-order="stroke">42K</text>
  </g>`

const svg = (scale, bleed) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${bleed ? BG : 'none'}"/>${mark(scale)}</svg>`

const jobs = [
  { file: 'icon-180.png', size: 180, scale: 1, bleed: true },
  { file: 'icon-192.png', size: 192, scale: 1, bleed: true },
  { file: 'icon-512.png', size: 512, scale: 1, bleed: true },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.78, bleed: true },
]

const browser = await chromium.launch()
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.size, height: j.size } })
    await page.setContent(`<html><body style="margin:0;background:${BG}"><div style="width:${j.size}px;height:${j.size}px">${svg(j.scale, j.bleed).replace('width="512" height="512"', `width="${j.size}" height="${j.size}"`)}</div></body></html>`)
    await page.screenshot({ path: outDir + j.file, clip: { x: 0, y: 0, width: j.size, height: j.size } })
    await page.close()
    console.log('wrote', j.file)
  }
} finally {
  await browser.close()
}
