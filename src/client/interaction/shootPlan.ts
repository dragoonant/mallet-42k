// Pure logic behind the weapon-selection panel (src/client/ui/WeaponPanel.tsx): group a declareTargets
// decision's per-model weapon entries, hold a player's fire/hold + target + profile choices, and turn them
// into the `targets` of a declareTargets action — applying the same rules validateDeclareTargets checks
// (src/engine/phases/shooting.ts) so the Fire button is never offered for something the engine rejects.
import type { GameState, ModelId, PendingDecision, UnitId, WeaponId } from '@/engine'
import type { WeaponAbilityName } from '@/data/types'
import { isBigGunsUnit, firingDeckValue } from '@/engine/phases/shooting'

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
  /** Firing Deck: set when this row is one embarked passenger model's one weapon (never merged with other models) */
  deckModelId?: ModelId
}

export type PistolMode = 'other' | 'pistol'
export interface GroupChoice { fire: boolean; target: UnitId; variant: WeaponId }
export interface ShootPlan {
  groups: Record<string, GroupChoice>
  /** which side wins for each set of identically-armed models holding both Pistols and other weapons
   *  (keyed by PistolGroup.sig; a missing key means 'other') */
  pistolMode: Record<string, PistolMode>
  /** the row last touched: a board click retargets it (or every row that can reach the clicked unit) */
  selectedKey: string | null
}

export function weaponHasAbility(state: GameState, weaponId: WeaponId, ability: WeaponAbilityName): boolean {
  return !!state.weapons[weaponId]?.abilities.some((a) => a.ability === ability)
}

/** Firing Deck: the number of embarked models allowed to fire through the active unit (0 = not a transport with a deck). */
export function deckCap(state: GameState, activeUnitId: UnitId): number {
  return firingDeckValue(state, activeUnitId)
}

/** Firing Deck rows currently ticked (each is one passenger model). */
export function deckFiring(groups: WeaponGroup[], plan: ShootPlan): number {
  return groups.filter((g) => g.deckModelId && plan.groups[g.key]?.fire).length
}

