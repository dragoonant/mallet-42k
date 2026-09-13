// Finish the data milestone: one more adversarial verify → fix → re-verify pass per scope, then commit.
//   Workflow({ scriptPath: 'tools/workflows/w2-finish.js', args: { attribution: 'Co-Authored-By: ...' } })
export const meta = {
  name: 'w2-finish',
  description: 'Re-verify Combat Patrol data (SM, Orks, core/missions/terrain) against spec + wahapedia, fix, commit',
  phases: [{ title: 'Verify' }, { title: 'Commit' }],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['ok', 'needs-fix'] }, failing: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, description: { type: 'string' }, fix: { type: 'string' } }, required: ['where', 'description', 'fix'] } }, notes: { type: 'string' } }, required: ['verdict', 'failing', 'notes'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main). Use absolute paths. Orient from ${ROOT}/STATUS.md, then docs/spec/20-data-schema.md and docs/spec/11-combat-patrol.md; schemas in src/data/schema, TS mirrors in src/data/types.ts, layout in src/data/README.md. Fan project: stats and mechanics ported 1:1 from Warhammer 40k 10th edition Combat Patrol; every text field written in our own words — never copy Games Workshop wording; names may match. Never touch src/engine or tests/engine. Do not edit STATUS.md or run git commit unless your task says so. Your final output is raw data for an orchestrator, not a message to a person.`

const verify = (scope, files) => `${COMMON}
Adversarial data verifier for ${scope} (files: ${files}). HANDOFF.md lists findings from an earlier interrupted verification pass — check whether each was applied. Then compare every value against docs/spec/11-combat-patrol.md (and 10-rules-core.md for core stratagems) AND independently against wahapedia.ru via WebFetch: stat lines, invulns, keywords, unit sizes, base sizes, weapon profiles, ability descriptor semantics (triggers, conditions, scopes, durations, timing windows), stratagem costs/windows/targets/effects, enhancements, mission coordinates and scoring. Run 'npm run validate:data'. Do not edit files. Report only real deviations with exact file path + field and the correct value.
Return JSON: verdict, failing [{where, description, fix}], notes (≤60 words).`
const fixData = (scope, files, v) => `${COMMON}
Data for ${scope} (files: ${files}) failed verification. Findings (JSON): ${JSON.stringify(v.failing)}. Apply every fix, keep 'npm run validate:data' clean, own only those files.
Return JSON: ok, summary (≤60 words), files, issues.`

async function verifyLoop(key, scope, files) {
  let v = await agent(verify(scope, files), { label: `verify:${key}`, phase: 'Verify', schema: VERDICT, effort: 'high' })
  if (v && v.verdict === 'needs-fix') {
    await agent(fixData(scope, files, v), { label: `fix:${key}`, phase: 'Verify', schema: RESULT, model: 'sonnet' })
    v = await agent(verify(scope, files), { label: `verify2:${key}`, phase: 'Verify', schema: VERDICT, effort: 'high' })
  }
  log(`${key}: ${v ? v.verdict : 'no verdict'}`)
  return { key, verdict: v ? v.verdict : null, failing: v ? v.failing.map(f => f.where + ': ' + f.description) : [] }
}

phase('Verify')
const verdicts = await parallel([
  () => verifyLoop('space-marines', 'Strike Force Octavius', 'src/data/factions/space-marines/**'),
  () => verifyLoop('orks', "Gordrang's Gitstompas", 'src/data/factions/orks/**'),
  () => verifyLoop('core+missions', 'core stratagems, missions, terrain', 'src/data/core/**, src/data/missions/**, src/data/terrain/**'),
])

phase('Commit')
const commit = await agent(`${COMMON}
Run 'npm run validate:data', 'npx vitest run tests/data', 'npm run typecheck'. Update the "## Data" section of STATUS.md (verification status; list every code hook the data references — grep for "code" in src/data — so the engine implements them) — edit only that section. Commit: git add src/data tests/data docs/spec/schemas STATUS.md; message "M2-data: verified rosters, missions, stratagems" + blank line + "${ATTR}" (retry on index.lock). git push origin main (pull --rebase first if rejected).
Return JSON: ok, summary (≤100 words), files, issues.`, { label: 'commit+push', schema: RESULT, model: 'sonnet' })

return { verdicts: verdicts.filter(Boolean), commit: commit && { ok: commit.ok, summary: commit.summary, issues: commit.issues } }
