// W3 client, playable-first. Invoke with the Workflow tool:
//   Workflow({ scriptPath: '/Users/anthonyescasa/dev/mallet-42k/tools/workflows/w3-client.js', args: { attribution } })
// Goal: a game the owner can open on Pages and play (vs a random-legal-move bot, or hotseat) with procedural SD figures.
// Shape: build (Sonnet, parallel) → wire UI (Sonnet) → playtest in a real browser (session model) → fix (Sonnet) → commit + push.
export const meta = {
  name: 'w3-client',
  description: 'Playable browser client: board, SD figures, engine store + random bot, per-phase UI, playtest, deploy',
  phases: [{ title: 'Build' }, { title: 'Wire' }, { title: 'Playtest' }, { title: 'Ship' }],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const PLAYTEST = { type: 'object', properties: { playable: { type: 'boolean' }, reached: { type: 'string' }, blockers: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, fix: { type: 'string' } }, required: ['what', 'where', 'fix'] } }, screenshots: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['playable', 'reached', 'blockers', 'screenshots', 'notes'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main). Use absolute paths (shell cwd may reset). Orient from ${ROOT}/STATUS.md first; PLAN.md holds scope. Fan project: Warhammer 40k 10th edition Combat Patrol mechanics; all UI copy in your own words, never Games Workshop text; figures are original chibi/SD designs, not copies of GW sculpts. Stack: Vite + React + TypeScript strict + @react-three/fiber + drei + zustand (already installed). 1 world unit = 1 inch, y up, 44"×30" board centred at origin. The rules engine (src/engine, entry src/engine/index.ts: createGame/step/legalActions/view) and data (src/data, loadBundle()) are done — call them, never edit them (if the engine blocks play, describe it in issues with file + function). OWNER PRIORITY: something playable fast. Do not write unit tests beyond what an e2e check needs; do not chase spec coverage; prefer simple and working over complete. Concurrent agents share one working tree: edit only files you own, never git commit or npm install unless told.`

const BUILD = [
  { key: 'board', prompt: `${COMMON}
