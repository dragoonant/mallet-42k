// Data plumbing: resolves a (datasheetId, faction) pair to render info by calling the data
// module's own public API (loadBundle) — this file never edits src/data or src/engine, and the
// engine never sees any of this; it only sees Model.base / Model.height.
import { useEffect, useState } from 'react'
import { loadBundle } from '@/data'
import type { DataBundle, DatasheetData, FactionData } from '@/data/types'
import type { ArchetypeKind, KitId, PaintColors } from './types'

const MM_PER_INCH = 25.4

// ---- bundle loading (module-level singleton so every <Figure> shares one load) ----------------

let cache: DataBundle | undefined
let pending: Promise<void> | undefined
const listeners = new Set<() => void>()

function kick() {
  if (cache || pending) return
  pending = loadBundle()
    .then((b) => {
      cache = b
    })
    .catch(() => {
      // Data failed to load (or isn't present in this runtime) — every resolver below has a
      // sensible fallback, so figures still render, just undecorated.
      cache = undefined
    })
    .finally(() => {
      listeners.forEach((l) => l())
    })
}

/** The loaded DataBundle, or undefined until (if ever) it resolves. Figures render with sensible
 *  defaults in the meantime rather than blocking on it. */
export function useDataBundle(): DataBundle | undefined {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (cache) return
    const listener = () => setTick((n) => n + 1)
    listeners.add(listener)
    kick()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return cache
}

// ---- paint scheme -------------------------------------------------------------------------

const DEFAULT_PAINT: PaintColors = {
  primary: '#5a5f6b',
  secondary: '#8a8f98',
  trim: '#c9c9c9',
  metal: '#9a9a9a',
  decal: '#ffffff',
}

export function resolvePaintColors(faction?: FactionData): PaintColors {
  return faction?.paintScheme ?? DEFAULT_PAINT
}

// ---- kit resolution: datasheet id -> archetype + kit, with a sensible fallback ----------------

const KNOWN_KIT: Record<string, KitId> = {
  'sm.captain-octavius': 'sm-terminator',
  'sm.librarian-tantus': 'sm-terminator',
  'sm.terminator-squad': 'sm-terminator',
  'sm.infernus-squad': 'sm-tacticus',
  'ork.boyz': 'ork-boy',
  'ork.warboss-gordrang': 'ork-warboss',
  'ork.deff-dread': 'ork-deff-dread',
  'ork.deffkoptas': 'ork-deffkopta',
  'nec.necron-warriors': 'nec-warrior',
  'nec.overlord-amonhotekh': 'nec-overlord',
  'nec.skorpekh-destroyers': 'nec-skorpekh',
  'nec.canoptek-doomstalker': 'nec-doomstalker',
  'nec.canoptek-scarab-swarms': 'nec-scarab',
  'csm.aranis-zarkan': 'csm-zarkan',
  'csm.possessed': 'csm-possessed',
  'csm.legionaries': 'csm-legionary',
  'csm.cultist-mob': 'csm-cultist',
  'tyr.terror-of-vardenghast': 'tyr-prime',
  'tyr.psychophage': 'tyr-psychophage',
  'tyr.termagants': 'tyr-termagant',
  'tyr.barbgaunts': 'tyr-barbgaunt',
  'tyr.von-ryans-leapers': 'tyr-leaper',
  'ade.canoness-adalya': 'ade-canoness',
  'ade.battle-sisters-squad': 'ade-sister',
  'ade.celestian-sacresants': 'ade-sacresant',
  'ade.arco-flagellants': 'ade-arco',
  'am.cadian-shock-troops': 'am-guardsman',
  'am.command-squad-karsk': 'am-veteran',
  'am.armoured-sentinels': 'am-sentinel',
  'am.field-ordnance-battery': 'am-field-gun',
  'gk.strike-squad': 'gk-knight',
  'gk.brotherhood-terminator-squad': 'gk-terminator',
  'gk.librarian-aurellios': 'gk-librarian',
  'gk.nemesis-dreadknight': 'gk-dreadknight',
  'tau.strike-team': 'tau-fire-warrior',
  'tau.shasnel-dtano': 'tau-fireblade',
  'tau.aun-shar': 'tau-ethereal',
  'tau.stealth-battlesuits': 'tau-stealth',
  'tau.ghostkeel': 'tau-ghostkeel',
  'gsc.neophyte-hybrids': 'gsc-neophyte',
  'gsc.acolyte-hybrids': 'gsc-acolyte',
  'gsc.aberrants': 'gsc-aberrant',
  'gsc.magus-veridielle': 'gsc-magus',
  'gsc.goliath-rockgrinder': 'gsc-rockgrinder',
}

