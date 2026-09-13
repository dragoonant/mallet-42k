// Weapon helpers and weapon-ability bookkeeping (10-rules §7, 20-data §4). Owner: W1-D. Pure queries; granted
// abilities (grantWeaponAbility effects) are merged by `effectiveWeapon` via services.hooks onStatQuery.
import type { DiceExpr, WeaponAbilityName } from '../data/types'
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
  // TODO(W1-D): apply hooks onStatQuery / grantWeaponAbility
  effectiveWeapon: (state, _modelId, weaponId) => state.weapons[weaponId],
  profileGroups(state, weaponIds) {
    const groups = new Map<string, WeaponId[]>()
    for (const id of weaponIds) {
      const key = state.weapons[id]?.profileGroup ?? id
      groups.set(key, [...(groups.get(key) ?? []), id])
    }
    return [...groups.entries()].map(([group, ids]) => ({ group, weaponIds: ids }))
  },
}
