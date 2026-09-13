// Assembles the DataBundle from every JSON file under src/data/ (layout documented in
// src/data/README.md). Two loaders are used depending on how this module is executed:
//
//  - Vite (the app build, and vitest — which transforms sources through Vite too) statically
//    rewrites the literal `import.meta.glob(...)` calls below into real imports.
//  - Plain Node/tsx (tools) never applies that rewrite, so the calls throw at runtime; the catch
//    falls back to walking src/data/ with `node:fs`, loaded dynamically (behind `@vite-ignore`)
//    so a browser bundle never has to resolve a Node built-in it will not actually reach.
//
// `loadBundle()` is the lazy, memoized entry point: nothing is read until first called.
import type {
  AbilityDescriptor,
  CombatPatrolData,
  DataBundle,
  DatasheetData,
  EnhancementData,
  FactionData,
  Id,
  MissionData,
  StratagemData,
  TerrainLayoutData,
  WeaponData,
} from './types'
import { schemaForDataPath, SINGLE_OBJECT_KINDS, type DataKind } from './paths'

// Bumped when the shipped game data changes shape or content in a way consumers should know about.
export const DATA_VERSION = '0.1.0'

// Vite's import.meta.glob transform only accepts a literal string pattern and a literal options
// object (no variables) at each call site, so each directory from the src/data/README.md layout
// needs its own call, merged below.
/** Eager Vite glob load. Returns null (never throws past this) when import.meta.glob is not a real function. */
function loadViaGlob(): Record<string, unknown> | null {
  try {
    return {
      ...import.meta.glob('./core/*.json', { eager: true, import: 'default' }),
      ...import.meta.glob('./missions/*.json', { eager: true, import: 'default' }),
      ...import.meta.glob('./terrain/*.json', { eager: true, import: 'default' }),
      ...import.meta.glob('./factions/*/*.json', { eager: true, import: 'default' }),
      ...import.meta.glob('./factions/*/datasheets/*.json', { eager: true, import: 'default' }),
      ...import.meta.glob('./factions/*/patrols/*.json', { eager: true, import: 'default' }),
    }
  } catch {
    return null
  }
}

/** Node fallback: walk src/data/ on disk. Only reachable when loadViaGlob() could not run (tools, plain Node). */
async function loadViaFs(): Promise<Record<string, unknown>> {
  const fs = await import(/* @vite-ignore */ 'node:fs')
  const path = await import(/* @vite-ignore */ 'node:path')
  const { fileURLToPath } = await import(/* @vite-ignore */ 'node:url')

  const root = path.dirname(fileURLToPath(import.meta.url))
  const files: Record<string, unknown> = {}

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'schema') continue // schema definitions, not data instances
        walk(path.join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const full = path.join(dir, entry.name)
        const rel = path.relative(root, full).split(path.sep).join('/')
        files[`./${rel}`] = JSON.parse(fs.readFileSync(full, 'utf8'))
      }
    }
  }
  walk(root)
  return files
}

function emptyBundle(): DataBundle {
  return {
    version: DATA_VERSION,
    factions: {},
    datasheets: {},
    weapons: {},
    abilities: {},
    stratagems: {},
    enhancements: {},
    patrols: {},
    missions: {},
    terrainLayouts: {},
  }
}

function put<T extends { id: Id }>(map: Record<Id, T>, item: T, source: string): void {
  if (Object.prototype.hasOwnProperty.call(map, item.id)) {
    throw new Error(`duplicate id "${item.id}" (${source})`)
  }
  map[item.id] = item
}

function assemble(files: Record<string, unknown>): DataBundle {
  const bundle = emptyBundle()

  for (const [globPath, content] of Object.entries(files)) {
    const relPath = globPath.replace(/^\.\//, '')
    const kind = schemaForDataPath(relPath)
    if (!kind) continue // src/data/schema/** or anything outside the convention; validate-data.ts flags stray files

    if (SINGLE_OBJECT_KINDS.has(kind)) {
      putSingle(bundle, kind, content as { id: Id }, relPath)
    } else {
      for (const item of content as { id: Id }[]) putMany(bundle, kind, item, relPath)
    }
  }

  return bundle
}

function putSingle(bundle: DataBundle, kind: DataKind, item: { id: Id }, source: string): void {
  switch (kind) {
    case 'faction':
      return put(bundle.factions, item as FactionData, source)
    case 'combatPatrol':
      return put(bundle.patrols, item as CombatPatrolData, source)
    case 'mission':
      return put(bundle.missions, item as MissionData, source)
    case 'terrainLayout':
      return put(bundle.terrainLayouts, item as TerrainLayoutData, source)
    default:
      throw new Error(`putSingle: "${kind}" is not a single-object kind`)
  }
}

function putMany(bundle: DataBundle, kind: DataKind, item: { id: Id }, source: string): void {
  switch (kind) {
    case 'weapon':
      return put(bundle.weapons, item as WeaponData, source)
    case 'ability':
      return put(bundle.abilities, item as AbilityDescriptor, source)
    case 'stratagem':
      return put(bundle.stratagems, item as StratagemData, source)
    case 'enhancement':
      return put(bundle.enhancements, item as EnhancementData, source)
    case 'datasheet':
      return put(bundle.datasheets, item as DatasheetData, source)
    default:
      throw new Error(`putMany: "${kind}" is not an array-file kind`)
  }
}

let cached: Promise<DataBundle> | undefined

/** Lazily loads and assembles every data file into a DataBundle. Memoized after the first call. */
export function loadBundle(): Promise<DataBundle> {
  if (!cached) {
    cached = (async () => assemble(loadViaGlob() ?? (await loadViaFs())))().catch((err: unknown) => {
      cached = undefined // allow a retry (e.g. in a test that fixed the data between calls)
      throw err
    })
  }
  return cached
}

export type { DataBundle } from './types'
