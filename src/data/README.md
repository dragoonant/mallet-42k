# src/data

Static game data as JSON, validated against the JSON Schemas in `src/data/schema/` (2020-12,
mirrored from `docs/spec/schemas/`; see `docs/spec/20-data-schema.md` for the field-level spec).
TS shapes for the same data live in `src/data/types.ts`. All prose fields (`text`, ability/unit
names) are written in our own words — never copied from any published book; only unit/weapon/
ability *names* may match the originals (see the project's fan-content policy in the repo root).

Nothing here is game logic. `src/engine` is the only consumer that turns this data into runtime
behaviour; `src/data/index.ts` only loads and assembles it.

## 1. Layout

```
src/data/
  schema/                          JSON Schemas (not data — excluded from validation as data)
  core/
    stratagems.json                stratagem[]   — Core stratagems (10-rules §11), faction "core"
    abilities.json                 ability[]     — shared abilities (cover, leader mechanics, ...)
  missions/
    <id>.json                      mission       — one mission per file
  terrain/
    <id>.json                      terrain-layout — one terrain layout per file
  factions/
    <faction>/
      faction.json                 faction       — keywords, army rule, detachments, paint scheme
      weapons.json                 weapon[]      — every weapon profile used by this faction
      abilities.json               ability[]     — faction-specific shared abilities
      stratagems.json              stratagem[]   — this faction's stratagems
      enhancements.json            enhancement[] — this faction's enhancements
      datasheets/
        <unit>.json                datasheet[]   — one file per unit, a single-element array
      patrols/
        <patrol>.json              combat-patrol — one fixed Combat Patrol force per file
```

`<faction>`, `<id>`, `<patrol>` and `<unit>` are filesystem-safe kebab-case slugs; they need not
match the `id` field inside the file (the `id` field is what the engine and cross-references use).

Two schema shapes recur:

- **Array-of-records** (`ability`, `weapon`, `stratagem`, `enhancement`, `datasheet`): the file is
  a JSON array, even when — as with a single datasheet file — it holds exactly one entry. This
  keeps every file under one schema per kind instead of a second "one record" variant.
- **Single object** (`faction`, `combat-patrol`, `mission`, `terrain-layout`): the file *is* the
  record.

`src/data/paths.ts` (`schemaForDataPath`) encodes this table in one place; `tools/validate-data.ts`
and `src/data/index.ts` both import it rather than re-deriving it, so the convention documented
here is the only place it can drift from the code.

## 2. Ids

Lowercase kebab, namespaced by dot, e.g. `sm.intercessor-squad`, `sm.w.bolt-rifle`,
`core.s.command-reroll`, `ork.a.waaagh`, `mission.cp-01`, `terrain.cp-01` — pattern in
`common.schema.json#/$defs/Id`. Every record's `id` must be unique across the whole bundle
regardless of which file it came from; `loadBundle()` throws on a collision.

## 3. Validation

`npm run validate:data` (`tools/validate-data.ts`) walks every `*.json` file under `src/data/`
(skipping `schema/`), infers its schema from the path per §1, and validates it with Ajv
(2020-12, `strictRequired: false`, `ajv-formats` registered). It prints one `PASS`/`FAIL` line per
file plus the Ajv error list for failures, and exits non-zero if anything failed — including a file
that doesn't match any convention in §1. `tests/data/validate.test.ts` runs the same checks inside
vitest. With no data files yet, both pass trivially (0 checked, 0 failed).

This checks JSON Schema conformance only. Cross-file checks from `docs/spec/20-data-schema.md`
§12 (dangling id references, `code` hooks existing in the engine's hook registry, wargear/points
consistency, geometry, etc.) are not implemented yet — that's later data-tooling work, not this
pass.

## 4. Loading

`src/data/index.ts` exports `loadBundle(): Promise<DataBundle>` (types in `src/data/types.ts`),
lazy and memoized — nothing is read from disk until the first call. It has two loaders:

- Under Vite (the app build) and under Vitest (which also runs sources through Vite's transform),
  the literal `import.meta.glob(...)` calls are rewritten at build time into real imports, so
  loading is synchronous and bundler-friendly.
- Under plain Node/tsx (e.g. `tools/validate-data.ts`, or any script run without Vite), those
  calls throw at runtime instead of being rewritten; `loadBundle()` catches that and falls back to
  walking `src/data/` with `node:fs`, imported dynamically behind `/* @vite-ignore */` so a browser
  build never has to resolve a Node built-in it will never actually reach.

Both loaders produce the same `Record<globPath, parsedJson>`, which is then classified with
`schemaForDataPath` and merged into one `DataBundle`, throwing on any duplicate `id`.
