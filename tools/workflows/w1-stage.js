// Engine build, one stage per run. Invoke with the Workflow tool:
//   Workflow({ scriptPath: 'tools/workflows/w1-stage.js', args: { stage: 'foundations' } })
// stages, in order: foundations → systems → phases → integration
// Each build stage: implement (Sonnet) → adversarial verify (session model) → up to 2 fix rounds → commit + push.
export const meta = {
  name: 'w1-stage',
  description: 'Engine build stage (args.stage = foundations | systems | phases | integration): implement, adversarially verify, fix, commit',
  phases: [{ title: 'Build' }, { title: 'Integration' }, { title: 'Audit' }],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'

const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['ok', 'needs-fix'] }, coverage: { type: 'object', properties: { covered: { type: 'number' }, total: { type: 'number' } }, required: ['covered', 'total'] }, failing: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, description: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'description', 'fix'] } }, notes: { type: 'string' } }, required: ['verdict', 'coverage', 'failing', 'notes'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main). Use absolute paths. Orient from ${ROOT}/STATUS.md first, then docs/spec/00-architecture.md and src/engine/phases/README.md (module interface); PLAN.md holds scope. Fan project: mechanics ported 1:1 from Warhammer 40k 10th edition Combat Patrol; all prose in your own words, never copy Games Workshop text. Engine contracts in src/engine/{types,actions,events,hooks,rng,decider,index}.ts are frozen — if a change is unavoidable make the minimal edit, mirror it in docs/spec/00-architecture.md, and note it in issues. Other agents edit other files in this SAME working tree concurrently: never touch files you do not own, do not edit STATUS.md, do not run git commit or npm install unless your task says so. Prefer 'npx vitest run <your test file>' over the full suite; ignore typecheck errors inside files you do not own (report them in issues). Real Combat Patrol data exists in src/data (loadBundle() in src/data/index.ts) — use it in tests where convenient, otherwise tests/fixtures. Your final output is raw data for an orchestrator, not a message to a person.`

const MODS = {
  hooks: { key: 'hooks', title: 'Ability hook system: declarative descriptor evaluation (conditions, effects, scopes, durations), active effects and expiry, stratagem timing windows and reaction offers as PendingDecisions, CP economy and usage limits, all core stratagems, enhancements, leader attachment plumbing, and the code hooks the data references (see STATUS.md Data section)', files: 'src/engine/hooks-impl.ts, src/engine/effects.ts, src/engine/stratagems.ts, src/engine/enhancements.ts, src/engine/leaders.ts, src/engine/code-hooks.ts', spec: '00-architecture.md decision model; 10-rules-core.md core stratagems, leaders/attached units, abilities, R-11.x; 20-data-schema.md descriptor semantics (conditions, effects, scopes, durations, timing windows)', ids: 'STRAT-*, LEAD-* (attachment, leader abilities, when leader/bodyguard dies)' },
  los: { key: 'los', title: 'Terrain pieces, model/unit visibility, line of sight (ray tests against terrain volumes), ruins rules, Benefit of Cover and who ignores it, plunging fire', files: 'src/engine/terrain.ts, src/engine/los.ts', spec: '10-rules-core.md terrain, visibility, line of sight, cover sections; 11-combat-patrol.md terrain layout', ids: 'LOS-*' },
  attack: { key: 'attack', title: 'Shared attack sequence used by shooting and fight: eligible weapons/targets, attacks count, hit roll, wound roll, allocation (incl. leaders, Precision), saving throw (AP, cover, invulnerable), damage, Feel No Pain, modifier caps, every weapon ability, Hazardous, Deadly Demise, kill attribution', files: 'src/engine/attack.ts, src/engine/weapons.ts', spec: '10-rules-core.md attack sequence, weapon abilities, leaders allocation, Deadly Demise; hooks live in src/engine/hooks-impl.ts (read, do not edit)', ids: 'SHOOT-* (sequence/allocation/saves/damage cases), WEAP-*, LEAD-* (allocation/precision)' },
  movement: { key: 'movement', title: 'Command phase (CP gain, battle-shock tests and effects) and Movement phase (Normal, Advance, Fall Back with Desperate Escape, Remain Stationary, terrain traversal and vertical movement, Reserves/Strategic Reserves/Deep Strike arrival, transports embark/disembark)', files: 'src/engine/phases/command.ts, src/engine/phases/movement.ts, src/engine/transports.ts', spec: '10-rules-core.md command and movement sections', ids: 'CMD-*, MOVE-*' },
  missions: { key: 'missions', title: 'Pre-game setup and deployment (patrol selection, enhancements, attachments, reserves, roll-offs, deployment zones), objectives and Objective Control incl. battle-shocked OC 0, all six Combat Patrol missions (primary/secondary scoring schedules, mission rules), game end and victory', files: 'src/engine/setup.ts, src/engine/objectives.ts, src/engine/missions.ts', spec: '10-rules-core.md objectives/victory; 11-combat-patrol.md §1–2 (format, six missions with engine coordinates, data mapping §2.6)', ids: 'MISSION-*' },
  shooting: { key: 'shooting', title: 'Shooting phase driver: unit selection, target declaration, Big Guns Never Tire, Pistols in engagement, Indirect Fire, Overwatch-related state, calling the shared attack sequence, Lone Operative/Stealth checks', files: 'src/engine/phases/shooting.ts', spec: '10-rules-core.md shooting phase section (attack sequence lives in src/engine/attack.ts — read, do not edit)', ids: 'SHOOT-* (phase-flow cases not already covered by tests/engine/attack*.test.ts)' },
  fight: { key: 'fight', title: 'Charge phase (declare targets, 2D6, requirements, charge moves, Fire Overwatch and Heroic Intervention windows) and Fight phase (Fights First ordering, alternating activations, pile in 3", attacks via attack.ts, consolidate 3")', files: 'src/engine/phases/charge.ts, src/engine/phases/fight.ts', spec: '10-rules-core.md charge and fight sections', ids: 'CHARGE-*, FIGHT-*' },
}
const STAGES = { foundations: ['hooks', 'los'], systems: ['attack', 'movement', 'missions'], phases: ['shooting', 'fight'] }

const implPrompt = (m) => `${COMMON}
Read the spec sections: ${m.spec}.
Module: ${m.title}. You own ONLY: ${m.files}, plus tests/engine/${m.key}.test.ts (you may split into tests/engine/${m.key}.*.test.ts). Replace the stub bodies; keep exported names.
Checklist IDs to cover: ${m.ids} in docs/spec/12-rules-test-checklist.md — every test is named with its ID (e.g. it('SHOOT-012 ...')). Implement every rule exactly as specified (1:1 mechanics, no simplifications); where the spec marks an interpretation, follow it and list it in issues.
Verify with 'npx vitest run tests/engine/${m.key}' and 'npm run typecheck'.
Return JSON: ok, summary (≤80 words), files, issues.`

const verifyPrompt = (m) => `${COMMON}
You are an adversarial verifier for engine module "${m.title}" (files: ${m.files}). Read the spec sections (${m.spec}) and the checklist IDs ${m.ids} in docs/spec/12-rules-test-checklist.md, then the module code and tests/engine/${m.key}*.test.ts.
1. Run 'npx vitest run tests/engine/${m.key}' and 'npm run typecheck' (ignore errors in files outside this module).
2. Coverage: which in-scope checklist IDs have no test named for them.
3. Fidelity: for each rule in scope hunt for a deviation from the spec (wrong threshold, wrong step order, missing ±1 cap, wrong timing window, wrong measurement, missing edge case, off-by-one). For the most suspicious (up to 15) write NEW tests in tests/engine/${m.key}.verify.test.ts named with their IDs and run them.
Do not modify module code. Verdict 'ok' only if all tests pass, no critical/major fidelity issue, and coverage ≥ 90%.
Return JSON: verdict, coverage {covered,total}, failing [{id, description, fix}], notes (≤60 words).`

const fixPrompt = (m, v) => `${COMMON}
Module "${m.title}" (files: ${m.files}) failed verification. Coverage ${v.coverage.covered}/${v.coverage.total}. Findings (JSON): ${JSON.stringify(v.failing)}. Notes: ${v.notes}
Fix the module code and add tests for uncovered/failing IDs in tests/engine/${m.key}.test.ts. The verifier's tests/engine/${m.key}.verify.test.ts must pass without being weakened (only edit it if a test contradicts the spec — then cite the spec rule in issues). Same ownership rules. Run 'npx vitest run tests/engine/${m.key}' and 'npm run typecheck'.
Return JSON: ok, summary (≤60 words), files, issues.`

async function build(m, opts) {
  const impl = await agent(implPrompt(m), Object.assign({ label: `impl:${m.key}`, phase: 'Build', schema: RESULT }, opts || {}))
  let v = await agent(verifyPrompt(m), { label: `verify:${m.key}`, phase: 'Build', schema: VERDICT, effort: 'high' })
  let rounds = 0
  while (v && v.verdict === 'needs-fix' && rounds < 2) {
    rounds++
    const fo = rounds === 1 ? { label: `fix${rounds}:${m.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' } : { label: `fix${rounds}:${m.key}`, phase: 'Build', schema: RESULT, effort: 'high' }
    await agent(fixPrompt(m, v), fo)
    v = await agent(verifyPrompt(m), { label: `verify${rounds + 1}:${m.key}`, phase: 'Build', schema: VERDICT, effort: 'high' })
  }
  log(`${m.key}: ${v ? v.verdict : 'no verdict'} after ${rounds} fix round(s), coverage ${v ? v.coverage.covered + '/' + v.coverage.total : '?'}`)
  return { key: m.key, impl: impl ? impl.summary : null, issues: impl ? impl.issues : [], verdict: v ? v.verdict : null, coverage: v ? v.coverage : null, failing: v ? v.failing.map(f => f.id + ': ' + f.description) : [] }
}

