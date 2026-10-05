// Small original inline-SVG weapon silhouettes for the unit card's weapon tooltip. There are no weapon
// image assets, so each category is a chunky one-colour shape on a 64x64 grid (fill = currentColor, with
// a few translucent accents). `weaponIconKind` picks a category from the weapon's name, id, keywords and
// range — it always returns something, so a weapon added to the data later still gets a picture.
import type { ReactElement } from 'react'

export type WeaponIconKind =
  | 'pistol'
  | 'rifle'
  | 'heavy'
  | 'flamer'
  | 'plasma'
  | 'rocket'
  | 'grenade'
  | 'blade'
  | 'axe'
  | 'fist'
  | 'saw'
  | 'staff'
  | 'psychic'
  | 'ranged'
  | 'melee'

export const WEAPON_ICON_KINDS: readonly WeaponIconKind[] = [
  'pistol', 'rifle', 'heavy', 'flamer', 'plasma', 'rocket', 'grenade', 'blade', 'axe', 'fist', 'saw', 'staff', 'psychic', 'ranged', 'melee',
]

/** The slice of a weapon the matcher reads — satisfied by both RuntimeWeapon (`kind`) and WeaponData (`type`). */
export interface IconWeapon {
  id?: string
  name: string
  kind?: 'ranged' | 'melee'
  type?: 'ranged' | 'melee'
  range?: number
  abilities?: { ability: string }[]
}

export function weaponIconKind(weapon: IconWeapon): WeaponIconKind {
  const text = `${weapon.id ?? ''} ${weapon.name}`.toLowerCase()
  const has = (a: string) => !!weapon.abilities?.some((x) => x.ability === a)
  const melee = (weapon.kind ?? weapon.type) ? (weapon.kind ?? weapon.type) === 'melee' : weapon.range === 0

  if (melee) {
    if (/klaw|claw|fist|gauntlet|knuckle/.test(text)) return 'fist'
    if (/saw|spinnin|spinning|rotor|drill/.test(text)) return 'saw'
    if (/axe|choppa|cleaver|hatchet/.test(text)) return 'axe'
    if (has('PSYCHIC') || /force|staff|rod|crozius|stave/.test(text)) return 'staff'
    if (/sword|blade|relic|power weapon|knife|dagger|lance|talon|scythe/.test(text)) return 'blade'
    return 'melee'
  }

  if (/grenade|krak|frag|bomb/.test(text)) return 'grenade'
  if (has('PSYCHIC') || /smite|witchfire|psy|warp/.test(text)) return 'psychic'
  if (/rokkit|rocket|missile|launch|krak/.test(text) || has('BLAST')) return 'rocket'
  if (has('TORRENT') || /flam|burna|pyre|incinerat/.test(text)) return 'flamer'
  if (/plasma|melta|mega|blasta|laser|energy|beam|hazard/.test(text) || has('MELTA') || has('HAZARDOUS')) return 'plasma'
  if (/cannon|kannon|big shoota|heavy|autocannon|gatling/.test(text) || has('HEAVY')) return 'heavy'
  if (has('PISTOL') || /pistol|slugga|revolver/.test(text)) return 'pistol'
  if (/bolter|shoota|rifle|carbine|gun|dakka|blaster/.test(text) || has('RAPID_FIRE') || has('ASSAULT')) return 'rifle'
  return 'ranged'
}

const SHADE = 'rgba(0,0,0,0.38)'
const GLOW = 'rgba(255,255,255,0.35)'

/** Teeth for the saw blade, generated once rather than hand-typed. */
function sawTeeth(): string {
  const pts: string[] = []
  const n = 12
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 0.5) / n) * Math.PI * 2
    const a2 = ((i + 1) / n) * Math.PI * 2
    const p = (r: number, a: number) => `${(32 + Math.cos(a) * r).toFixed(1)},${(32 + Math.sin(a) * r).toFixed(1)}`
    pts.push(p(17, a0), p(28, a1), p(17, a2))
  }
  return pts.join(' ')
}
const SAW_POINTS = sawTeeth()

