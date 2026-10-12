#!/usr/bin/env -S npx tsx
// Validates every JSON file under src/data/** against the schema its path implies (the
// directory/filename convention is documented in src/data/README.md). Run: `npm run validate:data`.
//
// The classification and Ajv wiring here are also exported so tests/data/validate.test.ts can run
// the identical checks inside vitest.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import { schemas } from '../src/data/schema'
import { schemaForDataPath } from '../src/data/paths'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA_ROOT = join(__dirname, '..', 'src', 'data')

export interface FileReport {
  /** Path relative to src/data/, forward-slashed. */
  file: string
  schema: string | null
  ok: boolean
  errors: string[]
}

/** Recursively lists every `*.json` file under `root`, excluding the `schema/` directory. */
export function collectJsonFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'schema') continue // schema definitions, not data instances
        walk(join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        out.push(join(dir, entry.name))
      }
    }
  }
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) walk(root)
  return out.sort()
}

/** Builds one Ajv instance with every schema in src/data/schema registered by its `$id`. */
export function createValidator(): InstanceType<typeof Ajv2020> {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true })
  addFormats(ajv)
  for (const schema of Object.values(schemas)) ajv.addSchema(schema)
  return ajv
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return []
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
}

export function validateDataFile(
  ajv: InstanceType<typeof Ajv2020>,
  absPath: string,
  relPath: string,
): FileReport {
  const kind = schemaForDataPath(relPath)
  if (!kind) {
    return {
      file: relPath,
      schema: null,
      ok: false,
      errors: ['no schema mapping for this path — see the layout in src/data/README.md'],
    }
  }

  const schema = schemas[kind]
  const validateFn = ajv.getSchema(schema.$id as string) as ValidateFunction | undefined
  if (!validateFn) {
    throw new Error(`schema "${kind}" is not registered under $id ${schema.$id}`)
  }

  let data: unknown
  try {
    data = JSON.parse(readFileSync(absPath, 'utf8'))
  } catch (err) {
    return { file: relPath, schema: kind, ok: false, errors: [`invalid JSON: ${(err as Error).message}`] }
  }

  const schemaOk = Boolean(validateFn(data))
  const errors = schemaOk ? [] : formatErrors(validateFn.errors)
  if (kind === 'combatPatrol') errors.push(...checkUnitChoices(data))
  return { file: relPath, schema: kind, ok: errors.length === 0, errors }
}

/** Cross-reference check for a combat patrol's unitChoices (faction spec §7.1 E1). */
export function checkUnitChoices(data: unknown): string[] {
  const d = data as { units?: { ref?: string }[]; unitChoices?: { id: string; refs: string[]; default: string }[] }
  const groups = d?.unitChoices
  if (!Array.isArray(groups)) return []
  const errors: string[] = []
  const unitRefs = new Set((d.units ?? []).map((u) => u.ref))
  const ids = new Set<string>()
  const owner = new Map<string, string>()
  for (const g of groups) {
    if (ids.has(g.id)) errors.push(`unitChoices: duplicate group id "${g.id}"`)
    ids.add(g.id)
    for (const r of g.refs ?? []) {
      if (!unitRefs.has(r)) errors.push(`unitChoices "${g.id}": ref "${r}" is not in units[].ref`)
      const prev = owner.get(r)
      if (prev !== undefined && prev !== g.id) errors.push(`unitChoices: ref "${r}" belongs to both "${prev}" and "${g.id}"`)
      owner.set(r, g.id)
    }
    if (!(g.refs ?? []).includes(g.default)) errors.push(`unitChoices "${g.id}": default "${g.default}" is not one of refs`)
  }
  return errors
}

/** Validates every JSON data file under `root` (default `src/data/`). Trivially empty when there is no data yet. */
export function validateAllData(root: string = DATA_ROOT): FileReport[] {
  const ajv = createValidator()
  return collectJsonFiles(root).map((abs) => validateDataFile(ajv, abs, relative(root, abs).split('\\').join('/')))
}

function main(): void {
  const reports = validateAllData()
  let failed = 0
  for (const r of reports) {
    if (r.ok) {
      console.log(`PASS  ${r.file}  (${r.schema})`)
    } else {
      failed += 1
      console.log(`FAIL  ${r.file}${r.schema ? `  (${r.schema})` : ''}`)
      for (const e of r.errors) console.log(`      ${e}`)
    }
  }
  console.log(`\n${reports.length} file(s) checked, ${failed} failed.`)
  process.exit(failed > 0 ? 1 : 0)
}

const invokedDirectly = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url
if (invokedDirectly) main()