/** Models of a mixed unit that look different from the rest of it (a flamer sister is not a rifle sister), keyed
 *  `<datasheet id>/<datasheet modelId>`. A model not listed here takes its datasheet's kit above. */
const KNOWN_KIT_BY_MODEL: Record<string, KitId> = {
  'ade.canoness-adalya/canoness': 'ade-canoness',
  'ade.battle-sisters-squad/superior': 'ade-sister-superior',
  'ade.battle-sisters-squad/sister-flamer': 'ade-sister-flamer',
  'ade.battle-sisters-squad/sister-heavy-flamer': 'ade-sister-heavy-flamer',
  'ade.battle-sisters-squad/sister-simulacrum': 'ade-sister-simulacrum',
  'ade.battle-sisters-squad/sister': 'ade-sister',
  'ade.celestian-sacresants/sacresant': 'ade-sacresant',
  'ade.arco-flagellants/arco': 'ade-arco',
  'am.cadian-shock-troops/sergeant': 'am-sergeant',
  'am.cadian-shock-troops/trooper': 'am-guardsman',
  'am.command-squad-karsk/karsk': 'am-officer',
  'am.command-squad-karsk/veteran': 'am-veteran',
  'am.command-squad-karsk/veteran-medic': 'am-medic',
  'am.command-squad-karsk/veteran-standard': 'am-standard',
  'am.field-ordnance-battery/gun-bombast': 'am-field-gun',
  'am.field-ordnance-battery/gun-malleus': 'am-rocket-battery',
  'tau.strike-team/shasui': 'tau-shasui',
  'tau.strike-team/fire-warrior-rifle': 'tau-fire-warrior',
  'tau.strike-team/fire-warrior-carbine': 'tau-fire-warrior',
  'tau.stealth-battlesuits/shasvre': 'tau-stealth',
  'tau.stealth-battlesuits/shasui': 'tau-stealth',
  'gsc.neophyte-hybrids/leader': 'gsc-neophyte-leader',
  'gsc.neophyte-hybrids/hybrid': 'gsc-neophyte',
  'gsc.neophyte-hybrids/icon': 'gsc-neophyte-icon',
  'gsc.neophyte-hybrids/heavy-stubber': 'gsc-neophyte-stubber',
  'gsc.neophyte-hybrids/seismic-cannon': 'gsc-neophyte-seismic',
  'gsc.neophyte-hybrids/webber': 'gsc-neophyte-webber',
  'gsc.acolyte-hybrids/leader': 'gsc-acolyte-leader',
  'gsc.acolyte-hybrids/hybrid': 'gsc-acolyte',
  'gsc.acolyte-hybrids/demolitions': 'gsc-acolyte-demolitions',
  'gsc.acolyte-hybrids/mining-tool': 'gsc-acolyte-mining',
  'gsc.aberrants/aberrant': 'gsc-aberrant',
  'gsc.aberrants/hypermorph': 'gsc-hypermorph',
}

