export const meta = {
  name: 'w0-foundation',
  description: 'M0: scaffold Vite/R3F app with CI to Pages, write specs and engine contracts, critique and fix',
  phases: [
    { title: 'Scaffold & Spec', detail: 'scaffold app ∥ rules spec ∥ architecture/data/figure/AI/client specs' },
    { title: 'Contracts', detail: 'engine types, actions, events, hooks, JSON schemas' },
    { title: 'Critique', detail: 'adversarial completeness + coherence review' },
    { title: 'Fix', detail: 'apply gaps, typecheck, commit, push, confirm Pages deploy' },
  ],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const GAPS = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'needs-fix'] },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          description: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['area', 'severity', 'description', 'fix'],
      },
    },
  },
  required: ['verdict', 'gaps'],
}

const COMMON = `Project root: ${ROOT} (git repo, branch main, remote origin = github.com/dragoonant/mallet-42k). Use absolute paths everywhere. Read ${ROOT}/PLAN.md first — it is the source of truth for scope and decisions. This is a fan project: mechanics are ported 1:1 from Warhammer 40k 10th edition Combat Patrol, but ALL prose must be written in your own words — never copy Games Workshop rules text or datasheet wording. Keep documents compact and tabular; they are read by other agents, not humans. Your final output is raw data for an orchestrator, not a message to a person.`

const SCAFFOLD = `${COMMON}
Task: create the M0 project skeleton. Do NOT create anything under docs/ or src/engine/ (other agents are writing there concurrently) and never delete files you did not create.
1. Vite + React + TypeScript (strict), package name "mallet-42k", "type": "module". Write files directly; do not use interactive \`npm create vite\`. Node 25 / npm 11 locally.
2. Deps: three, @react-three/fiber, @react-three/drei, zustand. Dev: typescript, vite, @vitejs/plugin-react, vitest, @playwright/test, @types/three, @types/react, @types/react-dom, @types/node.
3. vite.config.ts: base '/mallet-42k/' for production builds ('/' in dev); vitest config with environment 'node' and include 'tests/**/*.test.ts'; alias '@' -> src.
4. Layout: src/client (React + R3F), src/ai, src/data, src/assets, tools, tests/engine, tests/e2e. tsconfig includes src and tests and must work whether or not src/engine exists yet.
5. src/client: minimal scene — 44×30 plane (1 world unit = 1 inch, y up, centred at origin), dark background, OrbitControls, grid lines every 6 inches, a top-left HTML overlay with text "Mallet 42k — M0" (data-testid="title"). Must render.
6. npm scripts: dev, build, preview, typecheck (tsc --noEmit), test (vitest run), test:watch, e2e (playwright test), sim (node tools/sim.mjs which prints 'sim: not implemented' and exits 0).
7. tests/engine/smoke.test.ts — trivial passing test.
8. playwright.config.ts: webServer runs \`npm run preview -- --port 4173\` (build first); tests/e2e/home.spec.ts loads the page, asserts the title text, screenshots to e2e-out/home.png. Run \`npx playwright install chromium\` and execute the e2e once; if it cannot run here, keep the config and report why in issues.
9. .github/workflows/deploy.yml: on push to main — checkout, setup-node 22 with npm cache, npm ci, npm run typecheck, npm test, npm run build, actions/configure-pages@v5, actions/upload-pages-artifact@v3 (path dist), actions/deploy-pages@v4; permissions contents: read, pages: write, id-token: write; concurrency group "pages".
10. .gitignore (node_modules, dist, e2e-out, test-results, playwright-report, .env*, .DS_Store), README.md (what it is; unofficial fan project, not affiliated with Games Workshop, original art and text; how to run), STATUS.md with a "What exists" section listing the scaffold (later agents maintain this file).
11. Verify: npm install, npm run typecheck, npm test, npm run build all succeed.
12. Commit only your files: \`git add -A -- . ':(exclude)docs' ':(exclude)src/engine'\`, commit message "M0: project scaffold, CI, Pages deploy" + blank line + "${ATTR}". Then \`git push origin main\`.
Return JSON: ok, summary (≤80 words), files (top-level paths), issues.`

