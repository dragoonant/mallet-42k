# HANDOFF — continue Mallet 42k to M5 (playable vs AI)

Written 2026-09-12 by the previous session (Fable 5.1) after the owner hit a usage limit. Read
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

## State of the repo (all on `main`, all green)
| Area | State |
|---|---|
| M0 | Vite + React + R3F + zustand, Vitest, Playwright, GitHub Actions → Pages. Placeholder scene (board + grid). |
| Specs | `docs/spec/00…60` + `schemas/` + `examples/`; `12-rules-test-checklist.md` = 402 test IDs (`CORE, MEAS, LOS, CMD, MOVE, SHOOT, WEAP, CHARGE, FIGHT, LEAD, STRAT, MISSION, SIM`). Adversarially reviewed once. |
| Engine contracts | `src/engine/{types,actions,events,hooks,rng,decider,index}.ts` frozen. |
| Engine core (done, verified by its own tests only — the verify agent never ran) | `rng.ts`, `dice.ts`, `geometry.ts`, `state.ts`, `reducer.ts`, `modules.ts`, `setup.ts` (roll-offs only). Module interface in `src/engine/phases/README.md`. 89 tests pass. |
| Engine modules (NOT done — stubs) | `hooks-impl, effects, stratagems, enhancements, leaders, terrain, los, attack, weapons, transports, objectives, missions, phases/{command,movement,shooting,charge,fight}`. Stub bodies finish immediately or throw. |
| Data (entered, schema-valid, partially verified) | `src/data/{core,missions,terrain,factions/space-marines,factions/orks}` — 28 JSON files, `npm run validate:data` clean; loader `src/data/index.ts`; `tests/data`. Both patrols complete (4 datasheets each, weapons, abilities, 3 stratagems, 2 enhancements, secondaries). |
| Client / AI / figures | Not started beyond the M0 placeholder. |

## Outstanding data findings (from the interrupted verification; apply in W2-finish)
Orks: verify round 2 fixes were applied but not re-verified. Space Marines: round-2 findings NOT
applied. Core/missions: round-1 findings NOT applied. Known items:
1. `sm.s.veteran-instincts` — re-roll must apply to **wound rolls only** (1s; any vs MONSTER/VEHICLE). Descriptor has no roll qualifier → add one to the schema (`when.roll: "wound"` or a stratagem `trigger`) or use `{"code":"veteranInstincts"}`.
2. `sm.s.veteran-instincts` and `ork.s.get-stuck-in` target "a unit **not yet selected to fight** this phase" — `TargetSpec.state` has no negated value; add e.g. `notYetFought` to `common.schema.json` (mirror in `docs/spec/schemas` and `src/data/types.ts`) or enforce in the hook.
3. `sm.s.duty-and-honour` target must be within range of an objective **you control**; `within.of` has no controlled-objective variant → extend the filter or document that hook `dutyAndHonour` rejects otherwise.
4. `core.s.epic-challenge` — condition is wrong: usable by **any** CHARACTER unit selected to fight while in Engagement Range of an **enemy Attached unit**; remove `condition.leaderAttached`, gate on the enemy unit, reword text.
5. `core.s.tank-shock` — roll dice = Toughness (uncapped), **mortal wounds capped at 6** (not dice); TARGET is the VEHICLE unit that just ended its charge move, enemy unit in ER of it. Fix `params`, `targets`, text and CP note.
6. `ork.sec.proper-lootin` text must state the marker has to be **controlled** (spec CP-5.3). Verify round 2 for the remaining Ork items was applied — re-check.
7. Confirm the round-1 Ork fixes stuck: `ork.s.krump-da-gitz` `params.asCloseAsPossibleTo`, `ork.sec.proper-lootin` `who: active`, cap 20.
8. Data-referenced **code hooks** the engine must implement (grep `"code"` in `src/data`): `oathOfMomentPick`, `dutyAndHonour`, `wrathOfTheEmperor`, `shockTactics`, `waaaghCall`, `deadArdFeelNoPain`, `pistonDrivenBrutality`, `getStuckInDistance`, `stompEmPick` (+ any others the grep finds). Put them in `src/engine/code-hooks.ts` (hooks stage).
9. Faction `paintScheme` hex values and `figure.kit/part` ids are invented placeholders — fine for now; W3 defines the real kit ids.

