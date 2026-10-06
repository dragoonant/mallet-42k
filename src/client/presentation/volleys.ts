// Turns one TargetsDeclared into per-weapon volleys for the vfx layer: one projectile per attack, each
// marked hit or miss. The engine rolls hits in later events of the same attack sequence (HitRolled, one
// per attack die, carrying weaponId + targetUnitId), so when those are in the batch the hit/miss pattern is
// exact. Dice can reach the store in a later batch than TargetsDeclared (a Command Re-roll window splits
// them), in which case the pattern is estimated from the weapon's own Ballistic Skill instead.
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

export function planVolleys(e: TargetsDeclared, rest: GameEvent[], from: GameState, to: GameState, bundle: DataBundle | null, faction: string): PlannedVolley[] {
  const groups = new Map<string, { weaponId: string; targetUnitId: string; shooters: string[] }>()
  for (const t of e.targets) {
    const key = `${t.weaponId}|${t.targetUnitId}`
    const g = groups.get(key) ?? { weaponId: t.weaponId, targetUnitId: t.targetUnitId, shooters: [] }
    g.shooters.push(t.modelId)
    groups.set(key, g)
  }

  // Hit results by weapon+target, from this attack sequence's own HitRolled events.
  const rolled = new Map<string, boolean[]>()
  for (const ev of rest) {
    if (ev.type === 'AttackSequenceEnded' || ev.type === 'TargetsDeclared') break
    if (ev.type !== 'HitRolled') continue
    const key = `${ev.attack.weaponId}|${ev.attack.targetUnitId}`
    const list = rolled.get(key) ?? []
    list.push(ev.hit)
    rolled.set(key, list)
  }

  const out: PlannedVolley[] = []
  for (const [key, g] of groups) {
    const targetModels = unitModels(to, g.targetUnitId).length > 0 ? unitModels(to, g.targetUnitId) : unitModels(from, g.targetUnitId) // a unit wiped out later in this very batch is already gone from `to`
    if (targetModels.length === 0) continue
    const weapon = bundle?.weapons[g.weaponId]
    const family = vfxFamily(g.weaponId, weapon, faction)
    let hits = rolled.get(key)
    let source: PlannedVolley['source'] = 'per-attack'
    if (!hits || hits.length === 0) {
      source = 'estimated'
      const total = Math.max(g.shooters.length, Math.round(g.shooters.length * averageAttacks(weapon?.A)))
      const p = hitChance(weapon)
      // Evenly spread (low-discrepancy) so the estimate does not depend on randomness.
      hits = Array.from({ length: total }, (_, i) => (i * 0.6180339887) % 1 < p)
    }
    const shots: VolleyShot[] = []
    for (let i = 0; i < hits.length; i++) {
      const shooter = g.shooters[i % g.shooters.length]
      const firer = to.models[shooter]?.pos ?? from.models[shooter]?.pos
      if (!firer) continue
      const target = targetModels[i % targetModels.length].pos
      shots.push({ from: { x: firer.x, y: firer.y, z: firer.z }, to: { x: target.x, y: target.y, z: target.z }, hit: hits[i] })
    }
    if (shots.length > 0) out.push({ family, shots, shooterModelIds: g.shooters, source })
  }
  return out
}
