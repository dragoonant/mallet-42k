# Mallet 42k

A browser-based 3D tabletop wargame with Super Deformed (chibi-proportioned) miniatures,
built for one small-scale scenario format first and scaling up from there. You play against
an AI opponent, moving and fighting units on a grid-measured battlefield with the same kind of
phase structure, dice-based resolution, and army-building rules that fans of tabletop
minis wargaming will recognize.

**This is an unofficial, non-commercial fan project.** It is not affiliated with, endorsed by,
or sponsored by Games Workshop or any rights holder. It reimplements gameplay *mechanics* only —
all rules text, flavor text, names, and datasheet wording in this project are written from
scratch in our own words, and all art, 3D models, and code are original. No copyrighted text,
artwork, or assets from any commercial game are included.

## Stack

- [Vite](https://vitejs.dev/) + React + TypeScript (strict)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) / [Three.js](https://threejs.org/) for 3D rendering
- [drei](https://github.com/pmndrs/drei) for R3F helpers, [zustand](https://zustand-demo.pmnd.rs/) for client state
- [Vitest](https://vitest.dev/) for unit tests, [Playwright](https://playwright.dev/) for end-to-end tests
- Deployed to GitHub Pages via GitHub Actions

See `PLAN.md` for the full design and milestone plan, and `STATUS.md` for what currently exists.

## Requirements

- Node.js 22+ (developed against Node 25 / npm 11)

## Running locally

```bash
npm install       # install dependencies
npm run dev       # start the dev server (http://localhost:5173)
```

## Other scripts

```bash
npm run build       # production build to dist/ (base path /mallet-42k/)
npm run preview      # serve the production build locally
npm run typecheck    # tsc --noEmit
npm test             # run unit tests once (vitest run)
npm run test:watch   # run unit tests in watch mode
npm run e2e           # run Playwright end-to-end tests (builds + previews first)
npm run sim           # run the headless engine simulator (placeholder until src/engine lands)
```

## Layout

```
src/client   React + React Three Fiber renderer and UI
src/ai       AI opponent
src/data     faction/datasheet/mission data
src/assets   figure and scene assets
src/engine   pure rules engine (owned by other in-flight work; may not exist yet)
tools        asset/dev pipeline scripts
tests/engine unit tests (Vitest)
tests/e2e    end-to-end tests (Playwright)
docs         design specs (owned by other in-flight work)
```
