# HANDOFF — continue Mallet 42k to M5 (playable vs AI)

Written 2026-09-13 by a Fable 5.1 session after the owner switched to Opus for cost. Read
`CLAUDE.md` first (token rules), then this file, then `STATUS.md`. Do not re-read the specs
wholesale — agents read the sections their prompts name.

## Owner decisions (already made — do not re-ask)
- 10th edition rules, 1:1 mechanics; own-words prose; original SD figures. See `PLAN.md`.
- Factions: Space Marines **Strike Force Octavius** vs Orks **Gordrang's Gitstompas** (Combat Patrol).
- Player vs AI first; multiplayer later. Procedural SD figures first (Phase A), Meshy/Tripo later.
- Repo `dragoonant/mallet-42k` (public), code at `~/dev/mallet-42k`, Pages deploys from `main`:
  https://dragoonant.github.io/mallet-42k/ . Pushing to `main` after each stage is pre-approved.
- Rules/stat reference: wahapedia.ru via WebFetch (stats aren't copyrightable; we write our own text).
- Check-ins: a screenshot per milestone; the only approval stop is the **M3 figure look** (before
  the SD style spreads to every unit). Otherwise keep going unless blocked.
- Implementation on Sonnet subagents; verification/spec on the session model. Ultracode is **off**
  for cost reasons: run workflows one stage at a time, ≤8 agents each.

## State of the repo (all on `main` at `9b278e8`, all green)
| Area | State |
|---|---|
| M0 | Vite + React + R3F + zustand, Vitest, Playwright, GitHub Actions → Pages. Placeholder scene (board + grid). |
| Specs | `docs/spec/00…60` + `schemas/` + `examples/`; `12-rules-test-checklist.md` = 402 test IDs (`CORE, MEAS, LOS, CMD, MOVE, SHOOT, WEAP, CHARGE, FIGHT, LEAD, STRAT, MISSION, SIM`). Adversarially reviewed once. |
| Engine contracts | `src/engine/{types,actions,events,hooks,rng,decider,index}.ts` frozen. |
| Engine core (done, verified by its own tests only) | `rng.ts`, `dice.ts`, `geometry.ts`, `state.ts`, `reducer.ts`, `modules.ts`, `setup.ts` (roll-offs only). Module interface in `src/engine/phases/README.md`. 89 tests pass. |
| Engine modules (NOT done — stubs) | `hooks-impl, effects, stratagems, enhancements, leaders, terrain, los, attack, weapons, transports, objectives, missions, phases/{command,movement,shooting,charge,fight}`. Stub bodies finish immediately or throw. |
| Data (**M2 done — verified**) | `src/data/{core,missions,terrain,factions/space-marines,factions/orks}` — 28 JSON files, `npm run validate:data` clean, `tests/data` green. W2-finish (2026-09-13) re-verified all three scopes against spec + Wahapedia: **Orks ok, Space Marines ok, core/missions ok after fixes** (see residuals below). Code hooks the data references are listed in `STATUS.md` → Data. |
| Client / AI / figures | Not started beyond the M0 placeholder. |

## Residual data findings (small; fold into the foundations stage)
W2-finish applied every item from the previous handoff (veteran-instincts → `code: veteranInstincts` +
`state: notYetFought`; duty-and-honour → `within.of: controlledObjective`; get-stuck-in → `notYetFought`;
epic-challenge condition removed + `code: epicChallenge`; tank-shock → `maxMortalWounds: 6`, charged
VEHICLE target; mission text fixes cp-01/02/04; terrain `cp-01.json` footprints recomputed so every piece is
>1" from every objective, min clearance 1.414"). Schema additions: `TargetSpec.state: notYetFought`,
`TargetSpec.filter.within.of: controlledObjective` (mirrored in `docs/spec/schemas`, `src/data/types.ts`,
`20-data-schema.md` §6). The second verify pass left three items the schema cannot express — they are
**hook-enforcement notes for the `hooks` implementer**, not data bugs:
1. `core.s.epic-challenge` — hook `epicChallenge` must require the enemy unit picked (`targets[0]`) to
   have a leader attached (TargetSpec has no "attached" filter).
2. `core.s.tank-shock` — hook `tankShockMortalWounds` must require the VEHICLE model (`targets[2]`) to
   belong to the charging unit (`targets[0]`), not merely be within 1" of the enemy unit.
3. `core.s.counter-offensive` — target encodes `notYetFought` only; hook `counterOffensive` must also
   check Engagement Range.
Plus one doc-only drift: `docs/spec/11-combat-patrol.md` §3 terrain table still shows the OLD footprints.
Data is authoritative (spec values violated CP-3.2). Update the table rows to: ruin-L1
(−8,0)(−2,0)(−2,2)(−6,2)(−6,6)(−8,6); ruin-L2 = 180° mirror; ruin-S1 rect (−19,−14)-(−13,−10); ruin-S2
(13,10)-(19,14); container-1 (4,−13)-(10,−10); container-2 (−10,10)-(−4,13). Also §2.6 names rule
`stompEmPick` but the schema enum lacks it; data uses `custom` + `code` — leave data, fix the spec line.
Cheapest route: one Sonnet agent ("edit these two spec sections, nothing else") before or alongside the
foundations stage, or hand-edit. The `hooks` impl prompt already says "code hooks the data references
(see STATUS.md Data section)" — STATUS.md now lists all 29 with the three enforcement notes.

## Workflow scripts (in `tools/workflows/`)
Run with the Workflow tool: `Workflow({ scriptPath: '/Users/anthonyescasa/dev/mallet-42k/tools/workflows/<file>', args: {...} })`.
**The session must be opened in `~/dev/mallet-42k`** (or add it with the directory tool) — the Workflow
tool refuses a `scriptPath` outside the session's working directories. The OneDrive folder
`Documents/Mallet 42k` holds only `PLAN.md`; do not work there.
Pass `args.attribution` = the Co-Authored-By line for the current model (Opus: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` — check your model id). Each stage commits and pushes; if a run dies (usage limit,
TaskStop), finished agents' edits stay in the working tree **uncommitted** — run `git status`, check
`npm run typecheck && npm test && npm run validate:data`, and commit by hand before rerunning the stage
(that is exactly what happened to W2-finish's commit step; it was landed manually as `9b278e8`).
Workflow `resumeFromRunId` only works in the same session.
| Order | Script | args | Agents | Notes |
|---|---|---|---|---|
| ✅ | `w2-finish.js` | | | Done (9b278e8). |
| 1 | `w1-stage.js` | `{stage:'foundations', attribution}` | ≤8 | hooks (+code hooks) ∥ terrain/LoS. hooks runs on the session model. |
| 2 | `w1-stage.js` | `{stage:'systems', attribution}` | ≤10 | attack ∥ command+movement ∥ setup/objectives/missions |
| 3 | `w1-stage.js` | `{stage:'phases', attribution}` | ≤7 | shooting ∥ charge+fight |
| 4 | `w1-stage.js` | `{stage:'integration', attribution}` | 3–4 | full suite green, `tools/sim.ts` headless games, full-game tests, whole-engine audit + fixes. **= M1/M4 engine done.** |
| 5 | W3 client (write it; see below) | | 2 runs | board/terrain + procedural SD figure kit → **stop for owner's figure veto (M3)** → binding, interaction, UI, hotseat |
| 6 | W4 AI (write it) | | ≤6 | expected-damage math, per-phase utility deciders, role planner, Monte Carlo charges, difficulty, tuning harness (AI beats random bot ≥95%) |
| 7 | W5 QA (write it) | | ≤10 | Playwright playthrough vs AI, sim fuzz, rules-fidelity audit, loop-until-dry (max 2 dry rounds), deploy, screenshots to owner. **= M5.** |
`w0-foundation.js`, `w1-engine.original.js`, `w2-data.original.js` are the scripts that already ran (reference only).

## Writing W3/W4/W5 (keep the same shape as `w1-stage.js`)
- Same `COMMON`, `RESULT`/`VERDICT` schemas, `build()` loop (Sonnet implements → session-model verifies → ≤2 fixes → Sonnet commits).
- W3 module specs: `docs/spec/50-client.md` (scene, binding, interaction, UI, data-testid hooks) and `30-figures.md` (SD kit: slots, skeletons, paint masks, animation clips). Stage A: `src/client/board/*` (44×30 board, SD-style ruins from `src/data/terrain`, lighting, orbit camera, picking) ∥ `src/client/figures/*` (procedural kit: Marine/Terminator/Ork Boy/Deffkopta/Deff Dread/Warboss/Captain/Librarian parts, shader paint from `faction.paintScheme`, idle/walk/shoot/melee/death). Verify with Playwright screenshots (`npm run e2e`), then **SendUserFile the screenshots and stop** for the figure veto. Stage B: engine binding (zustand store fed by `step()` events), per-phase interaction, decision prompts (every `PendingDecision` kind), dice log, HUD, stratagem prompts, end screen, hotseat.
- W4: `docs/spec/40-ai.md`; AI implements `Decider` (`src/engine/decider.ts`); tune with `tools/sim.ts` (AI vs random bot, AI vs AI).
- W5: E2E full game vs AI in the browser, `npm run sim -- --games 500`, checklist coverage ≥95%, final deploy, screenshots.

## Token accounting so far
W0 1.23M · W1 (core only, rest killed) 0.53M · W2 1.97M · W2-finish: 10 agents (3 verify, 3 fix, 3 re-verify,
1 commit killed) — not metered, roughly 0.7M · main loops ≈0.35M. Remaining estimate to M5: ≈6–8M if stages
run one at a time on Sonnet implementers. Biggest sinks observed: Wahapedia research in verify agents
(cap it: "fetch at most 3 pages") and verify agents re-reading full spec files (prompts already name
sections — keep it that way). Fix agents that own a narrow file set correctly refuse out-of-scope
findings; route each finding to the loop that owns the file (W2-finish lost a round to this).

## Gotchas
- vitest 5 warns on Node 25 (EBADENGINE) — harmless; CI uses Node 22.
- `tsconfig` uses `paths` without `baseUrl` (TS 7). `@/` → `src/`.
- Two agents editing `package.json`/`npm install` concurrently will corrupt `node_modules` — only one stage runs at a time now, and only commit/integration agents may install.
- The M0 client scene is a placeholder; W3 replaces `src/client/Scene.tsx` entirely.
- Shell cwd in the desktop app can reset between Bash calls — use absolute paths everywhere.

## Resume point (2026-09-13, Opus session suspended for tokens)
- Done on `main`: doc fixes `0dc85a4`, W1 foundations `9313cb4`, W1 systems `3867f5a` (558 tests green).
- W1 **phases** was stopped mid-run. Its partial work (shooting/charge/fight + tests; typecheck clean,
  664/665 tests — failing: `SHOOT-041-cover-snapshot` in `tests/engine/shooting.verify.test.ts`) is saved
  on branch `wip/phases` (not merged, main not deployed with it). Next session: either
  `git merge wip/phases`, fix that test, commit, or discard the branch; then rerun
  `w1-stage.js {stage:'phases'}` (it rebuilds on whatever is in the tree), then `integration`, then W3 stage A.
- Unverified fixes to re-check in integration: foundations LOS verify3 findings and all systems verify3
  findings were fixed by the commit agent without a re-verify. Movement checklist coverage 49/61.
- Open issues: `hooks.ts` `HookContextFor` Extract→never for shared contexts (frozen-contract fix + 00-architecture note);
  WEAP-030 Psychic tag has no field on `DamageApplied`; Indirect Fire R-6.23 partial; transports not wired to
  decisions; surge move not integrated into shooting; `battleShockTest` overwrites expiry instead of max (R-4.8).

## Resume point (2026-09-14) — supersedes the 2026-09-13 one above
Owner priority changed: **playable first** (see CLAUDE.md "Owner priority"). Live: https://dragoonant.github.io/mallet-42k/
- Landed on `main`: W1 phases `5e7ae1e`, integration + headless sim `124aa64` (M1), client v0 `38fcbcb` + playtest
  fixes `d4f1f1c`, figure gallery `?gallery` `09665f1`, CI test timeouts `39a5a72`, M6 missions/scoring/stratagems UI
  `9555154`, M5 utility AI `f3ff3c2`, empty-moveUnit fix `d15d725`, M2 measure/LoS/camera `d500220`.
- Workflows: `w1-stage.js` (`args.lean`), `w3-client.js` (`part: ship|playtest`), `w6-missions.js`, `w4-ai.js`.
- Figures (M3) parked by owner: procedural placeholders stay until M7 (Meshy/Tripo — needs owner's accounts).
- Open: AI strong as Orks (6/6 vs random) but weak as Space Marines (~1/6) — melee trades/target priority in
  `src/ai/utility.ts`/`expected.ts`; AI ignores most faction stratagems; objective OC computed client-side
  (`src/client/board/controlLevels.ts`) because the engine doesn't export levelOfControl; 1.58 MB JS chunk;
  charge/pile-in searches are heuristic; ~8 s engine time per headless game.
- Next options: owner playtest feedback round; Space Marine AI tuning; M8 polish (dice/VFX/audio); M7 models.

## Resume point (2026-09-15)
- Landed since 2026-09-14: gitignore secrets `c422ff8`, AI tuning `b813e7d` (Orks 100% / SM 33% vs random, 1.2 ms/decision),
  M8 polish `868bdc5` (dice tray, pooled VFX, 40 ElevenLabs audio files in public/audio, walk/attack animation,
  presentation director `src/client/presentation`, Settings popover). Workflow: `tools/workflows/w8-polish.js`.
- ElevenLabs key lives ONLY in the OneDrive folder `Mallet 42k/elevenlabs.token.rtf` (extract with textutil, pass via
  env to `npx tsx tools/gen-audio.ts`; never write it to the public repo). M8 used 467 credits; ~29k left this month.
- Open: bot doesn't wait for animations (400 ms BOT_DELAY in store) so presentation can lag live state; audio uses one
  ranged/one melee sound (no per-faction weapon mapping); dice tray skips battle-shock/desperate-escape rolls; bundle
  1.66 MB + 880 KB audio; SM AI still weak; engine corner move-candidate edge case (`phases/movement.ts`);
  figures still placeholder (M7 needs Meshy/Tripo account).