const commitPrompt = (what) => `${COMMON}
Land the "${what}" engine stage. Run 'npm run typecheck' and 'npm test'. If anything fails, make the minimal fix (you may edit any engine or test file now; never weaken a test — if a test contradicts the spec, cite the rule in issues). Update STATUS.md: What exists / Not yet built / Notes for the next agent (engine lines only). Commit: git add src/engine tests docs STATUS.md; message "M1: ${what}" + blank line + "${ATTR}" (retry if .git/index.lock exists). git push origin main (git pull --rebase first if rejected).
Return JSON: ok, summary (≤80 words), files, issues.`

const stage = args && args.stage
if (!stage || (!STAGES[stage] && stage !== 'integration')) throw new Error('pass args: { "stage": "foundations" | "systems" | "phases" | "integration" }')

if (STAGES[stage]) {
  phase('Build')
  log(`W1 stage ${stage}: ${STAGES[stage].join(', ')}`)
  const results = await parallel(STAGES[stage].map(k => () => build(MODS[k], k === 'hooks' ? { effort: 'high' } : { model: 'sonnet' })))
  const commit = await agent(commitPrompt(stage), { label: 'commit', phase: 'Build', schema: RESULT, model: 'sonnet' })
  return { stage, modules: results.filter(Boolean), commit: commit && { ok: commit.ok, summary: commit.summary, issues: commit.issues } }
}

