export const meta = {
  name: 'w2-data',
  description: 'Combat Patrol data: validation tooling, Space Marines (Strike Force Octavius) and Orks (Gordrang\'s Gitstompas) rosters, core stratagems, missions, terrain layouts — verified against spec and wahapedia',
  phases: [
    { title: 'Tooling', detail: 'ajv validation, loader, data layout' },
    { title: 'Data entry', detail: 'SM ∥ Orks ∥ core stratagems + missions + terrain' },
    { title: 'Verify', detail: 'fidelity vs spec + wahapedia, fix, re-verify' },
    { title: 'Commit', detail: 'validate, STATUS.md data section, commit, push' },
  ],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['ok', 'needs-fix'] }, failing: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, description: { type: 'string' }, fix: { type: 'string' } }, required: ['where', 'description', 'fix'] } }, notes: { type: 'string' } }, required: ['verdict', 'failing', 'notes'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main). Use absolute paths. Orient from ${ROOT}/STATUS.md, then docs/spec/20-data-schema.md and docs/spec/11-combat-patrol.md; schemas are in src/data/schema (JSON Schema 2020-12) with TS mirrors in src/data/types.ts. Fan project: stats and mechanics are ported 1:1 from Warhammer 40k 10th edition Combat Patrol, but every name-adjacent text field (ability descriptions, lore, flavour) must be written in your own words — never copy Games Workshop wording. Unit, weapon and ability NAMES may match the originals. Another workflow is concurrently implementing src/engine in this SAME working tree: never touch src/engine, tests/engine, tools/sim*, and do not edit STATUS.md or run git commit unless your task says so. Your final output is raw data for an orchestrator, not a message to a person.`

phase('Tooling')
const tooling = await agent(`${COMMON}
Task: data tooling. 1) npm install -D ajv ajv-formats tsx (only these). 2) tools/validate-data.ts: loads every schema from src/data/schema by $id (ajv 2020-12, strictRequired false, formats), validates every JSON file under src/data/** against the schema named by its directory/filename convention, prints a per-file report, exits non-zero on any error; package.json script 'validate:data'. 3) Define and document the layout in src/data/README.md: src/data/core/stratagems.json (core stratagems), src/data/missions/<id>.json, src/data/terrain/<id>.json, src/data/factions/<faction>/{faction.json, weapons.json, abilities.json, datasheets/<unit>.json, patrols/<patrol>.json, stratagems.json, enhancements.json}. 4) src/data/index.ts: loadBundle() that imports every JSON file (Vite import.meta.glob with eager true, plus a Node fallback using fs for tools/tests) and returns a DataBundle per src/data/types.ts; export the bundle lazily. 5) tests/data/validate.test.ts runs the same validation in vitest over all data files (passes trivially when there are none). 'npm run typecheck', 'npm run validate:data', 'npx vitest run tests/data' pass.
Return JSON: ok, summary (≤80 words), files, issues.`, { label: 'tooling', schema: RESULT, model: 'sonnet' })

phase('Data entry')
const entry = (who, scope, files) => `${COMMON}
Read src/data/README.md (layout) and the worked examples in docs/spec/examples. Task: transcribe ${scope} into JSON exactly per the schemas. Source of truth: docs/spec/11-combat-patrol.md (and 10-rules-core.md for core stratagems); you may WebFetch wahapedia.ru to resolve any value the spec marks uncertain. Abilities, stratagems and enhancements use the declarative descriptor form from docs/spec/20-data-schema.md wherever it can express the rule; use {"code": "<hookName>"} only when the descriptor language cannot, and list every code hook you introduce in issues with a one-line semantics note. Every datasheet needs full stat line, invuln, keywords, faction keywords, unit composition and base sizes, weapon references, abilities, leader rules. You own ONLY: ${files}. Run 'npm run validate:data' until clean and 'npm run typecheck'.
Return JSON: ok, summary (≤80 words), files, issues.`
const [sm, ork, coreData] = await parallel([
  () => agent(entry('sm', "the Space Marines Combat Patrol 'Strike Force Octavius' (faction, army rule, patrol file with detachment rule, warlord, enhancements, secondaries; every datasheet; weapons; abilities; the patrol's stratagems; enhancements)", 'src/data/factions/space-marines/**'), { label: 'data:space-marines', phase: 'Data entry', schema: RESULT, model: 'sonnet' }),
  () => agent(entry('ork', "the Orks Combat Patrol 'Gordrang's Gitstompas' (faction, army rule incl. Waaagh!, patrol file with detachment rule, warlord, enhancements, secondaries; every datasheet; weapons; abilities; the patrol's stratagems; enhancements)", 'src/data/factions/orks/**'), { label: 'data:orks', phase: 'Data entry', schema: RESULT, model: 'sonnet' }),
  () => agent(entry('core', 'the core stratagems (all eleven, with Combat Patrol applicability flags), all six Combat Patrol missions (deployment zones, objective positions, primary/secondary scoring schedules, mission rules) and the terrain layouts from 11-combat-patrol.md', 'src/data/core/**, src/data/missions/**, src/data/terrain/**'), { label: 'data:core+missions+terrain', phase: 'Data entry', schema: RESULT, model: 'sonnet' }),
])

phase('Verify')
const verify = (scope, files) => `${COMMON}
Adversarial data verifier for ${scope} (files: ${files}). Compare every value against docs/spec/11-combat-patrol.md (and 10-rules-core.md for core stratagems) AND independently against wahapedia.ru via WebFetch: stat lines, invulns, keywords, unit sizes, base sizes, weapon profiles (range, A, BS/WS, S, AP, D, abilities), ability semantics (does the descriptor actually encode the rule — triggers, conditions, scopes, durations, timing windows), stratagem costs/windows/targets/effects, enhancements, mission coordinates and scoring. Run 'npm run validate:data'. Do not edit files. Report only real deviations with exact file path + field and the correct value.
Return JSON: verdict, failing [{where, description, fix}], notes (≤60 words).`
const fixData = (scope, files, v) => `${COMMON}
Data for ${scope} (files: ${files}) failed verification. Findings (JSON): ${JSON.stringify(v.failing)}. Apply every fix, keep schemas valid ('npm run validate:data'), own only those files.
Return JSON: ok, summary (≤60 words), files, issues.`
async function verifyLoop(key, scope, files) {
  let v = await agent(verify(scope, files), { label: `verify:${key}`, phase: 'Verify', schema: VERDICT, effort: 'high' })
  let rounds = 0
  while (v && v.verdict === 'needs-fix' && rounds < 2) {
    rounds++
    await agent(fixData(scope, files, v), { label: `fix${rounds}:${key}`, phase: 'Verify', schema: RESULT, model: 'sonnet' })
    v = await agent(verify(scope, files), { label: `verify${rounds + 1}:${key}`, phase: 'Verify', schema: VERDICT, effort: 'high' })
  }
  log(`W2 ${key}: ${v ? v.verdict : 'no verdict'} after ${rounds} fix round(s)`)
  return { key, verdict: v ? v.verdict : null, failing: v ? v.failing.map(f => f.where + ': ' + f.description) : [] }
}
const verdicts = await parallel([
  () => verifyLoop('space-marines', "Strike Force Octavius", 'src/data/factions/space-marines/**'),
  () => verifyLoop('orks', "Gordrang's Gitstompas", 'src/data/factions/orks/**'),
  () => verifyLoop('core+missions', 'core stratagems, missions, terrain', 'src/data/core/**, src/data/missions/**, src/data/terrain/**'),
])

phase('Commit')
const commit = await agent(`${COMMON}
Finalise the data milestone. Run 'npm run validate:data', 'npx vitest run tests/data', 'npm run typecheck' (ignore errors inside src/engine or tests/engine — another workflow owns them; report them). Add a "## Data" section to STATUS.md (what exists: layout, both patrols with unit lists, missions, terrain, core stratagems, validation script; list any code hooks the data references so the engine team implements them) — edit only that section. Commit: git add src/data tools/validate-data.ts tests/data package.json package-lock.json STATUS.md; message "M2-data: Combat Patrol rosters, missions, core stratagems" + blank line + "${ATTR}"; if .git/index.lock exists wait and retry. git push origin main (git pull --rebase origin main first if rejected, then push).
Return JSON: ok, summary (≤100 words incl. code hooks the engine must provide), files, issues.`, { label: 'commit+push', schema: RESULT, model: 'sonnet' })

return {
  tooling: tooling && { ok: tooling.ok, issues: tooling.issues },
  entry: [sm, ork, coreData].filter(Boolean).map(r => ({ ok: r.ok, summary: r.summary, issues: r.issues })),
  verdicts: verdicts.filter(Boolean),
  commit: commit && { ok: commit.ok, summary: commit.summary, issues: commit.issues },
}