const SPEC_RULES = `${COMMON}
Task: write the rules specification the engine will be built and tested against. You may use WebFetch on wahapedia.ru (10th edition core rules, Combat Patrol rules, and the current Space Marines and Orks Combat Patrol pages) to confirm exact mechanics, timings and stats. Express everything in your own words as numbered procedures and tables. Another agent is concurrently scaffolding the app and writing docs/spec/00,20,30,40,50,60 — only write the three files below.
A) ${ROOT}/docs/spec/10-rules-core.md — 10th edition core rules as used in Combat Patrol, precise enough to implement without ambiguity: battle structure (5 rounds, player turns, phases); measurement (3D, base-to-base, within / wholly within, engagement range 1" horizontal & 5" vertical, unit coherency incl. the 6+ models rule); visibility & line of sight (model-to-model, unit visibility, terrain categories: obstacles, area terrain, ruins incl. visibility through walls and the footprint rule, Benefit of Cover and who ignores it); Command phase (CP gain, battle-shock tests and every effect of being battle-shocked); Movement phase (Normal, Advance, Fall Back incl. Desperate Escape, Remain Stationary, terrain traversal and vertical movement, Reserves / Strategic Reserves / Deep Strike, transports embark/disembark and firing deck, Aircraft only if a CP box has one); Shooting phase (full attack sequence step by step: select targets, eligible weapons, hit roll incl. Big Guns Never Tire and Monster/Vehicle in engagement range, wound roll chart, allocate attacks, saving throw with AP / cover / invulnerable, inflict damage, Feel No Pain, ±1 modifier cap, unmodified 1s and 6s); every weapon ability with exact effect (Assault, Heavy, Rapid Fire X, Torrent, Blast, Sustained Hits X, Lethal Hits, Devastating Wounds, Anti-KEYWORD X+, Twin-linked, Lance, Melta X, Ignores Cover, Indirect Fire, Pistol, Hazardous, Precision, Extra Attacks, One Shot, Psychic); Charge phase (declare, 2D6, requirements, Overwatch and Heroic Intervention windows); Fight phase (Fights First ordering, alternating activations, pile in 3", make attacks, consolidate 3"); Leaders / attached units (attach rules, allocation, Precision, when leader or bodyguard dies); Characters and Lone Operative; Deadly Demise; Stealth; Infiltrators; Scouts; Deep Strike; core stratagems (Command Re-roll, Counter-offensive, Epic Challenge, Insane Bravery, Grenade, Tank Shock, Rapid Ingress, Fire Overwatch, Go to Ground, Smokescreen, Heroic Intervention) with cost, timing window, target, effect, and whether each applies in Combat Patrol; objectives, Objective Control, control rules incl. battle-shocked OC 0; victory points, ties, game end.
B) ${ROOT}/docs/spec/11-combat-patrol.md — Combat Patrol format: 44"×30" battlefield, fixed rosters, how a patrol's army rule / detachment rule / stratagems / enhancements work and whether core stratagems are also usable; deployment zones and the Combat Patrol mission set (each mission: deployment map in inches, objective marker positions, primary scoring schedule, special rules); terrain layout guidance; the current Space Marines and Orks Combat Patrol box contents (unit list, unit sizes, base sizes, exact stat lines, abilities, weapon profiles — as data tables in your own words; include the patrol-specific stratagems and enhancements). Note the source URL and access date for each box.
C) ${ROOT}/docs/spec/12-rules-test-checklist.md — an enumerated list of test cases with stable IDs (prefixes MEAS, LOS, CMD, MOVE, SHOOT, WEAP, CHARGE, FIGHT, LEAD, STRAT, MISSION, SIM), each one line: scenario → expected outcome, covering every rule in A and B. Aim for 150–250 cases. Verify agents will cite these IDs.
Return JSON: ok, summary (≤80 words), files, issues (list every rule or stat you could not confirm so the critic can check it).`

