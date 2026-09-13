# Status

Maintained by agents as work lands. Orient from this file instead of exploring the codebase.

## What exists (M0 — project scaffold)

| Area | State |
|---|---|
| Build | Vite + React + TypeScript (strict), package `mallet-42k`, ESM (`"type": "module"`) |
| Deps | three, @react-three/fiber, @react-three/drei, zustand; dev: typescript, vite, @vitejs/plugin-react, vitest, @playwright/test, @types/* |
| Config | `vite.config.ts` (base `/mallet-42k/` in prod, `/` in dev; `@` → `src`; vitest env `node`, `tests/**/*.test.ts`); `tsconfig.json` (strict, includes `src` + `tests`, works with or without `src/engine`) |
| Client | `src/main.tsx`, `src/client/App.tsx`, `src/client/Scene.tsx` — R3F scene: 44"×30" plane (1 unit = 1 inch, y-up, centred at origin), dark background, OrbitControls, 6" grid via drei `Grid`, top-left HTML overlay (`data-testid="title"`, text "Mallet 42k — M0") |
| Dirs | `src/client`, `src/ai`, `src/data`, `src/assets`, `tools`, `tests/engine`, `tests/e2e` created (placeholder READMEs where empty) |
| Tests | `tests/engine/smoke.test.ts` (Vitest, trivial pass); `tests/engine/contracts.test.ts` (stubs throw, trigger→hook map complete, schemas carry `$id`); `tests/e2e/home.spec.ts` (Playwright, loads page, asserts title, screenshots to `e2e-out/home.png`); `playwright.config.ts` builds + previews on port 4173 under `/mallet-42k/` |
| Scripts | `dev`, `build`, `preview`, `typecheck`, `test`, `test:watch`, `e2e`, `sim` (`tools/sim.mjs`, placeholder prints `sim: not implemented`) |
| CI/CD | `.github/workflows/deploy.yml` — on push to `main`: install, typecheck, test, build, deploy `dist/` to GitHub Pages |
| Docs | `README.md`, `PLAN.md` (source of truth for scope/decisions), this file |
| Engine contracts (M0, stubs only) | `src/engine/types.ts` (GameState, Player, Unit, Model, Runtime{Datasheet,Weapon,Ability}, Board/TerrainPiece/Objective, Phase/PhaseStep, DiceRoll, PendingDecision union of 16 kinds incl. `declareMove`, Rejection codes, EngineInvariantError, GameSetup (`PlayerSetup.enhancementChoice`), PlayerView, SaveFile, ActionLogEntry); `actions.ts` (Action union: 13 decision answers + pass/useStratagem/commandReroll/resign; `WeaponTarget.attacks` for melee splits); `events.ts` (GameEvent union, ~62 types incl. `RoundEnded`, `MoveDeclared`; `ModelDestroyed`/`UnitDestroyed` carry `byModelId`); `hooks.ts` (HookName ×28, typed contexts/results, `CodeHook`/`HookRegistry`, `TRIGGER_HOOK`, `EFFECT_HOOKS`, `hooksForDescriptor` stub); `rng.ts` (`Rng`, `SeededRng`, `ScriptedRng` (serialisable), `createRng`/`restoreRng` — all throw `not implemented`); `decider.ts` (`Decider`, `Deciders`); `index.ts` (`ENGINE_VERSION`, `StepResult`, stubs `createGame/step(state, action, rng?)/legalActions/validate/replay/view`) |
| Data types | `src/data/types.ts` — TS mirror of every JSON schema (`*Data` interfaces, `AbilityDescriptor`, `Condition`, `Effect`, `DataBundle`); engine imports only this from outside itself |
| Data schemas | `src/data/schema/*.schema.json` (copied from `docs/spec/schemas`, JSON Schema 2020-12, `$id` `https://mallet42k.dev/schemas/<name>.schema.json`) + `index.ts` exporting `schemas` map for ajv. TimingWindowId has 28 windows (`round.start/end`, `battle.end`, `movement.moveStarted`, `charge.moveStarted`, `fight.targetsDeclared` added); `Scope.who: bearer`; `Duration: untilEndOfRound`; `Effect.when`, `Effect.move.kind: surge`; `ScoringRule.who: first/second` + rule values `holdEnemyHome/holdNamed/razedThisTurn/claimedSite/claimedSiteConsecutive`; `mission.rules[]` (`MissionRule`); `enhancement.choice` |
| Spec status | Adversarial review round 1 applied (all critical/major + minor items): windows outside turns, kill attribution by model, checklist prefixes unified (`CORE`…`SIM`, `alias` rows, `CORE-001..017` + coverage-gap IDs added), Fire Overwatch retimed to `moveStarted` windows with `declareMove` split, `fight.targetsDeclared`, re-roll offer policy R-6.24, reaction-window policy R-11.5, mission data mapping 11 §2.6, RNG authority (`state.rng`), `Objective.controllerAtTurnStart`/`lootedBy`, `GameResult.reason: tabled` defined |

## Data (M2 — verified, commit 9b278e8)

| Area | State |
|---|---|
| Files | `src/data/{core,missions,terrain,factions/space-marines,factions/orks}` — 28 JSON files; loader `src/data/index.ts` (`loadBundle()`); `tests/data` green; `npm run validate:data` clean (ajv, `tools/validate-data.ts`) |
| Verification | W2-finish 2026-09-13: Orks ok, Space Marines ok, core/missions/terrain ok after fixes. Values checked against `docs/spec/11-combat-patrol.md` and Wahapedia. Terrain `cp-01.json` recomputed so every piece is >1" from every objective in all six missions (min clearance 1.414"). |
| Schema additions | `TargetSpec.state: notYetFought`; `TargetSpec.filter.within.of: controlledObjective` (in `src/data/schema/common.schema.json`, `docs/spec/schemas/common.schema.json`, `src/data/types.ts`, `20-data-schema.md` §6) |
| Code hooks the engine must implement (`src/engine/code-hooks.ts`, grep `"code"` in `src/data`) | `breakTheirSpirit claimSites counterOffensive deadArdFeelNoPain dutyAndHonour epicChallenge fireOverwatch getStuckInDistance grantBenefitOfCover grenadeMortalWounds heroicInterventionCharge irradiatedPowerCells oathOfMomentPick pistonDrivenBrutality properLootin rapidIngressArrival razeAndRuin retrieveIntelligence sabotageComms shockTactics stompEmPick stompEmScore supplyLines sweepingRaidEndgameBonus tankShockMortalWounds tellyportaGrant veteranInstincts waaaghCall wrathOfTheEmperor` (29) |
| Hook-enforcement notes (schema cannot express) | `epicChallenge`: enemy unit (`targets[0]`) must have a leader attached. `tankShockMortalWounds`: VEHICLE model (`targets[2]`) must belong to the charging unit (`targets[0]`). `counterOffensive`: also require Engagement Range (target only encodes `notYetFought`). `veteranInstincts`: re-rolls apply to wound rolls only (1s; any vs MONSTER/VEHICLE). `dutyAndHonour`: objective must be controlled by the active player. |
| Known doc drift | `docs/spec/11-combat-patrol.md` §3 terrain table shows old footprints (data is authoritative); §2.6 names `stompEmPick` as a rule id but data encodes it as `custom` + `code`. |

## Not yet built

- `src/engine` logic — only contracts/stubs exist; W1 modules implement against them (see `docs/spec/00-architecture.md`)
- AI (`src/ai`), figure assets (`src/assets`) — placeholders only (Combat Patrol data is done, see Data)

## Notes for the next agent

- `npm run typecheck` / `npm test` / `npm run build` all pass as of M0 (see verification log at commit time).
- `npm run e2e` requires `npx playwright install chromium` once per machine/CI runner.
- Engine contracts are frozen: change `src/engine/types.ts`/`actions.ts`/`events.ts`/`hooks.ts` only with a matching edit to `docs/spec/00-architecture.md`.
- Movement is two decisions per unit (`declareMove` → `moveUnit`); Fire Overwatch windows are `movement.moveStarted`/`unitMoved`/`reinforcements` and `charge.moveStarted`/`moveEnded` (10-rules R-5.1, R-8.3, R-11.5). Optional re-rolls follow R-6.24 (`rerollOffer`).
- Data shape types live in `src/data/types.ts`; runtime (resolved) shapes in `src/engine/types.ts` (`Runtime*`). Pre-game choices (patrol, enhancement + `enhancementChoice` unit ref, secondary, leader attachments, reserves) are part of `GameSetup`, not decisions; side/first-turn roll-offs surface as `chooseOption` decisions.
