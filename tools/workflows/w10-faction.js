// M10 — add a Combat Patrol faction, carefully. One stage per run.
//   Workflow({ scriptPath: '<worktree>/tools/workflows/w10-faction.js', args: { faction: 'necrons', stage: 'research'|'build', root, branch, attribution } })
// research: session model writes docs/spec/factions/<faction>.md from Wahapedia (own words) → independent verify → fix → re-verify → commit doc.
// build:    Sonnet data → (Sonnet engine hooks ∥ Sonnet client wiring) → session-model verify (data, rules) → ≤2 routed fix rounds → Sonnet ship (checks, sim, e2e screenshot, push main).
// Owner asked for careful + correct faction work, so verify loops are ON here despite the general lean default.
// Speed (2026-10-03): engine work is split into core (c) ∥ hooks (b) ∥ client; verify runs data ∥ rules lenses.
// To build several factions at once, give each its own git worktree + branch (args.root/args.branch) and launch one
// Workflow run per faction in parallel; each ship step rebases on origin/main and keeps-both on shared lists.
// args.patrol (optional) picks a specific patrol when a faction has more than one.
export const meta = {
  name: 'w10-faction',
  description: 'Add one Combat Patrol faction: research spec from Wahapedia + verify, or build data/rules/client + verify + ship',
  phases: [{ title: 'Research' }, { title: 'Verify spec' }, { title: 'Build' }, { title: 'Verify build' }, { title: 'Ship' }],
}