## Workflow scripts (in `tools/workflows/`)
Run with the Workflow tool: `Workflow({ scriptPath: 'tools/workflows/<file>', args: {...} })`.
Pass `args.attribution` = the Co-Authored-By line for the current model. Each stage commits and
pushes; if a run dies (usage limit), finished stages are safe — rerun only the stage that died.
| Order | Script | args | Agents | Notes |
|---|---|---|---|---|
| 1 | `w2-finish.js` | `{attribution}` | ≤7 | Re-verify + fix data (uses the list above), commit. Cheap; do first so engine agents build on verified data. |
| 2 | `w1-stage.js` | `{stage:'foundations'}` | ≤8 | hooks (+code hooks) ∥ terrain/LoS. hooks runs on the session model. |
| 3 | `w1-stage.js` | `{stage:'systems'}` | ≤10 | attack ∥ command+movement ∥ setup/objectives/missions |
| 4 | `w1-stage.js` | `{stage:'phases'}` | ≤7 | shooting ∥ charge+fight |
| 5 | `w1-stage.js` | `{stage:'integration'}` | 3–4 | full suite green, `tools/sim.ts` headless games, full-game tests, whole-engine audit + fixes. **= M1/M4 engine done.** |
| 6 | W3 client (write it; see below) | | 2 runs | board/terrain + procedural SD figure kit → **stop for owner's figure veto (M3)** → binding, interaction, UI, hotseat |
| 7 | W4 AI (write it) | | ≤6 | expected-damage math, per-phase utility deciders, role planner, Monte Carlo charges, difficulty, tuning harness (AI beats random bot ≥95%) |
| 8 | W5 QA (write it) | | ≤10 | Playwright playthrough vs AI, sim fuzz, rules-fidelity audit, loop-until-dry (max 2 dry rounds), deploy, screenshots to owner. **= M5.** |
`w0-foundation.js`, `w1-engine.original.js`, `w2-data.original.js` are the scripts that already ran (reference only).

## Writing W3/W4/W5 (keep the same shape as `w1-stage.js`)
- Same `COMMON`, `RESULT`/`VERDICT` schemas, `build()` loop (Sonnet implements → session-model verifies → ≤2 fixes → Sonnet commits).
- W3 module specs: `docs/spec/50-client.md` (scene, binding, interaction, UI, data-testid hooks) and `30-figures.md` (SD kit: slots, skeletons, paint masks, animation clips). Stage A: `src/client/board/*` (44×30 board, SD-style ruins from `src/data/terrain`, lighting, orbit camera, picking) ∥ `src/client/figures/*` (procedural kit: Marine/Terminator/Ork Boy/Deffkopta/Deff Dread/Warboss/Captain/Librarian parts, shader paint from `faction.paintScheme`, idle/walk/shoot/melee/death). Verify with Playwright screenshots (`npm run e2e`), then **SendUserFile the screenshots and stop** for the figure veto. Stage B: engine binding (zustand store fed by `step()` events), per-phase interaction, decision prompts (every `PendingDecision` kind), dice log, HUD, stratagem prompts, end screen, hotseat.
- W4: `docs/spec/40-ai.md`; AI implements `Decider` (`src/engine/decider.ts`); tune with `tools/sim.ts` (AI vs random bot, AI vs AI).
- W5: E2E full game vs AI in the browser, `npm run sim -- --games 500`, checklist coverage ≥95%, final deploy, screenshots.

## Token accounting so far
W0 1.23M · W1 (core only, rest killed) 0.53M · W2 1.97M · main loop ≈0.25M. Remaining estimate to
M5: ≈6–8M if stages run one at a time on Sonnet implementers. Biggest sinks observed: Wahapedia
research in verify agents (cap it: "fetch at most 3 pages") and verify agents re-reading full spec
files (prompts already name sections — keep it that way).

## Gotchas
- vitest 5 warns on Node 25 (EBADENGINE) — harmless; CI uses Node 22.
- `tsconfig` uses `paths` without `baseUrl` (TS 7). `@/` → `src/`.
- Two agents editing `package.json`/`npm install` concurrently will corrupt `node_modules` — only one stage runs at a time now, and only commit/integration agents may install.
- The M0 client scene is a placeholder; W3 replaces `src/client/Scene.tsx` entirely.