const KIT_ARCHETYPE: Record<KitId, ArchetypeKind> = {
  'sm-tacticus': 'infantry',
  'sm-terminator': 'heavy',
  'ork-boy': 'infantry',
  'ork-warboss': 'heavy',
  'ork-deff-dread': 'monster',
  'ork-deffkopta': 'vehicle',
  'nec-warrior': 'infantry',
  'nec-overlord': 'heavy',
  'nec-skorpekh': 'heavy',
  'nec-doomstalker': 'monster',
  'nec-scarab': 'infantry',
  'csm-legionary': 'infantry',
  'csm-zarkan': 'heavy',
  'csm-possessed': 'heavy',
  'csm-cultist': 'infantry',
  'tyr-prime': 'heavy',
  'tyr-psychophage': 'monster',
  'tyr-termagant': 'infantry',
  'tyr-barbgaunt': 'infantry',
  'tyr-leaper': 'infantry',
  'ade-canoness': 'infantry',
  'ade-sister': 'infantry',
  'ade-sister-superior': 'infantry',
  'ade-sister-flamer': 'infantry',
  'ade-sister-heavy-flamer': 'infantry',
  'ade-sister-simulacrum': 'infantry',
  'ade-sacresant': 'infantry',
  'ade-arco': 'infantry',
  'am-guardsman': 'infantry',
  'am-sergeant': 'infantry',
  'am-officer': 'infantry',
  'am-veteran': 'infantry',
  'am-medic': 'infantry',
  'am-standard': 'infantry',
  'am-sentinel': 'vehicle',
  'am-field-gun': 'heavy',
  'am-rocket-battery': 'heavy',
  'gk-knight': 'infantry',
  'gk-terminator': 'heavy',
  'gk-librarian': 'heavy',
  'gk-dreadknight': 'monster',
  'tau-fire-warrior': 'infantry',
  'tau-shasui': 'infantry',
  'tau-fireblade': 'infantry',
  'tau-ethereal': 'infantry',
  'tau-stealth': 'heavy',
  'tau-ghostkeel': 'vehicle',
  'gsc-neophyte': 'infantry',
  'gsc-neophyte-leader': 'infantry',
  'gsc-neophyte-icon': 'infantry',
  'gsc-neophyte-stubber': 'infantry',
  'gsc-neophyte-seismic': 'infantry',
  'gsc-neophyte-webber': 'infantry',
  'gsc-acolyte': 'infantry',
  'gsc-acolyte-leader': 'infantry',
  'gsc-acolyte-demolitions': 'infantry',
  'gsc-acolyte-mining': 'infantry',
  'gsc-aberrant': 'heavy',
  'gsc-hypermorph': 'heavy',
  'gsc-magus': 'infantry',
  'gsc-rockgrinder': 'vehicle',
  'generic-infantry': 'infantry',
  'generic-heavy': 'heavy',
  'generic-monster': 'monster',
  'generic-vehicle': 'vehicle',
}

const GENERIC_KIT_FOR_ARCHETYPE: Record<ArchetypeKind, KitId> = {
  infantry: 'generic-infantry',
  heavy: 'generic-heavy',
  monster: 'generic-monster',
  vehicle: 'generic-vehicle',
}

/** Every datasheet this kit was built for resolves directly; an id it has never seen falls back
 *  to a generic look for whatever archetype the data says it is (or plain infantry if the data
 *  hasn't loaded either) — new datasheets always render as *something*. */
export function resolveFigureKit(datasheetId: string, datasheet?: DatasheetData, modelId?: string): { archetype: ArchetypeKind; kit: KitId } {
  const known = (modelId ? KNOWN_KIT_BY_MODEL[`${datasheetId}/${modelId}`] : undefined) ?? KNOWN_KIT[datasheetId]
  if (known) return { archetype: KIT_ARCHETYPE[known], kit: known }
  const archetype: ArchetypeKind = datasheet?.figure.archetype ?? 'infantry'
  return { archetype, kit: GENERIC_KIT_FOR_ARCHETYPE[archetype] }
}

// ---- base disc + figure height ----------------------------------------------------------------

// vehicle bodies (VehicleBody.tsx) are authored small relative to their oval bases — bumped up from
// 0.95 so a Deffkopta's chassis/rotor actually fills its 75mm base instead of reading as a bare disc.
const DEFAULT_HEIGHT_BY_ARCHETYPE: Record<ArchetypeKind, number> = {
  infantry: 1.1,
  heavy: 1.3,
  monster: 2.6,
  vehicle: 1.8,
}

export interface ResolvedBase {
  /** Half-extent along local X, in inches. */
  radiusX: number
  /** Half-extent along local Z, in inches (equals radiusX for a round base). */
  radiusZ: number
  /** Figure height (crown above the base disc), in world (inch) units. */
  height: number
}

const DEFAULT_BASE_MM = 32

export function resolveBase(datasheet: DatasheetData | undefined, archetype: ArchetypeKind): ResolvedBase {
  const base = datasheet?.composition[0]?.base
  const mm = base?.mm ?? DEFAULT_BASE_MM
  const mm2 = base?.shape === 'oval' ? (base.mm2 ?? mm) : mm
  const height = datasheet?.figure.scale ?? DEFAULT_HEIGHT_BY_ARCHETYPE[archetype]
  return {
    radiusX: mm / 2 / MM_PER_INCH,
    radiusZ: mm2 / 2 / MM_PER_INCH,
    height,
  }
}