const SPEC_OTHER = `${COMMON}
Task: write the non-rules specifications. Other agents are concurrently writing docs/spec/10,11,12 (rules) and scaffolding the app (Vite + React + R3F + zustand + vitest + Playwright; src/client, src/ai, src/data, tests/). Do not touch those areas.
A) ${ROOT}/docs/spec/00-architecture.md — module boundaries (engine, ai, data, client, assets, tools); the engine as a pure reducer \`step(state, action, rng) -> { state, events, pending }\`; the decision model: the engine never blocks — when a choice is needed it exposes a PendingDecision (who decides, kind, options, where in the sequence) and the next action must answer it; stratagem/reaction interrupt windows are PendingDecisions offered to the reacting player; human UI and AI both implement one Decider interface; determinism (seeded RNG, every roll logged, action log, replay, save/load); coordinates (1 unit = 1 inch, y up, 44×30 board centred at origin); model representation (base radius, height, position); error handling (illegal action → rejected with reason code, state unchanged); performance budgets.
B) ${ROOT}/docs/spec/20-data-schema.md — JSON data model for factions, combat patrols, datasheets (M/T/Sv/W/Ld/OC, invuln, keywords, faction keywords, abilities, leader rules, unit composition, base sizes), weapons (ranged/melee profiles, abilities with params), abilities in a declarative descriptor form (trigger, condition, effect — e.g. {"trigger":"hitRoll","when":{"targetKeyword":"VEHICLE"},"effect":{"reroll":"ones"}}) with an escape hatch {"code":"hookName"} for bespoke logic, stratagems (cost, phase, timing-window id, who, targets, effect), enhancements, missions (deployment zones as polygons in inches, objectives, scoring), terrain layouts. Put JSON Schema files under ${ROOT}/docs/spec/schemas/*.schema.json and include one worked datasheet and one stratagem example.
C) ${ROOT}/docs/spec/30-figures.md — SD figure kit: proportions (~2.5 heads), scale (infantry ≈1.1" tall in world units), skeleton archetypes (infantry, heavy, monster, vehicle) with bone names, slot names (head, torso, backpack, armL, armR, weaponL, weaponR, pauldronL, pauldronR, base), paint mask channels (primary, secondary, trim, metal, decal) and how a faction scheme maps to them, animation clip names and durations (idle, walk, run, shoot, melee, hit, death), base sizes per unit type in inches, the rule that procedural parts and future glTF parts share one slot interface, LOD and instancing approach.
D) ${ROOT}/docs/spec/40-ai.md — the AI as a Decider; expected-damage calculator (hit/wound/save/damage math including abilities); per-phase utility scoring (movement: objective value, threat, cover, charge potential; shooting: expected damage × target value; charge: success probability × payoff; fight: kill priority; stratagems: value threshold); role planner (hold / screen / strike); Monte Carlo for charge and stratagem decisions; difficulty knobs (score noise, lookahead); tuning harness metrics (win rate vs random bot, vs itself, game length).
E) ${ROOT}/docs/spec/50-client.md — scene graph, state→scene binding (zustand store fed by engine events), interaction model per phase (selection, move with range preview and legality, measure tool, LoS visualiser, target picking, dice log), UI panels, camera, decision prompts, E2E hooks (data-testid conventions).
F) ${ROOT}/docs/spec/60-testing.md — unit tests per module referencing checklist IDs from 12-rules-test-checklist.md, headless sim invariants, Playwright E2E scenario, rules-fidelity audit procedure, definition of done per milestone (from PLAN.md).
Return JSON: ok, summary (≤80 words), files, issues.`

const CONTRACTS = `${COMMON}
Read docs/spec/00-architecture.md, 10-rules-core.md, 11-combat-patrol.md, 20-data-schema.md, 40-ai.md and STATUS.md. The app scaffold exists (Vite/TS strict, vitest; scripts: typecheck, test, build).
Task: write the frozen engine contracts every later agent implements against:
- src/engine/types.ts — GameState, Player, Unit, Model, runtime Datasheet/Weapon/Ability types, Terrain, Board, Objective, Phase/Step enums, DiceRoll records, PendingDecision (discriminated union of every decision kind the rule sequences need), ActionLog entry.
- src/engine/actions.ts — Action discriminated union covering every legal player input in every phase plus decision answers.
- src/engine/events.ts — GameEvent union emitted by the reducer (for UI, dice log, AI).
- src/engine/hooks.ts — ability hook interface: named hook points (onHitRoll, onWoundRoll, onSaveRoll, onDamage, onMove, onCharge, ...), context objects, modifier results, and the declarative-descriptor → hook mapping.
- src/engine/rng.ts — seeded RNG interface (stub implementation may throw 'not implemented').
- src/engine/decider.ts — the Decider interface shared by human UI and AI.
- src/engine/index.ts — exports and the step(state, action, rng) signature (stub body).
- src/data/schema/*.schema.json — the JSON Schemas from docs/spec/schemas, for runtime validation.
Rules: stubs only, no logic; one-line comments per type at most; \`npm run typecheck\` and \`npm test\` must pass. Update STATUS.md "What exists". Commit with message "M0: engine contracts and data schemas" + blank line + "${ATTR}". Do not push.
Return JSON: ok, summary, files, issues.`

