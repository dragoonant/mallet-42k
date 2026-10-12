// Pure helpers for the per-unit status icon row: which icon an active effect gets, and the short tooltip text.
import type { ActiveEffect, GameState, Unit } from '@/engine'

export type EffectIconKind = 'stratagem' | 'buffHit' | 'buffWound' | 'buffSave' | 'aura' | 'effect'
export type TurnFlagKind = 'advanced' | 'fellBack' | 'charged'

export interface EffectEntry { kind: EffectIconKind; hostile: boolean; key: string; name: string; hint: string }
export interface FlagEntry { kind: TurnFlagKind; name: string; hint: string }

const FLAGS: Record<TurnFlagKind, { name: string; hint: string }> = {
  advanced: { name: 'Advanced', hint: 'Ran flat out this turn, so it cannot normally charge.' },
  fellBack: { name: 'Fell Back', hint: 'Broke away from melee this turn, so it cannot normally shoot or charge.' },
  charged: { name: 'Charged', hint: 'Charged into melee this turn.' },
}

function effectList(e: ActiveEffect): Record<string, unknown>[] {
  return (Array.isArray(e.effect) ? e.effect : [e.effect]) as unknown as Record<string, unknown>[]
}

/** Category of an effect's icon, from what it does. Stratagem sources always get the card glyph. */
export function effectCategory(effects: Record<string, unknown>[], fromStratagem: boolean, whoScope: string | undefined): EffectIconKind {
  if (fromStratagem) return 'stratagem'
  for (const fx of effects) {
    const mr = fx.modifyRoll as { roll?: string } | undefined
    if (mr?.roll === 'hit') return 'buffHit'
    if (mr?.roll === 'wound') return 'buffWound'
    if (mr?.roll === 'save' || fx.invuln != null || fx.feelNoPain != null || fx.damageReduction != null || fx.halveDamage) return 'buffSave'
  }
  if (whoScope && whoScope !== 'self' && whoScope !== 'bearer') return 'aura'
  return effects.length > 0 ? 'aura' : 'effect'
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/)
  const s = (m ? m[0] : text).trim()
  return s.length > 140 ? `${s.slice(0, 137)}...` : s
}

/** Temporary effects on a unit (permanent 'battle' ones are skipped), deduped by source ability or stratagem. */
export function effectEntries(state: GameState, unit: Unit): EffectEntry[] {
  const seen = new Set<string>()
  const out: EffectEntry[] = []
  for (const e of unit.effects) {
    if (e.expires.kind === 'battle' || seen.has(e.sourceAbilityId)) continue
    seen.add(e.sourceAbilityId)
    const strat = state.stratagems[e.sourceAbilityId]
    const ability = state.abilities[e.sourceAbilityId]
    const src = e.sourceUnitId ? state.units[e.sourceUnitId] : undefined
    const hostile = !!src && src.player !== unit.player
    out.push({
      kind: effectCategory(effectList(e), !!strat, e.scope?.who),
      hostile,
      key: e.sourceAbilityId,
      name: strat?.name ?? ability?.name ?? e.sourceAbilityId.replace(/^.*[.:]/, '').replace(/[-_]/g, ' '),
      hint: firstSentence(strat?.text ?? ability?.text ?? 'A temporary effect is active on this unit.'),
    })
  }
  return out
}

export function turnFlagEntries(unit: Unit): FlagEntry[] {
  const t = unit.turn
  const out: FlagEntry[] = []
  if (t?.moveType === 'advance') out.push({ kind: 'advanced', ...FLAGS.advanced })
  if (t?.moveType === 'fallBack') out.push({ kind: 'fellBack', ...FLAGS.fellBack })
  if (t?.chargedThisTurn) out.push({ kind: 'charged', ...FLAGS.charged })
  return out
}
