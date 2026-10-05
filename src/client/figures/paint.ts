// Army painter (client-only, never seen by the engine): per-faction major/minor colours and a base
// style, persisted to localStorage. Procedural figures read them through applyPaintToColors; GLB
// figures through glbPaint.ts. "Unset" means "the army's stock look" — nothing is changed.
import { create } from 'zustand'
import type { PaintColors } from './types'

export interface ArmyPaint {
  /** '#rrggbb' — replaces the army's main armour colour. */
  major?: string
  /** '#rrggbb' — replaces the army's secondary colour. */
  minor?: string
  /** Base preset id (BASE_PRESETS); unset = the stock black base. */
  base?: string
  /** Optional '#rrggbb' override for the base's outer rim. */
  rim?: string
}

export interface BasePreset {
  id: string
  label: string
  /** Ground surface colour. */
  color: string
  /** Rim (side wall) colour. */
  rim: string
}

export const BASE_PRESETS: BasePreset[] = [
  { id: 'black', label: 'Black', color: '#141414', rim: '#050505' },
  { id: 'grass', label: 'Grass green', color: '#4f7f33', rim: '#25381a' },
  { id: 'sand', label: 'Desert sand', color: '#cdb67c', rim: '#8a7545' },
  { id: 'urban', label: 'Urban grey', color: '#6d7078', rim: '#34363c' },
  { id: 'snow', label: 'Snow white', color: '#eef3f8', rim: '#9aa8b6' },
]

export interface ResolvedBase {
  color: string
  rim: string
}

export function resolveBaseStyle(paint?: ArmyPaint): ResolvedBase | null {
  if (!paint || (!paint.base && !paint.rim)) return null
  const preset = BASE_PRESETS.find((p) => p.id === paint.base) ?? BASE_PRESETS[0]
  return { color: preset.color, rim: paint.rim ?? preset.rim }
}

const ALIASES: Record<string, string> = { 'space-marines': 'sm', orks: 'ork', nec: 'necrons' } // canonical = the data bundle's faction ids
export const canonFaction = (id: string): string => ALIASES[id] ?? id

const KEY = 'mallet42k.armyPaint'
const HEX = /^#[0-9a-fA-F]{6}$/

function sanitize(p: unknown): ArmyPaint {
  const o = (p ?? {}) as Record<string, unknown>
  const out: ArmyPaint = {}
  if (typeof o.major === 'string' && HEX.test(o.major)) out.major = o.major
  if (typeof o.minor === 'string' && HEX.test(o.minor)) out.minor = o.minor
  if (typeof o.base === 'string' && BASE_PRESETS.some((b) => b.id === o.base)) out.base = o.base
  if (typeof o.rim === 'string' && HEX.test(o.rim)) out.rim = o.rim
  return out
}

function load(): Record<string, ArmyPaint> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: Record<string, ArmyPaint> = {}
    for (const [k, v] of Object.entries(raw)) out[k] = sanitize(v)
    return out
  } catch {
    return {}
  }
}

function save(m: Record<string, ArmyPaint>): void {
  try {
    const { '*': _session, ...rest } = m // the gallery-URL override is never persisted
    void _session
    window.localStorage.setItem(KEY, JSON.stringify(rest))
  } catch {
    /* storage unavailable */
  }
}

interface PaintState {
  byFaction: Record<string, ArmyPaint>
  /** Merge a patch (undefined value clears that field). persist=false keeps it session-only (URL params). */
  setPaint: (faction: string, patch: Partial<Record<keyof ArmyPaint, string | undefined>>, persist?: boolean) => void
  reset: (faction: string) => void
}

export const usePaintStore = create<PaintState>((set, get) => ({
  byFaction: load(),
  setPaint: (faction, patch, persist = true) => {
    const id = canonFaction(faction)
    const next = sanitize({ ...get().byFaction[id], ...patch }) // an undefined value fails sanitize's checks, i.e. clears the field
    const byFaction = { ...get().byFaction, [id]: next }
    set({ byFaction })
    if (persist) save(byFaction)
  },
  reset: (faction) => {
    const byFaction = { ...get().byFaction }
    delete byFaction[canonFaction(faction)]
    set({ byFaction })
    save(byFaction)
  },
}))

/** The painted look for a faction ('*' is the gallery-URL override that applies to every army). */
export function useArmyPaint(faction: string): ArmyPaint | undefined {
  const id = canonFaction(faction)
  return usePaintStore((s) => s.byFaction[id] ?? s.byFaction['*'])
}

export const paintKey = (p?: ArmyPaint): string => (p ? `${p.major ?? ''}|${p.minor ?? ''}|${p.base ?? ''}|${p.rim ?? ''}` : '')

/** Procedural figures: major -> primary, minor -> secondary. Returns the input untouched when unpainted. */
export function applyPaintToColors(colors: PaintColors, paint?: ArmyPaint): PaintColors {
  if (!paint || (!paint.major && !paint.minor)) return colors
  return { ...colors, primary: paint.major ?? colors.primary, secondary: paint.minor ?? colors.secondary }
}

/** Gallery dev viewer: `&major=%23hex&minor=%23hex&base=<preset>&rim=%23hex` applies to every army, unsaved. */
export function applyPaintFromUrl(): void {
  try {
    const q = new URLSearchParams(window.location.search)
    const patch = { major: q.get('major') ?? undefined, minor: q.get('minor') ?? undefined, base: q.get('base') ?? undefined, rim: q.get('rim') ?? undefined }
    if (Object.values(patch).some(Boolean)) usePaintStore.getState().setPaint('*', patch, false)
  } catch {
    /* ignore */
  }
}
