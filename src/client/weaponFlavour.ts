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
  const gauss = /gauss|pulse/.test(text) // T'au pulse weapons are blue energy bolts too
  const strength = typeof weapon?.S === 'number' ? weapon.S : 0

  if (melee) {
    // A force weapon crackles rather than revs; everything else splits on whether it crushes or cuts.
    if (psychic || /force|stave/.test(text)) return 'force'
    // Tyranid claws, talons and teeth rend and slash, so they voice as the cutting sound; only a klaw/fist
    // (or a plain crushing profile) is the heavy crunch.
    if (/fist|klaw|hammer|maul|mace|crush|limbs|mutation|sentinel(?![- ]blade)|mining|improvised|dozer/.test(text)) return 'crush'
    if (/choppa|chain|sword|blade|axe|knife|claw|talon|teeth|maw|hyperphase|mandible|flail|whip/.test(text)) return 'chain'
    return strength >= 8 ? 'crush' : 'chain'
  }

  if (psychic || gauss) return 'psychic'
  // TORRENT is the rules-level marker for a flame template (no hit roll, auto-hits).
  if (hasAbility(weapon, 'TORRENT') || /flame|flamer|burna|pyre|melta|incinerat|fusion/.test(text)) return 'flame'
  if (/burst.cannon/.test(text)) return 'shoota' // a rattling gun, not an artillery piece
  // BLAST marks the explosive/ordnance profiles; the keywords catch the rest of the big guns, and
  // S7+ catches a heavy profile whose name says nothing (nothing in the current bundle needs it).
  if (hasAbility(weapon, 'BLAST') || /cannon|kannon|rokkit|rocket|missile|mega|lascannon|plasma|blasta|blaster|tachyon|heavy bolter|heavy-bolter|launcher|field-gun|field gun|howitzer|hunter-killer|bombast|malleus|raker/.test(text)) return 'heavy'
  // Guard small arms (lasgun, laspistol, autogun) fall through to 'bolter': a rifle crack with a warm orange tracer.
  if (/bolt/.test(text)) return 'bolter'
  // Cultist autoguns are cheap rattling cracks, not bolter thumps. Spat or flung biomass (fleshborers, spore-guns)
  // is a rapid wet spray too; the Tyranid faction fallback does the same for any other plain gun.
  if (/shoota|slugga|dakka|stikk|autopistol|borer|spine|spore|burst cannon|burst-cannon/.test(text) || (/autogun/.test(text) && faction !== 'astra-militarum') || faction === 'orks' || faction === 'ork' || faction === 'tyranids' || faction === 'genestealer-cults') return 'shoota'
  if (faction === 'necrons' || faction === 'tau-empire') return 'psychic'
  return 'bolter'
}

// ---------- visual families (src/client/vfx/families.ts) ----------
//
// The 5 ranged flavours above are the SFX palette. The vfx layer has 14 looks, a finer split of the same
// weapons: one call classifies a weapon into a VfxFamily from the same evidence (abilities, name, faction).
// weaponFlavour() is deliberately untouched so audio keeps its mapping; `familyFlavour` maps a family back
// onto the SFX palette for any caller that only has a family.
import type { VfxFamily } from './vfx/types'
export type { VfxFamily } from './vfx/types'

export const VFX_FAMILIES: readonly VfxFamily[] = ['bolt', 'autocannon', 'las', 'lascannon', 'plasma', 'melta', 'flamer', 'missile', 'grenade', 'gauss', 'pulse', 'dakka', 'bio', 'psychic']

export interface VfxClassification {
  family: VfxFamily
  /** 'keyword' = an ability/name rule matched; 'faction' = nothing in the weapon matched, the firing faction decided;
   *  'default' = nothing matched at all (plain bolt). */
  via: 'keyword' | 'faction' | 'default'
}

/** Engine faction ids by the prefix of a weapon id ('ork.w.shoota'), for weapons classified with no faction given. */
const ID_PREFIX_FACTION: [string, string][] = [
  ['ork.', 'ork'], ['nec', 'necrons'], ['tyr', 'tyranids'], ['gsc.', 'genestealer-cults'], ['tau.', 'tau-empire'],
  ['am.', 'astra-militarum'], ['gk.', 'grey-knights'], ['csm', 'chaos-space-marines'], ['ade', 'adepta-sororitas'], ['cus.', 'adeptus-custodes'],
]

