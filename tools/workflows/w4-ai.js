// M5 — AI tier 1 (a bot that plays the mission), fail-fast.
//   Workflow({ scriptPath: '/Users/anthonyescasa/dev/mallet-42k/tools/workflows/w4-ai.js', args: { attribution } })
// Shape: implement AI + bench (Sonnet) → one tune round if it loses too often (Sonnet) → wire into client + ship (Sonnet).
export const meta = {
  name: 'w4-ai',
  description: 'M5: utility AI that plays objectives, targets and stratagems sensibly; bench vs random bot; wire into client; ship',
  phases: [{ title: 'Build' }, { title: 'Tune' }, { title: 'Ship' }],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const BENCH = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, games: { type: 'number' }, aiWins: { type: 'number' }, draws: { type: 'number' }, meanMsPerDecision: { type: 'number' }, meanVpAi: { type: 'number' }, meanVpRandom: { type: 'number' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'games', 'aiWins', 'draws', 'meanMsPerDecision', 'meanVpAi', 'meanVpRandom', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main). Use absolute paths (shell cwd may reset). Orient from ${ROOT}/STATUS.md. Fan project: Warhammer 40k 10th edition Combat Patrol (Space Marines vs Orks, six missions). Engine: src/engine (createGame/step/legalActions/view; Decider interface in src/engine/decider.ts). Random bot: src/ai/random.ts. Headless sim: tools/sim.ts + tools/sim-core.ts (tsx). Client store: src/client/store/game.ts (bot auto-plays with RandomDecider). AI spec: docs/spec/40-ai.md — read only the sections you need. OWNER PRIORITY: playable fast; the owner is playtesting the live site. Simple and strong beats complete. No exhaustive tests. Never edit src/engine (describe engine blockers in issues). Never git commit or npm install unless told.`

const benchSpec = `tools/ai-bench.ts (script "bench:ai" via tsx, reusing tools/sim-core.ts): args --games N --seed S; plays UtilityDecider vs RandomDecider on the real rosters, alternating which faction and which seat the AI takes, cycling missions cp-01..cp-06; prints games, AI wins, draws, mean VP each side, mean and p95 ms per AI decision. Run it with --games 12.`

phase('Build')
const build = await agent(`${COMMON}
Build the tier-1 AI. You own src/ai/** (except keep src/ai/random.ts working), tools/ai-bench.ts, and tests/ai/** (at most one smoke test).
src/ai/utility.ts — UtilityDecider implementing Decider, with difficulty 'easy' | 'normal'. For each pending decision score the legal actions (from legalActions) with cheap heuristics and pick the best (easy: pick randomly among the top 3). Heuristics:
- Expected damage: attacks × P(hit) × P(wound) × P(unsaved, after AP/cover/invuln) × min(damage, target wounds), + value of models killed (points-ish weight, leaders and characters higher). src/ai/expected.ts.
- Deployment: spread out, in cover where possible, close to the objectives the mission scores, melee units forward.
- Movement: go to and hold objectives the mission scores this round (contest when the enemy holds one), keep ranged units in range with line of sight to good targets, keep melee units heading to charge range, don't walk into overwhelming melee, advance only when it gets onto an objective or into charge range.
- Shooting: pick the target set that maximises expected damage value, prefer finishing wounded units and units on objectives.
- Charge: declare only when P(roll ≥ distance) × value is worthwhile (2D6 odds table), melee units yes, gun units rarely.
- Fight: targets by expected damage; pile in / consolidate onto objectives when possible.
- Stratagems and reactions: hold CP by default; use one only when its modelled value beats a threshold (e.g. re-roll a failed charge with good odds, Fire Overwatch only when expected damage is meaningful, defensive stratagems on a unit about to take heavy damage, mission-critical ones like objective-securing).
- Mission choices (secondary picks, raze, retrieve intel, etc.): prefer the option that scores VP soonest.
- Time budget: ≤150 ms per decision on average; if legalActions is large, sample.
${benchSpec}
Run 'npm run typecheck' and the bench.
Return JSON: ok, summary (≤80 words), games, aiWins, draws, meanMsPerDecision, meanVpAi, meanVpRandom, files, issues.`, { label: 'build:ai', phase: 'Build', schema: BENCH, model: 'sonnet' })

let bench = build
let tune = null
if (bench && (bench.games === 0 || bench.aiWins / bench.games < 0.8 || bench.meanMsPerDecision > 300)) {
  phase('Tune')
  tune = await agent(`${COMMON}
The tier-1 AI (src/ai/utility.ts, src/ai/expected.ts) is not good enough yet. Bench: ${JSON.stringify({ games: bench.games, aiWins: bench.aiWins, draws: bench.draws, meanMsPerDecision: bench.meanMsPerDecision, meanVpAi: bench.meanVpAi, meanVpRandom: bench.meanVpRandom })}. Builder notes: ${bench.summary} Issues: ${JSON.stringify(bench.issues)}.
Target: AI beats RandomDecider in ≥80% of games with ≤300 ms mean per decision. You own src/ai/** and tools/ai-bench.ts. Find why it loses or is slow: log a couple of games' AI decisions (which objectives it went for, what it shot, VP per round) and fix the heuristics that matter most (usually: not standing on scoring objectives at the right time, wasting CP, suicidal charges). Re-run 'npm run bench:ai -- --games 12' after each change; stop after it hits target or after 3 bench runs.
Return JSON: ok, summary (≤80 words), games, aiWins, draws, meanMsPerDecision, meanVpAi, meanVpRandom, files, issues.`, { label: 'tune:ai', phase: 'Tune', schema: BENCH, model: 'sonnet' })
  if (tune) bench = tune
}

phase('Ship')
const ship = await agent(`${COMMON}
Wire the AI into the client and land M5. You own src/client/** and src/ai/**.
1. src/client/store/game.ts: opponent 'bot' uses UtilityDecider (difficulty from the start screen; default 'normal'); keep a 'Random (easy)' option. Run AI decisions off the main thread if they cause visible stalls (a simple setTimeout yield between decisions is fine if mean decision time is low). Start screen gets an AI difficulty selector (own-words labels).
2. 'npm run typecheck', 'npm test', 'npm run build' green (raise a test timeout only if a test is merely slow, never weaken assertions).
3. 'npm run e2e -- play.spec.ts' still passes (selectors may be updated for the new selector control); take e2e-out/ai-01-bot-turn.png mid-game during the AI's movement or shooting, Read it.
4. Update STATUS.md (AI lines: what it does, bench numbers ${JSON.stringify({ games: bench && bench.games, aiWins: bench && bench.aiWins, meanMs: bench && bench.meanMsPerDecision })}, known gaps). git pull --rebase; git add src tests tools STATUS.md package.json package-lock.json; commit "M5: tier-1 utility AI opponent" + blank line + "${ATTR}" (retry on .git/index.lock); git push origin main. Do not commit e2e-out/.
Return JSON: ok, summary (≤60 words), files (include the absolute screenshot path), issues.`, { label: 'ship:ai', phase: 'Ship', schema: RESULT, model: 'sonnet' })

return {
  build: build && { ok: build.ok, summary: build.summary, games: build.games, aiWins: build.aiWins, draws: build.draws, ms: build.meanMsPerDecision, vp: [build.meanVpAi, build.meanVpRandom], issues: build.issues.slice(0, 5) },
  tune: tune && { ok: tune.ok, summary: tune.summary, games: tune.games, aiWins: tune.aiWins, draws: tune.draws, ms: tune.meanMsPerDecision, vp: [tune.meanVpAi, tune.meanVpRandom], issues: tune.issues.slice(0, 5) },
  ship: ship && { ok: ship.ok, summary: ship.summary, screenshots: ship.files.filter(f => f.endsWith('.png')), issues: ship.issues },
}
