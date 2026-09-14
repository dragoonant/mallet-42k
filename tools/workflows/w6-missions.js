// M6 — Missions & stratagems (scoring, CP, core stratagems, end-of-game screen), fail-fast.
//   Workflow({ scriptPath: '/Users/anthonyescasa/dev/mallet-42k/tools/workflows/w6-missions.js', args: { attribution } })
// Shape: audit in a real browser (session model) → fix engine ∥ fix client (Sonnet) → ship with screenshots (Sonnet).
export const meta = {
  name: 'w6-missions',
  description: 'M6: make missions, scoring, CP and stratagems visible and correct in the playable client; ship with screenshots',
  phases: [{ title: 'Audit' }, { title: 'Fix' }, { title: 'Ship' }],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const GAP = { type: 'object', properties: { what: { type: 'string' }, owner: { type: 'string', enum: ['engine', 'client'] }, where: { type: 'string' }, fix: { type: 'string' } }, required: ['what', 'owner', 'where', 'fix'] }
const AUDIT = { type: 'object', properties: { gaps: { type: 'array', items: GAP }, works: { type: 'array', items: { type: 'string' } }, screenshots: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['gaps', 'works', 'screenshots', 'notes'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main). Use absolute paths (shell cwd may reset). Orient from ${ROOT}/STATUS.md; PLAN.md milestone M6 = "Missions & stratagems: scoring, CP, core stratagems, end-of-game screen". Fan project: Warhammer 40k 10th edition Combat Patrol mechanics; all UI copy in your own words, never Games Workshop text. Stack: Vite + React + TS + R3F + zustand. Engine: src/engine (createGame/step/legalActions/view), data: src/data (missions in src/data/missions, stratagems in src/data/core and factions). Client: src/client (store in src/client/store, UI in src/client/ui). Rules spec: docs/spec/11-combat-patrol.md §2 (missions) and 10-rules-core.md stratagem/CP sections — read only sections you need. OWNER PRIORITY: playable and visible fast; the owner is playtesting the live site right now. No new unit tests beyond keeping the suite green; do not chase checklist coverage. Concurrent agents share one working tree: edit only files you own, never git commit or npm install unless told.`

const auditPrompt = `${COMMON}
You are the M6 auditor. Do not edit src/. Goal: find what stops a human from understanding and using missions, scoring, CP and stratagems in the live client.
1. Skim src/data/missions (list the six missions, their primary/secondary scoring and mission rules) and the stratagem data; skim src/client/ui (file list + the HUD/prompt components) to see what is shown.
2. Extend or write tests/e2e/m6.spec.ts (Playwright; config builds + previews on port 4173 under /mallet-42k/; 'npx playwright install chromium' if missing; reuse helpers from tests/e2e/play.spec.ts). Play a game vs Bot for at least 2 battle rounds on two different missions. Screenshot to e2e-out/: m6-01-setup.png (mission/secondary choice), m6-02-objectives.png (objective control visible), m6-03-scoring.png (after a scoring moment), m6-04-stratagem.png (a stratagem offer), m6-05-end.png (end screen, finish a game via pass/fallback if needed). Read the PNGs.
3. Check against the rules: does the player choose a mission and see its briefing (primary, secondary, special rules)? Are objective markers and who controls them visible, with OC totals? Does VP score at the right times per mission, with a per-round breakdown the player can see? Is CP gain shown each Command phase, CP spend on stratagems, and the once-per-phase limits enforced and explained? Can the player see every stratagem they could use (name, CP cost, when, own-words effect) and use it at the right window, including reactions during the opponent's turn? Is battle-shock visible? Does the end screen show winner, VP by round and category, and how the game ended (VP, tabled)? Does the bot actually score and use stratagems? Compare engine scoring against spec for at least 2 missions using the store/engine in a quick script if needed.
Return JSON: gaps [{what, owner: engine|client, where (file/function), fix}] most important first, ≤14; works (≤8 short items); screenshots (absolute paths); notes (≤60 words).`

const fixPrompt = (owner, gaps, files) => `${COMMON}
Fix these M6 gaps (JSON): ${JSON.stringify(gaps)}.
You own ONLY ${files}. If a gap needs a change outside your files, do the part you own and describe the rest in issues. ${owner === 'engine' ? 'Engine contracts (src/engine/{types,actions,events,hooks,rng,decider,index}.ts) are frozen: prefer changes inside modules; if a contract change is unavoidable, make it minimal, mirror it in docs/spec/00-architecture.md, and list it in issues. Run npm run typecheck and npm test.' : 'Keep tests/e2e/play.spec.ts and tests/e2e/m6.spec.ts passing (update selectors only if the UI changed, never weaken what they check). Run npm run typecheck and npm run build.'}
Return JSON: ok, summary (≤80 words), files, issues.`

phase('Audit')
const audit = await agent(auditPrompt, { label: 'audit:m6', phase: 'Audit', schema: AUDIT, effort: 'high' })
if (!audit) return { error: 'audit returned nothing' }
const engineGaps = audit.gaps.filter(g => g.owner === 'engine')
const clientGaps = audit.gaps.filter(g => g.owner === 'client')

phase('Fix')
const [fixEngine, fixClient] = await parallel([
  () => engineGaps.length ? agent(fixPrompt('engine', engineGaps, 'src/engine/** (not the frozen contract files unless unavoidable), src/data/**, tests/engine/**'), { label: 'fix:engine', phase: 'Fix', schema: RESULT, model: 'sonnet' }) : null,
  () => clientGaps.length ? agent(fixPrompt('client', clientGaps, 'src/client/**, src/ai/random.ts, tests/e2e/**'), { label: 'fix:client', phase: 'Fix', schema: RESULT, model: 'sonnet' }) : null,
])

phase('Ship')
const ship = await agent(`${COMMON}
Land M6. Run 'npm run typecheck', 'npm test', 'npm run build' — minimal fixes if red (never weaken tests). Then 'npm run e2e -- m6.spec.ts' to retake the e2e-out/m6-*.png screenshots; Read them; if one is blank or obviously broken, fix the cause once and retake. Update STATUS.md (M6 lines: what exists, known gaps). git pull --rebase, then commit: git add src tests tools STATUS.md docs; message "M6: missions, scoring, CP and stratagems in the client" + blank line + "${ATTR}" (retry if .git/index.lock). git push origin main. Do not commit e2e-out/.
Return JSON: ok, summary (≤60 words), files (include absolute m6 screenshot paths), issues.`, { label: 'ship:m6', phase: 'Ship', schema: RESULT, model: 'sonnet' })

return {
  audit: { gaps: audit.gaps.map(g => `[${g.owner}] ${g.what}`), works: audit.works, notes: audit.notes },
  fixEngine: fixEngine && { ok: fixEngine.ok, summary: fixEngine.summary, issues: fixEngine.issues.slice(0, 5) },
  fixClient: fixClient && { ok: fixClient.ok, summary: fixClient.summary, issues: fixClient.issues.slice(0, 5) },
  ship: ship && { ok: ship.ok, summary: ship.summary, screenshots: ship.files.filter(f => f.endsWith('.png')), issues: ship.issues },
}
