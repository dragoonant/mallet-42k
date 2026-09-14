// Weapon helpers and weapon-ability bookkeeping (10-rules §7, 20-data §4). Owner: W1-D. Pure queries; granted
// abilities (grantWeaponAbility effects) are merged by `effectiveWeapon` via services.hooks onStatQuery.
import type { DiceExpr, WeaponAbilityName } from '../data/types'
import { parseDiceExpr } from './dice'
import { hookService } from './hooks-impl'
import type { GameState, ModelId, RuntimeWeapon, WeaponId } from './types'

export interface WeaponService {
  hasAbility(weapon: RuntimeWeapon, ability: WeaponAbilityName): boolean
  abilityValue(weapon: RuntimeWeapon, ability: WeaponAbilityName): DiceExpr | null
  // the weapon as this model uses it now: stat modifiers (onStatQuery), granted abilities, R-1.9 clamps
  effectiveWeapon(state: GameState, modelId: ModelId, weaponId: WeaponId): RuntimeWeapon
  // one entry per profile group: [groupId | weaponId, profile weapon ids]
  profileGroups(state: GameState, weaponIds: WeaponId[]): { group: string; weaponIds: WeaponId[] }[]
}

export const weaponService: WeaponService = {
  hasAbility: (weapon, ability) => weapon.abilities.some((a) => a.ability === ability),
  abilityValue(weapon, ability) {
    const a = weapon.abilities.find((x) => x.ability === ability)
    return a?.value ?? null
  },
  // stat modifiers (onStatQuery: modifyStat/setStat) applied to the weapon's numeric stats (S/AP/range and, when A is
  // a fixed number rather than a dice expression, A too — modifying a DiceExpr in place is out of scope [interp]) and
  // BS/WS (skill); grantWeaponAbility effects merged in (Epic Challenge Precision, Veil of Time Sustained Hits, …).
  effectiveWeapon(state, modelId, weaponId) {
    const base = state.weapons[weaponId]
    const model = state.models[modelId]
    if (!base || !model) return base
    const abilities = hookService.weaponAbilitiesFor ? hookService.weaponAbilitiesFor(state, modelId, base) : base.abilities
    const q = (stat: 'BS' | 'WS' | 'S' | 'AP' | 'range' | 'A', v: number) =>
      hookService.statFor ? hookService.statFor(state, { unitId: model.unitId, modelId, weapon: base, stat }, v) : v
    const skillStat = base.kind === 'ranged' ? 'BS' as const : 'WS' as const
    const skill = base.skill === null ? null : q(skillStat, base.skill)
    const S = q('S', base.S)
    const AP = q('AP', base.AP)
    const range = q('range', base.range)
    // A: only adjust when the base expression is a flat number (Waaagh!-style setStat/modifyStat on 'A')
    const parsedA = parseDiceExpr(base.A)
    const A: DiceExpr = parsedA.count === 0 ? q('A', parsedA.flat) : base.A
    if (abilities === base.abilities && skill === base.skill && S === base.S && AP === base.AP && range === base.range && A === base.A) return base
    return { ...base, abilities, skill, S, AP, range, A }
  },
  profileGroups(state, weaponIds) {
    const groups = new Map<string, WeaponId[]>()
    for (const id of weaponIds) {
      const key = state.weapons[id]?.profileGroup ?? id
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    return [...groups.entries()].map(([group, ids]) => ({ group, weaponIds: ids }))
  },
}