const F = args.faction
const STAGE = args.stage
const ROOT = args.root
const BRANCH = args.branch
const ATTR = args.attribution
const SPEC = `docs/spec/factions/${F}.md`
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const FINDINGS = { type: 'object', properties: { ok: { type: 'boolean' }, findings: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string', enum: ['spec', 'data', 'engine', 'client'] }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'where', 'problem', 'fix'] } } }, required: ['ok', 'findings'] }

const COMMON = `Project root: ${ROOT} (git worktree on branch ${BRANCH}; Windows, use Git Bash with absolute paths, shell cwd may reset). Your session may START in a different worktree — ignore it: every shell command must begin with cd "${ROOT}" &&, and you read/edit files only under ${ROOT}. Other factions are being built at the same time in sibling worktrees; never touch them. Mallet 42k: browser Warhammer 40k 10th-edition Combat Patrol game (Vite+React+TS+R3F+zustand). Existing factions: space-marines (Strike Force Octavius), orks (Gordrang's Gitstompas). Adding faction "${F}". Orient from STATUS.md (Data + Engine sections) and docs/spec/11-combat-patrol.md §4–5 as the model of how a patrol is specified — read only sections you need, grep instead of reading whole files. IP rule: mechanics 1:1, all prose in our own words, never copy GW text. Run long commands in the FOREGROUND only, never background them, cap each run. Concurrent agents share one working tree: edit only files you own; never git commit unless told; never npm install.`
const RULING = `Whenever you resolve an ambiguous rule, approximate a mechanic, or pick an interpretation, add an issue line starting "RULING:" (what the rule says, what we did, why). These get logged in docs/needs-rules-check.md for the owner to reconcile later.`
const WAHA = `Rules source: wahapedia.ru Combat Patrol section (https://wahapedia.ru/wh40k10ed_cp/ — patrol pages look like https://wahapedia.ru/wh40k10ed_cp/factions/<patrol-slug>/; the Combat Patrol rules page is https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/). Load WebFetch with ToolSearch("select:WebFetch"). Fetch at most 6 pages.`

function shipCmd(msg) {
  return `git -C ${ROOT} add -A docs src tests tools STATUS.md public/assets 2>/dev/null; git -C ${ROOT} commit -m "${msg}" -m "${ATTR}" (retry on index.lock); then git -C ${ROOT} fetch origin && git -C ${ROOT} rebase origin/main (another faction may be building in parallel in a sibling worktree and pushing to main: conflicts in shared registries/lists — STATUS.md, docs/needs-rules-check.md, docs/spec/12-rules-test-checklist.md, weaponFlavour.ts, kitConfigs, code-hooks.ts registrations, sim faction lists, tests enumerating factions — are resolved by KEEPING BOTH sides; after resolving rerun npm run typecheck && npm test; abort and report only if a conflict is a genuine logic clash) && git -C ${ROOT} push origin HEAD:main && git -C ${ROOT} push -f origin HEAD:${BRANCH}. If the push to main is rejected (another faction pushed first), fetch + rebase + rerun npm run typecheck and retry, up to 4 times. Never commit e2e-out/, .env, tokens.`
}

if (STAGE === 'research') {
  phase('Research')
  const r = await agent(`${COMMON}
${WAHA}
Task: write ${SPEC} — the authoritative own-words spec for the ${F} Combat Patrol, in the same shape as docs/spec/11-combat-patrol.md §4 (read §4 only as the template).
1. Find every ${F} Combat Patrol on wahapedia's CP section. ${args.patrol ? `Use the patrol "${args.patrol}" as primary (owner's choice);` : `Pick the CURRENT boxed patrol (latest date) as primary;`} list the others in one appendix line each (name, date, units).
2. For the primary patrol record exactly: sources (URLs + date); roster (units, model counts, wargear options as the box builds them, leader attachments, WARLORD); faction ability; each enhancement; each secondary objective; each patrol stratagem (CP, timing, target, effect); each datasheet (M T Sv W Ld OC, invuln, keywords, faction keywords, base size mm, every weapon profile Range A BS/WS S AP D + weapon abilities, every ability). Mechanics precise, prose ours.
3. A "Mechanics mapping" table: every rule above → how to encode it: (a) existing declarative descriptor in docs/spec/20-data-schema.md (name the effect/trigger kinds), (b) new code hook (propose a camelCase hook name + exact semantics: when it fires, what it reads, what it changes), or (c) needs an engine change beyond a code hook (say exactly what and whether a frozen contract src/engine/{types,actions,events,hooks,rng,decider,index}.ts would change). Grep src/engine/code-hooks.ts and src/engine/hooks-impl.ts to see existing hook patterns before choosing. Grep first for mechanisms an earlier faction already added (e.g. returning destroyed models / regaining wounds from Necrons, src/engine/factions/*.ts) and reuse them instead of proposing new ones. For every (c) item also give the exact TypeScript signatures of the new engine functions/fields/events, because the (c) engine work and the (b) hooks are built by two agents in parallel and the hooks code against these signatures before they exist.
4. A "Test IDs" list: one checklist ID per mechanic, prefix ${F.slice(0, 3).toUpperCase()}- (e.g. ${F.slice(0, 3).toUpperCase()}-001 …), one line each describing the assertion. Append the same list as a new section at the end of docs/spec/12-rules-test-checklist.md.
5. A "Figures" table for the 3D pipeline: slug, unit, models needed (e.g. sergeant variant), height in inches (roughly true-scale to 28mm), base mm, a one-sentence visual prompt in a chibi/SD style describing the silhouette and colours (original design, no logos).
You own ONLY ${SPEC} and the new section of docs/spec/12-rules-test-checklist.md.
Return JSON: ok, summary (≤120 words: patrol name + date, unit list with model counts, and the count of hooks / engine changes needed), files, issues (each code hook or engine change needed, one line; and any value you could not confirm).`, { label: `research:${F}`, phase: 'Research', schema: RESULT, effort: 'high' })

  phase('Verify spec')
  let last = null
  for (let round = 1; round <= 2; round++) {
    const v = await agent(`${COMMON}
${WAHA}
Adversarial verifier, round ${round}. Independently re-fetch the wahapedia pages cited in ${SPEC} and check EVERY value: roster/model counts, stat lines, invulns, keywords, base sizes, weapon profiles and abilities, ability/stratagem/enhancement/secondary semantics (timing, targets, conditions, durations), CP costs. Also check that the Mechanics mapping is sound (a declared descriptor really can express the rule per docs/spec/20-data-schema.md — grep it) and that no prose is copied verbatim from GW text. Do not edit files. Report only real deviations (owner: 'spec'), with the exact section and the correct value.
Return JSON: ok (true if no deviations), findings.`, { label: `verify-spec:${F}:${round}`, phase: 'Verify spec', schema: FINDINGS, effort: 'high' })
    last = v
    if (!v || v.ok || !v.findings.length) break
    await agent(`${COMMON}
Fix these verified deviations in ${SPEC} (and the matching lines of the ${F.slice(0, 3).toUpperCase()}- section in docs/spec/12-rules-test-checklist.md). Edit only those. Findings:
${JSON.stringify(v.findings)}
Return JSON: ok, summary (≤40 words), files, issues.`, { label: `fix-spec:${F}:${round}`, phase: 'Verify spec', schema: RESULT, model: 'sonnet' })
  }
  const ship = await agent(`${COMMON}
Commit the spec only. ${shipCmd(`M10: ${F} Combat Patrol spec`)}
Return JSON: ok, summary (≤30 words incl. commit sha), files, issues.`, { label: 'commit-spec', phase: 'Verify spec', schema: RESULT, model: 'sonnet' })
  return { research: r, remainingFindings: last && last.findings, commit: ship && ship.summary }
}

if (STAGE === 'build') {
  const OWN = {
    data: `src/data/factions/${F}/** (and src/data/index.ts / src/data/schema/** / src/data/types.ts / docs/spec/schemas/** / docs/spec/20-data-schema.md only if a genuinely new descriptor field is unavoidable — say so in issues), tests/data/**`,
    core: `src/engine/** EXCEPT src/engine/code-hooks.ts, src/engine/hooks-impl.ts and src/engine/factions/**; tests/engine/${F}-core.test.ts; docs/spec/00-architecture.md (only if a frozen contract changes)`,
    engine: `src/engine/factions/${F}.ts (new — put the hook implementations here), src/engine/code-hooks.ts and src/engine/hooks-impl.ts (registration / small dispatch edits only), src/ai/** (only so the AI can use the new faction's stratagems/abilities sensibly), tools/sim-core.ts, tools/ai-bench.ts, tests/engine/${F}.test.ts`,
    client: `src/client/** except src/client/board/** and src/client/ui/PlacementOverlay.tsx; tests/client/**; tests/e2e/**`,
  }
  const TASK = {
    data: `Transcribe ${SPEC} into src/data/factions/${F}/ (faction.json, abilities.json, weapons.json, enhancements.json, stratagems.json, datasheets/*.json, patrols/*.json) copying the exact file shapes of src/data/factions/orks/. Use declarative descriptors wherever the Mechanics mapping says so; use {"code":"<hookName>"} with the hook names the spec proposes. Paint scheme in faction.json: an original scheme that reads as ${F} at a glance. Run npm run validate:data and the data tests (npx vitest run tests/data) until clean; add the faction to any data test that enumerates factions.`,
    core: `Implement ONLY the (c) "engine change beyond a code hook" items of the Mechanics mapping in ${SPEC}, with EXACTLY the signatures the spec gives — a parallel agent is writing the faction's code hooks against those signatures right now. If the mapping has no (c) items, return ok immediately. Keep frozen-contract edits minimal and mirror them in docs/spec/00-architecture.md. Tests for the (c) items go in tests/engine/${F}-core.test.ts, named with their ${F.slice(0, 3).toUpperCase()}- checklist IDs. Run npm run typecheck (errors in src/engine/factions/${F}.ts are the other agent's, ignore them) and npx vitest run tests/engine until your part is green.`,
    engine: `Implement every (b) code hook in the Mechanics mapping of ${SPEC}, so the data in src/data/factions/${F}/ (already written) plays correctly. Put implementations in src/engine/factions/${F}.ts and register them following the existing patterns in src/engine/code-hooks.ts. Any (c) engine function/field/event the hooks need is being built in parallel by another agent with exactly the signatures in the spec — code against those; if it is not there yet when you run checks, wait a few minutes and rerun rather than writing it yourself. Write tests in tests/engine/${F}.test.ts, one per (b)-related ${F.slice(0, 3).toUpperCase()}- checklist ID, named with the ID (it('${F.slice(0, 3).toUpperCase()}-001 ...')). If the engine has faction-specific branches (grep for 'orks' / 'space-marines' / waaagh / oathOfMoment in src/engine and src/ai), extend them for ${F}. Make sure the AI (src/ai) can play the faction without rejections. Run npm run typecheck, npx vitest run tests/engine, and npm run sim -- --games 4 --seed 3 (check it pits ${F} against both other factions; extend tools/sim-core.ts faction pairing if it only knows two factions — you may own tools/sim-core.ts and tools/ai-bench.ts for that) until clean with 0 violations.`,
    client: `Make ${F} fully playable in the browser: StartScreen lets the player pick their own faction AND the opponent's faction from every faction in the bundle (no hard-coded two-faction assumptions anywhere in src/client — grep 'orks', 'space-marines'); every ${F} weapon gets a sound flavour in src/client/weaponFlavour.ts (tests/client/weaponSounds.test.ts must stay exhaustive); every ${F} unit has a procedural figure (src/client/figures/kitConfigs.ts etc.) that reads clearly as that unit type and uses the faction paint scheme — GLB models come later, so make sure missing GLBs fall back cleanly; ability/stratagem labels and decision prompts show readable own-words text for the new rules. Run npm run typecheck, npx vitest run tests/client, npm run build.`,
  }

  phase('Build')
  const data = await agent(`${COMMON}\nSpec: ${SPEC} (authoritative, already verified against wahapedia).\nYou own ONLY: ${OWN.data}.\n${TASK.data}\n${RULING}\nReturn JSON: ok, summary (≤60 words), files, issues (every code hook referenced, one line each).`, { label: `data:${F}`, phase: 'Build', schema: RESULT, model: 'sonnet' })
  const [core, engine, client] = await parallel(['core', 'engine', 'client'].map(k => () => agent(`${COMMON}\nSpec: ${SPEC}. Data in src/data/factions/${F}/ is written (hooks it references: ${JSON.stringify((data && data.issues) || [])}).\nYou own ONLY: ${OWN[k]}.\n${TASK[k]}\n${RULING}\nReturn JSON: ok, summary (≤60 words), files, issues.`, { label: `${k}:${F}`, phase: 'Build', schema: RESULT, model: 'sonnet' })))

  phase('Verify build')
  const VERIFY = `${COMMON}
${WAHA}
Adversarial verifier for the ${F} build (uncommitted changes in the working tree — see git -C ${ROOT} status / diff). Spec: ${SPEC}. Run only the checks your lens (below) names. Check, within your lens: (data) every value in src/data/factions/${F}/ matches the spec (spot-check doubtful ones on wahapedia), descriptors actually encode each rule's trigger/condition/scope/duration; (engine) each code hook implements the spec semantics exactly (read the hook code and its test — do tests assert the real rule, not a tautology?), every ${F.slice(0, 3).toUpperCase()}- checklist ID has a test, sim shows no violations/rejections and ${F} games finish; (client) the start screen offers ${F} for either side, no hard-coded two-faction logic left. Do not edit files. Report only real defects; set owner to the agent that owns the file: data = src/data/**, tests/data/**; engine = src/engine/**, src/ai/**, tools/sim*, tests/engine/**; client = src/client/**, tests/client/**, tests/e2e/**.
Return JSON: ok (true if no defects), findings.`
  let findings = []
  const rulings = [data, core, engine, client].filter(Boolean).flatMap(r => r.issues.filter(i => i.startsWith('RULING:')))
  for (let round = 1; round <= 2; round++) {
    // Two verifiers in parallel, each with a narrow lens and only the checks that lens needs.
    const LENS = {
      data: `YOUR LENS: data only (src/data/factions/${F}/** vs ${SPEC} and wahapedia). Run only npm run validate:data and npx vitest run tests/data. Skip the engine/client checks.`,
      rules: `YOUR LENS: engine rules + AI + client wiring (src/engine/**, src/ai/**, tools/sim*, src/client/**). Run npm run typecheck, npx vitest run tests/engine tests/client, npm run sim -- --games 6 --seed 11. Assume data values are checked by another verifier; skip value-by-value data comparison.`,
    }
    const vs = await parallel(['data', 'rules'].map(l => () => agent(VERIFY + `\n${LENS[l]}\nRound ${round}.`, { label: `verify-${l}:${round}`, phase: 'Verify build', schema: FINDINGS, effort: 'high' })))
    findings = vs.filter(Boolean).flatMap(v => v.findings)
    if (!findings.length) break
    const byOwner = ['data', 'engine', 'client', 'spec'].map(o => [o, findings.filter(f => f.owner === o)]).filter(([, fs]) => fs.length)
    const fixes = await parallel(byOwner.map(([o, fs]) => () => agent(`${COMMON}\nSpec: ${SPEC}. You own ONLY: ${o === 'spec' ? SPEC : OWN[o]}.\nFix these verified defects (and nothing else), then rerun the relevant checks:\n${JSON.stringify(fs)}\n${RULING}\nReturn JSON: ok, summary (≤40 words), files, issues.`, { label: `fix-${o}:${round}`, phase: 'Verify build', schema: RESULT, model: 'sonnet' })))
    rulings.push(...fixes.filter(Boolean).flatMap(r => r.issues.filter(i => i.startsWith('RULING:'))))
  }

  phase('Ship')
  const ship = await agent(`${COMMON}
Land the ${F} faction. Run npm run typecheck, npm test, npm run validate:data, npm run build — minimal fixes only if red (never weaken tests). Run npm run sim -- --games 6 --seed 5 and record ${F} win/finish counts. Playwright: add or extend an e2e spec so a game can be started as ${F} vs the bot (reuse tests/e2e/helpers.ts; deploy + first battle round is enough, not a full game) and take screenshots to ${ROOT}/e2e-out/: m10-${F}-01-start.png (start screen showing ${F} selected), m10-${F}-02-deployed.png (${F} figures on the board), m10-${F}-03-shooting.png (a ${F} unit shooting or being shot). Read the screenshots; if ${F} figures are invisible or broken, fix once and retake. Update STATUS.md (a short M10 ${F} block: patrol, hooks added, test count, sim result, known gaps). Append these build rulings to docs/needs-rules-check.md under a "${F} build" heading, in that file's existing table format, deduplicated against entries already there (if the file does not exist, create it with a one-line intro and the table): ${JSON.stringify(rulings)}. Then ${shipCmd(`M10: ${F} Combat Patrol playable`)}
Return JSON: ok, summary (≤80 words incl. test count, sim result, commit sha), files (include absolute screenshot paths), issues.`, { label: `ship:${F}`, phase: 'Ship', schema: RESULT, model: 'sonnet' })

  return {
    data: data && { ok: data.ok, summary: data.summary },
    core: core && { ok: core.ok, summary: core.summary, issues: core.issues.slice(0, 5) },
    engine: engine && { ok: engine.ok, summary: engine.summary, issues: engine.issues.slice(0, 5) },
    client: client && { ok: client.ok, summary: client.summary, issues: client.issues.slice(0, 5) },
    unresolved: findings,
    ship: ship && { ok: ship.ok, summary: ship.summary, screenshots: ship.files.filter(f => f.endsWith('.png')), issues: ship.issues },
  }
}

throw new Error(`unknown stage ${STAGE}`)