You own ONLY src/client/board/**. Read docs/spec/50-client.md §2, §4, §7 and docs/spec/11-combat-patrol.md §3 (sections only).
Build: <Board/> 44×30 mat with subtle grid and deployment-zone tint; <Terrain/> meshes generated from the terrain layout in src/data/terrain (ruins with low broken walls and an upper floor where the data has one, containers, barricades) in a chunky stylised SD look; <Objectives/> markers with a control-colour ring (props: objectives + controller); <Lighting/> (hemisphere + shadowed directional); <CameraRig/> orbit camera clamped above the board with a top-down toggle; picking helpers: onBoardPointer(point: {x,z}) callback and a <Ruler/> line with inch label; <Rings/> for movement range, engagement range (1"), and selection per §4. Export everything from src/client/board/index.ts. Must typecheck ('npm run typecheck').
Return JSON: ok, summary (≤60 words), files, issues.` },
  { key: 'figures', prompt: `${COMMON}
You own ONLY src/client/figures/**. Read docs/spec/30-figures.md §1–§7 (skip §8–§9).
Build a procedural SD figure kit from three.js primitives (no external assets): big head, short body, chunky weapons, readable silhouettes at tabletop zoom. Archetypes for every datasheet in src/data/factions/space-marines and src/data/factions/orks (Captain, Librarian, Intercessors/tactical marines, Terminators, Ork Boyz, Warboss, Deffkopta, Deff Dread and whatever else the data lists — map by datasheet id with a sensible fallback). Paint from each faction's paintScheme in the data via simple material colour slots. Base discs sized from §7. Animations as simple procedural transforms driven by a prop: idle bob, walk, shoot recoil, melee swing, death topple. API: <Figure datasheetId faction pose selected highlighted onClick/> plus <FigureGallery/> (every archetype in a row on a plain ground, labelled) for screenshots. Export from src/client/figures/index.ts. Must typecheck.
Return JSON: ok, summary (≤60 words), files, issues.` },
  { key: 'store', prompt: `${COMMON}
You own ONLY src/client/store/** and src/ai/random.ts. Read docs/spec/50-client.md §2 and §6, src/engine/index.ts, src/engine/decider.ts, and the PendingDecision union in src/engine/types.ts (grep, do not read the whole file).
Build: src/ai/random.ts — a Decider that picks a uniformly random legal action from legalActions() (seeded rng), with a small bias to not pass when a non-pass action exists. src/client/store/game.ts — zustand store: newGame({mission, playerFaction: 'space-marines'|'orks', opponent: 'bot'|'hotseat', seed}) building a GameSetup from the real data bundle with sensible defaults (full Combat Patrol, first enhancement, default leader attachments, no reserves unless required); state, pending decision, legalActions, event log (last 200), dice log; dispatch(action) → step(), rejections surfaced as a toast message; when it is the bot's decision, auto-play it after ~400ms (so the human sees it) until a human decision is pending; undo not required; save/load to localStorage optional. Selectors: unitsOnBoard, modelPositions, activePlayer, phase, round, cp, vp. Must typecheck. Add one tiny vitest (tests/client/store.test.ts): newGame + let the bot play both sides for 300 steps without throwing.
Return JSON: ok, summary (≤60 words), files, issues.` },
]

const WIRE = `${COMMON}
Board (src/client/board), figures (src/client/figures) and the game store + random bot (src/client/store, src/ai/random.ts) now exist — read their index/export files and summaries, not every line. Read docs/spec/50-client.md §3, §5, §6, §8.
You own src/client/App.tsx, src/client/Scene.tsx (replace the M0 placeholder entirely), src/client/ui/**, src/client/interaction/**. Build the playable game:
1. Start screen: choose your faction, mission, opponent (Bot / Hotseat) and Start (data-testid per §8, at least start-game).
2. Scene: board + terrain + objectives + a Figure per model at its engine position; selection ring; destroyed models removed after the death animation.
3. Per-phase interaction for every PendingDecision kind: deployment by clicking in your zone; movement by selecting a unit, dragging/clicking a destination with a range ring and ruler (move the whole unit keeping formation offsets, the engine validates); shooting/charge/fight target picking by clicking enemy units; generic fallback: any decision without bespoke UI shows its legal actions as a clickable list so the game can never get stuck.
4. HUD: round, phase, active player, CP, VP, "End phase / Pass" button, dice log panel, event feed, stratagem prompt, toast for rejections, end-of-game screen with winner and Play again.
Run 'npm run typecheck' and 'npm run build' until clean. Start 'npm run dev' only if needed and stop it before returning.
Return JSON: ok, summary (≤80 words), files, issues.`

const playtestPrompt = (round) => `${COMMON}
You are the playtester (round ${round}). Do not edit src/. Write/extend tests/e2e/play.spec.ts (Playwright; config in playwright.config.ts builds + previews on port 4173 under /mallet-42k/; run 'npx playwright install chromium' if the browser is missing). The spec must: open the app, start a game as Space Marines vs Bot, play through deployment and at least one full battle round (command, movement with a real move, shooting with a real target, charge, fight) using the UI only, then keep clicking the generic action list / pass until the game ends or 10 minutes pass. Take screenshots to e2e-out/: 01-start.png, 02-deployed.png, 03-movement.png, 04-shooting.png, 05-closeup.png (camera close on a few Marines and Orks), 06-end-or-latest.png, plus 00-figures.png of <FigureGallery/> if the app exposes it (add ?gallery to the URL if supported). Run 'npm run e2e -- play.spec.ts'. Look at the screenshots yourself (Read the PNGs) and judge: can a human actually play? Are figures visible, readable and not broken? Any console errors, stuck decisions, invisible units, or UI that covers the board?
Return JSON: playable, reached (how far the game got), blockers [{what, where (file/function), fix}] (most important first, ≤12), screenshots (absolute paths), notes (≤60 words).`

const fixPrompt = (pt) => `${COMMON}
The playtest found blockers (JSON): ${JSON.stringify(pt.blockers)}. Notes: ${pt.notes}. Reached: ${pt.reached}.
Fix them in src/client/** or src/ai/random.ts (not src/engine; for engine bugs describe them in issues). Keep tests/e2e/play.spec.ts passing without weakening it. Run 'npm run typecheck', 'npm run build', 'npm run e2e -- play.spec.ts'.
Return JSON: ok, summary (≤80 words), files, issues.`

const SHIP = (msg, extra) => `${COMMON}
Land the client. Run 'npm run typecheck' and 'npm run build' — make minimal fixes if red. Do not add tests. ${extra}
Update STATUS.md client lines (what exists, how to play, known gaps) — git pull --rebase first; another stage (engine integration) may be committing concurrently, so only git add your paths. Commit: git add src/client src/ai tests/client tests/e2e STATUS.md; message "${msg}" + blank line + "${ATTR}" (retry if .git/index.lock). git push origin main (pull --rebase if rejected). Do not commit e2e-out/.
Return JSON: ok, summary (≤60 words), files (include absolute screenshot paths), issues.`

const part = (args && args.part) || 'ship'
if (part === 'ship') {
  // Fail fast: build, wire, push a first playable-ish version with screenshots. No playtest loop.
  phase('Build')
  const built = await parallel(BUILD.map(b => () => agent(b.prompt, { label: `build:${b.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' })))
  phase('Wire')
  const wired = await agent(WIRE, { label: 'wire:ui', phase: 'Wire', schema: RESULT, model: 'sonnet' })
  phase('Ship')
  const ship = await agent(SHIP('M3: first playable client (v0)', `Then take screenshots with a quick Playwright script (tests/e2e/smoke.spec.ts; config builds + previews on 4173 under /mallet-42k/; 'npx playwright install chromium' if missing): e2e-out/01-start.png, 02-game.png (after Start, board with deployed/deploying figures), 03-closeup.png (camera close on figures), 00-figures.png (FigureGallery via ?gallery if wired, else skip). Read the PNGs; if the scene is blank or broken, fix the obvious cause once and retake.`), { label: 'ship:v0', phase: 'Ship', schema: RESULT, model: 'sonnet' })
  return {
    built: built.filter(Boolean).map(b => ({ ok: b.ok, summary: b.summary, issues: b.issues.slice(0, 3) })),
    wired: wired && { ok: wired.ok, summary: wired.summary, issues: wired.issues.slice(0, 5) },
    ship: ship && { ok: ship.ok, summary: ship.summary, files: ship.files.filter(f => f.endsWith('.png')), issues: ship.issues },
  }
}

// part === 'playtest': one browser playtest → one fix → ship.
phase('Playtest')
const pt = await agent(playtestPrompt(1), { label: 'playtest', phase: 'Playtest', schema: PLAYTEST, effort: 'high' })
let fix = null
if (pt && pt.blockers.length) fix = await agent(fixPrompt(pt), { label: 'fix', phase: 'Playtest', schema: RESULT, model: 'sonnet' })
phase('Ship')
const ship = await agent(SHIP('M3: playtest fixes', ''), { label: 'ship', phase: 'Ship', schema: RESULT, model: 'sonnet' })
return {
  playtest: pt && { playable: pt.playable, reached: pt.reached, blockers: pt.blockers.map(b => b.what), screenshots: pt.screenshots, notes: pt.notes },
  fix: fix && fix.summary,
  ship: ship && { ok: ship.ok, summary: ship.summary, issues: ship.issues },
}
