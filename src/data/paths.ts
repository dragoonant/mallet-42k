// Pure (no Node/Vite APIs) mapping from a path under src/data/ to the schema that validates it
// and the DataBundle bucket it belongs in. Shared by tools/validate-data.ts, tests/data, and
// src/data/index.ts so the directory convention documented in src/data/README.md is defined once.
import type { SchemaName } from './schema'

// Every SchemaName except `common`, which is only ever referenced by other schemas, never used
// to validate a data file directly.
export type DataKind = Exclude<SchemaName, 'common'>

/**
 * Classifies a path relative to `src/data/` (forward- or back-slashed; a leading `./` is fine)
 * per the layout in src/data/README.md. Returns `null` for `src/data/schema/**` (schema
 * definitions, not data instances) and for anything that doesn't match a known convention.
 */
export function schemaForDataPath(relPath: string): DataKind | null {
  const parts = relPath.split(/[\\/]/).filter((p) => p.length > 0 && p !== '.')
  if (parts.length === 0 || parts[0] === 'schema') return null

  if (parts[0] === 'core' && parts.length === 2) {
    if (parts[1] === 'stratagems.json') return 'stratagem'
    if (parts[1] === 'abilities.json') return 'ability'
    return null
  }

  if (parts[0] === 'missions' && parts.length === 2) return 'mission'
  if (parts[0] === 'terrain' && parts.length === 2) return 'terrainLayout'

  if (parts[0] === 'factions') {
    if (parts.length === 3) {
      switch (parts[2]) {
        case 'faction.json':
          return 'faction'
        case 'weapons.json':
          return 'weapon'
        case 'abilities.json':
          return 'ability'
        case 'stratagems.json':
          return 'stratagem'
        case 'enhancements.json':
          return 'enhancement'
        default:
          return null
      }
    }
    if (parts.length === 4) {
      if (parts[2] === 'datasheets') return 'datasheet'
      if (parts[2] === 'patrols') return 'combatPatrol'
    }
  }

  return null
}

// Files under these single-file kinds are one JSON object; the rest (`ability`, `weapon`,
// `stratagem`, `enhancement`, `datasheet`) are a JSON array, per src/data/schema/*.schema.json.
export const SINGLE_OBJECT_KINDS: ReadonlySet<DataKind> = new Set([
  'faction',
  'combatPatrol',
  'mission',
  'terrainLayout',
])