phase('Integration')
const INTEG = `${COMMON}
All engine modules are implemented with per-module tests (see tests/engine). You may edit ANY engine file now; keep contract changes minimal and mirrored in docs/spec/00-architecture.md. You may npm install what you need (tsx is already installed).
1. 'npm run typecheck' and 'npm test' — fix every failure without weakening tests (a test may change only if it contradicts the spec; cite the rule in issues).
2. Headless simulator: tools/sim.ts (script 'sim' in package.json via tsx): two random-legal-move bots using legalActions()/step() with the real data bundle (both Combat Patrol rosters) on a real mission and terrain layout; args --games N --seed S; after every step assert invariants: no NaN, model wounds within [0, W], destroyed at 0, CP ≥ 0, legal phase order, every PendingDecision has ≥1 legal action, game ends with a GameResult by the end of round 5; print wins/draws, mean rounds, mean actions per game, and any violation with seed + action index.
3. tests/engine/fullgame.test.ts: 20 seeded sim games pass all invariants; replay(log) reproduces the identical final hash (remaining SIM-* IDs).
4. 'npm run sim -- --games 100 --seed 1' reports zero violations.
5. Update STATUS.md (engine lines). Commit: git add src/engine tests tools docs STATUS.md package.json package-lock.json; message "M1: rules engine integrated, headless sim" + blank line + "${ATTR}" (retry on index.lock). git push origin main (pull --rebase first if rejected).
Return JSON: ok, summary (≤120 words incl. sim stats), files, issues.`
const integ = await agent(INTEG, { label: 'integrate+sim', schema: RESULT, effort: 'high' })
log(`integration: ${integ ? (integ.ok ? 'ok' : 'NOT ok') : 'no result'}`)