export function groupWeapons(state: GameState, entries: WeaponEntry[], activeUnitId?: UnitId): WeaponGroup[] {
  const map = new Map<string, WeaponGroup>()
  const isPassenger = (e: WeaponEntry) => !!activeUnitId && state.models[e.modelId]?.unitId !== activeUnitId
  // Passengers get one row per model+weapon; the rest of the logic below only sees the transport's own entries
  const deckEntries = entries.filter(isPassenger)
  entries = entries.filter((e) => !isPassenger(e))
  // A profile group is one radio choice per model. When models of the unit offer different alternatives of it
  // (e.g. the sergeant has a profile the troopers lack), each distinct set of alternatives gets its own row.
  const offered = new Map<string, Map<ModelId, Set<WeaponId>>>()
  for (const e of entries) {
    if (!e.profileGroup) continue
    const byModel = offered.get(e.profileGroup) ?? new Map<ModelId, Set<WeaponId>>()
    byModel.set(e.modelId, (byModel.get(e.modelId) ?? new Set<WeaponId>()).add(e.weaponId))
    offered.set(e.profileGroup, byModel)
  }
  const sigOf = (e: WeaponEntry): string => {
    const byModel = offered.get(e.profileGroup!)!
    const sigs = new Set([...byModel.values()].map((set) => [...set].sort().join('+')))
    return sigs.size > 1 ? `#${[...byModel.get(e.modelId)!].sort().join('+')}` : ''
  }
  for (const e of entries) {
    const key = e.profileGroup ? `pg:${e.profileGroup}${sigOf(e)}` : e.weaponId
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
  const rows = [...map.values()]
  for (const e of deckEntries) {
    const w = state.weapons[e.weaponId]
    const mname = state.models[e.modelId]
    const unit = mname && state.units[mname.unitId]
    const kind = (unit && state.datasheets[unit.datasheetId]?.models.find((p) => p.modelId === mname.datasheetModelId)?.name) ?? 'Passenger'
    rows.push({
      key: `deck:${e.modelId}:${e.weaponId}`,
      name: `${kind} (${unit?.name ?? 'embarked'}): ${w?.name ?? e.weaponId}`,
      range: w?.range ?? 0,
      entries: [e],
      variants: [{ weaponId: e.weaponId, name: w?.name ?? e.weaponId }],
      legalTargets: [...e.legalTargets],
      deckModelId: e.modelId,
    })
  }
  return rows.filter((g) => g.legalTargets.length > 0)
}

/** Entries of a group that would fire at `target` with the group's chosen profile. */
export function reachingEntries(g: WeaponGroup, choice: GroupChoice): WeaponEntry[] {
  return g.entries.filter((e) => e.weaponId === choice.variant && e.legalTargets.includes(choice.target))
}

/** Start state: every weapon that can reach `target` fires at it. Groups that cannot reach it are held. */
export function initialPlan(groups: WeaponGroup[], target: UnitId): ShootPlan {
  const plan: ShootPlan = { groups: {}, pistolMode: {}, selectedKey: null }
  for (const g of groups) {
    const variant = g.variants.find((v) => g.entries.some((e) => e.weaponId === v.weaponId && e.legalTargets.includes(target)))?.weaponId ?? g.variants[0].weaponId
    const reach = g.entries.some((e) => e.legalTargets.includes(target))
    plan.groups[g.key] = { fire: reach && !g.deckModelId, target: reach ? target : g.legalTargets[0], variant }
  }
  return plan
}

/** A board click on `unitId` while the panel is open: retarget the selected row if it can reach it,
 *  otherwise every row that can (and switch those rows on). */
export function retarget(groups: WeaponGroup[], plan: ShootPlan, unitId: UnitId): ShootPlan {
  const next: ShootPlan = { ...plan, groups: { ...plan.groups } }
  // Firing Deck rows only follow a click once the player has chosen them
  const canReach = (g: WeaponGroup) => g.legalTargets.includes(unitId) && (!g.deckModelId || plan.groups[g.key]?.fire)
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

/** Models that hold both Pistols and other weapons, grouped by identical loadout so each group gets one toggle.
 *  MONSTER/VEHICLE units have no such limit (engine: isBigGunsUnit), so they never conflict. */
export interface PistolGroup {
  sig: string
  modelIds: ModelId[]
  /** e.g. "Sergeant" or "4x Marine" */
  label: string
  pistolNames: string[]
  otherNames: string[]
}

export function pistolGroups(state: GameState, pending: DeclarePending, groups: WeaponGroup[]): PistolGroup[] {
  if (isBigGunsUnit(state, pending.context.unitId)) return []
  const per = new Map<ModelId, { pistol: Set<WeaponId>; other: Set<WeaponId> }>()
  for (const g of groups) {
    for (const e of g.entries) {
      const m = per.get(e.modelId) ?? { pistol: new Set<WeaponId>(), other: new Set<WeaponId>() }
      ;(weaponHasAbility(state, e.weaponId, 'PISTOL') ? m.pistol : m.other).add(e.weaponId)
      per.set(e.modelId, m)
    }
  }
  const out = new Map<string, PistolGroup>()
  const kinds = new Map<string, Map<string, number>>()
  const names = (ids: Set<WeaponId>) => [...new Set([...ids].map((w) => state.weapons[w]?.name ?? w))].sort()
  for (const [modelId, m] of per) {
    if (m.pistol.size === 0 || m.other.size === 0) continue
    const sig = `${[...m.pistol].sort().join('+')}#${[...m.other].sort().join('+')}`
    const g = out.get(sig) ?? { sig, modelIds: [], label: '', pistolNames: names(m.pistol), otherNames: names(m.other) }
    g.modelIds.push(modelId)
    out.set(sig, g)
    const model = state.models[modelId]
    const unit = model && state.units[model.unitId]
    const kindName = (unit && state.datasheets[unit.datasheetId]?.models.find((p) => p.modelId === model.datasheetModelId)?.name) ?? model?.datasheetModelId ?? modelId
    const k = kinds.get(sig) ?? new Map<string, number>()
    k.set(kindName, (k.get(kindName) ?? 0) + 1)
    kinds.set(sig, k)
  }
  for (const g of out.values()) {
    g.label = [...kinds.get(g.sig)!.entries()].map(([n, c]) => (c === 1 ? n : `${c}× ${n}`)).join(', ')
  }
  return [...out.values()]
}

export interface PistolConflict extends PistolGroup {
  mode: PistolMode
}

export interface ResolvedPlan {
  targets: { modelId: ModelId; weaponId: WeaponId; targetUnitId: UnitId }[]
  /** groups whose models really have both sides ticked right now, with the side that wins */
  conflicts: PistolConflict[]
  /** per row key: how many of the row's models will actually fire */
  firing: Record<string, number>
  /** per row key: how many of the row's models are held back by the Pistol rule */
  dropped: Record<string, number>
  errors: string[]
}

export function modeOf(plan: ShootPlan, sig: string): PistolMode {
  return plan.pistolMode[sig] ?? 'other'
}

const resolvedKeys = (firing: Record<string, number>, key: string) => (firing[key] ?? 0) > 0

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
  const groupOfModel = new Map<ModelId, PistolGroup>()
  for (const pg of pistolGroups(state, pending, groups)) for (const id of pg.modelIds) groupOfModel.set(id, pg)
  const byModel = new Map<ModelId, Cand[]>()
  for (const c of cands) byModel.set(c.modelId, [...(byModel.get(c.modelId) ?? []), c])
  const dropped: Record<string, number> = {}
  const drop = new Set<Cand>()
  const active = new Map<string, PistolConflict>()
  if (!bigGuns) {
    for (const [modelId, list] of byModel) {
      const pg = groupOfModel.get(modelId)
      const pistols = list.filter((c) => c.pistol)
      const others = list.filter((c) => !c.pistol)
      if (!pg || pistols.length === 0 || others.length === 0) continue
      const mode = modeOf(plan, pg.sig)
      active.set(pg.sig, { ...pg, mode })
      for (const c of mode === 'pistol' ? others : pistols) {
        drop.add(c)
        dropped[c.key] = (dropped[c.key] ?? 0) + 1
      }
    }
  }
  const kept = cands.filter((c) => !drop.has(c))
  const firing: Record<string, number> = {}
  for (const c of kept) firing[c.key] = (firing[c.key] ?? 0) + 1
  const targets = kept.map(({ modelId, weaponId, targetUnitId }) => ({ modelId, weaponId, targetUnitId }))
  const errors: string[] = []
  const deckModels = new Set(groups.filter((g) => g.deckModelId && (resolvedKeys(firing, g.key))).map((g) => g.deckModelId))
  if (deckModels.size > deckCap(state, pending.context.unitId)) errors.push(`Firing Deck allows at most ${deckCap(state, pending.context.unitId)} embarked models to fire.`)
  if (targets.length === 0) errors.push('Tick at least one weapon, or choose Fire nothing.')
  if (pending.context.engagedWith.length > 0 && !bigGuns && new Set(targets.map((t) => t.targetUnitId)).size > 1) {
    errors.push('This unit is locked in melee, so all of its guns must pick the same enemy unit.')
  }
  return { targets, conflicts: [...active.values()], firing, dropped, errors }
}

/** Tick or untick a row. Ticking a row whose models are currently using the other side of the Pistol rule
 *  flips those models to this row's side, so a tick always means "this will fire". */
export function setRowFire(state: GameState, pending: DeclarePending, groups: WeaponGroup[], plan: ShootPlan, key: string, on: boolean): ShootPlan {
  const g = groups.find((x) => x.key === key)
  const c = plan.groups[key]
  const next: ShootPlan = { ...plan, selectedKey: key, groups: { ...plan.groups, [key]: { ...c, fire: on } }, pistolMode: { ...plan.pistolMode } }
  if (!g || !on) return next
  if (g.deckModelId) {
    // Firing Deck: one weapon per passenger model, and at most `deckCap` passenger models in total
    if (!c.fire && deckFiring(groups, plan) >= deckCap(state, pending.context.unitId)) return plan
    for (const o of groups) if (o.deckModelId === g.deckModelId && o.key !== key) next.groups[o.key] = { ...plan.groups[o.key], fire: false }
    return next
  }
  const rowIsPistol = weaponHasAbility(state, c.variant, 'PISTOL')
  const groupOfModel = new Map<ModelId, PistolGroup>()
  for (const pg of pistolGroups(state, pending, groups)) for (const id of pg.modelIds) groupOfModel.set(id, pg)
  for (const e of reachingEntries(g, c)) {
    const pg = groupOfModel.get(e.modelId)
    if (pg) next.pistolMode[pg.sig] = rowIsPistol ? 'pistol' : 'other'
  }
  return next
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
