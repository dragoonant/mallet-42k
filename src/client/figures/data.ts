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
}

const KIT_ARCHETYPE: Record<KitId, ArchetypeKind> = {
  'sm-tacticus': 'infantry',
  'sm-terminator': 'heavy',
  'ork-boy': 'infantry',
  'ork-warboss': 'heavy',
  'ork-deff-dread': 'monster',
  'ork-deffkopta': 'vehicle',
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
export function resolveFigureKit(datasheetId: string, datasheet?: DatasheetData): { archetype: ArchetypeKind; kit: KitId } {
  const known = KNOWN_KIT[datasheetId]
  if (known) return { archetype: KIT_ARCHETYPE[known], kit: known }
  const archetype: ArchetypeKind = datasheet?.figure.archetype ?? 'infantry'
  return { archetype, kit: GENERIC_KIT_FOR_ARCHETYPE[archetype] }
}

// ---- base disc + figure height ----------------------------------------------------------------

const DEFAULT_HEIGHT_BY_ARCHETYPE: Record<ArchetypeKind, number> = {
  infantry: 1.1,
  heavy: 1.3,
  monster: 2.6,
  vehicle: 0.95,
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
