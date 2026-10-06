// Runs every ranged weapon in the data bundle through the vfx-family classifier and prints the per-family
// counts plus any weapon that only matched on its faction / the plain default (a "generic fallback").
//   npx tsx tools/vfx-families.ts
import { loadBundle } from '../src/data'
import { classifyVfxFamily, VFX_FAMILIES } from '../src/client/weaponFlavour'

const bundle = await loadBundle()
const counts: Record<string, number> = Object.fromEntries(VFX_FAMILIES.map((f) => [f, 0]))
const fallbacks: string[] = []
const byFamily: Record<string, string[]> = {}
for (const [id, weapon] of Object.entries(bundle.weapons)) {
  if (weapon.type !== 'ranged') continue
  const { family, via } = classifyVfxFamily(id, weapon, '')
  counts[family]++
  ;(byFamily[family] ??= []).push(weapon.name)
  if (via !== 'keyword') fallbacks.push(`${id} -> ${family} (${via})`)
}
console.log(JSON.stringify(counts))
for (const f of VFX_FAMILIES) console.log(`${f}: ${(byFamily[f] ?? []).join(', ')}`)
console.log('fallbacks:', fallbacks.length ? fallbacks : 'none')