phase('Audit')
const AUDIT = `${COMMON}
Whole-engine audit. 1) Write tools/checklist-coverage.ts (script 'coverage:rules'): parse every ID in docs/spec/12-rules-test-checklist.md and every test name under tests/engine; print covered/uncovered IDs and any it.skip/it.todo. 2) Run 'npm test', 'npm run typecheck', 'npm run sim -- --games 200 --seed 7'. 3) Fidelity sampling: pick 30 rules spread across all modules (bias toward interactions: stratagem windows during charges, leader allocation with Precision, battle-shock + OC, Devastating Wounds + FNP, Fall Back + Desperate Escape, Overwatch during movement, Fights First ordering) and check the implementation against the spec by reading code and writing tests in tests/engine/audit.test.ts named with IDs. Do not modify engine code.
Verdict 'ok' only if suite green, sim clean, checklist coverage ≥ 95% with no skipped tests, and no critical/major fidelity findings.
Return JSON: verdict, coverage {covered,total}, failing [{id, description, fix}], notes (≤80 words).`
let audit = await agent(AUDIT, { label: 'audit', schema: VERDICT, effort: 'high' })
let auditFix = null
if (audit && audit.verdict === 'needs-fix') {
  auditFix = await agent(`${COMMON}
The whole-engine audit failed. Coverage ${audit.coverage.covered}/${audit.coverage.total}. Findings (JSON): ${JSON.stringify(audit.failing)}. Notes: ${audit.notes}
Fix engine code and add tests for every uncovered/failing ID (tests/engine/audit.test.ts must pass unweakened). Then 'npm test', 'npm run typecheck', 'npm run sim -- --games 200 --seed 7', 'npm run coverage:rules' all clean. Update STATUS.md engine lines. Commit (git add src/engine tests tools docs STATUS.md package.json package-lock.json; message "M1: audit fixes" + blank line + "${ATTR}"; retry on index.lock) and git push origin main (pull --rebase if rejected).
Return JSON: ok, summary (≤100 words), files, issues.`, { label: 'audit-fix', schema: RESULT, effort: 'high' })
  audit = await agent(AUDIT, { label: 'audit2', schema: VERDICT, effort: 'high' })
}
return {
  stage,
  integration: integ && { ok: integ.ok, summary: integ.summary, issues: integ.issues },
  audit: audit && { verdict: audit.verdict, coverage: audit.coverage, failing: audit.failing.map(f => f.id + ': ' + f.description), notes: audit.notes },
  auditFix: auditFix && { ok: auditFix.ok, summary: auditFix.summary },
}
