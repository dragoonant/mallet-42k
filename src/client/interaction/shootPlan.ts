// Pure logic behind the weapon-selection panel (src/client/ui/WeaponPanel.tsx): group a declareTargets
// decision's per-model weapon entries, hold a player's fire/hold + target + profile choices, and turn them
// into the `targets` of a declareTargets action — applying the same rules validateDeclareTargets checks
// (src/engine/phases/shooting.ts) so the Fire button is never offered for something the engine rejects.
import type { GameState, ModelId, PendingDecision, UnitId, WeaponId } from '@/engine'
import type { WeaponAbilityName } from '@/data/types'
import { isBigGunsUnit } from '@/engine/phases/shooting'

export type DeclarePending = Extract<PendingDecision, { kind: 'declareTargets' }>
export type WeaponEntry = DeclarePending['context']['weapons'][number]

export interface WeaponVariant { weaponId: WeaponId; name: string }
export interface WeaponGroup {
  /** weaponId, or `pg:<profileGroup>` for a set of alternative profiles */
  key: string
  name: string
  range: number
  entries: WeaponEntry[]
  /** more than one entry = alternative profiles of one profile group (radio choice) */
  variants: WeaponVariant[]
  /** union of every entry's legal targets */
  legalTargets: UnitId[]
}

export interface GroupChoice { fire: boolean; target: UnitId; variant: WeaponId }
export interface ShootPlan {
  groups: Record<string, GroupChoice>
  /** which side wins when a model holds both Pistols and other weapons */
  pistolMode: 'other' | 'pistol'
  /** the row last touched: a board click retargets it (or every row that can reach the clicked unit) */
  selectedKey: string | null
}

export function weaponHasAbility(state: GameState, weaponId: WeaponId, ability: WeaponAbilityName): boolean {
  return !!state.weapons[weaponId]?.abilities.some((a) => a.ability === ability)
}

export function groupWeapons(state: GameState, entries: WeaponEntry[]): WeaponGroup[] {
  const map = new Map<string, WeaponGroup>()
  for (const e of entries) {
    const key = e.profileGroup ? `pg:${e.profileGroup}` : e.weaponId
    let g = map.get(key)
    if (!g) {
      const w = state.weapons[e.weaponId]
      g = { key, name: w?.name ?? e.weaponId, range: w?.range ?? 0, entries: [], variants: [], legalTargets: [] }
      map.set(key, g)
    }
    g.entries.push(e)
    if (!g.variants.some((v) => v.weaponId === e.weaponId)) g.variants.push({ weaponId: e.weaponId, name: state.weapons[e.weaponId]?.name ?? e.weaponId })
    for (const t of e.legalTargets) if (!g.legalTargets.includes(t)) g.legalTargets.push(t)
  }
  return [...map.values()].filter((g) => g.legalTargets.length > 0)
}

/** Entries of a group that would fire at `target` with the group's chosen profile. */
export function reachingEntries(g: WeaponGroup, choice: GroupChoice): WeaponEntry[] {
  return g.entries.filter((e) => e.weaponId === choice.variant && e.legalTargets.includes(choice.target))
}

/** Start state: every weapon that can reach `target` fires at it. Groups that cannot reach it are held. */
export function initialPlan(groups: WeaponGroup[], target: UnitId): ShootPlan {
  const plan: ShootPlan = { groups: {}, pistolMode: 'other', selectedKey: null }
  for (const g of groups) {
    const variant = g.variants.find((v) => g.entries.some((e) => e.weaponId === v.weaponId && e.legalTargets.includes(target)))?.weaponId ?? g.variants[0].weaponId
    const reach = g.entries.some((e) => e.legalTargets.includes(target))
    plan.groups[g.key] = { fire: reach, target: reach ? target : g.legalTargets[0], variant }
  }
  return plan
}

/** A board click on `unitId` while the panel is open: retarget the selected row if it can reach it,
 *  otherwise every row that can (and switch those rows on). */
export function retarget(groups: WeaponGroup[], plan: ShootPlan, unitId: UnitId): ShootPlan {
  const next: ShootPlan = { ...plan, groups: { ...plan.groups } }
  const canReach = (g: WeaponGroup) => g.legalTargets.includes(unitId)
  const apply = (g: WeaponGroup) => {
    const c = plan.groups[g.key]
    const variant = g.variants.find((v) => g.entries.some((e) => e.weaponId === v.weaponId && e.legalTargets.includes(unitId)))?.weaponId ?? c.variant
    const variantOk = g.entries.some((e) => e.weaponId === c.variant && e.legalTargets.includes(unitId))
    next.groups[g.key] = { fire: true, target: unitId, variant: variantOk ? c.variant : variant }
  }
  const sel = groups.find((g) => g.key === plan.selectedKey)
  if (sel && canReach(sel)) apply(sel)
  else for (const g of groups) if (canReach(g)) apply(g)
  return next
}

export interface PistolConflict {
  modelIds: ModelId[]
  pistolNames: string[]
  otherNames: string[]
}

export interface ResolvedPlan {
  targets: { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId }[]
  conflicts: PistolConflict[]
  /** weapons dropped because the other side of a Pistol conflict wins, per group key */
  dropped: Record<string, number>
  errors: string[]
}

