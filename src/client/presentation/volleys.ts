// Turns one TargetsDeclared into per-weapon volleys for the vfx layer: one projectile per attack, each
// marked hit or miss. The director holds the volley until the attack's dice have played, so the hit/miss
// pattern comes from the sequence's own HitRolled events (one per attack die, carrying weaponId +
// targetUnitId), and the models the attack struck each get a shot that lands on them. Only when no hit
// rolls are known is the pattern estimated from the weapon's own Ballistic Skill instead.
import type { GameEvent, GameState } from '@/engine'
import { unitModels } from '@/engine'
import type { DataBundle, WeaponData } from '@/data/types'
import { vfxFamily, type VfxFamily } from '../weaponFlavour'
import type { VolleyShot } from '../vfx/types'

type TargetsDeclared = Extract<GameEvent, { type: 'TargetsDeclared' }>

export interface PlannedVolley {
  family: VfxFamily
  shots: VolleyShot[]
  /** Every firing model of the group, so the caller can turn them to face the target. */
  shooterModelIds: string[]
  source: 'per-attack' | 'estimated'
}

/** Average attack count of a dice expression ('2', 'D3', 'D6+1', '2D6'). */
export function averageAttacks(a: number | string | undefined): number {
  if (typeof a === 'number') return Math.max(1, a)
  if (!a) return 1
  const m = /^(\d*)D(\d+)(?:\+(\d+))?$/i.exec(a.trim())
  if (!m) return Math.max(1, Number.parseInt(a, 10) || 1)
  const n = m[1] ? Number(m[1]) : 1
  return Math.max(1, Math.round((n * (Number(m[2]) + 1)) / 2 + (m[3] ? Number(m[3]) : 0)))
}

/** Chance a shot of this weapon hits, from its skill target (null skill = auto-hit, e.g. flame templates). */
export function hitChance(weapon: WeaponData | undefined): number {
  if (!weapon || weapon.skill === null || weapon.skill === undefined) return 1
  return Math.min(1, Math.max(1 / 6, (7 - weapon.skill) / 6))
}

/** A model the attack actually struck (an allocated wound, saved or not, or a mortal wound) and what to
 *  play when the shot aimed at it lands. */
export interface StruckModel {
  modelId: string
  onImpact: () => void
}

export interface PlanOptions {
  /** Struck models by `weaponId|targetUnitId`. Each gets its own landing shot; the entries used are deleted. */
  struck?: Map<string, StruckModel[]>
  /** A group with no hit rolls fires only its struck models' shots instead of estimating a volley (its
   *  dice are in and it already fired, or it never rolled). */
  rolledOnly?: boolean
}

/** True for slot `i` of `total` when `count` marks are spread evenly over the slots. */
function spread(i: number, count: number, total: number): boolean {
  return Math.floor(((i + 1) * count) / total) > Math.floor((i * count) / total)
}

export function planVolleys(e: TargetsDeclared, rest: GameEvent[], from: GameState, to: GameState, bundle: DataBundle | null, faction: string, opts: PlanOptions = {}): PlannedVolley[] {
  const groups = new Map<string, { weaponId: string; targetUnitId: string; shooters: string[] }>()
  for (const t of e.targets) {
    const key = `${t.weaponId}|${t.targetUnitId}`
    const g = groups.get(key) ?? { weaponId: t.weaponId, targetUnitId: t.targetUnitId, shooters: [] }
    g.shooters.push(t.modelId)
    groups.set(key, g)
  }

  // Hit and miss counts by weapon+target, from the attack sequence's own HitRolled events (a Sustained Hits
  // critical adds its extra hits).
  const rolled = new Map<string, { hits: number; misses: number }>()
  for (const ev of rest) {
    if (ev.type === 'AttackSequenceEnded' || ev.type === 'TargetsDeclared') break
    if (ev.type !== 'HitRolled') continue
    const key = `${ev.attack.weaponId}|${ev.attack.targetUnitId}`
    const c = rolled.get(key) ?? { hits: 0, misses: 0 }
    if (ev.hit) c.hits += 1 + ev.extraHits
    else c.misses++
    rolled.set(key, c)
  }

  const out: PlannedVolley[] = []
  for (const [key, g] of groups) {
    // Survivors take the shots that didn't wound; a unit wiped out by this attack is only in `from`.
    const targetModels = unitModels(to, g.targetUnitId).length > 0 ? unitModels(to, g.targetUnitId) : unitModels(from, g.targetUnitId)
    if (targetModels.length === 0) continue
    const weapon = bundle?.weapons[g.weaponId]
    const family = vfxFamily(g.weaponId, weapon, faction)
    const struck = opts.struck?.get(key) ?? []
    opts.struck?.delete(key)
    let counts = rolled.get(key)
    let source: PlannedVolley['source'] = 'per-attack'
    if (!counts && opts.rolledOnly) {
      // Already fired: a wound allocated afterwards (the defender picking models one at a time) still gets
      // a shot of its own; with nothing struck there is nothing left to fire.
      if (struck.length === 0) continue
      counts = { hits: 0, misses: 0 }
    }
    if (!counts) {
      source = 'estimated'
      const total = Math.max(g.shooters.length, Math.round(g.shooters.length * averageAttacks(weapon?.A)))
      const p = hitChance(weapon)
      // Evenly spread (low-discrepancy) so the estimate does not depend on randomness.
      const hits = Array.from({ length: total }, (_, i) => (i * 0.6180339887) % 1 < p).filter(Boolean).length
      counts = { hits, misses: total - hits }
    }
    // Every struck model gets a landing shot of its own, even past the rolled hit count (mortal wounds).
    const hitCount = Math.max(counts.hits, struck.length)
    const total = hitCount + counts.misses
    const shots: VolleyShot[] = []
    let h = 0
    for (let i = 0; i < total; i++) {
      const shooter = g.shooters[i % g.shooters.length]
      const firer = to.models[shooter]?.pos ?? from.models[shooter]?.pos
      if (!firer) continue
      const isHit = spread(i, hitCount, total)
      // Struck models' shots are spread through the hits, so models fall across the whole volley.
      const s = isHit && spread(h, struck.length, hitCount) ? struck[Math.floor((h * struck.length) / hitCount)] : null
      if (isHit) h++
      const target = (s ? (to.models[s.modelId]?.pos ?? from.models[s.modelId]?.pos) : null) ?? targetModels[i % targetModels.length].pos
      shots.push({ from: { x: firer.x, y: firer.y, z: firer.z }, to: { x: target.x, y: target.y, z: target.z }, hit: isHit, ...(s ? { onImpact: s.onImpact } : {}) })
    }
    if (shots.length > 0) out.push({ family, shots, shooterModelIds: g.shooters, source })
  }
  return out
}