const CRITIC = `${COMMON}
Read everything under ${ROOT}/docs/spec/ and ${ROOT}/src/engine/*.ts. You are an adversarial reviewer; assume the specs are incomplete until proven otherwise. Check:
1. Rules completeness: every 10th-edition core rule, and every ability / weapon ability / stratagem / enhancement that appears in the Space Marines and Orks Combat Patrol boxes (verify against wahapedia.ru via WebFetch), is specified unambiguously in 10/11 and covered by at least one checklist ID in 12.
2. Contract coherence: types.ts / actions.ts / hooks.ts can express every rule — every PendingDecision the sequences require exists, stratagem interrupt windows are reachable, leaders/attached units, transports, reserves, battle-shock, OC and mission scoring are representable, and the game is replayable from the action log alone.
3. Data schema expressiveness: every ability in both boxes is expressible declaratively or via a named code hook.
4. Testability: checklist IDs are concrete and machine-checkable.
Report only real gaps, each with a concrete fix. Severity: critical (blocks implementation), major (would cause rework), minor.`

phase('Scaffold & Spec')
log('W0: scaffolding app and writing specs in parallel')
const [scaffold, specRules, specOther] = await parallel([
  () => agent(SCAFFOLD, { label: 'scaffold', phase: 'Scaffold & Spec', schema: RESULT, model: 'sonnet' }),
  () => agent(SPEC_RULES, { label: 'spec:rules', phase: 'Scaffold & Spec', schema: RESULT, effort: 'high' }),
  () => agent(SPEC_OTHER, { label: 'spec:arch+data+figures+ai+client', phase: 'Scaffold & Spec', schema: RESULT, effort: 'high' }),
])

phase('Contracts')
const contracts = await agent(CONTRACTS, { label: 'contracts', schema: RESULT, effort: 'high' })

phase('Critique')
const critique = await agent(CRITIC, { label: 'critic', schema: GAPS, effort: 'high' })
const gaps = critique ? critique.gaps : []
log(`W0: critic found ${gaps.length} gaps (${gaps.filter(g => g.severity !== 'minor').length} non-minor)`)

phase('Fix')
const FIX = `${COMMON}
An adversarial review of docs/spec and src/engine contracts produced these gaps (JSON): ${JSON.stringify(gaps)}
Task: apply every critical and major fix (and minor ones that are quick) to the spec docs, checklist, schemas and contracts. Then run \`npm run typecheck\`, \`npm test\`, \`npm run build\` — all must pass. Update STATUS.md ("What exists" + a "Spec status" line). Commit with message "M0: spec and contract fixes from review" + blank line + "${ATTR}" and \`git push origin main\`. Then find the Pages deploy run with \`gh run list --limit 1 --json databaseId,status,conclusion,url\` and wait for it with \`gh run watch <id> --exit-status\`; if it fails, read the log (\`gh run view <id> --log-failed\`), fix, commit, push and watch again (max 2 attempts). Report the final Pages URL (expected https://dragoonant.github.io/mallet-42k/) and whether it returned the app (curl -sI).
Return JSON: ok, summary (≤100 words incl. deploy status), files, issues.`
const fix = await agent(FIX, { label: 'fix+deploy', schema: RESULT, effort: 'high' })

return {
  scaffold: scaffold && { ok: scaffold.ok, summary: scaffold.summary, issues: scaffold.issues },
  specRules: specRules && { ok: specRules.ok, summary: specRules.summary, issues: specRules.issues },
  specOther: specOther && { ok: specOther.ok, summary: specOther.summary, issues: specOther.issues },
  contracts: contracts && { ok: contracts.ok, summary: contracts.summary, issues: contracts.issues },
  gaps: gaps.map(g => `${g.severity}: ${g.area} — ${g.description}`),
  fix: fix && { ok: fix.ok, summary: fix.summary, issues: fix.issues },
}