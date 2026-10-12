// Pure helpers + cached textures for the objective marker visuals (board/Objectives.tsx).
import * as THREE from 'three'
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, withinObjectiveRange, type GameState, type Model, type Objective } from '@/engine'

/** Rule boundary from the marker centre: range is measured from the marker's EDGE (engine withinObjectiveRange). */
export function zoneRadiusOf(state: GameState): { range: number; markerRadius: number; zone: number } {
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const markerRadius = state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  return { range, markerRadius, zone: range + markerRadius }
}

export interface Footing {
  modelId: string
  pos: { x: number; y: number; z: number }
  facing: number
  base: Model['base']
}

/** (model, objective) pairs where the model is in range by the engine's own rule. */
export function modelsInRange(state: GameState, feet: Footing[], objectives: Objective[]): { foot: Footing; objectiveId: string }[] {
  const { range, markerRadius } = zoneRadiusOf(state)
  const out: { foot: Footing; objectiveId: string }[] = []
  for (const foot of feet) for (const o of objectives) if (withinObjectiveRange(foot, o, 0, range, markerRadius)) out.push({ foot, objectiveId: o.id })
  return out
}

/** Dashed ring: `count` arcs of the band [r - w/2, r + w/2], each covering `fill` of its slot. Flat in the XZ plane. */
export function dashedRingGeometry(r: number, w: number, count: number, fill: number): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  const sub = 4
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2
    const a1 = a0 + (fill / count) * Math.PI * 2
    const base = pos.length / 3
    for (let s = 0; s <= sub; s++) {
      const a = a0 + ((a1 - a0) * s) / sub
      const c = Math.cos(a), sn = Math.sin(a)
      pos.push(c * (r - w / 2), 0, sn * (r - w / 2), c * (r + w / 2), 0, sn * (r + w / 2))
    }
    for (let s = 0; s < sub; s++) {
      const k = base + s * 2
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

const cache = new Map<string, THREE.Texture>()

/** Worn bronze token face with an original engraved glyph (ringed lozenge with eight spokes) and a tinted core. */
export function tokenTexture(core: string): THREE.Texture {
  const hit = cache.get(`tok:${core}`)
  if (hit) return hit
  const S = 256, c = S / 2
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(c, c, 10, c, c, c)
  grad.addColorStop(0, '#6a5230'); grad.addColorStop(0.7, '#5a4428'); grad.addColorStop(1, '#2f2416')
  g.fillStyle = grad
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill()
  // weathering speckle (deterministic)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (c - 4)
    g.fillStyle = rnd() < 0.5 ? 'rgba(20,14,8,0.35)' : 'rgba(190,150,90,0.18)'
    g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, 2)
  }
  g.strokeStyle = '#c9a15a'; g.lineWidth = 7
  g.beginPath(); g.arc(c, c, c - 9, 0, Math.PI * 2); g.stroke()
  g.strokeStyle = '#1e160c'; g.lineWidth = 3
  g.beginPath(); g.arc(c, c, c - 20, 0, Math.PI * 2); g.stroke()
  // engraved glyph: 8 spokes, a ring and a lozenge
  g.strokeStyle = '#1e160c'; g.lineWidth = 5; g.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    g.beginPath(); g.moveTo(c + Math.cos(a) * 64, c + Math.sin(a) * 64); g.lineTo(c + Math.cos(a) * (c - 30), c + Math.sin(a) * (c - 30)); g.stroke()
  }
  g.beginPath(); g.arc(c, c, 62, 0, Math.PI * 2); g.stroke()
  g.strokeStyle = '#d6b36c'; g.lineWidth = 2
  g.beginPath(); g.arc(c, c, 62, 0, Math.PI * 2); g.stroke()
  g.fillStyle = '#1b140a'
  g.beginPath(); g.moveTo(c, c - 46); g.lineTo(c + 32, c); g.lineTo(c, c + 46); g.lineTo(c - 32, c); g.closePath(); g.fill()
  // glowing core
  const glow = g.createRadialGradient(c, c, 2, c, c, 28)
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.35, core); glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow
  g.beginPath(); g.arc(c, c, 28, 0, Math.PI * 2); g.fill()
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(`tok:${core}`, t)
  return t
}

/** Vertical fade for the beacon column: opaque at the base, transparent at the top. */
export function beaconTexture(): THREE.Texture {
  const hit = cache.get('beacon')
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = 4; cv.height = 128
  const g = cv.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#000'); grad.addColorStop(1, '#fff')
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128)
  const t = new THREE.CanvasTexture(cv)
  cache.set('beacon', t)
  return t
}