function shapes(kind: WeaponIconKind): ReactElement {
  switch (kind) {
    case 'pistol':
      return (
        <>
          <rect x="6" y="18" width="46" height="13" rx="3" />
          <polygon points="22,31 36,31 41,55 27,55" />
          <rect x="34" y="31" width="9" height="4" />
          <rect x="48" y="13" width="5" height="5" />
          <rect x="10" y="21" width="22" height="3" fill={SHADE} />
        </>
      )
    case 'rifle':
      return (
        <>
          <polygon points="3,24 18,24 18,38 3,43" />
          <rect x="18" y="22" width="27" height="13" rx="2" />
          <rect x="45" y="25" width="15" height="5" />
          <rect x="58" y="23" width="4" height="9" />
          <polygon points="27,35 36,35 38,50 29,50" />
          <polygon points="18,35 25,35 23,47 16,47" />
          <rect x="24" y="16" width="14" height="6" rx="2" />
          <rect x="21" y="25" width="18" height="3" fill={SHADE} />
        </>
      )
    case 'heavy':
      return (
        <>
          <rect x="8" y="25" width="36" height="16" rx="3" />
          <rect x="44" y="28" width="14" height="10" />
          <rect x="56" y="24" width="6" height="18" rx="1" />
          <rect x="12" y="18" width="18" height="7" rx="3" />
          <rect x="14" y="41" width="16" height="11" rx="2" />
          <polygon points="36,41 41,41 48,57 43,57" />
          <polygon points="30,41 34,41 30,57 26,57" />
          <rect x="12" y="29" width="28" height="3" fill={SHADE} />
        </>
      )
    case 'flamer':
      return (
        <>
          <rect x="4" y="22" width="24" height="20" rx="10" />
          <rect x="26" y="29" width="20" height="7" />
          <polygon points="12,42 20,42 18,56 10,56" />
          <path d="M47 32 C49 24 55 25 53 15 C63 21 63 38 55 43 C50 46 45 40 47 32 Z" />
          <path d="M52 36 C52 31 56 31 55 26 C60 30 59 38 55 40 C53 41 51 39 52 36 Z" fill={GLOW} />
          <rect x="9" y="26" width="14" height="3" rx="1.5" fill={SHADE} />
        </>
      )
    case 'plasma':
      return (
        <>
          <rect x="6" y="26" width="30" height="13" rx="6" />
          <rect x="36" y="23" width="4" height="19" rx="1" />
          <rect x="42" y="23" width="4" height="19" rx="1" />
          <circle cx="54" cy="32.5" r="8" />
          <circle cx="54" cy="32.5" r="3.5" fill={GLOW} />
          <polygon points="13,39 22,39 20,54 11,54" />
          <path d="M50 18 L53 23 M58 18 L56 23 M60 46 L56 42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </>
      )
    case 'rocket':
      return (
        <>
          <rect x="4" y="27" width="38" height="13" rx="3" />
          <rect x="2" y="25" width="6" height="17" rx="2" />
          <rect x="34" y="31" width="20" height="6" />
          <polygon points="54,28 63,34 54,40" />
          <polygon points="34,31 28,24 34,24" />
          <polygon points="34,37 28,44 34,44" />
          <polygon points="14,40 22,40 20,54 12,54" />
          <rect x="10" y="30" width="20" height="3" fill={SHADE} />
        </>
      )
    case 'grenade':
      return (
        <>
          <ellipse cx="32" cy="39" rx="16" ry="17" />
          <rect x="26" y="16" width="12" height="9" rx="2" />
          <path d="M38 17 H49 L53 24 H44 Z" />
          <circle cx="19" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M16 39 H48 M17 31 H47 M17 47 H47 M32 24 V56" stroke={SHADE} strokeWidth="2" fill="none" />
        </>
      )
    case 'blade':
      return (
        <g transform="rotate(40 32 32)">
          <polygon points="32,2 39,10 39,40 25,40 25,10" />
          <rect x="31" y="8" width="2" height="30" fill={SHADE} />
          <rect x="15" y="40" width="34" height="6" rx="3" />
          <rect x="29" y="46" width="6" height="9" rx="1" />
          <circle cx="32" cy="58" r="4" />
        </g>
      )
    case 'axe':
      return (
        <g transform="rotate(28 32 32)">
          <rect x="29" y="4" width="6" height="56" rx="3" />
          <path d="M35 9 C52 6 59 17 57 31 C52 27 44 29 35 29 Z" />
          <polygon points="29,14 17,20 29,25" />
          <path d="M40 14 C47 14 51 18 52 23" stroke={SHADE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'fist':
      return (
        <>
          <rect x="12" y="9" width="10" height="20" rx="5" />
          <rect x="23" y="7" width="10" height="22" rx="5" />
          <rect x="34" y="8" width="10" height="21" rx="5" />
          <rect x="45" y="11" width="9" height="19" rx="4.5" />
          <rect x="10" y="22" width="46" height="26" rx="9" />
          <path d="M6 30 C6 24 14 24 16 32 L16 40 C10 40 6 37 6 30 Z" />
          <rect x="14" y="46" width="38" height="12" rx="3" />
          <rect x="14" y="49" width="38" height="2.5" fill={SHADE} />
        </>
      )
    case 'saw':
      return (
        <>
          <polygon points={SAW_POINTS} />
          <circle cx="32" cy="32" r="9" fill={SHADE} />
          <circle cx="32" cy="32" r="3.5" />
        </>
      )
    case 'staff':
      return (
        <g transform="rotate(25 32 32)">
          <rect x="29" y="14" width="6" height="46" rx="3" />
          <circle cx="32" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="5" />
          <circle cx="32" cy="13" r="3" />
          <rect x="26" y="30" width="12" height="4" rx="2" />
        </g>
      )
    case 'psychic':
      return (
        <>
          <circle cx="32" cy="32" r="12" />
          <circle cx="32" cy="32" r="5" fill={GLOW} />
          <path
            d="M32 5 V15 M32 49 V59 M5 32 H15 M49 32 H59 M13 13 L20 20 M44 44 L51 51 M51 13 L44 20 M20 44 L13 51"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )
    case 'ranged':
      return (
        <>
          <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" strokeWidth="5" />
          <path d="M32 4 V18 M32 46 V60 M4 32 H18 M46 32 H60" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="32" cy="32" r="4" />
        </>
      )
    case 'melee':
    default:
      return (
        <>
          <g transform="rotate(45 32 32)">
            <rect x="26" y="4" width="12" height="56" rx="6" />
            <rect x="26" y="40" width="12" height="4" fill={SHADE} />
          </g>
          <g transform="rotate(-45 32 32)">
            <rect x="26" y="4" width="12" height="56" rx="6" />
            <rect x="26" y="40" width="12" height="4" fill={SHADE} />
          </g>
        </>
      )
  }
}

export function WeaponIcon({ kind, size = 56, color = 'currentColor' }: { kind: WeaponIconKind; size?: number; color?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="currentColor"
      style={{ color, display: 'block' }}
      aria-hidden="true"
      data-testid={`weapon-icon-${kind}`}
    >
      {shapes(kind)}
    </svg>
  )
}
