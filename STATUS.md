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
| Engine contracts (M0, stubs only) | `src/engine/types.ts` (GameState, Player, Unit, Model, Runtime{Datasheet,Weapon,Ability}, Board/TerrainPiece/Objective, Phase/PhaseStep, DiceRoll, PendingDecision union of 15 kinds, Rejection codes, EngineInvariantError, GameSetup, PlayerView, SaveFile, ActionLogEntry); `actions.ts` (Action union: 12 decision answers + pass/useStratagem/commandReroll/resign); `events.ts` (GameEvent union, ~60 types, base `{seq, round, turn, phase, player}`); `hooks.ts` (HookName ×28, typed contexts/results, `CodeHook`/`HookRegistry`, `TRIGGER_HOOK`, `EFFECT_HOOKS`, `hooksForDescriptor` stub); `rng.ts` (`Rng`, `SeededRng`, `ScriptedRng`, `createRng` — all throw `not implemented`); `decider.ts` (`Decider`, `Deciders`); `index.ts` (`ENGINE_VERSION`, `StepResult`, stubs `createGame/step/legalActions/validate/replay/view`) |
| Data types | `src/data/types.ts` — TS mirror of every JSON schema (`*Data` interfaces, `AbilityDescriptor`, `Condition`, `Effect`, `DataBundle`); engine imports only this from outside itself |
| Data schemas | `src/data/schema/*.schema.json` (copied from `docs/spec/schemas`, JSON Schema 2020-12, `$id` `https://mallet42k.dev/schemas/<name>.schema.json`) + `index.ts` exporting `schemas` map for ajv |

## Not yet built

- `src/engine` logic — only contracts/stubs exist; W1 modules implement against them (see `docs/spec/00-architecture.md`)
- `tools/validate-data` (ajv wiring for `src/data/schema`) — W2
- Combat Patrol data (`src/data`), AI (`src/ai`), figure assets (`src/assets`) — all placeholders only

## Notes for the next agent

- `npm run typecheck` / `npm test` / `npm run build` all pass as of M0 (see verification log at commit time).
- `npm run e2e` requires `npx playwright install chromium` once per machine/CI runner.
- Engine contracts are frozen: change `src/engine/types.ts`/`actions.ts`/`events.ts`/`hooks.ts` only with a matching edit to `docs/spec/00-architecture.md`.
- Data shape types live in `src/data/types.ts`; runtime (resolved) shapes in `src/engine/types.ts` (`Runtime*`). Pre-game choices (patrol, enhancement, secondary, leader attachments, reserves) are part of `GameSetup`, not decisions; side/first-turn roll-offs surface as `chooseOption` decisions.
