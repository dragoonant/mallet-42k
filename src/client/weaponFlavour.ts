// One classification of "what does this weapon look and sound like", shared by the two presentation
// layers that need it: src/client/audio/eventSounds.ts picks the firing SFX from it, and
// src/client/presentation/director.ts picks the tracer look (vfx's ShotKind) from the same call, so a
// weapon can never sound like a bolter while drawing an ork tracer.
//
// The engine has no client-facing "weapon look" concept and the datasheets carry no sound/vfx field
// (docs/spec/20-data-schema.md §5) — adding one per weapon would be data-entry cost for a palette of
// six SFX. So this derives it from what the data already says: the weapon's own abilities first
// (PSYCHIC/TORRENT/BLAST are unambiguous), then its name, then Strength as a last resort, then the
// firing unit's faction. Ability and name both wrong for a new weapon is the case to watch: add a
// keyword here rather than a field to the schema.
import type { WeaponData } from '@/data/types'

/** The ranged values are exactly vfx's ShotKind (src/client/vfx/types.ts) so the director can pass
 *  one straight through as the tracer look; 'force' is melee-only and has no tracer. */
export type RangedFlavour = 'bolter' | 'shoota' | 'heavy' | 'flame' | 'psychic'
export type MeleeFlavour = 'chain' | 'crush' | 'force'
export type WeaponFlavour = RangedFlavour | MeleeFlavour

const RANGED: ReadonlySet<WeaponFlavour> = new Set<WeaponFlavour>(['bolter', 'shoota', 'heavy', 'flame', 'psychic'])

export function isRangedFlavour(flavour: WeaponFlavour): flavour is RangedFlavour {
  return RANGED.has(flavour)
}

function hasAbility(weapon: WeaponData | undefined, name: string): boolean {
  return !!weapon?.abilities?.some((a) => a.ability === name)
}

/** What the weapon reads as. `weaponId` is matched alongside the name because a weapon the bundle
 *  doesn't have (a stale id in a replay, say) still carries its own id, which is descriptive enough
 *  to classify: "ork.w.rokkit-launcha" is a rokkit with or without its datasheet. `faction` is the
 *  *firing unit's* faction key ('orks', 'space-marines'), used only to decide what a plain infantry
 *  gun sounds like when nothing more specific matched. */
export function weaponFlavour(weaponId: string, weapon: WeaponData | undefined, faction: string): WeaponFlavour {
  const text = `${weaponId} ${weapon?.name ?? ''}`.toLowerCase()
  const melee = weapon ? weapon.type === 'melee' : /choppa|klaw|fist|weapon$|blade|scythe|mace|flail|sword|close-combat|combat weapon/.test(text)
  const psychic = hasAbility(weapon, 'PSYCHIC') || /smite|witchfire|warp|psychic|psilencer|purge soul/.test(text)
  // Gauss weapons flay with a green energy bolt rather than a bullet, so they voice and trace as an energy
  // weapon; the psychic zap is the closest thing in the SFX palette.
  const gauss = /gauss/.test(text)
  const strength = typeof weapon?.S === 'number' ? weapon.S : 0

  if (melee) {
    // A force weapon crackles rather than revs; everything else splits on whether it crushes or cuts.
    if (psychic || /force/.test(text)) return 'force'
    // Tyranid claws, talons and teeth rend and slash, so they voice as the cutting sound; only a klaw/fist
    // (or a plain crushing profile) is the heavy crunch.
    if (/fist|klaw|hammer|maul|mace|crush|limbs|mutation|sentinel/.test(text)) return 'crush'
    if (/choppa|chain|sword|blade|axe|knife|claw|talon|teeth|maw|hyperphase|mandible|flail|whip/.test(text)) return 'chain'
    return strength >= 8 ? 'crush' : 'chain'
  }

  if (psychic || gauss) return 'psychic'
  // TORRENT is the rules-level marker for a flame template (no hit roll, auto-hits).
  if (hasAbility(weapon, 'TORRENT') || /flame|flamer|burna|pyre|melta|incinerat/.test(text)) return 'flame'
  // BLAST marks the explosive/ordnance profiles; the keywords catch the rest of the big guns, and
  // S7+ catches a heavy profile whose name says nothing (nothing in the current bundle needs it).
  if (hasAbility(weapon, 'BLAST') || /cannon|kannon|rokkit|rocket|missile|mega|lascannon|plasma|blasta|blaster|tachyon|heavy bolter|heavy-bolter|launcher|field-gun|field gun|howitzer|hunter-killer|bombast|malleus/.test(text)) return 'heavy'
  // Guard small arms (lasgun, laspistol, autogun) fall through to 'bolter': a rifle crack with a warm orange tracer.
  if (/bolt/.test(text)) return 'bolter'
  // Cultist autoguns are cheap rattling cracks, not bolter thumps. Spat or flung biomass (fleshborers, spore-guns)
  // is a rapid wet spray too; the Tyranid faction fallback does the same for any other plain gun.
  if (/shoota|slugga|dakka|stikk|autopistol|borer|spine|spore/.test(text) || (/autogun/.test(text) && faction !== 'astra-militarum') || faction === 'orks' || faction === 'ork' || faction === 'tyranids') return 'shoota'
  if (faction === 'necrons') return 'psychic'
  return 'bolter'
}
