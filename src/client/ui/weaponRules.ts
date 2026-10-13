// Plain-English wording for weapon keywords, shared by the unit card's weapon tooltip and the datasheet popup.
import type { RuntimeWeapon } from '@/engine'
import { prettifyId } from './labels'

/** Plain-English line for one weapon keyword, in our own words. */
export function abilityLine(a: RuntimeWeapon['abilities'][number]): { name: string; text: string } {
  const v = a.value
  switch (a.ability) {
    case 'ASSAULT': return { name: 'Assault', text: 'May still be fired after the unit Advances.' }
    case 'HEAVY': return { name: 'Heavy', text: 'Gets +1 to hit if the unit did not move this turn.' }
    case 'RAPID_FIRE': return { name: `Rapid Fire ${v ?? ''}`.trim(), text: `Adds ${v ?? 'extra'} attack(s) per model when the target is within half range.` }
    case 'TORRENT': return { name: 'Torrent', text: 'A spray of fire: every attack hits automatically.' }
    case 'BLAST': return { name: 'Blast', text: 'Gains an extra attack for every five models in the target unit; cannot be aimed at a unit locked in combat with your own.' }
    case 'SUSTAINED_HITS': return { name: `Sustained Hits ${v ?? ''}`.trim(), text: `Each critical hit scores ${v ?? 'extra'} additional hit(s).` }
    case 'LETHAL_HITS': return { name: 'Lethal Hits', text: 'Each critical hit wounds automatically, skipping the wound roll.' }
    case 'DEVASTATING_WOUNDS': return { name: 'Devastating Wounds', text: 'Each critical wound deals its damage straight through: no armour or invulnerable save is allowed.' }
    case 'ANTI': return { name: `Anti-${a.keyword ?? '?'} ${v ?? ''}+`.trim(), text: `Against ${a.keyword ?? 'the named'} targets, a wound roll of ${v ?? 'the listed number'}+ is a critical wound.` }
    case 'TWIN_LINKED': return { name: 'Twin-linked', text: 'Two barrels working together: wound rolls may be re-rolled.' }
    case 'LANCE': return { name: 'Lance', text: 'Gets +1 to wound if the bearer charged this turn.' }
    case 'MELTA': return { name: `Melta ${v ?? ''}`.trim(), text: `Within half range, each unsaved wound does ${v ?? 'extra'} more damage.` }
    case 'IGNORES_COVER': return { name: 'Ignores Cover', text: 'The target gets no armour bonus from cover.' }
    case 'INDIRECT_FIRE': return { name: 'Indirect Fire', text: 'Can be fired at targets that are out of sight, with a penalty to hit.' }
    case 'PISTOL': return { name: 'Pistol', text: 'May be fired even when the unit is in engagement range, but only at an enemy it is locked with.' }
    case 'HAZARDOUS': return { name: 'Hazardous', text: 'Risky to use: after firing, the bearer may be hurt by its own weapon.' }
    case 'PRECISION': return { name: 'Precision', text: 'Successful hits may be allocated to a Character leading the target unit.' }
    case 'EXTRA_ATTACKS': return { name: 'Extra Attacks', text: "Used in addition to the model's other melee weapon rather than instead of it." }
    case 'ONE_SHOT': return { name: 'One Shot', text: 'Can only be used once per battle.' }
    case 'PSYCHIC': return { name: 'Psychic', text: 'A psychic attack; rules that affect psychic powers apply to it.' }
    default: return { name: prettifyId(a.ref ?? a.ability), text: 'A special rule specific to this weapon.' }
  }
}
