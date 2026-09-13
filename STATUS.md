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
| Tests | `tests/engine/smoke.test.ts` (Vitest, trivial pass); `tests/e2e/home.spec.ts` (Playwright, loads page, asserts title, screenshots to `e2e-out/home.png`); `playwright.config.ts` builds + previews on port 4173 under `/mallet-42k/` |
| Scripts | `dev`, `build`, `preview`, `typecheck`, `test`, `test:watch`, `e2e`, `sim` (`tools/sim.mjs`, placeholder prints `sim: not implemented`) |
| CI/CD | `.github/workflows/deploy.yml` — on push to `main`: install, typecheck, test, build, deploy `dist/` to GitHub Pages |
| Docs | `README.md`, `PLAN.md` (source of truth for scope/decisions), this file |

## Not yet built

- `src/engine` (rules engine) — owned by other in-flight work, not this scaffold
- `docs/` specs — owned by other in-flight work, not this scaffold
- Combat Patrol data (`src/data`), AI (`src/ai`), figure assets (`src/assets`) — all placeholders only

## Notes for the next agent

- `npm run typecheck` / `npm test` / `npm run build` all pass as of M0 (see verification log at commit time).
- `npm run e2e` requires `npx playwright install chromium` once per machine/CI runner.
- Do not add engine logic here; this scaffold only wires up tooling and a placeholder client scene.
