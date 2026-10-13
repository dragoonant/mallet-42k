// Scripted (no physics) throw trajectories for the dice test table. 1 unit = 1 inch, y up.
import { Matrix4, Quaternion, Vector3 } from 'three'

export const TRAY_W = 16
export const TRAY_H = 10
export const DIE = 0.6
export const HALF = DIE / 2
const UP = new Vector3(0, 1, 0)

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Local face normal for each pip value. Opposite faces sum to 7. */
export const FACE_NORMAL: Record<number, Vector3> = {
  1: new Vector3(0, 1, 0),
  6: new Vector3(0, -1, 0),
  3: new Vector3(1, 0, 0),
  4: new Vector3(-1, 0, 0),
  2: new Vector3(0, 0, 1),
  5: new Vector3(0, 0, -1),
}

export interface Plan {
  value: number
  start: Vector3
  end: Vector3
  qf: Quaternion
  axis: Vector3
  spin: number
  delay: number
  wobble: number
}

/** Segment boundaries (fractions of the throw) and arc peaks (inches) for the flight + 3 bounces. */
const CUM = [0, 0.4, 0.66, 0.85, 1]
const PEAKS = [2.6, 1.1, 0.42, 0.14]

export function layout(n: number) {
  const W = TRAY_W - 1.0
  const H = TRAY_H - 1.0
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (W / H))))
  const rows = Math.ceil(n / cols)
  const cell = Math.min(W / cols, H / rows, 1.7)
  return { cols, rows, cell, width: cols * cell, depth: rows * cell }
}

export function buildPlans(faces: number[], rnd: () => number, fixedSlots?: [number, number][]): Plan[] {
  const n = faces.length
  const { cols, rows, cell } = layout(n)
  const jitter = fixedSlots ? 0.08 : Math.max(0, (cell - 0.95) / 2) * 0.8
  const slots: [number, number][] = fixedSlots ? fixedSlots.slice() : []
  if (!fixedSlots)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) slots.push([(c - (cols - 1) / 2) * cell, (r - (rows - 1) / 2) * cell])
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return faces.map((value, i) => {
    const [sx, sz] = slots[i]
    const end = new Vector3(sx + (rnd() * 2 - 1) * jitter, 0, sz + (rnd() * 2 - 1) * jitter)
    const start = new Vector3(-TRAY_W / 2 - 4.5 - rnd() * 1.5, 3 + rnd() * 1.5, (rnd() * 2 - 1) * 2.5 + end.z * 0.3)
    const align = new Quaternion().setFromUnitVectors(FACE_NORMAL[value], UP)
    const yaw = new Quaternion().setFromAxisAngle(UP, rnd() * Math.PI * 2)
    const axis = new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()
    return {
      value,
      start,
      end,
      qf: yaw.multiply(align),
      axis,
      spin: Math.PI * (5 + rnd() * 5),
      delay: (i / Math.max(1, n)) * 0.22 + rnd() * 0.06,
      wobble: (rnd() * 2 - 1) * 0.5,
    }
  })
}

const _q = new Quaternion()
const _qs = new Quaternion()
const _m = new Matrix4()

/** Pose of a die at throw progress u in [0,1]; writes position + orientation. Ends exactly at plan.end/plan.qf. */
export function poseAt(plan: Plan, u: number, pos: Vector3, quat: Quaternion): void {
  const k = 1 - u
  _qs.setFromAxisAngle(plan.axis, plan.spin * Math.pow(k, 1.6))
  _q.copy(_qs).multiply(plan.qf)
  quat.copy(_q)
  // Rotated half-height so tumbling corners never sink into the felt.
  _m.makeRotationFromQuaternion(_q)
  const e = _m.elements
  const ext = HALF * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]))
  let i = 0
  while (i < 3 && u > CUM[i + 1]) i++
  const s = (u - CUM[i]) / (CUM[i + 1] - CUM[i])
  const arc = PEAKS[i] * 4 * s * (1 - s)
  const lift = i === 0 ? plan.start.y * (1 - s) : 0
  const f = 1 - Math.pow(k, 2.4)
  pos.set(
    plan.start.x + (plan.end.x - plan.start.x) * f,
    ext + arc + lift,
    plan.start.z + (plan.end.z - plan.start.z) * f + Math.sin(u * 9) * plan.wobble * k * k,
  )
}