export function classifyVfxFamily(weaponId: string, weapon: WeaponData | undefined, faction: string): VfxClassification {
  const text = `${weaponId.slice(weaponId.indexOf('.w.') + 1)} ${weapon?.name ?? ''}`.toLowerCase()
  const fac = faction || ID_PREFIX_FACTION.find(([p]) => weaponId.startsWith(p))?.[1] || ''
  const kw = (family: VfxFamily): VfxClassification => ({ family, via: 'keyword' })

  if (hasAbility(weapon, 'PSYCHIC') || /smite|witchfire|psychic|psychoclastic|psilencer|psycannon|purge soul|rite of possession|rite-of-possession/.test(text)) return kw('psychic')
  // Spat, flung or sprayed biomass: Tyranid guns, and the cult's webber.
  if (/fleshborer|barb|devourer|venom|spine|spore|acid|borer|webber|web/.test(text) || (fac === 'tyranids' && !/torrent/.test(text))) return kw('bio')
  if (/gauss|tachyon|doomsday|necron/.test(text)) return kw('gauss')
  if (/melta|fusion/.test(text) || hasAbility(weapon, 'MELTA')) return kw('melta')
  if (hasAbility(weapon, 'TORRENT') || /flame|flamer|burna|pyre|incinerat/.test(text)) return kw('flamer')
  if (/pulse|ion.?raker|railgun|rail.?rifle|burst.?cannon|markerlight/.test(text)) return kw('pulse')
  if (/grenade|krak|frag|demolition|charge cache|satchel/.test(text)) return kw('grenade')
  if (/rokkit|rocket|missile|hunter.?killer|bombast|field.?gun|howitzer|launcher|mortar|malleus|kannon/.test(text)) return kw('missile')
  if (/lascannon|las.?cannon|laser|beam/.test(text)) return kw('lascannon')
  if (/plasma|blaster|blasta|supercharge/.test(text)) return kw(fac === 'ork' || fac === 'orks' ? 'dakka' : 'plasma')
  if (/shoota|slugga|dakka|stikk|big.?shoota|kopta/.test(text)) return kw('dakka')
  if (/autocannon|assault cannon|assault-cannon|heavy.?bolter|heavy.?stubber|stubber|seismic|cannon/.test(text)) return kw('autocannon')
  if (/lasgun|laspistol|lascarbine|las.?pistol/.test(text)) return kw('las')
  if (/bolt|combi|storm|hurricane|spear|sentinel blade|sentinel-blade|autogun|autopistol|hybrid firearm|pistol/.test(text)) return kw('bolt')
  switch (fac) {
    case 'ork': case 'orks': return { family: 'dakka', via: 'faction' }
    case 'tyranids': return { family: 'bio', via: 'faction' }
    case 'necrons': return { family: 'gauss', via: 'faction' }
    case 'tau-empire': return { family: 'pulse', via: 'faction' }
    case 'astra-militarum': return { family: 'las', via: 'faction' }
    case 'grey-knights': return { family: 'psychic', via: 'faction' }
    default: return { family: 'bolt', via: 'default' }
  }
}

/** The visual family of a ranged weapon. */
export function vfxFamily(weaponId: string, weapon: WeaponData | undefined, faction: string): VfxFamily {
  return classifyVfxFamily(weaponId, weapon, faction).family
}

const FAMILY_FLAVOUR: Record<VfxFamily, RangedFlavour> = {
  bolt: 'bolter', autocannon: 'heavy', las: 'bolter', lascannon: 'heavy', plasma: 'heavy', melta: 'flame', flamer: 'flame',
  missile: 'heavy', grenade: 'heavy', gauss: 'psychic', pulse: 'psychic', dakka: 'shoota', bio: 'shoota', psychic: 'psychic',
}

/** A family mapped back onto the 5 SFX/tracer flavours. */
export function familyFlavour(family: VfxFamily): RangedFlavour {
  return FAMILY_FLAVOUR[family]
}