export function resolvePlan(state: GameState, pending: DeclarePending, groups: WeaponGroup[], plan: ShootPlan): ResolvedPlan {
  type Cand = { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId; key: string; pistol: boolean }
  const cands: Cand[] = []
  for (const g of groups) {
    const c = plan.groups[g.key]
    if (!c?.fire) continue
    for (const e of reachingEntries(g, c)) {
      cands.push({ modelId: e.modelId, weaponId: e.weaponId, targetUnitId: c.target, key: g.key, pistol: weaponHasAbility(state, e.weaponId, 'PISTOL') })
    }
  }
  const bigGuns = isBigGunsUnit(state, pending.context.unitId)
  const byModel = new Map<ModelId, Cand[]>()
  for (const c of cands) byModel.set(c.modelId, [...(byModel.get(c.modelId) ?? []), c])
  const dropped: Record<string, number> = {}
  const drop = new Set<Cand>()
  const conflictMap = new Map<string, PistolConflict>()
  if (!bigGuns) {
    for (const [modelId, list] of byModel) {
      const pistols = list.filter((c) => c.pistol)
      const others = list.filter((c) => !c.pistol)
      if (pistols.length === 0 || others.length === 0) continue
      const pNames = [...new Set(pistols.map((c) => state.weapons[c.weaponId]?.name ?? c.weaponId))].sort()
      const oNames = [...new Set(others.map((c) => state.weapons[c.weaponId]?.name ?? c.weaponId))].sort()
      const k = `${pNames.join('|')}#${oNames.join('|')}`
      const entry = conflictMap.get(k) ?? { modelIds: [], pistolNames: pNames, otherNames: oNames }
      entry.modelIds.push(modelId)
      conflictMap.set(k, entry)
      for (const c of plan.pistolMode === 'pistol' ? others : pistols) {
        drop.add(c)
        dropped[c.key] = (dropped[c.key] ?? 0) + 1
      }
    }
  }
  const targets = cands.filter((c) => !drop.has(c)).map(({ modelId, weaponId, targetUnitId }) => ({ modelId, weaponId, targetUnitId }))
  const errors: string[] = []
  if (targets.length === 0) errors.push('Tick at least one weapon, or choose Fire nothing.')
  if (pending.context.engagedWith.length > 0 && !bigGuns && new Set(targets.map((t) => t.targetUnitId)).size > 1) {
    errors.push('This unit is locked in melee, so all of its guns must pick the same enemy unit.')
  }
  return { targets, conflicts: [...conflictMap.values()], dropped, errors }
}

/** Short tags for a weapon's keywords, with an own-words tooltip where the rule bites. */
const TAGS: Partial<Record<WeaponAbilityName, { label: string; tip?: string }>> = {
  HAZARDOUS: { label: 'Hazardous', tip: 'Firing this can hurt the shooter: after the unit shoots, each model that used it rolls a die and a 1 destroys a model of the unit.' },
  ONE_SHOT: { label: 'One Shot', tip: 'This weapon can be fired only once for the whole battle. Once it has fired, it is gone for good.' },
  PISTOL: { label: 'Pistol', tip: 'Can be used while locked in melee (but only against that enemy). A model fires either its Pistols or its other guns in one activation, not both.' },
  BLAST: { label: 'Blast', tip: 'Gets extra attacks against big units and cannot be aimed at an enemy tangled in melee with your own army.' },
  HEAVY: { label: 'Heavy', tip: 'Hits more easily if the unit held still this turn.' },
  RAPID_FIRE: { label: 'Rapid Fire', tip: 'Fires extra shots when the target is within half range.' },
  ASSAULT: { label: 'Assault', tip: 'May be fired even after the unit advanced.' },
  TORRENT: { label: 'Torrent', tip: 'Never needs a hit roll: every attack hits.' },
  TWIN_LINKED: { label: 'Twin-linked' },
  LETHAL_HITS: { label: 'Lethal Hits' },
  SUSTAINED_HITS: { label: 'Sustained Hits' },
  DEVASTATING_WOUNDS: { label: 'Devastating Wounds' },
  ANTI: { label: 'Anti' },
  LANCE: { label: 'Lance' },
  MELTA: { label: 'Melta' },
  IGNORES_COVER: { label: 'Ignores Cover' },
  INDIRECT_FIRE: { label: 'Indirect Fire' },
  PRECISION: { label: 'Precision' },
  PSYCHIC: { label: 'Psychic' },
}

export function weaponTags(state: GameState, weaponId: WeaponId): { label: string; tip?: string }[] {
  const w = state.weapons[weaponId]
  if (!w) return []
  const out: { label: string; tip?: string }[] = []
  for (const a of w.abilities) {
    const t = TAGS[a.ability]
    if (!t) continue
    let label = t.label
    if (a.value !== undefined && (a.ability === 'RAPID_FIRE' || a.ability === 'SUSTAINED_HITS' || a.ability === 'MELTA' || a.ability === 'BLAST' || a.ability === 'ANTI')) label += ` ${a.value}`
    if (a.ability === 'ANTI' && a.keyword) label = `Anti-${a.keyword} ${a.value ?? ''}`.trim()
    out.push({ label, tip: t.tip })
  }
  return out
}
