# 60 — Testing

Tests are the reviewer (PLAN §Build strategy). Every rule in 10/11 has an ID in `12-rules-test-checklist.md`; every ID must be covered by at least one test whose name contains it. Coverage of checklist IDs is computed by `tools/checklist-coverage.ts` (greps test names, fails CI when an ID has no test after its module's milestone).

## 1. Layout and commands

| Command | Runs |
|---|---|
| `npm test` | vitest unit + integration (`tests/unit/**`, `tests/engine/**`, `tests/ai/**`), `tsc --noEmit` |
| `npm run sim -- --games 100 --seed 1` | headless simulator (`tools/sim.ts`) with invariants (§2) |
| `npm run e2e` | Playwright (`tests/e2e/**`) against `vite preview` |
| `npm run ai:tune -- --games 20` | AI harness smoke (40-ai §8) |
| `npm run validate-data` | schemas + cross-reference checks (20 §12) |
| `npm run check` | all of the above except full tune; what CI runs |

Test naming: `describe('<module>')` / `it('SHOOT-014 rapid fire doubles attacks at half range')`. 12-rules-test-checklist.md is the single source of IDs: areas are exactly `CORE MEAS LOS CMD MOVE SHOOT WEAP CHARGE FIGHT LEAD STRAT MISSION SIM`, ids match `/\b(CORE|MEAS|LOS|CMD|MOVE|SHOOT|WEAP|CHARGE|FIGHT|LEAD|STRAT|MISSION|SIM)-\d{3}[a-z]?\b/` (no `CL-` prefix); tests quote the ID verbatim, one ID per `it` (several `it`s may share an ID). Rows marked `alias` in 12 are cross-references and are skipped by `tools/checklist-coverage.ts`.

Engine tests use `ScriptedRng([...])` for exact dice, `SeededRng('seed')` for statistical tests, and fixtures in `tests/fixtures/` (minimal datasheets, not real ones, so rules tests don't break when data is corrected). Statistical assertions use ≥ 2 000 samples and a 3 % tolerance.

## 2. Unit tests per module

| Module | Test file(s) | Must cover |
|---|---|---|
| engine/core | `tests/engine/core.test.ts` | seeded RNG reproducibility, D3/D6/2D6 + DiceExpr parser, re-roll semantics, ±1 modifier cap, `step` purity (input state unchanged by identity and deep-equal), rejection codes leave state untouched, action log seq, `replay` reproduces every `hash`, save/load round trip, undo, `view()` redaction. Area `CORE` |
| engine/terrain+LoS | `tests/engine/los.test.ts`, `measure.test.ts` | visibility, fully visible, obscuring ruins from outside/inside, Benefit of Cover, base-to-base measurement incl. vertical, engagement range 1"/5". Areas `LOS`, `MEAS` |
| engine/command+movement | `tests/engine/movement.test.ts` | CP gain, battle-shock test and effects, normal/advance/fall back/stationary, coherency, terrain traversal, reserves/deep strike placement limits. Areas `CMD`, `MOVE` |
| engine/shooting | `tests/engine/shooting.test.ts`, `weapons.test.ts` | full sequence; each weapon ability listed in PLAN W1-D gets its own `it`; invuln; FNP; allocation order; wound spill; big-guns/pistol in engagement. Areas `SHOOT`, `WEAP` |
| engine/charge+fight | `tests/engine/charge.test.ts`, `fight.test.ts` | 2D6 charge, engagement end condition, Overwatch and Heroic windows opened only when legal, Fights First ordering, alternation, pile-in 3", consolidate 3", closer-to-enemy rule. Areas `CHARGE`, `FIGHT` |
| engine/abilities+stratagems+missions | `tests/engine/abilities.test.ts`, `stratagems.test.ts`, `missions.test.ts` | descriptor evaluation for every `trigger`/`effect` key (table-driven), `code` hook dispatch, window opening rules, CP cost/limits, objective control and scoring rules, 5 rounds, game end, tie rule. Areas `LEAD`, `STRAT`, `MISSION` (faction abilities/enhancements live under `WEAP`/`LEAD`) |
| data | `tests/data/validate.test.ts` | every data file validates; cross refs; examples validate; snapshot of bundle ids |
| ai | `tests/ai/damage.test.ts`, `deciders.test.ts` | expected damage vs engine empirical mean (3 %); every decider returns a `validate`-clean action on 50 random states; no rejections across a 5-game sim; difficulty monotonic (hard ≥ normal ≥ easy win rate over 30 games, allowed slack 10 pts) |
| client | `tests/client/store.test.ts`, `binding.test.ts` | event→anim mapping, draft legality preview matches `validate`, selectors memoised (render count), test API surface |
| assets | `tests/assets/kit.test.ts` | every part builds, mounts in its slot, tris ≤ budget, masks sum ≤ 1 per vertex, clips exist with spec lengths and markers |

## 3. Headless sim invariants (`tools/sim.ts`)

Two random-legal bots (or AI) play N games; after every `step`:

| Invariant | Check |
|---|---|
| numeric sanity | no `NaN`/`Infinity` anywhere in state; all wounds ≥ 0; model count ≤ datasheet max |
| positions | every model inside the board; no base overlap (> 0.001) between models; not inside impassable terrain |
| coherency | every unit with ≥ 2 models in coherency at end of movement/charge/fight steps |
| engagement | no model within 1" horizontal of an enemy except after a charge/pile-in/consolidate or at start of the opponent's fight; units not in engagement never selected to fight |
| CP/VP | CP ≥ 0; VP monotonic non-decreasing; VP per scoring rule ≤ cap |
| decisions | `pending` never `null` before `ended`; `pending.player` has ≥ 1 legal action (`legalActions` non-empty or `canPass`); no decision repeats with identical `id` |
| rejection | random bot picks only from `legalActions` → zero rejections; a deliberately illegal action produces the expected code and identical state hash |
| determinism | replaying the log reproduces the final hash; two runs with the same seed produce identical logs |
| termination | game ends by round 5 turn 2; total steps < 5 000; no phase repeats |
| events | every `DiceRolled` has 1–20 dice in 1..6 (or 1..3); every `ModelDestroyed` is followed by wound total decrease; `UnitDestroyed` iff models = 0 |
| performance | p99 `step` < 3 ms, whole game < 2 s |

Output `sim-report.json`: `{games, failures:[{seed, seq, invariant, detail}], p50ms, p99ms, meanRounds, meanVp}`. Any failure prints the seed + action log path for reproduction (`npm run sim -- --replay <file>`).

## 4. Playwright E2E scenario (`tests/e2e/full-game.spec.ts`)

Fixed seed `e2e-1`, mission `mission.cp-01`, SM patrol (human, seat A) vs Ork patrol (AI easy), `?test=1`, animations skipped. Screenshots at each numbered step saved to `e2e-shots/`.

| Step | Action (via UI) | Assert |
|---|---|---|
| 1 | setup modal: choose mission, patrols, seed, start | `phase-tracker` visible, `hud-round` = 1, models present (`model-*` count = patrol size) |
| 2 | deploy each unit by dragging into zone | all units inside zone (`data-x/z`), `btn-confirm` enabled only when legal |
| 3 | command phase: end phase | `hud-cp-A` incremented |
| 4 | movement: select Infernus Squad, drag 5" toward objective, confirm; then select Terminator Squad, Advance | model `data-x/z` changed by ≤ 6; no dice row for the normal move; dice row purpose `advance` for the second unit |
| 5 | shooting: select unit, assign weapon to visible Ork unit, confirm | `dice-row` entries for hit/wound/save; Ork wounds decreased in unit card |
| 6 | stratagem window on AI shooting: use `strat-sm.s.gene-wrought-resilience` when offered | CP decreases by 1; prompt closes |
| 7 | charge: declare, roll, move | dice row `charge`; on success models within engagement |
| 8 | fight: choose unit, pile in (auto), attacks resolved | dice rows; enemy models removed |
| 9 | fast-forward: `autoAnswer('*','ai')` for both seats until end | `end-screen` visible, `end-vp-A` and `end-vp-B` numeric, round = 5 |
| 10 | reload with same seed and replay log via test API | final hash equals |

Additional specs: `measure-tool.spec.ts` (two clicks → distance label matches engine), `los.spec.ts` (known blocked/visible pair), `undo.spec.ts` (hotseat undo of a move restores positions), `save-load.spec.ts`.

## 5. Rules-fidelity audit (W5)

Performed by a verify agent with `docs/spec/10-rules-core.md`, `11-combat-patrol.md` and `12-rules-test-checklist.md` open.

1. `tools/checklist-coverage.ts` → list uncovered IDs; each uncovered ID = finding.
2. For each checklist area, read the tests (not the implementation) and judge whether assertions encode the rule as written in 10/11; a test that passes but asserts the wrong number is a finding.
3. Run 20 scripted micro-scenarios (`tests/engine/scenarios/*.json`: state + action + expected events) covering interactions between abilities (e.g. Lethal Hits + Devastating Wounds + FNP, cover vs AP0 3+, fall back then shoot, battle-shocked OC 0).
4. Run the sim with `--trace` on 5 seeds and spot-check 30 random attack sequences against the calculator in 40-ai §2 (mean within 3 %).
5. Verdict JSON: `{ok, findings:[{id, severity: blocker|major|minor, file, line, expected, actual}]}`; blockers/majors loop back to fix agents (max 2 rounds per PLAN).

## 6. Definition of done per milestone

| Milestone | Done when |
|---|---|
| M0 | `npm run check` green in CI; Pages deploy shows the app shell; Playwright smoke opens the page and finds `phase-tracker` |
| M1 | all `CORE`, `MEAS`, `SHOOT`, `WEAP` checklist IDs covered and green; `replay` hash test green; shooting sequence fully event-logged |
| M2 | board/terrain render; measure tool and LoS tool E2E specs green; selection works; 60 fps on the reference laptop with 40 models (perf spec logs FPS via `window.__mallet`) |
| M3 | Marine and Ork Boy figures assembled from the kit; `kit.test.ts` green; all seven clips play; paint scheme swap works; screenshot approved by the user (only approval stop) |
| M4 | all five phases playable hotseat through the UI; `full-game.spec.ts` steps 1–8 green with a hotseat second seat; sim 100 games zero invariant failures with random bots |
| M5 | AI Decider answers every decision kind; sim 100 games AI vs random zero failures; AI beats random ≥ 95 %; `full-game.spec.ts` complete vs AI on Pages build |
| M6 | all patrol stratagems and enhancements implemented and covered by `STRAT`/`WEAP`/`LEAD` IDs; mission scoring + end screen; `stratagems.test.ts` green; fidelity audit ok |
| M7 | glTF parts load through the same slot interface; procedural fallback still works; kit tests green for both |
| M8 | full rosters validated; VFX/audio behind settings; no perf budget regressions |
| M9 | army builder with points validation; 2000-pt sim game < 10 s; instancing path active |
